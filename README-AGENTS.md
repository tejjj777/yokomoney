# README for agents: YOKO! Student

Read this first, every session. Plain HTML/CSS/JS. No framework, no build step. Works offline through `sw.js`.

## Golden rules for the code
- **All `js/` files are classic `<script>` tags that share one global scope.** A top-level `const`, `let` or `function` in any file is visible to every other file. Never add `import`/`export`, and never declare the same top-level name twice (it throws on load).
- **Load order matters.** `index.html` lists the scripts in order. Code that runs while files are loading (top-level statements, not function bodies) can only use things from the same or earlier files. Put startup work in `init()` (`js/init.js`), which runs after everything has loaded. Check with `node tools/check-load-order.mjs`.
- Every app file starts with `'use strict';`. Keep it.
- Adding a JS/CSS file: add a `<script>` tag in `index.html` **and** the path to `CORE` in `sw.js`.
- Every session: bump `CACHE` in `sw.js` (`'yoko-student-vN'`) and `TOUR_VERSION` in `js/tour.js`, and add the new features to `CHAPTERS` plus `showWhatsNew()` (both in `js/tour.js`).
- Pure money math goes in `js/finmath.js` (no DOM, no state) with a test in `js/selftests.js`.

## File map (load order)
| File | What's in it |
|---|---|
| `index.html` | Markup only: top bar, quick-add menu, sidebar, empty `<section id="view-*">` per page, modal root, script tags |
| `css/app.css` | All styles (tokens, layout, components, fun layer, print) |
| `sw.js` | Service worker. Page + `js/` + `css/` are network-first, assets cache-first |
| `js/theme-boot.js` | Runs in `<head>`: applies saved theme before first paint |
| `js/finmath.js` | `FinMath` (alias `F` in app code): payoff sims, dates, `parseSms`, `parseSmsBatch`, `parseStatementCsv`, `categorize`, `parseReceipt`, `parsePayslip`, `levelFor`, `splitShares`, `monthForecast`, `safeToSpend`, `forecastRunOut`, `semesterPlan` |
| `js/selftests.js` | `runSelfTests()` |
| `js/utils.js` | `STORAGE_KEY`, `APP_NAME`, `THEMES`, `ROUTES` (Student: dashboard, spend, budget, split, goals), `ICON`, `COUNTRIES`, `CURRENCIES`, `uid`, `esc`, `nn`, `clamp`, `todayISO`, `parseNum`, `fmt` (money), `fmtDate` and friends |
| `js/state.js` | `defaultState`, `normalizeState`, `normalizeMore`, `loadState`, `save`, global `state` and `ui`, `sampleState`, derived values: `monthlyIncome`, `budgetTotals`, `spentByCategory`, `syncActuals`, `debtPlan`, `goalInfo`, `studentSafeToSpend`, `categoryDailyAverages`, `studentRunOutForecast`, `studentSemesterPlan` |
| `js/charts.js` | Chart.js helpers: `makeChart`, `doughnut`, `spendChart`, `debtLineChart`, `forecastLineChart` |
| `js/ui-shared.js` | `TABS` (page tabs), `tabbed`, `moreMenu` (⋯ menus), `mi`, `viewHeader`, `stat`, `emptyState`, `chartCard`, `moneyInput` |
| `js/page-dashboard.js` | `renderDashboard`, `safeToSpendHero`, `runOutForecastCard`, `semesterCard`, `openSemesterModal` |
| `js/page-debt.js` | `renderDebt`, `emiCard` |
| `js/page-budget.js` | `renderBudget`, `renderSpend` (Expense log, Category breakdown, Recurring, Cash), income log, yearly bills, `whereCard`, price list `SUGGEST` + `loadPriceUpdates` |
| `js/suggestions.js` | Pick-from-list combos, debt/goal pickers, subscription and bill checklists, `findRecurringCharges`, expense search/filter, `splitExpenseForm` |
| `js/page-goals.js` | `renderGoals` (Goals, Gifts, Wishlist, Challenges tabs) |
| `js/fun.js` | Feels-like, `dailyAllowance`, `runwayInfo`, badges, confetti/sound, `addExpense`, `addToGoal`, cards, Money Wrapped (`openWrapped`), command palette (`openPalette`, `parseCommand`), theme (`applyTheme`) |
| `js/tour.js` | `TOUR_VERSION`, `CHAPTERS`, `showWelcome`, `showOnboarding` (Student onboarding: pocket money, schedule, living setup, part-time income), `showWhatsNew`, `startTour`, `openTutorialHub` |
| `js/page-wallet.js` | `renderWallet`, `renderSplit` (IOU summary, Roommates IOUs, Settled history), cash, IOUs (`iouForm`, `settleForm`), transport, taxes, payslips; `removeExpense`, `updateExpense` |
| `js/payslip.js` | Payslip reader (pdf.js loaded on demand), `loadScript` |
| `js/more.js` | Undo bar (`undoable`, `doUndo`), privacy, backups, PWA install, recurring payments, month history (`snapshotMonth`) |
| `js/import.js` | Bank SMS/statement import (`importModal`, `guessCategory`, `isDuplicate`), OCR (`loadOcr`) |
| `js/rewards.js` | `awardXP`, roast mode, money weather |
| `js/pet.js` | Money pet: `petMood`, `petSVG`, `petCard` |
| `js/challenges.js` | Challenges (incl. skip-a-category), should-I-buy-it + wishlist, `splitBillForm`, `goalsExtras` |
| `js/commands.js` | `dailyTick` (month rollover, recurring, rewards), `bindMore`, `MORE_ACTIONS`, `MORE_CSV` |
| `js/ai.js` | `aiCall` helper (timeout and fallback management) |
| `js/commandbar.js` | `commandBarHTML`, `bindCommandBar`, `budgetAutopilotModal`, voice input |
| `js/qrcode.js` | `QRCode.toSvg` (pure JS, offline SVG QR generator for UPI links) |
| `js/bill-split.js` | `billSplitterModal` (item photo splitter, multi-person assignment, proportional tax/SC), `settleUpModal` (UPI deep-links, QR codes, WhatsApp drafts), `openTopUpModal` (parent top-up drafts) |
| `js/wrapped.js` | `openWrapped`, `getWrappedMonthData`, `drawWrappedSquareCard` (1080x1080 PNG exporter) |
| `js/insights.js` | `ghostSpendingCard`, `timeOfDayCard`, `spendingHeatmapCard` (interactive GitHub-style daily calendar) |
| `js/global.js` | `applyCountry`, `setCountry`, sample data per country |
| `js/receipt.js` | Scan a receipt |
| `js/calendar.js` | Bill calendar, `.ics` download |
| `js/sub-checkin.js` | Monthly subscription check-in, `#do/<action>` deep links |
| `js/router.js` | `VIEWS`, `render()`, `scheduleRender()`, `commit()` (= badges + rewards + save + render) |
| `js/modals.js` | `openModal`, `closeModal`, `formModal`, all forms, `openPaycheckModal`, `openSettings` |
| `js/sync.js` | Account + end-to-end encrypted sync (Supabase). `SYNC_KEY` is a publishable key, not a secret |
| `js/export.js` | CSV exports |
| `js/actions.js` | `toast`, `loadSample`, `ACTIONS` (every `data-action="..."` click handler), quick-add menu |
| `js/init.js` | `buildChrome`, `bindEvents`, `init()` (startup) |
| `tools/check-load-order.mjs` | Static check that load-time code never needs a later file |
| `tests/smoke.mjs`, `tests/seed.json` | Browser smoke test and sample data for seeding |

