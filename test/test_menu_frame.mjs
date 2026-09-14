// HORDES — U1b AUTHORED PIXEL FRAME tests (owner 2026-09-14: "custom somewhat
// like this.. like it is part of the screen").
//
// The CSS clip-path plaque is gone: every .card now carries its own canvas
// child painted with the authored 9-slice frame (src/art/menu_frame.js)
// through the renderer's drawGrid seam, sized card-box + shadow offset so the
// cast shadow is painted pixels OUTSIDE the card box. This file pins:
//   1. the composed grid is the game's INTEGER format (0 = transparent — the
//      string-grid trap that once rendered the header coin as a solid block);
//   2. the 9-slice anatomy: stepped transparent corners, lit top lip, shaded
//      bottom/right lips, tan frame band, inner keyline, plank centre, and
//      the semi-transparent shadow spilling bottom-right past the card box
//      with NO spill above or left;
//   3. the live menu contract: elements['ov-cards'].children[i] is STILL the
//      clickable card (no wrapper), it carries a canvas.frame child, and its
//      innerHTML text contract is untouched.
//
// Run: node test/test_menu_frame.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import {
  composeMenuFrame, MENU_FRAME_PALETTES, MENU_FRAME_SHADOW, MENU_FRAME_K,
} from '../src/art/menu_frame.js';

const S = suite('U1b menu frame');

// ---- 1. the grid format (integer, 0 = transparent) ---------------------------
const W = 120, H = 80;
const f = composeMenuFrame(W, H);
const at = (x, y) => f.grid[y][x];

S.check('the composed grid is integer pixels sized card box + shadow offset', () => {
  assert.equal(f.w, W + MENU_FRAME_SHADOW.dx);
  assert.equal(f.h, H + MENU_FRAME_SHADOW.dy);
  assert.equal(f.grid.length, f.h);
  for (const row of f.grid) {
    assert.equal(row.length, f.w);
    for (const v of row) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 9,
        'every cell is an integer palette key 0..9 (never a string): ' + v);
    }
  }
});

// ---- 2. the 9-slice anatomy --------------------------------------------------
S.check('stepped corners are transparent outside the silhouette', () => {
  assert.equal(at(0, 0), 0, 'TL corner outside the cut');
  assert.equal(at(5, 0), 0, 'TL top edge starts at the step');
  assert.equal(at(f.w - 1, 0), 0, 'TR corner outside the cut');
  assert.equal(at(0, H - 1), 0, 'BL corner outside the cut');
  // The plaque's BR cut REVEALS the cast shadow behind it (the light is
  // top-left, so the shadow falls bottom-right) — but the shadow's OWN
  // silhouette keeps the stepped cut, so the composite shape stays stepped.
  assert.equal(at(W - 1, H - 1), 9, 'the BR cut shows the cast shadow');
  assert.equal(at(f.w - 1, f.h - 1), 0, 'the shadow silhouette is stepped too');
  assert.equal(at(6, 0), 1, 'the top edge keyline starts after the step');
});

S.check('one light source: lit top/left lips, shaded bottom/right lips', () => {
  assert.equal(at(60, 1), 2, 'top lip is the LIT tone');
  assert.equal(at(1, 40), 3, 'left lip is the lit tone');
  assert.equal(at(60, H - 2), 8, 'bottom lip is the SHADED tone');
  assert.equal(at(W - 2, 40), 8, 'right lip is the SHADED tone');
});

S.check('frame band, shade step, inner keyline, plank centre', () => {
  assert.equal(at(60, 2), 4, 'tan frame band');
  assert.equal(at(60, 3), 4, 'tan frame band is 2px');
  assert.equal(at(60, 4), 5, 'frame shade step');
  assert.equal(at(60, 5), 1, 'inner keyline');
  assert.equal(at(60, 7), 7, 'lit plank band under the top frame');
  assert.equal(at(60, 40), 6, 'plank centre');
});

S.check('the cast shadow spills bottom-right OUTSIDE the card box, never top/left', () => {
  assert.equal(at(60, H + 1), 9, 'shadow below the bottom edge');
  assert.equal(at(60, H + MENU_FRAME_SHADOW.dy - 1), 9, 'shadow reaches the full dy');
  assert.equal(at(W + 1, 40), 9, 'shadow right of the right edge');
  assert.equal(at(W + MENU_FRAME_SHADOW.dx - 1, 40), 9, 'shadow reaches the full dx');
  assert.equal(f.grid[H + MENU_FRAME_SHADOW.dy], undefined, 'grid ends at the offset');
  // The shadow is semi-transparent so the screen art shows through it.
  assert.ok(/^rgba\(/.test(MENU_FRAME_PALETTES.base[9]), 'the shadow is rgba, not a flat fill');
  // All three states share the silhouette: palettes only.
  for (const tone of ['base', 'hot', 'sel']) {
    const keys = Object.keys(MENU_FRAME_PALETTES[tone]).sort();
    assert.deepEqual(keys, ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
      tone + ' palette covers every key');
  }
});

S.check('edges tile: the 9-slice repeats its edge and centre tiles', () => {
  assert.equal(at(MENU_FRAME_K, 2), at(MENU_FRAME_K + 8, 2), 'top edge tiles at 8px');
  assert.equal(at(2, MENU_FRAME_K), at(2, MENU_FRAME_K + 8), 'left edge tiles at 8px');
  assert.equal(at(40, 40), at(48, 48), 'centre tiles at 8px');
});

// ---- 3. the live menu contract (shared harness, REAL main.js) ----------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
h.pump(3);
if (st.mode === 'intro') { h.key('keydown', { key: 'x', preventDefault() {} }); h.pump(2); }
T.showTitle();

S.check('ov-cards children are STILL the clickable cards, each with a frame canvas', () => {
  const cards = h.elements['ov-cards'].children;
  assert.ok(cards.length >= 6, 'the title menu built (cards=' + cards.length + ')');
  for (const c of cards) {
    const frames = c.children.filter(k => k && k.className === 'frame');
    assert.equal(frames.length, 1, 'exactly one canvas.frame child per card');
    assert.ok((c.innerHTML || '').includes('class="name"'), 'the text contract is intact');
    assert.equal(typeof c.click, 'function', 'the card itself stays the click target');
  }
});

S.check('START GAME is children[0] and EXIT GAME last, frame canvases included', () => {
  const cards = h.elements['ov-cards'].children;
  assert.ok((cards[0].innerHTML || '').includes('>START GAME<'), 'children[0] is START GAME');
  const last = cards[cards.length - 1];
  assert.ok((last.innerHTML || '').includes('>EXIT GAME<'), 'EXIT GAME stays last');
  // Clicking children[0] still drives the title hold (not a wrapper).
  const before = T.title.runStarts;
  cards[0].click();
  assert.ok(st.titleReveal && st.titleReveal.phase === 'out',
    'the click reached the card (the N2 hold began)');
  assert.equal(T.title.runStarts, before, 'the hold, not an instant start');
});

S.check('a state swap is a palette swap on the SAME grid (silhouette cannot jump)', () => {
  assert.notEqual(MENU_FRAME_PALETTES.hot[4], MENU_FRAME_PALETTES.base[4], 'hover recolours the frame');
  assert.notEqual(MENU_FRAME_PALETTES.sel[4], MENU_FRAME_PALETTES.base[4], 'selected recolours the frame');
  assert.equal(MENU_FRAME_PALETTES.hot[9], MENU_FRAME_PALETTES.base[9], 'the shadow is state-invariant');
});

S.done();
