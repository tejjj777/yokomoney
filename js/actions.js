/* YOKO! Student · Click delegation (data-action handlers), quick add menu.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   ACTIONS (click delegation)
   ========================================================= */
/* Toasts queue up so a badge unlock never hides the message before it. */
const toastQ = [];
let toastBusy = false;
function toast(msg, ms = 2600) {
  toastQ.push([msg, ms]);
  while (toastQ.length > 2) toastQ.shift();   // never build a backlog of stale messages
  if (!toastBusy) nextToast();
}
function nextToast() {
  const el = document.getElementById('toast');
  const n = toastQ.shift();
  if (!el) { toastBusy = false; return; }
  if (!n) { toastBusy = false; el.classList.remove('show'); return; }
  toastBusy = true; el.textContent = n[0]; el.classList.add('show');
  const wait = () => setTimeout(nextToast, toastQ.length ? 0 : Math.max(0, n[1] - 1400));
  setTimeout(wait, 1400);   // each message shows at least 1.4s, longer if nothing is waiting
}
function loadSample() {
  if (hasAnyData() && !confirm('Replace your current data with sample data?')) return;
  state = sampleState();
  closeModal(true); commit(); toast('Sample data loaded');
}

const ACTIONS = {
  'open-paycheck': () => openPaycheckModal(),
  'open-semester-modal': () => openSemesterModal(),
  'open-settings': () => openSettings(),
  'close-modal': () => closeModal(),
  'budget-autopilot': () => budgetAutopilotModal(),
  print: () => window.print(),
  'load-sample': loadSample,
  'add-expense': () => expenseForm(),
  'add-debt': () => debtPicker(),
  'add-goal': () => goalPicker(),
  'add-gift': () => giftForm(null),
  'edit-debt': el => { const d = state.debts.find(x => x.id === el.dataset.id); if (d) debtForm(d); },
  'delete-debt': el => { const d = state.debts.find(x => x.id === el.dataset.id); if (d && confirm(`Delete “${d.name}”?`)) { state.debts = state.debts.filter(x => x !== d); commit(); toast('Debt deleted'); } },
  'edit-goal': el => { const g = state.goals.find(x => x.id === el.dataset.id); if (g) goalForm(g); },
  'delete-goal': el => { const g = state.goals.find(x => x.id === el.dataset.id); if (g && confirm(`Delete goal “${g.name}” and its history?`)) { state.goals = state.goals.filter(x => x !== g); commit(); toast('Goal deleted'); } },
  'add-money': el => { const g = state.goals.find(x => x.id === el.dataset.id); if (g) addMoneyForm(g); },
  'delete-contribution': el => {
    const g = state.goals.find(x => x.id === el.dataset.id); if (!g) return;
    const c = g.contributions.find(x => x.id === el.dataset.cid); if (!c || !confirm(`Remove this ${fmt(c.amount)} contribution? It will be subtracted from the saved amount.`)) return;
    g.saved = Math.max(0, g.saved - c.amount); g.contributions = g.contributions.filter(x => x !== c); state.budget.expenses.forEach(e => { if (e.roundup && e.roundup.cid === c.id) delete e.roundup; }); commit();
  },
  'edit-gift': el => { const g = state.gifts.find(x => x.id === el.dataset.id); if (g) giftForm(g); },
  'delete-gift': el => { const g = state.gifts.find(x => x.id === el.dataset.id); if (g && confirm(`Delete the gift for ${g.name}?`)) { state.gifts = state.gifts.filter(x => x !== g); commit(); toast('Gift deleted'); } },
  'add-category': el => {
    const c = { id: uid(), name: 'New category', type: 'wants', planned: 0, actual: 0, bucketId: (el && el.dataset && el.dataset.bucket) || '' };
    state.budget.categories.push(c); commit();
    const inp = document.getElementById(`cat-name-${c.id}`); if (inp) { inp.focus(); inp.select(); }
  },
  'delete-category': el => {
    const c = state.budget.categories.find(x => x.id === el.dataset.id); if (!c) return;
    if (!confirm(`Delete category “${c.name}”?`)) return;
    state.budget.categories = state.budget.categories.filter(x => x !== c); commit();
  },
  'delete-expense': el => {
    const x = state.budget.expenses.find(e => e.id === el.dataset.id); if (!x) return;
    removeExpense(x);   // also undoes its round-up
    state.wallet.cash.forEach(c => { if (c.expenseId === x.id) c.expenseId = null; });
    state.wallet.transport.forEach(c => { if (c.expenseId === x.id) c.expenseId = null; });
    commit(); toast('Expense removed');
  },
  'open-payslip': () => openPayslipModal(),
  'reuse-payslip': el => {
    const p = state.payslips.find(x => x.id === el.dataset.id); if (!p) return;
    const r = { gross: p.gross, net: p.net, tax: p.tax, pf: p.pf, pt: p.pt, esi: p.esi, other: p.other, month: p.month, employer: p.employer, payDate: null };
    openPayslipModal(null, { r, meta: { source: 'history' } });
  },
  'delete-payslip': el => {
    const p = state.payslips.find(x => x.id === el.dataset.id); if (!p) return;
    const linked = state.wallet.taxes.filter(x => x.payslipId === p.id);
    if (!confirm(`Delete the ${monthLabelISO(p.month)} payslip${linked.length ? ' and the tax it logged' : ''}?`)) return;
    state.payslips = state.payslips.filter(x => x !== p);
    state.wallet.taxes = state.wallet.taxes.filter(x => x.payslipId !== p.id);
    commit(); toast('Payslip deleted');
  },
  'cash-in': () => cashForm('in'),
  'cash-out': () => cashForm('out'),
  'edit-expense': el => { const x = state.budget.expenses.find(k => k.id === el.dataset.id); if (x) expenseForm(x); },
  'edit-transport': el => { const x = state.wallet.transport.find(k => k.id === el.dataset.id); if (x) transportForm(x); },
  'edit-tax': el => { const x = state.wallet.taxes.find(k => k.id === el.dataset.id); if (x) taxForm(x); },
  'edit-deadline': el => { const x = state.wallet.deadlines.find(k => k.id === el.dataset.id); if (x) deadlineForm(x); },
  'edit-wish': el => { const x = state.wishlist.find(k => k.id === el.dataset.id); if (x) wishEditForm(x); },
  'edit-challenge': el => { const x = state.challenges.find(k => k.id === el.dataset.id); if (x) challengeEditForm(x); },
  'edit-contribution': el => { const g = state.goals.find(k => k.id === el.dataset.id), c = g && g.contributions.find(k => k.id === el.dataset.cid); if (c) contributionForm(g, c); },
  'edit-cash': el => { const x = state.wallet.cash.find(k => k.id === el.dataset.id); if (x) cashForm(x.type, x); },
  'delete-cash': el => {
    const x = state.wallet.cash.find(k => k.id === el.dataset.id); if (!x) return;
    if (!confirm(`Delete this ${fmt(x.amount)} cash entry${x.expenseId ? ' and its budget expense' : ''}?`)) return;
    if (x.expenseId) removeExpenseById(x.expenseId);
    state.wallet.cash = state.wallet.cash.filter(k => k !== x); commit();
  },
  'add-iou': () => iouForm(null),
  'split-bill': () => billSplitterModal(),
  'settle-person': el => { const p = el.dataset.person; if (p) settleUpModal(p); },
  'ask-topup': () => openTopUpModal(),
  'edit-iou': el => { const x = state.wallet.ious.find(k => k.id === el.dataset.id); if (x) iouForm(x); },
  'settle-iou': el => { const x = state.wallet.ious.find(k => k.id === el.dataset.id); if (x) settleUpModal(x.person); },
  'delete-iou': el => {
    const x = state.wallet.ious.find(k => k.id === el.dataset.id);
    if (x && confirm(`Delete the IOU with ${x.person}? Cash entries already logged stay.`)) { state.wallet.ious = state.wallet.ious.filter(k => k !== x); commit(); }
  },
  'add-transport': () => transportForm(),
  'delete-transport': el => {
    const x = state.wallet.transport.find(k => k.id === el.dataset.id); if (!x) return;
    if (!confirm(`Delete this ${fmt(x.amount)} ${modeInfo(x.mode)[2]} entry${x.expenseId ? ' and its budget expense' : ''}?`)) return;
    if (x.expenseId) removeExpenseById(x.expenseId);
    state.wallet.transport = state.wallet.transport.filter(k => k !== x); commit();
  },
  'add-tax': () => taxForm(),
  'delete-tax': el => {
    const x = state.wallet.taxes.find(k => k.id === el.dataset.id);
    if (x && confirm(`Delete this ${fmt(x.amount)} ${x.type} payment?`)) { state.wallet.taxes = state.wallet.taxes.filter(k => k !== x); commit(); }
  },
  'add-deadline': () => deadlineForm(),
  'india-deadlines': () => ACTIONS['tax-deadlines'](),
  'delete-deadline': el => { state.wallet.deadlines = state.wallet.deadlines.filter(k => k.id !== el.dataset.id); commit(); },
  'jump': el => {
    const target = document.getElementById(el.dataset.to);
    if (!target) return;
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const h = target.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  },
  'new-month': () => {
    undoable('Month closed. It’s saved under Month by month, and spending counts from today', () => closeMonthEarly());
  },
  'add-bucket': () => {
    const b = { id: uid(), role: 'custom', name: 'New bucket', mode: 'amount', value: 0 };
    state.split.buckets.push(b); commit();
    const el = document.getElementById(`bk-name-${b.id}`); if (el) { el.focus(); el.select(); }
  },
  'delete-bucket': el => { state.split.buckets = state.split.buckets.filter(b => b.id !== el.dataset.id); commit(); },
  'choose-strategy': el => { state.debtSettings.strategy = el.dataset.strategy === 'snowball' ? 'snowball' : 'avalanche'; commit(); },
  'use-split-debt': () => {
    const monthly = bucketMonthly('debt');
    if (!(monthly > 0)) { toast('Set an amount for the Debt bucket in your paycheck split first.', 4000); return; }
    const mins = sum(state.debts.filter(d => d.balance > 0), d => d.minPayment);
    state.debtSettings.extra = Math.max(0, monthly - mins); commit();
    toast(monthly >= mins ? `Debt bucket ${fmt(monthly)}/mo − minimums ${fmt(mins)} = ${fmt(monthly - mins)} extra` : `Debt bucket (${fmt(monthly)}/mo) doesn’t cover minimums (${fmt(mins)}). Extra set to 0.`, 5000);
  },
  'use-split-goals': () => {
    const monthly = bucketMonthly('goals');
    if (!(monthly > 0)) { toast('Set an amount for the Savings Goals bucket in your paycheck split first.', 4000); return; }
    const active = state.goals.filter(g => !goalInfo(g).reached);
    if (!active.length) { toast('All goals are already reached.'); return; }
    const req = active.map(g => { const r = goalInfo(g).required; return Number.isFinite(r) && r > 0 ? r : 0; });
    const tot = sum(req);
    active.forEach((g, i) => { g.planMonthly = tot > 0 ? monthly * req[i] / tot : monthly / active.length; });
    commit(); toast(`${fmt(monthly)}/month split across ${active.length} goal${active.length === 1 ? '' : 's'} by what each needs`, 4000);
  },
  'open-palette': () => openPalette(),
  'start-tour': () => openTutorialHub(),
  'open-tutorials': () => openTutorialHub(),
  'tour-all': () => startTour(CHAPTER_ORDER),
  'tour-new': () => startTour(['new']),
  'tour-chapter': el => startTour([el.dataset.chapter]),
  'tour-page': el => startTour([el.dataset.chapter]),
  'enable-notifs': () => {
    state.meta.notifPromptDismissed = true;
    const done = p => { commit(); toast(p === 'granted' ? 'Alerts are on. You’ll hear from YOKO! at 80% and 100% of a budget.' : 'No problem. Alerts will show inside YOKO! instead.', 4500); };
    try { Promise.resolve(Notification.requestPermission()).then(done, () => done('denied')); } catch (e) { done('denied'); }
  },
  'dismiss-notifs': () => { state.meta.notifPromptDismissed = true; commit(); },
  'onboard-sample': () => {
    state = sampleState(); markTourSeen();
    checkBadges(true); save(); closeModal(true); render();
    setTimeout(() => toast('This is sample data. Remove it any time from the banner on Home', 5000), 150);
  },
  'tour-sample': () => {
    state = sampleState(); markTourSeen();
    checkBadges(true); save(); closeModal(true); render(); startTour(CHAPTER_ORDER);
  },
  'toggle-theme': () => toggleTheme(),
  'open-wrapped': () => openWrapped(),
  'download-wrapped': () => {
    if (!wrappedCanvas) return;
    wrappedCanvas.toBlob(b => { if (b) downloadFile(`yoko-wrapped-${todayISO().slice(0, 7)}.png`, b, 'image/png'); }, 'image/png');
  },
  'hit-debt': el => { const d = state.debts.find(x => x.id === el.dataset.id); if (d) hitForm(d); },
  'add-subscription': () => subsChecklist(),
  'review-sub-sugs': () => subSuggestModal(true),
  'sub-price-ok': el => {
    const x = byId(state.subscriptions, el.dataset.id); if (!x || !x.priceChange) return;
    x.amount = x.priceChange.to; delete x.priceChange;
    state.recurring.forEach(r => { if (r.subId === x.id) r.amount = x.amount; });
    commit(); toast(`${x.name} is now ${fmt(x.amount)}`);
  },
  'sub-price-dismiss': el => { const x = byId(state.subscriptions, el.dataset.id); if (x) { delete x.priceChange; commit(); } },
  'edit-subscription': el => { const x = state.subscriptions.find(k => k.id === el.dataset.id); if (x) subscriptionForm(x); },
  'delete-subscription': el => {
    const x = state.subscriptions.find(k => k.id === el.dataset.id);
    if (x && confirm(`Stop tracking ${x.name}?`)) { state.subscriptions = state.subscriptions.filter(k => k !== x); commit(); toast(`Removed ${x.name}. That’s ${fmt(subMonthly(x) * 12)} a year back`); }
  },
  'sync-subs': el => {
    const c = state.budget.categories.find(k => k.id === el.dataset.id); if (!c) return;
    c.planned = sum(state.subscriptions, subMonthly); commit(); toast(`${c.name} budget set to ${fmt(c.planned)}/month`);
  },
  'apply-whatif': () => {
    const r = document.getElementById('whatif-range'); if (!r) return;
    state.debtSettings.extra = Number(r.value); commit(); toast(`Extra payment set to ${fmt(state.debtSettings.extra)}/month`);
  },
  'reset-whatif': () => { const r = document.getElementById('whatif-range'); if (r) { r.value = Math.min(state.debtSettings.extra, Number(r.max)); updateWhatIf(); } },
  csv: el => { const key = el.dataset.csv; if (CSV[key]) downloadCSV(key, CSV[key]()); },
  'export-json': () => { downloadFile(`yoko-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded'); },
  'redo-setup': () => showOnboarding({ redo: true }),
  'remove-sample': () => {
    undoable('Sample data removed', () => {
      const keep = { currency: state.currency, country: state.settings.country, theme: state.settings.theme, sound: state.settings.sound, petName: state.settings.petName, meta: state.meta };
      state = defaultState();
      state.currency = keep.currency; state.settings.country = keep.country; state.settings.theme = keep.theme; state.settings.sound = keep.sound; state.settings.petName = keep.petName;
      Object.assign(state.meta, { tourDone: true, tourVersion: TOUR_VERSION, tourChapters: keep.meta.tourChapters || {}, isSample: false });
      state.wallet.taxYearStart = countryInfo(keep.country).fy;
    });
    setTimeout(() => { if (!syncReady()) showOnboarding(); }, 50);   // synced: the account's data comes back instead
  },
  'reset-all': () => {
    if (!confirm(syncReady() ? 'Reset ALL data? This also clears it on your other synced devices. This cannot be undone.' : 'Reset ALL data? This cannot be undone.')) return;
    const cur = state.currency; const ctry = state.settings.country; state = defaultState(); state.currency = cur; state.settings.country = ctry; state.meta.tourDone = true; state.meta.tourVersion = TOUR_VERSION;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    closeModal(true); commit(); showOnboarding();
  },
  'run-tests': () => {
    const r = runSelfTests();
    const out = document.getElementById('test-out');
    if (out) out.innerHTML = `<p class="small ${r.passed === r.total ? 'tone-success-text' : 'tone-danger-text'}" style="margin:8px 0;font-weight:600">${r.passed}/${r.total} passed</p>
      <ul class="test-list">${r.results.map(x => `<li class="${x.ok ? 'tone-success-text' : 'tone-danger-text'}">${x.ok ? '✓' : '✗'} ${esc(x.name)}</li>`).join('')}</ul>`;
  }
};

// GROUP_ACTIONS is a top-level const in js/groups.js, so it is not a window property: refer to it by name
Object.assign(ACTIONS, MORE_ACTIONS, SUB_ACTIONS, SYNC_ACTIONS, typeof GROUP_ACTIONS !== 'undefined' ? GROUP_ACTIONS : {});
Object.assign(CSV, MORE_CSV);

/* ---------- Quick Add menu ---------- */
const qaBtn = () => document.getElementById('quickadd-btn');
const qaMenu = () => document.getElementById('quickadd-menu');
function setMenu(open, focusFirst = true) {
  qaMenu().hidden = !open;
  qaBtn().setAttribute('aria-expanded', String(open));
  if (open && focusFirst) qaMenu().querySelector('button').focus();
}

