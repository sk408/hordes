// M2 readability and feel: the feel observer's pools and caps, knockback
// bounds, screen shake gating, the sprite cache's fallback and cached paths,
// and the world-scale snap.
import assert from 'node:assert';
import { FEEL, feelOf, feelStep, addNumber, addShake, shakeOffset, setShakeEnabled, getShakeEnabled,
  markCrit, setFeelAudio } from '../src/fx/feel.js';
import { formatDamage } from '../src/fx/feel_render.js';
import { blitGrid, blitPainted, cacheEnabled, actorStyle, STYLE_PLAIN, SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { Renderer } from '../src/render.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { CONFIG as C } from '../src/config.js';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

const mkState = () => ({
  time: 0, mode: 'playing',
  player: { x: 0, y: 0, hp: 100, xp: 0, level: 1, stats: { maxHp: 100 }, potions: { hp: 1, mp: 1 } },
  enemies: [], effects: [], projectiles: [], chests: [], itemDrops: [],
});
const mkEnemy = (o = {}) => ({ typeId: 'CHASER', x: 40, y: 0, w: 10, h: 12, hp: 100, maxHp: 100, speed: 30, ...o });
const step = (st, dt = 1 / 60) => { st.time += dt; feelStep(st, dt); };

// ---- damage numbers ----------------------------------------------------------
check('a hit raises one number; a second hit on the same body merges into it', () => {
  const st = mkState(); const e = mkEnemy(); st.enemies.push(e);
  step(st);
  e.hp -= 10; step(st);
  const f = feelOf(st);
  assert.equal(f.nums.length, 1);
  assert.equal(f.nums[0].value, 10);
  e.hp -= 7; step(st);
  assert.equal(f.nums.length, 1, 'merged, not stacked');
  assert.equal(f.nums[0].value, 17);
  assert.ok(f.nums[0].merged >= 1);
});

check('the pool never passes NUM_CAP, and no damage is dropped when it is full', () => {
  const st = mkState();
  for (let i = 0; i < 400; i++) st.enemies.push(mkEnemy({ x: (i % 40) * 40 - 800, y: Math.floor(i / 40) * 40 - 200 }));
  step(st);
  let dealt = 0;
  for (let k = 0; k < 3; k++) {
    for (const e of st.enemies) { e.hp -= 3; dealt += 3; }
    step(st);
    assert.ok(feelOf(st).nums.length <= FEEL.NUM_CAP, 'cap held at ' + feelOf(st).nums.length);
  }
  const shown = feelOf(st).nums.reduce((a, n) => a + n.value, 0);
  assert.equal(feelOf(st).nums.length, FEEL.NUM_CAP);
  assert.ok(Math.abs(shown - dealt) < 1e-6, `every point of damage is on screen (${shown} of ${dealt})`);
});

check('dense fields widen the merge radius', () => {
  const st = mkState(); const f = feelOf(st);
  for (let i = 0; i < Math.ceil(FEEL.NUM_CAP * FEEL.DENSE_FRAC); i++) addNumber(f, i * 100, 0, 1);
  const before = f.nums.length;
  addNumber(f, 20, 0, 5);   // 20px from the first: outside MERGE_R, inside MERGE_R_DENSE
  assert.equal(f.nums.length, before, 'merged under density');
  assert.equal(f.nums[0].value, 6);
});

check('a marked crit shows as a crit and draws larger text', () => {
  const st = mkState(); const e = mkEnemy(); st.enemies.push(e);
  step(st);
  markCrit(st, e); e.hp -= 30; step(st);
  assert.equal(feelOf(st).nums[0].kind, 'crit');
  e.hp -= 5; step(st);
  assert.equal(feelOf(st).nums[0].kind, 'crit', 'a later plain hit does not demote the merged crit');
});

check('numbers expire on sim time, identically at 60Hz and 120Hz', () => {
  const life = (hz) => {
    const st = mkState(); const e = mkEnemy({ hp: 1e6, maxHp: 1e6 }); st.enemies.push(e);
    step(st, 1 / hz); e.hp -= 10; step(st, 1 / hz);
    let t = 0;
    while (feelOf(st).nums.length && t < 5) { step(st, 1 / hz); t += 1 / hz; }
    return t;
  };
  assert.ok(Math.abs(life(60) - life(120)) <= 1 / 60 + 1e-9, 'same lifetime within one 60Hz frame');
  assert.ok(Math.abs(life(60) - FEEL.NUM_TTL) <= 2 / 60);
});

check('damage formatting stays short', () => {
  assert.equal(formatDamage(0.2), '1');
  assert.equal(formatDamage(999), '999');
  assert.equal(formatDamage(1234), '1.2k');
  assert.equal(formatDamage(45678), '45k');
  assert.equal(formatDamage(2500000), '2.5M');
});

// ---- knockback ---------------------------------------------------------------
const pushOf = (o, hz = 60) => {
  const st = mkState(); const e = mkEnemy(o); st.enemies.push(e);
  step(st, 1 / hz);
  const x0 = e.x;
  e.hp -= e.maxHp * 0.3;
  for (let i = 0; i < hz; i++) step(st, 1 / hz);
  return e.x - x0;
};
check('a small body is pushed a few pixels away from the hero, once', () => {
  const d = pushOf({});
  assert.ok(d > 1 && d < 4, 'travel ' + d.toFixed(2) + 'px');
});
check('knockback travel does not depend on the frame rate', () => {
  assert.ok(Math.abs(pushOf({}, 60) - pushOf({}, 144)) < 0.35);
});
check('bosses, elites, big bodies and planted turrets are never pushed', () => {
  assert.equal(pushOf({ boss: true }), 0);
  assert.equal(pushOf({ elite: true }), 0);
  assert.equal(pushOf({ w: 24 }), 0);
  assert.equal(pushOf({ speed: 0 }), 0);
});
check('chip damage under KB_MIN_FRAC does not push; pushes respect the cooldown', () => {
  const st = mkState(); const e = mkEnemy({ hp: 1e6, maxHp: 1e6 }); st.enemies.push(e);
  step(st);
  const x0 = e.x;
  for (let i = 0; i < 120; i++) { e.hp -= 100; step(st); }   // 0.01% per tick
  assert.equal(e.x, x0);
  const e2 = mkEnemy({ hp: 1e6, maxHp: 1e6 }); st.enemies.push(e2);
  step(st);
  const s0 = e2.x;
  for (let i = 0; i < 60; i++) { e2.hp -= 1e5; step(st); }   // a heavy hit every frame for 1s
  const perSec = e2.x - s0;
  assert.ok(perSec < (1 / FEEL.KB_COOLDOWN + 1) * (FEEL.KB_SPEED / FEEL.KB_DECAY), 'bounded drift ' + perSec.toFixed(1) + 'px/s');
});

// ---- deaths, hurt, shake -----------------------------------------------------
check('a removed enemy leaves a puff sized by class; an elite death shakes', () => {
  const st = mkState();
  const a = mkEnemy(), b = mkEnemy({ elite: true, x: 60 });
  st.enemies.push(a, b);
  step(st);
  a.hp = 0; b.hp = 0; st.enemies.length = 0;
  step(st);
  const f = feelOf(st);
  assert.equal(f.puffs.length, 2);
  assert.deepEqual(f.puffs.map(p => p.cls).sort(), [0, 2]);
  assert.ok(f.shake > 0);
});
check('the puff pool is capped', () => {
  const st = mkState();
  for (let i = 0; i < 300; i++) st.enemies.push(mkEnemy({ x: i % 50, y: i % 30 }));
  step(st);
  st.enemies.length = 0;
  step(st);
  assert.equal(feelOf(st).puffs.length, FEEL.PUFF_CAP);
});
check('player damage shakes, flashes and is bounded by SHAKE_MAX', () => {
  const st = mkState(); step(st);
  st.player.hp -= 90; step(st);
  const f = feelOf(st);
  assert.ok(f.shake > 0 && f.shake <= FEEL.SHAKE_MAX);
  assert.ok(f.hurtT > 0);
  assert.equal(f.nums[0].kind, 'hurt');
  const o = shakeOffset(st, false);
  assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y) && Math.abs(o.x) <= FEEL.SHAKE_MAX && Math.abs(o.y) <= FEEL.SHAKE_MAX);
});
check('shake is off under reduced motion and under the settings toggle, and decays to rest', () => {
  const st = mkState(); step(st);
  addShake(feelOf(st), 5);
  assert.deepEqual(shakeOffset(st, true), { x: 0, y: 0 });
  setShakeEnabled(false);
  assert.equal(getShakeEnabled(), false);
  assert.deepEqual(shakeOffset(st, false), { x: 0, y: 0 });
  setShakeEnabled(true);
  for (let i = 0; i < 90; i++) step(st);
  assert.equal(feelOf(st).shake, 0);
});
check('a new run starts with empty pools', () => {
  const st = mkState(); const e = mkEnemy(); st.enemies.push(e);
  step(st); e.hp -= 5; step(st);
  assert.equal(feelOf(st).nums.length, 1);
  st.player = { ...st.player }; st.time = 0;
  step(st);
  assert.equal(feelOf(st).nums.length, 0);
});

