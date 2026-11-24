// v8.15 Year-end rollover (pure): which amounts are raised by inflation, and the history row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { yearEndChanges, closeYearHistory, TODAY_MONEY } from '../js/yearEnd.js';

test('amounts not refreshed in the closing year are raised by inflation; pay is not, by default', () => {
  const f = { samPersonalNow: '1000', samPaysIn: '1500', spendUpdated: '2026-05-01', pensionAmt: '800', pensionUpdated: '2025-03-01',
              propRentSaved: '1200', baseIncome: '5000', partnerInc: '', yearlyItems: '0' };
  const ch = yearEndChanges(f, 2026, 0.02);
  const by = Object.fromEntries(ch.map(c => [c.id, c]));
  assert.deepEqual(Object.keys(by), ['samPersonalNow', 'samPaysIn', 'pensionAmt', 'propRentSaved', 'baseIncome']);   // empty/0 left out
  assert.equal(by.samPersonalNow.checked, false);      // refreshed in 2026
  assert.equal(by.pensionAmt.checked, true);           // last statement 2025
  assert.equal(by.pensionAmt.to, 816);
  assert.equal(by.propRentSaved.checked, true);        // no check-in for rent: raised unless unticked
  assert.equal(by.baseIncome.checked, false);          // pay: type a raise instead
  assert.equal(by.baseIncome.to, 5100);
});

test('history: the closing net worth becomes the start of the next year; a row for it is replaced', () => {
  const h = [{ year: 2025, val: 200000 }, { year: 2027, val: 1 }];
  assert.deepEqual(closeYearHistory(h, 2026, 287400.6), [{ year: 2025, val: 200000 }, { year: 2027, val: 287401, income: null, spend: null }]);
});

test('every amount in the list exists as a saved field', async () => {
  const { readFileSync } = await import('node:fs');
  const sync = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  for (const f of TODAY_MONEY) assert.match(sync, new RegExp("'" + f.id + "'"), f.id);
});
