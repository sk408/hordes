// HORDES — ARCH BUFF WIRING (agent F, wave-25).
//
// Defect: the arch power-ups (arches.js) advertise 'Attack rate x2 for 60s'
// (DOUBLE_FIRE.rateMult) and '+50% damage' (BERSERK.damageMult), but main.js
// applied them ONLY to the base volley it fires itself (runController) —
// weapons.js's rateScale()/dmgScale() never saw state.archBuffs, so the ~8
// weapon archetypes (ORBIT, BOOMERANG, ZAP, NOVA_PULSE, SCYTHE, SEEKER, MINE,
// BEAM) got NONE of it. On a full build the labelled effect landed at roughly
// 1/8 strength.
//
// Fix: weapons.js reads the SAME source main.js uses (arches.activeArchMods)
// inside rateScale()/dmgScale() + the ORBIT contact tick. It cannot
// double-apply: WEAPON_TYPES has no VOLLEY entry, so the volley (the one
// weapon main.js already scales) never passes through updateWeapons().
//
// Run: node test/test_arch_buffs.mjs   (exit 0 = pass)
import { WEAPON_TYPES, WEAPONS, makeWeapon } from '../src/weapons.js';
import { ARCH_TYPES } from '../src/arches.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const CD_WEAPONS = ['BOOMERANG', 'ZAP', 'NOVA_PULSE', 'SCYTHE', 'SEEKER', 'MINE', 'BEAM'];

function stubState(archIds = []) {
  return {
    player: {
      x: 0, y: 0, hp: 100, level: 1,
      stats: { damage: 10, cooldown: 0.55, projectiles: 1, pierce: 0 },
      buffs: { overcharge: 0 },
    },
    enemies: [], projectiles: [], effects: [], time: 0,
    archBuffs: archIds.map(type => ({ type, t: ARCH_TYPES[type].duration })),
  };
}
function dummy(x, y) {
  return { x, y, hp: 1e9, maxHp: 1e9, flash: 0, slow: 0, speed: 0, xp: 0, typeId: 'CHASER' };
}

// ---------- 1. the rate half: every cooldown weapon fires 2x under DOUBLE_FIRE
console.log('ARCH RATE (DOUBLE_FIRE -> cd / 2):');
{
  let allHalved = true, msgs = [];
  for (const id of CD_WEAPONS) {
    const base = stubState([]), arch = stubState(['DOUBLE_FIRE']);
    for (const st of [base, arch]) st.enemies.push(dummy(30, 0));
    const wb = makeWeapon(id), wa = makeWeapon(id);
    WEAPON_TYPES[id].update(base, wb, 0.016);
    WEAPON_TYPES[id].update(arch, wa, 0.016);
    const fired = wb.cd > 0 && wa.cd > 0;
    const halved = fired && Math.abs(wa.cd * 2 - wb.cd) < 1e-9;
    if (!halved) { allHalved = false; msgs.push(`${id}(base ${wb.cd} arch ${wa.cd})`); }
  }
  ok(allHalved, 'every cooldown weapon halves its interval under DOUBLE_FIRE' +
    (allHalved ? '' : ' — offenders: ' + msgs.join(', ')));
}

console.log('ARCH RATE (ORBIT contact tick -> tick / 2):');
{
  const mk = (archIds) => {
    const st = stubState(archIds);
    const e = dummy(WEAPONS.ORBIT.RADIUS, 0);   // blade 0 sits exactly here at t=0
    st.enemies.push(e);
    const w = makeWeapon('ORBIT');
    WEAPON_TYPES.ORBIT.update(st, w, 0.016);
    return w.ticks.get(e);
  };
  const base = mk([]), arch = mk(['DOUBLE_FIRE']);
  ok(base === WEAPONS.ORBIT.TICK, `base orbit contact tick is W.TICK (${base})`);
  ok(arch !== undefined && Math.abs(arch * 2 - base) < 1e-9,
    `orbit contact tick halves under DOUBLE_FIRE (${base} -> ${arch})`);
}

