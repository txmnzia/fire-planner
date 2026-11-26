// v8.21: read-outs on the tiles (flat move, buying, partner) and the log's
// "what changed". Made-up numbers, hand-computed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jointAfterMove } from '../js/ui/housing.js';
import { purchaseCostFor, partnerShare } from '../js/engine.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('flat move: joint account after the move = joint today − rent today + new rent', () => {
  assert.equal(jointAfterMove({ sharedNow: 3400, propRentSaved: 2000 }, 1700), 3100);
  assert.equal(jointAfterMove({ sharedNow: 3400, propRentSaved: 0 }, 1700), 5100);     // no rent typed today: the rent adds on
  assert.equal(jointAfterMove({ sharedNow: 0, propRentSaved: 2000 }, 1700), null);      // no joint account entered
  assert.equal(jointAfterMove({ sharedNow: 3400, propRentSaved: 2000 }, null), null);
});

test('buying: your cash needed = price × (down payment + buying costs) × (1 − her share)', () => {
  const gl = { partnerModel: 'two', propPrice: 400000, propDownPct: 0.2, propTxCostPct: 0.08, propHerShare: 0.1 };
  assert.ok(Math.abs(purchaseCostFor(gl, { hasPartner: true }) - 100800) < 1e-6);     // 400k × 28% = 112k, × 90%
  assert.ok(Math.abs(purchaseCostFor(gl, { hasPartner: false }) - 112000) < 1e-6);
  assert.match(read('js/ui/housing.js'), /Your cash needed: <b>' \+ eur\(cash\)/);
});

test('partner: pro rata today = her take-home ÷ both take-homes', () => {
  assert.equal(partnerShare(1400, 6700), 1400 / 8100);       // ≈ 17%
  assert.equal(partnerShare(0, 6700), 0);
  assert.match(read('js/ui/spending.js'), /Pro rata today would be <b>' \+ Math\.round\(pro \* 100\)/);
  assert.match(read('index.html'), /id="partnerReadout"/);
});

test('update log: each entry folds what it changed, field by field', () => {
  const ui = read('js/ui/versions.js');
  assert.match(ui, /diffFields\(older\.snapshot, x\.snapshot\)\.filter\(f => !\/Updated\$\/\.test\(f\.id\)\)/);
  assert.match(ui, /<summary>What changed \('/);
});
