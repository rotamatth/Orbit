// views.js — the four main screens.

import { get, update, CATEGORIES, CAT_BY_ID, NUMERIC, toggleTag, isTagged, setField, dayEntry, dayHasData } from './state.js';
import {
  today, iso, parseISO, addDays, diffDays, fmtDate, monthLabel,
  classify, forecast, stats, headline, PHASE_META,
} from './cycle.js';
import { $, $$, esc, ringSVG, openSheet, closeSheet, toast } from './ui.js';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function customTagsCat(s = get()) {
  const tags = Array.isArray(s.settings.customTags) ? s.settings.customTags : [];
  if (!tags.length) return null;
  return { id: 'customTags', label: 'Custom tags', emoji: '🏷️', multi: true, options: tags.map((t) => ({ id: t.id, label: t.label })) };
}

function allCats(s = get()) {
  const custom = customTagsCat(s);
  return custom ? [...CATEGORIES, custom] : CATEGORIES;
}

function enabledCats(s = get()) {
  const on = new Set(s.settings.enabledCategories);
  return allCats(s).filter((c) => on.has(c.id) || c.id === 'customTags');
}

function daySummary(isoDate) {
  const d = dayEntry(isoDate);
  if (!d) return [];
  const out = [];
  allCats(get()).forEach((c) => {
    const v = d[c.id];
    if (!v) return;
    const ids = Array.isArray(v) ? v : [v];
    ids.forEach((id) => {
      const opt = c.options.find((o) => o.id === id);
      if (opt) out.push({ cat: c, label: opt.label });
    });
  });
  NUMERIC.forEach((n) => {
    if (d[n.id] != null) out.push({ cat: n, label: `${d[n.id]} ${n.unit}` });
  });
  if (d.note) out.push({ cat: { emoji: '📝', label: 'Note' }, label: d.note.slice(0, 60) });
  return out;
}

/* =================================================================
   1. CYCLE — the home screen
   ================================================================= */

export function cycleView() {
  const s = get();
  const h = headline(s);
  const t = today();

  if (!h.stats || !h.stats.cycles.length) {
    return {
      html: `
        ${topbar(s, 'Your cycle')}
        <div class="screen">
          <div class="empty">
            <span class="em">🌑</span>
            <p>Nothing tracked yet. Mark the first day of your last period and the ring will fill in.</p>
            <button class="btn" data-go="log">Log a day</button>
          </div>
        </div>`,
      mount: () => {},
    };
  }

  const st = h.stats;
  const win = h.cls.win;
  const soFar = diffDays(win.start, t) + 1;
  const len = Math.max(win.length || st.avgCycle, soFar);
  const f = h.f;

  const ringDays = [];
  for (let i = 0; i < len; i++) {
    const date = addDays(win.start, i);
    const c = classify(date, s, f);
    ringDays.push({ phase: c.phase, predicted: date > t, isToday: date === t });
  }

  const meta = PHASE_META[h.phase] || {};
  const next = upcomingEvents(s, f, 4);
  const summary = daySummary(t);
  const quick = s.settings.quickLog.map((id) => CAT_BY_ID[id]).filter(Boolean);

  return {
    html: `
      ${topbar(s, s.profile.name ? `Hello, ${esc(s.profile.name)}` : 'Your cycle')}
      <div class="screen">
        ${h.late > 0 && !h.cls.isPeriod ? `
          <div class="banner"><span class="em">⏳</span><div>Your period is ${h.late} ${h.late === 1 ? 'day' : 'days'} later than predicted. Cycles shift for all sorts of reasons — stress, travel, illness, a change in routine.</div></div>` : ''}

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
          <h2>What's happening</h2>
          <p class="phase-blurb">${esc(meta.blurb || '')}</p>
        </div>

        <div class="card">
          <h2>Log today</h2>
          ${quick.map((c) => `
            <div class="qgroup">
              <div class="qlabel">${c.emoji} ${esc(c.label)}</div>
              <div class="qrow">
                ${c.options.map((o) => `
                  <button class="chip ${c.id === 'bleeding' ? 'flow' : ''}" data-quick="${c.id}:${o.id}"
                    aria-pressed="${isTagged(t, c.id, o.id)}">${esc(o.label)}</button>`).join('')}
              </div>
            </div>`).join('')}
          <button class="btn ghost" style="margin-top:14px" data-go="log">Open full tracking</button>
        </div>

        ${summary.length ? `
        <div class="card">
          <h2>Tracked today</h2>
          <div>${summary.map((x) => `<span class="pill-tag">${x.cat.emoji} ${esc(x.label)}</span>`).join('')}</div>
        </div>` : ''}

        <div class="card">
          <h2>Coming up</h2>
          ${next.map((e) => `
            <div class="freq-row" style="margin-bottom:12px">
              <span style="width:10px;height:10px;border-radius:3px;background:${e.color};flex:none"></span>
              <span style="flex:1">${esc(e.label)}</span>
              <span style="color:var(--muted);font-size:12.5px">${esc(e.when)}</span>
            </div>`).join('') || '<p class="note">Log a few more cycles and predictions will appear here.</p>'}
        </div>

        ${s.connection ? connectionCard(s) : ''}

        ${!st.confident ? `<p class="note" style="text-align:center;padding:0 10px">Predictions use ${st.tracked} complete ${st.tracked === 1 ? 'cycle' : 'cycles'}. They sharpen after three.</p>` : ''}
      </div>`,

    mount(root) {
      $$('[data-quick]', root).forEach((btn) => {
        btn.addEventListener('click', () => {
          const [cat, opt] = btn.dataset.quick.split(':');
          toggleTag(t, cat, opt);
          window.__orbit.render();
        });
      });
    },
  };
}

