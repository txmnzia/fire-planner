---
name: engine-development
description: How to work on the pure financial engine in js/engine.js — the purity contract, the gl/sc input shapes, the anatomy of project() and computeFireTarget(), who consumes their output, and the safe-change procedure. Load before editing js/engine.js (projection loop, FIRE targets, budgets, plan-vs-actual) or reviewing such a change. Load financial-invariants alongside — it is mandatory for any financial-logic change.
---

# Engine development (js/engine.js)

Read `CLAUDE.md` (iron rules) and load the `financial-invariants` skill first — this skill
explains the *code*; that one holds the correctness rules and the pre-merge checklist.
`AUDIT.md` is the list of bugs already made once; finding IDs (F1…, T4…) below refer to it.

## The purity contract

`js/engine.js` imports **nothing** and must never touch the DOM, `window`, `localStorage`,
or the shared `state` object from `js/state.js`. Every input arrives through three plain
objects: `gl` (globals), `sc` (scenario), `opts`. Every output is the return value.
Why: the engine runs under plain Node (`node --test tests/*.test.mjs`) with zero
dependencies — that is the only automated coverage the financial math has. A single DOM
reference makes the module unloadable in Node and silently kills the entire test suite's
grip on reality (CLAUDE.md iron rule 1). If a computation needs browser data (e.g.
net-worth history), the caller passes it in — see `buildPlanProj(sc, gl, history)`,
whose `history` parameter exists precisely to keep the engine pure.

## Input shapes

Built by `getGlobals()` / `getScenario()` in `js/inputs.js` — that file is the source of
truth for units. Rates arrive **already divided by 100** (decimals); money inputs are
**monthly, in today's euros** unless noted. Never divide a `gl` rate by 100 again.

`gl` (globals):

