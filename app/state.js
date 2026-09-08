// state.js — storage, defaults, and the tracking catalogue.

export const STORE_KEY = 'orbit.v1';

/* ---------------------------------------------------------------
   Tracking catalogue.
   Each category has: id, label, emoji, multi (can pick several),
   and a list of options. `tier: 2` categories are hidden until the
   user turns them on in Settings › Tracking categories.
   --------------------------------------------------------------- */
export const CATEGORIES = [
  {
    id: 'bleeding', label: 'Bleeding', emoji: '🩸', multi: false, core: true,
    options: [
      { id: 'spotting', label: 'Spotting' },
      { id: 'light', label: 'Light' },
      { id: 'medium', label: 'Medium' },
      { id: 'heavy', label: 'Heavy' },
      { id: 'super-heavy', label: 'Super heavy' },
    ],
  },
  {
    id: 'collection', label: 'Collection method', emoji: '🧻', multi: true,
    options: [
      { id: 'tampon', label: 'Tampon' },
      { id: 'pad', label: 'Pad' },
      { id: 'liner', label: 'Panty liner' },
      { id: 'cup', label: 'Menstrual cup' },
      { id: 'underwear', label: 'Period underwear' },
    ],
  },
  {
    id: 'pain', label: 'Pain', emoji: '⚡', multi: true, core: true,
    options: [
      { id: 'cramps', label: 'Cramps' },
      { id: 'headache', label: 'Headache' },
      { id: 'ovulation', label: 'Ovulation pain' },
      { id: 'breasts', label: 'Tender breasts' },
      { id: 'back', label: 'Backache' },
      { id: 'joints', label: 'Joint pain' },
    ],
  },
  {
    id: 'feelings', label: 'Feelings', emoji: '💭', multi: true, core: true,
    options: [
      { id: 'happy', label: 'Happy' },
      { id: 'confident', label: 'Confident' },
      { id: 'sensitive', label: 'Sensitive' },
      { id: 'sad', label: 'Sad' },
      { id: 'anxious', label: 'Anxious' },
      { id: 'irritated', label: 'Irritated' },
      { id: 'flat', label: 'Flat' },
    ],
  },
  {
    id: 'pms', label: 'PMS', emoji: '🌗', multi: true, core: true,
    options: [
      { id: 'moodswings', label: 'Mood swings' },
      { id: 'cramps', label: 'Cramps' },
      { id: 'bloating', label: 'Bloating' },
      { id: 'tender', label: 'Breast tenderness' },
      { id: 'headache', label: 'Headache' },
      { id: 'appetite', label: 'Appetite changes' },
    ],
  },
  {
    id: 'energy', label: 'Energy', emoji: '🔋', multi: false, core: true,
    options: [
      { id: 'energized', label: 'Energized' },
      { id: 'high', label: 'High' },
      { id: 'low', label: 'Low' },
      { id: 'exhausted', label: 'Exhausted' },
    ],
  },
  {
    id: 'sleep', label: 'Sleep', emoji: '🌙', multi: false, core: true,
    options: [
      { id: '0-3', label: '0–3 h' },
      { id: '3-6', label: '3–6 h' },
      { id: '6-9', label: '6–9 h' },
      { id: '9+', label: '9+ h' },
    ],
  },
  {
    id: 'sleepquality', label: 'Sleep quality', emoji: '😴', multi: false, tier: 2,
    options: [
      { id: 'restful', label: 'Restful' },
      { id: 'restless', label: 'Restless' },
      { id: 'woke', label: 'Woke often' },
      { id: 'insomnia', label: 'Insomnia' },
    ],
  },
  {
    id: 'fluid', label: 'Fluid', emoji: '💧', multi: false, core: true,
    options: [
      { id: 'none', label: 'None' },
      { id: 'sticky', label: 'Sticky' },
      { id: 'creamy', label: 'Creamy' },
      { id: 'eggwhite', label: 'Egg white' },
      { id: 'atypical', label: 'Atypical' },
    ],
  },
  {
    id: 'sex', label: 'Sex & drive', emoji: '❤️', multi: true, core: true,
    options: [
      { id: 'none', label: 'None' },
      { id: 'protected', label: 'Protected' },
      { id: 'unprotected', label: 'Unprotected' },
      { id: 'withdrawal', label: 'Withdrawal' },
      { id: 'high-drive', label: 'High drive' },
      { id: 'low-drive', label: 'Low drive' },
    ],
  },
  {
    id: 'digestion', label: 'Digestion', emoji: '🫄', multi: true,
    options: [
      { id: 'great', label: 'Great' },
      { id: 'bloated', label: 'Bloated' },
      { id: 'nauseated', label: 'Nauseated' },
      { id: 'gassy', label: 'Gassy' },
    ],
  },
  {
    id: 'stool', label: 'Stool', emoji: '🚽', multi: false, tier: 2,
    options: [
      { id: 'great', label: 'Great' },
      { id: 'normal', label: 'Normal' },
      { id: 'constipated', label: 'Constipated' },
      { id: 'diarrhea', label: 'Diarrhea' },
    ],
  },
  {
    id: 'craving', label: 'Cravings', emoji: '🍫', multi: true,
    options: [
      { id: 'sweet', label: 'Sweet' },
      { id: 'salty', label: 'Salty' },
      { id: 'carbs', label: 'Carbs' },
      { id: 'chocolate', label: 'Chocolate' },
      { id: 'none', label: 'None' },
    ],
  },
  {
    id: 'skin', label: 'Skin', emoji: '✨', multi: false,
    options: [
      { id: 'good', label: 'Good' },
      { id: 'oily', label: 'Oily' },
      { id: 'dry', label: 'Dry' },
      { id: 'acne', label: 'Acne' },
    ],
  },
  {
    id: 'hair', label: 'Hair', emoji: '💇', multi: false, tier: 2,
    options: [
      { id: 'good', label: 'Good' },
      { id: 'bad', label: 'Bad' },
      { id: 'oily', label: 'Oily' },
      { id: 'dry', label: 'Dry' },
    ],
  },
  {
    id: 'mental', label: 'Mental', emoji: '🧠', multi: true,
    options: [
      { id: 'focused', label: 'Focused' },
      { id: 'distracted', label: 'Distracted' },
      { id: 'calm', label: 'Calm' },
      { id: 'stressed', label: 'Stressed' },
    ],
  },
  {
    id: 'motivation', label: 'Motivation', emoji: '🎯', multi: false, tier: 2,
    options: [
      { id: 'motivated', label: 'Motivated' },
      { id: 'unmotivated', label: 'Unmotivated' },
      { id: 'productive', label: 'Productive' },
      { id: 'unproductive', label: 'Unproductive' },
    ],
  },
  {
    id: 'exercise', label: 'Exercise', emoji: '🏃', multi: true,
    options: [
      { id: 'none', label: 'None' },
      { id: 'walking', label: 'Walking' },
      { id: 'running', label: 'Running' },
      { id: 'cycling', label: 'Cycling' },
      { id: 'swimming', label: 'Swimming' },
      { id: 'gym', label: 'Gym' },
      { id: 'yoga', label: 'Yoga' },
      { id: 'team', label: 'Team sport' },
    ],
  },
  {
    id: 'social', label: 'Social', emoji: '👥', multi: true, tier: 2,
    options: [
      { id: 'sociable', label: 'Sociable' },
      { id: 'withdrawn', label: 'Withdrawn' },
      { id: 'supportive', label: 'Supportive' },
      { id: 'conflict', label: 'Conflict' },
    ],
  },
  {
    id: 'leisure', label: 'Leisure', emoji: '🎧', multi: true, tier: 2,
    options: [
      { id: 'reading', label: 'Reading' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'music', label: 'Music' },
      { id: 'film', label: 'Film & TV' },
      { id: 'outdoors', label: 'Outdoors' },
      { id: 'creative', label: 'Creative' },
    ],
  },
  {
    id: 'party', label: 'Party', emoji: '🥂', multi: true, tier: 2,
    options: [
      { id: 'drinks', label: 'Drinks' },
      { id: 'bignight', label: 'Big night' },
      { id: 'cigarettes', label: 'Cigarettes' },
      { id: 'hangover', label: 'Hangover' },
    ],
  },
  {
    id: 'medication', label: 'Medication', emoji: '💊', multi: true, core: true,
    options: [
      { id: 'pill-taken', label: 'Pill taken' },
      { id: 'pill-late', label: 'Pill late' },
      { id: 'pill-missed', label: 'Pill missed' },
      { id: 'painkiller', label: 'Pain relief' },
      { id: 'antibiotics', label: 'Antibiotics' },
      { id: 'antihistamine', label: 'Antihistamine' },
    ],
  },
  {
    id: 'supplements', label: 'Supplements', emoji: '🌿', multi: true, tier: 2,
    options: [
      { id: 'iron', label: 'Iron' },
      { id: 'magnesium', label: 'Magnesium' },
      { id: 'vitd', label: 'Vitamin D' },
      { id: 'omega3', label: 'Omega-3' },
      { id: 'folate', label: 'Folate' },
      { id: 'b12', label: 'B12' },
    ],
  },
  {
    id: 'tests', label: 'Tests', emoji: '🧪', multi: true,
    options: [
      { id: 'preg-neg', label: 'Pregnancy — negative' },
      { id: 'preg-pos', label: 'Pregnancy — positive' },
      { id: 'ovu-neg', label: 'Ovulation — negative' },
      { id: 'ovu-pos', label: 'Ovulation — positive' },
    ],
  },
  {
    id: 'ailment', label: 'Ailment', emoji: '🤒', multi: true,
    options: [
      { id: 'cold', label: 'Cold or flu' },
      { id: 'allergy', label: 'Allergy' },
      { id: 'fever', label: 'Fever' },
      { id: 'injury', label: 'Injury' },
    ],
  },
  {
    id: 'vulva', label: 'Vulva & vagina', emoji: '🌸', multi: true, tier: 2,
    options: [
      { id: 'normal', label: 'Normal' },
      { id: 'itchy', label: 'Itchy' },
      { id: 'dry', label: 'Dry' },
      { id: 'odour', label: 'Unusual odour' },
      { id: 'discomfort', label: 'Discomfort' },
    ],
  },
  {
    id: 'urine', label: 'Urine', emoji: '💛', multi: false, tier: 2,
    options: [
      { id: 'normal', label: 'Normal' },
      { id: 'frequent', label: 'Frequent' },
      { id: 'burning', label: 'Burning' },
      { id: 'cloudy', label: 'Cloudy' },
    ],
  },
  {
    id: 'appointments', label: 'Appointments', emoji: '📅', multi: true, tier: 2,
    options: [
      { id: 'doctor', label: 'Doctor' },
      { id: 'gyn', label: 'Gynaecologist' },
      { id: 'dentist', label: 'Dentist' },
      { id: 'travel', label: 'Travel' },
      { id: 'date', label: 'Date' },
    ],
  },
  {
    id: 'breasts', label: 'Breasts & chest', emoji: '🫶', multi: true, tier: 2,
    options: [
      { id: 'tender', label: 'Tender' },
      { id: 'sore', label: 'Sore' },
      { id: 'swollen', label: 'Swollen' },
      { id: 'normal', label: 'No change' },
    ],
  },
  {
    id: 'hotflashes', label: 'Hot flashes', emoji: '🔥', multi: false, tier: 2,
    options: [
      { id: 'none', label: 'None' },
      { id: 'mild', label: 'Mild' },
      { id: 'moderate', label: 'Moderate' },
      { id: 'severe', label: 'Severe' },
    ],
  },
  {
    id: 'meditation', label: 'Meditation', emoji: '🧘', multi: false, tier: 2,
    options: [
      { id: 'none', label: 'None' },
      { id: 'short', label: '< 10 min' },
      { id: 'medium', label: '10–30 min' },
      { id: 'long', label: '> 30 min' },
    ],
  },
  {
    id: 'iud', label: 'IUD', emoji: '⚕️', multi: true, tier: 2,
    options: [
      { id: 'strings-ok', label: 'Strings feel usual' },
      { id: 'strings-change', label: 'Strings feel different' },
      { id: 'check', label: 'IUD check' },
    ],
  },
  {
    id: 'birthcontrol', label: 'Birth control', emoji: '🛡️', multi: true, tier: 2,
    options: [
      { id: 'pill', label: 'Pill' },
      { id: 'patch', label: 'Patch' },
      { id: 'ring', label: 'Ring' },
      { id: 'shot', label: 'Shot' },
      { id: 'implant', label: 'Implant' },
      { id: 'iud-hormonal', label: 'Hormonal IUD' },
      { id: 'iud-copper', label: 'Copper IUD' },
      { id: 'condom', label: 'Condom' },
    ],
  },
  {
    id: 'cycleStart', label: 'Cycle start', emoji: '🔄', multi: false, tier: 2,
    options: [{ id: 'start', label: 'Start a new cycle' }],
  },
  {
    id: 'birthcontrolpill', label: 'Birth control pill', emoji: '💊', multi: false, tier: 2,
    options: [
      { id: 'taken', label: 'Taken' }, { id: 'late', label: 'Taken late' }, { id: 'missed', label: 'Missed' },
    ],
  },
  {
    id: 'birthcontrolpatch', label: 'Birth control patch', emoji: '🩹', multi: false, tier: 2,
    options: [
      { id: 'on', label: 'Patch on' }, { id: 'changed', label: 'Changed' }, { id: 'late', label: 'Change late' },
    ],
  },
  {
    id: 'birthcontrolring', label: 'Birth control ring', emoji: '⭕', multi: false, tier: 2,
    options: [
      { id: 'in', label: 'Ring in' }, { id: 'out', label: 'Ring out' }, { id: 'changed', label: 'Changed' },
    ],
  },
  {
    id: 'birthcontrolshot', label: 'Birth control shot', emoji: '💉', multi: false, tier: 2,
    options: [
      { id: 'received', label: 'Shot received' }, { id: 'due', label: 'Shot due' },
    ],
  },
  {
    id: 'birthcontrolimplant', label: 'Birth control implant', emoji: '➖', multi: false, tier: 2,
    options: [
      { id: 'check', label: 'Implant check' }, { id: 'changed', label: 'Implant changed' },
    ],
  },
];

