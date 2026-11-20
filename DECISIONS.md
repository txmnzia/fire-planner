# Decisions

Product and modelling decisions taken with the owner, newest first, with the reason
for each and what was rejected. The formulas themselves live in README.md; past bugs
in AUDIT.md. When a decision here changes, add a new entry rather than rewriting the
old one, so the history stays readable. No personal figures here (CLAUDE.md rule 7).

## 2026-11-20 · v8.7 Spending refresh

- **Four numbers, in bank order.** Joint account / month, she pays in / month, your
  own spending / month, yearly items / year. They are what you read off your accounts
  about twice a year. A "last refresh" date is stamped on any edit and turns red after
  6 months.
- **Her real share while you both work.** Her share of shared costs = what she pays
  in ÷ joint total (max 100%, floor and cap not applied), because it is a measured
  fact. It applies as a fraction, so it also covers yearly items, child costs and the
  mortgage. Once either of you stops working, the pro-rata rule takes over again.
  *Why:* the FIRE targets are priced after you stop, so they stay unchanged; only the
  savings years become exact. *Rejected:* freezing her share at your last working
  year's income ratio (changes every partner target), and keeping today's share for
  good (she would keep paying the same % after your income stops).
- **Yearly items are shared and lifelong.** Split with her like the joint account,
  and continued in retirement, so they raise the FIRE number by about
  yearly × tax ÷ SWR. *Rejected:* yours only; only while working.
- **"If alone" default includes yearly items:** 70% of (joint + yearly ÷ 12).
- **Read-outs, one source.** Rent in the joint account, her share today and
  "You really invest" all come from `investNowMonthly` in the engine.
- **Not in v1:** Revolut CSV import (fills the same four numbers later); comparing
  "You really invest" with IBKR deposits; the impact panel.

## 2026-11-20 · v8.6 Pay changes are plans

- A pay change (name, from, optional until, take-home, 0 = no pay) is a plan with an
  A–E switch per scenario, not a per-scenario field. When several apply, the latest
  start wins; an end year is inclusive; afterwards pay returns to normal.
- The old per-scenario income override / change year / new income are migrated once
  into plans (identical changes merge); the old fields stay saved but are not read.
- UI: labelled fields, year pickers ("For good" when no end), € amount field. Grid
  rows show the name, then amount · date on a second line.

## 2026-11 · v8.5 Fixed mode: tax rises with the gain fraction

- In fixed (DCF) mode, a sale k years into retirement is taxed on the gain fraction
  the remaining portfolio will have by then (`taxMultAfter`), not today's or the
  retirement-day fraction. *Why:* a flat gross-up understated the target by up to
  ~15%. The golden master was regenerated in its own commit.

## 2026-11 · v8.4 Windfalls are plans

- Each windfall has a switch per scenario (`off` lists the scenarios it is off for;
  default on everywhere). Windfalls still never reduce the FIRE target (AUDIT I8).

## 2026-11 · v8.3 Plans tab; a plan must be set up to count

- Property and Child live on the Plans tab. A plan that is not set up (no price, no
  child cost or leave) has no switch in the scenario grid and does not count in the
  calculation, so an empty plan can never silently change a result.
- Missing inputs that make a result meaningless show a banner and a "missing" cell
  instead of a number.

## 2026-11 · v8.2 Costs that end are set aside

- In % of portfolio mode the FIRE number = lifelong budget × tax ÷ SWR + present
  value of costs that end (child costs, mortgage payments). The projection pays those
  costs in full on top of the capped draw. *Why:* treating a mortgage or child cost as
  lifelong inflated targets and made margins jump. This "cliff" already existed
  before v8; it was not introduced by the redesign.

## 2026-11 · v8.1 Stop ages are automatic

- Each scenario stops at its earliest **funded** age (30–75): the card verdict is
  funded, the portfolio never runs out, and no year is infeasible. Setting the stop
  age by hand was removed. *Why:* you always stop at the first year you can, so the
  app should find it. Margin = net worth − FIRE number at that age.

## 2026-11 · v8.0 Today / Plans / Scenarios

- The app is split into facts about today (My Situation), things that might happen
  (Plans) and combinations of them (Scenarios). The scenario grid has labels on the
  left and one column per scenario, rows aligned whatever is switched on, switches
  as pills, and only plans that are set up appear.
- The two-person model applies only to scenarios with the partner switched on.
  Scenarios without her always use your own spending + your costs if alone
  (option B), never the Simple model's spending.
- "If alone" costs default to 70% of shared costs (one person spends about 70% of a
  couple: OECD-modified scale 0.67, square-root scale 0.71).
- Rent today is entered once, on My Situation; "rent saved" by buying is deduced
  from it.
- Labels are plain English.
- Planned, not built yet: the partner switch becomes a "Living alone" plan; dated
  versions of your inputs are stored inside the saved row (one Supabase row, additive
  payload changes only).

## 2026-11-14 · v7.3 Two-person model

- Each person keeps their own money: shared costs split pro rata to net incomes
  (clamped by a floor and cap), her surplus is her savings, not your income. Two
  results: Partial FIRE (your portfolio covers your cost) and Household FIRE (both
  stop). Full spec: the project doc "two-person-model-spec".

## Standing rules

- The headline FIRE number is the conservative one (no credit for income that has
  not started); credits only appear in the adjusted number (AUDIT I4).
- Every financial change ships with hand-computed tests; the golden master is only
  regenerated deliberately, in its own commit.
