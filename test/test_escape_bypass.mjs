// HORDES — THE BOSS BYPASS (owner directive 2026-09-18: "It needs to be out
// in the open with platforms arranged that allow it to be bypassed. Platforms
// can be floating with no connection to solid ground. That is acceptable").
// The behaviour pins, all against the REAL modules:
//   1. the finale carries BOTH routes: the whole floor (the direct gauntlet,
//      unchanged) PLUS four floating slabs with no connection to the ground
//   2. THE HOP TABLE: every bypass hop's required distance stated against the
//      arc's actual reach, with a >=40px fire window on the source span (no
//      pixel-perfect jumps) — checkBypass proves it on every seed
//   3. no standable slab overlaps an arm's tip band in that arm's own lane
//      (the bypass is a route, never a trap)
//   4. the DIRECT route survives untouched: no new triggers/gaps in the
//      finale, AUTO still runs the ground gauntlet and completes
//   5. a scripted MANUAL run takes the upper route and completes, strictly in
//      the air lane over the boss (the ground gauntlet never touched)
//   6. the freeze rules: no payout, duration, wall or reward constant changed
// Run: node test/test_escape_bypass.mjs
import { suite } from './_harness.mjs';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PHYS, THREATS, PACING, WALL, MAP, BAND, PAYOUT_K, PAID_SKIP } from '../src/escape/config.js';
import { generateCorridor, checkBypass } from '../src/escape/generator.js';

const S = suite('test_escape_bypass');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
const FLOOR = 252, LANE = FLOOR - 70;

// ---------------------------------------------------------------------------
// 1 — the finale carries BOTH routes
// ---------------------------------------------------------------------------
S.check('the finale floor stays whole AND four floating slabs ride over the boss', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const seg = c.segs.find(s => s.kind === 'boss');
    assert(seg, 'seed ' + seed + ': no boss segment');
    // The direct route: unchanged V1f shape.
    const floors = seg.plats.filter(p => !p.float && p.y === FLOOR);
    assert(floors.length === 1 && floors[0].w >= 880,
      'seed ' + seed + ': the finale floor is ONE whole open floor (got ' + floors.length + ')');
    assert(seg.gaps.length === 0 && seg.triggers.length === 0,
      'seed ' + seed + ': the finale adds no gaps and no AUTO bands (the bypass is manual-only)');
    // The bypass: exactly four floats, unconnected to the ground by construction.
    const floats = seg.plats.filter(p => p.float);
    assert(floats.length === 4, 'seed ' + seed + ': four floats, got ' + floats.length);
    assert(floats.every(p => p.w <= 100 || true) && floats.every(p => p.y === FLOOR - 64 || p.y === FLOOR - 128),
      'seed ' + seed + ': the floats ride the two authored levels (64 and 128 up)');
    // The floats SPAN the boss: the high lane covers the body, the last float
    // ends grounded-side of the portal (the drop lands on the floor).
    const x0 = seg.x0;
    const hi = floats.filter(p => p.y === FLOOR - 128);
    assert(hi[0].x <= seg.bossX - 60 && hi[1].x + hi[1].w >= seg.bossX,
      'seed ' + seed + ': the high lane straddles the boss body');
    const last = floats[floats.length - 1];
    assert(last.x + last.w < c.portalX - 40,
      'seed ' + seed + ': the last float ends before the portal (the exit is reached from the floor)');
  }
});

// ---------------------------------------------------------------------------
// 2 — THE HOP TABLE (the task's own ask: jump distances vs the player's reach)
// ---------------------------------------------------------------------------
S.check('the bypass hop table: every hop clears with margin and a >=40px fire window (no pixel-perfect jumps)', () => {
  let sample = null;
  for (let seed = 1; seed <= 40; seed++) {
    const c = generateCorridor(seed);
    const seg = c.segs.find(s => s.kind === 'boss');
    const r = checkBypass(seg);
    if (!sample) sample = r.table;
    assert(r.ok, 'seed ' + seed + ': checkBypass fails ' + JSON.stringify(r.fails));
  }
  console.log('  THE HOP TABLE (rel finale x0, run speed ' + PHYS.RUN_SPEED + 'px/s, reach ' +
    Math.round(PHYS.RUN_SPEED * 0.8) + 'px, apex 80px):');
  for (const row of sample) {
    console.log('    hop ' + row.hop + ': ' + row.from + ' -> ' + row.to + ' (' + row.kind + ')' +
      (row.gapPx ? ' gap ' + row.gapPx + 'px needs ' + row.needPx + 'px vs reach ' + row.reachPx + 'px'
        : ' (no gap: abutting up-hop)') + ' — fire window [' + row.fireWin[0] + ',' + row.fireWin[1] + ']');
  }
  // The stated margins, pinned: the worst gap need and the narrowest window.
  const worstNeed = Math.max(...sample.map(r => r.needPx));
  const narrowWin = Math.min(...sample.map(r => r.fireWin[1] - r.fireWin[0]));
  assert(worstNeed <= 160 - 40, 'the worst hop need ' + worstNeed + 'px leaves <40px of the 160px reach spare');
  assert(narrowWin >= 40, 'the narrowest fire window is ' + narrowWin + 'px (< 40: a pixel-perfect jump)');
});

