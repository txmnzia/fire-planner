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

// ── TWO-PERSON HOUSEHOLD MODEL ───────────────────────────────────────────────
// gl.partnerModel === 'two': shared costs are split pro rata to the two net
// incomes; each person has personal spending; the partner's surplus is hers
// (her own portfolio), never household income for your portfolio. Anything else
// (missing, 'simple') is the original multiplier model, unchanged.
export function isTwoModel(gl) { return gl.partnerModel === 'two'; }

// Partner's share of shared costs: her net income over the two net incomes,
// clamped to [shareMin, shareMax]; 0 when neither has income.
export function partnerShare(samInc, herInc, gl) {
  const s = Math.max(0, samInc || 0), h = Math.max(0, herInc || 0);
  if (s + h <= 0) return 0;
  const lo = gl.shareMin != null ? gl.shareMin : 0;
  const hi = gl.shareMax != null ? gl.shareMax : 0.5;
  return Math.min(hi, Math.max(lo, h / (s + h)));
}

// The two-person budget for calendar year yr (annual, nominal €). `retired`
// selects the now/retirement spending inputs (your retirement, not hers).
// Shared costs = joint spending (or soloShared when the scenario has no
// partner) + child costs + mortgage − rent saved, floored at 0, split by
// `share`. samCost is what your portfolio/salary must carry; household is the
// whole two-person cost (used by Household FIRE). One definition for the
// projection loop, yearOneBudget, cards and targets.
export function householdBudget(yr, sc, gl, share, retired) {
  const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
  const personal = (retired ? gl.samPersonalRet : gl.samPersonalNow)*12*infl;
  let child = 0;
  if (sc.hasChild) {
    const ca = yr - gl.childBirthYear;
    if (ca >= 0 && ca < gl.childCostUntilAge) child = gl.childCostYearly*infl;
  }
  let mortgage = 0, rent = 0;
  if (sc.hasProp) {
    if (yr >= gl.propBuyYear && yr < gl.propBuyYear + gl.propMortgageTerm) mortgage = mortgageAnnual(gl);
    if (yr >= gl.propBuyYear) rent = gl.propRentSaved*12*infl;
  }
  const base = (sc.hasPartner ? (retired ? gl.sharedRet : gl.sharedNow) : gl.soloShared)*12*infl;
  const shared = Math.max(0, base + child + mortgage - rent);
  const s = sc.hasPartner ? (share || 0) : 0;
  const contribution = s*shared;
  const partnerPersonal = sc.hasPartner ? gl.partnerPersonal*12*infl : 0;
  return { personal, base, child, mortgage, rent, shared, share: s, contribution,
           samCost: personal + shared - contribution,
           household: personal + partnerPersonal + shared };
}

// PV at the start of year 0 of a list of nominal annual flows (flow j lands at
// the end of year j), same timing convention as annuityPV.
export function pvStream(flows, r) {
  let pv = 0;
  for (let j = 0; j < flows.length; j++) pv += flows[j]/Math.pow(1+r, j+1);
  return pv;
}

