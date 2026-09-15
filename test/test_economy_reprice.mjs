// HORDES — G17 slice 1b: THE REPRICE invariants (node, no DOM).
// Run: node test/test_economy_reprice.mjs
//
// These pin the POST-REPRICE economy to the owner's hard targets, measured
// against the REAL tables and the REAL measured baseline (tools/economy_ledger.
// mjs MEASURED — the slice 1a cohorts). Nothing here carries a copied price
// list: every number is read live from src/meta.js through the ONE cost
// authority (upgradeCost) and the ONE ledger. If a later agent retunes the
// economy back to "fast", these lines fail loudly:
//   - any single item over the 3h cap at the measured end-game rate
//   - 10 good runs no longer buying 30-40% of the mid catalogue
//   - the first real purchase slipping outside 1-3 tier-0/1 runs
//   - the catalogue silently dropping below the hours this slice shipped
//     (the 60h owner target is closed by slice 2 BREADTH — the shortfall is
//     pinned here as a quoted constant so slice 2's landing MOVES it, and any
//     accidental price cut shrinks the total and fails this file).
import { GOLD_MODEL, GOLD_TIER, RUN_GOLD, catalogCost } from '../src/meta.js';
import {
  MEASURED, CAP_HOURS, goldPerHour, singleItemCapGold, ledgerRows, ledger,
} from '../tools/economy_ledger.mjs';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('G17 REPRICE — MEASURED BASELINE (the divisor):');
{
  const m = MEASURED.maxed;
  ok(m.n >= 1 && m.seed === 1337 && m.goldMean === 754689 && m.lenMeanS === 1800,
     `maxed cohort on record: n=${m.n} seed=${m.seed} goldMean=${m.goldMean} lenMeanS=${m.lenMeanS} (the divisor source)`);
  ok(GOLD_MODEL.INCOME_TIERS[3].gold === m.goldMean,
     `INCOME_TIERS[3] IS the measured value (${GOLD_MODEL.INCOME_TIERS[3].gold}g == MEASURED.maxed.goldMean) — no analytic constant in the divisor`);
  const rate = goldPerHour('maxed');
  ok(rate === 1509378,
     `end-game rate = ${m.goldMean}g / ${m.lenMeanS}s = ${rate}g/hour (754,689 x 3600/1800)`);
}

console.log('G17 REPRICE — PAYOUTS FROZEN (prices were the lever, never payouts):');
{
  ok(RUN_GOLD.AWARD === 70 && RUN_GOLD.FIRST_CLEAR === 250,
     `RUN_GOLD byte-identical (AWARD ${RUN_GOLD.AWARD}, FIRST_CLEAR ${RUN_GOLD.FIRST_CLEAR})`);
  ok(JSON.stringify(GOLD_TIER) === JSON.stringify({
    CHAFF: 0, GRUNT: 1, MID: 3, HEAVY: 8, ELITE: 15, MID_BOSS: 60, BOSS: 150,
  }), `GOLD_TIER byte-identical (${JSON.stringify(GOLD_TIER)})`);
  ok(GOLD_MODEL.INCOME_TIERS[0].gold === RUN_GOLD.AWARD,
     'income tier 0 still pins the fixed-award floor');
}

console.log('G17 REPRICE — SINGLE-ITEM CAP (3h of measured end-game income):');
{
  const cap = singleItemCapGold();
  ok(CAP_HOURS === 3, `cap is ${CAP_HOURS}h of measured income`);
  ok(cap === 4528134, `cap = 3h x 1,509,378g/h = ${cap}g`);
  // The proof runs upgradeCost at EVERY level (a full row buy), not the row's
  // baseCost — costGrowth can push late levels past a baseCost-only check.
  const rows = ledgerRows();
  const violations = rows.filter(r => r.gold > cap);
  ok(violations.length === 0,
     `no item's FULL buy (upgradeCost summed over all levels) exceeds the cap: ` +
     (violations.length
       ? violations.map(v => `${v.id} ${v.gold}g (${(v.gold / goldPerHour('maxed')).toFixed(2)}h)`).join(', ')
       : `max is ${Math.max(...rows.map(r => r.gold))}g across ${rows.length} items`));
}

console.log('G17 REPRICE — MID-TIER STRETCH (10 good runs buy 30-40%):');
{
  const L = ledger();
  const good = GOLD_MODEL.INCOME_TIERS[3].gold;
  const share10 = (10 * good) / L.midCost;
  ok(share10 >= 0.30 && share10 <= 0.40,
     `10 good runs (10 x ${good}g) buy ${(100 * share10).toFixed(1)}% of the ${L.midCost}g mid catalogue (band 30-40%)`);
  ok(Math.abs(L.midCost - 22755200) < 1,
     `mid catalogue total pinned at 22,755,200g (drift fails this line; got ${L.midCost})`);
}

console.log('G17 REPRICE — FIRST PURCHASE (1-3 tier-0/1 runs):');
{
  const L = ledger();
  ok(L.firstPurchaseRuns >= 1 && L.firstPurchaseRuns <= 3,
     `cheapest real upgrade (${L.cheapest.label}, ${L.cheapest.gold}g) lands in ` +
     `${L.firstPurchaseRuns.toFixed(2)} tier-0/1 runs (${L.cheapest.gold}g / ${L.tier01}g; band 1-3)`);
}

console.log('G17 REPRICE — CATALOGUE HOURS vs THE 60h OWNER TARGET:');
{
  // The owner target is 60+ PLAY HOURS of shop content. G17 slice 2 (BREADTH:
  // 16 new rows, +65,105,600g — content, not trophy inflation) closed the
  // 40.4h shortfall slice 1 shipped. The shortfall constant is retired at 0;
  // the pin is now the LANDED total: the catalogue must hold 60-64h at the
  // measured rate, so any accidental price cut (or an uncoordinated further
  // inflation) fails this line.
  const SLICE2_SHORTFALL_H = 0;      // G17 slice 2 landed: breadth closed the gap
  const L = ledger();
  const hours = L.total / L.rate;
  ok(hours + SLICE2_SHORTFALL_H >= 60,
     `catalogue ${L.total}g = ${hours.toFixed(1)}h at ${Math.round(L.rate)}g/h >= the 60h owner target`);
  ok(hours >= 60 && hours <= 64,
     `landed catalogue is ${hours.toFixed(1)}h (band 60-64h post-breadth; an accidental reprice fails this line)`);
  const capCeiling = (singleItemCapGold() * L.rows.length) / L.rate;
  ok(60 < capCeiling,
     `60h is reachable by breadth alone: ${L.rows.length} items x 3h cap = ${capCeiling.toFixed(1)}h ceiling — no trophy inflation needed`);
}

console.log(failed === 0 ? 'ALL REPRICE TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
