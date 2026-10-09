/* YOKO! Student · Shared UI pieces, page tabs and ⋯ menus.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   SHARED UI PIECES
   ========================================================= */
/* ---------- Page tabs and "⋯" menus (keep pages short and buttons few) ---------- */
const TABS = {
  dashboard: [['overview', 'Overview'], ['forecast', 'Run-out forecast'], ['semester', 'Semester'], ['calendar', 'Calendar'], ['charts', 'Charts']],
  spend: [['log', 'Expense log'], ['categories', 'Categories'], ['insights', 'Insights & Heatmap'], ['recurring', 'Recurring'], ['cash', 'Cash']],
  budget: [['plan', 'Plan'], ['where', 'Where did it go?'], ['yearly', 'Yearly / Semester fees'], ['history', 'History']],
  split: [['ious', 'IOUs & Roommates'], ['groups', 'Live Groups'], ['history', 'Settled']],
  goals: [['savings', 'Savings'], ['goals', 'Goals'], ['wishlist', 'Wishlist'], ['challenges', 'Challenges'], ['gifts', 'Gifts']],
  debt: [['debts', 'Debts'], ['plan', 'Payoff plan'], ['emi', 'Loan calculator']],
  wallet: [['cash', 'Cash'], ['ious', 'IOUs'], ['subs', 'Subscriptions'], ['transport', 'Transport']]
};
function currentTab(route) {
  const tabs = TABS[route];
  if (!tabs) return null;
  const [r, want] = location.hash.replace('#', '').split('/');
  ui.tab = ui.tab || {};
  const t = r === route && tabs.some(x => x[0] === want) ? want : (ui.tab[route] || tabs[0][0]);
  ui.tab[route] = t;
  return t;
}
function subtabs(route, tab) {
  return `<nav class="subtabs no-print" aria-label="${esc((ROUTES.find(r => r.id === route) || {}).label || '')} sections"><div role="tablist" class="subtabs-inner">${TABS[route].map(([k, l]) =>
    `<a id="tab-${route}-${k}" class="subtab" role="tab" href="#${route}/${k}" aria-selected="${k === tab}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</div></nav>`;
}
/** One tab's content under the tab bar. */
function tabbed(route, panels) {
  const tab = currentTab(route);
  return subtabs(route, tab) + `<div class="tab-panel" role="tabpanel" aria-labelledby="tab-${route}-${tab}">${panels[tab] || ''}</div>`;
}
let menuSeq = 0;
const mi = (label, action, data = {}) => `<button type="button" role="menuitem" data-action="${action}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
const csvItem = (key, label) => mi(`Download ${label} (CSV)`, 'csv', { csv: key });
function moreMenu(items, label = 'More options') {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  const id = 'mm-' + (++menuSeq);
  return `<div class="menu-wrap more-wrap no-print"><button type="button" class="icon-btn more-btn" data-action="more-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}" aria-label="${esc(label)}" title="${esc(label)}">${ICON.dots}</button>
    <div class="menu more-menu" id="${id}" role="menu" hidden>${list.join('')}</div></div>`;
}
function closeMoreMenus(except) {
  document.querySelectorAll('.more-menu:not([hidden])').forEach(m => {
    if (m === except) return;
    m.hidden = true;
    const b = document.querySelector(`[aria-controls="${m.id}"]`);
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}
function toggleMoreMenu(btn) {
  const m = document.getElementById(btn.getAttribute('aria-controls'));
  if (!m) return;
  const open = m.hidden;
  closeMoreMenus(m);
  m.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {   // keep the menu on screen: open to the right of the button if there's no room on the left
    const wrap = btn.parentElement.getBoundingClientRect(), w = m.offsetWidth;
    const left = Math.max(8, Math.min(wrap.right - w, innerWidth - 8 - w));
    m.style.left = `${left - wrap.left}px`; m.style.right = 'auto';
    // and above the button if it would run under the bottom tab bar / off the screen
    m.style.top = ''; m.style.bottom = ''; m.style.maxHeight = '';
    const tb = document.querySelector('.tabbar'), tbr = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().top : innerHeight;
    const limit = Math.min(innerHeight, tbr) - 8, topLimit = (document.querySelector('.topbar') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom + 8;
    const below = limit - wrap.bottom - 6, above = wrap.top - 6 - topLimit, h = m.scrollHeight;
    if (h > below && above > below) { m.style.top = 'auto'; m.style.bottom = 'calc(100% + 6px)'; m.style.maxHeight = `${Math.max(120, above)}px`; }
    else if (h > below) m.style.maxHeight = `${Math.max(120, below)}px`;
  }
  if (open) { const first = m.querySelector('[role="menuitem"]'); if (first) first.focus(); }
}

function viewHeader(id, title, sub, actions = '', extra = []) {
  const sampleItem = state && state.meta && state.meta.isSample ? mi('Remove demo data', 'remove-sample') : mi('Load demo data', 'load-sample');
  return `<div class="view-head">
    <div><h1 id="h-${id}">${title}</h1><p class="muted">${sub}</p></div>
    <div class="view-actions no-print">${actions}${moreMenu([...extra, sampleItem, mi('Tour this page', 'tour-page', { chapter: id }), mi('Print or save as PDF', 'print')], 'More: tour, demo, print')}</div>
  </div>`;
}
function stat(label, value, sub = '', cls = '') {
  return `<div class="card stat ${cls}"><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${sub ? `<p class="stat-sub">${sub}</p>` : ''}</div>`;
}
/** "₹4,500/month · 12% of income" — orange above 30%, red above 50%. */
function incomeHint(monthly, suffix = '/month') {
  if (!Number.isFinite(monthly)) return '';
  const inc = monthlyIncome();
  if (!(inc > 0)) return `<span class="hint hint-ok">${fmt(monthly)}${suffix} · add income to see %</span>`;
  const pct = monthly / inc * 100;
  const tone = pct > 50 ? 'hint-bad' : pct > 30 ? 'hint-warn' : 'hint-ok';
  return `<span class="hint ${tone}">${fmt(monthly)}${suffix} · ${fmtPct(pct)} of income</span>`;
}
function emptyState(title, text, action, actionLabel, icon = 'goal') {
  return `<div class="empty">
    <div class="empty-icon">${ICON[icon] || ''}</div>
    <h2>${title}</h2><p>${text}</p>
    <div class="row">${action ? `<button type="button" class="btn btn-primary" data-action="${action}">${actionLabel}</button>` : ''}
    <button type="button" class="btn" data-action="load-sample">Load sample data</button></div>
  </div>`;
}
function chartCard(title, sub, id, hasData, emptyMsg, size = '') {
  return `<div class="card">
    <div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div></div>
    ${hasData ? `<div class="chart-box ${size}"><canvas id="${id}" role="img" aria-label="${esc(title)} chart"></canvas></div>`
      : `<div class="chart-empty"><p>${emptyMsg}</p><button type="button" class="btn btn-sm no-print" data-action="load-sample">Load sample data</button></div>`}
  </div>`;
}
function csvLink(key, label = 'CSV', text = 'Download CSV') {
  return `<button type="button" class="btn btn-sm no-print" data-action="csv" data-csv="${key}" aria-label="Download ${esc(label)} as CSV">${ICON.download}<span>${text}</span></button>`;
}
function csvBtn(key, label = 'data') { return moreMenu([csvItem(key, label)]); }
function moneyInput({ id, bind, dataId = '', field, value, label, kind = 'money', cls = '', placeholder = '', srLabel = true }) {
  return `${label ? `<label for="${id}" class="${srLabel ? 'sr-only' : 'field-label'}">${esc(label)}</label>` : ''}
    <div class="affix ${cls}"><span class="affix-sym" aria-hidden="true">${esc(CURRENCIES[state.currency].symbol)}</span>
    <input id="${id}" class="input input-sm" type="text" inputmode="decimal" autocomplete="off" value="${numStr(value)}" placeholder="${esc(placeholder)}"
      data-bind="${bind}" data-id="${esc(dataId)}" data-field="${field}" data-kind="${kind}" aria-describedby="${id}-err"></div>
    <span class="field-error" id="${id}-err"></span>`;
}
function ring(pct) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 100) / 100);
  return `<svg class="ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${Math.round(pct)}% saved">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--tint)" stroke-width="7"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--primary-dark)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="36.5" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" style="color:var(--text)" font-family="Space Grotesk, sans-serif">${Math.round(pct)}%</text></svg>`;
}
function openAttr(key) { return ui.open[key] ? 'open' : ''; }

/** "Where each paycheck goes" card (on Dashboard and Budget). */
function splitCard() {
  const s = splitSummary();
  const hasChartData = s.rows.some(r => r.amount > 0);
  let status = '';
  if (s.base > 0 || s.assigned > 0) {
    if (s.diff > 0.5) status = `<span class="split-status badge-warn">${fmt(s.diff)} unassigned</span>`;
    else if (s.diff < -0.5) status = `<span class="split-status badge-danger">Over by ${fmt(-s.diff)}</span>`;
    else status = `<span class="split-status badge-success">100% assigned</span>`;
  }
  const pctAssigned = s.base > 0 ? fmtPct(s.assigned / s.base * 100) : '-';
  const rows = s.rows.map(r => {
    const vid = `bk-val-${r.id}`;
    return `<div class="split-row">
      <div class="s-name"><label class="sr-only" for="bk-name-${r.id}">Bucket name</label>
        <input id="bk-name-${r.id}" class="input input-sm" value="${esc(r.name)}" maxlength="40" data-bind="bucket" data-id="${r.id}" data-field="name" data-kind="text" aria-describedby="bk-name-${r.id}-err"></div>
      <div class="s-mode"><label class="sr-only" for="bk-mode-${r.id}">Split ${esc(r.name)} by</label>
        <select id="bk-mode-${r.id}" class="select input-sm" data-bind="bucket" data-id="${r.id}" data-field="mode" data-kind="select">
          <option value="percent" ${r.mode === 'percent' ? 'selected' : ''}>%</option><option value="amount" ${r.mode === 'amount' ? 'selected' : ''}>Fixed</option></select></div>
      <div class="s-value"><label class="sr-only" for="${vid}">${esc(r.name)} ${r.mode === 'percent' ? 'percent' : 'amount'}</label>
        <div class="affix ${r.mode === 'percent' ? 'suffix' : ''}"><span class="affix-sym" aria-hidden="true">${r.mode === 'percent' ? '%' : esc(CURRENCIES[state.currency].symbol)}</span>
        <input id="${vid}" class="input input-sm" type="text" inputmode="decimal" autocomplete="off" value="${numStr(r.value)}" data-bind="bucket" data-id="${r.id}" data-field="value" data-kind="bucketValue" aria-describedby="${vid}-err"></div></div>
      <div class="s-amt num" aria-live="off">${r.mode === 'percent' ? fmt(r.amount) : (s.base > 0 ? fmtPct(r.amount / s.base * 100) : '')}<span class="sr-only"> per paycheck</span></div>
      <div class="s-del">${r.role === 'custom' ? `<button type="button" class="icon-btn danger" data-action="delete-bucket" data-id="${r.id}" aria-label="Delete ${esc(r.name)} bucket">${ICON.trash}</button>` : ''}</div>
      <span class="field-error" id="bk-name-${r.id}-err"></span><span class="field-error" id="${vid}-err"></span>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-head"><div><h2>Where each paycheck goes</h2>
      <p class="muted small">${s.base > 0 ? (state.income.irregular ? `${fmt(s.base)} to split this month (${irregularLine().toLowerCase()}) · ${pctAssigned} assigned` : `Take-home ${fmt(s.base)} per paycheck · ${FREQ_LABEL[state.income.freq].toLowerCase()} · ${pctAssigned} assigned`) : 'Enter your paycheck to split it into buckets.'}</p></div>
      <div class="actions">${csvBtn('split', 'paycheck split')}</div></div>
    ${s.base > 0 ? '' : `<div class="alert alert-info mb">No paycheck yet. <button type="button" class="linklike" data-action="open-paycheck">Enter paycheck</button></div>`}
    <div class="split-layout">
      <div class="split-rows">${rows}</div>
      ${hasChartData ? `<div class="chart-box sm"><canvas id="split-chart" role="img" aria-label="Paycheck split chart"></canvas></div>` : ''}
    </div>
    <div class="split-foot"><button type="button" class="btn btn-sm no-print" data-action="add-bucket">${ICON.plus}<span>Add bucket</span></button>${status}</div>
  </div>`;
}

