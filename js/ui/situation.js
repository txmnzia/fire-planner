// ── MY SITUATION TAB (redesign) ──────────────────────────────────────────────
// Progressive-enhancement layer over the plain inputs in #tab-panel-situation.
// The source of truth for every value stays the id-bearing form control that
// inputs.js / sync.js already read — this module only adds friendlier controls
// (year-picker popover, sliders, the subject rail) and the dynamic windfall list.
import { el } from "../util.js";
import { state } from "../state.js";
import { recalc } from "../recalc.js";

const YNOW = 2026;

// ── MONEY FORMATTING ─────────────────────────────────────────────────────────
// Thousands separators are a DISPLAY concern only. Currency fields keep the real
// numeric value on a hidden id-bearing input (the persistence key inputs.js /
// sync.js read); the visible input is text and never feeds parseFloat directly.
export function fmtMoney(v) {
  let s = String(v);
  if (s === '' || s === '-') return s;
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const dot = s.indexOf('.');
  const int = dot < 0 ? s : s.slice(0, dot);
  const dec = dot < 0 ? '' : '.' + s.slice(dot + 1);
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + dec;
}
export function cleanMoney(v) {
  const s = String(v).replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); // keep only the first dot
}
// Form-field currency inputs: a text display (.cur-in) mirrored to a hidden input.
function initCurrency() {
  document.querySelectorAll('.cur-in[data-target]').forEach(disp => {
    if (disp._wiredCur) return; disp._wiredCur = true;
    const hidden = el(disp.dataset.target);
    disp._paintCur = () => { disp.value = hidden.value === '' ? '' : fmtMoney(hidden.value); };
    disp._paintCur();
    disp.addEventListener('input', () => {
      const raw = cleanMoney(disp.value);
      hidden.value = raw;            // clean numeric string is the source of truth
      disp.value = fmtMoney(raw);
      recalc();
    });
  });
}

// ── YEAR PICKER ──────────────────────────────────────────────────────────────
// buildYpick enhances a `.ypick` element into a decade-grid popover. Value flows
// through getVal/setVal so the same component drives hidden form inputs AND the
// state-backed datapoint rows. Returns { paint } to re-sync the button label.
export function buildYpick(pick, { min, max, getVal, setVal, optional }) {
  pick.innerHTML =
    '<button class="ypick-btn" type="button" aria-haspopup="dialog"><span class="yv"></span>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>' +
    '<div class="ypick-pop" role="dialog"><div class="ypick-nav">' +
      '<button type="button" data-nav="-1" aria-label="Earlier years">‹</button><span class="yrange"></span>' +
      '<button type="button" data-nav="1" aria-label="Later years">›</button></div>' +
      '<div class="ypick-grid"></div>' +
      (optional ? '<button type="button" class="ypick-clear">Same as you</button>' : '') +
    '</div>';
  const btn = pick.querySelector('.ypick-btn'), pop = pick.querySelector('.ypick-pop'),
        grid = pick.querySelector('.ypick-grid'), yv = pick.querySelector('.yv'),
        rangeLbl = pick.querySelector('.yrange');
  let page = 0;
  const paint = () => {
    const v = getVal();
    yv.textContent = v == null ? (optional ? 'Same as you' : '—') : v;
    pick.classList.toggle('empty', v == null);
  };
  const render = () => {
    rangeLbl.textContent = Math.max(min, page) + ' – ' + Math.min(max, page + 11);
    grid.innerHTML = '';
    const cur = getVal();
    for (let y = page; y < page + 12; y++) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = y;
      if (y < min || y > max) { b.disabled = true; }
      else if (y === cur) b.className = 'sel'; else if (y === YNOW) b.className = 'now';
      b.addEventListener('click', () => { setVal(y); paint(); close(); });
      grid.appendChild(b);
    }
  };
  const open = () => {
    document.querySelectorAll('.ypick.open').forEach(o => o.classList.remove('open'));
    const v = getVal(); page = Math.floor((v == null ? YNOW : v) / 12) * 12;
    render(); pick.classList.add('open');
  };
  const close = () => pick.classList.remove('open');
  btn.addEventListener('click', e => { e.stopPropagation(); pick.classList.contains('open') ? close() : open(); });
  pop.addEventListener('click', e => e.stopPropagation());
  pick.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { page += (+b.dataset.nav) * 12; render(); }));
  const clr = pick.querySelector('.ypick-clear');
  if (clr) clr.addEventListener('click', () => { setVal(null); paint(); close(); });
  paint();
  pick._paint = paint;
  return { paint };
}

// Form-field year pickers write to a hidden input (its id is the persistence key).
function initYearFields() {
  document.querySelectorAll('.ypick[data-target]').forEach(pick => {
    if (pick._paint) return; // already enhanced
    const hidden = el(pick.dataset.target);
    const optional = pick.hasAttribute('data-optional');
    buildYpick(pick, {
      min: +pick.dataset.min, max: +pick.dataset.max, optional,
      getVal: () => { const v = hidden.value.trim(); return v === '' ? null : parseInt(v); },
      setVal: y => { hidden.value = y == null ? '' : y; recalc(); },
    });
  });
}

