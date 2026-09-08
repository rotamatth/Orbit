// more.js — settings, sharing, data, onboarding and the lock screen.

import { get, update, replaceAll, blankState, CATEGORIES, CAT_BY_ID, NUMERIC } from './state.js';
import { today, iso, addDays, diffDays, fmtDate, forecast, classify, stats, headline, PHASE_META, parseISO } from './cycle.js';
import { $, $$, esc, openSheet, closeSheet, confirmSheet, toast, shareOrCopy, copyText, ringSVG } from './ui.js';
import { topbar } from './views.js';
import {
  shareLink, makeShareCode, decodeShareCode, hashPin, readConnectHash, clearHash,
  syncNow, syncEnabled, SUPABASE_SQL, exportJSON, exportCSV, download,
} from './connect.js';

/* =================================================================
   MORE — the menu
   ================================================================= */

export function moreView() {
  const s = get();
  return {
    html: `
      ${topbar(s, 'More')}
      <div class="screen">
        <div class="rows">
          <button class="row" data-go="connect"><span class="em">🔗</span><span class="body">
            <span class="t">Share with a partner</span>
            <span class="d">${s.connection ? `Connected to ${esc(s.connection.name)}` : 'Send your cycle dates to someone you trust'}</span>
          </span><span class="chev">›</span></button>
          ${s.connection ? `<button class="row" data-go="partner"><span class="em">👤</span><span class="body">
            <span class="t">${esc(s.connection.name)}'s cycle</span><span class="d">Calendar and predictions</span>
          </span><span class="chev">›</span></button>` : ''}
        </div>

        <div class="rows">
          <button class="row" data-go="settings-cycle"><span class="em">🌘</span><span class="body">
            <span class="t">Cycle settings</span><span class="d">Length, period, luteal phase, fertile window</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-go="settings-categories"><span class="em">🏷️</span><span class="body">
            <span class="t">Tracking categories</span><span class="d">${s.settings.enabledCategories.length} of ${CATEGORIES.length} on</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-go="reminders"><span class="em">🔔</span><span class="body">
            <span class="t">Reminders</span><span class="d">Period, fertile window, pill</span>
          </span><span class="chev">›</span></button>
        </div>

        <div class="rows">
          <button class="row" data-go="privacy"><span class="em">🔒</span><span class="body">
            <span class="t">Passcode</span><span class="d">${s.settings.pin ? 'On' : 'Off'}</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-go="data"><span class="em">💾</span><span class="body">
            <span class="t">Your data</span><span class="d">Back up, export, import, erase</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-theme><span class="em">🌗</span><span class="body">
            <span class="t">Appearance</span><span class="d">${document.documentElement.dataset.theme === 'light' ? 'Light' : 'Dark'}</span>
          </span><span class="chev">›</span></button>
        </div>

        <div class="rows">
          <button class="row" data-go="about"><span class="em">ℹ️</span><span class="body">
            <span class="t">About Orbit</span><span class="d">How predictions work, and their limits</span>
          </span><span class="chev">›</span></button>
        </div>

        <p class="note" style="text-align:center;padding:8px 16px 0">
          Everything is stored on this device. Nothing is sent anywhere unless you turn on sharing.
        </p>
      </div>`,
    mount(root) {
      $('[data-theme]', root).addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('orbit.theme', next);
        window.__orbit.render();
      });
    },
  };
}

/* =================================================================
   CONNECT
   ================================================================= */

