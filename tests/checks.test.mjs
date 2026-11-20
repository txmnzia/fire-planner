// Missing-input checks (v8.0.2). Regression for a real trap: with the two-person
// model on and its spending fields left empty, every target priced no spending,
// the grid showed FIRE number €0 and "Funded". The checks must catch it and the
// grid must show "missing" instead of a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, yearOneBudget, soloSpend } from '../js/engine.js';
import { scenarioIssues, allIssues } from '../js/checks.js';
import { soloSharedFrom, SOLO_SHARE } from '../js/inputs.js';
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

test('two-person, partner off: personal spending and housing if alone are both required', () => {
  assert.deepEqual(scenarioIssues(baseSc(), emptyTwo()).map(x => x.key), ['soloPersonal', 'soloHousing']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), samPersonalNow: 1200, samPersonalRet: 1200 })).map(x => x.key), ['soloHousing']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), soloShared: 1500 })).map(x => x.key), ['soloPersonal']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ ...emptyTwo(), samPersonalNow: 1200, soloShared: 1500 })), []);
  // the Simple "Monthly spending" never stands in for them (one fact, one field)
  assert.equal(scenarioIssues(baseSc(), emptyTwo()).length, 2);
});

test('simple model needs spending now or retired', () => {
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ spendNow: 0, spendRet: 0 })).map(x => x.key), ['spend']);
  assert.deepEqual(scenarioIssues(baseSc(), baseGl({ spendNow: 0, spendRet: 2400 })), []);
  assert.deepEqual(scenarioIssues(baseSc({ hasPartner: true }), baseGl()), []);
});

test('allIssues: each issue once, across scenarios', () => {
  const keys = allIssues([baseSc(), baseSc({ hasPartner: true }), baseSc({ hasPartner: true }), baseSc()], emptyTwo()).map(x => x.key);
  assert.deepEqual(keys, ['soloPersonal', 'soloHousing', 'twoSpend']);
});

test('soloSpend: always personal + housing if alone, never the Simple spending', () => {
  const gl = baseGl({ partnerModel: 'two', samPersonalNow: 1200, samPersonalRet: 1100, soloShared: 1500 });
  assert.equal(soloSpend(gl, true), 2600); assert.equal(soloSpend(gl, false), 2700);
  assert.equal(soloSpend(emptyTwo(), true), 0);      // empty fields are flagged by checks.js, not replaced
});

test('hand-computed solo budget in the two-person model: (personal 1,100 + alone 1,500) x 12 x 1.02^10', () => {
  const gl = baseGl({ partnerModel: 'two' });         // fixture: samPersonalRet 1100, soloShared 1500
  assert.ok(Math.abs(yearOneBudget(45, baseSc(), gl) - 2600 * 12 * Math.pow(1.02, 10)) < 1e-6);
});

test('grid: a blocking issue shows "missing", never €0 or Funded', () => {
  const gl = emptyTwo();
  for (const sc of [baseSc({ hasPartner: true }), baseSc(), baseSc({ hasPartner: true, hasChild: true })]) {
    const r = scenarioGridResults(sc, gl, project(sc, gl));
    assert.equal(r.status, '⚠ Missing input');
    assert.equal(r.funded, false);
    assert.equal(r.fireTargetText, '—');
    assert.equal(r.lasts, '—');
    assert.ok(r.missing.length > 0);
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
    ...scenarioIssues(baseSc(), emptyTwo())].map(i => i.field));
  assert.equal(fields.size, 3);
  for (const f of fields) assert.match(html, new RegExp('id="' + f + '"'), f);
});

test('if-alone costs: empty = round(70% of shared costs); a typed value always wins', () => {
  assert.equal(SOLO_SHARE, 0.7);
  assert.equal(soloSharedFrom(null, 2501), 1751);   // 2,501 x 0.7 = 1,750.7
  assert.equal(soloSharedFrom(null, 2400), 1680);
  assert.equal(soloSharedFrom(2000, 2400), 2000);
  assert.equal(soloSharedFrom(0, 2400), 0);         // an explicit 0 is respected (and then flagged)
  assert.equal(soloSharedFrom(null, 0), 0);
});

test('if-alone costs: derived from shared costs, a solo scenario is complete and priced from it', () => {
  const gl = baseGl({ partnerModel: 'two', samPersonalNow: 1200, samPersonalRet: 1200, sharedNow: 2400,
    soloShared: soloSharedFrom(null, 2400), windfalls: [] });
  assert.deepEqual(scenarioIssues(baseSc(), gl), []);
  // hand (made-up numbers): (1,200 + 1,680) x 12 x 1.02^10 at a stop age of 45 from 35
  assert.ok(Math.abs(yearOneBudget(45, baseSc(), gl) - (1200 + 1680) * 12 * Math.pow(1.02, 10)) < 1e-6);
});

test('markup: the if-alone field explains the 70% default in its bubble', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Your housing &amp; living costs if alone <button[^>]*title="[^"]*70% of your shared costs/);
  assert.ok(!/Housing & shared costs if alone/.test(html));
});
