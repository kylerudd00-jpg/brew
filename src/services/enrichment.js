/**
 * Beer data enrichment — style normalization, name cleaning, ABV estimation.
 *
 * Normalizes the chaotic variety of beer style names that breweries use into
 * canonical categories so filtering and trending work cleanly.
 */

// Canonical style categories → arrays of substrings to match against
const STYLE_MAP = [
  ['Hazy IPA',     ['hazy', 'juicy', 'new england', 'ne ipa', 'neipa', 'milkshake ipa']],
  ['Double IPA',   ['double ipa', 'imperial ipa', 'dipa', 'ddh ipa', 'triple ipa']],
  ['West Coast IPA',['west coast', 'wc ipa']],
  ['Session IPA',  ['session ipa', 'session india']],
  ['IPA',          ['ipa', 'india pale']],
  ['Imperial Stout',['imperial stout', 'russian imperial', 'barrel.aged stout']],
  ['Stout',        ['stout', 'porter']],
  ['Sour',         ['sour', 'gose', 'lambic', 'gueuze', 'berliner', 'kettle sour', 'wild ale', 'flanders']],
  ['Wheat',        ['wheat', 'hefeweizen', 'weizen', 'witbier', 'wit ', 'blanc']],
  ['Pale Ale',     ['pale ale', 'apa', 'american pale']],
  ['Lager',        ['lager', 'pilsner', 'pilsener', 'pils', 'helles', 'märzen', 'marzen', 'bock', 'kolsch', 'kölsch']],
  ['Amber / Red',  ['amber', 'red ale', 'altbier', 'irish red']],
  ['Brown Ale',    ['brown ale', 'mild ale']],
  ['Barleywine',   ['barleywine', 'barley wine']],
  ['Belgian',      ['belgian', 'saison', 'farmhouse', 'tripel', 'dubbel', 'quadrupel', 'abbey']],
  ['Cider',        ['cider', 'hard cider']],
  ['Mead',         ['mead', 'honey wine']],
];

// Typical ABV ranges by category (used when ABV is unknown)
const ABV_DEFAULTS = {
  'Hazy IPA':       [6.0, 7.5],
  'Double IPA':     [8.0, 10.5],
  'West Coast IPA': [6.5, 8.0],
  'Session IPA':    [3.8, 5.0],
  'IPA':            [5.5, 7.5],
  'Imperial Stout': [9.0, 13.0],
  'Stout':          [4.5, 7.5],
  'Sour':           [3.5, 6.5],
  'Wheat':          [4.5, 5.5],
  'Pale Ale':       [4.5, 6.0],
  'Lager':          [4.0, 5.5],
  'Amber / Red':    [5.0, 6.5],
  'Brown Ale':      [4.5, 6.0],
  'Barleywine':     [9.0, 14.0],
  'Belgian':        [6.0, 10.0],
};

/**
 * Normalize a raw style string to a canonical category.
 * Returns null if no match found.
 *
 * @param {string} rawStyle
 * @returns {string|null}
 */
function normalizeStyle(rawStyle) {
  if (!rawStyle) return null;
  const lower = rawStyle.toLowerCase();
  for (const [canonical, patterns] of STYLE_MAP) {
    if (patterns.some(p => lower.includes(p))) return canonical;
  }
  return null;
}

/**
 * Clean a raw beer name scraped from a website.
 * Removes ABV, price, common noise patterns.
 *
 * @param {string} name
 * @returns {string}
 */
