// R6 LIGHT: pictures and numbers for the light layer, in a real Chrome.
//   HORDES_CHROME=<chrome.exe> node tools/capture_light.mjs <tag> <root> <outDir> <desk|phone> [parts]
// <root> is the tree to serve (the main tree for "before", the worktree for
// "after"; a tree without src/light.js simply draws no light). parts (comma
// list): calm, night, busy, close, levels, edge, time.
//   calm    each stage a second into a run (wave 1, day):  <tag>-calm-<STAGE>-<vp>.png
//   night   the same moment under wave 4's light (night):   <tag>-night-<STAGE>-<vp>.png
//   busy    the minute-10 crowd (capture_stagekeys's scene, wave 5): <tag>-busy-<STAGE>-<vp>.png
//   close   at zoom 3, night: a building's lights, a site brazier, the portal,
//           a volley of enemy shots and rich gems: <tag>-close-<STAGE>-<what>-<vp>.png
//   levels  the night busy scene on Void Reach and Snowfield at ON, LOW, OFF
//   edge    contrast at night: an enemy at the screen's edge, an enemy shot
//           and a gem against what is behind them, light ON and OFF, every stage
//   time    the minute-12 crowd on Void Reach and Whiteout, light ON and OFF:
//           render() alone 600 times, and 600 live frames (10 s), median and p95
// Writes <outDir>/<tag>-<vp>-light.json. Same seed every run (Math.random and
// the clock are replaced at startup), so before and after differ only by the tree.
import path from 'node:path';
import fs from 'node:fs';

const tag = process.argv[2] || 'shot';
const root = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
const vpName = process.argv[5] || 'desk';
const parts = (process.argv[6] || 'calm,night,busy').split(',');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const STAGES = process.env.HORDES_STAGES ? process.env.HORDES_STAGES.split(',')
  : ['VOID_REACH', 'CINDER_MAW', 'BLOOD_RUST', 'VERDANT_HOLLOW', 'ASHEN_WASTE', 'BONE_DESERT', 'SNOWFIELD', 'WHITEOUT'];

const LIT_DESIGNS = ['HOLLOW_LODGE', 'EMBER_HALL', 'DRIFT_CHAPEL', 'RUST_KEEP', 'VOID_ANNEX', 'CINDER_KILN', 'CLOCKWAY_STUB', 'GROVE_HALL', 'LOOKOUT',
  'STUMP_SHRINE', 'CINDER_GATE', 'BASALT_SPIRE', 'EMBER_CAIRN', 'BROKEN_PIER', 'SLAG_HEAP', 'SCORCH_WALL', 'FIRE_BOWL', 'BELFRY', 'PILGRIM_HALL',
  'SHRINE_POST', 'WAYMARK', 'FROST_STEP', 'PROFANE_GATE', 'IDOL_TOWER', 'RUST_WALL', 'SMALL_IDOL', 'OFFERING_SLAB', 'STACK_HALL', 'ASTRAL_STAIR',
  'BROKEN_COLUMN', 'RUNE_SLAB', 'TOME_PILE', 'VOID_BRAZIER', 'ARCH_FRAG', 'MACHINE_HOUSE', 'EMBER_STACK', 'SLAG_BLOCK', 'PIPE_RUN', 'COAL_HEAP',
  'FURNACE_DOOR', 'GEAR_RACK', 'GEAR_HALL', 'VANE_POST', 'CLOCK_FRAG', 'LAMP_ROW'];

const STARTUP = `
(() => {
  let s = 20261119;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let now = 1000; const q = [];
  performance.now = () => now;
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
  window.BLD = await import('/src/stage_buildings.js');
  try { window.LIGHT = await import('/src/light.js'); } catch (e) { window.LIGHT = null; }
  // The light level for a render (a tree without the layer ignores it).
  window.__lit = (lv) => { if (T.light) T.light.setLighting(['OFF', 'LOW', 'ON'][lv]); T.renderer.lightLevel = lv; };
  // Set the wave (and so its light): wave n began 'ago' sim seconds before now.
  window.__wave = (n, ago) => { const S = T.state; S.wave.num = n; S.wave.endsAt = S.time - ago + 120; };
  return !!window.LIGHT;
})()`;

const RUN = (id, n) => `(() => {
  const T = window.T;
  T.stages.select('${id}');
  T.startRun();
  for (let i = 0; i < ${n}; i++) {
    if (T.state.mode !== 'playing') { const c = document.querySelector('#overlay .card, #overlay button'); if (c) c.click(); }
    window.__pump(1);
  }
  T.state.player.hp = T.state.player.stats.maxHp;
  // The same place in every tree: a run's field seed and its sites come from
  // timers that do not replay exactly in a browser, so they are fixed here.
  const S = T.state; S.groundSeed = 4242; S.player.x = 40; S.player.y = 60; S.sites = []; S.portal = null;
  S.enemies.length = 0; S.enemyShots.length = 0; S.gems.length = 0;
  S.cam = { x: S.player.x - 240, y: S.player.y - 150 };
  window.__lit(2);
  T.renderer.render(T.state, T.state.cam);
  return { stage: T.state.stage, mode: T.state.mode };
})()`;

