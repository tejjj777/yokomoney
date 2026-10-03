// Full pre-demo check. Runs everything the smoke test does, plus: every button on every tab, the demo flow,
// AI down / offline / slow network, reduced motion and a 4x slower CPU.
// Run: node tests/full-check.mjs [pages] [crawl] [demo] [network] [motion]   (no args = all)
// Optional env: CHROMIUM_PATH=/path/to/chrome   OUT=dir for screenshots (default tests/out/full)
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = process.env.OUT || path.join(ROOT, 'tests/out/full');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'yoko.student.v1';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };
let serverDelay = 0;   // ms added to every local response (slow network)
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  const send = () => {
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  };
  serverDelay ? setTimeout(send, serverDelay) : send();
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;
const want = process.argv.slice(2);
const run = name => !want.length || want.includes(name);

const ROUTES = { dashboard: ['overview', 'forecast', 'semester', 'calendar', 'charts'], spend: ['log', 'categories', 'insights', 'recurring', 'cash'],
  budget: ['plan', 'where', 'yearly', 'history'], split: ['ious', 'groups', 'history'], goals: ['goals', 'wishlist', 'challenges', 'gifts'] };
const VIEWPORTS = [[360, 640, 'm'], [1280, 800, 'd']];
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const report = [];
const log = (...a) => { const s = a.join(' '); report.push(s); console.log(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** AI edge function stand-in, so the "AI works" path can be tested without the real server. */
function fakeAi(body) {
  const t = (body && body.task) || '';
  if (t === 'command') {
    const raw = String(body.input || ''), m = /student: "([\s\S]*?)"\.\s*\n/.exec(raw);
    const s = (m ? m[1] : raw).toLowerCase();
    if (/afford/.test(s)) return { intent: 'afford', amount: 1500, item: 'concert', dayOffset: 2 };
    if (/spent|paid/.test(s)) return { intent: 'add', amount: 120, note: 'chai', split: /split/.test(s), withPerson: /rahul/.test(s) ? 'Rahul' : '' };
    return { intent: 'ask', categoryName: 'Food' };
  }
  return null;
}
/**
 * net: 'blocked'  = AI server and CDN refuse to connect (what most venue Wi-Fi with a firewall looks like)
 *      'blackhole' = AI server and CDN never answer (worst case: packets dropped)
 *      'ai-ok'     = AI answers quickly with sensible JSON
 *      'ai-500'    = AI answers with an error
 *      'ai-junk'   = AI answers 200 with something that isn't the expected JSON
 */
async function newPage({ w = 360, h = 640, net = 'blocked', reducedMotion = 'no-preference', tag = 'p', cpu = 1, sw = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion, serviceWorkers: sw ? 'allow' : 'block', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
    const url = route.request().url();
    const isAi = /functions\/v1\/ai/.test(url);
    if (net === 'blackhole') return;   // never answer
    if (isAi && net === 'ai-ok') { let body = null; try { body = JSON.parse(route.request().postData() || 'null'); } catch (e) { /* */ }
      const r = fakeAi(body); return r ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r), headers: { 'access-control-allow-origin': '*' } }) : route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); }
    if (isAi && net === 'ai-500') return route.fulfill({ status: 500, body: 'boom', headers: { 'access-control-allow-origin': '*' } });
    if (isAi && net === 'ai-junk') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"intent":"add","amount":"lots"}', headers: { 'access-control-allow-origin': '*' } });
    return route.abort('connectionrefused');
  });
  await ctx.addInitScript(() => { window.print = () => console.log('[stub] print'); });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  p.errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|ERR_FAILED|net::ERR|Failed to load resource/.test(m.text())) p.errors.push(`[${tag}] ${m.text()}`); });
  p.on('pageerror', e => p.errors.push(`[${tag}] PAGEERROR ${e.message}`));
  p.on('dialog', d => d.dismiss().catch(() => {}));
  ctx.on('page', np => np.close().catch(() => {}));
  if (cpu > 1) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  return p;
}
async function boot(p, data = 'demo', hash = '#dashboard/overview') {
  await p.goto(BASE + 'index.html' + hash, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => typeof render === 'function' && document.querySelector('.view:not([hidden])'), null, { timeout: 30000 });
  if (data === 'fresh') return;
  await p.evaluate(d => {
    if (d === 'demo') state = sampleState();
    else state = defaultState();
    markTourSeen();   // also saves
  }, data);
  await p.evaluate(() => sessionStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForFunction(() => document.querySelector('.view:not([hidden])'));
  await sleep(300);
}
async function goto(p, hash) { await p.evaluate(x => { location.hash = x; }, hash); await sleep(350); }

/** Layout problems on whatever is showing now. */
async function layoutChecks(p) {
  return p.evaluate(() => {
    const de = document.documentElement, vw = de.clientWidth;
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '') + (el.textContent.trim() ? ` "${el.textContent.trim().slice(0, 30)}"` : '');
    const visible = el => { const s = getComputedStyle(el); return el.getClientRects().length && s.visibility !== 'hidden' && +s.opacity !== 0; };
    const inScroller = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a.clientWidth < vw + 1) return true; } return false; };
    const out = { hscroll: de.scrollWidth > vw + 1, offscreen: [], clipped: [], small: [], dead: [] };
    const root = document.querySelector('#modal-root .modal') ? [document.querySelector('#modal-root')] : [document.querySelector('header.topbar'), document.querySelector('main'), document.querySelector('.tabbar')];
    for (const r of root) for (const el of r ? r.querySelectorAll('*') : []) {
      if (!visible(el) || el.closest('.sr-only,[hidden],.menu')) continue;
      const rc = el.getBoundingClientRect();
      if (rc.width && (rc.right > vw + 1 || rc.left < -1) && !inScroller(el)) {
        const par = el.parentElement && el.parentElement.getBoundingClientRect();
        if (!par || (par.right <= vw + 1 && par.left >= -1)) out.offscreen.push(desc(el) + ` x=${Math.round(rc.left)}..${Math.round(rc.right)}`);
      }
      const s = getComputedStyle(el);
      if (el.children.length === 0 && el.textContent.trim() && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) out.clipped.push(desc(el));
      // text that spills out of its own box (e.g. a nowrap badge)
      const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (ownText && s.overflowX === 'visible' && s.display !== 'inline' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && !el.closest('.sr-only, svg, table')) out.clipped.push('SPILL ' + desc(el) + ` ${el.scrollWidth}>${el.clientWidth}`);
      if (el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]') && !el.closest('p, li > span, td') ) {
        if ((rc.height < 24 || rc.width < 24) && rc.width > 0 && !el.matches('.linklike, .skip-link, input[type=checkbox], input[type=radio], input[type=range]')) out.small.push(desc(el) + ` ${Math.round(rc.width)}x${Math.round(rc.height)}`);
      }
    }
    document.querySelectorAll('[data-action]').forEach(el => { const a = el.dataset.action; if (!ACTIONS[a] && !out.dead.includes(a)) out.dead.push(a); });
    return out;
  });
}
function summarize(tag, c) {
  const bits = [];
  if (c.hscroll) bits.push('SIDEWAYS SCROLL');
  if (c.offscreen.length) bits.push('offscreen: ' + [...new Set(c.offscreen)].slice(0, 4).join(' | '));
  if (c.clipped.length) bits.push('clipped: ' + [...new Set(c.clipped)].slice(0, 4).join(' | '));
  if (c.dead.length) bits.push('no handler: ' + c.dead.join(', '));
  if (bits.length) log(`  ${tag}: ${bits.join('  //  ')}`);
  return c.small;
}

