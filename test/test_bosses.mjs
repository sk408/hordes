// Named boss cast unit tests — pure logic, no DOM.
// Run: node test/test_bosses.mjs
import assert from 'node:assert/strict';
import {
  BOSSES, BOSS_ORDER, BOSS_SPRITES, pickBossForWave, decideBossAction, MIDBOSS,
} from '../src/bosses.js';
import { CONFIG as C } from '../src/config.js';

const player = { x: 0, y: 0 };
const DT = 1 / 60;
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// Fresh boss-shaped enemy at (x, y). age / hp / maxHp are the fields the
// deciders read; chargeDx/Dy + lastTeleportAge are their documented writes.
function bossEnemy(id, x, y, age = 0, hpFrac = 1) {
  const b = BOSSES[id];
  return {
    bossId: id, typeId: id,
    x, y, age,
    hp: 100 * hpFrac * b.hpMult, maxHp: 100 * b.hpMult,
    chargeDx: null, chargeDy: null, lastTeleportAge: undefined,
  };
}

const ALL_BOSSES = ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS'];

// --- cast shape: names, flavor, multipliers, brains, sprites ------------------
check('every boss ships name + flavor + base multipliers + decide + sprite', () => {
  for (const id of ALL_BOSSES) {
    const b = BOSSES[id];
    assert.ok(typeof b.name === 'string' && b.name.length > 3, `${id} name`);
    assert.ok(typeof b.flavor === 'string' && b.flavor.length > 3, `${id} flavor`);
    assert.ok(typeof b.hpMult === 'number' && b.hpMult > 0, `${id} hpMult`);
    assert.ok(typeof b.speedMult === 'number' && b.speedMult > 0, `${id} speedMult`);
    assert.equal(typeof b.decide, 'function', `${id} decide`);
    assert.ok(BOSS_SPRITES[id], `${id} sprite`);
    assert.equal(b.id, id);
  }
  assert.deepEqual([...BOSS_ORDER], ALL_BOSSES, 'rotation order covers the cast');
});

// --- pickBossForWave: singles rotate, doubles are distinct events -------------
check('single waves rotate one boss through the cast', () => {
  assert.deepEqual(pickBossForWave(1).map(b => b.id), ['GRAVELMAW']);
  assert.deepEqual(pickBossForWave(2).map(b => b.id), ['CHOIR_MOTHER']);
  assert.deepEqual(pickBossForWave(4).map(b => b.id), ['GRAVELMAW']);   // (4-1)%3
  assert.deepEqual(pickBossForWave(5).map(b => b.id), ['CHOIR_MOTHER']);
  assert.deepEqual(pickBossForWave(7).map(b => b.id), ['GRAVELMAW']);
  // degenerate inputs clamp to wave 1's behavior
  assert.deepEqual(pickBossForWave(0).map(b => b.id), ['GRAVELMAW']);
  assert.equal(pickBossForWave(1).length, 1);
});

check('waves divisible by 3 spawn TWO distinct bosses (the event)', () => {
  for (const w of [3, 6, 9, 12, 15]) {
    const pair = pickBossForWave(w);
    assert.equal(pair.length, 2, `wave ${w} = 2 bosses`);
    assert.notEqual(pair[0].id, pair[1].id, `wave ${w} pair is distinct`);
    for (const b of pair) {
      assert.ok(BOSSES[b.id], `wave ${w}: known boss ${b.id}`);
      assert.ok(typeof b.hpMult === 'number' && typeof b.speedMult === 'number');
    }
  }
});

check('double-boss pairs rotate across event waves', () => {
  const ids = (w) => pickBossForWave(w).map(b => b.id).join('+');
  assert.equal(ids(3), 'GRAVELMAW+CHOIR_MOTHER');
  assert.equal(ids(6), 'CHOIR_MOTHER+PYRAXIS');
  assert.equal(ids(9), 'PYRAXIS+GRAVELMAW');
  assert.equal(ids(12), 'GRAVELMAW+CHOIR_MOTHER', 'pairs wrap');
});

