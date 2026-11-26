// v8.27 — take-home from gross (Germany, France 2026) and pension rights per working
// year. Expectations computed by hand from the published parameters (README).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deIncomeTax, frIncomeTax, netPay, grossFromNet, hasNetCalc } from '../js/netPay.js';
import { accrualGrossMonthly, pensionNet } from '../js/pensions.js';
import { scGl, accruedPensions, grossPayAt, project, pensionMonthlyAt } from '../js/engine.js';
import { baseGl, baseSc } from './golden-cases.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('German income tax 2026 (§32a): zone edges and a 42% income', () => {
  assert.equal(deIncomeTax(12348), 0);
  assert.equal(deIncomeTax(17799), 1034);     // (914.51 × 0.5451 + 1,400) × 0.5451 = 1,034.88
  assert.equal(deIncomeTax(69879), 18213);    // 0.42 × 69,879 − 11,135.63
  assert.equal(deIncomeTax(100000), 30864);
  assert.equal(deIncomeTax(46644), 9389);     // z = 2.8845: (173.10 z + 2,397) z + 1,034.87
});

test('Germany, 60,000 gross, not married, no child: 3,130 €/month', () => {
  const r = netPay('DE', 60000, {});
  // social: (9.3 + 1.3)% × 60,000 + 8.75% × 60,000 + 2.4% × 60,000 = 13,050
  near(r.social, 13050);
  // taxable: 60,000 − 1,230 − 36 − (5,580 + 8.45% × 60,000 + 1,440) = 46,644 → 9,389; no solidarity surcharge
  near(r.tax, 9389);
  near(r.net, 60000 - 13050 - 9389);
  // with a child: care 1.8% instead of 2.4% (−360 social, taxable +360)
  assert.ok(netPay('DE', 60000, { child: true }).net > r.net);
});

test('Germany, married: equal pay gives the same tax as alone (splitting); unequal pay lowers it', () => {
  const single = netPay('DE', 60000, {}).net;
  near(netPay('DE', 60000, { joint: true, partnerNet: single }).net, single, 3);
  assert.ok(netPay('DE', 60000, { joint: true, partnerNet: 12000 }).tax < netPay('DE', 60000, {}).tax);
});

test('France, 60,000 gross, alone, no child: 6,405 € income tax', () => {
  const r = netPay('FR', 60000, {});
  // 6.90% × 48,060 + 0.40% × 60,000 + 3.15% × 48,060 + 8.64% × 11,940 + 0.86% × 48,060
  // + 1.08% × 11,940 + 0.14% × 60,000 + 9.7% × 98.25% × 60,000 = 12,446.07
  near(r.social, 12446.07, 0.05);
  // taxable = net 47,553.93 + 2.9% × 58,950 = 49,263.48, − 10% = 44,337.13
  // tax = 11% × (29,579 − 11,600) + 30% × (44,337.13 − 29,579) = 6,405.13
  near(r.tax, 6405.13, 0.05);
  near(r.net, 60000 - 12446.07 - 6405.13, 0.1);
});

test('France: family quotient capped at 1,807 € per half-part; décote for small tax', () => {
  near(frIncomeTax(44337.13, false, false), 6405.13, 0.05);
  // 1.5 parts gives 2,963.08, below 6,405.13 − 1,807: the cap binds
  near(frIncomeTax(44337.13, false, true), 6405.13 - 1807, 0.05);
  // 20,000 alone: 924 < 1,982 → − (897 − 45.25% × 924) = 445.11
  near(frIncomeTax(20000, false, false), 445.11, 0.01);
  // a couple with 2 parts: twice the tax of one at half the income
  near(frIncomeTax(88674.26, true, false), 2 * 6405.13, 0.1);
});

test('gross from take-home inverts the calculator; other countries have none', () => {
  for (const c of ['DE', 'FR']) for (const g of [30000, 60000, 110000])
    near(grossFromNet(c, netPay(c, g, {}).net, {}), g, 1);
  assert.equal(hasNetCalc('PT'), false);
  assert.equal(netPay('PT', 60000), null);
  assert.equal(grossFromNet('PT', 40000), null);
});

