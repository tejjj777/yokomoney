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
- `npm test`: load-order check, then `tests/smoke.mjs`: self-tests, every page and tab at 360x640 and 1280x800, quick-add/settings/palette, console errors, sideways scroll, offline after first load. Screenshots land in `tests/out/`. Look at the ones for what you changed. `ONLY=budget,wallet node tests/smoke.mjs` limits pages.
- Self-tests by hand: open DevTools console, run `runSelfTests()` (returns `{passed,total,results[{ok,name}]}`).
- Manual 360px check: `npm run serve`, open `http://localhost:8080`, DevTools device toolbar at 360x640. Service workers need http(s), not `file://`.
- Service worker caches code. When testing by hand after edits, use DevTools → Application → "Update on reload", or bump `CACHE`.
