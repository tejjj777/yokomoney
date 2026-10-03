/* YOKO! Student · Bill calendar.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   BILL CALENDAR
   ========================================================= */
function paydaysBetween(from, to) {
  let anchor = F.parseDate(state.income.nextPayDate);
  if (!anchor || !state.income.configured || state.income.irregular) return [];
  if (anchor > from) {   // walk the anchor back so past paydays in this range show too
    const f = state.income.freq;
    anchor = f === 'weekly' ? F.addDays(anchor, -7 * 110) : f === 'biweekly' ? F.addDays(anchor, -14 * 55) : F.addMonths(anchor, f === 'yearly' ? -36 : -24);
  }
  const out = [];
  let d = F.nextPayday(anchor, state.income.freq, from);
  for (let k = 0; d && d <= to && k < 40; k++) { out.push(d); d = F.nextPayday(anchor, state.income.freq, F.addDays(d, 1)); }
  return out;
}
/** Everything with a date between `from` and `to` (inclusive). */
function calEvents(from, to) {
  const ev = [], iso = F.toISO, fromISO = iso(from), toISO = iso(to);
  const add = (date, icon, title, amount, kind) => { if (date >= fromISO && date <= toISO) ev.push({ date, icon, title, amount, kind }); };
  const pay = paydaysBetween(from, to);
  pay.forEach(d => add(iso(d), '💰', 'Payday', paycheckNet(), 'in'));
  (state.incomeLog || []).forEach(x => add(x.date, '💰', x.note || 'Income', x.amount, 'in'));
  state.recurring.filter(r => r.active).forEach(r => F.recurringDue(r, '', toISO, 400).forEach(d => add(d, '🔁', r.name, r.amount, 'bill')));
  const annual = (dateISO, cb) => {
    const base = F.parseDate(dateISO); if (!base) return;
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      const d = new Date(y, base.getMonth(), Math.min(base.getDate(), new Date(y, base.getMonth() + 1, 0).getDate()));
      cb(iso(d));
    }
  };
  (state.yearlyBills || []).forEach(x => annual(x.due, d => add(d, '📆', x.name, x.amount, 'bill')));
  state.gifts.forEach(g => annual(g.date, d => add(d, '🎁', `${g.name}’s ${giftLabel(g).toLowerCase()}`, g.budget, 'gift')));
  state.wallet.deadlines.forEach(x => (x.repeat ? annual(x.date, d => add(d, '🧾', x.title, null, 'tax')) : add(x.date, '🧾', x.title, null, 'tax')));
  state.goals.forEach(g => { if (g.deadline && !(g.target > 0 && g.saved >= g.target)) add(g.deadline, '🎯', `${g.name} deadline`, Math.max(0, g.target - g.saved), 'goal'); });
  state.wallet.ious.filter(x => !x.settled && x.due).forEach(x => add(x.due, '🤝', x.dir === 'owe' ? `Pay back ${x.person}` : `${x.person} pays you back`, x.amount, x.dir === 'owe' ? 'bill' : 'in'));
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
function calendarCard() {
  const t = todayDate();
  const ym = ui.calMonth || todayISO().slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0);
  const events = calEvents(first, last);
  const byDay = {};
  events.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const sundayFirst = countryInfo(state.settings.country).dates === 'mdy';
  const names = sundayFirst ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const offset = sundayFirst ? first.getDay() : (first.getDay() + 6) % 7;
  const sel = ui.calDay && ui.calDay.slice(0, 7) === ym ? ui.calDay : null;
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span class="cal-cell is-blank" aria-hidden="true"></span>';
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = F.toISO(new Date(y, mo - 1, d)), list = byDay[iso] || [];
    const label = `${d} ${MONTHS[mo - 1]}${list.length ? `: ${list.map(e => e.title).join(', ')}` : ''}`;
    cells += `<button type="button" class="cal-cell${iso === todayISO() ? ' is-today' : ''}${iso === sel ? ' is-selected' : ''}${list.length ? ' has-events' : ''}" data-action="cal-day" data-date="${iso}" aria-label="${esc(label)}" aria-pressed="${iso === sel}">
      <span class="cal-num">${d}</span><span class="cal-dots" aria-hidden="true">${list.slice(0, 3).map(e => `<i>${e.icon}</i>`).join('')}${list.length > 3 ? '<b>+</b>' : ''}</span></button>`;
  }
  const shown = sel ? byDay[sel] || [] : events.filter(e => e.date >= (ym === todayISO().slice(0, 7) ? todayISO() : '0'));
  const billsTotal = sum(events.filter(e => e.kind === 'bill'), e => e.amount || 0);
  const list = shown.length ? `<ul class="cal-list">${shown.map(e => `<li><span class="cal-when">${fmtDate(F.parseDate(e.date)).replace(/ \d{4}$/, '')}</span><span aria-hidden="true">${e.icon}</span><span class="cal-what">${esc(e.title)}</span>${e.amount ? `<span class="num ${e.kind === 'in' ? 'tone-success-text' : ''}">${e.kind === 'in' ? '+' : ''}${fmt(e.amount)}</span>` : '<span></span>'}</li>`).join('')}</ul>`
    : `<p class="muted small">${sel ? 'Nothing on this day.' : 'Nothing else this month.'}</p>`;
  return `<div class="card mb" id="cal-card"><div class="card-head"><div><h2>Bill calendar</h2><p class="muted small">${events.length ? `${plural(events.filter(e => e.kind === 'bill').length, 'bill')} this month${billsTotal ? `, ${fmt(billsTotal)} in total` : ''}` : 'Paydays, bills, birthdays and tax dates.'}</p></div>
    <div class="actions no-print"><button type="button" class="icon-btn" data-action="cal-prev" aria-label="Previous month">‹</button><strong class="cal-month">${FULL_MONTHS[mo - 1]} ${y}</strong><button type="button" class="icon-btn" data-action="cal-next" aria-label="Next month">›</button>
      ${moreMenu([ym !== todayISO().slice(0, 7) ? mi('Back to this month', 'cal-today') : '', mi('Add to my phone’s calendar (.ics file)', 'cal-ics')])}</div></div>
    <div class="cal-grid" role="group" aria-label="${FULL_MONTHS[mo - 1]} ${y}">${names.map(n => `<span class="cal-head" aria-hidden="true">${n}</span>`).join('')}${cells}</div>
    <div class="cal-below"><h3>${sel ? fmtDate(F.parseDate(sel)) : (ym === todayISO().slice(0, 7) ? 'Still to come this month' : `${FULL_MONTHS[mo - 1]}`)}</h3>${list}</div>
    ${!state.recurring.length ? '<p class="small muted" style="margin-top:10px">Tip: add rent, loans and subscriptions as recurring payments (Budget → Spending) and they’ll show up here.</p>' : ''}</div>`;
}
function downloadIcs() {
  const t = todayDate(), end = F.addMonths(t, 12);
  const ev = calEvents(t, end);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escI = x => String(x).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YOKO!//Bill calendar//EN', 'CALSCALE:GREGORIAN'];
  ev.forEach((e, i) => {
    const d = e.date.replace(/-/g, ''), next = F.toISO(F.addDays(F.parseDate(e.date), 1)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:yoko-${d}-${i}@yoko.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escI(`${e.title}${e.amount ? ` (${fmt(e.amount)})` : ''}`)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  downloadFile('yoko-calendar.ics', lines.join('\r\n'), 'text/calendar');
  toast(`Downloaded ${plural(ev.length, 'date')} for the next 12 months. Open the file to add them to your calendar`, 4500);
}

