/* YOKO! Student · Debt payoff planner page.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   VIEW: DEBT PAYOFF PLANNER
   ========================================================= */
function emiCard() {
  const e = state.emi;
  const sched = F.amortizationSchedule(e.principal, e.rate, e.months);
  const ok = e.principal > 0 && e.months > 0;
  const rows = ok && ui.open['emi-table'] ? sched.rows.map(r => `<tr><td class="num">${r.month}</td><td class="num">${fmtExact(r.payment)}</td><td class="num">${fmtExact(r.interest)}</td><td class="num">${fmtExact(r.principal)}</td><td class="num">${fmtExact(r.balance)}</td></tr>`).join('') : '';
  return `<div class="card">
    <div class="card-head"><div><h2>Loan calculator</h2><p class="muted small">The monthly payment for a loan, and what it costs in total.</p></div></div>
    <div class="form-grid two" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="field">${moneyInput({ id: 'emi-principal', bind: 'emi', field: 'principal', value: e.principal, label: 'Loan amount', srLabel: false })}</div>
      <div class="field"><label for="emi-rate" class="field-label">Annual interest</label>
        <div class="affix suffix"><span class="affix-sym" aria-hidden="true">%</span><input id="emi-rate" class="input input-sm" type="text" inputmode="decimal" value="${numStr(e.rate)}" data-bind="emi" data-field="rate" data-kind="rate" aria-describedby="emi-rate-err"></div>
        <span class="field-error" id="emi-rate-err"></span></div>
      <div class="field"><label for="emi-months" class="field-label">Tenure (months)</label>
        <input id="emi-months" class="input input-sm" type="text" inputmode="numeric" value="${numStr(e.months)}" data-bind="emi" data-field="months" data-kind="months" aria-describedby="emi-months-err">
        <span class="field-error" id="emi-months-err"></span></div>
    </div>
    <div class="stats-grid" style="margin:16px 0 0">
      <div class="stat card featured" style="grid-column:span 2"><p class="stat-label">Monthly payment</p><p class="stat-value">${ok ? fmtExact(sched.payment) : '—'}</p><p class="stat-sub">${ok ? incomeHint(sched.payment) : 'Enter loan details'}</p></div>
      ${stat('Total interest', ok ? fmt(sched.totalInterest) : '—')}
      ${stat('Total payment', ok ? fmt(sched.totalPaid) : '—')}
    </div>
    ${ok ? `<details class="collapsible" data-open-key="emi-table" ${openAttr('emi-table')}><summary>Amortization schedule (${e.months} months)</summary>
      <div class="details-body"><div class="row no-print">${csvLink('emi-schedule', 'loan schedule')}</div>
      ${rows ? `<div class="sched-scroll"><table class="sched-table"><thead><tr><th class="num">Month</th><th class="num">Payment</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Balance</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div></details>` : ''}
  </div>`;
}

function renderDebt() {
  const t = todayDate();
  const head = viewHeader('debt', 'Debt Payoff Planner', 'When you’ll be debt-free, and the quickest way there.',
    `<button type="button" class="btn btn-primary" data-action="add-debt">${ICON.plus}<span>Add debt</span></button>`);
  if (!state.debts.length) {
    const none = emptyState('No debts yet', 'Add your loans and credit cards to see how long they’ll take to pay off.', 'add-debt', 'Add debt', 'debt');
    return { html: head + tabbed('debt', { debts: none, plan: none, emi: emiCard() }), charts() {} };
  }
  const plans = { avalanche: debtPlan('avalanche'), snowball: debtPlan('snowball'), minimum: debtPlan('minimum') };
  const chosenKey = state.debtSettings.strategy;
  const chosen = plans[chosenKey];
  const byId = Object.fromEntries(state.debts.map(d => [d.id, d]));
  const minTotal = sum(state.debts.filter(d => d.balance > 0), d => d.minPayment);

  // Debts table + never-pays-off warnings
  const warnings = [];
  const rows = state.debts.map(d => {
    const mi = d.balance * F.monthlyRate(d.rate);
    const never = F.neverPaysOff(d.balance, d.rate, d.minPayment);
    const n = F.monthsToPayoff(d.balance, d.rate, d.minPayment);
    if (never) warnings.push(`<div class="alert alert-danger" role="alert">${ICON.warn}<div><strong>${esc(d.name)} will never be paid off</strong> at its minimum. The payment (${fmt(d.minPayment)}) doesn’t exceed the monthly interest (${fmt(mi)}). Pay more than ${fmt(mi)} a month.</div></div>`);
    return `<tr>
      <th scope="row" style="text-transform:none;font-size:14px;color:var(--text);letter-spacing:0">${esc(d.name)}</th>
      <td class="num">${fmt(d.balance)}</td><td class="num">${fmtRate(d.rate)}</td><td class="num">${fmt(d.minPayment)}</td><td class="num">${fmt(mi)}</td>
      <td>${d.balance <= 0 ? '<span class="badge badge-success">Paid off</span>' : never ? '<span class="badge badge-danger">Never</span>' : `<span class="badge badge-neutral">${monthsLabel(n)}</span>`}</td>
      <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-debt" data-id="${d.id}" aria-label="Edit ${esc(d.name)}">${ICON.edit}</button>
        <button type="button" class="icon-btn danger" data-action="delete-debt" data-id="${d.id}" aria-label="Delete ${esc(d.name)}">${ICON.trash}</button></td></tr>`;
  }).join('');
  const debtsCard = `<div class="card mb">
    <div class="card-head"><div><h2>Your debts</h2><p class="muted small">${fmt(sum(state.debts, d => d.balance))} total · ${fmt(minTotal)}/month in minimums</p></div>
      <div class="actions">${csvBtn('debts', 'debts')}</div></div>
    <div class="table-wrap"><table><thead><tr><th scope="col">Debt</th><th class="num" scope="col">Balance</th><th class="num" scope="col">Rate</th><th class="num" scope="col">Minimum</th><th class="num" scope="col">Monthly interest</th><th scope="col">Minimums only</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${warnings.length ? `<div style="margin-top:14px">${warnings.join('')}</div>` : ''}
  </div>`;

  // Plan settings
  const budgetMonthly = minTotal + state.debtSettings.extra;
  const planCard = `<div class="card mb">
    <div class="card-head"><div><h2>Monthly plan</h2><p class="muted small">Minimums ${fmt(minTotal)} + extra = total paid toward debt each month</p></div></div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
      <div class="field" style="width:200px">${moneyInput({ id: 'debt-extra', bind: 'debtSettings', field: 'extra', value: state.debtSettings.extra, label: 'Extra monthly payment', srLabel: false })}</div>
      <button type="button" class="btn no-print" data-action="use-split-debt">Use paycheck split</button>
      <div style="padding-bottom:8px">${incomeHint(budgetMonthly)}</div>
    </div>
  </div>`;

  // Strategy comparison
  const best = plans.avalanche.totalInterest <= plans.snowball.totalInterest + 0.005 ? 'avalanche' : 'snowball';
  const compareCard = key => {
    const p = plans[key];
    const isChosen = key === chosenKey;
    const title = key === 'avalanche' ? 'Avalanche' : 'Snowball';
    const tag = key === 'avalanche' ? 'Highest interest first' : 'Smallest balance first';
    let savedTxt;
    if (!p.paidOff) savedTxt = '—';
    else if (!plans.minimum.paidOff) savedTxt = '<span class="small tone-danger-text">Minimums alone never finish</span>';
    else savedTxt = fmt(plans.minimum.totalInterest - p.totalInterest);
    return `<div class="card compare ${isChosen ? 'is-chosen' : ''}">
      <div class="compare-head"><h3>${title}</h3><span class="badge">${tag}</span>${best === key && p.paidOff && Math.abs(plans.avalanche.totalInterest - plans.snowball.totalInterest) > 0.5 ? '<span class="badge badge-success">Lowest interest</span>' : ''}</div>
      <dl class="kv">
        <div><dt>Debt-free in</dt><dd>${p.paidOff ? `${monthsLabel(p.months)} · ${fmtMonthYear(F.addMonths(t, p.months))}` : '<span class="tone-danger-text">Not within 50 years</span>'}</dd></div>
        <div><dt>Months to payoff</dt><dd>${p.paidOff ? p.months : '600+'}</dd></div>
        <div><dt>Total interest</dt><dd>${fmt(p.totalInterest)}</dd></div>
        <div><dt>Interest saved vs minimums only</dt><dd>${savedTxt}</dd></div>
      </dl>
      <div><p class="small muted" style="margin-bottom:4px">Payoff order</p><ol class="order-list">${p.order.map(id => `<li>${esc(byId[id].name)}${p.payoffMonth[id] ? ` (${fmtMonthYear(F.addMonths(t, p.payoffMonth[id]))})` : ''}</li>`).join('')}</ol></div>
      <button type="button" class="btn ${isChosen ? '' : ''} no-print" data-action="choose-strategy" data-strategy="${key}" aria-pressed="${isChosen}">${isChosen ? 'Using this plan' : 'Use this plan'}</button>
    </div>`;
  };
  const mn = plans.minimum;
  const minLine = `<div class="alert ${mn.paidOff ? 'alert-info' : 'alert-danger'} mb">${mn.paidOff
    ? `Paying only minimums: ${monthsLabel(mn.months)} and ${fmt(mn.totalInterest)} in interest.`
    : `Paying only minimums, at least one debt is never paid off.`}</div>`;
  const cappedWarn = chosen.paidOff ? '' : `<div class="alert alert-danger mb" role="alert">${ICON.warn}<div><strong>This plan doesn’t clear your debt within 50 years.</strong> Increase the extra payment or the minimums.</div></div>`;

  // Month-by-month table (chosen plan)
  const open = !!ui.open['debt-table'];
  const active = state.debts.filter(d => d.balance > 0);
  const tRows = open ? chosen.rows.map(r => `<tr><td class="num">${r.month}</td><td>${fmtMonthShort(F.addMonths(t, r.month))}</td>${active.map(d => `<td class="num">${fmtExact(r.balances[d.id])}</td>`).join('')}<td class="num">${fmtExact(r.payment)}</td><td class="num">${fmtExact(r.interest)}</td><td class="num">${fmtExact(r.principal)}</td><td class="num">${fmtExact(r.totalBalance)}</td></tr>`).join('') : '';
  const schedCard = `<details class="collapsible" data-open-key="debt-table" ${openAttr('debt-table')}>
    <summary>Month-by-month plan (${chosenKey === 'snowball' ? 'Snowball' : 'Avalanche'}, ${chosen.rows.length} months)</summary>
    <div class="details-body"><div class="no-print">${csvLink('debt-schedule', 'month-by-month plan')}</div>
    ${open ? `<div class="sched-scroll"><table class="sched-table"><thead><tr><th class="num">#</th><th>Month</th>${active.map(d => `<th class="num">${esc(d.name)}</th>`).join('')}<th class="num">Paid</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Remaining</th></tr></thead><tbody>${tRows}</tbody></table></div>` : ''}</div>
  </details>`;

  const principalPaid = Math.max(0, chosen.totalPaid - chosen.totalInterest);
  const html = head + debtHero(chosen, chosenKey) + tabbed('debt', {
    debts: debtsCard + bossCard(),
    plan: planCard + (minTotal > 0 ? whatIfCard(minTotal) : '') + minLine + cappedWarn +
      `<div class="grid-2">${compareCard('avalanche')}${compareCard('snowball')}</div>` +
      `<div class="grid-2">${chartCard('Balance over time', `Each debt, ${chosenKey === 'snowball' ? 'Snowball' : 'Avalanche'} plan`, 'debt-area', chosen.rows.length > 0, 'No balance to chart.', 'lg')}
        ${chartCard('Principal vs interest', `Total paid: ${fmt(chosen.totalPaid)}`, 'debt-pie', chosen.totalPaid > 0, 'Nothing paid yet.', 'lg')}</div>` +
      `<div class="card mb"><div class="card-head"><div><h2>Payment schedule</h2><p class="muted small">Month by month, for the plan you picked.</p></div></div>${schedCard}</div>`,
    emi: emiCard()
  });

  return {
    html,
    charts() {
      updateWhatIf();
      if (!chosen.rows.length) return;
      const labels = planLabels(chosen);
      makeChart('debt-area', {
        type: 'line',
        data: { labels, datasets: active.map((d, i) => ({
          label: d.name, data: [d.balance].concat(chosen.rows.map(r => r.balances[d.id])),
          borderColor: colorAt(i), backgroundColor: hexA(colorAt(i), 0.55), fill: true, tension: 0.25, pointRadius: 0, pointHitRadius: 6, borderWidth: 1.5
        })) },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: moneyTooltip, footer: items => `Total: ${fmt(items.reduce((s, x) => s + x.parsed.y, 0))}` } } },
          scales: { y: Object.assign(moneyAxis(), { stacked: true }), x: xAxis } }
      });
      doughnut('debt-pie', ['Principal', 'Interest'], [principalPaid, chosen.totalInterest], [colorAt(0), colorAt(2)], 'pie');
    }
  };
}

