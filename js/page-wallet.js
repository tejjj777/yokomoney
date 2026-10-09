/* YOKO! Student · Wallet page: cash, IOUs, transport, taxes, payslips.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   WALLET: cash in hand, IOUs, transport, taxes, payslips
   ========================================================= */
const modeInfo = key => TRANSPORT_MODES.find(m => m[0] === key) || TRANSPORT_MODES[TRANSPORT_MODES.length - 1];
function cashBalance() { return sum(state.wallet.cash, x => (x.type === 'in' ? x.amount : -x.amount)); }
function taxYearInfo() {
  const startM = state.wallet.taxYearStart;
  const fy = F.taxYear(todayDate(), startM);
  const label = startM === 1 ? `Tax year ${fy.year}` : `Tax year ${fy.year}–${String(fy.year + 1).slice(2)}`;
  return Object.assign(fy, { label, startISO: F.toISO(fy.start), endISO: F.toISO(fy.end) });
}
const taxesInYear = fy => state.wallet.taxes.filter(x => x.date >= fy.startISO && x.date <= fy.endISO);
const monthLabelISO = ym => { const [y, m] = ym.split('-').map(Number); return y && m ? fmtMonthYear(new Date(y, m - 1, 1)) : '—'; };
function defaultTransportCat() { const c = state.budget.categories.find(k => /transport|travel|commute/i.test(k.name)); return c ? c.id : ''; }

/** Remove an expense and undo its effects (actual amount this month, round-up). */
function removeExpense(x) {
  if (!x) return;
  const c = state.budget.categories.find(k => k.id === x.categoryId);
  if (x.debtPay) {   // an auto-posted EMI also lowered a debt: put it back
    const d = state.debts.find(k => k.id === x.debtPay.debtId);
    if (d) { d.balance += x.debtPay.amount; d.payments = d.payments.filter(p => p.id !== x.debtPay.pid); if (d.balance > 0.005) d.defeatedAt = ''; d.startBalance = Math.max(d.startBalance, d.balance); }
  }
  if (x.roundup) {
    const g = state.goals.find(k => k.id === x.roundup.goalId);
    const ct = g && g.contributions.find(k => k.id === x.roundup.cid);
    if (ct) { g.saved = Math.max(0, g.saved - ct.amount); g.contributions = g.contributions.filter(k => k !== ct); }
  }
  state.budget.expenses = state.budget.expenses.filter(e => e !== x);
  if (x.photo && typeof PhotoDB !== 'undefined') setTimeout(() => { if (!state.budget.expenses.some(e => e.id === x.id)) PhotoDB.del(x.id); }, 15000);   // after the undo window
}
const removeExpenseById = id => removeExpense(state.budget.expenses.find(e => e.id === id));
/** Change a logged expense in place. Keeps its round-up, loan payment and linked cash or transport entry in step. */
function updateExpense(exp, { categoryId, amount, date, note }, fromLink) {
  const delta = amount - exp.amount;
  if (exp.debtPay && Math.abs(delta) > 0.004) {   // paying more or less on an EMI changes the principal part
    const d = state.debts.find(k => k.id === exp.debtPay.debtId), p = d && d.payments.find(k => k.id === exp.debtPay.pid);
    if (d && p) {
      const change = Math.min(Math.max(0, exp.debtPay.amount + delta) - exp.debtPay.amount, d.balance);
      d.balance -= change; p.amount = exp.debtPay.amount + change; exp.debtPay.amount = p.amount;
      if (d.balance <= 0.005) { d.balance = 0; d.defeatedAt = d.defeatedAt || date; } else d.defeatedAt = '';
      d.startBalance = Math.max(d.startBalance, d.balance);
    }
  }
  if (exp.roundup && Math.abs(delta) > 0.004 && state.settings.roundUp.to) {
    const g = state.goals.find(k => k.id === exp.roundup.goalId), ct = g && g.contributions.find(k => k.id === exp.roundup.cid);
    if (ct) {
      const up = F.roundUpAmount(amount, state.settings.roundUp.to);
      g.saved = Math.max(0, g.saved - ct.amount + up);
      if (up > 0.004) { ct.amount = up; ct.date = date; exp.roundup.amount = up; }
      else { g.contributions = g.contributions.filter(k => k !== ct); delete exp.roundup; }
    }
  }
  Object.assign(exp, { categoryId, amount, date, note: note || '' });
  if (!fromLink) state.wallet.cash.concat(state.wallet.transport).forEach(c => { if (c.expenseId === exp.id) { c.amount = amount; c.date = date; } });
}
/** After editing a cash or transport entry: update, add or drop the budget expense it also logged. */
function relinkExpense(entry, categoryId, amount, date, note) {
  const exp = entry.expenseId ? state.budget.expenses.find(e => e.id === entry.expenseId) : null;
  if (exp && categoryId) updateExpense(exp, { categoryId, amount, date, note }, true);
  else if (exp) removeExpense(exp);
  else if (categoryId) entry.expenseId = addExpense({ categoryId, amount, date, note }).exp.id;
  if (!categoryId) entry.expenseId = null;
}

