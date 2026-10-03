/* YOKO! Student · Guided tour and what's new.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   GUIDED TOUR: chapters per page, a hub, and a “what’s new” tour
   ========================================================= */
const q = sel => document.querySelector(sel);
const closestCard = sel => { const el = q(sel); return el ? el.closest('.card') : null; };
const TOUR_VERSION = 7;   // bump when the tour changes, so returning users are shown what's new
const cardHead = sel => { const el = q(sel); return el ? (el.querySelector('.card-head') || el) : null; };
const CHAPTERS = [
  { id: 'quick', icon: '🚀', title: 'Quick start', blurb: 'The stuff you’ll use every day.', steps: [
    { title: 'Hey, welcome to YOKO!', text: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO!">Quick walkthrough of the stuff you’ll use most. Takes about a minute. Arrow keys move you along, Esc closes it.` },
    { route: 'dashboard/overview', target: ['#view-dashboard .stat [data-action="open-paycheck"]', '#view-dashboard .stats-grid'], title: 'Start here', text: 'Put in your take-home pay, or drop in a payslip and it fills itself in. Pretty much everything else in the app works off this number.' },
    { target: ['#quickadd-btn'], title: 'Adding stuff', text: 'Anything you want to add goes through this one button: expenses, a photo of a receipt, a bank message, income, bills, debts, goals and so on. Most of it you just pick from a list. It’s on every page.' },
    { target: ['#palette-btn'], title: 'Shortcut: Ctrl+K', text: 'Type things like <kbd>250 food</kbd>, <kbd>save 2k trip</kbd> or <kbd>pay 3000 credit</kbd> and hit Enter. Pasting a message from your bank in here works too.' },
    { target: ['#side-nav', '#tab-nav'], title: 'Five pages', text: 'Home, Debt, Budget, Wallet, and Goals & Gifts. Everything saves on its own, there’s no save button.' },
    { route: 'dashboard', target: ['#view-dashboard .subtabs-inner'], title: 'Tabs', text: 'Most pages are split into tabs so there’s less on screen at once. Budget, for example, has Plan, Spending and History.' },
    { target: ['#privacy-btn'], title: 'Hide your numbers', text: 'Tap the eye if someone’s looking over your shoulder. Tap it again to bring the amounts back.' },
    { route: 'dashboard', target: ['#view-dashboard .view-actions .more-btn'], title: 'The ⋯ buttons', text: 'Extra options live behind these, like downloading a CSV or printing. The one at the top of each page also has a tour of just that page.' },
    { title: 'That’s the basics', text: 'If you delete something by accident, an Undo button shows up at the bottom for a few seconds (Ctrl+Z works too). Want the page-by-page walkthrough next?' }
  ] },
  { id: 'dashboard', icon: '🏠', title: 'Home', blurb: 'Your numbers, the month’s forecast and your pet.', route: 'dashboard/overview', tryIt: ['See my Money Wrapped', () => openWrapped()], steps: [
    { route: 'dashboard/overview', target: ['#view-dashboard .stats-grid'], title: 'The numbers that matter', text: 'Your income, what’s left this month, how much you can spend per day, your debt-free date, your savings and your no-spend streak.' },
    { route: 'dashboard/overview', target: ['#weather', '#view-dashboard .stats-grid'], title: 'Money weather', text: 'A guess at how the month ends, based on how fast you’re spending. Sunny means you’ll have money left over. A storm means you won’t.' },
    { route: 'dashboard/overview', target: ['#pet-card'], title: 'Your pet', text: 'It’s happy when you’re under budget and on a streak. Logging, saving and paying off debt give it XP, good habits teach it tricks, and it grows as it levels up. Try tapping it.' },
    { route: 'dashboard/overview', target: ['#quests-card'], title: 'Coming up', text: 'Challenges you’re doing, wishlist items waiting out their 48 hours, gifts you still need to buy and your next automatic payment.' },
    { route: 'dashboard/calendar', target: ['#cal-card .cal-cell.is-today', '#cal-card .card-head'], title: 'Bill calendar', text: 'Paydays, bills, birthdays and tax dates on one calendar. Today’s marked in green. Tap any day to see what’s on it. Under ⋯ you can add them all to your phone’s calendar.' },
    { route: 'dashboard/charts', target: ['#view-dashboard .subtabs-inner'], title: 'Charts', text: 'The Charts tab has your spending, goals and debt as graphs.' },
    { route: 'dashboard', target: ['[data-action="open-wrapped"]'], title: 'Money Wrapped', text: 'Your month in one picture, like Spotify Wrapped. You can download it.' }
  ] },
  { id: 'budget', icon: '📊', title: 'Budget', blurb: 'Planning the month and logging what you spend.', route: 'budget/plan', tryIt: ['Try pasting a bank message', () => {
    importModal('sms');
    const t = document.getElementById('imp-sms');
    if (t) t.value = sampleBankMessage();
  }], steps: [
    { route: 'budget/plan', target: [() => { const el = q('[data-bind="cat"][data-field="planned"]'); return el ? el.closest('tr') : null; }, () => closestCard('[data-action="add-category"]')], title: 'Your categories', text: 'Set a planned amount for each one. What you’ve spent adds itself up from your expense log, and tapping it shows those expenses.' },
    { route: 'budget/plan', target: ['#cat-card .bucket-row', '#cat-card'], title: 'Grouped by bucket', text: 'Each category sits under the paycheck bucket it comes out of, so you can see if a bucket is over-planned.' },
    { route: 'budget/plan', target: [() => closestCard('#view-budget .split-rows')], title: 'Splitting your paycheck', text: 'Break each paycheck into buckets (bills, debt, savings and so on), by percent or a fixed amount. Keep going until it says 100% assigned.' },
    { route: 'budget/spending', target: ['#exp-log .exp-filter', '#exp-log'], title: 'Your expense log', text: 'Search any old expense by shop, note, category, amount or date. Under ⋯ you can split one across categories, scan a receipt or paste messages from your bank.' },
    { route: 'budget/spending', target: ['#recurring-card .card-head', '#recurring-card'], title: 'Recurring payments', text: 'Add rent, loan payments and subscriptions once and they get logged on their due date. Link a loan payment to a debt and it pays that debt down too.' },
    { route: 'budget/yearly', target: ['#yearly-card .card-head', '#yearly-card'], title: 'Yearly bills', text: 'Insurance, renewals and yearly subscriptions, turned into a small amount to put aside each month.' },
    { route: 'budget/history', target: ['#where-card .card-head', '#where-card', '#history-card'], title: 'Where did my money go?', text: 'This month against the same point last month, category by category, with what changed most.' },
    { route: 'budget/history', target: [() => closestCard('.heatmap')], title: 'No-spend streak', text: 'The coloured days are days you didn’t spend anything on wants. Hit 7, 14, 30, 60 or 100 days in a row for bonus XP.' }
  ] },
  { id: 'debt', icon: '⚔️', title: 'Debt', blurb: 'Paying things off, and how long it’ll take.', route: 'debt/debts', tryIt: ['Log a payment', () => { const d = state.debts.find(x => x.balance > 0); if (d) hitForm(d); else debtPicker(); }], steps: [
    { route: 'debt/debts', target: ['#debt-hero'], title: 'Your debt-free date', text: 'The month you’ll owe nothing, with the plan you picked. Everything else on this page is about moving it closer.' },
    { route: 'debt/debts', target: [() => closestCard('.boss-grid'), '#view-debt .view-actions [data-action="add-debt"]'], title: 'Debts as bosses', text: 'Every debt gets a health bar. Interest heals it a bit each month, and your payments knock it down.' },
    { route: 'debt/debts', target: ['[data-action="hit-debt"]', '#view-debt .view-actions [data-action="add-debt"]'], title: 'Logging a payment', text: 'Tap this whenever you pay something off. Finish a debt completely and you get 100 XP.' },
    { route: 'debt/plan', target: [() => { const c = q('.compare'); return c ? c.parentElement : null; }, '#view-debt .subtabs-inner'], title: 'Avalanche or snowball', text: 'Avalanche pays off the highest interest rate first, so you pay the least overall. Snowball clears the smallest balance first, so you get quick wins. Pick whichever you’ll actually stick to.' },
    { route: 'debt/plan', target: [() => closestCard('#whatif-range'), '#view-debt .subtabs-inner'], title: 'What if you paid more?', text: 'Drag this to see what a bit extra each month does to your debt-free date. Nothing changes until you hit apply.' },
    { route: 'debt/emi', target: [() => { const el = q('#emi-principal'); return el ? el.closest('.form-grid') : null; }, () => closestCard('#emi-principal')], title: 'Loan calculator', text: 'Thinking about taking a loan? Check the monthly payment and the total interest here first.' }
  ] },
  { id: 'wallet', icon: '👛', title: 'Wallet', blurb: 'Cash, IOUs, payslips, subscriptions and tax.', route: 'wallet/cash', tryIt: ['Split a bill', () => splitBillForm()], steps: [
    { route: 'wallet', target: ['#view-wallet .subtabs-inner'], title: 'Your wallet', text: 'Cash, who owes who, subscriptions, transport, tax and payslips, each in its own tab.' },
    { route: 'wallet/payslips', target: ['#w-payslips .dropzone', '#w-payslips'], title: 'Payslips', text: 'Drop one in here, whether it’s a PDF, a locked PDF, a scan or a photo from your phone. It gets read on your device, then fills in your paycheck and logs the tax.' },
    { route: 'wallet/cash', target: ['#w-cash .card-head', '#w-cash'], title: 'Cash', text: 'For money that doesn’t go through the bank. Cash you spend can count toward your budget too.' },
    { route: 'wallet/ious', target: [() => { const c = q('#w-ious'); return c ? c.querySelector('.mini-stats') || c : null; }], title: 'IOUs', text: 'Who owes you money and who you owe. “Split a bill” (in the Add menu) does the maths and adds the IOUs for you.' },
    { route: 'wallet/subs', target: ['#w-subs .card-head', '#w-subs'], title: 'Subscriptions', text: 'Tick the ones you pay for from a list and the prices fill in. It shows what each really costs you in a year, spots new ones in your bank data, flags price rises, and once a month asks if you actually used them.' },
    { route: 'wallet/taxes', target: ['#w-taxes .card-head', '#w-taxes'], title: 'Tax', text: 'Tax taken from your payslips, anything you pay yourself, and the due dates for the year. Set your country in Settings and it knows when your tax year starts.' }
  ] },
  { id: 'goals', icon: '🎯', title: 'Goals & Gifts', blurb: 'Saving up, gifts, the wishlist and challenges.', route: 'goals/goals', tryIt: ['Try “Should I buy it?”', () => shouldIBuy()], steps: [
    { route: 'goals/goals', target: ['.goal-card', '#view-goals .view-actions [data-action="add-goal"]'], title: 'Savings goals', text: 'Each goal tells you how much to put away every month to hit it on time.' },
    { route: 'goals/goals', target: ['.goal-card .reverse', '.goal-card', '#view-goals .subtabs-inner'], title: 'At your own pace', text: 'Or type what you can actually save each month into “If I save” and it tells you when you’ll get there.' },
    { route: 'goals/gifts', target: ['#gift-stats', '#view-goals .subtabs-inner'], title: 'Gifts', text: 'Birthdays and holidays live here too. It shows your yearly gift budget and how much to put aside each month so they don’t hit all at once.' },
    { route: 'goals/gifts', target: ['#gifts-card tbody tr', '#gifts-card', '#view-goals .subtabs-inner'], title: 'Upcoming gifts', text: 'Each one counts down to its date. Change the status as you go: Idea, Bought, Given.' },
    { route: 'goals/wishlist', target: ['#wishlist-card'], title: 'Should I buy it?', text: 'Put in something you want and get a straight answer. If it’s a maybe, stick it on the wishlist and see if you still want it in 48 hours.' },
    { route: 'goals/challenges', target: ['#challenges-card .card-head', '#challenges-card'], title: 'Challenges', text: 'No spending on one category, a daily limit, or the 52-week challenge. Win one and you get 150 XP.' }
  ] },
  { id: 'settings', icon: '⚙️', title: 'Settings', blurb: 'Themes, backups and a few extras.', tryIt: ['Open Settings', () => openSettings()], steps: [
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Settings', text: 'Your country and currency, themes, sounds, roast mode, your pet’s name, backups and help are all in here, split into tabs.' },
    { route: 'dashboard/overview', target: ['#backup-banner', '#side-settings', '#settings-mobile-btn'], title: 'Back it up', text: 'Your data only lives in this browser, so keep a backup. On a computer you can link a file that updates itself. If you don’t, you’ll get a reminder once a week.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'On your phone', text: 'Want YOKO! on your phone as an app? Settings → Help has the steps. Once it’s installed, press and hold the icon for shortcuts like Scan a receipt.' }
  ] },
  { id: 'new', icon: '✨', title: 'What’s new', blurb: 'What changed in this update.', hidden: true, steps: [
    { title: 'What’s new', text: 'Less typing. Most things are now picked from a list. About 30 seconds.' },
    { target: ['#quickadd-btn'], title: 'Pick from a list', text: 'Adding a debt starts with the type and then your bank or lender. Goals start from a template, and subscriptions and bills are a tick list with typical prices for your country.' },
    { route: 'wallet/subs', target: ['#w-subs .card-head', '#w-subs'], title: 'It spots subscriptions', text: 'After you paste bank messages or import a statement, it points out regular payments that look like subscriptions, and tells you when one goes up in price.' },
    { route: 'budget/spending', target: ['#exp-log .card-head', '#exp-log'], title: 'Shops you’ve used', text: 'When you type a note on an expense, shops you’ve used before pop up and pick their own category.' },
    { title: 'That’s it', text: 'Prices in the lists are typical ones we looked up, so check them against your own bills.' }
  ] }
];
const CHAPTER_ORDER = ['quick', 'dashboard', 'budget', 'debt', 'wallet', 'goals', 'settings'];
const chapterById = id => CHAPTERS.find(c => c.id === id);
let tour = null;

function markTourSeen() {
  state.meta.tourDone = true;
  state.meta.tourVersion = TOUR_VERSION;
  save();
}
/** First launch: three questions, then straight into a filled-in Home. */
function showOnboarding(opts = {}) {
  markTourSeen();
  const ctry = state.settings.country;
  const countryOpts = Object.keys(COUNTRIES).map(k => [k, countryInfo(k).name]).sort((a, b) => (a[0] === 'OTHER') - (b[0] === 'OTHER') || a[1].localeCompare(b[1]))
    .map(([k, n]) => `<option value="${k}" ${ctry === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
  openModal({
    title: 'Welcome to YOKO!', submitLabel: 'Show me my budget', cancelLabel: 'Skip',
    body: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO!"><p>Three quick questions and your budget’s ready. Everything stays on this device unless you turn on sync.</p>
      <div class="field"><label for="ob-country">1. Where do you live?</label><select id="ob-country" class="select">${countryOpts}</select></div>
      <div class="field"><label for="ob-pay">2. What do you take home after tax?</label>
        <div class="ob-pay-row"><div class="affix"><span class="affix-sym" aria-hidden="true" id="ob-sym">${esc(CURRENCIES[state.currency].symbol)}</span><input id="ob-pay" class="input" inputmode="decimal" autocomplete="off" aria-describedby="ob-pay-err" value="${state.income.configured && state.income.net ? numStr(state.income.net) : ''}"></div>
        <label class="sr-only" for="ob-freq">How often</label><select id="ob-freq" class="select" ${state.income.irregular ? 'hidden' : ''}>${FREQS.map(([v, l]) => `<option value="${v}" ${v === (state.income.configured ? state.income.freq : 'monthly') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <p class="field-error" id="ob-pay-err"></p>
        <label class="check"><input type="checkbox" id="ob-irregular" ${state.income.irregular ? 'checked' : ''}> It changes month to month (freelance, gig work)</label></div>
      <div class="field" id="ob-date-wrap" ${state.income.irregular ? 'hidden' : ''}><label for="ob-date">3. When’s your next payday?</label><input id="ob-date" class="input" type="date" aria-describedby="ob-date-err" value="${esc(state.income.nextPayDate || '')}"><p class="field-error" id="ob-date-err"></p></div>
      ${hasAnyData() ? '' : '<p class="small muted">Just looking around? <button type="button" class="linklike" data-action="onboard-sample">Try it with sample data</button></p>'}
      ${Sync.acc ? '' : '<p class="small muted">Use YOKO! on another device? <button type="button" class="linklike" data-action="sync-signin">Sign in</button></p>'}`,
    onMount: form => {
      form.querySelector('#ob-country').addEventListener('change', e => { form.querySelector('#ob-sym').textContent = CURRENCIES[countryInfo(e.target.value).currency].symbol; });
      form.querySelector('#ob-irregular').addEventListener('change', e => {
        form.querySelector('#ob-date-wrap').hidden = e.target.checked;
        form.querySelector('#ob-freq').hidden = e.target.checked;
      });
      form.querySelector('#ob-pay').focus();
    },
    onSubmit: form => {
      const pay = form.querySelector('#ob-pay'), dateEl = form.querySelector('#ob-date'), irregular = form.querySelector('#ob-irregular').checked;
      const rp = validateValue('money', pay.value, { required: true, positive: true });
      const rd = irregular ? { value: '' } : validateValue('date', dateEl.value, { required: true });
      form.querySelector('#ob-pay-err').textContent = rp.error || ''; form.querySelector('#ob-date-err').textContent = rd.error || '';
      pay.toggleAttribute('aria-invalid', !!rp.error); dateEl.toggleAttribute('aria-invalid', !!rd.error);
      if (rp.error) { pay.focus(); return false; }
      if (rd.error) { dateEl.focus(); return false; }
      const c = countryInfo(form.querySelector('#ob-country').value);
      state.settings.country = c.code; state.currency = c.currency; state.wallet.taxYearStart = c.fy; applyCountry();
      Object.assign(state.income, { mode: 'net', net: rp.value, freq: irregular ? 'monthly' : form.querySelector('#ob-freq').value, nextPayDate: rd.value || '', configured: true, irregular });
      starterPlan();
      checkBadges(true); save(); render();
      setTimeout(() => toast('Done. These are starting guesses, so change anything on the Budget page. Tutorials are in Settings', 5500), 150);
      if (!opts.redo) setTimeout(onboardExtras, 60);
      return true;
    }
  });
}
/** Sensible first plan from take-home pay: fill the buckets and categories so Home isn't empty. */
function starterPlan() {
  const inc = computedMonthlyIncome(), r = roundUpFor(state.currency), round = v => Math.max(0, Math.round(v / r) * r);
  const pct = { bills: 38, debt: 7, goals: 15, gifts: 5, spending: 35 };
  state.split.buckets.forEach(b => { if (pct[b.role] !== undefined && b.mode === 'percent' && !b.value) b.value = pct[b.role]; });
  const share = { rent: 30, bills: 8, food: 14, transport: 7, subscriptions: 2, fun: 12, savings: 15 };
  state.budget.categories.forEach(c => { const k = c.name.toLowerCase(); if (share[k] !== undefined && !c.planned) c.planned = round(inc * share[k] / 100); });
}
function showWelcome() {
  if (!hasAnyData()) { showOnboarding(); return; }
  markTourSeen();   // offered once; everything stays available from the Tour buttons and Settings
  const empty = !hasAnyData();
  openModal({
    title: 'Welcome to YOKO!', hideSubmit: true, cancelLabel: 'Not now',
    body: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO!"><p>YOKO! helps you plan your paycheck, pay off debt, stick to a budget and save up for things. Your data stays on this device unless you turn on sync.</p>
      <p class="muted">Want a quick walkthrough? The basics take about a minute.</p>
      <div class="welcome-actions">${empty
        ? '<button type="button" class="btn btn-primary" data-action="tour-sample">Show me around (with sample data)</button><button type="button" class="btn" data-action="tour-all">Show me around (empty)</button>'
        : '<button type="button" class="btn btn-primary" data-action="tour-all">Show me around</button>'}
      <button type="button" class="btn" data-action="open-tutorials">Pick what to learn</button></div>
      <p class="small muted">You can find these later under Settings → Tutorials, or with the Tour button on any page.</p>`
  });
}
function showWhatsNew() {
  markTourSeen();
  openModal({
    title: 'What’s new', hideSubmit: true, cancelLabel: 'Later',
    body: `<p>A few things changed since you last opened YOKO!:</p><ul class="whats-new">
        <li>Use YOKO! on all your devices: sign in under Settings → Account. Your data is locked with your passphrase before it leaves the device</li>
        <li>Edit any expense, cash entry, bill or contribution with the pencil icon</li>
        <li>Add debts by picking the type and your bank or lender</li>
        <li>Tick your subscriptions and bills from a list, with typical prices for your country</li>
        <li>Goal templates, like an emergency fund sized to your spending</li>
        <li>It spots subscriptions and price rises in your bank data</li>
        <li>Shops you’ve used pop up as you type an expense</li></ul>
      <div class="welcome-actions"><button type="button" class="btn btn-primary" data-action="tour-new">Show me (1 min)</button>
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


