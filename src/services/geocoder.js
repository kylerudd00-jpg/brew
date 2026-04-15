/**
 * ZIP code → lat/lng geocoder.
 * Hits Google Geocoding API at most ONCE per ZIP ever — coords are persisted
 * in SQLite and also held in the in-memory cache.
 */

const axios = require('axios');
const cache = require('../cache');
const db    = require('../db');

const GOOGLE_URL   = 'https://maps.googleapis.com/maps/api/geocode/json';
const FREE_GEO_URL = 'https://api.zippopotam.us/us';

/**
 * @param {string} zip
 * @returns {Promise<{ lat: number, lng: number }>}
 */
async function geocodeZip(zip) {
  // L1: in-memory cache (fastest)
  const memKey = `geo:${zip}`;
  const memHit = cache.get(memKey);
  if (memHit) return memHit;

  // L2: SQLite (survives restarts)
  const dbHit = db.getZipCoords(zip);
  if (dbHit) {
    cache.set(memKey, dbHit, 86400 * 30);
    return dbHit;
  }

  // L3a: Free geocoder (zippopotam.us) when no Google key
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
 * Free ZIP geocoder via zippopotam.us — used when GOOGLE_API_KEY is absent.
 * Covers all US ZIP codes with no rate limits for dev usage.
 */
async function geocodeZipFree(zip, memKey) {
  try {
    const { data } = await axios.get(`${FREE_GEO_URL}/${zip}`, { timeout: 5000 });
    const place = data.places?.[0];
    if (!place) throw new Error('ZIP not found');

    const coords = {
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    };

    db.saveZipCoords(zip, coords.lat, coords.lng);
    cache.set(memKey, coords, 86400 * 30);
    return coords;
  } catch {
    throw Object.assign(
      new Error(`Could not geocode ZIP: ${zip}. Check the ZIP code and try again.`),
      { status: 400 }
    );
  }
}

module.exports = { geocodeZip };
