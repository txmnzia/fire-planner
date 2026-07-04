// Unit tests for the pure financial engine (js/engine.js).
// Run with: node --test tests/   (no dependencies beyond Node ≥ 20)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annuityPV, mortgageAnnual, portReturnAt, yearOneBudget,
  computeFireTarget, project, buildPlanProj, planYearsAhead,
} from '../js/engine.js';

// A globals object mirroring what inputs.js getGlobals() produces.
function makeGl(over = {}) {
  return {
    currentAge: 32, lifeExp: 85, baseYear: 2026,
    spendNow: 3700, spendRet: 3000, inflation: 0.02,
    gainFrac: 0.27, stockRet: 0.07, bondRet: 0.03,
    stockAlloc: 1, bondAllocRet: 0.4, taxRate: 0.30,
    pensionAmt: 800, pensionAge: 67, cash: 18000, cashReturn: 0.015,
    windfalls: [], wdMode: 'swr', swr: 0.04,
    invested: 286780,
    partnerInc: 1400, partnerRetAge: 67, partnerPension: 400, partnerPensionAge: 67,
    partnerSpendMult: 1.3, partnerAgeOff: 0,
    propBuyYear: 2029, propPrice: 400000, propDownPct: 0.2, propTxCostPct: 0.08,
    propMortgageRate: 0.035, propMortgageTerm: 25, propRentSaved: 1200,
    childBirthYear: 2030, childCostYearly: 12000, childCostUntilAge: 23,
    childMaternityMonths: 12, childMaternityIncome: 1800,
    ...over,
  };
}
function makeSc(over = {}) {
  return { id: 1, retAge: 42, income: 6700, chgYear: null, chgInc: null,
           hasPartner: false, hasProp: false, hasChild: false, ...over };
}

test('annuityPV: zero/negative horizon is worthless', () => {
  assert.equal(annuityPV(100, 0.05, 0.02, 0), 0);
  assert.equal(annuityPV(100, 0.05, 0.02, -3), 0);
});

test('annuityPV: r == g degenerates to C·n', () => {
  assert.equal(annuityPV(100, 0.03, 0.03, 12), 1200);
});

test('annuityPV: matches closed-form ordinary growing annuity', () => {
  // C=100, r=5%, g=0, n=10 → 100·(1−1.05⁻¹⁰)/0.05
  const expected = 100 * (1 - Math.pow(1 / 1.05, 10)) / 0.05;
  assert.ok(Math.abs(annuityPV(100, 0.05, 0, 10) - expected) < 1e-9);
});

test('mortgageAnnual: zero rate amortises linearly', () => {
  const gl = makeGl({ propPrice: 300000, propDownPct: 0.2, propMortgageRate: 0, propMortgageTerm: 25 });
  assert.equal(mortgageAnnual(gl), 240000 / 25);
});

test('mortgageAnnual: standard annuity payment for 3.5% / 25y', () => {
  const gl = makeGl();
  const principal = 400000 * 0.8, mr = 0.035 / 12, nm = 300;
  const expected = principal * mr * Math.pow(1 + mr, nm) / (Math.pow(1 + mr, nm) - 1) * 12;
  assert.ok(Math.abs(mortgageAnnual(gl) - expected) < 1e-6);
});

test('mortgageAnnual: no property price → 0', () => {
  assert.equal(mortgageAnnual(makeGl({ propPrice: 0 })), 0);
});

test('portReturnAt: glide path endpoints', () => {
  const gl = makeGl();
  assert.equal(portReturnAt(gl, 32, 42), 0.07);                    // today: 100% stock
  assert.ok(Math.abs(portReturnAt(gl, 42, 42) - (0.6 * 0.07 + 0.4 * 0.03)) < 1e-12); // at retirement: 60/40
});

test('yearOneBudget: base case is inflated retirement spending', () => {
  const gl = makeGl(), sc = makeSc();
  const expected = 3000 * 12 * Math.pow(1.02, 10); // retire at 42, 10y from age 32
  assert.ok(Math.abs(yearOneBudget(42, sc, gl) - expected) < 1e-6);
});

test('yearOneBudget: partner multiplier and child cost add up', () => {
  const gl = makeGl(), sc = makeSc({ hasPartner: true, hasChild: true });
  const inflF = Math.pow(1.02, 10);
  const expected = 3000 * 1.3 * 12 * inflF + 12000 * inflF; // child born 2030, still <23 in 2036
  assert.ok(Math.abs(yearOneBudget(42, sc, gl) - expected) < 1e-6);
});

test('computeFireTarget (SWR mode): budget grossed up by taxMult over SWR', () => {
  const gl = makeGl(), sc = makeSc();
  const taxMult = 1.1;
  const expected = Math.round(yearOneBudget(42, sc, gl) * taxMult / 0.04);
  assert.equal(computeFireTarget(42, sc, gl, taxMult), expected);
});

test('computeFireTarget: retirement at/after life expectancy needs nothing', () => {
  const gl = makeGl(), sc = makeSc({ retAge: 85 });
  assert.equal(computeFireTarget(85, sc, gl, 1), 0);
});

test('project: horizon, determinism and non-negative net worth', () => {
  const gl = makeGl(), sc = makeSc();
  const p1 = project(sc, gl), p2 = project(sc, gl);
  assert.equal(p1.values.length, gl.lifeExp - gl.currentAge + 1);
  assert.deepEqual(p1.values, p2.values);
  assert.ok(p1.values.every(v => v >= 0));
  assert.ok(p1.fireTarget > 0);
  assert.equal(p1.retYear, 2036);
});

test('project: uses gl.invested as the starting portfolio', () => {
  const gl = makeGl(), sc = makeSc();
  const proj = project(sc, gl);
  assert.equal(proj.values[0], gl.invested + gl.cash); // year-0 net worth = portfolio + cash
});

test('project (fixed mode): unaffordable plan flags infeasibility or depletes', () => {
  const gl = makeGl({ wdMode: 'fixed', invested: 10000, cash: 0, spendRet: 10000 });
  const sc = makeSc({ retAge: 33 });
  const proj = project(sc, gl);
  assert.ok(proj.infeasibleYear !== null || proj.finalNetWorth <= 0);
});

test('project: windfall year increases net worth path', () => {
  const gl = makeGl(), sc = makeSc();
  const base = project(sc, gl);
  const rich = project(sc, makeGl({ windfalls: [{ yr: 2030, amt: 100000 }] }));
  const i = base.years.indexOf(2031);
  assert.ok(rich.values[i] > base.values[i] + 99000);
});

test('buildPlanProj: needs at least one past snapshot', () => {
  const gl = makeGl(), sc = makeSc();
  assert.equal(buildPlanProj(sc, gl, []), null);
  assert.equal(buildPlanProj(sc, gl, [{ year: 2030, val: 100000 }]), null); // future only
  const plan = buildPlanProj(sc, gl, [{ year: 2022, val: 100000 }]);
  assert.ok(plan);
  assert.equal(plan.years[0], 2022);
});

test('planYearsAhead: ahead of plan when actual NW beats the plan curve early', () => {
  const gl = makeGl(), sc = makeSc();
  const plan = buildPlanProj(sc, gl, [{ year: 2022, val: 50000 }]);
  const pos = planYearsAhead(plan, gl);
  assert.ok(pos && Number.isFinite(pos.years));
});
