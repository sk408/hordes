// HORDES - tools/verify_m1_map.mjs (M1 acceptance bar: the per-run MAP is
// REAL in the browser - opens from the cog-row button AND the 'm' hotkey,
// paints visited cells + discovered landmarks, never pauses the sim, and a
// closed->open->closed render of the SAME un-stepped state is BYTE-IDENTICAL
// (zero residue, C2). REAL browser, PHONE viewport 390x844 @dpr3, real taps.
// Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; all 19 TOUR_KEYS set; sim clock ASSERTED past 1.0s before any
//      measurement (the tick-38 lesson).
//   2. the map boots CLOSED (zero paint: renderer.atlasMap === null) and the
//      #tc-map button lives in the COG ROW (class cog), NOT in a touch pad
//      (the H1 no-reflow contract: pads keep their fixed 96px geometry).
//   3. a REAL tap on #tc-map opens the map; the live seam reports the fixed
//      integer geometry (240x240 at 120,30, 8px cells) with visited cells
//      and the player pip; a dispatched 'm' keydown through the REAL window
//      handler closes it again.
//   4. C2 restore: render(closed) -> render(open) -> render(closed) of the
//      SAME state object, no sim step: capture A === capture B byte-for-byte,
//      and the open capture differs (the map really painted).
//   5. C1 no-pause: with the map OPEN, state.time advances over 1.2s of wall
//      time (the sim keeps running under the overlay).
//   6. draw cost: mean ms/render over 240 forced renders, closed vs open,
//      reported raw; the map draw carries no dt (60Hz/120Hz identical
//      geometry by construction - stated, plus the live seam check).
//   7. ONE PNG at 1170x2532, map open with a DISCOVERED landmark + the
//      player pip, ink-bbox checked inside the map's screen box.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is live-state measurement + PNG dimensions/ink, not a "looks right"
// judgement. The 'm' keydown is a dispatched KeyboardEvent through the game's
// REAL window handler (browser.mjs has no CDP keyboard primitive); the tap is
// a real finger tap. Stated, not hidden.
// Run: node tools/verify_m1_map.mjs
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
async function inkInBox(p, file, box, threshold = 110) {
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
      if (Math.max(d[i], d[i + 1], d[i + 2]) > ${threshold}) ink++;
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

    // Boots CLOSED: zero map paint, and the button is a COG-ROW citizen.
    const boot = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const btn = document.getElementById('tc-map');
      const r = btn.getBoundingClientRect();
      return { mapOpen: T.state.mapOpen, seam: T.renderer.atlasMap,
        cog: btn.classList.contains('cog'), inPad: !!btn.closest('.pad'),
        act: btn.dataset.act, rect: [r.x, r.y, r.width, r.height].map(v => +v.toFixed(2)) };
    })()`);
    check('boots CLOSED: mapOpen false, atlasMap seam null (zero paint)',
      boot.mapOpen === false && boot.seam === null, { mapOpen: boot.mapOpen, seam: boot.seam });
    check('the MAP entry is a COG-ROW button (H1: NOT inside a fixed-96px pad)',
      boot.cog && !boot.inPad && boot.act === 'map', { cog: boot.cog, inPad: boot.inPad, act: boot.act, rect: boot.rect });

    // Mark the start cell + discover shrine[0] for the paint checks: park the
    // player (MANUAL) on the first altar for a beat, then step off.
    await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      T.setPilotMode('MANUAL');
      const sh = st.shrines[0];
      st.player.x = sh.x; st.player.y = sh.y;
      await new Promise(r => setTimeout(r, 400));
      st.player.x = sh.x + 90; st.player.y = sh.y;
      await new Promise(r => setTimeout(r, 300));
    })()`, true);

    // REAL tap on the cog-row MAP button.
    const tapAt = await p.evaluate(`(() => {
      const r = document.getElementById('tc-map').getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(tapAt[0], tapAt[1]);
    const opened = await p.waitFor(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return T.state.mapOpen === true && !!T.renderer.atlasMap; })()`, 4000, 100);
    const seam = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.renderer.atlasMap)()`);
    check('a REAL tap on #tc-map OPENS the map (live seam)',
      opened && seam && seam.x === 120 && seam.y === 30 && seam.size === 240 && seam.cell === 8,
      seam && { x: seam.x, y: seam.y, size: seam.size, cell: seam.cell });
    check('the open map paints VISITED cells, the player pip, and the DISCOVERED landmark',
      seam && seam.visited > 0 && seam.player && seam.landmarks.length === 1 && seam.landmarks[0].kind === 'shrine',
      seam && { visited: seam.visited, landmarks: seam.landmarks, player: seam.player });

    // C1: the sim keeps running under the open map (no pause).
    const flow = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const t0 = st.time;
      await new Promise(r => setTimeout(r, 1200));
      return { dt: st.time - t0, mode: st.mode, mapOpen: st.mapOpen };
    })()`, true);
    check('C1: state.time ADVANCES with the map open (sim never pauses)',
      flow.dt > 0.6 && flow.mode === 'playing' && flow.mapOpen === true,
      { dt: +flow.dt.toFixed(2), mode: flow.mode });

    // C2 restore: closed -> open -> closed on the SAME un-stepped state.
    // DISCLOSED: toggleMap raises a one-toast notification (same UX as the
    // radar toggle); the toast is transient overlay paint, not map residue, so
    // the probe clears state.toasts after each toggle to isolate MAP paint.
    const restore = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state, r = T.renderer;
      const cv = document.getElementById('game');
      const shot = () => { r.render(st, st.cam); return cv.toDataURL('image/png'); };
      const quiet = () => { st.toasts.length = 0; };
      const wasOpen = st.mapOpen; if (wasOpen) { T.map.toggle(); quiet(); }
      const A = shot();
      T.map.toggle(); quiet(); const OPEN = shot();
      T.map.toggle(); quiet(); const B = shot();
      if (wasOpen) { T.map.toggle(); quiet(); }
      return { lenA: A.length, sameAB: A === B, openDiffers: OPEN !== A && OPEN !== B };
    })()`, true);
    check('C2: closed->open->closed render of the SAME state is BYTE-IDENTICAL (zero residue)',
      restore.sameAB && restore.openDiffers,
      { sameAB: restore.sameAB, openDiffers: restore.openDiffers, captureBytes: restore.lenA });

    // Draw cost: 240 forced renders of one state, closed vs open.
    const cost = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state, r = T.renderer;
      const run = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) r.render(st, st.cam); return (performance.now() - t0) / n; };
      const wasOpen = st.mapOpen; if (wasOpen) T.map.toggle();
      run(20);                                   // warm both paths
      const closed = run(240);
      T.map.toggle(); const open = run(240); T.map.toggle();
      if (wasOpen) T.map.toggle();
      return { closed: +closed.toFixed(3), open: +open.toFixed(3) };
    })()`, true);
    check('draw cost measured (open - closed is the map price; no dt anywhere in the map draw)',
      cost.open > 0 && cost.closed > 0 && cost.open - cost.closed < 4,
      { closedMs: cost.closed, openMs: cost.open, mapMs: +(cost.open - cost.closed).toFixed(3) });

    // PNG with the map open: the map's screen box is device (120,30,240,240)
    // mapped through the canvas element's rect (HUD space, no camera).
    await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      if (!T.state.mapOpen) T.map.toggle();
      await new Promise(r => setTimeout(r, 200)); })()`, true);
    const box = await p.evaluate(`(() => {
      const r = document.getElementById('game').getBoundingClientRect();
      const x = r.left + (120 / 480) * r.width, y = r.top + (30 / 300) * r.height;
      return [x, y, (240 / 480) * r.width, (240 / 300) * r.height];
    })()`);
    const shotFile = await p.shot('m1-map-phone');
    const ink = await inkInBox(p, shotFile, box);
    check('PNG is 1170x2532 (390x844 @dpr3)', ink.imgW === 1170 && ink.imgH === 2532,
      { imgW: ink.imgW, imgH: ink.imgH });
    check('ink-bbox: the map paints bright ink in its box (discovered landmark + player pip + rim)',
      ink.ink > 20, { ink: ink.ink, box: box.map(v => +v.toFixed(1)) });

    // The 'm' hotkey (dispatched through the REAL window keydown handler).
    const key = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const before = T.state.mapOpen;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      await new Promise(r => setTimeout(r, 250));
      const afterClose = T.state.mapOpen;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      await new Promise(r => setTimeout(r, 250));
      return { before, afterClose, reopened: T.state.mapOpen };
    })()`, true);
    check("the 'm' hotkey TOGGLES the map (open -> closed -> open via the real keydown handler)",
      key.before === true && key.afterClose === false && key.reopened === true, key);

    // Leave it closed for a tidy exit state; re-assert zero paint.
    const tidy = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      if (T.state.mapOpen) T.map.toggle();
      await new Promise(r => setTimeout(r, 200));
      return { seam: T.renderer.atlasMap, mapOpen: T.state.mapOpen }; })()`, true);
    check('closed again: the seam is null (nothing paints while closed)',
      tidy.seam === null && tidy.mapOpen === false, tidy);
    return shotFile;
  });

const dest = join(ART, 'm1-map-phone.png');
copyFileSync(out, dest);
const bad = results.filter(r => !r.ok);
console.log('PNG: ' + dest + ' (src ' + out + ')');
console.log(bad.length ? `VERIFY M1 MAP: ${bad.length} FAILURES` : 'VERIFY M1 MAP: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