function connectionCard(s) {
  let sub = 'Shared cycle';
  try {
    if (s.connection.sharedAt) sub = `Updated ${fmtDate(iso(new Date(s.connection.sharedAt)))}`;
  } catch { /* ignore */ }
  return `
    <button class="card" style="display:block;width:100%;text-align:left" data-go="partner">
      <h2>${esc(s.connection.name || 'Partner')}</h2>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">🔗</span>
        <div style="flex:1">
          <div style="font-size:14.5px">View their cycle</div>
          <div style="font-size:12px;color:var(--muted)">${esc(sub)}</div>
        </div>
        <span style="color:var(--faint)">›</span>
      </div>
    </button>`;
}

function upcomingEvents(s, f, limit) {
  const t = today();
  const evts = [];
  f.windows.forEach((w) => {
    if (w.start > t) evts.push({ date: w.start, label: 'Period starts', color: 'var(--menstrual)' });
    if (w.pmsStart > t) evts.push({ date: w.pmsStart, label: 'PMS may begin', color: 'var(--pms)' });
    if (s.settings.showFertile) {
      if (w.fertileStart > t) evts.push({ date: w.fertileStart, label: 'Fertile window opens', color: 'var(--fertile)' });
      if (w.ovulation > t) evts.push({ date: w.ovulation, label: 'Ovulation', color: 'var(--ovulation)' });
    }
  });
  evts.sort((a, b) => (a.date < b.date ? -1 : 1));
  return evts.slice(0, limit).map((e) => {
    const d = diffDays(t, e.date);
    return { ...e, when: `${fmtDate(e.date)} · ${d === 1 ? 'tomorrow' : `in ${d} days`}` };
  });
}

/* =================================================================
   2. CALENDAR
   ================================================================= */

let calCursor = null;   // {y, m}
let calFilters = [];

export function calendarView() {
  const s = get();
  const t = today();
  const now = parseISO(t);
  if (!calCursor) calCursor = { y: now.getFullYear(), m: now.getMonth() };

  const f = forecast(s);
  const html = `
    ${topbar(s, 'Calendar', `<button class="icon-btn" data-filter aria-label="Filter">⚗︎</button>`)}
    <div class="screen">
      <div class="cal-head">
        <button class="icon-btn" data-nav="-1" aria-label="Previous month">‹</button>
        <span class="m">${esc(monthLabel(calCursor.y, calCursor.m))}</span>
        <button class="icon-btn" data-nav="1" aria-label="Next month">›</button>
      </div>
      ${calFilters.length ? `<div style="margin-bottom:10px">${calFilters.map((k) => {
        const [c, o] = k.split(':');
        const cat = CAT_BY_ID[c];
        const opt = cat?.options.find((x) => x.id === o);
        return `<span class="pill-tag">${cat?.emoji || ''} ${esc(opt?.label || o)}</span>`;
      }).join('')}</div>` : ''}
      <div id="calbody">${monthGrid(calCursor.y, calCursor.m, s, f)}</div>
      <div class="legend">
        <span><i style="background:var(--menstrual)"></i>Period</span>
        <span><i style="border:1px dashed var(--menstrual)"></i>Predicted</span>
        ${s.settings.showFertile ? '<span><i style="background:color-mix(in srgb,var(--fertile) 45%,transparent)"></i>Fertile</span><span><i style="background:var(--ovulation)"></i>Ovulation</span>' : ''}
        <span><i style="background:color-mix(in srgb,var(--pms) 45%,transparent)"></i>PMS</span>
      </div>
      <p class="note" style="margin-top:16px">Tap a day to see what was tracked. Double-tap to edit it.</p>
    </div>`;

  return {
    html,
    mount(root) {
      $$('[data-nav]', root).forEach((b) => b.addEventListener('click', () => {
        const d = Number(b.dataset.nav);
        let { y, m } = calCursor;
        m += d;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        calCursor = { y, m };
        window.__orbit.render();
      }));

      $('[data-filter]', root)?.addEventListener('click', openFilterSheet);
      wireCells(root);

      // swipe between months
      let x0 = null;
      const body = $('#calbody', root);
      body.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      body.addEventListener('touchend', (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 60) {
          $(`[data-nav="${dx < 0 ? 1 : -1}"]`, root)?.click();
        }
        x0 = null;
      }, { passive: true });
    },
  };
}

