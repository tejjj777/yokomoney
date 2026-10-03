/* YOKO! Student · Money pet.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* ---------- Money pet ---------- */
function petMood() {
  if (!hasAnyData()) return 'sleepy';
  const f = weatherInfo(), sk = streakInfo();
  let score = 0;
  if (f) score += f.kind === 'sunny' ? 2 : f.kind === 'cloudy' ? 1 : f.kind === 'rain' ? -1 : -2;
  if (sk.current >= 3) score++;
  if (sk.current >= 7) score++;
  if (state.debts.some(d => d.defeatedAt && F.daysBetween(F.parseDate(d.defeatedAt), todayDate()) <= 7)) score++;
  return score >= 3 ? 'ecstatic' : score >= 1 ? 'happy' : score === 0 ? 'meh' : score === -1 ? 'worried' : 'sad';
}
const PET_LINES = {
  ecstatic: ['Best month ever!', 'We’re doing so well!!', 'I’m so happy right now.'],
  happy: ['Things are looking good.', 'I like it when you log stuff.', 'Nice work lately.'],
  meh: ['I’m okay.', 'Log something? I’m bored.', 'Could be better, could be worse.'],
  worried: ['Spending’s picking up…', 'Can we skip a treat this week?', 'I’m a bit nervous about month-end.'],
  sad: ['We’re going over budget :(', 'Can we cut something today?', 'Not a great month.'],
  sleepy: ['zzz… add your paycheck to wake me up', 'Nothing to do yet. zzz']
};
const PET_REACTIONS = {
  import: ['Imported transactions! Dashboard updated.', 'ecstatic'],
  'budget-ok': ['Under budget this month! Solid discipline.', 'happy'],
  'safe-red': ['Safe-to-spend is in the red. Time to slow down!', 'worried'],
  'afford-no': ['That one is out of budget. Let’s hold off.', 'sad'],
  'freeze-broken': ['Whoops! That was in your frozen category.', 'worried']
};
function triggerPetReaction(type, customText, opts = {}) {
  const preset = PET_REACTIONS[type] || [customText || 'Money check!', 'happy'];
  const text = customText || preset[0];
  const mood = preset[1];
  if (opts.dry) return { type, text, mood };   // self-tests: work out the reaction without showing it
  if (ui.petReactionTimer) {
    clearTimeout(ui.petReactionTimer);
    ui.petReactionTimer = null;
  }
  ui.petReaction = { type, text, mood, expiresAt: Date.now() + 4500 };
  const card = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pet-card') : null;
  if (card) {
    const say = card.querySelector('.pet-say');
    if (say) say.textContent = `“${text}”`;
    const svg = card.querySelector('.pet-svg');
    if (svg) {
      svg.classList.remove('boing');
      void svg.offsetWidth;
      svg.classList.add('boing');
    }
  }
  ui.petReactionTimer = setTimeout(() => {
    ui.petReaction = null;
    const c = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pet-card') : null;
    if (c) {
      const s = c.querySelector('.pet-say');
      if (s) {
        const m = petMood();
        s.textContent = '“' + pickDaily(PET_LINES[m], 'pet' + (ui.petPokes || 0)) + '”';
      }
    }
  }, 4500);
  return { type, text, mood };
}
function petSVG(mood, stage) {
  const eyes = {
    ecstatic: '<path d="M38 50q6-8 12 0M70 50q6-8 12 0" stroke="#0A0A0A" stroke-width="4" fill="none" stroke-linecap="round"/>',
    happy: '<circle cx="44" cy="50" r="5" fill="#0A0A0A"/><circle cx="76" cy="50" r="5" fill="#0A0A0A"/><circle cx="46" cy="48" r="1.6" fill="#fff"/><circle cx="78" cy="48" r="1.6" fill="#fff"/>',
    meh: '<path d="M38 51h12M70 51h12" stroke="#0A0A0A" stroke-width="4" stroke-linecap="round"/>',
    worried: '<circle cx="44" cy="52" r="5" fill="#0A0A0A"/><circle cx="76" cy="52" r="5" fill="#0A0A0A"/><path d="M36 40l14 4M84 40l-14 4" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round"/>',
    sad: '<circle cx="44" cy="52" r="5" fill="#0A0A0A"/><circle cx="76" cy="52" r="5" fill="#0A0A0A"/><path d="M84 58q3 8 0 10q-3-2 0-10z" fill="#6CC4FF"/>',
    sleepy: '<path d="M38 52q6 5 12 0M70 52q6 5 12 0" stroke="#0A0A0A" stroke-width="4" fill="none" stroke-linecap="round"/>'
  }[mood] || eyes.happy;
  const mouth = {
    ecstatic: '<path d="M46 64q14 16 28 0z" fill="#0A0A0A"/>',
    happy: '<path d="M48 66q12 10 24 0" stroke="#0A0A0A" stroke-width="4" fill="none" stroke-linecap="round"/>',
    meh: '<path d="M50 70h20" stroke="#0A0A0A" stroke-width="4" stroke-linecap="round"/>',
    worried: '<path d="M50 72q10-6 20 0" stroke="#0A0A0A" stroke-width="4" fill="none" stroke-linecap="round"/>',
    sad: '<path d="M48 74q12-10 24 0" stroke="#0A0A0A" stroke-width="4" fill="none" stroke-linecap="round"/>',
    sleepy: '<ellipse cx="60" cy="70" rx="5" ry="4" fill="#0A0A0A"/><text x="90" y="30" font-size="14" font-weight="700" fill="currentColor" font-family="Inter, sans-serif">z</text><text x="99" y="20" font-size="10" font-weight="700" fill="currentColor" font-family="Inter, sans-serif">z</text>'
  }[mood] || mouth.happy;
  const extra = [
    '<path d="M60 20q-2-10 6-14q2 8-6 14z" fill="var(--primary-dark)"/><path d="M60 20q-6-6-12-4q4 7 12 4z" fill="var(--primary-dark)"/>',   // sprout
    '<circle cx="34" cy="62" r="5" fill="#FF8FA3" opacity=".55"/><circle cx="86" cy="62" r="5" fill="#FF8FA3" opacity=".55"/>',               // blush
    '<path d="M28 34l-6-14 12 8zM92 34l6-14-12 8z" fill="var(--primary-dark)"/><circle cx="34" cy="62" r="5" fill="#FF8FA3" opacity=".55"/><circle cx="86" cy="62" r="5" fill="#FF8FA3" opacity=".55"/>',   // ears
    '<path d="M42 22l6-14 6 10 6-12 6 12 6-10 6 14z" fill="#F5C542" stroke="#B8860B" stroke-width="1.5"/><circle cx="34" cy="62" r="5" fill="#FF8FA3" opacity=".55"/><circle cx="86" cy="62" r="5" fill="#FF8FA3" opacity=".55"/>'   // crown
  ][stage] || '';
  const scale = [0.78, 0.88, 0.96, 1][stage] || 1;
  return `<svg class="pet-svg pet-${mood}" viewBox="0 0 120 110" width="120" height="110" role="img" aria-label="${esc(state.settings.petName)} looks ${mood}">
    <g transform="translate(60 100) scale(${scale}) translate(-60 -100)">
      <ellipse cx="60" cy="102" rx="34" ry="5" fill="#000" opacity=".35"/>
      <path class="pet-body" d="M60 18c26 0 42 20 42 46c0 24-16 36-42 36S18 88 18 64C18 38 34 18 60 18z" fill="var(--primary)"/>
      ${extra}${eyes}${mouth}</g></svg>`;
}
const petStage = idx => (idx >= 6 ? 3 : idx >= 4 ? 2 : idx >= 2 ? 1 : 0);
const STAGE_NOTE = ['gets rosy cheeks at level 3', 'grows ears at level 5', 'gets a crown at level 7', 'has earned its crown'];
function petCard() {
  const baseMood = petMood();
  const reaction = ui.petReaction && ui.petReaction.expiresAt > Date.now() ? ui.petReaction : null;
  const mood = reaction ? reaction.mood : baseMood;
  const lv = F.levelFor(state.xp.total);
  const stage = petStage(lv.index);
  const line = reaction ? reaction.text : pickDaily(PET_LINES[mood], 'pet' + (ui.petPokes || 0));
  const earned = BADGES.filter(b => state.badges[b.id]).length;
  const tricks = BADGES.map(b => { const d = state.badges[b.id];
    return `<li class="trick ${d ? 'is-earned' : ''}"><span aria-hidden="true">${d ? b.icon : '🔒'}</span><span><strong>${esc(b.name)}</strong><span class="sr-only">${d ? ' (learned)' : ' (not yet)'}</span><br><span class="small muted">${esc(b.desc)}</span></span></li>`; }).join('');
  return `<div class="card pet-card" id="pet-card">
    <button type="button" class="pet-btn" data-action="pet-poke" aria-label="Poke ${esc(state.settings.petName)}">${petSVG(mood, stage)}</button>
    <div class="pet-info"><p class="pet-say" aria-live="polite">“${esc(line)}”</p>
      <h2>${esc(state.settings.petName)} <span class="muted small" style="font-weight:500">· your pet</span></h2>
      <p class="small"><strong>Level ${lv.index + 1} · ${lv.name}</strong> <span class="muted">· ${Math.round(state.xp.total).toLocaleString()} XP</span></p>
      <div class="progress pet-xp" role="progressbar" aria-label="XP to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lv.progress * 100)}"><span style="width:${lv.progress * 100}%"></span></div>
      <p class="small muted">${lv.next ? `${(lv.next - state.xp.total).toLocaleString()} XP until ${F.LEVELS[lv.index + 1][1]}.` : 'Max level.'} XP comes from logging, saving, paying off debt and learning tricks. ${esc(state.settings.petName)} ${STAGE_NOTE[stage]}.</p>
      <details class="collapsible pet-tricks" data-open-key="pet-tricks" ${openAttr('pet-tricks')}><summary>Tricks learned (${earned} of ${BADGES.length})</summary><div class="details-body"><ul class="trick-list">${tricks}</ul></div></details></div></div>`;
}

