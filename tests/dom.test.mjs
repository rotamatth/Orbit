import { JSDOM } from 'jsdom';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://example.com/orbit/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;

// shims jsdom lacks
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
window.navigator.serviceWorker = undefined;
window.Notification = undefined;
window.Blob = class { constructor(a){ this.size = a.join('').length; } };

for (const k of ['window','document','localStorage','location','history','navigator','Node','Element','HTMLElement','getComputedStyle','CustomEvent','Event','requestAnimationFrame','matchMedia','sessionStorage','MutationObserver','TextEncoder','TextDecoder']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true }); }
}
// node already has globalThis.crypto
globalThis.scrollTo = () => {};

const errors = [];
window.addEventListener('error', e => errors.push(e.message));
const origErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); origErr(...a); };

// ---- seed realistic data before boot
const S = await import('../app/state.js');
const C = await import('../app/cycle.js');
const iso = C.iso;
const t = new Date();
S.update(s => {
  s.profile = { name: 'Sam', role: 'tracker', onboarded: true };
  let d = C.addDays(iso(t), -170);
  for (const L of [29,28,30,27,29,28]) {
    for (let i=0;i<5;i++) s.days[C.addDays(d,i)] = { bleeding: i<2?'heavy':'medium' };
    s.days[C.addDays(d,1)].pain = ['cramps','headache'];
    s.days[C.addDays(d,1)].feelings = ['sensitive'];
    s.days[C.addDays(d,12)] = { fluid:'eggwhite', energy:'high', bbt: 36.45 };
    s.days[C.addDays(d,15)] = { bbt: 36.75, sex:['unprotected'] };
    s.days[C.addDays(d,L-3)] = { pms:['bloating','moodswings'], craving:['chocolate'], note:'tired today' };
    d = C.addDays(d, L);
  }
});

const V = await import('../app/views.js');
const M = await import('../app/more.js');
await import('../app/main-v5.js');

await new Promise(r => setTimeout(r, 120));

let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,x)); };

const app = window.document.getElementById('app');
console.log('\n— boot —');
ok('app rendered', app.innerHTML.length > 500, `${app.innerHTML.length} chars`);
ok('bottom nav present', !!app.querySelector('.nav'));
ok('5 tabs', app.querySelectorAll('[data-tab]').length === 5);
ok('cycle ring drawn', !!app.querySelector('[data-cycle-ring]'));
ok('ring has one arc per cycle day', app.querySelectorAll('[data-ring-index]').length >= 25,
   `${app.querySelectorAll('[data-ring-index]').length}`);
ok('day number shown', /\d/.test(app.querySelector('[data-ring-center-day]')?.textContent||''));

console.log('\n— every route renders —');
for (const r of ['cycle','calendar','log','analysis','more','connect','settings-cycle','settings-categories','reminders','privacy','data','about']) {
  const before = errors.length;
  try {
    window.__orbit.go(r);
    await new Promise(res => setTimeout(res, 30));
    const body = window.document.getElementById('app').innerHTML;
    ok(`${r} renders`, body.length > 400 && errors.length === before, `${body.length} chars, ${errors.length-before} errors`);
  } catch (e) { ok(`${r} renders`, false, e.message); }
}

console.log('\n— calendar —');
window.__orbit.go('calendar');
await new Promise(r=>setTimeout(r,30));
ok('42 day cells', app.querySelectorAll('.cal-cell').length === 42, `${app.querySelectorAll('.cal-cell').length}`);
ok('some days marked as period', app.querySelectorAll('.cal-cell.period, .cal-cell.period-pred').length > 0);
ok('fertile days marked', app.querySelectorAll('.cal-cell.fertile').length > 0);
ok('today is highlighted', app.querySelectorAll('.cal-cell.today').length === 1);
const monthBefore = app.querySelector('.cal-head .m').textContent;
app.querySelector('[data-nav="1"]').click();
await new Promise(r=>setTimeout(r,30));
ok('next month navigates', app.querySelector('.cal-head .m').textContent !== monthBefore);

