/* YOKO! Student · Bank SMS and statement import, OCR (Tesseract).
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* ---------- Import from bank SMS and statements ---------- */
const MERCHANT_STOP = new Set(['upi', 'neft', 'imps', 'rtgs', 'pos', 'ecom', 'debit', 'credit', 'card', 'txn', 'payment', 'to', 'from', 'ach', 'nach', 'vpa', 'bil', 'billpay', 'mb', 'ib', 'inb', 'the', 'and', 'dr', 'cr', 'ref', 'p2m', 'p2a', 'transfer', 'trf', 'sent', 'paid', 'bank', 'sms']);
/** "UPI-SWIGGY-swiggy@icici" → "swiggy": the word that identifies a merchant for learned rules. */
function merchantKey(text) {
  const words = String(text || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !MERCHANT_STOP.has(w));
  return words[0] || '';
}
function catByLooseName(name) {
  const syn = { EMIs: /emi|debt|loan/i, Food: /food|grocer|dining|eat/i, Transport: /transport|travel|commute|fuel/i, Bills: /bill|utilit|phone|electric/i,
    Subscriptions: /subscri|ott|stream/i, Rent: /rent|housing/i, Fun: /fun|shop|entertain|leisure|want/i };
  return findByName(state.budget.categories, name) || (syn[name] ? state.budget.categories.find(c => syn[name].test(c.name)) : null) || null;
}
function guessCategory(text) {
  const cats = state.budget.categories;
  if (!cats.length) return null;
  const r = F.categorize(text, state.rules.map(x => [x.match, x.categoryId]));
  if (r && r.source === 'rule' && cats.some(c => c.id === r.name)) return { id: r.name, source: 'rule' };
  if (r && r.source !== 'rule') { const c = catByLooseName(r.name); if (c) return { id: c.id, source: 'auto' }; }
  const fb = cats.find(c => /other|misc|shopping|fun/i.test(c.name)) || cats.find(c => c.type === 'wants') || cats[0];
  return { id: fb.id, source: 'guess' };
}
function isDuplicate(t) { return state.budget.expenses.some(e => e.date === t.date && Math.abs(e.amount - t.amount) < 0.01); }
function importModal(mode = 'sms') {
  if (!state.budget.categories.length) { toast('Add a budget category first.'); location.hash = '#budget'; return; }
  openModal({
    title: mode === 'sms' ? 'Paste bank messages' : 'Import a bank statement', submitLabel: 'Add expenses', wide: true,
    body: '<div id="imp-stage" class="stack"></div>',
    onMount: form => (mode === 'sms' ? impSmsStage(form) : impFileStage(form)),
    onSubmit: form => impApply(form)
  });
}
function impSmsStage(form) {
  form.querySelector('button[type="submit"]').hidden = true;
  const st = form.querySelector('#imp-stage');
  st.innerHTML = `<div class="field"><label for="imp-sms">Paste one or more messages from your bank (texts or app notifications)</label>
      <textarea id="imp-sms" class="textarea" rows="7" placeholder="${esc(sampleBankMessage())}"></textarea>
      <p class="help">Put a blank line between messages. They stay on this device.</p><p class="field-error" id="imp-sms-err"></p></div>
    <div class="row"><button type="button" class="btn btn-primary" id="imp-read">Read messages</button>
      <button type="button" class="btn" id="imp-to-file">${ICON.upload}<span>Import a statement instead</span></button></div>`;
  st.querySelector('#imp-read').addEventListener('click', () => {
    const txns = F.parseSmsBatch(st.querySelector('#imp-sms').value, todayISO());
    if (!txns.length) { st.querySelector('#imp-sms-err').textContent = 'Couldn’t find an amount in that. Paste the whole message from your bank.'; return; }
    impReview(form, txns, 'sms');
  });
  st.querySelector('#imp-to-file').addEventListener('click', () => { form.closest('.modal').querySelector('#modal-title').textContent = 'Import a bank statement'; impFileStage(form); });
}
function impFileStage(form) {
  form.querySelector('button[type="submit"]').hidden = true;
  const st = form.querySelector('#imp-stage');
  st.innerHTML = `<div class="dropzone" id="imp-drop"><p class="dz-icon" aria-hidden="true">🏦</p><p><strong>Drop a bank statement here</strong></p><p class="small muted">CSV (best) or PDF</p>
      <button type="button" class="btn btn-primary" id="imp-pick">${ICON.upload}<span>Choose a file</span></button>
      <input type="file" id="imp-file" accept=".csv,.txt,.pdf,text/csv,application/pdf" class="sr-only" tabindex="-1" aria-label="Statement file">
      <p class="small muted">Read on this device. Most banks let you download your statement as CSV or Excel.</p></div>
    <div id="ps-status" aria-live="polite"></div><div id="ps-pass" class="field" hidden></div>`;
  const input = st.querySelector('#imp-file');
  st.querySelector('#imp-pick').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) impHandleFile(form, input.files[0]); });
  bindDrop(st.querySelector('#imp-drop'), f => impHandleFile(form, f));
}
async function impHandleFile(form, file) {
  const status = form.querySelector('#ps-status');
  const say = (html, cls = 'alert-info') => { if (status) status.innerHTML = `<div class="alert ${cls}" role="status">${html}</div>`; };
  const name = file.name || 'statement';
  try {
    if (file.size > 30e6) { say('That file is over 30 MB, which is too big for a statement.', 'alert-danger'); return; }
    let txns;
    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
      say(`Reading <strong>${esc(name)}</strong>…`);
      const lib = await loadPdfJs();
      const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
      task.onPassword = (update, reason) => psAskPassword(form, update, reason);
      const pdf = await task.promise;
      const lines = await pdfToLines(pdf, 40);
      try { pdf.destroy(); } catch (e) { /* ignore */ }
      txns = F.parseStatementLines(lines);
    } else if (/\.(csv|txt|tsv)$/i.test(name) || /text|csv/.test(file.type)) {
      txns = F.parseStatementCsv(await file.text());
    } else if (/\.xlsx?$/i.test(name)) { say('Excel files don’t work here. Open it in Excel, save it as CSV, then import that.', 'alert-warn'); return; }
    else { say('Choose a CSV or PDF statement.', 'alert-danger'); return; }
    if (!txns.length) { say(`Couldn’t find any transactions in <strong>${esc(name)}</strong>. A CSV from your bank usually works better.`, 'alert-warn'); return; }
    impReview(form, txns, 'import', name);
  } catch (err) {
    console.error('Statement import failed', err);
    say(`Couldn’t read that file (${esc((err && err.message) || 'unknown error')}).`, 'alert-danger');
  }
}
function impReview(form, txns, src, fileName = '') {
  const cats = state.budget.categories;
  const debits = txns.filter(t => t.type === 'debit').slice(0, 500).map(t => {
    const g = guessCategory(t.merchant);
    return Object.assign({}, t, { cat: g.id, source: g.source, dup: isDuplicate(t) });
  });
  const credits = txns.filter(t => t.type === 'credit');
  form._imp = { rows: debits, src };
  const st = form.querySelector('#imp-stage');
  const opts = sel => cats.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const tag = r => r.source === 'rule' ? '<span class="badge badge-success">remembered</span>' : r.source === 'auto' ? '<span class="badge">auto</span>' : '<span class="badge badge-neutral">guess</span>';
  st.innerHTML = `
    <div class="alert ${debits.length ? 'alert-success' : 'alert-warn'}" role="status">${fileName ? `Read <strong>${esc(fileName)}</strong>. ` : ''}Found ${plural(debits.length, 'payment')}.${credits.length ? ` Skipped ${credits.length} money-in (${fmt(sum(credits, c => c.amount))}).` : ''} Check the categories, then add them.</div>
    ${debits.some(r => r.dup) ? '<div class="alert alert-info">Some of these look like expenses you already logged (same date and amount), so they’re unticked.</div>' : ''}
    ${debits.length ? `<div class="table-wrap imp-table"><table><thead><tr><th scope="col"><span class="sr-only">Include</span></th><th scope="col">Date</th><th scope="col">Merchant / note</th><th class="num" scope="col">Amount</th><th scope="col">Category</th></tr></thead><tbody>
      ${debits.map((r, i) => `<tr class="${r.dup ? 'is-dup' : ''}"><td><input type="checkbox" class="imp-on" data-i="${i}" ${r.dup ? '' : 'checked'} aria-label="Include ${esc(r.merchant)} ${esc(fmt(r.amount))}"></td>
        <td>${fmtDate(F.parseDate(r.date))}${r.dup ? '<br><span class="badge badge-warn">already logged?</span>' : ''}</td>
        <td><label class="sr-only" for="imp-note-${i}">Note</label><input id="imp-note-${i}" class="input input-sm imp-note" data-i="${i}" maxlength="120" value="${esc(r.merchant)}"></td>
        <td class="num">${fmt(r.amount)}</td>
        <td><label class="sr-only" for="imp-cat-${i}">Category</label><select id="imp-cat-${i}" class="select input-sm imp-cat" data-i="${i}">${opts(r.cat)}</select> ${tag(r)}</td></tr>`).join('')}
      </tbody></table></div>
      <label class="check"><input type="checkbox" id="imp-learn" checked> Remember the categories I change for these shops</label>
      <p class="calc-line" id="imp-sum"></p>` : ''}
    <p class="small"><button type="button" class="linklike" id="imp-back">Start over</button></p>`;
  const submit = form.querySelector('button[type="submit"]');
  const update = () => {
    const on = [...st.querySelectorAll('.imp-on')].filter(x => x.checked).map(x => debits[+x.dataset.i]);
    const s = st.querySelector('#imp-sum');
    if (s) s.innerHTML = `<span>${plural(on.length, 'expense')} selected</span><strong>${fmt(sum(on, r => r.amount))}</strong>`;
    submit.hidden = !debits.length;
    submit.textContent = `Add ${plural(on.length, 'expense')}`;
    submit.disabled = !on.length;
  };
  st.addEventListener('change', e => {
    if (e.target.classList.contains('imp-cat')) {
      // same merchant elsewhere in the list follows the new choice
      const r = debits[+e.target.dataset.i], key = merchantKey(r.merchant);
      if (key) st.querySelectorAll('.imp-cat').forEach(sel => { const o = debits[+sel.dataset.i]; if (sel !== e.target && merchantKey(o.merchant) === key && o.source !== 'rule') sel.value = e.target.value; });
    }
    update();
  });
  st.querySelector('#imp-back').addEventListener('click', () => (src === 'sms' ? impSmsStage(form) : impFileStage(form)));
  update();
}
function impApply(form) {
  const imp = form._imp;
  if (!imp) return false;
  const st = form.querySelector('#imp-stage');
  const picked = [...st.querySelectorAll('.imp-on')].filter(x => x.checked).map(x => +x.dataset.i);
  if (!picked.length) return false;
  const learn = st.querySelector('#imp-learn') && st.querySelector('#imp-learn').checked;
  let total = 0, learned = 0;
  const catChoice = i => st.querySelector(`#imp-cat-${i}`).value;
  for (const i of picked) {
    const r = imp.rows[i], note = (st.querySelector(`#imp-note-${i}`).value || r.merchant).trim().slice(0, 120);
    const res = addExpense({ categoryId: catChoice(i), amount: r.amount, date: r.date, note, noRoundup: true });
    res.exp.src = imp.src === 'sms' ? 'sms' : 'import';
    total += r.amount;
  }
  if (learn) {
    const seen = new Set();
    imp.rows.forEach((r, i) => {
      const key = merchantKey(r.merchant), chosen = catChoice(i);
      if (!key || seen.has(key) || chosen === r.cat) return;   // only learn what you changed
      seen.add(key);
      const ex = state.rules.find(x => x.match === key);
      if (ex) { if (ex.categoryId !== chosen) { ex.categoryId = chosen; learned++; } }
      else { state.rules.push({ id: uid(), match: key, categoryId: chosen }); learned++; }
    });
  }
  awardXP(10, 'import', true);
  commit(); playSound('coin');
  const pf = takePriceFlags();
  toast(`Added ${plural(picked.length, 'expense')} (${fmt(total)})${learned ? `. Remembered ${plural(learned, 'shop')}` : ''}${pf ? `. ${pf}` : ''}`, 4500);
  if (findRecurringCharges().some(x => !x.snoozed)) setTimeout(() => subSuggestModal(false), 700);
  return true;
}
/** Paste an SMS straight into the command palette. */
function smsCommand(q) {
  if (q.length < 30 || !/(debited|spent|paid|sent|withdrawn|txn|purchase)/i.test(q)) return null;
  const t = F.parseSms(q, todayISO());
  if (!t || t.type !== 'debit' || !state.budget.categories.length) return null;
  const g = guessCategory(t.merchant), cat = state.budget.categories.find(c => c.id === g.id);
  return { parsed: true, label: `Add ${fmt(t.amount)} at ${t.merchant} to ${cat.name} (${fmtDate(F.parseDate(t.date))})`,
    run: () => { const r = addExpense({ categoryId: cat.id, amount: t.amount, date: t.date, note: t.merchant }); r.exp.src = 'sms'; commit(); expenseToast(t.amount, r); } };
}
function rulesHTML() {
  if (!state.rules.length) return '<p class="small muted">Nothing yet. When you import bank messages or a statement and change a category, it gets remembered here.</p>';
  const cn = id => (state.budget.categories.find(c => c.id === id) || { name: 'Deleted category' }).name;
  return `<ul class="plain-list">${state.rules.map(r => `<li><span><strong>${esc(r.match)}</strong> → ${esc(cn(r.categoryId))}</span>
    <button type="button" class="icon-btn danger" data-action="delete-rule" data-id="${r.id}" aria-label="Forget rule for ${esc(r.match)}">${ICON.trash}</button></li>`).join('')}</ul>`;
}

