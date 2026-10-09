/* YOKO! Student · Validation, modals, forms, paycheck, settings.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   VALIDATION
   ========================================================= */
/** Returns { value } or { error }. Kinds: text, select, date, money, moneyOpt, rate, percent, months. */
function validateValue(kind, raw, opts = {}) {
  if (kind === 'text' || kind === 'select' || kind === 'date' || kind === 'textarea') {
    const s = String(raw ?? '').trim();
    if (opts.required && !s) return { error: 'This field is required.' };
    if (kind === 'date' && s && !F.parseDate(s)) return { error: 'Enter a valid date.' };
    if (kind === 'text' && s.length > (opts.max || 60)) return { error: `Keep it under ${opts.max || 60} characters.` };
    return { value: s };
  }
  const n = parseNum(raw);
  if (n === null) {
    if (opts.required) return { error: 'This field is required.' };
    return { value: kind === 'moneyOpt' || kind === 'number' ? null : 0 };
  }
  if (Number.isNaN(n) || !Number.isFinite(n)) return { error: 'Enter a number, like 2500.' };
  if (n < 0) return { error: 'Can’t be negative.' };
  if (opts.positive && n === 0) return { error: 'Must be more than 0.' };
  if ((kind === 'money' || kind === 'moneyOpt') && opts.positive && n < 0.01) return { error: 'Too small. Use at least 0.01.' };
  if ((kind === 'rate' || kind === 'percent') && n > 100) return { error: 'Enter a value between 0 and 100.' };
  if (kind === 'months') {
    if (!Number.isInteger(n)) return { error: 'Use whole months.' };
    if (n < 1) return { error: 'At least 1 month.' };
    if (n > 600) return { error: 'Max 600 months (50 years).' };
  }
  if (n > 1e13) return { error: 'That number is too large.' };
  return { value: (kind === 'money' || kind === 'moneyOpt') ? Math.round(n * 100) / 100 : n };
}

/* Inline-edit bindings: data-bind="<target>" + data-field + data-kind on an input. */
const findBucket = id => state.split.buckets.find(b => b.id === id);
const BINDERS = {
  cat(id, f, v) { const c = state.budget.categories.find(x => x.id === id); if (c && f !== 'actual') c[f] = v; },
  bucket(id, f, v) {
    const b = findBucket(id); if (!b) return;
    if (f === 'mode' && v !== b.mode) {   // keep the same money amount when switching % ↔ fixed
      const base = paycheckNet();
      const amt = b.mode === 'percent' ? base * b.value / 100 : b.value;
      b.value = v === 'percent' ? (base > 0 ? clamp(amt / base * 100, 0, 100) : 0) : amt;
    }
    b[f] = v;
  },
  debtSettings(_, f, v) { state.debtSettings[f] = v; },
  emi(_, f, v) { state.emi[f] = v; },
  budget(_, f, v) { state.budget[f] = v; },
  goal(id, f, v) { const g = state.goals.find(x => x.id === id); if (g) g[f] = v; },
  gift(id, f, v) { const g = state.gifts.find(x => x.id === id); if (g) g[f] = v; },
  goalSettings(_, f, v) { state.goalSettings[f] = v; },
  wallet(_, f, v) { state.wallet[f] = v; }
};
function handleBind(el) {
  const { bind, id, field } = el.dataset;
  let kind = el.dataset.kind;
  if (kind === 'bucketValue') { const b = findBucket(id); kind = b && b.mode === 'percent' ? 'percent' : 'money'; }
  const r = validateValue(kind, el.value, { required: kind === 'text' || (bind === 'emi' && field !== 'rate'), max: 40, positive: bind === 'emi' && field === 'principal' });
  const errEl = document.getElementById(el.id + '-err');
  if (r.error) { el.setAttribute('aria-invalid', 'true'); if (errEl) errEl.textContent = r.error; clearTimeout(renderTimer); return; }
  el.removeAttribute('aria-invalid'); if (errEl) errEl.textContent = '';
  if (BINDERS[bind]) BINDERS[bind](id, field, r.value);
  checkBadges(false);
  save();
  scheduleRender(el.tagName === 'SELECT' ? 0 : 450);
}

/* =========================================================
   MODALS
   ========================================================= */
