/* YOKO! Student · Dashboard page (Home).
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   VIEW: DASHBOARD (HOME)
   ========================================================= */

/** Safe-to-spend hero: the biggest element on Home. */
function safeToSpendHero() {
  const inc = monthlyIncome();
  if (!(inc > 0)) {   // no allowance yet: nothing is "overspent", there's just nothing to divide
    return `<div class="card safe-hero" id="safe-hero">
      <p class="stat-label">Safe to spend today</p>
      <p class="safe-hero-reason">Add your allowance and YOKO! works out how much you can spend each day.</p>
      <div class="safe-hero-actions no-print"><button type="button" class="btn btn-primary btn-sm" data-action="open-paycheck"><span>Set allowance</span></button></div>
    </div>`;
  }
  const sts = studentSafeToSpend();
  const al = allowanceLeft();
  const next = nextPayInfo() ? { days: al.daysLeft } : null;
  const t = todayDate();
  const statusLabel = sts.status === 'green' ? 'On track' : sts.status === 'amber' ? 'Tight pace' : 'Overspent';
  const statusIcon = sts.status === 'green' ? '●' : sts.status === 'amber' ? '▲' : '■';

  return `<div class="card safe-hero safe-${sts.status}" id="safe-hero">
    <div class="safe-hero-header">
      <span class="safe-badge safe-badge-${sts.status}"><span class="status-dot ${sts.status}">${statusIcon}</span> ${statusLabel}</span>
      <span class="small muted">${next ? `Next allowance ${daysLabel(next.days).toLowerCase()}` : (state.income.irregular ? 'Irregular allowance' : `${F.daysLeftInMonth(t)} days left this month`)}</span>
    </div>
    <div class="safe-hero-body">
      <p class="safe-hero-label">Safe to spend today</p>
      <h1 class="safe-hero-amount">${fmt(sts.perDay)} <span class="safe-hero-sub">a day for the next ${plural(sts.daysLeft, 'day')}</span></h1>
      <p class="safe-hero-reason">${esc(sts.reason)}</p>
      <div class="safe-hero-formula small muted">
        <span>Available: <strong>${fmt(sts.available)}</strong></span>
        <span>·</span>
        <span>Balance: ${fmt(sts.available + (sts.upcomingBills || 0))}</span>
        ${sts.upcomingBills > 0 ? `<span>− Bills: ${fmt(sts.upcomingBills)}</span>` : ''}
        <span>÷ ${plural(sts.daysLeft, 'day')}</span>
      </div>
    </div>
    <div class="safe-hero-actions no-print">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-expense">${ICON.plus}<span>Log expense</span></button>
      <button type="button" class="btn btn-sm" data-action="open-paycheck"><span>Edit allowance</span></button>
      ${sts.status === 'red' ? `<button type="button" class="btn btn-sm btn-warn" data-action="ask-topup"><span>🙏 Ask for a top-up</span></button>` : ''}
    </div>
  </div>`;
}

/** Forecast card with interactive sliders for flexible spending. */
function runOutForecastCard(chartId = 'dash-forecast-chart') {
  const fc = studentRunOutForecast();
  const days = allowanceLeft().daysLeft;

  return `<div class="card mb" id="forecast-card">
    <div class="card-head">
      <div>
        <h2>Run-out forecast</h2>
        <p class="muted small">Projected balance until your next allowance based on 30-day average spend.</p>
      </div>
      <div id="forecast-status-badge" class="badge ${fc.willMakeIt ? 'badge-success' : 'badge-danger'}">
        ${fc.willMakeIt ? `✓ You’ll make it with ${fmt(fc.endBalance)} left` : `⚠️ Runs out ${fc.runOutDay ? fmtDate(F.parseDate(fc.runOutDay)) : 'soon'} (${Math.max(1, days - (fc.runOutDayIndex || 0))} days before allowance)`}
      </div>
    </div>
    <div class="chart-box" style="height:210px;position:relative"><canvas id="${chartId}"></canvas></div>
    <div class="slider-panel no-print">
      <p class="slider-panel-title"><strong>Adjust flexible spending</strong> <span class="small muted">(drag to test your habits)</span></p>
      <div class="slider-grid">
        <div class="slider-item">
          <div class="slider-header"><label for="slider-food">🍔 Food delivery / takeout</label><span class="slider-val" id="val-slider-food">3 orders/wk</span></div>
          <input type="range" class="range-slider" id="slider-food" min="0" max="14" step="1" value="3" data-cat="Food" data-base="3" data-cost="200" data-unit="orders/wk">
        </div>
        <div class="slider-item">
          <div class="slider-header"><label for="slider-fun">🎉 Outings & fun</label><span class="slider-val" id="val-slider-fun">2 times/wk</span></div>
          <input type="range" class="range-slider" id="slider-fun" min="0" max="7" step="1" value="2" data-cat="Fun" data-base="2" data-cost="450" data-unit="times/wk">
        </div>
        <div class="slider-item">
          <div class="slider-header"><label for="slider-chai">☕ Chai / coffee / snacks</label><span class="slider-val" id="val-slider-chai">2 cups/day</span></div>
          <input type="range" class="range-slider" id="slider-chai" min="0" max="6" step="1" value="2" data-cat="Chai" data-base="2" data-cost="25" data-unit="cups/day" data-freq="daily">
        </div>
      </div>
    </div>
  </div>`;
}

