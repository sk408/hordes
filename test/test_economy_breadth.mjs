// HORDES — G17 slice 2: THE BREADTH PASS invariants (node, no DOM).
// Run: node test/test_economy_breadth.mjs
//
// Slice 2 closed the 40.4h catalogue shortfall with 16 NEW stat rows (content,
// not trophy inflation). This file pins the four things the brief scopes as
// this slice's NEW test work (it ADDS to test_economy_reprice / test_meta —
// the divisor identity, the cap sweep, the mid-share band and the partition
// total are already asserted there and are NOT repeated here):
//   1. every new row renders its OWN icon (never the generic fallback)
//   2. every new row is partitioned into BOTH tier lists (meta + sim, the two
//      arrays test_meta already asserts are IDENTICAL — this pins MEMBERSHIP)
//   3. every new perLevel is REACHABLE through applyMetaBonuses (a row whose
//      perLevel no code reads is a dead row and a defect)
//   4. the LANDED catalogue holds >= 60 play-hours at the measured divisor
import { GOLD_MODEL, SHOP_BY_ID, applyMetaBonuses } from '../src/meta.js';
import { SIM_ASSUMPTIONS } from '../tools/balance_sim.mjs';
import { ledger, ledgerRows, goldPerHour, singleItemCapGold } from '../tools/economy_ledger.mjs';
import { shopIcon, SHOP_ICON_FALLBACK_ID, SHOP_ICONS } from '../src/art/shop_icons.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// The 16 breadth rows (ids verbatim from src/meta.js SHOP_UPGRADES).
const BREADTH_IDS = [
  'fleetfoot', 'briarmail', 'lodestone', 'hollowpoint', 'ironheart', 'hairtrigger',
  'headsman', 'bloodpact', 'fanfire', 'deepread', 'aethertap', 'grandelixir',
  'deepfont', 'eagleeye', 'staticfield', 'laststand',
];
// row id -> the stats seam its perLevel feeds (the reachability map).
const SEAM = {
  fleetfoot: 'speedMult', briarmail: 'thorns', lodestone: 'pickupMult',
  hollowpoint: 'pierce', ironheart: 'maxHp', hairtrigger: 'rateMult',
  headsman: 'damageMult', bloodpact: 'lifesteal', fanfire: 'projectiles',
  deepread: 'draftOffers', aethertap: 'manaOnKill', grandelixir: 'potionPower',
  deepfont: 'manaRegen', eagleeye: 'crit', staticfield: 'stormShards',
  laststand: 'secondWind',
};
const BASE_STATS = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
  pierce: 0, maxHp: 100, maxMana: 100 };

console.log('G17 SLICE 2 BREADTH — ROWS EXIST AS SHOP ROWS:');
{
  let all = true;
  for (const id of BREADTH_IDS) {
    const def = SHOP_BY_ID[id];
    if (!def || def.kind || def.baseCost <= 0 || !(def.maxLevel >= 1)) { all = false; console.error('  bad row ' + id); }
  }
  ok(all, `all ${BREADTH_IDS.length} breadth rows are classic stat rows with real prices`);
  ok(BREADTH_IDS.every(id => !id.startsWith('weapon_') && !id.startsWith('elite_')
    && !id.startsWith('apex_')), 'no breadth id collides with the weapon_/elite_/apex_ prefixes');
}

console.log('G17 SLICE 2 BREADTH — ICON PER ROW (never the fallback):');
{
  let all = true;
  for (const id of BREADTH_IDS) {
    const a = shopIcon(id);
    if (!a || a.id === SHOP_ICON_FALLBACK_ID || !SHOP_ICONS[id]) { all = false; console.error('  fallback or missing icon: ' + id); }
  }
  ok(all, `all ${BREADTH_IDS.length} rows resolve their OWN authored icon (shopIcon(id).id === id)`);
}

