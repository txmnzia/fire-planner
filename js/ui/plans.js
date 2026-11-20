// Plans tab (v8.3): which plans are set up, shown on the plan cards and in the
// scenario grid (a plan that is not set up has no switch there). The rule itself
// lives in js/checks.js (plansSetUp), which also gates the calculation.
import { el, eur, fmtK } from "../util.js?v=8.5";
import { state } from "../state.js?v=8.5";
import { recalc } from "../recalc.js?v=8.5";
import { plansSetUp } from "../checks.js?v=8.5";

const NAMES = { prop: "Buying a home", child: "Child" };

// Windfalls (v8.4): each complete windfall is a plan with a switch per scenario.
// w.off lists the scenarios (1-5) it is switched off for; absent = on everywhere.
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];
export function windfallSwitches(windfalls) {
  return (windfalls || []).map((w, i) => ({ w, i }))
    .filter(({ w }) => Number.isFinite(+w.yr) && w.yr != null && +w.amt > 0)
    .map(({ w, i }) => ({ index: i, label: fmtK(+w.amt) + ' in ' + w.yr,
      on: [1, 2, 3, 4, 5].map(s => !(Array.isArray(w.off) && w.off.includes(s))) }));
}
export function flipWindfall(windfalls, index, s) {
  const w = windfalls[index]; if (!w) return;
  const off = Array.isArray(w.off) ? w.off.filter(x => x !== s) : [];
  if (!(Array.isArray(w.off) && w.off.includes(s))) off.push(s);
  w.off = off.sort();
}
export function toggleWindfall(index, s) { flipWindfall(state.windfalls, index, s); recalc(); }

function renderWindfallRows() {
  const host = el("scgWindfallRows"); if (!host) return;
  host.replaceChildren();
  for (const r of windfallSwitches(state.windfalls)) {
    const row = document.createElement("div");
    row.className = "scg-row scg-r-plan"; row.setAttribute("role", "row");
    const lbl = document.createElement("div"); lbl.className = "scg-lbl"; lbl.setAttribute("role", "rowheader");
    lbl.textContent = "\u{1F4B0} Windfall " + r.label;
    row.append(lbl);
    r.on.forEach((on, k) => {
      const cell = document.createElement("div"); cell.className = "scg-cell c" + (k + 1); cell.setAttribute("role", "cell");
      const b = document.createElement("button"); b.type = "button"; b.className = "scg-tog";
      b.setAttribute("aria-label", "Scenario " + LETTERS[k] + ": windfall " + r.label);
      b.setAttribute("aria-pressed", String(on));
      const sw = document.createElement("span"); sw.className = "tog-sw" + (on ? " on-wf" : "");
      b.append(sw); b.addEventListener("click", () => toggleWindfall(r.index, k + 1));
      const pills = document.createElement("span"); pills.className = "scg-pills"; pills.setAttribute("aria-hidden", "true");
      cell.append(b, pills); row.append(cell);
    });
    host.append(row);
  }
}

export function renderPlans(gl) {
  renderWindfallRows();
  const wfb = el("planState_wf");
  if (wfb) { const n = windfallSwitches(state.windfalls).length; wfb.textContent = n ? "\u00b7 " + n + " set up" : "\u00b7 none yet"; wfb.classList.toggle("off", !n); }
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
  const rs = el("planRentStops");
  if (rs) rs.textContent = gl.propRentSaved > 0 ? eur(gl.propRentSaved) + "/mo \u00b7 your rent today" : "\u2014 enter your rent today on My Situation";
  const st = el("plansStatus");
  if (st) st.textContent = Object.values(up).filter(Boolean).length + " of " + Object.keys(NAMES).length + " set up";
}
