/**
 * Beer ratings service.
 *
 * Untappd's public API is no longer available without approval.
 * This module provides a deterministic simulation that produces
 * plausible ratings so the scoring system works end-to-end.
 *
 * When you gain Untappd API access, replace `simulateRatings` with
 * a real fetch against:
 *   GET https://api.untappd.com/v4/brewery/beer_list/{brewery_id}
 *
 * @typedef {Object} BeerRating
 * @property {string} name
 * @property {string} style
 * @property {number} abv
 * @property {number} rating   0–5
 * @property {number} reviewCount
 */

const STYLES = [
  'IPA', 'Double IPA', 'Hazy IPA', 'West Coast IPA',
  'Stout', 'Imperial Stout', 'Milk Stout',
  'Pale Ale', 'American Pale Ale', 'Session IPA',
  'Porter', 'Baltic Porter',
  'Hefeweizen', 'Wheat Beer', 'Witbier',
  'Sour', 'Gose', 'Berliner Weisse', 'Lambic',
  'Lager', 'Pilsner', 'Helles',
  'Amber Ale', 'Red Ale', 'Brown Ale',
  'Saison', 'Farmhouse Ale',
  'Barleywine', 'Belgian Tripel', 'Dubbel',
];

/**
 * Produce deterministic simulated ratings for a list of beer names.
 * Using a seed derived from the brewery ID ensures stable results
 * across requests for the same brewery.
 *
 * @param {string[]} beerNames
 * @param {string} breweryId
 * @returns {BeerRating[]}
 */
function simulateRatings(beerNames, breweryId) {
  // Simple hash of breweryId for seeding deterministic randomness
  const seed = hashCode(breweryId);

  return beerNames.map((name, i) => {
    const r = seededRandom(seed + i);
    const r2 = seededRandom(seed + i + 1000);
    const r3 = seededRandom(seed + i + 2000);

    // Ratings cluster realistically: most craft beers 3.5–4.5
    const rating = parseFloat((3.2 + r * 1.6).toFixed(2));
    // Review counts: long-tail distribution
    const reviewCount = Math.floor(10 + r2 * r2 * 2000);
    const abv = parseFloat((3.5 + r3 * 8.5).toFixed(1));
    const style = STYLES[Math.floor(seededRandom(seed + i + 3000) * STYLES.length)];

    return {
      name,
      style,
      abv,
      rating: Math.min(5, rating),
      reviewCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Minimal deterministic PRNG (mulberry32-inspired, no deps)
// ---------------------------------------------------------------------------

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

module.exports = { simulateRatings };
