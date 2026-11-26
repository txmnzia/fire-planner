# Architecture

The app is a **zero-build static site**: plain HTML + CSS + native ES modules, served
directly by GitHub Pages. There is no bundler, transpiler, package manager, or backend —
the only runtime dependency is Chart.js from a CDN, and the only tooling is Node's
built-in test runner in CI.

## Layout

```
index.html              Markup only (all tabs, forms, modals). No inline <style>/<script>
                        blocks — just inline on*="" handlers bound to window in main.js.
css/styles.css          All styles.
js/
  main.js               Entry point: init, swipe/scroll wiring, and the window bindings
                        for every function referenced by inline handlers.
  util.js               DOM/format helpers: el, numVal, optVal, fmt, eur, fmtK.
  state.js              Shared mutable state (one exported object) + feature toggles.
  inputs.js             Reads the form into plain objects: getGlobals(), getScenario(),
                        plus country tax table and scenario names.
  engine.js             PURE financial engine — no DOM, no shared state. Projection
                        loop, FIRE targets, annuities, mortgage, plan-vs-actual.
                        Also the two-person household model (partnerModel 'two'):
                        partnerShare, twoPersonCost, selfFundedCost, household target,
                        partner ledger (proj.partner / proj.household) — the single
                        source for every two-person number in the UI.
  montecarlo.js         PURE Monte Carlo engine — historical block bootstrap, seeded
                        PRNG, percentile bands. Depends only on engine.js.
                        mcBuildPaths + mcRunScenario (runMonteCarloOrdered runs the
                        active scenario first over one shared path set).
  mcWorker.js           v8.30: module Web Worker that only relays a run to
                        runMonteCarloOrdered and posts each scenario's result.
  recalc.js             Orchestrator: inputs → engine → all renderers, then persistence.
  sync.js               localStorage persistence + Supabase cross-device sync
                        (collectState/applyState, magic-link sign-in, polling).
  taxTable.js           Country tax presets (one table, shared by inputs and countries).
  countries.js          Pure (v8.11): country notes, residence periods, rent moves.
  yearEnd.js            Pure (v8.15): year-end amounts to raise and the history row.
  versionsCore.js       Pure (v8.14): snapshots, diffs, impact lines, prompts, review.
  (engine.js v8.24: rowCost, setAsideSchedule, purchasePV, risingTaxMult; see README)
  planVsActual.js       Pure (v8.20): frozen plan paths in versions, the plan pick, the
                        gap and years ahead/behind against the frozen plan.
  ibkr.js               Pure (v8.10): IBKR statement parser (total, positions, gain %,
                        as-of date, deposits) and the check-in read-outs.
  pensions.js           Pure (v8.9): pension countries, legal ages, the net rule the plan
                        uses (pensionNet, v8.19), the other-country list and the rights
                        one working year earns (accrualGrossMonthly, v8.27).
  netPay.js             Pure (v8.27): take-home from gross pay, Germany and France 2026
                        (and the inverse); for planned pay typed gross.
  health.js             Pure (v8.26): health insurance presets once you stop.
  assumptions.js        Pure (v8.9): market-assumption defaults and which ones differ.
  spendMigration.js     Pure (v8.8): maps payloads saved before the one-model spending
                        onto the four account numbers (migrateSpending).
  payChanges.js         Pure: pay-change plans (normalise, completeness, per-scenario
                        list, migration from the old per-scenario pay fields).
  checks.js             Pure missing-input checks (spending never entered) and the
                        plan set-up rule (plansSetUp / effectiveFeatures); the
                        grid shows "missing" instead of a €0 target.
  db.js                 Supabase client (shared txmnzia-dbs project, schema
                        fire_planner), lazy-loaded from a CDN, null when offline.
  ui/
    controls.js         Tabs, feature toggles, withdrawal-mode switch,
                        labels, active-scenario selection, mobile nav.
    cards.js            computeCardMetrics (single source of card numbers), the
                        automatic stop ages (earliestStopAge / withStopAges,
                        run once by recalc; Monte Carlo reuses them), the Scenarios
                        grid result cells (scenarioGridResults /
                        renderScenarioGrid) and the Results summary tiles.
    charts.js           Projection & allocation charts (Chart.js) and shared palette.
                        buildChart(projs, gl, bands) draws the MC range around the plan.
    table.js            Year-by-year detail table + CSV export.
    mcTab.js            Monte Carlo on the Results tab (v8.30): background runs
                        (markMcStale → scheduleMcRun → worker, latest wins, results
                        keyed by input generation), mcBandsFor (chart range),
                        mcHeadlineHTML (tile line), the grid row, How sure tiles,
                        Risk detail charts.
    explanation.js      Explanation tab: scenario-tailored story — lede + stat tiles,
                        visual phase timeline, per-phase chapter cards (today's-€
                        lifestyle meters, funding-mix bars, life-event list), and
                        concept explainers grounded in the scenario's own numbers
                        (reuses computeCardMetrics + engine rows; engine re-runs
                        with a feature off quantify life-event impacts).
    infoTips.js         Tap/click/hover bubbles for every (i) button (text from its
                        title); placeTip() is the pure, tested placement.
    defaults.js         Empty fields show the value they use (v8.28.1).
    pensions.js         Pensions from other countries ("+ Add a country", v8.19) and
                        the net read-out rows; the net rule itself is js/pensions.js.
    planLine.js         The plan line and "vs plan" for a scenario (v8.20): frozen
                        plan when there is one, else the re-calculated fallback.
    tiles.js            Changes tab (v8.17): tiles open in place, one-line summaries,
                        date badges, the phone impact bar. Tile bodies (v8.18.2) are
                        .frow fields (caption above controls) flowing side by
                        side, with − value + steppers.
    plans.js            Plans: set-up badges on the plan tiles, hides grid rows
                        of plans that are not set up (rule in checks.js), and one
                        grid row per windfall with a switch per scenario
                        (windfallSwitches / flipWindfall, pure and tested).
    issues.js           Red banner under the tabs listing missing inputs, with a
                        Fix button that jumps to the field.
    ibkr.js             IBKR CSV import and holdings list.
    nwHistory.js        Net-worth snapshot editor (plan-vs-actual inputs) —
                        compact datapoint rows shared with the windfall list.
    situation.js        Changes tab field enhancements (the old subject rail is gone),
                        year-picker popover (buildYpick), sliders over the numeric
                        inputs, and the dynamic windfall datapoint list. Progressive
                        enhancement — the id-bearing inputs stay the source of truth.
                        Also paints the Pay changes card (renderPayList).
    versions.js         Update panel: changes + impact, Save/Undo, log, restore,
                        first-run review, "Did this happen?" prompts (v8.14).
    housing.js          Planned rents, planned moves abroad, rent-today edit (v8.11).
    spending.js         Spending read-outs (v8.7, v8.8): rent in the joint account,
                        her share today, "You really invest" (engine
                        investNowMonthly), and the last-refresh date stamp.
tests/                  node:test suites: the two pure engines, the v8 golden master
                        (golden.test.mjs + golden-cases.mjs), the scenario grid
                        results, and markup wiring (ids, saved fields, handlers).
  tools/gen-golden.mjs  Regenerates fixtures/v8-golden.json (only in a commit that
                        deliberately changes a calculation).
  tools/set-version.mjs Sets the version in the header and as ?v= on css, main.js
                        and every relative import (browser cache busting).
  fixtures/             v8-golden.json: 128 cases: 96 classic + 32 shaped like getGlobals()
                        output (v8.24). consistency.test.mjs: ledgers, one budget, verdicts.
.github/workflows/ci.yml  Syntax-checks every module and runs the tests on push/PR.
```

