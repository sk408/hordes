// Final boss unit tests — pure logic, no DOM.
// Run: node test/test_final_boss.mjs
import assert from 'node:assert/strict';
import {
  FINAL_BOSS, FINAL_BOSS_WAVE, FINAL_BOSS_SPRITE, FINAL_BOSS_PHASES, BARRAGE,
  BEATABLE, HP_FLOOR, DISPLAY_HP, MAW_SPEED_BASE,
  mawDecide, decideFinalBossAction,
  finalBossDamage, shouldApplyHit, applyFinalBossDamage, makeFinalBoss,
} from '../src/final_boss.js';

const player = { x: 0, y: 0 };
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const P = FINAL_BOSS_PHASES;
const maw = (age) => ({ ...makeFinalBoss(100, 0), age });

// --- descriptor + tuning -------------------------------------------------------
check('descriptor: ominous name + flavor, wave target, huge display hp', () => {
  assert.equal(FINAL_BOSS.name, 'THE MAW OF THE HORDE');
  assert.ok(FINAL_BOSS.flavor.length > 3, 'flavor line for the announce');
  assert.equal(FINAL_BOSS_WAVE, 5, 'wave-5 target (tunable)');
  assert.equal(DISPLAY_HP, 2_500_000, 'huge display hp');
  assert.ok(typeof FINAL_BOSS.decide === 'function');
});

check('undefeatable this phase: BEATABLE=false pins the floor at 1', () => {
  assert.equal(BEATABLE, false, 'Sk408 flips this later');
  assert.equal(HP_FLOOR, 1, 'floor follows BEATABLE');
});

// --- choreography: grace -> drift -> telegraph -> barrage ----------------------
check('entrance GRACE: no telegraph, no barrage, just slow drift', () => {
  for (const age of [0.1, 1.0, P.GRACE - 0.01, P.GRACE]) {
    const a = mawDecide(maw(age), player, null, 1 / 60);
    assert.equal(a.telegraph, undefined, `age ${age}: no telegraph in grace`);
    assert.equal(a.barrage, undefined, `age ${age}: no barrage in grace`);
  }
  const a = mawDecide(maw(0.5), player, null, 1 / 60);
  assert.ok(Math.abs(a.mx + FINAL_BOSS.driftSpeedMult) < 1e-9, 'drifts at the player');
});

check('mid-cycle: drifting, silent (no telegraph, no barrage)', () => {
  const a = mawDecide(maw(P.GRACE + 2.0), player, null, 1 / 60);
  assert.equal(a.telegraph, undefined);
  assert.equal(a.barrage, undefined);
  assert.ok(a.mx < 0, 'still drifting toward the player');
});

check('TELEGRAPH window: exported flag for the last ~0.8s of every cycle', () => {
  for (const age of [P.GRACE + P.CYCLE - 0.7, P.GRACE + P.CYCLE - 0.1]) {
    const a = mawDecide(maw(age), player, null, 1 / 60);
    assert.equal(a.telegraph, true, `age ${age}: telegraph on`);
    assert.equal(a.barrage, undefined, 'no barrage during the windup');
  }
  // second cycle telegraphs too
  const b = mawDecide(maw(P.GRACE + 2 * P.CYCLE - 0.4), player, null, 1 / 60);
  assert.equal(b.telegraph, true, 'cycle 2 telegraphs');
  // just after a barrage: flag drops
  const c = mawDecide(maw(P.GRACE + P.CYCLE + 0.5), player, null, 1 / 60);
  assert.equal(c.telegraph, undefined, 'flag clears after the barrage');
});

check('BARRAGE fires on the cycle wrap: 48+ shots, tuned speed, fresh volleyId', () => {
  const a = mawDecide(maw(P.GRACE + P.CYCLE), player, null, 1 / 60);
  assert.ok(a.barrage, 'barrage intent at the wrap');
  assert.equal(a.barrage.shots, BARRAGE.SHOTS);
  assert.ok(a.barrage.shots >= 48, 'huge radial volley');
  assert.equal(a.barrage.speed, BARRAGE.SPEED);
  assert.ok(a.barrage.speed > 60, 'fast enough to blanket the arena');
  assert.equal(a.barrage.volleyId, 1, 'cycle 1 -> volley 1');
  // each cycle gets a fresh id
  const b = mawDecide(maw(P.GRACE + 2 * P.CYCLE), player, null, 1 / 60);
  assert.equal(b.barrage.volleyId, 2, 'cycle 2 -> volley 2');
  assert.equal(b.barrage.volleyId, Math.floor((P.GRACE + 2 * P.CYCLE - P.GRACE) / P.CYCLE),
    'ids derive deterministically from age');
  // no barrage between wraps
  assert.equal(mawDecide(maw(P.GRACE + P.CYCLE + 0.5), player, null, 1 / 60).barrage, undefined);
});

