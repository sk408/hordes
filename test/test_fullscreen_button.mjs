// FULLSCREEN BUTTON GUARD (owner 2026-09-17, msg_01M2S3Y289YVRKZY33S0TF1MAE)
// — the transient CANVAS toggle:
//   * painted ON THE CANVAS in the play-HUD pass (not a settings card),
//     appears on interaction, hides 1.3s (C.FULLSCREEN.HIDE_S, the owner's
//     2026-09-18 retune of the original "0.5s") after the LAST interaction,
//     re-shows on the next;
//   * the button's OWN tap toggles fullscreen and is never swallowed by the
//     show-on-interaction logic (hit-test runs FIRST in the canvas handler);
//   * iPhone iOS Safari ships no element Fullscreen API -> the support probe
//     reads false and the button is ABSENT (no dead control);
//   * no overlap with the HUD chrome or the DOM pads — geometrically
//     asserted at 390x844 AND 320x568 (plus 844x390 landscape, where the
//     pads sit ON the letterboxed canvas);
//   * suppressed with the HUD during the end-of-run summary — it draws
//     inside drawPlayHud, so the shared hudSuppressed() mechanism
//     (HUD_SUPPRESSED_MODES, render.js) covers it for free; this guard pins
//     that inheritance instead of assuming it.
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import assert from 'node:assert/strict';

const S = suite('test_fullscreen_button');
const dt = 1 / 60;

// ---------------------------------------------------------------------------
// ARM 1 — the no-API, NON-TOUCH client: no mode can work, button ABSENT.
// (Base task's iPhone case is superseded by the addendum: an iPhone now gets
// IMMERSIVE MODE — see ARM 3. 'none' remains for a hypothetical no-API
// desktop/embed where immersive mode would be meaningless.)
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fs-noapi' });
  const T = h.T, st = T.state;
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'fixture: a live run');
  S.check('no Fullscreen API + non-touch -> mode none (no dead control)', () => {
    assert.equal(T.fullscreen.mode(), 'none', 'mode reads none');
    assert.equal(T.fullscreen.supported(), false, 'support probe reads false');
    assert.equal(h.fsCalls, null, 'the harness armed no API surface either');
  });
  S.check('interactions there never paint the button', () => {
    h.elements['touch']._ev.pointerdown({ pointerId: 1 });   // an interaction
    h.pump(2);
    assert.equal(T.renderer.fsButton, null, 'renderer.fsButton seam stayed null');
    assert.equal(T.fullscreen.visible(), false, 'visible() is false despite the bump');
    assert.equal(T.fullscreen.toggle(), false, 'toggle is a no-op, returns false');
  });
}

