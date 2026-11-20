// One version, everywhere (v8.1.1). GitHub Pages lets browsers reuse JS files for
// ~10 minutes, so a fresh index.html could run with a previous release's modules:
// in v8.1 the new grid rows stayed empty until the cache expired. Every relative
// import carries ?v=<version> and so do styles.css and main.js; all must equal the
// header tag. Bump with: node tests/tools/set-version.mjs <version>
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const html = readFileSync(join(root, 'index.html'), 'utf8');
const version = (html.match(/<span class="logo-tag">v([^<]+)<\/span>/) || [])[1];
const esc = s => s.replace(/\./g, '\\.');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('the header shows a version', () => {
  assert.match(version || '', /^\d+\.\d+(\.\d+)?$/);
});

test('index.html loads styles.css and main.js with the same version', () => {
  assert.match(html, new RegExp('href="css/styles\\.css\\?v=' + esc(version) + '"'));
  assert.match(html, new RegExp('src="js/main\\.js\\?v=' + esc(version) + '"'));
});

test('every relative import in js/ carries ?v=<header version>', () => {
  const bad = [];
  let count = 0;
  for (const f of walk(join(root, 'js')).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      count++;
      if (!m[1].endsWith('.js?v=' + version)) bad.push(f.slice(root.length) + ': ' + m[1]);
    }
  }
  assert.ok(count > 50, 'imports found: ' + count);
  assert.deepEqual(bad, []);
});
