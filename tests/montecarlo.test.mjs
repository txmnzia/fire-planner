// Unit tests for the Monte Carlo engine (js/montecarlo.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mcGeoMean, mulberry32, mcBuildPath, mcPct, runMonteCarlo,
  MC_HIST_STOCK, MC_HIST_BOND,
} from '../js/montecarlo.js';

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
const scenarios = [{ id: 1, retAge: 42, income: 6700, chgYear: null, chgInc: null,
                     hasPartner: false, hasProp: false, hasChild: false }];

test('historical stock and bond series stay aligned by year', () => {
  assert.equal(MC_HIST_STOCK.length, MC_HIST_BOND.length);
});

test('mulberry32: seeded PRNG is reproducible and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('mcGeoMean: compound mean of a flat series is the value itself', () => {
  assert.ok(Math.abs(mcGeoMean([0.05, 0.05, 0.05]) - 0.05) < 1e-12);
});

test('mcPct: linear-interpolated percentiles', () => {
  assert.equal(mcPct([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(mcPct([1, 2], 0.5), 1.5);
  assert.equal(mcPct([], 0.5), 0);
});

test('mcBuildPath: recentered path geo-means match the assumed returns', () => {
  const hS = mcGeoMean(MC_HIST_STOCK), hB = mcGeoMean(MC_HIST_BOND);
  // A path long enough to cycle the whole dataset many times converges on the anchor.
  const seq = mcBuildPath(mulberry32(7), 5000, 5, true, 0.07, 0.03, hS, hB);
  const gs = mcGeoMean(seq.map(x => x.stock)), gb = mcGeoMean(seq.map(x => x.bond));
  assert.ok(Math.abs(gs - 0.07) < 0.01, `stock geo-mean ${gs} not ≈ 0.07`);
  assert.ok(Math.abs(gb - 0.03) < 0.01, `bond geo-mean ${gb} not ≈ 0.03`);
});

test('runMonteCarlo: deterministic for a fixed seed', () => {
  const gl = makeGl();
  const cfg = { sims: 200, blockLen: 5, recenter: true, seed: 123 };
  const [a] = runMonteCarlo(scenarios, gl, cfg);
  const [b] = runMonteCarlo(scenarios, gl, cfg);
  assert.deepEqual(a.bands.p50, b.bands.p50);
  assert.equal(a.successRate, b.successRate);
});

test('runMonteCarlo: percentile bands are ordered p10 ≤ p50 ≤ p90', () => {
  const gl = makeGl();
  const [r] = runMonteCarlo(scenarios, gl, { sims: 200, blockLen: 5, recenter: true, seed: 1 });
  for (let y = 0; y < r.bands.p50.length; y++) {
    assert.ok(r.bands.p10[y] <= r.bands.p50[y] + 1e-9);
    assert.ok(r.bands.p50[y] <= r.bands.p90[y] + 1e-9);
  }
  assert.ok(r.successRate >= 0 && r.successRate <= 1);
});

test('runMonteCarlo: SWR mode reports adequacy metrics, fixed mode does not', () => {
  const glSwr = makeGl(), glFixed = makeGl({ wdMode: 'fixed' });
  const cfg = { sims: 100, blockLen: 5, recenter: true, seed: 9 };
  const [rs] = runMonteCarlo(scenarios, glSwr, cfg);
  const [rf] = runMonteCarlo(scenarios, glFixed, cfg);
  assert.ok(rs.fundedRate !== null && rs.typicalCoverage !== null && rs.ratioBands !== null);
  assert.equal(rf.fundedRate, null);
  assert.equal(rf.ratioBands, null);
});
