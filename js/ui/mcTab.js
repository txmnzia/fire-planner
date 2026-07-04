import { el, fmt, fmtK } from "../util.js";
import { getGlobals, getScenario, getScenarioName } from "../inputs.js";
import { project } from "../engine.js";
import { runMonteCarlo, mcPct } from "../montecarlo.js";
import { COLORS, COLORS_FADE, ALPHAS, GC, FIRE_LINE } from "./charts.js";

// Monte Carlo tab state (module-private)
let mcFanChart = null, mcHistChart = null;
let mcResults = null, mcActiveIdx = 0, mcGl = null;

// ── MONTE CARLO UI ───────────────────────────────────────────────────────────
function mcEsc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function mcRateClass(rate){ return rate>=0.9?'hi':rate>=0.75?'mid':'lo'; }
const MC_RATE_COLOR={hi:'var(--ok)',mid:'var(--s2c)',lo:'var(--err)'};

export function runMonteCarloUI(){
  const btn=el('mcRunBtn'); if(!btn) return;
  el('mcStatus').textContent='Running…'; btn.disabled=true;
  // Yield a frame so the "Running…" label paints before the blocking compute.
  requestAnimationFrame(()=>setTimeout(()=>{
    try {
      const gl=getGlobals();
      const scenarios=[1,2,3,4,5].map(s=>getScenario(s,gl));
      const cfg={ sims:parseInt(el('mcSims').value)||1000,
                  blockLen:parseInt(el('mcBlock').value)||5,
                  recenter:el('mcRecenter').checked };
      const t0=performance.now();
      const results=runMonteCarlo(scenarios,gl,cfg);
      results.forEach((r,i)=>{
        r.name=getScenarioName(i); r.color=COLORS[i]; r.fade=COLORS_FADE[i]; r.alpha=ALPHAS[i];
        // Reference FIRE target from the deterministic projection — priced with
        // the tracked gain fraction at retirement, same number the other tabs show.
        r.fireTarget=project(scenarios[i],gl).fireTarget;
      });
      mcResults=results; mcGl=gl;
      if (mcActiveIdx>=results.length) mcActiveIdx=0;
      el('mcStatus').textContent=cfg.sims.toLocaleString('en-US')+' paths · '+Math.round(performance.now()-t0)+' ms';
      const mcBody=document.querySelector('.mc-body'); if(mcBody) mcBody.classList.remove('stale');
      el('mcEmpty').style.display='none'; el('mcDetail').style.display='block';
      renderMcCards(); selectMcScenario(mcActiveIdx);
    } catch(e){ el('mcStatus').textContent='Error: '+e.message; console.error(e); }
    finally { btn.disabled=false; }
  },0));
}

// The headline rate shown on each card. In Fixed mode it is depletion-based
// survival; in SWR mode (where the portfolio can't deplete) it is the share of
// simulations whose income covered the full spending target every year.
function mcCardStat(r, swr){
  return swr
    ? { rate: r.fundedRate,  sub: 'retirement years on budget' }
    : { rate: r.successRate, sub: 'survival to '+mcGl.lifeExp };
}

function renderMcCards(){
  const wrap=el('mcCards'); if(!wrap||!mcResults) return;
  const swr=mcGl.wdMode==='swr';
  wrap.innerHTML=mcResults.map((r,i)=>{
    const st=mcCardStat(r,swr), pct=Math.round(st.rate*100), cls=mcRateClass(st.rate);
    return '<div class="mc-card'+(i===mcActiveIdx?' active':'')+'" style="--cc:'+r.color+'" onclick="selectMcScenario('+i+')">'
      +'<div class="mc-card-name" style="color:'+r.color+'">'+mcEsc(r.name)+'</div>'
      +'<div class="mc-card-rate mc-rate-'+cls+'">'+pct+'%</div>'
      +'<div class="mc-card-sub">'+st.sub+'</div>'
      +'<div class="mc-card-bar"><div class="mc-bar-'+cls+'" style="width:'+pct+'%"></div></div>'
      +'</div>';
  }).join('');
  const note=el('mcModeNote');
  if (note){
    if (swr){
      note.style.display='block';
      note.innerHTML='<strong>% of Portfolio mode:</strong> up to SWR% of the current portfolio funds each year’s budget (surpluses stay invested), so the portfolio can’t hit zero — depletion-based survival is ~100% by construction. The real question is <strong>budget adequacy</strong>: how often, and by how much, the available draw (plus pensions and partner income) falls short of your full yearly budget. The cards show the share of retirement years on budget; click one for how deep the shortfalls go. Switch to Fixed-Amount mode for a classic depletion-based survival rate.';
    } else {
      note.style.display='none';
    }
  }
}

export function selectMcScenario(i){
  mcActiveIdx=i;
  document.querySelectorAll('#mcCards .mc-card').forEach((c,idx)=>c.classList.toggle('active',idx===i));
  renderMcDetail();
}

