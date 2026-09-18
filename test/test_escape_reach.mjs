// HORDES — THE REACH-ROUTE BYPASS (owner restatement 2026-09-18: "the boss
// reaching to grab the pilot and the pilot being able to run past. Has to
// look convincing"). The floating-slab detour was the FALLBACK shape and is
// superseded (the physics supports the run-past, so the slabs are gone; the
// record lives in docs/art/escape-bypass-2026-09-18/). The behaviour pins,
// all against the REAL modules — one per acceptance criterion:
//   1. the finale is ONE whole floor: the run-past IS the route, no jump
//      authored (required jump distance 0px), no floats left behind
//   2. CONVINCING, measured (checkReachRoute on every seed): (a) each arm's
//      wind-up tell, (b) each ground tip box reaching INTO the standing
//      pilot's 17px body with the overlap stated, (d) danger only inside
//      extend/hold, (e) the cadence stated per arm
//   3. CONTACT reads as contact: grabbed only in extend/hold, never after
//      the pilot has cleared the band, and the held pin sits INSIDE the
//      closing tip box (not clipped through it)
//   4. DODGE BY TIMING, NOT LUCK: the combined ground-gauntlet safe windows
//      per 2.4s cycle vs the stated 0.40s human reaction budget + the
//      crossing time; and a scripted MANUAL brake-and-go run passes on the
//      floor and completes
//   5. AUTO still completes on the same floor route (the encounter is not
//      retuned for the shape change)
//   6. the freeze rules: no payout, duration, wall or reward constant changed
// Run: node test/test_escape_reach.mjs
import { suite } from './_harness.mjs';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PHYS, THREATS, PACING, WALL, MAP, BAND, PAYOUT_K, PAID_SKIP } from '../src/escape/config.js';
import { generateCorridor, checkReachRoute } from '../src/escape/generator.js';

const S = suite('test_escape_reach');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
const FLOOR = 252, LANE = FLOOR - 70;

// ---------------------------------------------------------------------------
// 1 — the run-past IS the route: one whole floor, nothing else
// ---------------------------------------------------------------------------
S.check('the finale is ONE whole open floor — no floats, no authored jumps (0px vs the 160px reach)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const seg = c.segs.find(s => s.kind === 'boss');
    assert(seg, 'seed ' + seed + ': no boss segment');
    const floors = seg.plats.filter(p => p.y === FLOOR);
    assert(seg.plats.length === 1 && floors.length === 1 && floors[0].w >= 880,
      'seed ' + seed + ': the finale is ONE whole open floor (got ' + seg.plats.length + ' plats)');
    assert(seg.gaps.length === 0 && seg.triggers.length === 0,
      'seed ' + seed + ': the finale adds no gaps and no AUTO bands (the route needs no jump)');
  }
});

// ---------------------------------------------------------------------------
// 2 — CONVINCING, measured: the per-arm table (tell / tip-vs-body / cadence)
// ---------------------------------------------------------------------------
S.check('checkReachRoute: tells, tip-box overlaps and cadence hold on every seed', () => {
  let sample = null;
  for (let seed = 1; seed <= 40; seed++) {
    const seg = generateCorridor(seed).segs.find(s => s.kind === 'boss');
    const r = checkReachRoute(seg);
    if (!sample) sample = r;
    assert(r.ok, 'seed ' + seed + ': checkReachRoute fails ' + JSON.stringify(r.fails));
  }
  console.log('  THE REACH TABLE (rel finale x0, cadence ' + THREATS.GRAB_EVERY + 's per arm):');
  for (const a of sample.arms) {
    console.log('    ' + a.id + ': band [' + a.band[0] + ',' + a.band[1] + '] ' + a.lane + ' lane, tell ' +
      a.tell + 's, danger ' + a.danger + 's, tip at ' + a.tipY + 'px above floor (overlap with the pilot body: ' +
      a.overlapPx + 'px of 17)');
  }
  console.log('    combined ground zone [' + sample.zone[0] + ',' + sample.zone[1] + '] = ' +
    (sample.zone[1] - sample.zone[0]) + 'px, crossing ' + sample.crossT + 's at run speed; safe windows per cycle: ' +
    sample.windows.join('s, ') + 's (best ' + sample.bestWin + 's vs reaction ' + sample.react + 's + crossing)');
});

