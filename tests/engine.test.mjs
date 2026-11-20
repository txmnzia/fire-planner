// Unit tests for the pure financial engine (js/engine.js).
// Run with: node --test tests/   (no dependencies beyond Node ≥ 20)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annuityPV, mortgageAnnual, portReturnAt, yearOneBudget,
  computeFireTarget, project, buildPlanProj, planYearsAhead,
  partnerShare, partnerIncomeAt, twoPersonCost, selfFundedCost, computeHouseholdTarget,
  partnerSeparation, partnerContributionNote,
} from '../js/engine.js';
import { readFileSync } from 'node:fs';

// A globals object mirroring what inputs.js getGlobals() produces.
function makeGl(over = {}) {
  return {
    currentAge: 35, lifeExp: 90, baseYear: 2026,
    spendNow: 3000, spendRet: 2400, inflation: 0.02,
    gainFrac: 0.25, stockRet: 0.07, bondRet: 0.03,
    stockAlloc: 1, bondAllocRet: 0.4, taxRate: 0.30,
    pensionAmt: 700, pensionAge: 67, cash: 10000, cashReturn: 0.01,
    windfalls: [], wdMode: 'swr', swr: 0.04,
    invested: 150000,
    partnerInc: 1800, partnerRetAge: 65, partnerPension: 500, partnerPensionAge: 67,
    partnerSpendMult: 1.5, partnerAgeOff: 0,
    propBuyYear: 2032, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.08,
    propMortgageRate: 0.035, propMortgageTerm: 25, propRentSaved: 1000,
    childBirthYear: 2034, childCostYearly: 9000, childCostUntilAge: 22,
    childMaternityMonths: 6, childMaternityIncome: 2000,
    // two-person model (made-up numbers); partnerModel 'simple' = original model
    partnerModel: 'simple', samPersonalNow: 1200, samPersonalRet: 1100,
    sharedNow: 2400, sharedRet: 2200, soloShared: 1500, partnerPersonal: 700,
    partnerPortfolio: 30000, partnerGainFrac: 0.1, shareMin: 0, shareMax: 0.5,
    ...over,
  };
}
function makeSc(over = {}) {
  return { id: 1, retAge: 45, income: 5000, chgYear: null, chgInc: null,
           hasPartner: false, hasProp: false, hasChild: false, ...over };
}

test('annuityPV: zero/negative horizon is worthless', () => {
  assert.equal(annuityPV(100, 0.05, 0.02, 0), 0);
  assert.equal(annuityPV(100, 0.05, 0.02, -3), 0);
});

test('annuityPV: r == g degenerates to C·n', () => {
  assert.equal(annuityPV(100, 0.03, 0.03, 12), 1200);
});

test('annuityPV: matches closed-form ordinary growing annuity', () => {
  // C=100, r=5%, g=0, n=10 → 100·(1−1.05⁻¹⁰)/0.05
  const expected = 100 * (1 - Math.pow(1 / 1.05, 10)) / 0.05;
  assert.ok(Math.abs(annuityPV(100, 0.05, 0, 10) - expected) < 1e-9);
});

test('mortgageAnnual: zero rate amortises linearly', () => {
  const gl = makeGl({ propPrice: 300000, propDownPct: 0.2, propMortgageRate: 0, propMortgageTerm: 25 });
  assert.equal(mortgageAnnual(gl), 240000 / 25);
});

test('mortgageAnnual: standard annuity payment for 3.5% / 25y', () => {
  const gl = makeGl();
  const principal = 300000 * 0.8, mr = 0.035 / 12, nm = 300;
  const expected = principal * mr * Math.pow(1 + mr, nm) / (Math.pow(1 + mr, nm) - 1) * 12;
  assert.ok(Math.abs(mortgageAnnual(gl) - expected) < 1e-6);
});

test('mortgageAnnual: no property price → 0', () => {
  assert.equal(mortgageAnnual(makeGl({ propPrice: 0 })), 0);
});