Find anything: `grep -n "function name\|const name" js/*.js`.

## How things flow
- Clicks: elements carry `data-action="x"`; `ACTIONS[x]` in `js/actions.js` handles them (merged with `MORE_ACTIONS`, `SUB_ACTIONS`, `SYNC_ACTIONS`).
- A change: mutate `state`, then `commit()`. Never write to localStorage directly.
- Pages: `#route/tab` hash. `render()` calls `VIEWS[route]()`, which returns `{ html, charts }`; the html goes into `#view-route`, then `charts()` draws. Tabs come from `TABS` in `js/ui-shared.js`.

## Storage
localStorage `yoko.student.v1` holds the whole `state` as JSON (shape from `defaultState()` in `js/state.js`; anything loaded passes through `normalizeState()` + `normalizeMore()`, so add new fields in both `defaultState` and a normalizer):
```
{ version, currency, income{mode,net,gross,deductions[],freq,nextPayDate,others[],irregular},
  split{buckets[]}, debts[], debtSettings, emi,
  budget{ categories[{id,name,type:'needs'|'wants'|'savings',planned,actual,bucketId}],
          expenses[{id,date:'YYYY-MM-DD',categoryId,amount,note,src?,recurringId?,splitId?}] },
  goals[{id,name,target,saved,deadline,contributions[]}], gifts[], subscriptions[{id,name,amount,cycle,usage{}}],
  wallet{ cash[], ious[{id,person,dir:'owed'|'owe',amount,date,due,note,settled}], transport[], taxes[], deadlines[] },
  payslips[], recurring[], history[{month,income,cats[]}], rules[], wishlist[], challenges[], xp{total},
  yearlyBills[], incomeLog[], badges{}, settings{theme,sound,privacy,roast,petName,country,...}, meta{tourDone,tourVersion,...} }
```
Other keys: `yoko.student.prices`, `yoko.student.account`, `yoko.student.sync-clash`; IndexedDB `yoko-student` (backup file handle). Never read main YOKO!'s `paywise.v1`.

