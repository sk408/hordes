// HORDES - headless tests for src/intro.js, the launch movie (node, no DOM).
// R2 row 5: one 5 s road shot that flows into the title painting for a new
// player; a 1 s title stamp (1.5 s to the menu) for a returning player; a
// still of the title under reduced motion.
// Run: node test/test_intro.mjs
import {
  render, isDone, phaseAt, durationOf, PHASES, STAMP_PHASES, INTRO_DURATION, STAMP_DURATION,
  STILL_DURATION, TITLE_IMPACT, STAMP_IMPACT, INTRO_TEST,
} from '../src/intro.js';
import { drawTitle, TITLE_LAYERS } from '../src/art/title.js';
import { hordePose, bossPose, heroPose, drawRoad } from '../src/escape_cine_art.js';
import { enemySpriteFor } from '../src/enemy_sprites.js';
import { pilotLook } from '../src/movie_cast.js';

let failed = 0, passed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---- a 480x300 raster that honours fillStyle, globalAlpha (as a blend
// marker), save/restore and rect clips: enough to compare two pictures.
const W = 480, H = 300;
function raster() {
  const px = new Array(W * H).fill('');
  const st = { fillStyle: '#000', globalAlpha: 1, clip: null };
  const stack = [];
  let path = [];
  const calls = { fillRect: 0, rect: 0, clip: 0, styles: new Set() };
  const g = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    font: '', textAlign: '', textBaseline: '',
    save() { stack.push({ ...st }); },
    restore() { Object.assign(st, stack.pop() || {}); },
    beginPath() { path = []; },
    rect(x, y, w, h) { calls.rect++; path.push([x, y, w, h]); },
    clip() { calls.clip++; st.clip = path.slice(); },
    translate() {}, setTransform() {}, drawImage() {}, fillText() {}, measureText: () => ({ width: 0 }),
    fillRect(x, y, w, h) {
      calls.fillRect++;
      const col = st.globalAlpha >= 1 ? st.fillStyle : st.fillStyle + '@' + st.globalAlpha.toFixed(2);
      calls.styles.add(st.fillStyle);
      const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          if (st.clip && !st.clip.some(([cx, cy, cw, ch]) => xx >= cx && xx < cx + cw && yy >= cy && yy < cy + ch)) continue;
          px[yy * W + xx] = col;
        }
      }
    },
  };
  return { g, px, calls };
}
function shot(t, opts) { const r = raster(); render(r.g, t, opts); return r; }
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

// The title screen exactly as render.js drawTitleScreen paints it: the
// backdrop, then every layer pixel by pixel through drawGrid.
const titleScreen = (() => {
  const r = raster();
  r.g.fillStyle = '#05050a'; r.g.fillRect(0, 0, W, H);
  drawTitle((g, grid, pal, x, y) => {
    for (let ry = 0; ry < grid.length; ry++) for (let rx = 0; rx < grid[ry].length; rx++) {
      const v = grid[ry][rx];
      if (v) { g.fillStyle = pal[v]; g.fillRect(x + rx, y + ry, 1, 1); }
    }
  }, r.g, 0, 0);
  return r.px;
})();
// Colours only the logo uses (none of the sky, horizon or frame have them).
const LOGO = new Set(INTRO_TEST.LOGO_IDS);
const coloursOf = (pick) => new Set(TITLE_LAYERS.filter(pick).flatMap(L => L.grid.flat().filter(Boolean).map(v => L.palette[v])));
const notLogo = coloursOf(L => !LOGO.has(L.id));
const logoOnly = [...coloursOf(L => LOGO.has(L.id))].filter(c => !notLogo.has(c));
const logoPixels = (px) => px.filter(c => logoOnly.includes(c)).length;

const ROAD = {}, STAMP = { returning: true }, STILL = { reduced: true };
const STILL_AND_STAMP = { reduced: true, returning: true };

