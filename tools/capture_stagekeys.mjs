// R6 stage value keys: pictures and numbers for every stage, in a real Chrome.
//   HORDES_CHROME=<chrome.exe> node tools/capture_stagekeys.mjs <tag> <root> <outDir> <desk|phone> [parts]
// <root> is the tree to serve (the main tree for "before", the worktree for
// "after"). parts (comma list, default all): calm, busy, time, ground, road.
//   calm    each stage a second into a run: <tag>-calm-<STAGE>-<vp>.png
//   busy    a minute-10 crowd (the scene of capture_r3_readable.mjs, at 10:00)
//           on the two lightest and the two darkest stages: <tag>-busy-<STAGE>-<vp>.png
//   time    the busy scene per stage: render() alone (and the wait for its
//           pixels), 120 times, median and p95,
//           and 90 live frames (sim + render), median and p95
//   ground  the ground as the chunk cache paints it (1024 x 1024 world px, wave 1
//           light): mean colour, mean L*, the 10th and 90th percentile L*
//   road    the road shot of each stage at 0.9 s: <tag>-road-<STAGE>.png
// Writes <outDir>/<tag>-<vp>-measure.json. Same seed every run (Math.random and
// the clock are replaced at startup), so before and after differ only by the tree.
// Each run reseeds Math.random just before it starts: how many draws the boot
// made (it varies with load timing) must not move the ground and the buildings.
import path from 'node:path';
import fs from 'node:fs';

const tag = process.argv[2] || 'shot';
const root = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
const vpName = process.argv[5] || 'desk';
const parts = (process.argv[6] || 'calm,busy,time,ground,road').split(',');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const STAGES = ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD', 'BLOOD_RUST', 'BONE_DESERT', 'VOID_REACH', 'CINDER_MAW', 'WHITEOUT'];
const BUSY = process.env.HORDES_BUSY ? process.env.HORDES_BUSY.split(',') : ['WHITEOUT', 'SNOWFIELD', 'VOID_REACH', 'CINDER_MAW'];

const STARTUP = `
(() => {
  let s = 20261119;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  window.__reseed = (k) => { s = k >>> 0; };
  let now = 1000; const q = [];
  performance.now = () => now;
  // The wall clock follows the same fake clock: the idle timer reads it, and a
  // tree that paints slower must not reach it at a different frame.
  Date.now = () => 1.7e12 + now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__pump = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = q.shift(); if (!cb) return i; cb(now); } return n; };
  for (const k of ['stage1','hud','pilot','focus','stance','move','skills','radar','map','zoom','draft','shop','chest','portal','arch','shrine','potion','elite','boss']) {
    try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {}
  }
})();`;

const BOOT = `(async () => {
  const m = await import('/src/main.js');
  const T = m.__TEST;
  window.T = T;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5);
  window.FEEL = await import('/src/fx/feel.js');
  const { makeTypedEnemy } = await import('/src/enemy_types.js');
  window.makeTypedEnemy = makeTypedEnemy;
  return true;
})()`;

// A fresh run on a stage, then n frames.
const RUN = (id, n) => `(() => {
  const T = window.T;
  T.stages.select('${id}');
  window.__reseed(20261119);
  T.startRun();
  for (let i = 0; i < ${n}; i++) {
    if (T.state.mode !== 'playing') { const c = document.querySelector('#overlay .card, #overlay button'); if (c) c.click(); }
    window.__pump(1);
  }
  T.state.player.hp = T.state.player.stats.maxHp;
  T.renderer.render(T.state, T.state.cam);
  return { stage: T.state.stage, mode: T.state.mode, enemies: T.state.enemies.length, weather: T.state.weather && T.state.weather.def && T.state.weather.def.id };
})()`;

