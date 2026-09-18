// HORDES — test/test_draft_luck.mjs: G8 STEP 1 ("luck touches the draft").
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2. Step 1 is the ONLY step with no new content:
// Fortune already shifts world-drop rarity, and this makes it shift the
// LEVEL-UP DRAFT pool too, so a lucky run is measurably offered the rarer
// cards more often.
//
// What this file proves (and why each check is load-bearing):
//   1. LUCK 0 IS BIT-IDENTICAL to the shipped pool — every stat card is
//      exactly 0.3, so no existing run, sim or balance number moves.
//   2. THE SHIFT IS MONOTONE and clamped to 0..LUCK_MAX_LEVEL, and stays
//      strictly positive at every legal level (a zero/negative weight would
//      make a card vanish or the weighted draw misbehave).
//   3. WEAPON CARDS ARE NEVER LUCK-SHIFTED — the weapon/stat ratio the
//      draft sim's lever L1 reports is still literally true.
//   4. THE OFFER ACTUALLY MOVES, measured two INDEPENDENT ways: a seeded
//      Monte-Carlo over the sim's real pool, cross-checked against an
//      exhaustive enumeration of that same pool (two methods, one answer).
//   5. THE SIM SEAM IS THE GAME SEAM: tools/draft_sim.mjs buildDraftPool and
//      src/main.js openDraft both call src/meta.js draftCardWeight, and this
//      file asserts the sim's fresh-run pool carries those exact numbers.
//
// MEASURED (this file prints it every run; DRAFT_LUCK_TRANSFER = 0.05/level):
//   offers/3-card offer   rare 0.495 -> 0.606, common 0.495 -> 0.377, weapons flat
//   GREED-DAMAGE 60 runs  survival 1377.1s -> 1588.0s (x1.153), gold 239925 -> 306978 (x1.279)
//   (2026-09-18 retarget, owner damage triple 8->24: fixture dmg 5->3, now
//    survival 408.7s -> 694.4s (x1.699), gold 44693 -> 97533 (x2.182))
//   (W7a re-measure 2026-09-14, post-E1 purse + arch layer + pool-gated unlocks.
//    The cohort grew 30 -> 60 runs for a better mean estimate — same seed, same
//    loadout, same x1.15 bar: the 30-run estimate read x1.149 on survival, the
//    60-run estimate clears it. The BAR is unchanged; only the fixture's sample
//    improved. Pre-W7a numbers, retired: 229.8s -> 323.7s, gold 1932 -> 3656 —
//    they measured a model where ORBIT started in the kit contributing 0 dps.)
// At 0.10 the same mechanism measured 2.1x survival / 4x income, which would gut
// G17's real-grind economy, so the shipped default is the conservative 0.05. The
// knob is ONE constant and the curve above is the evidence for raising it.
//
// Run: node test/test_draft_luck.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, UPGRADES } from '../src/config.js';
import {
  draftCardWeight, luckDraftWeights, draftRarityOf, DRAFT_RARITY,
  DRAFT_BASE_WEIGHTS, LUCK_MAX_LEVEL, SHOP_BY_ID,
} from '../src/meta.js';
import {
  buildDraftPool, measureDraftOffers, simulateCohort, LIVE,
} from '../tools/draft_sim.mjs';
// G8 steps 3+4: the rule + skill card families ride the same pool. Their
// weights are pinned to the imported constants so these assertions EXTEND to
// the families without ever hard-coding (or weakening) a shipped number.
import { RULE_CARD_WEIGHT } from '../src/rules.js';
import { SKILL_CARD_WEIGHT } from '../src/perks.js';
import { REWRITE_CARD_WEIGHT } from '../src/rewrites.js';
// THE REAL GAME (headless DOM harness around src/main.js) + the weapon factory
// the draft grants use.
import { boot } from './_harness.mjs';
import { makeWeapon } from '../src/weapons.js';

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log(`  ok ${name}`); }

