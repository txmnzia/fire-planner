import { el, numVal } from "../util.js";
import { state, features } from "../state.js";
import { getScenarioName } from "../inputs.js";
import { recalc } from "../recalc.js";
import { FIRE_LINE, buildChart, buildFlowChart, resizeResultsCharts } from "./charts.js";
import { renderTable } from "./table.js";
import { renderSummaryTiles } from "./cards.js";
import { resizeMcCharts } from "./mcTab.js";

// ── TAB SWITCHING ──────────────────────────────────────────────────────────
export function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    const a = b.dataset.tab === name;
    b.classList.toggle("active", a);
    b.setAttribute("aria-selected", a);
  });
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id==="tab-panel-"+name));
  if (name==="results") setTimeout(resizeResultsCharts, 50);
  if (name==="montecarlo") setTimeout(resizeMcCharts, 50);
}

// ── FEATURE TOGGLES ────────────────────────────────────────────────────────
export function toggleFeature(s, feat) {
  features[s][feat] = !features[s][feat];
  updateToggleUI();
  recalc();
}

export function updateToggleUI() {
  for (let s = 1; s <= 5; s++) {
    const sw_p  = el("tog"+s+"_partner");
    const sw_pr = el("tog"+s+"_prop");
    const sw_c  = el("tog"+s+"_child");
    if (sw_p)  { sw_p.className  = "tog-sw" + (features[s].partner ? " on-p"    : ""); }
    if (sw_pr) { sw_pr.className = "tog-sw" + (features[s].prop    ? " on-prop" : ""); }
    if (sw_c)  { sw_c.className  = "tog-sw" + (features[s].child   ? " on-child": ""); }
  }
  // Mirror the same feature state onto the Situation-tab life-event chips.
  document.querySelectorAll('.sc-chip[data-scenario][data-feat]').forEach(chip => {
    const on = !!(features[chip.dataset.scenario] && features[chip.dataset.scenario][chip.dataset.feat]);
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', on);
  });
}

// ── MOBILE HELPERS ─────────────────────────────────────────────────────────
export function updateScNav(idx) {
  document.querySelectorAll('.sc-nav-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

export function scrollToScenario(idx) {
  const grid = document.querySelector('.sc-grid');
  if (!grid) return;
  const cards = grid.querySelectorAll('.sc-card');
  if (!cards[idx]) return;
  grid.scrollTo({ left: cards[idx].offsetLeft, behavior: 'smooth' });
  updateScNav(idx);
}

// ── AGE SLIDER ─────────────────────────────────────────────────────────────
export function updateAge(s) {
  const inp=el("s"+s+"_ret"), disp=el("s"+s+"_retDisplay");
  const min=parseInt(inp.min),max=parseInt(inp.max),val=parseInt(inp.value);
  inp.style.setProperty("--pct",((val-min)/(max-min)*100).toFixed(1)+"%");
  disp.textContent=val; recalc();
}
export function stepAge(s,delta) {
  const inp=el("s"+s+"_ret");
  inp.value=Math.min(parseInt(inp.max),Math.max(parseInt(inp.min),parseInt(inp.value)+delta));
  updateAge(s);
}

// ── TABLE TOGGLE ───────────────────────────────────────────────────────────
export function toggleTable() {
  const wrap=el("tblWrap"),arrow=el("tblArrow"),toggle=el("tblToggle");
  wrap.classList.toggle("collapsed");
  const c=wrap.classList.contains("collapsed");
  if(arrow)  arrow.textContent=(c?"\u25B6":"\u25BC")+" Year-by-Year Detail";
  if(toggle) toggle.setAttribute("aria-expanded",!c);
}

// ── WD MODE ────────────────────────────────────────────────────────────────
export function onWdMode() {
  const mode=(document.querySelector('input[name="wdMode"]:checked')||{value:'fixed'}).value;
  const sw=el("spendRet_wrap"), sr=el("swr_wrap");
  // The retirement budget drives both modes (FIRE target, card targets, Monte
  // Carlo funding ratio) — it must stay visible and editable in % mode too.
  if(sw) sw.style.display="";
  if(sr) sr.style.display = mode==="swr" ? "" : "none";
  recalc();
}

export function updateLabels() {
  const cv=['var(--s1c)','var(--s2c)','var(--s3c)','var(--s4c)','var(--s5c)'][state.activeScIdx];
  const name=getScenarioName(state.activeScIdx);
  const dot=el('projLegDot'),lbl=el('projLegName'),dash=el('projLegDash');
  if(dot) dot.style.background=cv;
  if(dash) dash.style.borderColor=FIRE_LINE; // FIRE Target legend uses the neutral reference colour
  // Plan-vs-actual legend entries — shown only when past history exists
  const baseYr=numVal('baseYear',2026);
  const showAct = state.nwHistory.length>0 && state.nwHistory.some(r=>r.val>0) && Math.min(...state.nwHistory.map(r=>r.year))<baseYr;
  // the solid line is your actuals → projection; label it "Actuals" once history exists
  if(lbl) lbl.textContent = showAct ? 'Actuals' : name;
  const lp=el('legPlan'), lpd=el('legPlanDash');
  if(lp) lp.style.display=showAct?'':'none';
  if(lpd) lpd.style.borderColor=cv;
  // FIRE Target line is always shown now (including SWR mode)
  const fireLegItem=dash?dash.closest('.leg-item'):null;
  if(fireLegItem) fireLegItem.style.display='';
  const sel=el("retCountry"), hd=el("pensionGroupHd");
  if (sel&&hd) {
    const txt=(sel.options[sel.selectedIndex]||{text:""}).text;
    const match=txt.replace(/[\uD800-\uDFFF]{2}/g,"").replace(/[^\x20-\x7E]/g,"").trim().replace(/\s+\d+%$/,"").trim();
    hd.textContent=(match||"State")+" Pension";
  }
}

export function setActiveScenario(idx) {
  state.activeScIdx = idx;
  updateLabels();
  if (state.lastProjs && state.lastGl && state.lastScenarios) {
    renderSummaryTiles(state.lastProjs, state.lastGl, state.lastScenarios);
    buildChart(state.lastProjs, state.lastGl);
    buildFlowChart(state.lastProjs, state.lastGl);
    renderTable(state.lastProjs, state.lastGl);
    // keep the summary-tile carousel in sync so the whole Results view matches
    const sumRow = el('scSummaryRow');
    if (sumRow) {
      const tiles = sumRow.querySelectorAll('.sc-summary-tile');
      if (tiles[idx]) sumRow.scrollTo({ left: tiles[idx].offsetLeft, behavior: 'smooth' });
    }
  }
}
