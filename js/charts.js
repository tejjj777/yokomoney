/* YOKO! Student · Chart.js wrappers.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   CHARTS
   ========================================================= */
const charts = {};
const hasChart = () => typeof window.Chart !== 'undefined';
/** Rainbow chart colors: eight clearly different hues, checked to stay apart for colour-blind readers on the dark background. */
const RAINBOW = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'];
function colorAt(i) {
  const th = THEMES[state.settings.theme] || THEMES.yoko;
  const base = state.settings.chartColors === 'rainbow' ? RAINBOW : th.chart;
  const all = base.concat(['#CFCFCF', '#8F8F8F', '#6B6B6B', '#B5B5B5', '#5A5A5A', '#E0E0E0']);
  const c = all[i % all.length];
  return document.documentElement.dataset.theme === 'print' && c === '#E8E8E8' ? '#3A3A3A' : c;   // light grey is invisible on paper
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function destroyCharts() { for (const k of Object.keys(charts)) { try { charts[k].destroy(); } catch (e) { /* ignore */ } delete charts[k]; } }
function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!hasChart()) { el.parentElement.innerHTML = '<p class="chart-fallback">Charts need an internet connection to load Chart.js. Everything else works offline.</p>'; return; }
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el, config);
}
function setupChartDefaults() {
  if (!hasChart()) return;
  const D = Chart.defaults;
  D.font.family = '"DM Sans", system-ui, sans-serif';
  D.font.size = 12;
  D.color = css('--muted');
  D.borderColor = css('--grid');
  D.maintainAspectRatio = false;
  // no chart animation with reduced motion, or when printing (paper would catch it half drawn)
  D.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.theme === 'print' ? 0 : 650;
  D.plugins.legend.position = 'bottom';
  D.plugins.legend.labels.usePointStyle = true;
  D.plugins.legend.labels.boxWidth = 8;
  D.plugins.legend.labels.padding = 14;
  D.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, .92)';
  D.plugins.tooltip.borderColor = css('--border');
  D.plugins.tooltip.borderWidth = 1;
  D.plugins.tooltip.padding = 10;
  D.plugins.tooltip.cornerRadius = 8;
  D.plugins.tooltip.titleFont = { weight: '600' };
}
const moneyAxis = () => ({ beginAtZero: true, ticks: { callback: v => fmtCompact(v) }, grid: { color: css('--grid') } });
const xAxis = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } };

function doughnut(id, labels, data, colors, type = 'doughnut') {
  makeChart(id, {
    type,
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: css('--bg'), borderWidth: 2, hoverOffset: 6 }] },
    options: {
      cutout: type === 'doughnut' ? '62%' : 0,
      plugins: { tooltip: { callbacks: { label: ctx => {
        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
        return ` ${ctx.label}: ${fmt(ctx.parsed)} (${fmtPct(total ? ctx.parsed / total * 100 : 0)})`;
      } } } }
    }
  });
}
function moneyTooltip(ctx) { return ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`; }

function splitChart() {
  const s = splitSummary();
  const rows = s.rows.filter(r => r.amount > 0);
  const labels = rows.map(r => r.name), data = rows.map(r => r.amount), colors = rows.map((_, i) => colorAt(i));
  if (s.base > 0 && s.diff > 0.5) { labels.push('Unassigned'); data.push(s.diff); colors.push(css('--neutral-bg')); }
  doughnut('split-chart', labels, data, colors);
}
function spendingSource() {
  const cats = state.budget.categories;
  const useActual = cats.some(c => c.actual > 0);
  const list = cats.filter(c => (useActual ? c.actual : c.planned) > 0);
  return { useActual, list, values: list.map(c => useActual ? c.actual : c.planned) };
}
function spendChart(id) {
  const s = spendingSource();
  doughnut(id, s.list.map(c => c.name), s.values, s.list.map((_, i) => colorAt(i)));
}
function goalsBarChart(id) {
  const goals = state.goals;
  makeChart(id, {
    type: 'bar',
    data: { labels: goals.map(g => g.name), datasets: [{ label: 'Progress', data: goals.map(g => goalInfo(g).pct), backgroundColor: goals.map((_, i) => colorAt(i)), borderRadius: 8, maxBarThickness: 48 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const g = goals[ctx.dataIndex]; return ` ${fmtPct(ctx.parsed.y)} · ${fmt(g.saved)} of ${fmt(g.target)}`; } } } },
      scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: css('--grid') } }, x: xAxis }
    }
  });
}
function planLabels(plan) {
  const t = todayDate();
  return Array.from({ length: plan.rows.length + 1 }, (_, i) => fmtMonthShort(F.addMonths(t, i)));
}
function debtLineChart(id, plan) {
  makeChart(id, {
    type: 'line',
    data: { labels: planLabels(plan), datasets: [{ label: 'Total debt', data: [plan.startBalance].concat(plan.rows.map(r => r.totalBalance)),
      borderColor: colorAt(0), backgroundColor: hexA(colorAt(0), 0.22), fill: 'origin', tension: 0.3, pointRadius: 0, pointHitRadius: 8, borderWidth: 2.5 }] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: moneyAxis(), x: xAxis } }
  });
}

function runOutLineChart(id, forecast) {
  if (!forecast || !forecast.points) return;
  const labels = forecast.points.map((p, i) => {
    const d = F.parseDate(p.date);
    return i === 0 ? 'Today' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  });
  const data = forecast.points.map(p => Math.max(0, p.balance));
  const color = forecast.willMakeIt ? (css('--tone-success') || '#10B981') : (css('--tone-danger') || '#EF4444');
  makeChart(id, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Projected balance',
          data,
          borderColor: color,
          backgroundColor: hexA(color.startsWith('#') ? color : '#10B981', 0.18),
          fill: true,
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Projected: ${fmt(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: moneyAxis(),
        x: xAxis
      }
    }
  });
}

function updateRunOutChartLive(id, forecast) {
  const chart = charts[id];
  if (!chart || !forecast || !forecast.points) return;
  const data = forecast.points.map(p => Math.max(0, p.balance));
  const color = forecast.willMakeIt ? (css('--tone-success') || '#10B981') : (css('--tone-danger') || '#EF4444');
  chart.data.datasets[0].data = data;
  chart.data.datasets[0].borderColor = color;
  chart.data.datasets[0].backgroundColor = hexA(color.startsWith('#') ? color : '#10B981', 0.18);
  chart.update('none');
}

