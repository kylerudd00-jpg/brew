const axios = require('axios');
const db = require('../db');
const { getNearbyBreweriesOBD } = require('./openbrewery');

const PLACES_URL  = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const BREWERY_CACHE_MAX_AGE_SEC = parseInt(process.env.BREWERY_CACHE_MAX_AGE_SEC || '21600', 10);
const inflightNearbyLookups = new Map();

/**
 * Haversine distance between two lat/lng points, in miles.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} miles
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCachedBrewery(row, coords) {
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
    lat: row.lat,
    lng: row.lng,
    distanceMiles: parseFloat(
      haversineDistance(coords.lat, coords.lng, row.lat, row.lng).toFixed(2)
    ),
    website: row.website || null,
    placeId: row.place_id || row.id,
    googleRating: row.google_rating || null,
  };
}

function getCachedNearbyBreweries(coords, radiusMiles) {
  return db.getCachedBreweriesNear(
    coords.lat,
    coords.lng,
    radiusMiles,
    BREWERY_CACHE_MAX_AGE_SEC
  )
    .map(row => normalizeCachedBrewery(row, coords))
    .filter(brewery => brewery.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 20);
}

/**
 * Fetch nearby breweries from Google Places.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<Brewery[]>}
 *
 * @typedef {Object} Brewery
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {number} lat
 * @property {number} lng
 * @property {number} distanceMiles
 * @property {string|null} website
 * @property {string} placeId
 */
async function getNearbyBreweries(coords, radiusMiles = 15) {
  const cached = getCachedNearbyBreweries(coords, radiusMiles);
  if (cached.length) {
    return cached;
  }

  const lookupKey = [
    process.env.GOOGLE_API_KEY ? 'google' : 'obd',
    coords.lat.toFixed(4),
    coords.lng.toFixed(4),
    radiusMiles,
  ].join(':');

  if (inflightNearbyLookups.has(lookupKey)) {
    return inflightNearbyLookups.get(lookupKey);
  }

  const lookupPromise = (async () => {
    // No Google key — use the free Open Brewery DB instead of mock data
    if (!process.env.GOOGLE_API_KEY) {
      console.log('[places] No GOOGLE_API_KEY — using Open Brewery DB');
      return getNearbyBreweriesOBD(coords, radiusMiles);
    }

    const radiusMeters = Math.round(radiusMiles * 1609.34);

    const params = {
      location: `${coords.lat},${coords.lng}`,
      radius: radiusMeters,
      type: 'bar',
      keyword: 'brewery',
      key: process.env.GOOGLE_API_KEY,
    };

    let results = [];
    let nextPageToken = null;

    // Google Places returns up to 60 results across 3 pages
    do {
      if (nextPageToken) {
        params.pagetoken = nextPageToken;
        // Required delay before using a page token
        await new Promise((r) => setTimeout(r, 2000));
      }

      const { data } = await axios.get(PLACES_URL, { params, timeout: 8000 });

      if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
        throw new Error(`Google Places error: ${data.status}`);
      }

      results = results.concat(data.results || []);
      nextPageToken = data.next_page_token || null;

      // Cap at 20 breweries to stay cost-efficient
      if (results.length >= 20) break;
    } while (nextPageToken);

    // Fetch website for each place (Details API)
    const breweries = await Promise.all(
      results.slice(0, 20).map(async (place) => {
        const website = await getPlaceWebsite(place.place_id);
        const bLat = place.geometry.location.lat;
        const bLng = place.geometry.location.lng;
        return {
          id: place.place_id,
          name: place.name,
          address: place.vicinity || '',
          lat: bLat,
          lng: bLng,
          distanceMiles: parseFloat(
            haversineDistance(coords.lat, coords.lng, bLat, bLng).toFixed(2)
          ),
          website,
          placeId: place.place_id,
        };
      })
    );

    return breweries.sort((a, b) => a.distanceMiles - b.distanceMiles);
  })().finally(() => {
    inflightNearbyLookups.delete(lookupKey);
  });

  inflightNearbyLookups.set(lookupKey, lookupPromise);
  return lookupPromise;
}

/**
 * Fetch a single place's website from the Details endpoint.
 * Returns null if unavailable — never throws.
 *
 * @param {string} placeId
 * @returns {Promise<string|null>}
 */
async function getPlaceWebsite(placeId) {
  try {
    const { data } = await axios.get(DETAILS_URL, {
      params: {
        place_id: placeId,
        fields: 'website',
        key: process.env.GOOGLE_API_KEY,
      },
      timeout: 5000,
    });
    return data.result?.website || null;
  } catch {
    return null;
  }
}

module.exports = { getNearbyBreweries };
