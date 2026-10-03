// Checks that code which runs while the js/ files are loading never needs a file that loads later.
// All js/ files are classic scripts sharing one global scope, so a function in a later file does not
// exist yet while an earlier file is running. Run: node tools/check-load-order.mjs
import * as acorn from 'acorn';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const files = [...fs.readFileSync(root + 'index.html', 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const declFile = {}, fnNode = {}, parsed = [];
files.forEach((f, idx) => {
  const ast = acorn.parse(fs.readFileSync(root + f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
  parsed.push({ f, idx, ast });
  for (const s of ast.body) {
    if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') { declFile[s.id.name] = idx; fnNode[s.id.name] = s; }
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') {
      declFile[d.id.name] = idx; if (d.init && /Function/.test(d.init.type)) fnNode[d.id.name] = d.init;
    }
  }
});
const isFn = n => /Function/.test(n.type);
// names bound inside a function (params and local declarations): not globals
function locals(fn) {
  const out = new Set();
  const pat = p => { if (!p) return; if (p.type === 'Identifier') out.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); };
  (function w(n) { if (!n || typeof n.type !== 'string') return;
    if (isFn(n)) { n.params.forEach(pat); if (n.id && n !== fn) out.add(n.id.name); }
    if (n.type === 'VariableDeclarator') pat(n.id);
    if (n.type === 'CatchClause') pat(n.param);
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); }
  })(fn);
  return out;
}
// refs: [name, called]; eager=true skips function bodies that are not invoked right away
function refs(n, eager, out, callee = false) {
  if (!n || typeof n.type !== 'string') return;
  if (isFn(n) && eager) return;
  switch (n.type) {
    case 'Identifier': out.push([n.name, callee]); return;
    case 'MemberExpression': refs(n.object, eager, out); if (n.computed) refs(n.property, eager, out); return;
    case 'Property': case 'PropertyDefinition': case 'MethodDefinition': if (n.computed) refs(n.key, eager, out); refs(n.value, eager, out); return;
    case 'CallExpression': case 'NewExpression':
      if (isFn(n.callee)) refs(n.callee.body, eager, out); else refs(n.callee, eager, out, true);
      n.arguments.forEach(a => refs(a, eager, out)); return;
  }
  for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => refs(x, eager, out)); else if (v && typeof v.type === 'string') refs(v, eager, out); }
}
let problems = 0;
for (const { f, idx, ast } of parsed) for (const s of ast.body) {
  if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') continue;
  const start = [];
  if (s.type === 'VariableDeclaration') s.declarations.forEach(d => { if (d.init && !isFn(d.init)) refs(d.init, true, start); });
  else refs(s, true, start);
  const seen = new Set(), q = start.map(([n, c]) => [n, c, [n]]);
  while (q.length) {
    const [n, called, path] = q.shift(); const key = n + called; if (seen.has(key)) continue; seen.add(key);
    if (declFile[n] !== undefined && declFile[n] > idx) { problems++; console.log(`${f}: load-time code reaches ${n} (in ${files[declFile[n]]}) via ${path.join(' > ')}`); }
    if (called && fnNode[n]) { const loc = locals(fnNode[n]), o = []; refs(fnNode[n].body, false, o); o.forEach(([m]) => { if (!loc.has(m)) q.push([m, true, [...path, m]]); }); }
  }
}
console.log(problems ? `${problems} problem(s). Move the needed function earlier, or run the code from init().` : `OK: ${files.length} files, load order is safe.`);
process.exit(problems ? 1 : 0);
