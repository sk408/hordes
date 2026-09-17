// HORDES — VK9P4 THE ESCAPE: BOSS APPENDAGES, REACH VISIBILITY, PURSUER
// ELIMINATION, JUMP BUTTON, LIVE MODE TOGGLE (owner 2026-09-17). The
// behaviour pins for every ask, all driving the REAL modules (config/sim/
// auto/render/index — never copies):
//   1. THREE staggered appendages on ONE learnable cadence; distinct ids;
//      the claw row IS the historical GRAB_* definition (getters, one source)
//   2. the reach bound, as a NUMBER: every arm inside the viewport-derived
//      visibility bound (full body on screen at the farthest reaction edge)
//   3. the combined ground window: the two ground arms are NEVER dangerous
//      simultaneously; the clear window is >= 0.5s (stated in config.js)
//   4. per-arm contact counter-cases (each arm has a real hitbox in ITS lane
//      ONLY — the sickle is airborne-only, the ground arms floor-only)
//   5. THE KICK: bounded, manual-only, suppresses the horde floor (never an
//      off switch — the wall never pauses), refills after the window
//   6. the JUMP button: the manual pads are real hit-testable rects and the
//      manual jump is the SAME physics (PHYS.JUMP_VY/GRAVITY) as the auto arc
//   7. the LIVE MODE TOGGLE: one source of truth (the getter main hands in),
//      a flip mid-run keeps the sim (no lost progress), fires exactly once
//      per press, and the escape can never be stuck in neither mode
// Run: node test/test_vk9p4_escape.mjs
import { suite } from './_harness.mjs';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PHYS, THREATS, WALL } from '../src/escape/config.js';
import { VIEW_W } from '../src/escape/config.js';
import * as ESCAPE from '../src/escape/index.js';
import { jumpHit, kickHit, modeHit, skipHit,
  JUMP_RECT, KICK_RECT, MODE_RECT, SKIP_RECT } from '../src/escape/render.js';

const S = suite('test_vk9p4_escape');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
const FLOOR = 252;   // BAND.FLOOR_Y (imported indirectly via sim behaviour; pinned here)

// A quiet sim: no wall pressure, no pursuers, no gun — the arm machines in
// isolation (the state machines run inside step() regardless of threats).
function quietSim(seed = 9) {
  const sim = createSim(seed);
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0;
  sim.nextShot = Infinity; sim.nextFlier = Infinity;
  return sim;
}

// ---------------------------------------------------------------------------
// 1 — THE ARMS TABLE: three staggered appendages, one cadence, one claw def
// ---------------------------------------------------------------------------
S.check('three appendages with distinct ids/silhouettes; the claw row IS the GRAB_* definition', () => {
  assert(THREATS.ARMS.length === 3, 'three arms, got ' + THREATS.ARMS.length);
  const ids = THREATS.ARMS.map(a => a.id);
  assert(new Set(ids).size === 3, 'distinct ids: ' + ids.join(','));
  assert(THREATS.ARMS[0].id === 'claw', 'row 0 is the claw (the getters read it)');
  assert(THREATS.GRAB_REACH === THREATS.ARMS[0].reach, 'GRAB_REACH reads ARMS[0]');
  assert(THREATS.GRAB_WINDUP === THREATS.ARMS[0].windup, 'GRAB_WINDUP reads ARMS[0]');
  assert(THREATS.GRAB_R === THREATS.ARMS[0].r, 'GRAB_R reads ARMS[0]');
  assert(THREATS.GRAB_WINDUP >= 0.45, 'the claw tell stays readable (>= 0.45s)');
  const offsets = THREATS.ARMS.map(a => a.offset);
  assert(new Set(offsets).size === 3, 'the offsets stagger (no two arms share one)');
});
S.check('every arm cycles on EXACTLY the learnable GRAB_EVERY cadence (measured per arm)', () => {
  for (const arm of THREATS.ARMS) {
    const sim = quietSim(9);
    const b = sim.boss;
    const g = b.arms.find(a => a.id === arm.id);
    // Walk to the arm's first windup, then measure windup-to-windup twice.
    let last = -1, starts = [];
    for (let i = 0; i < 60 * 20 && starts.length < 3; i++) {
      step(sim, 1 / 60, { moveX: 0 });
      if (g.phase === 'windup' && last !== 'windup') starts.push(sim.t);
      last = g.phase;
    }
    assert(starts.length === 3, arm.id + ': three windups observed');
    const cyc1 = starts[1] - starts[0], cyc2 = starts[2] - starts[1];
    assert(Math.abs(cyc1 - THREATS.GRAB_EVERY) < 0.1 && Math.abs(cyc2 - THREATS.GRAB_EVERY) < 0.1,
      arm.id + ' cadence ' + cyc1.toFixed(2) + '/' + cyc2.toFixed(2) +
      's (want ' + THREATS.GRAB_EVERY + ')');
  }
});

