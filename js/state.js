/* YOKO! Student · App state: defaults, load/save, normalising, derived values.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   STATE
   ========================================================= */
function defaultBuckets() {
  return [
    { id: uid(), role: 'bills', name: 'Bills', mode: 'percent', value: 0 },
    { id: uid(), role: 'debt', name: 'Debt', mode: 'percent', value: 0 },
    { id: uid(), role: 'goals', name: 'Savings Goals', mode: 'percent', value: 0 },
    { id: uid(), role: 'gifts', name: 'Gifts', mode: 'percent', value: 0 },
    { id: uid(), role: 'spending', name: 'Spending', mode: 'percent', value: 0 }
  ];
}
/** Which paycheck bucket a category most likely belongs to. */
function guessBucket(c, buckets) {
  const by = role => (buckets.find(b => b.role === role) || {}).id || '';
  const n = c.name.toLowerCase();
  if (/loan|debt|emi|credit/.test(n)) return by('debt');
  if (c.type === 'savings' || /saving|invest/.test(n)) return by('goals');
  if (/gift/.test(n)) return by('gifts');
  if (/rent|mortgage|bill|utilit|insur|phone|internet|electric|yearly/.test(n)) return by('bills');
  return by('spending') || by('bills');
}
function defaultCategories() {
  return [['Rent', 'needs'], ['Food', 'needs'], ['Transport', 'needs'], ['Bills', 'needs'],
    ['Subscriptions', 'wants'], ['Fun', 'wants'], ['Savings', 'savings']]
    .map(([name, type]) => ({ id: uid(), name, type, planned: 0, actual: 0 }));
}
function defaultDeductions() {
  return [{ name: 'Tax', mode: 'percent', value: 0 }, { name: 'Pension / retirement', mode: 'percent', value: 0 },
    { name: 'Insurance', mode: 'amount', value: 0 }, { name: 'Other', mode: 'amount', value: 0 }];
}
let ds_buckets = [];
function defaultState() {
  const country = detectCountry(), ci = countryInfo(country), k = scaleFor(ci.currency);
  return {
    version: 1,
    currency: ci.currency,
    income: { mode: 'net', net: 0, gross: 0, deductions: defaultDeductions(), freq: 'monthly', nextPayDate: '', others: [], configured: false, irregular: false },
    split: { buckets: (() => { const b = defaultBuckets(); ds_buckets = b; return b; })() },
    debts: [],
    debtSettings: { extra: 0, strategy: 'avalanche' },
    emi: { principal: niceAmount(500000 * k), rate: 9.5, months: 60 },
    budget: { incomeOverride: null, categories: defaultCategories().map(c => Object.assign(c, { bucketId: guessBucket(c, ds_buckets) })), expenses: [] },
    gifts: [],
    goals: [],
    goalSettings: { selectedGoalId: null },
    subscriptions: [],
    settings: { theme: 'yoko', sound: true, workHours: 176, unit: { name: 'chai', plural: 'chais', emoji: '☕', price: 20 }, cashOnHand: 0, roundUp: { enabled: false, to: roundUpFor(ci.currency), goalId: null }, privacy: false, roast: 'nice', petName: 'Yoko', country: ci.code },
    badges: {},
    meta: { startedAt: todayISO(), tourDone: false, budgetMonth: todayISO().slice(0, 7), periodStart: todayISO().slice(0, 7) + '-01', closedEarly: '', lastBackup: '', backupSnooze: '', skippedTotal: 0, streakRewarded: 0, xpDay: { date: '', n: 0 }, xpBackup: '', tourVersion: 0, tourChapters: {} },
    wallet: { cash: [], ious: [], transport: [], taxes: [], deadlines: [], taxYearStart: ci.fy, taxEstimate: 0, upiIds: {} },
    payslips: [],
    student: { allowance: 0, arrivalDay: 1, living: 'hostel', partTimeAmount: 0, partTimeHours: 0, semester: { start: '', end: '', heavyMonths: [] } },
    recurring: [], history: [], rules: [], wishlist: [], challenges: [], xp: { total: 0 }, yearlyBills: [], incomeLog: []
  };
}