/* ---------- OCR for photos and scanned PDFs (Tesseract, runs offline) ---------- */
let ocrPromise = null;
function loadOcr() {
  if (!ocrPromise) {
    ocrPromise = loadScript('assets/ocr/tesseract.min.js').then(() => loadScript('assets/ocr/eng-data.js'))
      .catch(err => { ocrPromise = null; throw err; });
  }
  return ocrPromise;
}
/** Recognise text in images/canvases. `onProgress(0..1)` reports overall progress. */
async function ocrLines(sources, onProgress) {
  await loadOcr();
  const bin = atob(window.YOKO_OCR_ENG);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  let uses = 0, page = 0;
  // tesseract.js v5 reads lang objects twice: first to load the bytes, then as the language name
  const lang = { code: 'eng', get data() { return uses++ === 0 ? data : 'eng'; } };
  const w = await window.Tesseract.createWorker([lang], 1, {
    workerPath: 'assets/ocr/worker.min.js', corePath: 'assets/ocr/', cacheMethod: 'none',
    logger: m => { if (onProgress && m.status === 'recognizing text') onProgress((page + m.progress) / sources.length); }
  });
  const lines = [];
  try {
    for (; page < sources.length; page++) {
      const r = await w.recognize(sources[page]);
      lines.push(...r.data.text.split(/\r?\n/));
    }
  } finally { try { await w.terminate(); } catch (e) { /* ignore */ } }
  return lines.map(l => l.trim()).filter(Boolean);
}
async function pdfPagesToCanvas(pdf, maxPages = 2) {
  const out = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 2.5 });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(c);
  }
  return out;
}
const isImageFile = f => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name || '');

