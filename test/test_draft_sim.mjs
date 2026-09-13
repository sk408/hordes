// HORDES — test/test_draft_sim.mjs: WAVE-18 draft stakes sim.
// Deterministic seeded assertions on tools/draft_sim.mjs:
//   (1) the harness is pure/reproducible — same seed, identical run;
//   (2) draft archetypes diverge in the expected direction on a fixed seed
//       (GREED-DAMAGE out-kills/out-earns/out-survives ADVERSARIAL-BAD;
//       SURVIVAL takes the hp/speed cards GREED passes up);
//   (3) the acceptance verdict is internally consistent with its components.
// Run: node test/test_draft_sim.mjs
import assert from 'node:assert/strict';
import { CONFIG as C } from '../src/config.js';
import { SHOP_BY_ID } from '../src/meta.js';
import {
  simulateRun, simulateCohort, divergenceVerdict, POLICIES, LEVERS, LIVE,
} from '../tools/draft_sim.mjs';

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

// SUITE-REDS R2: the divergence cohorts used to run a FRESH profile, but under
// the ordered design a green run dies at ~52s with 2 drafts — both policies
// take the same two cards, so `survival hp+speed 0 vs good 0` could never
// express divergence. The owner ordered this: "We don't want a green run to be
// very powerful." Retarget the FIXTURE exactly as d9d5426 did for
// test_draft_luck: run the cohorts with the PURCHASED loadout the owner
// specified ("all the damage upgrades and some split shot upgrades and some
// mana reduction buyables and 1 weapon slot and unlock the cheapest weapon"),
// applied through the REAL applyMetaBonuses seam. Every id below is a real
// SHOP row in src/meta.js. Assertions, thresholds and messages unchanged.
const META_LOADOUT = {
  dmg: SHOP_BY_ID.dmg.maxLevel,       // all damage upgrades
  split: 3,                           // some split shot
  thrifty: 2,                         // some mana reduction
  slots: 1,                           // +1 weapon slot
  weapon_orbit: 1,                    // the cheapest archetype (ORBIT, 400g)
};
const PATCH = { purchases: META_LOADOUT };

const SEED = 4242;
const good = simulateRun(SEED, 'GREED_DAMAGE', PATCH);
const bad = simulateRun(SEED, 'ADVERSARIAL_BAD', PATCH);
const survival = simulateRun(SEED, 'SURVIVAL', PATCH);

console.log('draft_sim: reproducibility');
ok('same seed + policy -> byte-identical result', () => {
  const a = simulateRun(SEED, 'GREED_DAMAGE', PATCH);
  assert.deepStrictEqual(a, good);
});
ok('different seeds -> different runs (rng actually varies offers)', () => {
  const b = simulateRun(SEED + 1, 'GREED_DAMAGE', PATCH);
  assert.notDeepStrictEqual(b.checkpoints[600], good.checkpoints[600]);
});
ok('checkpoints exist for minutes 2/5/10 with all 5 metrics + level', () => {
  for (const mark of [120, 300, 600]) {
    const cp = good.checkpoints[mark];
    for (const k of ['survivalTime', 'kills', 'damageTaken', 'wavesCleared', 'gold', 'level']) {
      assert.ok(Number.isFinite(cp[k]), `checkpoint ${mark}.${k} finite`);
    }
  }
});

