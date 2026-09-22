// HORDES — stage building structures (PORT SLICE E: original art from VS design reference).
//
// WHAT THIS FILE IS
// Eight ORIGINAL hand-authored landmark-scale structures, one per stage
// identity. They are CONCEPT ports only: the reference
// (docs/vs_port_ref/DESIGN_REFERENCE_VS.md, section 5 + 13, see per-building
// rows below) names the ROLES — castle-courtyard walls, clock-tower stubs,
// chapel fronts, library halls, gallo-tower stacks, machine houses,
// forest lodges, bone-zone ossuaries — and documents that the matching
// pixels were NEVER extracted (section 14 GAPS: "Props sprites empty"; the
// stage thumbs in Appendix A.3 are packed 32px tileset atlases, not
// building sprites to trace). Every rect below was composed fresh for
// HORDES.
//
// SCALE (the whole point of this slice — slice A was single-cell props):
// each building is a fillRect-composed rect list 64..108px wide, 64..100px
// tall, i.e. roughly half a LANDMARK_CELL (192px) — landmark scale, spanning
// most of one coarse cell and overhanging its neighbours. Data-driven (not
// drawGrid pixel maps): a 100px building as a pixel grid would be hundreds
// of cells; 12..21 fillRects keep the rare building pass 60/120Hz safe.
//
// ART-DIRECTION NUMBERS:
//   * Palette budget: each building uses <= 6 keys (1..9, same convention
//     as src/sprites.js and src/stage_props.js); fixed authored colors so a
//     stage reads as a PLACE under any wave theme (props do the same).
//   * Still life: no clock read anywhere — a building repaints
//     byte-identically per (cell, seed).
//   * Bed shadow is rect #1 inside the declared box (all rects fit
//     [0,w)x[0,h) — the rim cull in render.js trusts the footprint).
//
// WIRING: render.js drawLandmarks runs the rare building pass (BUILDING_CELL
// grid, BUILDING_DENSITY gate, fresh hash salts) AFTER the landmark-cell
// field and BEFORE the hollow's authored block — one building per picked
// building-cell at most, rim-clipped by footprint, reported through the
// same landmarks seam (kind = the building id, COMPOSED rects). No
// balance/combat/economy number lives here (visual-only slice).
// PAINTING-ONLY HARD LIMIT: no collision, no pathing block, no spawn
// effect. If a building "should" block movement, that is an OWNER RULING,
// parked in the slice report, never decided here.

// ---- HOLLOW_LODGE (76x68, 20 rects) ----------------------------------------
// Reference: section 5 row FOREST (Mad Forest — ForestTexturePacked +
// BRAZIER, the wooded core stage) + row EX_WESTWOODS (Westwoods —
// FoscariTexturePacked + LANTERN, the path-lit wood). HORDES-native: the
// timber watch hut of VERDANT_HOLLOW — stilt legs, plank body, shingle
// roof with moss seams, a warm door, a log pile leaning on its side.
const HOLLOW_LODGE_RECTS = [
  [4, 64, 68, 2, 1],
  [10, 52, 6, 12, 1], [60, 52, 6, 12, 1],
  [8, 50, 60, 4, 2],
  [12, 26, 52, 24, 2],
  [12, 26, 52, 3, 3],
  [12, 34, 52, 1, 1], [12, 42, 52, 1, 1],
  [32, 34, 12, 16, 1], [34, 38, 8, 8, 6],
  [6, 16, 34, 6, 1], [36, 16, 34, 6, 1],
  [8, 10, 60, 6, 2], [8, 10, 60, 2, 3],
  [14, 10, 10, 2, 4], [48, 12, 12, 2, 4], [30, 16, 8, 2, 5],
  [64, 44, 8, 2, 2], [64, 46, 8, 2, 1], [64, 48, 8, 2, 2],
];
const HOLLOW_LODGE_PALETTE = { 1: '#2e2114', 2: '#7c603c', 3: '#a8906a', 4: '#4c9455', 5: '#6cc47c', 6: '#ffd54a' };

