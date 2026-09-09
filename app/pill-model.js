// One schedule and adherence model for cards, analysis and reminders.
import { today, diffDays, addDays } from './cycle.js';

export function pillSchedule(date, state) {
  const p = state.settings.pill;
  if (!p?.enabled) return null;
  const history = p.history || [];
  return [...history].filter(x => x.effectiveFrom <= date).sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1) || (history.length ? null : p);
}

export function packInfo(date, state) {
  const p = state.days[date]?.pillSchedule || pillSchedule(date, state);
  if (!p?.packStart) return null;
  const active = Number(p.activePills), placebo = Number(p.placeboPills), total = active + placebo;
  const elapsed = diffDays(p.packStart, date);
  if (elapsed < 0) return { day: null, total, kind: 'before' };
  const day = elapsed % total + 1;
  return { day, total, active, placebo, kind: day <= active ? 'active' : 'placebo' };
}

export function doseTiming(date, day, schedule) {
  if (!day?.pillTakenAt) return null;
  // Older records contain only a clock time; do not invent their actual date.
  if (/^\d{2}:\d{2}$/.test(day.pillTakenAt)) return { legacy: true, label: day.pillTakenAt };
  const actual = new Date(day.pillTakenAt);
  const expected = new Date(day.pillScheduledAt || (date + 'T' + schedule.scheduledTime + ':00'));
  if (!Number.isFinite(actual.getTime()) || !Number.isFinite(expected.getTime())) return null;
  return { legacy: false, actual, minutes: Math.round((actual - expected) / 60000) };
}

export function adherence(state, days = 28, now = new Date()) {
  const end = today(); const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end,-i), day = state.days[date] || {};
    const schedule = day.pillSchedule || pillSchedule(date,state);
    if (packInfo(date,state)?.kind !== 'active') continue;
    if (date === end && new Date(date+'T'+schedule.scheduledTime+':00') > now && !day.pillStatus) continue;
    rows.push({ date, day });
  }
  const taken = rows.filter(x => ['taken','late'].includes(x.day.pillStatus)).length;
  const late = rows.filter(x => x.day.pillStatus === 'late').length;
  const missed = rows.filter(x => x.day.pillStatus === 'missed').length;
  const vomited = rows.filter(x => x.day.pillStatus === 'vomited').length;
  const unknown = rows.filter(x => !x.day.pillStatus).length;
  let streak = 0;
  for (const x of [...rows].reverse()) { if (!['taken','late'].includes(x.day.pillStatus)) break; streak++; }
  const side = {};
  for (const x of rows) for (const id of x.day.pillSideEffects || []) side[id] = (side[id] || 0) + 1;
  return { scheduled: rows.length, taken, late, missed, vomited, unknown, streak, common: Object.entries(side).sort((a,b)=>b[1]-a[1]).slice(0,5), pct: rows.length ? Math.round(taken / rows.length * 100) : null };
}
