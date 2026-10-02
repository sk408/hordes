// M2 "readability and feel" capture: same-seed in-run screenshots in a real
// Chrome, for before/after comparison.
//   HORDES_CHROME=<chrome.exe> node tools/capture_m2_feel.mjs <tag> [outDir]
// Writes <outDir>/<tag>-<scene>-<viewport>.png (default docs/art/m2-feel).
// Scenes: `run` = 40 simulated seconds of the autopilot's own run;
// `roster` = one of every enemy type, elites, rarity tiers and a boss placed
// round the player; `horde` = 300 enemies; plus one per ground theme.
// The page's clock, rAF and Math.random are replaced before any game script
// runs, so a tag is reproducible frame for frame.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] || 'shot';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'docs/art/m2-feel'));
fs.mkdirSync(outDir, { recursive: true });
// browser.mjs reads the shot dir at import time.
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

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
  const T = m.__TEST;
  window.T = T;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5);
  T.startRun();
  window.__pump(2);
  return T.state.mode;
})()`;

// Keep the sim in 'playing' while pumping: auto-resolve drafts and survive.
const ADVANCE = (frames) => `(() => {
  const T = window.T; let stuck = 0;
  for (let i = 0; i < ${frames}; i++) {
    window.__pump(1);
    T.state.player.hp = T.state.player.stats.maxHp;
    if (T.state.mode !== 'playing') {
      stuck++;
      const c = document.querySelector('#overlay .card, #overlay button');
      if (stuck % 30 === 0 && c) c.click();
    }
  }
  return { mode: T.state.mode, t: T.state.time, n: T.state.enemies.length, lvl: T.state.player.level };
})()`;

const ROSTER = `(async () => {
  const T = window.T, S = T.state;
  const { makeTypedEnemy, ENEMY_TYPES } = await import('/src/enemy_types.js');
  const { BOSSES } = await import('/src/bosses.js');
  S.enemies.length = 0; S.enemyShots.length = 0; S.projectiles.length = 0;
  const p = S.player;
  const ids = Object.keys(ENEMY_TYPES);
  ids.forEach((id, i) => {
    const a = (i / ids.length) * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const e = makeTypedEnemy(id, p.x + Math.cos(a) * (62 + k * 16), p.y + Math.sin(a) * (44 + k * 12), S.time, {});
      e.age = k * 0.2; e.speed = 0; e.hp = e.maxHp = 1e9;
      if (k === 1) { e.hp = e.maxHp * 0.6; }
      if (k === 2 && i % 3 === 0) e.flash = 1;
      S.enemies.push(e);
    }
  });
  const el = makeTypedEnemy('BRUTE', p.x - 118, p.y - 60, S.time, { elite: true }); el.speed = 0; el.hp = el.maxHp = 1e9; S.enemies.push(el);
  const el2 = makeTypedEnemy('CHASER', p.x - 118, p.y + 50, S.time, { elite: true }); el2.speed = 0; el2.eliteMod = 'VAMPIRIC'; el2.hp = el2.maxHp = 1e9; S.enemies.push(el2);
  const r1 = makeTypedEnemy('DASHER', p.x + 118, p.y + 58, S.time, {}); r1.speed = 0; r1.rarity = 'RARE'; r1.hp = r1.maxHp = 1e9; S.enemies.push(r1);
  const r2 = makeTypedEnemy('SPITTER', p.x + 136, p.y + 20, S.time, {}); r2.speed = 0; r2.rarity = 'MYTHIC'; r2.hp = r2.maxHp = 1e9; S.enemies.push(r2);
  const bd = Object.values(BOSSES)[0];
  const b = makeTypedEnemy('BRUTE', p.x + 120, p.y - 62, S.time, {});
  b.boss = true; b.bossSprite = bd && bd.sprite; b.w = 24; b.h = 24; b.speed = 0; b.hp = 6e8; b.maxHp = 1e9; b.telegraph = true;
  S.enemies.push(b);
  for (let i = 0; i < 14; i++) S.gems.push({ x: p.x - 40 + i * 7, y: p.y + 92, xp: 1, age: 0 });
  S.drops.push({ x: p.x - 60, y: p.y + 104, kind: 'hp', age: 0 }, { x: p.x - 48, y: p.y + 104, kind: 'mana', age: 0 });
  S.chests.push({ x: p.x + 70, y: p.y + 100, age: 0 });
  return S.enemies.length;
})()`;

const HORDE = (n) => `(async () => {
  const T = window.T, S = T.state;
  const { makeTypedEnemy } = await import('/src/enemy_types.js');
  S.enemies.length = 0;
  const p = S.player; let s = 7;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const ids = ['CHASER', 'CHASER', 'CHASER', 'SWARMER', 'SWARMER', 'BRUTE', 'SPITTER', 'DASHER', 'TICK', 'WARLOCK'];
  for (let i = 0; i < ${n}; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 190;
    const e = makeTypedEnemy(ids[i % ids.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, S.time, { elite: i % 97 === 0 });
    e.age = r(); e.hp = e.maxHp = 60 + r() * 200;
    S.enemies.push(e);
  }
  return S.enemies.length;
})()`;

const THEME = (w) => `(() => { const S = window.T.state; S.wave.num = ${w}; return S.wave.num; })()`;

// Median wall-clock cost of one frame() over n frames (sim + render).
const FRAME_MS = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const ts = [];
  for (let i = 0; i < ${n}; i++) {
    T.state.player.hp = T.state.player.stats.maxHp;
    const t0 = real(); window.__pump(1); ts.push(real() - t0);
  }
  ts.sort((a, b) => a - b);
  return { med: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * 0.95)], n: T.state.enemies.length };
})()`;

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 3, mobile: true },
];

const perf = {};
for (const vp of VIEWPORTS) {
  await withPage({ ...vp, startupScript: STARTUP, timeoutMs: 60000 }, async (page) => {
    await page.sleep(400);
    console.log(vp.name, 'boot:', await page.evaluate(BOOT, true));
    console.log(vp.name, 'run:', JSON.stringify(await page.evaluate(ADVANCE(60 * 40))));
    await page.shot(`${tag}-run-${vp.name}`);
    await page.evaluate(ROSTER, true);
    await page.evaluate(`window.__pump(8)`);
    await page.shot(`${tag}-roster-${vp.name}`);
    if (vp.name === 'desktop') {
      for (let w = 2; w <= 6; w++) {
        await page.evaluate(THEME(w));
        await page.evaluate(ROSTER, true);
        await page.evaluate(`window.__pump(8)`);
        await page.shot(`${tag}-roster-theme${w}-${vp.name}`);
      }
      await page.evaluate(THEME(1));
    }
    await page.evaluate(HORDE(300), true);
    await page.evaluate(`window.__pump(20)`);
    await page.shot(`${tag}-horde-${vp.name}`);
    perf[vp.name] = {};
    for (const n of [100, 300, 1000, 2000]) {
      await page.evaluate(HORDE(n), true);
      await page.evaluate(`window.__pump(5)`);
      perf[vp.name][n] = await page.evaluate(FRAME_MS(90));
    }
    if (page.errors.length) console.log(vp.name, 'page errors:', page.errors.slice(0, 5));
  });
}
console.log('frame ms (sim + render):', JSON.stringify(perf, null, 1));
fs.writeFileSync(path.join(outDir, `${tag}-frame-ms.json`), JSON.stringify(perf, null, 1));
