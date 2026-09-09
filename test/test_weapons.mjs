// HORDES — headless tests for src/weapons.js (node, no DOM).
// Run: node test/test_weapons.mjs
import {
  WEAPON_TYPES, WEAPONS, makeWeapon, updateWeapons,
  WEAPON_MAX_LEVEL, WEAPON_LEVELS, WEAPON_NAMES, weaponLevelParams,
  levelUpWeapon, describeWeaponLevel, collectWeaponXp, weaponXpNeeded, WEAPON_XP_BASE,
} from '../src/weapons.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

function stubState() {
  return {
    player: {
      x: 0, y: 0,
      hp: 100, level: 1,
      stats: { damage: 10, cooldown: 0.55, projectiles: 1, pierce: 0 },
      buffs: { overcharge: 0 },
    },
    enemies: [],
    projectiles: [],
    gems: [],
    drops: [],
    effects: [],
    time: 0,
  };
}
function mkEnemy(x, y, hp = 100) {
  return { x, y, hp, maxHp: hp, flash: 0, slow: 0, speed: 28, xp: 5 };
}

// ---------- ORBIT ----------
console.log('ORBIT:');
{
  const st = stubState();
  const w = makeWeapon('ORBIT');
  const R = WEAPONS.ORBIT.RADIUS;
  const e1 = mkEnemy(R, 0);            // exactly at blade position at t=0 (angle 0)
  const e2 = mkEnemy(-R, 0);           // opposite side: untouched on the first tick
  st.enemies.push(e1, e2);

  WEAPON_TYPES.ORBIT.update(st, w, 0.016);
  ok(e1.hp < 100 && e1.hp === 100 - 10 * WEAPONS.ORBIT.DAMAGE_MULT,
     'orbit applies contact damage on touch');
  ok(e2.hp === 100, 'orbit does not hit enemies not on a blade');

  const hpAfterFirst = e1.hp;
  WEAPON_TYPES.ORBIT.update(st, w, 0.016);
  ok(e1.hp === hpAfterFirst, 'per-enemy tick cooldown blocks instant re-damage');

  // Burn the tick cooldown down (blade may drift off the enemy; force it back
  // by re-placing the enemy at the current blade position each step).
  for (let i = 0; i < 60; i++) {       // ~1s of sim > 0.5s tick
    const b = w.payload.blades[0];
    e1.x = b.x; e1.y = b.y;
    WEAPON_TYPES.ORBIT.update(st, w, 0.016);
  }
  ok(e1.hp < hpAfterFirst, 'orbit re-damages after tick cooldown expires');
  ok(w.ticks.size > 0, 'tick map tracks enemies on cooldown');
}

// ---------- BOOMERANG ----------
console.log('BOOMERANG:');
{
  const st = stubState();
  const w = makeWeapon('BOOMERANG');
  const eA = mkEnemy(100, 0);
  const eB = mkEnemy(100, 6);          // inside the 9px hit box of the flight path
  const far = mkEnemy(-200, 0);        // behind the player: never touched
  st.enemies.push(eA, eB, far);

  WEAPON_TYPES.BOOMERANG.update(st, w, 0.016);   // fires immediately
  const thrown = st.projectiles.filter(p => p.kind === 'boomerang');
  ok(thrown.length === 1, 'boomerang throws one body at the target');
  ok(thrown[0].phase === 'out', 'boomerang starts in outbound phase');

  // Outbound: 120px range / 240 speed = 0.5s (~33 frames incl. the fire call).
  // Stop just past the flip so the return re-hit lands in the next window.
  // Total time stays under the 1.6s throw cd: no second throw confuses us.
  for (let i = 0; i < 32; i++) WEAPON_TYPES.BOOMERANG.update(st, w, 0.016);
  ok(eA.hp < 100, 'boomerang damages the target enemy');
  ok(eB.hp < 100, 'boomerang pierces through enemies on the path');
  ok(far.hp === 100, 'boomerang does not touch enemies off the path');
  const pr = st.projectiles.find(p => p.kind === 'boomerang');
  ok(pr && pr.phase === 'back', 'boomerang returns after max range');

  // Return leg: catch near the player, then the body is removed.
  const hpMidA = eA.hp;
  for (let i = 0; i < 35; i++) WEAPON_TYPES.BOOMERANG.update(st, w, 0.016);
  ok(eA.hp < hpMidA, 'boomerang re-hits on the return leg');
  ok(!st.projectiles.some(p => p.kind === 'boomerang'), 'boomerang despawns when caught');
}

