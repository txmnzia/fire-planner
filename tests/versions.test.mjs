// v8.14: versions, update log, impact lines, prompts and the first-run review (pure parts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotOf, resultsOf, diffFields, diffLists, changeCount, impactLines, addVersion, MAX_VERSIONS,
         duePrompts, rebaseResidence, reviewItems } from '../js/versionsCore.js';

const payload = { v: 1, ts: 123, fields: { samPersonalNow: '1200', samPaysIn: '1700' }, features: { 1: { partner: true } },
  windfalls: [], payChanges: [], ibkr: { total: 100, holdings: [{ sym: 'X' }], imports: [] }, versions: [1], review: { active: true } };

test('snapshot: drops versions, review, ts and the position list; deep copy', () => {
  const s = snapshotOf(payload);
  assert.equal('versions' in s, false); assert.equal('review' in s, false); assert.equal('ts' in s, false);
  assert.deepEqual(s.ibkr.holdings, []); assert.equal(s.ibkr.total, 100);
  s.fields.samPersonalNow = '9'; assert.equal(payload.fields.samPersonalNow, '1200');
});

test('diff: changed fields and changed lists', () => {
  const a = snapshotOf(payload), b = snapshotOf({ ...payload, fields: { ...payload.fields, samPaysIn: '1800', yearlyItems: '1200' }, windfalls: [{ yr: 2030, amt: 1 }] });
  assert.deepEqual(diffFields(a, b), [{ id: 'samPaysIn', from: '1700', to: '1800' }, { id: 'yearlyItems', from: '', to: '1200' }]);
  assert.deepEqual(diffLists(a, b), ['Windfalls']);
  assert.equal(changeCount(a, b), 3);
  assert.equal(changeCount(a, a), 0);
});

test('results and impact lines: stop age, and the FIRE number when it moves by more than 0.5%', () => {
  const sc = [{ retAge: 43 }, { retAge: 50 }];
  const r = resultsOf(sc, [{ fireTarget: 1000000, finalNetWorth: 2e6 }, { fireTarget: 800000, finalNetWorth: 1e6 }],
    [{ found: true }, { found: false }], ['Solo', 'Together']);
  assert.deepEqual(r, [{ name: 'Solo', age: 43, fire: 1000000, nwEnd: 2000000 }, { name: 'Together', age: null, fire: 800000, nwEnd: 1000000 }]);
  const after = [{ ...r[0], age: 42, fire: 1003000 }, { ...r[1], fire: 760000 }];
  assert.deepEqual(impactLines(r, after), ['Solo: stop 43 → 42', 'Together: FIRE €800k → €760k']);
  assert.deepEqual(impactLines(r, r), []);
});

test('versions: appended, capped, never edited', () => {
  let l = [];
  for (let i = 0; i < MAX_VERSIONS + 5; i++) l = addVersion(l, { id: i });
  assert.equal(l.length, MAX_VERSIONS); assert.equal(l[0].id, 5); assert.equal(l[l.length - 1].id, MAX_VERSIONS + 4);
});

test('prompts: dated plans that have arrived', () => {
  const p = duePrompts({ year: 2027, rentMoves: [{ from: 2027, rent: 1500 }, { from: 2030, rent: 1 }], residence: [{ from: 2026, country: 'DE' }],
    propOn: true, propBuyYear: 2027, childOn: false, childBirthYear: 2026,
    payChanges: [{ from: 2027, to: null, amt: 5500, on: [1] }, { from: 2027, to: 2028, amt: 0, on: [1] }, { from: 2026, to: null, amt: 6000, on: [] }], baseIncome: 5000 });
  assert.deepEqual(p.map(x => x.key), ['rent:0', 'res:0', 'buy', 'pay:0']);
});

test('after moving abroad, later moves are re-based on the new country', () => {
  const m = [{ from: 2030, country: 'FR', col: 80 }, { from: 2040, country: 'PT', col: 60 }, { from: 2045, country: 'ES', col: null }];
  assert.deepEqual(rebaseResidence(m, 0), [{ from: 2040, country: 'PT', col: 75 }, { from: 2045, country: 'ES', col: 125 }]);
  assert.deepEqual(rebaseResidence([{ from: 2030, col: null }, { from: 2040, col: null }], 0), [{ from: 2040, col: null }]);
});

test('review: always the spending, country and pension; rent and charges when relevant', () => {
  assert.deepEqual(reviewItems({ propRentSaved: 0, anyProp: false }).map(i => i.key), ['spend', 'country', 'pension']);
  assert.deepEqual(reviewItems({ propRentSaved: 1000, anyProp: true, propCharges: 0 }).map(i => i.key), ['spend', 'country', 'pension', 'rent', 'charges']);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const i of reviewItems({ propRentSaved: 1, anyProp: true })) assert.match(html, new RegExp('id="' + i.field + '"'), i.field);
});

test('markup and wiring: the panel exists, versions ride in the saved row', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="updatePanel"/);
  const sync = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  assert.match(sync, /versions: state\.versions/); assert.match(sync, /review: state\.review/);
});

test('v8.18.5: impact rows are light: stop age before → after, FIRE as €1.41M with a trend', async () => {
  const { impactRows, fmtFire } = await import('../js/versionsCore.js');
  assert.equal(fmtFire(1412345), '€1.41M'); assert.equal(fmtFire(850400), '€850k'); assert.equal(fmtFire(0), '—');
  const prev = [{ name: 'A', age: 43, fire: 1400000 }, { name: 'B', age: 45, fire: 1000000 }, { name: 'C', age: null, fire: 900000 }];
  const cur  = [{ name: 'A', age: 42, fire: 1410000 }, { name: 'B', age: 45, fire: 1002000 }, { name: 'C', age: 50, fire: 850000 }];
  assert.deepEqual(impactRows(prev, cur), [
    { name: 'A', ageFrom: 43, ageTo: 42, ageChanged: true, fire: '€1.41M', trend: 'up' },      // +0.71%: shown
    { name: 'B', ageFrom: 45, ageTo: 45, ageChanged: false, fire: '€1.00M', trend: null },     // +0.2%: no trend
    { name: 'C', ageFrom: null, ageTo: 50, ageChanged: true, fire: '€850k', trend: 'down' }]);
  assert.deepEqual(impactRows(null, cur).map(r => r.trend), [null, null, null]);              // no saved version yet
  const ui = readFileSync(new URL('../js/ui/versions.js', import.meta.url), 'utf8');
  assert.ok(!/at end/.test(ui) && !/fields.slice(0, 12)/.test(ui), 'no "at end" value, no field-by-field list in the panel');
});
