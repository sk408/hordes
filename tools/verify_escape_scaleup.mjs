// ESCAPE MAP SCALE-UP browser verifier (2026-09-17): the owner's ask proven
// in the REAL browser at BOTH phone sizes (390x844, 320x568) — the real UI
// funnel (title → START → gate → cog → settings → TEST: ESCAPE SEQUENCE),
// then the live escape via the __TEST seam:
//   1. the letterbox: the canvas keeps the 480x300 virtual rect (CONTAIN), so
//      the full virtual width — and the new VERTICAL band — is visible at any
//      phone size
//   2. ELEVATION READING, photographed: a deck frame and a stack frame (the
//      corridor's tallest authored point, y=140) with the camera PAN active
//      (camY > 0) — the pilot always sees where they are going UP and the
//      floor they drop back DOWN to
//   3. NO POPUP over the pads or the vertical lanes: manual mode on a deck,
//      overlay hidden, help closed — photographed for the record
//   4. FRAME COST: update+render ms/frame (p50/p95/max) measured over the
//      elevated traversal by the same rAF-wrap method as verify_perf.mjs
//      (callback-in to callback-out; headless rAF ~60Hz, cost is
//      cadence-independent), read against BOTH budgets (16.67ms / 8.33ms)
// Run: node tools/verify_escape_scaleup.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const ART = '/home/claude/projects/hordes/docs/art/escape-scaleup-2026-09-17/shots';
mkdirSync(ART, { recursive: true });
let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}
const pct = (s, q) => s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;

// Seed 7: deck@2629 and stack@3842 — both elevated classes on one corridor.
// Seed 12: deck@2069 — the manual-mode shot.
const SEED_CLIMB = 7, SEED_MANUAL = 12;

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript:
      "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
      // THE MEASUREMENT (verify_perf.mjs method): time every game frame,
      // callback-in to callback-out, installed before page scripts run.
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
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null; const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
    let testCard = false;
    for (let i = 0; i < 10 && !testCard; i++) {
      testCard = await clickCard('TEST: ESCAPE SEQUENCE');
      if (!testCard) await p.sleep(150);
    }
    if (!testCard) throw new Error('no TEST card');
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    console.log('[' + tag + '] escape entered via the real TEST card');

    // ---- 1. the letterbox: full 480x300 virtual rect at any phone size.
    const box = await p.evaluate(`(() => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, ratio: r.width / r.height }; })()`);
    ok(Math.abs(box.ratio - 480 / 300) < 0.05,
      'letterbox: canvas ratio ' + box.ratio.toFixed(3) + ' ~= 480/300 (the vertical band is fully visible)');

    // ---- 2. ELEVATION READING, photographed. The climb seed is driven by
    // AUTO (the real controller); the live loop renders every state we walk
    // through, so the wait-then-shoot frames are the game's own frames.
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: ${SEED_CLIMB}, auto: true }); })()`);
    const onDeck = await p.waitFor(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim;
      return sim.player.onGround && sim.player.y < 252 - 40; })()`, 40000, 60);
    ok(onDeck, 'AUTO climbed onto a deck (the elevated route is ridden, not decorative)');
    const deckRead = await p.evaluate(`(async () => { const T2 = ${T};
      const { camYFor } = await import('./src/escape/render.js');
      const sim = T2.escape.sim;
      window.__ft.length = 0;                     // frame cost of the elevated run starts HERE
      return { y: Math.round(sim.player.y), camY: camYFor(sim.player),
        fliers: sim.fliers.length }; })()`);
    ok(deckRead.y <= 208 && deckRead.camY >= 2,
      'deck frame: pilot y=' + deckRead.y + ', camera pan camY=' + deckRead.camY + 'px (the deck reads on screen)');
    let shot = await p.shot('scaleup-deck-' + tag);
    copyFileSync(shot, ART + '/deck-' + tag + '.png');

    const onStack = await p.waitFor(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim;
      return sim.player.onGround && sim.player.y <= 145; })()`, 60000, 60);
    ok(onStack, 'AUTO climbed the STACK to the corridor\'s tallest authored point');
    const stackRead = await p.evaluate(`(async () => { const T2 = ${T};
      const { camYFor } = await import('./src/escape/render.js');
      const sim = T2.escape.sim;
      return { y: Math.round(sim.player.y), camY: camYFor(sim.player),
        floorY: 252 - camYFor(sim.player) }; })()`);
    ok(stackRead.y <= 145 && stackRead.camY >= 25,
      'stack frame: pilot y=' + stackRead.y + ', camY=' + stackRead.camY + 'px, floor line at virtual y=' + stackRead.floorY + ' (drop-back visible)');
    shot = await p.shot('scaleup-stack-' + tag);
    copyFileSync(shot, ART + '/stack-' + tag + '.png');

    // ---- 3. MANUAL on a deck: the pads are live, no popup over them or the
    //    vertical lane (overlay hidden, help closed). Photographed.
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: ${SEED_MANUAL}, auto: false }); })()`);
    // Drive the climb with the AUTO controller's own inputs against the sim
    // directly (manual begin means frame() reads held keys; the walk below is
    // exactly what auto feeds the same step(), and the live loop keeps
    // rendering the result through the real draw).
    await p.evaluate(`(async () => { const T2 = ${T};
      const { inputFor } = await import('./src/escape/auto.js');
      const { step } = await import('./src/escape/sim.js');
      const sim = T2.escape.sim;
      for (let i = 0; i < 60 * 60 && !(sim.player.onGround && sim.player.y < 212) && !sim.outcome; i++) {
        step(sim, 1 / 60, inputFor(sim));
      } })()`);
    const manRead = await p.evaluate(`(async () => { const T2 = ${T};
      const { camYFor } = await import('./src/escape/render.js');
      const sim = T2.escape.sim;
      const ov = document.getElementById('ov');
      return { y: Math.round(sim.player.y), camY: camYFor(sim.player),
        overlay: ov ? ov.style.display : 'none', help: T2.state.helpMode,
        mode: T2.state.mode }; })()`);
    ok(manRead.y <= 212, 'manual climb: pilot parked on a deck (y=' + manRead.y + ')');
    ok(manRead.overlay === 'none' && manRead.help === false,
      'no popup over the pads or the vertical lane (overlay ' + manRead.overlay + ', help ' + manRead.help + ')');
    shot = await p.shot('scaleup-manual-deck-' + tag);
    copyFileSync(shot, ART + '/manual-deck-' + tag + '.png');

    // ---- 4. FRAME COST over the elevated traversal (deck -> stack -> shots).
    await p.sleep(2000);   // let the live loop add its own frames on top
    const ft = await p.evaluate(`window.__ft.slice(0).sort((a, b) => a - b)`);
    const p50 = pct(ft, 0.50), p95 = pct(ft, 0.95), mx = ft.length ? ft[ft.length - 1] : 0;
    ok(ft.length > 100, 'frame-cost sample is real (' + ft.length + ' frames timed)');
    ok(p95 < 16.67, 'p95 ' + p95.toFixed(2) + 'ms < 16.67ms (60Hz budget)');
    console.log('[' + tag + '] FRAME COST (escape, elevated): p50 ' + p50.toFixed(2) +
      'ms p95 ' + p95.toFixed(2) + 'ms max ' + mx.toFixed(2) + 'ms over ' + ft.length +
      ' frames — vs 16.67ms (60Hz) / 8.33ms (120Hz); loadavg ' +
      os.loadavg().map(x => x.toFixed(2)).join(' '));

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 400)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_escape_scaleup: ALL CHECKS PASSED (both viewports)');
process.exit(fails ? 1 : 0);
