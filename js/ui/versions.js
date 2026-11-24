// Update panel (v8.14), top of My Situation: what changed since the last saved
// version and what it does to the five scenarios, Save update / Undo all, the
// update log (compare, restore), the first-run review and "Did this happen?".
// Edits still autosave as before; a version is a dated copy you can go back to.
import { el, eur } from "../util.js?v=8.14";
import { state, features } from "../state.js?v=8.14";
import { recalc } from "../recalc.js?v=8.14";
import { collectState, applyState } from "../sync.js?v=8.14";
import { getScenarioName } from "../inputs.js?v=8.14";
import { snapshotOf, resultsOf, diffFields, diffLists, changeCount, impactLines, addVersion,
         duePrompts, rebaseResidence, reviewItems } from "../versionsCore.js?v=8.14";
import { rentShift } from "./housing.js?v=8.14";
import { updateToggleUI } from "./controls.js?v=8.14";

const fmtDay = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function currentResults() {
  if (!state.lastScenarios || !state.lastProjs) return [];
  return resultsOf(state.lastScenarios, state.lastProjs, state.lastStops, [0, 1, 2, 3, 4].map(getScenarioName));
}
function labelOf(id) {
  const l = document.querySelector('label[for="' + id + '_disp"], label[for="' + id + '"]');
  const t = l ? l.textContent.replace(/[ⓘ]/g, "").replace(/\s+/g, " ").trim() : id;
  return t.replace(/\s*\d[\d.,]*\s*(%|yrs|mo|×)?$/, "").trim() || id;
}
const lastVersion = () => state.versions[state.versions.length - 1] || null;

export function saveVersion(note, kind) {
  const snap = snapshotOf(collectState());
  const prev = lastVersion();
  state.versions = addVersion(state.versions, {
    id: Date.now().toString(36), ts: Date.now(), kind: kind || "save",
    note: (note || "").trim(), changes: prev ? changeCount(prev.snapshot, snap) : 0,
    snapshot: snap, results: currentResults(),
  });
  recalc();   // re-renders the panel and autosaves (versions ride in the saved row)
}

function restoreSnapshot(snapshot) {
  const keep = { versions: state.versions, review: state.review };
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
    if (yes) { for (let s = 1; s <= 5; s++) features[s].prop = true; }
    else { const h = el("propBuyYear"); h.value = String(y + 1); }
  } else if (kind === "child") {
    if (yes) { for (let s = 1; s <= 5; s++) features[s].child = true; }
    else { const h = el("childBirthYear"); h.value = String(y + 1); }
  } else if (kind === "pay") {
    const c = state.payChanges[i]; if (!c) return;
    if (yes) { setMoney("baseIncome", c.amt); state.payChanges.splice(i, 1); }
    else c.from = y + 1;
  }
  state.promptsSeen = { ...(state.promptsSeen || {}), [key + "@" + y]: true };
  window.dispatchEvent(new Event("fire:refresh-controls"));
  updateToggleUI();
  recalc();
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
  let h = "";

  // Did this happen?
  const y = new Date().getFullYear();
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

  // Changes since the last version + impact on the five scenarios
  if (!v) h += '<div class="up-main"><span>No saved version yet.</span> <button type="button" class="dp-add" data-save="1">Save a first version</button></div>';
  else {
    h += '<div class="up-main"><div class="up-hd">' + (n ? n + (n > 1 ? " changes" : " change") + " since " + fmtDay(v.ts) : "No changes since " + fmtDay(v.ts)) + (v.note ? ' <span class="tgt">(' + esc(v.note) + ")</span>" : "") + "</div>";
    if (n) {
      h += '<div class="up-changes">' + fields.slice(0, 12).map(f => "<div>" + esc(labelOf(f.id)) + ': <s>' + esc(f.from || "empty") + "</s> → <b>" + esc(f.to || "empty") + "</b></div>").join("") +
        lists.map(l => "<div>" + esc(l) + " changed</div>").join("") + (fields.length > 12 ? '<div class="tgt">and ' + (fields.length - 12) + " more</div>" : "") + "</div>";
      h += '<div class="up-impact">' + now.map((r, i) => {
        const p = (v.results || [])[i] || {};
        const age = p.age === r.age ? (r.age ?? "—") : (p.age ?? "—") + " → <b>" + (r.age ?? "—") + "</b>";
        const fire = p.fire === r.fire ? eur(r.fire) : eur(p.fire || 0) + " → <b>" + eur(r.fire) + "</b>";
        return '<div class="up-sc c' + (i + 1) + '"><span class="nm">' + esc(r.name) + "</span><span>stop " + age + "</span><span>FIRE " + fire + "</span><span>at end " + eur(r.nwEnd) + "</span></div>";
      }).join("") + "</div>";
      h += '<div class="up-actions"><input type="text" id="upNote" placeholder="Note (optional), e.g. new pension statement" maxlength="80"><button type="button" class="dp-add up-save" data-save="1">Save update</button><button type="button" class="dp-add" data-undo="1">Undo all</button></div>';
    }
    h += "</div>";
  }

  // Log
  if (state.versions.length) {
    h += '<details class="up-log"><summary>Update log (' + state.versions.length + ")</summary>" + state.versions.slice().reverse().map((x, j, arr) => {
      const older = arr[j + 1];
      const eff = older ? impactLines(older.results, x.results) : [];
      const sinceNow = impactLines(x.results, now);
      return '<div class="up-entry"><div><b>' + fmtDay(x.ts) + "</b> · " + esc(x.note || (x.changes ? x.changes + " changes" : "version")) +
        (eff.length ? ' <span class="tgt">' + esc(eff.join("; ")) + "</span>" : "") + "</div>" +
        '<div class="up-btns">' + (j > 0 ? '<button type="button" class="dp-add" data-restore="' + x.id + '">Restore</button>' : "") + "</div>" +
        (j > 0 ? '<div class="tgt">Compared with today: ' + esc(sinceNow.join("; ") || "same results") + "</div>" : "") + "</div>";
    }).join("") + "</details>";
  }
  host.innerHTML = h;
}

export function initUpdatePanel() {
  const host = el("updatePanel"); if (!host) return;
  host.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.save) saveVersion(el("upNote") ? el("upNote").value : "", "save");
    else if (b.dataset.undo) undoAll();
    else if (b.dataset.restore) restoreVersion(b.dataset.restore);
    else if (b.dataset.yes) answerPrompt(b.dataset.yes, true);
    else if (b.dataset.no) answerPrompt(b.dataset.no, false);
    else if (b.dataset.dismiss) { state.review.dismissed = true; recalc(); }
    else if (b.dataset.done) { state.review.done = { ...(state.review.done || {}), [b.dataset.done]: true }; recalc(); }
    else if (b.dataset.go) {
      const f = el(b.dataset.go); if (!f) return;
      const tab = f.closest(".tab-panel"); if (tab && !tab.classList.contains("active") && window.switchTab) window.switchTab(tab.id.replace("tab-panel-", ""));
      f.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => f.focus(), 300);
    }
  });
}
