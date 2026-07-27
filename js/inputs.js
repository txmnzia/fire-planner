import { el, numVal, optVal } from "./util.js";
import { state, features } from "./state.js";

export function incomeFor(s) {
  const ov = el("s" + s + "_inc");
  if (ov && ov.value.trim() !== "") {
    const v = parseFloat(ov.value);
    if (!isNaN(v)) return v;
  }
  return numVal("baseIncome", 6700);
}

// ── GLOBALS ────────────────────────────────────────────────────────────────
export function currentAgeFromDOB() {
  const s = el("dob").value; if (!s) return 32;
  const dob = new Date(s), ref = new Date(numVal("baseYear",2026),0,1);
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m===0 && ref.getDate()<dob.getDate())) age--;
  return Math.max(0, age);
}

export function getWindfalls() {
  // Dynamic list held on state.windfalls ([{yr,amt}]); only complete, positive rows feed the engine.
  return state.windfalls
    .map(w => ({ yr: parseInt(w.yr), amt: parseFloat(w.amt) }))
    .filter(w => !isNaN(w.yr) && !isNaN(w.amt) && w.amt > 0);
}

// Capital-gains tax rate per country (flat-rate approximation; see README).
export const COUNTRY_TAX = { FR:30, PT:28, ES:26, DE:26, IT:26, NL:32, BE:0, LU:0, AT:28, IE:33, GR:15,
                      CY:0, MT:0, HR:10, HU:15, RO:10, BG:10, PL:19, SI:25, EE:20, LV:20, LT:15,
                      SK:19, SE:30, DK:27, FI:30 };
// Legacy saved states stored the numeric rate as the select value; map to a country code.
export const LEGACY_RATE_TO_CODE = { "30":"FR", "28":"PT", "26":"ES", "32":"NL", "0":"BE", "33":"IE",
                              "15":"GR", "10":"HR", "19":"PL", "25":"SI", "20":"EE", "27":"DK" };

export function getGlobals() {
  const bondNow = numVal("bondAllocNow",0)/100;
  const sel = el("retCountry");
  const code = sel ? sel.value : "FR";
  const taxRate = (COUNTRY_TAX[code] !== undefined ? COUNTRY_TAX[code] : 30)/100;
  const currentAge = currentAgeFromDOB();
  const baseYear   = numVal("baseYear",2026);
  // Partner age offset: partnerAge = yourAge + offset (0 when no birth year given).
  const pby = optVal("partnerBirthYear");
  const partnerAgeOff = pby ? (baseYear - pby) - currentAge : 0;
  return {
    currentAge,
    invested:     state.ibkrTotal,
    lifeExp:      numVal("lifeExp",100),
    baseYear,
    spendNow:     numVal("spendNow",3000),
    spendRet:     numVal("spendRet",3000),
    inflation:    numVal("inflation",2)/100,
    gainFrac:     Math.max(0, Math.min(0.99, numVal("gainFrac",27)/100)),
    stockRet:     numVal("stockRet",7)/100,
    bondRet:      numVal("bondRet",3)/100,
    stockAlloc:   1-bondNow,
    bondAllocRet: numVal("bondAllocRet",40)/100,
    taxRate,
    pensionAmt:   numVal("pensionAmt",800),
    pensionAge:   numVal("pensionAge",67),
    cash:         numVal("cash",0),
    cashReturn:   numVal("cashReturn",1)/100,
    windfalls:    getWindfalls(),
    wdMode:       (document.querySelector('input[name="wdMode"]:checked')||{value:'fixed'}).value,
    swr:          numVal("swr",4)/100,
    // global partner config
    partnerInc:        numVal("partnerInc",4000),
    partnerRetAge:     numVal("partnerRetAge",45),
    partnerPension:    numVal("partnerPension",700),
    partnerPensionAge: numVal("partnerPensionAge",67),
    partnerSpendMult:  numVal("partnerSpendMult",1.5),
    partnerAgeOff,
    // global property config
    propBuyYear:      optVal("propBuyYear") || numVal("propBuyYear",2029),
    propPrice:        numVal("propPrice",400000),
    propDownPct:      numVal("propDownPct",20)/100,
    propTxCostPct:    numVal("propTxCostPct",8)/100,
    propMortgageRate: numVal("propMortgageRate",3.5)/100,
    propMortgageTerm: numVal("propMortgageTerm",25),
    propRentSaved:    numVal("propRentSaved",1200),
    // global child config
    childBirthYear:      numVal("childBirthYear",2027),
    childCostYearly:     numVal("childCostYearly",12000),
    childCostUntilAge:   numVal("childCostUntilAge",25),
    childMaternityMonths:numVal("childMaternityMonths",6),
    childMaternityIncome:numVal("childMaternityIncome",2000),
  };
}

export function getScenario(s, gl) {
  const feat = features[s];
  return {
    id:       s,
    retAge:   numVal("s"+s+"_ret", 38+(s-1)*4),
    income:   incomeFor(s),
    chgYear:  optVal("s"+s+"_chgYear"),
    chgInc:   optVal("s"+s+"_chgInc"),
    // feature flags
    hasPartner: feat.partner,
    hasProp:    feat.prop,
    hasChild:   feat.child,
  };
}

// ── LABELS ─────────────────────────────────────────────────────────────────
export function getScenarioName(idx) {
  const ids=["sc1name","sc2name","sc3name","sc4name","sc5name"],letters=["A","B","C","D","E"];
  const inp=el(ids[idx]); const name=inp?inp.value.trim():""; return name||letters[idx];
}
