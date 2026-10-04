// Checks the UPI pay button and the AI command bar (session 10 fixes).
// Run: node tests/upi-ai-check.mjs   Screenshots go to tests/out/upi-ai/.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'tests/out/upi-ai');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const results = [], errors = [];
const check = (name, ok, extra = '') => results.push({ ok: !!ok, name, extra });

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page(aiHandler) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, userAgent: ANDROID, hasTouch: true, isMobile: true });
  await ctx.route('**/functions/v1/ai', aiHandler || (r => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"quota"}' })));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto(BASE + 'index.html'); await p.waitForTimeout(800);
  await p.evaluate(() => { loadSample(); state.meta.tourDone = true; state.meta.tourVersion = TOUR_VERSION; commit(); closeModal && closeModal(); });
  await p.waitForTimeout(400);
  return { ctx, p };
}
const wide = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// ---------- self-tests ----------
{
  const { ctx, p } = await page();
  const st = await p.evaluate(() => { const r = runSelfTests(); return { passed: r.passed, total: r.total, failed: r.results.filter(x => !x.ok).map(x => x.name) }; });
  check(`self-tests ${st.passed}/${st.total}`, st.passed === st.total, st.failed.join('; '));
  await ctx.close();
}

// ---------- UPI: you owe them ----------
{
  const { ctx, p } = await page();
  const who = await p.evaluate(() => {
    state.wallet.ious.push({ id: uid(), person: 'Testpay', dir: 'owe', amount: 250, date: todayISO(), due: '', note: 'pizza', settled: false, settledAt: '' });
    state.wallet.upiIds.Testpay = 'testpay@okaxis'; commit(); settleUpModal('Testpay'); return 1;
  });
  await p.waitForTimeout(300);
  const a = await p.evaluate(() => { const x = document.querySelector('#su-pay'); return x && { href: x.getAttribute('href'), target: x.getAttribute('target'), text: x.textContent }; });
  check('owe: Pay button exists', !!a);
  check('owe: Android link is intent:// with scheme=upi', a && a.href.startsWith('intent://pay?pa=testpay@okaxis&') && a.href.endsWith('#Intent;scheme=upi;end'), a && a.href);
  check('owe: no target=_blank', a && !a.target);
  check('owe: amount in link', a && /am=250\.00/.test(a.href));
  check('owe: QR shown', await p.locator('.su-qr-frame svg').count() === 1);
  check('owe: no sideways scroll at 360px', !(await wide(p)));
  await p.screenshot({ path: `${OUT}/owe.png`, fullPage: true });
  // tapping Pay with no UPI app installed: the link goes nowhere, a hint appears
  const nav = [];
  p.on('request', r => nav.push(r.url()));
  await p.evaluate(() => { window.__toasts = []; const t = toast; window.toast = (...a) => { window.__toasts.push(a[0]); return t(...a); }; });
  await p.locator('#su-pay').click().catch(() => {});
  await p.waitForTimeout(3000);
  const toastText = await p.evaluate(() => (window.__toasts || []).join(' | ') + ' || hint muted=' + document.querySelector('#su-pay-hint').classList.contains('muted') + ' vis=' + document.visibilityState);
  check('owe: no-app hint shows after tapping Pay', /No UPI app opened/.test(toastText), toastText.slice(0, 120));
  check('owe: page still alive after tapping Pay', await p.evaluate(() => !!document.querySelector('#su-pay')));
  await ctx.close();
}