test('pension rights per year at 60,000 gross: Germany 49.11 €, France 76.32 € a month (gross)', () => {
  near(accrualGrossMonthly('DE', 60000), 60000 / 51944 * 42.52);               // 49.11
  near(accrualGrossMonthly('DE', 200000), 101400 / 51944 * 42.52);             // capped at the ceiling
  // basic 50% × 48,060 × 4/172 / 12 = 46.57; Agirc-Arrco (6.2% × 48,060 + 17% × 11,940) / 20.1877 × 1.4386 / 12 = 29.75
  near(accrualGrossMonthly('FR', 60000), 46.5698 + 29.7487, 0.01);
  assert.equal(accrualGrossMonthly('PT', 60000), 0);
});

const flat = over => baseGl({ stockRet: 0, bondRet: 0, inflation: 0, gainFrac: 0, taxRate: 0, cash: 0, cashReturn: 0,
  pensionAmt: 0, pension2Amt: 0, pension2Age: 64, windfalls: [], invested: 300000, samPersonalNow: 1500, samPersonalRet: 1500, soloShared: 500,
  residence: [{ from: null, country: 'DE', tax: 0, col: 1 }], ...over });

test('no gross pay today: no rights added (statements only), the overlay is unchanged', () => {
  const gl = flat(), sc = baseSc({ retAge: 45 });
  assert.equal(scGl(gl, sc), gl);
});

test('ten working years in Germany add 10 × 49.11 € gross, used net from the pension age', () => {
  const gl = flat({ grossNow: 60000 }), sc = baseSc({ retAge: 45 });   // works 2026..2035
  const a = accruedPensions(gl, sc);
  assert.equal(a.yDE, 10);
  near(a.deGross, 10 * 60000 / 51944 * 42.52);
  near(a.de, pensionNet('DE', 10 * 60000 / 51944 * 42.52));            // × (1 − 12.4%) = 430.24
  near(pensionMonthlyAt(scGl(gl, sc), 67), a.de);
  const p = project(sc, gl);
  near(p.rows.find(r => r.age === 67).pension, a.de * 12, 0.5);
  // stopping later earns more
  assert.ok(accruedPensions(gl, baseSc({ retAge: 50 })).de > a.de);
});

test('the country each year decides; a break earns nothing; a planned gross is used', () => {
  const gl = flat({ grossNow: 60000, residence: [{ from: null, country: 'DE', tax: 0, col: 1 }, { from: 2031, country: 'FR', tax: 0, col: 1 }] });
  const sc = baseSc({ retAge: 45, income: 3000, payChanges: [{ from: 2033, to: 2033, amt: 0, gross: null }, { from: 2034, to: null, amt: 2500, gross: 40000 }] });
  assert.equal(grossPayAt(gl, sc, 2032), 60000);
  assert.equal(grossPayAt(gl, sc, 2033), 0);
  assert.equal(grossPayAt(gl, sc, 2035), 40000);
  const a = accruedPensions(gl, sc);
  assert.equal(a.yDE, 5);      // 2026..2030
  assert.equal(a.yFR, 4);      // 2031, 2032, 2034, 2035 (2033 is a break)
  near(a.frGross, 2 * accrualGrossMonthly('FR', 60000) + 2 * accrualGrossMonthly('FR', 40000));
  near(scGl(gl, sc).pension2Amt, pensionNet('FR', a.frGross));
  // a change without a gross scales today's gross by its take-home
  assert.equal(grossPayAt(gl, { ...sc, payChanges: [{ from: 2030, to: null, amt: 1500 }] }, 2031), 30000);
});

test('the overlay follows the stop age (the search tries several on copies)', () => {
  const gl = flat({ grossNow: 60000 }), sc = baseSc({ retAge: 45 });
  const g45 = scGl(gl, sc);
  assert.equal(scGl(g45, sc), g45);                      // same scenario, same age: reused
  const g50 = scGl(g45, { ...sc, retAge: 50 });          // built from the base, not stacked
  near(g50.pensionAmt, accruedPensions(gl, { ...sc, retAge: 50 }).de);
});
