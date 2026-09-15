// HORDES — ART FORMAT LINT (A1 art track). Self-contained, no runner:
//   node test/test_art_lint.mjs
//
// WHY THIS EXISTS: the A1 track ships ~100 integer-pixel layers across five new
// modules hand-authored in the game's own `grid` + `palette` format. A single
// ragged row, a palette key that no longer exists, or a string where a number
// belongs would render as invisible or corrupted art at runtime, silently. This
// file is the format contract, checked independently of the modules' own
// helpers (it re-implements the checks rather than trusting src/art/format.js).
import {
  ART_ASSETS, ART_SECTIONS, ART_COUNTS, ART_LIMITS,
  TROPHY_ART, TROPHY_IDS, TROPHY_FALLBACK_ID, trophyArt,
  CHARACTER_PORTRAITS, CHARACTER_IDS, characterPortrait,
  SHOP_ICONS, SHOP_ICON_IDS, SHOP_ICON_FALLBACK_ID, shopIcon,
  TITLE_ART, TITLE_LAYERS, TITLE_WIDTH, TITLE_HEIGHT, composeTitle, drawTitle,
  PORTAL_ART, PORTAL_BOX, portalFrame,
  APEX_ART, APEX_IDS, APEX_FALLBACK_ID, apexArt,
} from '../src/art/index.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  const brief = v => (v === null || typeof v !== 'object') ? JSON.stringify(v) : '[' + typeof v + ']';
  ok(actual === expected, msg + ' (got ' + brief(actual) + ', want ' + brief(expected) + ')');
}

// ---------------------------------------------------------------- contract --
// Hardcoded here on purpose: the test owns the contract, the module only holds
// a copy. If someone widens ART_LIMITS to make failing art pass, the equality
// assertion below fails.
const LIMITS = {
  TROPHY: { w: [32, 32], h: [32, 32] },
  PORTRAIT: { w: [32, 32], h: [32, 32] },
  SHOP_ICON: { w: [12, 16], h: [12, 16] },
  PORTAL: { w: [48, 48], h: [48, 48] },
  TITLE_LAYER: { w: [1, 480], h: [1, 300] },
};
const SECTION_LIMIT = {
  trophies: 'TROPHY', portraits: 'PORTRAIT', shop: 'SHOP_ICON',
  title: 'TITLE_LAYER', portal: 'PORTAL',
  // G25 slice 2: apex emblems are 32x32 showcase art — the SAME documented
  // box the trophy emblems use (they render through the same full-screen
  // showcase), so they inherit the TROPHY limit rather than minting a new one.
  apex: 'TROPHY',
};
const EXPECTED_TROPHIES = [
  'FIRST_BLOOD', 'KILLS_100', 'KILLS_1000', 'KILLS_10000', 'FIRST_BOSS',
  'BOSS_SLAYER_5', 'WAVE_5', 'WAVE_10', 'WAVE_20', 'SURVIVE_10MIN',
  'SURVIVE_20MIN', 'GOLD_10K', 'CHESTS_25', 'FIRST_EVOLUTION', 'MAX_WEAPON',
  'ALL_CHARACTERS', 'UNTOUCHED_WAVE', 'LEGENDARY_LOOT', 'SHOP_MASTER',
  'ARCADE_PASS', 'FULL_BUILD',
  'WAVE5_UNDER_3MIN', 'WAVE8_UNDER_5MIN', 'KILLS_500_UNDER_5MIN',
  'GOLD_600_UNDER_6MIN', 'LOCKED',
];
const EXPECTED_PORTRAITS = ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN'];
// meta.js SHOP_UPGRADES ids at the time of authoring: 19 stat/slot rows
// (dmg..arcade, incl. the three N1b mana buyables, the owner-ordered Split Shot
// cap row and the A1 'focus' engagement-radius line) + 7 priced weapon unlock
// rows + 3 elite unlock rows = 29 rows, PLUS the two STARTER_WEAPONS (VOLLEY,
// BOOMERANG) which have no shop row but do have art (the draft pool / roster UI
// uses the same icons), PLUS the two G25 APEX rows (their OWN catalogue,
// APEX_UPGRADES — same icon convention), PLUS the generic fallback = 34 keys.
const EXPECTED_SHOP = [
  'dmg', 'hp', 'potions', 'regen', 'focus', 'thrifty', 'well', 'siphon', 'xp', 'crit',
  'critdmg', 'greed', 'alchemy', 'scav', 'artifact', 'luck', 'split', 'slots', 'arcade',
  // G17 slice 2 breadth: 16 new stat rows (fleetfoot .. laststand), each with
  // its own authored icon — never the fallback.
  'fleetfoot', 'briarmail', 'lodestone', 'hollowpoint', 'ironheart', 'hairtrigger',
  'headsman', 'bloodpact', 'fanfire', 'deepread', 'aethertap', 'grandelixir',
  'deepfont', 'eagleeye', 'staticfield', 'laststand',
  'weapon_volley', 'weapon_orbit', 'weapon_boomerang', 'weapon_zap',
  'weapon_nova_pulse', 'weapon_scythe', 'weapon_seeker', 'weapon_mine',
  'weapon_beam',
  'elite_swift', 'elite_splitting', 'elite_vampiric',
  'apex_mark', 'apex_endless_fire',
  '__fallback',
];
// Art that legitimately has no SHOP_UPGRADES row today (starters are free).
const NO_SHOP_ROW_OK = ['weapon_volley', 'weapon_boomerang'];
// G25 slice 2: the apex emblems, keyed by the LIVE apex catalogue ids
// (meta.js APEX_UPGRADES). The mask is NOT re-authored — an unowned or
// unknown id resolves to the trophies' ONE LOCKED silhouette.
const EXPECTED_APEX = ['apex_mark', 'apex_endless_fire'];
const EXPECTED_LAYERS = ['SKY', 'HORIZON', 'CREST', 'PLATE', 'WORDMARK', 'RULE', 'FRAME'];
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ------------------------------------------------------------------ checks --
console.log('LIMITS (documented contract):');
{
  eq(Object.keys(LIMITS).length, Object.keys(ART_LIMITS).length, 'ART_LIMITS has the same keys as the test contract');
  for (const k of Object.keys(LIMITS)) {
    eq(JSON.stringify(ART_LIMITS[k]), JSON.stringify(LIMITS[k]), 'ART_LIMITS.' + k + ' matches the test contract');
  }
}

