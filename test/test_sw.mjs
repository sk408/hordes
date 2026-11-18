// SERVICE WORKER (R4): the real sw.js, run in node:vm against fake caches, network and clients.
// Its GENERATED block is replaced by renderBlock() output for a small in-memory tree. Covers the
// routing table (SPEC §4.1, both scopes), the verified atomic install, the stale-CDN retry,
// quota, activate, the one message, music, offline and the no-cache fallback, and the kill switch.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { ROOT, split, renderBlock, fileHash, computeVersion, coreHash } from '../tools/gen_sw.mjs';

let passed = 0;
const check = async (label, fn) => {
  try { await fn(); } catch (err) { console.error('  FAIL ' + label); throw err; }
  passed++; console.log('  ok - ' + label);
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');
const KILL_SRC = fs.readFileSync(path.join(ROOT, 'tools/sw_killswitch.js'), 'utf8');
const ORIGIN = 'https://x.test';
const MP3 = Buffer.from('ID3 the title track bytes');
const MP3_NAME = 'assets/music/title.' + sha(MP3).slice(0, 8) + '.mp3';
const MP3_BOSS = Buffer.from('ID3 the boss track bytes');
const BOSS_NAME = 'assets/music/boss.' + sha(MP3_BOSS).slice(0, 8) + '.mp3';
const TREE = {
  'index.html': '<!doctype html>\n<meta charset="UTF-8">\n<script type="module" src="src/main.js"></script>\n',
  'manifest.webmanifest': '{ "start_url": "./" }\n',
  'src/main.js': "import { A } from './a.js';\nconsole.log(A);\n",
  'src/a.js': 'export const A = 1;\n',
  'src/config.js': 'export const C = 1;\n',
  'assets/pic.png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]),
};
const bytesOf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v));

// The sw.js source for a tree: the real hand-written part, a rendered block.
function swFor(tree, { music = [MP3_NAME, BOSS_NAME], src = SW_SRC } = {}) {
  const files = Object.keys(tree).sort().map((p) => [p, fileHash(p, bytesOf(tree[p]))]);
  const version = computeVersion(files, coreHash(src));
  const { before, after } = split(src);
  return { text: before + renderBlock({ version, files, music }) + after, version, files };
}

