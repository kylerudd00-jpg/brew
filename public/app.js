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
const detailOverlay = document.getElementById('detailOverlay');
const detailSheet   = document.getElementById('detailSheet');
const detailContent = document.getElementById('detailContent');
const detailClose   = document.getElementById('detailClose');

// ── Form submit ───────────────────────────────────────────
form.addEventListener('submit', e => {
  e.preventDefault();
  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    searchField.classList.add('invalid');
    showFieldError('Enter a valid 5-digit ZIP code.');
    return;
  }
  clearError();
  doSearch(zip);
});

zipInput.addEventListener('input', () => {
  searchField.classList.remove('invalid');
  clearError();
});

newSearchBtn.addEventListener('click', goHome);
emptyBack.addEventListener('click', goHome);
errorBack.addEventListener('click', goHome);

// ── Search ────────────────────────────────────────────────
async function doSearch(zip) {
  setLoading(true);
  hideAll();
  skeleton.hidden = false;
  hero.hidden = true;

  try {
    const res  = await fetch(`/search?zip=${encodeURIComponent(zip)}`);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Server error'), { status: res.status });
    renderResults(data);
  } catch (err) {
    showError(
      err.status === 400 ? 'Invalid ZIP' : 'Could not load results',
      err.message || 'Check your connection and try again.'
    );
  } finally {
    setLoading(false);
    skeleton.hidden = true;
  }
}

// ── Render results ────────────────────────────────────────
function renderResults(data) {
  if (!data.topBeers?.length) { emptyState.hidden = false; return; }

  mockBadge.hidden = !data.mock;
  resultsZip.textContent = data.zip;

  metaBar.innerHTML = [
    tag(`🏭 ${data.meta.breweryCount} breweries`),
    tag(`🍺 ${data.meta.beerCount} beers scored`),
    tag(`📍 ${data.meta.radiusMiles} mi radius`),
    data.meta.fromCache ? tag('⚡ Cached', true) : '',
    data.mock ? tag('DEMO', true) : '',
  ].join('');

  featuredWrap.innerHTML = '';
  featuredWrap.appendChild(buildFeaturedCard(data.topBeers[0]));

  secGrid.innerHTML = '';
  data.topBeers.slice(1).forEach((beer, i) => secGrid.appendChild(buildSecCard(beer, i + 2)));

  const evs = (data.allEvents || []).slice(0, 9);
  if (evs.length) {
    eventsGrid.innerHTML = '';
    evs.forEach(ev => eventsGrid.appendChild(buildEventCard(ev)));
    eventsSection.hidden = false;
  }

  results.hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
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
}

// ── Beer detail sheet ─────────────────────────────────────
async function openBeerDetail(beerId, beerName) {
  detailContent.innerHTML = buildDetailSkeleton(beerName);
  detailOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const res  = await fetch(`/beer/${encodeURIComponent(beerId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Not found');
    detailContent.innerHTML = buildDetailHTML(data);
  } catch (err) {
    detailContent.innerHTML = `<p class="detail-error">Couldn't load beer details: ${x(err.message)}</p>`;
  }
}

