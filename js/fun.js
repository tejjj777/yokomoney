/* YOKO! Student · Fun layer: feels-like, badges, confetti, money actions, cards, Money Wrapped, command palette, preferences, theme.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   FUN LAYER
   Real-terms pricing, daily allowance, runway, streaks, boss
   fights, subscriptions, badges, sounds, confetti, what-if,
   Money Wrapped, command palette and dark mode.
   ========================================================= */
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`;
function shortNum(n) {
  if (n < 10) return n.toFixed(1).replace(/\.0$/, '');
  return Math.round(n).toLocaleString(CURRENCIES[state.currency].locale);
}

/* ---------- "Feels like": prices as hours of work ---------- */
function hourlyRate() {
  if (state.student && state.student.partTimeAmount > 0 && state.student.partTimeHours > 0) {
    const monthlyHours = state.student.partTimeHours * (52 / 12);
    return monthlyHours > 0 ? state.student.partTimeAmount / monthlyHours : 0;
  }
  const inc = monthlyIncome(), h = state.settings.workHours;
  return inc > 0 && h > 0 ? inc / h : 0;
}
function fmtHours(amount) {
  if (state.settings && state.settings.showHoursOfWork === false) return null;
  const rate = hourlyRate();
  if (!(rate > 0) || !(amount > 0)) return null;
  const h = amount / rate;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min of work`;
  if (h < 40) { const n = shortNum(h); return `${n} ${String(n) === '1' ? 'hr' : 'hrs'} of work`; }
  return `${shortNum(h / 8)} workdays`;
}
function feelsParts(amount) {
  const parts = [];
  const h = fmtHours(amount); if (h) parts.push(['⏱️', h]);
  return parts;
}
function feelsLike(amount) {
  return feelsParts(amount).map(([e, t]) => `<span class="feels"><span aria-hidden="true">${esc(e)}</span>${esc(t)}</span>`).join('');
}
function feelsLikeText(amount) { return feelsParts(amount).map(([e, t]) => `${e} ${t}`).join(' · '); }

/* ---------- Allowance, runway, streaks, subscriptions ---------- */
function dailyAllowance() {
  if (allowanceLeft().byPayday) {   // same number as safe-to-spend on Home
    const s = studentSafeToSpend();
    return { perDay: s.perDay, daysLeft: s.daysLeft, over: s.available < 0, byPayday: true };
  }
  const b = budgetTotals();
  const daysLeft = F.daysLeftInMonth(todayDate());
  return { perDay: Math.max(0, b.remaining) / daysLeft, daysLeft, over: b.remaining < 0 };
}
/** Months your savings would last: (goal savings + cash) ÷ monthly needs & wants. */
function runwayInfo() {
  const cats = state.budget.categories.filter(c => c.type !== 'savings');
  let burn = sum(cats, c => c.planned);
  if (!(burn > 0)) burn = sum(cats, c => c.actual);
  if (!(burn > 0)) burn = sum(state.debts.filter(d => d.balance > 0), d => d.minPayment);
  const cash = sum(state.goals, g => g.saved) + state.settings.cashOnHand + Math.max(0, cashBalance());
  return { cash, burn, months: burn > 0 ? cash / burn : null };
}
function streakInfo() {
  const t = todayDate();
  const wants = new Set(state.budget.categories.filter(c => c.type === 'wants').map(c => c.id));
  const spend = new Map();
  state.budget.expenses.forEach(x => { if (wants.has(x.categoryId)) spend.set(x.date, (spend.get(x.date) || 0) + x.amount); });
  let start = F.parseDate(state.meta.startedAt) || t;
  const cap = F.addDays(t, -364);
  if (start < cap) start = cap;
  return Object.assign(F.streaks(new Set(spend.keys()), start, t), { spend, start });
}
const subMonthly = x => x.cycle === 'yearly' ? x.amount / 12 : x.amount;

/* ---------- Badges ---------- */
const BADGES = [
  { id: 'first-blood', icon: '⚔️', name: 'First boss down', desc: 'Pay off a debt completely.', test: () => state.debts.some(d => d.startBalance > 0 && d.balance <= 0) },
  { id: 'debt-free', icon: '🏆', name: 'Debt-free', desc: 'Every debt you added is at zero.', test: () => state.debts.length > 0 && state.debts.every(d => d.balance <= 0) },
  { id: 'runway-3', icon: '🛟', name: '3-month runway', desc: 'Savings cover 3 months of spending.', test: () => { const r = runwayInfo(); return r.months !== null && r.months >= 3; } },
  { id: 'all-assigned', icon: '🎯', name: 'Every coin has a job', desc: 'Assign 100% of your paycheck.', test: () => { const s = splitSummary(); return s.base > 0 && Math.abs(s.diff) <= 0.5; } },
  { id: 'streak-7', icon: '🔥', name: 'Week of restraint', desc: '7 days in a row with no “want” spending.', test: () => streakInfo().longest >= 7 },
  { id: 'streak-30', icon: '🌋', name: 'Monk mode', desc: 'A 30-day no-spend streak.', test: () => streakInfo().longest >= 30 },
  { id: 'goal-reached', icon: '🥇', name: 'Goal getter', desc: 'Reach a savings goal.', test: () => state.goals.some(g => g.target > 0 && g.saved >= g.target) },
  { id: 'saver-20', icon: '🐿️', name: 'Squirrel', desc: 'Save 20% or more of your income.', test: () => { const b = budgetTotals(); const sv = b.byType.savings.actual || b.byType.savings.planned; return b.income > 0 && sv / b.income >= 0.2; } },
  { id: 'under-budget', icon: '🧘', name: 'Zen budget', desc: 'Every category at or under plan.', test: () => { const c = state.budget.categories; return monthlyIncome() > 0 && c.some(x => x.actual > 0) && c.every(x => x.actual <= x.planned + 0.005); } },
  { id: 'gift-ready', icon: '🎁', name: 'Gift-ready', desc: 'Every gift due in 30 days is bought.', test: () => { const soon = giftList().filter(g => g.days <= 30); return soon.length > 0 && soon.every(g => g.status !== 'Idea'); } },
  { id: 'vampire-hunter', icon: '🧄', name: 'Vampire hunter', desc: 'Keep subscriptions under 3% of income.', test: () => { const inc = monthlyIncome(); return state.subscriptions.length > 0 && inc > 0 && sum(state.subscriptions, subMonthly) / inc < 0.03; } },
  { id: 'wrapped', icon: '🎬', name: 'Director’s cut', desc: 'Watch your Money Wrapped.', test: () => false }
];
/** Record newly earned badges (they stay earned). Celebrates unless `silent`. */
function checkBadges(silent) {
  const fresh = [];
  for (const b of BADGES) {
    if (state.badges[b.id]) continue;
    let ok = false;
    try { ok = b.test(); } catch (e) { ok = false; }
    if (ok) { state.badges[b.id] = todayISO(); fresh.push(b); }
  }
  if (fresh.length && !silent) celebrateBadges(fresh);
  return fresh;
}
function celebrateBadges(list) {
  if (!list.length) return;
  const pet = state.settings.petName;
  toast(list.length === 1 ? `${list[0].icon} ${pet} learned a trick: ${list[0].name} · +50 XP` : `🐾 ${pet} learned ${list.length} tricks! +${list.length * 50} XP`, 3500);
  awardXP(50 * list.length, 'badge');
  confetti(); playSound('badge');
}