console.log('\n— logging writes through —');
window.__orbit.go('log');
await new Promise(r=>setTimeout(r,30));
const todayISO = C.today();
ok('chips rendered', app.querySelectorAll('[data-t]').length > 40, `${app.querySelectorAll('[data-t]').length}`);
const heavy = app.querySelector('[data-t="bleeding:heavy"]');
heavy.click();
ok('flow saved to storage', S.get().days[todayISO]?.bleeding === 'heavy', JSON.stringify(S.get().days[todayISO]));
ok('chip shows pressed', heavy.getAttribute('aria-pressed') === 'true');
const cramps = app.querySelector('[data-t="pain:cramps"]');
cramps.click();
ok('multi-select adds', (S.get().days[todayISO].pain||[]).includes('cramps'));
cramps.click();
ok('tapping again removes', !(S.get().days[todayISO].pain||[]).includes('cramps'));
const light = app.querySelector('[data-t="bleeding:light"]');
light.click();
ok('single-select replaces', S.get().days[todayISO].bleeding === 'light');
const note = app.querySelector('[data-note]');
note.value = 'hello';
note.dispatchEvent(new window.Event('change'));
ok('note saved', S.get().days[todayISO].note === 'hello');
const bbt = app.querySelector('[data-num="bbt"]');
bbt.value = '36.55';
bbt.dispatchEvent(new window.Event('change'));
ok('bbt saved as a number', S.get().days[todayISO].bbt === 36.55);
app.querySelector('[data-clear-day]').click();
await new Promise(r=>setTimeout(r,30));
ok('clear day empties it', !S.get().days[todayISO]);

console.log('\n— quick log on home —');
window.__orbit.go('cycle');
await new Promise(r=>setTimeout(r,30));
const q = app.querySelector('[data-quick="bleeding:medium"]');
ok('quick-log chips present', !!q);
q.click();
await new Promise(r=>setTimeout(r,30));
ok('quick log writes', S.get().days[todayISO]?.bleeding === 'medium');
S.update(s => { delete s.days[todayISO]; });

console.log('\n— analysis —');
window.__orbit.go('analysis');
await new Promise(r=>setTimeout(r,30));
ok('stat blocks shown', app.querySelectorAll('.stat').length === 3);
ok('cycle bars drawn', app.querySelectorAll('.bar').length >= 5, `${app.querySelectorAll('.bar').length}`);
ok('phase breakdown shown', app.querySelectorAll('.freq-row').length > 3);
ok('bbt sparkline drawn', !!app.querySelector('svg polyline'));
const catBtn = app.querySelector('[data-acat="feelings"]');
catBtn.click();
await new Promise(r=>setTimeout(r,30));
ok('switching category re-renders', app.querySelector('[data-acat="feelings"]').getAttribute('aria-pressed')==='true');

console.log('\n— sheets —');
window.__orbit.go('calendar');
await new Promise(r=>setTimeout(r,30));
app.querySelector('.cal-cell.period, .cal-cell').click();
await new Promise(r=>setTimeout(r,30));
ok('day sheet opens', !!window.document.querySelector('.sheet'));
window.document.querySelector('.sheet [data-close]').click();
ok('sheet closes', !window.document.querySelector('.sheet'));

console.log('\n— partner flow end to end —');
const K = await import('../app/connect.js');
const link = K.shareLink();
ok('share link built', link && link.includes('#connect='), String(link).slice(0,50));
S.update(s => {
  const p = K.decodeShareCode(link.split('connect=')[1]);
  s.connection = { name:'Sam', code: link.split('connect=')[1], sharedAt: Date.now(), via:'link' };
});
window.__orbit.go('partner');
await new Promise(r=>setTimeout(r,40));
ok('partner view renders', app.innerHTML.includes('ring-wrap'));
ok('partner sees a calendar', app.querySelectorAll('.cal-cell').length === 42);
ok('partner sees coming-up dates', app.innerHTML.includes('Coming up'));
ok('partner view mentions the privacy wall', /not shared/i.test(app.textContent));
ok('no symptom words leak into partner view', !/cramps|chocolate|tired today/i.test(app.textContent));

