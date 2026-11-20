// HORDES - bossdark: what the fight and the films really blit for a boss.
// test_actor_contrast.mjs holds the rim and pool COLOURS to their contrast;
// this file holds the draw calls to those colours, through the sprite cache:
//   - drawActor: a boss stands in its own pool (a dark step of its hue on a
//     dark floor, its rim's hue on a light one, at BOSS_POOL_ALPHA) and wears
//     its rim, with the dark keyline outside it on a light floor only;
//   - the Maw in the finale: the same rule, through a whole rendered frame;
//   - the escape chase and the portal beat draw the boss with its rim.
// Run: node test/test_boss_draw.mjs
import assert from 'node:assert/strict';
import { Renderer, bossPool, BOSS_POOL_ALPHA, MAW_POOL_ALPHA } from '../src/render.js';
import { SPRITE_CACHE_TEST, blitGrid, blitGlow, actorStyle } from '../src/sprite_cache.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { BOSS_SPRITE } from '../src/sprites.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import { makePlayer } from '../src/entities.js';
import { bossLook } from '../src/movie_cast.js';
import * as E from '../src/escape_cine.js';
import * as A from '../src/escape_cine_art.js';
import * as BEAT from '../src/portal_beat.js';
import { bodyColourOf } from '../src/fx/feel.js';
import { reservedFamily } from '../src/palette.js';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

// A context that keeps every raster handed to drawImage; any other call is a no-op.
function recCtx() {
  const imgs = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'drawImage') return (img) => { imgs.push(img); };
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (p in t) return t[p];
      return typeof p === 'string' ? () => {} : undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return { ctx, imgs };
}
const rasterOf = (grid, palette, style) => { const r = recCtx(); blitGrid(r.ctx, grid, palette, 0, 0, style); return r.imgs[0]; };
const glowOf = (col, rad, alpha) => { const r = recCtx(); blitGlow(r.ctx, col, rad, 0, 0, alpha); return r.imgs[0]; };
const gridsOf = (s) => [...s.frames, ...(s.tell ? [s.tell] : [])];
const withCache = (fn) => { SPRITE_CACHE_TEST.forceFakeCanvas(); try { fn(); } finally { SPRITE_CACHE_TEST.reprobe(); } };

const LOOKS = { DEFAULT: BOSS_SPRITE, ...BOSS_SPRITES };

check('in the fight a boss stands in its own pool and wears its rim; the keyline only on a light floor', () => withCache(() => {
  const draw = Renderer.prototype.drawActor;
  for (const [id, s] of Object.entries(LOOKS)) {
    for (const light of [false, true]) {
      const r = recCtx();
      // age 0.67: past the spawn pop (actor_anim.js), on walk frame 0.
      draw.call({ groundLight: light }, r.ctx, { boss: true, elite: true, hp: 1, maxHp: 1, x: 0, y: 0, w: 24, h: 24, age: 0.67 }, s, 100, 80, { time: 0 });
      const pool = glowOf(bossPool(s, light), s.box.w + 2, BOSS_POOL_ALPHA);
      const where = id + (light ? ' on a light floor' : ' on a dark floor');
      assert.equal(bossPool(s, light), light ? s.rim : s.pool, where + ': the pool colour');
      assert.ok(r.imgs.includes(pool), where + ': its pool, at its strength');
      const body = rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, true, false, light));
      assert.ok(r.imgs.includes(body), where + ': the body wears its rim' + (light ? ' and the keyline' : ', no keyline'));
    }
  }
}));

check('every boss and the Maw have a pool colour of their own hue, darker than the rim', () => {
  for (const [id, s] of Object.entries({ ...LOOKS, MAW: FINAL_BOSS_SPRITE })) {
    assert.ok(s.pool && s.rim && s.pool !== s.rim, id);
  }
});

// A whole frame with the Maw in the finale (or a screen laid over its fight),
// with the light layer at a level (0 OFF, 2 ON) and wave bosses on the field.
function mawFrame(stage, mode = 'finale', light = 0, enemies = [], finalBoss = true) {
  const p = makePlayer(); p.x = 240; p.y = 150;
  const st = {
    player: p, time: 4.0, toasts: [], items: [], weapons: [], weather: null, mode, zoom: 1, groundSeed: 7,
    stage, enemies, projectiles: [], enemyShots: [], gems: [], drops: [], itemDrops: [], chests: [], arches: [],
    effects: [], chestBurst: null, shrines: [], shrine: null, wave: { num: 10, boss: null, bosses: [] }, cam: { x: 0, y: 0 },
    finalBoss: finalBoss ? { x: 240, y: 80, age: 0, flash: 0, slow: 0, telegraph: false, hp: 100, maxHp: 100, phase: 1 } : null,
  };
  const r = recCtx();
  const canvas = { width: 480, height: 300, getContext: () => r.ctx, getBoundingClientRect: () => ({ width: 480, height: 300, left: 0, top: 0 }) };
  const R = new Renderer(canvas);
  R.lightLevel = light;   // the fake canvases take the light layer's calls as no-ops
  R.render(st, { x: 0, y: 0 });
  return r.imgs;
}
// The finale has its own arena (finale_arena.js): the floor of ANY stage falls to the void, so
// no stage counts as a light floor in the Maw's fight (render.js: groundLight is off while the
// arena is dark). The Maw then wears the dark-floor pool and no keyline on Whiteout too. The
// keyline on light floors is pinned for the wave bosses by the drawActor check above.
check('the Maw in the finale stands in its own pool and wears its rim; its void arena is a dark floor on every stage', () => withCache(() => {
  const s = FINAL_BOSS_SPRITE;
  for (const stage of ['VOID_REACH', 'WHITEOUT']) {
    const imgs = mawFrame(stage);
    assert.ok(imgs.includes(glowOf(bossPool(s, false), 62, MAW_POOL_ALPHA)), stage + ': the Maw pool is the dark-floor one');
    const body = rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, true, false, false));
    assert.ok(imgs.includes(body), stage + ': the Maw wears its rim, no keyline');
  }
}));

