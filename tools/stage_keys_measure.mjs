// R6 stage value keys: what reads on which floor.
//   node tools/stage_keys_measure.mjs           the table (markdown)
//   node tools/stage_keys_measure.mjs --json    the same, machine-readable
// For every stage: the floor's large tones (base, the two underlay patches,
// the feature tones), each under all six wave lights. For every thing that
// lies on the ground: its body colour and its edge colour (the dark outline
// the sprite cache bakes, a shot's pale rim, the hero's keyline on a light
// floor), and the WCAG contrast of each against the floor's worst tone.
// A thing READS when its body or its edge holds 3:1 against every tone.
// test/test_stage_keys.mjs holds every row to that.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// HORDES_MEASURE_ROOT=<tree> measures another tree (the "before" numbers).
const ROOT = process.env.HORDES_MEASURE_ROOT
  ? path.resolve(process.env.HORDES_MEASURE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { CONFIG: C } = await imp('src/config.js');
const WG = await imp('src/world_ground.js');
const { STAGE_GROUND_PALETTES, stageGroundPalette } = WG;
const RJS = await imp('src/render.js');
const { HERO_WARM, SHOT_PAINT, GEM_TIERS, GEM_RICH } = RJS;
const { PORTAL_PALETTE } = await imp('src/art/portal.js');
// The tree's own number colours and chest wood (R6 palette moved them).
const FR = await imp('src/fx/feel_render.js');
const NUM = FR.NUM_PAL || { hit: { 1: '#ffffff' }, crit: { 1: '#ffd23e' }, hurt: { 1: '#ff4a5e' } };
const CHEST_WOOD = (await imp('src/art/chests.js')).CHEST_ART.common.closed.palette[3];
const { actorBodyColours, muted } = await imp('tools/m2_contrast.mjs');
const { ENEMY_SPRITES } = await imp('src/enemy_sprites.js');
export function relLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
// Light floors: the tree's own rule (none before R6: every floor was dark).
const groundIsLight = WG.groundIsLight || (() => false);
// The shot's rim: R6 gives shots a dark rim on a light floor.
// (the tree's own shot styles: the pale rim, and R6's dark rim on a light floor)
// The ring the floor touches: the outer one when there are two.
const shotRim = (light) => (light && RJS.STYLE_SHOT_LIGHT ? RJS.STYLE_SHOT_LIGHT.outline2 || RJS.STYLE_SHOT_LIGHT.outline : (RJS.STYLE_SHOT ? RJS.STYLE_SHOT.outline : '#fff0f4'));

export const ratio = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const OUTLINE_DARK = '#0b0912';

// The floor tones of a stage that cover an area (not a 1 px line): base,
// patch, patch2 and the feature's light and dark tones, under every wave light.
// A crack's glowing core is a line and is listed apart.
export function floorTones(stage) {
  const out = new Set();
  for (const t of C.GROUND.THEMES) {
    const P = stageGroundPalette(stage, t);
    out.add(P.base); out.add(P.patch); out.add(P.patch2);
    if (P.feat && P.feat.kind !== 'cracks') { out.add(P.feat.light); out.add(P.feat.dark); }
  }
  return [...out];
}

// Read the colour of a shot orb: the painter's body fill.
function shotBody(kind) {
  let body = null;
  const g = { set fillStyle(v) { if (!body) body = v; }, fillRect() {} };
  SHOT_PAINT[kind](g, 0, 0);
  return body;
}

// Everything that lies on the ground: [label, body, edge, note].
export function groundThings(light) {
  const rows = [
    ['hero ring', HERO_WARM, light ? OUTLINE_DARK : 'rgba', light ? 'dark keyline both sides' : 'dark line under it'],
    ['hero outline', HERO_WARM, light ? OUTLINE_DARK : HERO_WARM, light ? 'warm ring + dark keyline' : 'warm ring'],
    ['hero mark (arrow)', HERO_WARM, OUTLINE_DARK, 'dark edged'],
    ['enemy shot (bolt)', shotBody('bolt'), shotRim(light), light ? 'dark rim' : 'pale rim'],
    ['enemy shot (spit)', shotBody('spit'), shotRim(light), light ? 'dark rim' : 'pale rim'],
    ['gem small', GEM_TIERS[0][0], OUTLINE_DARK, ''],
    ['gem mid', GEM_TIERS[1][0], OUTLINE_DARK, ''],
    ['gem large', GEM_TIERS[2][0], OUTLINE_DARK, ''],
    ['rich gem', GEM_RICH.body, OUTLINE_DARK, ''],
    ['potion hp', '#ff4a5e', OUTLINE_DARK, ''],
    ['potion mp', '#4a8cff', OUTLINE_DARK, ''],
    ['chest', CHEST_WOOD, '#0d0a06', 'in-sprite outline'],
    ['number hit', NUM.hit[1], OUTLINE_DARK, ''],
    ['number crit', NUM.crit[1], OUTLINE_DARK, ''],
    ['number hurt', NUM.hurt[1], OUTLINE_DARK, ''],
    ['portal', PORTAL_PALETTE[3], PORTAL_PALETTE[1], 'swirl ' + PORTAL_PALETTE[6]],
  ];
  // The 'rgba' edge of the dark-floor ring is 'rgba(8,6,14,0.8)': near the outline.
  for (const r of rows) if (r[2] === 'rgba') r[2] = '#0a0810';
  const bodies = actorBodyColours();
  for (const id of Object.keys(ENEMY_SPRITES)) rows.push(['enemy ' + id, muted(bodies[id]), OUTLINE_DARK, 'as drawn (muted)']);
  return rows;
}

// The bar each thing must clear: 3:1, except the horde as drawn (muted), held
// to 2.75:1 as test/test_actor_contrast.mjs holds it, and the chest, whose
// wood was under 3:1 on seven of eight floors before R6 (it reads by its
// metal bands and its glint): held to 2.2:1, its old worst.
export function needOf(label) {
  if (label.startsWith('enemy ') && !label.startsWith('enemy shot')) return 2.75;
  if (label === 'chest') return 2.2;
  return 3;
}

export function stageTable() {
  const out = {};
  for (const st of Object.keys(STAGE_GROUND_PALETTES)) {
    const light = groundIsLight(st);
    const tones = floorTones(st);
    const rows = [];
    for (const [label, body, edge, note] of groundThings(light)) {
      const b = Math.min(...tones.map(t => ratio(body, t)));
      const e = Math.min(...tones.map(t => ratio(edge, t)));
      const need = needOf(label);
      rows.push({ label, body, edge, bodyRatio: +b.toFixed(2), edgeRatio: +e.toFixed(2), need, reads: Math.max(b, e) >= need, note });
    }
    out[st] = { light, base: STAGE_GROUND_PALETTES[st].base, baseLum: +relLum(STAGE_GROUND_PALETTES[st].base).toFixed(3), tones, rows };
  }
  return out;
}

// CIE L*a*b* of a colour and the distance between two (CIE76).
export function lab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin((n >> 16) & 255), G = lin((n >> 8) & 255), B = lin(n & 255);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const deltaE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const T = stageTable();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(T)); process.exit(0); }
  for (const [st, s] of Object.entries(T)) {
    console.log('## ' + st + ' base ' + s.base + ' (lum ' + s.baseLum + ', ' + (s.light ? 'light: edges carry' : 'dark: bodies carry') + ')');
    const bad = s.rows.filter(r => !r.reads);
    console.log('  reads: ' + (s.rows.length - bad.length) + '/' + s.rows.length + (bad.length ? '  SHORT: ' + bad.map(r => r.label + ' ' + r.bodyRatio + '/' + r.edgeRatio + ' (need ' + r.need + ')').join(', ') : ''));
  }
  const ids = Object.keys(STAGE_GROUND_PALETTES);
  let min = 99, at = '';
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = deltaE(STAGE_GROUND_PALETTES[ids[i]].base, STAGE_GROUND_PALETTES[ids[j]].base);
    if (d < min) { min = d; at = ids[i] + ' / ' + ids[j]; }
  }
  console.log('closest pair of bases: ' + at + ' dE ' + min.toFixed(1));
}
