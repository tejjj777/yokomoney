/* YOKO! Student · Country settings, sample data.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   GLOBAL: country settings, sample data for any currency
   ========================================================= */
function applyCountry() { F.setDateOrder(countryInfo(state.settings.country).dates); }
function setCountry(code) {
  const c = countryInfo(code);
  state.settings.country = c.code;
  state.wallet.taxYearStart = c.fy;
  applyCountry(); commit();
  toast(`Country set to ${c.name}. Your tax year now starts in ${FULL_MONTHS[c.fy - 1]}`, 4000);
}
/** Turn the rupee sample into something that looks normal in the user's currency and country. */
function localizeSample(s) {
  const country = state.settings.country, cur = s.currency, k = scaleFor(cur), inIndia = country === 'IN';
  const m = v => (k === 1 ? v : niceAmount(v * k));
  // Streaming and gym prices are roughly global, so price them from dollars rather than scaling rupees
  const SUB_USD = { Netflix: 15.49, Spotify: 11.99, 'iCloud+': 2.99, 'Amazon Prime': 139, Gym: 40 };
  const fx = k / scaleFor('USD');
  const ms = x => {
    const usd = SUB_USD[x.name]; if (!usd) return niceAmount(x.amount * k);
    const v = usd * fx;
    return NO_DECIMALS.has(cur) || v >= 100 ? niceAmount(v) : Math.max(0.99, Math.ceil(v) - 0.01);
  };
  if (!inIndia) {
    const names = { Priya: 'Sam', Arjun: 'Alex', Rahul: 'Jordan' };
    const swap = t => String(t).replace(/Priya|Arjun|Rahul/g, x => names[x]);
    s.gifts.forEach(g => {
      g.name = swap(g.name);
      if (g.occasion === 'Diwali') { g.name = 'Family'; g.occasion = 'Custom'; g.customOccasion = 'Family reunion'; g.idea = 'Gift hampers'; }
      if (g.occasion === 'Raksha Bandhan') g.occasion = 'Birthday';
      if (g.idea === 'Silk saree') g.idea = 'Silk scarf';
    });
    s.wallet.ious.forEach(x => { x.person = swap(x.person); });
    s.wallet.cash.forEach(x => { x.note = swap(x.note).replace('Chai & samosa', 'Coffee & a snack').replace('Vegetable market', 'Farmers market').replace('Auto fare', 'Taxi fare'); });
    s.wallet.transport.forEach(x => { if (x.mode === 'auto') { x.mode = 'bus'; x.note = 'Market'; } });
    s.debts.forEach(d => { if (d.name === 'Phone EMI') d.name = 'Phone plan'; if (d.name === 'Bike loan') d.name = 'Car loan'; });
    s.recurring.forEach(r => { if (r.name === 'Bike loan EMI') r.name = 'Car loan payment'; });
    s.budget.expenses.forEach(x => { x.note = x.note.replace('Bike loan EMI', 'Car loan payment'); });
    s.payslips.forEach(p => { p.employer = 'Acme Technologies'; });
    s.rules = [{ id: uid(), match: 'starbucks', categoryId: (s.budget.categories.find(c => /food/i.test(c.name)) || s.budget.categories[0]).id }];
    s.income.others.forEach(o => { if (o.name === 'Freelance design') o.name = 'Freelance work'; });
    s.split.buckets.forEach(b => { if (b.name === 'Family support') b.name = 'Helping family'; });
  }
  s.wallet.taxYearStart = countryInfo(country).fy;
  s.wallet.deadlines = taxDeadlinePresets(country) || [];
  if (k === 1) return s;
  // scale every amount
  s.income.net = m(s.income.net); s.income.others.forEach(o => { o.amount = m(o.amount); });
  s.split.buckets.forEach(b => { if (b.mode === 'amount') b.value = m(b.value); });
  s.debts.forEach(d => { d.balance = m(d.balance); d.startBalance = m(d.startBalance); d.minPayment = m(d.minPayment); d.payments.forEach(p => { p.amount = m(p.amount); }); });
  const mins = sum(s.debts.filter(d => d.balance > 0), d => d.minPayment);
  s.debtSettings.extra = Math.max(0, niceAmount(s.income.net * 0.2 - mins));
  s.emi.principal = m(s.emi.principal);
  s.budget.categories.forEach(c => { c.planned = m(c.planned); });
  const sc = s.budget.categories.find(c => /subscri/i.test(c.name));
  s.subscriptions.forEach(x => { x.amount = ms(x); });
  if (sc) sc.planned = niceAmount(sum(s.subscriptions.filter(x => x.name !== 'Gym'), x => (x.cycle === 'yearly' ? x.amount / 12 : x.amount)));
  const everyday = new Set(s.budget.categories.filter(c => /food|transport|fun|bills/i.test(c.name)).map(c => c.id));
  s.budget.expenses.forEach((x, i) => { x.amount = everyday.has(x.categoryId) && !NO_DECIMALS.has(cur) ? Math.max(1, Math.floor(x.amount * k) - 1) + ((i * 37) % 89 + 7) / 100 : m(x.amount); delete x.roundup; });
  s.gifts.forEach(g => { g.budget = m(g.budget); });
  s.goals.forEach(g => {
    g.contributions = g.contributions.filter(c => !c.roundup);
    g.contributions.forEach(c => { c.amount = m(c.amount); });
    g.target = m(g.target); g.saved = sum(g.contributions, c => c.amount);
  });
  // round-ups again, in the new currency
  const to = roundUpFor(cur), jar = s.goals[2], ym = F.toISO(todayDate()).slice(0, 7);
  s.budget.expenses.forEach(x => {
    if (x.date.slice(0, 7) !== ym) return;
    const up = F.roundUpAmount(x.amount, to);
    if (!(up > 0.004)) return;
    const cid = uid(), cat = s.budget.categories.find(c => c.id === x.categoryId);
    jar.saved += up; jar.contributions.push({ id: cid, date: x.date, amount: up, note: `Round-up · ${cat ? cat.name : 'expense'}`, roundup: true });
    x.roundup = { goalId: jar.id, cid, amount: up };
  });
  s.settings.roundUp.to = to;
  const w = s.wallet;
  w.cash.forEach(x => { x.amount = m(x.amount); }); w.ious.forEach(x => { x.amount = m(x.amount); }); w.transport.forEach(x => { x.amount = m(x.amount); });
  w.taxes.forEach(x => { x.amount = m(x.amount); }); w.taxEstimate = m(w.taxEstimate);
  s.payslips.forEach(p => { ['gross', 'net', 'tax', 'pf', 'pt', 'esi', 'other'].forEach(f => { p[f] = m(p[f]); }); });
  s.settings.cashOnHand = m(s.settings.cashOnHand);
  s.recurring.forEach(r => {
    const d = r.debtId && s.debts.find(x => x.id === r.debtId), sub = r.subId && s.subscriptions.find(x => x.id === r.subId);
    r.amount = d ? d.minPayment : sub ? sub.amount : m(r.amount);
  });
  s.budget.expenses.forEach(x => {   // payments that match a real price keep that price
    const r = x.recurringId && s.recurring.find(k => k.id === x.recurringId), sub = s.subscriptions.find(k => k.name === x.note);
    if (r) x.amount = r.amount; else if (sub) x.amount = sub.amount;
  });
  const prevM = prevYM(F.toISO(todayDate()).slice(0, 7));
  s.budget.categories.forEach(c => { if (/rent|loan|debt|saving/i.test(c.name)) { const v = sum(s.budget.expenses.filter(x => x.categoryId === c.id && x.date.slice(0, 7) === prevM), x => x.amount); if (v > 0) c.planned = v; } });
  const ym0 = F.toISO(todayDate()).slice(0, 7);
  s.history.forEach(h => { h.income = m(h.income); h.cats.forEach(c => {
    c.planned = m(c.planned);
    const cc = s.budget.categories.find(k => k.name === c.name);
    c.actual = h.month === prevYM(ym0) && cc ? sum(s.budget.expenses.filter(x => x.categoryId === cc.id && x.date.slice(0, 7) === h.month), x => x.amount) : m(c.actual);
  }); });
  { const sp = s.split.buckets, base = s.income.net, pct = sum(sp.filter(b => b.mode === 'percent'), b => b.value), fixed = sp.filter(b => b.mode === 'amount');
    if (fixed.length === 1 && pct < 100) fixed[0].value = Math.round(base * (100 - pct) / 100); }
  s.wishlist.forEach(x => { x.price = m(x.price); });
  (s.yearlyBills || []).forEach(x => { x.amount = m(x.amount); });
  s.challenges.forEach(c => { if (c.type === 'week52') { c.unit = Math.max(1, niceAmount(c.unit * k)); c.deposits.forEach(d => { d.amount = c.unit * d.week; }); } });
  s.meta.skippedTotal = m(s.meta.skippedTotal);
  return s;
}
/** Example bank message in the user's currency (used by the tutorial). */
function sampleBankMessage() {
  const [y, mo, d] = todayISO().split('-');
  const date = countryInfo(state.settings.country).dates === 'mdy' ? `${mo}/${d}/${y}` : `${d}/${mo}/${y}`;
  if (state.currency === 'INR') return `Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On ${d}/${mo}/${y.slice(2)} Ref 123456789012`;
  const amt = niceAmount(250 * scaleFor(state.currency) * 0.5) || 12;
  return `Your card ending 1234 was charged ${state.currency} ${amt.toFixed(NO_DECIMALS.has(state.currency) ? 0 : 2)} at STARBUCKS on ${date}.`;
}

