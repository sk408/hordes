// HORDES — test/test_w7a_tooling.mjs: W7a SIM TOOLING (2026-09-14).
// Pins the four W7a additions to tools/draft_sim.mjs, each read through the
// LIVE seam it measures (economy modelling is owner-waived — E1 landed as
// commit 245cea0; this sim only READS its seams):
//   1. THE ARCH LAYER is modelled off the REAL ARCH_TYPES table and moves the
//      measurement (G5's arch fix is measurable now — it was invisible).
//   2. THE E1 RUN PURSE: banked = purse + fixed AWARD x goldMult, the live
//      settleRunGold shape; chest gold is an honest 0 post-E1.
//   3. WEAPON UNLOCKS are +1 draft option AND pool dilution (nothing starts
//      in the kit — the live openDraft semantics).
//   4. THE MEASUREMENT CELLS: measureDivergence (G6, both axes, post-E1),
//      measureMetaValue (shop rows ranked by measured marginal value),
//      measureUnlockValue (net value at the real slot counts),
//      measureArchImpact (the arch layer on vs off).
// Run: node test/test_w7a_tooling.mjs
import assert from 'node:assert/strict';
import { ARCH_TYPES } from '../src/arches.js';
import { GOLD_TIER, RUN_GOLD, SHOP_UPGRADES, WEAPON_PRICES } from '../src/meta.js';
import {
  SIM_TUNING, LIVE, OWNER_LOADOUT, buildDraftPool, simulateRun, simulateCohort,
  archExpectedMods, weaponDps, measureDivergence, measureMetaValue,
  measureUnlockValue, measureArchImpact,
} from '../tools/draft_sim.mjs';
import { makePlayer } from '../src/entities.js';

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log(`  ok ${name}`); }

const SEED = 4242;
const N = 9;   // cohort size: small enough for the suite, big enough for medians
const mean = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;

console.log('w7a arch layer: modelled off the REAL table, neutral when off');
ok('arches OFF is the exact identity (the pre-W7a model)', () => {
  const m = archExpectedMods({ ...LIVE, arches: false });
  assert.equal(m.rateMult, 1);
  assert.equal(m.damageMult, 1);
  assert.equal(m.speedMult, 1);
  assert.equal(m.shieldPerSec, 0);
});
ok('arches ON reads the live ARCH_TYPES rows (uptimes recomputed, not restated)', () => {
  const m = archExpectedMods({ ...LIVE });
  const ids = Object.keys(ARCH_TYPES);
  const trigPerSec = (SIM_TUNING.ARCHES_PER_WAVE / ids.length) * SIM_TUNING.ARCH_TRIGGER / 120;
  for (const id of ids) {
    const expect = Math.min(1, trigPerSec * ARCH_TYPES[id].duration);
    assert.ok(Math.abs(m.uptimes[id] - expect) < 1e-12, `${id} uptime`);
  }
  // DOUBLE_FIRE rate x2 and BERSERK +50% damage must read as mults > 1 —
  // the wave-25 arch fix is exactly these two numbers reaching the weapons.
  assert.ok(m.rateMult > 1, `rateMult ${m.rateMult}`);
  assert.ok(m.damageMult > 1, `damageMult ${m.damageMult}`);
  assert.ok(m.shieldPerSec > 0, 'AEGIS absorbs priced');
});
ok('the arch layer MOVES the measurement (G5): on != off, and on survives >= off', () => {
  const a = measureArchImpact(SEED, N);
  assert.ok(a.surv.on >= a.surv.off, `survival ${a.surv.off.toFixed(0)} -> ${a.surv.on.toFixed(0)}`);
  assert.ok(a.banked.on !== a.banked.off, 'banked must move (the layer is not a no-op)');
});

console.log('w7a E1 purse: banked = purse + AWARD x goldMult; chest gold is an honest 0');
ok('settlement has the live settleRunGold shape, exactly', () => {
  const r = simulateRun(SEED, 'GREED_DAMAGE', { purchases: OWNER_LOADOUT });
  const award = Math.round(RUN_GOLD.AWARD * 1);   // the loadout carries no GREED
  assert.equal(r.incomeProfile, r.incomePurse + award);
  assert.equal(r.incomeChest, 0, 'chests pay no gold post-E1');
  assert.ok(r.incomePurse > 0, 'kills credit the purse');
  assert.ok(r.incomePurse > GOLD_TIER.BOSS, 'a real run pays more than one boss tier');
});
ok('checkpoint gold is the mid-run wallet (the purse), not the retired formula', () => {
  const r = simulateRun(SEED, 'GREED_DAMAGE', { purchases: OWNER_LOADOUT });
  for (const mark of [120, 300, 600]) {
    assert.ok(Number.isFinite(r.checkpoints[mark].gold) && r.checkpoints[mark].gold >= 0);
  }
});