function addCash({ type, amount, date, note, categoryId }) {
  const e = { id: uid(), type: type === 'in' ? 'in' : 'out', amount, date, note: note || '', expenseId: null };
  if (e.type === 'out' && categoryId) e.expenseId = addExpense({ categoryId, amount, date, note: note || 'Cash' }).exp.id;
  state.wallet.cash.push(e);
  return e;
}
function addTransport({ mode, amount, date, note, km, categoryId }) {
  const e = { id: uid(), mode, amount, date, note: note || '', km: km > 0 ? km : null, expenseId: null };
  if (categoryId) e.expenseId = addExpense({ categoryId, amount, date, note: note || modeInfo(mode)[2] }).exp.id;
  state.wallet.transport.push(e);
  return e;
}
function indiaTaxDeadlines() { return taxDeadlinePresets('IN'); }

/* ---------- Wallet forms ---------- */
function cashForm(type, entry) {
  const cats = state.budget.categories;
  const linked = entry && entry.expenseId ? state.budget.expenses.find(e => e.id === entry.expenseId) : null;
  const t0 = entry ? entry.type : type;
  formModal({
    title: entry ? 'Edit cash entry' : (type === 'in' ? 'Cash in' : 'Cash out'), submitLabel: entry ? 'Save changes' : 'Save',
    values: entry ? { type: entry.type, amount: entry.amount, date: entry.date, note: entry.note, categoryId: linked ? linked.categoryId : '' } : { type, date: todayISO(), categoryId: '' },
    fields: [
      { name: 'type', label: 'Type', kind: 'select', options: [['in', 'Cash in (+)'], ['out', 'Cash out (−)']] },
      { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
      { name: 'date', label: 'Date', kind: 'date', required: true },
      { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'e.g. ATM withdrawal, taxi' },
      { name: 'categoryId', label: 'Also count it in the budget?', kind: 'select', wide: true, hidden: t0 === 'in', options: [['', 'No, just track the cash'], ...cats.map(c => [c.id, `Yes, add to ${c.name}`])] }
    ],
    live: v => {
      if (!(v.amount > 0)) return '';
      const base = cashBalance() - (entry ? (entry.type === 'in' ? entry.amount : -entry.amount) : 0);
      return `<div class="alert alert-info">Cash in hand after this: <strong>${fmt(base + (v.type === 'in' ? v.amount : -v.amount))}</strong></div>`;
    },
    onMount: form => {
      const t = form.querySelector('#f-type'), wrap = form.querySelector('[data-wrap="categoryId"]');
      t.addEventListener('change', () => { wrap.hidden = t.value !== 'out'; });
    },
    onSave: v => {
      if (entry) {
        undoable('Cash entry updated', () => {
          const ty = v.type === 'in' ? 'in' : 'out';
          relinkExpense(entry, ty === 'out' ? v.categoryId : '', v.amount, v.date, v.note || 'Cash');
          Object.assign(entry, { type: ty, amount: v.amount, date: v.date, note: v.note || '' });
        });
        return;
      }
      addCash(v); commit();
      toast(`💵 Cash ${v.type === 'in' ? 'in' : 'out'} ${fmt(v.amount)} · wallet ${fmt(cashBalance())}`);
    }
  });
}
function iouForm(iou) {
  formModal({
    title: iou ? 'Edit IOU' : 'Add an IOU', submitLabel: iou ? 'Save changes' : 'Add IOU',
    values: iou || { dir: 'owed', date: todayISO(), cashMoved: true },
    fields: [
      { name: 'person', label: 'Person', kind: 'text', required: true, placeholder: 'e.g. Sam', max: 60 },
      { name: 'dir', label: 'Who owes who?', kind: 'select', options: [['owed', 'They owe me'], ['owe', 'I owe them']] },
      { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
      { name: 'date', label: 'Since', kind: 'date', required: true },
      { name: 'due', label: 'Pay back by (optional)', kind: 'date' },
      { name: 'note', label: 'What for?', kind: 'text', max: 120, placeholder: 'e.g. dinner split' },
      ...(iou ? [] : [{ name: 'cashMoved', label: 'Cash changed hands now (updates Cash in hand)', kind: 'check', wide: true }])
    ],
    onSave: v => {
      if (iou) { Object.assign(iou, { person: v.person, dir: v.dir, amount: v.amount, date: v.date, due: v.due || '', note: v.note || '' }); }
      else {
        state.wallet.ious.push({ id: uid(), person: v.person, dir: v.dir, amount: v.amount, date: v.date, due: v.due || '', note: v.note || '', settled: false, settledAt: '' });
        // borrowing puts cash in your wallet; lending takes it out
        if (v.cashMoved) addCash({ type: v.dir === 'owe' ? 'in' : 'out', amount: v.amount, date: v.date, note: v.dir === 'owe' ? `Borrowed from ${v.person}` : `Lent to ${v.person}` });
      }
      commit(); toast(iou ? 'IOU updated' : `IOU with ${v.person} saved`);
    }
  });
}
function settleForm(iou) {
  formModal({
    title: `Settle up with ${iou.person}`, submitLabel: 'Settle',
    values: { amount: iou.amount, date: todayISO(), cash: true },
    fields: [
      { name: 'amount', label: iou.dir === 'owe' ? 'Amount you paid back' : 'Amount they paid you', kind: 'money', required: true, positive: true, help: `Full amount is ${fmt(iou.amount)}. Enter less for a part payment.` },
      { name: 'date', label: 'Date', kind: 'date', required: true },
      { name: 'cash', label: 'Paid in cash (updates Cash in hand)', kind: 'check', wide: true }
    ],
    onSave: (v, form) => {
      if (v.amount > iou.amount + 0.005) {
        const el = form.querySelector('#f-amount'); el.setAttribute('aria-invalid', 'true');
        form.querySelector('#f-amount-err').textContent = `That’s more than the ${fmt(iou.amount)} owed.`; el.focus();
        return false;
      }
      const full = v.amount >= iou.amount - 0.005;
      if (full) { iou.settled = true; iou.settledAt = v.date; } else iou.amount -= v.amount;
      if (v.cash) addCash({ type: iou.dir === 'owe' ? 'out' : 'in', amount: v.amount, date: v.date, note: `${full ? 'Settled' : 'Part payment'} with ${iou.person}` });
      commit(); toast(full ? `All settled with ${iou.person}` : `${fmt(v.amount)} paid, ${fmt(iou.amount)} still to go`);
      if (full) playSound('coin');
    }
  });
}
function transportForm(entry) {
  const cats = state.budget.categories;
  const linked = entry && entry.expenseId ? state.budget.expenses.find(e => e.id === entry.expenseId) : null;
  formModal({
    title: entry ? 'Edit transport entry' : 'Log transport', submitLabel: entry ? 'Save changes' : 'Save',
    values: entry ? { mode: entry.mode, amount: entry.amount, date: entry.date, km: entry.km, note: entry.note, categoryId: linked ? linked.categoryId : '' } : { mode: 'cab', date: todayISO(), categoryId: defaultTransportCat() },
    fields: [
      { name: 'mode', label: 'Type', kind: 'select', options: TRANSPORT_MODES.map(([k, e, l]) => [k, `${e} ${l}`]) },
      { name: 'amount', label: 'Cost', kind: 'money', required: true, positive: true },
      { name: 'date', label: 'Date', kind: 'date', required: true },
      { name: 'km', label: 'Distance in km (optional)', kind: 'number' },
      { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'e.g. office, airport', wide: true },
      { name: 'categoryId', label: 'Also count it in the budget?', kind: 'select', wide: true, options: [['', 'No, only log it here'], ...cats.map(c => [c.id, `Yes, add to ${c.name}`])] }
    ],
    live: v => v.amount > 0 ? `<div class="alert alert-info" style="flex-wrap:wrap">${feelsLike(v.amount) || fmt(v.amount)}${v.km > 0 ? ` · ${fmt(v.amount / v.km)}/km` : ''}</div>` : '',
    onSave: v => {
      if (entry) {
        undoable('Transport entry updated', () => {
          relinkExpense(entry, v.categoryId, v.amount, v.date, v.note || modeInfo(v.mode)[2]);
          Object.assign(entry, { mode: v.mode, amount: v.amount, date: v.date, note: v.note || '', km: v.km > 0 ? v.km : null });
        });
        return;
      }
      addTransport(v); commit(); toast(`${modeInfo(v.mode)[1]} ${fmt(v.amount)} logged`);
    }
  });
}
function taxForm(x) {
  const types = x && !TAX_TYPES.includes(x.type) ? [x.type, ...TAX_TYPES] : TAX_TYPES;
  formModal({
    title: x ? 'Edit tax payment' : 'Log a tax payment', submitLabel: x ? 'Save changes' : 'Save',
    values: x ? { type: x.type, amount: x.amount, date: x.date, note: x.note } : { type: 'Advance / estimated tax', date: todayISO() },
    fields: [
      { name: 'type', label: 'Type', kind: 'select', options: types },
      { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
      { name: 'date', label: 'Date paid', kind: 'date', required: true },
      { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'e.g. reference number' }
    ],
    onSave: v => {
      if (x) { undoable('Tax payment updated', () => { Object.assign(x, { type: v.type, amount: v.amount, date: v.date, note: v.note || '' }); }); return; }
      state.wallet.taxes.push({ id: uid(), type: v.type, amount: v.amount, date: v.date, note: v.note || '', payslipId: null }); commit(); toast(`🧾 ${fmt(v.amount)} ${v.type} logged`);
    }
  });
}
function deadlineForm(d) {
  formModal({
    title: d ? 'Edit deadline' : 'Add a tax deadline', submitLabel: d ? 'Save changes' : 'Add', values: d ? { title: d.title, date: d.date, repeat: d.repeat } : { date: todayISO(), repeat: true },
    fields: [
      { name: 'title', label: 'What’s due?', kind: 'text', required: true, max: 80, placeholder: 'e.g. VAT return', wide: true },
      { name: 'date', label: 'Date', kind: 'date', required: true },
      { name: 'repeat', label: 'Repeats every year', kind: 'check' }
    ],
    onSave: v => {
      if (d) { undoable('Deadline updated', () => { Object.assign(d, { title: v.title, date: v.date, repeat: !!v.repeat }); }); return; }
      state.wallet.deadlines.push({ id: uid(), title: v.title, date: v.date, repeat: !!v.repeat }); commit(); toast('Deadline added');
    }
  });
}

/* ---------- Wallet cards ---------- */
function moreRows(key, all, shown, rowFn, cols) {
  if (all.length <= shown) return '';
  return `<details class="collapsible" data-open-key="${key}" ${openAttr(key)}><summary>Show all ${all.length}</summary>
    <div class="details-body"><div class="table-wrap"><table><tbody>${ui.open[key] ? all.slice(shown).map(rowFn).join('') : `<tr><td colspan="${cols}"></td></tr>`}</tbody></table></div></div></details>`;
}
function cashCard() {
  const list = state.wallet.cash.slice().sort((a, b) => b.date.localeCompare(a.date));
  const bal = cashBalance();
  const row = x => `<tr><td>${fmtDate(F.parseDate(x.date))}</td><td>${esc(x.note) || '<span class="muted">—</span>'}${x.expenseId ? '<br><span class="small muted">Also in budget</span>' : ''}</td>
    <td class="num ${x.type === 'in' ? 'tone-success-text' : 'tone-danger-text'}">${x.type === 'in' ? '+' : '−'}${fmt(x.amount)}</td>
    <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-cash" data-id="${x.id}" aria-label="Edit cash entry ${esc(x.note || fmt(x.amount))}">${ICON.edit}</button><button type="button" class="icon-btn danger" data-action="delete-cash" data-id="${x.id}" aria-label="Delete cash entry ${esc(x.note || fmt(x.amount))}">${ICON.trash}</button></td></tr>`;
  return `<div class="card wallet-card" id="w-cash">
    <div class="card-head"><div><h2>Cash in hand</h2><p class="muted small">The actual notes and coins on you.</p></div>
      <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="cash-in" aria-label="Add cash in">+ In</button><button type="button" class="btn btn-sm" data-action="cash-out" aria-label="Add cash out">− Out</button>${csvBtn('cash', 'cash log')}</div></div>
    <p class="big-num ${bal < 0 ? 'tone-danger-text' : ''}">${fmt(bal)}</p>
    ${bal < 0 ? '<p class="small tone-danger-text" style="margin-bottom:10px">You’ve logged more cash out than in. Add what you started with as “Cash in”.</p>' : ''}
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Note</th><th class="num" scope="col">Amount</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.slice(0, 6).map(row).join('')}</tbody></table></div>${moreRows('cash-all', list, 6, row, 4)}`
      : '<div class="chart-empty"><p>No cash logged yet. Start with what’s in your wallet right now.</p><button type="button" class="btn btn-sm no-print" data-action="cash-in">Add cash in hand</button></div>'}
  </div>`;
}
function iouCard() {
  const t = todayDate();
  const open = state.wallet.ious.filter(x => !x.settled).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.date.localeCompare(b.date));
  const done = state.wallet.ious.filter(x => x.settled).sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''));
  const owe = sum(open.filter(x => x.dir === 'owe'), x => x.amount), owed = sum(open.filter(x => x.dir === 'owed'), x => x.amount);
  const due = x => {
    if (!x.due) return '<span class="small muted">No due date</span>';
    const d = F.daysBetween(t, F.parseDate(x.due));
    return `<span class="badge ${d < 0 ? 'badge-danger' : d <= 7 ? 'badge-warn' : 'badge-neutral'}">${d < 0 ? `${plural(-d, 'day')} overdue` : daysLabel(d)}</span>`;
  };
  const rows = open.map(x => `<tr>
    <th scope="row" style="text-transform:none;font-size:14px;color:var(--text);letter-spacing:0">${esc(x.person)}${x.note ? `<br><span class="small muted" style="font-weight:400">${esc(x.note)}</span>` : ''}</th>
    <td><span class="badge ${x.dir === 'owe' ? 'badge-danger' : 'badge-success'}">${x.dir === 'owe' ? 'You owe' : 'Owes you'}</span></td>
    <td class="num">${fmt(x.amount)}</td><td>${due(x)}</td>
    <td class="actions no-print"><button type="button" class="btn btn-sm" data-action="settle-iou" data-id="${x.id}">Settle</button>
      <button type="button" class="icon-btn" data-action="edit-iou" data-id="${x.id}" aria-label="Edit IOU with ${esc(x.person)}">${ICON.edit}</button>
      <button type="button" class="icon-btn danger" data-action="delete-iou" data-id="${x.id}" aria-label="Delete IOU with ${esc(x.person)}">${ICON.trash}</button></td></tr>`).join('');
  return `<div class="card wallet-card" id="w-ious">
    <div class="card-head"><div><h2>IOUs</h2><p class="muted small">Money between you and friends.</p></div>
      <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-iou">${ICON.plus}<span>Add</span></button>${moreMenu([mi('Split a bill', 'split-bill'), csvItem('ious', 'IOUs')])}</div></div>
    <div class="mini-stats"><div><p class="stat-label">You owe</p><p class="stat-value tone-danger-text">${fmt(owe)}</p></div>
      <div><p class="stat-label">Owed to you</p><p class="stat-value tone-success-text">${fmt(owed)}</p></div>
      <div><p class="stat-label">Net</p><p class="stat-value">${owed - owe < 0 ? '−' : ''}${fmt(Math.abs(owed - owe))}</p></div></div>
    ${open.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Person</th><th scope="col">Who owes</th><th class="num" scope="col">Amount</th><th scope="col">Due</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="chart-empty"><p>No open IOUs. Lent someone cash, or borrowed some? Add it here.</p><button type="button" class="btn btn-sm no-print" data-action="add-iou">Add an IOU</button></div>'}
    ${done.length ? `<details class="collapsible" data-open-key="ious-done" ${openAttr('ious-done')}><summary>Settled (${done.length})</summary><div class="details-body"><ul class="plain-list">${done.map(x => `<li><span>${esc(x.person)} · ${x.dir === 'owe' ? 'you paid' : 'paid you'} ${fmt(x.amount)}</span><span class="small muted">${x.settledAt ? fmtDate(F.parseDate(x.settledAt)) : ''} <button type="button" class="icon-btn danger no-print" data-action="delete-iou" data-id="${x.id}" aria-label="Delete settled IOU with ${esc(x.person)}">${ICON.trash}</button></span></li>`).join('')}</ul></div></details>` : ''}
  </div>`;
}
function transportCard() {
  const ym = todayISO().slice(0, 7);
  const list = state.wallet.transport.slice().sort((a, b) => b.date.localeCompare(a.date));
  const month = list.filter(x => x.date.slice(0, 7) === ym);
  const total = sum(month, x => x.amount);
  const byMode = {};
  month.forEach(x => { byMode[x.mode] = (byMode[x.mode] || 0) + x.amount; });
  const top = Object.entries(byMode).sort((a, b) => b[1] - a[1])[0];
  const withKm = month.filter(x => x.km > 0), km = sum(withKm, x => x.km);
  const row = x => { const [, e, l] = modeInfo(x.mode); return `<tr><td>${fmtDate(F.parseDate(x.date))}</td><td><span aria-hidden="true">${e}</span> ${esc(l)}${x.note ? `<br><span class="small muted">${esc(x.note)}</span>` : ''}</td>
    <td class="num">${fmt(x.amount)}${x.km ? `<br><span class="small muted">${shortNum(x.km)} km</span>` : ''}</td>
    <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-transport" data-id="${x.id}" aria-label="Edit ${esc(l)} on ${fmtDate(F.parseDate(x.date))}">${ICON.edit}</button><button type="button" class="icon-btn danger" data-action="delete-transport" data-id="${x.id}" aria-label="Delete ${esc(l)} on ${fmtDate(F.parseDate(x.date))}">${ICON.trash}</button></td></tr>`; };
  return `<div class="card wallet-card" id="w-transport">
    <div class="card-head"><div><h2>Transport</h2><p class="muted small">Fuel, cabs, metro and parking.</p></div>
      <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-transport">${ICON.plus}<span>Add</span></button>${csvBtn('transport', 'transport log')}</div></div>
    <div class="mini-stats"><div><p class="stat-label">This month</p><p class="stat-value">${fmt(total)}</p></div>
      <div><p class="stat-label">Per day</p><p class="stat-value">${fmt(total / todayDate().getDate())}</p></div>
      <div><p class="stat-label">Biggest</p><p class="stat-value">${top ? `${modeInfo(top[0])[1]} ${fmt(top[1])}` : '—'}</p></div></div>
    ${total > 0 ? `<p class="small" style="margin-bottom:10px">${feelsLike(total)}${km > 0 ? ` · ${shortNum(km)} km logged · ${fmt(sum(withKm, x => x.amount) / km)}/km` : ''}</p>` : ''}
    ${month.length ? '<div class="chart-box sm mb"><canvas id="transport-chart" role="img" aria-label="Transport spending by type this month"></canvas></div>' : ''}
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th class="num" scope="col">Cost</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.slice(0, 6).map(row).join('')}</tbody></table></div>${moreRows('transport-all', list, 6, row, 4)}`
      : '<div class="chart-empty"><p>Nothing logged yet. Quick way: press Ctrl+K and type “uber 250”.</p><button type="button" class="btn btn-sm no-print" data-action="add-transport">Log transport</button></div>'}
  </div>`;
}
function taxCard() {
  const t = todayDate(), w = state.wallet, fy = taxYearInfo();
  const list = taxesInYear(fy).sort((a, b) => b.date.localeCompare(a.date));
  const paid = sum(list, x => x.amount), est = w.taxEstimate, left = Math.max(0, est - paid);
  const monthsLeft = Math.max(1, F.monthsBetween(t, F.addDays(fy.end, 1)));
  const byType = TAX_TYPES.map(tp => [tp, sum(list.filter(x => x.type === tp), x => x.amount)]).filter(([, v]) => v > 0);
  const deadlines = w.deadlines.map(d => { const base = F.parseDate(d.date); return Object.assign({}, d, { eff: d.repeat ? F.nextAnnualOccurrence(base, t) : base }); })
    .filter(d => d.repeat || d.eff >= t).sort((a, b) => a.eff - b.eff);
  const row = x => `<tr><td>${fmtDate(F.parseDate(x.date))}</td><td>${esc(x.type)}${x.note ? `<br><span class="small muted">${esc(x.note)}</span>` : ''}</td><td class="num">${fmt(x.amount)}</td>
    <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-tax" data-id="${x.id}" aria-label="Edit ${esc(x.type)} of ${esc(fmt(x.amount))}">${ICON.edit}</button><button type="button" class="icon-btn danger" data-action="delete-tax" data-id="${x.id}" aria-label="Delete ${esc(x.type)} of ${esc(fmt(x.amount))}">${ICON.trash}</button></td></tr>`;
  return `<div class="card wallet-card" id="w-taxes">
    <div class="card-head"><div><h2>Taxes</h2><p class="muted small">${fy.label} · ${fmtDate(fy.start)} – ${fmtDate(fy.end)}</p></div>
      <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-tax">${ICON.plus}<span>Payment</span></button>${moreMenu([mi('Add a deadline', 'add-deadline'), w.deadlines.length || !taxDeadlinePresets(state.settings.country) ? '' : mi(`Add the usual ${countryInfo(state.settings.country).name} tax dates`, 'tax-deadlines'), csvItem('taxes', 'tax payments')])}</div></div>
    <div class="form-grid two mb">
      <div class="field">${moneyInput({ id: 'tax-estimate', bind: 'wallet', field: 'taxEstimate', value: est, label: 'Your estimated tax for the year', srLabel: false })}</div>
      <div class="field"><label for="tax-start" class="field-label">Tax year starts in</label>
        <select id="tax-start" class="select input-sm" data-bind="wallet" data-field="taxYearStart" data-kind="num">${FULL_MONTHS.map((m, i) => `<option value="${i + 1}" ${w.taxYearStart === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    </div>
    <div class="mini-stats"><div><p class="stat-label">Paid so far</p><p class="stat-value">${fmt(paid)}</p></div>
      <div><p class="stat-label">${est > 0 ? 'Still to pay' : 'Estimate'}</p><p class="stat-value">${est > 0 ? fmt(left) : '—'}</p></div></div>
    ${est > 0 ? `<div class="progress mb" role="progressbar" aria-label="Tax paid against estimate" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(clamp(paid / est * 100, 0, 100))}"><span style="width:${clamp(paid / est * 100, 0, 100)}%"></span></div>
      <p class="small mb">${left > 0 ? `To cover the rest by year end: ${incomeHint(left / monthsLeft)}` : '<span class="tone-success-text">✓ Your estimate is covered.</span>'}</p>` : '<p class="small muted mb">Add your estimated tax to see how much is left to pay.</p>'}
    ${byType.length ? `<p class="small mb">${byType.map(([tp, v]) => `<span class="badge">${esc(tp)} ${fmt(v)}</span>`).join(' ')}</p>` : ''}
    ${list.length ? '<div class="chart-box sm mb"><canvas id="tax-chart" role="img" aria-label="Tax paid by month this tax year"></canvas></div>' : ''}
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th class="num" scope="col">Amount</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.slice(0, 5).map(row).join('')}</tbody></table></div>${moreRows('tax-all', list, 5, row, 4)}`
      : '<p class="small muted">No tax payments this year yet. Upload a payslip and TDS is logged for you.</p>'}
    <h3 style="margin:18px 0 8px">Deadlines</h3>
    ${deadlines.length ? `<ul class="plain-list">${deadlines.map(d => { const days = F.daysBetween(t, d.eff); return `<li><span>${esc(d.title)}</span><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end"><span class="small muted">${fmtDate(d.eff)}</span><span class="badge ${days <= 7 ? 'badge-warn' : 'badge-neutral'}">${daysLabel(days)}</span>
      <button type="button" class="icon-btn no-print" data-action="edit-deadline" data-id="${d.id}" aria-label="Edit deadline ${esc(d.title)}">${ICON.edit}</button><button type="button" class="icon-btn danger no-print" data-action="delete-deadline" data-id="${d.id}" aria-label="Delete deadline ${esc(d.title)}">${ICON.trash}</button></span></li>`; }).join('')}</ul>` : '<p class="small muted">No deadlines saved. Add some from the ⋯ menu.</p>'}
    <p class="small muted" style="margin-top:8px">Dates can change, so double-check them with your tax office.</p>
  </div>`;
}
function payslipCard() {
  const list = state.payslips.slice().sort((a, b) => b.month.localeCompare(a.month));
  return `<div class="card wallet-card" id="w-payslips">
    <div class="card-head"><div><h2>Payslips</h2><p class="muted small">Read on this device. Never uploaded.</p></div>
      <div class="actions">${csvBtn('payslips', 'payslips')}</div></div>
    <div class="dropzone no-print" data-dropzone="payslip">
      <p class="dz-icon" aria-hidden="true">📄</p><p><strong>Drop a payslip PDF or photo here</strong></p><p class="small muted">or</p>
      <button type="button" class="btn btn-primary btn-sm" data-action="open-payslip">${ICON.upload}<span>Choose a file</span></button>
      <p class="small muted">Password-protected and scanned PDFs work too.</p></div>
    ${list.length ? `<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th scope="col">Month</th><th class="num" scope="col">Gross</th><th class="num" scope="col">Deductions</th><th class="num" scope="col">Net</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${list.map(p => { const ded = p.tax + p.pf + p.pt + p.esi + p.other; return `<tr><td>${monthLabelISO(p.month)}${p.employer ? `<br><span class="small muted">${esc(p.employer)}</span>` : ''}</td><td class="num">${fmt(p.gross)}</td><td class="num">${fmt(ded)}${p.tax ? `<br><span class="small muted">tax ${fmt(p.tax)}</span>` : ''}</td><td class="num">${fmt(p.net)}</td>
        <td class="actions no-print"><button type="button" class="btn btn-sm" data-action="reuse-payslip" data-id="${p.id}" aria-label="Use ${monthLabelISO(p.month)} payslip for my paycheck">Use</button>
        <button type="button" class="icon-btn danger" data-action="delete-payslip" data-id="${p.id}" aria-label="Delete ${monthLabelISO(p.month)} payslip">${ICON.trash}</button></td></tr>`; }).join('')}</tbody></table></div>` : ''}
  </div>`;
}

/* ---------- Wallet view ---------- */
function renderWallet() {
  const ym = todayISO().slice(0, 7), w = state.wallet;
  const cash = cashBalance();
  const open = w.ious.filter(x => !x.settled);
  const oweList = open.filter(x => x.dir === 'owe'), owedList = open.filter(x => x.dir === 'owed');
  const subsMonthly = sum(state.subscriptions, subMonthly);
  const transMonth = sum(w.transport.filter(x => x.date.slice(0, 7) === ym), x => x.amount);
  const fy = taxYearInfo(), taxPaid = sum(taxesInYear(fy), x => x.amount);
  const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
  const head = viewHeader('wallet', 'Wallet', 'Cash, IOUs, subscriptions, transport, tax and payslips.');
  const subs = subsCard().replace('<div class="card">', '<div class="card wallet-card" id="w-subs">');
  const html = head + tabbed('wallet', { cash: cashCard(), ious: iouCard(), subs, transport: transportCard(), taxes: taxCard(), payslips: payslipCard() });
  return {
    html,
    charts() {
      const month = w.transport.filter(x => x.date.slice(0, 7) === ym);
      if (month.length) {
        const byMode = {};
        month.forEach(x => { byMode[x.mode] = (byMode[x.mode] || 0) + x.amount; });
        const keys = Object.keys(byMode);
        doughnut('transport-chart', keys.map(k => `${modeInfo(k)[1]} ${modeInfo(k)[2]}`), keys.map(k => byMode[k]), keys.map((_, i) => colorAt(i)));
      }
      const list = taxesInYear(fy);
      if (list.length) {
        const labels = [], data = [];
        for (let i = 0; i < 12; i++) {
          const m = F.addMonths(fy.start, i), key = F.toISO(m).slice(0, 7);
          labels.push(fmtMonthShort(m));
          data.push(sum(list.filter(x => x.date.slice(0, 7) === key), x => x.amount));
        }
        makeChart('tax-chart', {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Tax paid', data, backgroundColor: colorAt(0), borderRadius: 6, maxBarThickness: 28 }] },
          options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: moneyAxis(), x: Object.assign({}, xAxis, { ticks: { autoSkip: true, maxRotation: 0 } }) } }
        });
      }
    }
  };
}

