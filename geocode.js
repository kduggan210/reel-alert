// geocode.js - turns ZIP codes and street addresses into coordinates (latitude and longitude).
// Two free services, neither needs an API key:
//   - US Census geocoder: street address -> coordinates
//   - Zippopotam.us:      ZIP code (or city + state) -> coordinates
// Every function returns { lat, lng } or null. A failed or slow lookup never throws, so the site keeps working
// without coordinates; the caller just saves null and the lookup can be retried later.
// Results are stored in the database (theaters.latitude / longitude, users.latitude / longitude), so each place is looked up once.

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const ZIP_URL = "https://api.zippopotam.us/us/";
const TIMEOUT_MS = 6000;

// Fetches a URL and returns the parsed JSON, or null if anything goes wrong (network error, timeout, 404, bad JSON).
async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.log("Geocode request failed:", e && e.name ? e.name : e);
    return null;
  }
}

// Turns two values into { lat, lng } if they are sensible coordinates, otherwise null. Rounded to the 6 decimals the database keeps.
function point(lat, lng) {
  const la = Number(lat), lo = Number(lng);
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(lo * 1e6) / 1e6 };
}

// "30301" -> centre of that ZIP code
async function geocodeZip(zip) {
  if (!/^\d{5}$/.test(String(zip || ""))) return null;
  const data = await getJson(ZIP_URL + zip);
  const place = data && Array.isArray(data.places) ? data.places[0] : null;
  return place ? point(place.latitude, place.longitude) : null;
}

// "Atlanta" + "GA" -> a point in that city (Zippopotam lists the city's ZIP codes; the first is used)
async function geocodeCity(city, state) {
  if (!city || !/^[A-Za-z]{2}$/.test(String(state || ""))) return null;
  const data = await getJson(ZIP_URL + encodeURIComponent(state.toLowerCase()) + "/" + encodeURIComponent(String(city).trim().toLowerCase()));
  const place = data && Array.isArray(data.places) ? data.places[0] : null;
  return place ? point(place.latitude, place.longitude) : null;
}

// Street address -> exact spot. The Census geocoder wants the street plus a state or ZIP.
async function geocodeAddress(address, city, state, zip) {
  if (!address || !(state || zip)) return null;
  const line = [address, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const url = CENSUS_URL + "?address=" + encodeURIComponent(line) + "&benchmark=Public_AR_Current&format=json";
  const data = await getJson(url);
  const match = data && data.result && Array.isArray(data.result.addressMatches) ? data.result.addressMatches[0] : null;
  // The Census service calls longitude "x" and latitude "y"
  return match && match.coordinates ? point(match.coordinates.y, match.coordinates.x) : null;
}

// Best available location for a theater: exact address first, then its ZIP, then its city. null if none work.
async function geocodeTheater(t) {
  const p = t || {};
  return (await geocodeAddress(p.address, p.city, p.state, p.zip))
      || (await geocodeZip(p.zip))
      || (await geocodeCity(p.city, p.state))
      || null;
}

module.exports = { geocodeZip, geocodeCity, geocodeAddress, geocodeTheater };
