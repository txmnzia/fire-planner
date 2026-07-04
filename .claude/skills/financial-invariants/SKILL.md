---
name: financial-invariants
description: The non-negotiable correctness rules for ALL financial logic in the FIRE planner. Load before changing anything in js/engine.js, js/montecarlo.js, js/ui/cards.js, or any code that computes FIRE targets, budgets, withdrawals, tax, income, or projections — and before reviewing such a change. Every rule here exists because its violation was a real audited bug.
---

# Financial invariants

This app produces numbers a real person uses for retirement decisions. Every invariant
below was violated at least once (see `AUDIT.md`, findings F1–F11 / T1–T8) and fixed in
v6.5. Your job is to not reintroduce them. When your change conflicts with one of these
rules, the rule wins until the user explicitly decides otherwise.

## Conventions (get these right before writing any code)

- **Units.** Form inputs are **monthly, in today's money** (`spendRet`, `pensionAmt`,
  `partnerInc`, …). Engine internals are **annual, nominal (future) euros**. The
  conversion is always `monthly × 12 × infl` where `infl = (1+gl.inflation)^t`.
  Rates in `gl` are decimals (`getGlobals()` divides by 100); never divide again.
- **Time.** `t = yr − gl.baseYear`. `age = gl.currentAge + t`. Inflation compounds from
  `baseYear`, never from an arbitrary year. Retirement year:
  `retYear = baseYear + (sc.retAge − currentAge)`.
- **Partner time.** The partner has their own age: `partnerAge = age + gl.partnerAgeOff`
  (offset derived from `partnerBirthYear`; 0 when unset). Every comparison against
  `partnerRetAge` / `partnerPensionAge` must use `age + off`, never `age` (was F11).
- **Portfolio vs cash.** `gl.invested` is the investable portfolio; `gl.cash` is a
  separate last-resort reserve earning `cashReturn`. Net worth = portfolio + cash.
  The SWR draw applies to the *invested* portfolio only.
- **`proj.values[]` are start-of-year** net worth. The end state of the final year lives
  only in `proj.finalNetWorth`. Any survival/depletion check must test **both** (was T4).
- **Return inputs are geometric (CAGR).** The deterministic tabs compound them directly;
  Monte Carlo recentering anchors the *geometric* mean multiplicatively. Never recenter
  by shifting the arithmetic mean — that compounds ~σ²/2 below the input (volatility
  drag) and silently contradicts the other tabs (was F6).

## The invariants

**I1 — Tax gross-up, always, with the right gain fraction.**
Converting a net (after-tax) need into a gross withdrawal always uses
`netFrac = 1 − gainFrac × gl.taxRate`, i.e. `gross = net / netFrac`, clamped via
`Math.max(0.001, …)`. The gain fraction is:
- inside the projection loop: `gainFracNow`, recomputed from the tracked cost basis
  each year;
- for the FIRE target, Coast number, and scenario cards: `proj.gainFracAtRet`, the
  fraction the loop tracked to the retirement year.