// ---------- fakes ----------
const basic = (r, type = 'basic') => {
  Object.defineProperty(r, 'type', { get: () => type });
  const c = r.clone.bind(r);
  r.clone = () => basic(c(), type);
  return r;
};
class FCache {
  constructor(env) { this.env = env; this.m = new Map(); }
  async match(k) { const r = this.m.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; }
  async put(k, res) {
    const env = this.env; env.puts++;
    if (env.putFail === env.puts) { const e = new Error('put failed'); e.name = 'InvalidStateError'; throw e; }
    if (env.quota === 'always' || env.quota > 0) {
      if (env.quota !== 'always') env.quota--;
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    }
    if (env.putGate) await env.putGate;
    const buf = await res.arrayBuffer();
    this.m.set(typeof k === 'string' ? k : k.url, new Response(buf, { status: res.status, headers: res.headers }));
  }
  async keys() { return [...this.m.keys()].map((url) => ({ url })); }
  async delete(k) { return this.m.delete(typeof k === 'string' ? k : k.url); }
}
function makeEnv({ scope = '/hordes/', tree = TREE, served = null, sw = null, crlf = false, origin = ORIGIN } = {}) {
  const env = { scope, base: origin + scope, putFail: 0, store: new Map(), opens: 0, puts: 0, quota: 0, putGate: null,
    log: [], offline: false, routes: null, skips: 0, claims: 0, unregisters: 0, listeners: {}, clients: {} };
  const built = sw || swFor(tree);
  env.version = built.version; env.files = built.files;
  env.CACHE = 'hordes:' + scope + ':' + built.version;
  env.MUSIC_CACHE = 'hordes:' + scope + ':music';
  const net = served || tree;
  env.caches = {
    async open(n) { env.opens++; if (!env.store.has(n)) env.store.set(n, new FCache(env)); return env.store.get(n); },
    async has(n) { return env.store.has(n); },
    async keys() { return [...env.store.keys()]; },
    async delete(n) { return env.store.delete(n); },
    async match(k, o = {}) {
      const names = o.cacheName ? [o.cacheName] : [...env.store.keys()];
      for (const n of names) { const c = env.store.get(n); if (c) { const r = await c.match(k); if (r) return r; } }
      return undefined;
    },
  };
  env.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    env.log.push({ url, init });
    if (env.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    if (env.routes) { const r = env.routes(u); if (r) return r; }
    if (u.origin === origin && u.pathname.startsWith(scope)) {
      const p = decodeURIComponent(u.pathname.slice(scope.length)) || 'index.html';
      if (p === MP3_NAME) return basic(new Response(MP3, { status: 200 }));
      if (p === BOSS_NAME) return basic(new Response(MP3_BOSS, { status: 200 }));
      if (Object.prototype.hasOwnProperty.call(net, p)) {
        let b = bytesOf(net[p]);
        if (crlf && typeof net[p] === 'string') b = Buffer.from(net[p].replace(/\n/g, '\r\n'));
        return basic(new Response(b, { status: 200 }));
      }
    }
    return basic(new Response('not found', { status: 404 }));
  };
  const self = {
    registration: { scope: env.base, unregister: async () => { env.unregisters++; return true; } },
    addEventListener: (t, f) => { (env.listeners[t] = env.listeners[t] || []).push(f); },
    skipWaiting: async () => { env.skips++; },
    clients: {
      get: async (id) => (env.clients[id] ? { id, url: env.clients[id] } : undefined),
      claim: async () => { env.claims++; },
    },
  };
  const ctx = vm.createContext({ self, caches: env.caches, fetch: env.fetch, Response, Request, Headers, URL,
    crypto: globalThis.crypto, console });
  vm.runInContext(built.text, ctx, { filename: 'sw.js' });
  env.fire = async (type, extra = {}) => {
    const waits = []; let resp = null; let responded = false;
    const ev = { ...extra, waitUntil: (p) => { waits.push(Promise.resolve(p)); }, respondWith: (p) => { responded = true; resp = Promise.resolve(p); } };
    for (const f of env.listeners[type] || []) f(ev);
    const res = resp ? await resp : null;
    const settle = async () => { let n = -1; while (n !== waits.length) { n = waits.length; await Promise.allSettled(waits); } };
    return { res, responded, waits, settle, done: (async () => { await settle(); const out = []; for (const w of waits) out.push(await w.then(() => 'ok', (e) => e)); return out; })() };
  };
  env.install = async () => { const r = await env.fire('install'); const out = await r.done; if (out.some((x) => x !== 'ok')) throw out.find((x) => x !== 'ok'); };
  env.activate = async () => { const r = await env.fire('activate'); await r.done; };
  env.req = (rel, { method = 'GET', mode = 'cors', headers = {}, cache = 'default', clientId = '', abs = null } = {}) =>
    env.fire('fetch', { request: { url: abs || env.base + rel, method, mode, cache, headers: new Headers(headers) }, clientId });
  env.text = async (r) => (r ? Buffer.from(await r.arrayBuffer()).toString('utf8') : null);
  return env;
}

