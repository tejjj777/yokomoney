/* YOKO! Student · XP and levels, roast mode, money weather.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* ---------- XP & levels ---------- */
function awardXP(n, why, quiet) {
  if (!(n > 0)) return;
  if (why === 'expense') {
    const d = state.meta.xpDay;
    if (d.date !== todayISO()) { d.date = todayISO(); d.n = 0; }
    if (d.n >= 10) return;   // XP for up to 10 expenses a day
    d.n++;
  }
  const before = F.levelFor(state.xp.total);
  state.xp.total += n;
  const after = F.levelFor(state.xp.total);
  if (after.index > before.index) {
    const grew = petStage(after.index) > petStage(before.index);
    setTimeout(() => { toast(`Level up! ${state.settings.petName} is level ${after.index + 1} (${after.name})${grew ? ' and just grew' : ''}`, 4500); confetti(); playSound('fanfare'); }, 350);
  }
  if (!quiet) { save(); scheduleRender(60); }
}

/* ---------- Roast mode ---------- */
const ROASTS = {
  nice: {
    splurge: ['Big one. Hope it was worth it.', 'That’s a decent chunk of the month.', 'Okay, treat yourself. Just not every day.'],
    wants: ['Noted.', 'Small stuff adds up, just saying.', 'Logged.'],
    needs: ['Boring, but it has to be paid.', 'Logged.', 'The usual.'],
    save: ['Nice.', 'Future you says thanks.', 'Good move.'],
    sunny: ['Looking good this month.', 'You’re on track. Keep going.', 'Doing fine so far.'],
    cloudy: ['Cutting it a bit close.', 'Should be fine if you ease off a little.', 'Right around the line.'],
    rain: ['Going a bit over. Maybe skip a couple of treats.', 'Slow down a little this week.', 'Heading over, but it’s still fixable.'],
    storm: ['This month’s going over. Time to cut back.', 'Way over pace. Pause the extras for a bit.', 'Rough month. Cutting even one thing helps.'],
    buyYes: ['You can afford it.', 'Go for it.'],
    buyWait: ['Give it 48 hours and see if you still want it.', 'Maybe. Wishlist it for now.'],
    buyNo: ['Not this month.', 'Probably not right now.']
  },
  savage: {
    splurge: ['Bold move for someone with goals.', 'Your savings account felt that one.', 'Main character purchase, side character budget.'],
    wants: ['Another small treat? Sure.', 'The wants category is eating good.', 'Death by a thousand card taps.'],
    needs: ['Congrats on paying to exist.', 'Rent: the subscription you can’t cancel.', 'Thrilling stuff.'],
    save: ['You saved money? Screenshotting this.', 'Look at you being responsible.', 'Fine. That was actually good.'],
    sunny: ['Suspiciously responsible this month.', 'Who are you and what did you do with the old you?', 'Sunny. Don’t ruin it.'],
    cloudy: ['One more takeout order and it rains.', 'Living on the edge, I see.', 'Close. Very close.'],
    rain: ['Your wallet is crying.', 'Spending a bit fast there, no?', 'It’s raining and you spent the umbrella money.'],
    storm: ['Your budget is on fire.', 'Category 5 overspend. Put the phone down.', 'Your bank account would like a word.'],
    buyYes: ['Fine. You can afford it.', 'The maths says yes, surprisingly.'],
    buyWait: ['Do you need it, or did Instagram tell you that?', 'Let it sit in the wishlist for a bit.'],
    buyNo: ['Absolutely not.', 'Put the card down.']
  }
};
function roastLine(kind, salt = '') {
  const pools = ROASTS[state.settings.roast];
  return pools ? pickDaily(pools[kind], kind + salt) : '';
}
function roastForExpense(amount, cat) {
  if (!cat) return '';
  const inc = monthlyIncome();
  if (cat.type === 'savings') return roastLine('save', String(amount));
  if (cat.type === 'wants') return roastLine(inc > 0 && amount / inc > 0.05 ? 'splurge' : 'wants', String(amount));
  return roastLine('needs', String(amount));
}

/* ---------- Money weather ---------- */
function weatherInfo() {
  const b = budgetTotals();
  if (!(b.income > 0) && !(b.planned > 0)) return null;
  const f = F.monthForecast({ today: todayDate(), needs: b.byType.needs, wants: b.byType.wants, savings: b.byType.savings, income: b.income });
  if (!(f.ref > 0)) return null;
  f.kind = f.ratio <= 0.9 ? 'sunny' : f.ratio <= 1 ? 'cloudy' : f.ratio <= 1.1 ? 'rain' : 'storm';
  return f;
}
function weatherCard() {
  const f = weatherInfo();
  if (!f) return '';
  const month = FULL_MONTHS[todayDate().getMonth()];
  const msg = f.diff >= 0 ? `At this pace you’ll finish ${month} with about <strong class="num">${fmt(f.diff)}</strong> left.`
    : `At this pace you’ll be <strong class="num">${fmt(-f.diff)}</strong> over by the end of ${month}.`;
  const r = roastLine(f.kind);
  return `<div class="weather weather-${f.kind} mb" id="weather" role="region" aria-label="Money weather">
    <span class="weather-icon" aria-hidden="true">${f.icon}</span>
    <div class="weather-body"><p class="weather-label">${f.label} <span class="muted small">· forecast for the rest of the month</span></p>
      <p class="weather-msg">${msg}</p>${r ? `<p class="small muted weather-roast">“${esc(r)}”</p>` : ''}</div></div>`;
}

