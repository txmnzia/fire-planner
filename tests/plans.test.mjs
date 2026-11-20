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

test('markup: the Plans tab holds the home and child cards; My Situation no longer does', () => {
  const plans = html.slice(html.indexOf('id="tab-panel-plans"'), html.indexOf('<!-- /tab-panel-plans -->'));
  const sit = html.slice(html.indexOf('id="tab-panel-situation"'), html.indexOf('<!-- /tab-panel-situation -->'));
  for (const id of ['propPrice', 'propBuyYear', 'propRentSaved', 'childCostYearly', 'childBirthYear', 'childMaternityMonths']) {
    assert.ok(plans.includes('id="' + id + '"'), id + ' on Plans');
    assert.ok(!sit.includes('id="' + id + '"'), id + ' not on My Situation');
  }
  assert.ok(sit.includes('id="subj-partner"'), 'the partner stays on My Situation');
  assert.ok(!/data-t="subj-(property|child)"/.test(sit), 'rail has no links to moved cards');
  assert.match(html, /data-tab="plans"[^>]*onclick="switchTab\('plans'\)"/);
});

test('markup: plan rows in the grid can be hidden, and the renderer runs on every recalc', () => {
  assert.match(html, /id="scgRow_prop"/); assert.match(html, /id="scgRow_child"/);
  assert.match(html, /id="scgHiddenPlans"/);
  assert.match(html, /id="planState_prop"/); assert.match(html, /id="planState_child"/);
  assert.match(readFileSync(new URL('../js/recalc.js', import.meta.url), 'utf8'), /renderPlans\(gl\);/);
  assert.match(readFileSync(new URL('../js/inputs.js', import.meta.url), 'utf8'), /effectiveFeatures\(features\[s\], gl\)/);
});