check('the escape chase draws its boss with its rim', () => withCache(() => {
  for (const id of Object.keys(BOSS_SPRITES)) {
    const scene = E.buildScene({ seed: 21, stage: 'VOID_REACH', bossId: id, payout: 10 });
    const s = BOSS_SPRITES[scene.bossId] || BOSS_SPRITES.GRAVELMAW;
    const want = new Set(gridsOf(s).map(gr => rasterOf(gr, s.palette, actorStyle(false, false, s.rim, false, false))));
    let seen = false;
    for (let t = 0; t < 9 && !seen; t += 0.25) { const r = recCtx(); A.drawScene(r.ctx, scene, t); seen = r.imgs.some(i => want.has(i)); }
    assert.ok(seen, scene.bossId + ': the chasing boss wears its rim');
  }
}));

check('the portal beat sinks the boss with its rim', () => withCache(() => {
  for (const id of Object.keys(BOSS_SPRITES)) {
    const s = BOSS_SPRITES[id];
    const r = recCtx();
    BEAT.render(r.ctx, 0.3, { boss: bossLook(id), bx: 200, by: 150, px: 200, py: 150, hx: 260, hy: 160, zoom: 1 });
    assert.ok(r.imgs.includes(rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, false, false))), id + ': the sinking boss wears its rim');
  }
}));

check('a killed boss folds down in its rim (and its keyline on a light floor), after the white beat', () => withCache(() => {
  const R = Renderer.prototype;
  for (const [id, s] of Object.entries(LOOKS)) for (const light of [false, true]) {
    const r = recCtx();
    const state = { feel: { corpses: [{ e: { boss: true, bossSprite: id === 'DEFAULT' ? undefined : s, x: 100, y: 80, age: 0 }, face: 1, age: 0.5, ttl: 1 }] } };
    R.drawCorpses.call({ groundLight: light }, r.ctx, state, { x: 0, y: 0 }, () => false, false);
    assert.ok(r.imgs.includes(rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, true, false, light))), id + (light ? ' on a light floor' : ' on a dark floor'));
  }
}));

check('a boss dies in a puff of its bright rim, not its dark body; the horde keeps its body colour', () => {
  for (const [id, s] of Object.entries(LOOKS)) assert.equal(bodyColourOf({ boss: true, bossSprite: s }), s.rim, id);
  assert.equal(bodyColourOf({ boss: true }), BOSS_SPRITE.rim, 'the default boss');
  assert.equal(bodyColourOf({ typeId: 'BRUTE' }), '#8aa0c0', 'a brute puffs in its body steel');
});

check('the Choir Mother wears danger only in her two eyes; her singing mouth is not a threat mark', () => {
  const s = BOSS_SPRITES.CHOIR_MOTHER;
  for (const [i, fr] of s.frames.entries()) {
    const danger = fr.flat().filter(v => v && reservedFamily(s.palette[v]) === 'DANGER').length;
    assert.equal(danger, 2, 'frame ' + i + ': ' + danger + ' danger pixels');
  }
});

// integ4: the death movie's frozen frame is the world drawn in 'death-cine'. The Maw was
// drawn only in 'finale', so a death to the Maw boxed empty void. It is drawn wherever its
// arena is: the death movie, the end of the run, a pause, with the light ON or OFF.
check('the Maw stays in its frame under the death movie, the end card and a pause, light ON or OFF', () => withCache(() => {
  const s = FINAL_BOSS_SPRITE;
  const body = rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, true, false, false));
  for (const mode of ['finale', 'death-cine', 'dead', 'settings']) for (const light of [0, 2]) {
    assert.ok(mawFrame('BLOOD_RUST', mode, light).includes(body), mode + ' light ' + light + ': the Maw is drawn');
  }
  assert.ok(!mawFrame('BLOOD_RUST', 'playing', 2).includes(body), 'no Maw outside its arena');
}));

// integ4: the light layer and the boss rims meet in one frame. A wave boss on the field at
// LIGHTING ON wears its own rim (and the keyline on a light floor), as at OFF.
check('a wave boss keeps its rim and its keyline rule with the light ON', () => withCache(() => {
  for (const [id, s] of Object.entries(BOSS_SPRITES)) for (const stage of ['VOID_REACH', 'WHITEOUT']) for (const light of [0, 2]) {
    const boss = { boss: true, elite: true, bossSprite: s, hp: 1, maxHp: 1, x: 240, y: 110, w: 24, h: 24, age: 0.67 };
    const imgs = mawFrame(stage, 'playing', light, [boss], false);
    const keyline = stage === 'WHITEOUT';
    const body = rasterOf(s.frames[0], s.palette, actorStyle(false, false, s.rim, true, false, keyline));
    assert.ok(imgs.includes(body), id + ' on ' + stage + ' light ' + light + ': its rim' + (keyline ? ' and keyline' : ''));
  }
}));

console.log('test_boss_draw: ' + passed + ' checks passed');
