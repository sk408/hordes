// Enemy variety unit tests — pure logic, no DOM.
import assert from 'node:assert/strict';
import {
  ENEMY_TYPES, ELITE_TEMPLATE, VARIANTS, ELITE_LOOK,
  makeTypedEnemy, decideEnemyAction, rollVariant, resolveLook, deathShockwave,
} from '../src/enemy_types.js';
import { CONFIG as C } from '../src/config.js';

const player = { x: 0, y: 0 };
const DT = 1 / 60;
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const ALL_TYPES = ['CHASER', 'SWARMER', 'BRUTE', 'SPITTER', 'DASHER', 'WARLOCK', 'TICK', 'COLOSSUS'];

// --- swarmer faster (and weaker) than base ---------------------------------
check('swarmer faster than base chaser', () => {
  const base = makeTypedEnemy('CHASER', 0, 0, 0);
  const swarm = makeTypedEnemy('SWARMER', 0, 0, 0);
  assert.ok(swarm.speed > base.speed * 1.5, `speed ${swarm.speed} vs ${base.speed}`);
  assert.ok(swarm.hp < base.hp, 'swarmer should be weaker');
  assert.equal(swarm.packSize, 5);
});

// --- spitter: retreats < 100px, holds ~120px --------------------------------
check('spitter retreats when player within 100px', () => {
  const s = makeTypedEnemy('SPITTER', 50, 0, 0); // dist 50 < 100
  const a = decideEnemyAction(s, player, DT);
  // moving away from player at (0,0): +x direction
  assert.ok(a.mx > 0.9, `expected retreat +x, got ${a.mx}`);
});

check('spitter approaches from beyond hold band', () => {
  const s = makeTypedEnemy('SPITTER', 200, 0, 0); // dist 200 > 140
  const a = decideEnemyAction(s, player, DT);
  assert.ok(a.mx < -0.9, `expected approach -x, got ${a.mx}`);
});

check('spitter holds position at ~120px', () => {
  const s = makeTypedEnemy('SPITTER', 120, 0, 0);
  const a = decideEnemyAction(s, player, DT);
  assert.equal(a.mx, 0);
  assert.equal(a.my, 0);
});

check('spitter fires slow projectile intent in range', () => {
  const s = makeTypedEnemy('SPITTER', 120, 0, 0);
  s.age = ENEMY_TYPES.SPITTER.fireInterval; // phase wraps to 0 this frame
  const a = decideEnemyAction(s, player, DT);
  assert.ok(a.fire, 'expected fire intent at phase wrap');
  assert.equal(a.fire.speed, ENEMY_TYPES.SPITTER.projSpeed);
  assert.equal(a.fire.damage, ENEMY_TYPES.SPITTER.projDamage);
  assert.equal(a.fire.speed, 80); // slow shot vs weapon's 190
});

check('spitter silent out of range', () => {
  const s = makeTypedEnemy('SPITTER', 400, 0, 0);
  s.age = ENEMY_TYPES.SPITTER.fireInterval;
  const a = decideEnemyAction(s, player, DT);
  assert.equal(a.fire, null);
});

// --- brute: slower but tankier ----------------------------------------------
check('brute slower and tankier than base', () => {
  const base = makeTypedEnemy('CHASER', 0, 0, 0);
  const brute = makeTypedEnemy('BRUTE', 0, 0, 0);
  assert.ok(brute.speed < base.speed, 'brute should be slower');
  assert.ok(brute.hp > base.hp * 3, `hp ${brute.hp} vs ${base.hp}`);
  assert.ok(brute.contactDamageMult > 2, 'big contact damage');
  assert.ok(brute.w > base.w * 1.5, 'brute is big');
});

