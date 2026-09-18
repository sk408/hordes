// Escape-scene evidence shots (before/after the 2026-09-18 REACH-ROUTE
// rework: the floating-slab bypass superseded by the owner's preferred shape
// — "the boss reaching to grab the pilot and the pilot being able to run
// past. Has to look convincing"). Drives the REAL game through the TEST-card
// funnel, then the live escape via the __TEST seam. Usage:
//   node tools/escape_shots.mjs before   # HEAD as-is (pre-change evidence)
//   node tools/escape_shots.mjs after    # + the four grab-PHASE evidence shots
// Shots land in docs/art/escape-reach-2026-09-18/shots/. The after-mode
// phases (one fresh run each, wall LIVE — the clock is part of the scene):
//   windup — the claw RAISED, its striped landing zone on the floor, pilot
//            approaching (criterion a: the tell)
//   reach  — the claw OUT at full extension in the pilot's lane, pilot still
//            short of it (criterion b: reaches past the lane, not short)
//   held   — the pilot GRIPPED in the closed fingers (criterion c: contact
//            reads as contact)
//   miss   — the pilot CLEAR past the holding claw (criterion d: the clean
//            miss reads as a near miss)
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/escape-reach-2026-09-18/shots';
mkdirSync(ART, { recursive: true });
const MODE = process.argv[2] || 'after';
const SEED = 9;

// The page-side driver. AUTO rides every approach (the corridor's own bands
// are AUTO-only data; this tool tests the FINALE, which is what changed).
// __autoLoop(hookFn) steps AUTO until hookFn() fires (frozen mid-scene for a
// shot). __grabRun() rides AUTO to the claw's wind-up just outside the band,
// then switches to MANUAL hold-right — running INTO the close on purpose —
// and freezes 0.35s into the HELD beat.
const DRIVER = `
window.__T = (await import('./src/main.js')).__TEST;
const T = window.__T;
const sim = T.escape.sim;
const bossX = sim.corridor.bossX;
const claw = () => sim.boss.arms.find(a => a.id === 'claw');
window.__SIM = await import('./src/escape/sim.js');
window.__AUTO = await import('./src/escape/auto.js');
window.__autoLoop = (hookFn, maxSecs = 150) => {
  for (let i = 0; i < 60 * maxSecs && !sim.outcome; i++) {
    if (hookFn && hookFn()) return { froze: true, t: +sim.t.toFixed(2) };
    window.__SIM.step(sim, 1 / 60, window.__AUTO.inputFor(sim));
  }
  return { froze: false, outcome: sim.outcome, t: +sim.t.toFixed(2) };
};
window.__grabRun = (maxSecs = 150) => {
  for (let i = 0; i < 60 * maxSecs && !sim.outcome; i++) {
    const p = sim.player, d = bossX - p.x;
    if (d < 260 && p.onGround) {
      // manual takeover: run INTO the claw band's centre, then stand and wait
      // for the close (whichever ground arm's band that is — the log says which)
      for (let j = 0; j < 60 * 6 && !sim.grabbed && !sim.outcome; j++) {
        T.escape.onKey('d', (bossX - sim.player.x) > 132);
        T.escape.frame(null, 1 / 60);
      }
      if (sim.grabbed) {
        for (let j = 0; j < 21; j++) T.escape.frame(null, 1 / 60);   // 0.35s INTO the held beat
        return { froze: true, held: +sim.grabbed.t.toFixed(2), arm: sim.grabbed.arm };
      }
      return { froze: false, why: 'never grabbed' };
    }
    window.__SIM.step(sim, 1 / 60, window.__AUTO.inputFor(sim));
  }
  return { froze: false, outcome: sim.outcome };
};
// The NEAR-MISS run (criterion d): AUTO brings the pilot to its brake point
// left of the zone, then the manual player brakes until the claw is
// 0.25s into its wind-up and runs — the band is crossed JUST ahead of the
// close. Freeze while the claw is EXTENDED at the band and the pilot is
// clear of it.
window.__missRun = (maxSecs = 150) => {
  for (let i = 0; i < 60 * maxSecs && !sim.outcome; i++) {
    const p = sim.player, d = bossX - p.x;
    if (d < 200 && p.onGround) {
      let go = false;
      for (let j = 0; j < 60 * 8 && !sim.outcome; j++) {
        const g = claw(), dd = bossX - sim.player.x;
        if (!go) {
          // creep to the timing mark (178: 18px clear of the zone), hold there
          T.escape.onKey('d', dd > 178);
          if (g.phase === 'windup' && g.t >= 0.25 && dd <= 180) go = true;   // 0.40s of wind-up left: the run clears the band
        } else {
          T.escape.onKey('d', dd > 20);                              // latch: run THROUGH the close
        }
        T.escape.frame(null, 1 / 60);
        if (g.phase === 'extend' && dd < 110 && dd > 50) return { froze: true, dd: Math.round(dd) };
        if (dd < 20) break;                                         // ran it clean — retry next cycle
      }
      return { froze: false, why: 'no near-miss window this pass' };
    }
    window.__SIM.step(sim, 1 / 60, window.__AUTO.inputFor(sim));
  }
  return { froze: false, outcome: sim.outcome };
};
`;