`gl.gainFrac` (today's value) is only ever the *seed* for the initial cost basis.
Using today's fraction for a retirement-era quantity was bugs F1, F4 and T6 —
it understates targets and overstates card income by 8–18%.

**I2 — The retirement budget is defined once.**
`yearOneBudget(fromAge, sc, gl)` in `js/engine.js` is THE definition of the annual
retirement budget: `spendRet × (partner? partnerSpendMult : 1) × 12 × infl`
`+ child costs (if dependent) + mortgage (if active) − rent saved (if bought)`, floored
at 0. The retirement branch of `project()` builds the identical composition per-year
(variable `budget`). Consumers that must agree (was F9):
- SWR FIRE target — `computeFireTarget()` SWR branch calls `yearOneBudget`;
- scenario-card / summary-tile target — `computeCardMetrics()` → `targetMonthly`;
- Monte Carlo funding-ratio denominator — `rows[].swrTarget` from `project()`.
If you add a budget component (a new cost or offset), it goes into **both**
`yearOneBudget` and the `budget` expression in `project()`'s retirement branch, in the
same commit, or the views drift apart.

**I3 — SWR mode is %-of-current-portfolio, not Bengen.**
It withdraws up to `SWR% × current portfolio` each year and by construction **cannot
deplete**. Therefore in SWR mode: no survival chips, no "success rate" headlines, no
citations of Trinity-study safety. The honest metrics are budget adequacy — the
✓ Funded / × Short chip, funding ratios, `fundedRate`, `typicalCoverage`,
`worstYearP10`. Bengen-style depletion analysis is what **Fixed mode** is for.
Mislabeling this (F3) was the single most misleading bug in the audit.

**I4 — Two FIRE numbers in SWR mode; the conservative one is the headline.**
`fireTarget` gives **zero credit** for income not yet flowing at retirement (pension
starting at 67 when retiring at 45; partner's remaining salary years). The credits
appear only in `fireTargetAdj` (`opts.otherIncomeCredit`). The headline drives the
chart line, Coast number and on-track check. Do not "fix" the headline by crediting
future income — showing both is a deliberate user decision (AUDIT.md, Resolution).

**I5 — Deficits never vanish.**
Whenever an outflow exceeds the portfolio, the overflow chain is:
portfolio → floor at 0 → draw the remainder from `cashVal` → if cash goes negative,
clamp to 0 **and set `infeasibleYear`** (first such year). Both the accumulation and
retirement branches implement this. Any new cash flow you add must flow through this
chain. Silently clamping (`Math.max(0, …)` alone) was F5 — the plan behaved as if
someone gifted the shortfall.

**I6 — Surplus income is reinvested, and only what's needed is sold.**
In retirement, other income (pensions, partner salary) beyond the budget becomes
`surplus`, is added back to the portfolio **and to cost basis**. In SWR mode the engine
sells `min(potentialGross, needGross)` — no needless realisation of taxable gains — but
the adequacy metrics (`swrIncome`) still report the **full** potential draw. Discarding
surpluses was F7.

**I7 — Cost-basis accounting.**
Contributions (positive net flow), windfalls, and reinvested surplus add to cost basis
at full value. Sales reduce it proportionally:
`costBasis ×= (1 − fractionSold)` where `fractionSold = gross / portfolioAfterGrowth`,
clamped to [0,1]. The derived gain fraction is always clamped to [0,1]. If you add any
flow into or out of the portfolio, update cost basis in the same expression — a missed
basis update corrupts every later tax calculation.

**I8 — Windfalls never reduce the FIRE target.**
They boost the projection curve (and cost basis) in their year, so the curve crosses
the target earlier — but the target itself stays windfall-free. Conservative by design;
documented in README. Don't "helpfully" credit them.

**I9 — Partner salary survives *your* retirement.**
The partner keeps earning until *their* retirement age in: the accumulation branch, the
retirement branch (`partnerSalAnn`), `swrIncome` (Monte Carlo adequacy), the scenario
card (`partnerSalMonthly`), and as a PV credit in the DCF target and the adjusted SWR
target. Dropping any one of these re-creates F2 (22 years of income vanished for the
user's real scenarios).

**I10 — Everything entered in today's money gets inflated at use.**
Including the easy-to-forget ones: maternity-leave income (was F10), rent saved, child
costs, pensions. If you introduce a new today's-money input and use it raw in a future
year, it silently shrinks by ~2%/yr.

**I11 — An input that drives a mode must be visible in that mode.**
`spendRet` drives the SWR budget, so it stays visible in SWR mode (was F8 — the entire
SWR analysis hinged on a hidden field). If your change makes an input influential in a
context where its field is hidden, unhide it or move the dependency.

**I12 — Monte Carlo reuses `project()` — never fork it.**
MC injects `opts.returnSeq` into the same engine. All planning logic changes propagate
to MC automatically; a parallel simulation would drift. MC results go stale on any
input change — `recalc()` must keep calling `markMcStale()`.

**I13 — Country tax is keyed by country code, not rate.**
`retCountry` option values are ISO-ish codes; rates come from `COUNTRY_TAX` in
`js/inputs.js`; legacy numeric saved values migrate through `LEGACY_RATE_TO_CODE` in
`applyState()`. Rates are flat-rate approximations — documented as such in README; do
not present them as authoritative tax advice (see AUDIT.md Part 4 for the known gaps:
Irish ETF exit tax, German Vorabpauschale, etc.).

## Agreement matrix — one number, many places

Before merging, confirm every consumer of the quantity you touched still agrees:

| Quantity | Single source | Consumers that must match |
|---|---|---|
| Year-one budget | `yearOneBudget()` + `budget` in `project()` ret-branch | SWR FIRE target, card `targetMonthly`, MC `swrTarget` |
| SWR income | `rows[].swrIncome` (`potentialGross×netFrac + otherInc`) | MC funding-ratio numerator; card `netMonthly` uses the same formula but on the **start-of-year** portfolio at retirement (rows use after-growth values — a known ~one-year-of-growth timing gap, documented in `debugging-numbers`, not a bug to "fix" silently) |
| Gain fraction at retirement | `proj.gainFracAtRet` | FIRE target `taxMultRet`, card `swrPortfolio`, Coast number |
| FIRE target | `proj.fireTarget` | chart FIRE line, Coast number, `fireNums[]` backfill, on-track check |
| Card metrics | `computeCardMetrics()` | scenario cards AND Results summary tiles (never duplicate — was T8) |
| Net worth path | `proj.values[]` + `proj.finalNetWorth` | chart, table, MC bands, depletion checks |

`grep -rn "yearOneBudget\|gainFracAtRet\|computeCardMetrics\|swrIncome" js/` before and
after your change; every hit is a consumer you are responsible for.

## Pre-merge checklist (run it, don't skim it)

- [ ] Ran the agreement-matrix grep; verified each consumer of the changed quantity.
- [ ] Correct gain fraction (tracked / at-retirement, not `gl.gainFrac`) everywhere new.
- [ ] New cash flows: inflation-adjusted? through the deficit chain (I5)? cost basis
      updated (I7)?
- [ ] Behaviour checked in **both** `wdMode: 'swr'` and `'fixed'`.
- [ ] Monte Carlo either unaffected or intentionally, verifiably affected (it calls the
      same `project()`).
- [ ] Added a test with a **hand-computed** expected value (see `testing-and-ci` skill),
      and `node --test tests/*.test.mjs` passes.
- [ ] README.md updated if any formula, default, or behaviour changed.
- [ ] Nothing here contradicts a documented user decision in AUDIT.md's Resolution
      section — if it does, stop and ask the user.

## Quick numeric self-check

To sanity-check any change from Node without the browser (the tests' `makeGl`/`makeSc`
in `tests/engine.test.mjs` are the reference fixtures):

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
  const p = project(sc, gl);
  console.log({fireTarget:p.fireTarget, fireTargetAdj:p.fireTargetAdj,
    gainFracAtRet:+p.gainFracAtRet.toFixed(3), finalNW:Math.round(p.finalNetWorth),
    infeasible:p.infeasibleYear, budget:Math.round(yearOneBudget(42,sc,gl))});
});"
```

Record the numbers before your change, reason about which of them *should* move and by
roughly how much, then compare after. An unexplained change in `fireTarget`,
`gainFracAtRet`, or `budget` means you broke an invariant.
