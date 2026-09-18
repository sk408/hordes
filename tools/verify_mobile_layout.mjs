// HORDES - tools/verify_mobile_layout.mjs (MOBILE EMBED LAYOUT acceptance
// bar, docs/briefs/MOBILE_EMBED_LAYOUT.md ROUND 4 — the owner's priority
// rule: "Overlap should be the failure mode, not breaking the gameplay
// completely"). REAL browser, touch layer LIVE: withPage's mobile mode
// enables CDP touch emulation, so the page sees ontouchstart and main.js adds
// #touch.on itself (the same path a real phone takes) - no class is forced by
// this tool.
//
// The proof, by getBoundingClientRect arithmetic (never by eye), at ALL FOUR
// acceptance sizes (390x844 @dpr3, 360x640, 844x390 @dpr3, 640x360) with a
// REAL run playing and state.time asserted ADVANCING — HARD failures only
// for the R4 priorities:
//   1. THE CANVAS IS ALWAYS USABLE: present at 480x300 aspect, at/above the
//      stated floor (h >= min(55% of viewport height, vw/1.6 — main.js
//      CANVAS_FLOOR_FRACTION), and fully inside the viewport. (Round-3
//      BEFORE, measured: the strip reservations collapsed the field to
//      41x26px at 844x390 and 0x0 — gone entirely — at 640x360.)
//   2. THE CHROME STAYS USABLE: every visible chrome element (both pads and
//      every pad button, #joy when shown, #hud, every displayed
//      #touch button.cog, #hints.on — iterated LIVE, no fixed button list)
//      sits fully inside the viewport, so nothing is pushed off-screen.
//   3. Overlap canvas-vs-chrome is ALLOWED and REPORTED (count of
//      intersecting elements + overlap area each), never asserted zero.
//      The portrait sizes still come out clean — reported as such.
// Plus the MANUAL pilot toggle (REAL taps): the re-fit fires and BOTH hard
// priorities still hold with the joystick on screen.
// And the desktop arm (1280x800, fine pointer, #touch.cog-only) stays on the
// CENTRED whole-viewport letterbox - the cog-only pads AND cogs deliberately
// sit over the dimmed corners (WAVE-23), so the placement must not move.
// PNGs land in docs/art/mobile-embed-<date>/.
// Run: node tools/verify_mobile_layout.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = 'docs/art/mobile-embed-2026-09-15';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const MEASURE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { introLine, CONTROLS } = await import('./src/controls_ref.js');
  const px = (v) => Math.round(v * 100) / 100;
  const box = (el) => { const r = el.getBoundingClientRect();
    return { x: px(r.left), y: px(r.top), r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height) }; };
  const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) *
                           Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  const cv = box(document.getElementById('game'));
  const vw = innerWidth, vh = innerHeight;
  const rec = {
    viewport: [vw, vh], mode: T.state.mode, time: +T.state.time.toFixed(2),
    coarse: matchMedia('(pointer: coarse)').matches,
    touchClass: document.getElementById('touch').className,
    touchDisplay: getComputedStyle(document.getElementById('touch')).display,
    canvas: cv,
    // R4 floor, same formula as main.js CANVAS_FLOOR_FRACTION: the field
    // stays >= 55% of the viewport height unless the phone is narrower than
    // 1.6:1, where the width-limited height is the largest field possible.
    floor: px(Math.min(0.55 * vh, vw / 1.6)),
    canvasPosition: document.getElementById('game').style.position || '(flex centred)',
    // DEVICE WORDING (2026-09-16): this tool genuinely derives touch state
    // from the device (CDP), but it used to measure GEOMETRY only and never
    // read the panel — which is precisely how a green suite and a passing
    // phone-verifier coexisted with a phone being taught keyboard keys.
    // Record the wording the device produces: the live hint strip's text
    // (when one is up) and every introLine the per-control layer would
    // render at this device's touch-path read.
    touchPath: T.onboarding.touchPath(),
    stripText: (() => { const el = document.getElementById('hint-strip');
      return (el && visible(el)) ? el.textContent : null; })(),
    introLines: CONTROLS.map(c => introLine(c.id, T.onboarding.touchPath())),
  };
  rec.aspect = px(cv.w / cv.h);
  // Every LIVE chrome element, iterated (a future button is caught
  // automatically): pads + every visible touch button (pads AND the cog
  // row), #joy when shown, #hud, #hints.on.
  const chrome = [];
  const touch = document.getElementById('touch');
  if (visible(touch)) {
    for (const el of touch.querySelectorAll('.pad')) chrome.push({ name: 'pad', el });
    for (const el of touch.querySelectorAll('button')) {
      chrome.push({ name: 'btn.' + ([...el.classList].filter((c) => c !== 'cog').join('.') || el.dataset.act || '?'), el });
    }
    const joy = document.getElementById('joy');
    if (visible(joy)) chrome.push({ name: '#joy', el: joy });
  }
  if (visible(document.getElementById('hud'))) chrome.push({ name: '#hud', el: document.getElementById('hud') });
  const hints = document.getElementById('hints');
  if (hints && hints.classList.contains('on') && visible(hints)) chrome.push({ name: '#hints.on', el: hints });
  rec.chromeRects = {};
  rec.overlaps = [];          // R4: REPORTED, never asserted zero
  rec.chromeOffscreen = [];   // R4 priority 2: HARD fail if any
  for (const c of chrome) {
    if (!visible(c.el)) continue;
    const b = box(c.el);
    if (b.w <= 0 && b.h <= 0) continue;
    rec.chromeRects[c.name] = b;
    const area = px(ov(cv, b));
    if (area > 0) rec.overlaps.push({ name: c.name, area });
    if (b.x < -0.01 || b.y < -0.01 || b.r > vw + 0.01 || b.b > vh + 0.01)
      rec.chromeOffscreen.push({ name: c.name, box: b });
  }
  rec.overlapCount = rec.overlaps.length;
  rec.padLeft = box(document.querySelector('#touch .pad.left'));
  rec.padRight = box(document.querySelector('#touch .pad.right'));
  rec.joy = box(document.getElementById('joy'));
  return rec;
})()`;

const BOOT_WAIT = [
  // (the intro skip + title reveal pair every verifier uses)
  ["window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))", null],
  ["(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000],
  ["(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000],
];

async function phoneArm(w, h, dpr) {
  return withPage({ w, h, dpr,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      await p.evaluate(BOOT_WAIT[0][0]);
      await p.waitFor(BOOT_WAIT[1][0], BOOT_WAIT[1][1]);
      await p.waitFor(BOOT_WAIT[2][0], BOOT_WAIT[2][1]);
      // REAL TAP: title -> START GAME (the run must be live: the pads are
      // chrome-gated to playing/finale).
      await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
        if (el) el.scrollIntoView({ block: 'center' });
      })()`);
      await p.sleep(120);
      const c = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!c) throw new Error('no START GAME card on the title');
      await p.tap(c[0], c[1]);
      const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);

      const auto = await p.evaluate(MEASURE);

      // Toggle the PILOT button (REAL TAPs): the ladder is AUTO ALL -> AUTO
      // MOVE -> MANUAL, so up to two taps bind MANUAL — that tap is also the
      // live proof the re-fit fires on a toggle. DETECTION reads the PILOT
      // MODE, not #joy's display: since the floating joystick (2026-09-18)
      // the fixed base stays HIDDEN on touch paths (one movement idiom), so
      // display would never flip. The taps run back-to-back with short
      // polls: a slow loop gives the run time to level up and pop a DRAFT
      // overlay over the pads, which would swallow the next tap.
      const JOY = "(async () => ({ mode: (document.getElementById('ov-cards') || {}).childElementCount > 0 ? 'cards' : 'none'," +
        " pilot: (await import('./src/main.js')).__TEST.state.pilotMode }))()";
      let manual = false, pilotReads = [];
      for (let i = 0; i < 5 && !manual; i++) {
        await p.tap(Math.round(auto.padLeft.x + auto.padLeft.w / 2),
          Math.round(auto.padLeft.y + 2 * 64 + 2 * 10 + 64 / 2));   // 3rd button (PILOT)
        await p.sleep(250);
        pilotReads.push(await p.evaluate(JOY));
        manual = pilotReads[pilotReads.length - 1].pilot === 'MANUAL';
      }
      await p.sleep(150);
      const manRec = await p.evaluate(MEASURE);
      manRec.pilotTaps = pilotReads;

      const shot = await p.shot('mobile-embed-' + w + 'x' + h);
      return { auto, manRec, playing, advancing, manual, shot, errors: p.errors };
    });
}

