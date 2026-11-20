// R6 master palette: move the fight's colours onto src/palette.js.
//   node tools/palette_snap.mjs          dry run: every literal, its snap, the distance
//   node tools/palette_snap.mjs --write  rewrite the literals in place
// For each quoted hex literal in the ranges below: the nearest palette colour
// (CIEDE2000) among the unreserved ramps; when the line may carry a reserved
// meaning (`allow`) and the colour already sits in that family, the nearest
// step of that family instead. BY_EYE then replaces the tool's answer where it
// was wrong to look at (the reason is written beside each one).
// Only colour literals change: same length, so line numbers and CRLF stay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARED, OWNED, RESERVED, RESERVED_DE, deltaE, nearest, nearestReserved } from '../src/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// [file, begin, end, allow, { line: allow }, follow]
// The ranges are named by ANCHORS, not line numbers, so an edit that moves
// lines does not move them. An anchor is a piece of text that must sit on
// exactly one line of the file: `begin` is the first line of the range, `end`
// the last (both included; null = the start or the end of the file). The
// exceptions are keyed the same way, by a piece of text found on exactly one
// line inside the range. resolvePlan() fails, naming the anchor, when one is
// missing or found twice (test/test_palette.mjs).
export const PLAN = [
  ['src/character_sprites.js', null, null, null],              // the four pilots (12 and 16 px): never the hero mark's colour
  ['src/art/portraits.js', "'13222226667444422777772666666661',", 'export const CHARACTER_IDS =', null, {}, 'follow'], // their menu busts: the same moves as the pilots
  ['src/sprites.js', "'......55..',", '[0,0,0,1,2,0,0,0],', null],  // the eight horde sprites
  ['src/sprites.js', 'export const BOSS_SPRITE = {', 'box: { w: 24, h: 24 },', null, { '// 4: the eyes': 'DANGER' }], // the default boss look; its eyes are a threat mark
  ['src/sprites.js', 'const FLAME_PALETTE = {', 'const FLAME_PALETTE = {', null], // flames
  ['src/enemy_sprites.js', 'const PILLAR_B = [', '    frameCount: frames.length,', null], // PILLAR, SHRIKE
  ['src/enemy_types.js', '//   2x2 "eye" or core pixel near center', 'const count = (VARIANTS[typeId] || []).length + 1;', null], // LOOKs, variants, the elite gold
  ['src/bosses.js', 'const GRAVELMAW_FRAMES = [', '  HERALD:       makeBossSprite(', null, {   // boss eyes are threat marks
    "4: '#ff4a14',  // eyes (GRAVELMAW)": 'DANGER', "5: '#ff4a14',  // eyes (CHOIR_MOTHER)": 'DANGER',
    "7: '#ff4a14',  // eyes (PYRAXIS)": 'DANGER', "4: '#ff4a14',  // ember eyes": 'DANGER' }],
  ['src/final_boss.js', "    '......21..21.21..',", '})();', null, { '// eye glow': 'DANGER', '// burning core': 'DANGER' }], // the Maw's eye and core
  ['src/render.js', '// PORT SLICE K dressing (painter only', '// ---- cached pickup / shot painters ---', null], // the player's weapons, chest burst
  ['src/render.js', '// (outline baked) and falls back to calling it directly when headless.', '    g.fillRect(x - 2, y - 2, 5, 6);', ['REWARD', 'GEM']], // gems, rich gems
  ['src/render.js', '    g.fillRect(x - 1, y - 4, 3, 2);', '// drawGrid-shaped blit for the painters that take a grid painter', 'POTION'], // potions
  ['src/render.js', "// green spit and violet bolt wore the gems' colours", 'export { SHOT_PAINT, GEM_TIERS };', 'DANGER'], // enemy shots
  ['src/render.js', '// truth (contact/targeting read that point)', 'const pilotPalette = pilotSpr ? pilotSpr.palette : PALETTE;', null, { // enemies, effects; the Maw's telegraph
    "blitGlow(g, fb.telegraph ? '#ff4a14'": 'DANGER', "mawTele ? '#ff4a14'": 'DANGER' }],
  ['src/fx/feel_render.js', "k: G(['101', '101', '110', '101', '101'])", 'for (const b of f.bursts) drawBurst(g, b, cam);', null], // numbers, pops
  ['src/fx/feel.js', 'return f.seed / 4294967296;', "pushCapped(f.bursts, { kind: 'pickup'", null, { // sparks; the gem pickup spark
    "addSparks(f, p.x, p.y + 2, '#4dffd2'": 'REWARD', "p.potions.hp > f.potHp ? '#e06a74'": 'POTION' }],
  ['src/art/portal.js', '//       6 vortex cyan, 7 runes/embers gold.', 'export const PORTAL_ART = makeFrames({', 'REWARD'], // the portal
];