// ---------------------------------------------------------------------------
// 3 — CONTACT reads as contact (and a cleared pilot is never grabbed late)
// ---------------------------------------------------------------------------
S.check('grabs land only in extend/hold, and the held pilot is pinned INSIDE the tip box', () => {
  // (d) phase gating: for every arm, a pilot standing IN the band is grabbed
  // in extend and in hold — and NEVER in idle, windup or retract.
  for (const g of THREATS.ARMS) {
    for (const phase of ['idle', 'windup', 'extend', 'hold', 'retract']) {
      const sim = createSim(9);
      const arm = sim.boss.arms.find(a => a.id === g.id);
      arm.phase = phase; arm.t = 0;
      sim.player.x = sim.boss.x - arm.reach;      // dead centre of the band
      sim.player.y = arm.high ? FLOOR - 80 : FLOOR;   // in the arm's own lane
      step(sim, 1 / 60, { moveX: 0 });
      const should = phase === 'extend' || phase === 'hold';
      assert(!!sim.grabbed === should,
        g.id + ' in ' + phase + ': grabbed=' + !!sim.grabbed + ' (contact exists ONLY in extend/hold)');
      if (sim.grabbed) {
        // (c) the pin: the pilot's body sits INSIDE the closing tip box
        // (the held beat applies the pin on its first step).
        step(sim, 1 / 60, { moveX: 0 });
        const tipY = FLOOR - arm.tipY;            // the tip's centre height
        assert(Math.abs(sim.player.x - (sim.boss.x - arm.reach + 4)) <= 1,
          g.id + ': the pin x is not at the tip');
        assert(sim.player.y - 17 <= tipY + 8 && sim.player.y >= tipY - 9,
          g.id + ': pin y ' + sim.player.y + ' sits outside the tip box [' + (tipY - 9) + ',' + (tipY + 8) + ']');
      }
    }
  }
  // (d) the clean miss: a pilot who has CLEARED the band before the close is
  // never grabbed — not even mid-hold (no late grabs, no invisible hitboxes).
  const sim = createSim(9);
  const claw = sim.boss.arms.find(a => a.id === 'claw');
  claw.phase = 'windup'; claw.t = 0;              // the close is coming
  sim.player.x = sim.boss.x - claw.reach + claw.r + 30;   // clearly past the band
  for (let i = 0; i < 60 * (claw.windup + claw.extend + claw.hold + 0.1) && !sim.outcome; i++) step(sim, 1 / 60, { moveX: 0 });
  assert(!sim.grabbed && !sim.outcome, 'the claw grabbed a pilot 30px CLEAR of its band');
});

