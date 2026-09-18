// HORDES — POTION TUNE (owner directives 2026-09-17):
//   msg_01M2R9CXBYXHQPN06YGC9B37GP — drop rate CUT TO ONE FIFTH (x0.2) and a
//     STEEPER trail-off (owner clarification: "cut it to 1/5th not by 1/5th");
//   msg_01M2RE1V8CNZABTQ7W0ETEEPY0 — AUTO-DRINK THRESHOLD: in auto mode a
//     potion is used when CURRENT HP FALLS BELOW THE POTION'S HEAL AMOUNT
//     (owner: "If HP drops below what a potion would heal, it should be used";
//     clarification: "In auto mode that is"). MANUAL PLAY UNCHANGED.
//
// Pins:
//   - the cut: DROP_CHANCE is exactly 0.006 (0.03 / 5), and the effective
//     per-kill rate at every low rate is exactly one fifth of the old one;
//   - the steeper trail-off: the adaptive factor is now (REF/kps)^2 clamped to
//     [0.04, 1] (was REF/kps clamped to [0.2, 1]) — numerically strictly below
//     the old factor at every rate above REF, floor 0.2 -> 0.04, floor bind
//     point unchanged (kps = 100);
//   - the rate table at run stages, asserted numerically with tolerance;
//   - the threshold: fires strictly below the heal value (Alchemy/potion-heal
//     choices included), never at or above it; a MANUAL pilot never fires;
//     one drink per cooldown (no stack burn in consecutive frames); the exact
//     threshold value is derived from the same healMult the drink applies;
//   - the resource-spend audit table exists on disk (the AUTO-DYING-RICH
//     audit the directive demands, docs/RESOURCE_SPEND_AUDIT_2026-09-17.md).
// Run: node test/test_potion_tune.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { adaptiveDropFactor } from '../src/loot.js';
import { CONFIG as C } from '../src/config.js';
import { bootReal } from '../tools/real_loop.mjs';