// ---------- ZAP ----------
console.log('ZAP:');
{
  const st = stubState();
  const w = makeWeapon('ZAP');
  const primary = mkEnemy(60, 0);
  const c1 = mkEnemy(90, 30);          // ~46px from primary
  const c2 = mkEnemy(140, 60);         // ~64px from c1
  const c3 = mkEnemy(190, 90);         // ~64px from c2
  const tooFar = mkEnemy(400, 400);    // far outside chain range
  st.enemies.push(primary, c1, c2, c3, tooFar);

  WEAPON_TYPES.ZAP.update(st, w, 0.016);
  ok(primary.hp < 100, 'zap hits the primary target');
  ok(c1.hp < 100 && c2.hp < 100 && c3.hp < 100, 'zap chains through neighbors');
  ok(tooFar.hp === 100, 'zap never reaches an out-of-range enemy');

  // Damage falloff (measured off the FIRST fire, before any refire).
  const dPrimary = 100 - primary.hp;
  const dC1 = 100 - c1.hp;
  ok(dPrimary === 10 && dC1 === 10 * WEAPONS.ZAP.FALLOFF,
     'zap damage falls off per jump');

  // Exactly 3 jumps: a 4th in-range candidate stays untouched.
  const extra = mkEnemy(240, 120);
  st.enemies.push(extra);
  const z2 = makeWeapon('ZAP');
  for (let i = 0; i < 100; i++) WEAPON_TYPES.ZAP.update(st, z2, 0.016);  // cd expires, refires
  ok(extra.hp === 100, 'zap chains to exactly 3 neighbors (4th untouched)');

  const fx = st.effects.filter(f => f.kind === 'zap');
  ok(fx.length >= 1 && fx[0].points.length === 5,
     'zap pushes a polyline effect (player + 4 struck enemies)');
}

// ---------- NOVA_PULSE ----------
console.log('NOVA_PULSE:');
{
  const st = stubState();
  const w = makeWeapon('NOVA_PULSE');
  const inA = mkEnemy(30, 0);
  const inB = mkEnemy(0, -60);
  const outC = mkEnemy(150, 0);
  st.enemies.push(inA, inB, outC);

  WEAPON_TYPES.NOVA_PULSE.update(st, w, 0.016);   // cd starts at 0: fires now
  ok(inA.hp < 100 && inB.hp < 100, 'nova damages all enemies in radius');
  ok(outC.hp === 100, 'nova does not damage enemies outside radius');
  ok(st.effects.some(f => f.kind === 'nova_pulse'), 'nova pushes a ring effect');

  const hpAfterPulse = inA.hp;
  const effectsAfter = st.effects.filter(f => f.kind === 'nova_pulse').length;
  WEAPON_TYPES.NOVA_PULSE.update(st, w, 0.016);
  ok(inA.hp === hpAfterPulse, 'nova does not refire before its cooldown');
  ok(st.effects.filter(f => f.kind === 'nova_pulse').length === effectsAfter,
     'no second ring effect before cooldown');

  inA.x = 10; inA.y = 10;
  for (let i = 0; i < 200; i++) WEAPON_TYPES.NOVA_PULSE.update(st, w, 0.016);  // >3s
  ok(inA.hp < hpAfterPulse, 'nova pulses again once cooldown elapses');
}

