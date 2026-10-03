/* YOKO! Student · Pick-from-a-list suggestions, checklists, subscription spotting, expense search and split.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   SUGGESTIONS: pick from a list instead of typing
   ========================================================= */
const EURO_COUNTRIES = ['IE', 'DE', 'FR', 'ES', 'IT', 'NL'];
const SUB_GROUPS = ['Streaming', 'Music', 'Shopping memberships', 'Cloud storage', 'Fitness', 'Phone plan', 'News', 'Gaming', 'Apps & AI'];
const GENERIC_SUBS = [['Streaming', 'Netflix'], ['Streaming', 'Disney+'], ['Streaming', 'YouTube Premium'], ['Streaming', 'Apple TV'], ['Music', 'Spotify'], ['Music', 'Apple Music'],
  ['Music', 'YouTube Music'], ['Shopping memberships', 'Amazon Prime'], ['Cloud storage', 'iCloud+'], ['Cloud storage', 'Google One'], ['Cloud storage', 'Dropbox'], ['Fitness', 'Gym membership'],
  ['Phone plan', 'Mobile phone plan'], ['News', 'News subscription'], ['Gaming', 'Xbox Game Pass'], ['Gaming', 'PlayStation Plus'], ['Gaming', 'Nintendo Switch Online'],
  ['Apps & AI', 'ChatGPT'], ['Apps & AI', 'Microsoft 365'], ['Apps & AI', 'Duolingo']];
function sugRegion() { const c = state.settings.country; return SUGGEST[c] ? c : EURO_COUNTRIES.includes(c) ? 'EU' : 'OTHER'; }
function sugData() {
  const r = sugRegion();
  if (r !== 'OTHER') return Object.assign({ region: r }, SUGGEST[r]);
  return { region: 'OTHER', cur: '', pc: '', subs: GENERIC_SUBS.map(([g, n]) => ({ g, n, c: 'monthly', p: [], s: '' })), rates: {}, lenders: {}, bills: {} };
}
/** Prices only make sense in the currency they were looked up in. */
const sugPrices = d => !!d.cur && d.cur === state.currency;
const sugCheckedLabel = () => { const [y, m] = SUGGEST_CHECKED.split('-').map(Number); return `${FULL_MONTHS[m - 1]} ${y}`; };
const sugPlaceLabel = d => (d.region === 'EU' ? `${d.pc || 'Germany'} (other euro countries can differ a little)` : countryInfo(state.settings.country).name);

/* ---------- Searchable list ---------- */
function comboHTML(id, label, placeholder) {
  return `<div class="combo"><label for="${id}" class="field-label">${esc(label)}</label>
    <input id="${id}" class="input" autocomplete="off" placeholder="${esc(placeholder)}" role="combobox" aria-expanded="true" aria-controls="${id}-list" aria-autocomplete="list" aria-describedby="${id}-err">
    <p class="field-error" id="${id}-err"></p>
    <ul class="combo-list" id="${id}-list" role="listbox" aria-label="${esc(label)}"></ul></div>`;
}
function bindCombo(root, id, options, onPick) {
  const inp = root.querySelector('#' + id), list = root.querySelector(`#${id}-list`);
  let active = -1;
  const opts = () => [...list.querySelectorAll('[data-v]')];
  const mark = () => opts().forEach((li, i) => { li.classList.toggle('is-active', i === active); li.setAttribute('aria-selected', String(i === active)); if (i === active) { inp.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } });
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const hits = options.filter(o => !q || o.toLowerCase().includes(q)).sort((a, b) => (b.toLowerCase().startsWith(q) ? 1 : 0) - (a.toLowerCase().startsWith(q) ? 1 : 0));
    const typed = inp.value.trim(), own = typed && !options.some(o => o.toLowerCase() === typed.toLowerCase());
    list.innerHTML = hits.map((o, i) => `<li role="option" id="${id}-o${i}" class="combo-opt${o.toLowerCase() === q ? ' is-picked' : ''}" data-v="${esc(o)}" aria-selected="false">${esc(o)}</li>`).join('')
      + (own ? `<li role="option" id="${id}-own" class="combo-opt combo-own" data-v="${esc(typed)}" aria-selected="false">Use “${esc(typed)}”</li>` : '')
      || '<li class="combo-empty small muted">Type the name</li>';
    active = -1; inp.removeAttribute('aria-activedescendant');
  };
  list.addEventListener('mousedown', e => e.preventDefault());   // keep the keyboard up on phones
  list.addEventListener('click', e => { const li = e.target.closest('[data-v]'); if (!li) return; inp.value = li.dataset.v; draw(); onPick(inp.value, true); });
  inp.addEventListener('input', () => { draw(); onPick(inp.value.trim(), false); });
  inp.addEventListener('keydown', e => {
    const n = opts().length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; mark(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; mark(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); opts()[active].click(); }
  });
  draw();
}

/* ---------- Debts ---------- */
const DEBT_TYPES = [['card', '💳', 'Credit card'], ['car', '🚗', 'Car loan'], ['student', '🎓', 'Student loan'], ['personal', '🏦', 'Personal loan'], ['mortgage', '🏠', 'Mortgage'],
  ['bnpl', '🛍️', 'Buy now pay later'], ['medical', '🩺', 'Medical bill'], ['family', '🤝', 'Family or friend'], ['other', '📄', 'Something else']];
