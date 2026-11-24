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

// v8.19, the stricter rule (owner's decision): in % mode, when your cost rises later
// (her share falls: she stops before her pension), the FIRE number already includes
// that rise, and a stop age is funded only once the portfolio reaches it.
// Flat economy (no returns, no inflation, no tax), so every figure is by hand:
//   you 1,000 own + 2,000 shared; she earns 2,000 until 50, then nothing until her pension of 1,000 at 70.
//   Year one (45): your cost c solves c = 1,000 + 2,000 × c/(2,000 + c)  →  c = 2,000, her share 50%
//     → 2,000 × 12 / 4% = 600,000.
//   50–69 (20 years): her share 0 → +1,000/month       → +20 × 12,000 = 240,000
//   70–89 (20 years): c = 1,000 + √2,000,000, share 1,000/(1,000 + c) → +2,000 × (0.5 − share)/month
const flat2 = over => baseGl({ partnerModel: 'two', stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, windfalls: [], invested: 300000, spendNow: 0, spendRet: 0, samPersonalNow: 1000, samPersonalRet: 1000,
  sharedNow: 2000, sharedRet: 2000, partnerPaysIn: 0, partnerInc: 2000, partnerRetAge: 50, partnerPension: 1000,
  partnerPensionAge: 70, partnerAgeOff: 0, yearlyItems: 0, soloShared: 1400, ...over });
test('v8.19 stricter rule: the FIRE number includes the later rise of your cost (hand-computed)', () => {
  const p = project(baseSc({ income: 4000, hasPartner: true, retAge: 45 }), flat2());
  const c70 = 1000 + Math.sqrt(2e6), share70 = 1000 / (1000 + c70);
  const expAdj = 600000 + 20 * 12 * 1000 + 20 * 12 * 2000 * (0.5 - share70);   // ≈ 939,411
  assert.equal(p.fireTargetYearOne, 600000);
  assert.ok(Math.abs(p.fireTargetAdj - expAdj) <= 1, p.fireTargetAdj + ' vs ' + expAdj);
  assert.equal(p.laterRise, true);
  assert.equal(p.fireTarget, p.fireTargetAdj);            // the higher one is the headline
  // her income steady to her pension → no later rise → the year-one number stays the headline
  const q = project(baseSc({ income: 4000, hasPartner: true, retAge: 45 }), flat2({ partnerRetAge: 70, partnerPension: 2000 }));
  assert.equal(q.laterRise, false); assert.equal(q.fireTarget, q.fireTargetYearOne);
  // fixed mode is untouched (it was always year by year)
  const f = project(baseSc({ income: 4000, hasPartner: true, retAge: 45 }), flat2({ wdMode: 'fixed' }));
  assert.equal(f.laterRise, false); assert.equal(f.fireTarget, f.fireTargetAdj);
});

test('v8.19 stricter rule: a stop age is funded only when the portfolio reaches that number (hand-computed)', () => {
  // she earns until 60 instead; you take home 6,000 → you save 6,000 − 3,000 = 3,000/month = 36,000 a year
  // (while both work: your cost is your own 1,000 + the joint costs she does not pay; paysIn 0 → pro rata).
  // FIRE number at any stop age before 60: 600,000 + 10 × 12,000 (60–69) + 20 × 12 × 2,000 × (0.5 − share70) ≈ 819,411.
  // Year-one rule alone: funded at 44 (624,000 → 2,080/month ≥ 2,000). Stricter: 300,000 + 36,000 × n ≥ 819,411 → n = 15 → 50.
  const g = flat2({ partnerRetAge: 60 }), s = baseSc({ income: 6000, hasPartner: true });
  const r = earliestStopAge(s, g);
  assert.equal(r.found, true); assert.equal(r.age, 50);
  const at = a => project(baseSc({ income: 6000, hasPartner: true, retAge: a }), g);
  const c70 = 1000 + Math.sqrt(2e6), share70 = 1000 / (1000 + c70);
  assert.ok(Math.abs(at(44).fireTarget - (720000 + 20 * 12 * 2000 * (0.5 - share70))) <= 1);
  assert.equal(at(60).values[24], 300000 + 36000 * 24);    // 1,164,000 at 59 still working: the saving rate is as stated
  assert.equal(at(50).values[15], 840000);                   // stop year 2041: ≥ 819,411
  assert.equal(at(49).values[14], 804000);                   // one year earlier: short
  assert.equal(isFunded(baseSc({ income: 6000, hasPartner: true, retAge: 49 }), g, at(49)), false);
  assert.equal(isFunded(baseSc({ income: 6000, hasPartner: true, retAge: 44 }), g, at(44)), false);   // year-one would say yes
});