/** Clean any loaded/imported object into a valid state (no NaN, no negatives). */
function normalizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const arr = v => Array.isArray(v) ? v : [];
  const str = (v, def = '', max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);
  const date = v => (F.parseDate(v) ? v : '');
  const freq = v => (FREQ_LABEL[v] ? v : 'monthly');
  const s = d;
  s.currency = CURRENCIES[raw.currency] ? raw.currency : d.currency;

  const ri = raw.income || {};
  s.income = {
    mode: ri.mode === 'gross' ? 'gross' : 'net',
    net: nn(ri.net), gross: nn(ri.gross),
    deductions: Array.isArray(ri.deductions) ? ri.deductions.map(x => ({
      name: str(x && x.name, 'Deduction'), mode: x && x.mode === 'percent' ? 'percent' : 'amount',
      value: x && x.mode === 'percent' ? clamp(nn(x.value), 0, 100) : nn(x && x.value)
    })) : d.income.deductions,
    freq: freq(ri.freq), nextPayDate: date(ri.nextPayDate), irregular: !!ri.irregular,
    others: arr(ri.others).map(o => ({ id: str(o.id, uid()), name: str(o.name, 'Other income'), amount: nn(o.amount), freq: freq(o.freq) })),
    configured: !!ri.configured
  };

  const bks = arr(raw.split && raw.split.buckets).map(b => ({
    id: str(b.id, uid()), role: BUCKET_ROLES.includes(b.role) ? b.role : 'custom', name: str(b.name, 'Bucket', 40),
    mode: b.mode === 'amount' ? 'amount' : 'percent', value: b.mode === 'amount' ? nn(b.value) : clamp(nn(b.value), 0, 100)
  }));
  s.split = { buckets: bks.length ? bks : d.split.buckets };

  s.debts = arr(raw.debts).map(x => ({
    id: str(x.id, uid()), name: str(x.name, 'Debt', 60), balance: nn(x.balance), rate: clamp(nn(x.rate), 0, 100), minPayment: nn(x.minPayment),
    startBalance: Math.max(nn(x.startBalance), nn(x.balance)), defeatedAt: date(x.defeatedAt),
    payments: arr(x.payments).map(p => ({ id: str(p.id, uid()), date: date(p.date) || todayISO(), amount: nn(p.amount) })),
    kind: ['card', 'car', 'student', 'personal', 'mortgage', 'bnpl', 'medical', 'family', 'other'].includes(x.kind) ? x.kind : ''
  }));
  const ds = raw.debtSettings || {};
  s.debtSettings = { extra: nn(ds.extra), strategy: ds.strategy === 'snowball' ? 'snowball' : 'avalanche' };
  const em = raw.emi || {};
  s.emi = { principal: nn(em.principal ?? d.emi.principal), rate: clamp(nn(em.rate ?? d.emi.rate), 0, 100), months: clamp(Math.round(nn(em.months ?? 60)) || 60, 1, 600) };

  const rb = raw.budget || {};
  const cats = arr(rb.categories).map(c => ({ id: str(c.id, uid()), name: str(c.name, 'Category', 40), type: ['needs', 'wants', 'savings'].includes(c.type) ? c.type : 'wants', planned: nn(c.planned), actual: nn(c.actual) }));
  s.budget = {
    incomeOverride: rb.incomeOverride === null || rb.incomeOverride === undefined || rb.incomeOverride === '' ? null : nn(rb.incomeOverride),
    categories: Array.isArray(rb.categories) ? cats : d.budget.categories,
    expenses: arr(rb.expenses).map(x => {
      const e = { id: str(x.id, uid()), date: date(x.date) || todayISO(), categoryId: str(x.categoryId), amount: nn(x.amount), note: str(x.note, '', 120) };
      if (x.roundup && typeof x.roundup === 'object') e.roundup = { goalId: str(x.roundup.goalId), cid: str(x.roundup.cid), amount: nn(x.roundup.amount) };
      return e;
    })
  };

  s.gifts = arr(raw.gifts).map(g => ({
    id: str(g.id, uid()), name: str(g.name, 'Someone', 60), occasion: OCCASIONS.includes(g.occasion) ? g.occasion : 'Custom',
    customOccasion: str(g.customOccasion, '', 40), date: date(g.date) || todayISO(), budget: nn(g.budget),
    idea: str(g.idea, '', 120), status: GIFT_STATUS.includes(g.status) ? g.status : 'Idea'
  }));
  s.goals = arr(raw.goals).map(g => ({
    id: str(g.id, uid()), name: str(g.name, 'Goal', 60), target: nn(g.target), saved: nn(g.saved),
    deadline: date(g.deadline), rate: clamp(nn(g.rate), 0, 100),
    planMonthly: g.planMonthly === null || g.planMonthly === undefined ? null : nn(g.planMonthly),
    contributions: arr(g.contributions).map(c => ({ id: str(c.id, uid()), date: date(c.date) || todayISO(), amount: nn(c.amount), note: str(c.note, '', 120), roundup: !!c.roundup }))
  }));
  s.goalSettings = { selectedGoalId: str(raw.goalSettings && raw.goalSettings.selectedGoalId, null) };
  s.subscriptions = arr(raw.subscriptions).map(x => {
    const usage = {};
    if (x.usage && typeof x.usage === 'object') for (const [k, v] of Object.entries(x.usage)) if (/^\d{4}-\d{2}$/.test(k) && typeof v === 'boolean') usage[k] = v;
    const pc = x.priceChange && typeof x.priceChange === 'object' && nn(x.priceChange.to) > 0 ? { from: nn(x.priceChange.from), to: nn(x.priceChange.to), date: date(x.priceChange.date) || todayISO() } : null;
    const o = { id: str(x.id, uid()), name: str(x.name, 'Subscription', 40), amount: nn(x.amount), cycle: x.cycle === 'yearly' ? 'yearly' : 'monthly', since: date(x.since), usage, kept: typeof x.kept === 'string' && /^\d{4}-\d{2}$/.test(x.kept) ? x.kept : '', plan: str(x.plan, '', 60) };
    if (pc) o.priceChange = pc;
    return o;
  });
  const rs = raw.settings || {}, ru = rs.roundUp || {}, un = rs.unit || {};
  const unitName = str(un.name, 'chai', 20);
  s.settings = {
    theme: THEME_KEYS.includes(rs.theme) ? rs.theme : 'yoko',
    sound: rs.sound !== false,
    workHours: clamp(nn(rs.workHours) || 176, 1, 744),
    unit: { name: unitName, plural: str(un.plural, unitName + 's', 20), emoji: str(un.emoji, '☕', 8), price: nn(un.price) || 20 },
    cashOnHand: nn(rs.cashOnHand),
    roundUp: { enabled: !!ru.enabled, to: ROUND_TO.includes(+ru.to) ? +ru.to : roundUpFor(s.currency), goalId: str(ru.goalId, null) }
  };
  s.badges = {};
  if (raw.badges && typeof raw.badges === 'object') for (const [k, v] of Object.entries(raw.badges)) if (date(v)) s.badges[k] = v;
  const firstExpense = s.budget.expenses.map(x => x.date).sort()[0];
  const started = date(raw.meta && raw.meta.startedAt) || todayISO();
  s.meta = { startedAt: firstExpense && firstExpense < started ? firstExpense : started, tourDone: !!(raw.meta && raw.meta.tourDone) };
  const rw = raw.wallet || {};
  s.wallet = {
    cash: arr(rw.cash).map(x => ({ id: str(x.id, uid()), date: date(x.date) || todayISO(), type: x.type === 'out' ? 'out' : 'in', amount: nn(x.amount), note: str(x.note, '', 120), expenseId: str(x.expenseId, null) })),
    ious: arr(rw.ious).map(x => ({ id: str(x.id, uid()), person: str(x.person, 'Someone', 60), dir: x.dir === 'owe' ? 'owe' : 'owed', amount: nn(x.amount), date: date(x.date) || todayISO(), due: date(x.due), note: str(x.note, '', 120), settled: !!x.settled, settledAt: date(x.settledAt) })),
    transport: arr(rw.transport).map(x => ({ id: str(x.id, uid()), date: date(x.date) || todayISO(), mode: TRANSPORT_KEYS.includes(x.mode) ? x.mode : 'other', amount: nn(x.amount), km: nn(x.km) || null, note: str(x.note, '', 120), expenseId: str(x.expenseId, null) })),
    taxes: arr(rw.taxes).map(x => ({ id: str(x.id, uid()), date: date(x.date) || todayISO(), type: TAX_TYPES.includes(x.type) ? x.type : (LEGACY_TAX[x.type] || 'Other'), amount: nn(x.amount), note: str(x.note, '', 120), payslipId: str(x.payslipId, null) })),
    deadlines: arr(rw.deadlines).map(x => ({ id: str(x.id, uid()), title: str(x.title, 'Deadline', 80), date: date(x.date) || todayISO(), repeat: x.repeat !== false })),
    taxYearStart: clamp(Math.round(nn(rw.taxYearStart)) || 4, 1, 12),
    taxEstimate: nn(rw.taxEstimate),
    upiIds: (rw.upiIds && typeof rw.upiIds === 'object') ? rw.upiIds : {}
  };
  s.payslips = arr(raw.payslips).map(x => ({
    id: str(x.id, uid()), month: /^\d{4}-\d{2}$/.test(x.month) ? x.month : todayISO().slice(0, 7), employer: str(x.employer, '', 80),
    gross: nn(x.gross), net: nn(x.net), tax: nn(x.tax), pf: nn(x.pf), pt: nn(x.pt), esi: nn(x.esi), other: nn(x.other),
    fileName: str(x.fileName, '', 120), addedAt: date(x.addedAt) || todayISO()
  }));
  return normalizeMore(s, raw);
}

