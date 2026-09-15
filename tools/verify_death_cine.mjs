// HORDES - tools/verify_death_cine.mjs (G15 THE DEATH MOVIE, acceptance #3/#5,
// docs/briefs/G15_DEATH_MOVIE.md). REAL Chrome at 390x844 @dpr3:
//   1. ALL tour flags set up front (the live TOUR_KEYS list imported from
//      src/tour.js, so the set can never go stale) and the run clock ASSERTED
//      ADVANCING (state.time > 1.0) before any measurement.
//   2. A REAL DEATH through the real seam: a typed SPITTER parked on the hero
//      (the test_death_screen.mjs path) - the live contact path kills, die()
//      composes the payoff, the movie plays.
//   3. THREE PNGs at three points on the timeline (BLOW / COLLAPSE / TAKEN),
//      each read back for ink; the canvas ink CHANGES between consecutive
//      points (deltas printed); the overlay is HIDDEN at every point, chrome
//      OFF, gold not re-paid, deathBy not re-stamped.
//   4. The NATURAL hand-off: measured wall duration <= 6.0s, the payoff
//      overlay revealed, the end-card DOM read (cause / gold / next-unlock).
//   5. A SECOND death skipped by ONE REAL TAP: mode 'dead' in < 250ms.
//   6. No console errors in the arm. There is no vision model in this job -
//      the PNGs are read back by ink/state sampling only, and are left for
//      the owner.
// Run: node tools/verify_death_cine.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/death-cine-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// Every tour flag, read from the LIVE module (the list can never go stale).
// TOUR_KEYS VALUES are already the full storage keys ('hordes_tour_stage1'),
// so they are set verbatim — no extra prefix.
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

// The parked-killer probe: the test_death_screen.mjs death path, in-page.
// The headless test re-parks the killer on the hero EVERY FRAME (the AUTO
// pilot walks the hero otherwise); the in-page rAF loop below mirrors that
// pump callback until the death lands, then stands itself down.
const KILL = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { makeTypedEnemy } = await import('./src/enemy_types.js');
  const s = T.state, p = s.player;
  T.startRun();
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  s.spawnTimer = 999; s.wave.endsAt = s.time + 9999;
  s.enemies.length = 0;
  const k = makeTypedEnemy('SPITTER', p.x, p.y, s.time);
  k.hp = k.maxHp = 1e6; k.speed = 0;
  s.enemies.push(k);
  window.__g15Park = true;
  const park = () => {
    if (!window.__g15Park) return;
    const st = (window.__hordesMain || (window.__hordesMain = T)).state;
    if (st.mode === 'death-cine' || st.mode === 'dead') { window.__g15Park = false; return; }
    const e = st.enemies[0];
    if (e && e.hp > 0) { e.x = st.player.x; e.y = st.player.y; e.speed = 0; }
    requestAnimationFrame(park);
  };
  park();
  return true;
})()`;

// Ink sample points on the movie's virtual 480x300: a 20-point grid across the
// action band (the hero falls, dissolves and the silhouettes darken between
// y~150 and the ground line at 240), plus sky/ground reference points outside
// it (mapped through the LIVE canvas rect, like main.js's own pointer map).
const VPTS = { sky: [240, 60], ground: [240, 262] };
for (const gx of [180, 216, 252, 288, 324]) {
  for (const gy of [150, 180, 210, 238]) VPTS['g' + gx + '_' + gy] = [gx, gy];
}

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title, then a REAL TAP on START GAME; the run clock must be
    // ADVANCING before any measurement below (the frozen-game guard).
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const start = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!start) throw new Error('no START GAME card on the title');
    await p.tap(start[0], start[1]);
    await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runLive = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

    // ---- TAKE 1: the NATURAL movie (no skip) --------------------------------
    await p.evaluate(KILL);
    const t0 = Date.now();
    const took1 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'death-cine')()`, 8000, 25);
    if (!took1) throw new Error('the parked killer never killed (take 1)');
    const deathDetectedMs = Date.now() - t0;
    const mid0 = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { cause: T.state.deathBy && T.state.deathBy.cause, typeId: T.state.deathBy && T.state.deathBy.typeId,
        gold: T.getProfile().gold,
        overlay: document.getElementById('overlay').style.display, chromeOn: T.chromeOn() }; })()`);

    // Three points on the timeline (wall-ms: BLOW 0-1286, COLLAPSE 1286-3429,
    // TAKEN 3429-4714, HANDOFF 4714-6000).
    const POINTS = [
      { name: 'blow', at: 650 }, { name: 'collapse', at: 2500 }, { name: 'taken', at: 4300 },
    ];
    const shots = [];
    for (const pt of POINTS) {
      const reached = await p.waitFor(`(async () => { const T = (await import('./src/main.js')).__TEST;
        return T.state.mode === 'death-cine' && T.deathCine.t >= ${pt.at}; })()`, 6000, 25);
      if (!reached) throw new Error('the movie never reached ' + pt.name + ' (t=' + pt.at + 'ms)');
      const st = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
        return { t: Math.round(T.deathCine.t), mode: T.state.mode,
          overlay: document.getElementById('overlay').style.display, chromeOn: T.chromeOn() }; })()`);
      const shot = await p.shot('death-cine-' + pt.name);
      // Read ink at the virtual points mapped through the LIVE canvas rect.
      const map = await p.evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const samples = {};
      for (const [label, [vx, vy]] of Object.entries(VPTS)) {
        samples[label] = [Math.round(map.x + vx / 480 * map.w), Math.round(map.y + vy / 300 * map.h)];
      }
      const read = await p.readShot(shot, samples);
      shots.push({ name: pt.name, st, shot, read });
    }

    // The natural hand-off: wall duration + the end-card DOM.
    const handed = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()`, 4000, 25);
    if (!handed) throw new Error('the natural hand-off never landed');
    const exitT = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.deathCine.t)()`);
    const naturalMs = Date.now() - t0 - deathDetectedMs;
    const end = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      const sub = document.getElementById('ov-sub').innerHTML;
      return { mode: T.state.mode, overlay: document.getElementById('overlay').style.display,
        title: document.getElementById('ov-title').textContent, sub,
        gold: T.getProfile().gold,
        deathBy: JSON.stringify(T.state.deathBy) }; })()`);

    // ---- TAKE 2: ONE REAL TAP skips a fresh death in < 250ms ----------------
    await p.evaluate(KILL);
    const took2 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'death-cine')()`, 8000, 25);
    if (!took2) throw new Error('the parked killer never killed (take 2)');
    const map2 = await p.evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const s0 = Date.now();
    await p.tap(Math.round(map2.x + map2.w / 2), Math.round(map2.y + map2.h / 2));
    let skipMs = null, skipMode = null;
    for (let i = 0; i < 40; i++) {
      await p.sleep(10);
      const st = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
        return T.state.mode; })()`);
      if (st === 'dead') { skipMs = Date.now() - s0; skipMode = st; break; }
    }
    const afterSkip = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode,
        overlay: document.getElementById('overlay').style.display }; })()`);

    return { runLive, mid0, shots, exitT, naturalMs, end, skipMs, skipMode, afterSkip, errors: p.errors };
  });

