// Where you live (v8.11, pure): country presets for tax on gains and the
// residence periods the engine reads (gl.residence). Rates are flat-rate
// approximations on the GAIN part of a sale (README "Tax"); not tax advice.
import { COUNTRY_TAX } from "./taxTable.js?v=8.32";

// One line per country on where its rate comes from and what is left out.
export const COUNTRY_NOTES = {
  AL: "15% on capital gains (2023 income tax law), worldwide income. Low confidence.",
  AD: "Gains on shares and funds are exempt for holdings of 25% or less. Passive residence requires about €600k invested.",
  AR: "15% schedular tax on foreign securities gains. Personal-assets wealth tax not modelled.",
  AU: "Temporary residents: 0% on foreign assets; permanent residents: 50% discount then marginal rates, ≈5% at this level. Retiree visas are closed to new applicants.",
  AT: "27.5% flat. Reporting funds only; their deemed yearly distributions are not modelled. Self-declared with a foreign broker.",
  BE: "New capital-gains tax from 2026: 10% on gains after 31 Dec 2025, about €10k a year exempt (≈6.7% average at €30k of gain). Stock-exchange tax on sales not modelled.",
  BR: "15% flat on realised offshore investment gains (Law 14.754/2023).",
  BG: "Exempt when sold on an EU/EEA regulated market (e.g. Xetra); otherwise 10% on 90% of the gain (9%).",
  KH: "20% capital gains tax being phased in from 2026; enforcement on foreign assets unclear. Low confidence.",
  CA: "Half of the gain taxed at marginal rates, ≈10–13% at this level; cost basis stepped up on arrival. No retiree visa.",
  CL: "Foreign income exempt the first 3 years (extendable), then progressive income tax: about 5–10% at this level. Low confidence.",
  CO: "15% occasional-gain tax on assets held over 2 years (otherwise up to 39%). Wealth tax not modelled.",
  CR: "Territorial system: foreign gains are not taxed. Rentista or pensionado residence.",
  HR: "Gains on financial assets held over 2 years are exempt; 12% on shorter holdings.",
  CY: "Gains on securities are exempt; non-domiciled residents pay no defence contribution for 17 years.",
  CZ: "Exempt after 3 years of holding (time test); 15% on shorter holdings.",
  DK: "Average at ≈€30k of gain: 27% share-income rate, then 42%. Positive-list ETFs are taxed every year on unrealised gains, which a tax-on-sale rate only approximates.",
  DO: "Foreign investment income taxed from the 3rd year of residence; gains at 27%. Low confidence.",
  EC: "Worldwide income at progressive 0–37%; ≈15% at this level. Low confidence.",
  EE: "22% income tax on gains; the €8,400 basic allowance lowers the average to ≈16% at €30k of gain.",
  FI: "30% on capital income up to €30k, 34% above.",
  FR: "Flat tax 31.4% from 2026: 12.8% income tax + 18.6% social charges. Not modelled: a PEA after 5 years, the health levy for low earned income (CSM).",
  GE: "Individuals' foreign-source income is exempt (in effect territorial). Easy residence.",
  DE: "26.375% (25% + 5.5% solidarity surcharge) on 70% of the gain: equity ETFs are 30% tax-free = 18.5%. The yearly fund tax (Vorabpauschale) is modelled separately; church tax is not.",
  GR: "Gains on EU/EEA UCITS fund units are exempt (the 15% rate applies to shares).",
  HU: "15% income tax; no 13% social tax when sold through an EEA-licensed broker (controlled capital-market transaction).",
  IS: "22% capital income tax. EEA residence.",
  ID: "Foreign gains taxed at progressive 5–35%, ≈20% at this level. Retiree visa from 55. Low confidence.",
  IE: "Exit tax on funds 38% in 2026 (35% from 2027), and a deemed sale every 8 years (not modelled). No loss offset.",
  IT: "26% on ETF gains (capital income: losses cannot offset them). 0.2% foreign-asset tax (IVAFE) not modelled.",
  JP: "Separate 20.315% tax on securities gains. No retiree visa.",
  LV: "Capital income tax 25.5% since 2025.",
  LT: "2026 reform: 15% only on holdings over 5 years, otherwise taxed with other income (20% at this level). Medium-low confidence.",
  LU: "Gains on securities held over 6 months (stake under 10%) are exempt.",
  MY: "Foreign income brought in by individuals is exempt until 2036. MM2H residence.",
  MT: "Resident non-domiciled: foreign capital gains are not taxed, even if brought to Malta. Check the €5k minimum tax for non-doms.",
  MU: "No capital gains tax. Retiree permit from 50; earlier via an investor or premium permit.",
  MX: "Gains through a foreign broker taxed at progressive rates up to 35%, ≈20% at this level (10% only on the Mexican exchange).",
  MC: "No personal income tax (except for French nationals). Residence needs housing and a bank deposit.",
  ME: "15% capital gains tax, worldwide income. Low confidence.",
  MA: "Worldwide income; 20% on gains on foreign securities. Low confidence.",
  NL: "Box 3: 36% on a 6% deemed return, ≈2.16% of assets above €59,357 every year whether you sell or not. A rate on gains only approximates it.",
  NZ: "4-year exemption for new residents, then the foreign-fund regime: 5% deemed return × marginal rate, ≈1.6% of value a year (≈30% of the return). Low confidence.",
  MK: "10% flat on capital gains (a rise to 15% announced, postponed). Low confidence.",
  PA: "Territorial system: foreign gains are not taxed. Friendly Nations or pensionado visa.",
  PY: "Territorial system: foreign gains are not taxed.",
  PE: "Foreign capital income at progressive 8–30%, ≈15% at this level. Low confidence.",
  PH: "Resident foreigners are taxed only on Philippine income. SRRV retiree visa.",
  PL: "19% flat ('Belka' tax).",
  PT: "28% flat on gains. The NHR regime is closed and IFICI does not cover retirees.",
  RO: "16% on gains through a non-Romanian broker from 2026, plus a capped 10% health contribution (CASS).",
  RS: "15% capital gains tax, worldwide income.",
  SG: "No capital gains tax. No residence route for retirees.",
  SK: "Gains on listed securities held over 1 year are exempt (ETF units not confirmed). Medium-low confidence.",
  SI: "25% under 5 years of holding, 20% at 5–10, 15% at 10–15, 0% after 15 years.",
  ZA: "40% of the gain taxed at marginal rates after a R50k exclusion: ≈10–14% at this level.",
  KR: "22% on overseas share gains above KRW 2.5m; residents under 5 years are taxed only on foreign income brought in. Hard to obtain residence.",
  ES: "Savings scale 19% to €6k, 21% to €50k, then 23–30%. Not modelled: wealth and solidarity taxes.",
  LK: "Individual capital gains tax 15% from June 2026; foreign assets likely in scope. Low confidence.",
  SE: "30% in a normal account, plus ≈0.12% a year on fund value. An ISK account (≈1% of value a year) is not modelled.",
  CH: "Private capital gains are exempt. Not modelled: wealth tax, income tax on the funds' reinvested dividends.",
  TW: "Foreign income falls only under the minimum tax (threshold ≈NT$7.5m): 0% at this level. Hard to obtain residence.",
  TH: "Since 2024 foreign income is taxed when brought into Thailand: 0–35%, ≈12% on average at this level. An LTR visa may give 0%. Low confidence.",
  TN: "10% on securities gains, worldwide income. Low confidence.",
  TR: "20-year exemption on foreign income and gains for people resident from 2026 (no Turkish residence in the 3 prior years); otherwise 15–40%.",
  AE: "No personal income tax. Retirement visa from 55; under 55 via a property-investor visa.",
  GB: "4-year exemption for new arrivals (FIG regime), then capital gains tax 18% (24% for higher-rate taxpayers); ETFs need reporting-fund status. No retirement visa for EU citizens since Brexit.",
  US: "Foreign ETFs fall under the punitive PFIC rules (up to 37% + interest charge, + 3.8% investment-income tax): buy US-domiciled funds instead. No retiree visa.",
  UY: "Foreign gains taxed at 12% since 2024, but new residents get an 11-year holiday.",
  VN: "Worldwide income; rules for foreign securities gains unclear. No retiree visa. Low confidence.",
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
