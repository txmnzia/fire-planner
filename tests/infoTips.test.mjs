// Info bubbles (v8.0.1): placement maths and the markup contract. The bubble text
// comes from each button's title; a button without one would open an empty bubble.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeTip } from '../js/ui/infoTips.js';

const view = { w: 390, h: 844 };          // iPhone 13 viewport
const btn = (x, y) => ({ left: x, right: x + 20, top: y, bottom: y + 20 });

test('placeTip: below the button, centred on it, when there is room', () => {
  const p = placeTip(btn(185, 100), { w: 200, h: 80 }, view);
  assert.equal(p.top, 126);                  // bottom 120 + gap 6
  assert.equal(p.left, 95);                  // centre 195 - 100
  assert.equal(p.width, 200);
});

test('placeTip: flips above when it would overflow the bottom', () => {
  const p = placeTip(btn(185, 800), { w: 200, h: 80 }, view);
  assert.equal(p.top, 714);                  // top 800 - gap 6 - height 80
});

test('placeTip: stays below if there is no room above either', () => {
  const p = placeTip(btn(185, 40), { w: 200, h: 900 }, view);
  assert.equal(p.top, 66);
});

test('placeTip: clamped 8px inside both side edges', () => {
  assert.equal(placeTip(btn(0, 100), { w: 300, h: 80 }, view).left, 8);
  assert.equal(placeTip(btn(370, 100), { w: 300, h: 80 }, view).left, 390 - 8 - 300);
});

test('placeTip: never wider than the viewport minus margins', () => {
  const p = placeTip(btn(100, 100), { w: 500, h: 80 }, { w: 320, h: 600 });
  assert.equal(p.width, 304); assert.equal(p.left, 8);
});

test('every (i) button has text to show', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const btns = html.match(/<button[^>]*class="info-btn"[^>]*>/g) || [];
  assert.ok(btns.length > 20, 'found ' + btns.length);
  const empty = btns.filter(b => !/\stitle="[^"]{8,}"/.test(b));
  assert.deepEqual(empty, []);
});

test('the bubbles are initialised on load', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ initInfoTips \} from "\.\/ui\/infoTips\.js(\?v=[^"]+)?";/);
  assert.match(main, /DOMContentLoaded[\s\S]{0,200}initInfoTips\(\);/);
});
