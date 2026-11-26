// v8.26 — health insurance once you stop, from your stop age until your first
// state pension. Hand-computed: presets from js/health.js, and a flat economy
// (0% returns, 0% inflation, no tax) where a present value is a plain sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthPresetMonthly, DE_HEALTH, FR_HEALTH, OTHER_HEALTH } from '../js/health.js';
import { project, tempCostAt, tempCostPV, yearOnePermBudget, yearOneBudget, healthCostAt, householdCosts, firstPensionAge } from '../js/engine.js';
import { baseGl, baseSc } from './golden-cases.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('DE preset: 21.1% of the monthly gain, between the minimum and maximum base', () => {
  assert.equal(DE_HEALTH.rate, 0.211);   // 14.0 + 2.9 + 4.2
  near(healthPresetMonthly('DE', 3000), 633);                 // 0.211 × 3,000
  near(healthPresetMonthly('DE', 500), 0.211 * 1318.33);      // floor: 278.17
  near(healthPresetMonthly('DE', 500), 278.17);
  near(healthPresetMonthly('DE', 8000), 0.211 * 5812.50);     // cap: 1,226.44
  near(healthPresetMonthly('DE', 0), 278.17);
  near(healthPresetMonthly('DE', 8000), 1226.44);                 // no gain still pays the minimum
});

test('FR preset: mutuelle + 6.5% of the yearly gain above half the PASS', () => {
  near(healthPresetMonthly('FR', 3000), 90 + 0.065 * (36000 - 24030) / 12);   // 154.84
  near(healthPresetMonthly('FR', 3000), 154.84);
  assert.equal(healthPresetMonthly('FR', 1000), FR_HEALTH.mutuelle);           // 12,000 < 24,030
});

test('other countries: a flat placeholder', () => {
  assert.equal(healthPresetMonthly('XX', 3000), OTHER_HEALTH);
  assert.equal(healthPresetMonthly(undefined, 3000), 250);
});

const flat = over => baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, windfalls: [], invested: 300000, samPersonalNow: 1500, samPersonalRet: 1500, soloShared: 500, ...over });
// alone: 2,000/month = 24,000/yr; stop at 45 = 2036; first pension at 67 (gl.pensionAge)

test('not modelled when neither an amount nor a gain is supplied (the old tests stay put)', () => {
  const gl = flat();
  assert.equal(healthCostAt(gl, 2036), 0);
  assert.equal(project(baseSc({ retAge: 45 }), gl).fireTarget, 600000);
});

test('typed €200/month: paid ages 45..66 = 22 years, a cost that ends, set aside', () => {
  const gl = flat({ healthAfterStop: 200 }), sc = baseSc({ retAge: 45 });
  assert.equal(firstPensionAge(gl), 67);
  assert.equal(healthCostAt(gl, 2057), 2400);                  // age 66
  assert.equal(healthCostAt(gl, 2058), 0);                     // age 67: the pension deduction covers it
  assert.equal(yearOneBudget(45, sc, gl), 26400);              // 24,000 + 2,400
  assert.equal(yearOnePermBudget(45, sc, gl), 24000);          // not priced for life
  assert.equal(tempCostAt(2036, sc, gl), 2400);
  assert.equal(tempCostPV(45, sc, gl, 1), 2400 * 22);          // 52,800
  assert.equal(project(sc, gl).fireTarget, 600000 + 52800);    // 24,000 / 4% + 52,800
  // fixed mode: 24,000 × 45 years (45..89) + 52,800
  assert.equal(project(sc, { ...gl, wdMode: 'fixed' }).fireTarget, 1080000 + 52800);
  const rows = project(sc, gl).rows;
  assert.equal(rows.find(r => r.age === 45).spending, 26400);
  assert.equal(rows.find(r => r.age === 66).spending, 26400);
  assert.equal(rows.find(r => r.age === 67).spending, 24000);
  assert.equal(rows.find(r => r.age === 44).spending, project(sc, flat()).rows.find(r => r.age === 44).spending);   // working years: no health line
});

test('ends at the FIRST pension, wherever it is from', () => {
  const gl = flat({ healthAfterStop: 200, pensionAmt: 500, pensionAge: 67, pension2Amt: 100, pension2Age: 63 });
  assert.equal(firstPensionAge(gl), 63);
  assert.equal(healthCostAt(gl, 2026 + 62 - 35), 2400);
  assert.equal(healthCostAt(gl, 2026 + 63 - 35), 0);
});

test('inflated like every other cost (today’s money)', () => {
  const gl = flat({ healthAfterStop: 200, inflation: 0.02 });
  near(healthCostAt(gl, 2036), 2400 * Math.pow(1.02, 10));
});

test('preset follows the country you live in that year', () => {
  const gl = flat({ healthGainMonthly: 3000,
    residence: [{ from: null, country: 'DE', tax: 0, col: 1 }, { from: 2040, country: 'FR', tax: 0, col: 1 }] });
  near(healthCostAt(gl, 2036), 633 * 12);
  near(healthCostAt(gl, 2040), 154.84 * 12, 0.1);
  // a typed amount wins over the preset everywhere
  assert.equal(healthCostAt({ ...gl, healthAfterStop: 300 }, 2040), 3600);
});

test('with the partner: on your personal side only, and only once you stop', () => {
  const gl = flat({ healthAfterStop: 200 }), sc = baseSc({ retAge: 45, hasPartner: true });
  const off = flat();
  assert.equal(householdCosts(2036, sc, gl, true).samPersonal - householdCosts(2036, sc, off, true).samPersonal, 2400);
  assert.equal(householdCosts(2036, sc, gl, false).samPersonal, householdCosts(2036, sc, off, false).samPersonal);
  assert.equal(householdCosts(2036, sc, gl, true, true).samPersonal, householdCosts(2036, sc, off, true, true).samPersonal);   // noTemp: not lifelong
  assert.equal(householdCosts(2036, sc, gl, true).shared, householdCosts(2036, sc, off, true).shared);                         // never split
  assert.ok(tempCostAt(2036, sc, gl) >= tempCostAt(2036, sc, off) + 2400 - 0.01);
});
