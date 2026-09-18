// HORDES — G31 PILOT PREFERENCE PERSISTENCE (owner-relayed player request,
// 2026-09-16, verbatim: "The players want the selections they made for auto
// and manual to persist between runs.").
//
// Drives the REAL main.js loop (the test_g26_loadout.mjs stub-DOM pattern —
// same harness as test_auto_draft.mjs) against the REAL prefStorage seam: the
// stored value is written into the same localStorage fake main.js bound at
// import, and every case re-runs startRun() — exactly what a reload does.
// Contracts pinned here:
//   - stored 'MANUAL' -> the run starts MANUAL and the MANUAL CONTROLLER is
//     bound (identity: its .input IS the __TEST.pilotInput object);
//   - stored 'AUTO_MOVE' -> AUTO_MOVE;
//   - nothing stored -> AUTO_ALL (the fresh-player default);
//   - stored 'AUTO' (the legacy persisted name) -> AUTO_ALL;
//   - stored garbage -> AUTO_ALL;
//   - stance 'GREEDY' round-trips into the LIVE controller at run start (and
//     carries across a swap — swapPilotMode inherits it);
//   - stored garbage stance -> BALANCED;
//   - applying the preference twice is a NO-OP (mode unchanged, controller
//     identity unchanged, NO extra toast);
//   - cycling the doctrine key WRITES the stance key;
//   - the SETTINGS screen carries a PILOT row that cycles and persists.
// Run: node test/test_pilot_pref.mjs
import assert from 'node:assert/strict';
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_g26_loadout.mjs / test_auto_draft.mjs pattern) -----------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
const controls = new WeakMap();
const controlFor = (tip, cls) => {
  const m = controls.get(tip) || {};
  if (!m[cls]) { const a = mk(); a.className = cls; m[cls] = a; controls.set(tip, m); }
  return m[cls];
};
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: {}, children: [], parentNode: null, onclick: null,
    _html: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((handlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
    getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
    querySelector(sel) {
      if (sel.startsWith('.tour-') && el._html.includes(sel.slice(1))) return controlFor(el, sel.slice(1));
      return null;
    },
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    getContext: () => fakeCtx,
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; controls.delete(el); },
  });
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = mk()),
  createElement: () => mk(),
  body: mk(),
  addEventListener() {},
};
let keyHandler = null, keyUpHandler = null;
globalThis.window = { addEventListener: (ev, cb) => {
  if (ev === 'keydown') keyHandler = cb;
  if (ev === 'keyup') keyUpHandler = cb;
}, innerWidth: 480, innerHeight: 300 };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
// Every tour flag preseeded (coaches stay out of the way) + onboarded. The
// pilot/stance keys are deliberately ABSENT: the boot apply must be a silent
// no-op defaulting to AUTO_ALL / BALANCED.
const ls = new Map([['hordes_onboarded', '1'],
  // FIRST-RUN PROLOGUE neutralization (the _harness.mjs convention,
  // 2026-09-18): this file imports main.js directly on a fake localStorage,
  // so without this stamp every startRun below arms the prologue — and its
  // all-buttons-disabled lockout would swallow the very key/act each check
  // drives ('g' stance cycle, the PILOT row, ...). These tests want it out
  // of the way.
  ['hordes_profile_v1', JSON.stringify({ version: 8, achievements: { totals: { runs: 1 } } })],
  ...Object.values(TOUR_KEYS).map(k => [k, '1'])]);
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const frame = () => {
  now += 1000 / 60;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(now);
};
const tick = (s) => { for (let i = 0, n = Math.round(s * 60); i < n; i++) frame(); };

const prefs = T.pilotPrefs;
const isManualBound = () => T.controller.input === T.pilotInput;
const cardsOf = () => [...elements['ov-cards'].children];
const cardNamed = (n) => cardsOf().find(c => (c._html || '').includes('>' + n + '<'));

// Boot with NOTHING stored: the default, applied silently.
ok('boot with nothing stored: AUTO_ALL, no boot toast', st.pilotMode === 'AUTO_ALL' && !isManualBound() && st.toasts.length === 0, [st.pilotMode, st.toasts.length]);

// Skip intro -> title -> run (the test_auto_draft boot path).
keyHandler({ key: 'x' });
tick(1);
T.startRun();
tick(2);
ok('a first run is live', st.mode === 'playing', st.mode);

// ---- 1. nothing stored -> AUTO_ALL ------------------------------------------
ls.delete(prefs.KEY_PILOT);
T.startRun();
ok('nothing stored: the run starts AUTO_ALL on the auto controller',
  st.pilotMode === 'AUTO_ALL' && !isManualBound(), st.pilotMode);