// ---------- 1. routing, both scopes ----------
for (const scope of ['/hordes/', '/hordes-claude/']) {
  const env = makeEnv({ scope });
  await env.install(); await env.activate();
  env.clients = { game: env.base + '?embed=1', editor: env.base + 'editor.html', dev: env.base + 'index.html?dev=1' };
  await check('1 [' + scope + '] rows 1, 3, 7: no respondWith', async () => {
    const cases = [
      ['POST', 'src/a.js', { method: 'POST' }], ['HEAD', 'src/a.js', { method: 'HEAD' }],
      ['Range', 'src/a.js', { headers: { range: 'bytes=0-1' } }],
      ['only-if-cached no-cors', 'src/a.js', { cache: 'only-if-cached', mode: 'no-cors' }],
      ['cross-origin', '', { abs: 'https://other.test' + scope + 'src/a.js' }],
      ['outside the scope', '', { abs: ORIGIN + '/other/x.js' }],
      ['nav classic/', 'classic/index.html', { mode: 'navigate' }], ['nav editor', 'editor.html', { mode: 'navigate' }],
      ['nav docs', 'docs/a.html', { mode: 'navigate' }], ['nav tools', 'tools/x.html', { mode: 'navigate' }],
      ['nav test', 'test/x.html', { mode: 'navigate' }], ['nav ?dev=1', 'index.html?dev=1', { mode: 'navigate' }],
      ['nav ?a=1&dev=1', '?a=1&dev=1', { mode: 'navigate' }],
      ['sw.js', 'sw.js', {}], ['CREDITS.md', 'assets/music/CREDITS.md', {}],
      ['unknown music', 'assets/music/title.00000000.mp3', {}], ['constructor', 'constructor', {}],
      ['__proto__', '__proto__', {}], ['hasOwnProperty', 'hasOwnProperty', {}],
      ['docs subresource', 'docs/a.js', {}], ['classic/src', 'classic/src/main.js', {}],
    ];
    for (const [label, rel, o] of cases) {
      const r = await env.req(rel, o);
      assert(!r.responded, label + ' was answered by the worker');
    }
  });
  await check('1 [' + scope + '] row 2: game navigations come from the cache', async () => {
    for (const q of ['', 'index.html', '?embed=1&sw=on', 'index.html?dev=0']) {
      env.log.length = 0;
      const r = await env.req(q, { mode: 'navigate' });
      assert(r.responded && (await env.text(r.res)) === TREE['index.html'], 'navigation ' + q);
      assert(env.log.length === 0, 'navigation ' + q + ' touched the network');
    }
  });
  await check('1 [' + scope + '] row 4: the game client and an unknown or empty clientId get the cache', async () => {
    for (const id of ['game', '', 'gone']) {
      env.log.length = 0;
      const r = await env.req('src/a.js', { clientId: id });
      assert(r.responded && (await env.text(r.res)) === TREE['src/a.js'] && env.log.length === 0, 'client ' + JSON.stringify(id));
    }
  });
  await check('1 [' + scope + '] row 5: the editor and a ?dev=1 run get the network', async () => {
    for (const id of ['editor', 'dev']) {
      env.log.length = 0;
      const r = await env.req('src/a.js', { clientId: id });
      assert(r.responded && env.log.length === 1 && env.log[0].url === env.base + 'src/a.js', 'client ' + id);
    }
  });
  await check('1 [' + scope + '] row 6: music hit, miss, offline and Range', async () => {
    env.log.length = 0;
    const miss = await env.req(MP3_NAME); await miss.settle();
    assert(miss.responded && env.log.length === 1 && miss.res.status === 200, 'miss');
    const hit = await env.req(MP3_NAME);
    assert(hit.responded && env.log.length === 1 && (await hit.res.arrayBuffer()).byteLength === MP3.length, 'hit touched the network');
    env.offline = true;
    const off = await env.req(BOSS_NAME);
    assert(off.responded && off.res.status === 503, 'offline miss is ' + (off.res && off.res.status));
    env.offline = false;
    const rg = await env.req(MP3_NAME, { headers: { range: 'bytes=0-' } });
    assert(!rg.responded, 'Range answered');
  });
}