/** Semester overview card with heavy months and progress. */
function semesterCard() {
  const sem = studentSemesterPlan();
  const sData = (state.student && state.student.semester) || {};
  const t = todayDate();
  const startStr = sData.start ? fmtMonthYear(F.parseDate(sData.start)) : fmtMonthYear(t);
  const endStr = sData.end ? fmtMonthYear(F.parseDate(sData.end)) : fmtMonthYear(F.addMonths(t, 4));
  const heavy = sData.heavyMonths || [];

  return `<div class="card mb" id="semester-card">
    <div class="card-head">
      <div>
        <h2>Semester plan</h2>
        <p class="muted small">${startStr} – ${endStr} (${plural(sem.months, 'month')})</p>
      </div>
      <div class="actions no-print">
        <span class="badge ${sem.onTrack ? 'badge-success' : 'badge-warn'}">${sem.onTrack ? '✓ On track' : `⚠️ Behind by ${fmt(sem.diff)}`}</span>
        <button type="button" class="btn btn-sm" data-action="open-semester-modal">${ICON.edit}<span>Edit semester</span></button>
      </div>
    </div>
    <div class="stats-grid three" style="margin-bottom:12px">
      ${stat('Semester income', fmt(sem.totalIncome), `${fmt(monthlyIncome())} / month`)}
      ${stat('Base expenses', fmt(sem.baseExpenses), `${fmt(sem.baseExpenses / sem.months)} / month`)}
      ${stat('Heavy month expenses', fmt(sem.heavyTotal), `${heavy.length} planned spikes`, sem.heavyTotal > 0 ? 'tone-warn' : '')}
    </div>
    ${sem.onTrack ? `<div class="alert alert-info" style="margin-bottom:12px">Your expected income and savings comfortably cover your regular expenses and heavy semester months with a <strong>${fmt(sem.surplus)} surplus</strong>.</div>`
      : `<div class="alert alert-warn" style="margin-bottom:12px">You need to set aside approximately <strong>${fmt(sem.monthlyBufferNeeded)} a month</strong> to cover upcoming fees, exams and trips without running dry.</div>`}
    ${heavy.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Month</th><th scope="col">Event / Fee</th><th class="num" scope="col">Amount</th></tr></thead>
      <tbody>${heavy.map(h => `<tr><td><strong>${monthLabelISO(h.month)}</strong></td><td>${esc(h.name)}</td><td class="num font-bold">${fmt(h.amount)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No heavy months marked yet. Tap "Edit semester" to plan semester fees, exam costs or trips.</p>'}
  </div>`;
}

function bindForecastSliders(chartId = 'dash-forecast-chart') {
  const container = document.getElementById('forecast-card');
  if (!container) return;
  const sliders = container.querySelectorAll('.range-slider');
  if (!sliders.length) return;

  const onSlide = () => {
    let deltaFood = 0, deltaFun = 0, deltaChai = 0;
    sliders.forEach(s => {
      const val = Number(s.value);
      const base = Number(s.dataset.base || 0);
      const cost = Number(s.dataset.cost || 0);
      const unit = s.dataset.unit || '';
      const isDaily = s.dataset.freq === 'daily';
      const label = container.querySelector('#val-' + s.id);
      if (label) label.textContent = `${val} ${unit}`;

      const delta = (val - base) * cost * (isDaily ? 1 : 1 / 7);
      if (s.dataset.cat === 'Food') deltaFood = delta;
      else if (s.dataset.cat === 'Fun') deltaFun = delta;
      else if (s.dataset.cat === 'Chai') deltaChai = delta;
    });

    const newFc = studentRunOutForecast({ Food: deltaFood, Fun: deltaFun, Chai: deltaChai });
    updateRunOutChartLive(chartId, newFc);

    const badge = container.querySelector('#forecast-status-badge');
    if (badge) {
      badge.className = `badge ${newFc.willMakeIt ? 'badge-success' : 'badge-danger'}`;
      badge.textContent = newFc.willMakeIt ? `✓ You’ll make it with ${fmt(newFc.endBalance)} left` : `⚠️ Runs out ${newFc.runOutDay ? fmtDate(F.parseDate(newFc.runOutDay)) : 'soon'}`;
    }
  };

  sliders.forEach(s => s.addEventListener('input', onSlide));
}

function renderDashboard() {
  const t = todayDate();
  const inc = monthlyIncome();
  const al = allowanceLeft();
  const next = nextPayInfo() ? { days: al.daysLeft } : null;
  const b = budgetTotals(), rw = runwayInfo(), sk = streakInfo();
  const saved = sum(state.goals, g => g.saved), target = sum(state.goals, g => g.target);
  const sp = spendingSource();

  let html = viewHeader('dashboard', 'Home', `${FULL_MONTHS[t.getMonth()]} ${t.getFullYear()}`,
    `<button type="button" class="btn" data-action="open-wrapped"><span aria-hidden="true">🎬</span><span>Money Wrapped</span></button>`);

  if (!hasAnyData()) {
    html += emptyState('Nothing here yet', 'Set your student allowance to build your budget and daily safe-to-spend amount. Or explore with sample data.', 'open-paycheck', 'Set allowance', 'dashboard');
  }

  const overview = sampleBanner() + backupBanner() + (typeof budgetNudgeBanner === 'function' ? budgetNudgeBanner() : '') + subCheckCard() + commandBarHTML() + safeToSpendHero() +
    `<div class="stats-grid three">
      ${stat('Monthly allowance', fmt(inc), `${state.income.irregular ? `${irregularLine()} · <button type="button" class="linklike" data-action="log-income">Log income</button>` : `${next ? `Next allowance ${daysLabel(next.days).toLowerCase()} · ` : ''}<button type="button" class="linklike" data-action="open-paycheck">Edit</button>`}`, 'featured')}
      ${al.byPayday
        ? stat('Left until payday', fmt(al.balance), inc > 0 ? `${fmtPct(al.spent / inc * 100)} of this allowance spent` : 'Track spending', al.balance < 0 ? 'tone-danger' : '')
        : stat('Left this month', fmt(b.remaining), inc > 0 ? `${fmtPct(b.actual / inc * 100)} of allowance spent` : 'Track spending', b.remaining < 0 ? 'tone-danger' : '')}
      ${stat('No-spend streak', `🔥 ${plural(sk.current, 'day')}`, `Longest: ${plural(sk.longest, 'day')}`)}
    </div>` +
    runOutForecastCard('dash-forecast-chart') +
    semesterCard() +
    `<div class="grid-2">${petCard()}${questsCard()}</div>`;

  const forecastTab = runOutForecastCard('tab-forecast-chart') + `<div class="grid-2">${weatherCard()}${questsCard()}</div>`;
  const semesterTab = semesterCard() + `<div class="grid-2">${chartCard('Savings goal progress', '% of each target saved', 'dash-goals-tab', state.goals.length > 0, 'Add a savings goal to track progress.')}</div>`;

  const chartsTab = `<div class="grid-2">
    ${chartCard('Spending by category', sp.useActual ? 'Actual spending this month' : (sp.list.length ? 'Planned' : ''), 'dash-spend', sp.list.length > 0, 'Log expenses to see where your money goes.')}
    ${chartCard('Savings goal progress', '% of each target saved', 'dash-goals', state.goals.length > 0, 'Add a savings goal to track progress.')}
  </div>`;

  html += tabbed('dashboard', {
    overview,
    forecast: forecastTab,
    semester: semesterTab,
    calendar: calendarCard(),
    charts: chartsTab
  });

  return {
    html,
    charts() {
      const tab = currentTab('dashboard');
      if (tab === 'overview') {
        const fc = studentRunOutForecast();
        runOutLineChart('dash-forecast-chart', fc);
        bindForecastSliders('dash-forecast-chart');
        bindCommandBar();
      } else if (tab === 'forecast') {
        const fc = studentRunOutForecast();
        runOutLineChart('tab-forecast-chart', fc);
        bindForecastSliders('tab-forecast-chart');
      } else if (tab === 'semester') {
        if (state.goals.length) goalsBarChart('dash-goals-tab');
      } else if (tab === 'charts') {
        if (sp.list.length) spendChart('dash-spend');
        if (state.goals.length) goalsBarChart('dash-goals');
      }
    }
  };
}

/** Semester edit modal */
function openSemesterModal() {
  const sem = (state.student && state.student.semester) || {};
  const t = todayDate();
  const startVal = sem.start || todayISO().slice(0, 7) + '-01';
  const endVal = sem.end || F.toISO(F.addMonths(t, 4));
  const heavy = sem.heavyMonths || [];

  formModal({
    title: 'Semester plan',
    submitLabel: 'Save semester plan',
    values: {
      start: startVal,
      end: endVal,
      fee1Name: heavy[0] ? heavy[0].name : 'Semester exam & lab fees',
      fee1Month: heavy[0] ? heavy[0].month : F.toISO(F.addMonths(t, 1)).slice(0, 7),
      fee1Amount: heavy[0] ? heavy[0].amount : 0,
      fee2Name: heavy[1] ? heavy[1].name : 'Festivals / College trip',
      fee2Month: heavy[1] ? heavy[1].month : F.toISO(F.addMonths(t, 2)).slice(0, 7),
      fee2Amount: heavy[1] ? heavy[1].amount : 0
    },
    fields: [
      { name: 'start', label: 'Semester start date', kind: 'date', required: true },
      { name: 'end', label: 'Semester end date', kind: 'date', required: true },
      { name: 'fee1Name', label: 'Heavy month 1 (name)', kind: 'text', placeholder: 'e.g. Exam fees, Hostel deposit', max: 60 },
      { name: 'fee1Month', label: 'Heavy month 1 (month)', kind: 'select', options: Array.from({ length: 6 }, (_, i) => { const d = F.addMonths(t, i); const k = F.toISO(d).slice(0, 7); return [k, monthLabelISO(k)]; }) },
      { name: 'fee1Amount', label: 'Heavy month 1 (amount)', kind: 'money', positive: true },
      { name: 'fee2Name', label: 'Heavy month 2 (name)', kind: 'text', placeholder: 'e.g. Festival trip, Moving', max: 60 },
      { name: 'fee2Month', label: 'Heavy month 2 (month)', kind: 'select', options: Array.from({ length: 6 }, (_, i) => { const d = F.addMonths(t, i); const k = F.toISO(d).slice(0, 7); return [k, monthLabelISO(k)]; }) },
      { name: 'fee2Amount', label: 'Heavy month 2 (amount)', kind: 'money', positive: true }
    ],
    onSave: v => {
      const heavyMonths = [];
      if (v.fee1Amount > 0 && v.fee1Name) {
        heavyMonths.push({ id: uid(), name: v.fee1Name.trim(), month: v.fee1Month, amount: v.fee1Amount });
      }
      if (v.fee2Amount > 0 && v.fee2Name) {
        heavyMonths.push({ id: uid(), name: v.fee2Name.trim(), month: v.fee2Month, amount: v.fee2Amount });
      }
      state.student = state.student || {};
      state.student.semester = {
        start: v.start,
        end: v.end,
        heavyMonths
      };
      commit();
      toast('Semester plan saved');
    }
  });
}

