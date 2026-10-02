// HORDES — TIER-2(d): CARD PARALLEL/VARIANT SYSTEM (owner: sports-card varieties).
//
// What is pinned here (all through the REAL seams — src/parallels.js pure
// functions, src/main.js openDraft / pick, never a restated copy):
//   1. PARALLEL ROLLS ARE DETERMINISTIC PER SEED: rollParallel on a fresh
//      mulberry32(seed) replays byte-identically, and a real openDraft with a
//      pinned parallelRng + pinned Math.random stamps the same (id, parallel)
//      pairs every time.
//   2. THE REGRESSION GATE — OFF toggle / absent roll = byte-identical offered
//      card to pre-change (deep-equal, seeded): with HORDES_PARALLELS=false the
//      stamped field does not exist and the offer's key set is the quoted
//      PRE-CHANGE key set; with the toggle ON and the roll forced to 'none' the
//      seeded offer row is DEEP-EQUAL to the OFF arm's row (same Math.random
//      stream — the stamp's own rng is a separate stream, so the offer-weight
//      draw order never moves).
//   3. CURSED applies x1.5 AND exactly ONE drawback, on the cited existing
//      surface p.hp (src/entities.js makePlayer) — maxHp/mana/purse/luck and
//      every other stat are untouched by the drawback.
//   4. BLESSED applies x1.25 with NO drawback, and its offer weight is
//      STRICTLY the rarest (table assert + seeded frequency assert).
//   5. THE BASE REGISTRY IS UNTOUCHED: UPGRADES / DRAFT_RARE_UPGRADES /
//      DRAFT_MYTHIC_UPGRADES (id/name/desc), DRAFT_LADDER (whole block),
//      DRAFT_STAT_WEIGHT and RULES.once's rule TEXT are deep-equal to their
//      quoted PRE-CHANGE values (the quote is the freeze — any registry edit
//      goes red here).
//   6. ONE OF EACH behavior is identical with and without a parallel: the
//      taken ledger, the pool exclusion, and the rule's +10%-at-cap
//      compensation all behave the same (the compensation is the RULE's, not
//      the card's — it stays UNSCALED even on a cursed card).
//   7. PARALLEL ROLLS REACH ANY CARD INCLUDING PROTECTED ONES: a rigged
//      stream stamps every offer in a real openDraft — rule_once included —
//      and the stamped rule card's text/role/behavior is unchanged.
// Art coverage for the 5 variants is pinned the same derived way in
// test/test_card_art_expansion.mjs (PARALLEL VARIANTS section — every deck
// card x every parallel, no hardcoded id lists).
//
// Run: node test/test_tier2_parallels.mjs
import assert from 'node:assert';
import { boot, suite } from './_harness.mjs';
import {
  UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES, DRAFT_LADDER,
  CONFIG as C,
} from '../src/config.js';
import { DRAFT_STAT_WEIGHT } from '../src/meta.js';
import { RULES, RULE_CARD_WEIGHT, hasRule, ruleCards } from '../src/rules.js';
import { mulberry32 } from '../src/weather.js';
import { WEAPON_MAX_LEVEL } from '../src/weapons.js';
import {
  PARALLELS, PARALLEL_WEIGHTS, PARALLEL_ORDER, PARALLEL_IDS, CURSED_HP_COST,
  rollParallel, stampOfferParallel, parallelEffectMult, applyScaledNumbers,
  cursedHpDrawback, parallelCardArt, pulsePhase,
  offerScales, rollOfferParallel, COUNT_STATS,
} from '../src/parallels.js';

const s = suite('test_tier2_parallels');

// ===========================================================================
// 5. BASE REGISTRY FREEZE — quoted PRE-CHANGE values. The apply closures'
// behaviour is pinned through the real pick math below (section 3/4), so the
// quote here is the rows' identity + copy + the shared weight constants.
// ===========================================================================
const QUOTED_UPGRADES = [
  { id: 'dmg', name: 'Whetstone', desc: '+25% weapon damage' },
  { id: 'rate', name: 'Quick Hands', desc: '-15% attack cooldown' },
  { id: 'speed', name: 'Light Boots', desc: '+15% move speed' },
  { id: 'pickup', name: 'Gem Magnet', desc: '+30% pickup radius' },
  { id: 'multi', name: 'Split Shot', desc: '+1 projectile per volley' },
  { id: 'hp', name: 'Iron Heart', desc: '+25 max HP and heal 25' },
  { id: 'pierce', name: 'Sharpened Tips', desc: 'Projectiles pierce +1 enemy' },
];
const QUOTED_RARE = [
  { id: 'hp_pct', name: 'Iron Heart', desc: '+25% max HP and heal 25%' },
  { id: 'xp_pct', name: "Scholar's Stone", desc: '+20% XP' },
  { id: 'gold_pct', name: 'Gilded Palm', desc: '+30% purse gold per kill' },
  { id: 'edge', name: 'Crimson Edge', desc: '+3% lifesteal' },
  { id: 'thorns', name: 'Thornmail', desc: '+6 thorns damage on contact' },
];
const QUOTED_MYTHIC = [
  { id: 'second_wind', name: 'Second Wind', desc: 'Revive once at 50% max HP' },
  { id: 'storm_shards', name: 'Storm Shards', desc: 'XP pickups chip nearby enemies' },
  { id: 'full_hand', name: 'Full Hand', desc: '+1 draft offer for the rest of the run' },
  { id: 'magnet_collector', name: 'Magnet Collector',
    desc: 'SKILL [X]: every gem, potion and item on the field sweeps to you · 30s cooldown' },
  { id: 'tempest', name: 'Tempest', desc: 'Chain Zap +1 chain level and hop range (needs Chain Zap)' },
  { id: 'killshot', name: 'Killshot', desc: '+50% crit damage' },
];
const rowIdentity = (rows) => rows.map((u) => ({ id: u.id, name: u.name, desc: u.desc }));

