---
name: testing-and-ci
description: How to write, extend, and run tests for the FIRE planner and how CI works. Load before adding or modifying anything in tests/, before changing .github/workflows/ci.yml, when a financial bug fix needs its mandatory regression test, or when deciding whether some logic can be unit-tested under Node at all. Covers the zero-dependency node:test setup, the makeGl/makeSc fixture contract, hand-computed expectations, tolerance and property-test styles, and what is and is not testable without a browser.
---

# Testing and CI

## Running

```sh
node --test tests/*.test.mjs                              # all tests (Node ≥ 20; CI uses 22)
for f in js/*.js js/ui/*.js; do node --check "$f"; done   # syntax check (CI runs both)
```

Current state (verified): **25 tests, 25 pass** — 16 in `tests/engine.test.mjs`,
9 in `tests/montecarlo.test.mjs`.

There is no package.json and no test framework. Tests use only `node:test` and
`node:assert/strict`. **Never add a framework, an npm dependency, or a build step** —
the zero-dependency property is what lets the pure engines run identically in the
browser and under Node.

## Layout and naming

- Test files: `tests/<module>.test.mjs`, one per pure engine
  (`engine.test.mjs`, `montecarlo.test.mjs`). New pure logic gets a test in the
  matching file, or a new `tests/*.test.mjs` (the glob picks it up in CI automatically).
- Imports: `import test from 'node:test'; import assert from 'node:assert/strict';`
  then named imports from `../js/engine.js` / `../js/montecarlo.js`.

## The makeGl / makeSc fixture contract

Both test files define `makeGl(over = {})` and a scenario fixture mirroring **exactly**
what `getGlobals()` / `getScenario()` in `js/inputs.js` produce: rates already divided
by 100 (`inflation: 0.02`, `swr: 0.04`, `taxRate: 0.30`), monthly today's-money amounts
(`spendRet: 3000`), `invested` carrying the portfolio, `partnerAgeOff` instead of a
birth year, `windfalls` as `[{yr, amt}]`.

**Rule: if you add or rename a field in `getGlobals()`/`getScenario()`, extend `makeGl`
in BOTH test files (and `makeSc` in `engine.test.mjs`) in the same commit.** The engines
read `gl.newField` as `undefined` otherwise — tests keep passing against a stale input
shape and silently stop covering the code path you added. There is no shared fixture
module; the duplication between the two files is deliberate (each file stays runnable
standalone) but it means two places to update.

Variations are expressed as overrides, never by mutating: `makeGl({ wdMode: 'fixed' })`,
`makeSc({ retAge: 33, hasPartner: true })`.

## What a good engine test looks like here

**1. Hand-computed closed-form expectation, shown in a comment.** The expected value is
derived independently of the code under test. Real examples from `tests/engine.test.mjs`:

```js
test('mortgageAnnual: standard annuity payment for 3.5% / 25y', () => {
  const gl = makeGl();
  const principal = 400000 * 0.8, mr = 0.035 / 12, nm = 300;
  const expected = principal * mr * Math.pow(1 + mr, nm) / (Math.pow(1 + mr, nm) - 1) * 12;
  assert.ok(Math.abs(mortgageAnnual(gl) - expected) < 1e-6);
});

test('yearOneBudget: base case is inflated retirement spending', () => {
  const gl = makeGl(), sc = makeSc();
  const expected = 3000 * 12 * Math.pow(1.02, 10); // retire at 42, 10y from age 32
  assert.ok(Math.abs(yearOneBudget(42, sc, gl) - expected) < 1e-6);
});
```

Never compute the expectation by calling the function under test, and never paste in a
magic number the code produced ("golden" values lock in bugs).

**2. Tolerance style.** Floating-point comparisons use
`assert.ok(Math.abs(a - b) < eps)` with `eps` between `1e-6` and `1e-12` depending on
how much arithmetic accumulates. Use exact `assert.equal` only when the function's
contract is exact: integer outputs (`computeFireTarget` ends in `Math.round`), degenerate
closed forms (`annuityPV(100, 0.03, 0.03, 12)` is exactly `1200`), or counts/lengths.
Statistical MC assertions use wide tolerances with a message
(`assert.ok(Math.abs(gs - 0.07) < 0.01, \`stock geo-mean ${gs} not ≈ 0.07\`)`).

**3. Determinism.** Same inputs twice must produce identical output:
`project()` is compared with `assert.deepEqual(p1.values, p2.values)`; Monte Carlo is
deterministic only for a fixed `cfg.seed` (see
'runMonteCarlo: deterministic for a fixed seed'). Any new randomness must be driven by
the seeded `mulberry32` PRNG, and a determinism test added.

