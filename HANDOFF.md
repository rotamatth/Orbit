# HANDOFF — Orbit cycle tracker

Context for whoever picks this up next, human or model. Read this before changing code.

---

## 1. What this is

A menstrual cycle tracker built as an installable Progressive Web App, modelled on the
feature set of Clue (researched from Clue's own support docs and store listings, then
implemented independently). Original design, original code, no Clue assets or branding.

**Requirements it was built against:** works on the owner's phone like a normal app;
the owner's partner can see the cycle on their own phone; full tracking feature set.

**Status:** feature-complete and tested. Runs. Not yet deployed anywhere.

**Stack deliberately kept to zero dependencies:** vanilla ES modules, no build step,
no bundler, no framework, no npm install. Drop the folder on any static host and it
works. Do not add a build step without a strong reason — it destroys the "upload the
folder and it runs" property, which is the whole deployment story for a non-devops user.

---

## 2. File map

| File | Responsibility |
|---|---|
| `index.html` | App shell, PWA meta tags. Almost nothing in it. |
| `styles.css` | Every style. CSS custom properties at the top drive theming. |
| `manifest.webmanifest` | Install metadata, icons, shortcuts. |
| `sw.js` | Service worker. Network-first for app files, cache-first for fonts. |
| `app/state.js` | localStorage persistence, migration, the tracking catalogue. |
| `app/cycle.js` | Date maths, cycle detection, stats, forecasting, phase classification. Pure functions, no DOM. |
| `app/ui.js` | DOM helpers, toast, bottom sheet, the ring SVG generator. |
| `app/views.js` | Cycle / Calendar / Log / Analysis screens. |
| `app/more.js` | More menu, all settings screens, sharing, partner view, onboarding, PIN lock, reminders. |
| `app/connect.js` | Share-code encode/decode, WebCrypto encryption, Supabase sync, export. |
| `app/main.js` | Router, nav, boot sequence, service worker registration. |

Every view module exports functions returning `{ html, mount(root) }`. The router in
`main.js` writes `html` into `#app`, then calls `mount` to attach listeners. There is no
virtual DOM and no reactivity — `window.__orbit.render()` re-renders the current route
from scratch. This is fine at this scale; do not introduce a framework to "fix" it.

---

## 3. Data model

Everything lives in one localStorage key, `orbit.v1`:

```js
{
  version: 1,
  profile:  { name, role: 'tracker'|'partner', onboarded },
  settings: { avgCycle, avgPeriod, luteal, units, weekStart, showFertile,
              enabledCategories: [catId], quickLog: [catId],
              reminders: { periodSoon:{on,daysBefore}, periodLate:{on},
                           fertileStart:{on}, pill:{on,time} },
              pin: { salt, hash } | null, customTags: [] },
  days: {
    '2026-09-08': {
      bleeding: 'light'|'medium'|'heavy'|'spotting',   // single-select
      pain: ['cramps','headache'],                      // multi-select
      feelings: [...], energy: '...', /* etc — key is the category id */
      bbt: 36.55, weight: 62.1, note: 'free text'
    }
  },
  connection: { name, code, sharedAt, via } | null,     // the partner's shared cycle
  sync: { url, key, room, pass, on, lastPush, lastPull }
}
```

`state.migrate()` deep-merges any saved blob over `blankState()`, so adding new settings
keys is backwards compatible. Bump `version` and extend `migrate()` for anything
structural.

**Empty days are pruned.** `pruneDay()` deletes a date key once every field is gone, so
`Object.keys(days).length` is a truthful "days logged" count.

---

## 4. The cycle algorithm — read this before touching `cycle.js`

**Bleeding vs spotting.** Only `light|medium|heavy` count as menstruation.
`spotting` is displayed but never starts a cycle. This mirrors how Clue separates them
and it matters: treating spotting as a period start wrecks every prediction downstream.

**Cycle detection** (`buildCycles`): group bleeding dates into runs. A gap of up to
2 days stays inside the same period. A new run starting fewer than 10 days after the
current cycle's start is treated as continued bleeding, not a new cycle. Both tolerances
exist to absorb real logging behaviour (people forget a day; people spot mid-period).

