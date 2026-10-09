/* YOKO! Student · Challenges, should-I-buy-it and wishlist, split the bill, dashboard/goals extras.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* ---------- Challenges ---------- */
function challengeStatus(c) {
  const t = todayDate(), start = F.parseDate(c.start) || t;
  if (c.type === 'week52') {
    const done = c.deposits.length, week = clamp(Math.floor(F.daysBetween(start, t) / 7) + 1, 1, 52);
    return { state: done >= 52 ? 'won' : 'active', done, week, behind: Math.max(0, week - done), next: done + 1, nextAmount: c.unit * (done + 1), saved: sum(c.deposits, d => d.amount), total: F.week52Total(c.unit), progress: done / 52 };
  }
  const end = F.addDays(start, c.days), endISO = F.toISO(end);
  const daysIn = clamp(F.daysBetween(start, t) + 1, 0, c.days);
  const finished = t >= end;
  if (c.type === 'nocat') {
    const hit = state.budget.expenses.filter(x => x.categoryId === c.categoryId && x.date >= c.start && x.date < endISO).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (hit) return { state: 'lost', daysIn, progress: daysIn / c.days, why: `${fmt(hit.amount)} on ${fmtDate(F.parseDate(hit.date))}` };
    return { state: finished ? 'won' : 'active', daysIn, progress: daysIn / c.days };
  }
  // daily cap: needs + wants spending per day
  const spendCats = new Set(state.budget.categories.filter(k => k.type !== 'savings').map(k => k.id));
  const byDay = {};
  state.budget.expenses.forEach(x => { if (spendCats.has(x.categoryId) && x.date >= c.start && x.date < endISO && !x.recurringId) byDay[x.date] = (byDay[x.date] || 0) + x.amount; });
  const bad = Object.keys(byDay).sort().find(d => byDay[d] > c.cap + 0.005);
  const today = byDay[todayISO()] || 0;
  if (bad) return { state: 'lost', daysIn, progress: daysIn / c.days, why: `${fmt(byDay[bad])} on ${fmtDate(F.parseDate(bad))}`, today };
  return { state: finished ? 'won' : 'active', daysIn, progress: daysIn / c.days, today };
}
function getActiveCategoryFreeze(catId) {
  if (!catId || !state.challenges) return null;
  for (const c of state.challenges) {
    if (c.type === 'nocat' && c.categoryId === catId) {
      const st = challengeStatus(c);
      if (st.state === 'active') {
        const cat = state.budget.categories.find(k => k.id === catId);
        const daysLeft = Math.max(0, c.days - st.daysIn);
        return {
          challenge: c,
          status: st,
          daysLeft,
          daysIn: st.daysIn,
          daysTotal: c.days,
          catName: cat ? cat.name : 'Category'
        };
      }
    }
  }
  return null;
}
function challengeTitle(c) {
  if (c.type === 'week52') return `52-week challenge · ${fmt(c.unit)} × week number`;
  if (c.type === 'nocat') { const cat = state.budget.categories.find(k => k.id === c.categoryId); return `Freeze ${cat ? cat.name : 'spending'} for ${plural(c.days, 'day')}`; }
  return `Spend under ${fmt(c.cap)} a day for ${plural(c.days, 'day')}`;
}
/** Reward finished challenges once, and streak milestones. Returns true if anything changed. */
function evaluateRewards() {
  let changed = false;
  for (const c of state.challenges) {
    if (c.rewarded || c.failed) continue;
    const st = challengeStatus(c);
    if (st.state === 'won') {
      c.rewarded = true; changed = true;
      awardXP(150, 'challenge', true);
      setTimeout(() => { toast(`You won a challenge! +150 XP`, 4500); confetti(); playSound('fanfare'); }, 400);
    } else if (st.state === 'lost') { c.failed = true; changed = true; setTimeout(() => toast(`Challenge lost: ${challengeTitle(c)}. You can try again`, 4000), 400); }
  }
  const cur = state.budget.expenses.length ? streakInfo().current : 0;   // streak cards only once you're actually logging
  if (cur < state.meta.streakRewarded) { state.meta.streakRewarded = 0; changed = true; }
  for (const m of [7, 14, 30, 60, 100]) {
    if (cur >= m && state.meta.streakRewarded < m) { state.meta.streakRewarded = m; awardXP(m * 5, 'streak', true); setTimeout(() => toast(`🔥 ${m} days without spending on wants! +${m * 5} XP`, 4000), 500); changed = true; }
  }
  return changed;
}
function challengeForm() {
  const cats = state.budget.categories.filter(c => c.type !== 'savings');
  const fields = [
    { name: 'type', label: 'Challenge', kind: 'select', wide: true, options: [['nocat', 'Category freeze: skip one category'], ['cap', 'Daily cap: spend under an amount each day'], ['week52', '52-week savings challenge']] },
    { name: 'categoryId', label: 'Category to freeze', kind: 'select', options: cats.length ? cats.map(c => [c.id, c.name]) : [['', 'Add a budget category first']] },
    { name: 'days', label: 'For how long?', kind: 'select', options: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] },
    { name: 'cap', label: 'Daily limit', kind: 'money', required: true, positive: true, hidden: true, help: 'Counts needs and wants you log each day. Recurring payments don’t count.' },
    { name: 'unit', label: 'Week 1 amount', kind: 'money', required: true, positive: true, hidden: true, help: 'Week 2 is double, week 52 is 52×.' },
    { name: 'goalId', label: 'Put deposits into', kind: 'select', hidden: true, options: [['', 'Just track them'], ...state.goals.map(g => [g.id, g.name])] }
  ];
  const al = dailyAllowance();
  formModal({
    title: 'New challenge', submitLabel: 'Start', fields,
    values: { type: 'nocat', days: '7', cap: niceAmount(Math.max(100 * scaleFor(state.currency), al.perDay || 500 * scaleFor(state.currency))), unit: Math.max(1, niceAmount(50 * scaleFor(state.currency))), categoryId: cats[0] ? cats[0].id : '', goalId: '' },
    onMount: form => {
      const sync = () => {
        const tp = form.querySelector('#f-type').value;
        const show = { categoryId: tp === 'nocat', days: tp !== 'week52', cap: tp === 'cap', unit: tp === 'week52', goalId: tp === 'week52' };
        for (const [k, on] of Object.entries(show)) form.querySelector(`[data-wrap="${k}"]`).hidden = !on;
      };
      form.querySelector('#f-type').addEventListener('change', sync); sync();
    },
    live: v => v.type === 'week52' && v.unit > 0 ? `<div class="alert alert-info">Total after 52 weeks: <strong>${fmt(F.week52Total(v.unit))}</strong></div>` : '',
    onSave: (v, form) => {
      if (v.type === 'nocat' && !v.categoryId) { toast('Add a budget category first.'); return false; }
      state.challenges.push({ id: uid(), type: v.type, start: todayISO(), unit: v.unit || 10, goalId: v.goalId || null, categoryId: v.categoryId || '', days: Number(v.days) || 7, cap: v.cap || 0, deposits: [], rewarded: false, failed: false });
      commit(); toast('Challenge started. Good luck');
    }
  });
}
function week52Deposit(c) {
  const st = challengeStatus(c);
  if (st.state === 'won') return;
  const amt = c.unit * st.next;
  c.deposits.push({ week: st.next, date: todayISO(), amount: amt });
  const g = c.goalId && state.goals.find(x => x.id === c.goalId);
  if (g) { g.saved += amt; g.contributions.push({ id: uid(), date: todayISO(), amount: amt, note: `52-week challenge · week ${st.next}` }); }
  awardXP(5, 'deposit', true);
  commit(); playSound('coin');
  toast(`Week ${st.next} done: ${fmt(amt)}${g ? ` → ${g.name}` : ''} · ${52 - c.deposits.length} to go`);
}
function challengesCard() {
  const items = state.challenges.slice().reverse().map(c => {
    const st = challengeStatus(c);
    const badge = st.state === 'won' ? '<span class="badge badge-success">Won</span>' : st.state === 'lost' ? '<span class="badge badge-danger">Lost</span>' : '<span class="badge">Active</span>';
    let body = '';
    if (c.type === 'week52') {
      body = `<div class="dots" role="img" aria-label="${st.done} of 52 weeks done">${Array.from({ length: 52 }, (_, i) => `<span class="${i < st.done ? 'on' : i < st.week ? 'due' : ''}"></span>`).join('')}</div>
        <p class="small">${fmt(st.saved)} of ${fmt(st.total)} · week ${st.week}${st.behind > 1 ? ` · <span class="tone-warn-text">${st.behind} weeks behind</span>` : ''}</p>
        ${st.state === 'active' ? `<button type="button" class="btn btn-sm btn-primary no-print" data-action="c52-deposit" data-id="${c.id}">Deposit week ${st.next}: ${fmt(st.nextAmount)}</button>` : ''}`;
    } else {
      body = `<div class="progress ${st.state === 'lost' ? 'over' : ''}" role="progressbar" aria-label="${esc(challengeTitle(c))} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(st.progress * 100)}"><span style="width:${st.progress * 100}%"></span></div>
        <p class="small">${st.state === 'lost' ? `Broken by ${st.why}.` : st.state === 'won' ? 'Done. Reward collected.' : `Day ${st.daysIn} of ${c.days}${c.type === 'cap' ? ` · today ${fmt(st.today)} of ${fmt(c.cap)}` : ''}`}</p>
        ${st.state === 'lost' ? `<button type="button" class="btn btn-sm no-print" data-action="retry-challenge" data-id="${c.id}">Try again</button>` : ''}`;
    }
    return `<li class="quest"><div class="quest-top"><strong>${esc(challengeTitle(c))}</strong>${badge}
      ${st.state === 'active' ? `<button type="button" class="icon-btn no-print" data-action="edit-challenge" data-id="${c.id}" aria-label="Edit challenge">${ICON.edit}</button>` : ''}<button type="button" class="icon-btn danger no-print" data-action="delete-challenge" data-id="${c.id}" aria-label="Delete challenge">${ICON.trash}</button></div>${body}</li>`;
  }).join('');
  return `<div class="card" id="challenges-card"><div class="card-head"><div><h2>Challenges</h2><p class="muted small">Win one for 150 XP.</p></div>
    <div class="actions no-print"><button type="button" class="btn btn-sm" data-action="add-challenge">${ICON.plus}<span>New</span></button></div></div>
    ${items ? `<ul class="quest-list">${items}</ul>` : '<div class="chart-empty"><p>Try a no-spend week on takeout, a daily spending cap, or the 52-week savings challenge.</p><button type="button" class="btn btn-sm no-print" data-action="add-challenge">Start a challenge</button></div>'}</div>`;
}