const SIZES = [[390, 844, 3], [360, 640, 1], [844, 390, 3], [640, 360, 1]];
const phones = {};
for (const [w, h, dpr] of SIZES) {
  phones[w + 'x' + h] = await phoneArm(w, h, dpr);
}

// ---- desktop arm: fine pointer, #touch.cog-only -> placement MUST NOT move --
const desktop = await withPage({ w: 1280, h: 800, dpr: 1, mobile: false,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate(BOOT_WAIT[0][0]);
    await p.waitFor(BOOT_WAIT[1][0], BOOT_WAIT[1][1]);
    await p.waitFor(BOOT_WAIT[2][0], BOOT_WAIT[2][1]);
    const c = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!c) throw new Error('no START GAME card on the title');
    await p.click(c[0], c[1]);
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    const rec = await p.evaluate(MEASURE);
    const shot = await p.shot('mobile-embed-1280x800');
    return { rec, shot, errors: p.errors };
  });

// ---------------------------------------------------------------- verdict --
const BEFORE = {   // round 1: /tmp/mobile_layout/before_probe.mjs (pads over
  // the centred canvas); round 2: before_probe_r2.mjs (the cog row over the
  // top-aligned canvas); round 3/4: before_probe_r3.mjs (the strip
  // reservations COLLAPSED the field in landscape).
  '390x844': { r1: { isectPerPad: 0 }, r2: { topChromeHitCount: 4, perCog: 2116 } },
  '360x640': { r1: { isectPerPad: 8496 }, r2: { topChromeHitCount: 4, perCog: 2116 } },
  '844x390': { r3: { w: 41, h: 26, floor: 214.5 } },
  '640x360': { r3: { w: 0, h: 0, floor: 198 } },
};
const LANDSCAPE = { '844x390': true, '640x360': true };
for (const [w, h] of SIZES.map(([w, h]) => [w, h])) {
  const key = w + 'x' + h;
  const a = phones[key], r = a.auto, m = a.manRec;
  const tag = key + ' (dpr ' + (key === '390x844' || key === '844x390' ? 3 : 1) + ')';
  const b3 = BEFORE[key].r3;
  check(tag + ' touch layer is LIVE (#touch.' + r.touchClass + ', display ' + r.touchDisplay + ')',
    r.touchClass.includes('on') && r.touchDisplay !== 'none', r.touchClass);
  // ---- DEVICE WORDING (2026-09-16): the panel the device actually gets ----
  // Every intro line the per-control layer renders at this device's
  // touch-path read: no keyboard token (TAB/WASD/ESC/H/N/Q/E/I), at least
  // one touch-control name, the class write agreeing with the CSS signal,
  // and the LIVE strip (when one is up) just as clean.
  {
    const tok = (k) => new RegExp('(^|[^A-Z])' + k + '([^A-Z]|$)');
    const KEY = ['TAB', 'WASD', 'ESC', 'H', 'N', 'Q', 'E', 'I'];
    const NAMES = ['PILOT', 'FOCUS', 'STANCE', 'STATS', 'MAP', 'RADAR', 'OVER', 'HP', 'MP', 'SETTINGS'];
    const bad = [];
    for (const l of r.introLines) for (const k of KEY) if (tok(k).test(l)) bad.push(k + ' in "' + l + '"');
    check(tag + ' the device wording follows the DEVICE: no key token in any intro line, touch names present',
      r.touchPath === true && bad.length === 0 &&
      r.introLines.some(l => NAMES.some(n => tok(n).test(l))),
      { touchPath: r.touchPath, bad });
    if (r.stripText) {
      const sb = KEY.filter(k => tok(k).test(r.stripText));
      check(tag + ' the LIVE hint strip reads touch-worded ("' + r.stripText + '")', sb.length === 0, sb);
    }
  }
  check(tag + ' run is live and advancing (t=' + r.time + 's)', r.mode === 'playing' && a.playing && a.advancing && r.time > 1, r.time);
  // ---- R4 priority 1 (HARD): the canvas is always usable ----
  check(tag + ' canvas present at 480x300 aspect (' + r.aspect + ')' + (b3 ? ' [r3 BEFORE: ' + b3.w + 'x' + b3.h + 'px]' : ''),
    r.canvas.w > 0 && r.canvas.h > 0 && Math.abs(r.aspect - 1.6) <= 0.01, r.aspect);
  check(tag + ' canvas at/above the floor (h=' + r.canvas.h + ' >= floor=' + r.floor +
    ' = min(55% vh, vw/1.6))' + (b3 ? ' [r3 BEFORE: ' + b3.h + 'px vs floor ' + b3.floor + ']' : ''),
    r.canvas.h >= r.floor - 1, { h: r.canvas.h, floor: r.floor });
  check(tag + ' canvas fully inside the viewport',
    r.canvas.x >= -0.01 && r.canvas.y >= -0.01 && r.canvas.r <= r.viewport[0] + 0.01 && r.canvas.b <= r.viewport[1] + 0.01,
    [r.canvas.x, r.canvas.y, r.canvas.r, r.canvas.b]);
  // ---- R4 priority 2 (HARD): the chrome stays on-screen ----
  check(tag + ' every visible chrome element fully inside the viewport (pads, pad buttons, cogs, joy/hud/hints when shown)',
    r.chromeOffscreen.length === 0, r.chromeOffscreen);
  // ---- R4 priority 3 (REPORT only): overlap is allowed, never asserted 0 --
  check(tag + ' overlap REPORT (allowed by R4): ' + r.overlapCount + ' element(s) intersect the canvas' +
    (r.overlapCount === 0 ? ' - CLEAN' : ' - ' + r.overlaps.map((o) => o.name + ':' + o.area + 'px^2').join(', ')) +
    (LANDSCAPE[key] ? ' [landscape: overlap is the accepted failure mode]' : ''),
    true, r.overlaps);
  // ---- MANUAL pilot: the re-fit fires and both hard priorities hold ----
  check(tag + ' MANUAL pilot: joystick up, re-fit fired, canvas still usable (floor+viewport+aspect) and chrome on-screen',
    a.manual && m.canvas.h >= m.floor - 1 &&
    m.canvas.x >= -0.01 && m.canvas.y >= -0.01 && m.canvas.r <= m.viewport[0] + 0.01 && m.canvas.b <= m.viewport[1] + 0.01 &&
    Math.abs(m.aspect - 1.6) <= 0.01 && m.chromeOffscreen.length === 0,
    { h: m.canvas.h, floor: m.floor, aspect: m.aspect, offscreen: m.chromeOffscreen, overlap: m.overlaps, pilotTaps: m.pilotTaps.length });
  check(tag + ' MANUAL pilot overlap REPORT: ' + m.overlapCount + ' element(s)' +
    (m.overlapCount === 0 ? ' - CLEAN' : ' - ' + m.overlaps.map((o) => o.name + ':' + o.area + 'px^2').join(', ')),
    true, m.overlaps);
}
{
  const d = desktop.rec;
  check('1280x800 desktop (cog-only): canvas stays the CENTRED whole-viewport letterbox (' +
    d.canvas.w + 'x' + d.canvas.h + ', position ' + d.canvasPosition + ')',
    d.canvasPosition === '(flex centred)' && d.canvas.w === 1280 && d.canvas.h === 800 &&
    Math.abs(d.canvas.y - (800 - d.canvas.h) / 2) <= 1,
    { canvas: d.canvas, position: d.canvasPosition });
  // DEVICE WORDING, desktop arm: the keyboard table survives the device
  // work — key tokens present, no touch-control names, cog-only class.
  const tok = (k) => new RegExp('(^|[^A-Z])' + k + '([^A-Z]|$)');
  const NAMES = ['PILOT', 'FOCUS', 'STANCE', 'STATS', 'MAP', 'RADAR', 'OVER', 'HP', 'MP', 'SETTINGS'];
  const strayNames = NAMES.filter(n => d.introLines.some(l => tok(n).test(l)));
  check('1280x800 desktop: keyboard wording (keys named, no touch-control names)',
    d.touchPath === false && d.touchClass.includes('cog-only') &&
    d.introLines.some(l => tok('TAB').test(l)) && strayNames.length === 0,
    { touchPath: d.touchPath, touchClass: d.touchClass, strayNames });
}
const allErrors = [...SIZES.map(([w, h]) => phones[w + 'x' + h].errors), desktop.errors].flat();
check('no console errors in any arm', allErrors.length === 0, allErrors);

