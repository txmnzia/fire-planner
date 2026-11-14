// ── MATH ───────────────────────────────────────────────────────────────────
export function portReturnAt(gl, age, retAge) {
  const sNow=gl.stockAlloc, sRet=1-gl.bondAllocRet;
  let sf;
  if (age<=gl.currentAge) sf=sNow;
  else if (age>=retAge) sf=sRet;
  else sf=sNow+(sRet-sNow)*(age-gl.currentAge)/Math.max(1,retAge-gl.currentAge);
  return sf*gl.stockRet+(1-sf)*gl.bondRet;
}

export function annuityPV(C,r,g,n) {
  if (n<=0) return 0;
  if (Math.abs(r-g)<0.0001) return C*n;
  return C*(1-Math.pow((1+g)/(1+r),n))/(r-g);
}

// Flat annual mortgage payment (0 when no property price). Handles 0% rate.
export function mortgageAnnual(gl) {
  if (!(gl.propPrice > 0) || !(gl.propMortgageTerm > 0)) return 0;
  const principal = gl.propPrice*(1-gl.propDownPct);
  const nm = gl.propMortgageTerm*12;
  if (!(gl.propMortgageRate > 0)) return principal/nm*12;
  const mr = gl.propMortgageRate/12;
  return principal*mr*Math.pow(1+mr,nm)/(Math.pow(1+mr,nm)-1)*12;
}

// ── TWO-PERSON HOUSEHOLD MODEL ─────────────────────────────────────────────
// gl.partnerModel: 'simple' (or absent) = the original model (partner salary
// added to household income, spending × partnerSpendMult). 'two' = each person
// has their own finances; shared costs are split pro rata to the two net
// incomes. Every two-person figure on screen comes from the functions below.
export function isTwoPerson(gl) { return gl.partnerModel === 'two'; }

const clamp01 = x => Math.max(0, Math.min(1, x));

// Partner's share of shared costs: her income / (her + your income), clamped to
// [shareMin, shareMax]; 0 when neither has any income.
export function partnerShare(herInc, samInc, gl) {
  const tot = herInc + samInc;
  if (!(tot > 0)) return 0;
  const lo = gl.shareMin != null ? gl.shareMin : 0;
  const hi = gl.shareMax != null ? gl.shareMax : 0.5;
  return Math.max(lo, Math.min(hi, herInc / tot));
}

// Partner's net income in calendar year yr (nominal €/yr): salary until HER
// retirement age, pension from HER pension age (age offset applied), plus her
// sustainable draw (herDrawAnn, supplied by the caller) once she has stopped work.
export function partnerIncomeAt(yr, gl, herDrawAnn) {
  const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
  const herAge  = gl.currentAge + t + (gl.partnerAgeOff || 0);
  const working = herAge < gl.partnerRetAge;
  const salary  = working ? gl.partnerInc*12*infl : 0;
  const pension = herAge >= gl.partnerPensionAge ? gl.partnerPension*12*infl : 0;
  const draw    = working ? 0 : (herDrawAnn || 0);
  return { herAge, working, salary, pension, draw, total: salary + pension + draw };
}

// Household cost components in year yr (nominal €/yr). `shared` is what gets
// split: joint living costs + child costs + mortgage − rent saved (floored at 0).
// A property purchase cost is not shared (it stays on your side, like today).
export function householdCosts(yr, sc, gl, samRetired) {
  const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
  const samPersonal = (samRetired ? gl.samPersonalRet : gl.samPersonalNow)*12*infl;
  const sharedBase  = (samRetired ? gl.sharedRet : gl.sharedNow)*12*infl;
  const partnerPersonal = (gl.partnerPersonal || 0)*12*infl;
  let child = 0, mortgage = 0, rentSaved = 0;
  if (sc.hasChild) {
    const childAge = yr - gl.childBirthYear;
    if (childAge >= 0 && childAge < gl.childCostUntilAge) child = gl.childCostYearly*infl;
  }
  if (sc.hasProp) {
    if (yr >= gl.propBuyYear && yr < gl.propBuyYear + gl.propMortgageTerm) mortgage = mortgageAnnual(gl);
    if (yr >= gl.propBuyYear) rentSaved = gl.propRentSaved*12*infl;
  }
  const shared = Math.max(0, sharedBase + child + mortgage - rentSaved);
  return { samPersonal, sharedBase, partnerPersonal, child, mortgage, rentSaved, shared };
}

// Your net cost in year yr given YOUR income for the share (samInc, nominal €/yr).
export function twoPersonCost(yr, sc, gl, samInc, herDrawAnn, samRetired) {
  const hc = householdCosts(yr, sc, gl, samRetired);
  const her = partnerIncomeAt(yr, gl, herDrawAnn);
  const share = partnerShare(her.total, samInc, gl);
  const contrib = share*hc.shared;
  return { ...hc, her, samInc, share, contrib, samCost: hc.samPersonal + hc.shared - contrib };
}

// Your retirement cost when your portfolio is exactly at target: then your
// sustainable draw (portfolio × SWR × netFrac) plus pension equals your cost,
// so your income for the share is max(cost, pension). Solves the fixed point
// c = P + S·(1 − share(h, c)) in closed form: c² + c(h−P−S) − P·h = 0 (positive
// root); the clamp on the share keeps the fixed point (share(c) is monotone).
export function selfFundedCost(yr, sc, gl, samPensionAnn, herDrawAnn) {
  const hc = householdCosts(yr, sc, gl, true);
  const her = partnerIncomeAt(yr, gl, herDrawAnn);
  const P = hc.samPersonal, S = hc.shared, h = her.total, pen = samPensionAnn || 0;
  let c = (P + S - h + Math.sqrt((h - P - S)*(h - P - S) + 4*P*h)) / 2;
  // c ≥ pension: your income is your cost (c). Otherwise the pension alone is
  // your income (no draw needed); the cost then stays below the pension.
  const share = partnerShare(h, c >= pen ? c : pen, gl);
  const contrib = share*S;
  c = P + S - contrib;
  return { ...hc, her, samInc: Math.max(c, pen), share, contrib, samCost: c };
}