console.log('TIMELINES:');
{
  ok(INTRO_DURATION === 5000 && durationOf(ROAD) === 5000 && durationOf(undefined) === 5000, 'a new player: the road is 5 s');
  ok(STAMP_DURATION === 1000 && durationOf(STAMP) === 1000, 'a returning player: the stamp is 1 s (the menu fade makes 1.5 s)');
  ok(STILL_DURATION === 1000 && durationOf(STILL) === 1000 && durationOf(STILL_AND_STAMP) === 1000, 'reduced motion: a 1 s still, returning or not');
  ok(PHASES.CHASE[0] === 0 && PHASES.TITLE[1] === INTRO_DURATION, 'the road phases cover 0..5 s');
  ok(PHASES.CHASE[1] === PHASES.OVERTAKE[0] && PHASES.OVERTAKE[1] === PHASES.FADE[0] && PHASES.FADE[1] === PHASES.TITLE[0],
    'the road phases follow each other with no gap');
  ok(phaseAt(500) === 'CHASE' && phaseAt(2000) === 'OVERTAKE' && phaseAt(3800) === 'FADE' &&
     phaseAt(TITLE_IMPACT - 1) === 'FADE' && phaseAt(TITLE_IMPACT) === 'TITLE' && phaseAt(5000) === 'DONE',
    'the road: CHASE, OVERTAKE (drone), FADE (sweep), TITLE at the landing (slam), DONE');
  ok(phaseAt(100, STAMP) === 'ARRIVE' && phaseAt(STAMP_IMPACT - 1, STAMP) === 'ARRIVE' &&
     phaseAt(STAMP_IMPACT, STAMP) === 'TITLE' && phaseAt(1000, STAMP) === 'DONE',
    'the stamp: the slam fires when the logo lands');
  ok(phaseAt(0, STILL) === 'STILL' && phaseAt(1000, STILL) === 'DONE', 'the still: no stinger phase');
  ok(!isDone(4999) && isDone(5000) && !isDone(999, STAMP) && isDone(1000, STAMP) && isDone(1000, STILL),
    'isDone flips at each cut\'s end');
}

console.log('THE ROAD (a new player):');
{
  const hero = pilotLook('WITCH');
  const scene = INTRO_TEST.roadScene('WITCH');
  ok(scene.character === 'WITCH', 'the road runs the pilot it is handed');
  ok(scene.stage === INTRO_TEST.STAGE && scene.noBoss === true && scene.lungers.length === 0,
    'no boss and no lunges on the road (' + scene.stage + ')');
  ok([1, 2.5, 4, 4.9].every(s => bossPose(scene, s) === null), 'the boss never shows');
  // The horde comes over the crest and closes on the hero's heels.
  const nearest = (s) => Math.min(...scene.horde.map((_, i) => hordePose(scene, i, s)).filter(Boolean).map(p => p.d));
  const n0 = nearest(0.2), n1 = nearest(1.5), n2 = nearest(3.3);
  ok(n0 > n1 && n1 > n2, `the horde gains (nearest depth ${n0.toFixed(2)} -> ${n1.toFixed(2)} -> ${n2.toFixed(2)})`);
  ok(n2 < 2.6 && n0 > 6, 'from far back to just behind him (the hero runs at depth 1)');
  ok(scene.horde.map((_, i) => hordePose(scene, i, 0.3)).filter(Boolean).length >= 3, 'the horde is in view from the first second');
  // The hero only weaves: no dodge away from a lunge.
  const xs = [3.4, 3.5, 3.6, 4.6, 4.7].map(s => Math.abs(heroPose(scene, s).x));
  ok(xs.every(x => x <= 2.21), 'the hero only weaves (no dodges): ' + xs.map(x => x.toFixed(2)).join(','));
  // The hero is drawn in his own colours, early and through the dissolve's first half.
  const r = shot(1000, { hero });
  const heroCols = new Set(hero.frames[1].flat().filter(Boolean).map(v => hero.palette[v]));
  ok([...heroCols].every(c => r.calls.styles.has(c)), 'the hero is drawn in the pilot\'s colours at 1 s');
  ok(logoPixels(r.px) === 0 && r.calls.clip === 0, 'no painting and no logo on the road at 1 s');
  // The horde is painted, not only placed: the road at 3 s against the same
  // road with no horde. The colours only the first one uses must come from
  // the horde's own sprites.
  const roadAt3 = shot(3000, { hero });
  const empty = raster();
  drawRoad(empty.g, { ...scene, horde: [] }, 3);
  const hordeCols = new Set(scene.horde.flatMap(m => Object.values(enemySpriteFor(m.type).palette)));
  const extra = [...roadAt3.calls.styles].filter(c => !empty.calls.styles.has(c));
  ok(extra.length >= 3 && extra.every(c => hordeCols.has(c)),
    `the horde is drawn on the road at 3 s (${extra.length} colours of its sprites)`);
  const hordePx = roadAt3.px.filter((c, i) => c !== empty.px[i]).length;
  ok(hordePx > 400, `and it covers part of the picture (${hordePx} pixels differ from an empty road)`);
}

