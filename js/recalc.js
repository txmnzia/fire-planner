import { el, eur, numVal } from "./util.js?v=8.5";
import { state } from "./state.js?v=8.5";
import { getGlobals, getScenario } from "./inputs.js?v=8.5";
import { renderScenarioGrid, renderSummaryTiles, withStopAges } from "./ui/cards.js?v=8.5";
import { buildChart, buildFlowChart } from "./ui/charts.js?v=8.5";
import { renderTable } from "./ui/table.js?v=8.5";
import { renderExplanation } from "./ui/explanation.js?v=8.5";
import { updateLabels } from "./ui/controls.js?v=8.5";
import { markMcStale } from "./ui/mcTab.js?v=8.5";
import { scheduleSave } from "./sync.js?v=8.5";
import { renderIssues } from "./ui/issues.js?v=8.5";
import { renderPlans } from "./ui/plans.js?v=8.5";

// ── RECALC ──────────────────────────────────────────────────────────────────
export function updateMultPreview() {
  const now=numVal("spendNow",0), ret=numVal("spendRet",0), mult=numVal("partnerSpendMult",1.5);
  const pn=el("multPreviewNow");
  if(pn) pn.textContent='€'+Math.round(now*mult).toLocaleString();
}

export function recalc() {
  const gl=getGlobals();
  updateMultPreview();
  const port=state.ibkrTotal+gl.cash;
  el("totalPortfolio").textContent=eur(port);
  el("totalPill").textContent=eur(port);
  el("calcTime").textContent=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  // "If alone" costs left empty are 70% of shared costs: show the value used.
  const sd=el("soloShared_disp");
  if(sd) sd.placeholder = gl.soloSharedDerived && gl.soloShared>0 ? "\u2248 "+gl.soloShared.toLocaleString("fr-FR")+" (70% of shared)" : "";
  // Each scenario stops at its earliest funded age (v8.1); every tab uses these.
  const stops=withStopAges([1,2,3,4,5].map(s=>getScenario(s,gl)),gl);
  const scenarios=stops.map(x=>x.sc);
  const projs=stops.map(x=>x.proj);
  renderScenarioGrid(projs,gl,scenarios,stops);
  renderIssues(scenarios,gl);
  renderPlans(gl);
  state.lastProjs=projs; state.lastGl=gl; state.lastScenarios=scenarios;
  buildChart(projs,gl); buildFlowChart(projs,gl); renderTable(projs,gl);
  updateLabels();
  renderSummaryTiles(projs,gl,scenarios);
  renderExplanation(projs,gl,scenarios);
  // Monte Carlo results were computed for the previous inputs — flag them stale.
  markMcStale();
  scheduleSave();
}
