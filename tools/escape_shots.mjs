// Escape-scene evidence shots (before/after the 2026-09-18 boss-bypass
// rework). Drives the REAL game through the TEST-card funnel, then the live
// escape via the __TEST seam, steering MANUAL (held run + jump edges) to
// exact camera positions around the finale. Usage:
//   node tools/escape_shots.mjs before   # HEAD as-is (pre-change evidence)
//   node tools/escape_shots.mjs after    # + the scripted UPPER-ROUTE run
// Shots land in docs/art/escape-bypass-2026-09-18/shots/.
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/escape-bypass-2026-09-18/shots';
mkdirSync(ART, { recursive: true });
const MODE = process.argv[2] || 'after';
const SEED = 9;

// The scripted MANUAL controller for the upper route (installed on the page).
// Deterministic: hold RUN RIGHT; fire the jump when grounded inside the next
// platform's fire window; before the gap jump that crosses the sickle's band,
// BRAKE on the safe standable span until dead reckoning says the crossing is
// clear (the same two-way interval test auto.js uses, applied to the one
// airborne arm). Dashes burn on cooldown when no fire window is near — speed
// is life, the wall is the clock. __drive() returns ONE frame's decision;
// __shotHook (optional) can freeze the drive loop for a screenshot.
const DRIVER = `
window.__T = (await import('./src/main.js')).__TEST;
const T = window.__T;
const sim = T.escape.sim;
const FLOOR = 252;
const x0 = sim.corridor.bossSegX0;
const bossX = sim.corridor.bossX;
// Fire windows (rel the finale x0), derived the way the generator's up-hop
// author works: the landing must sit >= 8px inside the target span at run
// speed 200 (up-hop descending-crossing time H64; the drop-hop T64; the
// level hop the full 0.8s airtime).
const H64 = (400 + Math.sqrt(400 * 400 - 2 * 1000 * 64)) / 1000;   // 0.579s
const T64 = (400 + Math.sqrt(400 * 400 + 2 * 1000 * 64)) / 1000;   // 0.937s
const hops = [
  { win: [x0 + 60, x0 + 148] },                                // floor -> F1 (up 64)
  { win: [x0 + 180, x0 + 220] },                               // F1 -> F2 (up 64)
  { win: [x0 + 288, x0 + 336], gate: true },                   // F2 -> F3 (level, crosses the sickle band)
  { win: [x0 + 392, x0 + 437] },                               // F3 -> F4 (down 64)
];
let hopI = 0, lastJumpT = -1, overBossMax = -999;
window.__overBossMax = () => overBossMax;
const sickle = () => sim.boss.arms.find(a => a.id === 'sickle');
function sickleSafe(p) {
  const g = sickle(), cyc = 2.4, danger = g.extend + g.hold;
  const idle = cyc - (g.windup + g.extend + g.hold + g.retract);
  let s, e;
  if (g.phase === 'idle') { s = (idle - g.t) + g.windup; e = s + danger; }
  else if (g.phase === 'windup') { s = g.windup - g.t; e = s + danger; }
  else if (g.phase === 'extend') { s = 0; e = (g.extend - g.t) + g.hold; }
  else if (g.phase === 'hold') { s = 0; e = g.hold - g.t; }
  else { s = (g.retract - g.t) + idle + g.windup; e = s + danger; }
  const iv = [[s, e], [s + cyc, e + cyc]];
  const bandL = bossX - g.reach - g.r, clearX = bossX - g.reach + g.r + 26;
  const tToBand = Math.max(0, (bandL - 6 - p.x) / 200);
  const tToClear = Math.max(0, (clearX - p.x) / 200);
  return !iv.some(([is, ie]) => is < tToClear + 0.12 && ie > tToBand - 0.12);
}
window.__drive = () => {
  const p = sim.player;
  if (p.x > x0 + 300 && p.x < x0 + 505) overBossMax = Math.max(overBossMax, p.y);
  const hop = hops[hopI];
  let moveX = 1, jump = false;
  if (!hop) return { moveX, jump, dash: p.onGround && p.dashCd <= 0 };
  if (hop.gate && p.onGround && p.x > hop.win[0] - 40 && !sickleSafe(p)) moveX = 0;
  if (p.onGround && p.x >= hop.win[0] && p.x <= hop.win[1] && sim.t - lastJumpT > 0.3) {
    jump = true; lastJumpT = sim.t; hopI++;
  }
  const nearWin = p.x > hop.win[0] - 120 && p.x < hop.win[1] + 40;
  return { moveX, jump, dash: p.onGround && p.dashCd <= 0 && !nearWin };
};
window.__pos = (x) => {
  for (let i = 0; i < 60 * 150 && !sim.outcome; i++) {
    if (sim.player.x >= x) { T.escape.onKey('d', false); return true; }
    T.escape.onKey('d', true);
    T.escape.frame(null, 1 / 60);
  }
  return false;
};
// The full upper-route drive. The APPROACH (everything before the finale) is
// AUTO-ridden directly through sim.step — the corridor's own jump bands are
// AUTO-only data and this tool tests the FINALE, which is what changed. The
// manual bypass driver takes over at the finale's x0.
window.__x0 = x0;
window.__SIM = await import('./src/escape/sim.js');
window.__AUTO = await import('./src/escape/auto.js');
window.__driveLoop = (hookFn, maxSecs) => {
  for (let i = 0; i < 60 * maxSecs && !sim.outcome; i++) {
    if (sim.player.x < x0 + 10) {
      window.__SIM.step(sim, 1 / 60, window.__AUTO.inputFor(sim));
      continue;
    }
    if (hookFn && hookFn()) return { froze: true };
    const inp = window.__drive();
    T.escape.onKey('d', inp.moveX === 1);
    if (inp.jump) T.escape.onKey('w', true);
    if (inp.dash) T.escape.onKey('x', true);
    T.escape.frame(null, 1 / 60);
  }
  return { froze: false, outcome: sim.outcome, t: +sim.t.toFixed(2) };
};
`;

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true }, async (p) => {
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
    // MENU CONDENSE D1: the TEST: ESCAPE SEQUENCE card is debug-gated now.
    await p.evaluate(`localStorage.setItem('hordes_debug', '1')`);
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
    if (!testCard) {
      const dump = await p.evaluate(`(() => {
        const c = document.getElementById('ov-cards');
        return { mode: (window.__T ? 't' : ''), flag: localStorage.getItem('hordes_debug'),
          cards: c ? [...c.children].map(k => (k.textContent || '').slice(0, 30)) : null }; })()`);
      throw new Error('no TEST card: ' + JSON.stringify(dump));
    }
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    console.log('[' + tag + '] escape entered via the real TEST card');

    // ---- the frozen-position LAYOUT shots (manual sim, wall disabled — the
    // shot is about GEOMETRY, not the clock): two exact camera stops.
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: ${SEED}, auto: false, test: true });
      T2.escape.sim.wall.x = -1e6;
      ${DRIVER}
      return true; })()`);
    const stops = await p.evaluate(`[window.__T.escape.sim.corridor.bossX - 200, window.__T.escape.sim.corridor.bossX + 10]`);
    for (let s = 0; s < stops.length; s++) {
      await p.evaluate(`window.__pos(${stops[s]})`);
      await p.sleep(120);
      const shot = await p.shot('esc-shot');
      const name = MODE + '-layout' + (s ? '-portal' : '') + '-' + tag + '.png';
      copyFileSync(shot, ART + '/' + name);
      console.log('[' + tag + '] layout stop ' + s + ' @ x=' + stops[s] + ' -> ' + name);
    }

    if (MODE === 'after') {
      // ---- the scripted UPPER ROUTE (wall LIVE — the clock is part of the
      // trade). Frozen once standing on the far high slab for the money shot,
      // then driven to the portal.
      await p.evaluate(`(async () => { const T2 = ${T};
        T2.escape.begin({ seed: ${SEED}, auto: false, test: true });
        ${DRIVER}
        return true; })()`);
      const froze = await p.evaluate(`window.__driveLoop(() => {
        const p = window.__T.escape.sim.player;
        return p.onGround && p.y <= 130 && p.x > window.__x0 + 380;   // standing on the far high slab
      }, 150)`);
      if (froze.froze) {
        await p.sleep(120);
        const shot = await p.shot('esc-shot');
        copyFileSync(shot, ART + '/after-upper-route-' + tag + '.png');
        console.log('[' + tag + '] upper-route mid-shot taken');
      } else {
        console.log('[' + tag + '] WARNING: never reached the high slab stand');
      }
      const done = await p.evaluate(`(window.__driveLoop(null, 60),
        { outcome: window.__T.escape.sim.outcome, t: +window.__T.escape.sim.t.toFixed(2),
          pressure: Math.round(Math.max(0, window.__T.escape.sim.player.x - (window.__T.escape.sim.wall.x + 46))),
          maxPyOverBoss: Math.round(window.__overBossMax()) })`);
      console.log('[' + tag + '] upper-route completion: ' + JSON.stringify(done));
    }

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 400)); }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log('escape_shots (' + MODE + ') done -> ' + ART);
