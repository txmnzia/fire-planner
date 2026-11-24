// v8.10 Portfolio check-in: the IBKR statement parser and the check-in read-outs.
// Statements below are made up (same layout as IBKR's activity CSV).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIbkrStatement, parseIbkrDate, parsePeriod, importWarnings, sinceLast, depositCheck } from '../js/ibkr.js';

const stmt = ({ period = 'March 1, 2027 - March 31, 2027', start = 100000, dep = 2000, total = 105000 } = {}) => [
  'Statement,Header,Field Name,Field Value',
  `Statement,Data,Period,"${period}"`,
  'Net Asset Value,Header,Asset Class,Prior Total,Current Long,Current Short,Current Total,Change',
  'Net Asset Value,Data,Cash ,0,5000,0,5000,0',
  `Net Asset Value,Data,Stock,0,${total - 5000},0,${total - 5000},0`,
  `Net Asset Value,Data,Total,0,${total},0,${total},0`,
  'Change in NAV,Header,Field Name,Field Value',
  `Change in NAV,Data,Starting Value,${start}`,
  `Change in NAV,Data,Deposits & Withdrawals,${dep}`,
  `Change in NAV,Data,Ending Value,${total}`,
  'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code',
  `Open Positions,Data,Summary,Stocks,EUR,ACWI,1000,1,80,80000,${(total - 5000) / 1000},${total - 5000},0,`,
].join('\n');

test('dates: IBKR long dates and periods', () => {
  assert.equal(parseIbkrDate('May 1, 2026'), '2026-05-01');
  assert.equal(parseIbkrDate('December 31, 2026'), '2026-12-31');
  assert.equal(parseIbkrDate('nonsense'), null);
  assert.deepEqual(parsePeriod('January 1, 2027 - March 31, 2027'), { start: '2027-01-01', end: '2027-03-31' });
  assert.deepEqual(parsePeriod('May 1, 2026'), { start: '2026-05-01', end: '2026-05-01' });
});

test('statement: total, positions, gain %, as-of date and deposits', () => {
  const r = parseIbkrStatement(stmt());
  assert.equal(r.total, 105000);
  assert.equal(r.asOf, '2027-03-31'); assert.equal(r.periodStart, '2027-03-01');
  assert.equal(r.startValue, 100000); assert.equal(r.deposits, 2000);
  assert.deepEqual(r.holdings.map(h => h.sym), ['ACWI', 'Cash']);
  // cost basis 80,000 + cash 5,000 = 85,000 → gain (105,000 − 85,000) / 105,000 = 19%
  assert.equal(r.gainFrac, 19);
});

test('warnings: an old statement, a total that jumped', () => {
  const imp = { total: 105000, asOf: '2027-03-31' };
  assert.deepEqual(importWarnings(imp, null, '2027-04-15'), []);
  assert.equal(importWarnings(imp, null, '2027-05-15').length, 1);                        // 45 days old
  assert.match(importWarnings(imp, { total: 70000, asOf: '2027-02-28' }, '2027-04-15')[0], /right file/); // +50%
  assert.deepEqual(importWarnings(imp, { total: 95000, asOf: '2027-02-28' }, '2027-04-15'), []);   // +10.5%
});

test('since last import: change split into added and markets, only when the periods line up', () => {
  const a = { total: 100000, asOf: '2027-02-28' };
  const b = { total: 105000, asOf: '2027-03-31', periodStart: '2027-03-01', deposits: 2000 };
  assert.deepEqual(sinceLast([a, b]), { since: '2027-02-28', change: 5000, added: 2000, markets: 3000 });
  const c = { ...b, periodStart: '2027-01-01' };   // a year-to-date statement: deposits cover a longer span
  assert.deepEqual(sinceLast([a, c]), { since: '2027-02-28', change: 5000, added: null, markets: null });
  assert.equal(sinceLast([b]), null);
});

test('deposit check: deposits per month vs what you invest on paper, flagged past 20%', () => {
  const imps = [{ periodStart: '2027-01-01', asOf: '2027-03-31', deposits: 6000 },   // 3 months
                { periodStart: '2027-04-01', asOf: '2027-04-30', deposits: 2000 }];  // 1 month
  const ok = depositCheck(imps, 2000, '2027-05-10');
  assert.equal(ok.months, 4); assert.equal(ok.perMonth, 2000); assert.equal(ok.flagged, false);
  const gap = depositCheck(imps, 2600, '2027-05-10');                                 // 2,000 vs 2,600: 23% short
  assert.equal(gap.flagged, true);
  assert.equal(depositCheck(imps, 2000, '2028-05-10'), null);                         // nothing in the last 6 months
});