// ---------------------------------------------------------------------------
// ARM 2 — the real-API browser: show / hide / re-show / toggle / suppression.
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fs-api', fullscreen: true });
  const T = h.T, st = T.state;
  const fs = T.fullscreen;
  T.startRun();
  h.pump(2);
  // QUIET FIELD (2026-09-18 flake): this arm pumps ~20s of a LIVE unattended
  // run across its hide windows, and the AUTO pilot can DIE mid-check (the
  // death movie then owns the frame loop — checks downstream of a death read
  // a frame() that never reaches renderer.render). The button's behaviour is
  // the subject; the horde is not. Same idiom as every other gameplay test.
  st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  const b = fs.rect();
  const tap = (x, y) => {
    let prevented = false;
    h.elements['game']._ev.pointerdown({
      clientX: x, clientY: y, pointerId: 7,
      preventDefault() { prevented = true; },
    });
    return prevented;
  };

  S.check('support probe reads true with the API present', () => {
    assert.equal(fs.supported(), true);
  });

  S.check('the button box is the mid-right free column (W/H/INSET honored)', () => {
    assert.equal(b.w, C.FULLSCREEN.W);
    assert.equal(b.h, C.FULLSCREEN.H);
    assert.equal(b.x, C.VIEW_W - C.FULLSCREEN.INSET - C.FULLSCREEN.W);
    assert.equal(b.y, (C.VIEW_H - C.FULLSCREEN.H) / 2);
  });

  S.check('the duration constant is EXACTLY the owner retune (1.3s), not implied', () => {
    assert.equal(C.FULLSCREEN.HIDE_S, 1.3, 'HIDE_S is the owner\'s 2026-09-18 number');
  });

  S.check('hidden at rest; an interaction shows it; HIDE_S of frames later it is gone', () => {
    h.pump(2);
    assert.equal(T.renderer.fsButton, null, 'no interaction yet -> nothing painted');
    h.elements['touch']._ev.pointerdown({ pointerId: 1 });
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'the interaction showed the button');
    assert.deepEqual(T.renderer.fsButton, b, 'painted exactly at the declared box');
    // 1.3s at 60Hz is exactly 78 frames — the fade FOLLOWS the constant.
    const frames = Math.round(C.FULLSCREEN.HIDE_S / dt);
    assert.equal(frames, 78, '1.3s is a whole number of 60Hz frames');
    h.pump(frames - 2);   // + the 1 frame above = frames-1 total: still inside
    assert.ok(T.renderer.fsButton, `still visible at ${frames - 1} frames (${(C.FULLSCREEN.HIDE_S - dt).toFixed(3)}s < 1.3s)`);
    h.pump(1);
    assert.equal(T.renderer.fsButton, null, 'hidden at exactly C.FULLSCREEN.HIDE_S');
  });

  S.check('the NEXT interaction re-shows it after a full hide', () => {
    h.pump(5);                                             // well past the window
    assert.equal(T.renderer.fsButton, null);
    h.elements['touch']._ev.pointerdown({ pointerId: 2 });
    h.pump(1);
    assert.ok(T.renderer.fsButton, 're-shows on the next touch interaction');
    h.pump(80);                                            // hide again (past 1.3s)
    assert.equal(T.renderer.fsButton, null);
    h.key('keydown', { key: 'F2' });                       // unbound key: interaction only
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'a KEYBOARD interaction re-shows it too (desktop)');
  });

  S.check('ONE tap on the button enters fullscreen (the gesture is not swallowed)', () => {
    fs.bump(); h.pump(1);
    assert.ok(T.renderer.fsButton, 'fixture: button on screen');
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;          // canvas rect is 480x300: view == client
    const prevented = tap(cx, cy);
    assert.equal(h.fsCalls.enter, 1, 'requestFullscreen called exactly once');
    assert.equal(h.fsCalls.exit, 0, 'no exit on the enter tap');
    assert.ok(prevented, 'the tap was consumed (preventDefault)');
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'the button stays visible through the toggle');
    assert.equal(st.fsOverlay.active, true, 'the active state is published');
  });

  S.check('a tap while HIDDEN never toggles (no invisible control)', () => {
    h.pump(80);                                            // let it hide fully (past 1.3s)
    assert.equal(T.renderer.fsButton, null);
    tap(b.x + b.w / 2, b.y + b.h / 2);
    assert.equal(h.fsCalls.enter, 1, 'enter count unchanged');
    assert.equal(h.fsCalls.exit, 0, 'exit count unchanged');
  });

  // GUARD 1 re-assert (2026-09-18 retune): the hit box is ~3x the icon, so
  // while hidden the ENLARGED target must be completely inert across its
  // whole area — an invisible 64x56 box over mid-field play would eat taps.
  S.check('the ENLARGED hit box is completely inert while hidden (all four corners + centre)', () => {
    const hb = fs.hitRect();
    assert.ok(hb.w >= b.w * 2 && hb.h >= b.h * 2, 'fixture: the hit box is genuinely enlarged');
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      h.pump(80);   // hidden again before every press (a tap re-shows by design)
      assert.equal(T.renderer.fsButton, null, 'fixture: hidden');
      tap(hb.x + fx * hb.w, hb.y + fy * hb.h);
      assert.equal(h.fsCalls.enter, 1, `no enter from the hidden hit-box tap at (${fx},${fy})`);
      assert.equal(h.fsCalls.exit, 0, `no exit from the hidden hit-box tap at (${fx},${fy})`);
    }
    // (each tap itself IS an interaction and re-shows the button — inertness
    // while hidden means no TOGGLE: fsHit() reads false at the moment the
    // button is not visible, so the enlarged box can never eat a gameplay
    // tap, only re-show the chrome.)
  });

  // GUARD 2 (2026-09-18 retune): one show per interaction. An OS auto-repeat
  // key stream (a HELD movement key fires ~30 keydowns/s with repeat:true)
  // must not re-bump the window — at 1.3s that would pin the transient
  // chrome on screen for the whole hold.
  S.check('a HELD key (repeat stream) never re-shows it; one honest press does', () => {
    h.pump(80);                                            // fully hidden
    assert.equal(T.renderer.fsButton, null, 'fixture: hidden');
    for (let i = 0; i < 90; i++) {                         // 1.5s of held key
      h.key('keydown', { key: 'w', repeat: true });
      h.pump(1);
    }
    assert.equal(T.renderer.fsButton, null, 'a 1.5s auto-repeat stream never re-shows it');
    h.key('keydown', { key: 'w' });                        // an honest press
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'a real keypress is still an interaction');
    h.pump(80);                                            // tidy: hide again
  });

  S.check('tapping the button AGAIN exits fullscreen (one tap, either way)', () => {
    fs.bump(); h.pump(1);
    tap(b.x + 2, b.y + 2);                                 // a corner of the box
    assert.equal(h.fsCalls.exit, 1, 'exitFullscreen called exactly once');
    h.pump(1);
    assert.equal(st.fsOverlay.active, false, 'inactive state published');
  });

  S.check('a tap OUTSIDE the box is an interaction, never a toggle', () => {
    fs.bump(); h.pump(1);
    tap(240, 150);                                         // view centre — far from the box
    assert.equal(h.fsCalls.enter, 1, 'no extra enter');
    assert.equal(h.fsCalls.exit, 1, 'no extra exit');
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'the outside tap still counts as an interaction');
  });

  S.check('menus/draft screens never carry it (the chromeOn gate)', () => {
    fs.bump();
    st.mode = 'draft';                                     // forced mode (house seam precedent)
    h.pump(1);
    assert.equal(T.renderer.fsButton, null, 'not painted in draft');
    st.mode = 'playing';
    h.pump(1);
    assert.ok(T.renderer.fsButton, '...and it returns with the pad screens');
  });

  S.check('the end-of-run summary suppresses it via the SHARED hudSuppressed gate', () => {
    fs.bump();
    st.mode = 'dead';                                      // the summary mode (forced, same seam)
    h.pump(1);
    assert.equal(T.renderer.fsButton, null, 'suppressed with the HUD in dead');
    assert.equal(T.renderer.hudDrawn, false, 'the whole play HUD stood down with it');
    st.mode = 'playing';
  });
}