Seed test data: `localStorage.setItem('yoko.student.v1', <tests/seed.json>)` and reload. Set `meta.tourDone = true` to skip the welcome dialog.

## Testing
One-time setup: `npm install` then `npx playwright install chromium`.
- `npm test`: load-order check, then `tests/smoke.mjs`: self-tests, every page and tab at 360x640 and 1280x800, quick-add/settings/palette, console errors, sideways scroll, offline after first load. Screenshots land in `tests/out/`. Look at the ones for what you changed. `ONLY=budget,split node tests/smoke.mjs` limits pages.
- `node tests/full-check.mjs [pages] [crawl] [demo] [network] [motion]` (no args = all, ~10 min): everything above plus text spilling out of boxes, buttons with no handler, a click on every button on every tab, the demo flow 3 times from a fresh install (with on-device OCR of `tests/sample-bill.png`), AI answering / erroring / junk / never answering, offline, slow 3G, reduced motion and a 4x slower CPU. Report + screenshots in `tests/out/full/`.
- Self-tests by hand: open DevTools console, run `runSelfTests()` (returns `{passed,total,results[{ok,name}]}`).
- Manual 360px check: `npm run serve`, open `http://localhost:8080`, DevTools device toolbar at 360x640. Service workers need http(s), not `file://`.
- Service worker caches code. When testing by hand after edits, use DevTools → Application → "Update on reload", or bump `CACHE`.

## Session 6 Polish & Demo Data
- **Live Pet Reactions** (`js/pet.js`): `triggerPetReaction(type, text)` triggers temporary speech bubble updates and CSS bounce animations (`.boing`) on import, budget-ok, safe-to-spend red, afford check no, and freeze breaks.
- **Category Freeze** (`js/challenges.js`, `js/modals.js`, `js/commandbar.js`): `getActiveCategoryFreeze(catId)` tracks active `nocat` challenges with days remaining and warns user with confirmation dialogs prior to logging expenses.
- **Subscription Catcher** (`js/suggestions.js`): `findRecurringCharges()` detects weekly, monthly, and yearly recurring transaction intervals in imports. Users can track as active subscriptions or 1-tap mark unused to flag for cancellation.
- **Budget Nudges** (`js/more.js`): `checkBudgetNudges()` sends local Web Notifications (fallback in-app toast/banner) when category spending reaches 80% or 100% of planned budget, and when safe-to-spend turns red.
- **Student Demo Profile & 15 UPI Screenshots** (`js/state.js`, `assets/demo-screenshots/`): Complete 2nd-year engineering hostel persona (₹12,000 allowance on 5th, ₹4,000 tutoring, roommates Rahul & Aarav with UPI IDs, semester plan, active food delivery freeze). 15 realistic UPI screenshot PNG mock images in `assets/demo-screenshots/` for live hackathon demo flow. Load demo data and Remove demo data with undo available in ⋯ menu across all views.


