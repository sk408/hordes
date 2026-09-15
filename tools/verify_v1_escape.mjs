// HORDES - tools/verify_v1_escape.mjs (V1 THE ESCAPE SEQUENCE, acceptance #5
// and #8, docs/briefs/V1_ESCAPE_SEQUENCE.md). REAL Chrome at 390x844 @dpr3:
//   1. ALL tour flags set up front (the full TOUR_KEYS list spelled out, the
//      G26 loadout key included, so a future entry makes this visibly stale)
//      and the run clock ASSERTED ADVANCING (state.time > 1.0) before any
//      measurement - the frozen-game guard every browser tool owes.
//   2. THE REAL HAND-OVER: a live run is pushed into the portal cinematic and
//      a REAL KEY (any key skips the cine) drives endPortalCine's wave-1
//      branch - the same portal-entry seam the game itself uses - into the
//      escape. Never a copy of the mode's internals.
//   3. MODE REGISTRATION: chromeOn() is FALSE for 'escape' and the touch pad
//      layer is hidden (the screen-chrome gate, WAVE-25's regression, proven
//      for the new mode in a real browser as the house rules demand).
//   4. THE ESCAPE CLOCK ADVANCES: sim.t moves on the live display loop.
//   5. ONE REAL TAP on the skip affordance (the painted SKIP rect, mapped from
//      the mode's own virtual 480x300 through the live canvas rect) ends the
//      escape SOFT: intermission, player alive, payout 0 - never death.
//   6. ONE PNG at the device's natural 1170x2532 (backing-store size read
//      back, never assumed), gameplay pixels present, saved to
//      docs/art/v1-escape-2026-09-15/.
//   7. No console errors in the arm.
// Run: node tools/verify_v1_escape.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = 'docs/art/v1-escape-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// Every tour flag (the full TOUR_KEYS set incl. the G26 loadout key) +
// onboarded, before any game script runs.
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ['stage1','hud','pilot','focus','stance','move','skills','potions','stats',
    'cog','draft','edge','chest','portal','arch','shrine','intermission','death','settings','loadout'];
  for (const k of keys) localStorage.setItem('hordes_tour_' + k, '1');
} catch (e) {}`;

const MAIN = "(async () => (await import('./src/main.js')).__TEST)()";

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title (intro skip -> reveal settle), the standard pair.
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);

    // REAL TAP: START GAME -> the run must go live and its clock ADVANCE
    // (the frozen-game guard - asserted BEFORE any measurement below).
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
    const runLive = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

    // THE REAL HAND-OVER: wave 1 enters the portal cinematic; ANY KEY (the
    // cine is skippable) drives endPortalCine, whose wave.num===1 branch is
    // the escape's sanctioned entry seam (main.js endPortalCine).
    await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      T.state.wave.num = 1; T.state.wave.cinePending = false; T.state.mode = 'portal-cine'; })()`);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'escape')()`, 5000);
    const entered = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode, auto: !!T.escape.sim, t: T.escape.sim && T.escape.sim.t,
        chromeOn: T.chromeOn(), touch: getComputedStyle(document.getElementById('touch')).display }; })()`);

    // THE ESCAPE CLOCK ADVANCES on the live display loop (a frozen mode would
    // fail this - the same guard the run clock got, applied to the sim).
    await p.sleep(900);
    const tick = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { t: T.escape.sim.t, x: Math.round(T.escape.sim.player.x) }; })()`);

    // PNG DURING the escape: the mode's own side-view frame at the device's
    // natural backing store (1170x2532 @dpr3), read back for size + pixels.
    // Sample points are computed from the LIVE canvas rect, mapping the mode's
    // virtual 480x300 (corner readout, skip rect, field) into CSS space.
    const crect = await p.evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const vmap = (vx, vy) => [Math.round(crect.x + vx / 480 * crect.w), Math.round(crect.y + vy / 300 * crect.h)];
    const shot = await p.shot('v1-escape');
    const read = await p.readShot(shot, {
      corner: vmap(10, 14),     // the ESCAPE mm:ss readout band, top-left
      skip: vmap(430, 21),      // the painted SKIP rect, top-right
      field: vmap(240, 220),    // mid-field (terrain/player band)
      sky: vmap(240, 60),       // upper band (sky/wall region)
    });

    // ONE REAL TAP on the skip affordance: the rect the RENDERER paints
    // (SKIP_RECT virtual 388..472 x 8..34), mapped through the live canvas
    // rect exactly like main.js's own pointerdown handler does.
    const tapPt = await p.evaluate(`(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      // virtual (430, 21) = the centre of SKIP_RECT (src/escape/render.js).
      return [Math.round(r.x + 430 / 480 * r.width), Math.round(r.y + 21 / 300 * r.height)];
    })()`);
    const goldBefore = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().gold)()`);
    await p.tap(tapPt[0], tapPt[1]);
    const back = await p.waitFor(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return T.state.mode === 'intermission'; })()`, 8000, 100);
    const after = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode, hp: T.state.player.hp, payload: T.escape.payload,
        gold: T.getProfile().gold }; })()`);

    return { runLive, entered, tick, read, shot, back, after, goldBefore, errors: p.errors };
  });

