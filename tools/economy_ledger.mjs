// HORDES — tools/economy_ledger.mjs — THE ECONOMY LEDGER (G17 slice 1).
//
// The one plain-text CLI view of the shop economy. It answers, as raw numbers:
//   * the catalogue TOTAL in gold + item count, partitioned MID / TOP / OTHER
//     (stat lines, slots, the split-cap row, character unlocks) — stated, never
//     implicit — read through upgradeCost/cataloCost over the LIVE tables
//     (SHOP_UPGRADES / WEAPON_PRICES / ELITE_MODIFIERS / CHARACTERS), never a
//     copied price list;
//   * per item: full-buy price and HOURS at the MEASURED end-game rate, with
//     the divisor stated out loud (gold/hour = INCOME_TIERS gold divided by the
//     MEASURED average run length per stage — never computed from the run
//     LIMIT, which DESIGN_TARGETS :43-49 forbids);
//   * the single-item CAP violations (must be EMPTY after the G17 reprice);
//   * the 10-GOOD-RUN mid-tier share (the goal's headline number);
//   * the FIRST-PURCHASE index (runs of tier-0/1 income to the cheapest real
//     upgrade).
//
// Deterministic by charter: the default path NEVER rolls dice and never boots
// the game — it reads the real tables through the real modules plus the
// MEASURED baseline below (a record of measurement, not an intent knob).
//
// Usage:
//   node tools/economy_ledger.mjs                      the ledger (deterministic)
//   node tools/economy_ledger.mjs --measure STAGE [N] [SEED]
//                                                      fresh|partial|maxed.
//                                                      Runs the REAL frame loop
//                                                      (tools/real_loop.mjs
//                                                      runRealCohort — the
//                                                      shared harness, never a
//                                                      second loop) with
//                                                      Math.random REPLACED by
//                                                      a seeded mulberry32 so
//                                                      the cohort reproduces
//                                                      bit-for-bit, and prints
//                                                      the raw per-run baseline
//                                                      (n and seed quoted).
//                                                      ONE PROCESS PER STAGE
//                                                      (the E1 discipline:
//                                                      bootReal once per
//                                                      process, the profile is
//                                                      read at import).
import { pathToFileURL } from 'node:url';
import {
  SHOP_UPGRADES, SHOP_BY_ID, WEAPON_PRICES, ELITE_MODIFIERS, CHARACTERS,
  GOLD_MODEL, upgradeCost, catalogCost,
} from '../src/meta.js';

// ---- the measured income baseline (records of measurement, not intent) ------
// Produced by `node tools/economy_ledger.mjs --measure <stage> 8 1337`
// (2026-09-15, G17 slice 1, tree @ c40abcb+dirty): real frame loop, seeded
// Math.random + seeded draft stream, RUN.LIMIT+60s cap (runs may reach the
// 30:00 win state — a limit run is a COMPLETE run here, not a censored one).
// The payouts (GOLD_TIER / RUN_GOLD.AWARD / purse mechanic) are FROZEN by the
// G17 charter, so this baseline is the divisor on BOTH sides of the reprice;
// acceptance 7 re-runs --measure after the reprice and must reproduce these
// numbers (stage cohorts buy fixed purchases, prices do not enter them).
export const MEASURED = {
  fresh:   { n: 8, seed: 1337, goldMean: 164.5, goldMedian: 71, lenMeanS: 11.6, tier: 0 },
  partial: { n: 8, seed: 1337, goldMean: 156.3, goldMedian: 98, lenMeanS: 26.4, tier: 1 },
  maxed:   { n: 1, seed: 1337, goldMean: 754689, goldMedian: 754689, lenMeanS: 1800, tier: 3 },
};

// Gold per HOUR at a stage: the measured banked gold per run divided by the
// measured average run length. THE DIVISOR IS THE MEASURED RUN LENGTH, never
// the 30:00 limit (a run's length is a progression axis — DESIGN_TARGETS
// :43-49: "DO NOT COMPUTE 60h FROM THE LIMIT").
export function goldPerHour(stage) {
  const m = MEASURED[stage];
  if (!m || !m.lenMeanS || m.n === 0) throw new Error('economy_ledger: no measured baseline for stage ' + stage);
  return m.goldMean / (m.lenMeanS / 3600);
}

