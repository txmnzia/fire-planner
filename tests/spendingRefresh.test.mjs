// v8.7 Spending refresh: what she really pays in, and shared yearly items.
// Hand-computed with made-up numbers in a flat economy (no inflation, no returns).
import test from 'node:test';
import assert from 'node:assert/strict';
import { project, twoPersonCost, partnerShare, actualShare, investNowMonthly } from '../js/engine.js';
import { soloSharedFrom } from '../js/inputs.js';
import { refreshedText } from '../js/ui/spending.js';

function gl(over = {}) {
  return {
    currentAge: 35, lifeExp: 90, baseYear: 2026, spendNow: 3000, spendRet: 2400,
    inflation: 0, gainFrac: 0.25, stockRet: 0, bondRet: 0, stockAlloc: 1, bondAllocRet: 0.4,
    taxRate: 0.30, pensionAmt: 700, pensionAge: 67, cash: 10000, cashReturn: 0,
    windfalls: [], wdMode: 'swr', swr: 0.04, invested: 150000,
    partnerInc: 1800, partnerRetAge: 65, partnerPension: 500, partnerPensionAge: 67,
    partnerSpendMult: 1.5, partnerAgeOff: 0,
    propBuyYear: 2032, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.08,
    propMortgageRate: 0.035, propMortgageTerm: 25, propRentSaved: 1000,
    childBirthYear: 2034, childCostYearly: 9000, childCostUntilAge: 22,
    childMaternityMonths: 6, childMaternityIncome: 2000,
    partnerModel: 'two', samPersonalNow: 1200, samPersonalRet: 1100,
    sharedNow: 2400, sharedRet: 2200, soloShared: 1500, partnerPersonal: 700,
    partnerPortfolio: 30000, partnerGainFrac: 0.1, shareMin: 0, shareMax: 0.5,
    ...over,
  };
}
const sc = (over = {}) => ({ id: 1, retAge: 45, income: 5000, chgYear: null, chgInc: null,
  hasPartner: true, hasProp: false, hasChild: false, ...over });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' vs ' + b);

test('actualShare: paid in / joint total, capped at 100%; null when empty or no joint total', () => {
  near(actualShare(gl({ partnerPaysIn: 900 })), 0.375);           // 900 / 2400
  assert.equal(actualShare(gl({ partnerPaysIn: 3000 })), 1);        // more than the total
  assert.equal(actualShare(gl({ partnerPaysIn: 0 })), 0);           // she pays nothing: a fact, not "empty"
  assert.equal(actualShare(gl({ partnerPaysIn: null })), null);
  assert.equal(actualShare(gl({ partnerPaysIn: undefined })), null);
  assert.equal(actualShare(gl({ partnerPaysIn: 900, sharedNow: 0 })), null);
});

test('while you both work, her real share replaces pro rata', () => {
  const g = gl({ partnerPaysIn: 900 });
  const tp = twoPersonCost(2026, sc(), g, 5000 * 12, 0, false);
  near(tp.share, 0.375); assert.equal(tp.shareReal, true);
  near(tp.contrib, 900 * 12);
  near(tp.samCost, (1200 + 2400 - 900) * 12);                       // 2,700/mo
  // empty: pro rata 1800 / (1800 + 5000), as before
  const pr = twoPersonCost(2026, sc(), gl(), 5000 * 12, 0, false);
  near(pr.share, 1800 / 6800); assert.equal(pr.shareReal, false);
});

test('once either of you stops, pro rata takes over again', () => {
  const g = gl({ partnerPaysIn: 900 });
  // you retired: pro rata on your pension + draw
  const ret = twoPersonCost(2040, sc(), g, 3000 * 12, 0, true);
  assert.equal(ret.shareReal, false);
  near(ret.share, partnerShare(ret.her.total, 3000 * 12));
  // she stopped first (her retirement age 36: from 2027 on, no salary, no pension yet)
  const g2 = gl({ partnerPaysIn: 900, partnerRetAge: 36 });
  const herOff = twoPersonCost(2027, sc(), g2, 5000 * 12, 0, false);
  assert.equal(herOff.shareReal, false);
  assert.equal(herOff.share, 0);
});

test('yearly items are shared costs, split by her share, now and in retirement', () => {
  const g = gl({ partnerPaysIn: 900, yearlyItems: 1200 });
  const tp = twoPersonCost(2026, sc(), g, 5000 * 12, 0, false);
  near(tp.shared, (2400 + 100) * 12);                               // 30,000/yr
  near(tp.contrib, 0.375 * 30000);                                  // 11,250
  near(tp.samCost, 1200 * 12 + 30000 - 11250);                      // 33,150 = 2,762.50/mo
  const r = twoPersonCost(2040, sc(), g, 3000 * 12, 0, true);
  near(r.sharedBase, (2200 * 12 + 1200));                           // retirement joint + yearly
});

test('year one of the projection invests exactly take-home − your cost', () => {
  const g = gl({ partnerPaysIn: 900, yearlyItems: 1200 });
  const p = project(sc(), g);
  // flat economy: the portfolio grows only by what you put in
  near(p.values[1] - p.values[0], (5000 - 2762.5) * 12, 0.5);       // 26,850
  const n = investNowMonthly(g, 5000);
  near(n.invest, 2237.5); near(n.cost, 2762.5); near(n.contrib, 937.5); assert.equal(n.shareReal, true);
});

test('empty fields change nothing (pre-v8.7 payloads)', () => {
  const a = project(sc(), gl());
  const b = project(sc(), gl({ partnerPaysIn: null, yearlyItems: 0 }));
  assert.deepEqual(b.values, a.values);
  assert.equal(b.fireTarget, a.fireTarget);
});

test('"if alone" default: 70% of joint account + yearly items / 12', () => {
  assert.equal(soloSharedFrom(null, 2400, 1200), 1750);             // (2,400 + 100) × 0.7
  assert.equal(soloSharedFrom(null, 2400), 1680);
  assert.equal(soloSharedFrom(1500, 2400, 1200), 1500);             // entered wins
});

test('refreshedText: date line, red after six months', () => {
  const today = new Date('2026-11-20T12:00:00Z');
  assert.deepEqual(refreshedText('2026-11-14', today), { text: 'last: 14 Nov 2026', stale: false });
  assert.deepEqual(refreshedText('2026-05-01', today), { text: 'last: 1 May 2026', stale: true });
  assert.deepEqual(refreshedText('', today), { text: '', stale: false });
});

test('v8.8: her real share holds only while your pay is today\'s (pay change or parental leave → pro rata)', () => {
  const g = gl({ partnerPaysIn: 900, childBirthYear: 2027, childMaternityMonths: 12, childMaternityIncome: 2000 });
  // pay change from 2028 to 1,800/mo: pro rata 1,800 / (1,800 + 1,800) = 50%
  const s = sc({ retAge: 60, payChanges: [{ from: 2028, to: null, amt: 1800 }] });
  const p = project(s, g);
  near(p.rows[p.years.indexOf(2027)].partnerShare, 0.375);          // today's pay: real share
  near(p.rows[p.years.indexOf(2028)].partnerShare, 0.5);            // pay changed: pro rata
  // parental leave in 2027 (your income 2,000 for 12 months): pro rata 1,800 / 3,800
  const k = project(sc({ retAge: 60, hasChild: true }), g);
  near(k.rows[k.years.indexOf(2027)].partnerShare, 1800 / 3800);
  near(k.rows[k.years.indexOf(2028)].partnerShare, 0.375);          // back to work: real share
});
