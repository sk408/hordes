// HORDES — regression: patterned shots fire ONCE per interval at any frame rate.
// Run: node test/test_fire_window.mjs
//
// BUG (Agent C): every age-phase weapon used a FIXED `phase < 1/60` window to
// decide "the interval phase wrapped this frame". phase is (age % interval) and
// age advances by the real frame dt, so the window must be dt:
//   * at 120Hz (dt 1/120) TWO consecutive frames fell inside the 1/60 window ->
//     every shot/burst/nova/barrage fired TWICE per interval;
//   * at a frame longer than 1/60 (dt is clamped at 0.05) the wrap frame could
//     land outside the window -> that interval fired NOTHING.
// Affected: enemy_types SPITTER / WARLOCK / PILLAR, bosses CHOIR_MOTHER (summon
// + enrage fan), PYRAXIS (nova), HERALD (ring + burst), final_boss MAW (barrage).
import assert from 'node:assert/strict';
import { ENEMY_TYPES, makeTypedEnemy, decideEnemyAction } from '../src/enemy_types.js';
import { BOSSES, MIDBOSS } from '../src/bosses.js';
import { FINAL_BOSS, FINAL_BOSS_PHASES } from '../src/final_boss.js';
import { CONFIG as C } from '../src/config.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// Simulate a frame clock: age advances by dt per frame (exactly what main.js
// does: e.age = (e.age || 0) + dt). Returns how many frames produced a shot.
function countShots(decide, mkEnemy, seconds, dt, pick) {
  const e = mkEnemy();
  const frames = Math.round(seconds / dt);
  let shots = 0;
  for (let i = 0; i <= frames; i++) {
    e.age = i * dt;                   // multiplied (test-style)
    if (pick(decide(e, dt))) shots++;
  }
  return shots;
}

// Same, but accumulating age by += dt the way main.js's loops do (float drift
// included) and recording the first shot's timestamp.
function countShotsAccumulated(decide, mkEnemy, seconds, dt, pick) {
  const e = mkEnemy();
  let age = 0, shots = 0, first = null;
  const frames = Math.round(seconds / dt);
  for (let i = 0; i <= frames; i++) {
    e.age = age;
    if (pick(decide(e, dt))) { shots++; if (first === null) first = age; }
    age += dt;
  }
  return { shots, first };
}

const enemy = (typeId, x = 0) => () => makeTypedEnemy(typeId, x, 0, 0);
const player = { x: 100, y: 0 };                       // in range, holding distance
const shot = (it) => it.fire;
const summon = (it) => it.summon;
const fan = (it) => it.fan;
const nova = (it) => it.nova;
const ring = (it) => it.ring;
const barrage = (it) => it.barrage;

// --- the crisp regression: two 120Hz frames inside one old 1/60 window ---------
check('120Hz: the frame AFTER the wrap does not re-fire (was a double shot)', () => {
  const sp = () => makeTypedEnemy('SPITTER', 0, 0, 0);
  const at = (age) => { const e = sp(); e.age = age; return decideEnemyAction(e, player, 1 / 120).fire; };
  assert.ok(at(0), 'the wrap frame fires');
  assert.equal(at(1 / 120), null, 'the next 120Hz frame must be silent');
  assert.equal(at(2 / 120), null);

  const wl = () => makeTypedEnemy('WARLOCK', 0, 0, 0);
  const wAt = (age) => { const e = wl(); e.age = age; return decideEnemyAction(e, player, 1 / 120).fire; };
  assert.ok(wAt(0), 'warlock bolt on the cycle wrap');
  assert.equal(wAt(1 / 120), null, 'warlock must not double-fire at 120Hz');

  const pl = makeTypedEnemy('PILLAR', 0, 0, 0); pl.age = 0;
  assert.ok(decideEnemyAction(pl, player, 1 / 120).fire, 'pillar shot on the interval wrap');
  pl.age = 1 / 120;
  assert.equal(decideEnemyAction(pl, player, 1 / 120).fire, null, 'pillar must not double-fire at 120Hz');

  const h = makeTypedEnemy('CHASER', 0, 0, 0); h.bossId = 'HERALD'; h.age = 0;
  assert.ok(MIDBOSS.HERALD.decide(h, player, null, 1 / 120).fan, 'herald burst on the wrap');
  h.age = 1 / 120;
  assert.ok(!MIDBOSS.HERALD.decide(h, player, null, 1 / 120).fan, 'herald must not double-fire');
});

