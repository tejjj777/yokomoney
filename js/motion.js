/* YOKO! Student · Motion: cards rise in, the tab pill slides, big numbers count up.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md).
   Runs after every render (see render() in router.js). Animations only play when you open a page or tab,
   not on every re-render, and never with reduced motion or when printing. */
'use strict';
const Motion = { lastKey: '', tabPos: {}, enterTimer: null, counters: [], tabRO: null };
const motionOK = () => !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) && document.documentElement.dataset.theme !== 'print';

/** Called at the end of render(). */
function afterRenderMotion(route) {
  const view = document.getElementById('view-' + route);
  if (!view) return;
  const sel = view.querySelector('.subtab[aria-selected="true"]');
  const key = route + '/' + (sel ? sel.id : '');
  const fresh = key !== Motion.lastKey;
  Motion.lastKey = key;
  slideSubtabs(view, route, fresh);
  if (!fresh || !motionOK()) { view.classList.remove('yk-enter'); return; }
  view.classList.remove('yk-enter');
  void view.offsetWidth;   // restart the animation
  [...view.querySelectorAll('.card')].slice(0, 16).forEach((c, i) => c.style.setProperty('--yk-i', i));
  view.classList.add('yk-enter');
  clearTimeout(Motion.enterTimer);
  Motion.enterTimer = setTimeout(() => view.classList.remove('yk-enter'), 1800);
  countUp(view);
}

/** One green pill behind the current page tab; it slides from the tab you were on. */
function slideSubtabs(view, route, fresh) {
  const inner = view.querySelector('.subtabs-inner');
  const cur = inner && inner.querySelector('.subtab[aria-selected="true"]');
  if (!cur) return;
  const ind = document.createElement('span');
  ind.className = 'subtab-ind';
  ind.setAttribute('aria-hidden', 'true');
  inner.prepend(ind);
  inner.classList.add('has-ind');
  const to = { x: cur.offsetLeft, y: cur.offsetTop, w: cur.offsetWidth, h: cur.offsetHeight };
  const place = p => { ind.style.transform = `translate(${p.x}px, ${p.y}px)`; ind.style.width = p.w + 'px'; ind.style.height = p.h + 'px'; };
  const from = Motion.tabPos[route];
  if (fresh && from && motionOK() && (from.x !== to.x || from.y !== to.y || from.w !== to.w)) {
    ind.style.transition = 'none'; place(from);
    void ind.offsetWidth;
    ind.style.transition = ''; place(to);
  } else { ind.style.transition = 'none'; place(to); void ind.offsetWidth; ind.style.transition = ''; }
  Motion.tabPos[route] = to;
  // Fonts or layout can shift the tab after this runs; keep the pill on it
  if (window.ResizeObserver) {
    if (Motion.tabRO) Motion.tabRO.disconnect();
    Motion.tabRO = new ResizeObserver(() => {
      if (!cur.isConnected) return;
      const p = { x: cur.offsetLeft, y: cur.offsetTop, w: cur.offsetWidth, h: cur.offsetHeight };
      const was = Motion.tabPos[route];
      if (was && was.x === p.x && was.y === p.y && was.w === p.w && was.h === p.h) return;
      ind.style.transition = 'none'; place(p); void ind.offsetWidth; ind.style.transition = '';
      Motion.tabPos[route] = p;
    });
    Motion.tabRO.observe(cur); Motion.tabRO.observe(inner);
  }
}

/** Big money numbers count up from zero to their real value. The final text is always the original. */
function countUp(view) {
  Motion.counters.forEach(c => cancelAnimationFrame(c));
  Motion.counters = [];
  const vh = window.innerHeight || 800;
  const els = [...view.querySelectorAll('.safe-hero-amount, .stat-value, .big-num')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width && r.top < vh && r.bottom > 0;
  }).slice(0, 10);
  els.forEach((el, k) => {
    const text = el.textContent, m = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!m || el.children.length) return;
    const raw = m[0], target = parseFloat(raw.replace(/,/g, ''));
    if (!Number.isFinite(target) || Math.abs(target) < 10) return;
    const dec = (raw.split('.')[1] || '').length;
    const locale = (CURRENCIES[state.currency] || {}).locale || 'en-IN';
    const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: raw.includes(',') });
    if (nf.format(target) !== raw.replace(/^-/, '') && nf.format(target) !== raw) return;   // unknown format: leave it alone
    const pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    const dur = 900, t0 = performance.now() + k * 60;
    const step = now => {
      if (!el.isConnected) return;
      const t = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? text : pre + nf.format(target * e) + post;
      if (t < 1) Motion.counters.push(requestAnimationFrame(step));
    };
    Motion.counters.push(requestAnimationFrame(step));
  });
}

/* Keep the tab pill in place when the window changes size */
let motionResizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(motionResizeRaf);
  motionResizeRaf = requestAnimationFrame(() => {
    const route = typeof currentRoute === 'function' ? currentRoute() : null;
    const view = route && document.getElementById('view-' + route);
    const inner = view && view.querySelector('.subtabs-inner.has-ind');
    if (!inner) return;
    inner.querySelectorAll('.subtab-ind').forEach(n => n.remove());
    slideSubtabs(view, route, false);
  });
});

/* Segmented radios: move the pill to the picked option */
document.addEventListener('change', e => {
  const g = e.target.closest && e.target.closest('.seg-radio');
  if (g) g.style.setProperty('--i', [...g.querySelectorAll('input[type="radio"]')].indexOf(e.target));
});
