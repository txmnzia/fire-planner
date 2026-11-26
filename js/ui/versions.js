// Update panel (v8.14), top of My Situation: what changed since the last saved
// version and what it does to the five scenarios, Save update / Undo all, the
// update log (compare, restore), the first-run review and "Did this happen?".
// Edits still autosave as before; a version is a dated copy you can go back to.
import { activePlan } from "./planLine.js?v=8.27";
import { el, eur } from "../util.js?v=8.27";
import { state, features } from "../state.js?v=8.27";
import { recalc } from "../recalc.js?v=8.27";
import { collectState, applyState } from "../sync.js?v=8.27";
import { getScenarioName, resolvePay } from "../inputs.js?v=8.27";
import { snapshotOf, resultsOf, diffFields, diffLists, changeCount, impactLines, impactRows, addVersion,
         duePrompts, rebaseResidence, reviewItems } from "../versionsCore.js?v=8.27";
import { rentShift } from "./housing.js?v=8.27";
import { updateToggleUI } from "./controls.js?v=8.27";
import { revealField } from "./tiles.js?v=8.27";
import { yearEndChanges, closeYearHistory } from "../yearEnd.js?v=8.27";
import { renderNwHistory } from "./nwHistory.js?v=8.27";
import { refreshedText } from "./spending.js?v=8.27";

const fmtDay = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function currentResults() {
  if (!state.lastScenarios || !state.lastProjs) return [];
  return resultsOf(state.lastScenarios, state.lastProjs, state.lastStops, [0, 1, 2, 3, 4].map(getScenarioName));
}
// v8.21: a field's name as the Changes tab shows it: its caption, plus the word
// before it when it is not the first box of its line ("Her take-home · until age").
function labelOf(id) {
  const f = el(id + "_disp") || el(id), row = f && f.closest(".frow");
  if (row) {
    const cap = (row.querySelector(".frow-l")?.textContent || "").replace(/[ⓘ\u24D8]/g, "").replace(/\s+/g, " ").trim();
    let n = f; while (n.parentElement && !n.parentElement.classList.contains("frow-c") && !n.parentElement.classList.contains("frow-grp")) n = n.parentElement;
    let p = n.previousElementSibling, sep = "";
    while (p) { if (p.classList.contains("frow-sep")) { sep = p.textContent.replace(/[ⓘ\u24D8]/g, "").trim(); break; } p = p.previousElementSibling; }
    if (!sep && n.parentElement?.classList.contains("frow-grp")) sep = (n.parentElement.querySelector(".frow-sep")?.textContent || "").replace(/[ⓘ\u24D8]/g, "").trim();
    if (cap) return sep ? cap + " \u00b7 " + sep : cap;
  }
  const l = document.querySelector('label[for="' + id + '_disp"], label[for="' + id + '"]');
  const t = l ? l.textContent.replace(/[ⓘ]/g, "").replace(/\s+/g, " ").trim() : id;
  return t.replace(/\s*\d[\d.,]*\s*(%|yrs|mo|×)?$/, "").trim() || id;
}
const lastVersion = () => state.versions[state.versions.length - 1] || null;

export function saveVersion(note, kind) {
  const snap = snapshotOf(collectState());
  const prev = lastVersion(), ts = Date.now();
  state.versions = addVersion(state.versions, {
    id: ts.toString(36), ts, kind: kind || "save",
    note: (note || "").trim(), changes: prev ? changeCount(prev.snapshot, snap) : 0,
    // v8.20: the results keep each scenario's net-worth path: the frozen plan
    snapshot: snap, results: state.lastScenarios && state.lastProjs
      ? resultsOf(state.lastScenarios, state.lastProjs, state.lastStops, [0, 1, 2, 3, 4].map(getScenarioName), ts) : [],
  });
  recalc();   // re-renders the panel and autosaves (versions ride in the saved row)
}