/* ---------- "Should I buy it?" + wishlist with a 48-hour cool-off ---------- */
const COOL_MS = 48 * 3600e3;
function buyVerdict(price) {
  const b = budgetTotals(), al = dailyAllowance();
  const wantsLeft = b.byType.wants.planned - b.byType.wants.actual;
  const reasons = [];
  const hrs = fmtHours(price);
  if (hrs) reasons.push(`That’s ${hrs}.`);
  if (b.income > 0) reasons.push(b.remaining > 0 ? `It’s ${fmtPct(price / b.remaining * 100)} of what you have left this month (${fmt(b.remaining)}).` : 'You’re already over budget this month.');
  if (al.perDay > 0) reasons.push(`About ${shortNum(price / al.perDay)} days of your daily allowance.`);
  const goals = state.goals.filter(g => !goalInfo(g).reached);
  const perMonth = sum(goals, g => g.planMonthly || (Number.isFinite(goalInfo(g).required) ? goalInfo(g).required : 0));
  if (goals.length && perMonth > 0) reasons.push(`Pushes your goals back by about ${Math.max(1, Math.round(price / perMonth * 30))} days.`);
  let verdict;
  if (b.income > 0 && price > Math.max(0, b.remaining)) verdict = 'no';
  else if ((b.byType.wants.planned > 0 && price > wantsLeft) || (al.perDay > 0 && price > al.perDay * 3) || (b.income > 0 && price > b.income * 0.1)) verdict = 'wait';
  else verdict = 'yes';
  const head = { yes: ['✅', 'Yes, go for it'], wait: ['🤔', 'Maybe wait'], no: ['✋', 'Not this month'] }[verdict];
  return { verdict, head, reasons, roast: roastLine(verdict === 'yes' ? 'buyYes' : verdict === 'wait' ? 'buyWait' : 'buyNo', String(price)) };
}
function wantsCategory() { return catLike(/fun|shop|want|misc|other/i, 'wants'); }
function buyItNow(name, price) {
  const cat = wantsCategory();
  if (!cat) { toast('Add a budget category first.'); return null; }
  const r = addExpense({ categoryId: cat.id, amount: price, date: todayISO(), note: name });
  return r;
}
function shouldIBuy(preset = {}) {
  formModal({
    title: 'Should I buy it?', submitLabel: 'Wait 48 hours', values: preset,
    fields: [
      { name: 'name', label: 'What is it?', kind: 'text', required: true, placeholder: 'e.g. Sneakers', max: 60 },
      { name: 'price', label: 'Price', kind: 'money', required: true, positive: true }
    ],
    live: (v, ok) => {
      if (!(v.price > 0)) return '<p class="muted small">Put in the price and you’ll get an answer.</p>';
      const r = buyVerdict(v.price);
      return `<div class="verdict verdict-${r.verdict}"><p class="verdict-head"><span aria-hidden="true">${r.head[0]}</span> ${r.head[1]}</p>
        <ul class="small">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${r.roast ? `<p class="small muted">“${esc(r.roast)}”</p>` : ''}</div>
        <div class="row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-buy="now" ${ok ? '' : 'disabled'}>I bought it</button><button type="button" class="btn btn-sm" data-buy="skip" ${ok ? '' : 'disabled'}>Skip it (+20 XP)</button></div>`;
    },
    onMount: form => {
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-buy]');
        if (!b) return;
        const r = readForm(form, [{ name: 'name', kind: 'text', required: true, max: 60 }, { name: 'price', kind: 'money', required: true, positive: true }], true);
        if (!r.ok) return;
        closeModal();
        if (b.dataset.buy === 'now') { const res = buyItNow(r.values.name, r.values.price); if (res) { state.wishlist.push({ id: uid(), name: r.values.name, price: r.values.price, addedAt: Date.now(), status: 'bought', decidedAt: todayISO() }); commit(); expenseToast(r.values.price, res); } }
        else skipPurchase(r.values.name, r.values.price, null);
      });
    },
    onSave: v => {
      state.wishlist.push({ id: uid(), name: v.name, price: v.price, addedAt: Date.now(), status: 'waiting', decidedAt: '' });
      commit(); toast(`${v.name} is on your wishlist. Check back in 48 hours`);
    }
  });
}
function skipPurchase(name, price, item) {
  if (item) { item.status = 'skipped'; item.decidedAt = todayISO(); }
  else state.wishlist.push({ id: uid(), name, price, addedAt: Date.now(), status: 'skipped', decidedAt: todayISO() });
  state.meta.skippedTotal += price;
  awardXP(20, 'skip', true);
  commit(); playSound('coin');
  toast(`Skipped ${name}. That’s ${fmt(price)} you kept (+20 XP)`, 3500);
}
function wishlistCard() {
  const now = Date.now();
  const waiting = state.wishlist.filter(w => w.status === 'waiting').sort((a, b) => a.addedAt - b.addedAt);
  const decided = state.wishlist.filter(w => w.status !== 'waiting').slice(-5).reverse();
  const skipped = state.meta.skippedTotal;
  const row = w => {
    const left = w.addedAt + COOL_MS - now, ready = left <= 0;
    const hrs = Math.ceil(left / 3600e3);
    return `<li class="wish ${ready ? 'is-ready' : ''}"><div><strong>${esc(w.name)}</strong> <span class="num">${fmt(w.price)}</span><br>
      <span class="small ${ready ? 'tone-success-text' : 'muted'}">${ready ? '48 hours are up. Still want it?' : `${plural(hrs, 'hour')} to go`}</span></div>
      <div class="wish-actions no-print">${ready ? `<button type="button" class="btn btn-sm" data-action="wish-buy" data-id="${w.id}">Buy</button>` : ''}
        <button type="button" class="btn btn-sm" data-action="wish-skip" data-id="${w.id}">Skip</button>
        <button type="button" class="icon-btn" data-action="edit-wish" data-id="${w.id}" aria-label="Edit ${esc(w.name)}">${ICON.edit}</button><button type="button" class="icon-btn danger" data-action="wish-delete" data-id="${w.id}" aria-label="Remove ${esc(w.name)}">${ICON.trash}</button></div></li>`;
  };
  return `<div class="card" id="wishlist-card"><div class="card-head"><div><h2>Wishlist</h2><p class="muted small">Stuff you want, waiting 48 hours before you buy it.</p></div>
    <div class="actions no-print"><button type="button" class="btn btn-sm btn-primary" data-action="should-i-buy">Should I buy it?</button></div></div>
    ${skipped > 0 ? `<p class="skip-total">Skipped so far: <strong class="num">${fmt(skipped)}</strong>${fmtHours(skipped) ? ` <span class="small muted">(${fmtHours(skipped)})</span>` : ''}</p>` : ''}
    ${waiting.length ? `<ul class="wish-list">${waiting.map(row).join('')}</ul>` : '<p class="muted small">Nothing here. Next time something’s tempting you, ask “Should I buy it?” first.</p>'}
    ${decided.length ? `<p class="small muted" style="margin-top:12px">Recent: ${decided.map(w => `${esc(w.name)} ${w.status === 'bought' ? '🛍️' : '💪'}`).join(' · ')}</p>` : ''}</div>`;
}