/* ---------- Confetti + sound ---------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const cols = (THEMES[state.settings.theme] || THEMES.yoko).chart.concat(['#FFFFFF', '#F5A524', '#34C38F']);
  const bits = Array.from({ length: 160 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4,
    r: 5 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.35
  }));
  const t0 = performance.now(), life = 2200;
  (function frame(now) {
    const el = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of bits) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, 1 - el / life);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (el < life) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
let audioCtx = null;
/** Tiny synthesized sounds (no audio files). kinds: coin, hit, fanfare, badge */
function playSound(kind) {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx, now = ctx.currentTime + 0.01;
    const notes = {
      coin: [[988, 0, 0.08], [1319, 0.08, 0.4]],
      hit: [[196, 0, 0.14], [147, 0.06, 0.2]],
      fanfare: [[523, 0, 0.13], [659, 0.13, 0.13], [784, 0.26, 0.13], [1047, 0.39, 0.55]],
      badge: [[784, 0, 0.1], [988, 0.1, 0.1], [1319, 0.2, 0.4]]
    }[kind] || [];
    for (const [f, start, dur] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === 'hit' ? 'triangle' : 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(0.05, now + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(now + start); o.stop(now + start + dur + 0.05);
    }
  } catch (e) { /* audio not available */ }
}

/* ---------- Shared money actions (used by forms and the command palette) ---------- */
function addExpense({ categoryId, amount, date, note, noRoundup }) {
  if (!state.budget.categories.some(x => x.id === categoryId) && state.budget.categories[0]) categoryId = state.budget.categories[0].id;   // e.g. "+ New category…" left unfinished
  const cat = state.budget.categories.find(x => x.id === categoryId);
  const exp = { id: uid(), date, categoryId, amount, note: note || '' };
  const ru = state.settings.roundUp;
  const goal = false && ru.enabled && !noRoundup ? state.goals.find(g => g.id === ru.goalId) : null;
  let roundup = 0;
  if (goal) {
    roundup = F.roundUpAmount(amount, ru.to);
    if (roundup > 0.004) {
      const cid = uid();
      goal.saved += roundup;
      goal.contributions.push({ id: cid, date, amount: roundup, note: `Round-up · ${cat ? cat.name : 'expense'}`, roundup: true });
      exp.roundup = { goalId: goal.id, cid, amount: roundup };
    } else roundup = 0;
  }
  state.budget.expenses.push(exp);
  flagPriceChange(exp);
  if (date < state.meta.startedAt) state.meta.startedAt = date;
  return { cat, roundup, goal, exp };
}
function expenseToast(amount, r) {
  const line = roastForExpense(amount, r.cat);
  let left = '';
  try { if (monthlyIncome() > 0) { const st = studentSafeToSpend(); left = ` · Left today ${fmtExact(st.leftToday)} · Left this period ${fmtExact(st.balanceNow)}`; } } catch (e) { left = ''; }
  toast(`Added ${fmtExact(amount)} to ${r.cat ? r.cat.name : 'budget'}${left}`, 4200);
  awardXP(5, 'expense');
  if (r.roundup) playSound('coin');
}
function addToGoal(goal, amount, date, note) {
  const wasReached = goal.target > 0 && goal.saved >= goal.target;
  goal.saved += amount;
  goal.contributions.push({ id: uid(), date, amount, note: note || '' });
  awardXP(10, 'goal', true);
  commit(); playSound('coin');
  if (!wasReached && goal.saved >= goal.target) { toast(`You hit your ${goal.name} goal!`, 4000); setTimeout(() => { confetti(); playSound('fanfare'); }, 200); }
  else toast(`${fmt(amount)} added to ${goal.name}`);
}
function logDebtPayment(d, amount, date) {
  const dealt = Math.min(amount, d.balance);
  d.balance = Math.max(0, d.balance - amount);
  d.payments.push({ id: uid(), date, amount: dealt });
  const dead = d.balance <= 0.005;
  if (dead) { d.balance = 0; d.defeatedAt = date; }
  awardXP(dead ? 100 : 15, 'debt', true);
  commit();
  if (dead) { playSound('fanfare'); confetti(); setTimeout(() => showDefeated(d), 0); }
  else { playSound('hit'); toast(`⚔️ ${fmt(dealt)} damage to ${d.name} · ${fmtPct(d.startBalance > 0 ? d.balance / d.startBalance * 100 : 0)} HP left`); }
}
function showDefeated(d) {
  openModal({
    title: 'Boss defeated!', hideSubmit: true, cancelLabel: 'Victory!',
    body: `<div class="defeat"><p class="defeat-emoji" aria-hidden="true">🏆</p>
      <p style="font-size:18px"><strong>${esc(d.name)}</strong> is paid off.</p>
      <p class="muted">You dealt ${fmt(d.startBalance)} of damage${d.payments.length ? ` across ${plural(d.payments.length, 'hit')}` : ''}.</p></div>`
  });
}
function hitForm(d) {
  formModal({
    title: `Log a payment · ${d.name}`, submitLabel: '⚔️ Deal damage', values: { date: todayISO() },
    fields: [
      { name: 'amount', label: 'Payment amount', kind: 'money', required: true, positive: true, help: 'Lowers the balance by this amount. For exact figures, edit the debt to match your statement.' },
      { name: 'date', label: 'Date', kind: 'date', required: true }
    ],
    live: v => {
      if (!(v.amount > 0)) return '';
      const left = Math.max(0, d.balance - v.amount);
      return left <= 0 ? '<div class="alert alert-success">This pays it off completely.</div>'
        : `<div class="alert alert-info">HP after this hit: <strong>${fmt(left)}</strong> (${fmtPct(left / d.startBalance * 100)})</div>`;
    },
    onSave: v => { logDebtPayment(d, v.amount, v.date); }
  });
}
function subscriptionForm(sub) {
  formModal({
    title: sub ? 'Edit subscription' : 'Add subscription', submitLabel: sub ? 'Save changes' : 'Add subscription',
    values: sub || { cycle: 'monthly' },
    fields: [
      { name: 'name', label: 'Service', kind: 'text', required: true, placeholder: 'e.g. Netflix', max: 40, wide: true },
      { name: 'amount', label: 'Price', kind: 'money', required: true, positive: true },
      { name: 'cycle', label: 'Billed', kind: 'select', options: [['monthly', 'Monthly'], ['yearly', 'Yearly']] }
    ],
    live: v => {
      if (!(v.amount > 0)) return '';
      const yr = v.cycle === 'yearly' ? v.amount : v.amount * 12;
      const fl = feelsLikeText(yr);
      return `<div class="alert alert-danger" style="flex-wrap:wrap">That’s ${fmt(yr)} a year${fl ? ` (${esc(fl)})` : ''}</div>`;
    },
    onSave: v => {
      if (sub) Object.assign(sub, v); else state.subscriptions.push(Object.assign({ id: uid(), since: todayISO(), usage: {}, kept: '' }, v));
      commit(); toast(sub ? 'Subscription updated' : `${v.name} added`);
    }
  });
}

