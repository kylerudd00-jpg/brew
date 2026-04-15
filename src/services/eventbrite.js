const axios = require('axios');

const BASE_URL = 'https://www.eventbriteapi.com/v3/events/search/';

/**
 * Fetch beer/brewery events near a lat/lng from Eventbrite.
 *
 * @param {{ lat: number, lng: number }} coords
 * @param {number} radiusMiles
 * @returns {Promise<EventbriteEvent[]>}
 *
 * @typedef {Object} EventbriteEvent
 * @property {string} id
 * @property {string} name
 * @property {string|null} date       ISO date string
 * @property {string} url
 * @property {string|null} breweryId  matched brewery ID (if matchable)
 * @property {string|null} breweryName
 * @property {'eventbrite'} source
 */
async function getEventbriteEvents(coords, radiusMiles = 15) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    console.warn('[eventbrite] EVENTBRITE_TOKEN not set — skipping');
    return [];
  }

  try {
    const { data } = await axios.get(BASE_URL, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: 'beer brewery craft',
        'location.latitude': coords.lat,
        'location.longitude': coords.lng,
        'location.within': `${radiusMiles}mi`,
        'start_date.range_start': new Date().toISOString().replace('.000Z', 'Z'),
        expand: 'venue',
        page_size: 20,
      },
      timeout: 8000,
    });

    return (data.events || []).map((ev) => ({
      id: `eb-${ev.id}`,
      name: ev.name?.text || 'Unnamed Event',
      date: ev.start?.local || null,
      url: ev.url,
      venueName: ev.venue?.name || null,
      venueAddress: ev.venue?.address?.localized_address_display || null,
      breweryId: null,   // correlation happens in the route layer
      breweryName: null,
      source: 'eventbrite',
    }));
  } catch (err) {
    // Eventbrite failures are non-fatal — degrade gracefully
    console.error('[eventbrite] fetch failed:', err.message);
    return [];
  }
}

module.exports = { getEventbriteEvents };