**Averages** (`stats`): recency-weighted mean of the last 6 completed cycles, weights
1..6 with the most recent heaviest. Cycles outside 15–90 days are excluded as data
entry errors. Falls back to `settings.avgCycle` until at least one cycle exists.
`confident` flips true at 3 cycles, which is when the UI stops apologising for its
predictions.

**Forecast** (`forecast`): 13 cycles projected forward from the last real period start.
Per cycle:
- period = `start` … `start + avgPeriod - 1`
- ovulation = `start + cycleLength - luteal` (counted *backwards* from the next period,
  because the luteal phase is the stable part of the cycle — this is the standard
  approach and the reason ovulation is predictable at all)
- fertile window = `ovulation - 5` … `ovulation + 1`
- PMS = `start + cycleLength - 5` … `start + cycleLength - 1`

**Classification** (`classify`) returns the phase for any date and is the single source
of truth for colour in the ring, the calendar, the partner view and the analysis
breakdown. If you change phase logic, all four update together. Keep it that way.

---

## 5. The privacy wall — do not weaken this

The partner-sharing design has one property worth protecting: **symptoms cannot leak,
structurally, not by policy.**

`makeShareCode()` emits only `{version, name, baseDate, [[dayOffset, periodLength]…],
avgCycle, avgPeriod, luteal, timestamp}`. `decodeShareCode()` rebuilds a synthetic state
whose `days` contain nothing but `{bleeding:'medium'}` entries. The partner view then
runs the *same* `forecast`/`classify` code against that synthetic state.

So the partner view is not "the full state with symptoms hidden by the UI" — the
symptoms were never encoded. There is no code path that could accidentally render them.

This is verified three ways in the test suite:
1. the decoded state's day objects contain only the `bleeding` key,
2. a note reading `SECRETNOTE` and tags `cramps`/`sad` are absent from the raw payload,
3. the rendered partner DOM contains none of the seeded symptom strings.

**If you refactor sharing, keep those three tests green.** Sending the whole state and
filtering in the view would pass a casual review and quietly break the guarantee.

**Live sync** encrypts the same minimal payload with AES-GCM, key derived by PBKDF2
(150k iterations, SHA-256) from the user's passphrase, random salt and IV per message.
The Supabase row holds base64 ciphertext only. The anon key and permissive RLS policy
mean anyone with the room name can *read the ciphertext* — the passphrase is what
protects it. That trade-off is deliberate (it avoids making the user set up auth) and is
disclosed in the README. Do not remove the encryption to "simplify".

---

## 6. Design system

Dark-first. Tokens live at the top of `styles.css`; `[data-theme='light']` overrides a
handful of them.

```
--ink #16131C   --ink-1 #1D1926   --ink-2 #262231   --ink-3 #2F2A3C
--border #322C40  --bone #EFE9E6   --muted #9C93A8   --faint #6E6679
--accent #E6B25C (brass; interactive only)
```

Phase colours are **data, not decoration** — they encode meaning and are used
consistently across every surface:

```
--menstrual #E2564C   --follicular #57B79B   --fertile #E9A93F
--ovulation #F5CE5C   --luteal #8D7FCB       --pms #CE6FA2
```

Type: **Fraunces** (serif) for numbers, headlines and the cycle day; **Karla** for all
UI. Loaded from Google Fonts, cached by the service worker after first load. Fallbacks
are Georgia and system-ui, so a cold offline first-run still reads fine.

The cycle ring (`ui.js › ringSVG`) is the one piece of visual boldness; everything else
is deliberately quiet. It draws one arc segment per day of the current cycle, coloured by
phase, dimmed to 42% opacity for days still in the future, with today marked by a bone
dot. Keep the rest restrained around it.

---

## 7. Tests

Three suites, all passing. They live outside the app bundle — recreate them from this
description or ask for them.

