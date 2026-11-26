// Consistency of the logic and the figures (audit 2026-11). Properties that must
// hold for every household, checked on all 128 golden households (96 classic + 32
// shaped like getGlobals() output) and a few hand-computed ones. Made-up numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { project, yearOneBudget, computeFireTarget, tempCostPV, tempCostAt, purchasePV, setAsideSchedule,
  risingTaxMult, portReturnAt, rowCost, twoPersonCost, selfFundedCost, taxRateAt } from '../js/engine.js';
import { computeCardMetrics, isFunded, earliestStopAge } from '../js/ui/cards.js';
import { pathOf, vsFrozenPlan, fracYear } from '../js/planVsActual.js';
import { state } from '../js/state.js';
import { baseGl, baseSc, goldenCases, prodGl } from './golden-cases.mjs';

state.nwHistory = []; state.versions = [];
const CASES = goldenCases();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// ── 1. Ledgers: every euro is accounted for, every year ─────────────────────
test('portfolio ledger: next = this + return + windfall − yearly fund tax + saved − sold (working) / − withdrawn + reinvested (retired)', () => {
  let rowsChecked = 0;
  for (const c of CASES) {
    const p = project(c.sc, c.gl);
    for (let i = 0; i + 1 < p.rows.length; i++) {
      const r = p.rows[i], port = p.values[i] - r.cashVal, next = p.values[i + 1] - p.rows[i + 1].cashVal;
      if (next <= 0) continue;                                  // overflow into cash: the cash chain below
      const flow = r.phase === 'acc' ? (r.netFlow >= 0 ? r.netFlow : -(r.sold || 0)) : -r.withdrawal + (r.surplus || 0);
      near(next, port + r.portReturn + r.windfall - (r.vorabTax || 0) + flow, 3, `${c.name} ${r.yr}`);   // v8.28: German yearly fund tax
      rowsChecked++;
    }
  }
  assert.ok(rowsChecked > 5000, 'rows ' + rowsChecked);
});

test('cash ledger: cash only earns interest unless the portfolio is empty', () => {
  for (const c of CASES) {
    const p = project(c.sc, c.gl);
    for (let i = 0; i + 1 < p.rows.length; i++) {
      if (p.values[i + 1] - p.rows[i + 1].cashVal <= 0) continue;
      near(p.rows[i + 1].cashVal, p.rows[i].cashVal * (1 + c.gl.cashReturn), 2, `${c.name} ${p.rows[i].yr}`);
    }
  }
});

test('visible ledger: income − your cost − purchase = net flow while working (the year table adds up)', () => {
  for (const c of CASES) {
    const p = project(c.sc, c.gl);
    for (const r of p.rows.filter(r => r.phase === 'acc'))
      near(r.income - rowCost(r) - (r.extraCost || 0), r.netFlow, 4, `${c.name} ${r.yr}`);
  }
});

test('one budget: in % mode retirement, your cost from the row ledger is the year\'s budget (swrTarget)', () => {
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr')) {
    const p = project(c.sc, c.gl);
    for (const r of p.rows.filter(r => r.phase === 'ret')) near(rowCost(r), r.swrTarget, 4, `${c.name} ${r.yr}`);
  }
});

test('partner ledger: her share is 0–100% and your cost + her contribution = your own + shared, every year', () => {
  for (const c of CASES.filter(c => c.sc.hasPartner)) for (let yr = 2026; yr < 2080; yr += 3) {
    for (const tp of [twoPersonCost(yr, c.sc, c.gl, 60000, 0, false), twoPersonCost(yr, c.sc, c.gl, 20000, 0, true), selfFundedCost(yr, c.sc, c.gl, 0, 0)]) {
      assert.ok(tp.share >= 0 && tp.share <= 1, c.name + ' share ' + tp.share);
      near(tp.samCost + tp.contrib, tp.samPersonal + tp.shared, 1e-6, `${c.name} ${yr}`);
    }
  }
});

// ── 2. Tax on every sale ────────────────────────────────────────────────────
test('a sale before you stop pays tax on its gain part (hand-computed, audit F1)', () => {
  // 100k invested, half of it gain, 30% tax, no returns or inflation. 2026: pay 24,000 −
  // your cost 24,000 (1,000 own + 1,000 alone) − 60,000 purchase cash (20% of 300k) −
  // 9,600 loan (240k over 25 years at 0%) = −69,600. Selling at g = 50% keeps
  // 1 − 0.5 × 0.3 = 0.85 per € → 69,600 / 0.85 = 81,882 sold, 12,282 tax, 18,118 left.
  const gl = baseGl({ partnerModel: 'two', stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0.5, taxRate: 0.3, cash: 0, cashReturn: 0,
    invested: 100000, windfalls: [], samPersonalNow: 1000, samPersonalRet: 1000, soloShared: 1000, propBuyYear: 2026,
    propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0, propMortgageRate: 0, propMortgageTerm: 25, propRentSaved: 0, pensionAmt: 0 });
  const p = project(baseSc({ income: 2000, hasProp: true, retAge: 60 }), gl);
  const r = p.rows[0];
  assert.equal(r.netFlow, -69600);
  near(r.sold, 69600 / 0.85, 1, 'sold'); near(r.taxPaid, 69600 / 0.85 * 0.5 * 0.3, 1, 'tax');
  near(p.values[1], 100000 - 69600 / 0.85, 1, 'left');   // 18,118 (was 30,400 untaxed)
  for (const c of CASES) for (const row of project(c.sc, c.gl).rows)
    if (row.phase === 'acc' && row.netFlow < -1 && (row.sold || 0) > 0 && c.gl.gainFrac > 0) assert.ok(row.taxPaid > 0, c.name + ' ' + row.yr);
});

