// Changes tab (v8.17): two lanes of tiles, "Now" (facts) and "Might happen"
// (plans). A tile shows a one-line summary and opens in place; one open tile per
// lane. The fields inside are the same inputs as before (same ids), so saving,
// sync and the engine are untouched. The impact panel sits beside the lanes.
import { ownerFigures } from "./housing.js?v=8.22";
import { el, eur } from "../util.js?v=8.22";
import { state } from "../state.js?v=8.22";
import { refreshedText } from "./spending.js?v=8.22";
import { plansSetUp } from "../checks.js?v=8.22";

const OPEN_KEY = 'fire_open_tiles';
const k = v => '€' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? Math.round(v / 1000) + 'k' : Math.round(v).toLocaleString('en-GB'));
const fmtDay = iso => iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

function setOpen(tile, open) {
  const hd = tile.querySelector('.tile-hd'), body = tile.querySelector('.tile-body');
  tile.classList.toggle('open', open); hd.setAttribute('aria-expanded', String(open)); body.hidden = !open;
}
function saveOpen() {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...document.querySelectorAll('.tile.open')].map(t => t.id))); } catch {}
}
export function openTile(id) {
  const t = el(id); if (!t) return;
  t.closest('.chg-lane')?.querySelectorAll('.tile.open').forEach(o => { if (o !== t) setOpen(o, false); });
  setOpen(t, true); saveOpen();
}
export function initTiles() {
  document.querySelectorAll('.tile').forEach(t => t.querySelector('.tile-hd').addEventListener('click', () => {
    if (t.classList.contains('open')) { setOpen(t, false); saveOpen(); } else openTile(t.id);
  }));
  // a field reached from elsewhere (banner Fix, review Go) opens its tile. Only
  // fields inside a tile's body: focusing the header button (a click on it) must
  // not open the tile first, or the click would close it again (v8.17.1).
  document.addEventListener('focusin', e => {
    const b = e.target.closest && e.target.closest('.tile-body'); if (!b) return;
    const t = b.closest('.tile'); if (t && !t.classList.contains('open')) openTile(t.id);
  });
  let ids = []; try { ids = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch {}
  ids.forEach(id => { if (el(id)) openTile(id); });
  const tog = el('impactToggle');
  if (tog) tog.addEventListener('click', () => { const a = el('chgImpact'); a.classList.toggle('expanded'); tog.setAttribute('aria-expanded', String(a.classList.contains('expanded'))); });
}
// Make sure the tile holding a field is open (used before scrolling to it).
export function revealField(fieldEl) {
  const t = fieldEl && fieldEl.closest('.tile'); if (t && !t.classList.contains('open')) openTile(t.id);
}

function put(id, sum, badge, stale) {
  const s = el(id + '-sum'); if (s) s.textContent = sum;
  const b = el(id + '-badge'); if (b) { b.textContent = badge || ''; b.classList.toggle('stale', !!stale); }
}

// One-line summaries and date badges, from the same gl the engine uses.
export function renderTiles(gl) {
  const f = id => el(id) ? el(id).value : '';
  const port = refreshedText(state.ibkrAsOf || '', new Date(), 92);
  put('tile-port', k(state.ibkrTotal || 0) + ' invested + ' + k(gl.cash || 0) + ' cash · ' + state.nwHistory.length + ' snapshot' + (state.nwHistory.length === 1 ? '' : 's'),
      state.ibkrAsOf ? 'as of ' + fmtDay(state.ibkrAsOf) : 'no import yet', !state.ibkrAsOf || port.stale);
  const sp = refreshedText(f('spendUpdated'), new Date(), 183);
  put('tile-spend', 'own ' + k(gl.samPersonalNow) + ' · joint ' + k(gl.sharedNow) + (gl.yearlyItems > 0 ? ' · yearly ' + k(gl.yearlyItems) : '') + (gl.retSpendChange ? ' · retired ' + (gl.retSpendChange > 0 ? '+' : '') + Math.round(gl.retSpendChange * 100) + '%' : ''),
      sp.text, sp.stale);
  put('tile-pay', k(parseFloat(f('baseIncome')) || 0) + '/month take-home', '');
  const pe = refreshedText(f('pensionUpdated'), new Date(), 365);
  // v8.19: the net amounts the plan uses (gl), one per country
  const pens = [gl.pensionAmt > 0 ? 'DE ' + k(gl.pensionAmt) + ' from ' + gl.pensionAge : '', gl.pension2Amt > 0 ? 'FR ' + k(gl.pension2Amt) + ' from ' + gl.pension2Age : '',
    ...(state.pensionsMore || []).filter(p => p.amt > 0).map((p, i) => p.country + ' ' + k((gl.pensionsMore[i] || {}).amt || 0) + ' from ' + p.age)].filter(Boolean);
  put('tile-pension', pens.length ? pens.join(' · ') + ' net' : 'none entered', pe.text, pe.stale);
  const nextRent = (state.rentMoves || []).filter(m => m.rent != null).sort((a, b) => a.from - b.from)[0];
  put('tile-housing', 'rent ' + k(gl.propRentSaved || 0) + '/month' + (nextRent ? ' · planned ' + k(nextRent.rent) + ' from ' + nextRent.from : ''), '');
  const sel = el('retCountry'), ctry = sel ? (sel.options[sel.selectedIndex] || {}).text || '' : '';
  put('tile-where', ctry.replace(/\s+[\d.]+%$/, '').trim() + ' · ' + Math.round(gl.taxRate * 1000) / 10 + '% on gains', '');
  put('tile-you', 'age ' + gl.currentAge + ' · plan until ' + gl.lifeExp, '');
  put('tile-partner', 'her take-home ' + k(gl.partnerInc) + '/month · stops at ' + gl.partnerRetAge + (gl.partnerPension > 0 ? ' · pension ' + k(gl.partnerPension) + ' from ' + gl.partnerPensionAge : ''), '');
  put('tile-assump', 'stocks ' + (gl.stockRet * 100).toFixed(1).replace('.0', '') + '% · bonds ' + (gl.bondRet * 100).toFixed(1).replace('.0', '') + '% · inflation ' + (gl.inflation * 100).toFixed(1).replace('.0', '') + '% · ' + (gl.wdMode === 'swr' ? 'draw ' + (gl.swr * 100).toFixed(1).replace('.0', '') + '%' : 'fixed amount'), '');

  const up = plansSetUp(gl);
  if (gl.homeOwned) {   // v8.22: "Your home"
    const f = ownerFigures(gl);
    put('tile-buy', 'loan left ' + k(f.loanLeft) + (f.payNow > 0 ? ' · ' + k(f.payNow) + '/month' + (f.changes ? ' · fixed until ' + f.fixedEnd : '') : ' · paid off') + ' · equity ' + k(f.equity), '');
  } else put('tile-buy', up.prop ? k(gl.propPrice) + ' in ' + gl.propBuyYear : 'not set up: type a price', '');
  put('tile-child', up.child ? 'born ' + gl.childBirthYear + (gl.childCostYearly > 0 ? ' · ' + k(gl.childCostYearly) + '/year' : '') : 'not set up: type a yearly cost', '');
  const pc = state.payChanges || [];
  put('tile-paychg', pc.length ? pc.map(p => (p.name || 'change') + ' from ' + p.from).join(' · ') : 'none: a 4-day week, a break, a new job', '');
  const rm = (state.rentMoves || []).filter(m => m.rent != null);
  put('tile-flat', rm.length ? rm.map(m => k(m.rent) + ' from ' + m.from).join(' · ') : 'none planned', '');
  const mv = state.residence || [];
  put('tile-move', mv.length ? mv.map(m => m.country + ' from ' + m.from).join(' · ') : 'none planned', '');
  const wf = (state.windfalls || []).filter(w => w.amt > 0);
  put('tile-wf', wf.length ? wf.map(w => (w.name && w.name.trim() ? w.name.trim() + ' ' : '') + k(w.amt) + ' in ' + w.yr).join(' · ') : 'none', '');
}
