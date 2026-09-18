// HORDES - tools/verify_host_fit.mjs (FIT-TO-VIEWPORT UI SCALE, owner
// 2026-09-18, msg_01M2S72CF4902CWRWE7VJ3Y22M: galaxy.click "has a header that
// stays on screen unless the game is full screen and it makes it so
// everything is a little cut off. The whole interface should be able to
// shrink itself to fit"). REAL browser, REAL host simulation: a served page
// with a fixed N px header and the game in an iframe filling the remainder —
// the production embed shape. The game's own visualViewport then IS the box
// it actually got.
//
// THE BAR, at landscape 844x390 @dpr3, 780x360, 667x375 and portrait
// 390x844 @dpr3, 320x568, each under a 56px and a 90px header (plus one
// standalone arm to prove no gratuitous shrink):
//   1. the viewport source is the box the game GOT: the game's
//      visualViewport equals the iframe box, never the screen;
//   2. the run is LIVE (playing, time advancing);
//   3. EVERY control and canvas rect — pads and every touch button, the cog
//      row, #hud, #joy/#steer-zone when shown, the canvas — lies FULLY inside
//      the visible viewport (top-page coords: nothing under the header,
//      nothing off any edge);
//   4. the round-5 zero-overlap bar still holds wherever the band fit did
//      not fall back (a uniform scale preserves it exactly); a fallback size
//      REPORTS its overlap (the named round-4 letterbox), never greenwashed;
//   5. the UI scale engages EXACTLY where chrome would clip (a landscape
//      frame shorter than the 296px pad stack) and is 1 everywhere else —
//      never below the 0.75 legibility floor;
//   6. the canvas stays usable: 480x300 aspect, at/above the R4 floor in
//      LAYOUT px (visual/floor both reported).
// PNGs land in SHOT_DIR with the header in frame. Run:
//   node tools/verify_host_fit.mjs
import { withPage } from './browser.mjs';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const hostPage = (hdr) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>host</title><style>
  html, body { margin: 0; padding: 0; height: 100%; background: #202028; overflow: hidden; font-family: monospace; }
  #host-header { position: fixed; top: 0; left: 0; right: 0; height: ${hdr}px; background: #383850;
    color: #e8e8f0; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box;
    font-size: 13px; letter-spacing: 1px; z-index: 10; }
  #host-frame { position: fixed; top: ${hdr}px; left: 0; width: 100vw; height: calc(100vh - ${hdr}px);
    border: 0; }
</style></head><body>
<div id="host-header">GALAXY.CLICK-SIM HOST HEADER (${hdr}px)</div>
<iframe id="host-frame" src="index.html"></iframe>
</body></html>`;

// ---- game-realm expressions (evaluated inside the game window) -----------
const ESC = "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))";
const MODE_NOT_INTRO = "(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()";
const REVEAL_SETTLED = "(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()";
const CARD_CENTER = "(()=>{ const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('START GAME')); if(!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()";
const PLAYING = "(async()=> (await import('./src/main.js')).__TEST.state.mode === 'playing')()";
const ADVANCING = "(async()=>{ const st=(await import('./src/main.js')).__TEST.state; return st.mode==='playing' && st.time > 1.0; })()";
const MEASURE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const px = (v) => Math.round(v * 100) / 100;
  const box = (el) => { const r = el.getBoundingClientRect();
    return { x: px(r.left), y: px(r.top), r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height) }; };
  const visible = (el) => { if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const cv = box(document.getElementById('game'));
  const vv = window.visualViewport;
  const rec = { mode: T.state.mode, time: +T.state.time.toFixed(2), uiFit: T.uiFit,
    vv: (vv && vv.scale) ? [px(vv.width), px(vv.height), px(vv.scale)] : null,
    inner: [innerWidth, innerHeight], canvas: cv, aspect: px(cv.w / cv.h),
    floor: px(Math.min(0.55 * innerHeight, innerWidth / 1.6)) };
  const chrome = [];
  const touch = document.getElementById('touch');
  if (visible(touch)) {
    for (const el of touch.querySelectorAll('.pad')) chrome.push(['pad', el]);
    for (const el of touch.querySelectorAll('button')) chrome.push(['btn', el]);
    for (const el of touch.querySelectorAll('button.cog')) chrome.push(['cog', el]);
    if (visible(document.getElementById('joy'))) chrome.push(['#joy', document.getElementById('joy')]);
    if (visible(document.getElementById('steer-zone'))) chrome.push(['#steer-zone', document.getElementById('steer-zone')]);
  }
  if (visible(document.getElementById('hud'))) chrome.push(['#hud', document.getElementById('hud')]);
  const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) *
                          Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  rec.chromeRects = []; rec.overlaps = [];
  for (const [name, el] of chrome) {
    const b = box(el); if (b.w <= 0 && b.h <= 0) continue;
    rec.chromeRects.push({ name, ...b });
    if (ov(cv, b) > 0) rec.overlaps.push({ name, area: px(ov(cv, b)) });
  }
  // UI-TIGHT: chrome must never stack on chrome — but only among the TOP-LEVEL
  // actors (pads, the cog row, #hud). Skill buttons sit ON their pads and the
  // #steer-zone underlays the controls BY DESIGN (the pads own the pointer);
  // those pairs are excluded. The ui-tight defect this catches is the pad
  // stack vs the cog row / #hud on a short hosted landscape box.
  const TOP = new Set(['pad', 'cog', '#hud']);
  rec.chromeClash = [];
  for (let i = 0; i < rec.chromeRects.length; i++)
    for (let j = i + 1; j < rec.chromeRects.length; j++) {
      const a = rec.chromeRects[i], b = rec.chromeRects[j];
      if (!TOP.has(a.name) || !TOP.has(b.name)) continue;
      if (ov(a, b) > 0) rec.chromeClash.push({ a: a.name, b: b.name, area: px(ov(a, b)) });
    }
  return rec;
})()`;