// The END-GAME rate the single-item cap is derived from (tier 3 = the maxed
// stage). "A few hours" is the owner's words; the cap itself is 3h at this
// rate, STATED here so the test and the report quote the same number.
export const CAP_HOURS = 3;
export function singleItemCapGold() {
  return Math.round(goldPerHour('maxed') * CAP_HOURS);
}

function fullRowCost(def) {
  let sum = 0;
  for (let l = 0; l < def.maxLevel; l++) sum += upgradeCost(def, l);
  return sum;
}

// The catalogue as one list of { id, label, bucket, gold } rows, read through
// the ONE cost authority (upgradeCost :499) over the LIVE tables.
export function ledgerRows() {
  const rows = [];
  const mid = new Set(GOLD_MODEL.MID_TIER_IDS);
  const top = new Set(GOLD_MODEL.TOP_TIER_IDS);
  for (const def of SHOP_UPGRADES) {
    rows.push({
      id: def.id, label: def.name, def,
      bucket: mid.has(def.id) ? 'MID' : top.has(def.id) ? 'TOP' : 'OTHER',
      gold: fullRowCost(def),
    });
  }
  for (const ch of Object.values(CHARACTERS)) {
    if (ch.unlockCost > 0) rows.push({
      id: 'character_' + ch.id.toLowerCase(), label: ch.name + ' (character)', def: null,
      bucket: 'OTHER', gold: ch.unlockCost,
    });
  }
  return rows;
}

export function ledger() {
  const rows = ledgerRows();
  const by = b => rows.filter(r => r.bucket === b);
  const sum = b => by(b).reduce((s, r) => s + r.gold, 0);
  const total = rows.reduce((s, r) => s + r.gold, 0);
  const rate = goldPerHour('maxed');
  const cap = singleItemCapGold();
  const midCost = catalogCost(GOLD_MODEL.MID_TIER_IDS);
  const good = GOLD_MODEL.INCOME_TIERS[3].gold;
  const share10 = (10 * good) / midCost;
  const cheapest = rows.reduce((a, r) => (r.gold < a.gold ? r : a), rows[0]);
  const tier01 = Math.min(...GOLD_MODEL.INCOME_TIERS.slice(0, 2).map(t => t.gold));
  const firstPurchaseRuns = cheapest.gold / tier01;
  return { rows, total, counts: { ALL: rows.length, MID: by('MID').length, TOP: by('TOP').length, OTHER: by('OTHER').length },
    sums: { MID: sum('MID'), TOP: sum('TOP'), OTHER: sum('OTHER') }, rate, cap, midCost, good, share10, cheapest, tier01, firstPurchaseRuns };
}