s.check('REGISTRY FREEZE: UPGRADES / RARE / MYTHIC rows deep-equal the quoted pre-change values', () => {
  assert.deepEqual(rowIdentity(UPGRADES), QUOTED_UPGRADES);
  assert.deepEqual(rowIdentity(DRAFT_RARE_UPGRADES), QUOTED_RARE);
  assert.deepEqual(rowIdentity(DRAFT_MYTHIC_UPGRADES), QUOTED_MYTHIC);
});
s.check('REGISTRY FREEZE: DRAFT_LADDER / weight constants / ONE OF EACH rule text unchanged', () => {
  assert.deepEqual(DRAFT_LADDER, {
    RARE_WEIGHT: 0.12,
    MYTHIC_WEIGHT: 0.10,
    CHASE_GATE_CHANCE: 0.1,
    CHASE_COUNT_WEIGHTS: [0.60, 0.25, 0.15],
    LUCK_TIER_BOOST: 0.25,
    SECOND_WIND_HP_FRAC: 0.5,
    SECOND_WIND_INVULN: 2,
    STORM_SHARDS: { RADIUS: 90, CHIP_MIN: 4, CHIP_FRAC: 0.5 },
  });
  assert.equal(DRAFT_STAT_WEIGHT, 0.3);
  assert.equal(RULE_CARD_WEIGHT, 0.10);
  assert.equal(RULES.once.desc,
    'RUN RULE - no stat card twice; weapon picks +1 bonus level; maxed picks +10% damage');
  assert.equal(RULES.hordebait.desc,
    'RUN RULE - every chest is a horde; every chest rolls one rarity higher');
});

// ===========================================================================
// PARALLEL TABLE (offer-weight economics — TUNE-AFTER defaults, stated)
// ===========================================================================
s.check('weights: none dominates; Blessed is STRICTLY the rarest stamp', () => {
  assert.deepEqual(PARALLEL_ORDER, ['none', 'shiny', 'pulse', 'chroma', 'cursed', 'blessed']);
  const w = PARALLEL_WEIGHTS;
  assert.ok(w.none > w.shiny && w.shiny > w.pulse && w.pulse > w.chroma
    && w.chroma > w.cursed && w.cursed > w.blessed,
    `strictly decreasing rarity: ${JSON.stringify(w)}`);
  assert.ok(w.blessed > 0, 'Blessed exists (the owner: "Then we also need a blessed variant")');
  assert.ok(w.cursed > 0, 'Cursed exists (the owner: "a cursed possibility sounds like a fun addition")');
  assert.equal(Object.keys(w).sort().join(','), [...PARALLEL_IDS, 'none'].sort().join(','),
    'PARALLEL_WEIGHTS keys are exactly the registry + none');
});
s.check('gameplay pair: Cursed x1.5 + one flat HP cost; Blessed x1.25 clean; cosmetics x1', () => {
  assert.equal(PARALLELS.cursed.mult, 1.5);
  assert.equal(PARALLELS.blessed.mult, 1.25);
  assert.equal(PARALLELS.shiny.mult, 1);
  assert.equal(PARALLELS.pulse.mult, 1);
  assert.equal(PARALLELS.chroma.mult, 1);
  assert.equal(PARALLELS.cursed.kind, 'GAMEPLAY');
  assert.equal(PARALLELS.blessed.kind, 'GAMEPLAY');
  for (const id of ['shiny', 'pulse', 'chroma']) assert.equal(PARALLELS[id].kind, 'COSMETIC');
  assert.equal(CURSED_HP_COST, 15, 'the shared drawback is ONE flat 15 HP (TUNE-AFTER)');
  assert.equal(parallelEffectMult(null), 1);
  assert.equal(parallelEffectMult(undefined), 1);
  assert.equal(parallelEffectMult('nope'), 1);
});

