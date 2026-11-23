// v8 increment 1 (scenario grid). Layers 6 and 8 of the v8 test plan:
// every result cell equals the shared card metric (one number, one function),
// and the cell texts follow from those numbers by hand-checkable rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { project, isTwoPerson } from '../js/engine.js';
import { computeCardMetrics, scenarioGridResults } from '../js/ui/cards.js';
import { state } from '../js/state.js';
import { fmtK, stepClamp } from '../js/util.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

state.nwHistory = [];
const cases = goldenCases();

test('grid results: every number is the card metric, for all 192 cases', () => {
  for (const c of cases) {
    const p = project(c.sc, c.gl);
    const m = computeCardMetrics(c.sc, c.gl, p), r = scenarioGridResults(c.sc, c.gl, p);
    assert.equal(r.fireTarget, m.fireTarget, c.name + ' FIRE number');
    assert.equal(r.nwAtStop, m.portRet, c.name + ' net worth at stop');
    assert.equal(r.depletionYear, m.depletionYear, c.name + ' depletion year');
    assert.equal(r.funded, c.gl.wdMode === 'swr' ? !!m.incomeOk : !!m.ok, c.name + ' funded flag');
    assert.equal(r.fireTarget, p.fireTarget, c.name + ' FIRE number = engine target');
  }
});

test('grid results: texts follow the numbers', () => {
  for (const c of cases) {
    const p = project(c.sc, c.gl), m = computeCardMetrics(c.sc, c.gl, p), r = scenarioGridResults(c.sc, c.gl, p);
    assert.equal(r.fireTargetText, fmtK(m.fireTarget));
    assert.equal(r.nwAtStopText, fmtK(m.portRet));
    assert.equal(r.status.startsWith('✓'), r.funded, c.name + ' status symbol');
    if (c.gl.wdMode === 'swr') {
      const gap = m.targetMonthly - m.netMonthly;            // monthly shortfall, hand rule
      assert.equal(r.status, r.funded ? '✓ Funded' : '× Short ' + fmtK(gap) + '/mo');
    } else {
      assert.equal(r.status, r.funded ? '✓ +' + fmtK(m.surplus) : '× Gap ' + fmtK(-m.surplus));
    }
    if (r.funded) assert.equal(r.gap, 0, c.name + ' funded means no gap');
    else assert.ok(r.gap > 0, c.name + ' short means a positive gap');
  }
});

test('grid results: "money lasts" age = current age + (depletion year - base year)', () => {
  let seen = { lasts: 0, runsOut: 0 };
  for (const c of cases) {
    const p = project(c.sc, c.gl), r = scenarioGridResults(c.sc, c.gl, p);
    if (r.depletionYear == null) {
      seen.lasts++;
      assert.equal(r.lasts, 'to 90+'); assert.equal(r.lastsOk, true); assert.equal(r.depletionAge, null);
    } else {
      seen.runsOut++;
      const age = 35 + r.depletionYear - 2026;
      assert.equal(r.depletionAge, age); assert.equal(r.lasts, 'runs out at ' + age); assert.equal(r.lastsOk, false);
    }
  }
  assert.ok(seen.lasts > 0, 'some cases last to the end');
});

test('grid results: a hand-built shortfall reads as short, with the exact monthly gap', () => {
  // Stop at 36 with €160k: far from enough, so the SWR income cannot meet the budget.
  const gl = baseGl({ windfalls: [] }), sc = baseSc({ retAge: 36 });
  const p = project(sc, gl), m = computeCardMetrics(sc, gl, p), r = scenarioGridResults(sc, gl, p);
  assert.equal(r.funded, false);
  assert.equal(r.gap, m.targetMonthly - m.netMonthly);
  assert.ok(r.gap > 0);
});

test('grid results: no household cell any more (v8.8)', () => {
  for (const c of cases) assert.equal('household' in scenarioGridResults(c.sc, c.gl, project(c.sc, c.gl)), false, c.name);
});

test('grid results: pure (inputs untouched, same answer twice)', () => {
  for (const c of cases.filter((_, i) => i % 9 === 0)) {
    const gl = structuredClone(c.gl), sc = structuredClone(c.sc), p = project(sc, gl);
    const a = scenarioGridResults(sc, gl, p), b = scenarioGridResults(sc, gl, p);
    assert.deepEqual(a, b); assert.deepEqual(gl, c.gl); assert.deepEqual(sc, c.sc);
  }
});

test('grid results: later stop age never lowers net worth at stop (property)', () => {
  for (const wdMode of ['swr', 'fixed']) for (const f of [0, 1, 2, 4, 7]) {
    let prev = -Infinity;
    for (let retAge = 36; retAge <= 70; retAge++) {
      const gl = baseGl({ wdMode, windfalls: [] });
      const sc = baseSc({ retAge, hasPartner: !!(f & 1), hasProp: !!(f & 2), hasChild: !!(f & 4) });
      const nw = scenarioGridResults(sc, gl, project(sc, gl)).nwAtStop;
      // accumulation keeps adding as long as saving is positive in this fixture
      if (!(f & 2) && !(f & 4)) assert.ok(nw >= prev - 1e-6, `${wdMode} f${f} age ${retAge}: ${nw} < ${prev}`);
      prev = nw;
    }
  }
});

test('stepClamp: steps, clamps and recovers from blanks', () => {
  assert.equal(stepClamp('45', 1, 30, 75), 46);
  assert.equal(stepClamp('45', -1, 30, 75), 44);
  assert.equal(stepClamp('75', 1, 30, 75), 75);
  assert.equal(stepClamp('30', -1, 30, 75), 30);
  assert.equal(stepClamp('', 1, 30, 75), 31);
  assert.equal(stepClamp('abc', 0, 30, 75), 30);
  assert.equal(stepClamp('90', 0, 30, 75), 75);
  assert.equal(stepClamp('12', 0, 30, 75), 30);
});
