// HORDES — META RANK (W7a slice 2): meta upgrades ranked by MEASURED marginal
// value + the weapon-unlock dilution model.
//
// OWNER DIRECTIVE (docs/HORDES_GOALS_2026-09-12.md G5, verbatim):
//   "Meta upgrades must be SIMULATED IN A RANKED ORDER DERIVED FROM MEASURED
//    MARGINAL VALUE, not a hardcoded greedy list. Report the ranking and where
//    the assumed order was wrong."
//   "Weapon unlocks must be modelled as +1 option AND draft-pool DILUTION
//    against a scarce slot count. Report each unlock's NET value at the real
//    slot counts, and answer whether unlocking is ever net-negative at 3
//    slots."
//   "Divergence (G6) must be reported for BOTH a fresh profile and a developed
//    one." (measurement only — the G6/W7b ladder is frozen by owner ruling.)
//
// ============================ HONESTY BLOCK ==================================
// READ FROM THE GAME (never redeclared here):
//   - the ENTIRE purchasable universe: src/meta.js SHOP_UPGRADES (46 rows:
//     36 stat + 7 weapon + 3 elite), WEAPON_PRICES, ELITE_MODIFIERS,
//     STARTER_WEAPONS, WEAPON_SLOT_START (3) / MAX_WEAPON_SLOTS (6),
//     applyMetaBonuses, upgradeCost.
//   - the draft pool at the game's own weights: tools/draft_sim.mjs
//     buildDraftPool (stat cards at meta.js draftCardWeight, weapon cards at
//     weight 1, families at their imported constants) — the same pool
//     openDraft mirrors. Offer size 3 is read from src/main.js openDraft
//     (offerN = 3 + stats.draftOffers; base 3 at a fresh profile) and mirrored
//     by the sim's rollThree; it is NOT exportable from src/ without an edit,
//     so it is stated here, not imported.
//   - the run-level measurement seam: tools/draft_sim.mjs simulateCohort /
//     measureMetaValue (paired by construction: run seeds derive from the one
//     cohort seed, so the with-row and without-row arms see IDENTICAL per-run
//     seeds).
// MODELLED / ASSUMED (stated, not hidden):
//   - METRIC: mean SURVIVAL TIME (seconds) of the sim cohort, with mean
//     banked run gold (incomeProfile) reported beside it. Why: the ladder is
//     priced in runs-to-afford and the W7b acceptance bar reads survival;
//     survival is the sim's own run-length index. It is a MODEL index, not the
//     frame loop — the frame-loop cross-check lives in run_curve/real_loop.
//   - ELITE rows have NO layer in draft_sim (unlockedElites is never read):
//     their arms are identical to the base BY CONSTRUCTION; printed as an
//     honest OUTSIDE-MODEL row, not a zero someone could mistake for measured.
//   - TWO dilution surfaces exist on this tree and they are NOT the same:
//     (1) the SIM's surface — an unlock adds one weight-1 GRANT card to the
//         in-run draft pool (draft_sim buildDraftPool). NOTE: this models the
//         PRE-G26 draft; the LIVE openDraft (owner 2026-09-15 re-scope) offers
//         NO wpn_* grant cards at all — the run only carries what the pre-run
//         LOADOUT chose. Reported here because the brief freezes draft_sim's
//         model (it drives w7b); flagged as a FINDING in the report.
//     (2) the LIVE surface — an unlock is +1 LOADOUT option against the
//         scarce non-volley slot count (startWeaponSlots-1 .. weaponCap), and
//         bringing the weapon adds one weight-1 LEVEL-UP card to the in-run
//         pool. Quantified analytically below (offer shares + the +1 option
//         term priced off the weapon's own dps curve via the draft_sim seam).
//   - 60s cap: the maxed stage is NOT re-run (quote MEASURED.maxed /
//     /tmp/g17_1b/maxed_r1.log when a developed profile is needed); cells are
//     capped at 8 paired runs and the sweep stops at the sign.
// DETERMINISM: every table is a pure function of (seed, runs, baseline,
// policy); RANDOM_PICK's counter is reset before every cohort. Same inputs ->
// byte-identical output (asserted in test/test_meta_rank.mjs).
//
// Run: node tools/meta_rank.mjs [--seed S] [--runs N]
//   --seed S   cohort seed (default 4242)
//   --runs N   paired runs per cell (default 8, capped at 8 per the brief)

