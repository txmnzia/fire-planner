// Layer 1 of the v8 test plan: the golden master.
// tests/fixtures/v8-golden.json was generated from the v7.3 engine (before any v8
// change) by tests/tools/gen-golden.mjs over 192 made-up cases: both withdrawal
// modes, both partner models, every partner/property/child combination, three stop
// ages, with and without a pay change, plus a windfall. Increments 1-6 of v8 must
// leave every number identical. A deliberate calculation change regenerates the
// fixture in its own commit and explains the difference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../js/engine.js';
import { goldenCases } from './golden-cases.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/v8-golden.json', import.meta.url)));
const cases = goldenCases();

test('golden: the fixture covers exactly the generated cases', () => {
  assert.equal(cases.length, 128);   // v8.24: + 32 production-shaped households
  assert.deepEqual(Object.keys(golden).sort(), cases.map(c => c.name).sort());
});

for (const c of cases) {
  test('golden: ' + c.name + ' is unchanged', () => {
    const p = project(c.sc, c.gl), g = golden[c.name];
    assert.equal(p.values.length, g.values.length, 'projection horizon');
    p.values.forEach((v, i) => assert.ok(Math.abs(v - g.values[i]) < 1e-6, `year ${i}: ${v} vs ${g.values[i]}`));
    assert.ok(Math.abs(p.finalNetWorth - g.finalNetWorth) < 1e-6, 'final net worth');
    assert.equal(p.fireTarget, g.fireTarget, 'FIRE target');
    assert.equal(p.fireTargetAdj ?? null, g.fireTargetAdj, 'adjusted FIRE target');
    assert.equal(p.infeasibleYear ?? null, g.infeasibleYear, 'infeasible year');
    assert.equal(p.retYear, g.retYear, 'stop year');
  });
}

test('golden: project() never mutates its inputs', () => {
  for (const c of cases.filter((_, i) => i % 7 === 0)) {
    const gl = structuredClone(c.gl), sc = structuredClone(c.sc);
    project(sc, gl);
    assert.deepEqual(gl, c.gl); assert.deepEqual(sc, c.sc);
  }
});

test('golden: project() is deterministic', () => {
  for (const c of cases.filter((_, i) => i % 11 === 0)) {
    assert.deepEqual(project(c.sc, c.gl).values, project(c.sc, c.gl).values);
  }
});
