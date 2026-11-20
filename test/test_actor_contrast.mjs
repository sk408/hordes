// HORDES - every actor reads against every floor.
// The body colour of each actor (the most used palette entry of frame 0: the
// pilots, the common enemies, the named bosses, the maw) must hold 3:1 WCAG
// contrast against each stage's floor tones (base and both underlay patches)
// under all six wave lights, on every DARK floor (R6: on a light floor, Ashen
// Waste, Bone Desert and the snow, the actors read by their dark outline and
// test/test_stage_keys.mjs holds that). Common enemies are baked a step muted
// (sprite_cache.js), so their drawn colour is held to a floor as well.
// Same arithmetic as the report: node tools/m2_contrast.mjs --stages / --actors
// The bosses and the Maw (bossdark, a ruling of the coordinator): their bodies
// are dark and heavy on purpose, so an EDGE carries them instead of the body:
// a bright rim of their own hue, at least 3:1 against every floor tone of
// every stage under every wave lean and under the light layer's darkness at
// every wave light (on a light floor the dark keyline outside the rim may
// carry it), and danger-red eyes at least 4.5:1 against the pixels round them.
// They are the heaviest things on screen: darker and larger than any of the
// horde. Same arithmetic as node tools/boss_contrast.mjs.
// Run: node test/test_actor_contrast.mjs
import assert from 'node:assert/strict';
import { actorBodyColours, stageContrast, muted } from '../tools/m2_contrast.mjs';
import { BOSS_LOOKS, edgeOn, eyesOf } from '../tools/boss_contrast.mjs';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { CHARACTER_SPRITES } from '../src/character_sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { STAGE_GROUND_PALETTES, groundIsLight } from '../src/world_ground.js';
import { lab } from '../src/palette.js';
import { actorRing } from '../src/render.js';
import { bossLook, killerLook, MAW_NAME } from '../src/movie_cast.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

const colours = actorBodyColours();

check('the roster is complete: 4 pilots, every enemy type, every named boss, the maw', () => {
  for (const id of Object.keys(CHARACTER_SPRITES)) assert.ok(colours['PILOT_' + id], 'pilot ' + id);
  for (const id of Object.keys(ENEMY_SPRITES)) assert.ok(colours[id], 'enemy ' + id);
  for (const id of Object.keys(BOSS_SPRITES)) assert.ok(colours['BOSS_' + id], 'boss ' + id);
  assert.ok(colours.THE_MAW && colours.BOSS_DEFAULT);
});

const isBoss = (id) => id === 'THE_MAW' || id.startsWith('BOSS_');
check('every pilot and horde body colour is at least 3:1 on every dark stage floor, under every wave light', () => {
  const low = [];
  for (const [stage, per] of Object.entries(stageContrast(colours))) {
    if (groundIsLight(stage)) continue;
    for (const [id, r] of Object.entries(per)) if (!isBoss(id) && r < 3) low.push(id + ' ' + colours[id] + ' on ' + stage + ' ' + r.toFixed(2));
  }
  assert.deepEqual(low, [], 'under 3:1: ' + low.join('; '));
});

check('every boss and the Maw wear a rim that carries them 3:1 on all eight floors, every wave lean and every light, deep night too', () => {
  const low = [];
  for (const [id, s] of Object.entries(BOSS_LOOKS())) {
    if (!s.rim) { low.push(id + ' has no rim'); continue; }
    for (const st of Object.keys(STAGE_GROUND_PALETTES)) {
      const e = edgeOn(s, st);
      if (e.r < 3) low.push(id + ' on ' + st + ' ' + e.r.toFixed(2) + ' (' + e.at + ')');
    }
  }
  assert.deepEqual(low, [], 'edge under 3:1: ' + low.join('; '));
});

check('every boss and the Maw have danger-red eyes at least 4.5:1 against the pixels round them, in every frame', () => {
  const low = [];
  for (const [id, s] of Object.entries(BOSS_LOOKS())) {
    const e = eyesOf(s);
    if (!e.n) low.push(id + ' has no eyes');
    else if (e.r < 4.5) low.push(id + ' ' + e.r.toFixed(2));
  }
  assert.deepEqual(low, [], 'eyes: ' + low.join('; '));
});

// Mass: the mean L* of a sprite's pixels (frame 0), the horde as it is drawn (muted).
const cellsOf = (fr) => fr.map(r => (Array.isArray(r) ? r.map(Number) : String(r).split('').map(c => (c === '.' ? 0 : Number(c))))).flat().filter(Boolean);
const massOf = (s, mute) => { const px = cellsOf(s.frames[0]); return { n: px.length, L: px.reduce((a, k) => a + lab(mute ? muted(s.palette[k]) : s.palette[k])[0], 0) / px.length }; };
check('the bosses and the Maw are the heaviest things on screen: darker and larger than every horde enemy', () => {
  const horde = Object.entries(ENEMY_SPRITES).map(([id, s]) => [id, massOf(s, true)]);
  const darkest = Math.min(...horde.map(([, m]) => m.L)), biggest = Math.max(...horde.map(([, m]) => m.n));
  const bad = [];
  for (const [id, s] of Object.entries(BOSS_LOOKS())) {
    const m = massOf(s, false);
    if (!(m.L < darkest)) bad.push(id + ' L* ' + m.L.toFixed(1) + ' not under the darkest horde ' + darkest.toFixed(1));
    if (!(m.n > biggest)) bad.push(id + ' ' + m.n + ' px not over the biggest horde ' + biggest);
  }
  assert.deepEqual(bad, [], bad.join('; '));
});

check('the muted horde colour of every common enemy still holds 2.75:1 on every dark floor', () => {
  const drawn = {};
  for (const id of Object.keys(ENEMY_SPRITES)) drawn[id] = muted(colours[id]);
  const low = [];
  for (const [stage, per] of Object.entries(stageContrast(drawn))) {
    if (groundIsLight(stage)) continue;
    for (const [id, r] of Object.entries(per)) if (r < 2.75) low.push(id + ' ' + drawn[id] + ' on ' + stage + ' ' + r.toFixed(2));
  }
  assert.deepEqual(low, [], 'under 2.75:1 as drawn: ' + low.join('; '));
});

check('every look that draws a boss away from the fight carries its rim: the name card, the portal movie, the death movie', () => {
  for (const id of Object.keys(BOSS_SPRITES)) {
    assert.equal(bossLook(id).rim, BOSS_SPRITES[id].rim, 'bossLook ' + id);
    assert.equal(killerLook({ bossId: id }).rim, BOSS_SPRITES[id].rim, 'killerLook ' + id);
  }
  assert.equal(killerLook({ name: MAW_NAME }).rim, FINAL_BOSS_SPRITE.rim, 'killerLook the Maw');
});

check('in the fight a boss wears its rim (not the elite gold of its chassis); a wind-up still rings it in danger', () => {
  for (const [id, s] of Object.entries(BOSS_LOOKS())) {
    const e = { boss: true, elite: true };
    assert.equal(actorRing(e, s, false, false, null, 0), s.rim, id);
    assert.equal(actorRing(e, s, true, false, null, 0), '#ff4a14', id + ' winding up');
  }
  assert.equal(actorRing({ elite: true }, ENEMY_SPRITES.PILLAR, false, false, null, 0), '#f0c860', 'an elite of the horde stays gold');
});

console.log('test_actor_contrast: ' + passed + ' checks passed');