const DEBT_ASK = {
  card: ['Which bank or card company?', 'Search or type, e.g. your bank'], car: ['Who is the loan with?', 'Search or type the lender'], student: ['Who is the loan with?', 'Search or type the lender'],
  personal: ['Who is the loan with?', 'Search or type the lender'], mortgage: ['Which lender?', 'Search or type the lender'], bnpl: ['Which service?', 'Search or type, e.g. Klarna'],
  medical: ['Who is the bill from?', 'e.g. City Hospital'], family: ['Who do you owe?', 'e.g. Mom'], other: ['What should we call it?', 'e.g. Laptop instalments']
};
function debtName(kind, who) {
  const has = w => who.toLowerCase().includes(w);
  switch (kind) {
    case 'card': return has('card') ? who : `${who} credit card`;
    case 'car': return has('loan') ? who : `${who} car loan`;
    case 'student': return has('loan') ? who : `${who} student loan`;
    case 'personal': return has('loan') ? who : `${who} personal loan`;
    case 'mortgage': return has('mortgage') ? who : `${who} mortgage`;
    case 'medical': return `${who} (medical)`;
    case 'family': return `Money owed to ${who}`;
    default: return who;
  }
}
/** "Often around 21–22%" with where that number comes from. Only for types we have a source for. */
function rateHintHTML(kind) {
  const r = sugData().rates[kind];
  if (!r) return '';
  const t = r.t.charAt(0).toUpperCase() + r.t.slice(1);
  return `${esc(t)}. Source: ${safeUrl(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.src)}</a>` : esc(r.src)}, checked ${sugCheckedLabel()}. Check your statement for your own rate.`;
}
function debtPicker(then) {
  const d = sugData();
  let kind = null;
  openModal({
    title: 'Add a debt', submitLabel: 'Next',
    body: '<div id="dp-stage" class="stack"></div>',
    onMount: form => {
      const st = form.querySelector('#dp-stage'), submit = form.querySelector('button[type="submit"]');
      const stage1 = () => {
        kind = null; submit.hidden = true;
        st.innerHTML = `<p>What kind of debt is it?</p><div class="pick-grid">${DEBT_TYPES.map(([k, ic, l]) => `<button type="button" class="pick-tile" data-kind="${k}"><span class="pick-ic" aria-hidden="true">${ic}</span><span>${l}</span></button>`).join('')}</div>`;
        st.querySelector('.pick-tile').focus();
      };
      const stage2 = k => {
        kind = k; submit.hidden = false;
        const [label, ph] = DEBT_ASK[k], t = DEBT_TYPES.find(x => x[0] === k);
        const lenders = d.lenders[k] || [];
        st.innerHTML = `<p class="small"><button type="button" class="linklike" id="dp-back">‹ Back</button> <span class="muted">· ${t[1]} ${t[2]}</span></p>
          ${lenders.length ? comboHTML('dp-who', label, ph) : `<div class="field"><label for="dp-who">${esc(label)}</label><input id="dp-who" class="input" maxlength="50" placeholder="${esc(ph)}" aria-describedby="dp-who-err"><p class="field-error" id="dp-who-err"></p></div>`}
          ${rateHintHTML(k) ? `<p class="help">${rateHintHTML(k)}</p>` : ''}`;
        if (lenders.length) bindCombo(st, 'dp-who', lenders, () => { st.querySelector('#dp-who-err').textContent = ''; });
        st.querySelector('#dp-who').focus();
      };
      st.addEventListener('click', e => {
        const tile = e.target.closest('[data-kind]'); if (tile) { stage2(tile.dataset.kind); return; }
        if (e.target.closest('#dp-back')) stage1();
      });
      stage1();
    },
    onSubmit: form => {
      if (!kind) return false;
      const inp = form.querySelector('#dp-who'), who = inp.value.trim().slice(0, 50);
      if (!who) { form.querySelector('#dp-who-err').textContent = 'Pick one from the list or type a name.'; inp.focus(); return false; }
      const k = kind;
      setTimeout(() => debtForm(null, { name: debtName(k, who).slice(0, 60), kind: k, hint: rateHintHTML(k), then }), 0);
      return true;
    }
  });
}

/* ---------- Goals ---------- */
const GOAL_TEMPLATES = [['emergency', '🛟', 'Emergency fund', 12], ['trip', '✈️', 'Trip', 6], ['car', '🚗', 'Car', 18], ['wedding', '💍', 'Wedding', 24],
  ['home', '🏡', 'Home deposit', 60], ['gadget', '📱', 'Gadget', 4], ['custom', '✏️', 'Something else', 12]];
/** Rough starting targets. They're guesses the user is told to change. */
function goalSuggestion(k) {
  const inc = monthlyIncome();
  const hist = state.history.slice(-3);
  let spend = hist.length ? sum(hist, histSpent) / hist.length : sum(state.budget.categories.filter(c => c.type !== 'savings'), c => c.planned);
  const mult = { trip: 0.5, car: 3, wedding: 4, home: 12, gadget: 0.5 }[k];
  if (k === 'emergency') return spend > 0 ? { target: niceAmount(spend * 3), note: `Suggested: 3 months of your usual spending (${fmt(spend)} a month). Change it if you like.` } : { note: 'Aim for about 3 months of what you usually spend.' };
  if (mult && inc > 0) return { target: niceAmount(inc * mult), note: 'The target is a rough starting point based on your income. Change it to the real cost.' };
  return { note: '' };
}
function goalPicker(then) {
  openModal({
    title: 'Add a goal', hideSubmit: true,
    body: `<p>What are you saving for?</p><div class="pick-grid">${GOAL_TEMPLATES.map(([k, ic, l]) => `<button type="button" class="pick-tile" data-goal="${k}"><span class="pick-ic" aria-hidden="true">${ic}</span><span>${l}</span></button>`).join('')}</div>`,
    onMount: form => {
      form.querySelector('.pick-tile').focus();
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-goal]'); if (!b) return;
        const [k, , label, months] = GOAL_TEMPLATES.find(x => x[0] === b.dataset.goal);
        const s = goalSuggestion(k);
        closeModal(true);
        goalForm(null, { values: { name: k === 'custom' ? '' : label, target: s.target, deadline: F.toISO(F.addMonths(todayDate(), months)) }, note: s.note, then });
      });
    }
  });
}

/* ---------- Checklists: subscriptions and bills ---------- */
function ensureCat(re, name, type) {
  let c = state.budget.categories.find(k => re.test(k.name));
  if (!c) { c = { id: uid(), name, type, planned: 0, actual: 0, bucketId: '' }; c.bucketId = guessBucket(c, state.split.buckets); state.budget.categories.push(c); }
  return c;
}
function billGroups(d) {
  const b = d.bills || {};
  const g = (name, list, fallback) => ({ g: name, items: (list && list.length ? list : fallback).map(n => ({ n, c: name === 'Insurance' ? 'yearly' : 'monthly', p: [] })) });
  return [g('Housing', null, ['Rent', 'Mortgage payment']), g('Internet', b.Internet, ['Internet']), g('Phone', b.Phone, ['Phone bill']),
    g('Power & gas', b['Power & gas'], ['Electricity', 'Gas']), g('Insurance', b.Insurance, ['Car insurance', 'Home insurance', 'Health insurance']), g('Other', null, ['Water', 'Childcare', 'Other bill'])];
}
const nextMonthSameDay = () => F.toISO(F.addMonths(todayDate(), 1));
const firstOfNextMonth = () => { const t = todayDate(); return F.toISO(new Date(t.getFullYear(), t.getMonth() + 1, 1)); };
function checklistModal(mode, then) {
  const d = sugData(), priced = mode === 'sub' && sugPrices(d);
  const groups = mode === 'sub' ? SUB_GROUPS.map(g => ({ g, items: d.subs.filter(s => s.g === g) })).filter(x => x.items.length) : billGroups(d);
  const have = new Set((mode === 'sub' ? state.subscriptions.map(s => s.name) : state.recurring.map(r => r.name).concat(state.yearlyBills.map(b => b.name))).map(n => n.toLowerCase()));
  const items = []; groups.forEach(gr => gr.items.forEach(it => items.push(Object.assign({ group: gr.g }, it))));
  const sym = esc(CURRENCIES[state.currency].symbol);
  const from = it => (priced && it.p.length ? `from ${fmt(Math.min(...it.p.map(p => p[1])))}${it.c === 'yearly' ? '/yr' : '/mo'}` : '');
  const row = (it, i) => {
    const had = have.has(it.n.toLowerCase());
    const plans = priced ? it.p : [];
    return `<div class="ck-item" data-i="${i}" data-name="${esc(it.n.toLowerCase())}">
      <label class="ck-row"><input type="checkbox" class="ck-on" data-i="${i}" ${had ? 'disabled' : ''}><span class="ck-name">${esc(it.n)}</span><span class="ck-meta small muted">${had ? 'already added' : from(it)}</span></label>
      <div class="ck-more" id="ck-more-${i}" hidden>
        ${plans.length > 1 ? `<div class="field ck-plan"><label for="ck-plan-${i}">Plan</label><select id="ck-plan-${i}" class="select" data-plan="${i}">${plans.map((p, k) => `<option value="${k}">${esc(p[0])} · ${fmt(p[1])}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="ck-amt-${i}">${mode === 'sub' ? 'Price' : 'Amount'}</label><div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="ck-amt-${i}" class="input" inputmode="decimal" autocomplete="off" value="${plans.length ? numStr(plans[0][1]) : ''}" aria-describedby="ck-err-${i}"></div>
          ${plans.length ? '<p class="help">Typical price. Check your bill.</p>' : ''}<p class="field-error" id="ck-err-${i}"></p></div>
        <div class="field"><label for="ck-cyc-${i}">Billed</label><select id="ck-cyc-${i}" class="select"><option value="monthly" ${it.c !== 'yearly' ? 'selected' : ''}>Monthly</option><option value="yearly" ${it.c === 'yearly' ? 'selected' : ''}>Yearly</option></select></div>
        <div class="field"><label for="ck-date-${i}">${mode === 'sub' ? 'Next renewal' : 'Next due'}</label><input id="ck-date-${i}" class="input" type="date" value="${mode === 'sub' ? nextMonthSameDay() : firstOfNextMonth()}"></div>
      </div></div>`;
  };
  let idx = 0;
  const body = `<p>${mode === 'sub' ? 'Do you pay for any of these? Tick them and check the price.' : 'Which bills do you pay? Tick them and put in what you usually pay.'}</p>
    <div class="field"><label for="ck-q" class="sr-only">Search</label><input id="ck-q" class="input" type="search" placeholder="Search" autocomplete="off"></div>
    <div class="ck-list">${groups.map(gr => `<section class="ck-group" data-group="${esc(gr.g)}"><h3>${esc(gr.g)}</h3>${gr.items.map(it => row(it, idx++)).join('')}</section>`).join('')}</div>
    ${mode === 'sub' ? `<label class="check"><input type="checkbox" id="ck-rec" checked> Log them in my budget when they renew</label>` : '<p class="small muted">Monthly bills get logged in your budget when they’re due. Yearly ones go under Budget → Yearly bills so you can put a little aside each month.</p>'}
    <p class="small">Not on the list? <button type="button" class="linklike" id="ck-other">Add it by hand</button></p>
    ${priced ? `<details class="collapsible"><summary>Where these prices come from</summary><div class="details-body small"><p>Typical prices for ${esc(sugPlaceLabel(d))}, checked ${sugCheckedLabel()}. Prices change, so check your own bill.</p><ul class="src-list">${d.subs.filter(s => safeUrl(s.s) && s.p.length).map(s => `<li>${esc(s.n)}: <a href="${esc(s.s)}" target="_blank" rel="noopener">source</a></li>`).join('')}</ul></div></details>`
      : (mode === 'sub' && d.cur ? `<p class="small muted">Prices are left blank because your currency isn’t ${esc(d.cur)}.</p>` : '')}`;
  openModal({
    title: mode === 'sub' ? 'Add subscriptions' : 'Add bills', submitLabel: 'Add', wide: true, body,
    onMount: form => {
      const submit = form.querySelector('button[type="submit"]');
      const count = () => { const n = form.querySelectorAll('.ck-on:checked').length; submit.textContent = n ? `Add ${n}` : 'Add'; };
      form.addEventListener('change', e => {
        if (e.target.classList.contains('ck-on')) { const more = form.querySelector(`#ck-more-${e.target.dataset.i}`); more.hidden = !e.target.checked; e.target.closest('.ck-item').classList.toggle('is-on', e.target.checked); if (e.target.checked) { const a = more.querySelector('input.input'); if (a && !a.value) a.focus(); } count(); }
        if (e.target.dataset.plan !== undefined) { const i = +e.target.dataset.plan; form.querySelector(`#ck-amt-${i}`).value = numStr(items[i].p[+e.target.value][1]); }
      });
      form.querySelector('#ck-q').addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        form.querySelectorAll('.ck-item').forEach(el => { el.hidden = !!q && !el.dataset.name.includes(q) && !el.querySelector('.ck-on').checked; });
        form.querySelectorAll('.ck-group').forEach(gr => { gr.hidden = ![...gr.querySelectorAll('.ck-item')].some(el => !el.hidden); });
      });
      form.querySelector('#ck-other').addEventListener('click', () => { closeModal(true); if (mode === 'sub') subscriptionForm(null); else recurringForm(null); });
      count();
    },
    onSubmit: form => {
      const on = [...form.querySelectorAll('.ck-on:checked')].map(x => +x.dataset.i);
      if (!on.length) { toast('Tick at least one, or close this.'); return false; }
      let bad = null;
      const picks = on.map(i => {
        const a = form.querySelector(`#ck-amt-${i}`), r = validateValue('money', a.value, { required: true, positive: true });
        form.querySelector(`#ck-err-${i}`).textContent = r.error || ''; a.toggleAttribute('aria-invalid', !!r.error);
        if (r.error && !bad) bad = a;
        const plan = form.querySelector(`#ck-plan-${i}`);
        const dt = form.querySelector(`#ck-date-${i}`).value;
        return { it: items[i], amount: r.value, cycle: form.querySelector(`#ck-cyc-${i}`).value, date: F.parseDate(dt) ? dt : firstOfNextMonth(), plan: plan ? items[i].p[+plan.value][0] : (priced && items[i].p.length === 1 ? items[i].p[0][0] : '') };
      });
      if (bad) { bad.focus(); return false; }
      if (mode === 'sub') {
        const cat = ensureCat(/subscri/i, 'Subscriptions', 'wants'), rec = form.querySelector('#ck-rec').checked;
        picks.forEach(p => {
          const sub = { id: uid(), name: p.it.n, amount: p.amount, cycle: p.cycle, since: todayISO(), usage: {}, kept: '', plan: p.plan };
          state.subscriptions.push(sub);
          if (rec) state.recurring.push({ id: uid(), name: sub.name, amount: sub.amount, freq: sub.cycle === 'yearly' ? 'yearly' : 'monthly', start: p.date, lastPosted: '', categoryId: cat.id, debtId: null, subId: sub.id, active: true });
        });
        const monthly = Math.round(sum(state.subscriptions, subMonthly) * 100) / 100;
        const raised = cat.planned < monthly; if (raised) cat.planned = monthly;
        commit();
        toast(`Added ${plural(picks.length, 'subscription')}, ${fmt(sum(picks, p => (p.cycle === 'yearly' ? p.amount / 12 : p.amount)))} a month${raised ? `. Your ${cat.name} budget is now ${fmt(monthly)}` : ''}`, 4500);
      } else {
        let yearly = 0;
        picks.forEach(p => {
          if (p.cycle === 'yearly') { state.yearlyBills.push({ id: uid(), name: p.it.n, amount: p.amount, due: p.date }); yearly++; return; }
          const cat = p.it.group === 'Housing' ? ensureCat(/rent|housing|mortgage/i, 'Rent', 'needs') : ensureCat(/^bills?$|utilit/i, 'Bills', 'needs');
          state.recurring.push({ id: uid(), name: p.it.n, amount: p.amount, freq: 'monthly', start: p.date, lastPosted: '', categoryId: cat.id, debtId: null, subId: null, active: true });
        });
        commit();
        toast(`Added ${plural(picks.length, 'bill')}${yearly ? ` (${yearly} yearly, under Yearly bills)` : ''}`, 4000);
      }
      if (then) setTimeout(then, 0);
      return true;
    }
  });
}
const subsChecklist = then => checklistModal('sub', then);
const billsChecklist = then => checklistModal('bill', then);

