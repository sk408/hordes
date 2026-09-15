// HORDES — W7b DRAFT DIVERGENCE: the rarity ladder, the two 1/10 mythic chase
// cards, the Fortune luck extension, and Full Hand (docs/briefs/W7B_DRAFT_DIVERGENCE.md).
//
// What is pinned here (all through the REAL seams — src/main.js openDraft /
// pick / die / the gem-pickup loop / purseCredit — never a restated copy):
//   1. the ladder weight model (meta.js draftLadderWeight): luck 0 = the base
//      exactly, Fortune raises RARE and MYTHIC weight at every level;
//   2. the mythic chase GATE: measured across a seeded run sample through the
//      REAL startRun — each of Second Wind / Storm Shards is in the run's pool
//      at ~0.1 of runs (owner spec), both at ~0.01;
//   3. pool composition through the REAL openDraft: rares ride at LOW weight
//      (each individually rarer than a common stat card — no dilution), a
//      gated mythic offers, an ungated one never does;
//   4. the two chasers WORK: Second Wind revives once at 50% max HP through
//      the ONE death seam; Storm Shards chips enemies on XP pickup through the
//      ONE gem-pickup loop;
//   5. the rare tier WORKS: Iron Heart +25%, Scholar's Stone, Gilded Palm
//      (through the REAL purseCredit), Crimson Edge;
//   6. Full Hand: +1 draft offer through the REAL openDraft;
//   7. a mythic leaves the pool for the run once taken.
// L3 (the dead third Split Shot) is NOT re-pinned here: it landed in WAVE-18
// (main.js volleyAtProjCap, overflow -> +20% damage) and is pinned by
// test/smoke.mjs's "L3 overflow multi" block, which this suite runs.
import assert from 'node:assert';
import { boot, suite } from './_harness.mjs';
import { DRAFT_LADDER, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES, CONFIG as C } from '../src/config.js';
import { draftLadderWeight, LUCK_MAX_LEVEL } from '../src/meta.js';
import { mulberry32 } from '../src/weather.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

const s = suite('test_w7b_draft_ladder');

// ---- 1. the weight model (pure) ---------------------------------------------
s.check('luck 0 is the base weight exactly (both tiers)', () => {
  assert.equal(draftLadderWeight('hp_pct', 'RARE', 0), DRAFT_LADDER.RARE_WEIGHT);
  assert.equal(draftLadderWeight('second_wind', 'MYTHIC', 0), DRAFT_LADDER.MYTHIC_WEIGHT);
});
s.check('Fortune raises RARE and MYTHIC weight at EVERY level (the extension)', () => {
  for (const tier of ['RARE', 'MYTHIC']) {
    for (let L = 0; L < LUCK_MAX_LEVEL; L++) {
      assert.ok(draftLadderWeight('x', tier, L + 1) > draftLadderWeight('x', tier, L),
        `${tier} ${L}->${L + 1}`);
    }
  }
  assert.equal(draftLadderWeight('x', 'RARE', 99), draftLadderWeight('x', 'RARE', LUCK_MAX_LEVEL),
    'luck clamps at LUCK_MAX_LEVEL');
});
s.check('chase cards are LOW-WEIGHT: rarer than a common stat card, no dilution', () => {
  assert.ok(DRAFT_LADDER.RARE_WEIGHT < 0.3, 'a rare weighs less than the 0.3 common family');
  assert.ok(DRAFT_LADDER.MYTHIC_WEIGHT < DRAFT_LADDER.RARE_WEIGHT, 'mythic is the rarest ride');
  assert.equal(DRAFT_LADDER.CHASE_GATE_CHANCE, 0.1, 'the owner spec: the chase EVENT gate is 1/10 of runs');
  assert.deepEqual(DRAFT_LADDER.CHASE_COUNT_WEIGHTS, [0.60, 0.25, 0.15], 'the owner spec: 60/25/15 on 1/2/3 jokers');
});

// ---- boot the REAL game ------------------------------------------------------
const { T, state, elements, pump, key } = await boot({ storage: [['hordes_onboarded', '1']] });

s.check('this process booted with the ladder ON (the A/B BEFORE arm sets it false)', () => {
  assert.equal(T.ladderOn, true);
});