// --- elite template applies to any type --------------------------------------
check('elite multiplier template applies to any type', () => {
  for (const id of ALL_TYPES) {
    const plain = makeTypedEnemy(id, 0, 0, 60);
    const elite = makeTypedEnemy(id, 0, 0, 60, { elite: true });
    assert.ok(Math.abs(elite.hp - plain.hp * ELITE_TEMPLATE.hpMult) < 1e-9, `${id}: 4x hp`);
    assert.ok(Math.abs(elite.w - plain.w * ELITE_TEMPLATE.sizeMult) < 1e-9, `${id}: 1.5x size`);
    assert.equal(elite.guaranteesChest, true, `${id}: guaranteed chest`);
    assert.equal(elite.elite, true);
  }
  // plain enemies never guarantee chests
  assert.equal(makeTypedEnemy('BRUTE', 0, 0, 0).guaranteesChest, undefined);
});

// --- my type: DASHER — stalk then lunge, deterministic from age --------------
check('dasher stalks slow then lunges fast on a fixed cycle', () => {
  const d = makeTypedEnemy('DASHER', 100, 0, 0);
  const stalk = decideEnemyAction({ ...d, age: 0.5 }, player, DT);
  const lunge = decideEnemyAction({ ...d, age: ENEMY_TYPES.DASHER.stalkTime + 0.1 }, player, DT);
  const ratio = (lunge.mx / stalk.mx);
  assert.ok(Math.abs(ratio - ENEMY_TYPES.DASHER.lungeSpeedMult / ENEMY_TYPES.DASHER.stalkSpeedMult) < 1e-9,
    `lunge/stalk ratio ${ratio}`);
  assert.ok(Math.abs(stalk.mx + ENEMY_TYPES.DASHER.stalkSpeedMult) < 1e-9, 'stalks toward player at 0.5x');
});

// --- base scaling conventions match entities.js ------------------------------
check('factory reuses base wave scaling from entities.js conventions', () => {
  const t = 65; // wave 2
  const wave = Math.floor(t / 30);
  const e = makeTypedEnemy('CHASER', 0, 0, t);
  assert.ok(Math.abs(e.hp - C.ENEMY.BASE_HP * (1 + wave * 0.35)) < 1e-9);
  assert.ok(Math.abs(e.speed - C.ENEMY.BASE_SPEED * (1 + wave * 0.05)) < 1e-9);
  assert.ok(Math.abs(e.xp - C.ENEMY.BASE_XP * (1 + wave * 0.25)) < 1e-9);
});

// --- WARLOCK: keeps 150px, telegraphs, fires slow heavy bolt ------------------
check('warlock retreats inside 130px and approaches beyond hold band', () => {
  const near = decideEnemyAction(makeTypedEnemy('WARLOCK', 100, 0, 0), player, DT);
  const far = decideEnemyAction(makeTypedEnemy('WARLOCK', 250, 0, 0), player, DT);
  const hold = decideEnemyAction(makeTypedEnemy('WARLOCK', 150, 0, 0), player, DT);
  assert.ok(near.mx > 0.9, `retreat +x, got ${near.mx}`);
  assert.ok(far.mx < -0.9, `approach -x, got ${far.mx}`);
  assert.equal(hold.mx, 0, 'holds at ~150px');
  assert.equal(hold.my, 0);
});

check('warlock telegraphs: frozen with telegraph=true during charge window', () => {
  const T = ENEMY_TYPES.WARLOCK;
  const w = makeTypedEnemy('WARLOCK', 250, 0, 0); // outside hold band: closing in
  const movePhase = decideEnemyAction({ ...w, age: 0.5 }, player, DT);
  const chargePhase = decideEnemyAction({ ...w, age: T.moveTime + 0.5 }, player, DT);
  assert.equal(movePhase.telegraph, false, 'no telegraph while repositioning');
  assert.ok(Math.abs(Math.hypot(movePhase.mx, movePhase.my)) > 0.9, 'moves while repositioning');
  assert.equal(chargePhase.telegraph, true, 'telegraph during charge');
  assert.equal(chargePhase.mx, 0, 'frozen during charge');
  assert.equal(chargePhase.my, 0);
  assert.equal(chargePhase.fire, null, 'no bolt until the charge completes');
});

