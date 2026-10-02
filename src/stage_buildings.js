// HORDES — stage building structures (PORT SLICE E: original art from VS design reference).
import { CONFIG as C } from './config.js';
//
// WHAT THIS FILE IS
// Sixty-four ORIGINAL hand-authored landmark-scale structures in eight
// per-stage kits (slice E shipped one anchor per stage identity; slice J
// grows each biome to 3 anchors + 5 satellite outbuildings — no cap on
// counts, the bound is measured perf + the pilot-fit separation floor).
// They are CONCEPT ports only: the reference
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
// WIRING: render.js drawLandmarks runs the building pass (BUILDING_CELL
// grid, fresh hash salts, single-sourced from buildingPlacements below)
// AFTER the landmark-cell field and BEFORE the hollow's authored block —
// every building-cell composes an anchor + satellites (slice J: no density
// gate), view-culled, reported through the same landmarks seam (kind = the
// design id, COMPOSED rects). No balance/combat/economy number lives here
// (visual slice + a pure motion query, see PORT SLICE F below).
// PORT SLICE F (owner-ruled 2026-09-22: "collision sounds fine to me. we
// need to get some objects in the map sooner or later." — collision on the
// slice-(e) buildings is APPROVED as gameplay): this module grows a PURE
// collision query over the EXISTING rect lists — footprints, a fixed-point
// clearance, a point test and an axis-separated slide. The query reads no
// clock, no DOM and no run objects and writes nothing: the paint path stays
// pure (the slice-E source-scan still holds), and the motion seam in main.js
// applies the query when it moves the pilot. The horde reads nothing here —
// it walks through buildings by design (see the slice-F report).

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

// ---- PORT SLICE J shared biome palettes ------------------------------------
// One palette per biome (the section-13 palette-swap discipline from the map
// study: variety comes from RECOMBINING a small kit, re-skinned per biome).
// Values match the slice-E anchors above so old and new sit in one place.
const PAL_HOLLOW = { 1: '#2e2114', 2: '#7c603c', 3: '#a8906a', 4: '#4c9455', 5: '#6cc47c', 6: '#ffd54a' };
const PAL_ASHEN = { 1: '#141216', 2: '#2c2c34', 3: '#4a4a56', 4: '#e8481e', 5: '#ffd54a', 6: '#6a7382' };
const PAL_SNOW = { 1: '#39424c', 2: '#5f6b78', 3: '#8a97a5', 4: '#dfe7ee', 5: '#1c222b', 6: '#ffd54a' };
const PAL_RUST = { 1: '#0c0604', 2: '#6a3226', 3: '#a8583c', 4: '#ffd54a', 5: '#1c0e0a', 6: '#38221a' };
const PAL_BONE = { 1: '#0e0a04', 2: '#a87f4a', 3: '#c8b088', 4: '#6b4a2a', 5: '#e8d8c0', 6: '#443826' };
const PAL_VOID = { 1: '#080614', 2: '#2c2650', 3: '#4a3f7a', 4: '#9e7fff', 5: '#ffd54a', 6: '#1c1834' };
const PAL_CINDER = { 1: '#0a0a0e', 2: '#2c2c34', 3: '#565664', 4: '#e8481e', 5: '#ffd54a', 6: '#6a7382' };
const PAL_WHITE = { 1: '#1a2029', 2: '#5f6b78', 3: '#9fb0c0', 4: '#e8eef4', 5: '#10141a', 6: '#ffd54a' };

// ---- VERDANT_HOLLOW satellites + anchors (timber hamlet) --------------------
// Reference: section 5 row FOREST + row EX_WESTWOODS (path-lit wood), same
// rows as HOLLOW_LODGE above. Grammar G8: lodge + sheds/palisades/log piles.
const GROVE_HALL_RECTS = [
  [2, 64, 100, 2, 1],
  [10, 54, 6, 10, 1], [88, 54, 6, 10, 1],
  [8, 52, 88, 3, 2],
  [12, 28, 80, 24, 2],
  [12, 36, 80, 1, 1], [12, 44, 80, 1, 1],
  [12, 28, 80, 3, 3],
  [46, 36, 12, 16, 1], [48, 40, 8, 6, 6],
  [20, 34, 10, 8, 1], [22, 36, 6, 4, 6],
  [74, 34, 10, 8, 1],
  [4, 18, 52, 6, 1], [48, 18, 52, 6, 1],
  [6, 12, 92, 6, 2], [6, 12, 92, 2, 3],
  [12, 14, 14, 2, 4], [64, 16, 16, 2, 4], [40, 20, 10, 2, 5],
  [94, 46, 6, 2, 2], [94, 48, 6, 2, 1], [94, 50, 6, 2, 2],
];
const LOOKOUT_RECTS = [
  [2, 100, 60, 2, 1],
  [12, 72, 6, 28, 1], [46, 72, 6, 28, 1],
  [12, 84, 40, 2, 2], [12, 92, 40, 2, 2],
  [8, 64, 48, 6, 2], [8, 64, 48, 2, 3],
  [14, 40, 36, 24, 2], [14, 40, 36, 2, 3],
  [14, 48, 36, 1, 1], [14, 56, 36, 1, 1],
  [24, 46, 16, 10, 1], [26, 48, 12, 6, 6],
  [10, 32, 44, 6, 1], [12, 26, 40, 6, 2], [12, 26, 40, 2, 3],
  [16, 28, 10, 2, 4], [38, 30, 10, 2, 5],
  [28, 10, 4, 16, 1], [32, 10, 12, 6, 6], [32, 10, 12, 2, 4],
  [6, 94, 12, 6, 2], [46, 94, 12, 6, 2],
];
const WOODSHED_RECTS = [
  [2, 40, 52, 2, 1],
  [8, 16, 40, 24, 2], [8, 16, 40, 2, 3],
  [8, 24, 40, 1, 1], [8, 32, 40, 1, 1],
  [4, 10, 48, 6, 1], [6, 6, 44, 4, 2],
  [10, 6, 10, 2, 4], [34, 8, 10, 2, 5],
  [24, 24, 8, 16, 1],
  [48, 28, 6, 2, 2], [48, 30, 6, 2, 1], [48, 32, 6, 2, 2],
];
const PALISADE_RECTS = [
  [2, 32, 64, 2, 1],
  [6, 10, 6, 22, 2], [16, 10, 6, 22, 2], [26, 10, 6, 22, 2],
  [36, 10, 6, 22, 2], [46, 10, 6, 22, 2], [56, 10, 6, 22, 2],
  [6, 8, 6, 2, 3], [16, 8, 6, 2, 3], [26, 8, 6, 2, 3],
  [36, 8, 6, 2, 3], [46, 8, 6, 2, 3], [56, 8, 6, 2, 3],
  [4, 14, 60, 2, 1], [4, 24, 60, 2, 1],
  [10, 18, 12, 2, 5], [40, 20, 14, 2, 4],
];
const LOGPILE_RECTS = [
  [2, 32, 48, 2, 1],
  [6, 20, 8, 8, 3], [16, 20, 8, 8, 2], [26, 20, 8, 8, 3], [36, 20, 8, 8, 2],
  [8, 22, 4, 4, 1], [18, 22, 4, 4, 1], [28, 22, 4, 4, 1], [38, 22, 4, 4, 1],
  [11, 10, 8, 8, 2], [21, 10, 8, 8, 3], [31, 10, 8, 8, 2],
  [13, 12, 4, 4, 1], [23, 12, 4, 4, 1], [33, 12, 4, 4, 1],
  [18, 4, 12, 4, 2], [20, 4, 8, 2, 4],
];
const HERB_RACK_RECTS = [
  [2, 40, 44, 2, 1],
  [8, 10, 4, 30, 1], [36, 10, 4, 30, 1],
  [8, 10, 32, 3, 2],
  [12, 14, 6, 10, 4], [21, 14, 6, 10, 5], [30, 14, 4, 10, 4],
  [14, 13, 2, 2, 3], [23, 13, 2, 2, 3],
  [6, 36, 36, 2, 2],
  [12, 30, 6, 6, 2], [30, 30, 6, 6, 2],
];
const STUMP_SHRINE_RECTS = [
  [2, 48, 40, 2, 1],
  [10, 18, 24, 30, 2], [10, 18, 24, 3, 3],
  [13, 21, 18, 2, 3], [16, 27, 12, 2, 1], [18, 33, 8, 2, 3],
  [16, 38, 4, 4, 1], [24, 38, 4, 4, 1], [18, 44, 8, 2, 1],
  [8, 14, 28, 4, 4], [12, 14, 8, 2, 5],
  [30, 40, 8, 4, 2], [32, 40, 4, 2, 6],
  [6, 44, 6, 4, 1], [32, 44, 6, 4, 1],
];

