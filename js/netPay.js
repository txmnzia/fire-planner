// Take-home from gross pay (v8.27, pure). Used for two things only: the estimated
// take-home next to a planned pay change typed gross (shown, editable), and turning
// a take-home without a gross into a gross for pension rights. Simplified on purpose
// (README "Gross and take-home"): an employee, no church tax, no benefits in kind, no
// child benefit (Kindergeld / allocations), no mutuelle share. Today's money, €/year.
//
// opts: { joint: married or PACS (taxed together), partnerNet: her take-home €/yr
// (for a joint household; her gross is found by inverting the single-person
// calculator), child: a child counts in the household }

// ── Germany 2026 ────────────────────────────────────────────────────────────
// §32a EStG 2026 (Steuerfortentwicklungsgesetz); employee social contributions
// 2026: pension 9.3% and unemployment 1.3% up to 101,400 €; health 7.3% + half the
// average add-on 2.9% and long-term care 1.8% (+0.6% without children) up to
// 69,750 €. Taxable income = gross − 1,230 work allowance − 36 − the deductible
// social contributions (pension + health at the 7.0% base rate + care). Solidarity
// surcharge: Freigrenze 20,350 € of tax (40,700 joint), then 11.9% of the excess,
// at most 5.5%.
export const DE_PAY = { bbgRv: 101400, bbgKv: 69750, rv: 0.093, alv: 0.013, kv: 0.0875, kvDeduct: 0.0845,
  pv: 0.018, pvChildless: 0.006, workAllowance: 1230, specialAllowance: 36, soliFree: 20350 };

export function deIncomeTax(zvE) {
  const x = Math.floor(Math.max(0, zvE));
  let t;
  if (x <= 12348) t = 0;
  else if (x <= 17799) { const y = (x - 12348) / 10000; t = (914.51 * y + 1400) * y; }
  else if (x <= 69878) { const z = (x - 17799) / 10000; t = (173.10 * z + 2397) * z + 1034.87; }
  else if (x <= 277825) t = 0.42 * x - 11135.63;
  else t = 0.45 * x - 19470.38;
  return Math.floor(t);
}
const soli = (tax, free) => tax <= free ? 0 : Math.min(0.055 * tax, 0.119 * (tax - free));

function deParts(g, child) {
  const P = DE_PAY, rvBase = Math.min(g, P.bbgRv), kvBase = Math.min(g, P.bbgKv);
  const pv = (P.pv + (child ? 0 : P.pvChildless)) * kvBase;
  const social = (P.rv + P.alv) * rvBase + P.kv * kvBase + pv;
  const zvE = Math.max(0, g - P.workAllowance - P.specialAllowance - (P.rv * rvBase + P.kvDeduct * kvBase + pv));
  return { social, zvE };
}

function netDE(g, o) {
  const a = deParts(g, o.child);
  if (!o.joint) {
    const tax = deIncomeTax(a.zvE), s = soli(tax, DE_PAY.soliFree);
    return { net: g - a.social - tax - s, social: a.social, tax: tax + s };
  }
  const herGross = o.partnerNet > 0 ? grossFromNet('DE', o.partnerNet, { child: o.child }) : 0;
  const b = deParts(herGross, o.child), zJ = a.zvE + b.zvE;
  const taxJ = 2 * deIncomeTax(zJ / 2), sJ = soli(taxJ, 2 * DE_PAY.soliFree);
  const share = zJ > 0 ? a.zvE / zJ : 1;   // your part of the joint tax, by taxable income
  const tax = (taxJ + sJ) * share;
  return { net: g - a.social - tax, social: a.social, tax };
}

