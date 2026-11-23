// v8.8 migration (pure): payloads saved before the one-model spending (no
// samPaysIn key) are mapped onto the four account numbers, keeping today's
// numbers: the joint total and her share today are preserved exactly.
//   joint = sharedNow; she pays in = what was entered, else joint × the pro-rata
//   share today (old floor/cap applied); you pay in = joint − she pays in.
//   Retirement amounts become one % change on the total.
//   Simple-model payloads: your monthly spending becomes your own spending; the
//   joint fields stay empty and the missing-input banner asks for them.
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;

export function migrateSpending(fields) {
  if (!fields || 'samPaysIn' in fields) return null;
  const out = {};
  const two = fields.partnerModel === 'two';
  let own = num(fields.samPersonalNow);
  if (!two && own == null) own = num(fields.spendNow);
  if (own != null) out.samPersonalNow = own;
  const joint = two ? num(fields.sharedNow) : null;
  if (joint != null && joint > 0) {
    let her = num(fields.partnerPaysIn);
    if (her == null) {
      const pInc = num(fields.partnerInc) || 0, inc = num(fields.baseIncome) || 0;
      const lo = (num(fields.shareMin) ?? 0) / 100, hi = (num(fields.shareMax) ?? 50) / 100;
      const share = pInc + inc > 0 ? Math.max(lo, Math.min(hi, pInc / (pInc + inc))) : 0;
      her = Math.round(joint * share);
    }
    out.partnerPaysIn = her;
    out.samPaysIn = Math.max(0, joint - her);
    const ownRet = num(fields.samPersonalRet), jRet = num(fields.sharedRet);
    if ((ownRet != null || jRet != null) && (own || 0) + joint > 0) {
      const now = (own || 0) + joint, ret = (ownRet ?? (own || 0)) + (jRet ?? joint);
      out.retSpendChange = Math.round((ret / now - 1) * 100);
    }
  }
  return out;
}
