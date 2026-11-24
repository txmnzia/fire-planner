// Pension statements (v8.9, pure). Amounts are typed gross, exactly as printed.
// v8.19: the plan uses the NET amount, what lands in your account: gross minus the
// social charges that are certain to apply (below). Income tax is not deducted: it
// depends on the country you live in and the household (owner's decision).
export const PENSION_COUNTRIES = {
  DE: { name: 'German', legalAge: 67, deduction: 0.124,
        why: 'health insurance for pensioners 7.3% + half the average add-on (1.45%) + long-term care 3.6%' },
  FR: { name: 'French', legalAge: 64, deduction: 0.091,
        why: 'CSG 8.3% + CRDS 0.5% + CASA 0.3% (full rate, French tax resident)' },
};

// Net €/month the plan uses (unrounded): gross × (1 − deduction). The deduction is
// the country preset, or dedPct (% typed for a country without a preset); 0 when
// neither is known. Empty or negative gross → 0.
export function pensionNet(country, grossMonthly, dedPct) {
  if (!(grossMonthly > 0)) return 0;
  const preset = PENSION_COUNTRIES[country];
  const d = dedPct != null && dedPct !== '' && isFinite(+dedPct) ? Math.min(100, Math.max(0, +dedPct)) / 100 : preset ? preset.deduction : 0;
  return grossMonthly * (1 - d);
}

// Pensions from other countries (v8.19): [{country, amt (gross €/month), age, ded (% or null)}].
export function normalisePensionsMore(list) {
  return (Array.isArray(list) ? list : []).map(p => ({
    country: typeof p.country === 'string' ? p.country.slice(0, 3) : 'XX',
    amt: p.amt == null || p.amt === '' || isNaN(+p.amt) ? null : +p.amt,
    age: p.age == null || p.age === '' || isNaN(+p.age) ? 67 : Math.round(+p.age),
    ded: p.ded == null || p.ded === '' || isNaN(+p.ded) ? null : +p.ded,
  }));
}
// What the engine gets: [{amt: net €/month, age}], complete rows only.
export function pensionsMoreNet(list) {
  return normalisePensionsMore(list).filter(p => p.amt > 0).map(p => ({ amt: pensionNet(p.country, p.amt, p.ded), age: p.age }));
}

// ≈ net €/month after the charges above (income tax not included); 0 when empty. Rounded, for read-outs.
export function pensionNetEstimate(country, grossMonthly) {
  const c = PENSION_COUNTRIES[country];
  if (!c || !(grossMonthly > 0)) return 0;
  return Math.round(grossMonthly * (1 - c.deduction));
}
