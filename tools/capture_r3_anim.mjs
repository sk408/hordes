// R3 "characters face where they walk, bob, pop in, squash on hits and
// collapse before the puff; depth-sorted": before/after sheets and the frame
// time of a busy scene, in a real (headless) Chrome.
//   HORDES_CHROME=<chrome.exe> node tools/capture_r3_anim.mjs <beforeRoot> <afterRoot> <outDir> [frames|time|all]
// <beforeRoot> is the tree without the change (the main tree), <afterRoot>
// the tree with it. Both are served and driven by the same script.
//
// Strips: the sim is not run. Each frame the script moves the subject by
// hand, advances the clock and the feel observer by sim dt, and paints one
// frame, so the before and after strips show the same moments. Rows: the
// hero walking left then right; a BRUTE spawning; a BRUTE hit; a BRUTE dying.
// Crowd: the minute-12 scene of tools/capture_r3_readable.mjs (same seeded
// generator), painted after two feel steps, centre crop before | after.
// Time: that scene painted 400 times in samples of 5 (render only), then 180
// live frames (sim + render) in samples of 3; median and 95th percentile of
// the samples, in ms per frame.
import path from 'node:path';
import fs from 'node:fs';

const beforeRoot = path.resolve(process.argv[2] || '.');
const afterRoot = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
const what = process.argv[5] || 'all';
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
  window.CONF = (await import('/src/config.js')).CONFIG;
  const { makeTypedEnemy } = await import('/src/enemy_types.js');
  window.makeTypedEnemy = makeTypedEnemy;
  return T.state.mode;
})()`;

// The minute-12 crowd (the generator of tools/capture_r3_readable.mjs).
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
  // Two feel steps: every body gets its record (it faces the hero).
  F.feelStep(S, 1 / 60); F.feelStep(S, 1 / 60);
  return { enemies: S.enemies.length, gems: S.gems.length, nums: f.nums.length, mode: S.mode };
})()`;

const TIMES = `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  for (let i = 0; i < 20; i++) T.renderer.render(T.state, T.state.cam);   // warm the caches
  // Batches of 5 paints per sample: the browser clock has a coarse grain.
  const rs = [];
  for (let i = 0; i < 80; i++) { const t0 = real(); for (let j = 0; j < 5; j++) T.renderer.render(T.state, T.state.cam); rs.push((real() - t0) / 5); }
  rs.sort((a, b) => a - b);
  return { renderMed: q(rs, 0.5), renderP95: q(rs, 0.95), n: rs.length };
})()`;
const LIVE = `(() => {
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  const ts = []; let skipped = 0;
  // Samples of 3 frames each (the clock's grain again), 60 samples.
  for (let i = 0; i < 60; i++) {
    T.state.player.hp = T.state.player.stats.maxHp;
    if (T.state.mode !== 'playing') {
      const c = document.querySelector('#overlay .card, #overlay button');
      if (c) c.click();
      window.__pump(1); skipped++; i--; if (skipped > 600) break; continue;
    }
    const t0 = real(); window.__pump(3); ts.push((real() - t0) / 3);
  }
  ts.sort((a, b) => a - b);
  return { frameMed: q(ts, 0.5), frameP95: q(ts, 0.95), n: ts.length, skipped, enemies: T.state.enemies.length };
})()`;
// A/B in one page (the after tree only): the animation switched off and on
// for alternate samples, so load from other programs falls on both alike.
const AB = `(async () => {
  const A = await import('/src/actor_anim.js');
  const T = window.T; const real = Performance.prototype.now.bind(performance);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  const stat = (a) => { a.sort((x, y) => x - y); return { med: q(a, 0.5), p95: q(a, 0.95), n: a.length }; };
  const ro = { off: [], on: [] }, lo = { off: [], on: [] };
  for (let i = 0; i < 20; i++) T.renderer.render(T.state, T.state.cam);
  for (let i = 0; i < 200; i++) {
    const on = i % 2 === 1; A.setActorAnim(on);
    const t0 = real(); for (let j = 0; j < 5; j++) T.renderer.render(T.state, T.state.cam); ro[on ? 'on' : 'off'].push((real() - t0) / 5);
  }
  let skipped = 0;
  for (let i = 0; i < 120; i++) {
    T.state.player.hp = T.state.player.stats.maxHp;
    if (T.state.mode !== 'playing') {
      const c = document.querySelector('#overlay .card, #overlay button');
      if (c) c.click();
      window.__pump(1); skipped++; i--; if (skipped > 600) break; continue;
    }
    const on = i % 2 === 1; A.setActorAnim(on);
    const t0 = real(); window.__pump(3); lo[on ? 'on' : 'off'].push((real() - t0) / 3);
  }
  A.setActorAnim(true);
  return { renderOff: stat(ro.off), renderOn: stat(ro.on), liveOff: stat(lo.off), liveOn: stat(lo.on), skipped };
})()`;

