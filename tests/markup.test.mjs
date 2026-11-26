// Layers 7 and 8 of the v8 test plan, for the parts a browser would otherwise be
// needed for: the markup and its wiring. Plain text checks over index.html and the
// modules (no DOM, no dependencies). They catch the bugs that pass every engine
// test: a saved field with no input (AUDIT.md T2), a click handler that isn't on
// window (ReferenceError only at click time), duplicate ids, a grid row with a
// missing column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = rel => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const html = read('index.html');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const count = id => ids.filter(x => x === id).length;

test('markup: every id is unique', () => {
  const dup = [...new Set(ids.filter(id => count(id) > 1))];
  assert.deepEqual(dup, []);
});

test('markup: every saved field (SYNC_FIELDS) has exactly one input', () => {
  const src = read('js/sync.js');
  const block = src.slice(src.indexOf('const SYNC_FIELDS = ['), src.indexOf('];', src.indexOf('const SYNC_FIELDS = [')));
  const fields = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(fields.length > 50, 'parsed SYNC_FIELDS');
  const missing = fields.filter(f => count(f) !== 1);
  assert.deepEqual(missing, []);
});

test('markup: every inline handler (HTML and renderers) is bound on window in main.js', () => {
  const main = read('js/main.js');
  const bound = new Set(main.slice(main.indexOf('Object.assign(window, {'), main.indexOf('});', main.indexOf('Object.assign(window, {')))
    .match(/[A-Za-z_$][\w$]*/g));
  const sources = [html, ...readdirSync(new URL('../js/ui/', import.meta.url)).map(f => read('js/ui/' + f))];
  const called = new Set();
  for (const src of sources)
    for (const m of src.matchAll(/\son[a-z]+=\\?["']\s*([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);
  const builtins = new Set(['event', 'this', 'if', 'return']);
  const unbound = [...called].filter(f => !bound.has(f) && !builtins.has(f));
  assert.deepEqual(unbound, []);
});

test('scenario grid: every row has one label and five cells, in scenario order', () => {
  const panel = html.slice(html.indexOf('id="tab-panel-scenarios"'), html.indexOf('/tab-panel-scenarios'));
  const rows = panel.split('<div class="scg-row').slice(1);
  assert.ok(rows.length >= 7, 'rows found: ' + rows.length);
  for (const r of rows) {
    const body = r.slice(0, r.indexOf('    </div>\n'));
    assert.equal((body.match(/class="scg-lbl"/g) || []).length, 1, 'one label');
    const cols = [...body.matchAll(/class="scg-cell c(\d)"/g)].map(m => +m[1]);
    assert.deepEqual(cols, [1, 2, 3, 4, 5], 'five cells in order');
  }
});

test('scenario grid: every per-scenario control and result cell exists once', () => {
  for (let n = 1; n <= 5; n++) {
    for (const id of ['sc' + n + 'name', 's' + n + '_ret', 's' + n + '_inc', 's' + n + '_chgYear', 's' + n + '_chgInc',
      'tog' + n + '_partner', 'tog' + n + '_prop', 'tog' + n + '_child',
      'scr' + n + '_age', 'scr' + n + '_margin', 'scr' + n + '_lasts'])
      assert.equal(count(id), 1, id);
  }
  assert.equal(count('scgHouseholdRow'), 0);
});

test('scenario grid: the renderer writes exactly the result cells the markup has', () => {
  const cards = read('js/ui/cards.js');
  const fn = cards.slice(cards.indexOf('export function renderScenarioGrid'));
  const keys = [...fn.slice(0, fn.indexOf('\n}\n')).matchAll(/set\('(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(keys, ['age', 'equity', 'lasts', 'margin']);
});

test('scenario grid: stop ages are automatic (no input, saved value kept hidden for old builds)', () => {
  for (let n = 1; n <= 5; n++) {
    const tag = html.match(new RegExp('<input[^>]*id="s' + n + '_ret"[^>]*>'))[0];
    assert.match(tag, /type="hidden"/);
  }
  assert.ok(!/stepAge\(|clampAge\(/.test(html), 'no stop-age stepper left');
  const main = read('js/main.js');
  assert.ok(!/stepAge|clampAge/.test(main));
});

test('every tab uses the automatic stop ages (recalc and Monte Carlo)', () => {
  assert.match(read('js/recalc.js'), /const stops=withStopAges\(\[1,2,3,4,5\]\.map\(s=>getScenario\(s,gl\)\),gl\);/);
  assert.match(read('js/ui/mcTab.js'), /withStopAges\(\[1,2,3,4,5\]\.map\(s=>getScenario\(s,gl\)\),gl\)\.map\(x=>x\.sc\)/);
});

test('scenario grid: no retired card markup is left behind', () => {
  for (let n = 1; n <= 5; n++) {
    assert.equal(count('ms' + n), 0, 'old result container ms' + n);
    assert.equal(count('s' + n + '_retDisplay'), 0, 'old slider label');
  }
  assert.ok(!/renderMilestone/.test(read('js/recalc.js')));
});

test('markup: the Pay changes card is painted on start-up and after a load (v8.6.1)', () => {
  const src = read('js/ui/situation.js');
  const body = name => src.slice(src.indexOf('export function ' + name), src.indexOf('\n}\n', src.indexOf('export function ' + name)));
  assert.match(body('initSituation'), /renderPayList\(\)/);
  assert.match(body('refreshSituationControls'), /renderPayList\(\)/);
  const pay = body('renderPayList');
  // v8.18: compact item row: name on top, then from / until / take-home on one line
  assert.match(pay, /class="item-name pay-name"/);
  for (const w of ['from', 'until']) assert.ok(pay.includes("SEP('" + w + "')"), w);
  assert.equal((pay.match(/buildYpick\(/g) || []).length, 2, 'From and Until are year pickers');
  assert.match(pay, /MONEY\('pay-amt'/);
});

test('markup: no tab panel is locked against scrolling (v8.6.3)', () => {
  const css = read('css/styles.css');
  const locked = [...css.matchAll(/#tab-panel-[\w-]+\{[^}]*overflow(-y)?:hidden/g)].map(m => m[0]);
  assert.deepEqual(locked, [], 'a growing panel must scroll: ' + locked.join(' | '));
});

test('v8.28.1 transparency: no empty field says "preset"/"estimate"/"same"/"all"; each fallback is shown as a value', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /placeholder="(preset|estimate|optional|same|all)"/);
  const def = readFileSync(new URL('../js/ui/defaults.js', import.meta.url), 'utf8');
  for (const id of ['taxNow', 'healthAfterStop_disp', 'childBenefit_disp', 'propTxCostPct', 'propFixedYears', 'propRateAfter', 'propCharges_disp', 'grossNow_disp'])
    assert.match(def, new RegExp("ph\\('" + id + "'"), id);
  assert.match(readFileSync(new URL('../js/recalc.js', import.meta.url), 'utf8'), /renderDefaults\(gl\)/);
});

test('v8.28.2: the country lists show the country only (the rate is the tax-on-gains field)', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sel = html.slice(html.indexOf('<select id="retCountry"'), html.indexOf('</select>', html.indexOf('<select id="retCountry"')));
  assert.ok((sel.match(/<option /g) || []).length >= 20);
  assert.doesNotMatch(sel, /%<\/option>/);
});
