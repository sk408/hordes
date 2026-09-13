// HORDES — WAVE-26 FEATURE 3: STANCE THAT BITES.
// Run: node test/test_stance_bite.mjs
//
// SAFE / BALANCED / GREEDY used to change one hidden kiting number with zero
// feedback, so the dial felt dead. The contract now:
//   (1) each stance is a REAL trade — flee distance AND loot magnetism, both
//       in CONFIG (no new currency, no new panel);
//   (2) the trade is legible: the canvas HUD prints the stance's meaning and
//       the pilot's live activity, and cycling the dial says what changed;
//   (3) the consequence is FELT in play — a gem the base radius cannot reach
//       is taken under GREEDY and left behind under SAFE;
//   (4) the payoff moment reports through the EXISTING toast feed, rate-limited.
import assert from 'node:assert/strict';
import { CONFIG as C } from '../src/config.js';
import { AutoPilotController, PlayerController, STANCES } from '../src/controllers.js';
import { boot, suite } from './_harness.mjs';

const S = suite('wave-26 stance that bites');

// ---- (1) data: a real, opposite trade ---------------------------------------
S.check('every stance carries a meaning tag and both consequence knobs', () => {
  for (const name of STANCES) {
    const s = C.AUTOPILOT.STANCES[name];
    assert.ok(s, name + ' exists in CONFIG');
    assert.ok(typeof s.TAG === 'string' && s.TAG.length > 0, name + ' has a TAG');
    assert.ok(typeof s.PICKUP_MULT === 'number' && s.PICKUP_MULT > 0, name + ' has a PICKUP_MULT');
    assert.ok(typeof s.KITE_MULT === 'number' && s.KITE_MULT > 0, name + ' has a KITE_MULT');
  }
});
S.check('the dial is monotone: SAFE < BALANCED < GREEDY risk', () => {
  const s = C.AUTOPILOT.STANCES;
  assert.ok(s.SAFE.KITE_MULT > s.BALANCED.KITE_MULT && s.BALANCED.KITE_MULT > s.GREEDY.KITE_MULT,
    'SAFE back-pedals furthest, GREEDY hugs the horde');
  assert.ok(s.SAFE.PICKUP_MULT < s.BALANCED.PICKUP_MULT && s.BALANCED.PICKUP_MULT < s.GREEDY.PICKUP_MULT,
    'GREEDY reaches furthest for loot, SAFE keeps its distance from it too');
  assert.equal(s.BALANCED.PICKUP_MULT, 1, 'BALANCED is the neutral baseline');
});
S.check('no new currency or panel was introduced', () => {
  // The stance's consequences are expressed through existing fields only.
  const keys = Object.keys(C.AUTOPILOT.STANCES.GREEDY).sort();
  assert.deepEqual(keys, ['KITE_MULT', 'LOOT_WEIGHT', 'PICKUP_MULT', 'TAG', 'XP_SPEED'],
    'no stray economy field (got ' + keys.join(',') + ')');
});

// ---- (2) legibility: the pilot reports its live activity ---------------------
const cfg = C.PLAYER;
const mkState = (over) => Object.assign({
  enemies: [], gems: [], time: 0, wave: { num: 1 }, player: { x: 0, y: 0 },
}, over);
S.check('the controller publishes FLEE when a threat is inside the kite line', () => {
  const c = new AutoPilotController();
  c.stance = 'GREEDY';                       // kite 27.5px
  const st = mkState({ enemies: [{ x: 10, y: 0, hp: 5, maxHp: 5, typeId: 'CHASER' }] });
  c.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(c.act, 'FLEE');
});
S.check('the controller publishes LOOT when it is only chasing gems', () => {
  const c = new AutoPilotController();
  const st = mkState({ gems: [{ x: 40, y: 0, xp: 1 }] });
  c.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(c.act, 'LOOT');
});
S.check('the controller publishes PATROL with nothing to chase', () => {
  const c = new AutoPilotController();
  const st = mkState({});
  c.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(c.act, 'PATROL');
});
S.check('manual pilot reports MANUAL (movement is the human\'s, by design)', () => {
  const c = new PlayerController({ up: false, down: false, left: false, right: true, x: 0, y: 0, mag: 0 });
  const st = mkState({});
  c.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(c.act, 'MANUAL');
});
S.check('the stance still changes the kite distance it always did', () => {
  // The flee line is (KITE_DIST * KITE_MULT * 2). KITE_DIST 55 -> GREEDY 55,
  // BALANCED 110, SAFE 220. Probe inside those bands.
  const threat = (d) => mkState({ enemies: [{ x: d, y: 0, hp: 5, maxHp: 5, typeId: 'CHASER' }] });
  const at = (stance, d) => {
    const c = new AutoPilotController();
    c.stance = stance;
    c.decide({ x: 0, y: 0 }, threat(d), cfg);
    return c.act;
  };
  assert.equal(at('GREEDY', 80), 'PATROL', 'GREEDY hugs: 80px is not yet a threat to it');
  assert.equal(at('BALANCED', 80), 'FLEE', 'BALANCED back-pedals at 80px');
  assert.equal(at('BALANCED', 150), 'PATROL', 'BALANCED ignores 150px');
  assert.equal(at('SAFE', 150), 'FLEE', 'SAFE keeps its distance at 150px');
});

// ---- (3) it BITES in play ----------------------------------------------------
const { T, state, elements, pump, key } = await boot({
  storage: [['hordes_onboarded', '1']],
});

function quietArena() {
  T.startRun();
  pump(2);
  state.spawnTimer = 999;
  state.wave.endsAt = state.time + 9999;
  state.enemies.length = 0;
  state.gems.length = 0;
  state.drops.length = 0;
  state.itemDrops.length = 0;
  return state.player;
}