check('pickBossForWave returns fresh descriptors (callers cannot corrupt the cast)', () => {
  const a = pickBossForWave(1)[0];
  a.hpMult = 999; a.name = 'SPOILED';
  const b = pickBossForWave(1)[0];
  assert.equal(b.hpMult, BOSSES.GRAVELMAW.hpMult, 'master hpMult untouched');
  assert.equal(b.name, 'GRAVELMAW THE CHARGER');
  assert.equal(b.sprite, BOSS_SPRITES.GRAVELMAW, 'descriptor carries its sprite');
  assert.notEqual(a, BOSSES.GRAVELMAW, 'descriptor is a copy, not the master');
});

// --- GRAVELMAW: stalk -> telegraph -> locked charge -> recover -----------------
check('gravelmaw stalks toward the player at stalk speed', () => {
  const B = BOSSES.GRAVELMAW;
  const e = bossEnemy('GRAVELMAW', 100, 0, 0.5);
  const a = B.decide(e, player, null, DT);
  assert.equal(a.telegraph, undefined);
  assert.ok(Math.abs(a.mx + B.stalkSpeedMult) < 1e-9, `stalk -x at 0.7x, got ${a.mx}`);
});

check('gravelmaw telegraph: frozen + telegraph=true during windup', () => {
  const B = BOSSES.GRAVELMAW;
  const e = bossEnemy('GRAVELMAW', 100, 0, B.stalkTime + 0.35);
  const a = B.decide(e, player, null, DT);
  assert.equal(a.telegraph, true, 'windup flash');
  assert.equal(a.mx, 0, 'frozen during windup');
  assert.equal(a.my, 0);
  assert.equal(e.chargeDx, null, 'no charge lock yet');
});

check('gravelmaw charges fast and steers toward the player (homing, WAVE-20)', () => {
  const B = BOSSES.GRAVELMAW;
  const teleEnd = B.stalkTime + B.telegraphTime;
  const e = bossEnemy('GRAVELMAW', 100, 0, teleEnd + 0.05);
  const a1 = B.decide(e, player, null, DT);       // locks toward player at (0,0)
  assert.equal(a1.charging, true);
  assert.ok(Math.abs(a1.mx + B.chargeSpeedMult) < 1e-9, `charge -x at ${B.chargeSpeedMult}x, got ${a1.mx}`);
  assert.ok(Math.abs(Math.hypot(a1.mx, a1.my) - B.chargeSpeedMult) < 1e-9, 'unit dir * mult');
  // player dodges sideways: the charge BENDS toward the new position over
  // successive ticks (a fully locked line was sidestepped every cycle —
  // 33s probe fights with zero touches landed) but only gradually.
  for (let i = 0; i < 60; i++) B.decide(e, { x: 100, y: 95 }, null, DT);
  const a2 = B.decide(e, { x: 100, y: 95 }, null, DT);
  assert.ok(a2.my > a1.my, 'charge steers toward the dodged player (+y bend)');
  assert.ok(Math.abs(Math.hypot(a2.mx, a2.my) - B.chargeSpeedMult) < 1e-9,
    'homing blend stays renormalized to the charge speed');
});

check('gravelmaw recovers frozen after the charge, lock cleared, cycle repeats', () => {
  const B = BOSSES.GRAVELMAW;
  const cycle = B.stalkTime + B.telegraphTime + B.chargeTime + B.recoverTime;
  const recoverAt = B.stalkTime + B.telegraphTime + B.chargeTime + 0.3;
  const e = bossEnemy('GRAVELMAW', 100, 0, recoverAt);
  const a = B.decide(e, player, null, DT);
  assert.equal(a.recovering, true, 'recover pause');
  assert.equal(a.mx, 0); assert.equal(a.my, 0);
  assert.equal(e.chargeDx, null, 'lock cleared outside charge');
  // one full cycle later the pattern is back to stalking (and re-telegraphs)
  const stalk = B.decide(bossEnemy('GRAVELMAW', 100, 0, cycle + 0.5), player, null, DT);
  assert.ok(Math.abs(stalk.mx + B.stalkSpeedMult) < 1e-9, 'cycle repeats to stalk');
  const tele = B.decide(bossEnemy('GRAVELMAW', 100, 0, cycle + B.stalkTime + 0.1), player, null, DT);
  assert.equal(tele.telegraph, true, 'second-cycle windup');
});