import { pathToFileURL } from 'node:url';
import {
  SHOP_UPGRADES, WEAPON_PRICES, ELITE_MODIFIERS,
  WEAPON_SLOT_START, MAX_WEAPON_SLOTS, applyMetaBonuses, upgradeCost,
} from '../src/meta.js';
import { makePlayer } from '../src/entities.js';
import { makeWeapon } from '../src/weapons.js';
import {
  simulateCohort, measureMetaValue, OWNER_LOADOUT, POLICIES, RANDOM_PICK_STATE,
  weaponDps, buildDraftPool, LIVE,
} from './draft_sim.mjs';

export const RANK_SEED_DEFAULT = 4242;
export const RANK_RUNS_MAX = 8;   // brief: cap any single cell at ~8 paired runs

// The declared baselines (profile, gold budget = the row's own nextCost at the
// base level, run index = the paired cohort seeds, character = the sim's
// classless pilot, slot count = the baseline's own purchases).
export const RANK_BASELINES = {
  fresh: {
    label: 'FRESH (empty purchases, 3 slots, starter VOLLEY+BOOMERANG)',
    purchases: {},
  },
  developed: {
    label: 'DEVELOPED (OWNER_LOADOUT: dmg x5, split 3, thrifty 2, slots +1, ORBIT; 4 slots)',
    purchases: { ...OWNER_LOADOUT },
  },
};

const meanOf = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / Math.max(1, rows.length);
const cohortWith = (policy, seed, runs, patch) => {
  RANDOM_PICK_STATE.n = 0;                       // determinism for RANDOM_PICK
  return simulateCohort(seed, runs, policy, patch);
};

// nextCost, delegated to the game's own seam for stat rows (meta.js
// upgradeCost — the same formula tools/balance_sim.mjs nextCost restates for
// the greedy shop; the test asserts the two agree). level = levels owned.
export function nextCostOf(def, level) {
  if (def.kind === 'weapon') return WEAPON_PRICES[def.weaponId];
  if (def.kind === 'elite') return ELITE_MODIFIERS[def.eliteId].cost;
  return upgradeCost(def, level);
}

