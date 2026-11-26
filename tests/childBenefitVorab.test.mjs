// v8.28 — child benefit (lowers the child cost) and the German yearly fund tax
// (Vorabpauschale). Hand-computed on flat economies where a present value is a sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { childCostAt, childBenefitAt, vorabAt, VORAB, project, tempCostAt, tempCostPV, yearOneBudget } from '../js/engine.js';
import { baseGl, baseSc } from './golden-cases.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const DE = [{ from: null, country: 'DE', tax: 0, col: 1 }], FR = [{ from: null, country: 'FR', tax: 0, col: 1 }];
const flat = over => baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, windfalls: [], invested: 300000, samPersonalNow: 1500, samPersonalRet: 1500, soloShared: 500,
  childBirthYear: 2030, childCostYearly: 12000, childCostUntilAge: 23, childMaternityMonths: 0, ...over });

test('child benefit by country: Germany 259 €/month, France 0 for a first child, a typed amount wins', () => {
  assert.equal(childBenefitAt(flat({ residence: DE }), 2036), 259);
  assert.equal(childCostAt(flat({ residence: DE }), 2036), 12000 - 259 * 12);     // 8,892
  assert.equal(childCostAt(flat({ residence: FR }), 2036), 12000);
  assert.equal(childCostAt(flat(), 2036), 12000);                                   // no country known: none
  assert.equal(childCostAt(flat({ residence: FR, childBenefit: 100 }), 2036), 10800);
  assert.equal(childCostAt(flat({ residence: DE, childBenefit: 2000 }), 2036), 0);   // never below 0
  assert.equal(childCostAt(flat({ residence: DE }), 2029), 0);                      // before birth
  assert.equal(childCostAt(flat({ residence: DE }), 2053), 0);                      // cost ended (age 23)
});

test('child benefit stops at 25 even if the cost runs longer', () => {
  const gl = flat({ residence: DE, childCostUntilAge: 27 });
  assert.equal(childCostAt(gl, 2030 + 24), 8892);
  assert.equal(childCostAt(gl, 2030 + 25), 12000);
});

test('child benefit follows a move: Germany then France', () => {
  const gl = flat({ residence: [DE[0], { from: 2040, country: 'FR', tax: 0, col: 1 }] });
  assert.equal(childCostAt(gl, 2039), 8892);
  assert.equal(childCostAt(gl, 2040), 12000);
});

test('the FIRE target uses the net child cost: 600,000 + 8,892 × 17 = 751,164 (was 804,000)', () => {
  const gl = flat({ residence: DE }), sc = baseSc({ retAge: 45, hasChild: true });
  assert.equal(yearOneBudget(45, sc, gl), 24000 + 8892);
  assert.equal(tempCostAt(2036, sc, gl), 8892);
  assert.equal(tempCostPV(45, sc, gl, 1), 8892 * 17);
  assert.equal(project(sc, gl).fireTarget, 600000 + 8892 * 17);
  assert.equal(project(sc, gl).rows.find(r => r.yr === 2036).childCost, 8892);
});

test('German yearly fund tax: 3.20% × 70% of the start value, at most the gain, less the allowance', () => {
  const de = r => ({ residence: [{ from: null, country: 'DE', tax: 0.185, col: 1 }], taxRate: 0.185, ...r });
  assert.equal(VORAB.basiszins, 0.032);
  const free = 1000 / 0.7;                                                     // 1,428.57 of fund gain
  near(vorabAt(de({}), 2026, 100000, 0.07).tax, (2240 - free) * 0.185);       // 150.11
  near(vorabAt(de({}), 2026, 1e6, 0.07).tax, (22400 - free) * 0.185);         // 3,879.71
  near(vorabAt(de({}), 2026, 1e6, 0.07).base, 22400);
  near(vorabAt(de({}), 2026, 1e6, 0.01).tax, (10000 - free) * 0.185);         // capped at the year's gain
  assert.equal(vorabAt(de({}), 2026, 1e6, -0.1).tax, 0);                      // a losing year: none
  assert.equal(vorabAt(de({}), 2026, 50000, 0.07).tax, 0);                    // 1,120 < allowance
  near(vorabAt(de({ taxJoint: true }), 2026, 1e6, 0.07).tax, (22400 - 2 * free) * 0.185);
  assert.equal(vorabAt({ residence: FR, taxRate: 0.3 }, 2026, 1e6, 0.07).tax, 0);
});

test('in the projection: paid from the portfolio each German year, and it raises the cost basis', () => {
  const mk = country => baseGl({ invested: 1e6, cash: 0, windfalls: [], inflation: 0, stockRet: 0.07, bondRet: 0.07,
    taxRate: 0.185, residence: [{ from: null, country, tax: 0.185, col: 1 }] });
  const sc = baseSc({ retAge: 45 });
  const de = project(sc, mk('DE')), xx = project(sc, mk('XX'));
  const r0 = de.rows[0];
  near(r0.vorabTax, Math.round(vorabAt(mk('DE'), 2026, 1e6, r0.portReturn / 1e6).tax), 1);
  assert.equal(xx.rows[0].vorabTax, 0);
  assert.ok(r0.vorabTax > 3000);
  // less in the pot in Germany, but a lower gain fraction (part of the gain was taxed already)
  assert.ok(de.values[5] < xx.values[5]);
  assert.ok(de.gainFracAtRet < xx.gainFracAtRet);
});