// The line of `anchor` in `lines` (1-based), searching lines from..to (1-based,
// inclusive). Throws a message naming the anchor when it is missing or doubled.
function anchorLine(file, lines, anchor, what, from = 1, to = lines.length) {
  const at = [];
  for (let i = from - 1; i < to && i < lines.length; i++) if (lines[i].includes(anchor)) at.push(i + 1);
  if (at.length === 0) throw new Error(`palette plan: ${what} anchor not found in ${file}: ${JSON.stringify(anchor)}`);
  if (at.length > 1) throw new Error(`palette plan: ${what} anchor found ${at.length} times in ${file} (lines ${at.join(', ')}): ${JSON.stringify(anchor)}`);
  return at[0];
}
// The plan with its anchors resolved against the files as they are now:
// [{ file, from, to, allow, perLine: { line: allow }, follow }] (lines 1-based).
// read(file) gives a file's text (the repository's by default; a test passes a
// scratch copy).
export function resolvePlan(read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'), plan = PLAN) {
  return plan.map(([file, begin, end, allow, per = {}, follow]) => {
    const lines = read(file).split('\n');
    const from = begin == null ? 1 : anchorLine(file, lines, begin, 'begin');
    const to = end == null ? lines.length : anchorLine(file, lines, end, 'end');
    if (to < from) throw new Error(`palette plan: in ${file} the end anchor ${JSON.stringify(end)} (line ${to}) comes before the begin anchor (line ${from})`);
    const perLine = {};
    for (const [a, al] of Object.entries(per)) perLine[anchorLine(file, lines, a, 'exception', from, to)] = al;
    return { file, from, to, allow, perLine, follow };
  });
}

// The tool's answer, corrected by eye: { file: { old: new } } for every use of
// a colour in that file's ranges. Only a new --write run reads it, and it only
// moves colours not yet on the palette. (The first pass's corrections for one
// line each are in the files now; they are not kept here, so the tool names no
// line by its number.)
export const BY_EYE = {
  'src/character_sprites.js': {
    // skin: one tan, never the hero mark's warm white
    '#e8b890': '#cc9a78', '#f2c9a0': '#cc9a78', '#f0d0a8': '#cc9a78', '#e8c890': '#cc9a78', '#e8c8e0': '#cc9a78',
    '#f0d2b8': '#cc9a78', '#e8c09a': '#cc9a78', '#f2cfa6': '#cc9a78',
    '#c9a06a': '#a69070',                              // WITCH's staff wood stays apart from her skin
    // WITCH: pale violet robe, lighter than every violet boss
    '#a070f0': '#b49ad4', '#a276f4': '#b49ad4', '#d0b0ff': '#e4e2ea', '#d2b6ff': '#e4e2ea',
    // ROGUE: the hood a moss green light enough for the darkest floors
    '#2fa85a': '#86a062', '#3f9a4c': '#86a062',
    '#3a2452': '#160e24', '#2e1f52': '#160e24',        // WITCH's hair: darker than the Maw's shade
    // PALADIN: cream-gold plate (pure white is the hit numbers' colour)
    '#f4f0e4': '#f8e098', '#f6f2e6': '#f8e098', '#ffe07a': '#f0c860', '#ffe28a': '#f0c860',
  },
  'src/art/portraits.js': {
    '#c9966e': '#a69070', '#c99a6e': '#a69070',        // skin in shadow, under the new tan
  },
  'src/render.js': {
    '#fff0f4': '#ffffff',                              // the shot's pale rim stays white
    '#d8f0ff': '#d8f0ff',                              // the mid gem keeps its highlight (GEM)
    '#b03a1a': '#a46a16',                              // fire's dark edge is ember, not blood
  },
  'src/fx/feel_render.js': { '#ff4a5e': '#e06a74' },  // the hurt number: crimson
};

// allow: a reserved family, an owned ramp, or a list of them.
function snap(hex, allow) {
  const al = allow == null ? [] : [].concat(allow);
  const r = nearestReserved(hex);
  if (r.de < RESERVED_DE && al.includes(r.fam)) return { ...nearest(hex, RESERVED[r.fam]), fam: r.fam };
  const list = [...SHARED];
  for (const a of al) if (OWNED[a]) list.push(...OWNED[a]);
  return { ...nearest(hex, list), fam: null };
}

// Run only as a script (test/test_palette.mjs imports PLAN).
const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
const write = MAIN && process.argv.includes('--write');
const rows = [];
const moves = new Map();   // old -> new, for a range that follows the pilots
for (const { file, from, to, allow, perLine, follow } of MAIN ? resolvePlan() : []) {
  const p = path.join(ROOT, file);
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split('\n');
  const last = to;
  const eye = BY_EYE[file] || {};
  for (let i = from - 1; i < last && i < lines.length; i++) {
    const ln = i + 1;
    const al = ln in perLine ? perLine[ln] : allow;
    lines[i] = lines[i].replace(/(['"])#([0-9a-fA-F]{6})\1/g, (m, q, h) => {
      const old = '#' + h.toLowerCase();
      const s = snap(old, al);
      let to = s.hex, why = 'tool';
      if (eye[old]) { to = eye[old]; why = 'eye'; }
      else if (follow && moves.has(old)) { to = moves.get(old); why = 'follow'; }
      if (file === 'src/character_sprites.js' && !moves.has(old)) moves.set(old, to);
      rows.push({ file, ln, old, to, de: deltaE(old, to), why, fam: s.fam });
      return q + to + q;
    });
  }
  if (write) fs.writeFileSync(p, lines.join('\n'));
}
if (MAIN) for (const r of rows) if (r.old !== r.to) console.log(`${r.file}:${r.ln} ${r.old} -> ${r.to} dE ${r.de.toFixed(1)} ${r.why}${r.fam ? ' ' + r.fam : ''}`);
const moved = rows.filter(r => r.old !== r.to);
if (MAIN) console.log(`${rows.length} literals, ${moved.length} moved, mean dE ${(moved.reduce((a, r) => a + r.de, 0) / Math.max(1, moved.length)).toFixed(1)}${write ? ' (written)' : ' (dry run)'}`);