// ---------- PER-WEAPON LEVELING ----------
console.log('LEVELS:');
{
  // VOLLEY (table only — the volley lives in main.js, integrator applies it).
  const v1 = weaponLevelParams('VOLLEY', 1), v2 = weaponLevelParams('VOLLEY', 2),
        v3 = weaponLevelParams('VOLLEY', 3), v6 = weaponLevelParams('VOLLEY', 6),
        v8 = weaponLevelParams('VOLLEY', 8);
  ok(v1.proj === 0 && v3.proj === 1 && v6.proj === 2,
     'volley: +1 projectile at Lv3 and Lv6');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(v2.dmgMult, 1.2) && near(v3.dmgMult, v2.dmgMult),
     'volley: proj level adds no damage, others add +20%');
  ok(near(v6.dmgMult, 1.6) && near(v8.dmgMult, 2.0),
     'volley: 5 damage levels by Lv8 = +100%');

  // ORBIT: blades + radius per level.
  const o1 = weaponLevelParams('ORBIT', 1), o8 = weaponLevelParams('ORBIT', 8);
  ok(o1.blades === 1 && o8.blades === 5, 'orbit: blades 1 -> 5 by Lv8 (+1 per even level)');
  ok(o8.radius > o1.radius && o8.radius === WEAPONS.ORBIT.RADIUS + 4 * 7,
     'orbit: radius +4 per level');
  ok(o8.dmgMult === 1 + 0.15 * 7, 'orbit: +15% damage per level');

  // BOOMERANG: pierce/speed/damage.
  const b1 = weaponLevelParams('BOOMERANG', 1), b5 = weaponLevelParams('BOOMERANG', 5);
  ok(b5.pierceBonus > b1.pierceBonus && b5.pierceBonus === 2, 'boomerang: Lv5 pierce (+2) > Lv1');
  ok(b5.speedMult === 1 + 0.12 * 4, 'boomerang: +12% flight speed per level');
  ok(b5.dmgMult === 1 + 0.2 * 4, 'boomerang: +20% damage per level');

  // ZAP: chains.
  ok(weaponLevelParams('ZAP', 1).jumps === 3 && weaponLevelParams('ZAP', 8).jumps === 7,
     'zap: +1 chain jump every even level (3 -> 7)');

  // NOVA: radius.
  ok(weaponLevelParams('NOVA_PULSE', 3).radius === WEAPONS.NOVA_PULSE.RADIUS + 12,
     'nova: +6 radius per level');

  // levelUpWeapon: increments and caps.
  const w = makeWeapon('ZAP');
  ok(levelUpWeapon(w) === 2 && w.level === 2, 'levelUpWeapon applies the next level');
  while (w.level < WEAPON_MAX_LEVEL) levelUpWeapon(w);
  ok(levelUpWeapon(w) === false && w.level === WEAPON_MAX_LEVEL,
     `levelUpWeapon refuses past max (${WEAPON_MAX_LEVEL})`);
  ok(levelUpWeapon(null) === false, 'levelUpWeapon tolerates a null weapon');

  // describeWeaponLevel: card text for the draft UI.
  ok(describeWeaponLevel('ZAP', 2) === `${WEAPON_NAMES.ZAP} Lv2 — +1 chain (total 4 jumps), +15% damage`,
     'describeWeaponLevel returns card text');
  ok(describeWeaponLevel('NOPE', 2) === null, 'describeWeaponLevel: unknown id -> null');
  ok(describeWeaponLevel('ZAP', 99).includes('MAX'), 'describeWeaponLevel: past cap -> MAX');

  // All tables are WEAPON_MAX_LEVEL rows with cumulative effects objects.
  for (const id of Object.keys(WEAPON_LEVELS)) {
    ok(WEAPON_LEVELS[id].length === WEAPON_MAX_LEVEL, `table ${id} has ${WEAPON_MAX_LEVEL} rows`);
  }
}

