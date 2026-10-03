/* YOKO! Student · New-feature state, undo bar, privacy, backups, PWA install, recurring payments, month history.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   MORE: undo, privacy, backups, recurring payments, month
   history, SMS / statement import, OCR, install-as-app,
   money weather, roast mode, pet, XP, challenges
   cards, wishlist and bill splitting
   ========================================================= */
Object.assign(ICON, {
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>', 18),
  dots: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>', 20),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>', 18),
  inbox: svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>', 18)
});
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
function prevYM(ym) { const [y, m] = ym.split('-').map(Number); return F.toISO(new Date(y, m - 2, 1)).slice(0, 7); }
/** Stable pick from a list for the day, so text doesn't change on every re-render. */
function pickDaily(list, salt = '') {
  if (!list || !list.length) return '';
  const key = todayISO() + salt;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/* ---------- Undo bar (replaces "Are you sure?" pop-ups) ---------- */
let undoSnap = null, undoTimer = null;
/** Run a change, save it, and offer Undo for 7 seconds. `mutate` returning false cancels. */
function undoable(label, mutate) {
  const snap = JSON.stringify(state);
  if (mutate() === false) return;
  commit();
  undoSnap = snap;
  const bar = document.getElementById('undo-bar');
  bar.innerHTML = `<span class="undo-msg">${esc(label)}</span><button type="button" class="undo-btn" data-action="undo">Undo</button>
    <button type="button" class="icon-btn" data-action="dismiss-undo" aria-label="Dismiss">${ICON.close}</button>`;
  bar.hidden = false;
  document.body.classList.add('has-undo');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 7000);
}
function hideUndo() {
  clearTimeout(undoTimer);
  undoSnap = null;
  const bar = document.getElementById('undo-bar');
  if (bar) { bar.hidden = true; bar.innerHTML = ''; }
  document.body.classList.remove('has-undo');
}
function doUndo() {
  if (!undoSnap) return;
  const tourSeen = state.meta.tourDone, tourVer = state.meta.tourVersion, tourCh = state.meta.tourChapters;
  state = normalizeState(JSON.parse(undoSnap));
  Object.assign(state.meta, { tourDone: tourSeen, tourVersion: tourVer, tourChapters: tourCh });
  if (document.getElementById('ob-pay')) closeModal(true);   // undoing "Remove sample data" also drops the setup questions
  hideUndo(); save(); render();
  toast('Undone');
}

/* ---------- Privacy mode ---------- */
function applyPrivacy() {
  const on = !!state.settings.privacy;
  document.documentElement.dataset.privacy = on ? 'on' : 'off';
  const b = document.getElementById('privacy-btn');
  if (b) {
    b.innerHTML = on ? ICON.eyeOff : ICON.eye;
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Amounts are hidden. Click to show them' : 'Hide amounts';
  }
}
function togglePrivacy() {
  state.settings.privacy = !state.settings.privacy;
  save(); applyPrivacy();
  toast(state.settings.privacy ? 'Amounts hidden' : 'Amounts showing again');
}
function settingHook(key) {
  if (key === 'privacy') applyPrivacy();
}

