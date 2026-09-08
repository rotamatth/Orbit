// ux-v5.js — cycle-first UX with an interactive, draggable cycle ring.
// Orbit keeps its own visual language while adopting the useful interaction pattern
// of scrubbing through cycle days and seeing each day's details immediately.

import { get, CATEGORIES, NUMERIC } from './state.js';
import { today, addDays, diffDays, fmtDate, classify, forecast, PHASE_META } from './cycle.js';
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

function phaseClass(c) {
  if (c.isPeriod) return c.predicted ? 'menstrual predicted' : 'menstrual actual';
  if (c.isOvulation) return 'ovulation';
  if (c.isFertile) return 'fertile';
  if (c.isPMS) return 'pms';
  if (c.phase === 'follicular') return 'follicular';
  if (c.phase === 'luteal') return 'luteal';
  return 'base';
}

function dayLabel(c) {
  if (c.isPeriod && !c.predicted) return 'Period · logged';
  if (c.isPeriod && c.predicted) return 'Period estimate';
  if (c.isOvulation) return 'Ovulation estimate';
  if (c.isFertile) return 'Fertile estimate';
  if (c.isPMS) return 'PMS estimate';
  return PHASE_META[c.phase]?.label || 'Cycle';
}

function makeArc(start, count, state, fc, selectedIndex) {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    const c = classify(date, state, fc);
    const label = `Cycle day ${i + 1}, ${fmtDate(date, { weekday:'long', day:'numeric', month:'long' })}, ${dayLabel(c)}`;
    return `<button type="button" class="ux-arc-seg phase-${phaseClass(c)} ${i === selectedIndex ? 'is-selected' : ''}" data-ring-index="${i}" data-ring-date="${date}" aria-label="${esc(label)}" style="--i:${i};--n:${count}"></button>`;
  }).join('');
}

function loggedSummary(state, date) {
  const day = state.days[date];
  if (!day) return [];
  const out = [];

  for (const cat of CATEGORIES) {
    const value = day[cat.id];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const ids = Array.isArray(value) ? value : [value];
    const labels = ids.map((id) => cat.options.find((o) => o.id === id)?.label || id).filter(Boolean);
    if (labels.length) out.push(`${cat.emoji} ${labels.join(', ')}`);
  }
  for (const n of NUMERIC) {
    if (day[n.id] != null && day[n.id] !== '') out.push(`${n.emoji || ''} ${n.label}: ${day[n.id]} ${n.unit || ''}`.trim());
  }
  if (day.note) out.push(`📝 ${String(day.note).slice(0, 80)}`);
  return out;
}

function previewModel(state, fc, win, date, index) {
  const c = classify(date, state, fc);
  const meta = PHASE_META[c.phase] || {};
  const logged = loggedSummary(state, date);
  const isFuture = date > today();
  const source = logged.length ? 'Logged by you' : (isFuture || c.predicted || c.isFertile || c.isOvulation || c.isPMS ? 'Estimated by Orbit' : 'No details logged');

  let headline = meta.label || 'Cycle day';
  let detail = meta.blurb || 'No additional information for this day.';
  if (c.isPeriod && !c.predicted) {
    headline = 'Period day';
    detail = c.flow ? `Bleeding logged as ${String(c.flow).replace('-', ' ')}.` : 'Period bleeding logged.';
  } else if (c.isPeriod && c.predicted) {
    headline = 'Period estimate';
    detail = `This date falls inside the predicted period window. The start estimate has uncertainty of about ±${win.uncertainty || fc.stats.uncertainty} days.`;
  } else if (c.isOvulation) {
    headline = 'Ovulation estimate';
    detail = win.ovulationEvidence?.source ? `Timing is supported by ${win.ovulationEvidence.source}.` : 'Estimated from cycle timing; this is not a measured ovulation date.';
  } else if (c.isFertile) {
    headline = 'Fertile estimate';
    detail = 'A deliberately broad calendar estimate. It should not be used as contraception guidance.';
  } else if (c.isPMS) {
    headline = 'PMS estimate';
    detail = 'An estimated premenstrual window based on recent cycle timing.';
  }

  return {
    date,
    index,
    cycleDay: index + 1,
    c,
    logged,
    source,
    headline,
    detail,
    isFuture,
  };
}

