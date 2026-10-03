/* YOKO! Student · Account and end-to-end encrypted sync (Supabase).
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   ACCOUNT AND SYNC (end-to-end encrypted)
   The app data is locked on this device with a random data key. That key is
   locked with the person's passphrase, and separately with a recovery key.
   Supabase only ever stores the locked copies, so nobody there can read them.
   ========================================================= */
const SYNC_URL = 'https://qmcwczyqhymyoesfsrzh.supabase.co';
const SYNC_KEY = 'sb_publishable_En_KZiJEJsgSe1DC79aMOg_GU59JTUk';   // publishable key: meant to be public; rows are guarded by row-level security
const ACC_KEY = 'yoko.student.account', CLASH_KEY = 'yoko.student.sync-clash';
const KDF_ITER = 600000;   // PBKDF2-SHA256 rounds (OWASP's recommendation)
const Sync = { acc: null, timer: null, busy: false, again: false, started: false, applying: false, status: '', err: '', refreshing: null, wasSample: false };
try { Sync.acc = JSON.parse(localStorage.getItem(ACC_KEY)) || null; } catch (e) { Sync.acc = null; }
function saveAcc() { try { if (Sync.acc) localStorage.setItem(ACC_KEY, JSON.stringify(Sync.acc)); else localStorage.removeItem(ACC_KEY); } catch (e) { /* storage blocked */ } }
const canCrypto = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
const syncReady = () => !!(Sync.acc && Sync.acc.uid && Sync.acc.refresh && Sync.acc.dek && !Sync.acc.setup);