/* ---------- Split the bill ---------- */
function splitNames(text) { return String(text || '').split(/,|\band\b|&|\+/i).map(s => s.trim()).filter(Boolean).slice(0, 20).map(s => s.slice(0, 60)); }
function splitBillForm(preset = {}) {
  const cats = state.budget.categories;
  formModal({
    title: 'Split a bill', submitLabel: 'Split it',
    values: Object.assign({ paidBy: 'me', includeMe: true, logShare: cats.length > 0, categoryId: (catLike(/food|dining|eat/i, 'wants') || {}).id || '' }, preset),
    fields: [
      { name: 'what', label: 'What was it?', kind: 'text', required: true, placeholder: 'e.g. Friday dinner', max: 60, wide: true },
      { name: 'total', label: 'Total bill', kind: 'money', required: true, positive: true },
      { name: 'people', label: 'Split with (names)', kind: 'text', required: true, placeholder: 'Sam, Alex, Jordan', max: 200, help: 'Separate names with commas.' },
      { name: 'paidBy', label: 'Who paid?', kind: 'select', options: [['me', 'I paid'], ['other', 'Someone else paid']] },
      { name: 'payer', label: 'Who paid it?', kind: 'text', max: 60, placeholder: 'Name', hidden: true },
      { name: 'includeMe', label: 'Include me in the split', kind: 'check' },
      { name: 'logShare', label: 'Log my share as an expense', kind: 'check' },
      { name: 'categoryId', label: 'Category for my share', kind: 'select', options: cats.length ? cats.map(c => [c.id, c.name]) : [['', 'No categories yet']] }
    ],
    onMount: form => {
      const sync = () => { form.querySelector('[data-wrap="payer"]').hidden = form.querySelector('#f-paidBy').value !== 'other'; };
      form.querySelector('#f-paidBy').addEventListener('change', sync); sync();
    },
    live: v => {
      const names = splitNames(v.people);
      if (!(v.total > 0) || !names.length) return '';
      const n = names.length + (v.includeMe ? 1 : 0);
      const shares = F.splitShares(v.total, n);
      return `<div class="alert alert-info"><strong>${fmt(shares[shares.length - 1])}</strong> each, split ${n} ways${shares[0] !== shares[shares.length - 1] ? ` (your share is ${fmt(shares[0])} to cover the rounding)` : ''}.</div>`;
    },
    onSave: (v, form) => {
      const names = splitNames(v.people);
      const err = (id, msg) => { const el = form.querySelector('#f-' + id); el.setAttribute('aria-invalid', 'true'); form.querySelector(`#f-${id}-err`).textContent = msg; el.focus(); return false; };
      if (!names.length) return err('people', 'Add at least one name.');
      if (v.paidBy === 'other' && !(v.payer || '').trim()) return err('payer', 'Who paid the bill?');
      const shares = F.splitShares(v.total, names.length + (v.includeMe ? 1 : 0));
      const mine = v.includeMe ? shares[0] : 0;
      const others = v.includeMe ? shares.slice(1) : shares;
      const note = `Split: ${v.what}`;
      let ious = 0;
      if (v.paidBy === 'me') {
        names.forEach((p, i) => { state.wallet.ious.push({ id: uid(), person: p, dir: 'owed', amount: others[i], date: todayISO(), due: '', note, settled: false, settledAt: '' }); ious++; });
      } else if (mine > 0) {
        state.wallet.ious.push({ id: uid(), person: v.payer.trim().slice(0, 60), dir: 'owe', amount: mine, date: todayISO(), due: '', note, settled: false, settledAt: '' }); ious++;
      }
      if (v.logShare && mine > 0 && v.categoryId) addExpense({ categoryId: v.categoryId, amount: mine, date: todayISO(), note: v.what });
      awardXP(5, 'split', true);
      commit(); playSound('coin');
      toast(`Split ${fmt(v.total)} ${names.length + (v.includeMe ? 1 : 0)} ways and added ${plural(ious, 'IOU')}`, 4000);
    }
  });
}