let modalCtx = null;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal({ title, body, submitLabel = 'Save', onSubmit, onMount, hideSubmit = false, cancelLabel = 'Cancel', wide = false }) {
  const opener = modalCtx ? modalCtx.opener : document.activeElement;
  closeModal(true);
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-backdrop>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <form class="modal-form" novalidate>
        <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close dialog">${ICON.close}</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot"><button type="button" class="btn" data-action="close-modal">${cancelLabel}</button>${hideSubmit ? '' : `<button type="submit" class="btn btn-primary">${submitLabel}</button>`}</div>
      </form></div></div>`;
  const form = root.querySelector('form');
  form.addEventListener('submit', e => { e.preventDefault(); if (!onSubmit || onSubmit(form) !== false) closeModal(); });
  // Clear a field's error as soon as the user edits it
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.getAttribute('aria-invalid') === 'true') { t.removeAttribute('aria-invalid'); const er = document.getElementById(t.id + '-err'); if (er) er.textContent = ''; }
  });
  modalCtx = { opener };
  document.body.classList.add('modal-open');
  if (onMount) onMount(form);
  const first = form.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button');
  (first || form.querySelector('[data-action="close-modal"]')).focus();
}
function closeModal(silent = false) {
  const root = document.getElementById('modal-root');
  if (!root.innerHTML) return;
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  const opener = modalCtx && modalCtx.opener;
  modalCtx = null;
  if (!silent && opener && document.contains(opener)) opener.focus();
}

/* ---------- Generic form fields ---------- */
function fieldHTML(f, value) {
  const id = 'f-' + f.name;
  if (f.kind === 'check') {
    return `<div class="field ${f.wide ? 'span-2' : ''}" data-wrap="${f.name}" ${f.hidden ? 'hidden' : ''}><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${value ? 'checked' : ''}> ${esc(f.label)}</label>${f.help ? `<p class="help">${f.help}</p>` : ''}</div>`;
  }
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const described = `${id}-err${f.help ? ` ${id}-help` : ''}`;
  const aria = `aria-describedby="${described}" ${f.required ? 'aria-required="true"' : ''}`;
  let control;
  if (f.kind === 'select') {
    control = `<select id="${id}" name="${f.name}" class="select" ${aria}>${f.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  } else if (f.kind === 'date') {
    control = `<input id="${id}" name="${f.name}" type="date" class="input" value="${esc(value || '')}" ${aria}>`;
  } else if (f.kind === 'textarea') {
    control = `<textarea id="${id}" name="${f.name}" class="textarea" maxlength="120" ${aria}>${esc(value || '')}</textarea>`;
  } else if (['money', 'moneyOpt', 'rate', 'percent', 'months', 'number'].includes(f.kind)) {
    const pct = f.kind === 'rate' || f.kind === 'percent';
    const sym = f.kind === 'months' || f.kind === 'number' ? '' : pct ? '%' : CURRENCIES[state.currency].symbol;
    const v = typeof value === 'number' ? numStr(value) : esc(value ?? '');
    const input = `<input id="${id}" name="${f.name}" type="text" inputmode="decimal" autocomplete="off" class="input" value="${v}" placeholder="${esc(f.placeholder || '')}" ${aria}>`;
    control = sym ? `<div class="affix ${pct ? 'suffix' : ''}"><span class="affix-sym" aria-hidden="true">${esc(sym)}</span>${input}</div>` : input;
  } else {
    control = `<input id="${id}" name="${f.name}" type="text" class="input" value="${esc(value || '')}" maxlength="${f.max || 60}" placeholder="${esc(f.placeholder || '')}" ${aria}>`;
  }
  return `<div class="field ${f.wide ? 'span-2' : ''}" data-wrap="${f.name}" ${f.hidden ? 'hidden' : ''}>
    <label for="${id}">${esc(f.label)}${req}</label>${control}
    ${f.help ? `<p class="help" id="${id}-help">${f.help}</p>` : ''}<p class="field-error" id="${id}-err"></p></div>`;
}
function readForm(form, fields, show) {
  let ok = true, first = null;
  const values = {};
  for (const f of fields) {
    const el = form.querySelector('#f-' + f.name);
    if (!el || el.closest('[hidden]')) continue;
    if (f.kind === 'check') { values[f.name] = el.checked; continue; }
    const r = validateValue(f.kind, el.value, f);
    const er = form.querySelector(`#f-${f.name}-err`);
    if (r.error) {
      ok = false;
      if (show) { er.textContent = r.error; el.setAttribute('aria-invalid', 'true'); first = first || el; }
    } else {
      values[f.name] = r.value;
      if (show) { er.textContent = ''; el.removeAttribute('aria-invalid'); }
    }
  }
  if (first) first.focus();
  return { ok, values };
}
function formModal({ title, fields, values = {}, submitLabel = 'Save', onSave, onMount, live }) {
  openModal({
    title, submitLabel,
    body: `<div class="form-grid two">${fields.map(f => fieldHTML(f, values[f.name])).join('')}</div><div id="form-live" aria-live="polite"></div>`,
    onMount: form => {
      if (onMount) onMount(form);
      if (live) {
        let last = null;   // only redraw when it changes, so a button in the live area survives the blur → change that a click causes
        const run = () => { const r = readForm(form, fields, false), html = live(r.values, r.ok); if (html !== last) { form.querySelector('#form-live').innerHTML = html; last = html; } };
        form.addEventListener('input', run); form.addEventListener('change', run); run();
      }
    },
    onSubmit: form => { const r = readForm(form, fields, true); if (!r.ok) return false; return onSave(r.values, form); }
  });
}
/* ---------- Specific forms ---------- */
function debtForm(debt, preset = {}) {
  const hint = preset.hint || (debt && debt.kind ? rateHintHTML(debt.kind) : '');
  const fields = [
    { name: 'name', label: 'Name', kind: 'text', required: true, placeholder: 'e.g. Credit card', wide: true },
    { name: 'balance', label: 'Current balance', kind: 'money', required: true, positive: !debt },
    { name: 'rate', label: 'Annual interest rate', kind: 'rate', required: true, placeholder: 'e.g. 14', help: hint },
    { name: 'minPayment', label: 'Minimum monthly payment', kind: 'money', required: true, wide: true }
  ];
  formModal({
    title: debt ? 'Edit debt' : 'Add debt', fields, values: debt || (preset.name ? { name: preset.name } : {}), submitLabel: debt ? 'Save changes' : 'Add debt',
    live: v => {
      if (!(v.balance > 0) || v.rate === undefined || v.minPayment === undefined) return '';
      const mi = v.balance * F.monthlyRate(v.rate);
      if (F.neverPaysOff(v.balance, v.rate, v.minPayment)) return `<div class="alert alert-danger" role="alert">${ICON.warn}<div><strong>This debt will never be paid off</strong> at this payment. Monthly interest is ${fmt(mi)}; pay more than that.</div></div>`;
      return `<div class="alert alert-info">Monthly interest ${fmt(mi)} · paid off in ${monthsLabel(F.monthsToPayoff(v.balance, v.rate, v.minPayment))} at the minimum.</div>`;
    },
    onSave: v => {
      if (debt) {
        const wasAlive = debt.balance > 0;
        Object.assign(debt, v);
        debt.startBalance = Math.max(debt.startBalance, debt.balance);
        if (debt.balance <= 0) { if (!debt.defeatedAt) debt.defeatedAt = todayISO(); } else debt.defeatedAt = '';
        commit(); toast('Debt updated');
        if (wasAlive && debt.balance <= 0) { playSound('fanfare'); confetti(); setTimeout(() => showDefeated(debt), 0); }
      } else {
        state.debts.push(Object.assign({ id: uid(), startBalance: v.balance, defeatedAt: '', payments: [], kind: preset.kind || '' }, v));
        commit(); toast(`👾 New boss: ${v.name}`);
        if (preset.then) setTimeout(preset.then, 300);
      }
    }
  });
}
function goalForm(goal, preset = {}) {
  const fields = [
    { name: 'name', label: 'Goal name', kind: 'text', required: true, placeholder: 'e.g. Emergency fund', wide: true },
    { name: 'target', label: 'Target amount', kind: 'money', required: true, positive: true },
    { name: 'saved', label: 'Saved so far', kind: 'money' },
    { name: 'deadline', label: 'Deadline', kind: 'date', required: true },
    { name: 'rate', label: 'Annual interest (optional)', kind: 'rate', help: 'If this money earns interest (FD, savings account).' }
  ];
  const t = todayDate();
  formModal({
    title: goal ? 'Edit goal' : 'Add goal', fields, submitLabel: goal ? 'Save changes' : 'Add goal',
    values: goal || Object.assign({ deadline: F.toISO(F.addMonths(t, 12)) }, preset.values || {}),
    onMount: form => { if (preset.note) form.querySelector('.form-grid').insertAdjacentHTML('beforebegin', `<p class="small muted" id="goal-note">${esc(preset.note)}</p>`); },
    live: v => {
      if (!(v.target > 0) || !v.deadline) return '';
      const dl = F.parseDate(v.deadline); if (!dl) return '';
      const n = F.monthsBetween(t, dl);
      if ((v.saved || 0) >= v.target) return '<div class="alert alert-success">You’ve already hit this one.</div>';
      if (n === 0) return '<div class="alert alert-warn">This deadline has passed. Pick a future date to get a monthly amount.</div>';
      const pmt = F.requiredMonthlySaving(v.target, v.saved || 0, v.rate || 0, n);
      return `<div class="alert alert-info" style="flex-wrap:wrap">Save ${incomeHint(pmt)} for ${monthsLabel(n)}.</div>`;
    },
    onSave: v => {
      if (goal) Object.assign(goal, v);
      else state.goals.push(Object.assign({ id: uid(), planMonthly: null, contributions: v.saved > 0 ? [{ id: uid(), date: todayISO(), amount: v.saved, note: 'Starting balance' }] : [] }, v));
      commit(); toast(goal ? 'Goal updated' : 'Goal added');
      if (!goal && preset.then) setTimeout(preset.then, 300);
    }
  });
}
function giftForm(gift) {
  const fields = [
    { name: 'name', label: 'Recipient', kind: 'text', required: true, placeholder: 'e.g. Mom', wide: true },
    { name: 'occasion', label: 'Occasion', kind: 'select', options: OCCASIONS },
    { name: 'customOccasion', label: 'Custom occasion', kind: 'text', required: true, placeholder: 'e.g. Housewarming', max: 40, hidden: !(gift && gift.occasion === 'Custom') },
    { name: 'date', label: 'Date', kind: 'date', required: true },
    { name: 'budget', label: 'Budget', kind: 'money', required: true },
    { name: 'status', label: 'Status', kind: 'select', options: GIFT_STATUS },
    { name: 'idea', label: 'Gift idea', kind: 'text', max: 120, wide: true, placeholder: 'Optional' }
  ];
  formModal({
    title: gift ? 'Edit gift' : 'Add gift', fields, submitLabel: gift ? 'Save changes' : 'Add gift',
    values: gift || { occasion: 'Birthday', status: 'Idea', date: todayISO() },
    onMount: form => {
      const occ = form.querySelector('#f-occasion'), wrap = form.querySelector('[data-wrap="customOccasion"]');
      occ.addEventListener('change', () => { wrap.hidden = occ.value !== 'Custom'; });
    },
    onSave: v => {
      if (v.occasion !== 'Custom') v.customOccasion = '';
      v.idea = v.idea || '';
      if (gift) Object.assign(gift, v); else state.gifts.push(Object.assign({ id: uid() }, v));
      commit(); toast(gift ? 'Gift updated' : 'Gift added');
    }
  });
}
/** Category options for a select, with "+ New category…" at the end. */
function catOptions() { return state.budget.categories.map(c => [c.id, c.name]).concat([[NEW_CAT, '+ New category…']]); }
const NEW_CAT = '__newcat__';
/** Picking "+ New category…" opens a small inline form under the select to create one. */
function newCategoryInline(sel) {
  const prev = sel.dataset.prev && sel.dataset.prev !== NEW_CAT ? sel.dataset.prev : (state.budget.categories[0] || {}).id || '';
  const holder = sel.closest('.field') || sel.parentElement;
  if (holder.querySelector('.newcat')) return;
  const box = document.createElement('div');
  box.className = 'newcat';
  box.innerHTML = `<input class="input input-sm newcat-name" maxlength="40" placeholder="Name, e.g. Gym, Gifts, Pets" aria-label="New category name">
    <select class="select input-sm newcat-type" aria-label="Type">${CAT_TYPES.map(([v, l]) => `<option value="${v}" ${v === 'wants' ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="btn btn-sm btn-primary newcat-add">Add</button><button type="button" class="btn btn-sm newcat-cancel">Cancel</button>
    <p class="field-error newcat-err"></p>`;
  holder.appendChild(box);
  const name = box.querySelector('.newcat-name'); name.focus();
  const close = v => { box.remove(); sel.value = v; sel.dataset.prev = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
  box.querySelector('.newcat-cancel').addEventListener('click', () => close(prev));
  const add = () => {
    const n = name.value.trim();
    if (!n) { box.querySelector('.newcat-err').textContent = 'Give it a name.'; name.focus(); return; }
    const dup = state.budget.categories.find(c => c.name.toLowerCase() === n.toLowerCase());
    if (dup) { close(dup.id); return; }
    const c = { id: uid(), name: n.slice(0, 40), type: box.querySelector('.newcat-type').value, planned: 0, actual: 0, bucketId: '' };
    state.budget.categories.push(c); save(); scheduleRender(300);
    document.querySelectorAll('select').forEach(s2 => {
      const nw = s2.querySelector(`option[value="${NEW_CAT}"]`);
      if (nw) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; s2.insertBefore(o, nw); }
    });
    close(c.id); toast(`Added “${c.name}”. Set a limit for it in Budget.`);
  };
  box.querySelector('.newcat-add').addEventListener('click', add);
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}
document.addEventListener('focusin', e => { if (e.target.tagName === 'SELECT') e.target.dataset.prev = e.target.value; });
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.value === NEW_CAT) newCategoryInline(e.target); });

function expenseForm(exp) {
  const cats = state.budget.categories;
  if (!cats.length) { toast('Add a budget category first.'); location.hash = '#budget'; return; }
  if (exp) {
    const linked = state.wallet.cash.concat(state.wallet.transport).some(c => c.expenseId === exp.id);
    formModal({
      title: 'Edit expense', submitLabel: 'Save changes',
      values: { categoryId: cats.some(c => c.id === exp.categoryId) ? exp.categoryId : cats[0].id, amount: exp.amount, date: exp.date, note: exp.note },
      fields: [
        { name: 'categoryId', label: 'Category', kind: 'select', options: catOptions() },
        { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
        { name: 'date', label: 'Date', kind: 'date', required: true },
        { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'Optional' }
      ],
      onMount: form => bindNoteAutocomplete(form),
      live: v => (linked ? '<p class="small muted">This also changes the matching entry in your Wallet.</p>' : '') + (exp.debtPay ? '<p class="small muted">The loan balance moves by the difference.</p>' : ''),
      onSave: v => { undoable('Expense updated', () => updateExpense(exp, v)); }
    });
    return;
  }
  const fields = [
    { name: 'categoryId', label: 'Category', kind: 'select', options: catOptions() },
    { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
    { name: 'date', label: 'Date', kind: 'date', required: true },
    { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'Optional' }
  ];
  formModal({
    title: 'Add expense', fields, values: { date: todayISO(), categoryId: cats[0].id }, submitLabel: 'Add expense',
    onMount: form => {
      bindNoteAutocomplete(form);
      if (cats.length < 2) return;
      form.querySelector('.form-grid').insertAdjacentHTML('afterend', '<p class="small"><button type="button" class="linklike" id="exp-to-split">Split this across categories</button></p>');
      form.querySelector('#exp-to-split').addEventListener('click', () => {
        const a = validateValue('money', form.querySelector('#f-amount').value, { required: false });
        splitExpenseForm({ amount: a.value || 0, date: form.querySelector('#f-date').value, note: form.querySelector('#f-note').value });
      });
    },
    live: v => {
      const freeze = typeof getActiveCategoryFreeze === 'function' ? getActiveCategoryFreeze(v.categoryId) : null;
      const fzWarn = freeze ? `<div class="alert alert-warn">❄️ <strong>${esc(freeze.catName)}</strong> is frozen (${plural(freeze.daysLeft, 'day')} left). Adding this will break your challenge.</div>` : '';
      if (!(v.amount > 0)) return fzWarn;
      const ru = state.settings.roundUp, g = null;
      const up = g ? F.roundUpAmount(v.amount, ru.to) : 0;
      const fl = feelsLike(v.amount);
      return fzWarn + (fl ? `<div class="alert alert-info" style="flex-wrap:wrap">That’s ${fl}</div>` : '') + (up > 0 ? `<div class="alert alert-success">🫙 ${fmt(up)} spare change goes to ${esc(g.name)}</div>` : '');
    },
    onSave: v => {
      const freeze = typeof getActiveCategoryFreeze === 'function' ? getActiveCategoryFreeze(v.categoryId) : null;
      const doSave = () => {
        const r = addExpense({ categoryId: v.categoryId, amount: v.amount, date: v.date, note: v.note });
        commit(); expenseToast(v.amount, r);
        if (freeze && typeof triggerPetReaction === 'function') triggerPetReaction('freeze-broken');
        const pf = takePriceFlags(); if (pf) setTimeout(() => toast(`${pf}. Update it under Wallet → Subscriptions`, 4500), 2800);
      };
      if (freeze) {
        openModal({
          title: 'Category is frozen',
          body: `<p><strong>${esc(freeze.catName)}</strong> is currently frozen for <strong>${plural(freeze.daysLeft, 'more day')}</strong> (Day ${freeze.daysIn} of ${freeze.daysTotal} of your challenge).</p>
            <p class="muted small">Logging an expense in this category will break your no-spend challenge streak.</p>`,
          submitLabel: 'Log anyway',
          cancelLabel: 'Keep freeze',
          onSubmit: () => {
            doSave();
            return true;
          }
        });
        return;
      }
      doSave();
    }
  });
}
function contributionForm(goal, c) {
  formModal({
    title: `Edit contribution · ${goal.name}`, submitLabel: 'Save changes', values: { amount: c.amount, date: c.date, note: c.note },
    fields: [
      { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
      { name: 'date', label: 'Date', kind: 'date', required: true },
      { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'Optional', wide: true }
    ],
    live: v => v.amount > 0 ? `<div class="alert alert-info">New balance: <strong>${fmt(Math.max(0, goal.saved - c.amount + v.amount))}</strong> of ${fmt(goal.target)}</div>` : '',
    onSave: v => { undoable('Contribution updated', () => { goal.saved = Math.max(0, goal.saved - c.amount + v.amount); Object.assign(c, { amount: v.amount, date: v.date, note: v.note || '' }); }); }
  });
}
function wishEditForm(w) {
  formModal({
    title: 'Edit wishlist item', submitLabel: 'Save changes', values: { name: w.name, price: w.price },
    fields: [
      { name: 'name', label: 'What is it?', kind: 'text', required: true, max: 60, wide: true },
      { name: 'price', label: 'Price', kind: 'money', required: true, positive: true }
    ],
    onSave: v => { undoable('Wishlist item updated', () => { Object.assign(w, { name: v.name, price: v.price }); }); }
  });
}
function challengeEditForm(c) {
  const cats = state.budget.categories.filter(k => k.type !== 'savings');
  const dayOpts = [['7', '7 days'], ['14', '14 days'], ['30', '30 days']];
  if (!dayOpts.some(o => +o[0] === c.days)) dayOpts.push([String(c.days), `${c.days} days`]);
  const fields = c.type === 'week52'
    ? [...(c.deposits.length ? [] : [{ name: 'unit', label: 'Week 1 amount', kind: 'money', required: true, positive: true, help: 'Week 2 is double, week 52 is 52×.' }]),
       { name: 'goalId', label: 'Put deposits into', kind: 'select', options: [['', 'Just track them'], ...state.goals.map(g => [g.id, g.name])], help: 'Only new deposits go there.' }]
    : [...(c.type === 'nocat' ? [{ name: 'categoryId', label: 'Category to skip', kind: 'select', options: cats.map(k => [k.id, k.name]) }] : [{ name: 'cap', label: 'Daily limit', kind: 'money', required: true, positive: true }]),
       { name: 'days', label: 'For how long?', kind: 'select', options: dayOpts }];
  formModal({
    title: 'Edit challenge', submitLabel: 'Save changes', fields,
    values: { unit: c.unit, goalId: c.goalId || '', categoryId: c.categoryId, cap: c.cap, days: String(c.days) },
    onSave: v => {
      undoable('Challenge updated', () => {
        if (c.type === 'week52') { if (!c.deposits.length) c.unit = v.unit; c.goalId = v.goalId || null; }
        else { if (c.type === 'nocat') c.categoryId = v.categoryId; else c.cap = v.cap; c.days = Number(v.days) || c.days; }
      });
    }
  });
}
function addMoneyForm(goal) {
  const fields = [
    { name: 'amount', label: 'Amount', kind: 'money', required: true, positive: true },
    { name: 'date', label: 'Date', kind: 'date', required: true },
    { name: 'note', label: 'Note', kind: 'text', max: 120, placeholder: 'Optional', wide: true }
  ];
  formModal({
    title: `Add money · ${goal.name}`, fields, values: { date: todayISO() }, submitLabel: 'Add money',
    live: v => v.amount > 0 ? `<div class="alert alert-info">New balance: <strong>${fmt(goal.saved + v.amount)}</strong> of ${fmt(goal.target)}</div>` : '',
    onSave: v => { addToGoal(goal, v.amount, v.date, v.note); }
  });
}

/* ---------- Paycheck modal ---------- */
function freqOptions(sel) { return FREQS.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join(''); }
function dedRow(d) {
  const k = uid();
  return `<div class="ded-row" data-row>
    <div class="field"><label for="dn-${k}">Deduction</label><input id="dn-${k}" class="input" data-k="name" value="${esc(d.name)}" maxlength="40"></div>
    <div class="field"><label for="dm-${k}">Type</label><select id="dm-${k}" class="select" data-k="mode"><option value="amount" ${d.mode === 'amount' ? 'selected' : ''}>Amount</option><option value="percent" ${d.mode === 'percent' ? 'selected' : ''}>% gross</option></select></div>
    <div class="field dr-value"><label for="dv-${k}">Value</label><input id="dv-${k}" class="input" data-k="value" type="text" inputmode="decimal" value="${numStr(d.value)}" aria-describedby="dv-${k}-err"></div>
    <button type="button" class="icon-btn danger" data-pc="remove" aria-label="Remove deduction">${ICON.trash}</button>
    <p class="field-error" id="dv-${k}-err"></p></div>`;
}
function otherRow(o) {
  const k = uid();
  return `<div class="other-row" data-row>
    <div class="field"><label for="on-${k}">Source</label><input id="on-${k}" class="input" data-k="name" value="${esc(o.name)}" maxlength="40" placeholder="Freelance, rental…"></div>
    <div class="field or-amt"><label for="oa-${k}">Amount</label><input id="oa-${k}" class="input" data-k="amount" type="text" inputmode="decimal" value="${numStr(o.amount)}" aria-describedby="oa-${k}-err"></div>
    <div class="field or-freq"><label for="of-${k}">Frequency</label><select id="of-${k}" class="select" data-k="freq">${freqOptions(o.freq)}</select></div>
    <button type="button" class="icon-btn danger" data-pc="remove" aria-label="Remove income source">${ICON.trash}</button>
    <p class="field-error" id="oa-${k}-err"></p></div>`;
}
function openPaycheckModal() {
  const inc = state.income;
  const sym = esc(CURRENCIES[state.currency].symbol);
  const body = `
    <button type="button" class="btn" data-action="open-payslip">${ICON.upload}<span>Fill this in from a payslip PDF</span></button>
    <label class="check"><input type="checkbox" id="pc-irregular" ${inc.irregular ? 'checked' : ''}> My income changes month to month (freelance, gig work, commission)</label>
    <p class="help" id="pc-irr-help" ${inc.irregular ? '' : 'hidden'}>Log money as it comes in (Add → Income received). Each month is budgeted from what came in the month before. Until then it uses the amount below.</p>
    <label class="check"><input type="checkbox" id="pc-gross" ${inc.mode === 'gross' ? 'checked' : ''}> I only know my gross pay</label>
    <div id="pc-net-wrap" class="field" ${inc.mode === 'gross' ? 'hidden' : ''}>
      <label for="pc-net"><span id="pc-net-label">${inc.irregular ? 'A typical month’s take-home' : 'Take-home paycheck amount'}</span> <span class="req" aria-hidden="true">*</span></label>
      <div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="pc-net" class="input" type="text" inputmode="decimal" value="${inc.net ? numStr(inc.net) : ''}" aria-describedby="pc-net-err" placeholder="What lands in your bank each payday"></div>
      <p class="field-error" id="pc-net-err"></p></div>
    <div id="pc-gross-wrap" class="stack" ${inc.mode === 'gross' ? '' : 'hidden'}>
      <div class="field"><label for="pc-grossamt">Gross pay per paycheck <span class="req" aria-hidden="true">*</span></label>
        <div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="pc-grossamt" class="input" type="text" inputmode="decimal" value="${inc.gross ? numStr(inc.gross) : ''}" aria-describedby="pc-grossamt-err"></div>
        <p class="field-error" id="pc-grossamt-err"></p></div>
      <fieldset><legend>Deductions per paycheck</legend><div class="row-list" id="pc-deds">${inc.deductions.map(dedRow).join('')}</div>
        <button type="button" class="btn btn-sm" style="margin-top:10px" data-pc="add-ded">${ICON.plus}<span>Add deduction</span></button></fieldset>
      <div class="calc-line"><span>Take-home (gross − deductions)</span><strong id="pc-net-calc">—</strong></div>
      <p class="help">Enter what is actually deducted. Tax brackets are not calculated.</p>
    </div>
    <div class="form-grid two" id="pc-sched" ${inc.irregular ? 'hidden' : ''}>
      <div class="field"><label for="pc-freq">Pay frequency</label><select id="pc-freq" class="select">${freqOptions(inc.freq)}</select></div>
      <div class="field"><label for="pc-date">Next pay date</label><input id="pc-date" class="input" type="date" value="${esc(inc.nextPayDate)}" aria-describedby="pc-date-err"><p class="field-error" id="pc-date-err"></p></div>
    </div>
    <fieldset><legend>Other income</legend><div class="row-list" id="pc-others">${inc.others.map(otherRow).join('')}</div>
      <button type="button" class="btn btn-sm" style="margin-top:10px" data-pc="add-other">${ICON.plus}<span>Add another income source</span></button></fieldset>
    <div class="calc-line" aria-live="polite"><span>Monthly income (all sources)</span><strong id="pc-monthly">—</strong></div>`;

  /** Read the modal. With `show`, mark invalid fields; returns { ok, income }. */
  function read(form, show) {
    let ok = true, first = null;
    const mark = (el, msg) => {
      const er = document.getElementById(el.id + '-err');
      if (msg) { ok = false; if (show) { el.setAttribute('aria-invalid', 'true'); if (er) er.textContent = msg; first = first || el; } }
      else if (show) { el.removeAttribute('aria-invalid'); if (er) er.textContent = ''; }
    };
    const mode = form.querySelector('#pc-gross').checked ? 'gross' : 'net';
    const irregular = form.querySelector('#pc-irregular').checked;
    const out = { mode, net: 0, gross: 0, deductions: [], freq: irregular ? 'monthly' : form.querySelector('#pc-freq').value, nextPayDate: '', others: [], configured: true, irregular };
    if (mode === 'net') {
      const el = form.querySelector('#pc-net'); const r = validateValue('money', el.value, { required: true });
      mark(el, r.error); out.net = r.value || 0;
      out.deductions = state.income.deductions; out.gross = state.income.gross;
    } else {
      const g = form.querySelector('#pc-grossamt'); const rg = validateValue('money', g.value, { required: true, positive: true });
      mark(g, rg.error); out.gross = rg.value || 0;
      form.querySelectorAll('#pc-deds [data-row]').forEach(row => {
        const mode2 = row.querySelector('[data-k="mode"]').value;
        const vEl = row.querySelector('[data-k="value"]');
        const rv = validateValue(mode2 === 'percent' ? 'percent' : 'money', vEl.value, {});
        mark(vEl, rv.error);
        out.deductions.push({ name: row.querySelector('[data-k="name"]').value.trim() || 'Deduction', mode: mode2, value: rv.value || 0 });
      });
      out.net = state.income.net;
      if (!rg.error && F.netFromGross(out.gross, out.deductions).net < 0) mark(g, 'Deductions are more than gross pay.');
    }
    const dEl = form.querySelector('#pc-date'); const rd = validateValue('date', dEl.value, {});
    if (!irregular) { mark(dEl, rd.error); out.nextPayDate = rd.value || ''; }
    form.querySelectorAll('#pc-others [data-row]').forEach(row => {
      const aEl = row.querySelector('[data-k="amount"]'); const ra = validateValue('money', aEl.value, { required: true });
      mark(aEl, ra.error);
      out.others.push({ id: uid(), name: row.querySelector('[data-k="name"]').value.trim() || 'Other income', amount: ra.value || 0, freq: row.querySelector('[data-k="freq"]').value });
    });
    if (show && first) first.focus();
    return { ok, income: out };
  }
  function refresh(form) {
    const { income } = read(form, false);
    const net = income.mode === 'gross' ? F.netFromGross(income.gross, income.deductions).net : income.net;
    const calc = form.querySelector('#pc-net-calc');
    calc.textContent = fmt(net);
    calc.className = net < 0 ? 'tone-danger-text' : '';
    const monthly = F.toMonthly(Math.max(0, net), income.freq) + sum(income.others, o => F.toMonthly(o.amount, o.freq));
    form.querySelector('#pc-monthly').textContent = `${fmt(monthly)} · ${fmt(monthly * 12)}/yr`;
  }

  openModal({
    title: 'Enter paycheck', body, submitLabel: 'Save paycheck', wide: true,
    onMount: form => {
      form.addEventListener('input', () => refresh(form));
      form.addEventListener('change', () => refresh(form));
      form.querySelector('#pc-irregular').addEventListener('change', e => {
        form.querySelector('#pc-sched').hidden = e.target.checked;
        form.querySelector('#pc-irr-help').hidden = !e.target.checked;
        form.querySelector('#pc-net-label').textContent = e.target.checked ? 'A typical month’s take-home' : 'Take-home paycheck amount';
      });
      form.querySelector('#pc-gross').addEventListener('change', e => {
        form.querySelector('#pc-net-wrap').hidden = e.target.checked;
        form.querySelector('#pc-gross-wrap').hidden = !e.target.checked;
      });
      form.addEventListener('click', e => {
        const btn = e.target.closest('[data-pc]'); if (!btn) return;
        const act = btn.dataset.pc;
        if (act === 'add-ded') { form.querySelector('#pc-deds').insertAdjacentHTML('beforeend', dedRow({ name: '', mode: 'amount', value: 0 })); form.querySelector('#pc-deds [data-row]:last-child input').focus(); }
        if (act === 'add-other') { form.querySelector('#pc-others').insertAdjacentHTML('beforeend', otherRow({ name: '', amount: 0, freq: 'monthly' })); form.querySelector('#pc-others [data-row]:last-child input').focus(); }
        if (act === 'remove') { const row = btn.closest('[data-row]'); const list = row.parentElement; row.remove(); (list.parentElement.querySelector('[data-pc^="add"]')).focus(); }
        refresh(form);
      });
      refresh(form);
    },
    onSubmit: form => {
      const r = read(form, true);
      if (!r.ok) return false;
      state.income = r.income;
      commit(); toast('Paycheck saved');
    }
  });
}

/* ---------- Settings ---------- */
function openSettings(tab = 'general') {
  const dataGroups = `<div class="settings-group"><h3>Your data</h3><p class="small muted">${syncReady() ? 'Stored in this browser and synced to your account, locked with your passphrase.' : 'Stored only in this browser. Nothing is sent anywhere unless you turn on sync under Account.'}</p>
      <div class="row"><button type="button" class="btn" data-action="export-json">${ICON.download}<span>Export all data (JSON)</span></button>
      <label class="btn" for="import-file" tabindex="0" id="import-label" role="button">Import data (JSON)</label>
      <input type="file" id="import-file" accept="application/json,.json" class="sr-only" tabindex="-1">
      <button type="button" class="btn" data-action="load-sample">Load sample data</button>
      <button type="button" class="btn" data-action="redo-setup">Answer the setup questions again</button></div></div>
      <div class="settings-group"><h3>Reset</h3><p class="small muted">Deletes all income, debts, budget, gifts and goals from this browser.</p>
      <div class="row"><button type="button" class="btn btn-danger" data-action="reset-all">Reset all data</button></div></div>`;
  const helpGroups = `<div class="settings-group"><h3>Tutorials</h3><p class="small muted">The full tutorial is also on the Home page.</p>
      <div class="row"><button type="button" class="btn btn-primary btn-sm" data-action="tour-all">Full tutorial</button><button type="button" class="btn btn-sm" data-action="open-tutorials">Pick a page</button></div></div>
      <div class="settings-group"><h3>Self-tests</h3><details class="set-details"><summary class="small">For checking the app’s math</summary><p class="small muted">Checks loan payments, payoff order, goals, safe-to-spend and amount words like “2 lakh”.</p>
      <div class="row"><button type="button" class="btn btn-sm" data-action="run-tests">Run self-tests</button></div><div id="test-out"></div></details></div>`;
  const groups = (prefsHTML() + moreSettingsHTML() + accountGroupHTML() + dataGroups + helpGroups).split(/(?=<div class="settings-group">)/).filter(g => g.trim());
  const where = { 'Country and currency': 'general', 'Theme and sound': 'general', 'Privacy and pet': 'general', 'Hours of work': 'money', 'Runway': 'money', 'Round-up jar': 'money',
    'Sync across devices': 'account', 'Backups': 'data', 'Your data': 'data', 'Learned categories': 'data', 'Reset': 'data', 'Use it on your phone': 'help', 'Tutorials': 'help', 'Self-tests': 'help' };
  const panels = { general: [], money: [], account: [], data: [], help: [] };
  groups.forEach(g => { const m = /<h3>([^<]+)<\/h3>/.exec(g); panels[(m && where[m[1]]) || 'general'].push(g); });
  panels.general.sort((a, b) => /Country and currency/.test(b) - /Country and currency/.test(a));
  panels.help.sort((a, b) => /<h3>Tutorials/.test(b) - /<h3>Tutorials/.test(a));
  const names = [['general', 'Basics'], ['money', 'Money'], ['account', 'Account'], ['data', 'Data'], ['help', 'Help']];
  openModal({
    title: 'Settings', hideSubmit: true, cancelLabel: 'Close',
    body: `<div class="subtabs set-tabs"><div role="tablist" class="subtabs-inner">${names.map(([k, l]) => `<button type="button" role="tab" class="subtab" id="set-tab-${k}" data-set-tab="${k}" aria-selected="${k === tab}" aria-controls="set-panel-${k}">${l}</button>`).join('')}</div></div>
      ${names.map(([k]) => `<div class="set-panel" id="set-panel-${k}" role="tabpanel" aria-labelledby="set-tab-${k}" ${k === tab ? '' : 'hidden'}>${panels[k].join('')}</div>`).join('')}`,
    onMount: form => {
      bindPrefs(form);
      form.querySelector('.set-tabs').addEventListener('click', e => {
        const b = e.target.closest('[data-set-tab]'); if (!b) return;
        form.querySelectorAll('[data-set-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
        form.querySelectorAll('.set-panel').forEach(p => { p.hidden = p.id !== 'set-panel-' + b.dataset.setTab; });
      });
      const lbl = form.querySelector('#import-label');
      lbl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); form.querySelector('#import-file').click(); } });
      form.querySelector('#import-file').addEventListener('change', e => importJSON(e.target.files[0]));
    }
  });
}
function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || (!data.income && !data.debts && !data.goals)) throw new Error('Not a YOKO! backup');
      if (!confirm('Replace all current data with the imported file?')) return;
      const seenTour = state.meta.tourDone, seenVer = state.meta.tourVersion;
      state = normalizeState(data);
      state.meta.tourDone = seenTour || state.meta.tourDone;
      state.meta.tourVersion = Math.max(seenVer || 0, state.meta.tourVersion || 0);
      closeModal(true); commit(); toast('Data imported');
    } catch (err) { toast('That file isn’t a valid YOKO! backup.'); }
  };
  reader.onerror = () => toast('Couldn’t read that file.');
  reader.readAsText(file);
}

