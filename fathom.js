// fathom.js - reads upcoming special showings from Fathom Events' public series pages.
//
// Why: TMDB lists films, not distributor events, so one-off showings like Fathom's anniversary screenings
// (for example "The Maltese Falcon 85th Anniversary") often never appear there. Fathom runs a large share of those events.
//
// How it works: each series page (Fathom's Big Screen Classics, Studio Ghibli Fest...) lists its releases as links to
// /releases/<name>/ along with the dates, written like "Dec 6" with no year. This file fetches those pages, picks out the links,
// works out each date's year, and keeps dates inside the next 90 days. It is a read of a public web page, not an official feed:
// if Fathom redesigns the page it can stop finding things (the server logs a warning when that happens).
// To check what it finds without starting the site, run:  node fathom.js
//
// Politeness: a short custom User-Agent, one request per second, and the job only runs once a day.

const { addDays, WINDOW_DAYS } = require("./rereleases");

const BASE = "https://www.fathomentertainment.com";
// The series worth reading. Add another { slug, label } here to follow more of Fathom's lineup.
const SERIES = [
  { slug: "fathoms-big-screen-classics", label: "Fathom's Big Screen Classics" },
  { slug: "studio-ghibli-fest", label: "Studio Ghibli Fest" },
  { slug: "baz-luhrmann", label: "Baz Luhrmann" }
];
const PAUSE_MS = 1000;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 3 * 1024 * 1024;
const USER_AGENT = "ReelAlert/1.0 (student project; reads public Fathom series pages once a day)";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

// '&#8217;' '&amp;' '&#x27;' -> the real characters
function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, function (m, n) { return Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : m; })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return parseInt(n, 16) < 0x110000 ? String.fromCodePoint(parseInt(n, 16)) : m; })
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// 'Dec 6' + today's date -> '2026-12-06'. Fathom omits the year, so pick the year that puts the date at or after
// about a month ago (an event that finished a few weeks ago stays this year; a January date seen in December is next year).
function inferDate(monthWord, day, today, explicitYear) {
  const m = MONTHS[String(monthWord).slice(0, 3).toLowerCase()];
  const d = Number(day);
  if (!m || !d) return null;
  const make = function (y) {
    const iso = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    return new Date(iso + "T00:00:00Z").toISOString().slice(0, 10) === iso ? iso : null;   // rejects Feb 31 and so on
  };
  if (explicitYear) return make(Number(explicitYear));
  const year = Number(today.slice(0, 4));
  const cutoff = addDays(today, -30);
  const thisYear = make(year);
  if (thisYear && thisYear >= cutoff) return thisYear;
  return make(year + 1);
}

// Pulls every date like "Dec 6", "Dec 6, 2026" or the run-together "Dec 6Dec 9" out of a piece of text.
// Returns { dates: [iso...], rest: the text with the dates taken out }.
function extractDates(text, today) {
  const dates = [];
  const rest = String(text).replace(/(?<![A-Za-z])(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?\s*(\d{1,2})(?!\d)(?:\s*,?\s*(\d{4})(?!\d))?/g,
    function (all, month, day, year) {
      const iso = inferDate(month, day, today, year);
      if (iso) dates.push(iso);
      return " ";
    });
  return { dates, rest };
}

// 'the-maltese-falcon-85th-anniversary' -> 'The Maltese Falcon 85th Anniversary' (only used if a link has no readable text)
function titleFromSlug(slug) {
  return slug.split("-").filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
}

// Words that appear on the links but are not part of a film's name
const BUTTON_WORDS = /^(get tickets?|buy tickets?|tickets?|more info|learn more|view( series| details)?|find (a )?theat(er|re)s?|details|now showing|coming soon|new|view release|see release|release details)$/i;

// Splits "The Maltese Falcon 85th Anniversary" into { movie: "The Maltese Falcon", label: "85th Anniversary" }.
function splitTitle(title) {
  let movie = String(title).trim();
  let label = null;
  const ann = /\s*[-–:]?\s*\(?\b(\d{1,3}(?:st|nd|rd|th)\s+Anniversary)\)?\s*$/i.exec(movie);
  if (ann) { label = ann[1].replace(/^(\d+)(st|nd|rd|th)/i, function (m, n, s) { return n + s.toLowerCase(); }); movie = movie.slice(0, ann.index).trim(); }
  movie = movie.replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/, "").trim();   // "Gone with the Wind (2026)" -> "Gone with the Wind"
  return { movie: movie || String(title).trim(), label };
}

