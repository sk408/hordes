// HORDES — TIER-2 CONTENT (a): 14 new rare-item finds (2026-09-23).
//
// Pins the append-only extension of loot.js AFFIX_POOL (10 -> 24) plus the
// per-affix portraits (src/art/item_icons.js) and their two paint sites
// (render.js belt, main.js stats card):
//   1. registry presence (ids/fields/bases/names/nouns/desc-quotes-base),
//      original 10 untouched at indices 0..9, LEGENDARIES still exactly 4,
//      rarity + world-drop tables UNCHANGED (odds quoted before/after);
//   2. append-only rng proof (0.0 draws still resolve to original affixes);
//   3. art composition/palette contract + itemIconFor/paintItemIcon seam;
//   4. equip flow through the REAL world-drop pickup path (state.itemDrops ->
//      pump -> applyEquipDecision) for EQUIP / REPLACE / IGNORE, with the
//      strict-better boundary pinned on new-affix items;
//   5. odds table sums + seeded determinism (same seed, same items).
//
// Run: node test/test_tier2_items.mjs
import assert from 'node:assert/strict';
import {
  AFFIX_POOL, LEGENDARIES, RARITY_WEIGHTS,
  rollItem, rollItemOfRarity, decideEquip, applyAffixes, itemScore,
  MAX_EQUIPPED,
} from '../src/loot.js';
import { BASE_RARITY_WEIGHTS, luckDropWeights } from '../src/meta.js';
import { CONFIG as C } from '../src/config.js';
import {
  ITEM_AFFIX_ART, ITEM_AFFIX_ART_IDS, artForAffix, itemIconFor, paintItemIcon,
} from '../src/art/item_icons.js';
import { boot, suite } from './_harness.mjs';

