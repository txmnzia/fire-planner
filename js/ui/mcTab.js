import { el, fmtK } from "../util.js?v=8.34";
import { state } from "../state.js?v=8.34";
import { getScenarioName } from "../inputs.js?v=8.34";
import { runMonteCarloOrdered, mcPct } from "../montecarlo.js?v=8.34";
import { COLORS, GC, buildChart } from "./charts.js?v=8.34";

// Monte Carlo on the Results tab (v8.30, issue #21). No Run button: every
// recalc() marks the results stale and schedules a run in a module worker
// (js/mcWorker.js); the newest inputs always win and the scenario on screen is
// computed first. Results are module-private, keyed by the generation of inputs
// they were computed for, so stale output is always shown dimmed (AUDIT.md T5).
let mcHistChart = null;
let gen = 0;                        // generation of the inputs on screen (bumped by markMcStale)
let results = [null,null,null,null,null];   // per scenario: { gen, r } or null
let mcGl = null;                    // gl of the newest finished result (labels: lifeExp, wdMode)
let missing = [false,false,false,false,false];   // blocking inputs: no MC for that scenario
let timer = null, worker = null, useWorker = true, runGen = -1, lastCfg = null;
const DEBOUNCE_MS = 600;

function mcRateClass(rate){ return rate>=0.9?'hi':rate>=0.75?'mid':'lo'; }
const MC_RATE_COLOR={hi:'var(--ok)',mid:'var(--s2c)',lo:'var(--err)'};
const fresh = i => !!results[i] && results[i].gen === gen;

// Read once per run; recentering is always on (DECISIONS 2026-11-26): the range
// must stay centred on the user's own return assumptions.
function mcConfig(){
  return { sims: parseInt(el('mcSims')?.value)||1000, blockLen: parseInt(el('mcBlock')?.value)||5, recenter: true };
}

// ── STALENESS + SCHEDULING ─────────────────────────────────────────────────
// Called by recalc() BEFORE the charts are built: the inputs changed, so every
// result on screen belongs to the previous inputs. Never remove this call.
export function markMcStale(){
  gen++;
  missing = (state.lastStops||[]).map(s => !!(s && s.missing));
  paintMc();
}

// Called at the end of recalc(): debounce, then run for the inputs on screen.
export function scheduleMcRun(){
  clearTimeout(timer);
  timer = setTimeout(startRun, DEBOUNCE_MS);
}

function startRun(){
  timer = null;
  const gl = state.lastGl, scenarios = state.lastScenarios;
  if (!gl || !scenarios) return;
  const myGen = gen, cfg = mcConfig();
  const active = state.activeScIdx;
  const order = [active, ...[0,1,2,3,4].filter(i => i !== active)]
    .filter(i => scenarios[i] && !missing[i]);
  const fireTargets = (state.lastProjs||[]).map(p => p ? p.fireTarget : 0);
  const accept = (i, r) => {
    if (myGen !== gen) return false;                    // newer inputs arrived meanwhile
    decorate(r, i, fireTargets[i]);
    results[i] = { gen: myGen, r }; mcGl = gl; lastCfg = cfg;
    paintMc(i);
    return true;
  };
  runGen = myGen;
  if (useWorker && typeof Worker !== 'undefined') {
    try {
      if (worker) worker.terminate();                   // latest wins: drop the older run
      worker = new Worker(new URL("../mcWorker.js?v=8.34", import.meta.url), { type: 'module' });
      worker.onmessage = e => {
        const m = e.data; if (m.gen !== gen) return;
        if (m.error) { console.error('Monte Carlo worker:', m.error); fallback(); return; }
        if (m.done) { runGen = -1; paintStatus(); return; }
        accept(m.i, m.result);
      };
      worker.onerror = e => { if (e && e.preventDefault) e.preventDefault(); fallback(); };
      worker.postMessage({ gen: myGen, scenarios, gl, cfg, order });
      paintStatus();
      return;
    } catch (e) { console.warn('Monte Carlo: no worker, running on the page', e); useWorker = false; }
  }
  runOnPage(myGen, scenarios, gl, cfg, order, accept);

  // A worker that fails (old browser without module workers, data it cannot
  // copy) switches this session to the on-page run.
  function fallback(){
    useWorker = false;
    if (worker) { worker.terminate(); worker = null; }
    if (myGen === gen) runOnPage(myGen, scenarios, gl, cfg, order, accept);
  }
}