// ---------------------------------------------------------------------------
// 2 — THE REACH BOUND (the owner's "see the boss to react to it", a number)
// ---------------------------------------------------------------------------
S.check('every arm is inside the viewport-derived reach bound (full body on screen)', () => {
  // render.js CAM_LEAD 150, VIEW_W 480: the camera shows [p.x-150, p.x+330].
  // Reacting at the FARTHEST band edge (p.x = b.x - reach - r - 6, the auto
  // brake point) keeps the boss's FULL body on screen while
  //   reach + r + 6 + 150 + BOSS_W/2 <= 480   (reach <= 272)
  // and any part of it while reach <= 372. The derivation is disclosed in
  // config.js; the letterbox CONTAIN fit means BOTH phone sizes show the
  // identical 480-virtual width, so the bound is viewport-independent (the
  // browser verifier measures it live at 390x844 AND 320x568 anyway).
  const FULL = VIEW_W - 150 - THREATS.BOSS_W / 2 - 6;
  const ANY = VIEW_W - 150 + THREATS.BOSS_W / 2;
  for (const a of THREATS.ARMS) {
    assert(a.reach + a.r <= FULL,
      a.id + ' reach ' + (a.reach + a.r) + ' exceeds the full-body bound ' + FULL);
    assert(a.reach <= ANY, a.id + ' reach ' + a.reach + ' exceeds the any-part bound ' + ANY);
  }
  assert(THREATS.GRAB_REACH < 150, 'the claw was SHORTENED per the owner ask (was 150)');
  assert(THREATS.GRAB_WINDUP > 0.5, 'and its tell LENGTHENED with it (was 0.50)');
});

// ---------------------------------------------------------------------------
// 3 — THE COMBINED GROUND WINDOW (stated, config.js): never simultaneous
// ---------------------------------------------------------------------------
S.check('the two ground arms are NEVER dangerous simultaneously; the clear window is real', () => {
  // Dead-reckon each arm's danger interval over one shared cycle from a
  // common t=0 (the arm's windup begins at offset + idleDur; danger is
  // extend+hold long, ending retract).
  const cyc = THREATS.GRAB_EVERY;
  const grounds = THREATS.ARMS.filter(a => !a.high);
  assert(grounds.length === 2, 'exactly two ground arms (the third is airborne-only)');
  const ivs = grounds.map(a => {
    const idle = cyc - (a.windup + a.extend + a.hold + a.retract);
    const s = a.offset + idle + a.windup;
    return [s, s + a.extend + a.hold];
  }).sort((x, y) => x[0] - y[0]);
  assert(ivs[1][0] >= ivs[0][1], 'ground danger intervals overlap: ' + JSON.stringify(ivs));
  const clear = ivs[1][0] - ivs[0][1];
  assert(clear >= 0.5, 'the ground clear window is only ' + clear.toFixed(2) + 's (want >= 0.5)');
  // And the grounded crossing itself is short against that window: the whole
  // ground band is crossed at run speed in well under the clear time.
  const span = Math.max(...grounds.map(a => b_xmax(a))) - Math.min(...grounds.map(a => b_xmin(a)));
  const crossS = (span + 40) / PHYS.RUN_SPEED;
  assert(crossS < clear, 'crossing ' + crossS.toFixed(2) + 's does not fit the clear window ' +
    clear.toFixed(2) + 's');
  function b_xmin(a) { return -a.reach - a.r; }
  function b_xmax(a) { return -a.reach + a.r; }
  console.log('  MEASURED VK9P4 combined window: grounds dangerous ' +
    JSON.stringify(ivs.map(v => v.map(n => +n.toFixed(2)))) +
    ', clear ' + clear.toFixed(2) + 's, crossing ~' + crossS.toFixed(2) + 's');
});

