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

// Full annual retirement budget in the first year of retirement at fromAge:
// base spending (with partner multiplier) plus child costs, mortgage and rent
// savings active in that year. Used by the %-of-portfolio FIRE target, the
// scenario-card target, and (per year) the Monte Carlo funding ratio.
export function yearOneBudget(fromAge, sc, gl) {
  const tFrom = fromAge - gl.currentAge;
  const fromYear = gl.baseYear + tFrom;
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

    let fireNum = null;   // pre-retirement & %-of-portfolio years backfilled after the loop
    if (yr>=retYear && gl.wdMode!=="swr") {
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
        if (sc.hasPartner && age+off < gl.partnerRetAge) annInc += gl.partnerInc*12*infl;
        if (sc.hasPartner && age+off >= gl.partnerPensionAge) { const ppAcc=gl.partnerPension*12*infl; annInc+=ppAcc; row.partnerPension=Math.round(ppAcc); }
      }
      let annSpendNow, childCost;
      if (ov && ov.sp != null) {
        annSpendNow = ov.sp*12; childCost = 0; // real past spending (includes living costs)
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
      const netFlow = annInc-annSpendNow-childCost-extraCost-mortgageAnn+rentSavingsAnn;
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
      if (sc.hasPartner && age+off>=gl.partnerPensionAge) partnerPensionAnn=gl.partnerPension*12*infl;
      if (sc.hasPartner && age+off<gl.partnerRetAge)      partnerSalAnn=gl.partnerInc*12*infl;

      // property cash flows continue into retirement
      let mortgageAnnRet=0, rentSavingsAnnRet=0, purchaseCost=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { purchaseCost=gl.propPrice*(gl.propDownPct+gl.propTxCostPct); row.extraCost=purchaseCost; }
        if (yr>=gl.propBuyYear && yr<gl.propBuyYear+gl.propMortgageTerm) { mortgageAnnRet=monthlyMortgage*12; row.mortgagePayment=Math.round(mortgageAnnRet); }
        if (yr>=gl.propBuyYear) { rentSavingsAnnRet=gl.propRentSaved*12*infl; row.rentSavings=Math.round(rentSavingsAnnRet); }
      }

      const childCost=childCostInYear(yr);
      const budget=Math.max(0, annRetSpend+childCost+mortgageAnnRet-rentSavingsAnnRet);
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

    years.push(yr); values.push(portfolioBefore+cashBefore); rows.push(row);
  }

  // FIRE target priced with the tracked gain fraction at retirement: the tax
  // gross-up reflects what the portfolio will actually owe in CGT then, not today.
  if (gainFracAtRet===null) gainFracAtRet = gl.gainFrac;
  const taxMultRet = 1/Math.max(0.001,1-gainFracAtRet*gl.taxRate);
  const fireAtRetirement = computeFireTarget(sc.retAge,sc,gl,taxMultRet);
  const fireTargetAdj = gl.wdMode==="swr"
    ? computeFireTarget(sc.retAge,sc,gl,taxMultRet,{otherIncomeCredit:true})
    : fireAtRetirement;
  for (let i=0;i<fireNums.length;i++) if (fireNums[i]===null) fireNums[i]=fireAtRetirement;

  return {years,values,fireNums,retYear,allocations,rows,
          fireTarget:fireAtRetirement, fireTargetAdj, gainFracAtRet,
          infeasibleYear, finalNetWorth: portfolio+cashVal};
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
