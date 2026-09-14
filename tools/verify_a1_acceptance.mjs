// HORDES — A1 ACCEPTANCE MEASUREMENT (the missing acceptance for the Autopilot
// engagement radius, landed in f521bd3, never measured; A2 the radar landed in
// 8ffd895 as its pair). This tool produces NUMBERS, not geometry assertions:
//
//   R5a (headless, real modules): for EACH of the four focus policies, run the
//       REAL AutoPilotController.decide() (src/controllers.js) against an enemy
//       field placed at 60 / 150 / 250 / 320 world px from the player, and
//       report what it actually targets versus which enemy the radar's REAL
//       data layer (radarDots, src/radar.js — the same function render.js
//       paints) shows as the nearest dot for the SAME state (same frame: both
//       reads run on one untouched state object in one tick). The engagement
//       radius is read live from CONFIG.AUTOPILOT.FOCUS_RANGE (100), never
//       restated; the probe player is stats-less, so engagementR2() falls back
//       to that config base — exactly the documented probe path.
//
//   R5b (real browser): Chrome for Testing at 390x844 @dpr3, coarse pointer,
//       ALL 19 TOUR_KEYS + hordes_onboarded=1 in startupScript (withPage's own
//       skipTour presets only 7 of the 19 — the frozen-game trap), state.time
//       ASSERTED to advance past 1.0 before anything is measured. Then,
//       same-frame: state.enemies.length versus the radar seam
//       (renderer.radar) dotCount, split at the 100px cap — dots inside the
//       cap are the pilot's problem, dots outside are what the radar shows the
//       player while the pilot IGNORES them (render.js drawRadar's pairing).
//
// Usage: node tools/verify_a1_acceptance.mjs [--r5a-only]
import { AutoPilotController, FOCUS_MODES } from '../src/controllers.js';
import { CONFIG as C } from '../src/config.js';
import { radarDots, RADAR_RADIUS } from '../src/radar.js';

const R5A_ONLY = process.argv.includes('--r5a-only');
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

const CAP = C.AUTOPILOT.FOCUS_RANGE;             // the ONE definition, read live
const DISTS = [60, 150, 250, 320];

// Same stub shape test_controllers.mjs feeds the real controller; only the
// fields decide()/radarDots() actually read (x, y, hp, maxHp, typeId).
const foe = (x, y, typeId = 'CHASER', maxHp = 10) => ({ x, y, typeId, maxHp, hp: maxHp });
const mkState = (enemies) => ({ enemies, gems: [] });
const P = { x: 0, y: 0 };                        // stats-less probe point (see header)
const live = (state) => state.enemies.filter((e) => e && e.hp > 0);

// One same-frame measurement: decide() and radarDots() on the ONE state object.
function frame(state, focus) {
  const c = new AutoPilotController();
  c.focus = focus;
  const d = c.decide(P, state, C.PLAYER);        // the REAL cfg object main.js passes
  const dots = radarDots(P, live(state));        // the REAL radar data layer
  const dist = (e) => Math.round(Math.hypot(e.x - P.x, e.y - P.y));
  return {
    target: d.target ? d.target.typeId + '@' + dist(d.target) + 'px' : 'null — HOLD FIRE',
    targetDist: d.target ? dist(d.target) : null,
    nearestDot: dots[0] ? dots[0].typeId + '@' + Math.round(dots[0].dist) + 'px' : '(none)',
    dotCount: dots.length,
    inCap: dots.filter((x) => x.dist <= CAP).length,
  };
}

// ---------------------------------------------------------------------------
console.log('HORDES A1 ACCEPTANCE MEASUREMENT — Autopilot engagement radius vs the A2 radar');
console.log('config read live: AUTOPILOT.FOCUS_RANGE=' + CAP + ' (src/config.js), ' +
  'RADAR_RADIUS=' + RADAR_RADIUS + ' (src/radar.js), spawn ring max 322');
console.log('probe player is stats-less => engagementR2() uses the config base ' + CAP + 'px');
console.log('');

// --- R5a TABLE A: single-enemy matrix (4 policies x 4 distances) -------------
// Each policy is fed the enemy type that exercises its OWN doctrine path:
// TOUGHEST a big-hp COLOSSUS, RANGED a fire-capable WARLOCK.
const POLICY_FOE = { NEAREST: () => foe(0, 0, 'CHASER', 10),
  TOUGHEST: () => foe(0, 0, 'COLOSSUS', 500),
  SWARM: () => foe(0, 0, 'CHASER', 10),
  RANGED: () => foe(0, 0, 'WARLOCK', 40) };