// ---------------------------------------------------------------------------
// 4 — PER-ARM CONTACT COUNTER-CASES (a real hitbox in ITS lane only)
// ---------------------------------------------------------------------------
function armCase(armId, airborne, expectGrabbed) {
  const sim = quietSim(9);
  const g = sim.boss.arms.find(a => a.id === armId);
  // Park the pilot dead-centre in the arm's band, in the arm's lane.
  sim.player.x = sim.boss.x - g.reach;
  sim.player.y = airborne ? FLOOR - 100 : FLOOR;
  sim.player.onGround = !airborne; sim.player.vy = 0; sim.player.vx = 0;
  g.phase = 'windup'; g.t = g.windup - 1 / 60;      // closes next frame
  step(sim, 1 / 60, { moveX: 0 });
  return sim;
}
S.check('the CLAW (ground) grabs a pilot on the floor in its band', () => {
  const sim = armCase('claw', false, true);
  assert(sim.grabbed && sim.grabbed.arm === 'claw', 'the claw closed on the grounded pilot');
  assert(!sim.outcome, 'the HELD beat precedes the outcome');
});
S.check('the SICKLE (air) grabs ONLY an airborne pilot — the floor under it is safe', () => {
  const air = armCase('sickle', true, true);
  assert(air.grabbed && air.grabbed.arm === 'sickle', 'the sickle caught the airborne pilot');
  const floor = armCase('sickle', false, false);
  assert(!floor.grabbed && !floor.outcome,
    'the sickle touched a pilot standing on the floor (lane leak)');
});
S.check('the TENDRIL (ground) grabs a pilot on the floor in its band', () => {
  const sim = armCase('tendril', false, true);
  assert(sim.grabbed && sim.grabbed.arm === 'tendril', 'the tendril caught the grounded pilot');
});
S.check('an airborne pilot is safe in the GROUND arms\' bands (the lanes are disjoint)', () => {
  const sim = armCase('tendril', true, false);
  assert(!sim.grabbed && !sim.outcome, 'a ground arm touched an airborne pilot (lane leak)');
});