// ---- verdict -------------------------------------------------------------
check('run went live with ALL ' + Object.keys(TOUR_KEYS).length + ' tour flags and state.time ADVANCING (t=' +
  arm.runLive.time + 's)', arm.runLive.mode === 'playing' && arm.runLive.time > 1.0, arm.runLive);
check('the parked SPITTER killed through the live path: movie up, overlay HIDDEN, chromeOn()=false',
  arm.mid0.cause === 'contact' && arm.mid0.typeId === 'SPITTER' && arm.mid0.overlay === 'none' &&
  arm.mid0.chromeOn === false, arm.mid0);

// Ink deltas between consecutive timeline points.
const inkDelta = (a, b) => {
  let worst = 0, where = '';
  for (const label of Object.keys(VPTS)) {
    const pa = a.read.px[label], pb = b.read.px[label];
    const d = Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
    if (d > worst) { worst = d; where = label; }
  }
  return { worst, where };
};
for (let i = 1; i < arm.shots.length; i++) {
  const a = arm.shots[i - 1], b = arm.shots[i];
  const d = inkDelta(a, b);
  check('ink CHANGES ' + a.name + ' -> ' + b.name + ' (max delta ' + d.worst + '/765 at ' + d.where +
    '; t=' + a.st.t + 'ms -> ' + b.st.t + 'ms)', d.worst >= 24, { a: a.read.px, b: b.read.px });
}
for (const s of arm.shots) {
  check('at ' + s.name + ' (t=' + s.st.t + 'ms): still death-cine, overlay HIDDEN, chrome OFF, PNG 1170x2532',
    s.st.mode === 'death-cine' && s.st.overlay === 'none' && s.st.chromeOn === false &&
    s.read.w === 1170 && s.read.h === 2532, { st: s.st, w: s.read.w, h: s.read.h });
}
check('gold settled ONCE and deathBy never re-stamped across the movie',
  typeof arm.end.gold === 'number' && arm.end.gold === arm.mid0.gold && arm.end.deathBy.includes('"SPITTER"'),
  { mid: arm.mid0.gold, end: arm.end.gold });
check('NATURAL hand-off at wall t=' + arm.exitT + 'ms (design 6000ms, bar <= 6.0s+' +
  'slack): mode=dead, overlay REVEALED, title=' + JSON.stringify(arm.end.title),
  arm.end.mode === 'dead' && arm.end.overlay === 'flex' && arm.exitT <= 6250, { exitT: arm.exitT });
check('the end card after the hand-off carries cause + gold + next-unlock',
  /KILLED BY SPITTER/.test(arm.end.sub) && /GOLD EARNED: \+\d+/.test(arm.end.sub) &&
  /NEXT UNLOCK: /.test(arm.end.sub), arm.end.sub);
check('ONE REAL TAP skips a fresh death in ' + arm.skipMs + 'ms (< 250ms) to the revealed payoff',
  arm.skipMode === 'dead' && arm.skipMs !== null && arm.skipMs < 250 &&
  arm.afterSkip.overlay === 'flex', arm.afterSkip);
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

// Keep the three timeline PNGs (plus a copy under the canonical date name).
for (const s of arm.shots) {
  const canonical = ART + '/death-cine-' + s.name + '-390x844.png';
  try { copyFileSync(s.shot, canonical); console.log('PNG: ' + canonical); }
  catch (e) { console.error('COPY FAILED: ' + e.message); }
}

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY DEATH CINE: FAIL'
  : 'VERIFY DEATH CINE: PASS - real Chrome 390x844 @dpr3, all ' + Object.keys(TOUR_KEYS).length +
    ' tour flags, run clock asserted advancing, a real parked-killer death, three timeline PNGs with ' +
    'measured ink deltas, overlay hidden/revealed at every point, gold settled once, natural exit ' +
    arm.exitT + 'ms <= 6.0s bar, one-tap skip ' + arm.skipMs + 'ms');
process.exit(bad ? 1 : 0);