const RENDER = `(() => { window.T.renderer.render(window.T.state, window.T.state.cam); return window.T.renderer.lightOut || null; })()`;

// The minute-10 crowd (capture_stagekeys.mjs's scene) at sim time `time` in wave `wave`.
const BUSY_SCENE = (time, wave) => `(() => {
  const T = window.T, S = T.state, F = window.FEEL;
  let s = 99;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.time = ${time};
  window.__wave(${wave}, ${time} - (${wave} - 1) * 120);
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
  return { enemies: S.enemies.length, gems: S.gems.length, light: T.renderer.lightOut || null };
})()`;

// A close look at night (wave 4), zoom 3: the hero stands by `what`.
const CLOSE = (what) => `(() => {
  const T = window.T, S = T.state, p = S.player;
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  S.portal = null;
  window.__wave(4, 30);
  const keep = S.sites; S.sites = [];
  const what = '${what}';
  let at = null;
  if (what === 'building') {
    // The designs with a lit window or a fire (src/light.js designLights), as a
    // list so the main tree picks the same building.
    const LIT = new Set(${JSON.stringify(LIT_DESIGNS)});
    const f = window.BLD.buildingField(S.groundSeed || 1, S.stage);
    let best = null, bd = Infinity;
    for (const b of f) {
      if (!LIT.has(b.id)) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) at = { x: best.x + best.w + 46, y: best.y + best.h * 0.6, id: best.id };
  } else at = { x: p.x, y: p.y };
  if (at) { p.x = at.x; p.y = at.y; }
  S.cam = { x: p.x - 240, y: p.y - 150 };
  if (what === 'brazier') S.sites = [{ id: 1, kind: 'brazier', x: p.x + 46, y: p.y + 12, state: 'unused', cluster: 0, urn: false }];
  if (what === 'portal') S.portal = { x: p.x + 52, y: p.y, age: 2, entering: false };
  if (what === 'shots') for (let i = 0; i < 9; i++) {
    const a = -0.9 + i * 0.22;
    S.enemyShots.push({ x: p.x + 60 - i * 4 + Math.cos(a) * 8, y: p.y + Math.sin(a) * 30, vx: -60, vy: 0, damage: 5, age: 0.2, kind: i % 3 ? 'spit' : 'bolt', src: {} });
  }
  if (what === 'gems') for (let i = 0; i < 5; i++) S.gems.push({ x: p.x + 30 + i * 10, y: p.y + (i % 2) * 10 - 4, xp: 60 + i * 40, n: 6, age: 0.3 * i });
  S.zoom = 2;
  window.__pump(1);
  S.enemies.length = 0;
  const r = window.T.renderer; r.render(S, S.cam);
  S.sites = keep;
  return { at, light: r.lightOut || null, zoom: S.zoomScale };
})()`;