// ---- 2. the chase gate, measured across a seeded run sample ------------------
// The owner's TWO-STAGE gate (2026-09-14): a 10% EVENT roll ("this run has a
// joker"), then 60/25/15 on the count, then a uniform which-draw. So the EVENT
// rate is ~0.1, the conditional count is 60/25/15, and each SPECIFIC mythic is
// ~0.0517 of runs (0.1 x [0.6/3 + 0.25x2/3 + 0.15]) — rarer than the event, by
// design (per-card independent rolls had stacked to ~27% any-mythic). The gate
// rides the run's Math.random stream, so seeding per run IS the run-seed.
const RUNS = 1200;
{
  let event = 0, one = 0, two = 0, three = 0, wind = 0, storm = 0, hand = 0;
  const real = Math.random;
  try {
    for (let i = 0; i < RUNS; i++) {
      Math.random = mulberry32(20260914 + i);
      T.startRun();
      const g = state.chasePool || {};
      const n = (g.second_wind ? 1 : 0) + (g.storm_shards ? 1 : 0) + (g.full_hand ? 1 : 0);
      if (n > 0) event++;
      if (n === 1) one++; else if (n === 2) two++; else if (n === 3) three++;
      if (g.second_wind) wind++;
      if (g.storm_shards) storm++;
      if (g.full_hand) hand++;
    }
  } finally { Math.random = real; }
  const pEvent = event / RUNS;
  const pOne = one / Math.max(1, event), pTwo = two / Math.max(1, event), pThree = three / Math.max(1, event);
  const pWind = wind / RUNS, pStorm = storm / RUNS, pHand = hand / RUNS;
  // Event sigma at p=0.1, N=1200 is ~0.0087; count-share sigma over ~120 joker-runs is ~0.045.
  assert.ok(Math.abs(pEvent - 0.1) < 0.03, `the chase EVENT rate ${pEvent} ~ 0.1 (the two-stage gate)`);
  assert.ok(Math.abs(pOne - 0.60) < 0.14, `count=1 share ${pOne} ~ 0.60 of joker-runs`);
  assert.ok(Math.abs(pTwo - 0.25) < 0.14, `count=2 share ${pTwo} ~ 0.25 of joker-runs`);
  assert.ok(Math.abs(pThree - 0.15) < 0.14, `count=3 share ${pThree} ~ 0.15 of joker-runs`);
  assert.ok(Math.abs(pWind - 0.0517) < 0.03, `per-card rate ${pWind} ~ 0.0517 (each mythic is rarer than the 0.1 event)`);
  assert.ok(pStorm < 0.1 && pHand < 0.1, `no mythic reaches the old per-card 0.1 (storm ${pStorm}, hand ${pHand})`);
  console.log(`  MEASURED two-stage chase gate over ${RUNS} seeded runs: event ${pEvent.toFixed(4)}, ` +
    `count 1/2/3 = ${pOne.toFixed(3)}/${pTwo.toFixed(3)}/${pThree.toFixed(3)} of joker-runs, ` +
    `per-card wind ${pWind.toFixed(4)}, storm ${pStorm.toFixed(4)}, hand ${pHand.toFixed(4)}`);
}
console.log('  ok - the two-stage chase gate (10% event, 60/25/15 count) is measured through the REAL startRun');

// ---- 3. pool composition through the REAL openDraft --------------------------
function draftOfferRates(draws, gate) {
  T.startRun();
  state.chasePool = gate;   // startRun rerolls the gate; force it AFTER
  state.weapons = state.weapons.filter(w => w.type === 'VOLLEY');   // a stable, small weapon side
  const real = Math.random;
  Math.random = mulberry32(9876);
  const seen = { rare: 0, mythic: 0, scholar: 0, boots: 0, wind: 0 };
  try {
    for (let i = 0; i < draws; i++) {
      T.openDraft();
      const cards = Array.from(elements['ov-cards'].children).map(c => c.innerHTML || '');
      if (cards.some(h => h.includes('>RARE<'))) seen.rare++;
      if (cards.some(h => h.includes('>MYTHIC<'))) seen.mythic++;
      if (cards.some(h => h.includes("Scholar's Stone"))) seen.scholar++;
      if (cards.some(h => h.includes('Light Boots'))) seen.boots++;
      if (cards.some(h => h.includes('Second Wind'))) seen.wind++;
      state.mode = 'playing';   // openDraft sets 'draft'; reopen without picking
    }
  } finally { Math.random = real; }
  return seen;
}

{
  const DRAWS = 3000;
  const on = draftOfferRates(DRAWS, { second_wind: true, storm_shards: true, full_hand: true });
  assert.ok(on.rare > 0, 'a RARE-tier card is offered at all');
  assert.ok(on.mythic > 0, 'a gated MYTHIC is offered at all');
  assert.ok(on.scholar > 0 && on.scholar < on.boots,
    `each rare is individually rarer than a common (Scholar ${on.scholar} vs Boots ${on.boots} in ${DRAWS})`);
  assert.ok(on.wind > 0, 'Second Wind offers when gated');
  console.log(`  MEASURED per-${DRAWS}-drafts (all mythics gated): RARE badge ${(on.rare / DRAWS).toFixed(3)}, ` +
    `MYTHIC badge ${(on.mythic / DRAWS).toFixed(3)}, Scholar ${(on.scholar / DRAWS).toFixed(4)} vs Boots ${(on.boots / DRAWS).toFixed(4)}`);

  state.chasePool = {};
  const off = draftOfferRates(DRAWS, {});
  assert.equal(off.mythic, 0, 'an ungated mythic is NEVER offered');
  assert.equal(off.wind, 0, 'Second Wind absent without the gate roll');
  console.log('  ok - pool: rares low-weight, mythics only behind the run gate');
}