/* ---------- Crypto helpers ---------- */
const TXT_E = new TextEncoder(), TXT_D = new TextDecoder();
const sb64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const sunb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const srand = n => crypto.getRandomValues(new Uint8Array(n));
async function kdfKey(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', TXT_E.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, bytes) {
  const iv = srand(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return sb64(out);
}
async function unseal(key, text) { const all = sunb64(text); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12))); }
const dataKey = b64 => crypto.subtle.importKey('raw', sunb64(b64), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function gz(bytes, out) {
  const S = out ? window.CompressionStream : window.DecompressionStream;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new S('gzip'))).arrayBuffer());
}
async function lockData(json, dek) {
  const raw = TXT_E.encode(json), z = window.CompressionStream ? await gz(raw, true) : null;
  return JSON.stringify({ v: 1, z: z ? 1 : 0, c: await seal(await dataKey(dek), z || raw) });
}
async function unlockData(text, dek) {
  const env = JSON.parse(text);
  let bytes = await unseal(await dataKey(dek), env.c);
  if (env.z) bytes = await gz(bytes, false);
  return JSON.parse(TXT_D.decode(bytes));
}
/** Short fingerprint of the data, so a save that changed nothing isn't uploaded. */
function syncHash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + str.length; }
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function makeRecoveryKey() {
  let bits = '', out = '';
  srand(20).forEach(x => { bits += x.toString(2).padStart(8, '0'); });
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-');
}
const cleanRecovery = s => String(s || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
async function newVaultKeys(pass) {
  const dek = srand(32), salt = srand(16), rsalt = srand(16), recovery = makeRecoveryKey();
  return {
    dek: sb64(dek), recovery,
    fields: { kdf: { salt: sb64(salt), rsalt: sb64(rsalt), iter: KDF_ITER }, key_pass: await seal(await kdfKey(pass, salt, KDF_ITER), dek), key_recovery: await seal(await kdfKey(cleanRecovery(recovery), rsalt, 1000), dek) }
  };
}
async function openWithPass(row, pass) { return sb64(await unseal(await kdfKey(pass, sunb64(row.kdf.salt), row.kdf.iter || KDF_ITER), row.key_pass)); }
async function openWithRecovery(row, rec) { return sb64(await unseal(await kdfKey(cleanRecovery(rec), sunb64(row.kdf.rsalt), 1000), row.key_recovery)); }
async function passFields(dek, pass, kdfOld) { const salt = srand(16); return { kdf: Object.assign({}, kdfOld, { salt: sb64(salt), iter: KDF_ITER }), key_pass: await seal(await kdfKey(pass, salt, KDF_ITER), sunb64(dek)) }; }
async function recoveryFields(dek, kdfOld) { const rsalt = srand(16), recovery = makeRecoveryKey(); return { recovery, fields: { kdf: Object.assign({}, kdfOld, { rsalt: sb64(rsalt) }), key_recovery: await seal(await kdfKey(cleanRecovery(recovery), rsalt, 1000), sunb64(dek)) } }; }

/* ---------- Talking to Supabase ---------- */
async function sbCall(path, { method = 'GET', body, auth = true, prefer } = {}) {
  const h = { apikey: SYNC_KEY, 'Content-Type': 'application/json' };
  if (auth) h.Authorization = 'Bearer ' + await accessToken();
  if (prefer) h.Prefer = prefer;
  let res;
  try { res = await fetch(SYNC_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw Object.assign(new Error('offline'), { offline: true }); }
  const txt = await res.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!res.ok) throw Object.assign(new Error((data && (data.msg || data.message || data.error_description || data.error)) || `Error ${res.status}`), { status: res.status, code: data && (data.error_code || data.code) });
  return data;
}
function setSession(s) {
  Object.assign(Sync.acc, { access: s.access_token, refresh: s.refresh_token, expiresAt: Date.now() + (s.expires_in || 3600) * 1000 });
  if (s.user) Object.assign(Sync.acc, { uid: s.user.id, email: s.user.email || Sync.acc.email });
  saveAcc();
}
async function accessToken() {
  const a = Sync.acc;
  if (!a || !a.refresh) throw Object.assign(new Error('Signed out'), { signedOut: true });
  if (a.access && a.expiresAt - 60000 > Date.now()) return a.access;
  if (!Sync.refreshing) {
    Sync.refreshing = sbCall('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: a.refresh } })
      .then(s => { setSession(s); return s.access_token; })
      .catch(e => { if (!e.offline && (e.status === 400 || e.status === 401 || e.status === 403)) { a.refresh = ''; a.access = ''; saveAcc(); e.signedOut = true; } throw e; })
      .finally(() => { Sync.refreshing = null; });
  }
  return Sync.refreshing;
}
const vaultURL = q => `/rest/v1/vaults?user_id=eq.${encodeURIComponent(Sync.acc.uid)}${q || ''}`;
async function getVault(sel = '*') { const r = await sbCall(vaultURL(`&select=${sel}`)); return (r && r[0]) || null; }
const updateVault = fields => sbCall(vaultURL(), { method: 'PATCH', prefer: 'return=representation', body: fields });
function deviceName() {
  const u = navigator.userAgent;
  return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Browser';
}

/* ---------- Sync engine ---------- */
function freshStateLike() {
  const s = defaultState();
  s.currency = state.currency; s.settings.country = state.settings.country; s.wallet.taxYearStart = countryInfo(state.settings.country).fy;
  Object.assign(s.meta, { tourDone: true, tourVersion: TOUR_VERSION });
  return s;
}
/** Called after every local save. */
function syncOnSave() {
  if (Sync.applying || !Sync.acc) return;
  const sample = !!state.meta.isSample;
  if (Sync.wasSample && !sample && syncReady()) {   // sample removed: bring the account's data back instead of uploading an empty start
    Sync.wasSample = false; Sync.acc.version = -1; Sync.acc.dirty = false; saveAcc(); queueSync(300); return;
  }
  Sync.wasSample = sample;
  if (!syncReady() || sample || !Sync.started) return;   // saves made while opening are checked once the first sync is done
  if (syncHash(JSON.stringify(state)) === Sync.acc.syncedHash) return;   // nothing really changed
  Sync.acc.dirty = true; Sync.acc.editedAt = Date.now(); saveAcc();
  queueSync(2500);
}
function queueSync(ms) { clearTimeout(Sync.timer); Sync.timer = setTimeout(() => syncNow(false), ms); }
function parkCopy(obj, why) { try { localStorage.setItem(CLASH_KEY, JSON.stringify({ at: Date.now(), why, data: obj })); } catch (e) { /* too big or blocked */ } }
function parkedCopy() { try { return JSON.parse(localStorage.getItem(CLASH_KEY)); } catch (e) { return null; } }
function applyRemote(remote, row) {
  const keep = { tourDone: state.meta.tourDone, tourVersion: state.meta.tourVersion, tourChapters: state.meta.tourChapters };
  Sync.applying = true;
  try {
    state = normalizeState(remote);
    Object.assign(state.meta, { tourDone: keep.tourDone || state.meta.tourDone, tourVersion: Math.max(keep.tourVersion || 0, state.meta.tourVersion || 0), tourChapters: Object.assign({}, state.meta.tourChapters, keep.tourChapters) });
    save();
  } finally { Sync.applying = false; }
  Sync.wasSample = !!state.meta.isSample;
  Object.assign(Sync.acc, { version: row.version, dirty: false, lastSync: Date.now(), lastDevice: row.device || '', syncedHash: syncHash(JSON.stringify(state)) });
  saveAcc();
  applyTheme(); applyPrivacy(); applyCountry();
  const was = Sync.started; Sync.started = true;
  dailyTick();   // if this changes anything (a new month, a bill due) it's uploaded once
  Sync.started = was;
  render();
}
async function syncPull(force) {
  const a = Sync.acc;
  const head = await getVault('version,updated_at');
  if (!head) { accountGone(); return; }
  if (head.version === a.version && !force) return;
  const row = await getVault('*');
  if (!row) { accountGone(); return; }
  const remote = await unlockData(row.data, a.dek);
  if (a.dirty && !state.meta.isSample) {
    if (Date.parse(row.updated_at) > (a.editedAt || 0)) {   // the other device saved later: keep theirs, park ours
      parkCopy(JSON.parse(JSON.stringify(state)), 'this device');
      applyRemote(remote, row);
      toast('This device and another one both changed things. The newest copy is kept. The other is saved under Settings → Account.', 7000);
    } else {   // ours is newer: park theirs and upload ours
      parkCopy(remote, row.device || 'another device');
      a.version = row.version; saveAcc();
      toast('This device and another one both changed things. The newest copy is kept. The other is saved under Settings → Account.', 7000);
    }
    return;
  }
  applyRemote(remote, row);
  if (Sync.started && remote) toast('Updated from your other device');
}
async function syncPush() {
  const a = Sync.acc;
  if (!a.dirty || state.meta.isSample) return;
  const t0 = a.editedAt, json = JSON.stringify(state);
  const rows = await sbCall(vaultURL(`&version=eq.${a.version}`), { method: 'PATCH', prefer: 'return=representation', body: { data: await lockData(json, a.dek), version: a.version + 1, device: deviceName() } });
  if (!rows || !rows.length) { await syncPull(true); if (a.dirty) return syncPush(); return; }   // another device saved first
  Object.assign(a, { version: rows[0].version, lastSync: Date.now(), syncedHash: syncHash(json), dirty: a.editedAt !== t0 }); saveAcc();
}
async function syncNow(manual) {
  if (!syncReady() || !canCrypto()) return false;
  if (Sync.busy) { Sync.again = true; return false; }
  Sync.busy = true; Sync.status = 'syncing'; refreshSyncUI();
  let ok = false;
  try {
    await syncPull(false);
    if (Sync.acc && syncReady()) await syncPush();
    Sync.status = 'ok'; Sync.err = ''; ok = true;
    if (manual) toast('Synced');
  } catch (e) { syncFailed(e, manual); }
  finally {
    Sync.busy = false; refreshSyncUI();
    if (Sync.again) { Sync.again = false; queueSync(400); }
  }
  return ok;
}
function syncFailed(e, manual) {
  if (e.offline) { Sync.status = 'offline'; if (manual) toast('You’re offline. It’ll sync when you’re back online.'); return; }
  if (e.signedOut) { Sync.status = 'signedout'; toast('Your sign-in ran out. Sign in again under Settings → Account to keep syncing.', 6000); return; }
  const was = Sync.status;
  Sync.status = 'error'; Sync.err = e.name === 'OperationError' ? 'The synced data couldn’t be unlocked on this device.' : e.message;
  if (manual || was !== 'error') toast(`Couldn’t sync: ${Sync.err}`, 5000);
}
function accountGone() {
  Sync.acc = null; saveAcc(); Sync.status = '';
  toast('This account was deleted, so sync is off. Your data is still on this device.', 6000);
  refreshSyncUI();
}
async function startSync() {
  if (!Sync.acc || !canCrypto()) { Sync.started = true; return; }
  Sync.wasSample = !!state.meta.isSample;
  if (syncReady()) await syncNow(false);
  Sync.started = true;
  // anything that changed while opening (a new month, bills that came due) goes up now
  if (syncReady() && !state.meta.isSample && syncHash(JSON.stringify(state)) !== Sync.acc.syncedHash) { Sync.acc.dirty = true; Sync.acc.editedAt = Sync.acc.editedAt || Date.now(); saveAcc(); }
  if (syncReady() && Sync.acc.dirty) queueSync(500);
}
function bindSync() {
  addEventListener('hashchange', () => {   // link opened in a tab that already had YOKO! open
    const p = takeAuthFromURL(); if (!p) return;
    closeModal(true); render(); finishLinkSignIn(p);
  });
  addEventListener('storage', e => {   // signed in from the email link in another tab
    if (e.key !== ACC_KEY) return;
    try { Sync.acc = JSON.parse(e.newValue) || null; } catch (er) { Sync.acc = null; }
    refreshSyncUI();
    const t = document.getElementById('modal-title');
    if (t && t.textContent === 'Check your email' && Sync.acc && Sync.acc.uid) { closeModal(true); toast('Signed in from the email link in your other tab'); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Sync.started) queueSync(300); else if (document.visibilityState === 'hidden' && syncReady() && Sync.acc.dirty) syncNow(false); });
  addEventListener('online', () => { if (Sync.started) queueSync(300); });
  setInterval(() => { if (document.visibilityState === 'visible' && Sync.started && !Sync.busy) syncNow(false); }, 120000);
}

/* ---------- Settings → Account ---------- */
function syncAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(new Date(t));
}
function syncStatusText() {
  const a = Sync.acc;
  if (Sync.busy) return 'Syncing…';
  if (state.meta.isSample) return 'Sample data isn’t synced. Remove it to get your synced data back.';
  if (Sync.status === 'offline') return 'Offline. It’ll sync when you’re back online.';
  if (Sync.status === 'error') return `Couldn’t sync: ${esc(Sync.err)}`;
  if (a.dirty) return 'Changes waiting to sync';
  return a.lastSync ? `Synced ${syncAgo(a.lastSync)}` : 'Not synced yet';
}
function accountPanelInner() {
  const a = Sync.acc;
  if (!canCrypto()) return '<p class="small muted">Sync works when YOKO! is opened from its website (https), not from a saved file.</p>';
  if (!a || !a.uid) return `<p class="small muted">Use YOKO! on your phone and computer. Your data is locked with your passphrase before it leaves this device, so nobody else can read it, not even us.</p>
    <div class="row"><button type="button" class="btn btn-primary" data-action="sync-signin">Sign in or make an account</button></div>`;
  const who = `<p>Signed in as <strong>${esc(a.email || '')}</strong></p>`;
  if (!a.refresh) return `${who}<p class="small muted">Your sign-in ran out. Sign in again to keep syncing.</p><div class="row"><button type="button" class="btn btn-primary" data-action="sync-signin">Sign in again</button><button type="button" class="btn" data-action="sync-signout">Sign out</button></div>`;
  if (a.setup || !a.dek) return `${who}<p class="small muted">One more step to finish turning on sync.</p><div class="row"><button type="button" class="btn btn-primary" data-action="sync-finish">Finish setting up</button><button type="button" class="btn" data-action="sync-signout">Sign out</button></div>`;
  const pc = parkedCopy();
  return `${who}<p class="small muted" id="sync-status">${syncStatusText()}</p>
    <div class="row"><button type="button" class="btn" data-action="sync-now">Sync now</button><button type="button" class="btn" data-action="sync-signout">Sign out</button></div>
    <p class="small" style="margin-top:10px"><button type="button" class="linklike" data-action="sync-passphrase">Change passphrase</button> · <button type="button" class="linklike" data-action="sync-recovery">New recovery key</button> · <button type="button" class="linklike" data-action="sync-delete">Delete account</button></p>
    ${pc ? `<p class="small muted" style="margin-top:10px">A copy from ${esc(pc.why || 'another device')} was set aside on ${fmtDate(new Date(pc.at))} when two devices clashed. <button type="button" class="linklike" data-action="sync-clash">Use that copy</button></p>` : ''}`;
}
function accountGroupHTML() { return `<div class="settings-group"><h3>Sync across devices</h3><div id="sync-panel">${accountPanelInner()}</div></div>`; }
function refreshSyncUI() { const el = document.getElementById('sync-panel'); if (el) el.innerHTML = accountPanelInner(); }

/* ---------- Sign-in and setup screens ---------- */
function fieldErr(form, id, msg) { const e = form.querySelector('#' + id); if (e) e.textContent = msg || ''; }
function busyBtn(form, label) {
  const b = form.querySelector('button[type=submit]'), old = b.textContent;
  b.disabled = true; b.textContent = label;
  return () => { b.disabled = false; b.textContent = old; };
}
function authErrText(e, what) {
  if (e.offline) return 'You’re offline. Connect and try again.';
  if (e.status === 429 || /rate limit|security purposes/i.test(e.message)) return what === 'send' ? 'Too many codes asked for. Wait a minute, then try again.' : 'Too many tries. Wait a minute, then try again.';
  if (what === 'verify' && (e.status === 403 || e.status === 400 || /expired|invalid/i.test(e.message))) return 'That code didn’t work. Check it, or send a new one.';
  return e.message || 'Something went wrong. Try again.';
}
const sendSignInEmail = email => sbCall('/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', auth: false, body: { email, create_user: true } });
function syncSignIn(prefill) {
  if (!canCrypto()) { toast('Sync works when YOKO! is opened from its website (https), not from a saved file.', 5000); return; }
  openModal({
    title: 'Sync across devices', submitLabel: 'Email me a link',
    body: `<p>Sign in with your email to use YOKO! on any device. New here? This makes your account. We’ll email you a sign-in link.</p>
      <p class="small muted">Your data is locked with a passphrase on this device before it’s sent. Nobody else can read it, not even us.</p>
      <div class="field"><label for="acc-email">Email</label><input id="acc-email" class="input" type="email" inputmode="email" autocomplete="email" maxlength="200" value="${esc(prefill || (Sync.acc && Sync.acc.email) || '')}" aria-describedby="acc-email-err"></div>
      <p class="field-error" id="acc-email-err"></p>`,
    onSubmit: form => {
      const email = form.querySelector('#acc-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldErr(form, 'acc-email-err', 'Enter a valid email.'); return false; }
      const done = busyBtn(form, 'Sending…');
      sendSignInEmail(email)
        .then(() => syncCodeStep(email))
        .catch(e => { done(); fieldErr(form, 'acc-email-err', authErrText(e, 'send')); });
      return false;
    }
  });
}
function syncCodeStep(email) {
  openModal({
    title: 'Check your email', submitLabel: 'Sign in', cancelLabel: 'Close',
    body: `<p>We sent a sign-in link to <strong>${esc(email)}</strong>. Open it on this device to finish. It can take a minute, so check spam too.</p>
      <div id="acc-code-wrap" hidden><div class="field"><label for="acc-code">Code from the email</label><input id="acc-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" aria-describedby="acc-code-err"></div></div>
      <p class="field-error" id="acc-code-err"></p>
      <p class="small"><button type="button" class="linklike" id="acc-resend">Send it again</button> · <button type="button" class="linklike" id="acc-other">Use a different email</button> · <button type="button" class="linklike" id="acc-has-code">I got a code</button></p>`,
    onMount: form => {
      const sub = form.querySelector('button[type=submit]'); sub.hidden = true;
      form.querySelector('#acc-has-code').addEventListener('click', e => { form.querySelector('#acc-code-wrap').hidden = false; sub.hidden = false; e.target.hidden = true; form.querySelector('#acc-code').focus(); });
      form.querySelector('#acc-other').addEventListener('click', () => syncSignIn(email));
      form.querySelector('#acc-resend').addEventListener('click', e => {
        e.target.disabled = true;
        sendSignInEmail(email)
          .then(() => fieldErr(form, 'acc-code-err', 'Sent again.'))
          .catch(er => fieldErr(form, 'acc-code-err', authErrText(er, 'send')))
          .finally(() => setTimeout(() => { e.target.disabled = false; }, 60000));
      });
    },
    onSubmit: form => {
      const token = form.querySelector('#acc-code').value.replace(/\D/g, '');
      if (token.length < 6) { fieldErr(form, 'acc-code-err', 'Enter the code from the email.'); return false; }
      const done = busyBtn(form, 'Checking…');
      sbCall('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token } })
        .then(s => afterSignIn(s, form, done))
        .catch(e => { done(); fieldErr(form, 'acc-code-err', authErrText(e, 'verify')); });
      return false;
    }
  });
}
/** Signed in (by code or by email link): resume sync, or set up / unlock the vault. */
async function afterSignIn(s, form, done) {
  const prev = Sync.acc;
  const same = !!(prev && s.user && prev.uid === s.user.id);
  Sync.acc = same ? prev : { email: (s.user && s.user.email) || '', uid: '', dek: '', version: 0, dirty: false };
  Sync.acc.setup = same && prev.dek && !prev.setup ? '' : (same && prev.setup) || 'unlock';
  setSession(s);
  if (!Sync.acc.setup) { if (done) done(); closeModal(true); Sync.status = ''; syncNow(false); toast('Signed in. Sync is back on'); return; }
  await syncFinish(form, done);
}
/** Opening the link in the sign-in email lands here with the session in the address. */
function takeAuthFromURL() {
  const h = location.hash.replace(/^#/, ''), q = location.search.replace(/^\?/, '');
  const hp = new URLSearchParams(h), qp = new URLSearchParams(q);
  const get = k => hp.get(k) || qp.get(k);
  if (!get('access_token') && !get('error_code') && !(get('error') && /access_denied|otp|link/i.test(get('error') + get('error_description')))) return null;
  const out = { access_token: get('access_token'), refresh_token: get('refresh_token'), expires_in: Number(get('expires_in')) || 3600, error: get('error_code') || get('error'), desc: get('error_description') };
  history.replaceState(null, '', location.pathname + '#dashboard');   // keep tokens out of the address bar and history
  return out;
}
async function finishLinkSignIn(p) {
  if (p.error || !p.access_token || !p.refresh_token) {
    toast(/expired|otp_expired|invalid/i.test(`${p.error} ${p.desc}`) ? 'That sign-in link expired or was already used. Ask for a new one under Settings → Account.' : `Sign-in didn’t work: ${p.desc || p.error}`, 7000);
    return;
  }
  if (!canCrypto()) { toast('Sync works when YOKO! is opened from its website (https).'); return; }
  try {
    const res = await fetch(SYNC_URL + '/auth/v1/user', { headers: { apikey: SYNC_KEY, Authorization: 'Bearer ' + p.access_token } });
    if (!res.ok) throw new Error('That sign-in link didn’t work. Ask for a new one.');
    await afterSignIn({ access_token: p.access_token, refresh_token: p.refresh_token, expires_in: p.expires_in, user: await res.json() });
  } catch (e) { toast(e.offline || e instanceof TypeError ? 'You’re offline. Connect and open the link again.' : e.message, 6000); }
}
/** After sign-in: make the vault, or unlock the one that's there. */
async function syncFinish(form, done) {
  let row;
  try { row = await getVault('*'); }
  catch (e) { if (done) done(); if (form) fieldErr(form, form.querySelector('#acc-code-err') ? 'acc-code-err' : 'acc-err', authErrText(e)); else toast(`Couldn’t reach your account: ${authErrText(e)}`); return; }
  if (!row) syncNewPassphrase();
  else if (Sync.acc.dek) { try { syncChoose(row, await unlockData(row.data, Sync.acc.dek)); } catch (e) { Sync.acc.dek = ''; saveAcc(); syncUnlock(row); } }
  else syncUnlock(row);
}
const passFieldsHTML = (lead) => `<div class="field"><label for="acc-p1">${lead}</label><input id="acc-p1" class="input" type="password" autocomplete="new-password" maxlength="200"></div>
  <div class="field"><label for="acc-p2">Type it again</label><input id="acc-p2" class="input" type="password" autocomplete="new-password" maxlength="200"></div>`;
function readNewPass(form) {
  const p1 = form.querySelector('#acc-p1').value, p2 = form.querySelector('#acc-p2').value;
  if (p1.length < 8) return { error: 'Use at least 8 characters. A few random words works well.' };
  if (p1 !== p2) return { error: 'Those don’t match.' };
  return { value: p1 };
}
function syncNewPassphrase() {
  openModal({
    title: 'Make a passphrase', submitLabel: 'Turn on sync',
    body: `<p>It locks your data before it leaves this device. You’ll type it once on each new device.</p>
      ${passFieldsHTML('Passphrase')}<p class="field-error" id="acc-err"></p>
      <p class="small muted">Try 3 or 4 random words. If you forget it and lose your recovery key, your synced data can’t be opened, not even by us.</p>`,
    onSubmit: form => {
      const p = readNewPass(form);
      if (p.error) { fieldErr(form, 'acc-err', p.error); return false; }
      const done = busyBtn(form, 'Locking…');
      (async () => {
        const k = await newVaultKeys(p.value);
        const json = JSON.stringify(state.meta.isSample ? freshStateLike() : state);
        const rows = await sbCall('/rest/v1/vaults', { method: 'POST', prefer: 'return=representation', body: Object.assign({ user_id: Sync.acc.uid, data: await lockData(json, k.dek), version: 1, device: deviceName() }, k.fields) });
        Object.assign(Sync.acc, { dek: k.dek, setup: '', version: (rows && rows[0] && rows[0].version) || 1, dirty: false, lastSync: Date.now(), syncedHash: syncHash(json) });
        saveAcc(); Sync.status = 'ok'; Sync.started = true;
        syncShowRecovery(k.recovery, true);
      })().catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
function syncShowRecovery(code, first) {
  openModal({
    title: 'Save your recovery key', submitLabel: 'Done', cancelLabel: 'Close',
    body: `<p>If you forget your passphrase, this key is the only way back into your synced data. Keep it somewhere safe, away from this device.</p>
      <p class="recovery-key" id="acc-rk">${code.split('-').map(g => `<span>${g}</span>`).join('-')}</p>
      <div class="row"><button type="button" class="btn btn-sm" id="acc-rk-copy">Copy</button><button type="button" class="btn btn-sm" id="acc-rk-dl">${ICON.download}<span>Download</span></button></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="acc-rk-ok"> I’ve saved my recovery key</label><p class="field-error" id="acc-err"></p>`,
    onMount: form => {
      form.querySelector('#acc-rk-copy').addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast('Copied')).catch(() => toast('Couldn’t copy. Write it down instead.')); });
      form.querySelector('#acc-rk-dl').addEventListener('click', () => downloadFile('yoko-recovery-key.txt', `YOKO! recovery key\r\nAccount: ${Sync.acc.email}\r\nKey: ${code}\r\nMade: ${todayISO()}\r\n\r\nKeep this safe. With your email, it opens your synced data if you forget your passphrase.\r\n`, 'text/plain'));
    },
    onSubmit: form => {
      if (!form.querySelector('#acc-rk-ok').checked) { fieldErr(form, 'acc-err', 'Save it first, then tick the box.'); return false; }
      toast(first ? 'Sync is on. Sign in on your other devices with the same email' : 'New recovery key saved. The old one no longer works', 5000);
      refreshSyncUI();
      if (first && !hasAnyData()) setTimeout(showOnboarding, 300);   // brand-new account on an empty device: set up the budget next
      return true;
    }
  });
}
function syncUnlock(row) {
  openModal({
    title: 'Unlock your data', submitLabel: 'Unlock',
    body: `<p>Type the passphrase you made when you turned on sync.</p>
      <div class="field"><label for="acc-pass">Passphrase</label><input id="acc-pass" class="input" type="password" autocomplete="current-password" maxlength="200"></div>
      <p class="field-error" id="acc-err"></p>
      <p class="small">Forgot it? <button type="button" class="linklike" id="acc-use-rk">Use your recovery key</button></p>`,
    onMount: form => form.querySelector('#acc-use-rk').addEventListener('click', () => syncRecover(row)),
    onSubmit: form => {
      const pass = form.querySelector('#acc-pass').value;
      if (!pass) { fieldErr(form, 'acc-err', 'Type your passphrase.'); return false; }
      const done = busyBtn(form, 'Unlocking…');
      (async () => {
        let dek;
        try { dek = await openWithPass(row, pass); } catch (e) { done(); fieldErr(form, 'acc-err', 'That passphrase didn’t work.'); return; }
        Sync.acc.dek = dek; saveAcc();
        syncChoose(row, await unlockData(row.data, dek));
      })().catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
function syncRecover(row) {
  openModal({
    title: 'Use your recovery key', submitLabel: 'Unlock',
    body: `<div class="field"><label for="acc-rk-in">Recovery key</label><input id="acc-rk-in" class="input" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="80" placeholder="XXXX-XXXX-XXXX-…"></div>
      <p class="small muted">Then pick a new passphrase.</p>${passFieldsHTML('New passphrase')}<p class="field-error" id="acc-err"></p>`,
    onSubmit: form => {
      const rk = form.querySelector('#acc-rk-in').value;
      if (cleanRecovery(rk).length !== 32) { fieldErr(form, 'acc-err', 'A recovery key has 32 letters and numbers.'); return false; }
      const p = readNewPass(form);
      if (p.error) { fieldErr(form, 'acc-err', p.error); return false; }
      const done = busyBtn(form, 'Unlocking…');
      (async () => {
        let dek;
        try { dek = await openWithRecovery(row, rk); } catch (e) { done(); fieldErr(form, 'acc-err', 'That recovery key didn’t work.'); return; }
        await updateVault(await passFields(dek, p.value, row.kdf));
        Sync.acc.dek = dek; saveAcc();
        toast('New passphrase saved');
        syncChoose(row, await unlockData(row.data, dek));
      })().catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
/** Both this device and the account have data: let the person pick. Nothing is thrown away. */
function syncChoose(row, remote) {
  const finish = (useAccount) => {
    Sync.acc.setup = ''; Sync.started = true;
    if (useAccount) { if (hasAnyData() && !state.meta.isSample) parkCopy(JSON.parse(JSON.stringify(state)), 'this device'); applyRemote(remote, row); }
    else { parkCopy(remote, row.device || 'your account'); Object.assign(Sync.acc, { version: row.version, dirty: true, editedAt: Date.now() }); saveAcc(); queueSync(200); }
    closeModal(true); Sync.status = 'ok'; refreshSyncUI();
    toast('Signed in. Your data is synced', 4000);
  };
  if (!hasAnyData() || state.meta.isSample) { finish(true); return; }
  Sync.acc.setup = 'choose'; saveAcc();
  openModal({
    title: 'Which data should YOKO! use?', hideSubmit: true, cancelLabel: 'Decide later',
    body: `<p>This device already has data, and so does your account.</p>
      <div class="welcome-actions"><button type="button" class="btn btn-primary" id="acc-use-acct">Use my account’s data</button><button type="button" class="btn" id="acc-use-here">Use this device’s data</button></div>
      <p class="small muted">The one you don’t pick is set aside on this device. You can switch to it later under Settings → Account.</p>`,
    onMount: form => {
      form.querySelector('#acc-use-acct').addEventListener('click', () => finish(true));
      form.querySelector('#acc-use-here').addEventListener('click', () => finish(false));
    }
  });
}
function syncSignOut() {
  openModal({
    title: 'Sign out', submitLabel: 'Sign out',
    body: `<p>Sync stops on this device. Your account and synced data stay safe for your other devices.</p>
      <label class="check"><input type="checkbox" id="acc-wipe"> Also remove my data from this device</label><p class="field-error" id="acc-err"></p>`,
    onSubmit: form => {
      const wipe = form.querySelector('#acc-wipe').checked, done = busyBtn(form, 'Signing out…');
      (async () => {
        if (syncReady() && Sync.acc.dirty) await syncNow(false);
        try { await sbCall('/auth/v1/logout?scope=local', { method: 'POST' }); } catch (e) { /* signing out locally is enough */ }
        Sync.acc = null; saveAcc(); Sync.status = '';
        try { localStorage.removeItem(CLASH_KEY); } catch (e) { /* ignore */ }
        if (wipe) { state = freshStateLike(); }
        closeModal(true); commit();
        toast(wipe ? 'Signed out and removed from this device' : 'Signed out. Your data stays on this device');
        if (wipe) setTimeout(showOnboarding, 60);
      })().catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
function syncChangePassphrase() {
  openModal({
    title: 'Change passphrase', submitLabel: 'Save',
    body: `<p class="small muted">Use the new one on any new device. Devices already signed in keep working.</p>${passFieldsHTML('New passphrase')}<p class="field-error" id="acc-err"></p>`,
    onSubmit: form => {
      const p = readNewPass(form);
      if (p.error) { fieldErr(form, 'acc-err', p.error); return false; }
      const done = busyBtn(form, 'Saving…');
      (async () => {
        const row = await getVault('kdf');
        await updateVault(await passFields(Sync.acc.dek, p.value, row.kdf));
        closeModal(true); toast('Passphrase changed');
      })().catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
async function syncNewRecovery() {
  if (!confirm('Make a new recovery key? The old one will stop working.')) return;
  try {
    const row = await getVault('kdf');
    const r = await recoveryFields(Sync.acc.dek, row.kdf);
    await updateVault(r.fields);
    syncShowRecovery(r.recovery, false);
  } catch (e) { toast(`Couldn’t make a new key: ${authErrText(e)}`, 5000); }
}
function syncDeleteAccount() {
  openModal({
    title: 'Delete account', submitLabel: 'Delete account',
    body: `<p>This deletes your account and the synced copy of your data. Every device stops syncing. The data on this device stays.</p>
      <div class="field"><label for="acc-del">Type DELETE to confirm</label><input id="acc-del" class="input" autocomplete="off" maxlength="20"></div><p class="field-error" id="acc-err"></p>`,
    onSubmit: form => {
      if (form.querySelector('#acc-del').value.trim().toUpperCase() !== 'DELETE') { fieldErr(form, 'acc-err', 'Type DELETE to confirm.'); return false; }
      const done = busyBtn(form, 'Deleting…');
      sbCall('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} })
        .then(() => { Sync.acc = null; saveAcc(); Sync.status = ''; try { localStorage.removeItem(CLASH_KEY); } catch (e) { /* ignore */ } closeModal(true); toast('Account deleted. Your data is still on this device', 5000); })
        .catch(e => { done(); fieldErr(form, 'acc-err', authErrText(e)); });
      return false;
    }
  });
}
function syncUseClash() {
  const pc = parkedCopy(); if (!pc) return;
  if (!confirm('Switch to the copy that was set aside? What you have now is set aside instead.')) return;
  const now = JSON.parse(JSON.stringify(state));
  state = normalizeState(pc.data);
  parkCopy(now, 'before switching');
  closeModal(true); commit(); applyTheme(); applyCountry();
  toast('Switched. The previous copy is set aside');
}
const SYNC_ACTIONS = {
  'sync-signin': () => syncSignIn(),
  'sync-finish': () => { if (!Sync.acc || !Sync.acc.refresh) { syncSignIn(); return; } syncFinish(null, null); },
  'sync-now': () => syncNow(true),
  'sync-signout': () => syncSignOut(),
  'sync-passphrase': () => syncChangePassphrase(),
  'sync-recovery': () => syncNewRecovery(),
  'sync-delete': () => syncDeleteAccount(),
  'sync-clash': () => syncUseClash()
};

