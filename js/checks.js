// Input completeness checks (pure: plain gl/sc in, plain data out; no DOM).
// A missing input that silently becomes 0 produces a confident wrong number,
// which is worse than no number (CLAUDE.md). These checks name the gap so the
// UI can show "missing" instead of a result.
//
// issue = { key, field, text, blocking }
//   field    the visible input to fix (the *_disp text field when there is one)
//   blocking true → the scenario's FIRE number and funded verdict are meaningless

export function globalIssues(gl) {
  const out = [];
  if (gl.partnerModel === 'two') {
    if (!(gl.samPersonalNow > 0) && !(gl.sharedNow > 0))
      out.push({ key: 'twoSpend', field: 'samPersonalNow_disp', blocking: true,
        text: 'The two-person model is on, but your personal and shared spending are empty, so every scenario counts no spending. Fill them in the Partner section, or switch the partner model back to Simple.' });
  } else if (!(gl.spendNow > 0) && !(gl.spendRet > 0)) {
    out.push({ key: 'spend', field: 'spendNow_disp', blocking: true,
      text: 'Monthly spending is empty, so every scenario counts no spending. Fill it in Income & spending.' });
  }
  return out;
}

// Issues that apply to one scenario: the global ones, plus the solo-housing gap
// for a two-person scenario that leaves the partner out.
export function scenarioIssues(sc, gl) {
  const out = globalIssues(gl);
  if (gl.partnerModel === 'two' && !sc.hasPartner && !(gl.soloShared > 0))
    out.push({ key: 'solo', field: 'soloShared_disp', blocking: true,
      text: 'Housing & shared costs if alone is empty, so scenarios without your partner count no rent or shared costs.' });
  return out;
}

// Every distinct issue across the scenarios, for the banner.
export function allIssues(scenarios, gl) {
  const seen = new Map();
  for (const sc of scenarios) for (const i of scenarioIssues(sc, gl)) if (!seen.has(i.key)) seen.set(i.key, i);
  return [...seen.values()];
}