// ---- ASHEN_WASTE satellites + anchors (basalt ruin-field) -------------------
// Reference: section 5 row BONEZONE + section 13 row
// TP_Tileset_Refactor_1_Castle, same rows as EMBER_HALL above.
const CINDER_GATE_RECTS = [
  [2, 72, 104, 2, 1],
  [8, 16, 24, 56, 2], [8, 16, 24, 2, 3],
  [76, 16, 24, 56, 2], [76, 16, 24, 2, 3],
  [6, 10, 28, 6, 2], [74, 10, 28, 6, 2], [6, 10, 28, 2, 3], [74, 10, 28, 2, 3],
  [8, 22, 92, 10, 2], [8, 22, 92, 2, 3],
  [42, 40, 24, 32, 1], [44, 44, 20, 6, 4],
  [14, 30, 4, 10, 4], [86, 30, 4, 10, 4], [16, 52, 2, 8, 5],
  [44, 64, 16, 6, 2], [62, 66, 12, 4, 1], [46, 58, 12, 4, 2],
  [0, 70, 40, 2, 6], [70, 70, 38, 2, 6],
];
const BASALT_SPIRE_RECTS = [
  [2, 100, 64, 2, 1],
  [10, 88, 48, 12, 2], [10, 88, 48, 2, 3],
  [16, 80, 36, 8, 2],
  [20, 20, 28, 60, 2], [20, 20, 28, 2, 3], [20, 20, 4, 60, 1],
  [28, 34, 3, 12, 4], [36, 52, 3, 10, 4], [30, 66, 2, 8, 5],
  [16, 12, 36, 8, 2], [16, 12, 36, 2, 3],
  [30, 2, 8, 10, 2], [32, 4, 4, 4, 4],
  [52, 40, 8, 2, 3], [58, 38, 2, 6, 6],
  [4, 92, 10, 6, 1], [54, 92, 10, 6, 2],
];
const EMBER_CAIRN_RECTS = [
  [2, 40, 44, 2, 1],
  [10, 32, 28, 8, 2], [10, 32, 28, 1, 3],
  [14, 24, 20, 8, 2], [14, 24, 20, 1, 3],
  [19, 16, 10, 8, 2],
  [16, 32, 8, 1, 4], [20, 24, 6, 1, 4], [22, 18, 4, 1, 5],
  [4, 34, 6, 6, 1], [38, 34, 6, 6, 2],
  [0, 38, 10, 2, 6], [38, 38, 10, 2, 6],
];
const BROKEN_PIER_RECTS = [
  [2, 60, 36, 2, 1],
  [6, 52, 28, 8, 2], [6, 52, 28, 1, 3],
  [10, 14, 20, 38, 2], [10, 14, 20, 1, 3], [10, 14, 3, 38, 1],
  [10, 10, 20, 4, 2], [16, 6, 8, 4, 2],
  [18, 26, 3, 12, 4], [20, 44, 2, 6, 5],
  [2, 44, 8, 6, 2], [30, 46, 8, 6, 1],
];
const SLAG_HEAP_RECTS = [
  [2, 32, 52, 2, 1],
  [8, 18, 40, 14, 2], [14, 12, 28, 6, 2],
  [14, 12, 28, 2, 3], [8, 18, 40, 1, 3],
  [4, 24, 8, 8, 1], [44, 24, 8, 8, 1], [24, 22, 10, 6, 1],
  [18, 20, 3, 3, 4], [34, 24, 3, 3, 4], [28, 14, 2, 2, 5],
];
const SCORCH_WALL_RECTS = [
  [2, 36, 64, 2, 1],
  [6, 14, 12, 22, 2], [20, 14, 12, 22, 2], [44, 14, 12, 22, 2], [56, 14, 6, 22, 2],
  [6, 14, 12, 2, 3], [20, 14, 12, 2, 3], [44, 14, 12, 2, 3], [56, 14, 6, 2, 3],
  [6, 34, 12, 2, 4], [44, 34, 12, 2, 4],
  [30, 28, 10, 6, 2], [32, 22, 8, 4, 1],
  [0, 34, 6, 2, 6], [62, 34, 6, 2, 6],
];
const FIRE_BOWL_RECTS = [
  [2, 44, 40, 2, 1],
  [14, 20, 16, 24, 2], [14, 20, 16, 2, 3],
  [12, 40, 4, 4, 1], [28, 40, 4, 4, 1],
  [8, 12, 28, 8, 6], [8, 12, 28, 2, 3],
  [16, 2, 12, 10, 4], [19, 4, 6, 6, 5],
  [12, 22, 20, 2, 4],
  [4, 36, 6, 6, 1], [34, 36, 6, 6, 2],
];

// ---- SNOWFIELD satellites + anchors (chapel close) --------------------------
// Reference: section 5 row CHAPEL + section 13 row TP_Tileset_Refactor_2_Chapel.
const BELFRY_RECTS = [
  [2, 104, 60, 2, 1],
  [14, 24, 36, 80, 2], [14, 24, 36, 2, 3], [14, 24, 4, 80, 1],
  [22, 32, 20, 20, 5], [24, 36, 16, 6, 6],
  [22, 44, 20, 2, 2],
  [14, 60, 36, 3, 1],
  [24, 80, 16, 24, 5], [30, 84, 4, 16, 6],
  [10, 20, 44, 6, 4], [8, 56, 48, 4, 4], [10, 98, 44, 4, 4],
  [50, 60, 8, 44, 2], [50, 60, 8, 2, 3], [50, 56, 8, 4, 4],
  [0, 100, 16, 6, 4], [48, 100, 16, 6, 4],
];
const PILGRIM_HALL_RECTS = [
  [2, 64, 104, 2, 1],
  [10, 22, 88, 42, 2], [10, 22, 88, 2, 3],
  [4, 30, 6, 34, 2], [98, 30, 6, 34, 2],
  [6, 14, 96, 8, 2], [2, 8, 104, 6, 4], [2, 12, 104, 2, 1],
  [48, 40, 14, 24, 5], [54, 44, 2, 16, 6],
  [20, 32, 10, 10, 5], [22, 34, 6, 4, 6], [78, 32, 10, 10, 5], [80, 34, 6, 4, 6],
  [10, 58, 88, 4, 4],
  [0, 60, 10, 6, 4], [98, 60, 10, 6, 4],
];
const SNOW_WALL_RECTS = [
  [2, 32, 64, 2, 1],
  [6, 12, 14, 20, 2], [22, 12, 14, 20, 2], [46, 12, 14, 20, 2],
  [6, 12, 14, 2, 3], [22, 12, 14, 2, 3], [46, 12, 14, 2, 3],
  [4, 6, 60, 6, 4], [4, 10, 60, 2, 1],
  [36, 22, 10, 8, 2], [38, 16, 8, 4, 4],
  [0, 30, 8, 4, 4], [60, 30, 8, 4, 4],
];
const ICE_CAIRN_RECTS = [
  [2, 40, 40, 2, 1],
  [10, 30, 24, 10, 2], [10, 30, 24, 1, 4],
  [14, 21, 16, 9, 3], [14, 21, 16, 1, 4],
  [19, 12, 8, 9, 2], [19, 12, 8, 1, 4],
  [12, 32, 4, 2, 4], [26, 23, 4, 2, 4],
  [6, 38, 32, 2, 4],
  [2, 32, 6, 6, 2], [36, 32, 6, 6, 2],
];
const SHRINE_POST_RECTS = [
  [2, 52, 32, 2, 1],
  [14, 14, 8, 38, 2], [14, 14, 8, 2, 3], [14, 14, 2, 38, 1],
  [8, 6, 20, 10, 5], [10, 8, 16, 4, 6],
  [6, 2, 24, 4, 4],
  [10, 48, 16, 4, 2], [8, 44, 20, 4, 4],
  [14, 24, 8, 2, 3], [14, 34, 8, 2, 3],
];
const WAYMARK_RECTS = [
  [2, 32, 56, 2, 1],
  [8, 8, 5, 24, 2], [47, 8, 5, 24, 2],
  [8, 8, 44, 4, 2], [8, 8, 44, 1, 3],
  [20, 14, 20, 8, 5], [22, 16, 16, 2, 6], [22, 19, 10, 1, 3],
  [0, 28, 12, 4, 4], [48, 28, 12, 4, 4],
  [6, 4, 9, 4, 4], [45, 4, 9, 4, 4],
];
const FROST_STEP_RECTS = [
  [2, 36, 48, 2, 1],
  [6, 28, 40, 8, 2], [12, 20, 28, 8, 2], [18, 12, 16, 8, 2],
  [6, 28, 40, 1, 4], [12, 20, 28, 1, 4], [18, 12, 16, 1, 4],
  [24, 22, 6, 4, 5], [26, 22, 2, 4, 6],
  [0, 32, 6, 4, 4], [46, 32, 6, 4, 4],
];

// ---- BLOOD_RUST satellites + anchors (keep compound) ------------------------
// Reference: section 5 row CHAPEL + Appendix A.3 row atlas_TP_Stage3_ProfaneChapel
// + section 6 rows EX_TOHILSTATUE / KUJATASTATUE (mass that watches).
const PROFANE_GATE_RECTS = [
  [2, 76, 104, 2, 1],
  [8, 14, 26, 62, 2], [8, 14, 26, 2, 3], [74, 14, 26, 62, 2], [74, 14, 26, 2, 3],
  [8, 6, 12, 8, 2], [24, 6, 10, 8, 2], [74, 6, 12, 8, 2], [88, 6, 12, 8, 2],
  [8, 6, 12, 2, 3], [24, 6, 10, 2, 3], [74, 6, 12, 2, 3], [88, 6, 12, 2, 3],
  [8, 20, 92, 8, 2], [8, 20, 92, 2, 3],
  [42, 36, 24, 40, 5], [40, 34, 28, 3, 3],
  [50, 44, 8, 4, 4],
  [34, 40, 8, 36, 6], [66, 40, 8, 36, 6],
  [14, 68, 12, 6, 2], [82, 68, 12, 6, 2],
];
const IDOL_TOWER_RECTS = [
  [2, 100, 64, 2, 1],
  [18, 18, 32, 82, 2], [18, 18, 32, 3, 3], [18, 18, 4, 82, 1],
  [24, 30, 20, 30, 5], [22, 28, 24, 3, 3],
  [28, 36, 12, 20, 2], [30, 38, 8, 4, 4],
  [30, 40, 2, 2, 4], [36, 40, 2, 2, 4], [28, 46, 12, 2, 3],
  [30, 66, 8, 4, 4],
  [18, 62, 32, 3, 1], [18, 84, 32, 3, 1],
  [14, 10, 40, 8, 2], [14, 10, 40, 2, 3],
  [12, 92, 44, 8, 6], [12, 92, 44, 2, 3],
  [2, 90, 8, 8, 2], [58, 90, 8, 8, 2],
];
const RUST_WALL_RECTS = [
  [2, 36, 64, 2, 1],
  [6, 14, 14, 22, 2], [22, 14, 14, 22, 2], [38, 14, 14, 22, 2], [54, 14, 8, 22, 2],
  [6, 14, 14, 2, 3], [22, 14, 14, 2, 3], [38, 14, 14, 2, 3], [54, 14, 8, 2, 3],
  [6, 8, 12, 6, 2], [30, 8, 12, 6, 2], [50, 8, 12, 6, 2],
  [12, 20, 2, 10, 4], [42, 22, 2, 8, 4],
  [6, 32, 56, 2, 1],
];
const SMALL_IDOL_RECTS = [
  [2, 52, 36, 2, 1],
  [10, 40, 20, 12, 6], [10, 40, 20, 2, 3],
  [13, 18, 14, 22, 2], [13, 18, 14, 2, 3],
  [15, 10, 10, 8, 2],
  [17, 12, 2, 2, 4], [21, 12, 2, 2, 4],
  [9, 22, 4, 12, 2], [27, 22, 4, 12, 2],
  [8, 48, 24, 2, 1],
];
const SPIKE_RACK_RECTS = [
  [2, 32, 52, 2, 1],
  [6, 26, 44, 6, 2], [6, 26, 44, 1, 3],
  [8, 10, 5, 16, 2], [16, 14, 5, 12, 2], [24, 8, 5, 18, 2], [32, 14, 5, 12, 2], [40, 10, 5, 16, 2],
  [8, 10, 5, 2, 3], [16, 14, 5, 2, 3], [24, 8, 5, 2, 3], [32, 14, 5, 2, 3], [40, 10, 5, 2, 3],
  [6, 30, 44, 2, 1],
];
const RUIN_STAIR_RECTS = [
  [2, 40, 48, 2, 1],
  [6, 32, 34, 8, 2], [12, 24, 28, 8, 2], [18, 16, 22, 8, 2], [24, 8, 16, 8, 2],
  [6, 32, 34, 1, 3], [12, 24, 28, 1, 3], [18, 16, 22, 1, 3], [24, 8, 16, 1, 3],
  [40, 10, 4, 30, 2], [40, 10, 4, 2, 3],
  [44, 32, 6, 6, 1],
];
const OFFERING_SLAB_RECTS = [
  [2, 32, 44, 2, 1],
  [8, 20, 32, 10, 6], [8, 20, 32, 2, 3],
  [10, 30, 6, 4, 2], [32, 30, 6, 4, 2],
  [20, 12, 8, 8, 2], [22, 10, 4, 2, 4],
  [14, 24, 20, 2, 5],
  [2, 26, 6, 6, 1], [40, 26, 6, 6, 2],
];

