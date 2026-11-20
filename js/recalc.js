import { el, eur, numVal } from "./util.js";
import { state } from "./state.js";
import { getGlobals, getScenario } from "./inputs.js";
import { project } from "./engine.js";
import { renderScenarioGrid, renderSummaryTiles } from "./ui/cards.js";
import { buildChart, buildFlowChart } from "./ui/charts.js";
import { renderTable } from "./ui/table.js";
import { renderExplanation } from "./ui/explanation.js";
import { updateLabels } from "./ui/controls.js";
import { markMcStale } from "./ui/mcTab.js";
import { scheduleSave } from "./sync.js";
import { renderIssues } from "./ui/issues.js";

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
  const scenarios=[1,2,3,4,5].map(s=>getScenario(s,gl));
  const projs=scenarios.map(sc=>project(sc,gl));
  renderScenarioGrid(projs,gl,scenarios);
  renderIssues(scenarios,gl);
  state.lastProjs=projs; state.lastGl=gl; state.lastScenarios=scenarios;
  buildChart(projs,gl); buildFlowChart(projs,gl); renderTable(projs,gl);
  updateLabels();
  renderSummaryTiles(projs,gl,scenarios);
  renderExplanation(projs,gl,scenarios);
  // Monte Carlo results were computed for the previous inputs — flag them stale.
  markMcStale();
  scheduleSave();
}
