// Smoke test: self-tests, every page and tab at 360x640 and 1280x800, menus, console errors,
// sideways scroll, and offline after first load. Screenshots go to tests/out/.
// Run: node tests/smoke.mjs            (needs: npm install, see README-AGENTS.md)
// Optional env: CHROMIUM_PATH=/path/to/chrome   ONLY=dashboard,budget   (limit pages)
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'tests/out');
const KEY = 'yoko.student.v1';
const SEED = fs.readFileSync(path.join(ROOT, 'tests/seed.json'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const TABS = { dashboard: ['overview', 'calendar', 'charts'], debt: ['debts', 'plan', 'emi'], budget: ['plan', 'spending', 'yearly', 'history'],
  wallet: ['cash', 'ious', 'subs', 'transport', 'taxes', 'payslips'], goals: ['goals', 'gifts', 'wishlist', 'challenges'] };
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [], overflow = [];
const watch = (p, tag) => { p.on('console', m => m.type() === 'error' && errors.push(`[${tag}] ${m.text()}`)); p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`)); };
const wide = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// fresh start + self-tests
let ctx = await b.newContext({ viewport: { width: 360, height: 640 } }), p = await ctx.newPage(); watch(p, 'fresh');
await p.goto(BASE + 'index.html'); await p.waitForTimeout(1200);
const st = await p.evaluate(() => { const r = runSelfTests(); return { passed: r.passed, total: r.total, failed: r.results.filter(x => !x.ok).map(x => x.name) }; });
await p.screenshot({ path: `${OUT}/fresh.png` }); await ctx.close();

// every page and tab, seeded with sample data
for (const [w, h, tag] of [[360, 640, 'm'], [1280, 800, 'd']]) {
  ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, SEED]);
  p = await ctx.newPage(); watch(p, tag);
  await p.goto(BASE + 'index.html#dashboard'); await p.waitForTimeout(1000);
  for (const [route, tabs] of Object.entries(TABS)) { if (only && !only.includes(route)) continue; for (const t of tabs) {
    await p.evaluate(x => { location.hash = x; }, `#${route}/${t}`); await p.waitForTimeout(400);
    if (await wide(p)) overflow.push(`${tag} ${route}/${t}`);
    await p.screenshot({ path: `${OUT}/${tag}-${route}-${t}.png`, fullPage: tag === 'm' });
  } }
  for (const [name, sel] of [['quickadd', '#quickadd-btn'], ['settings', '[data-action="open-settings"]'], ['palette', '#palette-btn']]) {
    await p.evaluate(() => { location.hash = '#dashboard/overview'; }); await p.waitForTimeout(250);
    await p.evaluate(s => { const els = [...document.querySelectorAll(s)]; (els.find(e => e.offsetParent !== null) || els[0]).click(); }, sel); await p.waitForTimeout(400);
    if (await wide(p)) overflow.push(`${tag} ${name}`);
    await p.screenshot({ path: `${OUT}/${tag}-ui-${name}.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    await p.evaluate(() => { const m = document.querySelector('[data-action="close-modal"]'); m && m.click(); });
  }
  await ctx.close();
}

// offline after the first load
ctx = await b.newContext({ viewport: { width: 360, height: 640 } }); p = await ctx.newPage(); watch(p, 'offline');
await p.goto(BASE + 'index.html'); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(2000);
await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(1500);
const off = await p.evaluate(() => ({ ok: !!document.querySelector('.view:not([hidden])') && typeof runSelfTests === 'function', title: document.title }));
for (const x of ['#budget/plan', '#wallet/cash', '#goals/goals', '#debt/debts']) { await p.evaluate(y => { location.hash = y; }, x); await p.waitForTimeout(300); }
await p.screenshot({ path: `${OUT}/offline.png` });
await ctx.close(); await b.close(); server.close();

console.log(`Self-tests: ${st.passed}/${st.total}${st.failed.length ? ' FAILED: ' + st.failed.join('; ') : ''}`);
console.log(`Console errors: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
console.log(`Sideways scroll: ${overflow.length ? overflow.join(', ') : 'none'}`);
console.log(`Offline after first load: ${off.ok ? 'works' : 'BROKEN'} (${off.title})`);
console.log(`Screenshots: tests/out/`);
process.exit(st.failed.length || errors.length || overflow.length || !off.ok ? 1 : 0);