test('portReturnAt: glide path endpoints', () => {
  const gl = makeGl();
  assert.equal(portReturnAt(gl, 35, 45), 0.07);                    // today: 100% stock
  assert.ok(Math.abs(portReturnAt(gl, 45, 45) - (0.6 * 0.07 + 0.4 * 0.03)) < 1e-12); // at retirement: 60/40
});

test('yearOneBudget: base case is inflated retirement spending', () => {
  const gl = makeGl(), sc = makeSc();
  const expected = 2400 * 12 * Math.pow(1.02, 10); // retire at 45, 10y from age 35
  assert.ok(Math.abs(yearOneBudget(45, sc, gl) - expected) < 1e-6);
});

test('yearOneBudget: partner multiplier and child cost add up', () => {
  const gl = makeGl(), sc = makeSc({ hasPartner: true, hasChild: true });
  const inflF = Math.pow(1.02, 10);
  const expected = 2400 * 1.5 * 12 * inflF + 9000 * inflF; // child born 2034, still <22 in 2036
  assert.ok(Math.abs(yearOneBudget(45, sc, gl) - expected) < 1e-6);
});

test('computeFireTarget (SWR mode): budget grossed up by taxMult over SWR', () => {
  const gl = makeGl(), sc = makeSc();
  const taxMult = 1.1;
  const expected = Math.round(yearOneBudget(45, sc, gl) * taxMult / 0.04);
  assert.equal(computeFireTarget(45, sc, gl, taxMult), expected);
});

test('computeFireTarget: retirement at/after life expectancy needs nothing', () => {
  const gl = makeGl(), sc = makeSc({ retAge: 90 });
  assert.equal(computeFireTarget(90, sc, gl, 1), 0);
});

test('project: horizon, determinism and non-negative net worth', () => {
  const gl = makeGl(), sc = makeSc();
  const p1 = project(sc, gl), p2 = project(sc, gl);
  assert.equal(p1.values.length, gl.lifeExp - gl.currentAge + 1);
  assert.deepEqual(p1.values, p2.values);
  assert.ok(p1.values.every(v => v >= 0));
  assert.ok(p1.fireTarget > 0);
  assert.equal(p1.retYear, 2036);
});

test('project: uses gl.invested as the starting portfolio', () => {
  const gl = makeGl(), sc = makeSc();
  const proj = project(sc, gl);
  assert.equal(proj.values[0], gl.invested + gl.cash); // year-0 net worth = portfolio + cash
});

test('project (fixed mode): unaffordable plan flags infeasibility or depletes', () => {
  const gl = makeGl({ wdMode: 'fixed', invested: 10000, cash: 0, spendRet: 10000 });
  const sc = makeSc({ retAge: 33 });
  const proj = project(sc, gl);
  assert.ok(proj.infeasibleYear !== null || proj.finalNetWorth <= 0);
});

test('project: windfall year increases net worth path', () => {
  const gl = makeGl(), sc = makeSc();
  const base = project(sc, gl);
  const rich = project(sc, makeGl({ windfalls: [{ yr: 2032, amt: 80000 }] }));
  const i = base.years.indexOf(2033);
  assert.ok(rich.values[i] > base.values[i] + 79000);
});

test('buildPlanProj: needs at least one past snapshot', () => {
  const gl = makeGl(), sc = makeSc();
  assert.equal(buildPlanProj(sc, gl, []), null);
  assert.equal(buildPlanProj(sc, gl, [{ year: 2032, val: 100000 }]), null); // future only
  const plan = buildPlanProj(sc, gl, [{ year: 2022, val: 100000 }]);
  assert.ok(plan);
  assert.equal(plan.years[0], 2022);
});

test('planYearsAhead: ahead of plan when actual NW beats the plan curve early', () => {
  const gl = makeGl(), sc = makeSc();
  const plan = buildPlanProj(sc, gl, [{ year: 2022, val: 50000 }]);
  const pos = planYearsAhead(plan, gl);
  assert.ok(pos && Number.isFinite(pos.years));
});

