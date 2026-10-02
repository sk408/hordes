// HORDES — headless tests for src/character_sprites.js + the render.js player seam
// (PORT SLICE C: original art for the EXISTING four pilots).
// Run: node test/test_character_sprites.mjs
//
// WHAT THIS PINS:
//   1. FORMAT — every pilot sprite is integer grid data (0 = transparent, keys
//      1-9), rectangular, palette-complete, small (12x12 box, <= 6 keys),
//      frames share one box, the animated pair actually differs.
//   2. COPY — ids/names/blurbs are plain ASCII words (no emoji in game copy).
//   3. ROSTER COVERAGE — every src/meta.js CHARACTERS id resolves to hand art
//      via characterSpriteFor; unknown / unset ids return null (a NAMED
//      failure, never a crash). The generic PLAYER_SPRITE pair stays as the
//      fallback (never a pilot's look).
//   4. DETERMINISM — characterSpriteFrame is a pure function of sim age (never
//      the clock): age 0 reads frame 0 (the idle), and the pace matches the
//      render.js player branch (6/s, stationary -> frame 0).
//   5. RENDER SEAM — render.js resolves the equipped pilot through
//      characterSpriteFor (no longer the generic sprite for a roster member),
//      every pilot sprite paints COMPOSED (>= 4 rects) through drawGrid, and
//      repaints are byte-identical per frame.
//   6. VISUAL-ONLY — the module carries no gameplay numbers (no hp/dmg/cost
//      fields anywhere on a sprite) and the character tables are untouched
//      (prices / stat mods / starting kits / skills read their documented
//      values — this slice changes NO number).
//   7. PRESENTATION CHAIN — the menu busts keep CHARACTER_PORTRAITS
//      (portraits.js), intro.js / portal_cine.js keep their adapted generic
//      copies: slice (c) documents them, it does not redraw them.
import {
  CHARACTER_SPRITES, CHARACTER_SPRITE_IDS,
  characterSpriteFor, characterSpriteFrame,
} from '../src/character_sprites.js';
import { CHARACTERS } from '../src/meta.js';
import { CHARACTER_PORTRAITS } from '../src/art/portraits.js';
import { PLAYER_SPRITE, PLAYER_SPRITE_WALK, Renderer } from '../src/render.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ASCII = /^[\x20-\x7E]*$/;
const ROSTER = ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN'];