// ---------- Level effects change the actual update math ----------
console.log('LEVEL EFFECTS:');
{
  // Orbit Lv2: more blades AND more damage than Lv1 on the same layout.
  const mk = () => {
    const st = stubState();
    st.enemies.push(mkEnemy(WEAPONS.ORBIT.RADIUS, 0));   // blade 0 at t=0
    return st;
  };
  const st1 = mk(), st2 = mk();
  const w1 = makeWeapon('ORBIT'), w2 = makeWeapon('ORBIT');
  levelUpWeapon(w2);
  WEAPON_TYPES.ORBIT.update(st1, w1, 0.016);
  WEAPON_TYPES.ORBIT.update(st2, w2, 0.016);
  ok(st1.enemies[0].hp > st2.enemies[0].hp,
     'orbit Lv2 out-damages Lv1 on the same contact');
  ok(w2.payload.blades.length === 2, 'orbit Lv2 actually spawns 2 blades');

  // Nova Lv3 reaches an enemy Lv1 cannot (radius 70 -> 82).
  const stN1 = stubState(), stN2 = stubState();
  stN1.enemies.push(mkEnemy(75, 0));
  stN2.enemies.push(mkEnemy(75, 0));
  const wn1 = makeWeapon('NOVA_PULSE'), wn2 = makeWeapon('NOVA_PULSE');
  wn2.level = 3;
  WEAPON_TYPES.NOVA_PULSE.update(stN1, wn1, 0.016);
  WEAPON_TYPES.NOVA_PULSE.update(stN2, wn2, 0.016);
  ok(stN1.enemies[0].hp === 100, 'nova Lv1 misses an enemy at 75px');
  ok(stN2.enemies[0].hp < 100, 'nova Lv3 reaches the enemy at 75px');

  // Zap Lv2 chains to a 4th neighbor that Lv1 leaves untouched.
  const mkZap = () => {
    const st = stubState();
    st.enemies.push(
      mkEnemy(60, 0), mkEnemy(90, 30), mkEnemy(140, 60),
      mkEnemy(190, 90), mkEnemy(240, 120));   // 4th chain candidate
    return st;
  };
  const z1s = mkZap(), z2s = mkZap();
  const z1 = makeWeapon('ZAP'), z2 = makeWeapon('ZAP');
  z2.level = 2;
  WEAPON_TYPES.ZAP.update(z1s, z1, 0.016);
  WEAPON_TYPES.ZAP.update(z2s, z2, 0.016);
  ok(z1s.enemies[4].hp === 100, 'zap Lv1 leaves the 5th enemy untouched');
  ok(z2s.enemies[4].hp < 100, 'zap Lv2 chains one jump further');

  // Boomerang Lv5: pierce field on the thrown body reflects the table.
  const stB = stubState();
  stB.enemies.push(mkEnemy(100, 0));
  const wb = makeWeapon('BOOMERANG');
  wb.level = 5;
  WEAPON_TYPES.BOOMERANG.update(stB, wb, 0.016);
  ok(stB.projectiles[0].pierce === 2 && stB.projectiles[0].damage === 10 * 1.8,
     'boomerang Lv5 body carries +2 pierce and +80% damage');
}

// ---------- Weapon XP ----------
console.log('WEAPON XP:');
{
  ok(weaponXpNeeded(1) === WEAPON_XP_BASE && weaponXpNeeded(3) === 3 * WEAPON_XP_BASE,
     'xp threshold scales with level');

  const st = stubState();
  const w = makeWeapon('ZAP');
  st.weapons = [w];
  ok(collectWeaponXp(st, 'ZAP', WEAPON_XP_BASE - 1) === 0, 'under threshold: no level');
  ok(w.xp === WEAPON_XP_BASE - 1, 'xp accumulates across calls');
  ok(collectWeaponXp(st, 'ZAP', 1) === 1 && w.level === 2,
     'crossing the threshold levels the weapon');
  ok(collectWeaponXp(st, 'ZAP', weaponXpNeeded(2) + weaponXpNeeded(3)) === 2
     && w.level === 4, 'one big drop can grant multiple levels');
  ok(collectWeaponXp(st, 'ORBIT', 9999) === 0, 'no matching weapon: no levels');

  w.level = WEAPON_MAX_LEVEL;
  ok(collectWeaponXp(st, 'ZAP', 500) === 0 && w.xp === 0,
     'at cap: xp discarded, no infinite banking');
}

