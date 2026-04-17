/* ============================================================
   Hops & Finds — App Logic
   ============================================================ */

// ── Particle system ───────────────────────────────────────
(function spawnParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = 3 + Math.random() * 9;
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px; height: ${size}px;
      animation-delay: ${(Math.random() * 12).toFixed(2)}s;
      animation-duration: ${(7 + Math.random() * 10).toFixed(2)}s;
      opacity: 0;`;
    container.appendChild(el);
  }
})();

// ── DOM refs ──────────────────────────────────────────────
const form          = document.getElementById('searchForm');
const zipInput      = document.getElementById('zipInput');
const searchBtn     = document.getElementById('searchBtn');
const inputError    = document.getElementById('inputError');
const searchField   = document.getElementById('searchField');
const btnText       = searchBtn.querySelector('.btn-text');
const btnSpinner    = searchBtn.querySelector('.btn-spinner');
const hero          = document.getElementById('hero');
const skeleton      = document.getElementById('skeletonSection');
const results       = document.getElementById('resultsSection');
const resultsZip    = document.getElementById('resultsZip');
const metaBar       = document.getElementById('metaBar');
const featuredWrap  = document.getElementById('featuredWrap');
const secGrid       = document.getElementById('secondaryGrid');
const eventsSection = document.getElementById('eventsSection');
const eventsGrid    = document.getElementById('eventsGrid');
const emptyState    = document.getElementById('emptyState');
const errorState    = document.getElementById('errorState');
const errorTitle    = document.getElementById('errorTitle');
const errorMsg      = document.getElementById('errorMsg');
const mockBadge     = document.getElementById('mockBadge');
const newSearchBtn  = document.getElementById('newSearchBtn');
const emptyBack     = document.getElementById('emptyBack');
const errorBack     = document.getElementById('errorBack');
const detailOverlay  = document.getElementById('detailOverlay');
const detailSheet    = document.getElementById('detailSheet');
const detailContent  = document.getElementById('detailContent');
const detailClose    = document.getElementById('detailClose');
const quizOverlay    = document.getElementById('quizOverlay');
const quizClose      = document.getElementById('quizClose');
const quizBar        = document.getElementById('quizBar');
const quizChip       = document.getElementById('quizChip');
const weatherBanner  = document.getElementById('weatherBanner');
const viewToggle     = document.getElementById('viewToggle');
const tabBeers       = document.getElementById('tabBeers');
const tabMap         = document.getElementById('tabMap');
const mapView        = document.getElementById('mapView');
const geoBtn         = document.getElementById('geoBtn');
const filterBar      = document.getElementById('filterBar');
const filterStyle    = document.getElementById('filterStyle');
const filterSort     = document.getElementById('filterSort');
const filterMinRating = document.getElementById('filterMinRating');
const filterRadius   = document.getElementById('filterRadius');
const filterApply    = document.getElementById('filterApply');
const filterReset    = document.getElementById('filterReset');
const loadMoreWrap   = document.getElementById('loadMoreWrap');
const loadMoreBtn    = document.getElementById('loadMoreBtn');
const loadMoreMeta   = document.getElementById('loadMoreMeta');
const shareBtn       = document.getElementById('shareBtn');
const quickSearches  = document.getElementById('quickSearches');
const qsLabel        = document.getElementById('qsLabel');
const qsChips        = document.getElementById('qsChips');
const filterOpenNow  = document.getElementById('filterOpenNow');

// ── Map state ─────────────────────────────────────────────
let _leafletMap     = null;
let _activeView     = 'beers';
let _lastBreweries  = [];

// ── Search/pagination state ───────────────────────────────
let _lastQuery      = '';
let _currentPage    = 1;
let _totalPages     = 1;
let _activeFilters  = {};

// ── Service Worker registration ───────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Search history ────────────────────────────────────────
const HISTORY_KEY = 'hf_history';
const POPULAR_CITIES = [
  'Austin, TX', 'Denver, CO', 'Portland, OR',
  'San Diego, CA', 'Asheville, NC', 'Chicago, IL',
  'Seattle, WA', 'Nashville, TN',
];

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(q) {
  try {
    const h = [q, ...loadHistory().filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

function renderQuickSearches() {
  const history = loadHistory();
  const hasHistory = history.length > 0;
  const items = hasHistory ? history : POPULAR_CITIES.slice(0, 6);
  qsLabel.textContent = hasHistory ? 'Recent' : 'Popular';
  qsChips.innerHTML = items.map(q =>
    `<button class="qs-chip" data-q="${x(q)}">${x(q)}</button>`
  ).join('');
  // Add a clear button when history exists
  if (hasHistory) {
    qsChips.innerHTML += `<button class="qs-clear" id="qsClear" title="Clear history">✕</button>`;
    document.getElementById('qsClear')?.addEventListener('click', e => {
      e.stopPropagation();
      localStorage.removeItem(HISTORY_KEY);
      renderQuickSearches();
    });
  }
  quickSearches.hidden = false;
}

qsChips.addEventListener('click', e => {
  const chip = e.target.closest('.qs-chip[data-q]');
  if (chip) {
    zipInput.value = chip.dataset.q;
    doSearch(chip.dataset.q);
  }
});

renderQuickSearches();

// ── Share button ──────────────────────────────────────────
shareBtn?.addEventListener('click', async () => {
  const url  = location.href;
  const city = resultsZip.textContent || _lastQuery;
  const shareData = {
    title: `Best craft beers near ${city} — Hops & Finds`,
    text:  `Check out the top-rated craft beers near ${city}!`,
    url,
  };
  try {
    if (navigator.share && navigator.canShare?.(shareData)) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        shareBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share`;
      }, 2000);
    }
  } catch {}
});

// ── Open now toggle ───────────────────────────────────────
let _openNowActive = false;
filterOpenNow?.addEventListener('click', () => {
  _openNowActive = !_openNowActive;
  filterOpenNow.setAttribute('aria-checked', _openNowActive);
  filterOpenNow.classList.toggle('active', _openNowActive);
});

// ── URL state (auto-search on page load from ?q=) ─────────
(function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || params.get('zip');
  if (q) {
    // Wait for DOM to settle then kick off the search
    requestAnimationFrame(() => {
      zipInput.value = q;
      doSearch(q);
    });
  }
})();