/* ---------- Dashboard / Goals extras ---------- */
function questsCard() {
  const active = state.challenges.filter(c => challengeStatus(c).state === 'active');
  const cooling = state.wishlist.filter(w => w.status === 'waiting');
  const rec = state.recurring.filter(r => r.active).map(r => ({ r, d: recurringNext(r) })).filter(x => x.d).sort((a, b) => a.d - b.d)[0];
  const li = (icon, html) => `<li><span aria-hidden="true">${icon}</span><span>${html}</span></li>`;
  const items = [
    ...active.slice(0, 3).map(c => { const st = challengeStatus(c); return li('🏁', `${esc(challengeTitle(c))} (${c.type === 'week52' ? `week ${st.done} of 52` : `day ${st.daysIn} of ${c.days}`})`); }),
    cooling.length ? li('⏳', `${plural(cooling.length, 'thing')} on your wishlist`) : '',
    ...giftList().filter(g => g.days >= 0 && g.days <= 30 && g.status === 'Idea').slice(0, 2).map(g => li('🎁', `${esc(g.name)}’s ${esc(g.label.toLowerCase())} ${daysLabel(g.days).toLowerCase()}, no gift yet`)),
    rec ? li('🔁', `${esc(rec.r.name)} (${fmt(rec.r.amount)}) gets logged ${daysLabel(F.daysBetween(todayDate(), rec.d)).toLowerCase()}`) : ''
  ].filter(Boolean);
  return `<div class="card" id="quests-card"><div class="card-head"><div><h2>Coming up</h2><p class="muted small">Challenges, wishlist, gifts and bills.</p></div></div>
    ${items.length ? `<ul class="quest-mini">${items.join('')}</ul>` : '<p class="muted small">Nothing going on right now.</p>'}
</div>`;
}
function goalsExtras() { return `<div class="grid-2">${wishlistCard()}${challengesCard()}</div>`; }

