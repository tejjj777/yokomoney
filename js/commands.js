/* YOKO! Student · Daily tick (month rollover, recurring, rewards), actions, CSV and commands.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* ---------- Daily tick: month rollover, recurring payments, rewards ---------- */
let lastTick = '';
function dailyTick() {
  lastTick = todayISO();
  const p = postRecurring();     // log bills first, so they land in the month they were due
  const rolled = rolloverMonth();
  evaluateRewards();
  save();
  if (rolled.length) toast(rolled.length === 1 ? `New month. ${monthLabelISO(rolled[0])} is saved under Month by month` : `New month. ${monthLabelISO(rolled[0])} to ${monthLabelISO(rolled[rolled.length - 1])} are saved under Month by month`, 4500);
  if (p.n) toast(`Logged ${plural(p.n, 'recurring payment')}: ${p.names.slice(0, 3).join(', ')}${p.names.length > 3 ? '…' : ''} (${fmt(p.total)})`, 4500);
  return !!(rolled.length || p.n);
}
function bindMore() {
  // "⋯" menus: close when clicking elsewhere or after picking an item
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="more-menu"]');
    const inMenu = e.target.closest('.more-menu');
    if (inMenu && e.target.closest('[role="menuitem"]')) { closeMoreMenus(); return; }
    if (!inMenu) closeMoreMenus(btn ? document.getElementById(btn.getAttribute('aria-controls')) : null);
  }, true);
  document.addEventListener('keydown', e => {
    const m = document.querySelector('.more-menu:not([hidden])');
    if (!m) return;
    const items = [...m.querySelectorAll('[role="menuitem"]')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMoreMenus(); const b = document.querySelector(`[aria-controls="${m.id}"]`); if (b) b.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') closeMoreMenus();
  }, true);
  document.addEventListener('change', e => {
    if (e.target.id === 'set-currency' && CURRENCIES[e.target.value]) { state.currency = e.target.value; commit(); }
    if (e.target.id === 'set-country' && COUNTRIES[e.target.value]) setCountry(e.target.value);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && lastTick && lastTick !== todayISO()) { if (dailyTick()) render(); } });
  document.addEventListener('keydown', e => {
    if (undoSnap && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); doUndo(); }
  }, true);
}