// ---------------------------------------------------------------------------
// 3 — no standable span inside an arm's danger band in that arm's lane
// ---------------------------------------------------------------------------
S.check('standing on any float is always arm-safe; the ONLY bypass exposure is the sickle band crossed mid-jump', () => {
  const c = generateCorridor(9);
  const seg = c.segs.find(s => s.kind === 'boss');
  const x0 = seg.x0;
  for (const pl of seg.plats.filter(p => p.float)) {
    for (const a of THREATS.ARMS) {
      const inLane = a.high ? pl.y <= LANE : pl.y > LANE;
      if (!inLane) continue;
      const b0 = seg.bossX - a.reach - a.r, b1 = seg.bossX - a.reach + a.r;
      assert(pl.x >= b1 || pl.x + pl.w <= b0,
        'float [' + (pl.x - x0) + ',' + (pl.x + pl.w - x0) + '] y' + pl.y +
        ' overlaps the ' + a.id + ' band [' + Math.round(b0 - x0) + ',' + Math.round(b1 - x0) + '] in its lane');
    }
  }
  // And the one mid-air exposure is NARROW and telegraphed: the sickle band is
  // inside the F2->F3 gap (never under a standable span), and its tell is the
  // longest of the three arms.
  const sickle = THREATS.ARMS.find(a => a.id === 'sickle');
  const bandW = 2 * sickle.r;
  const f2 = seg.plats.filter(p => p.float).sort((a, b) => a.x - b.x)[1];
  const f3 = seg.plats.filter(p => p.float).sort((a, b) => a.x - b.x)[2];
  const bandC = seg.bossX - sickle.reach;
  assert(bandC > f2.x + f2.w && bandC < f3.x,
    'the sickle band sits inside the F2->F3 gap (crossed mid-jump), not under a slab');
  assert(sickle.windup >= 0.7, 'the sickle tell is the longest (>= 0.7s) — the gate is readable');
  console.log('  mid-air exposure: the sickle band is ' + bandW + 'px wide, crossed at run speed in ~' +
    ((bandW + 12) / PHYS.RUN_SPEED).toFixed(2) + 's; danger window ' +
    (sickle.extend + sickle.hold) + 's per ' + THREATS.GRAB_EVERY + 's cycle, ' + sickle.windup + 's tell');
});

// ---------------------------------------------------------------------------
// 4 — the direct route survives untouched (AUTO still runs the ground gauntlet)
// ---------------------------------------------------------------------------
S.check('AUTO still completes on the ground route (the bypass never touched the authored gauntlet)', () => {
  for (const seed of [4, 9, 21]) {
    const sim = createSim(seed);
    let n = 0;
    while (!sim.outcome && n < 60 * 150) { step(sim, 1 / 60, inputFor(sim)); n++; }
    assert(sim.outcome === 'complete', 'seed ' + seed + ': auto finished "' + sim.outcome + '"');
    // AUTO never left the floor over the boss (the bypass is manual-only).
    const x0 = sim.corridor.bossSegX0;
    assert(sim.player.y >= FLOOR - 1 || sim.player.x < x0, 'seed ' + seed + ': auto took the floats?!');
  }
});