// ---------- SCYTHE ----------
console.log('SCYTHE:');
{
  const st = stubState();
  const w = makeWeapon('SCYTHE');
  const W = WEAPONS.SCYTHE;
  // Volley direction = nearest enemy: (50,0) -> dir 0. Arc ±0.5 rad at Lv1.
  const front = mkEnemy(50, 0);
  const edgeIn = mkEnemy(Math.cos(0.4) * 50, Math.sin(0.4) * 50);   // 0.4 rad < 0.5: hit
  const edgeOut = mkEnemy(Math.cos(0.9) * 50, Math.sin(0.9) * 50); // 0.9 rad > 0.5: miss
  const beyond = mkEnemy(100, 0);                                   // past RANGE 55: miss
  st.enemies.push(front, edgeIn, edgeOut, beyond);

  WEAPON_TYPES.SCYTHE.update(st, w, 0.016);   // commits the swing (windup starts)
  ok(front.hp === 100, 'scythe windup delays damage (telegraph frame)');
  ok(st.effects.some(f => f.kind === 'scythe_windup'), 'scythe pushes a windup effect');
  for (let i = 0; i < 14; i++) WEAPON_TYPES.SCYTHE.update(st, w, 0.016);  // 0.22s > windup 0.18
  const dmg = 10 * W.DAMAGE_MULT;
  ok(front.hp === 100 - dmg, 'scythe damages the enemy in front');
  ok(edgeIn.hp === 100 - dmg, 'scythe hits enemies inside the arc');
  ok(edgeOut.hp === 100, 'scythe misses enemies outside the arc width');
  ok(beyond.hp === 100, 'scythe misses enemies beyond sweep range');
  const arc = st.effects.find(f => f.kind === 'scythe_arc');
  ok(arc && arc.radius === W.RANGE && arc.arc === W.ARC,
     'scythe pushes a scythe_arc effect with sweep geometry');
  ok(st.effects.filter(f => f.kind === 'scythe_hit').length === 2,
     'scythe emits one spark dot per enemy hit');
}

// ---------- SEEKER ----------
console.log('SEEKER:');
{
  const W = WEAPONS.SEEKER;
  // Basic homing: fires at the nearest enemy and eventually connects.
  const st = stubState();
  const w = makeWeapon('SEEKER');
  const a = mkEnemy(80, 0);
  st.enemies.push(a);
  WEAPON_TYPES.SEEKER.update(st, w, 0.016);
  ok(st.projectiles.filter(p => p.kind === 'seeker').length === 1,
     'seeker fires one missile at Lv1');
  // 80px at 150px/s ~ 0.53s (~34 frames); cap at 45 so the 1.8s refire cd
  // cannot launch a second missile into the assert.
  for (let i = 0; i < 45 && a.hp > 0; i++) WEAPON_TYPES.SEEKER.update(st, w, 0.016);
  ok(a.hp === 100 - 10 * W.DAMAGE_MULT, 'seeker homes in and damages the target');
  ok(!st.projectiles.some(p => p.kind === 'seeker'), 'missile despawns on impact');
  ok(st.effects.some(f => f.kind === 'seeker_trail' && Array.isArray(f.points) && f.points.length > 0),
     'seeker pushes trail effects carrying per-frame points');
  ok(st.effects.some(f => f.kind === 'seeker_pop'), 'seeker impact pushes a pop effect');

  // Retarget on target death: mark A dies mid-flight, missile finds B.
  const st2 = stubState();
  const w2 = makeWeapon('SEEKER');
  const a2 = mkEnemy(80, 0);
  const b2 = mkEnemy(30, 80);
  st2.enemies.push(a2, b2);
  WEAPON_TYPES.SEEKER.update(st2, w2, 0.016);   // targets a2 (nearest)
  const missile = st2.projectiles.find(p => p.kind === 'seeker');
  ok(missile && missile.target === a2, 'missile locks the nearest enemy at launch');
  for (let i = 0; i < 8; i++) WEAPON_TYPES.SEEKER.update(st2, w2, 0.016);
  a2.hp = 0;                                    // killed by something else mid-flight
  for (let i = 0; i < 240 && b2.hp > 0; i++) WEAPON_TYPES.SEEKER.update(st2, w2, 0.016);
  ok(b2.hp === 100 - 10 * W.DAMAGE_MULT, 'missile retargets and hits the next enemy');
}

