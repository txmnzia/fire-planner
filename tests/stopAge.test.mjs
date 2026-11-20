// Automatic stop age (v8.1): the earliest age at which a scenario is funded, by
// the same verdict the grid and Results tiles show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../js/engine.js';
import { earliestStopAge, withStopAges, isFunded, scenarioGridResults, STOP_AGE_MIN, STOP_AGE_MAX } from '../js/ui/cards.js';
import { state } from '../js/state.js';
import { fmtK } from '../js/util.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

state.nwHistory = [];

// A household simple enough to solve by hand: no returns, no inflation, no tax,
// no pension, no cash, no partner. Start 300k, save (4,000 - 2,000) x 12 = 24k/yr.
// % mode, 4%: funded when 4% of the portfolio covers 2,000/mo, i.e. portfolio
// >= 2,000 x 12 / 0.04 = 600k. 300k + 24k x n >= 600k  ->  n = 12.5  ->  13 years.
const flat = over => baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0,
  cashReturn: 0, pensionAmt: 0, windfalls: [], invested: 300000, spendNow: 2000, spendRet: 2000, ...over });
const flatSc = over => baseSc({ income: 4000, ...over });

test('hand-computed: earliest stop age is 35 + 13 = 48 (% mode)', () => {
  const r = earliestStopAge(flatSc(), flat());
  assert.equal(r.found, true);
  assert.equal(r.age, 48);
  assert.equal(r.proj.values[13], 300000 + 24000 * 13);   // 612k at the start of the stop year
  assert.equal(isFunded(flatSc({ retAge: 47 }), flat(), project(flatSc({ retAge: 47 }), flat())), false); // 588k
});

test('hand-computed: fixed mode on the same household', () => {
  // Fixed mode is funded when net worth at stop >= FIRE target (PV of 2,000/mo to 90 at 0% = 24k x years left).
  // At age a: 300k + 24k(a-35) >= 24k(90-a)  ->  a >= (90+35)/2 - 300/48 = 62.5 - 6.25 = 56.25 -> 57.
  const r = earliestStopAge(flatSc(), flat({ wdMode: 'fixed' }));
  assert.equal(r.age, 57);
});

test('already funded today: the earliest age is the current age', () => {
  const r = earliestStopAge(flatSc(), flat({ invested: 10e6 }));
  assert.equal(r.found, true); assert.equal(r.age, 35);
});

test('never funded: found is false and the scenario is shown at the last age tried', () => {
  const r = earliestStopAge(flatSc({ income: 2000 }), flat({ invested: 0 }));   // saves nothing, owns nothing
  assert.equal(r.found, false); assert.equal(r.age, STOP_AGE_MAX);
  const g = scenarioGridResults(r.sc, flat({ invested: 0 }), r.proj, r);
  assert.equal(g.stopAgeText, 'not by 75');
  assert.ok(g.margin < 0);
});

test('bounds: never below 30 or the current age, never above 75 or life expectancy - 1', () => {
  assert.equal(earliestStopAge(flatSc(), flat({ invested: 10e6, currentAge: 25 })).age, STOP_AGE_MIN);
  assert.equal(earliestStopAge(flatSc({ income: 2000 }), flat({ invested: 0, lifeExp: 70 })).age, 69);
});

test('property, all 192 golden households: the age found is funded and the year before is not', () => {
  for (const c of goldenCases()) {
    const r = earliestStopAge(c.sc, c.gl);
    if (!r.found) continue;
    assert.equal(isFunded(r.sc, c.gl, r.proj), true, c.name);
    if (r.age > Math.max(STOP_AGE_MIN, c.gl.currentAge)) {
      const prev = { ...c.sc, retAge: r.age - 1 };
      assert.equal(isFunded(prev, c.gl, project(prev, c.gl)), false, c.name + ' one year earlier');
    }
    // the projection returned is exactly the one for that age (no stale reuse)
    assert.deepEqual(r.proj.values, project(r.sc, c.gl).values);
  }
});

test('the grid shows the age and the margin = net worth at stop - FIRE number', () => {
  const r = earliestStopAge(flatSc(), flat());
  const g = scenarioGridResults(r.sc, flat(), r.proj, r);
  assert.equal(g.stopAgeText, '48 · 2039');
  assert.equal(g.margin, 612000 - r.proj.fireTarget);
  assert.equal(g.marginText, '+' + fmtK(612000 - r.proj.fireTarget));
});

test('withStopAges: a scenario with a missing input is not searched', () => {
  const gl = baseGl({ partnerModel: 'two', samPersonalNow: 0, samPersonalRet: 0, sharedNow: 0, sharedRet: 0, soloShared: 0 });
  const [r] = withStopAges([baseSc({ hasPartner: true, retAge: 52 })], gl);
  assert.equal(r.missing, true); assert.equal(r.found, false); assert.equal(r.sc.retAge, 52);
});

test('withStopAges: never mutates the scenarios it is given', () => {
  const scs = [baseSc({ retAge: 52 }), baseSc({ retAge: 41, hasProp: true })], copy = structuredClone(scs);
  withStopAges(scs, baseGl());
  assert.deepEqual(scs, copy);
});

test('fixed mode: an age whose path runs dry before life expectancy is never chosen', () => {
  for (const c of goldenCases().filter(c => c.gl.wdMode === 'fixed')) {
    const r = earliestStopAge(c.sc, c.gl);
    if (!r.found) continue;
    assert.ok(r.proj.values.slice(r.age - c.gl.currentAge).every(v => v > 0) && r.proj.finalNetWorth > 0, c.name);
    assert.equal(r.proj.infeasibleYear ?? null, null, c.name);
  }
});
