// Year-end rollover (v8.15, pure). Closing a year writes its net-worth row and
// moves "today" one year on. Every amount typed in today's money that was not
// refreshed during the closing year is raised by inflation, so none silently
// loses a year of inflation; amounts refreshed that year stay as typed.

// Money fields in today's €: id, label, which check-in stamp refreshes it (if
// any), and whether it is raised by default (pay is not: a raise is typed).
export const TODAY_MONEY = [
  { id: 'samPersonalNow', label: 'Your own spending', stamp: 'spendUpdated' },
  { id: 'samPaysIn', label: 'You pay into joint', stamp: 'spendUpdated' },
  { id: 'partnerPaysIn', label: 'She pays in', stamp: 'spendUpdated' },
  { id: 'yearlyItems', label: 'Yearly items', stamp: 'spendUpdated' },
  { id: 'pensionAmt', label: 'German pension', stamp: 'pensionUpdated' },
  { id: 'pension2Amt', label: 'French pension', stamp: 'pensionUpdated' },
  { id: 'propRentSaved', label: 'Rent today' },
  { id: 'partnerPension', label: 'Her pension' },
  { id: 'childCostYearly', label: 'Child cost per year' },
  { id: 'childMaternityIncome', label: 'Your leave pay' },
  { id: 'partnerLeaveIncome', label: 'Her leave pay' },
  { id: 'propCharges', label: 'Ownership charges' },
  { id: 'propPrice', label: 'Purchase price' },
  { id: 'baseIncome', label: 'Your take-home', pay: true },
  { id: 'partnerInc', label: 'Her take-home', pay: true },
];

// fields: the saved field values (strings); closingYear: the year being closed;
// inflation: decimal. Returns the proposed changes [{id, label, from, to, checked}].
// more: pensions from other countries (v8.19), [{country, amt}] → ids 'pm:<index>'.
export function yearEndChanges(fields, closingYear, inflation, more) {
  const refreshed = stamp => stamp && /^\d{4}-/.test(fields[stamp] || '') && +fields[stamp].slice(0, 4) >= closingYear;
  const pm = (more || []).map((p, i) => ({ p, i })).filter(({ p }) => p.amt > 0).map(({ p, i }) => {
    const r = refreshed('pensionUpdated');
    return { id: 'pm:' + i, label: 'Pension (' + p.country + ')', from: +p.amt, to: Math.round(p.amt * (1 + inflation)), checked: !r,
             why: r ? 'refreshed in ' + closingYear : 'not refreshed in ' + closingYear };
  });
  return [...TODAY_MONEY
    .filter(f => fields[f.id] !== undefined && fields[f.id] !== '' && +fields[f.id] > 0)
    .map(f => {
      const from = +fields[f.id];
      return { id: f.id, label: f.label, from, to: Math.round(from * (1 + inflation)),
               checked: !f.pay && !refreshed(f.stamp),
               why: f.pay ? 'pay: type a raise instead' : refreshed(f.stamp) ? 'refreshed in ' + closingYear : 'not refreshed in ' + closingYear };
    }), ...pm];
}

// The history row written for the closed year: net worth at the start of the new
// year (= closing net worth). Replaces a row for that year if there is one.
export function closeYearHistory(history, closingYear, closingNetWorth) {
  const year = closingYear + 1;
  const rows = (history || []).filter(r => +r.year !== year);
  return [...rows, { year, val: Math.round(closingNetWorth), income: null, spend: null }].sort((a, b) => a.year - b.year);
}
