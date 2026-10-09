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

  return `<div class="card safe-hero safe-${sts.status}" id="safe-hero">
    <div class="safe-hero-header">
      <p class="safe-hero-label">Safe to spend today</p>
      <span class="small muted">${next ? `Next allowance ${daysLabel(next.days).toLowerCase()}` : (state.income.irregular ? 'Irregular allowance' : `${F.daysLeftInMonth(t)} days left this month`)}</span>
    </div>
    <div class="safe-hero-body">
      <h1 class="safe-hero-amount">${fmtExact(sts.leftToday)}</h1>
      <p class="safe-hero-reason"><span class="safe-status is-${sts.status}">${sts.status === 'green' && sts.overToday <= 0 && sts.available > 0 ? statusLabel : statusLabel + '.'}</span> ${sts.overToday > 0 ? `You went ${fmtExact(sts.overToday)} over today’s limit. Tomorrow’s limit adjusts.` : sts.available <= 0 ? 'Nothing left after bills. Showing 0.' : esc(sts.reason.replace(/^On track /, ''))}</p>
      <div class="safe-hero-formula small muted">
        <span>Daily limit: <strong>${fmtExact(sts.dailyLimit)}</strong></span>
        <span>·</span>
        <span>Spent today: ${fmtExact(sts.spentToday)}</span>
      </div>
      <div class="safe-hero-formula small muted">
        <span>This week: <strong>${fmtExact(sts.weekLeft)}</strong> left · spent ${fmtExact(sts.spentWeek)}</span>
      </div>
      <div class="safe-hero-formula small muted">
        <span>${sts.fromBank ? 'In your bank / UPI' : 'Left this period'}: ${fmtExact(sts.balanceNow)}</span>
        ${sts.upcomingBills > 0 ? `<span>− Bills ${fmtExact(sts.upcomingBills)}</span>` : ''}
        ${sts.debtDue > 0 ? `<span>− Debt ${fmtExact(sts.debtDue)}</span>` : ''}
        <span>· ${plural(sts.daysLeft, 'day')} left</span>
      </div>
    </div>
    ${(() => { const due = billsDueSoon(); return due.length ? `<div class="safe-due">${due.slice(0, 3).map(b => `<span>${b.date === todayISO() ? 'Due today' : 'Due tomorrow'}: <strong>${esc(b.name)}</strong> ${fmtExact(b.amount)}</span>`).join('')}</div>` : ''; })()}
    <div class="safe-hero-actions no-print">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-expense">${ICON.plus}<span>Log expense</span></button>
      <button type="button" class="btn btn-sm" data-action="set-bank">${state.settings.bank ? `Bank: ${fmtExact(bankBalanceNow())}` : 'Add bank balance'}</button>
      <button type="button" class="btn btn-sm" data-action="open-paycheck"><span>Edit allowance</span></button>
      ${sts.status === 'red' ? `<button type="button" class="btn btn-sm btn-warn" data-action="ask-topup"><span>Ask for a top-up</span></button>` : ''}
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
        <p class="muted small">Your money until the next allowance: wants at your current pace, plus bills not paid yet.</p>
      </div>
      <div id="forecast-status-badge" class="badge ${fc.willMakeIt ? 'badge-success' : 'badge-danger'}">
        ${fc.willMakeIt ? `You’ll make it with ${fmt(fc.endBalance)} left` : `Runs out ${fc.runOutDay ? fmtDate(F.parseDate(fc.runOutDay)) : 'soon'} (${Math.max(1, days - (fc.runOutDayIndex || 0))} days before allowance)`}
      </div>
    </div>
    <div class="chart-box" style="height:210px;position:relative"><canvas id="${chartId}"></canvas></div>
    <div class="slider-panel no-print">
      <div class="slider-panel-head"><p class="slider-panel-title"><strong>Your spending habits</strong> <span class="small muted">(drag to see what changes)</span></p>
        <button type="button" class="btn btn-sm" data-action="edit-habits">${ICON.edit}<span>Edit habits</span></button></div>
      ${habitsList().length ? `<div class="slider-grid">${habitsList().map(h => {
        const max = Math.max(5, Math.ceil(h.now * 3), h.now + 3);
        return `<div class="slider-item">
          <div class="slider-header"><label for="slider-${h.id}">${esc(h.name)}</label><span class="slider-val" id="val-slider-${h.id}">${h.now} ${h.per === 'day' ? 'a day' : 'a week'}</span></div>
          <input type="range" class="range-slider" id="slider-${h.id}" min="0" max="${max}" step="1" value="${h.now}" data-hid="${h.id}" data-base="${h.now}" data-cost="${h.cost}" data-per="${h.per}">
          <p class="small muted slider-cost">${fmt(h.cost)} each</p>
        </div>`;
      }).join('')}</div>` : '<p class="small muted">Add the things you spend on often, like takeout, cafes or cabs, and see how changing them moves your forecast.</p>'}
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
        <span class="badge ${sem.onTrack ? 'badge-success' : 'badge-warn'}">${sem.onTrack ? 'On track' : `Behind by ${fmt(sem.diff)}`}</span>
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
    const adj = {};
    sliders.forEach(s => {
      const val = Number(s.value), base = Number(s.dataset.base || 0), cost = Number(s.dataset.cost || 0), daily = s.dataset.per === 'day';
      const label = container.querySelector('#val-' + s.id);
      if (label) label.textContent = `${val} ${daily ? 'a day' : 'a week'}`;
      adj['habit:' + s.dataset.hid] = (val - base) * cost * (daily ? 1 : 1 / 7);
    });
    const newFc = studentRunOutForecast(adj);
    updateRunOutChartLive(chartId, newFc);

    const badge = container.querySelector('#forecast-status-badge');
    if (badge) {
      badge.className = `badge ${newFc.willMakeIt ? 'badge-success' : 'badge-danger'}`;
      badge.textContent = newFc.willMakeIt ? `You’ll make it with ${fmt(newFc.endBalance)} left` : `Runs out ${newFc.runOutDay ? fmtDate(F.parseDate(newFc.runOutDay)) : 'soon'}`;
    }
  };

  sliders.forEach(s => s.addEventListener('input', onSlide));
}

/* ---------- Savings: how much the student is saving ---------- */
function savingsByMonth(ym) {
  const savCats = new Set(state.budget.categories.filter(c => c.type === 'savings').map(c => c.id));
  const goalIn = sum(state.goals.flatMap(g => g.contributions.filter(c => c.date.slice(0, 7) === ym)), c => c.amount);
  const catIn = sum(state.budget.expenses.filter(x => x.date.slice(0, 7) === ym && savCats.has(x.categoryId)), x => x.amount);
  return goalIn + catIn;
}
function savingsInfo() {
  const t = todayDate(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); months.push({ ym: F.toISO(d).slice(0, 7), label: SHORT_MONTHS_SAFE(d.getMonth()) }); }
  months.forEach(m => { m.amount = savingsByMonth(m.ym); });
  const thisM = months[5].amount, lastM = months[4].amount, inc = monthlyIncome();
  return { months, thisM, lastM, change: thisM - lastM, rate: inc > 0 ? thisM / inc * 100 : null,
    total: sum(state.goals, g => g.saved), goals: state.goals.filter(g => g.target > 0) };
}
function SHORT_MONTHS_SAFE(i) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]; }
function savingsCard(chartId = 'dash-savings-chart') {
  const s = savingsInfo();
  const ch = s.change, chTxt = s.lastM === 0 && s.thisM === 0 ? 'Nothing saved yet' : `${ch >= 0 ? '▲' : '▼'} ${fmtExact(Math.abs(ch))} vs last month`;
  const goals = s.goals.slice(0, 4).map(g => { const p = Math.min(100, g.saved / g.target * 100); return `<div class="sv-goal"><div class="sv-goal-top"><span>${esc(g.name)}</span><span class="small muted">${fmtExact(g.saved)} of ${fmtExact(g.target)}</span></div><div class="progress" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(g.name)}"><span style="width:${p}%"></span></div></div>`; }).join('');
  return `<div class="card mb savings-card" id="savings-card">
    <div class="card-head"><div><h2>Your savings</h2><p class="muted small">Goal deposits plus money put in savings categories.</p></div>
      <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-goal">${ICON.plus}<span>Goal</span></button></div></div>
    <div class="exact-grid">
      <div><p class="stat-label">Total saved</p><p class="exact-val">${fmtExact(s.total)}</p></div>
      <div><p class="stat-label">This month</p><p class="exact-val">${fmtExact(s.thisM)}</p><p class="small ${ch >= 0 ? 'sv-up' : 'tone-danger-text'}">${chTxt}</p></div>
      <div><p class="stat-label">Savings rate</p><p class="exact-val">${s.rate === null ? '-' : fmtPct(s.rate)}</p><p class="small muted">of this month’s income</p></div>
    </div>
    <div class="sv-chart"><canvas id="${chartId}" aria-label="Savings in the last 6 months" role="img"></canvas></div>
    ${goals ? `<div class="sv-goals">${goals}</div>` : '<p class="small muted">Add a goal to see your progress here.</p>'}
  </div>`;
}
function drawSavingsChart(id) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  const s = savingsInfo();
  makeChart(id, { type: 'bar', data: { labels: s.months.map(m => m.label), datasets: [{ label: 'Saved', data: s.months.map(m => Math.round(m.amount * 100) / 100), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#7ED957', borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtExact(c.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => fmtCompactSafe(v) } } } } });
}
function fmtCompactSafe(v) { try { return fmt(v); } catch (e) { return String(v); } }

function renderDashboard() {
  const t = todayDate();
  const inc = monthlyIncome();
  const al = allowanceLeft();
  const next = nextPayInfo() ? { days: al.daysLeft } : null;
  const b = budgetTotals(), rw = runwayInfo(), sk = streakInfo();
  const saved = sum(state.goals, g => g.saved), target = sum(state.goals, g => g.target);
  const sp = spendingSource();

  let html = viewHeader('dashboard', 'Home', `${FULL_MONTHS[t.getMonth()]} ${t.getFullYear()}`,
    `<button type="button" class="btn btn-primary" data-action="scan-receipt">${ICON.camera}<span>Scan receipt</span></button><button type="button" class="btn" data-action="tour-all"><span>Full tutorial</span></button>`, [mi('What’s new', 'whats-new'), mi('Money Wrapped', 'open-wrapped')]);

  if (!hasAnyData()) {
    html += emptyState('Nothing here yet', 'Set your student allowance to build your budget and daily safe-to-spend amount. Or explore with sample data.', 'open-paycheck', 'Set allowance', 'dashboard');
  }

  const overview = sampleBanner() + backupBanner() + (typeof budgetNudgeBanner === 'function' ? budgetNudgeBanner() : '') + subCheckCard() + commandBarHTML() + safeToSpendHero() +
    `<div class="stats-grid three">
      ${stat('Monthly allowance', fmt(inc), `${state.income.irregular ? `${irregularLine()} · <button type="button" class="linklike" data-action="log-income">Log income</button>` : `${next ? `Next allowance ${daysLabel(next.days).toLowerCase()} · ` : ''}<button type="button" class="linklike" data-action="open-paycheck">Edit</button>`}`, 'featured')}
      ${al.byPayday
        ? stat('Left until payday', fmt(al.balance), inc > 0 ? `${fmtPct(al.spent / inc * 100)} of this allowance spent` : 'Track spending', al.balance < 0 ? 'tone-danger' : '')
        : stat('Left this month', fmt(b.remaining), inc > 0 ? `${fmtPct(b.actual / inc * 100)} of allowance spent` : 'Track spending', b.remaining < 0 ? 'tone-danger' : '')}
      ${stat('No-spend streak', `${plural(sk.current, 'day')}`, `Longest: ${plural(sk.longest, 'day')}`)}
    </div>` +
    savingsCard('dash-savings-chart') +
    runOutForecastCard('dash-forecast-chart') +
    semesterCard() +
    `<div class="grid-2">${petCard()}${questsCard()}</div>`;

  const forecastTab = runOutForecastCard('tab-forecast-chart') + `<div class="grid-2">${weatherCard()}${questsCard()}</div>`;
  const semesterTab = semesterCard() + `<div class="grid-2">${chartCard('Savings goal progress', '% of each target saved', 'dash-goals-tab', state.goals.length > 0, 'Add a savings goal to track progress.')}</div>`;

  const chartsTab = `<div class="grid-2">
    ${chartCard('Spending by category', sp.useActual ? 'Actual spending this month' : (sp.list.length ? 'Planned' : ''), 'dash-spend', sp.list.length > 0, 'Log expenses to see where your money goes.', '', true)}
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
        drawSavingsChart('dash-savings-chart');
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

