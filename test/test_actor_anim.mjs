// HORDES - R3 "characters face where they walk, bob, pop in, squash on hits
// and collapse before the puff; depth-sorted" (src/actor_anim.js, the feel
// observer's facing records and corpses, render.js's depth order and poses).
// All of it is drawing only: a fixed seed plays the same run with it on or off.
// Run: node test/test_actor_anim.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { ANIM, enemyPose, collapsePose, heroLift, setActorAnim, actorAnimOn, stepFacing } from '../src/actor_anim.js';
import { FEEL, feelOf, feelStep, trackOf } from '../src/fx/feel.js';
import { blitGrid, blitGridPose, actorStyle, corpseStyle, FLASH_ON_LIGHT, gridVariants, SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { characterSpriteFor } from '../src/character_sprites.js';
import { HERO_WARM, depthKey } from '../src/render.js';
import { drawFeelEffects } from '../src/fx/feel_render.js';

const s = suite('test_actor_anim');

const mkState = () => ({
  time: 0, mode: 'playing',
  player: { x: 0, y: 0, hp: 100, xp: 0, level: 1, stats: { maxHp: 100 }, potions: { hp: 1, mp: 1 } },
  enemies: [], effects: [], projectiles: [], chests: [], itemDrops: [],
});
const mkEnemy = (o = {}) => ({ typeId: 'CHASER', x: 40, y: 0, w: 10, h: 12, hp: 100, maxHp: 100, speed: 30, age: 1, ...o });
const step = (st, dt = 1 / 60) => { st.time += dt; feelStep(st, dt); };

// ---- facing ------------------------------------------------------------------
s.check('a body faces the way it walks, and a hit that shoves it back does not turn it', () => {
  const st = mkState(); const e = mkEnemy({ x: 80 }); st.enemies.push(e);
  step(st);
  assert.equal(trackOf(st, e).face, -1, 'a new body right of the hero looks toward the hero');
  for (let i = 0; i < 30; i++) { e.x += 0.6; step(st); }   // walks right, 36 px/s
  assert.equal(trackOf(st, e).face, 1, 'walking right: faces right');
  for (let i = 0; i < 30; i++) { e.x -= 0.6; step(st); }
  assert.equal(trackOf(st, e).face, -1, 'walking left: faces left');
  // A heavy hit: the feel knockback shoves it right (away from the hero at x 0).
  e.hp -= 40; step(st);
  for (let i = 0; i < 20; i++) { e.x -= 0.6; step(st); }
  assert.equal(trackOf(st, e).face, -1, 'the shove is not a walk');
  assert.ok(trackOf(st, e).spd > ANIM.MOVE_V, 'walking: the bob runs');
  for (let i = 0; i < 40; i++) step(st);
  assert.ok(trackOf(st, e).spd < ANIM.MOVE_V, 'standing: no bob');
  assert.equal(trackOf(st, e).face, -1, 'standing keeps the last facing');
});

s.check('the hero faces the way it walks; a teleport is not a walk', () => {
  const st = mkState(); const p = st.player;
  step(st);
  assert.equal(feelOf(st).hero.face, 1, 'a new run starts facing right');
  for (let i = 0; i < 20; i++) { p.x -= 1; step(st); }
  assert.equal(feelOf(st).hero.face, -1);
  p.x += 400; step(st); step(st);
  assert.equal(feelOf(st).hero.face, -1, 'a 400 px jump right did not turn the hero');
  for (let i = 0; i < 20; i++) { p.x += 1; step(st); }
  assert.equal(feelOf(st).hero.face, 1);
});

s.check('60 Hz and 120 Hz turn a body at the same sim time', () => {
  // A zig-zag path, x(t) a fixed function of sim time.
  const path = (t) => 60 * Math.sin(t * 2.3) + 10 * Math.sin(t * 7.1);
  const run = (hz) => {
    const st = mkState(); const e = mkEnemy({ x: path(0) }); st.enemies.push(e);
    const out = [];
    const n = hz * 3;
    for (let i = 1; i <= n; i++) {
      e.x = path(i / hz); step(st, 1 / hz);
      if (i % (hz / 20) === 0) out.push(trackOf(st, e).face);   // sample every 0.05 s
    }
    return out;
  };
  const a = run(60), b = run(120);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(a.includes(1) && a.includes(-1), 'the path turns both ways');
  assert.ok(diff <= 1, diff + ' of ' + a.length + ' samples differ');
});

// ---- poses ---------------------------------------------------------------------
s.check('a spawn pops in, a hit squashes about the feet, the bob rides the walk frames', () => {
  const rec = { face: -1, vxs: -20, spd: 20 };
  let p = enemyPose(mkEnemy({ age: 0 }), rec, false, 4);
  assert.ok(Math.abs(p.kx - ANIM.POP_FROM) < 1e-9 && p.kx === p.ky, 'age 0: pop size ' + p.kx);
  assert.equal(p.flip, true, 'walking left: mirrored');
  const mid = enemyPose(mkEnemy({ age: ANIM.POP_S * 0.7 }), rec, false, 4).kx;
  assert.ok(mid > 1, 'the pop overshoots a little (' + mid.toFixed(3) + ')');
  p = enemyPose(mkEnemy({ age: ANIM.POP_S }), rec, false, 4);
  assert.ok(Math.abs(p.kx - 1) < 1e-9 && Math.abs(p.ky - 1) < 1e-9, 'the pop ends at full size');
  p = enemyPose(mkEnemy({ age: 1, flash: ANIM.HIT_FLASH }), rec, false, 4);
  assert.ok(p.kx > 1.15 && p.ky < 0.85, 'a fresh hit: wide and flat (' + p.kx + ', ' + p.ky + ')');
  const boss = enemyPose(mkEnemy({ age: 1, flash: ANIM.HIT_FLASH, boss: true }), rec, false, 2);
  assert.ok(boss.kx > 1 && boss.kx < 1.15, 'a boss squashes less');
  p = enemyPose(mkEnemy({ age: 1, flash: 0 }), rec, false, 4);
  assert.ok(p.kx === 1 && p.ky === 1, 'no hit: no squash');
  const lifts = [0, 1, 2, 3].map(k => enemyPose(mkEnemy({ age: k / 6 + 0.5 / 6 + 1 }), rec, false, 4).lift);
  assert.deepEqual(lifts, [0, 1, 0, 1], 'up a pixel on every other walk frame');
  assert.equal(enemyPose(mkEnemy({ age: 1 + 1.5 / 6 }), { face: 1, vxs: 0, spd: 0 }, false, 4).lift, 0, 'a still body does not bob');
  assert.equal(enemyPose(mkEnemy({ age: 1 + 1.5 / 6, flying: true }), rec, false, 4).lift, 0, 'a flyer does not bob');
});

s.check('reduced motion turns the bob, pop and squash off; facing stays', () => {
  const rec = { face: -1, vxs: -20, spd: 20 };
  for (const e of [mkEnemy({ age: 0 }), mkEnemy({ age: 1, flash: 0.08 }), mkEnemy({ age: 1 + 1.5 / 6 })]) {
    const p = enemyPose(e, rec, true, 4);
    assert.deepEqual({ ...p }, { flip: true, kx: 1, ky: 1, lift: 0 });
  }
  assert.equal(heroLift(1, true, true), 0);
  assert.equal(heroLift(1, true, false), 1);
  assert.equal(heroLift(1, false, false), 0, 'a still hero does not bob');
  const c = collapsePose(0.8, true);
  assert.ok(c.kx === 1 && c.ky === 1, 'the collapse is held still, not squashed');
  const d = collapsePose(1, false);
  assert.ok(d.ky < 0.25 && d.kx > 1.2, 'the collapse ends flat and wide');
});

s.check('with the animation off every pose is the plain sprite', () => {
  setActorAnim(false);
  try {
    const p = enemyPose(mkEnemy({ age: 0, flash: 0.08 }), { face: -1, vxs: -20, spd: 20 }, false, 4);
    assert.deepEqual({ ...p }, { flip: false, kx: 1, ky: 1, lift: 0 });
    assert.equal(heroLift(1, true, false), 0);
  } finally { setActorAnim(true); }
});

// ---- the collapse before the puff ----------------------------------------------
s.check('a killed body collapses first; its puff starts when the collapse ends', () => {
  const st = mkState(); const e = mkEnemy({ x: 30 }); st.enemies.push(e);
  for (let i = 0; i < 20; i++) { e.x -= 0.5; step(st); }
  e.hp = 0; st.enemies.length = 0; step(st);
  const f = feelOf(st);
  assert.equal(f.corpses.length, 1);
  assert.equal(f.corpses[0].e, e);
  assert.equal(f.corpses[0].face, -1, 'the body keeps its facing as it falls');
  assert.equal(f.puffs.length, 1);
  assert.ok(f.puffs[0].age < 0, 'the puff waits');
  const waitSteps = Math.ceil(ANIM.COLLAPSE_S * 60);
  for (let i = 0; i < waitSteps; i++) step(st);
  assert.equal(f.corpses.length, 0, 'the body is gone when the collapse ends');
  assert.ok(f.puffs[0].age >= 0 && f.puffs[0].age < 1 / 60 + 1e-9, 'and the puff starts');
  // The puff's own life is unchanged by the wait.
  let life = 0;
  while (f.puffs.length) { step(st); life++; }
  assert.ok(Math.abs(life / 60 - 0.26) <= 2 / 60, 'puff life ' + (life / 60).toFixed(3) + ' s');
});

s.check('the corpse pool is capped; with the animation off a death puffs at once', () => {
  const st = mkState();
  for (let i = 0; i < 200; i++) st.enemies.push(mkEnemy({ x: i % 50, y: i % 30 }));
  step(st); st.enemies.length = 0; step(st);
  assert.equal(feelOf(st).corpses.length, FEEL.CORPSE_CAP);
  setActorAnim(false);
  try {
    const st2 = mkState(); const e = mkEnemy(); st2.enemies.push(e);
    step(st2); st2.enemies.length = 0; step(st2);
    assert.equal(feelOf(st2).corpses.length, 0);
    assert.equal(feelOf(st2).puffs[0].age, 1 / 60 - 1 / 60 + 0, 'no wait');
  } finally { setActorAnim(true); }
});

// ---- the pose blit and the cache bound ------------------------------------------
const recorder = () => {
  const ops = [];
  return { ops, set fillStyle(v) {}, get fillStyle() { return ''; }, fillRect() {}, set globalAlpha(v) {},
    drawImage(img, x, y, w, h) { ops.push({ img, x, y, w: w === undefined ? img.width : w, h: h === undefined ? img.height : h }); } };
};
s.check('the pose blit: mirrored raster in the same box, stretched about the feet; plain pose = blitGrid', () => {
  SPRITE_CACHE_TEST.forceFakeCanvas();
  try {
    const spr = ENEMY_SPRITES.SWARMER, grid = spr.frames[0];
    const st = actorStyle(false, false, null, true, true);
    const a = recorder(); blitGrid(a, grid, spr.palette, 50, 40, st, 1);
    const b = recorder(); blitGridPose(b, grid, spr.palette, 50, 40, st, 1, false, 1, 1, 55, 48);
    assert.deepEqual(b.ops, a.ops, 'no pose: the very same draw');
    const c = recorder(); blitGridPose(c, grid, spr.palette, 50, 40, st, 1, true, 1, 1, 55, 48);
    assert.notEqual(c.ops[0].img, a.ops[0].img, 'flipped: another raster');
    assert.deepEqual([c.ops[0].x, c.ops[0].y, c.ops[0].w, c.ops[0].h], [a.ops[0].x, a.ops[0].y, a.ops[0].w, a.ops[0].h], 'in the same box');
    const d = recorder(); blitGridPose(d, grid, spr.palette, 50, 40, st, 1, false, 1.2, 0.8, 55, 48);
    const o = a.ops[0], q = d.ops[0];
    assert.ok(q.w > o.w && q.h < o.h, 'wider and flatter');
    assert.ok(Math.abs((q.y + q.h) - (48 + (o.y + o.h - 48) * 0.8)) <= 1, 'the feet stay down');
    assert.ok([q.x, q.y, q.w, q.h].every(Number.isInteger), 'on whole pixels');
    // The bound: however many poses, one grid has at most two variants per style.
    const before = gridVariants(grid);
    for (let i = 0; i < 300; i++) {
      blitGridPose(recorder(), grid, spr.palette, i, i, st, 1, i % 2 === 0, 1 + (i % 7) / 30, 1 - (i % 5) / 30, i, i);
    }
    assert.equal(before, 2, 'the plain raster and its mirror');
    assert.equal(gridVariants(grid), before, 'nothing baked per pose');
  } finally { SPRITE_CACHE_TEST.reprobe(); }
});

// ---- elites and bosses at half weight; a waiting puff is not drawn ----------------
s.check('elites and bosses pop and squash half as much as a plain body', () => {
  const rec = { face: 1, vxs: 0, spd: 0 };
  const sq = (o) => { const p = enemyPose(mkEnemy(o), rec, false, 4); return [p.kx, p.ky]; };
  const [px, py] = sq({ age: 1, flash: ANIM.HIT_FLASH });
  const [ex, ey] = sq({ age: 1, flash: ANIM.HIT_FLASH, elite: true });
  const [bx] = sq({ age: 1, flash: ANIM.HIT_FLASH, boss: true });
  assert.ok(Math.abs(px - 1 - ANIM.SQUASH_X) < 1e-9 && Math.abs(1 - py - ANIM.SQUASH_Y) < 1e-9, 'a plain body: full squash');
  assert.ok(Math.abs(ex - 1 - ANIM.SQUASH_X * ANIM.BIG_WEIGHT) < 1e-9, 'an elite: half the widening (' + ex + ')');
  assert.ok(Math.abs(1 - ey - ANIM.SQUASH_Y * ANIM.BIG_WEIGHT) < 1e-9, 'an elite: half the flattening');
  assert.ok(Math.abs(bx - 1 - ANIM.SQUASH_X * ANIM.BIG_WEIGHT) < 1e-9, 'a boss: half the widening');
  const [ep] = sq({ age: 0, elite: true });
  assert.ok(Math.abs(ep - (1 + (ANIM.POP_FROM - 1) * ANIM.BIG_WEIGHT)) < 1e-9, 'an elite pops from half as small');
});

s.check('a puff that waits for its collapse draws nothing until it starts', () => {
  const st = mkState(); const e = mkEnemy({ x: 30 }); st.enemies.push(e);
  step(st); e.hp = 0; st.enemies.length = 0; step(st);
  const f = feelOf(st);
  assert.ok(f.puffs.length === 1 && f.puffs[0].age < 0, 'the puff waits');
  f.sparks.length = 0; f.bursts.length = 0;
  let n = 0;
  const g = { set fillStyle(v) {}, set globalAlpha(v) {}, fillRect() { n++; }, drawImage() { n++; } };
  drawFeelEffects(g, st, { x: 0, y: 0 });
  assert.equal(n, 0, 'nothing drawn while it waits');
  f.puffs[0].age = 0.01;
  drawFeelEffects(g, st, { x: 0, y: 0 });
  assert.ok(n > 0, 'drawn once it starts');
});

// ---- the real renderer: render.js uses the poses, the corpses and the depth order -------
// One frame of the real game, drawn through a context that records every
// drawImage with its raster, so each body is found by the raster it was given.
const rasterOf = (grid, palette, style, flip) => {
  const r = recorder();
  blitGridPose(r, grid, palette, 0, 0, style, 1, flip, 1, 1, 0, 0);
  return r.ops[0].img;
};
async function renderScene() {
  const b = await boot({ storage: [['hordes_onboarded', '1']], variant: 'anim-frame' });
  SPRITE_CACHE_TEST.forceFakeCanvas();
  b.T.banners.suppressAll();
  b.T.state.mode = 'menu'; b.T.startRun();
  b.pump(30);
  const S = b.T.state, R = b.T.renderer, P = S.player, f = feelOf(S);
  P.invuln = 0; P.hp = P.stats.maxHp;
  S.enemies.length = 0; S.projectiles.length = 0;
  f.corpses.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0; f.hurtT = 0;
  const mk = (id, dx, dy, o) => {
    const e = makeTypedEnemy(id, P.x + dx, P.y + dy, 0, {});
    Object.assign(e, { rarity: null, telegraph: false, flash: 0, slow: 0, age: 1, hp: e.maxHp }, o);
    return e;
  };
  const left = mk('CHASER', -50, -40, {});                    // walks left: mirrored, no bob
  const hit = mk('SWARMER', 50, -40, { flash: ANIM.HIT_FLASH }); // a fresh hit: squashed
  const bob = mk('BRUTE', -50, 40, { age: 1.5 / 6 });          // walking, odd walk frame: up 1 px
  const big = mk('COLOSSUS', 60, 30, {});                     // a big body...
  const tick = mk('TICK', 60, 34, {});                        // ...and a small one 4 px lower whose feet are higher
  const dead = mk('SPITTER', 0, -60, {});                     // killed: collapsing, faced left
  S.enemies.push(left, hit, bob, big, tick);
  f.track.set(left, { lx: left.x, ly: left.y, face: -1, vxs: -20, spd: 0 });
  f.track.set(hit, { lx: hit.x, ly: hit.y, face: 1, vxs: 0, spd: 0 });
  f.track.set(bob, { lx: bob.x, ly: bob.y, face: 1, vxs: 20, spd: 20 });
  f.track.set(big, { lx: big.x, ly: big.y, face: 1, vxs: 0, spd: 0 });
  f.track.set(tick, { lx: tick.x, ly: tick.y, face: 1, vxs: 0, spd: 0 });
  f.corpses.push({ e: dead, face: -1, age: 0.03, ttl: ANIM.COLLAPSE_S });
  f.hero.face = -1;                                           // the hero walked left
  const pilot = characterSpriteFor(S.character && S.character.id);
  const frame = (reduced) => {
    // The hero moved 2 px since the last frame and has walked 7 px: step 1, an odd step.
    R._lpx = P.x + 2; R._lpy = P.y; R._walkDist = 5;
    const mm = globalThis.window.matchMedia;
    if (reduced) globalThis.window.matchMedia = (q) => ({ matches: /reduce/.test(String(q)), addEventListener() {}, addListener() {} });
    const ops = [], real = R.ctx;
    R.ctx = new Proxy(real, { get(t, p) {
      if (p === 'drawImage') return (img, x, y, w, h) => ops.push({ img, x, y, w: w === undefined ? img.width : w, h: h === undefined ? img.height : h });
      return t[p];
    } });
    try { R.render(S, S.cam); } finally { R.ctx = real; globalThis.window.matchMedia = mm; }
    return { ops, order: R.depthOrder.slice() };
  };
  const enemyRaster = (e, flip, flash = e.flash > 0, style = null) => {
    const spr = ENEMY_SPRITES[e.typeId];
    return rasterOf(spr.frames[Math.floor(e.age * 6) % spr.frames.length], spr.palette, style || actorStyle(flash, false, null, true, true), flip);
  };
  const pilotGrid = pilot ? pilot.frames[1 + 1 % (pilot.frames.length - 1)] : null;
  // On a light floor (R6: the Verdant Hollow this run starts on is one) the
  // hero wears its dark keyline: the same raster the renderer bakes.
  const heroRaster = (flip) => rasterOf(pilotGrid, pilot.palette, actorStyle(false, false, HERO_WARM, true, false, !!R.groundLight), flip);
  // The fake cache stays on through the checks below: they bake the rasters
  // to look for. It is reset after them.
  return { normal: frame(false), reduced: frame(true), enemyRaster, heroRaster, pilot, left, hit, bob, big, tick, dead, R };
}
const F = await renderScene();
const opOf = (fr, img, what) => {
  const i = fr.ops.findIndex(o => o.img === img);
  assert.ok(i >= 0, what + ': drawn with the expected raster');
  return { i, ...fr.ops[i] };
};
s.check('render.js: a body walking left is drawn mirrored, in its own box', () => {
  const plain = F.enemyRaster(F.left, false), mir = F.enemyRaster(F.left, true);
  assert.equal(F.normal.ops.findIndex(o => o.img === plain), -1, 'not the plain raster');
  const o = opOf(F.normal, mir, 'walking left');
  assert.ok(o.w === mir.width && o.h === mir.height, 'no stretch on a still, un-hit body');
  const r = opOf(F.reduced, mir, 'walking left, reduced motion');
  assert.deepEqual([r.x, r.y, r.w, r.h], [o.x, o.y, o.w, o.h], 'reduced motion keeps the facing');
});
s.check('render.js: a fresh hit is wider and flatter with the feet in place; reduced motion draws it plain', () => {
  const img = F.enemyRaster(F.hit, false);
  const o = opOf(F.normal, img, 'the hit body'), r = opOf(F.reduced, img, 'the hit body, reduced motion');
  assert.ok(r.w === img.width && r.h === img.height, 'reduced motion: no squash (' + r.w + 'x' + r.h + ')');
  assert.ok(o.w > r.w && o.h < r.h, 'squashed: ' + o.w + 'x' + o.h + ' against ' + r.w + 'x' + r.h);
  assert.ok(Math.abs((o.y + o.h) - (r.y + r.h)) <= 1, 'the feet stay down: bottom ' + (o.y + o.h) + ' against ' + (r.y + r.h));
  assert.ok(Math.abs((o.x + o.w / 2) - (r.x + r.w / 2)) <= 1, 'about the body centre');
});
s.check('render.js: a walking body on an odd walk frame is lifted 1 px; reduced motion does not bob', () => {
  const img = F.enemyRaster(F.bob, false);
  const o = opOf(F.normal, img, 'the walker'), r = opOf(F.reduced, img, 'the walker, reduced motion');
  assert.equal(o.y, r.y - 1, 'up one pixel');
  assert.ok(o.x === r.x && o.w === r.w && o.h === r.h);
});
s.check('render.js: a killed body folds down mirrored, under the living; reduced motion holds it still', () => {
  // On a light floor (this run's Verdant Hollow) the fold is a plain dark body (polish P2).
  const mir = F.enemyRaster(F.dead, true, true, corpseStyle(true, !!F.R.groundLight, true, true));
  const o = opOf(F.normal, mir, 'the corpse (mirrored, flashed)');
  for (const e of [F.left, F.hit, F.bob]) {
    const i = F.normal.ops.findIndex(q => q.img === F.enemyRaster(e, e === F.left, e.flash > 0));
    assert.ok(i > o.i, 'the corpse is drawn before the living ' + e.typeId);
  }
  assert.ok(o.h < mir.height && o.w > mir.width, 'folding: ' + o.w + 'x' + o.h);
  const r = opOf(F.reduced, mir, 'the corpse, reduced motion');
  assert.ok(r.w === mir.width && r.h === mir.height, 'held still under reduced motion');
  assert.ok(Math.abs((o.y + o.h) - (r.y + r.h)) <= 1, 'folds onto its feet');
});
s.check('render.js: the hero walking left is mirrored and bobs on an odd step; reduced motion keeps the facing only', () => {
  assert.ok(F.pilot, 'the run has a pilot sprite');
  const plain = F.heroRaster(false), mir = F.heroRaster(true);
  assert.equal(F.normal.ops.findIndex(o => o.img === plain), -1, 'not the plain hero');
  const o = opOf(F.normal, mir, 'the hero'), r = opOf(F.reduced, mir, 'the hero, reduced motion');
  assert.equal(o.y, r.y - 1, 'up one pixel on an odd step');
  const bodies = [F.left, F.hit, F.bob, F.big, F.tick].map(e => F.normal.ops.findIndex(q => q.img === F.enemyRaster(e, e === F.left, e.flash > 0)));
  assert.ok(bodies.every(i => i >= 0 && i < o.i), 'the hero is drawn over the horde');
});
s.check('render.js: depth goes by the feet, so a small body behind a big one is drawn first', () => {
  const ti = F.normal.ops.findIndex(q => q.img === F.enemyRaster(F.tick, false));
  const ci = F.normal.ops.findIndex(q => q.img === F.enemyRaster(F.big, false));
  assert.ok(ti >= 0 && ci >= 0, 'both drawn');
  assert.ok(F.tick.y > F.big.y && depthKey(F.tick) < depthKey(F.big), 'the tick stands lower by its centre, higher by its feet');
  assert.ok(ti < ci, 'the tick (feet higher) is drawn before the colossus');
  const ord = F.normal.order;
  for (let k = 1; k < ord.length; k++) assert.ok(depthKey(ord[k]) >= depthKey(ord[k - 1]), 'the order is by the feet');
});
SPRITE_CACHE_TEST.reprobe();

// ---- the real game: depth order and a draw-only change ----------------------------
function seedRandom(seed) {
  let a = seed | 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function playSeeded(on, variant) {
  setActorAnim(on);
  seedRandom(777);
  const b = await boot({ storage: [['hordes_onboarded', '1']], variant });
  SPRITE_CACHE_TEST.forceFakeCanvas();   // the cached draw path (poses) runs headless
  b.T.banners.suppressAll();
  b.T.state.mode = 'menu'; b.T.startRun();
  let sorted = 0, frames = 0, corpses = 0, flips = 0;
  for (let i = 0; i < 1500; i++) {
    b.pump(1);
    const S = b.T.state;
    if (S.player) S.player.hp = S.player.stats.maxHp;
    const ord = b.T.renderer.depthOrder;
    if (ord && ord.length > 3) {
      frames++;
      let ok = true;
      for (let k = 1; k < ord.length; k++) if (depthKey(ord[k]) < depthKey(ord[k - 1])) { ok = false; break; }
      if (ok) sorted++;
    }
    if (S.feel) {
      corpses += S.feel.corpses.length;
      for (const e of S.enemies) { const r = trackOf(S, e); if (r && r.face < 0) flips++; }
    }
  }
  SPRITE_CACHE_TEST.reprobe();
  setActorAnim(true);
  const S = b.T.state, P = S.player;
  return { x: P.x, y: P.y, xp: P.xp, level: P.level, kills: P.kills, enemies: S.enemies.length, time: S.time,
    hp: S.enemies.reduce((a, e) => a + e.hp, 0), rng: Math.random(), sorted, frames, corpses, flips };
}
const A = await playSeeded(true, 'anim-on');
const B = await playSeeded(false, 'anim-off');
s.check('the horde is drawn top to bottom (lower on screen in front)', () => {
  assert.ok(A.frames > 100, A.frames + ' frames with a horde');
  assert.equal(A.sorted, A.frames, 'every frame in depth order');
  assert.ok(A.corpses > 0, 'bodies collapsed in the run');
  assert.ok(A.flips > 0, 'some bodies faced left');
});
s.check('the animation is draw-only: one seed, the same run with it on and off', () => {
  assert.ok(A.kills > 0, 'the run fought (' + A.kills + ' kills)');
  const strip = (o) => ({ x: o.x, y: o.y, xp: o.xp, level: o.level, kills: o.kills, enemies: o.enemies, time: o.time, hp: o.hp, rng: o.rng });
  assert.deepEqual(strip(A), strip(B));
  assert.equal(actorAnimOn(), true);
});

s.done();