console.log('\n— settings toggles persist —');
window.__orbit.go('settings-cycle');
await new Promise(r=>setTimeout(r,30));
const beforeLen = S.get().settings.avgCycle;
app.querySelector('[data-step="avgCycle:1"]').click();
ok('stepper increments and saves', S.get().settings.avgCycle === beforeLen+1, `${S.get().settings.avgCycle}`);
app.querySelector('[data-t="showFertile"]').click();
ok('switch saves', S.get().settings.showFertile === false);
app.querySelector('[data-t="showFertile"]').click();

window.__orbit.go('settings-categories');
await new Promise(r=>setTimeout(r,30));
const nBefore = S.get().settings.enabledCategories.length;
app.querySelector('[data-c="hair"]').click();
ok('category toggle saves', S.get().settings.enabledCategories.length === nBefore+1);

console.log('\n— back navigation —');
window.__orbit.go('more');
await new Promise(r=>setTimeout(r,20));
window.__orbit.go('about');
await new Promise(r=>setTimeout(r,20));
app.querySelector('[data-back-nav]').click();
await new Promise(r=>setTimeout(r,20));
ok('back returns to More', app.textContent.includes('Tracking categories'));

console.log('\n— current pill UI and evidence —');
S.update(s=>{s.profile.role='tracker';s.settings.pill={enabled:true,name:'Test pill',type:'combined',packStart:C.today(),activePills:21,placeboPills:7,scheduledTime:'21:00'};});
window.__orbit.go('cycle');
ok('pill card appears',!!app.querySelector('[data-pill11-card]'));
ok('fertility ring is absent in pill mode',!app.querySelector('[data-cycle-ring]'));
app.querySelector('[data-pill-take]').click();
ok('mark taken refreshes the card',app.querySelector('.pill11-current strong').textContent.includes('Taken'));
ok('dose has a full timestamp',S.get().days[C.today()].pillTakenAt.includes('T'));
const stableMarkup=app.innerHTML;
await new Promise(r=>setTimeout(r,150));
ok('pill page stays stable at idle',app.innerHTML===stableMarkup);
window.__orbit.go('log');
ok('timestamp editor appears',!!app.querySelector('[data-pill-actual]'));
app.querySelector('[data-pill-settings]').click();
const dialog=document.querySelector('.pill11-sheet');
ok('pill setup captures focus',dialog.contains(document.activeElement));
dialog.querySelector('[data-active]').value='999';dialog.querySelector('[data-save]').click();
ok('invalid pack is not saved',S.get().settings.pill.activePills===21);
document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
ok('Escape closes pill setup',!document.querySelector('.pill11-modal'));
S.update(s=>{s.days={};});window.__orbit.go('cycle');
ok('pill tracking works without menstrual history',!!app.querySelector('[data-pill11-card]'));
S.update(s=>{s.settings.reminders.pill.on=true;s.settings.pill.scheduledTime='00:00';});
localStorage.removeItem('orbit.notified');M.checkReminders();
ok('pill reminders work without menstrual history',!!JSON.parse(localStorage.getItem('orbit.notified')||'{}').pill);
S.update(s=>{s.days[C.today()]={pillStatus:'taken',pillTakenAt:new Date().toISOString()};});
localStorage.removeItem('orbit.notified');M.checkReminders();
ok('pillStatus prevents a duplicate reminder',!JSON.parse(localStorage.getItem('orbit.notified')||'{}').pill);
S.update(s=>{s.settings.pill.enabled=false;s.days={};s.days[C.addDays(C.today(),-70)]={bleeding:'medium'};});window.__orbit.go('cycle');
ok('long current cycles show the actual day without clamping the ring',app.querySelector('.ux-long-cycle')?.textContent.includes('Day 71'));
ok('zoom is enabled',!document.querySelector('meta[name=viewport]').content.includes('user-scalable=no'));

console.log('\n— uncaught errors —');
ok('no console errors during the whole run', errors.length === 0, errors.slice(0,4).join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