// ---- sound events ------------------------------------------------------------
check('the observer raises hit / kill / hurt / gem / boss sounds and switches the music section', () => {
  const log = []; let mode = 'run';
  setFeelAudio({ playSfx: (n, a) => log.push(a === undefined ? n : n + ':' + a), setMusicMode: (m) => { mode = m; } });
  const st = mkState(); const e = mkEnemy(); st.enemies.push(e);
  step(st);
  e.hp -= 5; step(st);
  assert.ok(log.includes('hit'));
  e.hp = 0; st.enemies.length = 0; step(st);
  assert.ok(log.includes('kill'));
  st.player.hp -= 5; step(st);
  assert.ok(log.includes('hurt'));
  st.player.xp += 1; step(st); st.player.xp += 1; step(st); st.player.xp += 1; step(st);
  assert.deepEqual(log.filter(x => x.startsWith('gem')), ['gem:0', 'gem:1', 'gem:2'], 'the gem combo climbs');
  st.enemies.push(mkEnemy({ boss: true })); step(st);
  assert.ok(log.includes('bossArrive'));
  assert.equal(mode, 'boss');
  st.enemies.length = 0; step(st);
  assert.ok(log.includes('bossDeath'));
  assert.equal(mode, 'run');
  st.projectiles.push({ kind: 'boomerang', x: 0, y: 0 }); step(st);
  assert.ok(log.includes('fire_arc'));
  setFeelAudio(null);
});

