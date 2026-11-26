// Golden-master cases for v8 (made-up numbers only). Shared by the golden test and
// its one-off generator, so the cases can never drift from the stored fixture.
// Not a test file itself (no `.test.` in the name), so `node --test` skips it.

export function baseGl(over = {}) {
  return {
    currentAge: 35, lifeExp: 90, baseYear: 2026,
    spendNow: 3000, spendRet: 2400, inflation: 0.02,
    gainFrac: 0.25, stockRet: 0.07, bondRet: 0.03,
    stockAlloc: 1, bondAllocRet: 0.4, taxRate: 0.30,
    pensionAmt: 700, pensionAge: 67, cash: 10000, cashReturn: 0.01,
    windfalls: [{ yr: 2031, amt: 40000 }], wdMode: 'swr', swr: 0.04,
    invested: 150000,
    partnerInc: 1800, partnerRetAge: 65, partnerPension: 500, partnerPensionAge: 67,
    partnerSpendMult: 1.5, partnerAgeOff: 2,
    propBuyYear: 2032, propPrice: 300000, propDownPct: 0.2, propTxCostPct: 0.08,
    propMortgageRate: 0.035, propMortgageTerm: 25, propRentSaved: 1000,
    childBirthYear: 2034, childCostYearly: 9000, childCostUntilAge: 22,
    childMaternityMonths: 6, childMaternityIncome: 2000,
    partnerModel: 'simple', samPersonalNow: 1200, samPersonalRet: 1100,
    sharedNow: 2400, sharedRet: 2200, soloShared: 1500, partnerPersonal: 700,
    partnerPortfolio: 30000, partnerGainFrac: 0.1, shareMin: 0, shareMax: 0.5,
    ...over,
  };
}
export function baseSc(over = {}) {
  return { id: 1, retAge: 45, income: 5000, chgYear: null, chgInc: null,
           hasPartner: false, hasProp: false, hasChild: false, ...over };
}

// 2 withdrawal modes × 2 partner models × 8 feature combos × 3 stop ages
// × 2 pay patterns = 192 cases.
export function goldenCases() {
  const cases = [];
  for (const wdMode of ['swr', 'fixed'])
    for (const partnerModel of ['two'])   // v8.23: one model (the Simple model's 96 cases are gone)
      for (let f = 0; f < 8; f++)
        for (const retAge of [40, 50, 60])
          for (const pay of ['flat', 'change']) {
            const gl = baseGl({ wdMode, partnerModel });
            const sc = baseSc({ retAge, hasPartner: !!(f & 1), hasProp: !!(f & 2), hasChild: !!(f & 4),
              ...(pay === 'change' ? { chgYear: 2030, chgInc: 3800 } : {}) });
            cases.push({ name: [wdMode, partnerModel, 'f' + f, 'r' + retAge, pay].join('/'), gl, sc });
          }
  return cases;
}