/* ---------- Actions, CSV and commands ---------- */
const byId = (list, id) => list.find(x => x.id === id);
const MORE_ACTIONS = {
  undo: () => doUndo(),
  'more-menu': el => toggleMoreMenu(el),
  'dismiss-undo': () => hideUndo(),
  'toggle-privacy': () => togglePrivacy(),
  'delete-debt': el => { const d = byId(state.debts, el.dataset.id); if (d) undoable(`Deleted “${d.name}”`, () => { state.debts = state.debts.filter(x => x !== d); state.recurring.forEach(r => { if (r.debtId === d.id) r.debtId = null; }); }); },
  'delete-goal': el => { const g = byId(state.goals, el.dataset.id); if (g) undoable(`Deleted goal “${g.name}”`, () => { state.goals = state.goals.filter(x => x !== g); }); },
  'delete-contribution': el => {
    const g = byId(state.goals, el.dataset.id), c = g && byId(g.contributions, el.dataset.cid);
    if (c) undoable(`Removed ${fmt(c.amount)} from ${g.name}`, () => { g.saved = Math.max(0, g.saved - c.amount); g.contributions = g.contributions.filter(x => x !== c); state.budget.expenses.forEach(e => { if (e.roundup && e.roundup.cid === c.id) delete e.roundup; }); });
  },
  'delete-gift': el => { const g = byId(state.gifts, el.dataset.id); if (g) undoable(`Deleted the gift for ${g.name}`, () => { state.gifts = state.gifts.filter(x => x !== g); }); },
  'delete-category': el => { const c = byId(state.budget.categories, el.dataset.id); if (c) undoable(`Deleted category “${c.name}”`, () => { state.budget.categories = state.budget.categories.filter(x => x !== c); }); },
  'delete-expense': el => {
    const x = byId(state.budget.expenses, el.dataset.id);
    if (x) undoable(`Removed ${fmt(x.amount)} expense`, () => {
      removeExpense(x);
      state.wallet.cash.forEach(c => { if (c.expenseId === x.id) c.expenseId = null; });
      state.wallet.transport.forEach(c => { if (c.expenseId === x.id) c.expenseId = null; });
    });
  },
  'delete-payslip': el => {
    const p = byId(state.payslips, el.dataset.id);
    if (p) undoable(`Deleted the ${monthLabelISO(p.month)} payslip`, () => { state.payslips = state.payslips.filter(x => x !== p); state.wallet.taxes = state.wallet.taxes.filter(x => x.payslipId !== p.id); });
  },
  'delete-cash': el => { const x = byId(state.wallet.cash, el.dataset.id); if (x) undoable(`Deleted ${fmt(x.amount)} cash entry`, () => { if (x.expenseId) removeExpenseById(x.expenseId); state.wallet.cash = state.wallet.cash.filter(k => k !== x); }); },
  'delete-iou': el => { const x = byId(state.wallet.ious, el.dataset.id); if (x) undoable(`Deleted the IOU with ${x.person}`, () => { state.wallet.ious = state.wallet.ious.filter(k => k !== x); }); },
  'delete-transport': el => { const x = byId(state.wallet.transport, el.dataset.id); if (x) undoable(`Deleted ${fmt(x.amount)} ${modeInfo(x.mode)[2]}`, () => { if (x.expenseId) removeExpenseById(x.expenseId); state.wallet.transport = state.wallet.transport.filter(k => k !== x); }); },
  'delete-tax': el => { const x = byId(state.wallet.taxes, el.dataset.id); if (x) undoable(`Deleted ${fmt(x.amount)} ${x.type}`, () => { state.wallet.taxes = state.wallet.taxes.filter(k => k !== x); }); },
  'delete-subscription': el => {
    const x = byId(state.subscriptions, el.dataset.id);
    if (x) undoable(`Removed ${x.name}. That’s ${fmt(subMonthly(x) * 12)} a year back`, () => { state.subscriptions = state.subscriptions.filter(k => k !== x); state.recurring = state.recurring.filter(r => r.subId !== x.id); });
  },
  'delete-bucket': el => { const b = byId(state.split.buckets, el.dataset.id); if (b) undoable(`Deleted bucket “${b.name}”`, () => { state.split.buckets = state.split.buckets.filter(x => x !== b); }); },
  'delete-deadline': el => { const d = byId(state.wallet.deadlines, el.dataset.id); if (d) undoable(`Deleted “${d.title}”`, () => { state.wallet.deadlines = state.wallet.deadlines.filter(x => x !== d); }); },
  'log-income': () => incomeForm(),
  'add-yearly': () => yearlyForm(null),
  'edit-yearly': el => { const x = byId(state.yearlyBills, el.dataset.id); if (x) yearlyForm(x); },
  'delete-yearly': el => { const x = byId(state.yearlyBills, el.dataset.id); if (x) undoable(`Deleted “${x.name}”`, () => { state.yearlyBills = state.yearlyBills.filter(k => k !== x); }); },
  'yearly-to-budget': () => {
    const monthly = Math.round(sum(yearlyRows(), r => r.amount / 12) * 100) / 100;
    let c = state.budget.categories.find(k => YEARLY_CAT.test(k.name));
    if (!c) { c = { id: uid(), name: 'Yearly bills', type: 'needs', planned: 0, actual: 0, bucketId: guessBucket({ name: 'Yearly bills', type: 'needs' }, state.split.buckets) }; state.budget.categories.push(c); }
    c.planned = monthly; commit(); toast(`“${c.name}” now plans ${fmt(monthly)} a month`);
  },
  'exp-more': () => { ui.expMore = !(ui.expMore || expFilterActive(Object.assign(emptyExpFilter(), ui.expFilter, { q: '', cat: '' }))); render(); const el = document.getElementById(ui.expMore ? 'exp-min' : 'exp-q'); if (el) el.focus(); },
  'exp-clear': () => { ui.expFilter = emptyExpFilter(); ui.expMore = false; render(); const el = document.getElementById('exp-q'); if (el) el.focus(); },
  'split-expense': () => splitExpenseForm(),
  'cat-expenses': el => { ui.expFilter = Object.assign(emptyExpFilter(), { cat: el.dataset.id, from: periodRange().from }); location.hash = '#budget/spending'; render(); },
  'new-month': () => {
    const ym = todayISO().slice(0, 7);
    undoable('Month closed. It’s saved under Month by month, and spending counts from today', () => closeMonthEarly());
  },
  'export-json': () => downloadBackup(),
  'backup-download': () => downloadBackup(),
  'backup-link': () => linkBackupFile(),
  'backup-reconnect': () => reconnectBackup(),
  'backup-unlink': () => unlinkBackup(),
  'backup-snooze': () => { state.meta.backupSnooze = F.toISO(F.addDays(todayDate(), 7)); save(); render(); toast('Okay, I’ll remind you next week'); },
  'install-app': async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) { /* ignore */ } installPrompt = null; },
  'add-recurring': () => billsChecklist(),
  'edit-recurring': el => { const r = byId(state.recurring, el.dataset.id); if (r) recurringForm(r); },
  'toggle-recurring': el => {
    const r = byId(state.recurring, el.dataset.id); if (!r) return;
    r.active = !r.active;
    if (r.active) { r.lastPosted = latestDueBefore(r); postRecurring(); }   // resuming doesn't back-fill the paused weeks
    commit(); toast(r.active ? `${r.name} is back on` : `${r.name} paused`);
  },
  'delete-recurring': el => { const r = byId(state.recurring, el.dataset.id); if (r) undoable(`Deleted “${r.name}”. Payments already logged are kept`, () => { state.recurring = state.recurring.filter(x => x !== r); }); },
  'recurring-subs': () => importSubsAsRecurring(),
  'recurring-emis': () => importEmisAsRecurring(),
  'import-sms': () => importModal('sms'),
  'import-statement': () => importModal('file'),
  'delete-rule': el => {
    const r = byId(state.rules, el.dataset.id); if (!r) return;
    state.rules = state.rules.filter(x => x !== r); save();
    const box = document.getElementById('rules-list'); if (box) box.innerHTML = rulesHTML();
    toast(`Forgot “${r.match}”`);
  },
  'should-i-buy': () => shouldIBuy(),
  'wish-buy': el => { const w = byId(state.wishlist, el.dataset.id); if (!w) return; const r = buyItNow(w.name, w.price); if (!r) return; w.status = 'bought'; w.decidedAt = todayISO(); commit(); expenseToast(w.price, r); },
  'wish-skip': el => { const w = byId(state.wishlist, el.dataset.id); if (w) skipPurchase(w.name, w.price, w); },
  'wish-delete': el => { const w = byId(state.wishlist, el.dataset.id); if (w) undoable(`Removed ${w.name} from the wishlist`, () => { state.wishlist = state.wishlist.filter(x => x !== w); }); },
  'split-bill': () => splitBillForm(),
  'add-challenge': () => challengeForm(),
  'c52-deposit': el => { const c = byId(state.challenges, el.dataset.id); if (c) week52Deposit(c); },
  'retry-challenge': el => { const c = byId(state.challenges, el.dataset.id); if (!c) return; c.start = todayISO(); c.failed = false; c.rewarded = false; commit(); toast('Restarted from today'); },
  'delete-challenge': el => { const c = byId(state.challenges, el.dataset.id); if (c) undoable('Challenge deleted', () => { state.challenges = state.challenges.filter(x => x !== c); }); },
  'pet-poke': () => {
    ui.petPokes = (ui.petPokes || 0) + 1;
    const svgEl = document.querySelector('.pet-svg');
    const say = document.querySelector('.pet-say');
    if (say) say.textContent = `“${pickDaily(PET_LINES[petMood()], 'pet' + ui.petPokes)}”`;
    if (svgEl) { svgEl.classList.remove('boing'); void svgEl.getBoundingClientRect(); svgEl.classList.add('boing'); }
    if (ui.petPokes % 5 === 0) playSound('coin');
  }
};
function latestDueBefore(r) {
  const y = F.toISO(F.addDays(todayDate(), -1));
  const due = F.recurringDue(r, r.lastPosted, y, 2000);
  return due.length ? due[due.length - 1] : r.lastPosted;
}
const MORE_CSV = {
  history: () => [['Month', 'Income', 'Spent (needs + wants)', 'Saved', 'Category', 'Type', 'Planned', 'Actual']].concat(
    state.history.flatMap(h => h.cats.map(c => [h.month, r2(h.income), r2(histSpent(h)), r2(histSaved(h)), c.name, c.type, r2(c.planned), r2(c.actual)]))),
  recurring: () => [['Name', 'Amount', 'Repeats', 'Schedule', 'Category', 'Pays down debt', 'Active', 'Last posted']].concat(
    state.recurring.map(r => [r.name, r2(r.amount), r.freq, recurringSchedule(r), (state.budget.categories.find(c => c.id === r.categoryId) || { name: '' }).name, (state.debts.find(d => d.id === r.debtId) || { name: '' }).name, r.active ? 'yes' : 'no', r.lastPosted]))
};
function moreCommands() {
  return [
    { label: 'Scan a receipt…', keys: 'receipt scan photo bill', run: () => receiptModal() },
    { label: 'Split an expense…', keys: 'split expense categories divide', run: () => splitExpenseForm() },
    { label: 'Log income received…', keys: 'income received got paid freelance client money in', run: () => incomeForm() },
    { label: 'Add a yearly bill…', keys: 'yearly annual bill insurance renewal sinking', run: () => yearlyForm(null) },
    { label: 'Where did my money go?', keys: 'where money go compare last month breakdown spending', run: () => { location.hash = '#budget/history'; } },
    { label: 'Search expenses…', keys: 'search find expense old filter', run: () => { location.hash = '#budget/spending'; setTimeout(() => { const el = document.getElementById('exp-q'); if (el) el.focus(); }, 50); } },
    { label: 'Paste a bank message…', keys: 'sms upi bank message text notification paste import', run: () => importModal('sms') },
    { label: 'Import bank statement (CSV / PDF)…', keys: 'import statement bank csv pdf', run: () => importModal('file') },
    { label: 'Add bills…', keys: 'recurring autopay rent emi bill repeat internet phone', run: () => billsChecklist() },
    { label: 'Split a bill…', keys: 'split bill dinner friends iou', run: () => splitBillForm() },
    { label: 'Should I buy it?…', keys: 'buy should wishlist impulse', run: () => shouldIBuy() },
    { label: 'New challenge…', keys: 'challenge no-spend 52 week cap', run: challengeForm },
    { label: state.settings.privacy ? 'Privacy mode off (show amounts)' : 'Privacy mode on (blur amounts)', keys: 'privacy blur hide amounts', run: togglePrivacy },
    { label: 'Download backup', keys: 'backup download save json', run: downloadBackup },
    ...(BK.supported ? [{ label: 'Auto-backup to a file…', keys: 'backup link file auto', run: linkBackupFile }] : []),
    ...['off', 'nice', 'savage'].map(m => ({ label: `Roast mode: ${m}`, keys: `roast mode ${m} funny`, run: () => { state.settings.roast = m; save(); render(); toast(m === 'off' ? 'Roast mode off' : m === 'nice' ? 'Roast mode: nice' : 'Roast mode: savage'); } }))
  ];
}
function moreParse(q, words, low) {
  const out = [];
  if (low[0] === 'split' && words.length >= 2) {
    const amt = parseAmount(words[1]);
    const names = words.slice(2).filter(w => !/^(with|between|and)$/i.test(w)).join(', ');
    if (amt) out.push({ parsed: true, label: `Split ${fmt(amt)}${names ? ` with ${names}` : ''}…`, run: () => splitBillForm({ total: amt, people: names, what: 'Shared bill' }) });
  }
  const bi = low[0] === 'buy' ? 1 : (low[0] === 'should' && low[1] === 'i' && low[2] === 'buy') ? 3 : -1;
  if (bi > 0) {
    const amtIdx = words.findIndex((w, k) => k >= bi && parseAmount(w));
    const amt = amtIdx >= 0 ? parseAmount(words[amtIdx]) : null;
    const name = words.filter((w, k) => k >= bi && k !== amtIdx).join(' ').slice(0, 60);
    out.push({ parsed: true, label: `Should I buy ${name || 'it'}${amt ? ` for ${fmt(amt)}` : ''}?`, run: () => shouldIBuy({ name, price: amt || undefined }) });
  }
  return out;
}

