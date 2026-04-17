/**
 * Foursquare Places API v3 — venue popularity, check-ins, photos & open status.
 *
 * Free tier: 950 regular API calls/day.
 * https://developer.foursquare.com/docs/places-api/
 *
 * Per FSQ ToS: must display "Powered by Foursquare" attribution.
 * Do not cache longer than 24 hours.
 *
 * Env var: FOURSQUARE_KEY (your FSQ API key)
 * If not set, returns empty Map silently.
 */

const axios = require('axios');
const cache = require('../cache');

const SEARCH_URL = 'https://api.foursquare.com/v3/places/search';

/**
 * Fetch breweries near coords from Foursquare.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<Map<string, object>>} normalised name → FSQ data
 */
async function getFoursquareBreweries(coords, radiusMiles) {
  if (!process.env.FOURSQUARE_KEY) return new Map();

  const radiusM  = Math.min(Math.round(radiusMiles * 1609.34), 100000);
  const cacheKey = `fsq:${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}:${radiusMiles}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(SEARCH_URL, {
      headers: {
        Authorization: process.env.FOURSQUARE_KEY,
        Accept:        'application/json',
      },
      params: {
        query:  'brewery',
        ll:     `${coords.lat},${coords.lng}`,
        radius: radiusM,
        limit:  50,
        // Request all available free fields
        fields: 'fsq_id,name,geocodes,location,distance,closed_bucket,popularity,stats,photos',
      },
      timeout: 7000,
    });

    const result = new Map();
    for (const place of (data.results || [])) {
      const normName = place.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const photo    = place.photos?.[0];

      result.set(normName, {
        fsqId:        place.fsq_id,
        fsqCheckins:  place.stats?.total_checkins  ?? null,
        fsqTips:      place.stats?.total_tips       ?? null,
        fsqPopularity: place.popularity             ?? null, // 0-1 float
        // closed_bucket values: LikelyOpen | LikelyClosed | VeryLikelyClosed | Unsure
        fsqIsOpen:    place.closed_bucket === 'LikelyOpen',
        fsqPhoto:     photo ? `${photo.prefix}300x200${photo.suffix}` : null,
        // Use FSQ lat/lng as a fallback if other sources don't have it
        fsqLat:       place.geocodes?.main?.latitude  ?? null,
        fsqLng:       place.geocodes?.main?.longitude ?? null,
      });
    }

    cache.set(cacheKey, result, 21600); // 6-hour TTL
    return result;
  } catch (err) {
    console.warn(`[foursquare] ${err.message}`);
    return new Map();
  }
}

/**
 * Merge Foursquare data into a brewery object by fuzzy name match.
 *
 * @param {object} brewery
 * @param {Map<string, object>} fsqMap
 * @returns {object}
 */
function mergeFoursquareData(brewery, fsqMap) {
  if (!fsqMap.size) return brewery;

  const normName = brewery.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let fsq = fsqMap.get(normName);

  if (!fsq) {
    for (const [key, val] of fsqMap) {
      if (normName.includes(key) || key.includes(normName)) { fsq = val; break; }
    }
  }

  if (!fsq) return brewery;

  // Only fill lat/lng from FSQ if the brewery doesn't already have it
  const patch = { ...fsq };
  if (brewery.lat) { delete patch.fsqLat; delete patch.fsqLng; }
  else {
    patch.lat = fsq.fsqLat;
    patch.lng = fsq.fsqLng;
  }

  return { ...brewery, ...patch };
}

module.exports = { getFoursquareBreweries, mergeFoursquareData };
