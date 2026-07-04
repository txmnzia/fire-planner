---
name: ui-conventions
description: Conventions for all UI work in the FIRE planner — index.html, css/styles.css, and every module in js/ui/ (cards, charts, table, mcTab, ibkr, nwHistory) plus js/main.js, js/recalc.js, js/state.js. Load before adding/renaming an inline handler, a tab, a scenario field, a chart, a renderer, or any mobile/swipe behaviour. Covers the window-binding rule, module-scope vs global scope, shared-state rules, the safe import cycles, the recalc rendering pipeline, computeCardMetrics as single source of card numbers, Chart.js patterns, and the 5-scenario structure.
---

# UI conventions

Financial rules live in the `financial-invariants` skill — load it too if your UI change
touches any displayed number. This skill is about how the UI layer is wired.

## Inline handlers: every referenced function must be on `window`

`index.html` uses inline `on*=""` attributes everywhere (`onclick="recalc()"`,
`oninput="updateAge(1)"`, …), and several renderers emit HTML strings containing more of
them: `renderSummaryTiles` in `js/ui/cards.js` emits `onclick="setActiveScenario(i)"`,
`renderMcCards` in `js/ui/mcTab.js` emits `onclick="selectMcScenario(i)"`,
`renderNwHistory` in `js/ui/nwHistory.js` emits `updateNwRow`/`removeNwRow`.

ES module scope is NOT global scope: a function exported from a module does not exist as
a global. `js/main.js` therefore binds the complete set via `Object.assign(window, {...})`.

**Rule:** any function referenced by an inline handler — in HTML or in an HTML-emitting
renderer — must be added to that `Object.assign(window, {...})` block in `js/main.js`.

**Symptom when forgotten:** no error at load, no error in CI (syntax check passes,
tests pass). The app looks fine until the user clicks, then
`Uncaught ReferenceError: myFn is not defined` fires at click time only. Always test the
actual click in the browser, not just page load.

## Shared mutable state

- Cross-module mutable state lives on the single exported `state` object in
  `js/state.js`, and is always read/written as `state.x` (`state.activeScIdx`,
  `state.ibkrTotal`, `state.nwHistory`, `state.lastProjs/lastGl/lastScenarios`).
  Reason: ES module bindings are read-only for importers — `import { x }` can never be
  reassigned from another module, but properties of an imported object can.
- Per-scenario feature toggles live on the exported `features` object in `js/state.js`
  (`features[s].partner|prop|child`, s = 1..5); toggled via `toggleFeature` in
  `js/ui/controls.js`, mirrored to the DOM by `updateToggleUI`.
- Chart.js instances stay **module-private** (`let chart, allocChart` in
  `js/ui/charts.js`; `let mcFanChart, mcHistChart` in `js/ui/mcTab.js`). Other modules
  never touch them directly — they call the exported `resizeResultsCharts()` /
  `resizeMcCharts()`. Monte Carlo results (`mcResults`, `mcGl`, `mcActiveIdx`) are
  likewise module-private to `js/ui/mcTab.js`. Do not move any of these onto `state`.

## Import cycles — intentional, and what keeps them safe

`recalc ⇄ controls` and `recalc ⇄ sync` are deliberate cycles: event handlers need
`recalc()`, and `recalc()` needs the renderers/persistence. They are safe because **all
cross-module calls happen at event time, never during module evaluation**. Top-level code
in every module is limited to imports, constant definitions, and function definitions
(the one exception: `main.js` registers a `DOMContentLoaded` listener).

**Rule:** never add a top-level call into any module in these cycles (no `recalc()` at
module scope, no top-level DOM reads that depend on another cycle member). During a
cycle, the partially-evaluated module's function bindings are hoisted but anything else
may be undefined — a top-level call breaks the whole app at load with a confusing error.

## The rendering pipeline

`recalc()` in `js/recalc.js` is the one orchestrator. Its exact sequence:

