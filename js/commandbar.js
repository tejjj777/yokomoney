/* YOKO! Student · AI Command Bar & Budget Autopilot.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* =========================================================
   RULE-BASED FALLBACK PARSER
   Used when AI is offline or unreachable.
   ========================================================= */
function parseCommandBarFallback(text) {
  const q = text.toLowerCase().trim();
  
  // a. Add ("spent 120 on chai with Rahul, split it")
  const addMatch = q.match(/(?:spent|paid|bought|add)\s+(\d+(?:\.\d+)?)\s+(?:on|for)\s+([a-z ]+?)(?:\s+with\s+([a-z ]+))?(?:\s*,\s*split\s+it)?$/i);
  if (addMatch || /split/i.test(q)) {
    const amtMatch = q.match(/(\d+(?:\.\d+)?)/);
    if (amtMatch) {
      return { 
        intent: 'add', 
        amount: Number(amtMatch[1]), 
        note: addMatch ? addMatch[2] : q.replace(/spent|paid|bought|add|[0-9.]+|with|split|it/gi, '').trim(),
        withPerson: addMatch && addMatch[3] ? addMatch[3] : (q.match(/with\s+([a-z]+)/i) || [])[1],
        split: /split/i.test(q)
      };
    }
  }

  // e. Budget ("set a 2000 limit for outings")
  const budMatch = q.match(/(?:set|make)(?:\s+a)?\s+(\d+(?:\.\d+)?)\s+(?:limit|budget)\s+for\s+([a-z ]+)/i);
  if (budMatch) {
    return { intent: 'budget', amount: Number(budMatch[1]), categoryName: budMatch[2].trim() };
  }

  // c. Afford ("can I afford a 1500 concert on Saturday?")
  const affordMatch = q.match(/afford\s+(?:a\s+)?(\d+(?:\.\d+)?)\s+([a-z ]+)\s+(?:on|this|next)\s+([a-z]+)/i);
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
  if (q.startsWith('how much')) {
    const catMatch = q.match(/on\s+([a-z]+)/i);
    return { intent: 'ask', categoryName: catMatch ? catMatch[1] : null, period: 'this week' }; // naive fallback
  }

  // d. What-if ("what if I stop ordering on weekends?")
  if (q.startsWith('what if')) {
    // fallback tries to find category and an amount to reduce
    const cat = q.match(/ordering|food|eat|outings|chai/i);
    return { intent: 'whatif', categoryName: cat ? cat[0] : 'Food', reductionAmount: 100 }; // purely naive fallback assumption
  }

  return { intent: 'unknown' };
}

/* =========================================================
   COMMAND BAR LOGIC
   ========================================================= */
let isRecording = false;