/* ---------- State for the new features ---------- */
function normalizeMore(s, raw) {
  const arr = v => Array.isArray(v) ? v : [];
  const str = (v, def = '', max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);
  const date = v => (F.parseDate(v) ? v : '');
  const ym = v => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : '');
  s.recurring = arr(raw.recurring).map(x => ({
    id: str(x.id, uid()), name: str(x.name, 'Payment', 60), amount: nn(x.amount), categoryId: str(x.categoryId),
    freq: ['weekly', 'monthly', 'yearly'].includes(x.freq) ? x.freq : 'monthly', start: date(x.start) || todayISO(),
    lastPosted: date(x.lastPosted), debtId: str(x.debtId, null), subId: str(x.subId, null), active: x.active !== false
  }));
  s.history = arr(raw.history).filter(h => h && ym(h.month)).map(h => ({
    month: h.month, income: nn(h.income),
    cats: arr(h.cats).map(c => ({ name: str(c.name, 'Category', 40), type: ['needs', 'wants', 'savings'].includes(c.type) ? c.type : 'wants', planned: nn(c.planned), actual: nn(c.actual) }))
  })).sort((a, b) => a.month.localeCompare(b.month)).slice(-36);
  s.rules = arr(raw.rules).map(r => ({ id: str(r.id, uid()), match: str(r.match, '', 40).toLowerCase(), categoryId: str(r.categoryId) })).filter(r => r.match && r.categoryId);
  s.wishlist = arr(raw.wishlist).map(w => ({
    id: str(w.id, uid()), name: str(w.name, 'Something nice', 60), price: nn(w.price),
    addedAt: Number.isFinite(+w.addedAt) && +w.addedAt > 0 ? +w.addedAt : Date.now(),
    status: ['waiting', 'bought', 'skipped'].includes(w.status) ? w.status : 'waiting', decidedAt: date(w.decidedAt)
  }));
  s.challenges = arr(raw.challenges).map(c => ({
    id: str(c.id, uid()), type: ['week52', 'nocat', 'cap'].includes(c.type) ? c.type : 'nocat', start: date(c.start) || todayISO(),
    unit: nn(c.unit) || 10, goalId: str(c.goalId, null), categoryId: str(c.categoryId), days: clamp(Math.round(nn(c.days)) || 7, 1, 365), cap: nn(c.cap),
    deposits: arr(c.deposits).map(d => ({ week: clamp(Math.round(nn(d.week)), 1, 52), date: date(d.date) || todayISO(), amount: nn(d.amount) })).slice(0, 52),
    rewarded: !!c.rewarded, failed: !!c.failed
  }));
  s.xp = { total: nn(raw.xp && raw.xp.total) };
  const rs = raw.settings || {};
  s.settings.privacy = !!rs.privacy;
  s.settings.roast = ['off', 'nice', 'savage'].includes(rs.roast) ? rs.roast : 'nice';
  s.settings.petName = str(rs.petName, 'Yoko', 20);
  s.settings.country = COUNTRIES[rs.country] ? rs.country : countryFromCurrency(s.currency);
  const rm = raw.meta || {};
  s.meta.budgetMonth = ym(rm.budgetMonth) || todayISO().slice(0, 7);
  s.meta.periodStart = date(rm.periodStart) || s.meta.budgetMonth + '-01';
  s.meta.isSample = rm.isSample === true;
  s.meta.subSuggest = {};
  if (rm.subSuggest && typeof rm.subSuggest === 'object') for (const [k, v] of Object.entries(rm.subSuggest)) if (typeof v === 'string' && /^(no|later:\d{4}-\d{2}-\d{2})$/.test(v)) s.meta.subSuggest[k.slice(0, 40)] = v;
  s.meta.closedEarly = ym(rm.closedEarly);
  s.meta.lastBackup = date(rm.lastBackup);
  s.meta.backupSnooze = date(rm.backupSnooze);
  s.meta.skippedTotal = nn(rm.skippedTotal);
  s.meta.streakRewarded = nn(rm.streakRewarded);
  s.meta.xpDay = rm.xpDay && date(rm.xpDay.date) ? { date: rm.xpDay.date, n: nn(rm.xpDay.n) } : { date: '', n: 0 };
  s.meta.xpBackup = date(rm.xpBackup);
  s.meta.subCheckSkip = typeof rm.subCheckSkip === 'string' ? rm.subCheckSkip.slice(0, 7) : '';
  s.meta.tourVersion = nn(rm.tourVersion);
  s.meta.tourChapters = {};
  if (rm.tourChapters && typeof rm.tourChapters === 'object') for (const k of Object.keys(rm.tourChapters)) if (rm.tourChapters[k] === true) s.meta.tourChapters[k] = true;
  // keep links from expenses to recurring payments / debt payments / imports
  const re = arr(raw.budget && raw.budget.expenses);
  s.budget.expenses.forEach((e, i) => {
    const x = re[i] || {};
    if (typeof x.recurringId === 'string') e.recurringId = x.recurringId;
    if (x.debtPay && typeof x.debtPay === 'object') e.debtPay = { debtId: str(x.debtPay.debtId), pid: str(x.debtPay.pid), amount: nn(x.debtPay.amount) };
    if (['import', 'sms', 'receipt'].includes(x.src)) e.src = x.src;
    if (typeof x.splitId === 'string') e.splitId = x.splitId.slice(0, 40);
  });
  s.yearlyBills = arr(raw.yearlyBills).map(x => ({ id: str(x.id, uid()), name: str(x.name, 'Yearly bill', 60), amount: nn(x.amount), due: date(x.due) || todayISO() }));
  s.incomeLog = arr(raw.incomeLog).map(x => ({ id: str(x.id, uid()), date: date(x.date) || todayISO(), amount: nn(x.amount), note: str(x.note, '', 80) })).filter(x => x.amount > 0);
  // every category belongs to a paycheck bucket (or none)
  const rc = arr(raw.budget && raw.budget.categories);
  s.budget.categories.forEach((c, i) => {
    const x = rc[i] || {};
    c.bucketId = typeof x.bucketId === 'string' ? (s.split.buckets.some(b => b.id === x.bucketId) ? x.bucketId : '') : guessBucket(c, s.split.buckets);
  });
  const rst = raw.student || {};
  const rsem = rst.semester || {};
  s.student = {
    allowance: nn(rst.allowance),
    arrivalDay: rst.arrivalDay === 'irregular' ? 'irregular' : clamp(Math.round(nn(rst.arrivalDay)) || 1, 1, 31),
    living: ['hostel', 'pg', 'home'].includes(rst.living) ? rst.living : 'hostel',
    partTimeAmount: nn(rst.partTimeAmount),
    partTimeHours: nn(rst.partTimeHours),
    semester: {
      start: date(rsem.start) || '',
      end: date(rsem.end) || '',
      heavyMonths: arr(rsem.heavyMonths).map(h => ({
        id: str(h.id, uid()),
        month: ym(h.month) || (date(h.date) ? h.date.slice(0, 7) : todayISO().slice(0, 7)),
        name: str(h.name, 'Expense', 60),
        amount: nn(h.amount)
      })).filter(h => h.amount > 0)
    }
  };
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch (err) {
    // Never lose someone's data to a bug: keep an untouched copy before starting fresh.
    console.warn('Could not read saved data; starting fresh.', err);
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) localStorage.setItem(`${STORAGE_KEY}.unreadable-${Date.now()}`, raw); } catch (e) { /* ignore */ }
    loadFailed = true;
    return defaultState();
  }
}
let loadFailed = false;
let saveWarned = false;
function save() {
  syncActuals();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); afterSave(); }
  catch (err) { if (!saveWarned) { toast('Couldn’t save. Your browser storage is full or blocked.'); saveWarned = true; } }
}

