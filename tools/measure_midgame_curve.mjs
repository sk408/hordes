// TASK B: the runs-per-next-step-upgrade curve across the whole career,
// computed from the REAL SHOP_UPGRADES table and the MEASURED income
// anchors in docs/PACING.md §1. [TABLE] arithmetic only — no constants
// changed, no sim arms.
import { SHOP_UPGRADES, upgradeCost } from '../src/meta.js';

// MEASURED income anchors (PACING §1 re-measure 2026-09-18), as a function
// of cumulative shop spend. Between 2.2k and 6.83M the only measured value
// is the tier-2 BOT FLOOR (200g, labeled UNVERIFIED in the doc) — the bot
// cannot survive the mid band, so everything there is a FLOOR (a surviving
// player earns more; disclosed in the report).
const ANCHORS = [
  [0, 70], [270, 70], [2200, 85], [6830000, 200], [6830001, 569],
  [98549753, 754689],
];
function incomeAt(spend) {
  // below 6.83M: the flat measured floors (70 -> 85 -> 200)
  if (spend < 2200) return 70 + (spend / 2200) * (85 - 70);
  if (spend < 6830000) return 200;                       // tier-2 floor (UNVERIFIED)
  // 6.83M -> 98.5M: log-linear between the two measured poles (569 -> 754,689)
  const a = Math.log(569), b = Math.log(754689);
  const t = (Math.log(spend) - Math.log(6830000)) / (Math.log(98549753) - Math.log(6830000));
  return Math.exp(a + Math.max(0, Math.min(1, t)) * (b - a));
}

// Every buy step (row, level, price), walked cheapest-first (the greedy
// next-step a progressing player faces).
const steps = [];
for (const row of SHOP_UPGRADES) {
  if (row.kind === 'elite') continue;   // opt-in challenge rows, not the curve
  for (let lv = 0; lv < row.maxLevel; lv++) steps.push({
    id: row.id, name: row.name, lv: lv + 1, price: upgradeCost(row, lv),
  });
}
steps.sort((x, y) => x.price - y.price);

let spend = 0, runs = 0;
const curve = [];
for (const s of steps) {
  const inc = incomeAt(spend);
  const r = s.price / inc;
  runs += r; spend += s.price;
  curve.push({ ...s, spend, runs, r, inc: Math.round(inc) });
}

// Band summary: the career cut into spend decades.
const BANDS = [
  ['A: 0 - 2.2k (the cheap catalogue)', 0, 2200],
  ['B: 2.2k - 30k', 2200, 30000],
  ['C: 30k - 140k (pre-luck)', 30000, 140000],
  ['D: 140k - 1M (the G17 mid/top rungs)', 140000, 1000000],
  ['E: 1M - 6.8M', 1000000, 6830000],
  ['F: 6.8M - 98.5M (end-game)', 6830000, 98549753],
];
console.log('=== THE MEASURED CURVE: runs per next-step upgrade, band by band ===');
for (const [label, lo, hi] of BANDS) {
  const inBand = curve.filter(c => c.spend - c.price >= lo && c.spend - c.price < hi);
  if (!inBand.length) { console.log(label + ': no steps'); continue; }
  const rs = inBand.map(c => c.r);
  const worst = inBand.reduce((m, c) => (c.r > m.r ? c : m), inBand[0]);
  console.log(label + ': ' + inBand.length + ' steps, runs/step min ' +
    Math.min(...rs).toFixed(1) + ' max ' + Math.max(...rs).toFixed(0) +
    ' | worst step: ' + worst.name + ' L' + worst.lv + ' @ ' + worst.price.toLocaleString() +
    'g = ' + worst.r.toFixed(0) + ' runs (income ' + worst.inc + 'g/run)' +
    ' | career position ~run ' + Math.max(1, Math.round(inBand[0].runs - inBand[0].r)));
}

// The worst stretch overall.
const worst10 = [...curve].sort((a, b) => b.r - a.r).slice(0, 10);
console.log('\n=== THE 10 WORST STEPS IN THE CAREER ===');
for (const w of worst10)
  console.log('  ' + w.name + ' L' + w.lv + ' ' + w.price.toLocaleString() +
    'g = ' + w.r.toFixed(0) + ' runs (income ' + w.inc + 'g/run, spend ' +
    w.spend.toLocaleString() + ', ~run ' + Math.round(w.runs) + ')');

// Owner anchors cross-check.
console.log('\n=== ANCHOR CROSS-CHECKS ===');
const at300 = curve.filter(c => c.price / 300 <= 4 && c.price / 300 >= 0.25).length;
console.log('at the owner\'s 300g/run: steps costing 0.75-4 runs = prices 225-1,200g -> ' +
  at300 + ' of ' + curve.length + ' steps; the first step ABOVE 4 runs costs ' +
  curve.find(c => c.price / 300 > 4).price.toLocaleString() + 'g (' +
  curve.find(c => c.price / 300 > 4).name + ')');