console.log('R5a TABLE A — one enemy on the field, REAL decide() vs radar nearest dot, same frame');
console.log('policy   | enemy placed        | decide() target        | radar nearest dot | radar dots | verdict');
console.log('---------+---------------------+------------------------+-------------------+------------+----------------');
for (const focus of FOCUS_MODES) {
  for (const dist of DISTS) {
    const e = POLICY_FOE[focus]();
    e.x = dist; e.y = 0;
    const r = frame(mkState([e]), focus);
    const ignored = r.targetDist === null && r.dotCount > 0;
    console.log(
      focus.padEnd(8) + ' | ' +
      (e.typeId + '@' + dist + 'px').padEnd(19) + ' | ' +
      r.target.padEnd(22) + ' | ' +
      r.nearestDot.padEnd(17) + ' | ' +
      String(r.dotCount).padEnd(10) + ' | ' +
      (ignored ? 'RADAR SHOWS, PILOT IGNORES' : 'pilot engages the dot'));
    // Sanity for the verdict line (the table itself is the deliverable):
    if (dist > CAP) ok(r.targetDist === null, focus + '@' + dist + ': must hold fire past the cap');
    if (dist <= CAP) ok(r.targetDist === dist, focus + '@' + dist + ': must engage inside the cap');
    ok(r.dotCount === 1, focus + '@' + dist + ': the radar must show the dot at every distance');
  }
}
console.log('');

// --- R5a TABLE B: combined fields, same frame --------------------------------
const scenarios = [
  ['B1 spawn-ring field, one insider',
    [foe(60, 0, 'CHASER', 10), foe(0, 150, 'WARLOCK', 40), foe(-250, 0, 'SPITTER', 40), foe(0, -320, 'COLOSSUS', 500)]],
  ['B2 nothing inside the ' + CAP + 'px cap',
    [foe(0, 150, 'WARLOCK', 40), foe(-250, 0, 'SPITTER', 40), foe(0, -320, 'COLOSSUS', 500)]],
  ['B3 two insiders (60 + 90), ring beyond',
    [foe(60, 0, 'CHASER', 10), foe(0, 90, 'WARLOCK', 40), foe(-150, 0, 'SPITTER', 40), foe(0, -320, 'COLOSSUS', 500)]],
];
for (const [name, enemies] of scenarios) {
  console.log('R5a TABLE ' + name + ' — field: ' +
    enemies.map((e) => e.typeId + '@' + Math.round(Math.hypot(e.x, e.y))).join(', '));
  console.log('policy   | decide() target        | radar nearest dot | radar dots | dots beyond cap');
  console.log('---------+------------------------+-------------------+------------+-----------------');
  for (const focus of FOCUS_MODES) {
    const r = frame(mkState(enemies), focus);
    console.log(
      focus.padEnd(8) + ' | ' +
      r.target.padEnd(22) + ' | ' +
      r.nearestDot.padEnd(17) + ' | ' +
      String(r.dotCount).padEnd(10) + ' | ' +
      (r.dotCount - r.inCap));
    if (name.startsWith('B2')) {
      ok(r.targetDist === null, 'B2 ' + focus + ': nothing in cap => hold fire');
      ok(r.dotCount === 3, 'B2 ' + focus + ': radar shows all three');
    }
  }
  console.log('');
}

if (R5A_ONLY) {
  console.log(fail.length ? 'VERDICT: FAIL — ' + fail.join(' | ') : 'VERDICT: PASS (R5a only)');
  process.exit(fail.length ? 1 : 0);
}

// ---------------------------------------------------------------------------
// R5b: the real browser. Mirrors tools/verify_a2_radar.mjs's frozen-game guard.
const { withPage } = await import('./browser.mjs');

const STARTUP = `
try {
  const stages = ['stage1','hud','pilot','focus','stance','move','skills','potions',
    'stats','cog','draft','edge','chest','portal','arch','shrine','intermission',
    'death','settings'];
  for (const k of stages) localStorage.setItem('hordes_tour_' + k, '1');
  localStorage.setItem('hordes_onboarded', '1');
} catch (e) {}
`;

const INIT = `(async () => {
  const main = await import('/src/main.js');
  const T = main.__TEST;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  T.startRun();
  for (let i = 0; i < 8; i++) await frame();
  const t0 = T.state.time;
  // The brief's hard gate: state.time must advance PAST 1.0 before measuring.
  for (let i = 0; i < 600 && !(T.state.time > 1.0); i++) await frame();
  const t1 = T.state.time;
  if (!T.state.radarOn) T.radar.toggle();
  for (let i = 0; i < 3; i++) await frame();
  return { mode: T.state.mode, t0, t1, radarOn: T.state.radarOn,
    focus: T.state.focus,
    cap: T.state.player && T.state.player.stats ? T.state.player.stats.focusRange : null };
})()`;