// Contrast at night: the thing against the very pixels behind it (a render
// without it), light ON and OFF. kind: enemy (at the left edge of the view),
// shot, gem. Reports the median WCAG ratio of the pixels the thing changed,
// and how many device pixels it changed (a halo makes a shot bigger).
const EDGE = (kind, lv) => `(() => {
  const T = window.T, S = T.state, p = S.player;
  window.__lit(${lv});
  S.zoom = 1;
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  S.portal = null;
  const F = window.FEEL.feelOf(S); F.nums.length = 0; F.puffs.length = 0; F.sparks.length = 0; F.bursts.length = 0;
  window.__wave(4, 30);
  window.__pump(1);
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  const cv = T.renderer.canvas, g = cv.getContext('2d');
  const view = T.renderer.worldView;
  const vx = '${kind}' === 'enemy' ? view.x0 + 14 : '${kind}' === 'near' ? 240 + 26 : 240 + 70, vy = '${kind}' === 'enemy' ? 150 + 40 : '${kind}' === 'near' ? 150 + 8 : 150 + 30;
  const wx = S.cam.x + vx, wy = S.cam.y + vy;
  const Z = view.zoom, sc = cv.width / 480;
  const dx = Math.round((240 + (vx - 240) * Z) * sc), dy = Math.round((150 + (vy - 150) * Z) * sc);
  const R = Math.round(28 * Z * sc);
  const x0 = Math.max(0, dx - R), y0 = Math.max(0, dy - R), w = Math.min(cv.width - x0, R * 2), h = Math.min(cv.height - y0, R * 2);
  T.renderer.render(S, S.cam);
  const bg = g.getImageData(x0, y0, w, h).data;
  if ('${kind}' === 'enemy' || '${kind}' === 'near') S.enemies.push(window.makeTypedEnemy('CHASER', wx, wy, S.time, {}));
  if ('${kind}' === 'shot') S.enemyShots.push({ x: wx, y: wy, vx: -60, vy: 0, damage: 5, age: 0.2, kind: 'spit', src: {} });
  if ('${kind}' === 'gem') S.gems.push({ x: wx, y: wy, xp: 3, age: 0.3 });
  T.renderer.render(S, S.cam);
  const fg = g.getImageData(x0, y0, w, h).data;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  const rs = []; let changed = 0, strong = 0, floorL = 0, nf = 0;
  for (let i = 0; i < fg.length; i += 4) {
    const dd = Math.abs(fg[i] - bg[i]) + Math.abs(fg[i + 1] - bg[i + 1]) + Math.abs(fg[i + 2] - bg[i + 2]);
    const a = L(fg, i), b = L(bg, i);
    if (dd > 60) strong++;
    if (dd > 24) { changed++; rs.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)); }
    else { floorL += b; nf++; }
  }
  rs.sort((a, b) => a - b);
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  return { kind: '${kind}', lv: ${lv}, med: rs.length ? +rs[rs.length >> 1].toFixed(2) : 0, p90: rs.length ? +rs[Math.floor(rs.length * 0.9)].toFixed(2) : 0, px: changed, strong, floorL: nf ? +(floorL / nf).toFixed(4) : 0, a: T.renderer.lightOut ? T.renderer.lightOut.a : 0 };
})()`;

const RENDER_ONLY = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const rs = [];
  const g = T.renderer.canvas.getContext('2d');
  for (let i = 0; i < ${n}; i++) { const t0 = real(); T.renderer.render(T.state, T.state.cam); g.getImageData(0, 0, 1, 1); rs.push(real() - t0); }
  rs.sort((a, b) => a - b);
  return { med: +rs[rs.length >> 1].toFixed(3), p95: +rs[Math.floor(rs.length * 0.95)].toFixed(3) };
})()`;
const LIVE = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const ts = []; let skipped = 0;
  const g = T.renderer.canvas.getContext('2d');
  for (let i = 0; i < ${n}; i++) {
    T.state.player.hp = T.state.player.stats.maxHp;
    if (T.state.mode !== 'playing') {
      const c = document.querySelector('#overlay .card, #overlay button');
      if (c) c.click();
      window.__pump(1); skipped++; i--; if (skipped > 600) break; continue;
    }
    const t0 = real(); window.__pump(1); g.getImageData(0, 0, 1, 1); ts.push(real() - t0);
  }
  ts.sort((a, b) => a - b);
  return { med: +ts[ts.length >> 1].toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3), n: ts.length, level: T.renderer.lightLevel };
})()`;

