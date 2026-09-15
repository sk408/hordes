// HORDES - tools/verify_v1c_pursuit.mjs (V1c acceptance #3). REAL Chrome at
// 390x844 @dpr3, entered through the OWNER-ASKED-FOR settings TEST button:
//   1. All tour flags set up front; the run clock ASSERTED ADVANCING before
//      any measurement (the frozen-game guard).
//   2. The escape entered by ONE REAL TAP on TEST: ESCAPE SEQUENCE (never a
//      scripted function call).
//   3. The pursuit is REACHABLE AND VISIBLE: we wait on live state until a
//      live pursuer sits INSIDE THE CAMERA WINDOW BEHIND THE RUNNER
//      ([p.x-150, p.x], render.js CAM_LEAD 150), then screenshot THAT frame.
//      On-camera state is re-read at shot time so the PNG and the assertion
//      describe the same world.
//   4. PNG into docs/art/v1c-pursuit-2026-09-15/ at the natural 1170x2532.
//   5. MEASURED numbers reported (spawned / pitted / closest) from the live
//      sim ledger at capture time - the same numbers the unit check prints.
//   6. Clean exit: SKIP by a real tap on the painted skip rect, BACK resumes
//      the paused run with chrome re-registered. No console errors.
// Run: node tools/verify_v1c_pursuit.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/v1c-pursuit-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title, then a REAL TAP on START GAME; the run clock must be
    // ADVANCING before any measurement below (the frozen-game guard).
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
    if (!start) throw new Error('no START GAME card on the title');
    await p.tap(start[0], start[1]);
    await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runLive = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

    // The REAL touch cog opens the in-run settings; ONE REAL TAP on the TEST
    // button enters the escape (never a scripted function call).
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!cog) throw new Error('no touch cog [data-act="settings"]');
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
    const btn = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').includes('TEST: ESCAPE SEQUENCE'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!btn) throw new Error('no TEST: ESCAPE SEQUENCE card on the in-run settings screen');
    await p.tap(btn[0], btn[1]);
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    const enteredAt = await p.evaluate(`(async () => { const T2 = ${T}; return +T2.escape.sim.t.toFixed(2); })()`);

    // The heart of V1c: wait on LIVE state until a live pursuer is INSIDE THE
    // CAMERA WINDOW BEHIND THE RUNNER (CAM_LEAD 150: visible [p.x-150, p.x]).
    // Pre-fix this NEVER became true (spawns were 300px back, off-camera, and
    // died in the first pit) - the wait itself is the regression proof.
    const onCamera = await p.waitFor(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim; if (!sim) return false; const pl = sim.player;
      return sim.pursuers.some(pu => pu.hp > 0 && pu.x < pl.x && pu.x >= pl.x - 150); })()`, 30000, 50);

    // Read the world AT CAPTURE TIME (so the PNG and these numbers describe
    // the same frame), then screenshot immediately.
    const world = await p.evaluate(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim; const pl = sim.player;
      const behind = sim.pursuers.filter(pu => pu.hp > 0 && pu.x < pl.x)
        .map(pu => ({ dx: Math.round(pu.x - pl.x), onCam: pu.x >= pl.x - 150 }));
      return { t: +sim.t.toFixed(2), runnerX: Math.round(pl.x),
        behind, spawned: sim.spawnedPursuers, pitted: sim.pittedPursuers,
        closest: sim.closestPursuit === Infinity ? null : Math.round(sim.closestPursuit) }; })()`);
    const shot = await p.shot('v1c-pursuit');
    const read = await p.readShot(shot, {
      corner: [24, 24], field: [200, 240], sky: [195, 60],
    });

    // Clean exit: SKIP by a real tap on the painted skip rect, BACK resumes.
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

    return { runLive, enteredAt, onCamera, world, shot, read, back1, resumed, errors: p.errors };
  });

// ---- verdict -------------------------------------------------------------
check('run went live with the clock ADVANCING (t=' + arm.runLive.time + 's)',
  arm.runLive.mode === 'playing' && arm.runLive.time > 1.0, arm.runLive);
check('ONE REAL TAP on TEST: ESCAPE SEQUENCE entered the mode (t=' + arm.enteredAt + 's)',
  arm.enteredAt !== null && arm.enteredAt >= 0, { enteredAt: arm.enteredAt });
check('a live pursuer was ON CAMERA BEHIND THE RUNNER (the V1c regression proof)',
  arm.onCamera === true && arm.world.behind.some((b) => b.onCam),
  { at: 't=' + arm.world.t + 's', behind: arm.world.behind });
check('the ledger reports real pursuit pressure (spawned/closest at capture time; the FULL-RUN numbers are the unit check\'s MEASURED lines)',
  arm.world.spawned > 0 && arm.world.closest !== null && arm.world.closest < 150,
  { spawned: arm.world.spawned, pitted: arm.world.pitted, closestPx: arm.world.closest });
check('PNG is the natural 1170x2532 and the escape frame has pixels (not blank)',
  arm.read.w === 1170 && arm.read.h === 2532 &&
  [arm.read.px.corner, arm.read.px.field, arm.read.px.sky].every((c) =>
    c && (c[0] || c[1] || c[2]) && !(c[0] === 255 && c[1] === 255 && c[2] === 255)), arm.read.px);
check('SKIP handed back to the paused settings screen and BACK resumed the run',
  arm.back1 === true && arm.resumed === true, { back1: arm.back1, resumed: arm.resumed });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

const canonical = ART + '/v1c-pursuit-390x844.png';
try { copyFileSync(arm.shot, canonical); console.log('PNG: ' + canonical); }
catch (e) { console.error('COPY FAILED: ' + e.message); }

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1C PURSUIT: FAIL'
  : 'VERIFY V1C PURSUIT: PASS - real Chrome 390x844 @dpr3, entered by a real tap on TEST: ESCAPE SEQUENCE; ' +
    'a live pursuer on camera behind the runner at t=' + arm.world.t + 's (ledger: spawned=' + arm.world.spawned +
    ' pitted=' + arm.world.pitted + ' closest=' + arm.world.closest + 'px); clean skip/resume; PNG at ' + canonical);
process.exit(bad ? 1 : 0);