// ---- EMBER_HALL (108x72, 21 rects) -----------------------------------------
// Reference: section 5 row BONEZONE (The Bone Zone — BRAZIER scorch) +
// section 13 row TP_Tileset_Refactor_1_Castle (gothic floor/wall, the
// castle-wall motif) + section 6 rows BRAZIER / GOTHIC_BRAZIER (the
// fire-bowl light). HORDES-native: the ruined basalt hall of ASHEN_WASTE —
// two broken piers, breached lintel stubs, ember-cracked fallen blocks.
const EMBER_HALL_RECTS = [
  [2, 68, 104, 2, 1],
  [6, 20, 22, 48, 2], [6, 20, 22, 2, 3],
  [12, 34, 3, 10, 4], [20, 50, 2, 8, 5],
  [80, 14, 22, 54, 2], [80, 14, 22, 2, 3],
  [88, 28, 3, 12, 4], [94, 48, 2, 8, 5],
  [6, 12, 30, 8, 2], [6, 12, 30, 2, 3],
  [72, 6, 30, 8, 2], [72, 6, 30, 2, 3],
  [40, 56, 14, 8, 2], [56, 58, 12, 6, 1], [44, 50, 10, 6, 2],
  [44, 56, 14, 2, 4],
  [0, 66, 40, 2, 6], [70, 66, 38, 2, 6],
  [30, 44, 48, 12, 1], [30, 44, 48, 2, 3],
];
const EMBER_HALL_PALETTE = { 1: '#141216', 2: '#2c2c34', 3: '#4a4a56', 4: '#e8481e', 5: '#ffd54a', 6: '#6a7382' };

// ---- DRIFT_CHAPEL (88x84, 20 rects) ----------------------------------------
// Reference: section 5 row CHAPEL (Cappella Magna — ChapelTexturePacked +
// CANDELABRA, the chapel archetype) + section 13 row
// TP_Tileset_Refactor_2_Chapel (chapel stone, same pitch, different palette
// family) + Appendix A.3 row atlas_ChapelTexturePacked. HORDES-native: the
// snow chapel of SNOWFIELD — gabled front, snowcap roof, lit belfry slit,
// buttressed walls, drifted base.
const DRIFT_CHAPEL_RECTS = [
  [6, 80, 76, 2, 1],
  [18, 30, 52, 50, 2], [18, 30, 52, 2, 3],
  [14, 72, 60, 6, 4],
  [14, 18, 60, 12, 2], [14, 18, 60, 2, 3],
  [10, 10, 68, 8, 4], [10, 16, 68, 2, 1],
  [40, 20, 8, 8, 5], [42, 24, 4, 4, 6],
  [36, 52, 16, 28, 5], [43, 56, 2, 20, 6],
  [8, 44, 10, 36, 2], [8, 44, 10, 2, 3], [8, 40, 10, 4, 4],
  [70, 44, 10, 36, 2], [70, 44, 10, 2, 3], [70, 40, 10, 4, 4],
  [0, 74, 14, 6, 4], [74, 74, 14, 6, 4],
];
const DRIFT_CHAPEL_PALETTE = { 1: '#39424c', 2: '#5f6b78', 3: '#8a97a5', 4: '#dfe7ee', 5: '#1c222b', 6: '#ffd54a' };

// ---- RUST_KEEP (96x92, 20 rects) -------------------------------------------
// Reference: section 5 row CHAPEL (Cappella Magna) + Appendix A.3 row
// atlas_TP_Stage3_ProfaneChapel (the profane-chapel front, the gated
// archetype) + section 6 rows EX_TOHILSTATUE / KUJATASTATUE (the heavy
// maxHp statue — mass that watches). HORDES-native: the keep fragment of
// BLOOD_RUST — stepped merlons, a dark arch mouth, a rust-lit watch slit.
const RUST_KEEP_RECTS = [
  [4, 88, 88, 2, 1],
  [10, 16, 76, 72, 2], [10, 16, 76, 3, 3],
  [10, 8, 14, 8, 2], [34, 8, 14, 8, 2], [58, 8, 14, 8, 2],
  [10, 8, 14, 2, 3], [34, 8, 14, 2, 3], [58, 8, 14, 2, 3],
  [36, 52, 24, 36, 5],
  [34, 50, 28, 3, 3], [34, 53, 2, 35, 3], [58, 53, 2, 35, 3],
  [20, 30, 10, 4, 5], [22, 30, 6, 2, 4],
  [10, 44, 76, 3, 1], [10, 66, 24, 3, 1],
  [80, 34, 14, 54, 6], [80, 34, 14, 2, 3],
  [16, 80, 12, 8, 2],
];
const RUST_KEEP_PALETTE = { 1: '#0c0604', 2: '#6a3226', 3: '#a8583c', 4: '#ffd54a', 5: '#1c0e0a', 6: '#38221a' };

