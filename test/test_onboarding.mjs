// ONBOARDING REWORK (owner-approved 2026-09-16) — the engine + wiring contract.
//
// The 25-card tour is deleted (7 title cards, 4 intermission cards, 10
// timer/event-scheduled in-run cards — galaxy.click feedback: "tons of
// information thrown at you without context", "skipped like 8 tutorial blurbs
// because I was moving manually"). Its replacement is 3 IN-CONTEXT touches +
// OBJECT TAGS, and this file pins the SIX INVARIANTS the dispatch demands:
//   1. a hint NEVER pauses the sim (state.time advances while one is visible);
//   2. a hint NEVER captures input (pointer-events:none, zero listeners, no
//      dismiss controls — movement keys and joystick drags steer straight
//      through it, a canvas tap reaches the canvas);
//   3. auto-fade after ~5-6s; at most ONE hint visible; later triggers QUEUE;
//   4. TEACH-UNTIL-DEMONSTRATED: once per run, retires the moment the taught
//      action happens (move ~3s / portal entry), gives up after 3 runs;
//   5. anchored to the game container, clamped fully inside it, never
//      overlapping the joystick or the touch buttons;
//   6. NO EMOJIS anywhere (the off-screen arrow is ASCII).
// Part A drives the PURE engine (src/onboarding.js) with a fake doc; Part B
// drives the REAL main.js frame loop through the onboarding test seam.
// Run: node test/test_onboarding.mjs
import assert from 'node:assert/strict';
import {
  HintStrip, ObjectTags, makeHintStore, layoutStrip,
  HINT_FADE_S, TAG_FADE_S, GIVE_UP_RUNS, HINT_IDS,
} from '../src/onboarding.js';
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}
// Invariant 6: NO EMOJIS anywhere (owner rule). Em dashes / middle dots are
// the game's established UI punctuation, not emoji; the banned set is the
// emoji blocks AND the arrow codepoints (the off-screen arrow must be ASCII).
const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}]/u;
const ASCII = /^[\x20-\x7E]*$/;   // the pure-engine texts are plain ASCII

// ---- Part A: the PURE engine ---------------------------------------------------
const handlers = new WeakMap();
const mkEl = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null,
    _text: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
    set textContent(v) { el._text = String(v); }, get textContent() { return el._text; },
  };
  return el;
};
const mkDoc = () => ({ createElement: () => mkEl(), body: mkEl() });
const CONT = { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 };

// A1. layoutStrip (invariant 5): the strip sits inside the container and
// never on the joystick / touch buttons.
{
  const w = 280, h = 24;
  const free = layoutStrip(CONT, w, h);
  ok('A: default placement is top-centre, fully inside the container',
    free.top === 6 && free.left === (480 - w) / 2, free);
  // The joystick pad owns bottom-centre: the strip must move off it.
  const joy = { left: 190, top: 210, right: 290, bottom: 300 };
  const avoidJoy = layoutStrip(CONT, w, h, [joy]);
  ok('A: the strip never overlaps the joystick rect (top-centre wins)',
    avoidJoy.top === 6, avoidJoy);
  // Both top and bottom blocked (HUD bar + touch buttons): mid-centre, still
  // clear of everything and inside the container.
  const hud = { left: 0, top: 0, right: 480, bottom: 60 };
  const mid = layoutStrip(CONT, w, h, [joy, hud]);
  ok('A: with top and bottom blocked the strip takes the clear mid candidate',
    mid.top === (300 - h) / 2, mid);
  // A tiny 480x300 EMBED region can never clip it (tour lesson applied).
  const tiny = { left: 0, top: 280, right: 480, bottom: 580, width: 480, height: 300 };
  const inTiny = layoutStrip(tiny, w, h, [{ left: 0, top: 280, right: 480, bottom: 340 }]);
  ok('A: a 480x300 embed never clips the strip (clamped 4px inside)',
    inTiny.top >= 284 && inTiny.top + h <= 576, inTiny);
}

