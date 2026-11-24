// Pension statements (v8.9, pure). Amounts are typed gross, exactly as printed;
// the engine uses them as entered (README: pensions are not taxed in the model).
// The net estimate is a read-out only: social charges that are certain to apply,
// income tax excluded because it depends on the country you live in and the household.
export const PENSION_COUNTRIES = {
  DE: { name: 'German', legalAge: 67, deduction: 0.124,
        why: 'health insurance for pensioners 7.3% + half the average add-on (1.45%) + long-term care 3.6%' },
  FR: { name: 'French', legalAge: 64, deduction: 0.091,
        why: 'CSG 8.3% + CRDS 0.5% + CASA 0.3% (full rate, French tax resident)' },
};

// ≈ net €/month after the charges above (income tax not included); 0 when empty.
export function pensionNetEstimate(country, grossMonthly) {
  const c = PENSION_COUNTRIES[country];
  if (!c || !(grossMonthly > 0)) return 0;
  return Math.round(grossMonthly * (1 - c.deduction));
}
