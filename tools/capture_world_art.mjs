// World art capture (art pass, world makeover): per stage, in a real headless
// Chrome, the run-start view (ground + the spawn hamlet), the main plateau
// (cliff face, ramp, drop edge), the stage landmark and the arena rim, at
// 1280x720 and 844x390. Same seed and clock every run, so a tag is
// reproducible frame for frame. Also writes <tag>-frame-ms.json: median
// render() cost per stage (no enemies) at desktop size.
//   HORDES_CHROME=<chrome.exe> node tools/capture_world_art.mjs <tag> [outDir] [STAGE,...] [desktop|phone]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] || 'shot';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'docs/art/world-art'));
const only = process.argv[4] ? process.argv[4].split(',') : null;
const vpOnly = process.argv[5] || null;
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');
const { STAGES } = await import('../src/stages.js');

const STARTUP = `
(() => {
  let s = 20261002;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let now = 1000; const q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__pump = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = q.shift(); if (!cb) return i; cb(now); } return n; };
  for (const k of ['stage1','hud','pilot','focus','stance','move','skills','radar','map','zoom','draft','shop','chest','portal','arch','shrine','potion','elite','boss']) {
    try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {}
  }
})();`;
const BOOT = `(async () => {
  const m = await import('/src/main.js');
  window.T = m.__TEST;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5);
  return T.state.mode;
})()`;
const START = (id) => `(() => {
  T.stages.select(${JSON.stringify(id)}); T.startRun();
  window.__pump(3);
  const st = T.state;
  T.setPilotMode('MANUAL');
  st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  return st.stage;
})()`;
// Hold the scene still: no enemies, no shots, the hero parked.
const HOLD = (x, y, tz) => `(() => {
  const st = T.state, p = st.player;
  p.x = ${x}; p.y = ${y}; p.tz = ${tz};
  st.enemies.length = 0; st.enemyShots.length = 0;
  window.__pump(150);
  st.enemies.length = 0; st.enemyShots.length = 0;
  p.x = ${x}; p.y = ${y}; p.tz = ${tz};
  window.__pump(2);
  return st.stage + ' ' + Math.round(p.x) + ',' + Math.round(p.y);
})()`;
const SPOTS = `(async () => {
  const { terrainFor } = await import('/src/terrain.js');
  const st = T.state, TER = terrainFor(st.groundSeed || 0, st.stage);
  const out = { spawn: [st.player.x, st.player.y, 0] };
  if (TER) {
    let best = TER.plateaus[0];
    for (const q of TER.plateaus) if (q.upper || q.mark) { best = q; break; }
    const cx = best.x + best.w / 2 < 0 ? best.x + best.w : best.x;
    const cy = best.y + best.h / 2 < 0 ? best.y + best.h : best.y;
    out.terrain = [cx + Math.sign(-cx || 1) * 30 - Math.sign(-cx || 1) * Math.min(120, best.w * 0.4), cy + Math.sign(-cy || 1) * 60, 0];
    const m = TER.marks[0];
    if (m) out.mark = [m.x + 40, m.y + 50, m.tier];
  }
  const { CONFIG } = await import('/src/config.js');
  const R = CONFIG.GROUND.RIM;
  out.rim = [R - 30, -R * 0.35, 0];
  return out;
})()`;
const FRAME_MS = (n) => `(() => {
  const real = Performance.prototype.now.bind(performance);
  const rs = [];
  for (let i = 0; i < ${n}; i++) {
    const p = T.state.player; p.x += (i % 2 ? 3 : -3);
    const t0 = real(); T.renderer.render(T.state, T.state.cam); rs.push(real() - t0);
  }
  rs.sort((a, b) => a - b);
  return { med: +rs[rs.length >> 1].toFixed(3), p95: +rs[Math.floor(rs.length * 0.95)].toFixed(3) };
})()`;

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const perf = {};
for (const vp of VIEWPORTS) {
  if (vpOnly && vp.name !== vpOnly) continue;
  await withPage({ ...vp, startupScript: STARTUP, timeoutMs: 180000 }, async (page) => {
    await page.sleep(300);
    console.log(vp.name, 'boot', await page.evaluate(BOOT, true));
    for (const s of STAGES) {
      if (only && !only.includes(s.id)) continue;
      await page.evaluate(START(s.id));
      const spots = await page.evaluate(SPOTS, true);
      for (const [name, at] of Object.entries(spots)) {
        if (vp.name === 'phone' && name === 'rim') continue;
        console.log(vp.name, name, await page.evaluate(HOLD(at[0], at[1], at[2])));
        await page.shot(`${tag}-${s.id.toLowerCase()}-${name}-${vp.name}`);
      }
      if (vp.name === 'desktop') {
        await page.evaluate(HOLD(spots.spawn[0], spots.spawn[1], 0));
        perf[s.id] = await page.evaluate(FRAME_MS(120));
        console.log('frame ms', s.id, JSON.stringify(perf[s.id]));
      }
    }
  });
}
if (Object.keys(perf).length) fs.writeFileSync(path.join(outDir, tag + '-frame-ms.json'), JSON.stringify(perf, null, 1));
