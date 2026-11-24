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
// ── Buying (v8.13) ──────────────────────────────────────────────────────────
// Monthly annuity payment on P over `months` at an annual rate; balance left after
// paying `pay` for `months`.
function annuityPay(P, rate, months) {
  if (!(months > 0) || !(P > 0)) return 0;
  if (!(rate > 0)) return P/months;
  const mr = rate/12;
  return P*mr*Math.pow(1+mr, months)/(Math.pow(1+mr, months)-1);
}
function balanceAfter(P, rate, pay, months) {
  if (!(rate > 0)) return Math.max(0, P - pay*months);
  const mr = rate/12, g = Math.pow(1+mr, months);
  return Math.max(0, P*g - pay*(g-1)/mr);
}
// The loan: payment while the rate is fixed (pay1, €/yr) and after it (pay2, at
// propRateAfter on the balance left, same end date). Fixed for the whole loan
// when propFixedYears is empty or ≥ the term, or no rate after is given.
export function mortgageSchedule(gl) {
  const P = (gl.propPrice || 0)*(1 - gl.propDownPct), n = (gl.propMortgageTerm || 0)*12;
  const p1 = annuityPay(P, gl.propMortgageRate, n);
  const F = gl.propFixedYears > 0 ? Math.min(n, Math.round(gl.propFixedYears*12)) : n;
  const r2 = gl.propRateAfter;
  if (F >= n || r2 == null || r2 === gl.propMortgageRate) return { principal: P, pay1: p1*12, pay2: p1*12, fixedYears: n/12 };
  const p2 = annuityPay(balanceAfter(P, gl.propMortgageRate, p1, F), r2, n - F);
  return { principal: P, pay1: p1*12, pay2: p2*12, fixedYears: F/12 };
}
// Payment in calendar year yr (nominal €/yr, flat like a real loan); 0 outside the loan.
export function mortgagePaymentAt(gl, yr) {
  if (!(gl.propPrice > 0) || yr < gl.propBuyYear || yr >= gl.propBuyYear + gl.propMortgageTerm) return 0;
  const s = mortgageSchedule(gl);
  return (yr - gl.propBuyYear) < s.fixedYears ? s.pay1 : s.pay2;
}
// Loan left at the start of calendar year yr.
export function mortgageBalanceAt(gl, yr) {
  if (!(gl.propPrice > 0) || yr <= gl.propBuyYear) return yr === gl.propBuyYear ? (gl.propPrice || 0)*(1 - gl.propDownPct) : 0;
  const s = mortgageSchedule(gl), P = s.principal, m = Math.min(gl.propMortgageTerm*12, (yr - gl.propBuyYear)*12);
  const F = s.fixedYears*12;
  if (m <= F) return balanceAfter(P, gl.propMortgageRate, s.pay1/12, m);
  const bF = balanceAfter(P, gl.propMortgageRate, s.pay1/12, F);
  return balanceAfter(bF, gl.propRateAfter ?? gl.propMortgageRate, s.pay2/12, m - F);
}
// Ownership charges + upkeep (today's €/month, inflated) from the purchase year, for good.
export function ownershipAnnual(gl, sc, yr) {
  if (!sc.hasProp || !(gl.propCharges > 0) || yr < gl.propBuyYear) return 0;
  return gl.propCharges*12*Math.pow(1+gl.inflation, yr - gl.baseYear);
}
// Your part of the down payment + buying costs: with your partner she pays her share.
export function purchaseCostFor(gl, sc) {
  const all = (gl.propPrice || 0)*(gl.propDownPct + gl.propTxCostPct);
  return isTwoPerson(gl) && sc.hasPartner ? all*(1 - (gl.propHerShare || 0)) : all;
}
// Your home equity at the start of yr (nominal): the price, growing with inflation
// from the purchase year (no real price growth assumed), minus the loan left.
export function homeEquityAt(gl, sc, yr) {
  if (!sc.hasProp || !(gl.propPrice > 0) || yr < gl.propBuyYear) return 0;
  return gl.propPrice*Math.pow(1+gl.inflation, yr - gl.propBuyYear) - mortgageBalanceAt(gl, yr);
}

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

// Your state pensions at a given age (today's €/month), v8.9: one per country,
// each from its own start age. pension2 (France) and pensionsMore (other
// countries, v8.19: [{amt, age}]) are optional. Since v8.19 the amounts reaching
// the engine are net (getGlobals converts the gross typed on the statement).
export function pensionMonthlyAt(gl, age) {
  let p = age >= gl.pensionAge ? (gl.pensionAmt || 0) : 0;
  if (gl.pension2Amt > 0 && age >= gl.pension2Age) p += gl.pension2Amt;
  for (const x of gl.pensionsMore || []) if (x.amt > 0 && age >= x.age) p += x.amt;
  return p;
}
// ── Housing and where you live (v8.11) ──────────────────────────────────────
// Living alone costs about 70% of what two people spend (OECD-modified 0.67,
// square-root scale 0.71). One constant, used for the default "costs if alone".
export const SOLO_SHARE = 0.7;
// Plans that apply per scenario (v8.17): a scenario can carry its own planned
// rents and moves abroad (sc.rentMoves, sc.residence, those switched on for it);
// every entry point reads the settings through this, so the formulas are unchanged.
export function scGl(gl, sc) {
  if (!sc || (sc.rentMoves === undefined && sc.residence === undefined)) return gl;
  if (gl._sc === sc) return gl;
  return { ...gl, rentMoves: sc.rentMoves ?? gl.rentMoves, residence: sc.residence ?? gl.residence, _sc: sc };
}