console.log('THE DISSOLVE into the painting:');
{
  const at = (t) => shot(t);
  ok(at(PHASES.FADE[0] - 1).calls.rect === 0, 'nothing of the painting before the dissolve');
  const cellsAt = (t) => at(t).calls.rect;
  const { COLS, ROWS } = INTRO_TEST.cells;
  const a = cellsAt(3600), b = cellsAt(3900), c = cellsAt(4300);
  ok(a > 0 && a < b && b < c && c <= COLS * ROWS, `the painting takes more of the picture as it runs (${a} < ${b} < ${c} of ${COLS * ROWS} cells)`);
  // Top down: the sky turns first, the road under the hero last.
  const mid = shot(3800).px;
  const titleRows = (y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (mid[y * W + x] === titleScreen[y * W + x]) n++; return n; };
  ok(titleRows(0, 60) > titleRows(240, 300) * 2, 'the dissolve runs from the top down');
  ok(logoPixels(shot(PHASES.TITLE[0] - 1).px) === 0, 'the logo is not on the painting before it falls');
  ok(diff(shot(PHASES.TITLE[0] - 1).px, titleScreen) > 0, 'and the painting without it is not yet the title');
}

console.log('THE LANDING (no cut into the title):');
{
  const before = shot(TITLE_IMPACT - 1).px, landed = shot(TITLE_IMPACT + 200).px;
  ok(logoPixels(before) > 0 && diff(before, titleScreen) > 0, 'one frame before the landing the logo is still falling');
  ok(same(landed, titleScreen), 'after the landing the picture IS the title screen');
  ok(same(shot(INTRO_DURATION - 1).px, titleScreen), 'the last frame of the road is the title screen, pixel for pixel');
  const shake = shot(TITLE_IMPACT + 20).px;
  ok(!same(shake, titleScreen), 'the landing shakes the picture');
  ok(same(shot(STAMP_DURATION - 1, STAMP).px, titleScreen), 'the last frame of the stamp is the title screen');
  ok(same(shot(0, STILL).px, titleScreen) && same(shot(STILL_DURATION - 1, STILL).px, titleScreen),
    'the still is the title screen from its first frame to its last (nothing moves)');
  // Reduced motion wins over returning: the still, never the falling logo.
  ok(phaseAt(600, STILL_AND_STAMP) === 'STILL' && phaseAt(100, STILL_AND_STAMP) === 'STILL',
    'reduced motion and a finished run: the still phase, not the stamp');
  ok([0, 100, 350, 510, 600, STILL_DURATION - 1].every(t => same(shot(t, STILL_AND_STAMP).px, titleScreen)),
    'reduced motion and a finished run: the title screen at every frame (no fade in, no drop, no shake)');
}

console.log('THE STAMP (a returning player):');
{
  const dark = shot(0, STAMP);
  ok(dark.px.every(c => c === '#05050a'), 'it comes up out of black');
  const half = shot(100, STAMP).px;
  ok(half.some(c => c.startsWith('#05050a@')), 'and the painting comes up through it');
  ok(logoPixels(shot(STAMP_PHASES.DROP[0] - 1, STAMP).px) === 0, 'no logo before the drop');
  const falling = shot(STAMP_IMPACT - 60, STAMP).px;
  ok(logoPixels(falling) > 0 && !same(falling, titleScreen), 'the logo is falling');
  ok(shot(500, STAMP).calls.rect === 0, 'no road and no dissolve on the stamp');
}

console.log('DETERMINISM:');
{
  for (const [t, o] of [[0, ROAD], [1234, ROAD], [3850, ROAD], [4720, ROAD], [300, STAMP], [10, STILL]]) {
    ok(same(shot(t, o).px, shot(t, o).px), `t=${t}: the same picture twice`);
  }
  ok(!same(shot(1000).px, shot(2000).px), 'different times differ');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log(`\nALL INTRO TESTS PASSED (${passed})`);