// A lowercase letters-and-digits version of a title, used to tell when two sources mean the same film.
function titleKey(title) {
  return splitTitle(String(title).toLowerCase().replace(/[’']/g, "")).movie
    .replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]+/g, "");
}

// Reads one series page. Returns [{ slug, title, url, dates: [iso...] }] for every release link that has a readable title.
// Dates are ALL dates found for the release (past ones too); the caller keeps the ones inside the window.
function parseSeriesPage(html, today) {
  const found = new Map();
  const anchors = /<a\b[^>]*?\bhref\s*=\s*["']([^"']*\/releases\/([a-z0-9][a-z0-9-]*)\/?)(?:[?#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchors.exec(String(html))) !== null) {
    const slug = m[2].toLowerCase();
    // Tags become line breaks so neighbouring spans ("Dec 6" and "Dec 9") never run together
    const inner = decodeEntities(m[3].replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, "\n"));
    const lines = inner.split(/\n+/).map(function (s) { return s.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    const dates = [];
    let title = "";
    // A line only counts as the film's title if it shares a word with the page name (so labels like "View Release" are never taken)
    const slugWords = slug.split("-").filter(function (w) { return w.length > 2; });
    const looksRight = function (text) {
      const lower = text.toLowerCase();
      return slugWords.length === 0 || slugWords.some(function (w) { return lower.indexOf(w) !== -1; });
    };
    lines.forEach(function (line) {
      const parts = extractDates(line, today);
      parts.dates.forEach(function (d) { dates.push(d); });
      const rest = parts.rest.replace(/\s+/g, " ").trim();
      if (rest && !BUTTON_WORDS.test(rest) && looksRight(rest) && rest.length > title.length && parts.dates.length === 0) title = rest;
    });
    // A card whose whole text is on one line: "The Maltese Falcon 85th Anniversary Dec 6 Dec 9"
    if (!title && lines.length) {
      const one = extractDates(lines.join(" "), today).rest.replace(/\s+/g, " ").trim();
      if (one && !BUTTON_WORDS.test(one) && looksRight(one)) title = one;
    }
    const entry = found.get(slug) || { slug, title: "", url: BASE + "/releases/" + slug + "/", dates: [] };
    if (title.length > entry.title.length) entry.title = title;
    dates.forEach(function (d) { if (!entry.dates.includes(d)) entry.dates.push(d); });
    found.set(slug, entry);
  }
  return Array.from(found.values()).map(function (e) {
    return { slug: e.slug, title: (e.title || titleFromSlug(e.slug)).slice(0, 200), url: e.url, dates: e.dates.sort() };
  });
}

// The poster image named in a release page's <meta property="og:image">, or null. Only https links are accepted.
function parsePoster(html) {
  const tag = /<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/i.exec(String(html));
  if (!tag) return null;
  const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag[0]);
  const url = content ? decodeEntities(content[1]).trim() : "";
  return /^https:\/\/[^\s"'<>]{1,280}$/.test(url) ? url : null;
}

// One GET returning the page text, or null when anything goes wrong.
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" }
    });
    if (!res.ok) { console.log("Fathom request failed:", res.status, url); return null; }
    const text = await res.text();
    return text.length > MAX_BYTES ? null : text;
  } catch (e) {
    console.log("Fathom request failed:", e && e.name ? e.name : e, url);
    return null;
  }
}