/* ---------- Spotting subscriptions and price changes in bank data ---------- */
const nameWords = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !['plus', 'premium', 'the', 'and', 'subscription', 'membership', 'plan'].includes(w));
/** "NETFLIX.COM 1234" matches the Netflix subscription; "AMAZON MKTPLACE" doesn't match "Amazon Prime". */
function noteMatchesSub(note, name) {
  const words = nameWords(name), text = String(note || '').toLowerCase();
  return words.length > 0 && words.every(w => text.includes(w));
}
const prettyName = s => { const t = String(s || '').replace(/^🔁\s*/, '').trim().slice(0, 40); return t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : t; };
let priceFlags = [];
function flagPriceChange(exp) {
  if (!exp.note || /^🔁/.test(exp.note) || !(exp.amount > 0)) return;
  const sub = state.subscriptions.find(s => noteMatchesSub(exp.note, s.name));
  if (!sub || Math.abs(exp.amount - sub.amount) < 0.01) return;
  if (exp.amount > sub.amount * 1.6 || exp.amount < sub.amount * 0.6) return;   // too different to be the same bill
  sub.priceChange = { from: sub.amount, to: exp.amount, date: exp.date };
  priceFlags.push(sub);
}
function takePriceFlags() {
  const f = priceFlags; priceFlags = [];
  if (!f.length) return '';
  const s = f[0], up = s.priceChange.to > s.priceChange.from;
  return `${s.name} went ${up ? 'up' : 'down'} ${fmt(Math.abs(s.priceChange.to - s.priceChange.from))}`;
}
/** Merchants in imported bank data charged about monthly (or yearly) for about the same amount. */
function findRecurringCharges() {
  const today = todayISO(), marks = state.meta.subSuggest || {};
  const savings = new Set(state.budget.categories.filter(c => c.type === 'savings' || /loan|debt|rent|mortgage/i.test(c.name)).map(c => c.id));
  const groups = {};
  state.budget.expenses.forEach(x => {
    if (x.recurringId || savings.has(x.categoryId)) return;
    const k = merchantKey(x.note); if (!k) return;
    if (state.subscriptions.some(s => noteMatchesSub(x.note, s.name)) || state.recurring.some(r => merchantKey(r.name) === k)) return;
    (groups[k] = groups[k] || []).push(x);
  });
  const out = [];
  for (const [k, list] of Object.entries(groups)) {
    if (marks[k] === 'no') continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list.slice(-3);
    if (last.length < 2) continue;
    const gaps = last.slice(1).map((x, i) => F.daysBetween(F.parseDate(last[i].date), F.parseDate(x.date)));
    const weekly = gaps.every(g => g >= 6 && g <= 8);
    const monthly = gaps.every(g => g >= 25 && g <= 35);
    const yearly = gaps.every(g => g >= 350 && g <= 380);
    if (!weekly && !monthly && !yearly) continue;
    const ref = last[last.length - 1].amount;
    if (!last.every(x => Math.abs(x.amount - ref) <= Math.max(1, ref * 0.15))) continue;
    const later = typeof marks[k] === 'string' && marks[k].startsWith('later:') ? marks[k].slice(6) : '';
    const cycle = weekly ? 'weekly' : yearly ? 'yearly' : 'monthly';
    out.push({ key: k, name: prettyName(last[last.length - 1].note), amount: ref, cycle, last: last[last.length - 1].date, snoozed: !!later && later > today });
  }
  return out;
}
function subSuggestModal(all) {
  const list = findRecurringCharges().filter(s => all || !s.snoozed);
  if (!list.length) { toast('Nothing new that looks like a subscription.'); return; }
  const cycleLabel = c => (c === 'weekly' ? 'week' : c === 'yearly' ? 'year' : 'month');
  const rowHTML = s => `<li class="sug-row" data-k="${esc(s.key)}"><p>You pay <strong>${esc(s.name)}</strong> ${fmt(s.amount)} every ${cycleLabel(s.cycle)}. Add it as a subscription?</p>
    <div class="sug-btns">
      <button type="button" class="btn btn-sm btn-primary" data-sg="add">Add</button>
      <button type="button" class="btn btn-sm btn-warn" data-sg="unused">Mark unused</button>
      <button type="button" class="btn btn-sm" data-sg="no">Not a subscription</button>
      <button type="button" class="btn btn-sm" data-sg="later">Ask later</button>
    </div></li>`;
  openModal({
    title: 'These look like subscriptions', hideSubmit: true, cancelLabel: 'Close',
    body: `<p class="small muted">Found in your expenses: the same payee, similar amount, on a regular weekly or monthly schedule.</p><ul class="sug-list">${list.map(rowHTML).join('')}</ul>`,
    onMount: form => {
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-sg]'); if (!b) return;
        const li = b.closest('[data-k]'), s = list.find(x => x.key === li.dataset.k);
        state.meta.subSuggest = state.meta.subSuggest || {};
        if (b.dataset.sg === 'add') {
          state.subscriptions.push({ id: uid(), name: s.name, amount: s.amount, cycle: s.cycle, since: s.last, usage: {}, kept: '', plan: '' });
          toast(`${s.name} added to subscriptions`);
        } else if (b.dataset.sg === 'unused') {
          const p = prevYM(todayISO().slice(0, 7)), p2 = prevYM(p);
          state.subscriptions.push({ id: uid(), name: s.name, amount: s.amount, cycle: s.cycle, since: s.last, usage: { [p2]: false, [p]: false }, kept: '', plan: '' });
          toast(`${s.name} marked as unused. Check Subscription check-in to review cancelling.`);
        } else if (b.dataset.sg === 'no') state.meta.subSuggest[s.key] = 'no';
        else state.meta.subSuggest[s.key] = 'later:' + F.toISO(F.addDays(todayDate(), 7));
        commit();
        li.remove();
        if (!form.querySelector('[data-k]')) closeModal();
        else form.querySelector('[data-k] button').focus();
      });
    }
  });
}

