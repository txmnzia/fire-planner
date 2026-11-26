// v8.5 — fixed-mode FIRE number with a rising gain fraction. Selling
// proportionally keeps the portfolio's gain fraction, but each year of growth on
// what is left adds gain with no cost basis, so later withdrawals are taxed more.
// The pre-v8.5 target used the gain fraction at retirement for every year, so
// households "funded" by up to ~15% still ran dry (found during v8.1 testing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { project, computeFireTarget, taxMultAfter } from '../js/engine.js';
import { goldenCases } from './golden-cases.mjs';

test('taxMultAfter, by hand: g0 = 40%, tax 30%, one year at 7%', () => {
  const tm0 = 1 / (1 - 0.4 * 0.3);                       // 1.13636
  const g1 = 1 - 0.6 / 1.07;                             // 0.439252
  assert.ok(Math.abs(taxMultAfter(tm0, 0.3, 0.07, 1) - 1 / (1 - g1 * 0.3)) < 1e-12);
  assert.ok(Math.abs(taxMultAfter(tm0, 0.3, 0.07, 0) - tm0) < 1e-12);
  assert.equal(taxMultAfter(1, 0, 0.07, 30), 1);         // no tax, no gross-up
  assert.ok(Math.abs(taxMultAfter(tm0, 0.3, 0, 30) - tm0) < 1e-12);   // no growth, no new gain
  assert.ok(taxMultAfter(tm0, 0.3, 0.07, 60) < 1 / (1 - 0.3) + 1e-9); // bounded by an all-gain portfolio
});

test('the year-by-year form equals the old closed form when tax is held flat (alone: 288 cases)', () => {
  // v8.23: one model; the closed form covers the scenarios without her (with her the target is year by year only)
  let n = 0;
  for (const c of goldenCases().filter(c => c.gl.wdMode === 'fixed' && !c.sc.hasPartner))
    for (const age of [36, 45, 55, 66, 70, 80]) for (const tm of [1, 1.15]) {
      n++;
      assert.equal(computeFireTarget(age, c.sc, c.gl, tm, { dcfLoop: 'flat' }), computeFireTarget(age, c.sc, c.gl, tm, { closedForm: true }), c.name + ' ' + age);
    }
  assert.equal(n, goldenCases().filter(c => c.gl.wdMode === 'fixed' && !c.sc.hasPartner).length * 12);
  assert.ok(n >= 240, 'cases ' + n);
});

test('rising tax never lowers the target, and raises it whenever there is tax and growth', () => {
  for (const c of goldenCases().filter(c => c.gl.wdMode === 'fixed' && !c.sc.hasPartner)) {   // v8.23: alone (with her: year by year only)
    const tm = 1.15;
    const rising = computeFireTarget(45, c.sc, c.gl, tm), flat = computeFireTarget(45, c.sc, c.gl, tm, { closedForm: true });
    assert.ok(rising >= flat, c.name);
    if (flat > 0) assert.ok(rising > flat, c.name);
  }
});

test('funded means the money lasts: no household 3% above its fixed-mode target runs dry', () => {
  // Before v8.5: 96 of ~1,900 funded stop ages ran dry, up to 14.7% above target.
  let checked = 0;
  for (const c of goldenCases().filter(c => c.gl.wdMode === 'fixed')) for (let a = 38; a <= 70; a++) {
    const sc = { ...c.sc, retAge: a }, p = project(sc, c.gl), i = a - c.gl.currentAge;
    if (p.values[i] < p.fireTarget * 1.03) continue;
    checked++;
    const dry = p.values.slice(i + 1).some(v => v <= 0) || p.finalNetWorth <= 0 || p.infeasibleYear != null;
    assert.equal(dry, false, `${c.name} stop ${a}`);
  }
  assert.ok(checked > 800, 'checked ' + checked);   // v8.23: half the golden cases (one model)
});
