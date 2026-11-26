// Spending refresh (v8.7): read-outs under the four spending numbers and the
// "last refreshed" date. The numbers come from the engine (investNowMonthly), so
// the read-out is the same calculation the projection uses in year one.
import { el, eur, numVal } from "../util.js?v=8.30";
import { investNowMonthly, partnerShare, firstPensionAge } from "../engine.js?v=8.30";
import { healthPresetMonthly, DE_HEALTH, FR_HEALTH } from "../health.js?v=8.30";
import { netPay, hasNetCalc } from "../netPay.js?v=8.30";
import { accrualGrossMonthly, pensionNet } from "../pensions.js?v=8.30";
import { payContext, resolvePay } from "../inputs.js?v=8.30";
import { pensionReadoutRows } from "./pensions.js?v=8.30";
import { fmtMoney } from "./situation.js?v=8.30";
import { depositCheck } from "../ibkr.js?v=8.30";
import { state } from "../state.js?v=8.30";

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
  renderPartnerReadout(gl);
  renderHealthReadout(gl);
  renderPayReadout(gl);
  const takeHome = numVal('baseIncome', 0);
  const n = investNowMonthly(gl, takeHome);
  const lines = [];
  const rent = gl.propRentSaved || 0;
  if (gl.homeOwned) lines.push('<span class="tgt">You own your home: keep the loan payment and home charges out of these transfers; the plan adds them.</span>');
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

// Partner read-out (v8.21): the pro-rata share her income gives today, next to what
// she really pays in. Pro rata is the rule once one of you stops working or your pay
// changes (README, partner model); the real share applies while both work as today.
export function renderPartnerReadout(gl) {
  const host = el('partnerReadout'); if (!host) return;
  const you = numVal('baseIncome', 0);
  if (!(gl.partnerInc > 0) || !(you > 0)) { host.innerHTML = ''; return; }
  const pro = partnerShare(gl.partnerInc, you), real = investNowMonthly(gl, you).share;
  host.innerHTML = '<div>Pro rata today would be <b>' + Math.round(pro * 100) + '%</b> <span class="tgt">(her ' + eur(gl.partnerInc) + ' \u00f7 both ' + eur(gl.partnerInc + you) + ')</span>; she really pays <b>' + Math.round(real * 100) + '%</b> of the joint costs.</div>' +
    '<div class="tgt">Pro rata is used once one of you stops working or your pay changes.</div>';
}

// Health insurance read-out (v8.26): the estimate per country you would live in
// after stopping, and until which age it is paid.
export function renderHealthReadout(gl) {
  const host = el('healthReadout'); if (!host) return;
  const until = firstPensionAge(gl), seen = new Set(), lines = [];
  for (const p of gl.residence || []) {
    if (seen.has(p.country)) continue; seen.add(p.country);
    const m = healthPresetMonthly(p.country, gl.healthGainMonthly);
    const why = p.country === 'DE' ? (DE_HEALTH.rate * 100).toFixed(1) + '% of the gains you would live on (est. ' + eur(gl.healthGainMonthly) + '/mo; at least ' + eur(DE_HEALTH.minBase) + ')'
      : p.country === 'FR' ? 'a mutuelle (~' + eur(FR_HEALTH.mutuelle) + ') + 6.5% of capital income above ' + eur(FR_HEALTH.threshold) + '/yr'
      : 'a rough default';
    lines.push('<div>' + countryName(p.country) + (p.from ? ' (from ' + p.from + ')' : '') + ': <b>\u2248 ' + eur(m) + '/month</b> <span class="tgt">' + why + '</span></div>');
  }
  host.innerHTML = (gl.healthAfterStop != null ? '<div>You typed <b>' + eur(gl.healthAfterStop) + '/month</b> (used everywhere).</div>' : lines.join('')) +
    '<div class="tgt">Paid from your stop age until your first state pension (' + until + '); then the pension deduction covers it.</div>';
}

// Pay read-out (v8.27): what today's gross gives as take-home (a check on the
// calculator), and the pension rights one more working year adds where you live.
// Also refreshes the estimated take-home shown in each planned pay change.
export function renderPayReadout(gl) {
  const host = el('payReadout');
  if (host) {
    const lines = [], g = gl.grossNow, seen = new Set();
    if (g > 0) {
      const { country, opts } = payContext(gl, gl.baseYear, gl.residence, true);
      if (hasNetCalc(country)) {
        const net = netPay(country, g, opts).net / 12, typed = numVal('baseIncome', 0);
        lines.push('<div>In ' + countryName(country) + ' this gives <b>\u2248 ' + eur(net) + '/month</b> take-home' +
          (typed > 0 ? ' <span class="tgt">you typed ' + eur(typed) + (Math.abs(net - typed) > 0.1 * typed ? ': check one of the two' : '') + '</span>' : '') + '</div>');
      }
      for (const p of gl.residence || []) {
        if (seen.has(p.country)) continue; seen.add(p.country);
        const add = pensionNet(p.country, accrualGrossMonthly(p.country, g));
        if (add > 0) lines.push('<div>Each year you work in ' + countryName(p.country) + (p.from ? ' (from ' + p.from + ')' : '') +
          ' adds <b>\u2248 ' + eur(add) + '/month</b> to your pension <span class="tgt">net, today\u2019s money, at this pay</span></div>');
      }
      if (seen.has('FR')) lines.push('<div class="tgt">France: the full rate is assumed at your French pension age; with fewer than 172 quarters in all (EU careers count) it only comes at 67.</div>');
      lines.push('<div class="tgt">Rights stop at each scenario\u2019s stop age; other countries add none.</div>');
    } else lines.push('<div class="tgt">Set your gross pay to count the pension rights you keep earning until you stop (your statements show what you have earned so far).</div>');
    host.innerHTML = lines.join('');
  }
  (state.payChanges || []).forEach((p, i) => {
    const inp = document.querySelector('.pay-row[data-i="' + i + '"] .pay-amt input'); if (!inp) return;
    const r = p.gross != null && p.amt == null ? resolvePay(p, gl, gl.residence, true) : null;
    inp.placeholder = r && r.amt != null ? '\u2248 ' + fmtMoney(Math.round(r.amt)) : 'take-home';
  });
}

// Pension read-out (v8.19): the net the plan uses, next to each gross amount typed.
const countryName = c => { const o = el('retCountry') && [...el('retCountry').options].find(x => x.value === c);
  return o ? o.textContent.replace(/\s+[\d.]+%$/, '').replace(/^\S+\s/, '').trim() : c; };
function renderPensionReadout(gl) {
  const host = el('pensionReadout'); if (!host) return;
  const rows = pensionReadoutRows({ de: numVal('pensionAmt', 0), deAge: gl.pensionAge, fr: numVal('pension2Amt', 0), frAge: gl.pension2Age }, state.pensionsMore)
    .map(r => '<div>' + countryName(r.country) + ' from ' + r.age + ': <b>' + eur(r.net) + ' net</b> of ' + eur(r.gross) + ' gross <span class="tgt">(' + r.why + ')</span></div>');
  host.innerHTML = rows.length ? rows.join('') + '<div class="tgt">The plan uses the net amounts: what lands in your account. Income tax is not deducted.</div>' : '';
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
