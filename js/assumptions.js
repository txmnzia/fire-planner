// Market assumptions (v8.9, pure): their defaults and which ones you changed.
export const ASSUMPTION_DEFAULTS = { stockRet: 7, bondRet: 3, inflation: 2, bondAllocNow: 0, bondAllocRet: 40 };
const ASSUMPTION_NAMES = { stockRet: 'stocks', bondRet: 'bonds', inflation: 'inflation', bondAllocNow: 'bonds today', bondAllocRet: 'bonds at retirement' };
// Pure: which assumptions differ from their default, as "stocks 6% (default 7%)".
export function assumptionChanges(values) {
  return Object.keys(ASSUMPTION_DEFAULTS)
    .filter(k => values[k] !== undefined && values[k] !== '' && +values[k] !== ASSUMPTION_DEFAULTS[k])
    .map(k => ASSUMPTION_NAMES[k] + ' ' + (+values[k]) + '% (default ' + ASSUMPTION_DEFAULTS[k] + '%)');
}