// Full household FIRE target: both stop working in your retirement year; the
// combined portfolios cover samPersonal + partnerPersonal + shared, net of both
// pensions once they start. SWR mode: year-one need × taxMult / SWR. Fixed mode:
// PV of the year-by-year need (ordinary annuity timing, like annuityPV) plus a
// retirement-era purchase cost.
export function computeHouseholdTarget(fromAge, sc, gl, taxMult) {
  if (fromAge >= gl.lifeExp) return 0;
  const tFrom = fromAge - gl.currentAge, fromYear = gl.baseYear + tFrom;
  const off = gl.partnerAgeOff || 0;
  const need = yr => {
    const t = yr - gl.baseYear, age = gl.currentAge + t, infl = Math.pow(1+gl.inflation, t);
    const hc = householdCosts(yr, sc, gl, true);
    const pens = (age >= gl.pensionAge ? gl.pensionAmt*12*infl : 0)
               + (age + off >= gl.partnerPensionAge ? gl.partnerPension*12*infl : 0);
    return Math.max(0, hc.samPersonal + hc.partnerPersonal + hc.shared - pens);
  };
  if (gl.wdMode === "swr") return gl.swr > 0 ? Math.round(need(fromYear)*taxMult/gl.swr) : 0;
  const r = portReturnAt(gl, fromAge, sc.retAge);
  let pv = 0;
  for (let k = 0; k < gl.lifeExp - fromAge; k++) pv += need(fromYear + k)*taxMult/Math.pow(1+r, k+1);
  if (sc.hasProp && gl.propBuyYear >= fromYear)
    pv += gl.propPrice*(gl.propDownPct + gl.propTxCostPct)*taxMult/Math.pow(1+r, gl.propBuyYear - fromYear);
  return Math.round(Math.max(0, pv));
}

// Separation check: could the partner cover her solo costs (partnerPersonal +
// soloShared) alone? Income = salary while working, else pension + her
// portfolio at a 4% draw net of CGT. Today's €/mo, at her age 50 and 67 and at
// your retirement year. Uses the partner ledger project() returns.
export const SEPARATION_SWR = 0.04;
export function partnerSeparation(proj, sc, gl) {
  if (!proj || !proj.partner) return [];
  const off = gl.partnerAgeOff || 0, out = [], seen = new Set();
  const add = (label, yr) => {
    const idx = yr - proj.years[0];
    if (idx < 0 || idx >= proj.years.length || seen.has(yr) || yr < gl.baseYear) return;
    seen.add(yr);
    const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
    const herAge = gl.currentAge + t + off;
    const working = herAge < gl.partnerRetAge;
    const port = proj.partner.values[idx] || 0;
    const gf = (proj.rows[idx] && proj.rows[idx].partnerGainFrac) || 0;
    const pension = herAge >= gl.partnerPensionAge ? gl.partnerPension : 0;
    const draw = working ? 0 : port*SEPARATION_SWR*Math.max(0.001, 1 - gf*gl.taxRate)/12/infl;
    const income = working ? gl.partnerInc : pension + draw;
    const cost = (gl.partnerPersonal || 0) + (gl.soloShared || 0);
    out.push({ label, yr, herAge, working, income: Math.round(income), pension: working ? 0 : Math.round(pension),
               draw: Math.round(draw), cost: Math.round(cost), gap: Math.round(income - cost) });
  };
  add("Her age 50", gl.baseYear + 50 - off - gl.currentAge);
  add("Your retirement", proj.retYear);
  add("Her age 67", gl.baseYear + 67 - off - gl.currentAge);
  return out.sort((a, b) => a.yr - b.yr);
}

// Card note: what the partner contributes (today's €/mo) when you retire, until
// which of her ages, and what your cost becomes after that change.
export function partnerContributionNote(sc, gl, proj) {
  if (!isTwoPerson(gl) || !sc.hasPartner || !proj || !proj.partner) return null;
  const off = gl.partnerAgeOff || 0;
  const at = yr => {
    const t = yr - gl.baseYear, age = gl.currentAge + t, infl = Math.pow(1+gl.inflation, t);
    const pen = age >= gl.pensionAge ? gl.pensionAmt*12*infl : 0;
    const idx = yr - proj.years[0];
    const c = selfFundedCost(yr, sc, gl, pen, proj.partner.drawByT[t] || 0);
    return { c, infl, ok: idx >= 0 && idx < proj.years.length };
  };
  const r0 = at(proj.retYear);
  if (!r0.ok) return null;
  const herAgeRet = sc.retAge + off;
  let untilAge = null;
  if (herAgeRet < gl.partnerRetAge) untilAge = gl.partnerRetAge;
  else if (herAgeRet < gl.partnerPensionAge) untilAge = gl.partnerPensionAge;
  let costAfter = null;
  if (untilAge != null) {
    const r1 = at(gl.baseYear + untilAge - off - gl.currentAge);
    if (r1.ok) costAfter = Math.round(r1.c.samCost/12/r1.infl);
  }
  return { contribMonthly: Math.round(r0.c.contrib/12/r0.infl), share: r0.c.share,
           costMonthly: Math.round(r0.c.samCost/12/r0.infl), untilHerAge: untilAge, costAfterMonthly: costAfter };
}

