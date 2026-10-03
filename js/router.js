/* YOKO! Student · Rendering and hash router, app-icon shortcuts.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   RENDERING + ROUTER
   ========================================================= */
const VIEWS = { dashboard: renderDashboard, debt: renderDebt, budget: renderBudget, wallet: renderWallet, goals: renderGoals };
/** Old links to the Gifts page land on the Gifts tab of Goals. */
function redirectOldHash() { if (/^#gifts(\/|$)/.test(location.hash)) history.replaceState(null, '', '#goals/gifts'); }
const currentRoute = () => { const h = location.hash.replace('#', '').split('/')[0]; return VIEWS[h] ? h : 'dashboard'; };
let renderTimer = null;

function render() {
  clearTimeout(renderTimer); renderTimer = null;
  syncActuals();
  // Keep the user's place: focused field, caret and raw typed text survive a re-render.
  const ae = document.activeElement;
  const focusId = ae && ae.id && !ae.closest('#modal-root') ? ae.id : null;
  let sel = null, rawVal = null;
  if (focusId && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
    rawVal = ae.value;
    try { sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { sel = null; }
  }
  const scrollY = window.scrollY;

  destroyCharts();
  const route = currentRoute();
  for (const id of Object.keys(VIEWS)) {
    const el = document.getElementById('view-' + id);
    el.hidden = id !== route;
    if (id !== route && el.innerHTML) el.innerHTML = '';   // avoid duplicate element ids across views
  }
  const out = VIEWS[route]();
  document.getElementById('view-' + route).innerHTML = out.html;
  try { out.charts && out.charts(); } catch (err) { console.error('Chart error', err); }

  document.querySelectorAll('[data-route]').forEach(a => a.getAttribute('data-route') === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const r = ROUTES.find(x => x.id === route);
  document.title = `${r.long || r.label} · ${APP_NAME}`;

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      if (rawVal !== null && el.value !== rawVal && !el.hasAttribute('aria-invalid')) el.value = rawVal;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      if (sel && sel[0] !== null) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } }
    }
  }
  fitNumbers();
  window.scrollTo(0, scrollY);
}
/** Shrink big amounts to fit their box instead of breaking them mid-number. */
function fitNumbers() {
  document.querySelectorAll('main .stat-value, main .big-num').forEach(el => {
    el.style.fontSize = ''; el.style.whiteSpace = 'nowrap';
    if (!el.clientWidth || el.textContent.length > 40) { el.style.whiteSpace = ''; return; }
    let fs = parseFloat(getComputedStyle(el).fontSize), n = 0;
    while (el.scrollWidth > el.clientWidth + 1 && fs > 13 && n++ < 24) { fs -= 1; el.style.fontSize = fs + 'px'; }
    if (el.scrollWidth > el.clientWidth + 1) { el.style.whiteSpace = ''; el.style.overflowWrap = 'anywhere'; }
  });
}
function scheduleRender(delay = 400) { clearTimeout(renderTimer); renderTimer = setTimeout(render, delay); }
function commit() { checkBadges(false); evaluateRewards(); save(); render(); }