// ============================================================================
// PART A — the ranked table: every purchasable row, exactly one level, at a
// declared baseline, paired seeds, GREED_DAMAGE (the sim's own policy).
// ============================================================================
export function buildRankTable({ seed = RANK_SEED_DEFAULT, runs = 8, baselineKey = 'developed' } = {}) {
  const n = Math.min(Math.max(3, Math.floor(runs)), RANK_RUNS_MAX);
  const base = RANK_BASELINES[baselineKey].purchases;
  // Stat rows ride the EXISTING measured axis (draft_sim measureMetaValue) —
  // extended, not duplicated. One call covers base + every stat arm.
  const mv = measureMetaValue(seed, n, { ...base });
  const statById = new Map(mv.rows.map(r => [r.id, r]));

  // One shared base cohort for the weapon arms (same seed/runs -> identical to
  // mv's own base by determinism; re-run so the deltas below pair exactly).
  const baseCohort = cohortWith('GREED_DAMAGE', seed, n, { purchases: { ...base } });
  const bSurv = meanOf(baseCohort, r => r.survivalTime);
  const bGold = meanOf(baseCohort, r => r.incomeProfile);

  const rows = [];
  for (const def of SHOP_UPGRADES) {
    if (!def.kind) {
      const r = statById.get(def.id);
      rows.push({
        id: def.id, kind: 'stat', cost: r.cost, dSurv: r.dSurv, dGold: r.dGold,
        survPer1k: r.survPer1k, goldPer1k: r.goldPer1k, note: r.note || r.invisible && 'identical arm (row reads nowhere in the model)' || null,
      });
      continue;
    }
    if (def.kind === 'weapon') {
      const arm = cohortWith('GREED_DAMAGE', seed, n,
        { purchases: { ...base, [def.id]: 1 } });
      const dSurv = meanOf(arm, r => r.survivalTime) - bSurv;
      const dGold = meanOf(arm, r => r.incomeProfile) - bGold;
      const cost = nextCostOf(def, 0);
      rows.push({
        id: def.id, kind: 'weapon', cost,
        dSurv, dGold,
        survPer1k: cost > 0 ? dSurv / cost * 1000 : 0,
        goldPer1k: cost > 0 ? dGold / cost * 1000 : 0,
        takeRate: arm.filter(r => (r.picks['grant_' + def.weaponId] || 0) > 0).length / arm.length,
        note: null,
      });
      continue;
    }
    // elite: NO layer in the model — probe the real seams, never fake a 0.
    const p0 = applyMetaBonuses(makePlayer().stats, { ...base });
    const p1 = applyMetaBonuses(makePlayer().stats, { ...base, [def.id]: 1 });
    const reads = JSON.stringify(p0) !== JSON.stringify(p1);
    rows.push({
      id: def.id, kind: 'elite', cost: nextCostOf(def, 0),
      dSurv: 0, dGold: 0, survPer1k: 0, goldPer1k: 0,
      note: reads
        ? 'reads into stats but no elite layer in the model; measured 0 by construction'
        : 'OUTSIDE THIS MODEL (unlockedElites has no sim layer; honest 0, unmeasured)',
    });
  }
  rows.sort((a, b) => b.survPer1k - a.survPer1k || a.cost - b.cost);
  return { baselineKey, seed, runs: n, baseSurv: mv.baseSurv, baseGold: mv.baseGold, bSurv, bGold, rows };
}

// ============================================================================
// The order delta against GREEDY_PRIORITY — the owner's actual ask ("where the
// assumed order was wrong"). delta = measuredRank - greedyPos (both 1-based):
//   delta >= +band  -> greedy buys it TOO EARLY (measured value is lower)
//   delta <= -band  -> greedy buys it TOO LATE  (measured value is higher)
//   |dSurv|,|dGold| under eps -> ~ZERO measured value wherever it sits.
export function greedyDeltaList(table, greedyPriority, {
  band = 3, zeroEpsS = 0.5, zeroEpsG = 1,
} = {}) {
  const gPos = new Map(greedyPriority.map((id, i) => [id, i + 1]));
  const out = { tooEarly: [], tooLate: [], zeroValue: [], neverBought: [] };
  table.rows.forEach((r, i) => {
    const measuredRank = i + 1;
    const p = gPos.get(r.id);
    if (Math.abs(r.dSurv) < zeroEpsS && Math.abs(r.dGold) < zeroEpsG) {
      out.zeroValue.push({ id: r.id, kind: r.kind, greedyPos: p ?? null, measuredRank });
      return;
    }
    if (p === undefined) { out.neverBought.push({ id: r.id, kind: r.kind, measuredRank }); return; }
    const delta = measuredRank - p;
    if (delta >= band) out.tooEarly.push({ id: r.id, greedyPos: p, measuredRank, delta });
    else if (delta <= -band) out.tooLate.push({ id: r.id, greedyPos: p, measuredRank, delta });
  });
  return out;
}

// ============================================================================
// PART B — weapon-unlock DILUTION at the real slot counts, under declared
// pick policies. Net value = with-unlock arm minus base arm (paired seeds).
// Slot counts are READ (WEAPON_SLOT_START..MAX_WEAPON_SLOTS), never hardcoded.
// ============================================================================
export function slotCountsRead() {
  const out = [];
  for (let s = WEAPON_SLOT_START; s <= MAX_WEAPON_SLOTS; s++) out.push(s);
  return out;
}

