// Sets the app version everywhere it must match, in one go:
//   node tests/tools/set-version.mjs 8.1.1
// - the header tag in index.html (<span class="logo-tag">vX</span>)
// - the cache-busting ?v=X on styles.css and js/main.js in index.html
// - the ?v=X on EVERY relative import in js/ (static and dynamic)
// Why: GitHub Pages lets browsers reuse JS files for ~10 minutes. Without a
// version on each import, a fresh index.html can run with a previous release's
// modules (v8.1: new grid rows stayed empty). tests/version.test.mjs fails if
// any of these drift apart. Not a build step: it edits the source in place,
// like gen-golden.mjs, and its result is committed.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const v = process.argv[2];
if (!/^\d+\.\d+(\.\d+)?$/.test(v || '')) { console.error('usage: node tests/tools/set-version.mjs 8.1.1'); process.exit(1); }
const root = new URL('../../', import.meta.url).pathname;

const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let n = 0;
for (const f of walk(join(root, 'js')).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(/((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"'?]+\.js)(\?v=[^"']*)?(["'])/g,
    (m, a, path, _old, q) => { n++; return a + path + '?v=' + v + q; });
  if (out !== src) writeFileSync(f, out);
}
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<span class="logo-tag">v[^<]*<\/span>/, '<span class="logo-tag">v' + v + '</span>')
           .replace(/href="css\/styles\.css(\?v=[^"]*)?"/, 'href="css/styles.css?v=' + v + '"')
           .replace(/src="js\/main\.js(\?v=[^"]*)?"/, 'src="js/main.js?v=' + v + '"');
writeFileSync(join(root, 'index.html'), html);
console.log('version ' + v + ': ' + n + ' imports + index.html');
