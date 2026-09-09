// pill-v11.js — dedicated oral contraceptive tracking for Orbit.
// Stores pill configuration in settings.pill and daily adherence/side-effect data in days[ISO].
// It intentionally does not decide whether a late/missed pill is contraceptively safe: instructions
// vary by pill formulation. Users are directed to their own leaflet/pharmacist/clinician.

import { get, update } from './state.js';
import { today, addDays, diffDays, fmtDate } from './cycle.js';
import { esc, toast, trapFocus } from './ui.js';

import { packInfo as computePack, doseTiming, adherence as computeAdherence, pillSchedule } from './pill-model.js';

const SIDE_EFFECTS = [
  ['nausea','Nausea','🤢'],['headache','Headache','🤕'],['breast-tenderness','Breast tenderness','🫶'],
  ['spotting','Spotting / breakthrough bleeding','🩸'],['mood','Mood changes','💭'],['libido','Libido changes','❤️'],
  ['acne','Acne / skin changes','✨'],['bloating','Bloating','🫄'],['cramps','Cramps','⚡'],['fatigue','Fatigue','🔋']
];
const STATUS = [
  ['taken','Taken','✓'],['late','Taken late','⌛'],['missed','Missed','!'],['vomited','Vomited after taking','↺']
];
const PILL_TYPES = [
  ['combined','Combined pill'],['pop-desogestrel','Progestogen-only — desogestrel'],
  ['pop-traditional','Progestogen-only — traditional'],['pop-drospirenone','Progestogen-only — drospirenone'],
  ['other','Other / not sure']
];

function arr(v){ return Array.isArray(v)?v:(v?[v]:[]); }
function pill(s=get()){ return s.settings?.pill || null; }
function enabled(){ return !!pill()?.enabled; }
function go(route,params={}){ window.__orbit?.go(route,params); }
function selectedTrackDate(){ return document.querySelector('[data-ux-tracking-date]')?.dataset.uxTrackingDate || document.querySelector('.date-pill[aria-pressed="true"]')?.dataset.d || today(); }

function ensurePillSettings(st){
  st.settings.pill = { enabled:false, name:'', type:'other', scheduledTime:'21:00', activePills:21, placeboPills:7, packStart:today(), startedOn:today(), ...(st.settings.pill||{}) };
  return st.settings.pill;
}

function packInfo(date=today(), s=get()) { return computePack(date,s); }
function timeCopy(date,day,p) {
  const timing = doseTiming(date,day,day.pillSchedule || p);
  if (!timing) return '';
  if (timing.legacy) return `Logged time ${timing.label} · actual date not recorded`;
  return `Taken ${timing.actual.toLocaleString()} · ${Math.abs(timing.minutes)} min ${timing.minutes >= 0 ? 'after' : 'before'} scheduled dose`;
}

function setStatus(date,status, takenAt=null){
  update(st=>{
    const d=st.days[date]||(st.days[date]={});
    if (!status) { delete d.pillStatus; delete d.pillTakenAt; delete d.pillSchedule; delete d.pillScheduledAt; return; }
    d.pillStatus=status;
    d.pillSchedule = { ...(pillSchedule(date,st) || st.settings.pill) };
    delete d.pillSchedule.history;
    d.pillScheduledAt = new Date(date+'T'+d.pillSchedule.scheduledTime+':00').toISOString();
    if(status==='taken'||status==='late'||status==='vomited') d.pillTakenAt=takenAt || d.pillTakenAt || (date === today() ? new Date().toISOString() : null);
    else delete d.pillTakenAt;
  });
  window.__orbit?.render();
  toast(!status ? 'Pill entry cleared' : status==='taken'?'Pill marked taken':status==='late'?'Late pill logged':status==='missed'?'Missed pill logged':'Vomiting after pill logged');
}

function safetyForStatus(status){
  if(status==='missed'||status==='late'||status==='vomited') return 'Your contraceptive instructions depend on the exact pill and timing. Check the leaflet for your pill or contact a pharmacist/clinician. Use backup contraception if your instructions recommend it.';
  return '';
}