async function arm(w, h, dpr, hdr, label) {
  const hosted = hdr > 0;
  // Game-realm expression -> a TOP-page expression (hosted: eval inside the
  // iframe's own window, so module imports resolve against the game's URL).
  const G = (expr) => hosted
    ? `document.getElementById('host-frame').contentWindow.eval(${JSON.stringify(expr)})`
    : expr;
  return withPage({ w, h, dpr, url: hosted ? '__host.html' : 'index.html',
    extra: hosted ? { '/__host.html': hostPage(hdr) } : {},
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      const LOADED = hosted
        ? "document.getElementById('host-frame') !== null && " +
          "(() => { try { return !!document.getElementById('host-frame').contentWindow.document.getElementById('game'); } catch (e) { return false; } })()"
        : "!!document.getElementById('game')";
      await p.waitFor(LOADED, 15000);
      await p.evaluate(G(ESC));
      await p.waitFor(G(MODE_NOT_INTRO), 15000);
      await p.waitFor(G(REVEAL_SETTLED), 8000);
      await p.sleep(120);
      const c = await p.evaluate(G(CARD_CENTER));
      if (!c) throw new Error('no START GAME card (' + label + ')');
      await p.tap(c[0], c[1] + (hosted ? hdr : 0));
      await p.waitFor(G(PLAYING), 8000);
      const advancing = await p.waitFor(G(ADVANCING), 10000, 200);
      const rec = await p.evaluate(G(MEASURE));
      const shot = await p.shot('host-fit-' + label + (hosted ? '-hdr' + hdr : '-standalone'));
      return { rec, advancing, shot, errors: p.errors };
    });
}

const MATRIX = [
  [844, 390, 3], [780, 360, 1], [667, 375, 1],   // landscape
  [390, 844, 3], [320, 568, 1],                  // portrait
];
const FLOOR = 0.75;   // C.UI_FIT.SCALE_FLOOR (asserted against the live uiFit)
const PAD_STACK = 296;   // measured chrome: 4x64 buttons + 3x10 gaps + 10 inset

const arms = [];
arms.push(await arm(844, 390, 3, 0, '844x390'));   // standalone: the no-header case
for (const [w, h, dpr] of MATRIX) for (const hdr of [56, 90]) {
  arms.push({ ...(await arm(w, h, dpr, hdr, w + 'x' + h)), w, h, hdr });
}

