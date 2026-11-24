// v8.11: rent today and planned rent changes, where you live (tax on gains and
// cost of living per year). Made-up numbers, flat economy, hand-computed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { householdCosts, soloSpend, rentAt, taxRateAt, colAt, rentSavedMonthly, computeFireTarget, project, SOLO_SHARE } from '../js/engine.js';
import { buildResidence, normaliseResidence, normaliseRentMoves, countryNote } from '../js/countries.js';
import { COUNTRY_TAX } from '../js/taxTable.js';

const base = (over = {}) => ({
  currentAge: 35, lifeExp: 90, baseYear: 2026, inflation: 0, gainFrac: 0.5, stockRet: 0, bondRet: 0,
  stockAlloc: 1, bondAllocRet: 0, taxRate: 0.3, pensionAmt: 0, pensionAge: 67, cash: 0, cashReturn: 0,
  windfalls: [], wdMode: 'fixed', swr: 0.04, invested: 100000, spendNow: 0, spendRet: 0,
  partnerInc: 2000, partnerRetAge: 65, partnerPension: 0, partnerPensionAge: 67, partnerAgeOff: 0,
  partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 3000, sharedRet: 3000,
  soloShared: 2100, partnerPaysIn: 1000, yearlyItems: 0,
  propBuyYear: 2032, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.08, propMortgageRate: 0.03,
  propMortgageTerm: 25, propRentSaved: 1200, childBirthYear: 2030, childCostYearly: 0, childCostUntilAge: 20,
  childMaternityMonths: 0, childMaternityIncome: 0, ...over });
const sc = (over = {}) => ({ id: 1, retAge: 60, income: 5000, chgYear: null, chgInc: null, hasPartner: true, hasProp: false, hasChild: false, ...over });

test('rentAt: rent today, replaced by each planned rent from its year', () => {
  const g = base({ rentMoves: [{ from: 2030, rent: 1500 }, { from: 2040, rent: 900 }] });
  assert.equal(rentAt(g, 2029), 1200); assert.equal(rentAt(g, 2030), 1500); assert.equal(rentAt(g, 2045), 900);
});

test('joint costs swap only the rent: (joint − rent today) + rent that year', () => {
  const g = base({ rentInJoint: true, rentMoves: [{ from: 2030, rent: 1500 }] });
  assert.equal(householdCosts(2029, sc(), g, false).sharedBase, 3000 * 12);
  assert.equal(householdCosts(2030, sc(), g, false).sharedBase, (3000 - 1200) * 12 + 1500 * 12);   // 39,600
});

test('cost of living scales everything but housing, from the move year', () => {
  const g = base({ rentInJoint: true, residence: [{ from: null, tax: 0.3, col: 1 }, { from: 2035, tax: 0.185, col: 0.8 }] });
  assert.equal(colAt(g, 2034), 1); assert.equal(colAt(g, 2035), 0.8);
  const c = householdCosts(2035, sc(), g, false);
  assert.ok(Math.abs(c.sharedBase - (1800 * 12 * 0.8 + 1200 * 12)) < 1e-6);   // 31,680
  assert.ok(Math.abs(c.samPersonal - 1000 * 12 * 0.8) < 1e-6);
  assert.equal(taxRateAt(g, 2034), 0.3); assert.equal(taxRateAt(g, 2035), 0.185);
});

test('without a residence list or rent-in-joint nothing changes (older gl objects)', () => {
  const g = base();
  assert.equal(taxRateAt(g, 2050), 0.3); assert.equal(colAt(g, 2050), 1);
  assert.equal(householdCosts(2040, sc(), g, true).sharedBase, 3000 * 12);
});

test('living alone: own + 70% of (joint without rent + yearly) + 70% of the rent that year', () => {
  const g = base({ rentInJoint: true, yearlyItems: 1200, samPersonalRet: 900, retMult: 0.9 });
  assert.ok(Math.abs(soloSpend(g, false, 2026) - (1000 + 0.7 * (1800 + 100) + 0.7 * 1200)) < 1e-9);   // 3,170
  assert.ok(Math.abs(soloSpend(g, true, 2026) - (900 + 0.7 * 1900 * 0.9 + 0.7 * 1200)) < 1e-9);      // 2,937; rent not scaled
  assert.equal(SOLO_SHARE, 0.7);
});

