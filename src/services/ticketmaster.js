/**
 * Ticketmaster Discovery API — beer festivals, tap takeovers & brewery events.
 *
 * Free tier: 5,000 calls/day, no credit card required.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 *
 * Env var: TICKETMASTER_KEY
 * If not set, returns empty array silently.
 */

const axios = require('axios');
const cache = require('../cache');

const BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

/**
 * Find brewery / beer festival events near a location.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<object[]>}
 */
async function getTicketmasterEvents(coords, radiusMiles) {
  if (!process.env.TICKETMASTER_KEY) return [];

  const cacheKey = `tm:${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}:${radiusMiles}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  // Run two searches in parallel: brewery-specific and broader beer-festival
  const shared = {
    apikey:   process.env.TICKETMASTER_KEY,
    latlong:  `${coords.lat},${coords.lng}`,
    radius:   Math.min(Math.round(radiusMiles), 50),
    unit:     'miles',
    size:     20,
    sort:     'date,asc',
    locale:   '*',
  };

  try {
    const [r1, r2] = await Promise.allSettled([
      axios.get(BASE, { params: { ...shared, keyword: 'brewery beer craft taproom' }, timeout: 7000 }),
      axios.get(BASE, { params: { ...shared, keyword: 'beer festival oktoberfest tap takeover' }, timeout: 7000 }),
    ]);

    const seenIds = new Set();
    const events  = [];

    for (const result of [r1, r2]) {
      if (result.status !== 'fulfilled') continue;
      for (const e of (result.value.data._embedded?.events || [])) {
        if (seenIds.has(e.id)) continue;
        seenIds.add(e.id);

        const venue = e._embedded?.venues?.[0];
        events.push({
          id:           `tm-${e.id}`,
          name:         e.name,
          date:         e.dates?.start?.dateTime || e.dates?.start?.localDate || null,
          url:          e.url || null,
          venueName:    venue?.name              || null,
          venueAddress: venue?.address?.line1    || null,
          imageUrl:     (e.images || []).find(img => img.ratio === '16_9' && img.width >= 640)?.url || e.images?.[0]?.url || null,
          source:       'ticketmaster',
          breweryName:  venue?.name              || null,
        });
      }
    }

    cache.set(cacheKey, events, 3600); // 1-hour TTL
    return events;
  } catch (err) {
    console.warn(`[ticketmaster] ${err.message}`);
    return [];
  }
}

module.exports = { getTicketmasterEvents };
