// Health insurance once you stop working (v8.26, pure). Today it comes out of your
// salary; from your stop age until your first state pension it is a cost of its own
// (after that, the pensioner insurance is inside the pension deduction, pensions.js).
// Presets per country of residence, in today's €/month; the owner can type his own.
// Sources and dates in README ("Health insurance once you stop").

// Germany, voluntary public insurance without salary (2026): contributions on all
// income incl. realised capital gains, at least on a notional 1,318.33 €/month, at
// most on 5,812.50 €/month. Rate: the reduced 14.0% (no sick-pay entitlement once
// you stop working, §243 SGB V) + average add-on 2.9% + long-term care 4.2% (no
// children; 3.6% with) = 21.1%.
export const DE_HEALTH = { rate: 0.211, minBase: 1318.33, maxBase: 5812.50 };
// France, PUMa: the cotisation subsidiaire maladie is 6.5% of capital income above
// 50% of the PASS (48,060 € in 2026) when earned income is low, plus a private
// complementary ("mutuelle") of about 90 €/month in your forties.
export const FR_HEALTH = { rate: 0.065, threshold: 0.5 * 48060, mutuelle: 90 };
export const OTHER_HEALTH = 250;

// gainMonthly: the realised gains you live on per month (today's €), estimated by
// getGlobals as half of your monthly cost today (half of what you sell is gain).
export function healthPresetMonthly(country, gainMonthly) {
  const g = Math.max(0, gainMonthly || 0);
  if (country === 'DE') return DE_HEALTH.rate * Math.min(DE_HEALTH.maxBase, Math.max(DE_HEALTH.minBase, g));
  if (country === 'FR') return FR_HEALTH.mutuelle + FR_HEALTH.rate * Math.max(0, g * 12 - FR_HEALTH.threshold) / 12;
  return OTHER_HEALTH;
}
