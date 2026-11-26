// Versions, update log, prompts and the first-run review (v8.14) — the pure
// parts. A version is a dated copy of the saved state plus the five scenarios'
// results at that moment; the UI (js/ui/versions.js) stores them in the saved
// row (payload.versions, additive) and renders the impact panel and the log.

import { pathOf } from "./planVsActual.js?v=8.25";
export const MAX_VERSIONS = 30;

// The state a version keeps: everything the payload has except the versions
// themselves, the review list and the IBKR position list (large, not settings).
export function snapshotOf(payload) {
  const { versions, review, ts, planId, ...rest } = payload || {};   // v8.20: the plan pick is not a setting
  const ibkr = rest.ibkr ? { ...rest.ibkr, holdings: [] } : rest.ibkr;
  return JSON.parse(JSON.stringify({ ...rest, ibkr }));
}

// One line per scenario: the figures the impact panel compares.
// stops/projs/scenarios as recalc() has them; names from the grid.
// savedAt (v8.20): when given, each line also keeps the frozen net-worth path.
export function resultsOf(scenarios, projs, stops, names, savedAt) {
  return scenarios.map((sc, i) => ({
    name: names[i] || String.fromCharCode(65 + i),
    age: stops && stops[i] && stops[i].found && !stops[i].missing ? sc.retAge : null,
    fire: Math.round(projs[i].fireTarget || 0),
    nwEnd: Math.round(projs[i].finalNetWorth || 0),
    ...(savedAt != null ? { path: pathOf(projs[i], savedAt) } : {}),
  }));
}

// Field-level differences between two snapshots: [{id, from, to}] (strings).
export function diffFields(a, b) {
  const fa = (a && a.fields) || {}, fb = (b && b.fields) || {};
  const ids = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
  return ids.filter(id => String(fa[id] ?? '') !== String(fb[id] ?? ''))
    .map(id => ({ id, from: String(fa[id] ?? ''), to: String(fb[id] ?? '') }));
}
// Lists and switches that changed (plans, moves, scenario switches, mode).
const LISTS = { windfalls: 'Windfalls', payChanges: 'Pay changes', rentMoves: 'Planned rents', pensionsMore: 'Other pensions', home: 'Your home',
  residence: 'Planned moves abroad', features: 'Scenario switches', nwHistory: 'Net-worth history', wdMode: 'Withdrawal strategy' };
export function diffLists(a, b) {
  return Object.keys(LISTS).filter(k => JSON.stringify((a || {})[k] ?? null) !== JSON.stringify((b || {})[k] ?? null)).map(k => LISTS[k]);
}
export function changeCount(a, b) { return diffFields(a, b).length + diffLists(a, b).length; }

// "Solo: stop 43 → 42" — what moved between two result sets (stop age first,
// then the FIRE number by more than 0.5%).
export function impactLines(prev, cur) {
  if (!Array.isArray(prev) || !Array.isArray(cur)) return [];
  return cur.map((c, i) => {
    const p = prev[i]; if (!p) return null;
    const bits = [];
    if (p.age !== c.age) bits.push('stop ' + (p.age ?? '—') + ' → ' + (c.age ?? '—'));
    if (p.fire > 0 && Math.abs(c.fire / p.fire - 1) > 0.005) bits.push('FIRE ' + k(p.fire) + ' → ' + k(c.fire));
    return bits.length ? c.name + ': ' + bits.join(', ') : null;
  }).filter(Boolean);
}
const k = v => '€' + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'k');
export const fmtFire = v => (v > 0 ? k(v) : '—');

// The impact panel (v8.18.5): one light row per scenario: stop age before → after
// (just the age when unchanged) and the FIRE target now, with a trend when it moved
// by more than 0.5% since the saved version ('up' = a bigger target).
export function impactRows(prev, cur) {
  return (Array.isArray(cur) ? cur : []).map((c, i) => {
    const p = (Array.isArray(prev) && prev[i]) || c;
    const moved = p.fire > 0 && c.fire > 0 && Math.abs(c.fire / p.fire - 1) > 0.005;
    return { name: c.name, ageFrom: p.age ?? null, ageTo: c.age ?? null, ageChanged: (p.age ?? null) !== (c.age ?? null),
             fire: fmtFire(c.fire), trend: moved ? (c.fire > p.fire ? 'up' : 'down') : null };
  });
}

// Adds a version (newest last), keeping at most MAX_VERSIONS; never edits older ones.
export function addVersion(list, v) {
  return [...(Array.isArray(list) ? list : []), v].slice(-MAX_VERSIONS);
}

// ── "Did this happen?" (dated plans that have arrived) ──────────────────────
// data: { year, rentMoves, residence, propBuyYear, propOn, childBirthYear, childOn,
//         payChanges, baseIncome }. Returns [{ key, text, kind, index }].
export function duePrompts(d) {
  const out = [], y = d.year;
  (d.rentMoves || []).forEach((m, i) => { if (m.from != null && m.from <= y && m.rent != null)
    out.push({ key: 'rent:' + i, kind: 'rent', index: i, text: 'Did you move? New rent €' + m.rent + ' from ' + m.from + '.' }); });
  (d.residence || []).forEach((p, i) => { if (p.from != null && p.from <= y)
    out.push({ key: 'res:' + i, kind: 'residence', index: i, text: 'Did you move to ' + p.country + ' (planned for ' + p.from + ')?' }); });
  if (d.propOn && d.propBuyYear <= y) out.push({ key: 'buy', kind: 'buy', text: 'Did you buy your home (planned for ' + d.propBuyYear + ')?' });
  if (d.childOn && d.childBirthYear <= y) out.push({ key: 'child', kind: 'child', text: 'Was your child born (planned for ' + d.childBirthYear + ')?' });
  (d.payChanges || []).forEach((c, i) => { if (c.to == null && c.from <= y && c.amt != null && c.amt !== d.baseIncome && (c.on || []).length)
    out.push({ key: 'pay:' + i, kind: 'pay', index: i, text: 'Is €' + c.amt + ' your take-home now (' + (c.name || 'pay change') + ', from ' + c.from + ')?' }); });
  return out;
}

// After a move abroad happens, the new country is the reference: later moves'
// cost of living (in % of today) are re-based on it.
export function rebaseResidence(moves, doneIndex) {
  const done = moves[doneIndex], base = done && done.col != null ? done.col : 100;
  return moves.filter((_, i) => i !== doneIndex)
    .map(m => ({ ...m, col: m.col == null && base === 100 ? null : Math.round(((m.col ?? 100) / base) * 1000) / 10 }));
}

// ── First run after the redesign: what needs you once (story 12) ─────────────
// data: { partnerPaysIn, samPaysIn, propRentSaved, pension2Amt, anyProp, propCharges }
export function reviewItems(d) {
  const items = [
    { key: 'spend', field: 'samPaysIn_disp', text: 'Check the four spending numbers: they were moved from the old model (what she pays in was estimated from your incomes).' },
    { key: 'country', field: 'retCountry', text: 'Where do you live today, and when do you plan to move? Tax on gains now follows the country you live in each year.' },
    { key: 'pension', field: 'pension2Amt_disp', text: 'Pensions are now one per country: add your French pension if you have rights there.' },
  ];
  if (d.propRentSaved > 0) items.push({ key: 'rent', field: 'propRentSaved_disp', text: 'Confirm your rent today (it is part of the joint account).' });
  if (d.anyProp && !(d.propCharges > 0)) items.push({ key: 'charges', field: 'propCharges_disp', text: 'A scenario buys: add the monthly ownership charges + upkeep.' });
  return items;
}