s.check('the tier badge is ON the card with the rarity.js tell colours', () => {
  state.chasePool = { second_wind: true, storm_shards: true, full_hand: true };
  T.openDraft();
  const html = Array.from(elements['ov-cards'].children).map(c => c.innerHTML || '').join('\n');
  state.mode = 'playing';
  // Force-render one of each tier directly through the pool: draw until a
  // badge of each kind has rendered (the rates above prove they do).
  const real = Math.random;
  Math.random = mulberry32(4242);
  let rareSeen = false, mythicSeen = false;
  try {
    for (let i = 0; i < 400 && !(rareSeen && mythicSeen); i++) {
      T.openDraft();
      for (const c of Array.from(elements['ov-cards'].children)) {
        const h = c.innerHTML || '';
        if (h.includes('>RARE<')) { rareSeen = true; assert.ok(h.includes('#6fd8ff'), 'RARE badge is the cyan tell'); }
        if (h.includes('>MYTHIC<')) { mythicSeen = true; assert.ok(h.includes('#c89aff'), 'MYTHIC badge is the violet tell'); }
      }
      state.mode = 'playing';
    }
  } finally { Math.random = real; }
  assert.ok(rareSeen && mythicSeen, `both badges rendered (rare ${rareSeen}, mythic ${mythicSeen}) ${html.slice(0, 80)}`);
});

// ---- 4. the two chasers work -------------------------------------------------
const mythicCard = (id) => ({
  ...DRAFT_MYTHIC_UPGRADES.find(u => u.id === id), tier: 'MYTHIC',
  weight: draftLadderWeight(id, 'MYTHIC', 0),
});
const rareCard = (id) => ({
  ...DRAFT_RARE_UPGRADES.find(u => u.id === id), tier: 'RARE',
  weight: draftLadderWeight(id, 'RARE', 0),
});

s.check('Second Wind: revive once at 50% max HP through the ONE death seam', () => {
  T.startRun();
  const p = state.player;
  T.pickCard(mythicCard('second_wind'));
  assert.equal(p.stats.secondWind, true, 'the card arms the revive');
  p.hp = 0;
  const maxHp = p.stats.maxHp;
  T.die();
  assert.notEqual(state.mode, 'dead', 'the first lethal hit does not kill');
  assert.equal(p.hp, Math.max(1, maxHp * DRAFT_LADDER.SECOND_WIND_HP_FRAC),
    `revived at 50% max HP (${p.hp} of ${maxHp})`);
  assert.equal(state.secondWindUsed, true, 'the spend is recorded');
  assert.ok(p.invuln > 0, 'the revive grants spawn protection');
  p.hp = 0;
  p.invuln = 0;
  T.die();
  // RETARGETED 2026-09-15 (G15 death movie): the lethal hit now lands in the
  // death cinematic first — end it through the same hand-off the skip drives,
  // then the kill is terminal.
  assert.equal(state.mode, 'death-cine', 'the second lethal hit kills — the movie is playing');
  T.deathCine.end();
  assert.equal(state.mode, 'dead', 'the second lethal hit kills — once per run');
});

s.check('without the card, the same hit kills outright (no free revive)', () => {
  T.startRun();
  state.player.hp = 0;
  T.die();
  // RETARGETED 2026-09-15 (G15 death movie): the hit lands in the cinematic
  // first; end it through the same seam the skip drives, then it is terminal.
  assert.equal(state.mode, 'death-cine', 'the kill opens the movie');
  T.deathCine.end();
  assert.equal(state.mode, 'dead');
});

s.check('a taken mythic leaves the pool for the rest of the run', () => {
  T.startRun();
  state.chasePool = { second_wind: true, storm_shards: false, full_hand: false };
  T.pickCard(mythicCard('second_wind'));
  const real = Math.random;
  Math.random = mulberry32(777);
  let offered = 0;
  try {
    for (let i = 0; i < 500; i++) {
      T.openDraft();
      if (Array.from(elements['ov-cards'].children).some(c => (c.innerHTML || '').includes('Second Wind'))) offered++;
      state.mode = 'playing';
    }
  } finally { Math.random = real; }
  assert.equal(offered, 0, 'Second Wind never re-offers after the pick');
});