// A2. HintStrip (invariants 2, 3, 6): queued, auto-fading, inert by construction.
{
  const doc = mkDoc();
  const strip = new HintStrip({ anchor: () => CONT, mount: doc.body, doc });
  strip.show('a', 'first line');
  strip.show('b', 'second line');
  strip.update(0.016);
  const el = doc.body.children[0];
  ok('A: the strip mounted with the first hint text', el && el._text === 'first line', el && el._text);
  ok('A: pointer-events:none BY CONSTRUCTION (invariant 2)',
    /pointer-events:\s*none/.test(el.style.cssText), el.style.cssText);
  ok('A: the strip registered ZERO listeners (invariant 2)', !handlers.has(el));
  ok('A: the strip has NO dismiss controls — nothing to close by accident (invariant 2)',
    el.children.length === 0);
  ok('A: hint text is ASCII (invariant 6)', ASCII.test(el._text));
  ok('A: at most ONE strip element exists while two hints are pending (invariant 3)',
    doc.body.children.filter(c => c._text !== undefined || c.id === 'hint-strip').length === 1);
  // A duplicate show of the CURRENT id is dropped, not re-queued.
  strip.show('a', 'first line again');
  strip.update(0.016);
  // Fade: after HINT_FADE_S the current leaves and the QUEUED one takes over.
  strip.update(HINT_FADE_S);
  ok('A: the first hint auto-faded at HINT_FADE_S (invariant 3)',
    !doc.body.children.includes(el));
  strip.update(0.016);
  const el2 = doc.body.children.find(c => c !== el);
  ok('A: the queued hint showed AFTER the current one faded (queue, never stack)',
    el2 && el2._text === 'second line', el2 && el2._text);
  // retire: out of the queue AND off the screen mid-display.
  strip.retire('b');
  ok('A: retire takes a displayed hint off the screen immediately (invariant 4)',
    !doc.body.children.includes(el2));
  // A retired-before-display id never mounts.
  strip.show('c', 'third'); strip.retire('c'); strip.update(0.016);
  ok('A: retire of a QUEUED hint means it is never shown',
    !doc.body.children.some(c => c._text === 'third'));
  // DISPLAY BUG 2026-09-16: a NaN anchor rect must never write 'NaNpx' — a
  // real browser drops that value and the strip falls to its static position
  // below the fold, clipped by overflow:hidden (mounted but invisible).
  {
    const doc2 = mkDoc();
    const badAnchor = { left: NaN, top: NaN, right: NaN, bottom: NaN, width: 480, height: 300 };
    const s2 = new HintStrip({ anchor: () => badAnchor, mount: doc2.body, doc: doc2 });
    s2.show('x', 'line');
    s2.update(0.016);
    const e2 = doc2.body.children[0];
    ok('A: a NaN anchor rect never writes a NaNpx position (no below-the-fold strip)',
      e2 && e2.style.left === undefined && e2.style.top === undefined,
      { left: e2 && e2.style.left, top: e2 && e2.style.top });
  }
}

// A3. ObjectTags (invariants 5, 6): anchored to the object, ASCII edge arrow.
{
  const doc = mkDoc();
  const tags = new ObjectTags({ anchor: () => CONT, view: () => CONT, mount: doc.body, doc });
  let at = { left: 240, top: 150 };
  tags.show('chest', 'CHEST', () => at);
  tags.update(0.016);
  let el = doc.body.children[0];
  ok('A: a tag mounted for the sighted object', el && el._text === 'CHEST', el && el._text);
  ok('A: a tag is a label, never a button (pointer-events:none, zero listeners)',
    /pointer-events:\s*none/.test(el.style.cssText) && !handlers.has(el));
  ok('A: an in-view tag sits just above its object with no arrow',
    !/^[\^v<>] /.test(el._text) && parseFloat(el.style.top) < 150, { text: el._text, top: el.style.top });
  ok('A: tag text is ASCII (invariant 6)', ASCII.test(el._text));
  // Off-screen: clamped to the edge, ASCII arrow pointing the way.
  at = { left: 600, top: 150 }; tags.update(0.016);
  ok('A: off-screen right -> "> " arrow, clamped inside the view',
    el._text === '> CHEST' && parseFloat(el.style.left) <= 480, { text: el._text, left: el.style.left });
  at = { left: -50, top: 150 }; tags.update(0.016);
  ok('A: off-screen left -> "< " arrow', el._text === '< CHEST', el._text);
  at = { left: 240, top: 400 }; tags.update(0.016);
  ok('A: off-screen below -> "v " arrow', el._text === 'v CHEST', el._text);
  at = { left: 240, top: -30 }; tags.update(0.016);
  ok('A: off-screen above -> "^ " arrow', el._text === '^ CHEST', el._text);
  at = { left: 240, top: 150 };
  // The object is gone -> the tag leaves with it; and it fades at TAG_FADE_S.
  at = null; tags.update(0.016);
  ok('A: the tag unmounts the moment its object is gone', !doc.body.children.includes(el));
  let p = { left: 240, top: 150 };
  tags.show('portal', 'PORTAL', () => p);
  tags.update(0.016);
  const el2 = doc.body.children[0];
  tags.update(TAG_FADE_S);
  ok('A: a tag auto-fades at TAG_FADE_S', !doc.body.children.includes(el2));
}

