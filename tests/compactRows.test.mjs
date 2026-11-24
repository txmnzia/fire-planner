// v8.18: compact Changes tab (one line per subject, steppers), no scenario
// chips in the Changes tab, named windfalls shown in the Scenarios grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windfallSwitches } from '../js/ui/plans.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html');
const chg = html.slice(html.indexOf('id="tab-panel-situation"'), html.indexOf('<aside class="chg-impact"'));

test('Changes tab: every tile body is rows of label + controls, no old field grid', () => {
  const bodies = [...chg.matchAll(/id="(tile-[a-z]+)-body" hidden>([\s\S]*?)\n      <\/div>\n    <\/section>/g)];
  assert.equal(bodies.length, 15);
  for (const [, id, b] of bodies) {
    assert.ok(!/class="subj-grid|class="field[ "]/.test(b), id + ' still has the old field grid');
    assert.ok(b.includes('class="frows"') || /id="(payList|rentMovesList|resList|wfList)"/.test(b), id);
  }
});

test('Changes tab: nudged numbers are − value + steppers, the range is not shown', () => {
  const steps = [...chg.matchAll(/<div class="step sl-ctrl">([\s\S]*?)<\/button><\/div>/g)].map(m => m[1]);
  assert.ok(steps.length >= 8, 'steppers: ' + steps.length);
  for (const s of steps) {
    assert.match(s, /data-d="-1"/); assert.match(s, /data-d="1"/);
    assert.match(s, /type="range" data-for="[^"]+" aria-hidden="true" tabindex="-1"/);
  }
  assert.match(read('css/styles.css'), /\.step input\[type=range\]\{display:none;\}/);
  for (const id of ['lifeExp', 'childCostUntilAge', 'childMaternityMonths', 'partnerLeaveMonths', 'swr']) assert.ok(chg.includes('data-for="' + id + '"'), id);
});

test('Changes tab: leave is one line per person, You and Partner are separate tiles', () => {
  const row = lbl => { const i = chg.indexOf('<div class="frow-l">' + lbl); return chg.slice(i, chg.indexOf('</div></div></div>', i)); };
  const you = row('Your parental leave'), her = row('Her parental leave');
  assert.ok(you.includes('childMaternityMonths') && you.includes('childMaternityIncome'));
  assert.ok(her.includes('partnerLeaveMonths') && her.includes('partnerLeaveIncome'));
  const tile = id => chg.slice(chg.indexOf('id="' + id + '-body"'), chg.indexOf('</section>', chg.indexOf('id="' + id + '-body"')));
  assert.ok(tile('tile-you').includes('id="dob"') && tile('tile-you').includes('id="lifeExp"'));
  for (const id of ['partnerInc', 'partnerRetAge', 'partnerBirthYear', 'partnerPension']) assert.ok(tile('tile-partner').includes('id="' + id + '"'), id);
  assert.ok(!tile('tile-partner').includes('id="dob"'));
});

test('Changes tab: no "Used in" scenario chips (switched in the Scenarios tab)', () => {
  assert.ok(!/sc-chip|Used in/.test(chg));
  for (const f of ['js/ui/situation.js', 'js/ui/housing.js', 'js/ui/tiles.js']) assert.ok(!/sc-chip|Used in|used by/.test(read(f)), f);
});

test('windfalls: a name of your choice labels the Scenarios grid row', () => {
  const r = windfallSwitches([{ name: 'Inheritance', yr: 2031, amt: 50000, off: [2] }, { yr: 2033, amt: 20000 }, { name: 'x', yr: 2030, amt: null }]);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'Inheritance'); assert.equal(r[0].sub, '€50.0k · 2031'); assert.match(r[0].label, /^Inheritance, /);
  assert.deepEqual(r[0].on, [true, false, true, true, true]);
  assert.equal(r[1].title, 'Windfall');
  assert.equal(windfallSwitches([{ name: '   ', yr: 2031, amt: 1000 }])[0].title, 'Windfall');
});

test('windfalls: the name is saved and loaded (sync keeps it, capped at 40 chars)', () => {
  const sync = read('js/sync.js');
  assert.match(sync, /name:typeof w\.name==='string'\?w\.name\.slice\(0,40\):''/);
  assert.match(sync, /windfalls: state\.windfalls/);
});

test('v8.18.2: fields flow side by side, a caption above each; a field keeps its own controls together', () => {
  const field = lbl => { const i = chg.indexOf('<div class="frow-l">' + lbl); assert.ok(i > 0, lbl); const st = chg.lastIndexOf('<div class="frow"', i); return chg.slice(st, chg.indexOf('<div class="frow"', i + 1)); };
  const together = { 'Withdrawal': ['wdMode', 'swr_wrap', '"swr"'], 'Cash &amp; savings': ['cash_disp', 'cashReturn'],
    'Country today': ['retCountry', 'taxNow'], 'Born': ['dob', 'lifeExp'], 'Her take-home': ['partnerInc', 'partnerRetAge'],
    'Loan rate': ['propMortgageRate', 'propMortgageTerm'], 'Your parental leave': ['childMaternityMonths', 'childMaternityIncome'] };
  for (const [lbl, ids] of Object.entries(together)) { const r = field(lbl); for (const id of ids) assert.ok(r.includes(id), lbl + ' has ' + id); }
  assert.match(field('Withdrawal'), /<span class="frow-grp" id="swr_wrap">/);   // hidden in fixed mode
  for (const [lbl, id] of [['Stocks return', 'stockRet'], ['Bonds return', 'bondRet'], ['Inflation', 'inflation'], ['Bonds now', 'bondAllocNow'],
    ['Bonds when you stop', 'bondAllocRet'], ['You pay into joint', 'samPaysIn'], ['She pays into joint', 'partnerPaysIn']]) assert.ok(field(lbl).includes(id), lbl);
  const css = read('css/styles.css');
  assert.match(css, /\.tile-body \.frows\{display:flex;flex-wrap:wrap;/);
  assert.match(css, /\.frow\{display:flex;flex-direction:column;/);
  // money fields are wide enough for 1,250,000 next to "/mo" (checked in the browser too)
  assert.match(css, /\.tile-body \.inp\.cur\.fc\{flex:1 1 150px;min-width:150px;/);
  // v8.18.3: each line fills the tile (fields and their boxes grow); a field's own controls stay on one line
  assert.match(css, /\.tile-body \.frow\{flex:1 1 0;align-items:stretch;\}/);
  assert.match(css, /@container \(min-width:400px\)\{ \.tile-body \.frow-c,\.tile-body \.frow-grp\{flex-wrap:nowrap;\} \}/);
  assert.match(css, /\.tile-body \.inp\.cur\.fc input\{[^}]*padding:0;/);
});