// The sprite cache after the busy scene: how many variants each grid holds.
const CACHE = `(async () => {
  const sc = await import('/src/sprite_cache.js');
  const out = { stats: sc.cacheStats() };
  if (sc.gridVariants) {
    const { ENEMY_SPRITES } = await import('/src/enemy_sprites.js');
    const per = {};
    for (const [id, spr] of Object.entries(ENEMY_SPRITES)) per[id] = spr.frames.map(g => sc.gridVariants(g));
    out.variants = per;
  }
  return out;
})()`;

// Strips. Each row: 12 frames of a 30-world-px-square (hero: 64 x 40) crop,
// scaled into 150 px cells, the sim time printed on each.
const STRIPS = `(() => {
  const T = window.T, S = T.state, F = window.FEEL, R = T.renderer, C = window.CONF;
  const cv = R.canvas;
  const clear = () => {
    S.enemies.length = 0; S.gems.length = 0;
    if (S.enemyShots) S.enemyShots.length = 0;
    if (S.projectiles) S.projectiles.length = 0;
    if (S.effects) S.effects.length = 0;
    if (S.chests) S.chests.length = 0;
    if (S.itemDrops) S.itemDrops.length = 0;
    S.weather = null;
    const f = F.feelOf(S);
    f.nums.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0; f.hurtT = 0;
    if (f.corpses) f.corpses.length = 0;
    S.player.invuln = 0; S.player.hp = S.player.stats.maxHp;
  };
  // Empty the field, let the feel observer see it empty, then empty its pools
  // (the last strip's body must not collapse or puff in this one).
  const reset = () => { clear(); F.feelStep(S, 1 / 60); clear(); };
  const p = S.player;
  const home = { x: p.x, y: p.y };
  const CELL = 150, LAB = 18, N = 12;
  const rows = [], dbg = [];
  window.__animDbg = dbg;
  // world point -> canvas px
  const toPx = (wx, wy) => {
    const Z = R._zoom || 1, k = cv.width / C.VIEW_W;
    return { x: (C.VIEW_W / 2 + (wx - S.cam.x - C.VIEW_W / 2) * Z) * k, y: (C.VIEW_H / 2 + (wy - S.cam.y - C.VIEW_H / 2) * Z) * k, s: Z * k };
  };
  const strip = (label, sub, dtSub, setup, each, focus, boxW, boxH) => {
    reset(); p.x = home.x; p.y = home.y; S.time = 300;
    const ctx = setup();
    for (let k = 0; k < 4; k++) { S.time += 1 / 60; F.feelStep(S, 1 / 60); }   // records settle
    R.render(S, S.cam);
    const sheet = document.createElement('canvas');
    const cw = Math.round(CELL * boxW / boxH);
    sheet.width = cw * N; sheet.height = CELL + LAB;
    const sg = sheet.getContext('2d');
    sg.imageSmoothingEnabled = false;
    sg.fillStyle = '#000'; sg.fillRect(0, 0, sheet.width, sheet.height);
    let t = 0;
    const fc = focus(ctx);
    for (let i = 0; i < N; i++) {
      if (i > 0) for (let k = 0; k < sub; k++) {
        each(ctx, i, k);
        S.time += dtSub; t += dtSub;
        for (const e of S.enemies) { e.age = (e.age || 0) + dtSub; e.flash = Math.max(0, (e.flash || 0) - dtSub); }
        F.feelStep(S, dtSub);
      }
      R.render(S, S.cam);
      const c = toPx(fc.x, fc.y);
      const sw = boxW * c.s, sh = boxH * c.s;
      dbg.push([label.slice(0, 4), i, Math.round(p.x * 10) / 10, Math.round(S.cam.x), R._lpx !== undefined ? Math.round(R._lpx) : null, F.feelOf(S).hero ? F.feelOf(S).hero.face : null, S.mode].join(' '));
      sg.drawImage(cv, c.x - sw / 2, c.y - sh / 2, sw, sh, i * cw, LAB, cw, CELL);
      sg.fillStyle = '#ffd75e'; sg.font = '13px monospace';
      sg.fillText('t=' + t.toFixed(3) + 's', i * cw + 4, 13);
      sg.fillStyle = '#333'; sg.fillRect(i * cw + cw - 1, 0, 1, sheet.height);
    }
    rows.push({ label, url: sheet.toDataURL('image/png'), w: sheet.width, h: sheet.height });
  };
  const brute = (dx, age) => {
    const e = window.makeTypedEnemy('BRUTE', home.x + dx, home.y, S.time, {});
    e.age = age; e.hp = e.maxHp = 1e6; e.flash = 0;
    S.enemies.push(e); return e;
  };
  // 1. The hero walks left (6 frames), then right; 4 substeps of 1/60 s, 1 px each.
  // (The hero starts facing right: the reset's jump home is not a walk.)
  strip('hero walks left, then right', 4, 1 / 60, () => { const h = F.feelOf(S).hero; if (h) { h.face = 1; h.vxs = 0; } return {}; },
    (c, i, k) => { p.x += i <= 6 ? -1 : 1; }, () => ({ x: home.x - 12, y: home.y }), 64, 40);
  // 2. A BRUTE spawns 40 px right of the hero and walks left: 1 substep of 1/60 s.
  strip('enemy spawns (walking left)', 1, 1 / 60, () => ({ e: null }),
    (c, i, k) => { if (!c.e) c.e = brute(40, 0); c.e.x -= 0.5; }, () => ({ x: home.x + 36, y: home.y - 2 }), 36, 30);
  // 3. A BRUTE walking left is hit on frame 2: the sim's hit flash, 0.08 s.
  strip('enemy hit (frame 2)', 1, 1 / 60, () => ({ e: brute(40, 1) }),
    (c, i, k) => { c.e.x -= 0.5; if (i === 2) c.e.flash = 0.08; }, () => ({ x: home.x + 36, y: home.y - 2 }), 36, 30);
  // 4. A BRUTE walking left dies on frame 1: 2 substeps (1/30 s per frame).
  strip('enemy dies (frame 1)', 2, 1 / 60, () => ({ e: brute(40, 1) }),
    (c, i, k) => { if (i === 1 && k === 0) { c.e.hp = 0; S.enemies.length = 0; } else if (S.enemies.length) c.e.x -= 0.5; },
    () => ({ x: home.x + 38, y: home.y - 2 }), 44, 36);
  clear(); p.x = home.x; p.y = home.y;
  return rows;
})()`;