export function buildDilutionTable({
  seed = RANK_SEED_DEFAULT, runs = 8,
  policies = ['GREED_DAMAGE', 'GREED_DPS', 'RANDOM_PICK'],
  slotCounts = slotCountsRead(),
} = {}) {
  const n = Math.min(Math.max(3, Math.floor(runs)), RANK_RUNS_MAX);
  const rows = [];
  for (const policy of policies) {
    if (!POLICIES[policy]) throw new Error(`meta_rank: unknown policy ${policy}`);
    for (const slots of slotCounts) {
      const slotsLvl = slots - WEAPON_SLOT_START;   // the shop 'slots' row adds 1/level
      const basePurch = slotsLvl > 0 ? { slots: slotsLvl } : {};
      const baseC = cohortWith(policy, seed, n, { purchases: basePurch });
      const bS = meanOf(baseC, r => r.survivalTime);
      const bW = meanOf(baseC, r => r.wavesCleared);
      const bG = meanOf(baseC, r => r.incomeProfile);
      for (const [wid, price] of Object.entries(WEAPON_PRICES)) {
        const arm = cohortWith(policy, seed, n,
          { purchases: { ...basePurch, ['weapon_' + wid.toLowerCase()]: 1 } });
        rows.push({
          policy, slots, weapon: wid, price,
          takeRate: arm.filter(r => (r.picks['grant_' + wid] || 0) > 0).length / arm.length,
          dSurv: meanOf(arm, r => r.survivalTime) - bS,
          dWaves: meanOf(arm, r => r.wavesCleared) - bW,
          dBanked: meanOf(arm, r => r.incomeProfile) - bG,
        });
      }
    }
  }
  return { seed, runs: n, rows };
}

// ============================================================================
// The LIVE dilution surface, quantified analytically from the game's own pool
// builder (no run-level model): offer shares with/without one more weight-1
// weapon card, and the +1 option term priced off the weapon's own dps curve
// via the draft_sim seam (the same add/base ratio cardImpact prices a grant
// with: weaponDps(w, 1) / sum-of-kit weaponDps at the fresh base, bonus 0).
// ============================================================================
export function liveOfferShare({ slotCount = WEAPON_SLOT_START, extraUnlock = null, kit = ['VOLLEY', 'BOOMERANG'] } = {}) {
  const weapons = kit.map(t => makeWeapon(t));
  const weigh = (pool) => {
    let total = 0, grants = 0, wlevel = 0, stat = 0;
    for (const c of pool) {
      total += c.weight;
      if (c.kind === 'grant') grants += c.weight;
      else if (c.kind === 'wlevel') wlevel += c.weight;
      else if (c.kind === 'stat') stat += c.weight;
    }
    return { total, grants, wlevel, stat, cards: pool.length };
  };
  const base = weigh(buildDraftPool(weapons, { slotCap: slotCount }));
  // The LIVE surface: an unlock's in-run footprint is a BROUGHT weapon's
  // level-up card (+1 weight-1 card in the pool). extraUnlock models bringing
  // one more weapon in a free slot.
  const withW = extraUnlock
    ? weigh(buildDraftPool(weapons.concat([makeWeapon(extraUnlock)]), { slotCap: slotCount }))
    : null;
  return { base, withExtraBrought: withW };
}

export function optionTermAtFresh(wid, { kit = ['VOLLEY', 'BOOMERANG'] } = {}) {
  const player = makePlayer();
  const weapons = kit.map(t => makeWeapon(t));
  let base = 0;
  for (const w of weapons) base += weaponDps(w.type, w.level || 1, player, LIVE);
  const add = weaponDps(wid, 1, player, LIVE);
  return { addDps: add, baseDps: base, share: base > 0 ? add / base : 0 };
}

// The measured priority list for balance_sim --meta-order measured: the table
// order VERBATIM (every purchasable id, ranked by measured survPer1k; ties —
// the unmeasurable zero-value rows — fall back to cost ascending, negatives
// last). Elites are NOT re-tailed: reordering them would make the order
// disagree with the very table it claims to be.
export function measuredPriorityFromTable(table) {
  return table.rows.map(r => r.id);
}

