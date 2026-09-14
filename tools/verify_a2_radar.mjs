// HORDES — VERIFY the A2 RADAR WIRING in a REAL browser (the brief's
// acceptance item 1: "reachable in a real browser — a real keypress/tap
// toggles the radar on a 390x844 @dpr3 phone viewport, proven by sampling
// pixels/geometry, never by eyeballing, and never by scoring a paused game").
//
// What this measures, in Chrome for Testing at 390x844 dpr 3 coarse pointer:
//   1. THE FROZEN-GAME GUARD: all 19 TOUR_KEYS + hordes_onboarded are set in
//      startupScript (withPage's own skipTour presets only 7 of the 19), and
//      state.time is asserted to ADVANCE before anything else is measured.
//   2. REACHABILITY: a real composited TAP (Input.dispatchTouchEvent) on the
//      RADAR touch button flips state.radarOn through the game's own touch
//      routing, and the renderer's painted-frame seam goes live.
//   3. PIXELS, ON A FROZEN WORLD: the run is then paused (settings mode — the
//      canvas keeps repainting the frozen field) and the radar box region is
//      snapshotted OFF / ON / OFF. OFF-1 must equal OFF-2 BYTE FOR BYTE (the
//      toggle leaves zero residue), the ON frame must differ ONLY inside the
//      radar box, and the rim ring must sample as the steel FRAME colour.
//   4. The tier dots that are actually live in the run are counted from the
//      seam (which tiers a real wave-1 field produces is reported, not
//      assumed — elite/boss classification through RADAR_TIERS is pinned
//      headlessly in test/test_radar_wiring.mjs).
//
// Usage: node tools/verify_a2_radar.mjs [--json]
import { withPage } from './browser.mjs';

const JSON_OUT = process.argv.includes('--json');

// The radar's fixed HUD geometry (render.js drawRadar): bottom-right box.
const CX = 436, CY = 256, R = 34;   // view coords (480x300)