// --- CHOIR MOTHER: drift + summon bursts + enrage fan -------------------------
check('choir mother drifts slowly toward the player, always', () => {
  const B = BOSSES.CHOIR_MOTHER;
  for (const age of [0.3, 3.0, 9.7]) {
    const a = B.decide(bossEnemy('CHOIR_MOTHER', 100, 0, age), player, null, DT);
    assert.ok(Math.abs(a.mx + B.driftSpeedMult) < 1e-9, `age ${age}: drift -x at 0.45x`);
  }
});

check('choir mother summons a swarmer burst on the interval wrap (healthy: 3)', () => {
  const EB = C.ESCALATION.BOSS;
  const e = bossEnemy('CHOIR_MOTHER', 100, 0, EB.SUMMON_INTERVAL); // phase wraps
  const a = BOSSES.CHOIR_MOTHER.decide(e, player, null, DT);
  assert.ok(a.summon, 'summon intent at wrap');
  assert.equal(a.summon.type, EB.SUMMON_TYPE);
  assert.equal(a.summon.count, EB.SUMMON_COUNT, 'healthy = ESCALATION count');
  // mid-interval: silent
  const mid = BOSSES.CHOIR_MOTHER.decide(bossEnemy('CHOIR_MOTHER', 100, 0, 1.0), player, null, DT);
  assert.equal(mid.summon, undefined, 'no summon between bursts');
});

check('choir mother enrages below half hp: 4 summons + a fanned hymn', () => {
  const B = BOSSES.CHOIR_MOTHER;
  const EB = C.ESCALATION.BOSS;
  // healthy: never fans
  const calm = B.decide(bossEnemy('CHOIR_MOTHER', 100, 0, B.fanInterval), player, null, DT);
  assert.equal(calm.fan, undefined, 'no fan while healthy');
  // hurt: summon count bumps
  const hurtSummon = B.decide(bossEnemy('CHOIR_MOTHER', 100, 0, EB.SUMMON_INTERVAL, 0.4), player, null, DT);
  assert.equal(hurtSummon.summon.count, EB.SUMMON_COUNT + 1, 'enraged = +1 swarmer');
  // hurt: fan fires on the fanInterval wrap, middle shot aimed at the player
  const e = bossEnemy('CHOIR_MOTHER', 100, 0, B.fanInterval, 0.4);
  const a = B.decide(e, player, null, DT);
  assert.ok(Array.isArray(a.fan) && a.fan.length === B.fanShots, 'fan of 5');
  const mid = a.fan[(B.fanShots - 1) / 2];
  assert.ok(mid.dx < -0.9, `middle shot aimed at player, dx ${mid.dx}`);
  assert.equal(mid.speed, B.projSpeed);
  assert.equal(mid.damage, B.projDamage);
  for (const shot of a.fan) {
    assert.ok(Math.abs(Math.hypot(shot.dx, shot.dy) - 1) < 1e-9, 'fan dirs normalized');
  }
  // hurt but mid-fan-interval: no fan
  const quiet = B.decide(bossEnemy('CHOIR_MOTHER', 100, 0, 1.0, 0.4), player, null, DT);
  assert.equal(quiet.fan, undefined);
});

// --- PYRAXIS: nova cycle + crowded teleport ------------------------------------
check('pyraxis holds range in the move phase: retreats when crowded, approaches when far', () => {
  const B = BOSSES.PYRAXIS;
  const near = B.decide(bossEnemy('PYRAXIS', 100, 0, 0.5), player, null, DT); // 100 < 130
  assert.ok(near.mx > 0.9, `retreat +x, got ${near.mx}`);
  const far = B.decide(bossEnemy('PYRAXIS', 250, 0, 0.5), player, null, DT);  // 250 > 190
  assert.ok(far.mx < -0.9, `approach -x, got ${far.mx}`);
  const hold = B.decide(bossEnemy('PYRAXIS', 170, 0, 0.5), player, null, DT);
  assert.equal(hold.mx, 0, 'holds at ~170px');
});