/* ========== 1. Every page and tab, 360 and desktop, demo data and empty ========== */
if (run('pages')) {
  log('\n## Pages and tabs');
  for (const data of ['demo', 'empty']) for (const [w, h, v] of VIEWPORTS) {
    const p = await newPage({ w, h, tag: `${data}-${v}` });
    await boot(p, data);
    const small = new Set();
    for (const [r, tabs] of Object.entries(ROUTES)) for (const t of tabs) {
      await goto(p, `#${r}/${t}`);
      const c = await layoutChecks(p);
      summarize(`${data} ${v} ${r}/${t}`, c).forEach(x => small.add(x));
      await p.screenshot({ path: `${OUT}/page-${data}-${v}-${r}-${t}.png`, fullPage: true });
    }
    // top bar menus and modals
    for (const [name, sel] of [['quickadd', '#quickadd-btn'], ['settings', '[data-action="open-settings"]'], ['palette', '#palette-btn']]) {
      await goto(p, '#dashboard/overview');
      await p.evaluate(s => { const els = [...document.querySelectorAll(s)]; (els.find(e => e.offsetParent !== null) || els[0]).click(); }, sel); await sleep(400);
      summarize(`${data} ${v} ${name}`, await layoutChecks(p));
      await p.screenshot({ path: `${OUT}/ui-${data}-${v}-${name}.png` });
      await p.keyboard.press('Escape'); await sleep(200);
      await p.evaluate(() => { const m = document.querySelector('#modal-root [data-action="close-modal"]'); m && m.click(); });
    }
    if (v === 'm' && small.size) log(`  ${data} m small tap targets (<24px): ${[...small].slice(0, 12).join(' | ')}${small.size > 12 ? ` (+${small.size - 12} more)` : ''}`);
    if (p.errors.length) log(`  ERRORS ${data} ${v}:\n    ` + [...new Set(p.errors)].join('\n    '));
    await p.context().close();
  }
  // themes at 360
  for (const theme of ['blue', 'red']) {
    const p = await newPage({ tag: theme }); await boot(p, 'demo');
    await p.evaluate(t => { state.settings.theme = t; applyTheme(); save(); render(); }, theme);
    await goto(p, '#dashboard/overview'); await p.screenshot({ path: `${OUT}/theme-${theme}.png`, fullPage: true });
    if (p.errors.length) log(`  ERRORS theme ${theme}: ` + p.errors.join(' | '));
    await p.context().close();
  }
}