function wireCells(root) {
  let lastTap = 0;
  let lastDate = null;
  $$('[data-date]', root).forEach((cell) => {
    cell.addEventListener('click', () => {
      const d = cell.dataset.date;
      const now = Date.now();
      if (lastDate === d && now - lastTap < 380) {
        window.__orbit.go('log', { date: d });
        return;
      }
      lastTap = now; lastDate = d;
      openDaySheet(d);
    });
  });
}

function monthGrid(y, m, s, f) {
  const t = today();
  const first = new Date(y, m, 1);
  const ws = s.settings.weekStart;
  const lead = (first.getDay() - ws + 7) % 7;
  const start = new Date(y, m, 1 - lead);

  const dows = [];
  for (let i = 0; i < 7; i++) dows.push(DOW_SHORT[(ws + i) % 7].slice(0, 2));

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = iso(d);
    const out = d.getMonth() !== m;
    const c = classify(key, s, f);
    const day = s.days[key];

    const cls = ['cal-cell'];
    if (out) cls.push('out');
    if (key === t) cls.push('today');
    if (c.isPeriod && !c.predicted) cls.push('period');
    else if (c.isPeriod && c.predicted) cls.push('period-pred');
    else if (c.isOvulation) cls.push('ovulation');
    else if (c.isFertile) cls.push('fertile');
    else if (c.isPMS) cls.push('pms');
    if (c.isSpotting) cls.push('spotting');

    if (calFilters.length && day) {
      const hit = calFilters.some((k) => {
        const [cat, opt] = k.split(':');
        const v = day[cat];
        return Array.isArray(v) ? v.includes(opt) : v === opt;
      });
      if (hit) cls.push('match');
    }

    const dots = day
      ? Object.keys(day).filter((k) => k !== 'bleeding').slice(0, 3)
        .map(() => '<i style="background:currentColor;opacity:.55"></i>').join('')
      : '';

    cells += `<button class="${cls.join(' ')}" data-date="${key}" aria-label="${esc(fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }

  return `<div class="dow-row">${dows.map((x) => `<div>${x}</div>`).join('')}</div>
          <div class="cal-grid">${cells}</div>`;
}

function openDaySheet(dateISO) {
  const s = get();
  const c = classify(dateISO, s);
  const meta = PHASE_META[c.phase] || {};
  const items = daySummary(dateISO);

  openSheet({
    title: fmtDate(dateISO, { weekday: 'long', day: 'numeric', month: 'long' }),
    body: `
      <div style="display:flex;gap:8px;align-items:center;margin:10px 0 16px">
        <span class="ring-phase" style="color:${meta.color};margin:0">${esc(meta.label || '')}</span>
        ${c.cycleDay ? `<span style="color:var(--muted);font-size:13px">Cycle day ${c.cycleDay}</span>` : ''}
        ${c.predicted ? '<span style="color:var(--faint);font-size:12px">predicted</span>' : ''}
      </div>
      ${items.length
        ? `<div style="margin-bottom:18px">${items.map((x) => `<span class="pill-tag">${x.cat.emoji} ${esc(x.label)}</span>`).join('')}</div>`
        : '<p class="note" style="margin-bottom:18px">Nothing tracked on this day.</p>'}
      <button class="btn" data-edit>Track this day</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-edit]').addEventListener('click', () => {
        closeSheet();
        window.__orbit.go('log', { date: dateISO });
      });
    },
  });
}

