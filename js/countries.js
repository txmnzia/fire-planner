// Where you live (v8.11, pure): country presets for tax on gains and the
// residence periods the engine reads (gl.residence). Rates are flat-rate
// approximations on the GAIN part of a sale (README "Tax"); not tax advice.
import { COUNTRY_TAX } from "./taxTable.js?v=8.22";

// One line per country on where its rate comes from and what is left out.
export const COUNTRY_NOTES = {
  DE: "26.4% (25% + 5.5% solidarity surcharge) on 70% of the gain: equity ETFs are 30% tax-free (Teilfreistellung) = 18.5%. Not modelled: the yearly advance tax on accumulating funds (Vorabpauschale), the €1,000 allowance, church tax.",
  FR: "30% flat tax (12.8% income tax + 17.2% social charges). Not modelled: a PEA after 5 years (17.2% only), the extra health levy for people with little earned income (CSM).",
};
export const countryNote = code => COUNTRY_NOTES[code] || ((COUNTRY_TAX[code] ?? 30) + "% flat rate on gains (approximation).");

// Buying costs in % of the price, by country (v8.13): transfer tax, notary, land
// registry and agent. Germany about 10% (Grunderwerbsteuer 3.5–6.5% + notary ~2% + agent ~3.6%),
// France about 8% (notary fees and taxes ~7.5% on older homes). Elsewhere 8%.
export const BUY_COSTS = { DE: 10, FR: 8 };
export const buyCostPreset = code => BUY_COSTS[code] ?? 8;

// v8.17: scenarios (1-5) a planned move is switched off for; absent = on everywhere
const offList = off => Array.isArray(off) ? off.map(Number).filter(n => n >= 1 && n <= 5) : [];
// The plan lists one scenario uses (only the moves switched on for it).
// v8.18.4: a flat move that starts in or after the purchase year changes nothing in
// a scenario that buys: from the purchase you own, so there is no rent to replace
// (the rent that year is exactly what buying saves). Returns those scenario ids.
export function rentMoveNoEffect(m, gl, features) {
  if (!m || m.from == null || m.rent == null || !(gl.propPrice > 0) || !(m.from >= gl.propBuyYear)) return [];
  return [1, 2, 3, 4, 5].filter(s => !(m.off || []).includes(s) && features && features[s] && features[s].prop);
}
export function plansForScenario(gl, s) {
  const on = m => !(m.off || []).includes(s);
  return { rentMoves: (gl.rentMoves || []).filter(on), residence: (gl.residence || []).filter((p, i) => i === 0 || on(p)) };
}

// Moves saved on the payload: [{from, country, tax (% or null), col (% or null)}].
export function normaliseResidence(list) {
  return (Array.isArray(list) ? list : [])
    .map(p => ({ from: p.from == null || p.from === '' ? null : parseInt(p.from),
                 country: typeof p.country === 'string' && p.country in COUNTRY_TAX ? p.country : 'FR',
                 tax: p.tax == null || p.tax === '' || isNaN(+p.tax) ? null : +p.tax,
                 col: p.col == null || p.col === '' || isNaN(+p.col) ? null : +p.col,
                 off: offList(p.off) }))
    .filter(p => p.from != null && !isNaN(p.from))
    .sort((a, b) => a.from - b.from);
}

// gl.residence: today's country (from = null) then each move from its year.
// tax: your override else the preset (decimal); col: your % else 100% (= today).
export function buildResidence(todayCode, todayTaxPct, moves) {
  const rate = (code, pct) => (pct != null ? pct : (COUNTRY_TAX[code] ?? 30)) / 100;
  return [{ from: null, country: todayCode, tax: rate(todayCode, todayTaxPct), col: 1 },
    ...normaliseResidence(moves).map(m => ({ from: m.from, country: m.country, tax: rate(m.country, m.tax), col: m.col != null ? m.col / 100 : 1, off: m.off }))];
}

// Planned rents: [{from, rent}] with a year and an amount, sorted.
export function normaliseRentMoves(list) {
  return (Array.isArray(list) ? list : [])
    .map(m => ({ from: m.from == null || m.from === '' ? null : parseInt(m.from), rent: m.rent == null || m.rent === '' ? null : +m.rent, off: offList(m.off) }))
    .filter(m => m.from != null && !isNaN(m.from))
    .sort((a, b) => a.from - b.from);
}
