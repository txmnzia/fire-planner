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
  recalc.js             Orchestrator: inputs → engine → all renderers, then persistence.
  sync.js               localStorage persistence + Supabase cross-device sync
                        (collectState/applyState, magic-link sign-in, polling).
  pensions.js           Pure (v8.9): pension countries, legal ages and the net estimate.
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
                        used by recalc and the Monte Carlo tab), the Scenarios
                        grid result cells (scenarioGridResults /
                        renderScenarioGrid) and the Results summary tiles.
    charts.js           Projection & allocation charts (Chart.js) and shared palette.
    table.js            Year-by-year detail table + CSV export.
    mcTab.js            Monte Carlo tab UI (cards, tiles, fan & histogram charts).
    explanation.js      Explanation tab: scenario-tailored story — lede + stat tiles,
                        visual phase timeline, per-phase chapter cards (today's-€
                        lifestyle meters, funding-mix bars, life-event list), and
                        concept explainers grounded in the scenario's own numbers
                        (reuses computeCardMetrics + engine rows; engine re-runs
                        with a feature off quantify life-event impacts).
    infoTips.js         Tap/click/hover bubbles for every (i) button (text from its
                        title); placeTip() is the pure, tested placement.
    plans.js            Plans tab: set-up badges on the plan cards, hides grid rows
                        of plans that are not set up (rule in checks.js), and one
                        grid row per windfall with a switch per scenario
                        (windfallSwitches / flipWindfall, pure and tested).
    issues.js           Red banner under the tabs listing missing inputs, with a
                        Fix button that jumps to the field.
    ibkr.js             IBKR CSV import and holdings list.
    nwHistory.js        Net-worth snapshot editor (plan-vs-actual inputs) —
                        compact datapoint rows shared with the windfall list.
    situation.js        My Situation tab enhancements: subject-card rail scroll-spy,
                        year-picker popover (buildYpick), sliders over the numeric
                        inputs, and the dynamic windfall datapoint list. Progressive
                        enhancement — the id-bearing inputs stay the source of truth.
                        Also paints the Pay changes card (renderPayList).
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
  fixtures/             v8-golden.json: 192 cases frozen from the v7.3 engine.
                        simple-mode-snapshot.json: project() output frozen before the
                        two-person model, so simple mode is proven unchanged.
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
