// reliability-v7.js — conservative fertility-awareness support, calendar polish and richer insights.
// This module never labels a day "safe" for unprotected sex. Orbit is not a clinically
// validated contraceptive method. If avoiding pregnancy, use a reliable contraceptive method.

import { get, update, CATEGORIES } from './state.js';
import { today, addDays, diffDays, fmtDate, forecast, classify, stats, ovulationEvidence } from './cycle.js';
import { esc, toast } from './ui.js';

const DISTURB = new Set(['poor-sleep','fever','alcohol','late','travel','illness']);

function go(route, params={}) { window.__orbit?.go(route, params); }

function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

function recentDates(n=30) {
  const out=[]; const t=today();
  for(let i=n-1;i>=0;i--) out.push(addDays(t,-i));
  return out;
}

function cervicalLabel(v) {
  return ({none:'Dry / none',sticky:'Sticky',creamy:'Creamy',watery:'Watery',eggwhite:'Egg-white / slippery',atypical:'Atypical'})[v] || 'Not logged';
}

function bbtQuality(day) {
  if (!day || day.bbt == null) return 'missing';
  const ctx = arr(day.bbtContext);
  return ctx.some(x=>DISTURB.has(x)) ? 'disturbed' : 'usable';
}

function positiveLHBetween(s,start,end) {
  return Object.keys(s.days).sort().filter(d => d>=start && d<=end && arr(s.days[d].tests).includes('ovu-pos'));
}

function mucusPeakBetween(s,start,end) {
  const hits=Object.keys(s.days).sort().filter(d=>d>=start&&d<=end&&['eggwhite','watery'].includes(s.days[d].fluid));
  return hits.length ? hits[hits.length-1] : null;
}