// Same-frame sample: ONE synchronous read of state + the painted radar seam.
// The seam was painted from this exact state during the frame that just ran
// (update -> render inside frame()), and nothing mutates state between frames.
const SAMPLE = `(async () => {
  const main = await import('/src/main.js');
  const { radarDots } = await import('/src/radar.js');
  const T = main.__TEST;
  const st = T.state;
  const seam = T.renderer.radar;
  const p = st.player;
  const live = st.enemies.filter((e) => e && e.hp > 0);
  const cap = (p.stats && p.stats.focusRange) || 0;
  const dots = radarDots(p, live);           // default radius 330, world dists
  const inCap = dots.filter((d) => d.dist <= cap);
  return {
    t: Math.round(st.time * 100) / 100,
    enemies: st.enemies.length, live: live.length,
    seamDots: seam ? seam.dots.length : null,
    seamCounts: seam ? seam.counts : null, focusR: seam ? seam.focusR : null,
    dataDots: dots.length, inCap: inCap.length, beyond: dots.length - inCap.length,
    nearest: dots[0] ? dots[0].typeId + '@' + Math.round(dots[0].dist) + 'px(' + dots[0].tier + ')' : '(none)',
  };
})()`;

const ADVANCE = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  for (let i = 0; i < 90; i++) await frame();
  return true;
})()`;

const r = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, startupScript: STARTUP },
  async (page) => {
    const init = await page.evaluate(INIT, true);
    if (!(init.t1 > 1.0)) return { init, frozenGuard: 'state.time never passed 1.0 (t0=' +
      init.t0.toFixed(2) + ' t1=' + init.t1.toFixed(2) + ') — the frozen-game trap' };
    const samples = [];
    samples.push(await page.evaluate(SAMPLE, true));
    for (let i = 0; i < 5; i++) {
      await page.evaluate(ADVANCE, true);
      samples.push(await page.evaluate(SAMPLE, true));
    }
    return { init, samples, errors: page.errors.slice() };
  });

if (r.frozenGuard) {
  console.log('R5b CANNOT BE MEASURED — frozen-game guard tripped: ' + r.frozenGuard);
  console.log('VERDICT: FAIL');
  process.exit(1);
}

const { init, samples } = r;
console.log('R5b — REAL Chrome 390x844 dpr3, coarse pointer, all 19 TOUR_KEYS + hordes_onboarded');
console.log('frozen-game guard: mode=' + init.mode + '  state.time ' + init.t0.toFixed(2) +
  ' -> ' + init.t1.toFixed(2) + ' (gate: > 1.0)  radarOn=' + init.radarOn +
  '  doctrine focus=' + init.focus + '  live focusRange cap=' + init.cap + 'px');
console.log('');
console.log('R5b TABLE — same-frame state.enemies vs radar seam dotCount, split at the ' + init.cap + 'px cap');
console.log('time  | enemies | live | seam dots | seam tiers         | dots<=' + init.cap + 'px | dots>' + init.cap + 'px (shown, IGNORED) | nearest dot');
console.log('------+---------+------+-----------+--------------------+-----------+---------------------------+------------');
for (const s of samples) {
  const tiers = s.seamCounts ? JSON.stringify(s.seamCounts) : '(seam null)';
  console.log(
    String(s.t).padEnd(5) + ' | ' +
    String(s.enemies).padEnd(7) + ' | ' +
    String(s.live).padEnd(4) + ' | ' +
    String(s.seamDots).padEnd(9) + ' | ' +
    tiers.padEnd(18) + ' | ' +
    String(s.inCap).padEnd(9) + ' | ' +
    String(s.beyond).padEnd(25) + ' | ' +
    s.nearest);
  ok(s.seamDots !== null, 'radar seam must be live while radarOn');
  ok(s.seamDots === s.dataDots, 'seam dotCount must equal the data-layer dot count (t=' + s.t + ')');
}
console.log('');

ok(init.mode === 'playing', 'the run must be playing (got ' + init.mode + ')');
ok(init.t1 > 1.0, 'state.time must advance past 1.0 before measuring');
ok(init.radarOn === true, 'the radar must be ON for the seam read');
ok(init.cap === CAP, 'the live run focusRange must be the base cap ' + CAP + ' (got ' + init.cap + ')');
ok(samples.some((s) => s.beyond > 0), 'at least one sample must show enemies the radar sees beyond the cap');
ok(samples.every((s) => s.enemies >= s.live), 'enemies.length must cover the live count');
if (r.errors.length) console.log('page errors: ' + JSON.stringify(r.errors));
ok(r.errors.length === 0, 'no page errors');

console.log(fail.length ? 'VERDICT: FAIL — ' + fail.join(' | ') : 'VERDICT: PASS');
process.exit(fail.length ? 1 : 0);
