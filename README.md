# Orbit — a private cycle tracker

**Current release: v12.** See [upgrade instructions](UPGRADE-v12.md) for storage recovery, exact-date sharing and the required optional Supabase migration. Run `npm ci --ignore-scripts && npm test` to check this release. Older release notes below describe earlier behavior.

A menstrual cycle tracker that installs to your phone's home screen and keeps everything
on the device. No account, no server, no analytics.

Built as a Progressive Web App: plain HTML, CSS and JavaScript modules with no build
step, no bundler and no dependencies. Open `index.html` over HTTPS and it works.

---

## 1. Put it online

The app needs to be served over **HTTPS** for home-screen install and offline mode to
work. Opening the files directly from disk (`file://`) will not work — browsers block
JavaScript modules and service workers there.

### The easy way — GitHub Pages (free, ~5 minutes)

1. Create a GitHub account if you do not have one.
2. Make a new **public** repository, for example `orbit`.
3. Upload every file and folder from this bundle to the root of the repo, keeping the
   structure: `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, plus the
   `app/` and `icons/` folders.
4. Go to **Settings › Pages**. Under *Build and deployment*, set Source to
   *Deploy from a branch*, branch `main`, folder `/ (root)`. Save.
5. Wait a minute, then open `https://YOUR-USERNAME.github.io/orbit/`.

A public repo means the *code* is public. Your logged data never goes there — it lives
only in your browser's storage.

### Other options

- **Netlify Drop** — drag the folder onto <https://app.netlify.com/drop>. No account needed.
- **Cloudflare Pages** or **Vercel** — connect the repo, no configuration required.
- **Your own server** — any static host works. No backend, no Node, no database.

### Running it locally to try it out

```bash
cd orbit
python3 -m http.server 8000
# then open http://localhost:8000
```

`localhost` counts as a secure origin, so everything works except install-to-home-screen.

---

## 2. Install it on your phone

### iPhone / iPad
1. Open the URL in **Safari** (this does not work in Chrome on iOS).
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open it from the home-screen icon. It runs full-screen with no browser chrome.

### Android
1. Open the URL in **Chrome**.
2. Tap the **⋮** menu, then **Install app** (or **Add to Home screen**).
3. Open it from the app drawer.

Once installed, it works with no connection.

---

## 3. Share your cycle with your partner

Two ways, and you can use either.

### Share link — nothing to set up

1. **More › Share with a partner › Send my cycle.**
2. Send them the link however you like.
3. They open it on their phone and install the app the same way. The link fills in the
   connection automatically.

The link carries your cycle history and about a year of predictions, so it stays useful
without refreshing. Send a fresh link every couple of months to keep their predictions
in step with yours.

**What travels:** period days, fertile window, ovulation, PMS. That is all.
Symptoms, moods, notes, temperature and weight are not in the link — not hidden in it,
genuinely not encoded into it.

### Live sync — cycles update on their own

Optional. Needs a free Supabase project, about ten minutes.

1. Sign up at <https://supabase.com> and create a project.
2. Open the **SQL Editor** and run the SQL shown in the app under
   **More › Share with a partner › Show the database setup**.
3. In **Project Settings › API**, copy the **Project URL** and the **anon public** key.
4. In the app, paste both, then invent a **room name** and a **passphrase**.
   Enter the *same* room name and passphrase on both phones.
5. Turn **Sync on**.

Everything is encrypted on the device with AES-GCM (key derived from your passphrase
with PBKDF2) before it is uploaded, so the database only ever holds scrambled text.
Anyone reading the database without your passphrase sees nothing useful.

---

## 4. Back up

**More › Your data › Download a full backup** writes a JSON file that restores
your logs and settings. Reconfigure the PIN and live-sync credentials after restoring. Do this occasionally.

Clearing your browser's site data will delete your logs. On some phones, removing the
home-screen app does too. Partner sync is a dates-only summary, not a full cloud backup.

CSV export is also there if you want to look at your data in a spreadsheet or bring it
to a doctor's appointment.

---

## 5. Files

```
index.html              app shell
styles.css              all styling
manifest.webmanifest    home-screen install metadata
sw.js                   service worker (offline cache)
icons/                  app icons
app/state.js            storage + the tracking catalogue
app/cycle.js            cycle detection, phases, predictions
app/views.js            cycle / calendar / log / analysis screens
app/more.js             settings, sharing, onboarding, lock screen
app/connect.js          share codes, encryption, sync, export
app/ui.js               DOM helpers, sheets, the ring renderer
app/main.js             router and bootstrap
```

If you edit any file, bump `CACHE = 'orbit-v1'` in `sw.js` to `orbit-v2` so phones pick
up the change instead of serving the cached copy.

---

## 6. Important

**This is not contraception.** The fertile window is estimated from your past cycle
dates — it is not measured. Ovulation moves with stress, illness, travel and sleep, and
sperm can survive several days. If you are relying on this to avoid pregnancy, please
use a method designed for that and talk to a clinician.

It is also not a diagnostic tool. Cycles consistently shorter than 21 days or longer
than 35, bleeding that soaks through protection hour after hour, periods that stop for
three months, or pain that stops your day are all worth raising with a doctor. The CSV
export is a useful thing to bring along.

---

## Orbit v2 upgrades in this bundle

This version keeps the same zero-build PWA architecture, but hardens prediction and privacy:

- period prediction now uses up to 12 recent completed cycles, recency weighting, robust outlier handling and an explicit uncertainty range;
- future uncertainty widens gradually with forecast horizon instead of presenting every future date as exact;
- manually logged positive ovulation tests, BBT shifts and egg-white cervical fluid can strengthen ovulation inference;
- when repeated LH/BBT evidence exists, Orbit learns a personal luteal-phase estimate instead of always using the manual default;
- fertile dates are intentionally conservative and must never be treated as contraception;
- PIN derivation now uses PBKDF2-SHA256 with 600,000 iterations instead of a single SHA-256 hash;
- live-sync encryption uses PBKDF2-SHA256 with 600,000 iterations + AES-256-GCM, with random salt and IV per payload;
- the readable room name is no longer placed in the Supabase row id; a one-way room token is used instead;
- a restrictive Content Security Policy was added;
- tracking now includes the public Clue-style set represented in this app, including super-heavy flow, breasts/chest, hot flashes, meditation, IUD and birth-control method tracking, plus unlimited custom tags;
- service-worker cache is `orbit-v2` so installed iPhones receive the updated files.

### Prediction safety

Orbit is a personal tracking and awareness tool, not a clinically validated fertility algorithm. A calendar can estimate a likely future period; it cannot know in advance exactly when ovulation will happen. BBT can support a retrospective ovulation inference after a sustained temperature rise. LH tests and cervical-fluid observations provide additional but still imperfect evidence.

If avoiding pregnancy matters, do not use Orbit's fertile-window colours to decide that unprotected sex is safe.

### Best setup for two iPhones

1. Put this folder on one HTTPS static host (GitHub Pages, Cloudflare Pages, Netlify or your own server).
2. On each iPhone, open the same URL in Safari, tap Share → Add to Home Screen, and launch Orbit from its icon.
3. The tracker phone owns the health log. The partner phone should use **More → Share with a partner** and connect using either a fresh share link or live sync.
4. For automatic partner updates, enable live sync on both phones using the same Supabase project, room name and a long unique passphrase.
5. Make a JSON backup occasionally. Browser/site-data deletion can erase local logs.

For the most useful ovulation evidence, log BBT immediately after waking under consistent conditions, log home ovulation-test results when used, and log cervical fluid. These observations improve context but do not turn Orbit into contraception.
