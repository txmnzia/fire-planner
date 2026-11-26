// The plan line and "vs plan" for a scenario (v8.20). One place for the chart,
// its legend and the cards: the frozen path of the plan version when there is
// one, else the old re-calculation from the first snapshot with today's settings.
import { state } from "../state.js?v=8.28";
import { buildPlanProj, planYearsAhead } from "../engine.js?v=8.28";
import { pickPlan, vsFrozenPlan, fracYear } from "../planVsActual.js?v=8.28";

const fmtDay = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const activePlan = () => pickPlan(state.versions, state.planId);

// { years, values, frozen, label } or null. idx = scenario index 0..4.
export function planLineFor(idx, sc, gl) {
  const v = activePlan(), r = v && v.results && v.results[idx];
  if (r && r.path) return { years: r.path.v.map((_, k) => r.path.y0 + k), values: r.path.v.slice(), frozen: true,
    label: "Plan of " + fmtDay(v.ts) + (v.note ? " (" + v.note + ")" : ""), path: r.path, id: v.id };
  const p = sc ? buildPlanProj(sc, gl, state.nwHistory) : null;
  return p ? { years: p.years.slice(), values: p.values.slice(), frozen: false, label: "Plan (re-calculated with today’s settings)", proj: p } : null;
}

// { years, open, gap (frozen only), frozen, label } or null.
export function vsPlanFor(idx, sc, gl, now) {
  const line = planLineFor(idx, sc, gl); if (!line) return null;
  const nowNW = (gl.invested || 0) + (gl.cash || 0);
  if (line.frozen) {
    const r = vsFrozenPlan(line.path, nowNW, fracYear(now || new Date()));
    return r ? { years: r.years, open: r.open, gap: r.gap, frozen: true, label: line.label } : null;
  }
  const pos = planYearsAhead(line.proj, gl);
  return pos ? { years: pos.years, open: pos.open, gap: null, frozen: false, label: line.label } : null;
}
