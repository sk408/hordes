// HORDES - PORT SLICE D capture: denser props + one prop guaranteed near spawn.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-d node tools/capture_slice_d.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_a.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per stage (all 8): a FRESH run via the game's own startRun (full hp each
// time), the live run's stage id switched (capture-only — no code number
// changes), the pilot LEFT AT SPAWN (the guarantee is about the initial
// view), ASSERT the stage's prop kind sits in the live landmarks seam inside
// the initial camera view + the clock advances, screenshot with the sim
// running. Plus two density close-ups: park on a prop cluster through the
// live seam and ASSERT >= 2 of the stage's props share the frame.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-d';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const STAGES = [
  { stage: 'VERDANT_HOLLOW', prop: 'TRAIL_LANTERN', shot: 'slice-d-spawn-verdant-hollow' },
  { stage: 'ASHEN_WASTE', prop: 'EMBER_BRAZIER', shot: 'slice-d-spawn-ashen-waste' },
  { stage: 'SNOWFIELD', prop: 'TRAIL_LANTERN', shot: 'slice-d-spawn-snowfield' },
  { stage: 'BLOOD_RUST', prop: 'RUST_IDOL', shot: 'slice-d-spawn-blood-rust' },
  { stage: 'BONE_DESERT', prop: 'DUNE_CART', shot: 'slice-d-spawn-bone-desert' },
  { stage: 'VOID_REACH', prop: 'VOID_CANDELABRA', shot: 'slice-d-spawn-void-reach' },
  { stage: 'CINDER_MAW', prop: 'EMBER_BRAZIER', shot: 'slice-d-spawn-cinder-maw' },
  { stage: 'WHITEOUT', prop: 'STORM_VANE', shot: 'slice-d-spawn-whiteout' },
];

const DENSE = [
  { stage: 'BONE_DESERT', prop: 'DUNE_CART', shot: 'slice-d-dense-bone-desert' },
  { stage: 'VOID_REACH', prop: 'VOID_CANDELABRA', shot: 'slice-d-dense-void-reach' },
];

await withPage({ w: 390, h: 844, dpr: 3,
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
  if (!playing || !advancing) throw new Error('no live run to capture');

  // ONE NEAR-SPAWN SHOT PER STAGE: fresh run, pilot left at spawn, the
  // guaranteed prop must sit in the live seam inside the camera view.
  for (const t of STAGES) {
    const seen = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(t.stage)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(600);
      const cam = T.state.cam || { x: 0, y: 0 };
      const C = (await import('./src/config.js')).CONFIG;
      const lms = (T.renderer.landmarks || []).map(l => ({ kind: l.kind, x: l.x, y: l.y }));
      const hits = lms.filter(l => l.kind === ${JSON.stringify(t.prop)} &&
        l.x >= cam.x && l.y >= cam.y && l.x + 20 <= cam.x + C.VIEW_W && l.y + 20 <= cam.y + C.VIEW_H);
      const t0 = st.time;
      await sleep(400);
      return { hits, kinds: [...new Set(lms.map(l => l.kind))], n: lms.length,
        mode: st.mode, dt: st.time - t0,
        px: Math.round(st.player.x), py: Math.round(st.player.y),
        cam: { x: Math.round(cam.x), y: Math.round(cam.y) } };
    })()`, true);
    check(t.stage + ': ' + t.prop + ' guaranteed in the initial spawn view (' + seen.hits.length + ' in view)',
      seen.hits.length >= 1 && seen.mode === 'playing', { hits: seen.hits, cam: seen.cam });
    check(t.stage + ': clock advances on the spawn shot (live game)',
      seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt, n: seen.n, kinds: seen.kinds });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }

  // DENSITY CLOSE-UPS: teleport through the live seam to a prop cluster and
  // prove >= 2 of the stage's props share one frame.
  for (const t of DENSE) {
    const parked = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(t.stage)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(300);
      const C = (await import('./src/config.js')).CONFIG;
      const seed = st.groundSeed || 1;
      const FC = C.GROUND.LANDMARK_CELL, DENS = C.GROUND.LANDMARK_DENSITY, RIM = C.GROUND.RIM;
      const cellRand = (cx, cy, s, salt) => {
        let h = (s ^ salt) >>> 0;
        h = Math.imul(h ^ cx, 0x27d4eb2d);
        h = Math.imul(h ^ cy, 0x165667b1);
        h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
        return (h >>> 0) / 4294967296;
      };
      const cands = [];
      const span = Math.ceil(RIM / FC);
      for (let cy = -span; cy <= span; cy++) {
        for (let cx = -span; cx <= span; cx++) {
          if (cellRand(cx, cy, seed, 11) >= DENS) continue;
          if (cellRand(cx, cy, seed, 14) < 0.72) continue;
          if (cellRand(cx, cy, seed, 17) >= 0.85) continue;
          const wx = cx * FC + 24 + Math.floor(cellRand(cx, cy, seed, 12) * (FC - 72));
          const wy = cy * FC + 24 + Math.floor(cellRand(cx, cy, seed, 13) * (FC - 72));
          if (wx < -RIM + 4 || wx > RIM - 76 || wy < -RIM + 4 || wy > RIM - 76) continue;
          cands.push([wx, wy]);
        }
      }
      let best = 0, hops = 0;
      cands.sort((a, b) => (a[0]*a[0] + a[1]*a[1]) - (b[0]*b[0] + b[1]*b[1]));
      for (const cand of cands.slice(0, 10)) {
        if (T.state.mode !== 'playing') break;
        hops++;
        st.player.x = cand[0]; st.player.y = cand[1];
        await sleep(400);
        const cam = T.state.cam || { x: 0, y: 0 };
        const n = (T.renderer.landmarks || []).filter(l => l.kind === ${JSON.stringify(t.prop)} &&
          l.x >= cam.x && l.y >= cam.y && l.x + 20 <= cam.x + C.VIEW_W && l.y + 20 <= cam.y + C.VIEW_H).length;
        if (n > best) best = n;
        if (best >= 2) break;
      }
      const lms2 = (T.renderer.landmarks || []).map(l => l.kind);
      const t0 = st.time;
      await sleep(400);
      return { best, hops, cands: cands.length, mode: st.mode, dt: st.time - t0,
        kinds: [...new Set(lms2)], n: lms2.length,
        px: Math.round(st.player.x), py: Math.round(st.player.y) };
    })()`, true);
    check(t.stage + ': density close-up shows >= 2 ' + t.prop + ' in one frame (best ' + parked.best + ')',
      parked.best >= 2 && parked.mode === 'playing', { best: parked.best, hops: parked.hops });
    check(t.stage + ': clock advances on the density shot (live game)',
      parked.dt > 0 && parked.mode === 'playing', { dt: parked.dt, kinds: parked.kinds });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }
  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_d: ' + red.length + ' FAILED check(s)') : 'capture_slice_d: all checks passed');
  if (red.length) process.exitCode = 1;
});