// ---------- MINE ----------
console.log('MINE:');
{
  const W = WEAPONS.MINE;
  const st = stubState();
  const w = makeWeapon('MINE');
  WEAPON_TYPES.MINE.update(st, w, 0.016);       // drops behind the player
  ok(st.projectiles.some(p => p.kind === 'mine'), 'mine layer drops a mine at the player');

  const trigger = mkEnemy(15, 0);               // inside TRIGGER_R 20
  const inBlast = mkEnemy(40, 0);               // inside BLAST 45
  const outBlast = mkEnemy(60, 0);              // outside blast
  st.enemies.push(trigger, inBlast, outBlast);
  WEAPON_TYPES.MINE.update(st, w, 0.016);       // proximity trigger -> detonation
  const dmg = 10 * W.DAMAGE_MULT;
  ok(trigger.hp === 100 - dmg && inBlast.hp === 100 - dmg,
     'mine detonation damages all enemies in blast radius');
  ok(outBlast.hp === 100, 'mine leaves enemies outside the blast untouched');
  ok(!st.projectiles.some(p => p.kind === 'mine'), 'mine is consumed by detonation');
  const blast = st.effects.find(f => f.kind === 'mine_blast');
  ok(blast && blast.radius === W.BLAST && blast.shrapnel === W.SHRAPNEL,
     'mine pushes a mine_blast effect with radius + shrapnel count');
  ok(st.effects.filter(f => f.kind === 'mine_shrap').length >= W.SHRAPNEL,
     'mine emits shrapnel dot sub-effects');

  // Untriggered mines despawn after LIFETIME (no stray carpet). Freeze the
  // drop cadence after the first mine so the assert sees THAT mine age out.
  const st2 = stubState();
  const w2 = makeWeapon('MINE');
  WEAPON_TYPES.MINE.update(st2, w2, 0.016);
  w2.cd = 9999;
  for (let i = 0; i < Math.ceil(W.LIFETIME / 0.016); i++) WEAPON_TYPES.MINE.update(st2, w2, 0.016);
  ok(!st2.projectiles.some(p => p.kind === 'mine'), 'old mine despawns after its lifetime');
}

// ---------- BEAM ----------
console.log('BEAM:');
{
  const W = WEAPONS.BEAM;
  const st = stubState();
  const w = makeWeapon('BEAM');
  const near = mkEnemy(50, 0), far = mkEnemy(230, 0);   // on the line, within LENGTH
  const beyond = mkEnemy(250, 0);                       // past the length
  const offLine = mkEnemy(100, 30);                     // perp 30 >> width/2
  const inWidth = mkEnemy(100, 4);                      // perp 4 <= width/2 (5)
  st.enemies.push(near, far, beyond, offLine, inWidth);
  WEAPON_TYPES.BEAM.update(st, w, 0.016);
  const dmg = 10 * W.DAMAGE_MULT;
  ok(near.hp === 100 - dmg && far.hp === 100 - dmg, 'beam pierces every enemy along the line');
  ok(inWidth.hp === 100 - dmg, 'beam hits enemies within its thickness');
  ok(beyond.hp === 100, 'beam stops at max length');
  ok(offLine.hp === 100, 'beam misses enemies off the line');
  const fx = st.effects.find(f => f.kind === 'beam');
  ok(fx && fx.len === W.LENGTH && fx.width === W.WIDTH && typeof fx.phase === 'number'
     && fx.from < fx.dir && fx.to > fx.dir,
     'beam effect carries width, flicker phase and sweep envelope');
  ok(st.effects.some(f => f.kind === 'beam_hit'), 'beam emits spark dots on pierced enemies');
}

