// HORDES - tools/verify_v1d_spectacle.mjs (V1d ESCAPE SPECTACLE, docs/briefs/
// V1D_ESCAPE_SPECTACLE.md + the OWNER SPEC UPDATE that supersedes its chase
// mechanics: a ~60-SECOND escape, fire rate cut to 1/5, and a LITERAL horde —
// never fewer than 3 live chasers, spawning slightly OFF-SCREEN behind the
// camera edge, charging in and MATCHING the pilot's speed just before
// reaching them; losing is the WALL). TWO halves, no wall-clock sims:
//
// HALF 1 — the IN-PROCESS NUMBERS (sim.step is pure and dt-driven, so a whole
// 60-second escape costs milliseconds):
//   (1) a seeded AUTO run (seeds 1-12) stepped to completion, asserting it
//       REACHES THE PORTAL with the horde floor held EVERY step
//       (chasersMin >= CHASER_FLOOR) and ZERO catches;
//   (2) the off-screen entry proof: the MAX spawn distance sits BEYOND the
//       camera edge (CAM_LEAD 150), the min spawn distance reached is
//       reported (the settle band), and the closest approach lands between
//       the contact radius and the settle band — "close to a hair, never a
//       catch" is a number;
//   (3) the MEASURED duration of the 60-second escape, per seed;
//   (4) the FIRE RATE cut, measured: the same cohort with the pre-cut
//       cadence (0.35s) vs the shipped one (1.75s) — shots per run, before
//       and after;
//   (5) TWO counter-cases: a deliberately passive run (no dash, no jump, no
//       move) that IS caught by the wall, and the speed-match DISABLED run
//       (match speed 999, MATCH_FLOOR negative, restored after) that IS
//       caught by the horde — both proving the checks can fail.
//
// HALF 2 — REAL Chrome at 390x844 @dpr3 AND 844x390 @dpr3 (the owner plays
// both orientations), the escape entered through the settings TEST button by
// ONE REAL TAP, four labelled shots per orientation:
//   COLOR    - act 1 magenta twilight: banded sky + lit horizon + coloured
//              parallax (seam: player teleported to the 30% mark on real
//              floor ground); sky pixels SAMPLED before/after to prove the
//              palette TRAVELS between acts;
//   PACK     - the LITERAL horde: >=3 live pursuers (the floor) on camera
//              behind the runner, the molten horde edge staged on screen
//              (seam: wall.x);
//   NEARMISS - a MATCHED chaser inside 60px — the charge came in, the speed
//              match engaged, and it hangs on the tail (natural timing,
//              only waited for — never forced);
//   PORTAL   - act 3 teal dawn, the emissive destination on screen (seam:
//              player teleported near portalX).
// PNGs land in docs/art/v1d-spectacle-2026-09-15/ at the natural dpr3 size.
// Every staged seam is the mode's published current() sim, disclosed here
// and in the done report. No console errors.
// Run: node tools/verify_v1d_spectacle.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { THREATS, EXIT } from '../src/escape/config.js';

const ART = 'docs/art/v1d-spectacle-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// ---- HALF 1: the in-process numbers ----------------------------------------
function playOut(seed, inputOf, capSecs = 170) {
  const sim = createSim(seed);
  let n = 0, frames = 0;
  while (!sim.outcome && frames < 60 * capSecs) { step(sim, 1 / 60, inputOf(sim)); frames++; n++; }
  return sim;
}

