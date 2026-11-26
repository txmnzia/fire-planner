import { el, numVal, optVal } from "./util.js?v=8.31";
import { state, features } from "./state.js?v=8.31";
import { effectiveFeatures } from "./checks.js?v=8.31";
import { payChangesFor } from "./payChanges.js?v=8.31";
import { pensionNet, pensionsMoreNet } from "./pensions.js?v=8.31";


// Optional money field: null when empty (unlike optVal, 0 is a valid value).
function optNum(id) {
  const e = el(id); if (!e || e.value.trim() === "") return null;
  const v = parseFloat(e.value); return isNaN(v) ? null : v;
}

// ── GLOBALS ────────────────────────────────────────────────────────────────
const optStr = (id, d) => { const e = el(id); return e && e.value ? e.value : d; };
export function currentAgeFromDOB() {
  const s = el("dob").value; if (!s) return 30;
  const dob = new Date(s), ref = new Date(numVal("baseYear",2026),0,1);
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m===0 && ref.getDate()<dob.getDate())) age--;
  return Math.max(0, age);
}

export function getWindfalls() {
  // Dynamic list held on state.windfalls ([{yr,amt}]); only complete, positive rows feed the engine.
  return state.windfalls
    .map(w => ({ yr: parseInt(w.yr), amt: parseFloat(w.amt), off: Array.isArray(w.off) ? w.off.slice() : [] }))
    .filter(w => !isNaN(w.yr) && !isNaN(w.amt) && w.amt > 0);
}

export { COUNTRY_TAX } from "./taxTable.js?v=8.31";
import { COUNTRY_TAX } from "./taxTable.js?v=8.31";
// Legacy saved states stored the numeric rate as the select value; map to a country code.
export const LEGACY_RATE_TO_CODE = { "30":"FR", "28":"PT", "26":"ES", "32":"NL", "0":"BE", "33":"IE",
                              "15":"GR", "10":"HR", "19":"PL", "25":"SI", "20":"EE", "27":"DK" };

// Living alone costs about 70% of what two people spend: SOLO_SHARE lives in the
// engine since v8.11 (one constant); re-exported for older importers.
import { SOLO_SHARE, residenceAt, investNowMonthly } from "./engine.js?v=8.31";
import { netPay, grossFromNet, hasNetCalc } from "./netPay.js?v=8.31";
import { buildResidence, normaliseRentMoves, buyCostPreset, plansForScenario } from "./countries.js?v=8.31";
export { SOLO_SHARE };
// v8.7: yearly items (€/yr, shared) count in the default too, as a monthly amount.
export function soloSharedFrom(entered, sharedNow, yearlyItems) {
  return entered != null ? entered : Math.round(((sharedNow || 0) + (yearlyItems || 0)/12) * SOLO_SHARE);
}

