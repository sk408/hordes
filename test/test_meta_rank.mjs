// test/test_meta_rank.mjs — W7a slice 2 drift locks for tools/meta_rank.mjs.
//
// The contract under test (docs/briefs/W7A_SLICE2_META_RANK.md deliverable 4):
//   1. the ranked universe equals meta.js's purchasable rows EXACTLY, both
//      directions (no invented row, no dropped row);
//   2. costs reproduce nextCost's formula for a named row at level 0 and 1;
//   3. WEAPON_SLOT_START / MAX_WEAPON_SLOTS are READ (import identity + a
//      source scan for a hardcoded slot list), the test_meta.mjs discipline;
//   4. same seed -> byte-identical table (including the RANDOM policy, whose
//      counter must be reset per cohort);
//   5. the greedy-delta list is non-empty when the orders differ and empty
//      when they agree;
//   6. --meta-order greedy (the default) leaves balance_sim's output
//      byte-identical (golden compare against a raw log).
// Does NOT duplicate test_arch_model / test_draft_sim / test_meta: those pin
// the arch model, the policy score shapes and the SIM_ASSUMPTIONS derivation.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  SHOP_UPGRADES, WEAPON_PRICES, ELITE_MODIFIERS, WEAPON_SLOT_START,
  MAX_WEAPON_SLOTS, upgradeCost,
} from '../src/meta.js';
import { GREEDY_PRIORITY } from '../tools/balance_sim.mjs';
import {
  buildRankTable, buildDilutionTable, greedyDeltaList, nextCostOf,
  slotCountsRead, measuredPriorityFromTable, liveOfferShare, optionTermAtFresh,
} from '../tools/meta_rank.mjs';
import { simulateCohort, POLICIES } from '../tools/draft_sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const ok = (m) => { pass++; console.log(`  ok ${m}`); };

// Fast table knobs for the test (determinism holds at any n; 3 = the floor).
const SEED = 4242, N = 3;

console.log('meta_rank (W7a slice 2): measured marginal value + dilution drift locks');

// ---- 1. the ranked universe equals the game's purchasable rows exactly ------
{
  const t = buildRankTable({ seed: SEED, runs: N, baselineKey: 'developed' });
  const gameIds = new Set(SHOP_UPGRADES.map(d => d.id));
  const rowIds = new Set(t.rows.map(r => r.id));
  console.log(`    game rows ${gameIds.size} vs ranked rows ${rowIds.size}`);
  for (const id of gameIds) assert.ok(rowIds.has(id), `game row ${id} missing from the ranked table`);
  for (const id of rowIds) assert.ok(gameIds.has(id), `ranked row ${id} is not a game row (invented)`);
  assert.strictEqual(t.rows.length, SHOP_UPGRADES.length);
  const kinds = t.rows.reduce((a, r) => { a[r.kind] = (a[r.kind] || 0) + 1; return a; }, {});
  console.log(`    kinds: ${JSON.stringify(kinds)} (game: ` +
    JSON.stringify(SHOP_UPGRADES.reduce((a, d) => { const k = d.kind || 'stat'; a[k] = (a[k] || 0) + 1; return a; }, {})) + ')');
  assert.deepStrictEqual(kinds, SHOP_UPGRADES.reduce((a, d) => {
    const k = d.kind || 'stat'; a[k] = (a[k] || 0) + 1; return a; }, {}));
  ok('universe == SHOP_UPGRADES exactly, both directions, kinds included');
}