const S = suite('tier-2 items (a)');

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1})`);
    return vals[i++];
  };
};
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The 14 new finds: id -> [field, base, noun]. Bases are the EXISTING
// same-field bases (loot.js) — flavor-invariant scoring by construction.
const NEW_FINDS = {
  ironbrand: ['damageMult', 0.1], sunder: ['damageMult', 0.1],
  truesight: ['crit', 0.04], witchmark: ['crit', 0.04],
  heartseeker: ['critMult', 0.2], allegro: ['rateMult', 0.1],
  mintmark: ['goldMult', 0.15], blackledger: ['goldMult', 0.15],
  archivist: ['xpMult', 0.1],
  strider: ['speedMult', 0.08], tailwind: ['speedMult', 0.08],
  dragnet: ['pickupMult', 0.25],
  thistlecoat: ['thorns', 3], redtithe: ['lifesteal', 0.02],
};
const NEW_IDS = Object.keys(NEW_FINDS);
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ---- 1. registry -----------------------------------------------------------
S.check('pool grew 10 -> 24, originals first and untouched', () => {
  assert.equal(AFFIX_POOL.length, 24, '10 originals + 14 tier-2 finds');
  const origIds = ['crit', 'critMult', 'rateMult', 'damageMult', 'xpMult',
    'goldMult', 'speedMult', 'pickupMult', 'thorns', 'lifesteal'];
  assert.deepEqual(AFFIX_POOL.slice(0, 10).map(a => a.id), origIds,
    'original 10 keep indices 0..9 (append-only)');
  assert.deepEqual(AFFIX_POOL.slice(10).map(a => a.id), NEW_IDS,
    'tier-2 finds appended in lane order');
});
S.check('every new find reuses its field base, unique name/noun/id', () => {
  const names = new Set(), nouns = new Set(), ids = new Set(AFFIX_POOL.map(a => a.id));
  assert.equal(ids.size, 24, 'no duplicate affix ids');
  for (const [id, [field, base]] of Object.entries(NEW_FINDS)) {
    const def = AFFIX_POOL.find(a => a.id === id);
    assert.ok(def, id + ' is registered');
    assert.equal(def.field, field, id + ' field');
    assert.equal(def.base, base, id + ' base === existing same-field base');
    assert.ok(def.name && /^[A-Za-z ]+$/.test(def.name), id + ' ASCII name');
    assert.ok(def.noun && /^[A-Za-z]+$/.test(def.noun), id + ' ASCII noun');
    assert.ok(!names.has(def.name), id + ' name unique');
    assert.ok(!nouns.has(def.noun), id + ' noun unique');
    names.add(def.name); nouns.add(def.noun);
    assert.ok(def.desc.includes(String(base === 3 ? '3' : base * 100)) ||
      def.desc.includes(String(base)), id + ' desc quotes its base');
  }
});
S.check('rarity + world-drop tables UNCHANGED (odds quoted, not moved)', () => {
  assert.deepEqual(BASE_RARITY_WEIGHTS, { COMMON: 98, RARE: 1.7, EPIC: 0.2, LEGENDARY: 0.02 });
  assert.equal(RARITY_WEIGHTS, BASE_RARITY_WEIGHTS, 'shared table alias intact');
  assert.deepEqual(luckDropWeights(0), { ...BASE_RARITY_WEIGHTS }, 'luck 0 == base');
  assert.equal(C.ITEMS.DROP_CHANCE, 0.02, 'normal-kill item chance untouched');
  assert.equal(C.ITEMS.ELITE_CHANCE, 0.5, 'elite-kill item chance untouched');
  assert.equal(C.ITEMS.BOSS_TIER_BIAS, 1.5, 'boss up-tier bias untouched');
  assert.equal(Object.keys(LEGENDARIES).length, 4, 'named legendaries still exactly 4');
  assert.equal(MAX_EQUIPPED, 4, 'belt still 4 slots');
});

// ---- 2. append-only rng proof ----------------------------------------------
S.check('0.0 draws still resolve to the ORIGINAL affixes (no rng-order move)', () => {
  const c = rollItem(seq([0.0, 0.0]));
  assert.equal(c.rarity, 'COMMON');
  assert.equal(c.affixes[0].id, 'crit', 'COMMON 0.0 -> Keen Eye, as before');
  const r = rollItem(seq([0.99, 0.0, 0.0]));
  assert.deepEqual(r.affixes.map(a => a.id), ['crit', 'critMult'],
    'RARE 0.0s -> first two originals, as before');
  const e = rollItem(seq([0.9985, 0.0, 0.0, 0.0]));
  assert.deepEqual(e.affixes.map(a => a.id), ['crit', 'critMult', 'rateMult'],
    'EPIC 0.0s -> first three originals, as before');
});
S.check('high draws reach the new finds; names generate off new nouns', () => {
  const c = rollItemOfRarity('COMMON', seq([23.5 / 24]));
  assert.equal(c.affixes[0].id, 'redtithe', 'top draw index 23 = last appended find');
  assert.equal(c.name, 'Worn Leech', 'PREFIX + new noun names the item');
  const r = rollItemOfRarity('RARE', seq([0.0, 23.5 / 24]));
  assert.deepEqual(r.affixes.map(a => a.id), ['crit', 'redtithe'],
    'mixed old/new affixes share one item (additive, no combat touch)');
});

// ---- 3. art -----------------------------------------------------------------
S.check('14 portraits: 8x8 integer grids, house palette contract', () => {
  assert.deepEqual([...ITEM_AFFIX_ART_IDS].sort(), [...NEW_IDS].sort(),
    'one portrait per new find, no more, no fewer');
  for (const id of NEW_IDS) {
    const a = ITEM_AFFIX_ART[id];
    const label = 'art/' + id;
    assert.equal(a.id, id, label + ' id');
    assert.equal(a.w, 8, label + ' w=8');
    assert.equal(a.h, 8, label + ' h=8');
    assert.equal(a.grid.length, 8, label + ' 8 rows');
    let ink = 0;
    const used = new Set();
    for (let y = 0; y < 8; y++) {
      assert.equal(a.grid[y].length, 8, label + ' row ' + y + ' 8 wide');
      for (const v of a.grid[y]) {
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 9, label + ' int cell 0-9');
        if (v) { ink++; used.add(v); }
      }
    }
    assert.ok(ink > 0, label + ' has pixels');
    const cov = ink / 64;
    assert.ok(cov >= 0.12 && cov <= 0.9, label + ' coverage ' + cov.toFixed(2));
    assert.deepEqual(a.rows, a.grid.map(r => r.join('')), label + ' rows derive from grid');
    const keys = Object.keys(a.palette);
    assert.ok(keys.length >= 1 && keys.length <= 5, label + ' <=5 inks');
    for (const k of keys) {
      assert.ok(/^[1-9]$/.test(k), label + ' key 1-9');
      assert.ok(HEX.test(a.palette[k]), label + ' hex colour');
    }
    for (const v of used) assert.ok(a.palette[v], label + ' every used index defined');
  }
  const sigs = NEW_IDS.map(id => ITEM_AFFIX_ART[id].grid.flat().join(','));
  assert.equal(new Set(sigs).size, 14, 'all 14 silhouettes distinct');
});
S.check('itemIconFor: lead-art wins, legacy resolves null (generic gem)', () => {
  const legacy = { id: 'x', rarity: 'COMMON', affixes: [{ id: 'crit', field: 'crit', magnitude: 0.04 }] };
  assert.equal(itemIconFor(legacy), null, 'legacy affixes keep the generic gem');
  const fresh = { id: 'y', rarity: 'RARE', affixes: [{ id: 'sunder', field: 'damageMult', magnitude: 0.15 }] };
  assert.equal(itemIconFor(fresh), ITEM_AFFIX_ART.sunder, 'new find resolves its portrait');
  const mixed = { id: 'z', rarity: 'EPIC',
    affixes: [{ id: 'crit', field: 'crit', magnitude: 0.088 }, { id: 'sunder', field: 'damageMult', magnitude: 0.22 }] };
  assert.equal(itemIconFor(mixed), ITEM_AFFIX_ART.sunder, 'first art-carrying affix wins');
  assert.equal(itemIconFor(null), null, 'null-safe');
  assert.equal(itemIconFor({ id: 'q' }), null, 'affix-less safe');
  assert.equal(artForAffix('nope'), null, 'unknown affix id -> null');
});
S.check('paintItemIcon issues one drawGrid call with the art pixels', () => {
  const calls = [];
  const fake = (g, grid, palette, x, y, s) => calls.push({ g, grid, palette, x, y, s });
  paintItemIcon(fake, 'CTX', ITEM_AFFIX_ART.dragnet, 6, 10, 1);
  assert.equal(calls.length, 1, 'exactly one drawGrid call');
  assert.equal(calls[0].g, 'CTX', 'context passes through');
  assert.equal(calls[0].grid, ITEM_AFFIX_ART.dragnet.grid, 'real grid, not a copy');
  assert.equal(calls[0].palette, ITEM_AFFIX_ART.dragnet.palette, 'real palette');
  assert.deepEqual([calls[0].x, calls[0].y, calls[0].s], [6, 10, 1], 'origin + scale pass through');
});

// ---- 4. score + decideEquip on new-affix items (pure core) -------------------
S.check('new affixes score flavor-invariantly (base-normalized)', () => {
  const oldDmg = { id: 'o', rarity: 'COMMON', affixes: [{ id: 'damageMult', field: 'damageMult', magnitude: 0.1 }] };
  const newDmg = { id: 'n', rarity: 'COMMON', affixes: [{ id: 'sunder', field: 'damageMult', magnitude: 0.1 }] };
  assert.equal(itemScore(newDmg), itemScore(oldDmg), 'same field+scale == same score');
  assert.equal(itemScore(newDmg), 1 + 1, 'COMMON base-scale affix scores 2 either way');
});
S.check('decideEquip EQUIP/REPLACE/IGNORE with new-affix items', () => {
  const weak = (id) => ({ id, rarity: 'COMMON',
    affixes: [{ id: 'crit', name: 'Keen Eye', field: 'crit', magnitude: 0.04 }] });
  const epicSunder = { id: 'epic1', rarity: 'EPIC',
    affixes: [{ id: 'sunder', name: 'Sunder', field: 'damageMult', magnitude: 0.22 }] };
  assert.deepEqual(decideEquip([], epicSunder), { action: 'EQUIP', slot: 0 }, 'empty belt EQUIPs');
  const belt = [weak('a'), weak('b'), weak('c'), weak('d')];
  assert.deepEqual(decideEquip(belt, epicSunder), { action: 'REPLACE', slot: 0 },
    'strictly-better new-affix EPIC REPLACES the weakest');
  const equalNew = { id: 'eq', rarity: 'COMMON',
    affixes: [{ id: 'redtithe', name: 'Red Tithe', field: 'lifesteal', magnitude: 0.02 }] };
  assert.deepEqual(decideEquip(belt, equalNew), { action: 'IGNORE', slot: null },
    'equal-score new-affix drop is left on the ground (STRICTLY better rule)');
  const worseNew = { id: 'wo', rarity: 'COMMON',
    affixes: [{ id: 'redtithe', name: 'Red Tithe', field: 'lifesteal', magnitude: 0.01 }] };
  assert.ok(itemScore(worseNew) < itemScore(belt[0]), 'precondition: test drop is worse');
  assert.deepEqual(decideEquip(belt, worseNew), { action: 'IGNORE', slot: null }, 'downgrade ignored');
});

// ---- 5. odds: quoted before/after + measured --------------------------------
// BEFORE: affix pick uniform over 10 (each affix 1/10 per draw).
// AFTER:  uniform over 24 (each affix 1/24 per draw).
//   COMMON P(specific affix): 10% -> 4.167%
//   RARE   P(specific affix on item, 2 distinct): 20% -> 8.333%
//   EPIC   P(specific affix on item, 3 distinct): 30% -> 12.5%
//   dual-flavor FIELDS per pick (damageMult/crit/goldMult/speedMult):
//     10% -> 2/24 = 8.333%; single-flavor fields: 10% -> 4.167%.
//   P(COMMON item carries >=1 NEW find): 0 -> 14/24 = 58.33%
//   P(RARE   item carries >=1 NEW find): 0 -> 1-(10/24)(9/23) = 83.72%
//   P(EPIC   item carries >=1 NEW find): 0 -> 1-(10/24)(9/23)(8/22) = 94.08%
S.check('measured new-find rates match the quoted 10->24 uniform extension', () => {
  const N = 20000;
  const has = (item) => item.affixes.some(a => NEW_IDS.includes(a.id));
  const rate = (rarity, draws) => {
    const rng = mulberry32(0x71E2);
    let n = 0;
    for (let i = 0; i < N; i++) if (has(rollItemOfRarity(rarity, rng))) n++;
    return n / N;
  };
  const close = (got, want, label) => {
    assert.ok(Math.abs(got - want) < 0.02, `${label}: measured ${got.toFixed(4)} vs quoted ${want.toFixed(4)}`);
  };
  close(rate('COMMON'), 14 / 24, 'COMMON new-find rate');
  close(rate('RARE'), 1 - (10 / 24) * (9 / 23), 'RARE new-find rate');
  close(rate('EPIC'), 1 - (10 / 24) * (9 / 23) * (8 / 22), 'EPIC new-find rate');
  // Per-affix pick share: every find lands ~1/24 of COMMON picks.
  const rng = mulberry32(0x9A17);
  const tally = {};
  for (let i = 0; i < N; i++) {
    const id = rollItemOfRarity('COMMON', rng).affixes[0].id;
    tally[id] = (tally[id] || 0) + 1;
  }
  for (const id of NEW_IDS) {
    const share = (tally[id] || 0) / N;
    assert.ok(Math.abs(share - 1 / 24) < 0.01, `${id} pick share ~1/24 (got ${share.toFixed(4)})`);
  }
});
S.check('rolls are deterministic: same seed, same items', () => {
  const run = (seed) => {
    const rng = mulberry32(seed);
    const out = [];
    for (let i = 0; i < 200; i++) {
      const it = rollItem(rng, 0, RARITY_WEIGHTS);
      out.push(it.rarity + ':' + it.name + ':' + it.affixes.map(a => a.id).join('+'));
    }
    return out;
  };
  assert.deepEqual(run(1234), run(1234), 'same seed replays exactly');
  assert.notDeepEqual(run(1234), run(987), 'different seeds diverge');
});

// ---- 6. LIVE: the real world-drop pickup path (applyEquipDecision) ----------
// state.itemDrops -> pump -> main.js pickup loop -> applyEquipDecision.
// EQUIP fills, REPLACE swaps the weakest on STRICTLY better, IGNORE leaves
// the drop on the ground. Stats deltas prove affixes apply/remove for real.
{
  const { T, state, pump } = await boot({ storage: [['hordes_onboarded', '1']] });
  const pumpLive = (n) => { for (let i = 0; i < n; i++) { state.bannerHold = 0; pump(1); } };
  const dropAtPlayer = (item) => {
    state.itemDrops.push({ x: state.player.x, y: state.player.y, item, age: 0 });
  };
  const collectSoon = (cond, label) => {
    for (let i = 0; i < 8 && !cond(); i++) pumpLive(1);
    assert.ok(cond(), label);
  };
  const weak = (id) => ({ id, name: 'Worn Eye', rarity: 'COMMON',
    affixes: [{ id: 'crit', name: 'Keen Eye', field: 'crit', magnitude: 0.04 }] });

  S.check('LIVE EQUIP: empty belt takes a new-affix drop, stats apply', () => {
    T.startRun();
    pumpLive(3);
    state.spawnTimer = 99999;
    state.wave.endsAt = state.time + 99999;
    state.enemies.length = 0; state.gems.length = 0;
    state.itemDrops.length = 0; state.drops.length = 0; state.chests.length = 0;
    assert.equal(state.items.length, 0, 'belt starts empty');
    const before = state.player.stats.crit;
    dropAtPlayer({ id: 'live-equip-1', name: 'Worn Sight', rarity: 'COMMON',
      affixes: [{ id: 'truesight', name: 'True Sight', field: 'crit', magnitude: 0.04 }] });
    collectSoon(() => state.items.length === 1, 'drop equipped through the real pickup path');
    assert.equal(state.itemDrops.length, 0, 'equipped drop leaves the ground');
    assert.equal(state.items[0].id, 'live-equip-1', 'the new-affix item is worn');
    assert.ok(Math.abs(state.player.stats.crit - (before + 0.04)) < 1e-12,
      'its affix applied to live stats');
  });

  S.check('LIVE REPLACE: full belt swaps the weakest for a better new find', () => {
    dropAtPlayer(weak('live-w2')); dropAtPlayer(weak('live-w3')); dropAtPlayer(weak('live-w4'));
    collectSoon(() => state.items.length === 4, 'belt filled to 4 through the real path');
    const critBefore = state.player.stats.crit;
    const dmgBefore = state.player.stats.damageMult;
    dropAtPlayer({ id: 'live-replace-1', name: 'Mythic Maul', rarity: 'EPIC',
      affixes: [{ id: 'sunder', name: 'Sunder', field: 'damageMult', magnitude: 0.22 }] });
    collectSoon(() => state.items.some(i => i.id === 'live-replace-1'), 'EPIC swapped in');
    assert.equal(state.items.length, 4, 'belt never grows past 4');
    assert.equal(state.items[0].id, 'live-replace-1', 'first weakest slot swapped in place');
    assert.ok(!state.items.some(i => i.id === 'live-equip-1'), 'weakest incumbent left');
    assert.ok(Math.abs(state.player.stats.damageMult - (dmgBefore + 0.22)) < 1e-12,
      'incoming affix applied');
    assert.ok(Math.abs(state.player.stats.crit - (critBefore - 0.04)) < 1e-12,
      'outgoing affix removed (mirror of apply)');
  });

  S.check('LIVE IGNORE: equal-score new-affix drop stays on the ground', () => {
    const idsBefore = state.items.map(i => i.id).join(',');
    const statsBefore = { ...state.player.stats };
    dropAtPlayer({ id: 'live-ignore-1', name: 'Worn Leech', rarity: 'COMMON',
      affixes: [{ id: 'redtithe', name: 'Red Tithe', field: 'lifesteal', magnitude: 0.02 }] });
    pumpLive(4);
    assert.equal(state.items.map(i => i.id).join(','), idsBefore, 'belt untouched');
    assert.equal(state.itemDrops.length, 1, 'the drop stays on the ground');
    assert.equal(state.itemDrops[0].item.id, 'live-ignore-1', 'it is the ignored drop');
    assert.deepEqual({ ...state.player.stats }, statsBefore, 'no stat move on IGNORE');
  });
}

S.done();
console.log('TIER2-ITEMS TESTS PASSED');
