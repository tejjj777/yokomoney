/* YOKO! Student service worker: makes the installed app open offline.
   The page and its own code (js/, css/) are fetched fresh when online (so updates arrive together) and fall back to the cached copy offline.
   Everything else is cache-first; the large OCR files are cached the first time they're used. */
const CACHE = 'yoko-student-v22';   // bump the number every session
const PREFIX = 'yoko-student-';    // only ever delete our own caches (main YOKO! may share this origin)
const CORE = [
  './', './index.html', './manifest.webmanifest', './prices.json',
  './assets/chart.umd.min.js', './assets/logo.png', './assets/favicon.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/fonts/inter-400.woff2', './assets/fonts/inter-500.woff2', './assets/fonts/inter-600.woff2', './assets/fonts/inter-700.woff2',
  './assets/pdfjs/pdf.min.js', './assets/pdfjs/pdf.worker.min.js',
  './assets/sc-add.png', './assets/sc-receipt.png', './assets/sc-message.png', './assets/sc-calendar.png',
  // app code: keep in sync with the <script> tags in index.html
  './css/app.css',
  './js/theme-boot.js',
  './js/finmath.js',
  './js/selftests.js',
  './js/utils.js',
  './js/state.js',
  './js/charts.js',
  './js/ui-shared.js',
  './js/page-dashboard.js',
  './js/page-debt.js',
  './js/page-budget.js',
  './js/suggestions.js',
  './js/page-goals.js',
  './js/fun.js',
  './js/tour.js',
  './js/page-wallet.js',
  './js/payslip.js',
  './js/more.js',
  './js/import.js',
  './js/rewards.js',
  './js/pet.js',
  './js/challenges.js',
  './js/commands.js',
  './js/ai.js',
  './js/commandbar.js',
  './js/qrcode.js',
  './js/bill-split.js',
  './js/wrapped.js',
  './js/insights.js',
  './js/global.js',
  './js/receipt.js',
  './js/calendar.js',
  './js/sub-checkin.js',
  './js/router.js',
  './js/modals.js',
  './js/sync.js',
  './js/groups.js',
  './js/export.js',
  './js/actions.js',
  './js/init.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  if (/\/(js|css)\/[^/]+\.(js|css)$/.test(new URL(req.url).pathname)) {   // app code: newest when online, saved copy offline
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
    return;
  }
  if (/\/prices\.json$/.test(new URL(req.url).pathname)) {   // price list: newest when online, saved copy offline
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./prices.json', copy)); } return res; }).catch(() => caches.match('./prices.json')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
