/* YOKO! Student · Bill Photo Splitter, UPI Settle-Up, and Parent Top-Up.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* =========================================================
   1. BILL PHOTO SPLITTER
   ========================================================= */

/**
 * Open the interactive Bill Photo Splitter modal.
 * @param {Object} [preset]
 */
function billSplitterModal(preset = {}) {
  const cats = state.budget.categories;
  if (!cats.length) { toast('Add a budget category first.'); location.hash = '#budget/plan'; return; }

  // Initial state for the splitter workbench
  let billData = {
    title: preset.what || preset.title || 'Hostel Dinner / Group Bill',
    date: preset.date || todayISO(),
    categoryId: preset.categoryId || (catLike(/food|dining|eat/i, 'wants') || {}).id || cats[0].id,
    paidBy: preset.paidBy || 'me',
    payer: preset.payer || '',
    items: (preset.items && Array.isArray(preset.items) && preset.items.length) ? preset.items : [
      { id: 'it_1', name: 'Item 1', price: Number(preset.total) || 0, qty: 1 }
    ],
    tax: Number(preset.tax) || 0,
    serviceCharge: Number(preset.serviceCharge) || 0,
    people: [{ id: 'me', name: 'Me' }]
  };

  // Add initial people from preset or contacts
  if (preset.people) {
    const names = typeof preset.people === 'string' ? splitNames(preset.people) : preset.people;
    names.forEach((n, idx) => {
      const clean = String(n).trim();
      if (clean && clean.toLowerCase() !== 'me' && !billData.people.find(p => p.name.toLowerCase() === clean.toLowerCase())) {
        billData.people.push({ id: 'p_' + (idx + 1), name: clean });
      }
    });
  } else {
    // Offer up to 2 recent IOU contacts by default
    const recents = allKnownPeople().slice(0, 2);
    recents.forEach((n, idx) => {
      billData.people.push({ id: 'p_' + (idx + 1), name: n });
    });
  }

  // Assignments: itemId -> array of personIds
  const assignments = {};
  billData.items.forEach(it => {
    assignments[it.id] = billData.people.map(p => p.id); // default split with all
  });

  openModal({
    title: 'Split a bill',
    submitLabel: 'Save & Record IOUs',
    wide: true,
    body: '<div id="bs-container" class="stack"></div>',
    onMount: form => bsRenderStage(form, billData, assignments),
    onSubmit: form => bsSaveSplit(form, billData, assignments)
  });
}

