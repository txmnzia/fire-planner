// v8.22: "Your home": a confirmed purchase is a fact. Made-up numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, purchaseCostFor, mortgagePaymentAt } from '../js/engine.js';
import { effectiveFeatures } from '../js/checks.js';
import { yearEndChanges } from '../js/yearEnd.js';
import { rentShift } from '../js/ui/housing.js';
import { baseGl, baseSc } from './golden-cases.mjs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const flat = over => baseGl({ partnerModel: 'two', stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, windfalls: [], invested: 300000, spendNow: 0, spendRet: 0, samPersonalNow: 1000, samPersonalRet: 1000,
  sharedNow: 2000, sharedRet: 2000, partnerPaysIn: 0, partnerInc: 0, partnerPension: 0, yearlyItems: 0, soloShared: 1400,
  propBuyYear: 2026, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.1, propMortgageRate: 0.03, propMortgageTerm: 25,
  propRentSaved: 0, propCharges: 300, rentInJoint: true, ...over });

test('a home you own: its cash is never charged again; everything else is the same (hand-computed)', () => {
  assert.equal(purchaseCostFor({ propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.1, homeOwned: true }, {}), 0);
  assert.ok(Math.abs(purchaseCostFor({ propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.1 }, {}) - 90000) < 1e-6);   // 300k × 30%
  const sc = baseSc({ income: 4000, hasProp: true, hasPartner: false, retAge: 60 });
  const plan = project(sc, flat()), own = project(sc, flat({ homeOwned: true }));
  // bought this year (2026): the plan pays the 90,000 cash in 2026, the owner already did (it left the portfolio)
  assert.ok(Math.abs(plan.rows[0].extraCost - 90000) < 1e-6); assert.ok(!own.rows[0].extraCost);
  assert.ok(Math.abs(own.values[1] - plan.values[1] - 90000) < 1e-6);              // no returns, no tax: exactly the cash
  // the loan and charges run the same in both
  assert.equal(mortgagePaymentAt(flat({ homeOwned: true }), 2030), mortgagePaymentAt(flat(), 2030));
  assert.equal(own.rows[5].mortgage ?? null, plan.rows[5].mortgage ?? null);
});

test('a home you own is on in every scenario (a fact, not a switch)', () => {
  const gl = { propPrice: 300000, homeOwned: true };
  assert.equal(effectiveFeatures({ prop: false }, gl).prop, true);
  assert.equal(effectiveFeatures({ prop: false }, { propPrice: 300000 }).prop, false);
  assert.equal(effectiveFeatures({ prop: true }, { propPrice: 0, homeOwned: true }).prop, false);   // nothing set up
});

test('confirming: rent goes to 0 and the joint transfers drop by it, split like today', () => {
  // rent 2,000; you 2,400 and she 600 into joint (her 20%) → you −1,600, she −400
  assert.deepEqual(rentShift(2000, 0, 2400, 600), { you: 800, she: 200, delta: -2000 });
  const ui = read('js/ui/versions.js');
  assert.match(ui, /becomeOwner\(before\); \}/);   // remembers which scenarios had the plan on, for the undo
  assert.match(ui, /setMoney\("propRentSaved", 0\)/);
  assert.match(ui, /state\.home = \{ since: /);
});

test('year-end: the price of a home you own is never raised', () => {
  const f = { propPrice: '300000', samPersonalNow: '1000' };
  assert.deepEqual(yearEndChanges(f, 2026, 0.02, [], true).map(c => c.id), ['samPersonalNow']);
  assert.deepEqual(yearEndChanges(f, 2026, 0.02, [], false).map(c => c.id).sort(), ['propPrice', 'samPersonalNow']);
});

test('saved and synced; the grid hides the switch; Your home layout', () => {
  assert.match(read('js/sync.js'), /home: state\.home/);
  assert.match(read('js/inputs.js'), /homeOwned:\s+!!state\.home/);
  assert.match(read('js/ui/plans.js'), /row\.hidden = !up\[k\] \|\| owned/);
  assert.match(read('js/ui/housing.js'), /'Your home '/);
  assert.match(read('js/checks.js'), /!gl\.homeOwned && !\(gl\.propRentSaved > 0\)/);
});