// ---------- 2. the damage half: BERSERK adds exactly x1.5 to every weapon
// One controlled first-hit sample per weapon, no crit (stats.crit absent ->
// critRoll never fires), so the comparison is exact and deterministic.
console.log('ARCH DAMAGE (BERSERK -> x1.5 on the first landed hit):');
{
  // Returns [damageInBaseState, damageInArchState] for the weapon's FIRST hit.
  // Both states advance in lockstep with the same dt, so BERSERK (which does
  // not touch rate in weapons.js) cannot shift when the hit lands.
  function firstHit(id, archId) {
    const A = stubState([]), B = stubState([archId]);
    const ex = id === 'ORBIT' ? WEAPONS.ORBIT.RADIUS : 15;   // orbit needs the ring
    for (const st of [A, B]) st.enemies.push(dummy(ex, 0));
    const wA = makeWeapon(id), wB = makeWeapon(id);
    let dA = 0, dB = 0;
    for (let i = 0; i < 600 && (dA === 0 || dB === 0); i++) {
      if (dA === 0) { WEAPON_TYPES[id].update(A, wA, 0.016); dA = 1e9 - A.enemies[0].hp; }
      if (dB === 0) { WEAPON_TYPES[id].update(B, wB, 0.016); dB = 1e9 - B.enemies[0].hp; }
    }
    return [dA, dB];
  }
  let allScaled = true, msgs = [];
  for (const id of ['ORBIT', ...CD_WEAPONS]) {
    const [dA, dB] = firstHit(id, 'BERSERK');
    if (dA <= 0 || Math.abs(dB - dA * 1.5) > 1e-9) {
      allScaled = false; msgs.push(`${id}(base ${dA} berserk ${dB})`);
    }
  }
  ok(allScaled, "every weapon archetype's first hit is x1.5 under BERSERK" +
    (allScaled ? '' : ' — offenders: ' + msgs.join(', ')));
}

// ---------- 3. aggregate: a full build's fire count doubles ----------
console.log('ARCH AGGREGATE (all cooldown weapons, 30s window):');
{
  const count = (archIds) => {
    const st = stubState(archIds);
    st.enemies.push(dummy(30, 0));
    const ws = CD_WEAPONS.map(id => makeWeapon(id));
    let fires = 0;
    for (let f = 0; f < 30 * 60; f++) {
      const before = ws.map(w => w.cd);
      for (const w of ws) WEAPON_TYPES[w.type].update(st, w, 1 / 60);
      for (let i = 0; i < ws.length; i++) if (ws[i].cd > before[i] + 1e-12) fires++;
    }
    return fires;
  };
  const base = count([]), arch = count(['DOUBLE_FIRE']);
  // Quantisation: a fixed window can gain/lose ONE fire per weapon at most.
  ok(base > 15, `baseline fires a meaningful number of times (${base})`);
  ok(Math.abs(arch - 2 * base) <= CD_WEAPONS.length,
    `a 7-weapon build fires ~2x as often under DOUBLE_FIRE (${base} -> ${arch}, tol ${CD_WEAPONS.length})`);
}

// ---------- 4. the no-double-apply invariants ----------
console.log('DOUBLE-APPLY GUARDS:');
{
  // The volley is fired by main.js's runController, which applies am.rateMult /
  // am.damageMult itself. If VOLLEY ever gained an entry here, updateWeapons()
  // would apply the arch mods a SECOND time.
  ok(!Object.prototype.hasOwnProperty.call(WEAPON_TYPES, 'VOLLEY'),
    'WEAPON_TYPES has no VOLLEY entry (main.js holds the volley + its arch application)');

  // weapons.js must touch no volley-owned state: a live arch must leave the
  // player's volley timer alone.
  const st = stubState(['DOUBLE_FIRE', 'BERSERK']);
  st.player.attackTimer = 0.4;
  st.enemies.push(dummy(30, 0));
  const before = st.player.attackTimer;
  for (const w of ['ORBIT', 'ZAP', 'MINE'].map(t => makeWeapon(t))) {
    WEAPON_TYPES[w.type].update(st, w, 0.016);
  }
  ok(st.player.attackTimer === before,
    'weapons.js never consumes the volley timer (no second arch application on it)');

  // And the arch multipliers are read from arches.js (one source of truth), so
  // an unknown/empty buff list is neutral rather than a hard-coded x1.
  const none = stubState([]);
  none.enemies.push(dummy(30, 0));
  const wz = makeWeapon('ZAP');
  WEAPON_TYPES.ZAP.update(none, wz, 0.016);
  ok(Math.abs(wz.cd - WEAPONS.ZAP.COOLDOWN) < 1e-9,
    'no active arch -> stock interval (neutral default)');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL ARCH BUFF TESTS PASSED');
