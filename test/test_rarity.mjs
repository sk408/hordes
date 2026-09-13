// HORDES — G10 PART C: RARITY TIERS (src/rarity.js + the real spawn seam).
// Run: node test/test_rarity.mjs
//
// Brief coverage, path by path:
//   * the tier table is a sane ordering with SMALL mults (PART C3: the mean
//     hp/xp factors are a flavour layer, ≤1.05, so PART D's invariants hold);
//   * the roll's band order is pinned (MYTHIC first, then RARE, else COMMON)
//     and the RATES are MEASURED through the real rollRarity at N=100k within
//     RATE_TOL_ABS (constants with the measurement beside them);
//   * applyRarity stamps hp/maxHp/xp/dropBonus and is a no-op on COMMON;
//   * effectiveTierId / tierMax implement the COMMON < RARE < ELITE < MYTHIC
//     ordering the encounters namespace's bestTier relies on;
//   * the stamp happens at the REAL trunk spawn (main.js spawnWave): with the
//     roll forced, every tier-eligible spawn carries the tier; bosses and the
//     COLOSSUS never do; split children (elite_mods.splitChildren) never
//     inherit a tier;
//   * dt-correctness: the stamp is at spawn, not in a per-frame accumulator —
//     60Hz and 120Hz both produce tiered spawns over equal sim time;
//   * PART D invariants still hold with the layer folded into the sim.
import assert from 'node:assert/strict';
import { CONFIG as C, ladderEliteChance } from '../src/config.js';
import { ELITE_TEMPLATE } from '../src/enemy_types.js';
import { splitChildren } from '../src/elite_mods.js';
import { boot, suite } from './_harness.mjs';
import {
  RARITY, TIER_ORDER, TIER_RANK, RATE_TOL_ABS, ELITE_TIER,
  rollRarity, applyRarity, effectiveTierId, tierMax,
} from '../src/rarity.js';
import {
  LIVE, simulateRun, simulateCohort, divergenceVerdict,
} from '../tools/draft_sim.mjs';
import { RULE_IDS } from '../src/rules.js';

const S = suite('test_rarity');

// Boot-based checks MUST run sequentially: every boot() installs a fresh stub
// window over the SAME cached main.js module (one shared rAF queue), so two
// interleaved pump loops would consume each other's frames. S.check is sync,
// so these go through an awaited runner instead.
let asyncPassed = 0;
async function acheck(label, fn) {
  try { await fn(); asyncPassed++; console.log('  ok - ' + label); }
  catch (err) { console.error('  FAIL ' + label); throw err; }
}

// ---------- 1. the table ------------------------------------------------------
S.check('the tier ordering is COMMON < RARE < ELITE < MYTHIC', () => {
  assert.deepEqual(TIER_ORDER, ['COMMON', 'RARE', 'ELITE', 'MYTHIC']);
  for (let i = 1; i < TIER_ORDER.length; i++) {
    assert.ok(TIER_RANK[TIER_ORDER[i]] > TIER_RANK[TIER_ORDER[i - 1]],
      TIER_ORDER[i] + ' outranks ' + TIER_ORDER[i - 1]);
  }
  assert.equal(ELITE_TIER.tier, TIER_RANK.ELITE, 'the ELITE catalog row carries its rank');
});

S.check('chances are valid probabilities that leave room for COMMON', () => {
  const sum = RARITY.RARE.chance + RARITY.MYTHIC.chance;
  assert.ok(RARITY.RARE.chance > 0 && RARITY.RARE.chance < 1, 'RARE chance in (0,1)');
  assert.ok(RARITY.MYTHIC.chance > 0 && RARITY.MYTHIC.chance < 1, 'MYTHIC chance in (0,1)');
  assert.ok(RARITY.MYTHIC.chance < RARITY.RARE.chance, 'MYTHIC is the rarer band');
  assert.ok(sum < 1, 'COMMON keeps the rest of the roll (sum=' + sum + ')');
  assert.equal(RARITY.COMMON.chance, undefined, 'COMMON has no chance field — it is the roll\'s else');
});

