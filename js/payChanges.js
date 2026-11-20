// Pay changes as plans (v8.6). Pure: no DOM, no state. A pay change is
// { name, from, to, amt, on }: take-home `amt` (€/month, today's money; 0 = no
// pay) from year `from` until year `to` inclusive (null = for good), in the
// scenarios listed in `on` (1-5). Before v8.6 each scenario had its own take-home
// override (s{n}_inc) and one permanent change (s{n}_chgYear / s{n}_chgInc);
// migrateFromFields turns those into plans once, on the first load without
// `payChanges`.

const num = v => (v === null || v === undefined || String(v).trim() === '') ? null : (isNaN(+v) ? null : +v);

export function normalisePayChanges(list) {
  return (Array.isArray(list) ? list : []).map(p => ({
    name: typeof p.name === 'string' ? p.name : '',
    from: num(p.from) === null ? null : Math.round(num(p.from)),
    to: num(p.to) === null ? null : Math.round(num(p.to)),
    amt: num(p.amt),
    on: Array.isArray(p.on) ? [...new Set(p.on.map(Number).filter(n => n >= 1 && n <= 5))].sort() : [],
  }));
}

// A plan counts once it has a start year and an amount (0 allowed: a break).
export const isComplete = p => p && Number.isFinite(p.from) && p.amt !== null && p.amt >= 0
  && (p.to === null || p.to >= p.from);

// The changes one scenario uses, as the engine reads them ({from, to, amt}).
export function payChangesFor(list, s) {
  return normalisePayChanges(list).filter(p => isComplete(p) && p.on.includes(s))
    .map(p => ({ from: p.from, to: p.to, amt: p.amt }));
}

// Old per-scenario fields → plans. Identical changes used by several scenarios
// become one plan switched on in each of them.
export function migrateFromFields(fields, baseYear) {
  const f = fields || {}, out = [];
  const add = (key, plan, s) => {
    const hit = out.find(p => p._key === key);
    if (hit) hit.on.push(s); else out.push({ ...plan, _key: key, on: [s] });
  };
  for (let s = 1; s <= 5; s++) {
    const inc = num(f['s' + s + '_inc']), y = num(f['s' + s + '_chgYear']), c = num(f['s' + s + '_chgInc']);
    const by = Math.round(num(baseYear) || 2026);
    if (inc !== null) add('inc:' + inc, { name: 'Take-home override', from: by, to: null, amt: inc }, s);
    if (y !== null && c !== null) add('chg:' + y + ':' + c, { name: '', from: Math.round(y), to: null, amt: c }, s);
  }
  return normalisePayChanges(out.map(({ _key, ...p }) => p));
}
