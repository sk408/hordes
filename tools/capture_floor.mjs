// R3 floor item: the minute-12 scene with a full floor, before and after, in a
// real Chrome, with the floor counts printed on the picture; a strip of a field
// condensing and an opened chest clearing; the rich gem sizes. Frame times.
//   HORDES_CHROME=<chrome.exe> node tools/capture_floor.mjs <tag> <root> <outDir>
// <root> is the tree to serve (the main tree for "before", a worktree for "after").
// The scene is the tools/capture_r3_readable.mjs minute-12 crowd (260 enemies,
// 360 gems, numbers, shots) plus what the floor census found lying there at
// minute 12 on a strong save: 30 item drops (16 on an opened chest), 12 potions,
// 3 chests. Every floor object is given an age, so the after tree's floor rules
// (main.js tickFloor, run here for 2 s of game time) act on it as they would.
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
  const T = m.__TEST; window.T = T;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5); T.startRun(); window.__pump(3);
  window.FEEL = await import('/src/fx/feel.js');
  window.LOOT = await import('/src/loot.js');
  const { makeTypedEnemy } = await import('/src/enemy_types.js');
  window.makeTypedEnemy = makeTypedEnemy;
  const tag = document.createElement('div');
  tag.id = 'floor-tag';
  tag.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:bold 14px monospace;color:#fff;background:rgba(0,0,0,.72);padding:6px 9px;white-space:pre;pointer-events:none';
  document.body.appendChild(tag);
  return T.state.mode;
})()`;

// Print the floor counts on the picture.
const LABEL = (title) => `(() => {
  const S = window.T.state;
  const rich = S.gems.filter(g => (g.n || 1) > 1 && g.xp >= 30).length;
  const xp = Math.round(S.gems.reduce((t, g) => t + g.xp, 0));
  const rem = S.itemDrops.filter(d => d.chest).length;
  const pot = S.drops.reduce((t, d) => t + (d.count || 1), 0);
  document.getElementById('floor-tag').textContent = ${JSON.stringify(title)} + '\\n' +
    'gems ' + S.gems.length + (rich ? ' (' + rich + ' rich)' : '') + '  floor XP ' + xp + '\\n' +
    'items ' + S.itemDrops.length + ' (on open chests ' + rem + ')  potions ' + pot + '  chests ' + S.chests.length;
  return { gems: S.gems.length, rich, xp, items: S.itemDrops.length, remnants: rem, potions: pot, chests: S.chests.length };
})()`;

const STAGE = `(() => {
  const T = window.T, S = T.state, F = window.FEEL;
  let s = 99;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.time = 720;
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  S.drops.length = 0; S.itemDrops.length = 0; S.chests.length = 0;
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
    S.gems.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, xp: k < 0.7 ? 1 + Math.floor(r() * 4) : k < 0.93 ? 8 : 30, age: r(), t: S.time - r() * 60 });
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 30 + r() * 120;
    S.enemyShots.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60,
      damage: 5, age: 0.2, kind: i % 3 ? 'spit' : 'bolt', src: {} });
  }
  const bands = ['common', 'common', 'common', 'rare', 'common', 'epic'];
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 190;
    const it = window.LOOT.rollItemOfRarity(i % 7 ? 'COMMON' : 'RARE', r);
    const o = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, item: it, age: 0, t: S.time - r() * 90 };
    if (i < 16) o.chest = bands[i % bands.length];
    S.itemDrops.push(o);
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = 50 + r() * 180;
    const o = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, kind: i % 2 ? 'hp' : 'mp' };
    T.m3.pushDrop(o);
    o.t = S.time - r() * 80;   // the age the census found (after the push stamps it)
  }
  for (let i = 0; i < 3; i++) S.chests.push({ id: 900 + i, x: p.x - 120 + i * 110, y: p.y + 100 - i * 30, age: r() * 10 });
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
  // The floor rules, for 2 s of game time (nothing in the before tree).
  if (T.floor) for (let i = 0; i < 4; i++) { S.time += 0.5; T.floor.tick(0.5); }
  T.renderer.render(S, S.cam);
  return true;
})()`;

const RENDER_ONLY = (n) => `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const rs = [];
  for (let i = 0; i < ${n}; i++) { const t0 = real(); T.renderer.render(T.state, T.state.cam); rs.push(real() - t0); }
  rs.sort((a, b) => a - b);
  return { med: +rs[rs.length >> 1].toFixed(2), p95: +rs[Math.floor(rs.length * 0.95)].toFixed(2) };
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
  return { med: +ts[ts.length >> 1].toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), measured: ts.length, skipped };
})()`;

// A quiet field: 90 small gems scattered round the hero, two opened chests with
// their items, nobody collecting. Frames every 4 s of game time.
const FIELD = `(() => {
  const T = window.T, S = T.state;
  let s = 5;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.enemies.length = 0; S.enemyShots.length = 0; S.gems.length = 0; S.drops.length = 0; S.itemDrops.length = 0; S.chests.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  const f = window.FEEL.feelOf(S); f.nums.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0;
  const p = S.player;
  window.__keep = { pick: p.stats.pickup };
  p.stats.pickup = 0;
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, d = 50 + r() * 150;
    S.gems.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, xp: 1 + Math.floor(r() * 4), t: S.time });
  }
  const it = window.LOOT.rollItemOfRarity('COMMON', r);
  S.itemDrops.push({ x: p.x - 70, y: p.y - 40, item: it, age: 0, chest: 'common', t: S.time });
  S.itemDrops.push({ x: p.x + 80, y: p.y - 45, item: window.LOOT.rollItemOfRarity('RARE', r), age: 0, chest: 'rare', t: S.time });
  window.__t0 = S.time;
  return S.gems.length;
})()`;
const FIELD_STEP = (frames) => `(() => {
  const T = window.T, S = T.state;
  for (let i = 0; i < ${frames}; i++) {
    S.enemies.length = 0; S.enemyShots.length = 0;
    S.player.hp = S.player.stats.maxHp;
    if (S.mode !== 'playing') { const c = document.querySelector('#overlay .card, #overlay button'); if (c) c.click(); }
    window.__pump(1);
  }
  S.enemies.length = 0; S.enemyShots.length = 0;
  T.renderer.render(S, S.cam);
  return (S.time - window.__t0).toFixed(1);
})()`;

// A chest opened at the hero's feet (a rare band chest, so it holds an item).
// The hero stands still; frames every 0.5 s.
const CHEST = `(() => {
  const T = window.T, S = T.state;
  S.enemies.length = 0; S.enemyShots.length = 0; S.gems.length = 0; S.drops.length = 0; S.itemDrops.length = 0; S.chests.length = 0;
  const f = window.FEEL.feelOf(S); f.nums.length = 0;
  if (T.setPilotMode) T.setPilotMode('MANUAL');
  S.pilotMode = 'MANUAL';
  const p = S.player;
  if (window.__keep) p.stats.pickup = window.__keep.pick;   // the field strip set it to 0
  // The hero to open ground in the middle of the arena, and the camera settled on him.
  p.x = 0; p.y = 0;
  for (let i = 0; i < 40; i++) { S.enemies.length = 0; S.enemyShots.length = 0; window.__pump(1); }
  // A full belt of legendary items, so the hero turns the chest's item down
  // and it stays on the floor (the case Steve saw: open chests left lying).
  S.items.length = 0;
  for (let i = 0; i < 4; i++) S.items.push(window.LOOT.rollItemOfRarity('LEGENDARY', Math.random));
  S.chests.push({ id: 990, x: p.x + 8, y: p.y + 4, age: 0, band: 'rare', mimic: false });
  window.__t0 = S.time;
  return true;
})()`;

// 20 potions dropped over 60 s, the hero's belt full so he takes none.
const POTIONS = `(() => {
  const T = window.T, S = T.state;
  let s = 11;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.enemies.length = 0; S.enemyShots.length = 0; S.gems.length = 0; S.drops.length = 0; S.itemDrops.length = 0; S.chests.length = 0;
  const p = S.player;
  for (let i = 0; i < 20; i++) {
    const a = r() * Math.PI * 2, d = 80 + r() * 160;
    p.potions.hp = p.potions.mp = S.potionCap;
    T.m3.pushDrop({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, kind: i % 2 ? 'hp' : 'mp' });
    for (let k = 0; k < 180; k++) {
      S.enemies.length = 0; S.enemyShots.length = 0; p.hp = p.stats.maxHp;
      p.potions.hp = p.potions.mp = S.potionCap;
      if (S.mode !== 'playing') { const c = document.querySelector('#overlay .card, #overlay button'); if (c) c.click(); }
      window.__pump(1);
    }
  }
  S.enemies.length = 0; S.enemyShots.length = 0;
  T.renderer.render(S, S.cam);
  return S.drops.reduce((t, d) => t + (d.count || 1), 0);
})()`;

// The rich gem sizes beside the three ordinary tiers, on an empty field.
const SIZES = `(() => {
  const T = window.T, S = T.state;
  S.enemies.length = 0; S.enemyShots.length = 0; S.gems.length = 0; S.drops.length = 0; S.itemDrops.length = 0; S.chests.length = 0;
  const f = window.FEEL.feelOf(S); f.nums.length = 0;
  const p = S.player;
  // The hero to open ground in the middle of the arena, and the camera settled on him.
  if (T.setPilotMode) T.setPilotMode('MANUAL');
  S.pilotMode = 'MANUAL';
  p.x = 0; p.y = 0;
  for (let i = 0; i < 40; i++) { S.enemies.length = 0; S.enemyShots.length = 0; window.__pump(1); }
  S.gems.length = 0;
  const row = [{ xp: 2 }, { xp: 8 }, { xp: 30 }, { xp: 30, n: 9 }, { xp: 100, n: 30 }, { xp: 300, n: 90 }, { xp: 1000, n: 300 }];
  // Below the hero, clear of the HUD at the top of the screen.
  row.forEach((g, i) => S.gems.push({ x: p.x - 48 + i * 16, y: p.y + 22, t: S.time, ...g }));
  // Enemy shots in a second row, held still (age and speed 0, so they are
  // drawn where they are put), to judge rich gems against them.
  S.enemyShots.push({ x: p.x - 16, y: p.y + 40, vx: 0, vy: 0, damage: 5, age: 0, kind: 'spit', src: {} });
  S.enemyShots.push({ x: p.x + 16, y: p.y + 40, vx: 0, vy: 0, damage: 5, age: 0, kind: 'bolt', src: {} });
  T.renderer.render(S, S.cam);
  document.getElementById('floor-tag').textContent = 'top row: gem 2 XP, 8 XP, 30 XP (single);\\nRICH 30+, 100+, 300+, 1000+ XP.\\nsecond row: enemy shots spit (left), bolt (right).\\nabove: the hero.';
  return S.enemyShots.length;
})()`;

const VIEWPORTS = [
  { name: 'desk', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 390, h: 844, dpr: 2, mobile: true },
];
const out = {};
for (const vp of VIEWPORTS) {
  await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 120000 }, async (page) => {
    await page.sleep(400);
    const o = out[vp.name] = {};
    o.boot = await page.evaluate(BOOT, true);
    // FLOOR_ONLY=sizes: only the size row, at every viewport.
    if (process.env.FLOOR_ONLY === 'sizes') {
      o.shots = await page.evaluate(SIZES);
      await page.shot(`${tag}-sizes-${vp.name}`);
      o.errors = page.errors.slice(0, 5);
      return;
    }
    await page.evaluate(STAGE);
    o.counts = await page.evaluate(LABEL(tag.toUpperCase() + ': minute 12, ' + vp.w + 'x' + vp.h));
    await page.shot(`${tag}-m12-${vp.name}`);
    await page.evaluate(RENDER_ONLY(20));
    o.renderStill = await page.evaluate(RENDER_ONLY(150));
    await page.evaluate(STAGE);
    o.live = await page.evaluate(LIVE(120));
    o.liveCounts = await page.evaluate(LABEL(''));
    if (vp.name === 'desk') {
      await page.evaluate(FIELD);
      for (let k = 0; k <= 9; k++) {
        const t = k === 0 ? await page.evaluate(FIELD_STEP(1)) : await page.evaluate(FIELD_STEP(360));
        o['strip' + k] = await page.evaluate(LABEL(tag.toUpperCase() + '  t = ' + t + ' s'));
        await page.shot(`${tag}-strip-${String(k).padStart(2, '0')}`);
      }
      await page.evaluate(CHEST);
      for (let k = 0; k <= 9; k++) {
        const t = await page.evaluate(FIELD_STEP(k === 0 ? 2 : 30));
        // The hero steps back off the opened chest, so its art is not under him.
        if (k === 0) await page.evaluate('window.T.state.player.x -= 45');
        o['chest' + k] = await page.evaluate(LABEL(tag.toUpperCase() + '  chest opened, t = ' + t + ' s'));
        await page.shot(`${tag}-chest-${String(k).padStart(2, '0')}`);
      }
      o.potions = await page.evaluate(POTIONS);
      await page.evaluate(LABEL(tag.toUpperCase() + ': 60 s of potion drops, potions full, nobody taking them'));
      await page.shot(`${tag}-potions`);
      await page.evaluate(SIZES);
      await page.shot(`${tag}-sizes`);
    }
    o.errors = page.errors.slice(0, 5);
  });
}
fs.writeFileSync(path.join(outDir, `${tag}-measure.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
