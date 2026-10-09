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
/** Everyday student words → the kind of category they belong in (checked against the user's own category names). */
const STUDENT_WORDS = [
  [/\b(chai|tea|coffee|cafe|canteen|snacks?|maggi|samosa|nescafe|bun|juice|cold coffee)\b/, /chai|canteen|snack|cafe|coffee/],
  [/\b(mess|hostel|pg|rent|warden)\b/, /mess|hostel|rent|pg\b/],
  [/\b(metro|auto|cab|uber|ola|rapido|bus|train|petrol|fuel|station|travel|bike)\b/, /trans|travel|metro|auto|commute/],
  [/\b(books?|bookstore|xerox|print(ing|out)?|stationery|notebooks?|lab|record|course|exam)\b/, /study|book|college|supplies/],
  [/\b(jio|airtel|vi|bsnl|recharge|wifi|wi-fi|internet|broadband|phone|mobile|data pack)\b/, /phone|wifi|mobile|internet/],
  [/\b(swiggy|zomato|pizza|biryani|burger|dominos?|kfc|mcdonald'?s|blinkit|zepto|food delivery|takeout)\b/, /deliver|zomato|swiggy|takeout|food/],
  [/\b(movies?|pvr|inox|cinema|concert|party|outing|dinner|bowling|gaming|fest|club)\b/, /outing|movie|fun|entertain/],
  [/\b(netflix|spotify|prime|hotstar|jiohotstar|youtube|subscription|icloud|gym)\b/, /subscri|ott|stream|gym/]
];
const NAME_STOP = new Set(['and', 'the', 'fees', 'fee', 'fund', 'plan', 'bills', 'bill', 'other', 'money', 'spend', 'spending']);
function guessCategory(text) {
  const cats = state.budget.categories;
  if (!cats.length) return null;
  const r = F.categorize(text, state.rules.map(x => [x.match, x.categoryId]));
  if (r && r.source === 'rule' && cats.some(c => c.id === r.name)) return { id: r.name, source: 'rule' };
  const t = String(text || '').toLowerCase();
  const spendCats = cats.filter(c => c.type !== 'savings' || /\b(save|saving|savings|fund|goal)\b/.test(t));
  // 1. student words ("chai" → Chai & Canteen, "rapido" → Transport & Metro)
  for (const [words, catRe] of STUDENT_WORDS) if (words.test(t)) { const c = spendCats.find(k => catRe.test(k.name.toLowerCase())); if (c) return { id: c.id, source: 'auto' }; }
  // 2. a word that appears in a category's own name ("bookstore" → Study & Books)
  const tw = t.split(/[^a-z]+/).filter(w => w.length >= 4 && !NAME_STOP.has(w));
  for (const c of spendCats) {
    const cw = c.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4 && !NAME_STOP.has(w));
    if (tw.some(w => cw.some(k => w === k || w.startsWith(k) || k.startsWith(w)))) return { id: c.id, source: 'auto' };
  }
  // 3. the general merchant list
  if (r && r.source !== 'rule') { const c = catByLooseName(r.name); if (c) return { id: c.id, source: 'auto' }; }
  const fb = cats.find(c => /\b(other|misc|shopping|fun)\b/i.test(c.name)) || cats.find(c => c.type === 'wants') || cats[0];
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
  st.innerHTML = `<div class="dropzone" id="imp-drop"><p class="dz-icon" aria-hidden="true">🏦</p><p><strong>Drop bank statements or UPI screenshots here</strong></p><p class="small muted">CSV, PDF, or UPI screenshots (PNG / JPG)</p>
      <div class="row" style="justify-content:center;margin-top:8px">
        <button type="button" class="btn btn-primary" id="imp-pick">${ICON.upload}<span>Choose files</span></button>
        <button type="button" class="btn" id="imp-demo-shots">Try 15 sample UPI screenshots</button>
      </div>
      <input type="file" id="imp-file" accept=".csv,.txt,.pdf,text/csv,application/pdf,image/*,.png,.jpg,.jpeg" multiple class="sr-only" tabindex="-1" aria-label="Statement file">
      <p class="small muted">Read privately on this device.</p></div>
    <div id="ps-status" aria-live="polite"></div><div id="ps-pass" class="field" hidden></div>`;
  const input = st.querySelector('#imp-file');
  st.querySelector('#imp-pick').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files && input.files.length) impHandleFiles(form, Array.from(input.files)); });
  bindDrop(st.querySelector('#imp-drop'), f => impHandleFiles(form, [f]));
  st.querySelector('#imp-demo-shots').addEventListener('click', () => {
    const t = todayDate();
    const ago = n => F.toISO(F.addDays(t, -n));
    const sampleTxns = [
      { amount: 240, type: 'debit', merchant: 'SWIGGY', date: ago(5), raw: 'Paid to SWIGGY Rs 240' },
      { amount: 40, type: 'debit', merchant: 'CHAI POINT', date: ago(5), raw: 'Paid to CHAI POINT Rs 40' },
      { amount: 120, type: 'debit', merchant: 'CAMPUS CANTEEN', date: ago(4), raw: 'Paid to CAMPUS CANTEEN Rs 120' },
      { amount: 350, type: 'debit', merchant: 'RAHUL VERMA', date: ago(4), raw: 'Paid to RAHUL VERMA (WiFi Split) Rs 350' },
      { amount: 380, type: 'debit', merchant: 'ZOMATO', date: ago(3), raw: 'Paid to ZOMATO Rs 380' },
      { amount: 50, type: 'debit', merchant: 'METRO SMART CARD', date: ago(3), raw: 'Paid to METRO SMART CARD Rs 50' },
      { amount: 450, type: 'debit', merchant: 'COLLEGE BOOKSTORE', date: ago(2), raw: 'Paid to COLLEGE BOOKSTORE Rs 450' },
      { amount: 60, type: 'debit', merchant: 'NESCAFE KIOSK', date: ago(2), raw: 'Paid to NESCAFE KIOSK Rs 60' },
      { amount: 4500, type: 'debit', merchant: 'HOSTEL MESS', date: ago(1), raw: 'Paid to HOSTEL MESS Rs 4500' },
      { amount: 180, type: 'debit', merchant: 'RAPIDO AUTO', date: ago(1), raw: 'Paid to RAPIDO AUTO Rs 180' },
      { amount: 649, type: 'debit', merchant: 'NETFLIX INDIA', date: ago(1), raw: 'Paid to NETFLIX INDIA Rs 649' },
      { amount: 119, type: 'debit', merchant: 'SPOTIFY INDIA', date: todayISO(), raw: 'Paid to SPOTIFY INDIA Rs 119' },
      { amount: 299, type: 'debit', merchant: 'JIO PREPAID', date: todayISO(), raw: 'Paid to JIO PREPAID Rs 299' },
      { amount: 150, type: 'debit', merchant: 'XEROX & PRINT SHOP', date: todayISO(), raw: 'Paid to XEROX & PRINT SHOP Rs 150' },
      { amount: 600, type: 'debit', merchant: 'PVR CINEMAS', date: todayISO(), raw: 'Paid to PVR CINEMAS Rs 600' }
    ];
    impReview(form, sampleTxns, 'import', '15 Sample UPI Screenshots');
  });
}
async function impHandleFiles(form, files) {
  if (!files || !files.length) return;
  const status = form.querySelector('#ps-status');
  const say = (html, cls = 'alert-info') => { if (status) status.innerHTML = `<div class="alert ${cls}" role="status">${html}</div>`; };
  try {
    const allTxns = [];
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length > 0) {
      say(`Reading ${plural(imageFiles.length, 'screenshot')}…`);
      for (const file of imageFiles) {
        const lines = await ocrLines([file]);
        const parsed = F.parseSmsBatch(lines.join('\n'), todayISO());
        if (parsed.length) allTxns.push(...parsed);
        else {
          const rc = F.parseReceipt(lines);
          if (rc.total > 0) allTxns.push({ amount: rc.total, type: 'debit', merchant: rc.merchant || 'UPI Payment', date: rc.date || todayISO(), raw: lines.join(' ') });
        }
      }
    }
    const docFiles = files.filter(f => !isImageFile(f));
    for (const file of docFiles) {
      const name = file.name || 'statement';
      if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
        say(`Reading <strong>${esc(name)}</strong>…`);
        const lib = await loadPdfJs();
        const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        task.onPassword = (update, reason) => psAskPassword(form, update, reason);
        const pdf = await task.promise;
        const lines = await pdfToLines(pdf, 40);
        try { pdf.destroy(); } catch (e) { /* ignore */ }
        allTxns.push(...F.parseStatementLines(lines));
      } else if (/\.(csv|txt|tsv)$/i.test(name) || /text|csv/.test(file.type)) {
        allTxns.push(...F.parseStatementCsv(await file.text()));
      }
    }
    if (!allTxns.length) {
      say('Couldn’t extract transactions from the selected files. Try CSV or paste messages instead.', 'alert-warn');
      return;
    }
    impReview(form, allTxns, 'import', `${plural(files.length, 'file')}`);
  } catch (err) {
    console.error('Import processing failed', err);
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
      if (!key || seen.has(key) || chosen === r.cat) return;
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
  if (typeof triggerPetReaction === 'function') triggerPetReaction('import', `Imported ${picked.length} expenses. Dashboard updated!`);
  if (typeof checkBudgetNudges === 'function') checkBudgetNudges();
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

