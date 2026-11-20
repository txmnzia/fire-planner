// Input completeness checks (pure: plain gl/sc in, plain data out; no DOM).
// A missing input that silently becomes 0 produces a confident wrong number,
// which is worse than no number (CLAUDE.md). These checks name the gap so the
// UI can show "missing" instead of a result.
//
// issue = { key, field, text, blocking }
//   field    the visible input to fix (the *_disp text field when there is one)
//   blocking true → the scenario's FIRE number and funded verdict are meaningless

const spendEmpty = gl => !(gl.spendNow > 0) && !(gl.spendRet > 0);

const ISSUES = {
  rentNow: { key: 'rentNow', field: 'propRentSaved_disp', blocking: false,
    text: 'A scenario buys a home but your rent today is empty, so the mortgage is added on top of a rent that never stops. Fill "Rent today" in Income & spending.' },
  spend: { key: 'spend', field: 'spendNow_disp', blocking: true,
    text: 'Monthly spending is empty, so scenarios count no spending. Fill it in Income & spending.' },
  twoSpend: { key: 'twoSpend', field: 'samPersonalNow_disp', blocking: true,
    text: 'The two-person model is on, but your personal and shared spending are empty, so scenarios with your partner count no spending. Fill them in the Partner section.' },
  soloPersonal: { key: 'soloPersonal', field: 'samPersonalNow_disp', blocking: true,
    text: 'Scenarios without your partner use your personal spending + your housing & living costs if alone, and your personal spending is empty. Fill it in the Partner section.' },
  soloHousing: { key: 'soloHousing', field: 'sharedNow_disp', blocking: true,
    text: 'Scenarios without your partner use your personal spending + your housing & living costs if alone, which default to 70% of shared costs, and shared costs are empty. Fill shared costs (or the "if alone" amount) in the Partner section.' },
};

// Issues for one scenario.
// Simple model: spending must be entered.
// Two-person model, partner on: your personal or shared spending must be entered.
// Two-person model, partner off: priced by soloSpend() in js/engine.js = your
//   personal spending + housing & living costs if alone (empty = 70% of shared
//   costs, derived in js/inputs.js before gl reaches here); both must be > 0.
export function scenarioIssues(sc, gl) {
  const out = spendingIssues(sc, gl);
  // Buying without today's rent: the mortgage is added on top of a rent that
  // never stops. Cautious, so the numbers still show; the banner names it.
  if (sc.hasProp && !(gl.propRentSaved > 0)) out.push(ISSUES.rentNow);
  return out;
}

function spendingIssues(sc, gl) {
  if (gl.partnerModel !== 'two') return spendEmpty(gl) ? [ISSUES.spend] : [];
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
