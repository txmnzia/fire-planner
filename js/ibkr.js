// IBKR activity statement (pure, v8.10): parse the CSV text, and the check-in
// read-outs that compare one import with the previous ones. No DOM, so the whole
// check-in is testable under Node with made-up statements.

function parseLine(line) {
  const cols = []; let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  cols.push(cur.trim()); return cols;
}

const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7,
                 september:8, october:9, november:10, december:11 };
// "May 1, 2026" → "2026-05-01"; null when it does not parse.
export function parseIbkrDate(s) {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(s || "");
  if (!m || MONTHS[m[1].toLowerCase()] === undefined) return null;
  const mo = MONTHS[m[1].toLowerCase()] + 1;
  return m[3] + "-" + String(mo).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
}
// Statement period: "May 1, 2026" or "January 1, 2026 - March 31, 2026".
export function parsePeriod(s) {
  const parts = String(s || "").split(/\s+-\s+/);
  const start = parseIbkrDate(parts[0]), end = parseIbkrDate(parts[parts.length - 1]);
  return { start, end };
}

// Returns { total, holdings, gainFrac (0-99 or null), asOf, periodStart,
//           startValue, deposits } — null fields when the statement lacks them.
export function parseIbkrStatement(text) {
  const lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  let total = 0; const holdings = [];
  const EQUITY_CATS = new Set(["Stocks", "Stock", "Equity", "Equities"]);
  const navExtras = {};
  let positionsCostBasis = 0, costBasisValid = true;
  let posCols = null;
  const DEFAULT_POS_COLS = { sym: 5, qty: 6, cost: 8, val: 11 };
  let period = { start: null, end: null }, startValue = null, deposits = null;
  for (const line of lines) {
    const c = parseLine(line);
    if (c.length < 3) continue;
    if (c[0] === "Statement" && c[1] === "Data" && c[2] === "Period") period = parsePeriod(c[3]);
    if (c[0] === "Change in NAV" && c[1] === "Data") {
      const v = parseFloat(c[3]);
      if (c[2] === "Starting Value" && !isNaN(v)) startValue = v;
      if (c[2] === "Deposits & Withdrawals" && !isNaN(v)) deposits = v;
    }
    if (c[0] === "Open Positions" && c[1] === "Header") {
      const find = n => c.indexOf(n);
      const m = { sym: find("Symbol"), qty: find("Quantity"), cost: find("Cost Price"), val: find("Value") };
      if (m.sym > 0 && m.qty > 0 && m.cost > 0 && m.val > 0) posCols = m;
    }
    if (c[0] === "Open Positions" && c[1] === "Data" && c[2] === "Summary") {
      const ix = posCols || DEFAULT_POS_COLS;
      const sym = c[ix.sym] || "", qty = parseFloat(c[ix.qty]) || 0, val = parseFloat(c[ix.val]) || 0;
      const costPrice = parseFloat(c[ix.cost]);
      if (sym) {
        holdings.push({ sym, qty, val });
        if (!isNaN(costPrice) && costPrice > 0) positionsCostBasis += qty * costPrice;
        else costBasisValid = false;
      }
    }
    if (c[0] === "Net Asset Value" && c[1] === "Data") {
      const cat = c[2]?.trim(), v = parseFloat(c[6]);
      if (isNaN(v) || !cat) continue;
      if (cat === "Total") { total = v; continue; }
      if (!EQUITY_CATS.has(cat) && Math.abs(v) > 0.01) navExtras[cat] = (navExtras[cat] || 0) + v;
    }
  }
  const cashFirst = Object.entries(navExtras).sort(([a], [b]) => a === "Cash" ? -1 : b === "Cash" ? 1 : a.localeCompare(b));
  let nonEquityValue = 0;
  for (const [cat, val] of cashFirst) { holdings.push({ sym: cat, qty: null, val }); nonEquityValue += val; }
  let gainFrac = null;
  if (costBasisValid && positionsCostBasis > 0 && total > 0) {
    const totalCostBasis = positionsCostBasis + nonEquityValue;   // cash carries no gain
    gainFrac = Math.max(0, Math.min(99, Math.round((total - totalCostBasis) / total * 100)));
  }
  return { total, holdings, gainFrac, asOf: period.end, periodStart: period.start, startValue, deposits };
}

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// Warnings for a new import (story 1): an old statement, or a total far from the last one.
export function importWarnings(imp, prev, todayIso) {
  const w = [];
  if (imp.asOf && todayIso && days(imp.asOf, todayIso) > 31)
    w.push("This statement ends on " + imp.asOf + ". Use a newer one?");
  if (prev && prev.total > 0 && imp.total > 0 && Math.abs(imp.total / prev.total - 1) > 0.25)
    w.push("The total moved more than 25% since the last import (" + Math.round(prev.total) + " on " + prev.asOf + "). Is this the right file?");
  return w;
}

// "+€38k since 31 Dec: €24k added, €14k markets": the change since the previous
// import, split into money you added and the rest (markets). The split is only
// exact when the new statement's period starts right after the previous import
// (within 3 days): otherwise its deposits cover a different span and added is
// null (only the change is shown).
export function sinceLast(imports) {
  if (!Array.isArray(imports) || imports.length < 2) return null;
  const last = imports[imports.length - 1], prev = imports[imports.length - 2];
  const change = last.total - prev.total;
  const aligned = last.deposits != null && last.periodStart && prev.asOf && Math.abs(days(prev.asOf, last.periodStart) - 1) <= 3;
  const added = aligned ? last.deposits : null;
  return { since: prev.asOf, change, added, markets: added == null ? null : change - added };
}

// Deposits per month over the imports of the last ~6 months, vs what you invest
// on paper per month: a gap over 20% is flagged (story 1 / 2).
export function depositCheck(imports, investMonthly, todayIso) {
  if (!Array.isArray(imports) || !imports.length || !(investMonthly > 0)) return null;
  const from = new Date(Date.parse(todayIso) - 183 * DAY).toISOString().slice(0, 10);
  const recent = imports.filter(i => i.periodStart && i.asOf && i.asOf >= from && i.deposits != null);
  if (!recent.length) return null;
  const months = recent.reduce((a, i) => a + Math.max(1, Math.round((days(i.periodStart, i.asOf) + 1) / 30.44)), 0);
  const perMonth = recent.reduce((a, i) => a + i.deposits, 0) / months;
  const gap = 1 - perMonth / investMonthly;
  return { perMonth, months, gap, flagged: Math.abs(gap) > 0.2 };
}