export function getGlobals() {
  const bondNow = numVal("bondAllocNow",0)/100;
  const sel = el("retCountry");
  const code = sel ? sel.value : "FR";
  // v8.11: where you live, today and after each planned move (tax on gains, cost of living)
  const taxNow = optNum("taxNow");
  const residence = buildResidence(code, taxNow, state.residence);
  const taxRate = residence[0].tax;
  const currentAge = currentAgeFromDOB();
  const baseYear   = numVal("baseYear",2026);
  // Partner age offset: partnerAge = yourAge + offset (0 when no birth year given).
  const pby = optVal("partnerBirthYear");
  const partnerAgeOff = pby ? (baseYear - pby) - currentAge : 0;
  const own = numVal("samPersonalNow",0);
  const joint = numVal("samPaysIn",0) + numVal("partnerPaysIn",0);
  const retMult = 1 + Math.max(-0.9, Math.min(1, numVal("retSpendChange",0)/100));
  const rentNow = numVal("propRentSaved",0);
  const gl = {
    currentAge,
    invested:     state.ibkrTotal,
    lifeExp:      numVal("lifeExp",100),
    baseYear,
    spendNow:     0,               // Simple model removed in v8.8 (engine path kept for the golden master)
    spendRet:     0,
    inflation:    numVal("inflation",2)/100,
    gainFrac:     Math.max(0, Math.min(0.99, numVal("gainFrac",25)/100)),
    stockRet:     numVal("stockRet",7)/100,
    bondRet:      numVal("bondRet",3)/100,
    stockAlloc:   1-bondNow,
    bondAllocRet: numVal("bondAllocRet",40)/100,
    taxRate,
    // v8.19: pensions are typed gross (as printed) and reach the engine NET, what
    // lands in your account (country social charges off, income tax not); see pensions.js
    pensionAmt:   pensionNet('DE', numVal("pensionAmt",0)),
    pensionAge:   numVal("pensionAge",67),
    pension2Amt:  pensionNet('FR', numVal("pension2Amt",0)),     // French pension (v8.9)
    pension2Age:  numVal("pension2Age",64),
    pensionsMore: pensionsMoreNet(state.pensionsMore),           // other countries (v8.19)
    cash:         numVal("cash",0),
    cashReturn:   numVal("cashReturn",1)/100,
    windfalls:    getWindfalls(),
    wdMode:       (document.querySelector('input[name="wdMode"]:checked')||{value:'fixed'}).value,
    swr:          numVal("swr",4)/100,
    // global partner config
    partnerInc:        numVal("partnerInc",0),
    partnerRetAge:     numVal("partnerRetAge",45),
    // v8.25 (owner's decision, audit 2026-11 F8): her pension net like yours
    partnerPension:    pensionNet(optStr("partnerPensionCountry", "DE"), numVal("partnerPension",0)),
    partnerPensionAge: numVal("partnerPensionAge",67),
    partnerAgeOff,
    // v8.8: one partner model. Spending = four numbers off your accounts; the
    // joint total is what you both pay in; retirement = today × (1 + change).
    // Simple model, multiplier, her savings, share floor/cap and Household FIRE
    // are gone (DECISIONS.md, 2026-11-20).
    partnerModel:      "two",
    samPersonalNow:    own,
    samPersonalRet:    own*retMult,
    samPaysIn:         numVal("samPaysIn",0),
    partnerPaysIn:     numVal("partnerPaysIn",0),
    sharedNow:         joint,
    // v8.11: rent is inside the joint account; the retirement change applies to
    // everything but rent (rent follows Housing: today's rent and planned moves)
    sharedRet:         (joint - rentNow)*retMult + rentNow,
    rentInJoint:       true,
    rentMoves:         normaliseRentMoves(state.rentMoves).filter(m => m.rent != null),
    residence,
    retMult,
    yearlyItems:       numVal("yearlyItems",0),
    yearlyItemsRet:    numVal("yearlyItems",0)*retMult,
    retSpendChange:    retMult - 1,
    soloShared:        soloSharedFrom(null, joint, numVal("yearlyItems",0)),
    soloSharedRet:     soloSharedFrom(null, joint, numVal("yearlyItems",0))*retMult,
    soloSharedDerived: true,
    // global property config
    propBuyYear:      optVal("propBuyYear") || numVal("propBuyYear",2029),
    propPrice:        numVal("propPrice",0),
    propDownPct:      numVal("propDownPct",20)/100,
    // v8.13: empty = the buying-cost default of the country you live in that year
    propTxCostPct:    (optNum("propTxCostPct") ?? buyCostPreset(residenceAt({ residence }, optVal("propBuyYear") || numVal("propBuyYear",2029))?.country))/100,
    propFixedYears:   optNum("propFixedYears"),
    propRateAfter:    optNum("propRateAfter") == null ? null : optNum("propRateAfter")/100,
    propCharges:      numVal("propCharges",0),
    homeOwned:        !!state.home,   // v8.22: purchase confirmed ("Your home")
    propHerShare:     Math.max(0, Math.min(1, numVal("propHerShare",0)/100)),
    propMortgageRate: numVal("propMortgageRate",3.5)/100,
    propMortgageTerm: numVal("propMortgageTerm",25),
    propRentSaved:    numVal("propRentSaved",0),
    // global child config
    childBirthYear:      numVal("childBirthYear",2027),
    partnerLeaveMonths:  numVal("partnerLeaveMonths",0),   // her parental leave (v8.12)
    partnerLeaveIncome:  numVal("partnerLeaveIncome",0),
    childCostYearly:     numVal("childCostYearly",0),
    childBenefit:        optNum("childBenefit"),   // v8.28: €/month; null = the country preset
    childCostUntilAge:   numVal("childCostUntilAge",25),
    childMaternityMonths:numVal("childMaternityMonths",0),
    childMaternityIncome:numVal("childMaternityIncome",0),
    // v8.26: health insurance once you stop, until your pension (your €/month, else the preset)
    healthAfterStop:     optNum("healthAfterStop"),
    // v8.27: gross pay today (€/yr; only for pension rights) and how you are taxed
    grossNow:            optNum("grossNow"),
    taxJoint:            (el("taxHousehold") || {}).value === "joint",
  };
  // the preset needs the realised gains you would live on: half of your monthly cost today
  gl.healthGainMonthly = 0.5 * Math.max(0, investNowMonthly(gl, numVal("baseIncome", 0)).cost);
  return gl;
}

