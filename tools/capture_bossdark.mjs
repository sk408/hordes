// Heavier bosses: pictures from a real Chrome, for the before/after sheets.
//   HORDES_CHROME=<chrome.exe> node tools/capture_bossdark.mjs <tag> <root> <outDir> <desk|phone> [parts]
// <root> is the tree to serve (the main tree for "before", the worktree for
// "after"). parts (comma list, default bosses,crowd,cards):
//   bosses  each boss and the Maw, frame 0, drawn by the sprite cache with the
//           fight's own style and glow (its ring; on a light floor the dark
//           keyline when the look has a rim) on the eight floors, by day and at
//           deep night under the light layer's darkness, at 3x:
//           <tag>-bosses.png (desk only; it does not depend on the viewport)
//   crowd   a minute-10 crowd (capture_stagekeys.mjs's busy scene) at deep
//           night with one boss beside the hero, for each boss and the Maw, on
//           Verdant Hollow, Whiteout and Void Reach: <tag>-crowd-<STAGE>-<BOSS>-<vp>.png
//   cards   the arrival sting's name card of each wave boss and the Maw:
//           <tag>-card-<name>-<vp>.png
import path from 'node:path';
import fs from 'node:fs';

const tag = process.argv[2] || 'shot';
const root = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
const vpName = process.argv[5] || 'desk';
const parts = (process.argv[6] || 'bosses,crowd,cards').split(',');
const STAGES = (process.env.HORDES_CROWD || 'VERDANT_HOLLOW,WHITEOUT,VOID_REACH').split(',');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const STARTUP = `
(() => {
  let s = 20261119;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  window.__reseed = (k) => { s = k >>> 0; };
  let now = 1000; const q = [];
  performance.now = () => now;
  Date.now = () => 1.7e12 + now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__pump = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = q.shift(); if (!cb) return i; cb(now); } return n; };
  try { localStorage.setItem('hordes_onboarded', '1'); localStorage.setItem('hordes_audio_sfx', '0'); localStorage.setItem('hordes_audio_music', '0'); } catch (e) {}
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
  window.ET = await import('/src/enemy_types.js');
  window.BS = await import('/src/bosses.js');
  window.FB = await import('/src/final_boss.js');
  return true;
})()`;

