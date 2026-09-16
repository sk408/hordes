// HORDES - tools/verify_v1e_finale.mjs (V1e THE FINALE, docs/briefs/
// V1E_ESCAPE_FINALE.md). TWO halves, no wall-clock sims:
//
// HALF 1 — IN-PROCESS (brief acceptance #1: sim.step is pure and dt-driven,
// a whole 2-minute escape costs milliseconds): a seeded AUTO run stepped to
// completion REACHES THE PORTAL VIA THE UPPER ROUTE, with the raw frames for
// the jump, the crossing and the drop reported per seed. Plus the
// counter-case: the same AUTO with the finale's two up-hop bands suppressed
// does NOT reach the portal (caught on the boss's ground) — the route is
// load-bearing and the check can fail.
//
// HALF 2 — REAL Chrome at 390x844 @dpr3 AND 844x390 @dpr3 (the owner plays
// both orientations), the escape entered through the settings TEST button by
// ONE REAL TAP, four labelled shots per orientation (staged seams on the
// mode's published current() sim, disclosed: teleport onto authored ground,
// wall parked far behind):
//   APPROACH - on the finale floor, the terrace up-route and the boss's
//              looming body ahead (act 3 teal dawn behind everything);
//   UPLEVEL  - on the approach TERRACE, the overpass ahead and the body
//              beneath it (the upper level, from its first step);
//   CROSSING - mid-overpass DIRECTLY OVER the boss body — the loudest thing
//              on screen, gold eyes and molten rim;
//   PORTAL   - past the drop, the emissive destination with the boss's
//              silhouette behind (the drop's landing ground).
// PNGs land in docs/art/v1e-finale-2026-09-16/ at the natural dpr3 size.
// No console errors.
// Run: node tools/verify_v1e_finale.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { THREATS, EXIT } from '../src/escape/config.js';

const ART = 'docs/art/v1e-finale-2026-09-16';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// ---- HALF 1: in-process ------------------------------------------------------
// The route timeline: the frame index of every phase of the finale crossing.
function finaleTimeline(seed) {
  const sim = createSim(seed);
  const bands = sim.triggers.filter(t => t.up);
  const tl = {};
  let n = 0;
  while (!sim.outcome && n < 60 * 170) {
    step(sim, 1 / 60, inputFor(sim));
    n++;
    const c = sim.corridor, p = sim.player;
    if (tl.jump1 === undefined && bands[0].fired) tl.jump1 = n;
    if (tl.onTerrace === undefined && Math.abs(p.y - c.bossApproachY) < 1 && p.x >= c.bossApproachX) tl.onTerrace = n;
    if (tl.jump2 === undefined && bands[1] && bands[1].fired) tl.jump2 = n;
    if (tl.crossing === undefined && c.bossPlat && Math.abs(p.y - c.bossPlat.y) < 1 &&
        p.x > c.bossX - THREATS.BOSS_W / 2 && p.x < c.bossX + THREATS.BOSS_W / 2) tl.crossing = n;
    if (tl.drop === undefined && tl.crossing !== undefined && p.x > c.bossPlat.x + c.bossPlat.w && !p.onGround) tl.drop = n;
    if (tl.landed === undefined && tl.drop !== undefined && p.onGround && Math.abs(p.y - 252) < 1) tl.landed = n;
  }
  tl.outcome = sim.outcome;
  tl.reachedPortal = sim.player.x >= sim.corridor.portalX - EXIT.RADIUS;
  tl.frames = n;
  tl.t = +sim.t.toFixed(1);
  tl.x = Math.round(sim.player.x);
  return tl;
}

console.log('--- HALF 1: in-process (pure sim, 60Hz dt) — the finale route timeline ---');
const timelines = [];
for (let seed = 1; seed <= 6; seed++) {
  const tl = finaleTimeline(seed);
  timelines.push(tl);
  console.log('  seed ' + seed + ': jump1@' + tl.jump1 + ' terrace@' + tl.onTerrace + ' jump2@' + tl.jump2 +
    ' CROSSING@' + tl.crossing + ' drop@' + tl.drop + ' landed@' + tl.landed +
    ' -> ' + tl.outcome + ' at t=' + tl.t + 's (x=' + tl.x + ')');
}
const t1 = timelines[0];
check('(1a) AUTO reaches the portal VIA THE UPPER ROUTE on seeds 1-6 — every phase present and ordered',
  timelines.every(tl => tl.outcome === 'complete' && tl.reachedPortal &&
    tl.jump1 < tl.onTerrace && tl.onTerrace < tl.jump2 && tl.jump2 < tl.crossing &&
    tl.crossing < tl.drop && tl.drop < tl.landed),
  timelines.map(tl => ({ seed: timelines.indexOf(tl) + 1, outcome: tl.outcome, crossing: tl.crossing })));

