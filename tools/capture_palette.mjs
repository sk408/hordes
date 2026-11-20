// R6 master palette: close-up sheets from a real Chrome.
//   HORDES_CHROME=<chrome.exe> node tools/capture_palette.mjs <tag> <root> <outDir> [parts]
// <root> is the tree to serve (the main tree for "before", the worktree for
// "after"). parts (comma list, default all):
//   actors   every pilot, horde enemy, boss and the Maw, frame 0, drawn by the
//            sprite cache with the game's own styles (the horde muted, the hero
//            ringed) at 5x on a dark floor (Cinder Maw) and a light one
//            (Whiteout): <tag>-actors.png
//   weapons  the player's projectiles and fire beside the four enemy shot orbs,
//            at 6x on the same two floors: <tag>-weapons.png
import path from 'node:path';
import fs from 'node:fs';

const tag = process.argv[2] || 'shot';
const root = path.resolve(process.argv[3] || '.');
const outDir = path.resolve(process.argv[4] || './shots');
const parts = (process.argv[5] || 'actors,weapons').split(',');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const ACTORS = `(async () => {
  const SC = await import('/src/sprite_cache.js');
  const R = await import('/src/render.js');
  const CH = await import('/src/character_sprites.js');
  const ES = await import('/src/enemy_sprites.js');
  const SP = await import('/src/sprites.js');
  const B = await import('/src/bosses.js');
  const FB = await import('/src/final_boss.js');
  const WG = await import('/src/world_ground.js');
  const floors = [['CINDER_MAW', false], ['WHITEOUT', true]].map(([id, light]) => ({ id, light, base: WG.stageGroundPalette(id, R.groundTheme ? R.groundTheme(1) : undefined).base }));
  const rows = [
    ['PILOTS', Object.entries(CH.CHARACTER_SPRITES).map(([id, s]) => [id, s, 'hero'])],
    ['HORDE', Object.entries(ES.ENEMY_SPRITES).map(([id, s]) => [id, s, 'horde'])],
    ['ELITES', Object.entries(ES.ENEMY_SPRITES).slice(0, 5).map(([id, s]) => [id + '*', s, 'elite'])],
    ['BOSSES', [['DEFAULT', SP.BOSS_SPRITE, 'boss'], ...Object.entries(B.BOSS_SPRITES).map(([id, s]) => [id, s, 'boss']), ['THE MAW', FB.FINAL_BOSS_SPRITE, 'maw']]],
  ];
  const Z = 5, cellW = 150, cellH = 150, labelW = 90;
  const maxN = Math.max(...rows.map(r => r[1].length));
  const W = labelW + maxN * cellW, H = rows.length * cellH * 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#101014'; g.fillRect(0, 0, W, H);
  const off = document.createElement('canvas'); off.width = 120; off.height = 120;
  const og = off.getContext('2d');
  let y = 0;
  const ELITE = (await import('/src/enemy_types.js')).ELITE_LOOK.trim;
  for (const [label, list] of rows) {
    for (const fl of floors) {
      g.fillStyle = fl.base; g.fillRect(labelW, y, W - labelW, cellH);
      g.fillStyle = '#d8d8e0'; g.font = '12px monospace';
      g.fillText(label, 6, y + 20); g.fillText(fl.light ? 'light floor' : 'dark floor', 6, y + 36);
      list.forEach(([id, s, kind], i) => {
        og.clearRect(0, 0, 120, 120);
        const grid = s.frames[0];
        const w = grid[0].length, h = grid.length;
        const scale = kind === 'boss' || kind === 'maw' ? 1 : 1;
        const ring = kind === 'hero' ? R.HERO_WARM : kind === 'elite' ? ELITE : (kind === 'maw' ? null : null);
        const st = SC.actorStyle(false, false, ring, true, kind === 'horde' || kind === 'elite', kind === 'hero' && fl.light);
        SC.blitGrid(og, grid, s.palette, 60 - (w >> 1), 60 - (h >> 1), st, scale);
        // fit the cell: bosses are big, so they draw at a smaller zoom
        const zz = Math.max(1, Math.min(Z, Math.floor((cellH - 24) / (h + 8))));
        const sz = 120 * zz;
        g.drawImage(off, 0, 0, 120, 120, labelW + i * cellW + cellW / 2 - sz / 2, y + cellH / 2 - sz / 2 - 6, sz, sz);
        g.fillStyle = fl.light ? '#1a1622' : '#e4e2ea';
        g.font = '11px monospace';
        g.fillText(id, labelW + i * cellW + 6, y + cellH - 6);
      });
      y += cellH;
    }
  }
  return cv.toDataURL('image/png');
})()`;

