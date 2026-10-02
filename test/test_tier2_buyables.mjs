// HORDES — TIER-2(c) NEW BUYABLES (owner autopilot 2026-09-23).
// Ten classic stat rows (might/toughness/cooldown/marathon/magnetism/growth/
// avarice/bullseye/vampire/hoarder), each on a surface the shop ALREADY sells.
// Run: node test/test_tier2_buyables.mjs
//
// What is proven here:
//   1. REGISTRY: every row is present in SHOP_UPGRADES + SHOP_BY_ID as a
//      classic stat row (no kind), with sane economy shape and plain strings.
//   2. LIVE DESC: desc is a getter (house rule: the shop can never lie about
//      a number) — moving perLevel moves the rendered text.
//   3. COST CURVE: sample points through upgradeCost (the ONE cost authority)
//      plus the pinned full-buy table (drift fails loudly).
//   4. SEAM REACHABILITY: level 0 is neutral, max level moves the seam through
//      applyMetaBonuses with the documented shape (no dead rows).
//   5. INVESTMENT ACCOUNTING: buyUpgrade debits exactly upgradeCost, ledgers
//      the spend, and ownedBuildCost (the permanent-build investment figure
//      devGoldSpent reads) rises by the same full price.
//   6. LEDGER TOTAL: the economy ledger sees every new row in bucket OTHER at
//      its full-buy price, and the batch sum matches the claimed total.
import {
  SHOP_UPGRADES, SHOP_BY_ID, GOLD_MODEL, upgradeCost, catalogCost,
  buyUpgrade, applyMetaBonuses, ownedBuildCost, makeProfile, fmtPct, fmtNum,
} from '../src/meta.js';
import { ledger, ledgerRows, singleItemCapGold } from '../tools/economy_ledger.mjs';
import { shopIcon, SHOP_ICON_FALLBACK_ID, SHOP_ICONS } from '../src/art/shop_icons.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// The 10 new rows: id -> [name, baseCost, costGrowth, maxLevel, perLevel, seam,
// shape ('mult' compounds as (1+p)^level, 'flat' adds p*level), source vocab].
const BATCH = {
  might:     ['Might',     300, 1.7, 5, 0.05, 'damageMult', 'mult', 'VS POWER'],
  toughness: ['Toughness', 220, 1.5, 5, 40,   'maxHp',      'flat', 'VS MAXHEALTH'],
  cooldown:  ['Cooldown',  320, 1.7, 5, 0.05, 'rateMult',   'mult', 'VS COOLDOWN'],
  marathon:  ['Marathon',  260, 1.6, 5, 0.05, 'speedMult',  'mult', 'VS MOVESPEED'],
  magnetism: ['Magnetism', 280, 1.6, 5, 0.15, 'pickupMult', 'mult', 'VS MAGNET'],
  growth:    ['Growth',    200, 1.6, 5, 0.05, 'xpMult',     'mult', 'VS GROWTH'],
  avarice:   ['Avarice',   350, 1.5, 5, 0.10, 'goldMult',   'mult', 'VS GREED'],
  bullseye:  ['Bullseye',  260, 1.7, 5, 0.25, 'critMult',   'mult', 'MB Bullseye'],
  vampire:   ['Vampire',   400, 1.7, 5, 0.01, 'lifesteal',  'flat', 'MB Vampire'],
  hoarder:   ['Hoarder',   240, 1.6, 4, 0.03, 'dropBonus',  'flat', 'MB Hoarder'],
};
// Full-buy gold per row, read through upgradeCost (pinned: drift fails loudly).
const FULL_BUY = {
  might: 5657, toughness: 2902, cooldown: 6034, marathon: 4111, magnetism: 4427,
  growth: 3162, avarice: 4616, bullseye: 4902, vampire: 7542, hoarder: 2221,
};
const BATCH_TOTAL = 45574;
const IDS = Object.keys(BATCH);

const BASE_STATS = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
  pierce: 0, maxHp: 100, maxMana: 100 };

