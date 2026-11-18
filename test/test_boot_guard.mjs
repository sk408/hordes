// BOOT AND UPDATES (R4): index.html's inline script, run in node:vm with fake document, window,
// navigator.serviceWorker, location, sessionStorage, caches and a controllable clock. Covers the
// LOADING… / failure screen, G1 (a controller change before the first frame reloads), the
// registration, the NEW VERSION READY notice and its tap, the F5 auto-apply, the hourly check,
// and the recovery tap. Part 12 boots the real game through test/_harness.mjs and checks the
// one-shot report from frame().
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPT = (() => {
  const re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(HTML))) if (m[1].includes('BOOT AND UPDATES')) return m[1];
  throw new Error('no BOOT AND UPDATES script in index.html');
})();

let passed = 0;
const check = async (label, fn) => {
  try { await fn(); } catch (err) { console.error('  FAIL ' + label); throw err; }
  passed++; console.log('  ok - ' + label);
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const FAIL_TEXT = 'HORDES DIDN’T LOAD. IT MAY HAVE JUST UPDATED. TAP TO RELOAD';
const OFFLINE_TEXT = 'NO CONNECTION. TAP TO TRY AGAIN';
const OWN = { target: { tagName: 'SCRIPT', src: 'https://sk408.github.io/hordes/src/main.js' } };   // the page's own module failing

function emitter() {
  const ls = {};
  return { on: (t, f) => { (ls[t] = ls[t] || []).push(f); }, emit: (t, e) => { for (const f of (ls[t] || []).slice()) f(e || {}); }, ls };
}
function fakeWorker() {
  const em = emitter();
  return { state: 'installed', posted: [], postMessage(m) { this.posted.push(m); }, addEventListener: em.on, emit: em.emit };
}
// Options: sw (false = no serviceWorker), controller, waiting, regExists, host, protocol, search,
// userActivation (undefined | false = absent | {hasBeenActive}), session ('ok' | 'throw'), onLine, pathname.
function makePage(o = {}) {
  const P = { now: 1e12, timers: [], seq: 0, reloads: 0, registers: [], unregisters: 0, updates: 0, deleted: [], errors: [] };
  P.advance = async (ms) => {
    const end = P.now + ms;
    for (;;) {
      P.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = P.timers[0];
      if (!t || t.at > end) break;
      P.now = t.at;
      if (t.every) t.at += t.every; else P.timers.shift();
      t.fn();
      await flush();
    }
    P.now = end; await flush();
  };
  const timerApi = {
    setTimeout: (fn, ms) => { const id = ++P.seq; P.timers.push({ id, at: P.now + (ms || 0), fn }); return id; },
    setInterval: (fn, ms) => { const id = ++P.seq; P.timers.push({ id, at: P.now + ms, every: ms, fn }); return id; },
    clearInterval: (id) => { P.timers = P.timers.filter((t) => t.id !== id); },
    clearTimeout: (id) => { P.timers = P.timers.filter((t) => t.id !== id); },
  };
  const docEm = emitter();
  const mkEl = (tag) => {
    const em = emitter();
    return { tagName: tag.toUpperCase(), hidden: false, textContent: '', className: '', onclick: null, disabled: false,
      id: '', type: '', addEventListener: em.on, emit: em.emit,
      click() { const ev = { stopPropagation() {} }; em.emit('click', ev); if (this.onclick) this.onclick(ev); } };
  };
  const box = mkEl('div'); box.id = 'boot-msg'; box.textContent = 'LOADING…';
  const cls = new Set();
  const body = { children: [], appendChild(e) { this.children.push(e); return e; },
    classList: { contains: (c) => cls.has(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); return on; } } };
  const document = { hidden: false, body, getElementById: (id) => (id === 'boot-msg' ? box : null),
    createElement: mkEl, addEventListener: docEm.on };
  P.box = box; P.document = document;
  P.btn = () => body.children.find((e) => e.id === 'sw-update') || null;
  P.setHidden = (h) => { document.hidden = h; docEm.emit('visibilitychange'); };
  const winEm = emitter();
  const window = { addEventListener: winEm.on };
  P.window = window;
  P.error = (e) => winEm.emit('error', e);

  // the service worker container
  const regEm = emitter();
  const reg = {
    scope: 'https://x.test/hordes/', waiting: o.waiting ? fakeWorker() : null, installing: null,
    addEventListener: regEm.on, emitReg: regEm.emit,
    unregister: async () => { P.unregisters++; return true; },
    update: async () => { P.updates++; if (o.updateFails === 'throw') throw new Error('x'); if (o.updateFails) return Promise.reject(new Error('no')); return reg; },
  };
  P.reg = reg;
  const swEm = emitter();
  const container = {
    controller: o.controller ? {} : null,
    addEventListener: swEm.on,
    getRegistration: async () => (o.regExists === false ? undefined : (o.regExists || o.controller || o.waiting ? reg : undefined)),
    register: (url, opts) => {
      P.registers.push([url, opts]);
      if (o.registerThrows) throw new Error('blocked');
      if (o.registerRejects) return Promise.reject(new Error('no'));
      return Promise.resolve(reg);
    },
  };
  P.container = container;
  P.controllerChange = () => swEm.emit('controllerchange');
  const navigator = { onLine: o.onLine !== false };
  if (o.sw === 'throw') Object.defineProperty(navigator, 'serviceWorker', { get() { throw new Error('denied'); } });
  else if (o.sw !== false) navigator.serviceWorker = container;
  if (o.userActivation !== false) navigator.userActivation = o.userActivation || { hasBeenActive: false };
  P.navigator = navigator;
  const ss = new Map();
  if (o.guardAt !== undefined) ss.set('hordes_sw_auto', String(o.guardAt));
  P.ss = ss;
  const sessionStorage = o.session === 'throw'
    ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }
    : { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => { ss.set(k, String(v)); } };
  const cacheNames = new Set(['hordes:/hordes/:abc', 'hordes:/hordes/:music', 'hordes:/hordes-claude/:x', 'otherapp']);
  P.cacheNames = cacheNames;
  const caches = { keys: async () => [...cacheNames], delete: async (k) => { P.deleted.push(k); return cacheNames.delete(k); } };
  const location = { hostname: o.host || 'sk408.github.io', protocol: o.protocol || 'https:', search: o.search || '',
    pathname: o.pathname || '/hordes/', reload: () => { P.reloads++; } };
  location.origin = location.protocol + '//' + location.hostname;
  const ctx = vm.createContext({ document, window, navigator, location, sessionStorage, caches, URL, console,
    Date: { now: () => P.now }, Promise, ...timerApi });
  window.caches = caches;
  vm.runInContext(SCRIPT, ctx, { filename: 'index.html#boot' });
  P.ctx = ctx;
  P.live = false; P.isFresh = true; P.saves = 0; P.order = [];
  P.hooks = { runLive: () => P.live, fresh: () => P.isFresh, save: () => { P.saves++; P.order.push('save'); } };
  P.boot = async (h) => { window.hordesBooted(h === undefined ? P.hooks : h); await flush(); };
  if (reg.waiting) { const w = reg.waiting; const pm = w.postMessage.bind(w); w.postMessage = (m) => { P.order.push('post:' + m); pm(m); }; }
  return P;
}

