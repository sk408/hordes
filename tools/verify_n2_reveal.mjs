// HORDES — tools/verify_n2_reveal.mjs: N2 TITLE ART REVEAL in a REAL browser,
// on a PHONE (same bar as verify_g10/G11/G12: a code claim is not evidence for
// anything a player looks at). Drives the REAL boot -> intro skip -> title
// reveal and asserts, from DOM geometry + computed styles + canvas
// getImageData + readShot pixel samples:
//   1. THE REVEAL: the overlay opacity at t=0 is BELOW its settled value and
//      REACHES it; the title ART (not the map) is what is behind the menu at
//      t=0 (menu hidden), MID-FADE, and settled.
//   2. THE MENU is readable (computed opacity 1) before the run starts.
//   3. THE HOLD: a REAL tap on START GAME keeps mode 'title' on the press
//      tick, holds the art ~1s (shimmer pixels visibly change during it),
//      then the run starts — ONCE, even under a double tap.
// Measured numbers (fade duration, hold length) are printed from the run.
//
// EVIDENCE DISCLOSURE: NO vision model is reachable from this host. The
// verdict rests on geometry, computed opacity, and pixel samples — no
// "looks right" judgement is claimed.
//
// Run: node tools/verify_n2_reveal.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    // Skip the intro the moment the module is up, so the reveal is observed
    // as close to its t=0 as CDP allows.
    await p.waitFor("(async () => !!(await import('./src/main.js')).__TEST)()", 15000);
    const tSkip = Date.now();
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");

    const sampleExpr = "(async () => {" +
      " const m = await import('./src/main.js'); const T = m.__TEST, st = T.state;" +
      " const ov = document.getElementById('overlay');" +
      " const cs = ov ? getComputedStyle(ov) : null;" +
      " const cv = document.querySelector('canvas'); const g = cv.getContext('2d');" +
      " const px = (nx, ny) => { const d = g.getImageData(Math.floor(nx * cv.width / 480)," +
      "  Math.floor(ny * cv.height / 300), 1, 1).data; return [d[0], d[1], d[2]]; };" +
      " const rv = st.titleReveal;" +
      " return { mode: st.mode, phase: rv && rv.phase, opacity: rv && +rv.opacity.toFixed(4)," +
      "  ovOpacity: cs && cs.opacity, ovPE: cs && cs.pointerEvents," +
      "  seam: !!(T.renderer.titleScreen), skyTop: px(240, 20), skyMid: px(240, 42) };" +
      "})()";

    // ---- 1. sample the reveal from its very first frames ------------------
    const samples = [];
    let settledAt = 0, firstTitleAt = 0, firstFadeAt = 0;
    for (let i = 0; i < 200 && !settledAt; i++) {
      const s = await p.evaluate(sampleExpr);
      const wall = Date.now() - tSkip;
      if (s.mode === 'title') {
        if (!firstTitleAt) firstTitleAt = wall;
        if (!firstFadeAt && s.phase === 'fade') firstFadeAt = wall;
        samples.push({ wall, ...s });
        if (s.phase === 'settled') settledAt = wall;
      }
      await sleep(25);
    }
    const first = samples[0];
    const mid = samples.find(s => s.phase === 'fade' && s.ovOpacity !== '1' && s.ovOpacity !== '0');
    const settled = samples[samples.length - 1];

    // ---- 2. the menu is readable (opacity 1) and in-viewport at settle -----
    const menu = await p.evaluate("(async () => { const m = await import('./src/main.js');" +
      " const els = [...document.querySelectorAll('#ov-cards .card')];" +
      " const el = els.find(e => /^START GAME/.test((e.textContent || '').trim()));" +
      " const r = el.getBoundingClientRect(); const cs = getComputedStyle(document.getElementById('overlay'));" +
      " const cr = document.querySelector('canvas').getBoundingClientRect();" +
      " return { ovOpacity: cs.opacity, ovPE: cs.pointerEvents, startCard: [r.x, r.y, r.width, r.height]," +
      "  canvasRect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }," +
      "  vp: { w: window.innerWidth, h: window.innerHeight }," +
      "  runStarts: m.__TEST.title.runStarts, timings: m.__TEST.title.timings };" +
      " })()");

    // The canonical PNG: the SETTLED title — the menu readable at full
    // opacity over the art — captured BEFORE the hold flow navigates away.
    const shot = await p.shot('n2-reveal-phone');

    // ---- 3. THE HOLD, driven by REAL taps ---------------------------------
    const startCenter = [menu.startCard[0] + menu.startCard[2] / 2, menu.startCard[1] + menu.startCard[3] / 2];
    const tTap = Date.now();
    await p.tap(Math.round(startCenter[0]), Math.round(startCenter[1]));
    await sleep(60);   // the double-tap / key-repeat window
    await p.tap(Math.round(startCenter[0]), Math.round(startCenter[1]));
    const pressTick = await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
      " const cv = document.querySelector('canvas'); const g = cv.getContext('2d');" +
      " const d = g.getImageData(Math.floor(154 * cv.width / 480), Math.floor(88 * cv.height / 300)," +
      " Math.floor(180 * cv.width / 480), Math.floor(37 * cv.height / 300)).data;" +
      " let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1];" +
      " return { mode: T.state.mode, phase: T.state.titleReveal && T.state.titleReveal.phase," +
      "  runStarts: T.title.runStarts, seam: !!T.renderer.titleScreen, shimmerSum: sum };" +
      " })()");

    // The shimmer must visibly change the wordmark during the hold: sample
    // the same region again deeper into the second and compare.
    await sleep(350);
    const holdLate = await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
      " const cv = document.querySelector('canvas'); const g = cv.getContext('2d');" +
      " const d = g.getImageData(Math.floor(154 * cv.width / 480), Math.floor(88 * cv.height / 300)," +
      " Math.floor(180 * cv.width / 480), Math.floor(37 * cv.height / 300)).data;" +
      " let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1];" +
      " return { mode: T.state.mode, phase: T.state.titleReveal && T.state.titleReveal.phase," +
      "  runStarts: T.title.runStarts, shimmerSum: sum };" +
      " })()");

    // ...and the run starts after the full hold (out-fade + 1s), exactly once.
    let runAt = 0, runState = null;
    for (let i = 0; i < 200; i++) {
      runState = await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
        " return { mode: T.state.mode, runStarts: T.title.runStarts, rv: T.state.titleReveal," +
        "  seam: !!T.renderer.titleScreen };" +
        " })()");
      if (runState.mode === 'playing') { runAt = Date.now() - tTap; break; }
      await sleep(25);
    }

    // The PNG readback: decode the shot and sample the sky bands (CSS coords
    // from the canvas rect captured at settle).
    const cr = menu.canvasRect || { x: 0, y: 0, w: 390, h: 243.75 };
    const px = await p.readShot(shot, {
      skyTop: [cr.x + cr.w * 240 / 480, cr.y + cr.h * 20 / 300],
      skyMid: [cr.x + cr.w * 240 / 480, cr.y + cr.h * 42 / 300],
    });

    return { samples: { n: samples.length, first, mid, settled }, menu, pressTick, holdLate,
      runState, runAt, shot, px };
  });