for (const [origin, scope] of [['http://127.0.0.1:8080', '/hordes/'], ['https://claude.example', '/hordes-dev/']]) {
  const env = makeEnv({ scope, origin });
  await env.install(); await env.activate();
  env.clients = { plain: env.base, on: env.base + '?sw=on' };
  await check('1 [' + origin + scope + '] a dev tree: only ?sw=on loads come from the cache', async () => {
    for (const q of ['', 'index.html', '?embed=1']) {
      const r = await env.req(q, { mode: 'navigate' });
      assert(!r.responded, 'navigation ' + JSON.stringify(q) + ' without sw=on was answered from the cache');
    }
    env.log.length = 0;
    const on = await env.req('?sw=on', { mode: 'navigate' });
    assert(on.responded && (await env.text(on.res)) === TREE['index.html'] && env.log.length === 0, 'sw=on navigation');
    const a = await env.req('src/a.js', { clientId: 'plain' });
    assert(a.responded && env.log.length === 1, 'a plain page got its module from the cache');
    const b = await env.req('src/a.js', { clientId: 'on' });
    assert(b.responded && env.log.length === 1, 'an sw=on page went to the network');
  });
}

// ---------- 2. install ----------
await check('2 install: every file in CACHE with the right Content-Type and an empty url', async () => {
  const env = makeEnv();
  await env.install();
  const c = env.store.get(env.CACHE);
  assert(c && c.m.size === Object.keys(TREE).length, 'cache size ' + (c && c.m.size));
  const types = { 'index.html': 'text/html; charset=utf-8', 'src/a.js': 'text/javascript; charset=utf-8',
    'manifest.webmanifest': 'application/manifest+json', 'assets/pic.png': 'image/png' };
  for (const [p, t] of Object.entries(types)) {
    const r = await env.caches.match(env.base + p, { cacheName: env.CACHE });
    assert(r && r.headers.get('content-type') === t, p + ' type ' + (r && r.headers.get('content-type')));
    assert(r.url === '' && r.redirected === false, p + ' carries a url');
  }
});
await check('2 install: a CRLF-served tree and an LF-served tree both install', async () => {
  for (const crlf of [false, true]) {
    const env = makeEnv({ crlf });
    await env.install();
    assert(env.store.get(env.CACHE).m.size === Object.keys(TREE).length, 'crlf=' + crlf);
  }
});
await check('2 install: a file an older HORDES cache holds with the same hash is not fetched; a changed one is', async () => {
  const old = makeEnv();
  await old.install();
  const tree2 = { ...TREE, 'src/config.js': 'export const C = 2;\n' };
  const env = makeEnv({ tree: tree2 });
  env.store.set('hordes:/hordes/:old', old.store.get(old.CACHE));
  await env.install();
  const urls = env.log.map((l) => l.url.replace(env.base, ''));
  assert(urls.length === 1 && urls[0] === 'src/config.js', 'fetched ' + JSON.stringify(urls));
  assert(env.log[0].init.cache === 'no-cache', 'the first try is not no-cache');
});

await check('2 a put that fails (not quota): the install rejects, CACHE is gone, other hordes caches survive', async () => {
  const env = makeEnv();
  for (const n of ['hordes:/hordes/:old', env.MUSIC_CACHE]) await env.caches.open(n);
  env.putFail = 3;
  let threw = null; try { await env.install(); } catch (e) { threw = e; }
  assert(threw && threw.name === 'InvalidStateError', 'install did not reject');
  const left = [...env.store.keys()].sort();
  assert(JSON.stringify(left) === JSON.stringify(['hordes:/hordes/:music', 'hordes:/hordes/:old']), JSON.stringify(left));
});