S.check('the mults are honest and SMALL (PART C3: the layer must not break the balance invariants)', () => {
  // The design-intent factors from the header — computed, never retyped.
  const hpFactor = 1 + RARITY.RARE.chance * (RARITY.RARE.hpMult - 1) +
    RARITY.MYTHIC.chance * (RARITY.MYTHIC.hpMult - 1);
  const xpFactor = 1 + RARITY.RARE.chance * (RARITY.RARE.xpMult - 1) +
    RARITY.MYTHIC.chance * (RARITY.MYTHIC.xpMult - 1);
  assert.ok(hpFactor <= 1.05, 'mean hp factor ' + hpFactor.toFixed(4) + ' <= 1.05');
  assert.ok(xpFactor <= 1.05, 'mean xp factor ' + xpFactor.toFixed(4) + ' <= 1.05');
  for (const id of ['RARE', 'MYTHIC']) {
    const t = RARITY[id];
    assert.ok(t.hpMult > 1 && t.hpMult < ELITE_TEMPLATE.hpMult,
      id + ' hp mult sits between plain and elite (x' + t.hpMult + ' vs elite x' + ELITE_TEMPLATE.hpMult + ')');
    assert.ok(t.xpMult > 1 && t.dropBonus > 0, id + ' pays xp and a drop bonus');
    assert.ok(typeof t.tell.outline === 'string' && /^#[0-9a-f]{6}$/i.test(t.tell.outline),
      id + ' carries a hex tell colour (no new sprites — the elite ring vocabulary)');
  }
});

// ---------- 2. the roll: band order pinned + rates MEASURED -------------------
S.check('band order is pinned: MYTHIC first, then RARE, else COMMON', () => {
  const M = RARITY.MYTHIC.chance, R = RARITY.RARE.chance;
  assert.equal(rollRarity(() => 0), 'MYTHIC', 'the bottom of the roll is MYTHIC');
  assert.equal(rollRarity(() => M), 'RARE', 'the MYTHIC boundary itself falls in the RARE band');
  assert.equal(rollRarity(() => M + R), 'COMMON', 'the RARE boundary itself falls to COMMON');
  assert.equal(rollRarity(() => 0.999999), 'COMMON', 'the top of the roll is COMMON');
});

S.check('rates are MEASURED at N=100k within RATE_TOL_ABS (constants, not assertions)', () => {
  // mulberry32, seed 4242 — the same deterministic discipline the header cites.
  let a = 4242 >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = 100000;
  const seen = { COMMON: 0, RARE: 0, MYTHIC: 0 };
  for (let i = 0; i < N; i++) seen[rollRarity(rng)]++;
  for (const id of ['RARE', 'MYTHIC']) {
    const measured = seen[id] / N;
    assert.ok(Math.abs(measured - RARITY[id].chance) <= RATE_TOL_ABS,
      id + ' measured ' + (100 * measured).toFixed(3) + '% vs constant ' +
      (100 * RARITY[id].chance).toFixed(3) + '% (tol ' + (100 * RATE_TOL_ABS).toFixed(2) + '%)');
  }
  assert.equal(seen.COMMON + seen.RARE + seen.MYTHIC, N, 'every roll lands in exactly one band');
});

// ---------- 3. the stamp -------------------------------------------------------
S.check('applyRarity on COMMON is a byte-identical no-op', () => {
  const e = { hp: 100, maxHp: 100, xp: 5 };
  const out = applyRarity(e, 'COMMON');
  assert.equal(out, e, 'returns the same enemy');
  assert.deepEqual(e, { hp: 100, maxHp: 100, xp: 5 }, 'nothing stamped, no field added');
});

S.check('applyRarity multiplies hp (maxHp mirrors), xp and accumulates dropBonus', () => {
  const e = { hp: 100, maxHp: 100, xp: 5, dropBonus: 0.1 };
  applyRarity(e, 'RARE');
  assert.equal(e.rarity, 'RARE', 'the tier is stamped');
  assert.equal(e.hp, 160, 'hp x1.6 (got ' + e.hp + ')');
  assert.equal(e.maxHp, 160, 'maxHp mirrors the multiplied hp');
  assert.equal(e.xp, 10, 'xp x2.0 (got ' + e.xp + ')');
  assert.equal(e.dropBonus, 0.25, 'dropBonus ACCUMULATES onto any existing bonus');
  applyRarity(e, 'MYTHIC');
  assert.equal(e.rarity, 'MYTHIC', 'a later stamp overwrites the tier id');
  assert.equal(e.hp, 400, 'the second mult applies to the already-multiplied hp');
  assert.equal(e.dropBonus, 0.6, 'and the drop bonus keeps accumulating');
});

S.check('applyRarity rejects unknown tiers and hostile enemies without throwing', () => {
  const e = { hp: 10, maxHp: 10, xp: 1 };
  applyRarity(e, 'NOPE');
  assert.equal(e.rarity, undefined, 'an unknown tier id stamps nothing');
  assert.equal(applyRarity(null, 'RARE'), null, 'a missing enemy is returned as-is');
});

