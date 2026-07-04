import { el } from "../util.js";
import { state } from "../state.js";
import { recalc } from "../recalc.js";

// ── NET WORTH HISTORY (plan vs actual) ───────────────────────────────────────
export function renderNwHistory() {
  const list = el('nwHistList'); if (!list) return;
  if (!state.nwHistory.length) {
    list.innerHTML = '<p style="font-size:11px;color:var(--muted)">No snapshots yet — add your past net worth to compare.</p>';
    return;
  }
  const fv = v => (v==null||isNaN(v)) ? '' : v;
  list.innerHTML = state.nwHistory.map((r,i) =>
    '<div class="nw-card">'+
      '<div class="nw-card-hd">'+
        '<div class="field" style="flex:0 0 120px"><label>Year</label><input type="number" min="2000" max="2060" step="1" value="'+r.year+'" onchange="updateNwRow('+i+',\'year\',this.value)"></div>'+
        '<button class="nw-del" onclick="removeNwRow('+i+')" aria-label="Remove snapshot" title="Remove">×</button>'+
      '</div>'+
      '<div class="field"><label>Net Worth</label><div class="unit-wrap"><input type="number" min="0" step="1000" value="'+fv(r.val)+'" onchange="updateNwRow('+i+',\'val\',this.value)"><span class="u">€</span></div></div>'+
      '<div class="nw-grid">'+
        '<div class="field"><label>Income /mo (net)</label><div class="unit-wrap"><input type="number" min="0" step="100" placeholder="optional" value="'+fv(r.income)+'" onchange="updateNwRow('+i+',\'income\',this.value)"><span class="u">€</span></div></div>'+
        '<div class="field"><label>Spending /mo</label><div class="unit-wrap"><input type="number" min="0" step="100" placeholder="optional" value="'+fv(r.spend)+'" onchange="updateNwRow('+i+',\'spend\',this.value)"><span class="u">€</span></div></div>'+
      '</div>'+
    '</div>'
  ).join('');
}
export function addNwRow() {
  const nextYr = state.nwHistory.length ? Math.max(...state.nwHistory.map(r=>r.year))+1 : 2021;
  state.nwHistory.push({ year: nextYr, val: 0, income: null, spend: null });
  renderNwHistory(); recalc();
}
export function updateNwRow(i, key, v) {
  if (!state.nwHistory[i]) return;
  if (key==='year') state.nwHistory[i].year = parseInt(v)||0;
  else { const n = parseFloat(v); state.nwHistory[i][key] = isNaN(n) ? (key==='val'?0:null) : n; }
  recalc();
}
export function removeNwRow(i) {
  state.nwHistory.splice(i,1); renderNwHistory(); recalc();
}
