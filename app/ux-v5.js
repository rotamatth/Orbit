// ux-v5.js — cycle-first UX: clear current status, uncertainty, evidence and fast tracking.
// This layer intentionally uses Orbit's own visual language rather than copying another app.

import { get } from './state.js';
import { today, addDays, diffDays, fmtDate, classify, forecast, stats, PHASE_META } from './cycle.js';
import { esc } from './ui.js';

function go(route, params = {}) { window.__orbit?.go(route, params); }

function currentWindow(f, t) {
  let w = null;
  for (const candidate of f.windows) {
    if (candidate.start <= t) w = candidate;
    else break;
  }
  return w;
}

function confidenceCopy(st) {
  if (st.confidenceLevel === 'high') return ['Strong personal history', `${st.tracked} completed cycles are informing this estimate.`];
  if (st.confidenceLevel === 'moderate') return ['Personalising', `${st.tracked} completed cycles are informing this estimate.`];
  return ['Still learning', st.tracked ? `Only ${st.tracked} completed cycle is available. The range is intentionally wider.` : 'Add another period start to personalise predictions.'];
}

function daysUntil(a, b) {
  const n = diffDays(a, b);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in about ${n} days`;
}

function makeArc(days, currentDay) {
  const count = Math.max(24, Math.min(45, days || 29));
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const cls = `ux-arc-seg phase-${n <= 5 ? 'menstrual' : n >= count - 5 ? 'pms' : 'base'} ${n === currentDay ? 'is-current' : ''}`;
    return `<i class="${cls}" style="--i:${i};--n:${count}"></i>`;
  }).join('');
}

function cycleHero() {
  const s = get();
  const f = forecast(s);
  const st = f.stats;
  if (!st.cycles.length) return null;
  const t = today();
  const cls = classify(t, s, f);
  const win = cls.win || currentWindow(f, t);
  if (!win) return null;

  const next = f.windows.find((w) => !w.actual && w.start >= t);
  const meta = PHASE_META[cls.phase] || { label: 'Learning', blurb: 'Keep tracking to personalise this view.' };
  const cycleDay = cls.cycleDay || Math.max(1, diffDays(win.start, t) + 1);
  const len = Math.max(win.length || st.avgCycle || 29, cycleDay);
  const [confTitle, confBody] = confidenceCopy(st);
  const range = next ? `${fmtDate(next.startMin)} – ${fmtDate(next.startMax)}` : 'Not enough data yet';

  const wrap = document.createElement('section');
  wrap.className = 'ux-v5-home';
  wrap.innerHTML = `
    <div class="ux-v5-hero">
      <div class="ux-v5-arc" aria-label="Cycle day ${cycleDay}">
        ${makeArc(len, cycleDay)}
        <div class="ux-v5-arc-center">
          <span>DAY</span>
          <strong>${cycleDay}</strong>
          <em>${esc(meta.label || 'Cycle')}</em>
        </div>
      </div>
      <div class="ux-v5-primary">
        <span class="ux-kicker">Your current cycle</span>
        <h2>${next ? `Next period ${esc(daysUntil(t, next.start))}` : 'Cycle tracking in progress'}</h2>
        <p>${next ? `Most likely around ${esc(fmtDate(next.start, { weekday:'short', day:'numeric', month:'short' }))}` : esc(meta.blurb)}</p>
        ${next ? `<div class="ux-v5-range"><span>Prediction range</span><strong>${esc(range)}</strong><small>±${next.uncertainty} days</small></div>` : ''}
      </div>
    </div>

    <button class="ux-v5-feel" data-v5-track>
      <span class="ux-v5-feel-icon">＋</span>
      <span><strong>How are you today?</strong><small>Bleeding, pain, mood, tests, temperature and more</small></span>
      <b>›</b>
    </button>

    <div class="ux-v5-grid">
      <button class="ux-v5-info" data-v5-calendar>
        <span class="ux-kicker">Next period</span>
        <strong>${next ? esc(fmtDate(next.start, { day:'numeric', month:'long' })) : '—'}</strong>
        <small>${next ? `Range ${esc(range)}` : 'Add more history'}</small>
      </button>
      <button class="ux-v5-info" data-v5-analysis>
        <span class="ux-kicker">Prediction quality</span>
        <strong>${esc(confTitle)}</strong>
        <small>${esc(confBody)}</small>
      </button>
    </div>

    <div class="ux-v5-trust">
      <div><span class="ux-kicker">What Orbit knows</span><h3>Measured vs estimated</h3></div>
      <div class="ux-v5-trust-row"><i class="actual"></i><span><strong>Logged by you</strong><small>Period days, symptoms, LH tests and BBT are observations.</small></span></div>
      <div class="ux-v5-trust-row"><i class="estimate"></i><span><strong>Estimated by Orbit</strong><small>Future period, PMS, fertile and ovulation timing carry uncertainty.</small></span></div>
      ${st.adherenceArtifacts?.length ? `<div class="ux-v5-warning">⚠️ ${st.adherenceArtifacts.length} unusually long cycle interval ${st.adherenceArtifacts.length === 1 ? 'looks' : 'look'} like tracking may have been skipped. Orbit reduced its influence on the prediction.</div>` : ''}
      <p class="ux-v5-disclaimer">Fertile and ovulation estimates are not contraception guidance. LH/BBT can improve retrospective timing, but do not make this calendar a contraceptive method.</p>
    </div>`;

  wrap.querySelector('[data-v5-track]')?.addEventListener('click', () => go('log', { date: t }));
  wrap.querySelector('[data-v5-calendar]')?.addEventListener('click', () => go('calendar'));
  wrap.querySelector('[data-v5-analysis]')?.addEventListener('click', () => go('analysis'));
  return wrap;
}

function enhanceCycle() {
  const oldRing = document.querySelector('.ring-wrap');
  if (!oldRing || document.querySelector('.ux-v5-home')) return;
  const hero = cycleHero();
  if (!hero) return;

  const screen = oldRing.closest('.screen');
  if (!screen) return;
  const oldHeadline = screen.querySelector('.ring-headline');
  const oldSub = screen.querySelector('.ring-sub');
  const happening = oldSub?.nextElementSibling;

  oldRing.replaceWith(hero);
  oldHeadline?.remove();
  oldSub?.remove();
  if (happening?.querySelector('h2')?.textContent === "What's happening") happening.remove();

  // Keep history, quick logging, tracked-today and upcoming cards below the new hero.
  const overview = screen.querySelector('.ux-cycle-overview');
  if (overview) hero.insertAdjacentElement('afterend', overview);
}

function enhanceTracking() {
  const screen = document.querySelector('[data-ux-tracking-date]');
  if (!screen || screen.dataset.v5 === '1') return;
  screen.dataset.v5 = '1';
  const toolbar = screen.querySelector('.ux-track-toolbar');
  if (toolbar) {
    const title = document.createElement('div');
    title.className = 'ux-v5-track-intro';
    title.innerHTML = `<span class="ux-kicker">Daily check-in</span><h2>Track what matters</h2><p>You can log only one thing and leave. More detail is optional.</p>`;
    toolbar.insertAdjacentElement('afterend', title);
  }
}

function enhance() {
  try { enhanceCycle(); enhanceTracking(); } catch (err) { console.warn('Orbit v5 UX skipped:', err); }
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; enhance(); });
}).observe(document.body, { childList: true, subtree: true });

setTimeout(enhance, 40);
