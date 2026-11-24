# FIRE Planner — Calculation Logic & Documentation

A browser-based, zero-build **Financial Independence / Retire Early** calculator. Plain HTML/CSS + native ES modules — no bundler, no backend, no dependencies beyond Chart.js (loaded from CDN). The financial engine is pure JavaScript in `js/engine.js` / `js/montecarlo.js`, unit-tested in CI; see [ARCHITECTURE.md](ARCHITECTURE.md) for the module layout.

---

## Table of Contents

1. [Overview](#overview)
2. [Input Parameters](#input-parameters)
3. [Withdrawal Modes](#withdrawal-modes)
4. [FIRE Number Calculation](#fire-number-calculation)
5. [Year-by-Year Projection](#year-by-year-projection)
6. [Inflation Adjustments](#inflation-adjustments)
7. [Capital Gains Tax Model](#capital-gains-tax-model)
8. [Portfolio Return & Glide Path](#portfolio-return--glide-path)
9. [Coast Number](#coast-number)
10. [Scenarios Tab and Result Tiles](#scenarios-tab-and-result-tiles)
11. [Partner Model](#partner-model)
12. [Child Cost Model](#child-cost-model)
13. [Property Model](#property-model)
14. [Pension / State Pension](#pension--state-pension)
15. [Windfalls](#windfalls)
16. [Income Change (Barista FIRE)](#income-change-barista-fire)
17. [The 5 Default Scenarios](#the-5-default-scenarios)
18. [Monte Carlo Simulation](#monte-carlo-simulation)
19. [Assumptions & Limitations](#assumptions--limitations)

---

## Overview

The planner runs a **year-by-year simulation** from today until your life expectancy, tracking portfolio growth, withdrawals, income, spending, and all add-ons (partner, child, property). It supports two output modes:

| Mode | What it answers |
|------|----------------|
| **Fixed Amount** | "How large does my portfolio need to be to sustain €X/month (real) until life expectancy?" — Bengen-style fixed real withdrawals, depletion possible |
| **% of Portfolio (SWR)** | "If up to 4% of my *current* portfolio is withdrawn each year, does that income cover my budget?" — adaptive income, cannot deplete; risk = income variability |

Five parallel scenarios (A–E) are computed simultaneously for side-by-side comparison.

An in-app **Explanation** tab (5th tab) turns a chosen scenario into a plain-language story. It opens with a one-sentence lede and headline stat tiles (retirement age, the monthly budget in **today's money** next to what the household spends now, and the funded / lasts-until verdict), then draws the journey on a **visual timeline** — phase segments (Building → Bridge years → Pension years) with every life event marked on it. Each phase gets a "chapter" card: a lifestyle meter comparing the phase's monthly budget (deflated to today's €) against current spending, a funding-mix bar (portfolio draw / pensions / partner salary, same colours as the Revenue & Costs chart), portfolio start/end figures, and a chronological list of everything that changes in that phase (coast point, salary change, home purchase and mortgage payoff, child costs starting/ending, partner retirement and pensions, windfalls, depletion). A final section grounds the FIRE jargon in the scenario's own arithmetic — the FIRE number decomposed step by step, the SWR as a pot→monthly-income ladder, the coast number vs today's balance, a first retirement year replayed with a −30% crash, the same lifestyle priced at three future dates, and the tax gross-up on selling. Life-event impacts are quantified by re-running the engine with the feature off and diffing; all other figures come from the same `computeCardMetrics()` source as the scenario cards and the engine's own per-year rows — the tab never re-derives a number, and converting a nominal figure to today's € is one shared display helper. Only the withdrawal strategy in use is shown (funded-vs-short framing in % mode, survival framing in fixed mode).

---

## Input Parameters

### Defaults and first visit

No personal data ships with the app. On a device with no saved state the
personal fields start **empty** (a dash below; the value in brackets is what an
empty field computes as). Only market and model assumptions have defaults.
Your real values come from localStorage, or from Supabase once you sign in.

### Your Portfolio

**Check-in (v8.10).** Importing an IBKR activity statement sets the investments, the
unrealised gain %, the **as-of date** (statement period end) and the period's deposits
(`js/ibkr.js`, pure). Each check-in is kept (`ibkr.imports`, last 24): the next one shows
the change since the last, split into *added* (the statement's Deposits & Withdrawals,
only when its period starts at the previous check-in) and *markets*. Warnings: a statement
ending more than 31 days ago, a total more than 25% from the last one. Without a file, a
typed total and date can be used (gain % not refreshed). The date turns red after 3 months.
Under Spending, deposits per month over the last 6 months of statements are compared with
*You really invest*; a gap over 20% is flagged.

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Cash & Savings | `cash` | — (0) | EUR | Earns `cashReturn`, not invested in stocks/bonds |
| Cash Interest Rate | `cashReturn` | 1% | % p.a. | Applied to cash portion only |
| Investable Portfolio | `ibkrTotal` | — | EUR | Loaded from IBKR/broker sync or manual entry |

### About You

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Date of Birth | `dob` | — (age 30) | date | Current age derived from today's date |
| Life Expectancy | `lifeExp` | 100 | years | Simulation ends at this age |
| Plan Start Year | `baseYear` | 2026 | year | Year 0 for all projections |

### Income & Spending

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Monthly Income (net) | `baseIncome` | — (0) | EUR/month | Your take-home income today |
| Rent today / month | `propRentSaved` | — (0) | EUR/month | Part of the joint account; a scenario that buys stops paying it from the purchase year |
| Your own spending / month | `samPersonalNow` | — (0) | EUR/month | Spending (v8.8). Personal spending only, without your transfer to the joint account |
| You pay into joint / month | `samPaysIn` | — (0) | EUR/month | Spending (v8.8). Your monthly transfer to the joint account |
| She pays in / month | `partnerPaysIn` | — (0) | EUR/month | Spending. Her monthly transfer. Joint total = `samPaysIn + partnerPaysIn` |
| Yearly items / year | `yearlyItems` | — (0) | EUR/year | Spending. Trips, courses, gifts: **shared**, split by her share, now and in retirement |
| Spending in retirement | `retSpendChange` | 0% | % | One change on all spending once you stop (own, joint, yearly items, costs if alone); −50 to +50 |
| (last refresh) | `spendUpdated` | — | date | Stamped when one of the four numbers is edited; red after 6 months |
| Withdrawal Rate | `swr` | 4% | % | %-of-portfolio mode only; % of the current portfolio available annually |

### Market Assumptions

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Stock Return (annual) | `stockRet` | 7% | % p.a. | Nominal (before inflation), after fees |
| Bond Return (annual) | `bondRet` | 3% | % p.a. | Nominal, after fees |
| Inflation | `inflation` | 2% | % p.a. | Applied to all spending and income |
| Bond Allocation (today) | `bondAllocNow` | 0% | % | Current bond share; stock = 100% − bonds |
| Bond Allocation (at retirement) | `bondAllocRet` | 40% | % | Target bond share at retirement |

The Markets card lists the assumptions you changed from these defaults, and **Reset to defaults** puts them all back (`js/assumptions.js`, v8.9).

### Where you live (v8.11)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Country today | `retCountry` | France | — | Where you live now (country code). Its preset rate applies until a planned move |
| Tax on gains today | `taxNow` | preset | % | Optional override of today's preset |
| Planned moves | `state.residence` `[{from, country, tax, col}]` | none | year, code, %, % | From a year: the country's preset tax rate (or your override) and a cost of living in % of today (100 = same) |
| Planned rent changes | `state.rentMoves` `[{from, rent}]` | none | year, EUR/month | Replaces the rent today from that year (Income & spending) |

**Per year.** `taxRateAt(gl, yr)` is the rate where you live in year `yr`: every sale in
the projection, the tax gross-up at retirement, and the fixed-mode target's year-by-year
gross-up (`tmAt`) use it. `colAt(gl, yr)` scales all spending **except housing** (rent,
mortgage) and child costs. Presets (`js/taxTable.js`) are flat rates on the gain part of a
sale; Germany is **18.5%** since v8.11 (26.375% on 70% of the gain: equity funds are 30%
tax-free), France 30% (PFU). Each country's note (`js/countries.js`) says what is not
modelled.

**Rent.** Rent today (`propRentSaved`) is part of the joint account (`rentInJoint`): the
joint costs in year `yr` are `(joint − rent today) × col + rentAt(yr)`, and buying saves
whatever rent applies that year (living alone: 70% of it, the share inside the "if alone"
costs). The retirement % change applies to everything but rent. Editing rent today moves
the two joint transfers by the same amount, split like today's (only for a change, not a
first entry).
| Unrealized Gain Fraction | `gainFrac` | 25% | % | % of your portfolio that is capital gain today; auto-filled from IBKR CSV import, editable & synced |

### Future Income

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| German pension / month | `pensionAmt` | — (0) | EUR/month | Gross, as printed on the statement (v8.9: one row per country) |
| German pension age | `pensionAge` | 67 | years | Legal age; change only to defer |
| French pension / month | `pension2Amt` | — (0) | EUR/month | Gross, as printed (basic + Agirc-Arrco); empty = no rights in France |
| French pension age | `pension2Age` | 64 | years | Legal age; change only to defer |
| (last statement) | `pensionUpdated` | — | date | Stamped when a pension amount is edited; red after 12 months |
| Windfalls (Year, Amount, Used in) | `state.windfalls` `[{yr,amt,off}]` | none | year, EUR, scenario ids | One-time lump-sum inflows on the **Plans** tab (v8.4); each has an A–E switch per scenario, also shown as a row in the scenario grid. `off` lists the scenarios it is switched off for; absent = on everywhere, so windfalls saved before v8.4 keep applying to every scenario (legacy `wf0/1/2` fields auto-migrate) |

### Partner (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Her take-home / month | `partnerInc` | — (0) | EUR/month | Sets her share of shared costs once one of you stops working (or your pay changes). Never added to your income |
| Age she stops working | `partnerRetAge` | 45 | years | Her age; her salary stops then |
| Her year of birth | `partnerBirthYear` | — (same as you) | year | Optional; shifts when her stop and pension ages are reached |
| Her pension / month | `partnerPension` | — (0) | EUR/month | From her pension age |
| Her pension age | `partnerPensionAge` | 67 | years | |

Removed in v8.8 (still carried in saved payloads, never read): `spendNow`, `spendRet`,
`partnerModel`, `partnerSpendMult`, `sharedNow` (now the sum of the two transfers),
`sharedRet`, `samPersonalRet`, `soloShared` (always derived), `partnerPersonal`,
`partnerPortfolio`, `partnerGainFrac`, `shareMin`, `shareMax`. Older payloads are mapped
once by `js/spendMigration.js` (see [Partner Model](#partner-model)).

### Property (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Purchase Year | `propBuyYear` | 2029 | year | Year of purchase |
| Purchase Price | `propPrice` | — (0) | EUR | Total property price |
| Down Payment | `propDownPct` | 20% | % | % of price paid up front |
| Buying costs | `propTxCostPct` | country default | % | Transfer tax, notary, land registry, agent. Empty = default of the country you live in that purchase year (Germany 10%, France 8%, elsewhere 8%; `buyCostPreset`) |
| Mortgage Rate | `propMortgageRate` | 3.5% | % p.a. | Rate while it is fixed |
| Rate fixed for | `propFixedYears` | whole loan | years | v8.13. Empty = fixed for the whole loan |
| Rate after | `propRateAfter` | same | % p.a. | v8.13. Rate on the balance left after the fixed period, same end date |
| Ownership charges + upkeep | `propCharges` | — (0) | EUR/month | v8.13. From the purchase year, for good, inflation-indexed; shared like the joint costs. Empty while a scenario buys → banner warning |
| Her share of down payment + costs | `propHerShare` | 0% | % | v8.13. Paid from her savings in scenarios with her |
| Mortgage Term | `propMortgageTerm` | 25 | years | Amortization period |
| Rent today (Housing tile) | `propRentSaved` | — (0) | EUR/month | The rent you pay now (inside the joint account). Entered once; a scenario that buys stops paying whatever rent applies from the purchase year. Empty while a scenario buys → banner warning |

**How buying counts (v8.13).** `mortgageSchedule` gives the payment while the rate is
fixed and, with a rate after, the payment on the balance left over the remaining years
(`mortgagePaymentAt(gl, yr)`; still a cost that ends, set aside at PV in % mode).
Ownership charges are a lifelong housing cost (`ownershipAnnual`; not scaled by cost of
living). Your part of the down payment and buying costs is `purchaseCostFor` (minus her
share with her). The grid's **Home equity when you stop** row = price growing with
inflation from the purchase year minus the loan left (`homeEquityAt`); it is part of your
net worth, never of the FIRE number.

### Child (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Birth Year | `childBirthYear` | 2027 | year | Child's year of birth |
| Annual Child Cost | `childCostYearly` | — (0) | EUR/year | Total out-of-pocket cost per year |
| Dependent Until Age | `childCostUntilAge` | 25 | years | Costs apply from birth until this child age |
| Parental Leave (months) | `childMaternityMonths` | — (0) | months | Months of reduced income in birth year |
| Income During Leave | `childMaternityIncome` | — (0) | EUR/month | Your income during those leave months |
| Her parental leave | `partnerLeaveMonths` | — (0) | months | v8.12: her months on leave in the birth year (max 12) |
| Her income during leave | `partnerLeaveIncome` | — (0) | EUR/month | Her net leave pay those months |

**Her leave moves the split (v8.12).** In the birth year, in scenarios with the child,
her salary is `partnerInc × (12 − m) + partnerLeaveIncome × m` (inflated), and the split
that year follows both incomes (pro rata) instead of what she pays in today, like your
own leave (`partnerIncomeAt(yr, gl, draw, sc)`, `twoPersonCost`).

---

## Withdrawal Modes

### Fixed Amount Mode (`wdMode = "fixed"`)

You specify **monthly spending in retirement** (`spendRet`). The calculator computes how large your portfolio must be to fund that spending from retirement age until life expectancy, accounting for:

- Inflation growth of spending
- State pension reducing the required portfolio draw
- Partner pension (if enabled)
- Capital gains tax on withdrawals
- Child costs that continue into retirement (if enabled)
- Property mortgage / rent savings (if enabled)

### % of Portfolio Mode (`wdMode = "swr"`)

You specify a **withdrawal rate** (e.g., 4%). Each retirement year, `SWR% × current
portfolio` is *available* for withdrawal; the engine actually sells only what the
year's budget needs after other income (pensions, partner salary, rent savings), so
gains are not realised — and taxed — unnecessarily. Income beyond the budget from
pensions/partner salary is reinvested.

> **Important:** this is a **%-of-current-portfolio strategy**, *not* the classic
> Bengen/Trinity "4% rule" (which withdraws 4% of the *retirement-date* portfolio
> and then inflation-adjusts that fixed amount). A %-of-portfolio draw can never
> fully deplete the portfolio — its risk shows up as **income variability**
> instead. That is why the scenario cards headline **budget adequacy**
> (✓ Funded / × Short) rather than a survival chip, and why the Monte Carlo tab
> reports funding ratios in this mode. For Bengen-style fixed-real withdrawals
> with genuine depletion risk, use **Fixed Amount** mode.

The scenario card compares your **effective monthly income** at retirement
(after capital-gains tax, plus pensions and partner salary where active) with the
**lifelong part of the year-one budget** (spending × partner multiplier − rent
saved, inflation-adjusted). Since v8.2, costs that end (child costs, mortgage
payments) are not part of that comparison: they are covered by a set-aside (see
"Costs that end" below), so the SWR income is computed on the portfolio minus
that set-aside.

---

## FIRE Number Calculation

### % of Portfolio Mode Formula

Two numbers are computed; the **conservative** one is the headline (chart line,
Coast Number, on-track check), the **adjusted** one is shown alongside it on the
scenario card.

```
Year-One Budget = Retirement Spending × partnerMult
                + Child Costs (if dependent at retirement)
                + Mortgage (if active at retirement) − Rent Saved
                                    ...all inflation-adjusted to retirement date

Lifelong Budget = Year-One Budget − costs that end in that year (child, mortgage)
Set-aside       = Σ over the remaining years of (child costs + mortgage payments)
                  × TaxMult / (1 + r)^(k+1)          r = portfolio return at retirement

FIRE Number (headline) = max(0, Lifelong Budget − pensions already flowing at retirement)
                         × TaxMult / SWR rate  +  Set-aside

FIRE Number (adjusted) = headline − PV(state pension starting later)
                                  − PV(partner pension starting later)
                                  − PV(partner salary until partner retires)
```

**Costs that end (v8.2).** Child costs and mortgage payments stop at a known
year. Until v8.2 the headline priced the whole year-one budget × 1/SWR, so a
mortgage with one year left counted as a cost for life (×25 at 4%) and the FIRE
number fell off a cliff the year it ended (a scenario could not be funded until
the payoff year, then showed a margin of several hundred thousand). Now only the
lifelong part gets the SWR multiple and the costs that end are **set aside at
their present value over their remaining years** (`tempCostPV()` in
`js/engine.js`; your share of them with a partner). The projection pays
them **in full** on top of the capped SWR draw (`rows[].tempCost`), so in % mode
the portfolio *can* now run short during those years if it was too small; that
flows through the usual deficit chain (`infeasibleYear`). Fixed mode is unchanged (its DCF already prices every year).

`TaxMult = 1 / (1 − gainFrac_at_retirement × taxRate)` grosses the target up so
that the **after-tax** proceeds of the SWR draw cover the budget — a portfolio
equal to the target really delivers the budget, net of capital-gains tax. The
gain fraction used is the one the projection **tracks to your retirement date**,
not today's.

The headline deliberately gives **no credit** for income that hasn't started yet
(pensions at 67 when you retire at 45, or a partner's remaining working years) —
those appear only in the adjusted number, so you can see both the safe target
and the realistic one.

**Example:** Retire in 10 years, spend €2,500/month, pension €700/month starting
at 67 (i.e. *after* retirement), 2% inflation, 4% SWR, 30% tax on a 50% gain
fraction at retirement (TaxMult ≈ 1.176):
- Inflated budget: €2,500 × 1.02¹⁰ × 12 = €36,570/year
- Headline FIRE Number: €36,570 × 1.176 / 0.04 = **€1,075,000** (pension not yet flowing → no offset)
- Adjusted FIRE Number: headline − PV(pension from 67) — shown as the secondary figure

### Fixed Amount (DCF) Mode Formula

Uses present-value annuity calculations. The FIRE number equals the portfolio needed to fund all future net cash flows, discounted at the portfolio return rate:

```
FIRE Number = PV(spending, pre-pension) + PV(spending - pension, post-pension)
            + PV(child costs)
            + PV(property net costs)
            − PV(partner pension credit)
            − PV(partner salary credit, until partner's retirement age)
```

**Since v8.5 the sum is taken year by year**, because the tax gross-up is not
constant. Selling proportionally keeps the portfolio's gain fraction, but every
year of growth on what remains adds gain with no cost basis, so a sale k years
into retirement is taxed on a larger share:

```
g(k)       = 1 − (1 − g_ret) / (1 + r)^(k+1)          g_ret = gain fraction at retirement
TaxMult(k) = 1 / (1 − g(k) × taxRate)                (taxMultAfter() in js/engine.js)
FIRE Number = Σ_k  net cash need(k) × TaxMult(k) / (1 + r)^(k+1)  (+ purchase in retirement)
```

The old constant `TaxMult(g_ret)` understated the target: in the 192-household test
set, 96 stop ages looked funded (net worth up to 14.7% above the target) and still
ran out of money; with the rising gain fraction none does beyond a 2% margin. With
the tax held flat the year-by-year sum equals the closed form below to the euro
(tested). The fixed-mode target with a partner uses the same rising gross-up.

The **annuity PV formula** (the pre-v8.5 closed form, kept for that equivalence test) is:

```
PV(C, r, g, n) = C × [1 − ((1+g)/(1+r))^n] / (r − g)
```

Where:
- `C` = initial annual cash flow
- `r` = portfolio discount rate (from glide path at retirement age)
- `g` = inflation rate (spending grows with inflation)
- `n` = number of years

**Tax multiplier** is applied to all spending to convert after-tax needs to pre-tax withdrawal amounts:

```
Tax Multiplier = 1 / (1 − gainFrac_at_retirement × taxRate)
```

This accounts for the fact that withdrawals trigger capital gains tax on the gain
portion. The gain fraction is the one the projection **tracks to your retirement
date** (contributions raise cost basis, growth raises the gain share), which is
typically far higher than today's — using today's would understate the target.

---

## Year-by-Year Projection

Each year of the simulation computes:

### Accumulation Phase (before retirement)

```
Net Flow = Income − Spending − Child Costs − Mortgage + Rent Savings − Purchase Costs
Portfolio(t+1) = Portfolio(t) × (1 + r(age)) + Net Flow + Windfall
```

Income includes:
- Your salary (inflation-adjusted, with optional income change)
- Partner income (inflation-adjusted, until the *partner* retires — this continues
  into your own retirement if the partner works longer; set `partnerBirthYear`
  if your partner's age differs from yours)
- Partner pension (once partner reaches pension age)
- Parental leave income adjustment in child's birth year (inflation-adjusted)

If a year's deficit exceeds the portfolio (e.g. a property down payment), the
remainder is drawn from **cash savings**; if cash runs out too, the scenario card
shows an **⚠ Underfunded** warning for that year instead of silently writing the
shortfall off.

Spending includes:
- `spendNow × inflation × partnerMult` (if partner enabled)
- Child costs (inflation-adjusted, for child years 0 to `childCostUntilAge`)
- Mortgage payments (flat, if property enabled)
- Less rent savings (growing with inflation, if property enabled)

### Retirement Phase

Both modes first compute the year's full budget and non-portfolio income:

```
Budget      = Inflated Retirement Spending × partnerMult
            + Child Costs (if still applicable)
            + Mortgage (if still active) − Rent Savings
Other Income = State Pension + Partner Pension + Partner Salary (while partner still works)
```

**% of Portfolio Mode:**
```
Available Gross = Portfolio × SWR rate
Needed Gross    = max(0, Budget − Other Income) / (1 − currentGainFrac × taxRate)
Gross Withdrawal = min(Available, Needed)  (+ any one-time property purchase, grossed up)
Portfolio(t+1)  = Portfolio(t) × (1 + r(age)) + Windfall − Gross + Surplus
```
Only what the budget needs is sold (no needless tax); `Surplus` (other income
beyond the budget) is reinvested. The adequacy metrics still compare the **full**
available draw against the budget.

**Fixed Amount Mode:**
```
Need = Budget + Purchase Cost − Other Income
if Need > 0:  Gross Withdrawal = Need / (1 − currentGainFrac × taxRate)
else:         no withdrawal; the surplus income is reinvested (added to cost basis)
Portfolio(t+1) = Portfolio(t) × (1 + r(age)) + Windfall − Gross + Surplus
```

If the portfolio is exhausted, remaining withdrawals come from cash savings. When
both are zero, the plan is depleted (an **⚠ Underfunded** row flags the year).

---

## Inflation Adjustments

**All amounts are inflation-adjusted** using compound growth from the plan start year:

```
Inflation Factor at year t = (1 + inflation_rate)^t
```

Applied to:
| Item | Applied in |
|------|-----------|
| Your income | Accumulation phase |
| Partner income | Accumulation phase |
| Retirement spending | Both phases |
| State pension | Retirement phase |
| Partner pension | When active |
| Child costs | During child years |
| Rent saved | After property purchase |
| Windfall-adjusted FIRE targets | DCF calculations |

**Key assumption:** All real amounts are entered in **today's money**. The calculator converts them to **nominal (future) money** by applying inflation, then discounts back to present value where needed.

---

## Capital Gains Tax Model

### What `gainFrac` Represents

`gainFrac` (default 25%) is the **fraction of your current portfolio that is unrealized capital gain**. If your portfolio is €200,000 and 25% is gain, then €50,000 would be taxable if you sold everything today.

It is a visible input in the **Tax & Country** section, is **auto-filled** when
you import an IBKR CSV (from the statement's cost-basis columns), and is
**persisted/synced** like every other field. The FIRE target's tax gross-up uses
the gain fraction **projected to your retirement date** (see Cost Basis
Tracking), not this starting value.

### Cost Basis Tracking

During accumulation the calculator tracks your cost basis:
- **Contributions (positive net flow):** add to cost basis
- **Windfalls:** add to cost basis
- **Drawdowns (negative net flow):** reduce cost basis proportionally

```
fractionSold = |drawdown| / portfolio
costBasis(new) = costBasis × (1 − fractionSold)
```

### Tax on Withdrawals

Each withdrawal in retirement incurs capital gains tax on the gain portion:

```
currentGainFrac = (portfolio − costBasis) / portfolio
TaxPaid = Withdrawal × currentGainFrac × taxRate
NetReceived = Withdrawal × (1 − currentGainFrac × taxRate)
```

To compute the required **gross** withdrawal to meet a **net** spending need:

```
GrossWithdrawal = NetSpending / (1 − currentGainFrac × taxRate)
```

**Tax rates by country** (examples, matching the dropdown): France 30%, Portugal 28%,
Germany 26%, Ireland 33%, Belgium 0%. These are flat-rate approximations of
headline capital-gains regimes — they do **not** model fund-specific rules such as
Ireland's 41% ETF exit tax, Germany's Vorabpauschale/Teilfreistellung, the
Netherlands' box-3 deemed-return system, or Belgium's new 2026 capital-gains
regime. Verify the rate for your own situation and asset type.

---

## Portfolio Return & Glide Path

The portfolio return varies by age using a **linear glide path** from your current allocation to the target retirement allocation:

```javascript
function portReturnAt(gl, age, retAge) {
  const sf = age <= currentAge ? stockAlloc
           : age >= retAge    ? (1 − bondAllocRet)
           : stockAlloc + (targetStock − stockAlloc) × (age − currentAge) / (retAge − currentAge);
  return sf × stockRet + (1 − sf) × bondRet;
}
```

**Example (defaults, retiring at 45):**

| Age | Stock % | Bond % | Return |
|-----|---------|--------|--------|
| 31 (today) | 100% | 0% | 7.0% |
| 38 | 80% | 20% | 6.2% |
| 45 (retirement) | 60% | 40% | 5.4% |
| 60+ | 60% | 40% | 5.4% |

The glide path ensures a smoother transition and reduced sequence-of-returns risk near retirement.

---

## Coast Number

The Coast Number is the **minimum portfolio you need today** such that — even if you make zero further contributions — the portfolio will grow to your FIRE Number by retirement age on its own.

```
growthFactor = ∏ (1 + portReturnAt(age)) for each year from now to retirement
CoastNumber  = FIRE Number / growthFactor
```

**Coasting** status is shown if your current portfolio (investments + cash) ≥ Coast Number.

**Practical use:** If you're coasting, you only need to cover living expenses from income — you no longer need to save aggressively for retirement. Your portfolio does the heavy lifting.

---

## Scenarios Tab and Result Tiles

### Plans (v8.3; in the Changes tab since v8.17)

Buying a home and having a child are **plans**: things that might happen, each
described once as plans (the "Might happen" lane of the Changes tab; your
partner is a fact in the "Now" lane). Each card keeps its "Used in A–E" switches. A plan
is **set up** once something that changes the numbers is entered: a purchase price
for the home, a yearly cost or months of parental leave for the child
(`plansSetUp()` in `js/checks.js`). A plan that is not set up has no row in the
scenario grid, its card says so, and its switches are ignored by the calculation
(`effectiveFeatures()` in `getScenario`), so a forgotten switch can never apply
half a plan, such as rent saved without a purchase. The home card does not ask for
the rent that stops: it shows your **rent today**, entered once in the Housing tile.

### The scenario grid (v8)

The Scenarios tab is one grid: labels once on the left, one column per scenario.
Rows: the scenario **name**, the three **life events** (with partner, buy property,
have a child, each an on/off switch per scenario), one switch row per **windfall**
and per **pay change** set up as plans, per planned rent and move abroad (v8.17), and the **result** rows below.

**Stop ages are automatic (v8.1).** There is no stop-age input: each scenario stops
at its **earliest funded age**. `earliestStopAge()` in `js/ui/cards.js` projects
every age from max(30, current age) to min(75, life expectancy − 1) and keeps the
first where `isFunded()` holds: the card verdict (% mode: income covers the
year-one budget; fixed mode: net worth at stop ≥ FIRE number) **and** the money
lasts (no infeasible year, no depletion before life expectancy). With the
partner on, "funded" means **your** costs are covered while she keeps working to
her own stop age. A scenario with a missing input is not searched. No funded age → "not by 75",
shown at 75. `withStopAges()` is what `recalc()` and the Monte Carlo tab both use,
so every tab shows the same age. The old `s{n}_ret` values stay saved (hidden) for
older builds.

| Row | Meaning | Source |
|---|---|---|
| Earliest stop age | first funded age · its year | `earliestStopAge()` |
| Margin when you stop | net worth at that age − FIRE number at that age | `computeCardMetrics()` (`portRet`, `fireTarget`) |
| Money lasts | "to {life expectancy}+" or "runs out at {age}" | `computeCardMetrics().depletionYear` |

A large margin usually means a cost that ends soon after an earlier age (a
mortgage's last year, a child's last dependent year) kept that earlier age from
being funded: in % mode the FIRE number prices the year-one budget as permanent.

(The Household FIRE row was removed in v8.8.) Every cell comes from `scenarioGridResults()` in
`js/ui/cards.js`, which only formats `computeCardMetrics()`: the grid and the
Results tiles can never disagree. Rows have fixed heights, so switching anything
never shifts the layout; on a phone the label column stays pinned and the scenario
columns scroll sideways.

**Missing inputs never show as a number.** `js/checks.js` flags spending that was
never entered: a partner scenario while both your own spending and the joint
transfers are empty, or a scenario without the partner while your own spending or
the joint total (for the 70% "if alone" rule) is empty. Those inputs would otherwise
count as €0, which prices a FIRE number of €0 and a false "Funded". Affected grid
columns show "⚠ Missing input" and "—", and a red banner under the tabs names the
field with a Fix button that jumps to it. Every (i) button opens its explanation in a bubble on tap
or click (and on mouse hover); the text is the button's `title` in `index.html`.

### Monthly income vs target (Results tiles)

Each Results summary tile shows:

```
Monthly Income: €3,100/mo  / €3,800 target
```

- **Monthly Income** = total effective monthly income at retirement date, including:
  - Portfolio SWR withdrawal (post capital gains tax, at the gain fraction
    **tracked to retirement**)
  - State pension (if retirement age ≥ pension age), inflation-adjusted
  - Partner pension (if enabled and partner is at pension age), inflation-adjusted
  - Partner salary (if enabled and partner is still working), inflation-adjusted

- **Target** = the lifelong part of the year-one budget at retirement date:
  - Base retirement spending × partner multiplier (if enabled) × inflation factor
  - Minus rent saved (if property enabled and bought)
  - Child costs and mortgage payments are not in the target: they are paid from
    the set-aside, which is subtracted from the portfolio before the SWR income
    is computed (v8.2)

**Green** = income ≥ target. **Red** = income < target. The chip shows
**✓ Funded / × Short** accordingly.

The comparison uses **inflation-adjusted future values** (not today's money), so both sides are on equal footing.

### Formula

```
inflAtRet = (1 + inflation)^years_to_retirement

SWR Portfolio Income = investedPortfolio × SWR × (1 − gainFrac_at_ret × taxRate) / 12

Pension Income at Ret  = pensionAmt × inflAtRet       (if retAge ≥ pensionAge)
Partner Pension at Ret = partnerPension × inflAtRet   (if enabled and partner at pension age)
Partner Salary at Ret  = partnerInc × inflAtRet       (if enabled and partner still working)

Total Monthly Income = SWR Portfolio Income + Pension + Partner Pension + Partner Salary

Target Monthly = yearOneBudget(retAge) / 12
```

### vs Plan (years ahead/behind)

Shown when you have past net-worth snapshots. It is **position-based**: the plan
curve (your history re-projected with plan assumptions) is scanned for the first
year it expected you to reach **today's actual net worth**:

```
years ahead = (plan year at which planValue ≥ actual NW today) − current year
```

Positive = you got here earlier than the plan predicted. This is measured on the
steep accumulation slope, so it is numerically stable. (An earlier version
compared when each curve crossed the FIRE Number line instead — near-flat curves
against a horizontal line made that gap explode into implausible values like
"13y" from small portfolio differences, so it was replaced.)

---

## Partner Model

One model since v8.8 (the Simple model with its spending multiplier, Household FIRE
and her savings ledger were removed: DECISIONS.md, 2026-11-23). Each person keeps their
own money. Your FIRE number covers **your** cost: your own spending plus your part of
the shared costs. Her salary and pension are never your income; they only set her share.
All formulas live in `js/engine.js` (`actualShare`, `partnerShare`, `partnerIncomeAt`,
`householdCosts`, `twoPersonCost`, `selfFundedCost`, `investNowMonthly`,
`partnerContributionNote`, `soloSpend`); cards, tiles, charts, table, Explanation and
Monte Carlo only consume them.

Per projection year `y` (nominal, `infl = (1+inflation)^t`; `m = 1 + retSpendChange`
once you have stopped, else 1):

```
joint      = samPaysIn + partnerPaysIn                       (today's €/mo)
samInc(y)  = before your retirement: your pay (pay changes, parental leave)
             after:  your pension (if started) + start-of-year portfolio × SWR × netFrac
             (netFrac = 1 − gainFrac × taxRate; SWR is used even in Fixed mode, for the share only)
herInc(y)  = partnerInc until HER partnerRetAge (her age via partnerBirthYear)
           + partnerPension from HER partnerPensionAge        (no draw: her savings are not modelled)
share(y)   = while you both work AND your pay is today's (no pay change, no leave):
               min(1, partnerPaysIn / joint)                  (actualShare: what she really pays)
             otherwise:
               herInc / (herInc + samInc);  0 if both are 0   (partnerShare, no floor or cap)
shared(y)  = max(0, (joint × 12 + yearlyItems) × m × infl + child cost + mortgage − rent saved)
yourCost(y)= samPersonalNow × 12 × m × infl + shared(y) × (1 − share(y))
```

- **Why her real share only while nothing changes:** what she pays in is today's
  arrangement between today's two incomes. When your pay changes (a pay-change plan,
  parental leave) or either of you stops, the arrangement would be renegotiated, so the
  share follows the two incomes. On the owner's saved values this keeps every stop age
  identical to v8.7.
- A property purchase cost stays on your side (not shared). Child costs and the
  mortgage minus rent saved are shared, split by the same share.
- The share uses **start-of-year** values (no iteration), like the rest of the loop.
- **Scenarios without the partner** use `samPersonalNow + soloShared` (× m once you
  stop), where `soloShared = round(0.7 × (joint + yearlyItems / 12))` always (one person
  spends about 70% of a couple: OECD-modified scale 0.67, square-root scale 0.71).
  Child and property costs are all yours. One source: `soloSpend(gl, retired)`.
- **Read-outs** under the four numbers (`js/ui/spending.js`, engine `investNowMonthly`):
  the joint total and the rent in it, her share today, and *You really invest* =
  take-home − your year-one cost.
- **Missing inputs** (`js/checks.js`): a partner scenario needs your own spending or a
  joint total; a scenario without her needs your own spending and a joint total (for
  the 70% rule). Otherwise the grid shows "missing", never a confident €0 target.

**Your FIRE number with a partner** — the headline `fireTarget` (chart line, Coast
number, Monte Carlo reference). Your cost is priced at the share that holds when your
portfolio *equals* the target: then your sustainable draw plus pension equals your cost,
so the share solves `c = P + S × (1 − share(herInc, c))` (closed form, `selfFundedCost`).

- % of Portfolio: `max(0, yourCost(retYear) − your pension if flowing) × taxMult / SWR`
  for the lifelong part, plus costs that end at present value (v8.2). The **adjusted**
  number credits your later pension and later changes in her share
  (`Σ shared(y) × (share₀ − share(y)) × taxMult / (1+r)^(k+1)`); because her share can
  *fall* later (she stops before her pension), it can sit **above** the headline and the
  card then shows it as "w/ later changes".
- Fixed: `Σₖ max(0, yourCost(y) − your pension(y)) × taxMult_k / (1+r)^(k+1)` year by
  year to `lifeExp`, plus a retirement-era purchase cost.
- Card note: "Assumes partner contributes X €/mo (today's €) until her age N; after
  that your cost becomes Y €/mo".

### Migration of saved payloads (v8.8)

A payload without `samPaysIn` is mapped once (`migrateSpending`, pure, tested):
joint = old `sharedNow`; she pays in = the old `partnerPaysIn`, else `joint × ` today's
pro-rata share with the old floor/cap; you pay in = joint − she pays in (≥ 0); separate
retirement amounts become one `retSpendChange` = total retired ÷ total now − 1 (rounded
%). A Simple-model payload keeps its monthly spending as your own spending and leaves
the joint transfers empty (the missing-input banner asks for them). The old fields are
carried through every later save unchanged (`RETIRED_FIELDS` in `js/sync.js`).

---

## Child Cost Model

When you toggle **"With Child"** for a scenario:

### Annual Costs

```
childCostInYear(yr) = childCostYearly × (1 + inflation)^(yr − baseYear)
```

Costs apply for every year where:
```
0 ≤ (yr − childBirthYear) < childCostUntilAge
```

Costs are added to expenses in **both accumulation and retirement phases**.

### Parental Leave (Birth Year Only)

In the child's birth year, your income is reduced:

```
Income in birth year = (12 − leaveMonths) × monthlyIncome
                     + leaveMonths × childMaternityIncome × inflationFactor
```

Where `leaveMonths = min(12, childMaternityMonths)`. The leave income is
inflation-adjusted like every other amount (it is entered in today's money).

### Impact on FIRE Number

In **Fixed Amount mode**, child costs increase the FIRE target by their present value:

```
childCostPV = PV of all inflated annual child costs from retirement date
              discounted at portfolio return rate
```

In **SWR mode**, child costs are added to the monthly **target** shown on the scenario card.

---

## Property Model

When you toggle **"With Property"** for a scenario, three cash flows are modeled:

### 1. One-Time Purchase Cost

In `propBuyYear`:
```
PurchaseCost = propPrice × (propDownPct + propTxCostPct)
```

Example: €400,000 property, 20% down + 8% transaction = €112,000 up front.

### 2. Monthly Mortgage Payments

Standard amortizing mortgage (flat payment over term):
```
monthlyPayment = principal × mr × (1+mr)^nm / ((1+mr)^nm − 1)
```

Where:
- `principal = propPrice × (1 − propDownPct)`
- `mr = propMortgageRate / 12` (monthly rate)
- `nm = propMortgageTerm × 12` (total months)

Payments continue from `propBuyYear` to `propBuyYear + propMortgageTerm`.

### 3. Rent Savings

From `propBuyYear` until life expectancy:
```
annualRentSaved(yr) = propRentSaved × 12 × (1 + inflation)^(yr − baseYear)
```

Rent saved grows with inflation and acts as an **income offset** (reduces required withdrawals).

### Net Impact on FIRE Number (Fixed Mode)

The property's net present value impact on the FIRE target:
```
propertyNetPV = PV(purchaseCost) + PV(mortgagePayments, g=0) − PV(rentSavings, g=inflation)
```

If net is positive (costs > savings), it increases the FIRE number. If negative (savings > costs), it decreases it.

---

## Pension / State Pension

Each state pension (v8.9: German `pensionAmt` from `pensionAge`, French `pension2Amt`
from `pension2Age`) is treated as a **guaranteed inflation-linked annuity** from its own
age. One source for "pension at an age": `pensionMonthlyAt(gl, age)` in `js/engine.js`
(the sum of the pensions started by then); the adjusted target credits each pension that
starts after retirement separately (`pensionList`).

Amounts are typed **gross, as printed**, and the plan uses them gross (not taxed; a known
simplification, AUDIT.md Part 4). Next to them a read-out shows `≈ net` after the social
charges that certainly apply (`js/pensions.js`): Germany 12.4% (health insurance for
pensioners 7.3% + half the average add-on 1.45% + long-term care 3.6%), France 9.1%
(CSG 8.3% + CRDS 0.5% + CASA 0.3%, full rate). Income tax is not included.

### Inflation Adjustment

```
Pension at future age = pensionAmt × 12 × (1 + inflation)^years
```

### Effect on FIRE Number

**% of Portfolio mode:** pensions **already flowing at retirement** reduce the
headline target; pensions starting later are credited only in the adjusted number:
```
annualFromPortfolio    = max(0, yearOneBudget − pensions active at retirement)
FIRE Number (headline) = annualFromPortfolio × TaxMult / SWR
FIRE Number (adjusted) = headline − PV(future pensions & partner salary)
```

**Fixed mode:** year by year (`dcfLoop`), each year's spending net of the pensions
flowing that year (with two pensions: three periods).

This significantly reduces the required FIRE portfolio if you retire well before pension age.

---

## Windfalls

Up to 3 one-time lump-sum payments can be specified by year and amount.

In the projection loop, windfalls are added to the portfolio in the specified calendar year:

```
Portfolio(t+1) = Portfolio(t) × (1 + r) + netFlow + windfall(yr)
```

Windfalls also increase your cost basis (treated as new investment with cost basis = windfall amount).

Windfalls reduce the required savings rate by boosting the portfolio at a specific
point in time. **They are deliberately not credited against the FIRE Number** —
the target stays windfall-free (conservative); the projection curve simply crosses
it earlier when a windfall lands.

---

## Pay Changes (v8.6)

Pay changes are **plans** (the Pay changes tile): a name, a start year, an optional end
year (inclusive; empty = for good) and the take-home per month during it (today's
money; 0 = no pay, e.g. a year off), with an A–E switch per scenario. The scenario
grid shows one row per pay change. Outside every change you earn your take-home
from the Pay tile; when several apply in a year, the one that **started latest**
wins (`payIncomeAt()` in `js/engine.js`).

```javascript
pay(yr) = income                                   // baseIncome
for each change c switched on for this scenario:
  if (yr >= c.from && (c.to === null || yr <= c.to) && c.from >= latestStart) pay(yr) = c.amt
annualIncome = pay(yr) × 12 × inflFactor
```

Before v8.6 each scenario had a take-home override (`s{n}_inc`) and one permanent
change (`s{n}_chgYear`, `s{n}_chgInc`). On the first load of an older payload they
become plans (`migrateFromFields()` in `js/payChanges.js`): an override becomes a
change from the plan start year, for good; identical changes in several scenarios
become one plan switched on in each. The old fields stay saved (hidden) and are no
longer read. A permanent pay-change plan projects exactly like the old field
(tested on every golden case).

**Use case:** a 4-day week from 2030, or a part-time "Barista FIRE" phase, or a
year off: one row each, switched on in the scenarios that should include it.

---

## The Changes tab (v8.17)

My Situation and Plans became one tab, **Changes**, with two lanes of tiles and the
impact panel beside them (`js/ui/tiles.js`):

- **Now** (facts, the same in every scenario): Portfolio & snapshots, Spending, Pay,
  Pensions, Housing (rent today), Where you live (country today), You & partner,
  Assumptions (markets and withdrawal strategy).
- **Might happen** (plans, switched on per scenario): Buying a home, Child, Pay changes,
  Flat move (planned rents), Moving country (moves abroad), Windfalls.

A tile shows a one-line summary and its date badge (red when a check-in is due) and
opens in place; one open tile per lane, remembered per browser. A field reached from the
banner or the review opens its tile. On a phone the lanes stack and the impact panel is a
bar at the bottom ("N changes · biggest effect"), tap to open. The inputs and their ids are
unchanged, so saving, sync and the engine are untouched.

**Imports are snapshots.** An IBKR import writes the year's net-worth snapshot (IBKR
total + cash, its date, what was added and what the markets did since the previous
import; `snapshotFromImport`). One row per year: a later import that year replaces it,
keeping any actuals. Snapshots can also be added by hand. The separate check-in block and
the typed-total fallback are gone.

**Planned rents and moves abroad are switched per scenario** (`off` lists the scenarios
without them, like windfalls; rows in the scenario grid and A–E chips on each move). A
scenario carries its own lists (`plansForScenario` in `js/countries.js`) and every engine
entry point reads the settings through `scGl(gl, sc)`, so the formulas are unchanged.

## Versions, update log and prompts (v8.14)

Edits still autosave (localStorage, then the Supabase row). On top of that, the panel at
the side of the Changes tab compares today's settings with the **last saved version**: the
changed fields (old → new), changed lists, and for each scenario the stop age, FIRE number
and net worth at the end, saved → now. **Save update** (optional note) keeps a dated
version; **Undo all** brings the last version back. The **update log** lists versions
newest first with their effect at the time and compared with today; **Restore** brings
one back as a new version (today's settings are kept first), so a restore can be undone.

Versions live in the saved row (`versions`, last 30, additive): a copy of the settings
(`snapshotOf`: no position list) and the five scenarios' results (`resultsOf`). Pure
logic: `js/versionsCore.js`.

**First run.** A payload saved before v8.14 (no `versions`) gets an automatic **Before
Life update** version and a one-time review list (spending moved from the old model,
where you live, pensions per country, rent today, ownership charges); each item has Go and
Done, the list can be dismissed.

**Did this happen?** When a dated plan's year arrives (a planned rent, a move abroad, a
purchase or a birth that some scenarios include, a permanent pay change), the panel asks.
Yes makes it a fact (rent today / country today replaced, later moves re-based; buying or
the child switched on in every scenario; the new pay becomes your take-home). Not yet moves
it to next year.

## Year-end rollover (v8.15)

Once the calendar has passed the plan's "today" (`baseYear`), the panel offers **Close
{year}** (also in the update log, any time): (1) the closing net worth (IBKR + cash,
editable) is written as the net-worth history row for 1 January of the next year;
(2) `baseYear` moves on a year, so ages move up; every amount typed in today's money that
was **not refreshed during the closed year** is raised by inflation (a list with
checkboxes; pay is unticked by default, a raise is typed instead; planned rents follow
rent today); (3) overdue check-ins are listed; the result is saved as a version
"Year-end {year}". Pure logic: `js/yearEnd.js`.

## The 5 Default Scenarios

| Scenario | Default Retire Age | Partner | Property | Child | Special |
|----------|--------------------|---------|----------|-------|---------|
| A — Early Retirement | 40 | ✗ | ✗ | ✗ | Baseline solo path |
| B — Standard Path | 45 | ✗ | ✗ | ✗ | 5 years later |
| C — Barista FIRE | 50 | ✗ | ✗ | ✗ | Set an income change (year + amount) for the part-time phase |
| D — With Partner | 42 | ✓ | ✗ | ✗ | Joint income, joint spending |
| E — Full Picture | varies | ✓ | ✓ | ✓ | All add-ons enabled |

You can rename scenarios and switch life events, windfalls and pay changes per scenario on the Scenarios grid; the stop age follows automatically.

---

## Monte Carlo Simulation

The **Monte Carlo** tab (4th tab) stress-tests every scenario against thousands of possible market histories, instead of the single deterministic average-return path used by the other tabs. It answers: *"What are the odds my portfolio actually survives — and how wide is the range of outcomes?"*

### Method: historical block bootstrap

Rather than drawing returns from a synthetic bell curve (which understates crashes), each simulated path is built by **stitching together random blocks of consecutive real market years**:

1. A dataset of annual total returns is embedded for **stocks** (MSCI World, developed markets, gross, USD) and a **global government-bond proxy**, covering **1970–2024**.
2. To build one path, the engine repeatedly picks a random starting year and copies a **block** of consecutive historical years (default **5 years**) until the full horizon (today → life expectancy) is filled.
3. Stock and bond returns are always sampled from the **same historical year together**, so their real-world co-movement (correlation) is preserved automatically.

Because blocks are *consecutive* real history, each path keeps realistic short-run dynamics — momentum, volatility clustering, and crash-then-recovery sequences (1973–74, 2000–02, 2008, 2022). Only the *order* of historical episodes is randomized. This is the standard way to get thousands of statistically-distinct multi-decade paths from a finite history, which pure sequential backtesting cannot provide over a 50–70 year horizon.

### Recentering to your assumptions (default ON)

The embedded series is developed-markets, USD-denominated history. With **recentering** on, each sampled return keeps history's shape but is re-anchored so the **long-run compound (geometric) return equals your** assumed `stockRet` / `bondRet`:

```
1 + recentered = (1 + yourReturn) × (1 + historicalReturn) / (1 + historicalGeoMean)
```

So the **volatility, fat tails, and sequencing are real**, while the **compound
return matches your own forecast** — which makes the Monte Carlo median
consistent with the deterministic tabs (they compound your input directly). An
additive arithmetic-mean shift would instead compound roughly σ²/2 ≈ 1.5
percentage points *below* your input (volatility drag) and silently contradict
the other tabs. Your `stockRet` input is therefore interpreted everywhere as a
**CAGR / geometric** return. Turn recentering off to use the raw historical
series instead.

> **Note on the data:** the embedded return arrays are *approximate* annual figures compiled from public sources, chosen to reproduce realistic year-to-year dynamics rather than exact index levels. They live in `MC_HIST_STOCK` / `MC_HIST_BOND` in `js/montecarlo.js` and can be edited to plug in your own return history (the two arrays must stay aligned by year and equal in length). **Inflation is kept deterministic** (your inflation input) in this version.

### Inputs

| Input | Default | Notes |
|-------|---------|-------|
| Simulations | 1,000 | Paths per scenario (500 / 1,000 / 2,500 / 5,000). All five scenarios share the same set of paths for a fair comparison. |
| Block length | 5 years | Length of each consecutive-history block. Larger blocks preserve longer real sequences; `1` = single-year resampling. |
| Recenter to my return assumptions | On | Re-anchors sampled means to your `stockRet` / `bondRet` (see above). |

Runs are reproducible (seeded RNG) — identical inputs give identical results. Press **Run simulation** to (re)compute; it is not run automatically on every keystroke.

### Metrics reported

The metrics shown depend on the withdrawal mode, because the two modes fail in completely different ways.

#### Fixed-Amount mode — depletion risk

Withdrawals are a fixed real amount, so the portfolio *can* run out. The headline is a true **survival rate**.

| Metric | Definition |
|--------|------------|
| **Success rate** (card headline) | % of paths where net worth never hits zero before life expectancy. |
| **Median ending value** | Median **real** ending net worth across all paths (10th-percentile shown alongside). |
| **Larger end portfolio** | % of paths whose **real** ending net worth is **≥ 2×** that path's inflation-adjusted value at retirement. |
| **Smaller end portfolio** | % of paths whose **real** ending net worth is **≤ ½** that path's value at retirement. |

#### SWR mode — budget-adequacy risk

A % withdrawal can never fully deplete the portfolio (survival is ~100% by construction), so the question is not *"does it survive?"* but *"does it keep paying my budget — and if not, by how much does it fall short?"* Everything keys off the **funding ratio** computed each retirement year:

```
funding ratio = available income (full SWR draw net of tax + pensions + partner salary)
              ÷ full annual budget (retirement spending + child costs + mortgage − rent saved)
```

A one-time property purchase lump is excluded from the budget. Then:

| Metric | Captures | Definition |
|--------|----------|------------|
| **Years on budget** (card headline) | frequency | Share of all retirement years (across all paths) where income ≥ budget. Used instead of a "≥ 1 short year" frequency, which saturates near 100% over a multi-decade retirement. |
| **Years under budget** | frequency | Average number of retirement years per simulation where income < budget, shown as `X / Y` of total retirement years. |
| **Lifetime budget funded** | depth | Median across sims of each sim's `Σ min(income, budget) ÷ Σ budget` over all retirement years (real terms). **Capped at 100% per year** — surplus years can't inflate it. An uncapped average would be dominated by late-life snowball years (unspent surpluses compound), producing absurd headline figures (500%+) that say nothing about adequacy. |
| **When short, you fund** | depth | Average funding ratio across only the years that fall short — "when you miss, you typically cover this much of budget." |
| **Worst year (1-in-10)** | tail depth | 10th-percentile of each path's leanest single-year funding ratio — the bad-case worst year. |

These deliberately separate **how often** you fall short from **how far**: a plan can average comfortably above 100% yet still dip below budget in early-retirement years, which the worst-year and years-under-budget figures expose.

#### Visuals

- **Scenario cards** — the five scenarios with their headline rate (green ≥ 90%, amber 75–90%, red < 75%). Click one to drill in.
- **Fan chart** — percentile bands (10–90th, 25–75th, median) over time. In Fixed mode this is **net worth** with the FIRE Target line; in SWR mode it is **budget coverage** (funding ratio) over the retirement years with a 100% reference line, so you can see *when* coverage is tightest.
- **Distribution histogram** — in Fixed mode the spread of real ending net worth (depleted paths highlighted); in SWR mode the spread of each simulation's **lifetime budget coverage** (capped share of total budget funded), coloured green / amber / red around the 100% line.

### Visuals

- **Scenario cards** — the five scenarios side by side, each showing its success rate (green ≥ 90%, amber 75–90%, red < 75%). Click a card to drill in.
- **Fan chart** — the selected scenario's portfolio value over time as percentile bands: the 10th–90th percentile range (light), the 25th–75th range (darker), and the median line, with the FIRE Target reference line.
- **Distribution histogram** — the spread of real ending net worth across all paths (the leftmost/zero bucket, highlighted, is the depleted/failed paths).

### Engine integration

The Monte Carlo tab reuses the exact same `project()` cash-flow engine as the other tabs — all spending, tax, pension, glide-path and add-on logic is identical. The only difference is that `project()` is fed a sampled per-year return sequence (`opts.returnSeq`) instead of the deterministic glide-path return. This keeps the two views consistent and means any change to the planning logic automatically applies to the simulation.

---

## Assumptions & Limitations

### What the Calculator Assumes

1. **All returns are nominal** (before inflation). Real returns = nominal − inflation.
2. **Inflation is constant** at the rate you specify, compounding annually.
3. **The first three tabs are deterministic** — they use constant average returns (no sequence-of-returns risk). For probabilistic sequence-risk analysis, use the **Monte Carlo** tab (see the [Monte Carlo Simulation](#monte-carlo-simulation) section).
4. **Capital gains tax** is applied only on the gain fraction of each withdrawal. It does not model income tax on salary or pension.
5. **Partner pension** is assumed to start at a fixed age and grow with inflation like the state pension.
6. **The mortgage rate is fixed** for the entire term — no variable rate modeling.
7. **Property value appreciation** is not modeled — only the cash-flow impact (down payment, mortgage, rent savings).
8. **Child costs are constant in real terms** — `childCostYearly` is in today's money and grows with inflation.
9. **Spending is constant in real terms** in retirement — you spend the same amount (inflation-adjusted) every year. No dynamic withdrawal strategy.
10. **Cost basis tracking** uses a simplified proportional method. It is not a substitute for actual tax advice.
11. **% of Portfolio mode** makes `SWR% × current portfolio` available each year for the lifelong budget and sells only what it needs, plus, since v8.2, the costs that end in full — this is **not** the classic Bengen/Trinity rule (fixed real withdrawals set at retirement), and outside those temporary costs it cannot fully deplete the portfolio. Its risk is income variability, reported as budget-adequacy metrics. Use **Fixed Amount** mode for Bengen-style depletion analysis.
12. **Your return inputs are compound (CAGR/geometric) returns.** The deterministic tabs compound them directly, and Monte Carlo recentering anchors the geometric mean to them, so the two views agree at the median.
13. **Surplus income is reinvested.** In retirement, pension/partner income beyond the year's budget is added back to the portfolio (raising its cost basis) rather than discarded.
14. **Accumulation deficits draw down cash** after the portfolio; if both run out, the year is flagged ⚠ Underfunded on the scenario card rather than silently forgiven.

### What the Calculator Does NOT Model

- Variable spending in retirement (spending floors/ceilings)
- Social security means-testing
- Inheritance or estate planning
- Currency risk (all amounts in EUR)
- Healthcare cost inflation (modeled at the same rate as general inflation)
- Tax on salary income during accumulation
- Multiple properties
- Rental income from property

### Key Formula Reference

| Concept | Formula |
|---------|---------|
| Inflation adjustment | `Amount × (1 + inflation)^years` |
| Annuity PV | `C × [1 − ((1+g)/(1+r))^n] / (r−g)` |
| FIRE Number (% mode, headline) | `max(0, yearOneBudget − active pensions) × TaxMult / SWR` |
| FIRE Number (% mode, adjusted) | headline − PV(future pensions & partner salary) |
| Coast Number | `FIRE Number / ∏(1 + r_age)` |
| Tax multiplier | `1 / (1 − gainFrac_at_retirement × taxRate)` |
| Mortgage payment | `P × mr × (1+mr)^n / ((1+mr)^n − 1)` (or `P/n` at 0% rate) |
| Your cost with a partner | `own + shared × (1 − her share)` (see Partner Model) |
| SWR monthly income | `portfolio × SWR × (1 − gainFrac_at_ret × taxRate) / 12` |
| Total monthly income (card) | SWR income + pension + partner pension + partner salary (all inflation-adjusted) |
| Monthly target (card) | `yearOneBudget(retAge) / 12` |
| MC recentering | `1+r' = (1+yourReturn)(1+r)/(1+geoMean(history))` |
