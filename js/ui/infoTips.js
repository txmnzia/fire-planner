// Info bubbles for every ⓘ button (.info-btn). The text lives in the button's
// title attribute in index.html; a native title tooltip never shows on a phone
// (no hover), so the bubble opens on tap or click, and on mouse hover. One bubble
// at a time; tap elsewhere or Escape closes it. Pure placement maths is exported
// for the tests; everything that touches the DOM runs only from initInfoTips().

const MARGIN = 8, GAP = 6;

// Where to put a bubble of size tip {w,h} for a button rect {left,top,right,bottom}
// in a viewport {w,h}: below the button when it fits, else above; horizontally
// centred on the button, then clamped so it never leaves the viewport.
export function placeTip(btn, tip, view) {
  const w = Math.min(tip.w, view.w - 2 * MARGIN);
  let left = (btn.left + btn.right) / 2 - w / 2;
  left = Math.max(MARGIN, Math.min(left, view.w - MARGIN - w));
  const below = btn.bottom + GAP, above = btn.top - GAP - tip.h;
  const top = (below + tip.h <= view.h - MARGIN || above < MARGIN) ? below : above;
  return { left: Math.round(left), top: Math.round(top), width: Math.round(w) };
}

let pop = null, owner = null;

function close() {
  if (!pop) return;
  pop.hidden = true;
  if (owner) owner.setAttribute('aria-expanded', 'false');
  owner = null;
}

function open(btn) {
  if (owner === btn) { close(); return; }
  close();
  const text = btn.dataset.tip || '';
  if (!text) return;
  pop.textContent = text;
  pop.hidden = false;
  pop.style.width = '';
  const r = btn.getBoundingClientRect();
  const pos = placeTip(r, { w: Math.min(300, pop.offsetWidth || 300), h: pop.offsetHeight },
                       { w: window.innerWidth, h: window.innerHeight });
  pop.style.left = pos.left + 'px'; pop.style.top = pos.top + 'px'; pop.style.width = pos.width + 'px';
  owner = btn;
  btn.setAttribute('aria-expanded', 'true');
}

// Moves each button's title into data-tip (so the browser's own tooltip doesn't
// double up), gives it an accessible name, and wires one delegated listener.
export function initInfoTips() {
  pop = document.createElement('div');
  pop.className = 'info-pop'; pop.id = 'infoPop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
  document.body.appendChild(pop);
  document.querySelectorAll('.info-btn').forEach(b => {
    const t = b.getAttribute('title');
    if (t) { b.dataset.tip = t; b.removeAttribute('title'); }
    if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', 'More info');
    b.setAttribute('aria-describedby', 'infoPop');
    b.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.info-btn');
    if (b) { e.preventDefault(); e.stopPropagation(); open(b); }
    else if (!pop.contains(e.target)) close();
  }, true);
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest && e.target.closest('.info-btn');
    if (b && owner !== b) open(b);
  });
  document.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest && e.target.closest('.info-btn');
    if (b && owner === b && !b.contains(e.relatedTarget)) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('scroll', close, { passive: true, capture: true });
  window.addEventListener('resize', close, { passive: true });
}
