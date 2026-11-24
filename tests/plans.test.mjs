// Plans tab (v8.3): buying a home and the child are plans, described once on
// their own tab. A plan is set up once something that changes the numbers is
// entered; until then it has no switch in the scenario grid and its switch is
// ignored by the calculation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plansSetUp, effectiveFeatures } from '../js/checks.js';
import { baseGl } from './golden-cases.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = id => html.slice(html.indexOf('id="' + id + '"'), html.indexOf('/' + id + ' -->') > 0 ? html.indexOf('/' + id + ' -->') : undefined);

test('set up: a home needs a price; a child needs a yearly cost or parental leave', () => {
  assert.deepEqual(plansSetUp(baseGl()), { prop: true, child: true });
  assert.equal(plansSetUp(baseGl({ propPrice: 0 })).prop, false);
  assert.equal(plansSetUp(baseGl({ childCostYearly: 0, childMaternityMonths: 0 })).child, false);
  assert.equal(plansSetUp(baseGl({ childCostYearly: 0, childMaternityMonths: 6 })).child, true);
});

test('a switch only counts once its plan is set up (no rent saved without a purchase)', () => {
  const on = { partner: true, prop: true, child: true };
  assert.deepEqual(effectiveFeatures(on, baseGl()), on);
  assert.deepEqual(effectiveFeatures(on, baseGl({ propPrice: 0 })), { partner: true, prop: false, child: true });
  assert.deepEqual(effectiveFeatures(on, baseGl({ childCostYearly: 0, childMaternityMonths: 0 })), { partner: true, prop: true, child: false });
  assert.deepEqual(effectiveFeatures({ partner: false, prop: false, child: false }, baseGl()), { partner: false, prop: false, child: false });
});

test('markup (v8.17): one Changes tab; home and child are in the plans lane, facts in the now lane', () => {
  const now = html.slice(html.indexOf('id="laneNow"'), html.indexOf('id="lanePlans"'));
  const plans = html.slice(html.indexOf('id="lanePlans"'), html.indexOf('<aside class="chg-impact"'));
  for (const id of ['propPrice', 'propBuyYear', 'childCostYearly', 'childBirthYear', 'childMaternityMonths']) {
    assert.ok(plans.includes('id="' + id + '"'), id + ' in plans');
    assert.ok(!now.includes('id="' + id + '"'), id + ' not in now');
  }
  assert.ok(now.includes('id="tile-partner"'), 'the partner is a fact');
  // rent today is a fact, entered once; the home plan shows it (not asked)
  assert.ok(now.includes('id="propRentSaved"') && !plans.includes('id="propRentSaved"'));
  assert.ok(plans.includes('id="planRentStops"'));
  assert.ok(!/data-tab="plans"/.test(html), 'no separate Plans tab');
  assert.match(html, /data-tab="situation"[^>]*>\s*<span class="tab-num">1<\/span> Changes/);
});

test('markup: plan rows in the grid can be hidden, and the renderer runs on every recalc', () => {
  assert.match(html, /id="scgRow_prop"/); assert.match(html, /id="scgRow_child"/);
  assert.match(html, /id="scgHiddenPlans"/);
  assert.match(html, /id="planState_prop"/); assert.match(html, /id="planState_child"/);
  assert.match(readFileSync(new URL('../js/recalc.js', import.meta.url), 'utf8'), /renderPlans\(gl\);/);
  assert.match(readFileSync(new URL('../js/inputs.js', import.meta.url), 'utf8'), /effectiveFeatures\(features\[s\], gl\)/);
});

test('rent today: buying without it is flagged, but cautious, so the numbers still show', async () => {
  const { scenarioIssues } = await import('../js/checks.js');
  const { scenarioGridResults } = await import('../js/ui/cards.js');
  const { project } = await import('../js/engine.js');
  const { baseSc } = await import('./golden-cases.mjs');
  const gl = baseGl({ propRentSaved: 0, propCharges: 300 }), sc = baseSc({ hasProp: true });
  const i = scenarioIssues(sc, gl);
  assert.deepEqual(i.map(x => [x.key, x.blocking, x.field]), [['rentNow', false, 'propRentSaved_disp']]);
  assert.deepEqual(scenarioIssues(baseSc(), gl), []);                 // no purchase, no issue
  assert.deepEqual(scenarioIssues(sc, baseGl({ propCharges: 300 })), []);   // rent and charges filled
  assert.deepEqual(scenarioIssues(sc, baseGl()).map(x => [x.key, x.blocking]), [['ownCharges', false]]);   // v8.13: charges empty
  assert.deepEqual(scenarioGridResults(sc, gl, project(sc, gl)).missing, []);   // not blocking
});