function commandBarHTML() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = SpeechRecognition ? `<button type="button" class="btn icon-btn" id="cb-mic" aria-label="Use voice" title="Use voice (English, Hindi, Telugu)">🎤</button>` : '';
  
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

  const executeCommand = async (text) => {
    if (!text.trim()) return;
    inp.disabled = true;
    btn.disabled = true;
    res.hidden = false;
    res.innerHTML = `<div class="cb-loading"><span class="status-dot"></span> Thinking...</div>`;

    // 1. Ask AI (if offline, falls back to rule-based parser)
    let parsed = null;
    if (typeof aiCall === 'function') {
      const prompt = `Parse this finance command from an Indian university student: "${text}".
Return JSON strictly with:
{
  "intent": "add" | "ask" | "afford" | "whatif" | "budget",
  "amount": number (if applicable),
  "note": string (for add),
  "withPerson": string (for splits),
  "split": boolean (for add),
  "categoryName": string (for ask, budget, whatif),
  "item": string (for afford),
  "dayOffset": number (days from today, for afford),
  "reductionAmount": number (daily amount reduced for whatif)
}`;
      const aiRes = await aiCall('command', prompt);
      if (aiRes && aiRes.intent) parsed = aiRes;
    }

    if (!parsed || !parsed.intent) {
      parsed = parseCommandBarFallback(text);
    }

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
      toast('Voice recognition failed or blocked.');
    };

    recognition.onend = () => {
      isRecording = false;
      mic.classList.remove('recording');
      mic.innerHTML = '🎤';
      inp.placeholder = "Ask AI: 'can I afford a 1500 concert on Saturday?'";
    };

    mic.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
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
    const cat = guessCategory(parsed.note) || state.budget.categories[0];
    const catName = cat ? state.budget.categories.find(c => c.id === cat.id).name : 'Budget';
    const hrs = fmtHours(parsed.amount);
    html = `<div class="cb-card-confirm">
      <p>I'll log <strong>${fmt(parsed.amount)}</strong>${hrs ? ` <span class="small muted">(= ${hrs})</span>` : ''} for <strong>${esc(parsed.note)}</strong> in ${esc(catName)}.</p>
      ${parsed.split && parsed.withPerson ? `<p class="small muted">And I'll split it with ${esc(parsed.withPerson)} (they owe you ${fmt(parsed.amount/2)}).</p>` : ''}
      <button type="button" class="btn btn-primary btn-sm mt" id="cb-confirm-btn">Confirm and Save</button>
    </div>`;
    container.innerHTML = html;
    container.querySelector('#cb-confirm-btn').addEventListener('click', () => {
      undoable(`Added ${fmt(parsed.amount)} for ${esc(parsed.note)}`, () => {
        addExpense({ categoryId: cat.id, amount: parsed.amount, date: todayISO(), note: parsed.note });
        if (parsed.split && parsed.withPerson) {
          state.wallet.ious.push({ id: uid(), person: parsed.withPerson.slice(0, 60), dir: 'owed', amount: parsed.amount/2, date: todayISO(), due: '', note: parsed.note, settled: false, settledAt: '' });
        }
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
    const startOfWeek = F.toISO(F.addDays(t, -t.getDay() + 1));
    const cat = state.budget.categories.find(c => c.name.toLowerCase().includes((parsed.categoryName || '').toLowerCase()));
    const exps = state.budget.expenses.filter(e => e.date >= startOfWeek && (!cat || e.categoryId === cat.id));
    const total = sum(exps, e => e.amount);
    
    container.innerHTML = `<p>You've spent <strong>${fmt(total)}</strong> on ${esc(cat ? cat.name : 'everything')} this week.</p>`;
    
  } else if (parsed.intent === 'afford') {
    const sts = studentSafeToSpend();
    const next = nextPayInfo();
    const daysLeft = next ? Math.max(1, next.days) : Math.max(1, F.daysLeftInMonth(todayDate()));
    
    // Find top flexible category
    const dailyAvgs = categoryDailyAverages(30);
    let topName = '', topCost = 0;
    for (const c of state.budget.categories) {
      if (c.type === 'wants' && dailyAvgs[c.name] > topCost) { topCost = dailyAvgs[c.name]; topName = c.name; }
    }

    const aff = F.affordCheck({
      balance: sts.available,
      daysLeft,
      amount: parsed.amount,
      eventDayOffset: parsed.dayOffset || 0,
      dailySpend: sts.baselineDaily,
      monthlyAllowance: monthlyIncome(),
      topCategory: topName ? { name: topName, dailyCost: topCost } : null
    });

    const hrs = fmtHours(parsed.amount);
    html = `<div class="cb-card-confirm">
      ${aff.verdict === 'yes' ? `<p class="tone-success-text" style="font-weight:bold">Yes, you can afford it.</p>` : 
        aff.verdict === 'tight' ? `<p class="tone-warn-text" style="font-weight:bold">It's tight.</p>` : 
        `<p class="tone-danger-text" style="font-weight:bold">No, you can't afford it right now.</p>`}
      <p class="small">${fmt(parsed.amount)}${hrs ? ` (= <strong>${hrs}</strong>)` : ''} would leave you with <strong>${fmt(aff.perDayAfter)}/day</strong> for the remaining ${plural(aff.daysAfter, 'day')}.</p>
      ${aff.fix ? `<p class="mt" style="font-style:italic">💡 ${esc(aff.fix)}.</p>` : ''}
    </div>`;
    container.innerHTML = html;

  } else if (parsed.intent === 'whatif') {
    const next = nextPayInfo();
    const daysLeft = next ? Math.max(1, next.days) : Math.max(1, F.daysLeftInMonth(todayDate()));
    const dailyAvgs = categoryDailyAverages(30);
    const inc = monthlyIncome();
    const b = budgetTotals();
    const currentBal = Math.max(0, inc > 0 ? (inc - b.actual) : (state.settings.cashOnHand || 0) - b.actual);
    
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
  } else {
    container.innerHTML = `<p>I didn't quite catch that. Try saying something like <em>"spent 200 on chai"</em>.</p>`;
  }
}

/* =========================================================
   BUDGET AUTOPILOT
   ========================================================= */
function budgetAutopilotModal() {
  const inc = monthlyIncome();
  const dailyAvgs = categoryDailyAverages(60);
  let totalProposed = 0;
  
  const proposals = state.budget.categories.map(c => {
    let prop = (dailyAvgs[c.name] || 0) * 30;
    let reason = "Based on your 60-day average.";
    if (prop === 0) {
      if (c.type === 'savings') { prop = inc * 0.10; reason = "Rule of thumb: save 10%."; }
      else { prop = 500; reason = "A small baseline to start."; }
    } else if (c.type === 'wants' && inc > 0 && (totalProposed + prop) > inc) {
      prop = prop * 0.8;
      reason = "Trimmed by 20% to fit your allowance.";
    }
    
    prop = Math.round(prop / 50) * 50; // round to nearest 50
    totalProposed += prop;
    
    return { id: c.id, name: c.name, proposed: prop, reason };
  });

  let fields = proposals.map((p, i) => ({
    name: `prop_${i}`, label: `${p.name} <br><span class="small muted" style="font-weight:normal">${p.reason}</span>`, kind: 'money', value: p.proposed, positive: true
  }));

  formModal({
    title: 'Autopilot Budgets',
    submitLabel: 'Apply Budgets',
    values: proposals.reduce((acc, p, i) => { acc[`prop_${i}`] = p.proposed; return acc; }, {}),
    fields: fields,
    onSave: v => {
      undoable('Budgets generated via autopilot', () => {
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
