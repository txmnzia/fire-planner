// Pay changes as plans (v8.6): take-home from a year, until a year or for good,
// switched on per scenario. Replaces the per-scenario take-home override and the
// single permanent pay change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, payIncomeAt } from '../js/engine.js';
import { normalisePayChanges, payChangesFor, migrateFromFields, isComplete } from '../js/payChanges.js';
import { baseGl, baseSc, goldenCases } from './golden-cases.mjs';

test('payIncomeAt: base pay outside every change; a temporary change ends; the latest start wins', () => {
  const sc = baseSc({ income: 5000, payChanges: [{ from: 2028, to: 2028, amt: 0 }, { from: 2030, to: null, amt: 4000 }, { from: 2033, to: 2034, amt: 3000 }] });
  assert.equal(payIncomeAt(sc, 2027), 5000);
  assert.equal(payIncomeAt(sc, 2028), 0);      // a year off
  assert.equal(payIncomeAt(sc, 2029), 5000);   // back to normal after it
  assert.equal(payIncomeAt(sc, 2031), 4000);   // 4-day week for good
  assert.equal(payIncomeAt(sc, 2033), 3000);   // a later, temporary change wins while it lasts
  assert.equal(payIncomeAt(sc, 2035), 4000);   // then the earlier permanent one applies again
});

test('payIncomeAt: without payChanges, the pre-v8.6 single change still applies', () => {
  const sc = baseSc({ income: 5000, chgYear: 2030, chgInc: 3800 });
  assert.equal(payIncomeAt(sc, 2029), 5000); assert.equal(payIncomeAt(sc, 2030), 3800);
});

test('a permanent pay-change plan projects exactly like the old field (all golden "change" cases)', () => {
  for (const c of goldenCases().filter(c => c.sc.chgYear != null)) {
    const plan = { ...c.sc, chgYear: null, chgInc: null, payChanges: [{ from: c.sc.chgYear, to: null, amt: c.sc.chgInc }] };
    assert.deepEqual(project(plan, c.gl).values, project(c.sc, c.gl).values, c.name);
  }
});

test('hand-computed: a year off at 0 pay costs exactly that year of saving (flat economy)', () => {
  const gl = baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
    pensionAmt: 0, windfalls: [], invested: 100000, spendNow: 2000, spendRet: 2000, childMaternityMonths: 0 });
  const work = baseSc({ retAge: 50, income: 4000 });
  const brk = baseSc({ retAge: 50, income: 4000, payChanges: [{ from: 2030, to: 2030, amt: 0 }] });
  const i = 50 - 35;
  // working: +24k/yr saved; the year off: -24k (spending from savings) instead of +24k → 48k less
  assert.equal(project(work, gl).values[i] - project(brk, gl).values[i], 48000);
});

test('migration: old per-scenario fields become plans; identical changes merge', () => {
  const fields = { s1_chgYear: '2031', s1_chgInc: '1400', s4_chgYear: '2031', s4_chgInc: '1400',
    s5_chgYear: '2031', s5_chgInc: '4000', s2_inc: '5200', s3_inc: '', s3_chgYear: '2032', s3_chgInc: '' };
  const m = migrateFromFields(fields, '2026');
  assert.deepEqual(m.map(p => [p.from, p.to, p.amt, p.on]), [
    [2031, null, 1400, [1, 4]], [2026, null, 5200, [2]], [2031, null, 4000, [5]]]);
  assert.deepEqual(migrateFromFields({}, 2026), []);
  // the migrated plans reproduce the old projection for the scenario that had them
  const gl = baseGl();
  const old = baseSc({ id: 5, chgYear: 2031, chgInc: 4000 });
  const now = baseSc({ id: 5, payChanges: payChangesFor(m, 5) });
  assert.deepEqual(project(now, gl).values, project(old, gl).values);
});

test('normalise and completeness: numbers, scenario ids, a break at 0 is valid, an end before the start is not', () => {
  const [p] = normalisePayChanges([{ name: 'x', from: '2030', to: '', amt: '0', on: ['3', 9, 1, 3] }]);
  assert.deepEqual(p, { name: 'x', from: 2030, to: null, amt: 0, on: [1, 3] });
  assert.equal(isComplete(p), true);
  assert.equal(isComplete({ ...p, to: 2029 }), false);
  assert.equal(isComplete({ ...p, amt: null }), false);
  assert.deepEqual(payChangesFor([p], 3), [{ from: 2030, to: null, amt: 0 }]);
  assert.deepEqual(payChangesFor([p], 2), []);
});

test('wiring: saved with the state, migrated on load, read per scenario; old fields kept hidden', () => {
  const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const sync = read('js/sync.js'), inputs = read('js/inputs.js'), html = read('index.html');
  assert.match(sync, /payChanges: state\.payChanges,/);
  assert.match(sync, /Array\.isArray\(data\.payChanges\)\s*\? normalisePayChanges\(data\.payChanges\)\s*: migrateFromFields\(data\.fields, data\.fields\?\.baseYear\)/);
  assert.match(inputs, /payChanges: payChangesFor\(state\.payChanges, s\)/);
  assert.match(inputs, /chgYear:  null,/);
  for (let n = 1; n <= 5; n++) for (const k of ['inc', 'chgYear', 'chgInc'])
    assert.match(html, new RegExp('<input type="hidden" id="s' + n + '_' + k + '"'));
  const plans = html.slice(html.indexOf('id="tab-panel-plans"'), html.indexOf('<!-- /tab-panel-plans -->'));
  assert.ok(plans.includes('id="payList"'));
  assert.match(html, /id="scgPayRows"/);
});

test('payParts: grid label is the name, then amount · date (v8.6.2)', async () => {
  const { payParts } = await import('../js/ui/plans.js');
  assert.deepEqual(payParts({ name: 'Barista job', from: 2031, to: null, amt: 1400 }), { title: 'Barista job', sub: '€1.4k/mo · from 2031' });
  assert.deepEqual(payParts({ name: '', from: 2030, to: 2031, amt: 0 }), { title: 'Pay change', sub: 'No pay · 2030–2031' });
});
