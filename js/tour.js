/* YOKO! Student · Guided tour and what's new.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   GUIDED TOUR: chapters per page, a hub, and a “what’s new” tour
   ========================================================= */
const q = sel => document.querySelector(sel);
const closestCard = sel => { const el = q(sel); return el ? el.closest('.card') : null; };
const TOUR_VERSION = 15;   // bumped: debt, savings, exact amounts, onboarding currency
const cardHead = sel => { const el = q(sel); return el ? (el.querySelector('.card-head') || el) : null; };
const CHAPTERS = [
  { id: 'polish', icon: '🐾', title: 'Live Pet, Freeze & Demo', blurb: 'Pet reactions, category freeze warnings, subscription catcher and demo data.', route: 'dashboard/overview', steps: [
    { route: 'dashboard/overview', target: ['#pet-card'], title: 'Live Pet Reactions', text: 'Your pet reacts live with animations and speech when you import statements, keep to your budget, run low on safe-to-spend, or spend in a frozen category.' },
    { route: 'goals/challenges', target: ['#challenges-card'], title: 'Category Freeze', text: 'Freeze a category for 7 to 30 days. Adding an expense in a frozen category warns you with days remaining before you decide to break it.' },
    { route: 'dashboard/overview', target: ['#sub-check'], title: 'Subscription Catcher', text: 'Automatically finds repeating weekly and monthly charges in your bank or UPI history and lets you flag unused ones.' },
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Budget Nudges', text: 'Get alerted via notifications or in-app banners when any category hits 80% or 100%, and when safe-to-spend turns red.' },
    { route: 'dashboard/overview', target: ['#side-nav', '.topbar'], title: 'Student Demo Dataset', text: 'Load a complete 2nd-year engineering student profile with roommates, semester milestones, and sample UPI screenshots from the ⋯ menu.' }
  ] },
  { id: 'ai', icon: '✨', title: 'AI Command Bar & Voice', blurb: 'Ask questions, add expenses by voice, test what-ifs.', route: 'dashboard/overview', steps: [
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'Your AI Assistant', text: 'Log a spend, ask “can I afford this?”, or ask anything about your money, like “why am I broke by the 20th?”. It answers with your real numbers.' },
    { route: 'dashboard/overview', target: ['#cb-mic'], title: 'Voice commands', text: 'Tap the mic and say it out loud. Try: “Can I afford a 1500 concert this Saturday?” or “Spent 120 on chai, split it with Rahul”.' },
    { route: 'budget/plan', target: ['[data-action="budget-autopilot"]'], title: 'Budget Autopilot', text: 'Tap "Set my budgets for me" on the Budget tab to let AI build a plan based on your recent habits.' }
  ] },
  { id: 'quick', icon: '🚀', title: 'Quick start', blurb: 'The student essentials in 60 seconds.', steps: [
    { title: 'Welcome to YOKO! Student', text: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO! Student">A simple personal finance app designed specifically for student and hostel life. No banking login required. Arrow keys move you along, Esc closes it.` },
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Safe to spend today', text: 'The big number at the top of Home. It calculates: (Current balance − upcoming bills) ÷ days until next allowance. Green means on track, amber means tight pace, red means running dry.' },
    { route: 'dashboard/overview', target: ['#forecast-card'], title: 'Run-out forecast', text: 'Shows whether your money will last until your next allowance. Drag the sliders (food delivery, outings, chai) to test habits live.' },
    { route: 'dashboard/overview', target: ['#semester-card'], title: 'Semester view', text: 'Plan heavy semester months (exams, festival trips, fees) so they don’t catch you off guard.' },
    { target: ['#side-nav', '#tab-nav'], title: 'Five core screens', text: 'Home, Spend, Budget, Split & Roommates, and Goals & Wishlist. Everything saves automatically to this device.' },
    { target: ['#quickadd-btn'], title: 'Quick add menu', text: 'Tap Add on any screen to log an expense, scan a receipt, paste a bank or UPI message, split a bill, or log income.' },
    { target: ['#privacy-btn'], title: 'Hide your numbers', text: 'Tap the eye icon whenever friends or roommates are looking over your shoulder.' }
  ] },
  { id: 'dashboard', icon: '🏠', title: 'Home', blurb: 'Safe-to-spend, forecast, semester view and pet.', route: 'dashboard/overview', tryIt: ['See my Money Wrapped', () => openWrapped()], steps: [
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Safe to spend', text: 'What you can still spend today, to the paisa. Bills, debt payments due and what you spent today are already taken out.' },
    { route: 'dashboard/overview', target: ['#forecast-card .slider-panel'], title: 'Live habit sliders', text: 'Drag the food delivery and outings sliders to see how skipping 2 orders a week extends your runway by days.' },
    { route: 'dashboard/overview', target: ['#savings-card'], title: 'Your savings', text: 'Total saved, this month, your savings rate and how it compares to last month.' },
    { route: 'dashboard/overview', target: ['#semester-card'], title: 'Semester milestones', text: 'Mark heavy months and track whether your current savings rate covers upcoming spikes.' },
    { route: 'dashboard/overview', target: ['#pet-card'], title: 'Your money pet', text: 'Gains XP and levels up as you log expenses, stick to your budget, and win challenges.' },
    { route: 'dashboard', target: ['[data-action="open-wrapped"]'], title: 'Money Wrapped', text: 'A visual summary of your monthly spending, streaks and habits to share or download.' }
  ] },
  { id: 'spend', icon: '💳', title: 'Spend', blurb: 'Expense log, categories, ghost spending & heatmap.', route: 'spend/log', steps: [
    { route: 'spend/log', target: ['#exp-log .exp-filter', '#exp-log'], title: 'Expense log', text: 'Search and filter any expense by merchant, note, category or date. Split or edit any expense anytime.' },
    { route: 'spend/categories', target: ['#view-spend .subtabs-inner'], title: 'Category breakdown', text: 'See where your money actually goes this month compared to your planned targets.' },
    { route: 'spend/insights', target: ['#w-spending-heatmap'], title: 'Spending Heatmap & Ghost spending', text: 'Interactive GitHub-style calendar intensity view and small payment ghost tracking.' },
    { route: 'spend/recurring', target: ['#recurring-card'], title: 'Recurring charges', text: 'Track hostel rent, mess bills, gym memberships and subscriptions.' }
  ] },
  { id: 'split', icon: '👥', title: 'Split & Roommates', blurb: 'Bill photo splitter, running balances, and UPI settle-up.', route: 'split/ious', tryIt: ['Split a bill', () => billSplitterModal()], steps: [
    { route: 'split/ious', target: ['#view-split .stats-grid'], title: 'Shared expenses', text: 'Track money you owe friends and money friends owe you for food, trips and shared hostel groceries.' },
    { route: 'split/ious', target: ['#w-balances'], title: 'Running balances', text: 'See who owes whom. Tap Settle up: if you owe them, Pay opens your UPI app. If they owe you, add your UPI ID and they scan your QR.' },
    { route: 'split/ious', target: ['[data-action="split-bill"]'], title: 'Bill photo splitter', text: 'Upload or snap a bill receipt to automatically extract items, taxes and service charges, then assign items to friends with proportional tax math.' }
  ] },
  { id: 'budget', icon: '📊', title: 'Budget', blurb: 'Plan categories and track month-to-month changes.', route: 'budget/plan', steps: [
    { route: 'budget/plan', target: ['#cat-card'], title: 'Category plans', text: 'Set a target for each student category. What you spend fills in automatically from your expense log.' },
    { route: 'budget/where', target: ['#where-card'], title: 'Where did my money go?', text: 'Compares your spending against the same point last month to show what increased or decreased.' }
  ] },
  { id: 'debt', icon: '💳', title: 'Debt', blurb: 'Loans, money you owe, and the fastest way to pay it off.', route: 'debt/debts', steps: [
    { route: 'debt/debts', target: ['#view-debt .view-head'], title: 'Add what you owe', text: 'Education loan, credit card, money from family. Add the balance, interest and monthly payment.' },
    { route: 'debt/plan', target: ['#view-debt .view-head'], title: 'Payoff plan', text: 'See when you will be debt-free and how much interest you save by paying a little extra.' },
    { route: 'debt/emi', target: ['#view-debt .view-head'], title: 'Loan calculator', text: 'Check the monthly payment before you take a loan.' }
  ] },
  { id: 'goals', icon: '🎯', title: 'Goals & Savings', blurb: 'Your savings, goals, wishlist and challenges.', route: 'goals/goals', tryIt: ['Try “Should I buy it?”', () => shouldIBuy()], steps: [
    { route: 'goals/savings', target: ['#savings-card'], title: 'How much you save', text: 'Your total saved, this month, savings rate and a 6-month chart.' },
    { route: 'goals/goals', target: ['.goal-card'], title: 'Savings goals', text: 'Save up for a new laptop, bike, trip or emergency fund.' },
    { route: 'goals/wishlist', target: ['#wishlist-card'], title: '48-hour impulse cooldown', text: 'Want to buy something expensive? Put it on the wishlist and wait 48 hours to decide if you truly need it.' },
    { route: 'goals/challenges', target: ['#challenges-card'], title: 'Money challenges', text: 'Take on no-spend streaks or category fasts to build disciplined money habits and earn bonus XP.' }
  ] },
  { id: 'settings', icon: '⚙️', title: 'Settings', blurb: 'Country, currency, theme, sync and backups.', tryIt: ['Open Settings', () => openSettings()], steps: [
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Settings & customization', text: 'Set your country and currency, theme, account sync and backups.' }
  ] },
  { id: 'new', icon: '✨', title: 'What’s new', blurb: 'Debt, savings and exact amounts.', hidden: true, steps: [
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Exact safe to spend', text: 'Now shows exactly what is left for today, after bills, debt payments and what you already spent.' },
    { route: 'dashboard/overview', target: ['#savings-card'], title: 'Your savings', text: 'See how much you save each month and your savings rate.' },
    { route: 'dashboard/overview', target: ['[data-action="scan-receipt"]'], title: 'Scan a receipt', text: 'Snap a bill right from Home and it logs the expense for you.' },
    { route: 'debt/debts', target: ['#view-debt .view-head'], title: 'Debt is back', text: 'Track loans and money you owe, with a payoff plan.' },
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'Say amounts your way', text: 'Type or say “2 lakh”, “50k” or “two thousand”. The AI understands.' }
  ] }
];
const CHAPTER_ORDER = ['ai', 'quick', 'dashboard', 'spend', 'split', 'budget', 'goals', 'debt', 'settings'];
const chapterById = id => CHAPTERS.find(c => c.id === id);
let tour = null;