function moreSettingsHTML() {
  const s = state.settings;
  return `<div class="settings-group"><h3>Country and currency</h3><div class="form-grid two">
    <div class="field"><label for="set-country">Country</label><select id="set-country" class="select">${Object.keys(COUNTRIES).map(k => [k, countryInfo(k).name]).sort((a, b) => (a[0] === 'OTHER') - (b[0] === 'OTHER') || a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${k}" ${state.settings.country === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><p class="help">Sets your tax year, tax dates and how dates are read.</p></div>
    <div class="field"><label for="set-currency">Currency</label><select id="set-currency" class="select">${Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}" ${state.currency === code ? 'selected' : ''}>${esc(c.symbol)} ${code}</option>`).join('')}</select><p class="help">Only changes the symbol. Amounts aren’t converted.</p></div>
  </div></div>
  <div class="settings-group"><h3>Privacy and extras</h3><div class="form-grid two">
    <div class="field"><span class="field-label">Privacy mode</span><label class="check"><input type="checkbox" id="set-privacy" data-setting="privacy" data-kind="bool" ${s.privacy ? 'checked' : ''}> Blur all amounts</label><p class="help">Same as the eye button at the top.</p></div>
    <div class="field"><label for="set-roast">Roast mode</label><select id="set-roast" class="select" data-setting="roast" data-kind="select">${[['off', 'Off'], ['nice', 'Nice 😇'], ['savage', 'Savage 🔥']].map(([v, l]) => `<option value="${v}" ${s.roast === v ? 'selected' : ''}>${l}</option>`).join('')}</select><p class="help">A little comment when you log stuff. Savage is mean.</p></div>
    <div class="field"><label for="set-pet">Your pet’s name</label><input id="set-pet" class="input" maxlength="20" value="${esc(s.petName)}" data-setting="petName" data-kind="text" aria-describedby="set-pet-err"><p class="field-error" id="set-pet-err"></p></div>
  </div></div>
  <div class="settings-group"><h3>Backups</h3><div id="backup-status">${backupStatusHTML()}</div></div>
  <div class="settings-group"><h3>Learned categories</h3><p class="small muted">Shops it’s learned to sort from your bank message and statement imports.</p><div id="rules-list">${rulesHTML()}</div></div>
  <div class="settings-group"><h3>Use it on your phone</h3>${installHTML()}</div>`;
}
function sampleMore(s, t) {
  const iso = d => F.toISO(d);
  const cat = re => s.budget.categories.find(c => re.test(c.name)) || s.budget.categories[0];
  const rec = (name, amount, start, c, extra = {}) => {
    const r = Object.assign({ id: uid(), name, amount, freq: 'monthly', start, lastPosted: '', categoryId: c.id, debtId: null, subId: null, active: true }, extra);
    const due = F.recurringDue(r, '', iso(t), 2000);
    r.lastPosted = due.length ? due[due.length - 1] : '';
    return r;
  };
  const back = (months, day) => iso(new Date(t.getFullYear(), t.getMonth() - months, day));
  s.recurring = [
    rec('Rent', 22000, back(3, 1), cat(/rent/i)),
    rec('Bike loan EMI', 2900, back(3, 5), cat(/loan|debt|emi/i), { debtId: s.debts[2].id }),
    rec('Netflix', 649, back(3, 12), cat(/subscri/i), { subId: s.subscriptions[0].id }),
    rec('Gym', 1500, iso(F.addDays(t, 6)), cat(/subscri/i), { subId: s.subscriptions[4].id })
  ];
  const factors = [0.93, 1.06, 0.97, 1.12, 0.95];
  s.history = factors.map((f, k) => ({
    month: back(5 - k, 1).slice(0, 7), income: 97000,
    cats: s.budget.categories.map((c, j) => ({ name: c.name, type: c.type, planned: c.planned,
      actual: Math.round(/rent|emi/i.test(c.name) ? c.planned : c.planned * f * (1 + ((j * 7 + k * 3) % 5 - 2) / 40)) }))
  }));
  s.rules = [{ id: uid(), match: 'swiggy', categoryId: cat(/food/i).id }];
  const now = Date.now();
  s.wishlist = [
    { id: uid(), name: 'Noise-cancelling headphones', price: 8999, addedAt: now - 20 * 3600e3, status: 'waiting', decidedAt: '' },
    { id: uid(), name: 'Sneakers', price: 4999, addedAt: now - 50 * 3600e3, status: 'waiting', decidedAt: '' },
    { id: uid(), name: 'Gaming chair', price: 3499, addedAt: now - 9 * 86400e3, status: 'skipped', decidedAt: iso(F.addDays(t, -7)) }
  ];
  const w52start = F.addDays(t, -33);
  s.challenges = [
    { id: uid(), type: 'nocat', start: iso(F.addDays(t, -5)), unit: 10, goalId: null, categoryId: cat(/fun/i).id, days: 14, cap: 0, deposits: [], rewarded: false, failed: false },
    { id: uid(), type: 'week52', start: iso(w52start), unit: 50, goalId: null, categoryId: '', days: 7, cap: 0,
      deposits: [1, 2, 3, 4].map(w => ({ week: w, date: iso(F.addDays(w52start, (w - 1) * 7)), amount: 50 * w })), rewarded: false, failed: false }
  ];
  s.xp = { total: 420 };
  Object.assign(s.meta, { tourVersion: state.meta.tourVersion || 0, tourChapters: Object.assign({}, state.meta.tourChapters), budgetMonth: iso(t).slice(0, 7), lastBackup: '', backupSnooze: '', skippedTotal: 3499, streakRewarded: 7, xpDay: { date: '', n: 0 }, xpBackup: '' });
}


