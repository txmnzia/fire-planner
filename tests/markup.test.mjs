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
  assert.ok(rows.length >= 12, 'rows found: ' + rows.length);
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
      'scr' + n + '_status', 'scr' + n + '_target', 'scr' + n + '_nw', 'scr' + n + '_lasts', 'scr' + n + '_household'])
      assert.equal(count(id), 1, id);
  }
  assert.equal(count('scgHouseholdRow'), 1);
});

test('scenario grid: the renderer writes exactly the result cells the markup has', () => {
  const cards = read('js/ui/cards.js');
  const fn = cards.slice(cards.indexOf('export function renderScenarioGrid'));
  const keys = [...fn.slice(0, fn.indexOf('\n}\n')).matchAll(/set\('(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(keys, ['household', 'lasts', 'nw', 'status', 'target']);
});

test('scenario grid: stop-age fields keep the 30-75 bounds the stepper clamps to', () => {
  for (let n = 1; n <= 5; n++) {
    const tag = html.match(new RegExp('<input[^>]*id="s' + n + '_ret"[^>]*>'))[0];
    assert.match(tag, /min="30"/); assert.match(tag, /max="75"/); assert.match(tag, /type="number"/);
    assert.match(tag, new RegExp('oninput="updateAge\\(' + n + '\\)"'));
    assert.match(tag, new RegExp('onchange="clampAge\\(' + n + '\\)"'));
  }
});

test('scenario grid: no retired card markup is left behind', () => {
  for (let n = 1; n <= 5; n++) {
    assert.equal(count('ms' + n), 0, 'old result container ms' + n);
    assert.equal(count('s' + n + '_retDisplay'), 0, 'old slider label');
  }
  assert.ok(!/renderMilestone/.test(read('js/recalc.js')));
});