check('warlock fires slow heavy bolt the frame the charge ends', () => {
  const T = ENEMY_TYPES.WARLOCK;
  const w = makeTypedEnemy('WARLOCK', 150, 0, 0);
  w.age = T.moveTime + T.chargeTime; // cycle wraps: bolt!
  const a = decideEnemyAction(w, player, DT);
  assert.ok(a.fire, 'expected fire intent at cycle wrap');
  assert.equal(a.fire.speed, T.projSpeed);
  assert.equal(a.fire.speed, 55, 'SLOW bolt');
  assert.equal(a.fire.damage, 14, 'heavy bolt');
  assert.ok(a.fire.dx < -0.9, 'aimed at player');
  // out of range: no bolt even at wrap
  const far = makeTypedEnemy('WARLOCK', 400, 0, 0);
  far.age = T.moveTime + T.chargeTime;
  assert.equal(decideEnemyAction(far, player, DT).fire, null);
});

// --- TICK: attach/drain intent contract ---------------------------------------
check('tick attaches inside attachDist and returns drain instead of movement', () => {
  const T = ENEMY_TYPES.TICK;
  const tick = makeTypedEnemy('TICK', T.attachDist - 1, 0, 0);
  const a = decideEnemyAction(tick, player, DT);
  assert.equal(a.attach, true, 'attach intent');
  assert.equal(a.drain, T.drainDps, 'drain dps in intent');
  assert.equal(a.mx, 0, 'no movement once latched');
  assert.equal(a.fire, null);
  assert.equal(tick.contactDamageMult, 0, 'no contact damage — drain only');
});

check('tick chases fast before latching and stays drained-in while attached', () => {
  const T = ENEMY_TYPES.TICK;
  const loose = makeTypedEnemy('TICK', 100, 0, 0);
  const a = decideEnemyAction(loose, player, DT);
  assert.equal(a.attach, false);
  assert.equal(a.drain, 0);
  assert.ok(a.mx < -0.9, 'chases player');
  // attached flag (integrator-owned) keeps the drain going even mid-air
  const stuck = makeTypedEnemy('TICK', 100, 0, 0);
  stuck.attached = true;
  const b = decideEnemyAction(stuck, player, DT);
  assert.equal(b.attach, true);
  assert.equal(b.drain, T.drainDps);
  assert.equal(b.mx, 0);
  // tick is the fastest type
  const base = makeTypedEnemy('CHASER', 0, 0, 0);
  assert.ok(loose.speed > base.speed * 1.5, 'tick is fast');
  assert.ok(loose.w < base.w * 0.8, 'tick is tiny');
});

// --- COLOSSUS: mini-boss tier + death shockwave -------------------------------
check('colossus is massive, slow, wave-gated', () => {
  const base = makeTypedEnemy('CHASER', 0, 0, 0);
  const colo = makeTypedEnemy('COLOSSUS', 0, 0, 0);
  const brute = makeTypedEnemy('BRUTE', 0, 0, 0);
  assert.ok(colo.hp > brute.hp * 3, `massive hp ${colo.hp}`);
  assert.ok(colo.speed < base.speed * 0.5, 'very slow');
  assert.ok(colo.w > brute.w, 'huge body');
  assert.equal(colo.minWave, 5, 'spawner gate: wave 5+');
});

check('colossus death shockwave scales with maxHp, friendly-fire only', () => {
  const T = ENEMY_TYPES.COLOSSUS;
  const colo = makeTypedEnemy('COLOSSUS', 0, 0, 180); // wave 6
  const sw = deathShockwave(colo);
  assert.ok(sw, 'shockwave data present');
  assert.equal(sw.radius, T.shockRadius);
  assert.ok(Math.abs(sw.damage - (T.shockBaseDamage + colo.maxHp * T.shockMaxHpFrac)) < 1e-9,
    'damage = base + 25% maxHp');
  assert.equal(sw.friendlyFire, true, 'damages enemies, not player');
  // non-colossus deaths produce no shockwave
  assert.equal(deathShockwave(makeTypedEnemy('BRUTE', 0, 0, 0)), null);
});