export function connectView() {
  const s = get();
  const link = shareLink(s);
  const sync = s.sync;

  return {
    html: `
      ${topbar(s, 'Share', backBtn())}
      <div class="screen">
        <div class="banner"><span class="em">🛡️</span><div>
          Only cycle dates travel: period days, fertile window, ovulation and PMS. Symptoms, moods, notes and numbers stay on this device.
        </div></div>

        <div class="card">
          <h2>Send a share link</h2>
          <p class="note" style="margin-bottom:14px">
            The link carries your cycle history and a year of predictions. Your partner opens it once and installs the app themselves.
            Send a fresh link now and then so their predictions stay in step with yours.
          </p>
          ${link ? `
            <button class="btn" data-share>Send my cycle</button>
            <button class="btn ghost" data-copy>Copy link</button>
            <p class="mono" style="margin-top:12px;color:var(--faint)">${esc(link.slice(0, 72))}…</p>`
            : '<p class="note">Log a period first — there is nothing to share yet.</p>'}
        </div>

        <div class="card">
          <h2>Follow someone else's cycle</h2>
          <div class="field">
            <label>Paste the link or code they sent you</label>
            <textarea class="input" data-incoming placeholder="https://…#connect=… or the raw code" style="min-height:70px"></textarea>
          </div>
          <button class="btn ghost" data-accept>Connect</button>
          ${s.connection ? `<button class="btn warn" style="margin-top:9px" data-disconnect>Disconnect from ${esc(s.connection.name)}</button>` : ''}
        </div>

        <div class="section-title">Live sync</div>
        <div class="card">
          <p class="note" style="margin-bottom:14px">
            Optional. Point both phones at one small database and cycles update on their own. The shared payload is encrypted
            on-device with AES-GCM; PBKDF2-SHA256 (600,000 iterations) derives the encryption key. The database row id uses a
            one-way room token rather than your room name. Setup steps are in the README.
          </p>
          <div class="field"><label>Project URL</label>
            <input class="input" data-sync="url" value="${esc(sync.url)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off"></div>
          <div class="field"><label>Anon key</label>
            <input class="input" data-sync="key" value="${esc(sync.key)}" placeholder="eyJhbGci…" autocapitalize="off" autocorrect="off"></div>
          <div class="field"><label>Room name — the same word on both phones</label>
            <input class="input" data-sync="room" value="${esc(sync.room)}" placeholder="e.g. hazel-orbit" autocapitalize="off" autocorrect="off"></div>
          <div class="field"><label>Passphrase — the same on both phones</label>
            <input class="input" type="password" data-sync="pass" value="${esc(sync.pass)}" placeholder="something long and memorable"></div>
          <div class="row" style="padding:8px 0;border:none">
            <span class="body"><span class="t">Sync on</span></span>
            <button class="switch" role="switch" data-sync-on aria-checked="${sync.on}"></button>
          </div>
          <button class="btn ghost" style="margin-top:10px" data-sync-now>Sync now</button>
          <p class="note" style="margin-top:10px">
            ${sync.lastPull ? `Last synced ${new Date(sync.lastPull).toLocaleString()}` : 'Not synced yet'}
          </p>
          <button class="btn ghost" style="margin-top:9px" data-sql>Show the database setup</button>
        </div>
      </div>`,

    mount(root) {
      $('[data-share]', root)?.addEventListener('click', async () => {
        const res = await shareOrCopy(link, 'My cycle');
        if (res === 'copied') toast('Link copied');
        else if (res === 'failed') toast('Could not share — copy it manually');
      });
      $('[data-copy]', root)?.addEventListener('click', async () => {
        toast((await copyText(link)) ? 'Link copied' : 'Copy failed');
      });

      $('[data-accept]', root).addEventListener('click', () => {
        const raw = $('[data-incoming]', root).value.trim();
        if (!raw) return toast('Paste the link first');
        const m = raw.match(/connect=([A-Za-z0-9\-_]+)/);
        const code = m ? m[1] : raw;
        try {
          const parsed = decodeShareCode(code);
          update((st) => {
            st.connection = { name: parsed.name, code, sharedAt: parsed.sharedAt, via: 'link' };
          });
          toast(`Connected to ${parsed.name}`);
          window.__orbit.go('partner');
        } catch (err) {
          toast(err.message);
        }
      });

      $('[data-disconnect]', root)?.addEventListener('click', () => {
        confirmSheet('Disconnect?', 'Their cycle will be removed from this phone. You can reconnect any time with a new link.', 'Disconnect', () => {
          update((st) => { st.connection = null; });
          toast('Disconnected');
          window.__orbit.render();
        });
      });

      $$('[data-sync]', root).forEach((inp) => inp.addEventListener('change', () => {
        update((st) => { st.sync[inp.dataset.sync] = inp.value.trim(); });
      }));

      $('[data-sync-on]', root).addEventListener('click', (e) => {
        const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
        update((st) => { st.sync.on = on; });
        e.currentTarget.setAttribute('aria-checked', on);
      });

      $('[data-sync-now]', root).addEventListener('click', async () => {
        if (!syncEnabled()) return toast('Fill in all four fields and turn sync on');
        toast('Syncing…');
        try {
          const r = await syncNow();
          toast(r.found ? 'Synced' : 'Sent — nothing from them yet');
          window.__orbit.render();
        } catch (err) {
          toast(String(err.message).slice(0, 90));
        }
      });

      $('[data-sql]', root).addEventListener('click', () => {
        openSheet({
          title: 'Database setup',
          body: `<p class="note" style="margin:8px 0 14px">Create a free Supabase project, open the SQL editor and run this once. Then copy the project URL and the anon key from Project Settings › API.</p>
            <pre class="mono" style="background:var(--ink-1);border:1px solid var(--border);border-radius:12px;padding:14px;white-space:pre-wrap">${esc(SUPABASE_SQL)}</pre>
            <button class="btn ghost" style="margin-top:12px" data-copysql>Copy the SQL</button>`,
          onMount(sheet) {
            sheet.querySelector('[data-copysql]').addEventListener('click', async () => {
              toast((await copyText(SUPABASE_SQL)) ? 'SQL copied' : 'Copy failed');
            });
          },
        });
      });
    },
  };
}

/* =================================================================
   PARTNER VIEW
   ================================================================= */

let partnerMonth = null;

