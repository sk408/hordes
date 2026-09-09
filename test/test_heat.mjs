// Heat system unit tests — pure ledger math, no DOM.
// Run: node test/test_heat.mjs
import assert from 'node:assert/strict';
import {
  HEAT_CAP, HEAT_SOURCES, HEAT_CURVES,
  heatMultipliers, goldMult, heatOf, manualPushes, initHeat,
  addHeat, describeHeat,
} from '../src/heat.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const run = () => ({ heat: { total: 0, manual: 0, events: new Set() } });
const bare = () => ({});   // no ledger — lazy-init path

// --- Sk408's guard first: exchanging at 4/4 is FREE --------------------------
check('ITEM_EXCHANGE is pinned to +0 heat (the anti-runaway guard)', () => {
  assert.equal(HEAT_SOURCES.ITEM_EXCHANGE.amount, 0, 'exchange cost must stay 0');
  const r = run();
  const res = addHeat(r, 'ITEM_EXCHANGE');
  assert.equal(res.applied, true, 'free charge still "applies"');
  assert.equal(res.added, 0);
  assert.equal(heatOf(r), 0, 'exchanging adds ZERO heat');
  // a whole shopping spree of swaps at the 4/4 cap never moves the dial
  for (let i = 0; i < 50; i++) addHeat(r, 'ITEM_EXCHANGE');
  assert.equal(heatOf(r), 0);
});

// --- built-in sources charge their tuned costs -------------------------------
check('WEAPON_EVOLUTION +2, NEW_ITEM_SLOT +1, MANUAL_PUSH +1', () => {
  const a = run();
  assert.equal(addHeat(a, 'WEAPON_EVOLUTION').added, 2);
  assert.equal(heatOf(a), 2);
  const b = run();
  assert.equal(addHeat(b, 'NEW_ITEM_SLOT').added, 1);
  assert.equal(heatOf(b), 1);
  const c = run();
  assert.equal(addHeat(c, 'MANUAL_PUSH').added, 1);
  assert.equal(heatOf(c), 1);
  assert.equal(manualPushes(c), 1, 'manual push counted for gold');
  assert.equal(manualPushes(a), 0, 'evolution is NOT a manual push');
});

check('explicit amount overrides the tuned cost', () => {
  const r = run();
  assert.equal(addHeat(r, 'MANUAL_PUSH', 3).added, 3);
  assert.equal(heatOf(r), 3);
});

// --- soft cap ------------------------------------------------------------------
check('heat soft-clamps at HEAT_CAP; excess is dropped, not banked', () => {
  assert.equal(HEAT_CAP, 20);
  const r = run();
  for (let i = 0; i < 25; i++) addHeat(r, 'MANUAL_PUSH');
  assert.equal(heatOf(r), HEAT_CAP, '25 pushes stop at the cap');
  assert.equal(manualPushes(r), HEAT_CAP, 'capped pushes never hit the gold curve');
  // partial fill: at 19, a +2 evolution charges only +1
  const p = run();
  for (let i = 0; i < 19; i++) addHeat(p, 'MANUAL_PUSH');
  const res = addHeat(p, 'WEAPON_EVOLUTION'); // +2 into 1 room
  assert.equal(res.added, 1);
  assert.equal(heatOf(p), HEAT_CAP);
  assert.equal(res.reason, 'cap');
  // once full, pushes are accepted but charge nothing (reason 'cap')
  const full = addHeat(p, 'MANUAL_PUSH');
  assert.equal(full.applied, true);
  assert.equal(full.added, 0);
  assert.equal(full.reason, 'cap');
  assert.equal(manualPushes(p), 19, 'blocked push never hits the gold curve');
});

// --- multipliers: exact + monotonic --------------------------------------------
check('heatMultipliers exact values (hp 1+0.12h, damage 1+0.08h, spawn 1+0.06h)', () => {
  assert.deepEqual(heatMultipliers(0), { hp: 1, damage: 1, spawnRate: 1, gold: 1 });
  const m5 = heatMultipliers(5);
  assert.ok(Math.abs(m5.hp - 1.6) < 1e-9);
  assert.ok(Math.abs(m5.damage - 1.4) < 1e-9);
  assert.ok(Math.abs(m5.spawnRate - 1.3) < 1e-9);
  assert.equal(m5.gold, 1, 'built-in heat NEVER inflates gold');
  // negative/garbage heat clamps to neutral
  assert.deepEqual(heatMultipliers(-7), heatMultipliers(0));
});

check('heatMultipliers are monotonic in heat', () => {
  let prev = heatMultipliers(0);
  for (let h = 1; h <= HEAT_CAP; h++) {
    const m = heatMultipliers(h);
    assert.ok(m.hp > prev.hp && m.damage > prev.damage && m.spawnRate > prev.spawnRate,
      `heat ${h} strictly hotter than ${h - 1}`);
    assert.equal(m.gold, 1, 'gold stays flat across the built-in sweep');
    prev = m;
  }
});