function openFilterSheet() {
  const s = get();
  const cats = enabledCats(s);
  openSheet({
    title: 'Highlight on the calendar',
    body: `
      <p class="note" style="margin:8px 0 16px">Pick up to three things to highlight across the month.</p>
      ${cats.map((c) => `
        <div class="cat">
          <div class="cat-head"><span class="em">${c.emoji}</span><span class="name">${esc(c.label)}</span></div>
          <div class="chips">${c.options.map((o) => `
            <button class="chip" data-f="${c.id}:${o.id}" aria-pressed="${calFilters.includes(`${c.id}:${o.id}`)}">${esc(o.label)}</button>`).join('')}</div>
        </div>`).join('')}
      <button class="btn ghost" style="margin-top:16px" data-clear>Clear highlights</button>`,
    onMount(sheet) {
      sheet.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.f;
        if (calFilters.includes(k)) calFilters = calFilters.filter((x) => x !== k);
        else if (calFilters.length >= 3) { toast('Three at a time is the limit'); return; }
        else calFilters.push(k);
        b.setAttribute('aria-pressed', calFilters.includes(k));
      }));
      sheet.querySelector('[data-clear]').addEventListener('click', () => {
        calFilters = [];
        closeSheet();
        window.__orbit.render();
      });
    },
    onClose() { window.__orbit.render(); },
  });
}

/* =================================================================
   3. LOG
   ================================================================= */

export function logView(params = {}) {
  const s = get();
  const sel = params.date || today();
  const cats = enabledCats(s);
  const day = dayEntry(sel) || {};

  const strip = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today(), -i);
    strip.push(d);
  }
  if (!strip.includes(sel)) strip.push(sel);

  return {
    html: `
      ${topbar(s, 'Track', `<button class="icon-btn" data-pick aria-label="Pick a date">📅</button>`)}
      <div class="screen">
        <div class="date-strip">
          ${strip.map((d) => `
            <button class="date-pill" data-d="${d}" aria-pressed="${d === sel}">
              <span class="dow">${DOW_SHORT[parseISO(d).getDay()].slice(0, 2)}</span>
              <span class="num">${parseISO(d).getDate()}</span>
              ${dayHasData(d) ? '<span class="dot"></span>' : '<span style="display:block;height:7px"></span>'}
            </button>`).join('')}
        </div>

        <div style="font-family:var(--serif);font-size:19px;margin:2px 0 6px">
          ${esc(fmtDate(sel, { weekday: 'long', day: 'numeric', month: 'long' }))}
        </div>

        <div class="card flush">
          ${cats.map((c) => `
            <div class="cat">
              <div class="cat-head">
                <span class="em">${c.emoji}</span>
                <span class="name">${esc(c.label)}</span>
                ${countFor(day, c) ? `<span class="count">${countFor(day, c)}</span>` : ''}
              </div>
              <div class="chips">
                ${c.options.map((o) => `
                  <button class="chip ${c.id === 'bleeding' ? 'flow' : ''}" data-t="${c.id}:${o.id}"
                    aria-pressed="${isTagged(sel, c.id, o.id)}">${esc(o.label)}</button>`).join('')}
              </div>
            </div>`).join('')}

          ${NUMERIC.map((n) => `
            <div class="cat">
              <div class="cat-head"><span class="em">${n.emoji}</span><span class="name">${esc(n.label)}</span></div>
              <input class="input" type="number" inputmode="decimal" step="${n.step}" min="${n.min}" max="${n.max}"
                data-num="${n.id}" value="${day[n.id] ?? ''}" placeholder="${n.unit}">
            </div>`).join('')}

          <div class="cat">
            <div class="cat-head"><span class="em">📝</span><span class="name">Note</span></div>
            <textarea class="input" data-note placeholder="Anything worth remembering about today">${esc(day.note || '')}</textarea>
          </div>
        </div>

        <button class="btn ghost" data-clear-day>Clear this day</button>
      </div>`,

    mount(root) {
      $$('[data-d]', root).forEach((b) => b.addEventListener('click', () => {
        window.__orbit.go('log', { date: b.dataset.d });
      }));

      $$('[data-t]', root).forEach((b) => b.addEventListener('click', () => {
        const [cat, opt] = b.dataset.t.split(':');
        toggleTag(sel, cat, opt);
        const c = CAT_BY_ID[cat] || customTagsCat(get());
        if (!c.multi) {
          b.closest('.chips').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        }
        b.setAttribute('aria-pressed', isTagged(sel, cat, opt));
        const head = b.closest('.cat').querySelector('.cat-head');
        let badge = head.querySelector('.count');
        const n = countFor(dayEntry(sel) || {}, c);
        if (n && !badge) { badge = document.createElement('span'); badge.className = 'count'; head.appendChild(badge); }
        if (badge) badge.textContent = n || '';
      }));

      $$('[data-num]', root).forEach((inp) => inp.addEventListener('change', () => {
        const v = inp.value === '' ? null : Number(inp.value);
        setField(sel, inp.dataset.num, v);
      }));

      $('[data-note]', root).addEventListener('change', (e) => setField(sel, 'note', e.target.value.trim()));

      $('[data-pick]', root).addEventListener('click', () => {
        openSheet({
          title: 'Jump to a date',
          body: `<div class="field"><label>Date</label>
                 <input class="input" type="date" data-jump value="${sel}" max="${today()}"></div>
                 <button class="btn" data-goto>Open that day</button>`,
          onMount(sheet) {
            sheet.querySelector('[data-goto]').addEventListener('click', () => {
              const v = sheet.querySelector('[data-jump]').value;
              closeSheet();
              if (v) window.__orbit.go('log', { date: v });
            });
          },
        });
      });

      $('[data-clear-day]', root).addEventListener('click', () => {
        update((st) => { delete st.days[sel]; });
        toast('Day cleared');
        window.__orbit.go('log', { date: sel });
      });
    },
  };
}