// Full annual retirement budget in the first year of retirement at fromAge:
// base spending (with partner multiplier) plus child costs, mortgage and rent
// savings active in that year. Used by the %-of-portfolio FIRE target, the
// scenario-card target, and (per year) the Monte Carlo funding ratio.
//
// Two-person model (gl.partnerModel === 'two'): for a partner scenario the
// budget is YOUR net cost (your personal spending + shared costs − the
// partner's pro-rata contribution), priced at the share that holds when your
// portfolio equals the target (selfFundedCost). herDrawAnn is the partner's
// sustainable draw that year (nominal €/yr, from project()); 0 while she works.
// For a scenario without the partner, base spending is samPersonalRet + soloShared.
export function yearOneBudget(fromAge, sc, gl, herDrawAnn) {
  const tFrom = fromAge - gl.currentAge;
  const fromYear = gl.baseYear + tFrom;
  const inflF = Math.pow(1+gl.inflation, tFrom);
  if (isTwoPerson(gl) && sc.hasPartner) {
    const pen = fromAge >= gl.pensionAge ? gl.pensionAmt*12*inflF : 0;
    return Math.max(0, selfFundedCost(fromYear, sc, gl, pen, herDrawAnn).samCost);
  }
  let budget = isTwoPerson(gl)
    ? (gl.samPersonalRet + gl.soloShared)*12*inflF
    : gl.spendRet*(sc.hasPartner ? gl.partnerSpendMult : 1)*12*inflF;
  if (sc.hasChild) {
    const childAge = fromYear - gl.childBirthYear;
    if (childAge >= 0 && childAge < gl.childCostUntilAge) budget += gl.childCostYearly*inflF;
  }
  if (sc.hasProp) {
    if (fromYear >= gl.propBuyYear && fromYear < gl.propBuyYear + gl.propMortgageTerm) budget += mortgageAnnual(gl);
    if (fromYear >= gl.propBuyYear) budget -= gl.propRentSaved*12*inflF;
  }
  return Math.max(0, budget);
}

