// HORDES — regression: a dead-but-unreaped enemy is NOT a valid target.
// Run: node test/test_controller_dead_targets.mjs
//
// BUG (Agent C): controllers.js ignored hp entirely, so an enemy already at
// hp<=0 — reaped by main.js in the same frame it dies, EXCEPT a COLOSSUS death
// shockwave (which kills neighbours earlier in the reap sweep and leaves them at
// hp<=0 until the next frame) — could be chosen as the volley target. main.js
// only fires when target.hp > 0, so the pilot silently held fire for that frame,
// and TOUGHEST/RANGED/SWARM could all be captured by a corpse (weapons.js's own
// nearestEnemy has always filtered hp<=0; the controllers did not).
import assert from 'node:assert/strict';
import { AutoPilotController, PlayerController } from '../src/controllers.js';
import { CONFIG as C } from '../src/config.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const player = { x: 0, y: 0 };
const st = (enemies, gems = []) => ({ enemies, gems });
const live = (x, y, extra = {}) => ({ x, y, typeId: 'CHASER', maxHp: 10, hp: 10, ...extra });
const corpse = (x, y, extra = {}) => ({ x, y, typeId: 'CHASER', maxHp: 10, hp: 0, ...extra });
const pilot = (focus) => { const c = new AutoPilotController(); c.focus = focus; return c; };
// A1 (2026-09-14): every fixture below sits INSIDE the engagement radius
// (config AUTOPILOT.FOCUS_RANGE, owner-set base 100) unless the test is about
// the radius itself — the corpse-filtering invariant is what these pin, and the
// distances are derived from the config so a future re-pricing of the radius
// cannot silently turn a fixture into an out-of-range hold-fire.
const R = C.AUTOPILOT.FOCUS_RANGE;
const IN = (f) => Math.round(R * f);

// --- NEAREST: the corpse must not shadow the live enemy -------------------------
check('NEAREST targets the live enemy, not the closer corpse', () => {
  const c = pilot('NEAREST');
  const dead = corpse(20, 0), alive = live(60, 0);
  const d = c.decide(player, st([dead, alive]), C.PLAYER);
  assert.equal(d.target, alive, 'corpse is not a target');
});

check('NEAREST returns null (hold fire) when every enemy is dead', () => {
  const c = pilot('NEAREST');
  const d = c.decide(player, st([corpse(10, 0), corpse(30, 0)]), C.PLAYER);
  assert.equal(d.target, null, 'nothing alive to shoot at');
});

// --- TOUGHEST: the biggest maxHp is a corpse after a COLOSSUS shockwave ---------
check('TOUGHEST skips the dead colossus (its maxHp still dwarfs everything)', () => {
  const c = pilot('TOUGHEST');
  const colossus = corpse(40, 0, { typeId: 'COLOSSUS', maxHp: 5000 });
  const chaser = live(70, 0);
  const d = c.decide(player, st([colossus, chaser]), C.PLAYER);
  assert.equal(d.target, chaser, 'the corpse cannot hold the doctrine');
});

// --- RANGED: a dead spitter must not silence the volley ------------------------
// (A1 retarget: the live shooter moved from 300px to IN(0.6)=60px because the
// engagement radius now gates this path too — the INVARIANT under test is dead
// vs living, not the distance, and 300px would be a legitimate hold-fire.)
check('RANGED picks a living shooter over a closer dead one', () => {
  const c = pilot('RANGED');
  const deadSpitter = corpse(50, 0, { typeId: 'SPITTER' });
  const liveSpitter = live(IN(0.6), 0, { typeId: 'SPITTER' });
  const d = c.decide(player, st([deadSpitter, liveSpitter]), C.PLAYER);
  assert.equal(d.target, liveSpitter);
});

check('RANGED falls back to the nearest live enemy when no shooter is alive', () => {
  const c = pilot('RANGED');
  const deadWarlock = corpse(40, 0, { typeId: 'WARLOCK' });
  const chaser = live(90, 0);
  const d = c.decide(player, st([deadWarlock, chaser]), C.PLAYER);
  assert.equal(d.target, chaser);
});

// --- SWARM: corpses must not create a fake cluster -----------------------------
check('SWARM never returns a corpse, even one sitting in a corpse pile', () => {
  const c = pilot('SWARM');
  // A pile of three corpses at ~20px (in range, "densest") and one live enemy.
  const pile = [corpse(18, 0), corpse(22, 0), corpse(26, 0)];
  const alive = live(60, 0);
  const d = c.decide(player, st([...pile, alive]), C.PLAYER);
  assert.equal(d.target, alive);
});

check('SWARM cluster density counts only living enemies', () => {
  const c = pilot('SWARM');
  // A1 retarget: the live cluster sits INSIDE the engagement radius now (the
  // old geometry put A at 240px, in range only at the pre-A1 260 cap). Live A
  // (A cluster of 3) vs live B at 30px ringed by four corpses: with corpses
  // counted, B's "cluster" of 5 wins; with only the living counted, A's 3 wins.
  // The two clusters are > SWARM_CLUSTER_R apart so neither inflates the other.
  const aroundB = [corpse(20, 0), corpse(26, 0), corpse(34, 0), corpse(40, 0)];
  const A = live(IN(0.95), 0);
  const neighbours = [live(IN(0.95) + 4, 0), live(IN(0.95) + 8, 0)];
  const B = live(30, 0);
  const d = c.decide(player, st([...aroundB, A, ...neighbours, B]), C.PLAYER);
  assert.equal(d.target, A, 'the real cluster wins, the corpse pile does not inflate B');
});

// --- compatibility / inheritance ------------------------------------------------
check('an enemy with no hp field still counts as alive (probe stubs, old shapes)', () => {
  const c = pilot('NEAREST');
  const stub = { x: 25, y: 0, typeId: 'CHASER', maxHp: 10 };   // no hp at all
  const d = c.decide(player, st([stub]), C.PLAYER);
  assert.equal(d.target, stub, 'undefined hp must not read as dead');
});

check('PlayerController inherits the same target filtering', () => {
  const c = new PlayerController({ up: false, down: false, left: false, right: false });
  const dead = corpse(15, 0), alive = live(50, 0);
  const d = c.decide(player, st([dead, alive]), C.PLAYER);
  assert.equal(d.target, alive);
});

check('all four doctrines agree that corpses are not targets', () => {
  for (const focus of ['NEAREST', 'TOUGHEST', 'SWARM', 'RANGED']) {
    const c = pilot(focus);
    const dead = corpse(12, 0, { typeId: 'SPITTER', maxHp: 9999 });
    const alive = live(45, 0);
    const d = c.decide(player, st([dead, alive]), C.PLAYER);
    assert.equal(d.target, alive, `${focus} targeted a corpse (or nothing)`);
  }
});

console.log(`\n${passed} assertion groups passed — test_controller_dead_targets OK`);