// The counter-case: suppress the finale's up-hop bands; the same AUTO is
// caught on the boss's ground and never reaches the portal.
console.log('  counter-case (up-route suppressed):');
const counters = [];
for (let seed = 1; seed <= 4; seed++) {
  const sim = createSim(seed);
  for (const t of sim.triggers) if (t.up) t.fired = true;
  let n = 0;
  while (!sim.outcome && n < 60 * 170) { step(sim, 1 / 60, inputFor(sim)); n++; }
  counters.push({ seed, outcome: sim.outcome, x: Math.round(sim.player.x), t: +sim.t.toFixed(1) });
  console.log('  seed ' + seed + ': outcome=' + sim.outcome + ' at x=' + Math.round(sim.player.x) +
    ' (boss body left edge ' + (sim.corridor.bossX - THREATS.BOSS_W / 2) + ') t=' + sim.t.toFixed(1) + 's');
}
check('(1b) counter-case: the ground route does NOT reach the portal (route is load-bearing)',
  counters.every(c => c.outcome !== 'complete'), counters);

// ---- HALF 2: real Chrome, both orientations ----------------------------------
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;

// Teleport the runner onto authored ground at (x, y); park the wall far
// behind (the staged seam, disclosed: the shot shows FINALE GEOMETRY, not a
// played moment — the wall would otherwise be off-camera behind).
const TP = (p, x, y) => p.evaluate(`(async () => { const T2 = ${T};
  const sim = T2.escape.sim; if (!sim || sim.outcome) return false;
  sim.player.x = ${x}; sim.player.y = ${y}; sim.player.vy = 0; sim.player.onGround = true;
  sim.player.dashT = 0; sim.wall.x = sim.player.x - 900;
  return true; })()`);

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

      // The finale geometry, read off the live sim for the staged teleports.
      const geo = await p.evaluate(`(async () => { const T2 = ${T};
        const c = T2.escape.sim.corridor;
        return { segX0: c.bossSegX0, approachX: c.bossApproachX, approachY: c.bossApproachY,
          overX: c.bossOverpassX, passY: Math.round(c.bossPlat.y),
          bossX: Math.round(c.bossX), portalX: Math.round(c.portalX) }; })()`);

      // SHOT 1 APPROACH: finale floor, terrace + boss looming ahead.
      await TP(p, geo.segX0 + 16, 252);
      await p.sleep(400);
      const shot1 = await p.shot(label + '-approach-terrace-and-boss');

      // SHOT 2 UPLEVEL: on the terrace, the overpass ahead over the body.
      await TP(p, geo.approachX + 12, geo.approachY);
      await p.sleep(400);
      const shot2 = await p.shot(label + '-upper-level-from-terrace');

      // SHOT 3 CROSSING: mid-overpass directly OVER the body.
      await TP(p, geo.bossX, geo.passY);
      await p.sleep(400);
      const shot3 = await p.shot(label + '-crossing-over-boss');

      // SHOT 4 PORTAL: past the drop, the destination ahead, boss behind.
      await TP(p, geo.portalX - 150, 252);
      await p.sleep(400);
      const world4 = await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return { portalDx: Math.round(sim.corridor.portalX - sim.player.x),
          bossBehind: Math.round(sim.player.x - sim.corridor.bossX) }; })()`);
      const shot4 = await p.shot(label + '-drop-to-portal');

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

      return { runLive, entered, geo, shot1, shot2, shot3, shot4, world4, back1, resumed, errors: p.errors };
    });
}

const portrait = await arm(390, 844, 'v1e-port');
const landscape = await arm(844, 390, 'v1e-land');

// ---- verdict -------------------------------------------------------------
for (const [name, a] of [
  ['PORTRAIT 390x844', portrait],
  ['LANDSCAPE 844x390', landscape],
]) {
  check(name + ': run live, TEST tap entered the escape',
    a.runLive.mode === 'playing' && a.runLive.time > 1.0 && a.entered === true, a.runLive);
  check(name + ': finale geometry present (terrace/overpass/boss/portal)',
    a.geo && a.geo.approachY < 252 && a.geo.passY < a.geo.approachY && a.geo.portalX > a.geo.bossX, a.geo);
  check(name + ': 4 labelled shots taken (approach/upper-level/crossing/portal)',
    !!(a.shot1 && a.shot2 && a.shot3 && a.shot4), { world4: a.world4 });
  check(name + ': clean skip/resume back to the paused run',
    a.back1 === true && a.resumed === true, { back1: a.back1, resumed: a.resumed });
  check(name + ': no console errors', a.errors.length === 0, a.errors);
}

// PNGs: canonical copies at the natural dpr3 size.
let copied = 0;
for (const a of [portrait, landscape]) {
  for (const s of [a.shot1, a.shot2, a.shot3, a.shot4]) {
    if (!s) continue;
    const base = s.split('/').pop();
    try { copyFileSync(s, ART + '/' + base); copied++; } catch (e) { console.error('COPY FAILED: ' + e.message); }
  }
}
check('all 8 PNGs copied into ' + ART + ' (natural dpr3)', copied === 8, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1E FINALE: FAIL' : 'VERIFY V1E FINALE: PASS - in-process route timeline (crossing@' +
  t1.crossing + ' drop@' + t1.drop + ' landed@' + t1.landed + ' -> complete), counter-case caught, 8 labelled PNGs in ' + ART);
process.exit(bad ? 1 : 0);