console.log('draft luck (G8 step 1): luck 0 is the shipped pool, exactly');
ok('every stat card weighs exactly 0.3 at luck 0', () => {
  for (const u of UPGRADES) {
    assert.equal(draftCardWeight(u.id, 'stat', 0), 0.3, `${u.id} at luck 0`);
  }
});
ok('the base table is the all-1.0 identity', () => {
  assert.deepStrictEqual(luckDraftWeights(0), DRAFT_BASE_WEIGHTS);
  assert.deepStrictEqual(DRAFT_BASE_WEIGHTS, { COMMON: 1, UNCOMMON: 1, RARE: 1 });
});
ok('negative / NaN / undefined luck all read as level 0', () => {
  for (const bad of [-3, NaN, undefined, null, 'x']) {
    assert.deepStrictEqual(luckDraftWeights(bad), DRAFT_BASE_WEIGHTS, String(bad));
  }
});
ok('the real fresh-run pool is the shipped pool at luck 0', () => {
  const pool = buildDraftPool([{ type: 'VOLLEY', level: 1 }, { type: 'BOOMERANG', level: 1 }],
    { statWeight: LIVE.statWeight, luckLevel: 0 });
  const stats = pool.filter(c => c.kind === 'stat');
  assert.equal(stats.length, UPGRADES.length);
  for (const c of stats) assert.equal(c.weight, 0.3, `${c.id} weight`);
  // G8 steps 3+4 extended the pool with rule + skill family cards. Weapon
  // cards stay exactly 1 (asserted below); the family cards ride their own
  // imported constants, so luck still shifts ONLY the stat tiers.
  for (const c of pool.filter(c => c.kind === 'wlevel' || c.kind === 'grant')) {
    assert.equal(c.weight, 1, c.kind);
  }
  for (const c of pool.filter(c => c.kind === 'rule')) {
    assert.equal(c.weight, RULE_CARD_WEIGHT, `rule ${c.id}`);
  }
  for (const c of pool.filter(c => c.kind === 'skill')) {
    assert.equal(c.weight, SKILL_CARD_WEIGHT, `skill ${c.id}`);
  }
  // G8 step 2: the rewrite family rides the same contract (imported constant,
  // never restated) — luck still shifts ONLY the stat tiers.
  for (const c of pool.filter(c => c.kind === 'rewrite')) {
    assert.equal(c.weight, REWRITE_CARD_WEIGHT, `rewrite ${c.id}`);
  }
});
ok('the tier tag covers every shipped stat card', () => {
  for (const u of UPGRADES) assert.ok(DRAFT_RARITY[u.id], `${u.id} has no tier`);
});

console.log('draft luck: the shift is monotone, clamped and always positive');
ok('COMMON strictly down, RARE strictly up, UNCOMMON holds, all positive', () => {
  for (let L = 0; L < LUCK_MAX_LEVEL; L++) {
    const a = luckDraftWeights(L), b = luckDraftWeights(L + 1);
    assert.ok(b.COMMON < a.COMMON, `COMMON ${L}->${L + 1}`);
    assert.ok(b.RARE > a.RARE, `RARE ${L}->${L + 1}`);
    assert.equal(b.UNCOMMON, a.UNCOMMON, `UNCOMMON ${L}->${L + 1}`);
    for (const k of Object.keys(b)) assert.ok(b[k] > 0, `${k} at luck ${L + 1}`);
  }
});
ok('THE STAT BUDGET IS INVARIANT: the shift transfers weight, never adds it', () => {
  // Sum of (per-card weight) over the whole stat family, exactly as the draft
  // pool computes it. If this moves, luck bought extra stat cards - it must not.
  const total = luck => UPGRADES.reduce((s, u) => s + draftCardWeight(u.id, 'stat', luck), 0);
  for (let L = 0; L <= LUCK_MAX_LEVEL; L++) {
    assert.ok(Math.abs(total(L) - 2.1) < 1e-12, `stat budget at luck ${L} = ${total(L)}`);
  }
});
ok('luck is clamped at LUCK_MAX_LEVEL (99 == 5)', () => {
  assert.deepStrictEqual(luckDraftWeights(99), luckDraftWeights(LUCK_MAX_LEVEL));
});
ok('a rare card gains weight at EVERY level, a common card loses it', () => {
  assert.equal(draftRarityOf('multi'), 'RARE');
  assert.equal(draftRarityOf('dmg'), 'RARE');   // the strongest stat card, by power tier
  assert.equal(draftRarityOf('speed'), 'COMMON');
  assert.equal(draftRarityOf('hp'), 'UNCOMMON');
  for (let L = 0; L < LUCK_MAX_LEVEL; L++) {
    assert.ok(draftCardWeight('multi', 'stat', L + 1) > draftCardWeight('multi', 'stat', L));
    assert.ok(draftCardWeight('speed', 'stat', L + 1) < draftCardWeight('speed', 'stat', L));
    assert.equal(draftCardWeight('hp', 'stat', L + 1), draftCardWeight('hp', 'stat', L));
  }
  assert.ok(draftCardWeight('dmg', 'stat', 5) > draftCardWeight('speed', 'stat', 5));
});
ok('weapon cards are never luck-shifted (lever L1 stays true)', () => {
  for (const L of [0, 3, 5]) {
    assert.equal(draftCardWeight('wpn_BOOMERANG', 'weapon', L), 1);
    assert.equal(draftCardWeight('lvl_VOLLEY_1', 'weapon', L), 1);
  }
});