// A3b. DISPLAY BUG 2026-09-16 — the two invisible failure modes are COUNTED,
// never swallowed. (a) a locate() throw unmounts the tag (object-gone
// semantics) but leaves a NUMBER behind, not a silent catch; (b) a
// non-finite placement never mounts and never writes 'NaNpx' — in a real
// browser that style value is dropped and the element falls below the fold,
// clipped by overflow:hidden: mounted-but-invisible, the reported symptom.
{
  const doc = mkDoc();
  const tags = new ObjectTags({ anchor: () => CONT, view: () => CONT, mount: doc.body, doc });
  ok('A: a healthy engine starts with zero failures counted',
    tags.failures.locate === 0 && tags.failures.place === 0, tags.failures);
  let at = { left: NaN, top: 150 };
  tags.show('chest', 'CHEST', () => at);
  tags.update(0.016);
  ok('A: a non-finite placement is COUNTED, not silently misplaced',
    tags.failures.place === 1 && tags.failures.locate === 0, tags.failures);
  ok('A: a tag with a non-finite position NEVER mounts (nothing to clip below the fold)',
    !doc.body.children.some(c => c.id === 'tag-chest'), doc.body.children.length);
  ok('A: the tag stays armed for a later good frame (life still burns)',
    tags.active('chest'));
  at = { left: 240, top: 150 };
  tags.update(0.016);
  ok('A: the tag recovers on the next finite frame and mounts',
    doc.body.children.some(c => c.id === 'tag-chest' && c._text === 'CHEST'));
  tags.update(TAG_FADE_S);   // clean slate for the throw leg
  let boom = true;
  tags.show('arch', 'ARCH', () => { if (boom) throw new Error('locate died'); return { left: 10, top: 10 }; });
  tags.update(0.016);
  ok('A: a locate() throw is COUNTED (visible, never a silent swallow)',
    tags.failures.locate === 1, tags.failures);
  ok('A: a thrown locate still means object-gone (tag unmounts gracefully)',
    !doc.body.children.some(c => c.id === 'tag-arch'));
}

// A4. the flag store (invariant 4's persistence side).
{
  const shim = new Map();
  const storage = { getItem: k => (shim.has(k) ? shim.get(k) : null), setItem: (k, v) => shim.set(k, String(v)), removeItem: k => shim.delete(k) };
  const store = makeHintStore(storage);
  ok('A: HINT_IDS is exactly move + portal', JSON.stringify(HINT_IDS) === '["move","portal"]', HINT_IDS);
  ok('A: GIVE_UP_RUNS is 3', GIVE_UP_RUNS === 3, GIVE_UP_RUNS);
  ok('A: a fresh store has neither done flags nor runs',
    !store.done('move') && store.runs('move') === 0);
  store.setDone('move');
  ok('A: a demonstrated hint is done forever (persisted)', store.done('move') && shim.get('hordes_hint_move_done') === '1');
  store.bumpRuns('portal'); store.bumpRuns('portal');
  ok('A: runs accumulate per un-demonstrated run end', store.runs('portal') === 2, store.runs('portal'));
  store.reset();
  ok('A: reset (REPLAY TOUR) re-arms flags AND give-up counters',
    !store.done('move') && store.runs('portal') === 0);
}

