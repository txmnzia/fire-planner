import { el, fmt } from "../util.js";
import { state } from "../state.js";
import { buildPlanProj } from "../engine.js";

// Chart.js instances are module-private; other modules resize via resizeResultsCharts().
let chart = null, allocChart = null;

// ── CHARTS ─────────────────────────────────────────────────────────────────
export const FIRE_LINE   = "rgba(126,143,170,.75)"; // neutral horizontal FIRE-target reference line
export const COLORS      = ["#818cf8","#fbbf24","#34d399","#f472b6","#fb923c"];
export const COLORS_FADE = ["rgba(129,140,248,.5)","rgba(251,191,36,.5)","rgba(52,211,153,.5)","rgba(244,114,182,.5)","rgba(251,146,60,.5)"];
export const ALPHAS      = ["rgba(129,140,248,.07)","rgba(251,191,36,.07)","rgba(52,211,153,.07)","rgba(244,114,182,.07)","rgba(251,146,60,.07)"];
export const GC = {g:"rgba(255,255,255,.035)",t:"#3a4a62",f:{family:"'DM Mono',monospace",size:10}};

function makeRetPlugin(projs, gl) {
  return { id:"retLabels", afterDatasetsDraw(ch) {
    const c2=ch.ctx, xs=ch.scales.x, ys=ch.scales.y; if (!xs||!ys) return;
    projs.forEach((proj,i)=>{
      const li=ch.data.labels.indexOf(proj.retYear); if(li<0) return;
      const meta=ch.getDatasetMeta(i*2); if(!meta||!meta.data||!meta.data[li]) return;
      const pt=meta.data[li];
      const label="retire "+(gl.currentAge+proj.retYear-gl.baseYear);
      c2.save(); c2.font="600 9px 'DM Mono',monospace";
      const tw=c2.measureText(label).width,px=5,bh=14;
      const bx=pt.x-tw/2-px, by=pt.y-20;
      c2.fillStyle="rgba(10,13,24,.88)"; c2.beginPath(); c2.roundRect(bx,by,tw+px*2,bh,3); c2.fill();
      c2.strokeStyle=COLORS_FADE[state.activeScIdx]; c2.lineWidth=1; c2.stroke();
      c2.fillStyle=COLORS[state.activeScIdx]; c2.textAlign="center"; c2.textBaseline="middle";
      c2.fillText(label,pt.x,by+bh/2);
      c2.beginPath(); c2.arc(pt.x,pt.y,3,0,Math.PI*2); c2.fillStyle=COLORS[state.activeScIdx]; c2.fill();
      c2.restore();
    });
  }};
}

