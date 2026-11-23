// Input completeness checks (pure: plain gl/sc in, plain data out; no DOM).
// A missing input that silently becomes 0 produces a confident wrong number,
// which is worse than no number (CLAUDE.md). These checks name the gap so the
// UI can show "missing" instead of a result.
//
// issue = { key, field, text, blocking }
//   field    the visible input to fix (the *_disp text field when there is one)
//   blocking true → the scenario's FIRE number and funded verdict are meaningless

const ISSUES = {
  rentNow: { key: 'rentNow', field: 'propRentSaved_disp', blocking: false,
    text: 'A scenario buys a home but your rent today is empty, so the mortgage is added on top of a rent that never stops. Fill "Rent today" in Income & spending.' },
  twoSpend: { key: 'twoSpend', field: 'samPersonalNow_disp', blocking: true,
    text: 'Your spending is empty (your own spending and the joint account), so scenarios with your partner count no spending. Fill the four numbers under Income & spending.' },
  soloPersonal: { key: 'soloPersonal', field: 'samPersonalNow_disp', blocking: true,
    text: 'Scenarios without your partner use your own spending + your costs if alone, and your own spending is empty. Fill it under Income & spending.' },
  soloHousing: { key: 'soloHousing', field: 'samPaysIn_disp', blocking: true,
    text: 'Scenarios without your partner use your own spending + your costs if alone (70% of the joint account plus yearly items), and the joint account is empty. Fill what you and she pay in under Income & spending.' },
};

// Issues for one scenario (v8.8, one partner model).
// Partner on: your own spending or the joint account must be entered.
// Partner off: priced by soloSpend() in js/engine.js = your own spending + costs
//   if alone (70% of joint + yearly, derived in js/inputs.js); both must be > 0.
export function scenarioIssues(sc, gl) {
  const out = spendingIssues(sc, gl);
  // Buying without today's rent: the mortgage is added on top of a rent that
  // never stops. Cautious, so the numbers still show; the banner names it.
  if (sc.hasProp && !(gl.propRentSaved > 0)) out.push(ISSUES.rentNow);
  return out;
}

function spendingIssues(sc, gl) {
  if (sc.hasPartner) return (!(gl.samPersonalNow > 0) && !(gl.sharedNow > 0)) ? [ISSUES.twoSpend] : [];
  const out = [];
  if (!(gl.samPersonalNow > 0) && !(gl.samPersonalRet > 0)) out.push(ISSUES.soloPersonal);
  if (!(gl.soloShared > 0)) out.push(ISSUES.soloHousing);
  return out;
}

// Plans (v8.3): a plan is "set up" once something that changes the numbers is
// entered. A plan that is not set up gets no switch in the scenario grid, and
// its switch is ignored by the calculation (getScenario), so a stale switch can
// never apply half a plan (e.g. rent saved without a purchase).
export function plansSetUp(gl) {
  return {
    prop:  gl.propPrice > 0,
    child: gl.childCostYearly > 0 || gl.childMaternityMonths > 0,
  };
}
export function effectiveFeatures(feat, gl) {
  const up = plansSetUp(gl);
  return { partner: !!feat.partner, prop: !!feat.prop && up.prop, child: !!feat.child && up.child };
}

// Every distinct issue across the scenarios, for the banner.
export function allIssues(scenarios, gl) {
  const seen = new Map();
  for (const sc of scenarios) for (const i of scenarioIssues(sc, gl)) if (!seen.has(i.key)) seen.set(i.key, i);
  return [...seen.values()];
}