/* ========== 2. Click every button on every tab ========== */
if (run('crawl')) {
  log('\n## Every button');
  const SKIP = new Set(['reset-all', 'more-menu', 'close-modal', 'jump', 'export-json', 'csv']);   // reset-all asks first; csv/export only download
  for (const [w, h, v] of VIEWPORTS) {
    if (v === 'd' && process.env.CRAWL_MOBILE_ONLY) continue;
    const p = await newPage({ w, h, tag: `crawl-${v}` });
    await boot(p, 'demo');
    const snapshot = await p.evaluate(k => localStorage.getItem(k), KEY);
    const seen = new Set(); let clicks = 0, modals = 0;
    // real reload with the demo data put back (a hash-only goto would not reload the page)
    const fresh = async hash => {
      if (!p.url().startsWith(BASE)) await p.goto(BASE + 'sw.js');
      await p.evaluate(([k, s]) => { localStorage.setItem(k, s); sessionStorage.clear(); }, [KEY, snapshot]);
      await p.goto('about:blank'); await p.goto(BASE + 'index.html' + hash);
      await p.waitForFunction(() => document.querySelector('.view:not([hidden])')); await sleep(250);
    };
    for (const [r, tabs] of Object.entries(ROUTES)) for (const t of [...tabs, null]) {
      const hash = t ? `#${r}/${t}` : null;
      if (!hash) continue;
      await fresh(hash);
      const cands = await p.evaluate(() => {
        const list = [];
        const scope = [...document.querySelectorAll('main [data-action], header.topbar [data-action], #quickadd-menu [data-action]')];
        scope.forEach((el, i) => {
          const inMore = el.closest('.more-menu'), inQa = el.closest('#quickadd-menu');
          const vis = el.getClientRects().length > 0;
          if (!vis && !inMore && !inQa) return;
          list.push({ i, action: el.dataset.action, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), inMore: !!inMore, inQa: !!inQa, data: JSON.stringify(el.dataset) });
        });
        return list;
      });
      for (const c of cands) {
        const key = c.inQa ? `qa:${c.action}` : `${r}:${c.action}:${c.label.replace(/[\d.,₹]+/g, '#')}`;
        if (SKIP.has(c.action) || seen.has(key)) continue;
        seen.add(key);
        await fresh(hash);
        const before = p.errors.length;
        const ok = await p.evaluate(c => {
          const scope = [...document.querySelectorAll('main [data-action], header.topbar [data-action], #quickadd-menu [data-action]')];
          let el = scope[c.i];
          if (!el || el.dataset.action !== c.action) el = scope.find(e => e.dataset.action === c.action && JSON.stringify(e.dataset) === c.data);
          if (!el) return false;
          if (c.inQa) document.getElementById('quickadd-btn').click();
          const mm = el.closest('.more-menu');
          if (mm) { const btn = document.querySelector(`[aria-controls="${mm.id}"]`); btn && btn.click(); }
          el.scrollIntoView({ block: 'center' });
          el.click();
          return true;
        }, c);
        if (!ok) { log(`  ? couldn't find ${key}`); continue; }
        clicks++;
        await sleep(600);
        const modalTitle = await p.evaluate(() => { const m = document.querySelector('#modal-root .modal'); return m ? (m.querySelector('#modal-title') || m).textContent.trim().slice(0, 50) : null; });
        const tourOn = await p.evaluate(() => !!document.querySelector('.tour-card'));
        if (modalTitle !== null || tourOn) {
          modals++;
          const lc = await layoutChecks(p);
          summarize(`${v} ${r}/${t} → ${c.action} "${c.label}" [${modalTitle || 'tour'}]`, lc);
          await p.screenshot({ path: `${OUT}/act-${v}-${r}-${t}-${c.action}-${modals}.png` });
        } else {
          const lc = await layoutChecks(p);
          if (lc.hscroll) log(`  ${v} ${r}/${t} → ${c.action}: SIDEWAYS SCROLL after click`);
        }
        if (p.errors.length > before) log(`  ERROR ${v} ${r}/${t} → ${c.action} "${c.label}": ${p.errors.slice(before).join(' | ')}`);
      }
    }
    log(`  ${v}: clicked ${clicks} buttons, ${modals} opened a dialog or tour`);
    await p.context().close();
  }
}