test('buying saves whatever rent applies; living alone it saves 70% of it', () => {
  const g = base({ rentInJoint: true, rentMoves: [{ from: 2034, rent: 1500 }] });
  assert.equal(rentSavedMonthly(g, sc({ hasProp: true }), 2031), 0);
  assert.equal(rentSavedMonthly(g, sc({ hasProp: true }), 2032), 1200);
  assert.equal(rentSavedMonthly(g, sc({ hasProp: true }), 2034), 1500);
  assert.ok(Math.abs(rentSavedMonthly(g, sc({ hasProp: true, hasPartner: false }), 2034) - 1050) < 1e-9);
  // with the partner, buying removes the rent from the joint costs entirely
  const c = householdCosts(2034, sc({ hasProp: true }), g, false);
  assert.equal(c.sharedBase - c.rentSaved, 1800 * 12);
});

test('fixed target: sales after a move are taxed at the new country\'s rate (hand-computed)', () => {
  // living alone 3,000/mo = 36,000/yr, 60 → 70, no returns: gain fraction stays 50%.
  // 5 years at 30% (gross-up 1/0.85), then 5 years at 0% → 211,765 + 180,000.
  const g = base({ wdMode: 'fixed', lifeExp: 70, soloShared: 2000, soloSharedRet: 2000,
    residence: [{ from: null, tax: 0.3, col: 1 }, { from: 2056, tax: 0, col: 1 }] });
  const s = sc({ hasPartner: false });
  assert.equal(computeFireTarget(60, s, g, 1 / 0.85, { gainFrac: 0.5 }), Math.round(5 * 36000 / 0.85 + 5 * 36000));
  // same rate everywhere = exactly the old pricing
  const same = base({ wdMode: 'fixed', lifeExp: 70, soloShared: 2000, soloSharedRet: 2000, residence: [{ from: null, tax: 0.3, col: 1 }] });
  assert.equal(computeFireTarget(60, s, same, 1 / 0.85, { gainFrac: 0.5 }), computeFireTarget(60, s, base({ wdMode: 'fixed', lifeExp: 70, soloShared: 2000, soloSharedRet: 2000 }), 1 / 0.85));
});

test('projection: the withdrawal year uses the tax rate where you live that year', () => {
  const g = base({ wdMode: 'fixed', lifeExp: 70, invested: 2e6, soloShared: 2000, soloSharedRet: 2000,
    residence: [{ from: null, tax: 0.3, col: 1 }, { from: 2056, tax: 0, col: 1 }] });
  const p = project(sc({ hasPartner: false, retAge: 60 }), g);
  const r55 = p.rows[p.years.indexOf(2055)], r56 = p.rows[p.years.indexOf(2056)];
  assert.ok(r55.taxPaid > 0);
  assert.equal(r56.taxPaid, 0);
});

test('residence: presets, overrides and moves', () => {
  assert.equal(COUNTRY_TAX.DE, 18.5);
  const r = buildResidence('DE', null, [{ from: '2035', country: 'FR', tax: '', col: '90' }, { from: '', country: 'ES' }]);
  assert.deepEqual(r, [{ from: null, country: 'DE', tax: 0.185, col: 1 }, { from: 2035, country: 'FR', tax: 0.3, col: 0.9 }]);
  assert.equal(buildResidence('FR', 25, [])[0].tax, 0.25);
  assert.deepEqual(normaliseResidence([{ from: 2040, country: 'XX' }])[0].country, 'FR');
  assert.deepEqual(normaliseRentMoves([{ from: '2031', rent: '1500' }, { from: '', rent: 1 }]), [{ from: 2031, rent: 1500 }]);
  assert.match(countryNote('DE'), /70% of the gain/);
  assert.match(countryNote('PT'), /28% flat rate/);
});

test('rent today edit: transfers move by the same amount, split like today; never on a first entry', async () => {
  const src = readFileSync(new URL('../js/ui/housing.js', import.meta.url), 'utf8');
  const fn = new Function('return ' + src.slice(src.indexOf('function rentShift'), src.indexOf('\n}\n', src.indexOf('function rentShift')) + 2))();
  assert.deepEqual(fn(1000, 1100, 1500, 900), { you: 1563, she: 938, delta: 100 });   // her 37.5%
  assert.equal(fn(0, 1100, 1500, 900), null);
  assert.equal(fn(1000, 1000, 1500, 900), null);
});

test('markup: where you live and planned rents exist; inputs feed the engine', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['taxNow', 'resList', 'resNotes', 'rentMovesList', 'rentNote']) assert.match(html, new RegExp('id="' + id + '"'), id);
  const inputs = readFileSync(new URL('../js/inputs.js', import.meta.url), 'utf8');
  assert.match(inputs, /rentInJoint:\s+true/); assert.match(inputs, /residence,/);
});