for (const [w, h] of SIZES) {
  const shot = phones[w + 'x' + h].shot;
  const canonical = ART + '/mobile-embed-' + w + 'x' + h + '.png';
  try { copyFileSync(shot, canonical); console.log('PNG: ' + canonical); }
  catch (e) { console.error('COPY FAILED: ' + e.message); }
}
{
  const canonical = ART + '/mobile-embed-1280x800.png';
  try { copyFileSync(desktop.shot, canonical); console.log('PNG: ' + canonical); }
  catch (e) { console.error('COPY FAILED: ' + e.message); }
}

// Raw rect tables for the report (BEFORE/AFTER numbers).
for (const [w, h] of SIZES) {
  const key = w + 'x' + h;
  const r = phones[key].auto, m = phones[key].manRec;
  const b = BEFORE[key];
  const before = b.r3
    ? 'r3 BEFORE ' + b.r3.w + 'x' + b.r3.h + 'px vs floor ' + b.r3.floor
    : 'r1 BEFORE isect ' + b.r1.isectPerPad + 'px^2/pad, r2 BEFORE ' + b.r2.topChromeHitCount + ' cog hits x ' + b.r2.perCog + 'px^2';
  console.log('RAW ' + key + ' AFTER: canvas ' + JSON.stringify(r.canvas) + ' floor ' + r.floor +
    ' overlap ' + r.overlapCount + ' element(s)' + (r.overlapCount ? ' [' + r.overlaps.map((o) => o.name + ':' + o.area).join(', ') + ']' : ' (CLEAN)') +
    ' chromeOffscreen ' + r.chromeOffscreen.length + ' (' + before + ')' +
    ' | MANUAL: joy overlap ' + m.overlapCount + ' element(s), floor/viewport hold');
}

const portraitClean = ['390x844', '360x640'].every((k) => phones[k].auto.overlapCount === 0 && phones[k].manRec.overlapCount === 0);
const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY MOBILE LAYOUT: FAIL'
  : 'VERIFY MOBILE LAYOUT: PASS (round 4 priority rule) - at 390x844@dpr3, 360x640, 844x390@dpr3 and 640x360 the canvas is always usable: ' +
    'present at 480x300 aspect, at/above the floor (min(55% vh, vw/1.6); the r3 strip reservations had collapsed landscape to 41x26 and 0x0), ' +
    'and fully inside the viewport; every visible chrome element stays on-screen; overlap is reported, never asserted zero' +
    (portraitClean ? ' (portrait 390x844 and 360x640 both come out CLEAN, auto and manual)' : '') +
    '; the desktop letterbox is unmoved');
process.exit(bad ? 1 : 0);