console.log('G17 SLICE 2 BREADTH — PARTITION MEMBERSHIP (both arrays):');
{
  const mid = new Set(GOLD_MODEL.MID_TIER_IDS);
  const top = new Set(GOLD_MODEL.TOP_TIER_IDS);
  ok(mid.has('fleetfoot'), 'fleetfoot is the one new MID rung');
  ok(BREADTH_IDS.filter(id => id !== 'fleetfoot').every(id => top.has(id)),
    'the other 15 rows are TOP rungs');
  ok(BREADTH_IDS.every(id => mid.has(id) || top.has(id)),
    'every breadth row is partitioned (no row unassigned)');
  const simMid = new Set(SIM_ASSUMPTIONS.MID_TIER_IDS);
  const simTop = new Set(SIM_ASSUMPTIONS.TOP_TIER_IDS);
  ok(BREADTH_IDS.every(id => simMid.has(id) === mid.has(id) && simTop.has(id) === top.has(id)),
    'the sim tier lists carry the SAME membership (SIM_ASSUMPTIONS agrees row by row)');
}

console.log('G17 SLICE 2 BREADTH — perLevel REACHABLE through applyMetaBonuses:');
{
  const base = applyMetaBonuses(BASE_STATS, {});
  let all = true;
  for (const id of BREADTH_IDS) {
    const seam = SEAM[id];
    const lvl = SHOP_BY_ID[id].maxLevel;
    const bought = applyMetaBonuses(BASE_STATS, { [id]: lvl });
    if (!(seam in bought)) { all = false; console.error(`  ${id}: seam ${seam} not emitted`); continue; }
    if (Object.is(bought[seam], base[seam])) {
      all = false; console.error(`  ${id}: seam ${seam} unchanged at max level (${base[seam]} -> ${bought[seam]})`);
    }
  }
  ok(all, `all ${BREADTH_IDS.length} rows move their seam at max level (no dead rows)`);
  // Spot-check the compound shape on the multiplicative rungs: (1 + perLevel)^level.
  ok(applyMetaBonuses(BASE_STATS, { headsman: 3 }).damageMult === Math.pow(1.15, 3),
    'headsman compounds (1.15)^level');
  ok(applyMetaBonuses(BASE_STATS, { hairtrigger: 2 }).rateMult === Math.pow(1.12, 2),
    'hairtrigger compounds (1.12)^level');
  ok(applyMetaBonuses(BASE_STATS, { ironheart: 5 }).maxHp === 100 + 120 * 5,
    'ironheart adds its flat HP on top of the base');
  ok(applyMetaBonuses(BASE_STATS, { laststand: 1 }).secondWind === true
    && applyMetaBonuses(BASE_STATS, {}).secondWind === false,
    'laststand flips secondWind on, and it stays off unowned');
}

console.log('G17 SLICE 2 BREADTH — LANDED CATALOGUE HOURS (the 60h owner target):');
{
  const L = ledger();
  const hours = L.total / L.rate;
  ok(hours >= 60,
    `catalogue ${L.total}g across ${L.rows.length} items = ${hours.toFixed(1)}h at ${Math.round(L.rate)}g/h >= 60h`);
  // Breadth, not trophy inflation: no single breadth row's FULL buy may exceed
  // the 3h cap, and the rows must be the ones carrying the hours (>= 60h holds
  // only WITH them; reprice's cap sweep already proves no row exceeds it).
  const rows = ledgerRows().filter(r => BREADTH_IDS.includes(r.id));
  const cap = singleItemCapGold();
  ok(rows.length === BREADTH_IDS.length, `the ledger sees all ${BREADTH_IDS.length} breadth rows`);
  ok(rows.every(r => r.gold <= cap),
    `every breadth row's full buy sits inside the 3h cap (${cap}g; max is ${Math.max(...rows.map(r => r.gold))}g)`);
  const breadthGold = rows.reduce((s, r) => s + r.gold, 0);
  const breadthHours = breadthGold / L.rate;
  ok(Math.abs(breadthHours - 43.1) < 1.5,
    `the 16 rows contribute ${breadthHours.toFixed(1)}h (the measured 40.4h shortfall + margin, not a reprice)`);
  ok(goldPerHour('maxed') === 1509378, 'the divisor is the measured 1,509,378g/h (payouts stayed frozen)');
}

console.log(failed === 0 ? 'ALL BREADTH TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
