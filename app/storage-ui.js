import { storageStatus, undoLastEntry, restorePrevious, STORE_KEY, get } from './state.js';
import { download, exportJSON } from './connect.js';

export function initStorageUI() {
  const banner = document.createElement('aside'); banner.className='storage-status';
  banner.setAttribute('aria-live','polite'); document.body.appendChild(banner);
  function show() {
    const state=storageStatus(); banner.replaceChildren();
    const message=document.createElement('span');
    message.textContent=state.error ? 'Not saved: '+state.error : 'Saved on this device';
    banner.classList.toggle('has-error',!!state.error);banner.append(message);
    if(!state.error && state.canUndo){const undo=document.createElement('button');undo.textContent='Undo last entry';undo.onclick=()=>{undoLastEntry();window.__orbit?.render();};banner.appendChild(undo);}
    if(state.error){
      const backup=document.createElement('button');backup.textContent='Export recovery copy';
      backup.onclick=()=>download('orbit-recovery.json',state.blocked ? (localStorage.getItem(STORE_KEY)||'{}') : exportJSON(get()));
      const restore=document.createElement('button');restore.textContent='Restore previous copy';
      restore.onclick=()=>{if(!window.confirm('Replace current data with the previous saved copy? Export a recovery copy first.'))return;try{restorePrevious();location.reload();}catch(e){message.textContent=e.message;}};
      banner.append(backup,restore);
    }
  }
  window.addEventListener('orbit:storage',show);
  // The persistent banner explains write failures; suppress duplicate unhandled UI errors.
  window.addEventListener('error',e=>{if(storageStatus().error){show();e.preventDefault();}});
  show();
}
