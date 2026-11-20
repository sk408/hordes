// HORDES - R3 "you can see the fight": the hero is drawn on top, damage
// numbers are calmer (a cap on large ones with slots kept for kills, the
// big-hit style from minute 8, a fade near the hero, the NUMBERS setting) and
// gems recede in a crowd without changing a single pickup.
// Run: node test/test_r3_readable.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { feelOf, feelStep, setNumbersMode, getNumbersMode } from '../src/fx/feel.js';
import { NUMBERS, heroFade, isBigHit } from '../src/fx/feel_render.js';
import { GEM_RECEDE, HERO_WARM } from '../src/render.js';
import { CHARACTER_SPRITES } from '../src/character_sprites.js';
import { SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

const s = suite('test_r3_readable');

function seedRandom(seed) {
  let a = seed | 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
st.mode = 'menu'; T.startRun();
h.pump(2);
const R = T.renderer;

// A clean field: no enemies, no weather, the feel pool emptied.
function clearField() {
  st.enemies.length = 0; st.gems.length = 0;
  if (st.enemyShots) st.enemyShots.length = 0;
  if (st.projectiles) st.projectiles.length = 0;
  if (st.effects) st.effects.length = 0;
  st.weather = null;
  const f = feelOf(st);
  f.nums.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0;
  f.hurtT = 0; f.hitAvg = 10;
}
function draw() {
  R.readStats = {};
  R.render(st, st.cam);
  const out = R.readStats;
  R.readStats = null;
  return out;
}
const num = (dx, dy, value, kind = 'hit', extra = {}) => {
  const n = { x: st.player.x + dx, y0: st.player.y + dy, value, kind, owner: null, age: 0.05, ttl: 0.65, merged: 0, ...extra };
  feelOf(st).nums.push(n);
  return n;
};
// Record the painted rects of one frame.
function recordFrame() {
  h.rec.rects.length = 0; h.rec.on = true;
  R.render(st, st.cam);
  h.rec.on = false;
  return h.rec.rects;
}
const inBox = (r, x0, y0, x1, y1) => r.x >= x0 && r.x < x1 && r.y >= y0 && r.y < y1 && r.w <= 2 && r.h <= 2;
const lastIn = (rects, x0, y0, x1, y1) => Math.max(...rects.filter(r => r.d >= 1 && inBox(r, x0, y0, x1, y1)).map(r => r.n));

s.check('the hero is drawn after the effects, the weather and the numbers', () => {
  clearField();
  const d = draw();
  assert.deepEqual(d.order, ['effects', 'weather', 'numbers', 'hero']);
});

s.check('in the painted rects, the hero comes after a number, a spark and the weather', () => {
  clearField();
  st.time = 30;
  const p = st.player, cam = st.cam;
  const hx = Math.round(p.x - cam.x), hy = Math.round(p.y - cam.y);
  num(90, 0, 777);
  // A spark well clear of the hero and the number.
  feelOf(st).sparks.push({ x: p.x - 70, y: p.y + 40, vx: 0, vy: 0, age: 0, ttl: 1, colour: '#ff00ff' });
  // The weather pass paints one mark at a spot of its own.
  const realWeather = R.drawWeatherParticles;
  R.drawWeatherParticles = (g) => { g.fillRect(hx + 70, hy + 50, 1, 1); };
  let rects;
  try { rects = recordFrame(); } finally { R.drawWeatherParticles = realWeather; }
  const lastHero = lastIn(rects, hx - 6, hy - 6, hx + 6, hy + 6);
  const lastNum = lastIn(rects, hx + 80, hy - 30, hx + 100, hy);
  const lastSpark = lastIn(rects, hx - 72, hy + 38, hx - 66, hy + 44);
  const lastWeather = lastIn(rects, hx + 70, hy + 50, hx + 71, hy + 51);
  for (const [k, v] of Object.entries({ lastHero, lastNum, lastSpark, lastWeather })) {
    assert.ok(Number.isFinite(v), k + ' was painted');
  }
  assert.ok(lastHero > lastNum, 'hero at ' + lastHero + ', number at ' + lastNum);
  assert.ok(lastHero > lastSpark, 'hero at ' + lastHero + ', spark at ' + lastSpark);
  assert.ok(lastHero > lastWeather, 'hero at ' + lastHero + ', weather at ' + lastWeather);
});

// ---- the hero's colour, read from what the sprite cache really bakes ---------
// A small pixel-backed canvas, so the cache bakes the ring, the pool, the
// arrow and the pilot's outline for real and the test can read their colours.
function parseColour(c) {
  c = String(c);
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255, 255]; }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const q = m[1].split(',').map(Number); return [q[0], q[1], q[2], q.length > 3 ? Math.round(q[3] * 255) : 255]; }
  return [0, 0, 0, 0];
}
class PixelCanvas {
  constructor(w, hh) {
    this.width = w; this.height = hh;
    this.data = new Uint8ClampedArray(Math.max(1, w * hh) * 4);
    const cv = this;
    const base = {
      fillStyle: '#000000', globalAlpha: 1,
      fillRect(x, y, w2, h2) {
        const col = parseColour(this.fillStyle);
        const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(cv.width, Math.floor(x + w2));
        const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(cv.height, Math.floor(y + h2));
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) cv.data.set(col, (yy * cv.width + xx) * 4);
        }
      },
      getImageData() { return { data: new Uint8ClampedArray(cv.data) }; },
      putImageData(img) { cv.data.set(img.data.subarray(0, cv.data.length)); },
      drawImage(img, x, y) {
        if (!(img instanceof PixelCanvas)) return;
        for (let yy = 0; yy < img.height; yy++) {
          for (let xx = 0; xx < img.width; xx++) {
            const i = (yy * img.width + xx) * 4, tx = xx + Math.round(x || 0), ty = yy + Math.round(y || 0);
            if (img.data[i + 3] && tx >= 0 && ty >= 0 && tx < cv.width && ty < cv.height) {
              cv.data.set(img.data.subarray(i, i + 4), (ty * cv.width + tx) * 4);
            }
          }
        }
      },
    };
    this.ctx = new Proxy(base, {
      get(t, k) { return k in t ? t[k] : (typeof k === 'string' ? () => {} : undefined); },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  getContext() { return this.ctx; }
}
const hasColour = (img, rgb, wantAlpha) => {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2] && img.data[i + 3] > 0 &&
        wantAlpha(img.data[i + 3])) return true;
  }
  return false;
};