/* ---------- Cards ---------- */
/** The one number that matters on the debt page. */
function debtHero(p, key) {
  const alive = state.debts.filter(d => d.balance > 0), total = sum(alive, d => d.balance);
  if (!alive.length) return `<div class="card debt-hero featured mb" id="debt-hero"><p class="stat-label">Debt-free</p><p class="hero-value">You’re debt-free 🎉</p><p class="small">Every debt you added is paid off.</p></div>`;
  if (!p.paidOff) return `<div class="card debt-hero tone-danger mb" id="debt-hero"><p class="stat-label">Debt-free by</p><p class="hero-value">Not in sight yet</p>
    <p class="small">At these payments it takes more than 50 years. <a href="#debt/plan" class="linklike">Pay a bit more each month</a> to get a date.</p></div>`;
  const when = F.addMonths(todayDate(), p.months);
  return `<div class="card debt-hero featured mb" id="debt-hero"><p class="stat-label">Debt-free by</p><p class="hero-value">${fmtMonthYear(when)}</p>
    <p class="small">${monthsLabel(p.months)} from now · ${fmt(total)} to go · ${fmt(p.totalInterest)} in interest on the way · ${key === 'snowball' ? 'Snowball' : 'Avalanche'} plan (<a href="#debt/plan" class="linklike">change</a>)</p></div>`;
}
function bossCard() {
  const cards = state.debts.map((d, i) => {
    const pct = d.startBalance > 0 ? clamp(d.balance / d.startBalance * 100, 0, 100) : 0;
    const dead = d.balance <= 0;
    const heal = d.balance * F.monthlyRate(d.rate);
    const tone = pct > 66 ? 'hp-high' : pct > 33 ? 'hp-mid' : 'hp-low';
    return `<article class="boss ${dead ? 'is-dead' : ''}" aria-labelledby="boss-${d.id}">
      <div class="boss-top"><span class="boss-emoji" aria-hidden="true">${dead ? '💀' : BOSS_EMOJI[i % BOSS_EMOJI.length]}</span>
        <div style="min-width:0"><h3 id="boss-${d.id}">${esc(d.name)}</h3>
        <p class="small muted">${dead ? `Defeated${d.defeatedAt ? ' ' + fmtDate(F.parseDate(d.defeatedAt)) : ''}` : (d.rate > 0 ? `Heals ${fmt(heal)}/month from interest` : 'No interest, so it doesn’t heal')}</p></div>
        ${dead ? '<span class="stamp" aria-hidden="true">DEFEATED</span>' : ''}</div>
      <div class="hp" role="meter" aria-label="${esc(d.name)} health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-valuetext="${esc(fmt(d.balance))} of ${esc(fmt(d.startBalance))} left"><span class="${tone}" style="width:${pct}%"></span></div>
      <p class="small num"><strong>HP ${fmt(d.balance)}</strong> <span class="muted">/ ${fmt(d.startBalance)} · ${fmtPct(100 - pct)} damage dealt</span></p>
      ${dead ? '' : `<button type="button" class="btn btn-sm no-print" data-action="hit-debt" data-id="${d.id}"><span aria-hidden="true">⚔️</span><span>Log a payment</span></button>`}
    </article>`;
  }).join('');
  return `<div class="card mb"><div class="card-head"><div><h2>Boss fights</h2><p class="muted small">Payments knock the health bar down. Interest puts some back every month.</p></div></div><div class="boss-grid">${cards}</div></div>`;
}
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); return Math.ceil(v / p) * p; }
function whatIfCard(minTotal) {
  const cur = state.debtSettings.extra;
  const max = niceMax(Math.max(cur * 3, minTotal * 2, 10000));
  // slider step: coarse enough to drag, but able to land exactly on the current amount
  const step = [niceMax(max / 200), 100, 50, 10, 1].find(st => cur % st === 0) || 1;
  return `<div class="card mb"><div class="card-head"><div><h2>What if I paid more?</h2><p class="muted small">Drag to try an extra amount. Nothing changes until you apply it.</p></div></div>
    <label for="whatif-range" class="field-label">Extra per month: <strong id="whatif-val" class="num">${fmt(cur)}</strong></label>
    <input type="range" id="whatif-range" class="range" min="0" max="${max}" step="${step}" value="${Math.min(cur, max)}">
    <div class="whatif-grid" id="whatif-out" aria-live="polite"></div>
    <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button type="button" class="btn btn-primary btn-sm" data-action="apply-whatif">Use this amount</button>
      <button type="button" class="btn btn-sm" data-action="reset-whatif">Back to current</button></div>
  </div>`;
}
function updateWhatIf() {
  const el = document.getElementById('whatif-range'), out = document.getElementById('whatif-out');
  if (!el || !out) return;
  const extra = Number(el.value), strat = state.debtSettings.strategy, t = todayDate();
  const base = debtPlan(strat);
  const p = F.simulatePayoff(state.debts, extra, strat);
  const p1 = F.simulatePayoff(state.debts, extra + 1000, strat);
  document.getElementById('whatif-val').textContent = fmt(extra);
  el.setAttribute('aria-valuetext', `${fmt(extra)} extra per month`);
  const dm = base.months - p.months, di = base.totalInterest - p.totalInterest;
  const monthsTxt = n => n === 0 ? 'same finish date' : n > 0 ? `${monthsLabel(n)} sooner` : `${monthsLabel(-n)} later`;
  let cmp;
  if (!p.paidOff) cmp = '<span class="tone-danger-text">Never paid off at this amount.</span>';
  else if (!base.paidOff) cmp = '<span class="tone-success-text">This clears debt your current plan never does.</span>';
  else if (Math.abs(di) < 1 && dm === 0) cmp = '<span class="muted">Same as your current plan.</span>';
  else cmp = `<span class="${di >= 0 ? 'tone-success-text' : 'tone-warn-text'}">vs your plan: ${monthsTxt(dm)} · ${di >= 0 ? `${fmt(di)} less interest` : `${fmt(-di)} more interest`}</span>`;
  const per = p.paidOff && p1.paidOff
    ? `Each extra ${fmt(1000)}/month from here saves ${fmt(p.totalInterest - p1.totalInterest)} in interest${p.months - p1.months > 0 ? ` and ${monthsLabel(p.months - p1.months)}` : ''}.` : '';
  out.innerHTML = `
    <div><p class="stat-label">Debt-free</p><p class="stat-value">${p.paidOff ? fmtMonthYear(F.addMonths(t, p.months)) : 'Never'}</p><p class="stat-sub">${p.paidOff ? `in ${monthsLabel(p.months)}` : 'within 50 years'}</p></div>
    <div><p class="stat-label">Total interest</p><p class="stat-value">${fmt(p.totalInterest)}</p><p class="stat-sub">${incomeHint(p.minTotal + extra)}</p></div>
    <div class="span-all"><p>${cmp}</p>${per ? `<p class="small muted" style="margin-top:4px">${per}</p>` : ''}</div>`;
}
function subsCard() {
  const subs = state.subscriptions;
  const monthly = sum(subs, subMonthly), yearly = monthly * 12;
  const subCat = state.budget.categories.find(c => /subscri/i.test(c.name));
  const p = prevYM(todayISO().slice(0, 7)), p2 = prevYM(p);
  const sugs = findRecurringCharges();
  const pcLine = x => { if (!x.priceChange) return ''; const c = x.priceChange, up = c.to > c.from;
    return `<br><span class="badge ${up ? 'badge-warn' : 'badge-success'}">Went ${up ? 'up' : 'down'} ${fmt(Math.abs(c.to - c.from))}</span> <span class="no-print small"><button type="button" class="linklike" data-action="sub-price-ok" data-id="${x.id}">Update to ${fmt(c.to)}</button> · <button type="button" class="linklike" data-action="sub-price-dismiss" data-id="${x.id}">Ignore</button></span>`; };
  const rows = subs.map(x => `<tr><td>${esc(x.name)}${x.plan ? ` <span class="small muted">${esc(x.plan)}</span>` : ''}${pcLine(x)}${x.usage[p] === false && x.usage[p2] === false ? '<br><span class="badge badge-warn">Not used for 2 months</span>' : x.usage[p] === false ? '<br><span class="small muted">Not used last month</span>' : ''}</td><td class="num">${fmt(x.amount)}<span class="muted small">/${x.cycle === 'yearly' ? 'yr' : 'mo'}</span></td>
    <td class="num"><span class="badge badge-danger">${fmt(subMonthly(x) * 12)}/yr</span></td><td style="min-width:150px">${feelsLike(subMonthly(x) * 12)}</td>
    <td class="actions no-print"><button type="button" class="icon-btn" data-action="edit-subscription" data-id="${x.id}" aria-label="Edit ${esc(x.name)}">${ICON.edit}</button>
    <button type="button" class="icon-btn danger" data-action="delete-subscription" data-id="${x.id}" aria-label="Delete ${esc(x.name)}">${ICON.trash}</button></td></tr>`).join('');
  return `<div class="card"><div class="card-head"><div><h2>Subscriptions</h2><p class="muted small">What they cost you over a year.</p></div>
    <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-subscription">${ICON.plus}<span>Add</span></button>${csvBtn('subscriptions', 'subscriptions')}</div></div>
    ${subs.length ? `<div class="vamp-total"><p class="stat-label">Per year</p><p class="stat-value">${fmt(yearly)}<span class="small muted" style="font-weight:500"> a year</span></p>
      <p class="stat-sub" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${incomeHint(monthly)} ${feelsLike(yearly)}</p></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Service</th><th class="num" scope="col">Price</th><th class="num" scope="col">Per year</th><th scope="col">Work hours a year</th><th class="no-print"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${sugs.length ? `<p class="small sug-note no-print" style="margin-top:10px">${plural(sugs.length, 'regular payment')} in your bank data ${sugs.length === 1 ? 'looks' : 'look'} like ${sugs.length === 1 ? 'a subscription' : 'subscriptions'}. <button type="button" class="linklike" data-action="review-sub-sugs">Take a look</button></p>` : ''}
      ${subCat && Math.abs(subCat.planned - monthly) > 0.5 ? `<p class="small no-print" style="margin-top:10px">Your “${esc(subCat.name)}” budget is ${fmt(subCat.planned)}/month. <button type="button" class="linklike" data-action="sync-subs" data-id="${subCat.id}">Set it to ${fmt(monthly)}</button></p>` : ''}`
    : `<div class="chart-empty"><p>No subscriptions tracked yet.</p><button type="button" class="btn btn-sm" data-action="add-subscription">Pick from a list</button>${sugs.length ? `<p class="small" style="margin-top:8px"><button type="button" class="linklike" data-action="review-sub-sugs">${plural(sugs.length, 'payment')} in your bank data look like subscriptions</button></p>` : ''}</div>`}
  </div>`;
}
function heatmapCard() {
  const t = todayDate(), sk = streakInfo(), weeks = 12;
  const end = F.addDays(t, 6 - t.getDay());
  const start = F.addDays(end, -(weeks * 7 - 1));
  const tracked = F.startOfDay(sk.start);
  let cols = '';
  for (let w = 0; w < weeks; w++) {
    cols += '<div class="hm-col">';
    for (let d = 0; d < 7; d++) {
      const day = F.addDays(start, w * 7 + d), iso = F.toISO(day);
      let cls, label;
      if (day > t) { cls = 'hm-future'; label = `${fmtDate(day)}: upcoming`; }
      else if (day < tracked) { cls = 'hm-none'; label = `${fmtDate(day)}: before tracking`; }
      else if (sk.spend.has(iso)) { cls = 'hm-spend'; label = `${fmtDate(day)}: spent ${fmt(sk.spend.get(iso))} on wants`; }
      else { cls = 'hm-save'; label = `${fmtDate(day)}: no-spend day`; }
      cols += `<span class="hm-cell ${cls}${iso === F.toISO(t) ? ' hm-today' : ''}" title="${esc(label)}"></span>`;
    }
    cols += '</div>';
  }
  return `<div class="card"><div class="card-head"><div><h2>No-spend streak</h2><p class="muted small">Coloured days are days you didn’t spend anything on wants.</p></div></div>
    <div class="streak-row"><div><p class="stat-label">Current</p><p class="stat-value">${plural(sk.current, 'day')}</p></div><div><p class="stat-label">Longest</p><p class="stat-value">${plural(sk.longest, 'day')}</p></div></div>
    <div class="heatmap" role="img" aria-label="No-spend days over the last 12 weeks. Current streak ${plural(sk.current, 'day')}, longest ${plural(sk.longest, 'day')}.">
      <div class="hm-days" aria-hidden="true"><span></span><span>M</span><span></span><span>W</span><span></span><span>F</span><span></span></div>${cols}</div>
    <div class="hm-legend small muted" aria-hidden="true"><span class="hm-cell hm-save"></span>No-spend<span class="hm-cell hm-spend"></span>Spent on wants<span class="hm-cell hm-none"></span>Not tracked</div>
  </div>`;
}