check('pyraxis telegraphs a visible charge-up before the nova', () => {
  const B = BOSSES.PYRAXIS;
  const EB = C.ESCALATION.BOSS;
  const cycle = Math.max(B.novaChargeTime + 0.1, EB.NOVA_INTERVAL);
  const moveTime = cycle - B.novaChargeTime;
  const e = bossEnemy('PYRAXIS', 250, 0, moveTime + 0.3); // inside charge window
  const a = B.decide(e, player, null, DT);
  assert.equal(a.telegraph, true, 'charge-up flash');
  assert.equal(a.novaCharge, true);
  assert.equal(a.mx, 0); assert.equal(a.my, 0, 'frozen while charging');
});

check('pyraxis releases the ring nova on the cycle wrap with ESCALATION tuning', () => {
  const B = BOSSES.PYRAXIS;
  const EB = C.ESCALATION.BOSS;
  const cycle = Math.max(B.novaChargeTime + 0.1, EB.NOVA_INTERVAL);
  const a = B.decide(bossEnemy('PYRAXIS', 170, 0, cycle), player, null, DT);
  assert.ok(a.nova, 'nova intent at wrap');
  assert.equal(a.nova.shots, EB.NOVA_SHOTS);
  assert.equal(a.nova.speed, EB.NOVA_SPEED);
  assert.equal(a.nova.damage, EB.NOVA_DAMAGE);
  assert.equal(a.telegraph, false, 'not charging after release');
  // mid-cycle: no nova
  const mid = B.decide(bossEnemy('PYRAXIS', 170, 0, 0.5), player, null, DT);
  assert.equal(mid.nova, null);
});

check('pyraxis teleports a hop away when crowded, then respects the cooldown', () => {
  const B = BOSSES.PYRAXIS;
  const e = bossEnemy('PYRAXIS', 50, 0, 5.0); // dist 50 < teleportDist
  const a1 = B.decide(e, player, null, DT);
  assert.ok(a1.teleport, 'teleport intent when crowded');
  assert.ok(a1.teleport.dx > 0.9, `hop AWAY from player (+x), got ${a1.teleport.dx}`);
  assert.equal(a1.teleport.dist, B.teleportHop);
  assert.equal(e.lastTeleportAge, 5.0, 'cooldown stamp written');
  // still crowded one tick later: cooldown holds
  e.age = 5.0 + DT;
  const a2 = B.decide(e, player, null, DT);
  assert.equal(a2.teleport, undefined, 'no double-blink inside cooldown');
  // after the cooldown, crowded again: blinks
  e.age = 5.0 + B.teleportCooldown + DT;
  const a3 = B.decide(e, player, null, DT);
  assert.ok(a3.teleport, 'blink ready after cooldown');
  // never blinks when the player keeps distance
  const calm = B.decide(bossEnemy('PYRAXIS', 250, 0, 5.0), player, null, DT);
  assert.equal(calm.teleport, undefined);
});

// --- MIDBOSS cast: HERALD (mid-wave, outside the end-boss rotation) ------------
const heraldEnemy = (x, y, age = 0) => ({
  bossId: 'HERALD', typeId: 'CHASER', x, y, age, hp: 100, maxHp: 100,
});

check('herald ships registry shape + sprite and is outside the end-boss rotation', () => {
  const h = MIDBOSS.HERALD;
  assert.equal(h.id, 'HERALD');
  assert.ok(h.name.length > 3 && h.flavor.length > 3);
  assert.ok(h.hpMult > 0 && h.sizeMult > 0 && h.contactDamageMult > 0);
  assert.equal(typeof h.decide, 'function');
  assert.ok(h.sprite, 'sprite carried');
  assert.ok(!BOSS_ORDER.includes('HERALD'), 'mid-boss never rotates into wave-end casts');
  assert.equal(pickBossForWave(3).length, 2, 'event waves stay end-cast-only');
});

