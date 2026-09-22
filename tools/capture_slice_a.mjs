// HORDES - PORT SLICE A capture: stage/prop objects render in a live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-a node tools/capture_slice_a.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the verify_m1_map.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per stage: a FRESH run via the game's own startRun (full hp each time),
// the live run's stage id switched (capture-only — no code number changes),
// a waypoint search for that stage's prop landmark through the live
// renderer.landmarks seam, park the MANUAL pilot on it, assert the seam +
// the clock, screenshot with the sim running.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-a';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const TARGETS = [
  { stage: 'VERDANT_HOLLOW', prop: 'TRAIL_LANTERN', shot: 'slice-a-hollow-lantern' },
  { stage: 'ASHEN_WASTE', prop: 'EMBER_BRAZIER', shot: 'slice-a-ashen-brazier' },
  { stage: 'BLOOD_RUST', prop: 'RUST_IDOL', shot: 'slice-a-rust-idol' },
  { stage: 'VOID_REACH', prop: 'VOID_CANDELABRA', shot: 'slice-a-void-candelabra' },
  { stage: 'BONE_DESERT', prop: 'DUNE_CART', shot: 'slice-a-dune-cart' },
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

  for (const t of TARGETS) {
    const parked = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(t.stage)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(300);
      // Deterministic prop-cell solver: the landmark field is a pure hash
      // field over (cell, seed) — replicate render.js cellRand + the
      // drawLandmarks anchor math to teleport STRAIGHT to a prop cell, then
      // VERIFY through the live seam (a formula drift fails loudly below).
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
          if (cellRand(cx, cy, seed, 14) < 0.86) continue;
          if (cellRand(cx, cy, seed, 17) >= 0.55) continue;
          const wx = cx * FC + 24 + Math.floor(cellRand(cx, cy, seed, 12) * (FC - 72));
          const wy = cy * FC + 24 + Math.floor(cellRand(cx, cy, seed, 13) * (FC - 72));
          if (wx < -RIM + 4 || wx > RIM - 76 || wy < -RIM + 4 || wy > RIM - 76) continue;
          cands.push([wx, wy]);
        }
      }
      let hit = null, hops = 0;
      // Nearest-first so the pilot barely travels.
      cands.sort((a, b) => (a[0]*a[0] + a[1]*a[1]) - (b[0]*b[0] + b[1]*b[1]));
      for (const cand of cands.slice(0, 6)) {
        if (T.state.mode !== 'playing') break;
        hops++;
        st.player.x = cand[0]; st.player.y = cand[1];
        await sleep(400);
        const lms = T.renderer.landmarks || [];
        hit = lms.find(l => l.kind === ${JSON.stringify(t.prop)});
        if (hit) break;
      }
      if (hit) { st.player.x = hit.x + 6; st.player.y = hit.y + 48; await sleep(500); }
      const lms2 = T.renderer.landmarks || [];
      const t0 = st.time;
      await sleep(400);
      return { hit, hops, cands: cands.length, mode: st.mode, dt: st.time - t0,
        kinds: [...new Set(lms2.map(l => l.kind))], n: lms2.length,
        px: Math.round(st.player.x), py: Math.round(st.player.y) };
    })()`, true);
    check(t.stage + ': ' + t.prop + ' solved + parked on (' + parked.cands + ' candidate cells)',
      !!parked.hit && parked.mode === 'playing', { hit: parked.hit, hops: parked.hops, mode: parked.mode });
    check(t.stage + ': prop kind in the live landmarks seam + clock advances (live game)',
      parked.kinds.includes(t.prop) && parked.dt > 0,
      { kinds: parked.kinds, n: parked.n, dt: parked.dt, player: [parked.px, parked.py] });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }
  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_a: ' + red.length + ' FAILED check(s)') : 'capture_slice_a: all checks passed');
  if (red.length) process.exitCode = 1;
});
