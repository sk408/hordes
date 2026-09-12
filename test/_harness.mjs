// HORDES — shared headless harness for the WAVE-26 test files.
//
// NOT a test file: the runner globs test/test_*.mjs + test/smoke.mjs, so this
// helper is never executed on its own. It installs the same stub DOM/window/
// storage environment test/smoke.mjs uses (kept in sync deliberately) and then
// imports the REAL src/main.js, returning the module's __TEST seam plus a
// frame pump.
//
// The environment is installed by boot(), NOT at module-eval time, so a test
// can import this module first and still have the globals in place before
// main.js is imported (static imports are hoisted).
export const dtMs = 1000 / 60;

export async function boot(opts = {}) {
  const noop = () => {};

  // ---- canvas 2d context recorder (rects + texts, save/restore depth) ----
  const rec = { on: false, depth: 0, rects: [], texts: [] };
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'fillStyle' || prop === 'globalAlpha' || prop === 'font') return undefined;
      if (prop === 'save') return () => { rec.depth++; };
      if (prop === 'restore') return () => { rec.depth = Math.max(0, rec.depth - 1); };
      if (prop === 'fillRect') {
        return (x, y, w, h) => {
          if (rec.on) rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length });
        };
      }
      if (prop === 'strokeRect') return noop;
      if (prop === 'fillText') {
        return (txt, x, y) => {
          if (rec.on) rec.texts.push({ txt: String(txt), x, y, d: rec.depth, n: rec.rects.length });
        };
      }
      return typeof prop === 'string' ? noop : undefined;
    },
    set() { return true; },
  });

  const el = () => {
    const e = {
      textContent: '', style: {}, children: [], onclick: null,
      click() { if (this.onclick) this.onclick(); },
      addEventListener(ev, cb) { (this._ev ?? (this._ev = {}))[ev] = cb; },
      removeEventListener() {},
      appendChild(c) { this.children.push(c); return c; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 }; },
      querySelector() { return null; },
      setAttribute() {}, focus() {},
    };
    const cls = new Set();
    e.classList = {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
      toggle: (c, on) => { const want = on === undefined ? !cls.has(c) : !!on; want ? cls.add(c) : cls.delete(c); },
    };
    Object.defineProperty(e, 'innerHTML', {
      get() { return this._html ?? ''; },
      set(v) { this._html = String(v); if (v === '') this.children.length = 0; },
    });
    return e;
  };

  const canvas = {
    width: 0, height: 0,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 }),
  };

  const elements = {};
  globalThis.document = {
    getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? canvas : el()),
    createElement: () => el(),
    addEventListener: noop, removeEventListener: noop,
    body: el(),
  };

  // Event handlers the game registers (routed by type, smoke.mjs precedent).
  const handlers = {};
  globalThis.window = {
    addEventListener: (ev, cb) => { handlers[ev] = cb; },
    removeEventListener: noop,
    innerWidth: 480, innerHeight: 300,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  };

  let now = 0;
  globalThis.performance = { now: () => now };
  const raf = [];
  globalThis.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
  globalThis.cancelAnimationFrame = noop;
  globalThis.location = { reload: noop };
  globalThis.devicePixelRatio = 1;

  const store = new Map(opts.storage || []);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };

  // Preseed the first-run TOUR flags (smoke.mjs precedent): a stage-2 coachmark
  // pauses the sim and the tour engine holds a setInterval open, which would
  // keep Node's event loop alive after the checks printed. The tour has its own
  // test file; these tests want it out of the way.
  try {
    const { TOUR_KEYS } = await import('../src/tour.js');
    for (const k of Object.values(TOUR_KEYS)) store.set(k, '1');
  } catch { /* tour module always present, defensive */ }

  const mainMod = await import('../src/main.js');

  // Pump n real frames. frameMs lets a test choose the refresh rate.
  const frameMs = opts.frameMs || dtMs;
  function pump(n = 1, onFrame) {
    for (let i = 0; i < n; i++) {
      now += frameMs;
      const cb = raf.shift();
      if (!cb) throw new Error('rAF queue drained at frame ' + i);
      cb(now);
      if (onFrame) onFrame(i);
    }
  }

  return {
    mod: mainMod,
    T: mainMod.__TEST,
    state: mainMod.__TEST.state,
    elements,
    rec,
    ctx,
    pump,
    handlers,
    key: (name, arg) => { if (handlers[name]) handlers[name](arg); },
    storage: store,
    setFrameMs: (ms) => { opts.frameMs = ms; },
  };
}

// Tiny assertion helper with a pass counter, matching the house test style.
export function suite(name) {
  let passed = 0;
  const check = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.error('  FAIL ' + label);
      throw err;
    }
    passed++;
    console.log('  ok - ' + label);
  };
  return { name, check, done: () => console.log(name + ': ' + passed + ' checks passed') };
}