export function buildChart(projs,gl) {
  if (typeof Chart === "undefined") return;   // Chart.js CDN unavailable — keep calculations & saving alive

  const proj=projs[state.activeScIdx], color=COLORS[state.activeScIdx], alpha=ALPHAS[state.activeScIdx], fade=COLORS_FADE[state.activeScIdx];
  const ctx=el("fireChart").getContext("2d");
  const sc = state.lastScenarios ? state.lastScenarios[state.activeScIdx] : null;
  const planProj = sc ? buildPlanProj(sc, gl, state.nwHistory) : null;

  let labels, ds;
  if (planProj) {
    // Extended view: x-axis runs from the first snapshot. One solid "Net Worth"
    // line = actual points (past) flowing straight into the forward projection;
    // one dashed "Plan" line. Dataset[0] is the solid line so makeRetPlugin can
    // place the retirement marker on it. Dots mark real (actual) data points.
    labels = planProj.years.slice();
    const actualMap = {};
    state.nwHistory.filter(r=>r.val>0&&r.year>0).forEach(r => { actualMap[r.year] = r.val; });
    actualMap[gl.baseYear] = (gl.invested || 0) + gl.cash; // "today" joins actuals to the projection
    const combined = labels.map(y => {
      if (y < gl.baseYear) return actualMap[y] != null ? actualMap[y] : null;
      const i = y - gl.baseYear; return (i>=0 && i<proj.values.length) ? proj.values[i] : null;
    });
    const isActual = y => y <= gl.baseYear && actualMap[y] != null;
    const ptR  = labels.map(y => isActual(y) ? 3 : 0);
    const ptHR = labels.map(y => isActual(y) ? 5 : 4);
    ds = [
      {label:"Net Worth",data:combined,borderColor:color,backgroundColor:alpha,borderWidth:2.5,pointRadius:ptR,pointHoverRadius:ptHR,pointBackgroundColor:color,tension:.35,fill:false,order:1,spanGaps:true},
      {label:"Plan",data:planProj.values,borderColor:fade,borderWidth:1.5,borderDash:[5,5],pointRadius:0,pointHoverRadius:4,tension:.35,fill:false,order:2,spanGaps:true},
    ];
    ds.push({label:"FIRE Target",data:labels.map(()=>proj.fireTarget),borderColor:FIRE_LINE,borderWidth:1.5,pointRadius:0,tension:0,fill:false,order:3});
  } else {
    labels = proj.years;
    ds = [
      {label:"Portfolio",data:proj.values,borderColor:color,backgroundColor:alpha,borderWidth:2.5,pointRadius:0,pointHoverRadius:4,tension:.35,fill:false,order:1},
    ];
    ds.push({label:"FIRE Target",data:labels.map(()=>proj.fireTarget),borderColor:FIRE_LINE,borderWidth:1.5,pointRadius:0,tension:0,fill:false,order:2});
  }
  if (chart) chart.destroy();
  chart=new Chart(ctx,{type:"line",data:{labels,datasets:ds},plugins:[makeRetPlugin([proj],gl)],options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:300},interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:"#0b0e17",borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",titleFont:{family:"'DM Sans'",size:11},bodyFont:{family:"'DM Mono'",size:11},padding:10,filter:item=>!item.dataset.label.startsWith("__"),callbacks:{title:items=>"Entering "+items[0].label,label:c=>" "+c.dataset.label+": €"+fmt(c.raw)}}},
    scales:{x:{grid:{color:GC.g},ticks:{color:GC.t,font:GC.f,maxTicksLimit:12},border:{color:"rgba(255,255,255,.05)"}},y:{grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,callback:v=>v>=1e6?"€"+(v/1e6).toFixed(1)+"M":v>=1e3?"€"+(v/1e3).toFixed(0)+"k":"€"+v}}}
  }});
}

// Revenue / cost flow chart. Each year is one diverging stacked bar: revenue
// blocks (greens/teals) stack up from zero, cost blocks (reds/oranges) stack
// down. Every line item from the year-by-year table is represented on its own —
// aggregates (net worth, net flow) are deliberately excluded — and hovering a
// single block reveals only that block's amount. SURFACE is the chart-surface
// colour used both for the thin gap between stacked segments and the tooltip bg.
const SURFACE = "#0b0e17";
// Revenue line items (green -> teal -> lime family). `get` pulls a single, non-
// overlapping amount from a projection row. Salary strips out the partner
// pension that the engine folds into `income` during accumulation, so it is
// never double-counted with the "Partner Pension" block.
const REVENUE = [
  {key:"salary",   label:"Salary",          color:"#22c55e", get:r=>Math.max(0,(r.income||0)-(r.phase==="acc"?(r.partnerPension||0):0))},
  {key:"withdraw", label:"Withdrawal",      color:"#2dd4bf", get:r=>r.withdrawal||0},
  {key:"market",   label:"Market Return",   color:"#4ade80", get:r=>Math.max(0,r.portReturn||0)},
  {key:"pension",  label:"Pension",         color:"#14b8a6", get:r=>r.pension||0},
  {key:"partPen",  label:"Partner Pension", color:"#a3e635", get:r=>r.partnerPension||0},
  {key:"windfall", label:"Windfall",        color:"#86efac", get:r=>r.windfall||0},
  {key:"rent",     label:"Rent Saved",      color:"#5eead4", get:r=>r.rentSavings||0},
  {key:"cashInt",  label:"Cash Interest",   color:"#bef264", get:r=>Math.max(0,r.cashReturn||0)},
];
// Cost line items (red -> orange family). Plotted as negative so they stack
// below zero; the magnitude is restored for display.
const COST = [
  {key:"spend",    label:"Spending",         color:"#ef4444", get:r=>r.spending||0},
  {key:"mortgage", label:"Mortgage",         color:"#f97316", get:r=>r.mortgagePayment||0},
  {key:"child",    label:"Child Costs",      color:"#fb7185", get:r=>r.childCost||0},
  {key:"cgt",      label:"Capital Gain Tax", color:"#e11d48", get:r=>r.taxPaid||0},
  {key:"purchase", label:"Purchase Cost",    color:"#f59e0b", get:r=>r.extraCost||0},
];

