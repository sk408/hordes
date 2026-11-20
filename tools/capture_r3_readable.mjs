// R3 "you can see the fight": a minute-12 crowd scene in a real Chrome, for the
// before/after sheets and the numbers Steve asked for.
//   HORDES_CHROME=<chrome.exe> node tools/capture_r3_readable.mjs <tag> <root> <outDir>
// <root> is the tree to serve (the main tree for "before", this worktree for
// "after"). Writes <outDir>/<tag>-*.png and <outDir>/<tag>-measure.json.
//
// The scene: run clock 12:00, 260 enemies round the hero, 360 gems, 140 damage
// numbers (one in ten a crit, some kills), a few enemy shots. Everything is
// placed by a private seeded generator, so the before and after scenes are the
// same scene. Measured on the still scene by painting it again with one layer
// removed and counting the canvas pixels that change:
//   numbers share = pixels that change when the numbers are removed
//   gems share    = pixels that change when the gems are removed
//   ink           = the same, weighted by how much each pixel changes (a faded
//                   gem counts less than a solid one)
//   hero covered  = hero pixels (those that change when the hero is moved away
//                   on an otherwise empty field) that change when the numbers
//                   or the gems are removed
// Frame time: the median render() of the still scene, and the median full frame
// (sim + render) over 90 frames of the live scene.
import path from 'node:path';
import fs from 'node:fs';

const tag = process.argv[2] || 'shot';
const root = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const STARTUP = `
(() => {
  let s = 20261118;
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
  const T = m.__TEST;
  window.T = T;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5);
  T.startRun();
  window.__pump(3);
  window.FEEL = await import('/src/fx/feel.js');
  const { makeTypedEnemy } = await import('/src/enemy_types.js');
  window.makeTypedEnemy = makeTypedEnemy;
  return T.state.mode;
})()`;

// The minute-12 crowd. Same generator seed every time.
const STAGE = `(() => {
  const T = window.T, S = T.state, F = window.FEEL;
  let s = 99;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.time = 720;
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  if (S.effects) S.effects.length = 0;
  S.weather = null;
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
  // Damage numbers: hits on enemies near the hero, a hurt number on the hero.
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
  F.addNumber(f, p.x, p.y - 12, 23, 'hurt', p);
  return { enemies: S.enemies.length, gems: S.gems.length, nums: f.nums.length, mode: S.mode };
})()`;

// Paint the still scene (no sim step) and return the canvas pixels.
const MEASURE = `(() => {
  const T = window.T, S = T.state, R = T.renderer, F = window.FEEL;
  const cv = R.canvas, g = cv.getContext('2d');
  const paint = () => { R.render(S, S.cam); return g.getImageData(0, 0, cv.width, cv.height).data; };
  const f = F.feelOf(S);
  const full = paint();
  const nums = f.nums.slice(); f.nums.length = 0;
  const noNums = paint();
  f.nums.push(...nums);
  const gems = S.gems.slice(); S.gems.length = 0;
  const noGems = paint();
  S.gems.push(...gems);
  // Hero pixels: an empty field with and without the hero.
  const keep = { en: S.enemies.slice(), sh: S.enemyShots.slice(), nums: f.nums.slice(), gems: S.gems.slice() };
  S.enemies.length = 0; S.enemyShots.length = 0; f.nums.length = 0; S.gems.length = 0;
  const bare = paint();
  const p = S.player, px = p.x, py = p.y;
  p.x += 3000; p.y += 3000;
  const noHero = paint();
  p.x = px; p.y = py;
  S.enemies.push(...keep.en); S.enemyShots.push(...keep.sh); f.nums.push(...keep.nums); S.gems.push(...keep.gems);
  const W = cv.width, H = cv.height;
  const d = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  let numPx = 0, gemPx = 0, numInk = 0, gemInk = 0, heroPx = 0, heroByNum = 0, heroByGem = 0;
  // Hero pixels: strong change, inside the hero's sprite box (world px +-9 round the hero).
  const Z = R._zoom || 1, k = W / 480;
  const hx = (240 + (p.x - S.cam.x - 240) * Z) * k, hy = (150 + (p.y - S.cam.y - 150) * Z) * k, hr = 9 * Z * k;
  for (let i = 0; i < W * H * 4; i += 4) {
    const x = (i >> 2) % W, y = Math.floor((i >> 2) / W);
    const inHero = Math.abs(x - hx) <= hr && Math.abs(y - hy) <= hr;
    const a = d(full, noNums, i) > 24, b = d(full, noGems, i) > 24;
    numInk += d(full, noNums, i) / 765; gemInk += d(full, noGems, i) / 765;
    if (a) numPx++;
    if (b) gemPx++;
    if (inHero && d(bare, noHero, i) > 150) {
      heroPx++;
      if (a) heroByNum++;
      if (b) heroByGem++;
    }
  }
  paint();
  return { W, H, numbersShare: numPx / (W * H), gemsShare: gemPx / (W * H), numbersInk: numInk / (W * H), gemsInk: gemInk / (W * H), heroPx, heroByNum, heroByGem,
    nums: f.nums.length, gems: S.gems.length };
})()`;

const RENDER_ONLY = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const rs = [];
  for (let i = 0; i < ${n}; i++) { const t0 = real(); T.renderer.render(T.state, T.state.cam); rs.push(real() - t0); }
  rs.sort((a, b) => a - b);
  return { renderMed: rs[rs.length >> 1], renderP90: rs[Math.floor(rs.length * 0.9)] };
})()`;

const LIVE = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const ts = [];
  let skipped = 0;
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
  return { frameMed: ts[ts.length >> 1], frameP90: ts[Math.floor(ts.length * 0.9)], measured: ts.length, skipped, mode: T.state.mode,
    nums: window.FEEL.feelOf(T.state).nums.length, enemies: T.state.enemies.length };
})()`;

const VIEWPORTS = [
  { name: 'desk', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 390, h: 844, dpr: 2, mobile: true },
];
const CHARS = ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN'];

const out = {};
for (const vp of VIEWPORTS) {
  await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 90000 }, async (page) => {
    await page.sleep(400);
    const o = out[vp.name] = {};
    o.boot = await page.evaluate(BOOT, true);
    const hasModes = await page.evaluate(`!!(window.FEEL && window.FEEL.setNumbersMode)`);
    const modes = hasModes ? ['all', 'big', 'off'] : ['all'];
    o.stage = await page.evaluate(STAGE);
    for (const m of modes) {
      if (hasModes) await page.evaluate(`window.FEEL.setNumbersMode('${m}')`);
      o['measure_' + m] = await page.evaluate(MEASURE);
      await page.shot(`${tag}-m12-${m}-${vp.name}`);
    }
    if (hasModes) await page.evaluate(`window.FEEL.setNumbersMode('all')`);
    for (const c of CHARS) {
      await page.evaluate(`(() => { const S = window.T.state; S.character = Object.assign({}, S.character || {}, { id: '${c}' }); window.T.renderer.render(S, S.cam); })()`);
      await page.shot(`${tag}-hero-${c}-${vp.name}`);
    }
    await page.evaluate(`(() => { const S = window.T.state; S.character = Object.assign({}, S.character || {}, { id: 'KNIGHT' }); })()`);
    await page.evaluate(RENDER_ONLY(20));   // warm the caches
    o.renderStill = await page.evaluate(RENDER_ONLY(120));
    await page.evaluate(STAGE);
    o.live = await page.evaluate(LIVE(90));
    o.errors = page.errors.slice(0, 5);
  });
}
fs.writeFileSync(path.join(outDir, `${tag}-measure.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
