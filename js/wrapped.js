/* YOKO! Student · Money Wrapped Story.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* =========================================================
   MONEY WRAPPED: Interactive Story + 1080x1080 Square Export
   ========================================================= */

let activeWrappedCard = 0;
let currentWrappedMonth = '';

/**
 * Gather data for Money Wrapped for a given month (ISO YYYY-MM) or current month.
 * @param {string} [ym]
 * @returns {Object}
 */
function getWrappedMonthData(ym) {
  const currentYm = todayISO().slice(0, 7);
  const targetYm = ym || currentYm;
  const isCurrent = targetYm === currentYm;
  const [year, monthNum] = targetYm.split('-').map(Number);
  const monthName = `${FULL_MONTHS[monthNum - 1]} ${year}`;

  let exps = [];
  let cats = [];
  let inc = 0;
  let savings = 0;
  let streak = 0;

  if (isCurrent) {
    exps = state.budget.expenses.filter(x => (x.date || '').slice(0, 7) === targetYm);
    cats = state.budget.categories;
    inc = monthlyIncome();
    savings = sum(state.goals.flatMap(g => g.contributions.filter(c => (c.date || '').slice(0, 7) === targetYm)), c => c.amount);
    streak = streakInfo().longest;
  } else {
    const hist = (state.history || []).find(h => h.month === targetYm);
    if (hist) {
      inc = hist.income || 0;
      cats = hist.cats || [];
      exps = state.budget.expenses.filter(x => (x.date || '').slice(0, 7) === targetYm);
    }
  }

  const totalSpent = exps.reduce((s, x) => s + (x.amount || 0), 0);

  // Top category
  const activeCats = cats.filter(c => c.type !== 'savings' && (c.actual || 0) > 0);
  const topCat = activeCats.sort((a, b) => b.actual - a.actual)[0] || null;

  // Real comparison
  const comparisonText = topCat ? F.calculateCategoryComparison(topCat, cats, exps) : '';

  // Biggest day
  const dailyMap = {};
  exps.forEach(x => {
    const d = (x.date || '').slice(0, 10);
    if (d) {
      dailyMap[d] = dailyMap[d] || { total: 0, items: [] };
      dailyMap[d].total += (x.amount || 0);
      dailyMap[d].items.push(x);
    }
  });
  let biggestDay = null;
  for (const [d, info] of Object.entries(dailyMap)) {
    if (!biggestDay || info.total > biggestDay.total) {
      const topExp = info.items.sort((a, b) => b.amount - a.amount)[0];
      biggestDay = { date: d, total: info.total, topNote: topExp ? (topExp.note || 'Expenses') : '' };
    }
  }

  // Personality
  const personality = F.calculateSpendingPersonality({
    expenses: exps,
    categories: cats,
    income: inc,
    savings,
    streak
  });

  // Ghost spending
  const ghost = F.calculateGhostSpending(exps, 100);

  // Budget wins
  const categoriesUnderBudget = cats.filter(c => c.planned > 0 && (c.actual || 0) <= c.planned);

  // Next month goal recommendation
  let nextGoal = 'Track all cash and UPI expenses consistently every day.';
  if (topCat && topCat.actual > 2000) {
    const trim = Math.round(topCat.actual * 0.85);
    nextGoal = `Keep ${topCat.name} under ${fmt(trim)} by cutting 2-3 extra orders.`;
  } else if (ghost.pct >= 25 && ghost.total >= 500) {
    nextGoal = `Reduce small impulse payments under ₹100 to save ${fmt(Math.round(ghost.total * 0.5))}.`;
  } else if (streak < 7) {
    nextGoal = 'Achieve at least a 7-day no-spend streak on flexible wants.';
  }

  return {
    monthIso: targetYm,
    monthName: isCurrent ? `${monthName} (So Far)` : monthName,
    isCurrent,
    totalSpent,
    income: inc,
    topCat,
    comparisonText,
    biggestDay,
    personality,
    ghost,
    categoriesUnderBudget,
    savings,
    streak,
    nextGoal,
    expsCount: exps.length
  };
}

/**
 * Open the Money Wrapped Story modal.
 * @param {string} [initialMonth]
 */
function openWrapped(initialMonth) {
  currentWrappedMonth = initialMonth || todayISO().slice(0, 7);
  activeWrappedCard = 0;

  openModal({
    title: 'Money Wrapped',
    hideSubmit: true,
    cancelLabel: 'Close',
    wide: true,
    body: '<div id="mw-container" class="mw-container"></div>',
    onMount: form => renderWrappedStory(form)
  });

  if (!state.badges.wrapped) {
    state.badges.wrapped = todayISO();
    save();
    celebrateBadges([BADGES.find(b => b.id === 'wrapped')]);
    render();
  }
}