function pillCard(date=today(), compact=false){
  const s=get(),p=pill(s); if(!p?.enabled)return null;
  const d=s.days[date]||{}, info=packInfo(date,s), isToday=date===today();
  const el=document.createElement('section'); el.className=`pill11-card ${compact?'compact':''}`; el.dataset.pill11Card=date;
  const kind=info?.kind==='placebo'?'Placebo / break':info?.kind==='active'?'Active pill':'Pack';
  const status=d.pillStatus || 'not-logged';
  el.innerHTML=`
    <div class="pill11-head"><div><span class="ux-kicker">Birth control pill</span><h2>${esc(p.name||'Pill')}</h2></div><button type="button" class="pill11-settings" data-pill-settings aria-label="Pill settings">•••</button></div>
    <div class="pill11-pack"><div><span>${kind}</span><strong>${info?.day?`Day ${info.day} of ${info.total}`:'Set pack start'}</strong></div><div><span>Usual time</span><strong>${esc(p.scheduledTime||'—')}</strong></div></div>
    <div class="pill11-current is-${status}">
      <div><span>${isToday?'Today':fmtDate(date,{weekday:'short',day:'numeric',month:'short'})}</span><strong>${status==='taken'?'Taken ✓':status==='late'?'Taken late':status==='missed'?'Missed':status==='vomited'?'Vomited after pill':'Not logged yet'}</strong><small>${esc(timeCopy(date,d,p))}</small></div>
      ${isToday&&status==='not-logged'&&info?.kind!=='placebo'?'<button type="button" data-pill-take>Mark as taken</button>':''}
    </div>
    ${safetyForStatus(status)?`<div class="pill11-warning">${esc(safetyForStatus(status))}</div>`:''}
    ${!compact?`<div class="pill11-actions">${STATUS.map(([id,label,sym])=>`<button type="button" data-pill-status="${id}" aria-pressed="${status===id}"><b>${sym}</b><span>${label}</span></button>`).join('')}</div>`:''}`;
  if (!compact) {
    const field = document.createElement('label');
    field.className = 'pill11-timestamp';
    field.innerHTML = '<span>Actual date and time taken (optional)</span><input class="input" type="datetime-local" data-pill-actual><small>For past doses, leave blank if you do not know the time.</small><button type="button" data-pill-clear>Clear pill entry</button>';
    const input = field.querySelector('input');
    if (d.pillTakenAt && !/^\d{2}:\d{2}$/.test(d.pillTakenAt)) {
      const at = new Date(d.pillTakenAt); input.value = new Date(at.getTime()-at.getTimezoneOffset()*60000).toISOString().slice(0,16);
    }
    input.addEventListener('change', () => {
      if (!d.pillStatus || d.pillStatus === 'missed') { toast('Choose a taken status first'); return; }
      const value = input.value ? new Date(input.value).toISOString() : null;
      update(st => { if (value) st.days[date].pillTakenAt = value; else delete st.days[date].pillTakenAt; });
      window.__orbit?.render();
    });
    field.querySelector('[data-pill-clear]').onclick = () => setStatus(date,null);
    el.appendChild(field);
  }
  el.querySelector('[data-pill-take]')?.addEventListener('click',()=>{setStatus(date,'taken');refresh();});
  el.querySelectorAll('[data-pill-status]').forEach(b=>b.addEventListener('click',()=>{setStatus(date,b.dataset.pillStatus);refresh();}));
  el.querySelector('[data-pill-settings]')?.addEventListener('click',openSetup);
  return el;
}

