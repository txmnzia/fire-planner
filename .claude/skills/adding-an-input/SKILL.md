---
name: adding-an-input
description: End-to-end recipe for adding, renaming, or changing a user-facing input parameter in the FIRE planner — markup in index.html, reading via getGlobals()/getScenario(), persistence via SYNC_FIELDS, seeding, engine wiring, migration, and README docs. Load whenever a task adds a form field, changes a select's options, or repurposes an existing input.
---

# Adding or changing an input

Every input goes **four places** (CLAUDE.md iron rule 3): `index.html`,
`js/inputs.js`, `SYNC_FIELDS` in `js/sync.js`, README's Input Parameters table.
Skipping any one produces a silent bug, not an error. Follow the steps in order.
If the input affects any financial number, also load `financial-invariants`
before step 5. For persistence internals and migrations, `state-and-sync`.

## 1. Markup in index.html

Pick the right home:

- **Global parameter** → Tab 1 (`#tab-panel-situation`): a `<section class="sit-section">`
  with a `<div class="sit-hd">` header and a `<div class="sit-grid">` of
  `<div class="field">` blocks. Sections: Your Portfolio, Net Worth History,
  About You, Income & Spending, Market Assumptions, Tax & Country, Future Income
  (pension + the `wf{i}_yr`/`wf{i}_amt` windfall `field-row`s), Partner,
  Property Purchase, Having a Child. Add to the existing section that fits;
  only create a new section for a genuinely new topic.
- **Per-scenario parameter** → Tab 2: five `.sc-card` blocks (A–E). You must add
  the field to **all five cards**, ids prefixed `s1_`…`s5_`.
- **Monte Carlo control** → Tab 4 `.mc-controls` (`.mc-ctl` wrapper).

Copy these exact patterns:

```html
<!-- number input with a unit suffix (€, %, x) -->
<div class="field">
  <label for="myField">Label Text</label>
  <div class="unit-wrap"><input type="number" id="myField" value="5" min="0" max="100" step="0.5" oninput="recalc()" onchange="recalc()"><span class="u">%</span></div>
</div>

<!-- select — every option value MUST be unique (AUDIT.md T1) -->
<div class="field">
  <label for="mySelect">Label Text</label>
  <select id="mySelect" oninput="recalc()" onchange="recalc()">
    <option value="codeA" selected>Choice A</option>
    <option value="codeB">Choice B</option>
  </select>
</div>
```

Rules:

- **id naming**: globals are bare camelCase (`spendRet`, `propBuyYear`);
  scenario fields are `s{n}_name` (`s3_chgYear`); scenario name inputs are
  `sc{n}name`; windfalls are `wf{i}_yr`/`wf{i}_amt` with `i` = 0–2. The id IS
  the persistence key — choose it once, renaming later requires a migration
  (step 6).
- **Wire both `oninput` and `onchange` to `recalc()`** — every existing text/
  number/select input does both (covers typing, steppers, and paste).
  Exception: inputs that only feed the Monte Carlo run (`mcSims`, `mcBlock`,
  `mcRecenter`) use `onchange="scheduleSave()"` only — MC reads them at Run
  time in `js/ui/mcTab.js`, and rerunning deterministic recalc would be noise.
- **Dedicated handlers**: if the input needs UI work beyond recalc (the
  `s{n}_ret` sliders call `updateAge(n)`, the `wdMode` radios call
  `onWdMode()` — both in `js/ui/controls.js`, both call `recalc()` themselves),
  write the handler in the appropriate `js/ui/` module and **add it to the
  `Object.assign(window, {...})` block in `js/main.js`** — inline `on*`
  attributes resolve against `window`, and modules don't leak globals. A
  handler missing from that block fails only at click time, silently breaking
  the control.
- Never leave `select` option values ambiguous. AUDIT.md **T1**: country
  options once used the tax rate as value; France/Sweden/Finland all had
  value `30`, so restoring state selected the first match and the UI showed
  the wrong country. Values are now ISO-ish codes.

## 2. Read it in js/inputs.js

Add one line to `getGlobals()` (global) or `getScenario()` (per-scenario).
Helpers come from `js/util.js`:

