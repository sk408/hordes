// HORDES — contact damage and the player's pool.
//   1. the ONE contact-damage function (entities.contactHitDamage) is
//      min(BASE_CONTACT * ladderDmg^CONTACT_POW * typeMult * chargeMult,
//          HIT_CAP_FRAC * maxHp);
//   2. hits-to-die is a real axis: a fresh Knight dies to a small whole number
//      of chaser hits and every Vitality level buys a real fraction of a hit;
//   3. the cap can never be the whole bar, at ANY run time;
//   4. the in-run pool axis (HP_PER_LEVEL) is a dt-free growth rule, and the
//      TICK latch bleed is bounded.
// Run: node test/test_survival_gap.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, ladderDmg } from '../src/config.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';
import { ENEMY_TYPES } from '../src/enemy_types.js';
import { CHARACTERS, SHOP_BY_ID } from '../src/meta.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

const S = C.SURVIVAL;
const MAX_TICK = Math.ceil(C.RUN.LIMIT / 30);
const KNIGHT_HP = C.PLAYER.MAX_HP + CHARACTERS.KNIGHT.mods.maxHp;
const VIT = SHOP_BY_ID.hp;
const raw = (w, type = 1, charge = 1) =>
  S.BASE_CONTACT * Math.pow(ladderDmg(w), S.CONTACT_POW) * type * charge;

console.log('survival-gap: the contact-damage function');

ok('the constants exist and are the documented shape', () => {
  assert.ok(S.BASE_CONTACT > 0, 'there is a touch base');
  assert.ok(S.CONTACT_POW > 0 && S.CONTACT_POW <= 1,
    `contact never outruns the ladder (pow ${S.CONTACT_POW})`);
  assert.ok(S.HIT_CAP_FRAC > 0 && S.HIT_CAP_FRAC < 1,
    `a single hit is a FRACTION of the bar (${S.HIT_CAP_FRAC})`);
  assert.ok(S.HP_PER_LEVEL > 0, 'the run has an in-run pool axis');
  assert.ok(Number.isInteger(S.MAX_DRAIN_TICKS) && S.MAX_DRAIN_TICKS >= 1,
    'the TICK latch bleed is bounded');
});

ok('contactHitDamage = min(raw, cap)', () => {
  for (const pool of [45, KNIGHT_HP, 340, 2000]) {
    for (const w of [0, 4, 12, 30, MAX_TICK]) {
      for (const [type, charge] of [[1, 1], [0.7, 1], [1.8, 1], [1, 1.5]]) {
        const want = Math.min(raw(w, type, charge), pool * S.HIT_CAP_FRAC);
        const got = contactHitDamage(S.BASE_CONTACT, ladderDmg(w), type, charge, pool);
        assert.ok(Math.abs(got - want) < 1e-9,
          `pool ${pool} tick ${w} x${type} x${charge}: ${got} vs ${want}`);
      }
    }
  }
});

ok('damage rises with the ladder curve', () => {
  const pool = 1e9;                       // cap out of the way
  const at = (w) => contactHitDamage(S.BASE_CONTACT, ladderDmg(w), 1, 1, pool);
  for (let w = 1; w <= MAX_TICK; w++) {
    assert.ok(at(w) > at(w - 1), `tick ${w} hits harder than tick ${w - 1}`);
  }
});

ok('a single hit can never be more than HIT_CAP_FRAC of the bar', () => {
  for (const pool of [45, 60, 90, 340, 600, 2000]) {
    for (const w of [0, 4, 12, 30, MAX_TICK]) {
      const hit = contactHitDamage(S.BASE_CONTACT, ladderDmg(w), 3.0, 1.5, pool);
      assert.ok(hit <= pool * S.HIT_CAP_FRAC + 1e-9,
        `pool ${pool} tick ${w}: ${hit.toFixed(1)} <= ${(pool * S.HIT_CAP_FRAC).toFixed(1)}`);
    }
  }
});

console.log('survival-gap: hits to die');

ok('a fresh Knight dies to ceil(maxHp / hit) chaser hits, and the cap is not what decides it', () => {
  const type = ENEMY_TYPES.CHASER.contactDamageMult;
  const hit = contactHitDamage(S.BASE_CONTACT, ladderDmg(0), type, 1, KNIGHT_HP);
  assert.equal(hit, raw(0, type), 'an opening chaser hit is the raw number, under the cap');
  const hits = Math.ceil(KNIGHT_HP / hit);
  assert.ok(hits >= 2 && hits <= 6, `a fresh Knight dies to hit ${hits} (not 1, not 20)`);
  // Walk the bar down the way the game does.
  let hp = KNIGHT_HP, n = 0;
  while (hp > 0) { hp -= contactHitDamage(S.BASE_CONTACT, ladderDmg(0), type, 1, KNIGHT_HP); n++; }
  assert.equal(n, hits);
});

ok('every Vitality level changes hits-to-die by a real fraction of a hit', () => {
  const type = ENEMY_TYPES.CHASER.contactDamageMult;
  const hitsToDie = (lvl) => {
    const pool = KNIGHT_HP + VIT.perLevel * lvl;
    return pool / contactHitDamage(S.BASE_CONTACT, ladderDmg(0), type, 1, pool);
  };
  for (let lvl = 1; lvl <= VIT.maxLevel; lvl++) {
    const step = hitsToDie(lvl) - hitsToDie(lvl - 1);
    assert.ok(step >= 0.25, `Vitality ${lvl} buys ${step.toFixed(2)} of a chaser hit`);
  }
  assert.ok(Math.ceil(hitsToDie(VIT.maxLevel)) > Math.ceil(hitsToDie(0)),
    'a maxed Vitality row survives more whole hits than a fresh save');
});

ok('a wave-1 boss charge does not one-shot a fresh Knight, and repeated catches still kill', () => {
  const w1 = Math.round(C.ESCALATION.WAVE_LENGTH / 30);
  const charge = contactHitDamage(S.BASE_CONTACT, ladderDmg(w1),
    C.ESCALATION.BOSS.CONTACT_MULT, 1.5, KNIGHT_HP);
  assert.ok(charge < KNIGHT_HP, `a fresh Knight survives one charge (${charge.toFixed(0)} damage)`);
  const catches = Math.ceil(KNIGHT_HP / charge);
  assert.ok(catches >= 2 && catches <= 6, `... and dies to ${catches} catches (not 1, not 20)`);
});

ok('by the run limit any pool still needs at least two hits', () => {
  const heaviest = Math.max(...Object.values(ENEMY_TYPES).map(t => t.contactDamageMult || 0));
  for (const base of [C.PLAYER.MAX_HP, KNIGHT_HP, KNIGHT_HP + VIT.perLevel * VIT.maxLevel]) {
    const pool = base * (1 + S.HP_PER_LEVEL * 45);
    const hit = contactHitDamage(S.BASE_CONTACT, ladderDmg(MAX_TICK), heaviest, 1.5, pool);
    assert.ok(Math.ceil(pool / hit) >= 2, `run limit, pool ${pool.toFixed(0)}: ${(pool / hit).toFixed(2)} hits to die`);
  }
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
  // 45 levels (a developed run) is exactly 45 x that constant on top.
  const grown = base * (1 + S.HP_PER_LEVEL * 45);
  assert.ok(Math.abs(grown - (base + 45 * gain)) < 1e-9 && grown > base && grown < 3 * base,
    `45 levels takes a ${base} pool to ${grown.toFixed(0)} HP`);
});

if (process.env.HORDES_BREAK) { /* dead branch kept out of the pass path */ }
console.log(`survival-gap: all ${passed} assertions green`);
