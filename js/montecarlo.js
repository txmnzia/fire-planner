import { project } from "./engine.js";

// ── MONTE CARLO ENGINE ───────────────────────────────────────────────────────
// Historical block-bootstrap simulation. Each simulated path is built by stitching
// together random blocks of *consecutive* historical years drawn from the MSCI World
// (developed markets, gross, USD) annual total returns and a global government-bond
// proxy, 1970–2024. Sampling stock & bond from the same historical year preserves
// their real co-movement. With recentering ON (default) each draw keeps history's
// deviation from its own mean but is re-anchored to the user's assumed stockRet/
// bondRet — so volatility, fat tails and crash-then-recovery sequencing stay real
// while the average return matches the plan's own assumptions. Inflation is kept
// deterministic (the user's inflation input) for v1.
//
// NOTE: these are *approximate* annual total returns compiled from public sources,
// chosen to reproduce realistic year-to-year dynamics rather than exact index levels.
// Replace the arrays below to plug in your own return history (stock & bond must
// stay aligned by year, same length).
export const MC_HIST_START_YEAR = 1970;
export const MC_HIST_STOCK = [
  -0.020, 0.184, 0.225,-0.152,-0.255, 0.336, 0.145, 0.047, 0.182, 0.127, // 1970-79
   0.257,-0.048, 0.113, 0.233, 0.047, 0.418, 0.428, 0.168, 0.239, 0.172, // 1980-89
  -0.170, 0.183,-0.052, 0.231, 0.051, 0.213, 0.135, 0.158, 0.243, 0.249, // 1990-99
  -0.132,-0.168,-0.199, 0.331, 0.147, 0.095, 0.201, 0.090,-0.407, 0.300, // 2000-09
   0.118,-0.055, 0.158, 0.267, 0.049,-0.009, 0.075, 0.224,-0.087, 0.277, // 2010-19
   0.159, 0.218,-0.181, 0.238, 0.187,                                    // 2020-24
];
export const MC_HIST_BOND = [
   0.169, 0.087, 0.052, 0.037, 0.020, 0.036, 0.156, 0.030, 0.014, 0.019, // 1970-79
   0.027, 0.063, 0.326, 0.084, 0.152, 0.221, 0.153, 0.028, 0.079, 0.145, // 1980-89
   0.090, 0.160, 0.074, 0.098,-0.029, 0.185, 0.036, 0.097, 0.087,-0.008, // 1990-99
   0.116, 0.084, 0.103, 0.041, 0.043, 0.024, 0.043, 0.070, 0.052, 0.059, // 2000-09
   0.065, 0.078, 0.042,-0.020, 0.060, 0.005, 0.026, 0.035, 0.000, 0.087, // 2010-19
   0.075,-0.015,-0.130, 0.055, 0.013,                                    // 2020-24
];

// Geometric (compound) mean of a return series — the recentering anchor, so the
// median bootstrapped path compounds at the user's assumed rate and stays
// consistent with the deterministic tabs (which compound the input directly).
export function mcGeoMean(a){ let s=0; for (const x of a) s+=Math.log(1+x); return Math.exp(s/a.length)-1; }

// Seedable PRNG (mulberry32) → runs are reproducible for identical inputs.
export function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build one bootstrapped return path covering year-offsets 0..len as
// [{stock,bond}, …], stitching random blocks of `blockLen` consecutive
// historical years (wrapping at the end of the dataset), optionally recentered.
export function mcBuildPath(rng, len, blockLen, recenter, stockMean, bondMean, hStockMean, hBondMean){
  const N = MC_HIST_STOCK.length;
  const seq = new Array(len+1);
  let i = 0;
  while (i <= len) {
    const start = Math.floor(rng()*N);
    for (let b=0; b<blockLen && i<=len; b++, i++){
      const idx = (start+b)%N;
      let s = MC_HIST_STOCK[idx], bd = MC_HIST_BOND[idx];
      // Multiplicative shift anchored on geometric means: keeps history's
      // volatility/sequencing while the long-run compound return matches the
      // user's assumption (an additive arithmetic-mean shift would compound
      // ~σ²/2 below it — volatility drag).
      if (recenter){ s = (1+stockMean)*(1+s)/(1+hStockMean)-1; bd = (1+bondMean)*(1+bd)/(1+hBondMean)-1; }
      seq[i] = { stock:s, bond:bd };
    }
  }
  return seq;
}