// Full annual retirement budget in the first year of retirement at fromAge:
// base spending (with partner multiplier) plus child costs, mortgage and rent
// savings active in that year. Used by the %-of-portfolio FIRE target, the
// scenario-card target, and (per year) the Monte Carlo funding ratio.
// Two-person model: your net cost from householdBudget at the partner share
// `share` that year (project() reports it as two.shareAtRet).
export function yearOneBudget(fromAge, sc, gl, share) {
  const tFrom = fromAge - gl.currentAge;
  const fromYear = gl.baseYear + tFrom;
  if (isTwoModel(gl)) return householdBudget(fromYear, sc, gl, share, true).samCost;
  const inflF = Math.pow(1+gl.inflation, tFrom);
  let budget = gl.spendRet*(sc.hasPartner ? gl.partnerSpendMult : 1)*12*inflF;
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
  const baseSpend = gl.spendRet * (sc.hasPartner ? gl.partnerSpendMult : 1);
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

  // Two-person model state (inert in simple mode). The partner's portfolio runs
  // its own loop on the same return path, with its own cost basis.
  const two   = isTwoModel(gl);
  const herOn = two && sc.hasPartner;
  let herPort  = herOn ? (gl.partnerPortfolio || 0) : 0;
  let herBasis = herPort*(1 - (gl.partnerGainFrac || 0));
  let partnerInfeasibleYear = null;
  let gainFracHHAtRet = null;                  // combined (you + partner) gain fraction at retirement
  const ledger = [];                           // per-year two-mode flows, aligned with rows[]
  const clamp01 = x => Math.max(0, Math.min(1, x));
  // Partner income at start-of-year values: salary until HER retirement age,
  // pension from HER pension age, plus her sustainable draw once she has
  // stopped working (used for the share only; her real withdrawals are needs-based).
  function herIncome(age, infl) {
    const ha  = age + off;
    const sal = ha < gl.partnerRetAge ? gl.partnerInc*12*infl : 0;
    const pen = ha >= gl.partnerPensionAge ? gl.partnerPension*12*infl : 0;
    const gf  = herPort > 0 ? clamp01((herPort - herBasis)/herPort) : 0;
    const draw = ha >= gl.partnerRetAge ? herPort*gl.swr*Math.max(0.001, 1 - gf*gl.taxRate) : 0;
    return { sal, pen, draw, cash: sal + pen, forShare: sal + pen + draw };
  }

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
    const baseSpend = gl.spendRet*(sc.hasPartner ? gl.partnerSpendMult : 1);
    const annRetSpend = baseSpend*12*infl;

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
    }
    if (two && gainFracHHAtRet===null && yr>=retYear) {
      const tot = portfolio + herPort;
      gainFracHHAtRet = tot>0 ? clamp01((tot - costBasis - herBasis)/tot) : gl.gainFrac;
    }
    // two mode: start-of-year values for the share and the per-year targets
    const gfStart = portfolio>0 ? Math.max(0,Math.min(1,(portfolio-costBasis)/portfolio)) : 0;
    const hi = two ? herIncome(age, infl) : null;
    const herPortBefore = herPort, herBasisBefore = herBasis;
    let hb = null;        // householdBudget for this year (two mode)

    let fireNum = null;   // pre-retirement & %-of-portfolio years backfilled after the loop
    if (yr>=retYear && gl.wdMode!=="swr" && !two) {   // two mode: priced after the loop
      const gainFracNow = portfolio>0 ? Math.max(0,Math.min(1,(portfolio-costBasis)/portfolio)) : 0;
      const postTaxMult = 1/Math.max(0.001,1-gainFracNow*gl.taxRate);
      fireNum = computeFireTarget(age,sc,gl,postTaxMult);
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
        // (simple model only — in the two-person model her income is hers, see below)
        if (!two && sc.hasPartner && age+off < gl.partnerRetAge) annInc += gl.partnerInc*12*infl;
        if (!two && sc.hasPartner && age+off >= gl.partnerPensionAge) { const ppAcc=gl.partnerPension*12*infl; annInc+=ppAcc; row.partnerPension=Math.round(ppAcc); }
      }
      let annSpendNow, childCost;
      if (ov && ov.sp != null) {
        annSpendNow = ov.sp*12; childCost = 0; // real past spending (includes living costs)
      } else if (two) {
        // your net cost: personal + shared − her pro rata contribution (share
        // from your salary vs her start-of-year income)
        hb = householdBudget(yr, sc, gl, partnerShare(annInc, hi.forShare, gl), false);
        annSpendNow = hb.personal + hb.base;   // display: what you pay before her contribution
        childCost   = hb.child;
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
      const netFlow = hb
        ? annInc-hb.samCost-extraCost      // two mode: same flows, priced by householdBudget (purchase stays on you)
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
      if (!two && sc.hasPartner && age+off>=gl.partnerPensionAge) partnerPensionAnn=gl.partnerPension*12*infl;
      if (!two && sc.hasPartner && age+off<gl.partnerRetAge)      partnerSalAnn=gl.partnerInc*12*infl;
      if (two) {
        // your income for the share: state pension + sustainable draw from the
        // start-of-year portfolio, net of CGT (SWR used in both withdrawal modes)
        const samInc = pAnn + portfolioBefore*gl.swr*Math.max(0.001, 1 - gfStart*gl.taxRate);
        hb = householdBudget(yr, sc, gl, partnerShare(samInc, hi.forShare, gl), true);
      }

      // property cash flows continue into retirement
      let mortgageAnnRet=0, rentSavingsAnnRet=0, purchaseCost=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { purchaseCost=gl.propPrice*(gl.propDownPct+gl.propTxCostPct); row.extraCost=purchaseCost; }
        if (yr>=gl.propBuyYear && yr<gl.propBuyYear+gl.propMortgageTerm) { mortgageAnnRet=monthlyMortgage*12; row.mortgagePayment=Math.round(mortgageAnnRet); }
        if (yr>=gl.propBuyYear) { rentSavingsAnnRet=gl.propRentSaved*12*infl; row.rentSavings=Math.round(rentSavingsAnnRet); }
      }

      const childCost=childCostInYear(yr);
      const budget=hb ? hb.samCost : Math.max(0, annRetSpend+childCost+mortgageAnnRet-rentSavingsAnnRet);
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
      row.spending=Math.round(hb ? hb.personal+hb.base : annRetSpend); row.childCost=Math.round(childCost);
      row.pension=Math.round(pAnn); row.partnerPension=Math.round(partnerPensionAnn);
      row.withdrawal=Math.round(gross); row.taxPaid=Math.round(gross*gainFracNow*gl.taxRate);
    }

    if (two) {
      const retired = yr >= retYear;
      const share = hb ? hb.share : 0, contribution = hb ? hb.contribution : 0;
      // partner's own portfolio: same return path; surplus invested (adds to
      // basis), deficit sold with CGT gross-up; an empty portfolio is flagged,
      // never silently moved onto yours (I5 applied to her side).
      let herTax = 0;
      if (herOn) {
        const herNet = hi.cash - gl.partnerPersonal*12*infl - contribution;
        const herAG  = herPort*(1+r);
        if (herNet >= 0) { herPort = herAG + herNet; herBasis += herNet; }
        else {
          const gfH = herAG>0 ? clamp01((herAG - herBasis)/herAG) : 0;
          const grossH = -herNet/Math.max(0.001, 1 - gfH*gl.taxRate);
          if (grossH > herAG) {
            if (partnerInfeasibleYear===null) partnerInfeasibleYear = yr;
            herTax = herAG*gfH*gl.taxRate; herPort = 0; herBasis = 0;
          } else {
            herTax = grossH*gfH*gl.taxRate;
            herBasis = Math.max(0, herBasis*(1 - grossH/herAG)); herPort = herAG - grossH;
          }
        }
      }
      row.partnerContribution = Math.round(contribution);
      row.partnerShare = share;
      row.partnerPort = Math.round(herPortBefore);
      row.partnerBasis = Math.round(herBasisBefore);
      row.partnerTax = Math.round(herTax);
      // flows for the post-loop targets (household = both stopped working, from your retirement)
      const hbR = retired ? (hb || householdBudget(yr, sc, gl, share, true)) : null;
      ledger.push({ yr, age, retired, share, gfStart,
        shared: hb ? hb.shared : 0, samCost: hb ? hb.samCost : 0, contribution,
        purchase: (sc.hasProp && yr===gl.propBuyYear) ? gl.propPrice*(gl.propDownPct+gl.propTxCostPct) : 0,
        samPen: age>=gl.pensionAge ? gl.pensionAmt*12*infl : 0,
        herPen: (herOn && age+off>=gl.partnerPensionAge) ? gl.partnerPension*12*infl : 0,
        household: hbR ? hbR.household : 0,
        herPort: herPortBefore, herBasis: herBasisBefore, herTax, herIncome: hi });
    }

    years.push(yr); values.push(portfolioBefore+cashBefore); rows.push(row);
  }

  // FIRE target priced with the tracked gain fraction at retirement: the tax
  // gross-up reflects what the portfolio will actually owe in CGT then, not today.
  if (gainFracAtRet===null) gainFracAtRet = gl.gainFrac;
  const taxMultRet = 1/Math.max(0.001,1-gainFracAtRet*gl.taxRate);
  let fireAtRetirement, fireTargetAdj, twoOut = null;
  if (two) {
    twoOut = twoModeTargets(sc, gl, ledger, values, retYear - loopStart, taxMultRet, gainFracHHAtRet, herOn, fireNums);
    fireAtRetirement = twoOut.partial.target;
    fireTargetAdj    = twoOut.partial.targetAdj;
    twoOut.partnerValues = ledger.map(L => L.herPort);
    twoOut.partnerFinal  = herOn ? herPort : 0;
    twoOut.partnerInfeasibleYear = partnerInfeasibleYear;
  } else {
    fireAtRetirement = computeFireTarget(sc.retAge,sc,gl,taxMultRet);
    fireTargetAdj = gl.wdMode==="swr"
      ? computeFireTarget(sc.retAge,sc,gl,taxMultRet,{otherIncomeCredit:true})
      : fireAtRetirement;
  }
  for (let i=0;i<fireNums.length;i++) if (fireNums[i]===null) fireNums[i]=fireAtRetirement;

  const out = {years,values,fireNums,retYear,allocations,rows,
          fireTarget:fireAtRetirement, fireTargetAdj, gainFracAtRet,
          infeasibleYear, finalNetWorth: portfolio+cashVal};
  if (two) { out.two = twoOut; out.partnerInfeasibleYear = partnerInfeasibleYear; }
  return out;
}

