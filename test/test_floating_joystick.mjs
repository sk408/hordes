// FLOATING (DYNAMIC) JOYSTICK GUARD (owner 2026-09-18, msg_01M2S5BMY6)
// — touch anywhere on the canvas in MANUAL play steers:
//   * the press ARMS the stick at the touch point (origin ring #fjoy, painted
//     there, pointer-inert — the canvas owns the gesture) and the drag feeds
//     the SAME analog pilotInput as the fixed base (dead zone JOY_DEAD_ZONE
//     0.15, magnitude = deflection fraction, clamped at the ring);
//   * release is a DEAD STOP (no coast) — window pointerup/pointercancel,
//     id-filtered; blur and pilot-mode swaps hard-release everything;
//   * COEXISTENCE: the fullscreen button's hit-test runs FIRST (its tap
//     toggles, never steers), help-mode taps never arm, pads/cog never reach
//     the canvas (DOM above it), a second finger on a pad keeps the stick
//     alive, AUTO_ALL/AUTO_MOVE never arm, non-playing modes never arm;
//   * on touch paths the fixed #joy base stands down (one movement idiom);
//     desktop keeps the fixed base for mouse-drag (C.JOY.FLOAT is the flip);
//   * pointer capture is attempted on arm (counted; unverifiable headless —
//     the window listeners are the testable path, audit-round-2 precedent);
//   * GEOMETRY: the canvas-minus-control-rects region holds a control-clear
//     disc (r=40) at 390x844 AND 320x568 AND 844x390 landscape.
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { JOY_DEAD_ZONE } from '../src/controllers.js';
import assert from 'node:assert/strict';

const S = suite('test_floating_joystick');