function markTourSeen() {
  state.meta.tourDone = true;
  state.meta.tourVersion = TOUR_VERSION;
  save();
}

/** Student onboarding: 3 simple questions, under 30s. */
function showOnboarding(opts = {}) {
  markTourSeen();
  const ctry = state.settings.country;
  const sym = CURRENCIES[state.currency] ? CURRENCIES[state.currency].symbol : '₹';

  openModal({
    title: 'Welcome to YOKO! Student',
    submitLabel: 'Build my student budget',
    cancelLabel: 'Skip',
    body: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO! Student">
      <p class="small muted">Pick your country and currency, then three quick questions to set your budget and daily safe-to-spend.</p>

      <div class="form-grid two">
        <div class="field"><label for="ob-country">Country</label>
          <select id="ob-country" class="select" style="font-size:16px">${Object.keys(COUNTRIES).map(k => [k, countryInfo(k).name]).sort((a, b) => (a[0] === 'OTHER') - (b[0] === 'OTHER') || a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${k}" ${ctry === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label for="ob-currency">Currency</label>
          <select id="ob-currency" class="select" style="font-size:16px">${Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}" ${state.currency === code ? 'selected' : ''}>${esc(c.symbol)} ${code}</option>`).join('')}</select></div>
      </div>

      <div class="field">
        <label for="ob-allowance">1. Monthly allowance or pocket money</label>
        <div class="affix">
          <span class="affix-sym" aria-hidden="true" id="ob-sym">${esc(sym)}</span>
          <input id="ob-allowance" class="input" inputmode="decimal" autocomplete="off" placeholder="e.g. 10000" style="font-size:16px" value="${state.student && state.student.allowance ? numStr(state.student.allowance) : ''}">
        </div>
        <p class="field-error" id="ob-allowance-err"></p>
      </div>

      <div class="field">
        <label for="ob-arrival">2. When does your allowance arrive?</label>
        <select id="ob-arrival" class="select" style="font-size:16px">
          <option value="1">1st of the month</option>
          <option value="5">5th of the month</option>
          <option value="10">10th of the month</option>
          <option value="15">15th of the month</option>
          <option value="custom">Pick specific day of month...</option>
          <option value="irregular">Irregular (varies or when requested)</option>
        </select>
        <div id="ob-custom-day-wrap" hidden style="margin-top:6px">
          <input id="ob-custom-day" class="input" type="number" min="1" max="31" placeholder="Day of month (1–31)" style="font-size:16px">
        </div>
      </div>

      <div class="field">
        <label for="ob-living">3. Living situation during semester</label>
        <select id="ob-living" class="select" style="font-size:16px">
          <option value="hostel" selected>Campus Hostel</option>
          <option value="pg">PG / Rented Flat with Roommates</option>
          <option value="home">Living at Home</option>
        </select>
      </div>

      <div class="field" style="border-top:1px solid var(--border);padding-top:10px">
        <label class="check"><input type="checkbox" id="ob-has-pt"> I have part-time / freelance income (optional)</label>
        <div id="ob-pt-wrap" hidden style="margin-top:8px">
          <div class="grid-2">
            <div>
              <label for="ob-pt-amount" class="small muted">Monthly earnings</label>
              <div class="affix">
                <span class="affix-sym" aria-hidden="true">${esc(sym)}</span>
                <input id="ob-pt-amount" class="input" inputmode="decimal" placeholder="e.g. 3000" style="font-size:16px">
              </div>
            </div>
            <div>
              <label for="ob-pt-hours" class="small muted">Hours per week</label>
              <input id="ob-pt-hours" class="input" type="number" min="1" max="60" placeholder="e.g. 10" style="font-size:16px">
            </div>
          </div>
        </div>
      </div>

      ${hasAnyData() ? '' : '<p class="small muted" style="margin-top:8px">Just exploring? <button type="button" class="linklike" data-action="onboard-sample">Try it with student sample data</button></p>'}`,

    onMount: form => {
      const arrSelect = form.querySelector('#ob-arrival');
      const customWrap = form.querySelector('#ob-custom-day-wrap');
      const ptCheck = form.querySelector('#ob-has-pt');
      const ptWrap = form.querySelector('#ob-pt-wrap');

      arrSelect.addEventListener('change', e => {
        customWrap.hidden = e.target.value !== 'custom';
      });

      ptCheck.addEventListener('change', e => {
        ptWrap.hidden = !e.target.checked;
      });

      const curSel = form.querySelector('#ob-currency');
      const setSym = () => { const c = CURRENCIES[curSel.value]; form.querySelectorAll('.affix-sym').forEach(el => { el.textContent = c ? c.symbol : ''; }); };
      form.querySelector('#ob-country').addEventListener('change', e => { const cur = countryInfo(e.target.value).currency; if (CURRENCIES[cur]) { curSel.value = cur; setSym(); } });
      curSel.addEventListener('change', setSym);

      form.querySelector('#ob-allowance').focus();
    },

    onSubmit: form => {
      const allowInput = form.querySelector('#ob-allowance');
      const arrVal = form.querySelector('#ob-arrival').value;
      const customDay = form.querySelector('#ob-custom-day').value;
      const living = form.querySelector('#ob-living').value;
      const hasPt = form.querySelector('#ob-has-pt').checked;
      const ptAmount = hasPt ? parseNum(form.querySelector('#ob-pt-amount').value) || 0 : 0;
      const ptHours = hasPt ? Number(form.querySelector('#ob-pt-hours').value) || 0 : 0;

      const ra = validateValue('money', allowInput.value, { required: true, positive: true });
      form.querySelector('#ob-allowance-err').textContent = ra.error || '';
      allowInput.toggleAttribute('aria-invalid', !!ra.error);
      if (ra.error) { allowInput.focus(); return false; }

      const obCur = form.querySelector('#ob-currency').value, obCountry = form.querySelector('#ob-country').value;
      if (CURRENCIES[obCur]) state.currency = obCur;
      if (COUNTRIES[obCountry]) { const ci = countryInfo(obCountry); state.settings.country = ci.code; state.wallet.taxYearStart = ci.fy; applyCountry(); }

      let arrivalDay = 1;
      let isIrregular = false;
      if (arrVal === 'irregular') {
        isIrregular = true;
        arrivalDay = 'irregular';
      } else if (arrVal === 'custom') {
        arrivalDay = clamp(Number(customDay) || 1, 1, 31);
      } else {
        arrivalDay = Number(arrVal) || 1;
      }

      // Next pay date calculation
      const t = todayDate();
      let nextPayDate = '';
      if (!isIrregular) {
        let m = t.getMonth();
        let y = t.getFullYear();
        if (t.getDate() >= arrivalDay) {
          m++;
          if (m > 11) { m = 0; y++; }
        }
        const maxDay = new Date(y, m + 1, 0).getDate();
        nextPayDate = F.toISO(new Date(y, m, Math.min(arrivalDay, maxDay)));
      }

      state.student = {
        allowance: ra.value,
        arrivalDay,
        living,
        partTimeAmount: ptAmount,
        partTimeHours: ptHours,
        semester: {
          start: todayISO().slice(0, 7) + '-01',
          end: F.toISO(F.addMonths(t, 4)),
          heavyMonths: [
            { id: uid(), name: 'Semester Exam & Lab Fees', month: F.toISO(F.addMonths(t, 1)).slice(0, 7), amount: niceAmount(ra.value * 0.5) }
          ]
        }
      };

      const totalMonthly = ra.value + ptAmount;
      Object.assign(state.income, {
        mode: 'net',
        net: totalMonthly,
        freq: isIrregular ? 'monthly' : 'monthly',
        nextPayDate,
        configured: true,
        irregular: isIrregular
      });

      studentStarterPlan(living);
      checkBadges(true);
      save();
      render();

      setTimeout(() => toast('Your student budget and safe-to-spend allowance are ready', 4500), 150);
      return true;
    }
  });
}

/** Tailored student starter plan based on hostel/PG/home living situation */
function studentStarterPlan(living = 'hostel') {
  const inc = computedMonthlyIncome(), r = roundUpFor(state.currency), round = v => Math.max(0, Math.round(v / r) * r);
  if (living === 'home') {
    state.budget.categories = [
      { id: uid(), name: 'Canteen & Food', type: 'needs', planned: round(inc * 0.25), actual: 0 },
      { id: uid(), name: 'Metro & Travel', type: 'needs', planned: round(inc * 0.20), actual: 0 },
      { id: uid(), name: 'Books & College fees', type: 'needs', planned: round(inc * 0.15), actual: 0 },
      { id: uid(), name: 'Outings & Fun', type: 'wants', planned: round(inc * 0.20), actual: 0 },
      { id: uid(), name: 'Subscriptions & Mobile', type: 'wants', planned: round(inc * 0.05), actual: 0 },
      { id: uid(), name: 'Savings & Trip fund', type: 'savings', planned: round(inc * 0.15), actual: 0 }
    ];
  } else {
    state.budget.categories = [
      { id: uid(), name: 'Mess & Groceries', type: 'needs', planned: round(inc * 0.35), actual: 0 },
      { id: uid(), name: 'Hostel / PG Rent', type: 'needs', planned: round(inc * 0.25), actual: 0 },
      { id: uid(), name: 'Auto & Travel', type: 'needs', planned: round(inc * 0.10), actual: 0 },
      { id: uid(), name: 'Books & Supplies', type: 'needs', planned: round(inc * 0.05), actual: 0 },
      { id: uid(), name: 'Outings & Snacks', type: 'wants', planned: round(inc * 0.12), actual: 0 },
      { id: uid(), name: 'Subscriptions & Mobile', type: 'wants', planned: round(inc * 0.03), actual: 0 },
      { id: uid(), name: 'Emergency & Trip Fund', type: 'savings', planned: round(inc * 0.10), actual: 0 }
    ];
  }
}

function showWelcome() {
  if (!hasAnyData()) { showOnboarding(); return; }
  markTourSeen();
  const empty = !hasAnyData();
  openModal({
    title: 'Welcome to YOKO! Student', hideSubmit: true, cancelLabel: 'Not now',
    body: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO! Student"><p>YOKO! Student helps you understand where your pocket money goes, budget for hostel and college life, and keep spending on track without advanced financial knowledge.</p><p class="muted">Want a quick walkthrough? The student tour takes about a minute.</p>
      <div class="welcome-actions">${empty
        ? '<button type="button" class="btn btn-primary" data-action="tour-sample">Show me around (with sample data)</button><button type="button" class="btn" data-action="tour-all">Show me around (empty)</button>'
        : '<button type="button" class="btn btn-primary" data-action="tour-all">Show me around</button>'}
      <button type="button" class="btn" data-action="open-tutorials">Pick what to learn</button></div>
      <p class="small muted">You can find these tutorials anytime in Settings or on each screen.</p>`
  });
}

function showWhatsNew() {
  markTourSeen();
  openModal({
    title: 'What’s new in YOKO! Student', hideSubmit: true, cancelLabel: 'Got it',
    body: `<p>New and fixed:</p><ul class="whats-new">
        <li><strong>Debt:</strong> track loans and money you owe, with a payoff plan.</li>
        <li><strong>Savings:</strong> see what you save each month and your savings rate.</li>
        <li><strong>Exact amounts:</strong> safe to spend and money left now show to the paisa.</li>
        <li><strong>Safe to spend fixed:</strong> it now counts today’s spending, bills and debt payments correctly.</li>
        <li><strong>Amount words:</strong> “2 lakh”, “50k” and “two thousand” now work in the AI bar.</li>
        <li><strong>Live groups:</strong> creating a group works the first time.</li>
        <li><strong>Scan receipt on Home:</strong> one tap from the Home page.</li>
        <li><strong>Simpler:</strong> roast mode and round-ups are gone. Full tutorial is on Home.</li></ul>
      <div class="welcome-actions"><button type="button" class="btn btn-primary" data-action="tour-new">Take the tour (1 min)</button>
      <button type="button" class="btn" data-action="open-tutorials">All tutorials</button></div>`
  });
}
function openTutorialHub() {
  const done = state.meta.tourChapters || {};
  const list = CHAPTER_ORDER.concat(['new']).map(chapterById).map(c => `<li><button type="button" class="chapter-btn" data-action="tour-chapter" data-chapter="${c.id}">
      <span class="chapter-icon" aria-hidden="true">${c.icon}</span>
      <span class="chapter-text"><strong>${esc(c.title)}</strong><span class="small muted">${esc(c.blurb)} · ${plural(c.steps.length, 'step')}</span></span>
      ${done[c.id] ? '<span class="badge badge-success">✓ Done</span>' : ''}</button></li>`).join('');
  openModal({
    title: 'Tutorials', hideSubmit: true, cancelLabel: 'Close',
    body: `<p class="muted">Pick one, or go through all of them. You can stop after any section.</p>
      ${hasAnyData() ? '' : '<div class="alert alert-info">There’s no data yet, so some steps won’t have much to show. <button type="button" class="linklike" data-action="tour-sample">Load sample data and do the full tour</button></div>'}
      <div class="welcome-actions"><button type="button" class="btn btn-primary" data-action="tour-all">Do them all (${CHAPTER_ORDER.length} sections)</button></div>
      <ul class="chapter-list">${list}</ul>`
  });
}
function tourTarget(step) {
  for (const t of step.target || []) {
    let el = null;
    try { el = typeof t === 'function' ? t() : q(t); } catch (e) { el = null; }
    if (el && el.getClientRects().length) return el;
  }
  return null;
}
/** Start the tour with one or more chapters (default: all, in order). */
function startTour(ids) {
  ids = (Array.isArray(ids) && ids.length ? ids : CHAPTER_ORDER).filter(chapterById);
  const steps = [];
  ids.forEach((id, c) => {
    const ch = chapterById(id);
    ch.steps.forEach((st, k) => steps.push(Object.assign({}, st, { ch, c, k, n: ch.steps.length })));
  });
  closeModal(true);
  if (!qaMenu().hidden) setMenu(false, false);
  endTour(false, true);
  const blocker = document.createElement('div');
  blocker.className = 'tour-block';
  const spot = document.createElement('div');
  spot.className = 'tour-spot'; spot.setAttribute('aria-hidden', 'true');
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tour-title');
  document.body.append(blocker, spot, card);
  const onMove = () => requestAnimationFrame(placeTour);
  tour = { i: 0, steps, ids, blocker, spot, card, el: null, onMove };
  addEventListener('scroll', onMove, { passive: true });
  addEventListener('resize', onMove);
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]');
    if (!b || !tour) return;
    const a = b.dataset.tour, step = tour.steps[tour.i];
    if (a === 'next') tourGo(tour.i + 1);
    else if (a === 'back') tourGo(tour.i - 1);
    else if (a === 'skip') endTour(false);
    else if (a === 'stop') endTour(false, false, true);
    else if (a === 'finish') endTour(true);
    else if (a === 'paycheck') { endTour(true, true); openPaycheckModal(); }
    else if (a === 'hub') { endTour(true, true); openTutorialHub(); }
    else if (a === 'try' && step.ch.tryIt) { endTour(true, true); step.ch.tryIt[1](); }
  });
  tourGo(0);
}
async function tourGo(i) {
  if (!tour) return;
  if (i >= tour.steps.length) { endTour(true); return; }
  i = Math.max(0, i);
  tour.i = i;
  const step = tour.steps[i], ch = step.ch;
  const route = step.route || (step.k === 0 && ch.route);
  const atRoute = r => { const [p, t] = r.split('/'); return currentRoute() === p && (!t || currentTab(p) === t); };
  if (route && !atRoute(route)) {
    location.hash = '#' + route;
    await new Promise(r => setTimeout(r, 160));   // let the page render
    if (!tour || tour.i !== i) return;
  }
  const chapterEnd = step.k === step.n - 1, next = tour.steps[i + 1], lastOverall = !next;
  if (chapterEnd) { state.meta.tourChapters = Object.assign({}, state.meta.tourChapters, { [ch.id]: true }); save(); }
  const multi = tour.ids.length > 1;
  const el = tourTarget(step);
  tour.el = el;
  let buttons;
  if (!chapterEnd) buttons = `<button type="button" class="btn btn-sm btn-primary" data-tour="next">${i === 0 ? 'Start' : 'Next'}</button>`;
  else if (!lastOverall) buttons = `<button type="button" class="btn btn-sm" data-tour="stop">Stop here</button><button type="button" class="btn btn-sm btn-primary" data-tour="next">Next: ${esc(next.ch.title)}</button>`;
  else {
    const extra = !state.income.configured && (ch.id === 'quick' || multi) ? '<button type="button" class="btn btn-sm" data-tour="paycheck">Add my paycheck</button>'
      : ch.tryIt ? `<button type="button" class="btn btn-sm" data-tour="try">${ch.tryIt[0]}</button>` : '';
    buttons = `${extra}<button type="button" class="btn btn-sm btn-primary" data-tour="finish">Done</button>`;
  }
  const dots = multi ? `<div class="tour-chapters" aria-hidden="true">${tour.ids.map((id, c) => `<span class="${c < step.c ? 'done' : c === step.c ? 'on' : ''}" title="${esc(chapterById(id).title)}"></span>`).join('')}</div>` : '';
  tour.card.innerHTML = `
    <div class="tour-top"><p class="tour-count">${ch.icon} ${esc(ch.title)} · ${step.k + 1} of ${step.n}</p>${dots}</div>
    <div class="tour-progress" aria-hidden="true"><span style="width:${(step.k + 1) / step.n * 100}%"></span></div>
    <h2 id="tour-title">${step.title}</h2>
    <p aria-live="polite">${step.text}</p>
    <div class="tour-actions">
      ${lastOverall ? (multi ? '' : '<button type="button" class="linklike" data-tour="hub">Other tutorials</button>') : '<button type="button" class="linklike" data-tour="skip">Close</button>'}
      <div class="row">${i > 0 && step.k > 0 ? '<button type="button" class="btn btn-sm" data-tour="back">Back</button>' : ''}${buttons}</div>
    </div>`;
  if (el && !el.closest('.topbar, .sidebar, .tabbar')) scrollToTarget(el);
  else if (!el && step.k === 0 && route) window.scrollTo({ top: 0 });
  placeTour();
  setTimeout(placeTour, 450);   // after smooth scrolling settles
  const primary = tour.card.querySelector('.btn-primary') || tour.card.querySelector('button');
  if (primary) primary.focus({ preventScroll: true });
}
function scrollToTarget(el) {
  const r = el.getBoundingClientRect(), topSpace = 64 + 16;
  const mobile = innerWidth <= 640;
  const cardH = tour ? tour.card.offsetHeight || 220 : 220;
  const room = innerHeight - topSpace - (mobile ? cardH + 64 + 32 : 24);
  const fitsWithCard = mobile || r.bottom + cardH + 40 <= innerHeight || r.top - cardH - 40 >= topSpace;
  if (r.top >= topSpace && r.bottom <= topSpace + room && fitsWithCard) return;   // already visible with room for the card
  let y = scrollY + r.top - topSpace;                               // default: target just under the top bar
  if (!mobile && r.height + cardH + 60 > room && r.height < room) y -= (room - r.height) / 2;   // too tall for the card below → centre it
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
}
function placeTour() {
  if (!tour) return;
  const { el, spot, card, blocker } = tour;
  const vw = innerWidth, vh = innerHeight, pad = 8, gap = 14;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  if (!el) {
    spot.style.display = 'none'; blocker.classList.add('dim');
    if (vw > 640) { card.style.left = `${(vw - cw) / 2}px`; card.style.top = `${Math.max(16, (vh - ch) / 2)}px`; }
    return;
  }
  const r = el.getBoundingClientRect();
  spot.style.display = ''; blocker.classList.remove('dim');
  spot.style.left = `${r.left - pad}px`; spot.style.top = `${r.top - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`; spot.style.height = `${r.height + pad * 2}px`;
  if (vw <= 640) return;   // phones: the card docks above the tab bar (CSS)
  let top = r.bottom + pad + gap, left = r.left;
  if (top + ch > vh - 12) top = r.top - pad - gap - ch;          // not enough room below → above
  if (top < 72) {                                                  // not enough room above either → beside
    top = Math.min(vh - ch - 16, Math.max(72, r.top));
    if (r.right + pad + gap + cw < vw - 12) left = r.right + pad + gap;
    else if (r.left - pad - gap - cw > 12) left = r.left - pad - gap - cw;
    else { left = vw - cw - 16; top = vh - ch - 16; }
  }
  card.style.left = `${Math.min(Math.max(12, left), vw - cw - 12)}px`;
  card.style.top = `${Math.max(12, top)}px`;
}
function endTour(done, silent, stopped) {
  if (!tour) return;
  removeEventListener('scroll', tour.onMove);
  removeEventListener('resize', tour.onMove);
  tour.blocker.remove(); tour.spot.remove(); tour.card.remove();
  tour = null;
  markTourSeen();
  if (silent) return;
  if (stopped) toast('You can pick this up later in Settings → Tutorials', 4000);
  else if (!done) toast('The tutorials are in Settings if you want them later', 4000);
  else toast('That’s it. Have fun with it');
  document.getElementById('main').focus({ preventScroll: true });
}
function tourKey(e) {
  const step = tour.steps[tour.i];
  if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
  else if (e.key === 'ArrowRight' && tour.i < tour.steps.length - 1) { e.preventDefault(); tourGo(tour.i + 1); }
  else if (e.key === 'ArrowLeft' && step.k > 0) { e.preventDefault(); tourGo(tour.i - 1); }
  else if (e.key === 'Tab') {   // keep focus inside the tour card
    const f = [...tour.card.querySelectorAll('button')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!tour.card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}


