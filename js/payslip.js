/* YOKO! Student · Payslip reader (pdf.js, loaded on demand).
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   PAYSLIP READER (pdf.js, loaded on demand, runs offline)
   ========================================================= */
let pdfjsPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error(`Couldn’t load ${src}`));
    document.head.appendChild(el);
  });
}
/** pdf.js + its worker as plain scripts: the worker then runs on the main thread, which also works from file://. */
function loadPdfJs() {
  if (window.pdfjsLib && window.pdfjsWorker) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = loadScript('assets/pdfjs/pdf.min.js')
      .then(() => loadScript('assets/pdfjs/pdf.worker.min.js'))
      .then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js'; return window.pdfjsLib; })
      .catch(err => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}
/** Rebuild readable lines from positioned PDF text (same row = same line, wide gaps kept as 3 spaces). */
async function pdfToLines(pdf, maxPages = 5) {
  const lines = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let line = '', end = null;
      for (const it of r.items) {
        if (end !== null) line += it.x - end > 12 ? '   ' : (it.x - end > 1 ? ' ' : '');
        line += it.s; end = it.x + it.w;
      }
      lines.push(line.trim());
    }
  }
  return lines;
}
function openPayslipModal(file, preset) {
  openModal({
    title: 'Read a payslip', submitLabel: 'Save these numbers', wide: true,
    body: '<div id="ps-stage" class="stack"></div>',
    onMount: form => {
      if (preset) psReviewStage(form, preset.r, preset.meta);
      else { psUploadStage(form); if (file) psHandleFile(form, file); }
    },
    onSubmit: form => psApply(form)
  });
}
function psUploadStage(form) {
  form.querySelector('button[type="submit"]').hidden = true;
  const st = form.querySelector('#ps-stage');
  st.innerHTML = `
    <div class="dropzone" id="ps-drop">
      <p class="dz-icon" aria-hidden="true">📄</p><p><strong>Drop your payslip PDF or photo here</strong></p><p class="small muted">or</p>
      <button type="button" class="btn btn-primary" id="ps-pick">${ICON.upload}<span>Choose a file</span></button>
      <input type="file" id="ps-file" accept="application/pdf,.pdf,text/plain,.txt,image/*" class="sr-only" tabindex="-1" aria-label="Payslip file">
      <p class="small muted">Read on this device. Nothing gets uploaded.</p>
    </div>
    <div id="ps-status" aria-live="polite"></div>
    <div id="ps-pass" class="field" hidden></div>
    <details class="collapsible"><summary>No PDF? Paste the payslip text instead</summary>
      <div class="details-body"><label for="ps-text" class="field-label">Payslip text</label>
      <textarea id="ps-text" class="textarea" rows="6" placeholder="Copy the text from your payslip and paste it here"></textarea>
      <div><button type="button" class="btn btn-sm" id="ps-parse">Read this text</button></div></div></details>
    <p class="small">Photos and scans work too (the first one takes a few seconds). Or you can just <button type="button" class="linklike" id="ps-manual">type the numbers in</button>.</p>`;
  const input = st.querySelector('#ps-file');
  st.querySelector('#ps-pick').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) psHandleFile(form, input.files[0]); });
  bindDrop(st.querySelector('#ps-drop'), f => psHandleFile(form, f));
  st.querySelector('#ps-parse').addEventListener('click', () => {
    const text = st.querySelector('#ps-text').value;
    if (text.trim().length < 10) { st.querySelector('#ps-status').innerHTML = '<div class="alert alert-warn">Paste the payslip text first.</div>'; return; }
    psReviewStage(form, F.parsePayslip(text), { fileName: '', lines: text.split(/\r?\n/), source: 'text' });
  });
  st.querySelector('#ps-manual').addEventListener('click', () => psReviewStage(form, F.parsePayslip(''), { source: 'manual' }));
}
function bindDrop(zone, onFile) {
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('drag')));
  zone.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) onFile(f); });
}
async function psHandleFile(form, file) {
  const status = form.querySelector('#ps-status');
  const say = (html, cls = 'alert-info') => { if (status) status.innerHTML = `<div class="alert ${cls}" role="status">${html}</div>`; };
  const name = file.name || 'payslip';
  const ocr = async (sources, what) => {
    say(`Reading the text in ${what} on this device… <strong id="ocr-pct">0%</strong><div class="progress" style="margin-top:8px"><span id="ocr-bar" style="width:0%"></span></div>`);
    const lines = await ocrLines(sources, p => {
      const a = form.querySelector('#ocr-pct'), b = form.querySelector('#ocr-bar');
      if (a) a.textContent = `${Math.round(p * 100)}%`;
      if (b) b.style.width = `${Math.round(p * 100)}%`;
    });
    if (!form.isConnected) return;
    if (lines.join('').replace(/\s/g, '').length < 20) { say('Couldn’t read any text in that. Try a sharper photo, straight on and in good light, or type the numbers in.', 'alert-warn'); return; }
    psReviewStage(form, F.parsePayslip(lines), { fileName: name, lines, ocr: true });
  };
  try {
    if (/\.txt$/i.test(name) || file.type === 'text/plain') {
      const text = await file.text();
      psReviewStage(form, F.parsePayslip(text), { fileName: name, lines: text.split(/\r?\n/) });
      return;
    }
    if (isImageFile(file)) {
      if (file.size > 25e6) { say('That photo is over 25 MB. Try a smaller one.', 'alert-danger'); return; }
      try { const bmp = await createImageBitmap(file); if (bmp.close) bmp.close(); }
      catch (e) { say('Couldn’t open that image. Try a JPG or PNG photo of the payslip, or paste its text below.', 'alert-danger'); return; }
      await ocr([file], 'the photo');
      return;
    }
    if (!(/\.pdf$/i.test(name) || file.type === 'application/pdf')) { say('Choose a PDF or a photo of your payslip, or paste its text below.', 'alert-danger'); return; }
    if (file.size > 20e6) { say('That file is over 20 MB. Doesn’t look like a payslip.', 'alert-danger'); return; }
    say(`Reading <strong>${esc(name)}</strong>…`);
    const lib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.getDocument({ data, isEvalSupported: false });
    task.onPassword = (update, reason) => psAskPassword(form, update, reason);
    const pdf = await task.promise;
    const lines = await pdfToLines(pdf);
    if (lines.join('').replace(/\s/g, '').length < 20) {   // no text layer: it's a scan
      const pages = await pdfPagesToCanvas(pdf, 2);
      try { pdf.destroy(); } catch (e) { /* ignore */ }
      await ocr(pages, 'this scanned PDF');
      return;
    }
    try { pdf.destroy(); } catch (e) { /* ignore */ }
    psReviewStage(form, F.parsePayslip(lines), { fileName: name, lines });
  } catch (err) {
    console.warn('Payslip read failed', err);
    if (isImageFile(file)) say('Couldn’t open that image. Try a JPG or PNG photo of the payslip, or paste its text below.', 'alert-danger');
    else say(`Couldn’t read that file (${esc((err && err.message) || 'unknown error')}). Try another file, or paste the text below.`, 'alert-danger');
  }
}
function psAskPassword(form, update, reason) {
  const box = form.querySelector('#ps-pass');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<label for="ps-pw">${reason === 2 ? 'That password didn’t work. Try again' : 'This PDF is password-protected. Enter its password'}</label>
    <div style="display:flex;gap:8px"><input id="ps-pw" class="input" type="password" autocomplete="off"><button type="button" class="btn btn-primary" id="ps-unlock">Unlock</button></div>
    <p class="help">Payslip passwords are often your date of birth or an ID number. It’s only used to open the file here and isn’t saved.</p>`;
  const status = form.querySelector('#ps-status');
  if (status) status.innerHTML = '<div class="alert alert-info" role="status">Waiting for the password…</div>';
  const go = () => {
    const v = box.querySelector('#ps-pw').value;
    if (!v) return;
    box.hidden = true;
    if (status) status.innerHTML = '<div class="alert alert-info" role="status">Unlocking…</div>';
    update(v);
  };
  box.querySelector('#ps-unlock').addEventListener('click', go);
  box.querySelector('#ps-pw').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  box.querySelector('#ps-pw').focus();
}
function defaultNextPay(r) {
  const t = todayDate();
  if (r.payDate) { let d = F.addMonths(F.parseDate(r.payDate), 1); let k = 0; while (d < t && k++ < 60) d = F.addMonths(d, 1); return F.toISO(d); }
  return F.toISO(new Date(t.getFullYear(), t.getMonth() + 1, 1));
}
function psReviewStage(form, r, meta) {
  form.querySelector('button[type="submit"]').hidden = false;
  form._ps = { r, meta };
  const st = form.querySelector('#ps-stage');
  const sym = esc(CURRENCIES[state.currency].symbol);
  const found = r.found || {}, calc = r.calculated || {};
  const tag = k => meta.source === 'manual' || meta.source === 'history' ? '' : calc[k] ? '<span class="badge">worked out</span>' : found[k] ? '<span class="badge badge-success">found</span>' : '<span class="badge badge-neutral">not found</span>';
  const monthVal = r.month || todayISO().slice(0, 7);
  const count = ['gross', 'net', 'tax', 'pf', 'pt', 'esi', 'month'].filter(k => found[k] || calc[k]).length;
  const dup = state.payslips.find(p => p.month === monthVal && p.employer === (r.employer || ''));
  const money = (name, label, value, key) => `<div class="field"><label for="ps-${name}">${label} ${key ? tag(key) : ''}</label>
    <div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="ps-${name}" class="input" inputmode="decimal" autocomplete="off" value="${value === null || value === undefined ? '' : numStr(value)}" aria-describedby="ps-${name}-err"></div>
    <p class="field-error" id="ps-${name}-err"></p></div>`;
  st.innerHTML = `
    ${meta.source === 'manual' ? '<p class="muted">Type the figures from your payslip.</p>' : meta.source === 'history' ? '<p class="muted">Figures from your saved payslip. Check them, then save.</p>'
      : `<div class="alert ${count >= 3 ? 'alert-success' : 'alert-warn'}" role="status">${meta.fileName ? `Read <strong>${esc(meta.fileName)}</strong>. ` : ''}Found ${count} of 7 key figures. ${meta.ocr ? 'This was read from an image, so check every number.' : 'Check them before saving.'}</div>`}
    ${r.warning ? `<div class="alert alert-warn">${esc(r.warning)}</div>` : ''}
    ${dup && meta.source !== 'history' ? '<div class="alert alert-info">You already saved a payslip for this month. Saving again replaces it.</div>' : ''}
    <div class="form-grid two">
      <div class="field"><label for="ps-employer">Employer ${tag('employer')}</label><input id="ps-employer" class="input" maxlength="80" value="${esc(r.employer || '')}"></div>
      <div class="field"><label for="ps-month">Pay month ${tag('month')}</label><input id="ps-month" class="input" type="month" value="${monthVal}" aria-describedby="ps-month-err"><p class="field-error" id="ps-month-err"></p></div>
      ${money('gross', 'Gross pay', r.gross, 'gross')}
      ${money('net', 'Net (take-home) pay', r.net, 'net')}
      ${money('tax', 'Income tax (withheld)', r.tax, 'tax')}
      ${money('pf', 'Pension / retirement', r.pf, 'pf')}
      ${money('pt', 'Payroll taxes (NI, Social Security, PT…)', r.pt, 'pt')}
      ${money('esi', 'Insurance', r.esi, 'esi')}
      ${money('other', 'Other deductions', r.other || 0, null)}
      <div class="field"><label for="ps-freq">Pay frequency</label><select id="ps-freq" class="select">${freqOptions(state.income.configured ? state.income.freq : 'monthly')}</select></div>
      <div class="field span-2"><label for="ps-next">Next pay date</label><input id="ps-next" class="input" type="date" value="${defaultNextPay(r)}"></div>
    </div>
    <div class="calc-line" id="ps-check" aria-live="polite"></div>
    <fieldset><legend>What should YOKO! do with it?</legend><div style="display:grid;gap:8px">
      <label class="check"><input type="checkbox" id="ps-use-income" checked> Set my paycheck from this payslip</label>
      <label class="check"><input type="checkbox" id="ps-use-tax" checked> Log the tax in Wallet → Taxes</label>
      <label class="check"><input type="checkbox" id="ps-use-history" checked> Save it to my payslip history</label>
    </div></fieldset>
    ${meta.lines && meta.lines.length ? `<details class="collapsible"><summary>See the text YOKO! read</summary><div class="details-body"><pre class="ps-text">${esc(meta.lines.slice(0, 80).join('\n'))}</pre></div></details>` : ''}
    ${meta.source === 'history' ? '' : '<p class="small"><button type="button" class="linklike" id="ps-again">Use a different file</button></p>'}`;
  const num = id => { const v = parseNum(st.querySelector('#ps-' + id).value); return Number.isFinite(v) ? v : 0; };
  const check = () => {
    if (!st.querySelector('#ps-gross')) return;   // back on the upload screen
    const gross = num('gross'), net = num('net');
    const ded = ['tax', 'pf', 'pt', 'esi', 'other'].reduce((a, k) => a + num(k), 0);
    const box = st.querySelector('#ps-check');
    if (!(gross > 0)) { box.innerHTML = net > 0 ? `<span>No gross pay, so your paycheck will be set to the net ${fmt(net)}.</span>` : '<span>Enter gross or net pay.</span>'; return; }
    const calcNet = gross - ded;
    if (net > 0 && Math.abs(calcNet - net) > 1) {
      const diff = gross - net - (ded - num('other'));
      box.innerHTML = `<span class="tone-warn-text">Gross − deductions = ${fmt(calcNet)}, but net pay says ${fmt(net)}.</span>${diff >= 0 ? `<button type="button" class="linklike" id="ps-fix">Put the difference in “Other”</button>` : ''}`;
      const fix = box.querySelector('#ps-fix');
      if (fix) fix.addEventListener('click', () => { st.querySelector('#ps-other').value = numStr(diff); check(); });
    } else box.innerHTML = `<span>Gross − deductions = <strong>${fmt(calcNet)}</strong></span>${net > 0 ? '<span class="tone-success-text">✓ matches net pay</span>' : ''}`;
  };
  st.addEventListener('input', check);
  check();
  const again = st.querySelector('#ps-again');
  if (again) again.addEventListener('click', () => psUploadStage(form));
  (st.querySelector('#ps-gross') || st.querySelector('input')).focus();
}
function psApply(form) {
  const st = form.querySelector('#ps-stage');
  if (!form._ps || !st.querySelector('#ps-gross')) return false;
  const el = id => st.querySelector('#ps-' + id);
  const vals = {};
  let ok = true, first = null;
  const bad = (id, msg) => { ok = false; const e = el(id); e.setAttribute('aria-invalid', 'true'); st.querySelector(`#ps-${id}-err`).textContent = msg; first = first || e; };
  for (const k of ['gross', 'net', 'tax', 'pf', 'pt', 'esi', 'other']) {
    const r = validateValue('money', el(k).value, {});
    if (r.error) bad(k, r.error); else { el(k).removeAttribute('aria-invalid'); st.querySelector(`#ps-${k}-err`).textContent = ''; vals[k] = r.value; }
  }
  const month = el('month').value;
  if (!/^\d{4}-\d{2}$/.test(month)) bad('month', 'Choose the month this payslip is for.');
  if (ok && !(vals.gross > 0) && !(vals.net > 0)) bad('gross', 'Enter gross pay or net pay.');
  const ded = vals.tax + vals.pf + vals.pt + vals.esi + vals.other;
  if (ok && vals.gross > 0 && ded > vals.gross) bad('gross', 'Deductions add up to more than gross pay.');
  if (!ok) { if (first) first.focus(); return false; }

  const employer = el('employer').value.trim().slice(0, 80);
  const next = el('next').value, freq = el('freq').value;
  const net = vals.net > 0 ? vals.net : Math.max(0, vals.gross - ded);
  const [yy, mm] = month.split('-').map(Number);
  const payDate = (form._ps.r && form._ps.r.payDate && form._ps.r.payDate.slice(0, 7) === month) ? form._ps.r.payDate : F.toISO(new Date(yy, mm, 0));
  const id = uid(), done = [];
  const old = state.payslips.find(p => p.month === month && p.employer === employer);
  if (old) { state.payslips = state.payslips.filter(p => p !== old); state.wallet.taxes = state.wallet.taxes.filter(tx => tx.payslipId !== old.id); }
  if (el('use-income').checked) {
    const inc = state.income;
    if (vals.gross > 0) {
      state.income = Object.assign({}, inc, {
        mode: 'gross', gross: vals.gross, net,
        deductions: [['Income tax', vals.tax], ['Pension / retirement', vals.pf], ['Payroll taxes', vals.pt], ['Insurance', vals.esi], ['Other', vals.other]]
          .map(([name, value]) => ({ name, mode: 'amount', value }))
      });
    } else state.income = Object.assign({}, inc, { mode: 'net', net });
    state.income.freq = FREQ_LABEL[freq] ? freq : 'monthly';
    if (F.parseDate(next)) state.income.nextPayDate = next;
    state.income.configured = true;
    done.push('paycheck set');
  }
  if (el('use-tax').checked && (vals.tax > 0 || vals.pt > 0)) {
    const note = `Payslip · ${monthLabelISO(month)}`;
    if (vals.tax > 0) state.wallet.taxes.push({ id: uid(), date: payDate, type: 'Withheld from pay', amount: vals.tax, note, payslipId: id });
    if (vals.pt > 0) state.wallet.taxes.push({ id: uid(), date: payDate, type: PAYROLL_TAX, amount: vals.pt, note, payslipId: id });
    done.push(`${fmt(vals.tax + vals.pt)} tax logged`);
  }
  if (el('use-history').checked) {
    state.payslips.push({ id, month, employer, gross: vals.gross, net, tax: vals.tax, pf: vals.pf, pt: vals.pt, esi: vals.esi, other: vals.other, fileName: (form._ps.meta && form._ps.meta.fileName) || '', addedAt: todayISO() });
    done.push('saved');
  }
  awardXP(10, 'payslip', true);
  commit(); playSound('coin');
  toast(`Payslip: ${done.join(', ') || 'nothing changed'}`, 4000);
  return true;
}

