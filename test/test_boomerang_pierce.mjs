// HORDES — BOOMERANG PIERCE (agent F, wave-25).
//
// Defect: the thrown boomerang body carried a `pierce` field (stats.pierce +
// the per-level pierceBonus the Lv3/5/7 draft label advertises as '+1 pierce')
// and NOTHING read it — the only hit guard was a Set, so every enemy was hit
// exactly once per leg no matter the pierce value.
//
// Fix: `pierce` is implemented as the module's own documented meaning
// ('extra re-hit allowance', weapons.js BOOMERANG throw comment): each leg
// allows 1 + pierce hits PER ENEMY, refreshed when the leg flips. pierce 0 is
// byte-for-byte the old behaviour (1 hit per enemy per leg), and the archetype
// keeps its identity ('throws at the nearest enemy, pierces all') plus the
// pinned test_weapons.mjs assertion that a base throw hits both enemies on its
// path. The PIERCE_ALL sentinel (VOID_RANG's unlimited pass-through) keeps its
// old budget of one hit per enemy per leg on purpose: it means 'unlimited
// DISTINCT enemies', not 'unlimited damage'.
//
// Run: node test/test_boomerang_pierce.mjs   (exit 0 = pass)
import { WEAPON_TYPES, WEAPONS, makeWeapon, WEAPON_LEVELS } from '../src/weapons.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// Hit boxes are 9px wide, so dt 0.005 (1.2px steps) keeps a target on the
// flight path for ~15 frames — enough to observe a pierce budget up to ~15.
const DT = 0.005;
const HP = 1e9;

function makeState(pierce, flags) {
  const w = makeWeapon('BOOMERANG');
  if (flags) w.evolution = { affixes: {}, flags };
  return {
    w,
    st: {
      player: {
        x: 0, y: 0, hp: 100,
        stats: { damage: 10, cooldown: 0.55, projectiles: 1, pierce },
        buffs: { overcharge: 0 },
      },
      enemies: [{ x: 100, y: 0, hp: HP, maxHp: HP, flash: 0, slow: 0, typeId: 'CHASER' }],
      projectiles: [], effects: [], time: 0,
    },
  };
}

// Runs ONE throw (0.5s out + ~0.5s back, well inside the 1.6s cooldown) and
// returns how many hits landed on the target in each leg.
function legs(pierce, flags) {
  const { w, st } = makeState(pierce, flags);
  let outbound = null, total = 0;
  for (let i = 0; i < 400; i++) {
    const pr = st.projectiles.find(p => p.kind === 'boomerang');
    if (pr && pr.phase === 'back' && outbound === null) outbound = (HP - st.enemies[0].hp) / 10;
    if (!pr && i > 0) break;                        // caught: throw is over
    WEAPON_TYPES.BOOMERANG.update(st, w, DT);
  }
  total = (HP - st.enemies[0].hp) / 10;             // 10 = stats.damage * DAMAGE_MULT
  return { outbound, total };
}

console.log('PIERCE BUDGET PER LEG:');
{
  const p0 = legs(0);
  ok(p0.outbound === 1, `pierce 0: one hit on the outbound leg (got ${p0.outbound})`);
  ok(p0.total === 2, `pierce 0: one re-hit on the return leg (total ${p0.total})`);

  const p1 = legs(1);
  ok(p1.outbound === 2, `pierce 1: two hits on the outbound leg (got ${p1.outbound})`);

  const p2 = legs(2);
  ok(p2.outbound === 3, `pierce 2: three hits on the outbound leg (got ${p2.outbound})`);
  ok(p2.total === 6, `pierce 2: the return leg's budget refreshes (total ${p2.total})`);

  ok(legs(4).outbound === 5, `pierce 4: five hits on the outbound leg (got ${legs(4).outbound})`);
}

console.log('LEVEL TABLE + LABEL BACKING:');
{
  // The Lv3/5/7 draft label promises '+1 pierce' — the level table must keep
  // granting it and the throw must carry it.
  const { w, st } = makeState(0);
  w.level = 5;
  WEAPON_TYPES.BOOMERANG.update(st, w, DT);
  const body = st.projectiles.find(p => p.kind === 'boomerang');
  ok(body && body.pierce === 2, `Lv5 body carries +2 pierce (got ${body && body.pierce})`);
  ok(legs(0, []).outbound === 1 && legs(2).outbound === 3,
    'the advertised pierce is what the leg budget actually consumes');
  ok([3, 5, 7].every(L => WEAPON_LEVELS.BOOMERANG[L - 1].label.includes('+1 pierce')),
    'Lv3/Lv5/Lv7 labels still advertise the (now real) +1 pierce');
}

console.log('PIERCE_ALL (VOID_RANG) STAYS ONE HIT PER ENEMY PER LEG:');
{
  const all = legs(0, ['pierceAll']);
  ok(all.outbound === 1,
    `pierceAll: one hit per enemy per leg, unchanged (got ${all.outbound})`);
  ok(all.total === 2, `pierceAll: two legs, two hits (got ${all.total})`);
}

console.log('BASE ARCHETYPE IDENTITY (pinned by test_weapons.mjs):');
{
  // A throw still pierces DISTINCT enemies on its path: two enemies side by
  // side on the outbound line both take a hit with pierce 0.
  const { w, st } = makeState(0);
  st.enemies.push({ x: 100, y: 6, hp: HP, maxHp: HP, flash: 0, slow: 0, typeId: 'CHASER' });
  for (let i = 0; i < 120; i++) WEAPON_TYPES.BOOMERANG.update(st, w, DT);
  ok(st.enemies.every(e => e.hp < HP), 'both enemies on the path are hit by one throw');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL BOOMERANG PIERCE TESTS PASSED');
