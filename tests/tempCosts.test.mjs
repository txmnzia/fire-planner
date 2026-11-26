// v8.2 — costs that end (child costs, mortgage payments) in %-of-portfolio mode.
// Before: the FIRE number was the year-one budget x 1/SWR, so a mortgage with one
// year left was priced as a cost for life (x25 at 4%), and the target fell off a
// cliff the year it ended. Now: the lifelong part x 1/SWR, plus the costs that end
// at their present value over their remaining years; the projection pays them in
// full from that set-aside. Hand-computed on a flat economy (0% returns, 0%
// inflation, no tax), where present value = plain sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { project, tempCostAt, tempCostPV, yearOnePermBudget, yearOneBudget, mortgageAnnual } from '../js/engine.js';
import { earliestStopAge } from '../js/ui/cards.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

const flat = over => baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, windfalls: [], invested: 300000, samPersonalNow: 1500, samPersonalRet: 1500, soloShared: 500,   // v8.23 one model: 2,000 alone
  childBirthYear: 2030, childCostYearly: 12000, childCostUntilAge: 23, childMaternityMonths: 0,
  propBuyYear: 2032, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0, propMortgageRate: 0, propMortgageTerm: 25,
  propRentSaved: 1000, ...over });
// stop at 45 = year 2036 (current age 35 in 2026)

test('child only: target = 2,000 x 12 / 4% + 12,000 x 17 remaining years = 804,000', () => {
  // child costs 2030..2052 (until age 23); from 2036 that is 17 years
  const gl = flat(), sc = baseSc({ retAge: 45, hasChild: true });
  assert.equal(tempCostAt(2036, sc, gl), 12000);
  assert.equal(tempCostAt(2053, sc, gl), 0);
  assert.equal(tempCostPV(45, sc, gl, 1), 12000 * 17);
  assert.equal(yearOnePermBudget(45, sc, gl), 24000);
  assert.equal(project(sc, gl).fireTarget, 600000 + 204000);   // was (24,000 + 12,000) / 4% = 900,000
});

test('mortgage only: (2,000 - 1,000 rent saved) x 12 / 4% + 9,600 x 21 remaining years = 501,600', () => {
  // 240k loan at 0% over 25 years = 9,600/yr, payments 2032..2056; from 2036: 21 years
  const gl = flat(), sc = baseSc({ retAge: 45, hasProp: true });
  assert.equal(mortgageAnnual(gl), 9600);
  assert.equal(tempCostPV(45, sc, gl, 1), 9600 * 21);
  assert.equal(project(sc, gl).fireTarget, 300000 + 201600);    // was (12,000 + 9,600) / 4% = 540,000
});

test('no cliff: stopping in the mortgage\'s last year costs one payment more, not 25', () => {
  const gl = flat(), sc = a => baseSc({ retAge: a, hasProp: true });
  const last = project(sc(65), gl).fireTarget;   // 2056: last payment year
  const after = project(sc(66), gl).fireTarget;  // 2057: paid off
  assert.equal(last - after, 9600);              // was 9,600 / 4% = 240,000
});

test('tax gross-up applies to the set-aside like to the rest (taxMult)', () => {
  const gl = flat(), sc = baseSc({ retAge: 45, hasChild: true });
  assert.ok(Math.abs(tempCostPV(45, sc, gl, 1.25) - 1.25 * 204000) < 1e-6);
});

test('discounting: at 5% the set-aside is the PV of each year at year end', () => {
  const gl = flat({ stockRet: 0.05, bondRet: 0.05 }), sc = baseSc({ retAge: 45, hasChild: true });
  let pv = 0; for (let k = 0; k < 17; k++) pv += 12000 / Math.pow(1.05, k + 1);   // 2036..2052
  assert.ok(Math.abs(tempCostPV(45, sc, gl, 1) - pv) < 1e-6);
});

test('projection: costs that end are paid in full on top of the SWR draw', () => {
  const gl = flat({ invested: 2e6 }), sc = baseSc({ retAge: 45, hasChild: true, hasProp: true });
  const p = project(sc, gl);
  const r2036 = p.rows.find(r => r.yr === 2036) || p.rows[10], r2057 = p.rows.find(r => r.yr === 2057) || p.rows[31];
  assert.equal(r2036.tempCost, 12000 + 9600);
  assert.equal(r2057.tempCost, 0);
  // in 2036 the budget is (2,000 - 1,000) x 12 + 21,600 and it is fully met
  assert.equal(r2036.swrTarget, 12000 + 21600);
  assert.ok(r2036.swrIncome >= r2036.swrTarget);
  assert.equal(r2036.withdrawal, 12000 + 21600);  // 0% tax: sells exactly the budget
});

test('total budget is unchanged (I2): permanent part + temporary part = yearOneBudget', () => {
  for (const c of goldenCases()) {
    const fy = c.gl.baseYear + c.sc.retAge - c.gl.currentAge;
    const total = yearOneBudget(c.sc.retAge, c.sc, c.gl), perm = yearOnePermBudget(c.sc.retAge, c.sc, c.gl);
    assert.ok(perm <= total + 1e-6, c.name);
    if (c.gl.partnerModel !== 'two' || !c.sc.hasPartner)
      assert.ok(Math.abs(perm + tempCostAt(fy, c.sc, c.gl) - total) < 1e-6 || perm === 0, c.name);
  }
});

test('two-person: your part of the costs that end is between 0 and all of them; all of them when she pays nothing', () => {
  const two = over => baseGl({ partnerModel: 'two', ...over });
  const sc = baseSc({ retAge: 45, hasPartner: true, hasChild: true, hasProp: true });
  const all = 9000 * Math.pow(1.02, 10) + mortgageAnnual(two());   // child (age 2 in 2036) + mortgage
  const mine = tempCostAt(2036, sc, two());
  assert.ok(mine > 0 && mine < all, `${mine} vs ${all}`);
  assert.ok(Math.abs(tempCostAt(2036, sc, two({ partnerInc: 0, partnerPension: 0 })) - all) < 1e-6);
});

test('nothing moves without costs that end, and fixed mode never moves', () => {
  for (const c of goldenCases().filter(c => c.gl.wdMode === 'fixed' || (!c.sc.hasChild && !c.sc.hasProp))) {
    assert.equal(project(c.sc, c.gl).tempPV, 0, c.name);
  }
});

test('earliest stop age: with a mortgage it no longer waits for the payoff year', () => {
  // flat economy, 2M invested: funded at 35 before, except the old rule priced the
  // mortgage as permanent. Today's rule: funded from the current age.
  const gl = flat({ invested: 1.2e6 }), sc = baseSc({ hasProp: true });
  const r = earliestStopAge(sc, gl);
  assert.equal(r.found, true);
  assert.ok(r.age < 57, 'was the payoff year 2057 (age 66) under the old rule; got ' + r.age);
});