function tempShiftEvidence(s,start,end) {
  const rows=Object.keys(s.days).sort()
    .filter(d=>d>=start&&d<=end&&Number.isFinite(Number(s.days[d].bbt))&&bbtQuality(s.days[d])==='usable')
    .map(d=>({d,t:Number(s.days[d].bbt)}));
  if(rows.length<9) return null;
  const median=(xs)=>{const v=[...xs].sort((a,b)=>a-b);const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
  for(let i=6;i<=rows.length-3;i++){
    if(diffDays(rows[i].d,rows[i+1].d)!==1||diffDays(rows[i+1].d,rows[i+2].d)!==1) continue;
    const base=median(rows.slice(i-6,i).map(r=>r.t));
    if(rows[i].t>=base+.20&&rows[i+1].t>=base+.20&&rows[i+2].t>=base+.20){
      return {firstHigh:rows[i].d, estimatedOvulation:addDays(rows[i].d,-1), baseline:base};
    }
  }
  return null;
}

function currentCycle(s,f) {
  const t=today();
  const cycles=f.stats.cycles;
  const c=[...cycles].reverse().find(x=>x.start<=t);
  if(!c) return null;
  const next=f.windows.find(w=>!w.actual&&w.start>t);
  return {cycle:c,next};
}

function fertilityEvidence(s=get()) {
  const f=forecast(s); const cc=currentCycle(s,f); const t=today();
  if(!cc) return {level:'uncertain',title:'Protection recommended',reason:'Not enough cycle history.',items:[],f};
  const start=cc.cycle.start;
  const lh=positiveLHBetween(s,start,t);
  const mucus=mucusPeakBetween(s,start,t);
  const temp=tempShiftEvidence(s,start,t);
  const todayClass=classify(t,s,f);
  const todayDay=s.days[t]||{};
  const todayMucus=todayDay.fluid;
  const hasFertileMucus=['watery','eggwhite'].includes(todayMucus);
  const recentLH=lh.length && diffDays(lh[lh.length-1],t)<=3;
  const disturbedToday=bbtQuality(todayDay)==='disturbed';

  let level='uncertain';
  let title='Protection recommended';
  let reason='Fertility cannot be ruled out from calendar timing alone.';

  if(hasFertileMucus||recentLH||todayClass.isFertile||todayClass.isOvulation){
    level='possible';
    title='Fertility possible';
    reason=hasFertileMucus?'Fertile-type cervical fluid is logged today.':recentLH?'A recent positive LH test suggests ovulation may be near.':'Today falls in Orbit’s broad fertile estimate.';
  } else if(temp && mucus && diffDays(mucus,t)>=3 && diffDays(temp.firstHigh,t)>=2){
    level='post';
    title='Post-ovulation signs observed';
    reason='A sustained temperature rise and a past mucus peak are both present. This is retrospective evidence, not contraceptive clearance.';
  }

  const usableBBT=recentDates(14).filter(d=>bbtQuality(s.days[d])==='usable').length;
  const disturbedBBT=recentDates(14).filter(d=>bbtQuality(s.days[d])==='disturbed').length;
  const mucusDays=recentDates(14).filter(d=>s.days[d]?.fluid).length;
  const items=[
    {k:'Temperature',v:temp?`Shift observed from ${fmtDate(temp.firstHigh)}`:`${usableBBT}/14 usable recent readings`,ok:!!temp},
    {k:'Cervical fluid',v:mucus?`Last watery/slippery day ${fmtDate(mucus)}`:`${mucusDays}/14 days logged`,ok:!!mucus},
    {k:'LH tests',v:lh.length?`Positive ${fmtDate(lh[lh.length-1])}`:'No positive test this cycle',ok:lh.length>0},
    {k:'Data quality',v:disturbedToday?'Today’s BBT marked disturbed':disturbedBBT?`${disturbedBBT} disturbed reading${disturbedBBT===1?'':'s'} in 14 days`:'No recent BBT disturbances logged',ok:!disturbedToday},
  ];
  return {level,title,reason,items,temp,mucus,lh,f,next:cc.next};
}

function preventionCard() {
  const e=fertilityEvidence();
  const box=document.createElement('section');
  box.className=`ux7-prevention is-${e.level}`;
  box.dataset.ux7Prevention='1';
  box.innerHTML=`
    <div class="ux7-status-head">
      <div><span class="ux-kicker">Pregnancy prevention</span><h2>${esc(e.title)}</h2></div>
      <span class="ux7-status-dot" aria-hidden="true"></span>
    </div>
    <p class="ux7-status-reason">${esc(e.reason)}</p>
    <div class="ux7-evidence">
      ${e.items.map(x=>`<div><span>${esc(x.k)}</span><strong>${esc(x.v)}</strong></div>`).join('')}
    </div>
    <div class="ux7-safety">If avoiding pregnancy, use a reliable contraceptive method or avoid vaginal sex when fertility is possible or uncertain. Orbit never labels a day “safe.”</div>`;
  return box;
}

function enhanceCycleSafety(){
  const home=document.querySelector('.ux-v5-home');
  if(!home||document.querySelector('[data-ux7-prevention]')) return;
  const feel=home.querySelector('.ux-v5-feel');
  const card=preventionCard();
  if(feel) feel.insertAdjacentElement('beforebegin',card); else home.appendChild(card);
}

function enhanceTrackFertility(){
  const screen=document.querySelector('[data-ux-tracking-date]');
  if(!screen||screen.querySelector('[data-ux7-fertility-log]')) return;
  const date=screen.dataset.uxTrackingDate||today();
  const s=get(); const day=s.days[date]||{};
  const host=document.createElement('section');
  host.className='ux7-fertility-log'; host.dataset.ux7FertilityLog='1';
  const ctx=arr(day.bbtContext);
  host.innerHTML=`
    <div class="ux7-section-head"><div><span class="ux-kicker">Fertility signals</span><h2>Improve data quality</h2></div><span>optional</span></div>
    <div class="ux7-field-grid">
      <label><span>BBT time</span><input class="input" type="time" data-ux7-bbt-time value="${esc(day.bbtTime||'')}"></label>
      <label><span>Cervical fluid</span><select class="input" data-ux7-fluid>
        <option value="">Not logged</option><option value="none" ${day.fluid==='none'?'selected':''}>Dry / none</option><option value="sticky" ${day.fluid==='sticky'?'selected':''}>Sticky</option><option value="creamy" ${day.fluid==='creamy'?'selected':''}>Creamy</option><option value="watery" ${day.fluid==='watery'?'selected':''}>Watery</option><option value="eggwhite" ${day.fluid==='eggwhite'?'selected':''}>Egg-white / slippery</option>
      </select></label>
    </div>
    <div class="ux7-context-title">Mark anything that could disturb BBT</div>
    <div class="ux7-context-chips">
      ${[['poor-sleep','Poor sleep'],['fever','Fever'],['illness','Illness'],['alcohol','Alcohol'],['late','Measured late'],['travel','Travel / timezone']].map(([id,label])=>`<button type="button" data-ux7-context="${id}" aria-pressed="${ctx.includes(id)}">${label}</button>`).join('')}
    </div>
    <p class="ux7-help">For trends, take BBT immediately after waking, before getting up, at roughly the same time. Disturbed readings remain saved but are excluded from Orbit’s evidence check.</p>`;

  const intro=screen.querySelector('.ux-v5-track-intro');
  if(intro) intro.insertAdjacentElement('afterend',host); else screen.prepend(host);
  host.querySelector('[data-ux7-bbt-time]').addEventListener('change',e=>update(st=>{const d=st.days[date]||(st.days[date]={});if(e.target.value)d.bbtTime=e.target.value;else delete d.bbtTime;}));
  host.querySelector('[data-ux7-fluid]').addEventListener('change',e=>update(st=>{const d=st.days[date]||(st.days[date]={});if(e.target.value)d.fluid=e.target.value;else delete d.fluid;}));
  host.querySelectorAll('[data-ux7-context]').forEach(b=>b.addEventListener('click',()=>{
    update(st=>{const d=st.days[date]||(st.days[date]={});let a=arr(d.bbtContext);a=a.includes(b.dataset.ux7Context)?a.filter(x=>x!==b.dataset.ux7Context):[...a,b.dataset.ux7Context];if(a.length)d.bbtContext=a;else delete d.bbtContext;});
    b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');
  }));
}

function monthSummary(){
  const s=get(); const f=forecast(s); const t=today(); const c=classify(t,s,f);
  const next=f.windows.find(w=>!w.actual&&w.start>=t);
  const el=document.createElement('div'); el.className='ux7-cal-summary'; el.dataset.ux7CalSummary='1';
  el.innerHTML=`<div><span>Today</span><strong>${c.cycleDay?`Cycle day ${c.cycleDay}`:'Learning cycle'}</strong></div><div><span>Next period</span><strong>${next?fmtDate(next.start,{day:'numeric',month:'short'}):'—'}</strong><small>${next?`${fmtDate(next.startMin)}–${fmtDate(next.startMax)}`:''}</small></div>`;
  return el;
}

function enhanceCalendar(){
  const head=document.querySelector('.cal-head');
  const grid=document.querySelector('.cal-grid');
  if(!head||!grid||document.querySelector('[data-ux7-cal-summary]')) return;
  const toolbar=document.querySelector('.ux-calendar-toolbar');
  (toolbar||head).insertAdjacentElement('afterend',monthSummary());
  const s=get(); const f=forecast(s);
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    const d=cell.dataset.date; const c=classify(d,s,f); const day=s.days[d];
    cell.dataset.ux7Phase=c.phase||'';
    if(day){
      const tags=[];
      if(day.bleeding)tags.push('🩸');
      if(day.bbt!=null)tags.push('🌡️');
      if(day.fluid&&day.fluid!=='none')tags.push('💧');
      if(arr(day.tests).includes('ovu-pos'))tags.push('🧪');
      if(tags.length){const badge=document.createElement('span');badge.className='ux7-cal-icons';badge.textContent=tags.slice(0,3).join('');cell.appendChild(badge);}
    }
  });
}

