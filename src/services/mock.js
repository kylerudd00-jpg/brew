/**
 * Mock data service — activated when GOOGLE_API_KEY is missing.
 * Lets developers run and test the full UI with zero API keys.
 * Realistic enough to validate the scoring + rendering pipeline.
 */

const MOCK_BREWERIES = [
  {
    id: 'mock-b1',
    name: 'Foghorn Brewing Co.',
    address: '1440 Broadway, Oakland, CA',
    lat: 37.8049,
    lng: -122.2705,
    distanceMiles: 1.2,
    website: 'https://foghornbrewing.com',
    placeId: 'mock-b1',
  },
  {
    id: 'mock-b2',
    name: 'Temescal Brewing',
    address: '4115 Telegraph Ave, Oakland, CA',
    lat: 37.8301,
    lng: -122.2620,
    distanceMiles: 2.8,
    website: 'https://temescalbrewing.com',
    placeId: 'mock-b2',
  },
  {
    id: 'mock-b3',
    name: 'Drake\'s Brewing Company',
    address: '1933 Davis St, San Leandro, CA',
    lat: 37.7212,
    lng: -122.1562,
    distanceMiles: 5.4,
    website: 'https://drinkdrakes.com',
    placeId: 'mock-b3',
  },
  {
    id: 'mock-b4',
    name: 'Faction Brewing',
    address: '2501 Monarch St, Alameda, CA',
    lat: 37.7799,
    lng: -122.3009,
    distanceMiles: 7.1,
    website: 'https://factionbrewing.com',
    placeId: 'mock-b4',
  },
  {
    id: 'mock-b5',
    name: 'Fieldwork Brewing Co.',
    address: '1160 6th St, Berkeley, CA',
    lat: 37.8716,
    lng: -122.2908,
    distanceMiles: 9.3,
    website: 'https://fieldworkbrewing.com',
    placeId: 'mock-b5',
  },
];

const MOCK_TAP_LISTS = {
  'mock-b1': ['Westside Hazy IPA', 'Fog City Stout', 'Sunrise Wheat', 'Golden Gate Lager', 'Black Anchor Porter'],
  'mock-b2': ['Temescal IPA', 'Tangerine Dream Sour', 'Night Train Dark Ale', 'Backyard Pale Ale', 'Session Squeeze'],
  'mock-b3': ['Denogginizer Double IPA', 'Lil Bitterness IPA', 'Alpha Session Ale', 'Amber Drake Red Ale', 'Black Robusto Porter'],
  'mock-b4': ['Faction Pale Ale', 'Bay Bridge Lager', 'Trestle Red IPA', 'Admiral Stout', 'Nimitz Wheat'],
  'mock-b5': ['Reaper Hazy IPA', 'Wanderlust Pale', 'Sugar Rush Milkshake IPA', 'Meridian Lager', 'Dark Matter Stout'],
};

const MOCK_EVENTS = {
  'mock-b1': [
    { id: 'mock-ev1', name: 'Trivia Night @ Foghorn', date: '2026-04-18T19:00:00', url: '#', breweryId: 'mock-b1', breweryName: 'Foghorn Brewing Co.', source: 'scraped' },
    { id: 'mock-ev2', name: 'Live Jazz & Craft Beer', date: '2026-04-20T17:00:00', url: '#', breweryId: 'mock-b1', breweryName: 'Foghorn Brewing Co.', source: 'scraped' },
  ],
  'mock-b2': [
    { id: 'mock-ev3', name: 'New Hop Drop Release Party', date: '2026-04-19T14:00:00', url: '#', breweryId: 'mock-b2', breweryName: 'Temescal Brewing', source: 'scraped' },
  ],
  'mock-b3': [
    { id: 'mock-ev4', name: 'Bay Area Craft Beer Fest', date: '2026-04-26T12:00:00', url: '#', breweryId: 'mock-b3', breweryName: "Drake's Brewing Company", source: 'eventbrite' },
  ],
  'mock-b4': [],
  'mock-b5': [
    { id: 'mock-ev5', name: 'Fieldwork Anniversary Bash', date: '2026-04-25T16:00:00', url: '#', breweryId: 'mock-b5', breweryName: 'Fieldwork Brewing Co.', source: 'scraped' },
  ],
};

