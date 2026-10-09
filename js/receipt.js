/* YOKO! Student · Scan a receipt.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* ---------- Receipt photos: a small copy kept on this phone (IndexedDB), linked to the expense ---------- */
const PhotoDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('yoko-photos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(blob, id); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('photos').objectStore('photos').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); },
  async del(id) { try { const db = await this.open(); db.transaction('photos', 'readwrite').objectStore('photos').delete(id); } catch (e) { /* nothing to delete */ } }
};
/** Shrink a photo to about 900px wide JPEG so it stays small. */
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.7));
}
async function showReceiptPhoto(expId) {
  let blob = null;
  try { blob = await PhotoDB.get(expId); } catch (e) { blob = null; }
  if (!blob) { toast('No photo saved for this one (photos stay on the phone they were taken on).'); return; }
  const url = URL.createObjectURL(blob);
  openModal({ title: 'Receipt photo', hideSubmit: true, cancelLabel: 'Close', body: `<img src="${url}" alt="Receipt photo" style="width:100%;border-radius:10px">`, onMount: () => setTimeout(() => URL.revokeObjectURL(url), 60000) });
}
/* =========================================================
   SCAN A RECEIPT
   ========================================================= */
function receiptModal() {
  if (!state.budget.categories.length) { toast('Add a budget category first.'); location.hash = '#budget/plan'; return; }
  openModal({
    title: 'Scan a receipt', submitLabel: 'Add expense', wide: true,
    body: '<div id="rc-stage" class="stack"></div>',
    onMount: form => rcUploadStage(form),
    onSubmit: form => rcApply(form)
  });
}
function rcUploadStage(form) {
  form.querySelector('button[type="submit"]').hidden = true;
  const st = form.querySelector('#rc-stage');
  st.innerHTML = `<div class="dropzone" id="rc-drop"><p class="dz-icon" aria-hidden="true">🧾</p><p><strong>Take a photo of the receipt</strong></p>
      <div class="row" style="justify-content:center"><button type="button" class="btn btn-primary" id="rc-camera">${ICON.upload}<span>Take a photo</span></button>
      <button type="button" class="btn" id="rc-pick">Choose a file</button></div>
      <input type="file" id="rc-cam-input" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-label="Take a photo">
      <input type="file" id="rc-file" accept="image/*,application/pdf,.pdf" class="sr-only" tabindex="-1" aria-label="Receipt file">
      <p class="small muted">Read on this device. Flat, well lit and straight on works best.</p></div>
    <div id="rc-status" aria-live="polite"></div>`;
  const cam = st.querySelector('#rc-cam-input'), file = st.querySelector('#rc-file');
  st.querySelector('#rc-camera').addEventListener('click', () => cam.click());
  st.querySelector('#rc-pick').addEventListener('click', () => file.click());
  [cam, file].forEach(inp => inp.addEventListener('change', () => { if (inp.files[0]) rcHandleFile(form, inp.files[0]); }));
  bindDrop(st.querySelector('#rc-drop'), f => rcHandleFile(form, f));
}
async function rcHandleFile(form, file) {
  form._photo = isImageFile(file) ? file : null;
  const status = form.querySelector('#rc-status');
  const say = (html, cls = 'alert-info') => { if (status) status.innerHTML = `<div class="alert ${cls}" role="status">${html}</div>`; };
  try {
    let lines = [], ocr = true;
    const progress = p => { const a = form.querySelector('#ocr-pct'); if (a) a.textContent = `${Math.round(p * 100)}%`; const b = form.querySelector('#ocr-bar'); if (b) b.style.width = `${Math.round(p * 100)}%`; };
    const reading = '<span>Reading the receipt… <strong id="ocr-pct">0%</strong></span><div class="progress" style="margin-top:8px"><span id="ocr-bar" style="width:0%"></span></div>';
    if (isImageFile(file)) {
      try { const bmp = await createImageBitmap(file); if (bmp.close) bmp.close(); }
      catch (e) { say('Couldn’t open that image. Try a JPG or PNG photo.', 'alert-danger'); return; }
      say(reading);
      lines = await ocrLines([file], progress);
    } else if (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf') {
      say('Reading the PDF…');
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      lines = await pdfToLines(pdf, 3);
      ocr = false;
      if (lines.join('').replace(/\s/g, '').length < 20) { say(reading); lines = await ocrLines(await pdfPagesToCanvas(pdf, 1), progress); ocr = true; }
      try { pdf.destroy(); } catch (e) { /* ignore */ }
    } else { say('Choose a photo or a PDF of the receipt.', 'alert-danger'); return; }
    if (!form.isConnected) return;
    const r = F.parseReceipt(lines);
    rcReviewStage(form, r, lines, ocr);
  } catch (err) {
    console.warn('Receipt read failed', err);
    say('Couldn’t read that receipt. You can type it in instead.', 'alert-danger');
    rcReviewStage(form, { total: null, date: null, merchant: '', found: {} }, [], false);
  }
}
/** Receipt dates outside this budget period (old bills, misread years, future dates) default to today, so the spend shows up in Budget and Where did it go. */
function rcDate(d) {
  const t = todayISO(), from = periodRange().from;
  return d && F.parseDate(d) && d >= from && d <= t ? d : t;
}
function rcReviewStage(form, r, lines, ocr) {
  form.querySelector('button[type="submit"]').hidden = false;
  const st = form.querySelector('#rc-stage');
  const cats = state.budget.categories, g = guessCategory(r.merchant || '');
  const sym = esc(CURRENCIES[state.currency].symbol);
  const tag = k => (r.found && r.found[k] ? '<span class="badge badge-success">found</span>' : '<span class="badge badge-neutral">check</span>');
  st.innerHTML = `<div class="alert ${r.found && r.found.total ? 'alert-success' : 'alert-warn'}" role="status">${r.found && r.found.total ? 'Got it.' : 'Couldn’t spot the total, so this is a best guess.'} Check the details, then add it.</div>
    <div class="form-grid two">
      <div class="field"><label for="rc-merchant">Where ${tag('merchant')}</label><input id="rc-merchant" class="input" maxlength="120" value="${esc(r.merchant || '')}" placeholder="Shop name"></div>
      <div class="field"><label for="rc-amount">Total ${tag('total')}</label><div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="rc-amount" class="input" inputmode="decimal" value="${r.total ? numStr(r.total) : ''}" aria-describedby="rc-amount-err"></div><p class="field-error" id="rc-amount-err"></p></div>
      <div class="field"><label for="rc-date">Date ${tag('date')}</label><input id="rc-date" class="input" type="date" value="${rcDate(r.date)}">${r.date && rcDate(r.date) !== r.date ? `<p class="help">The receipt says ${esc(fmtDate(F.parseDate(r.date)))}. Set to today so it counts in this month’s budget. Change it if you want.</p>` : ''}</div>
      <div class="field"><label for="rc-cat">Category</label><select id="rc-cat" class="select">${cats.map(c => `<option value="${c.id}" ${g && c.id === g.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__newcat__">+ New category…</option></select></div>
    </div>
    ${lines.length ? `<details class="collapsible"><summary>See the text it read</summary><div class="details-body"><pre class="ps-text">${esc(lines.slice(0, 60).join('\n'))}</pre></div></details>` : ''}
    <p class="small"><button type="button" class="linklike" id="rc-again">Scan a different receipt</button> · <button type="button" class="linklike" id="rc-split">Split it across categories</button></p>`;
  st.querySelector('#rc-again').addEventListener('click', () => rcUploadStage(form));
  st.querySelector('#rc-split').addEventListener('click', () => {
    const a = validateValue('money', st.querySelector('#rc-amount').value, { required: false });
    splitExpenseForm({ amount: a.value || 0, date: st.querySelector('#rc-date').value, note: st.querySelector('#rc-merchant').value.trim(), src: 'receipt' });
  });
  (st.querySelector('#rc-amount').value ? st.querySelector('#rc-merchant') : st.querySelector('#rc-amount')).focus();
}
function rcApply(form) {
  const st = form.querySelector('#rc-stage'), amt = st.querySelector('#rc-amount');
  if (!amt) return false;
  const v = validateValue('money', amt.value, { required: true, positive: true });
  if (v.error) { amt.setAttribute('aria-invalid', 'true'); st.querySelector('#rc-amount-err').textContent = v.error; amt.focus(); return false; }
  const date = F.parseDate(st.querySelector('#rc-date').value) ? st.querySelector('#rc-date').value : todayISO();
  const note = st.querySelector('#rc-merchant').value.trim().slice(0, 120) || 'Receipt';
  const r = addExpense({ categoryId: st.querySelector('#rc-cat').value, amount: v.value, date, note });
  r.exp.src = 'receipt';
  if (form._photo) {
    r.exp.photo = true;
    shrinkPhoto(form._photo).then(b => b && PhotoDB.put(r.exp.id, b)).catch(e => { console.warn('Photo not saved', e); delete r.exp.photo; save(); });
  }
  commit(); expenseToast(v.value, r);
  return true;
}