// Rent in year yr (today's €/month): rent today (propRentSaved), replaced by each
// planned move from its year. gl.rentMoves = [{from, rent}] sorted by year.
export function rentAt(gl, yr) {
  let r = gl.propRentSaved || 0;
  for (const m of gl.rentMoves || []) if (yr >= m.from) r = m.rent;
  return r;
}
// Where you live in year yr: gl.residence = [{from (null = today), tax, col}]
// sorted; tax = rate on the gain part of a sale (decimal), col = cost of living
// relative to today (1 = same). Without a residence list: today's rate, col 1.
export function residenceAt(gl, yr) {
  let cur = null;
  for (const p of gl.residence || []) if (p.from == null || yr >= p.from) cur = p;
  return cur;
}
export function taxRateAt(gl, yr) { const p = residenceAt(gl, yr); return p && p.tax != null ? p.tax : gl.taxRate; }
export function colAt(gl, yr) { const p = residenceAt(gl, yr); return p && p.col > 0 ? p.col : 1; }
// Rent saved by buying (today's €/month) in year yr: whatever rent applies that
// year, from the purchase year on. Living alone you pay 70% of the couple's rent
// (it is inside the 70% "if alone" costs), so buying saves that part only.
export function rentSavedMonthly(gl, sc, yr) {
  gl = scGl(gl, sc);
  if (!sc.hasProp || yr < gl.propBuyYear) return 0;
  const r = rentAt(gl, yr);
  return (gl.rentInJoint && isTwoPerson(gl) && !sc.hasPartner) ? r*SOLO_SHARE : r;
}

// The pensions as a list, for credits and texts: [{amt, age}] with amt > 0.
export function pensionList(gl) {
  const out = [];
  if (gl.pensionAmt > 0) out.push({ amt: gl.pensionAmt, age: gl.pensionAge });
  if (gl.pension2Amt > 0) out.push({ amt: gl.pension2Amt, age: gl.pension2Age });
  for (const x of gl.pensionsMore || []) if (x.amt > 0) out.push({ amt: x.amt, age: x.age });
  return out;
}

const clamp01 = x => Math.max(0, Math.min(1, x));

// Partner's share of shared costs once either of you has stopped working:
// her income / (her + your income); 0 when neither has any income. No floor or
// cap since v8.8 (one rule, no tuning knobs; DECISIONS.md).
export function partnerShare(herInc, samInc) {
  const tot = herInc + samInc;
  if (!(tot > 0)) return 0;
  return clamp01(herInc / tot);
}

// Her real share of shared costs today (v8.7, Spending refresh): what she pays
// into the joint account / the joint account total, capped at 100%. null when
// "she pays in" is empty or there is no joint total: the pro-rata rule applies.
// It holds while you both work; once either of you stops, pro rata takes over.
export function actualShare(gl) {
  if (gl.partnerPaysIn == null || !(gl.sharedNow > 0)) return null;
  return clamp01(gl.partnerPaysIn / gl.sharedNow);
}

// Partner's net income in calendar year yr (nominal €/yr): salary until HER
// retirement age, pension from HER pension age (age offset applied). Her savings
// are not modelled since v8.8, so a draw is only counted if a caller passes one.
// v8.12: in the child's birth year (scenarios with the child) her parental leave
// replaces her salary for its months with her leave pay (today's €, inflated).
export function partnerIncomeAt(yr, gl, herDrawAnn, sc) {
  const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
  const herAge  = gl.currentAge + t + (gl.partnerAgeOff || 0);
  const working = herAge < gl.partnerRetAge;
  const leaveM  = working && sc && sc.hasChild && yr === gl.childBirthYear ? Math.min(12, gl.partnerLeaveMonths || 0) : 0;
  const salary  = working ? (gl.partnerInc*(12 - leaveM) + (gl.partnerLeaveIncome || 0)*leaveM)*infl : 0;
  const pension = herAge >= gl.partnerPensionAge ? gl.partnerPension*12*infl : 0;
  const draw    = working ? 0 : (herDrawAnn || 0);
  return { herAge, working, onLeave: leaveM > 0, salary, pension, draw, total: salary + pension + draw };
}