// ---------- 3. stale CDN ----------
const OLD_CONFIG = TREE['src/config.js'];
const NEW_TREE = { ...TREE, 'src/config.js': 'export const C = 3;\n' };
await check('3 stale edge: the plain URL is old, ?v= is right: the install succeeds with the new bytes', async () => {
  const env = makeEnv({ tree: NEW_TREE });
  env.routes = (u) => (u.pathname.endsWith('/src/config.js') && !u.search ? basic(new Response(OLD_CONFIG, { status: 200 })) : null);
  await env.install();
  const r = await env.caches.match(env.base + 'src/config.js', { cacheName: env.CACHE });
  assert((await env.text(r)) === NEW_TREE['src/config.js'], 'cache holds the old bytes');
  const tries = env.log.filter((l) => l.url.includes('src/config.js')).map((l) => [l.url.replace(env.base, ''), l.init.cache]);
  assert(JSON.stringify(tries) === JSON.stringify([['src/config.js', 'no-cache'], ['src/config.js?v=' + env.version, 'no-store']]), JSON.stringify(tries));
});
for (const [label, route] of [
  ['both tries serve the old bytes', (u) => (u.pathname.endsWith('/src/config.js') ? basic(new Response(OLD_CONFIG, { status: 200 })) : null)],
  ['a 404', (u) => (u.pathname.endsWith('/src/config.js') ? basic(new Response('nf', { status: 404 })) : null)],
]) {
  await check('3 ' + label + ': the install rejects, CACHE does not exist, caches.open never called', async () => {
    const env = makeEnv({ tree: NEW_TREE });
    env.routes = route;
    let threw = null; try { await env.install(); } catch (e) { threw = e; }
    assert(threw && /src\/config\.js/.test(threw.message), 'install resolved');
    assert(!env.store.has(env.CACHE) && env.opens === 0, 'cache created: opens=' + env.opens);
  });
}

// ---------- 3b. an older waiting worker activates while a newer one fills ----------
await check('3 an older worker activating mid-install deletes the newer cache: the newer install rejects, no cache is left', async () => {
  const B = makeEnv();
  await B.install();
  const C = makeEnv({ tree: NEW_TREE });
  C.store = B.store;                      // one origin, one CacheStorage
  let open; C.putGate = new Promise((r) => { open = r; });
  const pending = C.install().then(() => 'resolved', (e) => e);
  for (let i = 0; i < 200 && C.puts === 0; i++) await new Promise((r) => setImmediate(r));
  assert(C.puts > 0 && B.store.has(C.CACHE), 'C never started storing');
  await B.activate();
  assert(!B.store.has(C.CACHE), "B's activate kept C's cache (the race did not happen)");
  open();
  const out = await pending;
  assert(out !== 'resolved', "C's install resolved although its cache is gone");
  assert(!B.store.has(C.CACHE), 'a C cache came back: ' + JSON.stringify([...B.store.keys()]));
  await C.install();                       // the browser's next check
  assert(B.store.get(C.CACHE).m.size === Object.keys(NEW_TREE).length, 'the retry did not fill C');
});
await check('3 activate with its cache gone (lost after install): refills it, and an offline start works', async () => {
  const env = makeEnv();
  await env.install();
  env.store.delete(env.CACHE);
  await env.activate();
  assert(env.store.has(env.CACHE) && env.store.get(env.CACHE).m.size === Object.keys(TREE).length, 'not refilled');
  env.offline = true; env.clients = { game: env.base };
  const nav = await env.req('', { mode: 'navigate' });
  assert((await env.text(nav.res)) === TREE['index.html'], 'offline navigation');
  const r = await env.req('src/a.js', { clientId: 'game' });
  assert((await env.text(r.res)) === TREE['src/a.js'], 'offline module');
});
await check('3 activate with its cache gone and the network down: activation completes, no half cache', async () => {
  const env = makeEnv();
  await env.install();
  env.store.delete(env.CACHE); env.offline = true;
  await env.activate();
  assert(!env.store.has(env.CACHE), 'a cache was left: ' + JSON.stringify([...env.store.keys()]));
});