- `numVal(id, fallback)` — parseFloat; fallback when empty/NaN. Use for
  required numerics. Give a sensible fallback even if the HTML has a
  `value=""` default — saved states predating your field restore to whatever
  the HTML ships, but an empty/cleared field must still compute.
- `optVal(id)` — returns `null` for empty/`"none"`/non-numeric. Use for
  optional fields (`s{n}_chgYear`, `partnerBirthYear`) where the engine
  branches on presence.
- Selects: read `el(id).value` directly and map codes to data (see
  `retCountry` → `COUNTRY_TAX` in `js/inputs.js`).

Unit conversions happen HERE, once: percent inputs divide by 100
(`numVal("swr",4)/100`) — downstream code treats `gl` rates as decimals and
must never divide again. Money inputs are **monthly, in today's money**; the
engine converts to annual nominal (`monthly × 12 × infl`). Both conventions
are invariants — see `financial-invariants` (Conventions, I10).

## 3. PERSISTENCE — add the id to SYNC_FIELDS in js/sync.js

Append the id string to the `SYNC_FIELDS` array at the top of `js/sync.js`.
`collectState()` walks this array reading `.value`; `applyState()` writes
whatever keys the payload has back into matching elements.

**If you forget:** nothing errors. The input works all session, then on reload
the value silently reverts to the HTML `value=""` default, and cross-device
Gist sync never carries it. This is exactly AUDIT.md **T2** — the auto-computed
gain fraction reverted to a hardcoded 27% on every reload while tax on every
withdrawal depended on it. The reload round-trip in step 8 is how you catch it.

**Checkboxes and radios cannot go in SYNC_FIELDS** — collection reads
`.value`, which for a checkbox is `"on"` regardless of state. Handle them
explicitly in **both** `collectState()` and `applyState()` the way `mcRecenter`
is (`mc: { recenter: mcRe.checked }` on collect; `mcRe.checked =
data.mc.recenter !== false` on apply — note the backward-compatible default)
and the way the `wdMode` radio group is (`data.wdMode` string). Non-input
state (arrays, objects) also goes through this pair — see `state-and-sync`.

## 4. Defaults — four layers, know which one you're touching

Precedence for an input's value at page load, highest first:

1. **Saved state** — the `fields[id]` entry in localStorage `fire_state` (or
   the Gist payload). Applied by `applyState()`. Wins whenever the key exists.
2. **HTML `value="…"` attribute** — what the field shows when the saved
   payload has no key for it (every pre-existing user, the day you ship a new
   field) or when there is no saved state and no seed.
3. **`numVal` fallback** — used only at *read* time when the field is empty or
   non-numeric (placeholder-style optional fields). Never visible in the UI.
4. **`js/seed.js` / `SAM_STATE`** — not really a layer of their own: both are
   prepackaged *saved-state payloads*. `js/seed.js` (classic script, runs
   before the module graph) writes its JSON blob into `fire_state` **only when
   the key is absent** — first visit ever, or after iOS Safari evicted
   storage. `SAM_STATE` in `js/sync.js` is `loadState()`'s in-memory fallback
   when `fire_state` is absent or unparseable. So on a fresh device, layer 1
   is populated by seed data and layers 2–3 never show.

Touch `js/seed.js` **only** when a default must exist on first visit with a
value different from the HTML attribute. It must never overwrite existing
state (AUDIT.md **T7**: a "one-time restore" flag once clobbered real saved
data; the guard is now `if (!localStorage.getItem('fire_state'))` — keep it).
The seed JSON is one long string literal; if you edit it, keep it valid JSON
and mirror the same change in `SAM_STATE`. Both embed the owner's real
financial data (AUDIT.md **S3**) — do not copy them anywhere new.

For most new fields: set a sane HTML `value=""`, matching `numVal` fallback,
and leave seed.js alone. Old payloads simply lack the key and the HTML default
applies.

## 5. Use it in the engine

Pass the value through `gl` (or `sc`) only. `js/engine.js` and
`js/montecarlo.js` must never read the DOM, `localStorage`, or `state`
(CLAUDE.md iron rule 1) — if you find yourself importing `util.js` into the
engine, stop. If the input adds a budget component, it goes into **both**
`yearOneBudget()` and the `budget` expression in `project()`'s retirement
branch in the same commit (`financial-invariants` I2); run that skill's full
checklist, and add a hand-computed test.

