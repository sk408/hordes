// HORDES - PORT SLICE J capture: biome composition (clusters visible) + spawn views.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-j node tools/capture_slice_j.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_e.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per stage (all 8): TWO shots.
//   1. COMPOSITION: a fresh run via the game's own startRun, stage switched
//      (capture-only), pilot teleported (capture-only positioning) to the
//      densest cluster of the run's own groundSeed field, ASSERT the live
//      landmarks seam shows >= 3 whole structures of >= 2 designs with a
//      cluster pair (two structures within 250px) + the clock advances,
//      screenshot with the sim running.
//   2. SPAWN: a fresh run, pilot LEFT AT SPAWN (the slice-J guarantee puts a
//      whole cluster in the initial view), ASSERT anchor + satellite whole
//      in view + the slice-D prop beside them + the clock advances.
// Standard contract: in-tree shots, live game, asserted seam, advancing clock.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-j';
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
  { stage: 'VERDANT_HOLLOW', prop: 'TRAIL_LANTERN', shot: 'slice-j-verdant-hollow' },
  { stage: 'ASHEN_WASTE', prop: 'EMBER_BRAZIER', shot: 'slice-j-ashen-waste' },
  { stage: 'SNOWFIELD', prop: 'TRAIL_LANTERN', shot: 'slice-j-snowfield' },
  { stage: 'BLOOD_RUST', prop: 'RUST_IDOL', shot: 'slice-j-blood-rust' },
  { stage: 'BONE_DESERT', prop: 'DUNE_CART', shot: 'slice-j-bone-desert' },
  { stage: 'VOID_REACH', prop: 'VOID_CANDELABRA', shot: 'slice-j-void-reach' },
  { stage: 'CINDER_MAW', prop: 'EMBER_BRAZIER', shot: 'slice-j-cinder-maw' },
  { stage: 'WHITEOUT', prop: 'STORM_VANE', shot: 'slice-j-whiteout' },
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

  for (const t of STAGES) {
    // 1. COMPOSITION SHOT: densest cluster of the run's own seed.
    const comp = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(t.stage)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(400);
      const C = (await import('./src/config.js')).CONFIG;
      const B = await import('./src/stage_buildings.js');
      const pl = B.buildingPlacements(st.groundSeed || 0, st.stage);
      // Densest anchor neighbourhood (structures within 250px of an anchor).
      let best = null, bestN = -1;
      for (const a of pl) {
        if (B.STAGE_BUILDINGS[a.id].role === 'satellite') continue;
        let n = 0;
        for (const b of pl) {
          const cx = Math.min(Math.max(a.x + a.w / 2, b.x), b.x + b.w);
          const cy = Math.min(Math.max(a.y + a.h / 2, b.y), b.y + b.h);
          if (Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) <= 250) n++;
        }
        if (n > bestN) { bestN = n; best = a; }
      }
      // Park the pilot ON the cluster centroid (pushed out of footprints so
      // the live collision seam holds footing) — the player-locked camera
      // settles with the composition around the view centre.
      const boxes = pl.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
      const held = B.pushOutOfRects(boxes, best.x + best.w / 2, best.y + best.h / 2, 8);
      st.player.x = held[0]; st.player.y = held[1];
      st.player.invuln = 1e9;
      await sleep(1400);
      const cam = T.state.cam || { x: 0, y: 0 };
      const lms = (T.renderer.landmarks || []).map(l => ({ kind: l.kind, x: l.x, y: l.y }));
      const inView = lms.filter(l => {
        const d = B.STAGE_BUILDINGS[l.kind];
        return d && l.x >= cam.x && l.y >= cam.y &&
          l.x + d.w <= cam.x + C.VIEW_W && l.y + d.h <= cam.y + C.VIEW_H;
      });
      const kinds = [...new Set(inView.map(l => l.kind))];
      let pair = false;
      for (let i = 0; i < inView.length && !pair; i++) {
        for (let j = i + 1; j < inView.length && !pair; j++) {
          const a = inView[i], b = inView[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) <= 250) pair = true;
        }
      }
      const t0 = st.time;
      await sleep(400);
      return { n: inView.length, kinds, pair, bestN, mode: st.mode, dt: st.time - t0,
        px: Math.round(st.player.x), py: Math.round(st.player.y) };
    })()`, true);
    check(t.stage + ': composition shows >= 3 whole structures (' + comp.n + ': ' + comp.kinds.join(',') + ')',
      comp.n >= 3 && comp.mode === 'playing', comp);
    check(t.stage + ': >= 2 designs + a cluster pair in view',
      comp.kinds.length >= 2 && comp.pair && comp.mode === 'playing', { kinds: comp.kinds, pair: comp.pair });
    check(t.stage + ': clock advances on the composition shot (live game)',
      comp.dt > 0 && comp.mode === 'playing', { dt: comp.dt });
    const file1 = await p.shot(t.shot + '-composition');
    console.log('  SHOT ' + t.shot + '-composition -> ' + file1);

    // 2. SPAWN SHOT: fresh run, pilot left at spawn.
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
      const B = await import('./src/stage_buildings.js');
      const lms = (T.renderer.landmarks || []).map(l => ({ kind: l.kind, x: l.x, y: l.y }));
      const structs = lms.filter(l => {
        const d = B.STAGE_BUILDINGS[l.kind];
        return d && l.x >= cam.x && l.y >= cam.y &&
          l.x + d.w <= cam.x + C.VIEW_W && l.y + d.h <= cam.y + C.VIEW_H;
      });
      const anchors = structs.filter(l => B.STAGE_BUILDINGS[l.kind].role !== 'satellite');
      const sats = structs.filter(l => B.STAGE_BUILDINGS[l.kind].role === 'satellite');
      const phits = lms.filter(l => l.kind === ${JSON.stringify(t.prop)} &&
        l.x >= cam.x && l.y >= cam.y && l.x + 20 <= cam.x + C.VIEW_W && l.y + 20 <= cam.y + C.VIEW_H);
      const t0 = st.time;
      await sleep(400);
      return { anchors: anchors.length, sats: sats.length, phits: phits.length,
        mode: st.mode, dt: st.time - t0 };
    })()`, true);
    check(t.stage + ': spawn cluster (anchor ' + seen.anchors + ' + satellite ' + seen.sats + ' whole in view)',
      seen.anchors >= 1 && seen.sats >= 1 && seen.mode === 'playing', seen);
    check(t.stage + ': slice-D prop ' + t.prop + ' still guaranteed beside it (' + seen.phits + ' in view)',
      seen.phits >= 1 && seen.mode === 'playing', { phits: seen.phits });
    check(t.stage + ': clock advances on the spawn shot (live game)',
      seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt });
    const file2 = await p.shot(t.shot + '-spawn');
    console.log('  SHOT ' + t.shot + '-spawn -> ' + file2);
  }
  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_j: ' + red.length + ' FAILED check(s)') : 'capture_slice_j: all checks passed');
  if (red.length) process.exitCode = 1;
});