// ---- BONE_DESERT satellites + anchors (ossuary field) -----------------------
// Reference: section 5 row BONEZONE + section 6 row CART + section 13 st2u_*.
const SAND_TOWER_RECTS = [
  [2, 100, 68, 2, 1],
  [18, 20, 36, 80, 2], [18, 20, 36, 2, 3],
  [18, 36, 36, 2, 1], [18, 52, 36, 2, 1], [18, 68, 36, 2, 1],
  [18, 12, 10, 8, 2], [32, 12, 8, 8, 2], [44, 12, 10, 8, 2],
  [18, 12, 10, 2, 3], [32, 12, 8, 2, 3], [44, 12, 10, 2, 3],
  [30, 80, 12, 20, 5], [28, 76, 16, 4, 6],
  [54, 88, 16, 8, 3], [0, 94, 18, 6, 3],
  [6, 64, 4, 20, 4], [62, 62, 4, 18, 4],
];
const RIB_VAULT_RECTS = [
  [2, 64, 104, 2, 1],
  [8, 18, 92, 8, 5], [8, 24, 92, 4, 6],
  [16, 26, 8, 38, 5], [44, 26, 8, 38, 5], [72, 26, 8, 38, 5],
  [16, 26, 2, 38, 6], [44, 26, 2, 38, 6], [72, 26, 2, 38, 6],
  [88, 30, 14, 34, 2], [88, 30, 14, 2, 3],
  [30, 58, 24, 4, 5], [56, 60, 10, 3, 4], [20, 60, 8, 3, 4],
  [0, 62, 30, 2, 3], [78, 62, 30, 2, 3],
];
const RIB_SPIKE_RECTS = [
  [2, 56, 32, 2, 1],
  [12, 6, 10, 50, 5], [12, 6, 3, 50, 6],
  [6, 50, 24, 6, 2], [6, 50, 24, 1, 3],
  [24, 28, 3, 22, 4],
  [4, 52, 4, 4, 4], [28, 52, 4, 4, 2],
];
const DUNE_WALL_RECTS = [
  [2, 32, 64, 2, 1],
  [6, 14, 52, 16, 2], [30, 14, 2, 16, 1],
  [4, 10, 56, 4, 6], [4, 10, 56, 1, 3],
  [6, 14, 52, 2, 3],
  [0, 28, 16, 4, 3], [44, 30, 24, 4, 3],
  [20, 6, 8, 4, 5], [40, 8, 6, 3, 5],
];
const BONE_CAIRN_RECTS = [
  [2, 40, 40, 2, 1],
  [10, 30, 24, 10, 2], [10, 30, 24, 1, 3],
  [14, 21, 16, 9, 5], [14, 21, 16, 1, 6],
  [19, 12, 8, 9, 5],
  [8, 24, 4, 10, 5], [32, 22, 4, 12, 5],
  [6, 38, 32, 2, 3],
];
const FALLEN_RIB_RECTS = [
  [2, 28, 56, 2, 1],
  [8, 12, 44, 5, 5], [8, 12, 44, 1, 6],
  [8, 12, 6, 10, 5], [46, 12, 6, 10, 5],
  [14, 20, 8, 4, 4], [30, 20, 6, 4, 4], [42, 22, 8, 4, 2],
  [0, 26, 20, 2, 3], [36, 26, 24, 2, 3],
];
const SANDSTEP_RECTS = [
  [2, 36, 48, 2, 1],
  [6, 28, 40, 8, 2], [12, 20, 28, 8, 2], [18, 12, 16, 8, 2],
  [6, 28, 40, 1, 3], [12, 20, 28, 1, 3], [18, 12, 16, 1, 3],
  [2, 24, 6, 12, 2], [44, 24, 6, 12, 2],
  [0, 34, 12, 2, 3], [40, 34, 12, 2, 3],
];

// ---- VOID_REACH satellites + anchors (library court) ------------------------
// Reference: section 5 row LIBRARY + row ASTRALSTAIR + Appendix A.3 row
// atlas_LibraryTexturePacked.
const STACK_HALL_RECTS = [
  [2, 68, 104, 2, 1],
  [10, 16, 88, 52, 2], [10, 16, 88, 2, 3],
  [16, 24, 28, 4, 6], [16, 32, 28, 4, 6], [16, 40, 28, 4, 6],
  [60, 24, 28, 4, 6], [60, 32, 28, 4, 6], [60, 40, 28, 4, 6],
  [18, 24, 4, 4, 4], [28, 32, 4, 4, 5], [38, 40, 4, 4, 4],
  [62, 24, 4, 4, 5], [72, 32, 4, 4, 4], [82, 40, 4, 4, 5],
  [6, 8, 96, 8, 6], [6, 8, 96, 2, 3],
  [34, 60, 40, 4, 6], [30, 64, 48, 4, 2],
  [0, 30, 8, 38, 6], [0, 30, 8, 2, 3],
];
const ASTRAL_STAIR_RECTS = [
  [2, 100, 72, 2, 1],
  [10, 20, 24, 80, 2], [10, 20, 24, 2, 3],
  [34, 40, 32, 60, 2],
  [34, 44, 32, 2, 4], [34, 52, 32, 2, 4], [34, 60, 32, 2, 4],
  [34, 68, 32, 2, 4], [34, 76, 32, 2, 4],
  [38, 24, 24, 16, 6], [42, 28, 16, 8, 4],
  [64, 60, 8, 40, 6], [64, 60, 8, 2, 3],
  [6, 96, 64, 4, 2],
  [52, 88, 10, 6, 2], [52, 88, 10, 2, 5],
];
const BROKEN_COLUMN_RECTS = [
  [2, 56, 36, 2, 1],
  [8, 48, 24, 8, 2], [8, 48, 24, 1, 3],
  [13, 16, 14, 32, 2], [13, 16, 14, 1, 3],
  [10, 10, 20, 6, 6], [10, 10, 20, 1, 3],
  [18, 26, 3, 10, 4],
  [26, 50, 10, 4, 2], [28, 44, 8, 4, 6],
  [15, 32, 6, 4, 4],
];
const RUNE_SLAB_RECTS = [
  [2, 36, 44, 2, 1],
  [10, 14, 28, 20, 6], [10, 14, 28, 2, 3],
  [14, 18, 6, 2, 4], [24, 18, 6, 2, 4], [14, 24, 8, 2, 4], [26, 24, 6, 2, 5], [18, 29, 12, 2, 4],
  [8, 34, 32, 3, 2],
  [2, 28, 6, 8, 2], [40, 28, 6, 8, 2],
];
const TOME_PILE_RECTS = [
  [2, 32, 48, 2, 1],
  [8, 22, 16, 8, 2], [26, 22, 18, 8, 6], [12, 14, 16, 8, 6], [28, 14, 14, 8, 2],
  [8, 22, 16, 1, 4], [26, 22, 18, 1, 4], [12, 14, 16, 1, 4], [28, 14, 14, 1, 4],
  [14, 22, 2, 8, 5], [32, 14, 2, 8, 5],
  [22, 6, 8, 4, 4],
];
const VOID_BRAZIER_RECTS = [
  [2, 48, 36, 2, 1],
  [14, 22, 12, 26, 2], [14, 22, 12, 2, 3],
  [10, 44, 20, 3, 6],
  [8, 14, 24, 8, 6], [8, 14, 24, 2, 3],
  [15, 4, 10, 10, 4], [17, 6, 6, 6, 5],
  [12, 24, 16, 2, 4],
];
const ARCH_FRAG_RECTS = [
  [2, 40, 52, 2, 1],
  [8, 18, 10, 22, 2], [8, 18, 10, 2, 3],
  [38, 18, 10, 22, 2], [38, 18, 10, 2, 3],
  [14, 34, 28, 5, 6], [14, 34, 28, 1, 3],
  [10, 10, 8, 4, 2], [38, 10, 8, 4, 2],
  [10, 24, 3, 8, 4], [42, 24, 3, 8, 4],
];