export function computeFireTarget(fromAge, sc, gl, taxMult, opts) {
  opts = opts || {};
  if (fromAge>=gl.lifeExp) return 0;
  const tFrom    = fromAge-gl.currentAge;
  const off      = gl.partnerAgeOff || 0;   // partner's age = your age + off
  // effective retirement spending: partner multiplier increases it, child costs are time-limited
  const baseSpend = isTwoPerson(gl) && !sc.hasPartner
    ? gl.samPersonalRet + gl.soloShared
    : gl.spendRet * (sc.hasPartner ? gl.partnerSpendMult : 1);
  const spendNom  = baseSpend*12*Math.pow(1+gl.inflation,tFrom);
  const pensionNom= gl.pensionAmt*12*Math.pow(1+gl.inflation,tFrom);
  const rFrom     = portReturnAt(gl,fromAge,sc.retAge);

  // PV at fromAge of an inflation-growing net income stream (in today's €/month)
  // running from startAge to endAge (your-age terms). Income that arrives outside
  // the portfolio replaces withdrawals that would carry the CGT gross-up, so the
  // credit is scaled by the same taxMult.
  function incomeCredit(monthlyToday, startAge, endAge) {
    const s = Math.max(fromAge, startAge), e = Math.min(gl.lifeExp, endAge);
    const n = e - s;
    if (!(monthlyToday > 0) || n <= 0) return 0;
    const atStart = monthlyToday*12*Math.pow(1+gl.inflation, s-gl.currentAge);
    return annuityPV(atStart*taxMult, rFrom, gl.inflation, n) / Math.pow(1+rFrom, s-fromAge);
  }

  if (isTwoPerson(gl) && sc.hasPartner) return partialTargetTwo();

  // Two-person model, partner scenario: Partial FIRE = your own portfolio covers
  // YOUR net cost (selfFundedCost) while the partner keeps contributing. Child
  // and property costs are inside the shared costs, so they are not added again.
  function partialTargetTwo() {
    const herDraw = opts.herDraw || {};
    const fromYear = gl.baseYear + tFrom, n = gl.lifeExp - fromAge;
    const at = yr => {
      const t = yr - gl.baseYear, age = gl.currentAge + t;
      const pen = age >= gl.pensionAge ? gl.pensionAmt*12*Math.pow(1+gl.inflation, t) : 0;
      return { pen, c: selfFundedCost(yr, sc, gl, pen, herDraw[t] || 0) };
    };
    const a0 = at(fromYear);
    if (gl.wdMode === "swr") {
      let target = gl.swr>0 ? Math.max(0, a0.c.samCost - a0.pen)*taxMult/gl.swr : 0;
      if (opts.otherIncomeCredit) {
        // Adjusted: credit your pension starting later, and price later changes
        // in the partner's share (she retires: share falls, your cost rises; her
        // pension starts: share rises) against the year-one share.
        if (fromAge < gl.pensionAge) target -= incomeCredit(gl.pensionAmt, gl.pensionAge, gl.lifeExp);
        for (let k = 0; k < n; k++) {
          const ak = at(fromYear + k);
          target += ak.c.shared*(a0.c.share - ak.c.share)*taxMult/Math.pow(1+rFrom, k+1);
        }
        target = Math.max(0, target);
      }
      return Math.round(target);
    }
    let pv = 0;
    for (let k = 0; k < n; k++) {
      const ak = at(fromYear + k);
      pv += Math.max(0, ak.c.samCost - ak.pen)*taxMult/Math.pow(1+rFrom, k+1);
    }
    if (sc.hasProp && gl.propBuyYear >= fromYear)
      pv += gl.propPrice*(gl.propDownPct + gl.propTxCostPct)*taxMult/Math.pow(1+rFrom, gl.propBuyYear - fromYear);
    return Math.round(Math.max(0, pv));
  }

  if (gl.wdMode==="swr") {
    // %-of-portfolio mode: portfolio must be large enough that a GROSS draw of
    // SWR% delivers the full year-one budget AFTER capital-gains tax (taxMult),
    // net of income streams already flowing at retirement. Partner salary is
    // deliberately excluded from the headline (it is temporary income).
    const budget = yearOneBudget(fromAge, sc, gl);
    const pensionOffset = fromAge>=gl.pensionAge ? pensionNom : 0;
    let partnerPenOff = 0;
    if (sc.hasPartner && fromAge+off>=gl.partnerPensionAge) partnerPenOff = gl.partnerPension*12*Math.pow(1+gl.inflation,tFrom);
    const annualFromPort = Math.max(0,budget-pensionOffset-partnerPenOff);
    let target = gl.swr>0 ? annualFromPort*taxMult/gl.swr : 0;
    if (opts.otherIncomeCredit) {
      // Adjusted (non-headline) number: also credit the PV of income the headline
      // ignores — pensions that start after retirement, and partner salary until
      // the partner retires.
      if (fromAge < gl.pensionAge) target -= incomeCredit(gl.pensionAmt, gl.pensionAge, gl.lifeExp);
      if (sc.hasPartner && fromAge+off < gl.partnerPensionAge) target -= incomeCredit(gl.partnerPension, gl.partnerPensionAge-off, gl.lifeExp);
      if (sc.hasPartner && fromAge+off < gl.partnerRetAge)     target -= incomeCredit(gl.partnerInc, fromAge, gl.partnerRetAge-off);
      target = Math.max(0, target);
    }
    return Math.round(target);
  }

  // PV credits against the DCF FIRE target: partner pension from the partner's
  // pension age, and partner salary while the partner is still working.
  function partnerPenCredit() {
    if (!sc.hasPartner) return 0;
    return incomeCredit(gl.partnerPension, gl.partnerPensionAge-off, gl.lifeExp)
         + incomeCredit(gl.partnerInc, fromAge, gl.partnerRetAge-off);
  }

  // PV of child costs (increases FIRE target) — DCF mode only
  function childCostPV() {
    if (!sc.hasChild) return 0;
    const fromYear     = gl.baseYear + tFrom;
    const childEndYear = gl.childBirthYear + gl.childCostUntilAge;
    const costStartYear = Math.max(fromYear, gl.childBirthYear);
    const nChild = Math.max(0, childEndYear - costStartYear);
    if (nChild <= 0) return 0;
    const nDelay   = costStartYear - fromYear;
    const tCS      = costStartYear - gl.baseYear;
    const costAtStart = gl.childCostYearly * Math.pow(1+gl.inflation, tCS);
    const pvAtStart = annuityPV(costAtStart*taxMult, rFrom, gl.inflation, nChild);
    return pvAtStart / Math.pow(1+rFrom, nDelay);
  }

  // Net PV of property cash flows during retirement (increases FIRE target if mortgage > rent savings)
  function propNetPV() {
    if (!sc.hasProp) return 0;
    const fromYear = gl.baseYear + tFrom;
    let pv = 0;
    // one-time purchase cost if property is bought during retirement
    if (gl.propBuyYear >= fromYear) {
      const nDelayPurch = gl.propBuyYear - fromYear;
      const purchaseCost = gl.propPrice * (gl.propDownPct + gl.propTxCostPct);
      pv += (purchaseCost * taxMult) / Math.pow(1+rFrom, nDelayPurch);
    }
    // ongoing mortgage payments (flat, g=0) — active from max(propBuyYear, fromYear) to propBuyYear+mortgageTerm
    const mortgageEndYear = gl.propBuyYear + gl.propMortgageTerm;
    const mortgStartYear  = Math.max(gl.propBuyYear, fromYear);
    const nMortgage = Math.max(0, mortgageEndYear - mortgStartYear);
    const annualMtg = mortgageAnnual(gl);
    if (nMortgage > 0 && annualMtg > 0) {
      const nDelayMtg  = mortgStartYear - fromYear;
      const pvMtg = annuityPV(annualMtg*taxMult, rFrom, 0, nMortgage);
      pv += pvMtg / Math.pow(1+rFrom, nDelayMtg);
    }
    // rent savings (inflation-growing) — active from max(propBuyYear, fromYear) until lifeExp
    const rentStartYear = Math.max(gl.propBuyYear, fromYear);
    const nRent = Math.max(0, gl.lifeExp - (gl.currentAge + (rentStartYear - gl.baseYear)));
    if (nRent > 0) {
      const tRS       = rentStartYear - gl.baseYear;
      const rentAtStart = gl.propRentSaved*12*Math.pow(1+gl.inflation, tRS);
      const nDelayRent  = rentStartYear - fromYear;
      const pvRent = annuityPV(rentAtStart*taxMult, rFrom, gl.inflation, nRent);
      pv -= pvRent / Math.pow(1+rFrom, nDelayRent);
    }
    return pv;
  }

  if (fromAge>=gl.pensionAge) {
    const n   = Math.max(0,gl.lifeExp-fromAge);
    const netW= Math.max(0,spendNom-pensionNom)*taxMult;
    return Math.round(Math.max(0, annuityPV(netW,rFrom,gl.inflation,n) + childCostPV() + propNetPV() - partnerPenCredit()));
  }
  const n1  = gl.pensionAge-fromAge;
  const pv1 = annuityPV(spendNom*taxMult,rFrom,gl.inflation,n1);
  const tPen= gl.pensionAge-gl.currentAge;
  const spendAtPen = baseSpend*12*Math.pow(1+gl.inflation,tPen);
  const penAtPen   = gl.pensionAmt*12*Math.pow(1+gl.inflation,tPen);
  const netAtPen   = Math.max(0,spendAtPen-penAtPen)*taxMult;
  const n2         = Math.max(0,gl.lifeExp-gl.pensionAge);
  const pv2AtPen   = annuityPV(netAtPen,rFrom,gl.inflation,n2);
  const pv2        = pv2AtPen/Math.pow(1+rFrom,n1);
  return Math.round(Math.max(0, pv1+pv2 + childCostPV() + propNetPV() - partnerPenCredit()));
}