// verifyGrid — the format, cell by cell. `declaredRows` is the digit-string
// view the asset claims for THIS frame (flat assets: asset.rows; framed
// assets: asset.rows[frameIndex]).
function verifyGrid(label, grid, declaredRows, meta) {
  ok(Array.isArray(grid), label + ': grid is an array');
  if (!Array.isArray(grid) || grid.length === 0) { ok(false, label + ': grid non-empty'); return null; }
  const h = grid.length;
  const w = Array.isArray(grid[0]) ? grid[0].length : -1;
  ok(w > 0, label + ': first row non-empty');
  let ragged = 0, badCell = 0, nonZero = 0, used = new Set();
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    if (!Array.isArray(row)) { ok(false, label + ': row ' + y + ' is an array'); return null; }
    if (row.length !== w) ragged++;
    for (let x = 0; x < row.length; x++) {
      const v = row[x];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9) badCell++;
      else { if (v) { nonZero++; used.add(v); } }
    }
  }
  ok(ragged === 0, label + ': all ' + h + ' rows are the same width (' + w + ')');
  ok(badCell === 0, label + ': every cell is an integer palette index 0-9 (no strings, floats, blanks)');
  ok(nonZero > 0, label + ': grid actually has pixels');
  ok(Array.isArray(declaredRows), label + ': declares a rows array');
  eq((declaredRows || []).length, h, label + ': rows has one entry per row');
  let rowsOk = true, rowChars = 0;
  for (let i = 0; i < (declaredRows || []).length; i++) {
    const s = declaredRows[i];
    if (typeof s !== 'string' || !/^[0-9]+$/.test(s)) { rowChars++; continue; }
    if (s !== grid[i].join('') || s.length !== w) rowsOk = false;
  }
  eq(rowChars, 0, label + ': rows are pure digit strings (no whitespace or stray characters)');
  ok(rowsOk, label + ': rows are the derived digit-string view of the grid');
  if (meta) {
    eq(meta.w, w, label + ': declared w matches the pixels');
    eq(meta.h, h, label + ': declared h matches the pixels');
  }
  return { w, h, nonZero, used };
}