check('herald plants the PILLAR ring on the interval wrap around the PLAYER', () => {
  const M = C.ESCALATION.MIDBOSS;
  const a = MIDBOSS.HERALD.decide(heraldEnemy(100, 0, M.RING_INTERVAL), player, null, DT);
  assert.ok(a.ring, 'ring intent at wrap');
  assert.equal(a.ring.type, 'PILLAR');
  assert.equal(a.ring.count, M.PILLARS);
  assert.equal(a.ring.radius, M.PILLAR_RADIUS);
  // mid-interval: no ring
  const mid = MIDBOSS.HERALD.decide(heraldEnemy(100, 0, M.RING_INTERVAL + 0.5), player, null, DT);
  assert.equal(mid.ring, undefined);
});

check('herald fires a tight rifle burst on the burst wrap, middle shot aimed', () => {
  const M = C.ESCALATION.MIDBOSS;
  const a = MIDBOSS.HERALD.decide(heraldEnemy(100, 0, M.BURST_INTERVAL), player, null, DT);
  assert.ok(Array.isArray(a.fan) && a.fan.length === M.BURST_SHOTS, 'fan of bursts');
  const mid = a.fan[(M.BURST_SHOTS - 1) / 2];
  assert.ok(mid.dx < -0.9, `middle shot aimed at player, dx ${mid.dx}`);
  assert.equal(mid.speed, M.BURST_SPEED);
  assert.equal(mid.damage, M.BURST_DAMAGE);
  for (const s of a.fan) assert.ok(Math.abs(Math.hypot(s.dx, s.dy) - 1) < 1e-9, 'dirs normalized');
  // mid-interval: silent
  const quiet = MIDBOSS.HERALD.decide(heraldEnemy(100, 0, M.BURST_INTERVAL + 0.5), player, null, DT);
  assert.equal(quiet.fan, undefined);
});

check('herald pursues at full speed, easing to a duel drift inside HOLD_DIST', () => {
  const M = C.ESCALATION.MIDBOSS;
  const far = MIDBOSS.HERALD.decide(heraldEnemy(100, 0, 0.5), player, null, DT);
  assert.ok(Math.abs(far.mx + 1) < 1e-9, 'full pursuit beyond hold dist');
  const near = MIDBOSS.HERALD.decide(heraldEnemy(M.HOLD_DIST - 5, 0, 0.5), player, null, DT);
  assert.ok(Math.abs(near.mx + M.CLOSE_SPEED_MULT) < 1e-9, `eases to ${M.CLOSE_SPEED_MULT}x inside hold`);
});

check('herald decide is fully pure (no enemy-field mutations at all)', () => {
  const e = heraldEnemy(100, 0);
  const snap = JSON.stringify(e);
  for (let age = 0; age < 30; age += 0.05) {
    e.age = age;
    MIDBOSS.HERALD.decide(e, player, null, DT);
  }
  const after = { ...e }; delete after.age;
  const before = JSON.parse(snap); delete before.age;
  assert.equal(JSON.stringify(after), JSON.stringify(before), 'herald decide mutated the enemy');
});

check('decideBossAction dispatch reaches the MIDBOSS cast', () => {
  const e = heraldEnemy(100, 0, 0.5);
  assert.deepEqual(decideBossAction(e, player, null, DT),
    MIDBOSS.HERALD.decide(e, player, null, DT));
});

check('herald sprite passes the boss-sprite contract', () => {
  const s = MIDBOSS.HERALD.sprite;
  assert.equal(s.frames.length, 2, 'exactly 2 frames');
  const h = s.frames[0].length, w = s.frames[0][0].length;
  assert.ok(w >= 20 && h >= 24, `presence size (got ${w}x${h})`);
  for (let f = 0; f < 2; f++) {
    assert.ok(s.frames[f].every(r => r.length === w), `frame ${f} rectangular`);
    assert.ok(s.frames[f].every(r => r.every(v => Number.isInteger(v) && v >= 0 && v <= 9)),
      `frame ${f} palette-index ints`);
  }
  const used = new Set();
  for (const g of s.frames) for (const r of g) for (const v of r) if (v) used.add(v);
  assert.deepEqual([...used].filter(v => !s.palette[v]), [], 'every used index has a color');
  assert.notEqual(JSON.stringify(s.frames[0]), JSON.stringify(s.frames[1]), 'frames distinct');
});

