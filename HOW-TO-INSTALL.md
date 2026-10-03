# Put YOKO! Student on your phone

YOKO! Student runs from this folder with no internet: double-click `index.html` on a computer.
To install it on a phone as an app (its own icon, full screen, works offline), the folder has to be on a website first.
Phones can't install an app from a file on disk.

## 1. Put the folder online (free, pick one)

### Option A: Netlify Drop (easiest, no coding)
1. On a computer, go to <https://app.netlify.com/drop>.
2. Sign up or log in (free). Without an account the site still deploys, but it's locked behind a temporary password until you claim it.
3. Drag the whole `yoko-student` folder onto the page. Delete its `node_modules` folder first if you ran the tests (it is only for testing and is large).
4. After a few seconds you get a link ending in `.netlify.app`. That's your app.
5. To update later, drag the new `yoko-student` folder onto the same project's deploy page.

The folder is about 15 MB, which is under Netlify Drop's recommended 50 MB limit.

### Option B: GitHub Pages
1. Create a new repository on GitHub and upload everything inside the `yoko-student` folder. `index.html` must be at the top level.
2. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## 2. Install it

- **Android (Chrome):** open your link, tap **⋮**, then tap **Install app** or **Add to Home screen**. You can also use **Settings → Use it on your phone → Install** inside YOKO! Student.
- **iPhone / iPad (Safari):** open your link, tap **Share**, then tap **Add to Home Screen**.
- **Computer (Chrome / Edge):** use the install icon in the address bar.

**Shortcuts:** once it's installed, press and hold the YOKO! icon on Android (or right-click it on a computer) for *Add an expense*, *Scan a receipt*, *Paste a bank message* and *Bill calendar*. As far as I know iPhones don't show these for web apps (unverified).

After the first visit the app opens offline. Photo and scanned-payslip reading (OCR) is saved for offline use the first time you use it.

## 3. Your data

- Without an account, data stays in that browser only. Nothing is uploaded.
- With an account (**Settings → Account**), data syncs between devices. It's locked with the person's passphrase on the device before upload, so the server only holds scrambled text.
- Signed-out users should still back up. YOKO! reminds them weekly. Signed-in users don't get the reminder, because the account holds a copy.
- Your link is public. Anyone with it sees an empty YOKO!, never your numbers.

## 4. Accounts (Supabase)

Already set up for `https://yokomoney.netlify.app`:
- The `vaults` table and its security rules (from `supabase/setup.sql`).
- Sign-in emails send a link back to that address (Authentication → URL Configuration).

How sign-in works: the person types their email, gets a sign-in link, and opens it on the same device. If you ever move the app to a new address, add it under Authentication → URL Configuration, or the links will go to the old one.

Before real users:
1. **Own email sender.** The built-in sender only sends 2 emails an hour and its emails can't be edited. Add one under Authentication → Emails → SMTP settings (Resend, Brevo or Amazon SES). After that you can also put `{{ .Token }}` in the Magic Link and Confirm signup templates, so people can type a 6-digit code instead (the app already has an "I got a code" option).
2. **Keep it awake.** Free projects pause after a week with no activity. Move to a paid plan once people rely on it.

Notes:
- The app uses the **publishable** key, which is meant to be public. Never put the **secret** or `service_role` key in the app.
- iPhone home-screen apps keep their own storage, separate from Safari. A sign-in link opens in Safari, so on iPhone sign in with the code once you have your own email sender, or use YOKO! in Safari.
- A forgotten passphrase *and* a lost recovery key means that person's synced data can't be opened by anyone.

## 5. Updating prices

The typical prices, interest-rate ranges and provider lists in the pick-from-a-list screens live in `prices.json`, next to `index.html`.

1. Edit the numbers in `prices.json`, keeping each entry's source link.
2. Change `"checked"` at the top to today's date (it must be later than the old one, or the app ignores the file).
3. Upload `prices.json` to your site again.

Installed apps pick it up the next time they open while online, and keep using it offline. If the file is broken, the app ignores it and keeps the list it had.
