// cycle.js — period history, history-based predictions and phase estimates.
//
// Design goals:
//  • period predictions use at most the 12 most recent completed cycles;
//  • period-length averages use at most the 6 most recent periods;
//  • likely missed-tracking artifacts are flagged without inventing missing periods;
//  • predictions expose uncertainty instead of pretending a single date is certain;
//  • positive LH and sustained BBT shifts can refine retrospective ovulation/luteal estimates;
//  • fertile/ovulation dates remain estimates and are NOT contraception guidance.
//
// This is an evidence-informed local model, not Clue's proprietary production model and
// not a clinically validated contraceptive algorithm.

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
  if (!isoStr) return '';
  return parseISO(isoStr).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short' });
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/* --------------------------- robust statistics --------------------------- */

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

function quantile(values, q) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const p = (v.length - 1) * q;
  const lo = Math.floor(p); const hi = Math.ceil(p);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (p - lo);
}

function weightedMean(values, maxN = 12, decay = 0.86) {
  const v = values.slice(-maxN);
  if (!v.length) return null;
  const med = median(v);
  const spread = Math.max(1, (mad(v) || 0) * 1.4826);
  const lo = med - 3 * spread;
  const hi = med + 3 * spread;
  let num = 0; let den = 0;
  v.forEach((raw, i) => {
    const x = Math.min(hi, Math.max(lo, raw));
    const w = Math.pow(decay, v.length - 1 - i);
    num += x * w; den += w;
  });
  return den ? num / den : null;
}

function robustSigma(values) {
  if (values.length < 2) return 2.5;
  const s = (mad(values) || 0) * 1.4826;
  return Math.max(1.25, s || 1.25);
}

/* --------------------------- cycle detection --------------------------- */

const BLEED = new Set(['light', 'medium', 'heavy', 'super-heavy']);

export function bleedDays(state = get()) {
  return Object.keys(state.days)
    .filter((d) => BLEED.has(state.days[d].bleeding))
    .sort();
}

export function buildCycles(state = get()) {
  const days = [...new Set([...bleedDays(state), ...Object.keys(state.days).filter(d => state.days[d].cycleStart === 'start')])].sort();
  if (!days.length) return [];

  const cycles = [];
  let cur = { start: days[0], bleedDays: [days[0]] };

  for (let i = 1; i < days.length; i++) {
    const gapFromPrev = diffDays(days[i - 1], days[i]);
    const sinceStart = diffDays(cur.start, days[i]);
    // A single blank/spotting day can occur inside one period. A new substantial
    // bleed within 10 days is also kept in the same episode rather than called a new cycle.
    if (state.days[days[i]].cycleStart !== 'start' && (gapFromPrev <= 2 || sinceStart < 10)) cur.bleedDays.push(days[i]);
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
      bleedDays: c.bleedDays.filter(d => BLEED.has(state.days[d].bleeding)),
      index: i,
    };
  });
}

/* --------------------------- tracking-adherence correction --------------------------- */

function normalizeCycleLengths(raw) {
  const clean = raw.filter((x) => x >= 15 && x <= 90);
  if (!clean.length) return { values: [], artifacts: [] };

  const seed = clean.filter((x) => x <= 45);
  const center = median(seed.length ? seed : clean) || 29;
  const artifacts = [];
  const values = clean.map((x, index) => {
    // Long apparent cycles can be genuine, so only repair when the observed length is
    // very close to an integer multiple of this user's usual cycle. This mirrors the
    // adherence problem described in Clue-associated published research without
    // pretending we know a missed period occurred.
    if (x >= Math.max(46, center * 1.55)) {
      let best = null;
      for (const multiple of [2, 3]) {
        const candidate = x / multiple;
        const deviation = Math.abs(candidate - center);
        if (candidate >= 18 && candidate <= 45 && deviation <= Math.max(3, center * 0.12)) {
          if (!best || deviation < best.deviation) best = { candidate, multiple, deviation };
        }
      }
      if (best) {
        artifacts.push({ index, observed: x, adjusted: best.candidate, suspectedSkipped: best.multiple - 1 });
        return x; // Preserve the observation; a suspected omission is not a confirmed one.
      }
    }
    return x;
  });
  return { values, artifacts };
}

/* --------------------------- physiological evidence --------------------------- */

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

export const BBT_DISTURBANCES = new Set(['poor-sleep','fever','alcohol','late','travel','illness']);
export function bbtQuality(day) {
  if (day?.bbt == null || typeof day.bbt !== 'number' || !Number.isFinite(day.bbt) || day.bbt < 34 || day.bbt > 40) return 'missing';
  const context = Array.isArray(day.bbtContext) ? day.bbtContext : [];
  const illness = Array.isArray(day.ailment) ? day.ailment : [];
  return context.some(x => BBT_DISTURBANCES.has(x)) || illness.includes('fever') ? 'disturbed' : 'usable';
}