/* ---------- Expense note autocomplete ---------- */
function shopHistory() {
  const m = {};
  state.budget.expenses.forEach(x => {
    const n = x.note.trim(); if (!n || /^🔁/.test(n)) return;
    const k = n.toLowerCase(), e = m[k] || (m[k] = { note: n, lower: k, n: 0, cats: {}, last: '' });
    e.n++; e.cats[x.categoryId] = (e.cats[x.categoryId] || 0) + 1; if (x.date > e.last) { e.last = x.date; e.note = n; }
  });
  return Object.values(m).map(e => Object.assign(e, { cat: Object.entries(e.cats).sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
}
function bindNoteAutocomplete(form) {
  const note = form.querySelector('#f-note'), cat = form.querySelector('#f-categoryId');
  if (!note || !cat) return;
  const shops = shopHistory();
  let touched = false, active = -1, hits = [];
  cat.addEventListener('change', e => { if (e.isTrusted) touched = true; });
  note.setAttribute('role', 'combobox'); note.setAttribute('aria-autocomplete', 'list'); note.setAttribute('aria-controls', 'note-ac'); note.setAttribute('aria-expanded', 'false');
  note.insertAdjacentHTML('afterend', '<ul class="ac-list" id="note-ac" role="listbox" aria-label="Shops you’ve used" hidden></ul>');
  const ac = form.querySelector('#note-ac');
  const setCat = s => {
    if (touched || !s) return;
    const id = state.budget.categories.some(c => c.id === s.cat) ? s.cat : null;
    if (id && cat.value !== id) { cat.value = id; cat.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  const close = () => { ac.hidden = true; note.setAttribute('aria-expanded', 'false'); active = -1; };
  const pick = s => { note.value = s.note; setCat(s); close(); note.dispatchEvent(new Event('input', { bubbles: true })); };
  const catName = id => (state.budget.categories.find(c => c.id === id) || {}).name || '';
  note.addEventListener('input', e => {
    const q = note.value.trim().toLowerCase();
    setCat(shops.find(s => s.lower === q));
    if (!e.isTrusted) return;
    hits = q ? shops.filter(s => s.lower.includes(q) && s.lower !== q).slice(0, 5) : [];
    ac.innerHTML = hits.map((s, i) => `<li role="option" id="note-ac-${i}" data-i="${i}" aria-selected="false"><span>${esc(s.note)}</span><span class="small muted">${esc(catName(s.cat))}</span></li>`).join('');
    ac.hidden = !hits.length; note.setAttribute('aria-expanded', String(!!hits.length)); active = -1;
  });
  note.addEventListener('keydown', e => {
    if (ac.hidden) return;
    const n = hits.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % n; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % n; }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]); return; }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    else return;
    [...ac.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    note.setAttribute('aria-activedescendant', `note-ac-${active}`);
  });
  ac.addEventListener('mousedown', e => e.preventDefault());
  ac.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) pick(hits[+li.dataset.i]); });
  note.addEventListener('blur', () => setTimeout(close, 150));
}