function verifyPalette(label, palette, used, maxKeys) {
  ok(palette && typeof palette === 'object' && !Array.isArray(palette), label + ': palette is an object');
  const keys = Object.keys(palette || {});
  ok(keys.length > 0, label + ': palette is non-empty');
  const badKey = keys.filter(k => !/^[1-9]$/.test(k));
  eq(badKey.length, 0, label + ': palette keys are 1-9 (0 is reserved for transparent)');
  const badCol = keys.filter(k => !HEX.test(String(palette[k])));
  eq(badCol.length, 0, label + ': every palette value is a #rgb/#rrggbb colour');
  const missing = [...(used || [])].filter(v => !palette[v]);
  eq(missing.length, 0, label + ': every index the pixels reference is defined in the palette');
  ok(keys.length <= 9, label + ': palette is within the legal 1-9 range (' + keys.length + ' keys)');
  if (maxKeys) ok(keys.length <= maxKeys, label + ': palette stays small (' + keys.length + ' <= ' + maxKeys + ')');
  return keys;
}

function verifyAsset(asset, sectionLabel, limitKey, opts = {}) {
  const label = sectionLabel + '/' + asset.id;
  ok(typeof asset.id === 'string' && asset.id.length > 0, label + ': has a string id');
  const framed = !!asset.frames;
  const frames = asset.frames || [asset.grid];
  const declared = asset.rows || [];
  const shaped = frames.map((fr, i) => verifyGrid(label + (framed ? ' frame' + i : ''),
    fr, framed ? declared[i] : declared, i === 0 ? asset : null));
  const boxes = shaped.filter(Boolean);
  const dimsMatch = boxes.every(b => b.w === boxes[0].w && b.h === boxes[0].h);
  ok(dimsMatch, label + ': every frame is the same box');
  const used = new Set();
  for (const b of boxes) for (const v of b.used) used.add(v);
  verifyPalette(label, asset.palette, used, opts.maxKeys);
  eq(framed ? asset.frameCount : 1, frames.length, label + ': frameCount matches the frames');
  if (framed) {
    ok(asset.frames.length >= (opts.minFrames || 2),
       label + ': animated asset ships at least ' + (opts.minFrames || 2) + ' frames (' + asset.frames.length + ')');
    eq(asset.rows.length, asset.frames.length, label + ': rows has one entry per frame');
    ok(asset.frames.every(fr => fr.every(r => r.length === asset.w)), label + ': every frame row is w wide');
  }
  const L = LIMITS[limitKey];
  ok(boxes[0].w >= L.w[0] && boxes[0].w <= L.w[1] && boxes[0].h >= L.h[0] && boxes[0].h <= L.h[1],
     label + ': box ' + boxes[0].w + 'x' + boxes[0].h + ' is within the documented range ' +
     L.w[0] + '-' + L.w[1] + ' x ' + L.h[0] + '-' + L.h[1]);
  if (opts.minCoverage) {
    const coverage = boxes[0].nonZero / (boxes[0].w * boxes[0].h);
    ok(coverage >= opts.minCoverage,
       label + ': silhouette fills ' + (coverage * 100).toFixed(0) + '% of the box (>= ' +
       (opts.minCoverage * 100) + '%) — reads as a shape, not a hairline');
    ok(coverage <= 0.9, label + ': silhouette leaves breathing room (' + (coverage * 100).toFixed(0) + '% < 90%)');
  }
  if (opts.requireInk) {
    const ink = frames[0].flat().filter(v => v === 1).length;
    const frac = ink / (asset.w * asset.h);
    ok(frac >= 0.04, label + ': carries a real ink outline (' + (frac * 100).toFixed(0) + '% of the box)');
  }
  return boxes[0];
}

