// HORDES — headless tests for src/sprites.js (node, no DOM).
// Run: node test/test_sprites.mjs
import {
  SPRITES, SPRITE_ARCHETYPES, BOSS_SPRITE,
  FLAME_FRAMES, SMALL_FLAME_FRAMES, FLAME,
  spriteBox,
} from '../src/sprites.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const TYPE_IDS = ['CHASER', 'SWARMER', 'BRUTE', 'SPITTER', 'WARLOCK', 'TICK', 'COLOSSUS', 'DASHER'];

// ---------- Grid well-formedness ----------
// Every frame of every sprite must be rectangular and non-empty.
function checkGrids(label, frames, palette) {
  ok(frames.length > 0, `${label}: has frames`);
  const h = frames[0].length;
  const w = frames[0][0].length;
  ok(h > 0 && w > 0, `${label}: frame 0 non-empty (${w}x${h})`);
  for (let f = 0; f < frames.length; f++) {
    const g = frames[f];
    ok(g.length === h && g.every(r => r.length === w),
       `${label}: frame ${f} rectangular ${w}x${h}`);
  }
  if (palette) {
    const used = new Set();
    for (const g of frames) for (const row of g) for (const v of row) if (v) used.add(v);
    const missing = [...used].filter(v => !palette[v]);
    ok(missing.length === 0,
       `${label}: palette resolves every index used (${[...used].sort().join(',')})`);
    const badKeys = Object.keys(palette).filter(k => !/^[1-9]$/.test(k));
    ok(badKeys.length === 0, `${label}: palette keys are 1-9`);
    ok(used.size > 0, `${label}: sprite actually uses palette pixels`);
  }
}

console.log('ENEMY SPRITES:');
for (const id of TYPE_IDS) {
  const s = SPRITES[id];
  ok(!!s, `SPRITES.${id} exists`);
  if (!s) continue;
  checkGrids(id, s.frames, s.palette);
  ok(s.frames.length === 2, `${id}: exactly 2 walk frames`);
  ok(s.box.w === s.frames[0][0].length && s.box.h === s.frames[0].length,
     `${id}: box matches pixels (${s.box.w}x${s.box.h})`);
  ok(s.anchor.x === Math.floor(s.box.w / 2) && s.anchor.y === Math.floor(s.box.h / 2),
     `${id}: anchor is sprite center`);
  ok(s.box.w >= 8 && s.box.w <= 16 && s.box.h >= 8 && s.box.h <= 16,
     `${id}: roughly 10-16px (${s.box.w}x${s.box.h})`);
}

console.log('ARCHETYPES:');
{
  // Named archetypes alias the same sprite objects (no drift possible).
  ok(SPRITE_ARCHETYPES.SKELETON === SPRITES.DASHER
     && SPRITE_ARCHETYPES.DEMON === SPRITES.COLOSSUS
     && SPRITE_ARCHETYPES.BAT === SPRITES.SWARMER
     && SPRITE_ARCHETYPES.MAGE === SPRITES.SPITTER
     && SPRITE_ARCHETYPES.WIZARD === SPRITES.WARLOCK
     && SPRITE_ARCHETYPES.EVIL_KNIGHT === SPRITES.BRUTE
     && SPRITE_ARCHETYPES.STICK_FIGURE === SPRITES.CHASER
     && SPRITE_ARCHETYPES.TICK === SPRITES.TICK,
     'all 8 named archetypes map onto the typeId sprites');
  // TICK is a recolor: same grids as BAT, different palette.
  ok(SPRITES.TICK.frames === SPRITES.SWARMER.frames
     && SPRITES.TICK.palette !== SPRITES.SWARMER.palette
     && SPRITES.TICK.palette[1] !== SPRITES.SWARMER.palette[1],
     'TICK = BAT grids with a distinct recolor palette');
}

console.log('WALK FRAMES DIFFER:');
{
  // A walk cycle must actually move: frames differ somewhere in the legs.
  const differs = (a, b) => {
    for (let r = 0; r < a.length; r++)
      for (let c = 0; c < a[r].length; c++)
        if (a[r][c] !== b[r][c]) return true;
    return false;
  };
  for (const id of TYPE_IDS) {
    ok(differs(SPRITES[id].frames[0], SPRITES[id].frames[1]),
       `${id}: frame A and B are distinct`);
  }
}

console.log('FLAMES:');
{
  ok(FLAME_FRAMES.length === 4, 'FLAME_FRAMES: 4 frames');
  checkGrids('FLAME', FLAME_FRAMES, FLAME.palette);
  const fb = spriteBox(FLAME_FRAMES[0]);
  ok(fb.w === 8 && fb.h === 12, `flame ~8x12 (got ${fb.w}x${fb.h})`);
  // Teardrop: has all three heat colors (outer/mid/core).
  const flat = FLAME_FRAMES.flat(2);
  for (const idx of [1, 2, 3]) {
    ok(flat.includes(idx), `flame uses heat index ${idx}`);
  }
  // Narrower at the tip than the base (teardrop silhouette).
  const widthAt = (g, r) => g[r].filter(v => v).length;
  ok(widthAt(FLAME_FRAMES[1], 1) < widthAt(FLAME_FRAMES[1], 9),
     'flame silhouette narrows toward the tip');

  ok(SMALL_FLAME_FRAMES.length === 4, 'SMALL_FLAME: 4 frames');
  checkGrids('SMALL_FLAME', SMALL_FLAME_FRAMES, FLAME.palette);
  const sb = spriteBox(SMALL_FLAME_FRAMES[0]);
  ok(sb.w === 4 && sb.h === 6, `small flame 4x6 (got ${sb.w}x${sb.h})`);

  // FLAME convenience bundle mirrors the arrays.
  ok(FLAME.frames === FLAME_FRAMES && FLAME.small === SMALL_FLAME_FRAMES,
     'FLAME bundle references the frame arrays');
  ok(FLAME.anchor.x === 4 && FLAME.anchor.y === 6
     && FLAME.smallAnchor.x === 2 && FLAME.smallAnchor.y === 3,
     'flame anchors are centered');
}

console.log('BOSS:');
{
  checkGrids('BOSS', BOSS_SPRITE.frames, BOSS_SPRITE.palette);
  ok(BOSS_SPRITE.frames.length === 2, 'boss: exactly 2 frames');
  const bb = spriteBox(BOSS_SPRITE.frames[0]);
  ok(bb.w === 24 && bb.h === 24, `boss 24x24 (got ${bb.w}x${bb.h})`);
  ok(BOSS_SPRITE.box.w === 24 && BOSS_SPRITE.box.h === 24, 'boss box declared 24x24');
  // Crown gold on top rows, glowing eyes up high, red cape at the flanks.
  const g = BOSS_SPRITE.frames[0];
  const topUsesGold = g[0].includes(3) || g[2].includes(3);
  const hasGlowEyes = g[5].includes(4);
  const capeLeft = g[12][0] === 5 && capeRight(g);
  function capeRight(gg) { return gg[12][20] === 5; }
  ok(topUsesGold, 'boss: gold crown pixels at the top');
  ok(hasGlowEyes, 'boss: glowing eye row');
  ok(capeLeft, 'boss: cape pixels at both flanks');
}

console.log('HELPER:');
{
  const box = spriteBox([[0,0,0],[0,1,0]]);
  ok(box.w === 3 && box.h === 2, 'spriteBox returns {w,h} from the grid');
  ok(spriteBox(BOSS_SPRITE.frames[0]).w === BOSS_SPRITE.box.w,
     'spriteBox agrees with declared boss box');
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL SPRITE TESTS PASSED');
