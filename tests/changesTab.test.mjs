// v8.17: the Changes tab (two lanes of tiles), imports as snapshots, and
// planned rents / moves abroad switched per scenario. Made-up numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotFromImport } from '../js/ibkr.js';
import { plansForScenario } from '../js/countries.js';
import { scGl, rentAt, taxRateAt, householdCosts, project } from '../js/engine.js';
import { flipOff } from '../js/ui/plans.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const now = html.slice(html.indexOf('id="laneNow"'), html.indexOf('id="lanePlans"'));
const plans = html.slice(html.indexOf('id="lanePlans"'), html.indexOf('<aside class="chg-impact"'));

test('lanes: facts in "Now", plans in "Might happen", the impact beside them', () => {
  for (const t of ['tile-port', 'tile-spend', 'tile-pay', 'tile-pension', 'tile-housing', 'tile-where', 'tile-partner', 'tile-assump'])
    assert.ok(now.includes('id="' + t + '"'), t);
  for (const t of ['tile-buy', 'tile-child', 'tile-paychg', 'tile-flat', 'tile-move', 'tile-wf'])
    assert.ok(plans.includes('id="' + t + '"'), t);
  // planned rents and moves abroad are plans; rent today and the country today are facts
  assert.ok(plans.includes('id="rentMovesList"') && plans.includes('id="resList"'));
  assert.ok(now.includes('id="propRentSaved"') && now.includes('id="retCountry"') && now.includes('id="taxNow"'));
  // the import and the snapshots are one tile; no separate check-in block
  assert.ok(now.includes('id="csvInput"') && now.includes('id="nwHistList"'));
  assert.ok(!html.includes('id="portCheckin"') && !html.includes('id="ibkrManualTotal"'));
  assert.match(html, /<aside class="chg-impact" id="chgImpact">[\s\S]*id="updatePanel"/);
});

test('every tile opens in place: a header button that controls its hidden body', () => {
  const tiles = [...html.matchAll(/<section class="subj tile" id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(tiles.length, 14);
  for (const t of tiles) {
    assert.match(html, new RegExp('<button type="button" class="tile-hd" aria-expanded="false" aria-controls="' + t + '-body">'), t);
    assert.match(html, new RegExp('id="' + t + '-body" hidden'), t);
    assert.match(html, new RegExp('id="' + t + '-sum"'), t);
  }
});

test('an IBKR import is a snapshot: one row per year, IBKR total + cash, actuals kept', () => {
  const h = [{ year: 2025, val: 200000, income: null, spend: null }, { year: 2026, val: 1, income: 5000, spend: 3000 }];
  const r = snapshotFromImport(h, { total: 150000, asOf: '2026-10-31' }, 10000, { change: 6000, added: 3000 });
  assert.deepEqual(r, [{ year: 2025, val: 200000, income: null, spend: null },
    { year: 2026, val: 160000, income: 5000, spend: 3000, date: '2026-10-31', source: 'ibkr', change: 6000, added: 3000 }]);
  const r2 = snapshotFromImport(r, { total: 155000, asOf: '2026-11-30' }, 10000, null);   // a later import that year replaces it
  assert.equal(r2.length, 2); assert.equal(r2[1].val, 165000); assert.equal(r2[1].date, '2026-11-30');
});

test('planned rents and moves abroad: switched per scenario (off lists the scenarios without it)', () => {
  const gl = { rentMoves: [{ from: 2030, rent: 1500, off: [1] }], residence: [{ from: null, tax: 0.3, col: 1 }, { from: 2035, tax: 0, col: 1, off: [2] }] };
  assert.deepEqual(plansForScenario(gl, 1), { rentMoves: [], residence: gl.residence });
  assert.deepEqual(plansForScenario(gl, 2), { rentMoves: gl.rentMoves, residence: [gl.residence[0]] });
  const list = [{ off: [] }]; flipOff(list, 0, 3); assert.deepEqual(list[0].off, [3]); flipOff(list, 0, 3); assert.deepEqual(list[0].off, []);
});

test('engine: a scenario\'s own move lists replace the global ones (scGl), formulas unchanged', () => {
  const gl = { propRentSaved: 1000, rentMoves: [{ from: 2030, rent: 1500 }], residence: [{ from: null, tax: 0.3, col: 1 }, { from: 2035, tax: 0.1, col: 1 }], taxRate: 0.3 };
  const a = scGl(gl, { rentMoves: [], residence: [gl.residence[0]] });
  assert.equal(rentAt(gl, 2031), 1500); assert.equal(rentAt(a, 2031), 1000);
  assert.equal(taxRateAt(gl, 2040), 0.1); assert.equal(taxRateAt(a, 2040), 0.3);
  assert.equal(scGl(gl, { id: 1 }), gl);   // a scenario without its own lists: the same settings object
});

test('engine: the same scenario with and without a flat move differs only by the rent (hand-computed, flat economy)', () => {
  const g = {
    currentAge: 35, lifeExp: 90, baseYear: 2026, inflation: 0, gainFrac: 0, stockRet: 0, bondRet: 0, stockAlloc: 1, bondAllocRet: 0,
    taxRate: 0.3, pensionAmt: 0, pensionAge: 67, cash: 0, cashReturn: 0, windfalls: [], wdMode: 'fixed', swr: 0.04, invested: 100000,
    spendNow: 0, spendRet: 0, partnerInc: 2000, partnerRetAge: 65, partnerPension: 0, partnerPensionAge: 67, partnerAgeOff: 0,
    partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 2400, sharedRet: 2400, soloShared: 1680,
    partnerPaysIn: 900, yearlyItems: 0, rentInJoint: true, propRentSaved: 1200, rentMoves: [{ from: 2030, rent: 1500, off: [] }],
    propBuyYear: 2040, propPrice: 0, propDownPct: 0.2, propTxCostPct: 0.08, propMortgageRate: 0.03, propMortgageTerm: 25,
    childBirthYear: 2030, childCostYearly: 0, childCostUntilAge: 20, childMaternityMonths: 0, childMaternityIncome: 0 };
  const base = { id: 1, retAge: 60, income: 5000, chgYear: null, chgInc: null, hasPartner: true, hasProp: false, hasChild: false };
  const withMove = { ...base, rentMoves: g.rentMoves }, without = { ...base, rentMoves: [] };
  assert.equal(householdCosts(2030, withMove, g, false).sharedBase - householdCosts(2030, without, g, false).sharedBase, 300 * 12);
  const p = project(withMove, g), q = project(without, g);
  // 2030 (her real share 37.5%): your cost is higher by 300 × 12 × 62.5% = 2,250
  assert.equal(q.rows[p.years.indexOf(2030)].netFlow - p.rows[p.years.indexOf(2030)].netFlow, 2250);
});

test('v8.17.1: focusing a tile header does not open it (only fields inside the body do)', () => {
  const src = readFileSync(new URL('../js/ui/tiles.js', import.meta.url), 'utf8');
  const h = src.slice(src.indexOf("addEventListener('focusin'"), src.indexOf("addEventListener('focusin'") + 300);
  assert.match(h, /closest\('\.tile-body'\)/);
});
