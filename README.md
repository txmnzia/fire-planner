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
10. [Scenario Cards (SWR Mode Display)](#scenario-cards-swr-mode-display)
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

An in-app **How-To** tab (5th tab) summarises this logic in plain language — most importantly the difference between the two withdrawal strategies — for users who don't read this document.

---

## Input Parameters

### Your Portfolio

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Cash & Savings | `cash` | 30,000 | EUR | Earns `cashReturn`, not invested in stocks/bonds |
| Cash Interest Rate | `cashReturn` | 1% | % p.a. | Applied to cash portion only |
| Investable Portfolio | `ibkrTotal` | — | EUR | Loaded from IBKR/broker sync or manual entry |

### About You

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Date of Birth | `dob` | 1994-03-12 | date | Current age derived from today's date |
| Life Expectancy | `lifeExp` | 100 | years | Simulation ends at this age |
| Plan Start Year | `baseYear` | 2026 | year | Year 0 for all projections |

### Income & Spending

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Monthly Income (net) | `baseIncome` | 6,700 | EUR/month | Your take-home income today |
| Monthly Spending (now) | `spendNow` | 3,000 | EUR/month | Pre-retirement lifestyle spending |
| Monthly Spending (retirement) | `spendRet` | 3,000 | EUR/month | Fixed-mode only; base for SWR target |
| Withdrawal Rate | `swr` | 4% | % | %-of-portfolio mode only; % of the current portfolio available annually |

### Market Assumptions

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Stock Return (annual) | `stockRet` | 7% | % p.a. | Nominal (before inflation), after fees |
| Bond Return (annual) | `bondRet` | 3% | % p.a. | Nominal, after fees |
| Inflation | `inflation` | 2% | % p.a. | Applied to all spending and income |
| Bond Allocation (today) | `bondAllocNow` | 0% | % | Current bond share; stock = 100% − bonds |
| Bond Allocation (at retirement) | `bondAllocRet` | 40% | % | Target bond share at retirement |

### Tax

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Country of Residence | `retCountry` | France | — | Sets capital-gains tax rate (stored as country code) |
| Unrealized Gain Fraction | `gainFrac` | 27% | % | % of your portfolio that is capital gain today; auto-filled from IBKR CSV import, editable & synced |

### Future Income

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| State Pension Amount (gross) | `pensionAmt` | 800 | EUR/month | Monthly gross pension when eligible |
| State Pension Age | `pensionAge` | 67 | years | Age when pension starts |
| Windfall 0–2 (Year, Amount) | `wf0_yr`, `wf0_amt` | 2030, 100k | year, EUR | Up to 3 one-time lump-sum inflows |

### Partner (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Partner Monthly Income (net) | `partnerInc` | 4,000 | EUR/month | Added to income until partner retires |
| Partner Retirement Age | `partnerRetAge` | 45 | years | Partner income stops at this age |
| Partner Pension Amount (gross) | `partnerPension` | 700 | EUR/month | Partner's monthly pension |
| Partner Pension Age | `partnerPensionAge` | 67 | years | Age when partner's pension starts |
| Spending Multiplier | `partnerSpendMult` | 1.5× | — | Household spending = solo spending × this |
| Partner Year of Birth | `partnerBirthYear` | — (same as you) | year | Optional; shifts when partner ret./pension ages are reached |

### Property (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Purchase Year | `propBuyYear` | 2029 | year | Year of purchase |
| Purchase Price | `propPrice` | 400,000 | EUR | Total property price |
| Down Payment | `propDownPct` | 20% | % | % of price paid up front |
| Transaction Costs | `propTxCostPct` | 8% | % | Notary, taxes, fees on top of price |
| Mortgage Rate | `propMortgageRate` | 3.5% | % p.a. | Fixed rate for entire term |
| Mortgage Term | `propMortgageTerm` | 25 | years | Amortization period |
| Rent Saved per Month | `propRentSaved` | 1,200 | EUR/month | Rent you no longer pay after purchase |

### Child (global, toggled per scenario)

| Parameter | Input ID | Default | Unit | Notes |
|-----------|----------|---------|------|-------|
| Birth Year | `childBirthYear` | 2027 | year | Child's year of birth |
| Annual Child Cost | `childCostYearly` | 12,000 | EUR/year | Total out-of-pocket cost per year |
| Dependent Until Age | `childCostUntilAge` | 25 | years | Costs apply from birth until this child age |
| Parental Leave (months) | `childMaternityMonths` | 6 | months | Months of reduced income in birth year |
| Income During Leave | `childMaternityIncome` | 2,000 | EUR/month | Your income during those leave months |

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
**complete year-one budget** (spending × partner multiplier + child costs +
mortgage − rent saved, inflation-adjusted).

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

FIRE Number (headline) = max(0, Budget − pensions already flowing at retirement)
                         × TaxMult / SWR rate

FIRE Number (adjusted) = headline − PV(state pension starting later)
                                  − PV(partner pension starting later)
                                  − PV(partner salary until partner retires)
```

`TaxMult = 1 / (1 − gainFrac_at_retirement × taxRate)` grosses the target up so
that the **after-tax** proceeds of the SWR draw cover the budget — a portfolio
equal to the target really delivers the budget, net of capital-gains tax. The
gain fraction used is the one the projection **tracks to your retirement date**,
not today's.

The headline deliberately gives **no credit** for income that hasn't started yet
(pensions at 67 when you retire at 45, or a partner's remaining working years) —
those appear only in the adjusted number, so you can see both the safe target
and the realistic one.

**Example:** Retire in 10 years, spend €3,000/month, pension €800/month starting
at 67 (i.e. *after* retirement), 2% inflation, 4% SWR, 30% tax on a 50% gain
fraction at retirement (TaxMult ≈ 1.176):
- Inflated budget: €3,000 × 1.02¹⁰ × 12 = €43,886/year
- Headline FIRE Number: €43,886 × 1.176 / 0.04 = **€1,290,000** (pension not yet flowing → no offset)
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

The **annuity PV formula** used is:

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

`gainFrac` (default 27%) is the **fraction of your current portfolio that is unrealized capital gain**. If your portfolio is €200,000 and 27% is gain, then €54,000 would be taxable if you sold everything today.

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

## Scenario Cards (SWR Mode Display)

### Monthly Income vs Target

Each scenario card shows:

```
Monthly Income: €3,500/mo  / €4,200 target
```

- **Monthly Income** = total effective monthly income at retirement date, including:
  - Portfolio SWR withdrawal (post capital gains tax, at the gain fraction
    **tracked to retirement**)
  - State pension (if retirement age ≥ pension age), inflation-adjusted
  - Partner pension (if enabled and partner is at pension age), inflation-adjusted
  - Partner salary (if enabled and partner is still working), inflation-adjusted

- **Target** = the complete year-one budget at retirement date:
  - Base retirement spending × partner multiplier (if enabled) × inflation factor
  - Plus child costs per month (if child is still a dependent at retirement year)
  - Plus mortgage − rent saved (if property enabled and active at retirement)

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

When you toggle **"With Partner"** for a scenario, the following changes apply:

### Income (Both Phases)

- Partner's income (`partnerInc`) added to household income each year, inflation-adjusted.
- Partner income stops when the **partner** reaches `partnerRetAge` — including
  after *your* retirement. If you retire at 45 and your partner works to 67,
  their salary offsets household withdrawals for those 22 years.
- Partner pension (`partnerPension`) starts once the partner reaches `partnerPensionAge`.
- The partner's age is assumed equal to yours unless you set
  `partnerBirthYear` (Partner section), which shifts when their retirement and
  pension ages are reached.

### Spending

- Household spending multiplied by `partnerSpendMult` in **all phases** (accumulation and retirement).
- This applies to both `spendNow` (during accumulation) and `spendRet` (in retirement).
- Default multiplier of 1.5× reflects that two people sharing a home cost ~50% more than one.

**Example:** Solo spending €3,000/month → with partner: €3,000 × 1.5 = €4,500/month.

### FIRE Number Impact

- **% of Portfolio mode:** pensions already flowing at retirement reduce the
  headline target; future pensions and the partner's remaining salary years are
  credited only in the **adjusted** (secondary) number.
- **Fixed mode:** the PV of the partner's pension *and* of their salary until
  `partnerRetAge` are subtracted from the FIRE target as credits.
- Spending increase raises the FIRE target; partner income lowers it.

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

The state pension (`pensionAmt` per month) is treated as a **guaranteed inflation-linked annuity** starting at `pensionAge`.

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

**Fixed mode:** Splits the FIRE calculation into two periods:
- **Before pension age:** full spending funded from portfolio
- **After pension age:** spending net of pension funded from portfolio

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

## Income Change (Barista FIRE)

Each scenario supports an optional **income change** at a specified year:

- `chgYear`: year the new income takes effect
- `chgInc`: new monthly income from that year onward

```javascript
annualIncome = income × 12 × inflFactor
if (yr >= chgYear && chgYear !== null)
  annualIncome = chgInc × 12 × inflFactor
```

**Use case:** Scenario C is pre-configured as "Barista FIRE" — full-time work until a specified year, then part-time work at a much lower income, before fully retiring later. This lets you model the middle path between full accumulation and early retirement.

---

## The 5 Default Scenarios

| Scenario | Default Retire Age | Partner | Property | Child | Special |
|----------|--------------------|---------|----------|-------|---------|
| A — Early Retirement | 40 | ✗ | ✗ | ✗ | Baseline solo path |
| B — Standard Path | 45 | ✗ | ✗ | ✗ | 5 years later |
| C — Barista FIRE | 50 | ✗ | ✗ | ✗ | Income drops to €800/mo from 2030 |
| D — With Partner | 42 | ✓ | ✗ | ✗ | Joint income, joint spending |
| E — Full Picture | varies | ✓ | ✓ | ✓ | All add-ons enabled |

You can rename scenarios and change all parameters including the retirement age slider, income override, and income change fields.

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
11. **% of Portfolio mode** makes `SWR% × current portfolio` available each year and sells only what the budget needs — this is **not** the classic Bengen/Trinity rule (fixed real withdrawals set at retirement), and by construction it cannot fully deplete the portfolio. Its risk is income variability, reported as budget-adequacy metrics. Use **Fixed Amount** mode for Bengen-style depletion analysis.
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
| Partner spending | `spendRet × partnerSpendMult` |
| SWR monthly income | `portfolio × SWR × (1 − gainFrac_at_ret × taxRate) / 12` |
| Total monthly income (card) | SWR income + pension + partner pension + partner salary (all inflation-adjusted) |
| Monthly target (card) | `yearOneBudget(retAge) / 12` |
| MC recentering | `1+r' = (1+yourReturn)(1+r)/(1+geoMean(history))` |