export function project(sc, gl, opts) {
  opts = opts || {};
  // When anchored (startPort given) the projection is re-based at a past point
  // for plan-vs-actual comparison: treat the snapshot as all-portfolio (no cash),
  // and run the loop from startYear. All age/inflation math stays relative to baseYear.
  const anchored  = opts.startPort != null;
  const startPort = anchored ? opts.startPort : (gl.invested || 0);
  let cashVal     = anchored ? 0 : gl.cash;
  const startYear = gl.baseYear;
  const loopStart = opts.startYear != null ? opts.startYear : gl.baseYear;
  const endYear   = startYear+(gl.lifeExp-gl.currentAge);
  const retYear   = startYear+(sc.retAge-gl.currentAge);
  const years=[],values=[],fireNums=[],allocations=[],rows=[];
  let portfolio = startPort;
  let costBasis = startPort*(1-gl.gainFrac);
  const off = gl.partnerAgeOff || 0;           // partner's age = your age + off
  let gainFracAtRet = null;                    // tracked gain fraction when retirement starts
  let infeasibleYear = null;                   // first year portfolio+cash can't fund the plan
  // Two-person model: the partner's own portfolio runs alongside yours on the
  // same return path, with its own cost basis. Her shortfalls are flagged, never
  // moved onto your portfolio.
  const two  = isTwoPerson(gl);
  const twoP = two && sc.hasPartner;
  let herPort  = twoP ? (gl.partnerPortfolio || 0) : 0;
  let herBasis = herPort*(1 - (gl.partnerGainFrac || 0));
  let partnerInfeasibleYear = null;
  let hhGainFracAtRet = null;                  // combined (you + partner) gain fraction at retirement
  const herValues = [], herDrawByT = {}, fireNumMult = [];

  // mortgage amortisation
  const monthlyMortgage = sc.hasProp ? mortgageAnnual(gl)/12 : 0;

  // child cost helper: annual cost in year yr
  function childCostInYear(yr) {
    if (!sc.hasChild) return 0;
    const childAge = yr - gl.childBirthYear;
    if (childAge < 0 || childAge >= gl.childCostUntilAge) return 0;
    const t = yr - startYear;
    return gl.childCostYearly * Math.pow(1+gl.inflation, t);
  }

  // income helper: handles parental leave
  function incomeInYear(yr, baseAnnInc, infl) {
    if (!sc.hasChild) return baseAnnInc;
    const birthYr = gl.childBirthYear;
    if (yr !== birthYr) return baseAnnInc;
    // In birth year: months of leave at reduced income (inflation-adjusted like
    // all other amounts), rest at full salary
    const leaveMonths = Math.min(12, gl.childMaternityMonths);
    const fullMonths  = 12 - leaveMonths;
    const monthlyBase = baseAnnInc / 12;
    return fullMonths * monthlyBase + leaveMonths * gl.childMaternityIncome * infl;
  }

  // real past income/spending overrides (anchored plan curve only): carries the
  // most recent defined monthly value forward until the next snapshot redefines it
  function pastOverride(yr) {
    if (!anchored || !opts.history) return null;
    let inc = null, sp = null;
    for (const h of opts.history) {
      if (h.year <= yr) { if (h.income != null) inc = h.income; if (h.spend != null) sp = h.spend; }
    }
    return { inc, sp };
  }

  for (let yr = loopStart; yr <= endYear; yr++) {
    const age  = gl.currentAge+(yr-startYear);
    const t    = yr-startYear;
    const infl = Math.pow(1+gl.inflation,t);
    const baseSpend = two && !sc.hasPartner
      ? gl.samPersonalRet + gl.soloShared
      : gl.spendRet*(sc.hasPartner ? gl.partnerSpendMult : 1);
    let annRetSpend = baseSpend*12*infl;

    const sNow=gl.stockAlloc, sRet=1-gl.bondAllocRet;
    const sf = age>=sc.retAge ? sRet : sNow+(sRet-sNow)*Math.max(0,Math.min(1,t/Math.max(1,sc.retAge-gl.currentAge)));
    allocations.push(Math.round(sf*100));
    // Monte Carlo: when a sampled return sequence is injected (opts.returnSeq),
    // blend the drawn stock/bond returns by this year's glide-path allocation.
    // Otherwise fall back to the deterministic glide-path return — unchanged.
    const r = (opts.returnSeq && opts.returnSeq[t])
      ? sf*opts.returnSeq[t].stock + (1-sf)*opts.returnSeq[t].bond
      : portReturnAt(gl,age,sc.retAge);

    // Capture the gain fraction the portfolio actually has when retirement starts;
    // the FIRE target's tax gross-up is priced with it after the loop.
    if (gainFracAtRet===null && yr>=retYear) {
      gainFracAtRet = portfolio>0 ? Math.max(0,Math.min(1,(portfolio-costBasis)/portfolio)) : gl.gainFrac;
      if (twoP) {
        const tot = portfolio + herPort;
        hhGainFracAtRet = tot>0 ? clamp01((tot-costBasis-herBasis)/tot) : gl.gainFrac;
      }
    }

    // Two-person: start-of-year values drive this year's share (no iteration).
    // Your income for the share after retirement = pension + portfolio × SWR ×
    // netFrac (SWR even in fixed mode); hers adds her draw once she stopped work.
    let herDraw = 0, samDrawStart = 0;
    if (twoP) {
      const gfH = herPort>0 ? clamp01((herPort-herBasis)/herPort) : 0;
      if (age+off >= gl.partnerRetAge) herDraw = herPort*gl.swr*Math.max(0.001, 1-gfH*gl.taxRate);
      herDrawByT[t] = herDraw;
      const gfS = portfolio>0 ? clamp01((portfolio-costBasis)/portfolio) : 0;
      samDrawStart = Math.max(0, portfolio)*gl.swr*Math.max(0.001, 1-gfS*gl.taxRate);
    }
    let tp = null;                             // this year's two-person ledger

    let fireNum = null;   // pre-retirement & %-of-portfolio years backfilled after the loop
    if (yr>=retYear && gl.wdMode!=="swr") {
      const gainFracNow = portfolio>0 ? Math.max(0,Math.min(1,(portfolio-costBasis)/portfolio)) : 0;
      const postTaxMult = 1/Math.max(0.001,1-gainFracNow*gl.taxRate);
      // two-person targets need the partner's future draws: priced after the loop
      if (twoP) fireNumMult[fireNums.length] = { age, mult: postTaxMult };
      else fireNum = computeFireTarget(age,sc,gl,postTaxMult);
    }
    fireNums.push(fireNum);

    const windfall = (gl.windfalls||[]).filter(w=>w.yr===yr).reduce((s,w)=>s+w.amt,0);
    const portfolioBefore=portfolio, cashBefore=cashVal;
    const portGrowth=Math.round(portfolio*r), cashGrowth=Math.round(cashVal*gl.cashReturn);
    const row={yr,age,phase:yr<retYear?"acc":"ret",portReturn:portGrowth,cashReturn:cashGrowth,windfall,
      income:0,spending:0,netFlow:0,pension:0,withdrawal:0,taxPaid:0,childCost:0,
      cashVal:cashBefore,mortgagePayment:0,rentSavings:0,extraCost:0,partnerPension:0};

    if (yr<retYear) {
      const ov = (anchored && yr < gl.baseYear) ? pastOverride(yr) : null;
      let annInc;
      if (ov && ov.inc != null) {
        annInc = ov.inc*12; // real past income (nominal) — overrides all income logic
      } else {
        annInc = sc.income*12*infl;
        if (sc.chgYear!==null && yr>=sc.chgYear && sc.chgInc!==null) annInc=sc.chgInc*12*infl;
        annInc = incomeInYear(yr, annInc, infl);
        // partner income until the partner retires; partner pension once they reach pension age
        // simple model only: the two-person model keeps her income on her side
        if (sc.hasPartner && !two && age+off < gl.partnerRetAge) annInc += gl.partnerInc*12*infl;
        if (sc.hasPartner && !two && age+off >= gl.partnerPensionAge) { const ppAcc=gl.partnerPension*12*infl; annInc+=ppAcc; row.partnerPension=Math.round(ppAcc); }
      }
      let annSpendNow, childCost;
      if (ov && ov.sp != null) {
        annSpendNow = ov.sp*12; childCost = 0; // real past spending (includes living costs)
      } else if (twoP) {
        tp = twoPersonCost(yr, sc, gl, annInc, herDraw, false);
        annSpendNow = tp.samPersonal + tp.shared - tp.child - tp.mortgage + tp.rentSaved;
        childCost   = tp.child;
      } else if (two) {
        annSpendNow = (gl.samPersonalNow + gl.soloShared)*12*infl;
        childCost   = childCostInYear(yr);
      } else {
        annSpendNow = gl.spendNow*12*infl*(sc.hasPartner ? gl.partnerSpendMult : 1);
        childCost   = childCostInYear(yr);
      }
      // property
      let extraCost=0, mortgageAnn=0, rentSavingsAnn=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { extraCost=gl.propPrice*(gl.propDownPct+gl.propTxCostPct); row.extraCost=extraCost; }
        if (yr>=gl.propBuyYear && yr<gl.propBuyYear+gl.propMortgageTerm) { mortgageAnn=monthlyMortgage*12; row.mortgagePayment=Math.round(mortgageAnn); }
        if (yr>=gl.propBuyYear) { rentSavingsAnn=gl.propRentSaved*12*infl; row.rentSavings=Math.round(rentSavingsAnn); }
      }
      const netFlow = tp
        ? annInc - tp.samCost - extraCost          // your net cost = personal + shared − her contribution
        : annInc-annSpendNow-childCost-extraCost-mortgageAnn+rentSavingsAnn;
      cashVal = cashVal*(1+gl.cashReturn);
      let portEnd = portfolio*(1+r)+netFlow+windfall;
      if (portEnd < 0) {
        // Deficit larger than the portfolio: cover the remainder from cash instead
        // of silently writing it off. If cash runs out too, the plan is underfunded.
        cashVal += portEnd; portEnd = 0;
        if (cashVal < 0) { if (infeasibleYear===null) infeasibleYear = yr; cashVal = 0; }
      }
      portfolio = portEnd;
      if (netFlow>0) costBasis+=netFlow;
      costBasis+=windfall;
      if (netFlow<0 && portfolioBefore>0) {
        const pag=portfolioBefore*(1+r)+windfall;
        const fd=pag>0?Math.min(1,-netFlow/pag):0;
        costBasis=Math.max(0,costBasis*(1-fd));
      }
      row.income=Math.round(annInc); row.spending=Math.round(annSpendNow); row.childCost=Math.round(childCost); row.netFlow=Math.round(netFlow);

    } else {
      cashVal=cashVal*(1+gl.cashReturn);
      const portAfterGrowth=portfolio*(1+r)+windfall;
      if (windfall>0) costBasis+=windfall;
      const gainFracNow=portAfterGrowth>0?Math.max(0,Math.min(1,(portAfterGrowth-costBasis)/portAfterGrowth)):0;
      const netFrac=Math.max(0.001,1-gainFracNow*gl.taxRate);   // € received per € withdrawn
      // Non-portfolio income: state pension, partner pension, and partner salary —
      // the partner keeps earning after YOUR retirement until their own retirement age.
      const pAnn = age>=gl.pensionAge ? gl.pensionAmt*12*infl : 0;
      let partnerPensionAnn=0, partnerSalAnn=0;
      if (sc.hasPartner && !two && age+off>=gl.partnerPensionAge) partnerPensionAnn=gl.partnerPension*12*infl;
      if (sc.hasPartner && !two && age+off<gl.partnerRetAge)      partnerSalAnn=gl.partnerInc*12*infl;

      // property cash flows continue into retirement
      let mortgageAnnRet=0, rentSavingsAnnRet=0, purchaseCost=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { purchaseCost=gl.propPrice*(gl.propDownPct+gl.propTxCostPct); row.extraCost=purchaseCost; }
        if (yr>=gl.propBuyYear && yr<gl.propBuyYear+gl.propMortgageTerm) { mortgageAnnRet=monthlyMortgage*12; row.mortgagePayment=Math.round(mortgageAnnRet); }
        if (yr>=gl.propBuyYear) { rentSavingsAnnRet=gl.propRentSaved*12*infl; row.rentSavings=Math.round(rentSavingsAnnRet); }
      }

      let childCost=childCostInYear(yr);
      let budget=Math.max(0, annRetSpend+childCost+mortgageAnnRet-rentSavingsAnnRet);
      if (twoP) {
        // your net cost, with your share-income = pension + start-of-year sustainable draw
        tp = twoPersonCost(yr, sc, gl, pAnn + samDrawStart, herDraw, true);
        annRetSpend = tp.samPersonal + tp.shared - tp.child - tp.mortgage + tp.rentSaved;
        childCost = tp.child;
        budget = Math.max(0, tp.samCost);
      }
      const otherInc=pAnn+partnerPensionAnn+partnerSalAnn;
      let gross, surplus=0;

      if (gl.wdMode==="swr") {
        // %-of-portfolio strategy: SWR% of the portfolio is *available* each year,
        // but only what the budget needs (after other income) is actually sold —
        // no needless realisation of gains; the rest stays invested. The adequacy
        // metrics (swrIncome/swrTarget, used by Monte Carlo) use the full draw.
        const potentialGross=portAfterGrowth*gl.swr;
        const needGross=Math.max(0,budget-otherInc)/netFrac;
        gross=Math.min(potentialGross,needGross);
        if (purchaseCost>0) gross+=purchaseCost/netFrac;   // one-time purchase is funded regardless
        surplus=Math.max(0,otherInc-budget);               // pension/partner income beyond budget is saved
        row.swrIncome=Math.round(potentialGross*netFrac+otherInc);
        row.swrTarget=Math.round(budget);
      } else {
        const needNet=budget+purchaseCost-otherInc;        // net cash the portfolio must produce
        if (needNet>0) { gross=needNet/netFrac; }
        else { gross=0; surplus=-needNet; }                // income exceeds spending → reinvest
      }

      if (gross<=portAfterGrowth) {
        portfolio=portAfterGrowth-gross;
      } else {
        cashVal=cashVal-(gross-portAfterGrowth);
        portfolio=0;
        if (cashVal<0) { if (infeasibleYear===null) infeasibleYear=yr; cashVal=0; }
      }
      const fractionSold=portAfterGrowth>0?Math.min(1,gross/portAfterGrowth):0;
      costBasis=Math.max(0,costBasis*(1-fractionSold));
      if (surplus>0) { portfolio+=surplus; costBasis+=surplus; }
      row.income=Math.round(partnerSalAnn);
      row.spending=Math.round(annRetSpend); row.childCost=Math.round(childCost);
      row.pension=Math.round(pAnn); row.partnerPension=Math.round(partnerPensionAnn);
      row.withdrawal=Math.round(gross); row.taxPaid=Math.round(gross*gainFracNow*gl.taxRate);
    }

    // Partner's own portfolio (two-person model): salary + pension − her personal
    // spending − her contribution. Surplus is invested (adds to basis); a deficit
    // is sold with the CGT gross-up; an empty portfolio flags partnerInfeasibleYear.
    if (twoP) {
      const her = tp ? tp.her : partnerIncomeAt(yr, gl, herDraw);
      const contrib = tp ? tp.contrib : 0;     // real past spending override: no split
      const herBefore = herPort;
      const herGfStart = herPort>0 ? clamp01((herPort-herBasis)/herPort) : 0;
      const herPAG = herPort*(1+r);
      const herNet = her.salary + her.pension - (gl.partnerPersonal||0)*12*infl - contrib;
      let herGross = 0;
      if (herNet >= 0) { herPort = herPAG + herNet; herBasis += herNet; }
      else {
        const gfN = herPAG>0 ? clamp01((herPAG-herBasis)/herPAG) : 0;
        herGross = -herNet/Math.max(0.001, 1-gfN*gl.taxRate);
        if (herGross <= herPAG) { herBasis = Math.max(0, herBasis*(1-herGross/herPAG)); herPort = herPAG-herGross; }
        else { herPort = 0; herBasis = 0; if (partnerInfeasibleYear===null) partnerInfeasibleYear = yr; }
      }
      herValues.push(herBefore);
      row.partnerContrib = Math.round(contrib);
      row.partnerShare = tp ? tp.share : 0;
      row.samShareIncome = Math.round(tp ? tp.samInc : 0);
      row.partnerIncome = Math.round(her.salary + her.pension);
      row.partnerDraw = Math.round(herDraw);
      row.partnerWithdrawal = Math.round(herGross);
      row.partnerPortfolio = Math.round(herBefore);
      row.partnerGainFrac = herGfStart;
    }

    years.push(yr); values.push(portfolioBefore+cashBefore); rows.push(row);
  }

  // FIRE target priced with the tracked gain fraction at retirement: the tax
  // gross-up reflects what the portfolio will actually owe in CGT then, not today.
  if (gainFracAtRet===null) gainFracAtRet = gl.gainFrac;
  const taxMultRet = 1/Math.max(0.001,1-gainFracAtRet*gl.taxRate);
  const tOpts = twoP ? { herDraw: herDrawByT } : undefined;
  const fireAtRetirement = computeFireTarget(sc.retAge,sc,gl,taxMultRet,tOpts);
  const fireTargetAdj = gl.wdMode==="swr"
    ? computeFireTarget(sc.retAge,sc,gl,taxMultRet,{otherIncomeCredit:true, ...(tOpts||{})})
    : fireAtRetirement;
  fireNumMult.forEach((fm, i) => { if (fm) fireNums[i] = computeFireTarget(fm.age, sc, gl, fm.mult, tOpts); });
  for (let i=0;i<fireNums.length;i++) if (fireNums[i]===null) fireNums[i]=fireAtRetirement;

  const out = {years,values,fireNums,retYear,allocations,rows,
          fireTarget:fireAtRetirement, fireTargetAdj, gainFracAtRet,
          infeasibleYear, finalNetWorth: portfolio+cashVal};
  if (twoP) {
    // Full household FIRE: combined net worth (you + partner + cash) vs the
    // household target, priced at the combined gain fraction at retirement.
    const gfC = hhGainFracAtRet != null ? hhGainFracAtRet : gl.gainFrac;
    const target = computeHouseholdTarget(sc.retAge, sc, gl, 1/Math.max(0.001, 1-gfC*gl.taxRate));
    const iRet = Math.min(Math.max(0, retYear - loopStart), values.length - 1);
    const nwAtRet = values[iRet] + herValues[iRet];
    out.household = { target, nwAtRet, funded: nwAtRet >= target, gainFracAtRet: gfC };
    out.partner = { values: herValues, drawByT: herDrawByT, finalPortfolio: herPort };
    out.partnerInfeasibleYear = partnerInfeasibleYear;
  }
  return out;
}

