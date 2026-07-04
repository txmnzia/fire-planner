import { el, eur } from "../util.js";
import { state } from "../state.js";
import { recalc } from "../recalc.js";

// ── IBKR CSV ────────────────────────────────────────────────────────────────
function parseLine(line) {
  const cols = []; let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  cols.push(cur.trim()); return cols;
}

export function renderHoldings() {
  const btn = el("uploadBtn");
  if (!state.ibkrHoldings.length && state.ibkrTotal === 0) return;
  const posCount = state.ibkrHoldings.filter(p => p.qty !== null).length;
  btn.classList.add("loaded");
  btn.innerHTML = "\u2713 Loaded \u2014 " + posCount + " positions";
  const list = el("holdingsList");
  list.style.display = "flex"; list.style.flexDirection = "column"; list.style.gap = "3px";
  let h = state.ibkrHoldings.map(p => p.qty !== null
    ? '<div class="pb-row"><span class="k">'+p.sym+" \u00d7"+p.qty+'</span><span class="v">'+eur(p.val)+"</span></div>"
    : '<div class="pb-row"><span class="k">'+p.sym+'</span><span class="v">'+eur(p.val)+"</span></div>"
  ).join("");
  h += '<div style="height:1px;background:var(--bdr);margin:4px 0"></div>';
  h += '<div class="pb-row"><span class="k" style="color:var(--sec)">IBKR Total</span><span class="v" style="color:var(--text)">'+eur(state.ibkrTotal)+"</span></div>";
  list.innerHTML = h;
}

export function handleCSV(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split("\n").map(l => l.trim()).filter(Boolean);
    state.ibkrTotal = 0; state.ibkrHoldings = [];
    const EQUITY_CATS = new Set(["Stocks","Stock","Equity","Equities"]);
    const navExtras = {};
    let positionsCostBasis = 0, costBasisValid = true;
    // Column indices for "Open Positions" rows — resolved from the section's own
    // header row when present, so IBKR layout changes don't silently shift values.
    let posCols = null;
    const DEFAULT_POS_COLS = { sym:5, qty:6, cost:8, val:11 };
    for (const line of lines) {
      const c = parseLine(line);
      if (c.length < 3) continue;
      if (c[0]==="Open Positions"&&c[1]==="Header") {
        const find = n => c.indexOf(n);
        const m = { sym:find("Symbol"), qty:find("Quantity"), cost:find("Cost Price"), val:find("Value") };
        if (m.sym>0 && m.qty>0 && m.cost>0 && m.val>0) posCols = m;
      }
      if (c[0]==="Open Positions"&&c[1]==="Data"&&c[2]==="Summary") {
        const ix = posCols || DEFAULT_POS_COLS;
        const sym=c[ix.sym]||"", qty=parseFloat(c[ix.qty])||0, val=parseFloat(c[ix.val])||0;
        const costPrice = parseFloat(c[ix.cost]);
        if (sym) {
          state.ibkrHoldings.push({sym,qty,val});
          if (!isNaN(costPrice) && costPrice > 0) positionsCostBasis += qty * costPrice;
          else costBasisValid = false;
        }
      }
      if (c[0]==="Net Asset Value"&&c[1]==="Data") {
        const cat=c[2]?.trim(), v=parseFloat(c[6]);
        if (isNaN(v)||!cat) continue;
        if (cat==="Total") { state.ibkrTotal=v; continue; }
        if (!EQUITY_CATS.has(cat) && Math.abs(v)>0.01) navExtras[cat]=(navExtras[cat]||0)+v;
      }
    }
    // Append non-position NAV items (Cash, etc.) after positions
    const cashFirst = Object.entries(navExtras).sort(([a],[b])=> a==="Cash"?-1:b==="Cash"?1:a.localeCompare(b));
    let nonEquityValue = 0;
    for (const [cat,val] of cashFirst) { state.ibkrHoldings.push({sym:cat, qty:null, val}); nonEquityValue += val; }
    // Auto-fill the visible (and persisted) unrealised-gain-fraction input
    if (costBasisValid && positionsCostBasis > 0 && state.ibkrTotal > 0) {
      const totalCostBasis = positionsCostBasis + nonEquityValue; // cash carries no gain
      const autoGainFrac = Math.max(0, Math.min(99, Math.round((state.ibkrTotal - totalCostBasis) / state.ibkrTotal * 100)));
      const gf = el('gainFrac'); if (gf) gf.value = autoGainFrac;
    }
    renderHoldings();
    recalc();
  };
  reader.readAsText(input.files[0]);
}
