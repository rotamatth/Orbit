// ux-v4.js — focused UX upgrades layered on top of the existing Orbit views.
// Keeps the current data model and prediction logic intact.

import { get, update, dayHasData } from './state.js';
import { today, addDays, diffDays, parseISO, fmtDate, buildCycles, stats } from './cycle.js';
import { openSheet, closeSheet, toast, esc } from './ui.js';

const KEY = 'orbit.ux.selectedDate';
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function selectedDateFromDOM() {
  const active = document.querySelector('.date-strip .date-pill[aria-pressed="true"]');
  return active?.dataset.d || sessionStorage.getItem(KEY) || today();
}

function remember(date) {
  if (date) sessionStorage.setItem(KEY, date);
}

function go(route, params = {}) {
  if (route === 'log' && params.date) remember(params.date);
  window.__orbit?.go(route, params);
}

function fmtLong(date) {
  return fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function centeredDates(sel) {
  // Keep a 14-day strip, but centre historical dates instead of always anchoring to today.
  // Future days are never offered for health logging.
  let end = addDays(sel, 7);
  if (end > today()) end = today();
  const start = addDays(end, -13);
  const out = [];
  for (let i = 0; i < 14; i++) out.push(addDays(start, i));
  return out;
}

function rebuildDateStrip(strip, sel) {
  const dates = centeredDates(sel);
  strip.innerHTML = dates.map((d) => {
    const p = parseISO(d);
    return `
      <button class="date-pill" data-d="${d}" aria-pressed="${d === sel}">
        <span class="dow">${DOW[p.getDay()]}</span>
        <span class="num">${p.getDate()}</span>
        ${dayHasData(d) ? '<span class="dot"></span>' : '<span class="ux-empty-dot"></span>'}
      </button>`;
  }).join('');

  strip.querySelectorAll('[data-d]').forEach((b) => {
    b.addEventListener('click', () => go('log', { date: b.dataset.d }));
  });

  requestAnimationFrame(() => {
    strip.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
}

function trackToolbar(sel) {
  const bar = document.createElement('div');
  bar.className = 'ux-track-toolbar';
  bar.dataset.uxTrackToolbar = '1';
  bar.innerHTML = `
    <div class="ux-selected-date">
      <span class="ux-kicker">Tracking date</span>
      <strong>${esc(fmtLong(sel))}</strong>
      ${sel < today() ? '<span class="ux-past-badge">Past entry</span>' : '<span class="ux-today-badge">Today</span>'}
    </div>
    <div class="ux-actions">
      <label class="ux-date-jump" title="Choose any past date">
        <span>📅</span>
        <input type="date" data-ux-date value="${sel}" max="${today()}">
      </label>
      <button class="ux-small-btn" data-ux-today>Today</button>
      <button class="ux-small-btn primary" data-ux-period>Past period</button>
      <button class="ux-small-btn" data-ux-month>View month</button>
    </div>`;

  bar.querySelector('[data-ux-date]').addEventListener('change', (e) => {
    const d = e.target.value;
    if (d) go('log', { date: d });
  });
  bar.querySelector('[data-ux-today]').addEventListener('click', () => go('log', { date: today() }));
  bar.querySelector('[data-ux-period]').addEventListener('click', () => openPastPeriod(sel));
  bar.querySelector('[data-ux-month]').addEventListener('click', () => goCalendarTo(sel));
  return bar;
}

function enhanceTrack() {
  const strip = document.querySelector('.date-strip');
  if (!strip || strip.dataset.uxEnhanced === '1') return;

  const sel = selectedDateFromDOM();
  remember(sel);
  strip.dataset.uxEnhanced = '1';
  rebuildDateStrip(strip, sel);

  if (!document.querySelector('[data-ux-track-toolbar]')) {
    strip.parentNode.insertBefore(trackToolbar(sel), strip);
  }

  // Make the selected date visually unmistakable on long tracking screens.
  const screen = strip.closest('.screen');
  if (screen) screen.dataset.uxTrackingDate = sel;
}

function calendarToolbar() {
  const bar = document.createElement('div');
  bar.className = 'ux-calendar-toolbar';
  bar.dataset.uxCalendarToolbar = '1';
  bar.innerHTML = `
    <button class="ux-small-btn" data-ux-cal-today>Today</button>
    <label class="ux-date-jump ux-calendar-jump">
      <span>Jump to date</span>
      <input type="date" data-ux-cal-date max="${today()}">
    </label>
    <button class="ux-small-btn primary" data-ux-cal-period>＋ Add past period</button>`;

  bar.querySelector('[data-ux-cal-today]').addEventListener('click', () => goCalendarTo(today()));
  bar.querySelector('[data-ux-cal-date]').addEventListener('change', (e) => {
    if (e.target.value) goCalendarTo(e.target.value);
  });
  bar.querySelector('[data-ux-cal-period]').addEventListener('click', () => openPastPeriod(sessionStorage.getItem(KEY) || today()));
  return bar;
}

function currentCalendarMonth() {
  const cell = document.querySelector('.cal-cell:not(.out)[data-date]');
  if (!cell) return null;
  const d = parseISO(cell.dataset.date);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function driveCalendar(target, attempts = 0) {
  if (attempts > 30) return;
  const cur = currentCalendarMonth();
  if (!cur) return setTimeout(() => driveCalendar(target, attempts + 1), 40);
  const td = parseISO(target);
  const delta = (td.getFullYear() - cur.y) * 12 + (td.getMonth() - cur.m);
  if (delta === 0) {
    requestAnimationFrame(() => {
      const cell = document.querySelector(`.cal-cell[data-date="${target}"]`);
      cell?.classList.add('ux-focus-date');
      cell?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return;
  }
  const btn = document.querySelector(`[data-nav="${delta > 0 ? 1 : -1}"]`);
  if (!btn) return;
  btn.click();
  setTimeout(() => driveCalendar(target, attempts + 1), 35);
}

function goCalendarTo(date) {
  remember(date);
  go('calendar');
  setTimeout(() => driveCalendar(date), 40);
}

function enhanceCalendar() {
  const head = document.querySelector('.cal-head');
  if (!head || document.querySelector('[data-ux-calendar-toolbar]')) return;
  head.insertAdjacentElement('afterend', calendarToolbar());

  const note = [...document.querySelectorAll('.note')].find((x) => x.textContent.includes('Tap a day'));
  if (note) note.textContent = 'Tap any day for details, then choose “Track this day”. Use “Add past period” above to enter an older cycle in one step.';
}

function flowFor(pattern, i) {
  if (pattern === 'typical') return i < 2 ? 'medium' : 'light';
  return pattern;
}

function openPastPeriod(defaultDate = today()) {
  const startDefault = defaultDate > today() ? today() : defaultDate;
  const endDefault = addDays(startDefault, 4) > today() ? today() : addDays(startDefault, 4);

  openSheet({
    title: 'Add a past period',
    body: `
      <div class="ux-period-intro">
        Add the start and end once instead of opening every day separately. Other symptoms already logged on those dates are kept.
      </div>
      <div class="ux-period-grid">
        <div class="field">
          <label>First day</label>
          <input class="input" type="date" data-ux-period-start value="${startDefault}" max="${today()}">
        </div>
        <div class="field">
          <label>Last day</label>
          <input class="input" type="date" data-ux-period-end value="${endDefault}" max="${today()}">
        </div>
      </div>
      <div class="field">
        <label>Flow pattern</label>
        <select class="input" data-ux-period-flow>
          <option value="typical">Typical — medium first, then light</option>
          <option value="light">Light on all days</option>
          <option value="medium">Medium on all days</option>
          <option value="heavy">Heavy on all days</option>
          <option value="super-heavy">Super heavy on all days</option>
        </select>
      </div>
      <label class="ux-check">
        <input type="checkbox" data-ux-keep checked>
        <span>Keep any bleeding intensity I already entered manually</span>
      </label>
      <p class="note ux-period-note">Only light, medium, heavy and super-heavy count as period days. Spotting can still be added separately on the individual day.</p>
      <button class="btn" data-ux-save-period>Save period</button>
      <button class="btn ghost" data-ux-cancel-period>Cancel</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-ux-cancel-period]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-ux-save-period]').addEventListener('click', () => {
        const start = sheet.querySelector('[data-ux-period-start]').value;
        const end = sheet.querySelector('[data-ux-period-end]').value;
        const pattern = sheet.querySelector('[data-ux-period-flow]').value;
        const keep = sheet.querySelector('[data-ux-keep]').checked;
        if (!start || !end) return toast('Choose both dates');
        if (start > end) return toast('The last day must be after the first day');
        if (end > today()) return toast('Future days cannot be logged as a past period');
        const count = diffDays(start, end) + 1;
        if (count > 30) return toast('That range is over 30 days — please enter it day by day');

        update((st) => {
          for (let i = 0; i < count; i++) {
            const d = addDays(start, i);
            const day = st.days[d] || (st.days[d] = {});
            if (keep && day.bleeding) continue;
            day.bleeding = flowFor(pattern, i);
          }
        });

        closeSheet();
        toast(`Saved ${count} period ${count === 1 ? 'day' : 'days'}`);
        goCalendarTo(start);
      });
    },
  });
}

function enhanceCycle() {
  const ringSub = document.querySelector('.ring-sub');
  if (!ringSub || document.querySelector('[data-ux-cycle-overview]')) return;
  const s = get();
  const cycles = buildCycles(s).slice(-4).reverse();
  const st = stats(s);

  const card = document.createElement('div');
  card.className = 'card ux-cycle-overview';
  card.dataset.uxCycleOverview = '1';
  card.innerHTML = `
    <div class="ux-card-heading">
      <div>
        <span class="ux-kicker">Cycle history</span>
        <h2>Your recent periods</h2>
      </div>
      <button class="ux-small-btn primary" data-ux-overview-add>＋ Past period</button>
    </div>
    <div class="ux-cycle-stats">
      <div><strong>${Math.round(st.avgCycle || s.settings.avgCycle)}</strong><span>avg cycle</span></div>
      <div><strong>${Math.round(st.avgPeriod || s.settings.avgPeriod)}</strong><span>avg period</span></div>
      <div><strong>${st.shortest && st.longest ? `${st.shortest}–${st.longest}` : '—'}</strong><span>cycle range</span></div>
    </div>
    <div class="ux-history-list">
      ${cycles.length ? cycles.map((c) => `
        <button data-ux-cycle-start="${c.start}">
          <span class="ux-period-dot"></span>
          <span class="ux-history-main">
            <strong>${esc(fmtDate(c.start, { day: 'numeric', month: 'long', year: 'numeric' }))}</strong>
            <small>${c.bleedDays.length} logged bleeding ${c.bleedDays.length === 1 ? 'day' : 'days'}</small>
          </span>
          <span class="chev">›</span>
        </button>`).join('') : '<p class="note">Add older periods to make the history and predictions more personal.</p>'}
    </div>`;

  card.querySelector('[data-ux-overview-add]').addEventListener('click', () => openPastPeriod(today()));
  card.querySelectorAll('[data-ux-cycle-start]').forEach((b) => {
    b.addEventListener('click', () => goCalendarTo(b.dataset.uxCycleStart));
  });

  const happening = ringSub.nextElementSibling;
  if (happening) happening.insertAdjacentElement('beforebegin', card);
  else ringSub.insertAdjacentElement('afterend', card);
}

function enhance() {
  try {
    enhanceTrack();
    enhanceCalendar();
    enhanceCycle();
  } catch (err) {
    console.warn('Orbit UX enhancement skipped:', err);
  }
}

export { enhance };
window.__orbitUX = { openPastPeriod, goCalendarTo };
