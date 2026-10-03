// HORDES - every actor reads against every floor.
// The body colour of each actor (the most used palette entry of frame 0: the
// pilots, the common enemies, the named bosses, the maw) must hold 3:1 WCAG
// contrast against each stage's floor tones (base and both underlay patches)
// under all six wave lights. Common enemies are baked a step muted
// (sprite_cache.js), so their drawn colour is held to a floor as well.
// Same arithmetic as the report: node tools/m2_contrast.mjs --stages / --actors
// Run: node test/test_actor_contrast.mjs
import assert from 'node:assert/strict';
import { actorBodyColours, stageContrast, muted } from '../tools/m2_contrast.mjs';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { CHARACTER_SPRITES } from '../src/character_sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

const colours = actorBodyColours();

check('the roster is complete: 4 pilots, every enemy type, every named boss, the maw', () => {
  for (const id of Object.keys(CHARACTER_SPRITES)) assert.ok(colours['PILOT_' + id], 'pilot ' + id);
  for (const id of Object.keys(ENEMY_SPRITES)) assert.ok(colours[id], 'enemy ' + id);
  for (const id of Object.keys(BOSS_SPRITES)) assert.ok(colours['BOSS_' + id], 'boss ' + id);
  assert.ok(colours.THE_MAW && colours.BOSS_DEFAULT);
});

check('every actor body colour is at least 3:1 on every stage floor, under every wave light', () => {
  const low = [];
  for (const [stage, per] of Object.entries(stageContrast(colours))) {
    for (const [id, r] of Object.entries(per)) if (r < 3) low.push(id + ' ' + colours[id] + ' on ' + stage + ' ' + r.toFixed(2));
  }
  assert.deepEqual(low, [], 'under 3:1: ' + low.join('; '));
});

check('the muted horde colour of every common enemy still holds 2.75:1', () => {
  const drawn = {};
  for (const id of Object.keys(ENEMY_SPRITES)) drawn[id] = muted(colours[id]);
  const low = [];
  for (const [stage, per] of Object.entries(stageContrast(drawn))) {
    for (const [id, r] of Object.entries(per)) if (r < 2.75) low.push(id + ' ' + drawn[id] + ' on ' + stage + ' ' + r.toFixed(2));
  }
  assert.deepEqual(low, [], 'under 2.75:1 as drawn: ' + low.join('; '));
});

console.log('test_actor_contrast: ' + passed + ' checks passed');
