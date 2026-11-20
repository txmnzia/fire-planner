// Missing-input checks (v8.0.2). Regression for a real trap: with the two-person
// model on and its spending fields left empty, every target priced no spending,
// the grid showed FIRE number €0 and "Funded". The checks must catch it and the
// grid must show "missing" instead of a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, yearOneBudget, soloSpend } from '../js/engine.js';
import { scenarioIssues, allIssues } from '../js/checks.js';
import { scenarioGridResults } from '../js/ui/cards.js';
import { state } from '../js/state.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

state.nwHistory = [];
// two-person model switched on, its fields never filled (made-up numbers elsewhere)
const emptyTwo = () => baseGl({ partnerModel: 'two', samPersonalNow: 0, samPersonalRet: 0, sharedNow: 0,
  sharedRet: 0, soloShared: 0, partnerPersonal: 0, windfalls: [] });

test('the trap still exists for partner scenarios: empty two-person spending prices a zero target', () => {
  const gl = emptyTwo(), sc = baseSc({ hasPartner: true });
  assert.equal(project(sc, gl).fireTarget, 0);    // no spending, no child, no property
});

test('two-person, partner on, spending empty: blocking', () => {
  const i = scenarioIssues(baseSc({ hasPartner: true }), emptyTwo());
  assert.deepEqual(i.map(x => [x.key, x.blocking, x.field]), [['twoSpend', true, 'samPersonalNow_disp']]);
});

test('two-person, partner on: either amount filled is enough', () => {
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: true }), baseGl({ ...emptyTwo(), samPersonalNow: 1200 })), []);
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: true }), baseGl({ ...emptyTwo(), sharedNow: 2400 })), []);
});

test('two-person, partner off, nothing entered: the Simple spending stands in, no issue', () => {
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: false }), emptyTwo()), []);
  // ... unless the Simple spending is empty too
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), spendNow: 0, spendRet: 0 })).map(x => x.key), ['spend']);
});

test('two-person, partner off, personal set but housing-if-alone empty: blocking', () => {
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), samPersonalNow: 1200, samPersonalRet: 1200 })).map(x => x.key), ['solo']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), samPersonalNow: 1200, soloShared: 1500 })), []);
});

test('simple model needs spending now or retired', () => {
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ spendNow: 0, spendRet: 0 })).map(x => x.key), ['spend']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ spendNow: 0, spendRet: 2400 })), []);
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: true }), baseGl()), []);
});

test('allIssues: each issue once, across scenarios', () => {
  const keys = allIssues([baseSc(), baseSc({ hasPartner: true }), baseSc({ hasPartner: true })], emptyTwo()).map(x => x.key);
  assert.deepEqual(keys, ['twoSpend']);
});

test('soloSpend: nothing two-person entered -> Simple spending; else personal + housing alone', () => {
  assert.equal(soloSpend(emptyTwo(), true), 2400);    // spendRet
  assert.equal(soloSpend(emptyTwo(), false), 3000);   // spendNow
  const gl = baseGl({ partnerModel: 'two', samPersonalNow: 1200, samPersonalRet: 1100, soloShared: 1500 });
  assert.equal(soloSpend(gl, true), 2600); assert.equal(soloSpend(gl, false), 2700);
});

test('fix: a solo scenario with nothing two-person entered is priced exactly as in Simple mode', () => {
  for (const wdMode of ['swr', 'fixed']) for (const f of [0, 2, 4, 6]) for (const retAge of [40, 50, 60]) {
    const sc = baseSc({ retAge, hasProp: !!(f & 2), hasChild: !!(f & 4) });
    const two = project(sc, { ...emptyTwo(), wdMode }), simple = project(sc, baseGl({ wdMode, windfalls: [] }));
    assert.equal(two.fireTarget, simple.fireTarget, `${wdMode} f${f} r${retAge} target`);
    two.values.forEach((v, i) => assert.ok(Math.abs(v - simple.values[i]) < 1e-6, `${wdMode} f${f} r${retAge} year ${i}`));
  }
});

test('fix: hand-computed solo budget = spendRet x 12 x 1.02^10 when nothing two-person is entered', () => {
  // made-up: retire at 45 from 35, spendRet 2400, inflation 2%, no child, no property
  assert.ok(Math.abs(yearOneBudget(45, baseSc(), emptyTwo()) - 2400 * 12 * Math.pow(1.02, 10)) < 1e-6);
  assert.ok(project(baseSc(), emptyTwo()).fireTarget > 0);
});

test('grid: a blocking issue shows "missing", never €0 or Funded', () => {
  const gl = emptyTwo();
  for (const sc of [baseSc({ hasPartner: true }), baseSc({ hasPartner: true, hasChild: true })]) {
    const r = scenarioGridResults(sc, gl, project(sc, gl));
    assert.equal(r.status, '⚠ Missing input');
    assert.equal(r.funded, false);
    assert.equal(r.fireTargetText, '—');
    assert.equal(r.lasts, '—');
    assert.ok(r.missing.includes('twoSpend'));
  }
});

test('grid: complete inputs are never flagged (all 192 golden cases)', () => {
  for (const c of goldenCases()) {
    const r = scenarioGridResults(c.sc, c.gl, project(c.sc, c.gl));
    assert.deepEqual(r.missing, [], c.name);
  }
});

test('markup: the banner exists, recalc renders it, and every field a check points to exists', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const recalc = readFileSync(new URL('../js/recalc.js', import.meta.url), 'utf8');
  assert.match(html, /id="inputIssues"[^>]*role="alert"/);
  assert.match(recalc, /renderIssues\(scenarios,gl\)/);
  const fields = new Set([...allIssues([baseSc({ hasPartner: true })], emptyTwo()),
    ...scenarioIssues(baseSc(), baseGl({ spendNow: 0, spendRet: 0 })),
    ...scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), samPersonalNow: 1200 }))].map(i => i.field));
  assert.equal(fields.size, 3);
  for (const f of fields) assert.match(html, new RegExp('id="' + f + '"'), f);
});