S.check('GREEDY takes loot the base radius cannot reach; SAFE leaves it behind', () => {
  const p = quietArena();
  const base = p.stats.pickup * (p.stats.pickupMult || 1);
  const d = base * 1.2;                       // outside base, inside base*1.35
  assert.ok(d < base * C.AUTOPILOT.STANCES.GREEDY.PICKUP_MULT, 'the gem is in GREEDY range');
  assert.ok(d > base * C.AUTOPILOT.STANCES.SAFE.PICKUP_MULT, 'and outside SAFE range');

  T.controller.stance = 'GREEDY';
  state.gems.push({ x: p.x + d, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.gems.length, 0, 'GREEDY hoovered it');

  T.controller.stance = 'SAFE';
  state.gems.push({ x: p.x + d, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.gems.length, 1, 'SAFE kept its distance and left it on the floor');

  T.controller.stance = 'BALANCED';
  state.gems.length = 0;
});

S.check('the payoff reports through the EXISTING feed, rate-limited', () => {
  const p = quietArena();
  const base = p.stats.pickup * (p.stats.pickupMult || 1);
  state.toasts.length = 0;
  T.controller.stance = 'GREEDY';
  state.gems.push({ x: p.x + base * 1.2, y: p.y, xp: 0.01 });
  pump(1);
  const hits = state.toasts.filter(t => /GREEDY HAUL/.test(t.msg));
  assert.equal(hits.length, 1, 'one payoff line in the existing toast feed');
  assert.equal(hits[0].tint, C.HUD.STANCE_COLORS.GREEDY, 'tinted with the stance colour');
  // Rate limiter: another scoop immediately after must NOT spam.
  state.gems.push({ x: p.x + base * 1.2, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.toasts.filter(t => /GREEDY HAUL/.test(t.msg)).length, 1,
    'the second scoop inside the window is silent');
  // It is a normal toast: it decays and then the signal can fire again.
  for (const t of state.toasts) t.ttl = 0;
  pump(1);
  state.stanceLootAt = -99;
  state.gems.push({ x: p.x + base * 1.2, y: p.y, xp: 0.01 });
  pump(1);
  assert.ok(state.toasts.some(t => /GREEDY HAUL/.test(t.msg)), 'a later payoff speaks again');
  T.controller.stance = 'BALANCED';
});

S.check('the payoff never claims collected loot was left out of reach (owner-reported)', () => {
  const p = quietArena();
  const base = p.stats.pickup * (p.stats.pickupMult || 1);
  const greedy = base * (C.AUTOPILOT.STANCES.GREEDY.PICKUP_MULT || 1);
  const hauls = () => state.toasts.filter(t => /GREEDY HAUL/.test(t.msg));

  // (1) A gem the BASE radius could take is not a payoff, so it says nothing.
  state.toasts.length = 0; state.gems.length = 0; state.stanceLootAt = -99;
  T.controller.stance = 'GREEDY';
  state.gems.push({ x: p.x + base * 0.5, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.gems.length, 0, 'the ordinary gem was collected');
  assert.equal(hauls().length, 0, 'an ordinary pickup is not a GREEDY payoff');

  // (2) Loot beyond even the GREEDY radius stays on the floor and must NOT be
  // announced as a payoff. The wording bug: "1 LOOT OUT OF REACH" fired exactly
  // when the loot WAS taken, and never when loot was truly out of reach.
  state.toasts.length = 0; state.gems.length = 0; state.stanceLootAt = -99;
  state.gems.push({ x: p.x + greedy * 3, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.gems.length, 1, 'loot beyond the GREEDY radius is left alone');
  assert.equal(hauls().length, 0, 'unreachable loot is not a haul');

  // (3) When it speaks, the words must match the event: the loot was collected.
  state.toasts.length = 0; state.gems.length = 0; state.stanceLootAt = -99;
  state.gems.push({ x: p.x + base * 1.2, y: p.y, xp: 0.01 });
  pump(1);
  assert.equal(state.gems.length, 0, 'the stretched gem was collected');
  assert.equal(hauls().length, 1, 'a stretched pickup is the payoff');
  assert.ok(!/OUT OF REACH/.test(hauls()[0].msg),
    'a payoff must not call the loot it just collected "out of reach"');
  T.controller.stance = 'BALANCED';
});

// ---- (2b) legibility through the real input path ----------------------------
S.check('cycling the dial through the real key path announces the meaning', () => {
  quietArena();
  state.toasts.length = 0;
  T.controller.stance = 'BALANCED';
  key('keydown', { key: 'g', repeat: false, preventDefault() {} });
  assert.notEqual(T.controller.stance, 'BALANCED', 'the lever moved');
  const line = state.toasts.map(t => t.msg).find(m => /^STANCE /.test(m));
  assert.ok(line, 'a stance toast was pushed (' + state.toasts.map(t => t.msg).join(' | ') + ')');
  const tag = C.AUTOPILOT.STANCES[T.controller.stance].TAG;
  assert.ok(line.includes(tag), 'the toast names the new meaning (' + line + ')');
  assert.ok(/loot x/.test(line) && /flee x/.test(line), 'and the two real consequences');
});

S.check('the published HUD state carries the stance and its live activity', () => {
  quietArena();
  T.controller.stance = 'GREEDY';
  state.enemies.length = 0;
  state.gems.length = 0;
  pump(1);
  assert.equal(state.stance, 'GREEDY', 'state.stance published');
  assert.ok(['FLEE', 'LOOT', 'PATROL'].includes(state.stanceAct),
    'state.stanceAct published (' + state.stanceAct + ')');
});

S.done();