// ============================================================================
// main
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')
      ? Number(args[i + 1]) : dflt;
  };
  const seed = Math.max(1, Math.floor(flag('--seed', RANK_SEED_DEFAULT)));
  const runs = Math.min(RANK_RUNS_MAX, Math.max(3, Math.floor(flag('--runs', 8))));
  const { GREEDY_PRIORITY } = await import('./balance_sim.mjs');

  console.log(`HORDES META RANK (W7a slice 2) — seed ${seed}, ${runs} paired runs/cell, ` +
    `metric = mean survival seconds (sim run-length index; model, not frame loop)`);
  console.log(`slot counts READ from meta.js: WEAPON_SLOT_START=${WEAPON_SLOT_START} ` +
    `MAX_WEAPON_SLOTS=${MAX_WEAPON_SLOTS}; universe = SHOP_UPGRADES ` +
    `(${SHOP_UPGRADES.length} rows: ${SHOP_UPGRADES.filter(d => !d.kind).length} stat / ` +
    `${SHOP_UPGRADES.filter(d => d.kind === 'weapon').length} weapon / ` +
    `${SHOP_UPGRADES.filter(d => d.kind === 'elite').length} elite)`);
  console.log('');

  // ---- PART A: ranked tables + greedy deltas, per declared baseline --------
  const tables = {};
  for (const key of Object.keys(RANK_BASELINES)) {
    const t = tables[key] = buildRankTable({ seed, runs, baselineKey: key });
    console.log(`=== RANKED TABLE — baseline ${RANK_BASELINES[key].label} ===`);
    console.log(`base: mean survival ${t.bSurv.toFixed(1)}s · mean banked ${Math.round(t.bGold)}g · n=${t.runs}/cell (paired)`);
    console.log('rank | id               | kind   | cost      | dSurv    | dBanked | per-1000g (s/g)      | greedy-pos | delta-vs-greedy');
    t.rows.forEach((r, i) => {
      const gPos = GREEDY_PRIORITY.indexOf(r.id) + 1;
      const delta = gPos > 0 ? (i + 1) - gPos : null;
      console.log(`${String(i + 1).padStart(4)} | ${r.id.padEnd(16)} | ${r.kind.padEnd(6)} | ` +
        `${String(r.cost).padStart(9)} | ` +
        `${((r.dSurv >= 0 ? '+' : '') + r.dSurv.toFixed(1) + 's').padStart(8)} | ` +
        `${((r.dGold >= 0 ? '+' : '') + Math.round(r.dGold) + 'g').padStart(7)} | ` +
        `${(r.survPer1k.toFixed(2) + 's / ' + Math.round(r.goldPer1k) + 'g').padEnd(20)} | ` +
        `${(gPos > 0 ? String(gPos) : '-').padStart(10)} | ` +
        `${(delta === null ? 'not in greedy' : (delta >= 0 ? '+' : '') + delta).padStart(8)}` +
        (r.note ? `  (${r.note})` : '') +
        (r.takeRate !== undefined ? `  [take ${(100 * r.takeRate).toFixed(0)}%]` : ''));
    });
    const dl = greedyDeltaList(t, GREEDY_PRIORITY);
    console.log(`GREEDY DELTA (band 3, zero eps ${0.5}s/1g):`);
    console.log(`  bought TOO EARLY : ${dl.tooEarly.map(e => `${e.id} (g${e.greedyPos}->m${e.measuredRank})`).join(', ') || 'none'}`);
    console.log(`  bought TOO LATE  : ${dl.tooLate.map(e => `${e.id} (g${e.greedyPos}->m${e.measuredRank})`).join(', ') || 'none'}`);
    console.log(`  ~ZERO VALUE      : ${dl.zeroValue.map(e => e.id).join(', ') || 'none'}`);
    console.log(`  NEVER BOUGHT     : ${dl.neverBought.map(e => e.id).join(', ') || 'none'}`);
    console.log('');
  }

  // ---- PART B: dilution at the real slot counts, per declared policy -------
  const slots = slotCountsRead();
  const dil = buildDilutionTable({ seed, runs, slotCounts: slots });
  console.log(`=== WEAPON-UNLOCK NET VALUE (dilution model) — slots READ ${slots.join('/')} ` +
    `· policies GREED_DAMAGE (sim's own) / GREED_DPS / RANDOM · n=${dil.runs}/cell (paired) ===`);
  console.log('policy        | slots | weapon     | price      | take | dSurv    | dWaves | dBanked');
  for (const r of dil.rows) {
    console.log(`${POLICIES[r.policy].label.padEnd(13)} | ${r.slots}    | ${r.weapon.padEnd(10)} | ` +
      `${String(r.price).padStart(9)} | ${(100 * r.takeRate).toFixed(0).padStart(3)}% | ` +
      `${((r.dSurv >= 0 ? '+' : '') + r.dSurv.toFixed(1) + 's').padStart(8)} | ` +
      `${((r.dWaves >= 0 ? '+' : '') + r.dWaves.toFixed(2)).padStart(6)} | ` +
      `${((r.dBanked >= 0 ? '+' : '') + Math.round(r.dBanked) + 'g')}`);
  }
  const at3 = dil.rows.filter(r => r.slots === WEAPON_SLOT_START && r.dSurv < 0);
  const anyNeg = dil.rows.filter(r => r.dSurv < 0);
  console.log(`NET-NEGATIVE AT ${WEAPON_SLOT_START} SLOTS: ${at3.length === 0 ? 'NONE' : at3.map(r => `${r.weapon}/${r.policy}`).join(', ')}`);
  console.log(`net-negative anywhere (any slot, any policy): ${anyNeg.length === 0 ? 'NONE' : anyNeg.map(r => `${r.weapon}/${r.policy}@${r.slots}`).join(', ')}`);
  if (anyNeg.length === 0) {
    console.log(`  -> HONEST NULL: unlocking is never net-negative at the measured rates under any`);
    console.log(`     declared policy; the owner's hidden-tradeoff escalation rule (a net-negative AND`);
    console.log(`     irreversible purchase) does NOT trigger. Not tuned to reach this answer.`);
  } else {
    console.log(`  -> policies disagree; see the rows above for where and by how much.`);
  }
  console.log('');

  // ---- the LIVE dilution surface (analytic, from the game's own pool) ------
  console.log(`=== LIVE DILUTION SURFACE (analytic; the sim's grant-card pool models the PRE-G26 draft) ===`);
  console.log(`  live openDraft (main.js G26 re-scope) offers NO wpn_* grant cards: an unlock reaches`);
  console.log(`  the run ONLY through the pre-run LOADOUT (${WEAPON_SLOT_START - 1} non-volley slots at start, ` +
    `${MAX_WEAPON_SLOTS - 1} max) and each BROUGHT weapon adds one weight-1 level-up card.`);
  for (const wid of Object.keys(WEAPON_PRICES)) {
    const ot = optionTermAtFresh(wid);
    console.log(`  +1 option ${wid.padEnd(10)}: dps ${ot.addDps.toFixed(1)} on kit base ${ot.baseDps.toFixed(1)} ` +
      `-> x${ot.share.toFixed(2)} kit dps at Lv1 (cardImpact grant ratio, bonus 0)`);
  }
  const share = liveOfferShare({ slotCount: WEAPON_SLOT_START });
  const b = share.base;
  console.log(`  fresh in-run pool (3 slots, kit VOLLEY+BOOMERANG): total weight ${b.total.toFixed(2)} over ${b.cards} cards ` +
    `(${b.wlevel.toFixed(0)} weight in wlevel x1, ${b.stat.toFixed(2)} in stat) — a BROUGHT 3rd weapon adds ` +
    `weight 1 = ${(100 * 1 / (b.total + 1)).toFixed(1)}% of the redrawn pool, diluting every other card's offer share ` +
    `(stat family share ${(100 * b.stat / b.total).toFixed(1)}% -> ${(100 * b.stat / (b.total + 1)).toFixed(1)}%).`);
  console.log('');

  // determinism note (asserted in test/test_meta_rank.mjs)
  console.log(`DETERMINISM: same (seed, runs, baseline, policy) -> byte-identical tables; ` +
    `RANDOM_PICK counter reset before every cohort. Proven in test/test_meta_rank.mjs.`);
}

// Only auto-run when invoked directly (test_meta_rank.mjs imports this module).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