function trendDelta(vals){
  if(vals.length<6)return null;
  const a=vals.slice(-6,-3),b=vals.slice(-3); const mean=x=>x.reduce((p,q)=>p+q,0)/x.length;
  return mean(b)-mean(a);
}

function topSymptoms(s,f){
  const rows=[];
  for(const cat of CATEGORIES.filter(c=>['pain','feelings','pms','energy','sleep','digestion','mental'].includes(c.id))){
    const counts={};
    for(const [date,day] of Object.entries(s.days)){
      for(const id of arr(day[cat.id])) counts[id]=(counts[id]||0)+1;
    }
    const best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    if(best){const opt=cat.options.find(o=>o.id===best[0]);rows.push({label:`${cat.emoji} ${opt?.label||best[0]}`,count:best[1]});}
  }
  return rows.sort((a,b)=>b.count-a.count).slice(0,4);
}

function enhanceAnalysis(){
  const screen=[...document.querySelectorAll('.screen')].find(x=>x.querySelector('.stat-row')&&x.querySelector('.bars'));
  if(!screen||screen.querySelector('[data-ux7-analysis]')) return;
  const s=get(),st=stats(s),f=forecast(s); const recent=st.completed.slice(-12); const delta=trendDelta(recent.map(c=>c.length));
  const next=f.windows.find(w=>!w.actual&&w.start>=today());
  const last30=recentDates(30); const bbt=last30.filter(d=>s.days[d]?.bbt!=null).length; const usable=last30.filter(d=>bbtQuality(s.days[d])==='usable').length; const fluid=last30.filter(d=>s.days[d]?.fluid).length; const lh=last30.filter(d=>arr(s.days[d]?.tests).some(x=>x==='ovu-pos'||x==='ovu-neg')).length;
  const syms=topSymptoms(s,f);
  const panel=document.createElement('section'); panel.className='ux7-analysis'; panel.dataset.ux7Analysis='1';
  panel.innerHTML=`
    <div class="ux7-analysis-hero"><span class="ux-kicker">At a glance</span><h2>Your cycle insights</h2><p>${st.confidenceLevel==='high'?'Predictions are strongly personalised from your recent history.':st.confidenceLevel==='moderate'?'Orbit is personalising predictions from your recent cycles.':'Orbit is still learning; ranges are intentionally wider.'}</p></div>
    <div class="ux7-insight-grid">
      <div><span>Cycle range</span><strong>${st.shortest&&st.longest?`${st.shortest}–${st.longest} d`:'—'}</strong><small>${st.tracked} completed cycles</small></div>
      <div><span>Recent direction</span><strong>${delta==null?'Need 6 cycles':Math.abs(delta)<1?'Stable':delta>0?`+${delta.toFixed(1)} d`:`${delta.toFixed(1)} d`}</strong><small>last 3 vs previous 3</small></div>
      <div><span>Next estimate</span><strong>${next?fmtDate(next.start,{day:'numeric',month:'short'}):'—'}</strong><small>${next?`range ${fmtDate(next.startMin)}–${fmtDate(next.startMax)}`:'more history needed'}</small></div>
      <div><span>Prediction quality</span><strong>${st.confidenceLevel}</strong><small>uncertainty ±${st.uncertainty} d</small></div>
    </div>
    <div class="ux7-insight-card"><div class="ux7-section-head"><div><span class="ux-kicker">Fertility data quality</span><h3>Last 30 days</h3></div></div><div class="ux7-coverage"><div><strong>${usable}/${bbt}</strong><span>usable BBT</span></div><div><strong>${fluid}</strong><span>fluid logs</span></div><div><strong>${lh}</strong><span>LH tests</span></div></div><p>Consistent observations improve retrospective interpretation. Calendar timing alone is not enough to determine contraceptive safety.</p></div>
    <div class="ux7-insight-card"><div class="ux7-section-head"><div><span class="ux-kicker">Most tracked</span><h3>Recurring signals</h3></div></div>${syms.length?`<div class="ux7-symptoms">${syms.map(x=>`<div><span>${esc(x.label)}</span><strong>${x.count}×</strong></div>`).join('')}</div>`:'<p>Track a few more symptoms to reveal recurring patterns.</p>'}</div>`;
  const stat=screen.querySelector('.stat-row'); stat?.insertAdjacentElement('afterend',panel);
}

function recentUnprotectedAlert(){
  const s=get(); const t=today(); const hits=[];
  for(let i=0;i<=5;i++){const d=addDays(t,-i);if(arr(s.days[d]?.sex).includes('unprotected'))hits.push(d);}
  if(!hits.length)return;
  const screen=document.querySelector('.ux-v5-home'); if(!screen||screen.querySelector('[data-ux7-ec]'))return;
  const box=document.createElement('div');box.className='ux7-ec';box.dataset.ux7Ec='1';box.innerHTML=`<strong>Unprotected sex logged recently</strong><p>If pregnancy is unwanted, emergency contraception can be time-sensitive. Contact a pharmacist or clinician promptly; options may be used up to 5 days after unprotected sex depending on the method.</p>`;
  const prevention=screen.querySelector('[data-ux7-prevention]'); prevention?.insertAdjacentElement('afterend',box);
}

function enhance(){
  try{enhanceCycleSafety();recentUnprotectedAlert();enhanceTrackFertility();enhanceCalendar();enhanceAnalysis();}catch(err){console.warn('Orbit reliability UX skipped:',err);}
}
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}).observe(document.body,{childList:true,subtree:true});
setTimeout(enhance,100);