// ===========================================================================
// 1. ROLL DETERMINISM + STAMP SHAPE (pure)
// ===========================================================================
s.check('rollParallel is deterministic per seed (fresh streams replay byte-identically)', () => {
  const rolls = (seed) => {
    const rng = mulberry32(seed);
    return Array.from({ length: 24 }, () => rollParallel(rng));
  };
  for (const seed of [1, 42, 20260923, 0x9a11]) {
    assert.deepEqual(rolls(seed), rolls(seed), 'seed ' + seed + ' replays');
  }
  const a = rolls(20260923), b = rolls(20260924);
  assert.notDeepEqual(a, b, 'different seeds explore different stamp sequences');
});
s.check('rollParallel: seeded frequency — blessed strictly rarer than cursed, cursed rarer than every cosmetic', () => {
  const counts = { none: 0, shiny: 0, pulse: 0, chroma: 0, cursed: 0, blessed: 0 };
  const rng = mulberry32(20260923);
  const N = 40000;
  for (let i = 0; i < N; i++) counts[rollParallel(rng) || 'none']++;
  assert.ok(counts.blessed < counts.cursed, `blessed ${counts.blessed} < cursed ${counts.cursed}`);
  assert.ok(counts.cursed < counts.chroma, `cursed ${counts.cursed} < chroma ${counts.chroma}`);
  assert.ok(counts.chroma < counts.pulse && counts.pulse < counts.shiny && counts.shiny < counts.none,
    `cosmetics ladder down to none: ${JSON.stringify(counts)}`);
  // Rates track the table (TUNE-AFTER numbers measured, not trusted).
  assert.ok(Math.abs(counts.blessed / N - PARALLEL_WEIGHTS.blessed / 100) < 0.002,
    'blessed rate ~0.5% (got ' + (counts.blessed / N).toFixed(4) + ')');
  assert.ok(Math.abs(counts.cursed / N - PARALLEL_WEIGHTS.cursed / 100) < 0.006,
    'cursed rate ~3% (got ' + (counts.cursed / N).toFixed(4) + ')');
  assert.ok(Math.abs(counts.none / N - PARALLEL_WEIGHTS.none / 100) < 0.015,
    'none rate ~80% (got ' + (counts.none / N).toFixed(4) + ')');
  console.log('  MEASURED per-' + N + ' rolls: ' + JSON.stringify(counts));
});
s.check('stampOfferParallel is additive and an absent roll is IDENTITY (pre-change object)', () => {
  const card = { id: 'dmg', name: 'Whetstone', desc: '+25% weapon damage', apply: () => {} };
  const none = stampOfferParallel(card, rollParallel(() => 0.5));
  assert.equal(none, card, 'absent roll returns the SAME object (identity, no copy, no field)');
  assert.equal('parallel' in none, false);
  const shiny = stampOfferParallel(card, 'shiny');
  assert.notEqual(shiny, card, 'a stamp is a NEW object');
  assert.equal('parallel' in card, false, 'the source card is never mutated (registry rows stay pure)');
  assert.equal(shiny.parallel, 'shiny');
  assert.deepEqual({ ...shiny, parallel: undefined }, { ...card, parallel: undefined },
    'the stamp adds ONE field and nothing else');
  assert.equal(stampOfferParallel(card, 'nope'), card, 'unknown parallel fails safe (no stamp)');
});

// ===========================================================================
// 3/4. EFFECT MATH (pure) — the arithmetic proof
// ===========================================================================
const player = () => ({
  hp: 80, mana: 50,
  stats: { damage: 10, cooldown: 1, speed: 1, pickup: 1, projectiles: 1, pierce: 0, maxHp: 100, maxMana: 100 },
  base: { damage: 10, maxHp: 100 },   // the run's starting stats: percent cards add a share of these
});

s.check('EFFECT MATH: Whetstone +25% at Cursed x1.5 lands x1.375 (the listed 25% scaled to 37.5%)', () => {
  const p = player();
  applyScaledNumbers(UPGRADES[0].apply, p, PARALLELS.cursed.mult);   // dmg: + 25% of starting damage
  assert.equal(p.stats.damage, 10 * 1.375, '10 -> 13.75 exactly');
});
s.check('EFFECT MATH: Whetstone at Blessed x1.25 lands x1.3125 (25% -> 31.25%)', () => {
  const p = player();
  applyScaledNumbers(UPGRADES[0].apply, p, PARALLELS.blessed.mult);
  assert.equal(p.stats.damage, 10 * 1.3125, '10 -> 13.125 exactly');
});
s.check('EFFECT MATH: cosmetic/absent x1 is byte-identical to the raw apply', () => {
  for (const mult of [1, parallelEffectMult('shiny'), parallelEffectMult('pulse'), parallelEffectMult('chroma')]) {
    const raw = player(), scaled = player();
    UPGRADES[0].apply(raw);
    applyScaledNumbers(UPGRADES[0].apply, scaled, mult);
    assert.deepEqual(scaled, raw, 'mult ' + mult + ' === raw apply');
  }
  // The multi-overflow literal path (pick()'s 1.2 branch) holds its byte
  // identity at mult 1 (1 + 0.2 * 1 === 1.2) and scales the LISTED 20%.
  assert.equal(1 + 0.2 * parallelEffectMult(null), 1.2, 'overflow literal identity');
  assert.equal(1 + 0.2 * parallelEffectMult('cursed'), 1.3, 'overflow +30% at x1.5');
  assert.equal(1 + 0.2 * parallelEffectMult('blessed'), 1.25, 'overflow +25% at x1.25');
  // The taper fraction scales the same way (Light Boots listed +15%).
  assert.equal(1 + 0.15 * 1 * parallelEffectMult('cursed'), 1.225, 'taper +22.5% at x1.5');
});
s.check('EFFECT MATH: Iron Heart +25 max HP at Cursed x1.5 is +37.5 max HP and +37.5 heal', () => {
  const p = player();
  const hp = UPGRADES.find((u) => u.id === 'hp');
  applyScaledNumbers(hp.apply, p, PARALLELS.cursed.mult);
  assert.equal(p.stats.maxHp, 137.5, '100 -> 137.5');
  assert.equal(p.hp, 117.5, 'the heal delta (25) scales with it: 80 -> 117.5');
});
s.check('EFFECT MATH: an introduced numeric field (thorns) scales from 0; a boolean flag lands face-value', () => {
  const p = player();
  applyScaledNumbers(DRAFT_RARE_UPGRADES.find((u) => u.id === 'thorns').apply, p, 1.5);
  assert.equal(p.stats.thorns, 9, '+6 thorns at x1.5 is +9');
  const q = player();
  applyScaledNumbers(DRAFT_MYTHIC_UPGRADES.find((u) => u.id === 'second_wind').apply, q, 1.5);
  assert.equal(q.stats.secondWind, true, 'a flag grant has no fractional axis — face value (OWNER-RULING)');
});
s.check('CURSED DRAWBACK: exactly one surface — flat 15 off p.hp (entities.js makePlayer), floored at 1', () => {
  const p = player();
  cursedHpDrawback(p);
  assert.equal(p.hp, 65, '80 - 15');
  assert.equal(p.stats.maxHp, 100, 'maxHp is NOT a drawback surface');
  assert.equal(p.mana, 50, 'mana is NOT a drawback surface');
  p.hp = 10;
  cursedHpDrawback(p);
  assert.equal(p.hp, 1, 'a pick can never kill (floor 1 — OWNER-RULING: lethal picks are a ruling)');
  p.hp = 14;
  cursedHpDrawback(p);
  assert.equal(p.hp, 1, 'the cost is paid to the floor, never past it');
});