check('decide is pure: mutates neither boss nor player across the whole cycle', () => {
  const e = makeFinalBoss(100, 0);
  const pSnap = JSON.stringify(player);
  for (let age = 0; age < P.GRACE + 3 * P.CYCLE; age += 0.05) {
    e.age = age;
    mawDecide(e, player, null, 1 / 60);
    decideFinalBossAction(e, player, null, 1 / 60); // dispatch path too
  }
  assert.equal(JSON.stringify(player), pSnap, 'player untouched');
  const { age, ...rest } = e;
  assert.deepEqual(Object.keys(rest).sort(),
    ['bossId', 'h', 'hp', 'maxHp', 'speed', 'typeId', 'w', 'x', 'y'],
    'no fields added to the boss (speed is the wave-26 real default)');
  // WAVE-26: the factory stamps a REAL speed so a caller that forgets to
  // derive it gets the tuned value, never NaN.
  assert.ok(Number.isFinite(e.speed) && e.speed > 0,
    'makeFinalBoss stamps a finite, positive speed (' + e.speed + ')');
  assert.equal(e.speed, MAW_SPEED_BASE * FINAL_BOSS.speedMult,
    'and it is exactly the exported-base x speedMult tuning');
});

// --- three-hit rule -------------------------------------------------------------
check('finalBossDamage = ceil(maxHp/3), exact across maxHp values', () => {
  assert.equal(finalBossDamage({ maxHp: 100 }), 34);
  assert.equal(finalBossDamage({ maxHp: 101 }), 34);
  assert.equal(finalBossDamage({ maxHp: 102 }), 34);
  assert.equal(finalBossDamage({ maxHp: 103 }), 35);
  assert.equal(finalBossDamage({ maxHp: 1 }), 1);
  assert.equal(finalBossDamage({ maxHp: 3 }), 1);
});

check('any hero dies in EXACTLY 3 hits; 2 hits never kills', () => {
  for (const maxHp of [3, 10, 99, 100, 101, 250, 999, 100000]) {
    const hit = finalBossDamage({ maxHp });
    assert.ok(3 * hit >= maxHp, `maxHp ${maxHp}: 3 hits kill (${hit}*3=${3 * hit})`);
    assert.ok(2 * hit < maxHp, `maxHp ${maxHp}: 2 hits survive (${hit}*2=${2 * hit})`);
  }
});

check('three-hit rule ignores defenses, heat, items, buffs', () => {
  const naked = finalBossDamage({ maxHp: 100 });
  const stacked = finalBossDamage({
    maxHp: 100, armor: 999, hp: 100, heat: 20,
    stats: { damageMult: 10, goldMult: 5 }, buffs: { overcharge: 4 },
  });
  assert.equal(naked, stacked, 'no defense in the maw');
});

// --- one-hit-per-volley mercy rule ----------------------------------------------
check('mercy rule: first projectile of a volley applies, the rest pass through', () => {
  let state = null;                       // hb1 keeps this (e.g. state.volleyMask)
  const first = shouldApplyHit(state, 7);
  assert.deepEqual(first, { apply: true, nextState: 7 });
  state = first.nextState;
  for (let i = 0; i < 47; i++) {          // the other 47 spokes of the same volley
    const r = shouldApplyHit(state, 7);
    assert.equal(r.apply, false, `spoke ${i + 2} of volley 7 is harmless`);
    assert.equal(r.nextState, 7, 'state unchanged on a mercy pass');
  }
});

