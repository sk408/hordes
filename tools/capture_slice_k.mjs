// HORDES - PORT SLICE K capture: chest presentation in the live run.
// Run: node tools/capture_slice_k.mjs
// (Shots land in-tree at docs/art/port-slice-k.)
//
// METHOD (the capture_slice_h/j pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Four shots, all planted through the game's OWN seams with the sim running:
//   1. SEALED-WORLD — 3 field chests (the { id, x, y, age } seam chests.js
//      owns; a field chest carries no rarity, so the world paints SEALED).
//   2. BAND-CLOSED — the 4 band closed frames + gamble, via the
//      capture-only `ch.band` display override (game code never writes it).
//   3. OPEN-REMNANTS — one chest item drop per band + gamble (the
//      pushItemDrop seam with the ROLLED band stamp), far enough out that
//      the pilot does not instantly collect them.
//   4. BURST — the collection burst planted mid-life at the player's side.
// Standard contract: in-tree shots, live game, asserted seam, advancing clock.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-k';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

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

  const fresh = `(async () => {
    const T = (await import('./src/main.js')).__TEST;
    T.startRun();
    T.setPilotMode('MANUAL');
    const st = T.state;
    st.spawnTimer = 9999;
    if (st.wave) st.wave.endsAt = st.time + 9999;
    st.enemies.length = 0;
    st.gems.length = 0;
    st.drops.length = 0;
    st.itemDrops.length = 0;
    st.chests.length = 0;
    st.chestBurst = null;
    st.player.invuln = 1e9;
    return true;
  })()`;

  // SHOT 1 — sealed world chests around the player.
  const s1 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state, px = st.player.x, py = st.player.y;
    st.chests.push({ id: 9101, x: px - 60, y: py - 30, age: 0.1 });
    st.chests.push({ id: 9102, x: px + 55, y: py - 45, age: 0.4 });
    st.chests.push({ id: 9103, x: px + 5, y: py + 55, age: 1.2 });
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 400));
    return { mode: st.mode, dt: st.time - t0, n: st.chests.length };
  })()`, true);
  check('sealed-world: 3 field chests via the chests.js seam', s1.mode === 'playing' && s1.n === 3, s1);
  check('sealed-world: clock advances (live game)', s1.dt > 0 && s1.mode === 'playing', { dt: s1.dt });
  console.log('  SHOT slice-k-1-sealed-world -> ' + await p.shot('slice-k-1-sealed-world'));

  // SHOT 2 — per-band closed frames (capture-only band override).
  const s2 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state, px = st.player.x, py = st.player.y;
    const bands = ['common', 'rare', 'epic', 'legendary', 'gamble'];
    bands.forEach((band, i) => {
      const a = (i / bands.length) * Math.PI * 2;
      st.chests.push({ id: 9200 + i, x: px + Math.cos(a) * 70, y: py + Math.sin(a) * 55, age: 0.2 + i * 0.15, band });
    });
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 400));
    return { mode: st.mode, dt: st.time - t0,
      bands: st.chests.map(ch => ch.band).join(',') };
  })()`, true);
  check('band-closed: all 5 designs planted via the display override', s2.mode === 'playing' && s2.bands === 'common,rare,epic,legendary,gamble', s2);
  check('band-closed: clock advances (live game)', s2.dt > 0 && s2.mode === 'playing', { dt: s2.dt });
  console.log('  SHOT slice-k-2-band-closed -> ' + await p.shot('slice-k-2-band-closed'));

  // SHOT 3 — open remnants: one stamped chest drop per band + gamble.
  const s3 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state, px = st.player.x, py = st.player.y;
    const { rollItemOfRarity } = await import('./src/loot.js');
    const spec = [['common', 'COMMON'], ['rare', 'RARE'], ['epic', 'EPIC'],
      ['legendary', 'LEGENDARY'], ['gamble', 'RARE']];
    spec.forEach(([band, rar], i) => {
      const a = (i / spec.length) * Math.PI * 2;
      T.state.itemDrops.push({ x: px + Math.cos(a) * 80, y: py + Math.sin(a) * 60,
        item: rollItemOfRarity(rar, Math.random), age: 0, chest: band });
    });
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 400));
    return { mode: st.mode, dt: st.time - t0,
      n: st.itemDrops.length, bands: st.itemDrops.map(d => d.chest).join(',') };
  })()`, true);
  check('open-remnants: 5 stamped chest drops via the pushItemDrop seam',
    s3.mode === 'playing' && s3.n === 5 && s3.bands === 'common,rare,epic,legendary,gamble', s3);
  check('open-remnants: clock advances (live game)', s3.dt > 0 && s3.mode === 'playing', { dt: s3.dt });
  console.log('  SHOT slice-k-3-open-remnants -> ' + await p.shot('slice-k-3-open-remnants'));

  // SHOT 4 — the collection burst, mid-life beside the player.
  const s4 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state;
    const { CONFIG } = await import('./src/config.js');
    st.chestBurst = { x: st.player.x + 60, y: st.player.y - 20,
      t: CONFIG.RUN_CHEST.BURST_TTL * 0.05, milestone: 50, reward: 2000 };
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 120));
    return { mode: st.mode, dt: st.time - t0, burst: !!st.chestBurst };
  })()`, true);
  check('burst: collection burst planted mid-life via the chestBurst seam',
    s4.mode === 'playing' && s4.burst, s4);
  check('burst: clock advances (live game)', s4.dt > 0 && s4.mode === 'playing', { dt: s4.dt });
  console.log('  SHOT slice-k-4-burst -> ' + await p.shot('slice-k-4-burst'));

  // SHOT 5 — CLOSE-UP (capture-only zoom): sealed chest + legendary open
  // remnant side by side, world layer at 3x so the art reads pixel by pixel.
  const s5 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state, px = st.player.x, py = st.player.y;
    st.zoom = 3;
    const { rollItemOfRarity } = await import('./src/loot.js');
    st.chests.push({ id: 9301, x: px - 58, y: py - 6, age: 0.1 });
    st.itemDrops.push({ x: px + 62, y: py - 6,
      item: rollItemOfRarity('LEGENDARY', Math.random), age: 0, chest: 'legendary' });
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 250));
    return { mode: st.mode, dt: st.time - t0, zoom: st.zoomScale,
      n: st.chests.length + st.itemDrops.length };
  })()`, true);
  check('close-up: sealed + legendary remnant at 3x zoom', s5.mode === 'playing' && s5.n === 2, s5);
  check('close-up: clock advances (live game)', s5.dt > 0 && s5.mode === 'playing', { dt: s5.dt });
  console.log('  SHOT slice-k-5-closeup -> ' + await p.shot('slice-k-5-closeup'));

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_k: ' + red.length + ' FAILED check(s)') : 'capture_slice_k: all checks passed');
  if (red.length) process.exitCode = 1;
});
