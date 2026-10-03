/* YOKO! Student · Gifts and savings goals pages.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   VIEW: GIFTS
   ========================================================= */
function giftBadge(days) {
  const cls = days <= 7 ? 'badge-warn' : days <= 30 ? '' : 'badge-neutral';
  return `<span class="badge ${cls}">${daysLabel(days)}</span>`;
}
function giftsPanel() {
  const head = '';
  if (!state.gifts.length) return { html: emptyState('No gifts planned', 'Add the people and occasions you buy for. You’ll see what’s coming up and how much to set aside each month.', 'add-gift', 'Add gift', 'gift'), charts() {} };

  const list = giftList();
  const total = sum(state.gifts, g => g.budget);
  const monthly = total / 12;
  const soon = list.filter(g => g.days <= 30);
  const t = todayDate();

  const rows = list.map(g => `<tr>
    <th scope="row" style="text-transform:none;font-size:14px;color:var(--text);letter-spacing:0">${esc(g.name)}</th>
    <td>${esc(g.label)}</td><td>${fmtDate(g.eff)}</td><td>${giftBadge(g.days)}</td><td class="num">${fmt(g.budget)}</td>
    <td>${esc(g.idea) || '<span class="muted">—</span>'}</td>
    <td><label class="sr-only" for="gift-status-${g.id}">Status for ${esc(g.name)}</label>
      <select id="gift-status-${g.id}" class="select input-sm" style="min-width:96px" data-bind="gift" data-id="${g.id}" data-field="status" data-kind="select">${GIFT_STATUS.map(s => `<option ${g.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-gift" data-id="${g.id}" aria-label="Edit gift for ${esc(g.name)}">${ICON.edit}</button>
      <button type="button" class="icon-btn danger" data-action="delete-gift" data-id="${g.id}" aria-label="Delete gift for ${esc(g.name)}">${ICON.trash}</button></td></tr>`).join('');

  const counts = GIFT_STATUS.map(s => `${state.gifts.filter(g => g.status === s).length} ${s.toLowerCase()}`).join(' · ');
  const html = head + `<div class="stats-grid" id="gift-stats">
      ${stat('Yearly gift budget', fmt(total), `${state.gifts.length} gift${state.gifts.length === 1 ? '' : 's'}`, 'featured')}
      <div class="card stat"><p class="stat-label">Set aside monthly</p><p class="stat-value">${fmt(monthly)}</p><p class="stat-sub">${incomeHint(monthly)}</p></div>
      ${stat('Due in 30 days', String(soon.length), soon.length ? `${fmt(sum(soon, g => g.budget))} needed` : 'Nothing due soon')}
      ${stat('Status', `${state.gifts.filter(g => g.status === 'Given').length}/${state.gifts.length} given`, counts)}
    </div>
    <div class="card mb" id="gifts-card"><div class="card-head"><div><h2>Upcoming gifts</h2><p class="muted small">Sorted by date. Past dates roll to next year.</p></div><div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-gift">${ICON.plus}<span>Add gift</span></button>${moreMenu([csvItem('gifts', 'gifts')])}</div></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Recipient</th><th scope="col">Occasion</th><th scope="col">Date</th><th scope="col">When</th><th class="num" scope="col">Budget</th><th scope="col">Gift idea</th><th scope="col">Status</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="grid-2">${chartCard('Gift spending by month', 'Next 12 months', 'gift-bar', total > 0, 'Add gift budgets to see this chart.')}${chartCard('By occasion', '', 'gift-pie', total > 0, 'Add gift budgets to see this chart.')}</div>`;

  return {
    html,
    charts() {
      if (!(total > 0)) return;
      const labels = [], data = [];
      for (let i = 0; i < 12; i++) {
        const m = F.addMonths(new Date(t.getFullYear(), t.getMonth(), 1), i);
        labels.push(fmtMonthShort(m));
        data.push(sum(list.filter(g => g.eff.getFullYear() === m.getFullYear() && g.eff.getMonth() === m.getMonth()), g => g.budget));
      }
      makeChart('gift-bar', {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Gift budget', data, backgroundColor: colorAt(0), borderRadius: 6, maxBarThickness: 36 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: moneyAxis(), x: Object.assign({}, xAxis, { ticks: { autoSkip: false, maxRotation: 0 } }) } }
      });
      const occ = {};
      list.forEach(g => { occ[g.label] = (occ[g.label] || 0) + g.budget; });
      const keys = Object.keys(occ).filter(k => occ[k] > 0);
      doughnut('gift-pie', keys, keys.map(k => occ[k]), keys.map((_, i) => colorAt(i)), 'pie');
    }
  };
}

/* =========================================================
   VIEW: SAVINGS GOALS
   ========================================================= */
function renderGoals() {
  const gp = giftsPanel();
  const head = viewHeader('goals', 'Goals & Gifts', 'Saving up for things, and the birthdays and holidays coming up.',
    `<button type="button" class="btn btn-primary" data-action="add-goal">${ICON.plus}<span>Add goal</span></button>`,
    state.goals.length ? [mi('Split the Savings bucket across goals', 'use-split-goals')] : []);
  if (!state.goals.length) return { html: head + tabbed('goals', { goals: emptyState('No savings goals yet', 'Add a goal with a target and a deadline to see how much to save each month.', 'add-goal', 'Add goal', 'goal'), gifts: gp.html, wishlist: wishlistCard(), challenges: challengesCard() }), charts() { gp.charts(); } };

  const t = todayDate();
  const infos = state.goals.map(g => ({ g, i: goalInfo(g) }));
  const totalSaved = sum(state.goals, g => g.saved), totalTarget = sum(state.goals, g => g.target);
  const totalReq = sum(infos, x => Number.isFinite(x.i.required) ? x.i.required : 0);
  const totalPlan = sum(state.goals, g => g.planMonthly || 0);

  const cards = infos.map(({ g, i }) => {
    let need;
    if (i.reached) need = '<span class="badge badge-success">Goal reached</span>';
    else if (!i.dl) need = '<span class="badge badge-neutral">No deadline</span>';
    else if (i.monthsLeft === 0) need = `<span class="badge badge-danger">Deadline passed · ${fmt(i.remaining)} to go</span>`;
    else need = incomeHint(i.required);
    let rev = '';
    if (!i.reached) {
      if (i.reverse) {
        const n = i.reverse.months;
        if (!Number.isFinite(n)) rev = '<p class="small tone-danger-text">At this rate you won’t reach it. Save something each month.</p>';
        else if (n > 1200) rev = '<p class="small tone-danger-text">That would take more than 100 years.</p>';
        else {
          const delta = i.dl ? i.monthsLeft - n : null;
          const when = delta === null ? '' : delta >= 0 ? `<span class="tone-success-text">${delta === 0 ? 'right on your deadline' : `${monthsLabel(delta)} before your deadline`}</span>` : `<span class="tone-warn-text">${monthsLabel(-delta)} after your deadline</span>`;
          rev = `<p class="small">You’ll reach it in <strong>${monthsLabel(n)}</strong> (${fmtMonthYear(i.reverse.date)})${when ? ' · ' + when : ''}.</p>`;
        }
      } else rev = '<p class="small muted">Enter a monthly amount to see when you’ll reach it.</p>';
    }
    const contrib = g.contributions.slice().sort((a, b) => b.date.localeCompare(a.date));
    return `<article class="card goal-card" aria-labelledby="goal-h-${g.id}">
      <div class="goal-top">${ring(i.pct)}<div style="min-width:0"><h3 id="goal-h-${g.id}">${esc(g.name)}</h3>
        <p class="num">${fmt(g.saved)} <span class="muted">of ${fmt(g.target)}</span></p>
        <p class="small muted">${i.dl ? `By ${fmtDate(i.dl)}${i.monthsLeft > 0 ? ` · ${monthsLabel(i.monthsLeft)} left` : ''}` : 'No deadline'}${g.rate > 0 ? ` · earns ${fmtRate(g.rate)}/yr` : ''}</p></div></div>
      <div class="progress" role="progressbar" aria-label="${esc(g.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(i.pct)}"><span style="width:${i.pct}%"></span></div>
      <div><p class="small muted" style="margin-bottom:4px">Required to hit the deadline</p>${need}</div>
      ${i.reached ? '' : `<div class="reverse">
        <div class="row"><label for="goal-plan-${g.id}" class="small" style="font-weight:600">If I save</label>
          ${moneyInput({ id: `goal-plan-${g.id}`, bind: 'goal', dataId: g.id, field: 'planMonthly', value: g.planMonthly, kind: 'moneyOpt', placeholder: numStr(Number.isFinite(i.required) ? Math.ceil(i.required) : 0) }).replace('<span class="field-error"', '<span class="small">/month</span><span class="field-error"')}</div>
        ${rev}</div>`}
      ${g.rate > 0 && !i.reached ? `<p class="small">At ${fmtRate(g.rate)} a year, your money doubles in about ${Math.round(F.ruleOf72(g.rate))} years (rule of 72).</p>` : ''}
      ${state.settings.roundUp.enabled && state.settings.roundUp.goalId === g.id ? `<p class="small"><span class="badge">🫙 Round-up jar</span> ${fmt(sum(g.contributions.filter(c => c.roundup), c => c.amount))} from spare change so far</p>` : ''}
      <div class="goal-actions no-print">
        <button type="button" class="btn btn-sm btn-primary" data-action="add-money" data-id="${g.id}">${ICON.plus}<span>Add money</span></button>
        ${moreMenu([mi('Edit goal', 'edit-goal', { id: g.id }), mi('Delete goal', 'delete-goal', { id: g.id })], `More for ${g.name}`)}
      </div>
      <details class="collapsible" style="margin-top:0" data-open-key="goal-hist-${g.id}" ${openAttr('goal-hist-' + g.id)}><summary>Contributions (${contrib.length})</summary>
        <div class="details-body">${contrib.length ? `<ul class="contrib-list">${contrib.map(c => `<li><span>${fmtDate(F.parseDate(c.date))}${c.note ? ` · <span class="muted">${esc(c.note)}</span>` : ''}</span><span style="display:flex;align-items:center;gap:4px"><strong class="num">${fmt(c.amount)}</strong>
          ${c.roundup ? '' : `<button type="button" class="icon-btn no-print" data-action="edit-contribution" data-id="${g.id}" data-cid="${c.id}" aria-label="Edit contribution of ${esc(fmt(c.amount))}">${ICON.edit}</button>`}<button type="button" class="icon-btn danger no-print" data-action="delete-contribution" data-id="${g.id}" data-cid="${c.id}" aria-label="Remove contribution of ${esc(fmt(c.amount))}">${ICON.trash}</button></span></li>`).join('')}</ul>` : '<p class="small muted">No contributions logged yet.</p>'}</div></details>
    </article>`;
  }).join('');

  let sel = state.goals.find(g => g.id === state.goalSettings.selectedGoalId) || state.goals[0];
  const selSelect = `<label for="goal-chart-select" class="sr-only">Goal to chart</label>
    <select id="goal-chart-select" class="select input-sm" style="width:auto;min-width:0;max-width:100%" data-bind="goalSettings" data-field="selectedGoalId" data-kind="select">${state.goals.map(g => `<option value="${g.id}" ${g.id === sel.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;

  const goalsPanel = `<div class="stats-grid">
      ${stat('Total saved', fmt(totalSaved), totalTarget > 0 ? `${fmtPct(totalSaved / totalTarget * 100)} of all targets` : '', 'featured')}
      ${stat('Total target', fmt(totalTarget), `${state.goals.length} goal${state.goals.length === 1 ? '' : 's'}`)}
      <div class="card stat"><p class="stat-label">Needed each month</p><p class="stat-value">${fmt(totalReq)}</p><p class="stat-sub">${incomeHint(totalReq)}</p></div>
      ${stat('Your monthly plan', fmt(totalPlan), totalPlan > 0 ? `Goals bucket: ${fmt(bucketMonthly('goals'))}/month` : 'Set “If I save” amounts below')}
    </div>
    <div class="grid-cards">${cards}</div>
    <div class="card mb"><div class="card-head"><div><h2>Projected balance vs target</h2><p class="muted small">${sel.planMonthly !== null ? `Saving ${fmt(sel.planMonthly)}/month (your plan)` : 'Saving the required amount each month'}${sel.rate > 0 ? `, earning ${fmtRate(sel.rate)}/yr` : ''}</p></div><div class="actions no-print">${selSelect}</div></div>
      <div class="chart-box lg"><canvas id="goal-line" role="img" aria-label="Projected balance for ${esc(sel.name)}"></canvas></div></div>
    <div class="card mb"><div class="card-head"><div><h2>All goals</h2></div><div class="actions">${moreMenu([csvItem('goals', 'goals'), csvItem('contributions', 'contributions')])}</div></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Goal</th><th class="num" scope="col">Target</th><th class="num" scope="col">Saved</th><th class="num" scope="col">Progress</th><th scope="col">Deadline</th><th class="num" scope="col">Rate</th><th class="num" scope="col">Needed / month</th></tr></thead><tbody>
      ${infos.map(({ g, i }) => `<tr><td>${esc(g.name)}</td><td class="num">${fmt(g.target)}</td><td class="num">${fmt(g.saved)}</td><td class="num">${fmtPct(i.pct)}</td><td>${i.dl ? fmtDate(i.dl) : '—'}</td><td class="num">${fmtRate(g.rate)}</td><td class="num">${i.reached ? 'Reached' : fmt(i.required)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  const html = head + tabbed('goals', { goals: goalsPanel, gifts: gp.html, wishlist: wishlistCard(), challenges: challengesCard() });

  return {
    html,
    charts() {
      gp.charts();
      if (!document.getElementById('goal-line')) return;
      const i = goalInfo(sel);
      const pmt = sel.planMonthly !== null ? sel.planMonthly : (Number.isFinite(i.required) ? i.required : 0);
      const reach = F.monthsToReachGoal(sel.target, sel.saved, sel.rate, pmt);
      const horizon = clamp(Math.max(i.monthsLeft, Number.isFinite(reach) ? reach : 0, 6), 6, 360);
      const proj = F.projectBalance(sel.saved, sel.rate, pmt, horizon);
      const labels = proj.map((_, k) => fmtMonthShort(F.addMonths(t, k)));
      const datasets = [
        { label: 'Projected balance', data: proj, borderColor: colorAt(0), backgroundColor: hexA(colorAt(0), 0.2), fill: 'origin', tension: 0.25, pointRadius: 0, pointHitRadius: 8, borderWidth: 2.5 },
        { label: 'Target', data: proj.map(() => sel.target), borderColor: colorAt(2), borderDash: [6, 5], pointRadius: 0, borderWidth: 1.5, fill: false }
      ];
      if (sel.planMonthly !== null && Number.isFinite(i.required) && !i.reached && i.monthsLeft > 0) {
        datasets.push({ label: 'Required pace', data: F.projectBalance(sel.saved, sel.rate, i.required, horizon).map((v, k) => k <= i.monthsLeft ? v : null),
          borderColor: '#6C8EAD', borderDash: [2, 4], pointRadius: 0, borderWidth: 1.5, fill: false });
      }
      makeChart('goal-line', { type: 'line', data: { labels, datasets },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: ctx => ctx.parsed.y === null ? null : moneyTooltip(ctx) } } }, scales: { y: moneyAxis(), x: xAxis } } });
    }
  };
}

