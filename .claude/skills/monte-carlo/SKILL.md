---
name: monte-carlo
description: How the Monte Carlo simulation in js/montecarlo.js works and how to change it safely — block bootstrap, geometric recentering, seeding, shared paths, injection into project(), and the exact definitions of the fixed-mode survival and SWR-mode adequacy metrics. Load before editing js/montecarlo.js, js/ui/mcTab.js, or any MC metric, chart, or tile — and before "simplifying" any metric definition.
---

# Monte Carlo (js/montecarlo.js)

Load `financial-invariants` alongside (I3, I6, I12 govern this module). The README's
"Monte Carlo Simulation" section is the user-facing spec; keep it in sync. `AUDIT.md`
finding F6 and commit `629cc2d` are the two recorded MC mistakes — both are explained
below so you don't remake them.

## Design: historical block bootstrap — and why

`mcBuildPath()` builds each simulated path by stitching **random blocks of consecutive
real historical years** (default block length 5, wrapping at the dataset end) instead of
drawing from a synthetic bell curve. Two properties this buys, both load-bearing:

1. **Consecutive years preserve real short-run dynamics** — momentum, volatility
   clustering, and crash-then-recovery sequencing (1973–74, 2000–02, 2008, 2022). A
   normal-i.i.d. draw understates crashes and destroys sequence-of-returns risk, which
   is the entire point of the simulation.
2. **Stock and bond are always sampled from the same historical year** (`idx` indexes
   both arrays), so their real co-movement/correlation is preserved with no correlation
   model at all.

Do not replace this with independent per-asset or per-year draws without an explicit
user decision — you would be deleting the correlation and clustering structure silently.

## The embedded history

`MC_HIST_STOCK` / `MC_HIST_BOND` (with `MC_HIST_START_YEAR = 1970`) are **approximate**
annual total returns, 1970–2024, MSCI World + a global government-bond proxy, compiled
to reproduce realistic dynamics rather than exact index levels (documented in the file
header and README). Hard constraints if you touch them:

- The two arrays must stay **aligned by year and equal in length** — the same-year
  sampling above depends on it. `tests/montecarlo.test.mjs` asserts equal length.
- **Known caveat (AUDIT.md Part 4, item 7):** the bond series is unusually strong
  (arithmetic ~6.7%/yr, only 6 negative years in 55) and low-volatility (σ≈6.9%).
  Recentering overrides its mean, but the low volatility still flatters bond-heavy /
  glide-path results. Treat bond-heavy MC output as optimistic; disclose, don't hide.

## Geometric recentering (default ON) — the F6 lesson

With recentering, each sampled return is shifted **multiplicatively, anchored on
geometric means** (in `mcBuildPath`):

```
1 + r' = (1 + userMean) × (1 + r_hist) / (1 + histGeoMean)
```

where `histGeoMean` comes from `mcGeoMean()` and `userMean` is `gl.stockRet` /
`gl.bondRet`. Result: history's shape (volatility, fat tails, sequencing) is kept while
the long-run **compound** return of the paths matches the user's inputs — which is
exactly how the deterministic tabs interpret those inputs (they compound them directly;
invariants skill, "Return inputs are geometric").

**Arithmetic recentering is forbidden** (was F6): shifting the arithmetic mean makes the
median path compound roughly σ²/2 below the input — volatility drag, ~1.6 pp/yr at
σ≈17% — so MC silently contradicts every other tab by a huge margin over 50 years. If
you ever change this formula, re-run the recentering test in `tests/montecarlo.test.mjs`
(path geo-mean ≈ user input) and re-read AUDIT.md F6 first.

## Seeding and reproducibility

`mulberry32(seed)` is the only randomness source. `runMonteCarlo` seeds it with
`cfg.seed`, defaulting to `0x1F1E33` when unset — and the UI (`runMonteCarloUI` in
`js/ui/mcTab.js`) never sets a seed, so **identical inputs give identical results
across button presses**. This is deliberate: the user must not see numbers jitter when
nothing changed. Tests rely on explicit seeds for determinism. Never fall back to
`Math.random()` anywhere in this module.

