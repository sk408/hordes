// HORDES — intermission choices tests (src/choices.js). Deterministic rng.
// Run: node test/test_choices.mjs
import assert from 'node:assert';
import {
  CHOICE_POOL, RARITIES, RARITY_SCALE, rollChoices, applyChoice, ensureChoices,
} from '../src/choices.js';
import { makePlayer } from '../src/entities.js';
import { mulberry32 } from '../src/weather.js';

// Deterministic rng helper: replays a fixed sequence.
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const near = (a, b, eps = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} expected ~${b}, got ${a}`);

// Apply one pool entry at a rarity to a fresh makePlayer.
function applyAt(id, rarity) {
  const entry = CHOICE_POOL.find((e) => e.id === id);
  const { desc, apply } = entry.build(RARITY_SCALE[rarity]);
  const p = makePlayer();
  apply(p);
  return { p, desc };
}

// ---- pool sanity -------------------------------------------------------------
assert.ok(CHOICE_POOL.length >= 12, `pool must have >= 12 entries (${CHOICE_POOL.length})`);
assert.equal(new Set(CHOICE_POOL.map((e) => e.id)).size, CHOICE_POOL.length, 'no duplicate ids');
for (const e of CHOICE_POOL) {
  for (const r of RARITIES) {
    const built = e.build(RARITY_SCALE[r]);
    assert.equal(typeof built.apply, 'function', `${e.id}/${r} apply must be a function`);
    assert.ok(built.desc.length > 0, `${e.id}/${r} desc must be non-empty`);
    assert.ok(built.desc.includes('/'), `${e.id}/${r} desc must state blessing AND drawback`);
  }
}

// ---- determinism -------------------------------------------------------------
// Same seed -> identical offers (ids, rarities, descs, order).
{
  const a = rollChoices(3, mulberry32(42));
  const b = rollChoices(3, mulberry32(42));
  assert.deepEqual(a.map((o) => [o.id, o.rarity, o.desc]),
                   b.map((o) => [o.id, o.rarity, o.desc]),
                   'same seed must roll identical offers');
  assert.equal(a.length, 3, 'a roll offers exactly 3 choices');
  // seq rng: r=0 always lands COMMON (weight bracket).
  assert.deepEqual(rollChoices(0, seq([0])).map((o) => o.rarity), ['COMMON', 'COMMON', 'COMMON']);
  // r=0.999 always lands EPIC at wave 0 (12/97 epic bracket).
  assert.deepEqual(rollChoices(0, seq([0.999])).map((o) => o.rarity), ['EPIC', 'EPIC', 'EPIC']);
  // Different seeds should (almost surely) differ somewhere over a set.
  const c = rollChoices(3, mulberry32(43));
  assert.notDeepEqual(a.map((o) => [o.id, o.rarity]), c.map((o) => [o.id, o.rarity]));
}

// ---- distinctness ------------------------------------------------------------
for (let seed = 0; seed < 300; seed++) {
  const offers = rollChoices(seed % 7, mulberry32(1000 + seed));
  assert.equal(offers.length, 3, `seed ${seed}: 3 offers`);
  assert.equal(new Set(offers.map((o) => o.id)).size, 3, `seed ${seed}: distinct ids`);
}
// excludeIds: run-scoped no-repeat + exhaustion safety.
{
  const ids = CHOICE_POOL.map((e) => e.id);
  const keep = ids.slice(0, 3);
  const offers = rollChoices(0, mulberry32(5), ids.filter((i) => !keep.includes(i)));
  assert.deepEqual(new Set(offers.map((o) => o.id)), new Set(keep), 'excluded ids never offered');
  assert.equal(rollChoices(0, mulberry32(5), ids).length, 0, 'fully excluded pool offers nothing');
}

// ---- rarity distribution bounds (wave 0: weights 60/25/12) --------------------
{
  const rng = mulberry32(1234);
  const counts = { COMMON: 0, RARE: 0, EPIC: 0 };
  const ROLLS = 2000;
  for (let i = 0; i < ROLLS; i++) {
    for (const o of rollChoices(0, rng)) counts[o.rarity]++;
  }
  const total = ROLLS * 3;
  const f = { COMMON: counts.COMMON / total, RARE: counts.RARE / total, EPIC: counts.EPIC / total };
  assert.ok(f.COMMON > 0.50 && f.COMMON < 0.75, `COMMON fraction in bounds: ${f.COMMON}`);
  assert.ok(f.RARE > 0.15 && f.RARE < 0.40, `RARE fraction in bounds: ${f.RARE}`);
  assert.ok(f.EPIC > 0.04 && f.EPIC < 0.25, `EPIC fraction in bounds: ${f.EPIC}`);
  assert.ok(f.COMMON > f.RARE && f.RARE > f.EPIC, 'rarity ordering common > rare > epic');
  // Epic ramps with wave (12 -> 30 weight by wave 8: epic ~26% vs ~12%).
  const rngHi = mulberry32(4321);
  const hi = { EPIC: 0 };
  for (let i = 0; i < ROLLS; i++) {
    for (const o of rollChoices(8, rngHi)) if (o.rarity === 'EPIC') hi.EPIC++;
  }
  assert.ok(hi.EPIC / total > f.EPIC * 1.5, `wave 8 epic rate must exceed wave 0: ${hi.EPIC / total} vs ${f.EPIC}`);
}

// ---- every blessing: stated buff AND stated curse (fresh makePlayer) ---------
// COMMON (scale 1) — exact numbers.
{
  let p = applyAt('blood_pact', 'COMMON').p;
  near(p.stats.damage, 10); near(p.stats.maxHp, 85); near(p.hp, 85, 1e-9, 'hp clamped after maxHp loss');
  p = applyAt('zephyr_stride', 'COMMON').p;
  near(p.stats.speed, 72); near(p.stats.pickup, 19.8);
  p = applyAt('scholars_pact', 'COMMON').p;
  near(p.stats.xpMult, 1.3); near(p.stats.goldMult, 0.85);
  p = applyAt('gem_hawker', 'COMMON').p;
  near(p.stats.pickup, 30.8); near(p.stats.speed, 54);
  p = applyAt('alchemists_blessing', 'COMMON').p;
  near(p.choices.potionHealMult, 2); near(p.choices.dropChanceMult, 0.5);
  p = applyAt('stone_skin', 'COMMON').p;
  near(p.stats.maxHp, 125); near(p.stats.damage, 7.2);
  p = applyAt('hair_trigger', 'COMMON').p;
  near(p.stats.cooldown, 0.44); near(p.stats.maxMana, 80);
  p = applyAt('vampires_kiss', 'COMMON').p;
  near(p.stats.lifesteal, 0.05); near(p.choices.potionHealMult, 1 / 1.5);
  p = applyAt('giants_heart', 'COMMON').p;
  near(p.stats.maxHp, 150); near(p.hp, 150, 1e-9, 'giants heart heals what it grants');
  near(p.stats.speed, 51);
  p = applyAt('keen_edge', 'COMMON').p;
  near(p.stats.crit, 0.10); near(p.stats.damage, 6.8);
  p = applyAt('lancers_discipline', 'COMMON').p;
  near(p.stats.pierce, 1); near(p.stats.cooldown, 0.55 * 1.15);
  p = applyAt('merchants_pact', 'COMMON').p;
  near(p.choices.weaponSlotBonus, 2); near(p.choices.shopPriceMult, 1.5);
  p = applyAt('glass_cannon', 'COMMON').p;
  near(p.stats.damage, 11.2); near(p.choices.damageTakenMult, 1.3);
  p = applyAt('fortunes_favor', 'COMMON').p;
  near(p.choices.itemDropMult, 2); near(p.stats.goldMult, 0.75);
}
// EPIC (scale 2.2) — buffs AND curses both scale.
{
  let p = applyAt('blood_pact', 'EPIC').p;
  near(p.stats.damage, 8 * (1 + 0.25 * 2.2)); near(p.stats.maxHp, 100 * (1 - 0.15 * 2.2));
  p = applyAt('hair_trigger', 'EPIC').p;
  near(p.stats.cooldown, 0.55 * (1 - 0.44)); near(p.stats.maxMana, 100 * (1 - 0.44));
  p = applyAt('alchemists_blessing', 'EPIC').p;
  near(p.choices.potionHealMult, 3.2); near(p.choices.dropChanceMult, 1 / 3.2);
  p = applyAt('merchants_pact', 'EPIC').p;
  near(p.choices.weaponSlotBonus, 4); near(p.choices.shopPriceMult, 2.1);
  p = applyAt('lancers_discipline', 'EPIC').p;
  near(p.stats.pierce, 2);
  p = applyAt('glass_cannon', 'EPIC').p;
  near(p.stats.damage, 8 * (1 + 0.88)); near(p.choices.damageTakenMult, 1 + 0.66);
  p = applyAt('giants_heart', 'EPIC').p;
  near(p.stats.maxHp, 100 + 110); near(p.stats.speed, 60 * (1 - 0.33));
}
// Curse DIRECTION holds for every entry at every rarity: each apply must move
// at least one stat strictly below fresh-player baseline (or a choices field
// below 1) while another strictly above it.
{
  const FRESH = makePlayer();
  const DEFAULTS = { crit: 0, thorns: 0, lifesteal: 0, xpMult: 1, goldMult: 1 };
  for (const e of CHOICE_POOL) {
    for (const r of RARITIES) {
      const { p } = applyAt(e.id, r);
      let buffed = false, cursed = false;
      for (const k of ['damage', 'speed', 'pickup', 'maxHp', 'maxMana', 'pierce',
                       'crit', 'thorns', 'lifesteal', 'xpMult', 'goldMult', 'cooldown']) {
        const before = FRESH.stats[k] ?? DEFAULTS[k] ?? 1;
        const after = p.stats[k];
        if (after === undefined) continue;
        const up = after > before, down = after < before;
        if (k === 'cooldown') {             // LOWER cooldown is the buff
          if (down) buffed = true;
          if (up) cursed = true;
        } else {
          if (up) buffed = true;
          if (down) cursed = true;
        }
      }
      if (p.choices) {
        if (p.choices.potionHealMult > 1 || p.choices.itemDropMult > 1) buffed = true;
        if (p.choices.weaponSlotBonus > 0) buffed = true;
        for (const k of ['dropChanceMult', 'potionHealMult']) if (p.choices[k] < 1) cursed = true;
        for (const k of ['shopPriceMult', 'damageTakenMult']) if (p.choices[k] > 1) cursed = true;
      }
      assert.ok(buffed, `${e.id}/${r} must grant a real buff`);
      assert.ok(cursed, `${e.id}/${r} must carry a real drawback`);
    }
  }
}

// ---- applyChoice wrapper -------------------------------------------------------
{
  const [offer] = rollChoices(1, mulberry32(9));
  const p = makePlayer();
  assert.equal(applyChoice(p, offer), p, 'applyChoice returns the player');
  const statsChanged = JSON.stringify(p.stats) !== JSON.stringify(makePlayer().stats);
  assert.ok(statsChanged || p.choices, 'applyChoice mutated the player');
  assert.throws(() => applyChoice(makePlayer(), { id: 'nope', apply: () => {} }));
  assert.throws(() => applyChoice(makePlayer(), null));
}

// ---- run-scope purity: applies never leave the player object ------------------
// New top-level keys are limited to the documented run-scoped 'choices' bag;
// nothing meta/profile-shaped is ever written (hb1 resets by re-making player).
{
  const FRESH_KEYS = new Set(Object.keys(makePlayer()));
  for (const e of CHOICE_POOL) {
    for (const r of RARITIES) {
      const { p } = applyAt(e.id, r);
      const added = Object.keys(p).filter((k) => !FRESH_KEYS.has(k));
      assert.ok(added.length === 0 || (added.length === 1 && added[0] === 'choices'),
        `${e.id}/${r} may only add 'choices' at top level (got ${added})`);
      if (p.choices) {
        assert.deepEqual(Object.keys(p.choices).sort(),
          ['damageTakenMult', 'dropChanceMult', 'itemDropMult', 'potionHealMult', 'shopPriceMult', 'weaponSlotBonus'],
          `${e.id}/${r} choices bag holds exactly the documented fields`);
      }
      assert.ok(p.meta === undefined && p.profile === undefined, `${e.id}/${r} never touches meta/profile`);
    }
  }
  // ensureChoices fills the full default bag on a bare player.
  const bare = { stats: {} };
  assert.deepEqual(ensureChoices(bare), {
    weaponSlotBonus: 0, shopPriceMult: 1, potionHealMult: 1,
    dropChanceMult: 1, itemDropMult: 1, damageTakenMult: 1,
  });
}

console.log('ALL CHOICES TESTS PASSED');