check('mercy rule re-arms on the NEXT volleyId', () => {
  let state = shouldApplyHit(null, 1).nextState;   // volley 1 landed
  assert.equal(shouldApplyHit(state, 1).apply, false, 'volley 1 spent');
  const next = shouldApplyHit(state, 2);
  assert.equal(next.apply, true, 'volley 2 re-armed');
  state = next.nextState;
  assert.equal(shouldApplyHit(state, 2).apply, false, 'volley 2 now spent');
  assert.equal(shouldApplyHit(state, 3).apply, true, 'and so on, forever');
});

// --- hp floor: bar drains, death blocked ----------------------------------------
check('floor blocks death while the bar visibly drains', () => {
  const boss = makeFinalBoss(0, 0);
  assert.equal(boss.hp, DISPLAY_HP);
  assert.equal(boss.maxHp, DISPLAY_HP);
  let prev = boss.hp;
  let hits = 0;
  while (boss.hp > HP_FLOOR && hits < 50) {   // drain phase: bar visibly drops
    const r = applyFinalBossDamage(boss, 1_000_000);
    hits++;
    assert.ok(r.hp < prev, `hit ${hits} drains the bar`);
    assert.equal(r.died, false, 'death blocked this build phase');
    assert.ok(r.hp >= HP_FLOOR, 'never below the floor');
    prev = r.hp;
  }
  assert.ok(hits >= 2, `the bar took real punishment first (${hits} draining hits)`);
  // absurd overkill: still pinned at the floor, still alive
  for (let i = 0; i < 20; i++) {
    const r = applyFinalBossDamage(boss, 999_999_999);
    assert.equal(r.hp, HP_FLOOR);
    assert.equal(r.died, false);
  }
  // applyFinalBossDamage mutates ONLY hp
  const before = JSON.stringify({ ...boss, hp: 0 });
  applyFinalBossDamage(boss, 5);
  assert.equal(JSON.stringify({ ...boss, hp: 0 }), before);
});

check('factory ships the finale enemy ready for hb1 wiring', () => {
  const b = makeFinalBoss(30, -40);
  assert.equal(b.bossId, 'MAW');
  assert.deepEqual([b.x, b.y], [30, -40]);
  assert.equal(b.age, 0, 'integrator owns the clock');
  assert.equal(b.maxHp, b.hp, 'bar starts full');
});

// --- sprite: bigger and darker than the named cast ------------------------------
check('sprite: 34x38 rectangular, palette-complete, two distinct frames', () => {
  const s = FINAL_BOSS_SPRITE;
  assert.equal(s.frames.length, 2);
  const h = s.frames[0].length, w = s.frames[0][0].length;
  assert.ok(w >= 32 && h >= 36, `VERY large (got ${w}x${h})`);
  for (let f = 0; f < 2; f++) {
    const g = s.frames[f];
    assert.ok(g.length === h && g.every(r => r.length === w), `frame ${f} rectangular`);
    assert.ok(g.every(r => r.every(v => Number.isInteger(v) && v >= 0 && v <= 9)),
      `frame ${f} palette-index ints`);
  }
  const used = new Set();
  for (const g of s.frames) for (const row of g) for (const v of row) if (v) used.add(v);
  for (const k of Object.keys(s.palette)) {
    assert.ok(/^[1-9]$/.test(k), `palette key ${k}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.palette[k]), `palette ${k} hex`);
  }
  assert.deepEqual([...used].filter(v => !s.palette[v]), [], 'every used index resolves');
  assert.notEqual(JSON.stringify(s.frames[0]), JSON.stringify(s.frames[1]), 'frames animate');
  assert.equal(s.box.w, w); assert.equal(s.box.h, h);
  assert.equal(s.anchor.x, Math.floor(w / 2));
  assert.equal(s.anchor.y, Math.floor(h / 2));
  // unmistakably DARKER than the named cast (cast bodies bottom out ~#2a2a34)
  const bodyR = parseInt(s.palette[1].slice(1, 3), 16);
  assert.ok(bodyR < 0x2a, `void-black body (${s.palette[1]})`);
  // and the teeth/core read: bone + glow both present in the maw rows
  assert.ok(used.has(3) && used.has(4) && used.has(5), 'teeth(3), eyes(4), core(5) used');
});

console.log(`\n${passed} assertion groups passed — test_final_boss OK`);
