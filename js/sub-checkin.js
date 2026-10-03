/* YOKO! Student · Monthly subscription check-in.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   SUBSCRIPTION CHECK-IN (once a month)
   ========================================================= */
function subCheckState() {
  const ym = todayISO().slice(0, 7), prev = prevYM(ym), prev2 = prevYM(prev);
  const existed = x => !x.since || x.since < ym + '-01';
  const pending = state.subscriptions.filter(x => existed(x) && x.usage[prev] === undefined);
  const unused = state.subscriptions.filter(x => x.usage[prev] === false && x.usage[prev2] === false && x.kept !== ym);
  const skipped = state.meta.subCheckSkip === ym;
  return { ym, prev, pending: skipped ? [] : pending, unused };
}
function subCheckCard() {
  const c = subCheckState();
  if (!c.pending.length && !c.unused.length) return '';
  const monthName = FULL_MONTHS[Number(c.prev.slice(5)) - 1];
  return `<div class="card mb sub-check" id="sub-check"><div class="card-head"><div><h2>Subscription check-in</h2><p class="muted small">${c.pending.length ? `Did you actually use these in ${monthName}?` : 'Worth cancelling?'}</p></div>
    ${c.pending.length ? `<div class="actions no-print">${moreMenu([mi('Ask me next month', 'sub-skip')])}</div>` : ''}</div>
    <ul class="sub-list">
      ${c.unused.map(x => `<li class="is-unused"><span><strong>${esc(x.name)}</strong> <span class="small muted">hasn’t been used for 2 months. That’s ${fmt(subMonthly(x) * 12)} a year.</span></span>
        <span class="sub-btns no-print"><button type="button" class="btn btn-sm btn-danger" data-action="sub-cancel" data-id="${x.id}">Cancel it</button><button type="button" class="btn btn-sm" data-action="sub-keep" data-id="${x.id}">Keep</button></span></li>`).join('')}
      ${c.pending.map(x => `<li><span><strong>${esc(x.name)}</strong> <span class="small muted">${fmt(x.amount)}/${x.cycle === 'yearly' ? 'yr' : 'mo'}</span></span>
        <span class="sub-btns no-print"><button type="button" class="btn btn-sm" data-action="sub-used" data-id="${x.id}" data-v="1">Used it</button><button type="button" class="btn btn-sm" data-action="sub-used" data-id="${x.id}" data-v="0">Didn’t</button></span></li>`).join('')}
    </ul></div>`;
}
const SUB_ACTIONS = {
  'sub-used': el => {
    const x = state.subscriptions.find(k => k.id === el.dataset.id); if (!x) return;
    const c = subCheckState();
    x.usage[c.prev] = el.dataset.v === '1';
    commit();
    const left = subCheckState();
    if (!left.pending.length) {
      const notUsed = state.subscriptions.filter(k => k.usage[c.prev] === false);
      toast(notUsed.length ? `Done. ${plural(notUsed.length, 'subscription')} went unused, ${fmt(sum(notUsed, subMonthly))} a month` : 'Done. You used everything you pay for', 4000);
    }
  },
  'sub-keep': el => { const x = state.subscriptions.find(k => k.id === el.dataset.id); if (x) { x.kept = todayISO().slice(0, 7); commit(); toast(`Keeping ${x.name}`); } },
  'sub-cancel': el => {
    const x = state.subscriptions.find(k => k.id === el.dataset.id);
    if (x) undoable(`Removed ${x.name}. Remember to cancel it with them too. That’s ${fmt(subMonthly(x) * 12)} a year back`, () => { state.subscriptions = state.subscriptions.filter(k => k !== x); state.recurring = state.recurring.filter(r => r.subId !== x.id); });
  },
  'sub-skip': () => { state.meta.subCheckSkip = todayISO().slice(0, 7); commit(); toast('Okay, I’ll ask next month'); },
  'scan-receipt': () => receiptModal(),
  'cal-day': el => { ui.calDay = ui.calDay === el.dataset.date ? null : el.dataset.date; render(); const b = document.querySelector(`[data-action="cal-day"][data-date="${el.dataset.date}"]`); if (b) b.focus(); },
  'cal-prev': () => { const [y, m] = (ui.calMonth || todayISO().slice(0, 7)).split('-').map(Number); ui.calMonth = F.toISO(new Date(y, m - 2, 1)).slice(0, 7); ui.calDay = null; render(); },
  'cal-next': () => { const [y, m] = (ui.calMonth || todayISO().slice(0, 7)).split('-').map(Number); ui.calMonth = F.toISO(new Date(y, m, 1)).slice(0, 7); ui.calDay = null; render(); },
  'cal-today': () => { ui.calMonth = null; ui.calDay = null; render(); },
  'cal-ics': () => downloadIcs(),
  'tax-deadlines': () => {
    const list = taxDeadlinePresets(state.settings.country);
    if (!list) { toast('No preset dates for your country yet. Add them with “Add a deadline”.'); return; }
    state.wallet.deadlines.push(...list); commit();
    toast(`Added the usual ${countryInfo(state.settings.country).name} tax dates. Double-check them each year`, 4000);
  }
};

/* ---------- App-icon shortcuts: #do/<action> ---------- */
const DEEP_ACTIONS = ['add-expense', 'scan-receipt', 'import-sms', 'open-palette'];
function handleDeepLink() {
  const m = /^#do\/([a-z-]+)$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', '#dashboard');
  render();
  if (DEEP_ACTIONS.includes(m[1])) setTimeout(() => ACTIONS[m[1]](document.body), 50);
  return true;
}