s.check('hero warm white is what the ring, the pool, the arrow and the pilot outline paint', () => {
  assert.match(HERO_WARM, /^#[0-9a-f]{6}$/);
  const warm = parseColour(HERO_WARM);
  const hadOff = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = PixelCanvas;
  SPRITE_CACHE_TEST.reprobe();
  const realCtx = R.ctx;
  const draws = [];
  R.ctx = new Proxy(realCtx, {
    get(t, k) {
      if (k === 'drawImage') return (img, ...a) => { draws.push({ img, x: a[0], y: a[1] }); return t.drawImage(img, ...a); };
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  try {
    clearField();
    feelOf(st).hurtT = 0;
    const p = st.player;
    // A crowd round the hero raises the arrow.
    for (let i = 0; i < 6; i++) st.enemies.push(makeTypedEnemy('CHASER', p.x + 14 + i * 4, p.y + (i % 2 ? 9 : -9), st.time, {}));
    R.render(st, st.cam);
  } finally {
    R.ctx = realCtx;
    if (hadOff === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = hadOff;
    SPRITE_CACHE_TEST.reprobe();
    st.enemies.length = 0;
  }
  const hx = Math.round(st.player.x - st.cam.x);
  const near = (d) => d.img instanceof PixelCanvas && Math.abs(d.x + d.img.width / 2 - hx) <= 3;
  const part = (w) => draws.filter(d => near(d) && d.img.width === w);
  const opaque = (a) => a === 255, see = (a) => a < 255;
  // On a light floor (R6) the pilot wears a third ring, the dark keyline,
  // outside its warm outline: one px more on each side.
  const ring = part(31), pool = part(33), arrow = part(11), pilot = part(R.groundLight ? 22 : 20);
  assert.ok(ring.length && pool.length && arrow.length && pilot.length,
    'all four parts drawn: ring ' + ring.length + ', pool ' + pool.length + ', arrow ' + arrow.length + ', pilot ' + pilot.length);
  assert.ok(ring.some(d => hasColour(d.img, warm, opaque)), 'the ring is warm white');
  assert.ok(pool.some(d => hasColour(d.img, warm, see)), 'the pool is a soft warm white');
  assert.ok(arrow.some(d => hasColour(d.img, warm, opaque)), 'the arrow is warm white');
  assert.ok(pilot.some(d => hasColour(d.img, warm, opaque)), 'the pilot\'s second outline is warm white');
  // The old cyan marks are gone from the hero.
  for (const d of [...ring, ...pool, ...arrow, ...pilot]) {
    assert.ok(!hasColour(d.img, [0x9f, 0xf0, 0xff], () => true), 'no old cyan');
    assert.ok(!hasColour(d.img, [0xbf, 0xe3, 0xff], () => true), 'no old cyan pool');
  }
});

s.check('no pilot palette uses the hero colour', () => {
  for (const c of Object.values(CHARACTER_SPRITES)) {
    for (const col of Object.values(c.palette)) assert.notEqual(String(col).toLowerCase(), HERO_WARM, c.id);
  }
});

// ---- numbers -----------------------------------------------------------------
s.check('at most NUMBERS.LARGE_CAP numbers are large; two slots are kept for kills, crits take the rest', () => {
  clearField();
  st.time = 600;
  for (let i = 0; i < 20; i++) num(-150 + i * 15, -60, 50 + i, 'crit');
  for (let i = 0; i < 10; i++) num(-150 + i * 15, 60, 500, 'hit', { kill: true });
  const d = draw();
  const large = d.nums.filter(n => n.s === 2);
  assert.equal(NUMBERS.LARGE_CAP, 6);
  assert.equal(large.length, 6, 'six large, got ' + large.length);
  assert.equal(large.filter(n => n.kill).length, 2, 'two kills keep their slots in a storm of crits');
  assert.equal(large.filter(n => n.kind === 'crit').length, 4, 'crits take the other four');
  assert.equal(d.nums.filter(n => n.kind === 'crit').length, 20, 'all twenty crits drawn');
  assert.equal(d.nums.filter(n => n.kill).length, 10, 'all ten kills drawn');
});

s.check('kills take the large slots crits leave', () => {
  clearField();
  st.time = 600;
  num(-100, -60, 50, 'crit');
  for (let i = 0; i < 8; i++) num(-100 + i * 20, 60, 20, 'hit', { kill: true });
  const d = draw();
  assert.equal(d.nums.filter(n => n.s === 2 && n.kill).length, 5);
  assert.equal(d.nums.filter(n => n.s === 2 && n.kind === 'crit').length, 1);
});

s.check('crits fill the kill slots when there are no kills', () => {
  clearField();
  st.time = 600;
  for (let i = 0; i < 9; i++) num(-150 + i * 30, -60, 50 + i, 'crit');
  const d = draw();
  assert.equal(d.nums.filter(n => n.s === 2).length, NUMBERS.LARGE_CAP);
});

s.check('the big-hit style only from minute 8: a plain merged pop is large before, small and soft after', () => {
  clearField();
  st.time = 60;
  num(100, 0, 12, 'hit', { merged: 3 });
  let d = draw();
  assert.equal(d.nums[0].s, 2, 'minute 1: the merged pop is large, as before');
  assert.equal(d.nums[0].a, 1);
  st.time = NUMBERS.LATE_AT + 1;
  d = draw();
  assert.equal(d.nums[0].s, 1, 'minute 8: a plain hit stays small');
  assert.ok(d.nums[0].a < 1, 'and softer');
  // Four ordinary hits merged into one number are not a big hit.
  feelOf(st).nums[0].value = 40;
  d = draw();
  assert.equal(d.nums[0].s, 1, 'a merged sum of ordinary hits stays small');
  // Hits each three times the running average are.
  feelOf(st).nums[0].value = 120;
  d = draw();
  assert.equal(d.nums[0].s, 2, 'a big hit keeps the large style');
  assert.equal(d.nums[0].a, 1);
});

s.check('a big hit is judged per hit: a merged sum is shared out over its hits', () => {
  const f = { hitAvg: 100 };
  assert.equal(isBigHit({ kind: 'hit', value: 300, merged: 0 }, f), true, 'one hit of 3x');
  assert.equal(isBigHit({ kind: 'hit', value: 299, merged: 0 }, f), false, 'just under 3x');
  assert.equal(isBigHit({ kind: 'hit', value: 1000, merged: 9 }, f), false, 'ten average hits merged');
  assert.equal(isBigHit({ kind: 'hit', value: 3000, merged: 9 }, f), true, 'ten big hits merged');
  assert.equal(isBigHit({ kind: 'crit', value: 1, merged: 0 }, f), true);
  assert.equal(isBigHit({ kind: 'hit', value: 1, merged: 0, kill: true }, f), true);
  assert.equal(isBigHit({ kind: 'hurt', value: 1e6, merged: 0 }, f), false);
});

s.check('a number fades as it nears the hero; the hero\'s own hurt number does not', () => {
  clearField();
  st.time = 60;
  num(0, 0, 9);
  num(120, 0, 9);
  num(0, -12, 4, 'hurt');
  const d = draw();
  const [near, far, hurt] = d.nums;
  assert.ok(near.a <= NUMBERS.HERO_MIN_ALPHA + 1e-9, 'on the hero: ' + near.a);
  assert.equal(far.a, 1, 'far away: full');
  assert.equal(hurt.a, 1, 'hurt number: full');
  const hb = d.hero;
  assert.ok(hurt.y + hurt.h <= hb.y0, 'the hurt number starts above the hero box');
  assert.equal(heroFade({ x: 0, y: 0, w: 4, h: 4 }, { x0: 100, y0: 0, x1: 110, y1: 10 }), 1);
});

s.check('the fade starts 16 px out: a number 10 px from the hero box is part faded', () => {
  assert.equal(NUMBERS.HERO_GAP, 16);
  const hb = { x0: 100, y0: 0, x1: 110, y1: 10 };
  const a10 = heroFade({ x: 120, y: 0, w: 4, h: 4 }, hb);
  assert.ok(a10 < 0.8 && a10 > NUMBERS.HERO_MIN_ALPHA, '10 px out: ' + a10);
  assert.equal(heroFade({ x: 126, y: 0, w: 4, h: 4 }, hb), 1, '16 px out: full');
});

s.check('crits and kills on the hero keep a readable floor', () => {
  clearField();
  st.time = 60;
  num(0, 0, 9, 'crit');
  num(0, 2, 9, 'hit', { kill: true });
  num(0, 4, 9);
  const d = draw();
  const crit = d.nums.find(n => n.kind === 'crit'), kill = d.nums.find(n => n.kill), plain = d.nums.find(n => n.kind === 'hit' && !n.kill);
  assert.ok(NUMBERS.HERO_MIN_ALPHA_BIG >= 0.4, 'the floor is readable');
  assert.ok(Math.abs(crit.a - NUMBERS.HERO_MIN_ALPHA_BIG) < 1e-9, 'crit on the hero: ' + crit.a);
  assert.ok(Math.abs(kill.a - NUMBERS.HERO_MIN_ALPHA_BIG) < 1e-9, 'kill on the hero: ' + kill.a);
  assert.ok(plain.a <= NUMBERS.HERO_MIN_ALPHA + 1e-9, 'a plain hit still fades right down: ' + plain.a);
});

s.check('NUMBERS: ALL draws every number, BIG only crits / kills / big hits / hurt, OFF none', () => {
  clearField();
  st.time = 60;
  num(-100, 0, 5); num(-60, 0, 50); num(-20, 0, 5, 'crit'); num(20, 0, 5, 'hit', { kill: true }); num(60, -40, 3, 'hurt');
  setNumbersMode('all');
  assert.equal(draw().nums.length, 5);
  setNumbersMode('big');
  assert.deepEqual(draw().nums.map(n => n.kind + (n.kill ? '+kill' : '')).sort(), ['crit', 'hit', 'hit+kill', 'hurt'].sort());
  setNumbersMode('off');
  assert.equal(draw().nums.length, 0);
  setNumbersMode('nonsense');
  assert.equal(getNumbersMode(), 'all', 'an unknown value falls back to ALL');
  // The pool itself never changes with the mode (telemetry and tests count it).
  assert.equal(feelOf(st).nums.length, 5);
});

s.check('the DAMAGE NUMBERS card cycles ALL -> BIG -> OFF -> ALL and is remembered', () => {
  setNumbersMode('all');
  T.openSettings();
  const card = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : [])
    .find(c => (c.innerHTML || '').includes('>DAMAGE NUMBERS<'));
  for (const want of ['big', 'off', 'all']) {
    const c = card();
    assert.ok(c, 'the card is on the settings screen');
    c.click();
    assert.equal(getNumbersMode(), want);
    assert.equal(h.storage.get('hordes_numbers'), want, 'saved with the settings');
  }
  T.closeSettings ? T.closeSettings() : null;
});

// The saved setting is read back when the game starts.
setNumbersMode('all');
await boot({ storage: [['hordes_onboarded', '1'], ['hordes_numbers', 'big']], variant: 'r3-numbers-big' });
const bootedBig = getNumbersMode();
setNumbersMode('off');
await boot({ storage: [['hordes_onboarded', '1'], ['hordes_numbers', 'nonsense']], variant: 'r3-numbers-bad' });
const bootedBad = getNumbersMode();
setNumbersMode('all');
s.check('the saved DAMAGE NUMBERS setting is loaded at boot', () => {
  assert.equal(bootedBig, 'big');
  assert.equal(bootedBad, 'all', 'a bad stored value boots as ALL');
});

// Real hits through feelStep: the running average and the kill mark.
s.check('feelStep keeps the running hit average and marks the killing blow', () => {
  const p = { x: 0, y: 0, hp: 100, xp: 0, level: 1, stats: { maxHp: 100 } };
  const e1 = { x: 40, y: 0, hp: 100, maxHp: 100, w: 10, h: 10 };
  const e2 = { x: -40, y: 0, hp: 100, maxHp: 100, w: 10, h: 10 };
  const S = { player: p, enemies: [e1, e2], time: 1, gems: [] };
  feelStep(S, 1 / 60);
  const f = S.feel;
  assert.equal(f.hitAvg, 0);
  e1.hp = 90; S.time += 1 / 60;
  feelStep(S, 1 / 60);
  assert.equal(f.hitAvg, 10, 'the first hit sets the average');
  e1.hp = 60; S.time += 1 / 60;
  feelStep(S, 1 / 60);
  assert.ok(Math.abs(f.hitAvg - (10 * 0.98 + 30 * 0.02)) < 1e-9, 'then it moves slowly: ' + f.hitAvg);
  assert.ok(f.nums.every(n => !n.kill), 'no kill yet');
  // A blow that takes the hp to 0 is a kill.
  e1.hp = 0; S.time += 1 / 60;
  feelStep(S, 1 / 60);
  assert.ok(f.nums.some(n => n.owner === e1 && n.kill), 'the killing blow is marked');
  // A body that leaves the list marks its last number as the kill.
  e2.hp = 70; S.time += 1 / 60;
  feelStep(S, 1 / 60);
  assert.ok(f.nums.some(n => n.owner === e2 && !n.kill), 'a plain hit on the second');
  S.enemies = [e1]; S.time += 1 / 60;
  feelStep(S, 1 / 60);
  assert.ok(f.nums.filter(n => n.owner === e2).every(n => n.kill), 'gone from the list: its number shows the kill');
});

// ---- gems ----------------------------------------------------------------------
s.check('in a crowd of gems, far gems fade; every gem in the game draws (R3 floor: no picture-only merge)', () => {
  clearField();
  draw();   // an empty field: the crowd state is off
  st.time = 600;
  const p = st.player;
  // 30 near small gems in pairs on one spot, 30 far gems in a row.
  for (let i = 0; i < 30; i++) st.gems.push({ x: p.x - 60 + (i >> 1) * 11, y: p.y + 20, xp: 1, age: 0 });
  for (let i = 0; i < 30; i++) st.gems.push({ x: p.x - 150 + i * 10, y: p.y - 125 + (i % 2), xp: 7, age: 0 });
  const before = st.gems.length;
  let d = draw();
  assert.ok(d.gemCrowd, 'crowded at 60 on screen');
  assert.equal(d.gems.length, before, 'a gem on screen is a gem in the game: all ' + before + ' drawn');
  assert.ok(d.gems.some(g => g.a === GEM_RECEDE.FAR_ALPHA), 'far gems fade');
  assert.ok(d.gems.some(g => g.a === 1), 'near gems stay solid');
  assert.equal(st.gems.length, before, 'no gem left the list');
  // It stays on down to CROWD_OFF, so the state does not flicker at the edge.
  assert.ok(GEM_RECEDE.CROWD_OFF < GEM_RECEDE.CROWD - 5, 'a real gap between on and off');
  st.gems.length = GEM_RECEDE.CROWD;
  d = draw();
  assert.ok(d.gemCrowd, 'still crowded at the on count');
  st.gems.length = GEM_RECEDE.CROWD_OFF;
  d = draw();
  assert.ok(d.gemCrowd, 'still crowded at the off count');
  // Under CROWD_OFF nothing recedes, and it stays off until past CROWD again.
  st.gems.length = GEM_RECEDE.CROWD_OFF - 1;
  d = draw();
  assert.ok(!d.gemCrowd, 'off under CROWD_OFF');
  assert.ok(d.gems.every(g => g.a === 1));
  for (let i = st.gems.length; i < GEM_RECEDE.CROWD; i++) st.gems.push({ x: p.x - 150 + i * 3, y: p.y + 90, xp: 1, age: 0 });
  d = draw();
  assert.ok(!d.gemCrowd, 'still off at the on count');
  st.gems.push({ x: p.x + 150, y: p.y + 90, xp: 1, age: 0 });
  d = draw();
  assert.ok(d.gemCrowd, 'on again past CROWD');
});

s.check('two gems on one spot both draw, small or mid (the floor merges for real, not the picture)', () => {
  clearField();
  draw();
  st.time = 600;
  const p = st.player;
  for (let i = 0; i < GEM_RECEDE.CROWD + 10; i++) st.gems.push({ x: p.x - 160 + (i % 25) * 13, y: p.y + 40 + Math.floor(i / 25) * 20, xp: 1, age: 0 });
  st.gems.push({ x: p.x + 30, y: p.y - 30, xp: 7, age: 0 }, { x: p.x + 31, y: p.y - 30, xp: 7, age: 0 });
  st.gems.push({ x: p.x - 30, y: p.y - 30, xp: 1, age: 0 }, { x: p.x - 29, y: p.y - 30, xp: 1, age: 0 });
  const d = draw();
  assert.ok(d.gemCrowd);
  const hx = Math.round(p.x - st.cam.x), hy = Math.round(p.y - st.cam.y);
  const at = (dx) => d.gems.filter(g => Math.abs(g.x + 3 - (hx + dx)) <= 2 && Math.abs(g.y + 4 - (hy - 30)) <= 1).length;
  assert.equal(at(30), 2, 'both mid gems drawn');
  assert.equal(at(-30), 2, 'the small pair draws as two');
});

s.check('only gems on screen count toward the crowd', () => {
  clearField();
  draw();
  st.time = 600;
  const p = st.player;
  // 35 on screen, far from the hero and apart; 60 far off screen.
  for (let i = 0; i < 35; i++) st.gems.push({ x: p.x - 170 + (i % 12) * 30, y: p.y - 110 + Math.floor(i / 12) * 100, xp: 1, age: 0 });
  for (let i = 0; i < 60; i++) st.gems.push({ x: p.x + 3000 + i * 20, y: p.y, xp: 1, age: 0 });
  const d = draw();
  assert.ok(!d.gemCrowd, 'not a crowd: ' + d.gems.length + ' drawn');
  assert.ok(d.gems.every(g => g.a === 1), 'nothing fades');
});

// Same seed, recede always on vs never on: the same XP, level, kills and gems.
async function playSeeded(crowd, variant) {
  seedRandom(424242);
  GEM_RECEDE.CROWD = crowd;
  const b = await boot({ storage: [['hordes_onboarded', '1']], variant });
  b.T.banners.suppressAll();
  b.T.state.mode = 'menu'; b.T.startRun();
  // A field of small gems in touching pairs round the hero, some inside the
  // magnet, most outside it: the hero walks into them as the run goes on.
  const S0 = b.T.state, P0 = S0.player;
  for (let i = 0; i < 160; i++) {
    const a = i * 0.7, d = 30 + (i % 40) * 4;
    const x = Math.round(P0.x + Math.cos(a) * d), y = Math.round(P0.y + Math.sin(a) * d * 0.7);
    S0.gems.push({ x, y, xp: 1, age: 0 }, { x: x + 2, y: y + 1, xp: 1, age: 0 });
  }
  let merged = 0;
  for (let i = 0; i < 1500; i++) {
    b.T.renderer.readStats = {};
    b.pump(1);
    const rs = b.T.renderer.readStats;
    merged += rs && rs.gems ? rs.gems.filter(g => g.a < 1).length : 0;   // faded draws
    const s2 = b.T.state;
    if (s2.player) s2.player.hp = s2.player.stats.maxHp;
  }
  const S = b.T.state, P = S.player;
  return { xp: P.xp, level: P.level, kills: P.kills, gems: S.gems.length, time: S.time, merged };
}
const keep = GEM_RECEDE.CROWD, keepOff = GEM_RECEDE.CROWD_OFF;
GEM_RECEDE.CROWD_OFF = 0;
const A = await playSeeded(0, 'r3-gems-on');
const B = await playSeeded(1e9, 'r3-gems-off');
GEM_RECEDE.CROWD = keep; GEM_RECEDE.CROWD_OFF = keepOff;
s.check('the gem fade is draw-only: same XP, level, kills and gems under one seed', () => {
  assert.ok(A.merged > 0, 'the fade really ran in the recede arm (' + A.merged + ' faded draws)');
  assert.equal(B.merged, 0);
  assert.ok(A.kills > 0, 'the run fought');
  assert.ok(A.xp > 0 || A.level > 1, 'gems were picked up');
  assert.ok(A.gems < 320, 'some of the planted gems were collected (' + A.gems + ' left)');
  const strip = (o) => ({ xp: o.xp, level: o.level, kills: o.kills, gems: o.gems, time: o.time });
  assert.deepEqual(strip(A), strip(B));
});

s.done();