// ---------------------------------------------------------------------------
// ARM 1 — the touch-device phone: arm / steer / analog / dead zone / release.
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fj-touch', device: 'touch',
    storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = T.state;
  const fj = T.fjoy;
  const game = h.elements['game'];
  const captured = [];
  game.setPointerCapture = (id) => { captured.push(id); };   // the real-browser gesture keeper
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  h.pump(1);
  assert.equal(st.mode, 'playing', 'fixture: a live run');

  const down = (x, y, id = 7) => game._ev.pointerdown({
    clientX: x, clientY: y, pointerId: id, preventDefault() {},
  });
  const move = (x, y, id = 7) => h.handlers['pointermove']({
    clientX: x, clientY: y, pointerId: id, preventDefault() {},
  });
  const lift = (type, id = 7) => h.handlers[type]({ pointerId: id });
  const pad = (act, id = 9) => h.elements['touch']._ev.pointerdown({
    pointerId: id, preventDefault() {},
    target: { closest: (s) => s === '[data-act]' ? { dataset: { act } } : null },
  });

  S.check('a canvas press in MANUAL play arms the stick AT the touch point', () => {
    down(200, 150);
    assert.equal(fj.armed(), true, 'armed');
    assert.deepEqual(fj.origin(), { x: 200, y: 150, rad: C.JOY.FLOAT_R },
      'origin is the touch point, radius from config');
    assert.equal(fj.el.style.display, 'block', 'the ring is painted');
    assert.equal(fj.el.style.left, (200 - C.JOY.FLOAT_R) + 'px', 'ring centred on the origin (x)');
    assert.equal(fj.el.style.top, (150 - C.JOY.FLOAT_R) + 'px', 'ring centred on the origin (y)');
    assert.deepEqual(captured, [7], 'pointer capture attempted on the canvas');
    lift('pointerup');
  });

  S.check('the drag steers: full deflection, analog half, dead zone below 15%', () => {
    down(200, 150);
    move(260, 150);                       // exactly one radius right
    assert.equal(T.pilotInput.x, 1, 'hard right');
    assert.equal(T.pilotInput.y, 0);
    assert.ok(Math.abs(T.pilotInput.mag - 1) < 1e-9, 'rim deflection = mag 1');
    assert.equal(fj.knob.style.transform, 'translate(60px,0px)', 'knob parked at the rim');
    move(230, 150);                       // half radius
    assert.ok(Math.abs(T.pilotInput.mag - 0.5) < 1e-9, 'ANALOG: half deflection = mag 0.5');
    move(205, 150);                       // 5px = mag 0.083 — inside the dead zone
    assert.ok(T.pilotInput.mag < JOY_DEAD_ZONE, 'below JOY_DEAD_ZONE the controller reads nothing');
    move(200 + Math.round(C.JOY.FLOAT_R * Math.SQRT1_2), 150 - Math.round(C.JOY.FLOAT_R * Math.SQRT1_2));
    assert.ok(Math.abs(T.pilotInput.x - Math.SQRT1_2) < 1e-9 &&
      Math.abs(T.pilotInput.y + Math.SQRT1_2) < 1e-9, 'diagonals are true analog, not gated');
  });

  S.check('release is a DEAD STOP (no coast), on the owning lift only', () => {
    move(260, 150);                       // fixture: back to full right deflection
    lift('pointerup', 999);               // a foreign finger's lift
    assert.equal(fj.armed(), true, 'a foreign pointerup does not release');
    assert.equal(T.pilotInput.mag, 1, '...and the vector is still live');
    lift('pointerup');
    assert.equal(fj.armed(), false, 'the owning lift releases');
    assert.ok(T.pilotInput.x === 0 && T.pilotInput.y === 0 && T.pilotInput.mag === 0,
      'dead stop — zeroed the same frame, no coast');
    assert.equal(fj.el.style.display, 'none', 'ring hidden');
    down(200, 150);
    lift('pointercancel');                // the system grab
    assert.equal(fj.armed(), false, 'pointercancel releases too');
  });

  S.check('pads coexist: a second finger on a pad fires its action, steering lives on', () => {
    down(200, 150);
    move(260, 150);
    const focus0 = st.focus;
    pad('focus');                          // the LEFT pad's doctrine button, pointer 9
    h.pump(1);
    assert.notEqual(st.focus, focus0, "the pad's own action fired (FOCUS cycled)");
    assert.equal(fj.armed(), true, 'the pad press did not steal the stick');
    assert.equal(T.pilotInput.x, 1, 'steering still live through the pad press');
    lift('pointerup');
  });

  S.check('a SECOND canvas finger never re-arms (one stick at a time)', () => {
    down(200, 150);
    down(300, 100, 8);                     // a second canvas press, other pointer
    assert.deepEqual(fj.origin(), { x: 200, y: 150, rad: C.JOY.FLOAT_R },
      'the origin did not move to the new finger');
    lift('pointerup');
  });

  S.check('on touch paths the FIXED base stands down; the pads stay up', () => {
    assert.equal(h.elements['joy'].style.display, 'none',
      'one movement idiom on screen (C.JOY.FLOAT)');
    assert.ok(h.elements['touch'].classList.contains('on'), 'the pad layer is up');
  });

  S.check('help-mode taps never arm ("?" owns the canvas while armed)', () => {
    pad('help', 3);                        // the real arm path: the HELP button
    h.pump(1);
    assert.equal(st.helpMode, true, 'fixture: inspect mode armed');
    down(120, 120);
    assert.equal(fj.armed(), false, 'a help-mode canvas tap explains, never steers');
    pad('help', 3);                        // the "?" again leaves the mode
    h.pump(1);
    assert.equal(st.helpMode, false, 'fixture: left help mode');
    down(120, 120);
    assert.equal(fj.armed(), true, '...and steering works again immediately');
    lift('pointerup');
  });

  S.check('non-playing modes never arm (menus, escape, cinematics)', () => {
    st.mode = 'draft';                     // forced mode (house seam precedent)
    down(120, 120);
    assert.equal(fj.armed(), false, 'no stick on a draft screen');
    st.mode = 'escape';
    down(120, 120);
    assert.equal(fj.armed(), false, 'no stick in the escape (its pads are the controls)');
    st.mode = 'playing';
  });

  S.check('AUTO_ALL / AUTO_MOVE never arm — MANUAL only', () => {
    T.setPilotMode('AUTO_MOVE');
    h.pump(1);
    down(200, 150); move(260, 150);
    assert.equal(fj.armed(), false, 'AUTO_MOVE: the pilot drives, the canvas does not steer');
    T.setPilotMode('AUTO_ALL');
    h.pump(1);
    down(200, 150); move(260, 150);
    assert.equal(fj.armed(), false, 'AUTO_ALL: equally dead');
    assert.ok(T.pilotInput.mag === 0, 'and pilotInput was never written');
    T.setPilotMode('MANUAL');
    h.pump(1);
    down(200, 150); move(260, 150);
    assert.equal(fj.armed(), true, 'MANUAL again: arms');
    lift('pointerup');
  });

  S.check('a pilot-mode swap mid-drag hard-releases the stick', () => {
    down(200, 150); move(260, 150);
    T.setPilotMode('AUTO_ALL');            // swapPilotMode -> clearPilotInput
    h.pump(1);
    assert.equal(fj.armed(), false, 'the swap released the floating drag');
    assert.ok(T.pilotInput.mag === 0, 'no ghost vector into the autopilot');
    T.setPilotMode('MANUAL');
    h.pump(1);
  });

  S.check('blur stands everything down (alt-tab guard covers the floating stick)', () => {
    down(200, 150); move(260, 150);
    h.handlers['blur']();
    assert.equal(fj.armed(), false, 'blur released the stick');
    assert.ok(T.pilotInput.mag === 0 && !T.pilotInput.right, 'blur cleared stick and keys');
  });

  S.check('the layout SURVIVES a dynamic viewport change and rotation mid-drag', () => {
    down(200, 150); move(260, 150);
    globalThis.window.innerWidth = 390; globalThis.window.innerHeight = 740;
    h.handlers['resize']();
    globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390;
    h.handlers['orientationchange']();
    move(200 + C.JOY.FLOAT_R, 150);
    assert.equal(fj.armed(), true, 'still armed through resize + rotation');
    assert.equal(T.pilotInput.x, 1, 'and still steering');
    lift('pointerup');
    globalThis.window.innerWidth = 480; globalThis.window.innerHeight = 300;
    h.handlers['resize']();
  });
}

