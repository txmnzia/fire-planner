// v8.8: one partner model. Migration of old payloads onto the four account
// numbers (pure), and the retirement % change. Made-up numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateSpending } from '../js/spendMigration.js';
import { householdCosts, soloSpend } from '../js/engine.js';

test('migration: already migrated payloads are left alone', () => {
  assert.equal(migrateSpending({ samPaysIn: '1000' }), null);
  assert.equal(migrateSpending({ samPaysIn: '' }), null);
});

test('migration: two-person payload with "she pays in" keeps the joint total and her amount', () => {
  const m = migrateSpending({ partnerModel: 'two', samPersonalNow: '1200', sharedNow: '2400', partnerPaysIn: '900' });
  assert.deepEqual(m, { samPersonalNow: 1200, partnerPaysIn: 900, samPaysIn: 1500 });
});

test('migration: without "she pays in", her amount is today\'s pro-rata share (old floor/cap)', () => {
  // incomes 5,000 vs 1,800 → 26.47%; joint 2,400 → 635 / 1,765
  const m = migrateSpending({ partnerModel: 'two', samPersonalNow: '1200', sharedNow: '2400',
    baseIncome: '5000', partnerInc: '1800', shareMin: '0', shareMax: '50' });
  assert.equal(m.partnerPaysIn, 635);
  assert.equal(m.samPaysIn, 1765);
  // a 20% cap applies: 480 / 1,920
  const c = migrateSpending({ partnerModel: 'two', sharedNow: '2400', baseIncome: '5000', partnerInc: '1800', shareMax: '20' });
  assert.equal(c.partnerPaysIn, 480);
  // her old default cap was 50% (empty field)
  const d = migrateSpending({ partnerModel: 'two', sharedNow: '2000', baseIncome: '1000', partnerInc: '9000' });
  assert.equal(d.partnerPaysIn, 1000);
});

test('migration: she paid in more than the joint total → you pay in 0', () => {
  const m = migrateSpending({ partnerModel: 'two', sharedNow: '1000', partnerPaysIn: '1500' });
  assert.equal(m.samPaysIn, 0);
});

test('migration: separate retirement amounts become one % change on the total', () => {
  // now 1,000 + 3,000 = 4,000; retired 900 + (empty = 3,000) = 3,900 → −2.5% → −3 (rounded)
  const m = migrateSpending({ partnerModel: 'two', samPersonalNow: '1000', samPersonalRet: '900', sharedNow: '3000', partnerPaysIn: '1000' });
  assert.equal(m.retSpendChange, -3);
  const n = migrateSpending({ partnerModel: 'two', samPersonalNow: '1000', sharedNow: '3000', partnerPaysIn: '1000' });
  assert.equal('retSpendChange' in n, false);
});

test('migration: Simple-model payload → monthly spending becomes your own spending, joint left empty', () => {
  const m = migrateSpending({ partnerModel: 'simple', spendNow: '3000', sharedNow: '2400' });
  assert.deepEqual(m, { samPersonalNow: 3000 });
  assert.deepEqual(migrateSpending({ spendNow: '2500' }), { samPersonalNow: 2500 });
});

test('retirement change applies to yearly items and to the costs if alone', () => {
  const gl = { baseYear: 2026, inflation: 0, samPersonalNow: 1000, samPersonalRet: 900, sharedNow: 2000,
    sharedRet: 1800, yearlyItems: 1200, yearlyItemsRet: 1080, soloShared: 1470, soloSharedRet: 1323,
    partnerPersonal: 0 };
  const sc = { hasChild: false, hasProp: false };
  assert.equal(householdCosts(2026, sc, gl, false).sharedBase, 2000 * 12 + 1200);
  assert.equal(householdCosts(2040, sc, gl, true).sharedBase, 1800 * 12 + 1080);   // −10% on both
  assert.equal(soloSpend(gl, false), 1000 + 1470);
  assert.equal(soloSpend(gl, true), 900 + 1323);
  // older gl objects without the *Ret fields keep the v8.7 behaviour
  const old = { ...gl }; delete old.yearlyItemsRet; delete old.soloSharedRet;
  assert.equal(householdCosts(2040, sc, old, true).sharedBase, 1800 * 12 + 1200);
  assert.equal(soloSpend(old, true), 900 + 1470);
});

test('markup: one model — no Simple switch, multiplier, Household row or her-savings fields', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['partnerModel', 'partnerSpendMult', 'spendNow', 'spendRet', 'sharedNow', 'sharedRet', 'samPersonalRet',
    'soloShared', 'partnerPersonal', 'partnerPortfolio', 'partnerGainFrac', 'shareMin', 'shareMax', 'scgHouseholdRow'])
    assert.ok(!new RegExp('id="' + id + '"').test(html), id);
  for (const id of ['samPersonalNow', 'samPaysIn', 'partnerPaysIn', 'yearlyItems', 'retSpendChange', 'spendUpdated'])
    assert.ok(new RegExp('id="' + id + '"').test(html), id);
});