// ===========================================================================
// PULSE phase: deterministic hash, NO wall clock (decor-still doctrine)
// ===========================================================================
s.check('PULSE phase is a pure hash of the card id (no clock, no accumulation)', () => {
  assert.equal(pulsePhase('hp'), pulsePhase('hp'), 'stable per card');
  assert.ok(pulsePhase('hp') >= 0 && pulsePhase('hp') < 6, 'inside PULSE phase space');
  assert.notEqual(pulsePhase('hp'), undefined);
  const before = Date.now();
  const p1 = parallelCardArt('hp', 'pulse');
  const after = Date.now();
  const p2 = parallelCardArt('hp', 'pulse');
  assert.deepEqual(p1.grid, p2.grid, 'two derivations are pixel-identical even across a clock tick');
  assert.equal(p1.phase, pulsePhase('hp'), 'the variant carries its hash phase');
  assert.ok(after >= before, 'the test ran in real time — and the art still never read it');
});

// ===========================================================================
// BOOT THE REAL GAME — OFF arm first (the regression gate), then ON arm
// ===========================================================================
// The OFF arm is the pre-parallel offer path: the toggle read at main.js module
// scope beside DRAFT_LADDER_ON. Quoted PRE-CHANGE key sets per offer family —
// an extra field of ANY kind fails the deep-equal below.
const KEYS = {
  weapon: ['apply', 'desc', 'id', 'name', 'weight'],
  stat: ['apply', 'desc', 'id', 'name', 'weight'],
  rare: ['apply', 'desc', 'id', 'name', 'tier', 'weight'],
  mythic: ['apply', 'desc', 'id', 'name', 'tier', 'weight'],
  rule: ['apply', 'desc', 'id', 'name', 'rule', 'weight'],
  skill: ['apply', 'desc', 'id', 'name', 'skill', 'weight'],
  rewrite: ['apply', 'desc', 'id', 'name', 'rewrite', 'weight'],
};
function familyOf(u) {
  if (u.rule) return 'rule';
  if (u.rewrite) return 'rewrite';
  if (u.skill) return 'skill';
  if (u.tier === 'MYTHIC') return 'mythic';
  if (u.tier === 'RARE') return 'rare';
  if (String(u.id).startsWith('wpn_') || String(u.id).startsWith('lvl_')) return 'weapon';
  return 'stat';
}
const offerShape = (u) => ({
  id: u.id, name: u.name, desc: u.desc, weight: u.weight,
  tier: u.tier || null, rule: u.rule || null, skill: u.skill || null, rewrite: u.rewrite || null,
  parallel: u.parallel || null,
  keys: Object.keys(u).sort(),
});

// The OFF arm's seeded rows live here for the ON arm's DEEP-EQUAL below —
// THE regression gate needs both arms in one process.
let offRows = [];

globalThis.HORDES_PARALLELS = false;
const offBoot = await boot({ variant: 'par-off', storage: [['hordes_onboarded', '1']] });
{
  const T = offBoot.T, state = offBoot.state, elements = offBoot.elements;
  assert.equal(T.parallels.on, false, 'the OFF arm booted with the toggle false');
  s.check('OFF arm: seeded offers carry NO parallel field and the PRE-CHANGE key set (deep-equal)', () => {
    T.startRun();
    state.chasePool = {};
    const real = Math.random;
    Math.random = mulberry32(424242);
    try {
      for (let i = 0; i < 12; i++) {
        state.mode = 'playing';
        state.pendingDrafts = 1;
        state.parallelRng = mulberry32(999);   // present but NEVER read when OFF
        T.openDraft();
        const offers = Array.from(elements['ov-cards'].children).map((el) => el._draftOffer);
        assert.ok(offers.length >= 3, 'a draft offers 3+ cards');
        for (const u of offers) {
          assert.equal('parallel' in u, false, u.id + ' has no parallel field when OFF');
          assert.deepEqual(Object.keys(u).sort(), KEYS[familyOf(u)],
            u.id + ' key set is the quoted PRE-CHANGE set (' + familyOf(u) + ')');
          const row = [...QUOTED_UPGRADES, ...QUOTED_RARE, ...QUOTED_MYTHIC]
            .find((q) => q.id === u.id) || null;
          if (row) {
            assert.deepEqual({ id: u.id, name: u.name, desc: u.desc }, row,
              u.id + ' offer content is the quoted registry row');
          }
        }
        offRows.push(...offers.map(offerShape));
      }
    } finally { Math.random = real; }
    assert.ok(offRows.length >= 36, 'the OFF sample is a real sample (' + offRows.length + ' rows)');
  });
}