export function bbtShift(state, start, end) {
  const rows = Object.keys(state.days).sort()
    .filter((d) => inRange(d, addDays(start, 5), end) && bbtQuality(state.days[d]) === 'usable')
    .map((d) => ({ d, t: Number(state.days[d].bbt) }));

  // Conservative retrospective confirmation: six prior readings + three consecutive
  // elevated days. Temperature is not used to claim future ovulation before the shift.
  for (let i = 6; i <= rows.length - 3; i++) {
    if (diffDays(rows[i].d, rows[i + 1].d) !== 1 || diffDays(rows[i + 1].d, rows[i + 2].d) !== 1) continue;
    if (diffDays(rows[i - 6].d, rows[i - 1].d) !== 5 || diffDays(rows[i - 1].d, rows[i].d) !== 1) continue;
    const baseline = median(rows.slice(i - 6, i).map((r) => r.t));
    if (baseline == null) continue;
    if (rows[i].t >= baseline + 0.20 && rows[i + 1].t >= baseline + 0.20 && rows[i + 2].t >= baseline + 0.20) {
      return addDays(rows[i].d, -1);
    }
  }
  return null;
}

export function ovulationEvidence(state, cycleStart, nextStart = null) {
  const end = nextStart || addDays(today(), 1);
  const lh = positiveLH(state, cycleStart, end);
  const bbt = bbtShift(state, cycleStart, end);
  const fluid = eggwhitePeak(state, cycleStart, end);

  if (lh && bbt && Math.abs(diffDays(lh, bbt)) <= 3) {
    const date = addDays(lh, Math.round(diffDays(lh, bbt) / 2));
    return { date, min: lh < bbt ? lh : bbt, max: lh > bbt ? lh : bbt, confidence: 'high', source: 'LH + BBT', supportingFluid: fluid };
  }
  if (bbt) return { date: bbt, min: addDays(bbt, -1), max: addDays(bbt, 1), confidence: 'medium', source: 'BBT shift', supportingFluid: fluid };
  // Current Clue public guidance places ovulation on the day after a positive LH result.
  if (lh) return { date: addDays(lh, 1), min: lh, max: addDays(lh, 2), confidence: 'medium', source: 'positive LH test', supportingFluid: fluid };
  // Fluid is shown as supporting context only; by itself it does not replace the calendar estimate.
  return fluid ? { date: null, confidence: 'supporting', source: 'cervical fluid', supportingFluid: fluid } : null;
}

function learnedLuteal(state, cycles, fallback = 13) {
  const vals = [];
  for (let i = 0; i < cycles.length - 1; i++) {
    const ev = ovulationEvidence(state, cycles[i].start, cycles[i + 1].start);
    if (!ev?.date || ev.confidence === 'supporting') continue;
    const n = diffDays(ev.date, cycles[i + 1].start);
    if (n >= 8 && n <= 20) vals.push(n);
  }
  return { value: vals.length >= 3 ? Math.round(median(vals.slice(-12))) : fallback, samples: vals.length, values: vals };
}

/* --------------------------- averages + heuristic uncertainty --------------------------- */

export function stats(state = get()) {
  const cycles = buildCycles(state);
  const completed = cycles.filter((c) => c.length != null && c.length >= 15 && c.length <= 90);
  const rawLengths = completed.map((c) => c.length).slice(-12);
  const normalized = normalizeCycleLengths(rawLengths);
  const lengths = normalized.values.slice(-12);
  const periods = cycles.filter((c) => c.length != null && c.bleedDays.length > 0 && c.periodLength >= 1 && c.periodLength <= 14).map((c) => c.periodLength).slice(-6);
  const s = state.settings;

  const personal = weightedMean(lengths, 12);
  // Hierarchical shrinkage: with little personal history, stay moderately close to a
  // conservative population prior; after 3+ completed cycles the person's own data dominates.
  const priorMean = Number.isFinite(Number(s.avgCycle)) ? Number(s.avgCycle) : 29;
  const n = lengths.length;
  const priorStrength = n >= 3 ? 0.35 : 1.5;
  const avgCycleRaw = personal == null ? priorMean : ((personal * n) + (priorMean * priorStrength)) / (n + priorStrength);
  const avgPeriodRaw = weightedMean(periods, 6, 0.88) || s.avgPeriod || 5;
  const recent = lengths.slice(-6);
  const lutealLearned = learnedLuteal(state, cycles, Number(s.luteal) || 14);
  const sigma = robustSigma(lengths);
  const q10 = lengths.length >= 4 ? quantile(lengths, .10) : avgCycleRaw - 2;
  const q90 = lengths.length >= 4 ? quantile(lengths, .90) : avgCycleRaw + 2;
  const baseHalfWidth = Math.max(2, Math.ceil(Math.max(sigma * 1.28, (q90 - q10) / 2)));

  return {
    cycles, completed,
    lengths,
    rawLengths,
    adherenceArtifacts: normalized.artifacts,
    avgCycle: Math.round(avgCycleRaw),
    avgCycleExact: avgCycleRaw,
    avgPeriod: Math.round(avgPeriodRaw),
    luteal: lutealLearned.value,
    lutealSamples: lutealLearned.samples,
    uncertainty: Math.max(baseHalfWidth, normalized.artifacts.length ? Math.ceil((Math.max(...lengths) - Math.min(...lengths)) / 2) : 0),
    variation: recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null,
    tracked: lengths.length,
    confident: lengths.length >= 3 && normalized.artifacts.length === 0,
    confidenceLevel: normalized.artifacts.length || (recent.length > 1 && Math.max(...recent) - Math.min(...recent) > 10) ? 'uncertain' : lengths.length >= 3 ? 'moderate' : 'learning',
    shortest: recent.length ? Math.round(Math.min(...recent)) : null,
    longest: recent.length ? Math.round(Math.max(...recent)) : null,
    model: 'observed-history-v4',
    suppressed: !!(state.settings.pill?.enabled || state.settings.predictionsPaused),
  };
}