function bsRenderStage(form, data, assignments) {
  const container = form.querySelector('#bs-container');
  const cats = state.budget.categories;
  const known = allKnownPeople().filter(n => !data.people.find(p => p.name.toLowerCase() === n.toLowerCase()));

  // Calculate current exact split
  const splitResult = F.splitBillExact({
    items: data.items,
    tax: data.tax,
    serviceCharge: data.serviceCharge,
    people: data.people,
    assignments
  });

  container.innerHTML = `
    <!-- Top toolbar: Photo scanner / upload -->
    <div class="bs-scanner-box alert alert-info" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <strong>📸 Snap / Upload bill receipt</strong>
          <p class="small muted" style="margin:0">Take a photo and YOKO! reads the items and prices on this device.</p>
        </div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn btn-sm btn-primary" id="bs-snap-btn">${ICON.upload}<span>Camera / Upload</span></button>
          <input type="file" id="bs-file-input" accept="image/*,application/pdf" class="sr-only" tabindex="-1">
        </div>
      </div>
      <div id="bs-ocr-status" style="margin-top:6px" aria-live="polite"></div>
    </div>

    <!-- Bill Details -->
    <div class="form-grid three mb">
      <div class="field">
        <label for="bs-title">Bill title</label>
        <input type="text" id="bs-title" class="input input-sm" value="${esc(data.title)}" maxlength="80" placeholder="e.g. Pizza party">
      </div>
      <div class="field">
        <label for="bs-date">Date</label>
        <input type="date" id="bs-date" class="input input-sm" value="${data.date}">
      </div>
      <div class="field">
        <label for="bs-cat">Category (for your share)</label>
        <select id="bs-cat" class="select input-sm">
          ${cats.map(c => `<option value="${c.id}" ${c.id === data.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Payer Selection -->
    <div class="row mb" style="align-items:center;gap:12px;flex-wrap:wrap">
      <span class="small" style="font-weight:600">Who paid?</span>
      <label class="radio-label"><input type="radio" name="bs-paidBy" value="me" ${data.paidBy === 'me' ? 'checked' : ''}> I paid the full bill</label>
      <label class="radio-label"><input type="radio" name="bs-paidBy" value="other" ${data.paidBy === 'other' ? 'checked' : ''}> Someone else paid</label>
      <select id="bs-payer-select" class="select input-sm" style="display:${data.paidBy === 'other' ? 'inline-block' : 'none'};width:auto">
        ${data.people.filter(p => p.id !== 'me').map(p => `<option value="${esc(p.name)}" ${data.payer === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
    </div>

    <!-- People Selector -->
    <div class="card mb" style="padding:12px;background:var(--surface-2)">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="small font-bold">People in this split (${data.people.length}):</span>
      </div>
      <div class="bs-people-chips" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${data.people.map(p => `
          <span class="badge ${p.id === 'me' ? 'badge-primary' : 'badge-neutral'} bs-person-tag" data-pid="${p.id}">
            ${esc(p.name)}
            ${p.id !== 'me' ? `<button type="button" class="bs-remove-person icon-btn" data-pid="${p.id}" style="font-size:12px;padding:0 2px" aria-label="Remove ${esc(p.name)}">×</button>` : ''}
          </span>
        `).join('')}
        <div class="row" style="gap:4px;margin-left:4px">
          <input type="text" id="bs-new-name" class="input input-sm" placeholder="+ Add person" style="width:120px;padding:4px 8px;font-size:13px">
          <button type="button" class="btn btn-sm" id="bs-add-name-btn">+</button>
        </div>
      </div>
      ${known.length ? `
        <div class="row small muted" style="margin-top:8px;gap:6px;align-items:center;flex-wrap:wrap">
          <span>Quick add contact:</span>
          ${known.slice(0, 5).map(n => `<button type="button" class="linklike bs-quick-contact" data-name="${esc(n)}">+ ${esc(n)}</button>`).join(' · ')}
        </div>
      ` : ''}
    </div>

    <!-- Items List -->
    <div class="card mb" style="padding:12px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="small font-bold">Bill Line Items:</span>
        <button type="button" class="btn btn-sm" id="bs-add-item-btn">+ Add item</button>
      </div>

      <div class="bs-items-table" style="display:flex;flex-direction:column;gap:8px">
        ${data.items.map((it, idx) => {
          const itemAssigned = assignments[it.id] || [];
          return `
            <div class="bs-item-row" data-id="${it.id}" style="border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface)">
              <div class="row" style="gap:6px;align-items:center;margin-bottom:6px">
                <input type="text" class="input input-sm bs-item-name" data-id="${it.id}" value="${esc(it.name)}" placeholder="Item name" style="flex:2">
                <div class="affix" style="flex:1;min-width:90px">
                  <span class="affix-sym">${esc(CURRENCIES[state.currency].symbol)}</span>
                  <input type="number" step="0.01" class="input input-sm bs-item-price" data-id="${it.id}" value="${it.price || ''}" placeholder="0.00">
                </div>
                <button type="button" class="icon-btn danger bs-item-del" data-id="${it.id}" aria-label="Delete item">${ICON.trash}</button>
              </div>
              <!-- Assign people chips -->
              <div class="row" style="gap:4px;align-items:center;flex-wrap:wrap">
                <span class="small muted" style="font-size:12px">Split with:</span>
                <button type="button" class="btn btn-sm bs-assign-all" data-id="${it.id}" style="padding:2px 6px;font-size:11px">All</button>
                ${data.people.map(p => {
                  const isAssigned = itemAssigned.includes(p.id);
                  return `<button type="button" class="badge ${isAssigned ? 'badge-success' : 'badge-neutral'} bs-assign-toggle" data-id="${it.id}" data-pid="${p.id}" style="cursor:pointer;padding:3px 8px;font-size:12px">
                    ${isAssigned ? '✓ ' : ''}${esc(p.name)}
                  </button>`;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Taxes & Extra Charges -->
      <div class="form-grid two" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div class="field">
          <label for="bs-tax" class="small">Taxes (GST / VAT) - split proportionally</label>
          <div class="affix">
            <span class="affix-sym">${esc(CURRENCIES[state.currency].symbol)}</span>
            <input type="number" step="0.01" id="bs-tax" class="input input-sm" value="${data.tax || ''}" placeholder="0.00">
          </div>
        </div>
        <div class="field">
          <label for="bs-sc" class="small">Service Charge - split proportionally</label>
          <div class="affix">
            <span class="affix-sym">${esc(CURRENCIES[state.currency].symbol)}</span>
            <input type="number" step="0.01" id="bs-sc" class="input input-sm" value="${data.serviceCharge || ''}" placeholder="0.00">
          </div>
        </div>
      </div>
    </div>

    <!-- Live Per-Person Split Summary -->
    <div class="card" style="padding:12px;background:var(--surface-2)">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="small font-bold">Split Summary (Total: ${fmt(splitResult.grandTotal)}):</span>
        <span class="badge badge-success">Exact paise match</span>
      </div>
      <div class="bs-summary-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
        ${splitResult.shares.map(s => `
          <div class="card" style="padding:8px;background:var(--surface);border:1px solid var(--border)">
            <div class="font-bold small" style="margin-bottom:2px">${esc(s.name)}${s.personId === 'me' ? ' (You)' : ''}</div>
            <div class="big-num" style="font-size:18px">${fmt(s.total)}</div>
            <div class="small muted" style="font-size:11px">
              Items: ${fmt(s.itemSubtotal)}${s.tax > 0 ? ` + Tax ${fmt(s.tax)}` : ''}${s.serviceCharge > 0 ? ` + SC ${fmt(s.serviceCharge)}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Attach event handlers
  bsBindEvents(form, data, assignments);
}

function bsBindEvents(form, data, assignments) {
  const container = form.querySelector('#bs-container');

  // Title, date, cat changes
  container.querySelector('#bs-title').addEventListener('input', e => { data.title = e.target.value; });
  container.querySelector('#bs-date').addEventListener('change', e => { data.date = e.target.value; });
  container.querySelector('#bs-cat').addEventListener('change', e => { data.categoryId = e.target.value; });

  // Paid by toggle
  form.querySelectorAll('input[name="bs-paidBy"]').forEach(r => {
    r.addEventListener('change', e => {
      data.paidBy = e.target.value;
      const sel = container.querySelector('#bs-payer-select');
      sel.style.display = data.paidBy === 'other' ? 'inline-block' : 'none';
      if (data.paidBy === 'other') {
        data.payer = sel.value || (data.people.find(p => p.id !== 'me') || {}).name || '';
      }
    });
  });
  const payerSel = container.querySelector('#bs-payer-select');
  if (payerSel) payerSel.addEventListener('change', e => { data.payer = e.target.value; });

  // File upload / OCR
  const snapBtn = container.querySelector('#bs-snap-btn');
  const fileInp = container.querySelector('#bs-file-input');
  if (snapBtn && fileInp) {
    snapBtn.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', () => {
      if (fileInp.files[0]) bsProcessBillFile(form, fileInp.files[0], data, assignments);
    });
  }

  // Add person
  const addName = () => {
    const inp = container.querySelector('#bs-new-name');
    const val = inp.value.trim();
    if (!val) return;
    if (data.people.some(p => p.name.toLowerCase() === val.toLowerCase())) {
      toast(`${val} is already added.`);
      return;
    }
    const pid = 'p_' + (data.people.length + 1);
    data.people.push({ id: pid, name: val.slice(0, 40) });
    // Add to all existing items
    data.items.forEach(it => {
      assignments[it.id] = assignments[it.id] || [];
      assignments[it.id].push(pid);
    });
    bsRenderStage(form, data, assignments);
  };
  container.querySelector('#bs-add-name-btn').addEventListener('click', addName);
  container.querySelector('#bs-new-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } });

  // Quick contact add
  container.querySelectorAll('.bs-quick-contact').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.name;
      const pid = 'p_' + (data.people.length + 1);
      data.people.push({ id: pid, name: val });
      data.items.forEach(it => {
        assignments[it.id] = assignments[it.id] || [];
        assignments[it.id].push(pid);
      });
      bsRenderStage(form, data, assignments);
    });
  });

  // Remove person
  container.querySelectorAll('.bs-remove-person').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = btn.dataset.pid;
      data.people = data.people.filter(p => p.id !== pid);
      // Remove from assignments
      Object.keys(assignments).forEach(k => {
        assignments[k] = (assignments[k] || []).filter(p => p !== pid);
      });
      bsRenderStage(form, data, assignments);
    });
  });

  // Add item
  container.querySelector('#bs-add-item-btn').addEventListener('click', () => {
    const id = 'it_' + (data.items.length + 1) + '_' + uid().slice(0, 4);
    data.items.push({ id, name: `Item ${data.items.length + 1}`, price: 0, qty: 1 });
    assignments[id] = data.people.map(p => p.id);
    bsRenderStage(form, data, assignments);
  });

  // Edit item name / price
  container.querySelectorAll('.bs-item-name').forEach(inp => {
    inp.addEventListener('input', e => {
      const it = data.items.find(x => x.id === e.target.dataset.id);
      if (it) it.name = e.target.value;
    });
  });
  container.querySelectorAll('.bs-item-price').forEach(inp => {
    inp.addEventListener('input', e => {
      const it = data.items.find(x => x.id === e.target.dataset.id);
      if (it) {
        it.price = Number(e.target.value) || 0;
        bsRefreshSummary(form, data, assignments);
      }
    });
  });

  // Delete item
  container.querySelectorAll('.bs-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (data.items.length <= 1) { toast('A bill needs at least one item.'); return; }
      data.items = data.items.filter(x => x.id !== btn.dataset.id);
      delete assignments[btn.dataset.id];
      bsRenderStage(form, data, assignments);
    });
  });

  // Assign All
  container.querySelectorAll('.bs-assign-all').forEach(btn => {
    btn.addEventListener('click', () => {
      assignments[btn.dataset.id] = data.people.map(p => p.id);
      bsRenderStage(form, data, assignments);
    });
  });

  // Assign toggle
  container.querySelectorAll('.bs-assign-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.id;
      const pid = btn.dataset.pid;
      let list = assignments[itemId] || [];
      if (list.includes(pid)) {
        list = list.filter(p => p !== pid);
      } else {
        list.push(pid);
      }
      assignments[itemId] = list;
      bsRenderStage(form, data, assignments);
    });
  });

  // Tax and SC
  container.querySelector('#bs-tax').addEventListener('input', e => {
    data.tax = Number(e.target.value) || 0;
    bsRefreshSummary(form, data, assignments);
  });
  container.querySelector('#bs-sc').addEventListener('input', e => {
    data.serviceCharge = Number(e.target.value) || 0;
    bsRefreshSummary(form, data, assignments);
  });
}