const MOCK_RATINGS = {
  'mock-b1': [
    { name: 'Westside Hazy IPA',   style: 'Hazy IPA',      abv: 6.8, rating: 4.31, reviewCount: 1842 },
    { name: 'Fog City Stout',       style: 'Imperial Stout', abv: 9.2, rating: 4.47, reviewCount: 963  },
    { name: 'Sunrise Wheat',        style: 'Hefeweizen',    abv: 5.1, rating: 3.89, reviewCount: 412  },
    { name: 'Golden Gate Lager',    style: 'Lager',         abv: 4.5, rating: 3.72, reviewCount: 287  },
    { name: 'Black Anchor Porter',  style: 'Porter',        abv: 6.1, rating: 4.05, reviewCount: 731  },
  ],
  'mock-b2': [
    { name: 'Temescal IPA',         style: 'IPA',           abv: 7.2, rating: 4.18, reviewCount: 1204 },
    { name: 'Tangerine Dream Sour', style: 'Gose',          abv: 4.8, rating: 4.52, reviewCount: 2341 },
    { name: 'Night Train Dark Ale', style: 'Brown Ale',     abv: 5.9, rating: 3.95, reviewCount: 518  },
    { name: 'Backyard Pale Ale',    style: 'Pale Ale',      abv: 5.4, rating: 3.81, reviewCount: 344  },
    { name: 'Session Squeeze',      style: 'Session IPA',   abv: 4.2, rating: 3.67, reviewCount: 229  },
  ],
  'mock-b3': [
    { name: 'Denogginizer Double IPA', style: 'Double IPA', abv: 9.75, rating: 4.61, reviewCount: 4872 },
    { name: 'Lil Bitterness IPA',      style: 'IPA',        abv: 6.9,  rating: 4.22, reviewCount: 1563 },
    { name: 'Alpha Session Ale',       style: 'Session IPA',abv: 4.5,  rating: 3.88, reviewCount: 602  },
    { name: 'Amber Drake Red Ale',     style: 'Red Ale',    abv: 5.8,  rating: 3.94, reviewCount: 834  },
    { name: 'Black Robusto Porter',    style: 'Porter',     abv: 7.1,  rating: 4.12, reviewCount: 921  },
  ],
  'mock-b4': [
    { name: 'Faction Pale Ale',    style: 'American Pale Ale', abv: 5.6, rating: 4.08, reviewCount: 987  },
    { name: 'Bay Bridge Lager',    style: 'Lager',             abv: 4.2, rating: 3.75, reviewCount: 421  },
    { name: 'Trestle Red IPA',     style: 'Red IPA',           abv: 7.0, rating: 4.19, reviewCount: 1102 },
    { name: 'Admiral Stout',       style: 'Stout',             abv: 8.3, rating: 4.35, reviewCount: 763  },
    { name: 'Nimitz Wheat',        style: 'Wheat Beer',        abv: 5.0, rating: 3.62, reviewCount: 198  },
  ],
  'mock-b5': [
    { name: 'Reaper Hazy IPA',          style: 'Hazy IPA',        abv: 7.5, rating: 4.54, reviewCount: 3201 },
    { name: 'Wanderlust Pale',          style: 'Pale Ale',        abv: 5.3, rating: 4.11, reviewCount: 1087 },
    { name: 'Sugar Rush Milkshake IPA', style: 'Milkshake IPA',   abv: 6.8, rating: 4.38, reviewCount: 1674 },
    { name: 'Meridian Lager',           style: 'Lager',           abv: 4.4, rating: 3.70, reviewCount: 312  },
    { name: 'Dark Matter Stout',        style: 'Stout',           abv: 8.8, rating: 4.44, reviewCount: 1539 },
  ],
};

/**
 * Build a mock search response using the same shape as the live /search route.
 *
 * @param {string} zip
 * @param {{
 *   style?: string|null,
 *   minRating?: number|null,
 *   maxMiles?: number,
 *   sortBy?: 'score'|'rating'|'distance'|'reviews',
 *   limit?: number,
 *   page?: number,
 * }} [options]
 * @returns {object} same shape as the real /search response
 */
function getMockResponse(zip, options = {}) {
  const { rankBeers } = require('../scoring/beerScorer');
  const { enrichBeers } = require('./enrichment');

  const {
    style = null,
    minRating = null,
    maxMiles = 15,
    sortBy = 'score',
    limit = 5,
    page = 1,
  } = options;

  const offset = Math.max(0, (page - 1) * limit);

  const allBeers = [];
  for (const brewery of MOCK_BREWERIES) {
    if (brewery.distanceMiles > maxMiles) continue;

    const ratings = enrichBeers(
      (MOCK_RATINGS[brewery.id] || []).map(beer => ({
        ...beer,
        brewery_id: brewery.id,
      }))
    );
    const events = MOCK_EVENTS[brewery.id] || [];

    for (const beer of ratings) {
      if (style && beer.style_category !== style) continue;
      if (minRating !== null && beer.rating < minRating) continue;
      allBeers.push({ ...beer, brewery, events });
    }
  }

  const scored = rankBeers(allBeers);
  const ranked = sortBy === 'score'
    ? scored
    : [...scored].sort((a, b) => {
      if (sortBy === 'rating')   return b.rating - a.rating;
      if (sortBy === 'distance') return a.distanceMiles - b.distanceMiles;
      if (sortBy === 'reviews')  return b.reviewCount - a.reviewCount;
      return 0;
    });

  const topBeers = ranked.slice(offset, offset + limit);

  const seenIds = new Set();
  const allEvents = [];
  for (const beer of topBeers) {
    for (const ev of beer.events || []) {
      if (!seenIds.has(ev.id)) { seenIds.add(ev.id); allEvents.push(ev); }
    }
  }

  const hasFilters = style || minRating !== null || maxMiles !== 15 || limit !== 5 || sortBy !== 'score' || page > 1;

  return {
    zip,
    mock: true,
    topBeers,
    allEvents,
    filters: hasFilters ? { style, minRating, maxMiles, sortBy, limit } : undefined,
    meta: {
      breweryCount: MOCK_BREWERIES.filter(brewery => brewery.distanceMiles <= maxMiles).length,
      beerCount: allBeers.length,
      totalBeers: ranked.length,
      page,
      limit,
      totalPages: Math.ceil(ranked.length / limit),
      radiusMiles: maxMiles,
      cachedAt: new Date().toISOString(),
      fromCache: false,
      note: 'Running in mock mode because live brewery discovery is unavailable.',
    },
  };
}

module.exports = { getMockResponse };
