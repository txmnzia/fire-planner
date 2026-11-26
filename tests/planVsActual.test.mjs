// v8.20: plan vs actual against a frozen plan (a saved version). Made-up numbers,
// hand-computed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fracYear, pathOf, pickPlan, expectedAt, vsFrozenPlan } from '../js/planVsActual.js';
import { resultsOf, snapshotOf } from '../js/versionsCore.js';
import { project } from '../js/engine.js';
import { baseGl, baseSc } from './golden-cases.mjs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const path = { t0: 2026, y0: 2026, v: [100000, 130000, 160000, 190000] };

test('fracYear: the save moment as a fractional year', () => {
  assert.equal(fracYear(new Date(Date.UTC(2026, 0, 1))), 2026);
  assert.equal(fracYear(new Date(Date.UTC(2026, 6, 2, 12))), 2026 + 182.5 / 365);   // 2 July noon = half of 2026
});

test('expectedAt: linear between the yearly points, null outside the path', () => {
  assert.equal(expectedAt(path, 2026), 100000);
  assert.equal(expectedAt(path, 2026.5), 115000);          // halfway to 130,000
  assert.equal(expectedAt(path, 2028.25), 167500);         // 160,000 + 0.25 × 30,000
  assert.equal(expectedAt(path, 2029), 190000);
  assert.equal(expectedAt(path, 2025.9), null); assert.equal(expectedAt(path, 2029.1), null);
});

test('vsFrozenPlan: € gap to where the plan expected you, and years ahead/behind (hand-computed)', () => {
  // mid-2026 with 120,000: expected 115,000 → +5,000; the plan reaches 120,000 at 2026 + 20/30 = 2026.67 → 0 years
  assert.deepEqual(vsFrozenPlan(path, 120000, 2026.5), { gap: 5000, expected: 115000, years: 0, open: false });
  // mid-2026 with 170,000: reached at 2028 + 10/30 = 2028.33 → 1.83 → 2 years ahead
  assert.deepEqual(vsFrozenPlan(path, 170000, 2026.5), { gap: 55000, expected: 115000, years: 2, open: false });
  // early 2028 (2028.0, expected 160,000) with 100,000: reached at 2026.0 → 2 years behind
  assert.deepEqual(vsFrozenPlan(path, 100000, 2028), { gap: -60000, expected: 160000, years: -2, open: false });
  // below the plan's start: first year's slope extended back: 2026 + (70,000 − 100,000)/30,000 = 2025 → at 2027.0: 2 behind
  assert.deepEqual(vsFrozenPlan(path, 70000, 2027), { gap: -60000, expected: 130000, years: -2, open: false });
  // above the whole path: ahead by at least its horizon
  assert.deepEqual(vsFrozenPlan(path, 250000, 2026.5), { gap: 135000, expected: 115000, years: 3, open: true });
  assert.equal(vsFrozenPlan(path, 120000, 2031), null);    // past the path
});

test('pickPlan: picked id, else the latest year-end close, else the latest version; only versions with paths', () => {
  const withP = (id, kind) => ({ id, kind, results: [{ path }] });
  const old = { id: 'old', kind: 'save', results: [{ name: 'A' }] };     // saved before v8.20: no path
  const vs = [old, withP('a', 'save'), withP('ye', 'yearend'), withP('b', 'save')];
  assert.equal(pickPlan(vs, 'a').id, 'a');
  assert.equal(pickPlan(vs, null).id, 'ye');
  assert.equal(pickPlan(vs, 'old').id, 'ye');               // no path → default pick
  assert.equal(pickPlan(vs, 'gone').id, 'ye');
  assert.equal(pickPlan([old, withP('a', 'save'), withP('b', 'save')], null).id, 'b');
  assert.equal(pickPlan([old], null), null);
});

test('a saved version freezes each scenario\'s path; a later assumption change does not move it', () => {
  const gl = baseGl(), sc = baseSc({ retAge: 50 }), p = project(sc, gl);
  const saved = Date.UTC(2026, 10, 26);
  const r = resultsOf([sc], [p], [{ found: true }], ['A'], saved)[0];
  assert.equal(r.path.y0, 2026); assert.equal(r.path.t0, +fracYear(saved).toFixed(4));
  assert.equal(r.path.v.length, p.values.length);
  r.path.v.forEach((x, i) => { assert.equal(x % 100, 0); assert.ok(Math.abs(x - p.values[i]) <= 50); });   // rounded to €100
  const frozen = JSON.stringify(r.path);
  project(sc, baseGl({ stockRet: 0.05 }));                  // settings change later…
  assert.equal(JSON.stringify(r.path), frozen);             // …the plan is a copy, it never moves
  assert.equal(resultsOf([sc], [p], [{ found: true }], ['A'])[0].path, undefined);   // impact rows: no path
  // the plan pick is not a setting: not in snapshots (restoring a version keeps today's pick)
  assert.equal('planId' in snapshotOf({ fields: {}, planId: 'x' }), false);
});

test('wiring: saved and synced; chart, legend and cards share one plan line', () => {
  assert.match(read('js/sync.js'), /planId: state\.planId/);
  assert.match(read('js/sync.js'), /state\.planId = typeof data\.planId === 'string'/);
  assert.match(read('js/ui/versions.js'), /resultsOf\(state\.lastScenarios, state\.lastProjs, state\.lastStops, \[0, 1, 2, 3, 4\]\.map\(getScenarioName\), ts\)/);
  assert.match(read('js/ui/versions.js'), /planId: state\.planId \}/);
  assert.match(read('js/ui/versions.js'), /data-plan=/);
  assert.match(read('js/ui/cards.js'), /vsPlanFor\(/);
  assert.match(read('js/ui/charts.js'), /planLineFor\(state\.activeScIdx, sc, gl\)/);
  assert.ok(!/buildPlanProj/.test(read('js/ui/cards.js') + read('js/ui/charts.js')));
});
