// Plans tab (v8.3): which plans are set up, shown on the plan cards and in the
// scenario grid (a plan that is not set up has no switch there). The rule itself
// lives in js/checks.js (plansSetUp), which also gates the calculation.
import { el } from "../util.js?v=8.3";
import { plansSetUp } from "../checks.js?v=8.3";

const NAMES = { prop: "Buying a home", child: "Child" };

export function renderPlans(gl) {
  const up = plansSetUp(gl);
  const hidden = [];
  for (const k of Object.keys(NAMES)) {
    const badge = el("planState_" + k);
    if (badge) {
      badge.textContent = up[k] ? "· set up" : "· not set up, no switch in Scenarios";
      badge.classList.toggle("off", !up[k]);
    }
    const row = el("scgRow_" + k); if (row) row.hidden = !up[k];
    if (!up[k]) hidden.push(NAMES[k]);
  }
  const note = el("scgHiddenPlans");
  if (note) note.textContent = hidden.length ? "· not set up in Plans, so hidden: " + hidden.join(", ") : "";
  const st = el("plansStatus");
  if (st) st.textContent = Object.values(up).filter(Boolean).length + " of " + Object.keys(NAMES).length + " set up";
}
