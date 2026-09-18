// ELEVATION v2 (2026-09-18, owner: "a gradient upward/downward that would
// create a separate path blocked off by a cliff. If possible form our view"):
// photographs the authored upper path at both phone sizes — the CLIFF FACE
// mid-span (drop line + face shading), the RAMP grade at the west door, the
// camera held at height on the path top, and the LIVE HORDE climbing to a
// pilot parked on the top (the anti-sanctuary demo). Structural reads come
// from the same seams the tests pin (renderer.terraceDrawn, the camera
// deadzone contract, reliefLevelAt).
// Run: node tools/verify_blocking_elevation.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/elevation-v2-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);
    const T = () => p.evaluate(`(async () => (await import('./src/main.js')).__TEST)()`);
    // FIRST-RUN PROLOGUE (2026-09-18): a fresh browser profile's run #1 opens
    // INERT (no spawns, frozen clock) — stamp runs=1 (the harness convention)
    // so this verifier photographs an ordinary run. The prologue itself has
    // its own verifier (tools/verify_prologue.mjs).
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      const pr = T2.getProfile();
      if (pr && pr.achievements && pr.achievements.totals) pr.achievements.totals.runs = 1;
      return true; })()`);
    // START GAME on the title card.
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.showTitle(); })()`);
    await p.sleep(150);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(800);

    // Structural read: the terrace paint is live on the default stage.
    const t = await T();
    ok(t.state.stage === 'VERDANT_HOLLOW', '[' + tag + '] the run is on the terraced default stage');
    ok(t.renderer.terraceDrawn === true, '[' + tag + '] drawTerrace painted the band');

    // Pin the pilot (MANUAL = no controller movement), camera settle, shoot.
    const pin = (x, y) => p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state, p2 = st.player;
      st.pilotMode = 'MANUAL'; p2.invuln = 1e9; p2.x = ${x}; p2.y = ${y};
      st.spawnTimer = 20; return true; })()`);
    const snap = async (name) => {
      await p.sleep(1400);                        // the smoothed camera converges
      const shot = await p.shot(name + '-' + tag);
      copyFileSync(shot, ART + '/' + name + '-' + tag + '.png');
    };

    // 1. THE CLIFF FACE: mid-span, standing just below the inner edge — the
    //    drop line + face shading of the 2-level cut, the top path beyond.
    await pin('0', '520');
    await snap('ev2-cliff');
    ok(true, '[' + tag + '] cliff face shot');

    // 2. THE RAMP: the west door's graded staircase (topLevel -> floor in
    //    whole 1-level steps) — standing at the foot, looking up the grade.
    await pin('Math.round(Math.cos(0.35) * 520)', 'Math.round(Math.sin(0.35) * 520)');
    await snap('ev2-ramp');
    ok(true, '[' + tag + '] ramp grade shot');

    // 3. CAMERA AT HEIGHT: standing ON the path top (level 2), the ground
    //    plane and the hollow must both stay in frame (deadzone contract).
    await pin('0', '630');
    await snap('ev2-height');
    const cam = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      return { sx: st.player.x - st.cam.x, sy: st.player.y - st.cam.y }; })()`);
    ok(cam.sx >= 40 && cam.sx <= 440 && cam.sy >= 40 && cam.sy <= 260,
      '[' + tag + '] camera at height holds the pilot on screen (' +
      cam.sx.toFixed(0) + ',' + cam.sy.toFixed(0) + ')');

    // 4. THE HORDE CLIMBS (the anti-sanctuary demo): pilot parked on the top,
    //    live spawns below — the route bias funnels walkers up the ramps.
    //    Wait for real seconds, then read how many reached the band.
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state, p2 = st.player;
      p2.x = 0; p2.y = 630; p2.invuln = 1e9;
      st.spawnTimer = 0.5; })()`);
    await p.sleep(9000);
    await snap('ev2-horde');
    const horde = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      const { terraceLevelAt } = await import('./src/relief.js');
      const { stageRelief } = await import('./src/stages.js');
      const rel = stageRelief(st.stage), seed = st.groundSeed || 0;
      let onBand = 0, top = 0, n = 0;
      for (const e of st.enemies) {
        if (e.hp <= 0) continue;
        n++;
        const lv = terraceLevelAt(e.x, e.y, seed, rel);
        if (lv !== null) { onBand++; if (lv === 2) top++; }
      }
      return { n, onBand, top }; })()`);
    ok(horde.n > 0, '[' + tag + '] the horde is live (' + horde.n + ' walkers)');
    ok(horde.onBand > 0,
      '[' + tag + '] walkers reached the band (' + horde.onBand + '/' + horde.n + ')');
    ok(horde.top > 0,
      '[' + tag + '] walkers reached the path TOP (' + horde.top + '/' + horde.n + ')');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
