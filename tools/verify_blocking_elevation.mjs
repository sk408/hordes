// ELEVATION ROLLBACK (2026-09-18, owner: "We need to rollback elevation for
// the time being... equalize the elevation so it's all equal"). INVERTED, not
// deleted: photographs the FLAT default stage at both phone sizes — the old
// terrace band area now ordinary ground, nothing painted, no level anywhere,
// and the LIVE HORDE walking STRAIGHT across the old cliff line to a parked
// pilot (no ramp detour, no funnel). Structural reads come from the same
// seams the tests pin (renderer.terraceDrawn, reliefLevelAt, the camera
// deadzone contract).
// Run: node tools/verify_blocking_elevation.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/elevation-rollback-2026-09-18/shots';
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
    // so this verifier photographs an ordinary run.
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

    // Structural read: the flat rollback is live — no terrace paint anywhere.
    const t = await T();
    ok(t.state.stage === 'VERDANT_HOLLOW', '[' + tag + '] the run is on the rolled-back default stage');
    ok(t.renderer.terraceDrawn !== true, '[' + tag + '] drawTerrace painted NOTHING (no TERRACE block)');

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

    // 1. THE OLD CLIFF LINE, now ordinary ground: mid-span at the old inner
    //    edge — no drop line, no face shading, no band. Flat field reads flat.
    await pin('0', '520');
    await snap('rollback-flatband');
    ok(true, '[' + tag + '] old band area shot');

    // 2. THE OLD PATH TOP, now the same ground as everywhere: standing at the
    //    old level-2 coordinates, the field is visually identical to the floor.
    await pin('0', '630');
    await snap('rollback-oldtop');
    // Structural: level 0 at BOTH old spots + a field sweep, and the camera
    // still holds the pilot (the deadzone contract survives the flatten).
    const flat = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      const { reliefLevelAt } = await import('./src/relief.js');
      const { stageRelief } = await import('./src/stages.js');
      const rel = stageRelief(st.stage), seed = st.groundSeed || 0;
      let maxLv = 0;
      for (let y = -860; y <= 860; y += 40) {
        for (let x = -860; x <= 860; x += 40) {
          if (Math.hypot(x, y) > 900) continue;
          maxLv = Math.max(maxLv, reliefLevelAt(x, y, seed, rel));
        }
      }
      return { maxLv, at520: reliefLevelAt(0, 520, seed, rel), at630: reliefLevelAt(0, 630, seed, rel),
        sx: st.player.x - st.cam.x, sy: st.player.y - st.cam.y }; })()`);
    ok(flat.maxLv === 0, '[' + tag + '] the whole field is level 0 (max ' + flat.maxLv + ')');
    ok(flat.at520 === 0 && flat.at630 === 0,
      '[' + tag + '] the old cliff edge and path top read level 0 (' + flat.at520 + '/' + flat.at630 + ')');
    ok(flat.sx >= 40 && flat.sx <= 440 && flat.sy >= 40 && flat.sy <= 260,
      '[' + tag + '] camera holds the pilot at the old top (' +
      flat.sx.toFixed(0) + ',' + flat.sy.toFixed(0) + ')');

    // 3. THE HORDE WALKS STRAIGHT (the no-funnel demo): pilot parked just past
    //    the old band, live spawns beyond it — walkers cross the old cliff line
    //    directly, none rerouted, none stalled. A beeline-rate read after real
    //    seconds: the share of the horde that got closer than the old inner
    //    edge radius (560) to the arena heart, i.e. crossed the band.
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state, p2 = st.player;
      p2.x = 0; p2.y = 300; p2.invuln = 1e9;
      st.spawnTimer = 0.5; })()`);
    await p.sleep(9000);
    await snap('rollback-beeline');
    const horde = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      let n = 0, crossed = 0, minR = 1e9;
      for (const e of st.enemies) {
        if (e.hp <= 0) continue;
        n++;
        const r = Math.hypot(e.x, e.y);
        if (r < 560) crossed++;                 // inside the old band's inner edge
        if (r < minR) minR = r;
      }
      return { n, crossed, minR }; })()`);
    ok(horde.n > 0, '[' + tag + '] the horde is live (' + horde.n + ' walkers)');
    ok(horde.crossed > 0,
      '[' + tag + '] walkers crossed the old band straight (' + horde.crossed + '/' + horde.n + ', min r ' +
      horde.minR.toFixed(0) + 'px) — nothing funnels or blocks');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