// ---- 1. no worker ----
await check('1 no serviceWorker: hordesBooted hides the box, does not throw, does not register', async () => {
  const P = makePage({ sw: false });
  assert(typeof P.window.hordesBooted === 'function', 'hordesBooted not defined');
  await P.boot(); await P.advance(10000);
  assert(P.box.hidden === true && P.registers.length === 0, 'box ' + P.box.hidden);
});
await check('1 file:, a throwing serviceWorker getter, a throwing register: no throw, no registration', async () => {
  const a = makePage({ protocol: 'file:' }); await a.boot(); await a.advance(10000);
  assert(a.registers.length === 0, 'file: registered');
  const b = makePage({ sw: 'throw' }); await b.boot(); await b.advance(10000);
  assert(b.box.hidden && b.registers.length === 0, 'getter');
  const c = makePage({ registerThrows: true }); await c.boot(); await c.advance(10000);
  assert(c.registers.length === 1 && !c.btn(), 'register throws');
});

// ---- 2. dev hosts ----
await check('2 dev host without sw=on: no register, an existing registration is unregistered; ?sw=on registers', async () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'game.localhost']) {
    const P = makePage({ host, regExists: true }); await P.boot(); await P.advance(10000);
    assert(P.registers.length === 0 && P.unregisters === 1, host + ': registers ' + P.registers.length + ' unregisters ' + P.unregisters);
  }
  const Q = makePage({ host: '127.0.0.1', search: '?sw=on' }); await Q.boot(); await Q.advance(4000);
  assert(Q.registers.length === 1, 'sw=on did not register');
  const R = makePage({ host: 'claude.stevesinfo.com' }); await R.boot(); await R.advance(4000);
  assert(R.registers.length === 1, 'a real host did not register');
});

