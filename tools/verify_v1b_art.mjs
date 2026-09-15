// HORDES - tools/verify_v1b_art.mjs (V1b acceptance #1/#2). REAL Chrome at
// 390x844 @dpr3 AND 844x390 @dpr3 (the owner plays both orientations), the
// escape entered through the settings TEST button by ONE REAL TAP, then a few
// seconds of frames per shot (never a played run):
//   shot A "pursuit"  - a live pursuer on camera behind the runner, the wall
//                       mass staged on-screen (seam: sim.wall.x moved up), the
//                       parallax bands, lit platform edges and a pit.
//   shot B "pitfall"  - a pit event with a live FALL effect (natural timing:
//                       we only wait, never force).
//   shot C "flier"    - the flier sprite mid-dive (seam: player teleported
//                       past the 18% escalation mark so fliers are live).
//   shot D "portal"   - the exit as the glowing destination (seam: player
//                       teleported near portalX).
// Every staged seam is the mode's published current() sim, disclosed here and
// in the done report. PNGs land in docs/art/v1-escape-art-2026-09-15/ at the
// natural dpr3 size. No console errors.
// Run: node tools/verify_v1b_art.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/v1-escape-art-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;

async function arm(w, h, label) {
  return withPage({ w, h, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
    async (p) => {
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
      if (!start) throw new Error('no START GAME card');
      await p.tap(start[0], start[1]);
      await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
      const runLive = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

      const cog = await p.evaluate(`(() => {
        const el = document.querySelector('[data-act="settings"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!cog) throw new Error('no touch cog');
      await p.tap(cog[0], cog[1]);
      await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
      const btn = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').includes('TEST: ESCAPE SEQUENCE'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      if (!btn) throw new Error('no TEST button');
      await p.tap(btn[0], btn[1]);
      const entered = await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);

      // SHOT A: a live pursuer behind the runner + the wall mass staged on
      // screen + terrain. The wall seam keeps the shot honest about staging.
      const onCam = await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim) return false; const pl = sim.player;
        return sim.pursuers.some(pu => pu.hp > 0 && pu.x < pl.x && pu.x >= pl.x - 150); })()`, 30000, 50);
      await p.evaluate(`(async () => { const T2 = ${T};
        T2.escape.sim.wall.x = T2.escape.sim.player.x - 190; })()`);   // staged: leading edge ~144px behind (on camera)
      const worldA = await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; const pl = sim.player;
        return { t: +sim.t.toFixed(2), wallScreenDx: Math.round(sim.wall.x + 46 - pl.x),
          behind: sim.pursuers.filter(pu => pu.hp > 0 && pu.x < pl.x).map(pu => Math.round(pu.x - pl.x)) }; })()`);
      const shotA = await p.shot(label + '-pursuit');

      // SHOT B: a live pit-fall effect (natural timing only: we wait for a
      // recent 'pit' event; the fall lives 0.8s).
      const pitted = await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return sim.events.some(e => e.type === 'pit' && sim.t - e.t < 0.45); })()`, 20000, 40);
      const worldB = pitted ? await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        const e = [...sim.events].reverse().find(e => e.type === 'pit' && sim.t - e.t < 0.45);
        return { t: +sim.t.toFixed(2), ageMs: Math.round((sim.t - e.t) * 1000), at: Math.round(e.x), spawned: sim.spawnedPursuers, pitted: sim.pittedPursuers }; })()`) : null;
      const shotB = pitted ? await p.shot(label + '-pitfall') : null;

      // SHOT C: the flier mid-dive (seam: teleport past the 18% escalation
      // mark ONTO REAL FLOOR GROUND — a bare x-teleport can drop the runner
      // into a gap and end the sim — then park the wall back).
      const cStaged = await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false;
        const target = sim.corridor.length * 0.35;
        const pl = sim.plats.filter(q => Math.abs(q.y - 252) <= 2 && q.x + 60 > target)
          .sort((a, b) => a.x - b.x)[0];
        if (!pl) return false;
        sim.player.x = pl.x + 20; sim.player.y = 252; sim.player.vy = 0; sim.player.onGround = true;
        sim.wall.x = sim.player.x - 900;
        return true; })()`);
      const flied = cStaged === true ? await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; const pl = sim.player;
        return sim.fliers.some(fl => fl.hp > 0 && fl.x > pl.x - 160 && fl.x < pl.x + 340) && !sim.outcome; })()`, 15000, 50) : false;
      const worldC = flied ? await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; const pl = sim.player;
        return { t: +sim.t.toFixed(2), fliers: sim.fliers.filter(fl => fl.hp > 0)
          .map(fl => ({ dx: Math.round(fl.x - pl.x), y: Math.round(fl.y) })) }; })()`) : null;
      const shotC = flied ? await p.shot(label + '-flier') : null;

      // SHOT D: the portal as the destination (seam: teleport to the nearest
      // floor ground ~210px before portalX — the portal itself stands on a
      // flat, but the approach may not).
      const dStaged = await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim; if (!sim || sim.outcome) return false;
        const want = sim.corridor.portalX - 210;
        const pl = sim.plats.filter(q => Math.abs(q.y - 252) <= 2 && q.x < sim.corridor.portalX - 40)
          .sort((a, b) => Math.abs(a.x - want) - Math.abs(b.x - want))[0];
        if (!pl) return false;
        sim.player.x = pl.x + 20; sim.player.y = 252; sim.player.vy = 0; sim.player.onGround = true;
        sim.wall.x = sim.player.x - 900;
        return true; })()`);
      const portaled = dStaged === true ? await p.waitFor(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return !sim.outcome && sim.corridor.portalX - sim.player.x < 340 && sim.player.y === 252; })()`, 8000, 50) : false;
      const worldD = portaled ? await p.evaluate(`(async () => { const T2 = ${T};
        const sim = T2.escape.sim;
        return { t: +sim.t.toFixed(2), portalDx: Math.round(sim.corridor.portalX - sim.player.x) }; })()`) : null;
      const shotD = portaled ? await p.shot(label + '-portal') : null;

      // Clean exit: SKIP by a real tap on the painted rect, BACK resumes.
      const skipTap = await p.evaluate(`(() => {
        const r = document.getElementById('game').getBoundingClientRect();
        return [Math.round(r.x + 430 / 480 * r.width), Math.round(r.y + 21 / 300 * r.height)];
      })()`);
      await p.tap(skipTap[0], skipTap[1]);
      const back1 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 8000, 100);
      const back = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children]
          .find(k => (k.textContent || '').includes('BACK'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await p.tap(back[0], back[1]);
      const resumed = await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'playing' && T2.chromeOn(); })()`, 5000, 100);

      return { runLive, entered, onCam, worldA, shotA, pitted, worldB, shotB, flied, worldC, shotC,
        portaled, worldD, shotD, back1, resumed, errors: p.errors };
    });
}

const portrait = await arm(390, 844, 'v1b-port');
const landscape = await arm(844, 390, 'v1b-land');

// ---- verdict -------------------------------------------------------------
for (const [name, a, pxw, pxh] of [
  ['PORTRAIT 390x844', portrait, 1170, 2532],
  ['LANDSCAPE 844x390', landscape, 2532, 1170],
]) {
  check(name + ': run live, TEST tap entered the escape',
    a.runLive.mode === 'playing' && a.runLive.time > 1.0 && a.entered === true,
    a.runLive);
  check(name + ': SHOT A pursuit — pursuer on camera, wall mass on screen',
    a.onCam === true && a.worldA.behind.some((d) => d >= -150) && a.worldA.wallScreenDx >= -150 && a.worldA.wallScreenDx < 0,
    a.worldA);
  check(name + ': SHOT B pit-fall — a live fall captured (natural timing)',
    a.pitted === true && a.worldB && a.worldB.pitted > 0, a.worldB);
  check(name + ': SHOT C flier — a live flier mid-flight on camera',
    a.flied === true && a.worldC && a.worldC.fliers.length > 0, a.worldC);
  check(name + ': SHOT D portal — the destination on screen',
    a.portaled === true && a.worldD && a.worldD.portalDx > 0 && a.worldD.portalDx < 340, a.worldD);
  check(name + ': clean skip/resume back to the paused run',
    a.back1 === true && a.resumed === true, { back1: a.back1, resumed: a.resumed });
  check(name + ': no console errors', a.errors.length === 0, a.errors);
}

// PNGs: canonical copies at the natural dpr3 size.
let copied = 0;
for (const a of [portrait, landscape]) {
  for (const s of [a.shotA, a.shotB, a.shotC, a.shotD]) {
    if (!s) continue;
    const base = s.split('/').pop();
    try { copyFileSync(s, ART + '/' + base); copied++; } catch (e) { console.error('COPY FAILED: ' + e.message); }
  }
}
check('all 8 PNGs copied into ' + ART, copied === 8, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1B ART: FAIL' : 'VERIFY V1B ART: PASS - both orientations, TEST-button entry, PNGs in ' + ART);
process.exit(bad ? 1 : 0);