// ── Geolocation ───────────────────────────────────────────
geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showFieldError('Geolocation is not supported by your browser.');
    return;
  }
  geoBtn.disabled = true;
  geoBtn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        // Reverse geocode with Nominatim to get a city name
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
        const state = data.address?.state_code || data.address?.state || '';
        const label = city && state ? `${city}, ${state}` : city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        zipInput.value = label;
        clearError();
        doSearch(label);
      } catch {
        // Fall back to raw coords as city search
        zipInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        doSearch(zipInput.value);
      } finally {
        geoBtn.disabled = false;
        geoBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" opacity=".3"/></svg> Use my location`;
      }
    },
    (err) => {
      geoBtn.disabled = false;
      geoBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" opacity=".3"/></svg> Use my location`;
      if (err.code === 1) showFieldError('Location access denied. Please allow location access.');
      else showFieldError('Could not get your location. Try typing it instead.');
    },
    { timeout: 8000, maximumAge: 60000 }
  );
});

// ── Filters ───────────────────────────────────────────────
filterApply.addEventListener('click', () => {
  _activeFilters = {};
  if (filterStyle.value)       _activeFilters.style     = filterStyle.value;
  if (filterSort.value !== 'score') _activeFilters.sort  = filterSort.value;
  if (filterMinRating.value)   _activeFilters.minRating = filterMinRating.value;
  if (filterRadius.value !== '15')  _activeFilters.maxMiles = filterRadius.value;
  const hasFilters = Object.keys(_activeFilters).length > 0 || _openNowActive;
  filterReset.hidden = !hasFilters;
  _currentPage = 1;
  doSearch(_lastQuery, _activeFilters, 1);
});

filterReset.addEventListener('click', () => {
  filterStyle.value     = '';
  filterSort.value      = 'score';
  filterMinRating.value = '';
  filterRadius.value    = '15';
  _activeFilters = {};
  _openNowActive = false;
  filterOpenNow?.classList.remove('active');
  filterOpenNow?.setAttribute('aria-checked', 'false');
  filterReset.hidden = true;
  _currentPage = 1;
  doSearch(_lastQuery, {}, 1);
});

loadMoreBtn.addEventListener('click', () => {
  const nextPage = _currentPage + 1;
  doSearchMore(_lastQuery, _activeFilters, nextPage);
});

