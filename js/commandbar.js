/* YOKO! Student · AI Command Bar & Budget Autopilot.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* =========================================================
   RULE-BASED FALLBACK PARSER
   Used when AI is offline or unreachable.
   ========================================================= */
function parseCommandBarFallback(text) {
  const q = text.toLowerCase().replace(/[₹$€£]|\brs\.?\s*|\binr\s*/g, '').replace(/(\d),(\d)/g, '$1$2').trim();
  const orig = String(text || '');
  const nameFrom = re => { const m = orig.match(re); return m ? m[1] : ''; };   // keep the person's name as typed
  
  // a. Add ("spent 120 on chai, split it with Rahul" / "paid 300 for pizza with Aarav")
  if (/^(?:i\s+)?(?:spent|paid|bought|add|log)\b/.test(q) || (/\bsplit\b/.test(q) && /\d/.test(q) && !/afford/.test(q))) {
    const amtMatch = q.match(/(\d+(?:\.\d+)?)/);
    if (amtMatch) {
      const what = (q.match(/\b(?:on|for)\s+(?:a\s+|an\s+|the\s+|some\s+)?([a-z][a-z &'-]*?)(?=\s*(?:,|\bwith\b|\bsplit\b|\btoday\b|\byesterday\b|[.!?]|$))/) || [])[1]
        || q.replace(/\b(?:i|spent|paid|bought|add|log|on|for|with|split|it|and|today)\b|[0-9.]+|[,.!?]/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        intent: 'add',
        amount: Number(amtMatch[1]),
        note: (what || 'Expense').trim(),
        withPerson: nameFrom(/\bwith\s+([A-Za-z][A-Za-z]*)/i),
        split: /\bsplit\b/.test(q)
      };
    }
  }

  // e. Budget ("set a 2000 limit for outings")
  const budMatch = q.match(/(?:set|make)(?:\s+a)?\s+(\d+(?:\.\d+)?)\s+(?:limit|budget)\s+for\s+([a-z ]+)/i);
  if (budMatch) {
    return { intent: 'budget', amount: Number(budMatch[1]), categoryName: budMatch[2].trim() };
  }

  // c. Afford ("can I afford a 1500 concert on Saturday?")
  const affordMatch = q.match(/afford\s+(?:a\s+|an\s+)?(\d+(?:\.\d+)?)\s+([a-z ]+?)\s+(?:on|this|next)\s+([a-z]+)/i);
  if (!affordMatch && /afford/.test(q) && /\d/.test(q)) {   // "can I afford 1500 for a concert?"
    const amt = Number(q.match(/(\d+(?:\.\d+)?)/)[1]);
    const item = (q.match(/(?:\d+(?:\.\d+)?)\s+(?:for\s+)?(?:a\s+|an\s+|the\s+)?([a-z][a-z ]*?)(?=\s*(?:\?|$|\btoday\b|\btomorrow\b))/) || [])[1] || 'it';
    return { intent: 'afford', amount: amt, item: item.trim(), dayOffset: /tomorrow/.test(q) ? 1 : 0 };
  }
  if (affordMatch) {
    // very basic day offset guess for fallback
    const daysMap = { 'monday':1, 'tuesday':2, 'wednesday':3, 'thursday':4, 'friday':5, 'saturday':6, 'sunday':7, 'tomorrow':1, 'today':0 };
    const dayWord = affordMatch[3].toLowerCase();
    let offset = 0;
    if (dayWord === 'tomorrow') offset = 1;
    else if (daysMap[dayWord]) {
      const todayIdx = new Date().getDay() || 7;
      let targetIdx = daysMap[dayWord];
      offset = targetIdx - todayIdx;
      if (offset <= 0) offset += 7;
    }
    return { intent: 'afford', amount: Number(affordMatch[1]), item: affordMatch[2].trim(), dayOffset: offset };
  }

  // b. Ask ("how much on food this week?")
  if (q.startsWith('how much') || /^what did i spend/.test(q)) {
    const catMatch = q.match(/\bon\s+([a-z]+)/i);
    return { intent: 'ask', categoryName: catMatch ? catMatch[1] : null, period: askPeriod(q) };
  }

  // d. What-if ("what if I stop ordering on weekends?")
  if (q.startsWith('what if')) {
    // fallback tries to find category and an amount to reduce
    const cat = q.match(/ordering|food|eat|outings|chai/i);
    return { intent: 'whatif', categoryName: cat ? cat[0] : 'Food', reductionAmount: 100 }; // purely naive fallback assumption
  }

  return { intent: 'unknown' };
}

/** "today", "this month" or (default) "this week", from the words in a question. */
function askPeriod(text) {
  const t = String(text || '').toLowerCase();
  return /\btoday\b/.test(t) ? 'today' : /\bmonth\b/.test(t) ? 'this month' : 'this week';
}
/** Only trust an AI answer that has what the next step needs; anything else goes to the on-device parser. */
function validAiCommand(r) {
  if (r && typeof r === 'object' && r.intent === 'chat') return typeof r.reply === 'string' && !!r.reply.trim();
  if (!r || typeof r !== 'object' || !['add', 'ask', 'afford', 'whatif', 'budget'].includes(r.intent)) return false;
  const amt = Number(r.amount);
  if (['add', 'afford', 'budget'].includes(r.intent) && !(Number.isFinite(amt) && amt > 0)) return false;
  if (r.intent === 'add' && !(typeof r.note === 'string' && r.note.trim())) return false;
  if (r.intent === 'budget' && !(typeof r.categoryName === 'string' && r.categoryName.trim())) return false;
  r.amount = Number.isFinite(amt) ? amt : r.amount;
  return true;
}

/** The student's real numbers, so AI answers are about their money. Rounded; no names, notes or UPI IDs. */
function aiContext() {
  try {
    const al = allowanceLeft(), sts = studentSafeToSpend(), r = Math.round;
    const spent = spentByCategory(al.start, todayISO());
    const next = nextPayInfo();
    return {
      currency: state.currency || 'INR',
      safeToSpendToday: Math.round((sts.leftToday || 0) * 100) / 100,
      leftUntilAllowance: r(Math.max(0, al.balance)),
      daysToAllowance: al.daysLeft,
      nextAllowanceDate: next ? F.toISO(next.date) : null,
      monthlyIncome: r(al.income || 0),
      spentSincePayday: r(al.spent || 0),
      categories: state.budget.categories.slice(0, 20).map(c => ({ name: c.name, type: c.type, planned: r(c.planned || 0), spentSincePayday: r(spent[c.id] || 0) })),
      openIous: state.wallet.ious.filter(x => !x.settled).length,
      goals: (state.goals || []).slice(0, 5).map(g => ({ name: g.name, target: r(g.target || 0), saved: r(g.saved || 0) }))
    };
  } catch (e) {
    return {};
  }
}

/* =========================================================
   COMMAND BAR LOGIC
   ========================================================= */
let isRecording = false;

function commandBarHTML() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = SpeechRecognition ? `<button type="button" class="btn icon-btn" id="cb-mic" aria-label="Use voice" title="Use voice">🎤</button>` : '';
  
  return `<div class="card mb cb-card" id="command-bar">
    <div class="cb-input-row">
      <input type="text" id="cb-input" class="input cb-input" placeholder="Ask AI: 'can I afford a 1500 concert on Saturday?' or 'spent 120 on chai'">
      ${micBtn}
      <button type="button" class="btn btn-primary" id="cb-send">Send</button>
    </div>
    <div id="cb-result" class="cb-result" hidden></div>
  </div>`;
}

function bindCommandBar() {
  const bar = document.getElementById('command-bar');
  if (!bar) return;

  const inp = bar.querySelector('#cb-input');
  const btn = bar.querySelector('#cb-send');
  const mic = bar.querySelector('#cb-mic');
  const res = bar.querySelector('#cb-result');

  const executeCommand = async (rawText) => {
    if (!rawText.trim()) return;
    const text = F.normalizeAmounts(rawText);   // "2 lakh" → 200000, "fifty k" → 50000
    inp.disabled = true;
    btn.disabled = true;
    res.hidden = false;
    res.innerHTML = `<div class="cb-loading"><span class="status-dot"></span> Thinking...</div>`;

    // 1. Ask AI. Spends, "can I afford" and "how much" also work on the device, so for those we only wait a few seconds.
    const local = parseCommandBarFallback(text);
    let parsed = null, aiDown = false;
    if (typeof aiCall === 'function') {
      const quick = local.intent !== 'unknown';
      const slow = setTimeout(() => { if (res.querySelector('.cb-loading')) res.innerHTML = '<div class="cb-loading"><span class="status-dot"></span> Still thinking…</div>'; }, 4000);
      const aiRes = await aiCall('command', { text: text.slice(0, 500), context: aiContext(), today: new Date().toDateString() }, quick ? 6000 : 16000);
      clearTimeout(slow);
      if (validAiCommand(aiRes)) parsed = aiRes;
      else aiDown = true;
    }

    if (!parsed || !parsed.intent) parsed = local;
    if (parsed.intent === 'unknown' && aiDown) parsed = { intent: 'down' };

    // 2. Do Math & Render Reply
    renderCommandResult(parsed, text, res);

    inp.disabled = false;
    btn.disabled = false;
    inp.value = '';
    inp.focus();
  };

  btn.addEventListener('click', () => executeCommand(inp.value));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); executeCommand(inp.value); }
  });

  // Voice Input Setup
  if (mic) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    // Attempting to support multiple languages natively by asking the user to speak clearly.
    // SpeechRecognition usually takes a single lang property. We default to en-IN.
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      isRecording = true;
      mic.classList.add('recording');
      mic.innerHTML = '🛑';
      inp.placeholder = 'Listening...';
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      inp.value = transcript;
      executeCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error', event.error);
      isRecording = false;
      mic.classList.remove('recording');
      mic.innerHTML = '🎤';
      inp.placeholder = "Ask AI: 'can I afford a 1500 concert on Saturday?'";
      toast(event.error === 'no-speech' ? 'Didn’t catch that. Tap the mic and try again.'
        : event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'YOKO! can’t use the mic. Allow it in your browser, or just type.'
        : 'Voice isn’t working right now. You can type it instead.', 4000);
    };

    recognition.onend = () => {
      isRecording = false;
      mic.classList.remove('recording');
      mic.innerHTML = '🎤';
      inp.placeholder = "Ask AI: 'can I afford a 1500 concert on Saturday?'";
    };

    mic.addEventListener('click', () => {
      try {
        if (isRecording) recognition.stop();
        else recognition.start();
      } catch (e) {   // start() throws if a previous session is still closing
        console.warn('Speech start failed', e);
        try { recognition.abort(); } catch (x) { /* ignore */ }
      }
    });
  }
}