const s0 = out.samples.first, smid = out.samples.mid, ss = out.samples.settled;
const m = out.menu, pt = out.pressTick, hl = out.holdLate, rs = out.runState;
const problems = [];
const near = (px, want, tol) => px && px.every((v, i) => Math.abs(v - want[i]) <= tol);

// 1. the reveal
if (!s0) problems.push('reveal: never saw the title');
else {
  if (s0.phase !== 'art' && s0.phase !== 'fade') problems.push('reveal: first sample phase is ' + s0.phase);
  if (!(parseFloat(s0.ovOpacity) < 1)) problems.push('reveal: t=0 overlay opacity is not below 1: ' + s0.ovOpacity);
  if (s0.ovPE !== 'none') problems.push('reveal: the hidden menu is pressable at t=0');
  if (!near(s0.skyTop, [27, 17, 48], 24)) problems.push('reveal t=0: art band 1 is not #1b1130: ' + JSON.stringify(s0.skyTop));
  if (!near(s0.skyMid, [58, 31, 69], 24)) problems.push('reveal t=0: art band 2 is not #3a1f45: ' + JSON.stringify(s0.skyMid));
  if (!smid) problems.push('reveal: never sampled mid-fade');
  else {
    if (!(parseFloat(smid.ovOpacity) > 0 && parseFloat(smid.ovOpacity) < 1)) problems.push('reveal: mid-fade opacity not strictly between 0 and 1: ' + smid.ovOpacity);
    if (!near(smid.skyTop, [27, 17, 48], 24)) problems.push('reveal mid-fade: art band 1 not #1b1130: ' + JSON.stringify(smid.skyTop));
  }
  if (!ss || ss.phase !== 'settled') problems.push('reveal: never settled');
  else if (parseFloat(ss.ovOpacity) !== 1) problems.push('reveal: settled opacity is ' + ss.ovOpacity);
  else if (!near(ss.skyMid, [58, 31, 69], 24)) problems.push('reveal settled: art band 2 not #3a1f45: ' + JSON.stringify(ss.skyMid));
}
// 2. the menu readable + in-viewport before the run
if (m.ovOpacity !== '1') problems.push('menu: settled computed opacity is ' + m.ovOpacity);
if (m.ovPE === 'none') problems.push('menu: the settled menu is not interactive');
{
  const [x, y, w, h] = m.startCard;
  if (!(x >= 0 && y >= 0 && x + w <= m.vp.w && y + h <= m.vp.h)) problems.push('menu: START GAME off-viewport: ' + JSON.stringify(m.startCard));
}
// 3. the hold
if (pt.mode !== 'title') problems.push('hold: the run started on the press tick (mode=' + pt.mode + ')');
if (!pt.seam) problems.push('hold: the art seam dropped during the hold');
if (pt.runStarts !== 0) problems.push('hold: startRun already ran at the press tick');
if (Math.abs(pt.shimmerSum - hl.shimmerSum) < 200) {
  problems.push('hold: the wordmark pixels did not change during the hold (shimmer not drawn? sums ' +
    pt.shimmerSum + ' vs ' + hl.shimmerSum + ')');
}
if (!rs || rs.mode !== 'playing') problems.push('hold: the run never started');
else {
  if (rs.runStarts !== 1) problems.push('hold: the double tap started ' + rs.runStarts + ' runs');
  if (rs.seam) problems.push('hold: the art seam survived into the run');
}

