// Shared mutable application state. Kept on a single exported object (mutated
// via property assignment) because ES module bindings are read-only for
// importers — `import { x }` cannot be reassigned from another module.
export const state = {
  ibkrTotal: 0,
  ibkrHoldings: [],
  ibkrAsOf: null, ibkrSource: null, ibkrImports: [], ibkrWarnings: [],   // portfolio check-in (v8.10)
  nwHistory: [],   // [{year,val,income,spend}] manual net-worth snapshots for plan-vs-actual
  windfalls: [],
  payChanges: [],
  rentMoves: [],   // [{from, rent}] planned rent changes (v8.11)
  residence: [],   // [{from, country, tax, col}] planned moves abroad (v8.11)  // [{name,from,to,amt,on}] pay changes as plans (v8.6, js/payChanges.js)   // [{yr,amt,off}] one-off future windfalls; off = scenario ids it is switched off for (v8.4)
  versions: [],    // dated copies of the settings + results (v8.14, js/versionsCore.js)
  review: null,    // first-run review list {active, done, dismissed} (v8.14)
  pendingFirstVersion: false, lastStops: null,
  activeScIdx: 0,
  lastProjs: null, lastGl: null, lastScenarios: null,
};

// per-scenario feature toggles: features[s][feat] = true/false
// s = 1..5, feat = 'partner'|'prop'|'child'
export const features = {};
for (let s = 1; s <= 5; s++) features[s] = { partner: false, prop: false, child: false };
// defaults: D and E with the partner. Plans (buying, child) start off everywhere
// (v8.18.4): a plan is switched on only where you choose, in the Scenarios grid.
features[4].partner = true;
features[5].partner = true;