// ── TWO-PERSON HOUSEHOLD MODEL ─────────────────────────────────────────────
// All numbers made up. "Flat" globals: no inflation, no growth, so expected
// values can be computed by hand.
const twoGl = (over = {}) => makeGl({ partnerModel: 'two', ...over });
const flat = (over = {}) => twoGl({ inflation: 0, stockRet: 0, bondRet: 0, cashReturn: 0, ...over });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('two-person 1 — regression: simple mode is identical to the pre-change snapshot', () => {
  // Snapshot taken from project() BEFORE the two-person code existed
  // (tests/fixtures/simple-mode-snapshot.json). Same cases, with the new gl
  // fields present (partnerModel 'simple') and with partnerModel absent.
  const snap = JSON.parse(readFileSync(new URL('./fixtures/simple-mode-snapshot.json', import.meta.url)));
  const cases = [
    ['base', {}, {}], ['partner', { hasPartner: true }, {}], ['partnerOff3', { hasPartner: true }, { partnerAgeOff: 3 }],
    ['prop', { hasProp: true }, {}], ['child', { hasChild: true }, {}],
    ['all', { hasPartner: true, hasProp: true, hasChild: true }, { windfalls: [{ yr: 2032, amt: 80000 }] }],
    ['early', { retAge: 40, chgYear: 2030, chgInc: 3000 }, {}],
  ];
  // v8.2 deliberately changed %-mode scenarios with child or property costs (costs
  // that end are priced at present value): those three are covered by
  // tests/tempCosts.test.mjs and the regenerated v8 golden master instead. The
  // fields v8.2 added (tempPV, rows[].tempCost) are not in this older snapshot.
  // v8.5 then moved every fixed-mode case (tax priced on a rising gain fraction).
  const movedInV82 = new Set(['swr_prop', 'swr_child', 'swr_all', ...cases.map(c => 'fixed_' + c[0])]);
  const strip = p => { delete p.tempPV; p.rows.forEach(r => delete r.tempCost); return p; };
  for (const wd of ['swr', 'fixed']) for (const [k, sco, glo] of cases) {
    if (movedInV82.has(wd + '_' + k)) continue;
    const glS = makeGl({ wdMode: wd, ...glo });
    const glA = { ...glS }; delete glA.partnerModel;
    for (const g of [glS, glA]) {
      const p = strip(JSON.parse(JSON.stringify(project(makeSc(sco), g))));
      assert.deepEqual(p, snap[wd + '_' + k], wd + '_' + k);
    }
  }
});

test('two-person 2 — share math: 6,000 vs 2,000 → 25%, contribution 750, your cost 3,250', () => {
  const gl = flat({ samPersonalNow: 1000, sharedNow: 3000, partnerInc: 2000 });
  assert.equal(partnerShare(2000, 6000, gl), 0.25);
  const c = twoPersonCost(2026, makeSc({ hasPartner: true }), gl, 6000 * 12, 0, false);
  assert.ok(near(c.share, 0.25));
  assert.ok(near(c.contrib, 750 * 12));
  assert.ok(near(c.samCost, 3250 * 12));
  // same numbers flow through project(): year-0 net flow = 72,000 − 39,000
  const p = project(makeSc({ hasPartner: true, income: 6000 }), gl);
  assert.equal(p.rows[0].partnerContrib, 9000);
  assert.equal(p.rows[0].netFlow, 72000 - 39000);
  assert.equal(p.rows[0].partnerPension, 0);                 // her pension is not your income
});

test('two-person 3 — clamp: 9,000 vs 1,000 with a 50% cap → 50%; floor applies too', () => {
  assert.equal(partnerShare(9000, 1000, twoGl({ shareMax: 0.5 })), 0.5);
  assert.equal(partnerShare(100, 9900, twoGl({ shareMin: 0.1 })), 0.1);
  assert.equal(partnerShare(0, 0, twoGl({ shareMin: 0.1 })), 0);    // no income at all → 0
});

