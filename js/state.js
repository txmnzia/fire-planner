// Shared mutable application state. Kept on a single exported object (mutated
// via property assignment) because ES module bindings are read-only for
// importers — `import { x }` cannot be reassigned from another module.
export const state = {
  ibkrTotal: 0,
  ibkrHoldings: [],
  nwHistory: [],   // [{year,val,income,spend}] manual net-worth snapshots for plan-vs-actual
  windfalls: [],   // [{yr,amt}] one-off future windfalls (dynamic list; migrated from wf0/1/2 fields)
  activeScIdx: 0,
  lastProjs: null, lastGl: null, lastScenarios: null,
};

// per-scenario feature toggles: features[s][feat] = true/false
// s = 1..5, feat = 'partner'|'prop'|'child'
export const features = {};
for (let s = 1; s <= 5; s++) features[s] = { partner: false, prop: false, child: false };
// defaults: D has partner on, E has all on
features[4].partner = true;
features[5].partner = true;
features[5].prop    = true;
features[5].child   = true;
