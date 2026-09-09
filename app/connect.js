// connect.js — sharing a cycle with a partner.
//
// Two routes:
//   1. Share link  — no server. The cycle is packed into a link the partner opens.
//   2. Live sync   — optional Supabase project. Everything is encrypted in the
//                    browser before it leaves the device, so the server only
//                    ever holds ciphertext.
//
// Both routes share only cycle dates: period days, fertile window, ovulation,
// PMS. Symptoms, moods, notes and numbers never leave the device.

import { get, update, blankState, validDate, validateState } from './state.js';
import { stats, diffDays, addDays, iso } from './cycle.js';

/* ------------------------- base64url ------------------------- */

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------- share link ------------------------- */

/** Pack the cycle history into a compact string. */
export function makeShareCode(state = get()) {
  const st = stats(state);
  if (!st.cycles.length) return null;

  const recent = st.cycles.slice(-14);
  const base = recent[0].start;

  const payload = {
    v: 2,
    n: (state.profile.name || '').slice(0, 40),
    b: base,
    o: recent.map((c) => [diffDays(base, c.start), c.periodLength]),
    d: Object.keys(state.days).filter(d => d >= base && ['light','medium','heavy','super-heavy'].includes(state.days[d].bleeding)).sort().map(d => [diffDays(base,d), 'medium']),
    c: recent.map(c => diffDays(base,c.start)),
    predict: !state.settings.pill?.enabled,
    a: st.avgCycle,
    p: st.avgPeriod,
    l: st.luteal,
    t: Date.now(),
  };
  return b64encode(JSON.stringify(payload));
}

export function shareLink(state = get()) {
  const code = makeShareCode(state);
  if (!code) return null;
  const base = location.origin + location.pathname;
  return `${base}#connect=${code}`;
}

/**
 * Turn a share code back into a state object the rest of the app can read.
 * Period days are rebuilt as ordinary bleeding entries, so the calendar,
 * ring and predictions all work through the same code path — and because
 * only bleeding is reconstructed, no symptom data can leak through.
 */
export function decodeShareCode(code) {
  let p;
  try {
    if (typeof code !== 'string' || code.length > 100000) throw new Error('Code is too large.');
    p = JSON.parse(b64decode(code.trim()));
  } catch {
    throw new Error('That code could not be read. Check it was copied in full.');
  }
  if (!p || ![1,2].includes(p.v) || !validDate(p.b) || !Array.isArray(p.o) || p.o.length > 14) {
    throw new Error('That code is not an Orbit share code.');
  }

  if (p.o.some(row => !Array.isArray(row) || row.length !== 2 || !Number.isInteger(row[0]) || row[0] < 0 || row[0] > 36500 || !Number.isInteger(row[1]) || row[1] < 1 || row[1] > 366)) throw new Error('Invalid period interval.');
  if (p.n != null && (typeof p.n !== 'string' || p.n.length > 40)) throw new Error('Invalid name.');
  const s = blankState();
  s.profile.name = p.n || 'Partner';
  s.profile.role = 'partner';
  s.profile.onboarded = true;
  s.settings.avgCycle = p.a || 28;
  s.settings.avgPeriod = p.p || 5;
  s.settings.luteal = p.l || 14;

  if (p.v === 2) {
    if (!Array.isArray(p.d) || p.d.length > 5000 || !Array.isArray(p.c) || p.c.length > 14) throw new Error('Invalid shared dates.');
    for (const row of p.d) {
      if (!Array.isArray(row) || row.length !== 2 || !Number.isInteger(row[0]) || row[0] < 0 || row[0] > 36500 || !['none','spotting','light','medium','heavy','super-heavy'].includes(row[1])) throw new Error('Invalid bleeding record.');
      s.days[addDays(p.b,row[0])] = { bleeding: row[1] };
    }
    for (const offset of p.c) {
      if (!Number.isInteger(offset) || offset < 0 || offset > 36500) throw new Error('Invalid cycle start.');
      const date=addDays(p.b,offset); (s.days[date] ||= {}).cycleStart='start';
    }
    s.settings.predictionsPaused = p.predict === false;
  } else {
    // Legacy links only identify episode spans; do not invent intermediate flow logs.
    for (const [offset] of p.o) s.days[addDays(p.b,offset)] = { cycleStart:'start' };
    s.legacyShare = true;
  }
  validateState(s);

  return { state: s, sharedAt: p.t, name: s.profile.name };
}

export function readConnectHash() {
  const m = location.hash.match(/[#&]connect=([A-Za-z0-9\-_]+)/);
  return m ? m[1] : null;
}

export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

/* ------------------------- encryption ------------------------- */

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ivec = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const buf = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivec }, key, data));
  const out = new Uint8Array(salt.length + ivec.length + buf.length);
  out.set(salt, 0); out.set(ivec, salt.length); out.set(buf, salt.length + ivec.length);
  let bin = '';
  out.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

export async function decryptJSON(b64, pass) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const ivec = raw.slice(16, 28);
  const body = raw.slice(28);
  const key = await deriveKey(pass, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivec }, key, body);
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ------------------------- PIN hashing ------------------------- */

export async function hashPin(pin, salt) {
  const saltBytes = salt
    ? Uint8Array.from(atob(salt), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = salt || btoa(String.fromCharCode(...saltBytes));
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' },
    base, 256,
  );
  const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { salt: saltB64, hash: hex, kdf: 'PBKDF2-SHA256', iterations: 600000 };
}

/* ------------------------- live sync (Supabase) ------------------------- */

function syncCfg() {
  const s = get().sync;
  const ok = s.on && s.url && s.key && s.room && s.pass;
  return ok ? s : null;
}