console.log('SECTIONS / ENUMERATION:');
{
  // G25 slice 2 retarget: 5 -> 6 sections (apex emblems appended). The ids
  // assertion stays an EXACT list — the new section is named, not wildcarded.
  eq(ART_SECTIONS.length, 6, 'six art sections are enumerated');
  const ids = ART_SECTIONS.map(s => s.id).join(',');
  eq(ids, 'trophies,portraits,shop,title,portal,apex', 'section ids are stable');
  eq(ART_ASSETS.length, TROPHY_IDS.length + CHARACTER_IDS.length + SHOP_ICON_IDS.length + 1 +
     TITLE_LAYERS.length + 1 + APEX_IDS.length, 'ART_ASSETS enumerates every asset exactly once');
  const all = ART_ASSETS.map(a => a.section + '/' + a.id);
  eq(new Set(all).size, all.length, 'no duplicate asset ids across the whole library');
  const frames = ART_ASSETS.reduce((n, a) => n + (a.frames ? a.frames.length : 1), 0);
  eq(ART_COUNTS.trophies + ART_COUNTS.portraits + ART_COUNTS.shop + ART_COUNTS.title + ART_COUNTS.portal +
     ART_COUNTS.apex, frames, 'ART_COUNTS totals the enumerated frames');
  ok(frames >= 60, 'the library ships ' + frames + ' pixel layers (>= 60)');
}

console.log('TROPHIES (' + TROPHY_IDS.length + '):');
{
  const ids = Object.keys(TROPHY_ART);
  eq(ids.length, EXPECTED_TROPHIES.length, 'one trophy per expected achievement id');
  for (const id of EXPECTED_TROPHIES) ok(!!TROPHY_ART[id], 'TROPHY_ART.' + id + ' exists');
  eq(TROPHY_IDS.join(','), EXPECTED_TROPHIES.join(','), 'TROPHY_IDS matches the achievement id list in order');
  const extra = ids.filter(i => !EXPECTED_TROPHIES.includes(i));
  eq(extra.length, 0, 'no unexpected trophy ids');
  for (const id of ids) {
    verifyAsset(TROPHY_ART[id], 'trophy', 'TROPHY', { maxKeys: 6, minCoverage: 0.20, requireInk: true });
    ok(TROPHY_ART[id].name && TROPHY_ART[id].desc, 'trophy/' + id + ': carries a name and a description');
  }
  ok(!!TROPHY_ART[TROPHY_FALLBACK_ID], 'the locked fallback trophy exists');
  eq(trophyArt('NOT_A_REAL_ID'), TROPHY_ART[TROPHY_FALLBACK_ID], 'unknown trophy id resolves to the LOCKED silhouette');
  eq(trophyArt('FIRST_BLOOD'), TROPHY_ART.FIRST_BLOOD, 'known trophy id resolves to its own art');
}

console.log('CHARACTER PORTRAITS (' + CHARACTER_IDS.length + '):');
{
  eq(CHARACTER_IDS.join(','), EXPECTED_PORTRAITS.join(','), 'one portrait per playable character, in meta.js order');
  for (const id of CHARACTER_IDS) {
    const a = CHARACTER_PORTRAITS[id];
    ok(!!a, 'CHARACTER_PORTRAITS.' + id + ' exists');
    verifyAsset(a, 'portrait', 'PORTRAIT', { maxKeys: 6, minFrames: 2, minCoverage: 0.20, requireInk: true });
    ok(a.frames.length >= 2, 'portrait/' + id + ': ships an idle pair');
    const a0 = a.frames[0].flat().join(',');
    const a1 = a.frames[1].flat().join(',');
    ok(a0 !== a1, 'portrait/' + id + ': the two frames actually differ (not a still)');
  }
  eq(characterPortrait('NOPE'), CHARACTER_PORTRAITS.KNIGHT, 'unknown character resolves to the KNIGHT bust');
}

console.log('SHOP ICONS (' + SHOP_ICON_IDS.length + '):');
{
  eq(SHOP_ICON_IDS.length, EXPECTED_SHOP.length - 1, 'one icon per SHOP_UPGRADES row (plus the fallback)');
  for (const id of EXPECTED_SHOP) ok(!!SHOP_ICONS[id], 'SHOP_ICONS.' + id + ' exists');
  const extra = SHOP_ICON_IDS.filter(i => !EXPECTED_SHOP.includes(i));
  eq(extra.length, 0, 'no unexpected shop icon ids');
  for (const id of Object.keys(SHOP_ICONS)) {
    verifyAsset(SHOP_ICONS[id], 'shop', 'SHOP_ICON', { maxKeys: 5, minCoverage: 0.12, requireInk: true });
  }
  eq(SHOP_ICONS[SHOP_ICON_FALLBACK_ID], shopIcon('no_such_row'), 'unknown shop row resolves to the generic rune icon');
  ok(SHOP_ICON_IDS.length + 1 === Object.keys(SHOP_ICONS).length, 'the fallback is excluded from SHOP_ICON_IDS');
}

