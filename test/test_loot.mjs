// HORDES — unit tests for src/loot.js (node, no DOM). Deterministic rng stub.
import assert from 'node:assert';
import {
  RARITIES, RARITY_WEIGHTS, AFFIX_POOL, LEGENDARIES, STAT_DEFAULTS,
  pickRarity, rollItem, equipItem, unequipItem, applyAffixes, MAX_EQUIPPED,
  PAID_CHESTS, rollPaidChest,
} from '../src/loot.js';

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1})`);
    return vals[i++];
  };
};

// ---------- rarity weights + distribution ----------
{
  const sum = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 100, `weights must sum to 100 (got ${sum})`);
  // Band edges at zero bias: C 0-60 / R 60-85 / E 85-97 / L 97-100.
  assert.strictEqual(pickRarity(seq([0.0])), 'COMMON');
  assert.strictEqual(pickRarity(seq([0.599])), 'COMMON');
  assert.strictEqual(pickRarity(seq([0.60])), 'RARE');
  assert.strictEqual(pickRarity(seq([0.849])), 'RARE');
  assert.strictEqual(pickRarity(seq([0.85])), 'EPIC');
  assert.strictEqual(pickRarity(seq([0.969])), 'EPIC');
  assert.strictEqual(pickRarity(seq([0.97])), 'LEGENDARY');

  // tierBias pushes up-tier: the SAME roll value lands rarer with bias.
  // bias=3 weights: C60 R100 E84 L30 (total 274); r=0.5 -> 137 -> RARE.
  assert.strictEqual(pickRarity(seq([0.5]), 0), 'COMMON', 'no bias: 0.5 -> COMMON');
  assert.strictEqual(pickRarity(seq([0.5]), 3), 'RARE', 'bias 3: same roll -> RARE');
  // GOLD-tier chest bias (1.5): weights C60 R62.5 E42 L13.5 (total 178);
  // r=0.9 -> 160.2: past C+R (122.5), into E (ends 164.5) -> EPIC.
  assert.strictEqual(pickRarity(seq([0.9]), 1.5), 'EPIC');
  console.log('ok: rarity weights sum to 100; bands + tierBias shift correct');
}

// ---------- rollItem: counts, names, affix math ----------
{
  // COMMON: 1 rarity roll + 1 affix pick.
  const c = rollItem(seq([0.0, 0.0]));
  assert.strictEqual(c.rarity, 'COMMON');
  assert.strictEqual(c.affixes.length, 1);
  assert.ok(c.name.startsWith('Worn '), 'common name uses the Worn prefix');

  // RARE: 1 + 2 picks, distinct affixes, 1.5x magnitude.
  const r = rollItem(seq([0.7, 0.0, 0.0]));
  assert.strictEqual(r.rarity, 'RARE');
  assert.strictEqual(r.affixes.length, 2);
  assert.notStrictEqual(r.affixes[0].id, r.affixes[1].id, 'affixes are distinct');
  const def = AFFIX_POOL.find(a => a.id === r.affixes[0].id);
  assert.ok(Math.abs(r.affixes[0].magnitude - def.base * 1.5) < 1e-12,
    'rare magnitude = base * 1.5');

  // EPIC: 3 affixes at 2.2x.
  const e = rollItem(seq([0.86, 0.0, 0.0, 0.0]));
  assert.strictEqual(e.rarity, 'EPIC');
  assert.strictEqual(e.affixes.length, 3);
  const edef = AFFIX_POOL.find(a => a.id === e.affixes[0].id);
  assert.ok(Math.abs(e.affixes[0].magnitude - edef.base * 2.2) < 1e-12);

  console.log('ok: rollItem affix counts + rarity-scaled magnitudes');
}

// ---------- LEGENDARY: one unique named item per slot archetype ----------
{
  assert.strictEqual(Object.keys(LEGENDARIES).length, 4, 'exactly 4 named legendaries');
  for (const [slot, def] of Object.entries(LEGENDARIES)) {
    assert.strictEqual(def.slot, slot);
    assert.strictEqual(def.rarity, 'LEGENDARY');
    assert.strictEqual(def.affixes.length, 3, `${slot} legendary has 3 fixed affixes`);
    assert.ok(def.desc.length > 10, `${slot} legendary has flavor text`);
  }
  // Legendary roll: rarity rng 0.99 -> LEGENDARY, slot rng 0.5 -> index 2 (BOOTS).
  const l = rollItem(seq([0.99, 0.5]));
  assert.strictEqual(l.rarity, 'LEGENDARY');
  assert.strictEqual(l.slot, 'BOOTS');
  assert.strictEqual(l.name, LEGENDARIES.BOOTS.name, 'legendary uses its fixed name');
  // Deep copy: mutating the rolled affixes must not corrupt the table.
  l.affixes[0].magnitude = 999;
  assert.strictEqual(LEGENDARIES.BOOTS.affixes[0].magnitude !== 999, true,
    'rolled legendary is a deep copy');
  console.log('ok: legendaries — 4 named uniques, fixed affixes, deep-copied');
}

// ---------- applyAffixes: pure math onto the stats contract ----------
{
  const base = { damage: 10, speed: 60 };   // run-stats fields stay untouched
  const item = {
    id: 't1', rarity: 'COMMON',
    affixes: [
      { id: 'damageMult', field: 'damageMult', magnitude: 0.3 },
      { id: 'crit', field: 'crit', magnitude: 0.12 },
    ],
  };
  const out = applyAffixes(base, item);
  assert.strictEqual(out.damage, 10, 'existing fields pass through');
  assert.strictEqual(out.damageMult, 1 + 0.3, 'damageMult = default + affix');
  assert.strictEqual(out.crit, 0.12, 'crit = default 0 + affix');
  assert.strictEqual(out.critMult, STAT_DEFAULTS.critMult, 'missing fields get defaults');
  assert.ok(!('damageMult' in base) && base.damage === 10, 'PURE: input not mutated');

  // Array form + stacking across items (additive within a field).
  const item2 = { id: 't2', rarity: 'COMMON', affixes: [{ field: 'damageMult', id: 'x', magnitude: 0.2 }] };
  const out2 = applyAffixes(base, [item, item2]);
  assert.ok(Math.abs(out2.damageMult - 1.5) < 1e-12, 'affixes from multiple items ADD (0.3+0.2)');
  console.log('ok: applyAffixes pure additive math with documented fields');
}

// ---------- equip / unequip cap ----------
{
  const inv = [];
  for (let i = 0; i < MAX_EQUIPPED; i++) {
    assert.strictEqual(equipItem(inv, { id: 'i' + i }), true, 'equip below cap');
  }
  assert.strictEqual(inv.length, MAX_EQUIPPED, `cap is ${MAX_EQUIPPED}`);
  assert.strictEqual(equipItem(inv, { id: 'overflow' }), false, 'equip past cap refused');
  assert.strictEqual(inv.length, MAX_EQUIPPED, 'failed equip does not push');
  const removed = unequipItem(inv, 'i1');
  assert.ok(removed && removed.id === 'i1', 'unequip by id returns the item');
  assert.strictEqual(unequipItem(inv, 'nope'), null, 'unequip unknown id -> null');
  assert.strictEqual(equipItem(inv, { id: 'now-fits' }), true, 'slot freed after unequip');
  console.log('ok: equip cap 4 + unequip');
}

// ---------- PAID CHESTS: debit + gamble both ways ----------
{
  // Win path: BRONZE, rng order = nothing-flip (0.39 < 0.40? no -> 0.39 < 0.40
  // IS nothing... pick 0.50 >= 0.40 -> item), then rollItem draws.
  const p1 = { gold: 100 };
  const res1 = rollPaidChest(p1, 'BRONZE', seq([0.5, 0.0, 0.0])); // item, COMMON
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.gambled, 'item');
  assert.strictEqual(res1.debited, PAID_CHESTS.BRONZE.cost);
  assert.strictEqual(p1.gold, 50, 'gold debited on the win');
  assert.ok(res1.item && res1.item.rarity === 'COMMON');

  // Nothing path: flip 0.0 < nothingChance -> debited, NO item, no refund.
  const p2 = { gold: 100 };
  const res2 = rollPaidChest(p2, 'BRONZE', seq([0.0]));
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.gambled, 'nothing');
  assert.strictEqual(res2.item, null);
  assert.strictEqual(p2.gold, 50, 'the NOTHING outcome still debits (the gamble)');

  // Insufficient gold: no purchase, no debit.
  const p3 = { gold: 49 };
  const res3 = rollPaidChest(p3, 'BRONZE', seq([]));  // zero rng draws allowed
  assert.strictEqual(res3.ok, false);
  assert.strictEqual(res3.reason, 'gold');
  assert.strictEqual(p3.gold, 49);
  assert.strictEqual(res3.item, null);

  // Unknown tier: refused without touching anything.
  assert.strictEqual(rollPaidChest({ gold: 9999 }, 'DIAMOND', seq([])).ok, false);

  // Better odds at higher tiers: whiff chances strictly improve.
  assert.ok(PAID_CHESTS.GOLD.nothingChance < PAID_CHESTS.SILVER.nothingChance
    && PAID_CHESTS.SILVER.nothingChance < PAID_CHESTS.BRONZE.nothingChance,
    'higher tier = lower nothing chance');
  assert.ok(PAID_CHESTS.GOLD.tierBias > PAID_CHESTS.SILVER.tierBias
    && PAID_CHESTS.SILVER.tierBias >= PAID_CHESTS.BRONZE.tierBias,
    'higher tier = stronger rarity bias');

  // GOLD tier win rolls at bias 3: flip 0.5 (>= 0.10) -> rarity rng 0.0 with
  // bias 3 stays COMMON, + 1 affix pick.
  const p4 = { gold: 500 };
  const res4 = rollPaidChest(p4, 'GOLD', seq([0.5, 0.0, 0.0]));
  assert.strictEqual(res4.item.rarity, 'COMMON');
  assert.strictEqual(p4.gold, 500 - PAID_CHESTS.GOLD.cost);
  console.log('ok: paid chests — debit both ways, gold-gate, tier odds');
}

console.log('LOOT TESTS PASSED');
