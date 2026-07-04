---
name: release-checklist
description: The ordered pre-ship checklist for the FIRE planner — local verification, version-tag bump, docs sync, privacy gate, GitHub Pages deploy mechanics, cache and CDN pitfalls, and post-deploy sanity checks. Load whenever work is about to be committed, merged to main, or verified on the live page, and when a deployed change doesn't seem to show up. Every step exists because skipping it once caused a real incident recorded in git history or AUDIT.md.
---

# Release checklist

Merging to `main` **is** deploying: GitHub Pages serves the repo's `main` branch
directly, with no build step in between. There is no staging environment. Work through
the steps in order; do not push until 1–4 are done.

## 1. Full local verification

```sh
for f in js/*.js js/ui/*.js; do node --check "$f"; done && node --test tests/*.test.mjs
python3 -m http.server 8000     # then open http://localhost:8000
```

The syntax loop matters because tests cannot load the DOM modules — a typo in
`js/ui/*.js` passes the tests and ships. The HTTP server matters because ES modules do
not load over `file://`.

Manual smoke flows to click through (inline-handler bugs — a function missing from the
`Object.assign(window, …)` block in `js/main.js` — only surface at click time):
- **All 4 tabs** (My Situation, Scenarios, Results, Monte Carlo): each renders, no
  console errors, charts appear on Results and after Run on Monte Carlo.
- **Both withdrawal modes**: toggle Fixed Amount ↔ % of Portfolio; cards switch between
  On Track/Gap and Funded/Short chips; the Monthly Spending (retirement) field stays
  visible in % mode (AUDIT.md F8).
- **A scenario feature toggle** (e.g. With Partner on scenario A): card numbers change,
  Results follow.
- **An input edit persisting across reload**: change a value, wait a beat, reload —
  the edit must survive (localStorage via `scheduleSave`; a field that resets means it
  is missing from `SYNC_FIELDS` in `js/sync.js`, AUDIT.md T2).
- **Any renderer you touched**, including its click/swipe handlers on a narrow window.

## 2. Version tag bump

The user-visible version lives in `index.html` in the header logo:
`<div class="logo">FIRE Planner <span class="logo-tag">v6.6</span></div>`.
(The `<title>` says "FIRE Planner v2" — that is legacy text, not the version; leave it.)

Convention: `v6.x`, bump the minor for **any user-visible change** (behaviour, numbers,
layout). History: commits 20f4085 and da28876 are standalone "Bump header version tag"
commits; v6.5/v6.6 were bumped inside the feature commit (613c295, 629cc2d) with the
version noted in the subject. Either style is fine — what matters is that the deployed
page's tag changes, because step 8 uses it to prove the deploy actually landed
(especially against iOS Safari caching, step 6).

## 3. Docs sync (same commit as the code)

- **README.md** — any change to behaviour, a formula, a default, or an input parameter
  (it has a full parameter table and worked formula examples). README↔code drift caused
  an entire audit section (AUDIT.md Part 5).
- **ARCHITECTURE.md** — any change to module layout, data flow, or the file map.
- **AUDIT.md resolution table** — if the change fixes or reopens an audited finding,
  update the finding's row (and cite the finding ID in the commit message).
- New input? The four-place rule in CLAUDE.md plus the `adding-an-input` skill.

## 4. Privacy gate — before ANY push

- **This repo embeds the owner's real financial data** (AUDIT.md S3): `SAM_STATE` in
  `js/sync.js` and the seed blob in `js/seed.js` contain DOB, income, spending, partner
  details, and exact IBKR holdings — and they are in git history too. **Never make the
  repo or the deployed page public without explicit user sign-off**, and warn the user
  before any action that could (changing repo visibility, forking, publishing
  elsewhere). Note the old lock screen was removed as cosmetic (commit 6883295, AUDIT.md
  S2) — the deployed page has **no access control at all**; its privacy is entirely the
  repo/page visibility.
