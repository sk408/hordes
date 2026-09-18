// UI-FIT GUARD (owner 2026-09-18, msg_01M2S72CF4902CWRWE7VJ3Y22M — "the whole
// interface should be able to shrink itself to fit" a hosted viewport whose
// header ate vertical space). The REAL-browser proof is
// tools/verify_host_fit.mjs (iframe + header 56/90 at the acceptance matrix,
// with shots); this node guard pins the PURE scale arithmetic (main.js
// uiFitScale, exposed via __TEST) a headless DOM can reach:
//   - no overhang -> scale 1 (a standalone phone never shrinks);
//   - an overhanging bound (a pad stack taller than a hosted landscape box)
//     yields the exact centre-origin scale that pulls it on-screen;
//   - the legibility FLOOR clamps and flags (floored: true) instead of
//     shrinking text into mud;
//   - the applied seam defaults to 1 headlessly (no layout engine, no clip).
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import assert from 'node:assert/strict';

const S = suite('test_ui_fit');

{
  const h = await boot({ variant: 'ui-fit' });
  const uiFitScale = h.T.uiFitScale;
  const FLOOR = C.UI_FIT.SCALE_FLOOR;

  // Visual position under the centre-origin transform the code applies —
  // exactly the paint math uiFitScale's bounds are derived from.
  const vis = (p, s, vw, vh) => ({
    x: vw / 2 + (p.x - vw / 2) * s,
    y: vh / 2 + (p.y - vh / 2) * s,
  });

  S.check('no overhang -> scale 1 (standalone sizes never shrink)', () => {
    for (const [vw, vh] of [[844, 390], [390, 844], [320, 568], [1280, 800]]) {
      const st = uiFitScale(vw, vh, { left: 0, top: 0, right: vw, bottom: vh }, FLOOR);
      assert.equal(st.scale, 1, vw + 'x' + vh);
      assert.equal(st.floored, false);
    }
  });

  S.check('a hosted landscape box shorter than the pad stack shrinks JUST enough', () => {
    // 844x390 phone, 56px host header -> 334px box: the 306px pad+cog
    // footprint stays inside, but the 90px header case (300px box) leaves the
    // 296px pad stack + inset overhanging the top by 11px in layout space.
    const vw = 844, vh = 300;
    const b = { left: 0, top: -11, right: vw, bottom: vh };
    const st = uiFitScale(vw, vh, b, FLOOR);
    assert.ok(st.scale < 1, 'engaged (got ' + st.scale + ')');
    assert.ok(st.scale >= FLOOR, 'never below the floor');
    assert.equal(st.floored, false);
    // the paint math: the overhanging edge lands ON screen, exactly.
    const t = vis({ x: 0, y: b.top }, st.scale, vw, vh).y;
    assert.ok(t >= -0.001, 'visual top on-screen (' + t + ')');
    // and the far edge stays inside too.
    const bot = vis({ x: 0, y: b.bottom }, st.scale, vw, vh).y;
    assert.ok(bot <= vh + 0.001, 'visual bottom on-screen (' + bot + ')');
  });

  S.check('right/bottom overhangs scale by the same rule (host narrows the box)', () => {
    const vw = 667, vh = 285;
    const b = { left: 0, top: -21, right: vw + 5, bottom: vh };
    const st = uiFitScale(vw, vh, b, FLOOR);
    assert.ok(st.scale < 1, 'engaged');
    const p1 = vis({ x: b.right, y: b.top }, st.scale, vw, vh);
    assert.ok(p1.x <= vw + 0.001 && p1.y >= -0.001, 'corner pulled on-screen (' + JSON.stringify(p1) + ')');
  });

  S.check('the legibility FLOOR stops the shrink and SAYS so (stated degradation)', () => {
    // a 200px-tall landscape box: wanted scale would be ~0.56 — text mud.
    const vw = 844, vh = 200;
    const st = uiFitScale(vw, vh, { left: 0, top: -106, right: vw, bottom: vh }, FLOOR);
    assert.ok(st.wanted < FLOOR, 'wanted below the floor (' + st.wanted + ')');
    assert.equal(st.scale, FLOOR, 'clamped AT the floor');
    assert.equal(st.floored, true, 'flagged — the residual clip is reportable');
  });

  S.check('the live seam defaults to 1 headlessly (no layout engine, no clip)', () => {
    assert.equal(h.T.uiFit.applied, 1);
    const vs = h.T.viewSize();
    assert.ok(vs.vw > 0 && vs.vh > 0,
      'viewport source falls back to innerWidth/Height without visualViewport');
  });
}

S.done();
