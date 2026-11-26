// Housing moves and where you live (v8.11). Two dynamic lists on My Situation:
// planned rents (state.rentMoves) and planned moves abroad (state.residence),
// plus the rent-today edit that keeps the joint transfers consistent.
import { el, eur } from "../util.js?v=8.27";
import { state, features } from "../state.js?v=8.27";
import { recalc } from "../recalc.js?v=8.27";
import { buildYpick, fmtMoney, cleanMoney } from "./situation.js?v=8.27";
import { NEW_PLAN_OFF } from "./plans.js?v=8.27";
import { COUNTRY_TAX } from "../taxTable.js?v=8.27";
import { countryNote, rentMoveNoEffect } from "../countries.js?v=8.27";
import { mortgageSchedule, purchaseCostFor, mortgageBalanceAt, mortgagePaymentAt, homeEquityAt, priceAtBuy } from "../engine.js?v=8.27";
import { undoOwner } from "./versions.js?v=8.27";

const YNOW = new Date().getFullYear();
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
function addButton(text, onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'dp-add';
  b.innerHTML = PLUS + text; b.addEventListener('click', onClick); return b;
}

// ── Planned rents: from a year, a new rent (incl. charges) ──────────────────
export function renderRentMoves() {
  const host = el('rentMovesList'); if (!host) return;
  host.innerHTML = '';
  state.rentMoves.forEach((m, i) => {
    const row = document.createElement('div'); row.className = 'item move-row';
    row.innerHTML = '<div class="item-c"><span class="frow-sep">from</span><div class="ypick fc"></div>' +
      '<div class="inp cur fc"><span class="pre">€</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="New rent" aria-label="New rent per month"><span class="suf">/mo</span></div>' +
      '<button type="button" class="dp-del" aria-label="Remove move">×</button></div><div class="item-note info" hidden></div><div class="item-note warn" hidden></div>';
    row.dataset.i = i;
    const inp = row.querySelector('.cur input'); inp.value = m.rent == null ? '' : fmtMoney(m.rent);
    host.appendChild(row);
    buildYpick(row.querySelector('.ypick'), { min: 2024, max: 2080, getVal: () => m.from, setVal: y => { m.from = y; recalc(); } });
    inp.addEventListener('input', () => { const raw = cleanMoney(inp.value); inp.value = fmtMoney(raw); const v = parseFloat(raw); m.rent = isNaN(v) ? null : v; recalc(); });
    row.querySelector('.dp-del').addEventListener('click', () => { state.rentMoves.splice(i, 1); renderRentMoves(); recalc(); });
  });
  host.appendChild(addButton('Add a move (new rent)', () => {
    state.rentMoves.push({ from: YNOW + 1, rent: null, off: NEW_PLAN_OFF() }); renderRentMoves();
  }));
}

// Rent today changed (on blur): the joint transfers move by the same amount,
// split like today's transfers, so the joint account keeps covering the rest.
// Only for a change of an existing rent, never for a first entry.
export function rentShift(prevRent, newRent, youPayIn, shePaysIn) {
  if (!(prevRent > 0) || !(newRent >= 0) || prevRent === newRent) return null;
  const joint = (youPayIn || 0) + (shePaysIn || 0), d = newRent - prevRent;
  const her = joint > 0 ? (shePaysIn || 0) / joint : 0;
  return { you: Math.round((youPayIn || 0) + d * (1 - her)), she: Math.round((shePaysIn || 0) + d * her), delta: d };
}
function setMoney(id, v) {
  const h = el(id), d = el(id + '_disp'); if (!h) return;
  h.value = String(v); if (d && d._paintCur) d._paintCur();
}
export function initRentToday() {
  const d = el('propRentSaved_disp'); if (!d) return;
  let atFocus = null;
  d.addEventListener('focus', () => { atFocus = parseFloat(el('propRentSaved').value); });
  d.addEventListener('change', () => {
    const now = parseFloat(el('propRentSaved').value);
    const s = rentShift(atFocus, now, parseFloat(el('samPaysIn').value) || 0, parseFloat(el('partnerPaysIn').value) || 0);
    atFocus = now;
    if (!s) return;
    setMoney('samPaysIn', s.you); setMoney('partnerPaysIn', s.she);
    const note = el('rentNote');
    if (note) note.textContent = 'Joint transfers moved by ' + (s.delta >= 0 ? '+' : '−') + eur(Math.abs(s.delta)) + ' with the rent (split like today). Correct them under Spending if you split it differently.';
    recalc();
  });
}

