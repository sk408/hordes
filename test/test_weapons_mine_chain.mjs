// HORDES — regression: MINE chain detonation must not throw out of the frame.
// Run: node test/test_weapons_mine_chain.mjs
//
// BUG (Agent C): updateMine walked `for (let i = state.projectiles.length - 1; ...)`
// while a chain detonation (VOLCANIC_FIELD's `chainMine` flag) removed the
// triggering mine AND every mine it set off from that same array. The loop index
// was captured before the removals, so the next iteration read
// state.projectiles[i] past the shrunk array and threw
// "TypeError: Cannot read properties of undefined (reading 'kind')". In the
// browser that exception escapes the rAF update and kills the whole game loop.
import assert from 'node:assert/strict';
import { makeWeapon, updateWeapons, WEAPONS } from '../src/weapons.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { makePlayer } from '../src/entities.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const BLAST = WEAPONS.MINE.BLAST;            // 45
const BIG_BLAST = BLAST * 1.5;               // bigBoom evolution: 67.5
const TRIGGER = WEAPONS.MINE.TRIGGER_R;      // 20
// Layouts below place the enemy within TRIGGER of exactly ONE mine and keep the
// other mine between TRIGGER and BIG_BLAST of it, so a second detonation can
// only come from the chain.

const mkState = (enemies, projectiles) => ({
  player: makePlayer(), enemies, projectiles, effects: [],
});
const enemyAt = (x, y) => makeTypedEnemy('CHASER', x, y, 0);
const mineAt = (x, y, age = 0) => ({ kind: 'mine', x, y, age });
const minesLeft = (st) => st.projectiles.filter((p) => p.kind === 'mine').length;
const blasts = (st) => st.effects.filter((f) => f.kind === 'mine_blast').length;
// cd parked above zero: these checks are about the SCAN, not the drop cadence
// (a mine dropped this frame would sit on the player and chain in too).
const volcano = () => {
  const w = makeWeapon('MINE');
  w.cd = 5;
  w.evolutionId = 'VOLCANIC_FIELD';
  w.evolution = { flags: ['bigBoom', 'chainMine'], affixes: { damageMult: 1.7 } };
  return w;
};
const plainMine = () => { const w = makeWeapon('MINE'); w.cd = 5; return w; };

// --- the crash -----------------------------------------------------------------
check('chain detonation of a second mine does not throw', () => {
  const st = mkState([enemyAt(40, 0)], [mineAt(0, 0), mineAt(40, 0)]);
  assert.doesNotThrow(() => updateWeapons(st, [volcano()], 1 / 60));
  assert.equal(minesLeft(st), 0, 'both chained mines are consumed');
  assert.equal(blasts(st), 2, 'each mine detonated exactly once');
});

check('the trigger can land on the NEWEST mine (worst case for the old index math)', () => {
  // Enemy sits on the last-created mine: the outer loop used to trigger at
  // i = length-1, remove three mines, then read index length-2 of an empty array.
  const st = mkState([enemyAt(40, 0)], [mineAt(0, 0), mineAt(20, 0), mineAt(40, 0)]);
  assert.doesNotThrow(() => updateWeapons(st, [volcano()], 1 / 60));
  assert.equal(minesLeft(st), 0);
  assert.equal(blasts(st), 3);
});

check('a full mine field (MAX_MINES) chained away is still safe', () => {
  const mines = [];
  for (let i = 0; i < WEAPONS.MINE.MAX_MINES; i++) mines.push(mineAt(i * 10, 0));
  const st = mkState([enemyAt(50, 0)], mines);
  assert.doesNotThrow(() => updateWeapons(st, [volcano()], 1 / 60));
  assert.equal(minesLeft(st), 0);
  assert.equal(blasts(st), WEAPONS.MINE.MAX_MINES, 'every mine in the field chains');
});

check('a mine outside the blast radius survives the chain', () => {
  const far = Math.round(BIG_BLAST) + 40;    // 107 px from the trigger: never chained
  const st = mkState([enemyAt(40, 0)], [mineAt(0, 0), mineAt(40, 0), mineAt(40 + far, 0)]);
  const hpBefore = st.enemies[0].hp;
  updateWeapons(st, [volcano()], 1 / 60);
  const left = st.projectiles.filter((p) => p.kind === 'mine');
  assert.equal(left.length, 1, 'the distant mine survives');
  assert.equal(left[0].x, 40 + far);
  assert.ok(st.enemies[0].hp < hpBefore, 'the blast still damaged the enemy');
  assert.equal(blasts(st), 2, 'only the two chained mines detonated');
});

// --- chain semantics preserved --------------------------------------------------
check('chained mines detonate once each even when several sit on the trigger', () => {
  // All three are inside TRIGGER of the enemy, so the chain must not double-fire
  // any of them (visited set) and the scan must not revisit consumed mines.
  const st = mkState([enemyAt(0, 0)], [mineAt(0, 0), mineAt(6, 0), mineAt(12, 0)]);
  assert.doesNotThrow(() => updateWeapons(st, [volcano()], 1 / 60));
  assert.equal(blasts(st), 3, 'exactly one detonation per mine');
  assert.equal(minesLeft(st), 0);
});

check('un-evolved mines keep the single-detonation behavior', () => {
  const st = mkState([enemyAt(40, 0)], [mineAt(0, 0), mineAt(40, 0)]);
  assert.doesNotThrow(() => updateWeapons(st, [plainMine()], 1 / 60));
  assert.equal(blasts(st), 1, 'no chain flag -> only the triggered mine fires');
  assert.equal(minesLeft(st), 1, 'the neighbouring mine is untouched');
});

check('expired mines still fizzle and are removed', () => {
  const st = mkState([], [mineAt(0, 0, WEAPONS.MINE.LIFETIME + 1)]);
  updateWeapons(st, [plainMine()], 1 / 60);
  assert.equal(minesLeft(st), 0, 'lifetime reaps it');
  assert.equal(st.effects.filter((f) => f.kind === 'mine_fizzle').length, 1, 'fizzle effect emitted');
});

check('a fresh mine is still dropped on the fire cadence, capped at MAX_MINES', () => {
  const w = makeWeapon('MINE');
  const st = mkState([enemyAt(400, 0)], []);
  for (let i = 0; i < 200; i++) updateWeapons(st, [w], 1 / 60);   // > COOLDOWN
  const n = minesLeft(st);
  assert.ok(n >= 1, 'mines still drop');
  assert.ok(n <= WEAPONS.MINE.MAX_MINES, `trail stays capped (got ${n})`);
});

console.log(`\n${passed} assertion groups passed — test_weapons_mine_chain OK`);