// ---- CINDER_MAW satellites + anchors (kiln yard) ----------------------------
// Reference: section 5 row TOWER + row TOWERBRIDGE + Appendix A.3 row
// atlas_TowerTexturePacked + section 6 row BRAZIER2.
const MACHINE_HOUSE_RECTS = [
  [2, 72, 100, 2, 1],
  [10, 24, 62, 48, 2], [10, 24, 62, 2, 3],
  [6, 16, 70, 8, 2], [6, 16, 70, 2, 3],
  [18, 34, 12, 10, 1], [20, 36, 8, 4, 4], [46, 34, 12, 10, 1], [48, 36, 8, 4, 5],
  [30, 52, 12, 20, 1], [32, 56, 8, 8, 4],
  [72, 36, 24, 36, 2], [72, 36, 24, 2, 3],
  [78, 52, 12, 20, 1], [80, 58, 8, 6, 4],
  [72, 28, 24, 4, 6], [90, 32, 3, 8, 2],
  [0, 66, 10, 6, 6], [94, 66, 10, 6, 2],
];
const EMBER_STACK_RECTS = [
  [2, 104, 64, 2, 1],
  [10, 84, 48, 20, 2], [10, 84, 48, 2, 3],
  [28, 90, 12, 14, 1], [30, 94, 8, 6, 4],
  [24, 12, 20, 72, 2], [24, 12, 20, 2, 3], [24, 12, 4, 72, 1],
  [24, 28, 20, 2, 1], [24, 48, 20, 2, 1], [24, 68, 20, 2, 1],
  [22, 6, 24, 6, 1], [26, 2, 16, 4, 4],
  [46, 40, 8, 44, 2], [46, 40, 8, 2, 3],
  [48, 56, 4, 3, 5],
  [4, 96, 10, 6, 6], [54, 96, 10, 6, 2],
];
const SLAG_BLOCK_RECTS = [
  [2, 36, 44, 2, 1],
  [10, 12, 28, 24, 2], [10, 12, 28, 2, 3],
  [16, 18, 3, 12, 4], [26, 22, 3, 10, 4], [20, 28, 12, 2, 1],
  [12, 8, 24, 4, 2],
  [2, 28, 8, 8, 1], [38, 28, 8, 8, 2],
  [30, 14, 3, 3, 5],
];
const PIPE_RUN_RECTS = [
  [2, 28, 60, 2, 1],
  [6, 12, 52, 4, 2], [6, 20, 52, 4, 6],
  [14, 10, 4, 16, 3], [34, 10, 4, 16, 3], [50, 10, 4, 16, 3],
  [10, 24, 6, 4, 1], [40, 24, 6, 4, 1],
  [24, 6, 6, 6, 2], [25, 7, 4, 2, 4],
];
const COAL_HEAP_RECTS = [
  [2, 32, 48, 2, 1],
  [8, 18, 36, 14, 6], [14, 12, 24, 6, 6],
  [14, 12, 24, 2, 3],
  [6, 24, 8, 8, 1], [38, 24, 8, 8, 1], [22, 20, 10, 8, 1],
  [18, 20, 2, 2, 4], [32, 22, 2, 2, 4], [26, 14, 2, 2, 5],
];
const FURNACE_DOOR_RECTS = [
  [2, 40, 40, 2, 1],
  [10, 12, 24, 28, 2], [10, 12, 24, 2, 3],
  [8, 8, 28, 4, 2],
  [16, 22, 12, 18, 1], [18, 28, 8, 8, 4], [20, 30, 4, 4, 5],
  [14, 18, 16, 4, 6],
  [34, 24, 8, 16, 2], [34, 24, 8, 2, 3],
  [2, 36, 8, 4, 6],
];
const GEAR_RACK_RECTS = [
  [2, 36, 48, 2, 1],
  [8, 8, 36, 4, 2], [8, 28, 36, 4, 2], [8, 8, 4, 24, 2], [40, 8, 4, 24, 2],
  [14, 14, 10, 10, 3], [28, 14, 10, 10, 3],
  [17, 17, 4, 4, 1], [31, 17, 4, 4, 1],
  [14, 12, 10, 2, 6], [28, 24, 10, 2, 6],
  [12, 18, 28, 2, 4],
];

// ---- WHITEOUT satellites + anchors (clock compound) -------------------------
// Reference: section 5 TOWER rows + Appendix A.3 row atlas_TP_Stage5_ClockTower
// + section 6 row WEATHERNODE.
const GEAR_HALL_RECTS = [
  [2, 68, 100, 2, 1],
  [10, 20, 84, 48, 2], [10, 20, 84, 2, 3],
  [38, 28, 28, 28, 5], [40, 30, 24, 24, 2],
  [44, 26, 4, 4, 3], [58, 26, 4, 4, 3], [44, 54, 4, 4, 3], [58, 54, 4, 4, 3],
  [36, 38, 4, 4, 3], [64, 38, 4, 4, 3],
  [50, 38, 4, 8, 6], [46, 42, 12, 2, 6],
  [16, 44, 12, 24, 5], [22, 48, 2, 16, 6],
  [6, 14, 92, 6, 4], [6, 18, 92, 2, 1],
  [76, 32, 10, 10, 5], [78, 34, 6, 4, 6],
  [0, 64, 12, 6, 4], [92, 64, 12, 6, 4],
];
const WHITE_TOWER_RECTS = [
  [2, 100, 64, 2, 1],
  [20, 20, 28, 80, 2], [20, 20, 28, 2, 3], [20, 20, 4, 80, 1],
  [30, 32, 8, 3, 5], [30, 48, 8, 3, 5], [30, 64, 8, 3, 5],
  [20, 40, 28, 3, 4], [20, 72, 28, 3, 4],
  [16, 12, 36, 8, 4], [14, 84, 40, 6, 4],
  [24, 4, 20, 8, 4], [24, 4, 20, 2, 3],
  [26, 88, 16, 12, 5],
  [14, 96, 40, 4, 2],
  [0, 96, 14, 6, 4], [54, 96, 14, 6, 4],
];
const SNOW_RAMPART_RECTS = [
  [2, 32, 64, 2, 1],
  [6, 14, 56, 18, 2], [6, 14, 56, 2, 3],
  [6, 8, 10, 6, 2], [22, 8, 10, 6, 2], [38, 8, 10, 6, 2], [54, 8, 8, 6, 2],
  [4, 4, 60, 4, 4],
  [6, 28, 56, 2, 4],
  [32, 14, 2, 18, 1],
  [0, 30, 10, 4, 4], [58, 30, 10, 4, 4],
];
const VANE_POST_RECTS = [
  [2, 52, 32, 2, 1],
  [15, 14, 6, 38, 2], [15, 14, 6, 2, 3],
  [6, 20, 24, 3, 2], [10, 30, 16, 2, 3],
  [28, 19, 6, 5, 3],
  [6, 19, 4, 5, 4],
  [13, 8, 10, 6, 4],
  [13, 36, 10, 8, 5], [15, 38, 6, 4, 6],
  [11, 48, 14, 4, 2],
];
const CLOCK_FRAG_RECTS = [
  [2, 36, 48, 2, 1],
  [12, 6, 28, 28, 4], [14, 8, 24, 24, 5],
  [12, 6, 28, 2, 3], [12, 32, 28, 2, 3], [12, 6, 2, 28, 3], [38, 6, 2, 28, 3],
  [25, 10, 2, 12, 6], [25, 20, 10, 2, 6],
  [24, 19, 4, 4, 3],
  [6, 34, 40, 3, 4],
  [2, 28, 8, 6, 2], [42, 28, 8, 6, 2],
];
const FROST_CAIRN_RECTS = [
  [2, 40, 40, 2, 1],
  [10, 30, 24, 10, 2], [10, 30, 24, 1, 4],
  [14, 21, 16, 9, 3], [14, 21, 16, 1, 4],
  [19, 12, 8, 9, 4], [17, 10, 12, 2, 4],
  [26, 23, 4, 2, 3],
  [6, 38, 32, 2, 4],
];
const LAMP_ROW_RECTS = [
  [2, 36, 56, 2, 1],
  [8, 26, 44, 3, 2],
  [12, 10, 4, 16, 2], [8, 4, 12, 8, 5], [10, 6, 8, 4, 6], [8, 2, 12, 2, 4],
  [44, 10, 4, 16, 2], [40, 4, 12, 8, 5], [42, 6, 8, 4, 6], [40, 2, 12, 2, 4],
  [10, 30, 8, 4, 2], [42, 30, 8, 4, 2],
];

