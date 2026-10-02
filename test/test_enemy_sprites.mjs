// HORDES — headless tests for src/enemy_sprites.js + the render.js enemy seam
// (PORT SLICE B: original art for the EXISTING enemy roster).
// Run: node test/test_enemy_sprites.mjs
//
// WHAT THIS PINS:
//   1. FORMAT — every new sprite is integer grid data (0 = transparent, keys
//      1-9), rectangular, palette-complete, small (<= 32px box, <= 6 keys),
//      frames share one box, the animated pair actually differs.
//   2. COPY — ids/names/blurbs are plain ASCII words (no emoji in game copy).
//   3. ROSTER COVERAGE — every src/enemy_types.js id resolves to hand art via
//      enemySpriteFor; unknown ids return null (a NAMED failure, never a
//      crash). The eight legacy sprites.js entries are reused by identity
//      (no drift between the old map and the roster map).
//   4. DETERMINISM — enemySpriteFrame is a pure function of entity age (never
//      the clock) and matches the render.js paint rule floor(age*6) % frames.
//   5. RENDER SEAM — render.js resolves PILLAR + SHRIKE through
//      enemySpriteFor (no longer the typed-shape fallback), every roster
//      sprite paints COMPOSED (>= 4 rects) through drawGrid, and repaints are
//      byte-identical per age.
//   6. VISUAL-ONLY — the module carries no gameplay numbers (no hp/dmg/cost
//      fields anywhere on a sprite) and the enemy stat tables are untouched
//      (spot-check two mults against their documented values).
//   7. PRESENTATION CHAIN — elites keep the gold-outline tell (ELITE_LOOK),
//      named bosses keep BOSS_SPRITES, the finale keeps FINAL_BOSS_SPRITE:
//      slice (b) documents them, it does not redraw them.
import {
  NEW_ENEMY_SPRITES, ENEMY_SPRITES, ENEMY_SPRITE_IDS,
  enemySpriteFor, enemySpriteFrame,
} from '../src/enemy_sprites.js';
import { SPRITES } from '../src/sprites.js';
import { ENEMY_TYPES, ELITE_LOOK } from '../src/enemy_types.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import { Renderer } from '../src/render.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ASCII = /^[\x20-\x7E]*$/;
const NEW_IDS = ['PILLAR', 'SHRIKE'];
const ROSTER = Object.keys(ENEMY_TYPES);

console.log('FORMAT (integer grids, palette-keyed):');
{
  ok(NEW_IDS.every(id => !!NEW_ENEMY_SPRITES[id]), 'slice (b) ships PILLAR + SHRIKE (' + Object.keys(NEW_ENEMY_SPRITES).join(',') + ')');
  for (const id of NEW_IDS) {
    const p = NEW_ENEMY_SPRITES[id];
    const label = 'sprite/' + id;
    ok(p.id === id, label + ': id is stable');
    ok(p.frames.length === 2, label + ': exactly 2 walk frames');
    const boxes = p.frames.map(f => ({ w: f[0].length, h: f.length }));
    ok(boxes.every(b => b.w === boxes[0].w && b.h === boxes[0].h),
      label + ': every frame is the same box (' + boxes[0].w + 'x' + boxes[0].h + ')');
    ok(boxes[0].w <= 32 && boxes[0].h <= 32,
      label + ': fits inside one 32px cell (' + boxes[0].w + 'x' + boxes[0].h + ')');
    ok(p.w === boxes[0].w && p.h === boxes[0].h, label + ': declared w/h match the pixels');
    ok(p.box.w === boxes[0].w && p.box.h === boxes[0].h, label + ': declared box matches the pixels');
    ok(p.anchor.x === Math.floor(p.w / 2) && p.anchor.y === Math.floor(p.h / 2),
      label + ': anchor is the box center');
    let ragged = 0, badCell = 0, nonZero = 0;
    const used = new Set();
    for (const fr of p.frames) {
      for (const row of fr) {
        if (row.length !== boxes[0].w) ragged++;
        for (const v of row) {
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9) badCell++;
          else if (v) { nonZero++; used.add(v); }
        }
      }
    }
    ok(ragged === 0, label + ': all rows are the same width');
    ok(badCell === 0, label + ': every cell is an integer palette index 0-9');
    ok(nonZero > 0, label + ': the grid actually has pixels (' + nonZero + ')');
    const keys = Object.keys(p.palette);
    ok(keys.length > 0 && keys.length <= 6, label + ': palette is small (' + keys.length + ' keys)');
    ok(keys.every(k => /^[1-9]$/.test(k)), label + ': palette keys are 1-9 (0 is transparent)');
    ok(keys.every(k => HEX.test(String(p.palette[k]))), label + ': every palette value is #rgb/#rrggbb');
    ok([...used].every(v => p.palette[v]), label + ': every referenced index is defined');
    const sigs = new Set(p.frames.map(f => f.flat().join(',')));
    ok(sigs.size === 2, label + ': the 2 frames differ (real walk/throb cycle)');
  }
  ok(NEW_ENEMY_SPRITES.PILLAR.w === 12 && NEW_ENEMY_SPRITES.PILLAR.h === 16, 'PILLAR is the tall turret box (12x16)');
  ok(NEW_ENEMY_SPRITES.SHRIKE.w === 14 && NEW_ENEMY_SPRITES.SHRIKE.h === 10, 'SHRIKE is the wide diver box (14x10)');
}

