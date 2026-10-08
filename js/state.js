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
    settings: { theme: 'yoko', sound: true, workHours: 176, unit: { name: 'chai', plural: 'chais', emoji: '☕', price: 20 }, cashOnHand: 0, roundUp: { enabled: false, to: roundUpFor(ci.currency), goalId: null }, privacy: false, roast: 'nice', petName: 'Yoko', country: ci.code, myUpiId: '' },
    badges: {},
    meta: { startedAt: todayISO(), tourDone: false, budgetMonth: todayISO().slice(0, 7), periodStart: todayISO().slice(0, 7) + '-01', closedEarly: '', lastBackup: '', backupSnooze: '', skippedTotal: 0, streakRewarded: 0, xpDay: { date: '', n: 0 }, xpBackup: '', tourVersion: 0, tourChapters: {} },
    wallet: { cash: [], ious: [], transport: [], taxes: [], deadlines: [], taxYearStart: ci.fy, taxEstimate: 0, upiIds: {} },
    payslips: [],
    student: { allowance: 0, arrivalDay: 1, living: 'hostel', partTimeAmount: 0, partTimeHours: 0, semester: { start: '', end: '', heavyMonths: [] } },
    recurring: [], history: [], rules: [], wishlist: [], challenges: [], xp: { total: 0 }, yearlyBills: [], incomeLog: [],
    groups: [], groupData: {}
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
    roundUp: { enabled: false, to: ROUND_TO.includes(+ru.to) ? +ru.to : roundUpFor(s.currency), goalId: str(ru.goalId, null) }
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
  s.settings.roast = 'off';
  s.settings.petName = str(rs.petName, 'Yoko', 20);
  s.settings.myUpiId = str(rs.myUpiId, '', 60);   // the student's own UPI ID, for 'they owe you' QR codes
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
  // budget alerts already sent (kept for this month and last, so they don't repeat on every open)
  s.meta.nudges = {};
  const nowD = todayDate(), keepYm = [F.toISO(nowD).slice(0, 7), F.toISO(new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1)).slice(0, 7)];
  if (rm.nudges && typeof rm.nudges === 'object') for (const [k, v] of Object.entries(rm.nudges)) {
    if (typeof k === 'string' && k.length < 80 && keepYm.some(m => k.includes(m)) && (v === true || typeof v === 'string')) s.meta.nudges[k] = v;
  }
  s.meta.notifPromptDismissed = rm.notifPromptDismissed === true;
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
  s.groups = arr(raw.groups).map(g => ({
    id: str(g.id), name: str(g.name, 'Group', 80), joinCode: str(g.joinCode), myMemberId: str(g.myMemberId)
  })).filter(g => g.id && g.joinCode);
  s.groupData = raw.groupData && typeof raw.groupData === 'object' ? raw.groupData : {};
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
/** Sample data with dates relative to today, so it always looks current. */
function sampleState() {
  const t = todayDate();
  const iso = d => F.toISO(d);
  const s = defaultState();
  s.currency = 'INR';
  s.settings.country = 'IN';
  
  // 2nd-year engineering student living in hostel
  s.student = {
    allowance: 12000,
    arrivalDay: 5,
    living: 'hostel',
    partTimeAmount: 4000,
    partTimeHours: 8,
    semester: {
      start: iso(F.addMonths(t, -2)).slice(0, 7) + '-01',
      end: iso(F.addMonths(t, 4)).slice(0, 7) + '-01',
      heavyMonths: [
        { id: uid(), month: iso(F.addMonths(t, 1)).slice(0, 7), name: 'Tech Fest & Project Supplies', amount: 5000 },
        { id: uid(), month: iso(F.addMonths(t, 3)).slice(0, 7), name: 'Semester Exam Fees', amount: 8000 }
      ]
    }
  };
  
  const anchorPay = new Date(t.getFullYear(), t.getMonth(), 5);
  // ₹12,000 allowance + ₹4,000 tutoring, both in by the 5th: split as one ₹16,000 month so the buckets add up
  s.income = {
    mode: 'net', net: 16000, gross: 0, deductions: defaultDeductions(), freq: 'monthly',
    nextPayDate: iso(anchorPay > t ? anchorPay : F.addMonths(anchorPay, 1)),
    others: [],
    configured: true
  };
  
  const B = (role, name, mode, value) => ({ id: uid(), role, name, mode, value });
  s.split.buckets = [
    B('bills', 'Hostel & Mess', 'amount', 5300),
    B('spending', 'Daily Spending', 'amount', 6500),
    B('goals', 'Trip & Savings', 'amount', 3000),
    B('custom', 'Study & Tech', 'amount', 1200)
  ];
  const [bkHostel, bkDaily, bkTrip, bkStudy] = s.split.buckets;
  
  const C = (name, type, planned, actual) => ({ id: uid(), name, type, planned, actual });
  const catMess = C('Hostel & Mess', 'needs', 4500, 0);
  const catStudy = C('Study & Books', 'needs', 1200, 0);
  const catTrans = C('Transport & Metro', 'needs', 1000, 0);
  const catWifi = C('Phone & WiFi', 'needs', 800, 0);
  const catZomato = C('Food delivery & Zomato', 'wants', 2000, 0); // Frozen category!
  const catChai = C('Chai & Canteen', 'wants', 1200, 0);
  const catFun = C('Outings & Movies', 'wants', 1500, 0);
  const catSubs = C('Subscriptions', 'wants', 800, 0);
  const catSave = C('Semester Trip Fund', 'savings', 2000, 0);
  
  s.budget.categories = [catMess, catStudy, catTrans, catWifi, catZomato, catChai, catFun, catSubs, catSave];
  [[catMess, bkHostel], [catWifi, bkHostel], [catStudy, bkStudy], [catTrans, bkDaily], [catZomato, bkDaily], [catChai, bkDaily], [catFun, bkDaily], [catSubs, bkDaily], [catSave, bkTrip]]
    .forEach(([c, b]) => { c.bucketId = b.id; });
  
  // Active Category Freeze on Food delivery & Zomato (Day 4 of 7, 3 days left)
  s.challenges = [
    { id: uid(), type: 'nocat', start: iso(F.addDays(t, -3)), days: 7, categoryId: catZomato.id, cap: 0, unit: 10, deposits: [], rewarded: false, failed: false }
  ];
  
  const goal = (name, target, saved, months, rate, contributions) => ({ id: uid(), name, target, saved, deadline: iso(F.addMonths(t, months)), rate, planMonthly: null, contributions });
  s.goals = [
    goal('Goa Semester Trip', 15000, 6500, 4, 0, [{ id: uid(), date: iso(F.addMonths(t, -1)), amount: 3500, note: 'Saved from allowance' }, { id: uid(), date: iso(F.addDays(t, -10)), amount: 3000, note: 'Tutoring income' }]),
    goal('Mechanical Keyboard', 8000, 3200, 3, 0, [{ id: uid(), date: iso(F.addDays(t, -15)), amount: 3200, note: 'Project stipend' }])
  ];
  
  s.subscriptions = [
    { id: uid(), name: 'Netflix', amount: 649, cycle: 'monthly' },
    { id: uid(), name: 'Spotify', amount: 119, cycle: 'monthly' },
    { id: uid(), name: 'Gym', amount: 1500, cycle: 'monthly' }
  ];
  
  // Wallet sample with 2 Roommates (Rahul & Aarav) and UPI IDs
  const ago = n => iso(F.addDays(t, -n)), ahead = n => iso(F.addDays(t, n));
  s.wallet.cash = [
    { id: uid(), date: ago(15), type: 'in', amount: 2000, note: 'ATM withdrawal', expenseId: null },
    { id: uid(), date: ago(12), type: 'out', amount: 80, note: 'Chai & samosa', expenseId: null },
    { id: uid(), date: ago(6), type: 'out', amount: 120, note: 'Canteen lunch', expenseId: null }
  ];
  s.wallet.ious = [
    { id: uid(), person: 'Rahul', dir: 'owed', amount: 450, date: ago(3), due: ahead(5), note: 'WiFi & Pizza split', settled: false, settledAt: '', upiId: 'rahul.verma@okaxis' },
    { id: uid(), person: 'Aarav', dir: 'owe', amount: 320, date: ago(2), due: ahead(4), note: 'Mess groceries split', settled: false, settledAt: '', upiId: 'aarav.patel@okhdfcbank' }
  ];
  s.wallet.upiIds = { Rahul: 'rahul.verma@okaxis', Aarav: 'aarav.patel@okhdfcbank' };   // what Settle up reads
  
  const T = (daysAgo, mode, amount, note, km = null) => ({ id: uid(), date: ago(daysAgo), mode, amount, note, km, expenseId: null });
  s.wallet.transport = [
    T(20, 'metro', 50, 'Campus to City Center'),
    T(14, 'auto', 120, 'Railway Station'),
    T(8, 'metro', 50, 'Library run'),
    T(2, 'cab', 180, 'Late night hostel return')
  ];
  
  s.settings = JSON.parse(JSON.stringify(state.settings));
  s.settings.cashOnHand = 8500;
  s.settings.roundUp = { enabled: false, to: 50, goalId: null };
  s.meta = { startedAt: iso(F.addDays(t, -45)), tourDone: state.meta.tourDone, isSample: true };

  // Student debts: education loan, phone on EMI, and money borrowed from family
  const thisMonth = iso(t).slice(0, 7) + '-0' + Math.min(5, Math.max(1, t.getDate()));
  s.debts = [
    { id: uid(), name: 'Education loan', kind: 'student', balance: 85000, startBalance: 100000, rate: 9.5, minPayment: 1500, defeatedAt: '',
      payments: [{ id: uid(), date: iso(F.addMonths(t, -2)).slice(0, 8) + '05', amount: 1500 }, { id: uid(), date: iso(F.addMonths(t, -1)).slice(0, 8) + '05', amount: 1500 }] },
    { id: uid(), name: 'Phone EMI', kind: 'bnpl', balance: 9600, startBalance: 16000, rate: 15, minPayment: 1600, defeatedAt: '',
      payments: [{ id: uid(), date: thisMonth, amount: 1600 }] },
    { id: uid(), name: 'Borrowed from Dad', kind: 'family', balance: 4000, startBalance: 5000, rate: 0, minPayment: 500, defeatedAt: '',
      payments: [{ id: uid(), date: iso(F.addMonths(t, -1)).slice(0, 8) + '10', amount: 1000 }] }
  ];
  s.debtSettings = { extra: 500, strategy: 'avalanche' };
  s.emi = { principal: 60000, rate: 11, months: 24 };
  
  sampleSpending(s, t);
  linkSampleRecurring(s, t);
  
  s.subscriptions.forEach((x) => {
    const p = prevYM(iso(t).slice(0, 7)), p2 = prevYM(p);
    x.since = ''; x.kept = '';
    x.usage = x.name === 'Gym' ? { [p2]: false, [p]: false } : { [p2]: true, [p]: true };
  });
  
  return localizeSample(s);
}