// --- frame-rate independence across every patterned attacker -------------------
// each case: interval = the cadence the shot must land on; accumDelay = how long
// after the interval the FIRST shot may land when age is accumulated by += dt
// (the game loop's form) instead of multiplied.
const cases = [
  { name: 'SPITTER', interval: ENEMY_TYPES.SPITTER.fireInterval, seconds: 12, accumDelay: 0.05,
    decide: (e, dt) => decideEnemyAction(e, player, dt), mk: enemy('SPITTER'), pick: shot },
  { name: 'WARLOCK', interval: ENEMY_TYPES.WARLOCK.moveTime + ENEMY_TYPES.WARLOCK.chargeTime,
    seconds: 12, accumDelay: 0.05,
    decide: (e, dt) => decideEnemyAction(e, player, dt), mk: enemy('WARLOCK'), pick: shot },
  { name: 'PILLAR', interval: ENEMY_TYPES.PILLAR.fireInterval, seconds: 12, accumDelay: 0.05,
    decide: (e, dt) => decideEnemyAction(e, player, dt), mk: enemy('PILLAR'), pick: shot },
  { name: 'CHOIR_MOTHER summon', interval: C.ESCALATION.BOSS.SUMMON_INTERVAL, seconds: 40, accumDelay: 0.05,
    decide: (e, dt) => BOSSES.CHOIR_MOTHER.decide(e, { x: 100, y: 0 }, null, dt),
    mk: enemy('CHASER'), pick: summon },
  { name: 'CHOIR_MOTHER hymn', interval: BOSSES.CHOIR_MOTHER.fanInterval, seconds: 20, accumDelay: 0.05,
    decide: (e, dt) => BOSSES.CHOIR_MOTHER.decide(e, { x: 100, y: 0 }, null, dt),
    // enraged (below half hp) so the fan is live
    mk: () => { const e = makeTypedEnemy('CHASER', 0, 0, 0); e.hp = e.maxHp * 0.4; return e; }, pick: fan },
  { name: 'PYRAXIS nova', interval: C.ESCALATION.BOSS.NOVA_INTERVAL, seconds: 21, accumDelay: 0.05,
    decide: (e, dt) => BOSSES.PYRAXIS.decide(e, { x: 170, y: 0 }, null, dt),
    mk: enemy('CHASER'), pick: nova },
  { name: 'HERALD ring', interval: C.ESCALATION.MIDBOSS.RING_INTERVAL, seconds: 60, accumDelay: 0.05,
    decide: (e, dt) => MIDBOSS.HERALD.decide(e, { x: 100, y: 0 }, null, dt),
    mk: enemy('CHASER'), pick: ring },
  { name: 'HERALD burst', interval: C.ESCALATION.MIDBOSS.BURST_INTERVAL, seconds: 12, accumDelay: 0.05,
    decide: (e, dt) => MIDBOSS.HERALD.decide(e, { x: 100, y: 0 }, null, dt),
    mk: enemy('CHASER'), pick: fan },
  { name: 'MAW barrage', interval: FINAL_BOSS_PHASES.CYCLE,
    seconds: 27, firstAt: FINAL_BOSS_PHASES.GRACE + FINAL_BOSS_PHASES.CYCLE, accumDelay: 0.05,
    decide: (e, dt) => FINAL_BOSS.decide(e, { x: 100, y: 0 }, null, dt),
    mk: enemy('CHASER'), pick: barrage },
];