const VPS = {
  desk: { w: 1280, h: 720, dpr: 1, mobile: false },
  phone: { w: 390, h: 844, dpr: 2, mobile: true },
};
const vp = VPS[vpName];
const out = { tag, root, vp: vpName };
await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 175000 }, async (page) => {
  await page.sleep(400);
  out.hasLight = await page.evaluate(BOOT, true);
  for (const id of STAGES) {
    if (parts.includes('calm') || parts.includes('night')) {
      await page.evaluate(RUN(id, 60));
      if (parts.includes('calm')) await page.shot(`${tag}-calm-${id}-${vpName}`);
      if (parts.includes('night')) {
        await page.evaluate(`window.__wave(4, 30)`);
        await page.evaluate(RENDER);
        await page.shot(`${tag}-night-${id}-${vpName}`);
      }
    }
    if (parts.includes('busy')) {
      await page.evaluate(RUN(id, 30));
      await page.evaluate(BUSY_SCENE(600, 5));
      await page.shot(`${tag}-busy-${id}-${vpName}`);
    }
    if (parts.includes('close')) {
      await page.evaluate(RUN(id, 30));
      out.close = out.close || {};
      for (const w of ['building', 'brazier', 'portal', 'shots', 'gems']) {
        out.close[id + ':' + w] = await page.evaluate(CLOSE(w));
        await page.shot(`${tag}-close-${id}-${w}-${vpName}`);
      }
      await page.evaluate(`window.T.state.zoom = 1`);
    }
    if (parts.includes('edge')) {
      await page.evaluate(RUN(id, 30));
      out.edge = out.edge || {};
      for (const k of ['enemy', 'near', 'shot', 'gem']) {
        out.edge[id + ':' + k] = { on: await page.evaluate(EDGE(k, 2)), off: await page.evaluate(EDGE(k, 0)) };
      }
    }
  }
  if (parts.includes('movies')) {
    // The death movie's freeze at night on the Void Reach: the frozen frame is
    // the world as it was drawn, light and all.
    out.movies = {};
    await page.evaluate(RUN('VOID_REACH', 30));
    out.movies.death = await page.evaluate(`(() => {
      const T = window.T, S = T.state;
      window.__wave(4, 30);
      S.player.hp = 0.01; S.player.invuln = 0; S.player.stats.secondWind = 0;
      for (let k = 0; k < 4; k++) S.enemies.push(window.makeTypedEnemy('BRUTE', S.player.x + k, S.player.y, S.time, {}));
      for (let i = 0; i < 30 && S.mode === 'playing'; i++) window.__pump(1);
      const m0 = S.mode;
      window.__pump(36);
      return { m0, mode: S.mode };
    })()`);
    await page.shot(`${tag}-movie-death-${vpName}`);
  }
  if (parts.includes('levels')) {
    for (const id of ['VOID_REACH', 'SNOWFIELD']) {
      await page.evaluate(RUN(id, 30));
      for (const lv of [2, 1, 0]) {
        await page.evaluate(`window.__lit(${lv})`);
        await page.evaluate(BUSY_SCENE(600, 4));
        await page.shot(`${tag}-level${lv}-${id}-${vpName}`);
      }
    }
  }
  if (parts.includes('bench')) {
    // Where the light's time goes: full-screen blends of a small canvas, and
    // the parts of compose.
    await page.evaluate(RUN('VOID_REACH', 30));
    await page.evaluate(`window.__lit(2)`);
    await page.evaluate(BUSY_SCENE(720, 6));
    out.bench = await page.evaluate(`(() => {
      const T = window.T, r = T.renderer, g = r.canvas.getContext('2d');
      const real = Performance.prototype.now.bind(performance);
      const small = document.createElement('canvas'); small.width = 128; small.height = 80;
      const sg = small.getContext('2d'); sg.fillStyle = 'rgba(0,0,40,0.5)'; sg.fillRect(0, 0, 128, 80);
      const time = (f, n = 60) => { f(); g.getImageData(0, 0, 1, 1); const t0 = real(); for (let i = 0; i < n; i++) f(); g.getImageData(0, 0, 1, 1); return +((real() - t0) / n).toFixed(3); };
      const res = {};
      res.blitSmooth = time(() => { g.save(); g.imageSmoothingEnabled = true; g.drawImage(small, 0, 0, 480, 300); g.restore(); });
      res.blitNearest = time(() => { g.save(); g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, 480, 300); g.restore(); });
      res.blitLighter = time(() => { g.save(); g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'lighter'; g.drawImage(small, 0, 0, 480, 300); g.restore(); });
      res.fillRect = time(() => { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 0, 480, 300); });
      const L = r.light, orig = L.compose.bind(L);
      res.render2 = time(() => r.render(T.state, T.state.cam), 30);
      L.compose = () => ({});
      res.renderNoCompose = time(() => r.render(T.state, T.state.cam), 30);
      L.compose = orig;
      const ctx = r.canvas.getContext('2d'); L.clock = () => { ctx.getImageData(0, 0, 1, 1); return real(); };
      const pr = [];
      for (let i = 0; i < 20; i++) { r.render(T.state, T.state.cam); pr.push(L.prof); }
      L.clock = null;
      const med = (k) => { const v = pr.map((q) => q[k]).sort((x, y) => x - y); return +v[v.length >> 1].toFixed(3); };
      res.prof = { gather: med('gather'), dark: med('dark'), glow: med('glow'), holes: r.lightOut.holes, glows: r.lightOut.glows };
      r.lightLevel = 0;
      res.render0 = time(() => r.render(T.state, T.state.cam), 30);
      r.lightLevel = 2;
      res.out = r.lightOut;
      res.canvas = [r.canvas.width, r.canvas.height];
      return res;
    })()`);
  }
  if (parts.includes('time')) {
    out.time = {};
    for (const id of ['VOID_REACH', 'WHITEOUT']) {
      for (const lv of [2, 0]) {
        await page.evaluate(RUN(id, 30));
        await page.evaluate(`window.__lit(${lv})`);
        await page.evaluate(BUSY_SCENE(720, 6));
        await page.evaluate(RENDER_ONLY(30));
        const render = await page.evaluate(RENDER_ONLY(600));
        await page.evaluate(BUSY_SCENE(720, 6));
        const live = await page.evaluate(LIVE(600));
        out.time[id + ':' + ['OFF', 'LOW', 'ON'][lv]] = { render, live };
      }
    }
  }
  out.errors = page.errors.slice(0, 8);
});
fs.writeFileSync(path.join(outDir, `${tag}-${vpName}-light.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ errors: out.errors, edge: out.edge, time: out.time }, null, 1));