function cleanBeerName(name) {
  return name
    .replace(/\s*[\-–|]\s*\$[\d.]+/g, '')      // remove prices
    .replace(/\s*\(?\d+(\.\d+)?%(\s*abv)?\)?/gi, '') // remove "6.5% ABV"
    .replace(/\s*(on\s+tap|draft|draught|available now)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate a list of beer names (case-insensitive, fuzzy).
 *
 * @param {string[]} names
 * @returns {string[]}
 */
function deduplicateBeerNames(names) {
  const seen = new Set();
  return names.filter(name => {
    const key = name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Estimate ABV for a beer when the actual value is unknown.
 * Returns the midpoint of the typical range for its style.
 *
 * @param {string|null} styleCategory
 * @returns {number}
 */
function estimateAbv(styleCategory) {
  const range = ABV_DEFAULTS[styleCategory];
  if (!range) return 5.5; // generic default
  return parseFloat(((range[0] + range[1]) / 2).toFixed(1));
}

/**
 * Enrich a raw beer object with normalized style, cleaned name, and estimated ABV.
 *
 * @param {{ name: string, style?: string, abv?: number }} beer
 * @returns {object}
 */
function enrichBeer(beer) {
  const nameCleaned    = cleanBeerName(beer.name);
  const styleCategory  = normalizeStyle(beer.style || beer.name) || 'Other';
  const abv            = beer.abv || estimateAbv(styleCategory);
  const ibu            = getIbuInfo(styleCategory);
  const foodPairing    = getFoodPairing(styleCategory);
  const seasonal       = getSeasonalInfo(nameCleaned, styleCategory);

  return {
    ...beer,
    name:           nameCleaned,
    style:          beer.style || styleCategory,
    style_category: styleCategory,
    abv,
    ibuLabel:       ibu.label,
    ibuLevel:       ibu.level,
    ibuRange:       ibu.range,
    foodPairing,
    isSeasonal:     seasonal.isSeasonal,
    seasonType:     seasonal.seasonType,
    seasonEmoji:    seasonal.seasonEmoji,
  };
}

/**
 * Enrich an array of beers. Also deduplicates by clean name.
 *
 * @param {object[]} beers
 * @returns {object[]}
 */
function enrichBeers(beers) {
  const enriched = beers.map(enrichBeer);
  const seen     = new Set();
  return enriched.filter(b => {
    const key = b.name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** IBU level by canonical style — for bitterness display on cards */
const IBU_LEVELS = {
  'Hazy IPA':        { label: 'Med Bitter',  level: 2, range: '30–60 IBU'  },
  'Double IPA':      { label: 'Very Bitter', level: 4, range: '60–100 IBU' },
  'West Coast IPA':  { label: 'Bitter',      level: 3, range: '50–90 IBU'  },
  'Session IPA':     { label: 'Med Bitter',  level: 2, range: '30–50 IBU'  },
  'IPA':             { label: 'Bitter',      level: 3, range: '40–70 IBU'  },
  'Imperial Stout':  { label: 'Med Bitter',  level: 2, range: '35–65 IBU'  },
  'Stout':           { label: 'Med Bitter',  level: 2, range: '25–50 IBU'  },
  'Sour':            { label: 'Not Bitter',  level: 0, range: '5–15 IBU'   },
  'Wheat':           { label: 'Low Bitter',  level: 1, range: '10–20 IBU'  },
  'Pale Ale':        { label: 'Med Bitter',  level: 2, range: '30–50 IBU'  },
  'Lager':           { label: 'Low Bitter',  level: 1, range: '15–30 IBU'  },
  'Amber / Red':     { label: 'Mild',        level: 1, range: '20–40 IBU'  },
  'Brown Ale':       { label: 'Mild',        level: 1, range: '20–35 IBU'  },
  'Barleywine':      { label: 'Bitter',      level: 3, range: '50–100 IBU' },
  'Belgian':         { label: 'Mild',        level: 1, range: '20–40 IBU'  },
  'Cider':           { label: 'Not Bitter',  level: 0, range: '0 IBU'      },
  'Mead':            { label: 'Not Bitter',  level: 0, range: '0 IBU'      },
};

/** Food pairings by canonical style */
const FOOD_PAIRINGS = {
  'Hazy IPA':        'Tacos, citrus-glazed chicken, Thai food',
  'Double IPA':      'Blue cheese, spicy wings, hearty stew',
  'West Coast IPA':  'Fish tacos, sharp cheddar, burgers',
  'Session IPA':     'Pizza, pub snacks, light salads',
  'IPA':             'Spicy food, sharp cheddar, burgers',
  'Imperial Stout':  'Chocolate cake, oysters, braised short rib',
  'Stout':           'BBQ ribs, dark chocolate, roast beef',
  'Sour':            'Goat cheese, charcuterie, fruit tarts',
  'Wheat':           'Soft pretzels, mussels, light salads',
  'Pale Ale':        'Fish & chips, Caesar salad, grilled chicken',
  'Lager':           'Pizza, fried food, soft pretzels',
  'Amber / Red':     'Roasted chicken, caramelized onions, sweet potato',
  'Brown Ale':       'Nuts, caramel desserts, roasted chicken',
  'Barleywine':      'Aged cheddar, holiday spice cake',
  'Belgian':         'Mussels, brie, roasted pork',
  'Cider':           'Sharp cheddar, pork tenderloin, apple desserts',
  'Mead':            'Soft cheese, honey-glazed meats, fruit desserts',
};

/** Seasonal / limited-release patterns */
const SEASONAL_PATTERNS = [
  { re: /pumpkin|harvest|oktoberfest|m[aä]rzen|autumn|apple spice/i, type: 'Fall Seasonal',    emoji: '🍂' },
  { re: /winter|holiday|christmas|xmas|yule|spiced|gingerbread|eggnog/i, type: 'Winter Seasonal', emoji: '❄️' },
  { re: /spring|maibock|cherry blossom/i,                               type: 'Spring Seasonal', emoji: '🌸' },
  { re: /summer|beach|sunshine|radler/i,                                 type: 'Summer Seasonal', emoji: '☀️' },
  { re: /limited|special release|barrel.aged|reserve|anniversary|collab/i, type: 'Limited Release', emoji: '⭐' },
];

function getIbuInfo(styleCategory) {
  return IBU_LEVELS[styleCategory] || { label: 'Unknown', level: 1, range: '' };
}

function getFoodPairing(styleCategory) {
  return FOOD_PAIRINGS[styleCategory] || null;
}

function getSeasonalInfo(name, styleCategory) {
  const text = `${name || ''} ${styleCategory || ''}`;
  for (const { re, type, emoji } of SEASONAL_PATTERNS) {
    if (re.test(text)) return { isSeasonal: true, seasonType: type, seasonEmoji: emoji };
  }
  return { isSeasonal: false, seasonType: null, seasonEmoji: null };
}

/** All canonical style categories (for /styles endpoint). */
const ALL_STYLE_CATEGORIES = STYLE_MAP.map(([cat]) => cat);

/**
 * Short style descriptions shown in the beer detail view.
 * Written for craft beer newcomers — clear, evocative, jargon-light.
 */
const STYLE_DESCRIPTIONS = {
  'Hazy IPA':
    'Soft, pillowy, and packed with tropical fruit aromas — think mango, pineapple, and passionfruit. Lower bitterness than a classic IPA with a lush, juicy mouthfeel. The style that sparked the New England craft beer revolution.',
  'Double IPA':
    'Everything turned up to eleven: bigger malt backbone, double the hops, double the ABV. Expect an intense wave of citrus, pine, and resin with serious warming heat. Sip slowly — this one sneaks up on you.',
  'West Coast IPA':
    'The original craft IPA. Crystal-clear, dry, and aggressively bitter with aromas of grapefruit, pine, and dank resin. Built for hop heads who want their bitterness front and center.',
  'Session IPA':
    'All the hop character of a classic IPA squeezed into a crushable low-ABV package. Great for a long afternoon at the taproom without losing track of the day.',
  'IPA':
    'The backbone of the craft beer movement. Expect pronounced hop bitterness and aroma — citrus, floral, herbal, or resinous depending on the brewer\'s hop selection. Endlessly versatile.',
  'Imperial Stout':
    'Dark as midnight and rich as dessert. Roasted coffee, dark chocolate, dried fruit, and molasses — often with warming alcohol heat. Many are aged in bourbon or whisky barrels for added complexity.',
  'Stout':
    'Roasted barley gives this dark ale its signature dry, coffee-like character. Porters lean milkier and chocolate-forward; classic stouts are drier and more bitter. Incredibly food-friendly.',
  'Sour':
    'Deliberately tart, funky, and refreshing. Produced through wild fermentation or souring bacteria like Lactobacillus. Flavors range from bright lemon and yogurt to earthy barnyard funk. A palate-cleanser unlike any other.',
  'Wheat':
    'Brewed with a large proportion of wheat, giving a hazy, soft pour and gentle sweetness. German hefeweizens add banana and clove from yeast; Belgian wits add orange peel and coriander. Effortlessly drinkable.',
  'Pale Ale':
    'The approachable gateway to hop-forward craft beer. Balanced malt sweetness with moderate hop bitterness — usually floral, citrusy, or earthy. A dependable companion to almost any food.',
  'Lager':
    'Fermented cold and slow for a clean, crisp finish. The world\'s most popular beer style — but craft lagers are worlds apart from mass-market versions. Look for nuanced malt character and delicate noble hop aroma.',
  'Amber / Red':
    'Caramel malt sweetness takes the spotlight in this copper-to-red ale. Expect toffee, biscuit, and toasted bread balanced by medium hop bitterness. Approachable and crowd-pleasing.',
  'Brown Ale':
    'Nutty, toasty, and warmly comforting. English-style browns are drier with hazelnut notes; American versions add more hops and sweeter chocolate malt. Perfect with pub food.',
  'Barleywine':
    'One of the strongest ales in existence — more wine-like in complexity and alcohol than a typical beer. Massive caramel and toffee sweetness, dried fruit, and warming heat. Best savored like a fine port.',
  'Belgian':
    'Yeast is the star here. Belgian strains produce distinctive fruity esters and spicy phenols — think pear, plum, and pepper — at almost any ABV. Saisons are dry and rustic; tripels are golden and strong; dubbels are rich and dark.',
  'Cider':
    'Fermented apple juice — not technically beer but a fixture at most taprooms. Ranges from bone-dry and effervescent to semi-sweet and still. Naturally gluten-free and endlessly variable by apple variety.',
  'Mead':
    'The world\'s oldest fermented beverage — honey, water, and yeast. Flavor follows the honey: wildflower meads are floral and complex; traditional meads are rich and warming. Often made with fruit, spice, or hops.',
};

function getStyleDescription(styleCategory) {
  return STYLE_DESCRIPTIONS[styleCategory] || null;
}

module.exports = {
  normalizeStyle,
  cleanBeerName,
  deduplicateBeerNames,
  estimateAbv,
  enrichBeer,
  enrichBeers,
  getIbuInfo,
  getFoodPairing,
  getSeasonalInfo,
  getStyleDescription,
  ALL_STYLE_CATEGORIES,
  STYLE_DESCRIPTIONS,
};
