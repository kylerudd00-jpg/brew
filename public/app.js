/* ============================================================
   Hops & Finds — App Logic
   ============================================================ */

// ── Particle system
(function spawnParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size = 3 + Math.random() * 9;
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      animation-delay: ${(Math.random() * 12).toFixed(2)}s;
      animation-duration: ${(7 + Math.random() * 10).toFixed(2)}s;
      opacity: 0;
    `;
    container.appendChild(el);
  }
})();

// ── DOM refs
const form         = document.getElementById('searchForm');
const zipInput     = document.getElementById('zipInput');
const searchBtn    = document.getElementById('searchBtn');
const inputError   = document.getElementById('inputError');
const searchField  = document.getElementById('searchField');
const btnText      = searchBtn.querySelector('.btn-text');
const btnSpinner   = searchBtn.querySelector('.btn-spinner');

const hero         = document.getElementById('hero');
const skeleton     = document.getElementById('skeletonSection');
const results      = document.getElementById('resultsSection');
const resultsZip   = document.getElementById('resultsZip');
const metaBar      = document.getElementById('metaBar');
const featuredWrap = document.getElementById('featuredWrap');
const secGrid      = document.getElementById('secondaryGrid');
const eventsSection= document.getElementById('eventsSection');
const eventsGrid   = document.getElementById('eventsGrid');
const emptyState   = document.getElementById('emptyState');
const errorState   = document.getElementById('errorState');
const errorTitle   = document.getElementById('errorTitle');
const errorMsg     = document.getElementById('errorMsg');
const mockBadge    = document.getElementById('mockBadge');
const newSearchBtn = document.getElementById('newSearchBtn');
const emptyBack    = document.getElementById('emptyBack');
const errorBack    = document.getElementById('errorBack');

// ── Form submit
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

// ── Search
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
      err.message || 'Is the server running? Check console for details.'
    );
  } finally {
    setLoading(false);
    skeleton.hidden = true;
  }
}

// ── Render results
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
  data.topBeers.slice(1).forEach((beer, i) => {
    secGrid.appendChild(buildSecCard(beer, i + 2));
  });

  const evs = (data.allEvents || []).slice(0, 9);
  if (evs.length) {
    eventsGrid.innerHTML = '';
    evs.forEach(ev => eventsGrid.appendChild(buildEventCard(ev)));
    eventsSection.hidden = false;
  }

  results.hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Animate fills after paint
  requestAnimationFrame(() => setTimeout(animateFills, 80));
}

function animateFills() {
  document.querySelectorAll('.sec-bar-fill[data-pct]').forEach(el => {
    el.style.width = el.dataset.pct + '%';
  });
  document.querySelectorAll('.glass-fill[data-target-h]').forEach(el => {
    const h = parseFloat(el.dataset.targetH);
    const y = parseFloat(el.dataset.targetY);
    el.setAttribute('height', h);
    el.setAttribute('y', y);
  });
}

// ── Featured card
function buildFeaturedCard(beer) {
  const pct  = Math.round(beer.score * 100);
  const glH  = Math.round(pct * 0.5);  // max fill height = 50px (inside 60px glass body)
  const glY  = 60 - glH;               // fill starts from bottom (y flipped)
  const bLink = beer.breweryWebsite
    ? `<a class="brewery-name-link" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="brewery-name-link">${x(beer.breweryName)}</span>`;

  const div = document.createElement('div');
  div.className = 'featured-card';
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
    </div>

    <div class="fc-score">
      <div class="score-label">Intel<br/>Score</div>
      <div class="glass-wrap">
        <svg class="glass-svg" viewBox="0 0 56 80" aria-label="Score ${pct} out of 100">
          <!-- glass fill (animated) -->
          <rect class="glass-fill" x="6" y="60" width="44" height="0" rx="2"
            fill="url(#beerGrad)"
            opacity="0.85"
            data-target-h="${glH}"
            data-target-y="${glY}"/>
          <!-- foam -->
          <ellipse cx="28" cy="${glY}" rx="22" ry="4" fill="rgba(245,240,220,0.25)" style="transition:cy 1s cubic-bezier(0.34,1.3,0.64,1)"/>
          <!-- glass outline -->
          <path d="M6 8 L10 72 Q10 76 14 76 L42 76 Q46 76 46 72 L50 8 Z"
            fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
          <!-- glass highlight -->
          <path d="M10 10 L12 60" stroke="rgba(255,255,255,0.06)" stroke-width="3" stroke-linecap="round"/>
          <!-- handle -->
          <path d="M50 20 Q62 20 62 32 Q62 44 50 44"
            fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2.5"/>
          <defs>
            <linearGradient id="beerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f5c94a"/>
              <stop offset="100%" stop-color="#a06010"/>
            </linearGradient>
          </defs>
        </svg>
        <div class="glass-pct">${pct}</div>
      </div>
    </div>
  `;
  return div;
}