// Linear-interpolated percentile from an ascending-sorted array.
export function mcPct(sorted, p){
  if (!sorted.length) return 0;
  const idx = (sorted.length-1)*p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo===hi ? sorted[lo] : sorted[lo] + (sorted[hi]-sorted[lo])*(idx-lo);
}

// Run the full Monte Carlo across all scenarios. The same set of bootstrapped
// return paths is reused for every scenario so differences reflect the plan, not
// sampling noise. Returns one result object per scenario.
export function runMonteCarlo(scenarios, gl, cfg){
  const N = cfg.sims, blockLen = cfg.blockLen, recenter = cfg.recenter, floor = cfg.floor||0;
  const horizon = Math.max(1, gl.lifeExp - gl.currentAge);   // year-offsets per path
  const nYears  = horizon + 1;
  const hStockMean = mcGeoMean(MC_HIST_STOCK), hBondMean = mcGeoMean(MC_HIST_BOND);
  const rng = mulberry32(cfg.seed != null ? cfg.seed : 0x1F1E33);
  const paths = new Array(N);
  for (let p=0;p<N;p++) paths[p] = mcBuildPath(rng, horizon, blockLen, recenter, gl.stockRet, gl.bondRet, hStockMean, hBondMean);

  const swr = gl.wdMode === 'swr';
  return scenarios.map(sc => {
    const retIdx = Math.max(0, Math.min(horizon, sc.retAge - gl.currentAge));
    const nRetYears = Math.max(1, nYears - retIdx);
    const byYear = Array.from({length:nYears}, () => new Float64Array(N));      // net worth bands
    const byRatio = swr ? Array.from({length:nRetYears}, () => new Float64Array(N)) : null; // funding-ratio bands
    const endVals = new Float64Array(N);
    const coverage = swr ? new Float64Array(N) : null;   // per-path average funding ratio
    const worstYr  = swr ? new Float64Array(N) : null;   // per-path leanest single-year ratio
    let successes=0, largeEnd=0, smallEnd=0;
    let shortfallYearSum=0, fundedYearSum=0, condShortSum=0, condShortCount=0;   // SWR income-adequacy
    for (let p=0;p<N;p++){
      const proj = project(sc, gl, { returnSeq: paths[p] });
      const vals = proj.values, rows = proj.rows;
      const realFire = vals[retIdx] / Math.pow(1+gl.inflation, retIdx);
      let survived = true, shortYears = 0, covNum = 0, covDen = 0, ratioCount = 0, minRatio = Infinity;
      for (let y=0;y<nYears;y++){
        const v = vals[y]!=null ? vals[y] : 0;
        byYear[y][p] = v;
        if (y>=retIdx && v<=floor) survived = false;
        if (swr && y>=retIdx && rows[y]){
          // funding ratio = portfolio income (SWR draw + pensions + partner salary) ÷ full annual budget
          const tgt = rows[y].swrTarget, inc = rows[y].swrIncome;
          const ratio = tgt>0 ? inc/tgt : 1;
          byRatio[y-retIdx][p] = ratio;
          ratioCount++;
          // lifetime coverage: budget-capped and deflated, so surplus years can't
          // inflate the score and every retirement year weighs equally in real terms
          const defl = Math.pow(1+gl.inflation, y);
          covNum += Math.min(inc, tgt)/defl; covDen += tgt/defl;
          if (ratio < minRatio) minRatio = ratio;
          if (tgt>0 && inc<tgt){ shortYears++; condShortSum += ratio; condShortCount++; }
        }
      }
      // values[] are start-of-year: also check the final end-of-year state and
      // accumulation-phase feasibility so last-year depletion isn't missed.
      if (proj.finalNetWorth<=floor || proj.infeasibleYear!=null) survived = false;
      const realEnd = (proj.finalNetWorth!=null?proj.finalNetWorth:0) / Math.pow(1+gl.inflation, nYears-1);
      endVals[p] = realEnd;
      if (survived) successes++;
      if (realFire>0){ if (realEnd>=2*realFire) largeEnd++; if (realEnd<=0.5*realFire) smallEnd++; }
      if (swr){
        shortfallYearSum += shortYears;
        fundedYearSum += (nRetYears - shortYears);
        coverage[p] = covDen>0 ? covNum/covDen : 1;   // share of lifetime budget funded (≤ 1)
        worstYr[p]  = ratioCount>0 ? minRatio : 1;
      }
    }
    const bands = {p10:[],p25:[],p50:[],p75:[],p90:[]};
    for (let y=0;y<nYears;y++){
      const arr = Array.from(byYear[y]).sort((a,b)=>a-b);
      bands.p10.push(mcPct(arr,0.10)); bands.p25.push(mcPct(arr,0.25));
      bands.p50.push(mcPct(arr,0.50)); bands.p75.push(mcPct(arr,0.75));
      bands.p90.push(mcPct(arr,0.90));
    }
    let ratioBands=null, coverageSorted=null, worstSorted=null;
    if (swr){
      ratioBands = {p10:[],p25:[],p50:[],p75:[],p90:[]};
      for (let ry=0;ry<nRetYears;ry++){
        const arr = Array.from(byRatio[ry]).sort((a,b)=>a-b);
        ratioBands.p10.push(mcPct(arr,0.10)); ratioBands.p25.push(mcPct(arr,0.25));
        ratioBands.p50.push(mcPct(arr,0.50)); ratioBands.p75.push(mcPct(arr,0.75));
        ratioBands.p90.push(mcPct(arr,0.90));
      }
      coverageSorted = Array.from(coverage).sort((a,b)=>a-b);
      worstSorted    = Array.from(worstYr).sort((a,b)=>a-b);
    }
    const endSorted = Array.from(endVals).sort((a,b)=>a-b);
    return {
      retYear: gl.baseYear+retIdx, retIdx,
      successRate: successes/N,
      // SWR income adequacy. Funded-share (income ≥ budget) is used over a
      // "≥1 short year" frequency, which saturates near 100% over a long horizon.
      // Depth: typicalCoverage is each sim's budget-capped, deflated lifetime
      // coverage (Σ min(income,budget) ÷ Σ budget) — an uncapped average would be
      // dominated by late-life surplus years, since unspent gains compound.
      fundedRate:    swr ? fundedYearSum/(N*nRetYears) : null,
      yearsBelowAvg: swr ? shortfallYearSum/N : null,
      retYearsTotal: swr ? nRetYears : null,
      typicalCoverage: swr ? mcPct(coverageSorted,0.5) : null,
      condShortDepth:  swr ? (condShortCount>0 ? condShortSum/condShortCount : 1) : null,
      worstYearP10:    swr ? mcPct(worstSorted,0.10) : null,
      coverageDist:    swr ? coverageSorted : null,
      ratioBands,
      ratioYears: swr ? Array.from({length:nRetYears},(_,k)=> gl.baseYear+retIdx+k) : null,
      largeEndPct: largeEnd/N, smallEndPct: smallEnd/N,
      medianEnd: mcPct(endSorted,0.5), p10End: mcPct(endSorted,0.10), p90End: mcPct(endSorted,0.90),
      endVals: endSorted, bands,
      years: Array.from({length:nYears}, (_,y)=> gl.baseYear+y),
    };
  });
}
