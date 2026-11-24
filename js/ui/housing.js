// Housing moves and where you live (v8.11). Two dynamic lists on My Situation:
// planned rents (state.rentMoves) and planned moves abroad (state.residence),
// plus the rent-today edit that keeps the joint transfers consistent.
import { el, eur } from "../util.js?v=8.18.2";
import { state } from "../state.js?v=8.18.2";
import { recalc } from "../recalc.js?v=8.18.2";
import { buildYpick, fmtMoney, cleanMoney } from "./situation.js?v=8.18.2";
import { COUNTRY_TAX } from "../taxTable.js?v=8.18.2";
import { countryNote } from "../countries.js?v=8.18.2";
import { mortgageSchedule } from "../engine.js?v=8.18.2";

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
      '<button type="button" class="dp-del" aria-label="Remove move">×</button></div>';
    const inp = row.querySelector('.cur input'); inp.value = m.rent == null ? '' : fmtMoney(m.rent);
    host.appendChild(row);
    buildYpick(row.querySelector('.ypick'), { min: 2024, max: 2080, getVal: () => m.from, setVal: y => { m.from = y; recalc(); } });
    inp.addEventListener('input', () => { const raw = cleanMoney(inp.value); inp.value = fmtMoney(raw); const v = parseFloat(raw); m.rent = isNaN(v) ? null : v; recalc(); });
    row.querySelector('.dp-del').addEventListener('click', () => { state.rentMoves.splice(i, 1); renderRentMoves(); recalc(); });
  });
  host.appendChild(addButton('Add a move (new rent)', () => {
    state.rentMoves.push({ from: YNOW + 1, rent: null }); renderRentMoves();
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
    state.residence.push({ from: YNOW + 1, country: 'FR', tax: null, col: null }); renderResidence(); recalc();
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

// Buying read-out (v8.13): the loan, its payments before and after the fixed
// period, and the buying costs used (your default or the country's).
export function renderPropReadout(gl) {
  const host = el('propReadout'); if (!host) return;
  if (!(gl.propPrice > 0)) { host.innerHTML = ''; return; }
  const s = mortgageSchedule(gl);
  const lines = ['<div>Loan <b>' + eur(s.principal) + '</b>: <b>' + eur(s.pay1 / 12) + '/month</b>' +
    (s.pay2 !== s.pay1 ? ' for ' + s.fixedYears + ' years, then <b>' + eur(s.pay2 / 12) + '/month</b> at ' + (gl.propRateAfter * 100).toFixed(1) + '%' : ' for ' + gl.propMortgageTerm + ' years') + '</div>',
    '<div>Buying costs ' + (gl.propTxCostPct * 100).toFixed(1) + '% <span class="tgt">' + (el('propTxCostPct')?.value === '' ? '(default of the country you live in that year)' : '(your value)') + '</span></div>'];
  if (gl.propCharges > 0) lines.push('<div>Ownership charges + upkeep ' + eur(gl.propCharges) + '/month, for good <span class="tgt">(shared like the joint costs with her)</span></div>');
  host.innerHTML = lines.join('');
}
