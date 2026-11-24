// v8.9: two state pensions (Germany, France), each from its own age; the net
// estimate read-out; assumption defaults; check-in stamps. Made-up numbers,
// flat economy (no inflation, no returns) so every figure is hand-computable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, computeFireTarget, pensionMonthlyAt, pensionList } from '../js/engine.js';
import { pensionNetEstimate, PENSION_COUNTRIES } from '../js/pensions.js';
import { refreshedText } from '../js/ui/spending.js';

const gl = (over = {}) => ({
  currentAge: 35, lifeExp: 70, baseYear: 2026, spendNow: 0, spendRet: 0, inflation: 0,
  gainFrac: 0, stockRet: 0, bondRet: 0, stockAlloc: 1, bondAllocRet: 0, taxRate: 0.3,
  pensionAmt: 800, pensionAge: 67, pension2Amt: 400, pension2Age: 64,
  cash: 0, cashReturn: 0, windfalls: [], wdMode: 'swr', swr: 0.04, invested: 100000,
  partnerInc: 0, partnerRetAge: 65, partnerPension: 0, partnerPensionAge: 67, partnerAgeOff: 0,
  partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 0, sharedRet: 0,
  soloShared: 2000, partnerPaysIn: 0, yearlyItems: 0,
  propBuyYear: 2040, propPrice: 0, propDownPct: 0.2, propTxCostPct: 0.08, propMortgageRate: 0.03,
  propMortgageTerm: 25, propRentSaved: 0, childBirthYear: 2030, childCostYearly: 0, childCostUntilAge: 20,
  childMaternityMonths: 0, childMaternityIncome: 0, ...over });
const sc = (over = {}) => ({ id: 1, retAge: 60, income: 4000, chgYear: null, chgInc: null,
  hasPartner: false, hasProp: false, hasChild: false, ...over });

test('pensionMonthlyAt: each pension from its own age', () => {
  const g = gl();
  assert.equal(pensionMonthlyAt(g, 63), 0);
  assert.equal(pensionMonthlyAt(g, 64), 400);
  assert.equal(pensionMonthlyAt(g, 67), 1200);
  assert.deepEqual(pensionList(g), [{ amt: 800, age: 67 }, { amt: 400, age: 64 }]);
  assert.deepEqual(pensionList(gl({ pension2Amt: 0 })), [{ amt: 800, age: 67 }]);
});

test('projection: both pensions flow from their ages', () => {
  const p = project(sc(), gl());
  const at = age => p.rows[p.years.indexOf(2026 + age - 35)].pension;
  assert.equal(at(63), 0); assert.equal(at(64), 4800); assert.equal(at(66), 4800); assert.equal(at(67), 14400);
});

test('% mode target: pensions already flowing are netted (hand-computed)', () => {
  // budget 1,000 own + 2,000 if alone = 3,000/mo
  assert.equal(computeFireTarget(70 - 1, sc({ retAge: 69 }), gl({ lifeExp: 90 }), 1), (3000 - 1200) * 12 / 0.04); // 540,000
  assert.equal(computeFireTarget(65, sc({ retAge: 65 }), gl({ lifeExp: 90 }), 1), (3000 - 400) * 12 / 0.04);      // 780,000
});

test('fixed mode target: year by year with each pension from its age (hand-computed)', () => {
  // 60..69: 4 years at 36,000, 3 at 31,200 (French from 64), 3 at 21,600 (both from 67) = 302,400
  assert.equal(computeFireTarget(60, sc(), gl({ wdMode: 'fixed' }), 1), 144000 + 93600 + 64800);
});

test('a single pension behaves exactly as before (no French pension)', () => {
  const a = project(sc({ retAge: 50 }), gl({ pension2Amt: 0, inflation: 0.02, stockRet: 0.06 }));
  const b = project(sc({ retAge: 50 }), gl({ pension2Amt: undefined, pension2Age: undefined, inflation: 0.02, stockRet: 0.06 }));
  assert.deepEqual(a.values, b.values); assert.equal(a.fireTarget, b.fireTarget); assert.equal(a.fireTargetAdj, b.fireTargetAdj);
});

test('net estimate: certain social charges only, rounded; nothing for empty amounts', () => {
  assert.equal(pensionNetEstimate('DE', 1000), Math.round(1000 * (1 - PENSION_COUNTRIES.DE.deduction)));
  assert.equal(pensionNetEstimate('FR', 1000), 909);   // 9.1% CSG + CRDS + CASA
  assert.equal(pensionNetEstimate('FR', 0), 0);
  assert.equal(pensionNetEstimate('XX', 1000), 0);
});

test('check-in date line: stale after the tile\'s own period', () => {
  const today = new Date('2027-03-01T12:00:00Z');
  assert.equal(refreshedText('2026-04-01', today, 365).stale, false);
  assert.equal(refreshedText('2026-02-01', today, 365).stale, true);
});

test('markup: two pension rows, a reset button, and "Living alone" in the grid', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['pensionAmt', 'pensionAge', 'pension2Amt', 'pension2Age', 'pensionUpdated', 'pensionReadout', 'assumpReadout'])
    assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /onclick="resetAssumptions\(\)"/);
  assert.match(html, /Living alone <button/);
  const sync = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  for (const id of ['pension2Amt', 'pension2Age', 'pensionUpdated']) assert.match(sync, new RegExp("'" + id + "'"));
});

test('assumptions: only values that differ from the default are listed', async () => {
  const { assumptionChanges, ASSUMPTION_DEFAULTS } = await import('../js/assumptions.js');
  assert.deepEqual(assumptionChanges({ ...Object.fromEntries(Object.entries(ASSUMPTION_DEFAULTS).map(([k, v]) => [k, String(v)])) }), []);
  assert.deepEqual(assumptionChanges({ stockRet: '6', bondRet: '3', inflation: '2.5' }), ['stocks 6% (default 7%)', 'inflation 2.5% (default 2%)']);
});