// ---- 2. stored MANUAL -> MANUAL + the manual controller ----------------------
ls.set(prefs.KEY_PILOT, 'MANUAL');
T.startRun();
ok('stored MANUAL: the run starts MANUAL', st.pilotMode === 'MANUAL', st.pilotMode);
ok('stored MANUAL: the MANUAL controller is bound (its input IS pilotInput)', isManualBound());

// ---- 3. stored AUTO_MOVE -> AUTO_MOVE ----------------------------------------
ls.set(prefs.KEY_PILOT, 'AUTO_MOVE');
T.startRun();
ok('stored AUTO_MOVE: the run starts AUTO_MOVE on the auto controller',
  st.pilotMode === 'AUTO_MOVE' && !isManualBound(), st.pilotMode);

// ---- 4. the legacy 'AUTO' name -> AUTO_ALL ------------------------------------
ls.set(prefs.KEY_PILOT, 'AUTO');
T.startRun();
ok("stored legacy 'AUTO': the run starts AUTO_ALL (normalizePilotMode)", st.pilotMode === 'AUTO_ALL', st.pilotMode);

// ---- 5. garbage -> AUTO_ALL ----------------------------------------------------
ls.set(prefs.KEY_PILOT, 'NOT_A_PILOT_MODE');
T.startRun();
ok('stored garbage: the run starts AUTO_ALL (the fresh-player default)', st.pilotMode === 'AUTO_ALL' && !isManualBound(), st.pilotMode);

// ---- 6. stance round-trip at run start ----------------------------------------
ls.set(prefs.KEY_PILOT, 'MANUAL');
ls.set(prefs.KEY_STANCE, 'GREEDY');
T.startRun();
ok('stored GREEDY: the live controller carries it at run start', T.controller.stance === 'GREEDY', T.controller.stance);
T.setPilotMode('AUTO_ALL');
ok('the stance carries across the swap (both controllers were stamped)',
  T.controller.stance === 'GREEDY', T.controller.stance);

// ---- 7. garbage stance -> BALANCED ---------------------------------------------
ls.set(prefs.KEY_STANCE, 'WHAT');
T.startRun();
ok('stored garbage stance: BALANCED', T.controller.stance === 'BALANCED', T.controller.stance);

// ---- 8. double apply is a no-op ------------------------------------------------
ls.set(prefs.KEY_PILOT, 'MANUAL');
ls.set(prefs.KEY_STANCE, 'SAFE');
T.startRun();                       // first apply: MANUAL + SAFE
const ctl = T.controller;
const toastCount = st.toasts.length;
T.startRun();                       // second apply: same pref
ok('applying the preference twice: mode unchanged, controller identity unchanged, NO extra toast',
  st.pilotMode === 'MANUAL' && T.controller === ctl && st.toasts.length === toastCount,
  [st.pilotMode, st.toasts.length - toastCount]);
ok('stance re-apply: still SAFE, no churn', T.controller.stance === 'SAFE', T.controller.stance);

// ---- 9. the doctrine key WRITES the stance key ---------------------------------
ls.delete(prefs.KEY_STANCE);
T.setPilotMode('AUTO_ALL');         // controller.stance is whatever it is now
const before = T.controller.stance;
keyHandler({ key: 'g' });           // the doctrine cycle key (smoke's idiom)
const after = T.controller.stance;
ok('the doctrine key cycles the stance', after !== before && prefs.loadStance() === after,
  [before, after, ls.get(prefs.KEY_STANCE)]);
ok('the stance key was WRITTEN by the cycle', ls.get(prefs.KEY_STANCE) === after);

// ---- 10. the SETTINGS screen carries a PILOT row that cycles + persists -------
T.startRun();
st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
T.openSettings();
ok('the in-run SETTINGS screen opens', st.mode === 'settings', st.mode);
const pilotCard = cardNamed('PILOT');
ok('the SETTINGS screen has a PILOT row', !!pilotCard, cardsOf().map(c => (c._html || '').slice(0, 30)));
ok('the PILOT row names the live mode', /AUTO ALL/.test(pilotCard._html), pilotCard._html);
const modeBefore = st.pilotMode;
pilotCard.click();                  // cycles and re-renders the screen
ok('the PILOT row cycles the mode through togglePilotMode',
  st.pilotMode !== modeBefore && prefs.loadPilot() === st.pilotMode,
  [modeBefore, st.pilotMode, ls.get(prefs.KEY_PILOT)]);
ok('the cycled choice was PERSISTED', ls.get(prefs.KEY_PILOT) === st.pilotMode);
T.closeSettings();

// A run started after all of this still honours the store (end-to-end).
T.startRun();
ok('end-to-end: the next run starts in the persisted mode', st.pilotMode === prefs.loadPilot(), [st.pilotMode, ls.get(prefs.KEY_PILOT)]);

console.log(`test_pilot_pref: all ${passed} checks passed`);