- **Never add new personal data** to any file or commit message.
- **Never commit tokens**, even obfuscated — a "hidden" XOR'd PAT shipped once and was
  effectively public (AUDIT.md S1). Sync tokens are pasted per-device and live in
  `localStorage` only. If a token ever lands in a commit, revoking it on GitHub is the
  fix — deleting the commit is not.

## 5. Deploy reality: Pages serves main

Pushing/merging to `main` triggers the automatic `pages-build-deployment` workflow. It
is usually fast but **history shows it can silently stick**: after commit 629cc2d the
build sat queued with zero jobs for 4+ hours, could not be cancelled or re-run via the
Actions API (the deploy-from-branch Pages workflow is not manually dispatchable), and
took two empty commits to unstick (6df18c0, 0e0d529).

To verify and, if needed, retrigger:

```sh
gh run list --workflow pages-build-deployment --limit 3   # is the latest run for your SHA, and green?
gh api repos/{owner}/{repo}/pages --jq .html_url          # the live page URL
git commit --allow-empty -m "Retrigger GitHub Pages build" && git push   # last resort, per 6df18c0
```

The deploy has landed only when the **live page** shows the new version tag from step 2.

## 6. Cache pitfalls (iOS Safari especially)

iOS Safari served stale page versions until three no-cache meta tags were added to the
`<head>` (commit 1f2ac00):

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

- **When touching `<head>`, verify these three tags survive.** Removing them
  reintroduces the bug: the user's phone keeps running the old app against new data.
- If the live page looks stale after a confirmed deploy: hard-refresh on desktop
  (Cmd/Ctrl+Shift+R); on iOS Safari there is no hard refresh — close the tab fully and
  reopen, or Settings → Safari → clear website data as a last resort (warn the user
  first: that also clears the app's `localStorage` state and per-device sync token —
  related history: a574ad9, iOS clearing storage aggressively).
- The meta tags only cover the HTML document. CSS/JS are fetched per-load, but if a
  change ever seems half-applied, suspect a cached subresource before suspecting code.

## 7. CDN dependency: Chart.js must fail soft

Chart.js 4.4.1 loads from cdnjs in `index.html`. When the CDN is unreachable, the app
must degrade to "no charts" — never to "no numbers": every chart-building function
starts with `if (typeof Chart === "undefined") return;` (`buildChart`, `buildFlowChart`
in `js/ui/charts.js`; the two builders in `js/ui/mcTab.js`). Chart building runs inside
`recalc()` *before* `scheduleSave()`, so an unguarded chart exception aborts
recalculation and kills auto-save — this happened and was fixed in the v6.5 audit sweep
(AUDIT.md, note after the resolution table). If your change touches chart code, keep the
guard, and spot-check by blocking `cdnjs.cloudflare.com` in DevTools (Network request
blocking): tabs, cards, table, and persistence must all still work.

## 8. Post-deploy sanity on the live page

On the deployed URL (not localhost), ideally also on a phone:
- Header shows the **new version tag** (proves cache + deploy, steps 5–6).
- **Console is clean** on load, on each tab, and after clicking one control per screen.
- **Data is intact**: the user's saved values (not seed defaults) appear, and survive a
  reload; the sync button reflects a working state if a token is connected.
- The specific change you shipped is visibly present.

## 9. Branch and commit conventions (from the log)

- Imperative subjects. Two styles coexist: prefixes for small fixes
  ("fix: no-cache headers…", "feat: parse IBKR cash balance…") and sentence-case
  imperative for larger work ("Refactor monolithic index.html into ES modules…").
- Features and multi-file changes go through a **branch + PR merged into main**
  (history: `(#3)`…`(#8)` merge subjects); trivial fixes have gone straight to main,
  but since main = production, prefer a branch whenever the change is more than a
  one-liner.
- Mention the version in the subject when the commit bumps it ("… (v6.6)"), and cite
  AUDIT.md finding IDs when resolving one ("Fix audited financial-logic flaws… (v6.5)").
- Never commit or push without steps 1–4 done; a financial change without its
  hand-computed regression test is not done (see `testing-and-ci`).
