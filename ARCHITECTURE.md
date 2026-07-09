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
  seed.js               Classic (non-module) script: seeds default localStorage state
                        on first visit. Runs before the module graph loads.
  main.js               Entry point: init, swipe/scroll wiring, and the window bindings
                        for every function referenced by inline handlers.
  util.js               DOM/format helpers: el, numVal, optVal, fmt, eur, fmtK.
  state.js              Shared mutable state (one exported object) + feature toggles.
  inputs.js             Reads the form into plain objects: getGlobals(), getScenario(),
                        plus country tax table and scenario names.
  engine.js             PURE financial engine — no DOM, no shared state. Projection
                        loop, FIRE targets, annuities, mortgage, plan-vs-actual.
  montecarlo.js         PURE Monte Carlo engine — historical block bootstrap, seeded
                        PRNG, percentile bands. Depends only on engine.js.
  recalc.js             Orchestrator: inputs → engine → all renderers, then persistence.
  sync.js               localStorage persistence + GitHub Gist cross-device sync
                        (collectState/applyState, token handling, polling).
  ui/
    controls.js         Tabs, feature toggles, age sliders, withdrawal-mode switch,
                        labels, active-scenario selection, mobile nav.
    cards.js            Scenario milestone cards + Results summary tiles.
    charts.js           Projection & allocation charts (Chart.js) and shared palette.
    table.js            Year-by-year detail table + CSV export.
    mcTab.js            Monte Carlo tab UI (cards, tiles, fan & histogram charts).
    explanation.js      Explanation tab: scenario-tailored story — lede + stat tiles,
                        visual phase timeline, per-phase chapter cards (today's-€
                        lifestyle meters, funding-mix bars, life-event list), and
                        concept explainers grounded in the scenario's own numbers
                        (reuses computeCardMetrics + engine rows; engine re-runs
                        with a feature off quantify life-event impacts).
    ibkr.js             IBKR CSV import and holdings list.
    nwHistory.js        Net-worth snapshot editor (plan-vs-actual inputs).
tests/                  node:test unit tests for the two pure engines.
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
   └── scheduleSave() → localStorage → Gist ──┘ (applyState on load/sync)
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
