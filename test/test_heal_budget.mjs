// HORDES — G36 SHARED SUSTAINED-HEALING BUDGET (owner 2026-09-16: "Ok let's
// fix it, yeah" — the second invincibility door found by the G35 unseeded
// hunt: GRAVE HARVEST healed 2 HP per sweep kill with no rate cap, and stacked
// on the G34-capped lifesteal it restored the symptom: ALIVE@300s, floor
// 18/298, healed 7,985, peak 89.6 kills/s).
//
// Pins, per docs/briefs/HARVEST_HEAL_CAP.md:
//   - ONE shared budget (src/heal.js refillHealBudget/healFromBudget,
//     CONFIG.HEAL_BUDGET.CAP_FRAC): lifesteal AND harvest draw the SAME
//     bucket; combined absurd throughput heals EXACTLY the cap rate per
//     second and never more.
//   - The harvest site (weapons.js, driven through the REAL updateWeapons on
//     a REAL loop state): a sweep killing N enemies heals min(2*N, remaining
//     budget) — exactly 2*N below the cap (pre-change formula), exactly the
//     remaining budget above it; the burst (one sweep, one budget) is
//     preserved.
//   - The BOUNDARY: potions, regrowth and the Consecration altar are UNAFFECTED
//     by an empty budget (their amounts are asserted unchanged).
//   - dt-driven under unequal steps; the budget resets per run.
// The lifesteal side of the same seam is pinned by test_lifesteal_cap.mjs.
// Run: node test/test_heal_budget.mjs
import assert from 'node:assert/strict';
import { refillHealBudget, healFromBudget } from '../src/heal.js';
import { CONFIG as C } from '../src/config.js';
import { bootReal } from '../tools/real_loop.mjs';
import { makeWeapon, levelUpWeapon, WEAPON_MAX_LEVEL, updateWeapons } from '../src/weapons.js';
import { evolveWeapon } from '../src/evolutions.js';
import { usePotion } from '../src/skills.js';
import { grantSkill, applyRegrowth, hpRegenPerSec } from '../src/perks.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const CAP = C.HEAL_BUDGET.CAP_FRAC;

// ---- 1. the shipped cap and its derivation -------------------------------------
ok('config: HEAL_BUDGET.CAP_FRAC present and equals 0.25 (unchanged from G34)',
  CAP === 0.25, CAP);
ok('derivation: below the burst ceiling (HIT_CAP/iframe = 0.833/s)',
  CAP < C.SURVIVAL.HIT_CAP_FRAC / 0.6);
ok('derivation: at/below the measured sustained inbound (0.27/s)',
  CAP <= 0.27);
ok('derivation: below the G35 harvest arm peak heal (~0.60 x maxHp/s)',
  CAP < 0.60);

// ---- 2. ONE budget, TWO spenders (PURE seam arithmetic) ------------------------
// Lifesteal-shaped and harvest-shaped absurd spends alternating, one refill per
// frame: the COMBINED heal is exactly the cap rate.
{
  const maxHp = 100, B = CAP * maxHp;
  // (a) burst accounting: starting from a FULL budget, second 1 never exceeds
  // the starting budget + one second's refill; second 2 is exactly the cap.
  let bucket = B, s1 = 0, s2 = 0;
  for (let i = 0; i < 120; i++) {
    const dt = 1 / 60;
    bucket = refillHealBudget(bucket, dt, maxHp, CAP);
    const a = healFromBudget(bucket, 1e9); bucket -= a;   // "lifesteal" site
    const b = healFromBudget(bucket, 1e9); bucket -= b;   // "harvest" site
    if (i < 60) s1 += a + b; else s2 += a + b;
  }
  ok('combined lifesteal+harvest absurd stream: second 1 <= starting budget + one refill second',
    s1 <= B + B * (59 / 60) + 1e-9, s1);
  ok('combined stream, second 2 (pure sustained): healed == EXACTLY the cap rate',
    near(s2, B, 1e-7), s2);
  // (b) dt-driven, rate not count: from an EMPTY budget the same 2.0s of sim
  // time in three different (unequal) step patterns heals the SAME total,
  // exactly 2 x cap rate — the budget cannot be gamed by step sizes.
  const stream = (dts) => {
    let bk = 0, total = 0;
    for (const dt of dts) {
      bk = refillHealBudget(bk, dt, maxHp, CAP);
      const a = healFromBudget(bk, 1e9); bk -= a;
      const c = healFromBudget(bk, 1e9); bk -= c;
      total += a + c;
    }
    return total;
  };
  const equal = stream(new Array(120).fill(1 / 60));
  const ragged = stream([0.3, 0.05, 0.1, 0.02, 0.28, 0.25, 1.0]);
  ok('two absurd spenders, empty start: 2.0s in equal steps heals exactly 2 x cap',
    near(equal, B * 2, 1e-7), equal);
  ok('the same 2.0s in UNEQUAL steps heals the SAME total (dt-driven rate, not count)',
    near(ragged, B * 2, 1e-7), ragged);
  ok('...and the two partitions agree with each other bit-close',
    near(equal, ragged, 1e-7));
}

