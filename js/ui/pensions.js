// Pensions from other countries (v8.19): "+ Add a country" under Germany and
// France. Each row: country, amount as printed (gross), start age, and the share
// taken off at payout (health and social charges; income tax is not deducted).
// Germany and France have presets; any other country starts at 0% until typed.
import { el, eur } from "../util.js?v=8.22";
import { state } from "../state.js?v=8.22";
import { recalc } from "../recalc.js?v=8.22";
import { fmtMoney, cleanMoney } from "./situation.js?v=8.22";
import { PENSION_COUNTRIES, pensionNet } from "../pensions.js?v=8.22";

const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
// Countries offered: the country list of "Where you live", without Germany and France
// (they have their own rows).
function countryOptions(value) {
  const src = el('retCountry'); if (!src) return '';
  return [...src.options].filter(o => o.value !== 'DE' && o.value !== 'FR')
    .map(o => '<option value="' + o.value + '"' + (o.value === value ? ' selected' : '') + '>' + o.textContent.replace(/\s+[\d.]+%$/, '').trim() + '</option>').join('');
}
function firstCountry() {
  const src = el('retCountry'); const o = src && [...src.options].find(x => x.value !== 'DE' && x.value !== 'FR');
  return o ? o.value : 'PT';
}

export function renderPensionsMore() {
  const host = el('pensionMoreList'); if (!host) return;
  host.innerHTML = '';
  // same layout as the Germany and France rows: the country is the field's caption
  state.pensionsMore.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'frow pension-row';
    const preset = PENSION_COUNTRIES[p.country];
    row.innerHTML =
      '<div class="frow-l"><select class="pm-country" aria-label="Country">' + countryOptions(p.country) + '</select></div>' +
      '<div class="frow-c"><div class="inp cur fc"><span class="pre">€</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="As printed" aria-label="Pension per month, gross as printed"><span class="suf">/mo</span></div>' +
      '<span class="frow-sep">from</span><div class="step"><button type="button" class="age-btn" data-d="-1" aria-label="Decrease">\u2212</button>' +
        '<span class="step-v"><input type="number" class="pm-age" min="50" max="80" step="1" aria-label="Start age"><i>yrs</i></span><button type="button" class="age-btn" data-d="1" aria-label="Increase">+</button></div>' +
      '<span class="frow-sep">taken off</span><span class="unit-wrap fc fc-num"><input type="number" class="pm-ded" min="0" max="60" step="0.1" aria-label="Taken off at payout, %"><span class="u">%</span></span>' +
      '<button type="button" class="dp-del" aria-label="Remove this pension">×</button></div>';
    const sel = row.querySelector('select'), amt = row.querySelector('.cur input'), age = row.querySelector('.pm-age'), ded = row.querySelector('.pm-ded');
    amt.value = p.amt == null ? '' : fmtMoney(p.amt);
    age.value = p.age; ded.value = p.ded == null ? '' : p.ded; ded.placeholder = preset ? String(+(preset.deduction * 100).toFixed(1)) : '0';
    sel.addEventListener('change', () => { p.country = sel.value; renderPensionsMore(); recalc(); });
    amt.addEventListener('input', () => { const raw = cleanMoney(amt.value); amt.value = raw === '' ? '' : fmtMoney(raw); const v = parseFloat(raw); p.amt = isNaN(v) ? null : v; stamp(); recalc(); });
    age.addEventListener('input', () => { const v = parseInt(age.value); if (!isNaN(v)) { p.age = v; recalc(); } });
    row.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      p.age = Math.min(80, Math.max(50, (+p.age || 67) + (+b.dataset.d))); age.value = p.age; recalc();
    }));
    ded.addEventListener('input', () => { p.ded = ded.value === '' ? null : +ded.value; recalc(); });
    row.querySelector('.dp-del').addEventListener('click', () => { state.pensionsMore.splice(i, 1); renderPensionsMore(); recalc(); });
    host.appendChild(row);
  });
  const addHost = el('pensionMoreAdd'); if (!addHost) return;
  addHost.innerHTML = '';
  const add = document.createElement('button'); add.type = 'button'; add.className = 'dp-add';
  add.innerHTML = PLUS + 'Add a country';
  add.addEventListener('click', () => { state.pensionsMore.push({ country: firstCountry(), amt: null, age: 67, ded: null }); renderPensionsMore(); recalc(); });
  addHost.appendChild(add);
}
// typing a statement amount is a pension check-in, like the Germany and France rows
function stamp() { const h = el('pensionUpdated'); if (h) h.value = new Date().toISOString().slice(0, 10); }

// One line per pension: the net the plan uses, beside the gross as typed.
export function pensionReadoutRows(gross, more) {
  const rows = [['DE', gross.de, gross.deAge, null], ['FR', gross.fr, gross.frAge, null],
    ...(more || []).map(p => [p.country, p.amt, p.age, p.ded])].filter(([, a]) => a > 0);
  return rows.map(([c, a, age, d]) => ({ country: c, gross: a, age, net: Math.round(pensionNet(c, a, d)),
    why: PENSION_COUNTRIES[c] && d == null ? PENSION_COUNTRIES[c].why : (d > 0 ? d + '% you typed' : 'nothing taken off (type the % if you know it)') }));
}