console.log('player review "1/4 of a single upgrade": at 300g/run a 1,200g rung = exactly 4 runs -> 1/4');

// Chest overlay: the run-count chests inject 10 runs of income at each of
// 50/100/200/500. Where do they land on this curve, and what do they shave?
console.log('\n=== CHEST INTERACTION (run-count chests ON TOP) ===');
for (const m of [50, 100, 200, 500]) {
  const atRun = curve.find(c => c.runs >= m) || curve[curve.length - 1];
  const inc = incomeAt(atRun.spend - atRun.price);
  console.log('  chest @run ' + m + ': career spend ~' + (atRun.spend - atRun.price).toLocaleString() +
    'g, income floor ' + Math.round(inc) + 'g/run -> pays ' + (Math.round(inc * 10)).toLocaleString() +
    'g = 10 runs; worst step then = ' + (atRun.r / 10).toFixed(0) + '% of it');
}

// OPTION 1 (price side, PROPOSAL ONLY): re-base the two mid gates + add
// classic-row extensions, keeping full-buys ~equal. Simulated as: luck and
// fleetfoot L1 re-based to 35,000/20,000 with growth raised so full-buy is
// preserved; slots L2/L3 flattened. (Numbers are the owner's call.)
console.log('\n=== OPTION 1 (price granularity, PROPOSAL — no constants changed) ===');
const luck = SHOP_UPGRADES.find(r => r.id === 'luck');
const ff = SHOP_UPGRADES.find(r => r.id === 'fleetfoot');
const fullBuy = (r) => { let t = 0; for (let l = 0; l < r.maxLevel; l++) t += upgradeCost(r, l); return t; };
console.log('today: luck full-buy ' + fullBuy(luck).toLocaleString() + ' (L1 ' + luck.baseCost.toLocaleString() +
  ' = ' + (luck.baseCost / 200).toFixed(0) + ' runs at the 200g floor); fleetfoot full-buy ' +
  fullBuy(ff).toLocaleString() + ' (L1 ' + ff.baseCost.toLocaleString() + ' = ' +
  (ff.baseCost / 200).toFixed(0) + ' runs)');
// growth that preserves a 5-level full-buy at a new base: sum(g^0..g^4) must equal fullBuy/newBase
const growthFor = (total, base) => {
  let g = 1.5;
  for (let i = 0; i < 80; i++) {
    const sum = 1 + g + g * g + g ** 3 + g ** 4;
    g += (total / base - sum) / (1 + 2 * g + 3 * g * g + 4 * g ** 3);   // Newton-ish
  }
  return g;
};
for (const [row, newBase] of [[luck, 35000], [ff, 20000]]) {
  const g = growthFor(fullBuy(row), newBase);
  console.log('proposed: ' + row.id + ' L1 ' + newBase.toLocaleString() + 'g = ' +
    (newBase / 200).toFixed(0) + ' runs; growth ' + g.toFixed(2) +
    ' keeps full-buy ' + Math.round(newBase * (1 + g + g * g + g ** 3 + g ** 4)).toLocaleString() +
    ' (today ' + fullBuy(row).toLocaleString() + ')');
}
console.log('slots today: L1/L2/L3 = 5,000/14,500/42,050 = 25/73/210 runs at the floor;');
console.log('a 3-step flatten to ~9,000/16,000/33,000 keeps the 42,050 full-buy at 45/80/165 runs worst.');
console.log('=> Option 1 lowers the WORST mid step from 700 runs (luck L1) to ~175; it CANNOT');
console.log('   reach the 1-4-run band at the measured 200g floor without ~170 extra rungs.');

// OPTION 2 (income side): what mid income makes today's ladder smooth?
console.log('\n=== OPTION 2 (income side — what would the floor have to be?) ===');
for (const target of [4, 10, 25]) {
  const inc = luck.baseCost / target;
  console.log('  luck L1 in ' + target + ' runs needs mid income ' + inc.toLocaleString() +
    'g/run = ' + (inc / 200).toFixed(0) + 'x the measured floor' +
    (inc > 569 ? ' (ABOVE even the 6.8M-build 60s rate)' : ''));
}
console.log('  a mid build surviving 120s at the measured 9.5 g/s wave-1 rate banks ~1,140/run');
console.log('  (5.7x the floor) -> luck L1 = 123 runs, slots L3 = 37: survival, not price, is');
console.log('  the lever that moves the whole mid band at once (PACING (d): root cause = the cliff).');
console.log('\nSIM: 0.0s across 0 arms (sources: [TABLE] SHOP_UPGRADES arithmetic x' + curve.length +
  ' steps; [CITED] PACING.md §1 anchors)');
