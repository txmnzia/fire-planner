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
  spend: { key: 'spend', field: 'spendNow_disp', blocking: true,
    text: 'Monthly spending is empty, so scenarios count no spending. Fill it in Income & spending.' },
  twoSpend: { key: 'twoSpend', field: 'samPersonalNow_disp', blocking: true,
    text: 'The two-person model is on, but your personal and shared spending are empty, so scenarios with your partner count no spending. Fill them in the Partner section.' },
  solo: { key: 'solo', field: 'soloShared_disp', blocking: true,
    text: 'Housing & shared costs if alone is empty while your personal spending is set, so scenarios without your partner count no rent or shared costs.' },
};

// Issues for one scenario.
// Simple model: spending must be entered.
// Two-person model, partner on: your personal or shared spending must be entered.
// Two-person model, partner off: priced by soloSpend() in js/engine.js, i.e. your
//   personal + housing if alone, or the Simple spending fields when neither of the
//   two-person solo fields was entered. Flag a half-entered pair, or nothing at all.
export function scenarioIssues(sc, gl) {
  if (gl.partnerModel !== 'two') return spendEmpty(gl) ? [ISSUES.spend] : [];
  if (sc.hasPartner) return (!(gl.samPersonalNow > 0) && !(gl.sharedNow > 0)) ? [ISSUES.twoSpend] : [];
  const entered = gl.samPersonalNow > 0 || gl.samPersonalRet > 0 || gl.soloShared > 0;
  if (entered) return gl.soloShared > 0 ? [] : [ISSUES.solo];
  return spendEmpty(gl) ? [ISSUES.spend] : [];
}

// Every distinct issue across the scenarios, for the banner.
export function allIssues(scenarios, gl) {
  const seen = new Map();
  for (const sc of scenarios) for (const i of scenarioIssues(sc, gl)) if (!seen.has(i.key)) seen.set(i.key, i);
  return [...seen.values()];
}