// The boss sheet: rows are the bosses, columns the floors (day | deep night).
const BOSSES = `(async () => {
  const SC = await import('/src/sprite_cache.js');
  const SP = await import('/src/sprites.js');
  const B = await import('/src/bosses.js');
  const FB = await import('/src/final_boss.js');
  const WG = await import('/src/world_ground.js');
  const L = await import('/src/light.js');
  const C = (await import('/src/config.js')).CONFIG;
  const R = await import('/src/render.js');
  const pool = (s, light) => (R.bossPool ? R.bossPool(s, light) : s.rim);   // its pool of light (review fix)
  const stages = ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD', 'BONE_DESERT', 'WHITEOUT', 'BLOOD_RUST', 'VOID_REACH', 'CINDER_MAW'];
  const looks = [['DEFAULT', SP.BOSS_SPRITE, false], ...Object.entries(B.BOSS_SPRITES).map(([k, s]) => [k, s, false]), ['THE MAW', FB.FINAL_BOSS_SPRITE, true]];
  const Z = 3, cell = 40, labelW = 120, headH = 40;
  const W = labelW + stages.length * 2 * cell * Z, H = headH + looks.length * cell * Z;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#101014'; g.fillRect(0, 0, W, H);
  const off = document.createElement('canvas'); off.width = cell; off.height = cell;
  const og = off.getContext('2d');
  const theme = C.GROUND.THEMES[0];
  stages.forEach((st, si) => {
    g.fillStyle = '#d8d8e0'; g.font = '12px monospace';
    g.fillText(st, labelW + si * 2 * cell * Z + 4, 16);
    g.fillText('day', labelW + si * 2 * cell * Z + 4, 32);
    g.fillText('deep night', labelW + (si * 2 + 1) * cell * Z + 4, 32);
  });
  looks.forEach(([id, s, maw], r) => {
    g.fillStyle = '#d8d8e0'; g.font = '12px monospace';
    g.fillText(id, 6, headH + r * cell * Z + cell * Z / 2);
    stages.forEach((st, si) => {
      const P = WG.stageGroundPalette(st, theme);
      const light = WG.groundIsLight(st);
      for (let n = 0; n < 2; n++) {
        const amb = L.ambientFor(st, n);
        const floor = amb.a > 0 ? L.over(P.base, amb.col, amb.a) : P.base;
        const patch = amb.a > 0 ? L.over(P.patch, amb.col, amb.a) : P.patch;
        og.clearRect(0, 0, cell, cell);
        og.fillStyle = floor; og.fillRect(0, 0, cell, cell);
        og.fillStyle = patch; og.fillRect(0, cell - 6, cell, 6);
        const fr = s.frames[0];
        const w = fr[0].length, h = fr.length;
        const x = cell >> 1, feet = (cell >> 1) + (h >> 1);
        // as the fight draws it (render.js drawActor; the Maw's block)
        const rim = s.rim || null;
        if (maw) SC.blitGlow(og, (rim && pool(s, light)) || '#c87ab8', 16, x, feet - 2, 0.6);
        else SC.blitGlow(og, (rim && pool(s, light)) || '#c46ad8', w + 2, x, feet, 0.75);
        const ring = maw ? rim : (rim || '#ff9ed8');
        const st2 = SC.actorStyle(false, false, ring, true, false, !!(light && rim));
        SC.blitGrid(og, fr, s.palette, x - (w >> 1), (cell >> 1) - (h >> 1), st2, 1);
        g.drawImage(off, 0, 0, cell, cell, labelW + (si * 2 + n) * cell * Z, headH + r * cell * Z, cell * Z, cell * Z);
      }
    });
  });
  return cv.toDataURL('image/png');
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
  return { stage: T.state.stage, mode: T.state.mode };
})()`;

// The minute-10 crowd at deep night, with one boss 46 px right of the hero.
const CROWD = (bossId) => `(() => {
  const T = window.T, S = T.state, F = window.FEEL;
  let s = 99;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  S.time = 600;
  S.wave.num = 4; S.wave.endsAt = S.time + 10;   // deep night, fully in
  S.enemies.length = 0; S.gems.length = 0; S.enemyShots.length = 0;
  if (S.projectiles) S.projectiles.length = 0;
  if (S.effects) S.effects.length = 0;
  const p = S.player;
  p.hp = p.stats.maxHp; p.invuln = 0;
  const ids = ['CHASER', 'CHASER', 'SWARMER', 'SWARMER', 'BRUTE', 'SPITTER', 'DASHER', 'TICK', 'WARLOCK', 'CHASER'];
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = i < 16 ? 9 + r() * 14 : 26 + r() * 190;
    const e = window.ET.makeTypedEnemy(ids[i % ids.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, S.time, { elite: i % 97 === 0 });
    e.age = r(); e.hp = e.maxHp = 400 + r() * 900;
    if (Math.abs(e.x - (p.x + 46)) < 16 && Math.abs(e.y - p.y) < 18) continue;   // room for the boss
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
  S.finalBoss = null;
  if ('${bossId}' === 'MAW') {
    const b = window.FB.makeFinalBoss(p.x + 70, p.y + 4);
    b.finalBoss = true; b.age = 0;
    S.finalBoss = b; S.enemies.push(b); S.mode = 'finale';
  } else {
    const b = window.ET.makeTypedEnemy('BRUTE', p.x + 46, p.y + 2, S.time, { elite: true });
    b.boss = true; b.bossId = '${bossId}'; b.age = 0; b.hp = b.maxHp = 1e9;
    if ('${bossId}' !== 'DEFAULT') { const d = window.BS.BOSSES['${bossId}'] || window.BS.MIDBOSS['${bossId}']; b.name = d.name; b.bossSprite = window.BS.BOSS_SPRITES['${bossId}']; }
    S.enemies.push(b);
    S.mode = 'playing';
  }
  const f = F.feelOf(S);
  f.nums.length = 0; f.puffs.length = 0; f.sparks.length = 0; f.bursts.length = 0; f.hurtT = 0;
  f.player = p; f.time = S.time;
  T.renderer.render(S, S.cam);
  return { enemies: S.enemies.length, mode: S.mode };
})()`;