// ── 3. FIRE number and set-aside ────────────────────────────────────────────
test('set-aside: PV of the costs that end with the rising gain fraction; the reserve schedule starts at it', () => {
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr' && (c.sc.hasChild || c.sc.hasProp))) {
    const p = project(c.sc, c.gl), y0 = p.retYear, tm0 = 1 / (1 - p.gainFracAtRet * taxRateAt(c.gl, y0));
    const r = portReturnAt(c.gl, c.sc.retAge, c.sc.retAge), tm = risingTaxMult(c.gl, y0, tm0, r);
    let pv = 0; for (let k = 0; k < c.gl.lifeExp - c.sc.retAge; k++) pv += tempCostAt(y0 + k, c.sc, c.gl) * tm(k + 1) / Math.pow(1 + r, k + 1);
    near(tempCostPV(c.sc.retAge, c.sc, c.gl, tm0), pv, 1e-6, c.name);
    near(setAsideSchedule(c.sc, c.gl, tm0, y0)[0], pv + purchasePV(c.sc.retAge, c.sc, c.gl, tm0), 1e-3, c.name + ' schedule');
    near(p.tempPV, pv + purchasePV(c.sc.retAge, c.sc, c.gl, tm0), 1e-3, c.name + ' tempPV');
  }
});

test('% mode: a home bought after you stop is in the FIRE number (audit F6)', () => {
  // alone, buy in 2036 after stopping in 2031: +Δ buying costs raises the target by at least price × Δ / (1+r)^5
  const gl = baseGl({ partnerModel: 'two', propBuyYear: 2036 }), sc = baseSc({ retAge: 40, hasProp: true });
  const a = project(sc, gl).fireTarget, b = project(sc, { ...gl, propTxCostPct: gl.propTxCostPct + 0.02 }).fireTarget;
  const r = portReturnAt(gl, 40, 40);
  assert.ok(b - a >= 300000 * 0.02 / Math.pow(1 + r, 5) - 1, `${b - a}`);
  // bought before you stop: the purchase is not in the target (it was paid while working)
  assert.equal(purchasePV(45, baseSc({ retAge: 45, hasProp: true }), baseGl({ propBuyYear: 2032 }), 1.1), 0);
});

test('% mode: the sustainable draw never counts the reserve for costs that end (audit F4)', () => {
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr')) {
    const p = project(c.sc, c.gl);
    p.rows.forEach((r, i) => {
      if (r.phase !== 'ret') return;
      const pag = p.values[i] - r.cashVal + r.portReturn + r.windfall;
      // swrIncome = draw on (portfolio − reserve) after tax + other income + the costs that end it pays
      assert.ok(r.swrIncome - (r.tempCost || 0) - r.pension <= Math.max(0, pag - (r.setAside || 0)) * c.gl.swr + 3, `${c.name} ${r.yr}`);
    });
  }
});

test('at the FIRE number, the projection\'s first-year budget is yearOneBudget (one budget, audit F2)', () => {
  // invested scaled until the portfolio at the stop age equals the FIRE number
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr' && c.sc.retAge >= 50 && c.sc.retAge <= 55)) {
    let lo = 0, hi = 5e6, p = null;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2; p = project(c.sc, { ...c.gl, invested: mid });
      const i = p.retYear - p.years[0], port = p.values[i] - p.rows[i].cashVal;
      if (port < p.fireTarget) lo = mid; else hi = mid;
    }
    const i = p.retYear - p.years[0], y1 = yearOneBudget(c.sc.retAge, c.sc, { ...c.gl, invested: hi });
    near(p.rows[i].swrTarget, y1, Math.max(5, y1 * 0.01), c.name);
  }
});

// ── 4. The verdict, the card and the grid agree ─────────────────────────────
test('card: funded, the Your FIRE chip and the sign of the margin say the same thing', () => {
  for (const c of CASES) {
    const p = project(c.sc, c.gl), m = computeCardMetrics(c.sc, c.gl, p);
    const funded = c.gl.wdMode === 'swr' ? m.incomeOk : m.ok;
    if (m.two) assert.equal(m.two.partialOk, funded, c.name);
    const margin = m.portForTarget - m.fireTarget, tol = m.fireTarget * 0.06;   // the card's draw uses start-of-year values (README)
    if (funded) assert.ok(margin >= -tol, `${c.name} funded but margin ${Math.round(margin)}`);
    else if (!m.laterRise && m.shortYear == null) assert.ok(margin <= tol, `${c.name} short but margin ${Math.round(margin)}`);
  }
});