// ---------------------------------------------------------------------------
// 5 — THE KICK: bounded, manual-only, floor suppression, refill
// ---------------------------------------------------------------------------
function kickSim() {
  const sim = quietSim(7);
  sim.tailT = 0; sim.kickCd = 0;
  return sim;
}
S.check('a kick clears the pack within KICK_RANGE behind the runner — and ONLY there', () => {
  const sim = kickSim();
  const p = sim.player;
  sim.pursuers.push(
    { x: p.x - 40, y: FLOOR, hp: 1, state: 'matched', matchT: 1 },   // in range
    { x: p.x - 90, y: FLOOR, hp: 1, state: 'matched', matchT: 1 },   // in range (edge)
    { x: p.x - THREATS.KICK_RANGE - 30, y: FLOOR, hp: 1, state: 'charge', matchT: 0 },  // beyond
    { x: p.x + 60, y: FLOOR, hp: 1, state: 'charge', matchT: 0 });   // AHEAD (never kicked)
  step(sim, 1 / 60, { moveX: 0, kick: true });
  assert(sim.kickedPursuers === 2, 'killed ' + sim.kickedPursuers + ' (want the 2 in range)');
  assert(sim.pursuers.length === 2, 'the beyond-range and ahead bodies survive');
  assert(sim.kickCd === THREATS.KICK_CD, 'the cooldown armed');
  assert(sim.tailT === THREATS.KICK_SUPPRESS, 'the suppression window armed');
  assert(sim.events.some(e => e.type === 'kill'),
    'the kicked bodies leave kill events (the burst fx reads them)');
});
S.check('the horde floor does NOT refill while the suppression window runs, then does', () => {
  const sim = kickSim();
  step(sim, 1 / 60, { moveX: 0, kick: true });
  assert(sim.pursuers.length === 0, 'the tail is clear');
  // Hold still (moveX 0) through the window: the floor must stay empty. The
  // refill lands on the step where tailT REACHES 0 (it decrements before
  // maintainFloor runs), so the emptiness window is (0, KICK_SUPPRESS].
  let n = 0;
  while (sim.tailT > 1 / 60 && n < 60 * (THREATS.KICK_SUPPRESS + 1)) { step(sim, 1 / 60, { moveX: 0 }); n++; }
  assert(sim.tailT > 0 && sim.pursuers.length === 0,
    'the floor refilled inside the suppression window (tailT=' + sim.tailT + ')');
  // Step to exhaustion and one past it: the floor refills to CHASER_FLOOR.
  while (sim.tailT > 0) step(sim, 1 / 60, { moveX: 0 });
  step(sim, 1 / 60, { moveX: 0 });
  assert(sim.pursuers.length >= THREATS.CHASER_FLOOR,
    'after the window the horde returns (got ' + sim.pursuers.length + ')');
  console.log('  MEASURED VK9P4 kick: clear ' + THREATS.KICK_SUPPRESS +
    's, cooldown ' + THREATS.KICK_CD + 's, refill the step after');
});
S.check('the cooldown BOUNDS the kick: a second press inside KICK_CD does nothing', () => {
  const sim = kickSim();
  sim.pursuers.push({ x: sim.player.x - 40, y: FLOOR, hp: 1, state: 'matched', matchT: 1 });
  step(sim, 1 / 60, { moveX: 0, kick: true });
  assert(sim.kickedPursuers === 1 && sim.pursuers.length === 0, 'first kick cleared');
  sim.pursuers.push({ x: sim.player.x - 40, y: FLOOR, hp: 1, state: 'matched', matchT: 1 });
  let n = 0;
  while (sim.kickCd > 1 && n < 60 * THREATS.KICK_CD) { step(sim, 1 / 60, { moveX: 0 }); n++; }
  step(sim, 1 / 60, { moveX: 0, kick: true });     // still ~1s of cooldown left
  assert(sim.kickedPursuers === 1, 'the cooldown ate the second kick');
  assert(sim.pursuers.length === 1 || sim.pursuers.every(pu => pu.hp > 0), 'no bodies died');
});
S.check('AUTO never kicks (the auto path is byte-identical: no input.kick, no ledger entry)', () => {
  const sim = createSim(3);
  let guard = 0;
  while (!sim.outcome && guard++ < 60 * 60) {
    const input = inputFor(sim);
    assert(!('kick' in input) || !input.kick, 'inputFor set kick on the auto path');
    step(sim, 1 / 60, input);
  }
  assert(sim.outcome === 'complete', 'auto still completes (got ' + sim.outcome + ')');
  assert(sim.kickedPursuers === 0, 'the auto run kicked ' + sim.kickedPursuers + ' pursuers');
});
S.check('the WALL never pauses for the kick (the timer is the wall, and it runs)', () => {
  const sim = kickSim();
  const w0 = sim.wall.x;
  step(sim, 1 / 60, { moveX: 0, kick: true });
  const w1 = sim.wall.x;
  assert(w1 > w0, 'the wall advanced through the kick (' + (w1 - w0).toFixed(2) + 'px)');
});