async function beginRun(p, T, wallOff) {
  await p.evaluate(`(async () => { const T2 = ${T};
    T2.escape.begin({ seed: ${SEED}, auto: false, test: true });
    ${wallOff ? 'T2.escape.sim.wall.x = -1e6;' : ''}
    ${DRIVER}
    return true; })()`);
}

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
    // the onboarding deck can sit in front (page 1 of N with NEXT, GOT IT last)
    for (let i = 0; i < 8 && !(await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 500, 100)); i++) {
      if (!(await clickCard('GOT IT'))) await clickCard('NEXT');
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

    const take = async (name) => {
      await p.sleep(120);
      const shot = await p.shot('esc-shot');
      copyFileSync(shot, ART + '/' + name);
      console.log('[' + tag + '] ' + name);
    };

    // ---- the frozen-position LAYOUT shots (manual sim, wall disabled — the
    // shot is about GEOMETRY, not the clock): two exact camera stops.
    const stops = await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: ${SEED}, auto: false, test: true });
      return [T2.escape.sim.corridor.bossX - 200, T2.escape.sim.corridor.bossX + 10]; })()`);
    for (let s = 0; s < stops.length; s++) {
      await beginRun(p, T, true);
      await p.evaluate(`(function () {
        for (let i = 0; i < 60 * 150 && !window.__T.escape.sim.outcome; i++) {
          const s = window.__T.escape.sim;
          if (s.player.x >= ${stops[s]}) { window.__T.escape.onKey('d', false); break; }
          window.__T.escape.onKey('d', true);
          window.__T.escape.frame(null, 1 / 60);
        }
        return true; })()`);
      await take(MODE + '-layout' + (s ? '-portal' : '') + '-' + tag + '.png');
    }

    if (MODE === 'after') {
      // ---- the four grab-PHASE evidence shots (fresh run each, wall LIVE).
      const phases = [
        ['after-windup', `() => { const s = window.__T.escape.sim, c = s.boss.arms[0], p = s.player;
          return c.phase === 'windup' && p.x > s.corridor.bossX - 430 && p.x < s.corridor.bossX - 140 && p.onGround; }`],
        ['after-reach', `() => { const s = window.__T.escape.sim, c = s.boss.arms[0], p = s.player;
          return c.phase === 'hold' && (s.corridor.bossX - p.x) < 470 && (s.corridor.bossX - p.x) > 152; }`],
      ];
      for (const [name, hookSrc] of phases) {
        await beginRun(p, T, false);
        const r = await p.evaluate(`window.__autoLoop(${hookSrc}, 150)`);
        if (r.froze) await take(name + '-' + tag + '.png');
        else console.log('[' + tag + '] WARNING: ' + name + ' never froze: ' + JSON.stringify(r));
      }
      // the HELD shot: stand in the band and let the close land
      await beginRun(p, T, false);
      const r = await p.evaluate(`window.__grabRun(150)`);
      if (r.froze) { await take('after-held-' + tag + '.png'); console.log('[' + tag + '] held by: ' + r.arm + ' at t+' + r.held + 's'); }
      else console.log('[' + tag + '] WARNING: held never froze: ' + JSON.stringify(r));
      // the NEAR-MISS shot: cross just ahead of the close
      await beginRun(p, T, false);
      const m = await p.evaluate(`window.__missRun(150)`);
      if (m.froze) await take('after-miss-' + tag + '.png');
      else console.log('[' + tag + '] WARNING: miss never froze: ' + JSON.stringify(m));
      // the completion log (AUTO all the way — the route completes at the clock)
      await beginRun(p, T, false);
      const done = await p.evaluate(`(window.__autoLoop(null, 150),
        { outcome: window.__T.escape.sim.outcome, t: +window.__T.escape.sim.t.toFixed(2),
          pressure: Math.round(Math.max(0, window.__T.escape.sim.player.x - (window.__T.escape.sim.wall.x + 46))) })`);
      console.log('[' + tag + '] AUTO completion: ' + JSON.stringify(done));
    }

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 400)); }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log('escape_shots (' + MODE + ') done -> ' + ART);
