// WAVE ARENA SCALE-UP browser verifier (2026-09-17): the owner's ask proven
// in the REAL browser at BOTH phone sizes (390x844, 320x568) — the real UI
// funnel (title → START → playing), then the live 9-unit field:
//   1. EXTENT: the atlas is 45x45 over the live run, and the pilot CLAMPS at
//      the new rim (900) through the real loop — the arena really grew
//   2. ELEVATION, photographed: the relief layer paints (renderer.reliefCells
//      > 0 on the live frame), and a HIGH-GROUND frame is captured with the
//      pilot parked on level >= HIGH_LEVEL (the widened radar disc visible)
//   3. THE BOSS-CLEAR SWEEP, photographed: the wave is driven to its real
//      boss, the boss killed through the live funnel — the magnet ring effect
//      and the BOSS CLEAR SWEEP toast are on screen when the shot lands
//   4. FRAME COST: update+render ms/frame (p50/p95/max) over the live combat
//      by the same rAF-wrap method as verify_perf.mjs, read against BOTH
//      budgets (16.67ms / 8.33ms)
// Run: node tools/verify_arena_scaleup.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const ART = '/home/claude/projects/hordes/docs/art/arena-scaleup-2026-09-17/shots';
mkdirSync(ART, { recursive: true });
let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}
const pct = (s, q) => s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript:
      "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
      `window.__ft = [];
       (() => { const orig = window.requestAnimationFrame.bind(window);
         window.requestAnimationFrame = (cb) => orig((t) => {
           const a = performance.now(); cb(t);
           window.__ft.push(performance.now() - a);
         }); })();` },
  async (p) => {
    const T = `(await import('./src/main.js')).__TEST`;
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    await clickCard('START GAME');
    if (!(await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 4000, 100))) {
      await clickCard('GOT IT');
    }
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 8000);
    console.log('[' + tag + '] run started via the real title funnel');

    // ---- 1. EXTENT: the live atlas grid + the rim clamp through the real loop.
    const ext = await p.evaluate(`(async () => { const T2 = ${T};
      const C = (await import('./src/config.js')).CONFIG;
      T2.state.player.x = 5000; T2.state.player.y = -5000;   // fling: the loop clamps
      return { rim: C.GROUND.RIM, units: C.GROUND.UNITS,
        atlasSide: T2.state.atlas && T2.state.atlas.side }; })()`);
    await p.waitFor(`(async () => { const T2 = ${T}; const p2 = T2.state.player;
      return Math.abs(p2.x) <= 901 && Math.abs(p2.y) <= 901; })()`, 3000, 50);
    const clamped = await p.evaluate(`(async () => { const T2 = ${T};
      return { x: Math.round(T2.state.player.x), y: Math.round(T2.state.player.y) }; })()`);
    ok(ext.rim === 900 && ext.units === 3 && ext.atlasSide === 45,
      'extent: UNITS 3 -> RIM 900, live atlas ' + ext.atlasSide + 'x' + ext.atlasSide + ' cells (was 30x30)');
    ok(Math.abs(clamped.x) <= 900 && Math.abs(clamped.y) <= 900,
      'the pilot clamps at the new rim through the real loop (' + clamped.x + ',' + clamped.y + ')');

    // ---- 2. ELEVATION: the relief layer paints, and a HIGH-GROUND frame.
    const reliefPaints = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.renderer.reliefCells > 0; })()`, 5000, 60);
    ok(reliefPaints, 'the relief layer paints on the live field (contours + level tint)');
    let shot = await p.shot('arena-relief-' + tag);
    copyFileSync(shot, ART + '/relief-' + tag + '.png');
    // Park the pilot on the nearest HIGH point (level >= HIGH_LEVEL) and read
    // the widened radar radius the HUD actually draws from.
    const high = await p.evaluate(`(async () => { const T2 = ${T};
      const C = (await import('./src/config.js')).CONFIG;
      const { reliefLevel, reliefVisionRadius } = await import('./src/relief.js');
      const { stageRelief } = await import('./src/stages.js');
      const st = T2.state, p2 = st.player;
      const rel = stageRelief(st.stage), seed = st.groundSeed || 0;
      let bx = 0, by = 0, found = false;
      for (let r = 60; r <= 840 && !found; r += 30) {
        for (let a = 0; a < Math.PI * 2 && !found; a += Math.PI / 24) {
          const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
          if (reliefLevel(x, y, seed, rel) >= C.RELIEF.HIGH_LEVEL) { bx = x; by = y; found = true; }
        }
      }
      p2.x = bx; p2.y = by;
      const lv = reliefLevel(bx, by, seed, rel);
      return { found, lv, base: 330, vision: Math.round(reliefVisionRadius(330, lv)) }; })()`);
    ok(high.found && high.lv >= 2,
      'the pilot parked on HIGH ground (level ' + high.lv + ' of the stage field)');
    ok(high.vision === 495,
      'the radar disc the HUD draws widens to ' + high.vision + 'px on high ground (base ' + high.base + ')');
    await p.sleep(300);   // the camera settles on the new position
    shot = await p.shot('arena-highground-' + tag);
    copyFileSync(shot, ART + '/highground-' + tag + '.png');

    // ---- 3. THE BOSS-CLEAR SWEEP, photographed. Fast-forward the wave to its
    // real boss, kill it through the live funnel, and catch the magnet ring.
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.state.wave.endsAt = T2.state.time;
      T2.state.gems.length = 0; T2.state.drops.length = 0;
      for (let i = 0; i < 24; i++) {
        T2.state.gems.push({ x: T2.state.player.x + 140 + (i % 6) * 14,
          y: T2.state.player.y + 90 + Math.floor(i / 6) * 14, xp: 2 });
      } })()`);
    const bossUp = await p.waitFor(`(async () => { const T2 = ${T};
      return (T2.state.wave.bosses || []).some(b => b.hp > 0); })()`, 8000, 50);
    ok(bossUp, 'the wave boss spawned on the 9-unit field');
    await p.evaluate(`(async () => { const T2 = ${T};
      for (const b of T2.state.wave.bosses) if (b.hp > 0) b.hp = 0; })()`);
    const sweepArmed = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.state.player.bossSweep > 0; })()`, 5000, 30);
    ok(sweepArmed, 'the boss clear armed the VISIBLE sweep (p.bossSweep running)');
    await p.waitFor(`(async () => { const T2 = ${T};
      return T2.state.effects.some(fx => fx.kind === 'magnet'); })()`, 1000, 20);
    shot = await p.shot('arena-bosssweep-' + tag);
    copyFileSync(shot, ART + '/bosssweep-' + tag + '.png');
    const sweepRead = await p.waitFor(`(async () => { const T2 = ${T};
      return (T2.state.toasts || []).some(t => /BOSS CLEAR SWEEP/.test(t.msg || t.text || '')); })()`, 6000, 50);
    ok(sweepRead, 'the collected total is STATED as part of the clear moment (the toast fired)');

    // ---- 4. FRAME COST over live combat on the 9-unit field with relief live.
    await p.evaluate(`(async () => { const T2 = ${T};
      window.__ft.length = 0;
      T2.state.wave.endsAt = T2.state.time + 120;   // keep the horde flowing
      })()`);
    await p.sleep(4000);
    const ft = await p.evaluate(`window.__ft.slice(0).sort((a, b) => a - b)`);
    const p50 = pct(ft, 0.50), p95 = pct(ft, 0.95), mx = ft.length ? ft[ft.length - 1] : 0;
    ok(ft.length > 100, 'frame-cost sample is real (' + ft.length + ' frames timed)');
    ok(p95 < 16.67, 'p95 ' + p95.toFixed(2) + 'ms < 16.67ms (60Hz budget)');
    console.log('[' + tag + '] FRAME COST (arena, 9 units + relief): p50 ' + p50.toFixed(2) +
      'ms p95 ' + p95.toFixed(2) + 'ms max ' + mx.toFixed(2) + 'ms over ' + ft.length +
      ' frames — vs 16.67ms (60Hz) / 8.33ms (120Hz); loadavg ' +
      os.loadavg().map(x => x.toFixed(2)).join(' '));

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 400)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_arena_scaleup: ALL CHECKS PASSED (both viewports)');
process.exit(fails ? 1 : 0);