// ── SLIDERS ──────────────────────────────────────────────────────────────────
// Each slider field pairs a range input (data-for=<id>) with the real numeric
// input (the typeable exact value + persistence key). Drag OR type; both stay
// in sync and trigger recalc. Fill/thumb colour comes from the card accent.
function paintSlider(range, num) {
  const min = parseFloat(num.min), max = parseFloat(num.max), v = parseFloat(num.value);
  if (isNaN(v) || max === min) return;
  range.style.setProperty('--pct', ((Math.min(max, Math.max(min, v)) - min) / (max - min) * 100).toFixed(2) + '%');
}
function initSliders() {
  document.querySelectorAll('input[type="range"][data-for]').forEach(range => {
    if (range._wired) return; range._wired = true;
    const num = el(range.dataset.for);
    range.min = num.min; range.max = num.max; range.step = num.step || '1'; range.value = num.value;
    paintSlider(range, num);
    range.addEventListener('input', () => { num.value = range.value; paintSlider(range, num); recalc(); });
    // typing/paste/steppers already recalc via the number input's inline handler
    num.addEventListener('input', () => { if (num.value !== '') range.value = num.value; paintSlider(range, num); });
    const ctrl = range.closest('.sl-ctrl');
    if (ctrl) ctrl.querySelectorAll('[data-d]').forEach(btn => btn.addEventListener('click', () => {
      const step = parseFloat(num.step) || 1, min = parseFloat(num.min), max = parseFloat(num.max);
      let v = (parseFloat(num.value) || 0) + (+btn.dataset.d) * step;
      v = Math.min(max, Math.max(min, Math.round(v / step) * step));
      num.value = parseFloat(v.toFixed(6)); range.value = num.value; paintSlider(range, num); recalc();
    }));
  });
}

// ── WINDFALLS (dynamic datapoint list, shares the compact row with nw-history) ─
export function renderWindfalls() {
  const host = el('wfList'); if (!host) return;
  host.innerHTML = '';
  state.windfalls.forEach((w, i) => {
    const row = document.createElement('div'); row.className = 'dp-row';
    row.innerHTML =
      '<div class="dp-main"><div class="ypick mini"></div>' +
      '<div class="inp cur mini"><span class="pre">€</span>' +
      '<input type="text" inputmode="decimal" autocomplete="off" placeholder="Amount" value="' + (w.amt == null ? '' : fmtMoney(w.amt)) + '"></div>' +
      '<button type="button" class="dp-del" aria-label="Remove windfall">×</button></div>';
    host.appendChild(row);
    buildYpick(row.querySelector('.ypick'), {
      min: 2024, max: 2080,
      getVal: () => (w.yr == null ? null : +w.yr),
      setVal: y => { w.yr = y; recalc(); },
    });
    row.querySelector('.cur input').addEventListener('input', e => {
      const raw = cleanMoney(e.target.value); e.target.value = fmtMoney(raw);
      const v = parseFloat(raw); w.amt = isNaN(v) ? null : v; recalc();
    });
    row.querySelector('.dp-del').addEventListener('click', () => { state.windfalls.splice(i, 1); renderWindfalls(); recalc(); });
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'dp-add';
  add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add windfall';
  add.addEventListener('click', () => {
    const ny = state.windfalls.length ? Math.max(...state.windfalls.map(w => +w.yr || YNOW)) + 1 : 2030;
    state.windfalls.push({ yr: ny, amt: null }); renderWindfalls();
  });
  host.appendChild(add);
}

// ── SUBJECT RAIL (scroll-spy + jump) ─────────────────────────────────────────
function initRail() {
  const rail = el('sitRail'), content = el('sitContent'); if (!rail || !content) return;
  const links = [...rail.querySelectorAll('.rail-a')];
  links.forEach(a => a.addEventListener('click', () => {
    const t = el(a.dataset.t); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.dataset.t === e.target.id));
  }), { root: content, rootMargin: '-8% 0px -80% 0px', threshold: 0 });
  content.querySelectorAll('.subj').forEach(s => io.observe(s));
  if (links[0]) links[0].classList.add('on');
}

// Close any open year-picker popover on outside click / Escape.
let globalClosersBound = false;
function bindGlobalClosers() {
  if (globalClosersBound) return; globalClosersBound = true;
  document.addEventListener('click', () => document.querySelectorAll('.ypick.open').forEach(o => o.classList.remove('open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.ypick.open').forEach(o => o.classList.remove('open')); });
}

// Re-sync enhanced controls after applyState() rewrites the underlying inputs.
export function refreshSituationControls() {
  document.querySelectorAll('input[type="range"][data-for]').forEach(range => {
    const num = el(range.dataset.for); if (num) { if (num.value !== '') range.value = num.value; paintSlider(range, num); }
  });
  document.querySelectorAll('.ypick[data-target]').forEach(p => { if (p._paint) p._paint(); });
  document.querySelectorAll('.cur-in[data-target]').forEach(d => { if (d._paintCur) d._paintCur(); });
  renderWindfalls();
}

export function initSituation() {
  bindGlobalClosers();
  initSliders();
  initYearFields();
  initCurrency();
  renderWindfalls();
  initRail();
}
