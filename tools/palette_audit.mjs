// R6 master palette: the audit. Every colour the game draws in a fight, who
// uses it, and how near it sits to a reserved family (danger red-orange,
// reward cyan-teal, hero warm white).
//   node tools/palette_audit.mjs [--root <tree>] [--json out.json]
// Two sources:
//   1. the art tables (pilots, enemies, bosses, the Maw, shots, gems,
//      potions, chests, the portal, numbers, elite marks), each colour with
//      its owner and the meaning it is allowed to carry;
//   2. a live fight frame: the real renderer draws a busy scene (every enemy
//      type, elites, every boss, the Maw, every weapon of the player, shots,
//      gems, chests, the portal, numbers) into a recording context, and every
//      fill and stroke colour set before the HUD is kept with the source line
//      that set it.
// The reserved families and the distance (CIEDE2000) come from the measured
// tree's src/palette.js when it has one, else from this tree's.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(opt('--root') || HERE);
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const PAL = fs.existsSync(path.join(ROOT, 'src/palette.js')) ? await imp('src/palette.js') : await import(pathToFileURL(path.join(HERE, 'src/palette.js')).href);
const ownPalette = fs.existsSync(path.join(ROOT, 'src/palette.js'));

// ---- 1. the art tables --------------------------------------------------------
// rows: { hex, owner, group, role, allow } ; allow = the reserved family the
// owner may use (null = none).
const rows = [];
const norm = (h) => {
  if (typeof h !== 'string') return null;
  h = h.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(c => c + c).join('');
  return /^#[0-9a-f]{6}$/.test(h) ? h : null;
};
const add = (hex, owner, group, role, allow = null) => { const h = norm(hex); if (h) rows.push({ hex: h, owner, group, role, allow }); };
const addPalette = (pal, owner, group, allow = null, roles = {}) => {
  for (const [k, v] of Object.entries(pal || {})) add(v, owner, group, roles[k] || 'key ' + k, allow);
};

const CH = await imp('src/character_sprites.js');
for (const [id, s] of Object.entries(CH.CHARACTER_SPRITES)) addPalette(s.palette, 'pilot ' + id, 'pilot');
const RJS = await imp('src/render.js');
add(RJS.HERO_WARM, 'hero mark and outline', 'hero', 'mark', 'HERO');
const SP = await imp('src/sprites.js');
addPalette(SP.BOSS_SPRITE.palette, 'boss (default look)', 'boss', 'DANGER');
const ES = await imp('src/enemy_sprites.js');
for (const [id, s] of Object.entries(ES.ENEMY_SPRITES)) addPalette(s.palette, 'enemy ' + id, 'enemy');
const B = await imp('src/bosses.js');
for (const [id, s] of Object.entries(B.BOSS_SPRITES)) addPalette(s.palette, 'boss ' + id, 'boss', 'DANGER');
const FB = await imp('src/final_boss.js');
addPalette(FB.FINAL_BOSS_SPRITE.palette, 'the Maw', 'boss', 'DANGER');
const ET = await imp('src/enemy_types.js');
add(ET.ELITE_LOOK.trim, 'elite mark (gold ring)', 'elite', 'ring', 'DANGER');
add(ET.ELITE_LOOK.accent, 'elite mark (accent)', 'elite', 'accent', 'DANGER');
// Shots: read each painter's fills.
for (const [k, paint] of Object.entries(RJS.SHOT_PAINT)) {
  const g = { set fillStyle(v) { add(v, 'enemy shot ' + k, 'shot', 'orb', 'DANGER'); }, fillRect() {} };
  paint(g, 0, 0);
}
RJS.GEM_TIERS.forEach((t, i) => t.forEach((c, j) => add(c, 'gem tier ' + (i + 1), 'pickup', ['body', 'hi', 'lo'][j], 'REWARD')));
for (const [k, v] of Object.entries(RJS.GEM_RICH)) add(v, 'rich gem', 'pickup', k, 'REWARD');
const CA = await imp('src/art/chests.js');
for (const [id, a] of Object.entries(CA.CHEST_ART)) addPalette(a.palette, 'chest ' + id, 'pickup', 'REWARD');
const PO = await imp('src/art/portal.js');
addPalette(PO.PORTAL_PALETTE, 'portal', 'portal', 'REWARD');