// Two-person model targets, priced after the loop from the per-year ledger
// (the share depends on your projected draw, so the stream is only known then).
// Partial FIRE (you): PV of your net cost from your retirement.
//   fixed mode — year-by-year DCF of max(0, samCost + purchase − your pension).
//   % mode     — year-one cost ÷ SWR (as today) PLUS the PV of any later rise in
//                your cost caused by her share falling (she retires / pension
//                ratio). Stricter than "year-one only": the headline never
//                ignores a known future increase (I4 spirit). Falls in your cost
//                and pensions starting later are credited in targetAdj only.
// Household FIRE: both stop working in your retirement year; PV of the whole
// household cost net of both pensions, at the combined gain fraction, compared
// with combined net worth. Fixed: year-by-year DCF; %: year-one ÷ SWR, pensions
// starting later credited in targetAdj only.
function twoModeTargets(sc, gl, ledger, values, retIdx, taxMultRet, gainFracHH, herOn, fireNums) {
  const k0 = Math.min(Math.max(0, retIdx), ledger.length - 1);
  const L0 = ledger[k0];
  const n  = Math.max(0, gl.lifeExp - L0.age);
  const tail = ledger.slice(k0, k0 + n);
  const rRet = portReturnAt(gl, sc.retAge, sc.retAge);
  const pos = x => Math.max(0, x);
  const partialFixedAt = (k, tm) => {
    const a = ledger[k].age, m = Math.max(0, gl.lifeExp - a);
    const flows = ledger.slice(k, k + m).map(L => pos(L.samCost + L.purchase - L.samPen)*tm);
    return Math.round(pvStream(flows, portReturnAt(gl, a, sc.retAge)));
  };

  let target = 0, targetAdj = 0, risePV = 0, fallPV = 0;
  if (n > 0) {
    if (gl.wdMode === 'swr') {
      const base = gl.swr>0 ? pos(L0.samCost - L0.samPen)*taxMultRet/gl.swr : 0;
      const deltas = tail.map(L => (L0.share - L.share)*L.shared);   // >0: you pay more than at retirement
      risePV = pvStream(deltas.map(d => pos(d)*taxMultRet), rRet);
      fallPV = pvStream(deltas.map(d => pos(-d)*taxMultRet), rRet);
      const penLater = L0.samPen > 0 ? 0 : pvStream(tail.map(L => L.samPen*taxMultRet), rRet);
      target    = Math.round(base + risePV);
      targetAdj = Math.round(pos(base + risePV - fallPV - penLater));
    } else {
      target = targetAdj = partialFixedAt(k0, taxMultRet);
      for (let k = k0; k < ledger.length; k++) {
        if (!ledger[k].retired) continue;
        fireNums[k] = partialFixedAt(k, 1/Math.max(0.001, 1 - ledger[k].gfStart*gl.taxRate));
      }
    }
  }

  let household = null;
  if (herOn) {
    const tmHH = 1/Math.max(0.001, 1 - (gainFracHH != null ? gainFracHH : gl.gainFrac)*gl.taxRate);
    let hT = 0, hAdj = 0;
    if (n > 0) {
      if (gl.wdMode === 'swr') {
        const base = gl.swr>0 ? pos(L0.household - L0.samPen - L0.herPen)*tmHH/gl.swr : 0;
        const penLater = (L0.samPen > 0 ? 0 : pvStream(tail.map(L => L.samPen*tmHH), rRet))
                       + (L0.herPen > 0 ? 0 : pvStream(tail.map(L => L.herPen*tmHH), rRet));
        hT = Math.round(base); hAdj = Math.round(pos(base - penLater));
      } else {
        hT = hAdj = Math.round(pvStream(tail.map(L => pos(L.household + L.purchase - L.samPen - L.herPen)*tmHH), rRet));
      }
    }
    household = { target: hT, targetAdj: hAdj, nw: (values[k0] || 0) + L0.herPort,
                  gainFracAtRet: gainFracHH, annualCost: L0.household };
  }

  // card note: her contribution at your retirement, and your cost after the
  // first change in her situation (her retirement or pension start) — today's €
  const inflAt = L => Math.pow(1+gl.inflation, L.yr - gl.baseYear);
  let change = null;
  if (herOn) {
    const off = gl.partnerAgeOff || 0;
    for (let k = k0 + 1; k < ledger.length; k++) {
      const ha = ledger[k].age + off, hp = ledger[k-1].age + off;
      if ((ha >= gl.partnerRetAge && hp < gl.partnerRetAge) || (ha >= gl.partnerPensionAge && hp < gl.partnerPensionAge)) {
        const L = ledger[k];
        change = { year: L.yr, herAge: ha, costMonthlyToday: L.samCost/12/inflAt(L),
                   contribMonthlyToday: L.contribution/12/inflAt(L), share: L.share };
        break;
      }
    }
  }
  return {
    shareAtRet: L0.share,
    partial: { target, targetAdj, risePV: Math.round(risePV), nw: values[k0] || 0, annualCost: L0.samCost },
    household,
    note: herOn ? { herAgeAtRet: L0.age + (gl.partnerAgeOff || 0),
                    contribMonthlyToday: L0.contribution/12/inflAt(L0),
                    costMonthlyToday: L0.samCost/12/inflAt(L0), share: L0.share, change } : null,
  };
}