// ---- OSSUARY_ARCH (108x64, 17 rects) ---------------------------------------
// Reference: section 5 row BONEZONE (The Bone Zone — the bone archetype) +
// section 6 row CART (maxHp=4 — the sturdy desert prop, nodded to by the
// leaning planks) + section 13 row st2u_* unified map tiles (Tiled 32px
// ground the arch sits on). HORDES-native: the ossuary arch of BONE_DESERT
// — a sandstone stub tower beside a bone-rib arch with one fallen rib.
const OSSUARY_ARCH_RECTS = [
  [2, 60, 104, 2, 1],
  [8, 16, 26, 44, 2], [8, 16, 26, 2, 3],
  [8, 28, 26, 2, 1], [8, 40, 26, 2, 1],
  [6, 10, 30, 6, 6], [6, 10, 30, 2, 3],
  [44, 28, 8, 32, 5], [84, 28, 8, 32, 5],
  [44, 20, 48, 10, 5], [44, 26, 48, 4, 6],
  [62, 30, 6, 12, 5],
  [50, 56, 20, 4, 5],
  [94, 36, 4, 24, 4], [90, 44, 12, 3, 4],
  [0, 58, 34, 2, 3], [74, 58, 34, 2, 3],
];
const OSSUARY_ARCH_PALETTE = { 1: '#0e0a04', 2: '#a87f4a', 3: '#c8b088', 4: '#6b4a2a', 5: '#e8d8c0', 6: '#443826' };

// ---- VOID_ANNEX (96x84, 19 rects) ------------------------------------------
// Reference: section 5 row LIBRARY (Inlaid Library — LibraryTexturePacked +
// CANDELABRA, the book-hall archetype) + row ASTRALSTAIR (Astral Stair —
// LibraryTexturePacked, the stair archetype) + Appendix A.3 row
// atlas_LibraryTexturePacked. HORDES-native: the library annex of
// VOID_REACH — a tall hall wall with three void-lit arch windows, front
// steps, a broken column, one fallen glowing block.
const VOID_ANNEX_RECTS = [
  [4, 80, 88, 2, 1],
  [14, 14, 68, 66, 2], [14, 14, 68, 2, 3],
  [22, 26, 12, 22, 6], [24, 32, 8, 10, 4],
  [42, 26, 12, 22, 6], [44, 32, 8, 10, 4],
  [62, 26, 12, 22, 6], [64, 32, 8, 10, 4],
  [27, 26, 2, 22, 1], [47, 26, 2, 22, 1], [67, 26, 2, 22, 1],
  [28, 72, 40, 3, 6], [24, 75, 48, 3, 2],
  [0, 40, 12, 40, 6], [0, 40, 12, 2, 3], [0, 34, 12, 6, 2],
  [82, 66, 10, 8, 2], [82, 66, 10, 2, 5],
];
const VOID_ANNEX_PALETTE = { 1: '#080614', 2: '#2c2650', 3: '#4a3f7a', 4: '#9e7fff', 5: '#ffd54a', 6: '#1c1834' };

// ---- CINDER_KILN (88x76, 19 rects) -----------------------------------------
// Reference: section 5 row TOWER (Gallo Tower — TowerTexturePacked +
// CANDELABRA, the tower-stack archetype) + row TOWERBRIDGE (Tiny Bridge —
// TowerTexturePacked + BRAZIER2) + Appendix A.3 row
// atlas_TowerTexturePacked + section 6 row BRAZIER2 (the ember light).
// HORDES-native: the kiln dome of CINDER_MAW — a domed furnace with a tall
// stack, an ember mouth, heat cracks, slag blocks.
const CINDER_KILN_RECTS = [
  [4, 72, 80, 2, 1],
  [10, 36, 52, 36, 2], [10, 36, 52, 2, 3],
  [28, 28, 16, 8, 2], [28, 28, 16, 2, 3],
  [62, 8, 14, 64, 2], [62, 8, 14, 2, 3],
  [62, 24, 14, 2, 1], [62, 40, 14, 2, 1], [62, 56, 14, 2, 1],
  [64, 8, 10, 4, 1], [66, 10, 6, 2, 5],
  [26, 54, 20, 18, 1], [28, 62, 16, 6, 4], [32, 64, 8, 4, 5],
  [12, 44, 2, 10, 4], [52, 44, 2, 8, 4],
  [0, 64, 10, 8, 6], [78, 64, 10, 8, 2],
];
const CINDER_KILN_PALETTE = { 1: '#0a0a0e', 2: '#2c2c34', 3: '#565664', 4: '#e8481e', 5: '#ffd54a', 6: '#6a7382' };

