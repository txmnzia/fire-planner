// Unit tests for the two-person household model (gl.partnerModel === 'two').
// Every expectation is hand-computed from made-up numbers (no personal data).
// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  project, yearOneBudget, partnerShare, householdBudget, pvStream, mortgageAnnual,
  partnerAutonomy,
} from '../js/engine.js';
import { runMonteCarlo } from '../js/montecarlo.js';
import { computeCardMetrics } from '../js/ui/cards.js';
import { state } from '../js/state.js';

// Same shape as getGlobals(); simple-model fields as in engine.test.mjs.
function makeGl(over = {}) {
  return {
    currentAge: 35, lifeExp: 90, baseYear: 2026,
    spendNow: 3000, spendRet: 2400, inflation: 0.02,
    gainFrac: 0.25, stockRet: 0.07, bondRet: 0.03,
    stockAlloc: 1, bondAllocRet: 0.4, taxRate: 0.30,
    pensionAmt: 700, pensionAge: 67, cash: 10000, cashReturn: 0.01,
    windfalls: [], wdMode: 'swr', swr: 0.04,
    invested: 150000,
    partnerInc: 2000, partnerRetAge: 65, partnerPension: 500, partnerPensionAge: 67,
    partnerSpendMult: 1.4, partnerAgeOff: 0,
    propBuyYear: 2030, propPrice: 350000, propDownPct: 0.2, propTxCostPct: 0.08,
    propMortgageRate: 0.035, propMortgageTerm: 25, propRentSaved: 1000,
    childBirthYear: 2034, childCostYearly: 10000, childCostUntilAge: 22,
    childMaternityMonths: 6, childMaternityIncome: 2000,
    partnerModel: 'simple', samPersonalNow: 0, samPersonalRet: 0, sharedNow: 0, sharedRet: 0,
    soloShared: 0, partnerPersonal: 0, partnerPortfolio: 0, partnerGainFrac: 0, shareMin: 0, shareMax: 0.5,
    ...over,
  };
}
// two-person defaults layered on top (made-up household)
function makeTwo(over = {}) {
  return makeGl({ partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 900,
    sharedNow: 2500, sharedRet: 2300, soloShared: 1600, partnerPersonal: 700,
    partnerPortfolio: 0, partnerGainFrac: 0, ...over });
}
function makeSc(over = {}) {
  return { id: 1, retAge: 60, income: 6000, chgYear: null, chgInc: null,
           hasPartner: true, hasProp: false, hasChild: false, ...over };
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── 1. regression: simple model unchanged ───────────────────────────────────
// Snapshot of project()/yearOneBudget()/anchored project()/runMonteCarlo for 96
// fixture combinations, taken on the code BEFORE the two-person model existed
// (FNV-1a 32-bit hash + length of the JSON). Any change to simple-mode output
// — one cent in one row — changes the hash.
const BASELINE = { hash: 'a29ac4df', length: 3681360 };
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
function snapshot(glOver) {
  // the pre-change fixture had no two-person fields; glOver adds them back
  const base = over => {
    const g = makeGl(over);
    for (const k of ['partnerModel','samPersonalNow','samPersonalRet','sharedNow','sharedRet','soloShared',
      'partnerPersonal','partnerPortfolio','partnerGainFrac','shareMin','shareMax']) delete g[k];
    return { ...g, ...glOver };
  };
  const out = {};
  for (const wd of ['swr','fixed']) for (const off of [0,3]) for (const ra of [45,60,70]) for (let f = 0; f < 8; f++) {
    const gl = base({ wdMode: wd, partnerAgeOff: off });
    const sc = { id:1, retAge: ra, income: 5000, chgYear: 2035, chgInc: 5500, hasPartner: !!(f&1), hasProp: !!(f&2), hasChild: !!(f&4) };
    out[[wd,off,ra,f].join('/')] = { p: project(sc, gl), b: yearOneBudget(ra, sc, gl),
      a: project(sc, gl, { startYear: 2020, startPort: 100000, history: [{year:2020,val:100000,income:4000,spend:3000}] }) };
  }
  out.mc = runMonteCarlo([{id:1,retAge:45,income:5000,chgYear:null,chgInc:null,hasPartner:true,hasProp:false,hasChild:false}],
    base({}), {sims:50,blockLen:5,recenter:true,seed:42});
  return JSON.stringify(out);
}
test('regression: no partnerModel → output identical to the pre-change engine', () => {
  const s = snapshot({});
  assert.equal(s.length, BASELINE.length); assert.equal(fnv(s), BASELINE.hash);
});
test('regression: partnerModel "simple" with every two-person field set → identical', () => {
  const s = snapshot({ partnerModel: 'simple', samPersonalNow: 1234, samPersonalRet: 999, sharedNow: 2222,
    sharedRet: 1111, soloShared: 777, partnerPersonal: 555, partnerPortfolio: 88888, partnerGainFrac: 0.3,
    shareMin: 0.1, shareMax: 0.4 });
  assert.equal(s.length, BASELINE.length); assert.equal(fnv(s), BASELINE.hash);
});

// ── 2. share math ───────────────────────────────────────────────────────────
test('share math: 6,000 vs 2,000 → 25%; shared 3,000 → 750; your cost 3,250', () => {
  assert.equal(partnerShare(6000, 2000, makeTwo()), 0.25);
  for (const wdMode of ['swr', 'fixed']) {
    const gl = makeTwo({ wdMode, samPersonalNow: 1000, sharedNow: 3000, partnerInc: 2000 });
    const p = project(makeSc({ income: 6000 }), gl);
    const r0 = p.rows[0];                          // 2026, no inflation yet
    assert.equal(r0.partnerShare, 0.25);
    assert.equal(r0.partnerContribution, 750 * 12);
    // your net cost 3,250/mo → net flow = 6,000 − 3,250 per month
    assert.equal(r0.netFlow, (6000 - 3250) * 12);
    assert.equal(r0.income, 6000 * 12);            // her salary is NOT your income
    const hb = householdBudget(2026, makeSc(), gl, 0.25, false);
    assert.ok(near(hb.samCost, 3250 * 12) && near(hb.contribution, 750 * 12));
  }
});

// ── 3. clamp ────────────────────────────────────────────────────────────────
test('clamp: partner 9,000 vs you 1,000 with a 50% cap → 50%', () => {
  assert.equal(partnerShare(1000, 9000, makeTwo({ shareMax: 0.5 })), 0.5);
  assert.equal(partnerShare(9000, 1000, makeTwo({ shareMin: 0.2 })), 0.2);   // floor
  assert.equal(partnerShare(0, 0, makeTwo({ shareMin: 0.2 })), 0);           // nobody earns
  const p = project(makeSc({ income: 1000 }), makeTwo({ partnerInc: 9000 }));
  assert.equal(p.rows[0].partnerShare, 0.5);
});

// ── 4. partner retirement with an age offset ────────────────────────────────
test('after HER retirement the share switches to the pension ratio in the right year (offset +3)', () => {
  // you 35, she 38 (off +3). She retires and her pension starts at 40 → your t = 2.
  // Personal 1,375 = 2,000 − 25% × 2,500: she saves nothing, so no portfolio draw.
  const gl = makeTwo({ partnerAgeOff: 3, partnerInc: 2000, partnerRetAge: 40, partnerPersonal: 1375,
    partnerPension: 1000, partnerPensionAge: 40, partnerPortfolio: 0 });
  const p = project(makeSc({ income: 6000 }), gl);
  assert.equal(p.rows[1].partnerShare, 0.25);                   // her age 39: 2,000 / 8,000
  assert.ok(near(p.rows[2].partnerShare, 1000 / 7000, 1e-12));  // her age 40: 1,000 / 7,000
});

// ── 5. your income for the share after YOUR retirement ──────────────────────
test('after your retirement your share income = pension + SWR draw net of CGT', () => {
  // already retired at 35; pension 1,000/mo flowing; 300k at 50% gains, 30% CGT
  // you: 12,000 + 300,000 × 4% × (1 − 0.5 × 0.3) = 12,000 + 10,200 = 22,200
  // her: 2,000 × 12 = 24,000 → share = 24,000 / 46,200 (cap lifted)
  for (const wdMode of ['swr', 'fixed']) {     // SWR is used for the share in BOTH modes
    const gl = makeTwo({ wdMode, pensionAmt: 1000, pensionAge: 30, invested: 300000, gainFrac: 0.5, shareMax: 1 });
    const p = project(makeSc({ retAge: 35 }), gl);
    assert.ok(near(p.rows[0].partnerShare, 24000 / 46200, 1e-12));
  }
});

// ── 6. solo scenario in the two-person model ────────────────────────────────
test('solo scenario: budget = your personal + soloShared, no contribution', () => {
  const gl = makeTwo();
  const sc = makeSc({ hasPartner: false, retAge: 45 });
  // retire at 45 (t = 10): (900 + 1,600) × 12 × 1.02^10
  assert.ok(near(yearOneBudget(45, sc, gl), 2500 * 12 * Math.pow(1.02, 10)));
  const p = project(sc, gl);
  assert.equal(p.rows[0].partnerContribution, 0);
  assert.equal(p.rows[0].netFlow, (6000 - 1000 - 1600) * 12);
  assert.equal(p.two.household, null);           // no household view without a partner
  assert.equal(p.rows[10].swrTarget, Math.round(2500 * 12 * Math.pow(1.02, 10)));
});

// ── 7. child cost and mortgage are shared costs ─────────────────────────────
test('child cost and mortgage minus rent are split by the share; purchase stays on you', () => {
  const gl = makeTwo({ samPersonalNow: 1000, sharedNow: 3000, partnerInc: 2000,
    propBuyYear: 2026, childBirthYear: 2026, childMaternityMonths: 0 });
  const sc = makeSc({ income: 6000, hasProp: true, hasChild: true });
  const p = project(sc, gl), r0 = p.rows[0];
  const shared = 3000 * 12 + 10000 + mortgageAnnual(gl) - 1000 * 12;
  const purchase = 350000 * (0.2 + 0.08);
  assert.equal(r0.partnerContribution, Math.round(0.25 * shared));
  assert.equal(r0.netFlow, Math.round(6000 * 12 - (1000 * 12 + 0.75 * shared) - purchase));
});

// ── 8. household FIRE target, 2-period hand PV ──────────────────────────────
test('household FIRE target equals a hand-computed 2-period PV (fixed mode)', () => {
  // retire now at 45, plan to 47 → 2 years; 100% stocks → r = 7%; no gains → taxMult 1
  // year 0: (1,000 + 800 + 2,000) × 12                 = 45,600, no pensions yet
  // year 1: 45,600 × 1.02 − (500 + 300) × 12 × 1.02    = 46,512 − 9,792 = 36,720
  const gl = makeTwo({ wdMode: 'fixed', currentAge: 45, lifeExp: 47, bondAllocRet: 0, gainFrac: 0,
    samPersonalRet: 1000, partnerPersonal: 800, sharedRet: 2000,
    pensionAmt: 500, pensionAge: 46, partnerPension: 300, partnerPensionAge: 46, partnerRetAge: 60 });
  const p = project(makeSc({ retAge: 45 }), gl);
  assert.equal(p.two.household.target, Math.round(45600 / 1.07 + 36720 / Math.pow(1.07, 2)));
  // pvStream is the same convention as annuityPV
  assert.ok(near(pvStream([100, 102], 0.05), 100 / 1.05 + 102 / 1.1025));
});

test('partial FIRE target (fixed mode) with a pinned share: hand-computed 2-period PV', () => {
  // share pinned at 30%: your cost = (1,000 + 0.7 × 2,000) × 12 = 28,800 × infl
  // year 1 also nets your pension 500 × 12 × 1.02 = 6,120 → 29,376 − 6,120 = 23,256
  const gl = makeTwo({ wdMode: 'fixed', currentAge: 45, lifeExp: 47, bondAllocRet: 0, gainFrac: 0,
    samPersonalRet: 1000, sharedRet: 2000, shareMin: 0.3, shareMax: 0.3,
    pensionAmt: 500, pensionAge: 46, partnerRetAge: 60 });
  const p = project(makeSc({ retAge: 45 }), gl);
  assert.equal(p.fireTarget, Math.round(28800 / 1.07 + 23256 / Math.pow(1.07, 2)));
});

test('% mode partial headline charges a later rise in your cost when her share falls', () => {
  // You: retired at 35, pension 2,000/mo flowing, no portfolio (cash only), so
  // year-one need = 0. She earns 2,000 in year 0 then retires (no pension, no
  // portfolio, and personal 1,000 = 2,000 − 50% × 2,000 so she saves nothing):
  // share 50% → 0%. Year 1 you pay her former half of shared costs:
  // 0.5 × 2,000 × 12 × 1.02 = 12,240, discounted two periods at 7%.
  const gl = makeTwo({ currentAge: 35, lifeExp: 37, invested: 0, cash: 1e6, gainFrac: 0,
    pensionAmt: 2000, pensionAge: 30, samPersonalRet: 1000, sharedRet: 2000,
    partnerInc: 2000, partnerRetAge: 36, partnerPension: 0, partnerPensionAge: 80, partnerPersonal: 1000 });
  const p = project(makeSc({ retAge: 35 }), gl);
  assert.equal(p.rows[0].partnerShare, 0.5);
  assert.equal(p.rows[1].partnerShare, 0);
  const expected = Math.round(12240 / Math.pow(1.07, 2));
  assert.equal(p.fireTarget, expected);
  assert.equal(p.two.partial.risePV, expected);
  assert.equal(p.fireTargetAdj, expected);     // no favourable changes to credit
});

// ── 9. partner portfolio ────────────────────────────────────────────────────
test('partner portfolio: surplus accumulates with returns', () => {
  // she: 3,000 income − 1,000 personal − 50% × 1,000 shared → +1,500/mo = 18,000/yr
  const gl = makeTwo({ partnerInc: 3000, partnerPersonal: 1000, sharedNow: 1000, partnerPortfolio: 10000 });
  const p = project(makeSc({ income: 3000 }), gl);
  assert.equal(p.rows[0].partnerShare, 0.5);
  assert.equal(p.rows[1].partnerPort, Math.round(10000 * 1.07 + 18000));
});
test('partner portfolio: a deficit is sold with the CGT gross-up', () => {
  // no income, 1,000/mo personal, nothing shared; 100k at 50% gains
  const gl = makeTwo({ partnerInc: 0, partnerRetAge: 30, partnerPersonal: 1000, sharedNow: 0,
    partnerPortfolio: 100000, partnerGainFrac: 0.5 });
  const p = project(makeSc(), gl);
  const ag = 107000, basis = 50000, gf = (ag - basis) / ag, gross = 12000 / (1 - gf * 0.3);
  assert.equal(p.rows[1].partnerPort, Math.round(ag - gross));
  assert.equal(p.rows[0].partnerTax, Math.round(gross * gf * 0.3));
});
test('partner portfolio: running dry sets partnerInfeasibleYear and never touches yours', () => {
  const herSide = { partnerInc: 0, partnerRetAge: 30, sharedNow: 0, sharedRet: 0, partnerPortfolio: 5000 };
  const short = project(makeSc(), makeTwo({ ...herSide, partnerPersonal: 1000 }));
  const fine  = project(makeSc(), makeTwo({ ...herSide, partnerPersonal: 0 }));
  assert.equal(short.partnerInfeasibleYear, 2026);
  assert.equal(short.rows[1].partnerPort, 0);
  assert.equal(fine.partnerInfeasibleYear, null);
  assert.deepEqual(short.values, fine.values);           // your path is untouched
  assert.equal(short.infeasibleYear, fine.infeasibleYear);
});

// ── 10. Monte Carlo ─────────────────────────────────────────────────────────
test('Monte Carlo: two mode runs on your projection and is deterministic per seed', () => {
  const sc = [makeSc({ retAge: 50 })];
  for (const wdMode of ['swr', 'fixed']) {
    const gl = makeTwo({ wdMode });
    const cfg = { sims: 60, blockLen: 5, recenter: true, seed: 7 };
    const a = runMonteCarlo(sc, gl, cfg), b = runMonteCarlo(sc, gl, cfg);
    assert.deepEqual(a, b);
    // her portfolio size cannot move your metrics while nothing is shared
    // (shared = 0 → her contribution is 0 whatever her income/draw)
    const noShare = { sharedNow: 0, sharedRet: 0 };
    const x = runMonteCarlo(sc, makeTwo({ wdMode, ...noShare, partnerPortfolio: 0 }), cfg);
    const y = runMonteCarlo(sc, makeTwo({ wdMode, ...noShare, partnerPortfolio: 500000 }), cfg);
    assert.deepEqual(x, y);
  }
});

// ── agreement (I2): one budget everywhere ───────────────────────────────────
test('agreement: card target = yearOneBudget(share at retirement) = engine swrTarget; no partner income on the card', () => {
  state.nwHistory = [];
  const gl = makeTwo({ partnerPortfolio: 30000 }), sc = makeSc({ retAge: 50 });
  const p = project(sc, gl);
  const ri = 50 - 35;
  const y1 = yearOneBudget(50, sc, gl, p.two.shareAtRet);
  assert.equal(p.rows[ri].swrTarget, Math.round(y1));
  const m = computeCardMetrics(sc, gl, p);
  assert.equal(m.targetMonthly, Math.round(y1 / 12));
  assert.equal(m.incomeBreakdown.partnerSalary, 0);
  assert.equal(m.incomeBreakdown.partnerPension, 0);
  assert.equal(m.two.partial.target, p.fireTarget);
  assert.equal(m.two.household.ok, m.two.household.nw >= m.two.household.target);
});

test('partner autonomy: separation gap at her age 50 is salary − (personal + soloShared)', () => {
  const gl = makeTwo({ partnerInc: 2000, partnerPersonal: 700, soloShared: 1600 });
  const sc = makeSc();
  const a = partnerAutonomy(project(sc, gl), sc, gl);
  const at50 = a.checkpoints[0];
  assert.equal(at50.yr, 2041);
  assert.equal(at50.working, true);
  assert.equal(at50.gap, 2000 - 2300);
  assert.equal(partnerAutonomy(project(makeSc({ hasPartner: false }), gl), makeSc({ hasPartner: false }), gl), null);
});