// ── Where you live: today's country, then each planned move ─────────────────
function countrySelect(value) {
  const src = el('retCountry'), sel = document.createElement('select');
  sel.innerHTML = src ? src.innerHTML : '';
  sel.value = value; sel.setAttribute('aria-label', 'Country');
  return sel;
}
export function renderResidence() {
  const host = el('resList'); if (!host) return;
  host.innerHTML = '';
  state.residence.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'item res-item';
    row.innerHTML =
      '<div class="item-hd"><span class="frow-sep">from</span><div class="ypick fc"></div><div class="res-c fc"></div>' +
      '<button type="button" class="dp-del" aria-label="Remove move">×</button></div>' +
      '<div class="item-c"><span class="frow-sep">tax on gains</span><span class="unit-wrap fc fc-num"><input type="number" step="0.5" min="0" max="60" class="res-tax" aria-label="Tax on gains"><span class="u">%</span></span>' +
      '<span class="frow-sep">cost of living</span><span class="unit-wrap fc fc-num"><input type="number" step="5" min="30" max="300" class="res-col" placeholder="100" aria-label="Cost of living"><span class="u">%</span></span></div>';
    const sel = countrySelect(p.country); row.querySelector('.res-c').appendChild(sel);
    const tax = row.querySelector('.res-tax'), col = row.querySelector('.res-col');
    tax.placeholder = String(COUNTRY_TAX[p.country] ?? 30); tax.value = p.tax == null ? '' : p.tax;
    col.value = p.col == null ? '' : p.col;
    host.appendChild(row);
    buildYpick(row.querySelector('.ypick'), { min: 2024, max: 2080, getVal: () => p.from, setVal: y => { p.from = y; recalc(); renderResNotes(); } });
    sel.addEventListener('change', () => { p.country = sel.value; tax.placeholder = String(COUNTRY_TAX[p.country] ?? 30); recalc(); renderResNotes(); });
    tax.addEventListener('input', () => { p.tax = tax.value === '' ? null : +tax.value; recalc(); renderResNotes(); });
    col.addEventListener('input', () => { p.col = col.value === '' ? null : +col.value; recalc(); });
    row.querySelector('.dp-del').addEventListener('click', () => { state.residence.splice(i, 1); renderResidence(); recalc(); });
  });
  host.appendChild(addButton('Add a move abroad', () => {
    state.residence.push({ from: YNOW + 1, country: 'FR', tax: null, col: null, off: NEW_PLAN_OFF() }); renderResidence(); recalc();
  }));
  renderResNotes();
}
// "Where the rates come from", one line per country in the list; overrides marked.
export function renderResNotes() {
  const host = el('resNotes'); if (!host) return;
  const today = el('retCountry')?.value || 'FR', taxNow = el('taxNow')?.value;
  const rows = [{ code: today, tax: taxNow === '' || taxNow == null ? null : +taxNow, when: 'today' },
    ...state.residence.map(p => ({ code: p.country, tax: p.tax, when: 'from ' + p.from }))];
  const seen = new Set();
  host.innerHTML = '<div class="res-hd">Where the rates come from</div>' + rows.map(r => {
    const preset = COUNTRY_TAX[r.code] ?? 30;
    const own = r.tax != null && r.tax !== preset ? ' <b>Your override: ' + r.tax + '%; preset ' + preset + '%.</b>' : '';
    const k = r.code + own; if (seen.has(k)) return ''; seen.add(k);
    return '<div><b>' + r.code + '</b> (' + r.when + '): ' + countryNote(r.code) + own + '</div>';
  }).join('') + '<div class="tgt">Cost of living scales all spending except housing (rent and mortgage); 100% = as today.</div>';
}

// ── Your home (v8.22) ───────────────────────────────────────────────────────
// Once the purchase is confirmed, the Buying a home tile moves to the "Now" lane
// as "Your home" (Housing, the rent tile, is hidden: no rent any more). The rows
// that only matter before buying (her share of the cash, rent that stops) hide.
export function ownerFigures(gl) {
  const y = gl.baseYear, s = mortgageSchedule(gl), fixedEnd = gl.propBuyYear + s.fixedYears;
  return { loanLeft: Math.round(mortgageBalanceAt(gl, y)), payNow: mortgagePaymentAt(gl, y) / 12,
           fixedEnd, payAfter: s.pay2 / 12, changes: s.pay2 !== s.pay1 && fixedEnd > y,
           loanEnd: gl.propBuyYear + gl.propMortgageTerm, equity: Math.round(homeEquityAt(gl, { hasProp: true }, y)),
           charges: gl.propCharges || 0 };
}
function ownerReadout(gl) {
  const f = ownerFigures(gl);
  return '<div>Loan left: <b>' + eur(f.loanLeft) + '</b>' + (f.payNow > 0 ? ' \u00b7 <b>' + eur(f.payNow) + '/month</b> until ' + (f.changes ? f.fixedEnd + ', then ' + eur(f.payAfter) + '/month' : 'paid off in ' + f.loanEnd) : ' \u00b7 paid off') + '</div>' +
    '<div>Your home equity today: <b>' + eur(f.equity) + '</b> <span class="tgt">(price grown with inflation since ' + gl.propBuyYear + ', minus the loan; counted in net worth, not in the FIRE number)</span></div>' +
    '<div class="tgt">The plan adds the loan payment' + (f.charges > 0 ? ' and charges (' + eur(f.charges) + '/month)' : '') + ' to the joint costs, split with her: keep them out of the joint transfers under Spending.</div>' +
    '<div><button type="button" class="dp-add" data-unown="1">Not bought after all: back to a plan</button></div>';
}
let ownerWired = false;
function applyOwnerLayout(gl) {
  const buy = el('tile-buy'), housing = el('tile-housing'); if (!buy || !housing) return;
  const now = housing.parentElement, plans = el('lanePlans');
  if (gl.homeOwned && buy.parentElement !== now) housing.after(buy);
  if (!gl.homeOwned && plans && buy.parentElement !== plans) { const first = plans.querySelector('.tile'); plans.insertBefore(buy, first); }
  housing.hidden = !!gl.homeOwned;
  const b = buy.querySelector('.tile-tt b'); if (b && b.firstChild) b.firstChild.nodeValue = gl.homeOwned ? 'Your home ' : 'Buying a home ';
  ['propHerShare', 'planRentStops'].forEach(id => { const r = el(id)?.closest('.frow'); if (r) r.hidden = !!gl.homeOwned; });
  if (!ownerWired) { ownerWired = true; el('propReadout')?.addEventListener('click', e => { if (e.target.closest('[data-unown]')) undoOwner(); }); }
}

