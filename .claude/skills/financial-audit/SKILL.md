---
name: financial-audit
description: Methodology for auditing the FIRE planner's financial logic and technical implementation — how the 2026-07 audit (AUDIT.md) was conducted and how to repeat it at the same standard. Use when asked to audit, verify correctness of, or review the financial model, or after a large batch of financial changes lands.
---

# Conducting a financial audit

The reference artifact is `AUDIT.md`: a full audit that found 11 financial-logic flaws,
8 technical bugs and 3 security issues in code that "worked" and had tests. This skill
is the method behind it. An audit is not a code review — you are not checking whether
the code does what the author intended, you are checking whether **the numbers shown to
the user are true**, and whether the words around them honestly describe them.

## Ground rules

1. **Severity is judged against the user's actual configuration**, not abstract
   defaults. Read the saved state first (`SAM_STATE` in `js/sync.js`, or ask the user
   for their current settings): which `wdMode`, which retirement ages, partner on/off,
   which country. A bug in fixed mode is low severity for a user who lives in SWR mode.
   State the config you judged against at the top of your report, as AUDIT.md does.
2. **Verify every claim numerically before reporting it.** Reproduce each suspected
   flaw in Node with a small script (fixtures: `makeGl`/`makeSc` in
   `tests/engine.test.mjs`) and quantify the error ("understated by ~8.1% at today's
   27% gain fraction"). A finding without a magnitude is an opinion.
3. **Distinguish four categories** and report them separately, as AUDIT.md does:
   - **F — financial-logic flaws**: the math is wrong or inconsistent.
   - **T — technical bugs**: state corruption, persistence, parsing, staleness.
   - **S — security/privacy**: tokens, personal data, trust boundaries.
   - **Part 4 — model assumptions**: defensible choices the user should consciously
     ratify, not bugs. Do not present these as defects; present them as decisions.
4. **Strategy-level findings end in a user decision, not a unilateral fix.** F3
   (Bengen vs %-of-portfolio) had two valid resolutions; the audit presented both and
   the user chose. When a fix changes what the product *means*, ask.
5. **Also report what is done well.** It protects good design from being "fixed" by a
   later session that mistakes deliberate choices for accidents.

## The hunting checklist

These are the searches that actually found the audit's findings. Run all of them.

**Consistency between views (found F1, F9, T6, T8).**
The same real-world quantity is computed in several places — FIRE target, scenario
card, summary tile, year table, Monte Carlo. For each quantity in the agreement matrix
(see `financial-invariants` skill), compute it by hand once, then check every consumer
against your number. Any two views that disagree = finding. Special attention to:
tax applied on one side of a comparison but not the other; cash included in one
portfolio definition but not another.

**Today's value vs future value (found F4, T6, F10).**
For every quantity used at a future date, ask: is this the value *today* or the value
*then*? Classic offenders: gain fraction (grows with decades of growth), any
today's-money amount used without `× infl`, income compared to a target from a
different year.

**Clamps that hide errors (found F5, F7).**
`grep -n "Math.max(0" js/engine.js` — every clamp is a place where money can silently
appear or disappear. For each: where does the clamped remainder *go*? If the answer is
"nowhere", that is a finding.

**Hidden or non-persistent inputs (found F8, T2).**
For every value the engine reads: (a) does a visible UI field exist for it in every
mode where it matters? (b) is it in `SYNC_FIELDS` (`js/sync.js`)? (c) does it survive
reload? Diff `SYNC_FIELDS` against the ids read by `getGlobals()`/`getScenario()`.

**Docs↔code diff (found the whole of AUDIT.md Part 5).**
Read README.md's formulas and tables side by side with the code. Every mismatch is
either a doc bug or a code bug — decide which, and say which. Check the defaults table
against `getGlobals()` fallbacks *and* against the seeded state (they legitimately
differ; the README must say so).

**Distribution/statistics honesty (found F3, F6, and the v6.6 metric replacements).**
For every headline statistic ask: *can this metric even move?* (SWR "survival" was
100% by construction — dead metric). *Does it saturate?* ("≥1 short year" saturates
over 40-year horizons). *Is it dominated by outliers?* (uncapped lifetime coverage was
dominated by late-life surplus compounding — hence the budget-capped, deflated
definition). *Do the deterministic and stochastic views agree at the median?*
(arithmetic vs geometric recentering).

**State lifecycle (found T1, T7).**
Save → reload → does everything round-trip? Select each dropdown option, reload, check
it stuck (duplicate option values broke this). Does first-visit seeding ever overwrite
existing user data? (`js/seed.js` must only seed when `fire_state` is absent.)

**Trust boundaries (found S1–S3).**
Anything embedded in a served file is public: tokens (even obfuscated — S1), personal
data (S3). Who can write to the Gist, and does `applyState` trust what it reads? What
would an attacker with the token be able to make the user believe?

## Report format

Follow AUDIT.md's structure exactly — it worked:

1. Header: date, scope (files + versions/commit), **the user config severity is judged
   against**.
2. Findings by category (F/T/S), each with: code excerpt or precise function reference,
   the mechanism, quantified impact against the user's config, direction of error
   (optimistic/pessimistic — say which explicitly), and a one-line **Fix:**.
3. Part 4: assumptions needing conscious ratification.
4. Part 5: docs↔code mismatch table.
5. "What is done well" — protect the good parts.
6. **Suggested fix order** — security first, then largest distortion of the user's
   actual numbers first.
7. When fixes land, append a **Resolution status** table (finding → status → how)
   rather than rewriting history. AUDIT.md is append-only memory; future sessions rely
   on it.

## After the audit

- File the report as an update to `AUDIT.md` (new dated section) — not a scratch file.
- Every accepted fix must satisfy the `financial-invariants` checklist and add a
  regression test whose expected value is computed by hand in the test comment.
- Update README.md in the same commits (Part 5 findings are recurring — the docs drift
  every time behaviour changes without a doc edit).