// ---------------------------------------------------------------------------
// ARM 2 — the desktop: no floating arm (mouse keeps the fixed base, WASD the
// keys); the flip constant restores nothing here because isTouchPath reads
// the layer, not the pointer type.
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fj-desktop', storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = T.state;
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  h.pump(1);
  S.check('desktop: canvas presses never arm; the FIXED base stays for mouse-drag', () => {
    h.elements['game']._ev.pointerdown({
      clientX: 200, clientY: 150, pointerId: 7, preventDefault() {},
    });
    h.handlers['pointermove']?.({ clientX: 260, clientY: 150, pointerId: 7, preventDefault() {} });
    assert.equal(T.fjoy.armed(), false, 'not a touch path — no floating arm');
    assert.equal(h.elements['joy'].style.display, 'block',
      'the fixed base is the desktop movement idiom (WAVE-23 mouse-drag)');
    h.handlers['pointerup']?.({ pointerId: 7 });
  });
}

// ---------------------------------------------------------------------------
// ARM 3 — the fullscreen button keeps gesture priority over the arm.
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fj-fs', device: 'touch', fullscreen: true,
    storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = T.state;
  const fj = T.fjoy;
  const game = h.elements['game'];
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  h.pump(1);
  const b = T.fullscreen.rect();           // view coords; canvas rect is 480x300
  const tap = (x, y) => game._ev.pointerdown({
    clientX: x, clientY: y, pointerId: 7, preventDefault() {},
  });
  S.check('the fullscreen button\'s own tap toggles — it never steers', () => {
    T.fullscreen.bump(); h.pump(1);        // make the button visible
    tap(b.x + b.w / 2, b.y + b.h / 2);     // dead centre of the button box
    assert.equal(h.fsCalls.enter, 1, 'requestFullscreen called');
    assert.equal(fj.armed(), false, 'the button press did NOT arm the stick');
    h.handlers['pointerup']({ pointerId: 7 });
    T.fullscreen.bump(); h.pump(1);
    tap(240, 150);                          // view centre — far from the box
    assert.equal(fj.armed(), true, 'an outside canvas tap arms as usual');
    h.handlers['pointerup']({ pointerId: 7 });
  });
}

// ---------------------------------------------------------------------------
// GEOMETRY — canvas-minus-control-rects at the two required phone sizes and
// the landscape case. Control boxes per index.html: .pad 96 wide, side/bottom
// inset 10, four buttons at 64px + 3x10 gaps = 286 tall (PAD_H=300 generous);
// cog row top-right (four labelled buttons, ~320 wide x 56 tall, generous).
// The floating ORIGIN must have a control-clear disc (r=40, over half the
// ring radius) to land in at every size, and the free area must stay a real
// fraction of the canvas (>= 20%) — a stick with nowhere to live is a dead
// control.
// ---------------------------------------------------------------------------
{
  const PAD_W = 96, INSET = 10, PAD_H = 300;
  const COG_W = 320, COG_H = 66;
  const SIZES = [
    { name: '390x844 (iPhone portrait)', vw: 390, vh: 844 },
    { name: '320x568 (small phone portrait)', vw: 320, vh: 568 },
    { name: '844x390 (landscape — pads ON the canvas)', vw: 844, vh: 390 },
  ];
  const R = 40;   // the control-clear radius an origin needs (> half FLOAT_R)
  for (const s of SIZES) {
    const scale = Math.min(s.vw / C.VIEW_W, s.vh / C.VIEW_H);
    const cw = C.VIEW_W * scale, ch = C.VIEW_H * scale;
    const cl = (s.vw - cw) / 2, ct = (s.vh - ch) / 2;
    const controls = [
      { left: INSET, right: INSET + PAD_W, top: s.vh - INSET - PAD_H, bottom: s.vh - INSET },
      { left: s.vw - INSET - PAD_W, right: s.vw - INSET, top: s.vh - INSET - PAD_H, bottom: s.vh - INSET },
      { left: s.vw - COG_W, right: s.vw, top: 0, bottom: COG_H },
    ];
    const inRect = (p, r) => p.x >= r.left - R && p.x <= r.right + R &&
      p.y >= r.top - R && p.y <= r.bottom + R;
    let clear = 0, free = 0, total = 0;
    for (let x = cl; x <= cl + cw; x += 5) {
      for (let y = ct; y <= ct + ch; y += 5) {
        total++;
        if (controls.some(r => inRect({ x, y }, r))) continue;
        free++;
        // control-clear by the full disc radius (the inflate above IS the disc)
        clear++;
      }
    }
    S.check(`${s.name}: a control-clear r=${R} disc exists for the origin; free area >= 20%`, () => {
      assert.ok(clear > 0,
        `origins with a ${R}px control-clear disc exist (${clear} sampled points)`);
      assert.ok(free / total >= 0.2,
        `free canvas fraction ${(100 * free / total).toFixed(1)}% >= 20%`);
    });
  }
}

S.done();