| Field | Unit / meaning |
|---|---|
| `currentAge` | years, derived from `dob` vs `baseYear` (`currentAgeFromDOB()`) |
| `invested` | EUR, investable portfolio today (`state.ibkrTotal`) |
| `cash`, `cashReturn` | EUR reserve outside the portfolio; decimal rate p.a. |
| `lifeExp`, `baseYear` | simulation ends at age `lifeExp`; year 0 of the plan |
| `spendNow`, `spendRet` | EUR/month, today's money (pre-/post-retirement spending) |
| `inflation`, `stockRet`, `bondRet` | decimals p.a.; returns are **geometric/CAGR** |
| `stockAlloc` | decimal stock share today (`1 − bondAllocNow/100`) |
| `bondAllocRet` | decimal bond share at retirement (glide-path endpoint) |
| `taxRate` | decimal flat CGT rate, from `COUNTRY_TAX[retCountry]` (I13) |
| `gainFrac` | decimal 0–0.99, unrealized-gain share of the portfolio **today** — only the seed for cost basis (I1) |
| `pensionAmt`, `pensionAge` | EUR/month today's money (gross); age it starts |
| `windfalls` | array of `{yr, amt}` — nominal EUR landing in calendar year `yr` |
| `wdMode`, `swr` | `'fixed'` or `'swr'`; decimal withdrawal rate |
| `partnerInc`, `partnerRetAge`, `partnerPension`, `partnerPensionAge` | EUR/month; partner's own ages |
| `partnerSpendMult` | household spending multiplier when `sc.hasPartner` |
| `partnerAgeOff` | years; **partnerAge = yourAge + partnerAgeOff** (from `partnerBirthYear`, 0 if unset) |
| `propBuyYear`, `propPrice`, `propDownPct`, `propTxCostPct`, `propMortgageRate`, `propMortgageTerm`, `propRentSaved` | property model; pcts/rates are decimals; rent saved is EUR/month today's money |
| `childBirthYear`, `childCostYearly` (EUR/**year**), `childCostUntilAge`, `childMaternityMonths`, `childMaternityIncome` (EUR/month) | child model |

`sc` (one of five scenarios): `id` (1–5), `retAge`, `income` (EUR/month net, scenario
override or `baseIncome`), `chgYear`/`chgInc` (nullable income change), and the feature
flags `hasPartner`/`hasProp`/`hasChild` (from `features` in `js/state.js` — the partner/
property/child *parameters* are global; the flags decide per-scenario whether they apply).

## Anatomy of `project(sc, gl, opts)`

One loop over calendar years `loopStart..baseYear + (lifeExp − currentAge)`. Everything
keys off `t = yr − gl.baseYear`, `age = currentAge + t`, `infl = (1+inflation)^t` —
even in anchored mode, so inflation always compounds from `baseYear`.

Per-iteration, before the branch: the glide-path stock fraction `sf` and return `r`
(overridden by `opts.returnSeq[t]` when Monte Carlo injects a path — blended by `sf`,
see the `monte-carlo` skill); `gainFracAtRet` is captured from the tracked cost basis on
the first iteration with `yr >= retYear`, *before* that year's transactions; windfalls
for the year are summed; a `row` object is initialised.

**Accumulation branch (`yr < retYear`):** income = `sc.income×12×infl` (or `chgInc` from
`chgYear`), adjusted by `incomeInYear()` for parental leave (inflation-adjusted — F10),
plus partner salary while `age+off < partnerRetAge` and partner pension once
`age+off >= partnerPensionAge` (F11: always `age+off`, never `age`). Spending =
`spendNow×12×infl×(partner mult)` + child costs + property purchase/mortgage − rent
saved. `netFlow` lands on the portfolio after growth; a negative overflow drains `cashVal`
and then sets `infeasibleYear` (the I5 deficit chain — never a bare clamp). Cost basis:
positive `netFlow` and windfalls add at full value; a negative `netFlow` reduces it
proportionally to the fraction sold (I7). In anchored mode, `pastOverride()` replaces
income/spending with real history for years before `baseYear`.

**Retirement branch (`yr >= retYear`):** grows the portfolio first
(`portAfterGrowth`), recomputes `gainFracNow` from tracked basis, derives
`netFrac = 1 − gainFracNow×taxRate` (€ received per € sold). Builds the year's `budget`
(same composition as `yearOneBudget` — keep them in lockstep, I2) and `otherInc`
(state pension, partner pension, partner salary until *their* retirement — I9). Then:

- `wdMode === 'swr'`: `potentialGross = portAfterGrowth×swr` is *available*; only
  `needGross = max(0, budget−otherInc)/netFrac` is actually sold (`min` of the two, I6);
  a retirement-era property purchase is grossed up and funded regardless;
  `surplus = max(0, otherInc−budget)` is reinvested (and added to basis).
  `row.swrIncome = potentialGross×netFrac + otherInc` and `row.swrTarget = budget` are
  what Monte Carlo's funding ratio consumes.
- `wdMode === 'fixed'`: `needNet = budget + purchaseCost − otherInc`; if positive, sell
  `needNet/netFrac`; if negative the surplus is reinvested.

A `gross` exceeding `portAfterGrowth` drains cash and can set `infeasibleYear` (I5);
`fractionSold` shrinks cost basis; surplus adds to it.

**Outputs:** `years[]`, `values[]` (**start-of-year** net worth `portfolioBefore +
cashBefore`; the last year's end state exists only in `finalNetWorth` — test both, T4),
`fireNums[]` (per-year DCF targets in fixed-mode retirement, `null` elsewhere,
backfilled after the loop with `fireTarget`), `allocations[]` (stock % per year),
`rows[]` (per-year cash-flow ledger — field-by-field table in the `debugging-numbers`
skill), `retYear`, `gainFracAtRet`, `infeasibleYear`, `finalNetWorth`, and — priced
*after* the loop with `taxMultRet = 1/max(0.001, 1−gainFracAtRet×taxRate)` —
`fireTarget` (headline) and `fireTargetAdj` (SWR mode only: `otherIncomeCredit`
variant; equals `fireTarget` in fixed mode). Headline vs adjusted is a deliberate user
decision — I4; never credit future income into the headline.

**Anchored / plan-vs-actual mode:** `opts.startPort` + `opts.startYear` re-base the loop
at a past net-worth snapshot (treated as all-portfolio, cash 0) and `opts.history`
supplies real past income/spending overrides. `buildPlanProj(sc, gl, history)` wraps
this (returns `null` without a pre-`baseYear` snapshot); `planYearsAhead(planProj, gl)`
converts the plan curve into the "vs Plan" years-ahead figure (position-based on the
accumulation slope — see commit `629cc2d` for why the FIRE-line-crossing version was
scrapped).

## Anatomy of `computeFireTarget(fromAge, sc, gl, taxMult, opts)`

Returns 0 when `fromAge >= lifeExp`. `taxMult` is a **parameter**: `project()` passes
`taxMultRet` (from `gainFracAtRet`) for the headline, and the per-year `fireNums` use
that year's `gainFracNow` — the function itself never picks a gain fraction (I1).

- **SWR branch (`gl.wdMode === 'swr'`)**: `target = max(0, yearOneBudget − pensions
  already flowing at fromAge (yours, and partner's using age+off)) × taxMult / swr`.
  With `opts.otherIncomeCredit` it additionally subtracts `incomeCredit()` PVs of the
  state pension starting later, the partner pension starting later, and partner salary
  until `partnerRetAge − off` — that is the **adjusted** number only (I4).
- **DCF branch (fixed mode)**: two-period growing-annuity PV (`annuityPV`) — full
  spending until `pensionAge`, spending net of pension after — discounted at
  `rFrom = portReturnAt(gl, fromAge, sc.retAge)`, **plus** `childCostPV()` and
  `propNetPV()` (purchase + flat mortgage − inflation-growing rent saved), **minus**
  `partnerPenCredit()` (partner pension + partner salary PVs). Every flow is scaled by
  `taxMult`, credits included — income outside the portfolio replaces grossed-up
  withdrawals, so credits carry the same multiplier.

Windfalls appear nowhere here — by design (I8).

## Who consumes `project()` — change it and you change all of them

`js/recalc.js` `recalc()` runs it for all five scenarios and fans the results out to:
`renderMilestone`/`renderSummaryTiles` via `computeCardMetrics` (`js/ui/cards.js`),
`buildChart`/`buildFlowChart` (`js/ui/charts.js` — `values`, `fireTarget`, `rows`,
`retYear`), `renderTable` (`js/ui/table.js` — every `rows[]` field plus `values` and
`allocations`). `runMonteCarlo` in `js/montecarlo.js` calls it once per simulated path
(`opts.returnSeq`), and `js/ui/mcTab.js` calls it again for the reference `fireTarget`.
There is no engine change that affects "just one tab". Run the agreement-matrix grep
from `financial-invariants` before and after.

## How to make a change safely

1. **Baseline.** Run the "Quick numeric self-check" snippet from `financial-invariants`
   and record `fireTarget`, `fireTargetAdj`, `gainFracAtRet`, `finalNetWorth`,
   `infeasibleYear`, `budget`. Do it for **both** modes (verified reference values for
   the test fixtures: swr → fireTarget 1,255,587, adj 1,178,227, gainFracAtRet 0.4208,
   finalNW 1,789,149, infeasible null; fixed → fireTarget 1,039,149, finalNW 0,
   infeasible 2070 — yes, the default fixture legitimately depletes in fixed mode).
2. **Change**, keeping `yearOneBudget` and the retirement-branch `budget` in lockstep
   (I2), new flows through the deficit chain (I5) and cost basis (I7), inflation applied
   (I10), partner ages offset (I9/F11).
3. **Explain every delta.** Re-run the baseline; each number that moved must be
   explainable from the change, with rough magnitude. An unexplained move in
   `gainFracAtRet` or `budget` means a broken invariant.
4. **Tests, both modes.** Add a hand-computed expectation to `tests/engine.test.mjs`
   (fixtures `makeGl`/`makeSc` there mirror `getGlobals()`/`getScenario()`), then
   `node --test tests/*.test.mjs` and `for f in js/*.js js/ui/*.js; do node --check "$f"; done`.
5. **Run the `financial-invariants` pre-merge checklist** and update README.md's
   calculation-logic sections in the same commit (CLAUDE.md iron rule 8).
