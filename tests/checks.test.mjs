// Missing-input checks (v8.0.2). Regression for a real trap: with the two-person
// model on and its spending fields left empty, every target priced no spending,
// the grid showed FIRE number €0 and "Funded". The checks must catch it and the
// grid must show "missing" instead of a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../js/engine.js';
import { globalIssues, scenarioIssues, allIssues } from '../js/checks.js';
import { scenarioGridResults } from '../js/ui/cards.js';
import { state } from '../js/state.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

state.nwHistory = [];
// two-person model switched on, its fields never filled (made-up numbers elsewhere)
const emptyTwo = () => baseGl({ partnerModel: 'two', samPersonalNow: 0, samPersonalRet: 0, sharedNow: 0,
  sharedRet: 0, soloShared: 0, partnerPersonal: 0, windfalls: [] });

test('the trap exists in the engine: empty two-person spending prices a zero target', () => {
  const gl = emptyTwo(), sc = baseSc({ hasPartner: true });
  assert.equal(project(sc, gl).fireTarget, 0);    // no spending, no child, no property
});

test('globalIssues: two-person model with empty spending is blocking', () => {
  const i = globalIssues(emptyTwo());
  assert.deepEqual(i.map(x => [x.key, x.blocking, x.field]), [['twoSpend', true, 'samPersonalNow_disp']]);
});

test('globalIssues: either two-person amount filled is enough', () => {
  assert.deepEqual(globalIssues(baseGl({ ...emptyTwo(), samPersonalNow: 1200 })), []);
  assert.deepEqual(globalIssues(baseGl({ ...emptyTwo(), sharedNow: 2400 })), []);
});

test('globalIssues: simple model needs spending now or retired', () => {
  assert.deepEqual(globalIssues(baseGl({ spendNow: 0, spendRet: 0 })).map(x => x.key), ['spend']);
  assert.deepEqual(globalIssues(baseGl({ spendNow: 0, spendRet: 2400 })), []);
  assert.deepEqual(globalIssues(baseGl()), []);
});

test('scenarioIssues: solo housing matters only for two-person scenarios without the partner', () => {
  const gl = baseGl({ partnerModel: 'two', soloShared: 0 });
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: false }), gl).map(x => x.key), ['solo']);
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: true }), gl), []);
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: false }), baseGl({ soloShared: 0 })), []); // simple model
});

test('allIssues: each issue once, across scenarios', () => {
  const gl = emptyTwo();
  const keys = allIssues([baseSc({ hasPartner: false }), baseSc({ hasPartner: false }), baseSc({ hasPartner: true })], gl).map(x => x.key);
  assert.deepEqual(keys, ['twoSpend', 'solo']);
});

test('grid: a blocking issue shows "missing", never €0 or Funded', () => {
  const gl = emptyTwo();
  for (const sc of [baseSc({ hasPartner: true }), baseSc({ hasPartner: false }), baseSc({ hasPartner: true, hasChild: true })]) {
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
  const fields = new Set([...allIssues([baseSc({ hasPartner: false })], emptyTwo()),
                          ...globalIssues(baseGl({ spendNow: 0, spendRet: 0 }))].map(i => i.field));
  for (const f of fields) assert.match(html, new RegExp('id="' + f + '"'), f);
});
