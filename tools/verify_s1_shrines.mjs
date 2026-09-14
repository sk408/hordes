// HORDES - tools/verify_s1_shrines.mjs (S1 acceptance bar, evidence 8: the
// world-seeded shrine set is REAL in the browser, STATIC, and ON THE FIELD).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; all 19 TOUR_KEYS are set and the sim clock is ASSERTED past
//      1.0s before anything is measured (the tick-38 lesson: a harness that
//      skips this measures a FROZEN game).
//   2. state.shrines is the world-seeded set: exactly SHRINE_WORLD_COUNT
//      altars, integer pixels, inside the rim with margin; state.shrine is
//      the first-unused VIEW (the render/tour handoff).
//   3. STATIC in the live render loop: positions byte-identical across ~1.5s
//      of wall time with the AUTO pilot wandering (the old 6px/s lean would
//      have moved every altar measurably).
//   4. ONE PNG at 1170x2532 with an ink-bbox check on a shrine's screen box
//      (the idol head #ffd75e + coin glyph paint bright ink), the player
//      parked (MANUAL) 120px away so the altar is ON the field, unbought.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is live-state measurement + PNG dimensions/ink, not a "looks right"
// judgement. Stated, not hidden.
// Run: node tools/verify_s1_shrines.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// Count ink pixels inside a viewport-CSS-space box of a captured PNG.
async function inkInBox(p, file, box) {
  const b64 = (await import('node:fs')).readFileSync(file).toString('base64');
  return p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const sx = img.width / innerWidth, sy = img.height / innerHeight;
    const x = Math.round(${box[0]} * sx), y = Math.round(${box[1]} * sy);
    const w = Math.round(${box[2]} * sx), h = Math.round(${box[3]} * sy);
    const d = g.getImageData(x, y, w, h).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 110) ink++;
    }
    return { imgW: img.width, imgH: img.height, ink };
  })()`, true);
}

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
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
    check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
      playing && advancing, { playing, advancing });

    // The world-seeded set, live in the browser.
    const set = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      const want = (await import('./src/shrines.js')).SHRINE_WORLD_COUNT;
      return { n: st.shrines.length, want, viewIsFirst: st.shrine === st.shrines[0],
        shrines: st.shrines.map(s => ({ x: s.x, y: s.y, used: s.used })) }; })()`);
    check('world set: exactly SHRINE_WORLD_COUNT altars, integer px, inside the rim with margin, view = first',
      set.n === set.want && set.viewIsFirst && set.shrines.every(s =>
        s.x === Math.round(s.x) && s.y === Math.round(s.y) &&
        Math.abs(s.x) <= 560 && Math.abs(s.y) <= 560 && s.used === false), set);

    // STATIC in the live render loop: the AUTO pilot wanders for ~1.5s; the
    // altars must not move a pixel (the old lean would have closed ~9px).
    const drift = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const a = st.shrines.map(s => s.x + ',' + s.y).join('|');
      await new Promise(r => setTimeout(r, 1500));
      const b = st.shrines.map(s => s.x + ',' + s.y).join('|');
      return { same: a === b, a, b, mode: st.mode };
    })()`, true);
    check('STATIC: positions byte-identical after 1.5s of live play (zero drift)',
      drift.same && drift.mode === 'playing', { same: drift.same, mode: drift.mode });

    // Park the player (MANUAL) 120px from the first altar so it sits ON the
    // field, outside the 26px buy radius. Positions re-asserted after.
    const scene = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      T.setPilotMode('MANUAL');
      const sh = st.shrines[0];
      st.player.x = sh.x + 120; st.player.y = sh.y;
      await new Promise(r => setTimeout(r, 500));
      return { shx: sh.x, shy: sh.y, mode: st.mode,
        d: Math.hypot(st.player.x - sh.x, st.player.y - sh.y), used: sh.used };
    })()`, true);
    check('scene: player parked 120px from the altar, unbought, still playing',
      scene.mode === 'playing' && scene.d > 100 && scene.d < 140 && scene.used === false,
      { d: +scene.d.toFixed(1), mode: scene.mode });

    // PNG: the altar's screen box through the SAME transform render.js uses
    // (device = centre + (draw - centre) * Z), then shoot.
    const box = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const sh = st.shrines[0];
      const Z = st.zoomScale || 1;
      const dx = sh.x - st.cam.x, dy = sh.y - st.cam.y;
      const devX = 240 + (dx - 240) * Z, devY = 150 + (dy - 150) * Z;
      const r = document.getElementById('game').getBoundingClientRect();
      const cssX = r.left + (devX / 480) * r.width, cssY = r.top + (devY / 300) * r.height;
      return [cssX - 20, cssY - 24, 40, 44];
    })()`);
    const shotFile = await p.shot('s1-shrines-phone');
    const ink = await inkInBox(p, shotFile, box);
    check('PNG is 1170x2532 (390x844 @dpr3)', ink.imgW === 1170 && ink.imgH === 2532,
      { imgW: ink.imgW, imgH: ink.imgH });
    check('ink-bbox: the shrine paints bright ink inside its screen box (idol head + coin glyph)',
      ink.ink > 20, { ink: ink.ink, box: box.map(v => +v.toFixed(1)) });

    // ...and the altar STILL has not moved, parked player notwithstanding.
    const still = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      const sh = st.shrines[0]; return { x: sh.x, y: sh.y, used: sh.used }; })()`);
    check('static to the end: the altar never leaned at the parked player, never sold',
      still.x === scene.shx && still.y === scene.shy && still.used === false, still);
    return shotFile;
  });

const dest = join(ART, 's1-shrines-phone.png');
copyFileSync(out, dest);
const bad = results.filter(r => !r.ok);
console.log('PNG: ' + dest + ' (src ' + out + ')');
console.log(bad.length ? `VERIFY S1 SHRINES: ${bad.length} FAILURES` : 'VERIFY S1 SHRINES: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
