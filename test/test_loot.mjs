// HORDES — unit tests for src/loot.js (node, no DOM). Deterministic rng stub
// + a seeded PRNG for the statistical weight tests (WAVE-11/2).
// WAVE-11 INTEGRATION (hb1): the luck curve lives in meta.js now — these
// tests import luckDropWeights/BASE_RARITY_WEIGHTS from there (loot.js's old
// local BASE_DROP_WEIGHTS + fallbackLuckDropWeights were deleted).
import assert from 'node:assert';
import {
  RARITIES, RARITY_WEIGHTS,
  AFFIX_POOL, LEGENDARIES, STAT_DEFAULTS,
  pickRarity, rollItem, equipItem, unequipItem, applyAffixes, MAX_EQUIPPED,
  PAID_CHESTS, rollPaidChest,
  RARITY_TIER_SCORE, itemScore, decideEquip,
  FLASH_DROP, FLASH_TRASH_TIERS, flashDropChance, canFlashDrop,
  isFlashEligibleKill, flashTargets, shouldFlashDrop, describeFlash,
} from '../src/loot.js';
import { luckDropWeights, BASE_RARITY_WEIGHTS, LUCK_MAX_LEVEL } from '../src/meta.js';

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1})`);
    return vals[i++];
  };
};

// Seeded PRNG (mulberry32) for the distribution tests.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- rarity weight tables ----------
{
  const sum = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  // OWNER'S LADDER (2026-09-13): the raw shares total 99.92 BY DESIGN. They are
  // not rescaled to 100 because pickRarity normalizes for every consumer, so the
  // ladder is declared ONCE and never re-based (a re-based copy would be a
  // second home for the same numbers).
  assert.ok(Math.abs(sum - 99.92) < 1e-9, `the ladder sums to its declared 99.92 (got ${sum})`);
  // WAVE-11 rebase: RARITY_WEIGHTS IS meta.js BASE_RARITY_WEIGHTS (the shared
  // 4-tier table — the same ladder feeds world drops AND the paid chests).
  assert.strictEqual(RARITY_WEIGHTS, BASE_RARITY_WEIGHTS, 'RARITY_WEIGHTS aliases the meta.js base table');
  assert.deepStrictEqual(BASE_RARITY_WEIGHTS, { COMMON: 98, RARE: 1.7, EPIC: 0.2, LEGENDARY: 0.02 },
    'the shared table IS the owner ladder, rung for rung');

  // Bands are DERIVED from the declared ladder, never hand-copied: each rung is
  // probed just below and just above its own edge, so a retune cannot pass by
  // leaving a stale literal behind.
  const T = Object.values(BASE_RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  const edge = (i) => RARITIES.slice(0, i).reduce((s, r) => s + BASE_RARITY_WEIGHTS[r], 0) / T;
  for (let i = 1; i < RARITIES.length; i++) {
    assert.strictEqual(pickRarity(seq([edge(i) - 1e-6])), RARITIES[i - 1],
      `just below the ${RARITIES[i]} edge is still ${RARITIES[i - 1]}`);
    assert.strictEqual(pickRarity(seq([edge(i) + 1e-6])), RARITIES[i],
      `just above the ${RARITIES[i]} edge is ${RARITIES[i]}`);
  }
  assert.strictEqual(pickRarity(seq([0.9999999])), 'LEGENDARY',
    'LEGENDARY is rollable at max rng on the shared table');

  // tierBias pushes up-tier: the SAME roll value lands rarer with bias.
  assert.strictEqual(pickRarity(seq([0.95]), 0), 'COMMON', 'no bias: 0.95 lands COMMON on a 98% ladder');
  assert.strictEqual(pickRarity(seq([0.95]), 3), 'RARE', 'bias 3: the same roll lands RARE');
  const biasedEdge = (bias, i) => {
    const w = RARITIES.map((r, k) => BASE_RARITY_WEIGHTS[r] * (1 + bias * k));
    const tot = w.reduce((a, b) => a + b, 0);
    return w.slice(0, i).reduce((a, b) => a + b, 0) / tot;
  };
  for (const bias of [1.5, 3]) {
    for (let i = 1; i < RARITIES.length; i++) {
      assert.strictEqual(pickRarity(seq([biasedEdge(bias, i) + 1e-6]), bias), RARITIES[i],
        `bias ${bias}: just above the ${RARITIES[i]} edge is ${RARITIES[i]}`);
    }
  }
  console.log('ok: owner ladder table (meta.js), derived bands + tierBias shift correct');
}

  // The band order edge()/biasedEdge() derive from IS the table's own key order.
  assert.deepStrictEqual(Object.keys(BASE_RARITY_WEIGHTS), RARITIES,
    'the ladder table declares the rarities in RARITIES order');

  // ---------- luck curve (meta.js luckDropWeights — hb2's contract) ---------
{
  const lo = luckDropWeights(0), hi = luckDropWeights(LUCK_MAX_LEVEL);
  assert.deepStrictEqual(lo, { ...BASE_RARITY_WEIGHTS }, 'luck 0 == base table');
  assert.ok(hi.COMMON < lo.COMMON, 'luck shifts COMMON weight down');
  assert.ok(hi.RARE > lo.RARE && hi.EPIC > lo.EPIC && hi.LEGENDARY > lo.LEGENDARY,
    'luck shifts RARE/EPIC/LEGENDARY up');
  // Weights NEED NOT sum to 100 (pickRarity normalizes) — only monotone
  // movement matters; at luck 5 the total is ~61.1 on the owner's ladder.
  assert.deepStrictEqual(luckDropWeights(99), hi, `luck clamps at LUCK_MAX_LEVEL (${LUCK_MAX_LEVEL})`);
  assert.deepStrictEqual(luckDropWeights(-5), lo, 'luck clamps at 0');
  assert.strictEqual(LUCK_MAX_LEVEL, 5);
  console.log('ok: meta.js luckDropWeights — luck 0 == base, monotone, clamped at 5');
}

// ---------- weights drive the rarity distribution (seeded) ---------------
{
  // N raised from 30k: at a 0.02% top rung a 30k sample expects 6 legendaries,
  // which is too few to distinguish the ladder from a neighbouring one.
  const N = 200000;
  const tally = (weights) => {
    const rng = mulberry32(0xC0FFEE);
    const t = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (let i = 0; i < N; i++) t[rollItem(rng, 0, weights).rarity]++;
    return t;
  };
  const share = (t, r) => t[r] / N;
  // 4-sigma band per rung against the ladder's own share. A relative band, not
  // a fixed epsilon: 0.0002 cannot be checked with a tolerance sized for 0.98.
  const within = (t, weights, label) => {
    const tot = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const r of RARITIES) {
      const want = weights[r] / tot;
      const sig = 4 * Math.sqrt(want * (1 - want) / N);
      assert.ok(Math.abs(share(t, r) - want) < sig,
        `${label} ${r}: measured ${share(t, r).toFixed(5)} vs ladder ${want.toFixed(5)} (4-sigma ${sig.toFixed(5)})`);
    }
  };
  const base = tally(BASE_RARITY_WEIGHTS);
  within(base, BASE_RARITY_WEIGHTS, 'luck 0');

  const hi = luckDropWeights(5);
  const lucky = tally(hi);
  within(lucky, hi, `luck ${LUCK_MAX_LEVEL}`);   // ~94.7/4.45/0.74/0.15 normalized

  // Direction, plus the point of the raised taper: at max Fortune the TOP rung's
  // share must multiply enough to actually UNLOCK the tier, not merely nudge a
  // weight (the old 0.35 taper lifted the weight 2.75x and the tier stayed a
  // certainty-by-volume instead of a reward).
  assert.ok(share(lucky, 'COMMON') < share(base, 'COMMON'), 'luck lowers the COMMON share');
  assert.ok(share(lucky, 'EPIC') > share(base, 'EPIC') && share(lucky, 'LEGENDARY') > share(base, 'LEGENDARY'),
    'luck raises the EPIC and LEGENDARY shares');
  const baseShare = BASE_RARITY_WEIGHTS.LEGENDARY /
    Object.values(BASE_RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  const gain = share(lucky, 'LEGENDARY') / baseShare;
  assert.ok(gain > 5, `max Fortune multiplies the top-rung share by >5x (measured ${gain.toFixed(2)}x)`);
  console.log(`ok: seeded distribution matches the owner ladder (luck 0) and its luck-${LUCK_MAX_LEVEL} shift ` +
    `(top rung x${gain.toFixed(2)})`);
}

// ---------- rollItem: counts, names, affix math ----------
{
  // COMMON: 1 rarity roll + 1 affix pick (0.0 lands in the COMMON rung, which
  // the owner's ladder holds to 98.08%).
  const c = rollItem(seq([0.0, 0.0]));
  assert.strictEqual(c.rarity, 'COMMON');
  assert.strictEqual(c.affixes.length, 1);
  assert.ok(c.name.startsWith('Worn '), 'common name uses the Worn prefix');

  // RARE (0.99 -> 98.92 of 99.92, just inside the 1.7-wide rung): 1 + 2 picks,
  // distinct affixes, 1.5x.
  const r = rollItem(seq([0.99, 0.0, 0.0]));
  assert.strictEqual(r.rarity, 'RARE');
  assert.strictEqual(r.affixes.length, 2);
  assert.notStrictEqual(r.affixes[0].id, r.affixes[1].id, 'affixes are distinct');
  const def = AFFIX_POOL.find(a => a.id === r.affixes[0].id);
  assert.ok(Math.abs(r.affixes[0].magnitude - def.base * 1.5) < 1e-12,
    'rare magnitude = base * 1.5');

  // EPIC (0.9985 -> 99.77, inside the 0.2-wide rung): 3 affixes at 2.2x.
  const e = rollItem(seq([0.9985, 0.0, 0.0, 0.0]));
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
  // Legendary roll on the shared table (0.9999 -> the 0.02% top rung), slot rng
  // 0.5 -> index 2 (BOOTS).
  const l = rollItem(seq([0.9999, 0.5]), 0, RARITY_WEIGHTS);
  assert.strictEqual(l.rarity, 'LEGENDARY');
  assert.strictEqual(l.slot, 'BOOTS');
  assert.strictEqual(l.name, LEGENDARIES.BOOTS.name, 'legendary uses its fixed name');
  // Deep copy: mutating the rolled affixes must not corrupt the table.
  l.affixes[0].magnitude = 999;
  assert.strictEqual(LEGENDARIES.BOOTS.affixes[0].magnitude !== 999, true,
    'rolled legendary is a deep copy');
  console.log('ok: legendaries — 4 named uniques, fixed affixes, deep-copied');
}

// ---------- itemScore: rarity tier + normalized affix magnitudes ---------
{
  assert.strictEqual(itemScore(null), 0, 'null item scores 0');
  assert.ok(RARITY_TIER_SCORE.COMMON < RARITY_TIER_SCORE.RARE
    && RARITY_TIER_SCORE.RARE < RARITY_TIER_SCORE.EPIC
    && RARITY_TIER_SCORE.EPIC < RARITY_TIER_SCORE.LEGENDARY,
    'tier score components are strictly ordered');
  // Normalization: one affix at exactly base scale contributes 1, whatever
  // the field's raw magnitude scale (+0.04 crit == +3 thorns == +1).
  const critOne = { id: 'a', rarity: 'COMMON', affixes: [{ id: 'crit', field: 'crit', magnitude: 0.04 }] };
  const thornOne = { id: 'b', rarity: 'COMMON', affixes: [{ id: 'thorns', field: 'thorns', magnitude: 3 }] };
  assert.ok(Math.abs(itemScore(critOne) - itemScore(thornOne)) < 1e-12,
    'affix contribution is normalized by pool base');

  // Tier ordering via rolled items (same rng per tier): C < R < E < L. Each
  // value is chosen inside its own rung of the owner's ladder.
  const rolls = {
    COMMON: rollItem(seq([0.0, 0.0]), 0, RARITY_WEIGHTS),
    RARE: rollItem(seq([0.99, 0.0, 0.0]), 0, RARITY_WEIGHTS),
    EPIC: rollItem(seq([0.9985, 0.0, 0.0, 0.0]), 0, RARITY_WEIGHTS),
    LEGENDARY: rollItem(seq([0.9999, 0.0]), 0, RARITY_WEIGHTS),
  };
  assert.ok(itemScore(rolls.COMMON) < itemScore(rolls.RARE), 'COMMON < RARE');
  assert.ok(itemScore(rolls.RARE) < itemScore(rolls.EPIC), 'RARE < EPIC');
  assert.ok(itemScore(rolls.EPIC) < itemScore(rolls.LEGENDARY), 'EPIC < LEGENDARY');

  // Within a tier, more affixes at the same scale scores higher: EPIC (3
  // affixes) vs a hand-built EPIC with 1 affix.
  const light = { id: 'z', rarity: 'EPIC', affixes: [{ id: 'crit', field: 'crit', magnitude: 0.088 }] };
  assert.ok(itemScore(rolls.EPIC) > itemScore(light), '3 affixes > 1 affix at same tier/scale');

  // Tier gaps dominate raw affix noise: an EPIC with a weak affix still
  // beats any COMMON.
  assert.ok(itemScore(light) > itemScore(rolls.RARE), 'tier component dominates within-tier noise');
  console.log('ok: itemScore — normalized affixes + tier component, strict ordering');
}

// ---------- decideEquip: BEST-CASE EQUIP policy (PURE) --------------------
{
  const mk = (id, rarity, mag) => ({
    id, rarity, affixes: [{ id: 'crit', field: 'crit', magnitude: mag }],
  });
  // Free slot: always EQUIP, slot = items.length.
  assert.deepStrictEqual(decideEquip([], mk('d', 'COMMON', 0.04)), { action: 'EQUIP', slot: 0 });
  const two = [mk('a', 'RARE', 0.06), mk('b', 'EPIC', 0.088)];
  assert.deepStrictEqual(decideEquip(two, mk('d', 'COMMON', 0.04)), { action: 'EQUIP', slot: 2 },
    'even a junk drop EQUIPs into an empty slot');

  // Full belt: weakest at a known index.
  const belt = [mk('a', 'RARE', 0.06), mk('b', 'COMMON', 0.04), mk('c', 'EPIC', 0.088), mk('e', 'COMMON', 0.05)];
  // scores: RARE 10+1.5=11.5, C 1+1=2, E 20+2.2=22.2, C 1+1.25=2.25 -> weakest idx 1.
  assert.deepStrictEqual(decideEquip(belt, mk('d', 'RARE', 0.088)), { action: 'REPLACE', slot: 1 },
    'strictly better drop REPLACES the weakest equipped');
  assert.strictEqual(belt[1].id, 'b');

  // STRICTLY: equal score -> IGNORE (no equal-swap churn).
  const equalDrop = mk('d', 'COMMON', 0.04);   // same score as 'b' (2)
  assert.deepStrictEqual(decideEquip(belt, equalDrop), { action: 'IGNORE', slot: null },
    'equal-score drop is left on the ground');
  // Downgrade -> IGNORE.
  assert.deepStrictEqual(decideEquip(belt, mk('d', 'COMMON', 0.02)), { action: 'IGNORE', slot: null },
    'worse drop is left on the ground');

  // PURE: no mutation across every branch.
  const snapshot = JSON.stringify(belt);
  decideEquip(belt, mk('d', 'LEGENDARY', 1));
  decideEquip(belt, equalDrop);
  assert.strictEqual(JSON.stringify(belt), snapshot, 'decideEquip never mutates the belt');

  // Bad input.
  assert.deepStrictEqual(decideEquip(null, mk('d', 'COMMON', 0.04)), { action: 'IGNORE', slot: null });
  assert.deepStrictEqual(decideEquip(belt, null), { action: 'IGNORE', slot: null });

  // 4-slot cap preserved: equipItem still refuses past MAX_EQUIPPED, and a
  // REPLACE decision never grows the belt beyond it.
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
  console.log('ok: decideEquip — EQUIP/REPLACE/IGNORE strict-better policy, pure, cap intact');
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

// ---------- PAID CHESTS: debit + gamble both ways ----------
{
  // Win path: BRONZE, rng order = nothing-flip (0.50 >= 0.40 -> item), then
  // rollItem draws on the CHEST table.
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

  // Chests can still roll LEGENDARY (the shared ladder, NOT a reduced
  // world-drop-only table): bias 3 on the owner's ladder gives GOLD weights
  // C98 / R6.8 / E1.4 / L0.2 (total 106.4), so the TOP rung is the last
  // 0.2/106.4 = 0.188% of the roll. rng 0.999 -> 106.29 -> LEGENDARY,
  // slot rng 0.0 -> WEAPON.
  //
  // MEASURED CONSEQUENCE, reported not hidden: applying the owner's ladder to
  // the shared table also drops the PAID chest's top rung from 10.9% to 0.188%
  // at GOLD, because tierBias multiplies the (now tiny) base weights. Whether
  // the paid tiers want their own bias retune is an OPEN TUNING DECISION for
  // the owner - the assertion below only pins that the rung stays reachable.
  const p4 = { gold: 500 };
  const res4 = rollPaidChest(p4, 'GOLD', seq([0.5, 0.999, 0.0]));
  assert.strictEqual(res4.item.rarity, 'LEGENDARY', 'paid chests keep the 4-tier ladder, top rung reachable');
  assert.strictEqual(res4.item.slot, 'WEAPON');
  assert.strictEqual(p4.gold, 500 - PAID_CHESTS.GOLD.cost);
  {
    // Reachability, all three tiers, derived from the ladder rather than pinned:
    // the highest rng that still lands LEGENDARY must exist below 1 for each.
    const band = (bias) => {
      const w = RARITIES.map((r, k) => BASE_RARITY_WEIGHTS[r] * (1 + bias * k));
      const tot = w.reduce((a, b) => a + b, 0);
      return 1 - w[RARITIES.length - 1] / tot;
    };
    for (const [tier, def] of Object.entries(PAID_CHESTS)) {
      const edge = band(def.tierBias);
      assert.ok(edge < 1, `${tier}: the top rung occupies a non-empty band (starts at ${edge.toFixed(4)})`);
      const p = { gold: 9999 };
      const r = rollPaidChest(p, tier, seq([0.5, Math.min(0.9999999, (edge + 1) / 2), 0.0]));
      assert.strictEqual(r.item.rarity, 'LEGENDARY', `${tier} can still roll its top rung`);
    }
  }
  console.log('ok: paid chests — debit both ways, gold-gate, tier odds, legendary intact');
}

// ---------- FLASH DROPS ----------------------------------------------------
{
  // Chance curve: base ~0.8%, luck-scaled, hard-capped.
  assert.strictEqual(flashDropChance(0), FLASH_DROP.baseChance);
  assert.strictEqual(FLASH_DROP.baseChance, 0.008, 'base chance ~0.8%');
  assert.ok(flashDropChance(5) > flashDropChance(0), 'luck raises the flash chance');
  assert.ok(flashDropChance(50) > flashDropChance(5), 'more luck, more chance');
  assert.strictEqual(flashDropChance(10000), FLASH_DROP.chanceCap, 'hard cap holds');
  assert.strictEqual(flashDropChance(-3), flashDropChance(0), 'negative luck clamps');
  // Cooldown guard: once per ~45s.
  assert.strictEqual(FLASH_DROP.cooldownMs, 45000);
  assert.strictEqual(canFlashDrop(100000, null), true, 'never flashed -> allowed');
  assert.strictEqual(canFlashDrop(100000, 55001), false, '44999ms since last -> blocked');
  assert.strictEqual(canFlashDrop(100000, 55000), true, '45000ms since last -> allowed');
  console.log('ok: flash chance curve + 45s cooldown guard');
}

{
  // Eligibility: plain trash only.
  assert.strictEqual(isFlashEligibleKill({ typeId: 'SWARMER' }), true);
  assert.strictEqual(isFlashEligibleKill({ typeId: 'CHASER' }), true);
  assert.strictEqual(isFlashEligibleKill({ typeId: 'BRUTE' }), false, 'typed beyond trash');
  assert.strictEqual(isFlashEligibleKill({ typeId: 'SPITTER' }), false);
  assert.strictEqual(isFlashEligibleKill({ typeId: 'COLOSSUS' }), false, 'mini-boss tier');
  assert.strictEqual(isFlashEligibleKill({ typeId: 'CHASER', elite: true }), false, 'elites excluded');
  assert.strictEqual(isFlashEligibleKill({ typeId: 'SWARMER', elite: true }), false);
  assert.strictEqual(isFlashEligibleKill({ typeId: 'CHASER', isBoss: true }), false, 'bosses excluded');
  assert.strictEqual(isFlashEligibleKill({ typeId: 'SWARMER', bossId: 'PYRAXIS' }), false);
  assert.strictEqual(isFlashEligibleKill(null), false);
  console.log('ok: flash eligibility — CHASER/SWARMER class only, no elite/boss/typed');
}

{
  // flashTargets: ALL enemies of the WEAKEST trash tier present.
  const chaser1 = { id: 'c1', typeId: 'CHASER' };
  const chaser2 = { id: 'c2', typeId: 'CHASER' };
  const sw1 = { id: 's1', typeId: 'SWARMER' };
  const sw2 = { id: 's2', typeId: 'SWARMER' };
  const field = [
    chaser1, sw1,
    { id: 'se1', typeId: 'SWARMER', elite: true },   // elite swarmer: untouched
    { id: 'b1', typeId: 'BRUTE' },                    // typed beyond trash
    { id: 'col', typeId: 'COLOSSUS' },
    { id: 'bo', typeId: 'SWARMER', isBoss: true },
    sw2, chaser2,
  ];
  const victims = flashTargets(field);
  assert.deepStrictEqual(victims.map(v => v.id), ['s1', 's2'],
    'kills every SWARMER (weakest tier present), nothing else');
  // Chasers-only field -> chasers are then the weakest tier present.
  assert.deepStrictEqual(flashTargets([chaser1, chaser2]).map(v => v.id), ['c1', 'c2']);
  // No trash on the field -> empty list (flash would whiff visually).
  assert.deepStrictEqual(flashTargets([{ id: 'b', typeId: 'BRUTE' }]), []);
  assert.deepStrictEqual(flashTargets([]), []);
  assert.deepStrictEqual(flashTargets(null), []);
  // PURE: the input array is untouched.
  const before = JSON.stringify(field.map(e => e.id));
  flashTargets(field);
  assert.strictEqual(JSON.stringify(field.map(e => e.id)), before, 'flashTargets never mutates');
  // Order contract for hb1: FLASH_TRASH_TIERS is weakest-first.
  assert.deepStrictEqual(FLASH_TRASH_TIERS, ['SWARMER', 'CHASER']);
  console.log('ok: flashTargets — weakest trash tier only, bosses/elites untouched');
}

{
  // shouldFlashDrop: eligibility -> cooldown -> rng, zero rng on early-out.
  const swarmer = { id: 's1', typeId: 'SWARMER' };
  assert.strictEqual(shouldFlashDrop({ typeId: 'BRUTE' }, 0, 100000, null, seq([])), false,
    'ineligible kill: no rng consumed');
  assert.strictEqual(shouldFlashDrop(swarmer, 0, 100000, 90000, seq([])), false,
    'cooldown-blocked: no rng consumed');
  assert.strictEqual(shouldFlashDrop(swarmer, 0, 100000, null, seq([0.0])), true,
    'eligible + off cooldown + max roll -> FLASH');
  assert.strictEqual(shouldFlashDrop(swarmer, 0, 100000, null, seq([0.99999])), false,
    'eligible but the roll misses');
  assert.strictEqual(shouldFlashDrop(swarmer, 5, 100000, 55000, seq([0.013])), true,
    'luck-scaled chance: rng 0.013 < chance(5) = 0.014');
  console.log('ok: shouldFlashDrop roll order + guard composition');
}

{
  // HUD/toast copy.
  const s = describeFlash();
  assert.strictEqual(typeof s, 'string');
  assert.ok(s.includes('Swarmer'), 'default copy names the swarmer wipe');
  assert.ok(describeFlash('CHASER').includes('Chaser'), 'tier-specific copy');
  assert.ok(describeFlash('BRUTE').length > 10, 'unknown tier still gets copy');
  console.log('ok: describeFlash toast copy');
}

console.log('LOOT TESTS PASSED');