// ---------------------------------------------------------------------------
// 6 — THE JUMP BUTTON: real rects, and the SAME physics as the auto arc
// ---------------------------------------------------------------------------
S.check('the touch pads are real, disjoint, on-viewport rects with hit tests', () => {
  const rects = [SKIP_RECT, MODE_RECT, JUMP_RECT, KICK_RECT];
  const names = ['SKIP', 'MODE', 'JUMP', 'KICK'];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= VIEW_W && r.y + r.h <= 300,
      names[i] + ' is off-viewport: ' + JSON.stringify(r));
    for (let j = i + 1; j < rects.length; j++) {
      const o = rects[j];
      const overlap = r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
      assert(!overlap, names[i] + ' overlaps ' + names[j]);
    }
  }
  assert(jumpHit(JUMP_RECT.x + 5, JUMP_RECT.y + 5) && !jumpHit(0, 0), 'jumpHit');
  assert(kickHit(KICK_RECT.x + 5, KICK_RECT.y + 5) && !kickHit(0, 0), 'kickHit');
  assert(modeHit(MODE_RECT.x + 5, MODE_RECT.y + 5) && !modeHit(0, 0), 'modeHit');
  assert(skipHit(SKIP_RECT.x + 5, SKIP_RECT.y + 5), 'skipHit unchanged');
  // Right-thumb standard: the JUMP pad sits in the lower-right quadrant.
  assert(JUMP_RECT.x + JUMP_RECT.w / 2 > VIEW_W * 0.7 && JUMP_RECT.y + JUMP_RECT.h / 2 > 150,
    'the JUMP pad is not in the right-thumb zone');
});
S.check('the manual jump is the SAME physics as the auto arc (PHYS, one definition)', () => {
  // Drive a manual jump through the real manual path (ESCAPE.begin auto:false
  // + the JUMP pad through pointer), then the same arc by hand off PHYS: the
  // apex height and airtime must match JUMP_VY/GRAVITY exactly.
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  const x0 = sim.player.x;
  // Burn 1s of idle so any spawn-time transients settle, then tap the pad.
  for (let i = 0; i < 60; i++) ESCAPE.frame(null, 1 / 60);
  const y0 = sim.player.y;
  ESCAPE.pointer(JUMP_RECT.x + 10, JUMP_RECT.y + 10);       // the pad
  ESCAPE.frame(null, 1 / 60);                                // consume the tap: the jump leaves NOW
  let apex = y0, air = 0;
  while (!sim.player.onGround && air < 120) { ESCAPE.frame(null, 1 / 60); air++; apex = Math.min(apex, sim.player.y); }
  assert(air > 0, 'the pad tap never left the ground');
  const wantApex = PHYS.JUMP_VY * PHYS.JUMP_VY / (2 * PHYS.GRAVITY);
  // The measured apex is the DISCRETE 60Hz integration of the same constants
  // (semi-implicit Euler under-samples the continuous 80px apex by ~3px — the
  // auto arc rides the IDENTICAL step code, which is the actual parity claim).
  assert(Math.abs((y0 - apex) - wantApex) < 4,
    'manual apex ' + (y0 - apex).toFixed(1) + 'px vs PHYS ' + wantApex + 'px');
  const wantAir = 2 * PHYS.JUMP_VY / PHYS.GRAVITY;
  assert(Math.abs(air / 60 - wantAir) < 0.05,
    'manual airtime ' + (air / 60).toFixed(2) + 's vs PHYS ' + wantAir + 's');
  // A tap ANYWHERE (not on a pad) also jumps — the phone fallback.
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const s2 = ESCAPE.current();
  s2.wall.x = s2.player.x - 5000; s2.pursuers.length = 0; s2.nextShot = Infinity; s2.nextFlier = Infinity;
  for (let i = 0; i < 60; i++) ESCAPE.frame(null, 1 / 60);
  ESCAPE.pointer(100, 100);
  ESCAPE.frame(null, 1 / 60);
  let air2 = 0;
  while (!s2.player.onGround && air2 < 120) { ESCAPE.frame(null, 1 / 60); air2++; }
  assert(air2 > 0, 'a bare tap did not jump');
});

