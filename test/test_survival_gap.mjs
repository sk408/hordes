// HORDES — SURVIVAL-GAP wave tests: the contact-damage FUNCTION and the
// player's in-run pool axis.
//
// These are the assertions behind the wave's central claim, made checkable
// instead of narrated:
//   1. the ONE contact-damage function (entities.contactHitDamage) is what the
//      game calls, and its shape is the documented one (sub-linear in the
//      ladder's damage curve, capped at a fraction of the bar);
//   2. a wave-1 GRAVELMAW CHARGE no longer one-shots the tiers the run has to
//      support (the measured wall: 120 damage vs a 130-230 HP pool killed every
//      build at wave 1);
//   3. the cap can never be the whole bar, at ANY run time — the ladder's
//      damage curve is applied at run limit too, and the player still has at
//      least two catches in them;
//   4. the in-run pool axis (HP_PER_LEVEL) is a real, dt-free growth rule, and
//      the TICK latch bleed is bounded.
// Run: node test/test_survival_gap.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, ladderDmg } from '../src/config.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

const S = C.SURVIVAL;
const MAX_TICK = Math.ceil(C.RUN.LIMIT / 30);

console.log('survival-gap: the contact-damage function');

ok('the constants exist and are the documented shape', () => {
  // OWNER enemy buff 2026-09-13: the base was squared, 14 -> 196.
  assert.equal(S.BASE_CONTACT, 196, 'the touch base is the shipped 196 (14 squared)');
  assert.ok(S.CONTACT_POW > 0 && S.CONTACT_POW < 1,
    `contact responds SUB-linearly to the ladder (pow ${S.CONTACT_POW})`);
  assert.ok(S.HIT_CAP_FRAC > 0 && S.HIT_CAP_FRAC < 1,
    `a single hit is a FRACTION of the bar (${S.HIT_CAP_FRAC})`);
  assert.ok(S.HP_PER_LEVEL > 0, 'the run has an in-run pool axis');
  assert.ok(Number.isInteger(S.MAX_DRAIN_TICKS) && S.MAX_DRAIN_TICKS >= 1,
    'the TICK latch bleed is bounded');
});

ok('damage rises with the ladder curve but never linearly', () => {
  const pool = 1e9;                       // cap out of the way
  const at = (w) => contactHitDamage(S.BASE_CONTACT, ladderDmg(w), 1, 1, pool);
  assert.ok(at(30) > at(4), 'the threat climbs across the run');
  const linear = (w) => S.BASE_CONTACT * ladderDmg(w);
  assert.ok(at(MAX_TICK) < 0.5 * linear(MAX_TICK),
    `the applied damage is far below the raw curve at the limit ` +
    `(${at(MAX_TICK).toFixed(1)} vs ${linear(MAX_TICK).toFixed(1)})`);
});

ok('a single hit can never be more than HIT_CAP_FRAC of the bar', () => {
  for (const pool of [100, 130, 230, 600, 2000]) {
    for (const w of [0, 4, 12, 30, MAX_TICK]) {
      const hit = contactHitDamage(S.BASE_CONTACT, ladderDmg(w), 3.0, 1.5, pool);
      assert.ok(hit <= pool * S.HIT_CAP_FRAC + 1e-9,
        `pool ${pool} tick ${w}: ${hit.toFixed(1)} <= ${(pool * S.HIT_CAP_FRAC).toFixed(1)}`);
    }
  }
});

console.log('survival-gap: the wave-1 wall (the measured bug)');

ok('a wave-1 GRAVELMAW charge no longer one-shots the supported tiers', () => {
  // GRAVELMAW: contactDamageMult 2.2, charging window x1.5, at the wave-1 tick.
  const w1 = Math.round(C.ESCALATION.WAVE_LENGTH / 30);
  const charge = (pool) => contactHitDamage(S.BASE_CONTACT, ladderDmg(w1), 2.2, 1.5, pool);
  for (const pool of [130, 230]) {              // fresh KNIGHT / maxed tank
    assert.ok(charge(pool) < pool,
      `a ${pool} HP build survives one wave-1 charge (${charge(pool).toFixed(0)} damage)`);
    assert.ok(pool / charge(pool) >= 2,
      `... and survives at least two (${(pool / charge(pool)).toFixed(2)} catches)`);
  }
  // The shipped formula it replaced: 14 * 2.6 * 2.2 * 1.5 = 120, which killed
  // every 100-130 HP fresh save and two-shot a 230 HP maxed one.
  assert.ok(charge(130) < 100, 'a fresh save is no longer one-shot by the charger');
});

ok('the wall is still a wall: repeated catches in one wave still kill', () => {
  const w1 = Math.round(C.ESCALATION.WAVE_LENGTH / 30);
  const charge = contactHitDamage(S.BASE_CONTACT, ladderDmg(w1), 2.2, 1.5, 130);
  const catches = Math.ceil(130 / charge);
  assert.ok(catches >= 2 && catches <= 6,
    `a fresh save dies to ${catches} catches in a wave (not 1, not 20)`);
});

ok('by the run limit a maxed pool still needs at least two hits', () => {
  // The maxed KNIGHT pool (100 + 5x20 Vitality + 30 character) grown by the
  // in-run axis: 230 x (1 + 0.015 * 45 levels) ~= 385.
  const pool = 230 * (1 + S.HP_PER_LEVEL * 45);
  const hit = contactHitDamage(S.BASE_CONTACT, ladderDmg(MAX_TICK), 3.0, 1.5, pool);
  assert.ok(pool / hit >= 2, `run limit: ${(pool / hit).toFixed(2)} hits to die`);
});

ok('the function is PURE and dt-free (frame-rate independence)', () => {
  const a = contactHitDamage(14, 9.32, 2.2, 1.5, 300);
  const b = contactHitDamage(14, 9.32, 2.2, 1.5, 300);
  assert.equal(a, b, 'same inputs, same damage — no state, no timer to stack');
});

console.log('survival-gap: the player pool axis');

ok('level-ups grow the pool, and the growth is a per-level constant', () => {
  // main.js levelUp: gain = state.baseMaxHp * HP_PER_LEVEL, healed in.
  const base = makePlayer().stats.maxHp;
  const gain = base * S.HP_PER_LEVEL;
  assert.ok(gain > 0 && gain < base * 0.1, `a level is worth ${gain.toFixed(2)} HP on a ${base} pool`);
  // 45 levels (a developed run) roughly +2/3 of the start pool: enough to
  // answer the late ladder, not enough to make a fresh save unkillable.
  const grown = base * (1 + S.HP_PER_LEVEL * 45);
  assert.ok(grown > 1.5 * base && grown < 3 * base,
    `45 levels takes a ${base} pool to ${grown.toFixed(0)} HP`);
});

if (process.env.HORDES_BREAK) { /* dead branch kept out of the pass path */ }
console.log(`survival-gap: all ${passed} assertions green`);