function restoreSnapshot(snapshot) {
  const keep = { versions: state.versions, review: state.review, planId: state.planId };
  applyState({ ...JSON.parse(JSON.stringify(snapshot)), v: 1, ts: Date.now(), ...keep });
}
export function undoAll() {
  const v = lastVersion(); if (!v) return;
  if (!confirm("Undo every change since " + fmtDay(v.ts) + "?")) return;
  restoreSnapshot(v.snapshot); recalc();
}
export function restoreVersion(id) {
  const v = state.versions.find(x => x.id === id); if (!v) return;
  if (!confirm("Bring back the version of " + fmtDay(v.ts) + "? Today's settings are kept as a version first, so this can be undone.")) return;
  if (changeCount(lastVersion()?.snapshot, snapshotOf(collectState())) > 0) saveVersion("Before restoring " + fmtDay(v.ts), "auto");
  restoreSnapshot(v.snapshot);
  saveVersion("Restored " + fmtDay(v.ts), "restore");
}

// The first time a payload without versions loads (saved before v8.14), a
// "Before Life update" version is kept and the review list is switched on.
export function ensureFirstVersion() {
  if (state.versions.length || !state.lastProjs) return;
  if (state.pendingFirstVersion) {
    state.pendingFirstVersion = false;
    state.review = { active: true, done: {}, dismissed: false };
    saveVersion("Before Life update", "auto");
  }
}

// ── Your home (v8.22) ───────────────────────────────────────────────────────
// Confirming the purchase makes it a fact: on in every scenario, its cash never
// charged again (it already left the portfolio), and no more rent: rent today
// goes to 0 and the joint transfers drop by it, split like today (as for a move).
// From then on the joint transfers are kept WITHOUT the loan and home charges:
// the plan adds those itself, split like the joint costs.
export function becomeOwner(propBefore) {
  const rent = parseFloat(el("propRentSaved").value) || 0;
  const s = rentShift(rent, 0, parseFloat(el("samPaysIn").value) || 0, parseFloat(el("partnerPaysIn").value) || 0);
  if (s) { setMoney("samPaysIn", Math.max(0, s.you)); setMoney("partnerPaysIn", Math.max(0, s.she)); }
  setMoney("propRentSaved", 0);
  state.home = { since: parseInt(el("propBuyYear").value) || new Date().getFullYear(), rentBefore: rent, propBefore: propBefore || [] };
}
// Back to a plan (a confirmation made by mistake): rent and transfers come back.
export function undoOwner() {
  const h = state.home; if (!h) return;
  if (h.rentBefore > 0) {
    const you = parseFloat(el("samPaysIn").value) || 0, she = parseFloat(el("partnerPaysIn").value) || 0, j = you + she;
    const her = j > 0 ? she / j : 0;
    setMoney("samPaysIn", Math.round(you + h.rentBefore * (1 - her))); setMoney("partnerPaysIn", Math.round(she + h.rentBefore * her));
    setMoney("propRentSaved", h.rentBefore);
  }
  // the switches go back to the scenarios that had the plan on before
  if (Array.isArray(h.propBefore)) for (let s = 1; s <= 5; s++) features[s].prop = h.propBefore.includes(s);
  state.home = null;
  updateToggleUI && updateToggleUI();
  recalc();
}

