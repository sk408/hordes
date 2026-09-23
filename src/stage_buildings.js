// HORDES — stage building structures (PORT SLICE E: original art from VS design reference).
import { CONFIG as C } from './config.js';
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
// balance/combat/economy number lives here (visual slice + a pure motion
// query, see PORT SLICE F below).
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

// ---- PORT SLICE F: the pure collision query --------------------------------
// Collision shapes = the EXISTING rect-list footprints (whole [w,h] boxes,
// never the inner rects): one box per building, no new art, no new numbers.
// Everything here is pure in (seed, stageId, coords): no clock, no DOM, no
// run objects, nothing written. The motion seam (main.js runController)
// applies it; the paint path never calls it.
//
// MIRROR WARNING: bHash + the field math below replicate render.js
// drawLandmarks' building pass (cellRand + the BUILDING_CELL anchors, the
// density gate, the rim cull, the forced (0,0) cell) line for line. If the
// paint pass changes, this query MUST change with it — the agreement test
// (test_building_collision.mjs: every painted footprint equals a queried one
// and back) fails loudly on any drift between the two.

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
// with the building pass's own salts (21/22/23), so the query hashes the
// same field the paint pass paints.
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

// Every building footprint on the arena, in world coords ({ x, y, w, h }):
// each picked building-cell's anchor (density gate salt 21, anchor salts
// 22/23), rim-culled by footprint, plus the forced (0,0) cell (painted
// unconditionally — the slice-E in-view promise) with the fallback clamp
// and the fixed-point clearance. Deterministic per (seed, stageId).
export function buildingFootprints(seed, stageId) {
  const BC = C.GROUND.BUILDING_CELL, BDENS = C.GROUND.BUILDING_DENSITY;
  const RIM = C.GROUND.RIM;
  const bSpec = buildingForStage(stageId);
  const anchorOf = (bx, by) => ({
    x: bx * BC + 48 + Math.floor(bHash(bx, by, seed, 22) * (BC - 96 - bSpec.w)),
    y: by * BC + 48 + Math.floor(bHash(bx, by, seed, 23) * (BC - 96 - bSpec.h)),
  });
  const out = [];
  const lo = Math.floor(-RIM / BC), hi = Math.floor(RIM / BC);
  for (let by = lo; by <= hi; by++) {
    for (let bx = lo; bx <= hi; bx++) {
      const forceB = bx === 0 && by === 0;
      if (!forceB && bHash(bx, by, seed, 21) >= BDENS) continue;
      let wa = anchorOf(bx, by);
      if (forceB) {
        const fits = wa.x >= 0 && wa.y >= 0 &&
          wa.x + bSpec.w <= C.VIEW_W && wa.y + bSpec.h <= C.VIEW_H;
        if (!fits) {
          wa = {
            x: Math.min(Math.max(wa.x, 8), C.VIEW_W - bSpec.w - 8),
            y: Math.min(Math.max(wa.y, 8), C.VIEW_H - bSpec.h - 8),
          };
        }
        const cl = clearFixedPoints(wa.x, wa.y, bSpec.w, bSpec.h);
        wa = { x: cl.x, y: cl.y };
      }
      if (wa.x < -RIM + 4 || wa.x + bSpec.w > RIM - 4) continue;
      if (wa.y < -RIM + 4 || wa.y + bSpec.h > RIM - 4) continue;
      out.push({ x: wa.x, y: wa.y, w: bSpec.w, h: bSpec.h });
    }
  }
  return out;
}

// True when (x, y) sits inside any footprint (expanded by margin).
// The pilot treats an interior loot mark the way it treats one beyond the
// rim: not a candidate (controllers.js — the WAVE-27 wall-grind precedent).
export function buildingCoversPoint(seed, stageId, x, y, margin) {
  const m = margin || 0;
  for (const r of buildingFootprints(seed, stageId)) {
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
// one, leave along its smallest-penetration axis. Footprints never overlap
// (neighbouring cells stand >= 96px apart and boxes are <= 108 wide, so one
// push cannot land inside another), and each push travels at most half a
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
//      pocket exists: neighbouring footprints stand >= 96px apart, proven
//      by the cell-anchor ranges, and the mover ring is 7px).
// Every candidate is verified against the discs, so no layer can penetrate
// or tunnel (a stride is px per frame; the smallest box side is 64px).
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
