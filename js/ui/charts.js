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
    plugins:{legend:{display:false},tooltip:{backgroundColor:"#0b0e17",borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",titleFont:{family:"'DM Sans'",size:11},bodyFont:{family:"'DM Mono'",size:11},padding:10,filter:item=>!item.dataset.label.startsWith("__"),callbacks:{title:items=>"Entering "+items[0].label,label:c=>" "+c.dataset.label+": \u20ac"+fmt(c.raw)}}},
    scales:{x:{grid:{color:GC.g},ticks:{color:GC.t,font:GC.f,maxTicksLimit:12},border:{color:"rgba(255,255,255,.05)"}},y:{grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,callback:v=>v>=1e6?"\u20ac"+(v/1e6).toFixed(1)+"M":v>=1e3?"\u20ac"+(v/1e3).toFixed(0)+"k":"\u20ac"+v}}}
  }});
}

export function buildAllocChart(projs,gl) {
  if (typeof Chart === "undefined") return;   // Chart.js CDN unavailable — keep calculations & saving alive

  const proj=projs[state.activeScIdx],color=COLORS[state.activeScIdx],fade=COLORS_FADE[state.activeScIdx];
  const inv=proj.values.map((v,i)=>Math.max(0,v-(proj.rows[i]?(proj.rows[i].cashVal||0):0)));
  const sv=inv.map((v,i)=>Math.round(v*proj.allocations[i]/100));
  const bv=inv.map((v,i)=>Math.round(v*(100-proj.allocations[i])/100));
  const step=Math.max(1,Math.floor(proj.years.length/40));
  const fY=proj.years.filter((_,i)=>i%step===0);
  const fS=sv.filter((_,i)=>i%step===0), fB=bv.filter((_,i)=>i%step===0);
  const retIdx=fY.indexOf(proj.retYear);
  const retPl={id:"retLabelAlloc",afterDatasetsDraw(ch){
    if(retIdx<0) return; const c2=ch.ctx,xs=ch.scales.x,ys=ch.scales.y; if(!xs||!ys) return;
    const xPx=xs.getPixelForValue(retIdx),yPx=ys.getPixelForValue(fS[retIdx]+fB[retIdx]);
    const label="retire "+(gl.currentAge+proj.retYear-gl.baseYear);
    c2.save(); c2.font="600 9px 'DM Mono',monospace";
    const tw=c2.measureText(label).width,px=5,bh=14;
    const bx=xPx-tw/2-px,by=yPx-bh-5;
    c2.fillStyle="rgba(10,13,24,.88)"; c2.beginPath(); c2.roundRect(bx,by,tw+px*2,bh,3); c2.fill();
    c2.strokeStyle=fade; c2.lineWidth=1; c2.stroke();
    c2.fillStyle=color; c2.textAlign="center"; c2.textBaseline="middle";
    c2.fillText(label,xPx,by+bh/2); c2.restore();
  }};
  const ctx2=el("allocChart").getContext("2d");
  if (allocChart) allocChart.destroy();
  allocChart=new Chart(ctx2,{type:"bar",data:{labels:fY,datasets:[
    {label:"Stocks",data:fS,backgroundColor:color,stack:"alloc",borderWidth:0,barPercentage:1,categoryPercentage:1},
    {label:"Bonds", data:fB,backgroundColor:fade, stack:"alloc",borderWidth:0,barPercentage:1,categoryPercentage:1},
  ]},plugins:[retPl],options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:200},interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:"#0b0e17",borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",titleFont:{family:"'DM Sans'",size:11},bodyFont:{family:"'DM Mono'",size:11},padding:10,callbacks:{label:c=>" "+c.dataset.label+": \u20ac"+fmt(c.raw)}}},
    scales:{x:{stacked:true,grid:{color:GC.g},ticks:{color:GC.t,font:GC.f,maxTicksLimit:12},border:{color:"rgba(255,255,255,.05)"}},y:{stacked:true,grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,maxTicksLimit:5,callback:v=>v>=1e6?"\u20ac"+(v/1e6).toFixed(1)+"M":v>=1e3?"\u20ac"+(v/1e3).toFixed(0)+"k":"\u20ac"+v}}}
  }});
}

export function resizeResultsCharts() {
  if (chart) chart.resize();
  if (allocChart) allocChart.resize();
}