// Compose: for each row, BEFORE above AFTER, labelled.
const COMPOSE = (before, after, title) => `(async () => {
  const B = ${JSON.stringify(before)}, A = ${JSON.stringify(after)};
  const load = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = u; });
  const HEAD = 26, TAG = 70;
  let W = 0, H = HEAD;
  for (let i = 0; i < A.length; i++) { W = Math.max(W, A[i].w + TAG, B[i].w + TAG); H += A[i].h + B[i].h + 30; }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#15151c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText(${JSON.stringify(title)}, 8, 18);
  let y = HEAD;
  for (let i = 0; i < A.length; i++) {
    g.fillStyle = '#9fd'; g.font = 'bold 14px sans-serif'; g.fillText(A[i].label, 8, y + 16); y += 22;
    for (const [tag, r] of [['BEFORE', B[i]], ['AFTER', A[i]]]) {
      g.fillStyle = tag === 'AFTER' ? '#ffd75e' : '#aaa'; g.font = 'bold 13px sans-serif'; g.fillText(tag, 6, y + r.h / 2);
      g.drawImage(await load(r.url), TAG, y); y += r.h;
    }
    y += 8;
  }
  return cv.toDataURL('image/png');
})()`;

const CROWD = `(() => { const R = window.T.renderer; R.render(window.T.state, window.T.state.cam); return { url: R.canvas.toDataURL('image/png'), w: R.canvas.width, h: R.canvas.height }; })()`;
const CROWD_PAIR = (b, a, title) => `(async () => {
  const load = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = u; });
  const B = await load(${JSON.stringify(b.url)}), A = await load(${JSON.stringify(a.url)});
  // The centre half of each frame, side by side.
  const cw = Math.round(A.width / 2), ch = Math.round(A.height / 2);
  const cv = document.createElement('canvas'); cv.width = cw * 2 + 10; cv.height = ch + 26;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#15151c'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(B, A.width / 4, A.height / 4, cw, ch, 0, 26, cw, ch);
  g.drawImage(A, A.width / 4, A.height / 4, cw, ch, cw + 10, 26, cw, ch);
  g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif';
  g.fillText('BEFORE (list order)', 6, 18); g.fillText('AFTER (back to front, facing)  ' + ${JSON.stringify(title)}, cw + 16, 18);
  return cv.toDataURL('image/png');
})()`;

