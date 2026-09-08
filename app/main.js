// main.js — routing and boot.

import { get, update } from './state.js';
import { cycleView, calendarView, logView, analysisView } from './views.js';
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

function render() {
  const s = get();
  let view = route;

  // Someone who only follows a partner sees the shared cycle on the home tab.
  if (view === 'cycle' && s.profile.role === 'partner' && s.connection) view = 'partner';

  const fn = ROUTES[view] || ROUTES.cycle;
  const out = fn(params);

  const root = el();
  root.innerHTML = out.html + navHTML();
  out.mount?.(root);
  wireChrome(root);

  const key = view + JSON.stringify(params);
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollMemory[key] || 0);
  });
}

function navHTML() {
  const active = TAB_IDS.has(route) ? route : (stack[0] || 'more');
  return `
    <nav class="nav" aria-label="Main">
      <div class="nav-inner">
        ${TABS.map((t) => `
          <button data-tab="${t.id}" class="${t.fab ? 'fab' : ''}" aria-current="${t.id === active}">
            <span class="glyph">${t.glyph}</span><span>${t.label}</span>
          </button>`).join('')}
      </div>
    </nav>`;
}

function wireChrome(root) {
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  $$('[data-go]', root).forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    go(b.dataset.go);
  }));
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

/* ---------------------------- incoming share links ---------------------------- */

function handleConnectHash() {
  const code = readConnectHash();
  if (!code) return false;
  clearHash();
  try {
    const parsed = decodeShareCode(code);
    const s = get();
    openSheet({
      title: 'Cycle shared with you',
      body: `
        <p style="color:var(--muted);line-height:1.6;margin:8px 0 16px">
          ${esc(parsed.name)} has shared their cycle. You will see period days, the fertile window, ovulation and PMS —
          no symptoms, moods or notes.
        </p>
        ${s.connection ? `<p class="note" style="margin-bottom:16px">This replaces your existing connection to ${esc(s.connection.name)}.</p>` : ''}
        <button class="btn" data-accept>Connect</button>
        <button class="btn ghost" data-skip>Not now</button>`,
      onMount(sheet) {
        sheet.querySelector('[data-accept]').addEventListener('click', () => {
          update((st) => {
            st.connection = { name: parsed.name, code, sharedAt: parsed.sharedAt, via: 'link' };
          });
          closeSheet();
          toast(`Connected to ${parsed.name}`);
          go('partner');
        });
        sheet.querySelector('[data-skip]').addEventListener('click', closeSheet);
      },
    });
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

/* ---------------------------- boot ---------------------------- */

function start() {
  const s = get();
  route = s.profile.role === 'partner' && s.connection ? 'cycle' : 'cycle';
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
      // #app fills the viewport even when empty. Hide it while onboarding,
      // otherwise the body-mounted onboarding screen starts one viewport below.
      const appRoot = el();
      appRoot.style.display = 'none';
      // A share link on a fresh install jumps straight to the partner path.
      onboarding((where) => {
        appRoot.style.display = '';
        route = where === 'partner' ? 'partner' : 'cycle';
        start();
      });
    } else {
      start();
    }
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

/* service worker — makes the app work offline once installed */
window.addEventListener('load', () => {
  try {
    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch { /* file:// or a browser without service workers */ }
});

/* iOS: stop double-tap zoom swallowing taps */
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('.cal-cell')) e.preventDefault();
  lastTouch = now;
}, { passive: false });

boot();