console.log('draft_sim: archetype divergence (fixed seed)');
ok('GREED-DAMAGE out-survives ADVERSARIAL-BAD', () => {
  assert.ok(good.survivalTime > bad.survivalTime,
    `good ${good.survivalTime}s vs bad ${bad.survivalTime}s`);
});
ok('GREED-DAMAGE out-kills ADVERSARIAL-BAD at minute 10', () => {
  assert.ok(good.checkpoints[600].kills > bad.checkpoints[600].kills,
    `${good.checkpoints[600].kills} vs ${bad.checkpoints[600].kills}`);
});
ok('GREED-DAMAGE out-earns ADVERSARIAL-BAD at minute 10', () => {
  assert.ok(good.checkpoints[600].gold > bad.checkpoints[600].gold);
});
ok('GREED-DAMAGE out-kills by minute 2 already (early divergence)', () => {
  assert.ok(good.checkpoints[120].kills > bad.checkpoints[120].kills);
});
ok('SURVIVAL takes the hp/speed cards GREED passes up', () => {
  const s = x => (survival.picks[x] || 0), g = x => (good.picks[x] || 0);
  assert.ok(s('hp') + s('speed') > g('hp') + g('speed'),
    `survival hp+speed ${s('hp') + s('speed')} vs good ${g('hp') + g('speed')}`);
  assert.ok(g('dmg') >= s('dmg'), 'greed takes at least as many dmg cards');
});
ok('policies are distinct functions over the same offer rolls', () => {
  assert.ok(POLICIES.GREED_DAMAGE.pick({ dps: 1, ehp: 0 }) >
            POLICIES.GREED_DAMAGE.pick({ dps: 0, ehp: 1 }));
  assert.ok(POLICIES.SURVIVAL.pick({ dps: 1, ehp: 0 }) <
            POLICIES.SURVIVAL.pick({ dps: 0, ehp: 1 }));
});

console.log('draft_sim: cohort verdict machinery');
ok('verdict components agree with the pass flag', () => {
  const cohortGood = simulateCohort(SEED, 9, 'GREED_DAMAGE');
  const cohortBad = simulateCohort(SEED, 9, 'ADVERSARIAL_BAD');
  const v = divergenceVerdict(cohortGood, cohortBad);
  assert.equal(v.pass,
    v.badCanFail && v.badEarlier && v.winCount >= 3);
  assert.equal(v.winCount, v.metricWins.filter(w => w[1]).length);
  assert.ok(v.goodBad > 1, `good/bad survival ratio ${v.goodBad} > 1`);
});
ok('median cohort survival preserves archetype order across seeds', () => {
  for (const seed of [SEED, SEED + 101, SEED + 202]) {
    const g = cohortMed(seed, 'GREED_DAMAGE');
    const b = cohortMed(seed, 'ADVERSARIAL_BAD');
    assert.ok(g >= b, `seed ${seed}: good ${g} vs bad ${b}`);
  }
});
function cohortMed(seed, policy) {
  const c = simulateCohort(seed, 7, policy);
  const s = c.map(r => r.survivalTime).sort((a, b) => a - b);
  return s[s.length >> 1];
}

console.log('draft_sim: lever scenarios');
ok('every lever patches a live value and stays runnable + divergent', () => {
  assert.ok(LEVERS.length >= 2 && LEVERS.length <= 4, '2-4 levers per the brief');
  for (const L of LEVERS) {
    assert.ok(L.file && L.current && L.proposed && L.patch, `${L.id} fully specified`);
    const g = simulateRun(SEED, 'GREED_DAMAGE', L.patch);
    const b = simulateRun(SEED, 'ADVERSARIAL_BAD', L.patch);
    assert.ok(Number.isFinite(g.survivalTime) && Number.isFinite(b.survivalTime),
      `${L.id} runs clean`);
    assert.ok(g.checkpoints[600].kills >= b.checkpoints[600].kills,
      `${L.id} keeps good >= bad on kills`);
  }
});
ok('LIVE defaults mirror the live constants (no silent drift)', () => {
  // If these fail, src/ was retuned — update LIVE/LEVERS so proposals compare
  // against the real current values.
  assert.equal(LIVE.maxProj, C.WEAPON.MAX_PROJECTILES);
  assert.equal(LIVE.xpGrowth, C.XP_LEVEL_GROWTH);
  assert.equal(LIVE.statWeight, 0.3);
});

console.log(`draft_sim: all ${passed} assertions green`);
