// Plan vs actual against a FROZEN plan (v8.20, pure).
// Every saved version keeps, per scenario, the net-worth path its projection
// expected (start-of-year values, rounded to €100). One version is "the plan":
// the one you picked, else the latest year-end close, else the latest version.
// Comparing today's net worth with that frozen path means a later change of
// assumptions never moves the plan you are measured against.
//
// Time: the engine counts its first year from "today", so the path's point k is
// the expected net worth k years after the save (t0 + k, t0 = the save moment as a
// fractional year). The chart labels the same points with calendar years y0 + k.

export const PATH_ROUND = 100;

// Fractional year of a date: 2026-01-01 → 2026.0, 2026-07-02 → ≈ 2026.5.
export function fracYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear(), start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

// What a version keeps per scenario: { t0, y0, v: [rounded values] }.
export function pathOf(proj, savedAt) {
  if (!proj || !Array.isArray(proj.values) || !proj.values.length) return null;
  return { t0: +fracYear(savedAt).toFixed(4), y0: proj.years[0],
           v: proj.values.map(x => Math.round((x || 0) / PATH_ROUND) * PATH_ROUND) };
}

// The plan version: picked id (if it still exists and has paths), else the latest
// year-end close with paths, else the latest version with paths; null if none.
export function pickPlan(versions, planId) {
  const withPath = (versions || []).filter(v => Array.isArray(v.results) && v.results.some(r => r && r.path));
  if (!withPath.length) return null;
  const picked = planId && withPath.find(v => v.id === planId);
  if (picked) return picked;
  const ye = withPath.filter(v => v.kind === 'yearend');
  return ye.length ? ye[ye.length - 1] : withPath[withPath.length - 1];
}

// Net worth the plan expected at fractional year t (linear between yearly points);
// null outside the path.
export function expectedAt(path, t) {
  if (!path || !path.v.length) return null;
  const x = t - path.t0;
  if (x < 0 || x > path.v.length - 1) return null;
  const k = Math.floor(x), f = x - k;
  return k + 1 < path.v.length ? path.v[k] + f * (path.v[k + 1] - path.v[k]) : path.v[k];
}

// Today against the plan: the € gap (now − expected now) and the years ahead
// (+) or behind (−): when the plan expected to reach today's net worth, minus
// now, to the nearest year. open = the plan never reaches it within its horizon
// (ahead by at least that much). Below the plan's starting point, the first
// year's slope is extended backwards.
export function vsFrozenPlan(path, nowNW, tNow) {
  const exp = expectedAt(path, tNow);
  if (exp == null) return null;
  const v = path.v;
  let tStar = null, open = false;
  if (nowNW <= v[0]) {
    // below where the plan started: extend its first year's slope backwards
    const slope = v.length > 1 ? v[1] - v[0] : 0;
    tStar = slope > 0 ? path.t0 + (nowNW - v[0]) / slope : path.t0;
  } else {
    for (let k = 0; k + 1 < v.length; k++) {
      if (v[k + 1] >= nowNW && v[k] < nowNW) { tStar = path.t0 + k + (nowNW - v[k]) / (v[k + 1] - v[k]); break; }
    }
    if (tStar == null) { tStar = path.t0 + v.length - 1; open = true; }
  }
  const years = Math.round(tStar - tNow);
  return { gap: Math.round(nowNW - exp), expected: Math.round(exp), years: years === 0 ? 0 : years, open };
}
