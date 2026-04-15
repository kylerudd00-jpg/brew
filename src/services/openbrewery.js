/**
 * Open Brewery DB client — free, no API key required.
 * https://www.openbrewerydb.org/documentation/01-listbreweries
 *
 * Used as a real-data fallback when GOOGLE_API_KEY is not set.
 * Returns the same shape as getNearbyBreweries() in places.js so the
 * rest of the pipeline doesn't need to know which source was used.
 */

const axios = require('axios');

const BASE_URL    = 'https://api.openbrewerydb.org/v1';
const TIMEOUT     = 8000;
const USER_AGENT  = 'BeerIntel/1.0 (local dev)';

/**
 * Haversine distance between two lat/lng points, in miles.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch breweries near lat/lng from the Open Brewery DB.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<import('./places').Brewery[]>}
 */
async function getNearbyBreweriesOBD(coords, radiusMiles = 15) {
  const { data } = await axios.get(`${BASE_URL}/breweries`, {
    params: {
      by_dist:  `${coords.lat},${coords.lng}`,
      per_page: 50,
    },
    headers: { 'User-Agent': USER_AGENT },
    timeout: TIMEOUT,
  });

  const breweries = [];

  for (const b of data) {
    const lat = parseFloat(b.latitude);
    const lng = parseFloat(b.longitude);

    // Skip entries without coordinates
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;

    const dist = haversineDistance(coords.lat, coords.lng, lat, lng);
    if (dist > radiusMiles) continue;

    // Normalise to the same shape as the Places API output
    breweries.push({
      id:            `obd-${b.id}`,
      name:          b.name,
      address:       [b.address_1, b.city, b.state_province].filter(Boolean).join(', '),
      lat,
      lng,
      distanceMiles: parseFloat(dist.toFixed(2)),
      website:       b.website_url || null,
      placeId:       `obd-${b.id}`,
      phone:         b.phone   || null,
      breweryType:   b.brewery_type || null,
    });
  }

  return breweries
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 20);
}

/**
 * Search breweries by name via OBD (used for autocomplete / direct lookup).
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function searchBreweriesByName(query, limit = 10) {
  const { data } = await axios.get(`${BASE_URL}/breweries/search`, {
    params: { query, per_page: limit },
    headers: { 'User-Agent': USER_AGENT },
    timeout: TIMEOUT,
  });
  return data;
}

module.exports = { getNearbyBreweriesOBD, searchBreweriesByName };