test('the earliest stop age is funded and the year before is not', () => {
  for (const c of CASES.filter((c, i) => i % 3 === 0)) {
    const r = earliestStopAge(c.sc, c.gl);
    if (!r.found || r.age <= Math.max(30, c.gl.currentAge)) continue;
    assert.equal(isFunded({ ...c.sc, retAge: r.age }, c.gl, r.proj), true, c.name);
    const prev = { ...c.sc, retAge: r.age - 1 };
    assert.equal(isFunded(prev, c.gl, project(prev, c.gl)), false, c.name);
  }
});

// ── 5. Monotonicity: more money never hurts, more spending never helps ──────
test('monotone in inputs: stop age never later with more invested, never earlier with more spending', () => {
  for (const c of CASES.filter((c, i) => i % 4 === 0)) {
    const age = g => { const r = earliestStopAge(c.sc, g); return r.found ? r.age : 99; };
    const a0 = age(c.gl);
    assert.ok(age({ ...c.gl, invested: c.gl.invested + 100000 }) <= a0, c.name + ' invested');
    assert.ok(age({ ...c.gl, samPersonalNow: c.gl.samPersonalNow + 300, samPersonalRet: c.gl.samPersonalRet + 300 }) >= a0, c.name + ' spending');
  }
});

test('monotone in tax: a higher tax rate never lowers the FIRE number', () => {
  for (const c of CASES.filter(c => !c.gl.residence)) {
    const t = g => computeFireTarget(c.sc.retAge, c.sc, g, 1 / (1 - 0.3 * g.taxRate), { gainFrac: 0.3 });
    assert.ok(t({ ...c.gl, taxRate: 0.35 }) >= t(c.gl) - 1, c.name);
  }
});

// ── 6. The engines agree with each other ────────────────────────────────────
test('Monte Carlo with the deterministic returns reproduces the deterministic projection', () => {
  for (const c of CASES.filter((c, i) => i % 5 === 0)) {
    const p = project(c.sc, c.gl);
    const seq = p.years.map(() => ({ stock: c.gl.stockRet, bond: c.gl.bondRet }));
    const q = project(c.sc, c.gl, { returnSeq: seq });
    p.values.forEach((v, i) => near(q.values[i], v, 1e-6, `${c.name} ${p.years[i]}`));
    assert.equal(q.fireTarget, p.fireTarget, c.name);
  }
});

test('frozen plan: on the plan today means a gap of 0 and 0 years', () => {
  for (const c of CASES.filter((c, i) => i % 7 === 0)) {
    const p = project(c.sc, c.gl), path = pathOf(p, Date.UTC(2026, 0, 1));
    const r = vsFrozenPlan(path, p.values[1], fracYear(Date.UTC(2027, 0, 1)));
    near(r.gap, 0, 100, c.name); assert.equal(r.years, 0, c.name);
  }
});

// ── 7. Production-shaped households are covered ─────────────────────────────
test('the production branches are in the frozen households (rent in joint, moves abroad, charges)', () => {
  const prod = CASES.filter(c => c.name.includes('/prod/'));
  assert.equal(prod.length, 32);
  const g = prodGl();
  assert.equal(g.rentInJoint, true); assert.ok(g.residence.length === 2 && g.propCharges > 0 && g.pensionsMore.length === 1);
});

// Pending owner decisions (audit 2026-11 F3, F7): written down so they are not lost.
test('% mode: funded means no retirement year below its budget (owner decision, audit F3)', () => {
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr')) {
    const r = earliestStopAge(c.sc, c.gl); if (!r.found) continue;
    const i = r.proj.retYear - r.proj.years[0];
    for (const row of r.proj.rows.slice(i)) assert.ok(!(row.swrTarget > 0) || row.swrIncome >= row.swrTarget * 0.999, `${c.name} ${row.yr}`);
  }
  // the a13 shape: a later cost rise before a later pension is short in between → not funded
  const g = baseGl({ partnerModel: 'two', stockRet: 0.04, bondRet: 0.04, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0, windfalls: [],
    invested: 600000, samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 2000, sharedRet: 2000, partnerPaysIn: 0, partnerInc: 2000,
    partnerRetAge: 60, partnerPension: 1000, partnerPensionAge: 60, partnerAgeOff: 0, pensionAmt: 1500, pensionAge: 63, yearlyItems: 0, soloShared: 1400 });
  const sc = baseSc({ income: 0, hasPartner: true, retAge: 50 }), p = project(sc, { ...g, currentAge: 50, baseYear: 2026 });
  assert.equal(isFunded(sc, { ...g, currentAge: 50 }, p), false);
});

test('stop age is monotone: funded at a ⇒ funded at a + 1 (golden households)', () => {
  for (const c of CASES.filter(c => c.gl.wdMode === 'swr')) {
    let was = false;
    for (let a = 38; a <= 70; a++) {
      const sc = { ...c.sc, retAge: a }, f = isFunded(sc, c.gl, project(sc, c.gl));
      if (was) assert.ok(f, `${c.name}: funded at ${a - 1} but not at ${a}`);
      was = was || f;
    }
  }
});