export function partnerView() {
  const s = get();
  if (!s.connection) {
    return { html: `${topbar(s, 'Partner', backBtn())}<div class="screen"><div class="empty"><span class="em">🔗</span><p>No one is connected yet.</p><button class="btn" data-go="connect">Set up sharing</button></div></div>`, mount: () => {} };
  }

  let theirs;
  try {
    theirs = decodeShareCode(s.connection.code).state;
  } catch {
    return { html: `${topbar(s, 'Partner', backBtn())}<div class="screen"><div class="empty"><span class="em">⚠️</span><p>That share link could not be read. Ask for a fresh one.</p><button class="btn ghost" data-go="connect">Go to sharing</button></div></div>`, mount: () => {} };
  }

  const h = headline(theirs);
  const t = today();
  const f = h.f;
  const win = h.cls?.win;
  const meta = PHASE_META[h.phase] || {};

  const ringDays = [];
  if (win) {
    const soFar = diffDays(win.start, t) + 1;
    const len = Math.max(win.length || h.stats.avgCycle, soFar);
    for (let i = 0; i < len; i++) {
      const date = addDays(win.start, i);
      const c = classify(date, theirs, f);
      ringDays.push({ phase: c.phase, predicted: date > t, isToday: date === t });
    }
  }

  const now = parseISO(t);
  if (!partnerMonth) partnerMonth = { y: now.getFullYear(), m: now.getMonth() };

  const soon = [];
  f.windows.forEach((w) => {
    if (w.start > t) soon.push({ date: w.start, label: 'Period starts', color: 'var(--menstrual)' });
    if (w.pmsStart > t) soon.push({ date: w.pmsStart, label: 'PMS may begin', color: 'var(--pms)' });
    if (w.fertileStart > t) soon.push({ date: w.fertileStart, label: 'Fertile window opens', color: 'var(--fertile)' });
  });
  soon.sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    html: `
      ${topbar(s, esc(s.connection.name), backBtn())}
      <div class="screen">
        <div class="ring-wrap">
          ${ringSVG(ringDays)}
          <div class="ring-center">
            <div class="ring-day"><small>DAY</small>${h.cycleDay ?? '–'}</div>
            <div class="ring-phase" style="color:${meta.color}">${esc(meta.label || '')}</div>
          </div>
        </div>
        <div class="ring-headline">${esc(h.title)}</div>
        <div class="ring-sub">${esc(h.sub)}</div>

        <div class="card" style="margin-top:16px">
          <h2>What this phase usually means</h2>
          <p class="phase-blurb">${esc(meta.blurb || '')}</p>
        </div>

        <div class="card">
          <h2>Coming up</h2>
          ${soon.slice(0, 4).map((e) => `
            <div class="freq-row" style="margin-bottom:12px">
              <span style="width:10px;height:10px;border-radius:3px;background:${e.color};flex:none"></span>
              <span style="flex:1">${esc(e.label)}</span>
              <span style="color:var(--muted);font-size:12.5px">${esc(fmtDate(e.date))} · in ${diffDays(t, e.date)} d</span>
            </div>`).join('')}
        </div>

        <div class="card flush">
          <div class="cal-head" style="padding:0 4px">
            <button class="icon-btn" data-pnav="-1" aria-label="Previous month">‹</button>
            <span class="m">${esc(new Date(partnerMonth.y, partnerMonth.m).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span>
            <button class="icon-btn" data-pnav="1" aria-label="Next month">›</button>
          </div>
          ${partnerGrid(partnerMonth.y, partnerMonth.m, theirs, f)}
          <div class="legend" style="padding:0 4px">
            <span><i style="background:var(--menstrual)"></i>Period</span>
            <span><i style="background:color-mix(in srgb,var(--fertile) 45%,transparent)"></i>Fertile</span>
            <span><i style="background:color-mix(in srgb,var(--pms) 45%,transparent)"></i>PMS</span>
          </div>
        </div>

        <p class="note" style="text-align:center">
          Dates only. ${esc(s.connection.name)}'s symptoms, moods and notes are not shared.
          ${s.connection.sharedAt ? `Last updated ${fmtDate(iso(new Date(s.connection.sharedAt)))}.` : ''}
        </p>
      </div>`,

    mount(root) {
      $$('[data-pnav]', root).forEach((b) => b.addEventListener('click', () => {
        let { y, m } = partnerMonth;
        m += Number(b.dataset.pnav);
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        partnerMonth = { y, m };
        window.__orbit.render();
      }));
    },
  };
}

function partnerGrid(y, m, st, f) {
  const t = today();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() - 1 + 7) % 7;
  const start = new Date(y, m, 1 - lead);
  const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = iso(d);
    const c = classify(key, st, f);
    const cls = ['cal-cell'];
    if (d.getMonth() !== m) cls.push('out');
    if (key === t) cls.push('today');
    if (c.isPeriod && !c.predicted) cls.push('period');
    else if (c.isPeriod) cls.push('period-pred');
    else if (c.isOvulation) cls.push('ovulation');
    else if (c.isFertile) cls.push('fertile');
    else if (c.isPMS) cls.push('pms');
    cells += `<div class="${cls.join(' ')}"><span class="n">${d.getDate()}</span></div>`;
  }
  return `<div class="dow-row">${dows.map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-grid">${cells}</div>`;
}

/* =================================================================
   CYCLE SETTINGS
   ================================================================= */