function mcTile(lbl,valHtml,note,muted){
  return '<div class="mc-tile"><div class="mc-tile-lbl">'+lbl+'</div>'
    +'<div class="mc-tile-val'+(muted?' muted':'')+'">'+valHtml+'</div>'
    +'<div class="mc-tile-note">'+note+'</div></div>';
}

function renderMcDetail(){
  if(!mcResults) return;
  const r=mcResults[mcActiveIdx];
  const swr=mcGl.wdMode==='swr';
  const t=[];
  if (swr){
    // SWR: the portfolio can't deplete, so budget adequacy is the live risk.
    // Frequency (how often short) + depth (how far short) of the funding ratio.
    const fundClr=MC_RATE_COLOR[mcRateClass(r.fundedRate)];
    t.push(mcTile('Years under budget','<span style="color:'+fundClr+'">'+Math.round(r.yearsBelowAvg)+' / '+r.retYearsTotal+'</span>','avg retirement yrs income < budget'));
    t.push(mcTile('Lifetime budget funded',Math.round(r.typicalCoverage*100)+'%','median sim: share of total budget covered'));
    t.push(mcTile('When short, you fund',Math.round(r.condShortDepth*100)+'%','avg coverage in under-budget yrs'));
    t.push(mcTile('Worst year (1-in-10)',Math.round(r.worstYearP10*100)+'%','leanest year in a bad path'));
  } else {
    const rc=MC_RATE_COLOR[mcRateClass(r.successRate)];
    t.push(mcTile('Success rate','<span style="color:'+rc+'">'+Math.round(r.successRate*100)+'%</span>','never depleted before age '+mcGl.lifeExp));
    t.push(mcTile('Median ending value',fmtK(r.medianEnd),'real, today’s € (P10 '+fmtK(r.p10End)+')'));
    t.push(mcTile('Larger end portfolio',Math.round(r.largeEndPct*100)+'%','real ending ≥ 2× value at retirement'));
    t.push(mcTile('Smaller end portfolio',Math.round(r.smallEndPct*100)+'%','real ending ≤ ½ value at retirement'));
  }
  el('mcTiles').innerHTML=t.join('');
  el('mcFanTitle').textContent=(swr?'Budget Coverage Over Retirement — ':'Outcome Range Over Time — ')+r.name;
  if (el('mcFanRefLabel')) el('mcFanRefLabel').textContent = swr ? 'Budget (100%)' : 'FIRE Target';
  if (el('mcHistTitle')) el('mcHistTitle').innerHTML = swr
    ? 'Distribution of Budget Coverage <span style="color:var(--muted);font-weight:400">(share of lifetime budget funded per sim)</span>'
    : 'Distribution of Ending Net Worth <span style="color:var(--muted);font-weight:400">(real, today’s €)</span>';
  buildMcFanChart(r, swr); buildMcHistChart(r, swr);
}

const MC_Y_TICK=v=>v>=1e6?"€"+(v/1e6).toFixed(1)+"M":v>=1e3?"€"+(v/1e3).toFixed(0)+"k":"€"+Math.round(v);
const MC_PCT_TICK=v=>Math.round(v*100)+"%";

// Fan chart. In SWR mode it plots the funding ratio (income ÷ budget) over the
// retirement years with a reference line at 100%; otherwise net worth over time
// with the FIRE target line.
function buildMcFanChart(r, swr){
  if (typeof Chart === "undefined") return;   // Chart.js CDN unavailable — keep calculations & saving alive

  const ctx=el('mcFanChart').getContext('2d');
  const labels = swr ? r.ratioYears : r.years;
  const bands  = swr ? r.ratioBands : r.bands;
  const refData= swr ? labels.map(()=>1) : labels.map(()=>r.fireTarget);
  const refLbl = swr ? 'Budget (100%)' : 'FIRE Target';
  const band18 = r.fade.replace('.5)','.2)');   // darker inner-band fill from the fade colour
  const mk=(data,opt)=>Object.assign({data,pointRadius:0,pointHoverRadius:0,borderWidth:0,tension:.3,fill:false},opt);
  const ds=[
    mk(bands.p10,{label:'10th pct',borderColor:'transparent'}),
    mk(bands.p90,{label:'90th pct',borderColor:'transparent',backgroundColor:r.alpha,fill:'-1'}),
    mk(bands.p25,{label:'p25',borderColor:'transparent'}),
    mk(bands.p75,{label:'p75',borderColor:'transparent',backgroundColor:band18,fill:'-1'}),
    mk(bands.p50,{label:'Median',borderColor:r.color,borderWidth:2.5}),
    mk(refData,{label:refLbl,borderColor:FIRE_LINE,borderWidth:1.5,borderDash:[5,5]}),
  ];
  const shown=new Set(['10th pct','Median','90th pct',refLbl]);
  const valFmt = swr ? (v=>Math.round(v*100)+"%") : (v=>"€"+fmt(v));
  if(mcFanChart) mcFanChart.destroy();
  mcFanChart=new Chart(ctx,{type:'line',data:{labels,datasets:ds},options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:250},interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:"#0b0e17",borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",titleFont:{family:"'DM Sans'",size:11},bodyFont:{family:"'DM Mono'",size:11},padding:10,filter:i=>shown.has(i.dataset.label),callbacks:{title:items=>items[0].label,label:c=>" "+c.dataset.label+": "+valFmt(c.raw)}}},
    scales:{x:{grid:{color:GC.g},ticks:{color:GC.t,font:GC.f,maxTicksLimit:12},border:{color:"rgba(255,255,255,.05)"}},y:{min:0,grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,callback: swr?MC_PCT_TICK:MC_Y_TICK}}}
  }});
}