// The minute-10 crowd (capture_r3_readable.mjs's scene, at 10:00).
const BUSY_SCENE = `(() => {
  const T = window.T, S = T.state, F = window.FEEL;
  let s = 99;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.time = 600;
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  if (S.effects) S.effects.length = 0;
  const p = S.player;
  p.hp = p.stats.maxHp; p.invuln = 0;
  const ids = ['CHASER', 'CHASER', 'SWARMER', 'SWARMER', 'BRUTE', 'SPITTER', 'DASHER', 'TICK', 'WARLOCK', 'CHASER'];
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = i < 16 ? 9 + r() * 14 : 26 + r() * 190;
    const e = window.makeTypedEnemy(ids[i % ids.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, S.time, { elite: i % 97 === 0 });
    e.age = r(); e.hp = e.maxHp = 400 + r() * 900;
    S.enemies.push(e);
  }
  for (let i = 0; i < 360; i++) {
    const a = r() * Math.PI * 2, d = 18 + r() * 200;
    const k = r();
    S.gems.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, xp: k < 0.7 ? 1 + Math.floor(r() * 4) : k < 0.93 ? 8 : 30, age: r() });
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 30 + r() * 120;
    S.enemyShots.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60,
      damage: 5, age: 0.2, kind: i % 3 ? 'spit' : 'bolt', src: {} });
  }
  const f = F.feelOf(S);
  f.nums.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0; f.hurtT = 0;
  f.player = p; f.time = S.time;
  if ('hitAvg' in f) f.hitAvg = 120;
  for (let i = 0; i < 140; i++) {
    const e = S.enemies[i < 24 ? i % 16 : Math.floor(r() * 120)];
    const crit = r() < 0.1;
    const n = F.addNumber(f, e.x, e.y - 8, 40 + r() * 260 * (crit ? 3 : 1), crit ? 'crit' : 'hit', null);
    if (n) { n.age = r() * 0.5; if (r() < 0.25) n.merged = 3 + Math.floor(r() * 4); if (r() < 0.1) n.kill = true; }
  }
  T.renderer.render(S, S.cam);
  return { enemies: S.enemies.length, gems: S.gems.length };
})()`;

const RENDER_ONLY = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const rs = [];
  const g = T.renderer.canvas.getContext('2d');
  // getImageData of one pixel waits for the frame's drawing to finish.
  for (let i = 0; i < ${n}; i++) { const t0 = real(); T.renderer.render(T.state, T.state.cam); g.getImageData(0, 0, 1, 1); rs.push(real() - t0); }
  rs.sort((a, b) => a - b);
  return { med: +rs[rs.length >> 1].toFixed(3), p95: +rs[Math.floor(rs.length * 0.95)].toFixed(3) };
})()`;

const LIVE = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const ts = []; let skipped = 0;
  for (let i = 0; i < ${n}; i++) {
    T.state.player.hp = T.state.player.stats.maxHp;
    if (T.state.mode !== 'playing') {
      const c = document.querySelector('#overlay .card, #overlay button');
      if (c) c.click();
      window.__pump(1); skipped++; i--; if (skipped > 600) break; continue;
    }
    const t0 = real(); window.__pump(1); ts.push(real() - t0);
  }
  ts.sort((a, b) => a - b);
  return { med: +ts[ts.length >> 1].toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3), n: ts.length };
})()`;