/* ========== 3. Demo flow, 3 times from a fresh install ========== */
async function demoFlow(p, n, opts = {}) {
  const t0 = Date.now(), steps = [];
  const step = async (name, fn) => {
    const pop = await p.evaluate(() => { const m = document.querySelector('#modal-root .modal'); return m ? (m.querySelector('#modal-title') || m).textContent.trim().slice(0, 60) : null; }).catch(() => null);
    if (pop && !/^open fresh|^onboarding/.test(name)) { steps.push(`  (dialog "${pop}" was open before "${name}", closed it)`); await p.keyboard.press('Escape'); await sleep(300); }
    const s = Date.now(), before = p.errors.length;
    try { await fn(); steps.push(`${name} ${Date.now() - s}ms${p.errors.length > before ? ' ERR ' + p.errors.slice(before).join(' | ') : ''}`); }
    catch (e) { steps.push(`${name} FAILED: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/demo${n}-fail-${name.replace(/\W+/g, '-')}.png` }); }
  };
  const shot = name => opts.shots ? p.screenshot({ path: `${OUT}/demo${n}-${name}.png` }) : null;
  await step('open fresh', async () => {
    await p.goto(BASE + 'index.html');
    await p.waitForSelector('#modal-root .modal', { timeout: 20000 }); await sleep(400);
    await shot('01-onboarding');
  });
  await step('onboarding: sample data link', async () => {
    await p.click('[data-action="onboard-sample"]'); await p.waitForSelector('#safe-hero', { timeout: 5000 }); await sleep(500); await shot('02-home');
  });
  await step('command bar: add + split', async () => {
    await p.fill('#cb-input', 'spent 120 on chai, split it with Rahul'); await p.click('#cb-send');
    await p.waitForSelector('#cb-result #cb-confirm-btn', { timeout: 15000 });
    steps.push('    → ' + (await p.evaluate(() => document.querySelector('#cb-result').innerText.replace(/\s+/g, ' ').trim())).slice(0, 160));
    await shot('03-cb-add');
    await p.click('#cb-confirm-btn'); await sleep(500); await shot('03b-cb-added');
  });
  await step('command bar: afford', async () => {
    await p.fill('#cb-input', 'can I afford a 1500 concert on Saturday?'); await p.click('#cb-send');
    await p.waitForFunction(() => { const r = document.querySelector('#cb-result'); return r && !r.hidden && !/Thinking/.test(r.textContent); }, null, { timeout: 15000 });
    steps.push('    → ' + (await p.evaluate(() => document.querySelector('#cb-result').innerText.replace(/\s+/g, ' ').trim())).slice(0, 200));
    await shot('04-cb-afford');
  });
  await step('forecast slider', async () => {
    const s = await p.$('#forecast-card input[type=range]'); if (!s) throw new Error('no slider');
    const before = await p.evaluate(() => document.getElementById('forecast-status-badge').textContent.trim());
    await s.evaluate(el => { el.value = String(+el.max); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(400);
    const after = await p.evaluate(() => document.getElementById('forecast-status-badge').textContent.trim());
    steps.push(`    → badge "${before}" → "${after}"`);
  });
  await step('paste bank message', async () => {
    await p.click('#quickadd-btn'); await p.click('#quickadd-menu [data-action="import-sms"]');
    await p.fill('#imp-sms', 'Rs.250.00 debited from A/c XX1234 on 02-10-26 to VPA swiggy@icici UPI Ref 427512345678');
    await p.click('#imp-read'); await p.waitForSelector('#modal-root button[type=submit]:not([hidden])', { timeout: 5000 }); await sleep(250); await shot('05-import-review');
    steps.push('    → category picked: ' + await p.evaluate(() => { const s = document.querySelector('#modal-root select[id^="imp-cat-"]'); return s ? s.options[s.selectedIndex].text : '?'; }));
    await p.click('#modal-root button[type=submit]'); await sleep(1200);
  });
  await step('UPI sample screenshots', async () => {
    await p.click('#quickadd-btn'); await p.click('#quickadd-menu [data-action="import-sms"]');
    await p.click('#imp-to-file'); await p.click('#imp-demo-shots');
    await p.waitForSelector('#modal-root button[type=submit]:not([hidden])', { timeout: 5000 }); await sleep(250); await shot('06-upi-review');
    steps.push('    → ' + await p.evaluate(() => [...document.querySelectorAll('#modal-root select[id^="imp-cat-"]')].map(s => s.closest('tr') ? s.closest('tr').innerText.split('\n')[0].slice(0, 18) + '=' + s.options[s.selectedIndex].text : '').slice(0, 15).join(' | ')));
    await p.click('#modal-root button[type=submit]'); await sleep(1200);
  });
  await step('split a bill (photo + OCR)', async () => {
    await goto(p, '#split/ious');
    await p.click('main [data-action="split-bill"]'); await p.waitForSelector('#modal-root #bs-container', { timeout: 5000 }); await sleep(250); await shot('07-split-bill');
    if (opts.ocr) {
      const t0 = Date.now();
      await p.setInputFiles('#modal-root #bs-file-input', path.join(ROOT, 'tests/sample-bill.png'));
      await p.waitForFunction(() => /Found \d+ item|Couldn|type the items/.test(document.getElementById('toast').textContent), null, { timeout: 120000 });
      steps.push(`    → OCR ${((Date.now() - t0) / 1000).toFixed(1)}s: ` + await p.evaluate(() => document.getElementById('toast').textContent));
      await sleep(300); await shot('07b-split-bill-read');
    }
    await p.keyboard.press('Escape'); await sleep(300);
  });
  await step('settle up', async () => {
    await goto(p, '#split/ious');
    const btn = await p.$('[data-action="settle-person"]'); if (!btn) throw new Error('no settle button');
    await btn.click(); await p.waitForSelector('#modal-root .modal', { timeout: 5000 }); await sleep(300); await shot('08-settle');
    const qr = await p.$('#modal-root svg'); if (!qr) throw new Error('no UPI QR code in Settle up');
    await p.keyboard.press('Escape'); await sleep(300);
  });
  await step('insights heatmap', async () => { await goto(p, '#spend/insights'); await p.waitForSelector('#w-spending-heatmap', { timeout: 5000 }); await shot('09-insights'); });
  await step('budget autopilot', async () => {
    await goto(p, '#budget/plan'); await p.click('[data-action="budget-autopilot"]'); await p.waitForSelector('#modal-root .modal'); await shot('10-autopilot');
    await p.click('#modal-root button[type=submit]'); await sleep(500);
  });
  await step('freeze warning', async () => {
    await p.click('#quickadd-btn'); await p.click('#quickadd-menu [data-action="add-expense"]'); await p.waitForSelector('#modal-root .modal'); await shot('11-add-expense');
    await p.keyboard.press('Escape'); await sleep(300);
  });
  await step('wishlist / should I buy it', async () => { await goto(p, '#goals/wishlist'); await p.waitForSelector('#wishlist-card', { timeout: 5000 }); });
  await step('money wrapped', async () => {
    await goto(p, '#dashboard/overview'); await p.click('[data-action="open-wrapped"]'); await p.waitForSelector('#modal-root .modal'); await sleep(500); await shot('12-wrapped');
    for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowRight'); await sleep(250); }
    await shot('12b-wrapped-end');
    const dl = await p.$('#modal-root [data-action="download-wrapped"]');
    if (dl) { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), dl.click()]); if (!d) throw new Error('no download from wrapped'); }
    await p.keyboard.press('Escape'); await sleep(300);
  });
  return { total: Date.now() - t0, steps };
}
if (run('demo')) {
  log('\n## Demo flow x3 from a fresh install');
  for (let n = 1; n <= 3; n++) {
    const p = await newPage({ tag: `demo${n}`, sw: true });
    const r = await demoFlow(p, n, { shots: n === 1, ocr: n === 1 });
    log(`  run ${n}: ${(r.total / 1000).toFixed(1)}s`); r.steps.forEach(s => log('    ' + s));
    if (p.errors.length) log('    errors: ' + [...new Set(p.errors)].join(' | '));
    await p.context().close();
  }
}

