/**
 * OpenWeatherMap integration — current weather → beer mood suggestions.
 *
 * Env var: OPENWEATHERMAP_KEY (free at openweathermap.org, 1000 calls/day)
 * If not set, returns null and the feature is silently disabled.
 *
 * Weather → beer style mapping:
 *   Hot (>80°F)   → Lager, Wheat, Session IPA, Sour
 *   Warm (65-80°) → Hazy IPA, Pale Ale, Belgian
 *   Cool (45-65°) → Amber/Red, Brown Ale, IPA
 *   Cold (<45°F)  → Stout, Imperial Stout, Barleywine, Porter
 *   Rain/Snow     → Stout, Brown Ale, Belgian (cozy + dark)
 */

const axios = require('axios');
const cache = require('../cache');

const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

const WEATHER_BEER_MAP = {
  scorching: {
    label:  'Scorching hot',
    emoji:  '🌡️',
    mood:   'ice-cold & refreshing',
    styles: ['Lager', 'Wheat', 'Session IPA', 'Sour'],
    tip:    'Heat calls for something light and ice-cold',
  },
  hot: {
    label:  'Hot & sunny',
    emoji:  '☀️',
    mood:   'crisp & light',
    styles: ['Lager', 'Wheat', 'Session IPA', 'Hazy IPA'],
    tip:    'Perfect weather for a cold crisp lager or hazy',
  },
  warm: {
    label:  'Warm & pleasant',
    emoji:  '🌤️',
    mood:   'balanced & hoppy',
    styles: ['Hazy IPA', 'Pale Ale', 'IPA', 'Belgian'],
    tip:    'Great patio weather — ideal for a hop-forward beer',
  },
  cool: {
    label:  'Cool & crisp',
    emoji:  '🌥️',
    mood:   'malty & satisfying',
    styles: ['Amber / Red', 'Brown Ale', 'IPA', 'Pale Ale'],
    tip:    'Cool air pairs well with something malty and rich',
  },
  cold: {
    label:  'Cold outside',
    emoji:  '🧣',
    mood:   'dark & warming',
    styles: ['Stout', 'Imperial Stout', 'Brown Ale', 'Barleywine'],
    tip:    'Cold day — nothing better than a warming dark ale',
  },
  freezing: {
    label:  'Freezing',
    emoji:  '❄️',
    mood:   'rich & bold',
    styles: ['Imperial Stout', 'Barleywine', 'Stout', 'Belgian'],
    tip:    'Freezing temps call for the highest ABV you can find',
  },
  rainy: {
    label:  'Rainy day',
    emoji:  '🌧️',
    mood:   'cozy & complex',
    styles: ['Stout', 'Brown Ale', 'Belgian', 'Amber / Red'],
    tip:    'Rainy days are made for dark cozy ales',
  },
  stormy: {
    label:  'Stormy',
    emoji:  '⛈️',
    mood:   'bold & intense',
    styles: ['Imperial Stout', 'Barleywine', 'Stout', 'Double IPA'],
    tip:    'Stay in and drink something big',
  },
  snowy: {
    label:  'Snowing',
    emoji:  '❄️',
    mood:   'warming & festive',
    styles: ['Imperial Stout', 'Barleywine', 'Belgian', 'Brown Ale'],
    tip:    'Snow pairs perfectly with a big winter warmer',
  },
  foggy: {
    label:  'Foggy',
    emoji:  '🌫️',
    mood:   'hazy & mysterious',
    styles: ['Hazy IPA', 'Belgian', 'Wheat', 'Sour'],
    tip:    'Foggy day? Grab a hazy IPA — fitting',
  },
};

function classifyWeather(tempF, weatherId) {
  // OWM weather IDs: https://openweathermap.org/weather-conditions
  const isRain  = weatherId >= 200 && weatherId < 600 && weatherId !== 511;
  const isSnow  = weatherId >= 600 && weatherId < 700;
  const isFog   = weatherId >= 700 && weatherId < 800;
  const isStorm = weatherId >= 200 && weatherId < 300;

  if (isSnow)  return WEATHER_BEER_MAP.snowy;
  if (isStorm) return WEATHER_BEER_MAP.stormy;
  if (isRain)  return WEATHER_BEER_MAP.rainy;
  if (isFog)   return WEATHER_BEER_MAP.foggy;

  if (tempF >= 95) return WEATHER_BEER_MAP.scorching;
  if (tempF >= 80) return WEATHER_BEER_MAP.hot;
  if (tempF >= 65) return WEATHER_BEER_MAP.warm;
  if (tempF >= 45) return WEATHER_BEER_MAP.cool;
  if (tempF >= 28) return WEATHER_BEER_MAP.cold;
  return WEATHER_BEER_MAP.freezing;
}

/**
 * Fetch current weather for coordinates.
 *
 * @param {{ lat: number, lng: number }} coords
 * @returns {Promise<object|null>}
 */
async function getWeather(coords) {
  if (!process.env.OPENWEATHERMAP_KEY) return null;

  const cacheKey = `weather:${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(BASE_URL, {
      params: {
        lat:   coords.lat,
        lon:   coords.lng,
        appid: process.env.OPENWEATHERMAP_KEY,
        units: 'imperial',
      },
      timeout: 4000,
    });

    const tempF      = Math.round(data.main.temp);
    const feelsLike  = Math.round(data.main.feels_like);
    const weatherId  = data.weather[0].id;
    const condition  = data.weather[0].main;
    const desc       = data.weather[0].description;
    const profile    = classifyWeather(tempF, weatherId);

    const result = {
      tempF,
      feelsLike,
      condition,
      description: desc,
      humidity:    data.main.humidity,
      city:        data.name,
      ...profile,
    };

    // Cache for 30 minutes
    cache.set(cacheKey, result, 1800);
    return result;
  } catch (err) {
    console.warn(`[weather] Could not fetch weather: ${err.message}`);
    return null;
  }
}

module.exports = { getWeather };