function bsRefreshSummary(form, data, assignments) {
  const container = form.querySelector('#bs-container');
  const summaryBox = container.querySelector('.bs-summary-grid');
  if (!summaryBox) return;

  const splitResult = F.splitBillExact({
    items: data.items,
    tax: data.tax,
    serviceCharge: data.serviceCharge,
    people: data.people,
    assignments
  });

  summaryBox.innerHTML = splitResult.shares.map(s => `
    <div class="card" style="padding:8px;background:var(--surface);border:1px solid var(--border)">
      <div class="font-bold small" style="margin-bottom:2px">${esc(s.name)}${s.personId === 'me' ? ' (You)' : ''}</div>
      <div class="big-num" style="font-size:18px">${fmt(s.total)}</div>
      <div class="small muted" style="font-size:11px">
        Items: ${fmt(s.itemSubtotal)}${s.tax > 0 ? ` + Tax ${fmt(s.tax)}` : ''}${s.serviceCharge > 0 ? ` + SC ${fmt(s.serviceCharge)}` : ''}
      </div>
    </div>
  `).join('');
}

async function bsProcessBillFile(form, file, data, assignments) {
  const status = form.querySelector('#bs-ocr-status');
  if (status) status.innerHTML = `<div class="progress" style="margin-top:6px"><span id="bs-pbar" style="width:5%"></span></div><span class="small muted">Reading the bill on this device…</span>`;

  try {
    let parsed = null;

    // Read the photo on this device. (The AI service only ever got the file name, never the picture,
    // so asking it first just added a wait and could invent items.)
    {
      const lines = await ocrLines([file], p => {
        const bar = form.querySelector('#bs-pbar');
        if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      });
      parsed = F.parseBillItems(lines);
    }

    if (parsed && parsed.items && parsed.items.length) {
      data.items = parsed.items;
      data.tax = parsed.tax || 0;
      data.serviceCharge = parsed.serviceCharge || 0;
      if (parsed.merchant) data.title = parsed.merchant;
      if (parsed.date) data.date = parsed.date;

      // Assign all items to current people by default
      data.items.forEach(it => {
        assignments[it.id] = data.people.map(p => p.id);
      });
      toast(`Found ${plural(data.items.length, 'item')} on the bill.`);
    } else {
      toast('Couldn’t read that photo. You can type the items in.');
    }
  } catch (err) {
    console.warn('Bill processing error', err);
    toast('Couldn’t read that photo. You can type the items in.');
  }

  bsRenderStage(form, data, assignments);
}

