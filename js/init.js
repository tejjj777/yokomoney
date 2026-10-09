/* YOKO! Student · Startup.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';
/* =========================================================
   INIT
   ========================================================= */
function buildChrome() {
  document.getElementById('side-nav').innerHTML = ROUTES.map(r => `<li><a class="nav-link" href="#${r.id}" data-route="${r.id}">${ICON[r.icon]}<span>${r.long || r.label}</span></a></li>`).join('');
  document.getElementById('tab-nav').innerHTML = ROUTES.map(r => `<a class="tab-link" href="#${r.id}" data-route="${r.id}">${ICON[r.icon]}<span>${r.short || r.label}</span></a>`).join('');
  document.getElementById('side-settings').innerHTML = `${ICON.settings}<span>Settings</span>`;
  document.getElementById('settings-mobile-btn').innerHTML = ICON.settings;
  document.getElementById('palette-btn').innerHTML = ICON.search;
  document.querySelectorAll('img.yoko-logo').forEach(img => { img.src = LOGO_URI; });
  document.getElementById('side-palette').innerHTML = `${ICON.search}<span>Commands</span><kbd>Ctrl K</kbd>`;
  document.getElementById('plus-icon').outerHTML = ICON.plus;

}

function bindEvents() {
  document.addEventListener('click', e => {
    if (e.target.closest('#quickadd-btn')) { setMenu(qaMenu().hidden, e.detail === 0); return; }
    if (!qaMenu().hidden && !e.target.closest('#quickadd-menu')) setMenu(false, false);
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.closest('#quickadd-menu')) setMenu(false, false);
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('mousedown', e => { if (e.target.matches('[data-backdrop]')) closeModal(); });
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
    const z = e.target.closest && e.target.closest('[data-dropzone="payslip"]');
    if (z) { e.preventDefault(); z.classList.add('drag'); }
  }));
  document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-dropzone="payslip"]'); if (z) z.classList.remove('drag'); });
  document.addEventListener('drop', e => {
    const z = e.target.closest && e.target.closest('[data-dropzone="payslip"]');
    if (!z) return;
    e.preventDefault(); z.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) openPayslipModal(f);
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'whatif-range') { updateWhatIf(); return; }
    if (el.dataset && el.dataset.filter && !el.closest('#modal-root')) {
      ui.expFilter = Object.assign(ui.expFilter || emptyExpFilter(), { [el.dataset.filter]: el.value });
      scheduleRender(el.tagName === 'SELECT' || el.type === 'date' ? 0 : 250); return;
    }
    if (el.dataset && el.dataset.bind && !el.closest('#modal-root')) handleBind(el);
  });
  document.addEventListener('toggle', e => {
    const k = e.target.dataset && e.target.dataset.openKey;
    if (!k || !!ui.open[k] === e.target.open) return;   // ignore toggles caused by our own re-render
    ui.open[k] = e.target.open;
    if (e.target.open) render();                        // big tables are only built when opened
  }, true);


  document.addEventListener('keydown', e => {
    if (tour) { tourKey(e); return; }   // guided tour owns the keyboard while it's open
    // Ctrl/Cmd + K opens the command palette from anywhere
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.getElementById('cmd-input')) closeModal(); else openPalette();
      return;
    }
    // Modal: Esc closes, Tab stays inside
    const modal = document.querySelector('#modal-root .modal');
    if (modal) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key === 'Tab') {
        const f = [...modal.querySelectorAll(FOCUSABLE)].filter(x => !x.closest('[hidden]') && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    // Quick add menu keyboard support
    if (!qaMenu().hidden) {
      const items = [...qaMenu().querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); setMenu(false, false); qaBtn().focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') setMenu(false, false);
    } else if (document.activeElement === qaBtn() && e.key === 'ArrowDown') { e.preventDefault(); setMenu(true); }
    // Enter commits an inline field immediately
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.bind && e.target.tagName === 'INPUT' && renderTimer) { e.preventDefault(); render(); }
  });

  let lastRoute = currentRoute();
  window.addEventListener('hashchange', () => {
    if (handleDeepLink()) return;
    redirectOldHash();
    const route = currentRoute(), sameRoute = route === lastRoute;
    lastRoute = route;
    render(); window.scrollTo(0, 0);
    const tab = sameRoute && document.querySelector('.subtab[aria-selected="true"]');
    (tab || document.getElementById('main')).focus({ preventScroll: true });   // switching tabs keeps you on the tab bar
  });

  // Expand collapsed tables for printing, then restore
  let printOpened = [];
  window.addEventListener('beforeprint', () => {
    printOpened = [];
    document.querySelectorAll('details.collapsible:not([open])').forEach(d => { const k = d.dataset.openKey; if (k) { ui.open[k] = true; printOpened.push(k); } });
    document.getElementById('print-date').textContent = `Printed ${fmtDate(todayDate())}`;
    document.documentElement.dataset.theme = 'print'; setupChartDefaults();   // paper is white
    render();
  });
  window.addEventListener('afterprint', () => {
    printOpened.forEach(k => { ui.open[k] = false; });
    applyTheme(); render();
  });

  // Keep other tabs in sync
  window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { state = loadState(); applyTheme(); applyPrivacy(); applyCountry(); render(); } });
}

function init() {
  buildChrome();
  applyTheme();          // also sets chart colours for the theme
  applyPrivacy();
  applyCountry();        // day-first or month-first dates
  loadPriceUpdates();
  if (loadFailed) setTimeout(() => toast('Your saved data couldn’t be read, so YOKO! started fresh. An untouched copy is kept in this browser.', 8000), 600);
  bindEvents();
  bindMore();
  let fitT; addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitNumbers, 150); });
  const authLanding = takeAuthFromURL();   // came back from the sign-in email link
  if (!location.hash) history.replaceState(null, '', '#dashboard');
  redirectOldHash();
  const deep = /^#do\//.test(location.hash);
  checkBadges(true);     // quietly record badges already earned
  dailyTick();           // new month → history; recurring payments; rewards
  render();
  try { startI18n(); } catch (e) { console.warn('Language setup failed', e); }
  runSelfTests();
  restoreBackupLink();   // reconnect the auto-backup file, if one was linked
  setupPwa();            // install-as-app, only when served from a website
  bindSync(); startSync();   // account sync, if signed in
  if (authLanding) { markTourSeen(); finishLinkSignIn(authLanding); }      // finish signing in; skip the welcome
  else if (deep) handleDeepLink();                                         // opened from an app-icon shortcut
  else if (!state.meta.tourDone) showWelcome();                            // first open: offer the guided tour
  else if ((state.meta.tourVersion || 0) < TOUR_VERSION) showWhatsNew();   // returning: show what changed
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