/* --------------------------- predictions --------------------------- */

function projectedWindow(start, len, periodLen, luteal, spread, actual = false, evidence = null, horizon = 0) {
  // Public Clue guidance for Period Tracking describes default ovulation as 13 days
  // before the next predicted period. Learned luteal phase may replace that after evidence.
  const evidenceDate = evidence?.date || null;
  const ovulation = evidenceDate || addDays(start, len - luteal);
  const ovulationSpread = evidenceDate ? Math.max(0, diffDays(evidence.min || ovulation, evidence.max || ovulation)) : Math.max(2, spread);
  const ovulationMin = evidenceDate ? (evidence.min || ovulation) : addDays(ovulation, -ovulationSpread);
  const ovulationMax = evidenceDate ? (evidence.max || ovulation) : addDays(ovulation, ovulationSpread);

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
    horizon,
  };
}

export function forecast(state = get(), months = 13) {
  const st = stats(state);
  const cycles = st.cycles;
  const windows = [];

  cycles.forEach((c, i) => {
    const len = c.length || st.avgCycle;
    const ev = ovulationEvidence(state, c.start, cycles[i + 1]?.start || null);
    const w = projectedWindow(c.start, len, c.periodLength, st.luteal, 0, true, ev, 0);
    w.periodEnd = c.periodEnd;
    windows.push(w);
  });

  const anchor = cycles.length ? cycles[cycles.length - 1].start : null;
  if (anchor && !st.suppressed) {
    // Sequential projection matters: don't calculate each future period from today's
    // anchor with a single rounded multiplier, which can create drift artifacts.
    let start = anchor;
    for (let i = 1; i <= months; i++) {
      start = addDays(anchor, Math.round(st.avgCycleExact * i));
      // Uncertainty grows with horizon. This is deliberately visible in the UI.
      const spread = Math.max(2, Math.ceil(st.uncertainty * Math.sqrt(i)));
      windows.push(projectedWindow(start, st.avgCycle, st.avgPeriod, st.luteal, spread, false, null, i));
    }
  }
  return { windows, stats: st };
}

/* --------------------------- day classification --------------------------- */

function within(d, a, b) { return !!a && !!b && d >= a && d <= b; }