function bsSaveSplit(form, data, assignments) {
  const title = (data.title || 'Group Bill').trim();
  const date = data.date || todayISO();

  const splitResult = F.splitBillExact({
    items: data.items,
    tax: data.tax,
    serviceCharge: data.serviceCharge,
    people: data.people,
    assignments
  });

  if (splitResult.grandTotal <= 0) {
    toast('Bill total must be greater than 0.');
    return false;
  }

  const myShareEntry = splitResult.shares.find(s => s.personId === 'me');
  const myShare = myShareEntry ? myShareEntry.total : 0;
  const others = splitResult.shares.filter(s => s.personId !== 'me');

  let iousCount = 0;

  if (data.paidBy === 'me') {
    // I paid: log my share as an expense, and add IOUs for others ("They owe me")
    if (myShare > 0 && data.categoryId) {
      addExpense({ categoryId: data.categoryId, amount: myShare, date, note: `My share: ${title}` });
    }
    others.forEach(oth => {
      if (oth.total > 0) {
        state.wallet.ious.push({
          id: uid(),
          person: oth.name.slice(0, 60),
          dir: 'owed',
          amount: oth.total,
          date,
          due: '',
          note: `Bill split: ${title}`,
          settled: false,
          settledAt: ''
        });
        iousCount++;
      }
    });
  } else {
    // Someone else paid (e.g. data.payer): I owe them my share
    const payerName = (data.payer || (others[0] && others[0].name) || 'Friend').trim();
    if (myShare > 0) {
      state.wallet.ious.push({
        id: uid(),
        person: payerName.slice(0, 60),
        dir: 'owe',
        amount: myShare,
        date,
        due: '',
        note: `My share: ${title}`,
        settled: false,
        settledAt: ''
      });
      iousCount++;
    }
    // Also record the expense for my share
    if (myShare > 0 && data.categoryId) {
      addExpense({ categoryId: data.categoryId, amount: myShare, date, note: `My share: ${title}` });
    }
  }

  awardXP(10, 'split-bill', true);
  commit();
  playSound('coin');
  toast(`Bill split saved! ${fmt(splitResult.grandTotal)} split across ${data.people.length} people with ${plural(iousCount, 'IOU')}.`, 4500);
  return true;
}