// ---------------------------------------------------------------------------
// ARM 3 — the ADDENDUM: iPhone Safari (touch device, NO Fullscreen API) —
// the SAME button enters IMMERSIVE MODE. One abstraction, shared code path:
// toggle() routes by fsMode(), the published state, the paint and the
// hit-test are identical to the native arm.
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fs-immersive', device: 'touch' });
  const T = h.T, st = T.state;
  const fs = T.fullscreen;
  const body = h.elements['game'].ownerDocument.body;
  T.startRun();
  h.pump(2);
  // QUIET FIELD: see the fs-api arm (a mid-check death owns the frame loop).
  st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  const b = fs.rect();
  const tap = (x, y) => {
    let prevented = false;
    h.elements['game']._ev.pointerdown({
      clientX: x, clientY: y, pointerId: 7,
      preventDefault() { prevented = true; },
    });
    return prevented;
  };

  S.check('a touch device without the API resolves to IMMERSIVE mode', () => {
    assert.equal(fs.mode(), 'immersive', 'fsMode routes to the fallback');
    assert.equal(fs.supported(), true, 'the button exists where a mode can work');
    assert.equal(fs.immersive(), false, 'not immersive yet');
  });

  S.check('the button paints on iPhone too, and ONE tap enters immersive mode', () => {
    h.elements['touch']._ev.pointerdown({ pointerId: 1 });   // an interaction
    h.pump(1);
    assert.ok(T.renderer.fsButton, 'the button shows on the no-API phone');
    const prevented = tap(b.x + b.w / 2, b.y + b.h / 2);
    assert.ok(prevented, 'the tap was consumed by the button');
    assert.equal(fs.immersive(), true, 'immersive mode is ON');
    assert.ok(body.classList.contains('immersive'), 'body carries the .immersive class (the CSS hook)');
    h.pump(1);   // state.fsOverlay publishes per frame (syncChrome)
    assert.equal(st.fsOverlay.active, true, 'published active state mirrors immersive');
    assert.ok(fs.reapplies() >= 1, 'the address-bar collapse nudge ran on enter');
  });

  S.check('the Add-to-Home-Screen hint toasts exactly once per session', () => {
    const withHint = st.toasts.filter(t => /Add to Home Screen/.test(t.msg));
    assert.equal(withHint.length, 1, 'one honest-limits toast on first entry');
    fs.leave();
    h.pump(1);
    tap(b.x + b.w / 2, b.y + b.h / 2);                       // re-enter
    assert.equal(st.toasts.filter(t => /Add to Home Screen/.test(t.msg)).length, 1,
      'no second hint on re-entry');
    assert.equal(fs.immersive(), true, 'fixture: immersive again');
  });

  S.check('every interaction while immersive re-applies the bar-collapse nudge', () => {
    const before = fs.reapplies();
    h.elements['touch']._ev.pointerdown({ pointerId: 2 });
    assert.equal(fs.reapplies(), before + 1, 'the bump re-attempted the scroll nudge');
  });

  S.check('the layout SURVIVES a dynamic viewport change (bar collapse) and rotation', () => {
    const w0 = h.elements['game'].style.width;
    // the address bar collapsing = a taller viewport; Safari fires resize
    globalThis.window.innerWidth = 390; globalThis.window.innerHeight = 740;
    h.handlers['resize']();
    const w1 = h.elements['game'].style.width;
    assert.notEqual(w1, w0, 'fitCanvas re-ran on the resize (letterbox recomputed)');
    // rotation: portrait -> landscape
    globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390;
    h.handlers['orientationchange']();
    const w2 = h.elements['game'].style.width;
    assert.notEqual(w2, w1, 'orientationchange re-fit too (one shared path)');
    assert.equal(fs.immersive(), true, 'immersive survived both changes');
    globalThis.window.innerWidth = 480; globalThis.window.innerHeight = 300;
    h.handlers['resize']();
  });

  S.check('EXITABLE three ways: the button, the seam, and ESCAPE', () => {
    // 1. the button itself (the addendum's trap guard)
    fs.bump(); h.pump(1);
    tap(b.x + b.w / 2, b.y + b.h / 2);
    assert.equal(fs.immersive(), false, 'the button tap exits immersive');
    assert.ok(!body.classList.contains('immersive'), 'class removed');
    // 2. re-enter, then the keyboard gesture
    fs.bump(); h.pump(1);
    tap(b.x + b.w / 2, b.y + b.h / 2);
    assert.equal(fs.immersive(), true, 'fixture: immersive once more');
    h.key('keydown', { key: 'Escape' });
    assert.equal(fs.immersive(), false, 'Escape leaves immersive');
    // 3. the direct seam (the settings-card-shaped path)
    fs.bump(); h.pump(1);
    tap(b.x + b.w / 2, b.y + b.h / 2);
    fs.leave();
    assert.equal(fs.immersive(), false, 'leave() is a hard exit');
    assert.equal(T.renderer.fsButton !== null, true, 'the button still works after all the toggling');
  });
}