function makeBuilding(id, name, blurb, w, h, rects, palette, role) {
  return { id, name, blurb, w, h, rects, palette, rectCount: rects.length,
    role: role || 'anchor' };
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
  // PORT SLICE J: the per-biome kits (grammar G1/G8 — 3 anchors + 5
  // satellites each; the slice-E eight above stay first = biome anchors).
  // VERDANT_HOLLOW (timber hamlet).
  GROVE_HALL: makeBuilding('GROVE_HALL', 'grove hall',
    'a long timber hall among the groves', 104, 68, GROVE_HALL_RECTS, PAL_HOLLOW),
  LOOKOUT: makeBuilding('LOOKOUT', 'lookout',
    'a timber watch tower over the groves', 64, 104, LOOKOUT_RECTS, PAL_HOLLOW),
  WOODSHED: makeBuilding('WOODSHED', 'woodshed',
    'a lean-to shed stacked with cut wood', 56, 44, WOODSHED_RECTS, PAL_HOLLOW, 'satellite'),
  PALISADE: makeBuilding('PALISADE', 'palisade',
    'a staked fence run marking the clearing', 68, 36, PALISADE_RECTS, PAL_HOLLOW, 'satellite'),
  LOGPILE: makeBuilding('LOGPILE', 'log pile',
    'winter cordwood stacked to season', 52, 36, LOGPILE_RECTS, PAL_HOLLOW, 'satellite'),
  HERB_RACK: makeBuilding('HERB_RACK', 'herb rack',
    'a drying rack hung with cut herbs', 48, 44, HERB_RACK_RECTS, PAL_HOLLOW, 'satellite'),
  STUMP_SHRINE: makeBuilding('STUMP_SHRINE', 'stump shrine',
    'a carved stump keeping a small offering', 44, 52, STUMP_SHRINE_RECTS, PAL_HOLLOW, 'satellite'),
  // ASHEN_WASTE (basalt ruin-field).
  CINDER_GATE: makeBuilding('CINDER_GATE', 'cinder gate',
    'a breached gate of scorched basalt', 108, 76, CINDER_GATE_RECTS, PAL_ASHEN),
  BASALT_SPIRE: makeBuilding('BASALT_SPIRE', 'basalt spire',
    'a heat-cracked spire over the ash', 68, 104, BASALT_SPIRE_RECTS, PAL_ASHEN),
  EMBER_CAIRN: makeBuilding('EMBER_CAIRN', 'ember cairn',
    'scorched stones stacked over live coals', 48, 44, EMBER_CAIRN_RECTS, PAL_ASHEN, 'satellite'),
  BROKEN_PIER: makeBuilding('BROKEN_PIER', 'broken pier',
    'a snapped column still carrying heat', 40, 64, BROKEN_PIER_RECTS, PAL_ASHEN, 'satellite'),
  SLAG_HEAP: makeBuilding('SLAG_HEAP', 'slag heap',
    'a cooled mound of furnace waste', 56, 36, SLAG_HEAP_RECTS, PAL_ASHEN, 'satellite'),
  SCORCH_WALL: makeBuilding('SCORCH_WALL', 'scorch wall',
    'a breached wall stub with an ember lip', 68, 40, SCORCH_WALL_RECTS, PAL_ASHEN, 'satellite'),
  FIRE_BOWL: makeBuilding('FIRE_BOWL', 'fire bowl',
    'a stone stand holding a watch flame', 44, 48, FIRE_BOWL_RECTS, PAL_ASHEN, 'satellite'),
  // SNOWFIELD (chapel close).
  BELFRY: makeBuilding('BELFRY', 'belfry',
    'a snow-capped bell tower over the close', 64, 108, BELFRY_RECTS, PAL_SNOW),
  PILGRIM_HALL: makeBuilding('PILGRIM_HALL', 'pilgrim hall',
    'a long hall for snowbound travellers', 108, 68, PILGRIM_HALL_RECTS, PAL_SNOW),
  SNOW_WALL: makeBuilding('SNOW_WALL', 'snow wall',
    'a breached close wall under its snowcap', 68, 36, SNOW_WALL_RECTS, PAL_SNOW, 'satellite'),
  ICE_CAIRN: makeBuilding('ICE_CAIRN', 'ice cairn',
    'ice-set stones marking the path', 44, 44, ICE_CAIRN_RECTS, PAL_SNOW, 'satellite'),
  SHRINE_POST: makeBuilding('SHRINE_POST', 'shrine post',
    'a lantern post keeping the path lit', 36, 56, SHRINE_POST_RECTS, PAL_SNOW, 'satellite'),
  WAYMARK: makeBuilding('WAYMARK', 'waymark',
    'a beamed waymark with its hanging sign', 60, 36, WAYMARK_RECTS, PAL_SNOW, 'satellite'),
  FROST_STEP: makeBuilding('FROST_STEP', 'frost step',
    'a stepped platform worn by pilgrims', 52, 40, FROST_STEP_RECTS, PAL_SNOW, 'satellite'),
  // BLOOD_RUST (keep compound).
  PROFANE_GATE: makeBuilding('PROFANE_GATE', 'profane gate',
    'a twin-pylon gate with a dark mouth', 108, 80, PROFANE_GATE_RECTS, PAL_RUST),
  IDOL_TOWER: makeBuilding('IDOL_TOWER', 'idol tower',
    'a tower keeping an idol in its niche', 68, 104, IDOL_TOWER_RECTS, PAL_RUST),
  RUST_WALL: makeBuilding('RUST_WALL', 'rust wall',
    'a merloned wall run veined with rust', 68, 40, RUST_WALL_RECTS, PAL_RUST, 'satellite'),
  SMALL_IDOL: makeBuilding('SMALL_IDOL', 'small idol',
    'a rust-lit idol on its pedestal', 40, 56, SMALL_IDOL_RECTS, PAL_RUST, 'satellite'),
  SPIKE_RACK: makeBuilding('SPIKE_RACK', 'spike rack',
    'a rack of iron spikes facing outward', 56, 36, SPIKE_RACK_RECTS, PAL_RUST, 'satellite'),
  RUIN_STAIR: makeBuilding('RUIN_STAIR', 'ruin stair',
    'a broken stair climbing to nothing', 52, 44, RUIN_STAIR_RECTS, PAL_RUST, 'satellite'),
  OFFERING_SLAB: makeBuilding('OFFERING_SLAB', 'offering slab',
    'a stained slab holding a dark bowl', 48, 36, OFFERING_SLAB_RECTS, PAL_RUST, 'satellite'),
  // BONE_DESERT (ossuary field).
  SAND_TOWER: makeBuilding('SAND_TOWER', 'sand tower',
    'a sand-scoured stub tower over the dunes', 72, 104, SAND_TOWER_RECTS, PAL_BONE),
  RIB_VAULT: makeBuilding('RIB_VAULT', 'rib vault',
    'a long vault roofed with great ribs', 108, 68, RIB_VAULT_RECTS, PAL_BONE),
  RIB_SPIKE: makeBuilding('RIB_SPIKE', 'rib spike',
    'a single great rib standing in the sand', 36, 60, RIB_SPIKE_RECTS, PAL_BONE, 'satellite'),
  DUNE_WALL: makeBuilding('DUNE_WALL', 'dune wall',
    'a sandstone run half-buried in the dune', 68, 36, DUNE_WALL_RECTS, PAL_BONE, 'satellite'),
  BONE_CAIRN: makeBuilding('BONE_CAIRN', 'bone cairn',
    'picked bones stacked over stones', 44, 44, BONE_CAIRN_RECTS, PAL_BONE, 'satellite'),
  FALLEN_RIB: makeBuilding('FALLEN_RIB', 'fallen rib',
    'a great rib down among its fragments', 60, 32, FALLEN_RIB_RECTS, PAL_BONE, 'satellite'),
  SANDSTEP: makeBuilding('SANDSTEP', 'sandstep',
    'a half-buried stair to a lost floor', 52, 40, SANDSTEP_RECTS, PAL_BONE, 'satellite'),
  // VOID_REACH (library court).
  STACK_HALL: makeBuilding('STACK_HALL', 'stack hall',
    'a hall of shelves lit from nowhere', 108, 72, STACK_HALL_RECTS, PAL_VOID),
  ASTRAL_STAIR: makeBuilding('ASTRAL_STAIR', 'astral stair',
    'a stair tower climbing out of the dark', 76, 104, ASTRAL_STAIR_RECTS, PAL_VOID),
  BROKEN_COLUMN: makeBuilding('BROKEN_COLUMN', 'broken column',
    'a snapped column keeping one lit block', 40, 60, BROKEN_COLUMN_RECTS, PAL_VOID, 'satellite'),
  RUNE_SLAB: makeBuilding('RUNE_SLAB', 'rune slab',
    'a fallen slab still spelling light', 48, 40, RUNE_SLAB_RECTS, PAL_VOID, 'satellite'),
  TOME_PILE: makeBuilding('TOME_PILE', 'tome pile',
    'great books stacked where they fell', 52, 36, TOME_PILE_RECTS, PAL_VOID, 'satellite'),
  VOID_BRAZIER: makeBuilding('VOID_BRAZIER', 'void brazier',
    'a stand holding a violet flame', 40, 52, VOID_BRAZIER_RECTS, PAL_VOID, 'satellite'),
  ARCH_FRAG: makeBuilding('ARCH_FRAG', 'arch fragment',
    'two stubs and the lintel between them', 56, 44, ARCH_FRAG_RECTS, PAL_VOID, 'satellite'),
  // CINDER_MAW (kiln yard).
  MACHINE_HOUSE: makeBuilding('MACHINE_HOUSE', 'machine house',
    'a soot-black house with its annex', 104, 76, MACHINE_HOUSE_RECTS, PAL_CINDER),
  EMBER_STACK: makeBuilding('EMBER_STACK', 'ember stack',
    'a tapered stack breathing heat', 68, 108, EMBER_STACK_RECTS, PAL_CINDER),
  SLAG_BLOCK: makeBuilding('SLAG_BLOCK', 'slag block',
    'one great cooled block, split by heat', 48, 40, SLAG_BLOCK_RECTS, PAL_CINDER, 'satellite'),
  PIPE_RUN: makeBuilding('PIPE_RUN', 'pipe run',
    'low pressure pipes on jointed stands', 64, 32, PIPE_RUN_RECTS, PAL_CINDER, 'satellite'),
  COAL_HEAP: makeBuilding('COAL_HEAP', 'coal heap',
    'a heaped mound of furnace coal', 52, 36, COAL_HEAP_RECTS, PAL_CINDER, 'satellite'),
  FURNACE_DOOR: makeBuilding('FURNACE_DOOR', 'furnace door',
    'a small annex with its ember mouth', 44, 44, FURNACE_DOOR_RECTS, PAL_CINDER, 'satellite'),
  GEAR_RACK: makeBuilding('GEAR_RACK', 'gear rack',
    'a frame of seized gears and one axle', 52, 40, GEAR_RACK_RECTS, PAL_CINDER, 'satellite'),
  // WHITEOUT (clock compound).
  GEAR_HALL: makeBuilding('GEAR_HALL', 'gear hall',
    'a snow-capped hall keeping one great gear', 104, 72, GEAR_HALL_RECTS, PAL_WHITE),
  WHITE_TOWER: makeBuilding('WHITE_TOWER', 'white tower',
    'a snow-banded tower over the white', 68, 104, WHITE_TOWER_RECTS, PAL_WHITE),
  SNOW_RAMPART: makeBuilding('SNOW_RAMPART', 'snow rampart',
    'a crenelled rampart under deep snow', 68, 36, SNOW_RAMPART_RECTS, PAL_WHITE, 'satellite'),
  VANE_POST: makeBuilding('VANE_POST', 'vane post',
    'a weather vane post with its lamp', 36, 56, VANE_POST_RECTS, PAL_WHITE, 'satellite'),
  CLOCK_FRAG: makeBuilding('CLOCK_FRAG', 'clock fragment',
    'a fallen clock face keeping dead time', 52, 40, CLOCK_FRAG_RECTS, PAL_WHITE, 'satellite'),
  FROST_CAIRN: makeBuilding('FROST_CAIRN', 'frost cairn',
    'frost-set stones under their snowcap', 44, 44, FROST_CAIRN_RECTS, PAL_WHITE, 'satellite'),
  LAMP_ROW: makeBuilding('LAMP_ROW', 'lamp row',
    'twin storm lamps on a railed stand', 60, 40, LAMP_ROW_RECTS, PAL_WHITE, 'satellite'),
};

export const STAGE_BUILDING_IDS = Object.keys(STAGE_BUILDINGS);

// Stage identity each building serves (src/stages.js ids). Unlisted / unset
// stages read the hollow lodge — every arena keeps one roof in sight.
// PORT SLICE J: each stage owns a KIT — 3 anchors (the slice-E building
// first) + 5 satellite outbuildings (grammar G1/G8). No cap on counts: the
// kit is recombined per cell by hash, and the bounds are measured perf (G7)
// and the pilot-fit separation floor (G5), never a preset number.
const BUILDING_BY_STAGE = {
  VERDANT_HOLLOW: ['HOLLOW_LODGE', 'GROVE_HALL', 'LOOKOUT',
    'WOODSHED', 'PALISADE', 'LOGPILE', 'HERB_RACK', 'STUMP_SHRINE'],
  ASHEN_WASTE: ['EMBER_HALL', 'CINDER_GATE', 'BASALT_SPIRE',
    'EMBER_CAIRN', 'BROKEN_PIER', 'SLAG_HEAP', 'SCORCH_WALL', 'FIRE_BOWL'],
  SNOWFIELD: ['DRIFT_CHAPEL', 'BELFRY', 'PILGRIM_HALL',
    'SNOW_WALL', 'ICE_CAIRN', 'SHRINE_POST', 'WAYMARK', 'FROST_STEP'],
  BLOOD_RUST: ['RUST_KEEP', 'PROFANE_GATE', 'IDOL_TOWER',
    'RUST_WALL', 'SMALL_IDOL', 'SPIKE_RACK', 'RUIN_STAIR', 'OFFERING_SLAB'],
  BONE_DESERT: ['OSSUARY_ARCH', 'SAND_TOWER', 'RIB_VAULT',
    'RIB_SPIKE', 'DUNE_WALL', 'BONE_CAIRN', 'FALLEN_RIB', 'SANDSTEP'],
  VOID_REACH: ['VOID_ANNEX', 'STACK_HALL', 'ASTRAL_STAIR',
    'BROKEN_COLUMN', 'RUNE_SLAB', 'TOME_PILE', 'VOID_BRAZIER', 'ARCH_FRAG'],
  CINDER_MAW: ['CINDER_KILN', 'MACHINE_HOUSE', 'EMBER_STACK',
    'SLAG_BLOCK', 'PIPE_RUN', 'COAL_HEAP', 'FURNACE_DOOR', 'GEAR_RACK'],
  WHITEOUT: ['CLOCKWAY_STUB', 'GEAR_HALL', 'WHITE_TOWER',
    'SNOW_RAMPART', 'VANE_POST', 'CLOCK_FRAG', 'FROST_CAIRN', 'LAMP_ROW'],
};