const WEAPONS = `(async () => {
  const R = await import('/src/render.js');
  const SC = await import('/src/sprite_cache.js');
  const WG = await import('/src/world_ground.js');
  const floors = [['CINDER_MAW', false], ['VERDANT_HOLLOW', false], ['WHITEOUT', true]].map(([id, light]) => ({ id, light, base: WG.stageGroundPalette(id, R.groundTheme ? R.groundTheme(1) : undefined).base }));
  const yours = ['ember', 'firepatch', 'javelin', 'seeker', 'mine', 'ricochet', 'boomerang'];
  const theirs = Object.keys(R.SHOT_PAINT);
  const Z = 6, cell = 26;
  const W = 120 + (yours.length + theirs.length + 1) * cell * Z / 2.2, H = floors.length * 150;
  const cv = document.createElement('canvas'); cv.width = Math.round(W); cv.height = H;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#101014'; g.fillRect(0, 0, cv.width, H);
  const off = document.createElement('canvas'); off.width = 24; off.height = 24;
  const og = off.getContext('2d');
  floors.forEach((fl, r) => {
    const y = r * 150;
    g.fillStyle = fl.base; g.fillRect(120, y, cv.width - 120, 150);
    g.fillStyle = '#d8d8e0'; g.font = '12px monospace'; g.fillText(fl.id, 6, y + 20);
    g.fillText('yours | theirs', 6, y + 38);
    const items = [...yours.map(k => ['you: ' + k, k]), null, ...theirs.map(k => ['shot: ' + k, k])];
    items.forEach((it, i) => {
      if (!it) return;
      og.clearRect(0, 0, 24, 24);
      if (it[0].startsWith('you')) {
        const p = { kind: it[1], age: 0.31, vx: 1, vy: 0.4, evo: false, tint: null, x: 0, y: 0 };
        try { R.paintProjectileBody(og, p, 12, 12, 1); } catch (e) {}
      } else {
        // the orb as the game bakes it: white rim on a dark floor, white then dark on a light one
        SC.blitPainted(og, 'shot:' + it[1], { x: -4, y: -5, w: 9, h: 10 }, R.SHOT_PAINT[it[1]], 12, 12, fl.light ? R.STYLE_SHOT_LIGHT : R.STYLE_SHOT);
      }
      const x = 120 + i * (cell * Z / 2.2);
      g.drawImage(off, 0, 0, 24, 24, x, y + 10, 24 * 4.5, 24 * 4.5);
      g.fillStyle = fl.light ? '#1a1622' : '#e4e2ea'; g.font = '10px monospace';
      g.fillText(it[0], x, y + 140);
    });
  });
  return cv.toDataURL('image/png');
})()`;

await withPage({ w: 1280, h: 720, dpr: 1, mobile: false, root, timeoutMs: 150000 }, async (page) => {
  await page.sleep(300);
  for (const [part, code] of [['actors', ACTORS], ['weapons', WEAPONS]]) {
    if (!parts.includes(part)) continue;
    const url = await page.evaluate(code, true);
    fs.writeFileSync(path.join(outDir, `${tag}-${part}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', `${tag}-${part}.png`);
  }
});