export function settingsCycleView() {
  const s = get();
  const st = stats(s);
  return {
    html: `
      ${topbar(s, 'Cycle settings', backBtn())}
      <div class="screen">
        <div class="card">
          <h2>Typical cycle length</h2>
          <div class="stepper">
            <button data-step="avgCycle:-1" aria-label="Shorter">−</button>
            <span class="v" data-v="avgCycle">${s.settings.avgCycle}<small> days</small></span>
            <button data-step="avgCycle:1" aria-label="Longer">+</button>
          </div>
          <p class="note" style="margin-top:12px">
            ${st.tracked >= 3
              ? `Your logged average is ${st.avgCycle} days, and that is what predictions use. This number only fills the gap before you have three cycles.`
              : 'Used until you have three logged cycles, after which your own average takes over.'}
          </p>
        </div>

        <div class="card">
          <h2>Typical period length</h2>
          <div class="stepper">
            <button data-step="avgPeriod:-1" aria-label="Shorter">−</button>
            <span class="v" data-v="avgPeriod">${s.settings.avgPeriod}<small> days</small></span>
            <button data-step="avgPeriod:1" aria-label="Longer">+</button>
          </div>
        </div>

        <div class="card">
          <h2>Luteal phase</h2>
          <div class="stepper">
            <button data-step="luteal:-1" aria-label="Shorter">−</button>
            <span class="v" data-v="luteal">${s.settings.luteal}<small> days</small></span>
            <button data-step="luteal:1" aria-label="Longer">+</button>
          </div>
          <p class="note" style="margin-top:12px">The stretch between ovulation and the next period. Usually 12–14 days and fairly fixed, which is what makes ovulation predictable at all.</p>
        </div>

        <div class="rows">
          <div class="row"><span class="em">🌼</span><span class="body">
            <span class="t">Show fertile window</span><span class="d">Estimated from cycle length, not measured</span>
          </span><button class="switch" role="switch" data-t="showFertile" aria-checked="${s.settings.showFertile}"></button></div>
          <div class="row"><span class="em">📆</span><span class="body">
            <span class="t">Week starts on Monday</span>
          </span><button class="switch" role="switch" data-t="weekStartMon" aria-checked="${s.settings.weekStart === 1}"></button></div>
        </div>

        <div class="banner"><span class="em">⚠️</span><div>
          A cycle app is not contraception. Fertile-window estimates are a rough guide built from past dates —
          sperm can survive several days and ovulation moves around. For preventing pregnancy, use a method
          designed for it and talk to a clinician.
        </div></div>
      </div>`,
    mount(root) {
      $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => {
        const [key, delta] = b.dataset.step.split(':');
        const bounds = { avgCycle: [18, 60], avgPeriod: [1, 14], luteal: [8, 20] }[key];
        update((st2) => {
          const v = st2.settings[key] + Number(delta);
          st2.settings[key] = Math.min(bounds[1], Math.max(bounds[0], v));
        });
        $(`[data-v="${key}"]`, root).innerHTML = `${get().settings[key]}<small> days</small>`;
      }));

      $$('[data-t]', root).forEach((b) => b.addEventListener('click', () => {
        const on = b.getAttribute('aria-checked') !== 'true';
        update((st2) => {
          if (b.dataset.t === 'weekStartMon') st2.settings.weekStart = on ? 1 : 0;
          else st2.settings[b.dataset.t] = on;
        });
        b.setAttribute('aria-checked', on);
      }));
    },
  };
}

/* =================================================================
   CATEGORY PICKER
   ================================================================= */

export function categoriesView() {
  const s = get();
  const on = new Set(s.settings.enabledCategories);
  return {
    html: `
      ${topbar(s, 'Tracking categories', backBtn())}
      <div class="screen">
        <p class="note" style="margin-bottom:14px">Turn off anything you do not want to see when logging. Nothing already recorded is deleted.</p>
        <div class="rows">
          ${CATEGORIES.map((c) => `
            <div class="row"><span class="em">${c.emoji}</span><span class="body">
              <span class="t">${esc(c.label)}</span>
              <span class="d">${c.options.slice(0, 3).map((o) => esc(o.label)).join(' · ')}${c.options.length > 3 ? ' …' : ''}</span>
            </span><button class="switch" role="switch" data-c="${c.id}" aria-checked="${on.has(c.id)}"></button></div>`).join('')}
        </div>

        <div class="section-title">Custom tags</div>
        <div class="card">
          <div class="field"><label>Add anything you want to track</label>
            <input class="input" data-new-tag maxlength="40" placeholder="e.g. migraine trigger, physio, travel"></div>
          <button class="btn ghost" data-add-tag>Add custom tag</button>
          ${s.settings.customTags.length ? `<div class="chips" style="margin-top:14px">
            ${s.settings.customTags.map((t) => `<button class="chip" data-del-tag="${t.id}" title="Remove tag">🏷️ ${esc(t.label)} ×</button>`).join('')}
          </div>` : '<p class="note" style="margin-top:12px">Custom tags appear as their own tracking category.</p>'}
        </div>

        <div class="section-title">Quick log on the home screen</div>
        <div class="card">
          <div class="chips">
            ${CATEGORIES.map((c) => `
              <button class="chip" data-q="${c.id}" aria-pressed="${s.settings.quickLog.includes(c.id)}">${c.emoji} ${esc(c.label)}</button>`).join('')}
          </div>
          <p class="note" style="margin-top:12px">Pick up to four.</p>
        </div>
      </div>`,
    mount(root) {
      $('[data-add-tag]', root)?.addEventListener('click', () => {
        const inp = $('[data-new-tag]', root);
        const label = inp.value.trim();
        if (!label) return;
        if (get().settings.customTags.some((t) => t.label.toLowerCase() === label.toLowerCase())) return toast('That tag already exists');
        const bytes = crypto.getRandomValues(new Uint8Array(5));
        const id = 'tag-' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        update((st) => {
          st.settings.customTags.push({ id, label });
          if (!st.settings.enabledCategories.includes('customTags')) st.settings.enabledCategories.push('customTags');
        });
        window.__orbit.render();
      });

      $$('[data-del-tag]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.delTag;
        const tag = get().settings.customTags.find((t) => t.id === id);
        if (!tag) return;
        const yes = await confirmSheet('Remove custom tag?', `Remove “${tag.label}” and its logged entries?`, 'Remove');
        if (!yes) return;
        update((st) => {
          st.settings.customTags = st.settings.customTags.filter((t) => t.id !== id);
          Object.values(st.days).forEach((day) => {
            if (!Array.isArray(day.customTags)) return;
            day.customTags = day.customTags.filter((x) => x !== id);
            if (!day.customTags.length) delete day.customTags;
          });
        });
        window.__orbit.render();
      }));

      $$('[data-c]', root).forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.c;
        const nowOn = b.getAttribute('aria-checked') !== 'true';
        update((st) => {
          const set = new Set(st.settings.enabledCategories);
          if (nowOn) set.add(id); else set.delete(id);
          st.settings.enabledCategories = [...CATEGORIES.filter((c) => set.has(c.id)).map((c) => c.id), ...(set.has('customTags') ? ['customTags'] : [])];
        });
        b.setAttribute('aria-checked', nowOn);
      }));

      $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.q;
        const s2 = get();
        if (s2.settings.quickLog.includes(id)) {
          update((st) => { st.settings.quickLog = st.settings.quickLog.filter((x) => x !== id); });
        } else if (s2.settings.quickLog.length >= 4) {
          return toast('Four is the limit');
        } else {
          update((st) => { st.settings.quickLog.push(id); });
        }
        b.setAttribute('aria-pressed', get().settings.quickLog.includes(id));
      }));
    },
  };
}