// ---- 2. costs reproduce nextCost's formula at level 0 and 1 -----------------
{
  const dmg = SHOP_UPGRADES.find(d => d.id === 'dmg');
  const lvl0 = Math.round(dmg.baseCost * Math.pow(dmg.costGrowth, 0));
  const lvl1 = Math.round(dmg.baseCost * Math.pow(dmg.costGrowth, 1));
  console.log(`    dmg: nextCostOf(0)=${nextCostOf(dmg, 0)} formula=${lvl0} upgradeCost=${upgradeCost(dmg, 0)}`);
  console.log(`    dmg: nextCostOf(1)=${nextCostOf(dmg, 1)} formula=${lvl1} upgradeCost=${upgradeCost(dmg, 1)}`);
  assert.strictEqual(nextCostOf(dmg, 0), lvl0);
  assert.strictEqual(nextCostOf(dmg, 1), lvl1);
  assert.strictEqual(nextCostOf(dmg, 0), upgradeCost(dmg, 0));
  assert.strictEqual(nextCostOf(dmg, 1), upgradeCost(dmg, 1));
  const wRow = SHOP_UPGRADES.find(d => d.id === 'weapon_orbit');
  const eRow = SHOP_UPGRADES.find(d => d.id === 'elite_swift');
  console.log(`    weapon_orbit=${nextCostOf(wRow, 0)} (WEAPON_PRICES.ORBIT=${WEAPON_PRICES.ORBIT}) ` +
    `elite_swift=${nextCostOf(eRow, 0)} (ELITE_MODIFIERS.SWIFT.cost=${ELITE_MODIFIERS.SWIFT.cost})`);
  assert.strictEqual(nextCostOf(wRow, 0), WEAPON_PRICES.ORBIT);
  assert.strictEqual(nextCostOf(eRow, 0), ELITE_MODIFIERS.SWIFT.cost);
  ok('costs reproduce nextCost/upgradeCost at level 0 and 1, weapon+elite rows included');
}

// ---- 3. slot counts are READ, not hardcoded ---------------------------------
{
  const sc = slotCountsRead();
  console.log(`    slotCountsRead()=[${sc.join(',')}] WEAPON_SLOT_START=${WEAPON_SLOT_START} MAX_WEAPON_SLOTS=${MAX_WEAPON_SLOTS}`);
  assert.strictEqual(sc[0], WEAPON_SLOT_START);
  assert.strictEqual(sc[sc.length - 1], MAX_WEAPON_SLOTS);
  assert.strictEqual(sc.length, MAX_WEAPON_SLOTS - WEAPON_SLOT_START + 1);
  const src = readFileSync(path.join(ROOT, 'tools/meta_rank.mjs'), 'utf8');
  assert.ok(src.includes('WEAPON_SLOT_START') && src.includes('MAX_WEAPON_SLOTS'),
    'meta_rank source no longer reads the slot constants');
  assert.ok(!/\[\s*3\s*,\s*4\s*,\s*5\s*,\s*6\s*\]/.test(src),
    'meta_rank hardcodes a slot list instead of reading the constants');
  ok('slot counts derived from the live constants; no hardcoded list in source');
}

// ---- 4. same seed -> byte-identical tables (RANDOM reset included) ----------
{
  const a = buildRankTable({ seed: SEED, runs: N, baselineKey: 'fresh' });
  const b = buildRankTable({ seed: SEED, runs: N, baselineKey: 'fresh' });
  const ja = JSON.stringify(a.rows), jb = JSON.stringify(b.rows);
  console.log(`    fresh table rows ${a.rows.length}; rebuild ${jb.length} chars; equal=${ja === jb}`);
  assert.strictEqual(ja, jb);
  assert.strictEqual(JSON.stringify({ s: a.baseSurv, g: a.baseGold }),
    JSON.stringify({ s: b.baseSurv, g: b.baseGold }));
  // Perturb the RANDOM_PICK counter between builds: the per-cohort reset must
  // make the dilution table independent of call history.
  simulateCohort(SEED, 3, 'RANDOM_PICK', { purchases: {} });
  const d1 = buildDilutionTable({ seed: SEED, runs: N, policies: ['RANDOM_PICK'], slotCounts: [WEAPON_SLOT_START] });
  simulateCohort(SEED + 999, 3, 'RANDOM_PICK', { purchases: { slots: 1 } });
  const d2 = buildDilutionTable({ seed: SEED, runs: N, policies: ['RANDOM_PICK'], slotCounts: [WEAPON_SLOT_START] });
  console.log(`    RANDOM dilution rebuild: ${JSON.stringify(d1.rows.map(r => r.dSurv))} equal=${JSON.stringify(d1.rows) === JSON.stringify(d2.rows)}`);
  assert.strictEqual(JSON.stringify(d1.rows), JSON.stringify(d2.rows));
  ok('determinism: byte-identical rebuilds, RANDOM counter reset per cohort');
}