// ---------- 4. quota ----------
await check('4 quota once: the music cache is dropped, the retry succeeds, the install resolves', async () => {
  const env = makeEnv();
  await env.caches.open(env.MUSIC_CACHE); env.opens = 0;
  env.quota = 1;
  await env.install();
  assert(!env.store.has(env.MUSIC_CACHE), 'music cache kept');
  assert(env.store.get(env.CACHE).m.size === Object.keys(TREE).length, 'install incomplete');
});
await check('4 quota always: the install rejects; every hordes:/hordes/ cache goes, others survive', async () => {
  const env = makeEnv();
  for (const n of ['hordes:/hordes/:old', env.MUSIC_CACHE, 'hordes:/other/:x', 'otherapp-v1']) await env.caches.open(n);
  env.quota = 'always';
  let threw = null; try { await env.install(); } catch (e) { threw = e; }
  assert(threw && threw.name === 'QuotaExceededError', 'install did not reject with the quota error');
  const left = [...env.store.keys()].sort();
  assert(JSON.stringify(left) === JSON.stringify(['hordes:/other/:x', 'otherapp-v1']), JSON.stringify(left));
});

// ---------- 5. activate ----------
await check('5 activate: drops other hordes:/hordes/ caches, keeps CACHE, music and other prefixes; prunes music', async () => {
  const env = makeEnv();
  await env.install();
  for (const n of ['hordes:/hordes/:old', 'hordes:/hordes/:older', 'hordes:/hordes-claude/:x', 'hordes:/other/:y', 'otherapp-v1']) await env.caches.open(n);
  const mc = await env.caches.open(env.MUSIC_CACHE);
  await mc.put(env.base + MP3_NAME, new Response(MP3));
  await mc.put(env.base + 'assets/music/title.0badf00d.mp3', new Response('old take'));
  await env.activate();
  const left = [...env.store.keys()].sort();
  const want = [env.CACHE, env.MUSIC_CACHE, 'hordes:/hordes-claude/:x', 'hordes:/other/:y', 'otherapp-v1'].sort();
  assert(JSON.stringify(left) === JSON.stringify(want), JSON.stringify(left));
  const keys = (await env.store.get(env.MUSIC_CACHE).keys()).map((r) => r.url);
  assert(JSON.stringify(keys) === JSON.stringify([env.base + MP3_NAME]), 'music not pruned: ' + JSON.stringify(keys));
});

// ---------- 6. messages, URGENT, no claim ----------
await check('6 only the skipWaiting message calls skipWaiting; install never does with URGENT false', async () => {
  const env = makeEnv();
  await env.install(); await env.activate();
  await (await env.fire('message', { data: 'hello' })).done;
  await (await env.fire('message', { data: { type: 'skipWaiting' } })).done;
  assert(env.skips === 0, 'skipWaiting without the message');
  await (await env.fire('message', { data: 'skipWaiting' })).done;
  assert(env.skips === 1, 'skips=' + env.skips);
});
await check('6 URGENT = true (text substitution): install calls skipWaiting', async () => {
  const src = SW_SRC.replace('const URGENT = false;', 'const URGENT = true;');
  assert(src !== SW_SRC, 'no URGENT constant to flip');
  const env = makeEnv({ sw: swFor(TREE, { src }) });
  await env.install();
  assert(env.skips === 1, 'skips=' + env.skips);
});
await check('6 clients.claim is never referenced (grep) and never called (spy)', async () => {
  assert(!/clients\s*\.\s*claim/.test(SW_SRC), 'sw.js references clients.claim');
  const env = makeEnv();
  await env.install(); await env.activate();
  await env.req('', { mode: 'navigate' });
  assert(env.claims === 0, 'claim called');
});

