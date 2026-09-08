// cycle.js — turning logged bleeding days into cycles, phases and probabilistic predictions.
//
// Orbit deliberately separates "prediction" from "measurement". Period dates are
// forecast from recent cycle history. Ovulation can be *inferred* more strongly when
// manually logged LH tests / BBT / cervical fluid support it, but no app can observe
// ovulation from calendar dates alone. This model is not contraception.

import { get } from './state.js';

/* --------------------------- date utilities --------------------------- */

export function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() { return iso(new Date()); }

export function addDays(isoStr, n) {
  const d = parseISO(isoStr);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function diffDays(a, b) {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86400000);
}

export function fmtDate(isoStr, opts) {
  return parseISO(isoStr).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short' });
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/* --------------------------- small robust-stat helpers --------------------------- */

function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mad(values) {
  const m = median(values);
  if (m == null) return null;
  return median(values.map((x) => Math.abs(x - m)));
}

function weightedMean(values, maxN = 12) {
  const v = values.slice(-maxN);
  if (!v.length) return null;
  const med = median(v);
  const spread = Math.max(1, (mad(v) || 0) * 1.4826);
  // Winsorise obvious logging outliers while retaining genuine irregularity.
  const lo = med - 3 * spread;
  const hi = med + 3 * spread;
  let num = 0; let den = 0;
  v.forEach((raw, i) => {
    const x = Math.min(hi, Math.max(lo, raw));
    const w = Math.pow(0.82, v.length - 1 - i); // recent cycles matter more, smoothly
    num += x * w; den += w;
  });
  return num / den;
}

function uncertaintyDays(values) {
  const v = values.slice(-12);
  if (v.length < 2) return 2;
  const center = median(v);
  const robustSigma = Math.max(1, (mad(v) || 0) * 1.4826);
  // A practical ~80% prediction half-width. Minimum 1 day avoids false precision.
  return Math.max(1, Math.min(10, Math.ceil(Math.max(robustSigma * 1.28, Math.abs(v[v.length - 1] - center) * 0.35))));
}

/* --------------------------- cycle detection --------------------------- */

const BLEED = new Set(['light', 'medium', 'heavy', 'super-heavy']);

export function bleedDays(state = get()) {
  return Object.keys(state.days)
    .filter((d) => BLEED.has(state.days[d].bleeding))
    .sort();
}

export function buildCycles(state = get()) {
  const days = bleedDays(state);
  if (!days.length) return [];
  const cycles = [];
  let cur = { start: days[0], bleedDays: [days[0]] };

  for (let i = 1; i < days.length; i++) {
    const gapFromPrev = diffDays(days[i - 1], days[i]);
    const sinceStart = diffDays(cur.start, days[i]);
    if (gapFromPrev <= 2 || sinceStart < 10) cur.bleedDays.push(days[i]);
    else { cycles.push(cur); cur = { start: days[i], bleedDays: [days[i]] }; }
  }
  cycles.push(cur);

  return cycles.map((c, i, arr) => {
    const next = arr[i + 1];
    const last = c.bleedDays[c.bleedDays.length - 1];
    return {
      start: c.start,
      periodEnd: last,
      periodLength: diffDays(c.start, last) + 1,
      length: next ? diffDays(c.start, next.start) : null,
      bleedDays: c.bleedDays,
      index: i,
    };
  });
}

/* --------------------------- physiological ovulation evidence --------------------------- */

function inRange(d, start, end) { return d >= start && (!end || d < end); }

function positiveLH(state, start, end) {
  return Object.keys(state.days).sort().find((d) => {
    const tests = state.days[d].tests;
    return inRange(d, addDays(start, 5), end) && Array.isArray(tests) && tests.includes('ovu-pos');
  }) || null;
}

function eggwhitePeak(state, start, end) {
  const hits = Object.keys(state.days).sort().filter((d) =>
    inRange(d, addDays(start, 5), end) && state.days[d].fluid === 'eggwhite');
  return hits.length ? hits[hits.length - 1] : null;
}

function bbtShift(state, start, end) {
  const rows = Object.keys(state.days).sort()
    .filter((d) => inRange(d, addDays(start, 5), end) && Number.isFinite(Number(state.days[d].bbt)))
    .map((d) => ({ d, t: Number(state.days[d].bbt) }));

  // Require six earlier readings and 3 consecutive calendar days of elevated BBT.
  for (let i = 6; i <= rows.length - 3; i++) {
    if (diffDays(rows[i].d, rows[i + 1].d) !== 1 || diffDays(rows[i + 1].d, rows[i + 2].d) !== 1) continue;
    const baseline = median(rows.slice(i - 6, i).map((r) => r.t));
    if (baseline == null) continue;
    if (rows[i].t >= baseline + 0.20 && rows[i + 1].t >= baseline + 0.20 && rows[i + 2].t >= baseline + 0.20) {
      return addDays(rows[i].d, -1); // BBT rise generally confirms ovulation after the fact.
    }
  }
  return null;
}

/**
 * Best available ovulation inference for a completed/current cycle.
 * Evidence priority: BBT+LH agreement > BBT > positive LH > peak egg-white fluid.
 * Returned `date` is an estimate, never a diagnosis or contraception-safe marker.
 */
export function ovulationEvidence(state, cycleStart, nextStart = null) {
  const end = nextStart || addDays(cycleStart, 45);
  const lh = positiveLH(state, cycleStart, end);
  const bbt = bbtShift(state, cycleStart, end);
  const fluid = eggwhitePeak(state, cycleStart, end);

  if (lh && bbt && Math.abs(diffDays(lh, bbt)) <= 3) {
    const date = addDays(lh, Math.round(diffDays(lh, bbt) / 2));
    return { date, min: lh < bbt ? lh : bbt, max: lh > bbt ? lh : bbt, confidence: 'high', source: 'LH + BBT' };
  }
  if (bbt) return { date: bbt, min: addDays(bbt, -1), max: addDays(bbt, 1), confidence: 'medium', source: 'BBT shift' };
  if (lh) return { date: addDays(lh, 1), min: lh, max: addDays(lh, 2), confidence: 'medium', source: 'positive LH test' };
  if (fluid) return { date: fluid, min: addDays(fluid, -2), max: addDays(fluid, 2), confidence: 'low', source: 'cervical fluid' };
  return null;
}

function learnedLuteal(state, cycles, fallback) {
  const vals = [];
  for (let i = 0; i < cycles.length - 1; i++) {
    const ev = ovulationEvidence(state, cycles[i].start, cycles[i + 1].start);
    if (!ev || ev.confidence === 'low') continue;
    const n = diffDays(ev.date, cycles[i + 1].start);
    if (n >= 8 && n <= 20) vals.push(n);
  }
  return { value: vals.length ? Math.round(median(vals)) : fallback, samples: vals.length, values: vals };
}

/* --------------------------- averages + uncertainty --------------------------- */

export function stats(state = get()) {
  const cycles = buildCycles(state);
  const completed = cycles.filter((c) => c.length != null && c.length >= 15 && c.length <= 90);
  const lengths = completed.map((c) => c.length).slice(-12);
  const periods = cycles.filter((c) => c.periodLength <= 14).map((c) => c.periodLength).slice(-6);
  const s = state.settings;

  const avgCycleRaw = weightedMean(lengths, 12);
  const avgPeriodRaw = weightedMean(periods, 6);
  const recent = lengths.slice(-6);
  const lutealLearned = learnedLuteal(state, cycles, s.luteal);

  return {
    cycles, completed, lengths,
    avgCycle: avgCycleRaw ? Math.round(avgCycleRaw) : s.avgCycle,
    avgCycleExact: avgCycleRaw || s.avgCycle,
    avgPeriod: avgPeriodRaw ? Math.round(avgPeriodRaw) : s.avgPeriod,
    luteal: lutealLearned.value,
    lutealSamples: lutealLearned.samples,
    uncertainty: uncertaintyDays(lengths),
    variation: recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null,
    tracked: lengths.length,
    confident: lengths.length >= 3,
    shortest: recent.length ? Math.min(...recent) : null,
    longest: recent.length ? Math.max(...recent) : null,
    model: 'robust-probabilistic-v2',
  };
}

/* --------------------------- predictions --------------------------- */

function projectedWindow(start, len, periodLen, luteal, spread, actual = false, evidence = null) {
  const ovulation = evidence?.date || addDays(start, len - luteal);
  const ovulationMin = evidence?.min || addDays(ovulation, -spread);
  const ovulationMax = evidence?.max || addDays(ovulation, spread);
  return {
    start,
    startMin: actual ? start : addDays(start, -spread),
    startMax: actual ? start : addDays(start, spread),
    periodEnd: addDays(start, periodLen - 1),
    ovulation,
    ovulationMin,
    ovulationMax,
    ovulationEvidence: evidence,
    fertileStart: addDays(ovulationMin, -5),
    fertileEnd: addDays(ovulationMax, 1),
    pmsStart: addDays(start, len - 5),
    pmsEnd: addDays(start, len - 1),
    actual,
    length: len,
    uncertainty: spread,
  };
}

export function forecast(state = get(), months = 13) {
  const st = stats(state);
  const cycles = st.cycles;
  const windows = [];

  cycles.forEach((c, i) => {
    const len = c.length || st.avgCycle;
    const ev = ovulationEvidence(state, c.start, cycles[i + 1]?.start || null);
    const w = projectedWindow(c.start, len, c.periodLength, st.luteal, ev ? 0 : st.uncertainty, true, ev);
    w.periodEnd = c.periodEnd;
    windows.push(w);
  });

  const anchor = cycles.length ? cycles[cycles.length - 1].start : null;
  if (anchor) {
    for (let i = 1; i <= months; i++) {
      const start = addDays(anchor, Math.round(st.avgCycleExact * i));
      // Forecast uncertainty grows with horizon, but slowly rather than linearly.
      const spread = Math.min(14, Math.max(1, Math.ceil(st.uncertainty * Math.sqrt(i))));
      windows.push(projectedWindow(start, st.avgCycle, st.avgPeriod, st.luteal, spread, false, null));
    }
  }
  return { windows, stats: st };
}

/* --------------------------- day classification --------------------------- */

function within(d, a, b) { return d >= a && d <= b; }

export function classify(dateISO, state = get(), fc = null) {
  const f = fc || forecast(state);
  const day = state.days[dateISO];
  const flow = day ? day.bleeding : null;
  const st = f.stats;
  let win = null;
  for (let i = f.windows.length - 1; i >= 0; i--) {
    if (f.windows[i].start <= dateISO) { win = f.windows[i]; break; }
  }

  const out = {
    flow,
    isPeriod: BLEED.has(flow),
    isSpotting: flow === 'spotting',
    predicted: false,
    isFertile: false,
    isOvulation: false,
    isPMS: false,
    cycleDay: null,
    phase: null,
    win,
  };
  if (!win) return out;

  out.cycleDay = diffDays(win.start, dateISO) + 1;
  const inPeriodWindow = within(dateISO, win.start, win.periodEnd);
  if (!out.isPeriod && inPeriodWindow) { out.predicted = true; out.isPeriod = true; }
  else if (!out.isPeriod && !win.actual && within(dateISO, win.start, addDays(win.start, st.avgPeriod - 1))) {
    out.predicted = true; out.isPeriod = true;
  }

  if (state.settings.showFertile) {
    out.isFertile = within(dateISO, win.fertileStart, win.fertileEnd);
    // "Ovulation" highlight is the central estimate; surrounding uncertainty remains fertile.
    out.isOvulation = dateISO === win.ovulation;
  }
  out.isPMS = within(dateISO, win.pmsStart, win.pmsEnd) && !out.isPeriod;

  if (out.isPeriod) out.phase = 'menstrual';
  else if (out.isOvulation) out.phase = 'ovulation';
  else if (out.isFertile) out.phase = 'fertile';
  else if (out.isPMS) out.phase = 'pms';
  else if (dateISO < win.fertileStart) out.phase = 'follicular';
  else out.phase = 'luteal';
  return out;
}

export const PHASE_META = {
  menstrual:  { label: 'Period', color: 'var(--menstrual)', blurb: 'Menstrual bleeding is logged or expected around this time.' },
  follicular: { label: 'Follicular', color: 'var(--follicular)', blurb: 'The phase after menstruation and before the estimated fertile window.' },
  fertile:    { label: 'Fertile estimate', color: 'var(--fertile)', blurb: 'A deliberately broad estimate. It is not safe to use as contraception.' },
  ovulation:  { label: 'Ovulation estimate', color: 'var(--ovulation)', blurb: 'A central estimate; BBT/LH logs can strengthen retrospective inference.' },
  luteal:     { label: 'Luteal', color: 'var(--luteal)', blurb: 'The phase after estimated ovulation and before the next period.' },
  pms:        { label: 'PMS', color: 'var(--pms)', blurb: 'A predicted premenstrual window based on recent cycles.' },
};

/* --------------------------- headline for the home screen --------------------------- */

export function headline(state = get()) {
  const f = forecast(state);
  const st = f.stats;
  const t = today();
  if (!st.cycles.length) return { title: 'No cycles yet', sub: 'Log a bleeding day to start', cycleDay: null, phase: null, f };

  const cls = classify(t, state, f);
  const upcoming = f.windows.find((w) => w.start > t);
  const currentWin = cls.win;
  const daysToNext = upcoming ? diffDays(t, upcoming.start) : null;
  const lastActual = st.cycles[st.cycles.length - 1];
  const expected = addDays(lastActual.start, st.avgCycle);
  const late = diffDays(expected, t);

  let title; let sub;
  if (cls.isPeriod && !cls.predicted) {
    const dayOfPeriod = diffDays(currentWin.start, t) + 1;
    title = `Period day ${dayOfPeriod}`;
    sub = st.confident ? `Cycle day ${cls.cycleDay}` : 'Keep logging to sharpen predictions';
  } else if (late > st.uncertainty && !cls.isPeriod) {
    title = `${late} ${late === 1 ? 'day' : 'days'} past estimate`;
    sub = `Expected around ${fmtDate(expected)} (±${st.uncertainty} d)`;
  } else if (daysToNext != null) {
    title = daysToNext === 0 ? 'Period estimated today' : `Period in about ${daysToNext} ${daysToNext === 1 ? 'day' : 'days'}`;
    sub = `Cycle day ${cls.cycleDay} · ${PHASE_META[cls.phase]?.label || ''} · ±${upcoming?.uncertainty || st.uncertainty} d`;
  } else {
    title = `Cycle day ${cls.cycleDay}`;
    sub = PHASE_META[cls.phase]?.label || '';
  }
  return { title, sub, cycleDay: cls.cycleDay, phase: cls.phase, cls, f, stats: st, nextStart: upcoming?.start, late };
}