console.log('--- HALF 1: in-process (pure sim, 60Hz dt, ms per run) ---');
const t0 = performance.now();
const CAM_LEAD = 150;                    // render.js: the runner's fixed screen x
let minClosest = Infinity, worstSeed = 0, catches = 0, completes = 0, floorDips = 0;
let maxSpawnGap = 0, minSpawnGap = Infinity, poured = 0;
const perSeed = [];
for (let seed = 1; seed <= 12; seed++) {
  const sim = playOut(seed, inputFor);
  const reached = sim.outcome === 'complete' && sim.player.x >= sim.corridor.portalX - EXIT.RADIUS;
  if (sim.outcome === 'complete' && reached) completes++;
  if (sim.outcome === 'caught') catches++;
  if (sim.chasersMin < THREATS.CHASER_FLOOR) floorDips++;
  if (sim.closestPursuit < minClosest) { minClosest = sim.closestPursuit; worstSeed = seed; }
  maxSpawnGap = Math.max(maxSpawnGap, sim.maxSpawnGap);
  minSpawnGap = Math.min(minSpawnGap, sim.minSpawnGap);
  poured += sim.pouredSpawns;
  perSeed.push({ seed, outcome: sim.outcome, closest: Math.round(sim.closestPursuit),
    secs: +sim.t.toFixed(1), chasersMin: sim.chasersMin, settles: sim.settles,
    spawned: sim.spawnedPursuers, pitted: sim.pittedPursuers, shots: sim.shotsFired });
  console.log('  seed ' + String(seed).padStart(2) + ': outcome=' + sim.outcome +
    ' t=' + sim.t.toFixed(1) + 's closest=' + Math.round(sim.closestPursuit) + 'px' +
    ' chasersMin=' + sim.chasersMin + ' settles=' + sim.settles +
    ' spawnGap=[' + Math.round(sim.minSpawnGap) + ',' + Math.round(sim.maxSpawnGap) + ']' +
    ' poured=' + sim.pouredSpawns + ' shots=' + sim.shotsFired);
}
const autoMs = (performance.now() - t0).toFixed(1);
const durations = perSeed.map((s) => s.secs);

// (4) the FIRE RATE cut, measured: pre-cut cadence (0.35s) vs shipped (1.75s).
const keepEvery = THREATS.SHOT_EVERY;
let oldShots = 0, newShots = 0;
try {
  THREATS.SHOT_EVERY = 0.35;             // the pre-cut cadence
  for (let seed = 1; seed <= 12; seed++) oldShots += playOut(seed, inputFor).shotsFired;
  THREATS.SHOT_EVERY = keepEvery;
  for (let seed = 1; seed <= 12; seed++) newShots += playOut(seed, inputFor).shotsFired;
} finally { THREATS.SHOT_EVERY = keepEvery; }
console.log('  fire rate: ' + (oldShots / 12).toFixed(1) + ' shots/run at the pre-cut 0.35s cadence vs ' +
  (newShots / 12).toFixed(1) + ' at the shipped ' + keepEvery + 's (the 1/5 cut)');

// (5) the counter-cases: passive -> caught by the WALL; speed-match DISABLED
// -> caught by the HORDE (restored after — config exports live objects).
const passive = playOut(1, () => ({ moveX: 0 }), 30);
console.log('  passive seed 1: outcome=' + passive.outcome + ' at t=' +
  passive.t.toFixed(2) + 's (the WALL closed — losing is the wall, not the horde)');
const keepMatch = THREATS.PURSUER_MATCH_SPEED, keepFloor = THREATS.MATCH_FLOOR;
let matchCaught = 0;
try {
  THREATS.PURSUER_MATCH_SPEED = 999;
  THREATS.MATCH_FLOOR = -60;
  for (let seed = 1; seed <= 4; seed++) {
    const sim = playOut(seed, inputFor, 45);
    if (sim.outcome === 'caught') matchCaught++;
    console.log('  match-disabled seed ' + seed + ': outcome=' + sim.outcome + ' at t=' + sim.t.toFixed(1) + 's');
  }
} finally {
  THREATS.PURSUER_MATCH_SPEED = keepMatch;
  THREATS.MATCH_FLOOR = keepFloor;
}

check('(1) AUTO completes and REACHES THE PORTAL on seeds 1-12 with the floor held EVERY step (' +
  autoMs + 'ms for all 12 runs in-process)',
  completes === 12 && catches === 0 && floorDips === 0,
  { completes, catches, floorDips, chaserFloor: THREATS.CHASER_FLOOR });
check('(2) off-screen entry: MAX spawn gap ' + Math.round(maxSpawnGap) + 'px is BEYOND the camera edge (' +
  CAM_LEAD + 'px); min non-poured gap ' + Math.round(minSpawnGap) + 'px; closest approach ' +
  Math.round(minClosest) + 'px (seed ' + worstSeed + ') is inside the contact radius NEVER (radius ' +
  THREATS.CONTACT_R + 'px) and inside the settle band (< ' + (THREATS.MATCH_HOLD + 8) + 'px)',
  maxSpawnGap > CAM_LEAD && minSpawnGap >= CAM_LEAD - THREATS.SPAWN_OFFSCREEN - 1 &&
    minClosest > THREATS.CONTACT_R && minClosest < THREATS.MATCH_HOLD + 8,
  { maxSpawnGap: Math.round(maxSpawnGap), minSpawnGap: Math.round(minSpawnGap),
    poured, closest: Math.round(minClosest) });
