/* YOKO! Student · Spending Insights: Ghost Spending, Time-of-Day, and Interactive Heatmap.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/* =========================================================
   1. GHOST SPENDING CARD
   ========================================================= */

let customGhostThreshold = 100;

function ghostSpendingCard() {
  const ym = todayISO().slice(0, 7);
  const exps = state.budget.expenses.filter(x => (x.date || '').slice(0, 7) === ym);
  const ghost = F.calculateGhostSpending(exps, customGhostThreshold);

  return `
    <div class="card mb" id="w-ghost-spending">
      <div class="card-head">
        <div>
          <h2>Ghost spending</h2>
          <p class="muted small">Micro-payments that slip under the radar.</p>
        </div>
        <div class="row no-print" style="align-items:center;gap:8px">
          <span class="small muted">Under:</span>
          <div class="affix" style="width:90px">
            <span class="affix-sym">${esc(CURRENCIES[state.currency].symbol)}</span>
            <input type="number" id="ghost-thresh-inp" class="input input-sm" value="${customGhostThreshold}" step="20">
          </div>
        </div>
      </div>
      <div class="mini-stats">
        <div>
          <p class="stat-label">Small payments</p>
          <p class="stat-value font-bold">${ghost.count}</p>
        </div>
        <div>
          <p class="stat-label">Ghost total</p>
          <p class="stat-value tone-warn-text">${fmt(ghost.total)}</p>
        </div>
        <div>
          <p class="stat-label">Share of spend</p>
          <p class="stat-value">${ghost.pct}%</p>
        </div>
      </div>
      <p class="small" style="margin-top:12px;line-height:1.5">
        ${ghost.count > 0 
          ? `<strong>${ghost.count} small payments</strong> under ${fmt(customGhostThreshold)} added up to <strong>${fmt(ghost.total)}</strong> this month.`
          : `No payments under ${fmt(customGhostThreshold)} found this month.`}
      </p>
    </div>
  `;
}

function bindGhostSpendingCard() {
  const inp = document.getElementById('ghost-thresh-inp');
  if (inp) {
    inp.addEventListener('change', e => {
      customGhostThreshold = Number(e.target.value) || 100;
      scheduleRender();
    });
  }
}

/* =========================================================
   2. TIME-OF-DAY INSIGHTS CARD
   ========================================================= */

function timeOfDayCard() {
  const ym = todayISO().slice(0, 7);
  const exps = state.budget.expenses.filter(x => (x.date || '').slice(0, 7) === ym);
  const timeInfo = F.calculateTimeOfDayBands(exps);

  // Hidden when too few transactions have times
  if (!timeInfo.hasEnoughData) {
    return '';
  }

  const b = timeInfo.bands;

  return `
    <div class="card mb" id="w-time-of-day">
      <div class="card-head">
        <div>
          <h2>Time-of-day habits</h2>
          <p class="muted small">When your wallet opens during 24 hours.</p>
        </div>
      </div>
      <div class="stats-grid two mb">
        <div class="card" style="padding:12px;background:var(--surface)">
          <span class="small muted">🌅 Morning (6am–12pm)</span>
          <p class="stat-value font-bold" style="font-size:18px">${fmt(b.morning.total)} <span class="small muted">(${b.morning.pct}%)</span></p>
        </div>
        <div class="card" style="padding:12px;background:var(--surface)">
          <span class="small muted">☀️ Afternoon (12pm–5pm)</span>
          <p class="stat-value font-bold" style="font-size:18px">${fmt(b.afternoon.total)} <span class="small muted">(${b.afternoon.pct}%)</span></p>
        </div>
        <div class="card" style="padding:12px;background:var(--surface)">
          <span class="small muted">🌆 Evening (5pm–10pm)</span>
          <p class="stat-value font-bold" style="font-size:18px">${fmt(b.evening.total)} <span class="small muted">(${b.evening.pct}%)</span></p>
        </div>
        <div class="card" style="padding:12px;background:var(--surface)">
          <span class="small muted">🌙 Late Night (10pm–6am)</span>
          <p class="stat-value font-bold" style="font-size:18px">${fmt(b.lateNight.total)} <span class="small muted">(${b.lateNight.pct}%)</span></p>
        </div>
      </div>
      <div class="alert alert-info small" style="line-height:1.4">
        💡 <strong>Pattern:</strong> ${esc(timeInfo.notablePattern)}
      </div>
    </div>
  `;
}

