<p align="center">
  <img src="assets/logo.png" alt="YOKO! logo" width="120">
</p>

<h1 align="center">YOKO! Student</h1>

<p align="center">
  A money planner for students. Track spending, set a budget, split bills and save for goals.<br>
  Your data stays on your device.
</p>

<p align="center">
  <a href="https://tejjj777.github.io/yokomoney/"><b>Open the app</b></a>
</p>

---

## What it does

- **Spend:** log what you spend in seconds. Paste bank SMS, import a statement, or scan a receipt.
- **Budget:** see how much is safe to spend today and when your money will run out.
- **Split:** split bills with friends and settle up over UPI.
- **Goals:** save toward things you want and track progress.
- **Money Wrapped:** a fun recap of where your money went.
- **Works offline:** after the first visit it runs without internet.
- **Optional sync:** sign in to use it on more than one device. Synced data is end-to-end encrypted.

## Put it on your phone

1. Open **https://tejjj777.github.io/yokomoney/** on your phone.
2. **iPhone (Safari):** tap Share, then **Add to Home Screen**.
3. **Android (Chrome):** tap ⋮, then **Install app**.

It opens full screen with its own icon, like a normal app.

## Run it on a computer

No build step. Download this repo and double-click `index.html`.

## Tech

Plain HTML, CSS and JavaScript. No framework. A service worker (`sw.js`) handles offline use. Optional sync uses [Supabase](https://supabase.com). Receipt scanning uses Tesseract.js, and PDF reading uses PDF.js, both bundled in `assets/`.

For contributors, the code map and rules are in [`README-AGENTS.md`](README-AGENTS.md). Hosting options are in [`HOW-TO-INSTALL.md`](HOW-TO-INSTALL.md).
