// HORDES - PORT SLICE E capture: landmark-scale buildings in the live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-e node tools/capture_slice_e.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_d.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per stage (all 8): a FRESH run via the game's own startRun (full hp each
// time), the live run's stage id switched (capture-only — no code number
// changes), the pilot LEFT AT SPAWN (the slice-E guarantee puts the stage's
// building in the initial view), ASSERT the stage's building kind sits whole
// in the live landmarks seam inside the initial camera view + the slice-D
// prop promise holds beside it + the clock advances, screenshot with the sim
// running.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-e';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// Footprints mirror src/stage_buildings.js (capture-only copy for the
// whole-footprint in-view assert — the live seam carries kind/x/y only).
const STAGES = [
  { stage: 'VERDANT_HOLLOW', building: 'HOLLOW_LODGE', prop: 'TRAIL_LANTERN', w: 76, h: 68, shot: 'slice-e-spawn-verdant-hollow' },
  { stage: 'ASHEN_WASTE', building: 'EMBER_HALL', prop: 'EMBER_BRAZIER', w: 108, h: 72, shot: 'slice-e-spawn-ashen-waste' },
  { stage: 'SNOWFIELD', building: 'DRIFT_CHAPEL', prop: 'TRAIL_LANTERN', w: 88, h: 84, shot: 'slice-e-spawn-snowfield' },
  { stage: 'BLOOD_RUST', building: 'RUST_KEEP', prop: 'RUST_IDOL', w: 96, h: 92, shot: 'slice-e-spawn-blood-rust' },
  { stage: 'BONE_DESERT', building: 'OSSUARY_ARCH', prop: 'DUNE_CART', w: 108, h: 64, shot: 'slice-e-spawn-bone-desert' },
  { stage: 'VOID_REACH', building: 'VOID_ANNEX', prop: 'VOID_CANDELABRA', w: 96, h: 84, shot: 'slice-e-spawn-void-reach' },
  { stage: 'CINDER_MAW', building: 'CINDER_KILN', prop: 'EMBER_BRAZIER', w: 88, h: 76, shot: 'slice-e-spawn-cinder-maw' },
  { stage: 'WHITEOUT', building: 'CLOCKWAY_STUB', prop: 'STORM_VANE', w: 64, h: 100, shot: 'slice-e-spawn-whiteout' },
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

  // ONE SPAWN-VIEW SHOT PER STAGE: fresh run, pilot left at spawn, the
  // guaranteed building must sit whole in the live seam inside the view.
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
      const bhits = lms.filter(l => l.kind === ${JSON.stringify(t.building)} &&
        l.x >= cam.x && l.y >= cam.y &&
        l.x + ${t.w} <= cam.x + C.VIEW_W && l.y + ${t.h} <= cam.y + C.VIEW_H);
      const phits = lms.filter(l => l.kind === ${JSON.stringify(t.prop)} &&
        l.x >= cam.x && l.y >= cam.y && l.x + 20 <= cam.x + C.VIEW_W && l.y + 20 <= cam.y + C.VIEW_H);
      const t0 = st.time;
      await sleep(400);
      return { bhits, phits, kinds: [...new Set(lms.map(l => l.kind))], n: lms.length,
        mode: st.mode, dt: st.time - t0,
        px: Math.round(st.player.x), py: Math.round(st.player.y),
        cam: { x: Math.round(cam.x), y: Math.round(cam.y) } };
    })()`, true);
    check(t.stage + ': ' + t.building + ' guaranteed whole in the initial spawn view (' + seen.bhits.length + ' in view)',
      seen.bhits.length >= 1 && seen.mode === 'playing', { hits: seen.bhits, cam: seen.cam });
    check(t.stage + ': slice-D prop ' + t.prop + ' still guaranteed beside it (' + seen.phits.length + ' in view)',
      seen.phits.length >= 1 && seen.mode === 'playing', { phits: seen.phits });
    check(t.stage + ': clock advances on the spawn shot (live game)',
      seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt, n: seen.n, kinds: seen.kinds });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }
  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_e: ' + red.length + ' FAILED check(s)') : 'capture_slice_e: all checks passed');
  if (red.length) process.exitCode = 1;
});
