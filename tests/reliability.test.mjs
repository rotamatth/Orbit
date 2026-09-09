import assert from 'node:assert/strict';
const disk=new Map();
globalThis.localStorage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,String(v)),removeItem:k=>disk.delete(k)};
const S=await import('../app/state.js'), C=await import('../app/cycle.js'), K=await import('../app/connect.js'), P=await import('../app/pill-model.js');
let count=0;
function test(name,run){run();count++;console.log('✓',name);}
const series=(lengths)=>{const s=S.blankState();let date='2025-01-01';for(const length of [...lengths,0]){s.days[date]={bleeding:'medium'};date=C.addDays(date,length);}return s;};
test('failed persistence is reported and does not change committed state',()=>{
 S.update(s=>s.days['2025-01-01']={bleeding:'medium'});const before=JSON.stringify(S.get()),write=localStorage.setItem;
 localStorage.setItem=()=>{throw new Error('QuotaExceededError')};
 assert.throws(()=>S.setField('2025-01-02','note','new entry'));assert.equal(JSON.stringify(S.get()),before);
 localStorage.setItem=write;
});
test('previous snapshot can be restored',()=>{
 S.setField('2025-01-02','note','new entry');S.restorePrevious();assert.equal(S.get().days['2025-01-02'],undefined);
});
test('last health entry can be undone without changing settings',()=>{
 S.setField('2025-01-02','note','undo');S.update(s=>s.profile.name='Example');S.undoLastEntry();assert.equal(S.get().days['2025-01-02'],undefined);assert.equal(S.get().profile.name,'Example');
});
test('invalid backup dates, numeric values, types and prototype keys are rejected',()=>{
 for(const days of [{'2025-02-30':{}},{'2025-01-01':{bbt:98.6}},{'2025-01-01':{tests:'ovu-pos'}}])assert.throws(()=>S.replaceAll({days}));
 assert.throws(()=>S.validateState(JSON.parse('{"days":{},"__proto__":{}}')));
 assert.throws(()=>S.validateState({...S.blankState(),settings:{pill:{activePills:1000000}}}));
});
const sparse=series([]);
test('an estimate never resets the current cycle day',()=>{
 const date=C.addDays(C.today(),-40),s=S.blankState();s.days[date]={bleeding:'medium'};
 assert.equal(C.classify(C.today(),s).cycleDay,41);assert.equal(C.classify(C.today(),s).phase,null);
});
test('explicit cycle starts override short-gap grouping',()=>{
 const s=series([]);s.days['2025-01-07']={cycleStart:'start'};assert.equal(C.buildCycles(s).length,2);
});
test('no bleeding is an observation and does not start a period',()=>{
 const s=S.blankState();s.days['2025-01-01']={bleeding:'none'};assert.equal(C.buildCycles(s).length,0);
});
test('long intervals are preserved and confidence stays uncertain',()=>{
 const st=C.stats(series([28,28,56,28,28,28]));assert.ok(st.lengths.includes(56));assert.equal(st.confidenceLevel,'uncertain');assert.ok(st.uncertainty>=14);
});
test('configured luteal length is respected',()=>{
 const s=series([28,28]);s.settings.luteal=17;assert.equal(C.stats(s).luteal,17);
});
test('disturbed BBT cannot support an ovulation estimate',()=>{
 const s=series([]);for(let i=0;i<9;i++)s.days[C.addDays('2025-01-06',i)]={bbt:i<6?36.4:36.7,bbtContext:['fever']};
 assert.equal(C.ovulationEvidence(s,'2025-01-01'),null);
 for(const day of Object.values(s.days))delete day.bbtContext;
 assert.equal(C.ovulationEvidence(s,'2025-01-01').source,'BBT shift');
});
test('missing baseline days do not create a temperature confirmation',()=>{
 const s=series([]);for(let i=0;i<6;i++)s.days[C.addDays('2025-01-06',i*2)]={bbt:36.4};for(let i=0;i<3;i++)s.days[C.addDays('2025-01-18',i)]={bbt:36.7};assert.equal(C.bbtShift(s,'2025-01-01','2025-02-01'),null);
});
test('pill mode suppresses projected periods and fertility labels',()=>{
 const s=series([28,28]);s.settings.pill={enabled:true};assert.equal(C.forecast(s).windows.filter(w=>!w.actual).length,0);assert.equal(C.classify('2025-01-15',s).phase,null);
});
test('historical backtest reports samples and finite errors',()=>{const r=C.backtest(series([28,29,28,30,28,29]));assert.equal(r.samples,4);assert.ok(Number.isFinite(r.meanError));assert.ok(r.coverage>=0&&r.coverage<=1);});
test('share round trip preserves gaps, boundaries and privacy',()=>{
 const s=S.blankState();s.days={'2025-01-01':{bleeding:'medium',note:'private'},'2025-01-03':{bleeding:'light',bbt:36.7}};
 const decoded=K.decodeShareCode(K.makeShareCode(s)).state;
 assert.deepEqual(C.bleedDays(decoded),C.bleedDays(s));assert.equal(decoded.days['2025-01-02'],undefined);
 assert.equal(decoded.days['2025-01-01'].note,undefined);
});
test('legacy links retain episode starts without fabricating bleeding days',()=>{
 const code=Buffer.from(JSON.stringify({v:1,b:'2025-01-01',o:[[0,5]],a:28,p:5,l:14})).toString('base64url');
 const s=K.decodeShareCode(code).state;assert.equal(s.legacyShare,true);assert.equal(C.bleedDays(s).length,0);assert.equal(C.buildCycles(s).length,1);
});
test('oversized and malformed share offsets are rejected',()=>{
 const code=Buffer.from(JSON.stringify({v:1,b:'2025-01-01',o:[[0,1e9]]})).toString('base64url');assert.throws(()=>K.decodeShareCode(code));assert.throws(()=>K.decodeShareCode('a'.repeat(100001)));
});
test('exports omit reusable secrets and neutralize spreadsheet formulas',()=>{
 const s=S.blankState();s.sync.pass='SECRET';s.sync.key='KEY';s.settings.pin={hash:'HASH'};s.days['2025-01-01']={note:'=1+1'};
 const out=K.exportJSON(s);assert.ok(!out.includes('SECRET'));assert.ok(!out.includes('HASH'));assert.ok(K.exportCSV(s).includes("'=1+1"));
});
test('dose timestamps distinguish next-day lateness and legacy unknown dates',()=>{
 const p={scheduledTime:'08:00'};const actual=new Date('2025-01-02T07:00:00').toISOString();assert.equal(P.doseTiming('2025-01-01',{pillTakenAt:actual},p).minutes,1380);assert.equal(P.doseTiming('2025-01-01',{pillTakenAt:'07:00'},p).legacy,true);
});
test('adherence excludes not-yet-due doses and distinguishes unknown from missed',()=>{
 const s=S.blankState(),t=C.today();s.settings.pill={enabled:true,packStart:C.addDays(t,-2),activePills:21,placeboPills:7,scheduledTime:'21:00'};
 s.days[C.addDays(t,-2)]={pillStatus:'missed'};
 const a=P.adherence(s,28,new Date(t+'T10:00:00'));assert.equal(a.scheduled,2);assert.equal(a.unknown,1);assert.equal(a.missed,1);
});
test('schedule history does not rewrite earlier pack positions',()=>{
 const s=S.blankState();s.settings.pill={enabled:true,history:[{effectiveFrom:'2025-01-01',packStart:'2025-01-01',activePills:21,placeboPills:7},{effectiveFrom:'2025-02-01',packStart:'2025-02-01',activePills:24,placeboPills:4}]};assert.equal(P.packInfo('2025-01-23',s).kind,'placebo');assert.equal(P.packInfo('2025-02-23',s).kind,'active');
});
// Fresh module instance reproduces startup corruption, without mutating the primary fixture.
const original=disk.get(S.STORE_KEY);disk.set(S.STORE_KEY,'broken JSON');
const Fresh=await import('../app/state.js?corruption');Fresh.load();assert.equal(Fresh.storageStatus().blocked,true);assert.throws(()=>Fresh.update(s=>s.profile.name='overwrite'));assert.equal(disk.get(S.STORE_KEY),'broken JSON');disk.set(S.STORE_KEY,original);
console.log(`${count} reliability checks passed`);