export function buildingForStage(stageId) {
  const kit = BUILDING_BY_STAGE[stageId] || BUILDING_BY_STAGE.VERDANT_HOLLOW;
  return STAGE_BUILDINGS[kit[0]];
}

// Every design of the stage's kit (anchor first). The composition grammar
// (G2) reads this: one anchor + up to three satellites per building-cell.
export function designsForStage(stageId) {
  const kit = BUILDING_BY_STAGE[stageId] || BUILDING_BY_STAGE.VERDANT_HOLLOW;
  return kit.map(id => STAGE_BUILDINGS[id]);
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

// ---- PORT SLICE F: the pure collision query --------------------------------
// Collision shapes = the EXISTING rect-list footprints (whole [w,h] boxes,
// never the inner rects): one box per placed structure, no new art, no new
// numbers. Everything here is pure in (seed, stageId, coords): no clock, no
// DOM, no run objects, nothing written. The motion seam (main.js
// runController) applies it; the paint path never calls it.
//
// SINGLE SOURCE (slice J): the field math lives in buildingPlacements (one
// pure function of (seed, stage)); this query projects it to boxes, and the
// render.js paint pass reads the same array. The old MIRROR WARNING retires
// with the render.js inline math — paint and blocking agree box for box by
// construction, and the agreement test (test_building_collision.mjs) still
// fails loudly if they ever drift.

// The pilot body radius (pilot reads ~14px across — the STUMP comment in
// render.js; collision keeps a 7px ring around the centre point).
export const BUILDING_MOVER_R = 7;
// Fixed-point clearance margin: a footprint edge must stand this far clear
// of the run's fixed floor points (below).
export const BUILDING_CLEAR_MARGIN = 12;

// The run's fixed floor points, in world coords: the run-start footing
// (startRun parks the pilot at VIEW_W/2, VIEW_H/2), the first-run draught
// (PROLOGUE POTION_DX/DY off the footing) and the milestone chest slot
// (RUN_CHEST DX/DY off the footing, the mirrored side). All three derive
// from the same CONFIG knobs the run setup reads, so the points can never
// drift from the run they clear.
export function buildingFixedPoints() {
  const sx = C.VIEW_W / 2, sy = C.VIEW_H / 2;
  return [
    [sx, sy],
    [sx + C.PROLOGUE.POTION_DX, sy + C.PROLOGUE.POTION_DY],
    [sx + C.RUN_CHEST.DX, sy + C.RUN_CHEST.DY],
  ];
}

// The building-cell hash — the same integer-mix render.js cellRand runs,
// with the building pass's own salts, so the field hashes deterministically
// per (cell, seed) without touching the clock or the DOM.
function bHash(cx, cy, seed, salt) {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Shift a cell-(0,0) anchor right until no fixed floor point sits inside the
// footprint (expanded by BUILDING_CLEAR_MARGIN). Monotone: each shift moves
// +x only, so points cleared earlier stay cleared; the view-edge clamp
// (cap) itself clears every point (cap >= VIEW_W - 116 > each point's x),
// so one ordered pass always lands clear. Only cell (0,0) ever calls this —
// it is the one cell whose anchor range can reach the fixed points.
export function clearFixedPoints(ax, ay, w, h) {
  const cap = C.VIEW_W - w - 8;
  const pts = buildingFixedPoints().slice().sort((a, b) => a[0] - b[0]);
  let x = ax;
  for (const [px, py] of pts) {
    if (px >= x - BUILDING_CLEAR_MARGIN && px <= x + w + BUILDING_CLEAR_MARGIN &&
        py >= ay - BUILDING_CLEAR_MARGIN && py <= ay + h + BUILDING_CLEAR_MARGIN) {
      x = Math.min(cap, px + BUILDING_CLEAR_MARGIN + 1);
    }
  }
  return { x, y: ay };
}

// ---- PORT SLICE J: the composition grammar, single-sourced ----------------
// Grammar G2/G3/G5: EVERY building-cell composes 1 anchor + up to
// MAX_SATELLITES satellites (a hamlet/compound/cluster, never a singleton) —
// the slice-E rare-gate is REMOVED (owner directive: no artificial count
// cap). Spacing rhythm comes from the retained 576px cell pitch plus the
// pilot-fit separation floor below, never from a density number.
//
// SINGLE SOURCE (grammar G6): this section is the ONLY place that decides
// where structures stand. buildingPlacements(seed, stageId) emits every
// placed box ({ id, x, y, w, h }, deterministic per (seed, stage)); the
// render.js paint pass, buildingFootprints (collision), the loot filter, the
// portal and the chest clamps all read it — paint == query by construction,
// no mirror to drift (the slice-F MIRROR WARNING retires with the inline
// field math it warned about).
//
// Lanes, not counts (grammar G5): kept boxes hold >= BUILDING_SEPARATION px
// of edge gap to every previously kept box (the pilot reads ~14px across,
// ring 7px — a 16px lane always fits the body). Enforcement is geometric and
// deterministic (fixed order, violators dropped), never a count cap.

// The pilot-fit separation floor: every pair of kept boxes stands this far
// apart edge-to-edge, arena-wide. Justified by the mover body (14px): a lane
// narrower than this could wedge the pilot; at this floor every lane walks.
export const BUILDING_SEPARATION = 16;
// Satellites per cluster: each cell composes 1 anchor + 2..MAX_SATELLITES
// satellites (owner directive: more is better — the max is set by the
// measured perf bound, grammar G7; the min of 2 keeps the never-a-singleton
// promise per cell, spawn cell: anchor + >= 1 in view).
export const MAX_SATELLITES = 4;

// Edge gap between two boxes (0 when they touch or overlap).
function edgeGap(a, b) {
  const ox = Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w);
  const oy = Math.max(a.y, b.y) < Math.min(a.y + a.h, b.y + b.h);
  if (ox && oy) return 0;
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  if (ox) return dy;
  if (oy) return dx;
  return Math.hypot(dx, dy);
}

// The anchor design + anchor position for one building-cell: the design is a
// hash pick among the kit's anchors (salt 24), the position the slice-E
// anchor math (salts 22/23 — unchanged ranges, so old anchors stand where
// the slice-E/F pins left them when the same design draws).
function clusterAnchor(bx, by, seed, anchors) {
  const BC = C.GROUND.BUILDING_CELL;
  const ad = anchors[Math.floor(bHash(bx, by, seed, 24) * anchors.length) % anchors.length];
  return {
    id: ad.id, w: ad.w, h: ad.h,
    x: bx * BC + 48 + Math.floor(bHash(bx, by, seed, 22) * (BC - 96 - ad.w)),
    y: by * BC + 48 + Math.floor(bHash(bx, by, seed, 23) * (BC - 96 - ad.h)),
  };
}

// One satellite candidate at compass slot s (0=E,1=S,2=W,3=N) around the
// anchor: hash design (distinct within the cluster), hash jitter along the
// slot axis, fixed gap for the spawn cell (the spawn-fit proof in
// buildingPlacements needs gap 16 there) and 20..64px elsewhere.
function satelliteAt(slot, seed, bx, by, anchor, sats, chosen, spawn) {
  let di = Math.floor(bHash(bx, by, seed, 40 + slot) * sats.length) % sats.length;
  for (let k = 0; k < sats.length; k++) {
    if (!chosen.includes(sats[(di + k) % sats.length].id)) { di = (di + k) % sats.length; break; }
  }
  const sd = sats[di];
  const gap = spawn ? 16 : 20 + Math.floor(bHash(bx, by, seed, 61 + slot) * 45);
  const j = bHash(bx, by, seed, 60 + slot);
  let x = anchor.x, y = anchor.y;
  if (slot === 0) {
    x = anchor.x + anchor.w + gap;
    y = anchor.h >= sd.h ? anchor.y + Math.floor(j * (anchor.h - sd.h + 1))
      : anchor.y - Math.floor(j * (sd.h - anchor.h + 1));
  } else if (slot === 1) {
    y = anchor.y + anchor.h + gap;
    x = anchor.w >= sd.w ? anchor.x + Math.floor(j * (anchor.w - sd.w + 1))
      : anchor.x - Math.floor(j * (sd.w - anchor.w + 1));
  } else if (slot === 2) {
    x = anchor.x - gap - sd.w;
    y = anchor.h >= sd.h ? anchor.y + Math.floor(j * (anchor.h - sd.h + 1))
      : anchor.y - Math.floor(j * (sd.h - anchor.h + 1));
  } else {
    y = anchor.y - gap - sd.h;
    x = anchor.w >= sd.w ? anchor.x + Math.floor(j * (anchor.w - sd.w + 1))
      : anchor.x - Math.floor(j * (sd.w - anchor.w + 1));
  }
  return { id: sd.id, x, y, w: sd.w, h: sd.h };
}

function rimInside(b) {
  const RIM = C.GROUND.RIM;
  return b.x >= -RIM + 4 && b.x + b.w <= RIM - 4 &&
    b.y >= -RIM + 4 && b.y + b.h <= RIM - 4;
}

// Every placed structure on the arena, in world coords
// ({ id, x, y, w, h }): each building-cell's anchor (rim-culled; the spawn
// anchor clamped whole into the initial view and cleared off the run's floor
// points) plus its satellites (rim-culled, separation-kept, view-kept and
// point-clear for the spawn cell). Deterministic per (seed, stageId).
// No density gate: every cell composes.
export function buildingPlacements(seed, stageId) {
  const BC = C.GROUND.BUILDING_CELL;
  const RIM = C.GROUND.RIM;
  const kit = designsForStage(stageId);
  const anchors = kit.filter(b => b.role !== 'satellite');
  const sats = kit.filter(b => b.role === 'satellite');
  const lo = Math.floor(-RIM / BC), hi = Math.floor(RIM / BC);
  const kept = [];
  const anchorByCell = new Map();
  // Pass 1 — anchors. The spawn anchor (cell 0,0) places FIRST: rigid-clamped
  // whole into the initial camera view, then the fixed-point clearance shift
  // (grammar G4: the spawn view shows the composition, never an empty field,
  // and the run's floor points stand clear). Every other anchor is kept iff
  // rim-inside AND separation-kept against all previously kept anchors (the
  // spawn clamp can push the spawn anchor toward its neighbours, so anchors
  // check each other — fixed row-major order after the spawn cell, violators
  // deterministically dropped, never shifted). Nothing moves after this, so
  // every gap set below holds by construction.
  const spawnNatural = clusterAnchor(0, 0, seed, anchors);
  spawnNatural.x = Math.min(Math.max(spawnNatural.x, 8), C.VIEW_W - spawnNatural.w - 8);
  spawnNatural.y = Math.min(Math.max(spawnNatural.y, 8), C.VIEW_H - spawnNatural.h - 8);
  {
    const cl = clearFixedPoints(spawnNatural.x, spawnNatural.y, spawnNatural.w, spawnNatural.h);
    spawnNatural.x = cl.x; spawnNatural.y = cl.y;
  }
  if (rimInside(spawnNatural)) {
    spawnNatural.spawn = true;
    kept.push(spawnNatural);
    anchorByCell.set('0,0', spawnNatural);
  }
  for (let by = lo; by <= hi; by++) {
    for (let bx = lo; bx <= hi; bx++) {
      if (bx === 0 && by === 0) continue;
      const a = clusterAnchor(bx, by, seed, anchors);
      if (!rimInside(a)) continue;
      let ok = true;
      for (const q of kept) {
        if (edgeGap(a, q) < BUILDING_SEPARATION) { ok = false; break; }
      }
      if (!ok) continue;
      kept.push(a);
      anchorByCell.set(bx + ',' + by, a);
    }
  }
  const spawnAnchor = anchorByCell.get('0,0') || null;
  // Pass 2 — spawn-cluster satellites: all four slots tried in hash-rotated
  // order, cross-axis clamped into the view. The primary-axis fit proof (gap
  // 16: with the anchor clamped to 8px margins, an E-or-W slot and an N-or-S
  // slot ALWAYS fit — w + 2*satW <= 252 < 433 and 2*satH <= 144 < 153 for
  // every kit size) means at least one slot fits whatever the clamp did.
  // Kept iff fully in view + separation-kept + standing clear of the run's
  // fixed floor points (the mover ring + 1, the binding no-stand-inside
  // rule). Furthest-first, so the least-placed satellite would drop first —
  // the spawn view keeps anchor + >= 1 satellite for every (seed, stage).
  if (spawnAnchor) {
    const rot = Math.floor(bHash(0, 0, seed, 29) * 4) % 4;
    const order = [0, 1, 2, 3].map(i => (i + rot) % 4);
    const pts = buildingFixedPoints();
    const cands = [];
    const chosen = [];
    for (const s of order) {
      const b = satelliteAt(s, seed, 0, 0, spawnAnchor, sats, chosen, true);
      chosen.push(b.id);
      if (s === 0 || s === 2) b.y = Math.min(Math.max(b.y, 8), C.VIEW_H - 8 - b.h);
      else b.x = Math.min(Math.max(b.x, 8), C.VIEW_W - 8 - b.w);
      if (!(b.x >= 0 && b.y >= 0 && b.x + b.w <= C.VIEW_W && b.y + b.h <= C.VIEW_H)) continue;
      let ok = edgeGap(b, spawnAnchor) >= BUILDING_SEPARATION;
      for (const q of cands) ok = ok && edgeGap(b, q) >= BUILDING_SEPARATION;
      // At the slice-J pitch a neighbouring cell's anchor can stand inside
      // the spawn view, so spawn satellites keep separation against every
      // kept anchor too (kept == all anchors at this point).
      for (const q of kept) {
        if (q === spawnAnchor) continue;
        if (edgeGap(b, q) < BUILDING_SEPARATION) { ok = false; break; }
      }
      for (const [px, py] of pts) {
        const cx = Math.max(b.x, Math.min(px, b.x + b.w));
        const cy = Math.max(b.y, Math.min(py, b.y + b.h));
        if (Math.hypot(px - cx, py - cy) < BUILDING_MOVER_R + 1) { ok = false; break; }
      }
      if (!ok) continue;
      let dp = Infinity;
      for (const [px, py] of pts) {
        const cx = Math.max(b.x, Math.min(px, b.x + b.w));
        const cy = Math.max(b.y, Math.min(py, b.y + b.h));
        dp = Math.min(dp, Math.hypot(px - cx, py - cy));
      }
      b._dp = dp;
      cands.push(b);
    }
    cands.sort((p, q) => q._dp - p._dp);
    const keptSpawnSats = cands.slice(0, MAX_SATELLITES);
    for (const b of keptSpawnSats) {
      delete b._dp;
      b.spawn = true;
      kept.push(b);
    }
    // Fallback (rare: ~1 field in 400): the keep rules refused every slot —
    // the anchor stands where no outbuilding fits (crowded view corner,
    // neighbour anchors on two sides, floor points on the third). Nudge the
    // spawn anchor origin deterministically until a composition fits: fixed
    // offset order, each origin re-cleared and re-kept under the FULL rules
    // (view, separation vs every kept anchor, floor points). First origin
    // with >= 1 satellite wins; other anchors are re-verified against the
    // moved spawn anchor (new violators deterministically dropped — the pass
    // below places every other satellite after, so nothing else can drift).
    if (keptSpawnSats.length === 0) {
      const natural = clusterAnchor(0, 0, seed, anchors);
      const ORDER = [[-64, 0], [0, -64], [64, 0], [0, 64],
        [-64, -64], [64, -64], [-64, 64], [64, 64], [-128, 0], [0, -128]];
      for (const [ox, oy] of ORDER) {
        const nx = natural.x + ox, ny = natural.y + oy;
        const cx0 = Math.min(Math.max(nx, 8), C.VIEW_W - spawnAnchor.w - 8);
        const cy0 = Math.min(Math.max(ny, 8), C.VIEW_H - spawnAnchor.h - 8);
        if (cx0 !== nx || cy0 !== ny) continue;
        const cl = clearFixedPoints(cx0, cy0, spawnAnchor.w, spawnAnchor.h);
        const ax = cl.x, ay = cl.y;
        if (!(ax >= 8 && ay >= 8 && ax + spawnAnchor.w <= C.VIEW_W - 8 &&
            ay + spawnAnchor.h <= C.VIEW_H - 8)) continue;
        const probe = { id: spawnAnchor.id, x: ax, y: ay, w: spawnAnchor.w, h: spawnAnchor.h };
        // Recompute satellites under the full keep rules at this origin.
        const rot2 = Math.floor(bHash(0, 0, seed, 29) * 4) % 4;
        const order2 = [0, 1, 2, 3].map(i => (i + rot2) % 4);
        const pts2 = buildingFixedPoints();
        const c2 = [];
        const ch2 = [];
        for (const s of order2) {
          const b = satelliteAt(s, seed, 0, 0, probe, sats, ch2, true);
          ch2.push(b.id);
          if (s === 0 || s === 2) b.y = Math.min(Math.max(b.y, 8), C.VIEW_H - 8 - b.h);
          else b.x = Math.min(Math.max(b.x, 8), C.VIEW_W - 8 - b.w);
          if (!(b.x >= 0 && b.y >= 0 && b.x + b.w <= C.VIEW_W && b.y + b.h <= C.VIEW_H)) continue;
          let ok = edgeGap(b, probe) >= BUILDING_SEPARATION;
          for (const q of c2) ok = ok && edgeGap(b, q) >= BUILDING_SEPARATION;
          for (const q of kept) {
            if (q === spawnAnchor) continue;
            if (edgeGap(b, q) < BUILDING_SEPARATION) { ok = false; break; }
          }
          for (const [px, py] of pts2) {
            const cx = Math.max(b.x, Math.min(px, b.x + b.w));
            const cy = Math.max(b.y, Math.min(py, b.y + b.h));
            if (Math.hypot(px - cx, py - cy) < BUILDING_MOVER_R + 1) { ok = false; break; }
          }
          if (ok) c2.push(b);
          if (c2.length >= MAX_SATELLITES) break;
        }
        if (c2.length === 0) continue;
        // Adopt: move the spawn anchor, re-verify the other anchors against
        // it (kept holds anchors only at this point — every other satellite
        // places after — so deterministic drops here cost no composition).
        spawnAnchor.x = ax; spawnAnchor.y = ay;
        for (let i = kept.length - 1; i >= 0; i--) {
          const q = kept[i];
          if (q === spawnAnchor || q.spawn) continue;
          if (edgeGap(q, spawnAnchor) < BUILDING_SEPARATION) {
            kept.splice(i, 1);
            for (const [k, v] of anchorByCell) if (v === q) anchorByCell.delete(k);
          }
        }
        for (const b of c2.slice(0, MAX_SATELLITES)) {
          delete b._dp;
          b.spawn = true;
          kept.push(b);
          keptSpawnSats.push(b);
        }
        break;
      }
    }
  }
  // Pass 3 — every other cell's satellites, row-major, slots in hash-rotated
  // order: kept iff rim-inside + separation-kept against ALL kept boxes
  // (anchors first, then earlier satellites — fixed order, deterministic) +
  // standing clear of the run's fixed floor points (at the tighter slice-J
  // pitch a neighbour cell's outbuilding can reach into the spawn area, so
  // placement yields ALONG the run's floor — grammar G5 — while the count
  // stays uncapped).
  const floorPts = buildingFixedPoints();
  for (let by = lo; by <= hi; by++) {
    for (let bx = lo; bx <= hi; bx++) {
      if (bx === 0 && by === 0) continue;
      const a = anchorByCell.get(bx + ',' + by);
      if (!a) continue;
      const rot = Math.floor(bHash(bx, by, seed, 29) * 4) % 4;
      const order = [0, 1, 2, 3].map(i => (i + rot) % 4);
      const chosen = [];
      let nSat = 2 + Math.floor(bHash(bx, by, seed, 25) * (MAX_SATELLITES - 1));
      nSat = Math.max(2, Math.min(MAX_SATELLITES, nSat));
      for (const s of order) {
        if (nSat <= 0) break;
        const b = satelliteAt(s, seed, bx, by, a, sats, chosen, false);
        chosen.push(b.id);
        if (!rimInside(b)) continue;
        let ok = edgeGap(b, a) >= BUILDING_SEPARATION;
        for (const q of kept) {
          if (edgeGap(b, q) < BUILDING_SEPARATION) { ok = false; break; }
        }
        for (const [px, py] of floorPts) {
          const cx = Math.max(b.x, Math.min(px, b.x + b.w));
          const cy = Math.max(b.y, Math.min(py, b.y + b.h));
          if (Math.hypot(px - cx, py - cy) < BUILDING_MOVER_R + 1) { ok = false; break; }
        }
        if (!ok) continue;
        kept.push(b);
        nSat--;
      }
    }
  }
  return kept.map(({ id, x, y, w, h, spawn }) => ({ id, x, y, w, h, spawn: !!spawn }));
}

// Every building footprint on the arena, in world coords ({ x, y, w, h }):
// the single-sourced placement field above, projected to boxes. The motion
// seam (main.js runController, cached per run), the loot filter
// (controllers.js), the portal and the chest clamps all read this —
// collision shapes scale WITH the painted seam by construction: more
// buildings = more boxes here, same query, same proof.
export function buildingFootprints(seed, stageId) {
  return buildingPlacements(seed, stageId).map(({ x, y, w, h }) => ({ x, y, w, h }));
}

// buildingFootprints behind a one-entry cache: the field is pure in
// (seed, stage) and both are fixed for a run, so per-frame callers (motion,
// pilot, render, drop placement) share one array. Treat it as read-only.
let rectsKey = null, rectsVal = [];
export function buildingRects(seed, stageId) {
  const key = seed + '|' + String(stageId);
  if (rectsKey !== key) { rectsVal = buildingFootprints(seed, stageId); rectsKey = key; }
  return rectsVal;
}

// True when (x, y) sits inside any footprint (expanded by margin).
// The pilot treats an interior loot mark the way it treats one beyond the
// rim: not a candidate (controllers.js — the WAVE-27 wall-grind precedent).
export function buildingCoversPoint(seed, stageId, x, y, margin) {
  const m = margin || 0;
  for (const r of buildingRects(seed, stageId)) {
    if (x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m) return true;
  }
  return false;
}

// True when the disc (x, y, r) touches any footprint.
export function buildingTouchesDisc(rects, x, y, r) {
  for (const q of rects) {
    const cx = Math.max(q.x, Math.min(x, q.x + q.w));
    const cy = Math.max(q.y, Math.min(y, q.y + q.h));
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  return false;
}

// The corner-steer: stateless anti-cycle routing for the motion seam.
//
// WHY IT EXISTS (the strand half of slice F): the slide below keeps every
// blocked frame moving, but a greedy re-aim (the pilot recomputes its
// intent every frame toward a fixed mark) plus a pure slide can patrol one
// face forever — nose-on at mid-face walks to the nearer corner, the
// re-aimed intent climbs back to mid-face, repeat. No stateless slide can
// break that: the fix must COMMIT past the corner. So when the ray
// footing->footing+intent*LOOK crosses a footprint (expanded by the mover
// ring), the seam steers at the most intent-aligned expanded corner until
// the ray runs clear again. Corners are fixed while the ray stays on their
// side, reaching one releases (the ray past a corner tip runs clear), and
// the slide stays behind it as the backstop — contact while steering still
// resolves, never penetrates.
//
// SCOPE: intent-only, magnitude-preserving (a partial stick deflection
// stays partial), zero in open field (a clear ray returns the intent
// untouched — free motion is byte-identical). It steers whoever the seam
// moves (both pilots, the prologue walk); seeking doctrine is untouched —
// the pilot stays mark-blind, it merely walks around walls. Pure.
export const BUILDING_STEER_LOOK = 16;

function rayHitsRect(px, py, dx, dy, look, q, r) {
  // Slab test of the ray p+t*(dx,dy), t in [0,look], against q expanded
  // by r. A zero-length intent never hits.
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return false;
  const ux = dx / len, uy = dy / len;
  const x0 = q.x - r, x1 = q.x + q.w + r;
  const y0 = q.y - r, y1 = q.y + q.h + r;
  let tmin = 0, tmax = look;
  if (Math.abs(ux) < 1e-9) {
    if (px < x0 || px > x1) return false;
  } else {
    let t1 = (x0 - px) / ux, t2 = (x1 - px) / ux;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(uy) < 1e-9) {
    if (py < y0 || py > y1) return false;
  } else {
    let t1 = (y0 - py) / uy, t2 = (y1 - py) / uy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return tmax >= 0 && tmin <= look;
}

export function buildingSteer(px, py, mx, my, rects, r) {
  const mag = Math.hypot(mx, my);
  if (!(mag > 0) || rects.length === 0) return [mx, my];
  let hit = null;
  for (const q of rects) {
    if (rayHitsRect(px, py, mx, my, BUILDING_STEER_LOOK, q, r)) { hit = q; break; }
  }
  if (!hit) return [mx, my];
  // The most intent-aligned expanded corner ahead of the mover (fixed order
  // breaks exact ties deterministically; alignment only improves on
  // approach, so the pick is stable and the walk commits past the tip).
  // Corners behind the intent are never picked: aiming back the way the
  // mover came paces instead of rounding (the graze reversal).
  const m = r + 6;
  const corners = [
    [hit.x - m, hit.y - m], [hit.x + hit.w + m, hit.y - m],
    [hit.x - m, hit.y + hit.h + m], [hit.x + hit.w + m, hit.y + hit.h + m],
  ];
  const il = mag;
  const ix = mx / il, iy = my / il;
  let best = null, bestDot = -Infinity;
  for (const [cx, cy] of corners) {
    const vx = cx - px, vy = cy - py;
    if (vx * ix + vy * iy <= 0) continue;
    const vl = Math.hypot(vx, vy);
    if (vl < 2) continue;
    const dot = (vx * ix + vy * iy) / vl;
    if (dot > bestDot) { bestDot = dot; best = [vx / vl, vy / vl]; }
  }
  if (!best) return [mx, my];
  return [best[0] * mag, best[1] * mag];
}

// Nearest point outside every footprint (expanded by margin): while inside
// one, leave along its smallest-penetration axis. Kept footprints never
// overlap (the slice-J separation floor: every pair stands >= 16px apart, so
// one push cannot land inside another), and each push travels at most half a
// side plus the margin — the fiction ("opens where it fell") survives a
// nudge. Pure: returns [x, y].
export function pushOutOfRects(rects, x, y, margin) {
  let px = x, py = y;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const q of rects) {
      if (px > q.x - margin && px < q.x + q.w + margin &&
          py > q.y - margin && py < q.y + q.h + margin) {
        const dl = px - (q.x - margin), dr = (q.x + q.w + margin) - px;
        const dt = py - (q.y - margin), db = (q.y + q.h + margin) - py;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) px = q.x - margin;
        else if (m === dr) px = q.x + q.w + margin;
        else if (m === dt) py = q.y - margin;
        else py = q.y + q.h + margin;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, py];
}

// Nearest point for a world pickup (chest, shrine, arch, drop) that the pilot
// can reach: outside every footprint expanded by margin, and within +-limit
// on both axes when a limit is given. Unlike pushOutOfRects it never picks
// an exit beyond the limit or inside a neighbouring footprint when another
// exit is legal. Pure: returns [x, y].
export function clearOfBuildings(rects, x, y, margin, limit) {
  const m = margin || 0;
  const lim = limit > 0 ? limit : Infinity;
  const holder = (px, py) => rects.find(q =>
    px > q.x - m && px < q.x + q.w + m && py > q.y - m && py < q.y + q.h + m);
  let px = Math.max(-lim, Math.min(lim, x)), py = Math.max(-lim, Math.min(lim, y));
  for (let pass = 0; pass < 6; pass++) {
    const q = holder(px, py);
    if (!q) break;
    const exits = [[q.x - m, py], [q.x + q.w + m, py], [px, q.y - m], [px, q.y + q.h + m]]
      .filter(([ex, ey]) => Math.abs(ex) <= lim && Math.abs(ey) <= lim)
      .map(([ex, ey]) => ({ ex, ey, d: Math.abs(ex - px) + Math.abs(ey - py), free: !holder(ex, ey) }))
      .sort((a, b) => (b.free - a.free) || (a.d - b.d));
    if (exits.length === 0) break;
    px = exits[0].ex; py = exits[0].ey;
  }
  return [px, py];
}

// The axis-separated slide: (fx,fy) is the mover's current footing (known
// clear), (tx,ty) the intended next footing. A blocked frame REDIRECTS at
// the full intended stride — never a creep, never a zero (the no-stall
// invariant the night watchdog assumes of live play):
//   1. the full intent, untouched when legal;
//   2. axis slides at FULL stride along each intended axis (the reliefStep
//      Layer-2 precedent: a blocked frame spends its whole step, so contact
//      skims the face briskly instead of grinding);
//   3. wall-follow: a full-stride step along the blocking face toward its
//      nearer edge (nose-on intents have no tangential part to keep);
//   4. hold footing — reachable only wedged in a full pocket (no such
//      pocket exists: kept footprints stand >= 16px apart edge-to-edge, the
//      slice-J separation floor, and the mover ring is 7px — every lane
//      between boxes walks).
// Every candidate is verified against the discs, so no layer can penetrate
// or tunnel (a stride is px per frame; the smallest box side is 20px).
// Pure: returns [x, y].
export function slideMove(fx, fy, tx, ty, rects, r) {
  if (!buildingTouchesDisc(rects, tx, ty, r)) return [tx, ty];
  const stride = Math.hypot(tx - fx, ty - fy);
  if (!(stride > 0)) return [fx, fy];
  const sx = tx - fx, sy = ty - fy;
  if (sx !== 0) {
    const cx = fx + Math.sign(sx) * stride;
    if (!buildingTouchesDisc(rects, cx, fy, r)) return [cx, fy];
  }
  if (sy !== 0) {
    const cy = fy + Math.sign(sy) * stride;
    if (!buildingTouchesDisc(rects, fx, cy, r)) return [fx, cy];
  }
  // Wall-follow: the face the full intent touched, stepped along toward the
  // nearer edge. Mostly-x intents walk in y (and back).
  let block = null;
  for (const q of rects) {
    const nx = Math.max(q.x, Math.min(tx, q.x + q.w));
    const ny = Math.max(q.y, Math.min(ty, q.y + q.h));
    if ((tx - nx) * (tx - nx) + (ty - ny) * (ty - ny) < r * r) { block = q; break; }
  }
  if (block) {
    const alongX = Math.abs(sx) < Math.abs(sy);
    const cands = [];
    if (alongX) {
      const edge = Math.abs(fx - block.x) <= Math.abs(fx - (block.x + block.w)) ?
        block.x : block.x + block.w;
      const dir = edge > fx ? 1 : -1;
      cands.push([fx + dir * stride, fy], [fx - dir * stride, fy]);
    } else {
      const edge = Math.abs(fy - block.y) <= Math.abs(fy - (block.y + block.h)) ?
        block.y : block.y + block.h;
      const dir = edge > fy ? 1 : -1;
      cands.push([fx, fy + dir * stride], [fx, fy - dir * stride]);
    }
    for (const [cx, cy] of cands) {
      if (!buildingTouchesDisc(rects, cx, cy, r)) return [cx, cy];
    }
  }
  return [fx, fy];
}