test('two-person 4 — share switches to the pension ratio in her retirement year (age offset +3)', () => {
  // You: 35 in 2026, keep working (retire 65), 5,000/mo. Partner is 3 years
  // older: her age 60 = your 57 = 2047+1 → retires and draws pension in 2048.
  // Empty portfolio and high personal spending keep her draw at 0.
  const gl = flat({ partnerAgeOff: 3, partnerInc: 2000, partnerRetAge: 60, partnerPension: 1000,
                    partnerPensionAge: 60, partnerPortfolio: 0, partnerPersonal: 5000 });
  const p = project(makeSc({ hasPartner: true, retAge: 65 }), gl);
  const r47 = p.rows[p.years.indexOf(2047)], r48 = p.rows[p.years.indexOf(2048)];
  assert.ok(near(r47.partnerShare, 2000 / 7000));            // her age 59: salary ratio
  assert.ok(near(r48.partnerShare, 1000 / 6000));            // her age 60: pension ratio
  assert.equal(partnerIncomeAt(2047, gl).herAge, 59);
  assert.equal(partnerIncomeAt(2048, gl).working, false);
});

test('two-person 5 — after your retirement your share-income = pension + SWR draw net of CGT', () => {
  // Retire now (35), pension already flowing; start portfolio 150,000 at 25%
  // gain, France 30%: 700·12 + 150,000·0.04·(1 − 0.25·0.30) = 8,400 + 5,550.
  for (const wdMode of ['swr', 'fixed']) {
    const gl = flat({ wdMode, pensionAge: 35, pensionAmt: 700 });
    const p = project(makeSc({ hasPartner: true, retAge: 35 }), gl);
    assert.equal(p.rows[0].samShareIncome, 13950, wdMode);
  }
});

test('two-person 6 — scenario without partner: budget = your personal + solo shared, no contribution', () => {
  const gl = twoGl(), sc = makeSc();
  const expected = (1100 + 1500) * 12 * Math.pow(1.02, 10);
  assert.ok(near(yearOneBudget(45, sc, gl), expected));
  const p = project(sc, gl);
  assert.equal(p.rows[0].spending, (1200 + 1500) * 12);
  assert.equal(p.rows[0].partnerContrib, undefined);
  assert.equal(p.household, undefined);
  const taxMult = 1 / (1 - p.gainFracAtRet * gl.taxRate);
  assert.equal(p.fireTarget, Math.round(expected * taxMult / gl.swr));
  // fixed mode: same two-period DCF as simple mode with the new base spending
  const glF = twoGl({ wdMode: 'fixed' });
  assert.equal(computeFireTarget(45, sc, glF, 1.1),
               computeFireTarget(45, sc, makeGl({ wdMode: 'fixed', spendRet: 2600 }), 1.1));
});

test('two-person 7 — child cost and mortgage are shared costs split by the share', () => {
  // 2034: child aged 1 (12,000/yr), 0% mortgage 240,000/25 = 9,600/yr, rent
  // saved 500/mo. Shared = 36,000 + 12,000 + 9,600 − 6,000 = 51,600; share 25%
  // → contribution 12,900; your cost = 12,000 + 51,600 − 12,900 = 50,700.
  const gl = flat({ samPersonalNow: 1000, sharedNow: 3000, partnerInc: 2000,
                    childBirthYear: 2033, childCostYearly: 12000, propBuyYear: 2032, propPrice: 300000,
                    propDownPct: 0.2, propMortgageRate: 0, propMortgageTerm: 25, propRentSaved: 500 });
  const sc = makeSc({ hasPartner: true, hasChild: true, hasProp: true });
  const c = twoPersonCost(2034, sc, gl, 6000 * 12, 0, false);
  assert.ok(near(c.shared, 51600));
  assert.ok(near(c.contrib, 12900));
  assert.ok(near(c.samCost, 50700));
  const p = project({ ...sc, income: 6000 }, gl);
  const r = p.rows[p.years.indexOf(2034)];
  assert.equal(r.partnerContrib, 12900);
  assert.equal(r.netFlow, 72000 - 50700);
});