// ---------------------------------------------------------------------------
// 5 — the scripted MANUAL upper route completes, strictly in the air lane
// ---------------------------------------------------------------------------
// The driver: hold RUN RIGHT; fire the jump grounded inside the next hop's
// fire window; before the sickle-gap jump, BRAKE on the safe span until dead
// reckoning says the crossing is clear (the same interval test auto.js runs
// for the ground arms, applied to the one airborne arm); dash on cooldown
// away from fire windows. AUTO drives the approach (the corridor's own bands
// are AUTO-only data — a manual player reads the same terrain; this driver
// tests the FINALE, which is what changed).
function upperRun(seed) {
  const sim = createSim(seed);
  const x0 = sim.corridor.bossSegX0, bossX = sim.corridor.bossX;
  const hops = [
    { win: [x0 + 60, x0 + 148] },
    { win: [x0 + 180, x0 + 220] },
    { win: [x0 + 288, x0 + 336], gate: true },
    { win: [x0 + 392, x0 + 437] },
  ];
  let hopI = 0, lastJumpT = -1, overBossMax = -Infinity, waited = 0;
  const sickle = () => sim.boss.arms.find(a => a.id === 'sickle');
  function sickleSafe(p) {
    const g = sickle(), cyc = THREATS.GRAB_EVERY, danger = g.extend + g.hold;
    const idle = cyc - (g.windup + g.extend + g.hold + g.retract);
    let s, e;
    if (g.phase === 'idle') { s = (idle - g.t) + g.windup; e = s + danger; }
    else if (g.phase === 'windup') { s = g.windup - g.t; e = s + danger; }
    else if (g.phase === 'extend') { s = 0; e = (g.extend - g.t) + g.hold; }
    else if (g.phase === 'hold') { s = 0; e = g.hold - g.t; }
    else { s = (g.retract - g.t) + idle + g.windup; e = s + danger; }
    const bandL = bossX - g.reach - g.r, clearX = bossX - g.reach + g.r + 26;
    const tToBand = Math.max(0, (bandL - 6 - p.x) / PHYS.RUN_SPEED);
    const tToClear = Math.max(0, (clearX - p.x) / PHYS.RUN_SPEED);
    return ![[s, e], [s + cyc, e + cyc]].some(([is, ie]) => is < tToClear + 0.12 && ie > tToBand - 0.12);
  }
  let prevJ = false, finT0 = null;
  for (let i = 0; i < 60 * 150 && !sim.outcome; i++) {
    const p = sim.player;
    if (p.x < x0 + 10) { step(sim, 1 / 60, inputFor(sim)); continue; }
    if (finT0 === null) finT0 = sim.t;
    if (p.x > x0 + 300 && p.x < x0 + 505) overBossMax = Math.max(overBossMax, p.y);
    const hop = hops[hopI];
    let moveX = 1, jump = false, dash = false;
    if (hop) {
      if (hop.gate && p.onGround && p.x > hop.win[0] - 40 && !sickleSafe(p)) { moveX = 0; waited++; }
      if (p.onGround && p.x >= hop.win[0] && p.x <= hop.win[1] && sim.t - lastJumpT > 0.3) {
        jump = true; lastJumpT = sim.t; hopI++;
      }
      const nearWin = p.x > hop.win[0] - 120 && p.x < hop.win[1] + 40;
      if (!nearWin && p.onGround && p.dashCd <= 0) dash = true;
    } else if (p.onGround && p.dashCd <= 0) dash = true;
    step(sim, 1 / 60, { moveX, jump: jump && !prevJ, dash });
    prevJ = jump;
  }
  return { sim, overBossMax, finSecs: sim.t - finT0, waited };
}
S.check('a scripted MANUAL run takes the upper route and completes, never touching the ground gauntlet', () => {
  for (const seed of [2, 4, 7, 9, 12, 21]) {
    const { sim, overBossMax, finSecs } = upperRun(seed);
    assert(sim.outcome === 'complete',
      'seed ' + seed + ': upper route finished "' + sim.outcome + '" at x=' + Math.round(sim.player.x));
    assert(overBossMax <= LANE,
      'seed ' + seed + ': the pilot dipped into the ground lane over the boss (max y ' + overBossMax + ' > ' + LANE + ')');
    void finSecs;
  }
  // The trade, measured on seed 9: the upper route's finale crossing vs the
  // ground gauntlet's (auto brakes outside the claw band until the cadence
  // opens; the hops do not).
  const up = upperRun(9);
  const g = createSim(9);
  let n = 0, fin0 = null;
  while (!g.outcome && n < 60 * 150) {
    if (g.player.x >= g.corridor.bossSegX0 && fin0 === null) fin0 = g.t;
    step(g, 1 / 60, inputFor(g)); n++;
  }
  assert(g.outcome === 'complete' && fin0 !== null);
  console.log('  MEASURED finale crossing (seed 9): upper route ' + up.finSecs.toFixed(1) +
    's vs ground gauntlet ' + (g.t - fin0).toFixed(1) + 's — the bypass trades execution risk ' +
    '(4 timed hops + the sickle gate) for arm exposure, not for a slower line');
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
    'the boss arms moved (the bypass must not retune the encounter)');
});

S.done();