await check('2 a live-edited -dev/ tree: no register, an existing registration is unregistered; ?sw=on registers', async () => {
  const P = makePage({ host: 'claude.stevesinfo.com', pathname: '/hordes-dev/index.html', regExists: true }); await P.boot(); await P.advance(10000);
  assert(P.registers.length === 0 && P.unregisters === 1, 'registers ' + P.registers.length + ' unregisters ' + P.unregisters);
  const Q = makePage({ host: 'claude.stevesinfo.com', pathname: '/hordes-dev/', search: '?dev=1', regExists: true }); await Q.boot(); await Q.advance(10000);
  assert(Q.registers.length === 0 && Q.unregisters === 1, '?dev=1 on -dev/: registers ' + Q.registers.length);
  const R = makePage({ host: 'claude.stevesinfo.com', pathname: '/hordes-dev/', search: '?sw=on' }); await R.boot(); await R.advance(4000);
  assert(R.registers.length === 1, 'sw=on did not register');
});
await check('2 a ?dev=1 run on a real host registers nothing and leaves the registration alone', async () => {
  const P = makePage({ search: '?dev=1', controller: true }); await P.boot(); await P.advance(10000);
  assert(P.registers.length === 0 && P.unregisters === 0, 'registers ' + P.registers.length + ' unregisters ' + P.unregisters);
});

// ---- 3. register ----
await check('3 register once, REGISTER_AFTER_MS after boot, with updateViaCache none; a rejection is quiet', async () => {
  const P = makePage(); await P.boot();
  await P.advance(2999); assert(P.registers.length === 0, 'too early');
  await P.advance(1);
  assert(P.registers.length === 1 && P.registers[0][0] === 'sw.js' && JSON.stringify(P.registers[0][1]) === '{"updateViaCache":"none"}', JSON.stringify(P.registers));
  await P.advance(7200000); assert(P.registers.length === 1, 'registered again');
  const R = makePage({ registerRejects: true }); await R.boot(); await R.advance(5000);
  assert(R.registers.length === 1 && !R.btn(), 'rejection');
});

await check('3 controlled with no registration (the kill switch unregistered it): register() is not called', async () => {
  const P = makePage({ controller: true, regExists: false }); await P.boot(); await P.advance(10000);
  assert(P.registers.length === 0, 'revived the registration: registers ' + P.registers.length);
});