// ---------------------------------------------------------------------------
// 4 — DODGE BY TIMING: the windows vs the reaction budget + a manual pass
// ---------------------------------------------------------------------------
// The scripted MANUAL controller (the "player who watched it once"): AUTO
// rides the approach; at the finale the pilot BRAKES outside the combined
// ground zone until dead reckoning says the crossing is clear (the same
// two-way interval test auto.js runs), then holds RUN RIGHT through. No
// jumps, no dashes in the zone — the honest timing route.
function reachRun(seed) {
  const sim = createSim(seed);
  const x0 = sim.corridor.bossSegX0, bossX = sim.corridor.bossX;
  const ground = sim.boss.arms.filter(a => !a.high);
  const cyc = THREATS.GRAB_EVERY;
  function armDanger(g) {          // [s, e] seconds from NOW until the arm's band is safe to be in
    const danger = g.extend + g.hold;
    const idle = cyc - (g.windup + g.extend + g.hold + g.retract);
    let s, e;
    if (g.phase === 'idle') { s = (idle - g.t) + g.windup; e = s + danger; }
    else if (g.phase === 'windup') { s = g.windup - g.t; e = s + danger; }
    else if (g.phase === 'extend') { s = 0; e = (g.extend - g.t) + g.hold; }
    else if (g.phase === 'hold') { s = 0; e = g.hold - g.t; }
    else { s = (g.retract - g.t) + idle + g.windup; e = s + danger; }
    return [[s, e], [s + cyc, e + cyc]];
  }
  const zoneL = Math.min(...ground.map(a => bossX - a.reach - a.r));
  const zoneR = Math.max(...ground.map(a => bossX - a.reach + a.r));
  let waited = 0, finT0 = null;
  for (let i = 0; i < 60 * 150 && !sim.outcome; i++) {
    const p = sim.player;
    if (p.x < x0 + 10) { step(sim, 1 / 60, inputFor(sim)); continue; }
    if (finT0 === null) finT0 = sim.t;
    let moveX = 1;
    if (p.x < zoneR + 26) {        // not yet through: brake unless the whole crossing is clear
      const tToZone = Math.max(0, (zoneL - 6 - p.x) / PHYS.RUN_SPEED);
      const tToClear = Math.max(0, (zoneR + 26 - p.x) / PHYS.RUN_SPEED);
      const unsafe = ground.some(g => armDanger(g).some(([is, ie]) => is < tToClear + 0.12 && ie > tToZone - 0.12));
      if (unsafe && p.x < zoneL - 6) { moveX = 0; waited++; }
    }
    step(sim, 1 / 60, { moveX });
  }
  return { sim, finSecs: finT0 === null ? null : sim.t - finT0, waited };
}
S.check('a scripted MANUAL brake-and-go run passes the boss ON THE FLOOR and completes', () => {
  for (const seed of [2, 4, 7, 9, 12, 21]) {
    const { sim, finSecs } = reachRun(seed);
    assert(sim.outcome === 'complete',
      'seed ' + seed + ': the timing route finished "' + sim.outcome + '" at x=' + Math.round(sim.player.x));
    assert(finSecs !== null && finSecs < 12, 'seed ' + seed + ': finale crossing ' + finSecs + 's (stalled?)');
  }
  const rr = reachRun(9);
  const g = createSim(9);
  let n = 0, fin0 = null;
  while (!g.outcome && n < 60 * 150) {
    if (g.player.x >= g.corridor.bossSegX0 && fin0 === null) fin0 = g.t;
    step(g, 1 / 60, inputFor(g)); n++;
  }
  assert(g.outcome === 'complete' && fin0 !== null);
  console.log('  MEASURED finale crossing (seed 9): manual timing route ' + rr.finSecs.toFixed(1) +
    's (brake frames ' + rr.waited + ') vs auto ground gauntlet ' + (g.t - fin0).toFixed(1) +
    's — same route, same clock');
});

// ---------------------------------------------------------------------------
// 5 — AUTO still completes on the same floor route
// ---------------------------------------------------------------------------
S.check('AUTO still completes on the ground route (the shape change retuned nothing)', () => {
  for (const seed of [4, 9, 21]) {
    const sim = createSim(seed);
    let n = 0;
    while (!sim.outcome && n < 60 * 150) { step(sim, 1 / 60, inputFor(sim)); n++; }
    assert(sim.outcome === 'complete', 'seed ' + seed + ': auto finished "' + sim.outcome + '"');
  }
});

// ---------------------------------------------------------------------------
// 6 — the freeze rules: nothing outside the finale geometry changed
// ---------------------------------------------------------------------------
S.check('no payout, duration, wall or reward constant changed (the owner-freeze pins)', () => {
  assert(PAYOUT_K === 1 / 15, 'PAYOUT_K is ' + PAYOUT_K + ' (the 2026-09-17 value is 1/15)');
  assert(PACING.MIN_SECONDS === 30 && PACING.MAX_SECONDS === 36, 'the duration bounds moved');
  assert(PACING.NOMINAL_SPEED === 200, 'NOMINAL_SPEED moved');
  assert(WALL.V0 === 190 && WALL.V3 === 212 && WALL.START_GAP === 300 && WALL.WIDTH === 46, 'the wall moved');
  assert(MAP.UNITS_X === 3 && MAP.UNITS_Y === 3 && MAP.UNIT_W === 3000, 'the map extent moved');
  assert(BAND.FLOOR_Y === 252 && BAND.KILL_Y === 400, 'the band moved');
  assert(PAID_SKIP.PRICE === 100000 && PAID_SKIP.SHOP_ID === 'escapeskip', 'the paid skip moved');
  assert(THREATS.GRAB_EVERY === 2.4 && THREATS.ARMS.length === 3 &&
    THREATS.ARMS[0].reach === 132 && THREATS.ARMS[1].reach === 96 && THREATS.ARMS[2].reach === 150,
    'the boss arms moved (the reach route must not retune the encounter)');
  // The reach route's OWN new row, pinned: the tips stay inside the bodies
  // they claim to hold (torso / air-lane / ankles) — the convincing rule.
  assert(THREATS.ARMS[0].tipY === 14 && THREATS.ARMS[1].tipY === 76 && THREATS.ARMS[2].tipY === 6,
    'a tipY moved off the pilot body (the grab would stop short or swing past)');
});

S.done();