function closeDetail() {
  detailOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

detailClose.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

function buildDetailSkeleton(name) {
  return `
    <div class="detail-loading">
      <div class="detail-sk detail-sk-title">${x(name || 'Loading…')}</div>
      <div class="detail-sk detail-sk-sub"></div>
      <div class="detail-sk detail-sk-bar"></div>
      <div class="detail-sk detail-sk-bar" style="width:60%"></div>
    </div>`;
}

function buildDetailHTML(data) {
  const { beer, brewery, events, similar } = data;
  const pct = Math.round((beer.rating / 5) * 100);

  const evHTML = events.length ? `
    <div class="detail-section">
      <div class="detail-section-label">📅 Upcoming Events</div>
      <div class="detail-events-list">
        ${events.map(ev => {
          const nameEl = ev.url
            ? `<a href="${x(ev.url)}" target="_blank" rel="noopener" class="dev-link">${x(ev.name)}</a>`
            : `<span>${x(ev.name)}</span>`;
          return `<div class="detail-event-row">
            ${ev.date ? `<div class="dev-date-badge">${fmtDateBadge(ev.date)}</div>` : ''}
            <div class="dev-body">${nameEl}${ev.date ? `<span class="dev-time">${fmtTime(ev.date)}</span>` : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const simHTML = similar.length ? `
    <div class="detail-section">
      <div class="detail-section-label">🍺 Similar Beers</div>
      <div class="detail-similar-grid">
        ${similar.map(s => `
          <div class="dsim-card" data-beer-id="${x(s.id)}" data-beer-name="${x(s.name)}" role="button" tabindex="0">
            <div class="dsim-name">${x(s.name)}</div>
            <div class="dsim-meta">
              <span class="style-chip" style="font-size:.52rem">${x(s.style)}</span>
              <span class="dsim-rating">★ ${s.rating.toFixed(2)}</span>
            </div>
            <div class="dsim-brewery">${x(s.breweryName)}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="detail-hero-section">
      <div class="detail-tags">
        <span class="style-chip">${x(beer.style)}</span>
        <span class="abv-chip">ABV ${beer.abv}%</span>
        <span class="detail-score-badge">${Math.round(beer.rating / 5 * 100)} score</span>
      </div>
      <h2 class="detail-beer-name">${x(beer.name)}</h2>
      <div class="detail-rating-row">
        ${stars(beer.rating, 20)}
        <span class="rating-val">${beer.rating.toFixed(2)}</span>
        <span class="review-ct">${beer.reviewCount.toLocaleString()} reviews</span>
      </div>
      <div class="detail-abv-bar-wrap">
        <div class="detail-abv-track">
          <div class="detail-abv-fill" style="width:${Math.min(beer.abv / 15 * 100, 100)}%"></div>
          <div class="detail-abv-marker" style="left:${Math.min(beer.abv / 15 * 100, 100)}%">
            <span class="detail-abv-val">${beer.abv}% ABV</span>
          </div>
        </div>
        <div class="detail-abv-labels"><span>Light</span><span>Strong</span></div>
      </div>
    </div>

    <div class="detail-section detail-brewery-section">
      <div class="detail-section-label">🏭 Brewery</div>
      <div class="detail-brewery-row">
        <div class="detail-brewery-info">
          ${brewery.website
            ? `<a href="${x(brewery.website)}" target="_blank" rel="noopener" class="detail-brewery-name-link">${x(brewery.name)}</a>`
            : `<span class="detail-brewery-name-link">${x(brewery.name)}</span>`}
          ${brewery.address ? `<span class="detail-brewery-addr">${x(brewery.address)}</span>` : ''}
        </div>
        ${brewery.website ? `<a href="${x(brewery.website)}" target="_blank" rel="noopener" class="detail-visit-btn">Visit →</a>` : ''}
      </div>
    </div>

    ${evHTML}
    ${simHTML}`;
}

// Delegate clicks on similar beer cards inside the detail sheet
detailContent.addEventListener('click', e => {
  const card = e.target.closest('[data-beer-id]');
  if (card) openBeerDetail(card.dataset.beerId, card.dataset.beerName);
});
detailContent.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const card = e.target.closest('[data-beer-id]');
    if (card) openBeerDetail(card.dataset.beerId, card.dataset.beerName);
  }
});

// ── Featured card ─────────────────────────────────────────
function buildFeaturedCard(beer) {
  const pct = Math.round(beer.score * 100);
  const glH = Math.round(pct * 0.5);
  const glY = 60 - glH;
  const bLink = beer.breweryWebsite
    ? `<a class="brewery-name-link" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="brewery-name-link">${x(beer.breweryName)}</span>`;

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
      <div class="fc-name">${x(beer.name)}</div>
      <div class="tags-row">
        <span class="style-chip">${x(beer.style)}</span>
        <span class="abv-chip">ABV ${beer.abv}%</span>
        <span class="hop-chip">🌿 On Tap</span>
      </div>
      <div class="rating-row">
        ${stars(beer.rating, 20)}
        <span class="rating-val">${beer.rating.toFixed(2)}</span>
        <span class="review-ct">${beer.reviewCount.toLocaleString()} reviews</span>
      </div>
      <div class="brewery-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--muted);flex-shrink:0"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${bLink}
        <span class="dist-pill">${beer.distanceMiles} mi</span>
      </div>
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

// ── Secondary card ────────────────────────────────────────
function buildSecCard(beer, rank) {
  const pct = Math.round(beer.score * 100);
  const bLink = beer.breweryWebsite
    ? `<a class="sec-brewery" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="sec-brewery">${x(beer.breweryName)}</span>`;

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
    <div class="sec-ghost-rank">0${rank}</div>
    <div class="sec-header">
      <div class="sec-rank-tab">0${rank}</div>
      <div class="sec-style-area">
        <div class="tags-row" style="margin-bottom:0">
          <span class="style-chip" style="font-size:.55rem">${x(beer.style)}</span>
          <span class="abv-chip" style="font-size:.55rem">ABV ${beer.abv}%</span>
        </div>
      </div>
    </div>
    <div class="sec-body">
      <div class="sec-name">${x(beer.name)}</div>
      <div class="sec-rating-row">
        ${stars(beer.rating, 14)}
        <span class="sec-rating-val">${beer.rating.toFixed(2)}</span>
        <span class="sec-reviews">(${beer.reviewCount.toLocaleString()})</span>
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

// ── Click handlers on beer cards ──────────────────────────
document.addEventListener('click', e => {
  const card = e.target.closest('.clickable-card[data-beer-id]');
  if (!card) return;
  // Don't intercept clicks on links inside the card
  if (e.target.closest('a')) return;
  openBeerDetail(card.dataset.beerId, card.dataset.beerName);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const card = e.target.closest('.clickable-card[data-beer-id]');
  if (card) openBeerDetail(card.dataset.beerId, card.dataset.beerName);
});

// ── Event card ────────────────────────────────────────────
function buildEventCard(ev) {
  const srcCls  = ev.source === 'eventbrite' ? 'ev-eb' : 'ev-sc';
  const srcText = ev.source === 'eventbrite' ? 'Eventbrite' : 'Brewery';

  const namePart = ev.url && ev.url !== '#'
    ? `<a class="ev-name" href="${x(ev.url)}" target="_blank" rel="noopener">${x(ev.name)}</a>`
    : `<div class="ev-name">${x(ev.name)}</div>`;

  const div = document.createElement('div');
  div.className = 'ev-card';
  div.innerHTML = `
    <div class="ev-top">
      ${ev.date ? `<div class="ev-date-badge">
        <span class="ev-day">${fmtDay(ev.date)}</span>
        <span class="ev-month">${fmtMonth(ev.date)}</span>
      </div>` : '<div class="ev-date-badge ev-date-tbd"><span class="ev-day">?</span><span class="ev-month">TBD</span></div>'}
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

// ── Helpers ───────────────────────────────────────────────
function tag(text, amber = false) {
  return `<span class="meta-tag${amber ? ' hit' : ''}">${text}</span>`;
}

function x(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