// ---- ON arm -----------------------------------------------------------------
globalThis.HORDES_PARALLELS = true;
const onBoot = await boot({ variant: 'par-on', storage: [['hordes_onboarded', '1']] });
const T = onBoot.T, state = onBoot.state, elements = onBoot.elements;

// Real openDraft offer rows, fully seeded: the offer-weight draw rides
// Math.random(mulberry32(mathSeed)) and the stamp stream rides
// state.parallelRng(mulberry32(parSeed)) — two streams, one deterministic row.
function seededOffers(mathSeed, parSeed, drafts = 1) {
  T.startRun();
  state.chasePool = {};
  state.weapons = state.weapons.filter((w) => w.type === 'VOLLEY');
  const real = Math.random;
  Math.random = mulberry32(mathSeed);
  const rows = [];
  try {
    for (let i = 0; i < drafts; i++) {
      state.mode = 'playing';
      state.pendingDrafts = 1;
      state.parallelRng = mulberry32(parSeed + i);
      T.openDraft();
      rows.push(...Array.from(elements['ov-cards'].children).map((el) => offerShape(el._draftOffer)));
    }
  } finally { Math.random = real; }
  return rows;
}

s.check('ON arm: this boot has the feature ON (the shipped default)', () => {
  assert.equal(T.parallels.on, true);
});

s.check('REGRESSION GATE: ON + forced-absent roll is DEEP-EQUAL to the OFF arm (byte-identical offers)', () => {
  // Same Math.random seed as the OFF arm -> same offer-weight draw. Every stamp
  // roll lands in the 'none' bucket (stampOfferParallel(..., null) is identity).
  // The deep-equal covers id/name/desc/weight/tier AND the full key set — an
  // absent roll leaves the offered card byte-identical to a pre-change offered
  // card. This is THE gate: ON-none == OFF, row for row.
  const real = Math.random;
  const onRows = [];
  try {
    T.startRun();
    state.chasePool = {};
    Math.random = mulberry32(424242);   // AFTER startRun — same offset as the OFF arm
    for (let i = 0; i < 12; i++) {
      state.mode = 'playing';
      state.pendingDrafts = 1;
      state.parallelRng = () => 0.5;   // forced 'none' every roll
      T.openDraft();
      const offers = Array.from(elements['ov-cards'].children).map((el) => el._draftOffer);
      for (const u of offers) {
        assert.equal(u.parallel, undefined, u.id + ' unfielded under a forced-none roll');
        assert.equal('parallel' in u, false, u.id + ' gained NO field under a forced-none roll');
      }
      onRows.push(...offers.map(offerShape));
    }
  } finally { Math.random = real; }
  assert.deepEqual(onRows, offRows,
    'ON + absent roll is row-for-row DEEP-EQUAL to the OFF arm (the pre-change offer)');
});

s.check('DETERMINISM: parallel rolls per seed — same seeds stamp the same offers, every time', () => {
  const a = seededOffers(13579, 24680, 4);
  const b = seededOffers(13579, 24680, 4);
  assert.deepEqual(a, b, 'same (mathSeed, parSeed) replays the same stamped offers');
  const stampedA = a.filter((r) => r.parallel).map((r) => r.id + ':' + r.parallel);
  assert.ok(stampedA.length > 0, 'the sample actually carries stamps (seeded, not absent)');
  console.log('  MEASURED stamps in 4 seeded drafts: ' + (stampedA.join(' ') || '(none)'));
});

s.check('OFFER INTEGRATION: the stamp rides the offer object + a badge, never the registry', () => {
  const rows = seededOffers(999, 999, 30);
  const stamped = rows.filter((r) => r.parallel);
  assert.ok(stamped.length > 0, 'some offers carry a parallel in 30 seeded drafts');
  for (const r of stamped) {
    assert.ok(PARALLELS[r.parallel], r.parallel + ' is a registry parallel');
    assert.deepEqual(r.keys, [...KEYS[familyOf(r)], 'parallel'].sort(),
      r.id + ' gained EXACTLY the one parallel field');
  }
  // The registry rows are still field-free (the stamp built a copy).
  for (const u of UPGRADES) assert.equal('parallel' in u, false);
  for (const u of DRAFT_RARE_UPGRADES) assert.equal('parallel' in u, false);
  for (const u of DRAFT_MYTHIC_UPGRADES) assert.equal('parallel' in u, false);
  // The rendered card carries the stamp text + the data-parallel marker.
  const real = Math.random;
  Math.random = mulberry32(777);
  try {
    state.parallelRng = () => 0.97;   // every roll: cursed
    state.mode = 'playing';
    state.pendingDrafts = 1;
    T.openDraft();
  } finally { Math.random = real; }
  const kids = Array.from(elements['ov-cards'].children);
  assert.ok(kids.length >= 3);
  // A Cursed roll only sticks on a card whose whole effect scales.
  for (const el of kids) {
    const u = el._draftOffer;
    const html = el.innerHTML || '';
    if (offerScales(u, state.player)) {
      assert.equal(u.parallel, 'cursed', u.id + ': a scalable card takes the rigged stamp');
      assert.ok(html.includes('CURSED - effect x1.5, costs 15 HP'), u.id + ' shows the plain badge text');
    } else {
      assert.equal(u.parallel, undefined, u.id + ': a card that cannot scale is offered plain');
      assert.ok(!html.includes('CURSED'), u.id + ' shows no badge');
    }
    assert.ok(html.includes(u.name), 'the base name/desc strings are untouched by the stamp');
  }
  // Rigged cosmetic stream: every offer takes it, whatever the card.
  Math.random = mulberry32(777);
  try {
    state.parallelRng = () => 0.81;   // every roll: shiny
    state.mode = 'playing';
    state.pendingDrafts = 1;
    T.openDraft();
  } finally { Math.random = real; }
  for (const el of Array.from(elements['ov-cards'].children)) {
    assert.equal(el._draftOffer.parallel, 'shiny');
    assert.ok((el.innerHTML || '').includes('SHINY - cosmetic foil'));
  }
});