console.log('COPY (plain words, no emoji):');
{
  for (const id of NEW_IDS) {
    const p = NEW_ENEMY_SPRITES[id];
    ok(ASCII.test(id) && ASCII.test(p.name) && ASCII.test(p.blurb),
      'sprite/' + id + ': id/name/blurb are plain ASCII');
    ok(p.name.length > 0 && p.blurb.length > 0, 'sprite/' + id + ': carries a name and a blurb');
  }
}

console.log('VISUAL-ONLY (no gameplay numbers):');
{
  const BANNED = ['hp', 'dmg', 'damage', 'cost', 'price', 'value', 'rarity', 'heal', 'xp', 'speed', 'mult'];
  for (const id of NEW_IDS) {
    const fields = Object.keys(NEW_ENEMY_SPRITES[id]);
    const leak = fields.filter(f => BANNED.includes(f.toLowerCase()));
    ok(leak.length === 0, 'sprite/' + id + ': carries no gameplay fields (' + fields.join(',') + ')');
  }
  // The stat table still carries the roles the sprites are drawn for.
  ok(ENEMY_TYPES.BRUTE.hpMult > ENEMY_TYPES.CHASER.hpMult &&
     ENEMY_TYPES.BRUTE.contactDamageMult > ENEMY_TYPES.CHASER.contactDamageMult,
    'BRUTE is still the tanky heavy hitter (hpMult ' + ENEMY_TYPES.BRUTE.hpMult +
    ', contact ' + ENEMY_TYPES.BRUTE.contactDamageMult + ')');
  ok(ENEMY_TYPES.PILLAR.speedMult === 0 && ENEMY_TYPES.SHRIKE.flying === true,
    'PILLAR still stationary (speedMult 0), SHRIKE still the flyer');
}

console.log('ROSTER COVERAGE:');
{
  ok(ROSTER.length === 10, 'the roster is the ten known types (' + ROSTER.join(',') + ')');
  for (const id of ROSTER) {
    let s = null;
    try { s = enemySpriteFor(id); } catch (e) { s = null; }
    ok(!!s && !!s.frames && !!s.palette, 'type ' + id + ' resolves to hand art (' + (s && s.frames ? s.frames[0][0].length + 'x' + s.frames.length + ' frames' : 'MISSING') + ')');
  }
  ok(enemySpriteFor('PILLAR') === NEW_ENEMY_SPRITES.PILLAR, 'PILLAR resolves to the new turret art');
  ok(enemySpriteFor('SHRIKE') === NEW_ENEMY_SPRITES.SHRIKE, 'SHRIKE resolves to the new diver art');
  // Legacy eight are reused by identity — the roster map cannot drift.
  for (const id of Object.keys(SPRITES)) {
    ok(enemySpriteFor(id) === SPRITES[id], 'legacy sprite ' + id + ' is reused by identity (no drift)');
  }
  ok(ENEMY_SPRITE_IDS.length >= 10, 'the roster map holds every type (' + ENEMY_SPRITE_IDS.length + ' entries)');
  // Unknown ids: named null, never a throw.
  let threw = false, miss = 'unset';
  try { miss = enemySpriteFor('NOT_A_TYPE'); } catch (e) { threw = true; }
  ok(!threw && miss === null, 'unknown type id returns null (named miss, not a crash)');
  try { miss = enemySpriteFor(undefined); } catch (e) { threw = true; }
  ok(!threw && miss === null, 'unset type id returns null (named miss, not a crash)');
}

