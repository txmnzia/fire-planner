// What an empty field uses (v8.28.1, transparency rule): every field whose empty
// value falls back to a preset or another field shows that value as its grey
// placeholder, never a word like "preset" or "estimate". When the value depends
// on where you live, the countries in your plan are shown in order ("259 → 0").
import { el } from "../util.js?v=8.28.1";
import { COUNTRY_TAX } from "../taxTable.js?v=8.28.1";
import { buyCostPreset } from "../countries.js?v=8.28.1";
import { residenceAt, CHILD_BENEFIT } from "../engine.js?v=8.28.1";
import { healthPresetMonthly } from "../health.js?v=8.28.1";
import { fmtMoney } from "./situation.js?v=8.28.1";

const num = v => String(+(+v).toFixed(2));
const money = v => fmtMoney(Math.round(v));
// The value per country of the plan (today, then each move), consecutive repeats once.
export function seriesText(residence, valueOf, fmt) {
  const out = [];
  for (const p of residence || []) { const t = fmt(valueOf(p.country)); if (out[out.length - 1] !== t) out.push(t); }
  return out.join(' → ');
}
const ph = (id, text) => { const e = el(id); if (e && e.placeholder !== text) e.placeholder = text; };

export function renderDefaults(gl) {
  const res = gl.residence || [];
  ph('taxNow', num(COUNTRY_TAX[(res[0] || {}).country] ?? 30));
  ph('healthAfterStop_disp', seriesText(res, c => healthPresetMonthly(c, gl.healthGainMonthly), money));
  ph('childBenefit_disp', seriesText(res, c => CHILD_BENEFIT[c] || 0, money));
  ph('propTxCostPct', num(buyCostPreset((residenceAt(gl, gl.propBuyYear) || {}).country)));
  ph('propFixedYears', String(gl.propMortgageTerm));
  ph('propRateAfter', num((gl.propMortgageRate || 0) * 100));
  ph('propCharges_disp', '0');
  ph('grossNow_disp', '0');
}
