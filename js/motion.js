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
  placeNavPill(route !== Motion.navRoute); Motion.navRoute = route;
  if (!fresh) changeMotion(view, key);
  snapMotion(view, key);
  if (Motion.fly) requestAnimationFrame(runFly);
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

/* =========================================================
   CHANGE MOTION: numbers roll, bars glide, spends fly, pages morph
   ========================================================= */
const TICK_SEL = '.safe-hero-amount, .big-num, .stat-value, .exact-val, .dr-amt, .fr-amt, .hc-pct';
const MORPH_SEL = '.progress > span, .hc-bar > span, .bw-bar i, .hang-bar i, .alloc-bar .seg, .pva-col i, .hero-week i, .mt-stack i, .ring-on, .gr-on, .seg-ind';
const MORPH_PROPS = ['width', 'height', 'strokeDasharray', 'strokeDashoffset'];
Object.assign(Motion, { snap: null, fly: null, origin: null, vt: '', navRoute: '' });

/** Remember what every number and bar looked like, so the next render of the same page can animate the change. */
function snapMotion(view, key) {
  Motion.snap = {
    key,
    nums: [...view.querySelectorAll(TICK_SEL)].map(el => (el.classList.contains('odo') && el.getAttribute('aria-label')) || el.textContent),
    bars: [...view.querySelectorAll(MORPH_SEL)].map(el => MORPH_PROPS.map(p => el.style[p]))
  };
}