/* ---------- Backups: a linked file that updates itself, plus a weekly reminder ---------- */
const BK = { handle: null, perm: 'none', timer: null, writing: false, supported: typeof window.showSaveFilePicker === 'function' };
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('yoko-student', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => { db.close(); res(req && req.result); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}
const idbGet = k => idbDo('readonly', st => st.get(k));
const idbSet = (k, v) => idbDo('readwrite', st => st.put(v, k));
const idbDel = k => idbDo('readwrite', st => st.delete(k));

function afterSave() { if (!BK.writing) scheduleBackup(); syncOnSave(); }
function markBackedUp() {
  state.meta.lastBackup = todayISO();
  if (state.meta.xpBackup !== todayISO()) { state.meta.xpBackup = todayISO(); awardXP(10, 'backup', true); }
  BK.writing = true; save(); BK.writing = false;
}
function scheduleBackup() {
  if (!BK.handle || BK.perm !== 'granted') return;
  clearTimeout(BK.timer);
  BK.timer = setTimeout(() => writeBackupNow(false), 2500);
}
async function writeBackupNow(announce) {
  if (!BK.handle || BK.perm !== 'granted') return false;
  try {
    const w = await BK.handle.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    markBackedUp();
    if (announce) toast(`Backed up to ${BK.handle.name || 'your file'}`);
    refreshBackupUI();
    return true;
  } catch (err) {
    console.warn('Backup write failed', err);
    BK.perm = 'prompt'; refreshBackupUI();
    return false;
  }
}
async function linkBackupFile() {
  if (!BK.supported) { toast('This browser can’t link a file. Use “Download backup” instead.'); return; }
  try {
    const h = await window.showSaveFilePicker({ suggestedName: 'yoko-backup.json', types: [{ description: 'YOKO! backup', accept: { 'application/json': ['.json'] } }] });
    BK.handle = h; BK.perm = 'granted';
    try { await idbSet('backupHandle', h); } catch (e) { /* this browser can't remember the file; it still works until you close the tab */ }
    await writeBackupNow(true);
    render();
  } catch (err) { if (!err || err.name !== 'AbortError') toast('Couldn’t link a backup file.'); }
}
async function reconnectBackup() {
  if (!BK.handle) return linkBackupFile();
  try {
    BK.perm = BK.handle.requestPermission ? await BK.handle.requestPermission({ mode: 'readwrite' }) : 'granted';
    if (BK.perm === 'granted') await writeBackupNow(true); else toast('Backup file not reconnected.');
  } catch (err) { toast('Couldn’t reconnect the backup file.'); }
  render();
}
async function unlinkBackup() {
  BK.handle = null; BK.perm = 'none';
  try { await idbDel('backupHandle'); } catch (e) { /* ignore */ }
  refreshBackupUI(); render(); toast('Backup file unlinked');
}
async function restoreBackupLink() {
  if (!BK.supported || !window.indexedDB) return;
  try {
    const h = await idbGet('backupHandle');
    if (!h) return;
    BK.handle = h;
    BK.perm = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'prompt';
    if (BK.perm === 'granted') scheduleBackup();
    render();
  } catch (e) { /* ignore */ }
}
function downloadBackup() {
  downloadFile(`yoko-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  markBackedUp(); render(); refreshBackupUI();
  toast('Backup downloaded. Keep it somewhere safe');
}
function daysSinceBackup() {
  const ref = F.parseDate(state.meta.lastBackup) || F.parseDate(state.meta.startedAt);
  return ref ? F.daysBetween(ref, todayDate()) : 0;
}
function sampleBanner() {
  if (!state.meta.isSample) return '';
  return `<div class="alert alert-info banner no-print" id="sample-banner"><span>You’re looking at <strong>sample data</strong>. When you’re ready for your own numbers, remove it. That clears everything, including anything you added while trying it out.</span>
    <span class="banner-actions"><button type="button" class="btn btn-sm btn-primary" data-action="remove-sample">Remove sample data</button></span></div>`;
}
function backupBanner() {
  if (state.meta.isSample) return '';   // no point backing up sample data
  if (BK.handle && BK.perm === 'prompt') {
    return `<div class="alert alert-warn banner no-print" id="backup-banner"><span>Your backup file <strong>${esc(BK.handle.name || '')}</strong> needs permission again.</span>
      <span class="banner-actions"><button type="button" class="btn btn-sm btn-primary" data-action="backup-reconnect">Reconnect</button></span></div>`;
  }
  if (!hasAnyData() || (BK.handle && BK.perm === 'granted') || syncReady()) return '';   // synced data is already kept safe in the account
  const days = daysSinceBackup();
  if (days < 7 || (state.meta.backupSnooze && state.meta.backupSnooze >= todayISO())) return '';
  const when = state.meta.lastBackup ? `Your last backup was ${plural(days, 'day')} ago.` : 'You haven’t made a backup yet.';
  return `<div class="alert alert-info banner no-print" id="backup-banner"><span>${when} Everything is saved only in this browser, so clearing it would wipe your data.</span>
    <span class="banner-actions"><button type="button" class="btn btn-sm btn-primary" data-action="backup-download">Download backup</button>
    <button type="button" class="btn btn-sm" data-action="backup-snooze">Later</button></span></div>`;
}
function backupStatusHTML() {
  let status;
  if (BK.handle && BK.perm === 'granted') status = `<span class="badge badge-success">Auto-backup on</span> Saves to <strong>${esc(BK.handle.name || 'your file')}</strong> whenever something changes.`;
  else if (BK.handle) status = `<span class="badge badge-warn">Paused</span> <strong>${esc(BK.handle.name || 'Your file')}</strong> needs permission again.`;
  else status = '<span class="badge badge-neutral">No backup file linked</span>';
  const last = state.meta.lastBackup ? `Last backup: ${fmtDate(F.parseDate(state.meta.lastBackup))}.` : 'No backup yet.';
  return `<p class="small">${status}</p><p class="small muted">${last} ${BK.handle ? '' : 'You’ll get a reminder if you go a week without one.'}</p>
    <div class="row">
      ${BK.supported ? (BK.handle ? `${BK.perm === 'granted' ? '' : '<button type="button" class="btn btn-primary" data-action="backup-reconnect">Reconnect</button>'}<button type="button" class="btn" data-action="backup-link">Change file</button><button type="button" class="btn" data-action="backup-unlink">Unlink</button>`
        : '<button type="button" class="btn btn-primary" data-action="backup-link">Link a backup file</button>') : ''}
      <button type="button" class="btn" data-action="backup-download">${ICON.download}<span>Download backup</span></button></div>
    ${BK.supported ? '<p class="help">The file gets updated a few seconds after every change. Keep it in a synced folder (Google Drive, OneDrive, iCloud) and you’ve got a copy off this device too.</p>'
      : '<p class="help">Automatic backups need Chrome or Edge on a computer. On here, just download a backup every so often. “Import data” restores it.</p>'}`;
}
function refreshBackupUI() { const el = document.getElementById('backup-status'); if (el) el.innerHTML = backupStatusHTML(); }

/* ---------- Install as an app (PWA) ---------- */
let installPrompt = null;
function setupPwa() {
  if (!/^https?:$/.test(location.protocol)) return;   // service workers need a web server; file:// just works offline anyway
  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
}
function installHTML() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '<p class="small"><span class="badge badge-success">Installed</span> You’re already using it as an app.</p>';
  const hosted = /^https?:$/.test(location.protocol);
  return `${installPrompt ? '<div class="row"><button type="button" class="btn btn-primary" data-action="install-app">Install YOKO! on this device</button></div>' : ''}
    <ol class="small steps-list">
      ${hosted ? '' : '<li>First the <strong>yoko</strong> folder has to be online. Easiest free way: drag it onto <strong>app.netlify.com/drop</strong>. There are steps in <em>HOW-TO-INSTALL.md</em>.</li>'}
      <li><strong>Android (Chrome):</strong> open the link, tap ⋮ → <em>Install app</em> or <em>Add to Home screen</em>.</li>
      <li><strong>iPhone (Safari):</strong> open the link, tap Share → <em>Add to Home Screen</em>.</li>
      <li>Once it’s installed, press and hold the app icon for shortcuts like <em>Scan a receipt</em> (Android and computers).</li>
      <li>Each device keeps its own data. Move it with <em>Download backup</em> here and <em>Import data</em> there.</li></ol>`;
}

/* ---------- Recurring payments (auto-posted) ---------- */
function recurringMonthly(r) { return r.freq === 'weekly' ? r.amount * 52 / 12 : r.freq === 'yearly' ? r.amount / 12 : r.amount; }
function recurringSchedule(r) {
  const s = F.parseDate(r.start);
  if (!s) return '';
  if (r.freq === 'weekly') return `Every ${DAY_NAMES[s.getDay()]}`;
  if (r.freq === 'yearly') return `Every year on ${s.getDate()} ${MONTHS[s.getMonth()]}`;
  return `Monthly on the ${ordinal(s.getDate())}`;
}
function recurringNext(r) {
  const until = F.toISO(F.addDays(todayDate(), 800));
  const list = F.recurringDue(r, r.lastPosted || F.toISO(F.addDays(todayDate(), -1)), until, 1);
  return list[0] ? F.parseDate(list[0]) : null;
}
function applyDebtPart(r, exp, date) {
  const d = state.debts.find(x => x.id === r.debtId);
  if (!d || d.balance <= 0) return;
  const periodRate = F.monthlyRate(d.rate) * (r.freq === 'weekly' ? 12 / 52 : r.freq === 'yearly' ? 12 : 1);
  const principal = clamp(r.amount - d.balance * periodRate, 0, d.balance);
  if (!(principal > 0.004)) return;
  const pid = uid();
  d.balance -= principal;
  d.payments.push({ id: pid, date, amount: principal });
  if (d.balance <= 0.005) { d.balance = 0; d.defeatedAt = date; }
  exp.debtPay = { debtId: d.id, pid, amount: principal };
}
/** Log every payment that has come due since it was last posted (at most 24 each). */
function postRecurring() {
  const today = todayISO();
  let n = 0, total = 0;
  const names = [];
  for (const r of state.recurring) {
    if (!r.active || !(r.amount > 0)) continue;
    const cat = state.budget.categories.find(c => c.id === r.categoryId);
    if (!cat) continue;
    const due = F.recurringDue(r, r.lastPosted, today, 24);
    for (const d of due) {
      const res = addExpense({ categoryId: cat.id, amount: r.amount, date: d, note: `🔁 ${r.name}`, noRoundup: true });
      res.exp.recurringId = r.id;
      if (r.debtId) applyDebtPart(r, res.exp, d);
      r.lastPosted = d; n++; total += r.amount;
    }
    if (due.length) names.push(r.name);
  }
  return { n, total, names };
}
function recurringForm(r, preset) {
  const cats = state.budget.categories;
  if (!cats.length) { toast('Add a budget category first.'); location.hash = '#budget'; return; }
  const debts = state.debts.filter(d => d.balance > 0 || (r && r.debtId === d.id));
  const v0 = r ? Object.assign({}, r, { debtId: r.debtId || '' }) : Object.assign({ freq: 'monthly', start: F.toISO(new Date(todayDate().getFullYear(), todayDate().getMonth() + 1, 1)), categoryId: cats[0].id, debtId: '' }, preset || {});
  formModal({
    title: r ? 'Edit recurring payment' : 'Add a recurring payment', submitLabel: r ? 'Save changes' : 'Add payment', values: v0,
    fields: [
      { name: 'name', label: 'What is it?', kind: 'text', required: true, placeholder: 'e.g. Rent, Netflix, car loan', wide: true },
      { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
      { name: 'freq', label: 'Repeats', kind: 'select', options: [['monthly', 'Every month'], ['weekly', 'Every week'], ['yearly', 'Every year']] },
      { name: 'start', label: r ? 'Schedule starts' : 'Next payment date', kind: 'date', required: true, help: r ? 'Changing this doesn’t re-log past payments.' : 'If this is in the past, the missed payments are logged right away.' },
      { name: 'categoryId', label: 'Budget category', kind: 'select', options: cats.map(c => [c.id, c.name]) },
      { name: 'debtId', label: 'Pays down a debt?', kind: 'select', options: [['', 'No'], ...debts.map(d => [d.id, d.name])], help: 'The principal part lowers that debt’s balance each time.', wide: true },
      ...(r ? [{ name: 'active', label: 'Active (untick to pause)', kind: 'check', wide: true }] : [])
    ],
    live: v => v.amount > 0 ? `<div class="alert alert-info">Works out to ${fmt(recurringMonthly({ amount: v.amount, freq: v.freq }))} a month. ${incomeHint(recurringMonthly({ amount: v.amount, freq: v.freq }))}</div>` : '',
    onSave: v => {
      const data = { name: v.name, amount: v.amount, freq: v.freq, start: v.start, categoryId: v.categoryId, debtId: v.debtId || null };
      if (r) { Object.assign(r, data); if (typeof v.active === 'boolean') r.active = v.active; }
      else state.recurring.push(Object.assign({ id: uid(), lastPosted: '', subId: (preset && preset.subId) || null, active: true }, data));
      const p = postRecurring();
      commit();
      toast(p.n ? `Saved. Logged ${plural(p.n, 'payment')} that were already due (${fmt(p.total)})` : `Saved. ${v.name} will log itself when it’s due`, 4000);
    }
  });
}
function nextMonthFirst() { const t = todayDate(); return F.toISO(new Date(t.getFullYear(), t.getMonth() + 1, 1)); }
function catLike(re, type) { return state.budget.categories.find(c => re.test(c.name)) || state.budget.categories.find(c => c.type === type) || state.budget.categories[0]; }
function importSubsAsRecurring() {
  const todo = state.subscriptions.filter(s => !state.recurring.some(r => r.subId === s.id));
  if (!todo.length) { toast('All subscriptions are already recurring payments.'); return; }
  const cat = catLike(/subscri|ott|stream/i, 'wants');
  if (!cat) { toast('Add a budget category first.'); return; }
  undoable(`Added ${plural(todo.length, 'subscription')}, due on the 1st. Change the dates if yours are different`, () => {
    todo.forEach(s => state.recurring.push({ id: uid(), name: s.name, amount: s.amount, freq: s.cycle === 'yearly' ? 'yearly' : 'monthly', start: nextMonthFirst(), lastPosted: '', categoryId: cat.id, debtId: null, subId: s.id, active: true }));
  });
}
function importEmisAsRecurring() {
  const todo = state.debts.filter(d => d.balance > 0 && d.minPayment > 0 && !state.recurring.some(r => r.debtId === d.id));
  if (!todo.length) { toast('Every active debt already has a recurring payment.'); return; }
  const cat = catLike(/emi|debt|loan/i, 'needs');
  if (!cat) { toast('Add a budget category first.'); return; }
  undoable(`Added ${plural(todo.length, 'loan payment')}, due on the 1st. Change the dates if yours are different`, () => {
    todo.forEach(d => state.recurring.push({ id: uid(), name: `${d.name} payment`, amount: d.minPayment, freq: 'monthly', start: nextMonthFirst(), lastPosted: '', categoryId: cat.id, debtId: d.id, subId: null, active: true }));
  });
}
function recurringCard() {
  const list = state.recurring.slice().sort((a, b) => (recurringNext(a) || 0) - (recurringNext(b) || 0));
  const monthly = sum(state.recurring.filter(r => r.active), recurringMonthly);
  const catName = id => (state.budget.categories.find(c => c.id === id) || { name: 'Missing category' }).name;
  const t = todayDate();
  const canSubs = state.subscriptions.some(s => !state.recurring.some(r => r.subId === s.id));
  const canEmis = state.debts.some(d => d.balance > 0 && d.minPayment > 0 && !state.recurring.some(r => r.debtId === d.id));
  const rows = list.map(r => {
    const nx = recurringNext(r), debt = r.debtId && state.debts.find(d => d.id === r.debtId);
    const missing = !state.budget.categories.some(c => c.id === r.categoryId);
    return `<tr class="${r.active ? '' : 'is-paused'}"><td><strong>${esc(r.name)}</strong><br><span class="small muted">${recurringSchedule(r)} · ${esc(catName(r.categoryId))}</span>
      ${debt ? `<br><span class="badge">Pays off ${esc(debt.name)}</span>` : ''}${missing ? '<br><span class="badge badge-danger">Its category was deleted. Edit it to pick a new one</span>' : ''}</td>
      <td class="num">${fmt(r.amount)}</td>
      <td>${r.active ? (nx ? `${fmtDate(nx)}<br><span class="small muted">${daysLabel(F.daysBetween(t, nx))}</span>` : '—') : '<span class="badge badge-neutral">Paused</span>'}</td>
      <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-recurring" data-id="${r.id}" aria-label="Edit ${esc(r.name)}">${ICON.edit}</button>
        <button type="button" class="icon-btn danger" data-action="delete-recurring" data-id="${r.id}" aria-label="Delete ${esc(r.name)}">${ICON.trash}</button></td></tr>`;
  }).join('');
  return `<div class="card mb" id="recurring-card"><div class="card-head"><div><h2>Recurring payments</h2>
      <p class="muted small">These get logged on their due date${state.recurring.length ? `. ${fmt(monthly)} a month in total` : ''}.</p></div>
    <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-recurring">${ICON.plus}<span>Add</span></button>
      ${moreMenu([canSubs ? mi('Add my subscriptions', 'recurring-subs') : '', canEmis ? mi('Add my loan payments', 'recurring-emis') : '', csvItem('recurring', 'recurring payments')])}</div></div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Payment</th><th class="num" scope="col">Amount</th><th scope="col">Next</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">${incomeHint(monthly)} They show up in the expense log with a 🔁.</p>`
      : '<div class="chart-empty"><p>Nothing here yet. Add rent, loan payments or subscriptions once and they’ll get logged every time they’re due.</p></div>'}
  </div>`;
}

/* ---------- Month history ---------- */
function snapshotMonth(ym, from, to) {
  const cats = state.budget.categories, m = spentByCategory(from, to);
  if (!cats.some(c => (m[c.id] || 0) > 0 || c.planned > 0)) return false;
  const entry = { month: ym, income: monthlyIncome(), cats: cats.map(c => ({ name: c.name, type: c.type, planned: c.planned, actual: Math.round((m[c.id] || 0) * 100) / 100 })) };
  const old = state.history.find(h => h.month === ym);
  if (old) {
    entry.cats.forEach(c => {
      const o = old.cats.find(k => k.name.toLowerCase() === c.name.toLowerCase());
      if (o) { o.actual += c.actual; o.planned = c.planned; o.type = c.type; } else old.cats.push(c);
    });
    old.income = entry.income;
  } else state.history.push(entry);
  state.history.sort((a, b) => a.month.localeCompare(b.month));
  while (state.history.length > 36) state.history.shift();
  return true;
}
/** "My month ends on payday": file what's been spent so far and count from today. */
function closeMonthEarly() {
  const r = periodRange(), yest = F.toISO(F.addDays(todayDate(), -1));
  if (yest < r.from) { setTimeout(() => toast('This month only just started, so there’s nothing to close yet'), 0); return false; }
  snapshotMonth(yest.slice(0, 7), r.from, yest);
  state.meta.periodStart = todayISO();
  state.meta.closedEarly = todayISO().slice(0, 7);
}
/** On the first open of a new month: file last month away and start this month's actuals from its logged expenses. */
function rolloverMonth() {
  const ym = todayISO().slice(0, 7), bm = state.meta.budgetMonth;
  if (!bm || bm >= ym) { state.meta.budgetMonth = bm && bm <= ym ? bm : ym; return []; }
  const nextYM = m => { const [y, mo] = m.split('-').map(Number); return F.toISO(new Date(y, mo, 1)).slice(0, 7); };
  const endOf = m => { const [y, mo] = m.split('-').map(Number); return F.toISO(new Date(y, mo, 0)); };
  const early = state.meta.closedEarly === bm;   // already filed when they closed it early
  let from = state.meta.periodStart && state.meta.periodStart <= bm + '-31' ? state.meta.periodStart : bm + '-01';
  const saved = [];
  if (!early) { if (snapshotMonth(bm, from, endOf(bm))) saved.push(bm); from = null; }
  // Months the app wasn't opened at all still get filed (bills were logged in them)
  for (let m = nextYM(bm), n = 0; m < ym && n < 36; m = nextYM(m), n++) {
    if (snapshotMonth(m, from || m + '-01', endOf(m))) saved.push(m);
    from = null;
  }
  state.meta.periodStart = from || ym + '-01';   // closed early with no gap: this month counts from that day
  state.meta.closedEarly = '';
  state.meta.budgetMonth = ym;
  syncActuals();
  return saved;
}
const histSpent = h => sum(h.cats.filter(c => c.type !== 'savings'), c => c.actual);
const histSaved = h => sum(h.cats.filter(c => c.type === 'savings'), c => c.actual);
function lastMonthEntry() { const p = prevYM(todayISO().slice(0, 7)); return state.history.find(h => h.month === p) || null; }
function lastMonthCell(c, last) {
  if (!last) return '';
  const o = last.cats.find(k => k.name.toLowerCase() === c.name.toLowerCase());
  if (!o) return '<td class="small muted">new</td>';
  const more = c.actual - o.actual;
  const flag = more > 0.5 ? (c.type === 'savings' ? `<br><span class="small tone-success-text">▲ ${fmt(more)} more</span>` : `<br><span class="small tone-warn-text">▲ ${fmt(more)} over</span>`) : '';
  return `<td class="num">${fmt(o.actual)}${flag}</td>`;
}
function historyCard() {
  const hist = state.history.slice(-11);
  if (!hist.length) {
    return `<div class="card mb" id="history-card"><div class="card-head"><div><h2>Month by month</h2><p class="muted small">Your first month isn’t over yet.</p></div></div>
      <p class="muted small">On the 1st, this month gets saved here and your actual amounts reset (your plan stays the same). Trends show up after that.</p></div>`;
  }
  const b = budgetTotals(), cur = { month: todayISO().slice(0, 7), income: b.income, spent: b.actual - b.byType.savings.actual };
  const last = hist[hist.length - 1], prev3 = hist.slice(-3);
  const avg = sum(prev3, histSpent) / prev3.length;
  const f = F.monthForecast({ today: todayDate(), needs: b.byType.needs, wants: b.byType.wants, savings: { planned: 0, actual: 0 }, income: b.income });
  const movers = state.budget.categories.map(c => { const o = last.cats.find(k => k.name.toLowerCase() === c.name.toLowerCase()); return { c, d: o ? c.actual - o.actual : 0 }; })
    .filter(x => x.c.type !== 'savings' && x.d > 0).sort((a, z) => z.d - a.d);
  const best = hist.filter(h => h.income > 0).reduce((m, h) => (!m || histSpent(h) / h.income < histSpent(m) / m.income ? h : m), null);
  const rows = hist.slice().reverse().map(h => `<tr><td>${monthLabelISO(h.month)}</td><td class="num">${fmt(h.income)}</td><td class="num">${fmt(histSpent(h))}</td><td class="num">${fmt(histSaved(h))}</td><td class="num">${h.income > 0 ? fmtPct(histSpent(h) / h.income * 100) : '—'}</td></tr>`).join('');
  return `<div class="card mb" id="history-card"><div class="card-head"><div><h2>Month by month</h2><p class="muted small">What you spent on needs and wants, against your income. This month is so far.</p></div><div class="actions">${csvBtn('history', 'month history')}</div></div>
    <div class="chart-box"><canvas id="hist-chart" role="img" aria-label="Spending by month chart"></canvas></div>
    <ul class="insights small">
      <li>Average spend over the last ${plural(prev3.length, 'month')}: <strong class="num">${fmt(avg)}</strong>. This month looks like it’ll end around <strong class="num">${fmt(f.projected)}</strong>, which is ${f.projected <= avg ? '<span class="tone-success-text">less than usual</span>' : '<span class="tone-warn-text">more than usual</span>'}.</li>
      ${best ? `<li>Your best month was <strong>${monthLabelISO(best.month)}</strong>, when you spent ${fmtPct(histSpent(best) / best.income * 100)} of your income.</li>` : ''}
    </ul>
    <details class="collapsible" data-open-key="hist-table" ${openAttr('hist-table')}><summary>All months (${hist.length})</summary><div class="details-body"><div class="table-wrap"><table>
      <thead><tr><th scope="col">Month</th><th class="num" scope="col">Income</th><th class="num" scope="col">Spent</th><th class="num" scope="col">Saved</th><th class="num" scope="col">% spent</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>
  </div>`;
}
function historyChart() {
  const hist = state.history.slice(-11);
  if (!hist.length || !document.getElementById('hist-chart')) return;
  const b = budgetTotals();
  const labels = hist.map(h => { const [y, m] = h.month.split('-').map(Number); return fmtMonthShort(new Date(y, m - 1, 1)); }).concat(['This month']);
  const spent = hist.map(histSpent).concat([b.actual - b.byType.savings.actual]);
  const income = hist.map(h => h.income).concat([b.income]);
  makeChart('hist-chart', {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', label: 'Income', data: income, borderColor: colorAt(2), borderDash: [6, 4], pointRadius: 2, borderWidth: 1.5, fill: false, order: 0 },
      { label: 'Spent', data: spent, backgroundColor: spent.map((v, i) => i === spent.length - 1 ? hexA(colorAt(0), 0.5) : colorAt(0)), borderRadius: 6, maxBarThickness: 32, order: 1 }
    ] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: moneyAxis(), x: Object.assign({}, xAxis, { ticks: { autoSkip: false, maxRotation: 45 } }) } }
  });
}

