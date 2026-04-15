/**
 * Yelp Fusion API — real brewery ratings, photos, hours, price range.
 *
 * Env var: YELP_API_KEY (free at yelp.com/developers, 500 calls/day)
 * If not set, returns empty array and the feature is silently disabled.
 *
 * Per Yelp ToS: must display "Powered by Yelp" attribution and link back to
 * Yelp business URLs. Do not cache Yelp data longer than 24 hours.
 */

const axios = require('axios');
const cache = require('../cache');

const SEARCH_URL  = 'https://api.yelp.com/v3/businesses/search';
const DETAIL_URL  = 'https://api.yelp.com/v3/businesses';

/**
 * Normalise a day index (0=Mon) to a short label.
 */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatHours(yelpHoursArr) {
  if (!Array.isArray(yelpHoursArr) || !yelpHoursArr.length) return null;
  const open = yelpHoursArr[0]?.open || [];
  const today = new Date().getDay(); // 0=Sun
  // Yelp uses 0=Mon; convert
  const yelpToday = today === 0 ? 6 : today - 1;
  const todaySlots = open.filter(s => s.day === yelpToday);
  if (!todaySlots.length) return { isOpenToday: false, todayHours: 'Closed today' };

  const fmt = (t) => {
    const h = parseInt(t.slice(0, 2), 10);
    const m = t.slice(2);
    const ampm = h >= 12 ? 'pm' : 'am';
    return `${h > 12 ? h - 12 : h || 12}:${m}${ampm}`;
  };

  const slots = todaySlots.map(s => `${fmt(s.start)}–${fmt(s.end)}`).join(', ');
  return { isOpenToday: !yelpHoursArr[0].is_open_now === false, todayHours: slots };
}

/**
 * Fetch breweries near coordinates from Yelp.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<Map<string, object>>} — map of normalised name → Yelp data
 */
async function getYelpBreweries(coords, radiusMiles) {
  if (!process.env.YELP_API_KEY) return new Map();

  const radiusM  = Math.min(Math.round(radiusMiles * 1609.34), 40000); // Yelp max 40km
  const cacheKey = `yelp:${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}:${radiusMiles}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(SEARCH_URL, {
      headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
      params: {
        latitude:   coords.lat,
        longitude:  coords.lng,
        radius:     radiusM,
        categories: 'breweries,brewpubs,beerbars',
        limit:      50,
        sort_by:    'distance',
      },
      timeout: 8000,
    });

    const result = new Map();
    for (const b of (data.businesses || [])) {
      const normName = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      result.set(normName, {
        yelpId:         b.id,
        yelpRating:     b.rating,
        yelpReviewCount: b.review_count,
        yelpUrl:        b.url,
        imageUrl:       b.image_url || null,
        phone:          b.display_phone || null,
        priceRange:     b.price || null,
        isClosed:       b.is_closed || false,
        hours:          formatHours(b.hours),
        categories:     (b.categories || []).map(c => c.title),
      });
    }

    // Cache for 6 hours (Yelp ToS allows up to 24h)
    cache.set(cacheKey, result, 21600);
    return result;
  } catch (err) {
    console.warn(`[yelp] Could not fetch breweries: ${err.message}`);
    return new Map();
  }
}

/**
 * Merge Yelp data into a brewery object by fuzzy name match.
 *
 * @param {object} brewery
 * @param {Map<string, object>} yelpMap
 * @returns {object} brewery with yelp fields merged in
 */
function mergeYelpData(brewery, yelpMap) {
  if (!yelpMap.size) return brewery;

  const normName = brewery.name.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Exact normalised match first
  let yelp = yelpMap.get(normName);

  // Fallback: partial match (brewery name contains or is contained in yelp key)
  if (!yelp) {
    for (const [key, val] of yelpMap) {
      if (normName.includes(key) || key.includes(normName)) {
        yelp = val;
        break;
      }
    }
  }

  if (!yelp) return brewery;
  return { ...brewery, ...yelp };
}

module.exports = { getYelpBreweries, mergeYelpData };
