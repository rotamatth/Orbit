// main-v5.js — routing, boot and a defensive cycle-home fallback.

import { get, update } from './state.js';
import { cycleView, calendarView, logView, analysisView } from './views.js';
import { stats, buildCycles, fmtDate, today } from './cycle.js';
import {
  moreView, connectView, partnerView, settingsCycleView, categoriesView,
  remindersView, privacyView, dataView, aboutView, onboarding, lockScreen, checkReminders,
} from './more.js';
import { readConnectHash, clearHash, decodeShareCode, syncNow, syncEnabled } from './connect.js';
import { $, $$, toast, closeSheet, openSheet, esc } from './ui.js';

const ROUTES = {
  cycle: cycleView,
  calendar: calendarView,
  log: logView,
  analysis: analysisView,
  more: moreView,
  connect: connectView,
  partner: partnerView,
  'settings-cycle': settingsCycleView,
  'settings-categories': categoriesView,
  reminders: remindersView,
  privacy: privacyView,
  data: dataView,
  about: aboutView,
};

const TABS = [
  { id: 'cycle', glyph: '◐', label: 'Cycle' },
  { id: 'calendar', glyph: '▦', label: 'Calendar' },
  { id: 'log', glyph: '+', label: 'Track', fab: true },
  { id: 'analysis', glyph: '◔', label: 'Analysis' },
  { id: 'more', glyph: '≡', label: 'More' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

let route = 'cycle';
let params = {};
let stack = [];
const scrollMemory = {};

function el() { return document.getElementById('app'); }

function safeCycleFallback(error) {
  const s = get();
  const st = stats(s);
  const cycles = buildCycles(s);
  const recent = cycles.slice(-4).reverse();
  const last = recent[0];

  console.warn('Orbit cycle view fell back safely:', error);

  return {
    html: `
      <div class="topbar"><div style="flex:1;min-width:0"><h1>${s.profile.name ? `Hello, ${esc(s.profile.name)}` : 'Your cycle'}</h1></div></div>
      <div class="screen">
        <div class="card ux-safe-cycle-card">
          <span class="ux-kicker">Cycle history saved</span>
          <h2 style="font-size:20px;color:var(--bone);margin-top:5px">Your data is here</h2>
          <p class="phase-blurb">
            Orbit has your period history, but there is not enough consistent timing information yet to place today inside a current cycle window.
            Nothing has been deleted. Add another known period when you have it, or keep tracking normally.
          </p>
          ${last ? `<div class="ux-safe-last-period"><span>Last recorded period</span><strong>${esc(fmtDate(last.start, { day:'numeric', month:'long', year:'numeric' }))}</strong></div>` : ''}
          <div class="ux-cycle-stats" style="margin-top:16px">
            <div><strong>${cycles.length}</strong><span>period${cycles.length === 1 ? '' : 's'} logged</span></div>
            <div><strong>${st.tracked || 0}</strong><span>complete cycles</span></div>
            <div><strong>${st.tracked ? Math.round(st.avgCycle) : '—'}</strong><span>avg cycle</span></div>
          </div>
          <button class="btn" style="margin-top:18px" data-safe-calendar>See cycle calendar</button>
          <button class="btn ghost" data-safe-track>Track a day</button>
          <button class="btn ghost" data-safe-period>Add a past period</button>
        </div>
        <p class="note" style="text-align:center;margin-top:14px">Predictions appear only when Orbit can calculate them without inventing a current-cycle position.</p>
      </div>`,
    mount(root) {
      $('[data-safe-calendar]', root)?.addEventListener('click', () => go('calendar'));
      $('[data-safe-track]', root)?.addEventListener('click', () => go('log', { date: today() }));
      $('[data-safe-period]', root)?.addEventListener('click', () => {
        if (window.__orbitUX?.openPastPeriod) window.__orbitUX.openPastPeriod(last?.start || today());
        else go('calendar');
      });
    },
  };
}

function render() {
  const s = get();
  let view = route;
  if (view === 'cycle' && s.profile.role === 'partner' && s.connection) view = 'partner';

  const fn = ROUTES[view] || ROUTES.cycle;
  let out;
  try {
    out = fn(params);
  } catch (err) {
    if (view === 'cycle') out = safeCycleFallback(err);
    else {
      console.error('Orbit render error:', err);
      out = {
        html: `<div class="topbar"><div><h1>Orbit</h1></div></div><div class="screen"><div class="card"><h2>This screen hit an error</h2><p class="phase-blurb">Your stored data is untouched. Return to the calendar or tracking screen.</p><button class="btn" data-safe-home>Calendar</button></div></div>`,
        mount(root) { $('[data-safe-home]', root)?.addEventListener('click', () => go('calendar')); },
      };
    }
  }

  const root = el();
  root.innerHTML = out.html + navHTML();
  try { out.mount?.(root); } catch (err) { console.warn('Orbit mount warning:', err); }
  wireChrome(root);

  const key = view + JSON.stringify(params);
  requestAnimationFrame(() => window.scrollTo(0, scrollMemory[key] || 0));
}

function navHTML() {
  const active = TAB_IDS.has(route) ? route : (stack[0]?.route || 'more');
  return `<nav class="nav" aria-label="Main"><div class="nav-inner">
    ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.fab ? 'fab' : ''}" aria-current="${t.id === active}"><span class="glyph">${t.glyph}</span><span>${t.label}</span></button>`).join('')}
  </div></nav>`;
}

function wireChrome(root) {
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  $$('[data-go]', root).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); go(b.dataset.go); }));
  $$('[data-back-nav]', root).forEach((b) => b.addEventListener('click', back));
}

export function go(next, nextParams = {}) {
  const key = route + JSON.stringify(params);
  scrollMemory[key] = window.scrollY;
  closeSheet();
  if (TAB_IDS.has(next)) stack = [];
  else if (route !== next) stack.push({ route, params });
  route = next;
  params = nextParams;
  history.pushState({ route, params }, '', location.pathname + location.search);
  render();
}

function back() {
  const prev = stack.pop();
  if (prev) { route = prev.route; params = prev.params; }
  else { route = 'more'; params = {}; }
  render();
}

window.addEventListener('popstate', () => {
  if (document.querySelector('.sheet')) { closeSheet(); return; }
  if (stack.length || !TAB_IDS.has(route)) back();
});

function handleConnectHash() {
  const code = readConnectHash();
  if (!code) return false;
  clearHash();
  try {
    const parsed = decodeShareCode(code);
    const s = get();
    openSheet({
      title: 'Cycle shared with you',
      body: `<p style="color:var(--muted);line-height:1.6;margin:8px 0 16px">${esc(parsed.name)} has shared their cycle. You will see period days, the fertile window, ovulation and PMS — no symptoms, moods or notes.</p>${s.connection ? `<p class="note" style="margin-bottom:16px">This replaces your existing connection to ${esc(s.connection.name)}.</p>` : ''}<button class="btn" data-accept>Connect</button><button class="btn ghost" data-skip>Not now</button>`,
      onMount(sheet) {
        sheet.querySelector('[data-accept]').addEventListener('click', () => {
          update((st) => { st.connection = { name: parsed.name, code, sharedAt: parsed.sharedAt, via: 'link' }; });
          closeSheet(); toast(`Connected to ${parsed.name}`); go('partner');
        });
        sheet.querySelector('[data-skip]').addEventListener('click', closeSheet);
      },
    });
    return true;
  } catch (err) { toast(err.message); return false; }
}

function start() {
  route = 'cycle';
  render();
  handleConnectHash();
  checkReminders();
  if (syncEnabled()) syncNow().then(() => render()).catch(() => {});
}

function boot() {
  const theme = localStorage.getItem('orbit.theme');
  if (theme) document.documentElement.dataset.theme = theme;
  const s = get();
  const afterUnlock = () => {
    if (!s.profile.onboarded) {
      const appRoot = el();
      appRoot.style.display = 'none';
      onboarding((where) => {
        appRoot.style.display = '';
        route = where === 'partner' ? 'partner' : 'cycle';
        start();
      });
    } else start();
  };
  if (s.settings.pin && s.profile.onboarded) lockScreen(afterUnlock);
  else afterUnlock();
}

window.__orbit = { render, go, back };

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkReminders();
    if (syncEnabled()) syncNow().then(() => render()).catch(() => {});
  }
});

window.addEventListener('load', () => {
  try { navigator.serviceWorker?.register('sw.js').catch(() => {}); } catch { /* unsupported */ }
});

let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('.cal-cell')) e.preventDefault();
  lastTouch = now;
}, { passive: false });

boot();