**4. Property-style tests** for shapes and orderings rather than exact values:
- percentile ordering: `p10 ≤ p50 ≤ p90` at every year of the MC bands;
- non-negativity: `p1.values.every(v => v >= 0)`;
- array alignment: `MC_HIST_STOCK.length === MC_HIST_BOND.length`; the projection
  horizon `values.length === gl.lifeExp - gl.currentAge + 1`;
- mode contracts: SWR results carry adequacy metrics (`fundedRate`, `ratioBands`),
  fixed-mode results carry `null` there.

## The regression-test rule

**Every financial bug fix ships, in the same commit, with a regression test whose
expected value is computed by hand** and whose comment cites the AUDIT.md finding. If
you can't hand-compute the exact value, assert the invariant that was violated.
Template (this exact test was run against the current engine and passes — F1/invariant
I1, the SWR target's tax gross-up):

```js
test('regression F1: SWR FIRE target includes the CGT gross-up at the tracked gain fraction', () => {
  // AUDIT.md F1: the SWR branch of computeFireTarget dropped taxMult, understating
  // the target by 1/(1 − gainFrac·taxRate). The target must equal the year-one
  // budget grossed up at the *at-retirement* gain fraction (I1), over the SWR.
  const gl = makeGl(), sc = makeSc();          // swr mode, retire 42, France 30%
  const p = project(sc, gl);
  const taxMult = 1 / (1 - p.gainFracAtRet * gl.taxRate);
  const expected = Math.round(yearOneBudget(42, sc, gl) * taxMult / gl.swr);
  assert.equal(p.fireTarget, expected);        // 1,255,587 on the reference fixture
});
```

## What is NOT unit-testable (and the one exception)

The `js/ui/` renderers, `js/inputs.js` form readers, and `js/sync.js` need a real DOM /
`localStorage` — there is no browser test harness and no jsdom (zero deps). **Keep
logic out of them**: computation belongs in `js/engine.js` / `js/montecarlo.js`, or in
`computeCardMetrics(sc, gl, proj)` in `js/ui/cards.js`.

`computeCardMetrics` is the exception, verified to work: `js/ui/cards.js` imports
`el`/`eur` from `js/util.js`, `state` from `js/state.js`, `getScenarioName` from
`js/inputs.js`, and engine functions — but none of those modules touch `document` at
module-evaluation time, so `import('./js/ui/cards.js')` succeeds under Node and
`computeCardMetrics(sc, gl, proj)` runs (it never calls `el()`). Two caveats when
testing it: it reads the shared `state.nwHistory` (import `state` and set/reset it
around the assertion), and its sibling render functions in the same file DO need the
DOM — call only `computeCardMetrics` and the `*RowHTML` helpers. If a future edit adds
a DOM call to it, move that call out — Node-testability of the card numbers is worth
protecting. Everything else in `js/ui/` is verified manually in the browser
(`python3 -m http.server 8000`; see the `release-checklist` skill).

## CI anatomy

`.github/workflows/ci.yml` — one job, runs on every push to `main` and on all PRs:
1. checkout + `actions/setup-node@v4` with Node 22;
2. `for f in js/*.js js/ui/*.js; do node --check "$f"; done` — catches syntax errors in
   DOM modules the tests can't load (a broken `js/ui/*.js` otherwise ships silently,
   and merging to main deploys it);
3. `node --test tests/*.test.mjs`.

New top-level js directories must be added to the syntax loop (in CI **and** in the
CLAUDE.md command). Local pre-commit equivalent, run before every commit:

```sh
for f in js/*.js js/ui/*.js; do node --check "$f"; done && node --test tests/*.test.mjs
```

## Coverage priorities for new tests

Highest-value gaps, in order:
1. **`project()` retirement-branch behaviours** — surplus reinvestment (I6), the
   deficit chain portfolio → cash → `infeasibleYear` (I5), partner salary through your
   retirement (I9/F2), SWR selling only `min(potentialGross, needGross)`.
2. **`computeFireTarget` branches** — DCF (fixed) mode two-period pension credits,
   `opts.otherIncomeCredit` (`fireTargetAdj`), windfall independence (I8 — note the
   target still moves slightly via `gainFracAtRet`, so assert on the credit logic, not
   raw equality).
3. **MC metric definitions** — `fundedRate`, `typicalCoverage`, `condShortDepth`,
   `worstYearP10` against small hand-built cases.
4. **`computeCardMetrics`** — agreement with `yearOneBudget` (`targetMonthly`) and
   `gainFracAtRet` (`netMonthly`), per the invariants agreement matrix.

**Always test both withdrawal modes**: any engine change gets exercised with the default
`makeGl()` (SWR) and `makeGl({ wdMode: 'fixed' })` — several audited bugs lived in
exactly one mode's branch (F1, F5, F7).