// --- gold is MANUAL-only --------------------------------------------------------
check('goldMult is driven by manual pushes only (x1 + 0.30 each)', () => {
  assert.equal(goldMult(0), 1);
  assert.ok(Math.abs(goldMult(3) - 1.9) < 1e-9);
  // built-in heat does not touch gold: full cap of evolutions, flat gold
  const r = run();
  for (let i = 0; i < 10; i++) addHeat(r, 'WEAPON_EVOLUTION');
  assert.equal(heatOf(r), HEAT_CAP);
  assert.equal(goldMult(manualPushes(r)), 1, '20 built-in heat -> gold still 1x');
  assert.equal(heatMultipliers(heatOf(r)).gold, 1);
  // two manual pushes on a fresh run -> 1.6x gold, via the ledger's own count
  const m = run();
  addHeat(m, 'MANUAL_PUSH'); addHeat(m, 'MANUAL_PUSH');
  assert.ok(Math.abs(goldMult(manualPushes(m)) - 1.6) < 1e-9);
  assert.ok(Math.abs(heatMultipliers(heatOf(m), manualPushes(m)).gold - 1.6) < 1e-9);
});

// --- idempotence: one event id, one charge --------------------------------------
check('double addHeat with the same event id is ignored', () => {
  const r = run();
  addHeat(r, 'WEAPON_EVOLUTION', null, 'evo:VOLLEY:run42');
   // the level-up tick fires again (re-render, replayed pickup...):
  const dup = addHeat(r, 'WEAPON_EVOLUTION', null, 'evo:VOLLEY:run42');
  assert.equal(dup.applied, false);
  assert.equal(dup.reason, 'duplicate');
  assert.equal(heatOf(r), 2, 'charged exactly once');
  // different event ids are distinct charges
  addHeat(r, 'WEAPON_EVOLUTION', null, 'evo:BOOMERANG:run42');
  assert.equal(heatOf(r), 4);
  // free exchanges dedupe harmlessly too
  addHeat(r, 'ITEM_EXCHANGE', null, 'swap:7');
  addHeat(r, 'ITEM_EXCHANGE', null, 'swap:7');
  assert.equal(heatOf(r), 4);
});

// --- ledger hygiene --------------------------------------------------------------
check('unknown source rejected; bare runs lazy-init; heatOf/manualPushes safe', () => {
  const r = run();
  const bad = addHeat(r, 'NOT_A_SOURCE');
  assert.equal(bad.applied, false);
  assert.equal(bad.reason, 'source');
  assert.equal(heatOf(r), 0);
  // bare object: accessors are safe, addHeat creates the ledger
  const b = bare();
  assert.equal(heatOf(b), 0);
  assert.equal(manualPushes(b), 0);
  addHeat(b, 'NEW_ITEM_SLOT');
  assert.deepEqual([b.heat.total, b.heat.manual], [1, 0]);
  // initHeat is idempotent and returns the ledger
  const c = bare();
  assert.equal(initHeat(c), initHeat(c));
  assert.deepEqual({ total: c.heat.total, manual: c.heat.manual }, { total: 0, manual: 0 });
});

check('addHeat mutates ONLY run.heat', () => {
  const r = { player: { x: 1 }, gold: 0, heat: { total: 0, manual: 0, events: new Set() } };
  const snap = JSON.stringify({ ...r, heat: null });
  addHeat(r, 'WEAPON_EVOLUTION', null, 'e1');
  addHeat(r, 'MANUAL_PUSH');
  assert.equal(JSON.stringify({ ...r, heat: null }), snap, 'nothing outside run.heat changed');
});

// --- HUD line ---------------------------------------------------------------------
check('describeHeat one-liner matches the HUD format', () => {
  assert.equal(describeHeat(0), 'HEAT 0 (+0% foe HP)');
  assert.equal(describeHeat(3), 'HEAT 3 (+36% foe HP)');
  assert.equal(describeHeat(HEAT_CAP), 'HEAT 20 (+240% foe HP)');
  assert.match(describeHeat(7), /^HEAT 7 \(\+\d+% foe HP\)$/);
  // consistency with the actual multiplier the spawner will apply
  const m = heatMultipliers(3);
  assert.equal(describeHeat(3), `HEAT 3 (+${Math.round((m.hp - 1) * 100)}% foe HP)`);
});

// --- curves exported for tuning ---------------------------------------------------
check('HEAT_CURVES exported (hp 0.12 / damage 0.08 / spawn 0.06 / gold 0.30)', () => {
  assert.ok(Math.abs(HEAT_CURVES.HP - 0.12) < 1e-9);
  assert.ok(Math.abs(HEAT_CURVES.DAMAGE - 0.08) < 1e-9);
  assert.ok(Math.abs(HEAT_CURVES.SPAWN_RATE - 0.06) < 1e-9);
  assert.ok(Math.abs(HEAT_CURVES.GOLD - 0.30) < 1e-9);
  for (const k of Object.keys(HEAT_SOURCES)) assert.ok(HEAT_SOURCES[k].label, `${k} label`);
});

console.log(`\n${passed} assertion groups passed — test_heat OK`);