/* ========== 4. AI down, offline, slow network ========== */
async function timeCommand(p, text) {
  await goto(p, '#dashboard/overview');
  const s = Date.now();
  await p.fill('#cb-input', text); await p.click('#cb-send');
  await p.waitForFunction(() => { const r = document.querySelector('#cb-result'); return r && !r.hidden && !/Thinking/.test(r.textContent); }, null, { timeout: 30000 });
  const txt = await p.evaluate(() => document.querySelector('#cb-result').innerText.replace(/\s+/g, ' ').slice(0, 140));
  return `${Date.now() - s}ms → ${txt}`;
}
if (run('network')) {
  log('\n## Network');
  for (const net of ['ai-ok', 'blocked', 'ai-500', 'ai-junk', 'blackhole']) {
    const p = await newPage({ net, tag: net });
    const s = Date.now();
    await p.goto(BASE + 'index.html#dashboard/overview', { waitUntil: 'commit' });
    const usable = await p.waitForFunction(() => typeof render === 'function' && document.querySelector('.view:not([hidden])') && document.querySelector('#side-nav a'), null, { timeout: 60000 }).then(() => true, () => false);
    const loadMs = Date.now() - s;
    log(`  ${net}: app ${usable ? 'ready' : 'NOT USABLE'} after ${loadMs}ms`);
    if (!usable) { await p.screenshot({ path: `${OUT}/net-${net}-stuck.png` }); await p.context().close(); continue; }
    await boot(p, 'demo');
    log(`    "spent 120 on chai split with Rahul": ${await timeCommand(p, 'spent 120 on chai split with Rahul')}`);
    log(`    "can I afford a 1500 concert on Saturday?": ${await timeCommand(p, 'can I afford a 1500 concert on Saturday?')}`);
    log(`    "how much on food this month": ${await timeCommand(p, 'how much did I spend on food this month')}`);
    await p.screenshot({ path: `${OUT}/net-${net}.png` });
    // live groups without a server
    await goto(p, '#split/groups');
    const before = p.errors.length;
    const hasCreate = await p.$('[data-action="create-group"]');
    if (hasCreate) {
      await hasCreate.click(); await sleep(400);
      const opened = await p.$('#modal-root .modal');
      if (opened) { await p.fill('#modal-root input[name="name"], #modal-root #f-name', 'Goa trip').catch(() => {}); await p.fill('#modal-root input[name="myName"], #modal-root #f-myName', 'Tej').catch(() => {}); await p.click('#modal-root button[type=submit]').catch(() => {}); await sleep(1500); }
      const toastTxt = await p.evaluate(() => document.getElementById('toast').textContent);
      log(`    live groups → create: ${opened ? 'dialog opened' : 'NOTHING HAPPENED'}; toast: "${toastTxt}"`);
      await p.screenshot({ path: `${OUT}/net-${net}-groups.png` });
    }
    if (p.errors.length) log('    errors: ' + [...new Set(p.errors)].join(' | '));
    await p.context().close();
  }
  // offline after first load (service worker), including every route and the demo flow
  {
    const p = await newPage({ tag: 'offline', sw: true });
    await p.goto(BASE + 'index.html'); await p.evaluate(() => navigator.serviceWorker.ready); await sleep(2500);
    await p.context().setOffline(true);
    await p.reload(); await sleep(1500);
    const ok = await p.evaluate(() => !!document.querySelector('.view:not([hidden])') && typeof render === 'function').catch(() => false);
    log(`  offline reload: ${ok ? 'app opens' : 'BROKEN'}`);
    const missing = await p.evaluate(() => ['GroupSync', 'billSplitterModal', 'openWrapped', 'aiCall'].filter(n => { try { return typeof eval(n) === 'undefined'; } catch (e) { return true; } })).catch(e => ['eval failed ' + e.message]);
    if (missing.length) log(`  offline: MISSING after reload: ${missing.join(', ')}`);
    await p.context().close();
    const p2 = await newPage({ tag: 'offline-demo', sw: true });
    await p2.goto(BASE + 'index.html'); await p2.evaluate(() => navigator.serviceWorker.ready); await sleep(2500);
    await p2.evaluate(() => { localStorage.clear(); });
    await p2.context().setOffline(true);
    const r = await demoFlow(p2, 'off', { shots: false });
    log(`  offline demo flow: ${(r.total / 1000).toFixed(1)}s`); r.steps.forEach(s => log('    ' + s));
    if (p2.errors.length) log('    errors: ' + [...new Set(p2.errors)].join(' | '));
    await p2.context().close();
  }
  // slow network: 3G-ish local server + external hosts that never answer
  {
    serverDelay = 150;
    const p = await newPage({ net: 'blackhole', tag: 'slow' });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 750 * 1024 / 8, uploadThroughput: 250 * 1024 / 8 });
    const s = Date.now();
    await p.goto(BASE + 'index.html', { timeout: 120000, waitUntil: 'commit' });
    await p.waitForFunction(() => typeof render === 'function' && document.querySelector('.view:not([hidden])'), null, { timeout: 120000 }).then(() => log(`  slow 3G + blackholed CDN/AI: first open usable after ${((Date.now() - s) / 1000).toFixed(1)}s`)).catch(() => log(`  slow 3G + blackholed CDN/AI: NOT usable after ${((Date.now() - s) / 1000).toFixed(1)}s`));
    await p.screenshot({ path: `${OUT}/net-slow.png` });
    if (p.errors.length) log('    errors: ' + [...new Set(p.errors)].join(' | '));
    await p.context().close();
    serverDelay = 0;
  }
}