// ---- 4. when the notice shows ----
await check('4 a first install shows no notice; waiting + controller at register shows it; updatefound -> installed shows it', async () => {
  const A = makePage(); await A.boot(); await A.advance(3000);
  A.reg.installing = fakeWorker(); A.reg.installing.state = 'installing'; A.reg.emitReg('updatefound');
  A.reg.installing.state = 'installed'; A.reg.installing.emit('statechange'); await flush();
  assert(!A.btn(), 'first install showed the notice');
  const B = makePage({ controller: true, waiting: true }); B.ctx.navigator.userActivation.hasBeenActive = true;
  await B.boot(); await B.advance(3000);
  assert(B.btn() && B.btn().hidden === false, 'waiting at register');
  const C = makePage({ controller: true }); await C.boot(); await C.advance(3000);
  assert(!C.btn(), 'notice without an update');
  const w = fakeWorker(); w.state = 'installing'; C.reg.installing = w; C.reg.emitReg('updatefound');
  w.state = 'installed'; w.emit('statechange'); await flush();
  assert(C.btn() && C.btn().hidden === false && C.btn().textContent === 'NEW VERSION READY · TAP TO RELOAD', 'updatefound');
});

// ---- 5. runLive gate ----
await check('5 the notice hides while runLive() and shows when not; a throwing runLive hides it', async () => {
  const P = makePage({ controller: true, waiting: true, userActivation: { hasBeenActive: true } });
  await P.boot(); await P.advance(3000);
  assert(P.btn().hidden === false, 'shown');
  P.live = true; await P.advance(500); assert(P.btn().hidden === true, 'not hidden in a run');
  P.live = false; await P.advance(500); assert(P.btn().hidden === false, 'not back');
  P.hooks.runLive = () => { throw new Error('x'); }; await P.advance(500);
  assert(P.btn().hidden === true, 'throwing runLive shows it');
});

// ---- 6. the tap ----
const tapPage = async () => {
  const P = makePage({ controller: true, waiting: true, userActivation: { hasBeenActive: true } });
  await P.boot(); await P.advance(3000);
  P.btn().click(); await flush();
  return P;
};
await check('6 tap with a waiting worker: save, then postMessage(skipWaiting), no reload yet', async () => {
  const P = await tapPage();
  assert(JSON.stringify(P.order) === '["save","post:skipWaiting"]', JSON.stringify(P.order));
  assert(P.reloads === 0 && P.btn().textContent === 'RELOADING…', 'reloaded early');
});
await check('6 then controllerchange: exactly one reload', async () => {
  const P = await tapPage();
  P.controllerChange(); await P.advance(5000);
  assert(P.reloads === 1, 'reloads ' + P.reloads);
});
await check('6 no controllerchange: one reload after 3 s', async () => {
  const P = await tapPage();
  await P.advance(2999); assert(P.reloads === 0, 'early');
  await P.advance(1); assert(P.reloads === 1, 'reloads ' + P.reloads);
  await P.advance(5000); assert(P.reloads === 1, 'twice');
});
await check('6 no waiting worker (another tab took it): reload at once', async () => {
  const P = makePage({ controller: true, userActivation: { hasBeenActive: true } });
  await P.boot(); await P.advance(3000);
  P.controllerChange(); await flush();       // another tab's tap: the notice
  assert(P.btn() && P.reloads === 0, 'no notice after a foreign controller change');
  P.btn().click(); await flush();
  assert(P.reloads === 1 && P.saves >= 1, 'reloads ' + P.reloads);
});

// ---- 7. G1 ----
await check('7 G1: a controllerchange before the first frame reloads once, shows UPDATING…, no save', async () => {
  const P = makePage({ controller: true });
  P.controllerChange(); P.controllerChange(); await flush();
  assert(P.reloads === 1 && P.box.textContent === 'UPDATING…' && P.saves === 0, 'reloads ' + P.reloads + ' ' + P.box.textContent);
});
await check('7 after boot, a change the page did not ask for shows the notice and does not reload', async () => {
  const P = makePage({ controller: true, userActivation: { hasBeenActive: true } });
  await P.boot(); await P.advance(4000);
  P.controllerChange(); await P.advance(5000);
  assert(P.reloads === 0 && P.btn() && P.btn().hidden === false, 'reloaded or no notice');
});