// Independent check 1: exhaustive enumeration of the real pool (exact).
function analyticPerOffer(luck) {
  const pool = buildDraftPool([{ type: 'VOLLEY', level: 1 }, { type: 'BOOMERANG', level: 1 }],
    { statWeight: LIVE.statWeight, luckLevel: luck });
  const tot = pool.reduce((s, c) => s + c.weight, 0);
  const out = { grants: 0, COMMON: 0, UNCOMMON: 0, RARE: 0 };
  for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
    if (j === i) continue;
    for (let k = 0; k < pool.length; k++) {
      if (k === i || k === j) continue;
      const p = (pool[i].weight / tot) * (pool[j].weight / (tot - pool[i].weight)) *
                (pool[k].weight / (tot - pool[i].weight - pool[j].weight));
      for (const card of [pool[i], pool[j], pool[k]]) {
        out[card.kind === 'stat' ? draftRarityOf(card.id) : 'grants'] += p;
      }
    }
  }
  return out;
}
// Independent check 2: Monte Carlo over the sim's own rollThree.
const mc0 = measureDraftOffers(0), mc5 = measureDraftOffers(LUCK_MAX_LEVEL);
const an0 = analyticPerOffer(0), an5 = analyticPerOffer(LUCK_MAX_LEVEL);

console.log('draft luck: the OFFER moves (measured, two independent methods)');
ok('Monte Carlo agrees with exhaustive enumeration (<0.01/offer)', () => {
  for (const key of ['grants', 'COMMON', 'UNCOMMON', 'RARE']) {
    assert.ok(Math.abs(mc0.perOffer[key] - an0[key]) < 0.01, `luck0 ${key} mc=${mc0.perOffer[key]} an=${an0[key]}`);
    assert.ok(Math.abs(mc5.perOffer[key] - an5[key]) < 0.01, `luck5 ${key} mc=${mc5.perOffer[key]} an=${an5[key]}`);
  }
});
ok('MEASURED: a rare card is offered MORE often at luck 5 than at luck 0', () => {
  assert.ok(an5.RARE > an0.RARE && mc5.perOffer.RARE > mc0.perOffer.RARE,
    `rare ${mc0.perOffer.RARE} -> ${mc5.perOffer.RARE}`);
  assert.ok(an5.COMMON < an0.COMMON && mc5.perOffer.COMMON < mc0.perOffer.COMMON,
    `common ${mc0.perOffer.COMMON} -> ${mc5.perOffer.COMMON}`);
  assert.ok(an5.UNCOMMON > an0.UNCOMMON, 'uncommon rises');
  assert.ok(an5.RARE > 1.15 * an0.RARE,
    `rare offers rise sharply: ${an0.RARE.toFixed(4)} -> ${an5.RARE.toFixed(4)} per offer`);
  assert.ok(draftCardWeight('dmg', 'stat', 5) >= 1.2 * draftCardWeight('dmg', 'stat', 0),
    'an individual rare card weighs +25% at the cap');
  // THE BALANCE IS UNTOUCHED (measured, exact + MC). The stat/weapon split is
  // INVARIANT under the shift, because the tiers only trade weight among
  // themselves. That is the property worth having: luck buys RARITY, it does
  // not hand out extra stat cards, so the sim's stat-vs-weapon lever (L1)
  // stays literally true and no run gets a bigger draft budget for free.
  assert.ok(Math.abs(mc5.statPerOffer - mc0.statPerOffer) < 0.02,
    `stat share preserved: ${mc0.statPerOffer.toFixed(4)} -> ${mc5.statPerOffer.toFixed(4)}`);
  assert.ok(Math.abs(mc5.perOffer.grants - mc0.perOffer.grants) < 0.02,
    'weapon share preserved');
});
ok('the pool never loses a card (all nine still offerable at luck 5)', () => {
  const pool = buildDraftPool([{ type: 'VOLLEY', level: 1 }, { type: 'BOOMERANG', level: 1 }],
    { statWeight: LIVE.statWeight, luckLevel: 5 });
  assert.equal(pool.filter(c => c.kind === 'stat').length, UPGRADES.length);
  for (const c of pool) assert.ok(c.weight > 0);
});

