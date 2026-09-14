// HORDES - tools/verify_p1_portal.mjs (P1 acceptance bar: the boss portal
// LINGERS, the AUTO pilot paths to it, the approach invuln window is live,
// and the entry dwell beat precedes an ENTRY-DRIVEN cinematic).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; all 19 TOUR_KEYS are set and the sim clock is ASSERTED past
//      1.0s before anything is measured (the tick-38 lesson: a harness that
//      skips this measures a FROZEN game).
//   2. after the (forced) wave-1 boss death the portal opens and STAYS in
//      'playing' - the movie no longer auto-starts at the kill (BEFORE, same
//      script shape: portal-open -> cine = 0.000s).
//   3. the AUTO pilot walks: the distance to the portal falls, the live
//      activity reads 'PORTAL', and p.invuln > 0 on every walking sample
//      (AUTO_ALL). Swapping to MANUAL mid-walk drops the window to <= 0 and
//      the player halts - the approach invuln is AUTO ONLY - and swapping
//      back resumes the walk and the run ENTERS.
//   4. the dwell beat: portal.entering -> 'portal-cine' measures inside the
//      owner-directed 0.35-0.5s band in SIM seconds.
//   5. ONE PNG at 1170x2532 with an ink-bbox check on the portal's screen
//      box (the flame ring + core paint bright ink).
//   6. the headline numbers, portal-open -> cine (the linger) and
//      portal-open -> intermission, in sim AND wall seconds.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is DOM text + live-state measurement + PNG dimensions/ink, not a
// "looks right" judgement. Stated, not hidden.
// Run: node tools/verify_p1_portal.mjs
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

    // Force the wave-1 boss, then slay it through the REAL reap.
    await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state; st.wave.endsAt = st.time; })()`);
    await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return (st.wave.bosses || []).some(b => b.hp > 0); })()", 30000, 100);
    await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      st.wave.endsAt = st.time + 60 * 60;
      for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0; })()`);

    // The portal opens; the movie must NOT auto-start (entry-driven now).
    const opened = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && !!st.portal; })()", 10000, 60);
    check('portal opened and the mode stayed playing (no kill-time movie auto-start)', opened);
    const tOpen = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      return { sim: st.time, wall: performance.now() / 1000 }; })()`);
    const toastSeen = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      return st.toasts.some(t => t.msg === 'THE PORTAL OPENS - WALK THROUGH'); })()`);
    check("the walk-through toast is on screen ('THE PORTAL OPENS - WALK THROUGH')", toastSeen);

    // Pin the geometry: put the player exactly 200px from the portal (on
    // screen at any zoom) so the walk window is deterministic. The pilot
    // then closes it at its own speed; MANUAL below freezes the scene for
    // the PNG.
    await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      st.player.x = st.portal.x - 200; st.player.y = st.portal.y; })()`);

    // Watch the AUTO walk for ~1s: distance falls, act reads PORTAL, the
    // invuln window is live on every sample.
    const walk = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      const d0 = Math.hypot(st.player.x - st.portal.x, st.player.y - st.portal.y);
      const samples = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!st.portal || st.mode !== 'playing') break;
        samples.push({
          d: Math.hypot(st.player.x - st.portal.x, st.player.y - st.portal.y),
          act: T.controller.act, invuln: st.player.invuln,
        });
      }
      return { d0, samples };
    })()`, true);
    const dLast = walk.samples.length ? walk.samples[walk.samples.length - 1].d : walk.d0;
    check('AUTO walk: the distance to the portal FALLS (pilot paths to it)',
      dLast < walk.d0 - 30, { d0: +walk.d0.toFixed(1), dLast: +dLast.toFixed(1) });
    check("AUTO walk: the live activity reads 'PORTAL' while walking",
      walk.samples.some(s => s.act === 'PORTAL'));
    check('R3 AUTO_ALL: p.invuln > 0 on EVERY walking sample',
      walk.samples.length > 0 && walk.samples.every(s => s.invuln > 0),
      walk.samples.map(s => +s.invuln.toFixed(3)));

    // R3 MANUAL half, in the real browser: swap -> the window lapses and
    // the player halts (the portal parks; nobody enters). The scene is now
    // frozen for the PNG.
    const manual = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      T.setPilotMode('MANUAL');
      await new Promise(r => setTimeout(r, 400));
      const still = { x: st.player.x, y: st.player.y };
      await new Promise(r => setTimeout(r, 300));
      return {
        invuln: st.player.invuln,
        moved: Math.hypot(st.player.x - still.x, st.player.y - still.y),
        portalOpen: !!st.portal, mode: st.mode,
      };
    })()`, true);
    check('R3 MANUAL: no window, ever (invuln <= 0), the player HALTS, the portal PARKS (stays open)',
      manual.invuln <= 0 && manual.moved < 1 && manual.portalOpen && manual.mode === 'playing', manual);

    // PNG: the ring is fully grown by now (0.6s spawn-in). Portal screen box
    // through the SAME transform render.js uses (device = centre + (draw -
    // centre) * Z), then shoot.
    const box = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const Z = st.zoomScale || 1;
      const dx = st.portal.x - st.cam.x, dy = st.portal.y - st.cam.y;
      const devX = 240 + (dx - 240) * Z, devY = 150 + (dy - 150) * Z;
      const r = document.getElementById('game').getBoundingClientRect();
      const cssX = r.left + (devX / 480) * r.width, cssY = r.top + (devY / 300) * r.height;
      return [cssX - 30, cssY - 30, 60, 60];
    })()`);
    const shotFile = await p.shot('p1-portal-phone');
    const ink = await inkInBox(p, shotFile, box);
    check('PNG is 1170x2532 (390x844 @dpr3)', ink.imgW === 1170 && ink.imgH === 2532,
      { imgW: ink.imgW, imgH: ink.imgH });
    check('ink-bbox: the portal paints bright ink inside its screen box', ink.ink > 50,
      { ink: ink.ink, box: box.map(v => +v.toFixed(1)) });

    // Resume the walk; measure the dwell beat and the entry-driven movie.
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.setPilotMode('AUTO_ALL'); })()`);
    const flow = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      const rec = { tEnter: null, tCine: null };
      for (let i = 0; i < 1500; i++) {
        await new Promise(r => setTimeout(r, 30));
        if (rec.tEnter === null && st.portal && st.portal.entering) {
          rec.tEnter = { sim: st.time, wall: performance.now() / 1000 };
        }
        if (st.mode === 'portal-cine') {
          rec.tCine = { sim: st.time, wall: performance.now() / 1000 };
          break;
        }
        if (st.mode === 'intermission') break;
      }
      return rec;
    })()`, true);
    if (flow.tEnter && flow.tCine) {
      const dwell = flow.tCine.sim - flow.tEnter.sim;
      check('R4 dwell: entering -> cinematic inside the 0.35-0.5s band (sim seconds)',
        dwell >= 0.35 - 0.02 && dwell <= 0.5 + 0.02, { dwell: +dwell.toFixed(3) });
    } else {
      check('R4 dwell: entering -> cinematic inside the 0.35-0.5s band (sim seconds)', false, flow);
    }
    check('FLOW: the movie started only AFTER the entry beat (entry-driven cinematic)',
      !!(flow.tEnter && flow.tCine && flow.tCine.sim > flow.tEnter.sim));

    // Skip the movie with a REAL tap, ride to the intermission, tap CONTINUE.
    if (flow.tCine) {
      await p.tap(195, 422);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'intermission')()", 10000, 100);
    }
    const tInter = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
      return st.mode === 'intermission' ? { sim: st.time, wall: performance.now() / 1000 } : null; })()`);
    check('the run reached the intermission through the entry', !!tInter);
    if (tInter) {
      console.log('HEADLINE(sim): portal-open -> cine ' + (flow.tCine ? (flow.tCine.sim - tOpen.sim).toFixed(3) : 'n/a') +
        's | portal-open -> intermission ' + (tInter.sim - tOpen.sim).toFixed(3) + 's');
      console.log('HEADLINE(wall): portal-open -> cine ' + (flow.tCine ? (flow.tCine.wall - tOpen.wall).toFixed(3) : 'n/a') +
        's | portal-open -> intermission ' + (tInter.wall - tOpen.wall).toFixed(3) + 's');
    }
    const cont = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('CONTINUE'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (cont) {
      await p.tap(cont[0], cont[1]);
      const back = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      check('CONTINUE taps through into the next wave', back);
    } else {
      check('CONTINUE taps through into the next wave', false, 'no CONTINUE card');
    }
    return shotFile;
  });

const dest = join(ART, 'p1-portal-phone.png');
copyFileSync(out, dest);
const bad = results.filter(r => !r.ok);
console.log('PNG: ' + dest + ' (src ' + out + ')');
console.log(bad.length ? `VERIFY P1 PORTAL: ${bad.length} FAILURES` : 'VERIFY P1 PORTAL: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