// ── PLAN vs ACTUAL ───────────────────────────────────────────────────────────
// Builds the "plan" curve: the projection re-anchored at the earliest net-worth
// snapshot, grown forward with the scenario's assumptions. Returns null when
// there is no usable past history to compare against. `history` is the list of
// net-worth snapshots ([{year,val,income,spend}]), passed in to keep the engine pure.
export function buildPlanProj(sc, gl, history) {
  if (!history || !history.length) return null;
  const sorted = history.filter(r => r.val > 0 && r.year > 0).sort((a,b)=>a.year-b.year);
  if (!sorted.length) return null;
  const first = sorted[0];
  if (first.year >= gl.baseYear) return null; // nothing in the past to compare
  return project(sc, gl, { startYear: first.year, startPort: first.val, history: sorted });
}

// Position-based "vs Plan": the first calendar year the plan curve expected you
// to reach TODAY'S actual net worth. Ahead/behind = that year − baseYear.
// Measured on the steep accumulation slope, so it stays stable — unlike the old
// FIRE-line-crossing comparison, which exploded into huge year-gaps whenever the
// curves grew only a few %/yr near the (horizontal) target line.
export function planYearsAhead(planProj, gl) {
  if (!planProj) return null;
  const nowNW = (gl.invested || 0) + gl.cash;
  for (let i = 0; i < planProj.values.length; i++) {
    if (planProj.values[i] >= nowNW) return { years: planProj.years[i] - gl.baseYear, open: false };
  }
  // plan never reaches today's net worth within the horizon — at least this far ahead
  return { years: planProj.years[planProj.years.length - 1] - gl.baseYear, open: true };
}