function printLedger() {
  const L = ledger();
  console.log('HORDES ECONOMY LEDGER (G17) — read from the LIVE tables via upgradeCost/catalogCost');
  console.log(`catalogue total: ${L.total}g across ${L.counts.ALL} items ` +
    `(MID ${L.counts.MID} / TOP ${L.counts.TOP} / OTHER ${L.counts.ALL - L.counts.MID - L.counts.TOP})`);
  console.log(`partition: MID ${L.sums.MID}g (GOLD_MODEL.MID_TIER_IDS: weapon+elite unlocks, luck ladder) · ` +
    `TOP ${L.sums.TOP}g (${GOLD_MODEL.TOP_TIER_IDS.join(', ')}) · ` +
    `OTHER ${L.sums.OTHER}g (stat lines, slots, split-cap row, character unlocks)`);
  const m = MEASURED.maxed;
  console.log(`\nend-game rate (THE DIVISOR): tier-3 ${L.good}g/run (meta.js INCOME_TIERS) ` +
    `/ ${m.lenMeanS}s measured mean run length (maxed cohort, n=${m.n}, seed=${m.seed}) ` +
    `= ${Math.round(L.rate)}g/hour`);
  console.log(`single-item cap: ${L.cap}g (${CAP_HOURS}h x ${Math.round(L.rate)}g/h — "a few hours" of end-game income)`);
  console.log('\nitem                              bucket   full-buy gold   hours @ end-game rate');
  console.log('--------------------------------  ------  --------------  ---------------------');
  for (const r of [...L.rows].sort((a, b) => b.gold - a.gold)) {
    console.log(`${(r.label + ' [' + r.id + ']').padEnd(32).slice(0, 32)}  ${r.bucket.padEnd(6)}  ` +
      `${String(r.gold).padStart(14)}  ${(r.gold / L.rate).toFixed(2).padStart(21)}`);
  }
  const violations = L.rows.filter(r => r.gold > L.cap);
  console.log(`\nCAP VIOLATIONS (> ${L.cap}g): ` +
    (violations.length ? violations.map(v => `${v.id} ${v.gold}g (${(v.gold / L.rate).toFixed(1)}h)`).join(', ') : '(none)'));
  console.log(`\n10-good-run mid-tier share: ${(100 * L.share10).toFixed(1)}% ` +
    `(10 x ${L.good}g of a ${L.midCost}g mid catalogue; goal band 30-40%)`);
  console.log(`first-purchase index: ${L.firstPurchaseRuns.toFixed(2)} runs ` +
    `(cheapest real upgrade ${L.cheapest.label} ${L.cheapest.gold}g / tier-0/1 income ${L.tier01}g` +
    ` = must land 1-3 runs)`);
  const hours = L.total / L.rate;
  console.log(`\ncatalogue hours @ end-game rate: ${hours.toFixed(1)}h ` +
    `(owner target 60+; shortfall ${(60 - hours).toFixed(1)}h belongs to G17 slice 2 breadth)`);
}

// ---- --measure: the only path that runs the game (seeded, reproducible) -----
async function measure(stage, n, seed) {
  const { mulberry32 } = await import('../src/weather.js');
  const rand = Math.random;
  Math.random = mulberry32(seed);          // the WHOLE loop reproduces: spawns,
  try {                                    // drafts (choiceSeed), elites, weather
    const { runRealCohort, mean, median } = await import('./real_loop.mjs');
    // G17 slice 1a: INCREMENTAL logging, one line per finished run AS IT
    // FINISHES through the harness's existing onRun hook (real_loop.mjs :138)
    // — a big maxed cohort must never look wedged to the worker watchdog
    // (design #62 §4.5), which is exactly what killed the previous attempt.
    console.log(`# --measure ${stage} n=${n} seed=${seed} cap=1860s (RUN.LIMIT 1800s + 60)`);
    const recs = await runRealCohort(stage, n, {
      maxSeconds: 1860,
      onRun: (r, i) => console.log(`run ${String(i).padStart(2)}/${n}: time=${r.time}s wave=${r.wave} ` +
        `cause=${r.cause} kills=${r.kills} gold=${r.gold}${r.won ? ' WON' : ''}`),
      // G17 slice 1a STEP B: live mid-run progress every 600 frames (10 sim-s),
      // from inside the harness's ONE existing frame loop — a 35-min wall run
      // must never be a flat log (the watchdog defect that killed slice 1a twice).
      onProgress: (r, line) => console.log(line),
    });
    console.log(`BASELINE ${stage}: n=${n} seed=${seed} goldMean=${mean(recs.map(r => r.gold)).toFixed(1)} ` +
      `goldMedian=${median(recs.map(r => r.gold))} lenMeanS=${mean(recs.map(r => r.time)).toFixed(1)} ` +
      `won=${recs.filter(r => r.won).length}/${n}`);
  } finally {
    Math.random = rand;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--measure') {
    const stage = args[1] || 'fresh';
    const n = Number(args[2]) || 8;
    const seed = Number(args[3]) || 1337;
    measure(stage, n, seed).catch(e => { console.error(e); process.exitCode = 1; });
  } else {
    printLedger();
  }
}