// Runs the whole read. today is 'YYYY-MM-DD' (defaults to today). Returns { ok, warnings, items }.
//   ok = false means a page could not be read, so the list may be incomplete.
//   items: [{ slug, title, movie, label, series, url, poster_url, dates: [iso...], next_date }]  (only dates inside the window)
async function findFathomEvents(today, pause) {
  const start = today || new Date().toISOString().slice(0, 10);
  const end = addDays(start, WINDOW_DAYS);
  const wait = pause === undefined ? PAUSE_MS : pause;
  const items = [];
  const warnings = [];
  const seen = new Set();
  let ok = true;

  for (const series of SERIES) {
    const html = await fetchPage(BASE + "/series/" + series.slug + "/");
    if (html === null) { ok = false; await sleep(wait); continue; }
    const releases = parseSeriesPage(html, start);
    if (releases.length === 0) warnings.push("no release links found on the " + series.label + " page (layout may have changed)");
    for (const r of releases) {
      const dates = r.dates.filter(function (d) { return d >= start && d <= end; });
      if (dates.length === 0 || seen.has(r.slug)) continue;
      seen.add(r.slug);
      await sleep(wait);
      const detail = await fetchPage(r.url);   // the release page's own image, for the poster (optional)
      const parts = splitTitle(r.title);
      items.push({
        slug: r.slug, title: r.title, movie: parts.movie.slice(0, 150), label: parts.label,
        series: series.label, url: r.url, poster_url: detail ? parsePoster(detail) : null,
        dates, next_date: dates[0]
      });
    }
    await sleep(wait);
  }
  return { ok, warnings, items };
}

// ---------- Putting the two sources together for the page ----------
// tmdbRows: rows from rerelease_candidates.  fathomRows: rows from fathom_releases (dates is a comma list).
// Returns one list of plain objects for the page, sorted by date. A film found by both sources appears once:
// it keeps the TMDB poster and original year, and gains Fathom's extra dates and link.
function mergeRereleases(tmdbRows, fathomRows, today) {
  const from = today || "0000-00-00";   // dates before this are over and are left out
  const list = [];
  const byKey = new Map();

  (tmdbRows || []).forEach(function (r) {
    const row = {
      title: String(r.title), year: String(r.original_date).slice(0, 4), date: String(r.rerelease_date).slice(0, 10),
      moreDates: [], note: r.note || null, poster: r.poster_path ? "https://image.tmdb.org/t/p/w185" + r.poster_path : null,
      addMovie: String(r.title), addEvent: "Re-release", infoUrl: null, source: "TMDB"
    };
    list.push(row);
    byKey.set(titleKey(row.title), row);
  });

  (fathomRows || []).forEach(function (f) {
    const dates = String(f.dates || "").split(",").map(function (s) { return s.trim().slice(0, 10); }).filter(function (d) { return d >= from; }).sort();
    if (dates.length === 0) return;
    const key = titleKey(f.title);
    const mate = byKey.get(key);
    if (mate) {   // same film from both sources: merge
      const all = Array.from(new Set([mate.date].concat(dates))).sort();
      mate.date = all[0];
      mate.moreDates = all.slice(1);
      mate.infoUrl = f.url;
      mate.source = "TMDB + Fathom";
      if (!mate.note && f.label) mate.note = f.label;
      if (f.label) mate.addEvent = "Anniversary";
      return;
    }
    const row = {
      title: String(f.title), year: null, date: dates[0], moreDates: dates.slice(1), note: f.note || f.label || null,
      poster: f.poster_url || null, addMovie: String(f.movie || f.title), addEvent: f.label ? "Anniversary" : "Re-release",
      infoUrl: f.url, source: "Fathom"
    };
    list.push(row);
    byKey.set(key, row);
  });

  return list.filter(function (r) { return r.date; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1; });
}

module.exports = { findFathomEvents, parseSeriesPage, parsePoster, extractDates, inferDate, splitTitle, titleKey, mergeRereleases, SERIES };

// `node fathom.js` prints what it finds, so the parser can be checked against the live site
if (require.main === module) {
  findFathomEvents(undefined, PAUSE_MS).then(function (result) {
    console.log("Read ok:", result.ok);
    result.warnings.forEach(function (w) { console.log("WARNING:", w); });
    result.items.forEach(function (i) { console.log("-", i.title, "|", i.dates.join(", "), "|", i.url, "|", i.poster_url ? "poster found" : "no poster"); });
    console.log(result.items.length + " release(s) with dates in the next " + WINDOW_DAYS + " days.");
  });
}
