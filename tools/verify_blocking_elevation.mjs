// BLOCKING ELEVATION prototype (msg_01M2RK5B, 2026-09-17): photographs the
// rim wall at both phone sizes — the RAMPART face + cliff lips mid-band, the
// GATE terrace + post ticks at a cardinal, and the camera held at height
// (the pilot standing on the rampart top, ground plane visible).
// Run: node tools/verify_blocking_elevation.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/blocking-elevation-2026-09-17/shots';
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
    let t = await T();
    // START GAME on the title card.
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.showTitle(); })()`);
    await p.sleep(150);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(800);

    // Structural read first: the wall paint is live on the default stage.
    t = await T();
    ok(t.state.stage === 'VERDANT_HOLLOW', '[' + tag + '] the run is on the walled default stage');
    ok(t.renderer.wallDrawn === true, '[' + tag + '] drawWall painted the band');

    // Pin the pilot (MANUAL = no controller movement) at three wall spots.
    const pin = (x, y) => p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state, p2 = st.player;
      st.pilotMode = 'MANUAL'; p2.invuln = 1e9; p2.x = ${x}; p2.y = ${y};
      st.spawnTimer = 20; return true; })()`);

    // 1. THE RAMPART FACE: mid-band, non-gap angle — cliff lips + band top.
    await pin('Math.round(Math.cos(0.9) * 745)', 'Math.round(Math.sin(0.9) * 745)');
    await p.sleep(1400);                       // the smoothed camera converges
    let shot = await p.shot('be-rampart-' + tag);
    copyFileSync(shot, ART + '/be-rampart-' + tag + '.png');
    ok(true, '[' + tag + '] rampart face shot');

    // 2. THE GATE: east cardinal — terrace + post ticks + the gate stones.
    await pin('0', '730');
    await p.sleep(1400);
    shot = await p.shot('be-gate-' + tag);
    copyFileSync(shot, ART + '/be-gate-' + tag + '.png');
    ok(true, '[' + tag + '] gate choke shot');

    // 3. CAMERA AT HEIGHT: standing ON the rampart top (level 2), the ground
    //    plane and the horizon of the hollow must both be in frame.
    await pin('Math.round(Math.cos(-2.2) * 730)', 'Math.round(Math.sin(-2.2) * 730)');
    await p.sleep(1400);
    shot = await p.shot('be-height-' + tag);
    copyFileSync(shot, ART + '/be-height-' + tag + '.png');
    // Same-shot evidence: the pilot is on screen with safe margin (the test's
    // camera contract), read from the live camera seam.
    const cam = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      return { sx: st.player.x - st.cam.x, sy: st.player.y - st.cam.y }; })()`);
    ok(cam.sx >= 40 && cam.sx <= 440 && cam.sy >= 40 && cam.sy <= 260,
      '[' + tag + '] camera at height holds the pilot on screen (' +
      cam.sx.toFixed(0) + ',' + cam.sy.toFixed(0) + ')');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