// ---------- UPI: they owe you ----------
{
  const { ctx, p } = await page();
  await p.evaluate(() => {
    state.wallet.ious.push({ id: uid(), person: 'Testowe', dir: 'owed', amount: 180, date: todayISO(), due: '', note: 'chai', settled: false, settledAt: '' });
    state.wallet.upiIds.Testowe = 'friend@okaxis'; state.settings.myUpiId = ''; commit(); settleUpModal('Testowe');
  });
  await p.waitForTimeout(300);
  const label = await p.locator('label[for="su-upi-input"]').textContent();
  check('owed: asks for YOUR UPI ID', /Your UPI ID/.test(label), label);
  check('owed: no QR before your UPI ID is set', await p.locator('.su-qr-frame').count() === 0);
  check('owed: no Pay button (you are being paid)', await p.locator('#su-pay').count() === 0);
  await p.fill('#su-upi-input', 'not a upi'); await p.click('#su-save-upi'); await p.waitForTimeout(200);
  check('owed: bad UPI ID shows an error', /doesn’t look like a UPI ID/.test(await p.locator('#su-wrap').textContent()));
  await p.fill('#su-upi-input', 'me.student@ybl'); await p.click('#su-save-upi'); await p.waitForTimeout(300);
  const qr = await p.locator('.su-qr-frame svg').count();
  check('owed: QR appears after saving your UPI ID', qr === 1);
  check('owed: saved to settings', await p.evaluate(() => state.settings.myUpiId === 'me.student@ybl'));
  check('owed: message has your UPI ID', /My UPI: me\.student@ybl/.test(await p.locator('#su-msg-text').textContent()));
  check('owed: survives reload (normalizer keeps it)', await p.evaluate(() => { const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); const s = normalizeState(raw); normalizeMore(s, raw); return s.settings.myUpiId === 'me.student@ybl'; }));
  check('owed: no sideways scroll at 360px', !(await wide(p)));
  await p.screenshot({ path: `${OUT}/owed.png`, fullPage: true });
  await ctx.close();
}

// ---------- AI command bar ----------
async function ask(handler, text, wait = 2500) {
  const { ctx, p } = await page(handler);
  await p.evaluate(() => { location.hash = '#dashboard/overview'; }); await p.waitForTimeout(500);
  let sent = null;
  if (handler) p.on('request', r => { if (r.url().includes('/functions/v1/ai')) sent = r.postDataJSON(); });
  await p.fill('#cb-input', text); await p.click('#cb-send');
  await p.waitForTimeout(wait);
  const out = await p.locator('#cb-result').innerText();
  return { ctx, p, out, sent };
}
{
  const chat = r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', reply: 'You spend most on food in the first week. Try a ₹200 weekly cap.' }) });
  const { ctx, p, out, sent } = await ask(chat, 'why am I always broke by the 20th?');
  check('AI chat: reply shown', /first week/.test(out), out.slice(0, 120));
  check('AI chat: sends text + context', sent && sent.task === 'command' && sent.input && sent.input.text && sent.input.context && typeof sent.input.context.safeToSpendToday === 'number', JSON.stringify(sent && sent.input && sent.input.context || {}).slice(0, 160));
  check('AI chat: no UPI IDs or notes sent', sent && !/okaxis|okhdfcbank|@/.test(JSON.stringify(sent.input.context)));
  await p.screenshot({ path: `${OUT}/ai-chat.png` });
  await ctx.close();
}
{
  const { ctx, p, out } = await ask(null, 'why am I always broke by the 20th?');
  check('AI down: clear message', /AI isn’t answering right now/.test(out), out.slice(0, 120));
  await p.screenshot({ path: `${OUT}/ai-down.png` });
  await ctx.close();
}
{
  const { ctx, out } = await ask(null, 'spent 120 on chai, split it with Rahul');
  check('AI down: spends still work on the device', /log/.test(out) && /120/.test(out), out.slice(0, 120));
  await ctx.close();
}
{
  const aff = r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'afford', amount: 1500, item: 'concert', dayOffset: 2, reply: 'Haan, but outings will be tight after.' }) });
  const { ctx, out } = await ask(aff, 'can I afford a 1500 concert on saturday');
  check('AI afford: app math + AI words', /afford|tight/i.test(out) && /outings will be tight/.test(out), out.slice(0, 160));
  await ctx.close();
}
{
  const slow = r => setTimeout(() => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', reply: 'Late answer' }) }), 9000);
  const { ctx, out } = await ask(slow, 'tell me a money tip', 10500);
  check('AI slow (9s): still waits for a free question', /Late answer/.test(out), out.slice(0, 80));
  await ctx.close();
}

await b.close(); server.close();
const bad = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra && !r.ok ? '  → ' + r.extra : ''}`));
const errs = [...new Set(errors)].filter(e => !/functions\/v1\/ai|502|Failed to load resource/.test(e));
if (errs.length) console.log('Console errors:\n  ' + errs.join('\n  '));
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length || errs.length ? 1 : 0);
