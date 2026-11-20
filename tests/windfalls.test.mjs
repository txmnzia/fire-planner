// Windfalls as plans (v8.4): each windfall is switched on per scenario.
// w.off lists the scenarios (1-5) it is switched off for; absent = on everywhere,
// which is how every windfall saved before v8.4 keeps behaving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../js/engine.js';
import { windfallSwitches, flipWindfall } from '../js/ui/plans.js';
import { baseGl, baseSc } from './golden-cases.mjs';

test('a windfall switched off for a scenario is exactly no windfall for it', () => {
  for (const wdMode of ['swr', 'fixed']) {
    const sc = baseSc({ id: 3, retAge: 50 });
    const off = project(sc, baseGl({ wdMode, windfalls: [{ yr: 2031, amt: 40000, off: [3] }] }));
    const none = project(sc, baseGl({ wdMode, windfalls: [] }));
    assert.deepEqual(off.values, none.values, wdMode);
    assert.equal(off.fireTarget, none.fireTarget, wdMode);
  }
});

test('switched off for another scenario: still arrives here, unchanged from before v8.4', () => {
  const sc = baseSc({ id: 2, retAge: 50 });
  const p = project(sc, baseGl({ windfalls: [{ yr: 2031, amt: 40000, off: [3] }] }));
  const legacy = project(sc, baseGl({ windfalls: [{ yr: 2031, amt: 40000 }] }));
  assert.deepEqual(p.values, legacy.values);
  const r = p.rows.find(x => x.windfall > 0);
  assert.equal(r.windfall, 40000);                     // hand: the amount lands in 2031, in full
});

test('windfallSwitches: only complete windfalls, on everywhere unless listed in off', () => {
  const ws = [{ yr: 2030, amt: 100000 }, { yr: null, amt: 5 }, { yr: 2032, amt: 0 }, { yr: 2035, amt: 20000, off: [1, 4] }];
  const r = windfallSwitches(ws);
  assert.deepEqual(r.map(x => x.index), [0, 3]);
  assert.deepEqual(r[0].on, [true, true, true, true, true]);
  assert.deepEqual(r[1].on, [false, true, true, false, true]);
});

test('flipWindfall: toggles one scenario, twice is a no-op, keeps the list sorted', () => {
  const ws = [{ yr: 2030, amt: 100000 }];
  flipWindfall(ws, 0, 3); assert.deepEqual(ws[0].off, [3]);
  flipWindfall(ws, 0, 1); assert.deepEqual(ws[0].off, [1, 3]);
  flipWindfall(ws, 0, 3); assert.deepEqual(ws[0].off, [1]);
  flipWindfall(ws, 0, 1); assert.deepEqual(ws[0].off, []);
});

test('saved state: off survives a load (sync keeps it, drops anything that is not a scenario id)', () => {
  const sync = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  assert.match(sync, /off:Array\.isArray\(w\.off\)\?w\.off\.map\(Number\)\.filter\(n=>n>=1&&n<=5\):\[\]/);
  assert.match(readFileSync(new URL('../js/inputs.js', import.meta.url), 'utf8'), /off: Array\.isArray\(w\.off\) \? w\.off\.slice\(\) : \[\]/);
});

test('markup: windfalls live on the Plans tab, with a slot for their rows in the grid', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const plans = html.slice(html.indexOf('id="tab-panel-plans"'), html.indexOf('<!-- /tab-panel-plans -->'));
  assert.ok(plans.includes('id="wfList"') && plans.includes('id="subj-windfalls"'));
  assert.match(html, /id="scgWindfallRows"/);
});

test('windfallSwitches: grid label is "Windfall", then amount · year (v8.6.2)', () => {
  const [r] = windfallSwitches([{ yr: 2030, amt: 100000 }]);
  assert.equal(r.title, 'Windfall');
  assert.equal(r.sub, '€100.0k · 2030');
});