let failed = 0;
function ok(name, cond, detail) {
  if (!cond) { failed++; console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
  else console.log('  ok - ' + name);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const { REF_KPS, FLOOR_FRAC, TAU } = C.POTIONS.ADAPTIVE;
const BASE = C.POTIONS.DROP_CHANCE;
const OLD_BASE = 0.03, OLD_FLOOR = 0.2;
const factor = (kps) => adaptiveDropFactor(kps, REF_KPS, FLOOR_FRAC);
const oldFactor = (kps) => Math.min(1, Math.max(OLD_FLOOR, REF_KPS / kps));

console.log('THE CUT (to 1/5):');
ok('DROP_CHANCE is EXACTLY one fifth of the old 0.03 (0.006)',
  BASE === 0.006, BASE);
ok('the low-rate end is still factor-1 (early shape untouched)',
  factor(0) === 1 && factor(0.3) === 1 && factor(REF_KPS) === 1);

console.log('THE STEEPER TRAIL-OFF:');
ok('FLOOR_FRAC cut 0.2 -> 0.04 (one fifth of the old floor)', FLOOR_FRAC === 0.04, FLOOR_FRAC);
ok('the curve is the SQUARED inverse: (REF/kps)^2 clamped to [FLOOR, 1]',
  near(factor(40), Math.pow(REF_KPS / 40, 2)) &&
  near(factor(60), Math.pow(REF_KPS / 60, 2)) &&
  near(factor(80), Math.pow(REF_KPS / 80, 2)));
ok('floor binds at kps >= 100 (bind point unchanged): factor(100) === FLOOR',
  near(factor(100), FLOOR_FRAC) && factor(1e9) === FLOOR_FRAC);
{
  let steeper = true;
  for (let k = REF_KPS + 1; k <= 300; k++) if (!(factor(k) < oldFactor(k))) steeper = false;
  ok('STRICTLY steeper than the old curve at every rate above REF (to 300 kps)', steeper);
}
// The rate table at run stages — the numbers the report quotes.
{
  const stages = [0.3, 5, 20, 30, 40, 60, 80, 100, 1000];
  const oldRate = (k) => OLD_BASE * oldFactor(k);
  const newRate = (k) => BASE * factor(k);
  let tableOk = true, ratioOk = true;
  for (const k of stages) {
    if (!near(newRate(k), BASE * Math.min(1, Math.max(FLOOR_FRAC, Math.pow(REF_KPS / k, 2))), 1e-12)) tableOk = false;
    if (newRate(k) > oldRate(k) / 5 + 1e-12) ratioOk = false;   // never more than 1/5 of old
  }
  ok('effective per-kill rate table matches the formula at every stage', tableOk);
  ok('at EVERY stage the new rate is at most one fifth of the old rate', ratioOk);
  ok('at/below REF the cut is EXACTLY one fifth (0.006 vs 0.03)',
    near(newRate(5), oldRate(5) / 5) && near(newRate(20), oldRate(20) / 5));
  ok('at the measured swarm band the cut is deeper than 1/5 (steeper trail-off): ' +
     'kps60 ' + (newRate(60) / oldRate(60)).toFixed(3) + 'x, kps93 ' + (newRate(93) / oldRate(93)).toFixed(3) + 'x',
    newRate(60) / oldRate(60) < 0.2 && newRate(93) / oldRate(93) < 0.2);
}

console.log('AUTO-DRINK THRESHOLD (= the potion\'s heal):');
const h = await bootReal('fresh');
const st = h.state;
h.startRun();
const frame = () => {
  h.dom.advance(1000 / 60);
  const cb = h.dom.rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(performance.now());
};
// Quiet the run (the test_potion_drops idiom): no spawns, no overlays, so the
// only HP movement is what the test itself sets.
st.enemies.length = 0; st.drops.length = 0; st.gems.length = 0;
st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; st.wave.midAt = st.time + 9999;
for (let i = 0; i < 30; i++) frame();
const p = st.player;
const healMult = () => ((p.choices && p.choices.potionHealMult) || 1) * (p.stats.potionPower || 1);
const healValue = () => C.POTIONS.HP_HEAL * healMult();

// (a) the exact boundary: never AT or above the heal value.
p.stats.maxHp = 1000; p.hp = 1000;
p.potions.hp = 3; st.autoDrinkCd.hp = 0;
p.hp = healValue();                     // exactly at the threshold
frame();
ok('AT the heal value (' + healValue() + ' HP): NO drink (strictly-below trigger)',
  p.potions.hp === 3, { potions: p.potions.hp });
p.hp = healValue() + 1;                 // above
frame();
ok('ABOVE the heal value: NO drink', p.potions.hp === 3);
p.hp = healValue() - 0.5;               // below -> fires
frame();
ok('BELOW the heal value: the AUTO pilot drinks (charge spent, HP restored)',
  p.potions.hp === 2 && near(p.hp, 2 * healValue() - 0.5, 1e-6), { potions: p.potions.hp, hp: p.hp });

// (b) one drink per cooldown — no stack burn across consecutive frames.
const afterFirst = p.hp;
p.hp = 1;                               // still deep below the threshold
frame(); frame(); frame();              // three more frames inside the cooldown
ok('no second drink inside the cooldown (one potion at a time + re-check)',
  p.potions.hp === 2, { potions: p.potions.hp });
for (let i = 0; i < 120; i++) frame();  // 2s > COOLDOWN 1.5s
ok('after the cooldown elapses the next drink fires',
  p.potions.hp === 1, { potions: p.potions.hp });

// (c) MANUAL play is unchanged: nothing auto-drinks a manual player's charge.
st.pilotMode = 'MANUAL';
p.potions.hp = 1; st.autoDrinkCd.hp = 0; p.hp = 1;
for (let i = 0; i < 120; i++) frame();
ok('a MANUAL pilot keeps 100% of the decision (no auto drink at hp=1)',
  p.potions.hp === 1 && p.hp === 1, { potions: p.potions.hp, hp: p.hp });
st.pilotMode = 'AUTO_ALL';

// (d) the threshold follows the SAME healMult the drink applies (Alchemy).
p.stats.potionPower = 2;                // heal 70 -> threshold 70
st.autoDrinkCd.hp = 0; p.potions.hp = 2;
p.hp = 70;                              // exactly at the doubled threshold
frame();
ok('Alchemy doubles BOTH the heal and the threshold (70 HP: no drink at the line)',
  p.potions.hp === 2);
p.hp = 69.5;
frame();
ok('Alchemy: below the doubled threshold the drink fires and heals the doubled 70',
  p.potions.hp === 1 && near(p.hp, 69.5 + healValue(), 1e-6), { potions: p.potions.hp, hp: p.hp });
p.stats.potionPower = 1;

// (e) the overheal property the report states: while maxHp >= 2*heal the
// trigger can never drink into overheal (hp < heal => missing > maxHp - heal
// >= heal). Numeric witness: maxHp 1000, heal 35, hp 34.9 -> lands exactly.
st.autoDrinkCd.hp = 0; p.potions.hp = 1;
p.hp = 34.9;
frame();
ok('with maxHp >= 2*heal the trigger cannot overheal (34.9 -> 69.9 exactly)',
  p.potions.hp === 0 && near(p.hp, 69.9, 1e-6), { hp: p.hp });

console.log('AUDIT TABLE:');
{
  const path = new URL('../docs/RESOURCE_SPEND_AUDIT_2026-09-17.md', import.meta.url).pathname;
  ok('docs/RESOURCE_SPEND_AUDIT_2026-09-17.md exists', existsSync(path));
  if (existsSync(path)) {
    const txt = readFileSync(path, 'utf8');
    for (const row of ['potions', 'magnet', 'ult', 'banked gold']) {
      ok('audit table covers "' + row + '"', txt.toLowerCase().includes(row));
    }
  }
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL POTION TUNE TESTS PASSED');