// ---- 8. auto-apply ----
const autoOk = { controller: true, waiting: true, userActivation: { hasBeenActive: false } };
await check('8 auto-apply runs when all hold: posts skipWaiting, UPDATING…, no register yet', async () => {
  const P = makePage(autoOk); await P.boot();
  assert(P.reg.waiting.posted.join() === 'skipWaiting' && P.box.textContent === 'UPDATING…' && P.box.hidden === false, 'did not run');
  assert(P.registers.length === 0, 'registered');
  P.controllerChange(); await flush();
  assert(P.reloads === 1, 'reloads ' + P.reloads);
});
await check('8 each condition alone blocks it (controller, waiting, activation, fresh, sessionStorage, guard, no userActivation)', async () => {
  const cases = {
    'no controller': { ...autoOk, controller: false, regExists: true },
    'nothing waiting': { ...autoOk, waiting: false },
    'touched': { ...autoOk, userActivation: { hasBeenActive: true } },
    'sessionStorage throws': { ...autoOk, session: 'throw' },
    'guard within 2 min': { ...autoOk, guardAt: 1e12 - 60000 },
    'no userActivation API': { ...autoOk, userActivation: false },
  };
  for (const [label, o] of Object.entries(cases)) {
    const P = makePage(o); await P.boot();
    assert(!(P.reg.waiting && P.reg.waiting.posted.length), label + ': auto-applied');
  }
  const F = makePage(autoOk); F.isFresh = false; await F.boot();
  assert(F.reg.waiting.posted.length === 0, 'not fresh: auto-applied');
  const G = makePage({ ...autoOk, guardAt: 1e12 - 121000 }); await G.boot();
  assert(G.reg.waiting.posted.length === 1, 'an old guard blocked it');
});
await check('8 no controllerchange within 3 s: the box hides, the notice shows, registration follows', async () => {
  const P = makePage(autoOk); await P.boot();
  await P.advance(3000);
  assert(P.box.hidden === true && P.btn() && P.btn().hidden === false && P.reloads === 0, 'state after 3 s');
  await P.advance(3000);
  assert(P.registers.length === 1, 'registers ' + P.registers.length);
});

await check('8 a run goes live between the post and controllerchange: no reload; the notice comes back after the run', async () => {
  const P = makePage(autoOk); await P.boot();
  assert(P.reg.waiting.posted.join() === 'skipWaiting', 'did not auto-apply');
  P.live = true;
  P.controllerChange(); await P.advance(10000);
  assert(P.reloads === 0, 'reloaded a live run: reloads ' + P.reloads);
  assert(P.box.hidden === true && P.btn() && P.btn().hidden === true, 'notice shown in a run or UPDATING… left up');
  P.live = false; await P.advance(500);
  assert(P.btn().hidden === false && P.btn().disabled === false && P.btn().textContent === 'NEW VERSION READY · TAP TO RELOAD', 'notice not back');
  assert(P.document.body.classList.contains('sw-notice'), 'body.sw-notice not set while the notice shows');
  P.live = true; await P.advance(500);
  assert(!P.document.body.classList.contains('sw-notice'), 'body.sw-notice left on in a run');
});
await check('8 a tap, then a run goes live before the update lands: neither controllerchange nor the 3 s timer reloads', async () => {
  const P = await tapPage();
  P.live = true; await P.advance(3000);
  assert(P.reloads === 0, 'timer reloaded a run');
  P.controllerChange(); await P.advance(3000);
  assert(P.reloads === 0, 'controllerchange reloaded a run');
  assert(P.btn().disabled === false && P.btn().hidden === true, 'the notice did not reset');
  P.live = false; await P.advance(500);
  P.btn().click(); await flush(); await P.advance(3000);
  assert(P.reloads === 1, 'the second tap did not reload: ' + P.reloads);
});