console.log('APEX EMBLEMS (' + APEX_IDS.length + ') — G25 slice 2:');
{
  // Same shape as the trophies block: exact id list, the A2 house-rule
  // verification (TROPHY box, ink outline, silhouette mass), plus the ONE
  // contract this section owns — the mask is the trophies' LOCKED emblem,
  // REUSED, not a second silhouette.
  const ids = Object.keys(APEX_ART);
  eq(ids.length, EXPECTED_APEX.length, 'one emblem per expected apex id');
  for (const id of EXPECTED_APEX) ok(!!APEX_ART[id], 'APEX_ART.' + id + ' exists');
  eq(APEX_IDS.join(','), EXPECTED_APEX.join(','), 'APEX_IDS matches the live apex catalogue ids in order');
  const extra = ids.filter(i => !EXPECTED_APEX.includes(i));
  eq(extra.length, 0, 'no unexpected apex ids');
  for (const id of ids) {
    verifyAsset(APEX_ART[id], 'apex', 'TROPHY', { maxKeys: 6, minCoverage: 0.35, requireInk: true });
    // APEX emblems carry pixels only — the catalogue (meta.js APEX_UPGRADES)
    // owns every name/desc the game shows, so a stray copy here is a drift bug.
    ok(!APEX_ART[id].name && !APEX_ART[id].desc, 'apex/' + id + ': carries NO name/desc (the catalogue owns the strings)');
  }
  // THE ONE MASK: the fallback IS the trophies' LOCKED id, and both resolvers
  // agree — an unknown apex id paints the same emblem the trophy gallery
  // paints for an unearned trophy. No second mask can be authored without
  // failing the identity here.
  eq(APEX_FALLBACK_ID, TROPHY_FALLBACK_ID, 'the apex fallback id IS the trophies\' LOCKED id (one mask, reused)');
  eq(apexArt('NOT_A_REAL_ID'), TROPHY_ART[TROPHY_FALLBACK_ID], 'unknown apex id resolves to the shared LOCKED silhouette');
  eq(apexArt('apex_mark'), APEX_ART.apex_mark, 'known apex id resolves to its own emblem');
  // The catalogue drives the ids: every APEX_UPGRADES row resolves to art
  // (authored or the shared mask), so items 3..6 can ship with no lint change.
  eq(APEX_IDS.every(id => !!apexArt(id)), true, 'every authored apex id resolves through apexArt');
}

console.log('PORTAL:');
{
  verifyAsset(PORTAL_ART, 'portal', 'PORTAL', { maxKeys: 8, minFrames: 4, minCoverage: 0.10 });
  eq(PORTAL_ART.frames.length, 4, 'the detailed portal ships a 4-frame loop');
  eq(PORTAL_BOX.w, PORTAL_ART.w, 'PORTAL_BOX.w matches the frames');
  eq(PORTAL_BOX.h, PORTAL_ART.h, 'PORTAL_BOX.h matches the frames');
  const sigs = PORTAL_ART.frames.map(f => f.flat().join(','));
  eq(new Set(sigs).size, 4, 'all four portal frames are distinct (it is a real animation)');
  eq(portalFrame(-1), PORTAL_ART.frames[3], 'portalFrame wraps negative indices');
  eq(portalFrame(0), PORTAL_ART.frames[0], 'portalFrame(0) is the first frame');
}