1. `getGlobals()` → `gl`; update portfolio pills and calc-time header.
2. `getScenario(s, gl)` for s = 1..5, then `project(sc, gl)` for each → `projs[]`.
3. `renderMilestone(i+1, sc, gl, projs[i])` for each scenario card.
4. Cache `state.lastProjs / lastGl / lastScenarios` (used by `setActiveScenario` and
   `downloadCSV` to re-render without recomputing).
5. `buildChart(projs, gl)`, `buildFlowChart(projs, gl)`, `renderTable(projs, gl)`,
   `updateLabels()`, `renderSummaryTiles(projs, gl, scenarios)`.
6. `markMcStale()` — MC results on screen were computed for the previous inputs
   (AUDIT.md T5); this dims `.mc-body` and sets the "Inputs changed" status. Never
   remove this call.
7. `scheduleSave()` — persists to localStorage and debounces a Gist sync.

**Adding a renderer:** export a `renderX(projs, gl)` from a `js/ui/` module and call it
from `recalc()` between steps 3 and 6. If it must react to active-scenario changes
without a recalc, also call it from `setActiveScenario` in `js/ui/controls.js` using the
`state.last*` caches. It must not throw — see the Chart.js section.

## One source for card/tile numbers (AUDIT.md T8)

`computeCardMetrics(sc, gl, proj)` in `js/ui/cards.js` is the single source of every
financial figure shown on the Scenario cards AND the Results summary tiles
(`netMonthly`, `targetMonthly`, `fireTarget`, `coastNow`, `depletionYear`, `vsPlan`, …).
The two views duplicated ~60 lines of this logic once and drifted (T8). **Never compute
a display financial figure inline in a renderer** — extend `computeCardMetrics` (or the
shared row helpers `vsPlanRowHTML`/`infeasibleRowHTML`/`fireNumRowHTML`) and consume the
result in both `renderMilestone` and `renderSummaryTiles`. Check the agreement matrix in
the `financial-invariants` skill before touching it.

## Chart.js conventions

- Chart.js 4.4.1 loads from the cdnjs CDN as a classic script in `index.html` — it is a
  global `Chart`, not an import.
- **Every function that constructs a chart starts with
  `if (typeof Chart === "undefined") return;`** (see `buildChart`, `buildFlowChart`,
  `buildMcFanChart`, `buildMcHistChart`). Chart calls happen inside `recalc()` *before*
  `markMcStale()`/`scheduleSave()`, so an unguarded throw would abort recalculation and
  kill auto-save (this happened; fixed alongside AUDIT.md v6.5). New chart code gets the
  same guard, and anything else risky in a renderer gets wrapped so recalc completes.
- Destroy/rebuild pattern: keep the instance in a module-private `let`, then
  `if (chart) chart.destroy();` immediately before `new Chart(ctx, …)`. No incremental
  `chart.update()` anywhere — rebuild is the convention.
- Shared palette exports from `js/ui/charts.js`: `COLORS`, `COLORS_FADE`, `ALPHAS`
  (per-scenario), `FIRE_LINE` (neutral reference line), `GC` (grid/tick/font defaults).
  `js/ui/mcTab.js` imports these — never restate hex values in a chart config.
  Gotcha: `COLORS` duplicates the CSS `--s1c…--s5c` values; if you change one, change
  both (CSS drives cards/tiles/dots, JS drives canvases).
- Tab switching hides panels with `display:none`, so charts on a hidden tab have zero
  size. `switchTab` in `js/ui/controls.js` calls `setTimeout(resizeResultsCharts, 50)` /
  `setTimeout(resizeMcCharts, 50)` after activating the panel. A new chart on a new tab
  needs the same resize hook.
- Custom drawing (retirement labels, reference lines) is done with inline Chart.js
  plugins (`makeRetPlugin`, `retPl`, `refPlugin`) passed via the `plugins:[…]` array.

## The 5-scenario structure

- Element id conventions: per-scenario inputs are `s{n}_ret`, `s{n}_inc`, `s{n}_chgYear`,
  `s{n}_chgInc`, names `sc{n}name`, toggle switches `tog{n}_partner|prop|child`, card
  result container `ms{n}`, n = 1..5. `getScenario(s, gl)` in `js/inputs.js` reads them.