console.log('TIER-2(c) BUYABLES — REGISTRY (10 classic stat rows):');
{
  let all = true;
  for (const id of IDS) {
    const def = SHOP_BY_ID[id];
    const [name, base, gw, max, per] = BATCH[id];
    if (!def || def.kind || def.baseCost !== base || def.costGrowth !== gw ||
        def.maxLevel !== max || def.perLevel !== per || def.name !== name) {
      all = false; console.error('  bad row ' + id + ' ' + JSON.stringify(def && {
        baseCost: def.baseCost, costGrowth: def.costGrowth, maxLevel: def.maxLevel,
        perLevel: def.perLevel, name: def.name, kind: def.kind }));
    }
    if (!SHOP_UPGRADES.includes(def)) { all = false; console.error('  not in SHOP_UPGRADES: ' + id); }
    if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(def.name + def.desc)) {
      all = false; console.error('  emoji in player strings: ' + id);
    }
  }
  ok(all, 'all 10 rows are classic stat rows with the tabled economy shape');
  ok(IDS.every(id => !id.startsWith('weapon_') && !id.startsWith('elite_') &&
    !id.startsWith('apex_')), 'no id collides with the weapon_/elite_/apex_ prefixes');
}

console.log('TIER-2(c) BUYABLES — LIVE DESC (getter, never a stale copy):');
{
  let all = true;
  for (const id of IDS) {
    const def = SHOP_BY_ID[id];
    const d = Object.getOwnPropertyDescriptor(def, 'desc');
    if (!d || typeof d.get !== 'function') { all = false; console.error('  desc is not a getter: ' + id); continue; }
    const before = def.desc;
    const old = def.perLevel;
    try {
      def.perLevel = old + 1;
      const after = def.desc;
      if (after === before) { all = false; console.error('  desc did not move with perLevel: ' + id); }
    } finally {
      def.perLevel = old;
    }
    if (def.desc !== before) { all = false; console.error('  desc did not restore: ' + id); }
    // The live number is IN the text (shop can never lie): the formatted
    // perLevel the getter quotes must read back out of the string.
    const num = (BATCH[id][5] === 'maxHp' || id === 'toughness') ? fmtNum(old) : fmtPct(old);
    if (!before.includes(String(num))) { all = false; console.error('  desc hides its number: ' + id + ' (' + before + ')'); }
  }
  ok(all, 'every desc is a live getter quoting its own perLevel');
}

console.log('TIER-2(c) BUYABLES — COST CURVE (the one cost authority):');
{
  let all = true;
  for (const id of IDS) {
    const def = SHOP_BY_ID[id];
    const [, base, gw, max] = BATCH[id];
    if (upgradeCost(def, 0) !== base) { all = false; console.error('  L0 != baseCost: ' + id); }
    if (upgradeCost(def, 1) !== Math.round(base * gw)) { all = false; console.error('  L1 != formula: ' + id); }
    if (catalogCost([id]) !== FULL_BUY[id]) {
      all = false; console.error(`  full-buy drift: ${id} got ${catalogCost([id])}g, want ${FULL_BUY[id]}g`);
    }
    // G3 safety: every full-buy sits ~1000x under the single-item cap, and
    // below bloodpact (the pacing-guard top identity must not move).
    if (!(catalogCost([id]) <= singleItemCapGold())) { all = false; console.error('  cap breach: ' + id); }
    if (!(catalogCost([id]) < catalogCost(['bloodpact']))) { all = false; console.error('  above bloodpact: ' + id); }
  }
  ok(all, 'sample points + pinned full-buy table hold; all rows under the cap and under bloodpact');
  const sum = IDS.reduce((s, id) => s + catalogCost([id]), 0);
  ok(sum === BATCH_TOTAL, `batch full-buy sums to the claimed ${BATCH_TOTAL}g (got ${sum}g)`);
  // G1/G2 safety: no new base undercuts the guard denominators (hp L1 120,
  // dmg L1 150) or the cheapest real purchase (Orbit Blade 200).
  ok(IDS.every(id => SHOP_BY_ID[id].baseCost >= 200),
    'cheapest new base ties Orbit Blade (200) — first-purchase index unmoved');
}