// The ground as the chunk cache paints it, measured in CIE L*a*b*.
const GROUND = `(async () => {
  const WG = await import('/src/world_ground.js');
  const R = await import('/src/render.js');
  const ids = ${JSON.stringify(STAGES)};
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lab = (r, g, b) => {
    const R1 = lin(r), G1 = lin(g), B1 = lin(b);
    const X = (0.4124 * R1 + 0.3576 * G1 + 0.1805 * B1) / 0.95047, Y = 0.2126 * R1 + 0.7152 * G1 + 0.0722 * B1, Z = (0.0193 * R1 + 0.1192 * G1 + 0.9505 * B1) / 1.08883;
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const out = {};
  const S = 1024;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  for (const id of ids) {
    const pal = WG.stageGroundPalette(id, R.groundTheme(1));
    g.fillStyle = pal.base; g.fillRect(0, 0, S, S);
    // Chunk build cost: a cold cache, 3 rounds of the same 1024 px square
    // (16 chunks plus edges), the median round, per chunk built.
    const real = Performance.prototype.now.bind(performance);
    const rounds = [];
    let built = 0;
    for (let k = 0; k < 3; k++) {
      WG.WORLD_GROUND_TEST.clear();
      const b0 = WG.groundChunkStats().built;
      const t0 = real();
      WG.drawGroundChunks(g, 4242 + k, { x: -S / 2, y: -S / 2 }, S, S, pal, id, null);
      g.getImageData(0, 0, 1, 1);
      rounds.push(real() - t0);
      built = WG.groundChunkStats().built - b0;
    }
    rounds.sort((a, b) => a - b);
    const chunkMs = +(rounds[1] / built).toFixed(2);
    WG.WORLD_GROUND_TEST.clear();
    WG.drawGroundChunks(g, 4242, { x: -S / 2, y: -S / 2 }, S, S, pal, id, null);
    const d = g.getImageData(0, 0, S, S).data;
    let sr = 0, sg = 0, sb = 0, sL = 0, sA = 0, sB = 0, n = 0;
    const hist = new Array(101).fill(0);
    for (let i = 0; i < d.length; i += 16) {   // every 4th pixel
      const L = lab(d[i], d[i + 1], d[i + 2]);
      sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sL += L[0]; sA += L[1]; sB += L[2]; n++;
      hist[Math.max(0, Math.min(100, Math.round(L[0])))]++;
    }
    const pct = (q) => { let c = 0; for (let k = 0; k <= 100; k++) { c += hist[k]; if (c >= q * n) return k; } return 100; };
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    out[id] = { mean: '#' + hex(sr) + hex(sg) + hex(sb), L: +(sL / n).toFixed(1), a: +(sA / n).toFixed(1), b: +(sB / n).toFixed(1), L10: pct(0.1), L90: pct(0.9), base: pal.base, chunkMs };
  }
  return out;
})()`;

const ROAD = (id) => `(async () => {
  const RS = await import('/src/road_shot.js');
  const { stageOf } = await import('/src/stages.js');
  const cv = document.createElement('canvas'); cv.width = 480; cv.height = 300;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const scene = RS.sceneFor({ seed: 77, stage: '${id}', character: 'KNIGHT' });
  RS.render(g, 0.9, { scene, name: stageOf('${id}').name });
  return cv.toDataURL('image/png');
})()`;

const VPS = {
  desk: { w: 1280, h: 720, dpr: 1, mobile: false },
  phone: { w: 390, h: 844, dpr: 2, mobile: true },
};
const vp = VPS[vpName];
const out = { tag, root, vp: vpName };
await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 170000 }, async (page) => {
  await page.sleep(400);
  await page.evaluate(BOOT, true);
  if (parts.includes('ground')) out.ground = await page.evaluate(GROUND, true);
  if (parts.includes('road')) {
    for (const id of STAGES) {
      const url = await page.evaluate(ROAD(id), true);
      fs.writeFileSync(path.join(outDir, `${tag}-road-${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  if (parts.includes('calm')) {
    out.calm = {};
    for (const id of STAGES) {
      out.calm[id] = await page.evaluate(RUN(id, 60));
      await page.shot(`${tag}-calm-${id}-${vpName}`);
    }
  }
  if (parts.includes('busy') || parts.includes('time')) {
    out.time = {};
    for (const id of STAGES) {
      const want = parts.includes('time') || BUSY.includes(id);
      if (!want) continue;
      await page.evaluate(RUN(id, 30));
      await page.evaluate(BUSY_SCENE);
      if (parts.includes('busy') && BUSY.includes(id)) await page.shot(`${tag}-busy-${id}-${vpName}`);
      if (parts.includes('time')) {
        await page.evaluate(RENDER_ONLY(20));
        const render = await page.evaluate(RENDER_ONLY(120));
        await page.evaluate(BUSY_SCENE);
        const live = await page.evaluate(LIVE(90));
        out.time[id] = { render, live };
      }
    }
  }
  out.errors = page.errors.slice(0, 8);
});
fs.writeFileSync(path.join(outDir, `${tag}-${vpName}-measure.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ errors: out.errors, ground: out.ground, time: out.time }, null, 1));
