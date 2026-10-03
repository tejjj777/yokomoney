/* YOKO! Student · Dashboard page.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   VIEW: DASHBOARD
   ========================================================= */
function renderDashboard() {
  const t = todayDate();
  const inc = monthlyIncome();
  const next = nextPayInfo();
  const debtTotal = sum(state.debts, d => d.balance);
  const plan = state.debts.some(d => d.balance > 0) ? currentDebtPlan() : null;
  const b = budgetTotals(), al = dailyAllowance(), rw = runwayInfo(), sk = streakInfo();
  const saved = sum(state.goals, g => g.saved), target = sum(state.goals, g => g.target);
  const stratName = state.debtSettings.strategy === 'snowball' ? 'Snowball' : 'Avalanche';
  let debtFree;
  if (!plan) debtFree = stat('Debt-free', state.debts.length ? 'Paid off' : 'No debts', 'Nothing to pay off', 'tone-success');
  else if (plan.paidOff) debtFree = stat('Debt-free', fmtMonthYear(F.addMonths(t, plan.months)), `${fmt(debtTotal)} to go`);
  else debtFree = stat('Debt-free', 'Not in 50 yrs', 'Pay more in the Debt page', 'tone-danger');
  const sp = spendingSource();
  let html = viewHeader('dashboard', 'Dashboard', `${FULL_MONTHS[t.getMonth()]} ${t.getFullYear()}`, `<button type="button" class="btn" data-action="open-wrapped"><span aria-hidden="true">🎬</span><span>Money Wrapped</span></button>`);
  if (!hasAnyData()) {
    html += emptyState('Nothing here yet', 'Start with your paycheck. After that you can add debts, a budget, goals and gifts. Or load some sample data to poke around first.', 'open-paycheck', 'Enter paycheck', 'dashboard');
  }
  const overview = sampleBanner() + backupBanner() + weatherCard() + subCheckCard() + `<div class="stats-grid three">
    ${stat('Monthly income', fmt(inc), `${state.income.irregular ? `${irregularLine()} · <button type="button" class="linklike" data-action="log-income">Log income</button>` : `${next ? `Next payday ${daysLabel(next.days).toLowerCase()} · ` : ''}<button type="button" class="linklike" data-action="open-paycheck">Edit paycheck</button>`}`, 'featured')}
    ${stat('Left this month', fmt(b.remaining), inc > 0 ? `${fmtPct(b.actual / inc * 100)} of income spent` : 'Add income to track', b.remaining < 0 ? 'tone-danger' : '')}
    ${stat('Daily allowance', fmt(al.over ? 0 : al.perDay), al.over ? 'Overspent this month' : `a day for ${plural(al.daysLeft, 'day')}`, al.over ? 'tone-danger' : '')}
    ${debtFree}
    ${stat('Saved', fmt(saved), rw.months !== null ? `${shortNum(rw.months)} months of runway` : (target > 0 ? `${fmtPct(saved / target * 100)} of your goals` : 'No goals yet'))}
    ${stat('No-spend streak', `🔥 ${plural(sk.current, 'day')}`, `Longest: ${plural(sk.longest, 'day')}`)}
  </div>
  <div class="grid-2">${petCard()}${questsCard()}</div>`;
  const chartsTab = `<div class="grid-2">
    ${chartCard('Spending by category', sp.useActual ? 'Actual spending this month' : (sp.list.length ? 'Planned (no actual spending yet)' : ''), 'dash-spend', sp.list.length > 0, 'Add budget amounts to see where your money goes.')}
    ${chartCard('Savings goal progress', '% of each target saved', 'dash-goals', state.goals.length > 0, 'Add a savings goal to track progress.')}</div>
    ${chartCard('Total debt over time', plan ? `${stratName} plan · ${plan.paidOff ? 'debt-free ' + fmtMonthYear(F.addMonths(t, plan.months)) : 'not paid off within 50 years'}` : '', 'dash-debt', !!plan, 'Add a debt to see your payoff curve.')}`;
  html += tabbed('dashboard', { overview, calendar: calendarCard(), charts: chartsTab });
  return {
    html,
    charts() {
      if (sp.list.length) spendChart('dash-spend');
      if (state.goals.length) goalsBarChart('dash-goals');
      if (plan) debtLineChart('dash-debt', plan);
    }
  };
}

