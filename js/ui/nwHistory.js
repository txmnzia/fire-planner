import { el } from "../util.js";
import { state } from "../state.js";
import { recalc } from "../recalc.js";
import { buildYpick, fmtMoney, cleanMoney } from "./situation.js";

// ── NET WORTH HISTORY (plan vs actual) ───────────────────────────────────────
// Compact datapoint rows shared with the windfalls list: one discreet line per
// snapshot (year + net worth), with optional monthly income/spending tucked
// behind a per-row "actuals" toggle so a bare snapshot stays a single line.
export function renderNwHistory() {
  const host = el('nwHistList'); if (!host) return;
  host.innerHTML = '';
  const fv = v => (v == null || isNaN(v)) ? '' : fmtMoney(v);
  state.nwHistory.forEach((r, i) => {
    const open = r.income != null || r.spend != null;
    const row = document.createElement('div'); row.className = 'dp-row' + (open ? ' open' : '');
    row.innerHTML =
      '<div class="dp-main"><div class="ypick mini"></div>' +
      '<div class="inp cur mini"><span class="pre">€</span>' +
        '<input type="text" inputmode="decimal" autocomplete="off" placeholder="Net worth" value="' + fv(r.val) + '"></div>' +
      '<button type="button" class="dp-more"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>actuals</button>' +
      '<button type="button" class="dp-del" aria-label="Remove snapshot">×</button></div>' +
      '<div class="dp-extra">' +
        '<div class="inp cur mini"><span class="pre">€</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="Income /mo" value="' + fv(r.income) + '"></div>' +
        '<div class="inp cur mini"><span class="pre">€</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="Spending /mo" value="' + fv(r.spend) + '"></div>' +
      '</div>';
    host.appendChild(row);
    buildYpick(row.querySelector('.ypick'), {
      min: 2000, max: 2060,
      getVal: () => (r.year == null ? null : +r.year),
      setVal: y => { r.year = y || 0; recalc(); },
    });
    const [valEl, incEl, spendEl] = row.querySelectorAll('.cur input');
    valEl.addEventListener('input', e => { const raw = cleanMoney(e.target.value); e.target.value = fmtMoney(raw); const n = parseFloat(raw); r.val = isNaN(n) ? 0 : n; recalc(); });
    incEl.addEventListener('input', e => { const raw = cleanMoney(e.target.value); e.target.value = fmtMoney(raw); const n = parseFloat(raw); r.income = isNaN(n) ? null : n; recalc(); });
    spendEl.addEventListener('input', e => { const raw = cleanMoney(e.target.value); e.target.value = fmtMoney(raw); const n = parseFloat(raw); r.spend = isNaN(n) ? null : n; recalc(); });
    row.querySelector('.dp-more').addEventListener('click', () => row.classList.toggle('open'));
    row.querySelector('.dp-del').addEventListener('click', () => { state.nwHistory.splice(i, 1); renderNwHistory(); recalc(); });
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'dp-add';
  add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add snapshot';
  add.addEventListener('click', addNwRow);
  host.appendChild(add);
}
export function addNwRow() {
  const nextYr = state.nwHistory.length ? Math.max(...state.nwHistory.map(r => r.year)) + 1 : 2021;
  state.nwHistory.push({ year: nextYr, val: 0, income: null, spend: null });
  renderNwHistory(); recalc();
}
export function updateNwRow(i, key, v) {
  if (!state.nwHistory[i]) return;
  if (key === 'year') state.nwHistory[i].year = parseInt(v) || 0;
  else { const n = parseFloat(v); state.nwHistory[i][key] = isNaN(n) ? (key === 'val' ? 0 : null) : n; }
  recalc();
}
export function removeNwRow(i) {
  state.nwHistory.splice(i, 1); renderNwHistory(); recalc();
}