function openSetup(){
  const s=get(),p=pill(s)||{};
  const overlay=document.createElement('div'); overlay.className='pill11-modal';
  overlay.innerHTML=`<div class="pill11-sheet" role="dialog" aria-modal="true" aria-label="Birth control pill setup">
    <div class="pill11-sheet-head"><div><span class="ux-kicker">Pill setup</span><h2>Birth control pill</h2></div><button data-close aria-label="Close">×</button></div>
    <p class="pill11-intro">Orbit can track adherence, pack progress and side effects. It will not guess whether a late or missed pill is safe because rules differ by formulation.</p>
    <label><span>Pill name / brand</span><input class="input" data-name value="${esc(p.name||'')}" placeholder="e.g. your pill name"></label>
    <label><span>Pill type</span><select class="input" data-type>${PILL_TYPES.map(([id,label])=>`<option value="${id}" ${p.type===id?'selected':''}>${label}</option>`).join('')}</select></label>
    <div class="pill11-fields"><label><span>Usual time</span><input class="input" type="time" data-time value="${esc(p.scheduledTime||'21:00')}"></label><label><span>Current pack started</span><input class="input" type="date" data-start value="${esc(p.packStart||today())}" max="${today()}"></label></div>
    <div class="pill11-fields"><label><span>Active pills</span><input class="input" type="number" min="1" max="365" data-active value="${Number(p.activePills)||21}"></label><label><span>Placebo / break days</span><input class="input" type="number" min="0" max="14" data-placebo value="${Number(p.placeboPills ?? 7)}"></label></div>
    <label class="pill11-toggle"><input type="checkbox" data-enabled ${p.enabled?'checked':''}><span><strong>Enable Pill mode</strong><small>Prioritise pill adherence over calendar fertility estimates.</small></span></label>
    <button class="btn" data-save>Save pill setup</button>
    ${p.enabled?'<button class="btn ghost" data-disable>Turn off Pill mode</button>':''}
  </div>`;
  document.body.appendChild(overlay);
  const releaseFocus = trapFocus(overlay.querySelector('[role=dialog]'), () => close());
  const close=()=>{releaseFocus();overlay.remove();}; overlay.addEventListener('click',e=>{if(e.target===overlay)close();}); overlay.querySelector('[data-close]').onclick=close;
  overlay.querySelector('[data-save]').onclick=()=>{
    const fields = [...overlay.querySelectorAll('input')];
    if (fields.some(x => !x.reportValidity())) return;
    update(st=>{const q=ensurePillSettings(st); const previous = {...q}; delete previous.history;
      if (!q.history) q.history = q.enabled ? [{...previous,effectiveFrom:q.packStart}] : [];
q.enabled=overlay.querySelector('[data-enabled]').checked;q.name=overlay.querySelector('[data-name]').value.trim();q.type=overlay.querySelector('[data-type]').value;q.scheduledTime=overlay.querySelector('[data-time]').value||'21:00';q.packStart=overlay.querySelector('[data-start]').value||today();q.activePills=Math.max(1,Number(overlay.querySelector('[data-active]').value)||21);q.placeboPills=Math.max(0,Number(overlay.querySelector('[data-placebo]').value)||0);if(!q.startedOn)q.startedOn=today(); const snapshot={...q};delete snapshot.history;q.history.push({...snapshot,effectiveFrom:q.history.length ? today() : q.packStart}); st.settings.reminders.pill.time=q.scheduledTime;});
    close();toast('Pill tracking updated');window.__orbit?.render?.();setTimeout(refresh,80);
  };
  overlay.querySelector('[data-disable]')?.addEventListener('click',()=>{update(st=>ensurePillSettings(st).enabled=false);close();toast('Pill mode turned off');window.__orbit?.render?.();});
}

function setupCTA(){
  const el=document.createElement('button');el.type='button';el.className='pill11-setup-cta';el.dataset.pill11Setup='1';
  el.innerHTML='<span>💊</span><span><strong>Track your birth control pill</strong><small>Pack, timing, missed pills and side effects</small></span><b>›</b>';
  el.onclick=openSetup;return el;
}

function enhanceHome(){
  if(document.getElementById('app')?.dataset.view !== 'cycle') return;
  let home=document.querySelector('.ux-v5-home');
  if(!home && enabled()){home=document.createElement('section');home.className='ux-v5-home';document.querySelector('#app .screen')?.prepend(home);}
  if(!home)return;
  const s=get(),p=pill(s);
  document.body.classList.toggle('orbit-pill-active',!!p?.enabled);
  if(p?.enabled){
    if(!home.querySelector('[data-pill11-card]')){
      const card=pillCard(today(),true);const prevention=home.querySelector('[data-ux7-prevention]');
      if(prevention)prevention.insertAdjacentElement('beforebegin',card); else home.prepend(card);
    }
    const prevention=home.querySelector('[data-ux7-prevention]');
    if(prevention && !prevention.classList.contains('pill11-cycle-suppressed')){prevention.classList.add('pill11-cycle-suppressed');prevention.innerHTML='<div class="pill11-hormonal-note"><span>💊</span><div><strong>Pill mode is active</strong><p>Orbit is not using calendar fertile-window estimates to judge contraceptive protection. Pill adherence and your pill’s own instructions take priority.</p></div></div>';}
  } else if(!home.querySelector('[data-pill11-setup]')){
    const feel=home.querySelector('.ux-v5-feel');if(feel)feel.insertAdjacentElement('beforebegin',setupCTA());
  }
}