function renderWrappedStory(form) {
  const container = form.querySelector('#mw-container');
  if (!container) return;

  const data = getWrappedMonthData(currentWrappedMonth);

  // Month selector options
  const currentYm = todayISO().slice(0, 7);
  const monthOptions = [{ iso: currentYm, label: 'This month so far' }];
  (state.history || []).forEach(h => {
    if (h.month && h.month !== currentYm) {
      monthOptions.push({ iso: h.month, label: monthLabelISO(h.month) });
    }
  });

  const cards = [
    // Card 1: Overview & Total Spent
    {
      title: 'Total Spent',
      tag: 'MONTH SUMMARY',
      render: () => `
        <div class="mw-card-body">
          <p class="mw-card-sub">${esc(data.monthName)}</p>
          <h1 class="mw-hero-amount">${fmt(data.totalSpent)}</h1>
          <p class="mw-lead-text">logged across ${plural(data.expsCount, 'expense')}.</p>
          <div class="stats-grid two" style="margin-top:20px;text-align:left">
            <div class="stat"><p class="stat-label">Allowance / Income</p><p class="stat-value font-bold">${fmt(data.income)}</p></div>
            <div class="stat"><p class="stat-label">No-spend streak</p><p class="stat-value font-bold">🔥 ${plural(data.streak, 'day')}</p></div>
          </div>
        </div>
      `
    },
    // Card 2: Top Category & Real Comparison
    {
      title: 'Where It Went',
      tag: 'TOP SPENDING',
      render: () => `
        <div class="mw-card-body">
          <p class="mw-card-sub">Your #1 category</p>
          <h1 class="mw-hero-amount" style="color:var(--primary)">${esc(data.topCat ? data.topCat.name : 'Expenses')}</h1>
          <p class="mw-hero-sub-amt">${fmt(data.topCat ? data.topCat.actual : 0)}</p>
          ${data.comparisonText ? `
            <div class="alert alert-info" style="margin-top:24px;font-size:16px;line-height:1.5;text-align:left">
              💡 <strong>In perspective:</strong> ${esc(data.comparisonText)}.
            </div>
          ` : ''}
        </div>
      `
    },
    // Card 3: Biggest Spending Day
    {
      title: 'Peak Day',
      tag: 'BIGGEST SPEND',
      render: () => `
        <div class="mw-card-body">
          <p class="mw-card-sub">Most active spending day</p>
          <h1 class="mw-hero-amount" style="font-size:38px">${data.biggestDay ? fmt(data.biggestDay.total) : '—'}</h1>
          <p class="mw-lead-text">on ${data.biggestDay ? fmtDate(F.parseDate(data.biggestDay.date)) : 'no spending days yet'}</p>
          ${data.biggestDay && data.biggestDay.topNote ? `
            <div class="card" style="margin-top:24px;padding:12px;background:var(--surface);text-align:left">
              <span class="small muted">Main purchase:</span>
              <p style="font-weight:600;margin:4px 0 0">${esc(data.biggestDay.topNote)}</p>
            </div>
          ` : ''}
        </div>
      `
    },
    // Card 4: Spending Personality
    {
      title: 'Your Money Persona',
      tag: 'SPENDING PERSONALITY',
      render: () => `
        <div class="mw-card-body">
          <div class="mw-persona-emoji">${data.personality.emoji}</div>
          <h1 class="mw-hero-amount" style="font-size:34px;margin-top:8px">${esc(data.personality.title)}</h1>
          <p class="mw-lead-text" style="margin-top:12px;font-size:17px;line-height:1.5">${esc(data.personality.desc)}</p>
        </div>
      `
    },
    // Card 5: Budget Wins & Ghost Spending
    {
      title: 'Wins & Insights',
      tag: 'BUDGET HIGHLIGHTS',
      render: () => `
        <div class="mw-card-body" style="text-align:left">
          <div class="card mb" style="padding:12px;background:var(--surface)">
            <p class="font-bold">🎯 Budget control</p>
            <p class="small muted">${data.categoriesUnderBudget.length ? `Stayed under budget in ${plural(data.categoriesUnderBudget.length, 'category')}.` : 'Set category targets to unlock budget wins.'}</p>
          </div>
          <div class="card mb" style="padding:12px;background:var(--surface)">
            <p class="font-bold">👻 Ghost payments</p>
            <p class="small muted">${data.ghost.count > 0 ? `${data.ghost.count} small payments under ₹100 totaled ${fmt(data.ghost.total)} (${data.ghost.pct}% of spending).` : 'No small impulse payments recorded.'}</p>
          </div>
          ${data.savings > 0 ? `
            <div class="card" style="padding:12px;background:var(--surface)">
              <p class="font-bold">💰 Savings stash</p>
              <p class="small muted">Put away ${fmt(data.savings)} into goals this month.</p>
            </div>
          ` : ''}
        </div>
      `
    },
    // Card 6: Goal for Next Month
    {
      title: 'Looking Ahead',
      tag: 'NEXT MONTH FOCUS',
      render: () => `
        <div class="mw-card-body">
          <div style="font-size:48px;margin-bottom:12px">🚀</div>
          <p class="mw-card-sub">Suggested goal for next month</p>
          <div class="alert alert-info" style="font-size:18px;font-weight:600;line-height:1.5;margin-top:16px">
            "${esc(data.nextGoal)}"
          </div>
        </div>
      `
    }
  ];

  const totalCards = cards.length;
  if (activeWrappedCard >= totalCards) activeWrappedCard = 0;
  if (activeWrappedCard < 0) activeWrappedCard = totalCards - 1;

  const card = cards[activeWrappedCard];

  container.innerHTML = `
    <!-- Top Bar: Month Selector & Story progress bars -->
    <div class="mw-header">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">
        <select id="mw-month-select" class="select input-sm" style="width:auto;max-width:200px">
          ${monthOptions.map(m => `<option value="${m.iso}" ${m.iso === currentWrappedMonth ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-sm btn-primary" id="mw-export-btn">${ICON.download}<span>Export Card</span></button>
      </div>
      <!-- Story Indicators -->
      <div class="mw-story-bars">
        ${cards.map((_, i) => `<div class="mw-story-bar ${i === activeWrappedCard ? 'active' : (i < activeWrappedCard ? 'done' : '')}"></div>`).join('')}
      </div>
    </div>

    <!-- Active Card Frame -->
    <div class="mw-card-frame" id="mw-card-frame">
      <div class="mw-card-tag">${esc(card.tag)}</div>
      ${card.render()}
      <div class="mw-brand-footer">
        <span class="small font-bold" style="letter-spacing:1px">YOKO! WRAPPED</span>
        <span class="small muted">${activeWrappedCard + 1} of ${totalCards}</span>
      </div>
    </div>

    <!-- Navigation Arrows -->
    <div class="mw-nav-row">
      <button type="button" class="btn icon-btn" id="mw-prev-btn" aria-label="Previous card" ${activeWrappedCard === 0 ? 'disabled' : ''}>◀</button>
      <span class="small muted">Tap arrows or swipe to navigate</span>
      <button type="button" class="btn icon-btn" id="mw-next-btn" aria-label="Next card" ${activeWrappedCard === totalCards - 1 ? 'disabled' : ''}>▶</button>
    </div>
  `;

  // Attach controls
  const monthSelect = container.querySelector('#mw-month-select');
  monthSelect.addEventListener('change', () => {
    currentWrappedMonth = monthSelect.value;
    activeWrappedCard = 0;
    renderWrappedStory(form);
  });

  const prevBtn = container.querySelector('#mw-prev-btn');
  const nextBtn = container.querySelector('#mw-next-btn');

  if (prevBtn) prevBtn.addEventListener('click', () => { activeWrappedCard--; renderWrappedStory(form); });
  if (nextBtn) nextBtn.addEventListener('click', () => { activeWrappedCard++; renderWrappedStory(form); });

  // Export current card as 1080x1080 square PNG
  const exportBtn = container.querySelector('#mw-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const c = drawWrappedSquareCard(data, activeWrappedCard);
      c.toBlob(b => {
        if (b) {
          const filename = `yoko-wrapped-${data.monthIso}-card${activeWrappedCard + 1}.png`;
          downloadFile(filename, b, 'image/png');
          toast(`Card ${activeWrappedCard + 1} exported!`);
        }
      }, 'image/png');
    });
  }
}

/**
 * Draw a clean, modern 1080x1080 square card for social sharing and export.
 * @param {Object} d - Month wrapped data
 * @param {number} cardIndex
 * @returns {HTMLCanvasElement}
 */
function drawWrappedSquareCard(d, cardIndex) {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px Inter, system-ui, -apple-system, sans-serif`;
  const fit = (text, maxW) => {
    let s = String(text || '');
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  };

  const accent = (THEMES[state.settings.theme] || THEMES.yoko).chart[0];

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#0F172A');
  g.addColorStop(1, '#020617');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Decorative glow circles
  ctx.fillStyle = hexA(accent, 0.12);
  ctx.beginPath(); ctx.arc(S - 120, 140, 240, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(100, S - 100, 200, 0, Math.PI * 2); ctx.fill();

  // Top header: Brand & Month
  ctx.fillStyle = accent;
  ctx.font = font(700, 36);
  ctx.fillText('YOKO! WRAPPED', 80, 110);

  ctx.fillStyle = '#94A3B8';
  ctx.font = font(600, 28);
  ctx.fillText(d.monthName.toUpperCase(), 80, 155);

  // Card specific rendering
  if (cardIndex === 0) {
    // Total Spent
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('TOTAL SPENT', 80, 320);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(800, 96);
    ctx.fillText(fmt(d.totalSpent), 80, 440);

    ctx.fillStyle = '#94A3B8';
    ctx.font = font(400, 34);
    ctx.fillText(`Logged across ${plural(d.expsCount, 'expense')}`, 80, 510);

    // Stats box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(80, 600, S - 160, 200);
    ctx.fillStyle = accent;
    ctx.fillRect(80, 600, 8, 200);

    ctx.fillStyle = '#94A3B8';
    ctx.font = font(600, 28);
    ctx.fillText('MONTHLY ALLOWANCE', 120, 660);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(700, 46);
    ctx.fillText(fmt(d.income), 120, 720);

    ctx.fillStyle = '#94A3B8';
    ctx.font = font(600, 28);
    ctx.fillText('NO-SPEND STREAK', 580, 660);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(700, 46);
    ctx.fillText(`🔥 ${plural(d.streak, 'day')}`, 580, 720);

  } else if (cardIndex === 1) {
    // Top Category
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('TOP SPENDING CATEGORY', 80, 300);

    ctx.fillStyle = accent;
    ctx.font = font(800, 84);
    ctx.fillText(fit(d.topCat ? d.topCat.name : 'None', S - 160), 80, 410);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(700, 56);
    ctx.fillText(fmt(d.topCat ? d.topCat.actual : 0), 80, 490);

    if (d.comparisonText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(80, 580, S - 160, 220);
      ctx.fillStyle = '#38BDF8';
      ctx.font = font(700, 30);
      ctx.fillText('IN PERSPECTIVE', 120, 640);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = font(400, 34);
      ctx.fillText(fit(d.comparisonText, S - 240), 120, 710);
    }

  } else if (cardIndex === 2) {
    // Peak Day
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('BIGGEST SPENDING DAY', 80, 320);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(800, 92);
    ctx.fillText(d.biggestDay ? fmt(d.biggestDay.total) : '—', 80, 440);

    ctx.fillStyle = '#94A3B8';
    ctx.font = font(500, 36);
    ctx.fillText(`on ${d.biggestDay ? fmtDate(F.parseDate(d.biggestDay.date)) : 'N/A'}`, 80, 510);

    if (d.biggestDay && d.biggestDay.topNote) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(80, 600, S - 160, 180);
      ctx.fillStyle = '#94A3B8';
      ctx.font = font(600, 26);
      ctx.fillText('MAIN EXPENSE', 120, 660);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = font(700, 38);
      ctx.fillText(fit(d.biggestDay.topNote, S - 240), 120, 720);
    }

  } else if (cardIndex === 3) {
    // Spending Personality
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('SPENDING PERSONALITY', 80, 280);

    ctx.font = font(400, 110);
    ctx.fillText(d.personality.emoji, 80, 420);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(800, 72);
    ctx.fillText(fit(d.personality.title, S - 160), 80, 520);

    ctx.fillStyle = '#94A3B8';
    ctx.font = font(400, 36);
    ctx.fillText(fit(d.personality.desc, S - 160), 80, 600);

  } else if (cardIndex === 4) {
    // Budget Wins & Ghosts
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('MONTH HIGHLIGHTS', 80, 270);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(80, 320, S - 160, 150);
    ctx.fillStyle = '#22C55E';
    ctx.font = font(700, 30);
    ctx.fillText('BUDGET CONTROL', 120, 380);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(500, 32);
    ctx.fillText(`${d.categoriesUnderBudget.length} categories stayed under budget`, 120, 430);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(80, 500, S - 160, 150);
    ctx.fillStyle = '#F59E0B';
    ctx.font = font(700, 30);
    ctx.fillText('GHOST SPENDING (< ₹100)', 120, 560);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(500, 32);
    ctx.fillText(`${d.ghost.count} small payments = ${fmt(d.ghost.total)}`, 120, 610);

  } else {
    // Next Month Goal
    ctx.fillStyle = '#E2E8F0';
    ctx.font = font(500, 32);
    ctx.fillText('NEXT MONTH FOCUS', 80, 300);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(80, 380, S - 160, 300);
    ctx.fillStyle = accent;
    ctx.fillRect(80, 380, 10, 300);

    ctx.fillStyle = '#38BDF8';
    ctx.font = font(700, 34);
    ctx.fillText('RECOMMENDED TARGET', 130, 460);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(600, 40);
    ctx.fillText(fit(d.nextGoal, S - 260), 130, 540);
  }

  // Footer: App watermark
  ctx.fillStyle = '#64748B';
  ctx.font = font(500, 24);
  ctx.fillText('Personal Finance for University Students · yokomoney.app', 80, S - 70);

  return c;
}