function previewHTML(p) {
  const chips = p.logged.length
    ? p.logged.slice(0, 6).map((x) => `<span class="ux-ring-chip">${esc(x)}</span>`).join('')
    : `<span class="ux-ring-empty">${p.isFuture ? 'Future day — prediction only' : 'Nothing logged on this day'}</span>`;

  return `
    <div class="ux-ring-preview-head">
      <div>
        <span class="ux-kicker">${esc(p.source)}</span>
        <h3>${esc(p.headline)}</h3>
      </div>
      <span class="ux-ring-date">${esc(fmtDate(p.date, { weekday:'short', day:'numeric', month:'short' }))}</span>
    </div>
    <p>${esc(p.detail)}</p>
    <div class="ux-ring-chips">${chips}</div>
    <div class="ux-ring-preview-actions">
      <button type="button" class="ux-ring-step" data-ring-prev aria-label="Previous cycle day">‹</button>
      ${p.isFuture ? '<button type="button" class="ux-ring-track" disabled>Future estimate</button>' : `<button type="button" class="ux-ring-track" data-ring-track>Track this day</button>`}
      <button type="button" class="ux-ring-step" data-ring-next aria-label="Next cycle day">›</button>
    </div>`;
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
  const cycleDay = cls.cycleDay || Math.max(1, diffDays(win.start, t) + 1);
  const len = Math.max(24, Math.min(45, Math.max(win.length || st.avgCycle || 29, cycleDay)));
  const initialIndex = Math.max(0, Math.min(len - 1, cycleDay - 1));
  const initialDate = addDays(win.start, initialIndex);
  const initialPreview = previewModel(s, f, win, initialDate, initialIndex);
  const [confTitle, confBody] = confidenceCopy(st);
  const range = next ? `${fmtDate(next.startMin)} – ${fmtDate(next.startMax)}` : 'Not enough data yet';

  const wrap = document.createElement('section');
  wrap.className = 'ux-v5-home';
  wrap.innerHTML = `
    <div class="ux-v5-hero">
      <div class="ux-v5-arc" data-cycle-ring aria-label="Interactive cycle timeline. Drag the marker or tap a day to inspect it.">
        ${makeArc(win.start, len, s, f, initialIndex)}
        <div class="ux-ring-knob" data-ring-knob style="--i:${initialIndex};--n:${len}" aria-hidden="true"></div>
        <div class="ux-v5-arc-center" aria-live="polite">
          <span data-ring-center-date>${esc(fmtDate(initialDate, { weekday:'short', day:'numeric', month:'short' }))}</span>
          <strong data-ring-center-day>${initialIndex + 1}</strong>
          <em data-ring-center-phase>${esc(dayLabel(initialPreview.c))}</em>
        </div>
      </div>
      <div class="ux-ring-hint">Drag the white marker around the ring, or tap any cycle day.</div>
      <div class="ux-ring-preview" data-ring-preview>${previewHTML(initialPreview)}</div>

      <div class="ux-v5-primary">
        <span class="ux-kicker">Your current cycle</span>
        <h2>${next ? `Next period ${esc(daysUntil(t, next.start))}` : 'Cycle tracking in progress'}</h2>
        <p>${next ? `Most likely around ${esc(fmtDate(next.start, { weekday:'short', day:'numeric', month:'short' }))}` : 'Keep logging to personalise future predictions.'}</p>
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

  let selectedIndex = initialIndex;
  let dragging = false;
  const ring = wrap.querySelector('[data-cycle-ring]');
  const knob = wrap.querySelector('[data-ring-knob]');
  const preview = wrap.querySelector('[data-ring-preview]');
  const centerDay = wrap.querySelector('[data-ring-center-day]');
  const centerDate = wrap.querySelector('[data-ring-center-date]');
  const centerPhase = wrap.querySelector('[data-ring-center-phase]');

  function renderSelected(index) {
    selectedIndex = Math.max(0, Math.min(len - 1, index));
    const date = addDays(win.start, selectedIndex);
    const p = previewModel(s, f, win, date, selectedIndex);
    knob.style.setProperty('--i', selectedIndex);
    knob.style.setProperty('--n', len);
    wrap.querySelectorAll('[data-ring-index]').forEach((seg) => seg.classList.toggle('is-selected', Number(seg.dataset.ringIndex) === selectedIndex));
    centerDay.textContent = String(selectedIndex + 1);
    centerDate.textContent = fmtDate(date, { weekday:'short', day:'numeric', month:'short' });
    centerPhase.textContent = dayLabel(p.c);
    preview.innerHTML = previewHTML(p);
    wirePreviewButtons();
  }

  function indexFromPointer(e) {
    const r = ring.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return Math.round((deg / 360) * len) % len;
  }

  function wirePreviewButtons() {
    preview.querySelector('[data-ring-prev]')?.addEventListener('click', () => renderSelected((selectedIndex - 1 + len) % len));
    preview.querySelector('[data-ring-next]')?.addEventListener('click', () => renderSelected((selectedIndex + 1) % len));
    preview.querySelector('[data-ring-track]')?.addEventListener('click', () => go('log', { date: addDays(win.start, selectedIndex) }));
  }

  ring.querySelectorAll('[data-ring-index]').forEach((seg) => {
    seg.addEventListener('click', () => renderSelected(Number(seg.dataset.ringIndex)));
  });

  ring.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    ring.classList.add('is-dragging');
    try { ring.setPointerCapture(e.pointerId); } catch { /* optional */ }
    renderSelected(indexFromPointer(e));
  });
  ring.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    renderSelected(indexFromPointer(e));
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    ring.classList.remove('is-dragging');
    try { ring.releasePointerCapture(e.pointerId); } catch { /* optional */ }
  };
  ring.addEventListener('pointerup', endDrag);
  ring.addEventListener('pointercancel', endDrag);

  wirePreviewButtons();
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