// ---- 2. a live fight frame -----------------------------------------------------
const { boot } = await imp('test/_harness.mjs');
const H = await boot();
const T = H.T, S = H.state;
T.stages.select('VERDANT_HOLLOW');
T.startRun();
H.pump(30);
const W = await imp('src/weapons.js');
const p = S.player;
p.weapons = Object.keys(W.WEAPONS).map(id => { try { const w = W.makeWeapon(id); w.level = 4; return w; } catch { return null; } }).filter(Boolean);
p.hp = p.stats.maxHp = 1e9;
let seed = 7;
const r = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
const ids = Object.keys(ES.ENEMY_SPRITES);
const live = [];
for (let i = 0; i < 80; i++) {
  const a = r() * Math.PI * 2, d = 30 + r() * 120;
  const e = ET.makeTypedEnemy(ids[i % ids.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, S.time, { elite: i % 9 === 0 });
  e.hp = e.maxHp = 1e7;
  if (i % 9 === 0 && i % 2 === 0) e.eliteMod = ['SWIFT', 'SPLITTING', 'VAMPIRIC'][i % 3];
  S.enemies.push(e); live.push(e);
}
for (let i = 0; i < 60; i++) S.gems.push({ x: p.x + (r() - 0.5) * 200, y: p.y + (r() - 0.5) * 140, xp: [1, 8, 30, 200][i % 4], age: r(), rich: i % 7 === 0 ? 1 + (i % 4) : 0 });
for (let i = 0; i < 8; i++) S.enemyShots.push({ x: p.x + 40 + i * 6, y: p.y - 30, vx: -30, vy: 10, damage: 1, age: 0.2, kind: ['spit', 'bolt', 'nova', 'maw'][i % 4], src: {} });
// Each boss once, the Maw once (drawn by the renderer from their own sprite).
const bossIds = Object.keys(B.BOSSES || {});
const bosses = [];
for (const id of bossIds) {
  try { const bo = B.makeBoss ? B.makeBoss(id, p.x + 60, p.y + 40) : null; if (bo) { bo.hp = bo.maxHp = 1e9; S.enemies.push(bo); bosses.push(bo); } } catch {}
}
try { const m = FB.makeFinalBoss(p.x - 90, p.y - 60); m.hp = m.maxHp = 1e9; S.enemies.push(m); } catch {}

const rec = [];
let recording = false, hud = false;
const R = T.renderer;
const realCtx = R.ctx;
const srcLine = () => {
  const st = new Error().stack.split('\n').slice(2);
  for (const l of st) {
    const m = l.match(/\/(src\/[^:]+):(\d+)/);
    if (m && !m[1].endsWith('sprite_cache.js')) return m[1] + ':' + m[2];
  }
  return '?';
};
const record = (v, kind) => {
  if (!recording || hud) return;
  if (typeof v !== 'string') return;
  let h = norm(v);
  let alpha = 1;
  if (!h) {
    const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
    if (!m) return;
    h = PAL.rgbHex([+m[1], +m[2], +m[3]]);
    alpha = m[4] == null ? 1 : +m[4];
  }
  rec.push({ hex: h, alpha, src: srcLine(), kind });
};
R.ctx = new Proxy(realCtx, {
  get(t, prop) { return Reflect.get(t, prop); },
  set(t, prop, v) {
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') record(v, prop);
    return true;
  },
});
const realHud = R.drawHudChrome;
R.drawHudChrome = function (...a) { hud = true; return realHud.apply(this, a); };
// Sixty frames of the fight so every weapon fires and hits.
for (let f = 0; f < 60; f++) {
  hud = false; recording = true;
  H.pump(1);
  for (const e of live) if (S.enemies.indexOf(e) < 0) S.enemies.push(e);
}
recording = false;
R.ctx = realCtx;

// Group the live colours by source line.
const liveBy = new Map();
for (const x of rec) {
  const k = x.hex + '@' + x.src;
  const o = liveBy.get(k) || { hex: x.hex, src: x.src, n: 0, alpha: x.alpha };
  o.n++; liveBy.set(k, o);
  if (x.alpha < o.alpha) o.alpha = x.alpha;
}

// ---- the report ---------------------------------------------------------------
const meaning = (hex) => {
  const n = PAL.nearestReserved(hex);
  return { fam: n.de < PAL.RESERVED_DE ? n.fam : null, de: +n.de.toFixed(1), step: n.step };
};
const table = rows.map(x => ({ ...x, ...meaning(x.hex), inPal: PAL.inPalette(x.hex) }));
const liveRows = [...liveBy.values()].map(x => ({ ...x, ...meaning(x.hex), inPal: PAL.inPalette(x.hex) }));
const distinct = new Set([...table.map(x => x.hex), ...liveRows.map(x => x.hex)]);
const misuse = table.filter(x => x.fam && x.fam !== x.allow);
// Pilots vs enemies, shots, numbers: shared body colours (CIEDE2000 under 6).
const bodyOf = (spr) => { const cnt = {}; for (const row of spr.frames[0]) for (const v of row) if (v) cnt[v] = (cnt[v] || 0) + 1; return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => norm(spr.palette[k])); };
const others = [];
// Body colours: the two most-painted colours of each sprite; a shot's orb fill.
for (const [id, s] of Object.entries(ES.ENEMY_SPRITES)) for (const h of bodyOf(s)) others.push({ who: 'enemy ' + id, hex: h });
for (const h of bodyOf(SP.BOSS_SPRITE)) others.push({ who: 'boss (default look)', hex: h });
for (const [id, s] of Object.entries(B.BOSS_SPRITES)) for (const h of bodyOf(s)) others.push({ who: 'boss ' + id, hex: h });
for (const h of bodyOf(FB.FINAL_BOSS_SPRITE)) others.push({ who: 'the Maw', hex: h });
for (const [k, paint] of Object.entries(RJS.SHOT_PAINT)) { let b = null; paint({ set fillStyle(v) { if (!b) b = norm(v); }, fillRect() {} }, 0, 0); others.push({ who: 'enemy shot ' + k, hex: b }); }
let numPal = null;
try { numPal = (await imp('src/fx/feel_render.js')).NUM_PAL; } catch {}
for (const [k, v] of Object.entries(numPal || { hit: { 1: '#ffffff' }, crit: { 1: '#ffd23e' }, hurt: { 1: '#ff4a5e' } })) others.push({ who: 'number ' + k, hex: norm(v[1]) });
const shares = [];
for (const [id, s] of Object.entries(CH.CHARACTER_SPRITES)) {
  for (const h of bodyOf(s)) for (const o of others) {
    const d = PAL.deltaE(h, o.hex);
    if (d < 8) shares.push({ pilot: id, body: h, who: o.who, hex: o.hex, de: +d.toFixed(1) });
  }
}
const out = {
  root: ROOT, ownPalette, reservedDE: PAL.RESERVED_DE, distinct: distinct.size,
  tableColours: new Set(table.map(x => x.hex)).size, liveColours: new Set(liveRows.map(x => x.hex)).size,
  notInPalette: [...distinct].filter(h => !PAL.inPalette(h)).length,
  table, live: liveRows.sort((a, b) => a.src.localeCompare(b.src)), misuse, shares, bosses: bosses.length,
};
const jp = opt('--json');
if (jp) fs.writeFileSync(jp, JSON.stringify(out, null, 1));
console.log(`root ${ROOT}\ndistinct fight colours ${out.distinct} (art tables ${out.tableColours}, live frame ${out.liveColours}); not on the palette ${out.notInPalette}`);
console.log(`art colours inside a reserved family without its meaning: ${misuse.length}`);
for (const m of misuse) console.log(`  ${m.owner} ${m.role} ${m.hex} -> ${m.fam} (dE ${m.de} to ${m.step})`);
const liveMis = liveRows.filter(x => x.fam);
console.log(`live colours inside a reserved family: ${liveMis.length}`);
for (const m of liveMis) console.log(`  ${m.src} ${m.hex} a${m.alpha} -> ${m.fam} (dE ${m.de})`);
console.log(`pilot body colours shared (dE < 8): ${shares.length}`);
for (const s of shares) console.log(`  ${s.pilot} ${s.body} ~ ${s.who} ${s.hex} (dE ${s.de})`);
process.exit(0);