// ---- Part B: the REAL main.js loop ---------------------------------------------
{
  const noop = () => {};
  const fakeCtx = new Proxy({}, {
    get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
    set() { return true; },
  });
  const domHandlers = new WeakMap();
  const mk = () => {
    const el = {
      tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
      _html: '',
      addEventListener(ev, cb) { const h = domHandlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); domHandlers.set(el, h); },
      removeEventListener(ev, cb) { const h = domHandlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
      fire(ev, arg) { for (const cb of ((domHandlers.get(el) || {})[ev] || []).slice()) cb(arg); },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
      getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
      getContext: () => fakeCtx,
      click() { if (el.onclick) el.onclick(); el.fire('click'); },
      width: 0, height: 0,
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html; },
      set(v) { el._html = String(v); },
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
  let keyHandler = null;
  globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; }, innerWidth: 480, innerHeight: 300 };
  let now = 0;
  globalThis.performance = { now: () => now };
  const rafQueue = [];
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.location = { reload: noop };
  // Onboarded + every tour flag (the KEPT coaches stay out of the way — this
  // file owns the HINT layer, test_tour owns the coaches) + NO hint flags.
  const ls = new Map([['hordes_onboarded', '1'],
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
  const stripEls = () => globalThis.document.body.children.filter(c => c.id === 'hint-strip');
  const tagEl = (kind) => globalThis.document.body.children.find(c => c.id === 'tag-' + kind);
  const OB = T.onboarding;

  keyHandler({ key: 'x', preventDefault() {} });   // skip the intro movie
  tick(1);
  T.startRun();
  ok('B: the run is live', st.mode === 'playing', st.mode);
  T.setPilotMode('MANUAL');   // swaps the controller too — st.pilotMode alone does not steer                // the human owns movement in this leg
  st.player.stats.xpMult = 0;             // no drafts mid-test
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;   // nothing interrupts the leg

  // ---- B1+B2+B3: the run-start hint — live, inert, never pausing -------------
  tick(1.0);
  const strip = stripEls()[0];
  ok('B1: the move hint is visible after ~1s of run (once, no tour to walk first)',
    !!strip && strip.textContent.includes('WASD or drag'), strip && strip.textContent);
  ok('B1: the strip text carries no emoji (invariant 6)', !NO_EMOJI.test(strip.textContent));
  const t0 = st.time;
  tick(0.5);
  ok('B1: the sim ADVANCES while the hint is visible (invariant 1: never pauses)',
    st.time > t0 + 0.4, { was: t0, now: st.time });
  ok('B2: the strip carries pointer-events:none inline (invariant 2)',
    /pointer-events:\s*none/.test(strip.style.cssText || ''), strip.style.cssText);
  ok('B2: the strip registered ZERO DOM listeners (invariant 2)', !domHandlers.has(strip));
  ok('B2: the strip has NO dismiss controls (invariant 2)', strip.children.length === 0);

  // Input steers STRAIGHT THROUGH the visible hint.
  const px0 = st.player.x, py0 = st.player.y;
  keyHandler({ key: 'w', preventDefault() {} });    // held 'up' in MANUAL
  tick(0.5);
  ok('B3: a held movement key steers the player WHILE the hint is up (invariant 2)',
    st.player.y < py0 - 10, { was: py0, now: st.player.y });
  T.pilotInput.up = false;                          // release (no keyup in the stub)
  // The joystick path writes the same input seam the real pad does.
  const px1 = st.player.x;
  T.pilotInput.x = 1; T.pilotInput.y = 0; T.pilotInput.mag = 1;
  tick(0.5);
  ok('B3: a joystick drag steers the player WHILE the hint is up (invariant 2)',
    st.player.x > px1 + 10, { was: px1, now: st.player.x });
  T.pilotInput.x = 0; T.pilotInput.mag = 0;

  // ---- B4: teach-until-demonstrated — movement retires the hint ---------------
  // ~3s of deliberate travel (>20px/s) while the hint is mid-display.
  T.pilotInput.x = 1; T.pilotInput.mag = 1;
  tick(3.2);
  T.pilotInput.x = 0; T.pilotInput.mag = 0;
  ok('B4: ~3s of movement marks the move hint DONE (persisted)',
    OB.store.done('move') && ls.get('hordes_hint_move_done') === '1');
  ok('B4: the demonstrated hint left the screen immediately',
    !stripEls().some(e => e.textContent.includes('WASD or drag')), stripEls().length);

  // ---- B8: object tags — chest first-sighting, anchored, clamped --------------
  st.chests.push({ x: st.player.x + 40, y: st.player.y, age: 0 });
  tick(0.2);
  const tag = tagEl('chest');
  ok('B8: a chest sighting mounts a CHEST tag', !!tag && tag.textContent.includes('CHEST'),
    tag && tag.textContent);
  ok('B8: the tag is inert (pointer-events:none, zero listeners)',
    /pointer-events:\s*none/.test(tag.style.cssText || '') && !domHandlers.has(tag));
  {
    const left = parseFloat(tag.style.left), top = parseFloat(tag.style.top);
    const c = elements['wrap'].getBoundingClientRect();
    ok('B8: the tag is clamped fully inside the game container (invariant 5)',
      left >= c.left - 0.5 && left <= c.right + 0.5 && top >= c.top - 0.5 && top <= c.bottom + 0.5,
      { left, top, c });
    ok('B8: the tag text carries no emoji (invariant 6)', !NO_EMOJI.test(tag.textContent));
  }
  tick(TAG_FADE_S + 0.2);
  ok('B8: the tag auto-faded after its linger', !tagEl('chest'));

  // ---- B5: queue-not-stack — the portal hint waits for the move hint ----------
  T.startRun();
  T.setPilotMode('MANUAL');   // swaps the controller too — st.pilotMode alone does not steer
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  tick(1.0);
  ok('B5: run 2 — the DEMONSTRATED move hint does not show again (the done flag persisted)',
    !stripEls().some(e => e.textContent.includes('WASD or drag')));
  // Force the portal open: its hint is the second in-context touch.
  st.portal = { x: st.player.x + 200, y: st.player.y, age: 0 };
  tick(0.2);
  ok('B5: the portal hint is visible once a portal exists',
    stripEls().length === 1 && stripEls()[0].textContent.includes('portal'), stripEls().length);

  // ---- B6: entering the portal IS the demonstration ---------------------------
  st.portal.x = st.player.x + 5; st.portal.y = st.player.y;   // inside RADIUS
  tick(0.1);
  ok('B6: portal entry retires the portal hint permanently (persisted)',
    OB.store.done('portal') && ls.get('hordes_hint_portal_done') === '1');
  ok('B6: the demonstrated portal hint left the screen',
    !stripEls().some(e => e.textContent.includes('portal')));
  tick(0.5);   // DWELL 0.4 -> the intermission takes the wave
  ok('B6: the portal flow itself still works under the hint layer (intermission reached)',
    st.mode === 'intermission', st.mode);

  // ---- B7: give-up-after-3-runs (an un-demonstrated hint is not forever) ------
  OB.store.reset();   // REPLAY TOUR re-arms everything
  ok('B7: reset re-armed both hints', !OB.store.done('move') && OB.store.runs('move') === 0);
  for (let run = 1; run <= GIVE_UP_RUNS; run++) {
    T.startRun();
    T.setPilotMode('MANUAL');   // swaps the controller too — st.pilotMode alone does not steer          // stand still: no demonstration
    st.player.stats.xpMult = 0;
    st.player.stats.maxHp = 1; st.player.hp = 1;   // contact ends the run fast
    let ended = false;
    for (let i = 0; i < 60 * 120 && !ended; i++) {
      frame();
      if (st.mode === 'death-cine' || st.mode === 'dead') ended = true;
    }
    ok('B7: give-up run ' + run + ' ended in death', ended, st.mode);
    ok('B7: run ' + run + ' burned one of the move hint\'s chances',
      OB.store.runs('move') === run && ls.get('hordes_hint_move_runs') === String(run),
      { runs: OB.store.runs('move'), ls: ls.get('hordes_hint_move_runs') });
    if (st.mode === 'death-cine') keyHandler({ key: 'x', preventDefault() {} });  // skip the movie
  }
  T.startRun();
  T.setPilotMode('MANUAL');   // swaps the controller too — st.pilotMode alone does not steer
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  tick(2.0);
  ok('B7: after ' + GIVE_UP_RUNS + ' un-demonstrated runs the move hint gives up (never shown)',
    stripEls().length === 0, stripEls().length);

  // ---- Part C: DISPLAY BUG 2026-09-16 — live-path displayability -------------
  // Owner report: "the button tooltips for tutorial never display. Only one
  // that displays is the movement one." This leg proves, and forever pins,
  // displayability through the REAL path for every surface in the layer: the
  // tags arm via maybeTags() off REAL state objects and place through the
  // REAL canvas rect at 1x, at the top of the zoom ladder (the off-screen
  // edge-arrow case), and inside a 480x300 embed; the portal hint shows on
  // FRESH hint flags; and a healthy run counts ZERO locate() failures — the
  // counter that turns the old invisible failure modes (swallowed throw,
  // 'NaNpx' placement falling below the fold) into a number.
  OB.store.reset();   // fresh hint flags — the fresh-profile read
  document.getElementById('wrap').getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 });
  document.getElementById('game').getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 });
  T.zoom.set(1);
  T.startRun();
  T.setPilotMode('MANUAL');
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  const placedInside = (kind) => {
    const el = tagEl(kind);
    if (!el) return { ok: false, why: 'no element mounted' };
    const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
    const c = document.getElementById('wrap').getBoundingClientRect();
    return { el, left, top, text: el.textContent,
      ok: Number.isFinite(left) && Number.isFinite(top) && el.textContent.length > 0 &&
        left >= c.left && left <= c.right && top >= c.top && top <= c.bottom };
  };
  // C1: 1x, 480x300 embed — the run-start first sightings (arch + shrine)
  // come from the REAL maybeTags() with REAL state objects.
  tick(2.0);
  const rArch = placedInside('arch');
  ok('C1: the ARCH tag displays through the real path at 1x in a 480x300 embed (exists, finite placement inside the container)',
    rArch.ok, rArch);
  const rShrine = placedInside('shrine');
  ok('C1: the SHRINE tag displays through the real path at 1x in a 480x300 embed',
    rShrine.ok, rShrine);
  ok('C1: both tags are inert (pointer-events:none, zero listeners)',
    /pointer-events:\s*none/.test(rArch.el.style.cssText || '') && !domHandlers.has(rArch.el) &&
    /pointer-events:\s*none/.test(rShrine.el.style.cssText || '') && !domHandlers.has(rShrine.el));
  const tc0 = st.time;
  tick(0.5);
  ok('C1: the sim ADVANCES while the tags are visible (invariant 1 re-asserted)',
    st.time > tc0 + 0.4, { was: tc0, now: st.time });

  // C2: MAX ZOOM (ladder top) — a far-off chest clamps to the view edge with
  // an ASCII arrow; still placed, still inside the container.
  T.zoom.set(T.zoom.ladder[T.zoom.ladder.length - 1]);
  st.chests.push({ x: st.player.x + 400, y: st.player.y, age: 0 });
  tick(0.2);
  const rChest = placedInside('chest');
  ok('C2: the CHEST tag displays through the real path at max zoom (exists, finite placement inside the container)',
    rChest.ok, rChest);
  ok('C2: an off-screen object at max zoom gets the ASCII edge arrow, never a lost tag',
    /^[<>v^] CHEST$/.test(rChest.text), rChest.text);

  // C3: the PORTAL HINT on fresh flags, through the real queue: it waits for
  // the current move hint to fade, then shows.
  st.portal = { x: st.player.x + 200, y: st.player.y, age: 0 };
  tick(0.2);
  tick(HINT_FADE_S + 0.2);
  ok('C3: on fresh hint flags a portal sighting shows the portal hint through the real path',
    stripEls().length === 1 && stripEls()[0].textContent.includes('portal'),
    stripEls().map(e => e.textContent));

  // C4: the whole healthy leg swallowed ZERO locate() failures.
  ok('C4: a healthy run counts ZERO locate() throws and ZERO non-finite placements',
    OB.tags.failures.locate === 0 && OB.tags.failures.place === 0, OB.tags.failures);
}

console.log('test_onboarding: all ' + passed + ' checks passed');
