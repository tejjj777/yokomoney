import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
console.log('Scripts in index.html:', scriptMatches);

const ctx = {
  window: {},
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    documentElement: { dataset: {} },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    write: () => {}
  },
  Image: class Image {},
  Audio: class Audio { play() {} pause() {} },
  Intl,
  TextEncoder,
  TextDecoder,
  crypto: globalThis.crypto,
  fetch: () => Promise.resolve({ ok: false }),
  navigator: { language: 'en-IN', languages: ['en-IN', 'en'] },
  location: { hash: '#dashboard', protocol: 'http:', origin: 'http://localhost' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  history: { replaceState: () => {} },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  console,
  setTimeout: () => {},
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {}
};
ctx.globalThis = ctx;
ctx.window = ctx;
const vctx = vm.createContext(ctx);

for (const s of scriptMatches) {
  if (s.startsWith('http') || s.includes('chart.umd')) continue;
  console.log('Loading:', s);
  const code = fs.readFileSync(s, 'utf8');
  vm.runInContext(code, vctx);
}

console.log('\nRunning self-tests in context:');
const res = vm.runInContext('runSelfTests()', vctx);
console.log('\nResult: Passed', res.passed, '/', res.total);
if (res.passed !== res.total) {
  process.exit(1);
}
