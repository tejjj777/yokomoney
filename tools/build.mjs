/* YOKO! Student · production build for Netlify (`npm run build` → dist/).
   The app itself has no build step: index.html + js/ run as-is (that's what GitHub Pages serves and what you edit).
   This only makes a smaller copy for the live site:
   - the body <script> files are joined in index.html order into one minified js/app.min.js
     (they're classic scripts sharing one global scope, so joining them keeps them working; top-level names are kept),
   - css/app.css, js/theme-boot.js and js/selftests.js are minified,
   - sw.js gets the matching file list, and everything else the site needs is copied as-is. */
import fs from 'fs';
import path from 'path';
import { transform } from 'esbuild';

const ROOT = process.cwd(), OUT = path.join(ROOT, 'dist');
const SKIP = new Set(['dist', 'node_modules', 'tests', 'tools', 'shots', 'supabase', '.git', '.github', '.claude', 'js', 'css',
  'package.json', 'package-lock.json', 'netlify.toml', '.gitignore', 'index.html', 'sw.js',
  'sample-bill.png', 'sample-payslip-photo.jpg', 'sample-payslip.pdf']);
const kb = n => (n / 1024).toFixed(0) + ' KB';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });

// 1. One minified bundle from the body scripts, in load order
let html = fs.readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body'));
const files = [...body.matchAll(/<script src="(js\/[^"]+\.js)"><\/script>/g)].map(m => m[1]);
if (files.length < 10) throw new Error('Could not find the app scripts in index.html');
const joined = files.map(f => `/* ${f} */\n${fs.readFileSync(f, 'utf8')}\n;`).join('\n');
const min = await transform(joined, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8' });
fs.writeFileSync(path.join(OUT, 'js/app.min.js'), min.code);
console.log(`js/app.min.js  ${files.length} files, ${kb(joined.length)} → ${kb(min.code.length)}`);

for (const f of ['js/theme-boot.js', 'js/selftests.js']) {
  const r = await transform(fs.readFileSync(f, 'utf8'), { loader: 'js', minify: true, target: 'es2020', legalComments: 'none', charset: 'utf8' });
  fs.writeFileSync(path.join(OUT, f), r.code);
}
const css = await transform(fs.readFileSync('css/app.css', 'utf8'), { loader: 'css', minify: true, charset: 'utf8' });
fs.writeFileSync(path.join(OUT, 'css/app.css'), css.code);
console.log(`css/app.css    ${kb(fs.statSync('css/app.css').size)} → ${kb(css.code.length)}`);

// 2. index.html: swap the script list for the bundle
const first = html.indexOf('<script src="js/', html.indexOf('<body'));
const lastTag = [...body.matchAll(/<script src="js\/[^"]+\.js"><\/script>/g)].pop();
const last = html.indexOf(lastTag[0], first) + lastTag[0].length;
html = html.slice(0, first) + '<script src="js/app.min.js"></script>' + html.slice(last);
html = html.replace(/<!-- Scripts run in this order[^>]*-->\n?/, '');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// 3. sw.js: same caching, new file list
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/  '\.\/js\/(?!theme-boot|selftests)[^']+\.js',?.*\n/g, '');
sw = sw.replace("  './css/app.css',", "  './css/app.css',\n  './js/app.min.js',");
if (!sw.includes("'./js/app.min.js'")) throw new Error('sw.js file list not updated');
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

// 4. Everything else the site needs
for (const name of fs.readdirSync(ROOT)) {
  if (SKIP.has(name) || name.endsWith('.md')) continue;
  fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
}
const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`dist/ ready (${kb(size(OUT))} in total)`);