// --- LOOK variants -------------------------------------------------------------
check('every type ships a valid LOOK and 2-3 palette variants', () => {
  const SHAPES = ['block', 'diamond', 'tall', 'wide'];
  for (const id of ALL_TYPES) {
    const L = ENEMY_TYPES[id].LOOK;
    for (const k of ['body', 'trim', 'accent']) assert.ok(typeof L[k] === 'string' && L[k].startsWith('#'), `${id}.${k}`);
    assert.ok(SHAPES.includes(L.shape), `${id} shape ${L.shape}`);
    assert.ok(L.sizeMult > 0, `${id} sizeMult`);
    const vs = VARIANTS[id];
    assert.ok(Array.isArray(vs) && vs.length >= 2 && vs.length <= 3, `${id} variants ${vs?.length}`);
    for (const v of vs) for (const k of ['body', 'trim', 'accent']) {
      assert.ok(typeof v[k] === 'string' && v[k].startsWith('#'), `${id} variant ${k}`);
    }
  }
  assert.ok(ELITE_LOOK.trim === '#ffd54a', 'gold elite tell available');
});

check('rollVariant maps stubbed rng onto the palette range (base + variants)', () => {
  // SWARMER: base + 3 variants = 4 palette slots (indices 0..3)
  assert.equal(rollVariant('SWARMER', () => 0.0), 0);
  assert.equal(rollVariant('SWARMER', () => 0.3), 1);
  assert.equal(rollVariant('SWARMER', () => 0.6), 2);
  assert.equal(rollVariant('SWARMER', () => 0.99), 3, 'clamped to last palette');
  // CHASER: base + 2 variants = 3 slots
  assert.equal(rollVariant('CHASER', () => 0.99), 2);
  // distribution over a uniform sweep uses ALL indices for a 4-slot type
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(rollVariant('SWARMER', () => i / 100));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  // injectable rng is actually consulted
  let called = 0;
  rollVariant('BRUTE', () => { called++; return 0; });
  assert.equal(called, 1);
});

check('resolveLook composes type LOOK with variant palette, safe fallbacks', () => {
  const base = resolveLook('SPITTER', 0);
  assert.equal(base.body, ENEMY_TYPES.SPITTER.LOOK.body, 'variant 0 = base look');
  assert.equal(base.shape, 'tall');
  const v = resolveLook('SPITTER', 1);
  assert.equal(v.body, VARIANTS.SPITTER[0].body, 'variant 1 = first alternate palette');
  assert.equal(v.shape, 'tall', 'shape stays from type');
  assert.equal(v.sizeMult, ENEMY_TYPES.SPITTER.LOOK.sizeMult);
  assert.equal(resolveLook('NOPE', 9).shape, 'block', 'unknown type falls back to CHASER');
  assert.equal(resolveLook('SPITTER', 99).body, ENEMY_TYPES.SPITTER.LOOK.body, 'bad index falls back to base');
  // factory carries the variant index for render
  assert.equal(makeTypedEnemy('SWARMER', 0, 0, 0, { variant: 2 }).variant, 2);
  assert.equal(makeTypedEnemy('SWARMER', 0, 0, 0).variant, 0);
});

// --- purity: decide must not mutate enemy or player ---------------------------
check('decide is pure (no mutation of enemy/player)', () => {
  const specs = [
    ['SPITTER', 120, 0], ['WARLOCK', 150, 0], ['TICK', 10, 0],
    ['DASHER', 100, 0], ['COLOSSUS', 200, 0], ['TICK', 100, 0],
  ];
  for (const [id, x, y] of specs) {
    const e = makeTypedEnemy(id, x, y, 0);
    const snap = JSON.stringify({ ...e });
    for (let age = 0; age < 6; age += 0.05) {
      e.age = age;
      decideEnemyAction(e, player, DT);
      deathShockwave(e); // also pure
    }
    const after = { ...e }; delete after.age;
    const before = JSON.parse(snap); delete before.age;
    assert.equal(JSON.stringify(after), JSON.stringify(before), `${id} decide mutated enemy`);
  }
  // attached tick path included above via age sweep at dist 10
});

console.log(`\n${passed} assertions groups passed — test_enemy_types OK`);
