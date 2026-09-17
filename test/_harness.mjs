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
      // N6 (radar plate cache): the static plate blits per frame as ONE
      // drawImage — recorded as a rect op so ink-count/box-containment checks
      // still see it (the 3/5/9-argument canvas forms map to their dest box).
      if (prop === 'drawImage') {
        return (...a) => {
          if (!rec.on) return;
          const img = a[0];
          let x = 0, y = 0, w = 0, h = 0;
          if (a.length >= 9) { x = a[5]; y = a[6]; w = a[7]; h = a[8]; }
          else if (a.length >= 5) { x = a[1]; y = a[2]; w = a[3]; h = a[4]; }
          else { x = a[1]; y = a[2]; w = (img && img.width) || 0; h = (img && img.height) || 0; }
          rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length });
        };
      }
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
      textContent: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
      click() { if (this.onclick) this.onclick(); },
      addEventListener(ev, cb) { (this._ev ?? (this._ev = {}))[ev] = cb; },
      removeEventListener() {},
      appendChild(c) { c.parentNode = e; this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; },
      remove() { if (e.parentNode) e.parentNode.removeChild(e); },
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
    // G15: capture the canvas pointer handlers main.js registers behind
    // `if (canvas.addEventListener)` — the tap-skip path needs the REAL
    // pointerdown listener, same capture shape as el() below.
    addEventListener(ev, cb) { (this._ev ?? (this._ev = {}))[ev] = cb; },
    removeEventListener() {},
  };
  // G13: createElement('canvas') must return a canvas-shaped stub (the
  // character selector builds live portrait canvases in the DOM overlay);
  // every other tag stays the generic element.
  const canvasEl = () => ({
    width: 0, height: 0,
    style: {},
    className: '',
    getContext: () => ctx,
    getBoundingClientRect() { return { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 }; },
  });

  const elements = {};
  globalThis.document = {
    getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? canvas : el()),
    createElement: (tag) => (tag === 'canvas' ? canvasEl() : el()),
    addEventListener: noop, removeEventListener: noop,
    body: el(),
  };
  // N6: the renderer's offscreen plate cache borrows a scratch canvas from the
  // MAIN canvas's ownerDocument (Node has no OffscreenCanvas) — same shape a
  // real browser's canvas carries.
  canvas.ownerDocument = globalThis.document;

  // Event handlers the game registers (routed by type, smoke.mjs precedent).
  const handlers = {};
  // DEVICE surface (first-class device input, 2026-09-16): opts.device sets
  // the REAL browser tells TOGETHER, before main.js loads, so the game
  // derives its own touch class — no test may set the layer's class by hand
  // afterwards (a stub that sets derived state is how device bugs survive
  // green suites). Three profiles:
  //   'touch'       ontouchstart + maxTouchPoints 5 + coarse pointer  (a phone)
  //   'coarse-only' coarse pointer, NO touch events, maxTouchPoints 0 (the
  //                 residual class: pads revealed by the CSS coarse media
  //                 while the JS used to think keyboard)
  //   'desktop'     fine pointer, no touch tells                    (default)
  const device = opts.device || 'desktop';
  const touchDevice = device === 'touch';
  const coarse = device !== 'desktop';
  if (device !== 'desktop') {
    // Node 22 ships a getter-only navigator global — define over it.
    try { delete globalThis.navigator; } catch { /* not defined yet */ }
    Object.defineProperty(globalThis, 'navigator',
      { value: { maxTouchPoints: touchDevice ? 5 : 0, userAgent: 'harness ' + device + ' device' },
        configurable: true });
  }
  globalThis.window = {
    addEventListener: (ev, cb) => { handlers[ev] = cb; },
    removeEventListener: noop,
    innerWidth: 480, innerHeight: 300,
    ...(touchDevice ? { ontouchstart: {} } : {}),
    matchMedia: (q) => ({ matches: coarse && /coarse|hover:\s*none/.test(String(q)),
      addEventListener: noop, addListener: noop }),
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

  // opts.variant busts the ESM cache so ONE test file can boot the game twice
  // (e.g. a desktop arm and a touch-device arm) — each boot re-evaluates
  // main.js against its own globals; the pure data modules stay shared.
  const mainMod = await import('../src/main.js' + (opts.variant ? '?v=' + opts.variant : ''));

  // Pump n real frames. opts.frameMs lets a test choose the refresh rate;
  // it is read PER FRAME so setFrameMs() below actually takes effect (it used
  // to be captured once at boot, which made the seam a no-op).
  function pump(n = 1, onFrame) {
    for (let i = 0; i < n; i++) {
      now += (opts.frameMs || dtMs);
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
