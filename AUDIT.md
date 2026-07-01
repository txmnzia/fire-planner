# FIRE Planner — Full Audit (financial logic + technical)

Audit date: 2026-07-01. Scope: `index.html` (v6.4, 2,857 lines) and `README.md`.
Line numbers refer to `index.html` at commit `2485130`.

Severity is judged against **your actual saved configuration** (the embedded
`SAM_STATE`): **SWR mode**, retire ages 42–63, life expectancy 85, partner income
€1,400/mo with `partnerRetAge = 67`, `spendNow = 3,700`, `spendRet = 3,000`,
France 30% CGT, gain fraction 27%.

---

## Part 1 — Critical financial-logic flaws

### F1. SWR-mode FIRE Number ignores capital-gains tax
`computeFireTarget()`, lines 1454–1459:

```js
if (gl.wdMode==="swr") {
  ...
  const annualFromPort = Math.max(0, spendNom - pensionOffset - partnerPenOff);
  return gl.swr>0 ? Math.round(annualFromPort/gl.swr) : 0;
}
```

The `taxMult` parameter is passed in but **never used in this branch** (the DCF
branch uses it everywhere). If you hold exactly this FIRE Number, your gross
SWR withdrawal equals your spending need — but the withdrawal is then taxed, so
you actually receive `gross × (1 − gainFrac × taxRate)`.

- At today's 27% gain fraction and France's 30% rate, the FIRE Number is
  understated by ~8.1% (1/1.088).
- At a realistic at-retirement gain fraction of 50–60% it is understated by
  15–18%.

This is internally inconsistent with the scenario card, which correctly taxes
the income side (`portfolio × SWR × (1 − gainFrac × taxRate)`, line 2149):
holding exactly the FIRE Number will show income *below* target on the card.
The Coast Number (derived from this target, line 2116) and the FIRE Target
chart line inherit the same understatement.

**Fix:** `return Math.round(annualFromPort * taxMult / gl.swr)`.

### F2. Partner income disappears the day *you* retire
`project()`: partner salary is added only in the accumulation branch
(`yr < retYear`, line 1650). The retirement branch (lines 1679+) includes state
pension and partner pension but **no partner salary**, regardless of
`partnerRetAge`.

Your saved state has `partnerRetAge = 67` while your retirement ages are
42–59. In scenario "With Tatou" (retire 45), the model throws away **22 years
of partner income (€1,400/mo, inflation-adjusted)** — while still charging the
household the full ×1.3 spending multiplier for those same years.

Consequences, all in the pessimistic direction:
- Gross withdrawals (and therefore CGT) are overstated in every partner
  scenario where the partner works past your retirement age.
- The Monte Carlo "years under budget" / funding-ratio metrics count the
  partner's salary as €0 income (`row.swrIncome`, line 1706, includes only the
  SWR draw + pensions), so budget-adequacy results are significantly worse
  than reality.
- The fixed-mode FIRE Number gives no credit for partner earnings after your
  retirement (`computeFireTarget` has a `partnerPenCredit` but no
  partner-salary credit).

The README states "Partner income stops when partner reaches `partnerRetAge`"
— the code actually stops it at `min(your retYear, partnerRetAge)`.

**Fix:** in the retirement branch, add
`if (sc.hasPartner && age < gl.partnerRetAge) partner salary offsets the
withdrawal need` (fixed mode) and add it to `swrIncome` (SWR mode); add a
matching PV credit in `computeFireTarget`.

### F3. "SWR mode" is not the Bengen/Trinity 4% rule it claims to be
The simulation withdraws `SWR% × current portfolio` **every year**
(line 1697: `gross = portAfterGrowth * gl.swr`). The classic Bengen/Trinity
rule — the research that justifies "4% is safe" — withdraws 4% of the
**retirement-date** portfolio and then adjusts that fixed amount for inflation.
These are fundamentally different strategies:

- Percent-of-portfolio can **never deplete** (the code's own MC note admits
  survival is "~100% by construction"), so the "✓ Lasts / × Depletes" chip on
  SWR scenario cards is always green and carries no information.
