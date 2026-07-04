// ── helpers ────────────────────────────────────────────────────────────────
export const el = id => document.getElementById(id);

export function numVal(id, fallback) {
  const v = parseFloat(el(id).value);
  return isNaN(v) ? (fallback !== undefined ? fallback : 0) : v;
}

export function optVal(id) {
  const e = el(id); if (!e) return null;
  const v = e.value.trim();
  if (!v || v === "none") return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}


export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "\u2014";
  return n.toLocaleString("fr-FR", { minimumFractionDigits:0, maximumFractionDigits:0 });
}
export function eur(n) { return "\u20ac" + fmt(n); }
export function fmtK(n) {
  if (n === null || n === undefined || isNaN(n)) return "\u2014";
  const abs = Math.abs(n);
  return "\u20ac" + (abs >= 1e6 ? (abs/1e6).toFixed(2)+"M" : abs >= 1e3 ? (abs/1e3).toFixed(1)+"k" : String(Math.round(abs)));
}