// ---- 3. the harvest site draws the SHARED budget (real updateWeapons) ----------
const h = await bootReal('fresh');
const st = h.state;
h.startRun();
const frame = () => {
  h.dom.advance(1000 / 60);
  const cb = h.dom.rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(performance.now());
};
st.enemies.length = 0; st.drops.length = 0; st.gems.length = 0;
st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; st.wave.midAt = st.time + 9999;
ok('probe runs in the live play loop', st.mode === 'playing', st.mode);

let P = st.player;
P.potions.hp = 0; P.potions.mp = 0;
P.stats.lifesteal = 0;            // isolate harvest: the lifesteal site stays OUT

const scythe = makeWeapon('SCYTHE');
while (scythe.level < WEAPON_MAX_LEVEL) levelUpWeapon(scythe);
ok('GRAVE_HARVEST evolution staged (the same evolveWeapon path the game uses)',
  evolveWeapon(scythe, new Set(['lifesteal']), 1).ok === true);

// Drive the REAL weapon module directly (the sweep, its kills and its heal are
// exactly the shipped code; the main-loop volley cannot interfere here).
const sweep = (n) => {            // n one-HP enemies around the player; returns healed
  const hpBefore = P.hp, budgetBefore = st.healBudget;
  for (let i = 0; i < n; i++) st.enemies.push({ typeId: 'CHASER', elite: false,
    x: P.x + (i % 5) * 2 - 4, y: P.y + Math.floor(i / 5) * 2 - 4, hp: 1, maxHp: 1,
    speed: 0, xp: 0, w: 10, h: 10, contactDamageMult: 1, variant: 0, packSize: 1,
    minWave: 0, age: 0, attached: false, flash: 0, slow: 0, z: 0 });
  scythe.cd = 0; scythe.swing = null;
  for (let i = 0; i < 600; i++) {
    updateWeapons(st, [scythe], 1 / 60);
    if (st.enemies.every(e => e.hp <= 0)) break;
  }
  if (!st.enemies.every(e => e.hp <= 0)) throw new Error('sweep never landed');
  st.enemies.length = 0;          // clear the corpses
  return { healed: P.hp - hpBefore, spent: budgetBefore - st.healBudget };
};

ok('the budget starts each run FULL', st.healBudget === CAP * P.stats.maxHp,
  { budget: st.healBudget, want: CAP * P.stats.maxHp });
const B = CAP * P.stats.maxHp;    // maxHp 100 on fresh => B = 25