// Household cost components in year yr (nominal €/yr). `shared` is what gets
// split: joint living costs + child costs + mortgage − rent saved (floored at 0).
// A property purchase cost is not shared (it stays on your side, like today).
// noTemp: leave out the costs that end (child costs, mortgage payments) — used to
// split your cost into a lifelong part and a temporary part (v8.2, see tempCostPV).
export function householdCosts(yr, sc, gl, samRetired, noTemp) {
  gl = scGl(gl, sc);
  const t = yr - gl.baseYear, infl = Math.pow(1+gl.inflation, t);
  // v8.11: cost of living where you live that year scales everything but housing;
  // rent today is inside the joint account and is replaced by the rent that year.
  const col = colAt(gl, yr);
  const samPersonal = (samRetired ? gl.samPersonalRet : gl.samPersonalNow)*12*infl*col;
  // yearly items (trips, courses, gifts; v8.7) are shared costs, now and retired
  const yearly      = samRetired && gl.yearlyItemsRet != null ? gl.yearlyItemsRet : (gl.yearlyItems || 0);
  const rentNow     = gl.rentInJoint ? (gl.propRentSaved || 0) : 0;
  const nonHousing  = ((samRetired ? gl.sharedRet : gl.sharedNow) - rentNow)*12 + yearly;
  const sharedBase  = (nonHousing*col + (gl.rentInJoint ? rentAt(gl, yr)*12 : 0))*infl;
  const partnerPersonal = (gl.partnerPersonal || 0)*12*infl;
  let child = 0, mortgage = 0, rentSaved = 0;
  if (sc.hasChild && !noTemp) {
    const childAge = yr - gl.childBirthYear;
    if (childAge >= 0 && childAge < gl.childCostUntilAge) child = gl.childCostYearly*infl;
  }
  if (sc.hasProp) {
    if (!noTemp) mortgage = mortgagePaymentAt(gl, yr);
    rentSaved = rentSavedMonthly(gl, sc, yr)*12*infl;
  }
  const ownership = ownershipAnnual(gl, sc, yr);   // v8.13: charges + upkeep, shared like the rest
  const shared = Math.max(0, sharedBase + child + mortgage + ownership - rentSaved);
  return { samPersonal, sharedBase, partnerPersonal, child, mortgage, ownership, rentSaved, shared };
}

// Your net cost in year yr given YOUR income for the share (samInc, nominal €/yr).
// payChanged: your pay differs from today's in yr (a pay change or parental leave). Her
// real share is today's arrangement, so it only holds while both incomes are as
// today; otherwise the pro-rata rule applies (v8.8).
export function twoPersonCost(yr, sc, gl, samInc, herDrawAnn, samRetired, noTemp, payChanged) {
  gl = scGl(gl, sc);
  const hc = householdCosts(yr, sc, gl, samRetired, noTemp);
  const her = partnerIncomeAt(yr, gl, herDrawAnn, sc);
  // her real share is today's arrangement: not while her pay differs (her leave)
  const real = (!samRetired && her.working && !her.onLeave && !payChanged) ? actualShare(gl) : null;
  const share = real != null ? real : partnerShare(her.total, samInc);
  const contrib = share*hc.shared;
  return { ...hc, her, samInc, share, shareReal: real != null, contrib, samCost: hc.samPersonal + hc.shared - contrib };
}

// What you really invest per month today (v8.7, Spending refresh read-out):
// take-home minus your own cost this year (no plans switched on), today's €.
// Two-person model only; the same twoPersonCost the projection uses.
export function investNowMonthly(gl, takeHome) {
  const tp = twoPersonCost(gl.baseYear, { hasChild: false, hasProp: false }, gl, (takeHome || 0)*12, 0, false);
  return { cost: tp.samCost/12, contrib: tp.contrib/12, share: tp.share, shareReal: tp.shareReal,
           invest: (takeHome || 0) - tp.samCost/12 };
}

// Your retirement cost when your portfolio is exactly at target: then your
// sustainable draw (portfolio × SWR × netFrac) plus pension equals your cost,
// so your income for the share is max(cost, pension). Solves the fixed point
// c = P + S·(1 − share(h, c)) in closed form: c² + c(h−P−S) − P·h = 0 (positive
// root); the clamp on the share keeps the fixed point (share(c) is monotone).
export function selfFundedCost(yr, sc, gl, samPensionAnn, herDrawAnn, noTemp) {
  gl = scGl(gl, sc);
  const hc = householdCosts(yr, sc, gl, true, noTemp);
  const her = partnerIncomeAt(yr, gl, herDrawAnn, sc);
  const P = hc.samPersonal, S = hc.shared, h = her.total, pen = samPensionAnn || 0;
  let c = (P + S - h + Math.sqrt((h - P - S)*(h - P - S) + 4*P*h)) / 2;
  // c ≥ pension: your income is your cost (c). Otherwise the pension alone is
  // your income (no draw needed); the cost then stays below the pension.
  const share = partnerShare(h, c >= pen ? c : pen);
  const contrib = share*S;
  c = P + S - contrib;
  return { ...hc, her, samInc: Math.max(c, pen), share, contrib, samCost: c };
}

