// HORDES — src/atlas.js
//
// M1 THE PER-RUN ATLAS (owner directive 2026-09-14,
// docs/HORDES_GOALS_2026-09-12.md §"M1 — THE PER-RUN MAP SCREEN").
//
// ONE TRACKER, TWO SCALES (the goal doc's hard rule): this module holds the
// ONLY visited grid and the ONLY landmark set in the program. A2's radar
// paints nearby DISCOVERED landmarks read from this atlas; the M1 map screen
// paints the whole grid read from the same atlas. A landmark the player has
// found is the same datum in both views — do not build a second tracker.
//
// House style (the src/radar.js contract): pure data + maths — no DOM, no
// canvas, no timers, no globals, no Math.random, no dt. That is what makes it
// headless-testable, and it is what makes the atlas consume ZERO rng draws
// (M1 R2: one extra Math.random() at run start would shift the ground/spawn
// stream and silently invalidate every balance number already measured).
// Per-run only: the atlas is created in startRun, never serialised — no save
// schema change (C4).
//
// 60Hz and 120Hz safety: nothing here reads a frame delta. atlasUpdate is a
// pure function of the player's CURRENT position, so the marked set after any
// path is identical at any refresh rate (idempotent writes — re-marking a
// marked cell is a no-op).

// ---------------------------------------------------------------------------
// GRID GEOMETRY (C3), INTEGER
// ---------------------------------------------------------------------------
// MAP_CELL world-px square cells over the +-RIM arena. With RIM 600 and
// MAP_CELL 40 the arena divides EXACTLY: 1200/40 = 30 -> a 30x30 = 900-cell
// grid (that exact division is why 40 was chosen). Index rule, stated so a
// test can assert it (positions outside the rim clamp, never write out of
// bounds):
//   c = clamp(floor((w + RIM) / MAP_CELL), 0, side - 1)
// Storage: ONE Uint8Array(side * side), 0 = unvisited, 1 = visited. It never
// grows, and there is exactly one per run.
export function atlasGridSide(rim, cell) {
  return Math.floor((2 * rim) / cell);
}

export function createAtlas(rim, cell) {
  const side = atlasGridSide(rim, cell);
  return {
    rim, cell, side,
    visited: new Uint8Array(side * side),
    // [{ kind, x, y, discovered }] — kind from a reserved set ('shrine' now;
    // 'chest' / 'rare' / 'quest' reserved for the future place-of-interest
    // work). Registration happens ONCE at run/world seed time, never per
    // frame (C5). x/y are integer world px.
    landmarks: [],
  };
}

// The cell address of a world point, clamped to the grid (the rim-clamp rule:
// a point at/past +-rim lands on the edge cell, never out of bounds).
export function atlasCell(atlas, wx, wy) {
  const c = (w) => Math.max(0, Math.min(atlas.side - 1,
    Math.floor((w + atlas.rim) / atlas.cell)));
  return { cx: c(wx), cy: c(wy) };
}

// World-px CENTRE of a cell (the point the visit rule measures against).
function cellCentre(atlas, c) {
  return c * atlas.cell - atlas.rim + atlas.cell / 2;
}

// ---------------------------------------------------------------------------
// VISIT MARKING
// ---------------------------------------------------------------------------
// A cell is marked when the player is within VISIT_RADIUS of the cell's
// centre, evaluated from the player's current position (C3). VISIT_RADIUS is
// recommended >= the half-diagonal of the 480x300 view (~283), so the grid
// records what the player has actually SEEN, not only the cell he stands in.
// Idempotent: re-marking costs nothing and changes nothing. Returns the count
// of NEWLY marked cells (0 on a re-visit).
export function atlasMarkVisited(atlas, px, py, visitRadius) {
  const R = visitRadius;
  const lo = atlasCell(atlas, px - R, py - R);
  const hi = atlasCell(atlas, px + R, py + R);
  let marked = 0;
  for (let cy = lo.cy; cy <= hi.cy; cy++) {
    const wy = cellCentre(atlas, cy);
    const dy = wy - py;
    for (let cx = lo.cx; cx <= hi.cx; cx++) {
      const wx = cellCentre(atlas, cx);
      const dx = wx - px;
      if (dx * dx + dy * dy > R * R) continue;
      const i = cy * atlas.side + cx;
      if (atlas.visited[i] === 0) { atlas.visited[i] = 1; marked++; }
    }
  }
  return marked;
}

// ---------------------------------------------------------------------------
// LANDMARKS
// ---------------------------------------------------------------------------
// Register ONE landmark. Called once per landmark at run/world seed time —
// M1 wires exactly ONE source (S1's world-seeded shrines) and reads their
// already-seeded positions; it never re-rolls and never mirrors placement
// constants. Positions are rounded to integer pixels.
export function atlasRegisterLandmark(atlas, lm) {
  atlas.landmarks.push({
    kind: lm.kind,
    x: Math.round(lm.x),
    y: Math.round(lm.y),
    discovered: false,
  });
  return atlas.landmarks[atlas.landmarks.length - 1];
}

// Discovery flips when the player comes within DISCOVER_RADIUS of a landmark
// (boundary INCLUSIVE, the radar.js <= precedent). One-way: discovered never
// flips back. Returns the landmarks discovered BY THIS CALL (usually none).
export function atlasDiscover(atlas, px, py, discoverRadius) {
  const R = discoverRadius;
  const found = [];
  for (const lm of atlas.landmarks) {
    if (lm.discovered) continue;
    const dx = lm.x - px, dy = lm.y - py;
    if (dx * dx + dy * dy <= R * R) {
      lm.discovered = true;
      found.push(lm);
    }
  }
  return found;
}

// The per-frame read: mark the cells the player can see, flip any landmark he
// reached. Pure function of position — call it at 60Hz or 120Hz, the result
// is the same.
export function atlasUpdate(atlas, px, py, visitRadius, discoverRadius) {
  return {
    marked: atlasMarkVisited(atlas, px, py, visitRadius),
    discovered: atlasDiscover(atlas, px, py, discoverRadius),
  };
}

// Readouts for the map screen / tests. Cheap scans of a bounded array.
export function atlasVisitedCount(atlas) {
  let n = 0;
  for (let i = 0; i < atlas.visited.length; i++) if (atlas.visited[i]) n++;
  return n;
}

export function atlasDiscoveredCount(atlas) {
  let n = 0;
  for (const lm of atlas.landmarks) if (lm.discovered) n++;
  return n;
}