// ── "Did this happen?" answers ──────────────────────────────────────────────
function setMoney(id, v) { const h = el(id), d = el(id + "_disp"); if (!h) return; h.value = String(v); if (d && d._paintCur) d._paintCur(); }
export function answerPrompt(key, yes) {
  const y = new Date().getFullYear();
  const [kind, idx] = key.split(":"); const i = idx == null ? null : +idx;
  if (kind === "rent") {
    const m = state.rentMoves[i]; if (!m) return;
    if (yes) {
      const s = rentShift(parseFloat(el("propRentSaved").value) || 0, m.rent, parseFloat(el("samPaysIn").value) || 0, parseFloat(el("partnerPaysIn").value) || 0);
      setMoney("propRentSaved", m.rent);
      if (s) { setMoney("samPaysIn", s.you); setMoney("partnerPaysIn", s.she); }
      state.rentMoves.splice(i, 1);
    } else m.from = y + 1;
  } else if (kind === "res") {
    const p = state.residence[i]; if (!p) return;
    if (yes) {
      el("retCountry").value = p.country; el("taxNow").value = p.tax == null ? "" : p.tax;
      state.residence = rebaseResidence(state.residence, i);
    } else p.from = y + 1;
  } else if (kind === "buy") {
    if (yes) { const before = [1, 2, 3, 4, 5].filter(s => features[s].prop); for (let s = 1; s <= 5; s++) features[s].prop = true; becomeOwner(before); }
    else { const h = el("propBuyYear"); h.value = String(y + 1); }
  } else if (kind === "child") {
    if (yes) { for (let s = 1; s <= 5; s++) features[s].child = true; }
    else { const h = el("childBirthYear"); h.value = String(y + 1); }
  } else if (kind === "pay") {
    const c = state.payChanges[i]; if (!c) return;
    if (yes) {   // v8.27: the gross goes to your gross pay; a take-home typed or estimated to your take-home
      if (c.gross != null) setMoney("grossNow", c.gross);
      const net = c.amt != null ? c.amt : (state.lastGl ? resolvePay(c, state.lastGl, state.lastGl.residence, true).amt : null);
      if (net != null) setMoney("baseIncome", net);
      state.payChanges.splice(i, 1);
    }
    else c.from = y + 1;
  }
  state.promptsSeen = { ...(state.promptsSeen || {}), [key + "@" + y]: true };
  window.dispatchEvent(new Event("fire:refresh-controls"));
  updateToggleUI();
  recalc();
}

// ── Year-end rollover (v8.15) ───────────────────────────────────────────────
function yearEndHtml(gl) {
  const closing = gl.baseYear;
  const fields = collectState().fields;
  const ch = yearEndChanges(fields, closing, gl.inflation, state.pensionsMore, !!state.home, state.payChanges);
  const nw = Math.round((state.ibkrTotal || 0) + (gl.cash || 0));
  const overdue = [["Portfolio", state.ibkrAsOf, 92], ["Spending", fields.spendUpdated, 183], ["Pensions", fields.pensionUpdated, 365]]
    .filter(([, d, days]) => !d || refreshedText(d, new Date(), days).stale).map(([n]) => n);
  return '<div class="up-main up-ye"><div class="up-hd">Close ' + closing + '</div>' +
    '<div><b>1 · Closing net worth</b> (written as your net worth at the start of ' + (closing + 1) + ')</div>' +
    '<div class="up-actions"><div class="inp cur"><span class="pre">\u20ac</span><input type="text" id="yeNw" value="' + nw + '" inputmode="decimal"></div>' +
    '<span class="tgt">IBKR ' + eur(state.ibkrTotal || 0) + (state.ibkrAsOf ? ' as of ' + state.ibkrAsOf : '') + ' + cash ' + eur(gl.cash || 0) + (state.ibkrAsOf && state.ibkrAsOf < closing + '-12-01' ? '. Import the 31 Dec statement first for an exact figure.' : '') + '</span></div>' +
    '<div><b>2 · Move \u201ctoday\u201d to ' + (closing + 1) + '</b>: ages move up a year; amounts in today\u2019s money not refreshed in ' + closing + ' are raised by inflation (' + (gl.inflation * 100).toFixed(1) + '%). Untick any to keep it as typed.</div>' +
    '<div class="up-changes">' + ch.map(c => '<label class="ye-row"><input type="checkbox" data-ye="' + c.id + '"' + (c.checked ? ' checked' : '') + '> ' + esc(c.label) + ': ' + eur(c.from) + ' \u2192 <b>' + eur(c.to) + '</b> <span class="tgt">(' + c.why + ')</span></label>').join('') + '</div>' +
    '<div><b>3 · Check-ins due</b>: ' + (overdue.length ? esc(overdue.join(', ')) : 'none') + '</div>' +
    '<div class="up-actions"><button type="button" class="dp-add up-save" data-ye-apply="1">Close ' + closing + ' and save</button><button type="button" class="dp-add" data-ye-cancel="1">Cancel</button></div></div>';
}
export function applyYearEnd() {
  const gl = state.lastGl; if (!gl) return;
  const closing = gl.baseYear, fields = collectState().fields;
  const nw = parseFloat(String(el("yeNw")?.value || "").replace(/[^\d.]/g, ""));
  const picked = new Set([...document.querySelectorAll("[data-ye]")].filter(c => c.checked).map(c => c.dataset.ye));
  for (const c of yearEndChanges(fields, closing, gl.inflation, state.pensionsMore, !!state.home, state.payChanges)) if (picked.has(c.id)) {
    if (c.id.startsWith('pm:')) { const p = state.pensionsMore[+c.id.slice(3)]; if (p) p.amt = c.to; }
    else if (c.id.startsWith('pc:')) { const p = state.payChanges[+c.id.slice(3)]; if (p) p.amt = c.to; }
    else setMoney(c.id, c.to);
  }
  if (picked.has("propRentSaved")) state.rentMoves = state.rentMoves.map(m => ({ ...m, rent: m.rent == null ? null : Math.round(m.rent * (1 + gl.inflation)) }));
  if (nw > 0) { state.nwHistory = closeYearHistory(state.nwHistory, closing, nw); renderNwHistory(); }
  const by = el("baseYear"); if (by) by.value = String(closing + 1);
  state.yearEndOpen = false;
  window.dispatchEvent(new Event("fire:refresh-controls"));
  recalc();
  saveVersion("Year-end " + closing, "yearend");
}