// Card note: what the partner contributes (today's €/mo) when you retire, until
// which of her ages, and what your cost becomes after that change.
export function partnerContributionNote(sc, gl, proj) {
  if (!isTwoPerson(gl) || !sc.hasPartner || !proj) return null;
  const off = gl.partnerAgeOff || 0;
  const at = yr => {
    const t = yr - gl.baseYear, age = gl.currentAge + t, infl = Math.pow(1+gl.inflation, t);
    const pen = pensionMonthlyAt(gl, age)*12*infl;
    const idx = yr - proj.years[0];
    const c = selfFundedCost(yr, sc, gl, pen, 0);
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

// Monthly spending (today's €) of a scenario WITHOUT the partner in the two-person
// model: your personal spending + housing & shared costs if alone, always. The
// Simple model's "Monthly spending" never stands in: one fact, one field (v8.0.4,
// Sam's decision; the v8.0.3 fallback is gone). Empty fields are flagged by
// js/checks.js and the scenario shows "missing" instead of a €0 target.
// The single source for every solo path: yearOneBudget, computeFireTarget, project().
export function soloSpend(gl, retired, yr) {
  if (gl.rentInJoint && yr != null) {
    // v8.11: own spending + 70% of (joint without rent + yearly items), both scaled by
    // the cost of living that year, + 70% of the rent that year. retMult (the
    // retirement change) applies to everything but rent.
    const col = colAt(gl, yr), m = retired ? (gl.retMult != null ? gl.retMult : 1) : 1;
    const own = (retired ? gl.samPersonalRet : gl.samPersonalNow)*col;
    const nonHousing = SOLO_SHARE*((gl.sharedNow - (gl.propRentSaved || 0)) + (gl.yearlyItems || 0)/12)*m*col;
    return own + nonHousing + SOLO_SHARE*rentAt(gl, yr);
  }
  return retired ? gl.samPersonalRet + (gl.soloSharedRet != null ? gl.soloSharedRet : gl.soloShared)
                 : gl.samPersonalNow + gl.soloShared;
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
// For a scenario without the partner, base spending is soloSpend(gl, true).
export function yearOneBudget(fromAge, sc, gl, herDrawAnn) {
  gl = scGl(gl, sc);
  const tFrom = fromAge - gl.currentAge;
  const fromYear = gl.baseYear + tFrom;
  const inflF = Math.pow(1+gl.inflation, tFrom);
  if (isTwoPerson(gl) && sc.hasPartner) {
    const pen = pensionMonthlyAt(gl, fromAge)*12*inflF;
    return Math.max(0, selfFundedCost(fromYear, sc, gl, pen, herDrawAnn).samCost);
  }
  let budget = isTwoPerson(gl)
    ? soloSpend(gl, true, fromYear)*12*inflF
    : gl.spendRet*(sc.hasPartner ? gl.partnerSpendMult : 1)*12*inflF;
  if (sc.hasChild) {
    const childAge = fromYear - gl.childBirthYear;
    if (childAge >= 0 && childAge < gl.childCostUntilAge) budget += gl.childCostYearly*inflF;
  }
  if (sc.hasProp) {
    budget += mortgagePaymentAt(gl, fromYear) + ownershipAnnual(gl, sc, fromYear);
    budget -= rentSavedMonthly(gl, sc, fromYear)*12*inflF;
  }
  return Math.max(0, budget);
}

// ── Costs that end (v8.2) ───────────────────────────────────────────────────
// Child costs and mortgage payments stop at a known year. In %-of-portfolio mode
// they are no longer priced as if they lasted forever (year-one budget × 1/SWR):
// the lifelong part of the budget gets the SWR multiple, and the costs that end
// are set aside at their present value over their remaining years only, and paid
// in full from that set-aside in the projection.
//
// YOUR temporary cost in year yr (nominal €): child costs + mortgage payments, or
// in the two-person model with the partner on, your part of them (the difference
// your net cost makes with and without them, at the same share).
export function tempCostAt(yr, sc, gl, herDrawAnn) {
  gl = scGl(gl, sc);
  if (isTwoPerson(gl) && sc.hasPartner) {
    const t = yr - gl.baseYear, age = gl.currentAge + t;
    const pen = pensionMonthlyAt(gl, age)*12*Math.pow(1+gl.inflation, t);
    return Math.max(0, selfFundedCost(yr, sc, gl, pen, herDrawAnn).samCost
                     - selfFundedCost(yr, sc, gl, pen, herDrawAnn, true).samCost);
  }
  const hc = householdCosts(yr, sc, gl, true);
  return hc.child + hc.mortgage;
}
// Present value at fromAge of the temporary costs from fromAge to life expectancy,
// grossed up for tax (taxMult), discounted at the portfolio return at fromAge,
// paid at year end like the DCF annuities (k+1). herDraw: { t: her draw } map.
export function tempCostPV(fromAge, sc, gl, taxMult, herDraw) {
  gl = scGl(gl, sc);
  if (fromAge >= gl.lifeExp) return 0;
  const fromYear = gl.baseYear + fromAge - gl.currentAge, r = portReturnAt(gl, fromAge, sc.retAge);
  let pv = 0;
  for (let k = 0; k < gl.lifeExp - fromAge; k++) {
    const yr = fromYear + k, c = tempCostAt(yr, sc, gl, (herDraw || {})[yr - gl.baseYear] || 0);
    if (c > 0) pv += c*taxMult/Math.pow(1+r, k+1);
  }
  return pv;
}
// The lifelong part of the year-one budget: yearOneBudget minus that year's
// temporary costs. The full yearOneBudget stays the definition of the budget (I2).
export function yearOnePermBudget(fromAge, sc, gl, herDrawAnn) {
  gl = scGl(gl, sc);
  const fromYear = gl.baseYear + fromAge - gl.currentAge;
  return Math.max(0, yearOneBudget(fromAge, sc, gl, herDrawAnn) - tempCostAt(fromYear, sc, gl, herDrawAnn));
}

// Tax gross-up for a sale `years` after the point where it is taxMult. Selling
// proportionally keeps the gain fraction, but every year of growth on what is
// left adds gain with no cost basis: g(n) = 1 − (1 − g0)/(1+r)^n. The flat
// taxMult used for decades understated the fixed-mode target (v8.5).
export function taxMultAfter(taxMult, taxRate, r, years) {
  if (!(taxRate > 0)) return taxMult;
  const g0 = Math.min(1, Math.max(0, (1 - 1/taxMult)/taxRate));
  const g = Math.min(1, Math.max(g0, 1 - (1 - g0)/Math.pow(1 + Math.max(0, r), years)));
  return 1/Math.max(0.001, 1 - g*taxRate);
}

// Your take-home in year yr (€/month, today's money). v8.6: sc.payChanges is a
// list of { from, to, amt } (to inclusive, null = for good); when several apply,
// the one that started latest wins; outside every change it is sc.income.
// Without sc.payChanges, the pre-v8.6 single permanent change (chgYear/chgInc).
export function payIncomeAt(sc, yr) {
  if (Array.isArray(sc.payChanges)) {
    let pay = sc.income, start = -Infinity;
    for (const c of sc.payChanges)
      if (yr >= c.from && (c.to === null || c.to === undefined || yr <= c.to) && c.from >= start) { pay = c.amt; start = c.from; }
    return pay;
  }
  return (sc.chgYear !== null && sc.chgYear !== undefined && yr >= sc.chgYear && sc.chgInc !== null && sc.chgInc !== undefined) ? sc.chgInc : sc.income;
}

export function computeFireTarget(fromAge, sc, gl, taxMult, opts) {
  gl = scGl(gl, sc);
  opts = opts || {};
  if (fromAge>=gl.lifeExp) return 0;
  const tFrom    = fromAge-gl.currentAge;
  const off      = gl.partnerAgeOff || 0;   // partner's age = your age + off
  // effective retirement spending: partner multiplier increases it, child costs are time-limited
  const baseSpend = isTwoPerson(gl) && !sc.hasPartner
    ? soloSpend(gl, true)
    : gl.spendRet * (sc.hasPartner ? gl.partnerSpendMult : 1);
  const spendNom  = baseSpend*12*Math.pow(1+gl.inflation,tFrom);
  const pensionNom= gl.pensionAmt*12*Math.pow(1+gl.inflation,tFrom);
  const rFrom     = portReturnAt(gl,fromAge,sc.retAge);
  // Tax gross-up for a sale `years` years after fromAge (v8.5: the gain fraction
  // keeps rising; v8.11: at the rate of the country you live in that year).
  // Without a residence list this is exactly taxMultAfter at today's rate.
  const fromYearT = gl.baseYear + tFrom;
  const rate0 = taxRateAt(gl, fromYearT);
  const g0 = opts.gainFrac != null ? opts.gainFrac : (rate0 > 0 ? clamp01((1 - 1/taxMult)/rate0) : 0);
  function tmAt(years) {
    if (!gl.residence) return taxMultAfter(taxMult, gl.taxRate, rFrom, years);
    const rate = taxRateAt(gl, fromYearT + Math.max(0, years - 1));
    if (!(rate > 0)) return 1;
    const g = 1 - (1 - g0)/Math.pow(1 + rFrom, years);
    return 1/Math.max(0.001, 1 - g*rate);
  }

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

  // PV of the pensions that start after fromAge (adjusted number only)
  function laterPensionCredit() {
    return pensionList(gl).filter(p => fromAge < p.age).reduce((a, p) => a + incomeCredit(p.amt, p.age, gl.lifeExp), 0);
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
      const pen = pensionMonthlyAt(gl, age)*12*Math.pow(1+gl.inflation, t);
      return { pen, c: selfFundedCost(yr, sc, gl, pen, herDraw[t] || 0) };
    };
    const a0 = at(fromYear);
    if (gl.wdMode === "swr") {
      // lifelong part × 1/SWR, plus the costs that end at their present value (v8.2)
      const perm0 = Math.max(0, a0.c.samCost - tempCostAt(fromYear, sc, gl, herDraw[tFrom] || 0));
      let target = gl.swr>0 ? Math.max(0, perm0 - a0.pen)*taxMult/gl.swr : 0;
      target += tempCostPV(fromAge, sc, gl, taxMult, herDraw);
      if (opts.otherIncomeCredit) {
        // Adjusted: credit your pension starting later, and price later changes
        // in the partner's share (she retires: share falls, your cost rises; her
        // pension starts: share rises) against the year-one share.
        target -= laterPensionCredit();
        for (let k = 0; k < n; k++) {
          const ak = at(fromYear + k);
          target += ak.c.shared*(a0.c.share - ak.c.share)*taxMult/Math.pow(1+rFrom, k+1);
        }
        target = Math.max(0, target);
      }
      return Math.round(target);
    }
    let pv = 0;
    // v8.5: tax gross-up rises with the gain fraction year by year (taxMultAfter)
    for (let k = 0; k < n; k++) {
      const ak = at(fromYear + k);
      pv += Math.max(0, ak.c.samCost - ak.pen)*tmAt(k+1)/Math.pow(1+rFrom, k+1);
    }
    if (sc.hasProp && gl.propBuyYear >= fromYear)
      pv += purchaseCostFor(gl, sc)*tmAt(Math.max(0, gl.propBuyYear - fromYear))/Math.pow(1+rFrom, gl.propBuyYear - fromYear);
    return Math.round(Math.max(0, pv));
  }

  if (gl.wdMode==="swr") {
    // %-of-portfolio mode: portfolio must be large enough that a GROSS draw of
    // SWR% delivers the full year-one budget AFTER capital-gains tax (taxMult),
    // net of income streams already flowing at retirement. Partner salary is
    // deliberately excluded from the headline (it is temporary income).
    // v8.2: only the lifelong part of the budget gets the SWR multiple; costs
    // that end (child, mortgage) are added at their present value.
    const budget = yearOnePermBudget(fromAge, sc, gl);
    const pensionOffset = pensionMonthlyAt(gl, fromAge)*12*Math.pow(1+gl.inflation,tFrom);
    let partnerPenOff = 0;
    if (sc.hasPartner && fromAge+off>=gl.partnerPensionAge) partnerPenOff = gl.partnerPension*12*Math.pow(1+gl.inflation,tFrom);
    const annualFromPort = Math.max(0,budget-pensionOffset-partnerPenOff);
    let target = gl.swr>0 ? annualFromPort*taxMult/gl.swr : 0;
    target += tempCostPV(fromAge, sc, gl, taxMult);
    if (opts.otherIncomeCredit) {
      // Adjusted (non-headline) number: also credit the PV of income the headline
      // ignores — pensions that start after retirement, and partner salary until
      // the partner retires.
      target -= laterPensionCredit();
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

  // Fixed-mode target (v8.5): year by year, with the gain fraction rising as the
  // portfolio keeps growing. opts.closedForm / opts.dcfLoop === 'flat' keep the
  // pre-v8.5 constant-tax pricing, for the equivalence test only.
  if (!opts.closedForm) return dcfLoop(opts.dcfLoop === 'flat' ? () => taxMult : k => tmAt(k + 1));

  // Year-by-year form of the closed-form DCF below (v8.5). tm(k) is the tax
  // gross-up for a sale k years after fromAge. With a constant tm it equals the
  // closed form to the euro (tested); with taxMultAfter it prices the gain
  // fraction that rises as the remaining portfolio keeps growing.
  function dcfLoop(tm) {
    const fromYear = gl.baseYear + tFrom, n = Math.max(0, gl.lifeExp - fromAge);
    const soloYr = isTwoPerson(gl) && !sc.hasPartner;   // v8.11: solo spending varies by year (moves, cost of living)
    let pv = 0;
    for (let k = 0; k < n; k++) {
      const age = fromAge + k, yr = fromYear + k, infl = Math.pow(1+gl.inflation, yr - gl.baseYear);
      const spend = (soloYr ? soloSpend(gl, true, yr) : baseSpend)*12*infl, pen = pensionMonthlyAt(gl, age)*12*infl;
      let flow = Math.max(0, spend - pen);
      if (sc.hasChild && yr >= gl.childBirthYear && yr < gl.childBirthYear + gl.childCostUntilAge) flow += gl.childCostYearly*infl;
      if (sc.hasProp) {
        flow += mortgagePaymentAt(gl, yr) + ownershipAnnual(gl, sc, yr);
        flow -= rentSavedMonthly(gl, sc, yr)*12*infl;
      }
      if (sc.hasPartner) {
        if (gl.partnerPension > 0 && age + off >= gl.partnerPensionAge) flow -= gl.partnerPension*12*infl;
        if (gl.partnerInc > 0 && age + off < gl.partnerRetAge) flow -= gl.partnerInc*12*infl;
      }
      pv += flow*tm(k)/Math.pow(1+rFrom, k+1);
    }
    if (sc.hasProp && gl.propBuyYear >= fromYear) {
      const d = gl.propBuyYear - fromYear;
      pv += purchaseCostFor(gl, sc)*tm(Math.max(0, d-1))/Math.pow(1+rFrom, d);
    }
    return Math.round(Math.max(0, pv));
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
  gl = scGl(gl, sc);
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
  // Two-person model: her money stays hers. Since v8.8 only her income is
  // modelled (it sets her share of shared costs); her savings are not.
  const two  = isTwoPerson(gl);
  const twoP = two && sc.hasPartner;
  const fireNumMult = [];

  // mortgage amortisation

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
      ? soloSpend(gl, true, yr)
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
    }

    // Two-person: start-of-year values drive this year's share (no iteration).
    // Your income for the share after retirement = pension + portfolio × SWR ×
    // netFrac (SWR even in fixed mode); hers is her salary or pension.
    const herDraw = 0;
    let samDrawStart = 0;
    if (twoP) {
      const gfS = portfolio>0 ? clamp01((portfolio-costBasis)/portfolio) : 0;
      samDrawStart = Math.max(0, portfolio)*gl.swr*Math.max(0.001, 1-gfS*taxRateAt(gl, yr));
    }
    let tp = null;                             // this year's two-person ledger

    let fireNum = null;   // pre-retirement & %-of-portfolio years backfilled after the loop
    if (yr>=retYear && gl.wdMode!=="swr") {
      const gainFracNow = portfolio>0 ? Math.max(0,Math.min(1,(portfolio-costBasis)/portfolio)) : 0;
      const postTaxMult = 1/Math.max(0.001,1-gainFracNow*taxRateAt(gl, yr));
      // two-person targets are priced after the loop
      if (twoP) fireNumMult[fireNums.length] = { age, mult: postTaxMult, gf: gainFracNow };
      else fireNum = computeFireTarget(age,sc,gl,postTaxMult,{ gainFrac: gainFracNow });
    }
    fireNums.push(fireNum);

    // a windfall switched off for this scenario (w.off holds scenario ids, v8.4) doesn't arrive
    const windfall = (gl.windfalls||[]).filter(w=>w.yr===yr && !(w.off && w.off.includes(sc.id))).reduce((s,w)=>s+w.amt,0);
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
        annInc = payIncomeAt(sc, yr)*12*infl;
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
        // her real share holds while your pay is today's (no pay change, no parental leave)
        tp = twoPersonCost(yr, sc, gl, annInc, herDraw, false, false, Math.abs(annInc - sc.income*12*infl) > 0.5);
        annSpendNow = tp.samPersonal + tp.shared - tp.child - tp.mortgage + tp.rentSaved;
        childCost   = tp.child;
      } else if (two) {
        annSpendNow = soloSpend(gl, false, yr)*12*infl;
        childCost   = childCostInYear(yr);
      } else {
        annSpendNow = gl.spendNow*12*infl*(sc.hasPartner ? gl.partnerSpendMult : 1);
        childCost   = childCostInYear(yr);
      }
      // property
      let extraCost=0, mortgageAnn=0, rentSavingsAnn=0, ownAnn=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { extraCost=purchaseCostFor(gl, sc); row.extraCost=extraCost; }
        mortgageAnn=mortgagePaymentAt(gl, yr); row.mortgagePayment=Math.round(mortgageAnn);
        ownAnn=ownershipAnnual(gl, sc, yr); row.ownership=Math.round(ownAnn);
        if (yr>=gl.propBuyYear) { rentSavingsAnn=rentSavedMonthly(gl, sc, yr)*12*infl; row.rentSavings=Math.round(rentSavingsAnn); }
      }
      const netFlow = tp
        ? annInc - tp.samCost - extraCost          // your net cost = personal + shared − her contribution
        : annInc-annSpendNow-childCost-extraCost-mortgageAnn-ownAnn+rentSavingsAnn;
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
      const netFrac=Math.max(0.001,1-gainFracNow*taxRateAt(gl, yr));   // € received per € withdrawn (v8.11: rate where you live that year)
      // Non-portfolio income: state pension, partner pension, and partner salary —
      // the partner keeps earning after YOUR retirement until their own retirement age.
      const pAnn = pensionMonthlyAt(gl, age)*12*infl;
      let partnerPensionAnn=0, partnerSalAnn=0;
      if (sc.hasPartner && !two && age+off>=gl.partnerPensionAge) partnerPensionAnn=gl.partnerPension*12*infl;
      if (sc.hasPartner && !two && age+off<gl.partnerRetAge)      partnerSalAnn=gl.partnerInc*12*infl;

      // property cash flows continue into retirement
      let mortgageAnnRet=0, rentSavingsAnnRet=0, purchaseCost=0, ownAnnRet=0;
      if (sc.hasProp) {
        if (yr===gl.propBuyYear) { purchaseCost=purchaseCostFor(gl, sc); row.extraCost=purchaseCost; }
        mortgageAnnRet=mortgagePaymentAt(gl, yr); row.mortgagePayment=Math.round(mortgageAnnRet);
        ownAnnRet=ownershipAnnual(gl, sc, yr); row.ownership=Math.round(ownAnnRet);
        if (yr>=gl.propBuyYear) { rentSavingsAnnRet=rentSavedMonthly(gl, sc, yr)*12*infl; row.rentSavings=Math.round(rentSavingsAnnRet); }
      }

      let childCost=childCostInYear(yr);
      let budget=Math.max(0, annRetSpend+childCost+mortgageAnnRet+ownAnnRet-rentSavingsAnnRet);
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
        // v8.2: costs that end (child, mortgage) are paid in full from the
        // set-aside priced into the FIRE number (tempCostPV); only the lifelong
        // part of the budget is capped by the SWR draw. Other income covers the
        // lifelong part first, then the temporary part.
        const tempCost = twoP
          ? Math.max(0, budget - Math.max(0, twoPersonCost(yr, sc, gl, pAnn + samDrawStart, herDraw, true, true).samCost))
          : Math.min(budget, childCost + mortgageAnnRet);
        const permBudget = Math.max(0, budget - tempCost);
        const potentialGross=portAfterGrowth*gl.swr;
        const permNeedGross=Math.max(0,permBudget-otherInc)/netFrac;
        const tempNeed=Math.max(0, tempCost - Math.max(0, otherInc-permBudget));
        gross=Math.min(potentialGross,permNeedGross)+tempNeed/netFrac;
        if (purchaseCost>0) gross+=purchaseCost/netFrac;   // one-time purchase is funded regardless
        surplus=Math.max(0,otherInc-budget);               // pension/partner income beyond budget is saved
        row.tempCost=Math.round(tempCost);
        row.swrIncome=Math.round(potentialGross*netFrac+otherInc+tempNeed);
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
      row.withdrawal=Math.round(gross); row.taxPaid=Math.round(gross*gainFracNow*taxRateAt(gl, yr));
    }

    // Two-person ledger rows (her income and contribution; v8.8: no savings ledger)
    if (twoP) {
      const her = tp ? tp.her : partnerIncomeAt(yr, gl, 0, sc);
      row.partnerContrib = Math.round(tp ? tp.contrib : 0);   // real past spending override: no split
      row.partnerShare = tp ? tp.share : 0;
      row.samShareIncome = Math.round(tp ? tp.samInc : 0);
      row.partnerIncome = Math.round(her.salary + her.pension);
    }

    years.push(yr); values.push(portfolioBefore+cashBefore); rows.push(row);
  }

  // FIRE target priced with the tracked gain fraction at retirement: the tax
  // gross-up reflects what the portfolio will actually owe in CGT then, not today.
  if (gainFracAtRet===null) gainFracAtRet = gl.gainFrac;
  const taxMultRet = 1/Math.max(0.001,1-gainFracAtRet*taxRateAt(gl, retYear));
  const tOpts = { gainFrac: gainFracAtRet };
  const fireAtRetirement = computeFireTarget(sc.retAge,sc,gl,taxMultRet,tOpts);
  const fireTargetAdj = gl.wdMode==="swr"
    ? computeFireTarget(sc.retAge,sc,gl,taxMultRet,{otherIncomeCredit:true, ...(tOpts||{})})
    : fireAtRetirement;
  fireNumMult.forEach((fm, i) => { if (fm) fireNums[i] = computeFireTarget(fm.age, sc, gl, fm.mult, { gainFrac: fm.gf }); });
  for (let i=0;i<fireNums.length;i++) if (fireNums[i]===null) fireNums[i]=fireAtRetirement;

  const out = {years,values,fireNums,retYear,allocations,rows,
          fireTarget:fireAtRetirement, fireTargetAdj, gainFracAtRet,
          // v8.2: % mode only — the part of the FIRE number set aside for costs that end
          tempPV: gl.wdMode==="swr" ? tempCostPV(sc.retAge, sc, gl, taxMultRet) : 0,
          infeasibleYear, finalNetWorth: portfolio+cashVal};
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