/* =========================================================
   COMMAND EXECUTION & CONFIRMATIONS
   ========================================================= */
function renderCommandResult(parsed, originalText, container) {
  let html = '';
  
  if (parsed.intent === 'add') {
    if (!state.budget.categories.length) { container.innerHTML = '<p>Set up your budget first, then I can log expenses for you.</p>'; return; }
    const cat = guessCategory(parsed.note) || state.budget.categories[0];
    const catName = cat ? state.budget.categories.find(c => c.id === cat.id).name : 'Budget';
    const hrs = fmtHours(parsed.amount);
    const freeze = typeof getActiveCategoryFreeze === 'function' && cat ? getActiveCategoryFreeze(cat.id) : null;
    html = `<div class="cb-card-confirm">
      <p>I’ll log <strong>${fmt(parsed.amount)}</strong>${hrs ? ` <span class="small muted">(= ${hrs})</span>` : ''} for <strong>${esc(parsed.note)}</strong> in ${esc(catName)}.</p>
      ${freeze ? `<p class="alert alert-warn" style="margin-top:6px">❄️ <strong>${esc(catName)}</strong> is frozen (${plural(freeze.daysLeft, 'day')} left). Logging will break your challenge.</p>` : ''}
      ${parsed.split && parsed.withPerson ? `<p class="small muted">And I’ll split it with ${esc(parsed.withPerson)} (they owe you ${fmt(parsed.amount/2)}).</p>` : ''}
      <button type="button" class="btn btn-primary btn-sm mt" id="cb-confirm-btn">Confirm and Save</button>
    </div>`;
    container.innerHTML = html;
    container.querySelector('#cb-confirm-btn').addEventListener('click', () => {
      undoable(`Added ${fmt(parsed.amount)} for ${parsed.note}`, () => {
        addExpense({ categoryId: cat.id, amount: parsed.amount, date: todayISO(), note: parsed.note });
        if (parsed.split && parsed.withPerson) {
          const typed = String(parsed.withPerson).trim().slice(0, 60);
          const known = state.wallet.ious.find(x => x.person.toLowerCase() === typed.toLowerCase());
          const person = known ? known.person : typed.charAt(0).toUpperCase() + typed.slice(1);
          state.wallet.ious.push({ id: uid(), person, dir: 'owed', amount: Math.round(parsed.amount / 2 * 100) / 100, date: todayISO(), due: '', note: parsed.note, settled: false, settledAt: '' });
        }
        if (freeze && typeof triggerPetReaction === 'function') triggerPetReaction('freeze-broken');
        commit();
      });
      container.innerHTML = `<p class="success-text">✓ Saved.</p>`;
      setTimeout(() => container.hidden = true, 3000);
    });

  } else if (parsed.intent === 'budget') {
    let cat = state.budget.categories.find(c => c.name.toLowerCase().includes((parsed.categoryName || '').toLowerCase()));
    if (!cat && parsed.categoryName) {
      cat = { id: uid(), name: parsed.categoryName.charAt(0).toUpperCase() + parsed.categoryName.slice(1), type: 'wants', planned: 0, actual: 0 };
    }
    
    html = `<div class="cb-card-confirm">
      <p>I'll set the budget for <strong>${esc(cat ? cat.name : parsed.categoryName)}</strong> to <strong>${fmt(parsed.amount)}</strong>.</p>
      <button type="button" class="btn btn-primary btn-sm mt" id="cb-confirm-btn">Confirm</button>
    </div>`;
    container.innerHTML = html;
    container.querySelector('#cb-confirm-btn').addEventListener('click', () => {
      undoable(`Budget updated`, () => {
        if (!state.budget.categories.find(c => c.id === cat.id)) {
          state.budget.categories.push(cat);
        }
        cat.planned = parsed.amount;
        commit();
      });
      container.innerHTML = `<p class="success-text">✓ Budget updated.</p>`;
      setTimeout(() => container.hidden = true, 3000);
    });

  } else if (parsed.intent === 'ask') {
    const t = todayDate();
    const period = parsed.period && /today|month|week/.test(parsed.period) ? parsed.period : askPeriod(originalText);
    const from = period === 'today' ? todayISO() : period === 'this month' ? todayISO().slice(0, 7) + '-01'
      : F.toISO(F.addDays(t, -((t.getDay() + 6) % 7)));   // weeks start on Monday
    const want = (parsed.categoryName || '').toLowerCase().trim();
    let cat = want ? state.budget.categories.find(c => c.name.toLowerCase().includes(want)) : null;
    if (want && !cat) { const g = guessCategory(want); if (g && g.source !== 'guess') cat = state.budget.categories.find(c => c.id === g.id); }
    const exps = state.budget.expenses.filter(e => e.date >= from && e.date <= todayISO() && (!cat || e.categoryId === cat.id));
    const total = sum(exps, e => e.amount);
    
    container.innerHTML = `<p>You’ve spent <strong>${fmt(total)}</strong> on ${esc(cat ? cat.name : 'everything')} ${period}${exps.length ? ` (${plural(exps.length, 'expense')})` : ''}.</p>`;
    
  } else if (parsed.intent === 'afford') {
    const sts = studentSafeToSpend();
    const al = allowanceLeft();
    const next = al.byPayday || nextPayInfo() ? al : null;
    const daysLeft = al.daysLeft;
    
    // Find top flexible category
    const dailyAvgs = categoryDailyAverages(30);
    let topName = '', topCost = 0;
    for (const c of state.budget.categories) {
      if (c.type === 'wants' && dailyAvgs[c.name] > topCost) { topCost = dailyAvgs[c.name]; topName = c.name; }
    }

    const offset = Math.max(0, Math.round(Number(parsed.dayOffset) || 0));
    const afterPay = !!next && offset >= daysLeft;   // the allowance arrives before the event
    const aff = F.affordCheck({
      balance: afterPay ? sts.available + monthlyIncome() : sts.available,
      daysLeft: afterPay ? daysLeft + 30 : daysLeft,
      amount: parsed.amount,
      eventDayOffset: offset,
      dailySpend: sts.baselineDaily,
      monthlyAllowance: monthlyIncome(),
      topCategory: topName ? { name: topName, dailyCost: topCost } : null
    });

    if (aff.verdict === 'no' && typeof triggerPetReaction === 'function') {
      triggerPetReaction('afford-no', `Concert/purchase of ${fmt(parsed.amount)} is over budget.`);
    }

    const hrs = fmtHours(parsed.amount);
    html = `<div class="cb-card-confirm">
      ${aff.verdict === 'yes' ? `<p class="tone-success-text" style="font-weight:bold">Yes, you can afford it.</p>` : 
        aff.verdict === 'tight' ? `<p class="tone-warn-text" style="font-weight:bold">It's tight.</p>` : 
        `<p class="tone-danger-text" style="font-weight:bold">No, you can't afford it right now.</p>`}
      <p class="small">${afterPay ? `That’s after your next allowance (${daysLabel(daysLeft).toLowerCase()}). ` : ''}${fmt(parsed.amount)}${hrs ? ` (= <strong>${hrs}</strong>)` : ''} would leave you <strong>${fmt(aff.perDayAfter)} a day</strong> for the ${plural(aff.daysAfter, 'day')} after it.</p>
      ${aff.fix ? `<p class="mt" style="font-style:italic">💡 ${esc(aff.fix)}.</p>` : ''}
    </div>`;
    container.innerHTML = html;

  } else if (parsed.intent === 'whatif') {
    const al = allowanceLeft();
    const daysLeft = al.daysLeft;
    const dailyAvgs = categoryDailyAverages(30);
    const currentBal = Math.max(0, al.balance);
    
    let adj = {};
    if (parsed.categoryName && parsed.reductionAmount) {
      adj[parsed.categoryName] = -parsed.reductionAmount;
    } else {
      // Default fallback math
      adj['Food'] = -100;
    }

    const wi = F.whatIfForecast({
      currentBalance: currentBal,
      daysLeft,
      dailySpendByCategory: dailyAvgs,
      categoryChanges: adj,
      startDate: todayISO()
    });

    html = `<div class="cb-card-confirm">
      <p>If you made that change, you'd save <strong>${fmt(wi.savedPerDay)}/day</strong> (${fmt(wi.savedTotal)} total).</p>
      <p class="small">Your money would ${wi.willMakeIt ? 'last until your next allowance' : `run out on ${fmtDate(F.parseDate(wi.runOutDay))} (${wi.daysGained > 0 ? wi.daysGained + ' days later than before' : 'same as before'})`}.</p>
    </div>`;
    container.innerHTML = html;
  } else if (parsed.intent === 'chat') {
    container.innerHTML = `<p class="cb-reply">${esc(parsed.reply)}</p>`;
  } else if (parsed.intent === 'down') {
    container.innerHTML = `<p>The AI isn’t answering right now. Try again in a minute.</p>
      <p class="small muted">I can still log spends and answer “can I afford” and “how much” questions without it.</p>`;
  } else {
    container.innerHTML = `<p>I didn't quite catch that. Try saying something like <em>"spent 200 on chai"</em>.</p>`;
  }
  // the AI's own words, under answers where the app already did the math
  if (parsed.intent === 'afford' && typeof parsed.reply === 'string' && parsed.reply.trim()) {
    container.insertAdjacentHTML('beforeend', `<p class="small muted mt cb-reply">${esc(parsed.reply)}</p>`);
  }
}