// ---- 9. the update check ----
await check('9 update() hourly only while visible; on becoming visible only after 10 min; failures swallowed', async () => {
  const P = makePage({ controller: true }); await P.boot(); await P.advance(3000);
  await P.advance(3600000); assert(P.updates === 1, 'hourly ' + P.updates);
  P.setHidden(true); await P.advance(3600000); assert(P.updates === 1, 'checked while hidden');
  P.setHidden(false); await flush(); assert(P.updates === 2, 'not checked on becoming visible after > 10 min');
  P.setHidden(true); await P.advance(60000); P.setHidden(false); await flush();
  assert(P.updates === 2, 'checked again within 10 min');
  for (const f of ['throw', true]) {
    const Q = makePage({ controller: true, updateFails: f }); await Q.boot(); await Q.advance(3000 + 3600000);
    assert(Q.updates === 1, 'failing update');
  }
});

// ---- 10. failure screen ----
await check('10 a SCRIPT error before boot shows the failure text with the tap armed; IMG and LINK do not', async () => {
  const P = makePage();
  P.error({ target: { tagName: 'IMG' } }); P.error({ target: { tagName: 'LINK' } });
  assert(P.box.textContent === 'LOADING…' && !P.box.onclick, 'IMG/LINK failed the page');
  P.error(OWN);
  assert(P.box.textContent === FAIL_TEXT && typeof P.box.onclick === 'function' && P.box.className === 'tap', P.box.textContent);
});
await check('10 an error from /src/ fails; an error after boot is ignored', async () => {
  const P = makePage(); P.error({ filename: 'https://sk408.github.io/hordes/src/main.js', message: 'x' });
  assert(P.box.textContent === FAIL_TEXT, 'src error');
  const Q = makePage(); await Q.boot(); Q.error(OWN);
  assert(Q.box.hidden === true && Q.box.textContent !== FAIL_TEXT, 'after boot');
  const R = makePage(); R.error({ filename: 'https://x.test/other.js' }); assert(R.box.textContent === 'LOADING…', 'foreign error');
});
await check('10 a foreign script or an extension error does not fail the page', async () => {
  const P = makePage();
  P.error({ target: { tagName: 'SCRIPT', src: 'https://ads.example/tag.js' } });
  P.error({ target: { tagName: 'SCRIPT', src: 'chrome-extension://abc/src/inpage.js' } });
  P.error({ target: { tagName: 'SCRIPT', src: 'https://sk408.github.io/other/src/main.js' } });
  P.error({ filename: 'chrome-extension://abc/src/inpage.js', message: 'x' });
  P.error({ filename: 'https://evil.test/hordes/src/main.js', message: 'x' });
  assert(P.box.textContent === 'LOADING…' && !P.box.onclick, 'failed: ' + P.box.textContent);
});
await check('10 20 s visible: STILL LOADING…; 90 s visible: failure; hidden time not counted; offline text; a late boot hides', async () => {
  const P = makePage();
  P.setHidden(true); await P.advance(200000); assert(P.box.textContent === 'LOADING…', 'hidden time counted');
  P.setHidden(false); await P.advance(20000); assert(P.box.textContent === 'STILL LOADING…', P.box.textContent);
  await P.advance(70000); assert(P.box.textContent === FAIL_TEXT, P.box.textContent);
  const O = makePage({ onLine: false }); await O.advance(90000);
  assert(O.box.textContent === OFFLINE_TEXT, O.box.textContent);
  const C = makePage({ onLine: false, controller: true }); await C.advance(90000);
  assert(C.box.textContent === OFFLINE_TEXT, 'controlled offline: ' + C.box.textContent);
  await P.boot(); assert(P.box.hidden === true, 'a late boot left the box');
});