// ---------- NEW-WEAPON LEVEL TABLES ----------
console.log('LEVELS (wave-2):');
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // SCYTHE: arc width + damage per level.
  ok(near(weaponLevelParams('SCYTHE', 1).arc, WEAPONS.SCYTHE.ARC) &&
     near(weaponLevelParams('SCYTHE', 8).arc, WEAPONS.SCYTHE.ARC + 0.12 * 7),
     'scythe: +0.12 arc width per level');
  // SEEKER: +1 missile every even level, +turn per level.
  ok(weaponLevelParams('SEEKER', 1).count === 1 && weaponLevelParams('SEEKER', 2).count === 2
     && weaponLevelParams('SEEKER', 8).count === 5, 'seeker: +1 missile every even level (1 -> 5)');
  ok(near(weaponLevelParams('SEEKER', 5).turn, WEAPONS.SEEKER.TURN + 0.4 * 4),
     'seeker: +0.4 turn rate per level');
  // MINE: blast + damage.
  ok(weaponLevelParams('MINE', 3).blast === WEAPONS.MINE.BLAST + 8 &&
     near(weaponLevelParams('MINE', 3).dmgMult, 1.4), 'mine: +4 blast radius, +20% damage per level');
  // BEAM: width + damage.
  ok(weaponLevelParams('BEAM', 3).width === WEAPONS.BEAM.WIDTH + 4 &&
     near(weaponLevelParams('BEAM', 8).dmgMult, 1 + 0.15 * 7),
     'beam: +2 width, +15% damage per level');

  ok(describeWeaponLevel('SEEKER', 2) === `${WEAPON_NAMES.SEEKER} Lv2 — +1 missile (total 2), +turn rate`,
     'describeWeaponLevel covers the new archetypes');

  // Level parity: every table (old + new) has MAX rows with effects objects.
  const ids = Object.keys(WEAPON_LEVELS);
  ok(ids.length === 9, `level tables cover all 9 weapon ids incl. VOLLEY (got ${ids.length})`);
  for (const id of ids) {
    ok(WEAPON_LEVELS[id].length === WEAPON_MAX_LEVEL &&
       WEAPON_LEVELS[id].every(r => r.effects && typeof r.effects === 'object'),
      `table ${id}: ${WEAPON_MAX_LEVEL} rows with cumulative effects`);
  }
}

// ---------- LEVEL EFFECTS (wave-2, behavioral) ----------
console.log('LEVEL EFFECTS (wave-2):');
{
  // SCYTHE Lv8's wide arc catches an enemy Lv1's arc misses (0.9 rad off-axis).
  const mkScythe = () => {
    const st = stubState();
    st.enemies.push(mkEnemy(50, 0), mkEnemy(Math.cos(0.9) * 50, Math.sin(0.9) * 50));
    return st;
  };
  const s1 = mkScythe(), s8 = mkScythe();
  const y1 = makeWeapon('SCYTHE'), y8 = makeWeapon('SCYTHE');
  y8.level = 8;
  for (let i = 0; i < 15; i++) {
    WEAPON_TYPES.SCYTHE.update(s1, y1, 0.016);
    WEAPON_TYPES.SCYTHE.update(s8, y8, 0.016);
  }
  ok(s1.enemies[1].hp === 100, 'scythe Lv1 arc misses the 0.9-rad enemy');
  ok(s8.enemies[1].hp < 100, 'scythe Lv8 wider arc catches it');

  // SEEKER Lv2 fires two missiles.
  const stS = stubState();
  stS.enemies.push(mkEnemy(80, 0));
  const ws = makeWeapon('SEEKER');
  ws.level = 2;
  WEAPON_TYPES.SEEKER.update(stS, ws, 0.016);
  ok(stS.projectiles.filter(p => p.kind === 'seeker').length === 2,
     'seeker Lv2 actually fires 2 missiles');

  // MINE Lv3 blast (53) reaches an enemy at 50 that Lv1 (45) cannot.
  const mkMine = () => {
    const st = stubState();
    st.enemies.push(mkEnemy(15, 0), mkEnemy(50, 0));   // trigger + blast-edge enemy
    return st;
  };
  const m1 = mkMine(), m3 = mkMine();
  const wm1 = makeWeapon('MINE'), wm3 = makeWeapon('MINE');
  wm3.level = 3;
  // One update drops the mine AND detonates it (trigger enemy is adjacent).
  WEAPON_TYPES.MINE.update(m1, wm1, 0.016);
  WEAPON_TYPES.MINE.update(m3, wm3, 0.016);
  ok(m1.enemies[1].hp === 100, 'mine Lv1 blast (45) misses the 50px enemy');
  ok(m3.enemies[1].hp < 100, 'mine Lv3 blast (53) reaches it');

  // BEAM Lv5 width (18) catches a perp-8 enemy Lv1 (10) misses.
  const mkBeam = () => {
    const st = stubState();
    st.enemies.push(mkEnemy(100, 0), mkEnemy(100, 8));
    return st;
  };
  const b1 = mkBeam(), b5 = mkBeam();
  const wb1 = makeWeapon('BEAM'), wb5 = makeWeapon('BEAM');
  wb5.level = 5;
  WEAPON_TYPES.BEAM.update(b1, wb1, 0.016);
  WEAPON_TYPES.BEAM.update(b5, wb5, 0.016);
  ok(b1.enemies[1].hp === 100, 'beam Lv1 width (10) misses the perp-8 enemy');
  ok(b5.enemies[1].hp < 100, 'beam Lv5 width (18) catches it');
}