// ---------------------------------------------------------------------------
// 7 — THE LIVE MODE TOGGLE: one source, no lost progress, no double-fire
// ---------------------------------------------------------------------------
S.check('the mode is read LIVE from the one source; a flip keeps the sim (no lost progress)', () => {
  let autoFlag = true;
  let fires = 0;
  ESCAPE.begin({
    seed: 11, auto: true, profile: null, onEnd: null,
    getAuto: () => autoFlag,
    onToggleMode: () => { fires++; autoFlag = !autoFlag; },
  });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  assert(ESCAPE.isAuto() === true, 'the getter is the live source');
  for (let i = 0; i < 90; i++) ESCAPE.frame(null, 1 / 60);   // 1.5s of auto
  const xAuto = sim.player.x, tAuto = sim.t;
  assert(xAuto > 200, 'auto advanced the runner (x=' + xAuto.toFixed(0) + ')');
  // Flip to manual MID-RUN through the MODE rect.
  ESCAPE.pointer(MODE_RECT.x + 10, MODE_RECT.y + 10);
  assert(fires === 1, 'the toggle fired ' + fires + ' times (want exactly 1)');
  assert(ESCAPE.isAuto() === false, 'the flip took effect on the live read');
  assert(sim.player.x === xAuto && sim.t === tAuto,
    'the flip restarted or mutated the sim (lost progress)');
  // Manual frames advance ONLY on manual input now.
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(Math.abs(sim.player.x - xAuto) < 1, 'manual idling MOVED the runner (input leaked)');
  assert(Math.abs(sim.t - tAuto - 0.5) < 0.02, 'the sim clock kept running');
  // And back to auto: same sim, movement resumes.
  ESCAPE.pointer(MODE_RECT.x + 10, MODE_RECT.y + 10);
  assert(fires === 2 && ESCAPE.isAuto() === true, 'the return flip fired once and took');
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.x > xAuto + 50, 'auto did not resume driving the SAME sim');
  assert(ESCAPE.isAuto() === true || ESCAPE.isAuto() === false,
    'isAuto must always answer (never stuck in neither)');
});
S.check('the MODE key path fires the same single callback (keyboard parity)', () => {
  let autoFlag = true, fires = 0;
  ESCAPE.begin({
    seed: 11, auto: true, profile: null, onEnd: null,
    getAuto: () => autoFlag,
    onToggleMode: () => { fires++; autoFlag = !autoFlag; },
  });
  ESCAPE.onKey('o', true);
  assert(fires === 1 && ESCAPE.isAuto() === false, 'the o key toggled once');
  ESCAPE.onKey('m', true);
  assert(fires === 2 && ESCAPE.isAuto() === true, 'the m key toggled back once');
});
S.check('the kick KEY is manual-only (inert on the auto path)', () => {
  let autoFlag = true;
  ESCAPE.begin({
    seed: 11, auto: false, profile: null, onEnd: null,
    getAuto: () => autoFlag, onToggleMode: null,
  });
  const sim = ESCAPE.current();
  sim.pursuers.push({ x: sim.player.x - 40, y: FLOOR, hp: 1, state: 'matched', matchT: 1 });
  ESCAPE.onKey('s', true);                     // pressed while AUTO
  ESCAPE.frame(null, 1 / 60);
  assert(sim.kickedPursuers === 0 && sim.pursuers.some(p => p.hp > 0),
    'the kick key fired on the auto path');
  autoFlag = false;                            // flip to manual
  ESCAPE.frame(null, 1 / 60);                  // the transition frame (drops stale edges by design)
  ESCAPE.onKey('s', true);
  ESCAPE.frame(null, 1 / 60);
  assert(sim.kickedPursuers === 1, 'the same press now kicked (manual authority)');
});

// ---------------------------------------------------------------------------
// 8 — the help probe explains, never activates
// ---------------------------------------------------------------------------
S.check('explain() answers for every pad (and never activates anything)', () => {
  ESCAPE.begin({ seed: 5, auto: true, profile: null, onEnd: null });
  const lines = [
    ESCAPE.explain(SKIP_RECT.x + 5, SKIP_RECT.y + 5),
    ESCAPE.explain(MODE_RECT.x + 5, MODE_RECT.y + 5),
    ESCAPE.explain(JUMP_RECT.x + 5, JUMP_RECT.y + 5),
    ESCAPE.explain(KICK_RECT.x + 5, KICK_RECT.y + 5),
    ESCAPE.explain(100, 100),
  ];
  for (const l of lines) assert(typeof l === 'string' && l.length > 10, 'a help line: ' + l);
  assert(/JUMP/.test(lines[2]) && /KICK/.test(lines[3]), 'the pads name themselves');
  assert(ESCAPE.current().outcome === null, 'explaining skipped/jumped nothing');
});

console.log('test_vk9p4_escape: all checks passed');
process.exit(0);