/* ---------- Money Wrapped ---------- */
let wrappedCanvas = null;
function wrappedData() {
  const t = todayDate(), ym = todayISO().slice(0, 7);
  const b = budgetTotals();
  const exps = state.budget.expenses.filter(x => x.date.slice(0, 7) === ym);
  const biggest = exps.reduce((m, x) => (!m || x.amount > m.amount ? x : m), null);
  const topCat = state.budget.categories.filter(c => c.type !== 'savings' && c.actual > 0).reduce((m, c) => (!m || c.actual > m.actual ? c : m), null);
  const contribs = state.goals.flatMap(g => g.contributions.filter(c => c.date.slice(0, 7) === ym));
  const saved = sum(contribs, c => c.amount), roundups = sum(contribs.filter(c => c.roundup), c => c.amount);
  const debtPaid = sum(state.debts.flatMap(d => d.payments.filter(p => p.date.slice(0, 7) === ym)), p => p.amount);
  const slain = state.debts.filter(d => d.defeatedAt && d.defeatedAt.slice(0, 7) === ym).length;
  const streak = streakInfo().longest;
  const savingsShare = b.income > 0 ? (b.byType.savings.actual || b.byType.savings.planned) / b.income : 0;
  const wantsShare = b.income > 0 ? b.byType.wants.actual / b.income : 0;
  let persona;
  if (slain > 0) persona = ['⚔️', 'The Boss Slayer', `You paid off ${plural(slain, 'debt')} this month.`];
  else if (savingsShare >= 0.2) persona = ['🐿️', 'The Squirrel', 'You saved at least a fifth of what you earned.'];
  else if (streak >= 14) persona = ['🧘', 'The Monk', 'Two weeks or more without spending on wants.'];
  else if (wantsShare > 0.3) persona = ['🎉', 'The Big Spender', 'Wants took up more than 30% of your income.'];
  else if (b.income > 0 && b.actual > 0 && b.actual <= b.planned) persona = ['🧭', 'The Navigator', 'You stuck to your plan.'];
  else persona = ['🌱', 'The Beginner', 'Keep tracking and next month’s recap will say a lot more.'];
  const catName = id => (state.budget.categories.find(c => c.id === id) || { name: 'Expense' }).name;
  return {
    monthName: `${FULL_MONTHS[t.getMonth()]} ${t.getFullYear()}`, persona,
    tiles: [
      ['Spent', fmt(b.actual), b.income > 0 ? `${fmtPct(b.actual / b.income * 100)} of income` : 'Add income to compare'],
      ['Top category', topCat ? topCat.name : '—', topCat ? fmt(topCat.actual) : 'No spending yet'],
      ['Biggest splurge', biggest ? fmt(biggest.amount) : '—', biggest ? (biggest.note || catName(biggest.categoryId)) : 'Nothing logged'],
      ['Saved for goals', fmt(saved), roundups > 0 ? `${fmt(roundups)} from round-ups` : plural(contribs.length, 'deposit')],
      ['Debt damage', fmt(debtPaid), slain ? `${plural(slain, 'boss')} defeated`.replace('bosss', 'bosses') : 'No debts paid off yet'],
      ['Longest no-spend streak', plural(streak, 'day'), streak >= 7 ? 'Not bad at all' : 'Aim for 7 next month']
    ]
  };
}
function drawWrapped(d) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;
  const rrect = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const fit = (text, maxW) => { let s = String(text); if (x.measureText(s).width <= maxW) return s; while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
  const accent = (THEMES[state.settings.theme] || THEMES.yoko).chart[0];
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0A0A0A'); g.addColorStop(1, '#1A1A1A');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = hexA(accent, 0.14);
  x.beginPath(); x.arc(W - 110, 170, 250, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(60, H - 90, 190, 0, Math.PI * 2); x.fill();
  x.textBaseline = 'alphabetic';
  if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) x.drawImage(LOGO_IMG, 72, 56, 330, 330 * LOGO_IMG.naturalHeight / LOGO_IMG.naturalWidth);
  else { x.fillStyle = accent; x.font = font(700, 64); x.fillText(APP_NAME, 80, 130); }
  x.fillStyle = accent; x.font = font(700, 28); x.fillText('WRAPPED', 420, 128);
  x.fillStyle = '#FFFFFF'; x.font = font(700, 60); x.fillText(d.monthName, 80, 222);
  x.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(d.persona[0], 76, 345);
  x.fillStyle = '#FFFFFF'; x.font = font(700, 66); x.fillText(fit(d.persona[1], W - 160), 80, 448);
  x.fillStyle = '#D0D0D0'; x.font = font(400, 32); x.fillText(fit(d.persona[2], W - 160), 80, 502);
  const tw = 445, th = 180, gap = 30;
  d.tiles.forEach(([label, value, sub], i) => {
    const X = 80 + (i % 2) * (tw + gap), Y = 560 + Math.floor(i / 2) * (th + 22);
    x.fillStyle = 'rgba(255, 255, 255, .07)'; rrect(X, Y, tw, th, 26); x.fill();
    x.fillStyle = accent; x.fillRect(X, Y + 30, 6, th - 60);
    x.fillStyle = accent; x.font = font(600, 25); x.fillText(fit(label.toUpperCase(), tw - 60), X + 30, Y + 50);
    x.fillStyle = '#FFFFFF'; x.font = font(700, 46); x.fillText(fit(value, tw - 60), X + 30, Y + 112);
    x.fillStyle = '#C8C8C8'; x.font = font(400, 25); x.fillText(fit(sub, tw - 60), X + 30, Y + 152);
  });
  x.fillStyle = '#9A9A9A'; x.font = font(600, 26); x.fillText('Made with', 80, H - 64);
  if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) x.drawImage(LOGO_IMG, 210, H - 104, 150, 150 * LOGO_IMG.naturalHeight / LOGO_IMG.naturalWidth);
  return c;
}
function openWrapped() {
  const d = wrappedData();
  wrappedCanvas = drawWrapped(d);
  const alt = `${d.monthName} wrapped. ${d.persona[1]}: ${d.persona[2]} ` + d.tiles.map(([l, v, s2]) => `${l}: ${v}, ${s2}.`).join(' ');
  openModal({
    title: `Your ${d.monthName}, wrapped`, hideSubmit: true, cancelLabel: 'Close', wide: true,
    body: `<img class="wrapped-img" src="${wrappedCanvas.toDataURL('image/png')}" alt="${esc(alt)}">
      <button type="button" class="btn btn-primary" data-action="download-wrapped">${ICON.download}<span>Download image</span></button>`
  });
  if (!state.badges.wrapped) { state.badges.wrapped = todayISO(); save(); celebrateBadges([BADGES.find(b => b.id === 'wrapped')]); render(); }
}

