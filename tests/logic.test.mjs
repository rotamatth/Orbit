// Minimal browser shims so the pure-logic modules can run under node.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
// node 22 already provides globalThis.crypto
globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
globalThis.location = { origin: 'https://example.com', pathname: '/orbit/', hash: '', search: '' };
globalThis.history = { replaceState() {} };

const S = await import('../app/state.js');
const C = await import('../app/cycle.js');
const K = await import('../app/connect.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};

// ---- build a synthetic year: cycles of 28,30,27,29,28,31 days, 5-day periods
const startDates = [];
let d = '2026-02-02';
const lens = [28, 30, 27, 29, 28, 31, 28];
S.update(s => {
  for (const L of lens) {
    startDates.push(d);
    for (let i = 0; i < 5; i++) {
      s.days[C.addDays(d, i)] = { bleeding: i < 2 ? 'heavy' : i < 4 ? 'medium' : 'light' };
    }
    d = C.addDays(d, L);
  }
  startDates.push(d);
  for (let i = 0; i < 5; i++) s.days[C.addDays(d, i)] = { bleeding: 'medium' };
});

console.log('\n— cycle detection —');
const cy = C.buildCycles();
ok('found 8 cycles', cy.length === 8, `got ${cy.length}`);
ok('starts match', cy.map(c => c.start).join() === startDates.join(), cy.map(c=>c.start).join());
ok('lengths match', cy.slice(0,7).map(c => c.length).join() === lens.join(), cy.map(c=>c.length).join());
ok('period length 5', cy.every(c => c.periodLength === 5));

console.log('\n— stats —');
const st = C.stats();
ok('avg cycle in range 28-30', st.avgCycle >= 28 && st.avgCycle <= 30, `avg=${st.avgCycle}`);
ok('avg period 5', st.avgPeriod === 5, `${st.avgPeriod}`);
ok('variation is 4', st.variation === 4, `${st.variation}`);
ok('confident', st.confident === true);

console.log('\n— gap tolerance (a skipped middle day is one period) —');
S.update(s => { delete s.days[C.addDays(startDates[3], 2)]; });
ok('still 8 cycles after a 1-day gap', C.buildCycles().length === 8, `${C.buildCycles().length}`);
S.update(s => { s.days[C.addDays(startDates[3], 2)] = { bleeding: 'medium' }; });

console.log('\n— spotting is not a period —');
S.update(s => { s.days['2026-08-20'] = { bleeding: 'spotting' }; });
ok('spotting adds no cycle', C.buildCycles().length === 8, `${C.buildCycles().length}`);

console.log('\n— predictions —');
const f = C.forecast();
const future = f.windows.filter(w => !w.actual);
ok('13 future cycles projected', future.length === 13, `${future.length}`);
const w0 = future[0];
ok('next start = last start + avg', w0.start === C.addDays(cy[7].start, st.avgCycle), w0.start);
ok('ovulation = start + avg - luteal', w0.ovulation === C.addDays(w0.start, st.avgCycle - 14));
ok('fertile estimate is at least the biological 7-day window', C.diffDays(w0.fertileStart, w0.fertileEnd) >= 6);
ok('pms window is 5 days', C.diffDays(w0.pmsStart, w0.pmsEnd) === 4);

console.log('\n— classification —');
ok('day 1 of a logged period is menstrual', C.classify(startDates[2]).phase === 'menstrual');
ok('logged period is not marked predicted', C.classify(startDates[2]).predicted === false);
ok('future period is marked predicted', C.classify(w0.start).predicted === true);
ok('ovulation day classifies as ovulation', C.classify(w0.ovulation).phase === 'ovulation');
ok('a fertile day classifies as fertile', C.classify(C.addDays(w0.ovulation,-3)).phase === 'fertile');
ok('a pms day classifies as pms', C.classify(w0.pmsStart).phase === 'pms');
const early = C.classify(C.addDays(w0.start, 7));
ok('mid-follicular classifies as follicular', early.phase === 'follicular', early.phase);
ok('cycle day counts from 1', C.classify(startDates[2]).cycleDay === 1);

console.log('\n— share code round trip —');
const code = K.makeShareCode();
ok('code is url-safe', /^[A-Za-z0-9_-]+$/.test(code));
ok('code is compact', code.length < 4000, `${code.length} chars`);
const back = K.decodeShareCode(code);
const theirCycles = C.buildCycles(back.state);
ok('cycle starts survive the round trip',
   theirCycles.map(c=>c.start).join() === cy.map(c=>c.start).join(),
   theirCycles.map(c=>c.start).join());
ok('period lengths survive', theirCycles.every(c => c.periodLength === 5));
ok('predictions agree', C.stats(back.state).avgCycle === st.avgCycle);
ok('NO symptoms leak through', Object.values(back.state.days).every(d => Object.keys(d).every(k => ['bleeding','cycleStart'].includes(k))));

console.log('\n— privacy wall: symptoms must not be in the payload —');
S.update(s => { s.days[startDates[6]].pain = ['cramps']; s.days[startDates[6]].note = 'SECRETNOTE'; s.days[startDates[6]].feelings = ['sad']; });
const code2 = K.makeShareCode();
const raw = Buffer.from(code2.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString();
ok('note not in payload', !raw.includes('SECRETNOTE'));
ok('symptoms not in payload', !raw.includes('cramps') && !raw.includes('sad'));

console.log('\n— encryption round trip —');
const ct = await K.encryptJSON({ hello: 'world', n: 42 }, 'a long passphrase');
const pt = await K.decryptJSON(ct, 'a long passphrase');
ok('decrypts with the right passphrase', pt.hello === 'world' && pt.n === 42);
ok('ciphertext hides the plaintext', !Buffer.from(ct,'base64').toString().includes('world'));
let threw = false;
try { await K.decryptJSON(ct, 'wrong passphrase'); } catch { threw = true; }
ok('wrong passphrase fails', threw);

console.log('\n— pin hashing —');
const p1 = await K.hashPin('1234');
const p2 = await K.hashPin('1234', p1.salt);
const p3 = await K.hashPin('9999', p1.salt);
ok('same pin + salt = same hash', p1.hash === p2.hash);
ok('different pin = different hash', p1.hash !== p3.hash);

console.log('\n— csv export —');
const csv = K.exportCSV();
ok('csv has a header row', csv.split('\n')[0].startsWith('date,'));
ok('csv row count matches logged days', csv.trim().split('\n').length === Object.keys(S.get().days).length + 1);

console.log('\n— edge cases —');
const empty = S.blankState();
ok('no data -> no cycles', C.buildCycles(empty).length === 0);
ok('no data -> falls back to settings', C.stats(empty).avgCycle === 28);
ok('no data -> headline does not crash', !!C.headline(empty).title);
ok('no data -> share code is null', K.makeShareCode(empty) === null);
const one = S.blankState();
one.days['2026-09-01'] = { bleeding: 'medium' };
ok('single period -> 1 cycle, no length', C.buildCycles(one).length === 1 && C.buildCycles(one)[0].length === null);
ok('single period still forecasts', C.forecast(one).windows.filter(w=>!w.actual).length === 13);
let bad = false;
try { K.decodeShareCode('not-a-real-code'); } catch { bad = true; }
ok('garbage share code is rejected', bad);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
