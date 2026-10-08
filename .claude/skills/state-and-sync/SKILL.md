---
name: state-and-sync
description: How the FIRE planner persists and synchronises state — localStorage lifecycle, first-visit seeding, the Supabase sync (shared txmnzia-dbs project, schema fire_planner, magic-link sign-in), timestamp conflict handling, and state-shape migrations. Load before touching js/sync.js, js/seed.js, the load order in js/main.js, anything reading or writing localStorage, or when saved values reset, sync misbehaves, or a field must be renamed/migrated.
---

# State & sync

One versioned JSON payload holds everything the user entered. It lives in three
places that must stay consistent: the DOM (source of truth while the page is
open), `localStorage['fire_state']` (per device), and one row in
`fire_planner.state` on the shared Supabase project (cross-device, optional,
only when signed in). Until 2026-10 the cross-device copy was a private GitHub
Gist; that code and its stored tokens are gone (see Sync below). `js/sync.js` owns all of it. History note: most of
the odd-looking guards below are scar tissue from real incidents — commits
`a574ad9`, `ae05a9c`, `829d346`, `1f2ac00`, and AUDIT.md T7/S1/S3. Do not
"simplify" them away.

## Lifecycle — who writes what, in what order

```
page load
  index.html: <script src="js/seed.js">           (classic script, synchronous,
     └─ if localStorage 'fire_state' ABSENT:       runs before any module)
        write baked default JSON — never overwrite existing state (T7)
  index.html: <script type="module" src="js/main.js">
  DOMContentLoaded (js/main.js):
     1. loadState()                                ← MUST run first (see below)
          ├─ parse localStorage 'fire_state' → applyState(data)
          └─ absent or JSON.parse throws → applyState(SAM_STATE)
     2. updateAge(1..5), onWdMode(), updateToggleUI()
     3. initSync()  — best-effort, non-blocking:
          load supabase-js (CDN; null → stay local-only)
          session? (also completes a magic-link redirect) → syncLoad()
                   → startPolling()

applyState(data):
  fields → DOM (with retCountry legacy migration) → wdMode radio → mc.recenter
  → features[1..5] → state.ibkr* + renderHoldings() → state.nwHistory
  (normalised) + renderNwHistory() → updateAge/onWdMode/updateToggleUI
  → isSyncLoad=true; recalc(); isSyncLoad=false

every recalc() (any input edit) ends with scheduleSave():
  isSyncLoad? return                    ← loads must not re-save (loop guard)
  localTs = Date.now(); write localStorage immediately
  signed in? debounce 2.5 s → syncSave() (upsert the fire_planner.state row)

every 15 s while tab visible: syncPoll() — pull remote if strictly newer
```

**Why `loadState()` must be the first line of the DOMContentLoaded handler**
(commit `ae05a9c`): `updateAge()` and `onWdMode()` in `js/ui/controls.js` both
call `recalc()`, and `recalc()` ends in `scheduleSave()`, which writes
localStorage synchronously. Run them before `loadState()` and you persist the
HTML defaults over the user's saved data — data loss on every page load.
Commit `829d346` is the same lesson one layer down: seeding must happen
synchronously before any module JS runs, hence `js/seed.js` is a classic
(non-module) script tag placed before `js/main.js`.

## The payload contract — collectState()/applyState()

`collectState()` in `js/sync.js` produces:

```js
{ v: 1,
  fields: { <id>: "<string value>", ... },   // every id in SYNC_FIELDS, via el(id).value
  wdMode: 'swr' | 'fixed',                   // radio group, handled explicitly
  features: { 1..5: {partner, prop, child} },// per-scenario toggles (js/state.js)
  nwHistory: [{year, val, income, spend}],   // plan-vs-actual snapshots
  mc: { recenter: <bool> },                  // mcRecenter checkbox, explicit
  ibkr: { total, holdings },                 // parsed IBKR import
  ts: <ms epoch> }                           // stamped by scheduleSave()/syncSave()
```

Rules:

- **Extend both sides together.** Anything added to `collectState()` needs the
  matching restore in `applyState()` in the same commit, with a
  backward-compatible default for payloads that predate it (the pattern:
  `data.mc.recenter !== false`, `Array.isArray(data.nwHistory) ? … : []`,
  `data.features?.[s]`). Old payloads never error; they get sane defaults.