check('(3) the MEASURED duration is the ~60-second escape (owner spec): every seed inside [45,75]s' +
  ' (min ' + Math.min(...durations) + 's, max ' + Math.max(...durations) + 's, mean ' +
  (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) + 's)',
  durations.every((d) => d >= 45 && d <= 75), { durations });
check('(4) the FIRE RATE cut to 1/5, measured: ' + (oldShots / 12).toFixed(1) + ' -> ' +
  (newShots / 12).toFixed(1) + ' shots/run (ratio ' + (newShots / oldShots).toFixed(2) + ')',
  newShots * 3 < oldShots, { oldShots, newShots });
check('(5a) counter-case: the passive run (no dash/jump/move) IS caught at t=' +
  passive.t.toFixed(2) + 's — the WALL is the real threat and the check can fail',
  passive.outcome === 'caught', { outcome: passive.outcome, t: +passive.t.toFixed(2) });
check('(5b) counter-case: speed-match DISABLED — all 4 seeds caught by the horde' +
  ' (the structural no-contact guarantee is load-bearing)',
  matchCaught === 4, { matchCaught });

// ---- HALF 2: real Chrome, both orientations --------------------------------
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;
// Sky sampler: two virtual-space points (the banded gradient's top and the
// horizon wash), read straight off the live canvas.
const PIX = `(async () => {
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const sx = cv.width / 480, sy = cv.height / 300;
  const grab = (vx, vy) => {
    const d = g.getImageData(Math.floor(vx * sx), Math.floor(vy * sy), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return { top: grab(120, 8), low: grab(120, 100) };
})()`;