## Data flow

```
form inputs ──getGlobals()/getScenario()──▶ plain gl/sc objects
                                              │
                     engine.project(sc, gl) ──┤ (pure: gl.invested carries the
                     montecarlo.runMonteCarlo │  portfolio; no DOM access)
                                              ▼
recalc() ──────────────▶ renderers (cards, charts, table, labels)
   │                                          ▲
   ├── markMcStale() (before drawing) ... scheduleMcRun() ──600 ms──▶ mcWorker.js
   │        results arrive per scenario ──▶ mcTab paints tiles, grid row, chart range
   └── scheduleSave() → localStorage → Supabase ┘ (applyState on load/sync)
```

Two conventions keep the module graph sane:

- **Mutable shared state lives on the `state` object** (`js/state.js`) and is always
  accessed as `state.x`, because ES module bindings are read-only for importers.
  Chart instances and Monte Carlo results are *module-private* to their UI module.
- **The engines are pure.** `engine.js` and `montecarlo.js` import nothing but each
  other and never touch the DOM, so they run unchanged under Node for unit testing.
  Everything they need arrives via the `gl` (globals), `sc` (scenario), and option
  arguments — e.g. the live portfolio total is threaded through as `gl.invested`.

There are a few intentional import cycles (`recalc ⇄ controls`, `recalc ⇄ sync`):
event handlers need `recalc`, and `recalc` needs the renderers. All cross-module
calls happen at event time (never during module evaluation), so the cycles are safe.

## Inline event handlers

The HTML (and some render functions that emit HTML strings) reference global functions
like `recalc()`, `switchTab()`, `updateNwRow()`. Module scope isn't global scope, so
`main.js` exposes exactly this set via `Object.assign(window, {...})`. If you add a new
inline handler, add its function there.

## Running locally

ES modules don't load over `file://` — serve the directory over HTTP:

```sh
python3 -m http.server 8000       # then open http://localhost:8000
```

## Tests

```sh
node --test tests/*.test.mjs      # Node ≥ 20, no dependencies
```

CI (`.github/workflows/ci.yml`) runs the same on every push and pull request.