- The real risk of percent-of-portfolio is **income volatility**, which the MC
  funding-ratio metrics do capture — good — but the deterministic tabs and the
  README ("this is the classic Bengen/Trinity rule… The portfolio may still
  deplete if returns are poor", Assumption 11) mislabel the strategy. The 4%
  number is not evidence of safety for the strategy actually simulated, and
  historical SWR research cannot be quoted in support of it.

**Fix:** either (a) implement true Bengen withdrawals (fixed real amount set at
retirement = SWR × portfolio-at-retirement), which restores depletion risk and
makes the survival metric meaningful, or (b) keep percent-of-portfolio but
relabel it ("endowment-style % withdrawal"), remove the Lasts/Depletes chip in
SWR mode, and correct the README.

### F4. FIRE Number & Coast Number are taxed at *today's* gain fraction
`project()` line 1559–1560 and `renderMilestone` line 2111:

```js
const fireTaxMult = 1/Math.max(0.001, 1 - gl.gainFrac*gl.taxRate);
const fireAtRetirement = computeFireTarget(sc.retAge, sc, gl, fireTaxMult);
```

`gl.gainFrac` is your portfolio's gain fraction **today** (27%). After one to
three more decades of growth, the gain fraction at retirement will typically be
50–75%. The projection loop itself tracks cost basis correctly and recomputes
year-by-year targets with the true gain fraction after retirement (line
1626–1628) — but the headline FIRE Number, the Coast Number, the on-track
check, and the chart's FIRE Target line all use the too-low current figure.
Combined fixed-mode effect at France 30%: FIRE Number understated by roughly
7–12% depending on horizon.

**Fix:** project the gain fraction to retirement (the engine already computes
it — run the accumulation loop first, or approximate from expected
contributions vs growth) and build `fireTaxMult` from that.

### F5. Accumulation-phase deficits are silently written off; cash is never touched before retirement
Line 1669: `portfolio = Math.max(0, portfolio*(1+r) + netFlow + windfall)`.

If a year's net flow is more negative than the portfolio can absorb — most
plausibly the property purchase year (down payment + costs = €112,000 on the
defaults) — the excess deficit **vanishes**: the plan behaves as if someone
gifted you the shortfall. Cash & Savings is never drawn on during accumulation
(it only shrinks in retirement, line 1725), so it can't cover the gap either.
The README's claim "If the portfolio is exhausted, remaining withdrawals come
from cash savings" is true only in the retirement phase.

**Fix:** overflow negative net flow into `cashVal` first; if both hit zero,
surface an explicit "plan infeasible in year X" error instead of clamping.

### F6. Monte Carlo recentering makes MC ~1.6 pp/yr more pessimistic than the deterministic tabs
Recentering shifts each historical return so the **arithmetic** mean equals
your `stockRet` (line 1819). Verified numerically on the embedded series:

| Series (recentered) | Arithmetic mean | Compound (geometric) mean |
|---|---|---|
| Stocks → 7% | 7.00% | **5.43%** |
| Bonds → 3% | 3.00% | **2.77%** |

The deterministic tabs compound at the full 7%/3% every year (i.e., they treat
your input as a geometric mean). So the *median* Monte Carlo path grows ~1.6
pp/yr slower than the deterministic projection — a large gap over 50 years —
purely because of volatility drag (σ²/2 with σ ≈ 17%). Neither the UI nor the
README discloses which convention your 7% input is supposed to be.

This is a defensible *choice* (if your 7% is an expected/arithmetic return,
MC is right and the deterministic tabs are optimistic), but the two views must
agree. **Fix:** recenter the geometric mean instead
(`s = (1+yourMean)*(1+s)/(1+hGeoMean) - 1` or shift by geometric means), or
document explicitly that deterministic tabs assume the same return with zero
volatility and are therefore the optimistic view.

### F7. Surplus income in retirement is discarded (both modes)
- Fixed mode: when pension + partner pension exceed the spending target,
  `targetSpend` clamps at 0 (lines 1715–1717) and the surplus evaporates
  instead of being reinvested.
- SWR mode: the full `portfolio × SWR` is withdrawn even in years when the
  budget is already covered by pensions; the excess after-tax cash is assumed
  spent, never reinvested. Conversely, under-budget years never top up from
  cash. This both understates ending wealth and overstates tax paid (you
  realize gains you didn't need).

**Fix:** reinvest surplus net income (adding it to cost basis), or in SWR mode
withdraw `min(SWR draw, actual need)` as a user option.

### F8. In SWR mode, the entire budget hinges on a *hidden* input
When SWR mode is selected, the "Monthly Spending (retirement)" field is hidden
(`onWdMode()`, line 2472) — yet `spendRet` still drives everything: the SWR
FIRE Number, the scenario-card target, and the Monte Carlo budget
(`annRetSpend`, line 1607). Your saved state has `spendNow = 3,700` but
`spendRet = 3,000`; every SWR adequacy figure is anchored to the €3,000 you
cannot currently see or edit. Editing "Monthly Spending (now)" does nothing to
the retirement budget.

**Fix:** keep `spendRet` visible in SWR mode (relabeled "Retirement budget"),
since SWR mode still needs a spending target for adequacy.

### F9. SWR-mode FIRE Number ignores child costs, property, and any pension that starts after retirement
The SWR branch of `computeFireTarget` prices only
`spendRet × partnerMult − pensions-active-at-retirement`. Compare:

- Child costs: included in the card's monthly *target* (line 2164) and in the
  DCF FIRE Number, but **not** in the SWR FIRE Number.
- Mortgage/rent: in the DCF target and the MC budget, not in the SWR target.
- State/partner pension starting after your retirement age: fully ignored
  (`fromAge >= gl.pensionAge` gate, line 1455), whereas fixed mode correctly
  prices the two periods. For retire-at-45 with pension at 67, the SWR target
  gets zero credit for 18 years of pension. (Conservative — but it partially,
  and accidentally, offsets F1.)

**Fix:** size the SWR target on the same complete year-one budget the MC uses,
and decide deliberately whether future pensions should reduce it (a common
approach: subtract the PV-equivalent annuity value).

### F10. Parental-leave income is never inflation-adjusted
`incomeInYear()` line 1588: `leaveMonths * gl.childMaternityIncome` uses the
raw nominal figure, while the surrounding salary is multiplied by `infl`. With
birth year 2030 and 12 months leave (your saved values), leave-year income is
understated by ~8% (4 years of missed 2% inflation). Small, one year only.

### F11. The partner has no age of their own
`partnerRetAge` and `partnerPensionAge` are compared against **your** age
(lines 1650–1651, 1704). The model implicitly assumes your partner has the same
birth year as you. If they are e.g. 4 years older, their pension actually
starts 4 years earlier than modeled. Not documented anywhere in the UI.

---

## Part 2 — Technical bugs that corrupt numbers or state

### T1. Duplicate country `<option>` values break country persistence
Lines 605–632: values are the tax rate, and many collide — `26` (Spain,
Germany, Italy), `30` (France, Sweden, Finland), `0` (Belgium, Luxembourg,
Cyprus, Malta), `28` (Portugal, Austria), `15`/`10`/`19`/`20` likewise. State
is saved as the *value* (`collectState`), and `applyState` restores by value —
which selects the **first** matching option. Pick Germany, reload → the UI
shows Spain; pick Sweden → shows France. The numeric rate happens to survive,
but the displayed country and the "X Pension" header (`updateLabels`,
line 2500) are wrong, and any future per-country logic would silently use the
wrong country. **Fix:** use unique values (country codes) and map to rates.

### T2. The auto-computed gain fraction is not persisted and has no manual input
`ibkrGainFrac` is set only inside `handleCSV()` (line 1309). It is not in
`collectState()`/`applyState()`, so on every reload it silently reverts to the
hardcoded 27% (line 1378) even though your CSV computed a different number.
Worse, the README documents `gainFrac` as an editable input — **no such field
exists in the UI**. Tax on every withdrawal, the FIRE tax multiplier, and the
card income all depend on this invisible, non-persistent number.
**Fix:** add a visible "Unrealized gain %" input, prefill from CSV, persist it.

### T3. IBKR cost-basis parse treats every position as equity and trusts fixed column indices
`handleCSV` lines 1285–1292: `EQUITY_CATS` is defined but never used to filter
"Open Positions" rows — bond or fund positions are all summed into
`equityCostBasis` at `qty × costPrice` from hardcoded columns
(`c[5]/c[6]/c[8]/c[11]`). Any change in IBKR's statement layout shifts columns
and silently produces a wrong gain fraction (clamped to 0–99, so it may look
plausible). **Fix:** locate columns by the statement's header row, and validate
`Σ position value ≈ NAV`.

### T4. Net-worth series records start-of-year values; the final year's outcome is never checked
`values.push(portfolioBefore + cashBefore)` (line 1733) stores the position
*before* that year's growth/withdrawal. The last simulated year's end state is
never appended, so a plan or MC path that depletes during the final year still
counts as surviving, and "NW at retirement" is the value before the retirement
year's market return. Consistent, but biased one year optimistic at the
boundary. **Fix:** push a final end-of-year value after the loop.

### T5. Monte Carlo results go stale silently
`mcResults`/`mcGl` are only refreshed by pressing Run (line 1952). Change any
input afterwards and the MC cards/tiles continue showing results for the *old*
inputs right next to updated deterministic tabs, with no "stale" indicator.
**Fix:** on `recalc()`, grey out MC results or show "inputs changed — re-run".

### T6. Scenario-card SWR income uses today's gain fraction at retirement
Line 2149 (`renderMilestone`) and 2376 (`renderSummaryTiles`):
`investAtRet × swr × (1 − gl.gainFrac × gl.taxRate)` — same today-vs-retirement
gain-fraction problem as F4, here *overstating* card income (tax will be higher
than 27% of gains × 30%). The projection engine tracks basis properly; the
cards don't use it. Also note the card excludes cash from the SWR draw while
depletion/FIRE-cross checks include cash — two different portfolio definitions
on one card.

### T7. One-time restore block can clobber pre-existing user state
Lines 1142–1147: if `fire_v3_restored` is absent, the script **overwrites**
`fire_state` with the hardcoded snapshot even if a real, newer `fire_state`
already exists on that device. Any device that had saved state before this
build loses it once. **Fix:** only write the snapshot when `fire_state` is
absent.

### T8. `renderMilestone` and `renderSummaryTiles` duplicate ~60 lines of financial display logic
They have already drifted (cash handling, rounding). Any future fix (e.g., F1)
must be applied twice or the two views disagree. **Fix:** extract one
`computeCardMetrics(sc, gl, proj)` used by both.

---

## Part 3 — Security & privacy (act on these)

### S1. The GitHub token in the page source is effectively public
Lines 2558–2563: the PAT is XOR-"obfuscated" with a key stored on the adjacent
line; anyone who views source can decode it in one line of console JS. The
comment states the goal is to evade GitHub secret scanning/push protection —
which also means GitHub will never auto-revoke it for you. Anyone with the
token can read **and overwrite** the private gist holding your full financial
state, and list all your gists (`findGist` iterates them). The sync poller
will then happily import attacker-modified numbers into your planner
(`syncPoll` → `applyState`) — i.e., someone could silently distort the numbers
you make life decisions with.
**Fix:** revoke this token now; if you keep gist sync, require the token to be
pasted per-device and store it in `localStorage` only, never in the served
file.

### S2. The lock screen is cosmetic
Password `retraite` is plaintext in source (line 2763), and `loadState()` runs
on `DOMContentLoaded` regardless of lock state — the data is in the DOM/JS
behind the overlay. Fine as a privacy curtain; do not rely on it.

### S3. Personal financial data is hardcoded in the repository
`SAM_STATE` and the bootstrap block embed your DOB, income, spending, partner
details, and exact IBKR holdings (€286,780.59, VWCE/IWDA quantities) in the
page and the git history. If this repo or the deployed page is ever public,
so is all of that.

---

## Part 4 — Model assumptions worth a conscious decision (not bugs)

1. **Withdrawal/contribution timing:** all flows happen at year-end after a
   full year of growth. End-of-year withdrawals are mildly optimistic;
   end-of-year contributions mildly pessimistic. Fine, but be aware the first
   retirement year gets a full year of growth before any withdrawal.
2. **Tax model:** CGT is `withdrawal × gainFrac × rate`. Reasonable for
   France's PFU, but ignores: France's option for the progressive scale + CSG
   specifics, Ireland's 41% ETF exit-tax regime (relevant to VWCE/IWDA — the
   dropdown's 33% is the *shares* rate, not the ETF rate), Germany's
   Vorabpauschale/Teilfreistellung (effective ~18.5% for equity funds, not
   26%), and Belgium's new-from-2026 capital-gains regime (dropdown says 0%).
   Also **no income tax on pensions** — labeled "gross", material in France.
3. **Windfalls are not credited against the FIRE Number** (the README's
   inflation table implies they are). Conservative; the projection still gets
   them, so the chart crossing and the target line tell different stories.
4. **No property equity in net worth** and no appreciation — documented, but
   remember "NW at retirement" excludes what may be your largest asset, while
   the purchase cash-out *is* charged. Scenario E's NW is not comparable to
   the others' on a total-wealth basis.
5. **Pension is inflation-indexed from today** — i.e., €800/mo in today's
   money. French pension accrual actually depends on your contribution years;
   retiring at 42 would substantially reduce the real entitlement vs the
   number you'd get from a full career. Worth re-checking the €800 assumption
   under an early-retirement scenario specifically.
6. **`spendRet` should arguably not equal `spendNow` net of rent** if you
   enable Property: after the mortgage ends the model keeps crediting rent
   savings forever (correct) but the base budget never drops for the paid-off
   home — check your `spendRet` already assumes renting, else rent savings
   double-count.
7. **MC bond series is unusually strong** (arith 6.7%/yr, only 6 negative
   years in 55, nothing like 2022's real global-agg drawdown until the −13%
   entry). With recentering ON the mean is overridden, but the *low bond
   volatility* (σ≈6.9%) still flatters glide-path scenarios. The arrays are
   documented as approximate — treat bond-heavy MC results as optimistic.

---

## Part 5 — README ↔ code mismatches (documentation debt)

| README says | Code does |
|---|---|
| Tax examples: Portugal 0%, Germany 25%, Belgium 33% | Portugal 28%, Germany 26%, Belgium 0% |
| "SWR mode… classic Bengen/Trinity rule", "may deplete" | % of current portfolio; cannot deplete (F3) |
| Partner income stops at `partnerRetAge` | Stops at `min(your retirement, partnerRetAge)` (F2) |
| Windfalls adjust DCF FIRE targets | FIRE target ignores windfalls |
| SWR FIRE example subtracts pension (retiring ~age 41) | Pension subtracted only if `retAge ≥ pensionAge` |
| Cash covers shortfalls when portfolio exhausted | Only in retirement phase; accumulation deficits vanish (F5) |
| `gainFrac` is an input parameter | No UI input exists; CSV-only, not persisted (T2) |
| Defaults table (partner €4,000, partnerRetAge 45…) | Hardcoded restore state overrides with different values |

---

## What is done well (for balance)

- Cost-basis tracking through accumulation and proportional reduction on sales
  is more sophisticated than most FIRE calculators, and the *retirement loop*
  applies it correctly.
- Monte Carlo design is sound where it counts: shared paths across scenarios
  (differences reflect the plan, not sampling noise), block bootstrap
  preserving stock/bond co-movement and autocorrelation, seeded/reproducible
  RNG, and reuse of the exact `project()` engine so MC and deterministic
  logic can't diverge.
- The SWR-mode MC metrics (funding ratio frequency *and* depth) are the right
  question for a percent-of-portfolio strategy — better than a fake survival
  rate.
- Two-period pension DCF in fixed mode, mortgage priced flat (g=0) while rent
  grows with inflation, and the tax gross-up applied symmetrically to costs
  and credits in the DCF are all correct treatments.

## Suggested fix order

1. **S1** — revoke the token (do this today; independent of any code change).
2. **F1 + F9** — make the SWR FIRE Number tax- and budget-complete.
3. **F2** — partner income in retirement (biggest distortion for your saved
   scenarios).
4. **F3** — decide Bengen vs %-of-portfolio and label/simulate accordingly.
5. **F4/T6** — projected gain fraction at retirement everywhere.
6. **F8, T2, T1** — un-hide `spendRet` in SWR mode, add/persist gain-fraction
   input, unique country codes.
7. **F5, F7, F6** — cash overflow, surplus reinvestment, geometric recentering.
8. **T4, T5, T7, T8** and README corrections.