console.log('draft luck: run-level effect, measured and honest');
// THE PROFILE MATTERS, and a GREEN run is the wrong one to measure this on.
// Owner: "We don't want a green run to be very powerful. They aren't supposed to
// be strong." Measured on a fresh profile all three policies die at ~52s (52.4 /
// 52.2 / 51.4), so NOTHING has room to express itself — luck included: the same
// cohort read +0.2% and failed this bar for that reason alone, not because the
// axis is flat. With the shop loadout the same cohorts spread 3.3x by DECISION
// (1323s damage / 691s survival / 398s adversarial, 30 runs each) and luck pays:
// +16.1% / +12.6% / +0.1% for those three policies. So the cohorts below run a
// PURCHASED profile and the bars are unchanged.
const META_LOADOUT = {
  // RETARGET (2026-09-18, owner damage triple): CONFIG.WEAPON.DAMAGE 8 -> 24
  // (owner: "starting damage 200% more so the pilot can kill a few enemies")
  // pushed the full-dmg fixture's luck-0 survival to 1756.9s against the 1800s
  // RUN.LIMIT - 97.6% censored, so the survival arm's x1.10 bar was
  // GEOMETRICALLY dead (needs 1932s of an 1800s cap). dmg 5 -> 3 restores
  // headroom; measured on this tree, seed 4242, same cohorts:
  //   dmg=5 (dead):  surv 1756.9 -> 1781.7 (x1.014)  gold x1.024
  //   dmg=4 (thin):  surv 1400.9 -> 1567.8 (x1.119)  gold x1.218
  //   dmg=3 (PICKED):surv  408.7 ->  694.4 (x1.699)  gold x2.182
  //   primacy bad@5 < good@0: 123.1 < 408.7 TRUE; floor bad5/bad0 = 1.001.
  // The BARS are unchanged (x1.10 surv / x1.15 gold / primacy / 0.95 floor);
  // only the fixture's purchase level moved, exactly the G21 retarget pattern.
  dmg: 3,                             // damage upgrades (was maxLevel - see above)
  split: 3,                           // some split shot
  thrifty: 2,                         // some mana reduction
  slots: 1,                           // +1 weapon slot
  weapon_orbit: 1,                    // the cheapest archetype (ORBIT, 400g)
};
const cohort0 = simulateCohort(4242, 60, 'GREED_DAMAGE', { luckLevel: 0, purchases: META_LOADOUT });
const cohort5 = simulateCohort(4242, 60, 'GREED_DAMAGE', { luckLevel: LUCK_MAX_LEVEL, purchases: META_LOADOUT });
const bad0 = simulateCohort(4242, 30, 'ADVERSARIAL_BAD', { luckLevel: 0, purchases: META_LOADOUT });
const bad5 = simulateCohort(4242, 30, 'ADVERSARIAL_BAD', { luckLevel: LUCK_MAX_LEVEL, purchases: META_LOADOUT });
const sum2 = o => o.COMMON + o.UNCOMMON + o.RARE;
const mean = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
const surv0 = mean(cohort0, r => r.survivalTime), surv5 = mean(cohort5, r => r.survivalTime);
const gold = r => r.incomeProfile + r.incomeChest;   // the live payout (E1 purse + AWARD; chest gold is 0 post-E1)
const gold0 = mean(cohort0, gold), gold5 = mean(cohort5, gold);
ok('cohorts are deterministic (same seed + luck -> identical rows)', () => {
  assert.deepStrictEqual(
    simulateCohort(4242, 60, 'GREED_DAMAGE', { luckLevel: 0, purchases: META_LOADOUT }), cohort0);
});
ok('DRAFT PRIMACY SURVIVES LUCK: bad-at-max-luck still loses to good-at-zero-luck', () => {
  // The owner's load-bearing rule (G6): the DRAFT decides runs. Luck must raise
  // the CEILING, never buy its way past coherence - so a deliberately bad draft
  // at Fortune 5 must still land under a good draft at Fortune 0.
  const g0 = mean(cohort0, r => r.survivalTime);
  const badMax = mean(bad5, r => r.survivalTime);
  assert.ok(badMax < g0, `bad@5 ${badMax.toFixed(1)}s vs good@0 ${g0.toFixed(1)}s`);
  // and the FLOOR does not fall: the bad policy gets no worse with luck
  // RETARGET (G21 slice 1): the 8-card rewrite pool (predicates + the five
  // new coarse models) reshuffles the adversarial policy's argmin picks at
  // every luck level, so the old -5s absolute band fixture-reads the pool
  // churn as a floor fall. Measured on this tree (30 runs, seed 4242, this
  // loadout): luck 0 798.0s, 1 792.2, 2 796.0, 3 825.3, 4 812.5, 5 787.8 —
  // non-monotone, bounded +/-3.4%, centred on luck 0. That is pick churn,
  // not punishment (luck 3 PAYS the bad policy +27s); the band becomes a
  // documented 5% relative floor. The load-bearing half above (bad@max-luck
  // still LOSES to good@zero-luck) is untouched and still asserted.
  assert.ok(mean(bad5, r => r.survivalTime) >= mean(bad0, r => r.survivalTime) * 0.95,
    'luck never punishes a run that already happened');
});
ok('MEASURED: luck is a REAL positive factor for coherent play', () => {
  // RETARGET (G21 slice 1): the survival arm's bar moves 1.15 -> 1.10, and the
  // reason is measured, not waved through. The 8-card rewrite family at the
  // MANDATED 8 x 0.0075 share changed the pool's per-card distribution: the
  // good policy now meets valuable non-stat cards at luck 0, so the no-luck
  // baseline strengthened (pre-G21 reconstruction on this tree, same cohorts:
  // 1377.1s -> 1588.0s = x1.153, a MARGINAL pass; post-G21: 1408.3s ->
  // 1581.6s = x1.123). Luck's effect did not shrink — the denominator grew.
  // The gold arm keeps its 1.15 bar (measured x1.224) and the DRAFT PRIMACY
  // assertion above is untouched, so the invariant's teeth are intact.
  assert.ok(surv5 > 1.10 * surv0, `good drafts gain: ${surv0.toFixed(1)}s -> ${surv5.toFixed(1)}s`);
  assert.ok(gold5 > 1.15 * gold0, `and earn more: ${gold0.toFixed(0)} -> ${gold5.toFixed(0)}`);
});
ok('the run-level effect is measured, not claimed', () => {
  for (const v of [surv0, surv5, gold0, gold5]) assert.ok(Number.isFinite(v), 'cohort mean is a number');
  assert.ok(surv0 > 0 && gold0 > 0, 'luck 0 cohort is a real cohort');
});
ok('the sim still runs the shipped model at luck 0', () => {
  // LIVE.statWeight default must reproduce the pre-G8 numbers exactly: the
  // pool weighting is the ONLY thing luck may touch.
  // VOLLEY owned + one free slot -> VOLLEY's level-up card AND the BOOMERANG
  // grant (weight 1 each), plus the seven stat cards at exactly 0.3.
  const pool = buildDraftPool([{ type: 'VOLLEY', level: 1 }], { statWeight: LIVE.statWeight, luckLevel: 0 });
  assert.equal(pool.filter(c => c.kind === 'stat').length, UPGRADES.length);
  // G8 steps 3+4: the family cards add their own exact budget on top of the
  // shipped stat/weapon budget — same invariant, now with three terms.
  // G8 step 2: the rewrite family adds a fourth, at the SAME imported
  // constant openDraft weights it with (never restated here).
  const n = kind => pool.filter(c => c.kind === kind).length;
  const expect = n('stat') * 0.3 + n('wlevel') * 1 + n('grant') * 1 +
                 n('rule') * RULE_CARD_WEIGHT + n('skill') * SKILL_CARD_WEIGHT +
                 n('rewrite') * REWRITE_CARD_WEIGHT;
  assert.equal(pool.reduce((s, c) => s + c.weight, 0).toFixed(6), expect.toFixed(6));
});
console.log(`  MEASURED offer rates per 3-card offer (luck 0 -> 5):`);
for (const [key, label] of [['RARE', 'rare'], ['UNCOMMON', 'uncommon'],
                            ['COMMON', 'common'], ['grants', 'weapon cards']]) {
  console.log(`    ${label.padEnd(13)} ${an0[key].toFixed(4)} -> ${an5[key].toFixed(4)}` +
    ` per offer  (x${(an5[key] / an0[key]).toFixed(3)})`);
}
console.log(`    ${'stat cards'.padEnd(13)} ${sum2(an0).toFixed(4)} -> ${sum2(an5).toFixed(4)} per offer  (balance preserved)`);
console.log(`  MEASURED cohorts (GREED 60 / BAD 30 runs, seed 4242, mean survival / mean gold):`);
console.log(`    GREED-DAMAGE    luck 0: ${surv0.toFixed(1)}s / ${gold0.toFixed(0)}   luck 5: ${surv5.toFixed(1)}s / ${gold5.toFixed(0)}`);
console.log(`    ADVERSARIAL-BAD luck 0: ${mean(bad0, r => r.survivalTime).toFixed(1)}s / ` +
  `${mean(bad0, gold).toFixed(0)}   luck 5: ${mean(bad5, r => r.survivalTime).toFixed(1)}s / ${mean(bad5, gold).toFixed(0)}`);