test('two-person 8 — household target equals a hand-computed two-period PV', () => {
  // Fixed mode, no inflation, 5% flat return, retire 60 → 70 (n = 10). Need:
  // 1,000 + 700 + 2,000 = 3,700/mo; both pensions (800 + 400) from 65.
  // PV = 1.1·[44,400·a(5) + 30,000·a(5)/1.05⁵], a(5) = (1 − 1.05⁻⁵)/0.05.
  const gl = twoGl({ wdMode: 'fixed', inflation: 0, stockRet: 0.05, bondRet: 0.05, lifeExp: 70,
                     samPersonalRet: 1000, partnerPersonal: 700, sharedRet: 2000,
                     pensionAmt: 800, pensionAge: 65, partnerPension: 400, partnerPensionAge: 65 });
  const sc = makeSc({ hasPartner: true, retAge: 60 });
  // v8.5: the tax gross-up rises each year as the remaining portfolio grows:
  // g0 = (1 - 1/1.1)/t, g_k = 1 - (1 - g0)/1.05^(k+1), tm_k = 1/(1 - g_k t).
  const t = gl.taxRate, g0 = (1 - 1 / 1.1) / t;
  let expected = 0;
  for (let k = 0; k < 10; k++) {
    const g = 1 - (1 - g0) / Math.pow(1.05, k + 1), need = k < 5 ? 44400 : 30000;
    expected += need / (1 - g * t) / Math.pow(1.05, k + 1);
  }
  assert.equal(computeHouseholdTarget(60, sc, gl, 1.1), Math.round(expected));
  // % mode: year-one need over SWR
  assert.equal(computeHouseholdTarget(60, sc, { ...gl, wdMode: 'swr' }, 1.1), Math.round(44400 * 1.1 / 0.04));
  const p = project(sc, gl);
  assert.equal(p.household.nwAtRet, p.values[25] + p.partner.values[25]);
  assert.equal(p.household.funded, p.household.nwAtRet >= p.household.target);
});

test('two-person 9a — partner contributions accumulate with returns', () => {
  // 5% flat, she earns 3,000, spends 1,000, contributes 3/8 of 2,000 shared:
  // net 36,000 − 12,000 − 9,000 = 15,000 → 10,000·1.05 + 15,000 = 25,500.
  const gl = flat({ stockRet: 0.05, bondRet: 0.05, partnerInc: 3000, partnerPersonal: 1000,
                    sharedNow: 2000, partnerPortfolio: 10000, partnerGainFrac: 0 });
  const p = project(makeSc({ hasPartner: true }), gl);
  assert.equal(p.rows[0].partnerContrib, 9000);
  assert.equal(p.partner.values[0], 10000);
  assert.ok(near(p.partner.values[1], 25500));
});

test('two-person 9b — partner deficit draws down with the CGT gross-up', () => {
  // She earns 1,000, spends 3,000, pays 1/6 of 1,200 shared: net −26,400.
  // After growth 105,000 with basis 50,000 → gain 55/105; netFrac 1 − 0.3·55/105.
  const gl = flat({ stockRet: 0.05, bondRet: 0.05, partnerInc: 1000, partnerPersonal: 3000,
                    sharedNow: 1200, partnerPortfolio: 100000, partnerGainFrac: 0.5 });
  const p = project(makeSc({ hasPartner: true }), gl);
  const gross = 26400 / (1 - 0.3 * 55000 / 105000);
  assert.equal(p.rows[0].partnerWithdrawal, Math.round(gross));
  assert.ok(near(p.partner.values[1], 105000 - gross));
  assert.ok(p.partnerInfeasibleYear > 2026);                 // runs dry later, not in year 0
});

