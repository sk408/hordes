// HORDES — HUD chrome trim (PORT SLICE I, owner autopilot).
//
// The reference's presentation feel (docs/vs_port_ref section 10 UI: 111
// thumbs — HUD framing, panels, buttons, meters, cards — plus section 1's
// integer scale + palette discipline) is, conceptually: every meter lives in
// a HOUSED frame, every badge/plate carries a keyline, round instruments
// carry rim ticks. Hordes painted those housings as plain rectangles (a steel
// frame rect, a gold border rect, a dark plate rect). This module dresses
// them — chamfered housing corners, rivet studs, inner keylines, radar rim
// ticks — as ORIGINAL art, through the same integer-fillRect idiom the HUD
// already uses.
//
// CONTRACTS (load-bearing):
//   * ADDITIVE ONLY. Every helper paints 1px trim pixels strictly INSIDE the
//     footprint the caller already painted (overpainting housing pixels, never
//     extending past them). No caller moves, resizes, renames or re-times
//     anything: the existing fillRect records stay byte-identical, so every
//     frozen-layout seam (test_render_hud, test_radar_wiring, tour, smoke)
//     keeps passing. Geometry in = geometry out.
//   * NO TEXT. Helpers take a 2d context and issue fillRect only — never
//     fillText, never an emoji, never a glyph. Copy is frozen.
//   * NO CLOCK. Every pixel is a pure function of the passed box (+ the
//     radar's centre/radius constants). 60Hz and 120Hz paint identically.
//   * ORIGINAL INKS. RIVET is the menu-frame lit-lip gold family (an existing
//     HORDES ink, previously never on the canvas HUD); KEYLINE is a new deep
//     slate. Neither appears in any canvas HUD/effect paint path, so the two
//     styles are honest test markers for "the chrome painted".
export const CHROME_INKS = {
  RIVET: '#e8c05a',
  KEYLINE: '#3a3a4e',
};

// 1px studs on the four corners of the (x, y, w, h) box the caller passes.
// Callers pass the ring they want studded: badge callers pass the INSET box
// (studs sit on the dark inset edge, visible), slot callers pass the OUTER
// frame box (studs sit on the frame ring itself, visible on grey and gold).
export function studCorners(g, x, y, w, h) {
  g.fillStyle = CHROME_INKS.RIVET;
  g.fillRect(x, y, 1, 1);
  g.fillRect(x + w - 1, y, 1, 1);
  g.fillRect(x, y + h - 1, 1, 1);
  g.fillRect(x + w - 1, y + h - 1, 1, 1);
}

// Meter housing trim. (x, y, w, h) is the TROUGH box the caller passed to
// drawBar-style paint (the steel frame ring is the 1px band around it at
// (x-2, y-2, w+4, h+4), the black seam at (x-1, y-1, w+2, h+2)).
//   * the four OUTER frame corners are chamfered to KEYLINE (a sawn-corner
//     read, overpainting steel — the frame record itself is untouched);
//   * four RIVET studs land on the trough's own corners (overpainting trough
//     / tick / fill edge pixels — housing furniture, never the fill body).
export function trimBar(g, x, y, w, h) {
  g.fillStyle = CHROME_INKS.KEYLINE;
  g.fillRect(x - 2, y - 2, 1, 1);
  g.fillRect(x + w + 1, y - 2, 1, 1);
  g.fillRect(x - 2, y + h + 1, 1, 1);
  g.fillRect(x + w + 1, y + h + 1, 1, 1);
  g.fillStyle = CHROME_INKS.RIVET;
  g.fillRect(x, y, 1, 1);
  g.fillRect(x + w - 1, y, 1, 1);
  g.fillRect(x, y + h - 1, 1, 1);
  g.fillRect(x + w - 1, y + h - 1, 1, 1);
}

// Badge trim. (x, y, w, h) is the badge's OUTER box (gold border ring with
// the dark inset at +1). Studs ride the inset box so they read on the dark.
export function trimBadge(g, x, y, w, h) {
  studCorners(g, x + 1, y + 1, w - 2, h - 2);
}

// Plate trim. (x, y, w, h) is the plate rect itself (label plates, the feed
// plate). RIVET pixels on the four plate corners — inside the plate.
export function trimPlate(g, x, y, w, h) {
  studCorners(g, x, y, w, h);
}

// Radar rim ticks: 8 RIVET pixels at the 45-degree stations on radius R-1 —
// ON the steel rim band (the rim owns (R-1.5, R]), so every tick lands inside
// the radar's fixed-geometry box and never touches a dot lane or the focus
// ring (focusR ~ 10 << R-1 = 33).
export function radarTicks(g, cx, cy, R) {
  g.fillStyle = CHROME_INKS.RIVET;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.fillRect(cx + Math.round(Math.cos(a) * (R - 1)), cy + Math.round(Math.sin(a) * (R - 1)), 1, 1);
  }
}

// Fullscreen-button inner keyline: a 1px KEYLINE border just inside the
// button box (the expand-bracket icon keeps its own paint untouched).
export function fsKeyline(g, b) {
  g.fillStyle = CHROME_INKS.KEYLINE;
  g.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
  g.fillRect(b.x + 1, b.y + b.h - 2, b.w - 2, 1);
  g.fillRect(b.x + 1, b.y + 1, 1, b.h - 2);
  g.fillRect(b.x + b.w - 2, b.y + 1, 1, b.h - 2);
}

// Held-boss-banner plate trim (SET-PIECE plates only — the peripheral horde
// strip keeps its zero-play-area-pixels contract and is never dressed here).
// A 1px KEYLINE border just inside the plate plus RIVET studs on its corners.
export function bannerTrim(g, x, y, w, h) {
  g.fillStyle = CHROME_INKS.KEYLINE;
  g.fillRect(x + 1, y + 1, w - 2, 1);
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  g.fillRect(x + 1, y + 1, 1, h - 2);
  g.fillRect(x + w - 2, y + 1, 1, h - 2);
  studCorners(g, x + 1, y + 1, w - 2, h - 2);
}