**Logic suite (45 assertions, Node, no DOM):** cycle detection against a synthetic year
of cycles `[28,30,27,29,28,31,28]`; gap tolerance; spotting exclusion; averages and
variation; forecast arithmetic; phase classification at every boundary; share-code round
trip; the three privacy-wall checks; encryption round trip including wrong-passphrase
rejection; PIN hashing; CSV shape; and empty/single-cycle/garbage-input edge cases.

**DOM suite (52 assertions, jsdom):** every one of the 12 routes renders without error;
calendar cell counts and phase classes; month navigation; chip taps writing through to
storage for single-select, multi-select and deselect; note and BBT persistence; clear-day;
quick-log; analysis charts present; sheet open/close; the full partner flow end to end;
settings persistence; back navigation; and a global assertion that zero console errors
occurred across the whole run.

**Browser pass (headless Chrome at 390×844, DPR 2):** screenshots of all screens in both
themes, plus a second isolated browser context that opens a real share link and completes
the partner connect flow.

Three genuine bugs were caught this way and fixed:
- `'Notification' in window` is true when the property exists but is `undefined`
  (real in some iOS WebViews) → crashed the reminders screen. Now `typeof` guarded.
- Same pattern for `navigator.serviceWorker.register`.
- Percentage heights on the cycle-length bars resolved against an auto-height flex item,
  collapsing every bar to 4px. Fixed with a `position:relative` track wrapper.

Note during testing: the service worker will serve a stale module to a second tab after
you edit files. Bump `CACHE` in `sw.js`, or test in a fresh browser context.

---

## 8. What is NOT built

Honest list. None of these are broken; they were never started.

- **True background push notifications.** Reminders fire when the app is opened or
  regains focus. Waking a sleeping phone needs a push server with VAPID keys and a
  subscription store — real infrastructure, out of scope for a serverless app. The
  reminders screen says so in plain language.
- **Custom tags.** `settings.customTags` exists in the schema and is never read or
  written. Wiring it up means a small editor in the categories screen and merging user
  tags into the catalogue at render time.
- **Clue's other modes** — Conceive, Pregnancy, Perimenopause. Would each need their own
  phase model and tracking set.
- **Wearable integrations** (Apple Health, Oura, Fitbit). Apple Health is not reachable
  from a web app at all; that one needs a native wrapper.
- **Content/education tab.** Clue's articles are written by their science team and are
  their copyright. Phase blurbs in `PHASE_META` are original one-liners. Write your own
  or link out; do not copy theirs.
- **Two-way live sync of full data between the owner's own devices.** Sync currently
  exchanges the minimal cycle payload only, by design. Syncing full symptom data between
  a person's *own* phones is a legitimate separate feature and would reuse the same
  encryption, but must not reuse the partner room.
- **Cycle-length filtering in analysis** beyond the last 12, and no cramps/flow-specific
  analysis views that Clue Plus has.

---

## 9. If you change things

- Bump `CACHE` in `sw.js` on every deploy or phones keep the old build.
- `state.js` `CATEGORIES` is the single catalogue; adding a category there makes it
  appear in logging, the category picker, calendar filters and analysis automatically.
  Set `tier: 2` to keep it off by default.
- Do not put user data in URLs beyond the deliberate share code.
- The app assumes the person is a capable adult and does not nag. Keep the copy plain,
  keep the one contraception warning honest and unmissable, and do not add cheerleading
  or streaks — this is health data, not a habit app.

---

## v2 changes (September 2026)

- `cycle.js` now uses a robust probabilistic forecast over up to 12 cycles and exposes forecast uncertainty.
- Ovulation evidence can use positive LH tests, sustained BBT shifts, and egg-white cervical fluid; repeated LH/BBT evidence can learn luteal length.
- Fertile estimates widen when cycle timing is uncertain. Do not collapse them back to a false-precision single calendar rule.
- PBKDF2 work factor increased to 600,000 for sync encryption and PIN derivation.
- Sync row ids use a SHA-256-derived room token instead of the human-readable room name.
- CSP added to `index.html`; service worker cache bumped to `orbit-v2`.
- Tracking catalogue expanded and custom tags are now wired into the tracking UI.
- Logic suite remains green at 45/45 after the changes.