console.log('FRAME DETERMINISM (age-phase, never the clock):');
{
  const shrike = enemySpriteFor('SHRIKE');
  ok(enemySpriteFrame(shrike, 1.0) === enemySpriteFrame(shrike, 1.0), 'enemySpriteFrame is stable per age');
  ok(enemySpriteFrame(shrike, 0) === 0, 'age 0 reads frame 0');
  ok(enemySpriteFrame(shrike, 1 / 6) === 1, 'age 1/6 advances one frame at the 6/s pace');
  ok(enemySpriteFrame(shrike, 2 / 6) === 0, 'the 2-frame cycle wraps (age 2/6 reads frame 0)');
  // Matches the render.js paint rule exactly across a sweep of ages.
  let drift = 0;
  for (let k = 0; k < 40; k++) {
    const age = k * 0.137;
    const want = Math.floor(age * 6) % shrike.frames.length;
    if (enemySpriteFrame(shrike, age) !== want) drift++;
  }
  ok(drift === 0, 'enemySpriteFrame matches render.js floor(age*6)%frames at 40 sample ages');
  ok(enemySpriteFrame(null, 1) === 0, 'missing sprite reads frame 0 (never throws)');
  // Two SHRIKEs at different ages can read different frames (per-entity phase).
  ok(enemySpriteFrame(shrike, 0.0) !== enemySpriteFrame(shrike, 1 / 6), 'phase varies per entity age (not a still)');
}

console.log('RENDER SEAM (every roster sprite paints COMPOSED + deterministic):');
{
  const mk = () => {
    const rec = { rects: [] };
    const ctx = {
      canvas: null, fillStyle: '#000', globalAlpha: 1, font: '10px monospace',
      textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
      setTransform() {}, translate() {}, save() {}, restore() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
      fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h, style: String(this.fillStyle) }); },
      fillText() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    ctx.canvas = canvas;
    return { R: new Renderer(canvas), rec, ctx };
  };
  const paintSprite = (R, ctx, typeId, age) => {
    const spr = enemySpriteFor(typeId);
    const frame = spr.frames[enemySpriteFrame(spr, age)];
    R.drawGrid(ctx, frame, spr.palette, 100, 100);
  };
  for (const id of ROSTER) {
    const { R, ctx, rec } = mk();
    paintSprite(R, ctx, id, 0.35);
    const n = rec.rects.length;
    // Pixel count of the painted frame (one fillRect per pixel).
    const spr = enemySpriteFor(id);
    let expect = 0;
    for (const row of spr.frames[enemySpriteFrame(spr, 0.35)]) for (const v of row) if (v) expect++;
    ok(n === expect && n >= 4, 'type ' + id + ' paints COMPOSED through drawGrid (' + n + ' rects)');
  }
  // Repaints are byte-identical per age (deterministic, no clock read).
  {
    const snap = (typeId, age) => {
      const { R, ctx, rec } = mk();
      paintSprite(R, ctx, typeId, age);
      return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h + ',' + q.style).join('|');
    };
    ok(snap('PILLAR', 0.5) === snap('PILLAR', 0.5), 'PILLAR repaints byte-identically per age');
    ok(snap('SHRIKE', 0.5) === snap('SHRIKE', 0.5), 'SHRIKE repaints byte-identically per age');
    ok(snap('PILLAR', 0.0) !== snap('PILLAR', 1 / 6), 'PILLAR frames differ across the age phase (animated, not a still)');
  }
  // render.js actually consults enemySpriteFor (the fallback is no longer any
  // roster member's look): read the wired source line.
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  ok(src.includes('enemySpriteFor(e.typeId)'), 'render.js resolves enemy art through enemySpriteFor');
}

console.log('PRESENTATION CHAIN (elites + bosses, documented not redrawn):');
{
  ok(ELITE_LOOK.trim === '#ffd54a', 'elite gold-trim tell is stable (' + ELITE_LOOK.trim + ')');
  const bossIds = Object.keys(BOSS_SPRITES);
  ok(bossIds.includes('GRAVELMAW') && bossIds.includes('CHOIR_MOTHER') &&
     bossIds.includes('PYRAXIS') && bossIds.includes('HERALD'),
    'the named-boss cast keeps its four sprites (' + bossIds.join(',') + ')');
  ok(!!FINAL_BOSS_SPRITE && FINAL_BOSS_SPRITE.frames.length === 2,
    'the finale maw keeps its 2-frame sprite');
}

console.log('');
if (failed) { console.error('test_enemy_sprites: ' + failed + ' FAILED check(s)'); process.exitCode = 1; }
else { console.log('test_enemy_sprites: all checks passed'); }