## Shared paths and engine reuse — the two structural rules

- **One set of paths, all scenarios.** `runMonteCarlo` builds `paths[]` once, then maps
  over scenarios reusing the same array. Differences between scenario results therefore
  reflect the *plan*, never sampling noise. Giving each scenario independent draws would
  make A-vs-B comparisons meaningless — do not "parallelise" this away.
- **Never fork the engine (I12).** Each path is fed into the real
  `project(sc, gl, { returnSeq: path })`. Inside `project()` (js/engine.js) the drawn
  `{stock, bond}` pair for year-offset `t` is blended by that year's glide-path stock
  fraction: `r = sf×seq[t].stock + (1−sf)×seq[t].bond`. All tax, budget, pension,
  partner, property and deficit logic is the deterministic engine's own — a change to
  `project()` changes MC automatically, and a parallel MC simulation would drift.
  Inflation stays deterministic (the user's input) by design in this version.

## The two metric families — exact definitions (do not "simplify")

`runMonteCarlo(scenarios, gl, cfg)` (cfg: `sims`, `blockLen`, `recenter`, optional
`floor` and `seed`) branches on `gl.wdMode`. The two modes fail in different ways, so
they get different metrics (I3). A metric that looks redundant here usually replaced a
broken one — check before removing.

**Fixed mode — true depletion risk.** `successRate` counts a path as failed if ANY of:
a start-of-year `values[y] <= floor` for `y >= retIdx`, **or** `finalNetWorth <= floor`
(because `values[]` are start-of-year the last year's outcome is invisible in them —
T4), **or** `proj.infeasibleYear != null` (accumulation-phase infeasibility counts as
failure — F5). Ending wealth is reported **real** (deflated by `(1+inflation)^t`):
`medianEnd`/`p10End`/`p90End`, plus `largeEndPct`/`smallEndPct` = share of paths ending
≥2× / ≤½ that path's own real value at retirement.

**SWR mode — budget adequacy.** The portfolio cannot deplete by construction, so
survival is ~100% and must never be headlined (I3; `successRate` is still computed —
ignore it in this mode). Everything keys off the per-retirement-year funding ratio
`rows[y].swrIncome / rows[y].swrTarget` from the engine — note the numerator is the
**full potential draw** net of tax plus other income, even though the engine only sells
what the budget needs (I6). Per scenario:

| Metric | Definition (exact) |
|---|---|
| `fundedRate` | share of all retirement path-years with income ≥ budget (`fundedYearSum/(N×nRetYears)`). Card headline. Chosen over "% of sims with ≥1 short year", which saturates near 100% over multi-decade retirements. |
| `yearsBelowAvg` | average count of under-budget retirement years per sim (shown as `X / retYearsTotal`) |
| `typicalCoverage` | median across sims of each sim's **budget-capped, deflated** lifetime coverage: `Σ min(income, budget)/(1+infl)^y ÷ Σ budget/(1+infl)^y` over retirement years. Capping means surplus years cannot buy back shortfall years; deflating weighs every retirement year equally in real terms. |
| `condShortDepth` | mean funding ratio over under-budget years only ("when short, you fund X%") |
| `worstYearP10` | 10th percentile across sims of each sim's single leanest year's ratio |
| `ratioBands`/`ratioYears`, `coverageDist` | funding-ratio fan-chart percentiles per retirement year; sorted per-sim coverage for the histogram |

**Why typicalCoverage is capped + deflated — the v6.6 lesson (commit `629cc2d`).** After
v6.5 made the engine reinvest surpluses (F7 fix), lucky paths snowball: late-life
funding ratios reach 5–20× budget, and an *uncapped* average across years was dominated
by them — headline figures like "561% funded" that said nothing about whether lean early
years paid the bills. The same commit replaced the saturating "≥1 short year" frequency
with `fundedRate` and the exploding FIRE-line-crossing "vs Plan" with a position-based
one. The pattern to internalise: **a metric must be bounded and must not saturate over
the horizon it summarises**. If you add a metric, check both properties; if you are
tempted to replace `min(inc,tgt)` with `inc` or drop the deflator because it "looks
simpler", you are re-creating the v6.6 bug.

## Staleness and the UI boundary

MC runs only when the user presses Run (`runMonteCarloUI` in `js/ui/mcTab.js`, which
reads fresh `getGlobals()`/`getScenario()` and attaches the deterministic `fireTarget`
per scenario for the reference line). Results are cached in module-private `mcResults`/
`mcGl`, so any later input change makes them wrong for the screen: `recalc()` in
`js/recalc.js` must keep calling `markMcStale()` (dims `.mc-body`, sets "Inputs changed —
press Run to refresh"). Was T5. If you add a new code path that changes inputs without
going through `recalc()`, it must mark MC stale too.

## Validating a change

1. `node --test tests/*.test.mjs` — covers array alignment, PRNG reproducibility,
   recentering convergence, seed determinism, band ordering, and mode-gating of metrics.
2. **Convergence check** (run from repo root; verified): metrics must stabilise as sims
   grow — with the engine-test fixture globals (`makeGl` in `tests/montecarlo.test.mjs`)
   and `blockLen:5, recenter:true, seed:42`, `fundedRate` came out 0.332 / 0.345 /
   0.340 / 0.348 and `typicalCoverage` 0.796 / 0.809 / 0.809 / 0.816 at 500/1000/2000/
   4000 sims. Drift beyond ~2 pp between 2000 and 4000 sims, or a metric trending
   monotonically with N, means an unstable definition:

```sh
node -e "
import('./js/montecarlo.js').then(({runMonteCarlo}) => {
  const gl = { currentAge:32, lifeExp:85, baseYear:2026, spendNow:3700, spendRet:3000,
    inflation:0.02, gainFrac:0.27, stockRet:0.07, bondRet:0.03, stockAlloc:1,
    bondAllocRet:0.4, taxRate:0.30, pensionAmt:800, pensionAge:67, cash:18000,
    cashReturn:0.015, windfalls:[], wdMode:'swr', swr:0.04, invested:286780,
    partnerInc:1400, partnerRetAge:67, partnerPension:400, partnerPensionAge:67,
    partnerSpendMult:1.3, partnerAgeOff:0, propBuyYear:2029, propPrice:400000,
    propDownPct:0.2, propTxCostPct:0.08, propMortgageRate:0.035, propMortgageTerm:25,
    propRentSaved:1200, childBirthYear:2030, childCostYearly:12000,
    childCostUntilAge:23, childMaternityMonths:12, childMaternityIncome:1800 };
  const scenarios=[{id:1,retAge:42,income:6700,chgYear:null,chgInc:null,
    hasPartner:false,hasProp:false,hasChild:false}];
  for (const sims of [500,1000,2000,4000]) {
    const [r]=runMonteCarlo(scenarios,gl,{sims,blockLen:5,recenter:true,seed:42});
    console.log(sims,'fundedRate',+r.fundedRate.toFixed(3),
      'typicalCoverage',+r.typicalCoverage.toFixed(3),
      'worstYearP10',+r.worstYearP10.toFixed(3),'medianEnd',Math.round(r.medianEnd));
  }
});"
```

3. Recentering sanity: a very long recentered path's geo-means must approach the inputs
   (verified: 20,000-year path, seed 7 → stock 0.0676 vs 0.07, bond 0.0299 vs 0.03;
   raw history geo-means are 0.0938 / 0.0651).
4. Cross-view consistency: with recentering ON, the MC median band at retirement should
   sit near the deterministic curve (same compounding assumption). A systematic gap
   means F6 is back.
