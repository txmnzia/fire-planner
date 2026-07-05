---
name: debugging-numbers
description: Decision procedure for investigating "this number looks wrong" or "two views disagree" in the FIRE planner — reproduce in Node without the browser, trace the projection year via proj.rows[], compare consumers, and match symptoms against the catalogue of classic root causes (gain fraction, inflation, off-by-one, units, staleness). Load whenever a displayed figure is suspect, inconsistent between cards/charts/table/Monte Carlo, or changed unexpectedly.
---

# Debugging numbers

Prime directive (CLAUDE.md): **a wrong number is worse than a crash** — one real person
makes retirement decisions from this app. Second directive (AUDIT.md T8): when two views
disagree, the fix goes in the **shared source function** (`yearOneBudget`,
`computeCardMetrics`, `project`, …) — never patch the discrepancy inside one renderer.
The duplicated-display-math era already caused drift once; do not restart it.

## The decision procedure

**1. Identify the quantity.** Find it in the agreement matrix of the
`financial-invariants` skill (year-one budget, SWR income, gain fraction at retirement,
FIRE target, card metrics, net-worth path). That names its single source function and
every consumer that must agree. If it's not in the matrix, trace the on-screen value
back through `js/ui/*` until you hit an engine output or a `computeCardMetrics` field.

**2. Reproduce in Node — no browser.** The engine is pure; if the wrong number comes
from `js/engine.js` or `js/montecarlo.js` you can reproduce it headlessly. Use the
`makeGl`/`makeSc` fixtures from `tests/engine.test.mjs` (they mirror
`getGlobals()`/`getScenario()` in `js/inputs.js`), overriding only the fields that match
the user's report. The `financial-invariants` "Quick numeric self-check" snippet is the
ready-made harness. If the number reproduces here, it's engine logic; if not, the bug is
in input reading, persistence, or a renderer — go to "When the browser IS needed".

**3. Trace the specific year via `proj.rows[]`.** Index by `yr − gl.baseYear` (same
index as `values[]`, `years[]`, `fireNums[]`, `allocations[]`). Fields (all rounded
EUR/year except `cashVal`):

| Field | Meaning |
|---|---|
| `yr`, `age`, `phase` | calendar year, your age, `'acc'` or `'ret'` |
| `portReturn`, `cashReturn` | this year's growth on start-of-year portfolio / cash |
| `windfall` | lump sum landing this year |
| `income` | accumulation: total annual income incl. partner salary/pension; retirement: **partner salary only** (pensions are separate) |
| `spending` | accumulation: `spendNow`-based; retirement: `spendRet`-based (base only — child/mortgage are separate fields) |
| `netFlow` | accumulation only: income − spending − childCost − extraCost − mortgage + rentSavings |
| `pension`, `partnerPension` | state / partner pension, annual nominal |
| `withdrawal`, `taxPaid` | retirement: gross actually sold from the portfolio; `gross × gainFracNow × taxRate` |
| `childCost`, `mortgagePayment`, `rentSavings`, `extraCost` | add-on flows; `extraCost` = one-time property purchase (down payment + tx costs) |
| `cashVal` | cash at the **start** of the year (unrounded) |
| `swrIncome`, `swrTarget` | SWR-mode retirement years only: full potential draw net of tax + other income; the full annual budget. MC's funding ratio = `swrIncome/swrTarget` |

Remember: `values[i]` is **start-of-year** net worth (portfolio + cash before growth);
the final year's outcome exists only in `finalNetWorth` (T4).

**4. Compare consumers one by one.** Recompute the quantity from the engine output by
hand, then diff each consumer against it: `computeCardMetrics` (`js/ui/cards.js` — feeds
both scenario cards and summary tiles), `buildChart`/`buildFlowChart`
(`js/ui/charts.js`), `renderTable` (`js/ui/table.js`), MC tiles (`js/ui/mcTab.js`). The
first consumer that disagrees with the shared source is where the bug lives — and per
T8 the fix is to make it *consume* the source, not to adjust its local math.

## Classic root causes — symptom table

Every row was a real audited bug (IDs → AUDIT.md) or a recurring near-miss.