// ---------- LOOT AFFIX WIRING (damageMult / rateMult / crit / critMult) ------
console.log('AFFIX WIRING:');
{
  // damageMult 2.0 doubles the orbit contact hit (10 * 0.8 * 2 = 16).
  {
    const st = stubState();
    st.player.stats.damageMult = 2.0;
    const w = makeWeapon('ORBIT');
    st.enemies.push(mkEnemy(WEAPONS.ORBIT.RADIUS, 0));
    WEAPON_TYPES.ORBIT.update(st, w, 0.016);
    ok(st.enemies[0].hp === 100 - 10 * WEAPONS.ORBIT.DAMAGE_MULT * 2,
       'damageMult 2.0 doubles the orbit hit');
  }

  // rateMult 0.5 halves the fire rate -> zap cooldown DOUBLES (1.4 -> 2.8).
  {
    const st = stubState();
    st.player.stats.rateMult = 0.5;
    const w = makeWeapon('ZAP');
    st.enemies.push(mkEnemy(60, 0));
    WEAPON_TYPES.ZAP.update(st, w, 0.016);
    ok(Math.abs(w.cd - WEAPONS.ZAP.COOLDOWN / 0.5) < 1e-9,
       'rateMult 0.5 halves zap fire rate (cooldown 1.4 -> 2.8)');
  }

  // crit 1.0 + critMult 2.0 doubles the boomerang contact hit (10 -> 20).
  {
    const st = stubState();
    st.player.stats.crit = 1.0;
    st.player.stats.critMult = 2.0;
    const w = makeWeapon('BOOMERANG');
    const e = mkEnemy(100, 0);
    st.enemies.push(e);
    for (let i = 0; i < 32; i++) WEAPON_TYPES.BOOMERANG.update(st, w, 0.016);
    ok(e.hp === 100 - 10 * WEAPONS.BOOMERANG.DAMAGE_MULT * 2,
       'crit 1.0 + critMult 2.0 doubles the boomerang hit');
  }

  // VOLLEY Lv3/Lv6 labels: main.js caps projectiles and converts the grants
  // to +20% damage each, so the card text must not promise a projectile.
  ok(!describeWeaponLevel('VOLLEY', 3).includes('projectile') &&
     !describeWeaponLevel('VOLLEY', 6).includes('projectile'),
     'VOLLEY Lv3/Lv6 labels no longer say "+1 projectile"');
  ok(WEAPON_LEVELS.VOLLEY[2].label.includes('damage') &&
     WEAPON_LEVELS.VOLLEY[5].label.includes('damage'),
     'VOLLEY Lv3/Lv6 labels grant damage instead');
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL WEAPON TESTS PASSED');
