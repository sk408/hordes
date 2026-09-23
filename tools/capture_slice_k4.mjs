// HORDES - PORT SLICE K4 capture: weather-reactive floor tiles in the live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-k4 node tools/capture_slice_k4.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_k3.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per weather (all 6 non-CLEAR) x 2 biomes (VERDANT_HOLLOW + BONE_DESERT): a
// FRESH run via the game's own startRun (full hp each time, wave 1 — the
// FIXED wave), the live run's stage id switched AND its weather overridden
// with a weather.js initWeather instance (capture-only — no code number
// changes), the pilot LEFT AT SPAWN, ASSERT the clock advances and the
// weather id reads back, screenshot with the sim running. PLUS the CLEAR
// pair (both biomes unweathered — the byte-restore witness) and one
// RAIN wave-1-vs-wave-4 pair proving the recolor beat still advances under
// a weather reaction.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-k4';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const WEATHERS = ['RAIN', 'SNOW', 'WIND', 'CLOUDY', 'SUNNY', 'MOONLIGHT'];
const BIOMES = [
  { stage: 'VERDANT_HOLLOW', slug: 'verdant-hollow' },
  { stage: 'BONE_DESERT', slug: 'bone-desert' },
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

  // PER-WEATHER x 2-BIOME floor shots at the fixed wave (fresh startRun each).
  for (const wx of WEATHERS) {
    for (const b of BIOMES) {
      const seen = await p.evaluate(`(async () => {
        const T = (await import('./src/main.js')).__TEST;
        const { initWeather } = await import('./src/weather.js');
        T.startRun();
        T.setPilotMode('MANUAL');
        const st = T.state;
        st.stage = ${JSON.stringify(b.stage)};
        st.weather = initWeather(${JSON.stringify(wx)}, 7);
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        await sleep(600);
        const t0 = st.time;
        await sleep(400);
        return { stage: st.stage, wave: st.wave && st.wave.num, mode: st.mode,
          weather: st.weather && st.weather.id,
          dt: st.time - t0, time: st.time,
          px: Math.round(st.player.x), py: Math.round(st.player.y) };
      })()`, true);
      const shot = 'slice-k4-' + wx.toLowerCase() + '-' + b.slug;
      check(b.stage + '/' + wx + ': live spawn view at fixed wave 1 (stage ' + seen.stage + ', weather ' + seen.weather + ')',
        seen.mode === 'playing' && seen.wave === 1 && seen.stage === b.stage && seen.weather === wx, seen);
      check(b.stage + '/' + wx + ': clock advances on the ground shot (live game)',
        seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt, time: seen.time });
      const file = await p.shot(shot);
      console.log('  SHOT ' + shot + ' -> ' + file);
    }
  }

  // CLEAR-STATE PAIR: the same two biomes unweathered (the byte-restore
  // witness — CLEAR paints nothing extra, so these match the K3 floor).
  for (const b of BIOMES) {
    const seen = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const { initWeather } = await import('./src/weather.js');
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.stage = ${JSON.stringify(b.stage)};
      st.weather = initWeather('CLEAR', 7);
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(600);
      const t0 = st.time;
      await sleep(400);
      return { stage: st.stage, wave: st.wave && st.wave.num, mode: st.mode,
        weather: st.weather && st.weather.id, dt: st.time - t0, time: st.time };
    })()`, true);
    const shot = 'slice-k4-clear-' + b.slug;
    check(b.stage + '/CLEAR: restore view at fixed wave 1 (weather ' + seen.weather + ')',
      seen.mode === 'playing' && seen.wave === 1 && seen.stage === b.stage && seen.weather === 'CLEAR', seen);
    check(b.stage + '/CLEAR: clock advances (live game)',
      seen.dt > 0 && seen.mode === 'playing', { dt: seen.dt });
    const file = await p.shot(shot);
    console.log('  SHOT ' + shot + ' -> ' + file);
  }

  // RECOLOR-UNDER-WEATHER PAIR on BONE_DESERT under RAIN: same stage + same
  // spawn view, wave 1 vs wave 4 (capture-only wave switch — the theme ladder
  // reads state.wave.num every frame, so the ground recolors under weather).
  const pair = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const { initWeather } = await import('./src/weather.js');
    T.startRun();
    T.setPilotMode('MANUAL');
    const st = T.state;
    st.stage = 'BONE_DESERT';
    st.weather = initWeather('RAIN', 7);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const { groundTheme } = await import('./src/render.js');
    await sleep(600);
    const base1 = groundTheme(st.wave.num).base;
    st.wave.num = 4;
    await sleep(600);
    const base4 = groundTheme(st.wave.num).base;
    const t0 = st.time;
    await sleep(400);
    return { base1, base4, weather: st.weather && st.weather.id,
      mode: st.mode, dt: st.time - t0, time: st.time };
  })()`, true);
  check('BONE_DESERT/RAIN recolor pair: wave-1 base ' + pair.base1 + ' vs wave-4 base ' + pair.base4,
    pair.base1 !== pair.base4 && pair.mode === 'playing' && pair.weather === 'RAIN', pair);
  check('recolor pair: clock advances (live game)', pair.dt > 0 && pair.mode === 'playing', { dt: pair.dt });
  const pairFile = await p.shot('slice-k4-rain-bone-desert-wave4');
  console.log('  SHOT slice-k4-rain-bone-desert-wave4 -> ' + pairFile);

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_k4: ' + red.length + ' FAILED check(s)') : 'capture_slice_k4: all checks passed');
  if (red.length) process.exitCode = 1;
});