export function buildFlowChart(projs,gl) {
  if (typeof Chart === "undefined") return;   // Chart.js CDN unavailable — keep calculations & saving alive

  const proj=projs[state.activeScIdx];
  const rows=proj.rows||[], years=proj.years;
  // One dataset per line item, dropping any that is zero across every year
  // (e.g. no property -> no mortgage/rent/purchase blocks), so the legend and
  // the stacks stay uncluttered for the active scenario.
  const build=(specs,sign)=>specs.map(s=>{
    const data=rows.map(r=>sign*s.get(r));
    if (!data.some(v=>v!==0)) return null;
    return {label:s.label,data,backgroundColor:s.color,stack:"flow",
      borderColor:SURFACE,borderWidth:1,barPercentage:1,categoryPercentage:.92};
  }).filter(Boolean);
  const datasets=[...build(REVENUE,1),...build(COST,-1)];

  const retIdx=years.indexOf(proj.retYear);
  const retPl={id:"retLineFlow",afterDatasetsDraw(ch){
    if(retIdx<0) return; const c2=ch.ctx,xs=ch.scales.x,area=ch.chartArea; if(!xs||!area) return;
    const xPx=xs.getPixelForValue(retIdx);
    c2.save();
    c2.strokeStyle="rgba(126,143,170,.45)"; c2.lineWidth=1; c2.setLineDash([4,4]);
    c2.beginPath(); c2.moveTo(xPx,area.top); c2.lineTo(xPx,area.bottom); c2.stroke();
    c2.setLineDash([]);
    const label="retire "+(gl.currentAge+proj.retYear-gl.baseYear);
    c2.font="600 9px 'DM Mono',monospace";
    const tw=c2.measureText(label).width,px=5,bh=14,bx=Math.min(xPx+4,area.right-tw-px*2),by=area.top+2;
    c2.fillStyle="rgba(10,13,24,.88)"; c2.beginPath(); c2.roundRect(bx,by,tw+px*2,bh,3); c2.fill();
    c2.strokeStyle="rgba(126,143,170,.55)"; c2.lineWidth=1; c2.stroke();
    c2.fillStyle="#9fb0c8"; c2.textAlign="left"; c2.textBaseline="middle";
    c2.fillText(label,bx+px,by+bh/2); c2.restore();
  }};

  const ctx2=el("allocChart").getContext("2d");
  if (allocChart) allocChart.destroy();
  allocChart=new Chart(ctx2,{type:"bar",data:{labels:years,datasets},plugins:[retPl],options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:200},
    // Per-block hover: intersect a single segment so the tooltip shows only the
    // amount for the block under the cursor, not the whole year's stack.
    interaction:{mode:"nearest",intersect:true},
    plugins:{
      legend:{display:true,position:"bottom",labels:{color:"#9fb0c8",boxWidth:9,boxHeight:9,padding:7,font:{family:"'DM Sans'",size:10},usePointStyle:true,pointStyle:"rectRounded"}},
      tooltip:{mode:"nearest",intersect:true,backgroundColor:SURFACE,borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",titleFont:{family:"'DM Sans'",size:11},bodyFont:{family:"'DM Mono'",size:11},padding:10,callbacks:{
        title:items=>{const i=items[0].dataIndex,r=rows[i];return items[0].label+(r?"  ·  age "+r.age:"");},
        label:c=>" "+c.dataset.label+": €"+fmt(Math.abs(c.raw))}}},
    scales:{
      x:{stacked:true,grid:{color:GC.g},ticks:{color:GC.t,font:GC.f,maxTicksLimit:12},border:{color:"rgba(255,255,255,.05)"}},
      y:{stacked:true,grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,maxTicksLimit:7,callback:v=>{const a=Math.abs(v);return (v<0?"-€":"€")+(a>=1e6?(a/1e6).toFixed(1)+"M":a>=1e3?(a/1e3).toFixed(0)+"k":a);}}}}
  }});
}

export function resizeResultsCharts() {
  if (chart) chart.resize();
  if (allocChart) allocChart.resize();
}