for (const c of cases) {
  check(`${c.name}: one shot per interval at 60 / 120 / 30 / 45 Hz`, () => {
    const c60 = countShots(c.decide, c.mk, c.seconds, 1 / 60, c.pick);
    const c120 = countShots(c.decide, c.mk, c.seconds, 1 / 120, c.pick);
    const c30 = countShots(c.decide, c.mk, c.seconds, 1 / 30, c.pick);
    const c45 = countShots(c.decide, c.mk, c.seconds, 1 / 45, c.pick);
    const label = `${c.name} 60Hz=${c60} 120Hz=${c120} 30Hz=${c30} 45Hz=${c45}`;
    assert.ok(Math.abs(c120 - c60) <= 1, `120Hz double-fire: ${label}`);
    assert.ok(Math.abs(c30 - c60) <= 1, `30Hz skipped a shot: ${label}`);
    assert.ok(Math.abs(c45 - c60) <= 1, `45Hz drifted: ${label}`);
    const max = Math.floor(c.seconds / c.interval) + 2;
    assert.ok(c60 <= max, `${c.name} fired ${c60} times, more than one per ${c.interval}s interval`);
    assert.ok(c60 >= 1, `${c.name} never fired at all`);
  });

  check(`${c.name}: accumulated age (the game loop's += dt) fires on cadence`, () => {
    const accum = countShotsAccumulated(c.decide, c.mk, c.seconds, 1 / 60, c.pick);
    const multiplied = countShots(c.decide, c.mk, c.seconds, 1 / 60, c.pick);
    assert.ok(Math.abs(accum.shots - multiplied) <= 1,
      `accumulated ${accum.shots} vs multiplied ${multiplied} shots (a charge/telegraph early-return ate a cycle?)`);
    // Every attacker except the maw fires once at age 0 (the spawn frame is a
    // wrap: nothing has been fired yet), so the first shot is at t=0.
    const wantFirst = c.firstAt !== undefined ? c.firstAt : 0;
    assert.ok(accum.first !== null, `${c.name} never fired with accumulated age`);
    assert.ok(accum.first >= wantFirst - 1e-9 && accum.first <= wantFirst + c.accumDelay,
      `${c.name} first shot at ${accum.first}s, expected ~${wantFirst}s`);
  });
}

// --- default dt keeps legacy callers (and probe stubs) working -----------------
check('decide() without a dt argument still fires on the wrap (1/60 default)', () => {
  const s = makeTypedEnemy('SPITTER', 0, 0, 0);
  s.age = ENEMY_TYPES.SPITTER.fireInterval;      // phase 0
  assert.ok(ENEMY_TYPES.SPITTER.decide(s, player).fire, 'no-dt call fires on the wrap');
  const h = makeTypedEnemy('CHASER', 0, 0, 0); h.bossId = 'HERALD'; h.age = C.ESCALATION.MIDBOSS.BURST_INTERVAL;
  assert.ok(MIDBOSS.HERALD.decide(h, player, null).fan, 'boss decider without dt still fires');
  const m = makeTypedEnemy('CHASER', 0, 0, 0); m.bossId = 'MAW';
  m.age = FINAL_BOSS_PHASES.GRACE + FINAL_BOSS_PHASES.CYCLE;   // first barrage wrap
  assert.ok(FINAL_BOSS.decide(m, player, null).barrage, 'maw decider without dt still fires');
});

check('a zero/negative dt cannot wedge a permanent silence', () => {
  const s = makeTypedEnemy('SPITTER', 0, 0, 0);
  s.age = ENEMY_TYPES.SPITTER.fireInterval;
  assert.ok(ENEMY_TYPES.SPITTER.decide(s, player, 0).fire, 'dt 0 falls back to the 1/60 window');
});

console.log(`\n${passed} assertion groups passed — test_fire_window OK`);