// ---- 11. the recovery tap ----
await check('11 recovery: waiting + controller posts skipWaiting (reload follows)', async () => {
  const P = makePage({ controller: true, waiting: true });
  P.error(OWN); P.box.click(); await flush();
  assert(P.reg.waiting.posted.join() === 'skipWaiting' && P.box.textContent === 'RELOADING…', 'not posted');
  P.controllerChange(); await flush();
  assert(P.reloads === 1, 'reloads ' + P.reloads);
});
await check('11 recovery: controlled, nothing waiting: unregister, delete only hordes:<scope>: caches, reload', async () => {
  const P = makePage({ controller: true });
  P.error(OWN); P.box.click(); await flush();
  assert(P.unregisters === 1 && P.reloads === 1, 'unregister ' + P.unregisters + ' reloads ' + P.reloads);
  assert(JSON.stringify(P.deleted.sort()) === JSON.stringify(['hordes:/hordes/:abc', 'hordes:/hordes/:music']), JSON.stringify(P.deleted));
});
await check('11 recovery: uncontrolled simply reloads', async () => {
  const P = makePage({ regExists: true });
  P.error(OWN); P.box.click(); await flush();
  assert(P.reloads === 1 && P.unregisters === 0 && P.deleted.length === 0, 'reloads ' + P.reloads);
  const Q = makePage({ sw: false });
  Q.error(OWN); Q.box.click(); await flush();
  assert(Q.reloads === 1, 'no sw: reloads ' + Q.reloads);
});

await check('11 recovery offline (controlled): only a reload, the offline copy stays', async () => {
  const P = makePage({ controller: true, onLine: false });
  P.error(OWN);
  assert(P.box.textContent === OFFLINE_TEXT, 'text ' + P.box.textContent);
  P.box.click(); await flush();
  assert(P.reloads === 1 && P.unregisters === 0 && P.deleted.length === 0, 'unregister ' + P.unregisters + ' deleted ' + JSON.stringify(P.deleted));
});

// ---- 12. wiring with the real game ----
{
  const calls = [];
  globalThis.hordesBooted = (h) => { calls.push(h); };
  const { boot } = await import('./_harness.mjs');
  const g = await boot();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  await check('12 before the first pump hordesBooted has not run', async () => {
    await tick(); assert(calls.length === 0, 'called ' + calls.length);
  });
  const rafReal = globalThis.requestAnimationFrame;
  let rafCalls = 0;
  globalThis.requestAnimationFrame = (cb) => { rafCalls++; return rafReal(cb); };
  await check('12 after pump(1) and one macrotask: called once with { runLive, fresh, save }', async () => {
    g.pump(1); await tick();
    assert(calls.length === 1, 'called ' + calls.length);
    const h = calls[0];
    assert(['runLive', 'fresh', 'save'].every((k) => typeof h[k] === 'function'), 'hooks ' + Object.keys(h));
  });
  await check('12 at boot fresh() is true and runLive() false; in a run runLive() true and fresh() false', async () => {
    const h = calls[0];
    assert(h.fresh() === true && h.runLive() === false, 'boot: fresh ' + h.fresh() + ' live ' + h.runLive() + ' mode ' + g.state.mode);
    g.T.startRun(); g.pump(2);
    assert(h.runLive() === true && h.fresh() === false, 'run: mode ' + g.state.mode);
    assert(typeof h.save() === 'boolean', 'save');
  });
  await check('12 one rAF per frame (no second rAF): each pump queues exactly one callback', async () => {
    rafCalls = 0; g.pump(1); assert(rafCalls === 1, 'rAF calls in one frame: ' + rafCalls);
    rafCalls = 0; g.pump(5); assert(rafCalls === 5, 'rAF calls in five frames: ' + rafCalls);
    await tick(); assert(calls.length === 1, 'reported again');
  });
  globalThis.requestAnimationFrame = rafReal;
  await check('12 a second boot in the same process reports once again', async () => {
    const g2 = await boot({ variant: 'swboot2' });
    g2.pump(3); await tick(); await tick();
    assert(calls.length === 2, 'calls ' + calls.length);
  });
}

console.log('test_boot_guard: ' + passed + ' checks passed');
process.exit(0);
