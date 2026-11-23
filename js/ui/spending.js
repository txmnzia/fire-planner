// Spending refresh (v8.7): read-outs under the four spending numbers and the
// "last refreshed" date. The numbers come from the engine (investNowMonthly), so
// the read-out is the same calculation the projection uses in year one.
import { el, eur, numVal } from "../util.js?v=8.8";
import { investNowMonthly } from "../engine.js?v=8.8";

export const REFRESH_FIELDS = ['samPersonalNow', 'samPaysIn', 'partnerPaysIn', 'yearlyItems'];
export const STALE_DAYS = 183;

// Pure: the date line. iso = 'YYYY-MM-DD' or ''; today = Date.
export function refreshedText(iso, today) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { text: '', stale: false };
  const d = new Date(iso + 'T00:00:00Z');
  const days = Math.floor((today - d) / 86400000);
  const txt = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { text: 'last: ' + txt, stale: days > STALE_DAYS };
}

export function renderSpendReadout(gl) {
  const host = el('spendReadout'); if (!host) return;
  const upd = refreshedText(el('spendUpdated')?.value || '', new Date());
  const ut = el('spendUpdatedTxt');
  if (ut) { ut.textContent = upd.text; ut.classList.toggle('stale', upd.stale); ut.title = upd.stale ? 'More than 6 months old: time for a refresh' : ''; }
  const takeHome = numVal('baseIncome', 0);
  const n = investNowMonthly(gl, takeHome);
  const lines = [];
  const rent = gl.propRentSaved || 0;
  if (gl.sharedNow > 0) lines.push('Joint account <b>' + eur(gl.sharedNow) + '/month</b>' + (rent > 0 ? ', of which rent ' + eur(rent) + ' (from Rent today)' : ''));
  lines.push('Her share of shared costs today: <b>' + Math.round(n.share * 100) + '%</b> ' +
    '(what she pays in), about ' + eur(n.contrib) + '/mo with yearly items');
  if (takeHome > 0) lines.push('You really invest <b class="' + (n.invest < 0 ? 'neg' : '') + '">' + eur(n.invest) + '/month</b>' +
    ' = take-home ' + eur(takeHome) + ' − your cost ' + eur(n.cost));
  host.innerHTML = lines.map(l => '<div>' + l + '</div>').join('');
}

// Any edit to one of the four numbers stamps today's date.
export function initSpendTracking(onChange) {
  REFRESH_FIELDS.forEach(id => {
    const d = el(id + '_disp'); if (!d) return;
    d.addEventListener('input', () => {
      const h = el('spendUpdated'); if (!h) return;
      h.value = new Date().toISOString().slice(0, 10);
      if (onChange) onChange();
    });
  });
}