// Numeric fields, tracked separately from chip categories.
export const NUMERIC = [
  { id: 'bbt', label: 'Basal body temperature', emoji: '🌡️', unit: '°C', step: 0.01, min: 34, max: 40 },
  { id: 'weight', label: 'Weight', emoji: '⚖️', unit: 'kg', step: 0.1, min: 20, max: 250 },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* --------------------------- defaults --------------------------- */

export function blankState() {
  return {
    version: 1,
    profile: {
      name: '',
      role: 'tracker',           // 'tracker' | 'partner'
      onboarded: false,
    },
    settings: {
      avgCycle: 28,
      avgPeriod: 5,
      luteal: 14,
      units: 'metric',           // 'metric' | 'imperial'
      weekStart: 1,              // 1 = Monday, 0 = Sunday
      showFertile: true,
      enabledCategories: CATEGORIES.filter((c) => !c.tier).map((c) => c.id),
      quickLog: ['bleeding', 'pain', 'feelings', 'energy'],
      reminders: {
        periodSoon: { on: false, daysBefore: 2 },
        periodLate: { on: false },
        fertileStart: { on: false },
        pill: { on: false, time: '21:00' },
      },
      pin: null,                 // { salt, hash }
      customTags: [],            // [{ id, label, category }]
    },
    days: {},                    // 'YYYY-MM-DD' -> { bleeding, pain: [], ..., bbt, weight, note }
    connection: null,            // partner's shared cycle payload
    sync: {                      // optional Supabase live sync
      url: '', key: '', room: '', pass: '', on: false, lastPush: null, lastPull: null,
    },
  };
}

/* --------------------------- persistence --------------------------- */

let _state = null;
const listeners = new Set();

export function load() {
  if (_state) return _state;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    _state = raw ? migrate(JSON.parse(raw)) : blankState();
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
    _state = blankState();
  }
  return _state;
}

