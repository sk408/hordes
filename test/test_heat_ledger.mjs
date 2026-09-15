// HORDES — HEAT LEDGER hygiene (agent F, wave-25).
//
// Defects in addHeat():
//   1. The dedupe eventId was recorded BEFORE the cap was applied, so a call
//      that charged nothing (ledger already at HEAT_CAP) still burned the id —
//      a later call with the same id was then rejected as 'duplicate' even
//      though it never cost anything.
//   2. A negative amount reported reason 'ok' (0 added, nothing charged):
//      `added < want` is false when want is negative.
//
// Fix: the event id is only recorded when the ledger actually moved (added>0),
// and a want <= 0 that is not the free ITEM_EXCHANGE path reports 'cap'.
// ITEM_EXCHANGE keeps its documented free 'ok' response (hb1 calls it on every
// 4/4 swap).
//
// Run: node test/test_heat_ledger.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { HEAT_CAP, addHeat, heatOf, manualPushes, heatMultipliers,
  goldMult, heatXpMult, describeHeatPayout } from '../src/heat.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const run = () => ({ heat: { total: 0, manual: 0, events: new Set() } });
const fill = (r, n) => { for (let i = 0; i < n; i++) addHeat(r, 'MANUAL_PUSH'); };
const has = (r, id) => r.heat.events.has(id);

console.log('CAP: nothing added -> nothing recorded');
{
  const r = run();
  fill(r, HEAT_CAP);
  const res = addHeat(r, 'MANUAL_PUSH', null, 'levelup:VOLLEY:7');
  ok(res.applied === true && res.added === 0 && res.reason === 'cap',
    `a full ledger still "applies" with added 0 + reason cap (${JSON.stringify(res)})`);
  ok(!has(r, 'levelup:VOLLEY:7'),
    'the event id is NOT burned when the ledger did not move');
  ok(heatOf(r) === HEAT_CAP && manualPushes(r) === HEAT_CAP, 'the ledger itself is untouched');

  // ...and the same id can still be charged once there is room.
  r.heat.total = HEAT_CAP - 2;   // simulate a fresh run's ledger with room
  r.heat.manual = 0;
  const okd = addHeat(r, 'MANUAL_PUSH', null, 'levelup:VOLLEY:7');
  ok(okd.applied === true && okd.added === 1 && okd.reason === 'ok',
    'the un-burned id charges normally once there is room');
  ok(has(r, 'levelup:VOLLEY:7'), 'a real charge does record the id');
  const dup = addHeat(r, 'MANUAL_PUSH', null, 'levelup:VOLLEY:7');
  ok(dup.applied === false && dup.reason === 'duplicate',
    'the id is still deduped after a real charge');
}

console.log('NEGATIVE amount -> reason cap, nothing charged');
{
  const r = run();
  const res = addHeat(r, 'MANUAL_PUSH', -5);
  ok(res.added === 0 && res.reason === 'cap',
    `a negative amount charges nothing and reports cap (${JSON.stringify(res)})`);
  ok(heatOf(r) === 0 && manualPushes(r) === 0, 'heat never goes negative');
  const r2 = run();
  const mid = addHeat(r2, 'MANUAL_PUSH', -5, 'neg:id');
  ok(!has(r2, 'neg:id'), 'a no-op negative charge does not burn its event id');
  ok(mid.heat === 0, 'heat stays 0');
}

console.log('FREE EXCHANGE keeps its documented shape');
{
  const r = run();
  const res = addHeat(r, 'ITEM_EXCHANGE', null, 'swap:1');
  ok(res.applied === true && res.added === 0 && res.reason === 'ok',
    'ITEM_EXCHANGE is accepted with reason ok (never an error)');
  ok(!has(r, 'swap:1'), 'a free exchange does not burn an event id');
  const r2 = run();
  fill(r2, HEAT_CAP);
  const atCap = addHeat(r2, 'ITEM_EXCHANGE', null, 'swap:2');
  ok(atCap.reason === 'ok' && atCap.added === 0, 'exchanges are still free at the cap');

  // Free exchanges stay callable forever (no special-casing needed by hb1).
  for (let i = 0; i < 50; i++) addHeat(r, 'ITEM_EXCHANGE');
  ok(heatOf(r) === 0, '50 swaps move nothing');
}