export function classify(dateISO, state = get(), fc = null) {
  const f = fc || forecast(state);
  const day = state.days[dateISO];
  const flow = day ? day.bleeding : null;
  const st = f.stats;
  let win = null;
  for (let i = f.windows.length - 1; i >= 0; i--) {
    if (f.windows[i].start <= dateISO && (dateISO > today() || f.windows[i].actual)) { win = f.windows[i]; break; }
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

  out.cycleDay = Math.max(1, diffDays(win.start, dateISO) + 1);
  const inPeriodWindow = within(dateISO, win.start, win.periodEnd);
  if (!out.isPeriod && inPeriodWindow) { out.predicted = !win.actual; out.isPeriod = !win.actual; }

  if (st.suppressed) { out.phase = out.isPeriod ? 'menstrual' : null; return out; }
  const overdue = win.actual && !st.cycles.some(c => c.start > win.start && c.start <= dateISO) && diffDays(win.start, dateISO) > st.avgCycle + st.uncertainty;
  if (overdue) { out.phase = out.isPeriod ? 'menstrual' : null; out.uncertain = true; return out; }

  if (state.settings.showFertile) {
    out.isFertile = within(dateISO, win.fertileStart, win.fertileEnd);
    out.isOvulation = dateISO === win.ovulation;
  }
  out.isPMS = within(dateISO, win.pmsStart, win.pmsEnd) && !out.isPeriod;

  if (out.isPeriod) out.phase = 'menstrual';
  else if (out.isOvulation) out.phase = 'ovulation';
  else if (out.isFertile) out.phase = 'fertile';
  else if (out.isPMS) out.phase = 'pms';
  else if (win.fertileStart && dateISO < win.fertileStart) out.phase = 'follicular';
  else out.phase = 'luteal';
  return out;
}

export const PHASE_META = {
  menstrual:  { label: 'Period', color: 'var(--menstrual)', blurb: 'Recorded bleeding or a near-term period estimate.' },
  follicular: { label: 'Follicular estimate', color: 'var(--follicular)', blurb: 'The phase after menstruation and before the estimated fertile window.' },
  fertile:    { label: 'Fertile estimate', color: 'var(--fertile)', blurb: 'An estimate, not a measurement. Do not use it as contraception.' },
  ovulation:  { label: 'Ovulation estimate', color: 'var(--ovulation)', blurb: 'Estimated from cycle timing; positive LH and BBT can strengthen retrospective timing.' },
  luteal:     { label: 'Luteal estimate', color: 'var(--luteal)', blurb: 'The phase after estimated ovulation and before the next period.' },
  pms:        { label: 'PMS estimate', color: 'var(--pms)', blurb: 'A predicted premenstrual window based on recent cycle history.' },
};

/* --------------------------- home-screen headline --------------------------- */

export function headline(state = get()) {
  const f = forecast(state);
  const st = f.stats;
  const t = today();
  if (!st.cycles.length) {
    return { title: 'No cycles yet', sub: 'Log a bleeding day to start', cycleDay: null, phase: null, cls: classify(t, state, f), f, stats: st, late: 0 };
  }

  const cls = classify(t, state, f);
  if (st.suppressed) return { title: state.settings.pill?.enabled ? 'Pill tracking' : 'Cycle estimates paused', sub: 'Calendar forecasts are paused', cycleDay: null, phase: null, cls, f, stats: st, late: 0 };
  const upcoming = nextPeriod(f);
  const lastActual = st.cycles[st.cycles.length - 1];
  const expected = addDays(lastActual.start, Math.round(st.avgCycleExact));
  const late = diffDays(expected, t);
  const daysToNext = upcoming ? diffDays(t, upcoming.start) : null;

  let title; let sub;
  if (cls.isPeriod && !cls.predicted && cls.win) {
    const dayOfPeriod = diffDays(cls.win.start, t) + 1;
    title = `Period day ${Math.max(1, dayOfPeriod)}`;
    sub = st.confident ? `Cycle day ${cls.cycleDay}` : 'Keep logging to sharpen predictions';
  } else if (late > st.uncertainty && !cls.isPeriod) {
    title = `${late} ${late === 1 ? 'day' : 'days'} past estimate`;
    sub = `Expected around ${fmtDate(expected)} · current range ±${st.uncertainty} d`;
  } else if (daysToNext != null) {
    title = daysToNext === 0 ? 'Period estimated today' : `Period in about ${daysToNext} ${daysToNext === 1 ? 'day' : 'days'}`;
    sub = `${cls.cycleDay ? `Cycle day ${cls.cycleDay} · ` : ''}${PHASE_META[cls.phase]?.label || 'Learning your cycle'} · ±${upcoming.uncertainty} d`;
  } else {
    title = cls.cycleDay ? `Cycle day ${cls.cycleDay}` : 'Learning your current cycle';
    sub = PHASE_META[cls.phase]?.label || 'Add another period start to improve timing';
  }

  return { title, sub, cycleDay: cls.cycleDay, phase: cls.phase, cls, f, stats: st, nextStart: upcoming?.start, late };
}

export function nextPeriod(f = forecast()) {
  return f.windows.find(w => !w.actual) || null;
}

// Rolling origin: no future logs are visible to the prediction being scored.
export function backtest(state = get()) {
  if (state.settings.pill?.enabled) return { samples: 0, meanError: null, coverage: null };
  const cycles = buildCycles(state);
  const errors = []; let covered = 0;
  for (let i = 3; i < cycles.length; i++) {
    const cutoff = cycles[i - 1].start;
    const training = { ...state, days: Object.fromEntries(Object.entries(state.days).filter(([d]) => d <= cutoff)) };
    const estimate = nextPeriod(forecast(training, 1));
    if (!estimate) continue;
    errors.push(Math.abs(diffDays(estimate.start, cycles[i].start)));
    if (cycles[i].start >= estimate.startMin && cycles[i].start <= estimate.startMax) covered++;
  }
  return { samples: errors.length, meanError: errors.length ? errors.reduce((a,b) => a+b,0)/errors.length : null, coverage: errors.length ? covered/errors.length : null };
}