// ── Secondary card
function buildSecCard(beer, rank) {
  const pct   = Math.round(beer.score * 100);
  const bLink = beer.breweryWebsite
    ? `<a class="sec-brewery" href="${x(beer.breweryWebsite)}" target="_blank" rel="noopener">${x(beer.breweryName)}</a>`
    : `<span class="sec-brewery">${x(beer.breweryName)}</span>`;

  const div = document.createElement('div');
  div.className = 'sec-card';
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
    </div>
  `;
  return div;
}

// ── Event card
function buildEventCard(ev) {
  const srcCls  = ev.source === 'eventbrite' ? 'ev-eb' : 'ev-sc';
  const srcText = ev.source === 'eventbrite' ? 'Eventbrite' : 'Brewery';
  const nameEl  = ev.url && ev.url !== '#'
    ? `<a class="ev-name" href="${x(ev.url)}" target="_blank" rel="noopener">${x(ev.name)}</a>`
    : `<span class="ev-name">${x(ev.name)}</span>`;

  const parts = [];
  if (ev.date)        parts.push(`📅 ${fmtDate(ev.date)}`);
  if (ev.breweryName) parts.push(`🏭 ${x(ev.breweryName)}`);

  const div = document.createElement('div');
  div.className = 'ev-card';
  div.innerHTML = `
    <span class="ev-source ${srcCls}">${srcText}</span>
    ${nameEl}
    ${parts.map(p => `<span class="ev-meta">${p}</span>`).join('')}
  `;
  return div;
}

// ── Card events snippet
function cardEvents(evs) {
  const top = (evs || []).slice(0, 2);
  if (!top.length) return '';
  return `
    <div class="card-events-block">
      <div class="cev-label">Events here</div>
      ${top.map(ev => {
        const n = ev.url && ev.url !== '#'
          ? `<a href="${x(ev.url)}" target="_blank" rel="noopener">${x(ev.name)}</a>`
          : x(ev.name);
        return `<div class="cev-item">
          <div class="cev-dot"></div>
          <span style="flex:1;min-width:0">${n}</span>
          ${ev.date ? `<span class="cev-date">${fmtDate(ev.date)}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ── Stars SVG
function stars(rating, size = 18) {
  let html = '<div class="stars-row">';
  for (let i = 1; i <= 5; i++) {
    const full = rating >= i - 0.25;
    const half = !full && rating >= i - 0.75;
    const cls  = full ? 'on' : half ? 'half-star' : '';
    // Half-star: clip left 50% filled
    if (half) {
      html += `<svg class="star-svg ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <defs><linearGradient id="hg${i}"><stop offset="50%" stop-color="var(--amber)"/><stop offset="50%" stop-color="var(--border)"/></linearGradient></defs>
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#hg${i})" stroke="none"/>
      </svg>`;
    } else {
      html += `<svg class="star-svg ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor" stroke="none"/>
      </svg>`;
    }
  }
  return html + '</div>';
}

// ── Helpers
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
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return s; }
}

function setLoading(on) {
  searchBtn.disabled = on;
  btnText.hidden     = on;
  btnSpinner.hidden  = !on;
}

function hideAll() {
  results.hidden      = true;
  emptyState.hidden   = true;
  errorState.hidden   = true;
  eventsSection.hidden= true;
  mockBadge.hidden    = true;
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
  inputError.hidden = true;
  inputError.textContent = '';
}

function goHome() {
  hideAll();
  skeleton.hidden = true;
  hero.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