function deviceId() {
  let id = localStorage.getItem('orbit.device');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('orbit.device', id);
  }
  return id;
}

async function roomToken(cfg) {
  const raw = new TextEncoder().encode(`orbit-room-v2|${cfg.room}|${cfg.pass}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function endpoint(cfg, qs = '') {
  return `${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${qs}`;
}

function headers(cfg, extra = {}) {
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Push this device's cycle summary to the shared room. */
export async function syncPush() {
  const cfg = syncCfg();
  if (!cfg) return { skipped: true };
  const state = get();
  if(state.profile.role === 'partner') return {skipped:true};
  const code = makeShareCode(state);
  if (!code) return { skipped: true, reason: 'nothing to share yet' };

  const payload = await encryptJSON(
    { code, name: state.profile.name || 'Partner', at: Date.now() },
    cfg.pass,
  );

  let writeToken = localStorage.getItem('orbit.sync.writer');
  if (!writeToken) {
    writeToken = [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('orbit.sync.writer',writeToken);
    localStorage.removeItem('orbit.device'); // A new writer secret needs a new owned row.
  }
  const res = await fetch(endpoint(cfg, 'orbit_push_v2'), {
    method: 'POST', headers: headers(cfg),
    body: JSON.stringify({ room: await roomToken(cfg), device: deviceId(), writer: writeToken, encrypted: payload }),
  });

  if (!res.ok) throw new Error(`Push failed (${res.status}). Install the v2 database setup in Sharing settings if upgrading.`);
  update((s) => { s.sync.lastPush = Date.now(); });
  return { ok: true };
}

/** Pull the other person's cycle summary out of the shared room. */
export async function syncPull() {
  const cfg = syncCfg();
  if (!cfg) return { skipped: true };
  const room = await roomToken(cfg);
  const me = deviceId();
  const res = await fetch(endpoint(cfg, 'orbit_pull_v2'), {
    method: 'POST', headers: headers(cfg), body: JSON.stringify({ room }),
  });
  if (!res.ok) throw new Error(`Pull failed (${res.status}). Install the v2 database setup in Sharing settings if upgrading.`);

  const rows = await res.json();
  const theirs = rows.filter((r) => r.id !== me);
  if (!theirs.length) return { ok: true, found: false };

  theirs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const dec = await decryptJSON(theirs[0].payload, cfg.pass);
  const parsed = decodeShareCode(dec.code);

  update((s) => {
    s.connection = {
      name: dec.name || parsed.name,
      code: dec.code,
      sharedAt: dec.at || parsed.sharedAt,
      via: 'sync',
    };
    s.sync.lastPull = Date.now();
  });
  return { ok: true, found: true, name: dec.name };
}

export async function syncNow() {
  const cfg = syncCfg();
  if (!cfg) return { skipped: true };
  await syncPush();
  return syncPull();
}

export function syncEnabled() {
  return !!syncCfg();
}

// Capability-scoped RPCs: callers cannot enumerate the table or replace another
// device's record without its separate random writer secret. Room tokens are secrets.
export const SUPABASE_SQL = `create table if not exists public.orbit_sync_v2 (
  room text not null, id text not null, writer text not null,
  payload text not null, updated_at timestamptz not null default now(),
  primary key (room,id)
);
alter table public.orbit_sync_v2 enable row level security;
revoke all on public.orbit_sync_v2 from anon, authenticated;

create or replace function public.orbit_push_v2(room text, device text, writer text, encrypted text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if room !~ '^[a-f0-9]{32}$' or device !~ '^[a-f0-9]{24}$' or writer !~ '^[a-f0-9]{64}$'
     or length(encrypted) > 200000 then raise exception 'Invalid payload'; end if;
  insert into public.orbit_sync_v2 as existing values (room,device,writer,encrypted,now())
  on conflict on constraint orbit_sync_v2_pkey do update
    set payload=excluded.payload, updated_at=now()
    where existing.writer=excluded.writer;
  if not found then raise exception 'Writer secret does not match'; end if;
end $$;

create or replace function public.orbit_pull_v2(room text)
returns table(id text, payload text, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select s.id,s.payload,s.updated_at from public.orbit_sync_v2 s
  where s.room = orbit_pull_v2.room order by s.updated_at desc limit 20;
$$;
revoke all on function public.orbit_push_v2(text,text,text,text) from public;
revoke all on function public.orbit_pull_v2(text) from public;
grant execute on function public.orbit_push_v2(text,text,text,text) to anon;
grant execute on function public.orbit_pull_v2(text) to anon;

-- Close direct access to the old table; retain its encrypted rows for recovery.
do $$ begin
  if to_regclass('public.orbit_sync') is not null then
    execute 'revoke all on public.orbit_sync from anon, authenticated';
  end if;
end $$;`;

/* ------------------------- export / import ------------------------- */

export function exportJSON(state = get()) {
  const data = JSON.parse(JSON.stringify(state));
  data.sync = { ...data.sync, pass: '', key: '', on: false };
  data.settings.pin = null;
  return JSON.stringify({ app: 'orbit', exported: new Date().toISOString(), data }, null, 2);
}

export function exportCSV(state = get()) {
  const dates = Object.keys(state.days).sort();
  const cols = new Set(['date']);
  dates.forEach((d) => Object.keys(state.days[d]).forEach((k) => cols.add(k)));
  const head = [...cols];
  const lines = [head.join(',')];
  dates.forEach((d) => {
    const day = state.days[d];
    lines.push(head.map((c) => {
      if (c === 'date') return d;
      const v = day[c];
      if (v == null) return '';
      let s = Array.isArray(v) ? v.join(' | ') : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  });
  return lines.join('\n');
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function todayStamp() {
  return iso(new Date());
}