const VIEWPORTS = [
  { name: 'desk', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 390, h: 844, dpr: 2, mobile: true },
];
const save = (name, url) => fs.writeFileSync(path.join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));

const out = {};
for (const vp of VIEWPORTS) {
  const res = {};
  for (const [tag, root] of [['before', beforeRoot], ['after', afterRoot]]) {
    await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 120000 }, async (page) => {
      await page.sleep(400);
      const o = res[tag] = {};
      o.boot = await page.evaluate(BOOT, true);
      if (what !== 'time') { o.strips = await page.evaluate(STRIPS); o.dbg = await page.evaluate('window.__animDbg'); }
      o.stage = await page.evaluate(STAGE);
      if (what !== 'time') o.crowd = await page.evaluate(CROWD);
      if (what !== 'frames') {
        o.render = await page.evaluate(TIMES);
        o.cache = await page.evaluate(CACHE, true);
        await page.evaluate(STAGE);
        o.live = await page.evaluate(LIVE);
        if (tag === 'after') { await page.evaluate(STAGE); o.ab = await page.evaluate(AB, true); }
      }
      if (tag === 'after' && what !== 'time') {
        save(`strips-${vp.name}.png`, await page.evaluate(COMPOSE(res.before.strips, o.strips, `Actor animation, ${vp.w}x${vp.h}: before above after, sim time on each frame`), true));
        save(`crowd-${vp.name}.png`, await page.evaluate(CROWD_PAIR(res.before.crowd, o.crowd, `${vp.w}x${vp.h}`), true));
        save(`crowd-before-${vp.name}.png`, res.before.crowd.url);
        save(`crowd-after-${vp.name}.png`, o.crowd.url);
      }
      o.errors = page.errors.slice(0, 5);
    });
  }
  out[vp.name] = {};
  for (const t of ['before', 'after']) {
    const r = res[t];
    out[vp.name][t] = { ab: r.ab, dbg: r.dbg, boot: r.boot, stage: r.stage, render: r.render, live: r.live, cache: r.cache, errors: r.errors };
  }
}
fs.writeFileSync(path.join(outDir, `measure-${what}.json`), JSON.stringify(out, null, 1));
for (const [vp, o] of Object.entries(out)) {
  for (const t of ['before', 'after']) {
    const r = o[t];
    console.log(vp, t, 'errors', r.errors.length,
      r.render ? `render med ${r.render.renderMed.toFixed(2)} p95 ${r.render.renderP95.toFixed(2)}` : '',
      r.live ? `live med ${r.live.frameMed.toFixed(2)} p95 ${r.live.frameP95.toFixed(2)} (n ${r.live.n})` : '');
    if (r.ab) for (const k of ['renderOff', 'renderOn', 'liveOff', 'liveOn']) console.log('   A/B', k, 'med', r.ab[k].med.toFixed(3), 'p95', r.ab[k].p95.toFixed(3), 'n', r.ab[k].n);
  }
}