// ---------- 4. the ordering helpers -------------------------------------------
S.check('effectiveTierId rank-maxes the roll against the elite flag', () => {
  assert.equal(effectiveTierId(null, false), 'COMMON');
  assert.equal(effectiveTierId('COMMON', false), 'COMMON');
  assert.equal(effectiveTierId('RARE', false), 'RARE');
  assert.equal(effectiveTierId('MYTHIC', false), 'MYTHIC');
  assert.equal(effectiveTierId(null, true), 'ELITE', 'an elite CHASER counts as tier ELITE');
  assert.equal(effectiveTierId('RARE', true), 'ELITE', 'elite outranks rare (the ladder is the common case)');
  assert.equal(effectiveTierId('MYTHIC', true), 'MYTHIC', 'mythic outranks everything');
  assert.equal(effectiveTierId('GARBAGE', true), 'ELITE', 'an unknown rarity id cannot outrank the flag');
});

S.check('tierMax compares by rank and never invents a tier for two unknowns', () => {
  assert.equal(tierMax('COMMON', 'RARE'), 'RARE');
  assert.equal(tierMax('MYTHIC', 'ELITE'), 'MYTHIC');
  assert.equal(tierMax('RARE', 'RARE'), 'RARE');
  assert.equal(tierMax('COMMON', 'GARBAGE'), 'COMMON', 'an unknown id loses to a known one');
  assert.equal(tierMax('GARBAGE', 'NOPE'), null, 'two unknowns have no max');
});

// ---------- 5. the REAL spawn seam --------------------------------------------
// ONE boot for the whole section: the harness captures the rAF chain at first
// import, so a second boot() would leave the loop's pending frame on the OLD
// queue and every pump after it drains. startRun() resets the run between
// checks instead (and the dt check's setFrameMs is read per frame by design).
//
// Force the roll: rollRarity defaults to Math.random, so pinning it to 0 makes
// every tier-eligible trunk spawn MYTHIC — the stamp is then observable on the
// live field instead of waited for at a 0.3% rate.
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const forceRolls = (fn) => {
  const real = Math.random;
  Math.random = () => 0;
  try { return fn(); } finally { Math.random = real; }
};

await acheck('the stamp happens at the trunk spawn: forced rolls tier every eligible enemy', () => {
  h.T.startRun();
  let minions = 0;
  const seen = new Set();
  forceRolls(() => {
    // Sample EVERY frame (enemies die fast under a forced roll — the live
    // array is a window, not the spawn history).
    for (let i = 0; i < 600 && minions < 5; i++) {
      for (const e of st.enemies) {
        if (e.boss || e.finalBoss || seen.has(e)) continue;
        seen.add(e);
        minions++;
        assert.equal(e.rarity, 'MYTHIC', 'a tier-rolled spawn carries its tier (' + e.typeId + ')');
        assert.equal(e.maxHp, e.hp, 'maxHp mirrors the multiplied hp');
        assert.ok(e.dropBonus >= RARITY.MYTHIC.dropBonus, 'the death-pass drop bonus is stamped');
      }
      h.pump(1);
    }
  });
  assert.ok(minions >= 3, 'the run actually spawned tier-eligible enemies (got ' + minions + ')');
});

await acheck('dt-correctness: 60Hz and 120Hz both produce tiered spawns over equal sim time', () => {
  for (const hz of [60, 120]) {
    h.T.startRun();
    h.setFrameMs(1000 / hz);
    let tiered = 0;
    forceRolls(() => {
      const frames = Math.round(2 * hz);   // 2 sim-seconds at this rate
      for (let i = 0; i < frames; i++) h.pump(1);
      tiered = st.enemies.filter(e => !e.boss && !e.finalBoss && e.rarity === 'MYTHIC').length;
    });
    assert.ok(tiered > 0, hz + 'Hz: the spawn stamp fired (no per-frame accumulator to drift)');
  }
  h.setFrameMs(1000 / 60);   // restore the default tick for the checks below
});