/* ---------- Command palette (Ctrl/Cmd + K) ---------- */
function parseAmount(w) {
  const m = /^(\d+(?:\.\d+)?)(k|l)?$/i.exec(String(w || '').replace(/,/g, '').replace(/^[^\d.]+/, ''));
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2]) v *= m[2].toLowerCase() === 'k' ? 1e3 : 1e5;   // 2k = 2,000 · 1.5l = 1,50,000
  return v > 0 ? v : null;
}
function findByName(list, text) {
  const w = String(text || '').toLowerCase().trim();
  if (!w) return null;
  return list.find(x => x.name.toLowerCase() === w) || list.find(x => x.name.toLowerCase().startsWith(w)) || list.find(x => x.name.toLowerCase().includes(w)) || null;
}
/** Turn "250 food dinner", "save 2k trip", "pay 3000 credit" into runnable commands. */
function parseCommand(q) {
  q = F.normalizeAmounts(q);
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const low = words.map(w => w.toLowerCase());
  const out = [];
  const smsCmd = smsCommand(q);
  if (smsCmd) return [smsCmd];
  out.push(...moreParse(q, words, low));
  const skip = (arr, list) => (arr.length && list.includes(arr[0].toLowerCase()) ? arr.slice(1) : arr);
  // Goals: "save 500 laptop", "add money 500 to laptop"
  const gi = ['save', 'deposit'].includes(low[0]) ? 1 : (low[0] === 'add' && low[1] === 'money' ? 2 : -1);
  if (gi > 0) {
    const amt = parseAmount(words[gi]);
    const rest = skip(words.slice(gi + 1), ['to', 'for', 'into']);
    const g = findByName(state.goals, rest.join(' ')) || findByName(state.goals, rest[0]);
    if (amt && g) out.push({ parsed: true, label: `Add ${fmt(amt)} to ${g.name}`, run: () => addToGoal(g, amt, todayISO(), 'Quick add') });
  }
  // Debts: "pay 3000 credit"
  if (['pay', 'hit'].includes(low[0])) {
    const amt = parseAmount(words[1]);
    const rest = skip(words.slice(2), ['to', 'on', 'off']);
    const alive = state.debts.filter(d => d.balance > 0);
    const d = findByName(alive, rest.join(' ')) || findByName(alive, rest[0]);
    if (amt && d) out.push({ parsed: true, label: `Log ${fmt(amt)} payment to ${d.name}`, run: () => logDebtPayment(d, amt, todayISO()) });
  }
  // Expenses: "250 food", "spent 250 on food dinner", "add expense 250 food"
  let i = ['add', 'spent', 'spend', 'paid', 'expense'].includes(low[0]) ? 1 : 0;
  if (low[i] === 'expense') i++;
  const amt = parseAmount(words[i]);
  if (amt && !(gi > 0) && !['pay', 'hit'].includes(low[0])) {
    const rest = skip(words.slice(i + 1), ['on', 'for', 'in', 'at']);
    const c = rest.length ? findByName(state.budget.categories, rest[0]) : null;
    if (c) {
      const note = rest.slice(1).join(' ').slice(0, 120);
      out.push({ parsed: true, label: `Add ${fmt(amt)} expense to ${c.name}${note ? ` · “${note}”` : ''}`, run: () => { const r = addExpense({ categoryId: c.id, amount: amt, date: todayISO(), note }); commit(); expenseToast(amt, r); } });
    }
  }
  // Transport: "uber 320", "fuel 1500", "metro 40 office"
  const tIdx = low.findIndex(w => TRANSPORT_WORDS[w]);
  if (tIdx >= 0) {
    const aT = words.map(parseAmount).find(v => v);
    if (aT) {
      const mode = TRANSPORT_WORDS[low[tIdx]];
      const note = words.filter((w, k) => k !== tIdx && !parseAmount(w)).join(' ').slice(0, 120);
      out.push({ parsed: true, label: `Log ${fmt(aT)} ${modeInfo(mode)[2]}${note ? ` · “${note}”` : ''} in Transport`,
        run: () => { addTransport({ mode, amount: aT, date: todayISO(), note, km: null, categoryId: defaultTransportCat() }); commit(); toast(`${modeInfo(mode)[1]} ${fmt(aT)} logged`); } });
    }
  }
  // Cash: "cash in 2000 atm", "cash out 300 chai"
  if (low[0] === 'cash' && (low[1] === 'in' || low[1] === 'out')) {
    const aC = parseAmount(words[2]);
    if (aC) {
      const note = words.slice(3).join(' ').slice(0, 120), type = low[1];
      out.push({ parsed: true, label: `Cash ${type}: ${fmt(aC)}${note ? ` · “${note}”` : ''}`,
        run: () => { addCash({ type, amount: aC, date: todayISO(), note, categoryId: '' }); commit(); toast(`💵 Cash ${type} ${fmt(aC)} · wallet ${fmt(cashBalance())}`); } });
    }
  }
  // IOUs: "owe priya 500", "rahul owes 500", "lent 500 to rahul", "borrowed 500 from priya"
  let iou = null;
  if (low[0] === 'owe' && words.length >= 3) {
    const aI = words.slice(1).map(parseAmount).find(v => v);
    const person = words.slice(1).filter(w => !parseAmount(w)).join(' ');
    if (aI && person) iou = { dir: 'owe', person, amount: aI };
  }
  const owesAt = low.indexOf('owes');
  if (owesAt > 0) { const aI = parseAmount(words[owesAt + 1]); if (aI) iou = { dir: 'owed', person: words.slice(0, owesAt).join(' '), amount: aI }; }
  if ((low[0] === 'lent' || low[0] === 'borrowed') && words.length >= 3) {
    const aI = parseAmount(words[1]), rest = skip(words.slice(2), ['to', 'from']);
    if (aI && rest.length) iou = { dir: low[0] === 'lent' ? 'owed' : 'owe', person: rest.join(' '), amount: aI };
  }
  if (iou) {
    const x = iou;
    out.push({ parsed: true, label: x.dir === 'owe' ? `IOU: you owe ${x.person} ${fmt(x.amount)}` : `IOU: ${x.person} owes you ${fmt(x.amount)}`,
      run: () => { state.wallet.ious.push({ id: uid(), person: x.person.slice(0, 60), dir: x.dir, amount: x.amount, date: todayISO(), due: '', note: '', settled: false, settledAt: '' }); commit(); toast('🤝 IOU saved'); } });
  }
  // Tax: "tax 5000 advance"
  if (low[0] === 'tax') {
    const aX = parseAmount(words[1]);
    if (aX) {
      const hint = (low[2] || '').replace(/[^a-z]/g, '');
      const alias = { tds: TAX_TYPES[0], paye: TAX_TYPES[0], withheld: TAX_TYPES[0], estimated: TAX_TYPES[1], return: TAX_TYPES[2], itr: TAX_TYPES[2], ni: PAYROLL_TAX, pt: PAYROLL_TAX, gst: TAX_TYPES[4], vat: TAX_TYPES[4], sales: TAX_TYPES[4] };
      const type = (hint && (alias[hint] || TAX_TYPES.find(tp => tp.toLowerCase().includes(hint)))) || 'Other';
      out.push({ parsed: true, label: `Log ${fmt(aX)} tax payment (${type})`,
        run: () => { state.wallet.taxes.push({ id: uid(), date: todayISO(), type, amount: aX, note: '', payslipId: null }); commit(); toast(`🧾 ${fmt(aX)} ${type} logged`); } });
    }
  }
  return out;
}
function staticCommands() {
  return [
    { label: 'Go to Gifts', keys: 'go open page gifts birthdays presents', run: () => { location.hash = '#goals/gifts'; } },
    ...ROUTES.map(r => ({ label: `Go to ${r.long || r.label}`, keys: `go open page ${r.id} ${r.label}`, run: () => { location.hash = '#' + r.id; } })),
    { label: 'Go to Yearly bills', keys: 'go open yearly bills annual', run: () => { location.hash = '#budget/yearly'; } },
    { label: 'Enter paycheck', keys: 'paycheck income salary pay', run: openPaycheckModal },
    { label: 'Add expense…', keys: 'add expense spend', run: expenseForm },
    { label: 'Add debt…', keys: 'add debt loan boss credit card', run: () => debtPicker() },
    { label: 'Add goal…', keys: 'add goal savings', run: () => goalPicker() },
    { label: 'Add gift…', keys: 'add gift present', run: () => giftForm(null) },
    { label: 'Add subscriptions…', keys: 'add subscription vampire netflix spotify', run: () => subsChecklist() },
    { label: 'Money Wrapped', keys: 'wrapped recap month summary', run: openWrapped },
    ...THEME_KEYS.map(k => ({ label: `Theme: ${THEMES[k].label}`, keys: `theme colour color ${k} ${THEMES[k].label} green black blue red`, run: () => setTheme(k) })),
    { label: state.settings.sound ? 'Turn sound effects off' : 'Turn sound effects on', keys: 'sound mute audio cha-ching', run: () => { state.settings.sound = !state.settings.sound; save(); toast(`Sound effects ${state.settings.sound ? 'on 🔊' : 'off 🔇'}`); playSound('coin'); } },
    { label: 'Upload a payslip (PDF)…', keys: 'payslip salary slip pdf upload import', run: () => openPayslipModal() },
    { label: 'Cash in…', keys: 'cash in wallet atm', run: () => cashForm('in') },
    { label: 'Cash out…', keys: 'cash out wallet spend', run: () => cashForm('out') },
    { label: 'Add an IOU…', keys: 'iou owe lent borrowed debt friend', run: () => iouForm(null) },
    { label: 'Log transport…', keys: 'transport fuel cab uber metro travel', run: transportForm },
    { label: 'Log a tax payment…', keys: 'tax tds advance estimated gst vat paye', run: taxForm },
    ...moreCommands(),
    { label: 'Settings', keys: 'settings preferences options', run: openSettings },
    { label: 'Tutorials…', keys: 'tutorial tour help guide walkthrough replay', run: openTutorialHub },
    { label: 'Tour this page', keys: 'tutorial tour help this page', run: () => startTour([currentRoute()]) },
    { label: 'What’s new', keys: 'new update changes tutorial', run: () => startTour(['new']) },
    { label: 'Print / Save as PDF', keys: 'print pdf', run: () => window.print() },
    { label: 'Export all data (JSON)', keys: 'export backup json download', run: () => ACTIONS['export-json']() },
    { label: 'Load sample data', keys: 'sample demo example', run: loadSample }
  ];
}
function openPalette() {
  let items = [], sel = 0;
  const statics = staticCommands();
  const draw = form => {
    const inp = form.querySelector('#cmd-input');
    const q = inp.value.trim();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = statics.filter(c => { const hay = (c.label + ' ' + c.keys).toLowerCase(); return words.every(w => hay.includes(w)); });
    items = parseCommand(q).concat(q ? matches : statics).slice(0, 9);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    const list = form.querySelector('#cmd-list');
    list.innerHTML = items.length
      ? items.map((c, i) => `<li role="option" id="cmd-opt-${i}" data-i="${i}" aria-selected="${i === sel}"><span>${esc(c.label)}</span><span class="cmd-tag">${c.parsed ? '↵ Do it' : 'Command'}</span></li>`).join('')
      : '<li role="presentation" class="muted">No match. Try “250 food”, “save 500 laptop” or “pay 3000 credit”.</li>';
    if (items.length) inp.setAttribute('aria-activedescendant', `cmd-opt-${sel}`); else inp.removeAttribute('aria-activedescendant');
    const on = list.querySelector('[aria-selected="true"]');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const run = i => { const c = items[i]; if (!c) return; closeModal(); setTimeout(() => c.run(), 0); };
  openModal({
    title: 'Command palette', submitLabel: 'Run', cancelLabel: 'Close',
    body: `<div class="field"><label for="cmd-input">Type a command</label>
      <input id="cmd-input" class="input" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list" placeholder="250 food dinner · save 2k trip · pay 3000 credit"></div>
      <ul id="cmd-list" class="cmd-list" role="listbox" aria-label="Commands"></ul>
      <p class="help">Examples: <kbd>250 food</kbd> <kbd>spent 1.2k on fun movie</kbd> <kbd>save 500 laptop</kbd> <kbd>pay 3000 credit</kbd> <kbd>wrapped</kbd>. Use ↑ ↓ and Enter.</p>`,
    onMount: form => {
      const inp = form.querySelector('#cmd-input');
      inp.addEventListener('input', () => { sel = 0; draw(form); });
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(form); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(form); }
      });
      form.querySelector('#cmd-list').addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) run(Number(li.dataset.i)); });
      draw(form);
    },
    onSubmit: () => { run(sel); return false; }   // run() closes the palette itself
  });
}