| Symptom | Root cause | Check |
|---|---|---|
| Target/income off by 8–18%, worse for longer horizons | Today's `gl.gainFrac` used for a retirement-era quantity (F1, F4, T6) | grep the code path for `gl.gainFrac` — only the cost-basis seed may use it; everything else uses `proj.gainFracAtRet` or in-loop `gainFracNow` |
| Value drifts ~2%/yr low vs expectation; exact in year 0 | Missing `× infl` on a today's-money input (F10, I10) | every `gl.*` money field used in year `t` needs `Math.pow(1+gl.inflation, t)` |
| Partner income/pension starts or stops in the wrong year | Compared `age` instead of `age + gl.partnerAgeOff` (F11), or partner salary dropped at *your* retirement (F2) | grep `partnerRetAge\|partnerPensionAge` — every comparison must add `off` |
| Depletion/survival wrong only in the final year; "NW at retirement" looks stale | `values[]` are start-of-year; end state only in `finalNetWorth` (T4) | any survival check must test both; retirement-year NW is pre-growth by design |
| Plan absorbs a huge outflow (e.g. €112k property year) with no warning | A bare `Math.max(0, …)` clamp swallowed a deficit instead of the cash→`infeasibleYear` chain (F5, I5) | trace the overflow: portfolio → cash → `infeasibleYear` set |
| Off by ~12× | Monthly input used as annual or vice versa | form fields are EUR/**month** (except `childCostYearly`); engine internals are EUR/**year** — the conversion is `×12` exactly once |
| Off by ~100× | Rate not divided by 100, or divided twice | `getGlobals()` already returns decimals; engine code must never `/100` |
| MC tab contradicts freshly-changed inputs | Stale cached `mcResults` (T5) | MC only recomputes on Run; `recalc()` must call `markMcStale()`; check the "Inputs changed" banner path in `js/ui/mcTab.js` |
| Output responds to a field the user can't see | Hidden input still driving the calc (F8, I11) | check `index.html` visibility toggles vs what `getGlobals()` reads — `spendRet` must stay visible in SWR mode |
| Two views differ by roughly the cash balance | One view includes `gl.cash` in "portfolio", the other doesn't | net worth = portfolio + cash; the SWR draw applies to invested only — `computeCardMetrics` subtracts `rows[iRet].cashVal` from `values[iRet]` before applying `swr` |
| Card income ≠ MC funding-ratio income by ~one year's growth | Not a bug: `rows[].swrIncome` uses the portfolio **after** that year's growth; the card uses **start-of-year** invested value | with default fixtures: card €3,035/mo vs row €3,166/mo — expected timing difference |

## Worked example — hand-verify the year-one budget and SWR card income

Default fixtures (`makeGl`/`makeSc`: retire at 42, currentAge 32 → `tFrom = 10`,
`infl = 1.02^10 = 1.21899`), no partner/prop/child. All figures below were computed by
actually running the engine.

**Budget:** `yearOneBudget(42, sc, gl) = 3000 × 12 × 1.21899 = €43,884`/yr →
card `targetMonthly = 43,884 / 12 = €3,657`.

**Card income** (reproducing `computeCardMetrics`, SWR branch): `values[10] = 1,062,850`
(start of 2036), `rows[10].cashVal = 20,890` → invested `1,041,960`;
`gainFracAtRet = 0.4208` → `netFrac = 1 − 0.4208×0.30 = 0.8738`;
`swrPortfolio = 1,041,960 × 0.04 × 0.8738 / 12 = €3,035`/mo. No pension at 42, no
partner → `netMonthly = 3,035 < 3,657` → the card honestly shows **× Short**. Verify:

```sh
node -e "
import('./js/engine.js').then(({project, yearOneBudget}) => {
  const gl = { currentAge:32, lifeExp:85, baseYear:2026, spendNow:3700, spendRet:3000,
    inflation:0.02, gainFrac:0.27, stockRet:0.07, bondRet:0.03, stockAlloc:1,
    bondAllocRet:0.4, taxRate:0.30, pensionAmt:800, pensionAge:67, cash:18000,
    cashReturn:0.015, windfalls:[], wdMode:'swr', swr:0.04, invested:286780,
    partnerInc:1400, partnerRetAge:67, partnerPension:400, partnerPensionAge:67,
    partnerSpendMult:1.3, partnerAgeOff:0, propBuyYear:2029, propPrice:400000,
    propDownPct:0.2, propTxCostPct:0.08, propMortgageRate:0.035, propMortgageTerm:25,
    propRentSaved:1200, childBirthYear:2030, childCostYearly:12000,
    childCostUntilAge:23, childMaternityMonths:12, childMaternityIncome:1800 };
  const sc = { id:1, retAge:42, income:6700, chgYear:null, chgInc:null,
    hasPartner:false, hasProp:false, hasChild:false };
  const p = project(sc, gl), i = p.retYear - gl.baseYear;
  const invest = p.values[i] - p.rows[i].cashVal;
  console.log({ budget: Math.round(yearOneBudget(42, sc, gl)),          // 43884
    targetMonthly: Math.round(yearOneBudget(42, sc, gl)/12),            // 3657
    investAtRet: Math.round(invest),                                    // 1041960
    gainFracAtRet: +p.gainFracAtRet.toFixed(4),                         // 0.4208
    netMonthly: Math.round(invest*gl.swr*(1-p.gainFracAtRet*gl.taxRate)/12), // 3035
    rowAtRet: p.rows[i] });
});"
```

Adapt the same pattern for any suspect year: print `p.rows[yr − gl.baseYear]` and
rebuild the arithmetic from the formulas in README.md ("Year-by-Year Projection").

## When the browser IS needed

Node can't reproduce bugs in **input reading** (`js/inputs.js` reading the DOM — wrong
element id, radio default, `optVal` returning null), **persistence** (`js/sync.js`,
`js/seed.js` — value resets on reload usually means a field missing from `SYNC_FIELDS`,
T2), or **rendering** (a renderer displaying the right number wrongly). Then:

1. `python3 -m http.server 8000` from the repo root (ES modules don't load over
   `file://`), open `http://localhost:8000`.
2. In the console, compare the three layers: what the form holds
   (`document.getElementById('spendRet').value`), what the engine receives — recompute
   via the modules: `const {getGlobals} = await import('./js/inputs.js');
   getGlobals()` — and what was persisted:
   `JSON.parse(localStorage.getItem('fire_state'))`. The layer where the value first
   goes wrong is the bug's home.
3. Last-computed engine outputs are kept on the shared state for inspection:
   `const {state} = await import('./js/state.js'); state.lastProjs[0].rows[10]`.
4. Remember `js/seed.js` seeds defaults only when `fire_state` is absent (T7) — clear
   it to test first-visit behaviour: `localStorage.removeItem('fire_state')`.

## Closing the investigation

Once found: fix the shared source (T8), add a regression test with a **hand-computed**
expectation to `tests/*.test.mjs`, run `node --test tests/*.test.mjs`, and walk the
`financial-invariants` pre-merge checklist. If the "wrong" number turns out to be a
documented deliberate choice (headline vs adjusted target I4, windfall-free target I8,
conservative bond caveat), do not "fix" it — point the user at the documentation.
