/**
 * Beer scoring and ranking.
 *
 * Score formula (all components normalized 0–1):
 *
 *   score = (rating * 0.50) + (popularity * 0.30) + (proximity * 0.20)
 *
 * - Rating (50%): normalized against max possible rating (5.0)
 * - Popularity (30%): log-normalized review count against the set maximum,
 *   so a beer with 1000 reviews doesn't dominate over one with 200.
 * - Proximity (20%): closer breweries get a higher score.
 *
 * @typedef {Object} ScoredBeer
 * @property {string} name
 * @property {string} style
 * @property {number} abv
 * @property {number} rating
 * @property {number} reviewCount
 * @property {string} breweryId
 * @property {string} breweryName
 * @property {string} breweryAddress
 * @property {number} distanceMiles
 * @property {string|null} breweryWebsite
 * @property {number} score           final 0–1 composite score
 * @property {object[]} events        events at this brewery
 */

const MAX_RATING = 5.0;

/**
 * Score and rank a flat list of beers.
 *
 * @param {Array<{
 *   name: string, style: string, abv: number,
 *   rating: number, reviewCount: number,
 *   brewery: import('../services/places').Brewery,
 *   events: object[]
 * }>} beers
 * @returns {ScoredBeer[]} sorted descending by score
 */
function rankBeers(beers, { weatherStyles = [] } = {}) {
  if (!beers.length) return [];

  const maxReviews  = Math.max(...beers.map((b) => b.reviewCount), 1);
  const maxDistance = Math.max(...beers.map((b) => b.brewery.distanceMiles), 1);

  const scored = beers.map((beer) => {
    const normalizedRating = beer.rating / MAX_RATING;

    // Log-normalize to dampen the effect of viral beers
    const normalizedPopularity =
      Math.log1p(beer.reviewCount) / Math.log1p(maxReviews);

    // Closer = higher score
    const normalizedProximity = 1 - beer.brewery.distanceMiles / maxDistance;

    // Small weather bonus (up to +0.04) for styles matching current conditions
    const weatherBonus = weatherStyles.length > 0 &&
      weatherStyles.includes(beer.style_category || beer.style) ? 0.04 : 0;

    // Small Foursquare popularity bonus (up to +0.03) — high foot traffic signal
    const fsqBonus = beer.brewery.fsqPopularity
      ? parseFloat((beer.brewery.fsqPopularity * 0.03).toFixed(4))
      : 0;

    const score = parseFloat(
      (
        normalizedRating * 0.5 +
        normalizedPopularity * 0.3 +
        normalizedProximity * 0.2 +
        weatherBonus +
        fsqBonus
      ).toFixed(4)
    );

    // Hidden gem: well-rated but not widely reviewed → likely underrated local pick
    const isHiddenGem = beer.rating >= 4.0 && beer.reviewCount <= 80;

    return {
      id:             beer.id || null,
      name:           beer.name,
      style:          beer.style,
      style_category: beer.style_category,
      abv:            beer.abv,
      rating:         beer.rating,
      reviewCount:    beer.reviewCount,
      breweryId:      beer.brewery.id,
      breweryName:    beer.brewery.name,
      breweryAddress: beer.brewery.address,
      distanceMiles:  beer.brewery.distanceMiles,
      breweryWebsite: beer.brewery.website,
      breweryLat:     beer.brewery.lat  || null,
      breweryLng:     beer.brewery.lng  || null,
      // Yelp enrichment fields (present only when YELP_API_KEY is set)
      yelpRating:     beer.brewery.yelpRating     || null,
      yelpReviewCount: beer.brewery.yelpReviewCount || null,
      yelpUrl:        beer.brewery.yelpUrl         || null,
      imageUrl:       beer.brewery.imageUrl        || null,
      priceRange:     beer.brewery.priceRange      || null,
      isClosed:       beer.brewery.isClosed        || false,
      hours:          beer.brewery.hours           || null,
      // Foursquare enrichment fields
      fsqCheckins:    beer.brewery.fsqCheckins     ?? null,
      fsqPopularity:  beer.brewery.fsqPopularity   ?? null,
      fsqPhoto:       beer.brewery.fsqPhoto        || null,
      // Brewery metadata
      breweryType:    beer.brewery.brewery_type    || beer.brewery.breweryType || null,
      breweryPhone:   beer.brewery.phone           || null,
      score,
      events:         beer.events,
      // Enrichment fields passed through
      ibuLabel:       beer.ibuLabel   || null,
      ibuLevel:       beer.ibuLevel   ?? 1,
      ibuRange:       beer.ibuRange   || null,
      foodPairing:    beer.foodPairing || null,
      isSeasonal:     beer.isSeasonal || false,
      seasonType:     beer.seasonType || null,
      seasonEmoji:    beer.seasonEmoji || null,
      isHiddenGem,
      weatherMatch: weatherStyles.length > 0 &&
        weatherStyles.includes(beer.style_category || beer.style),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

module.exports = { rankBeers };