// Histogram. SWR: distribution of each sim's average budget coverage (funding
// ratio), with the 100% line marked. Otherwise: distribution of ending net worth.
function buildMcHistChart(r, swr){
  if (typeof Chart === "undefined") return;   // Chart.js CDN unavailable — keep calculations & saving alive

  const ctx=el('mcHistChart').getContext('2d');
  const vals = swr ? r.coverageDist : r.endVals, n=vals.length||1;
  const nb=24;
  // Coverage axis spans 0..max(120%, P98) so the 100% line sits inside the chart;
  // net-worth axis spans 0..P95.
  const hi = swr ? Math.max(1.2, mcPct(vals,0.98)) : Math.max(1, mcPct(vals,0.95));
  const buckets=new Array(nb).fill(0);
  for(const v of vals){ let b=Math.floor((Math.max(0,v)/hi)*nb); if(b>=nb)b=nb-1; if(b<0)b=0; buckets[b]++; }
  const labels=buckets.map((_,i)=> swr ? Math.round(((i+0.5)*hi/nb)*100)+"%" : fmtK((i+0.5)*hi/nb));
  // SWR: colour buckets by adequacy (green ≥100%, amber ≥80%, red below).
  // Net worth: highlight the depleted (leftmost) bucket in red.
  const colors=buckets.map((_,i)=>{
    if (!swr) return i===0?'rgba(248,113,113,.75)':r.color;
    const center=(i+0.5)*hi/nb;
    return center>=1 ? 'rgba(34,197,94,.8)' : center>=0.8 ? 'rgba(251,191,36,.8)' : 'rgba(248,113,113,.8)';
  });
  // Index of the bucket containing the 100% reference (SWR only).
  const refIdx = swr ? Math.min(nb-1, Math.floor((1/hi)*nb)) : -1;
  const refPlugin={id:'mcHistRef',afterDatasetsDraw(ch){
    if(refIdx<0) return; const x=ch.scales.x, ya=ch.scales.y; if(!x||!ya) return;
    const px=x.getPixelForValue(refIdx); const c2=ch.ctx;
    c2.save(); c2.strokeStyle='rgba(221,228,242,.5)'; c2.lineWidth=1; c2.setLineDash([4,3]);
    c2.beginPath(); c2.moveTo(px,ya.top); c2.lineTo(px,ya.bottom); c2.stroke();
    c2.setLineDash([]); c2.fillStyle='#7e8faa'; c2.font="600 9px 'DM Mono',monospace"; c2.textAlign='center';
    c2.fillText('100%',px,ya.top+8); c2.restore();
  }};
  if(mcHistChart) mcHistChart.destroy();
  mcHistChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{data:buckets,backgroundColor:colors,borderWidth:0,barPercentage:1,categoryPercentage:.96}]},plugins:[refPlugin],options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:200},
    plugins:{legend:{display:false},tooltip:{backgroundColor:"#0b0e17",borderColor:"#1a2236",borderWidth:1,titleColor:"#7e8faa",bodyColor:"#dde4f2",bodyFont:{family:"'DM Mono'",size:11},padding:10,callbacks:{title:items=>"≈"+items[0].label,label:c=>" "+c.raw+" of "+n+" sims ("+Math.round(c.raw/n*100)+"%)"}}},
    scales:{x:{grid:{display:false},ticks:{color:GC.t,font:GC.f,maxTicksLimit:8}},y:{grid:{color:GC.g},border:{color:"rgba(255,255,255,.05)"},ticks:{color:GC.t,font:GC.f,maxTicksLimit:4}}}
  }});
}

export function resizeMcCharts() {
  if (mcFanChart) mcFanChart.resize();
  if (mcHistChart) mcHistChart.resize();
}

// Called by recalc(): results on screen were computed for the previous inputs.
export function markMcStale() {
  if (!mcResults) return;
  const st = el('mcStatus'); if (st) st.textContent = 'Inputs changed — press Run to refresh';
  const mcBody = document.querySelector('.mc-body'); if (mcBody) mcBody.classList.add('stale');
}