let state = loadState();
const ui = { open: {} };   // non-persistent UI state (open <details>, etc.)

/** Sample data with dates relative to today, so it always looks current. */
function sampleState() {
  const t = todayDate();
  const iso = d => F.toISO(d);
  const nextFirst = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const s = defaultState();
  s.currency = state.currency;
  s.income = { mode: 'net', net: 85000, gross: 0, deductions: defaultDeductions(), freq: 'monthly', nextPayDate: iso(nextFirst),
    others: [{ id: uid(), name: 'Freelance design', amount: 12000, freq: 'monthly' }], configured: true };
  const B = (role, name, mode, value) => ({ id: uid(), role, name, mode, value });
  s.split.buckets = [B('bills', 'Bills', 'percent', 32), B('debt', 'Debt', 'percent', 20), B('goals', 'Savings Goals', 'percent', 15),
    B('gifts', 'Gifts', 'percent', 2), B('spending', 'Spending', 'percent', 25), B('custom', 'Family support', 'amount', 5100)];
  const D = (name, balance, startBalance, rate, minPayment, extra = {}) => Object.assign({ id: uid(), name, balance, startBalance, rate, minPayment, defeatedAt: '', payments: [] }, extra);
  s.debts = [
    D('Credit card', 65000, 90000, 36, 3250),
    D('Personal loan', 240000, 300000, 14, 8000),
    D('Bike loan', 55000, 80000, 10.5, 2900),
    D('Phone EMI', 0, 24000, 0, 2000, { defeatedAt: iso(F.addDays(t, -3)), payments: [{ id: uid(), date: iso(F.addDays(t, -3)), amount: 2000 }] })
  ];
  s.debtSettings = { extra: 2850, strategy: 'avalanche' };   // 20% of 85,000 − 14,150 minimums
  const C = (name, type, planned, actual) => ({ id: uid(), name, type, planned, actual });
  s.budget.categories = [C('Rent', 'needs', 22000, 0), C('Food', 'needs', 11000, 0), C('Transport', 'needs', 3500, 0),
    C('Bills', 'needs', 5000, 0), C('Loans & debt', 'needs', 17000, 0), C('Subscriptions', 'wants', 1500, 0),
    C('Fun', 'wants', 5000, 0), C('Savings', 'savings', 12750, 0)];
  s.budget.expenses = [];   // filled in by sampleSpending() once recurring payments exist
  const G = (name, occasion, days, budget, idea, status, customOccasion = '') => ({ id: uid(), name, occasion, customOccasion, date: iso(F.addDays(t, days)), budget, idea, status });
  s.gifts = [
    G('Mom', 'Birthday', 12, 3000, 'Silk saree', 'Idea'),
    G('Family', 'Diwali', 40, 8000, 'Sweets & gift hampers', 'Idea'),
    G('Priya (Secret Santa)', 'Christmas', F.daysBetween(t, F.nextAnnualOccurrence(new Date(t.getFullYear(), 11, 25), t)), 1000, 'Book + mug', 'Idea'),
    G('Parents', 'Anniversary', 95, 5000, 'Dinner voucher', 'Idea'),
    G('Dad', 'Birthday', 150, 2500, 'Smartwatch strap', 'Idea'),
    G('Sister', 'Raksha Bandhan', 310, 2000, 'Earrings', 'Idea'),
    G('Arjun', 'Custom', 60, 1500, 'Board game', 'Bought', 'Housewarming')
  ];
  const goal = (name, target, saved, months, rate, contributions) => ({ id: uid(), name, target, saved, deadline: iso(F.addMonths(t, months)), rate, planMonthly: null, contributions });
  s.goals = [
    goal('Emergency fund', 300000, 120000, 18, 6.5, [{ id: uid(), date: iso(F.addMonths(t, -2)), amount: 60000, note: 'Bonus' }, { id: uid(), date: iso(F.addMonths(t, -1)), amount: 60000, note: '' }]),
    goal('New laptop', 120000, 35000, 8, 0, [{ id: uid(), date: iso(F.addMonths(t, -1)), amount: 35000, note: '' }]),
    goal('Beach trip', 45000, 9000, 5, 0, [{ id: uid(), date: iso(F.addDays(t, -14)), amount: 9000, note: '' }])
  ];
  s.subscriptions = [
    { id: uid(), name: 'Netflix', amount: 649, cycle: 'monthly' }, { id: uid(), name: 'Spotify', amount: 119, cycle: 'monthly' },
    { id: uid(), name: 'iCloud+', amount: 75, cycle: 'monthly' }, { id: uid(), name: 'Amazon Prime', amount: 1499, cycle: 'yearly' },
    { id: uid(), name: 'Gym', amount: 1500, cycle: 'monthly' }
  ];
  // Round-ups on this month's sample expenses go to the Beach trip jar
  sampleSpending(s, t);
  s.budget.expenses.forEach(x => {
    if (x.date.slice(0, 7) !== iso(t).slice(0, 7) || x.recurringId || !/food|transport|fun/i.test((s.budget.categories.find(c => c.id === x.categoryId) || {}).name || '')) return;
    const up = F.roundUpAmount(x.amount, 100);
    if (up <= 0) return;
    const cid = uid(), cat = s.budget.categories.find(c => c.id === x.categoryId);
    s.goals[2].saved += up;
    s.goals[2].contributions.push({ id: cid, date: x.date, amount: up, note: `Round-up · ${cat.name}`, roundup: true });
    x.roundup = { goalId: s.goals[2].id, cid, amount: up };
  });
  // Wallet sample
  const ago = n => iso(F.addDays(t, -n)), ahead = n => iso(F.addDays(t, n));
  s.wallet.cash = [
    { id: uid(), date: ago(20), type: 'in', amount: 5000, note: 'ATM withdrawal', expenseId: null },
    { id: uid(), date: ago(18), type: 'out', amount: 60, note: 'Chai & samosa', expenseId: null },
    { id: uid(), date: ago(11), type: 'out', amount: 340, note: 'Vegetable market', expenseId: null },
    { id: uid(), date: ago(10), type: 'out', amount: 2000, note: 'Settled with Arjun', expenseId: null },
    { id: uid(), date: ago(4), type: 'out', amount: 150, note: 'Auto fare', expenseId: null }
  ];
  s.wallet.ious = [
    { id: uid(), person: 'Rahul', dir: 'owed', amount: 1500, date: ago(15), due: ahead(10), note: 'Concert ticket', settled: false, settledAt: '' },
    { id: uid(), person: 'Priya', dir: 'owe', amount: 800, date: ago(8), due: ahead(3), note: 'Dinner split', settled: false, settledAt: '' },
    { id: uid(), person: 'Arjun', dir: 'owe', amount: 2000, date: ago(40), due: '', note: 'Bike repair', settled: true, settledAt: ago(10) }
  ];
  const T = (daysAgo, mode, amount, note, km = null) => ({ id: uid(), date: ago(daysAgo), mode, amount, note, km, expenseId: null });
  s.wallet.transport = [T(26, 'fuel', 1500, 'Full tank', 320), T(22, 'metro', 40, 'Office'), T(16, 'cab', 320, 'Airport run', 18), T(12, 'metro', 40, 'Office'),
    T(9, 'parking', 60, 'Mall'), T(5, 'auto', 120, 'Market'), T(3, 'fuel', 1200, 'Top-up', 250), T(1, 'cab', 260, 'Late night')];
  const fyS = F.taxYear(t, countryInfo(state.settings.country).fy);
  s.wallet.taxes = [];
  for (let d = new Date(fyS.start); d < new Date(t.getFullYear(), t.getMonth(), 1); d = F.addMonths(d, 1)) {
    const end = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), lbl = `Payslip · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    s.wallet.taxes.push({ id: uid(), date: end, type: 'Withheld from pay', amount: 6200, note: lbl, payslipId: null });
    s.wallet.taxes.push({ id: uid(), date: end, type: PAYROLL_TAX, amount: 200, note: lbl, payslipId: null });
  }
  s.wallet.taxEstimate = 76800;
  s.payslips = [1, 2].map(k => { const m = F.addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -k);
    return { id: uid(), month: iso(m).slice(0, 7), employer: 'Acme Technologies Pvt Ltd', gross: 100000, net: 85000, tax: 6200, pf: 7200, pt: 200, esi: 0, other: 1400, fileName: '', addedAt: iso(new Date(m.getFullYear(), m.getMonth() + 1, 0)) }; });
  s.settings = JSON.parse(JSON.stringify(state.settings));
  s.settings.cashOnHand = 40000;
  s.settings.roundUp = { enabled: true, to: 100, goalId: s.goals[2].id };
  s.student = {
    allowance: 12000,
    arrivalDay: 1,
    living: 'hostel',
    partTimeAmount: 3000,
    partTimeHours: 10,
    semester: {
      start: iso(F.addMonths(t, -2)).slice(0, 7) + '-01',
      end: iso(F.addMonths(t, 3)).slice(0, 7) + '-01',
      heavyMonths: [
        { id: uid(), month: iso(F.addMonths(t, 1)).slice(0, 7), name: 'Semester Exam & Tech Fest', amount: 8000 },
        { id: uid(), month: iso(F.addMonths(t, 3)).slice(0, 7), name: 'Next Semester Registration', amount: 25000 }
      ]
    }
  };
  s.meta = { startedAt: iso(F.addDays(t, -45)), tourDone: state.meta.tourDone };
  sampleMore(s, t);
  s.meta.isSample = true;   // shows the "Remove sample data" banner on Home
  linkSampleRecurring(s, t);
  s.yearlyBills = [{ id: uid(), name: 'Car insurance', amount: 18000, due: iso(F.addMonths(t, 4)) }, { id: uid(), name: 'Domain and hosting', amount: 4800, due: iso(F.addMonths(t, 7)) }];
  s.subscriptions.forEach((x, i) => {   // a couple of months of "did you use it?" answers
    const p = prevYM(iso(t).slice(0, 7)), p2 = prevYM(p);
    x.since = ''; x.kept = '';
    x.usage = x.name === 'Gym' ? { [p2]: false, [p]: false } : x.name === 'iCloud+' ? { [p2]: true, [p]: true } : { [p2]: true };
  });
  return localizeSample(s);
}

/** A believable month of spending: all of last month, and this month up to today. */
function sampleSpending(s, t) {
  const cat = re => s.budget.categories.find(c => re.test(c.name));
  const plan = [
    [/rent/i, [[1, 22000, 'Rent', 'rent']]],
    [/food/i, [[2, 1850, 'Groceries'], [6, 640, 'Dinner out'], [9, 2100, 'Groceries'], [13, 420, 'Lunch with the team'], [16, 1900, 'Groceries'], [19, 780, 'Takeout'], [23, 2050, 'Groceries'], [27, 560, 'Café']]],
    [/transport/i, [[3, 600, 'Metro card'], [8, 500, 'Fuel'], [11, 400, 'Cab'], [18, 350, 'Cab'], [24, 600, 'Metro card'], [28, 320, 'Cab']]],
    [/^bills/i, [[7, 999, 'Internet'], [10, 2150, 'Electricity'], [15, 499, 'Phone bill'], [21, 900, 'Water and gas']]],
    [/loan|debt/i, [[3, 8000, 'Personal loan payment'], [5, 2900, 'Bike loan EMI', 'bike'], [20, 6100, 'Credit card payment']]],
    [/subscri/i, [[12, 649, 'Netflix', 'netflix'], [18, 119, 'Spotify'], [22, 75, 'iCloud+']]],
    [/fun/i, [[4, 450, 'Bowling'], [14, 1200, 'Movie night'], [17, 900, 'Concert'], [26, 1500, 'Weekend away']]],
    [/saving/i, [[1, 12750, 'Moved to savings']]]
  ];
  const prevFirst = new Date(t.getFullYear(), t.getMonth() - 1, 1), thisFirst = new Date(t.getFullYear(), t.getMonth(), 1);
  const out = [];
  [[prevFirst, 1.04], [thisFirst, 1]].forEach(([first, f], mi) => {
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    plan.forEach(([re, items]) => {
      const c = cat(re); if (!c) return;
      items.forEach(([day, amount, note, rec], k) => {
        const d = new Date(first.getFullYear(), first.getMonth(), Math.min(day, dim));
        if (d > t) return;
        const treat = mi === 1 && /takeout|café|dinner|movie/i.test(note) ? 1.7 : 1;   // this month: more eating out, so "Where did it go?" has a story
        const amt = rec || /saving|loan|debt/i.test(c.name) ? amount : Math.round(amount * (mi === 0 ? f + ((k % 3) - 1) * 0.06 : treat) / 10) * 10;
        out.push({ id: uid(), date: F.toISO(d), categoryId: c.id, amount: amt, note, rec: rec || '' });
      });
    });
  });
  s.budget.expenses = out.sort((a, b) => a.date.localeCompare(b.date));
}
/** Point the sample's recurring payments at the expenses they "posted", and file last month from the log. */
function linkSampleRecurring(s, t) {
  const byKey = { rent: /^rent$/i, bike: /bike/i, netflix: /netflix/i };
  s.budget.expenses.forEach(x => {
    if (!x.rec) { delete x.rec; return; }
    const r = s.recurring.find(k => byKey[x.rec].test(k.name));
    if (r) { x.recurringId = r.id; x.note = `🔁 ${r.name}`; }
    delete x.rec;
  });
  const prev = F.toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);
  const h = s.history.find(k => k.month === prev);
  if (h) h.cats.forEach(hc => {
    const c = s.budget.categories.find(k => k.name === hc.name);
    if (c) hc.actual = sum(s.budget.expenses.filter(x => x.categoryId === c.id && x.date.slice(0, 7) === prev), x => x.amount);
  });
  const buckets = s.split.buckets;
  s.budget.categories.forEach(c => { c.bucketId = guessBucket(c, buckets); });
  s.meta.periodStart = F.toISO(t).slice(0, 7) + '-01'; s.meta.closedEarly = '';
}

function hasAnyData() {
  return state.income.configured || state.debts.length > 0 || state.gifts.length > 0 || state.goals.length > 0 || state.subscriptions.length > 0 || state.payslips.length > 0 ||
    Object.values(state.wallet).some(v => Array.isArray(v) && v.length > 0) ||
    state.budget.categories.some(c => c.planned > 0 || c.actual > 0);
}

/* =========================================================
   DERIVED VALUES (read state, return numbers)
   ========================================================= */
function paycheckNet() {
  const inc = state.income;
  return inc.mode === 'gross' ? Math.max(0, F.netFromGross(inc.gross, inc.deductions).net) : inc.net;
}
function computedMonthlyIncome() {
  const inc = state.income;
  if (inc.irregular) return irregularInfo().amount + sum(inc.others, o => F.toMonthly(o.amount, o.freq));
  return F.toMonthly(paycheckNet(), inc.freq) + sum(inc.others, o => F.toMonthly(o.amount, o.freq));
}
/** Income that changes month to month: budget from what came in last month. */
function irregularInfo() {
  const ym = todayISO().slice(0, 7), log = state.incomeLog || [];
  const inMonth = m => sum(log.filter(x => x.date.slice(0, 7) === m), x => x.amount);
  const last = prevYM(ym), lastAmt = inMonth(last), thisMonth = inMonth(ym);
  if (lastAmt > 0) return { basis: 'last', month: last, amount: lastAmt, thisMonth };
  const months = [prevYM(last), prevYM(prevYM(last))].map(inMonth).filter(v => v > 0);
  if (months.length) return { basis: 'avg', month: '', amount: sum(months, v => v) / months.length, thisMonth };
  return { basis: 'typical', month: '', amount: state.income.mode === 'gross' ? Math.max(0, F.netFromGross(state.income.gross, state.income.deductions).net) : state.income.net, thisMonth };
}
function irregularLine() {
  const r = irregularInfo();
  return r.basis === 'last' ? `Budgeting from ${FULL_MONTHS[+r.month.slice(5) - 1]}’s income` : r.basis === 'avg' ? 'Budgeting from your recent average' : 'Budgeting from a typical month until you log some income';
}
function monthlyIncome() {
  const o = state.budget.incomeOverride;
  return o !== null && Number.isFinite(o) ? o : computedMonthlyIncome();
}
function nextPayInfo() {
  if (state.income.irregular) return null;
  const anchor = F.parseDate(state.income.nextPayDate);
  if (!anchor) return null;
  const t = todayDate();
  const d = F.nextPayday(anchor, state.income.freq, t);
  return { date: d, days: F.daysBetween(t, d) };
}
function splitSummary() {
  const irr = state.income.irregular;
  const base = irr ? irregularInfo().amount : paycheckNet();
  const factor = irr ? 1 : F.PAY_FREQUENCIES[state.income.freq] || 1;
  const rows = state.split.buckets.map(b => {
    const amount = b.mode === 'percent' ? base * b.value / 100 : b.value;
    return Object.assign({}, b, { amount, monthly: amount * factor });
  });
  const assigned = sum(rows, r => r.amount);
  return { base, factor, rows, assigned, diff: base - assigned };
}
function bucketMonthly(role) { return sum(splitSummary().rows.filter(r => r.role === role), r => r.monthly); }

function debtPlan(strategy) { return F.simulatePayoff(state.debts, state.debtSettings.extra, strategy); }
function currentDebtPlan() { return debtPlan(state.debtSettings.strategy); }

/** This budget period: from the 1st (or the day you closed the last month early) to the end of this month. */
function periodRange() {
  const t = todayISO(), first = t.slice(0, 7) + '-01';
  const ps = state.meta.periodStart && state.meta.periodStart <= t && state.meta.periodStart >= prevYM(t.slice(0, 7)) + '-01' ? state.meta.periodStart : first;
  return { from: ps, to: F.toISO(new Date(+t.slice(0, 4), +t.slice(5, 7), 0)) };
}
/** What each category has spent between two dates, from the expense log. */
function spentByCategory(from, to) {
  const out = {};
  for (const x of state.budget.expenses) if (x.date >= from && x.date <= to) out[x.categoryId] = (out[x.categoryId] || 0) + x.amount;
  return out;
}
/** "Actual" is always worked out from logged expenses, never typed in. */
function syncActuals() {
  if (!state || !state.budget) return;
  const r = periodRange(), m = spentByCategory(r.from, r.to);
  state.budget.categories.forEach(c => { c.actual = Math.round((m[c.id] || 0) * 100) / 100; });
}
function budgetTotals() {
  const cats = state.budget.categories;
  const income = monthlyIncome();
  const planned = sum(cats, c => c.planned), actual = sum(cats, c => c.actual);
  const byType = {};
  for (const [t] of CAT_TYPES) {
    byType[t] = { planned: sum(cats.filter(c => c.type === t), c => c.planned), actual: sum(cats.filter(c => c.type === t), c => c.actual) };
  }
  return { income, planned, actual, remaining: income - actual, unplanned: income - planned, byType };
}

function giftLabel(g) { return g.occasion === 'Custom' ? (g.customOccasion || 'Custom') : g.occasion; }
function giftList() {
  const t = todayDate();
  return state.gifts.map(g => {
    const d = F.parseDate(g.date) || t;
    const eff = F.nextAnnualOccurrence(d, t);
    return Object.assign({}, g, { eff, days: F.daysBetween(t, eff), label: giftLabel(g) });
  }).sort((a, b) => a.eff - b.eff || a.name.localeCompare(b.name));
}

function goalInfo(g) {
  const t = todayDate();
  const dl = F.parseDate(g.deadline);
  const monthsLeft = dl ? F.monthsBetween(t, dl) : 0;
  const reached = g.target > 0 && g.saved >= g.target;
  const required = reached ? 0 : (monthsLeft > 0 ? F.requiredMonthlySaving(g.target, g.saved, g.rate, monthsLeft) : NaN);
  const pct = g.target > 0 ? clamp(g.saved / g.target * 100, 0, 100) : 0;
  let reverse = null;
  if (g.planMonthly !== null && !reached) {
    const n = F.monthsToReachGoal(g.target, g.saved, g.rate, g.planMonthly);
    reverse = { months: n, date: Number.isFinite(n) && n <= 1200 ? F.addMonths(t, n) : null };
  }
  return { dl, monthsLeft, reached, required, pct, remaining: Math.max(0, g.target - g.saved), reverse };
}

/* ---------- Student finance helpers ---------- */
function studentSafeToSpend() {
  const inc = monthlyIncome();
  const b = budgetTotals();
  const next = nextPayInfo();
  const t = todayDate();
  const until = next && next.d ? F.toISO(next.d) : F.toISO(F.addDays(t, Math.max(1, F.daysLeftInMonth(t))));
  const after = F.toISO(t);
  let upcoming = 0;
  (state.recurring || []).filter(r => r.active).forEach(r => {
    const dues = F.recurringDue(r, after, until);
    upcoming += dues.length * r.amount;
  });
  (state.yearlyBills || []).forEach(y => {
    if (y.due > after && y.due <= until) upcoming += y.amount;
  });
  const daysLeft = next ? Math.max(1, next.days) : Math.max(1, F.daysLeftInMonth(t));
  const currentBal = (inc > 0 ? (inc - b.actual) : Math.max(0, (state.settings.cashOnHand || 0) - b.actual));
  const allowance = (state.student && state.student.allowance) || inc;
  return F.safeToSpend({ balance: currentBal, upcomingBills: upcoming, daysLeft, monthlyAllowance: allowance });
}

function categoryDailyAverages(daysBack = 30) {
  const t = todayDate();
  const cutoff = F.toISO(F.addDays(t, -daysBack));
  const exps = (state.budget.expenses || []).filter(x => x.date >= cutoff && !x.recurringId);
  const byCat = {};
  exps.forEach(x => {
    const c = state.budget.categories.find(k => k.id === x.categoryId);
    const name = c ? c.name : 'Other';
    byCat[name] = (byCat[name] || 0) + x.amount;
  });
  const first = exps.map(x => x.date).sort()[0];
  const actualDays = first ? Math.max(1, F.daysBetween(F.parseDate(first), t) + 1) : Math.min(daysBack, Math.max(1, t.getDate()));
  const out = {};
  for (const [k, v] of Object.entries(byCat)) {
    out[k] = v / actualDays;
  }
  if (!Object.keys(out).length) {
    state.budget.categories.forEach(c => {
      if (c.planned > 0) out[c.name] = c.planned / 30;
    });
  }
  return out;
}

function studentRunOutForecast(sliderAdjustments = {}) {
  const next = nextPayInfo();
  const daysLeft = next ? Math.max(1, next.days) : Math.max(1, F.daysLeftInMonth(todayDate()));
  const dailyAvgs = categoryDailyAverages(30);
  const inc = monthlyIncome();
  const b = budgetTotals();
  const currentBal = Math.max(0, inc > 0 ? (inc - b.actual) : (state.settings.cashOnHand || 0) - b.actual);
  return F.forecastRunOut({
    currentBalance: currentBal,
    daysLeft,
    dailySpendByCategory: dailyAvgs,
    sliderAdjustments,
    startDate: todayISO()
  });
}

function studentSemesterPlan() {
  const sem = (state.student && state.student.semester) || {};
  const t = todayDate();
  const start = sem.start || todayISO().slice(0, 7) + '-01';
  const end = sem.end || F.toISO(F.addMonths(t, 4));
  const inc = monthlyIncome();
  const b = budgetTotals();
  const monthlyBase = b.planned > 0 ? b.planned : (inc > 0 ? inc * 0.8 : 8000);
  const saved = sum(state.goals, g => g.saved);
  return F.semesterPlan({
    start,
    end,
    monthlyIncome: inc,
    monthlyBaseExpenses: monthlyBase,
    heavyMonths: sem.heavyMonths || [],
    currentSaved: saved
  });
}

/**
 * Returns net running balances grouped per person from all open IOUs.
 * @returns {Array<{ person: string, owedToMe: number, iOwe: number, net: number, dir: 'owed'|'owe', absNet: number, count: number, ious: Array, upiId: string }>}
 */
function personBalances() {
  const open = (state.wallet.ious || []).filter(x => !x.settled);
  const map = {};
  open.forEach(x => {
    const key = (x.person || '').trim();
    if (!key) return;
    if (!map[key]) {
      map[key] = {
        person: key,
        owedToMe: 0,
        iOwe: 0,
        net: 0,
        count: 0,
        ious: [],
        upiId: (state.wallet.upiIds && state.wallet.upiIds[key]) || ''
      };
    }
    if (x.dir === 'owed') {
      map[key].owedToMe += x.amount;
    } else {
      map[key].iOwe += x.amount;
    }
    map[key].count++;
    map[key].ious.push(x);
  });

  const list = Object.values(map).map(p => {
    p.net = Math.round((p.owedToMe - p.iOwe) * 100) / 100;
    p.dir = p.net >= 0 ? 'owed' : 'owe';
    p.absNet = Math.abs(p.net);
    return p;
  });

  return list.sort((a, b) => b.absNet - a.absNet);
}

/**
 * Returns a list of all distinct contact names known from past and current IOUs.
 * @returns {string[]}
 */
function allKnownPeople() {
  const names = new Set();
  (state.wallet.ious || []).forEach(x => {
    if (x.person && x.person.trim()) names.add(x.person.trim());
  });
  if (state.wallet.upiIds) {
    Object.keys(state.wallet.upiIds).forEach(n => {
      if (n && n.trim()) names.add(n.trim());
    });
  }
  return Array.from(names).sort();
}