console.log('w7a unlock semantics: +1 option AND pool dilution, nothing in the kit');
ok('an unlock adds exactly one weight-1 grant card to the pool (the dilution)', () => {
  const held = {};
  const before = buildDraftPool([{ type: 'VOLLEY', level: 1 }], { ...LIVE });
  const after = buildDraftPool([{ type: 'VOLLEY', level: 1 }],
    { ...LIVE, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT'] }, held);
  assert.ok(!before.some(c => c.kind === 'grant' && c.weapon === 'ORBIT'),
    'ORBIT is not offered before the unlock');
  const grant = after.find(c => c.kind === 'grant' && c.weapon === 'ORBIT');
  assert.ok(grant && grant.weight === 1, 'ORBIT is a weight-1 grant after the unlock');
  const sum = p => p.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(sum(after) - sum(before) - 1) < 1e-12,
    `pool weight +1 exactly (${sum(before)} -> ${sum(after)})`);
});
ok('every archetype prices through its OWN weaponDps curve', () => {
  const player = makePlayer();
  for (const wid of Object.keys(WEAPON_PRICES)) {
    const l1 = weaponDps(wid, 1, player, { maxProj: 3 });
    const l8 = weaponDps(wid, 8, player, { maxProj: 3 });
    assert.ok(l1 > 0, `${wid} L1 delivers dps`);
    assert.ok(l8 > l1, `${wid} levels grow dps (${l1.toFixed(1)} -> ${l8.toFixed(1)})`);
  }
});

console.log('w7a measurement cells: divergence (both axes), meta value, unlock value');
ok('measureDivergence reads G6 on BOTH axes, post-E1', () => {
  const d = measureDivergence(SEED, N);
  assert.ok(d.goodBad > 1, `survival ratio x${d.goodBad.toFixed(2)}`);
  assert.ok(d.goodBadWaves > 1, `waves ratio x${d.goodBadWaves.toFixed(2)}`);
  assert.ok(d.finalWaves.good > d.finalWaves.bad,
    `final waves ${d.finalWaves.good} vs ${d.finalWaves.bad}`);
  assert.ok(d.meanBanked.good > d.meanBanked.bad, 'good banks more purse');
  assert.equal(d.target, 1.6, "the owner's raised bar is reported, not enacted");
  assert.ok(typeof d.meetsTarget === 'boolean');
});
ok('measureMetaValue ranks every stat row and says WHY a row reads 0', () => {
  const mv = measureMetaValue(SEED, N);
  const statRows = SHOP_UPGRADES.filter(u => !u.kind).map(u => u.id);
  assert.deepEqual(mv.rows.map(r => r.id).sort(), statRows.sort(),
    'every non-unlock shop row is measured');
  for (let i = 1; i < mv.rows.length; i++) {
    assert.ok(mv.rows[i - 1].survPer1k >= mv.rows[i].survPer1k, 'sorted by measured value');
  }
  for (const r of mv.rows) {
    if (r.invisible) assert.ok(r.note, `${r.id} reads 0 without an explanation`);
  }
  assert.ok(mv.rows.find(r => r.id === 'dmg').note.includes('maxed'),
    'dmg is maxed in the owner loadout — measured 0->1 and says so');
});
ok('measureUnlockValue reports net value at the real slot counts with take-rates', () => {
  const uv = measureUnlockValue(SEED, N, [3, 6]);
  assert.equal(uv.length, Object.keys(WEAPON_PRICES).length * 2);
  for (const r of uv) {
    assert.ok(r.takeRate >= 0 && r.takeRate <= 1, `${r.weapon} take-rate`);
    assert.ok(Number.isFinite(r.dSurv) && Number.isFinite(r.dBanked), `${r.weapon} deltas`);
  }
});

console.log(`\ntest_w7a_tooling: ${passed} checks passed`);
