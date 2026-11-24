import { el, eur, numVal } from "./util.js?v=8.18.4";
import { state } from "./state.js?v=8.18.4";
import { getGlobals, getScenario } from "./inputs.js?v=8.18.4";
import { renderScenarioGrid, renderSummaryTiles, withStopAges } from "./ui/cards.js?v=8.18.4";
import { buildChart, buildFlowChart } from "./ui/charts.js?v=8.18.4";
import { renderTable } from "./ui/table.js?v=8.18.4";
import { renderExplanation } from "./ui/explanation.js?v=8.18.4";
import { updateLabels } from "./ui/controls.js?v=8.18.4";
import { markMcStale } from "./ui/mcTab.js?v=8.18.4";
import { scheduleSave } from "./sync.js?v=8.18.4";
import { renderIssues } from "./ui/issues.js?v=8.18.4";
import { renderPlans } from "./ui/plans.js?v=8.18.4";
import { renderSpendReadout } from "./ui/spending.js?v=8.18.4";
import { renderAssumptions } from "./ui/situation.js?v=8.18.4";
import { renderCheckin } from "./ui/ibkr.js?v=8.18.4";
import { renderResNotes, renderPropReadout } from "./ui/housing.js?v=8.18.4";
import { renderUpdatePanel } from "./ui/versions.js?v=8.18.4";
import { renderTiles } from "./ui/tiles.js?v=8.18.4";

// ── RECALC ──────────────────────────────────────────────────────────────────
export function recalc() {
  const gl=getGlobals();
  const port=state.ibkrTotal+gl.cash;
  el("totalPortfolio").textContent=eur(port);
  el("totalPill").textContent=eur(port);
  el("calcTime").textContent=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  renderSpendReadout(gl);
  renderAssumptions();
  renderCheckin();
  renderResNotes();
  renderPropReadout(gl);
  // Each scenario stops at its earliest funded age (v8.1); every tab uses these.
  const stops=withStopAges([1,2,3,4,5].map(s=>getScenario(s,gl)),gl);
  const scenarios=stops.map(x=>x.sc);
  const projs=stops.map(x=>x.proj);
  renderScenarioGrid(projs,gl,scenarios,stops);
  renderIssues(scenarios,gl);
  renderPlans(gl);
  state.lastProjs=projs; state.lastGl=gl; state.lastScenarios=scenarios; state.lastStops=stops;
  renderUpdatePanel(gl);
  renderTiles(gl);
  buildChart(projs,gl); buildFlowChart(projs,gl); renderTable(projs,gl);
  updateLabels();
  renderSummaryTiles(projs,gl,scenarios);
  renderExplanation(projs,gl,scenarios);
  // Monte Carlo results were computed for the previous inputs — flag them stale.
  markMcStale();
  scheduleSave();
}