s.check('ELIGIBILITY: Cursed/Blessed only stamp cards whose whole effect is scalable numbers', () => {
  T.startRun();
  const p = state.player;
  const by = (id) => [...UPGRADES, ...DRAFT_RARE_UPGRADES, ...DRAFT_MYTHIC_UPGRADES].find((u) => u.id === id);
  for (const id of ['dmg', 'rate', 'speed', 'pickup', 'hp', 'hp_pct', 'xp_pct', 'gold_pct', 'edge', 'thorns', 'killshot']) {
    assert.equal(offerScales(by(id), p), true, id + ' scales');
  }
  for (const id of ['multi', 'pierce', 'full_hand', 'second_wind', 'storm_shards', 'magnet_collector', 'tempest']) {
    assert.equal(offerScales(by(id), p), false, id + ' does not scale (count / flag / skill)');
  }
  assert.equal(offerScales({ id: 'wpn_ORBIT', apply: () => { throw new Error('must not run'); } }, p), false);
  assert.equal(offerScales({ id: 'lvl_VOLLEY_2', apply: () => { throw new Error('must not run'); } }, p), false);
  assert.equal(offerScales(ruleCards(state)[0], p), false, 'a run rule never scales');
  // The probe applies nothing to the real player.
  const snap = JSON.stringify({ hp: p.hp, mana: p.mana, stats: p.stats });
  offerScales(by('hp'), p);
  assert.equal(JSON.stringify({ hp: p.hp, mana: p.mana, stats: p.stats }), snap);
  // rollOfferParallel: one draw either way; gameplay stamps gated.
  for (const [r, id] of [[0.97, 'cursed'], [0.999, 'blessed']]) {
    assert.equal(rollOfferParallel(by('dmg'), p, () => r), id);
    assert.equal(rollOfferParallel(by('multi'), p, () => r), null);
    let draws = 0;
    rollOfferParallel(by('multi'), p, () => { draws++; return r; });
    assert.equal(draws, 1, 'exactly one rng draw per offer');
  }
  assert.equal(rollOfferParallel(by('multi'), p, () => 0.81), 'shiny', 'cosmetics stamp any card');
});

s.check('COUNT STATS never scale: a Blessed/Cursed Split Shot or Sharpened Tips is still +1', () => {
  for (const mult of [1.25, 1.5]) {
    const p = player();
    applyScaledNumbers(UPGRADES.find((u) => u.id === 'multi').apply, p, mult);
    assert.equal(p.stats.projectiles, 2, 'projectiles 1 -> 2 at x' + mult);
    applyScaledNumbers(UPGRADES.find((u) => u.id === 'pierce').apply, p, mult);
    assert.equal(p.stats.pierce, 1, 'pierce 0 -> 1 at x' + mult);
    applyScaledNumbers(DRAFT_MYTHIC_UPGRADES.find((u) => u.id === 'full_hand').apply, p, mult);
    assert.equal(p.stats.draftOffers, 1, 'draft offers +1 at x' + mult);
  }
  assert.ok(COUNT_STATS.has('projectiles') && COUNT_STATS.has('pierce') && COUNT_STATS.has('draftOffers'));
});

s.check('BADGE TEXT is plain: no internal jargon on any parallel', () => {
  for (const d of Object.values(PARALLELS)) {
    assert.ok(!/parallel|hash|phase/i.test(d.blurb), d.id + ': "' + d.blurb + '"');
    assert.ok(d.blurb.length <= 28, d.id + ' blurb is short');
  }
  assert.equal(PARALLELS.pulse.blurb, 'cosmetic shimmer');
});