/* ---------- Preferences (inside Settings) ---------- */
function prefsHTML() {
  const s = state.settings, sym = esc(CURRENCIES[state.currency].symbol);
  const f = (id, label, input, help = '') => `<div class="field"><label for="${id}">${label}</label>${input}${help ? `<p class="help">${help}</p>` : ''}<p class="field-error" id="${id}-err"></p></div>`;
  const goalOpts = state.goals.length ? state.goals.map(g => `<option value="${g.id}" ${s.roundUp.goalId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('') : '<option value="">Add a goal first</option>';
  return `
  <div class="settings-group"><h3>Theme and sound</h3><div class="form-grid two">
    <fieldset class="theme-pick span-2"><legend class="field-label">Theme</legend>${THEME_KEYS.map(k => `<label class="theme-opt"><input type="radio" name="set-theme" id="set-theme-${k}" value="${k}" data-setting="theme" data-kind="select" ${resolvedTheme() === k ? 'checked' : ''}><span class="swatch" aria-hidden="true"><i style="background:${THEMES[k].swatch[0]}"></i><i style="background:${THEMES[k].swatch[1]}"></i></span>${esc(THEMES[k].label)}</label>`).join('')}</fieldset>
    <div class="field"><span class="field-label">Sound effects</span><label class="check"><input type="checkbox" id="set-sound" data-setting="sound" data-kind="bool" ${s.sound ? 'checked' : ''}> Play sounds</label></div>
  </div></div>
  <div class="settings-group"><h3>Hours of work</h3><p class="small muted">Prices also show as how long you’d have to work for them.</p><div class="form-grid two">
    ${f('set-hours', 'Hours you work in a month', `<input id="set-hours" class="input" inputmode="decimal" value="${numStr(s.workHours)}" data-setting="workHours" data-kind="hours" aria-describedby="set-hours-err">`, 'A 40-hour week is about 176.')}
    <div class="field"><span class="field-label">Example</span><p class="calc-line" id="set-preview" aria-live="polite"></p></div>
  </div></div>
  <div class="settings-group"><h3>Runway</h3>
    ${f('set-cash', 'Bank & savings not in a goal', `<div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="set-cash" class="input" inputmode="decimal" value="${numStr(s.cashOnHand)}" data-setting="cashOnHand" data-kind="money" aria-describedby="set-cash-err"></div>`, 'Runway is this, plus your goal savings and cash, divided by what you spend on needs and wants in a month.')}
  </div>`;
}
function bindPrefs(form) {
  const preview = () => { const el = form.querySelector('#set-preview'); if (el) el.textContent = `${fmt(1000)} = ${feelsLikeText(1000) || 'add your income first'}`; };
  const onChange = e => {
    const el = e.target, key = el.dataset && el.dataset.setting;
    if (!key) return;
    const kind = el.dataset.kind, err = form.querySelector('#' + el.id + '-err');
    let v;
    if (kind === 'bool') v = el.checked;
    else if (kind === 'num') v = Number(el.value);
    else if (kind === 'select') v = el.value || null;
    else {
      const r = validateValue(kind === 'text' ? 'text' : 'money', el.value, { required: kind !== 'money', positive: kind === 'hours' || kind === 'price', max: 20 });
      const msg = r.error || (kind === 'hours' && r.value > 744 ? 'A month has at most 744 hours.' : '');
      if (msg) { el.setAttribute('aria-invalid', 'true'); if (err) err.textContent = msg; return; }
      el.removeAttribute('aria-invalid'); if (err) err.textContent = '';
      v = r.value;
    }
    const path = key.split('.');
    let o = state.settings;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = v;
    if (key === 'roundUp.enabled' && v && !state.goals.some(g => g.id === state.settings.roundUp.goalId) && state.goals[0]) state.settings.roundUp.goalId = state.goals[0].id;
    if (key === 'theme') applyTheme();
    settingHook(key);
    if (key === 'sound' && v) playSound('coin');
    save(); preview(); scheduleRender(key === 'theme' ? 0 : 300);
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  preview();
}

/* ---------- Theme ---------- */
function resolvedTheme() { return THEMES[state.settings.theme] ? state.settings.theme : 'yoko'; }
function applyTheme() {
  const th = resolvedTheme();
  document.documentElement.dataset.theme = th;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMES[th].meta;
  const btn = document.getElementById('theme-btn');
  if (btn) { btn.innerHTML = ICON.palette; btn.title = `Theme: ${THEMES[th].label} (click to change)`; btn.setAttribute('aria-label', `Change theme. Current: ${THEMES[th].label}`); }
  setupChartDefaults();
}
/** Cycle YOKO! → Black & Blue → Black & Red. */
function toggleTheme() {
  const i = THEME_KEYS.indexOf(resolvedTheme());
  setTheme(THEME_KEYS[(i + 1) % THEME_KEYS.length]);
}
function setTheme(key) {
  state.settings.theme = THEMES[key] ? key : 'yoko';
  save(); applyTheme(); render();
  toast(`Theme: ${THEMES[state.settings.theme].label}`);
}