/* =========================================================
   2. UPI SETTLE-UP & RUNNING BALANCES
   ========================================================= */

/* ---------- UPI pay section (Settle up and group settle share it) ---------- */
/** name@bank, e.g. rahul@okaxis or 9876543210@ybl */
function isUpiId(v) { return /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(String(v || '').trim()); }

/** Android Chrome hands intent:// links to the UPI app picker; a bare upi:// link can do nothing there. */
function upiAppHref(upiUrl, pkg) {
  if (!/Android/i.test(navigator.userAgent || '')) return upiUrl;
  return 'intent://' + upiUrl.replace(/^upi:\/\//, '') + '#Intent;scheme=upi;' + (pkg ? `package=${pkg};` : '') + 'end';
}
const isIOSDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/**
 * One button per UPI app. iPhone has no "pick an app" screen for upi:// links,
 * so each app gets its own link (GPay tez://, PhonePe phonepe://, Paytm paytmmp://).
 * Android gets intent:// links aimed at each app, plus the system picker.
 */
const UPI_APPS = [
  { name: 'GPay', ios: 'tez://upi/pay?', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { name: 'PhonePe', ios: 'phonepe://pay?', pkg: 'com.phonepe.app' },
  { name: 'Paytm', ios: 'paytmmp://pay?', pkg: 'net.one97.paytm' }
];
function upiAppLinks(upiUrl) {
  const q = upiUrl.replace(/^upi:\/\/pay\?/, '');
  const ios = isIOSDevice(), android = /Android/i.test(navigator.userAgent || '');
  const apps = UPI_APPS.map(a => ({ name: a.name, href: ios ? a.ios + q : android ? upiAppHref(upiUrl, a.pkg) : upiUrl }));
  apps.push({ name: 'Other UPI app', href: upiUrl });   // plain upi:// lets Android list every UPI app; the intent:// picker came up blank on some phones
  return apps;
}

/**
 * The UPI part of a settle-up dialog.
 * You owe them: their UPI ID and one Pay button per UPI app.
 * They owe you: YOUR UPI ID to send them. (No QR: an app-made QR was not useful.)
 * @param {{dir:'owe'|'owed', person:string, amount:number, note:string}} o
 */
function upiSectionHTML(o) {
  const owed = o.dir === 'owed';
  const id = owed ? (state.settings.myUpiId || '') : (o.upi || ((state.wallet.upiIds || {})[o.person]) || '');
  const ok = isUpiId(id);
  const url = ok ? F.buildUpiUrl({ pa: id, pn: owed ? id.split('@')[0] : o.person, am: o.amount, cu: 'INR', tn: o.note }) : '';
  return `
    <div class="field" style="text-align:left;margin-bottom:12px">
      <label for="su-upi-input" class="small"><strong>${owed ? 'Your UPI ID' : `${esc(o.person)}'s UPI ID`}</strong></label>
      <div class="row" style="gap:6px;flex-wrap:nowrap">
        <input type="text" id="su-upi-input" class="input" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="name@okhdfcbank" value="${esc(id)}" style="min-width:0">
        <button type="button" class="btn btn-sm" id="su-save-upi">Save</button>
      </div>
      ${id && !ok ? `<p class="small tone-danger-text">That doesn’t look like a UPI ID. It should look like name@bank.</p>` : `<p class="small muted">${owed ? `So ${esc(o.person)} can pay you. Saved for next time.` : 'Saved for next time.'}</p>`}
    </div>
    ${ok ? `
      <div class="card mb" style="padding:14px;background:var(--surface);display:flex;flex-direction:column;align-items:center;gap:10px">
        ${owed ? '' : `<p class="small" style="margin:4px 0 0"><strong>Pay ${fmtExact(o.amount)} with</strong></p>
        <div class="upi-apps">${upiAppLinks(url).map((a, i) => `<a href="${esc(a.href)}" ${i === 0 ? 'id="su-pay" ' : ''}class="btn ${i === 0 ? 'btn-primary' : ''} su-pay-app" style="text-decoration:none">${esc(a.name)}</a>`).join('')}</div>
        <p class="small muted" id="su-pay-hint">Nothing opens? That app isn’t installed. Try another, or copy the UPI ID.</p>`}
        ${owed ? `<p class="small muted">Send ${esc(o.person)} your UPI ID so they can pay you.</p>` : ''}
        <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
          <button type="button" class="btn" id="su-copy-upi" data-upi="${esc(id)}">Copy UPI ID</button>
        </div>

      </div>` : `
      <div class="alert alert-info small" style="margin-bottom:12px">${owed ? 'Add your UPI ID so they know where to pay you.' : `Add ${esc(o.person)}’s UPI ID to pay them in one tap.`}</div>`}`;
}

/** Wire up the UPI section. rerender() redraws the dialog after the UPI ID is saved. */
function bindUpiSection(root, o, rerender) {
  const inp = root.querySelector('#su-upi-input');
  const save = () => {
    const val = inp.value.trim();
    if (o.dir === 'owed') { state.settings.myUpiId = val.slice(0, 60); if (isUpiId(val) && typeof GroupSync !== 'undefined') GroupSync.shareMyUpi(val); }
    else { state.wallet.upiIds = state.wallet.upiIds || {}; state.wallet.upiIds[o.person] = val; }
    commit();
    if (isUpiId(val)) toast('UPI ID saved');
    rerender();
  };
  root.querySelector('#su-save-upi').addEventListener('click', save);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const copy = root.querySelector('#su-copy-upi');
  if (copy) copy.addEventListener('click', () => copyText(copy.dataset.upi, 'UPI ID copied'));
  root.querySelectorAll('.su-pay-app').forEach(pay => pay.addEventListener('click', () => {
    // if no UPI app takes over within 2.5 s, say what to do instead of leaving a dead button
    let left = false;
    const gone = () => { left = true; };
    document.addEventListener('visibilitychange', gone, { once: true });
    window.addEventListener('blur', gone, { once: true });
    setTimeout(() => {
      document.removeEventListener('visibilitychange', gone);
      window.removeEventListener('blur', gone);
      if (!left && document.visibilityState === 'visible') {
        toast('That app didn’t open. Try another one, or copy the UPI ID.', 5000);
        const hint = root.querySelector('#su-pay-hint');
        if (hint) hint.classList.remove('muted');
      }
    }, 2500);
  }));
}

/** Clipboard with a fallback for browsers that block navigator.clipboard. */
function copyText(text, msg) {
  const done = () => toast(msg || 'Copied');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => legacyCopy(text) && done());
  } else if (legacyCopy(text)) done();
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (!ok) toast('Couldn’t copy. Long-press the text to copy it.');
  return ok;
}

/**
 * Open UPI settle-up dialog for a person with QR code and deep links.
 * @param {string} personName
 */
function settleUpModal(personName) {
  const pList = personBalances();
  const info = pList.find(p => p.person.toLowerCase() === personName.toLowerCase()) || {
    person: personName,
    net: 0,
    dir: 'owed',
    absNet: 0,
    ious: []
  };

  const amount = info.absNet > 0 ? Math.round(info.absNet * 100) / 100 : 100;
  let paidNow = amount;   // how much is being paid this time (can be a part payment)
  const opts = { dir: info.dir, person: info.person, amount, note: `Settle up with ${info.person}` };

  const buildModalContent = () => {
    const myUpi = state.settings.myUpiId || '';
    const shareMsg = info.dir === 'owed'
      ? `Hey ${info.person}, please send ₹${paidNow}${paidNow < amount ? ` of the ₹${amount}` : ''} for our shared expenses.${isUpiId(myUpi) ? ` My UPI: ${myUpi}` : ''}`
      : `Hey ${info.person}, sending ₹${paidNow}${paidNow < amount ? ` of the ₹${amount} I owe you` : ''} now.`;

    return `
      <div class="stack" id="su-wrap" style="text-align:center">
        <div class="card stat stat-big ${info.dir === 'owed' ? 'tone-success' : 'tone-danger'}" style="margin-bottom:12px">
          <p class="stat-label">${info.dir === 'owed' ? `${esc(info.person)} owes you` : `You owe ${esc(info.person)}`}</p>
          <p class="stat-value">${fmtExact(amount)}</p>
          <p class="stat-sub">${plural(info.ious.length, 'open IOU')}</p>
        </div>

        <div class="card mb su-paid" style="padding:14px;text-align:left">
          <div class="form-grid two" style="align-items:end">
            <div class="field" style="margin:0"><label for="su-paid">${info.dir === 'owed' ? `How much did ${esc(info.person)} pay?` : 'How much are you paying?'}</label>
              <div class="affix"><span class="affix-sym" aria-hidden="true">${esc(CURRENCIES[state.currency].symbol)}</span><input id="su-paid" class="input" inputmode="decimal" value="${numStr(paidNow)}" aria-describedby="su-left"></div></div>
            <div class="su-left-box"><p class="stat-label" style="margin:0">${info.dir === 'owed' ? 'They still need to pay' : 'You still need to pay'}</p><p class="su-left" id="su-left" aria-live="polite">${fmtExact(Math.max(0, amount - paidNow))}</p></div>
          </div>
          <p class="field-error" id="su-paid-err"></p>
        </div>

        <div id="su-upi-wrap">${upiSectionHTML(Object.assign({}, opts, { amount: paidNow }))}</div>

        <!-- Copyable Message / WhatsApp share -->
        <div class="card mb" style="padding:10px;text-align:left;background:var(--surface-2)">
          <p class="small font-bold" style="margin-bottom:4px">Message for ${esc(info.person)}:</p>
          <p class="small" id="su-msg-text" style="background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);margin-bottom:8px">${esc(shareMsg)}</p>
          <button type="button" class="btn btn-sm" id="su-copy-msg" data-msg="${esc(shareMsg)}">📋 Copy message</button>
        </div>

        <!-- Manual Settle Confirmation -->
        <div style="border-top:1px solid var(--border);padding-top:12px">
          <button type="button" class="btn btn-primary" id="su-mark-settled" style="width:100%">${paidNow >= amount - 0.005 ? '✓ Mark all as settled' : `✓ Record ${fmtExact(paidNow)} paid`}</button>
        </div>
      </div>
    `;
  };

  openModal({
    title: `Settle up with ${esc(info.person)}`,
    hideSubmit: true,
    cancelLabel: 'Close',
    body: buildModalContent(),
    onMount: form => {
      const bind = () => {
        const body = form.querySelector('.modal-body');
        const upiWrap = body.querySelector('#su-upi-wrap');
        const bindUpi = () => bindUpiSection(upiWrap, Object.assign({}, opts, { amount: paidNow }), () => { body.innerHTML = buildModalContent(); bind(); });
        bindUpi();
        const paidInp = body.querySelector('#su-paid'), err = body.querySelector('#su-paid-err');
        const readPaid = () => {
          const r = validateValue('money', paidInp.value, { required: true, positive: true });
          let msg = r.error || '';
          if (!msg && r.value > amount + 0.005) msg = `That’s more than the ${fmtExact(amount)} owed.`;
          err.textContent = msg; paidInp.toggleAttribute('aria-invalid', !!msg);
          return msg ? null : Math.round(r.value * 100) / 100;
        };
        paidInp.addEventListener('input', () => {
          const v = readPaid(); if (v === null) return;
          body.querySelector('#su-left').textContent = fmtExact(Math.max(0, amount - v));
        });
        paidInp.addEventListener('change', () => {
          const v = readPaid(); if (v === null || v === paidNow) return;
          paidNow = v; body.innerHTML = buildModalContent(); bind();
        });

        const copyMsgBtn = form.querySelector('#su-copy-msg');
        if (copyMsgBtn) copyMsgBtn.addEventListener('click', () => copyText(copyMsgBtn.dataset.msg, 'Message copied'));

        const settleBtn = form.querySelector('#su-mark-settled');
        if (settleBtn) {
          settleBtn.addEventListener('click', () => {
            const v = readPaid(); if (v === null) { paidInp.focus(); return; }
            const today = todayISO(), left = Math.round((amount - v) * 100) / 100;
            if (left <= 0.005) {
              info.ious.forEach(x => { x.settled = true; x.settledAt = today; });
              commit(); playSound('coin'); closeModal();
              toast(`All settled with ${info.person}`);
              return;
            }
            const sameDir = info.ious.every(x => x.dir === info.dir);
            if (sameDir) {
              // Pay off the oldest IOUs first; the next one is reduced by what's left of the payment
              let pay = v;
              info.ious.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(x => {
                if (pay <= 0.005) return;
                if (pay >= x.amount - 0.005) { pay -= x.amount; x.settled = true; x.settledAt = today; }
                else { x.amount = Math.round((x.amount - pay) * 100) / 100; pay = 0; }
              });
            } else {
              // Mixed IOUs both ways: close them and keep one IOU for what's still owed
              info.ious.forEach(x => { x.settled = true; x.settledAt = today; });
              state.wallet.ious.push({ id: uid(), person: info.person, dir: info.dir, amount: left, date: today, due: '', note: 'Left after a part payment', settled: false, settledAt: '' });
            }
            commit(); closeModal();
            toast(`${fmtExact(v)} paid. ${info.dir === 'owed' ? `${info.person} still owes you` : 'You still owe'} ${fmtExact(left)}`, 4000);
          });
        }
      };

      bind();
    }
  });
}

/* =========================================================
   3. PARENT TOP-UP REQUEST
   ========================================================= */

/**
 * Open the Parent Top-Up dialog with category breakdown and tone picker.
 */
function openTopUpModal() {
  const sts = studentSafeToSpend();
  const next = nextPayInfo();
  const nextDateStr = next && next.date ? fmtDate(next.date) : '';
  const days = sts.daysLeft || 1;
  const inc = monthlyIncome();

  // Estimate needed top-up to cover shortfall + minimum daily safety buffer (e.g. ₹200/day)
  const neededAmount = Math.max(500, Math.round(Math.max(0, -sts.available) + (days * 150)));

  // Top spending categories this month
  const dailyAvgs = categoryDailyAverages(30);
  const topCategories = state.budget.categories
    .map(c => ({ name: c.name, spent: (dailyAvgs[c.name] || 0) * 30 }))
    .sort((a, b) => b.spent - a.spent)
    .filter(c => c.spent > 0)
    .slice(0, 3);

  // Suggested category to cut
  const cutCategory = topCategories.find(c => /food|delivery|fun|outings|chai/i.test(c.name))?.name || 'outings';

  let currentTone = 'casual';

  const renderBody = (tone, amount) => {
    const draft = F.generateTopUpDraft({
      neededAmount: amount,
      daysLeft: days,
      nextDate: nextDateStr,
      topCategories,
      cutCategory,
      tone
    });

    return `
      <div class="stack" id="tu-wrap">
        <div class="alert alert-warn small mb">
          Your safe-to-spend is currently in the <strong>red</strong>. YOKO! helps you draft an honest, transparent breakdown to share with your parents.
        </div>

        <div class="form-grid two mb">
          <div class="field">
            <label for="tu-amount">Amount needed</label>
            <div class="affix">
              <span class="affix-sym">${esc(CURRENCIES[state.currency].symbol)}</span>
              <input type="number" id="tu-amount" class="input" value="${amount}" step="100">
            </div>
          </div>
          <div class="field">
            <label for="tu-tone">Message tone</label>
            <select id="tu-tone" class="select">
              <option value="casual" ${tone === 'casual' ? 'selected' : ''}>Casual & friendly</option>
              <option value="formal" ${tone === 'formal' ? 'selected' : ''}>Formal & polite</option>
            </select>
          </div>
        </div>

        <div class="field mb">
          <label for="tu-message">Draft message (you can edit before sending):</label>
          <textarea id="tu-message" class="input" rows="8" style="font-size:14px;line-height:1.5;resize:vertical">${esc(draft)}</textarea>
        </div>

        <div class="row" style="gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn" id="tu-copy-btn">📋 Copy text</button>
          <button type="button" class="btn btn-primary" id="tu-share-btn">📲 Share message</button>
        </div>
      </div>
    `;
  };

  openModal({
    title: 'Ask for a top-up',
    hideSubmit: true,
    cancelLabel: 'Cancel',
    wide: true,
    body: renderBody(currentTone, neededAmount),
    onMount: form => {
      let activeAmt = neededAmount;
      const bind = () => {
        const toneSel = form.querySelector('#tu-tone');
        const amtInp = form.querySelector('#tu-amount');
        const txtArea = form.querySelector('#tu-message');
        const copyBtn = form.querySelector('#tu-copy-btn');
        const shareBtn = form.querySelector('#tu-share-btn');

        toneSel.addEventListener('change', () => {
          currentTone = toneSel.value;
          txtArea.value = F.generateTopUpDraft({
            neededAmount: activeAmt,
            daysLeft: days,
            nextDate: nextDateStr,
            topCategories,
            cutCategory,
            tone: currentTone
          });
        });

        amtInp.addEventListener('input', () => {
          activeAmt = Number(amtInp.value) || 0;
          txtArea.value = F.generateTopUpDraft({
            neededAmount: activeAmt,
            daysLeft: days,
            nextDate: nextDateStr,
            topCategories,
            cutCategory,
            tone: currentTone
          });
        });

        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(txtArea.value).then(() => toast('Message copied to clipboard!'));
        });

        shareBtn.addEventListener('click', async () => {
          const text = txtArea.value;
          if (navigator.share) {
            try {
              await navigator.share({ title: 'Hostel budget top-up request', text });
            } catch (err) {
              if (err.name !== 'AbortError') {
                navigator.clipboard.writeText(text).then(() => toast('Message copied to clipboard!'));
              }
            }
          } else {
            navigator.clipboard.writeText(text).then(() => toast('Share not supported on this browser. Message copied!'));
          }
        });
      };

      bind();
    }
  });
}