s.check('AUTO-PICK never takes a Cursed card while another is on offer', () => {
  const plain = (id) => ({ id, name: id });
  const cursed = (id, tier) => ({ id, name: id, tier, parallel: 'cursed' });
  const offers = [cursed('a', 'MYTHIC'), plain('b'), cursed('c')];
  assert.deepEqual(T.night.autoPickable(offers).map((u) => u.id), ['b']);
  assert.equal(T.night.pickIndex(offers), 1, 'night: skips the cursed MYTHIC for the plain card');
  assert.equal(T.night.pickIndex([cursed('a'), { id: 'r', tier: 'RARE' }, { id: 'm', tier: 'MYTHIC' }]), 2);
  assert.equal(T.night.pickIndex([cursed('a'), cursed('b', 'RARE')]), 1, 'all cursed: highest tier still wins');
  assert.equal(T.night.pickIndex([plain('a'), plain('b')]), 0, 'no stamps: first slot, as before');
  // The live AUTO countdown, across the rng range: never the cursed cards.
  for (const r of [0, 0.34, 0.5, 0.67, 0.999]) {
    T.startRun();
    T.setPilotMode('AUTO_ALL');
    const real = Math.random;
    Math.random = mulberry32(4242);
    try {
      state.parallelRng = () => 0.5;   // no stamps from the roll
      state.mode = 'playing';
      state.pendingDrafts = 1;
      T.openDraft();
    } finally { Math.random = real; }
    const els = Array.from(elements['ov-cards'].children);
    // Curse every offer but one, in place (the captured offer objects).
    const keep = els[1]._draftOffer;
    for (const el of els) if (el._draftOffer !== keep) el._draftOffer.parallel = 'cursed';
    T.draftAuto.rng = () => r;
    const c0 = T.draftAuto.count;
    for (let i = 0; i < 60 * 8 && T.draftAuto.count === c0; i++) onBoot.pump(1);
    assert.equal(T.draftAuto.count, c0 + 1, 'the countdown picked');
    assert.equal(T.draftAuto.lastId, keep.id, 'rng ' + r + ': took the one non-cursed card');
  }
  T.draftAuto.rng = Math.random;
});

s.check('CURSED PICK: x1.5 on the listed effect + exactly ONE drawback on p.hp (cited surface)', () => {
  T.startRun();
  const p = state.player;
  p.hp = 80;
  p.stats.maxHp = 100;
  p.stats.damage = 10; p.base = { ...p.base, damage: 10 };
  const purseBefore = state.runPurse;
  const before = JSON.parse(JSON.stringify({ hp: p.hp, mana: p.mana, stats: p.stats }));
  const card = stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'dmg'), weight: 0.3 }, 'cursed');
  state.pendingDrafts = 1;
  T.pickCard(card);
  assert.equal(p.stats.damage, 10 * 1.375, 'Whetstone +25% listed -> +37.5% at Cursed x1.5');
  assert.equal(p.hp, 65, 'the ONE drawback: -15 HP on p.hp (entities.js makePlayer)');
  assert.equal(p.stats.maxHp, 100, 'no second drawback surface (maxHp)');
  assert.equal(p.mana, before.mana, 'no second drawback surface (mana)');
  assert.equal(state.runPurse, purseBefore, 'no second drawback surface (purse/gold)');
  assert.equal(p.stats.pickup, before.stats.pickup, 'the drawback touches ONLY hp');
  assert.equal(p.stats.speed, before.stats.speed, 'the drawback touches ONLY hp');
  assert.equal(p.stats.luck, before.stats.luck, 'the drawback touches ONLY hp');
});

s.check('BLESSED PICK: x1.25, NO drawback at all (hp byte-unchanged)', () => {
  T.startRun();
  const p = state.player;
  p.hp = 80;
  p.stats.maxHp = 100;
  p.stats.damage = 10; p.base = { ...p.base, damage: 10 };
  const hpBefore = p.hp;
  const card = stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'dmg'), weight: 0.3 }, 'blessed');
  state.pendingDrafts = 1;
  T.pickCard(card);
  assert.equal(p.stats.damage, 10 * 1.3125, 'Whetstone +25% listed -> +31.25% at Blessed x1.25');
  assert.equal(p.hp, hpBefore, 'Blessed carries NO drawback');
});

s.check('COSMETIC PICK: base effect byte-unchanged + no drawback (shiny/pulse/chroma)', () => {
  for (const pid of PARALLEL_IDS.filter((id) => PARALLELS[id].kind === 'COSMETIC')) {
    T.startRun();
    const p = state.player;
    p.hp = 80;
    p.stats.maxHp = 100;
    p.stats.damage = 10; p.base = { ...p.base, damage: 10 };
    const card = stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'dmg'), weight: 0.3 }, pid);
    state.pendingDrafts = 1;
    T.pickCard(card);
    assert.equal(p.stats.damage, 12.5, pid + ': +25% is still exactly +25% (byte-unchanged effect)');
    assert.equal(p.hp, 80, pid + ': no drawback');
  }
});

s.check('CURSED taper + overflow branches scale the LISTED numbers (Light Boots / Split Shot)', () => {
  T.startRun();
  const p = state.player;
  p.hp = 80;
  p.stats.speed = 1;
  state.pendingDrafts = 1;
  T.pickCard(stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'speed'), weight: 0.3 }, 'cursed'));
  assert.equal(p.stats.speed, 1.225, 'listed +15% -> +22.5% at x1.5');
  assert.equal(p.hp, 65, 'the shared cursed cost still applies on the taper branch');
  // Overflow multi at the projectile cap: listed +20% damage -> +30% at x1.5.
  T.startRun();
  const q = state.player;
  q.hp = 80;
  q.stats.damage = 10; q.base = { ...q.base, damage: 10 };
  q.stats.projectiles = C.WEAPON.MAX_PROJECTILES;
  state.pendingDrafts = 1;
  T.pickCard(stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'multi'), weight: 0.3 }, 'cursed'));
  assert.equal(q.stats.projectiles, C.WEAPON.MAX_PROJECTILES, 'overflow grants no projectile past the cap');
  assert.equal(q.stats.damage, 13, 'listed +20% -> +30% at Cursed x1.5');
  assert.equal(q.hp, 65, 'the shared cursed cost applies on the overflow branch');
});