/** Called from afterRenderMotion for re-renders of the same page (not page changes). */
function changeMotion(view, key) {
  const old = Motion.snap;
  if (!old || old.key !== key || !motionOK()) return;
  const nums = [...view.querySelectorAll(TICK_SEL)];
  const now = performance.now(), rolls = Motion.rolls && Motion.rolls.key === key ? Motion.rolls.list : {};
  const next = {};
  if (nums.length === old.nums.length) nums.forEach((el, i) => {
    const was = old.nums[i], txt = el.textContent, r = rolls[i];
    if (was !== txt) { const dur = odometer(el, was, txt); if (dur) next[i] = { from: was, to: txt, start: now, dur }; }
    else if (r && r.to === txt && now - r.start < r.dur) { odometer(el, r.from, r.to, now - r.start); next[i] = r; }   // a re-render mid-roll carries on
  });
  Motion.rolls = { key, list: next };
  const bars = [...view.querySelectorAll(MORPH_SEL)];
  if (bars.length === old.bars.length) bars.forEach((el, i) => {
    const from = {}, to = {}; let moved = false;
    MORPH_PROPS.forEach((p, k) => { const a = old.bars[i][k], b = el.style[p]; if (a && b && a !== b) { from[p] = a; to[p] = b; moved = true; } });
    if (moved) el.animate([from, to], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

/** Odometer: each digit that changed rolls to its new value, right-most first.
    `elapsed` lets a re-render pick a roll up where it was, so it never restarts or snaps. */
const ODO_MS = 800, ODO_STEP = 60, ODO_EASE = 'cubic-bezier(.2,.9,.25,1.05)';
function odometer(el, from, to, elapsed = 0) {
  if (el.children.length || !/\d/.test(to) || !/\d/.test(from)) return 0;
  const n = Math.max(from.length, to.length), A = from.padStart(n, ' '), B = to.padStart(n, ' ');
  const strip = '0123456789'.split('').map(d => `<span>${d}</span>`).join('');
  let html = '', k = 0;
  for (let i = n - 1; i >= 0; i--) {
    const c = B[i], o = A[i];
    if (c === ' ') continue;
    if (/\d/.test(c) && c !== o) html = `<span class="odo-d" data-f="${/\d/.test(o) ? o : 0}" data-t="${c}" data-k="${k++}"><span class="odo-s">${strip}</span></span>` + html;
    else html = esc(c) + html;
  }
  if (!k) return 0;
  el.setAttribute('aria-label', to);
  el.innerHTML = html;
  el.classList.add('odo');
  const total = ODO_MS + (k - 1) * ODO_STEP;
  el.querySelectorAll('.odo-d').forEach(cell => {
    const st = cell.firstChild, f = +cell.dataset.f, t = +cell.dataset.t, delay = +cell.dataset.k * ODO_STEP;
    const wf = st.children[f].getBoundingClientRect().width, wt = st.children[t].getBoundingClientRect().width;
    const opts = { duration: ODO_MS, delay, easing: ODO_EASE, fill: 'both' };
    const a1 = st.animate([{ transform: `translateY(calc(${-f} * 1.4lh))`, filter: 'blur(0)' }, { filter: 'blur(1.5px)', offset: .4 }, { transform: `translateY(calc(${-t} * 1.4lh))`, filter: 'blur(0)' }], opts);
    const a2 = cell.animate([{ width: wf + 'px' }, { width: wt + 'px' }], opts);
    if (elapsed) { a1.currentTime = elapsed; a2.currentTime = elapsed; }
  });
  clearTimeout(el._odoT);
  el._odoT = setTimeout(() => { if (el.isConnected && el.classList.contains('odo')) { el.textContent = to; el.classList.remove('odo'); el.removeAttribute('aria-label'); } }, Math.max(0, total - elapsed) + 30);
  return total;
}

/* ---------- Spend flies into its category ---------- */
const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const onScreen = el => { if (!el || !el.getClientRects().length) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
document.addEventListener('pointerdown', e => { const t = e.target.closest && e.target.closest('button, a, input, label, [role="option"]'); if (t) Motion.origin = { p: rectOf(t), at: Date.now() }; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.getBoundingClientRect) Motion.origin = { p: rectOf(e.target), at: Date.now() }; }, true);

/** Called by addExpense; the chip flies after the next render puts the new numbers on screen. */
function queueFly(amount, catId, expId) {
  const o = Motion.origin && Date.now() - Motion.origin.at < 8000 ? Motion.origin.p : { x: innerWidth / 2, y: innerHeight - 96 };
  Motion.fly = { amount, catId, expId, from: o, at: Date.now() };
}
function runFly() {
  const f = Motion.fly; Motion.fly = null;
  if (!f || Date.now() - f.at > 4000 || !motionOK()) return;
  const pick = [`[data-exp-id="${f.expId}"]`, `[data-cat-id="${f.catId}"]`, '#safe-hero .safe-hero-amount', '.sidebar .nav-link[data-route="spend"]', '.tab-link[data-route="spend"]'];
  let target = null;
  for (const sel of pick) { target = [...document.querySelectorAll(sel)].find(onScreen); if (target) break; }
  if (!target) return;
  const to = rectOf(target), from = f.from;
  const chip = document.createElement('span');
  chip.className = 'fly-chip'; chip.setAttribute('aria-hidden', 'true');
  chip.textContent = '−' + fmt(f.amount);
  document.body.appendChild(chip);
  const lift = Math.min(160, Math.abs(to.x - from.x) * 0.35 + 60), mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - lift;
  const at = (x, y, s, o) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`, opacity: o });
  const a = chip.animate([at(from.x, from.y, .6, 0), at(from.x, from.y - 12, 1.08, 1), at(mx, my, 1, 1), at(to.x, to.y, .5, .9)],
    { duration: 820, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
  a.onfinish = () => {
    chip.remove();
    target.classList.remove('yk-hit'); void target.offsetWidth; target.classList.add('yk-hit');
    setTimeout(() => target.classList.remove('yk-hit'), 900);
  };
}

/* ---------- Pages morph into each other (View Transitions) ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-vt]');
  document.querySelectorAll('[style*="view-transition-name: yk-shared"]').forEach(x => { x.style.viewTransitionName = ''; });
  Motion.vt = '';
  if (el && document.startViewTransition && motionOK()) { Motion.vt = el.dataset.vt; el.style.viewTransitionName = 'yk-shared'; }
}, true);

/** Swap pages with a view transition when the browser can; run() does the actual render. */
function pageTransition(run) {
  if (!document.startViewTransition || !motionOK() || document.hidden) { Motion.vt = ''; run(); return; }
  const vt = document.startViewTransition(() => {
    run();
    const t = Motion.vt && document.querySelector(`[data-vt-target="${Motion.vt}"]`);
    if (t) { t.style.viewTransitionName = 'yk-shared'; t.scrollIntoView({ block: 'center' }); }
  });
  const clean = () => { document.querySelectorAll('[style*="view-transition-name"]').forEach(x => { x.style.viewTransitionName = ''; }); Motion.vt = ''; };
  vt.finished.then(clean, clean);
}

/* ---------- Top menu pill (laptop) ---------- */
function placeNavPill(animate) {
  const list = document.getElementById('side-nav'); if (!list) return;
  const cur = list.querySelector('.nav-link[aria-current="page"]');
  let pill = list.querySelector('.nav-pill');
  if (!cur || !cur.offsetWidth) { if (pill) pill.style.opacity = '0'; return; }
  if (!pill) { pill = document.createElement('li'); pill.className = 'nav-pill'; pill.setAttribute('aria-hidden', 'true'); pill.setAttribute('role', 'presentation'); list.prepend(pill); list.classList.add('has-pill'); animate = false; }
  if (!pill._fix) { pill._fix = true; pill.addEventListener('transitionend', e => { if (e.propertyName === 'transform') placeNavPill(true); }); new ResizeObserver(() => placeNavPill(false)).observe(list); }
  const lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
  const nx = cr.left - lr.left - list.clientLeft + list.scrollLeft, ny = cr.top - lr.top - list.clientTop;
  if (pill.dataset.x === String(Math.round(nx)) && pill.dataset.y === String(Math.round(ny)) && pill.dataset.w === String(Math.round(cr.width))) return;
  pill.dataset.x = Math.round(nx); pill.dataset.y = Math.round(ny); pill.dataset.w = Math.round(cr.width);
  if (!animate || !motionOK()) pill.style.transition = 'none';
  pill.style.opacity = '1';
  pill.style.transform = `translate(${cr.left - lr.left - list.clientLeft + list.scrollLeft}px, ${cr.top - lr.top - list.clientTop}px)`;
  pill.style.width = cr.width + 'px'; pill.style.height = cr.height + 'px';
  if (!animate || !motionOK()) { void pill.offsetWidth; pill.style.transition = ''; }
}
addEventListener('resize', () => requestAnimationFrame(() => placeNavPill(false)));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeNavPill(false));