// Edited fields turn amber with "was X" (title), and each card's header counts
// its changes since the last version (story rule 4).
function markChanged(fields) {
  document.querySelectorAll(".was-changed").forEach(n => { n.classList.remove("was-changed"); n.removeAttribute("data-was"); });
  document.querySelectorAll(".subj-badge").forEach(n => n.remove());
  const perCard = new Map();
  for (const f of fields) {
    const inp = el(f.id + "_disp") || el(f.id);
    if (!inp || inp.type === "hidden") continue;
    const d = inp.closest(".inp, .unit-wrap, .sv") || inp;
    d.classList.add("was-changed"); d.dataset.was = "was " + (f.from || "empty");
    d.title = "was " + (f.from || "empty");
    const card = d.closest(".subj"); if (card) perCard.set(card, (perCard.get(card) || 0) + 1);
  }
  perCard.forEach((c, card) => {
    const hd = card.querySelector(".tile-tt b, .subj-tt h3"); if (!hd) return;
    const b = document.createElement("span"); b.className = "subj-badge"; b.textContent = c + (c > 1 ? " changes" : " change");
    hd.appendChild(b);
  });
}

// ── Rendering ───────────────────────────────────────────────────────────────
export function renderUpdatePanel(gl) {
  const host = el("updatePanel"); if (!host) return;
  ensureFirstVersion();
  const v = lastVersion();
  const cur = snapshotOf(collectState());
  const fields = v ? diffFields(v.snapshot, cur) : [];
  const lists = v ? diffLists(v.snapshot, cur) : [];
  const now = currentResults();
  const n = fields.length + lists.length;
  markChanged(fields);
  let h = "";

  // Year-end: offered once the calendar has moved past the plan's "today"
  const y = new Date().getFullYear();
  if (state.yearEndOpen) h += yearEndHtml(gl);
  else if (y > gl.baseYear) h += '<div class="up-prompts"><div class="up-prompt"><span>It\u2019s ' + y + ': close ' + gl.baseYear + ' (history row, today moves to ' + (gl.baseYear + 1) + ')?</span><span class="up-btns"><button type="button" class="dp-add" data-ye-open="1">Close ' + gl.baseYear + '</button></span></div></div>';

  // Did this happen?
  const prompts = duePrompts({
    year: y, rentMoves: state.rentMoves, residence: state.residence,
    // a plan that is on in some scenarios but not yet a fact in all of them
    propBuyYear: gl.propBuyYear, propOn: gl.propPrice > 0 && [1, 2, 3, 4, 5].some(s => features[s].prop) && ![1, 2, 3, 4, 5].every(s => features[s].prop),
    childBirthYear: gl.childBirthYear, childOn: [1, 2, 3, 4, 5].some(s => features[s].child) && ![1, 2, 3, 4, 5].every(s => features[s].child),
    payChanges: state.payChanges, baseIncome: parseFloat(el("baseIncome")?.value) || 0,
  });
  if (prompts.length) h += '<div class="up-prompts">' + prompts.map(p =>
    '<div class="up-prompt"><span>' + esc(p.text) + '</span><span class="up-btns"><button type="button" class="dp-add" data-yes="' + p.key + '">Yes</button>' +
    '<button type="button" class="dp-add" data-no="' + p.key + '">Not yet</button></span></div>').join("") + "</div>";

  // First-run review
  const rv = state.review;
  if (rv && rv.active && !rv.dismissed) {
    const items = reviewItems({ propRentSaved: gl.propRentSaved, propCharges: gl.propCharges, anyProp: [1, 2, 3, 4, 5].some(s => features[s].prop) })
      .filter(it => !(rv.done || {})[it.key]);
    if (items.length) h += '<div class="up-review"><div class="up-hd">Your settings moved to the new model. ' + items.length + (items.length > 1 ? " things need" : " thing needs") +
      ' you once <button type="button" class="up-x" data-dismiss="1" aria-label="Dismiss">×</button></div>' +
      items.map(it => '<div class="up-item"><span>' + esc(it.text) + '</span><span class="up-btns"><button type="button" class="dp-add" data-go="' + it.field + '">Go</button><button type="button" class="dp-add" data-done="' + it.key + '">Done</button></span></div>').join("") + "</div>";
  }

  // Impact on your scenarios: always shown; saved → now when something changed
  // v8.18.5: light rows: name · stop age (before → after) · FIRE target with a trend icon
  const TREND = { up: '<svg class="up-tr up" viewBox="0 0 24 24" aria-label="up"><polyline points="4 16 10 10 14 14 20 8"/><polyline points="14 8 20 8 20 14"/></svg>',
                  down: '<svg class="up-tr down" viewBox="0 0 24 24" aria-label="down"><polyline points="4 8 10 14 14 10 20 16"/><polyline points="14 16 20 16 20 10"/></svg>' };
  const impact = () => '<div class="up-impact">' + impactRows(v && v.results, now).map((r, i) => {
    const age = r.ageChanged ? (r.ageFrom ?? "\u2014") + " \u2192 <b>" + (r.ageTo ?? "\u2014") + "</b>" : "<b>" + (r.ageTo ?? "\u2014") + "</b>";
    return '<div class="up-sc c' + (i + 1) + '"><span class="nm">' + esc(r.name) + '</span><span class="ag">stop ' + age + '</span><span class="fi">' + r.fire + (r.trend ? TREND[r.trend] : "") + "</span></div>";
  }).join("") + "</div>";
  h += '<div class="up-main"><div class="up-hd">Impact on your scenarios</div>';
  if (!v) h += '<div class="tgt">No saved version yet: save one to see what each change does.</div>' + impact() + '<div class="up-actions"><button type="button" class="dp-add up-save" data-save="1">Save a first version</button></div>';
  else {
    h += '<div class="tgt">' + (n ? n + (n > 1 ? " changes" : " change") + " since " + fmtDay(v.ts) : "No changes since " + fmtDay(v.ts)) + (v.note ? " (" + esc(v.note) + ")" : "") + "</div>";
    h += impact();
    if (n) h += '<div class="up-actions"><input type="text" id="upNote" placeholder="Note (optional)" maxlength="80"><button type="button" class="dp-add up-save" data-save="1">Save update</button><button type="button" class="dp-add" data-undo="1">Undo all</button></div>';
    // v8.20.1: no frozen plan yet (versions saved before v8.20) and nothing to save:
    // one tap saves today's version, which becomes the plan
    else if (!activePlan()) h += '<div class="tgt">No plan to compare with yet: save today\u2019s version and it becomes your plan.</div>' +
      '<div class="up-actions"><button type="button" class="dp-add up-save" data-save="1" data-note="Plan">Save as my plan</button></div>';
  }
  h += "</div>";

  // Log (v8.20: "Use as plan" picks the version actual net worth is compared with)
  const plan = activePlan();
  if (state.versions.length) {
    h += '<details class="up-log"' + (state.logOpen ? " open" : "") + '><summary>Update log (' + state.versions.length + ")</summary>" +
      (state.yearEndOpen ? "" : '<div class="up-entry"><span class="tgt">Closing a year normally happens in January.</span><button type="button" class="dp-add" data-ye-open="1">Close ' + gl.baseYear + ' now</button></div>') + state.versions.slice().reverse().map((x, j, arr) => {
      const older = arr[j + 1];
      const eff = older ? impactLines(older.results, x.results) : [];
      const sinceNow = impactLines(x.results, now);
      const isPlan = plan && plan.id === x.id, hasPath = (x.results || []).some(r => r && r.path);
      // v8.21: what this save changed, field by field (old → new), folded
      const fs = older ? diffFields(older.snapshot, x.snapshot).filter(f => !/Updated$/.test(f.id)) : [];
      const ls = older ? diffLists(older.snapshot, x.snapshot) : [];
      const what = fs.length + ls.length ? '<details class="up-what"><summary>What changed (' + (fs.length + ls.length) + ')</summary>' +
        fs.map(f => "<div>" + esc(labelOf(f.id)) + ": <s>" + esc(f.from || "empty") + "</s> \u2192 <b>" + esc(f.to || "empty") + "</b></div>").join("") +
        ls.map(l => "<div>" + esc(l) + " changed</div>").join("") + "</details>" : "";
      return '<div class="up-entry' + (isPlan ? ' is-plan' : '') + '"><div><b>' + fmtDay(x.ts) + "</b> · " + esc(x.note || (x.changes ? x.changes + " changes" : "version")) +
        (isPlan ? ' <span class="plan-tag">the plan</span>' : "") +
        (eff.length ? ' <span class="tgt">' + esc(eff.join("; ")) + "</span>" : "") + "</div>" +
        '<div class="up-btns">' + (hasPath && !isPlan ? '<button type="button" class="dp-add" data-plan="' + x.id + '" title="Compare your actual net worth with what this version expected">Use as plan</button>' : "") +
        (j > 0 ? '<button type="button" class="dp-add" data-restore="' + x.id + '">Restore</button>' : "") + "</div>" +
        (j > 0 ? '<div class="tgt">Compared with today: ' + esc(sinceNow.join("; ") || "same results") + "</div>" : "") + what + "</div>";
    }).join("") + "</details>";
  }
  host.innerHTML = h;
  // phone: the collapsed bar says how many changes and the biggest effect
  const tt = el("impactToggleTxt");
  if (tt) { const big = v ? impactLines(v.results, now)[0] : null; tt.textContent = (n ? n + (n > 1 ? " changes" : " change") : "No unsaved changes") + (big ? " \u00b7 " + big : "") + (prompts.length ? " \u00b7 " + prompts.length + " to confirm" : ""); }
}