// Joint account per month after a move (today's €): joint today − rent today + new rent.
export function jointAfterMove(gl, newRent) {
  if (newRent == null || !(gl.sharedNow > 0)) return null;
  return Math.round(gl.sharedNow - (gl.propRentSaved || 0) + newRent);
}
// v8.18.4: say when a flat move changes nothing because you own by then.
const LTR = ['A', 'B', 'C', 'D', 'E'];
export function renderRentMoveNotes(gl) {
  document.querySelectorAll('#rentMovesList .move-row').forEach(row => {
    const m = state.rentMoves[+row.dataset.i], note = row.querySelector('.item-note.warn'), info = row.querySelector('.item-note.info'); if (!m || !note) return;
    // v8.21: the joint account after the move = today's joint total with the rent swapped
    const joint = jointAfterMove(gl, m.rent);
    if (info) { info.hidden = joint == null; info.textContent = joint == null ? '' : 'Joint account after the move: ' + eur(joint) + '/month (today ' + eur(gl.sharedNow || 0) + ', rent ' + eur(gl.propRentSaved || 0) + ' \u2192 ' + eur(m.rent) + ')'; }
    const none = rentMoveNoEffect(m, gl, features);
    note.hidden = !none.length;
    note.textContent = none.length ? '⚠ No effect in ' + none.map(s => LTR[s - 1]).join(', ') + ': you buy in ' + gl.propBuyYear +
      ', so from then there is no rent to change. Move it before ' + gl.propBuyYear + ', or switch buying off there.' : '';
  });
}

// Buying read-out (v8.13): the loan, its payments before and after the fixed
// period, and the buying costs used (your default or the country's).
export function renderPropReadout(gl) {
  renderRentMoveNotes(gl);
  applyOwnerLayout(gl);
  const host = el('propReadout'); if (!host) return;
  if (gl.homeOwned) { host.innerHTML = ownerReadout(gl); return; }
  if (!(gl.propPrice > 0)) { host.innerHTML = ''; return; }
  const s = mortgageSchedule(gl);
  const lines = ['<div>Loan <b>' + eur(s.principal) + '</b>: <b>' + eur(s.pay1 / 12) + '/month</b>' +
    (s.pay2 !== s.pay1 ? ' for ' + s.fixedYears + ' years, then <b>' + eur(s.pay2 / 12) + '/month</b> at ' + (gl.propRateAfter * 100).toFixed(1) + '%' : ' for ' + gl.propMortgageTerm + ' years') + '</div>',
    '<div>Buying costs ' + (gl.propTxCostPct * 100).toFixed(1) + '% <span class="tgt">' + (el('propTxCostPct')?.value === '' ? '(default of the country you live in that year)' : '(your value)') + '</span></div>'];
  // v8.21: your cash at purchase, from the engine's own purchase cost (with the partner: minus her share)
  const cash = purchaseCostFor(gl, { hasPartner: true });
  // v8.25: the price is typed in today's money and paid inflated to the purchase year
  if (gl.propBuyYear > gl.baseYear) lines.unshift('<div>Price in ' + gl.propBuyYear + ': <b>' + eur(priceAtBuy(gl)) + '</b> <span class="tgt">(' + eur(gl.propPrice) + ' in today\u2019s money, grown with inflation)</span></div>');
  lines.push('<div>Your cash needed in ' + gl.propBuyYear + ': <b>' + eur(cash) + '</b> <span class="tgt">(' + (gl.propDownPct * 100).toFixed(0) + '% down payment + ' + (gl.propTxCostPct * 100).toFixed(1) +
    '% buying costs' + (gl.propHerShare > 0 ? ', minus her ' + Math.round(gl.propHerShare * 100) + '%; ' + eur(purchaseCostFor(gl, { hasPartner: false })) + ' if you buy alone' : '') + ')</span></div>');
  if (gl.propCharges > 0) lines.push('<div>Ownership charges + upkeep ' + eur(gl.propCharges) + '/month, for good <span class="tgt">(shared like the joint costs with her)</span></div>');
  host.innerHTML = lines.join('');
}