function sideEffectsEditor(date){
  const s=get(),d=s.days[date]||{},chosen=arr(d.pillSideEffects);
  const el=document.createElement('section');el.className='pill11-side';el.dataset.pill11Side='1';
  el.innerHTML=`<div class="pill11-section-head"><div><span class="ux-kicker">Pill side effects</span><h2>How are you feeling?</h2></div><small>${chosen.length?`${chosen.length} logged`:'optional'}</small></div><div class="pill11-side-grid">${SIDE_EFFECTS.map(([id,label,emoji])=>`<button type="button" data-pill-side="${id}" aria-pressed="${chosen.includes(id)}"><span>${emoji}</span><b>${label}</b></button>`).join('')}</div>`;
  el.querySelectorAll('[data-pill-side]').forEach(b=>b.addEventListener('click',()=>{
    update(st=>{const day=st.days[date]||(st.days[date]={});let a=arr(day.pillSideEffects);a=a.includes(b.dataset.pillSide)?a.filter(x=>x!==b.dataset.pillSide):[...a,b.dataset.pillSide];if(a.length)day.pillSideEffects=a;else delete day.pillSideEffects;});b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');
  }));return el;
}

function enhanceTrack(){
  if(!enabled())return;const screen=document.querySelector('[data-ux-tracking-date]');if(!screen)return;const date=selectedTrackDate();
  if(!screen.querySelector(`[data-pill11-card="${date}"]`)){const intro=screen.querySelector('.ux-v5-track-intro');const card=pillCard(date,false);(intro||screen.firstElementChild)?.insertAdjacentElement('afterend',card);}
  if(!screen.querySelector('[data-pill11-side]')){const fert=screen.querySelector('[data-ux7-fertility-log]');const side=sideEffectsEditor(date);if(fert)fert.insertAdjacentElement('beforebegin',side);else screen.appendChild(side);}
}

function adherence(days=28,s=get()){ return computeAdherence(s,days); }

function analysisPanel(){
  const a=adherence(),p=pill();const el=document.createElement('section');el.className='pill11-analysis';el.dataset.pill11Analysis='1';
  el.innerHTML=`<div class="pill11-analysis-head"><div><span class="ux-kicker">Birth control pill</span><h2>Adherence & side effects</h2></div><button data-pill-settings>Settings</button></div>
    <div class="pill11-metrics"><div><strong>${a.pct == null ? '—' : a.pct+'%'}</strong><span>recorded taken / due doses</span></div><div><strong>${a.missed}</strong><span>missed</span></div><div><strong>${a.late}</strong><span>late</span></div><div><strong>${a.streak}</strong><span>current streak</span></div></div>
    <p>${a.unknown} due doses not logged · ${a.missed} explicitly missed. Missing logs are not assumed to be missed pills.</p><div class="pill11-insight"><span>Pack</span><strong>${esc(p.name||'Pill')} · ${p.activePills}+${p.placeboPills}</strong><small>Usual time ${esc(p.scheduledTime||'—')}</small></div>
    <div class="pill11-insight"><span>Most logged side effects</span>${a.common.length?a.common.map(([id,n])=>{const x=SIDE_EFFECTS.find(y=>y[0]===id);return `<div class="pill11-side-row"><b>${x?.[2]||'•'} ${esc(x?.[1]||id)}</b><strong>${n} day${n===1?'':'s'}</strong></div>`;}).join(''):'<p>No pill side effects logged in this window.</p>'}</div>
    <p class="pill11-analysis-note">Adherence statistics describe what you logged. They do not determine contraceptive protection after a late/missed pill; use the instructions for your exact pill.</p>`;
  el.querySelector('[data-pill-settings]').onclick=openSetup;return el;
}
function enhanceAnalysis(){
  if(!enabled())return;const screen=[...document.querySelectorAll('.screen')].find(x=>x.querySelector('.stat-row')||x.querySelector('[data-ux7-analysis]'));if(!screen||screen.querySelector('[data-pill11-analysis]'))return;
  const panel=analysisPanel();const ux=screen.querySelector('[data-ux7-analysis]');if(ux)ux.insertAdjacentElement('beforebegin',panel);else screen.prepend(panel);
}

function enhanceMore(){
  const top=[...document.querySelectorAll('.topbar h1')].find(x=>x.textContent.trim()==='More');const screen=top?.closest('.topbar')?.nextElementSibling;if(!screen||screen.querySelector('[data-pill11-more]'))return;
  const b=document.createElement('button');b.className='pill11-more';b.dataset.pill11More='1';b.innerHTML=`<span>💊</span><span><strong>Birth control pill</strong><small>${enabled()?`${esc(pill().name||'Pill')} · ${esc(pill().scheduledTime||'')}`:'Set up pill tracking'}</small></span><b>›</b>`;b.onclick=openSetup;screen.prepend(b);
}

function refresh(){
  try{enhanceHome();enhanceTrack();enhanceAnalysis();enhanceMore();}catch(err){console.warn('Orbit pill UX skipped:',err);}
}
export { refresh as enhance };
window.__orbitPill={openSetup,packInfo,adherence};