## Session 9: full pre-hackathon check
- **Self-tests never touch the screen.** `runSelfTests()` runs on every start. Use the `{ dry: true }` options (`checkBudgetNudges`, `triggerPetReaction`) and wrap any test that swaps `state` in `try/finally`.
- **Action maps merge in order** (`ACTIONS` ← `MORE_ACTIONS` ← `SUB_ACTIONS` ← `SYNC_ACTIONS` ← `GROUP_ACTIONS`); a later map wins. Top-level `const`s are not `window` properties, so refer to them by name.
- **Allowance period** (`allowanceLeft()` in `js/state.js`, `F.payPeriod`): safe-to-spend, the run-out forecast, the command bar and the Budget daily allowance count spending since the last payday, so an allowance on the 5th isn't spent before it arrives. With payday on the 1st it equals the calendar month.
- **Live groups** load Supabase JS only when used (`GroupSync.ready()`); nothing third-party loads at start-up, so a blocked or slow network can't hold the app.
- **AI** (`aiCall`) skips straight to the on-device parser when offline, gives up after 4 s for commands, and `validAiCommand()` throws away answers without the fields the next step needs. The bill splitter reads photos on the device only.
- **Budget alerts** are remembered in `state.meta.nudges` (kept for this month and last). A need paid in one go that lands exactly on its plan doesn't alert.
- Demo persona: ₹16,000 a month (₹12,000 allowance + ₹4,000 tutoring) split into buckets that add up, roommates' UPI IDs in `wallet.upiIds`.

## Session 10: AI replies and UPI pay fix
- **AI edge function source** is now in `supabase/functions/ai/index.ts` (deployed copy lives in Supabase → Edge Functions → ai). It tries Groq first if `GROQ_API_KEY` is set (`GROQ_MODEL`, default `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`; Llama 3.3 70B is Enterprise-only on Groq), then `GEMINI_MODEL` (default `gemini-3.8-flash`), then other Gemini Flash models the key can use (found with ListModels, never hard-coded). A 429/503/timeout moves on to the next model. Response: the intent JSON plus `reply`, `provider`, and `skipped` when a model was passed over; `{error:'quota'|'unavailable', tried[]}` with 502 when all fail. Gemini free tier is about 20 requests a day per model. Live setup (Oct 2026): GROQ_API_KEY only, Gemini key removed; answers in about 1 to 2.5 s.
- **Command bar** (`js/commandbar.js`) sends `{ text, context: aiContext(), today }`. `aiContext()` sends rounded numbers only (no names, notes or UPI IDs). Intents: add/ask/afford/budget/whatif from the app's own math, `chat` shows the AI's `reply`, `down` = AI failed and the on-device parser didn't understand. Waits 6 s when the device parser understood the message, 16 s otherwise.
- **UPI** (`js/bill-split.js`): `upiSectionHTML()` + `bindUpiSection()` are shared by Settle up and group settle. You owe them: their UPI ID, a Pay link (Android gets `intent://pay?...#Intent;scheme=upi;end`, never `target="_blank"`) and a QR. They owe you: your own UPI ID (`state.settings.myUpiId`) and a QR for them to scan. `isUpiId()` checks name@bank. `copyText()` has a fallback for blocked clipboards.
- Test: `node tests/upi-ai-check.mjs` (Android user agent, mocked AI: chat, down, afford, slow).