async function arm(w, h, label) {
  return withPage({ w, h, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
      await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
      const start = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!start) throw new Error('no START GAME card');
      await p.tap(start[0], start[1]);
      await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
      const runLive = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

      const cog = await p.evaluate(`(() => {
        const el = document.querySelector('[data-act="settings"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!cog) throw new Error('no touch cog');
      await p.tap(cog[0], cog[1]);
      await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
      const btn = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').includes('TEST: ESCAPE SEQUENCE'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!btn) throw new Error('no TEST button');
      await p.tap(btn[0], btn[1]);
      const entered = await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);

      // The shared teleport seam (verify_v1b_art.mjs's own): move to a
      // fraction of the corridor ONTO REAL FLOOR GROUND, park the wall.
      const teleport = (frac) => p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false;
        const target = sim.corridor.length * ${frac};
        const pl = sim.plats.filter(q => Math.abs(q.y - 252) <= 2 && q.x + 60 > target)
          .sort((a, b) => a.x - b.x)[0];
        if (!pl) return false;
        sim.player.x = pl.x + 20; sim.player.y = 252; sim.player.vy = 0; sim.player.onGround = true;
        sim.wall.x = sim.player.x - 900;
        return true; })()`);

      // SHOT 1 COLOR: act 1 (30%) — magenta twilight sky, lit horizon,
      // coloured parallax. Sky sampled here AND again at the portal shot to
      // prove the palette TRAVELS.
      const staged1 = await teleport(0.30);
      await p.sleep(700);                       // let a few frames of parallax scroll
      const pixColor = await p.evaluate(PIX);
      const shotColor = await p.shot(label + '-color-act1-twilight');

      // SHOT 2 PACK: back to act 2, wall staged on camera, wait for the
      // LITERAL horde — >= CHASER_FLOOR (3) live pursuers inside 170px
      // behind the runner (they pour from the staged wall's face).
      await teleport(0.50);
      await p.evaluate(`(async () => { const T2 = ${T};
        T2.escape.sim.wall.x = T2.escape.sim.player.x - 190; })()`);   // staged seam
      const packed = await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false; const pl = sim.player;
        return sim.pursuers.filter(pu => pu.hp > 0 && pu.x < pl.x && pu.x >= pl.x - 170).length >= 3; })()`, 20000, 50);
      const worldPack = packed === true ? await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; const pl = sim.player;
        return { t: +sim.t.toFixed(2), act: +(pl.x / sim.corridor.length).toFixed(2),
          behind: sim.pursuers.filter(pu => pu.hp > 0 && pu.x < pl.x).map(pu => Math.round(pu.x - pl.x)),
          wallScreenDx: Math.round(sim.wall.x + 46 - pl.x) }; })()`) : null;
      const shotPack = packed === true ? await p.shot(label + '-pack-shoulder-to-shoulder') : null;

      // SHOT 3 NEARMISS: a MATCHED chaser inside 60px — the charge came in,
      // the speed match engaged, and it hangs on the tail. Staged at 0.70 (the
      // sprint's cusp): the gappy mid-corridor feeds every refill straight
      // into a pit lip, but from here the run's remaining flats let a charge
      // actually reach the tail, and the portal is still far enough ahead that
      // the auto pilot cannot complete the run out from under the wait. Wall
      // parked far behind so the refills enter from the off-screen band, not
      // the wall's face. Natural timing only, we wait, never force.
      await teleport(0.70);
      const neared = await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false; const pl = sim.player;
        return sim.pursuers.some(pu => pu.hp > 0 && pu.state === 'matched' &&
          (pu.matchT || 0) < 1.0 && pu.x < pl.x && pu.x >= pl.x - 60); })()`, 20000, 40);
      const shotNear = neared === true ? await p.shot(label + '-near-miss-matched-hang') : null;
      // The metadata read races the live sim (the pilot's dash flips a matched
      // chaser back to charge between frames) — the settled hang recurs every
      // few seconds, so RETRY the read briefly for a live matched body.
      let worldNear = null;
      if (neared === true) {
        for (let k = 0; k < 10 && !(worldNear && worldNear.phase === 'matched'); k++) {
          worldNear = await p.evaluate(`(async () => { const T2 = ${T};
            const sim = T2.escape.sim; if (!sim || sim.outcome) return null; const pl = sim.player;
            const pu = sim.pursuers.find(pu => pu.hp > 0 && pu.state === 'matched' && pu.x < pl.x);
            return pu ? { t: +sim.t.toFixed(2), gap: Math.round(pl.x - pu.x),
              phase: pu.state, settleT: +(pu.matchT || 0).toFixed(2) } : null; })()`);
          if (!(worldNear && worldNear.phase === 'matched')) await p.sleep(150);
        }
      }

      // SHOT 4 PORTAL: act 3 teal dawn — the emissive destination (the same
      // teleport seam as verify_v1b_art.mjs shot D). Taken IMMEDIATELY after
      // the teleport: the auto pilot standing here completes the run in
      // seconds, so there is no waiting between stage and shot.
      const staged4 = await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false;
        const want = sim.corridor.portalX - 210;
        const pl = sim.plats.filter(q => Math.abs(q.y - 252) <= 2 && q.x < sim.corridor.portalX - 40)
          .sort((a, b) => Math.abs(a.x - want) - Math.abs(b.x - want))[0];
        if (!pl) return false;
        sim.player.x = pl.x + 20; sim.player.y = 252; sim.player.vy = 0; sim.player.onGround = true;
        sim.wall.x = sim.player.x - 900;
        return true; })()`);
      const portaled = staged4 === true ? await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return !sim.outcome && sim.corridor.portalX - sim.player.x < 340 && sim.player.y === 252; })()`, 8000, 50) : false;
      const pixPortal = portaled === true ? await p.evaluate(PIX) : null;
      const worldPortal = portaled === true ? await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return { t: +sim.t.toFixed(2), act: +(sim.player.x / sim.corridor.length).toFixed(2),
          portalDx: Math.round(sim.corridor.portalX - sim.player.x) }; })()`) : null;
      const shotPortal = portaled === true ? await p.shot(label + '-portal-teal-dawn') : null;

      // Clean exit: SKIP by a real tap on the painted rect, BACK resumes.
      const skipTap = await p.evaluate(`(() => {
        const r = document.getElementById('game').getBoundingClientRect();
        return [Math.round(r.x + 430 / 480 * r.width), Math.round(r.y + 21 / 300 * r.height)];
      })()`);
      await p.tap(skipTap[0], skipTap[1]);
      const back1 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 8000, 100);
      const back = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').includes('BACK'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await p.tap(back[0], back[1]);
      const resumed = await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'playing' && T2.chromeOn(); })()`, 5000, 100);

      return { runLive, entered, staged1, pixColor, shotColor, packed, worldPack, shotPack,
        neared, worldNear, shotNear, portaled, pixPortal, worldPortal, shotPortal,
        back1, resumed, errors: p.errors };
    });
}

const portrait = await arm(390, 844, 'v1d-port');
const landscape = await arm(844, 390, 'v1d-land');

// ---- verdict -------------------------------------------------------------
const samePix = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
for (const [name, a, pxw, pxh] of [
  ['PORTRAIT 390x844', portrait, 1170, 2532],
  ['LANDSCAPE 844x390', landscape, 2532, 1170],
]) {
  check(name + ': run live, TEST tap entered the escape',
    a.runLive.mode === 'playing' && a.runLive.time > 1.0 && a.entered === true, a.runLive);
  check(name + ': COLOR shot staged at act 1 with sky pixels sampled',
    a.staged1 === true && a.pixColor && a.pixColor.top && a.pixColor.top.some((v) => v > 0), a.pixColor);
  check(name + ': PACK shot — >=3 pursuers (the horde floor) on camera behind, molten edge on screen',
    a.packed === true && a.worldPack && a.worldPack.behind.length >= 3 &&
    a.worldPack.wallScreenDx >= -195 && a.worldPack.wallScreenDx < 0, a.worldPack);
  check(name + ': NEAR-MISS shot — a MATCHED chaser hung inside 60px (natural timing)',
    a.neared === true && a.worldNear && a.worldNear.gap > 0 && a.worldNear.gap <= 60 &&
    a.worldNear.phase === 'matched', a.worldNear);
  check(name + ': PORTAL shot — act 3, destination on screen, sky pixels sampled',
    a.portaled === true && a.worldPortal && a.worldPortal.portalDx > 0 && a.worldPortal.portalDx < 340 &&
    a.pixPortal && a.pixPortal.top, a.worldPortal);
  check(name + ': the palette TRAVELS — act 1 sky ' + JSON.stringify(a.pixColor && a.pixColor.top) +
    ' differs from act 3 sky ' + JSON.stringify(a.pixPortal && a.pixPortal.top),
    !!(a.pixPortal && a.pixPortal.top) &&
    (!samePix(a.pixColor.top, a.pixPortal.top) || !samePix(a.pixColor.low, a.pixPortal.low)),
    { act1: a.pixColor, act3: a.pixPortal });
  check(name + ': clean skip/resume back to the paused run',
    a.back1 === true && a.resumed === true, { back1: a.back1, resumed: a.resumed });
  check(name + ': no console errors', a.errors.length === 0, a.errors);
}

// PNGs: canonical copies at the natural dpr3 size.
let copied = 0;
for (const a of [portrait, landscape]) {
  for (const s of [a.shotColor, a.shotPack, a.shotNear, a.shotPortal]) {
    if (!s) continue;
    const base = s.split('/').pop();
    try { copyFileSync(s, ART + '/' + base); copied++; } catch (e) { console.error('COPY FAILED: ' + e.message); }
  }
}
check('all 8 PNGs copied into ' + ART + ' (natural dpr3)', copied === 8, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1D SPECTACLE: FAIL' : 'VERIFY V1D SPECTACLE: PASS - in-process: 12/12 complete with the floor held every step' +
  ' (closest ' + Math.round(minClosest) + 'px, spawn gap [' + Math.round(minSpawnGap) + ',' + Math.round(maxSpawnGap) + ']px' +
  ' vs camera edge ' + CAM_LEAD + 'px), durations ' + Math.min(...durations) + '-' + Math.max(...durations) + 's' +
  ' (mean ' + (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) + 's), fire rate ' +
  (oldShots / 12).toFixed(1) + ' -> ' + (newShots / 12).toFixed(1) + ' shots/run, passive + match-disabled counter-cases caught' +
  ', 8 labelled PNGs in ' + ART);
process.exit(bad ? 1 : 0);