/** A believable month of student spending: last month and this month up to today. */
function sampleSpending(s, t) {
  const cat = re => s.budget.categories.find(c => re.test(c.name));
  const plan = [
    [/mess/i, [[1, 4500, 'Hostel Mess Fee', 'mess']]],
    [/study|book/i, [[4, 450, 'Notebooks & Engineering Textbooks'], [18, 250, 'Lab Record & Xerox']]],
    [/trans/i, [[3, 200, 'Metro Smart Card Recharge'], [12, 120, 'Auto to Exam Center'], [22, 180, 'Cab to Station']]],
    [/wifi|phone/i, [[6, 299, 'Jio Mobile Plan'], [15, 399, 'Hostel WiFi Contribution']]],
    [/delivery|zomato/i, [[2, 380, 'Zomato Biryani Night'], [7, 240, 'Swiggy Snack Order']]],
    [/chai|canteen/i, [[2, 40, 'Canteen Chai & Bun'], [5, 120, 'Maggie & Cold Coffee'], [9, 60, 'Chai Point with Rahul'], [14, 110, 'Canteen Lunch with Aarav'], [20, 80, 'Evening Snacks'], [25, 60, 'Chai']]],
    [/outing|movie/i, [[10, 450, 'Weekend Movie at PVR'], [21, 600, 'Dinner out with Roommates']]],
    [/subscri/i, [[12, 649, 'Netflix', 'netflix'], [18, 119, 'Spotify']]],
    [/trip|save/i, [[5, 1000, 'Moved to Goa Trip Fund']]]
  ];
  const prevFirst = new Date(t.getFullYear(), t.getMonth() - 1, 1), thisFirst = new Date(t.getFullYear(), t.getMonth(), 1);
  const out = [];
  [[prevFirst, 1], [thisFirst, 1]].forEach(([first], mi) => {
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    plan.forEach(([re, items]) => {
      const c = cat(re); if (!c) return;
      items.forEach(([day, amount, note, rec]) => {
        const d = new Date(first.getFullYear(), first.getMonth(), Math.min(day, dim));
        if (d > t) return;
        // Keep frozen category inactive in recent 3 days of this month so freeze remains intact
        if (mi === 1 && /delivery|zomato/i.test(c.name) && F.daysBetween(d, t) <= 3) return;
        out.push({ id: uid(), date: F.toISO(d), categoryId: c.id, amount, note, rec: rec || '' });
      });
    });
  });
  s.budget.expenses = out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Point the sample's recurring payments at the expenses they "posted". */
function linkSampleRecurring(s, t) {
  const byKey = { mess: /mess/i, netflix: /netflix/i };
  s.budget.expenses.forEach(x => {
    if (!x.rec) { delete x.rec; return; }
    const r = s.recurring.find(k => byKey[x.rec] && byKey[x.rec].test(k.name));
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
  s.budget.categories.forEach(c => { if (!buckets.some(b => b.id === c.bucketId)) c.bucketId = guessBucket(c, buckets); });
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
/** The usual monthly amount from setup (allowance + other regular income), before anything logged. */
function baseMonthlyIncome() {
  const inc = state.income;
  return F.toMonthly(paycheckNet(), inc.irregular ? 'monthly' : inc.freq) + sum(inc.others, o => F.toMonthly(o.amount, o.freq));
}
/** Income logged this calendar month (Income received). */
function loggedThisMonth() {
  const ym = todayISO().slice(0, 7);
  return sum((state.incomeLog || []).filter(x => x.date.slice(0, 7) === ym), x => x.amount);
}
function computedMonthlyIncome() {
  const inc = state.income, others = sum(inc.others, o => F.toMonthly(o.amount, o.freq));
  // Your usual monthly amount, plus anything logged as Income received this month on top of it
  return baseMonthlyIncome() + loggedThisMonth();
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
  return `Your usual ${fmt(baseMonthlyIncome())}${r.thisMonth > 0 ? ` + ${fmt(r.thisMonth)} logged this month` : ''}`;
  return r.basis === 'last' ? `Budgeting from ${FULL_MONTHS[+r.month.slice(5) - 1]}’s income` : r.basis === 'avg' ? 'Budgeting from your recent average' : (r.thisMonth > 0 ? 'Using your usual month until this month’s income passes it' : 'Budgeting from a typical month until you log some income');
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
/**
 * Money left from the current allowance, and how many days it has to last.
 * Counts spending since the last payday, so an allowance on the 5th isn't counted before it arrives
 * (with the allowance on the 1st this is the same as the calendar month).
 */
function allowanceLeft() {
  const inc = monthlyIncome(), b = budgetTotals(), t = todayDate(), today = F.toISO(t);
  const next = nextPayInfo();
  const p = inc > 0 && !state.income.irregular && state.income.freq === 'monthly' ? F.payPeriod(state.income.nextPayDate, 'monthly', t) : null;
  if (p) {
    const spent = sum(state.budget.expenses.filter(x => x.date >= p.start && x.date <= today), x => x.amount);
    return { balance: inc - spent, spent, income: inc, daysLeft: p.daysLeft, start: p.start, end: p.end, byPayday: true };
  }
  const daysLeft = next ? Math.max(1, next.days) : Math.max(1, F.daysLeftInMonth(t));
  const end = next ? F.toISO(next.date) : F.toISO(F.addDays(t, daysLeft));
  const balance = inc > 0 ? inc - b.actual : Math.max(0, (state.settings.cashOnHand || 0) - b.actual);
  return { balance, spent: b.actual, income: inc, daysLeft, start: today.slice(0, 7) + '-01', end, byPayday: false };
}
function studentSafeToSpend() {
  const al = allowanceLeft();
  const t = todayDate();
  const until = al.end;
  const after = F.toISO(t);
  let upcoming = 0;
  (state.recurring || []).filter(r => r.active).forEach(r => {
    const dues = F.recurringDue(r, after, until);
    upcoming += dues.length * r.amount;
  });
  (state.yearlyBills || []).forEach(y => {
    if (y.due > after && y.due <= until) upcoming += y.amount;
  });
  // Debt minimums still unpaid this period
  let debtDue = 0;
  (state.debts || []).filter(d => d.balance > 0 && d.minPayment > 0).forEach(d => {
    const paid = sum((d.payments || []).filter(x => x.date >= al.start && x.date <= after), x => x.amount);
    debtDue += Math.min(d.balance, Math.max(0, d.minPayment - paid));
  });
  // Today's daily limit is fixed at the start of the day; spending today comes out of it
  const spentToday = sum(state.budget.expenses.filter(x => x.date === after), x => x.amount);
  const allowance = (state.student && state.student.allowance) || al.income;
  const r = F.safeToSpend({ balance: al.balance + spentToday, upcomingBills: upcoming + debtDue, daysLeft: al.daysLeft, monthlyAllowance: allowance });
  r.upcomingBills = upcoming; r.debtDue = debtDue; r.spentToday = spentToday;
  r.balanceNow = al.balance;
  r.dailyLimit = Math.max(0, r.perDay);
  r.leftToday = Math.max(0, r.perDay - spentToday);
  r.overToday = Math.max(0, spentToday - r.perDay);
  return r;
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
  const al = allowanceLeft();
  const dailyAvgs = categoryDailyAverages(30);
  return F.forecastRunOut({
    currentBalance: Math.max(0, al.balance),
    daysLeft: al.daysLeft,
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
    if (!map[key].upiId && typeof x.upiId === 'string') map[key].upiId = x.upiId;
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


