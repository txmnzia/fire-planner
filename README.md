# FIRE Planner — Calculation Logic & Documentation

A single-file, browser-based **Financial Independence / Retire Early** calculator. All logic lives in `index.html` with no external dependencies beyond Chart.js (loaded from CDN).

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
18. [Assumptions & Limitations](#assumptions--limitations)

---

## Overview

The planner runs a **year-by-year simulation** from today until your life expectancy, tracking portfolio growth, withdrawals, income, spending, and all add-ons (partner, child, property). It supports two output modes:

| Mode | What it answers |
|------|----------------|
| **Fixed Amount** | "How large does my portfolio need to be to sustain €X/month forever?" |
| **Safe Withdrawal Rate (SWR)** | "Given a 4% withdrawal rate, how much monthly income will my portfolio generate?" |

Five parallel scenarios (A–E) are computed simultaneously for side-by-side comparison.

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
| Safe Withdrawal Rate | `swr` | 4% | % | SWR-mode only; % of portfolio withdrawn annually |

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
| Country of Residence | `retCountry` | France | — | Sets capital-gains tax rate |
| Unrealized Gain Fraction | `gainFrac` | 27% | % | % of your portfolio that is capital gain |

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

### Safe Withdrawal Rate Mode (`wdMode = "swr"`)

You specify a **withdrawal rate** (e.g., 4%). The calculator:

1. Computes how large the portfolio needs to be at retirement so that `SWR% × portfolio` covers your spending after pension offsets.
2. Simulates year-by-year portfolio growth during retirement, withdrawing exactly `SWR% × portfolio` each year.
3. Tracks whether the portfolio runs out before life expectancy.

The scenario card shows your **effective monthly income** at retirement and compares it to your **inflation-adjusted spending target** including all add-ons.

---

## FIRE Number Calculation

### SWR Mode Formula

```
FIRE Number = Annual Net Spending / SWR rate
```

Where:
```
Annual Net Spending = Inflation-Adjusted Retirement Spending
                    − State Pension (if at pension age)
                    − Partner Pension (if enabled and at partner pension age)
```

All amounts are **inflation-adjusted to retirement date**:
```
Inflated Amount = Nominal Amount × (1 + inflation)^years_to_retirement
```

**Example:** Retire in 10 years, spend €3,000/month, pension €800/month, 2% inflation, 4% SWR:
- Inflated spending: €3,000 × 1.02¹⁰ = €3,657/month = €43,886/year
- Inflated pension: €800 × 1.02¹⁰ = €975/month = €11,700/year
- Net annual from portfolio: €43,886 − €11,700 = €32,186
- FIRE Number: €32,186 / 0.04 = **€804,650**

### Fixed Amount (DCF) Mode Formula

Uses present-value annuity calculations. The FIRE number equals the portfolio needed to fund all future net cash flows, discounted at the portfolio return rate:

```
FIRE Number = PV(spending, pre-pension) + PV(spending - pension, post-pension)
            + PV(child costs)
            + PV(property net costs)
            − PV(partner pension credit)
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
Tax Multiplier = 1 / (1 − gainFrac × taxRate)
```

This accounts for the fact that withdrawals trigger capital gains tax on the gain portion.

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
- Partner income (inflation-adjusted, until partner retires)
- Partner pension (once partner reaches pension age)
- Parental leave income adjustment in child's birth year

Spending includes:
- `spendNow × inflation × partnerMult` (if partner enabled)
- Child costs (inflation-adjusted, for child years 0 to `childCostUntilAge`)
- Mortgage payments (flat, if property enabled)
- Less rent savings (growing with inflation, if property enabled)

### Retirement Phase

**SWR Mode:**
```
Gross Withdrawal = Portfolio × SWR rate
Net Withdrawal (after-tax) = Gross × (1 − currentGainFrac × taxRate)
Portfolio(t+1) = Portfolio(t) × (1 + r(age)) + Windfall − Gross Withdrawal
```

**Fixed Amount Mode:**
```
Target Spending = Inflated Retirement Spending × partnerMult
               + Child Costs (if still applicable)
               + Mortgage (if still active)
               − Rent Savings
               − Pension Income
               − Partner Pension
Gross Withdrawal = Target / (1 − currentGainFrac × taxRate)
Portfolio(t+1) = Portfolio(t) × (1 + r(age)) + Windfall − Gross Withdrawal
```

If the portfolio is exhausted, remaining withdrawals come from cash savings. When both are zero, the portfolio is depleted.

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

**Tax rates by country** (examples): Portugal 0%, Germany 25%, France 30%, Belgium 33%.

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
  - Portfolio SWR withdrawal (post capital gains tax)
  - State pension (if retirement age ≥ pension age), inflation-adjusted
  - Partner pension (if enabled and retirement age ≥ partner pension age), inflation-adjusted

- **Target** = total monthly spending need at retirement date:
  - Base retirement spending × partner multiplier (if enabled) × inflation factor
  - Plus child costs per month (if child is still a dependent at retirement year)

**Green** = income ≥ target. **Red** = income < target.

The comparison uses **inflation-adjusted future values** (not today's money), so both sides are on equal footing.

### Formula

```
inflAtRet = (1 + inflation)^years_to_retirement

SWR Portfolio Income = investedPortfolio × SWR × (1 − gainFrac × taxRate) / 12

Pension Income at Ret = pensionAmt × inflAtRet  (if retAge ≥ pensionAge)
Partner Pension at Ret = partnerPension × inflAtRet  (if enabled and retAge ≥ partnerPensionAge)

Total Monthly Income = SWR Portfolio Income + Pension + Partner Pension

Target Monthly = spendRet × partnerMult × inflAtRet + childMonthlyCostAtRet
```

---

## Partner Model

When you toggle **"With Partner"** for a scenario, the following changes apply:

### Income (Accumulation Phase)

- Partner's income (`partnerInc`) added to household income each year, inflation-adjusted.
- Partner income stops when partner reaches `partnerRetAge`.
- Partner pension (`partnerPension`) starts once partner reaches `partnerPensionAge`.

### Spending

- Household spending multiplied by `partnerSpendMult` in **all phases** (accumulation and retirement).
- This applies to both `spendNow` (during accumulation) and `spendRet` (in retirement).
- Default multiplier of 1.5× reflects that two people sharing a home cost ~50% more than one.

**Example:** Solo spending €3,000/month → with partner: €3,000 × 1.5 = €4,500/month.

### FIRE Number Impact

- **SWR mode:** pension offsets reduce required portfolio.
- **Fixed mode:** partner pension PV is subtracted from FIRE target as a credit.
- Spending increase raises the FIRE target; pension income lowers it.

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
                     + leaveMonths × childMaternityIncome
```

Where `leaveMonths = min(12, childMaternityMonths)`.

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

**SWR mode:** Reduces the annual withdrawal needed from the portfolio:
```
annualFromPortfolio = max(0, annualSpending − pensionIncome − partnerPensionIncome)
FIRE Number = annualFromPortfolio / SWR
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

Windfalls reduce the required savings rate by boosting the portfolio at a specific point in time.

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

## Assumptions & Limitations

### What the Calculator Assumes

1. **All returns are nominal** (before inflation). Real returns = nominal − inflation.
2. **Inflation is constant** at the rate you specify, compounding annually.
3. **Portfolio returns are deterministic** — no sequence-of-returns risk modeling (no Monte Carlo). This is a best-case-average-returns projection.
4. **Capital gains tax** is applied only on the gain fraction of each withdrawal. It does not model income tax on salary or pension.
5. **Partner pension** is assumed to start at a fixed age and grow with inflation like the state pension.
6. **The mortgage rate is fixed** for the entire term — no variable rate modeling.
7. **Property value appreciation** is not modeled — only the cash-flow impact (down payment, mortgage, rent savings).
8. **Child costs are constant in real terms** — `childCostYearly` is in today's money and grows with inflation.
9. **Spending is constant in real terms** in retirement — you spend the same amount (inflation-adjusted) every year. No dynamic withdrawal strategy.
10. **Cost basis tracking** uses a simplified proportional method. It is not a substitute for actual tax advice.
11. **SWR mode** withdraws exactly `SWR% × current portfolio` each year — this is the classic Bengen/Trinity rule. The portfolio may still deplete if returns are poor (modeled as depletion when portfolio hits 0).

### What the Calculator Does NOT Model

- Sequence-of-returns risk (Monte Carlo simulation)
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
| FIRE Number (SWR) | `(annualSpend − pension) / SWR` |
| Coast Number | `FIRE Number / ∏(1 + r_age)` |
| Tax multiplier | `1 / (1 − gainFrac × taxRate)` |
| Mortgage payment | `P × mr × (1+mr)^n / ((1+mr)^n − 1)` |
| Partner spending | `spendRet × partnerSpendMult` |
| SWR monthly income | `portfolio × SWR × (1 − gainFrac × taxRate) / 12` |
| Total monthly income (SWR card) | SWR income + pension + partner pension (all inflation-adjusted) |
| Monthly target (SWR card) | `spendRet × partnerMult × inflAtRet + childMonthlyCostAtRet` |