export function getScenario(s, gl) {
  // a switch only counts once its plan is set up (v8.3, js/checks.js)
  const feat = effectiveFeatures(features[s], gl);
  const plans = plansForScenario(gl, s);
  return {
    id:       s,
    retAge:   numVal("s"+s+"_ret", 38+(s-1)*4),
    // v8.6: pay changes are plans (state.payChanges); the old per-scenario
    // override and change fields are migrated once and no longer read here
    income:   numVal("baseIncome", 0),
    chgYear:  null,
    chgInc:   null,
    payChanges: payChangesFor(state.payChanges, s, p => resolvePay(p, gl, plans.residence, feat.child)),
    // v8.17: planned rents and moves abroad switched on for this scenario
    ...plans,
    // feature flags
    hasPartner: feat.partner,
    hasProp:    feat.prop,
    hasChild:   feat.child,
  };
}

// v8.27: a planned pay change typed gross gets its take-home estimated, and one
// typed as take-home gets a gross (for pension rights), with the calculator of the
// country you live in from its start year and your household then (married or
// PACS, her take-home today, the child once born in a scenario with the child).
export function payContext(gl, from, residence, withChild) {
  const country = (residenceAt({ residence: residence || gl.residence }, from) || {}).country;
  const opts = { joint: !!gl.taxJoint, partnerNet: (gl.partnerInc || 0) * 12,
                 child: !!withChild && gl.childBirthYear != null && from >= gl.childBirthYear };
  return { country, opts };
}
export function resolvePay(p, gl, residence, withChild) {
  if (!Number.isFinite(p.from)) return p;
  const { country, opts } = payContext(gl, p.from, residence, withChild);
  let amt = p.amt, gross = p.gross;
  if (amt == null && gross != null && hasNetCalc(country)) amt = Math.round(netPay(country, gross, opts).net / 12);
  if (gross == null && amt === 0) gross = 0;
  else if (gross == null && amt > 0 && gl.grossNow > 0 && hasNetCalc(country)) gross = grossFromNet(country, amt * 12, opts);
  return { ...p, amt, gross };
}

// ── LABELS ─────────────────────────────────────────────────────────────────
export function getScenarioName(idx) {
  const ids=["sc1name","sc2name","sc3name","sc4name","sc5name"],letters=["A","B","C","D","E"];
  const inp=el(ids[idx]); const name=inp?inp.value.trim():""; return name||letters[idx];
}
