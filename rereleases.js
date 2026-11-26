// rereleases.js - finds older films that are coming back to US theaters, using The Movie Database (TMDB) API.
//
// How it works:
//   1. "discover" asks TMDB for films with a US theatrical release date in the next 90 days. Films with lots of votes
//      are kept, because a film people have already rated heavily is an older film, not a brand-new one.
//   2. For each of those films, the full list of release dates is read. The earliest theatrical date anywhere in the
//      world is the film's "original" date. If that is more than two years ago, the upcoming US date is a re-release.
// This is a guess from public data, not a showtime feed: it says THAT a re-release is coming, not WHERE it plays.
//
// Needs a free TMDB "API Read Access Token" (TMDB_READ_TOKEN in .env). Without one nothing is fetched.
// Data and posters: TMDB. "This product uses the TMDB API but is not endorsed or certified by TMDB."

const API = "https://api.themoviedb.org/3";
const WINDOW_DAYS = 90;      // how far ahead to look
const MIN_AGE_DAYS = 730;    // original theatrical release must be at least this old (about two years)
const MIN_VOTES = 300;       // only films with at least this many TMDB votes
const MAX_PAGES = 3;         // discover pages to read (20 films per page)
const PAUSE_MS = 150;        // pause between requests so TMDB is never hammered
const TIMEOUT_MS = 8000;

// '2026-11-26' + 90 days -> '2027-02-24' (works on plain dates so time zones never shift the day)
function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

// One GET request. Returns the parsed JSON, or null if anything goes wrong (the caller then knows the run was incomplete).
async function tmdbGet(path, params, token) {
  const url = API + path + (params ? "?" + new URLSearchParams(params).toString() : "");
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", Authorization: "Bearer " + token }   // token goes in a header, never in the URL
    });
    if (!res.ok) { console.log("TMDB request failed:", res.status, path); return null; }
    return await res.json();
  } catch (e) {
    console.log("TMDB request failed:", e && e.name ? e.name : e, path);
    return null;
  }
}

// Looks at one film's /release_dates answer. Returns { rerelease_date, original_date, note } if it is an older film
// with a US theatrical date inside [windowStart, windowEnd], otherwise null.
//   - US date: the earliest US "theatrical (limited)" (2) or "theatrical" (3) date in the window
//   - original date: the earliest type 2 or 3 date in ANY country
function evaluateReleaseDates(data, windowStart, windowEnd, mustBeOlderThan) {
  const countries = data && Array.isArray(data.results) ? data.results : [];
  let original = null;
  let upcoming = null;   // { date, note }

  countries.forEach(function (c) {
    (Array.isArray(c.release_dates) ? c.release_dates : []).forEach(function (r) {
      if (r.type !== 2 && r.type !== 3) return;
      const date = String(r.release_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (original === null || date < original) original = date;
      if (c.iso_3166_1 === "US" && date >= windowStart && date <= windowEnd && (upcoming === null || date < upcoming.date)) {
        upcoming = { date, note: String(r.note || "").trim() };
      }
    });
  });

  if (!upcoming || original === null || original > mustBeOlderThan) return null;
  return { rerelease_date: upcoming.date, original_date: original, note: upcoming.note ? upcoming.note.slice(0, 200) : null };
}

// Runs the whole search. today is 'YYYY-MM-DD' (defaults to today). Returns { ok, items }.
//   ok = false means at least one request failed, so the list may be incomplete (the caller should not delete old results).
//   items: [{ tmdb_id, title, original_date, rerelease_date, note, poster_path }]
async function findRereleases(token, today, pause) {
  const start = today || new Date().toISOString().slice(0, 10);
  const end = addDays(start, WINDOW_DAYS);
  const cutoff = addDays(start, -MIN_AGE_DAYS);
  const wait = pause === undefined ? PAUSE_MS : pause;
  const items = [];
  let ok = true;

  const candidates = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await tmdbGet("/discover/movie", {
      region: "US", language: "en-US", include_adult: "false", page: String(page),
      "release_date.gte": start, "release_date.lte": end, with_release_type: "2|3",
      "vote_count.gte": String(MIN_VOTES), sort_by: "popularity.desc"
    }, token);
    if (!data || !Array.isArray(data.results)) { ok = false; break; }
    candidates.push.apply(candidates, data.results);
    if (page >= (Number(data.total_pages) || 1)) break;
    await sleep(wait);
  }

  const seen = new Set();
  for (const film of candidates) {
    if (!film || !Number.isInteger(film.id) || seen.has(film.id) || !film.title) continue;
    seen.add(film.id);
    await sleep(wait);
    const dates = await tmdbGet("/movie/" + film.id + "/release_dates", null, token);
    if (!dates) { ok = false; continue; }
    const found = evaluateReleaseDates(dates, start, end, cutoff);
    if (found) {
      items.push({
        tmdb_id: film.id,
        title: String(film.title).slice(0, 200),
        original_date: found.original_date,
        rerelease_date: found.rerelease_date,
        note: found.note,
        poster_path: typeof film.poster_path === "string" && /^\/[\w.-]+$/.test(film.poster_path) ? film.poster_path : null
      });
    }
  }
  return { ok, items };
}

module.exports = { findRereleases, evaluateReleaseDates, addDays, WINDOW_DAYS };