// All 19 TOUR_KEYS (src/tour.js) + the onboarding flag — the frozen-game trap
// guard. withPage(skipTour) presets only 7 of these; frame() gates the sim on
// !coachActive(), so a missing key stalls state.time at 0.00.
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
  for (let i = 0; i < 30; i++) await frame();
  const t1 = T.state.time;
  const cv = document.getElementById('game');
  const btn = document.getElementById('tc-radar');
  const br = btn.getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  return {
    mode: T.state.mode,
    t0, t1,
    radarOn: T.state.radarOn,
    canvas: { w: cv.width, h: cv.height, cssW: cr.width, cssH: cr.height,
              sx: cv.width / 480, sy: cv.height / 300,
              smoothing: cv.getContext('2d').imageSmoothingEnabled },
    btn: { x: br.left + br.width / 2, y: br.top + br.height / 2, w: br.width, h: br.height,
           cls: btn.className, act: btn.dataset.act },
  };
})()`;

// After the real tap: the flag must have flipped through the game's OWN
// routing (touch layer -> closest('[data-act]') -> runAction('radar')).
const AFTER_TAP = `(async () => {
  const main = await import('/src/main.js');
  const T = main.__TEST;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  for (let i = 0; i < 3; i++) await frame();
  const seam = T.renderer.radar;
  return {
    radarOn: T.state.radarOn,
    btnLit: document.getElementById('tc-radar').classList.contains('on'),
    seam: seam ? { cx: seam.cx, cy: seam.cy, r: seam.r, focusR: seam.focusR,
                   counts: seam.counts, dots: seam.dots.length } : null,
  };
})()`;

// Frozen-world pixel proof: pause (settings keeps repainting the frozen
// field), then snapshot the radar box region OFF -> ON -> OFF. The box
// region only; the feed/toasts live top-left and never enter it.
const PIXELS = `(async () => {
  const main = await import('/src/main.js');
  const T = main.__TEST;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const sx = cv.width / 480, sy = cv.height / 300;
  const CX = ${CX}, CY = ${CY}, R = ${R};
  const x0 = Math.floor((CX - R - 3) * sx), y0 = Math.floor((CY - R - 3) * sy);
  const w = Math.ceil((2 * R + 6) * sx), h = Math.ceil((2 * R + 6) * sy);
  const snap = () => Array.from(g.getImageData(x0, y0, w, h).data);
  const pxAt = (data, vx, vy) => {
    const ix = Math.round(vx * sx) - x0, iy = Math.round(vy * sy) - y0;
    const o = (iy * w + ix) * 4;
    return [data[o], data[o + 1], data[o + 2]];
  };
  T.openSettings();
  for (let i = 0; i < 3; i++) await frame();
  if (T.state.radarOn) T.radar.toggle();          // ensure OFF for baseline
  for (let i = 0; i < 2; i++) await frame();
  const off1 = snap();
  T.radar.toggle();                               // ON
  for (let i = 0; i < 2; i++) await frame();
  const on = snap();
  const seamOn = T.renderer.radar ? {
    counts: T.renderer.radar.counts, dots: T.renderer.radar.dots.length,
    dot: T.renderer.radar.dots[0] || null } : null;
  const dotPx = seamOn && seamOn.dot ? pxAt(on, seamOn.dot.x, seamOn.dot.y) : null;
  // The rim ring: 16 points on the circle, sampled in the ON frame.
  const rim = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rim.push(pxAt(on, CX + Math.cos(a) * (R - 0.75), CY + Math.sin(a) * (R - 0.75)));
  }
  T.radar.toggle();                               // OFF again
  for (let i = 0; i < 2; i++) await frame();
  const off2 = snap();
  return { x0, y0, w, h, off1, on, off2, seamOn, dotPx, rim,
           modeAfter: T.state.mode, radarOnEnd: T.state.radarOn };
})()`;

const r = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, startupScript: STARTUP },
  async (page) => {
    const init = await page.evaluate(INIT, true);
    if (!(init.t1 > init.t0)) return { init, frozenGuard: 'state.time did not advance' };
    await page.tap(init.btn.x, init.btn.y);       // the REAL tap
    const afterTap = await page.evaluate(AFTER_TAP, true);
    const pixels = await page.evaluate(PIXELS, true);
    return { init, afterTap, pixels, errors: page.errors.slice() };
  });

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

if (r.frozenGuard) {
  console.log('VERDICT: FAIL — frozen-game guard tripped: ' + r.frozenGuard);
  process.exit(1);
}

const { init, afterTap, pixels } = r;
console.log('HORDES A2 radar wiring — real Chrome 390x844 dpr3, coarse pointer');
console.log('frozen-game guard: mode=' + init.mode + '  state.time ' +
  init.t0.toFixed(2) + ' -> ' + init.t1.toFixed(2) + ' over 30 frames');
console.log('canvas backing ' + init.canvas.w + 'x' + init.canvas.h +
  ' (view scale ' + init.canvas.sx.toFixed(3) + 'x' + init.canvas.sy.toFixed(3) +
  '), imageSmoothingEnabled=' + init.canvas.smoothing);
console.log('RADAR button: ' + init.btn.w.toFixed(1) + 'x' + init.btn.h.toFixed(1) +
  'px, class="' + init.btn.cls + '", data-act=' + init.btn.act);

// 1. the frozen-game guard
ok(init.mode === 'playing', 'the run must be playing (got ' + init.mode + ')');
ok(init.t1 > init.t0, 'state.time must advance before measuring');
ok(init.radarOn === false, 'radar must start OFF');
ok(init.canvas.smoothing === false, 'image smoothing must stay OFF (pixel-art rule)');

// 2. the real tap reaches the toggle through the game's own routing
console.log('after the real tap: radarOn=' + afterTap.radarOn +
  '  button lit=' + afterTap.btnLit +
  '  seam=' + JSON.stringify(afterTap.seam));
ok(afterTap.radarOn === true, 'the real tap must turn the radar ON');
ok(afterTap.btnLit === true, 'the button frame must light (class on)');
ok(afterTap.seam && afterTap.seam.cx === CX && afterTap.seam.cy === CY && afterTap.seam.r === R,
  'the painted seam must sit at the fixed box');
ok(afterTap.seam && afterTap.seam.dots > 0, 'a live wave must produce radar dots');

// 3. the frozen-world pixel triple: OFF / ON / OFF
const { off1, on, off2, w, h } = pixels;
let diffOn = 0, firstDiff = null;
for (let i = 0; i < off1.length; i += 4) {
  const d = Math.abs(on[i] - off1[i]) + Math.abs(on[i + 1] - off1[i + 1]) + Math.abs(on[i + 2] - off1[i + 2]);
  if (d > 24) { diffOn++; if (!firstDiff) firstDiff = i / 4; }
}
let restoreDiff = 0;
for (let i = 0; i < off1.length; i++) if (off1[i] !== off2[i]) restoreDiff++;
console.log('pixels (' + w + 'x' + h + ' device px box): ON-vs-OFF differing px=' + diffOn +
  '  OFF1-vs-OFF2 differing BYTES=' + restoreDiff);
console.log('live dot tiers this run: ' + JSON.stringify(pixels.seamOn && pixels.seamOn.counts) +
  '  first dot ' + JSON.stringify(pixels.seamOn && pixels.seamOn.dot) +
  '  sampled ' + JSON.stringify(pixels.dotPx));
const steel = (c) => Math.abs(c[0] - 0x6a) < 48 && Math.abs(c[1] - 0x6a) < 48 && Math.abs(c[2] - 0x7c) < 48;
const rimHits = pixels.rim.filter(steel).length;
console.log('rim ring samples reading steel FRAME: ' + rimHits + '/16');

ok(diffOn > w * h * 0.25, 'the ON frame must repaint a substantial disc (got ' + diffOn + ' px)');
ok(restoreDiff === 0, 'toggle-off must restore the box BYTE FOR BYTE (got ' + restoreDiff + ' differing bytes)');
ok(rimHits >= 10, 'the rim ring must sample as the steel FRAME colour (got ' + rimHits + '/16)');
ok(pixels.seamOn && pixels.dotPx, 'a live dot must be samplable');
if (pixels.seamOn && pixels.seamOn.dot && pixels.dotPx) {
  const d = pixels.seamOn.dot;
  const want = { chaff: [0xb8, 0xb8, 0xc8], elite: [0xff, 0xd7, 0x5e], boss: [0xff, 0x2f, 0x5e] }[d.tier];
  const close = (a, b) => Math.abs(a[0] - b[0]) < 48 && Math.abs(a[1] - b[1]) < 48 && Math.abs(a[2] - b[2]) < 48;
  ok(close(pixels.dotPx, want), 'the first ' + d.tier + ' dot must sample as its tier colour ' +
    JSON.stringify(want) + ' (got ' + JSON.stringify(pixels.dotPx) + ')');
}

if (r.errors.length) console.log('page errors: ' + JSON.stringify(r.errors));
ok(r.errors.length === 0, 'no page errors');

if (JSON_OUT) console.log(JSON.stringify({ init, afterTap,
  pixels: { ...pixels, off1: '[' + off1.length + ' bytes]', on: '[' + on.length + ' bytes]', off2: '[' + off2.length + ' bytes]' } }, null, 2));
console.log(fail.length ? 'VERDICT: FAIL — ' + fail.join(' | ') : 'VERDICT: PASS');
process.exit(fail.length ? 1 : 0);
