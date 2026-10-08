/* YOKO! Student · Guided tour and what's new.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   GUIDED TOUR: chapters per page, a hub, and a “what’s new” tour
   ========================================================= */
const q = sel => document.querySelector(sel);
const closestCard = sel => { const el = q(sel); return el ? el.closest('.card') : null; };
const TOUR_VERSION = 17;   // bumped: debt, savings, exact amounts, onboarding currency
const cardHead = sel => { const el = q(sel); return el ? (el.querySelector('.card-head') || el) : null; };
const CHAPTERS = [
  { id: 'quick', icon: '👋', title: 'Start here', blurb: 'How the app is laid out, in a minute.', steps: [
    { title: 'Hey, welcome to YOKO!', text: `<img class="welcome-logo" src="${LOGO_URI}" alt="YOKO! Student">This app helps you see where your allowance goes before it’s gone. No bank login needed. Use the arrow keys or the buttons to move along, and Esc to stop whenever you like.` },
    { target: ['#side-nav', '#tab-nav'], title: 'Six main screens', text: 'Home, Spend, Budget, Split, Goals and Debt. Tap any of them at the bottom of the screen (or on the left on a laptop). Each screen has tabs along the top for the details.' },
    { target: ['#quickadd-btn'], title: 'The green + button', text: 'This is how you add almost anything: an expense, a receipt photo, a bank message, cash in or out, a bill to split, income, your pocket money, a recurring payment, a semester fee, a goal, a gift, a subscription, an IOU or a travel trip.' },
    { target: ['#palette-btn'], title: 'Search and shortcuts', text: 'Type things like “250 food”, “save 500 laptop” or “pay 3000 credit” and hit Enter. It also finds any screen or setting. On a laptop, Ctrl+K opens it.' },
    { target: ['#privacy-btn'], title: 'Hide your numbers', text: 'Tap the eye when someone’s looking over your shoulder. Every amount gets blurred until you tap it again.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Settings', text: 'Country, currency, theme, your account and backups live here. More on that at the end.' },
    { title: 'Your data stays with you', text: 'Everything saves on your phone as you go, and the app works offline. If you make an account, your data is locked with your passphrase before it syncs, so nobody else can read it.' }
  ] },
  { id: 'dashboard', icon: '🏠', title: 'Home', blurb: 'Safe to spend, savings, forecast, semester and your pet.', route: 'dashboard/overview', tryIt: ['See my Money Wrapped', () => openWrapped()], steps: [
    { route: 'dashboard/overview', target: ['#view-dashboard [data-action="scan-receipt"]', '#quickadd-btn'], title: 'Scan a receipt', text: 'Take a photo of any bill and YOKO! reads the shop, total and date for you. Check it, pick a category, done. It reads the photo on your phone, nothing gets uploaded.' },
    { route: 'dashboard/overview', target: ['#view-dashboard [data-action="tour-all"]'], title: 'Full tutorial', text: 'This button brings you back here any time. Every screen also has a short tour in its ⋯ menu.' },
    { route: 'dashboard/overview', target: ['#view-dashboard .view-actions .menu-wrap', '#view-dashboard .view-actions'], title: 'The ⋯ menu', text: 'Money Wrapped, loading or removing demo data, a tour of just this page, and printing or saving as PDF.' },
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Safe to spend today', text: 'The most important number in the app. It’s exactly how much you can still spend today. We take what’s left of your allowance, remove bills and debt payments that are still due, split it over the days until your next allowance, then subtract what you already spent today.' },
    { route: 'dashboard/overview', target: ['#safe-hero .safe-badge', '#safe-hero'], title: 'Green, amber, red', text: 'Green means you’re fine. Amber means you’re spending a bit fast. Red means the money won’t last, and a button shows up to ask your parents for a top-up with a polite message ready to send.' },
    { route: 'dashboard/overview', target: ['#view-dashboard .stats-grid'], title: 'Quick numbers', text: 'Your monthly allowance and when the next one lands, what’s left until then, and your no-spend streak (days in a row without spending on wants).' },
    { route: 'dashboard/overview', target: ['#savings-card'], title: 'Your savings', text: 'Total saved, how much this month, your savings rate and whether you’re ahead of last month. The bars show the last six months and each goal’s progress is right under it.' },
    { route: 'dashboard/overview', target: ['#forecast-card'], title: 'Will I make it?', text: 'This line is where your balance is heading, based on how you spent in the last 30 days. If it hits zero before your allowance, you’ll see the day it runs out.' },
    { route: 'dashboard/overview', target: ['#forecast-card .slider-panel', '#forecast-card'], title: 'Try a habit', text: 'Drag the sliders for food delivery, outings and chai. The line moves right away, so you can see what skipping two orders a week actually does.' },
    { route: 'dashboard/overview', target: ['#semester-card'], title: 'Semester plan', text: 'Add the expensive months coming up, like exam fees or a fest. It tells you if what you’re saving now will cover them.' },
    { route: 'dashboard/overview', target: ['#pet-card'], title: 'Meet Yoko', text: 'Your money pet. It earns XP when you log spends, stick to your budget and finish challenges, and it reacts to how your month is going. Rename it in Settings.' },
    { route: 'dashboard/overview', target: ['#quests-card'], title: 'Coming up', text: 'Challenges in progress, things on your wishlist, birthdays you’re buying gifts for and bills due soon, all in one list.' },
    { route: 'dashboard/overview', target: ['#sub-check', '#safe-hero'], title: 'Subscription check-in', text: 'Once a month YOKO! asks if you actually used each subscription. If you didn’t, it shows what it costs you in a year, so cancelling is an easy call.' },
    { route: 'dashboard/forecast', target: ['#weather', '#view-dashboard .subtabs-inner'], title: 'Money weather', text: 'A quick mood check for your month. Sunny when you’re on track, stormy when things are getting tight.' },
    { route: 'dashboard/calendar', target: ['#cal-card'], title: 'Bill calendar', text: 'Every bill, fee and allowance day on one calendar. From its ⋯ menu you can add them all to your phone’s calendar.' },
    { route: 'dashboard/charts', target: ['#view-dashboard .grid-2', '#view-dashboard .subtabs-inner'], title: 'Charts', text: 'Where your money goes by category, and how close each goal is.' }
  ] },
  { id: 'ai', icon: '✨', title: 'Ask the AI', blurb: 'Type or talk to log spends and ask questions.', route: 'dashboard/overview', steps: [
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'Just ask', text: 'Type the way you’d text a friend. “Spent 120 on chai.” “Can I afford a 1500 concert on Saturday?” “How much did I spend on food this week?” It answers with your real numbers.' },
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'Say amounts any way', text: '“2 lakh”, “1.5 cr”, “50k”, “two thousand five hundred”, it gets all of them. You can also split right away: “paid 300 for pizza, split it with Aarav”.' },
    { route: 'dashboard/overview', target: ['#cb-mic', '#command-bar'], title: 'Use your voice', text: 'Tap the mic and say it out loud. Handy when you’re walking out of the canteen.' },
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'The math is real', text: 'The AI only works out what you meant. All the calculations happen in the app, so it never makes up a number. If you’re offline, the simple stuff like logging and “can I afford” still works.' },
    { route: 'budget/plan', target: ['[data-action="budget-autopilot"]', '#cat-card'], title: 'Budget Autopilot', text: 'Tap “Set my budgets for me” and it suggests a limit for each category based on how you really spend.' }
  ] },
  { id: 'spend', icon: '💸', title: 'Spend', blurb: 'Every expense, where it goes, and when.', route: 'spend/log', steps: [
    { route: 'spend/log', target: ['#view-spend .exact-card'], title: 'Exact numbers up top', text: 'Left to spend today, left until your next allowance, and what you’ve spent today. To the paisa, no rounding.' },
    { route: 'spend/log', target: ['#exp-log .exp-filter', '#exp-log'], title: 'Expense log', text: 'Everything you’ve logged this month. Search by shop, note or amount, or filter by category and date. Tap the pencil to edit or the bin to delete. Deleted by mistake? Hit Undo at the bottom.' },
    { route: 'spend/log', target: ['#quickadd-btn'], title: 'Ways to add a spend', text: 'Type it in, scan the receipt, paste the SMS your bank or UPI app sends, or import a whole bank statement (CSV or PDF). It learns which shop goes in which category, so it gets smarter each time.' },
    { route: 'spend/log', target: ['#exp-log'], title: 'One bill, many categories', text: 'Big grocery run with snacks and toiletries? “Split an expense” spreads one payment across categories.' },
    { route: 'spend/categories', target: ['#view-spend .subtabs-inner'], title: 'Categories', text: 'How much each category has used of its limit this month, with a chart. Anything close to its limit shows up in amber or red.' },
    { route: 'spend/insights', target: ['#w-ghost-spending'], title: 'Ghost spending', text: 'Small payments you don’t notice, like ₹20 here and ₹40 there. This adds them up so you can see what they really cost.' },
    { route: 'spend/insights', target: ['#w-time-of-day', '#w-spending-heatmap', '#view-spend .subtabs-inner'], title: 'When you spend', text: 'Morning, afternoon, evening or late night. Most people find their late-night spends are the ones they regret.' },
    { route: 'spend/insights', target: ['#w-spending-heatmap'], title: 'Spending heatmap', text: 'Every day as a little square. Darker means you spent more. Tap a day to see what happened.' },
    { route: 'spend/recurring', target: ['#recurring-card'], title: 'Recurring payments', text: 'Rent, mess fees, phone recharge, subscriptions. Add them once and YOKO! logs them on the right day and counts them before telling you what’s safe to spend.' },
    { route: 'spend/cash', target: ['#w-cash'], title: 'Cash', text: 'Took ₹500 out of the ATM? Log it here so cash spends don’t vanish from your budget. You can also log auto, metro and cab trips from the + button.' }
  ] },
  { id: 'budget', icon: '📊', title: 'Budget', blurb: 'Your plan, your income, and what changed.', route: 'budget/plan', steps: [
    { route: 'budget/plan', target: ['#view-budget .stats-grid'], title: 'The month at a glance', text: 'Income, how much is left, and your daily allowance for the rest of the month.' },
    { route: 'budget/plan', target: ['#income-log', '#view-budget .stats-grid', '#cat-card'], title: 'Income', text: 'Pocket money, part-time pay, money from home. Log what comes in so the plan matches reality. If your allowance comes at random times, mark it as irregular when you set it up.' },
    { route: 'budget/plan', target: ['#cat-card'], title: 'Category limits', text: 'Set a limit for each category. Spending fills in on its own from your expense log. You get a heads-up at 80% and again at 100%, as a notification or a banner in the app.' },
    { route: 'budget/plan', target: ['#cat-card'], title: 'Freeze a category', text: 'Trying to cut back on something? Freeze it for 7 to 30 days from Goals → Challenges. If you log a spend there, YOKO! reminds you how many days you have left.' },
    { route: 'budget/plan', target: ['#view-budget .grid-2'], title: '50 / 30 / 20 check', text: 'Compares your needs, wants and savings with the common 50/30/20 split. Next to it, your allowance is split into pots like Hostel & Mess, Daily spending and Savings.' },
    { route: 'budget/where', target: ['#where-card'], title: 'Where did it go?', text: 'This month against the same point last month, category by category. You see right away what went up and what went down.' },
    { route: 'budget/yearly', target: ['#yearly-card'], title: 'Yearly and semester fees', text: 'Exam fees, hostel deposits, yearly subscriptions. YOKO! tells you how much to put aside each month so they don’t wipe you out.' },
    { route: 'budget/history', target: ['#history-card'], title: 'History', text: 'Every past month saved automatically, so you can look back and spot patterns.' }
  ] },
  { id: 'split', icon: '👥', title: 'Split', blurb: 'IOUs, bill splitting, UPI and live groups.', route: 'split/ious', tryIt: ['Split a bill', () => billSplitterModal()], steps: [
    { route: 'split/ious', target: ['#view-split .stats-grid', '#w-balances'], title: 'Who owes who', text: 'What friends owe you and what you owe them, totalled per person so you never have to do the math.' },
    { route: 'split/ious', target: ['#w-balances'], title: 'Settle up', text: 'Tap Settle up next to a name. If you owe them, pick GPay, PhonePe or Paytm and pay in one tap. If they owe you, copy your UPI ID or the ready-made message and send it. Then mark it settled.' },
    { route: 'split/ious', target: ['[data-action="split-bill"]', '#w-ious'], title: 'Split a bill from a photo', text: 'Snap the restaurant bill. YOKO! reads every item, you tap who had what, and tax and service charge get shared fairly. Your share goes into your expenses, the rest become IOUs.' },
    { route: 'split/ious', target: ['#w-ious'], title: 'IOUs', text: 'Lent someone ₹200 for an auto? Add an IOU with a due date so it doesn’t get forgotten.' },
    { route: 'split/groups', target: ['[data-action="create-group"]', '#view-split .view-head'], title: 'Live groups', text: 'For a flat, a trip or a club. Create a group and share the 6-letter code, or join with a friend’s code. Expenses anyone adds show up for everyone straight away, split equally or by amount, and your share lands in your own budget.' },
    { route: 'split/groups', target: ['#view-split .view-head'], title: 'Pay inside a group', text: 'Open a group to see who paid what. Add your UPI ID once and everyone in the group sees it. Tap Pay with UPI next to anyone you owe and it’s already filled in.' },
    { route: 'split/history', target: ['#w-settled', '#view-split .subtabs-inner'], title: 'Settled', text: 'Everything you’ve already settled, in case anyone says you never paid them back.' }
  ] },
  { id: 'goals', icon: '🎯', title: 'Goals & Savings', blurb: 'What you save, what you want, and staying on track.', route: 'goals/savings', tryIt: ['Try “Should I buy it?”', () => shouldIBuy()], steps: [
    { route: 'goals/savings', target: ['#savings-card'], title: 'How much you save', text: 'Your total, this month, savings rate and a six-month chart. Money added to goals and spent in savings categories both count.' },
    { route: 'goals/goals', target: ['.goal-card', '#view-goals .view-head'], title: 'Goals', text: 'A laptop, a trip, an emergency fund. Give it a target and a deadline and YOKO! tells you how much to save each month. Tap Add money whenever you put some aside.' },
    { route: 'goals/wishlist', target: ['#wishlist-card'], title: 'Wishlist with a 48-hour wait', text: 'Want something pricey? Add it here first. After 48 hours you decide if you still want it. Most of the time, you won’t. “Should I buy it?” gives you a straight yes, wait or no based on your budget.' },
    { route: 'goals/challenges', target: ['#challenges-card'], title: 'Challenges', text: 'No-spend days, a spending cap, the 52-week savings challenge, or freezing a category like food delivery. Finish them for bonus XP.' },
    { route: 'goals/gifts', target: ['#gifts-card', '#view-goals .view-head'], title: 'Gifts', text: 'Birthdays and festivals coming up, with a budget for each so they don’t sneak up on you.' }
  ] },
  { id: 'debt', icon: '💳', title: 'Debt', blurb: 'What you owe and when you’ll be free.', route: 'debt/debts', steps: [
    { route: 'debt/debts', target: ['#debt-hero', '#view-debt .view-head'], title: 'Debt-free date', text: 'The month you’ll be done paying everything back, how much is left and how much interest it’ll cost.' },
    { route: 'debt/debts', target: ['#view-debt .view-head'], title: 'Add what you owe', text: 'Education loan, a phone on EMI, a credit card, money from family. Add the balance, interest (0 is fine) and monthly payment. It warns you if the payment is too small to ever finish.' },
    { route: 'debt/debts', target: ['#view-debt .view-head'], title: 'Log payments', text: 'Each payment knocks down the debt’s health bar, like a boss fight. Clear one and you get a little celebration.' },
    { route: 'debt/plan', target: ['#view-debt .view-head'], title: 'Payoff plan', text: 'Pick avalanche (highest interest first, saves the most) or snowball (smallest first, quick wins). Add an extra amount each month, or use your allowance split, and drag the “what if” slider to see how much sooner you’d be done.' },
    { route: 'debt/emi', target: ['#view-debt .view-head'], title: 'Loan calculator', text: 'Thinking of taking a loan? Enter the amount, interest and months to see the monthly payment, total interest and a month-by-month table.' }
  ] },
  { id: 'settings', icon: '⚙️', title: 'Settings', blurb: 'Country, currency, account, backups and help.', tryIt: ['Open Settings', () => openSettings()], steps: [
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Basics', text: 'Change your country and currency (picked when you first signed up), switch theme, turn sounds on or off, blur amounts, and rename your pet.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Money', text: 'Add your monthly work hours and prices also show as how long you’d work for them. Add savings that aren’t in a goal to see how long your money would last.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Account', text: 'Make an account to use YOKO! on more than one device. Everything is locked with your passphrase before it leaves your phone. Keep your recovery key somewhere safe.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Data', text: 'Download a backup, set up automatic backups to a file, import a backup, see the shop categories it has learned, load demo data, redo the setup questions, or reset everything.' },
    { target: ['#side-settings', '#settings-mobile-btn'], title: 'Help', text: 'All the tutorials, how to add YOKO! to your home screen so it opens like an app, and a self-check of the app’s math.' }
  ] },
  { id: 'new', icon: '✨', title: 'What’s new', blurb: 'Debt, savings, exact amounts and better UPI.', hidden: true, steps: [
    { route: 'dashboard/overview', target: ['#safe-hero'], title: 'Exact safe to spend', text: 'Shows exactly what’s left for today, after bills, debt payments and what you already spent.' },
    { route: 'dashboard/overview', target: ['#savings-card'], title: 'Your savings', text: 'See how much you save each month and your savings rate.' },
    { route: 'dashboard/overview', target: ['#view-dashboard [data-action="scan-receipt"]', '#quickadd-btn'], title: 'Scan a receipt', text: 'Snap a bill right from Home and it logs the expense for you.' },
    { route: 'debt/debts', target: ['#view-debt .view-head'], title: 'Debt is back', text: 'Track loans and money you owe, with a payoff plan.' },
    { route: 'split/groups', target: ['[data-action="create-group"]', '#view-split .view-head'], title: 'Groups count in your budget', text: 'Your share of every group expense now shows up in your own spending. Split equally or by amount.' },
    { route: 'split/groups', target: ['#view-split .view-head'], title: 'UPI in groups', text: 'Pick GPay, PhonePe or Paytm to pay. In live groups everyone sees each other’s UPI ID.' },
    { route: 'dashboard/overview', target: ['#command-bar'], title: 'Say amounts your way', text: 'Type or say “2 lakh”, “50k” or “two thousand”. The AI gets it.' }
  ] }
];
const CHAPTER_ORDER = ['quick', 'dashboard', 'ai', 'spend', 'budget', 'split', 'goals', 'debt', 'settings'];
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
        <li><strong>Group spending counts:</strong> your share of live group expenses now shows up in your budget.</li>
        <li><strong>Split by amount:</strong> live groups can split unevenly, and you pick who’s in.</li>
        <li><strong>Settle part of it:</strong> settle up asks how much was paid and shows what’s left.</li>
        <li><strong>Income you can edit:</strong> fix or delete logged income, and it adds on top of your allowance.</li>
        <li><strong>Debt:</strong> track loans and money you owe, with a payoff plan.</li>
        <li><strong>Savings:</strong> see what you save each month and your savings rate.</li>
        <li><strong>Exact amounts:</strong> safe to spend and money left now show to the paisa.</li>
        <li><strong>Safe to spend fixed:</strong> it now counts today’s spending, bills and debt payments correctly.</li>
        <li><strong>Amount words:</strong> “2 lakh”, “50k” and “two thousand” now work in the AI bar.</li>
        <li><strong>Live groups:</strong> creating a group works the first time.</li>
        <li><strong>Scan receipt on Home:</strong> one tap from the Home page.</li>
        <li><strong>UPI pay:</strong> pick GPay, PhonePe or Paytm. Works in Live Groups too. QR codes removed.</li>
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


