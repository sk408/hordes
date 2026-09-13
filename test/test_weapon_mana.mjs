// HORDES — MANA-COST WEAPONS (Sk408: "Chain Zap seemed pretty powerful ...
// maybe should use mana").
//
// ZAP is the first weapon to opt into the mana pool: a def may carry MANA, and
// that weapon simply does not fire when the pool cannot pay. What is pinned
// here:
//   1. a funded ZAP spends exactly its cost and fires (its cooldown arms);
//   2. a starved ZAP does NOT fire and does NOT spend the cooldown, so it is
//      ready the instant mana returns (not throttled by a failed attempt);
//   3. an empty field never burns a charge (the target test comes FIRST);
//   4. weapons without MANA never touch the pool;
//   5. the cost lives on the weapon def, not sprinkled through the update.
// Run: node test/test_weapon_mana.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { WEAPONS, WEAPON_TYPES } from '../src/weapons.js';

const S = suite('WEAPON MANA COST');
const h = await boot();
const st = h.state;
const T = h.T;

const ZAP = WEAPONS.ZAP;
const COST = ZAP.MANA;

// A run with a live enemy on the field. The weapon under test is driven
// directly, so the frame loop's own resource ticks cannot muddy the numbers.
function liveWithEnemy() {
  T.startRun();
  // Keep pumping until a real enemy exists — using the game's own spawn path
  // rather than a hand-built fixture that could drift from the enemy contract.
  for (let i = 0; i < 900 && st.enemies.length === 0; i++) {
    h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  }
  assert.ok(st.enemies.length > 0, 'the run spawned an enemy to aim at');
  const w = { type: 'ZAP', level: 1, cd: 0, evolution: null };
  return w;
}
const fire = (w) => WEAPON_TYPES.ZAP.update(st, w, 1 / 60);

// ============================================================================
S.check('the cost lives on the weapon def', () => {
  assert.ok(COST > 0, 'WEAPONS.ZAP.MANA must be a positive cost (got ' + COST + ')');
  assert.equal(Object.keys(WEAPONS).filter(k => WEAPONS[k].MANA).length, 1,
    'exactly one weapon opts into mana today (ZAP)');
});

// ============================================================================
S.check('a funded ZAP spends its cost and fires', () => {
  const w = liveWithEnemy();
  st.player.mana = 100;
  fire(w);
  assert.ok(st.player.mana <= 100 - COST + 1,
    'a fired bolt spends its ' + COST + ' cost (100 -> ' + st.player.mana + ')');
  assert.ok(w.cd > 0, 'and it arms its cooldown (cd=' + w.cd + ')');
});

// ============================================================================
S.check('a starved ZAP does not fire — and keeps its readiness', () => {
  const w = liveWithEnemy();
  st.player.mana = COST - 1;          // one short
  const before = st.player.mana;
  fire(w);
  assert.equal(st.player.mana, before,
    'a bolt that cannot be paid for spends NOTHING (' + before + ' -> ' + st.player.mana + ')');
  assert.ok(w.cd <= 0,
    'and is not charged a cooldown, so it fires the instant mana returns (cd=' + w.cd + ')');

  // ...and it really does fire the moment the pool can pay.
  st.player.mana = COST;
  fire(w);
  assert.ok(w.cd > 0, 'funded on the next attempt, it fires (cd=' + w.cd + ')');
  assert.ok(st.player.mana < COST, 'having spent the cost');
});

// ============================================================================
S.check('an empty field never burns a charge', () => {
  T.startRun();
  const w = { type: 'ZAP', level: 1, cd: 0, evolution: null };
  st.enemies.length = 0;
  st.player.mana = 100;
  fire(w);
  assert.equal(st.player.mana, 100,
    'no target means no bolt and no mana spent (' + st.player.mana + ')');
  assert.ok(w.cd <= 0, 'and no cooldown armed');
});

// ============================================================================
S.check('weapons without a MANA cost never touch the pool', () => {
  T.startRun();
  for (let i = 0; i < 900 && st.enemies.length === 0; i++) {
    h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  }
  assert.ok(st.enemies.length > 0, 'an enemy exists');
  for (const id of Object.keys(WEAPON_TYPES)) {
    if (WEAPONS[id] && WEAPONS[id].MANA) continue;   // ZAP is covered above
    const w = { type: id, level: 1, cd: 0, evolution: null };
    st.player.mana = 100;
    try { WEAPON_TYPES[id].update(st, w, 1 / 60); } catch { /* this weapon's own
      preconditions are not this test's subject; only the pool matters */ }
    assert.equal(st.player.mana, 100,
      id + ' must not spend mana (it declares no MANA cost)');
  }
});

S.done();
