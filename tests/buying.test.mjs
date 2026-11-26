// v8.13 Buying: fixed-rate period and rate after, ownership charges, her share of
// the purchase, home equity, country buying costs. Made-up numbers, hand-computed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mortgageSchedule, mortgagePaymentAt, mortgageBalanceAt, mortgageAnnual, ownershipAnnual,
         purchaseCostFor, homeEquityAt, householdCosts, project } from '../js/engine.js';
import { buyCostPreset } from '../js/countries.js';

const gl = (over = {}) => ({
  currentAge: 35, lifeExp: 90, baseYear: 2026, inflation: 0, gainFrac: 0, stockRet: 0, bondRet: 0,
  stockAlloc: 1, bondAllocRet: 0, taxRate: 0.3, pensionAmt: 0, pensionAge: 67, cash: 0, cashReturn: 0,
  windfalls: [], wdMode: 'fixed', swr: 0.04, invested: 500000, spendNow: 0, spendRet: 0,
  partnerInc: 2000, partnerRetAge: 65, partnerPension: 0, partnerPensionAge: 67, partnerAgeOff: 0,
  partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 2000, sharedRet: 2000,
  soloShared: 1400, partnerPaysIn: 500, yearlyItems: 0,
  propBuyYear: 2030, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.1, propMortgageRate: 0,
  propMortgageTerm: 20, propRentSaved: 1000, propFixedYears: null, propRateAfter: null, propCharges: 0, propHerShare: 0,
  childBirthYear: 2030, childCostYearly: 0, childCostUntilAge: 20, childMaternityMonths: 0, childMaternityIncome: 0, ...over });
const sc = (over = {}) => ({ id: 1, retAge: 60, income: 6000, chgYear: null, chgInc: null, hasPartner: true, hasProp: true, hasChild: false, ...over });

test('0% loan fixed for good: 240,000 over 20 years = 12,000/yr, as before', () => {
  const g = gl();
  assert.equal(mortgageSchedule(g).pay1, 12000);
  assert.equal(mortgagePaymentAt(g, 2029), 0); assert.equal(mortgagePaymentAt(g, 2030), 12000);
  assert.equal(mortgagePaymentAt(g, 2049), 12000); assert.equal(mortgagePaymentAt(g, 2050), 0);
  assert.equal(mortgageAnnual(g), 12000);
  assert.equal(mortgageBalanceAt(g, 2030), 240000); assert.equal(mortgageBalanceAt(g, 2040), 120000);
  assert.equal(mortgageBalanceAt(g, 2050), 0);
});

test('fixed for 10 years at 0%, then 6%: payment on the 120,000 left over the last 10 years', () => {
  const g = gl({ propFixedYears: 10, propRateAfter: 0.06 });
  const mr = 0.005, n = 120, p2 = 120000 * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1);
  const s = mortgageSchedule(g);
  assert.equal(s.pay1, 12000); assert.ok(Math.abs(s.pay2 - p2 * 12) < 1e-6);   // ≈ 15,987/yr
  assert.equal(mortgagePaymentAt(g, 2039), 12000);
  assert.ok(Math.abs(mortgagePaymentAt(g, 2040) - p2 * 12) < 1e-6);
  assert.ok(Math.abs(mortgageBalanceAt(g, 2050)) < 1e-6);                      // paid off on time
  // same rate after = fixed for good
  assert.equal(mortgageSchedule(gl({ propFixedYears: 10, propRateAfter: 0 })).pay2, 12000);
});

test('ownership charges: from the purchase year, for good, shared like the joint costs', () => {
  const g = gl({ propCharges: 300 });
  assert.equal(ownershipAnnual(g, sc(), 2029), 0); assert.equal(ownershipAnnual(g, sc(), 2030), 3600);
  assert.equal(ownershipAnnual(g, sc(), 2080), 3600); assert.equal(ownershipAnnual(g, sc({ hasProp: false }), 2040), 0);
  const c = householdCosts(2031, sc(), g, false);
  assert.equal(c.ownership, 3600);
  assert.equal(c.shared, 2000 * 12 + 12000 + 3600 - 1000 * 12);   // joint + loan + charges − rent saved
});

test('her share of the down payment + buying costs: only in scenarios with her', () => {
  const g = gl({ propHerShare: 0.25 });
  assert.ok(Math.abs(purchaseCostFor(g, sc()) - 67500) < 1e-6);           // 300,000 × 30% × 75%
  assert.ok(Math.abs(purchaseCostFor(g, sc({ hasPartner: false })) - 90000) < 1e-6);
  const p = project(sc(), g);
  assert.ok(Math.abs(p.rows[p.years.indexOf(2030)].extraCost - 67500) < 1e-6);
});

test('home equity: price growing with inflation minus the loan left', () => {
  const g = gl({ inflation: 0.02 });
  assert.equal(homeEquityAt(g, sc(), 2029), 0);
  // v8.25: the price is today's money, paid at 300k × 1.02^4 in 2030; the loan scales with it
  assert.ok(Math.abs(homeEquityAt(g, sc(), 2040) - (300000 * Math.pow(1.02, 14) - 120000 * Math.pow(1.02, 4))) < 1e-6);
  assert.equal(homeEquityAt(g, sc({ hasProp: false }), 2040), 0);
});

test('charges raise the FIRE number by their lifelong cost (fixed mode, alone, flat: 3,600/yr × 30 years)', () => {
  const s = sc({ hasPartner: false, retAge: 60 });
  // no returns, gain fraction 0: each year's 3,600 adds exactly 3,600 to the PV
  const a = project(s, gl({ propCharges: 0 })), b = project(s, gl({ propCharges: 300 }));
  assert.equal(b.fireTarget - a.fireTarget, 3600 * 30);
});

test('country buying costs: Germany 10%, France 8%, elsewhere 8%', () => {
  assert.equal(buyCostPreset('DE'), 10); assert.equal(buyCostPreset('FR'), 8); assert.equal(buyCostPreset('PT'), 8);
});
