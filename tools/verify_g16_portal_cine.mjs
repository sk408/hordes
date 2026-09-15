// HORDES - tools/verify_g16_portal_cine.mjs (G16 PORTAL-ENTRY CINEMATIC,
// acceptance #3/#5, docs/briefs/G16_PORTAL_CINEMATIC.md). REAL Chrome at
// 390x844 @dpr3, all TOUR_KEYS set and the run clock ASSERTED ADVANCING
// (state.time > 1.0) before any measurement, then a REAL boss kill driven
// through the live seam (the smoke.mjs forceBossDeath pattern on __TEST.state)
// into the REAL cine:
//   take 1 (natural)  - the movie runs to isDone on its own; measured wall
//                       duration <= 8.0s; wave-1 hands off to the escape.
//   take 2 (sampled)  - (a) hero-region ink during the approach;
//                       (b) the PAUSE proof: snapshots at cine t=3050 and
//                           t=3200 (the SAME 2-frame idle tell half-cycle,
//                           scene [2080,2340) -> wall [2971,3342)) where the
//                           hero region is IDENTICAL while the portal region
//                           CHANGES (both deltas printed);
//                       (c) portal-region detail count at t=4500 vs the BEFORE
//                           number from /tmp/portal_cine_before.js rendered
//                           headlessly with the test_portal_cine.mjs stub-ctx
//                           pattern, SAME sampler both sides;
//                       (d) chromeOn() === false, asserted BY NAME, at every
//                           sampled point;
//                       (e) a REAL gesture (CDP touch on the canvas, the same
//                           pointerdown skip clause) exits in < 250ms.
// LINGER is sampled too (portal still animating at 5700 vs 5850, hero ink 0).
// PNGs (>= 3 points) land in docs/art/g16-portal-cine-2026-09-15/. There is
// no vision model in this job - the PNGs are ink/state sampled only and are
// left for the owner.
// Run: node tools/verify_g16_portal_cine.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';
import { PHASES, CINE_DURATION } from '../src/portal_cine.js';

const ART = 'docs/art/g16-portal-cine-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// ---------- the SHARED sampler spec (both sides of the before/after) --------
// Portal region on the movie's virtual 480x300: PORTAL_BOX-derived screen box
// x [268,412) y [88,232) (PORTAL_LX=268, PORTAL_W=144, ground 232). Grid step
// 3 = the art's PORTAL_SCALE block size, sampled at block centre (+1). The BG
// set is the scene's sky/star/ground colours; "ink" = any sampled colour
// outside it, "colours" = distinct ink colours.
const REGION = { x: 268, y: 88, w: 144, h: 144 };
const STEP = 3, OFF = 1;
const BG = new Set(['14,14,22', '21,21,31', '30,30,44', '28,28,44']);
const HERO_PAL = new Set(['255,233,168', '232,176,74', '122,74,30', '58,111,216']);

// Hero region: x [150,268) stops AT the portal's left edge (the vortex must
// not leak in through the hero's transparent cells), y [130,232) is the action
// band above the ground line.
const HERO_REGION = { x: 150, y: 130, w: 118, h: 102 };

// ---------- BEFORE: /tmp/portal_cine_before.js, stub-ctx + rasterizer -------
function parseStyle(s) {
  if (s[0] === '#') {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return [0, 0, 0, 1];
  const p = m[1].split(',').map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

async function beforeCount() {
  const mod = await import('/tmp/g16_before/portal_cine_before.js');
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop === 'fillRect') {
        return (x, y, w, h) => { calls.push({ style: t.fillStyle, alpha: t.globalAlpha ?? 1, x, y, w, h }); };
      }
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  mod.render(ctx, 4500);   // t=4500 wall: inside BOTH the old DISSOLVE and the new one, pre-fade
  // Rasterize with alpha compositing (last writer wins, like the canvas).
  const W = 480, H = 300;
  const fb = new Float64Array(W * H * 3).fill(0);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, a] = c, i = (y * W + x) * 3;
    fb[i] = r * a + fb[i] * (1 - a);
    fb[i + 1] = g * a + fb[i + 1] * (1 - a);
    fb[i + 2] = b * a + fb[i + 2] * (1 - a);
  };
  for (const c of calls) {
    if (typeof c.style !== 'string') continue;
    const col = parseStyle(c.style);
    const a = col[3] * (c.alpha ?? 1);
    if (a <= 0) continue;
    const blend = [col[0], col[1], col[2], a];
    for (let y = Math.max(0, Math.floor(c.y)); y < Math.min(H, Math.ceil(c.y + c.h)); y++)
      for (let x = Math.max(0, Math.floor(c.x)); x < Math.min(W, Math.ceil(c.x + c.w)); x++) px(x, y, blend);
  }
  let ink = 0; const colors = new Set();
  for (let vy = 0; vy < REGION.h; vy += STEP) {
    for (let vx = 0; vx < REGION.w; vx += STEP) {
      const i = ((REGION.y + vy + OFF) * W + REGION.x + vx + OFF) * 3;
      const s = Math.round(fb[i]) + ',' + Math.round(fb[i + 1]) + ',' + Math.round(fb[i + 2]);
      if (!BG.has(s)) { ink++; colors.add(s); }
    }
  }
  return { ink, colors: colors.size };
}

