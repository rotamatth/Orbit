// ux-v6.js — semantic labels for the interactive cycle clock.
// The ring now reads clockwise from the last recorded period start toward the next estimate.

import { get } from './state.js';
import { today, diffDays, fmtDate, forecast } from './cycle.js';

function enhanceCycleClock() {
  const ring = document.querySelector('[data-cycle-ring]');
  const home = document.querySelector('.ux-v5-home');
  if (!ring || !home || ring.dataset.clockV6 === '1') return;

  const s = get();
  const f = forecast(s);
  const cycles = f.stats.cycles;
  if (!cycles.length) return;

  const t = today();
  const lastPeriod = [...cycles].reverse().find((c) => c.start <= t) || cycles[cycles.length - 1];
  const next = f.windows.find((w) => !w.actual && w.start > t);
  if (!lastPeriod) return;

  ring.dataset.clockV6 = '1';

  const startLabel = document.createElement('div');
  startLabel.className = 'ux-clock-anchor ux-clock-start';
  startLabel.innerHTML = `
    <span>LAST PERIOD</span>
    <strong>${fmtDate(lastPeriod.start, { day:'numeric', month:'short' })}</strong>`;
  ring.appendChild(startLabel);

  if (next) {
    const nextLabel = document.createElement('div');
    nextLabel.className = 'ux-clock-anchor ux-clock-next';
    nextLabel.innerHTML = `
      <span>NEXT PERIOD</span>
      <strong>${fmtDate(next.start, { day:'numeric', month:'short' })}</strong>
      <small>±${next.uncertainty} d</small>`;
    ring.appendChild(nextLabel);
  }

  const countdown = document.createElement('div');
  countdown.className = 'ux-clock-countdown';
  countdown.dataset.clockCountdown = '1';
  const center = ring.querySelector('.ux-v5-arc-center');
  center?.appendChild(countdown);

  function selectedDate() {
    const active = ring.querySelector('.ux-arc-seg.is-selected');
    return active?.dataset.ringDate || t;
  }

  function updateCountdown() {
    if (!next) {
      countdown.textContent = 'Next period needs more history';
      return;
    }
    const d = selectedDate();
    const left = diffDays(d, next.start);
    if (left > 1) countdown.textContent = `${left} days to next period`;
    else if (left === 1) countdown.textContent = '1 day to next period';
    else if (left === 0) countdown.textContent = 'Next period estimated today';
    else countdown.textContent = `${Math.abs(left)} days past estimated start`;
  }

  updateCountdown();

  // ux-v5 updates the selected segment as the user taps or drags. Observe only class
  // changes on those segments so the countdown follows the same source of truth.
  const observer = new MutationObserver(updateCountdown);
  ring.querySelectorAll('[data-ring-index]').forEach((seg) => {
    observer.observe(seg, { attributes:true, attributeFilter:['class'] });
  });

  // Add a concise explanation just below the ring.
  const hint = home.querySelector('.ux-ring-hint');
  if (hint) hint.textContent = '12 o’clock is Day 1 — the start of your last period. Move clockwise toward the next estimated period.';
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    try { enhanceCycleClock(); } catch (err) { console.warn('Orbit cycle clock v6 skipped:', err); }
  });
}).observe(document.body, { childList:true, subtree:true });

setTimeout(() => {
  try { enhanceCycleClock(); } catch (err) { console.warn('Orbit cycle clock v6 skipped:', err); }
}, 80);