{ // BELOW the cap: a modest sweep is byte-identical to the old 2 * souls.
  P.hp = 1;
  const r = sweep(3);             // want 6 << 25
  ok('below the cap a 3-kill sweep heals EXACTLY 2*souls = 6 (pre-change formula)',
    r.healed === 6, r);
  ok('...and spends exactly 6 from the budget', near(r.spent, 6, 1e-9), r.spent);
  ok('the shared budget is what it drew: B - 6 remains',
    near(st.healBudget, B - 6, 1e-9), st.healBudget);
}
{ // ABOVE the cap: the remaining budget binds, not 2*souls.
  P.hp = 1;
  const r = sweep(20);            // want 40 > B-6 remaining
  ok('a 20-kill sweep (want 40) heals EXACTLY the remaining budget, not 2*souls',
    near(r.healed, B - 6, 1e-9), r);
  ok('...and drains the budget to zero', st.healBudget < 1e-9, st.healBudget);
}
{ // The BURST is preserved: a fresh one-second budget lands in full on one sweep.
  h.startRun();                   // per-run reset: budget FULL again (and a NEW
  P = st.player;                  // player object — re-grab the reference)
  P.stats.lifesteal = 0; P.potions.hp = 0; P.potions.mp = 0;
  ok('the budget RESETS per run (fresh run = full budget)',
    st.healBudget === CAP * P.stats.maxHp, st.healBudget);
  P.hp = 1;
  const r = sweep(20);            // want 40 > full budget
  ok('a single sweep heals in FULL up to one second\'s budget (burst preserved)',
    near(r.healed, B, 1e-9), r);
}
{ // CROSS-SITE sharing, live: with the budget drained by harvest, the LIFESTEAL
  // site heals only what one frame's refill adds — one bucket feeds both doors.
  st.healBudget = 0;
  P.stats.lifesteal = 1000;       // absurd want
  P.hp = 1;
  const tank = { typeId: 'CHASER', elite: false, x: P.x + 300, y: P.y, hp: Infinity,
    maxHp: Infinity, speed: 0, xp: 0, w: 10, h: 10, contactDamageMult: 1, variant: 0,
    packSize: 1, minWave: 0, age: 0, attached: false, flash: 0, slow: 0, z: 0 };
  st.enemies.push(tank);
  const hp0 = P.hp;
  st.projectiles.push({ x: tank.x, y: tank.y, vx: 0, vy: 0, damage: 100,
    hit: new Set(), pierce: 0, age: 0 });
  frame();                        // refill adds budget*dt; the lifesteal site spends it
  ok('lifesteal after harvest drained the bucket heals ONLY the frame refill (shared)',
    near(P.hp - hp0, B / 60, 1e-7), P.hp - hp0);
  st.enemies.length = 0;
}

// ---- 4. the BOUNDARY: non-throughput heals are UNAFFECTED by an empty budget ---
st.healBudget = 0;
{ // Potions stay a burst escape: full 35 with the budget at zero.
  P.hp = 1;
  P.potions.hp = 1;
  const used = usePotion(st, 'hp');
  ok('potion unaffected by an empty budget: consumed and heals exactly HP_HEAL',
    used === true && P.hp === 1 + C.POTIONS.HP_HEAL, P.hp);
}
{ // Regrowth stays a flat trickle: 0.7 HP/s with the budget at zero.
  grantSkill(st, 'regrowth');
  P.hp = 1;
  const healed = applyRegrowth(st, 1);
  ok('regrowth unaffected by an empty budget: exactly REGROWTH_HP_PER_SEC per second',
    near(healed, hpRegenPerSec(st) * 1, 1e-12) && hpRegenPerSec(st) === 0.7, healed);
}
{ // The altar keeps its OWN independent cap (DPS*TICK per tick) with the budget at zero.
  const def = C.SKILLS.CONSECRATION;
  P.hp = 1;
  P.consecField = { x: P.x, y: P.y, radius: def.RADIUS, t: def.DURATION,
    elapsed: 0, ticks: 0, healAcc: 1e9 };   // absurd banked heal-per-kill
  const { updateUlts } = await import('../src/skills.js');
  updateUlts(st, def.TICK);       // exactly one tick fires
  ok('altar unaffected by an empty budget: heals exactly its own DPS*TICK cap',
    near(P.hp - 1, def.DPS * def.TICK, 1e-9), { healed: P.hp - 1, cap: def.DPS * def.TICK });
  P.consecField = null;
}

console.log(`test_heal_budget: all ${passed} checks passed`);
