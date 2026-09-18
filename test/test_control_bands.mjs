// CONTROL BANDS GUARD (owner 2026-09-18, msg_01M2S6XRT0 — "keep the buttons
// off the canvas in landscape"). The REAL-browser proof is
// tools/verify_control_bands.mjs (getBoundingClientRect arithmetic at the
// acceptance matrix, with shots); this node guard pins the two halves a
// headless DOM can actually reach:
//   1. the PURE band-fit arithmetic (main.js bandFit, exposed via __TEST):
//      at every matrix size the fitted canvas rect has ZERO intersection
//      with every reserved band rect, stays inside the viewport, keeps the
//      480x300 aspect, and holds the R4 floor — and below the breaking size
//      it takes the NAMED FALLBACK (round-4 letterbox) instead of collapsing;
//   2. the STEER-ZONE routing: a press on #steer-zone (the stick's HOME
//      band) arms the SAME floating stick the canvas arms, with every guard
//      intact (help mode declines, AUTO modes decline, release brakes).
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import assert from 'node:assert/strict';

const S = suite('test_control_bands');

// Band model measured from index.html (the verifier measures LIVE; this is
// the same arithmetic for the pure function): pads 96 wide at inset 10
// (286 tall + 10 bottom = 296 from the bottom in portrait), cog row bottom
// 56 from the top (+6 BAND_MARGIN = 62).
const PAD_W = 96, INSET = 10, COG_TOP_BAND = 62, MARGIN = 6;
function bandsFor(vw, vh) {
  const landscape = vw > vh;
  const padH = 4 * 64 + 3 * 10 + INSET;   // 296: fixed 64px buttons + gaps + bottom inset
  const b = { left: 0, right: 0, top: COG_TOP_BAND, bottom: 0,
    padTop: vh - padH, padInnerLeft: INSET + PAD_W, padInnerRight: vw - INSET - PAD_W };
  if (landscape) {
    b.left = INSET + PAD_W + MARGIN;
    b.right = INSET + PAD_W + MARGIN;
  } else {
    b.bottom = padH + MARGIN;
  }
  return b;
}
const bandRects = (vw, vh, b) => {
  const rs = [
    { name: 'top chrome band', left: 0, right: vw, top: 0, bottom: b.top },
  ];
  if (b.left) rs.push({ name: 'left band', left: 0, right: b.left, top: 0, bottom: vh });
  if (b.right) rs.push({ name: 'right band', left: vw - b.right, right: vw, top: 0, bottom: vh });
  if (b.bottom) rs.push({ name: 'bottom band', left: 0, right: vw, top: vh - b.bottom, bottom: vh });
  return rs;
};
const overlaps = (a, r) => a.left < r.right && a.left + a.w > r.left &&
  a.top < r.bottom && a.top + a.h > r.top;

// ---------------------------------------------------------------------------
// 1. the pure fit, across the acceptance matrix
// ---------------------------------------------------------------------------
{
  const MATRIX = [
    { name: '844x390 (landscape)', vw: 844, vh: 390 },
    { name: '896x414 (landscape)', vw: 896, vh: 414 },
    { name: '780x360 (landscape)', vw: 780, vh: 360 },
    { name: '390x844 (portrait)', vw: 390, vh: 844 },
    { name: '320x568 (portrait)', vw: 320, vh: 568 },
  ];
  // bandFit is pure — a bare import of main.js is not needed; but it lives
  // behind __TEST, so boot once (desktop: no touch layout, cheap) and read it.
  const h = await boot({ variant: 'cb-pure' });
  const bandFit = h.T.bandFit;
  for (const s of MATRIX) {
    const b = bandsFor(s.vw, s.vh);
    const bf = bandFit(s.vw, s.vh, b);
    S.check(`${s.name}: fitted canvas clears every band, keeps aspect + floor`, () => {
      assert.equal(bf.fallback, false, `no fallback (got h=${bf.h}, floor=${bf.floor})`);
      const cv = { left: bf.left, top: bf.top, w: bf.w, h: bf.h };
      for (const r of bandRects(s.vw, s.vh, b)) {
        assert.ok(!overlaps(cv, r),
          `canvas ${JSON.stringify(cv)} overlaps ${r.name} ${JSON.stringify(r)}`);
      }
      assert.ok(cv.left >= -0.01 && cv.top >= -0.01 &&
        cv.left + cv.w <= s.vw + 0.01 && cv.top + cv.h <= s.vh + 0.01,
        'canvas inside the viewport');
      assert.ok(Math.abs(bf.w / bf.h - C.VIEW_W / C.VIEW_H) < 0.01, 'aspect preserved (letterbox, not zoom)');
      assert.ok(bf.h >= Math.min(0.55 * s.vh, s.vw / 1.6) - 1.01, 'R4 floor held (1px rounding slack, same as main.js)');
    });
  }
  S.check('below the breaking size the NAMED FALLBACK stands (never a collapse)', () => {
    // 480x320 landscape: side bands 112+112 leave 256 wide -> h=160 < floor
    // 176 -> fallback to the round-4 viewport-limited letterbox (overlap
    // accepted), which the browser verifier reports at this class of size.
    const bf = bandFit(480, 320, bandsFor(480, 320));
    assert.equal(bf.fallback, true, 'falls back');
    assert.ok(bf.h < bf.floor, 'and only because the floor was missed');
  });
}