/* ---------- Split & Roommates view ---------- */
function personBalancesCard() {
  const pList = personBalances();
  if (!pList.length) return '';

  return `<div class="card mb" id="w-balances">
    <div class="card-head">
      <div>
        <h2>Running balances</h2>
        <p class="muted small">Total net balance per friend across all shared expenses.</p>
      </div>
      <div class="actions no-print">
        <button type="button" class="btn btn-sm btn-primary" data-action="split-bill"><span aria-hidden="true">🧾</span><span>Split a bill</span></button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Status</th>
            <th class="num" scope="col">Net Balance</th>
            <th class="no-print"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${pList.map(p => `
            <tr>
              <td>
                <strong>${esc(p.person)}</strong>
                <br><span class="small muted">${plural(p.count, 'open IOU')}</span>
              </td>
              <td>
                <span class="badge ${p.dir === 'owed' ? 'badge-success' : 'badge-danger'}">
                  ${p.dir === 'owed' ? 'Owes you' : 'You owe'}
                </span>
              </td>
              <td class="num font-bold ${p.dir === 'owed' ? 'tone-success-text' : 'tone-danger-text'}">
                ${fmt(p.absNet)}
              </td>
              <td class="actions no-print">
                <button type="button" class="btn btn-sm btn-primary" data-action="settle-person" data-person="${esc(p.person)}">
                  <span>⚡ Settle up</span>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function liveGroupsCard() {
  const groups = state.groups || [];
  if (!groups.length) {
    return `<div class="card mb">
      <div class="card-head"><div><h2>Live Shared Budgets</h2><p class="muted small">Sync trips and shared expenses in real time.</p></div></div>
      <div class="chart-empty">
        <p>No groups yet. Create one for a trip or flat, or join one with a code. Needs internet.</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
          <button type="button" class="btn btn-primary" data-action="create-group">Create group</button>
          <button type="button" class="btn" data-action="join-group">Join with code</button>
        </div>
      </div>
    </div>`;
  }

  let html = `<div class="card mb"><div class="card-head"><div><h2>Your Groups</h2><p class="muted small">Live syncing budgets.</p></div>
    <div class="actions no-print"><button type="button" class="btn btn-sm btn-primary" data-action="create-group">Create</button><button type="button" class="btn btn-sm" data-action="join-group">Join</button></div></div>
    <ul class="plain-list">`;
  
  groups.forEach(g => {
    html += `<li><strong>${esc(g.name)}</strong> <span class="small muted">Code: ${esc(g.joinCode)}</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px">
        <button type="button" class="btn btn-sm" data-action="group-view" data-id="${g.id}">View details</button>
        <button type="button" class="btn btn-sm" data-action="group-add-expense" data-id="${g.id}">Add expense</button>
      </div></li>`;
  });
  html += `</ul></div>`;
  return html;
}

function renderSplit() {
  const w = state.wallet;
  const open = w.ious.filter(x => !x.settled);
  const settled = w.ious.filter(x => x.settled);
  const owe = sum(open.filter(x => x.dir === 'owe'), x => x.amount);
  const owed = sum(open.filter(x => x.dir === 'owed'), x => x.amount);
  const head = viewHeader('split', 'Split & Roommates', 'Split group bills, track who owes who, and settle up with roommates.',
    `<button type="button" class="btn btn-primary" data-action="split-bill"><span aria-hidden="true">🧾</span><span>Split a bill</span></button>`);

  const summaryCard = `<div class="stats-grid two" style="margin-bottom:14px">
    ${stat('You are owed', fmt(owed), `${plural(open.filter(x => x.dir === 'owed').length, 'payment')} to come from friends`, owed > 0 ? 'tone-success' : '')}
    ${stat('You owe', fmt(owe), `${plural(open.filter(x => x.dir === 'owe').length, 'IOU')} to pay back`, owe > 0 ? 'tone-danger' : '')}
  </div>`;

  const iousTab = summaryCard + personBalancesCard() + iouCard();
  const historyTab = `<div class="card" id="w-settled">
    <div class="card-head"><div><h2>Settled history</h2><p class="muted small">Previous IOUs and bill settlements.</p></div></div>
    ${settled.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Person</th><th scope="col">Date settled</th><th class="num" scope="col">Amount</th><th scope="col">Note</th></tr></thead>
    <tbody>${settled.slice().reverse().map(x => `<tr><td><strong>${esc(x.person)}</strong></td><td>${fmtDate(F.parseDate(x.settledAt || x.date))}</td><td class="num font-bold">${fmt(x.amount)}</td><td class="muted small">${esc(x.note || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No settled IOUs yet.</p>'}
  </div>`;

  const groupsTab = liveGroupsCard();

  const html = head + tabbed('split', {
    ious: iousTab,
    groups: groupsTab,
    history: historyTab
  });

  return { html };
}