// ---- sprite cache ------------------------------------------------------------
const recorder = () => {
  const ops = [];
  return { ops, fillStyle: '', globalAlpha: 1,
    fillRect(x, y, w, h) { ops.push(['rect', x, y, w, h, this.fillStyle]); },
    drawImage(img, x, y, w, h) { ops.push(['img', x, y, w, h]); } };
};
const spr = ENEMY_SPRITES.CHASER;
const cells = spr.frames[0].flat().filter(Boolean).length;

check('without a real canvas the cache is off and a grid paints one rect per pixel', () => {
  SPRITE_CACHE_TEST.reprobe();
  assert.equal(cacheEnabled(), false, 'node has no canvas');
  const g = recorder();
  const used = blitGrid(g, spr.frames[0], spr.palette, 10, 20, actorStyle(false, false, null));
  assert.equal(used, false);
  assert.equal(g.ops.length, cells);
  assert.ok(g.ops.every(o => o[0] === 'rect' && o[3] === 1 && o[4] === 1));
  assert.ok(g.ops.every(o => o[1] >= 10 && o[2] >= 20), 'drawn at the asked origin');
});
check('the fallback hit flash is the white silhouette (same pixels, all white)', () => {
  const g = recorder();
  blitGrid(g, spr.frames[0], spr.palette, 0, 0, actorStyle(true, false, null));
  assert.equal(g.ops.length, cells);
  assert.ok(g.ops.every(o => o[5] === '#ffffff'));
});
check('the fallback painter path calls the painter directly', () => {
  const g = recorder();
  blitPainted(g, 'test:dot', { x: -1, y: -1, w: 3, h: 3 }, (c, x, y) => c.fillRect(x - 1, y - 1, 3, 3), 7, 9);
  assert.deepEqual(g.ops, [['rect', 6, 8, 3, 3, '']]);
});
check('with a canvas the same grid is one drawImage, baked once per style', () => {
  SPRITE_CACHE_TEST.forceFakeCanvas();
  assert.equal(cacheEnabled(), true);
  const g = recorder();
  const st = actorStyle(false, false, '#ffd75e');
  blitGrid(g, spr.frames[1], spr.palette, 10, 20, st);
  blitGrid(g, spr.frames[1], spr.palette, 30, 20, st);
  assert.equal(g.ops.length, 2);
  assert.ok(g.ops.every(o => o[0] === 'img'));
  // Two outline rings push the raster 2px up and left of the art origin.
  assert.deepEqual(g.ops[0].slice(1, 3), [8, 18]);
  const g2 = recorder();
  blitGrid(g2, spr.frames[1], spr.palette, 0, 0, STYLE_PLAIN, 4);
  assert.deepEqual(g2.ops[0], ['img', 0, 0, spr.box.w * 4, spr.box.h * 4], 'scaled blit stretches the raster');
  SPRITE_CACHE_TEST.reprobe();
});

// ---- world scale ---------------------------------------------------------------
check('the world scale is a third larger where pixels allow, on whole device pixels', () => {
  assert.equal(Renderer.worldScaleFor(1), 1, 'no spare pixels (and the headless harness): unscaled');
  for (const vs of [1.5, 2, 2.4, 2.6667, 3, 3.9, 4, 5.275, 6]) {
    const sc = Renderer.worldScaleFor(vs);
    assert.ok(sc >= 1.2 && sc <= 1.6, vs + ' -> ' + sc);
    assert.ok(Math.abs(sc * vs - Math.round(sc * vs)) < 1e-9, 'integer device px per world px at ' + vs);
  }
});
check('the scaled view still sits inside the spawn ring', () => {
  // Enemies spawn SPAWN_DIST from the hero; the farthest visible point is the
  // view corner. A larger world scale only shrinks the view, so anything that
  // spawned off screen before still does.
  const ring = C.ENEMY.SPAWN_DIST;
  for (const sc of [1.25, 1.3333, 1.5]) {
    const corner = Math.hypot(C.VIEW_W / 2, C.VIEW_H / 2) / sc;
    assert.ok(corner < ring, `corner ${corner.toFixed(0)}px < ring ${ring}px at ${sc}x`);
    assert.ok(C.VIEW_W / sc > 300 && C.VIEW_H / sc >= 200, 'the view keeps at least 320x200 world px');
  }
});

console.log('test_m2_feel: ' + passed + ' checks passed');
