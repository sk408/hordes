// CANVAS LADDER GUARD (owner 2026-09-17/18, msgs 78PTR + 7BRBS + 9MV7F +
// 9GX95). The REAL-browser proof is tools/verify_canvas_ladder.mjs (per-step
// canvas deltas, transience-pays check, reveal window, REAL tap tests, with
// shots); this node guard pins the three PURE halves a headless DOM reaches:
//   1. ladderDecide — the engage/relax thresholds and the hysteresis deadband
//      (a gain hovering at the boundary cannot flicker the strip);
//   2. pilotBadgeText — the compact A1/A2/M abbreviations (sacrifice 2) and
//      the full wording everywhere else, act suffix intact;
//   3. fsHitRect — the enlarged hit box geometry incl. EDGE_GUARD: 64x56 view
//      px, icon 22x18 fully covered, right flank clear of the pad seam.
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import assert from 'node:assert/strict';

const S = suite('test_canvas_ladder');
const h = await boot({ variant: 'ladder-pure' });
const T = h.T;

// ---------------------------------------------------------------------------
// 1. ladderDecide — thresholds + hysteresis (pure, no layout engine needed)
// ---------------------------------------------------------------------------
{
  const cfg = { GAIN_ENGAGE: 0.03, GAIN_RELEASE: 0.015 };
  const vh = 390;                       // the 844x390 arm's real numbers
  const dec = (gain, engaged) => T.ladderDecide(gain, vh, engaged, cfg);
  S.check('engage: gain >= 3% of vh turns transience ON (844x390 measured +59px = 15.1%)', () => {
    assert.equal(dec(59, false), true, 'the measured landscape gain engages');
    assert.equal(dec(0.03 * vh, false), true, 'exactly at the bar engages (>=)');
    assert.equal(dec(0.03 * vh - 0.01, false), false, 'just under does not');
  });
  S.check('relax: engaged stays engaged down to 1.5% vh, drops below it', () => {
    assert.equal(dec(0.02 * vh, true), true, 'inside the deadband: no flicker OFF');
    assert.equal(dec(0.015 * vh, true), true, 'exactly at the relax bar stays (>=)');
    assert.equal(dec(0.015 * vh - 0.01, true), false, 'under the relax bar lets go');
  });
  S.check('the deadband is a deadband: a gain between the bars NEVER changes state', () => {
    for (const gain of [0.016 * vh, 0.02 * vh, 0.029 * vh]) {
      assert.equal(dec(gain, false), false, gain + ' stays OFF once off');
      assert.equal(dec(gain, true), true, gain + ' stays ON once on');
    }
  });
  S.check('portrait honesty (7BRBS): a measured gain of 0 NEVER engages', () => {
    assert.equal(dec(0, false), false);
    assert.equal(dec(0, true), false, 'and relaxes even if it was on');
  });
}

// ---------------------------------------------------------------------------
// 2. pilotBadgeText — sacrifice 2's abbreviations (mapping pinned HERE)
// ---------------------------------------------------------------------------
{
  const pb = T.pilotBadgeText;
  S.check('compact rungs abbreviate to A1/A2/M; every other mode passes through', () => {
    assert.equal(pb('AUTO_ALL', null, true), 'A1');
    assert.equal(pb('AUTO_MOVE', null, true), 'A2');
    assert.equal(pb('MANUAL', null, true), 'M');
    assert.equal(pb('SOMEDAY', null, true), 'SOMEDAY', 'no silent renames of unknown modes');
  });
  S.check('full wording wherever the fit did not buy compact pads', () => {
    assert.equal(pb('AUTO_ALL', null, false), 'AUTO_ALL');
    assert.equal(pb('MANUAL', null, false), 'MANUAL');
  });
  S.check('the act suffix rides along in both forms (AUTO_ALL · FLEE, A1 · FLEE)', () => {
    assert.equal(pb('AUTO_ALL', 'FLEE', false), 'AUTO_ALL · FLEE');
    assert.equal(pb('AUTO_ALL', 'FLEE', true), 'A1 · FLEE');
    assert.equal(pb('AUTO_ALL', 'AUTO_ALL', true), 'A1', 'act == mode: no suffix');
  });
}

// ---------------------------------------------------------------------------
// 3. fsHitRect — the enlarged target's geometry (9GX95 + EDGE_GUARD)
// ---------------------------------------------------------------------------
{
  const icon = T.fullscreen.rect();
  const hit = T.fullscreen.hitRect();
  S.check('icon unchanged 22x18 at INSET 8; hit box 64x56, fully covering the icon', () => {
    assert.equal(icon.w, C.FULLSCREEN.W);
    assert.equal(icon.h, C.FULLSCREEN.H);
    assert.equal(icon.x, C.VIEW_W - C.FULLSCREEN.INSET - C.FULLSCREEN.W);
    assert.equal(hit.w, C.FULLSCREEN.HIT_W);
    assert.equal(hit.h, C.FULLSCREEN.HIT_H);
    assert.ok(hit.x <= icon.x && hit.x + hit.w >= icon.x + icon.w,
      'icon inside the hit box horizontally');
    assert.ok(hit.y <= icon.y && hit.y + hit.h >= icon.y + icon.h,
      'icon inside the hit box vertically');
  });
  S.check('EDGE_GUARD: the right flank stays this far off the view edge (the pad seam)', () => {
    assert.equal(hit.x + hit.w, C.VIEW_W - C.FULLSCREEN.EDGE_GUARD,
      'clamped by the guard, not the view edge');
    assert.equal(hit.x + hit.w, icon.x + icon.w,
      'the guard puts the hit right edge exactly on the ICON right edge — full cover, no pad brush');
    assert.ok(hit.x >= 0 && hit.y >= 0 && hit.y + hit.h <= C.VIEW_H, 'inside the view');
  });
  S.check('>= 44 CSS px at every acceptance letterbox (visual = hit * canvasW/480)', () => {
    // canvas CSS widths from the verifier's arms: portrait 390 (scale 0.8125)
    // is the tightest acceptance letterbox.
    for (const cw of [390, 480, 620]) {
      const s = cw / C.VIEW_W;
      assert.ok(hit.w * s >= 44, 'width ' + hit.w * s + ' at canvas ' + cw);
      assert.ok(hit.h * s >= 44, 'height ' + hit.h * s + ' at canvas ' + cw);
    }
  });
}

S.done();