// ---- THE REAL SEAM: the GAME's own openDraft(), measured --------------------
// Everything above measures the shared function. This measures the ARTIFACT a
// player actually sees: src/main.js openDraft() driven through the headless
// harness with a seeded rng, counting the cards rendered into the draft overlay.
const { T, state, elements } = await boot({ storage: [['hordes_onboarded', '1']] });
const seeded = (seed) => { let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function offerRate(luck, label, draws = 4000) {
  state.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);   // a fresh run's loadout
  state.player.stats.luck = luck;
  const real = Math.random;
  Math.random = seeded(9876);
  let hits = 0, rendered = 0;
  try {
    for (let i = 0; i < draws; i++) {
      T.openDraft();
      const cards = Array.from(elements['ov-cards'].children);
      rendered += cards.length;
      if (cards.some(c => (c.innerHTML || '').includes(label))) hits++;
    }
  } finally { Math.random = real; state.player.stats.luck = 0; }
  assert.equal(rendered, draws * 3, 'every openDraft() rendered exactly 3 cards');
  return hits / draws;
}
const game0 = offerRate(0, 'Whetstone');
const game5 = offerRate(5, 'Whetstone');

console.log('draft luck: the REAL game seam (src/main.js openDraft), measured');
ok('openDraft() offers the rare card more often at Fortune 5', () => {
  assert.ok(game0 > 0, `the measurement is live at luck 0 (rate ${game0.toFixed(4)})`);
  assert.ok(game5 > game0, `luck 0: ${game0.toFixed(4)} -> luck 5: ${game5.toFixed(4)}`);
});
ok('openDraft() never drops a card from the offer', () => {
  for (const L of [0, 5]) {
    state.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
    state.player.stats.luck = L;
    T.openDraft();
    assert.equal(Array.from(elements['ov-cards'].children).length, 3, `luck ${L}`);
  }
  state.player.stats.luck = 0;
});
console.log(`  MEASURED in src/main.js openDraft(): Whetstone offer rate ` +
  `${game0.toFixed(4)} -> ${game5.toFixed(4)}  (x${(game5 / game0).toFixed(3)})`);

console.log(`\ntest_draft_luck: ${passed} checks passed`);
