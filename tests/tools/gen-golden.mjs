// Regenerates tests/fixtures/v8-golden.json from the current engine.
//   node tests/tools/gen-golden.mjs
// Only run this in a commit that deliberately changes a calculation, and say in
// that commit what moved and why (see the v8 delivery plan, "Golden master rule").
import { writeFileSync } from 'node:fs';
import { project } from '../../js/engine.js';
import { goldenCases } from '../golden-cases.mjs';

const out = {};
for (const c of goldenCases()) {
  const p = project(c.sc, c.gl);
  out[c.name] = { values: p.values, finalNetWorth: p.finalNetWorth, fireTarget: p.fireTarget,
    fireTargetAdj: p.fireTargetAdj ?? null, infeasibleYear: p.infeasibleYear ?? null,
    retYear: p.retYear, gainFracAtRet: p.gainFracAtRet ?? null };
}
writeFileSync(new URL('../fixtures/v8-golden.json', import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length + ' cases written');
