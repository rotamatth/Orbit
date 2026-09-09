// ui.js — small helpers shared by every screen.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------------------------- toast ---------------------------- */

let toastTimer;
export function toast(msg) {
  clearTimeout(toastTimer);
  let node = $('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = msg;
  toastTimer = setTimeout(() => node.remove(), 2400);
}

// Shared keyboard behavior for sheets and pill setup.
export function trapFocus(node, close) {
  const previous = document.activeElement;
  const focusable = () => [...node.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x => !x.disabled && !x.closest('[hidden]'));
  const keydown = e => {
    if(e.key === 'Escape') { e.preventDefault(); close(); }
    if(e.key !== 'Tab') return;
    const items=focusable(), first=items[0], last=items.at(-1);
    if(!first){e.preventDefault();return;}
    if(e.shiftKey && (document.activeElement===first || !node.contains(document.activeElement))){e.preventDefault();last.focus();}
    else if(!e.shiftKey && (document.activeElement===last || !node.contains(document.activeElement))){e.preventDefault();first.focus();}
  };
  node.setAttribute('tabindex','-1');
  (focusable()[0] || node).focus();
  document.addEventListener('keydown',keydown);
  return () => {document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
}

/* ---------------------------- bottom sheet ---------------------------- */

let sheetCleanup = null;

export function closeSheet() {
  $('.scrim')?.remove();
  $('.sheet')?.remove();
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  document.body.style.overflow = '';
}

/**
 * openSheet({ title, body, onMount, actions })
 * body is an HTML string; onMount receives the sheet element.
 */
export function openSheet({ title, body, onMount, onClose }) {
  closeSheet();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', closeSheet);

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `
    <div class="grabber"></div>
    <div class="sheet-head">
      <h3>${esc(title)}</h3>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="sheet-body">${body}</div>`;

  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);

  document.body.append(scrim, sheet);
  document.body.style.overflow = 'hidden';
  const release = trapFocus(sheet, closeSheet);
  sheetCleanup = () => { release(); onClose?.(); };
  onMount?.(sheet);


  return sheet;
}

export function confirmSheet(title, message, confirmLabel, onYes) {
  openSheet({
    title,
    body: `
      <p style="color:var(--muted);line-height:1.6;margin:8px 0 20px">${esc(message)}</p>
      <button class="btn warn" data-yes>${esc(confirmLabel)}</button>
      <button class="btn ghost" data-no>Keep it</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-yes]').addEventListener('click', () => { closeSheet(); onYes(); });
      sheet.querySelector('[data-no]').addEventListener('click', closeSheet);
    },
  });
}

/* ---------------------------- cycle ring ---------------------------- */

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const PHASE_VAR = {
  menstrual: 'var(--menstrual)',
  follicular: 'var(--follicular)',
  fertile: 'var(--fertile)',
  ovulation: 'var(--ovulation)',
  luteal: 'var(--luteal)',
  pms: 'var(--pms)',
};

/**
 * days: [{ phase, predicted, isToday }] — one entry per day of the cycle.
 */
export function ringSVG(days) {
  const CX = 150;
  const CY = 150;
  const R = 128;
  const n = Math.max(days.length, 1);
  const step = 360 / n;
  const gap = Math.min(step * 0.18, 2.4);

  let out = `<svg viewBox="0 0 300 300" role="img" aria-label="Cycle ring, day ${days.findIndex((d) => d.isToday) + 1} of ${n}">`;
  out += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--ink-2)" stroke-width="15"/>`;

  days.forEach((d, i) => {
    const a0 = i * step + gap / 2;
    const a1 = (i + 1) * step - gap / 2;
    const col = PHASE_VAR[d.phase] || 'var(--ink-3)';
    const dim = d.predicted ? 0.42 : 1;
    out += `<path d="${arcPath(CX, CY, R, a0, a1)}" fill="none" stroke="${col}" stroke-opacity="${dim}" stroke-width="15" stroke-linecap="butt"/>`;
  });

  const ti = days.findIndex((d) => d.isToday);
  if (ti >= 0) {
    const mid = ti * step + step / 2;
    const [mx, my] = polar(CX, CY, R, mid);
    out += `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="11" fill="var(--ink)"/>`;
    out += `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="6.5" fill="var(--bone)"/>`;
  }

  out += '</svg>';
  return out;
}

/* ---------------------------- misc ---------------------------- */

export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export async function shareOrCopy(text, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title: title || 'My cycle', text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyText(text);
  return ok ? 'copied' : 'failed';
}