/* ========== 5. Reduced motion and 4x slower CPU ========== */
if (run('motion')) {
  log('\n## Motion');
  for (const [rm, cpu] of [['reduce', 1], ['no-preference', 4], ['reduce', 4]]) {
    const tag = `${rm}-cpu${cpu}`;
    const p = await newPage({ reducedMotion: rm, cpu, tag });
    await boot(p, 'demo');
    const info = await p.evaluate(() => {
      const anims = document.getAnimations().map(a => (a.animationName || a.transitionProperty || 'js') + '@' + (a.effect && a.effect.target ? (a.effect.target.id || a.effect.target.className || '').toString().slice(0, 30) : ''));
      return { anims, chartAnim: window.Chart ? JSON.stringify(Chart.defaults.animation && Chart.defaults.animation.duration) : 'no chart' };
    });
    log(`  ${tag}: running animations on Home: ${info.anims.length ? info.anims.join(', ') : 'none'}; chart animation duration: ${info.chartAnim}`);
    // timings of key interactions
    const time = async (name, fn) => { const s = Date.now(); try { await fn(); log(`    ${name}: ${Date.now() - s}ms`); } catch (e) { log(`    ${name}: FAILED ${e.message.split('\n')[0]}`); } };
    await time('switch to Spend/insights (heatmap)', async () => { await p.evaluate(() => { location.hash = '#spend/insights'; }); await p.waitForSelector('#w-spending-heatmap'); });
    await time('switch to Dashboard/charts', async () => { await p.evaluate(() => { location.hash = '#dashboard/charts'; }); await p.waitForSelector('#view-dashboard canvas'); });
    await time('open quick add + Expense dialog', async () => { await p.evaluate(() => { location.hash = '#dashboard/overview'; }); await p.click('#quickadd-btn'); await p.click('#quickadd-menu [data-action="add-expense"]'); await p.waitForSelector('#modal-root .modal'); });
    await p.keyboard.press('Escape'); await sleep(200);
    await time('open Money Wrapped', async () => { await p.click('[data-action="open-wrapped"]'); await p.waitForSelector('#modal-root .modal'); });
    const wrAnims = await p.evaluate(() => document.getAnimations().length);
    log(`    animations running in Wrapped: ${wrAnims}`);
    await p.screenshot({ path: `${OUT}/motion-${tag}-wrapped.png` });
    await p.keyboard.press('Escape'); await sleep(200);
    await time('pet reaction + toast after logging via command bar', async () => {
      await p.fill('#cb-input', 'spent 60 on chai'); await p.click('#cb-send');
      await p.waitForSelector('#cb-result button.btn-primary', { timeout: 15000 }); await p.click('#cb-result button.btn-primary');
      await p.waitForFunction(() => document.getElementById('toast').classList.contains('show'), null, { timeout: 5000 });
    });
    await time('start tour, 3 steps', async () => {
      await p.evaluate(() => startTour(['quick']));
      for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await sleep(150); }
      await p.waitForSelector('.tour-card');
    });
    await p.screenshot({ path: `${OUT}/motion-${tag}-tour.png` });
    await p.keyboard.press('Escape'); await sleep(200);
    // long tasks during a full render
    const lt = await p.evaluate(async () => { const s = performance.now(); render(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - s); });
    log(`    full re-render of Home: ${lt}ms`);
    // confetti respects reduced motion?
    const conf = await p.evaluate(() => { confetti(); return document.querySelectorAll('canvas.confetti, .confetti').length; });
    log(`    confetti elements after confetti(): ${conf}`);
    if (p.errors.length) log('    errors: ' + [...new Set(p.errors)].join(' | '));
    await p.context().close();
  }
}

await b.close(); server.close();
fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n'));
console.log(`\nReport: ${path.join(OUT, 'report.txt')}`);