// ---------------------------------------------------------------------------
// GEOMETRY — the button's CSS box vs the DOM pads / joystick / HUD boxes at
// the two required phone sizes (390x844, 320x568) and the landscape case
// where the pads sit ON the letterboxed canvas (844x390). Canvas CSS box per
// the fitCanvas formula (scale = min(vw/480, vh/300), letterboxed at the
// wrap's centre); pad boxes per index.html (.pad: width 96, side/bottom
// inset 10; #joy: 120x120, bottom 14, centred) with a GENEROUS height bound
// (4 buttons on the 44px touch floor + gaps ~= 210; asserted at 260).
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'fs-geometry', fullscreen: true });
  const T = h.T;
  const fs = T.fullscreen;
  const b = fs.rect();
  const canvas = h.elements['game'];
  const origRect = canvas.getBoundingClientRect.bind(canvas);
  const overlaps = (a, c) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;

  const SIZES = [
    { name: '390x844 (iPhone portrait)', vw: 390, vh: 844 },
    { name: '320x568 (small phone portrait)', vw: 320, vh: 568 },
    { name: '844x390 (landscape — pads ON the canvas)', vw: 844, vh: 390 },
  ];
  const PAD_H = 260;   // generous: real 4x44+3x10 = 206 (+ safe-area slack)
  for (const s of SIZES) {
    const scale = Math.min(s.vw / C.VIEW_W, s.vh / C.VIEW_H);
    const cw = C.VIEW_W * scale, ch = C.VIEW_H * scale;
    const left = (s.vw - cw) / 2, top = (s.vh - ch) / 2;
    canvas.getBoundingClientRect = () =>
      ({ left, top, right: left + cw, bottom: top + ch, width: cw, height: ch });
    const btn = fs.rectCss(b.x, b.y, b.w, b.h);
    const pads = [
      { name: 'left pad', left: 10, right: 106, top: s.vh - 10 - PAD_H, bottom: s.vh - 10 },
      { name: 'right pad', left: s.vw - 106, right: s.vw - 10, top: s.vh - 10 - PAD_H, bottom: s.vh - 10 },
      { name: 'joystick', left: s.vw / 2 - 60, right: s.vw / 2 + 60, top: s.vh - 14 - 120, bottom: s.vh - 14 },
    ];
    S.check(`${s.name}: button clears every pad/joystick box (and stays inside the canvas)`, () => {
      assert.ok(btn.left >= left - 1e-6 && btn.right <= left + cw + 1e-6 &&
        btn.top >= top - 1e-6 && btn.bottom <= top + ch + 1e-6,
        `button inside the canvas box (got ${JSON.stringify(btn)})`);
      for (const p of pads) {
        assert.ok(!overlaps(btn, p), `no overlap with ${p.name}: ` +
          `button ${JSON.stringify(btn)} vs ${JSON.stringify(p)}`);
      }
    });
  }
  canvas.getBoundingClientRect = origRect;

  // HUD chrome non-overlap in VIEW coordinates (the one place both live):
  // generous boxes around the four documented HUD regions vs the button box.
  S.check('the button clears all four HUD chrome regions (view coords)', () => {
    const hudRegions = [
      { name: 'bars/feed (top-left)', left: 0, right: 210, top: 0, bottom: 60 },
      { name: 'clock/weather (top-right)', left: 270, right: 480, top: 0, bottom: 60 },
      { name: 'weapon/item rows (bottom-left)', left: 0, right: 210, top: 240, bottom: 300 },
      { name: 'radar (bottom-right)', left: 402, right: 470, top: 222, bottom: 290 },
    ];
    const vb = { left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h };
    for (const r of hudRegions) {
      assert.ok(!overlaps(vb, r), `no overlap with ${r.name}: ${JSON.stringify(vb)} vs ${JSON.stringify(r)}`);
    }
  });

  // THE PAINT EVIDENCE (the "shots"): with the recorder on, the visible
  // button paints its plate at the box and NOTHING fs-shaped paints once the
  // window closes — the headless equivalent of the visible/gone screenshots.
  S.check('paint evidence: plate at the box when visible, nothing when gone', () => {
    T.startRun();
    h.pump(2);
    h.rec.on = true;
    fs.bump(); h.pump(1);
    const plate = h.rec.rects.filter(r =>
      r.x === b.x && r.y === b.y && r.w === b.w && r.h === b.h);
    assert.ok(plate.length >= 1, 'the plate fillRect landed at the box');
    h.rec.on = false; h.rec.rects.length = 0; h.rec.texts.length = 0;
    h.pump(80);                                            // past the 1.3s window
    h.rec.on = true; h.pump(1);
    const gone = h.rec.rects.filter(r =>
      r.x === b.x && r.y === b.y && r.w === b.w && r.h === b.h);
    assert.equal(gone.length, 0, 'no plate once hidden');
    h.rec.on = false;
  });
}

S.done();