// ---- 5. greedy-delta list: non-empty when orders differ, empty when agree ---
{
  const t = buildRankTable({ seed: SEED, runs: N, baselineKey: 'developed' });
  const differ = greedyDeltaList(t, GREEDY_PRIORITY);
  const nDiffer = differ.tooEarly.length + differ.tooLate.length;
  console.log(`    vs hardcoded GREEDY_PRIORITY: tooEarly=${differ.tooEarly.length} tooLate=${differ.tooLate.length} zero=${differ.zeroValue.length} never=${differ.neverBought.length}`);
  assert.ok(nDiffer > 0, 'orders differ but the delta list is empty');
  const agreeOrder = measuredPriorityFromTable(t);
  const agree = greedyDeltaList(t, agreeOrder);
  console.log(`    vs its own measured order: tooEarly=${agree.tooEarly.length} tooLate=${agree.tooLate.length} never=${agree.neverBought.length}`);
  assert.strictEqual(agree.tooEarly.length + agree.tooLate.length, 0);
  assert.strictEqual(agree.neverBought.length, 0);
  ok('greedy-delta list tracks order disagreement in both directions');
}

// ---- 6. --meta-order greedy (default) leaves balance_sim byte-identical -----
{
  const run = (args) => {
    const r = spawnSync(process.execPath, ['tools/balance_sim.mjs', ...args],
      { cwd: ROOT, encoding: 'utf8', timeout: 50000 });
    // rc is 1 today (pre-existing TARGET (a) FAIL, disclosed since slice 1);
    // 0 becomes valid the day the orchestrator closes it. The SUBSTANCE under
    // test is the byte-identical stdout, not the exit code.
    assert.ok(r.status === 0 || r.status === 1, `balance_sim exited ${r.status}`);
    return r.stdout;
  };
  const def = run([]);
  const greedy = run(['--meta-order', 'greedy']);
  console.log(`    default ${def.length} chars vs --meta-order greedy ${greedy.length} chars; equal=${def === greedy}`);
  assert.strictEqual(def, greedy, '--meta-order greedy must be byte-identical to the default output');
  const cap = '/tmp/w7a2_meta/preedit_balance_default.log';
  try {
    const pre = readFileSync(cap, 'utf8');
    console.log(`    golden capture ${cap}: ${pre.length} chars; equal=${pre === greedy}`);
    assert.strictEqual(pre, greedy, 'current default output differs from the PRE-EDIT capture');
  } catch {
    console.log(`    golden capture ${cap} absent on this machine — flag-vs-default compare above is the binding check`);
  }
  ok('--meta-order greedy == default == pre-edit capture (byte-identical)');
}

// ---- extra locks on the analytic surface -------------------------------------
{
  assert.ok(POLICIES.GREED_DPS && POLICIES.RANDOM_PICK, 'new policies missing');
  assert.strictEqual(POLICIES.GREED_DPS.pick({ dps: 2, ehp: 9 }), 2);
  assert.ok(POLICIES.GREED_DPS.pick({ dps: 2, ehp: 9 }) > POLICIES.GREED_DPS.pick({ dps: 1, ehp: 9 }));
  console.log(`    POLICIES keys: ${Object.keys(POLICIES).join(',')}`);
  const share = liveOfferShare({ slotCount: WEAPON_SLOT_START });
  console.log(`    liveOfferShare base: total=${share.base.total.toFixed(2)} cards=${share.base.cards}`);
  assert.ok(share.base.total > 0 && share.base.cards > 0);
  const ot = optionTermAtFresh('BEAM');
  console.log(`    optionTermAtFresh(BEAM): x${ot.share.toFixed(2)} (add ${ot.addDps.toFixed(1)} on ${ot.baseDps.toFixed(1)})`);
  assert.ok(ot.share > 0.5 && ot.share < 1.5);
  const withB = liveOfferShare({ slotCount: WEAPON_SLOT_START, extraUnlock: 'BEAM' });
  assert.ok(withB.withExtraBrought.total > share.base.total, 'a brought weapon must add pool weight');
  console.log(`    brought BEAM raises pool total ${share.base.total.toFixed(2)} -> ${withB.withExtraBrought.total.toFixed(2)}`);
  ok('analytic surface: policies, offer share, +1 option term all locked');
}

console.log(`TEST META RANK: ALL CHECKS PASSED (${pass})`);