s.check('Storm Shards: an XP pickup chips enemies in the radius, not outside it', () => {
  T.startRun();
  const p = state.player;
  T.pickCard(mythicCard('storm_shards'));
  assert.equal(p.stats.stormShards, true, 'the card arms the chip');
  state.enemies.length = 0;
  const near = makeTypedEnemy('CHASER', p.x + 50, p.y, 0);
  const far = makeTypedEnemy('CHASER', p.x + 300, p.y, 0);
  state.enemies.push(near, far);
  const nearHp = near.hp, farHp = far.hp;
  const chip = Math.max(DRAFT_LADDER.STORM_SHARDS.CHIP_MIN, p.stats.damage * DRAFT_LADDER.STORM_SHARDS.CHIP_FRAC);
  state.gems.push({ x: p.x, y: p.y, xp: 1 });
  pump(2);
  assert.ok(near.hp <= nearHp - chip + 1e-9 && near.hp > 0,
    `the in-radius enemy took the chip (${nearHp} -> ${near.hp}, chip ${chip})`);
  assert.equal(far.hp, farHp, 'the out-of-radius enemy is untouched');
});

s.check('no Storm Shards card -> a gem pickup chips nothing', () => {
  T.startRun();
  const p = state.player;
  state.enemies.length = 0;
  const e = makeTypedEnemy('CHASER', p.x + 50, p.y, 0);
  state.enemies.push(e);
  const hp = e.hp;
  state.gems.push({ x: p.x, y: p.y, xp: 1 });
  pump(2);
  assert.equal(e.hp, hp);
});

// ---- 5. the rare tier works ---------------------------------------------------
s.check('Iron Heart +25%: percent max HP + heal 25%, coexisting with the flat +25', () => {
  T.startRun();
  const p = state.player;
  p.stats.maxHp = 100; p.hp = 10;
  T.pickCard(rareCard('hp_pct'));
  assert.equal(p.stats.maxHp, 125, 'max HP scales by 25%');
  assert.equal(p.hp, Math.min(10 + 0.25 * 125, 125), 'heals 25% of the new max');
  // The flat common is untouched and still stacks beside it.
  const flat = { id: 'hp', name: 'Iron Heart', desc: '', apply: (pp) => { pp.stats.maxHp += 25; pp.hp = Math.min(pp.hp + 25, pp.stats.maxHp); } };
  T.pickCard(flat);
  assert.equal(p.stats.maxHp, 150, 'fixed = common, percent = rare — the two coexist');
});

s.check("Scholar's Stone: +20% XP, compounding per pick", () => {
  T.startRun();
  const p = state.player;
  p.stats.xpMult = 1;
  T.pickCard(rareCard('xp_pct'));
  assert.ok(Math.abs(p.stats.xpMult - 1.2) < 1e-12, `xpMult ${p.stats.xpMult}`);
  T.pickCard(rareCard('xp_pct'));
  assert.ok(Math.abs(p.stats.xpMult - 1.44) < 1e-12, 'a repeat pick compounds');
});

s.check('Gilded Palm: +30% purse gold per kill through the REAL purseCredit', () => {
  T.startRun();
  const p = state.player;
  const before = T.purse.get();
  assert.equal(T.purse.credit({ typeId: 'BRUTE' }), 8, 'the shipped payout without the card');
  T.pickCard(rareCard('gold_pct'));
  assert.equal(T.purse.credit({ typeId: 'BRUTE' }), Math.round(8 * 1.3), 'the card pays +30%');
  assert.equal(T.purse.credit({ typeId: 'SWARMER' }), 0, 'CHAFF still pays 0 by design');
  assert.ok(T.purse.get() > before, 'the wallet credited through the one writer');
});

s.check('Crimson Edge: +3% lifesteal per pick', () => {
  T.startRun();
  const p = state.player;
  p.stats.lifesteal = 0;
  T.pickCard(rareCard('edge'));
  assert.ok(Math.abs(p.stats.lifesteal - 0.03) < 1e-12, `lifesteal ${p.stats.lifesteal}`);
});

// ---- 6. Full Hand --------------------------------------------------------------
s.check('Full Hand: the draft offers +1 card for the rest of the run', () => {
  T.startRun();
  T.openDraft();
  const base = elements['ov-cards'].children.length;
  state.mode = 'playing';
  T.pickCard(mythicCard('full_hand'));
  assert.equal(state.player.stats.draftOffers, 1, 'the investment is recorded');
  T.openDraft();
  assert.equal(elements['ov-cards'].children.length, base + 1, 'the next draft offers one more card');
  state.mode = 'playing';
});

s.check('the fourth offer is PICKABLE BY KEY (the [4] hint is not a lie)', () => {
  T.startRun();
  T.pickCard(mythicCard('full_hand'));
  T.openDraft();
  assert.equal(elements['ov-cards'].children.length, 4);
  key('keydown', { key: '4' });
  assert.equal(state.mode, 'playing', 'pressing 4 picked the fourth card and closed the draft');
});

s.done();