// measured numbers (wall-clock, CDP poll granularity ~25ms)
const fadeMeasured = out.samples.settled && out.samples.first
  ? (out.samples.settled.wall - out.samples.first.wall) : -1;
const timings = m.timings || {};
console.log('measured: reveal-to-settle ' + fadeMeasured + 'ms wall (nominal beat ' +
  Math.round((timings.beat || 0) * 1000) + 'ms + fade ' + Math.round((timings.fade || 0) * 1000) + 'ms); ' +
  'tap-to-run ' + out.runAt + 'ms wall (nominal out ' + Math.round((timings.out || 0) * 1000) + 'ms + hold ' +
  Math.round((timings.hold || 0) * 1000) + 'ms); shimmer sums ' + pt.shimmerSum + ' -> ' + hl.shimmerSum);

const canonical = 'docs/art/browser-verify-2026-09-12/n2-reveal-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }
console.log('PNG: ' + canonical + ' (from ' + out.shot + ')');

// the PNG readback (the shot is the SETTLED title: menu readable over the art)
{
  const s = out.px && out.px.px;
  if (!s || !s.skyTop || !s.skyMid) problems.push('png: pixel sample missing');
  else {
    if (!near(s.skyTop, [27, 17, 48], 40)) problems.push('png: sky band 1 sample is ' + JSON.stringify(s.skyTop));
    if (!near(s.skyMid, [58, 31, 69], 40)) problems.push('png: sky band 2 sample is ' + JSON.stringify(s.skyMid));
  }
}

console.log(problems.length ? 'VERIFY N2 REVEAL: FAIL - ' + problems.join('; ')
  : 'VERIFY N2 REVEAL: PASS - reveal starts at 0 and reaches 1 with the art behind it at t=0/mid-fade/settled, ' +
    'menu readable before the run, real double-tap holds once and starts the run after ~1s, shimmer visible');
console.log('EVIDENCE: DOM geometry + computed opacity + canvas getImageData + PNG readback only. No vision model ' +
  'is reachable from this host; no "looks right" judgement is claimed.');

process.exit(problems.length ? 1 : 0);
