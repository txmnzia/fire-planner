# FIRE Planner

Browser-based FIRE (Financial Independence / Retire Early) calculator. Zero-build static
site: plain HTML + CSS + native ES modules on GitHub Pages. Only runtime dependency is
Chart.js from a CDN; only tooling is Node's built-in test runner. One real user relies on
the numbers this app produces to make retirement decisions — **a wrong number is worse
than a crash**, because a crash gets noticed.

## Commands

```sh
python3 -m http.server 8000        # run locally (ES modules don't load over file://)
node --test tests/*.test.mjs       # unit tests (Node ≥ 20, zero dependencies)
for f in js/*.js js/ui/*.js; do node --check "$f"; done   # syntax check (CI does both)
```

There is no package.json, no npm install, no build step. Do not introduce one.

## Map

| Path | Role |
|---|---|
| `js/engine.js` | **Pure** financial engine: `project()`, `computeFireTarget()`, `yearOneBudget()`, annuities, mortgage, plan-vs-actual. No DOM, no imports except within `js/`. |
| `js/montecarlo.js` | **Pure** Monte Carlo: historical block bootstrap, seeded PRNG, percentile bands. Imports only `engine.js`. |
| `js/inputs.js` | Reads the form → plain `gl` (globals) / `sc` (scenario) objects. Country tax table. |
| `js/state.js` | Shared mutable state object + per-scenario feature toggles. |
| `js/recalc.js` | Orchestrator: inputs → engine → every renderer → persistence. |
| `js/sync.js` | localStorage persistence + GitHub Gist cross-device sync. `SYNC_FIELDS` lives here. |
| `js/main.js` | Entry point; binds every inline-handler function onto `window`. |
| `js/ui/*` | Renderers: cards, charts, table, Monte Carlo tab, IBKR import, net-worth history. |
| `js/seed.js` | Classic (non-module) script: seeds default state on first visit only. |
| `tests/` | `node:test` suites for the two pure engines. |
| `AUDIT.md` | The 2026-07 financial/technical audit and its resolution. **Read it before touching financial logic** — it is the list of mistakes already made once. |

## Iron rules

1. **The engines stay pure.** `engine.js` and `montecarlo.js` must never touch the DOM,
   `window`, `localStorage`, or the shared `state` object. Everything arrives via `gl`,
   `sc`, and `opts`. This is what makes the numbers testable under Node — break it and
   the tests silently stop covering reality.
2. **One number, one function.** Any figure shown in more than one place (cards, tiles,
   charts, Monte Carlo, FIRE target) must come from one shared function
   (`yearOneBudget`, `computeCardMetrics`, …). Duplicated display math *has already
   drifted once* (AUDIT.md T8). Never copy a formula between renderers.
3. **Every new input goes four places**: `index.html`, `getGlobals()`/`getScenario()` in
   `js/inputs.js`, `SYNC_FIELDS` in `js/sync.js`, and the README parameter table.
   Missing `SYNC_FIELDS` means the value silently resets on reload (AUDIT.md T2).
   Load skill `adding-an-input` before doing this.
4. **Financial-logic changes require the `financial-invariants` skill loaded** and its
   checklist run before commit. Return inputs are geometric/CAGR everywhere; tax uses
   the gain fraction **at retirement**, not today's; budgets come from `yearOneBudget`.
5. **Tests before commit, always** — `node --test tests/*.test.mjs` plus a syntax check.
   A financial change without a new hand-computed test expectation is not done.
6. **Never bake secrets or tokens into served files** — not even obfuscated. This was
   done once and is documented as the S1 incident in AUDIT.md. Tokens are pasted
   per-device and live in `localStorage` only.
7. **This repo contains the owner's real personal financial data** (`SAM_STATE` in
   `js/sync.js` and `js/seed.js`: DOB, income, holdings). Do not copy it anywhere new,
   do not commit more of it, and warn the user before anything that would make the repo
   or the deployed page public (AUDIT.md S3).
8. **Docs move with code.** If behaviour changes, update README.md (calculation logic)
   and ARCHITECTURE.md (module layout) in the same commit. README↔code drift caused an
   entire audit section (AUDIT.md Part 5).

## Skills — load before you act

| When the task involves… | Load |
|---|---|
| Any change to FIRE targets, budgets, tax, withdrawals, projections | `financial-invariants` |
| Editing `js/engine.js` (projection loop, DCF, plan-vs-actual) | `engine-development` |
| Editing `js/montecarlo.js` or MC metrics/tab | `monte-carlo` |
| A number on screen looks wrong / two views disagree | `debugging-numbers` |
| Adding or changing a user input / parameter | `adding-an-input` |
| localStorage, Gist sync, seeding, state migration | `state-and-sync` |
| Tabs, cards, charts, handlers, anything in `js/ui/` or `index.html` | `ui-conventions` |
| Writing or extending tests, CI questions | `testing-and-ci` |
| Auditing the financial logic for correctness | `financial-audit` |
| Shipping: version bump, deploy, pre-release verification | `release-checklist` |

When in doubt between two skills, load both — they are short. If a task spans financial
logic at all, `financial-invariants` is mandatory, not optional.
