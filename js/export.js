/* YOKO! Student · CSV exports.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   CSV EXPORTS
   ========================================================= */
function toCSV(rows) {
  return rows.map(r => r.map(v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
}
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function downloadCSV(name, rows) { downloadFile(`yoko-${name}-${todayISO()}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8'); }
const CSV = {
  debts() {
    const c = state.currency;
    return [['Debt', `Balance (${c})`, 'Annual interest %', `Minimum payment (${c})`, `Monthly interest (${c})`, 'Months to payoff (minimums only)'],
      ...state.debts.map(d => { const n = F.monthsToPayoff(d.balance, d.rate, d.minPayment); return [d.name, r2(d.balance), d.rate, r2(d.minPayment), r2(d.balance * F.monthlyRate(d.rate)), Number.isFinite(n) ? n : 'Never']; })];
  },
  'debt-schedule'() {
    const p = currentDebtPlan(), t = todayDate(), c = state.currency;
    const active = state.debts.filter(d => d.balance > 0);
    return [['Month', 'Date', ...active.map(d => `${d.name} balance (${c})`), `Paid (${c})`, `Interest (${c})`, `Principal (${c})`, `Remaining (${c})`],
      ...p.rows.map(r => [r.month, F.toISO(F.addMonths(t, r.month)), ...active.map(d => r2(r.balances[d.id])), r2(r.payment), r2(r.interest), r2(r.principal), r2(r.totalBalance)])];
  },
  'emi-schedule'() {
    const e = state.emi, s = F.amortizationSchedule(e.principal, e.rate, e.months), c = state.currency;
    return [['Month', `Payment (${c})`, `Interest (${c})`, `Principal (${c})`, `Balance (${c})`], ...s.rows.map(r => [r.month, r2(r.payment), r2(r.interest), r2(r.principal), r2(r.balance)])];
  },
  budget() {
    const c = state.currency;
    return [['Category', 'Type', `Planned (${c})`, `Actual (${c})`, `Left (${c})`], ...state.budget.categories.map(x => [x.name, x.type, r2(x.planned), r2(x.actual), r2(x.planned - x.actual)])];
  },
  expenses() {
    const name = id => (state.budget.categories.find(c => c.id === id) || { name: 'Deleted category' }).name;
    return [['Date', 'Category', 'Note', `Amount (${state.currency})`], ...state.budget.expenses.map(x => [x.date, name(x.categoryId), x.note, r2(x.amount)])];
  },
  gifts() {
    return [['Recipient', 'Occasion', 'Next date', 'Days away', `Budget (${state.currency})`, 'Gift idea', 'Status'], ...giftList().map(g => [g.name, g.label, F.toISO(g.eff), g.days, r2(g.budget), g.idea, g.status])];
  },
  goals() {
    const c = state.currency;
    return [['Goal', `Target (${c})`, `Saved (${c})`, 'Progress %', 'Deadline', 'Annual interest %', `Needed per month (${c})`, `Planned per month (${c})`],
      ...state.goals.map(g => { const i = goalInfo(g); return [g.name, r2(g.target), r2(g.saved), r2(i.pct), g.deadline, g.rate, i.reached ? 0 : (Number.isFinite(i.required) ? r2(i.required) : 'Deadline passed'), g.planMonthly === null ? '' : r2(g.planMonthly)]; })];
  },
  contributions() {
    const rows = [['Goal', 'Date', `Amount (${state.currency})`, 'Note']];
    state.goals.forEach(g => g.contributions.forEach(c => rows.push([g.name, c.date, r2(c.amount), c.note])));
    return rows;
  },
  cash() { return [['Date', 'In/Out', `Amount (${state.currency})`, 'Note'], ...state.wallet.cash.map(x => [x.date, x.type, r2(x.amount), x.note])]; },
  ious() { return [['Person', 'Who owes', `Amount (${state.currency})`, 'Since', 'Due', 'Note', 'Settled on'], ...state.wallet.ious.map(x => [x.person, x.dir === 'owe' ? 'I owe them' : 'They owe me', r2(x.amount), x.date, x.due, x.note, x.settled ? x.settledAt : ''])]; },
  transport() { return [['Date', 'Type', `Cost (${state.currency})`, 'Km', 'Note'], ...state.wallet.transport.map(x => [x.date, modeInfo(x.mode)[2], r2(x.amount), x.km || '', x.note])]; },
  taxes() { return [['Date', 'Type', `Amount (${state.currency})`, 'Note'], ...state.wallet.taxes.map(x => [x.date, x.type, r2(x.amount), x.note])]; },
  payslips() { const c = state.currency; return [['Month', 'Employer', `Gross (${c})`, `Tax (${c})`, `PF (${c})`, `Professional tax (${c})`, `Insurance/ESI (${c})`, `Other (${c})`, `Net (${c})`], ...state.payslips.map(p => [p.month, p.employer, r2(p.gross), r2(p.tax), r2(p.pf), r2(p.pt), r2(p.esi), r2(p.other), r2(p.net)])]; },
  subscriptions() {
    const c = state.currency;
    return [['Service', `Price (${c})`, 'Billed', `Per month (${c})`, `Per year (${c})`], ...state.subscriptions.map(x => [x.name, r2(x.amount), x.cycle, r2(subMonthly(x)), r2(subMonthly(x) * 12)])];
  },
  split() {
    const s = splitSummary(), c = state.currency;
    return [['Bucket', 'Split by', 'Value', `Per paycheck (${c})`, `Per month (${c})`], ...s.rows.map(r => [r.name, r.mode === 'percent' ? '%' : 'Fixed', r2(r.value), r2(r.amount), r2(r.monthly)]),
      ['Unassigned', '', '', r2(s.diff), r2(s.diff * s.factor)]];
  }
};