console.log('TITLE CARD:');
{
  eq(TITLE_WIDTH, 480, 'TITLE_WIDTH is the native view width');
  eq(TITLE_HEIGHT, 300, 'TITLE_HEIGHT is the native view height');
  eq(TITLE_ART.width, 480, 'TITLE_ART.width matches');
  eq(TITLE_ART.height, 300, 'TITLE_ART.height matches');
  eq(TITLE_LAYERS.map(l => l.id).join(','), EXPECTED_LAYERS.join(','), 'layer ids match the documented stack');
  eq(new Set(TITLE_LAYERS.map(l => l.id)).size, TITLE_LAYERS.length, 'layer ids are unique');
  const drawnLayers = [];
  for (const L of TITLE_LAYERS) {
    verifyAsset(L, 'title', 'TITLE_LAYER', { maxKeys: 9, requireInk: false });
    ok(Number.isInteger(L.scale) && L.scale >= 1, 'title/' + L.id + ': scale is a positive integer');
    ok(L.x >= 0 && L.y >= 0, 'title/' + L.id + ': sits at or below the top-left origin');
    ok(L.x + L.w * L.scale <= TITLE_WIDTH, 'title/' + L.id + ': fits inside 480 wide');
    ok(L.y + L.h * L.scale <= TITLE_HEIGHT, 'title/' + L.id + ': fits inside 300 tall');
  }
  const composed = composeTitle();
  eq(composed.length, TITLE_LAYERS.length, 'composeTitle returns every layer');
  ok(composed.every(L => L.scale === 1), 'composeTitle flattens every layer to scale 1');
  ok(composed.every((L, i) => L.grid.length === TITLE_LAYERS[i].grid.length * TITLE_LAYERS[i].scale),
     'composeTitle expands each grid to its final view size');
  // drawTitle paints through a plain drawGrid-shaped function (proves no adapter).
  const rects = [];
  const fakeDrawGrid = (g, grid, palette, x, y) => {
    ok(g === 'CTX', 'drawTitle passes the context straight through');
    rects.push({ x, y, grid, palette });
  };
  drawTitle(fakeDrawGrid, 'CTX');
  eq(rects.length, TITLE_LAYERS.length, 'drawTitle issues one drawGrid call per layer');
  eq(rects[0].x, TITLE_LAYERS[0].x, 'drawTitle honours the layer x');
  ok(rects.every(r => r.palette && Object.keys(r.palette).length > 0), 'every title layer paints with a real palette');
  ok(rects[0].grid.length === 300 && rects[0].grid[0].length === 480, 'the sky layer covers the whole 480x300 card');
  drawnLayers.push(...rects);
}

console.log('COVERAGE CROSS-CHECK (soft, meta.js):');
{
  // The shop icon ids are authored to mirror SHOP_UPGRADES. Import the real
  // table when it is loadable so drift is caught here rather than in the shop
  // UI; the hardcoded list above is the assertion that must always hold.
  let rows = null, starters = null, apex = null;
  try {
    const meta = await import('../src/meta.js');
    rows = meta.SHOP_UPGRADES;
    starters = meta.STARTER_WEAPONS;
    apex = meta.APEX_UPGRADES;
  } catch (e) {
    console.log('  SKIP could not import src/meta.js (' + (e && e.message) + ') — hardcoded list still enforced');
  }
  if (rows) {
    const missing = rows.map(r => r.id).filter(id => !SHOP_ICONS[id]);
    eq(missing.length, 0, 'every row in meta.js SHOP_UPGRADES has an icon (' + rows.length + ' rows)');
    // G25: apex rows live in their OWN catalogue — their icons are rows of
    // APEX_UPGRADES, not SHOP_UPGRADES, so the dead-icon walk must know both.
    const apexIds = (apex || []).map(r => r.id);
    const missingApex = apexIds.filter(id => !SHOP_ICONS[id]);
    eq(missingApex.length, 0, 'every row in meta.js APEX_UPGRADES has an icon (' + apexIds.length + ' rows)');
    const dead = SHOP_ICON_IDS.filter(id =>
      !rows.some(r => r.id === id) && !apexIds.includes(id) && !NO_SHOP_ROW_OK.includes(id));
    eq(dead.length, 0, 'no shop icon exists for a row that is gone (outside the documented starter exception)');
    if (starters) {
      const starterIcons = starters.map(w => 'weapon_' + w.toLowerCase());
      const missingStarters = starterIcons.filter(id => !SHOP_ICONS[id]);
      eq(missingStarters.length, 0,
         'every STARTER_WEAPON (' + starters.join(', ') + ') still has art for the draft/roster UI');
      eq(starters.length, NO_SHOP_ROW_OK.length,
         'the starter-weapon exception list is exactly the versions STARTER_WEAPONS lists');
    }
  }
}

console.log('');
if (failed) {
  console.error('test_art_lint: ' + failed + ' FAILED check(s)');
  process.exitCode = 1;
} else {
  console.log('test_art_lint: all checks passed');
}
