// Spending refresh (v8.7): read-outs under the four spending numbers and the
// "last refreshed" date. The numbers come from the engine (investNowMonthly), so
// the read-out is the same calculation the projection uses in year one.
import { el, eur, numVal } from "../util.js?v=8.17";
import { investNowMonthly } from "../engine.js?v=8.17";
import { PENSION_COUNTRIES, pensionNetEstimate } from "../pensions.js?v=8.17";
import { depositCheck } from "../ibkr.js?v=8.17";
import { state } from "../state.js?v=8.17";

export const REFRESH_FIELDS = ['samPersonalNow', 'samPaysIn', 'partnerPaysIn', 'yearlyItems'];
export const STALE_DAYS = 183;

// Check-ins (v8.9): each tile stamps the date its numbers were last typed and
// turns red when overdue: portfolio 3 months, spending 6, pensions 12.
export const CHECKINS = [
  { key: 'spend',   stamp: 'spendUpdated',   txt: 'spendUpdatedTxt',   days: 183, fields: REFRESH_FIELDS },
  { key: 'pension', stamp: 'pensionUpdated', txt: 'pensionUpdatedTxt', days: 365, fields: ['pensionAmt', 'pension2Amt'] },
];

// Pure: the date line. iso = 'YYYY-MM-DD' or ''; today = Date.
export function refreshedText(iso, today, staleDays = STALE_DAYS) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { text: '', stale: false };
  const d = new Date(iso + 'T00:00:00Z');
  const days = Math.floor((today - d) / 86400000);
  const txt = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { text: 'last: ' + txt, stale: days > staleDays };
}

export function renderSpendReadout(gl) {
  const host = el('spendReadout'); if (!host) return;
  for (const c of CHECKINS) {
    const upd = refreshedText(el(c.stamp)?.value || '', new Date(), c.days);
    const ut = el(c.txt);
    if (ut) { ut.textContent = upd.text; ut.classList.toggle('stale', upd.stale); ut.title = upd.stale ? 'Overdue: time for a refresh' : ''; }
  }
  renderPensionReadout(gl);
  const takeHome = numVal('baseIncome', 0);
  const n = investNowMonthly(gl, takeHome);
  const lines = [];
  const rent = gl.propRentSaved || 0;
  if (gl.sharedNow > 0) lines.push('Joint account <b>' + eur(gl.sharedNow) + '/month</b>' + (rent > 0 ? ', of which rent ' + eur(rent) + ' (from Rent today)' : ''));
  lines.push('Her share of shared costs today: <b>' + Math.round(n.share * 100) + '%</b> ' +
    '(what she pays in), about ' + eur(n.contrib) + '/mo with yearly items');
  if (takeHome > 0) lines.push('You really invest <b class="' + (n.invest < 0 ? 'neg' : '') + '">' + eur(n.invest) + '/month</b>' +
    ' = take-home ' + eur(takeHome) + ' − your cost ' + eur(n.cost));
  // what actually reached IBKR over the last 6 months of check-ins (story 1/2)
  const dc = depositCheck(state.ibkrImports, n.invest, new Date().toISOString().slice(0, 10));
  if (dc) lines.push((dc.flagged ? '<span class="warn">\u26a0 ' : '') + 'Deposits at IBKR: ' + eur(dc.perMonth) + '/month over the last ' + dc.months +
    ' months of statements, vs ' + eur(n.invest) + ' on paper' + (dc.flagged ? ' (more than 20% apart)</span>' : ''));
  host.innerHTML = lines.map(l => '<div>' + l + '</div>').join('');
}

// Pension read-out: the net estimate next to each statement amount.
function renderPensionReadout(gl) {
  const host = el('pensionReadout'); if (!host) return;
  const rows = [['DE', gl.pensionAmt, gl.pensionAge], ['FR', gl.pension2Amt, gl.pension2Age]]
    .filter(([, a]) => a > 0)
    .map(([c, a, age]) => '<div>' + PENSION_COUNTRIES[c].name + ' pension from ' + age + ': <b>\u2248 ' + eur(pensionNetEstimate(c, a)) +
      ' net</b> of ' + eur(a) + ' gross <span class="tgt">after ' + PENSION_COUNTRIES[c].why + '; income tax not included</span></div>');
  host.innerHTML = rows.length ? rows.join('') + '<div class="tgt">The plan uses the gross amounts, as typed.</div>' : '';
}

// Any edit to a tile's numbers stamps today's date on that tile.
export function initSpendTracking(onChange) {
  for (const c of CHECKINS) c.fields.forEach(id => {
    const d = el(id + '_disp') || el(id); if (!d) return;
    d.addEventListener('input', () => {
      const h = el(c.stamp); if (!h) return;
      h.value = new Date().toISOString().slice(0, 10);
      if (onChange) onChange();
    });
  });
}
