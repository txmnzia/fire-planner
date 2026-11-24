// v8.12: her parental leave in the birth year moves the split. Made-up numbers, flat economy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerIncomeAt, twoPersonCost, project } from '../js/engine.js';
import { plansSetUp } from '../js/checks.js';

const gl = (over = {}) => ({
  currentAge: 35, lifeExp: 90, baseYear: 2026, inflation: 0, gainFrac: 0, stockRet: 0, bondRet: 0,
  stockAlloc: 1, bondAllocRet: 0, taxRate: 0.3, pensionAmt: 0, pensionAge: 67, cash: 0, cashReturn: 0,
  windfalls: [], wdMode: 'swr', swr: 0.04, invested: 100000, spendNow: 0, spendRet: 0,
  partnerInc: 1800, partnerRetAge: 65, partnerPension: 0, partnerPensionAge: 67, partnerAgeOff: 0,
  partnerModel: 'two', samPersonalNow: 1000, samPersonalRet: 1000, sharedNow: 2400, sharedRet: 2400,
  soloShared: 1680, partnerPaysIn: 900, yearlyItems: 0,
  propBuyYear: 2040, propPrice: 0, propDownPct: 0.2, propTxCostPct: 0.08, propMortgageRate: 0.03, propMortgageTerm: 25, propRentSaved: 0,
  childBirthYear: 2028, childCostYearly: 6000, childCostUntilAge: 20, childMaternityMonths: 0, childMaternityIncome: 0,
  partnerLeaveMonths: 6, partnerLeaveIncome: 1200, ...over });
const sc = (over = {}) => ({ id: 1, retAge: 60, income: 5000, chgYear: null, chgInc: null, hasPartner: true, hasProp: false, hasChild: true, ...over });

test('her salary in the birth year: leave months at leave pay, the rest at her take-home', () => {
  const her = partnerIncomeAt(2028, gl(), 0, sc());
  assert.equal(her.salary, 1800 * 6 + 1200 * 6);   // 18,000
  assert.equal(her.onLeave, true);
  assert.equal(partnerIncomeAt(2029, gl(), 0, sc()).salary, 1800 * 12);
  assert.equal(partnerIncomeAt(2028, gl(), 0, sc({ hasChild: false })).salary, 1800 * 12);   // not in this scenario
  assert.equal(partnerIncomeAt(2028, gl()).salary, 1800 * 12);                              // callers without a scenario
});

test('her leave year uses the income ratio, not today\'s real share', () => {
  // 2028: her 18,000 vs your 60,000 → 23.08%; other years: what she pays in, 900/2,400 = 37.5%
  const c = twoPersonCost(2028, sc(), gl(), 60000, 0, false);
  assert.ok(Math.abs(c.share - 18000 / 78000) < 1e-12);
  assert.equal(c.shareReal, false);
  assert.equal(twoPersonCost(2029, sc(), gl(), 60000, 0, false).share, 0.375);
  const p = project(sc(), gl());
  assert.ok(Math.abs(p.rows[p.years.indexOf(2028)].partnerShare - 18000 / 78000) < 1e-12);
});

test('a child plan with only her leave entered counts as set up', () => {
  assert.equal(plansSetUp(gl({ childCostYearly: 0, childMaternityMonths: 0, partnerLeaveMonths: 2 })).child, true);
  assert.equal(plansSetUp(gl({ childCostYearly: 0, childMaternityMonths: 0, partnerLeaveMonths: 0 })).child, false);
});
