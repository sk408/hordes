// HORDES - tools/field_sheet.mjs: every actor as the game draws it (the sprite
// cache's baked outline, rim light, shadow, horde mute, elite and boss tells)
// on each stage's floor, enlarged. For judging contrast and silhouettes.
//   HORDES_CHROME=<chrome.exe> node tools/field_sheet.mjs <tag> [outDir] [sets] [zoom] [only]
// sets: pilots,enemies,elites,bosses,maw (default all). zoom: block size
// (default 4 = a 1280x720 desktop; the maw sheet halves it). only: a label
// filter (comma list). Writes <outDir>/<tag>-field-<set>.png.
// Each cell is one stage's floor under its lightest wave light: base tone,
// with the two underlay patch tones down the right side.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] || 'sheet';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'docs/art/release-fixes'));
const sets = (process.argv[4] || 'pilots,enemies,elites,bosses,maw').split(',');
const ZOOM = +(process.argv[5] || 4);
const ONLY = process.argv[6] || '';
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const PAGE = `<!doctype html><meta charset="utf-8"><title>field sheet</title>
<style>body{margin:0;background:#15121c}canvas{display:block;image-rendering:pixelated}</style>
<canvas id="c"></canvas>
<script type="module">
const q = new URLSearchParams(location.search);
const SET = q.get('set'), Z = +q.get('z') || 4, ONLY = q.get('only') || '';
const { CONFIG: C } = await import('/src/config.js');
const SC = await import('/src/sprite_cache.js');
const { Renderer } = await import('/src/render.js');
const { STAGE_GROUND_PALETTES, stageGroundPalette } = await import('/src/world_ground.js');
const { ENEMY_SPRITES } = await import('/src/enemy_sprites.js');
const { ENEMY_TYPES, makeTypedEnemy } = await import('/src/enemy_types.js');
const { BOSS_SPRITES } = await import('/src/bosses.js');
const { FINAL_BOSS_SPRITE } = await import('/src/final_boss.js');
const { CHARACTER_SPRITES } = await import('/src/character_sprites.js');
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
// Each stage under the wave theme that makes its floor lightest.
const STAGES = Object.keys(STAGE_GROUND_PALETTES).map((id) => {
  let best = null;
  for (const t of C.GROUND.THEMES) { const P = stageGroundPalette(id, t); if (!best || lum(P.base) > lum(best.base)) best = P; }
  return { id, pal: best };
});
const draw = Renderer.prototype.drawActor;
const rows = [];   // { label, w, h, paint(g, cx, cy) } with (cx, cy) the actor's centre
const actor = (label, spr, e, frame) => rows.push({ label, w: spr.box.w + 14, h: spr.box.h + 20,
  paint: (g, cx, cy) => draw.call(null, g, { age: frame / 6 + 0.01, hp: 1, maxHp: 1, x: 0, ...e }, spr, cx, cy, { time: 0.3 }) });
if (SET === 'pilots') {
  for (const [id, s] of Object.entries(CHARACTER_SPRITES)) s.frames.forEach((f, i) => rows.push({ label: id + ' ' + 'ABC'[i], w: s.w + 10, h: s.h + 12,
    paint: (g, cx, cy) => SC.blitGrid(g, f, s.palette, cx - (s.w >> 1), cy - (s.h >> 1), SC.actorStyle(false, false, '#f4f8ff')) }));
} else if (SET === 'enemies' || SET === 'elites') {
  for (const [id, s] of Object.entries(ENEMY_SPRITES)) {
    const e = makeTypedEnemy(id, 0, 0, 0, { elite: SET === 'elites' });
    const n = SET === 'elites' ? 1 : Math.min(2, s.frames.length);
    for (let i = 0; i < n; i++) actor(id + (SET === 'elites' ? ' elite' : ' ' + 'AB'[i]), s, e, i);
    if (SET === 'elites') rows[rows.length - 1].w = Math.round(s.box.w * 1.5) + 16, rows[rows.length - 1].h = Math.round(s.box.h * 1.5) + 24;
  }
} else if (SET === 'bosses') {
  for (const [id, s] of Object.entries(BOSS_SPRITES)) {
    s.frames.forEach((f, i) => actor(id + ' ' + 'AB'[i], s, { boss: true }, i));
    if (s.tell) actor(id + ' tell', s, { boss: true, telegraph: true }, 0);
  }
} else if (SET === 'maw') {
  const s = FINAL_BOSS_SPRITE;
  s.frames.forEach((f, i) => rows.push({ label: 'MAW ' + 'AB'[i], w: s.box.w + 8, h: s.box.h + 8,
    paint: (g, cx, cy) => SC.blitGrid(g, f, s.palette, cx - s.anchor.x, cy - s.anchor.y, SC.actorStyle(false, false, null)) }));
}
const list = rows.filter(r => !ONLY || ONLY.split(',').some(o => r.label.includes(o)));
const LABEL = 150, GAP = 4;
const c = document.getElementById('c'), g = c.getContext('2d');
const maxW = Math.max(...list.map(r => r.w));
c.width = LABEL + STAGES.length * (maxW * Z + GAP) + 8;
c.height = 22 + list.reduce((a, r) => a + r.h * Z + GAP, 0) + 8;
g.fillStyle = '#15121c'; g.fillRect(0, 0, c.width, c.height);
g.font = '11px monospace'; g.fillStyle = '#e8e0f0';
STAGES.forEach((s, i) => g.fillText(s.id.replace('_', ' ').slice(0, Math.floor(maxW * Z / 7)), LABEL + i * (maxW * Z + GAP), 14));
let y = 22;
for (const r of list) {
  g.fillStyle = '#e8e0f0'; g.fillText(r.label, 6, y + 14);
  STAGES.forEach((s, i) => {
    // Drawn under a Z scale, as the game draws its world layer (whole device
    // pixels per world pixel, no smoothing).
    g.save();
    g.beginPath(); g.rect(LABEL + i * (maxW * Z + GAP), y, maxW * Z, r.h * Z); g.clip();
    g.translate(LABEL + i * (maxW * Z + GAP), y); g.scale(Z, Z);
    g.imageSmoothingEnabled = false;
    g.fillStyle = s.pal.base; g.fillRect(0, 0, maxW, r.h);
    g.fillStyle = s.pal.patch; g.fillRect(maxW - 4, 0, 4, r.h >> 1);
    g.fillStyle = s.pal.patch2; g.fillRect(maxW - 4, r.h >> 1, 4, r.h - (r.h >> 1));
    r.paint(g, (maxW - 4) >> 1, (r.h >> 1) + 2);
    g.restore();
  });
  y += r.h * Z + GAP;
}
window.__done = list.length;
</script>`;

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
for (const set of sets) {
  await nap(400);
  const z = set === 'maw' ? Math.max(1, ZOOM >> 1) : ZOOM;
  const url = `field_sheet.html?set=${set}&z=${z}` + (ONLY ? '&only=' + encodeURIComponent(ONLY) : '');
  const extra = { '/field_sheet.html': PAGE };
  let W = 1000, H = 600;
  await withPage({ w: 800, h: 400, dpr: 1, mobile: false, url, extra }, async (page) => {
    await page.waitFor('window.__done !== undefined', 15000);
    W = await page.evaluate('document.getElementById("c").width');
    H = Math.min(6000, await page.evaluate('document.getElementById("c").height'));
    if (page.errors.length) console.log(set, 'errors:', page.errors.slice(0, 3));
  });
  await nap(400);
  await withPage({ w: W, h: H, dpr: 1, mobile: false, url, extra }, async (page) => {
    await page.waitFor('window.__done !== undefined', 15000);
    console.log(set, await page.evaluate('window.__done'), 'rows,', W + 'x' + H);
    await page.shot(`${tag}-field-${set}`);
  });
}
