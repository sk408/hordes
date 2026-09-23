// HORDES - PORT SLICE K2 capture: shrine altar presentation in the live run.
// Run: node tools/capture_slice_k2.mjs
// (Shots land in-tree at docs/art/port-slice-k2.)
//
// METHOD (the capture_slice_k pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Four shots, all planted through the game's OWN seams with the sim running:
//   1-3. EMBER / IDOL / PYLON — the live view (state.shrine) pointed at each
//      world-seeded altar in turn (the index seam art/shrines.js owns; the
//      altar is moved beside the player so it reads at phone scale).
//   4. CLOSE-UP — the ember altar at capture-only 3x world zoom so the art
//      reads pixel by pixel.
// Standard contract: in-tree shots, live game, asserted seam, advancing clock.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-k2';
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

  // SHOTS 1-3 — one live view per altar index (the honest-display seam: the
  // view is state.shrines[i], moved beside the player; the variant rides the
  // index, never the hidden blessing).
  const variants = ['ember', 'idol', 'pylon'];
  for (let i = 0; i < 3; i++) {
    const s = await p.evaluate(`(async () => {
      ${fresh}
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state, px = st.player.x, py = st.player.y;
      // Park the OTHER altars far away so only the viewed altar reads.
      st.shrines.forEach((sh, k) => {
        if (k === ${i}) { sh.x = px + 52; sh.y = py - 24; sh.used = false; delete sh.blessing; }
        else { sh.x = px + 4000 + k * 500; sh.y = py; sh.used = false; }
      });
      st.shrine = st.shrines[${i}];
      // Keep the pilot parked (MANUAL) and off the altar's 26px purchase
      // radius? No — standing close is the point; give the purse nothing so
      // no sale fires and the altar stays lit for the shot.
      T.getProfile().runPurse = 0;
      st.player.x = px; st.player.y = py;
      const t0 = st.time;
      await new Promise(r => setTimeout(r, 400));
      return { mode: st.mode, dt: st.time - t0,
        view: st.shrines.indexOf(st.shrine), lit: !st.shrine.used };
    })()`, true);
    check(variants[i] + ': live view is altar index ' + i + ' (lit, unsold)',
      s.mode === 'playing' && s.view === i && s.lit, s);
    check(variants[i] + ': clock advances (live game)', s.dt > 0 && s.mode === 'playing', { dt: s.dt });
    console.log('  SHOT slice-k2-' + (i + 1) + '-' + variants[i] + ' -> ' + await p.shot('slice-k2-' + (i + 1) + '-' + variants[i]));
  }

  // SHOT 4 — CLOSE-UP (capture-only zoom): the ember altar at 3x so the art
  // reads pixel by pixel.
  const s4 = await p.evaluate(`(async () => {
    ${fresh}
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state, px = st.player.x, py = st.player.y;
    st.zoom = 3;
    T.getProfile().runPurse = 0;
    st.shrines.forEach((sh, k) => {
      if (k === 0) { sh.x = px - 46; sh.y = py - 6; sh.used = false; delete sh.blessing; }
      else { sh.x = px + 4000 + k * 500; sh.y = py; sh.used = false; }
    });
    st.shrine = st.shrines[0];
    st.player.x = px; st.player.y = py;
    const t0 = st.time;
    await new Promise(r => setTimeout(r, 250));
    return { mode: st.mode, dt: st.time - t0, zoom: st.zoom, lit: !st.shrine.used };
  })()`, true);
  check('close-up: ember altar at 3x zoom (lit)', s4.mode === 'playing' && s4.lit, s4);
  check('close-up: clock advances (live game)', s4.dt > 0 && s4.mode === 'playing', { dt: s4.dt });
  console.log('  SHOT slice-k2-4-ember-closeup -> ' + await p.shot('slice-k2-4-ember-closeup'));

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_k2: ' + red.length + ' FAILED check(s)') : 'capture_slice_k2: all checks passed');
  if (red.length) process.exitCode = 1;
});