- Simple text/number/select inputs don't touch this pair — they ride
  `SYNC_FIELDS` (see the `adding-an-input` skill). Checkboxes, radios, and
  non-input state must be explicit here because field collection reads
  `.value`, which is meaningless for a checkbox.
- **Never bump `v` casually.** `applyState()` starts with
  `if (!data || data.v !== 1) return;` — a payload with an unknown version is
  silently ignored, so a device that saved `v:2` would strand every `v:1`
  device (and vice versa: `loadState()`'s try-block *succeeds* at parsing,
  `applyState` bails, nothing is applied, and the page shows HTML defaults
  while the real data sits untouched in storage). Evolve the shape
  additively inside `v:1`; a real version bump needs an explicit upgrade path
  in `applyState()` for every older version.
- Values in `fields` are **strings** (raw `.value`), including numbers.

## Conflicts, loops, and mid-edit clobbering

The conflict model is last-write-wins on a millisecond timestamp; there is no
merging. The moving parts, all in `js/sync.js`:

- `localTs` — the ts of the state this tab last wrote or applied. Set by
  `scheduleSave()` (on edit) and by `applyState()` (from `data.ts` on load).
- `syncPoll()` applies a remote payload **only if `(data.ts||0) > localTs`**.
- `isSyncLoad` — true only during the `recalc()` inside `applyState()`, making
  `scheduleSave()` a no-op. Without it every load would immediately re-save
  (and re-stamp `ts`), turning polling into an infinite save/load loop.
- `syncPoll()` returns early when `syncTimer` is set (a debounced local save
  is pending — pulling now would overwrite the user's newest edits before they
  reach Supabase) and when `document.activeElement` is an
  INPUT/SELECT/TEXTAREA (never rewrite a field mid-keystroke).
- Polling runs only while `document.visibilityState === 'visible'`, plus once
  on each visibilitychange-to-visible (`startPolling()`).

Keep every one of these guards when refactoring. Losing any of them
reintroduces a data-loss race that only shows up with two devices open.

## Sync — Supabase, and the S1 history

Commits `d33e180`/`67fc8d0` once baked a XOR-"obfuscated" GitHub PAT into the
served page (AUDIT.md **S1**). The Gist sync that followed used a per-device
pasted token. Since 2026-10 sync runs on Supabase instead and needs no token:

- `js/db.js` lazy-loads supabase-js from jsdelivr and creates the client for the
  shared project `txmnzia-dbs`, schema `fire_planner`. If the CDN or network
  fails, `db()` returns null and the app is exactly the local-only app.
- The publishable key in `js/db.js` is **public by design**; row-level security
  limits `fire_planner.state` to its owner (`user_id = auth.uid()`). The secret
  / service_role key must never be in the repo (iron rule 6).
- Sign-in: `connectSync()` sends a magic link (`signInWithOtp`, redirect back to
  this page). `initSync()` always loads the client so the redirect completes;
  `onAuthStateChange` then sets `userId` and runs `syncLoad()`. The session
  lives in supabase-js's own localStorage keys (`sb-*`).
- Table: `fire_planner.state (user_id pk, data jsonb, ts bigint, updated_at)`,
  migration in `supabase/migrations/0001_fire_planner.sql`. `data` is exactly
  the `collectState()` payload; `ts` duplicates `data.ts` so conflicts compare
  without parsing.
- `syncLoad()` = last-write-wins on `ts`: pull when the row is strictly newer
  than `localTs`, push when this device is newer or the account has no row yet.
  That is how a device's first sign-in uploads its existing local state, and why
  sign-in order across devices doesn't matter.
- **Loading is never an edit.** `applyState()` runs entirely under
  `isSyncLoad`, and `main.js` wraps the load-time `updateAge/onWdMode/
  updateToggleUI` calls in `withoutSave()`. Otherwise their recalcs re-stamp
  `ts` to "now", every opened device looks newest, and last-write-wins pushes
  stale state (or the seed) over newer data. This shipped broken in v7.0 and
  was fixed in v7.1; verified with a headless run against a fake supabase-js
  (stale device, newer device, fresh seed device, empty account, edit after
  load).