function migrate(s) {
  const base = blankState();
  const merged = {
    ...base,
    ...s,
    profile: { ...base.profile, ...(s.profile || {}) },
    settings: {
      ...base.settings,
      ...(s.settings || {}),
      reminders: { ...base.settings.reminders, ...((s.settings || {}).reminders || {}) },
    },
    sync: { ...base.sync, ...(s.sync || {}) },
    days: s.days || {},
  };
  return merged;
}

export function get() {
  return load();
}

export function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(_state));
  } catch (err) {
    console.error('Saving failed — storage may be full.', err);
  }
  listeners.forEach((fn) => fn(_state));
}

export function update(fn) {
  fn(load());
  save();
}

export function replaceAll(next) {
  _state = migrate(next);
  save();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* --------------------------- day helpers --------------------------- */

export function dayEntry(iso) {
  return load().days[iso] || null;
}

export function ensureDay(iso) {
  const s = load();
  if (!s.days[iso]) s.days[iso] = {};
  return s.days[iso];
}

export function pruneDay(iso) {
  const s = load();
  const d = s.days[iso];
  if (!d) return;
  const empty = Object.keys(d).every((k) => {
    const v = d[k];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (empty) delete s.days[iso];
}

export function toggleTag(iso, catId, optId) {
  update((s) => {
    const cat = CAT_BY_ID[catId];
    const day = s.days[iso] || (s.days[iso] = {});
    if (cat && cat.multi) {
      const arr = Array.isArray(day[catId]) ? day[catId] : [];
      day[catId] = arr.includes(optId) ? arr.filter((x) => x !== optId) : [...arr, optId];
      if (day[catId].length === 0) delete day[catId];
    } else {
      if (day[catId] === optId) delete day[catId];
      else day[catId] = optId;
    }
  });
  update(() => pruneDay(iso));
}

export function isTagged(iso, catId, optId) {
  const d = dayEntry(iso);
  if (!d) return false;
  const v = d[catId];
  return Array.isArray(v) ? v.includes(optId) : v === optId;
}

export function setField(iso, field, value) {
  update((s) => {
    const day = s.days[iso] || (s.days[iso] = {});
    if (value === '' || value == null) delete day[field];
    else day[field] = value;
  });
  update(() => pruneDay(iso));
}

export function dayHasData(iso) {
  const d = dayEntry(iso);
  return !!d && Object.keys(d).length > 0;
}