// ---- verdict -------------------------------------------------------------
check('run went live with all tour flags set and state.time ADVANCING (t=' + arm.runLive.time + 's)',
  arm.runLive.mode === 'playing' && arm.runLive.time > 1.0, arm.runLive);
check('the portal-entry seam handed the run to the escape (mode=escape, sim live at t=' +
  (+arm.entered.t).toFixed(2) + 's)', arm.entered.mode === 'escape' && typeof arm.entered.t === 'number',
  arm.entered);
check('screen-chrome gate is OFF for the escape (chromeOn()=false, #touch display=' + arm.entered.touch + ')',
  arm.entered.chromeOn === false && arm.entered.touch === 'none', arm.entered);
check('the escape clock ADVANCES on the live display loop (t=' + (+arm.tick.t).toFixed(2) +
  's, x=' + arm.tick.x + 'px)', arm.tick.t > (arm.entered.t || 0) + 0.4 && arm.tick.x > 0, arm.tick);
check('PNG is the natural 1170x2532 backing store', arm.read.w === 1170 && arm.read.h === 2532,
  { w: arm.read.w, h: arm.read.h });
check('PNG has gameplay pixels at the field and the readouts (not a blank/flat frame)',
  [arm.read.px.corner, arm.read.px.skip, arm.read.px.field].every((c) =>
    c && (c[0] || c[1] || c[2]) && !(c[0] === 255 && c[1] === 255 && c[2] === 255)),
  arm.read.px);
check('ONE REAL TAP on the painted SKIP rect ended the escape SOFT (intermission, hp=' +
  arm.after.hp + ', payout=0, bank unmoved)', arm.back === true && arm.after.mode === 'intermission' &&
  arm.after.hp > 0 && arm.after.payload && arm.after.payload.result === 'skip' &&
  arm.after.payload.payout === 0 && arm.after.gold === arm.goldBefore, arm.after);
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

const canonical = ART + '/v1-escape-390x844.png';
try { copyFileSync(arm.shot, canonical); console.log('PNG: ' + canonical); }
catch (e) { console.error('COPY FAILED: ' + e.message); }

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1 ESCAPE: FAIL'
  : 'VERIFY V1 ESCAPE: PASS - real Chrome 390x844 @dpr3, all 20 tour flags, run clock and escape ' +
    'clock both asserted advancing, the portal-entry seam handed the run to the escape, the ' +
    'screen-chrome gate stands down for the mode, and a real tap on the painted skip rect ends ' +
    'it soft (intermission, alive, payout 0)');
process.exit(bad ? 1 : 0);