- On load, `sync.js` deletes the old Gist keys (`fire_github_token`,
  `fire_github_login`, `fire_gist_id`) so a leftover PAT doesn't linger.

## iOS Safari lessons (git history)

- `a574ad9` — iOS Safari evicts localStorage aggressively (observed in practice
  after periods of disuse or under storage pressure). Any load path must survive
  `fire_state` vanishing:
  that is why `loadState()` falls back to `SAM_STATE` and `js/seed.js`
  re-seeds. Never assume localStorage persistence on Safari.
- `1f2ac00` — iOS Safari served stale cached pages after deploys; the
  `Cache-Control/Pragma/Expires` no-cache `<meta>` tags in `index.html` exist
  for that. Leave them.
- `ae05a9c` / `829d346` — the load-order rules described above; both were
  found because Safari's timing made the overwrite reproducible.

## Privacy — S3 is still open

`SAM_STATE` in `js/sync.js` and the seed blob in `js/seed.js` embed the
owner's **real** personal data: DOB, income, spending, partner details, exact
IBKR holdings. AUDIT.md **S3** is unresolved by decision, not oversight. Do
not copy these blobs into new files, tests, docs, or console examples; do not
add more personal data; **warn the user before any action that would make the
repo or deployed page public**.

## Migration recipes

**Renaming a field id / changing select option values.** Old payloads (this
device's localStorage AND stale devices that push their old payload to Supabase) keep the old
key/value indefinitely, so map them at apply time, forever. The canonical
example is in `applyState()`:

```js
if (id === 'retCountry' && LEGACY_RATE_TO_CODE[val]) val = LEGACY_RATE_TO_CODE[val];
```

(`LEGACY_RATE_TO_CODE` in `js/inputs.js`; the T1 fix — options once used
duplicate numeric rate values, so restore-by-value selected the wrong
country.) For a renamed id, add the analogous intercept: when iterating
`data.fields`, translate `oldId` → `newId` before `el(id)` lookup. Unknown
keys are already harmless (`if (!e) return;`), so leftover old keys rot away
silently.

**Adding non-field state** (a new array/object like `nwHistory`): extend
`collectState()` and `applyState()` together, defaulting when absent,
normalising types on the way in (see the `nwHistory` mapper — it coerces
numbers and preserves explicit nulls). Keep `v:1`.

**Changing a field's semantics** (units, meaning): prefer a new id plus a
translation from the old one over reusing the id with new meaning — a synced
device running old code would write old-semantics values into the shared row.

## Debugging

- Inspect current state:
  `JSON.parse(localStorage.getItem('fire_state'))` in the console; check
  `.fields.<id>`, `.ts`, `.features`.
- **Simulate a first visit**: remove `fire_state` and the `sb-*` session keys
  (and `fire_v3_restored`, a leftover key from pre-refactor builds — current
  code never writes it) then reload.
  Expect the seed data (Sam's defaults) to appear, sync button `idle`.
- Value resets on reload → its id is missing from `SYNC_FIELDS`, or a
  checkbox went through `SYNC_FIELDS` instead of explicit handling (T2 class
  of bug; see `adding-an-input`).
- Page shows HTML defaults despite data in storage → `applyState()` bailed:
  check `data.v === 1` and that the JSON parses.
- **Test sync end-to-end**: sign in with the same email in two browser
  profiles on the live page (or localhost, if `http://localhost:*` is an allowed
  Redirect URL in Supabase), edit in one, wait ≤15 s with the other tab visible
  and no field focused, confirm the pull. Sync button state is
  `el('syncBtn').dataset.state` (`idle|syncing|ok|error`). Inspect the row in
  Supabase: Table Editor → schema `fire_planner` → `state`.
- **Offline / CDN blocked**: block `cdn.jsdelivr.net`; the app must load,
  calculate and persist locally, sync button `idle`.
- Must-run before commit: `node --test tests/*.test.mjs` and
  `for f in js/*.js js/ui/*.js; do node --check "$f"; done`. Persistence has
  no unit tests — the browser round-trip above IS the test; do it.