function initMap(breweries, centerCoords) {
  _lastBreweries = breweries;
  const el = document.getElementById('breweriesMap');
  if (!el) return;

  // Destroy existing map instance to avoid double-init
  if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }

  const map = L.map('breweriesMap', { zoomControl: true }).setView(
    [centerCoords.lat, centerCoords.lng], 12
  );
  _leafletMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);

  // User location pin
  L.circleMarker([centerCoords.lat, centerCoords.lng], {
    radius: 8, color: '#e8a22a', fillColor: '#f5c94a',
    fillOpacity: 0.9, weight: 2,
  }).addTo(map).bindPopup('<b>Your search location</b>');

  // Custom amber icon for breweries
  const brewIcon = L.divIcon({
    className: '',
    html: `<div class="map-pin">🍺</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  breweries.forEach(b => {
    if (!b.lat || !b.lng) return;
    const topBeer   = b.topBeer;
    const yelpHtml  = b.yelpRating
      ? `<div class="map-yelp">⭐ ${b.yelpRating} Yelp · ${b.yelpReviewCount} reviews${b.priceRange ? ' · ' + b.priceRange : ''}</div>`
      : '';
    const fsqHtml   = b.fsqCheckins
      ? `<div class="map-fsq">🏃 ${b.fsqCheckins.toLocaleString()} check-ins</div>`
      : '';
    const hoursHtml = b.hours?.todayHours
      ? `<div class="map-hours">${b.hours.todayHours}</div>`
      : '';
    const photoHtml = b.imageUrl
      ? `<img src="${x(b.imageUrl)}" class="map-photo" alt="${x(b.name)}" loading="lazy"/>`
      : '';
    const beerHtml  = topBeer
      ? `<div class="map-beer">🏆 ${x(topBeer.name)} <span class="map-beer-style">${x(topBeer.style || '')}</span></div>`
      : '';
    const websiteHtml = b.website
      ? `<a href="${x(b.website)}" target="_blank" rel="noopener" class="map-link">Visit website →</a>`
      : '';

    L.marker([b.lat, b.lng], { icon: brewIcon })
      .addTo(map)
      .bindPopup(`
        <div class="map-popup">
          ${photoHtml}
          <div class="map-popup-body">
            <strong class="map-name">${x(b.name)}</strong>
            <div class="map-dist">${b.distanceMiles} mi · ${driveTime(b.distanceMiles)}</div>
            ${yelpHtml}${fsqHtml}${hoursHtml}${beerHtml}${websiteHtml}
          </div>
        </div>`, { maxWidth: 260 });
  });

  // Fit map to brewery bounds if we have markers
  const pts = breweries.filter(b => b.lat && b.lng).map(b => [b.lat, b.lng]);
  if (pts.length > 1) {
    try { map.fitBounds(L.latLngBounds(pts).pad(0.15)); } catch {}
  }
}

function setView(view) {
  _activeView = view;
  const showBeers = view === 'beers';
  featuredWrap.hidden    = !showBeers;
  secGrid.hidden         = !showBeers;
  mapView.hidden         = showBeers;
  tabBeers.classList.toggle('active', showBeers);
  tabMap.classList.toggle('active', !showBeers);

  if (!showBeers && _lastBreweries.length && window._lastCoords) {
    // Lazy-init map on first view
    requestAnimationFrame(() => {
      initMap(_lastBreweries, window._lastCoords);
    });
  }
}

viewToggle.addEventListener('click', e => {
  const tab = e.target.closest('.vtab[data-view]');
  if (tab) setView(tab.dataset.view);
});

// ── Taste Quiz ────────────────────────────────────────────
const QUIZ_KEY   = 'hf_prefs';
const WISHLIST_KEY = 'hf_wishlist';

let quizAnswers = [null, null, null];
let quizStep    = 0;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(QUIZ_KEY)) || null; }
  catch { return null; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(prefs)); } catch {}
}
function clearPrefs() {
  try { localStorage.removeItem(QUIZ_KEY); } catch {}
}

function updateQuizChip() {
  const prefs = loadPrefs();
  if (!quizChip) return;
  if (prefs) {
    quizChip.classList.add('active');
    quizChip.textContent = '🎯 Taste Profile: On';
    quizChip.title = 'Click to update your taste profile';
  } else {
    quizChip.classList.remove('active');
    quizChip.textContent = '🎯 Match My Taste';
    quizChip.title = '';
  }
}
updateQuizChip();

function openQuiz() {
  quizAnswers = [null, null, null];
  quizStep    = 0;
  const steps = quizOverlay.querySelectorAll('.quiz-step');
  steps.forEach((s, i) => {
    s.classList.toggle('active', i === 0);
    s.querySelectorAll('.quiz-opt').forEach(b => b.classList.remove('selected'));
  });
  quizBar.style.width = '33%';
  quizOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeQuiz() {
  quizOverlay.hidden = true;
  document.body.style.overflow = '';
}

function advanceQuiz(step, val) {
  quizAnswers[step] = val;
  // Highlight selected
  quizOverlay.querySelectorAll(`.quiz-opt[data-step="${step}"]`).forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.val) === val);
  });

  setTimeout(() => {
    const nextStep = step + 1;
    if (nextStep < 3) {
      quizStep = nextStep;
      quizOverlay.querySelectorAll('.quiz-step').forEach((s, i) => {
        s.classList.toggle('active', i === nextStep);
      });
      quizBar.style.width = `${Math.round((nextStep + 1) / 3 * 100)}%`;
    } else {
      // All done — save prefs
      const prefs = { bitter: quizAnswers[0], dark: quizAnswers[1], flavor: quizAnswers[2] };
      savePrefs(prefs);
      updateQuizChip();
      closeQuiz();
      // Re-render results if already showing
      const beers = window._lastTopBeers;
      if (beers) {
        const ranked = applyQuizRanking(beers, prefs);
        rerenderBeers(ranked);
        showPersonalizedBanner();
      }
    }
  }, 220);
}

quizOverlay.addEventListener('click', e => {
  const opt = e.target.closest('.quiz-opt[data-step]');
  if (opt) { advanceQuiz(parseInt(opt.dataset.step), parseInt(opt.dataset.val)); return; }
  if (e.target === quizOverlay) closeQuiz();
});
quizClose.addEventListener('click', closeQuiz);
quizChip.addEventListener('click', openQuiz);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!quizOverlay.hidden) { closeQuiz(); return; }
    if (!detailOverlay.hidden) { closeDetail(); return; }
  }
});

// ── Quiz ranking logic ────────────────────────────────────
// Style → quiz dimension compatibility scores
const STYLE_BITTER = {
  'Hazy IPA': 2, 'Double IPA': 4, 'West Coast IPA': 3, 'Session IPA': 2,
  'IPA': 3, 'Imperial Stout': 2, 'Stout': 2, 'Pale Ale': 2,
  'Barleywine': 3, 'Sour': 0, 'Wheat': 1, 'Lager': 1, 'Amber / Red': 1,
  'Brown Ale': 1, 'Belgian': 1, 'Cider': 0, 'Mead': 0,
};
const STYLE_DARK = {
  'Imperial Stout': 2, 'Stout': 2, 'Brown Ale': 2, 'Barleywine': 2,
  'Amber / Red': 1, 'Belgian': 1, 'Pale Ale': 1, 'IPA': 1,
  'West Coast IPA': 1, 'Double IPA': 1, 'Hazy IPA': 1, 'Session IPA': 0,
  'Lager': 0, 'Wheat': 0, 'Sour': 0, 'Cider': 0, 'Mead': 0,
};
const STYLE_FLAVOR = { // 0=fruity, 1=malty, 2=tart
  'Hazy IPA': 0, 'West Coast IPA': 0, 'Session IPA': 0, 'Sour': 2,
  'Belgian': 2, 'Wheat': 0, 'Double IPA': 0,
  'IPA': 0, 'Pale Ale': 0,
  'Brown Ale': 1, 'Amber / Red': 1, 'Barleywine': 1, 'Lager': 1,
  'Imperial Stout': 1, 'Stout': 1, 'Cider': 0, 'Mead': 0,
};

function quizMultiplier(beer, prefs) {
  const style = beer.style_category || '';
  let m = 1.0;

  // Bitterness: pref 0=low, 1=med, 2=high; style level 0-4
  const bLvl = STYLE_BITTER[style] ?? 1;
  const bPref = prefs.bitter;
  if (bPref === 0 && bLvl <= 1) m += 0.15;
  else if (bPref === 0 && bLvl >= 3) m -= 0.18;
  else if (bPref === 1 && bLvl === 2) m += 0.08;
  else if (bPref === 2 && bLvl >= 3) m += 0.15;
  else if (bPref === 2 && bLvl <= 1) m -= 0.12;

  // Darkness: pref 0=light, 1=medium, 2=dark; style 0-2
  const dLvl = STYLE_DARK[style] ?? 1;
  const dPref = prefs.dark;
  if (dPref === 0 && dLvl === 0) m += 0.12;
  else if (dPref === 0 && dLvl === 2) m -= 0.15;
  else if (dPref === 1 && dLvl === 1) m += 0.08;
  else if (dPref === 2 && dLvl === 2) m += 0.12;
  else if (dPref === 2 && dLvl === 0) m -= 0.12;

  // Flavor match: 0=fruity, 1=malty, 2=tart
  const fPref = prefs.flavor;
  const fMatch = STYLE_FLAVOR[style];
  if (fMatch === fPref) m += 0.10;
  else if (Math.abs((fMatch ?? 1) - fPref) === 2) m -= 0.08;

  return Math.max(0.55, Math.min(1.45, m));
}

function applyQuizRanking(beers, prefs) {
  if (!prefs) return beers;
  return [...beers]
    .map(b => ({ ...b, _quizScore: b.score * quizMultiplier(b, prefs) }))
    .sort((a, b) => b._quizScore - a._quizScore);
}

function showPersonalizedBanner() {
  const banner = document.getElementById('personalizedBanner');
  if (banner) { banner.hidden = false; return; }
  const b = document.createElement('div');
  b.id = 'personalizedBanner';
  b.className = 'personalized-banner';
  b.innerHTML = '🎯 Results personalized to your taste profile &nbsp;<button class="pb-reset" id="pbReset">Reset</button>';
  const inner = document.querySelector('.results-inner');
  if (inner) inner.insertBefore(b, inner.firstChild);
  document.getElementById('pbReset')?.addEventListener('click', () => {
    clearPrefs();
    updateQuizChip();
    b.hidden = true;
    if (window._lastTopBeers) rerenderBeers(window._lastTopBeers);
  });
}

// ── Wishlist ──────────────────────────────────────────────
function loadWishlist() {
  try { return new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY)) || []); }
  catch { return new Set(); }
}
function saveWishlist(set) {
  try { localStorage.setItem(WISHLIST_KEY, JSON.stringify([...set])); } catch {}
}
function toggleWishlist(beerId) {
  const wl = loadWishlist();
  if (wl.has(beerId)) wl.delete(beerId);
  else wl.add(beerId);
  saveWishlist(wl);
  return wl.has(beerId);
}
function isWishlisted(beerId) {
  return loadWishlist().has(beerId);
}

// ── Form submit ───────────────────────────────────────────
form.addEventListener('submit', e => {
  e.preventDefault();
  const q = zipInput.value.trim();
  if (!q) {
    searchField.classList.add('invalid');
    showFieldError('Enter a ZIP code or city name.');
    return;
  }
  clearError();
  doSearch(q);
});

zipInput.addEventListener('input', () => {
  searchField.classList.remove('invalid');
  clearError();
});

newSearchBtn.addEventListener('click', goHome);
emptyBack.addEventListener('click', goHome);
errorBack.addEventListener('click', goHome);

// ── Search ────────────────────────────────────────────────
function buildSearchUrl(q, filters = {}, page = 1) {
  const p = new URLSearchParams({ q });
  if (filters.style)     p.set('style',     filters.style);
  if (filters.sort)      p.set('sort',      filters.sort);
  if (filters.minRating) p.set('minRating', filters.minRating);
  if (filters.maxMiles)  p.set('maxMiles',  filters.maxMiles);
  if (page > 1)          p.set('page',      page);
  p.set('limit', '8');
  return `/search?${p}`;
}

async function doSearch(q, filters = {}, page = 1) {
  _lastQuery = q;
  _activeFilters = filters;
  _currentPage = page;
  setLoading(true);
  hideAll();
  skeleton.hidden = false;
  hero.hidden = true;
  quickSearches.hidden = true;

  // Save to search history and push URL state
  saveHistory(q);
  const urlParams = new URLSearchParams({ q });
  history.replaceState(null, '', `?${urlParams}`);

  try {
    const res  = await fetch(buildSearchUrl(q, filters, page));
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Server error'), { status: res.status });
    renderResults(data);
  } catch (err) {
    showError(
      err.status === 400 ? 'Location not found' : 'Could not load results',
      err.message || 'Check your connection and try again.'
    );
  } finally {
    setLoading(false);
    skeleton.hidden = true;
  }
}

async function doSearchMore(q, filters = {}, page = 1) {
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Loading…';

  try {
    const res  = await fetch(buildSearchUrl(q, filters, page));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    _currentPage = page;
    _totalPages  = data.meta?.totalPages || 1;

    const prefs  = loadPrefs();
    const ranked = applyQuizRanking(data.topBeers || [], prefs);

    // Append to existing grids (skip #1 on subsequent pages)
    const startRank = (page - 1) * 8 + 1;
    ranked.forEach((beer, i) => {
      secGrid.appendChild(buildSecCard(beer, startRank + i + 1));
    });

    // Accumulate in window cache for quiz re-ranking awareness
    if (window._lastTopBeers) window._lastTopBeers = [...window._lastTopBeers, ...data.topBeers];

    updateLoadMore(data.meta);
    requestAnimationFrame(() => setTimeout(animateFills, 80));
  } catch (err) {
    loadMoreBtn.textContent = 'Error — tap to retry';
  } finally {
    loadMoreBtn.disabled = false;
  }
}

function updateLoadMore(meta) {
  if (!meta) { loadMoreWrap.hidden = true; return; }
  _totalPages = meta.totalPages || 1;
  const shown = Math.min(_currentPage * 8, meta.totalBeers || meta.beerCount || 0);
  const total = meta.totalBeers || meta.beerCount || 0;
  if (_currentPage < _totalPages) {
    loadMoreWrap.hidden = false;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load more beers';
    loadMoreMeta.textContent = `Showing ${shown} of ${total}`;
  } else {
    loadMoreWrap.hidden = total <= 8;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'All beers loaded';
    loadMoreMeta.textContent = `${total} beers total`;
  }
}

// ── Render results ────────────────────────────────────────
function renderResults(data) {
  if (!data.topBeers?.length) { emptyState.hidden = false; return; }

  mockBadge.hidden = !data.mock;
  // Show displayName (city/address) or fall back to raw query
  resultsZip.textContent = data.displayName || data.zip;

  // Store coords so beer detail requests can filter similar beers by distance
  window._lastCoords = data.coords || null;

  // Show filter bar
  filterBar.hidden = false;
  filterReset.hidden = Object.keys(_activeFilters).length === 0;

  metaBar.innerHTML = [
    tag(`🏭 ${data.meta.breweryCount} breweries`),
    tag(`🍺 ${data.meta.beerCount} beers scored`),
    tag(`📍 ${data.meta.radiusMiles} mi radius`),
    data.meta.fromCache ? tag('⚡ Cached', true) : '',
    data.mock ? tag('DEMO', true) : '',
    process.env?.YELP_API_KEY ? tag('Yelp', true) : '',
  ].filter(Boolean).join('');

  // Weather banner
  if (data.weather) {
    const w = data.weather;
    weatherBanner.hidden = false;
    weatherBanner.innerHTML = `
      <span class="wb-icon">${w.emoji}</span>
      <span class="wb-temp">${w.tempF}°F</span>
      <span class="wb-sep">·</span>
      <span class="wb-label">${x(w.label)}</span>
      <span class="wb-sep">·</span>
      <span class="wb-mood">${x(w.mood)} beers recommended</span>
      <span class="wb-tip">${x(w.tip)}</span>`;
  } else {
    weatherBanner.hidden = true;
  }

  // Build brewery list for map (attach top beer to each brewery)
  const breweryMap = new Map();
  const beersForMap = data.topBeers || [];
  beersForMap.forEach(beer => {
    if (!breweryMap.has(beer.breweryId)) {
      breweryMap.set(beer.breweryId, {
        id:            beer.breweryId,
        name:          beer.breweryName,
        address:       beer.breweryAddress,
        website:       beer.breweryWebsite,
        lat:           beer.breweryLat || null,
        lng:           beer.breweryLng || null,
        distanceMiles: beer.distanceMiles,
        yelpRating:    beer.yelpRating    || null,
        yelpReviewCount: beer.yelpReviewCount || null,
        yelpUrl:       beer.yelpUrl       || null,
        imageUrl:      beer.imageUrl      || null,
        priceRange:    beer.priceRange    || null,
        hours:         beer.hours         || null,
        fsqCheckins:   beer.fsqCheckins   ?? null,
        fsqPopularity: beer.fsqPopularity ?? null,
        breweryType:   beer.breweryType   || null,
        topBeer:       { name: beer.name, style: beer.style },
      });
    }
  });
  window._lastBreweryMap = breweryMap;
  _lastBreweries = [...breweryMap.values()];

  // Show map toggle only if we have coords
  viewToggle.hidden = !data.coords;
  _activeView = 'beers';
  tabBeers.classList.add('active');
  tabMap.classList.remove('active');
  featuredWrap.hidden = false;
  secGrid.hidden = false;
  mapView.hidden = true;

  // Store for quiz re-ranking
  window._lastTopBeers = data.topBeers;

  const prefs = loadPrefs();
  const ranked = applyQuizRanking(data.topBeers, prefs);

  rerenderBeers(ranked);
  if (prefs) showPersonalizedBanner();

  const evs = (data.allEvents || []).slice(0, 9);
  if (evs.length) {
    eventsGrid.innerHTML = '';
    evs.forEach(ev => eventsGrid.appendChild(buildEventCard(ev)));
    eventsSection.hidden = false;
  }

  updateLoadMore(data.meta);

  results.hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
  requestAnimationFrame(() => setTimeout(animateFills, 80));
}

function rerenderBeers(beers) {
  // Client-side "open now" filter — hides breweries Yelp marks as closed
  const filtered = _openNowActive
    ? beers.filter(b => b.isClosed === false || b.isClosed == null)
    : beers;

  const list = filtered.length ? filtered : beers; // fall back if all filtered out

  featuredWrap.innerHTML = '';
  featuredWrap.appendChild(buildFeaturedCard(list[0]));

  secGrid.innerHTML = '';
  list.slice(1).forEach((beer, i) => secGrid.appendChild(buildSecCard(beer, i + 2)));

  requestAnimationFrame(() => setTimeout(animateFills, 80));
}

function animateFills() {
  document.querySelectorAll('.sec-bar-fill[data-pct]').forEach(el => {
    el.style.width = el.dataset.pct + '%';
  });
  document.querySelectorAll('.glass-fill[data-target-h]').forEach(el => {
    el.setAttribute('height', el.dataset.targetH);
    el.setAttribute('y', el.dataset.targetY);
  });
  document.querySelectorAll('.detail-abv-fill[data-pct]').forEach(el => {
    el.style.width = el.dataset.pct + '%';
  });
}

// ── Beer detail sheet ─────────────────────────────────────
async function openBeerDetail(beerId, beerName, beerData) {
  detailContent.innerHTML = buildDetailSkeleton(beerName);
  detailOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  try {
    const coords = window._lastCoords;
    const params = new URLSearchParams();

    // Always send location for similar-beers filtering
    if (coords?.lat && coords?.lng) {
      params.set('lat', coords.lat.toFixed(5));
      params.set('lng', coords.lng.toFixed(5));
      params.set('radius', '50');
    }

    // Pass full beer data as fallback so the server can reconstruct the
    // response on a cold serverless start when the DB/stub cache is empty
    if (beerData) {
      params.set('name',           beerData.name          || '');
      params.set('style',          beerData.style         || '');
      params.set('styleCategory',  beerData.style_category|| beerData.styleCategory || '');
      params.set('abv',            beerData.abv           || '');
      params.set('rating',         beerData.rating        || '');
      params.set('reviewCount',    beerData.reviewCount   || '');
      params.set('breweryId',      beerData.breweryId     || '');
      params.set('breweryName',    beerData.breweryName   || '');
      params.set('breweryAddress', beerData.breweryAddress|| '');
      params.set('breweryWebsite', beerData.breweryWebsite|| '');
      if (beerData.ibuLabel)    params.set('ibuLabel',    beerData.ibuLabel);
      if (beerData.ibuLevel != null) params.set('ibuLevel', beerData.ibuLevel);
      if (beerData.ibuRange)    params.set('ibuRange',    beerData.ibuRange);
      if (beerData.foodPairing) params.set('foodPairing', beerData.foodPairing);
      if (beerData.isSeasonal)  params.set('isSeasonal',  'true');
      if (beerData.seasonType)  params.set('seasonType',  beerData.seasonType);
      if (beerData.seasonEmoji) params.set('seasonEmoji', beerData.seasonEmoji);
      if (beerData.isHiddenGem) params.set('isHiddenGem', 'true');
    }

    const qs  = params.toString();
    const res = await fetch(`/beer/${encodeURIComponent(beerId)}${qs ? '?' + qs : ''}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Not found');
    detailContent.innerHTML = buildDetailHTML(data);
    requestAnimationFrame(() => setTimeout(animateFills, 60));
  } catch (err) {
    detailContent.innerHTML = `<p class="detail-error">Couldn't load beer details: ${x(err.message)}</p>`;
  }
}

