// HORDES - tools/verify_e1_purse.mjs (E1 slice acceptance bar items 6+7,
// docs/briefs/E1_RUN_PURSE.md).
//
// The E1 visible on-screen GOLD readout (owner directive 2026-09-14: "have a
// visible on screen display"), verified in REAL headless Chrome at PHONE size
// (390x844 @dpr3) — a code claim is not evidence for anything a player sees:
//   1. the readout is LIVE: real kills through the death funnel move the
//      painted value (the same funnel the loop uses, corpse-injection
//      precedent from smoke.mjs);
//   2. NO-REFLOW (the H1 contract): the readout's plate rect AND its ink-bbox
//      (getImageData alpha box of the painted region — no vision model on
//      this host, pixel sampling is the evidence) are BYTE-IDENTICAL at a
//      1-digit purse and a 5-digit purse, while the painted TEXT differs
//      (so the measurement is not of a static page);
//   3. PERSISTENCE: a REAL page reload after the exit flush, then the resumed
//      run's opening purse === the value read out of localStorage
//      hordes_profile_v1 by hand (R4: nothing earned is confiscated);
//   4. LEGIBILITY AS NUMBERS: px height, x/y/w/h, digit-column width, and the
//      measured clearance to the touch pads' 96px budget (index.html) —
//      reported, not eyeballed.
//
// House rules honored: all 19 TOUR_KEYS set (browser.mjs's own startup sets
// only 7 — the tick-38 frozen-game trap), hordes_onboarded preset, and
// state.time > 1.0 ASSERTED before anything is measured, after BOTH loads.
// Run: node tools/verify_e1_purse.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// In-page helper bundle, evaluated after each (re)load.
const PAGE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const st = T.state;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const canvas = document.getElementById('game');
  // The readout geometry in BACKING-STORE px (WAVE-23: the canvas rasterises
  // at device resolution; chrome.purse is in 480x300 view coords).
  const scale = () => canvas.width / 480;
  const inkBox = (r) => {
    const s = scale();
    const x0 = Math.max(0, Math.floor(r.x * s) - 1), y0 = Math.max(0, Math.floor(r.y * s) - 1);
    const w = Math.min(canvas.width - x0, Math.ceil(r.w * s) + 2);
    const h = Math.min(canvas.height - y0, Math.ceil(r.h * s) + 2);
    const d = canvas.getContext('2d').getImageData(x0, y0, w, h).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) {
        ink++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return ink ? { x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1, ink } : { ink: 0 };
  };
  const capture = async (label) => {
    await frame(); await frame();           // syncChrome publishes, chrome repaints
    const c = T.renderer.hudChrome;
    if (!c || !c.purse) throw new Error('no purse readout in hudChrome (' + label + ')');
    return { label, rect: { x: c.purse.x, y: c.purse.y, w: c.purse.w, h: c.purse.h },
      px: c.purse.px, digitW: c.purse.digitW, text: c.purse.text, value: c.purse.value,
      ink: inkBox(c.purse), statePurse: st.runPurse, time: st.time };
  };
  const cssBox = (el) => { const r = el.getBoundingClientRect();
    return { x: Math.round(r.left * 100) / 100, y: Math.round(r.top * 100) / 100,
      w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }; };
  const screenRect = () => {                 // the readout in CSS px on the phone screen
    const cv = cssBox(canvas);
    const c = T.renderer.hudChrome.purse;
    return { x: cv.x + c.x * (cv.w / 480), y: cv.y + c.y * (cv.h / 300),
      w: c.w * (cv.w / 480), h: c.h * (cv.h / 300) };
  };
  return { T, st, frame, capture, canvas, cssBox, screenRect, inkBox };
})()`;

const boot2 = `(async () => { const m = await import('./src/main.js'); return m.__TEST; })()`;
const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const startAndAssert = async (tag) => {
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      await p.evaluate("(async () => (await import('./src/main.js')).__TEST.startRun())()");
      const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      // CRITICAL: the sim clock must be advancing BEFORE anything is measured —
      // a run reached with the coach gate active is a paused game.
      const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
      check('[' + tag + '] run started and the sim clock ADVANCED past 1.0s before any measurement',
        playing && advancing, { playing, advancing });
      return playing && advancing;
    };

    await startAndAssert('load-1');

    // ---- 1. the readout is LIVE: real kills move it -------------------------
    const live = await p.evaluate(`(async () => {
      const h = await (${PAGE});
      const before = (await h.capture('at-1s')).value;
      // Real corpses through the REAL death funnel (smoke.mjs precedent).
      const py = h.st.player.y;
      for (const t of ['BRUTE', 'BRUTE', 'CHASER']) {
        h.st.enemies.push({ typeId: t, x: h.st.player.x, y: py - 100, hp: 0, maxHp: 1,
          w: 8, h: 8, speed: 0, xp: 1, age: 0 });
      }
      await h.frame(); await h.frame();
      const after = await h.capture('after-kills');
      return { before, after };
    })()`, true);
    check('the readout is LIVE: 3 real kills (2 BRUTE + 1 CHASER) move the painted value by exactly ' +
      '(2*HEAVY + GRUNT)', live.after.value - live.before === 2 * 8 + 1 &&
      live.after.statePurse === live.after.value,
      { before: live.before, after: live.after.value, statePurse: live.after.statePurse, text: live.after.text });

    // ---- 2. NO-REFLOW: byte-identical geometry at 1 vs 5 digits -------------
    const ab = await p.evaluate(`(async () => {
      const h = await (${PAGE});
      h.T.getProfile().runPurse = 7;
      const one = await h.capture('1-digit');
      h.T.getProfile().runPurse = 12345;
      const five = await h.capture('5-digit');
      return { one, five };
    })()`, true);
    const sameRect = ab.one.rect.x === ab.five.rect.x && ab.one.rect.y === ab.five.rect.y &&
      ab.one.rect.w === ab.five.rect.w && ab.one.rect.h === ab.five.rect.h;
    const sameInk = ab.one.ink.x === ab.five.ink.x && ab.one.ink.y === ab.five.ink.y &&
      ab.one.ink.w === ab.five.ink.w && ab.one.ink.h === ab.five.ink.h;
    check('no-reflow: plate rect byte-identical at 1-digit and 5-digit purses', sameRect,
      { one: ab.one.rect, five: ab.five.rect });
    check('no-reflow: ink-bbox byte-identical at 1-digit and 5-digit purses', sameInk && ab.one.ink.ink > 0,
      { one: ab.one.ink, five: ab.five.ink });
    check('the painted TEXT differs across the A/B (the measurement is not of a static page)',
      ab.one.text !== ab.five.text && ab.one.text.includes('7') && ab.five.text.includes('12345'),
      { one: ab.one.text, five: ab.five.text });

    // ---- 3. PERSISTENCE: real reload, resumed purse -------------------------
    const persist = await p.evaluate(`(async () => {
      const h = await (${PAGE});
      h.T.getProfile().runPurse = 321;
      h.T.save.autosave('e1-reload-test');
      return JSON.parse(localStorage.getItem('hordes_profile_v1')).runPurse;
    })()`, true);
    check('the exit flush wrote the purse to hordes_profile_v1', persist === 321, { stored: persist });
    await p.evaluate('location.reload()', false).catch(() => {});
    // After the reload the page is a NEW document; re-run the whole guard.
    await p.waitFor("(async () => { try { return !!(await import('./src/main.js')).__TEST; } catch (e) { return false; } })()", 20000);
    await startAndAssert('load-2');
    const resumed = await p.evaluate(`(async () => {
      const stored = JSON.parse(localStorage.getItem('hordes_profile_v1')).runPurse;
      const h = await (${PAGE});
      const live = h.T.purse.get();
      const painted = (await h.capture('resumed')).value;
      return { stored, live, painted };
    })()`, true);
    check('the resumed run opens with the persisted purse (stored === live === painted)',
      resumed.stored === 321 && resumed.live === 321 && resumed.painted === 321, resumed);

    // ---- 4. legibility as numbers + the pads' 96px budget --------------------
    const geom = await p.evaluate(`(async () => {
      const h = await (${PAGE});
      const padL = h.cssBox(document.querySelector('#touch .pad.left'));
      const padR = h.cssBox(document.querySelector('#touch .pad.right'));
      return { view: h.T.renderer.hudChrome.purse, screen: h.screenRect(), padL, padR,
        canvas: h.cssBox(h.canvas), vw: innerWidth, vh: innerHeight };
    })()`, true);
    const clearanceY = Math.min(geom.padL.y, geom.padR.y) - (geom.screen.y + geom.screen.h);
    console.log('GEOMETRY readout(view): ' + JSON.stringify(geom.view));
    console.log('GEOMETRY readout(screen css px): ' + JSON.stringify(geom.screen) +
      ' pads L/R: ' + JSON.stringify(geom.padL) + ' / ' + JSON.stringify(geom.padR));
    console.log('GEOMETRY canvas: ' + JSON.stringify(geom.canvas) + ' viewport ' + geom.vw + 'x' + geom.vh +
      ' vertical clearance readout->pads: ' + clearanceY.toFixed(1) + 'px');
    check('legibility: the readout paints at the HUD label size (11px view) with a reserved 5-digit column',
      geom.view.px === 11 && geom.view.digitW === 5 * Math.round(11 * 0.62) && geom.view.h === 15,
      geom.view);
    check('clears the pads: the readout band ends above the pad band with room to spare',
      clearanceY > 50, { clearanceY, screen: geom.screen, padL: geom.padL });
    check('the pads hold their FIXED 96px budget with the readout live',
      geom.padL.w === 96 && geom.padR.w === 96, { padL: geom.padL.w, padR: geom.padR.w });

    // ---- the artifact --------------------------------------------------------
    const ink = await p.evaluate(`(async () => {
      const h = await (${PAGE});
      return h.inkBox(h.T.renderer.hudChrome.purse);
    })()`, true);
    check('the readout region has real ink before the capture (never ship a blank artifact)', ink.ink > 0, ink);
    await p.evaluate("(async () => { for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); })()");
    const shotFile = await p.shot('e1-purse');
    const dst = join(ART, 'e1-purse-phone.png');
    copyFileSync(shotFile, dst);
    const b64 = readFileSync(dst).toString('base64');
    const dims = await p.evaluate(`(async () => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, inkN = 0;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i + 3] > 0 && !(d[i] === 11 && d[i + 1] === 11 && d[i + 2] === 18)) {  // not the page bg
          inkN++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      return { w: img.width, h: img.height, inkN,
        bbox: inkN ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null };
    })()`, true);
    console.log('PNG: ' + dst + '  ' + dims.w + 'x' + dims.h + '  ink-bbox ' + JSON.stringify(dims.bbox) +
      '  non-bg px ' + dims.inkN);
    check('PNG is 1170x2532 with real ink', dims.w === 1170 && dims.h === 2532 && dims.inkN > 1000, dims);
    if (p.errors.length) console.log('PAGE ERRORS: ' + JSON.stringify(p.errors));
    return { png: dst, dims, geom };
  });

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + JSON.stringify(r.detail)}`);
console.log(`verify_e1_purse: ${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