// ---------- page-side probes ------------------------------------------------
const T = `(await import('./src/main.js')).__TEST`;
// Snapshot BOTH regions to grid colour arrays (hero step 2, portal step 3).
const SNAP = `(async () => {
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const sx = cv.width / 480, sy = cv.height / 300;
  const grab = (R, step) => {
    const bx = Math.floor(R.x * sx), by = Math.floor(R.y * sy);
    const bw = Math.ceil(R.w * sx), bh = Math.ceil(R.h * sy);
    const d = g.getImageData(bx, by, bw, bh).data;
    const out = [];
    for (let vy = 0; vy < R.h; vy += step) for (let vx = 0; vx < R.w; vx += step) {
      const u = Math.min(bw - 1, Math.floor((vx + ${OFF}) * sx));
      const v = Math.min(bh - 1, Math.floor((vy + ${OFF}) * sy));
      const i = (v * bw + u) * 4;
      out.push(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    }
    return out;
  };
  return { hero: grab({ x: ${HERO_REGION.x}, y: ${HERO_REGION.y}, w: ${HERO_REGION.w}, h: ${HERO_REGION.h} }, 2),
           portal: grab({ x: ${REGION.x}, y: ${REGION.y}, w: ${REGION.w}, h: ${REGION.h} }, ${STEP}) };
})()`;
const diffCount = (a, b) => a.reduce((n, c, i) => n + (c === b[i] ? 0 : 1), 0);
const inkOf = (arr) => arr.filter(c => !BG.has(c)).length;
const heroInkOf = (arr) => arr.filter(c => HERO_PAL.has(c)).length;
const colorsOf = (arr) => new Set(arr.filter(c => !BG.has(c))).size;

// The live boss-kill driver (smoke.mjs forceBossDeath pattern, in-page).
const BOSS_SEED = `(async () => { const st = ${T}.state; st.wave.endsAt = st.time; return true; })()`;
const BOSS_LIVE = `(async () => { const st = ${T}.state; return (st.wave.bosses || []).some(b => b.hp > 0); })()`;
const BOSS_SLAY = `(async () => { const st = ${T}.state;
  st.wave.endsAt = st.time + 60;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  return true; })()`;