// ── PARTNER AUTONOMY (two-person model) ──────────────────────────────────────
// Separation check: could the partner cover her solo costs (partnerPersonal +
// soloShared) on her own? While working, from her salary; once she has stopped,
// from her pension plus a fixed 4% draw on her projected portfolio, net of CGT.
// Checkpoints: her age 50, her age 67, and your retirement year. Amounts are
// €/month in today's money; gap = income − cost (negative = short). Her
// portfolio path is the one projected under the couple arrangement.
export const AUTONOMY_SWR = 0.04;
export function partnerAutonomy(proj, sc, gl) {
  if (!proj || !proj.two || !sc.hasPartner) return null;
  const off = gl.partnerAgeOff || 0;
  const t0 = proj.years[0] - gl.baseYear;
  const pv = proj.two.partnerValues;
  const at = (yr, label) => {
    const idx = yr - proj.years[0];
    if (idx < 0 || idx >= proj.years.length) return { label, yr, herAge: gl.currentAge + off + (yr - gl.baseYear), outOfRange: true };
    const t = idx + t0, infl = Math.pow(1+gl.inflation, t), herAge = gl.currentAge + t + off;
    const row = proj.rows[idx] || {};
    const port = pv[idx] || 0;
    const working = herAge < gl.partnerRetAge;
    const pension = herAge >= gl.partnerPensionAge ? gl.partnerPension : 0;   // today's €/mo
    // her gain fraction that year from the projected basis
    const basis = row.partnerBasis != null ? row.partnerBasis : port;
    const gf = port > 0 ? Math.max(0, Math.min(1, (port - basis)/port)) : 0;
    const drawToday = working ? 0 : port*AUTONOMY_SWR*Math.max(0.001, 1 - gf*gl.taxRate)/12/infl;
    const income = working ? gl.partnerInc + pension : pension + drawToday;
    const cost = gl.partnerPersonal + gl.soloShared;
    return { label, yr, herAge, working, portfolio: port, portfolioToday: port/infl,
             income, cost, gap: income - cost, source: working ? 'salary' : 'pension + 4% draw' };
  };
  const yrForHerAge = a => gl.baseYear + (a - off - gl.currentAge);
  return {
    checkpoints: [ at(yrForHerAge(50), 'Her age 50'), at(yrForHerAge(67), 'Her age 67'), at(proj.retYear, 'Your retirement') ],
    partnerInfeasibleYear: proj.two.partnerInfeasibleYear,
    pensionMonthly: gl.partnerPension, pensionAge: gl.partnerPensionAge,
    portfolioNow: pv[Math.max(0, gl.baseYear - proj.years[0])] || 0,
    portfolioAtRet: pv[Math.min(pv.length - 1, Math.max(0, proj.retYear - proj.years[0]))] || 0,
    portfolioEnd: proj.two.partnerFinal,
  };
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
