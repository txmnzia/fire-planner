// ── MY SITUATION TAB (redesign) ──────────────────────────────────────────────
// Progressive-enhancement layer over the plain inputs in #tab-panel-situation.
// The source of truth for every value stays the id-bearing form control that
// inputs.js / sync.js already read — this module only adds friendlier controls
// (year-picker popover, sliders, the subject rail) and the dynamic windfall list.
import { el } from "../util.js?v=8.33";
import { setPayListPainter, NEW_PLAN_OFF } from "./plans.js?v=8.33";
import { normalisePayChanges } from "../payChanges.js?v=8.33";
import { state } from "../state.js?v=8.33";
import { recalc } from "../recalc.js?v=8.33";
import { ASSUMPTION_DEFAULTS, assumptionChanges } from "../assumptions.js?v=8.33";
import { renderRentMoves, renderResidence, initRentToday, renderResNotes } from "./housing.js?v=8.33";
import { renderPensionsMore } from "./pensions.js?v=8.33";

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
export function buildYpick(pick, { min, max, getVal, setVal, optional, emptyLabel }) {
  const emptyTxt = emptyLabel || 'Same as you';
  pick.innerHTML =
    '<button class="ypick-btn" type="button" aria-haspopup="dialog"><span class="yv"></span>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>' +
    '<div class="ypick-pop" role="dialog"><div class="ypick-nav">' +
      '<button type="button" data-nav="-1" aria-label="Earlier years">‹</button><span class="yrange"></span>' +
      '<button type="button" data-nav="1" aria-label="Later years">›</button></div>' +
      '<div class="ypick-grid"></div>' +
      (optional ? '<button type="button" class="ypick-clear"></button>' : '') +
    '</div>';
  const btn = pick.querySelector('.ypick-btn'), pop = pick.querySelector('.ypick-pop'),
        grid = pick.querySelector('.ypick-grid'), yv = pick.querySelector('.yv'),
        rangeLbl = pick.querySelector('.yrange');
  let page = 0;
  const paint = () => {
    const v = getVal();
    yv.textContent = v == null ? (optional ? emptyTxt : '—') : v;
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
  if (clr) clr.textContent = emptyTxt;
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

// ── PAY CHANGES (v8.6; compact item rows v8.18) ────────────────────────────
// One item per change: its name on top, then "from [year] until [year] · € /mo".
// Typing updates the plan and the numbers without redrawing (focus stays);
// pickers and add/remove redraw. Which scenarios use it: the Scenarios tab.
const DEL = label => '<button type="button" class="dp-del" aria-label="' + label + '">×</button>';
const MONEY = (cls, ph, suf) => '<div class="inp cur fc ' + cls + '"><span class="pre">€</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="' + ph + '">' + (suf ? '<span class="suf">' + suf + '</span>' : '') + '</div>';
const SEP = w => '<span class="frow-sep">' + w + '</span>';
export function renderPayList() {
  const host = el('payList'); if (!host) return;
  host.innerHTML = '';
  const upd = (i, key, val) => { state.payChanges[i] = normalisePayChanges([{ ...state.payChanges[i], [key]: val }])[0]; recalc(); };
  state.payChanges.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'item pay-row'; row.dataset.i = i;
    row.innerHTML =
      '<div class="item-hd"><input type="text" class="item-name pay-name" placeholder="Name it, e.g. 4-day week" aria-label="Name of this pay change" autocomplete="off">' + DEL('Remove pay change') + '</div>' +
      '<div class="item-c">' + SEP('from') + '<div class="ypick fc pay-from"></div>' + SEP('until') + '<div class="ypick fc pay-to"></div>' +
      '</div><div class="item-c">' + MONEY('pay-gross', 'gross', '/yr') + SEP('take-home') + MONEY('pay-amt', 'take-home', '/mo') + '</div>';
    const name = row.querySelector('.pay-name'); name.value = p.name || '';
    name.addEventListener('input', () => upd(i, 'name', name.value));
    buildYpick(row.querySelector('.pay-from'), { min: 2024, max: 2080,
      getVal: () => state.payChanges[i].from, setVal: y => { upd(i, 'from', y); renderPayList(); } });
    buildYpick(row.querySelector('.pay-to'), { min: 2024, max: 2080, optional: true, emptyLabel: 'For good',
      getVal: () => state.payChanges[i].to, setVal: y => { upd(i, 'to', y); renderPayList(); } });
    // v8.27: type the gross; the take-home is estimated (shown grey) unless you type it
    const gross = row.querySelector('.pay-gross input'); gross.setAttribute('aria-label', 'Gross pay per year');
    gross.title = 'Gross salary per year (today\u2019s money). The take-home is estimated where you live then (Germany, France) and used unless you type your own.';
    gross.value = p.gross == null ? '' : fmtMoney(p.gross);
    gross.addEventListener('input', () => { const raw = cleanMoney(gross.value); gross.value = raw === '' ? '' : fmtMoney(raw); upd(i, 'gross', raw); });
    const amt = row.querySelector('.pay-amt input'); amt.setAttribute('aria-label', 'Take-home per month');
    amt.value = p.amt == null ? '' : fmtMoney(p.amt);
    amt.addEventListener('input', () => { const raw = cleanMoney(amt.value); amt.value = raw === '' ? '' : fmtMoney(raw); upd(i, 'amt', raw); });
    row.querySelector('.dp-del').addEventListener('click', () => { state.payChanges.splice(i, 1); renderPayList(); recalc(); });
    host.appendChild(row);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'dp-add';
  add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add pay change';
  add.addEventListener('click', () => {
    state.payChanges.push({ name: '', from: YNOW + 1, to: null, amt: null, on: [] });
    renderPayList(); recalc();
  });
  host.appendChild(add);
}
setPayListPainter(renderPayList);

// ── WINDFALLS (v8.18: named; the name is the label in the Scenarios grid) ───
export function renderWindfalls() {
  const host = el('wfList'); if (!host) return;
  host.innerHTML = '';
  state.windfalls.forEach((w, i) => {
    const row = document.createElement('div'); row.className = 'item wf-row';
    row.innerHTML =
      '<div class="item-hd"><input type="text" class="item-name wf-name" placeholder="Name it, e.g. Inheritance" aria-label="Name of this windfall" autocomplete="off" maxlength="40">' + DEL('Remove windfall') + '</div>' +
      '<div class="item-c">' + SEP('in') + '<div class="ypick fc"></div>' + MONEY('wf-amt', 'After tax', '') + '</div>';
    host.appendChild(row);
    const name = row.querySelector('.wf-name'); name.value = w.name || '';
    name.addEventListener('input', () => { w.name = name.value; recalc(); });
    buildYpick(row.querySelector('.ypick'), {
      min: 2024, max: 2080,
      getVal: () => (w.yr == null ? null : +w.yr),
      setVal: y => { w.yr = y; recalc(); },
    });
    const amt = row.querySelector('.wf-amt input'); amt.setAttribute('aria-label', 'Amount after tax'); amt.title = 'What lands in your account after any inheritance or gift tax, in euros of that year. It is added to your portfolio as already-taxed money (no gain on it).';
    amt.value = w.amt == null ? '' : fmtMoney(w.amt);
    amt.addEventListener('input', e => {
      const raw = cleanMoney(e.target.value); e.target.value = fmtMoney(raw);
      const v = parseFloat(raw); w.amt = isNaN(v) ? null : v; recalc();
    });
    row.querySelector('.dp-del').addEventListener('click', () => { state.windfalls.splice(i, 1); renderWindfalls(); recalc(); });
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'dp-add';
  add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add windfall';
  add.addEventListener('click', () => {
    const ny = state.windfalls.length ? Math.max(...state.windfalls.map(w => +w.yr || YNOW)) + 1 : 2030;
    state.windfalls.push({ name: '', yr: ny, amt: null, off: NEW_PLAN_OFF() }); renderWindfalls();
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
    if (!e.isIntersecting) return;
    let active = null;
    links.forEach(a => { const on = a.dataset.t === e.target.id; a.classList.toggle('on', on); if (on) active = a; });
    // On the mobile single-line slider, keep the active chip scrolled into view.
    if (active && rail.scrollWidth > rail.clientWidth + 4) {
      rail.scrollTo({ left: Math.max(0, active.offsetLeft - 16), behavior: 'smooth' });
    }
  }), { root: null, rootMargin: '-22% 0px -72% 0px', threshold: 0 }); // viewport band works whether sit-content or the panel is the scroller
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
// ── ASSUMPTIONS (v8.9): defaults shown, one tap resets them ────────────────
export function renderAssumptions() {
  const host = el('assumpReadout'); if (!host) return;
  const vals = {}; for (const k in ASSUMPTION_DEFAULTS) vals[k] = el(k) ? el(k).value : undefined;
  const ch = assumptionChanges(vals);
  host.textContent = ch.length ? 'Your own: ' + ch.join(', ') : 'All at their defaults: stocks 7%, bonds 3%, inflation 2%, bonds 0% today \u2192 40% at retirement';
}
export function resetAssumptions() {
  for (const [k, v] of Object.entries(ASSUMPTION_DEFAULTS)) { const e = el(k); if (e) e.value = v; }
  refreshSituationControls();
  recalc();
}

export function refreshSituationControls() {
  document.querySelectorAll('input[type="range"][data-for]').forEach(range => {
    const num = el(range.dataset.for); if (num) { if (num.value !== '') range.value = num.value; paintSlider(range, num); }
  });
  document.querySelectorAll('.ypick[data-target]').forEach(p => { if (p._paint) p._paint(); });
  document.querySelectorAll('.cur-in[data-target]').forEach(d => { if (d._paintCur) d._paintCur(); });
  renderWindfalls();
  renderPayList();   // pay changes (v8.6) after a load or a sync pull
  renderRentMoves(); renderResidence();   // v8.11
  renderPensionsMore();                   // v8.19
}

export function initSituation() {
  bindGlobalClosers();
  initSliders();
  initYearFields();
  initCurrency();
  renderWindfalls();
  renderPayList();
  renderRentMoves(); renderResidence(); initRentToday();
  renderPensionsMore();
  window.addEventListener('fire:refresh-controls', refreshSituationControls);
  initRail();
}