/* ---------- Onboarding, optional step 4 ---------- */
function onboardExtras() {
  const nd = state.debts.length, ns = state.subscriptions.length;
  openModal({
    title: 'One more thing (optional)', hideSubmit: true, cancelLabel: nd || ns ? 'I’m done' : 'Skip',
    body: `<p>Any debts or subscriptions? Adding them now fills in your debt-free date and what your subscriptions cost you a year.</p>
      <div class="pick-grid two"><button type="button" class="pick-tile" data-ob="debt"><span class="pick-ic" aria-hidden="true">💳</span><span>Add a debt</span></button>
      <button type="button" class="pick-tile" data-ob="subs"><span class="pick-ic" aria-hidden="true">📺</span><span>Pick my subscriptions</span></button></div>
      ${nd || ns ? `<p class="small tone-success-text">Added so far: ${[nd ? plural(nd, 'debt') : '', ns ? plural(ns, 'subscription') : ''].filter(Boolean).join(', ')}.</p>` : ''}`,
    onMount: form => form.addEventListener('click', e => {
      const b = e.target.closest('[data-ob]'); if (!b) return;
      closeModal(true);
      if (b.dataset.ob === 'debt') debtPicker(onboardExtras); else subsChecklist(onboardExtras);
    })
  });
}

/* ---------- Expense search ---------- */
const emptyExpFilter = () => ({ q: '', cat: '', min: '', max: '', from: '', to: '' });
const expFilterActive = f => !!(f && (f.q.trim() || f.cat || f.min || f.max || f.from || f.to));
function filterExpenses(f) {
  const q = f.q.trim().toLowerCase(), min = parseAmount(f.min), max = parseAmount(f.max);
  const names = Object.fromEntries(state.budget.categories.map(c => [c.id, c.name.toLowerCase()]));
  return state.budget.expenses.filter(x => {
    if (f.cat && x.categoryId !== f.cat) return false;
    if (f.from && x.date < f.from) return false;
    if (f.to && x.date > f.to) return false;
    if (min && x.amount < min - 0.004) return false;
    if (max && x.amount > max + 0.004) return false;
    if (q && !(x.note.toLowerCase().includes(q) || (names[x.categoryId] || '').includes(q) || numStr(x.amount) === q.replace(/,/g, ''))) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function expFilterBar(f, cats) {
  const more = ui.expMore || !!(f.min || f.max || f.from || f.to);
  const on = expFilterActive(f);
  return `<div class="exp-filter no-print" role="search" aria-label="Search expenses">
    <div class="exp-filter-row">
      <label class="sr-only" for="exp-q">Search expenses</label>
      <input id="exp-q" class="input input-sm" type="search" placeholder="Search shop, note or amount" value="${esc(f.q)}" data-filter="q" autocomplete="off">
      <label class="sr-only" for="exp-cat">Category</label>
      <select id="exp-cat" class="select input-sm" data-filter="cat"><option value="">All categories</option>${cats.map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button type="button" class="btn btn-sm" data-action="exp-more" aria-expanded="${more}" aria-controls="exp-more-row">Filters</button>
      ${on ? '<button type="button" class="linklike small" data-action="exp-clear">Clear</button>' : ''}
    </div>
    <div class="exp-filter-row" id="exp-more-row" ${more ? '' : 'hidden'}>
      <div class="exp-pair"><label for="exp-min" class="small muted">Amount</label>
        <input id="exp-min" class="input input-sm" inputmode="decimal" placeholder="Min" value="${esc(f.min)}" data-filter="min" autocomplete="off">
        <span class="muted" aria-hidden="true">to</span><label class="sr-only" for="exp-max">Maximum amount</label>
        <input id="exp-max" class="input input-sm" inputmode="decimal" placeholder="Max" value="${esc(f.max)}" data-filter="max" autocomplete="off"></div>
      <div class="exp-pair"><label for="exp-from" class="small muted">Dates</label>
        <input id="exp-from" class="input input-sm" type="date" value="${esc(f.from)}" data-filter="from">
        <span class="muted" aria-hidden="true">to</span><label class="sr-only" for="exp-to">To date</label>
        <input id="exp-to" class="input input-sm" type="date" value="${esc(f.to)}" data-filter="to"></div>
    </div></div>`;
}

/* ---------- Split one expense across categories ---------- */
function splitExpenseForm(pre = {}) {
  const cats = state.budget.categories;
  if (cats.length < 2) { toast('You need at least two budget categories to split an expense.'); return; }
  const sym = esc(CURRENCIES[state.currency].symbol);
  const opts = sel => cats.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const line = (i, sel) => `<div class="split-line" data-line>
      <label class="sr-only" for="spl-cat-${i}">Category ${i + 1}</label><select id="spl-cat-${i}" class="select input-sm" data-l="cat">${opts(sel)}</select>
      <div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><label class="sr-only" for="spl-amt-${i}">Amount ${i + 1}</label>
      <input id="spl-amt-${i}" class="input input-sm" inputmode="decimal" autocomplete="off" data-l="amt" ${i === 0 ? 'readonly tabindex="-1" placeholder="The rest"' : 'placeholder="0"'}></div>
      ${i === 0 ? '<span class="small muted">the rest</span>' : `<button type="button" class="icon-btn danger" data-rm aria-label="Remove line ${i + 1}">${ICON.trash}</button>`}</div>`;
  let n = 2;
  const flex = cats.filter(c => c.type !== 'savings' && !/rent|mortgage|loan|debt|yearly/i.test(c.name));
  const pick = flex.length >= 2 ? flex : cats;
  openModal({
    title: 'Split an expense', submitLabel: 'Add expenses', wide: true,
    body: `<div class="form-grid two">
        <div class="field"><label for="spl-total">Total</label><div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="spl-total" class="input" inputmode="decimal" autocomplete="off" value="${pre.amount ? numStr(pre.amount) : ''}" aria-describedby="spl-total-err"></div><p class="field-error" id="spl-total-err"></p></div>
        <div class="field"><label for="spl-date">Date</label><input id="spl-date" class="input" type="date" value="${esc(pre.date || todayISO())}"></div>
        <div class="field wide"><label for="spl-note">Note</label><input id="spl-note" class="input" maxlength="120" value="${esc(pre.note || '')}" placeholder="e.g. Supermarket"></div></div>
      <p class="small muted">Type what went to each category. Whatever’s left goes to the first one.</p>
      <div id="spl-lines" class="stack">${line(0, pick[0].id)}${line(1, (pick[1] || cats[1]).id)}</div>
      <p><button type="button" class="btn btn-sm" id="spl-add">${ICON.plus}<span>Add a line</span></button></p>
      <div id="spl-status" aria-live="polite"></div>`,
    onMount: form => {
      const lines = form.querySelector('#spl-lines');
      const read = () => {
        const total = validateValue('money', form.querySelector('#spl-total').value, { required: true, positive: true });
        const rows = [...lines.querySelectorAll('[data-line]')].map(r => ({ el: r, cat: r.querySelector('[data-l=cat]').value, amt: r.querySelector('[data-l=amt]') }));
        const others = rows.slice(1).map(r => validateValue('money', r.amt.value, { required: false }));
        const used = sum(others, o => (o.error ? 0 : o.value || 0));
        return { total, rows, others, rest: (total.value || 0) - used };
      };
      const refresh = () => {
        const r = read(), st = form.querySelector('#spl-status');
        r.rows[0].amt.value = r.total.value ? numStr(Math.round(r.rest * 100) / 100) : '';
        st.innerHTML = !r.total.value ? '' : r.rest < -0.004 ? `<div class="alert alert-danger">The lines add up to ${fmt(-r.rest)} more than the total.</div>`
          : r.rest < 0.005 ? '<div class="alert alert-warn">The first line would be empty. Lower one of the others.</div>'
          : `<div class="alert alert-info">${esc(cats.find(c => c.id === r.rows[0].cat).name)} gets the remaining ${fmt(r.rest)}.</div>`;
      };
      form.addEventListener('input', refresh); form.addEventListener('change', refresh);
      form.querySelector('#spl-add').addEventListener('click', () => { lines.insertAdjacentHTML('beforeend', line(n, cats[Math.min(n, cats.length - 1)].id)); n++; refresh(); lines.lastElementChild.querySelector('[data-l=amt]').focus(); });
      lines.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { b.closest('[data-line]').remove(); refresh(); } });
      form._read = read;
      refresh();
      (pre.amount ? form.querySelector('#spl-amt-1') : form.querySelector('#spl-total')).focus();
    },
    onSubmit: form => {
      const r = form._read(), tEl = form.querySelector('#spl-total');
      if (r.total.error) { tEl.setAttribute('aria-invalid', 'true'); form.querySelector('#spl-total-err').textContent = r.total.error; tEl.focus(); return false; }
      if (r.others.some(o => o.error) || r.rest < 0.005) { form.querySelector('#spl-status').scrollIntoView({ block: 'nearest' }); return false; }
      const date = F.parseDate(form.querySelector('#spl-date').value) ? form.querySelector('#spl-date').value : todayISO();
      const note = form.querySelector('#spl-note').value.trim().slice(0, 120);
      const parts = [{ cat: r.rows[0].cat, amount: Math.round(r.rest * 100) / 100 }].concat(r.rows.slice(1).map((row, i) => ({ cat: row.cat, amount: r.others[i].value || 0 }))).filter(p => p.amount > 0);
      const sid = uid();
      const made = parts.map(p => addExpense({ categoryId: p.cat, amount: p.amount, date, note, noRoundup: true }));
      made.forEach(m => { m.exp.splitId = sid; if (pre.src) m.exp.src = pre.src; });
      const ru = state.settings.roundUp, g = ru.enabled && state.goals.find(x => x.id === ru.goalId);
      const up = g ? F.roundUpAmount(r.total.value, ru.to) : 0;
      if (g && up > 0.004) { const cid = uid(); g.saved += up; g.contributions.push({ id: cid, date, amount: up, note: 'Round-up · split expense', roundup: true }); made[0].exp.roundup = { goalId: g.id, cid, amount: up }; }
      commit();
      toast(`Split ${fmt(r.total.value)} across ${plural(parts.length, 'category', 'categories')}${up > 0.004 ? ` (+${fmt(up)} to ${g.name})` : ''}`);
      awardXP(5, 'expense');
      return true;
    }
  });
}