## 6. Migration — changing an existing field's meaning or values

If old saved payloads (localStorage AND Gists on other devices) hold values
your new code can't interpret, migrate them in `applyState()` in `js/sync.js`,
following the `retCountry` pattern:

```js
if (id === 'retCountry' && LEGACY_RATE_TO_CODE[val]) val = LEGACY_RATE_TO_CODE[val];
```

The map (`LEGACY_RATE_TO_CODE` in `js/inputs.js`) translates legacy numeric
select values to country codes (T1 fix). Same recipe for renaming an id or
re-keying options: intercept the old key/value in `applyState()`, map to the
new one, keep the mapping forever (a stale Gist can resurface years later).
Do **not** bump the payload's `v` — see `state-and-sync` for why.

## 7. Docs

Add a row to README.md's **Input Parameters** table (section matching the form
section): Parameter | Input ID | Default | Unit | Notes. README↔code drift got
its own audit section (AUDIT.md Part 5). If the input changes calculation
behaviour, update README's calculation sections too.

## 8. Verify

Reload round-trip, in a served browser session (`python3 -m http.server 8000`):

1. Set the new field to a distinctive value (e.g. `7.77`). Blur it.
2. Confirm the key: `JSON.parse(localStorage.getItem('fire_state')).fields.myField`
   in the console — must show `"7.77"`.
3. Hard-reload. Field still shows `7.77` and results reflect it.
4. Clear `fire_state` (plus `fire_github_token`, `fire_gist_id`), reload —
   first-visit path works, field shows its intended default.
5. Check both `wdMode` radio settings if the value feeds the engine.
6. `node --test tests/*.test.mjs` and `for f in js/*.js js/ui/*.js; do node --check "$f"; done`.
7. Financial input? Run the `financial-invariants` pre-merge checklist.

## Worked example — hypothetical `annualFee` (% p.a. fund fee)

Illustration only — these diffs are NOT committed.

**index.html**, Market Assumptions `.sit-grid`:

```html
<div class="field">
  <label for="annualFee">Fund Fee (annual)</label>
  <div class="unit-wrap"><input type="number" id="annualFee" value="0.2" min="0" max="3" step="0.05" oninput="recalc()" onchange="recalc()"><span class="u">%</span></div>
</div>
```

**js/inputs.js**, inside the object returned by `getGlobals()`:

```js
annualFee: numVal("annualFee", 0)/100,
```

**js/sync.js**, `SYNC_FIELDS` (grouped with the other market fields):

```js
'stockRet','bondRet','inflation','bondAllocNow','bondAllocRet','annualFee',
```

**js/seed.js / SAM_STATE**: untouched — old payloads lack `annualFee`, the
HTML `value="0.2"` applies, which is the intended default.

**js/engine.js**: subtract `gl.annualFee` wherever the blended return is
composed — a financial change, so `financial-invariants` applies: check the
agreement matrix, both wdModes, MC recentering, and add a hand-computed test.

**README.md**, Market Assumptions table:

```
| Fund Fee (annual) | `annualFee` | 0.2% | % p.a. | Deducted from gross returns before compounding |
```

Then the full step-8 verification.

## Final checklist

- [ ] Markup follows the existing `.field` / `.unit-wrap` pattern; per-scenario
      fields exist on all five cards; select option values unique (T1).
- [ ] `oninput` AND `onchange` wired; any new handler exported and added to
      `Object.assign(window, …)` in `js/main.js`.
- [ ] Read in `getGlobals()`/`getScenario()` with `numVal`/`optVal`, sensible
      fallback, `/100` for percents done exactly once.
- [ ] Id appended to `SYNC_FIELDS` (T2) — or explicit `collectState`/`applyState`
      handling for checkbox/radio/non-field state.
- [ ] Defaults reasoned through the four layers; seed.js untouched unless truly
      needed, and never overwriting existing state (T7).
- [ ] Engine receives it via `gl`/`sc` only; engines stay pure.
- [ ] Semantics changed? `applyState()` migration in the LEGACY_RATE_TO_CODE
      style, kept forever.
- [ ] README Input Parameters row added.
- [ ] Reload round-trip passed; tests and syntax check pass; financial-invariants
      checklist run if applicable.
