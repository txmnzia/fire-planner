import { el, eur } from "../util.js?v=8.17.1";
import { state } from "../state.js?v=8.17.1";
import { recalc } from "../recalc.js?v=8.17.1";
import { parseIbkrStatement, importWarnings, sinceLast, snapshotFromImport } from "../ibkr.js?v=8.17.1";
import { renderNwHistory } from "./nwHistory.js?v=8.17.1";

// ── Portfolio check-in (v8.10) ──────────────────────────────────────────────
// An import sets "today's" investments, the unrealised gain %, the as-of date
// and the period's deposits. Each check-in is kept (state.ibkrImports, last 24)
// so the next one can say what was added and what the markets did.
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtDate = iso => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
export const PORTFOLIO_STALE_DAYS = 92;

export function renderHoldings() {
  const btn = el("uploadBtn"), list = el("holdingsList");
  if (!btn || !list) return;
  if (!state.ibkrHoldings.length && state.ibkrTotal === 0) { list.style.display = "none"; return; }
  const posCount = state.ibkrHoldings.filter(p => p.qty !== null).length;
  btn.classList.add("loaded");
  btn.innerHTML = state.ibkrSource === "manual"
    ? "✓ Typed total — import a statement to refresh positions"
    : "✓ Loaded — " + posCount + " positions";
  list.style.display = "flex"; list.style.flexDirection = "column"; list.style.gap = "3px";
  let h = state.ibkrHoldings.map(p => p.qty !== null
    ? '<div class="pb-row"><span class="k">'+p.sym+" ×"+p.qty+'</span><span class="v">'+eur(p.val)+"</span></div>"
    : '<div class="pb-row"><span class="k">'+p.sym+'</span><span class="v">'+eur(p.val)+"</span></div>"
  ).join("");
  if (h) h += '<div style="height:1px;background:var(--bdr);margin:4px 0"></div>';
  h += '<div class="pb-row"><span class="k" style="color:var(--sec)">IBKR Total</span><span class="v" style="color:var(--text)">'+eur(state.ibkrTotal)+"</span></div>";
  list.innerHTML = h;
}

// The check-in line under the import: as-of date (red when overdue), what moved
// since the last import, and any warning from the last import.
export function renderCheckin() {
  const host = el("portCheckin"), stamp = el("portUpdatedTxt");
  const asOf = state.ibkrAsOf;
  if (stamp) {
    const old = asOf ? (Date.parse(todayIso()) - Date.parse(asOf)) / 86400000 > PORTFOLIO_STALE_DAYS : false;
    stamp.textContent = asOf ? "as of " + fmtDate(asOf) : "";
    stamp.classList.toggle("stale", old);
    stamp.title = old ? "Older than 3 months: time for a check-in" : "";
  }
  if (!host) return;
  const lines = [];
  const s = sinceLast(state.ibkrImports);
  if (s) {
    const sign = v => (v >= 0 ? "+" : "−") + eur(Math.abs(v));
    const last = state.ibkrImports[state.ibkrImports.length - 1];
    const why = last.source === "manual" ? "a typed total has no deposits" : "this statement does not start at the last check-in";
    lines.push("<div><b>" + sign(s.change) + "</b> since " + fmtDate(s.since) +
      (s.added != null ? ": " + eur(s.added) + " added, " + sign(s.markets) + " markets" : ' <span class="tgt">(' + why + ", so added vs markets is not split)</span>") + "</div>");
  }
  if (state.ibkrSource === "manual") lines.push('<div class="tgt">Typed total: the unrealised gain % was not refreshed.</div>');
  for (const w of state.ibkrWarnings || []) lines.push('<div class="warn">⚠ ' + w + "</div>");
  host.innerHTML = lines.join("");
}

function recordImport(imp) {
  const prev = (state.ibkrImports || [])[state.ibkrImports.length - 1] || null;
  state.ibkrWarnings = importWarnings(imp, prev, todayIso());
  state.ibkrImports = [...(state.ibkrImports || []), {
    asOf: imp.asOf, total: imp.total, deposits: imp.deposits ?? null, periodStart: imp.periodStart ?? null, source: imp.source,
  }].slice(-24);
  state.ibkrAsOf = imp.asOf;
  state.ibkrSource = imp.source;
}

export function handleCSV(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = e => {
    const r = parseIbkrStatement(e.target.result);
    state.ibkrTotal = r.total; state.ibkrHoldings = r.holdings;
    if (r.gainFrac != null) { const gf = el('gainFrac'); if (gf) { gf.value = r.gainFrac; gf.dispatchEvent(new Event('input')); } }
    recordImport({ ...r, asOf: r.asOf || todayIso(), source: "statement" });
    // v8.17: the import is also a dated net-worth snapshot in the history
    state.nwHistory = snapshotFromImport(state.nwHistory, { total: r.total, asOf: state.ibkrAsOf }, parseFloat(el("cash")?.value) || 0, sinceLast(state.ibkrImports));
    renderHoldings(); renderCheckin(); renderNwHistory();
    recalc();
  };
  reader.readAsText(input.files[0]);
}