function countFor(day, cat) {
  const v = day[cat.id];
  if (!v) return 0;
  return Array.isArray(v) ? v.length : 1;
}

/* =================================================================
   4. ANALYSIS
   ================================================================= */

let analysisCat = 'pain';

export function analysisView() {
  const s = get();
  const st = stats(s);
  const f = forecast(s);

  if (!st.cycles.length) {
    return {
      html: `${topbar(s, 'Analysis')}
        <div class="screen"><div class="empty"><span class="em">📈</span>
        <p>Charts appear once you have logged a period. Two or three cycles is enough to see a pattern.</p></div></div>`,
      mount: () => {},
    };
  }

  const recent = st.cycles.filter((c) => c.length != null).slice(-12);
  const maxLen = Math.max(35, ...recent.map((c) => c.length));

  const cat = CAT_BY_ID[analysisCat] || CAT_BY_ID.pain;
  const freq = symptomFrequency(s, cat, f);
  const bbt = bbtSeries(s);

  return {
    html: `
      ${topbar(s, 'Analysis')}
      <div class="screen">
        <div class="stat-row">
          <div class="stat"><div class="v">${st.avgCycle}<small>d</small></div><div class="k">Average cycle</div></div>
          <div class="stat"><div class="v">${st.avgPeriod}<small>d</small></div><div class="k">Average period</div></div>
          <div class="stat"><div class="v">${st.variation != null ? `±${st.variation}` : '–'}<small>d</small></div><div class="k">Variation</div></div>
        </div>

        <div class="card" style="margin-top:14px">
          <h2>Cycle length</h2>
          <div class="bars">
            ${recent.map((c) => `
              <div class="bar-col" title="${esc(fmtDate(c.start))}">
                <span class="val">${c.length}</span>
                <div class="bar-track">
                  <div class="bar" style="height:${Math.round((c.length / maxLen) * 100)}%">
                    <div class="p" style="height:${Math.round((c.periodLength / c.length) * 100)}%"></div>
                  </div>
                </div>
                <span class="lab">${esc(fmtDate(c.start, { month: 'short' }))}</span>
              </div>`).join('')}
          </div>
          <p class="note" style="margin-top:12px">${esc(regularityNote(st))}</p>
        </div>

        <div class="card">
          <h2>Where symptoms land</h2>
          <div class="chips" style="margin-bottom:14px">
            ${enabledCats(s).filter((c) => c.id !== 'bleeding').map((c) => `
              <button class="chip" data-acat="${c.id}" aria-pressed="${c.id === analysisCat}">${c.emoji} ${esc(c.label)}</button>`).join('')}
          </div>
          ${freq.total === 0
            ? `<p class="note">No ${esc(cat.label.toLowerCase())} logged yet.</p>`
            : `<div style="margin-bottom:14px">${freq.byPhase.map((p) => `
                <div class="freq-row">
                  <span class="nm">${esc(p.label)}</span>
                  <span class="track"><span class="fill" style="width:${p.pct}%;background:${p.color}"></span></span>
                  <span class="pc">${p.pct}%</span>
                </div>`).join('')}</div>
              <p class="note">Share of ${esc(cat.label.toLowerCase())} entries falling in each phase, across ${freq.total} logged ${freq.total === 1 ? 'day' : 'days'}.</p>`}
        </div>

        ${bbt.length >= 3 ? `
        <div class="card">
          <h2>Basal body temperature</h2>
          ${sparkline(bbt)}
          <p class="note" style="margin-top:10px">A sustained rise of about 0.3 °C often follows ovulation.</p>
        </div>` : ''}

        <div class="card">
          <h2>Cycle history</h2>
          ${[...st.cycles].reverse().slice(0, 14).map((c) => `
            <div class="freq-row" style="margin-bottom:11px">
              <span style="flex:1">${esc(fmtDate(c.start, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
              <span style="color:var(--muted);font-size:12.5px">
                ${c.length ? `${c.length} d cycle` : 'current'} · ${c.periodLength} d period
              </span>
            </div>`).join('')}
        </div>
      </div>`,

    mount(root) {
      $$('[data-acat]', root).forEach((b) => b.addEventListener('click', () => {
        analysisCat = b.dataset.acat;
        window.__orbit.render();
      }));
    },
  };
}

function regularityNote(st) {
  if (st.tracked < 3) return `Based on ${st.tracked} complete ${st.tracked === 1 ? 'cycle' : 'cycles'}. Patterns become readable from about three.`;
  if (st.variation <= 3) return `Your cycles vary by ${st.variation} days across the last ${Math.min(st.tracked, 6)}. That is a tight, regular range.`;
  if (st.variation <= 7) return `Your cycles vary by ${st.variation} days. Normal variation for most people sits under about 8 days.`;
  return `Your cycles vary by ${st.variation} days, which is wider than typical. Worth mentioning at a check-up if it continues.`;
}

function symptomFrequency(s, cat, f) {
  const buckets = { menstrual: 0, follicular: 0, fertile: 0, ovulation: 0, luteal: 0, pms: 0 };
  let total = 0;
  Object.keys(s.days).forEach((d) => {
    const v = s.days[d][cat.id];
    if (!v) return;
    const n = Array.isArray(v) ? v.length : 1;
    const c = classify(d, s, f);
    if (c.phase && buckets[c.phase] != null) { buckets[c.phase] += n; total += n; }
  });
  const order = ['menstrual', 'follicular', 'fertile', 'ovulation', 'luteal', 'pms'];
  return {
    total,
    byPhase: order.map((k) => ({
      label: PHASE_META[k].label,
      color: PHASE_META[k].color,
      pct: total ? Math.round((buckets[k] / total) * 100) : 0,
    })),
  };
}

function bbtSeries(s) {
  return Object.keys(s.days)
    .filter((d) => s.days[d].bbt != null)
    .sort()
    .slice(-40)
    .map((d) => ({ d, v: s.days[d].bbt }));
}

function sparkline(series) {
  const W = 300;
  const H = 90;
  const vals = series.map((x) => x.v);
  const lo = Math.min(...vals) - 0.05;
  const hi = Math.max(...vals) + 0.05;
  const span = hi - lo || 1;
  const pts = series.map((x, i) => {
    const px = (i / Math.max(series.length - 1, 1)) * W;
    const py = H - ((x.v - lo) / span) * H;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible" role="img" aria-label="Temperature trend">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${series.map((x, i) => {
      const px = (i / Math.max(series.length - 1, 1)) * W;
      const py = H - ((x.v - lo) / span) * H;
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2" fill="var(--accent)"/>`;
    }).join('')}
    <text x="0" y="-4" fill="var(--faint)" font-size="9">${hi.toFixed(2)}°</text>
    <text x="0" y="${H + 11}" fill="var(--faint)" font-size="9">${lo.toFixed(2)}°</text>
  </svg>`;
}

/* =================================================================
   shared topbar
   ================================================================= */

export function topbar(s, title, extra = '') {
  return `
    <div class="topbar">
      <div style="flex:1;min-width:0"><h1>${title}</h1></div>
      ${extra}
    </div>`;
}

export { enabledCats, daySummary };