/* =========================================================
   3. INTERACTIVE SPENDING HEATMAP
   ========================================================= */

let selectedHeatmapIso = '';

function spendingHeatmapCard() {
  const t = todayDate();
  const ym = todayISO().slice(0, 7);
  // Start of month to end of month
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);

  const exps = state.budget.expenses.filter(x => (x.date || '').slice(0, 7) === ym);
  const hm = F.calculateDailyHeatmap(exps, start, end);

  const selectedDay = selectedHeatmapIso ? hm.days.find(d => d.iso === selectedHeatmapIso) : null;

  return `
    <div class="card mb" id="w-spending-heatmap">
      <div class="card-head">
        <div>
          <h2>Spending heatmap</h2>
          <p class="muted small">${FULL_MONTHS[t.getMonth()]} ${t.getFullYear()} daily intensity (tap a day to see expenses).</p>
        </div>
      </div>
      
      <!-- Day-of-week header -->
      <div class="hm-calendar-grid">
        <div class="hm-header-row">
          <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
        </div>
        <div class="hm-days-grid">
          ${(() => {
            let cells = '';
            // Pad start of month
            const firstDow = start.getDay();
            for (let p = 0; p < firstDow; p++) {
              cells += '<div class="hm-empty-cell"></div>';
            }
            hm.days.forEach(d => {
              const isToday = d.iso === todayISO();
              const isSelected = d.iso === selectedHeatmapIso;
              cells += `
                <button type="button" class="hm-day-btn hm-lvl-${d.level} ${isToday ? 'hm-today' : ''} ${isSelected ? 'hm-selected' : ''}" data-iso="${d.iso}" title="${fmtDate(d.date)}: ${fmt(d.amount)}">
                  <span class="hm-day-num">${d.date.getDate()}</span>
                </button>
              `;
            });
            return cells;
          })()}
        </div>
      </div>

      <!-- Legend -->
      <div class="row small muted" style="justify-content:space-between;align-items:center;margin-top:12px;font-size:11px">
        <span>Less</span>
        <div class="row" style="gap:4px;align-items:center">
          <span class="hm-legend-dot hm-lvl-0"></span>
          <span class="hm-legend-dot hm-lvl-1"></span>
          <span class="hm-legend-dot hm-lvl-2"></span>
          <span class="hm-legend-dot hm-lvl-3"></span>
          <span class="hm-legend-dot hm-lvl-4"></span>
        </div>
        <span>More</span>
      </div>

      <!-- Selected Day Inspection Panel -->
      <div id="hm-day-details" style="margin-top:16px">
        ${selectedDay ? `
          <div class="card" style="padding:12px;background:var(--surface-2)">
            <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>${fmtDate(selectedDay.date)}</strong>
              <span class="font-bold">${fmt(selectedDay.amount)}</span>
            </div>
            ${selectedDay.expenses.length ? `
              <ul class="plain-list small">
                ${selectedDay.expenses.map(x => `
                  <li style="display:flex;justify-content:space-between;gap:8px;padding:4px 0">
                    <span>${esc(x.note || 'Expense')}</span>
                    <span class="font-bold">${fmt(x.amount)}</span>
                  </li>
                `).join('')}
              </ul>
            ` : '<p class="small muted" style="margin:0">No expenses recorded on this day. 🎉</p>'}
          </div>
        ` : '<p class="small muted" style="text-align:center;margin:8px 0 0">Tap any day cell above to inspect transactions.</p>'}
      </div>
    </div>
  `;
}

function bindSpendingHeatmap() {
  const card = document.getElementById('w-spending-heatmap');
  if (!card) return;

  card.querySelectorAll('.hm-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedHeatmapIso = btn.dataset.iso;
      scheduleRender();
    });
  });
}