// ---- CLOCKWAY_STUB (64x100, 20 rects) --------------------------------------
// Reference: section 5 TOWER rows (Gallo Tower) + Appendix A.3 row
// atlas_TP_Stage5_ClockTower (the clock-tower archetype) + section 10 row
// ADV_OTC_001_004_ClockTower (the clock-tower card) + section 6 row
// WEATHERNODE (the marker node — nodded to by the side vane).
// HORDES-native: the clock-tower waymark stub of WHITEOUT — a tall narrow
// tower with a ringed face and hands, a snowcap, a side vane glint.
const CLOCKWAY_STUB_RECTS = [
  [2, 96, 60, 2, 1],
  [14, 20, 36, 76, 2], [14, 20, 36, 2, 3], [14, 20, 4, 76, 1],
  [10, 12, 44, 8, 4], [10, 18, 44, 2, 1],
  [20, 28, 24, 24, 5],
  [20, 28, 24, 2, 3], [20, 50, 24, 2, 3], [20, 28, 2, 24, 3], [42, 28, 2, 24, 3],
  [31, 30, 2, 10, 6], [31, 38, 8, 2, 6],
  [24, 72, 16, 24, 5], [22, 68, 20, 4, 4],
  [28, 56, 8, 4, 5],
  [50, 40, 8, 2, 3], [58, 38, 2, 6, 6],
  [0, 90, 14, 6, 4], [50, 90, 14, 6, 4],
];
const CLOCKWAY_STUB_PALETTE = { 1: '#1a2029', 2: '#5f6b78', 3: '#9fb0c0', 4: '#e8eef4', 5: '#10141a', 6: '#ffd54a' };

function makeBuilding(id, name, blurb, w, h, rects, palette) {
  return { id, name, blurb, w, h, rects, palette, rectCount: rects.length };
}

export const STAGE_BUILDINGS = {
  HOLLOW_LODGE: makeBuilding('HOLLOW_LODGE', 'hollow lodge',
    'a timber watch hut among the groves', 76, 68, HOLLOW_LODGE_RECTS, HOLLOW_LODGE_PALETTE),
  EMBER_HALL: makeBuilding('EMBER_HALL', 'ember hall',
    'a ruined basalt hall split by heat', 108, 72, EMBER_HALL_RECTS, EMBER_HALL_PALETTE),
  DRIFT_CHAPEL: makeBuilding('DRIFT_CHAPEL', 'drift chapel',
    'a snow chapel holding its belfry light', 88, 84, DRIFT_CHAPEL_RECTS, DRIFT_CHAPEL_PALETTE),
  RUST_KEEP: makeBuilding('RUST_KEEP', 'rust keep',
    'a keep fragment with a dark arch mouth', 96, 92, RUST_KEEP_RECTS, RUST_KEEP_PALETTE),
  OSSUARY_ARCH: makeBuilding('OSSUARY_ARCH', 'ossuary arch',
    'a bone-rib arch beside a sandstone stub', 108, 64, OSSUARY_ARCH_RECTS, OSSUARY_ARCH_PALETTE),
  VOID_ANNEX: makeBuilding('VOID_ANNEX', 'void annex',
    'a library hall lit from nowhere', 96, 84, VOID_ANNEX_RECTS, VOID_ANNEX_PALETTE),
  CINDER_KILN: makeBuilding('CINDER_KILN', 'cinder kiln',
    'a kiln dome breathing through its stack', 88, 76, CINDER_KILN_RECTS, CINDER_KILN_PALETTE),
  CLOCKWAY_STUB: makeBuilding('CLOCKWAY_STUB', 'clockway stub',
    'a clock-tower waymark keeping dead time', 64, 100, CLOCKWAY_STUB_RECTS, CLOCKWAY_STUB_PALETTE),
};

export const STAGE_BUILDING_IDS = Object.keys(STAGE_BUILDINGS);

// Stage identity each building serves (src/stages.js ids). Unlisted / unset
// stages read the hollow lodge — every arena keeps one roof in sight.
const BUILDING_BY_STAGE = {
  VERDANT_HOLLOW: 'HOLLOW_LODGE',
  ASHEN_WASTE: 'EMBER_HALL',
  SNOWFIELD: 'DRIFT_CHAPEL',
  BLOOD_RUST: 'RUST_KEEP',
  BONE_DESERT: 'OSSUARY_ARCH',
  VOID_REACH: 'VOID_ANNEX',
  CINDER_MAW: 'CINDER_KILN',
  WHITEOUT: 'CLOCKWAY_STUB',
};

export function buildingForStage(stageId) {
  return STAGE_BUILDINGS[BUILDING_BY_STAGE[stageId] || 'HOLLOW_LODGE'];
}

// Paint one building through plain fillRects (the landmark primitives are
// fillRect-composed, never drawGrid pixel maps — see header). Returns the
// painted rect count (the number the landmarks seam reports as `rects`, so
// a building always reads COMPOSED).
export function paintBuilding(g, id, x, y) {
  const b = STAGE_BUILDINGS[id];
  if (!b) return 0;
  for (const [dx, dy, w, h, k] of b.rects) {
    g.fillStyle = b.palette[k];
    g.fillRect(x + dx, y + dy, w, h);
  }
  return b.rects.length;
}