s.check('ONE OF EACH: behavior identical with/without a parallel (ledger, pool, compensation)', () => {
  // (a) the taken ledger + pool exclusion ride the same id with a stamp on.
  T.startRun();
  const p = state.player;
  p.rules = p.rules || {};
  p.rules.once = true;
  p.hp = 80;
  p.stats.damage = 10; p.base = { ...p.base, damage: 10 };
  const dmgCard = () => ({ ...UPGRADES.find((u) => u.id === 'dmg'), weight: 0.3 });
  state.pendingDrafts = 1;
  T.pickCard(stampOfferParallel(dmgCard(), 'cursed'));
  assert.ok(hasRule(state, 'once'), 'the rule itself is intact');
  assert.equal(p.takenStats.dmg, 1, 'the ledger recorded the take (stamp or not)');
  const real = Math.random;
  Math.random = mulberry32(5150);
  try {
    for (let i = 0; i < 25; i++) {
      state.mode = 'playing';
      state.pendingDrafts = 1;
      state.parallelRng = () => 0.5;
      T.openDraft();
      const ids = Array.from(elements['ov-cards'].children).map((el) => el._draftOffer.id);
      assert.ok(!ids.includes('dmg'), 'ONE OF EACH still removes the taken stat from the pool');
    }
  } finally { Math.random = real; }
  // (b) the +10%-at-cap compensation is the RULE's — UNSCALED even on a cursed
  //     card (ONE OF EACH behavior identical with/without a parallel).
  for (const pid of [null, 'cursed', 'blessed']) {
    T.startRun();
    const q = state.player;
    q.rules = q.rules || {};
    q.rules.once = true;
    q.stats.damage = 10; q.base = { ...q.base, damage: 10 };
    q.hp = 80;
    state.weapons.forEach((w) => { w.level = WEAPON_MAX_LEVEL; });
    const lvCard = {
      id: 'lvl_VOLLEY_' + WEAPON_MAX_LEVEL,
      name: 'VOLLEY UP', desc: '+10% weapon damage · MAXED',
      apply: () => {},
      weight: 1,
    };
    state.pendingDrafts = 1;
    T.pickCard(pid ? stampOfferParallel(lvCard, pid) : lvCard);
    assert.equal(q.stats.damage, 11,
      'at-cap conversion pays the flat rule rate x1.1 with parallel=' + pid + ' (never scaled)');
  }
  // (c) the rule card's own text/role is untouched by any stamp.
  const [onceCard] = ruleCards({ player: { rules: {} } }).filter((c) => c.rule === 'once');
  assert.equal(onceCard.desc, RULES.once.desc, 'ONE OF EACH rule text is the frozen string');
  const stampedOnce = stampOfferParallel(onceCard, 'cursed');
  assert.equal(stampedOnce.desc, onceCard.desc, 'a stamp never edits the desc');
  assert.equal(stampedOnce.rule, 'once', 'a stamp never edits the role field');
  assert.equal(stampedOnce.apply, onceCard.apply, 'a stamp never edits apply');
});

s.check('PROTECTED ONE OF EACH may parallelize (its role is protected, not its skin)', () => {
  // The real openDraft, every roll forced to Shiny: the rule card appears with
  // the cosmetic stamp ON and its four-front behavior unchanged when taken. A
  // Cursed/Blessed roll never sticks on a rule card (nothing on it scales).
  const real = Math.random;
  let found = null;
  Math.random = mulberry32(20260923);
  try {
    T.startRun();
    state.chasePool = {};
    state.weapons = state.weapons.filter((w) => w.type === 'VOLLEY');
    for (let i = 0; i < 600 && !found; i++) {
      state.mode = 'playing';
      state.pendingDrafts = 1;
      state.parallelRng = () => 0.81;   // every roll lands Shiny
      T.openDraft();
      found = Array.from(elements['ov-cards'].children).map((el) => el._draftOffer)
        .find((u) => u.rule === 'once') || null;
    }
  } finally { Math.random = real; }
  assert.ok(found, 'the ONE OF EACH card was offered within the cap');
  assert.equal(found.parallel, 'shiny', 'and it carried the parallel stamp');
  assert.equal(rollOfferParallel(found, state.player, () => 0.97), null, 'a Cursed roll leaves it plain');
  assert.equal(found.desc, RULES.once.desc, 'its rule text is byte-identical');
  state.pendingDrafts = 1;
  state.player.hp = 50;
  T.pickCard(found);
  assert.ok(hasRule(state, 'once'), 'the rule lands exactly as it always did');
  assert.equal(state.player.hp, 50, 'a cosmetic stamp changes nothing');
  assert.equal(RULES.once.desc,
    'RUN RULE - no stat card twice; weapon picks +1 bonus level; maxed picks +10% damage',
    'the rule TEXT is frozen (four-front protection)');
});

s.check('AUTO-PICK safety: a stamped offer picked through the ONE activation seam applies its stamp', () => {
  T.startRun();
  const p = state.player;
  p.hp = 80;
  p.stats.damage = 10; p.base = { ...p.base, damage: 10 };
  const card = stampOfferParallel({ ...UPGRADES.find((u) => u.id === 'dmg'), weight: 0.3 }, 'blessed');
  state.pendingDrafts = 1;
  // activateDraftCard is pick's ONE-argument seam — auto-pick routes through
  // it (main.js tickDraftAutoPick), so this is the auto-pick path by identity.
  T.pickCard(card);
  assert.equal(p.stats.damage, 13.125, 'the auto-pick path lands the same scaled effect');
});

s.done();