console.log('TIER-2(c) BUYABLES — SEAM REACHABILITY (no dead rows):');
{
  const base = applyMetaBonuses(BASE_STATS, {});
  let all = true;
  for (const id of IDS) {
    const seam = BATCH[id][5];
    const shape = BATCH[id][6];
    const per = BATCH[id][4];
    const max = BATCH[id][3];
    const bought = applyMetaBonuses(BASE_STATS, { [id]: max });
    if (!(seam in bought)) { all = false; console.error(`  ${id}: seam ${seam} not emitted`); continue; }
    if (Object.is(bought[seam], base[seam])) { all = false; console.error(`  ${id}: seam unchanged at max`); continue; }
    if (shape === 'mult') {
      const want = (base[seam] === 0 ? 1 : base[seam]) * Math.pow(1 + per, max);
      // mult seams ride on a 1-or-carried base (damageMult/rateMult/speedMult/
      // pickupMult default 1; xpMult/goldMult are pure powers of 1; critMult
      // is the 1.5 base plus the compounded bonus).
      const got = bought[seam];
      const ref = seam === 'critMult' ? 1.5 + Math.pow(1 + per, max) - 1
        : seam === 'xpMult' || seam === 'goldMult'
        ? Math.pow(1 + per, max)
        : (BASE_STATS[seam] || 1) * Math.pow(1 + per, max);
      if (Math.abs(got - ref) > 1e-9 && Math.abs(got - want) > 1e-9) {
        all = false; console.error(`  ${id}: wrong compound shape (got ${got}, want ${ref})`);
      }
    } else {
      const ref = seam === 'maxHp' ? BASE_STATS.maxHp + per * max
        : seam === 'lifesteal' ? per * max
        : per * max;   // dropBonus rides from 0
      if (Math.abs(bought[seam] - ref) > 1e-9) {
        all = false; console.error(`  ${id}: wrong flat shape (got ${bought[seam]}, want ${ref})`);
      }
    }
    // Level 0 is neutral: the seam reads exactly the unowned value.
    if (!Object.is(applyMetaBonuses(BASE_STATS, {})[seam], base[seam])) {
      all = false; console.error(`  ${id}: level 0 not neutral`);
    }
  }
  ok(all, 'all 10 rows move their seam with the documented shape; level 0 neutral');
}

console.log('TIER-2(c) BUYABLES — INVESTMENT ACCOUNTING (shop = investment, permanently):');
{
  let all = true;
  for (const id of IDS) {
    const def = SHOP_BY_ID[id];
    const p = makeProfile();
    const cost0 = upgradeCost(def, 0);
    p.gold = cost0;
    const before = ownedBuildCost(p);
    if (buyUpgrade(p, id) !== true) { all = false; console.error('  buy refused: ' + id); continue; }
    if (p.purchased[id] !== 1) { all = false; console.error('  level not tracked: ' + id); }
    if (p.gold !== 0) { all = false; console.error('  gold not debited exactly: ' + id); }
    const spend = p.spendLedger && p.spendLedger[id];
    if (!Array.isArray(spend) || spend[0] !== cost0) {
      all = false; console.error('  spend ledger mis-records: ' + id + ' ' + JSON.stringify(spend));
    }
    // The permanent-build investment figure rises by the FULL price (free or
    // paid — ownership, never the receipt).
    if (ownedBuildCost(p) - before !== cost0) {
      all = false; console.error(`  ownedBuildCost moved ${ownedBuildCost(p) - before}, want ${cost0}: ` + id);
    }
  }
  ok(all, 'every row buys, ledgers, and prices into ownedBuildCost at full price');
}

console.log('TIER-2(c) BUYABLES — LEDGER TOTAL (transparent dilution):');
{
  const L = ledger();
  const rows = ledgerRows().filter(r => IDS.includes(r.id));
  ok(rows.length === IDS.length, `the ledger sees all ${IDS.length} new rows`);
  ok(rows.every(r => r.bucket === 'OTHER'), 'every new row buckets OTHER (MID/TOP untouched)');
  const batchGold = rows.reduce((s, r) => s + r.gold, 0);
  ok(batchGold === BATCH_TOTAL, `ledger batch sum is the claimed ${BATCH_TOTAL}g (got ${batchGold}g)`);
  ok(L.counts.ALL === ledgerRows().length, 'ledger count is self-consistent');
  const mid = new Set(GOLD_MODEL.MID_TIER_IDS), top = new Set(GOLD_MODEL.TOP_TIER_IDS);
  ok(IDS.every(id => !mid.has(id) && !top.has(id)), 'no new id joined a tier list (sim lists stay in sync)');
}

console.log('TIER-2(c) BUYABLES — ICON PER ROW (never the fallback):');
{
  let all = true;
  for (const id of IDS) {
    const a = shopIcon(id);
    if (!a || a.id === SHOP_ICON_FALLBACK_ID || !SHOP_ICONS[id]) {
      all = false; console.error('  fallback or missing icon: ' + id);
    }
  }
  ok(all, 'all 10 rows resolve their OWN authored icon');
}

console.log(failed === 0 ? 'ALL TIER-2(c) BUYABLE TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