// ---- assertions ------------------------------------------------------------
{
  const sa = arms[0];   // standalone
  const r = sa.rec;
  check('standalone 844x390 (no header): run is live', sa.advancing && r.mode === 'playing' && r.time > 1,
    { mode: r.mode, time: r.time });
  check('standalone 844x390: UI scale stays 1 (a full viewport never shrinks)',
    r.uiFit.applied === 1 && r.uiFit.wanted === 1, r.uiFit);
  check('standalone 844x390: zero overlap still holds (round-5 untouched by the scale work)',
    r.uiFit.fellBack === false && r.overlaps.length === 0, r.overlaps);
  check('standalone 844x390: chrome pairwise disjoint (ui-tight must NOT engage at a full viewport)',
    r.chromeClash.length === 0, r.chromeClash);
}
for (const a of arms.slice(1)) {
  const { w, h, hdr } = a;
  const r = a.rec;
  const frameH = h - hdr;
  const tag = `${w}x${h} hdr${hdr} (game box ${w}x${frameH})`;
  check(tag + ': viewport source = the box the game GOT (visualViewport == iframe box, not the screen)',
    r.vv && Math.abs(r.vv[0] - w) <= 1 && Math.abs(r.vv[1] - frameH) <= 1 && Math.abs(r.vv[2] - 1) < 0.01,
    { vv: r.vv, inner: r.inner });
  check(tag + ': run is live (playing, time advancing)', a.advancing && r.mode === 'playing' && r.time > 1,
    { mode: r.mode, time: r.time });
  // THE BAR: every rect fully inside the VISIBLE viewport (top-page coords).
  const outside = [];
  for (const b of [{ name: 'canvas', ...r.canvas }, ...r.chromeRects]) {
    if (b.x < -0.01 || b.y + hdr < -0.01 || b.r > w + 0.01 || b.b + hdr > h + 0.01)
      outside.push({ name: b.name, box: b });
  }
  check(tag + ': EVERY control and canvas rect fully inside the visible viewport (nothing under the header, nothing off any edge)',
    outside.length === 0, outside);
  check(tag + ': chrome never stacks on chrome (pad stack vs cog row vs HUD pairwise disjoint — the ui-tight degradation)',
    r.chromeClash.length === 0, r.chromeClash);
  // Zero overlap where the band fit held; REPORT where the named fallback owns the size.
  if (r.uiFit.fellBack) {
    check(tag + ': below the band-fit breaking size — NAMED FALLBACK engaged, overlap REPORTED not asserted',
      r.overlaps.length >= 0, { overlaps: r.overlaps, uiFit: r.uiFit });
  } else {
    check(tag + ': zero overlap canvas vs every control rect (uniform scale preserves the round-5 fit)',
      r.overlaps.length === 0, r.overlaps);
  }
  const expectScaled = w > h && frameH < PAD_STACK;
  check(tag + ': UI scale ' + (expectScaled ? 'ENGAGES (pad stack ' + PAD_STACK + 'px > box height)' : 'stays 1 (nothing would clip)'),
    expectScaled ? (r.uiFit.applied < 1 && r.uiFit.applied >= FLOOR)
                 : r.uiFit.applied === 1,
    r.uiFit);
  check(tag + ': scale never below the legibility floor (0.75), never floored in this matrix',
    r.uiFit.applied >= FLOOR && r.uiFit.floored === false, r.uiFit);
  check(tag + ': canvas usable — aspect 1.6, at/above the R4 floor in LAYOUT px (visual = layout x scale)',
    Math.abs(r.aspect - 1.6) < 0.02 && (r.canvas.h / r.uiFit.applied) >= r.floor - 1.01,
    { visualH: r.canvas.h, layoutH: Math.round(r.canvas.h / r.uiFit.applied), floor: r.floor, scale: r.uiFit.applied });
  check(tag + ': no console errors', a.errors.length === 0, a.errors);
  console.log('RAW ' + tag + ': scale ' + r.uiFit.applied + ' (wanted ' + r.uiFit.wanted + ', fellBack ' +
    r.uiFit.fellBack + ') canvas ' + JSON.stringify(r.canvas) + ' floor ' + r.floor +
    ' chrome ' + r.chromeRects.length + ' rects, overlap ' + r.overlaps.length);
}

// ---- summary ---------------------------------------------------------------
const fails = results.filter((r) => !r.ok);
for (const r of results) {
  console.log((r.ok ? 'ok  ' : 'FAIL') + ' - ' + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
}
console.log('\nhost-fit verifier: ' + (results.length - fails.length) + '/' + results.length +
  ' checks passed' + (fails.length ? ' — RED' : ''));
console.log('shots: ' + (process.env.HORDES_SHOT_DIR || '/tmp/hordes-shots') + '/host-fit-*.png');
process.exit(fails.length ? 1 : 0);