// A wave's boss (or the Maw) arrives; the sting runs `frames` frames.
const ARRIVE = (wave, maw) => `(() => {
  const T = window.T, S = T.state;
  S.mode = 'menu'; T.stages.select('VERDANT_HOLLOW'); window.__reseed(20261119); T.startRun(); window.__pump(2);
  S.wave.endsAt = S.time + 1e9; S.wave.midAt = S.time + 1e9;
  for (let i = 0; i < 240; i++) { window.__pump(1); S.player.hp = S.player.stats.maxHp; if (S.mode !== 'playing') { const c = document.querySelector('#ov-cards .card, #ov-cards .dcard'); if (c) c.click(); window.__pump(1); } }
  S.wave.num = ${wave};
  if (T.bossRules.setWave) T.bossRules.setWave(${wave});
  ${maw ? 'T.deathCine.startFinale(); if (S.finalBoss) S.finalBoss.hp = S.finalBoss.maxHp = 1e12;' : 'T.bossRules.spawnBoss(); for (const b of S.wave.bosses) { b.hp = b.maxHp = 1e9; }'}
  return { mode: S.mode, names: (S.wave.bosses || []).map(b => b.name) };
})()`;
const STEP = (frames) => `(() => { const S = window.T.state; for (let i = 0; i < ${frames}; i++) { window.__pump(1); S.player.hp = S.player.stats.maxHp; } return S.time; })()`;

const VPS = {
  desk: { w: 1280, h: 720, dpr: 1, mobile: false },
  phone: { w: 390, h: 844, dpr: 2, mobile: true },
};
const vp = VPS[vpName];
const out = { tag, root, vp: vpName, crowd: {}, cards: {} };
const t0 = Date.now();
await withPage({ ...vp, root, startupScript: STARTUP, timeoutMs: 170000 }, async (page) => {
  await page.sleep(400);
  await page.evaluate(BOOT, true);
  if (parts.includes('bosses')) {
    const url = await page.evaluate(BOSSES, true);
    fs.writeFileSync(path.join(outDir, `${tag}-bosses.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  if (parts.includes('crowd')) {
    const ids = (process.env.HORDES_BOSSES || 'DEFAULT,GRAVELMAW,CHOIR_MOTHER,PYRAXIS,HERALD,MAW').split(',');
    for (const st of STAGES) {
      await page.evaluate(RUN(st, 30));
      for (const id of ids) {
        out.crowd[st + ' ' + id] = await page.evaluate(CROWD(id));
        await page.shot(`${tag}-crowd-${st}-${id}-${vpName}`);
      }
    }
  }
  if (parts.includes('cards')) {
    for (const [name, wave, maw] of [['w1', 1, false], ['w2', 2, false], ['w6', 6, false], ['maw', 10, true]]) {
      out.cards[name] = await page.evaluate(ARRIVE(wave, maw));
      await page.evaluate(STEP(maw ? 150 : 48));
      await page.shot(`${tag}-card-${name}-${vpName}`);
    }
  }
  out.errors = page.errors.slice(0, 8);
});
out.seconds = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(outDir, `${tag}-${vpName}-log.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ seconds: out.seconds, errors: out.errors, cards: out.cards }));