test('two-person 9c — empty partner portfolio is flagged and never touches yours', () => {
  // Partner never retires within the horizon, so her portfolio cannot affect
  // your share (no draw): your path must not depend on her spending at all.
  const base = { partnerRetAge: 200, partnerPortfolio: 0 };
  const ok  = project(makeSc({ hasPartner: true }), twoGl({ ...base, partnerPersonal: 0 }));
  const bad = project(makeSc({ hasPartner: true }), twoGl({ ...base, partnerPersonal: 9000 }));
  assert.equal(bad.partnerInfeasibleYear, 2026);
  assert.equal(ok.partnerInfeasibleYear, null);
  assert.deepEqual(bad.values, ok.values);
  assert.equal(bad.infeasibleYear, ok.infeasibleYear);
  assert.ok(bad.partner.values.every(v => v === 0));
});

test('two-person: self-funded cost is a fixed point of the share rule', () => {
  // At target your income equals your cost, so share = clamp(h/(h+c)).
  const gl = twoGl({ shareMax: 0.9 }), sc = makeSc({ hasPartner: true });
  const c = selfFundedCost(2036, sc, gl, 0, 0);
  const h = partnerIncomeAt(2036, gl).total;
  assert.ok(near(c.share, h / (h + c.samCost), 1e-9));
  assert.ok(near(c.samCost, c.samPersonal + c.shared * (1 - c.share), 1e-6));
  // with the default 50% cap the clamped share is consistent too
  const k = selfFundedCost(2036, sc, twoGl({ partnerInc: 20000 }), 0, 0);
  assert.equal(k.share, 0.5);
});

test('two-person: partial target (SWR) prices your year-one net cost; fixed = year-by-year PV', () => {
  const gl = twoGl(), sc = makeSc({ hasPartner: true });
  const p = project(sc, gl);
  const taxMult = 1 / (1 - p.gainFracAtRet * gl.taxRate);
  const y1 = yearOneBudget(45, sc, gl, p.partner.drawByT[10]);
  assert.equal(p.fireTarget, Math.round(y1 * taxMult / gl.swr));          // no pension at 45
  // fixed mode with no partner income: share 0, so the target is the PV of
  // your full cost (personal + shared), pension netted from 67.
  const glF = twoGl({ wdMode: 'fixed', partnerInc: 0, partnerPension: 0, inflation: 0,
                      stockRet: 0.05, bondRet: 0.05, lifeExp: 70, pensionAmt: 500, pensionAge: 65 });
  const scF = makeSc({ hasPartner: true, retAge: 60 });
  // v8.5: rising gain fraction, as in the household test above
  const t = glF.taxRate, g0 = (1 - 1 / 1.2) / t;
  let exp = 0;
  for (let k = 0; k < 10; k++) {
    const g = 1 - (1 - g0) / Math.pow(1.05, k + 1), need = k < 5 ? (1100 + 2200) * 12 : (3300 - 500) * 12;
    exp += need / (1 - g * t) / Math.pow(1.05, k + 1);
  }
  assert.equal(computeFireTarget(60, scF, glF, 1.2, { herDraw: {} }), Math.round(exp));
});

test('two-person: separation check and contribution note come from the projection', () => {
  const gl = twoGl(), sc = makeSc({ hasPartner: true });
  const p = project(sc, gl);
  const sep = partnerSeparation(p, sc, gl);
  assert.deepEqual(sep.map(s => s.herAge), [45, 50, 67]);
  const s50 = sep[1];
  assert.equal(s50.income, 1800);                            // still working at 50
  assert.equal(s50.gap, 1800 - (700 + 1500));
  const n = partnerContributionNote(sc, gl, p);
  assert.equal(n.untilHerAge, 65);
  assert.ok(n.contribMonthly > 0 && n.costAfterMonthly > n.costMonthly); // her retiring raises your cost
});