// Fallback: on the page, one scenario per task so the page stays responsive
// between scenarios. Same function, same shared paths, same results.
function runOnPage(myGen, scenarios, gl, cfg, order, accept){
  paintStatus();
  let k = 0;
  const step = () => {
    if (myGen !== gen || k >= order.length) { if (myGen === gen) { runGen = -1; paintStatus(); } return; }
    const i = order[k++];
    try {
      runMonteCarloOrdered(scenarios, gl, cfg, [i], (j, r) => accept(j, r));
    } catch (e) { console.error(e); const st = el('mcStatus'); if (st) st.textContent = 'Error: ' + e.message; return; }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

function decorate(r, i, fireTarget){
  r.name=getScenarioName(i); r.color=COLORS[i];
  // Reference FIRE target from the deterministic projection, the number the
  // rest of Results shows (priced at the tracked gain fraction at retirement).
  r.fireTarget=fireTarget;
}

// ── WHAT THE OTHER RENDERERS ASK FOR ───────────────────────────────────────
// Bands for the Portfolio Projection chart (charts.js buildChart): the MC range
// of YOUR net worth path, start-of-year, same series as proj.values.
export function mcBandsFor(i){
  const x = results[i]; if (!x || missing[i]) return null;
  const b = x.r.bands;
  return { years: x.r.years, p10: b.p10, p25: b.p25, p75: b.p75, p90: b.p90, stale: x.gen !== gen };
}

// The headline line on each Results tile. Fixed mode: depletion survival.
// % mode: share of retirement years on budget (I3: the portfolio cannot deplete,
// so survival is never headlined there).
function headline(i){
  const gl = state.lastGl, swr = gl && gl.wdMode === 'swr';
  const label = swr ? 'Years on budget' : 'Chance it lasts to ' + (gl ? gl.lifeExp : '');
  if (missing[i]) return { label, text: '\u2014', cls: '', stale: false };
  const x = results[i];
  if (!x || (mcGl && mcGl.wdMode !== (gl && gl.wdMode))) return { label, text: '\u2026', cls: '', stale: true };
  const rate = swr ? x.r.fundedRate : x.r.successRate;
  return { label, text: Math.round(rate*100)+'%', cls: mcRateClass(rate), stale: x.gen !== gen };
}
function headlineInner(i){
  const h = headline(i);
  return '<span class="k">'+h.label+'</span><span class="v mc-v"'+(h.cls?' style="color:'+MC_RATE_COLOR[h.cls]+'"':'')+'>'+h.text+'</span>';
}
export function mcHeadlineHTML(i){
  const h = headline(i);
  return '<div class="sc-result-row mc-line'+(h.stale?' stale':'')+'" id="tileMc'+i+'">'+headlineInner(i)+'</div>';
}

// ── PAINTING ───────────────────────────────────────────────────────────────
// Everything MC-derived on screen, from the cached results. `arrived` is the
// scenario whose result just landed (undefined: a staleness change).
function paintMc(arrived){
  for (let i = 0; i < 5; i++) {
    const t = el('tileMc'+i);
    if (t) { const h = headline(i); t.innerHTML = headlineInner(i); t.classList.toggle('stale', h.stale); }
  }
  paintStatus();
  const a = state.activeScIdx;
  if (arrived === undefined || arrived === a) {
    paintMcActive();
    if (arrived === a && state.lastProjs && state.lastGl) buildChart(state.lastProjs, state.lastGl, mcBandsFor(a));
  }
}

function paintStatus(){
  const st = el('mcStatus'); if (!st) return;
  const todo = [0,1,2,3,4].filter(i => state.lastScenarios && state.lastScenarios[i] && !missing[i]);
  const allFresh = todo.length > 0 && todo.every(fresh);
  const cfg = lastCfg || mcConfig();
  st.textContent = allFresh ? cfg.sims.toLocaleString('en-US') + ' market histories \u00b7 up to date'
                 : (todo.length ? 'Updating the range\u2026' : '');
  st.classList.toggle('busy', !allFresh);
}

// The "How sure" tiles and the distribution tile for the active scenario. Also
// called by setActiveScenario (tile tap, carousel or chart swipe). v8.31: the
// distribution is a tile here (no collapsed Risk detail, no SWR coverage fan: the
// chart above and these tiles already carry the range).
export function paintMcActive(){
  const i = state.activeScIdx, x = results[i];
  const wrap = el('mcSure'), tiles = el('mcTiles'), title = el('mcSureTitle'), hist = el('mcHistTile');
  if (title) title.textContent = 'How sure \u2014 ' + getScenarioName(i);
  if (!wrap || !tiles) return;
  const showHist = on => { if (hist) hist.hidden = !on; };
  if (missing[i]) { tiles.innerHTML = '<div class="mc-empty">Missing inputs: no market range for this scenario.</div>'; wrap.classList.remove('stale'); showHist(false); return; }
  if (!x) { tiles.innerHTML = '<div class="mc-empty">Working out the range over thousands of market histories\u2026</div>'; showHist(false); return; }
  wrap.classList.toggle('stale', x.gen !== gen);
  renderMcDetail(x.r, mcGl);
  renderMcNote(mcGl);
  showHist(true);
  buildMcHistChart(x.r, mcGl.wdMode === 'swr');
}

// What the numbers mean in this mode, behind the (i) of the How sure header.
function renderMcNote(gl){
  const b = el('mcSureInfo'); if (!b || !gl) return;
  b.dataset.tip = (gl.wdMode === 'swr'
    ? '% of portfolio mode: up to SWR% of the current portfolio funds each year\u2019s budget (surpluses stay invested), so the portfolio can\u2019t hit zero and a survival rate would be ~100% by construction. These tiles measure budget adequacy instead: how often, and by how much, the draw (plus pensions and partner income) falls short of your full yearly budget. Switch to Fixed amount for a classic survival rate. '
    : 'Fixed amount mode: the share of histories where the money lasts to your life expectancy, and how the histories end in today\u2019s money. ')
    + 'With your partner, the range is your portfolio covering your cost: your own spending plus your part of the shared costs.';
}

function mcTile(lbl,valHtml,note,muted){
  return '<div class="mc-tile"><div class="mc-tile-lbl">'+lbl+'</div>'
    +'<div class="mc-tile-val'+(muted?' muted':'')+'">'+valHtml+'</div>'
    +'<div class="mc-tile-note">'+note+'</div></div>';
}

function renderMcDetail(r, gl){
  const swr=gl.wdMode==='swr';
  const t=[];
  if (swr){
    // SWR: the portfolio can't deplete, so budget adequacy is the live risk.
    // Frequency (how often short) + depth (how far short) of the funding ratio.
    const fundClr=MC_RATE_COLOR[mcRateClass(r.fundedRate)];
    t.push(mcTile('Years under budget','<span style="color:'+fundClr+'">'+Math.round(r.yearsBelowAvg)+' / '+r.retYearsTotal+'</span>','avg retirement yrs income < budget'));
    t.push(mcTile('Lifetime budget funded',Math.round(r.typicalCoverage*100)+'%','median history: share of total budget covered'));
    t.push(mcTile('When short, you fund',Math.round(r.condShortDepth*100)+'%','avg coverage in under-budget yrs'));
    t.push(mcTile('Worst year (1-in-10)',Math.round(r.worstYearP10*100)+'%','leanest year in a bad history'));
  } else {
    const rc=MC_RATE_COLOR[mcRateClass(r.successRate)];
    t.push(mcTile('Chance it lasts','<span style="color:'+rc+'">'+Math.round(r.successRate*100)+'%</span>','never runs out before age '+gl.lifeExp));
    t.push(mcTile('Typical end value',fmtK(r.medianEnd),'today\u2019s \u20ac, median (bad case '+fmtK(r.p10End)+')'));
    t.push(mcTile('Ends \u2265 2\u00d7 stop value',Math.round(r.largeEndPct*100)+'%','in today\u2019s \u20ac'));
    t.push(mcTile('Ends \u2264 \u00bd stop value',Math.round(r.smallEndPct*100)+'%','in today\u2019s \u20ac'));
  }
  el('mcTiles').innerHTML=t.join('');
  // Tile label style (uppercase, muted): the scenario is already in the header.
  if (el('mcHistTitle')) el('mcHistTitle').textContent = swr
    ? 'Lifetime budget funded, per history'
    : 'Ending net worth, per history (today\u2019s \u20ac)';
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
  if (mcHistChart) mcHistChart.resize();
}