// --- decideBossAction dispatch -------------------------------------------------
check('decideBossAction dispatches by bossId/typeId with safe fallback', () => {
  const e = bossEnemy('PYRAXIS', 250, 0, 0.5);
  const viaDispatch = decideBossAction(e, player, null, DT);
  const direct = BOSSES.PYRAXIS.decide(e, player, null, DT);
  assert.deepEqual(viaDispatch, direct);
  assert.deepEqual(decideBossAction({ x: 0, y: 0, age: 0 }, player, null, DT),
    { mx: 0, my: 0, fire: null }, 'unknown boss freezes safely');
});

// --- purity: deciders mutate ONLY documented enemy fields ----------------------
check('decide mutates only documented enemy fields; player untouched', () => {
  const DOC = ['age', 'chargeDx', 'chargeDy', 'lastTeleportAge'];
  const scenarios = [
    ['GRAVELMAW', 100, 0], ['GRAVELMAW', -60, 40],
    ['CHOIR_MOTHER', 100, 0], ['CHOIR_MOTHER', -80, -30],
    ['PYRAXIS', 50, 0], ['PYRAXIS', 250, 0], ['PYRAXIS', -100, 90],
  ];
  for (const [id, x, y] of scenarios) {
    for (const hpFrac of [1.0, 0.4]) { // choir enrage path included
      const e = bossEnemy(id, x, y, 0, hpFrac);
      const allowed = new Set([...Object.keys(e), ...DOC]);
      for (let age = 0; age < 10; age += 0.05) {
        e.age = age;
        BOSSES[id].decide(e, player, null, DT);
      }
      for (const k of Object.keys(e)) {
        assert.ok(allowed.has(k), `${id} added unexpected enemy field "${k}"`);
      }
    }
  }
  const pSnap = JSON.stringify(player);
  BOSSES.GRAVELMAW.decide(bossEnemy('GRAVELMAW', 100, 0, 2.0), player, null, DT);
  assert.equal(JSON.stringify(player), pSnap, 'player object untouched');
});

// --- sprites: big, rectangular, palette-complete, 2 distinct frames ------------
check('boss sprites: rectangular, >=20x24, palettes resolve, frames differ', () => {
  const HEX = /^#[0-9a-f]{6}$/i;
  for (const id of ALL_BOSSES) {
    const s = BOSS_SPRITES[id];
    assert.equal(s.frames.length, 2, `${id}: exactly 2 frames`);
    const h = s.frames[0].length, w = s.frames[0][0].length;
    assert.ok(w >= 20 && h >= 24, `${id}: presence size (got ${w}x${h})`);
    for (let f = 0; f < 2; f++) {
      const g = s.frames[f];
      assert.ok(g.length === h && g.every(r => r.length === w),
        `${id}: frame ${f} rectangular ${w}x${h}`);
      assert.ok(g.every(r => r.every(v => Number.isInteger(v) && v >= 0 && v <= 9)),
        `${id}: frame ${f} uses palette-index ints`);
    }
    // palette: keys 1-9, hex colors, resolves every used index
    const used = new Set();
    for (const g of s.frames) for (const row of g) for (const v of row) if (v) used.add(v);
    for (const k of Object.keys(s.palette)) {
      assert.ok(/^[1-9]$/.test(k), `${id}: palette key ${k} in 1..9`);
      assert.ok(HEX.test(s.palette[k]), `${id}: palette ${k}=#hex`);
    }
    const missing = [...used].filter(v => !s.palette[v]);
    assert.deepEqual(missing, [], `${id}: every used index has a color`);
    assert.ok(used.size >= 4, `${id}: sprite uses its palette`);
    // frames must differ (walk/flap/pulse)
    const flat = (g) => JSON.stringify(g);
    assert.notEqual(flat(s.frames[0]), flat(s.frames[1]), `${id}: frames A/B distinct`);
    // box + anchor derived from the pixels (sprites.js conventions)
    assert.equal(s.box.w, w); assert.equal(s.box.h, h);
    assert.equal(s.anchor.x, Math.floor(w / 2));
    assert.equal(s.anchor.y, Math.floor(h / 2));
  }
});

console.log(`\n${passed} assertion groups passed — test_bosses OK`);