await acheck('bosses and the COLOSSUS are NEVER tier-rolled (forced roll proves the exclusion)', () => {
  h.T.startRun();
  // A level-up draft PAUSES the sim (mode 'draft') — clear it the way
  // test_run_structure does: click the first offered card and keep stepping.
  // The wave-end flow also needs walking: the boss's death runs the portal
  // cinematic (any key skips it — smoke.mjs idiom) and hands off to the
  // intermission ('c' = CONTINUE, main.js:3847), which freezes the clock
  // until dismissed. Death RETRYs ('r') so the probe survives a bad wave.
  const step = () => {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = h.elements['ov-cards'].children[0];
      if (c) { c.click(); return; }
    }
    if (st.mode === 'portal-cine') { h.key('keydown', { key: 'x', preventDefault() {} }); return; }
    if (st.mode === 'intermission') { h.key('keydown', { key: 'c', preventDefault() {} }); return; }
    if (st.mode === 'dead') { h.key('keydown', { key: 'r', preventDefault() {} }); return; }
    h.pump(1);
  };
  let boss = null, colossus = null, mythics = 0;
  const seen = new Set();
  const sample = () => {
    for (const e of st.enemies) {
      if (seen.has(e)) continue;
      seen.add(e);
      if ((e.boss || e.finalBoss)) {
        assert.equal(e.rarity, undefined, 'a boss never carries a rarity tier (' + (e.bossId || e.typeId) + ')');
      } else if (e.typeId === 'COLOSSUS') {
        colossus = colossus || e;
      } else if (e.rarity === 'MYTHIC') {
        mythics++;
      }
    }
  };
  const real = Math.random;
  try {
    // Phase A — every draw 0: the type walk pins to CHASER and every tier
    // roll lands MYTHIC. The HERALD lands mid-wave-1 (~60s).
    Math.random = () => 0;
    for (let i = 0; i < 60 * 150 && !boss; i++) {
      sample();
      step();
      boss = st.enemies.find(e => (e.boss || e.finalBoss) && e.hp > 0);
    }
    // Phase B — a 1-in-5 cycling high draw: pickSpawnType walks the weight
    // table and the high draw lands in the LAST band (COLOSSUS, gated at
    // wave 5 / ~150s), while every other draw still demands MYTHIC. If the
    // exclusion ternary were missing, a COLOSSUS spawned here WOULD stamp.
    let n = 0;
    Math.random = () => (n++ % 5 === 0 ? 0.999 : 0);
    for (let i = 0; i < 60 * 200 && !colossus; i++) {
      sample();
      step();
    }
    sample();
  } finally {
    Math.random = real;
  }
  assert.ok(boss, 'a named boss spawned (the spawnBoss seam ran)');
  assert.ok(mythics >= 3, 'the tier roll was LIVE in the same window (' + mythics + ' mythic minions seen)');
  assert.ok(colossus, 'a COLOSSUS spawned past its gate while the roll demanded MYTHIC');
  for (const e of seen) {
    if (e.typeId === 'COLOSSUS') {
      assert.equal(e.rarity, undefined, 'the COLOSSUS is its own tier — never rarity-rolled');
    }
  }
});

S.check('split children never inherit a tier (the split path is not the trunk spawn)', () => {
  const parent = {
    typeId: 'BRUTE', x: 0, y: 0, w: 16, h: 16, hp: 250, maxHp: 250,
    eliteMod: 'SPLITTING', rarity: 'MYTHIC', dropBonus: 0.35,
  };
  const kids = splitChildren(parent);
  assert.ok(Array.isArray(kids) && kids.length === 2, 'the SPLITTING plan spawns its children');
  for (const k of kids) {
    assert.equal(k.rarity, undefined, 'a child descriptor carries no rarity');
    assert.equal(k.dropBonus, undefined, 'and no inherited drop bonus');
    assert.equal(k.eliteMod, null, 'and no modifier (splits never recurse)');
  }
});

// ---------- 6. PART D invariants with the rarity layer ON ----------------------
S.check('the sim models the layer and the LIVE default is ON', () => {
  assert.equal(LIVE.rarity, true, 'LIVE.rarity defaults on — the shipped game rolls tiers');
  const off = simulateRun(4242, 'GREED_DAMAGE', { rarity: false });
  const on = simulateRun(4242, 'GREED_DAMAGE', { rarity: true });
  assert.ok(Number.isFinite(off.survivalTime) && Number.isFinite(on.survivalTime),
    'both cells run clean');
  const r = on.survivalTime / off.survivalTime;
  assert.ok(r > 0.9 && r < 1.1, 'the layer is a flavour shift, not a wall (ratio ' + r.toFixed(3) + ')');
});

S.check('PART D invariants hold with the layer folded in (bad 100% dead, good >=3/5, one bad pick >=0.8x)', () => {
  const N = 12, SEED = 4242;
  const good = simulateCohort(SEED, N, 'GREED_DAMAGE');
  const bad = simulateCohort(SEED, N, 'ADVERSARIAL_BAD');
  assert.ok(bad.every(x => x.dead), 'every deliberately-bad run dies before the limit');
  const v = divergenceVerdict(good, bad);
  assert.ok(v.winCount >= 3, 'good beats bad on >=3 of 5 minute-10 metrics (got ' + v.winCount + ')');
  // One bad pick never loses a run: hold a card the policy would not choose at
  // t=0 (the startCards probe) and the cohort must keep >=0.8x survival.
  const pick = simulateCohort(SEED, N, 'GREED_DAMAGE', { startCards: [RULE_IDS[0]] });
  const mean = c => c.reduce((s, x) => s + x.survivalTime, 0) / c.length;
  const ratio = mean(pick) / mean(good);
  assert.ok(ratio >= 0.8, 'one bad pick keeps >=0.8x survival (ratio ' + ratio.toFixed(3) + ')');
});

S.done();
console.log('test_rarity: ' + asyncPassed + ' awaited seam checks passed');