/* =========================================================
   BUDGET AUTOPILOT
   ========================================================= */
/** What each category cost in a typical recent month: the average of up to 3 finished months that have expenses.
 *  Whole months, so a monthly fee like the mess bill counts once (a 60-day window can catch it twice). */
function autopilotMonthlySpend() {
  const t = todayDate(), exps = state.budget.expenses || [];
  const months = [1, 2, 3].map(k => F.toISO(new Date(t.getFullYear(), t.getMonth() - k, 1)).slice(0, 7))
    .filter(m => exps.some(x => (x.date || '').slice(0, 7) === m));
  if (!months.length) {   // no finished month yet: fall back to the daily pace so far
    const avg = categoryDailyAverages(60), out = {};
    state.budget.categories.forEach(c => { out[c.id] = (avg[c.name] || 0) * 30; });
    return { byCat: out, reason: 'From your spending so far.' };
  }
  const byCat = {};
  state.budget.categories.forEach(c => {
    byCat[c.id] = sum(exps.filter(x => x.categoryId === c.id && months.includes((x.date || '').slice(0, 7))), x => x.amount) / months.length;
  });
  return { byCat, reason: months.length === 1 ? 'What you spent last month.' : `Your average over the last ${months.length} months.` };
}
function budgetAutopilotModal() {
  if (!state.budget.categories.length) { toast('Add a budget category first.'); return; }
  const inc = monthlyIncome();
  const hist = autopilotMonthlySpend();
  let totalProposed = 0;
  
  const proposals = state.budget.categories.map(c => {
    let prop = hist.byCat[c.id] || 0;
    let reason = hist.reason;
    if (prop === 0) {
      if (c.type === 'savings') { prop = c.planned > 0 ? c.planned : inc * 0.10; reason = c.planned > 0 ? 'Kept your savings target.' : 'Rule of thumb: save 10%.'; }
      else if (c.planned > 0) { prop = c.planned; reason = 'No spending here yet, so your plan stays.'; }
      else { prop = 500; reason = 'A small amount to start with.'; }
    } else if (c.type === 'savings' && c.planned > prop) {   // never talk someone out of saving
      prop = c.planned; reason = 'Kept your savings target.';
    } else if (c.type === 'wants' && inc > 0 && (totalProposed + prop) > inc) {
      prop = prop * 0.8;
      reason = 'Trimmed by 20% to fit your allowance.';
    }
    
    prop = Math.ceil(prop / 50) * 50; // round up to the next 50, so a typical month fits under the budget
    totalProposed += prop;
    
    return { id: c.id, name: c.name, proposed: prop, reason };
  });

  let fields = proposals.map((p, i) => ({
    name: `prop_${i}`, label: p.name, help: p.reason, kind: 'money', value: p.proposed
  }));

  formModal({
    title: 'Set my budgets for me',
    submitLabel: 'Use these budgets',
    values: proposals.reduce((acc, p, i) => { acc[`prop_${i}`] = p.proposed; return acc; }, {}),
    fields: fields,
    onSave: v => {
      undoable('Budgets set from your spending', () => {
        proposals.forEach((p, i) => {
          const c = state.budget.categories.find(x => x.id === p.id);
          if (c) c.planned = Number(v[`prop_${i}`]) || 0;
        });
        commit();
      });
      toast('Budgets applied');
    }
  });
}