console.log('FORMAT (integer grids, palette-keyed):');
{
  ok(ROSTER.every(id => !!CHARACTER_SPRITES[id]), 'slice (c) ships all four pilots (' + Object.keys(CHARACTER_SPRITES).join(',') + ')');
  ok(CHARACTER_SPRITE_IDS.length === 4, 'the sprite map holds exactly the four pilots');
  for (const id of ROSTER) {
    const p = CHARACTER_SPRITES[id];
    const label = 'sprite/' + id;
    ok(p.id === id, label + ': id is stable');
    ok(p.frames.length === 2, label + ': exactly 2 frames (idle + walk-step)');
    const boxes = p.frames.map(f => ({ w: f[0].length, h: f.length }));
    ok(boxes.every(b => b.w === boxes[0].w && b.h === boxes[0].h),
      label + ': every frame is the same box (' + boxes[0].w + 'x' + boxes[0].h + ')');
    ok(boxes[0].w === 12 && boxes[0].h === 12,
      label + ': keeps the PLAYER_SPRITE box (12x12, geometry untouched)');
    ok(p.w === 12 && p.h === 12, label + ': declared w/h match the pixels');
    ok(p.box.w === 12 && p.box.h === 12, label + ': declared box matches the pixels');
    ok(p.anchor.x === 6 && p.anchor.y === 6,
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
    ok(sigs.size === 2, label + ': the 2 frames differ (real walk-step cycle)');
    // Only the leg rows move between frames (the PLAYER_SPRITE_WALK convention).
    const sameHead = p.frames[0].slice(0, 10).flat().join(',') === p.frames[1].slice(0, 10).flat().join(',');
    ok(sameHead, label + ': rows 0-9 are identical across frames (only the legs step)');
  }
  // The four looks are actually distinct pilots, not one grid re-tinted.
  const sigs = new Set(ROSTER.map(id => CHARACTER_SPRITES[id].frames[0].flat().join(',')));
  ok(sigs.size === 4, 'all four idle frames differ (distinct silhouettes, not re-tints)');
}

console.log('COPY (plain words, no emoji):');
{
  for (const id of ROSTER) {
    const p = CHARACTER_SPRITES[id];
    ok(ASCII.test(id) && ASCII.test(p.name) && ASCII.test(p.blurb),
      'sprite/' + id + ': id/name/blurb are plain ASCII');
    ok(p.name.length > 0 && p.blurb.length > 0, 'sprite/' + id + ': carries a name and a blurb');
  }
}

console.log('VISUAL-ONLY (no gameplay numbers):');
{
  const BANNED = ['hp', 'dmg', 'damage', 'cost', 'price', 'value', 'rarity', 'heal', 'xp', 'speed', 'mult', 'mana'];
  for (const id of ROSTER) {
    const fields = Object.keys(CHARACTER_SPRITES[id]);
    const leak = fields.filter(f => BANNED.includes(f.toLowerCase()));
    ok(leak.length === 0, 'sprite/' + id + ': carries no gameplay fields (' + fields.join(',') + ')');
  }
  // The character tables this slice must not touch still read their values.
  ok(CHARACTERS.KNIGHT.unlockCost === 0 && CHARACTERS.WITCH.unlockCost === 9000 &&
     CHARACTERS.ROGUE.unlockCost === 2500 && CHARACTERS.PALADIN.unlockCost === 6000,
    'character prices untouched (0 / 9000 / 2500 / 6000)');
  ok(CHARACTERS.KNIGHT.mods.maxHp > CHARACTERS.PALADIN.mods.maxHp && CHARACTERS.PALADIN.mods.maxHp > 0 &&
     CHARACTERS.WITCH.mods.maxHp < 0 && CHARACTERS.ROGUE.mods.speedMult > 1,
    'character stat roles hold (KNIGHT sturdiest ' + CHARACTERS.KNIGHT.mods.maxHp + ', PALADIN +' +
    CHARACTERS.PALADIN.mods.maxHp + ', WITCH frail ' + CHARACTERS.WITCH.mods.maxHp + ', ROGUE x' +
    CHARACTERS.ROGUE.mods.speedMult + ' speed)');
  ok(CHARACTERS.KNIGHT.startingWeapon === null && CHARACTERS.WITCH.startingWeapon === 'ZAP' &&
     CHARACTERS.ROGUE.startingWeapon === 'BOOMERANG' && CHARACTERS.PALADIN.startingWeapon === 'ORBIT',
    'starting kits untouched (VOLLEY / ZAP / BOOMERANG / ORBIT)');
  ok(CHARACTERS.KNIGHT.skill === 'EARTHSHATTER' && CHARACTERS.WITCH.skill === 'CHAIN_REACTION' &&
     CHARACTERS.ROGUE.skill === 'AFTERIMAGE' && CHARACTERS.PALADIN.skill === 'CONSECRATION',
    'Q skills untouched (EARTHSHATTER / CHAIN_REACTION / AFTERIMAGE / CONSECRATION)');
}

console.log('ROSTER COVERAGE:');
{
  ok(Object.keys(CHARACTERS).length === 4, 'the roster is the four known pilots (' + Object.keys(CHARACTERS).join(',') + ')');
  for (const id of ROSTER) {
    let s = null;
    try { s = characterSpriteFor(id); } catch (e) { s = null; }
    ok(!!s && !!s.frames && !!s.palette, 'pilot ' + id + ' resolves to hand art (' + (s ? s.frames.length + ' frames' : 'MISSING') + ')');
  }
  ok(characterSpriteFor('KNIGHT') === CHARACTER_SPRITES.KNIGHT, 'KNIGHT resolves to the steel-helm art');
  ok(characterSpriteFor('WITCH') === CHARACTER_SPRITES.WITCH, 'WITCH resolves to the violet-robe art');
  ok(characterSpriteFor('ROGUE') === CHARACTER_SPRITES.ROGUE, 'ROGUE resolves to the green-hood art');
  ok(characterSpriteFor('PALADIN') === CHARACTER_SPRITES.PALADIN, 'PALADIN resolves to the gold-plate art');
  // Unknown / unset ids: named null, never a throw (the renderer falls back).
  let threw = false, miss = 'unset';
  try { miss = characterSpriteFor('NOT_A_PILOT'); } catch (e) { threw = true; }
  ok(!threw && miss === null, 'unknown pilot id returns null (named miss, not a crash)');
  try { miss = characterSpriteFor(undefined); } catch (e) { threw = true; }
  ok(!threw && miss === null, 'unset pilot id returns null (named miss, not a crash)');
  // The generic pair survives as the fallback (never any pilot's look).
  ok(PLAYER_SPRITE.length === 12 && PLAYER_SPRITE_WALK.length === 12,
    'the generic PLAYER_SPRITE pair survives (12 rows each, the fallback)');
}

console.log('FRAME DETERMINISM (sim-phase, never the clock):');
{
  const witch = characterSpriteFor('WITCH');
  ok(characterSpriteFrame(witch, 0.5) === characterSpriteFrame(witch, 0.5), 'characterSpriteFrame is stable per age');
  ok(characterSpriteFrame(witch, 0) === 0, 'age 0 reads frame 0 (the idle)');
  ok(characterSpriteFrame(witch, 1 / 6) === 1, 'age 1/6 advances one frame at the 6/s pace');
  ok(characterSpriteFrame(witch, 2 / 6) === 0, 'the 2-frame cycle wraps (age 2/6 reads frame 0)');
  // Matches the render.js player rule exactly across a sweep of ages.
  let drift = 0;
  for (let k = 0; k < 40; k++) {
    const age = k * 0.137;
    const want = Math.floor(age * 6) % witch.frames.length;
    if (characterSpriteFrame(witch, age) !== want) drift++;
  }
  ok(drift === 0, 'characterSpriteFrame matches the render.js 6/s pace at 40 sample ages');
  ok(characterSpriteFrame(null, 1) === 0, 'missing sprite reads frame 0 (never throws)');
  // Two pilots at different ages can read different frames (per-entity phase).
  ok(characterSpriteFrame(witch, 0.0) !== characterSpriteFrame(witch, 1 / 6), 'phase varies per age (not a still)');
}

console.log('RENDER SEAM (every pilot sprite paints COMPOSED + deterministic):');
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
  const paintSprite = (R, ctx, id, frameIdx) => {
    const spr = characterSpriteFor(id);
    R.drawGrid(ctx, spr.frames[frameIdx], spr.palette, 100, 100);
  };
  for (const id of ROSTER) {
    for (const f of [0, 1]) {
      const { R, ctx, rec } = mk();
      paintSprite(R, ctx, id, f);
      const n = rec.rects.length;
      const spr = characterSpriteFor(id);
      let expect = 0;
      for (const row of spr.frames[f]) for (const v of row) if (v) expect++;
      ok(n === expect && n >= 4, 'pilot ' + id + ' frame ' + f + ' paints COMPOSED through drawGrid (' + n + ' rects)');
    }
  }
  // Repaints are byte-identical per frame (deterministic, no clock read).
  {
    const snap = (id, f) => {
      const { R, ctx, rec } = mk();
      paintSprite(R, ctx, id, f);
      return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h + ',' + q.style).join('|');
    };
    ok(snap('ROGUE', 0) === snap('ROGUE', 0), 'ROGUE repaints byte-identically per frame');
    ok(snap('PALADIN', 0) === snap('PALADIN', 0), 'PALADIN repaints byte-identically per frame');
    ok(snap('KNIGHT', 0) !== snap('KNIGHT', 1), 'KNIGHT frames differ across the step (animated, not a still)');
  }
  // render.js actually consults characterSpriteFor (the generic pair is no
  // longer any roster member's look): read the wired source lines.
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  ok(src.includes('characterSpriteFor(state.character'), 'render.js resolves pilot art through characterSpriteFor');
  ok(src.includes('PLAYER_SPRITE_WALK : PLAYER_SPRITE') || src.includes('PLAYER_SPRITE_WALK: PLAYER_SPRITE') ||
     src.includes('(walkFrame ? PLAYER_SPRITE_WALK : PLAYER_SPRITE)'),
    'render.js keeps the generic PLAYER_SPRITE pair as the fallback');
}

console.log('PRESENTATION CHAIN (busts + generic copies, documented not redrawn):');
{
  for (const id of ROSTER) {
    ok(!!CHARACTER_PORTRAITS[id] && CHARACTER_PORTRAITS[id].frames.length === 2,
      'pilot ' + id + ' keeps its authored 32x32 menu bust (2 idle frames)');
  }
  const fs = await import('node:fs');
  const intro = fs.readFileSync(new URL('../src/intro.js', import.meta.url), 'utf8');
  const cine = fs.readFileSync(new URL('../src/portal_cine.js', import.meta.url), 'utf8');
  ok(intro.includes('PLAYER_SPRITE'), 'intro.js keeps its adapted generic copy (unchanged)');
  ok(cine.includes('PLAYER_SPRITE'), 'portal_cine.js keeps its adapted generic copy (unchanged)');
}

console.log('');
if (failed) { console.error('test_character_sprites: ' + failed + ' FAILED check(s)'); process.exitCode = 1; }
else { console.log('test_character_sprites: all checks passed'); }