- Colours: CSS custom properties `--s1c…--s5c` (+ alpha variants `--s1a…--s5a`) in
  `css/styles.css` `:root`; `SC_COLORS` in `js/ui/cards.js` maps index → `s1…s5` class
  names; `COLORS/COLORS_FADE/ALPHAS` in `js/ui/charts.js` are the canvas equivalents.
- The active scenario (`state.activeScIdx`, 0-based) drives the Results chart, flow
  chart, table, and legend. `setActiveScenario(idx)` in `js/ui/controls.js` is the only
  entry point: it updates `state.activeScIdx`, re-runs `updateLabels`, re-renders
  tiles/charts/table from the `state.last*` caches, and scrolls the tile carousel into
  sync. Never set `state.activeScIdx` directly from elsewhere.

**Adding a per-scenario field:** add the input ×5 to `index.html` with the `s{n}_` id
pattern, read it in `getScenario()` in `js/inputs.js`, add all five ids to `SYNC_FIELDS`
in `js/sync.js`, extend the `makeSc` test fixture, update the README parameter table —
load the `adding-an-input` skill for the full procedure.

**Adding a tab:** (1) a `tab-btn` in the `tab-nav` with `data-tab="name"`,
`role="tab"`, `aria-selected`, and `onclick="switchTab('name')"`; (2) a
`div.tab-panel#tab-panel-name` with `role="tabpanel"` (the `tab-panel-` prefix is what
`switchTab` matches on); (3) if it contains charts, a resize call in `switchTab`;
(4) if it shows numbers, a renderer called from `recalc()`.

## Mobile conventions

All wired in `main.js` `DOMContentLoaded` — every scroll/touch listener uses
`{ passive: true }`:
- `.sc-grid` scroll → debounced `updateScNav()` keeps the `sc-nav` dots (mobile-only,
  shown by the `@media(max-width:767px)` block) matching the visible card.
- `#scSummaryRow` scroll → debounced `setActiveScenario()` so swiping the tile carousel
  changes the whole Results view.
- `addChartSwipe` on `.proj-canvas-wrap`/`.alloc-canvas-wrap`: horizontal touch swipe
  (>40px, dominantly horizontal) steps `state.activeScIdx`.
- Swipeable card rows use equal-width flex children + `scroll-snap-type:x mandatory`
  (`.sc-card` at `100vw`, `.mc-card` at `42%` — commit 2485130): a card's width must
  never depend on its content or the dot/scroll-position math breaks.

## css/styles.css conventions

- Single dark theme; all colours via the `:root` custom properties (`--bg`, `--card`,
  `--bdr`, `--text`, `--sec`, `--muted`, `--ok`/`--err`, scenario colours, radii
  `--r`/`--rs`). Never hard-code a colour that has a variable.
- Fonts: 'DM Sans' for prose/labels, 'DM Mono' for every numeric value (Google Fonts
  link in `index.html`).
- Layout: file is organised by tab (header → nav → shared form → per-tab sections →
  mobile block → sync modal). Mobile rules are **additive** inside one
  `@media(max-width:767px)` block at the end — desktop must never be affected by it.
  Inputs get `height:44px;font-size:16px` there (16px prevents iOS Safari focus zoom).
- `.mc-body.stale` dims MC output — the visual half of `markMcStale()`.

## Accessibility — maintain what exists

- Tabs: `role="tablist"/"tab"/"tabpanel"`, `aria-selected` kept in sync by `switchTab`.
- Year-by-year table header: `role="button"`, `tabindex="0"`, Enter/Space keydown
  handler, `aria-expanded` kept in sync by `toggleTable`.
- Icon-only buttons carry `aria-label` (sync, age steppers, nav dots, CSV, close);
  decorative SVGs carry `aria-hidden="true"`; sync modal is `role="dialog"
  aria-modal="true"`; a `.sr-only` skip link opens the page.
- New interactive elements follow the same patterns — if it's a div with an onclick,
  it needs the button role/keyboard treatment the table header has.
