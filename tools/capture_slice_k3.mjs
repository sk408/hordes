// HORDES - PORT SLICE K3 capture: floor tile variety in the live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-k3 node tools/capture_slice_k3.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_g.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per stage (all 8): a FRESH run via the game's own startRun (full hp each
// time, wave 1 — the FIXED wave), the live run's stage id switched
// (capture-only — no code number changes), the pilot LEFT AT SPAWN, ASSERT
// the clock advances, screenshot with the sim running. PLUS one wave-recolor
// pair on BONE_DESERT (wave 1 vs wave 4, capture-only wave switch) proving
// the recolor beat still advances under motif variety.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-k3';
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
  { stage: 'VERDANT_HOLLOW', shot: 'slice-k3-ground-verdant-hollow' },
  { stage: 'ASHEN_WASTE', shot: 'slice-k3-ground-ashen-waste' },
  { stage: 'SNOWFIELD', shot: 'slice-k3-ground-snowfield' },
  { stage: 'BLOOD_RUST', shot: 'slice-k3-ground-blood-rust' },
  { stage: 'BONE_DESERT', shot: 'slice-k3-ground-bone-desert' },
  { stage: 'VOID_REACH', shot: 'slice-k3-ground-void-reach' },
  { stage: 'CINDER_MAW', shot: 'slice-k3-ground-cinder-maw' },
  { stage: 'WHITEOUT', shot: 'slice-k3-ground-whiteout' },
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

  // ONE SPAWN-VIEW SHOT PER STAGE at the fixed wave (fresh startRun = wave 1).
  for (const t of STAGES) {
    const seen = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(t.stage)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(600);
      const t0 = st.time;
      await sleep(400);
      return { stage: st.stage, wave: st.wave && st.wave.num, mode: st.mode,
        dt: st.time - t0, time: st.time,
        px: Math.round(st.player.x), py: Math.round(st.player.y) };
    })()`, true);
    check(t.stage + ': live spawn view at fixed wave 1 (stage ' + seen.stage + ', wave ' + seen.wave + ')',
      seen.mode === 'playing' && seen.wave === 1 && seen.stage === t.stage, seen);
    check(t.stage + ': clock advances on the ground shot (live game)',
      seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt, time: seen.time });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }

  // WAVE-RECOLOR PAIR on BONE_DESERT: same stage + same spawn view, wave 1
  // vs wave 4 (capture-only wave switch — the theme ladder reads
  // state.wave.num every frame, so the ground recolors under motif variety).
  const pair = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    T.startRun();
    T.setPilotMode('MANUAL');
    const st = T.state;
    st.stage = 'BONE_DESERT';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const { groundTheme } = await import('./src/render.js');
    await sleep(600);
    const base1 = groundTheme(st.wave.num).base;
    st.wave.num = 4;
    await sleep(600);
    const base4 = groundTheme(st.wave.num).base;
    const t0 = st.time;
    await sleep(400);
    return { base1, base4, mode: st.mode, dt: st.time - t0, time: st.time };
  })()`, true);
  check('BONE_DESERT recolor pair: wave-1 base ' + pair.base1 + ' vs wave-4 base ' + pair.base4,
    pair.base1 !== pair.base4 && pair.mode === 'playing', pair);
  check('recolor pair: clock advances (live game)', pair.dt > 0 && pair.mode === 'playing', { dt: pair.dt });
  const pairFile = await p.shot('slice-k3-recolor-bone-desert-wave4');
  console.log('  SHOT slice-k3-recolor-bone-desert-wave4 -> ' + pairFile);

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_k3: ' + red.length + ' FAILED check(s)') : 'capture_slice_k3: all checks passed');
  if (red.length) process.exitCode = 1;
});