export function initUpdatePanel() {
  const host = el("updatePanel"); if (!host) return;
  host.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.save) saveVersion(el("upNote") ? el("upNote").value : (b.dataset.note || ""), "save");
    else if (b.dataset.undo) undoAll();
    else if (b.dataset.restore) restoreVersion(b.dataset.restore);
    else if (b.dataset.plan) { state.planId = b.dataset.plan; state.logOpen = true; recalc(); }
    else if (b.dataset.yes) answerPrompt(b.dataset.yes, true);
    else if (b.dataset.no) answerPrompt(b.dataset.no, false);
    else if (b.dataset.yeOpen) { state.yearEndOpen = true; recalc(); host.scrollIntoView({ behavior: "smooth" }); }
    else if (b.dataset.yeApply) applyYearEnd();
    else if (b.dataset.yeCancel) { state.yearEndOpen = false; recalc(); }
    else if (b.dataset.dismiss) { state.review.dismissed = true; recalc(); }
    else if (b.dataset.done) { state.review.done = { ...(state.review.done || {}), [b.dataset.done]: true }; recalc(); }
    else if (b.dataset.go) {
      const f = el(b.dataset.go); if (!f) return;
      revealField(f);
      const tab = f.closest(".tab-panel"); if (tab && !tab.classList.contains("active") && window.switchTab) window.switchTab(tab.id.replace("tab-panel-", ""));
      f.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => f.focus(), 300);
    }
  });
}