/* =================================================================
   REMINDERS
   ================================================================= */

export function remindersView() {
  const s = get();
  const r = s.settings.reminders;
  const perm = notifySupport() ? Notification.permission : 'unsupported';

  return {
    html: `
      ${topbar(s, 'Reminders', backBtn())}
      <div class="screen">
        ${perm !== 'granted' ? `
          <div class="banner"><span class="em">🔔</span><div>
            ${perm === 'unsupported'
              ? 'This browser cannot show notifications. Reminders will appear as a banner inside the app instead.'
              : 'Allow notifications so reminders can reach you.'}
            ${perm === 'default' ? '<br><button class="btn ghost" style="margin-top:10px" data-perm>Allow notifications</button>' : ''}
          </div></div>` : ''}

        <div class="rows">
          <div class="row"><span class="em">🩸</span><span class="body">
            <span class="t">Period is coming</span><span class="d">${r.periodSoon.daysBefore} days before it is due</span>
          </span><button class="switch" role="switch" data-r="periodSoon" aria-checked="${r.periodSoon.on}"></button></div>
          <div class="row"><span class="em">⏳</span><span class="body">
            <span class="t">Period is late</span><span class="d">If nothing is logged by the predicted day</span>
          </span><button class="switch" role="switch" data-r="periodLate" aria-checked="${r.periodLate.on}"></button></div>
          <div class="row"><span class="em">🌼</span><span class="body">
            <span class="t">Fertile window opens</span>
          </span><button class="switch" role="switch" data-r="fertileStart" aria-checked="${r.fertileStart.on}"></button></div>
          <div class="row"><span class="em">💊</span><span class="body">
            <span class="t">Take the pill</span><span class="d">Daily at ${esc(r.pill.time)}</span>
          </span><button class="switch" role="switch" data-r="pill" aria-checked="${r.pill.on}"></button></div>
        </div>

        <div class="card">
          <h2>Timing</h2>
          <div class="field"><label>Warn me this many days before my period</label>
            <select class="input" data-days>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${r.periodSoon.daysBefore === n ? 'selected' : ''}>${n} day${n > 1 ? 's' : ''}</option>`).join('')}
            </select></div>
          <div class="field"><label>Pill reminder time</label>
            <input class="input" type="time" data-pilltime value="${esc(r.pill.time)}"></div>
        </div>

        <p class="note">
          Reminders are checked whenever you open Orbit, and while it is open in the background. A web app cannot
          wake a sleeping phone the way a store-installed app can, so treat these as a nudge rather than an alarm.
        </p>
      </div>`,
    mount(root) {
      $('[data-perm]', root)?.addEventListener('click', async () => {
        if (!notifySupport()) return toast('This browser cannot show notifications');
        try {
          const res = await Notification.requestPermission();
          toast(res === 'granted' ? 'Notifications on' : 'Not allowed');
        } catch { toast('Not allowed'); }
        window.__orbit.render();
      });
      $$('[data-r]', root).forEach((b) => b.addEventListener('click', async () => {
        const on = b.getAttribute('aria-checked') !== 'true';
        if (on && notifySupport() && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch { /* denied by policy */ }
        }
        update((st) => { st.settings.reminders[b.dataset.r].on = on; });
        b.setAttribute('aria-checked', on);
      }));
      $('[data-days]', root).addEventListener('change', (e) => {
        update((st) => { st.settings.reminders.periodSoon.daysBefore = Number(e.target.value); });
      });
      $('[data-pilltime]', root).addEventListener('change', (e) => {
        update((st) => { st.settings.reminders.pill.time = e.target.value; });
      });
    },
  };
}

/** Fire any reminder that is due. Called on load and when the tab regains focus. */
export function checkReminders() {
  try { runReminders(); } catch (err) { console.warn('Reminder check skipped:', err); }
}

function runReminders() {
  const s = get();
  if (s.profile.role === 'partner') return;
  const r = s.settings.reminders;
  const t = today();
  const seenKey = 'orbit.notified';
  const seen = JSON.parse(localStorage.getItem(seenKey) || '{}');

  const st = stats(s);
  if (!st.cycles.length) return;
  const last = st.cycles[st.cycles.length - 1];
  const expected = addDays(last.start, st.avgCycle);
  const f = forecast(s);
  const cls = classify(t, s, f);

  const fire = (id, title, body) => {
    if (seen[id] === t) return;
    seen[id] = t;
    localStorage.setItem(seenKey, JSON.stringify(seen));
    notify(title, body);
  };

  if (r.periodSoon.on) {
    const d = diffDays(t, expected);
    if (d === r.periodSoon.daysBefore) {
      fire('soon', 'Period expected soon', `Your period is due in ${d} day${d > 1 ? 's' : ''}, around ${fmtDate(expected)}.`);
    }
  }
  if (r.periodLate.on && !cls.isPeriod) {
    const late = diffDays(expected, t);
    if (late > 0 && late % 2 === 1) {
      fire(`late-${late}`, 'Period is late', `${late} day${late > 1 ? 's' : ''} past the predicted date. Cycles shift for many reasons.`);
    }
  }
  if (r.fertileStart.on && s.settings.showFertile) {
    const w = f.windows.find((x) => x.fertileStart === t);
    if (w) fire('fertile', 'Fertile window opens today', `Ovulation is estimated around ${fmtDate(w.ovulation)}.`);
  }
  if (r.pill.on) {
    const [hh, mm] = r.pill.time.split(':').map(Number);
    const now = new Date();
    if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
      const taken = (s.days[t]?.medication || []).some((x) => x.startsWith('pill'));
      if (!taken) fire('pill', 'Pill reminder', 'Log it under Medication once you have taken it.');
    }
  }
}

/** True only when this browser really can show notifications. */
function notifySupport() {
  try {
    return typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function';
  } catch { return false; }
}

function notify(title, body) {
  if (!notifySupport() || Notification.permission !== 'granted') { toast(title); return; }
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title };
  const direct = () => { try { new Notification(title, opts); } catch { toast(title); } };
  try {
    const ready = navigator.serviceWorker && navigator.serviceWorker.ready;
    if (ready && typeof ready.then === 'function') {
      ready.then((reg) => reg.showNotification(title, opts)).catch(direct);
    } else direct();
  } catch { direct(); }
}

/* =================================================================
   PRIVACY / PIN
   ================================================================= */

export function privacyView() {
  const s = get();
  return {
    html: `
      ${topbar(s, 'Passcode', backBtn())}
      <div class="screen">
        <div class="card">
          <h2>${s.settings.pin ? 'Passcode is on' : 'Set a passcode'}</h2>
          <p class="note" style="margin-bottom:16px">
            A four-digit code asked for each time Orbit opens. It keeps a casual glance out, not a determined one —
            anyone with your unlocked phone could still read the stored file. Your phone's own lock is the real protection.
          </p>
          ${s.settings.pin
            ? '<button class="btn warn" data-off>Turn passcode off</button>'
            : `<div class="field"><label>Four digits</label>
                 <input class="input" type="password" inputmode="numeric" maxlength="4" data-pin placeholder="••••"></div>
               <button class="btn" data-on>Turn passcode on</button>`}
        </div>
      </div>`,
    mount(root) {
      $('[data-on]', root)?.addEventListener('click', async () => {
        const v = $('[data-pin]', root).value.trim();
        if (!/^\d{4}$/.test(v)) return toast('Four digits, please');
        const rec = await hashPin(v);
        update((st) => { st.settings.pin = rec; });
        toast('Passcode on');
        window.__orbit.render();
      });
      $('[data-off]', root)?.addEventListener('click', () => {
        update((st) => { st.settings.pin = null; });
        toast('Passcode off');
        window.__orbit.render();
      });
    },
  };
}

export function lockScreen(onPass) {
  const wrap = document.createElement('div');
  wrap.className = 'centre';
  let buf = '';
  wrap.innerHTML = `
    <h1 style="text-align:center">Orbit</h1>
    <p class="lead" style="text-align:center">Enter your passcode</p>
    <div class="pin-dots">${'<i></i>'.repeat(4)}</div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      <button style="visibility:hidden"></button>
      <button data-k="0">0</button>
      <button data-k="del">⌫</button>
    </div>`;

  const paint = () => {
    wrap.querySelectorAll('.pin-dots i').forEach((d, i) => d.classList.toggle('on', i < buf.length));
  };

  wrap.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.k;
    if (k === 'del') buf = buf.slice(0, -1);
    else if (buf.length < 4) buf += k;
    paint();
    if (buf.length === 4) {
      const rec = get().settings.pin;
      const check = await hashPin(buf, rec.salt);
      if (check.hash === rec.hash) { wrap.remove(); onPass(); }
      else {
        buf = '';
        paint();
        wrap.querySelector('.pin-dots').animate(
          [{ transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
          { duration: 240 },
        );
      }
    }
  }));

  document.body.appendChild(wrap);
}

/* =================================================================
   DATA
   ================================================================= */

export function dataView() {
  const s = get();
  const dayCount = Object.keys(s.days).length;
  const st = stats(s);
  return {
    html: `
      ${topbar(s, 'Your data', backBtn())}
      <div class="screen">
        <div class="stat-row">
          <div class="stat"><div class="v">${dayCount}</div><div class="k">Days logged</div></div>
          <div class="stat"><div class="v">${st.cycles.length}</div><div class="k">Cycles</div></div>
          <div class="stat"><div class="v">${Math.round(new Blob([JSON.stringify(s)]).size / 1024)}<small>kb</small></div><div class="k">On device</div></div>
        </div>

        <div class="section-title">Back up</div>
        <div class="rows">
          <button class="row" data-json><span class="em">📦</span><span class="body">
            <span class="t">Download a full backup</span><span class="d">JSON — restores everything exactly</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-csv><span class="em">📊</span><span class="body">
            <span class="t">Export as a spreadsheet</span><span class="d">CSV — one row per logged day</span>
          </span><span class="chev">›</span></button>
          <button class="row" data-import><span class="em">📥</span><span class="body">
            <span class="t">Restore from a backup</span><span class="d">Replaces what is on this device</span>
          </span><span class="chev">›</span></button>
        </div>

        <div class="section-title">Start over</div>
        <div class="rows">
          <button class="row danger" data-wipe><span class="em">🗑️</span><span class="body">
            <span class="t">Erase everything</span><span class="d">Cannot be undone</span>
          </span></button>
        </div>

        <p class="note" style="margin-top:16px">
          Back up now and then. Clearing your browser's site data, or deleting the app from your home screen on some
          phones, takes the stored file with it.
        </p>
      </div>`,
    mount(root) {
      $('[data-json]', root).addEventListener('click', () => {
        download(`orbit-backup-${today()}.json`, exportJSON());
        toast('Backup downloaded');
      });
      $('[data-csv]', root).addEventListener('click', () => {
        download(`orbit-${today()}.csv`, exportCSV(), 'text/csv');
        toast('CSV downloaded');
      });
      $('[data-import]', root).addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json,.json';
        inp.onchange = async () => {
          const file = inp.files[0];
          if (!file) return;
          try {
            const parsed = JSON.parse(await file.text());
            const data = parsed.data || parsed;
            if (!data.days) throw new Error('not an Orbit backup');
            confirmSheet('Restore this backup?', `It holds ${Object.keys(data.days).length} logged days and will replace what is on this device.`, 'Restore', () => {
              replaceAll(data);
              toast('Restored');
              window.__orbit.go('cycle');
            });
          } catch (err) {
            toast('That file is not an Orbit backup');
          }
        };
        inp.click();
      });
      $('[data-wipe]', root).addEventListener('click', () => {
        confirmSheet('Erase everything?', 'Every logged day, setting and connection on this device will be deleted. Download a backup first if you might want it back.', 'Erase everything', () => {
          replaceAll(blankState());
          localStorage.removeItem('orbit.notified');
          toast('Erased');
          location.reload();
        });
      });
    },
  };
}

/* =================================================================
   ABOUT
   ================================================================= */

export function aboutView() {
  const s = get();
  return {
    html: `
      ${topbar(s, 'About Orbit', backBtn())}
      <div class="screen">
        <div class="card">
          <h2>How the predictions work</h2>
          <p class="phase-blurb">
            Orbit uses up to 12 recent completed cycles, gives newer cycles more weight, reduces the influence of obvious
            logging outliers, and keeps an uncertainty range instead of pretending a future date is exact. If you log a
            positive ovulation test, consistent basal body temperatures, or egg-white cervical fluid, Orbit can use those
            signals to strengthen its ovulation estimate and to learn your personal luteal length. BBT is retrospective:
            a temperature rise can support that ovulation has already happened, not guarantee that it will happen tomorrow.
          </p>
        </div>

        <div class="card">
          <h2>What it cannot do</h2>
          <p class="phase-blurb">
            No calendar or symptom algorithm can guarantee the fertile or non-fertile days of a future cycle. Illness,
            stress, travel, sleep changes, postpartum changes and many other factors can shift ovulation. Orbit is not
            contraception, a pregnancy test, or a diagnostic device. Use the estimates for awareness and planning only;
            if avoiding pregnancy matters, use a contraceptive method intended for that purpose.
          </p>
        </div>

        <div class="card">
          <h2>Where your data lives</h2>
          <p class="phase-blurb">
            In this browser's storage on this device, and nowhere else. No account, no analytics, no server — unless you
            switch on live sync, which encrypts everything on the device first. Share links carry cycle dates only.
          </p>
        </div>

        <p class="note" style="text-align:center;margin-top:18px">Orbit · built for two phones and no one else</p>
      </div>`,
    mount: () => {},
  };
}

/* =================================================================
   ONBOARDING
   ================================================================= */

export function onboarding(done) {
  const wrap = document.createElement('div');
  wrap.id = 'onboard';
  let step = 0;

  // If they arrived by tapping a share link, the code is already in the URL.
  // Pre-fill it, pre-select the partner path, and take the hash out of the bar.
  const incoming = readConnectHash();
  let incomingName = '';
  if (incoming) {
    try { incomingName = decodeShareCode(incoming).name; } catch { /* stale or malformed */ }
    clearHash();
  }

  const answers = {
    name: '',
    role: incoming ? 'partner' : 'tracker',
    lastStart: '',
    periodLen: 5,
    cycleLen: 28,
    code: incoming || '',
  };

  const steps = [
    () => `
      <h1>Orbit</h1>
      <p class="lead">A cycle tracker that keeps everything on your phone. Two questions and you are set up.</p>
      <div class="field"><label>What should it call you?</label>
        <input class="input" data-name value="${esc(answers.name)}" placeholder="Your name" autocomplete="given-name"></div>
      <div class="field"><label>Which are you doing?</label>
        <div class="chips">
          <button class="chip" data-role="tracker" aria-pressed="${answers.role === 'tracker'}">Tracking my own cycle</button>
          <button class="chip" data-role="partner" aria-pressed="${answers.role === 'partner'}">Following someone else's</button>
        </div></div>
      <button class="btn" data-next>Continue</button>`,

    () => (answers.role === 'partner' ? (incomingName ? `
      <h1>${esc(incomingName)}'s cycle</h1>
      <p class="lead">
        Ready to connect. You will see period days, the fertile window, ovulation and PMS —
        no symptoms, moods or notes.
      </p>
      <button class="btn" data-next>Connect</button>
      <button class="btn ghost" data-back>Back</button>` : `
      <h1>Connect</h1>
      <p class="lead">Paste the link they sent you. You will see their period, fertile window and PMS dates — nothing else.</p>
      <div class="field"><label>Share link or code</label>
        <textarea class="input" data-code placeholder="https://…#connect=…" style="min-height:90px">${esc(answers.code)}</textarea></div>
      <button class="btn" data-next>Connect</button>
      <button class="btn ghost" data-back>Back</button>`)
      : `
      <h1>Your last period</h1>
      <p class="lead">The first day it started. A rough guess is fine — it corrects itself as you log.</p>
      <div class="field"><label>First day of bleeding</label>
        <input class="input" type="date" data-last max="${today()}" value="${answers.lastStart}"></div>
      <div class="field"><label>How many days did it last?</label>
        <div class="stepper"><button data-p="-1">−</button><span class="v" data-pv>${answers.periodLen}<small> days</small></span><button data-p="1">+</button></div></div>
      <button class="btn" data-next>Continue</button>
      <button class="btn ghost" data-back>Back</button>`),

    () => `
      <h1>Cycle length</h1>
      <p class="lead">First day of one period to the first day of the next. If you are unsure, leave it at 28 — your own average takes over after three cycles.</p>
      <div class="stepper" style="justify-content:center;margin:26px 0">
        <button data-c="-1">−</button><span class="v" data-cv>${answers.cycleLen}<small> days</small></span><button data-c="1">+</button>
      </div>
      <button class="btn" data-next>Start tracking</button>
      <button class="btn ghost" data-back>Back</button>`,
  ];

  // A tapped share link opens straight on the connect step.
  if (incoming) step = 1;

  function paint() {
    wrap.className = 'centre';
    wrap.innerHTML = steps[step]();

    wrap.querySelector('[data-name]')?.addEventListener('input', (e) => { answers.name = e.target.value; });
    wrap.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => {
      answers.role = b.dataset.role;
      wrap.querySelectorAll('[data-role]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.role === answers.role));
    }));
    wrap.querySelector('[data-last]')?.addEventListener('change', (e) => { answers.lastStart = e.target.value; });
    wrap.querySelector('[data-code]')?.addEventListener('input', (e) => { answers.code = e.target.value; });

    wrap.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
      answers.periodLen = Math.min(14, Math.max(1, answers.periodLen + Number(b.dataset.p)));
      wrap.querySelector('[data-pv]').innerHTML = `${answers.periodLen}<small> days</small>`;
    }));
    wrap.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      answers.cycleLen = Math.min(60, Math.max(18, answers.cycleLen + Number(b.dataset.c)));
      wrap.querySelector('[data-cv]').innerHTML = `${answers.cycleLen}<small> days</small>`;
    }));

    wrap.querySelector('[data-back]')?.addEventListener('click', () => { step--; paint(); });
    wrap.querySelector('[data-next]').addEventListener('click', () => {
      if (step === 1 && answers.role === 'partner') return finishPartner();
      if (step === 1 && !answers.lastStart) return toast('Pick the date your last period started');
      if (step === steps.length - 1) return finish();
      step++;
      paint();
    });
  }

  function finishPartner() {
    const m = answers.code.match(/connect=([A-Za-z0-9\-_]+)/);
    const code = m ? m[1] : answers.code.trim();
    if (!code) return toast('Paste the link they sent you');
    try {
      const parsed = decodeShareCode(code);
      update((st) => {
        st.profile.name = answers.name.trim();
        st.profile.role = 'partner';
        st.profile.onboarded = true;
        st.connection = { name: parsed.name, code, sharedAt: parsed.sharedAt, via: 'link' };
      });
      wrap.remove();
      done('partner');
    } catch (err) {
      toast(err.message);
    }
  }

  function finish() {
    update((st) => {
      st.profile.name = answers.name.trim();
      st.profile.role = 'tracker';
      st.profile.onboarded = true;
      st.settings.avgCycle = answers.cycleLen;
      st.settings.avgPeriod = answers.periodLen;
      for (let i = 0; i < answers.periodLen; i++) {
        st.days[addDays(answers.lastStart, i)] = { bleeding: i === 0 || i === 1 ? 'medium' : 'light' };
      }
    });
    wrap.remove();
    done('cycle');
  }

  paint();
  document.body.appendChild(wrap);
}

/* ---------------------------- shared ---------------------------- */

function backBtn() {
  return '<button class="icon-btn" data-back-nav aria-label="Back">‹</button>';
}