console.log('PARTIAL fill still charges + records');
{
  const r = run();
  fill(r, 19);
  const res = addHeat(r, 'WEAPON_EVOLUTION', null, 'evo:ZAP:2');
  ok(res.added === 1 && res.reason === 'cap' && heatOf(r) === HEAT_CAP,
    'a partial fill reports cap with its real delta');
  ok(has(r, 'evo:ZAP:2'), 'a partial (non-zero) charge does record its id');
}

console.log('UNKNOWN source / untouched contracts');
{
  const r = run();
  const bad = addHeat(r, 'NOT_A_SOURCE', null, 'x');
  ok(bad.applied === false && bad.reason === 'source' && !has(r, 'x'),
    'an unknown source is rejected and records nothing');
  const snap = JSON.stringify({ ...r, heat: null });
  addHeat(r, 'WEAPON_EVOLUTION', null, 'e1');
  assert.equal(JSON.stringify({ ...r, heat: null }), snap, 'addHeat only touches run.heat');
  console.log('  PASS addHeat only touches run.heat');
}

console.log('G24: the MANUAL ledger count drives BOTH payout channels');
{
  // 10 evolutions hit the cap with ZERO manual pushes: both payouts flat 1x.
  const builtin = run();
  for (let i = 0; i < 10; i++) addHeat(builtin, 'WEAPON_EVOLUTION');
  ok(heatOf(builtin) === HEAT_CAP && manualPushes(builtin) === 0,
    'a full cap of BUILT-IN heat leaves the manual count at 0');
  ok(goldMult(manualPushes(builtin)) === 1 && heatXpMult(manualPushes(builtin)) === 1,
    'built-in heat pays NOTHING on either channel (the symmetry rule)');

  // 3 manual pushes on a fresh ledger: gold x1.9, xp x1.36.
  const m = run();
  fill(m, 3);
  ok(Math.abs(goldMult(manualPushes(m)) - 1.9) < 1e-9 &&
     Math.abs(heatXpMult(manualPushes(m)) - 1.36) < 1e-9,
    '3 manual pushes pay gold x1.9 AND xp x1.36');
  ok(heatMultipliers(heatOf(m), manualPushes(m)).gold === goldMult(manualPushes(m)),
    'the multipliers bag gold field and goldMult agree on the manual read');

  // A blocked push at the cap never reaches either curve (id not burned,
  // manual not counted) — the ledger-hygiene half of the payout rule.
  const c = run();
  fill(c, HEAT_CAP);
  const blocked = addHeat(c, 'MANUAL_PUSH');
  ok(blocked.added === 0 && manualPushes(c) === HEAT_CAP &&
     Math.abs(goldMult(manualPushes(c)) - (1 + 0.30 * HEAT_CAP)) < 1e-9 &&
     Math.abs(heatXpMult(manualPushes(c)) - (1 + 0.12 * HEAT_CAP)) < 1e-9,
    'a blocked push at the cap leaves both curves at exactly the capped count');

  // The readout both channels produce, side by side at 0 / 3 / 6.
  console.log('  per-channel multipliers at manual 0 / 3 / 6 (cost vs payout):');
  for (const n of [0, 3, 6]) {
    const cost = heatMultipliers(n, n);
    console.log(`    manual ${n}: COST hp x${cost.hp.toFixed(2)} damage x${cost.damage.toFixed(2)} ` +
      `spawn x${cost.spawnRate.toFixed(2)} | PAYOUT ${describeHeatPayout(n)}`);
  }
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL HEAT LEDGER TESTS PASSED');