// ---------- 7. music ----------
await check('7 a hit comes from the cache and the network is not touched', async () => {
  const env = makeEnv();
  const mc = await env.caches.open(env.MUSIC_CACHE);
  await mc.put(env.base + MP3_NAME, new Response(MP3));
  const r = await env.req(MP3_NAME);
  assert(r.responded && env.log.length === 0 && Buffer.from(await r.res.arrayBuffer()).equals(MP3), 'hit');
});
await check('7 a miss returns before the store finishes; a correct 200 is then stored', async () => {
  const env = makeEnv();
  let open; env.putGate = new Promise((r) => { open = r; });
  const r = await env.req(MP3_NAME);
  assert(r.responded && r.res.status === 200 && Buffer.from(await r.res.arrayBuffer()).equals(MP3), 'response');
  const before = env.store.has(env.MUSIC_CACHE) ? (await env.store.get(env.MUSIC_CACHE).keys()).length : 0;
  assert(before === 0, 'stored before the response was returned');
  open(); await r.settle();
  const keys = (await env.store.get(env.MUSIC_CACHE).keys()).map((k) => k.url);
  assert(JSON.stringify(keys) === JSON.stringify([env.base + MP3_NAME]), 'not stored: ' + JSON.stringify(keys));
  const hit = await env.caches.match(env.base + MP3_NAME, { cacheName: env.MUSIC_CACHE });
  assert(hit.headers.get('content-type') === 'audio/mpeg', 'type');
});
for (const [label, route] of [
  ['a 200 with the wrong bytes', () => basic(new Response('truncated', { status: 200 }))],
  ['a 404', () => basic(new Response('nf', { status: 404 }))],
  ['an opaque response', () => basic(new Response(MP3, { status: 200 }), 'opaque')],
]) {
  await check('7 ' + label + ' is not stored', async () => {
    const env = makeEnv();
    env.routes = (u) => (u.pathname.endsWith('.mp3') ? route() : null);
    const r = await env.req(MP3_NAME); await r.settle();
    const n = env.store.has(env.MUSIC_CACHE) ? (await env.store.get(env.MUSIC_CACHE).keys()).length : 0;
    assert(r.responded && n === 0, 'stored');
  });
}
await check('7 offline with no cached copy gives 503', async () => {
  const env = makeEnv(); env.offline = true;
  const r = await env.req(MP3_NAME);
  assert(r.res.status === 503, 'status ' + r.res.status);
});

// ---------- 8. offline ----------
await check('8 offline: the navigation and every FILES request answer from CACHE', async () => {
  const env = makeEnv();
  await env.install(); await env.activate();
  env.offline = true; env.clients = { game: env.base };
  const nav = await env.req('?embed=1', { mode: 'navigate' });
  assert((await env.text(nav.res)) === TREE['index.html'], 'navigation');
  for (const p of Object.keys(TREE)) {
    const r = await env.req(p, { clientId: 'game' });
    assert(r.responded && Buffer.from(await r.res.arrayBuffer()).equals(bytesOf(TREE[p])), p);
  }
});

// ---------- 9. fallback ----------
await check('9 CACHE missing: navigation and FILES go to the network, and no cache is created', async () => {
  const env = makeEnv();
  await env.install(); await env.activate();
  env.store.delete(env.CACHE); env.opens = 0; env.log.length = 0;
  const nav = await env.req('', { mode: 'navigate' });
  assert((await env.text(nav.res)) === TREE['index.html'] && env.log.length === 1, 'navigation');
  const r = await env.req('src/a.js');
  assert((await env.text(r.res)) === TREE['src/a.js'] && env.log.length === 2, 'module');
  assert(env.opens === 0 && !env.store.has(env.CACHE), 'caches.open was called');
});

// ---------- 10. the kill switch ----------
await check('10 kill switch: install skips waiting; activate drops only its prefix and unregisters; no fetch listener', async () => {
  const env = makeEnv({ sw: { text: KILL_SRC, version: 'kill', files: [] } });
  for (const n of ['hordes:/hordes/:a', 'hordes:/hordes/:music', 'hordes:/hordes-claude/:b', 'otherapp-v1']) await env.caches.open(n);
  await env.install();
  assert(env.skips === 1, 'skips=' + env.skips);
  await env.activate();
  assert(JSON.stringify([...env.store.keys()].sort()) === JSON.stringify(['hordes:/hordes-claude/:b', 'otherapp-v1']), JSON.stringify([...env.store.keys()]));
  assert(env.unregisters === 1, 'unregister not called');
  assert(!env.listeners.fetch, 'the kill switch has a fetch listener');
});

console.log('test_sw: ' + passed + ' checks passed');