// ---------------------------------------------------------------------------
// 2. the steer-zone routing (the stick's HOME band, off-canvas)
// ---------------------------------------------------------------------------
{
  const h = await boot({ variant: 'cb-zone', device: 'touch',
    storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = T.state;
  const fj = T.fjoy;
  const zone = h.elements['steer-zone'];
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  h.pump(1);
  const zdown = (x, y, id = 21) => zone._ev.pointerdown({
    clientX: x, clientY: y, pointerId: id, preventDefault() {},
  });
  S.check('a press on the HOME band arms the SAME floating stick', () => {
    zdown(40, 200);   // the left band (landscape home) / off-canvas anywhere
    assert.equal(fj.armed(), true, 'armed from the zone');
    assert.deepEqual(fj.origin(), { x: 40, y: 200, rad: C.JOY.FLOAT_R },
      'origin at the zone press point');
    h.handlers['pointermove']({ clientX: 100, clientY: 200, pointerId: 21, preventDefault() {} });
    assert.equal(T.pilotInput.x, 1, 'the drag steers, exactly like a canvas arm');
    assert.equal(T.pilotInput.mag, 1, 'full deflection at one radius');
    h.handlers['pointerup']({ pointerId: 21 });
    assert.equal(fj.armed(), false, 'release brakes (dead stop)');
    assert.equal(T.pilotInput.mag, 0, 'no coast');
  });
  S.check('the zone honours every guard: help mode declines, AUTO modes TAKE THE WHEEL', () => {
    st.helpMode = true;
    zdown(40, 200);
    assert.equal(fj.armed(), false, 'help mode owns the tap');
    st.helpMode = false;
    // RETARGET 2026-09-18 (THE WHEEL IS YOURS, owner directive; the takeover
    // lane's main.js work + test_takeover.mjs): a field/zone drag while the
    // pilot flies on AUTO is the deliberate hand-over — the stick arms AND
    // the mode switches to MANUAL. The old "AUTO_ALL declines" contract was
    // replaced by the owner, not weakened away.
    T.setPilotMode('AUTO_ALL');
    h.pump(1);
    zdown(40, 200);
    assert.equal(fj.armed(), true, 'a zone press in AUTO_ALL arms the stick (the takeover)');
    assert.equal(st.pilotMode, 'MANUAL', 'the takeover switches the mode to MANUAL');
    h.handlers['pointerup']({ pointerId: 21 });
    T.setPilotMode('MANUAL');
    h.pump(1);
  });
  S.check('canvas arm and zone arm are ONE mechanism (either releases cleanly)', () => {
    h.elements['game']._ev.pointerdown({ clientX: 300, clientY: 150, pointerId: 31, preventDefault() {} });
    assert.equal(fj.armed(), true, 'canvas arm');
    zdown(40, 200, 22);   // a second finger on the zone while the canvas steers
    assert.deepEqual(fj.origin(), { x: 300, y: 150, rad: C.JOY.FLOAT_R },
      'one stick at a time — the zone press did not steal the canvas stick');
    h.handlers['pointerup']({ pointerId: 31 });
    assert.equal(fj.armed(), false, 'clean release');
  });
}

S.done();