function closeDetail() {
  detailOverlay.classList.add('closing');
  setTimeout(() => {
    detailOverlay.hidden = true;
    detailOverlay.classList.remove('closing');
    document.body.style.overflow = '';
  }, 150);
}

detailClose.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) closeDetail(); });

function buildDetailSkeleton(name) {
  return `
    <div class="detail-loading">
      <div class="detail-sk">
        <div class="detail-sk-title">${x(name || 'Loading…')}</div>
        <div class="detail-sk-sub"></div>
        <div class="detail-sk-bar"></div>
        <div class="detail-sk-bar" style="width:60%"></div>
      </div>
    </div>`;
}

function buildDetailHTML(data) {
  const { beer, brewery, events, similar } = data;

  // IBU bitterness bar (level 0-4 → 0-100%)
  const ibuPct   = Math.round((beer.ibuLevel ?? 2) / 4 * 100);
  const ibuLabel = beer.ibuLabel || '';
  const ibuRange = beer.ibuRange || '';

  // Style description panel
  const styleDescHTML = beer.styleDescription ? `
    <div class="detail-section detail-style-desc">
      <div class="detail-section-label">📖 About ${x(beer.styleCategory || beer.style)}</div>
      <p class="style-desc-text">${x(beer.styleDescription)}</p>
    </div>` : '';

  const evHTML = events.length ? `
    <div class="detail-section">
      <div class="detail-section-label">📅 Upcoming Events</div>
      <div class="detail-events-list">
        ${events.map(ev => {
          const nameEl = ev.url
            ? `<a href="${x(ev.url)}" target="_blank" rel="noopener" class="dev-link">${x(ev.name)}</a>`
            : `<span class="dev-link">${x(ev.name)}</span>`;
          return `<div class="detail-event-row">
            ${ev.date ? `<div class="dev-date-badge">
              <span class="ev-day">${fmtDay(ev.date)}</span>
              <span class="ev-month">${fmtMonth(ev.date)}</span>
            </div>` : ''}
            <div class="dev-body">${nameEl}${ev.date ? `<span class="dev-time">🕐 ${fmtTime(ev.date)}</span>` : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const simHTML = similar.length ? `
    <div class="detail-section">
      <div class="detail-section-label">🍺 Similar Beers Nearby</div>
      <div class="detail-similar-grid">
        ${similar.map(s => `
          <div class="dsim-card clickable-card" data-beer-id="${x(s.id)}" data-beer-name="${x(s.name)}" role="button" tabindex="0">
            <div class="dsim-name">${x(s.name)}</div>
            <div class="dsim-meta">
              <span class="style-chip" style="font-size:.52rem">${x(s.style)}</span>
            </div>
            <div class="dsim-rating">★ ${s.rating.toFixed(2)}</div>
            <div class="dsim-brewery">${x(s.breweryName)}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const foodHTML = beer.foodPairing ? `
    <div class="detail-section">
      <div class="detail-section-label">🍽️ Pairs Well With</div>
      <div class="detail-food-pairing">${x(beer.foodPairing)}</div>
    </div>` : '';

  const seasonHTML = beer.isSeasonal ? `
    <span class="seasonal-badge">${x(beer.seasonEmoji || '⭐')} ${x(beer.seasonType)}</span>` : '';

  const gemHTML = beer.isHiddenGem ? `
    <span class="gem-badge">💎 Hidden Gem</span>` : '';

  return `
    <div class="detail-hero-section">
      <div class="detail-tags">
        <span class="style-chip">${x(beer.style)}</span>
        <span class="abv-chip">ABV ${beer.abv}%</span>
        ${ibuLabel ? `<span class="ibu-chip ibu-level-${beer.ibuLevel ?? 1}" title="${x(ibuRange)}">${x(ibuLabel)}</span>` : ''}
        ${gemHTML}${seasonHTML}
      </div>
      <h2 class="detail-beer-name">${x(beer.name)}</h2>
      <div class="detail-rating-row">
        ${stars(beer.rating, 20)}
        <span class="rating-val">${beer.rating.toFixed(2)}</span>
        <span class="review-ct">${beer.reviewCount.toLocaleString()} reviews</span>
      </div>

      <div class="detail-abv-bar-wrap">
        <div class="detail-bar-label-row">
          <span class="detail-bar-label-txt">ABV</span>
          <span class="detail-bar-val">${beer.abv}%</span>
        </div>
        <div class="detail-abv-track">
          <div class="detail-abv-fill" data-pct="${Math.min(beer.abv / 15 * 100, 100).toFixed(1)}" style="width:0%"></div>
        </div>
        <div class="detail-abv-labels"><span>0% Light</span><span>15%+ Strong</span></div>
      </div>

      ${ibuLabel ? `<div class="detail-abv-bar-wrap" style="margin-top:.75rem">
        <div class="detail-bar-label-row">
          <span class="detail-bar-label-txt">Bitterness</span>
          <span class="detail-bar-val">${x(ibuLabel)}${ibuRange ? ` · ${x(ibuRange)}` : ''}</span>
        </div>
        <div class="detail-abv-track">
          <div class="detail-abv-fill detail-ibu-fill ibu-fill-level-${beer.ibuLevel ?? 1}" data-pct="${ibuPct}" style="width:0%"></div>
        </div>
        <div class="detail-abv-labels"><span>Not bitter</span><span>Very bitter</span></div>
      </div>` : ''}
    </div>

    <div class="detail-section detail-brewery-section">
      <div class="detail-section-label">🏭 Brewery · ${driveTime(brewery.distanceMiles || 0)}</div>
      <div class="detail-brewery-row">
        <div class="detail-brewery-info">
          ${brewery.website
            ? `<a href="${x(brewery.website)}" target="_blank" rel="noopener" class="detail-brewery-name-link">${x(brewery.name)}</a>`
            : `<span class="detail-brewery-name-link">${x(brewery.name)}</span>`}
          ${brewery.address ? `<span class="detail-brewery-addr">${x(brewery.address)}</span>` : ''}
        </div>
        <div class="detail-brewery-btns">
          ${brewery.website ? `<a href="${x(brewery.website)}" target="_blank" rel="noopener" class="detail-visit-btn">Visit →</a>` : ''}
          ${brewery.address ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(brewery.address)}" target="_blank" rel="noopener" class="detail-directions-btn">📍 Directions</a>` : ''}
        </div>
      </div>
    </div>

    ${styleDescHTML}
    ${foodHTML}
    ${evHTML}
    ${simHTML}`;
}

// Delegate clicks on similar beer cards inside the detail sheet
detailContent.addEventListener('click', e => {
  const card = e.target.closest('.dsim-card[data-beer-id]');
  if (card) { detailSheet.scrollTop = 0; openBeerDetail(card.dataset.beerId, card.dataset.beerName, window._beerCache?.[card.dataset.beerId]); }
});
detailContent.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const card = e.target.closest('.dsim-card[data-beer-id]');
    if (card) { detailSheet.scrollTop = 0; openBeerDetail(card.dataset.beerId, card.dataset.beerName, window._beerCache?.[card.dataset.beerId]); }
  }
});

// ── Beer cache (fallback for cold serverless starts) ──────
function cacheBeer(beer) {
  if (!beer?.id) return;
  if (!window._beerCache) window._beerCache = {};
  window._beerCache[beer.id] = beer;
}

// ── Featured card ─────────────────────────────────────────
function buildFeaturedCard(beer) {
  cacheBeer(beer);
  const pct  = Math.round(beer.score * 100);
  const glH  = Math.round(pct * 0.5);
  const glY  = 60 - glH;
  const bLink = beer.breweryWebsite
    ? `<a class="brewery-name-link" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="brewery-name-link">${x(beer.breweryName)}</span>`;
  const wl = isWishlisted(beer.id);

  const div = document.createElement('div');
  div.className = 'featured-card clickable-card';
  if (beer.id) {
    div.dataset.beerId   = beer.id;
    div.dataset.beerName = beer.name;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.title = 'Click for details';
  }
  div.innerHTML = `
    <div class="fc-band">
      <div class="fc-rank-num">01</div>
      <div class="fc-rank-label">Best Match</div>
    </div>
    <div class="fc-body">
      <div class="fc-name-row">
        <div class="fc-name">${x(beer.name)}</div>
        ${beer.id ? `<button class="wishlist-btn${wl ? ' active' : ''}" data-beer-id="${x(beer.id)}" aria-label="${wl ? 'Remove from wishlist' : 'Add to wishlist'}" title="${wl ? 'Saved' : 'Save beer'}">
          ${heartSVG(wl)}
        </button>` : ''}
      </div>
      <div class="tags-row">
        <span class="style-chip">${x(beer.style)}</span>
        <span class="abv-chip">ABV ${beer.abv}%</span>
        ${beer.ibuLabel ? `<span class="ibu-chip ibu-level-${beer.ibuLevel ?? 1}">${x(beer.ibuLabel)}</span>` : ''}
        ${beer.isSeasonal ? `<span class="seasonal-badge">${x(beer.seasonEmoji)} ${x(beer.seasonType)}</span>` : ''}
        ${beer.isHiddenGem ? '<span class="gem-badge">💎 Hidden Gem</span>' : ''}
        ${beer.weatherMatch ? '<span class="weather-match-badge">🌡️ Weather Pick</span>' : ''}
      </div>
      <div class="rating-row">
        ${stars(beer.rating, 20)}
        <span class="rating-val">${beer.rating.toFixed(2)}</span>
        <span class="review-ct">${beer.reviewCount.toLocaleString()} reviews</span>
        ${beer.yelpRating ? `<span class="yelp-pill" title="Yelp rating">★ ${beer.yelpRating} <span class="yelp-label">Yelp</span></span>` : ''}
      </div>
      ${beer.imageUrl ? `<div class="brewery-photo-wrap"><img src="${x(beer.imageUrl)}" class="brewery-photo" alt="${x(beer.breweryName)}" loading="lazy"/></div>` : ''}
      <div class="brewery-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--muted);flex-shrink:0"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${bLink}
        <span class="dist-pill">${beer.distanceMiles} mi · ${driveTime(beer.distanceMiles)}</span>
        ${beer.priceRange ? `<span class="price-pill">${x(beer.priceRange)}</span>` : ''}
        ${beer.breweryAddress ? `<a class="directions-link" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(beer.breweryAddress)}" target="_blank" rel="noopener" title="Get directions">📍 Directions</a>` : ''}
      </div>
      ${beer.hours?.todayHours ? `<div class="hours-row">${beer.isClosed ? '🔴' : '🟢'} ${x(beer.hours.todayHours)}</div>` : ''}
      ${beer.fsqCheckins ? `<div class="checkins-row">🏃 ${beer.fsqCheckins.toLocaleString()} Foursquare check-ins</div>` : ''}
      ${beer.breweryType ? `<div class="brewery-type-badge">${breweryTypeLabel(beer.breweryType)}</div>` : ''}
      ${cardEvents(beer.events)}
      ${beer.id ? '<div class="tap-detail-hint">Tap for details →</div>' : ''}
    </div>
    <div class="fc-score">
      <div class="score-label">Intel<br/>Score</div>
      <div class="glass-wrap">
        <svg class="glass-svg" viewBox="0 0 56 80" aria-label="Score ${pct} out of 100">
          <rect class="glass-fill" x="6" y="60" width="44" height="0" rx="2"
            fill="url(#beerGrad)" opacity="0.85"
            data-target-h="${glH}" data-target-y="${glY}"/>
          <ellipse cx="28" cy="${glY}" rx="22" ry="4" fill="rgba(245,240,220,0.25)"/>
          <path d="M6 8 L10 72 Q10 76 14 76 L42 76 Q46 76 46 72 L50 8 Z"
            fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
          <path d="M10 10 L12 60" stroke="rgba(255,255,255,0.06)" stroke-width="3" stroke-linecap="round"/>
          <path d="M50 20 Q62 20 62 32 Q62 44 50 44" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2.5"/>
          <defs>
            <linearGradient id="beerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f5c94a"/>
              <stop offset="100%" stop-color="#a06010"/>
            </linearGradient>
          </defs>
        </svg>
        <div class="glass-pct">${pct}</div>
      </div>
    </div>`;
  return div;
}

// ── Secondary card ─────────────────────────────────────────
function buildSecCard(beer, rank) {
  cacheBeer(beer);
  const pct   = Math.round(beer.score * 100);
  const bLink = beer.breweryWebsite
    ? `<a class="sec-brewery" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="sec-brewery">${x(beer.breweryName)}</span>`;
  const rankStr = rank < 10 ? `0${rank}` : `${rank}`;
  const wl = isWishlisted(beer.id);

  const div = document.createElement('div');
  div.className = 'sec-card clickable-card';
  if (beer.id) {
    div.dataset.beerId   = beer.id;
    div.dataset.beerName = beer.name;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.title = 'Click for details';
  }
  div.innerHTML = `
    <div class="sec-ghost-rank">${rankStr}</div>
    <div class="sec-header">
      <div class="sec-rank-tab">${rankStr}</div>
      <div class="sec-style-area">
        <div class="tags-row" style="margin-bottom:0;flex-wrap:wrap;gap:.3rem">
          <span class="style-chip" style="font-size:.55rem">${x(beer.style)}</span>
          <span class="abv-chip" style="font-size:.55rem">ABV ${beer.abv}%</span>
          ${beer.ibuLabel ? `<span class="ibu-chip ibu-level-${beer.ibuLevel ?? 1}" style="font-size:.52rem">${x(beer.ibuLabel)}</span>` : ''}
          ${beer.isSeasonal ? `<span class="seasonal-badge" style="font-size:.5rem">${x(beer.seasonEmoji)}</span>` : ''}
          ${beer.isHiddenGem ? '<span class="gem-badge" style="font-size:.5rem">💎</span>' : ''}
          ${beer.weatherMatch ? '<span class="weather-match-badge" style="font-size:.5rem">🌡️</span>' : ''}
        </div>
      </div>
      ${beer.id ? `<button class="wishlist-btn wishlist-btn-sm${wl ? ' active' : ''}" data-beer-id="${x(beer.id)}" aria-label="${wl ? 'Remove from wishlist' : 'Save beer'}">
        ${heartSVG(wl)}
      </button>` : ''}
    </div>
    <div class="sec-body">
      <div class="sec-name">${x(beer.name)}</div>
      <div class="sec-rating-row">
        ${stars(beer.rating, 14)}
        <span class="sec-rating-val">${beer.rating.toFixed(2)}</span>
        <span class="sec-reviews">(${beer.reviewCount.toLocaleString()})</span>
        ${beer.yelpRating ? `<span class="yelp-pill yelp-pill-sm" title="Yelp rating">★ ${beer.yelpRating}</span>` : ''}
      </div>
      <div class="sec-bar-wrap">
        <div class="sec-bar-row">
          <span class="sec-bar-label">Score</span>
          <span class="sec-bar-pct">${pct}</span>
        </div>
        <div class="sec-bar-track">
          <div class="sec-bar-fill" data-pct="${pct}" style="width:0%"></div>
        </div>
      </div>
      <div class="sec-footer">
        ${bLink}
        <span class="dist-pill">${beer.distanceMiles} mi</span>
      </div>
      ${beer.id ? '<div class="tap-detail-hint">Tap for details →</div>' : ''}
    </div>`;
  return div;
}

// ── Wishlist button clicks (delegated) ────────────────────
document.addEventListener('click', e => {
  // Wishlist toggle
  const wBtn = e.target.closest('.wishlist-btn[data-beer-id]');
  if (wBtn) {
    e.stopPropagation();
    const beerId = wBtn.dataset.beerId;
    const nowSaved = toggleWishlist(beerId);
    // Update all wishlist buttons for this beer
    document.querySelectorAll(`.wishlist-btn[data-beer-id="${CSS.escape(beerId)}"]`).forEach(b => {
      b.classList.toggle('active', nowSaved);
      b.setAttribute('aria-label', nowSaved ? 'Remove from wishlist' : 'Add to wishlist');
      b.innerHTML = heartSVG(nowSaved);
    });
    return;
  }

  // Beer card click → open detail
  const card = e.target.closest('.clickable-card[data-beer-id]');
  if (!card) return;
  if (e.target.closest('a') || e.target.closest('.wishlist-btn')) return;
  openBeerDetail(card.dataset.beerId, card.dataset.beerName, window._beerCache?.[card.dataset.beerId]);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const card = e.target.closest('.clickable-card[data-beer-id]');
  if (card && !e.target.closest('.wishlist-btn'))
    openBeerDetail(card.dataset.beerId, card.dataset.beerName, window._beerCache?.[card.dataset.beerId]);
});

// ── Event card ────────────────────────────────────────────
function buildEventCard(ev) {
  const srcCls  = ev.source === 'eventbrite' ? 'ev-eb' : ev.source === 'ticketmaster' ? 'ev-tm' : 'ev-sc';
  const srcText = ev.source === 'eventbrite' ? 'Eventbrite' : ev.source === 'ticketmaster' ? 'Ticketmaster' : 'Brewery';

  const namePart = ev.url && ev.url !== '#'
    ? `<a class="ev-name" href="${x(ev.url)}" target="_blank" rel="noopener">${x(ev.name)}</a>`
    : `<div class="ev-name">${x(ev.name)}</div>`;

  const div = document.createElement('div');
  div.className = 'ev-card';
  div.innerHTML = `
    <div class="ev-top">
      ${ev.date
        ? `<div class="ev-date-badge">
            <span class="ev-day">${fmtDay(ev.date)}</span>
            <span class="ev-month">${fmtMonth(ev.date)}</span>
          </div>`
        : `<div class="ev-date-badge"><span class="ev-day">?</span><span class="ev-month">TBD</span></div>`}
      <div class="ev-main">
        <span class="ev-source ${srcCls}">${srcText}</span>
        ${namePart}
        ${ev.breweryName ? `<span class="ev-brewery">🏭 ${x(ev.breweryName)}</span>` : ''}
        ${ev.date ? `<span class="ev-time-str">🕐 ${fmtTime(ev.date)}</span>` : ''}
      </div>
    </div>
    ${ev.url && ev.url !== '#' ? `<a class="ev-cta" href="${x(ev.url)}" target="_blank" rel="noopener">View Event →</a>` : ''}`;
  return div;
}

// ── Card events snippet ───────────────────────────────────
function cardEvents(evs) {
  const top = (evs || []).slice(0, 2);
  if (!top.length) return '';
  return `
    <div class="card-events-block">
      <div class="cev-label">📅 Events here</div>
      ${top.map(ev => {
        const n = ev.url && ev.url !== '#'
          ? `<a href="${x(ev.url)}" target="_blank" rel="noopener">${x(ev.name)}</a>`
          : x(ev.name);
        return `<div class="cev-item">
          <div class="cev-dot"></div>
          <span class="cev-text">${n}</span>
          ${ev.date ? `<span class="cev-date">${fmtDate(ev.date)}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ── Stars SVG ─────────────────────────────────────────────
function stars(rating, size = 18) {
  let html = '<div class="stars-row">';
  for (let i = 1; i <= 5; i++) {
    const full = rating >= i - 0.25;
    const half = !full && rating >= i - 0.75;
    if (half) {
      html += `<svg class="star-svg half-star" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <defs><linearGradient id="hg${i}"><stop offset="50%" stop-color="var(--amber)"/><stop offset="50%" stop-color="var(--border)"/></linearGradient></defs>
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#hg${i})" stroke="none"/>
      </svg>`;
    } else {
      html += `<svg class="star-svg${full ? ' on' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor" stroke="none"/>
      </svg>`;
    }
  }
  return html + '</div>';
}

function heartSVG(filled) {
  return filled
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}

// ── Helpers ───────────────────────────────────────────────
function tag(text, amber = false) {
  return `<span class="meta-tag${amber ? ' hit' : ''}">${text}</span>`;
}

function breweryTypeLabel(type) {
  const labels = {
    micro: '🍺 Microbrewery', nano: '🍺 Nano Brewery', regional: '🏭 Regional',
    brewpub: '🍽️ Brewpub', large: '🏭 Large Brewery', planning: '🔧 Coming Soon',
    bar: '🍻 Beer Bar', contract: '📄 Contract', proprietor: '🏠 Proprietor',
  };
  return labels[type] || type;
}

function x(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function driveTime(miles) {
  if (!miles || miles < 0.35) return 'Walkable';
  if (miles < 0.8) return '~' + Math.round(miles / 3 * 60) + ' min walk';
  const mph = miles < 3 ? 15 : miles < 10 ? 22 : 35;
  const mins = Math.max(2, Math.round(miles / mph * 60));
  return `~${mins} min drive`;
}

function fmtDate(s) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return s; }
}
function fmtDay(s) {
  try { return new Date(s).getDate(); }
  catch { return '?'; }
}
function fmtMonth(s) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short' }).toUpperCase(); }
  catch { return ''; }
}
function fmtTime(s) {
  try { return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}
function fmtDateBadge(s) {
  try {
    const d = new Date(s);
    return `${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}<br>${d.getDate()}`;
  } catch { return ''; }
}

function setLoading(on) {
  searchBtn.disabled = on;
  btnText.hidden     = on;
  btnSpinner.hidden  = !on;
}

function hideAll() {
  results.hidden       = true;
  emptyState.hidden    = true;
  errorState.hidden    = true;
  eventsSection.hidden = true;
  mockBadge.hidden     = true;
  weatherBanner.hidden = true;
  viewToggle.hidden    = true;
  mapView.hidden       = true;
  filterBar.hidden     = true;
  loadMoreWrap.hidden  = true;
  const banner = document.getElementById('personalizedBanner');
  if (banner) banner.hidden = true;
}

function showError(title, msg) {
  errorTitle.textContent = title;
  errorMsg.textContent   = msg;
  errorState.hidden      = false;
}

function showFieldError(msg) {
  inputError.textContent = msg;
  inputError.hidden      = false;
}

function clearError() {
  inputError.hidden      = true;
  inputError.textContent = '';
}

function goHome() {
  hideAll();
  skeleton.hidden = true;
  hero.hidden     = false;
  history.replaceState(null, '', '/');
  renderQuickSearches();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
