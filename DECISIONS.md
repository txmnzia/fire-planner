# Decisions

Product and modelling decisions taken with the owner, newest first, with the reason
for each and what was rejected. The formulas themselves live in README.md; past bugs
in AUDIT.md. When a decision here changes, add a new entry rather than rewriting the
old one, so the history stays readable. No personal figures here (CLAUDE.md rule 7).

## 2026-11-26 · Spec for #21: Monte Carlo merged into Results (not built yet)

- **The chart line stays the fixed plan** (your own return assumptions); Monte Carlo
  draws 10–90% and 25–75% bands around it. *Rejected:* the MC median as the main line
  (it would disagree with the year-by-year table, tiles and stop ages below it).
- **Recentering is always on; the checkbox goes.** The range must be centred on your
  own return assumptions. *Rejected:* keeping it as an option (with it off the bands
  use history's ~9.4% stock return and drift away from the plan line).
- **MC runs in the background in a Web Worker** after each change (debounced, latest
  run wins, active scenario first). No Run button. Stale output stays dimmed (T5).
- **The Monte Carlo tab is removed**: headline chance on the Results tiles and as a new
  row in the Scenarios grid, the 4 detail tiles under the chart, histogram in a
  collapsed "Risk detail". Settings (paths, block length) move to Assumptions.
- **Confidence-based stop age is a separate change** (#22), not part of #21.

## 2026-11-26 · v8.29.1 Western countries added

- Japan, United Kingdom, United States, Canada, Australia, New Zealand, Singapore, South
  Korea and Taiwan are in the list too (70 countries), with notes on residence limits and
  fund rules (e.g. US PFIC rules on European ETFs).

## 2026-11-26 · v8.29 Realistic retirement countries, sorted by name

- **61 countries** where an EU early retiree can realistically live (e.g. Thailand,
  Vietnam, Malaysia, Georgia, Panama; not Myanmar; countries without a residence route
  for retirees left out), sorted by name, each with a researched 2026 rate on gains and
  a note. The list shows names only; the rate is the tax-on-gains field.
- **Existing presets corrected for 2026:** France 31.4, Spain 21, Netherlands 36, Belgium
  10, Ireland 38, Greece 0 (UCITS), Croatia 0 (held over 2 years), Romania 16, Bulgaria 0
  (EU market), Estonia 22, Latvia 25.5, Lithuania 20, Slovakia 0, Denmark 37.
  *Rejected:* modelling wealth taxes and yearly taxes on unrealised gains here.

## 2026-11-26 · v8.28.1 Empty fields show the value they use

- **Transparency rule:** a field that falls back to a preset or another field shows
  that value in grey (tax on gains, health insurance, child benefit, buying costs,
  fixed-rate years, rate after, charges, gross pay), never "preset" or "estimate".
  Values that depend on the country list each country of the plan in order ("259 → 0").

## 2026-11-26 · v8.28 Child benefit and Germany's yearly fund tax

- **Child benefit lowers the child cost** (Germany Kindergeld, France none for a first
  child), by the country you live in each year, while the cost runs and at most until
  25; a typed amount wins. *Rejected:* the German tax allowance instead (worth a little
  more at high incomes; left out, conservative).
- **Germany's yearly fund tax (Vorabpauschale) is modelled** in every German year: paid
  from the portfolio, credited to the cost basis. The 2026 Basiszins is kept for later
  years.

## 2026-11-26 · v8.27 Gross pay for pension rights; planned pay typed gross

- **Today: both.** Take-home stays what you live on; gross pay is added only to count
  pension rights. Empty gross = no rights beyond the statements (they show what is
  earned so far).
- **Pension rights accrue per working year until each scenario's stop age**, in the
  country you live in that year (Germany: earnings points; France: basic + Agirc-Arrco,
  full rate assumed at the pension age set). *Rejected:* a flat yearly add-on.
- **Planned pay is typed gross**; the take-home is estimated (Germany or France 2026,
  simplified) and editable.
- **Tax household is a setting** (not married / married or PACS); the child counts in the
  household once born. The default is not married.

## 2026-11-26 · v8.26 Health insurance once you stop; planned pay keeps its value

- **Health insurance is a cost from your stop age until your first state pension**
  (then the pensioner insurance is inside the pension deduction). Empty field = a
  preset for the country you live in that year (README lists the presets and their
  sources); a typed amount wins everywhere. It is on your side only (never split) and
  a cost that ends (set aside in % mode). *Rejected:* paying it for life (it would
  double-count the pension deduction).
- **Everything is in today's money, planned pay included:** the year-end close raises
  planned pay changes by inflation by default, like other amounts nothing refreshes.
- Windfalls are typed **after tax**, in euros of that year (unchanged), now labelled so.
- Next (v8.27, decided): today keeps take-home (for spending) and adds gross pay (for
  pension rights only); future pay changes are typed gross with an estimated net shown
  and editable; pension rights accrue per working year in the country you work in.

## 2026-11-26 · v8.25 Four audit decisions

- **% mode: every retirement year funded.** A stop age counts as funded only if no year
  of the deterministic projection falls below its budget (% mode cannot borrow from a
  pension that starts later). The grid says "Short in <year>" when only a later year is
  short. Side effect: the stop age is now monotone (audit F7 resolved).
- **The purchase price is today's money**, paid grown with inflation to the purchase
  year (house prices assumed to follow inflation, 0% real); a home you own keeps the
  price paid. *Rejected:* "price in the purchase year".
- **Her pension is used net** like yours (country deduction; her pension row has a
  country, default Germany).
- Germany's rate on equity-ETF gains stays 18.5% (26.375% × 70% after the 30% partial
  exemption); church tax and the yearly allowance are not modelled.

## 2026-11-26 · v8.24 Audit fixes (fresh-eyes review)

- **Every sale pays tax**, including before you stop (purchase cash, low-pay years).
- **% mode reserve:** the costs that end and a home bought after you stop are set aside
  (rising gain fraction) and never counted as drawable; the reserve follows a schedule
  fixed at the stop age and is released as those costs end. With the partner, your
  share-income follows the same definition as at the target (one budget).
- **Display:** the year table adds up (her contribution, ownership, the reserve); the
  Explanation tab uses one cost definition; the card's verdict, chip and margin share
  one basis (cash outside the FIRE number in % mode).
- Direction: stop ages can only move later (the untaxed sales and the double-counted
  reserve were optimistic). Open decisions: AUDIT.md 2026-11 F3, F7, F8, F9.

## 2026-11-26 · v8.23 The Simple model's code is gone

- **Engine cleanup, no visible change:** the Simple-model branches (spending × the
  partner multiplier, her salary added to your income) were kept since v8.8 only for
  the golden master. They are removed with `isTwoPerson`; the golden master keeps its
  96 one-model cases (unchanged) and drops the 96 Simple-model ones, in its own commit.
  Hand-computed tests that used Simple-model fixtures now use "alone" fixtures with the
  same totals (own spending + costs if alone). The owner's results are unchanged.

## 2026-11-26 · v8.22 Your home

- **"Yes, we bought" makes the purchase a fact:** on in every scenario (the grid row
  goes), its cash is never charged again (it already left the portfolio you import),
  rent today goes to 0 and the joint transfers drop by the rent, split like today.
- **The Buying a home tile becomes "Your home"** in the Now lane (the rent tile hides):
  loan left, payment until the fixed rate ends and after, payoff year, equity today.
  Her share of the cash and "rent that stops" hide.
- **Rule from then on:** keep the loan payment and home charges out of the joint
  transfers; the plan adds them, split like the joint costs (Spending says so). The
  year-end rollover never raises the price of a home you own.
- "Not bought after all" undoes it: rent, transfers and the scenario switches return.

## 2026-11-26 · v8.21 Read-outs and log details

- **Read-outs** (from the v8 stories; no number changes): Flat move "joint account after
  the move" (joint today − rent today + new rent); Buying a home "your cash needed"
  (`purchaseCostFor`: price × (down payment + buying costs), minus her share);
  Partner "pro rata today would be X%" next to what she really pays.
- **Update log:** each entry folds "What changed", field by field (old → new), with the
  names the Changes tab shows. Check-in date stamps are left out (noise).

## 2026-11-26 · v8.20 Plan vs actual against a frozen plan

- **The plan is frozen when saved** (spec reviewed by the owner): every saved version
  keeps each scenario's expected net-worth path; "vs plan" and the dashed plan line
  compare today with that path, so changing an assumption no longer moves the plan.
- **Which version is the plan:** the one picked with "Use as plan" in the log, else the
  latest year-end close (each year measured against the plan of 1 January), else the
  latest save. Paths kept for **every** version (owner's choice; about 2 KB each).
- The card adds the € gap ("+€23k") next to years ahead/behind. Mid-year, the plan is
  read between its yearly points from the save date. Scenarios are matched by column.
- Versions saved before v8.20 have no path: while one is the plan, the old
  re-calculation is used and labelled so.

## 2026-11-24 · v8.19.1 The stricter FIRE number in % mode

- **When your cost rises later, the FIRE number includes it** (owner's decision; the
  open question since v7.3). In % of portfolio mode the headline was the year-one
  number, with a higher "w/ later changes" figure beside it when her share falls later
  (she stops before her pension). Now the higher one is the headline, and a stop age is
  funded only when the portfolio reaches it. *Effect on the owner's scenarios:* none
  today (she works until her pension age, so her share never falls); it matters as soon
  as a plan has her stop earlier. Golden master: 14 two-person % mode cases, FIRE target
  only (no projection moved), regenerated in its own commit.

## 2026-11-24 · v8.19 Pensions net, any country

- **The plan uses net pensions** (the owner: "what ends up in my bank account, not
  considering income tax"). Typed gross as printed; Germany −12.4%, France −9.1% (health
  and social charges). Income tax is still not deducted. A pension that starts after
  the stop age gets no credit in the headline target, so only the adjusted target moves.
- **"+ Add a country"** under Germany and France: country, gross amount, start age,
  and the % taken off at payout (no preset outside Germany and France: empty = 0%).
  Same row layout as Germany and France; included in the year-end inflation rollover.

## 2026-11-24 · v8.18.5 A light impact panel

- **"Impact on your scenarios" shows only what matters** (the owner): per scenario, the
  stop age (saved → now when it moved) and the FIRE target now as €1.41M, with an up
  or down icon when it moved by more than 0.5% since the saved version. The
  field-by-field list and the net worth at the end are gone; changed fields are
  already marked in the tiles. Save / Undo stay.
- **One narrow column** (280px instead of 360px), so the tiles get the width.

## 2026-11-24 · v8.18.4 New plans start switched off; flat move after buying

- **A new plan is on in no scenario** (the owner): a new pay change, flat move, move
  abroad or windfall starts with every scenario switch off; you switch it on in the
  Scenarios grid. Buying and the child are no longer on by default in scenario E for a
  first visit either. Plans saved before keep their switches.
- **A flat move in or after the purchase year has no effect where you buy** (found
  from the owner's report that his flat move changed nothing: it started the year he
  buys, in every scenario). That is correct, not a wiring bug: from the purchase there
  is no rent, and the rent of that year is exactly what buying saves, with or without
  the partner (tested). The tile and the grid row now say so and name the scenarios.

## 2026-11-24 · v8.18.3 Every line ends on the right edge

- **Left-right alignment in every tile** (the owner): fields are packed by their real
  size, then the fields and their boxes (money, years, steppers, pickers) grow so each
  line of a tile ends on its right edge. Words between boxes keep their size.
- A field's own controls never split across lines on a normal tile; on a phone-width
  tile a field with several controls takes its own line, single boxes still pair up.
- List items (pay changes, rents, moves, windfalls) follow the same rule.

## 2026-11-24 · v8.18.2 Fields flow across the tile

- **Caption above, fields side by side:** every field has its name above it and the
  fields of a tile sit next to each other, wrapping only when the line is full (the
  owner: the right half of each tile was empty). Supersedes the label column of v8.18
  and the captioned groups of v8.18.1; a field still keeps its own controls together
  ("€ … until age …", "3.5% over 25 yrs").
- **No cut numbers:** money fields are a fixed 150px with no inner padding, enough for
  1,250,000 next to "/mo"; steppers fit 19.75. Checked in the browser with worst-case
  values at four widths.

## 2026-11-24 · v8.18.1 Related values on one line

- **Values that belong together share a line**: returns (stocks, bonds, inflation), bond
  share (now, when you stop), withdrawal (strategy and rate), joint transfers (you, she),
  cash and its interest, country and its tax rate, birth date and plan-until age, her
  take-home and her stop age, down payment and buying costs.
- **Two layouts, one rule:** parallel values get a small caption above each (stocks /
  bonds / inflation); a value that reads as a sentence uses a word between
  ("3.5% over 25 yrs"). Steppers are narrower so three fit on a line in a lane.
- The Assumptions tile is about a third shorter; the defaults note and Reset sit at
  its end.

## 2026-11-24 · v8.18 Compact tiles, one line per subject

- **One line per subject** in every tile: the label on the left, all the controls of
  that subject on the same line (e.g. "Your parental leave [months] at [€/mo]", then the
  same for her). Under ~400px of tile the label goes above its controls.
- **Steppers instead of sliders:** rates, ages and months are "− value +" (the owner's
  idea); typing still works. Sliders took two lines each and were rarely dragged.
- **"You" and "Partner" are separate tiles:** the old "You + partner" tile mixed both and
  was unclear. "Plan start year" is renamed **"Plan year (today)"** and moved to
  Assumptions, with a note: the year the plan counts as today (ages and today's money
  start on 1 January of it; it moves on when you close the year).
- **No scenario switches in the Changes tab:** the "Used in A–E" chips are gone; plans are
  switched only in the Scenarios grid (one place, as decided in v8.17).
- **Windfalls have a name**, shown as the label of their row in the Scenarios grid and in
  the tile summary. Saved with the windfall; optional ("Windfall" when empty).

## 2026-11-24 · v8.17 One Changes tab with two lanes

- **My Situation and Plans merged into "Changes"** (the owner's idea): a "Now" lane of
  facts and a "Might happen" lane of plans, tiles that open in place, the impact panel
  beside them. Scenarios stays its own tab. Closer to the chosen mockup ("pick a tile").
- **Why the earlier versions didn't look like the mockup:** the stories were built into
  the existing long cards to keep each increment small; the tile layout was never an
  increment of its own. Corrected here.
- **Planned rents and moves abroad are plans**, switched per scenario like the others
  (a small engine change: each scenario carries its own move lists, read through
  `scGl`; formulas unchanged). Rent today and the country today stay facts.
- **An IBKR import is a net-worth snapshot**, one per year (a later import that year
  replaces it); snapshots can also be typed. The check-in block and the typed-total
  fallback are gone. Known simplification: a mid-year import is stored as that year's
  snapshot (history rows are start-of-year).
- **No variants:** alternatives are handled by switching plans per scenario in the grid.

## 2026-11-24 · v8.16 Edited fields are visible

- A field edited since the last saved version turns amber ("was X" on hover) and its
  card counts its changes, until the next Save update.

### Still open after v8.16

- Remove the Simple-model engine path (kept only for the golden master's 96 cases).
- Pensions are used gross in the plan (net estimate shown only).
- Plan vs actual still re-projects with today's assumptions (not the plan saved then).
- "Owner mode" after a purchase (loan left, end of the fixed period) beyond the prompt.
- Revolut CSV import for the four spending numbers.

## 2026-11-24 · v8.15 Year-end rollover

- The closing net worth is stored as **1 January of the next year** (history rows are
  start-of-year, like the projection), not as the closed year.
- Amounts in today's money not refreshed during the closed year are raised by
  inflation; **pay is not raised by default** (no raise is the realistic default; type
  one if you got it).
- The year's average income and spending are not written to the history row yet.

## 2026-11-24 · v8.14 Versions, impact, prompts, first-run review

- **Versions inside the saved row** (as decided earlier): last 30, each a copy of the
  settings plus the five results at that moment, so the log can show "what it did at the
  time" without recomputing old inputs. Autosave is unchanged; a version is an extra.
- **Restore never deletes**: today's settings are kept as a version first, and the
  restore itself becomes a version.
- **Impact panel** compares with the last saved version (stop age, FIRE number, net
  worth at the end), so every edit shows its effect on all five scenarios.
- **"Did this happen?"** for plans whose year arrived; Yes turns them into facts.
- **First run**: a "Before Life update" version and a one-time review list.
- Not done: comparing actual net worth with the plan as saved at the time (the plan
  line still re-projects with today's assumptions).

## 2026-11-24 · v8.13 Buying

- **Fixed-rate period and rate after** from a bank offer; the payment is recomputed on
  the balance left, same end date.
- **Ownership charges + upkeep** count for good from the purchase year. Left empty they
  count as 0 but the banner warns (owning would look cheaper than it is).
- **Her share** of the down payment and buying costs comes from her savings.
- **Buying costs default to the country you live in that year** (Germany 10%, France 8%).
- **Home equity** is shown when you stop (price growing with inflation, no real price
  growth assumed) and is never counted in the FIRE number: you live in it.
- Not done: "Did you buy?" owner mode (with the prompts, v8.15).

## 2026-11-24 · v8.12 Her parental leave

- Her leave (months, leave pay) lowers her income in the birth year; that year the split
  follows both incomes instead of what she pays in today, exactly like your own leave.
- Defaults stay empty (personal data): the bubbles give typical German values instead.

## 2026-11-24 · v8.11 Housing and where you live

- **Rent lives in one place** (rent today) and is part of the joint account; planned
  rent changes swap only the rent. Editing rent today moves both joint transfers by the
  same amount, split like today's.
- **Where you live, year by year:** tax on gains at the rate of the country you live in
  when you sell; cost of living (% of today, default 100%) scales everything except
  housing and child costs. No invented cost-of-living presets: 100% until you type one.
- **Germany's preset is 18.5%** (equity-fund partial exemption), not 26%.
- **Bug fixed: buying while living alone saved 100% of the rent** although only 70% of
  it was in the "if alone" costs; it now saves the 70%. Solo stop ages can move a few
  years later; partner scenarios are unchanged.
- **The retirement % change no longer applies to rent** (rent is explicit now).
- Today's country stays what was saved (no number moves); the review banner asks
  where you live today and when you move.

## 2026-11-24 · v8.10 Portfolio check-in

- An import keeps its **as-of date** and the period's **deposits**; every check-in is
  logged so the next one shows what was added and what the markets did.
- *Added vs markets* is only split when the new statement starts at the last check-in
  (within 3 days): with a year-to-date or longer statement the deposits would cover a
  different span, so only the change is shown rather than a wrong split.
- History rows are not written by a check-in (the year-end rollover does that).

## 2026-11-24 · v8.9 Pensions per country, assumption defaults, "Living alone"

- **One pension per country** (Germany from 67, France from 64), each typed gross as
  printed and used gross. A net estimate (certain social charges only, no income tax)
  is shown next to it but does not feed the plan. *Open question for the owner:*
  using net pensions in the plan would lower them by ~10–12% plus income tax.
- **Assumptions show their defaults** and reset in one tap.
- **Check-in dates** on spending (6 months) and pensions (12 months) turn red when due.
- **The grid's partner switch reads "Living alone"** (on = without her): she is the
  default, living alone is the what-if. Saved switches are unchanged.

## 2026-11-23 · v8.8 One partner model, fewer fields

- **One model.** The Simple model (household spending × multiplier, her salary added
  to your income) is gone; it was the wrong shape and doubled every spending field.
  *Rejected:* "our total spending split pro rata" (her personal spending would count
  as yours) and "my spending × a coefficient" (a guess where a measured number exists).
- **Four numbers straight off the accounts:** your own spending, you pay into joint,
  she pays in, yearly items. The joint total is the sum of the two transfers, so it
  can never disagree with them.
- **One rule for the split, no floor or cap.** Her real share (she pays in ÷ joint)
  while you both work **and your pay is today's**; otherwise her income ÷ both incomes.
  *Why the pay condition:* what she pays in is today's arrangement between today's
  incomes. Without it, a scenario where your pay drops (or parental leave) kept her at
  today's low share and could push a stop age back by many years. With it, stop ages
  are unchanged.
- **Household FIRE removed**, with her savings, her own spending, her unrealized gain
  and the "could she manage alone" check. *Why:* the owner never looks at it and she
  does not plan to stop working; your stop ages only ever used your own FIRE number.
  Consequence: after she stops, her income is her pension only (no draw from savings
  that are no longer entered), which is slightly conservative for you.
- **Retirement spending = one % change** on everything (own, joint, yearly items,
  costs if alone) instead of two separate amounts. Costs if alone are always derived
  (70%), no field.
- **Migration:** older payloads keep today's numbers exactly (her amount = what she
  paid in, else today's pro-rata share with the old cap); old fields stay in the saved
  row, unread, so nothing is lost. The Simple-model engine path stays for the golden
  master; removing it is a later cleanup.

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
