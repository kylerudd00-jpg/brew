/**
 * Geocoder — converts ZIP codes OR city names → lat/lng.
 * Hits Google Geocoding API at most ONCE per query ever — coords are persisted
 * in SQLite and held in the in-memory cache.
 *
 * Free fallbacks:
 *   - ZIP codes: zippopotam.us (US-only, no key required)
 *   - City names: nominatim.openstreetmap.org (global, no key required)
 */

const axios = require('axios');
const cache = require('../cache');
const db    = require('../db');

const GOOGLE_URL    = 'https://maps.googleapis.com/maps/api/geocode/json';
const FREE_ZIP_URL  = 'https://api.zippopotam.us/us';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Geocode a 5-digit US ZIP code → { lat, lng }.
 *
 * @param {string} zip
 * @returns {Promise<{ lat: number, lng: number }>}
 */
async function geocodeZip(zip) {
  const memKey = `geo:zip:${zip}`;
  const memHit = cache.get(memKey);
  if (memHit) return memHit;

  const dbHit = db.getZipCoords(zip);
  if (dbHit) {
    cache.set(memKey, dbHit, 86400 * 30);
    return dbHit;
  }

  if (!process.env.GOOGLE_API_KEY) {
    return geocodeZipFree(zip, memKey);
  }

  const { data } = await axios.get(GOOGLE_URL, {
    params: {
      address:    zip,
      components: 'country:US',
      key:        process.env.GOOGLE_API_KEY,
    },
    timeout: 5000,
  });

  if (data.status !== 'OK' || !data.results.length) {
    throw Object.assign(
      new Error(`Could not geocode ZIP: ${zip}`),
      { status: 400 }
    );
  }

  const { lat, lng } = data.results[0].geometry.location;
  const coords = { lat, lng };

  db.saveZipCoords(zip, lat, lng);
  cache.set(memKey, coords, 86400 * 30);
  return coords;
}

/**
 * Geocode a city/address string → { lat, lng, displayName }.
 * Accepts inputs like: "Austin, TX", "Denver", "Portland Oregon", "94102"
 *
 * @param {string} query  — free-form city/address/ZIP string
 * @returns {Promise<{ lat: number, lng: number, displayName: string }>}
 */
async function geocodeQuery(query) {
  const q = query.trim();
  if (!q) throw Object.assign(new Error('Search query is empty'), { status: 400 });

  // If it looks like a pure ZIP, route to the faster zip geocoder
  if (/^\d{5}$/.test(q)) {
    const coords = await geocodeZip(q);
    return { ...coords, displayName: q };
  }

  const memKey = `geo:q:${q.toLowerCase()}`;
  const memHit = cache.get(memKey);
  if (memHit) return memHit;

  if (!process.env.GOOGLE_API_KEY) {
    return geocodeCityFree(q, memKey);
  }

  // Google Geocoding — best for ambiguous city queries
  const { data } = await axios.get(GOOGLE_URL, {
    params: {
      address:    q,
      components: 'country:US',
      key:        process.env.GOOGLE_API_KEY,
    },
    timeout: 5000,
  });

  if (data.status !== 'OK' || !data.results.length) {
    throw Object.assign(
      new Error(`Location not found: "${q}". Try adding a state, e.g. "Austin, TX".`),
      { status: 400 }
    );
  }

  const result = data.results[0];
  const coords = {
    lat:         result.geometry.location.lat,
    lng:         result.geometry.location.lng,
    displayName: result.formatted_address || q,
  };

  cache.set(memKey, coords, 86400 * 7);
  return coords;
}

/**
 * Free ZIP geocoder via zippopotam.us.
 */
async function geocodeZipFree(zip, memKey) {
  try {
    const { data } = await axios.get(`${FREE_ZIP_URL}/${zip}`, { timeout: 5000 });
    const place = data.places?.[0];
    if (!place) {
      throw Object.assign(new Error('ZIP not found'), { status: 400 });
    }

    const coords = {
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
      displayName: `${place['place name']}, ${place['state abbreviation']} ${zip}`,
    };

    db.saveZipCoords(zip, coords.lat, coords.lng);
    cache.set(memKey, coords, 86400 * 30);
    return coords;
  } catch (err) {
    if (err.response?.status === 404 || err.status === 400) {
      throw Object.assign(
        new Error(`ZIP code "${zip}" not found. Check the ZIP and try again.`),
        { status: 400, cause: err }
      );
    }
    throw Object.assign(
      new Error(`ZIP geocoding service is unavailable right now.`),
      { status: 503, code: err.code || err.cause?.code, cause: err }
    );
  }
}

/**
 * Free city geocoder via OpenStreetMap Nominatim.
 * Rate-limited to 1 req/s by OSM policy — fine for server-side use (cached).
 */
async function geocodeCityFree(query, memKey) {
  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q:              query,
        format:         'json',
        countrycodes:   'us',
        addressdetails: 0,
        limit:          1,
      },
      headers: {
        'User-Agent': 'BeerIntel/1.0 (craft beer discovery app)',
        'Accept-Language': 'en-US,en',
      },
      timeout: 6000,
    });

    if (!data.length) {
      throw Object.assign(
        new Error(`Location not found: "${query}". Try "City, State" format, e.g. "Denver, CO".`),
        { status: 400 }
      );
    }

    const result = data[0];
    const coords = {
      lat:         parseFloat(result.lat),
      lng:         parseFloat(result.lon),
      displayName: result.display_name || query,
    };

    if (isNaN(coords.lat) || isNaN(coords.lng)) {
      throw Object.assign(new Error(`Could not parse coordinates for "${query}"`), { status: 400 });
    }

    cache.set(memKey, coords, 86400 * 7);
    return coords;
  } catch (err) {
    if (err.status === 400) throw err;
    throw Object.assign(
      new Error(`Location search is unavailable right now. Try using a ZIP code instead.`),
      { status: 503, code: err.code, cause: err }
    );
  }
}

module.exports = { geocodeZip, geocodeQuery };