// ── France 2026 ─────────────────────────────────────────────────────────────
// Employee contributions (non-executive): old age 6.90% up to the PASS (48,060 €)
// + 0.40% on all pay; Agirc-Arrco 3.15% / 8.64% (T1 / T2) + CEG 0.86% / 1.08% + CET
// 0.14%; CSG 9.2% + CRDS 0.5% on 98.25% of pay (up to 4 PASS). Net taxable = net
// + the non-deductible CSG 2.4% + CRDS 0.5%. Tax: 10% work allowance (at most
// 14,426 €), the barème on 2025 income (0 / 11 / 30 / 41 / 45% above 11,600 /
// 29,579 / 84,577 / 181,917 €), family quotient (1 part alone, 2 married or PACS,
// +½ for the first child) capped at 1,807 € per half-part, décote (897 − 45.25% of
// the tax under 1,982 €; 1,483 / 3,277 € for a couple).
export const FR_PAY = { pass: 48060, brackets: [[11600, 0.11], [29579, 0.30], [84577, 0.41], [181917, 0.45]],
  allowanceMax: 14426, qfCap: 1807, decote: { single: [897, 1982], joint: [1483, 3277] } };

function frCharges(g) {
  const P = FR_PAY.pass, t1 = Math.min(g, P), t2 = Math.max(0, Math.min(g, 8 * P) - P);
  const csgBase = 0.9825 * Math.min(g, 4 * P) + Math.max(0, g - 4 * P);
  const social = 0.069 * t1 + 0.004 * g + 0.0315 * t1 + 0.0864 * t2 + 0.0086 * t1 + 0.0108 * t2
    + (g > P ? 0.0014 * Math.min(g, 8 * P) : 0) + 0.097 * csgBase;
  const net = g - social;
  return { social, net, taxable: net + 0.029 * csgBase };
}
function frBareme(perPart) {
  let tax = 0, lo = 0;
  const b = FR_PAY.brackets;
  for (let i = 0; i < b.length; i++) {
    const hi = i + 1 < b.length ? b[i + 1][0] : Infinity;
    if (perPart > b[i][0]) tax += (Math.min(perPart, hi) - b[i][0]) * b[i][1];
    lo = hi;
  }
  return tax;
}
// Household income tax on taxable salary income R (after the 10% allowance).
export function frIncomeTax(R, joint, child) {
  const base = joint ? 2 : 1, parts = base + (child ? 0.5 : 0);
  let tax = parts * frBareme(R / parts);
  if (child) tax = Math.max(tax, base * frBareme(R / base) - FR_PAY.qfCap);   // plafonnement, one half-part
  const [d, lim] = FR_PAY.decote[joint ? 'joint' : 'single'];
  if (tax < lim) tax = Math.max(0, tax - Math.max(0, d - 0.4525 * tax));
  return tax;
}
const frAllowance = x => Math.min(FR_PAY.allowanceMax, 0.1 * x);

function netFR(g, o) {
  const a = frCharges(g), mine = a.taxable - frAllowance(a.taxable);
  if (!o.joint) { const tax = frIncomeTax(mine, false, o.child); return { net: a.net - tax, social: a.social, tax }; }
  const herGross = o.partnerNet > 0 ? grossFromNet('FR', o.partnerNet, {}) : 0;
  const b = frCharges(herGross), hers = b.taxable - frAllowance(b.taxable);
  const taxJ = frIncomeTax(mine + hers, true, o.child), share = mine + hers > 0 ? mine / (mine + hers) : 1;
  return { net: a.net - taxJ * share, social: a.social, tax: taxJ * share };
}

// { net, social, tax } €/yr for a gross €/yr where you live; null for a country
// without a calculator.
export function netPay(country, grossYear, opts) {
  const g = Math.max(0, +grossYear || 0), o = opts || {};
  if (country === 'DE') return netDE(g, o);
  if (country === 'FR') return netFR(g, o);
  return null;
}
export const hasNetCalc = c => c === 'DE' || c === 'FR';

// The gross that gives this take-home (€/yr), by bisection (net rises with gross);
// null without a calculator.
export function grossFromNet(country, netYear, opts) {
  if (!hasNetCalc(country)) return null;
  const target = Math.max(0, +netYear || 0);
  if (!target) return 0;
  let lo = target, hi = target * 3 + 10000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netPay(country, mid, opts).net < target) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}