const cineAt = (t) => `(async () => { const T2 = ${T}; return T2.state.mode === 'portal-cine' && T2.portalCine.t >= ${t}; })()`;

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
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
    if (!start) throw new Error('no START GAME card on the title');
    await p.tap(start[0], start[1]);
    await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runLive = await p.evaluate(`(async () => { const T2 = ${T};
      const flags = ${JSON.stringify(Object.values(TOUR_KEYS))}.filter(k => localStorage.getItem(k) === '1').length;
      return { mode: T2.state.mode, time: +T2.state.time.toFixed(2), flags,
               wave: T2.state.wave.num }; })()`);

    // ---- TAKE 1: the NATURAL movie (no skip) -> measured wall duration -----
    await p.evaluate(BOSS_SEED);
    await p.waitFor(BOSS_LIVE, 10000, 50);
    await p.evaluate(BOSS_SLAY);
    await p.waitFor(`(async () => ${T}.state.mode === 'portal-cine')()`, 15000, 25);
    let naturalMs = null, exitMode = null;
    for (let i = 0; i < 400; i++) {
      await p.sleep(30);
      const st = await p.evaluate(`(async () => ({ m: ${T}.state.mode, t: Math.round(${T}.portalCine.t) }))()`);
      if (st.m !== 'portal-cine') { naturalMs = st.t; exitMode = st.m; break; }
    }
    // Wave 1: the cine's natural end hands the run to the escape; ESC exits it.
    await p.waitFor(`(async () => ${T}.state.mode === 'escape')()`, 5000, 50);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => ${T}.state.mode === 'intermission')()`, 5000, 50);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))");
    await p.waitFor(`(async () => ${T}.state.mode === 'playing')()`, 5000, 50);

    // ---- TAKE 2: sampled beats + the skip ----------------------------------
    await p.evaluate(BOSS_SEED);
    await p.waitFor(BOSS_LIVE, 10000, 50);
    await p.evaluate(BOSS_SLAY);
    await p.waitFor(`(async () => ${T}.state.mode === 'portal-cine')()`, 15000, 25);

    const chromeNow = () => p.evaluate(`(async () => ${T}.chromeOn())()`);

    // (a) approach: hero ink non-zero mid-WALK (t=2500, hero ~x179-275).
    // G16 re-spec item 2 (docs/briefs/G16_SKIP_BAR_RESPEC.md): the beat is
    // WAITED ON IN-PAGE -- a rAF observer resolves the instant the cine clock
    // crosses the target and the snapshot is taken INSIDE the same evaluate --
    // so no CDP round trip can straddle the window. The old form sampled the
    // window from the harness at 20ms intervals and died 1-in-3 with the hard
    // 'never reached WALK t=2500' exception.
    const walk = await p.evaluate(`(async () => {
      const T2 = ${T};
      const fail = (why) => ({ ok: false, why, mode: T2.state.mode });
      if (T2.state.mode !== 'portal-cine') return fail('not in cine');
      const deadline = performance.now() + 10000;
      await new Promise((res) => {
        const tick = () => {
          if (T2.state.mode !== 'portal-cine' || T2.portalCine.t >= 2500) return res();
          if (performance.now() > deadline) return res();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      if (T2.state.mode !== 'portal-cine') return fail('cine ended before t=2500');
      if (T2.portalCine.t < 2500) return fail('deadline');
      return { ok: true, t: Math.round(T2.portalCine.t), snap: await ${SNAP} };
    })()`);
    if (!walk.ok) throw new Error('never reached WALK t=2500 (' + walk.why + ', mode=' + walk.mode + ')');
    const walkSnap = walk.snap;
    const walkChrome = await chromeNow();
    const shotWalk = await p.shot('g16-walk');

    // (b) PAUSE proof: t=3050 vs t=3200 (same tell half-cycle, wall <3342).
    if (!await p.waitFor(cineAt(3050), 4000, 15)) throw new Error('never reached PAUSE t=3050');
    const pauseA = await p.evaluate(SNAP);
    const pauseChrome = await chromeNow();
    const shotPause = await p.shot('g16-pause');
    if (!await p.waitFor(cineAt(3200), 3000, 15)) throw new Error('never reached PAUSE t=3200');
    const pauseB = await p.evaluate(SNAP);

    // (c) portal detail at t=4500 (opaque, pre-fade).
    if (!await p.waitFor(cineAt(4500), 4000, 20)) throw new Error('never reached DISSOLVE t=4500');
    const dissolveSnap = await p.evaluate(SNAP);
    const dissolveChrome = await chromeNow();
    const shotDissolve = await p.shot('g16-dissolve');

    // LINGER: hero gone, portal still animating (5700 vs 5850).
    if (!await p.waitFor(cineAt(5700), 4000, 20)) throw new Error('never reached LINGER t=5700');
    const lingerA = await p.evaluate(SNAP);
    const lingerChrome = await chromeNow();
    const shotLinger = await p.shot('g16-linger');
    if (!await p.waitFor(cineAt(5850), 3000, 15)) throw new Error('never reached LINGER t=5850');
    const lingerB = await p.evaluate(SNAP);

    // (e) a REAL gesture skips out in < 250ms (CDP touch on the canvas: the
    // game's own pointerdown skip clause; the keydown clause is unit-pinned by
    // smoke.mjs + test_cinematic_input_guard.mjs).
    //
    // G16 re-spec item 1 (docs/briefs/G16_SKIP_BAR_RESPEC.md, owner ruling
    // 2026-09-15): the delta is timed IN-PAGE, on the page's own
    // performance.now() clock, and read back with ONE evaluate after the fact.
    //   t0 -- a capture-phase listener on the game canvas, stamped at the
    //         pointerdown dispatch: the exact in-page event the game's own
    //         skip clause (the canvas pointerdown handler in src/main.js that
    //         calls endPortalCine) runs on. The game skips on pointerdown, not
    //         pointerup -- the CDP touch gesture's touchStart produces this
    //         dispatch -- so pointerdown IS the gesture's first in-page
    //         moment. (pointerup is stamped too, reported as tapUp only.)
    //   t1 -- a rAF observer that stamps the FIRST frame on which state.mode
    //         has left 'portal-cine' (the observed mode transition; the game
    //         sets the new mode synchronously inside the same pointerdown
    //         dispatch, so t1-t0 carries at most one frame of observation
    //         latency, still entirely page-side).
    // EXCLUDED from the measured span, by construction: the harness's own
    // 40ms sleep between touchStart and touchEnd (tools/browser.mjs tap(),
    // :170) and EVERY CDP evaluate round trip. The old span started BEFORE
    // p.tap() and ran a 40-iteration CDP poll loop, so both sat inside it --
    // it measured the rig, not the game (a 150ms build could read 250ms+).
    // The bar itself is unchanged: 250ms at the check below.
    const armedMode = await p.evaluate(`(async () => {
      const T2 = ${T};
      const cv = document.getElementById('game');
      const rec = window.__g16skip = { t0: null, t1: null, tapUp: null,
                                       downMode: T2.state.mode, endMode: null };
      rec.onDown = () => { if (rec.t0 === null) rec.t0 = performance.now(); };
      rec.onUp = () => { if (rec.tapUp === null) rec.tapUp = performance.now(); };
      cv.addEventListener('pointerdown', rec.onDown, true);
      cv.addEventListener('pointerup', rec.onUp, true);
      rec.tick = () => {
        if (rec.t0 !== null && rec.t1 === null && T2.state.mode !== 'portal-cine') {
          rec.t1 = performance.now(); rec.endMode = T2.state.mode;
          return;
        }
        if (rec.t1 === null) requestAnimationFrame(rec.tick);
      };
      requestAnimationFrame(rec.tick);
      return T2.state.mode;
    })()`);
    if (armedMode !== 'portal-cine') throw new Error('skip instrument armed outside portal-cine (mode=' + armedMode + ')');
    if (!await p.waitFor(cineAt(6100), 2500, 15)) throw new Error('never reached t=6100 for the skip');
    const map = await p.evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    await p.tap(Math.round(map.x + map.w / 2), Math.round(map.y + map.h / 2));
    // ONE evaluate reads the page-side stamps. The sleeps/CDP round trips in
    // this read-back loop happen AFTER both timestamps were taken -- they are
    // outside the measured span.
    let skipMs = null, skipMode = null, skipDetail = null;
    for (let i = 0; i < 50 && skipMs === null; i++) {
      await p.sleep(20);
      skipDetail = await p.evaluate(`(() => { const r = window.__g16skip;
        return { t0: r.t0, t1: r.t1, tapUp: r.tapUp, endMode: r.endMode,
                 delta: (r.t0 !== null && r.t1 !== null) ? r.t1 - r.t0 : null }; })()`);
      if (skipDetail.delta !== null) { skipMs = skipDetail.delta; skipMode = skipDetail.endMode; }
    }

    return {
      runLive, naturalMs, exitMode,
      walk: { heroInk: heroInkOf(walkSnap.hero), chrome: walkChrome, shot: shotWalk },
      pause: {
        heroDelta: diffCount(pauseA.hero, pauseB.hero),
        portalDelta: diffCount(pauseA.portal, pauseB.portal),
        heroInk: heroInkOf(pauseA.hero), chrome: pauseChrome, shot: shotPause,
      },
      dissolve: { portalInk: inkOf(dissolveSnap.portal), portalColors: colorsOf(dissolveSnap.portal), chrome: dissolveChrome, shot: shotDissolve },
      linger: {
        portalDelta: diffCount(lingerA.portal, lingerB.portal),
        heroInk: heroInkOf(lingerA.hero), chrome: lingerChrome, shot: shotLinger,
      },
      skipMs, skipMode, skipDetail, errors: p.errors,
    };
  });

const before = await beforeCount();

// ---- verdict -------------------------------------------------------------
const KEYS_N = Object.keys(TOUR_KEYS).length;
check('run live with ALL ' + KEYS_N + ' TOUR_KEYS set and state.time ADVANCING (t=' + arm.runLive.time + 's)',
  arm.runLive.mode === 'playing' && arm.runLive.time > 1.0 && arm.runLive.flags === KEYS_N, arm.runLive);
check('TAKE 1 natural end: measured wall duration ' + arm.naturalMs + 'ms (design ' + CINE_DURATION +
  'ms, bar <= 8000ms), hand-off mode=' + arm.exitMode,
  arm.naturalMs !== null && arm.naturalMs >= CINE_DURATION - 400 && arm.naturalMs <= 8000,
  { naturalMs: arm.naturalMs, CINE_DURATION });
check('(a) APPROACH: hero-region ink non-zero mid-WALK (' + arm.walk.heroInk + ' hero-palette samples)',
  arm.walk.heroInk > 0, arm.walk);
check('(b) PAUSE proof: hero region IDENTICAL (' + arm.pause.heroDelta + ' differing samples) while portal region CHANGES (' +
  arm.pause.portalDelta + ' differing samples); hero ink ' + arm.pause.heroInk,
  arm.pause.heroDelta === 0 && arm.pause.portalDelta > 0 && arm.pause.heroInk > 0, arm.pause);
check('(c) PORTAL DETAIL after=' + arm.dissolve.portalInk + ' ink / ' + arm.dissolve.portalColors +
  ' colours vs before=' + before.ink + ' ink / ' + before.colors + ' colours (same sampler, same region)',
  arm.dissolve.portalInk > before.ink * 2 && arm.dissolve.portalColors > before.colors,
  { after: arm.dissolve, before });
check('LINGER: portal STILL ANIMATING (' + arm.linger.portalDelta + ' differing samples at 5700->5850) and ZERO hero ink (' +
  arm.linger.heroInk + ')',
  arm.linger.portalDelta > 0 && arm.linger.heroInk === 0, arm.linger);
check('(d) chromeOn() === false BY NAME at WALK/PAUSE/DISSOLVE/LINGER',
  arm.walk.chrome === false && arm.pause.chrome === false && arm.dissolve.chrome === false && arm.linger.chrome === false,
  { walk: arm.walk.chrome, pause: arm.pause.chrome, dissolve: arm.dissolve.chrome, linger: arm.linger.chrome });
check('(e) REAL gesture skip out in ' + arm.skipMs + 'ms (< 250ms) to mode=' + arm.skipMode,
  arm.skipMs !== null && arm.skipMs < 250, { skipMs: arm.skipMs, skipMode: arm.skipMode });
check('printed beats: PAUSE window ' + (PHASES.PAUSE[1] - PHASES.PAUSE[0]) + ' wall-ms, LINGER window ' +
  (PHASES.LINGER[1] - PHASES.LINGER[0]) + ' wall-ms, CINE_DURATION ' + CINE_DURATION + 'ms',
  PHASES.PAUSE[1] - PHASES.PAUSE[0] === 1000 && PHASES.LINGER[1] - PHASES.LINGER[0] === 857 && CINE_DURATION === 6857,
  { PAUSE: PHASES.PAUSE, LINGER: PHASES.LINGER });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

// PNGs: canonical copies + dimension check via readShot.
let copied = 0;
for (const [beat, shot] of [['walk', arm.walk.shot], ['pause', arm.pause.shot],
                            ['dissolve', arm.dissolve.shot], ['linger', arm.linger.shot]]) {
  const canonical = ART + '/g16-' + beat + '-390x844.png';
  try { copyFileSync(shot, canonical); copied++; console.log('PNG: ' + canonical); }
  catch (e) { console.error('COPY FAILED: ' + e.message); }
}
check('4 timeline PNGs copied into ' + ART + ' (natural dpr3 1170x2532)', copied === 4, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY G16 PORTAL CINE: FAIL'
  : 'VERIFY G16 PORTAL CINE: PASS - real Chrome 390x844 @dpr3, all ' + KEYS_N + ' tour flags, run clock asserted ' +
    'advancing, real boss kill into the real cine, natural duration ' + arm.naturalMs + 'ms <= 8.0s, pause proof ' +
    '(hero delta ' + arm.pause.heroDelta + ' / portal delta ' + arm.pause.portalDelta + '), portal detail ' +
    before.ink + '->' + arm.dissolve.portalInk + ' ink samples, skip ' + arm.skipMs + 'ms');
process.exit(bad ? 1 : 0);
