// HORDES — pixel rendering. Sprites are pixel grids drawn with fillRect:
// no image assets, no drawImage — pure structured data.
import { CONFIG as C, runClock } from './config.js';
import { resolveLook, ELITE_LOOK } from './enemy_types.js';
import { RARITY } from './rarity.js';   // G10 tier tells (outline ring colour)
import { BOSSES, MIDBOSS, BOSS_SPRITES } from './bosses.js';   // G10 bestiary: boss sprites
import { SPRITES, BOSS_SPRITE, FLAME } from './sprites.js';
import {
  WEAPON_ICONS, WEAPON_ICON_PALETTE, ITEM_ICON_GRID, weatherIcon,
} from './sprites.js';
import { FINAL_BOSS_SPRITE } from './final_boss.js';
import { weaponXpNeeded, WEAPON_MAX_LEVEL } from './weapons.js';   // WAVE-18 read-only
import { CHALLENGE_BY_ID } from './challenges.js';   // G11: the in-run mode badge
import { drawTitle, TITLE_WIDTH, TITLE_HEIGHT } from './art/title.js';   // G12 title card
// A2 THE RADAR: the DATA layer (pure maths, no DOM — see src/radar.js's header)
// is imported, never restated. This file owns only the painting of what it
// returns; the classification (chaff/elite/boss) is classifyTier's alone.
import { radarDots, RADAR_RADIUS } from './radar.js';
import { atlasCell } from './atlas.js';
import { stageRelief } from './stages.js';
import { reliefLevel, reliefVisionRadius } from './relief.js';

// A2 RADAR paint constants (geometry rationale lives on drawRadar below).
// RADAR_DISPLAY_R is the HUD-px radius of the drawn circle; the world->radar
// scale is RADAR_DISPLAY_R / RADAR_RADIUS (34/330). Bottom-right corner box:
// the one HUD region with no chrome (bars/XP/feed top-left, clock/weather
// top-right, weapon/item rows bottom-left).
const RADAR_DISPLAY_R = 34;
const RADAR_CORNER_INSET = 10;
// Tier tells: chaff is a small grey pip, elite is gold, boss is the big red
// one — readable at a glance, in the house palette (gold #ffd75e / red
// #ff2f5e, the same pair the LV badge and the run-limit tick use). Sizes are
// odd integers so a dot centres exactly on its integer radar-space pixel.
const RADAR_DOT_STYLE = {
  chaff: { size: 3, color: '#b8b8c8' },
  elite: { size: 5, color: '#ffd75e' },
  boss: { size: 7, color: '#ff2f5e' },
};

// 12x12 player sprite: 0 = transparent, digits index into PALETTE.
export const PLAYER_SPRITE = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,4,4,3,0,0],
  [0,0,0,3,3,0,0,3,3,0,0,0],
];

// Walk frame B (Sk408: "animate the player walking... simple and subtle"):
// same pose, feet splay out 1px — left foot steps left, right leg shifts
// right. Only the two leg rows differ; swapped in while actually moving.
export const PLAYER_SPRITE_WALK = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,0,4,4,3,0],
  [0,0,3,3,0,0,0,3,3,0,0,0],
];

const PALETTE = { 1: '#ffe9a8', 2: '#e8b04a', 3: '#7a4a1e', 4: '#3a6fd8' };

// ---- world-space ground decor (Sk408: bare ground read as sliding) ----------
// Deterministic per-run field: each CELL x CELL cell of the arena hashes to
// "has a piece / which type / where inside the cell" from (cx, cy, seed) — no
// stored arrays, and cells outside the camera view are simply never visited
// (off-screen cull for free). Same seed -> identical field, like weather.js.
function cellRand(cx, cy, seed, salt) {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
// Muted tone families — WAVE-9B/2: the family is chosen by WAVE NUMBER from
// CONFIG.GROUND.THEMES (per-wave area identity; the per-run groundSeed still
// shapes which cells carry a piece). Subtle by design: decor sits UNDER
// entities and must never compete with them for attention — except SNOWFIELD,
// which reads clearly brighter by request.
export function groundTheme(waveNum) {
  const t = C.GROUND.THEMES;
  return t[(Math.max(1, waveNum || 1) - 1) % t.length];
}

// F8 (audit 2026-09-16): the HUD purse readout clamped at 99999 — a maxed run
// banks 754,689g (G17 slice 1b), so the on-screen wallet SATURATED mid-run and
// every value past 99,999 read identically. Pure formatter, ONE definition,
// called by the GOLD badge below. Contract:
//   * 0..99999 — byte-identical to the old field: the number, space-padded to
//     5 chars.
//   * 100k..999k — ' 100k'..' 999k'; >=1M — '  1.0M'..' 9.9M' (one decimal),
//     then ' 10M'..' 999M'. Compacts are TRUNCATED (floor), never rounded up:
//     999,999 shows ' 999k', not '1000k'; 9,999,999 shows ' 9.9M', not '10M'.
//   * EVERY output is exactly 5 chars, so the badge's fixed-width geometry
//     (the H1 no-reflow contract this badge was built under) holds at any
//     purse size. >=1B extends the same ladder ('B'), still 5 chars.
//   * negative/NaN/undefined read as the zero field — never 'NaN' or 'undefined'
//     on the HUD.
export function fmtGold(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v <= 99999) return String(v).padStart(5, ' ');
  const band = (div, dec, suf) => dec
    ? (Math.floor(v / div) / 10).toFixed(1) + suf
    : Math.floor(v / div) + suf;
  if (v < 1e6) return band(1e3, false, 'k').padStart(5, ' ');   // 100k..999k
  if (v < 1e7) return band(1e5, true, 'M').padStart(5, ' ');    // 1.0M..9.9M
  if (v < 1e9) return band(1e6, false, 'M').padStart(5, ' ');   // 10M..999M
  if (v < 1e10) return band(1e8, true, 'B').padStart(5, ' ');   // 1.0B..9.9B
  return band(1e9, false, 'B').padStart(5, ' ');                // 10B..999B
}

// Wave-6: item-drop glow colors by rarity (loot.js) + arch gate colors.
const RARITY_COLORS = { COMMON: '#a8a8c0', RARE: '#4a8cff', EPIC: '#c46ad8', LEGENDARY: '#ffd75e' };
const ARCH_COLORS = {
  DOUBLE_FIRE: '#ff8848', MAGNET: '#4a8cff', SHIELD: '#a8e0ff',
  BERSERK: '#ff5566', SWIFT: '#68e080',
};

// Enemy looks now come from enemy_types.js resolveLook(typeId, variant):
// { body, trim, accent, shape, sizeMult } — hordes mix 2-3 palettes per type.
// Shape drawing from the e.w/e.h box (fillRect-composable, per hb4's contract):
//   block   — one w x h rect.
//   diamond — 3 stepped rows (middle full width, flanks half); 4 if h >= 20.
//   tall    — (w*0.7) x (h*1.3).  wide — (w*1.3) x (h*0.7).
function drawShape(g, shape, x, y, w, h) {
  const hw = Math.round(w / 2), hh = Math.round(h / 2);
  if (shape === 'tall') {
    const tw = Math.max(2, Math.round(w * 0.7)), th = Math.max(2, Math.round(h * 1.3));
    g.fillRect(x - Math.round(tw / 2), y - Math.round(th / 2), tw, th);
  } else if (shape === 'wide') {
    const tw = Math.max(2, Math.round(w * 1.3)), th = Math.max(2, Math.round(h * 0.7));
    g.fillRect(x - Math.round(tw / 2), y - Math.round(th / 2), tw, th);
  } else if (shape === 'diamond') {
    const rows = h >= 20 ? 4 : 3;
    const rowH = Math.max(1, Math.round(h / rows));
    for (let r = 0; r < rows; r++) {
      const frac = rows === 3 ? (r === 1 ? 1 : 0.5) : (r === 1 || r === 2 ? 0.75 : 0.25);
      const rw = Math.max(2, Math.round(w * frac));
      const ry = y - hh + r * rowH;
      g.fillRect(x - Math.round(rw / 2), ry, rw, rowH);
    }
  } else {
    g.fillRect(x - hw, y - hh, w, h);   // block
  }
}

// G10 rarity tell (rarity.js): the SAME 1px outline-ring vocabulary the elite
// gold uses, in the tier's own colour — NO new sprites. `o` is the ring's
// offset from the box (o=1 reproduces the elite ring's exact geometry). A
// MYTHIC pulses at its tell's Hz using the telegraph blink idiom, so it is
// distinguishable from a rare at a glance even inside a horde.
function rarityRing(g, e, state, x, y, w, h) {
  const t = RARITY[e.rarity];
  if (!t || !t.tell) return;
  const o = e.elite ? 2 : 1;   // outside the gold ring when the badges compose
  let col = t.tell.outline;
  if (t.tell.pulseHz && Math.floor((state.time || 0) * t.tell.pulseHz * 2) % 2 === 0) {
    col = '#efd9ff';           // pale-violet blink on the pulse phase
  }
  g.fillStyle = col;
  g.fillRect(x - o, y - o, w + 2 * o, 1);
  g.fillRect(x - o, y + h + o, w + 2 * o, 1);
  g.fillRect(x - o, y - o, 1, h + 2 * o);
  g.fillRect(x + w + o, y - o, 1, h + 2 * o);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // WAVE-24 (#3): the ground decor seams (filled every frame in render):
    // this.landmarks = the structures painted this frame (world coords),
    // this.arenaWall / this.hudChrome / this.bossBanner = the existing seams.
    this.landmarks = [];
    // N6 (audit 2026-09-16) static-content caches, measured before landing in
    // real Chrome (tools/verify_nits_n6.mjs): the radar's plate/rim disc
    // (0.24 ms/frame as ~4,700 sqrt-gated 1px fills) is painted ONCE into an
    // offscreen canvas and blitted per frame; the boss banner's text FIT
    // (0.15 ms/frame as a per-frame measureText ladder) is computed once per
    // banner strings. Counters expose the cache-hit seam to the tests.
    this._radarPlate = null;
    this._radarPlateKey = '';
    this.radarPlateBuilds = 0;
    this._bannerFit = null;
    this.bossBannerFits = 0;
    this.resize();
  }

  // WAVE-18 (#4) made the backing store VIEW*dpr; WAVE-23 goes further: the
  // backing store is now the REAL displayed pixel size (CSS size x dpr, from
  // the layout rect), with the base transform mapping view coordinates onto
  // it. On a 1280x720 dpr=1 desktop the buffer was 480x300 upscaled by CSS —
  // every glyph rasterised at 8px then nearest-resampled (soft, uneven 2/3px
  // art pixels). Now glyphs rasterise 1:1 at device resolution (canvas text
  // under a scale transform renders its vector outlines at final size), and
  // PIXEL-PERFECT mode (main.js fitCanvas) makes the CSS scale an integer so
  // art pixels are uniform NxN. Smoothing stays OFF for the sprite pass.
  // Headless fallback: no layout rect -> VIEW-sized buffer, 1:1 transform
  // (every existing test assertion is in view coordinates). Assigning
  // canvas.width resets ctx state, so transform + smoothing are re-asserted
  // on every resize.
  resize(dprOverride) {
    const rawDpr = dprOverride !== undefined ? dprOverride
      : ((typeof globalThis.window !== 'undefined' && globalThis.window.devicePixelRatio) || 1);
    const dpr = Math.max(1, Math.min(3, rawDpr || 1));
    this.dpr = dpr;
    let cssW = C.VIEW_W, cssH = C.VIEW_H;
    try {
      const r = this.canvas.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) { cssW = r.width; cssH = r.height; }
    } catch { /* headless stub */ }
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.viewScale = { sx: this.canvas.width / C.VIEW_W, sy: this.canvas.height / C.VIEW_H };
    this.ctx.setTransform(this.viewScale.sx, 0, 0, this.viewScale.sy, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    // G12: assigning canvas.width cleared the canvas — the title card must be
    // recomposed on the next title frame.
    this._titlePainted = false;
  }

  drawSprite(g, grid, x, y) {
    this.drawGrid(g, grid, PALETTE, x, y);
  }

  // Generic pixel-grid painter (sprites.js enemies/boss/flames carry their own
  // palette objects keyed 1..9; 0 = transparent).
  //
  // G9: `scale` is an INTEGER pixel-block size (default 1, so every existing
  // caller paints exactly as before). It exists for the trophy showcase, which
  // paints ONE 32x32 emblem at the largest whole-factor size that fits the
  // view. A canvas transform could do the same job, but the game's pixel-art
  // convention is uniform NxN blocks and a per-pixel fillRect keeps the
  // painted geometry measurable — the gallery test reads the real rects.
  drawGrid(g, grid, palette, x, y, scale = 1) {
    const s = Math.max(1, Math.floor(scale));
    for (let ry = 0; ry < grid.length; ry++) {
      const row = grid[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const v = row[rx];
        if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx * s, y + ry * s, s, s); }
      }
    }
  }

  // ---- G12 TITLE SCREEN --------------------------------------------------------
  // Paints the authored title card (src/art/title.js — composeTitle/drawTitle
  // expand its layers to view pixels ONCE and memoize; no art is restated here)
  // and publishes the seam `this.titleScreen = { x, y, w, h, scale }` so a
  // headless test owns the geometry, exactly like trophyShowcase/bestiary.
  //
  // SCALE: the largest INTEGER number of view pixels per composed title pixel
  // that fits the view (it is 1 today — the card is authored at exactly
  // 480x300 — but the guard keeps a future view change honest). Sub-pixel
  // scaling is what smoothing would buy; it is refused, per house style.
  //
  // PAINT ONCE: the composition is static and nothing else draws on the canvas
  // while 'title' is live (the frame loop's other canvas calls no-op in this
  // mode), so the layers are painted on the first title frame after a change
  // and skipped after — the composed sky alone is ~10^5 pixels, and repainting
  // it every frame would be pure waste. resize() invalidates the cache
  // (assigning canvas.width clears the surface); leaving the mode does too.
  drawTitleScreen(g) {
    const scale = Math.max(1, Math.min(Math.floor(C.VIEW_W / TITLE_WIDTH),
                                        Math.floor(C.VIEW_H / TITLE_HEIGHT)));
    const w = TITLE_WIDTH * scale, h = TITLE_HEIGHT * scale;
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);
    if (!this._titlePainted) {
      if (w < C.VIEW_W || h < C.VIEW_H) {          // letterbox behind an odd fit
        g.fillStyle = '#05050a';
        g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      }
      drawTitle(this.drawGrid.bind(this), g, x, y);
      this._titlePainted = true;
    }
    this.titleScreen = { x, y, w, h, scale };
  }

  render(state, cam) {
    const g = this.ctx;
    // G12 TITLE SCREEN: in mode 'title' the composed title card owns the canvas
    // (main.js keeps the DOM menu on top of it). The world is NOT rendered under
    // it — the owner asked for the title graphic "not on the map", so the map
    // simply never paints here. The play-readout seams are cleared (same gate
    // as the trophy/bestiary showcases in drawPlayHud) so no stale bars or
    // banners read as live behind the menu.
    this.titleScreen = null;
    if (state.mode === 'title') {
      this.hudChrome = null;
      this.bossBanner = null;
      this.moment = null;
      this.radar = null;
      this.atlasMap = null;
      this.drawTitleScreen(g);
      return;
    }
    this._titlePainted = false;   // leaving the title: a return visit repaints
    // WAVE-9B/2 area identity: ground tone + grid dots come from the active
    // wave's theme (theme ladder in CONFIG.GROUND.THEMES).
    const theme = groundTheme(state.wave ? state.wave.num : 1);

    // WAVE-16 WORLD ZOOM (Sk408: pixel detail lost on small mobile screens).
    // Z scales ONLY the world layer below (ground, weather particles, enemies,
    // player, projectiles, gems, chests, arches, shrines, boss, drops):
    // device = viewCenter + (draw - viewCenter) * Z, camera stays player-locked.
    // The HUD chrome / bars / feed / banner / touch layer stay native 1x.
    // Culls test the ZOOMED window (x0..x1 below) with the SAME world-space
    // margins as before — higher zoom shrinks the visible window, so culling
    // gets TIGHTER, never looser: nothing inside the zoomed frame is culled,
    // nothing pops at the screen edge (margins still cover sprite extents,
    // which live in world px regardless of Z).
    // WAVE-26: the integer zoom factor has ONE definition, in main.js's
    // zoomScale(); main.js publishes it as state.zoomScale every frame
    // (syncChrome) and worldRegion()/the coachmark projection read the same
    // value. Read it here so the render transform can never drift from the
    // coachmark projection. Fallback (headless / pre-first-frame): derive it
    // with the identical clamp so a state without zoomScale still renders.
    const zs = state.zoomScale;
    const Z = (typeof zs === 'number' && Number.isFinite(zs) && zs >= 1)
      ? Math.round(zs)
      : Math.max(1, Math.round(state.zoom || 1));
    this._zoom = Z;
    const vw = C.VIEW_W / Z, vh = C.VIEW_H / Z;
    this.worldView = {
      zoom: Z,
      x0: (C.VIEW_W - vw) / 2, x1: (C.VIEW_W + vw) / 2,
      y0: (C.VIEW_H - vh) / 2, y1: (C.VIEW_H + vh) / 2,
    };
    const cull = (x, y, m) => x < this.worldView.x0 - m || y < this.worldView.y0 - m ||
      x > this.worldView.x1 + m || y > this.worldView.y1 + m;

    // Behind the zoomed window: a dark letterbox (matches the WAVE-14 banner
    // bands). Invisible at 1x, where the window IS the full screen.
    if (Z > 1) {
      g.fillStyle = '#08080f';
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // Optional subtle scene tint for the theme (under the entities, full
    // screen — drawn OUTSIDE the zoom transform so it always covers).
    if (theme.tint) {
      g.fillStyle = theme.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // ---- WORLD LAYER (zoomed) ------------------------------------------------
    g.save();
    g.translate(C.VIEW_W / 2, C.VIEW_H / 2);
    g.scale(Z, Z);
    g.translate(-C.VIEW_W / 2, -C.VIEW_H / 2);

    // Ground base + grid dots are world objects too: they zoom with the layer
    // (fillRect 0..VIEW_W inside the transform covers exactly the zoomed
    // window — at 1x that is the whole screen, i.e. identical to before).
    g.fillStyle = theme.base;
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.fillStyle = theme.grid;
    // WAVE-24 (#3): the dot lattice is aligned to the decor CELL and drawn at
    // CELL spacing (was an unrelated 24px grid). At 24px the lattice read as
    // scanline/compression noise; on the same 32px joints as the paving field
    // the dots read as ground seams, and there are ~44% fewer of them.
    const gs = C.GROUND.CELL;
    const ox = ((-cam.x % gs) + gs) % gs;
    const oy = ((-cam.y % gs) + gs) % gs;
    for (let y = oy - gs; y < C.VIEW_H; y += gs) {
      for (let x = ox - gs; x < C.VIEW_W; x += gs) g.fillRect(x, y, 1, 1);
    }

    // ARENA RELIEF: quantized height tints + contour edges, under the decor
    // so elevation reads as terrain without competing with the play pieces.
    this.drawRelief(g, state, cam, theme);
    // Ground decor: world-anchored seeded field, drawn under everything else
    // so the camera's player-lock reads as the PLAYER moving, not the world.
    this.drawGround(g, state.groundSeed || 1, cam, theme);
    // WAVE-24 (#3): deliberate structures over the fine field (see
    // drawLandmarks) — the coarse layer that gives the floor a sense of place.
    this.drawLandmarks(g, state.groundSeed || 1, cam, theme, state.stage);
    this.drawArenaWall(g, cam, theme);   // WAVE-18 (#7): the rim made visible

    // Gems.
    for (const gem of state.gems) {
      const x = gem.x - cam.x, y = gem.y - cam.y;
      if (cull(x, y, 5)) continue;
      g.fillStyle = '#3ef0c0';
      g.fillRect(x - 1, y - 2, 3, 4);
      g.fillRect(x - 2, y - 1, 5, 2);
    }

    // Potion drops: tiny bottles (red = health, blue = mana).
    for (const d of state.drops || []) {
      const x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y);
      if (cull(x, y, 5)) continue;
      g.fillStyle = d.kind === 'hp' ? '#ff5566' : '#4a8cff';
      g.fillRect(x - 2, y - 3, 4, 6);
      g.fillStyle = '#e8e8f0';
      g.fillRect(x - 1, y - 4, 2, 1);
    }

    // Chests: gold boxes that pulse; slide toward the player (main.js).
    for (const ch of state.chests || []) {
      const x = Math.round(ch.x - cam.x), y = Math.round(ch.y - cam.y);
      if (cull(x, y, 12)) continue;
      const blink = Math.floor(ch.age * 3) % 2 === 0;
      g.fillStyle = '#8a6a1e';
      g.fillRect(x - 6, y - 4, 12, 9);
      g.fillStyle = blink ? '#ffd75e' : '#c8a03a';
      g.fillRect(x - 5, y - 3, 10, 4);
      g.fillRect(x - 5, y + 1, 10, 3);
      g.fillStyle = '#3a2a0a';
      g.fillRect(x - 1, y - 1, 2, 2);
    }

    // Rare item drops (loot.js): small glowing boxes colored by rarity;
    // EPIC+ sparkle so they read as loot, not potions.
    for (const d of state.itemDrops || []) {
      const x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y);
      if (cull(x, y, 5)) continue;
      const col = RARITY_COLORS[d.item.rarity] || RARITY_COLORS.COMMON;
      g.fillStyle = col;
      g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = Math.floor((state.time || 0) * 4) % 2 === 0 ? '#ffffff' : col;
      g.fillRect(x - 1, y - 1, 2, 2);
      if (d.item.rarity === 'EPIC' || d.item.rarity === 'LEGENDARY') {
        g.fillStyle = col;
        g.fillRect(x - 4, y, 1, 1); g.fillRect(x + 4, y, 1, 1);
        g.fillRect(x, y - 4, 1, 1); g.fillRect(x, y + 4, 1, 1);
      }
    }

    // Arches (arches.js): pixel gates — twin pillars, lintel + stepped cap,
    // shimmering field in the arch type's color (pulse while untriggered).
    for (const a of state.arches || []) {
      const x = Math.round(a.x - cam.x), y = Math.round(a.y - cam.y);
      if (cull(x, y, 30)) continue;
      const col = ARCH_COLORS[a.type] || '#a8e0ff';
      const glow = 0.5 + 0.5 * Math.sin((state.time || 0) * 3);
      g.fillStyle = 'rgba(255,255,255,' + (0.10 + 0.16 * glow).toFixed(2) + ')';
      g.fillRect(x - 8, y - 16, 16, 32);          // shimmer field under the gate
      g.fillStyle = col;
      g.fillRect(x - 12, y - 14, 4, 28);          // pillars
      g.fillRect(x + 8, y - 14, 4, 28);
      g.fillRect(x - 12, y - 18, 24, 4);          // lintel
      g.fillRect(x - 9, y - 21, 18, 3);           // stepped cap
      g.fillStyle = Math.floor((state.time || 0) * 5) % 2 === 0 ? '#ffffff' : col;
      g.fillRect(x - 1, y - 17, 2, 2);            // keystone glint
    }

    // WAVE-11 RUN SHRINES (shrines.js): pixel altar — stone slab + column +
    // idol head, a soft aura pulse while unsold, a coin glyph on the face.
    // Used shrines go dark (grey column, no aura) so the field reads spent.
    if (state.shrine) {
      const sh = state.shrine;
      const x = Math.round(sh.x - cam.x), y = Math.round(sh.y - cam.y);
      if (!cull(x, y, 30)) {
        const lit = !sh.used;
        const glow = 0.5 + 0.5 * Math.sin((state.time || 0) * 2.5);
        if (lit) {
          g.fillStyle = 'rgba(255,215,94,' + (0.08 + 0.14 * glow).toFixed(2) + ')';
          g.fillRect(x - 10, y - 20, 20, 30);     // aura field
        }
        g.fillStyle = '#3a3a46';                  // base slab
        g.fillRect(x - 7, y + 4, 14, 4);
        g.fillStyle = lit ? '#6a6a7a' : '#4a4a56'; // column
        g.fillRect(x - 3, y - 8, 6, 12);
        g.fillStyle = lit ? '#ffd75e' : '#8a8a96'; // idol head
        g.fillRect(x - 4, y - 13, 8, 5);
        g.fillStyle = lit ? '#fff6c8' : '#6a6a76';
        g.fillRect(x - 1, y - 11, 2, 2);          // eye glint
        if (lit) {                                // coin glyph, blinking
          g.fillStyle = Math.floor((state.time || 0) * 3) % 2 === 0 ? '#ffe9a8' : '#c8a03a';
          g.fillRect(x - 2, y - 4, 4, 4);
        }
      }
    }

    // Portal (wave progression): a rotating ring of flames around a pulsing
    // core — the walk-in that ends the wave. P1 R4 PRESENCE: the ring GROWS
    // in over the portal's first 0.6s (spawn-in animation, integer pixels),
    // and while the entry dwell beat runs the spin triples and the core
    // burns bright — the crossing reads instead of teleporting.
    if (state.portal) {
      const po = state.portal;
      const x = Math.round(po.x - cam.x), y = Math.round(po.y - cam.y);
      const t = state.time || 0;
      const grow = Math.min(1, (po.age || 0) / 0.6);
      const n = 8, R = Math.max(4, Math.round(24 * (0.25 + 0.75 * grow)));
      const spin = po.entering ? 2.4 : 0.8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + t * spin;
        const fx = Math.round(x + Math.cos(ang) * R), fy = Math.round(y + Math.sin(ang) * R);
        const fi = Math.floor(t * 10 + i * 1.3) % FLAME.frames.length;
        this.drawGrid(g, FLAME.frames[fi], FLAME.palette,
          fx - FLAME.anchor.x, fy - FLAME.anchor.y - 4);
      }
      const pulse = po.entering ? 1 : 0.5 + 0.5 * Math.sin(t * 6);
      const r = Math.round((5 + 3 * pulse) * (0.25 + 0.75 * grow));
      g.fillStyle = po.entering ? '#fff6c8' : (pulse > 0.5 ? '#b8e0ff' : '#5a7ad8');
      g.fillRect(x - r, y - 3, r * 2, 6);
      g.fillRect(x - 3, y - r, 6, r * 2);
    }

    // Enemies: hand-authored pixel sprites (sprites.js) with 2-frame walk
    // cycles (frame flips ~6/s off e.age); typed shapes stay as FALLBACK for
    // unmapped types. Status tells preserved: flash/slow tint, elite gold
    // outline, WARLOCK telegraph blink. WAVE-7/B: named bosses carry their
    // own LARGE grids (bosses.js BOSS_SPRITES, 20-26px, crown/robe/star built
    // in) on e.bossSprite; the legacy BOSS_SPRITE stays as the fallback.
    for (const e of state.enemies) {
      if (e.finalBoss) continue;   // WAVE-10: the maw has its own draw below
      const w = Math.round(e.w || C.ENEMY.W), h = Math.round(e.h || C.ENEMY.H);
      const hw = Math.round(w / 2), hh = Math.round(h / 2);
      const x = Math.round(e.x - cam.x);
      let y = Math.round(e.y - cam.y);
      if (cull(x, y, 30)) continue;
      // E2 (R9): a flyer draws its ground SHADOW at (x,y) — the sim's 2D
      // truth (contact/targeting read that point) — then the whole body
      // (sprite or fallback shape, tells and hp bar included) lifts by its
      // altitude z. Integer px throughout (house rule).
      if (e.flying) {
        const shw = Math.max(2, Math.round(w * 0.7));
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x - Math.round(shw / 2), y + hh - 2, shw, 2);
        g.fillRect(x - Math.round(shw / 4), y + hh - 4, Math.max(1, Math.round(shw / 2)), 2);
        y -= Math.round(e.z || 0);
      }
      const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : SPRITES[e.typeId];
      if (spr) {
        const sx = x - spr.anchor.x, sy = y - spr.anchor.y;
        const bw = spr.box.w, bh = spr.box.h;
        const frame = spr.frames[Math.floor((e.age || 0) * 6) % spr.frames.length];
        this.drawGrid(g, frame, spr.palette, sx, sy);
        // Status tints wash the whole sprite box.
        if (e.flash > 0) {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.fillRect(sx, sy, bw, bh);
        } else if (e.slow > 0) {
          g.fillStyle = 'rgba(106,168,216,0.4)';
          g.fillRect(sx, sy, bw, bh);
        }
        // COLOSSUS idle: shoulder braziers (Sk408 loves flames).
        if (e.typeId === 'COLOSSUS') {
          const fi = Math.floor((state.time || 0) * 10) % FLAME.small.length;
          this.drawGrid(g, FLAME.small[fi], FLAME.palette, x - 7, y - hh - 3);
          this.drawGrid(g, FLAME.small[fi], FLAME.palette, x + 3, y - hh - 3);
        }
        if (e.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(sx - 1, sy - 1, bw + 2, 1);
          g.fillRect(sx - 1, sy + bh + 1, bw + 2, 1);
          g.fillRect(sx - 1, sy - 1, 1, bh + 2);
          g.fillRect(sx + bw + 1, sy - 1, 1, bh + 2);
        }
        if (e.elite) {
          g.fillStyle = '#ffd75e';
          g.fillRect(sx - 1, sy - 1, bw + 2, 1);
          g.fillRect(sx - 1, sy + bh + 1, bw + 2, 1);
          g.fillRect(sx - 1, sy - 1, 1, bh + 2);
          g.fillRect(sx + bw + 1, sy - 1, 1, bh + 2);
        }
        if (e.rarity) rarityRing(g, e, state, sx, sy, bw, bh);
        if (e.hp < e.maxHp) {
          g.fillStyle = '#000000';
          g.fillRect(sx, sy - 3, bw, 1);
          g.fillStyle = '#ff5566';
          g.fillRect(sx, sy - 3, Math.ceil(bw * e.hp / e.maxHp), 1);
        }
      } else {
        // Fallback: typed shapes + palette variants via resolveLook.
        const look = resolveLook(e.typeId, e.variant || 0);
        let body = e.flash > 0 ? '#ffffff' : (e.slow > 0 ? '#6aa8d8' : look.body);
        let trim = e.flash > 0 ? '#dddddd' : (e.slow > 0 ? '#3a6a9a' : look.trim);
        let accent = look.accent || '#ffffff';
        if (e.elite) { trim = ELITE_LOOK.trim; accent = ELITE_LOOK.accent; } // gold tell
        g.fillStyle = body;
        drawShape(g, look.shape, x, y, w, h);
        // Trim band across the box (kept inside the silhouette's middle).
        g.fillStyle = trim;
        g.fillRect(x - Math.round(w * 0.35), y - 1, Math.round(w * 0.7), 2);
        g.fillRect(x - 1, y - Math.round(h * 0.35), 2, Math.round(h * 0.7));
        // Accent core pixel.
        g.fillStyle = accent;
        g.fillRect(x - 1, y - 1, 2, 2);
        // E2 (R9): wing flap for the flyer — two beating side rows off the
        // age phase (~8/s), so the hover READS as flight, not a float.
        if (e.flying) {
          const flap = Math.floor((e.age || 0) * 8) % 2 === 0 ? 0 : 2;
          g.fillStyle = trim;
          g.fillRect(x - hw - 3, y - 2 - flap, 3, 2);
          g.fillRect(x + hw, y - 2 - flap, 3, 2);
        }
        if (e.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(x - hw - 1, y - hh - 1, w + 2, 1);
          g.fillRect(x - hw - 1, y + hh + 1, w + 2, 1);
          g.fillRect(x - hw - 1, y - hh - 1, 1, h + 2);
          g.fillRect(x + hw + 1, y - hh - 1, 1, h + 2);
        }
        if (e.elite) {
          g.fillStyle = '#ffd75e';
          g.fillRect(x - hw - 1, y - hh - 1, w + 2, 1);
          g.fillRect(x - hw - 1, y + hh + 1, w + 2, 1);
          g.fillRect(x - hw - 1, y - hh - 1, 1, h + 2);
          g.fillRect(x + hw + 1, y - hh - 1, 1, h + 2);
        }
        if (e.rarity) rarityRing(g, e, state, x - hw, y - hh, w, h);
        if (e.hp < e.maxHp) {
          g.fillStyle = '#000000';
          g.fillRect(x - hw, y - hh - 3, w, 1);
          g.fillStyle = '#ff5566';
          g.fillRect(x - hw, y - hh - 3, Math.ceil(w * e.hp / e.maxHp), 1);
        }
      }
      // WAVE-11 elite modifier tells (elite_mods.js stamps e.eliteMod + a
      // `visual` string; render only reads it). Drawn for BOTH sprite and
      // fallback branches — the tells layer on top of the elite gold outline.
      if (e.eliteMod) {
        const pl2 = state.player;
        if (e.eliteMod === 'SWIFT') {
          // Afterimage: 3 fading dots trailing opposite the player direction.
          const dx = e.x - pl2.x, dy = e.y - pl2.y;
          const len = Math.hypot(dx, dy) || 1;
          g.fillStyle = 'rgba(104,224,128,0.5)';
          for (let i = 1; i <= 3; i++) {
            g.fillRect(Math.round(x + (dx / len) * i * 4) - 1,
                       Math.round(y + (dy / len) * i * 4) - 1, 2, 2);
          }
        } else if (e.eliteMod === 'SPLITTING') {
          // Cracked: dark fracture cross over the body's core.
          g.fillStyle = 'rgba(20,20,30,0.75)';
          g.fillRect(x - 4, y, 9, 1);
          g.fillRect(x, y - 4, 1, 9);
          g.fillRect(x - 3, y - 3, 1, 1);
          g.fillRect(x + 3, y + 3, 1, 1);
        } else if (e.eliteMod === 'VAMPIRIC') {
          // Leech: pulsing red heart-core (2Hz heartbeat swell).
          const beat = 0.5 + 0.5 * Math.sin((state.time || 0) * 12);
          const cs = beat > 0.5 ? 3 : 2;
          g.fillStyle = '#ff3040';
          g.fillRect(x - Math.round(cs / 2), y - Math.round(cs / 2), cs, cs);
        }
      }
      // Attached tick: red drain tether dots to the player.
      if (e.attached) {
        const px = Math.round(state.player.x - cam.x), py = Math.round(state.player.y - cam.y);
        const steps = 4;
        g.fillStyle = '#ff5566';
        for (let i = 1; i < steps; i++) {
          const u = i / steps;
          g.fillRect(Math.round(x + (px - x) * u), Math.round(y + (py - y) * u), 1, 1);
        }
      }
    }

    // WAVE-10 FINALE: the maw of the horde — huge (4x zoom) void-black grid
    // from final_boss.js, 2-frame idle, white hit-flash, and the hot pink
    // telegraph wash during the 0.8s pre-barrage window (decide() sets the
    // flag; render only reads it). fillRect-only, like everything else.
    if (state.finalBoss && state.mode === 'finale') {
      const fb = state.finalBoss;
      const spr = FINAL_BOSS_SPRITE;
      const Z = 4;
      const x = Math.round(fb.x - cam.x), y = Math.round(fb.y - cam.y);
      const frame = spr.frames[Math.floor((fb.age || 0) * 6) % spr.frames.length];
      const sx = x - spr.anchor.x * Z, sy = y - spr.anchor.y * Z;
      for (let ry = 0; ry < frame.length; ry++) {
        const row = frame[ry];
        for (let rx = 0; rx < row.length; rx++) {
          const v = row[rx];
          if (v) { g.fillStyle = spr.palette[v]; g.fillRect(sx + rx * Z, sy + ry * Z, Z, Z); }
        }
      }
      if (fb.flash > 0) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      } else if (fb.slow > 0) {
        g.fillStyle = 'rgba(106,168,216,0.4)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      }
      if (fb.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0) {
        g.fillStyle = 'rgba(255,47,94,0.45)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      }
    }

    // Enemy projectiles: spit (green blob), bolt (heavy purple, WARLOCK),
    // nova (pink, boss radial burst).
    for (const s of state.enemyShots || []) {
      const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
      if (cull(x, y, 5)) continue;
      if (s.kind === 'bolt') {
        g.fillStyle = '#c46ad8';
        g.fillRect(x - 3, y - 3, 7, 7);
        g.fillStyle = '#52203d';
        g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle = '#ff9ed8';
        g.fillRect(x - 1, y - 4, 1, 1);
      } else if (s.kind === 'nova') {
        g.fillStyle = '#ff7a9a';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#a83a5a';
        g.fillRect(x - 1, y - 1, 2, 2);
      } else if (s.kind === 'maw') {
        // Barrage round (WAVE-10): hot-pink mote with a white-hot core.
        g.fillStyle = '#ff2f5e';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#ffd0da';
        g.fillRect(x - 1, y - 1, 2, 2);
      } else {
        g.fillStyle = '#68e080';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#1f6a2a';
        g.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // Projectiles: volley shots + kind-tagged weapon bodies (boomerang spin,
    // seeker missiles, dropped mines).
    for (const p of state.projectiles) {
      const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      if (cull(x, y, 8)) continue;
      if (p.kind === 'boomerang') {
        // Spin: alternate between horizontal and vertical bars.
        const spin = Math.floor(p.age * 20) % 2 === 0;
        g.fillStyle = '#b8e0ff';
        if (spin) { g.fillRect(x - 4, y - 1, 9, 2); }
        else { g.fillRect(x - 1, y - 4, 2, 9); }
        g.fillStyle = '#5a9ad8';
        g.fillRect(x - 1, y - 1, 2, 2);
        continue;
      }
      if (p.kind === 'seeker') {
        // Missile: bright head in flight direction + cyan tail fins.
        const hx = Math.round(x + Math.cos(p.ang) * 2), hy = Math.round(y + Math.sin(p.ang) * 2);
        g.fillStyle = '#ffdd7a';
        g.fillRect(hx - 1, hy - 1, 3, 3);
        g.fillStyle = '#ff8848';
        g.fillRect(Math.round(x - Math.cos(p.ang) * 2) - 1, Math.round(y - Math.sin(p.ang) * 2) - 1, 2, 2);
        continue;
      }
      if (p.kind === 'mine') {
        // Dark disc + blinking red light (1Hz blink on age).
        g.fillStyle = '#3a3a46';
        g.fillRect(x - 3, y - 2, 7, 5);
        g.fillRect(x - 2, y - 3, 5, 7);
        g.fillStyle = Math.floor((p.age || 0) * 2) % 2 === 0 ? '#ff3040' : '#7a1018';
        g.fillRect(x - 1, y - 1, 2, 2);
        continue;
      }
      g.fillStyle = '#ffe9a8';
      g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = '#ff9a3c';
      g.fillRect(x - 1, y - 1, 2, 2);
    }

    // Skill/weapon effects (fillRect only).
    let pendingFlash = null;   // 'flash' paints full-screen at NATIVE 1x — deferred past the world restore
    for (const fx of state.effects || []) {
      const t = fx.age / fx.ttl; // 0 -> 1
      if (fx.kind === 'nova' || fx.kind === 'nova_pulse' || fx.kind === 'boss_nova' ||
          fx.kind === 'mine_blast' || fx.kind === 'colossus_shock' ||
          fx.kind === 'rewrite_boom' || fx.kind === 'rewrite_harvest' ||
          fx.kind === 'magnet') {
        // Expanding ring: 1px rects sampled along a circle. Color per kind.
        const r = fx.radius * t;
        g.fillStyle = fx.kind === 'nova'
          ? (t < 0.5 ? '#a8e0ff' : '#5a9ad8')
          : fx.kind === 'boss_nova'
            ? (t < 0.5 ? '#ff7a9a' : '#a83a5a')
            : fx.kind === 'mine_blast'
              ? (t < 0.4 ? '#ffd75e' : t < 0.75 ? '#ff8848' : '#a83a1e')
              : fx.kind === 'colossus_shock'
                ? (t < 0.5 ? '#e8e8f0' : '#8a8a96')
                // G8 step 2: Chain Reaction (warm ember) / Blood Harvest (red).
                // RSS8 magnet: gold loot tell — matches nothing else on the field.
                : fx.kind === 'rewrite_boom'
                  ? (t < 0.5 ? '#ffb066' : '#b05a2a')
                  : fx.kind === 'rewrite_harvest'
                    ? (t < 0.5 ? '#ff6a7a' : '#a02a3a')
                    : fx.kind === 'magnet'
                      ? (t < 0.5 ? '#ffe98a' : '#c8a03a')
                      : (t < 0.5 ? '#d0a8ff' : '#8a5ad8');
        const steps = 48;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          g.fillRect(Math.round(fx.x + Math.cos(a) * r - cam.x),
                     Math.round(fx.y + Math.sin(a) * r - cam.y), 2, 2);
        }
      } else if (fx.kind === 'scythe_windup' || fx.kind === 'scythe_arc') {
        // Sweep telegraph (faint blink) / landed sweep (bright arc + inner
        // echo) — dots sampled along the wedge's outer arc.
        const bright = fx.kind === 'scythe_arc';
        const blink = Math.floor((fx.age || 0) * 24) % 2 === 0;
        if (bright || blink) {
          g.fillStyle = bright ? (t < 0.4 ? '#ffffff' : '#a8e0ff') : '#c8d8e8';
          const steps = 16;
          for (let i = 0; i <= steps; i++) {
            const a = fx.dir - fx.arc / 2 + (i / steps) * fx.arc;
            const rr = bright ? fx.radius * (1 - t * 0.25) : fx.radius;
            g.fillRect(Math.round(fx.x + Math.cos(a) * rr - cam.x) - 1,
                       Math.round(fx.y + Math.sin(a) * rr - cam.y) - 1, 3, 3);
            if (bright && i % 2 === 0) {  // inner echo dots
              g.fillRect(Math.round(fx.x + Math.cos(a) * rr * 0.55 - cam.x),
                         Math.round(fx.y + Math.sin(a) * rr * 0.55 - cam.y), 2, 2);
            }
          }
        }
      } else if (fx.kind === 'seeker_trail') {
        // Fading exhaust trail: dots shrink + cool down along the polyline.
        const n = fx.points.length;
        for (let i = 0; i < n; i++) {
          const pt = fx.points[i];
          const fade = (i / n) * (1 - t);   // older points dimmer
          const sz = fade > 0.5 ? 2 : 1;
          g.fillStyle = fade > 0.66 ? '#ffdd7a' : fade > 0.33 ? '#ff8848' : '#7a3a1e';
          g.fillRect(Math.round(pt.x - cam.x), Math.round(pt.y - cam.y), sz, sz);
        }
      } else if (fx.kind === 'mine_shrap') {
        // Shrapnel dot flying outward: position = origin + dir * dist * t.
        const d = fx.dist * t;
        g.fillStyle = t < 0.5 ? '#ffd75e' : '#ff8848';
        g.fillRect(Math.round(fx.x + Math.cos(fx.ang) * d - cam.x) - 1,
                   Math.round(fx.y + Math.sin(fx.ang) * d - cam.y) - 1, 2, 2);
      } else if (fx.kind === 'beam') {
        // Piercing laser: the visible beam sweeps from->to over its life,
        // thickness flickers via a deterministic per-fire phase.
        const dir = fx.from + (fx.to - fx.from) * t;
        const flicker = 0.6 + 0.4 * Math.sin((fx.age || 0) * 40 + (fx.phase || 0));
        const cx = Math.cos(dir), cy = Math.sin(dir);
        const th = Math.max(2, Math.round(fx.width * flicker * (1 - t * 0.4)));
        const steps = Math.ceil(fx.len / 6);
        for (let i = 0; i <= steps; i++) {
          const d = (i / steps) * fx.len;
          const x = Math.round(fx.x + cx * d - cam.x), y = Math.round(fx.y + cy * d - cam.y);
          g.fillStyle = '#ff5566';                       // outer glow
          g.fillRect(x - Math.round(th / 2), y - Math.round(th / 2), th, th);
          g.fillStyle = '#ffffff';                       // hot core
          g.fillRect(x - 1, y - 1, 2, 2);
        }
      } else if (fx.kind === 'zap') {
        // Chain lightning: 2px dots sampled along each polyline segment.
        g.fillStyle = t < 0.5 ? '#ffffff' : '#a8e0ff';
        for (let s = 0; s < fx.points.length - 1; s++) {
          const a = fx.points[s], b = fx.points[s + 1];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.max(2, Math.ceil(len / 5));
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            g.fillRect(Math.round(a.x + (b.x - a.x) * u - cam.x),
                       Math.round(a.y + (b.y - a.y) * u - cam.y), 2, 2);
          }
        }
      } else if (fx.kind === 'orbit') {
        // Orbit blade: bright dot (blades emit these every frame).
        g.fillStyle = '#c8e8ff';
        g.fillRect(Math.round(fx.x - cam.x) - 2, Math.round(fx.y - cam.y) - 2, 4, 4);
        g.fillStyle = '#5a9ad8';
        g.fillRect(Math.round(fx.x - cam.x) - 1, Math.round(fx.y - cam.y) - 1, 2, 2);
      } else if (fx.kind === 'orbit_hit') {
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(fx.x - cam.x) - 3, Math.round(fx.y - cam.y) - 3, 6, 6);
      } else if (fx.kind === 'hit_spark' || fx.kind === 'muzzle' || fx.kind === 'scythe_hit' ||
                 fx.kind === 'seeker_pop' || fx.kind === 'mine_hit' || fx.kind === 'mine_fizzle' ||
                 fx.kind === 'beam_hit') {
        // Generic spark dot: shrink + darken over life. Color per source.
        g.fillStyle = fx.kind === 'hit_spark' ? (t < 0.5 ? '#ffffff' : '#ffd75e')
          : fx.kind === 'muzzle' ? (t < 0.5 ? '#ffe9a8' : '#ff9a3c')
          : fx.kind === 'scythe_hit' ? (t < 0.5 ? '#ffffff' : '#a8e0ff')
          : fx.kind === 'seeker_pop' ? (t < 0.5 ? '#ffdd7a' : '#ff8848')
          : fx.kind === 'mine_hit' ? (t < 0.5 ? '#ffd75e' : '#ff8848')
          : fx.kind === 'beam_hit' ? (t < 0.5 ? '#ff9e9e' : '#ff5566')
          : (t < 0.5 ? '#8a8a96' : '#5a5a66');   // mine_fizzle
        const sz = t < 0.4 ? 4 : t < 0.75 ? 3 : 2;
        const x = Math.round(fx.x - cam.x), y = Math.round(fx.y - cam.y);
        g.fillRect(x - Math.round(sz / 2), y - Math.round(sz / 2), sz, sz);
        // Tiny fly-out flecks on the biggest sparks.
        if ((fx.kind === 'hit_spark' || fx.kind === 'mine_hit') && t < 0.6) {
          g.fillRect(x - 3, y, 1, 1); g.fillRect(x + 3, y, 1, 1);
          g.fillRect(x, y - 3, 1, 1); g.fillRect(x, y + 3, 1, 1);
        }
      } else if (fx.kind === 'flash') {
        // WAVE-11 FLASH DROP: full-screen white-out fading over the fx life —
        // the screen-clear moment erases the weakest trash tier. WAVE-16: the
        // fill must cover the WHOLE screen, so it draws after the zoom layer
        // is restored (a fillRect inside the world transform would only wash
        // the zoomed sub-rect).
        pendingFlash = fx;
      } else if (fx.kind === 'charge') {
        // Flickering yellow brackets around the player while overcharged.
        if (Math.floor(fx.age * 20) % 2 === 0) {
          const x = Math.round(fx.x - cam.x), y = Math.round(fx.y - cam.y);
          g.fillStyle = '#ffd75e';
          g.fillRect(x - 10, y - 10, 5, 2); g.fillRect(x - 10, y - 10, 2, 5);
          g.fillRect(x + 5, y - 10, 5, 2);  g.fillRect(x + 8, y - 10, 2, 5);
          g.fillRect(x - 10, y + 8, 5, 2);  g.fillRect(x - 10, y + 5, 2, 5);
          g.fillRect(x + 5, y + 8, 5, 2);   g.fillRect(x + 8, y + 5, 2, 5);
        }
      }
    }

    // Player. Walk cycle (2 frames @ ~6fps, same clock as the enemies) —
    // frame B only while actually moving: motion is derived from the player's
    // position delta between renders (the same velocity the controller
    // produces), so no gameplay state was added. Stationary -> frame A.
    const pl = state.player;
    if (pl.invuln > 0 && Math.floor(state.time * 20) % 2 === 0) {
      g.globalAlpha = 0.4;
    }
    const moved = this._lpx !== undefined &&
      Math.abs(pl.x - this._lpx) + Math.abs(pl.y - this._lpy) > 0.25;
    this._lpx = pl.x; this._lpy = pl.y;
    const walkFrame = moved && Math.floor(state.time * 6) % 2 === 1;
    this.drawSprite(g, walkFrame ? PLAYER_SPRITE_WALK : PLAYER_SPRITE,
      Math.round(pl.x - cam.x - 6),
      Math.round(pl.y - cam.y - 6));
    g.globalAlpha = 1;

    // Weather PARTICLES (weather.js): camera-anchored rain/snow/wind/bugs —
    // they ride the world zoom like everything else in this layer. The
    // distant sky layers (cloud bands, sun, scene tint) stay NATIVE 1x and
    // paint after the restore below.
    this.drawWeatherParticles(g, state.weather, cam);

    // ---- end of the zoomed world layer --------------------------------------
    g.restore();

    // Deferred WAVE-11 flash: full-screen white-out at native 1x so the wash
    // covers the whole screen regardless of zoom.
    if (pendingFlash) {
      const ft = pendingFlash.age / pendingFlash.ttl;
      g.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - ft)).toFixed(3) + ')';
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // Boss HP bar: full-width overlay at the top while a boss lives (native).
    {
      const boss = state.wave && state.wave.boss;
      if (boss && boss.hp > 0) {
        const x0 = 24, x1 = C.VIEW_W - 24, y = 4;
        const w = x1 - x0;
        g.fillStyle = '#000000';
        g.fillRect(x0 - 1, y - 1, w + 2, 7);
        g.fillStyle = '#8a2be2';
        g.fillRect(x0, y, Math.ceil(w * Math.max(0, boss.hp / boss.maxHp)), 5);
        g.fillStyle = '#ffd75e';
        g.fillRect(x0, y, 2, 5);
        g.fillRect(x1 - 2, y, 2, 5);
      }
      // WAVE-10: the maw's bar — taller and blood-red; the hp floors at
      // HP_FLOOR so it NEVER fully empties while BEATABLE is false (reads as
      // draining-toward-something, not broken). The exact number lives in the
      // HUD text line (M-formatted); the canvas bar is the drama.
      const fb = state.finalBoss;
      if (fb && state.mode === 'finale') {
        const bx0 = 16, bx1 = C.VIEW_W - 16, by = 2;
        const bw = bx1 - bx0;
        g.fillStyle = '#000000';
        g.fillRect(bx0 - 1, by - 1, bw + 2, 9);
        g.fillStyle = '#5a0a1c';
        g.fillRect(bx0, by, bw, 7);
        g.fillStyle = '#ff2f5e';
        g.fillRect(bx0, by, Math.ceil(bw * Math.max(0, fb.hp / fb.maxHp)), 7);
        g.fillStyle = '#ffd75e';
        g.fillRect(bx0, by, 2, 7);
        g.fillRect(bx1 - 2, by, 2, 7);
      }
    }

    // Weather sky + tint (weather.js): bands/rays/tint are screen-dressing,
    // not world objects — they stay native 1x and cover the full screen.
    this.drawWeatherSky(g, state.weather, cam);

    // WAVE-12 canvas HUD chrome: graphic HP/mana bars, weapon/equipment icon
    // rows, weather glyph. Drawn LAST so it always sits above the scene.
    // WAVE-26: the earned-moment flourish paints just BELOW the chrome so the
    // HUD readouts stay legible through the flare.
    this.drawPlayHud(g, state);
    // M1 THE MAP SCREEN: drawn LAST on the canvas layer — OPAQUE over the
    // field (C1; the DOM touch pads stay tappable above the canvas, so the
    // player can still steer blind and close it). Self-gates on mapOpen.
    this.drawAtlasMap(g, state);
    // WAVE-14 boss-arrival overlay: cinematic letterbox + name. Above even
    // the HUD chrome — it is a moment, not a readout.
  }

  // ---- the play HUD, in one gated seam ---------------------------------------
  // G9 FOLLOW-UP (parent-found): the gallery is NOT a play state. The frozen
  // world stays as the backdrop, but the play READOUTS (bars, LV, clock, the
  // event feed flourish and the boss banner) must not bleed through the
  // showcase. The DOM side already does this via chromeOn(); this is the canvas
  // half of the same gate. Folded into ONE method so it is directly assertable
  // (test_trophy_gallery) — paint order is unchanged: moment, chrome, banner.
  drawPlayHud(g, state) {
    // G10: the bestiary is the same non-play showcase state — the readouts
    // must not bleed through the guide either (the G9 follow-up, extended).
    if (state.mode === 'trophies' || state.mode === 'bestiary') {
      this.hudChrome = null; this.bossBanner = null; this.radar = null; return;
    }
    this.drawMoment(g, state);
    this.drawHudChrome(g, state);
    this.drawRadar(g, state);
    this.drawBossBanner(g, state);
  }

  // ---- A2 THE RADAR (owner-suggested 2026-09-14, pair to A1's AUTO pilot) ----
  // A circular minimap in the HUD layer: nearby enemies as tier-classified dots
  // around the player. The DATA is radar.js's radarDots() — the same function
  // test_radar.mjs pins — called every frame with the live state; this method
  // only paints what it returns. There is no time term anywhere in it (the dot
  // set is a pure function of the current positions), so 60Hz and 120Hz paint
  // the identical frame for the identical state — nothing assumes a dt.
  //
  // GEOMETRY (fixed; the H1 no-reflow contract — the radar never reflows any
  // other HUD element, its box is a constant of the view): bottom-right corner,
  // display radius RADAR_DISPLAY_R view px, mapped over RADAR_RADIUS (330)
  // world px — the module's radius, which covers the whole 322px spawn ring.
  //
  // THE PAIRING (owner context): AUTOPILOT.FOCUS_RANGE (100 world px) is the
  // pilot's engagement radius, and the radar exists to show what the AUTO pilot
  // is IGNORING — so the focus ring is painted as a faint circle at its true
  // scaled radius: dots INSIDE it are the pilot's problem, dots outside are
  // the player's. Read from C.AUTOPILOT, never restated.
  //
  // `this.radar` is the honest test seam (same contract as hudChrome): the
  // exact box + the screen-space dots painted this frame, null while the
  // radar is off — so "toggle off restores the HUD" is assertable as
  // radar === null plus zero paint in the box.
  // N6: the radar's STATIC paint — plate rows, steel rim, focus ring, centre
  // pip — exactly the loops drawRadar used to run per frame. Kept verbatim as
  // the cache BUILDER (and the parity reference): same fills, same integer
  // coordinates, just aimed at the offscreen canvas once instead of the main
  // canvas every frame.
  _paintRadarPlate(g, cx, cy, R, focusR) {
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      g.fillStyle = C.HUD.PLATE;
      g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R || d <= R - 1.5) continue;
        g.fillStyle = C.HUD.FRAME;                     // steel rim, 1px band
        g.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    // The AUTO pilot's engagement ring (the pairing made visible): faint, 1px.
    if (focusR > 1) {
      g.fillStyle = 'rgba(184,224,255,0.28)';
      for (let dy = -focusR; dy <= focusR; dy++) {
        for (let dx = -focusR; dx <= focusR; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > focusR || d <= focusR - 1.2) continue;
          g.fillRect(cx + dx, cy + dy, 1, 1);
        }
      }
    }
    // The player pip at the centre (the radar is player-relative by contract).
    g.fillStyle = '#e8e8f0';
    g.fillRect(cx - 1, cy - 1, 3, 3);
  }

  drawRadar(g, state) {
    const p = state.player;
    if (!state.radarOn || !p || !p.stats) { this.radar = null; return; }
    const R = RADAR_DISPLAY_R;
    const cx = C.VIEW_W - RADAR_CORNER_INSET - R;
    const cy = C.VIEW_H - RADAR_CORNER_INSET - R;
    // ARENA RELIEF — VISION (the reward half of high ground): the radar's
    // WORLD reach widens while the drawn disc stays the same fixed-geometry
    // box, so the same plate maps more world (the dots compress). The radius
    // always still covers the spawn ring — on high ground with room to spare.
    const vision = reliefVisionRadius(RADAR_RADIUS,
      reliefLevel(p.x, p.y, state.groundSeed || 0, stageRelief(state.stage)));
    const scale = R / vision;
    const focusR = Math.round((C.AUTOPILOT.FOCUS_RANGE || 0) * scale);

    // The dot set, from the real data layer: live enemies only, classified by
    // classifyTier inside radar.js (BOSS > ELITE > CHAFF — never restated here).
    const live = [];
    for (const e of state.enemies) if (e && e.hp > 0) live.push(e);
    const dots = radarDots(p, live, { radius: vision, displayRadius: R });

    // Plate: a filled dark disc painted as pixel rows (integer half-widths —
    // no arc(), no antialiasing, per the pixel-art rule), then a 1px rim.
    // N6: all of plate + rim + focus ring + centre pip is a pure function of
    // (R, focusR) — both constants of the view — so it is painted ONCE into an
    // offscreen canvas (via _paintRadarPlate, the ORIGINAL loops verbatim, so
    // parity is by construction; tools/verify_nits_n6_parity.mjs byte-compares
    // the cache against the same loops) and blitted per frame. The one
    // drawImage here is this cache's blit — render.js stays free of image
    // ASSETS (the module rule); a cached raster of its own paint is not one.
    const plateKey = R + '@' + focusR;
    if (!this._radarPlate || this._radarPlateKey !== plateKey) {
      // DOM-free by preference (WAVE-27 pin: render.js never touches the DOM
      // global): OffscreenCanvas where it exists (every target browser), else
      // a scratch canvas borrowed from the MAIN canvas's own ownerDocument —
      // the headless-test path, which stubs it on the canvas it hands in.
      const off = (typeof OffscreenCanvas === 'function')
        ? new OffscreenCanvas(2 * R + 1, 2 * R + 1)
        : this.canvas.ownerDocument.createElement('canvas');
      off.width = 2 * R + 1; off.height = 2 * R + 1;
      this._paintRadarPlate(off.getContext('2d'), R, R, R, focusR);
      this._radarPlate = off;
      this._radarPlateKey = plateKey;
      this.radarPlateBuilds++;
    }
    g.drawImage(this._radarPlate, cx - R, cy - R);

    // Dots: size + colour by tier, centred on the integer radar-space offset
    // radarDots returned (screen = centre + offset; the mapping is 1:1).
    const counts = { chaff: 0, elite: 0, boss: 0 };
    const painted = [];
    for (const dot of dots) {
      const st = RADAR_DOT_STYLE[dot.tier] || RADAR_DOT_STYLE.chaff;
      const sx = cx + dot.x, sy = cy + dot.y;
      const o = Math.floor(st.size / 2);
      g.fillStyle = st.color;
      g.fillRect(sx - o, sy - o, st.size, st.size);
      counts[dot.tier] = (counts[dot.tier] || 0) + 1;
      painted.push({ x: sx, y: sy, tier: dot.tier, typeId: dot.typeId, size: st.size, color: st.color });
    }
    // M1 (C2 — ONE TRACKER, TWO SCALES): nearby DISCOVERED landmarks, read
    // from the SAME atlas.landmarks the map screen paints (atlas.js owns the
    // datum; this is a read-only projection into radar space). Gold squares —
    // the shrine idol's colour (render.js shrine draw). Undiscovered
    // landmarks paint NOWHERE, here or on the map (R4).
    const landmarks = [];
    if (state.atlas) {
      for (const lm of state.atlas.landmarks) {
        if (!lm.discovered) continue;
        const dx = lm.x - p.x, dy = lm.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (!(dist <= vision)) continue;   // radar.js's inclusive rule, at the vision radius
        const mx = cx + Math.round(dx * scale), my = cy + Math.round(dy * scale);
        g.fillStyle = '#ffd75e';
        g.fillRect(mx - 1, my - 1, 3, 3);
        landmarks.push({ x: mx, y: my, kind: lm.kind });
      }
    }
    this.radar = { cx, cy, r: R, focusR, counts, dots: painted, landmarks };
  }

  // ---- M1 THE PER-RUN MAP SCREEN (owner directive 2026-09-14,
  // docs/briefs/M1_MAP_SCREEN.md) -------------------------------------------
  // The whole 1200x1200 arena at small scale: VISITED AREAS ONLY off the
  // atlas's visited grid (the Metroid convention — the rest is haze), plus
  // DISCOVERED landmarks and the player pip. The datum is state.atlas, the
  // SAME atlas.js tracker the radar reads (C2: one system, two scales).
  //
  // INTEGER-SPANS ONLY (the A2 lesson, restated in C7): every mark below is
  // an integer fillRect — no ctx.arc, no antialiased circle edge, no
  // gradients, no per-cell string work. GEOMETRY IS FIXED (the H1 no-reflow
  // rule): 8 view px per grid cell over the 30x30 grid -> a 240x240 map,
  // integer-centred in the 480x300 view at (120,30). OPAQUE over the field
  // (C1): the sim keeps running while it is open, so hiding the field is the
  // stated risk, not an accident.
  //
  // READ-ONLY: a draw never writes sim state and never advances a timer —
  // the only fields touched are paint locals and this.atlasMap, the honest
  // test seam (null while the map is closed, so "close restores the field"
  // is assertable as atlasMap === null plus zero paint in the box).
  drawAtlasMap(g, state) {
    const atlas = state.atlas;
    if (!state.mapOpen || !atlas || !state.player) { this.atlasMap = null; return; }
    const side = atlas.side;
    // ARENA SCALE-UP: the map must FIT the 480x300 view at any arena size —
    // the cell shrinks so the whole arena reads inside a <=240px box (the
    // shipped 30x30 grid -> 8px cells; the 45x45 nine-unit grid -> 5px).
    // Integer px either way, same paint, same fields.
    const CELL = Math.max(2, Math.floor(240 / side));
    const size = side * CELL;
    const ox = Math.round((C.VIEW_W - size) / 2);
    const oy = Math.round((C.VIEW_H - size) / 2);
    // The plate: one OPAQUE dark rect (the field is hidden BY DESIGN — C1),
    // the unvisited haze as the field's own base fill.
    g.fillStyle = '#04060a';
    g.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    g.fillStyle = '#0a0e14';                           // haze = UNVISITED
    g.fillRect(ox, oy, size, size);
    // Visited cells, one integer rect each.
    g.fillStyle = '#233420';
    let visited = 0;
    for (let cy = 0; cy < side; cy++) {
      for (let cx = 0; cx < side; cx++) {
        if (!atlas.visited[cy * side + cx]) continue;
        g.fillRect(ox + cx * CELL, oy + cy * CELL, CELL, CELL);
        visited++;
      }
    }
    // The arena rim frame: the map reads as THE ARENA, not a texture.
    g.fillStyle = '#3a4a58';
    g.fillRect(ox - 1, oy - 1, size + 2, 1);
    g.fillRect(ox - 1, oy + size, size + 2, 1);
    g.fillRect(ox - 1, oy, 1, size);
    g.fillRect(ox + size, oy, 1, size);
    // Landmarks: DISCOVERED only (R4 — an undiscovered one is drawn NOWHERE).
    const marks = [];
    for (const lm of atlas.landmarks) {
      if (!lm.discovered) continue;
      const c = atlasCell(atlas, lm.x, lm.y);
      const mx = ox + c.cx * CELL + (CELL >> 1), my = oy + c.cy * CELL + (CELL >> 1);
      g.fillStyle = '#ffd75e';                         // the shrine idol's gold
      g.fillRect(mx - 2, my - 2, 5, 5);
      marks.push({ kind: lm.kind, x: mx, y: my });
    }
    // The player pip, same cell rule as everything else.
    const pc = atlasCell(atlas, state.player.x, state.player.y);
    const px = ox + pc.cx * CELL + (CELL >> 1), py = oy + pc.cy * CELL + (CELL >> 1);
    g.fillStyle = '#e8e8f0';
    g.fillRect(px - 1, py - 1, 3, 3);
    this.atlasMap = { x: ox, y: oy, size, cell: CELL, visited,
      landmarks: marks, player: { x: px, y: py } };
  }

  // ---- HORDE WARNING (2026-09-17 review addendum; SCOPE-LIMITED same day) -----
  // The peripheral treatment the HERALD's banner (peripheral: true) renders
  // through — the repeated mid-combat warning the no-play-area-pixels rule
  // protects. Set-piece banners do NOT route here (owner correction).
  // warning never touches the play area (the region the player dodges through).
  // Channels, all outside the play area:
  //   (a) HUD STATE — an urgent strip in the top HUD band: dark plate, blood
  //       rules, gold text, the word HORDE. Sits between the left bar column
  //       and the right clock column (STRIP_SIDE keeps it clear of both).
  //   (b) EDGE CUE — a pulsing blood band along each screen edge the horde
  //       enters from (banner.edges, computed at spawn from the spawn angle).
  //       The SIDE carries "from where"; the pulse rate (2 Hz) is "how soon".
  //   (c) AUDIO — the BOSS_YELL sting main.js fires at every banner set.
  // Timing is main.js's (C.HUD.WARNING: ttl ends CLEAR_MARGIN before the
  // fastest spawn's estimated contact). Alpha eases OUT over the last 0.4s and
  // slams in at full — a warning, not a curtain. `this.bossBanner` carries the
  // painted geometry (peripheral: true) as the test seam.
  drawHordeWarning(g, state, b) {
    const WN = C.HUD.WARNING;
    const W = C.VIEW_W, H = C.VIEW_H;
    const alpha = Math.max(0, Math.min(1, b.ttl / 0.4));
    const age = (b.dur || WN.TTL_MAX) - b.ttl;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * age / WN.PULSE_S));
    // (a) the HUD-band strip: "HORDE: <name(s)>" (the announce toast already
    // carries the verb + flavor; the strip is the urgent state, not a lecture).
    const names = (b.names && b.names.length) ? b.names : (b.title ? [b.title] : []);
    const maxTextW = W - 2 * WN.STRIP_SIDE - 2 * 4;
    const widthOf = (txt, px) => {
      g.font = 'bold ' + px + 'px monospace';
      if (typeof g.measureText === 'function') {
        const m = g.measureText(txt);
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0) return m.width;
      }
      return txt.length * px * 0.6021;   // the stub-ctx fallback (feed's rule)
    };
    let txt = names.length ? 'HORDE: ' + names.join(' + ') : 'HORDE INCOMING';
    let px = WN.STRIP_PX_MAX;
    while (px > WN.STRIP_PX_MIN && widthOf(txt, px) > maxTextW) px--;
    while (txt.length > 1 && widthOf(txt, px) > maxTextW) txt = txt.slice(0, -1);
    const textW = widthOf(txt, px);
    const plateW = Math.min(Math.round(textW + 2 * 4), W - 2 * WN.STRIP_SIDE);
    const plateX = Math.round(W / 2 - plateW / 2);
    const plateY = WN.STRIP_Y, plateH = WN.STRIP_H;
    g.globalAlpha = alpha;
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(plateX, plateY, plateW, plateH);
    g.fillStyle = '#7a1028';                       // the blood rules, same language as the plate
    g.fillRect(plateX, plateY, plateW, 1);
    g.fillRect(plateX, plateY + plateH - 1, plateW, 1);
    g.font = 'bold ' + px + 'px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd75e';
    g.fillText(txt, W / 2, plateY + Math.round(plateH / 2));
    g.textAlign = 'left';
    g.textBaseline = 'top';
    // (b) the edge cue: blood band + a 1px hot rule at its inner boundary,
    // on every edge the horde enters from. Screen edges are not play area.
    const E = WN.EDGE_PX;
    g.globalAlpha = alpha * pulse;
    for (const edge of (b.edges || [])) {
      g.fillStyle = '#7a1028';
      if (edge === 'top') g.fillRect(0, 0, W, E);
      else if (edge === 'bottom') g.fillRect(0, H - E, W, E);
      else if (edge === 'left') g.fillRect(0, 0, E, H);
      else if (edge === 'right') g.fillRect(W - E, 0, E, H);
      g.fillStyle = '#ff2f5e';
      if (edge === 'top') g.fillRect(0, E, W, 1);
      else if (edge === 'bottom') g.fillRect(0, H - E - 1, W, 1);
      else if (edge === 'left') g.fillRect(E, 0, 1, H);
      else if (edge === 'right') g.fillRect(W - E - 1, 0, 1, H);
    }
    g.globalAlpha = 1;
    this.bossBanner = {
      name: b.title, sub: b.sub, peripheral: true, alpha,
      strip: { x: plateX, y: plateY, w: plateW, h: plateH, text: txt, px },
      edges: (b.edges || []).slice(),
    };
  }

  // ---- WAVE-14 boss-arrival overlay ------------------------------------------
  // state.bossBanner = { names:[...], verb, title, sub, ttl } (main.js sets it
  // at boss spawn / herald / finale start). OWNER CORRECTION 2026-09-17: the
  // no-play-area-pixels rule is SCOPE-LIMITED to the repeated mid-combat
  // HORDE WARNING (the herald — the banner main.js stamps `peripheral: true`
  // on). Set-piece announcements (boss cast, elite, finale, and the HELD
  // token / top-tier banners) keep their prominent cinematic centre plate.
  // `this.bossBanner` is the test seam (the exact values painted this frame;
  // null when no banner is live).
  drawBossBanner(g, state) {
    const b = state.bossBanner;
    if (!b || !(b.ttl > 0)) { this.bossBanner = null; return; }
    if (b.peripheral) return this.drawHordeWarning(g, state, b);
    const DUR = 2.5;
    const aIn = Math.min(1, (DUR - b.ttl) / 0.35);
    const aOut = Math.min(1, b.ttl / 0.6);
    const alpha = Math.max(0, Math.min(aIn, aOut));
    const W = C.VIEW_W, H = C.VIEW_H;
    const bandH = 34;
    g.globalAlpha = alpha;
    // Letterbox bands + a thin blood-red rule at each edge.
    g.fillStyle = '#08080f';
    g.fillRect(0, 0, W, bandH);
    g.fillRect(0, H - bandH, W, bandH);
    g.fillStyle = '#7a1028';
    g.fillRect(0, bandH, W, 1);
    g.fillRect(0, H - bandH - 1, W, 1);
    // Name + title + sub, centered.
    // WAVE-24 (#2): the title/sub sit at SCREEN CENTER — over live gameplay,
    // not on the letterbox bands — so their contrast used to depend on
    // whatever was behind them. A dark plate (plus a blood-red rule top and
    // bottom) makes the moment legible on every scene.
    //
    // TWO-LINE BANNER (owner-approved: "huge stylized name and big title
    // underneath"). Line 1..N is the NAME(S) — one boss per line, the largest
    // type on screen for this beat. The title line ('APPROACH' / 'APPROACHES')
    // sits under them, big but strictly smaller. The flavor sub keeps its old
    // job as the small print.
    //
    // FITTING (the actual fix for the clipped two-boss banner): every line is
    // sized from the REAL measureText of the exact font string it is painted
    // in. The old code painted one 49-char run-on line with no maxWidth and
    // sized its plate from a 0.6em estimate — wave 3 measured 649px in a 480px
    // view behind a 637px plate, bleeding off BOTH edges. Now each line takes
    // the largest integer px whose measured width fits BANNER_MAX_W, the plate
    // is built from the measured widest line, and the plate is clamped
    // BANNER_EDGE_MARGIN off each view edge — never edge to edge.
    const HUD = C.HUD;
    const padX = HUD.BANNER_PLATE_PAD_X, padY = HUD.BANNER_PLATE_PAD_Y;
    const gap = HUD.BANNER_LINE_GAP, edge = HUD.BANNER_EDGE_MARGIN;
    const maxTextW = W - 2 * edge - 2 * padX;
    // Measured monospace advance (px per em) — the FALLBACK only, for the stub
    // ctx in the headless tests, where measureText has no metrics to give.
    const ADV_FALLBACK = 0.6021;
    const widthOf = (txt, px, bold) => {
      g.font = (bold ? 'bold ' : '') + px + 'px monospace';   // measure in the font we paint in
      if (typeof g.measureText === 'function') {
        const m = g.measureText(txt);
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0) return m.width;
      }
      return txt.length * px * ADV_FALLBACK;
    };
    // Largest integer px in [lo,hi] whose measured width still fits the box.
    const fitPx = (txt, lo, hi, bold) => {
      let px = hi;
      while (px > lo && widthOf(txt, px, bold) > maxTextW) px--;
      return px;
    };

    // Line 1..N: the boss names (one per line; see CONFIG for why not shared).
    const names = (b.names && b.names.length) ? b.names.slice() : (b.title ? [b.title] : []);
    const verb = b.verb || '';
    // N6 (audit 2026-09-16): the fit — every px size and the plate box — is a
    // PURE function of the banner's strings (plus view constants), but was
    // recomputed through the measureText ladder every frame of the banner's
    // life (0.15 ms/frame, 15.8 measureText calls/frame in real Chrome,
    // tools/verify_nits_n6.mjs). Cached per strings; a different banner
    // (new boss, new flavor) simply misses and refits. The paint itself is
    // untouched — same lines, same plate, same fonts.
    const fitKey = JSON.stringify([names, verb, b.sub || '']);
    let fit = (this._bannerFit && this._bannerFit.key === fitKey) ? this._bannerFit : null;
    if (!fit) {
      const longestName = names.reduce((a, s) => (s.length > a.length ? s : a), '');
      const namePx = fitPx(longestName, HUD.BANNER_NAME_MIN_PX, HUD.BANNER_NAME_MAX_PX, true);
      // Title line: a fixed fraction of the name size, still fitted + clamped.
      const verbMax = Math.max(HUD.BANNER_VERB_MIN_PX,
        Math.min(HUD.BANNER_VERB_MAX_PX, Math.round(namePx * HUD.BANNER_VERB_RATIO)));
      const verbPx = verb ? fitPx(verb, HUD.BANNER_VERB_MIN_PX, verbMax, true) : 0;
      // Flavor sub-line: the old 11px small print (never below 10 — the panel's
      // floor), fitted so a two-boss flavor pair cannot overrun either.
      const subPx = b.sub ? fitPx(b.sub, 10, HUD.BANNER_SUB_PX, false) : 0;
      const lines = [];
      for (const s of names) lines.push({ txt: s, px: namePx, bold: true, ink: '#ffd75e', shade: '#3a2408' });
      if (verb) lines.push({ txt: verb, px: verbPx, bold: true, ink: '#ffd75e', shade: '#3a2408' });
      if (b.sub) lines.push({ txt: b.sub, px: subPx, bold: false, ink: '#e4e4ee', shade: null });
      for (const l of lines) l.h = Math.round(l.px * 1.16) + gap;   // line box
      // The plate is built from the MEASURED widest line, then clamped inside
      // the view edge — the two-boss case can no longer be underestimated.
      const widest = lines.reduce((m, l) => Math.max(m, widthOf(l.txt, l.px, l.bold)), 0);
      const plateW = Math.min(Math.round(widest + 2 * padX), W - 2 * edge);
      const bodyH = lines.reduce((a, l) => a + l.h, 0) - gap;
      const plateH = Math.round(bodyH + 2 * padY);
      fit = { key: fitKey, namePx, verbPx, subPx, lines, plateW, plateH };
      this._bannerFit = fit;
      this.bossBannerFits++;
    }
    const lines = fit.lines;
    if (!lines.length) {
      g.textAlign = 'left'; g.textBaseline = 'top'; g.globalAlpha = 1;
      this.bossBanner = { name: b.title, sub: b.sub, letterbox: true, alpha };
      return;
    }
    const plateW = fit.plateW;
    const plateX = Math.round(W / 2 - plateW / 2);
    const plateH = fit.plateH;
    const plateY = Math.round(H / 2 - plateH / 2);
    g.fillStyle = HUD.PLATE_SOLID;
    g.fillRect(plateX, plateY, plateW, plateH);
    g.fillStyle = '#7a1028';
    g.fillRect(plateX, plateY, plateW, 1);
    g.fillRect(plateX, plateY + plateH - 1, plateW, 1);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let cy = plateY + padY;
    for (const l of lines) {
      const midY = Math.round(cy + l.h / 2);
      if (l.shade) {                       // 2px offset shade = the stylized cut
        g.font = 'bold ' + l.px + 'px monospace';
        g.fillStyle = l.shade;
        g.fillText(l.txt, W / 2 + 2, midY + 2);
      }
      g.font = (l.bold ? 'bold ' : '') + l.px + 'px monospace';
      g.fillStyle = l.ink;
      g.fillText(l.txt, W / 2, midY);
      cy += l.h;
    }
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.globalAlpha = 1;
    this.bossBanner = { name: b.title, sub: b.sub, letterbox: true, alpha };
  }

  // ---- WAVE-27: the DOCTRINE canvas readout is REMOVED ------------------------
  // WAVE-24 (#4) painted a live "FOCUS <x>" / "STANCE <x> · <TAG> · <ACT>" block
  // here because the levers were otherwise invisible. The owner ruled it
  // redundant: the overlay buttons' badges carry the same state (and the
  // stance CYCLE toast names the tag + the multipliers that actually differ).
  // The canvas is the play field again — no doctrine paint, no chrome seam
  // fields, and no DOM-badge bridge. The published source of truth stays
  // state.focus / state.stance / state.stanceAct (main.js syncChrome); the
  // badge writer (main.js updateTouchHud) reads exactly those.

  // ---- WAVE-26 EARNED MOMENT flourish ---------------------------------------
  // Fires ONLY on a weapon EVOLUTION or a BOSS KILL (main.js
  // triggerEarnedMoment) — the two moments Sk408's game-feel law reserves
  // slow-mo and screen juice for. Pure integer-pixel drawing: fillRect only,
  // no filters, no gradients, no blur, nothing that softens the art.
  //
  //   t=0  hard pixel vignette pulled in from every edge + a 1px chromatic
  //        fringe (red top / blue bottom) + a white cross core flash
  //   t->1 a 12-spoke crackle burst flies outward, the vignette and fringe
  //        recede, and everything fades to nothing
  //
  // `this.moment` is the honest test seam: the exact values painted this
  // frame, or null when nothing was live.
  drawMoment(g, state) {
    const m = state.moment;
    this.moment = null;
    if (!m || !(m.ttl > 0)) return;
    const W = C.VIEW_W, Hh = C.VIEW_H;
    const t = Math.max(0, Math.min(1, m.age / m.ttl));
    const hot = m.kind === 'evolution' ? '#7ad0ff'
      : m.kind === 'finale' ? '#ffd75e' : '#ff8848';
    const fade = 1 - t;
    // Same world -> device projection the world layer uses (the canonical
    // state.zoomScale; see the zoom block above), so the flare lands exactly
    // on the evolved hero / dead boss at any zoom.
    const zs = state.zoomScale;
    const Z = (typeof zs === 'number' && Number.isFinite(zs) && zs >= 1) ? Math.round(zs) : 1;
    const cam = state.cam || { x: 0, y: 0 };
    const cx = Math.round(W / 2 + (m.x - cam.x - W / 2) * Z);
    const cy = Math.round(Hh / 2 + (m.y - cam.y - Hh / 2) * Z);

    // 1. VIGNETTE PULSE — 2px steps from the rim inward, receding with t.
    const band = Math.round(fade * 22) & ~1;
    if (band > 0) {
      g.globalAlpha = 0.5 * fade;
      g.fillStyle = '#05050a';
      for (let i = 0; i < band; i += 2) {
        g.fillRect(i, 0, 2, Hh);
        g.fillRect(W - 2 - i, 0, 2, Hh);
        g.fillRect(0, i, W, 2);
        g.fillRect(0, Hh - 2 - i, W, 2);
      }
    }
    // 2. CHROMATIC FRINGE — one hard red row and one hard blue row on the
    //    frame edge: a pulse, not a blur.
    g.globalAlpha = 0.55 * fade;
    g.fillStyle = '#ff2f5e';
    g.fillRect(0, 0, W, 1);
    g.fillStyle = '#3c6bff';
    g.fillRect(0, Hh - 1, W, 1);

    // 3. CRACKLE BURST — 12 spokes of 3x3 blocks flying outward, each with a
    //    trailing pixel, alternating white / hot tint.
    const r = Math.round(t * 92);
    g.globalAlpha = fade;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sx = Math.round(cx + Math.cos(a) * r);
      const sy = Math.round(cy + Math.sin(a) * r);
      g.fillStyle = (i % 2 === 0) ? '#ffffff' : hot;
      g.fillRect(sx - 1, sy - 1, 3, 3);
      const tr = Math.max(0, r - 8);
      g.fillRect(Math.round(cx + Math.cos(a) * tr), Math.round(cy + Math.sin(a) * tr), 2, 2);
    }

    // 4. CORE FLASH — a white cross that collapses as the burst expands.
    const cs = Math.max(2, Math.round(fade * 14));
    g.globalAlpha = Math.max(0, 1 - t * 1.5);
    g.fillStyle = '#ffffff';
    g.fillRect(cx - cs, cy - 1, cs * 2, 3);
    g.fillRect(cx - 1, cy - cs, 3, cs * 2);
    g.globalAlpha = 1;

    this.moment = { kind: m.kind, t, hot, cx, cy, spokeR: r, band };
  }

  // ---- WAVE-12 HUD chrome (fillRect pixel grids only) -------------------------
  // The text #hud div is now opt-in (settings toggle, default off) — this is
  // the always-on visual readout. `this.hudChrome` is the honest test seam:
  // the exact values the bars/icons painted this frame (smoke asserts on it).
  drawHudChrome(g, state) {
    const p = state.player;
    if (!p || !p.stats) { this.hudChrome = null; return; }
    const t = state.time || 0;
    const chrome = { hpFrac: 0, hpFlashFrac: 0, manaFrac: 0, weaponIcons: [], itemIcons: [], weather: null, challenge: null };

    // --- graphic HP + mana bars, top-left (below the boss-bar zone) ---
    // Damage flash: when hp DROPS, the lost segment stays white for ~0.45s
    // (a heal never flashes). Heals just move the fill up silently.
    const maxHp = p.stats.maxHp;
    const hp = Math.max(0, Math.min(p.hp, maxHp));
    if (this._hpPrev === undefined || hp >= this._hpPrev) this._hpPrev = hp;
    if (hp < this._hpPrev - 0.01) {
      this._hpFlashFrom = Math.min(1, this._hpPrev / maxHp);
      this._hpFlashUntil = t + 0.45;
    }
    this._hpPrev = hp;
    const hpFrac = Math.max(0, Math.min(1, hp / maxHp));
    const flashFrac = (this._hpFlashUntil > t && this._hpFlashFrom > hpFrac)
      ? this._hpFlashFrom : 0;
    const manaFrac = Math.max(0, Math.min(1, p.mana / p.stats.maxMana));
    chrome.hpFrac = hpFrac;
    chrome.hpFlashFrac = flashFrac;
    chrome.manaFrac = manaFrac;

    // WAVE-24 (#2): every canvas label goes through label() — a dark plate
    // behind the text so its contrast NEVER depends on the terrain that
    // happens to be under the HUD, at the sizes in CONFIG.HUD (the vision
    // pass: bar labels "tiny", the LV badge "washed out"). Returns the
    // painted plate width so callers can stack a second element beside it.
    const H = C.HUD;
    const label = (txt, x, y, col, size) => {
      g.font = 'bold ' + size + 'px monospace';
      g.textBaseline = 'top';
      const w = txt.length * Math.round(size * 0.62) + 4;
      g.fillStyle = H.PLATE;
      g.fillRect(x - 2, y - 2, w, size + 5);
      g.fillStyle = col;
      g.fillText(txt, x, y);
      return w;
    };
    const drawBar = (x, y, w, h, frac, flash, fillCol) => {
      // WAVE-24 (#1/#2): steel FRAME + dark TROUGH. The old pure-black border
      // vanished on the dark themes and a mid-grey track read as a FILLED bar
      // at 0%; the frame makes the container visible and the dark trough makes
      // "empty" unmistakable, on every theme.
      g.fillStyle = H.FRAME;
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      g.fillStyle = '#000000';                       // 1px pixel border (seam)
      g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = H.TROUGH;                        // empty track
      g.fillRect(x, y, w, h);
      // Ticks run the FULL track (WAVE-23 empty-state fix, now legible on the
      // dark trough): over the fill they read as chunky VS-style segments,
      // over the empty trough as progress marks.
      g.fillStyle = H.TICK;
      for (let sx = x + 6; sx < x + w; sx += 8) g.fillRect(sx, y, 1, h);
      const fw = Math.round(w * frac);
      g.fillStyle = fillCol;                         // the fill
      g.fillRect(x, y, fw, h);
      g.fillStyle = 'rgba(255,255,255,0.30)';        // top glint row
      g.fillRect(x, y, fw, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';              // segment marks on the fill
      for (let sx = x + 5; sx < x + fw; sx += 6) g.fillRect(sx, y + 1, 1, h - 1);
      if (flash > frac) {                            // damage-flash segment
        const fx = x + fw;
        const fwid = Math.round(w * flash) - fw;
        g.fillStyle = '#ffffff';
        g.fillRect(fx, y, fwid, h);
      }
    };
    // WAVE-23 (#4/#6) gave every bar a text label to its left (the vision pass
    // called the unlabeled bars "placeholders"); WAVE-24 (#2) puts each label
    // on a plate and lifts 8px -> 9px bold with a brighter tint.
    label('HP', 6, 15, H.HP, H.LABEL_PX);
    label('MP', 6, 25, H.MP, H.LABEL_PX);
    drawBar(22, 16, 110, 5, hpFrac, flashFrac, '#ff5566');
    drawBar(22, 26, 110, 5, manaFrac, 0, '#4a8cff');

    // 0.98 feedback (defect 3): a 5px bar carries no readable text, and the
    // current/max numbers existed ONLY in the opt-in text HUD (default OFF) —
    // so the always-on HUD showed a fill with nothing to read it against. The
    // values ride to the RIGHT of the bars (x=136, clear of the 132px bar end)
    // in the same dark-plate + bold-monospace language as every other label.
    // The rows are 10px apart — too tight for two 9px plates — so ONE plate
    // backs both rows. `valRight` is the run clock's column: if a value would
    // reach it the numbers are simply NOT painted (an unlabelled bar beats an
    // overlap, at any view width).
    const valPx = H.LABEL_PX;
    // Measured when the context can (the browser), the 9px-monospace estimate
    // otherwise — same fallback rule as the event feed above, so the headless
    // geometry stays assertable.
    const valTextW = (s) => {
      if (typeof g.measureText === 'function') {
        const m = g.measureText(s);
        if (m && isFinite(m.width) && m.width > 0) return m.width;
      }
      return s.length * Math.round(valPx * 0.62);
    };
    const valX = 136;
    const hpTxt = Math.max(0, Math.floor(hp)) + '/' + Math.ceil(maxHp);
    const mpTxt = Math.max(0, Math.floor(p.mana)) + '/' + Math.ceil(p.stats.maxMana);
    g.font = 'bold ' + valPx + 'px monospace';
    g.textBaseline = 'top';
    const valBox = Math.ceil(Math.max(valTextW(hpTxt), valTextW(mpTxt))) + 4;
    const valRight = C.VIEW_W - 24 - 44;          // the clock plate starts at ~417
    if (valX + valBox <= valRight) {
      g.fillStyle = H.PLATE;                      // one plate behind both rows
      g.fillRect(valX - 2, 11, valBox, 22);
      g.fillStyle = H.HP;
      g.fillText(hpTxt, valX, 13);
      g.fillStyle = H.MP;
      g.fillText(mpTxt, valX, 23);
      chrome.hpText = hpTxt;
      chrome.mpText = mpTxt;
    }

    // --- WAVE-18 (#2) PLAYER XP BAR (galaxy.click: "there's no xp bar
    // (?!?!?!?)"). The genre's core readout, previously drawn nowhere: gold,
    // LONGER and BOLDER (6px fill), with the level number riding its right
    // end. WAVE-23 (#1): the EMPTY state must read as a bar at 0% too —
    // visible frame + track, tick marks across the FULL width (not just the
    // fill), an XP label, and a gold goal-tick at the far end. WAVE-24 (#1):
    // VERIFIED against the wave-23 primitives and tightened — the frame is
    // now steel (not black-on-black), the trough dark (an empty XP bar used
    // to read as a full grey one), the ticks light-on-dark instead of
    // black-on-grey, and the label rides a plate. Fill behaviour unchanged.
    // chrome.xpFrac is the EXACT unclamped fraction.
    const xpFrac = p.xpNext > 0 ? Math.max(0, Math.min(1, p.xp / p.xpNext)) : 0;
    chrome.xpFrac = p.xpNext > 0 ? p.xp / p.xpNext : 0;
    chrome.level = p.level || 1;
    const xb = 22, yb = 37, wb = 134, hb = 6;
    label('XP', 6, yb - 1, H.XP, H.LABEL_PX);
    g.fillStyle = H.FRAME;                         // steel container frame
    g.fillRect(xb - 2, yb - 2, wb + 4, hb + 4);
    g.fillStyle = '#000000';                       // 1px pixel border
    g.fillRect(xb - 1, yb - 1, wb + 2, hb + 2);
    g.fillStyle = H.TROUGH;                        // dark empty track
    g.fillRect(xb, yb, wb, hb);
    g.fillStyle = H.TICK;                          // ticks run the FULL track
    for (let sx = xb + 6; sx < xb + wb; sx += 8) g.fillRect(sx, yb + 1, 1, hb - 1);
    g.fillStyle = H.TICK_MAJOR;                    // 25 / 50 / 75% majors
    for (let q = 1; q <= 3; q++) g.fillRect(xb + Math.round(wb * q / 4), yb, 1, hb);
    const xfw = Math.round(wb * xpFrac);
    g.fillStyle = '#ffd75e';                       // the gold fill
    g.fillRect(xb, yb, xfw, hb);
    g.fillStyle = 'rgba(255,255,255,0.35)';        // top glint row
    g.fillRect(xb, yb, xfw, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)';              // chunky segments on the fill
    for (let sx = xb + 5; sx < xb + xfw; sx += 6) g.fillRect(sx, yb + 1, 1, hb - 1);
    g.fillStyle = '#ffd75e';                       // gold goal tick at the end
    g.fillRect(xb + wb - 1, yb, 1, hb);
    // WAVE-23 (#4) added the LV badge; WAVE-24 (#2) makes it a BADGE: 9 -> 11px
    // bold on a gold-bordered dark plate (the vision pass: "washed out, reads
    // like an unpolished placeholder"), vertically centered on the bar.
    const lvTxt = 'LV ' + (p.level || 1);
    const lvPx = H.LV_PX;
    const lvW = lvTxt.length * Math.round(lvPx * 0.62) + 6;
    const lvH = lvPx + 4;
    const lvX = xb + wb + 4, lvY = yb + Math.round(hb / 2) - Math.round(lvH / 2);
    g.fillStyle = '#ffd75e';                       // gold badge border
    g.fillRect(lvX, lvY, lvW, lvH);
    g.fillStyle = 'rgba(10,9,6,0.90)';             // dark inset plate
    g.fillRect(lvX + 1, lvY + 1, lvW - 2, lvH - 2);
    g.font = 'bold ' + lvPx + 'px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#fff3c4';
    g.fillText(lvTxt, lvX + 3, lvY + 2);
    // 0.98 feedback (defect 3): the XP row keeps its LV badge, and the
    // progress numbers join it to the badge's right (the badge owns the bar's
    // right end, so the value cannot ride the bar itself). Same plate + bold
    // language as the HP/MP values, same guard: dropped rather than allowed to
    // reach the clock column, and never painted at the level cap (xpNext = 0 —
    // "0/0" would be noise).
    if (p.xpNext > 0) {
      const xpTxt = Math.max(0, Math.floor(p.xp)) + '/' + Math.floor(p.xpNext);
      const xpValX = lvX + lvW + 4;
      if (xpValX + xpTxt.length * Math.round(H.LABEL_PX * 0.62) + 4 <= valRight) {
        label(xpTxt, xpValX, lvY + 2, H.XP, H.LABEL_PX);
        chrome.xpText = xpTxt;
      }
    }

    // --- E1 RUN PURSE readout (owner directive 2026-09-14: "have a visible ----
    // on screen display"). The live IN-RUN wallet (state.runPurse — syncChrome
    // publishes profile.runPurse every frame; the renderer never touches the
    // profile). Same badge language as the LV plate: gold border, dark inset,
    // 11px bold. H1 NO-REFLOW CONTRACT: the digit column is RESERVED — the
    // value is right-aligned in a fixed 5-char field (fmtGold: compact k/M
    // past 99999, still exactly 5 chars), so a 1-digit purse and a 750k purse
    // paint BYTE-IDENTICAL geometry. A counter whose width grows as it counts
    // is the control-pad reflow bug H1 just fixed; the canvas HUD obeys the
    // same rule.
    const purseVal = state.runPurse | 0;
    const goldTxt = 'GOLD ' + fmtGold(purseVal);
    const goldPx = H.CLOCK_PX;
    const goldW = goldTxt.length * Math.round(goldPx * 0.62) + 6;
    const goldH = goldPx + 4;
    const goldX = 6, goldY = 52;           // left column, under the XP row, clear of the feed (y 84+)
    g.fillStyle = '#ffd75e';                       // gold badge border
    g.fillRect(goldX, goldY, goldW, goldH);
    g.fillStyle = 'rgba(10,9,6,0.90)';             // dark inset plate
    g.fillRect(goldX + 1, goldY + 1, goldW - 2, goldH - 2);
    g.font = 'bold ' + goldPx + 'px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#fff3c4';
    g.fillText(goldTxt, goldX + 3, goldY + 2);
    chrome.purse = { x: goldX, y: goldY, w: goldW, h: goldH, px: goldPx,
      value: purseVal, text: goldTxt, digitW: 5 * Math.round(goldPx * 0.62) };

    // --- RUN CLOCK (SURVIVAL-GAP wave) -------------------------------------
    // The 30:00 limit is the run's core structure, but the always-on CANVAS HUD
    // never showed it: only the opt-in text HUD, the per-minute toast and the
    // end cards did. This is the readout a player must always have — how far
    // into the run they are. Pixel-art, in the existing HUD language: the clock
    // as a bold label on the same dark plate every other label uses, plus a
    // thin limit bar with the same steel-frame / dark-trough chrome as the XP
    // bar and a red limit tick at the far end. It turns warm once the
    // FINAL_CALL_AT callout lands. Frame-rate independence is by construction:
    // it reads state.time (sim seconds, dt-driven) through the same runClock()
    // the win condition uses — no frame counters, nothing to stack.
    const clockTxt = runClock(t);
    const clockPx = H.CLOCK_PX;
    const cw = clockTxt.length * Math.round(clockPx * 0.62) + 4;
    const cx = C.VIEW_W - 24 + 2 - cw;
    const finalCall = t >= C.RUN.FINAL_CALL_AT;
    label(clockTxt, cx, 13, finalCall ? '#ff9c6a' : '#cfe8ff', clockPx);
    const cbX = cx - 2, cbY = 13 + clockPx + 4, cbW = cw, cbH = 4;
    const limitFrac = Math.max(0, Math.min(1, t / C.RUN.LIMIT));
    g.fillStyle = H.FRAME;                         // steel container frame
    g.fillRect(cbX - 2, cbY - 2, cbW + 4, cbH + 4);
    g.fillStyle = '#000000';                       // 1px pixel border
    g.fillRect(cbX - 1, cbY - 1, cbW + 2, cbH + 2);
    g.fillStyle = H.TROUGH;                        // dark empty track
    g.fillRect(cbX, cbY, cbW, cbH);
    g.fillStyle = '#4a8cff';                       // the run-progress fill
    g.fillRect(cbX, cbY, Math.round(cbW * limitFrac), cbH);
    g.fillStyle = 'rgba(255,255,255,0.30)';        // top glint row
    g.fillRect(cbX, cbY, Math.round(cbW * limitFrac), 1);
    g.fillStyle = '#ff2f5e';                       // the limit tick (30:00)
    g.fillRect(cbX + cbW - 1, cbY, 1, cbH);
    chrome.clock = { text: clockTxt, frac: limitFrac, finalCall };

    // --- G11 CHALLENGE MODE BADGE ------------------------------------------
    // Only when a NON-standard mode is live (a STANDARD run renders
    // byte-identically to before — the badge is simply not drawn). Same badge
    // language as the LV plate: gold border, dark inset, warm bold text, set
    // directly under the clock's limit bar so the right column reads
    // clock -> mode.
    if (state.challenge && state.challenge !== 'STANDARD') {
      const name = (CHALLENGE_BY_ID[state.challenge] || CHALLENGE_BY_ID.STANDARD).name;
      const bPx = 9;
      const bW = name.length * Math.round(bPx * 0.62) + 6;
      const bH = bPx + 4;
      const bX = C.VIEW_W - 24 + 2 - bW;
      const bY = cbY + cbH + 8;
      g.fillStyle = '#ffd75e';                       // gold badge border
      g.fillRect(bX, bY, bW, bH);
      g.fillStyle = 'rgba(10,9,6,0.90)';             // dark inset plate
      g.fillRect(bX + 1, bY + 1, bW - 2, bH - 2);
      g.font = 'bold ' + bPx + 'px monospace';
      g.textBaseline = 'top';
      g.fillStyle = '#ffe9a8';
      g.fillText(name, bX + 3, bY + 2);
      chrome.challenge = { id: state.challenge, name };
    }

    // --- WAVE-27: no doctrine text on the canvas ----------------------------
    // The FOCUS / STANCE readout that used to sit here is gone (owner ruling:
    // the overlay buttons' badges already carry that state, and the stance
    // cycle toast names its meaning). The event feed below keeps its own
    // placement; nothing is shifted to compensate.

    // --- WAVE-14 event feed: last 3 toasts UNDER the bars (now under the XP
    // bar too), newest lowest. The toast() stream in main.js is the ONE feed
    // — equipment finds (tinted by rarity), arch effects, potions, weapon
    // level-ups, synergies, flash drops, wave/theme lines all land here.
    // Lines fade out over their final second (alpha = ttl clamped to 1).
    // WAVE-24 (#2): text stays 9px; the plate is darker so the lines hold up
    // over bright themes. (WAVE-27: the doctrine block that used to sit below
    // these lines is gone; the feed keeps its own placement.)
    // 0.98 feedback (defect 1): a toast used to paint as ONE unwrapped line —
    // every synergy announce measured 513..627px against a 480px view, so all
    // seven ran off the right edge. Lines now WRAP to the view (at word
    // boundaries; a word wider than the box is hard-split, so nothing can ever
    // paint past the edge), the plate is sized from the widest MEASURED line,
    // and a short message still paints exactly one line (the feed's pitch and
    // geometry are unchanged for it).
    g.font = H.FEED_PX + 'px monospace';
    g.textBaseline = 'top';
    chrome.feed = [];
    const feed = (state.toasts || []).slice(-3);
    const FEED_LINE_H = 10;                 // the feed's line pitch (unchanged)
    const FEED_MAX_W = C.VIEW_W - 14;       // plate starts at x=5; 7px of air right
    // Real font metrics when the context has them (the browser, and the
    // measureText probes); the ~6px/char 9px-monospace advance the feed has
    // always assumed otherwise (the headless stubs carry no measureText, so
    // the painted geometry stays assertable in tests).
    const feedTextW = (s) => {
      if (typeof g.measureText === 'function') {
        const m = g.measureText(s);
        if (m && isFinite(m.width) && m.width > 0) return m.width;
      }
      return s.length * 6;
    };
    const wrapFeed = (msg) => {
      const out = [];
      let line = '';
      for (const word of String(msg).split(' ')) {
        const cand = line ? line + ' ' + word : word;
        if (feedTextW(cand) <= FEED_MAX_W) { line = cand; continue; }
        if (line) { out.push(line); line = ''; }
        let rest = word;
        while (feedTextW(rest) > FEED_MAX_W) {   // a word wider than the box
          let n = 1;
          while (n < rest.length && feedTextW(rest.slice(0, n + 1)) <= FEED_MAX_W) n++;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      if (line) out.push(line);
      return out.length ? out : [''];
    };
    let fy = 86;
    for (const ft of feed) {
      const alpha = Math.max(0, Math.min(1, ft.ttl || 0));
      if (alpha <= 0) continue;
      const lines = wrapFeed(ft.msg);
      let widest = 0;
      for (const ln of lines) widest = Math.max(widest, feedTextW(ln));
      const fw = Math.ceil(widest) + 4;
      g.globalAlpha = alpha;
      g.fillStyle = H.PLATE;              // readability plate, sized to the lines
      g.fillRect(5, fy - 2, fw, lines.length * FEED_LINE_H + 1);
      g.fillStyle = ft.tint || '#e4e4ee';
      for (let li = 0; li < lines.length; li++) g.fillText(lines[li], 7, fy + li * FEED_LINE_H);
      g.globalAlpha = 1;
      chrome.feed.push({ msg: ft.msg, tint: ft.tint || null, alpha, lines: lines.slice() });
      fy += lines.length * FEED_LINE_H;
    }

    // --- equipment icon row (above the weapon row, same bottom-left corner).
    // 4x4 rarity-tinted gem per equipped rare item.
    let ix = 6;
    const iy = C.VIEW_H - 44;
    for (const it of state.items) {
      const col = RARITY_COLORS[it.rarity] || RARITY_COLORS.COMMON;
      for (let ry = 0; ry < ITEM_ICON_GRID.length; ry++) {
        for (let rx = 0; rx < ITEM_ICON_GRID[ry].length; rx++) {
          if (ITEM_ICON_GRID[ry][rx]) {
            g.fillStyle = col;
            g.fillRect(ix + rx, iy + ry, 1, 1);
          }
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';               // 1px shadow border
      g.fillRect(ix - 1, iy - 1, 6, 1); g.fillRect(ix - 1, iy + 4, 6, 1);
      g.fillRect(ix - 1, iy - 1, 1, 6); g.fillRect(ix + 4, iy - 1, 1, 6);
      chrome.itemIcons.push({ rarity: it.rarity });
      ix += 8;
    }

    // --- weapon icon row, bottom-left (above the touch pads on mobile).
    // 5x5 grid at 2x + a small lv number; evolved weapons get a gold border.
    const Z = 2;
    let wx = 6;
    const wy = C.VIEW_H - 30;
    g.font = '9px monospace';               // WAVE-23 (#4): 8 -> 9px
    g.textBaseline = 'top';
    for (const w of state.weapons) {
      const grid = WEAPON_ICONS[w.type] || WEAPON_ICONS.VOLLEY;
      g.fillStyle = w.evolution ? '#ffd75e' : '#2a2a36';   // slot frame
      g.fillRect(wx - 1, wy - 1, 5 * Z + 2, 5 * Z + 2);
      for (let ry = 0; ry < grid.length; ry++) {
        for (let rx = 0; rx < grid[ry].length; rx++) {
          const v = grid[ry][rx];
          if (v) {
            g.fillStyle = WEAPON_ICON_PALETTE[v];
            g.fillRect(wx + rx * Z, wy + ry * Z, Z, Z);
          }
        }
      }
      // WAVE-24 (#2): the level number rides its own dark plate — it used to
      // sit on bare terrain.
      g.fillStyle = H.PLATE;
      g.fillRect(wx - 1, wy + 5 * Z + 1, 10, 12);
      g.fillStyle = '#e8e8f0';                       // lv badge
      g.fillText(String(w.level || 1), wx + 1, wy + 5 * Z + 2);
      // WAVE-18 (#2): per-weapon progress — a thin gold underline inside the
      // slot frame bottom showing progress to the weapon's NEXT level
      // (weapons.js weaponXpNeeded), solid gold at the level cap.
      const maxed = (w.level || 1) >= WEAPON_MAX_LEVEL;
      const wxpFrac = maxed ? 1
        : Math.max(0, Math.min(1, (w.xp || 0) / weaponXpNeeded(w.level || 1)));
      const uw = 5 * Z;                              // 10px — the icon width
      g.fillStyle = '#1a1a22';                       // track inside the frame
      g.fillRect(wx, wy + 5 * Z, uw, 1);
      if (wxpFrac > 0) {
        g.fillStyle = '#ffd75e';
        g.fillRect(wx, wy + 5 * Z, Math.round(uw * wxpFrac), 1);
      }
      chrome.weaponIcons.push({ type: w.type, level: w.level || 1, evolved: !!w.evolution, xpFrac: wxpFrac, maxed });
      wx += 5 * Z + 10;
    }

    // --- weather glyph, top-right (below the boss/maw bar zone) ---
    const wi = weatherIcon(state.weather && state.weather.def);
    chrome.weather = wi ? state.weather.def.id : null;
    if (wi) {
      const gx = C.VIEW_W - 6 - 5 * Z, gy = 15;
      for (let ry = 0; ry < wi.grid.length; ry++) {
        for (let rx = 0; rx < wi.grid[ry].length; rx++) {
          const v = wi.grid[ry][rx];
          if (v) {
            g.fillStyle = wi.palette[v];
            g.fillRect(gx + rx * Z, gy + ry * Z, Z, Z);
          }
        }
      }
    }

    this.hudChrome = chrome;
  }

  // ---- G9 TROPHY SHOWCASE (the owner's full-screen pixel-art ask) -----------
  // Owner: "would be really cool to have the trophy gallery have the ability to
  // show full screen pixel art of the trophy." This paints ONE trophy emblem as
  // large as the view honestly allows, over the whole canvas, so the gallery
  // screen (main.js mode 'trophies') can push its cards to the bottom and leave
  // the emblem owning the middle of the screen.
  //
  // WHAT IT READS: state.trophyView = { art, locked, id } | null. `art` is
  // ALREADY the right grid — achievements.galleryModel hands back the real
  // emblem on an earned entry and the LOCKED silhouette on an unearned one — so
  // this method never decides what is earned and never keeps a second copy of
  // the art table, a name or a description.
  //
  // INTEGER SCALE ONLY: the size is the largest WHOLE number of canvas pixels
  // per art pixel that fits the budget box (~72% of the view width, ~62% of the
  // height, leaving room for the frame and the bottom card row). A fractional
  // scale would make one art pixel 4px and its neighbour 5px; at 32x32 that
  // reads as a broken sprite, so uniformity wins over filling the box exactly.
  // Same reason drawGrid takes an integer block size: this is the game's
  // pixel-art convention, with no smoothing anywhere in the path.
  //
  // SEAM: this.trophyShowcase = { scale, x, y, w, h, id, locked } is the exact
  // box painted this frame (null when no trophy is selected), so the gallery
  // test can measure the geometry instead of pixel-diffing the canvas.
  drawTrophyShowcase(g, state) {
    const tv = state && state.trophyView;
    if (!tv || !tv.art || !Array.isArray(tv.art.grid) || tv.art.grid.length === 0) {
      this.trophyShowcase = null;
      return;
    }
    const art = tv.art;
    const gw = art.w || art.grid[0].length;
    const gh = art.h || art.grid.length;

    // Full-screen backdrop first: the world and HUD are still painted under
    // this (the frame loop runs in every mode), so the showcase owns the view.
    g.fillStyle = 'rgba(3,3,8,0.94)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    const maxW = Math.floor(C.VIEW_W * 0.72);
    const maxH = Math.floor(C.VIEW_H * 0.62);
    let scale = Math.min(Math.floor(maxW / gw), Math.floor(maxH / gh));
    if (!(scale >= 1)) scale = 1;     // an oversized emblem still paints 1:1
    const w = gw * scale, h = gh * scale;
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);

    // Display case in the HUD's own chrome vocabulary (CONFIG.HUD): outer steel
    // FRAME, a 1px black seam, then a dark plate. Identical primitives to the
    // bars and plates in drawHudChrome, so the showcase reads as the same game.
    const PAD = 6;
    g.fillStyle = C.HUD.FRAME;
    g.fillRect(x - PAD - 2, y - PAD - 2, w + PAD * 2 + 4, h + PAD * 2 + 4);
    g.fillStyle = '#000000';
    g.fillRect(x - PAD - 1, y - PAD - 1, w + PAD * 2 + 2, h + PAD * 2 + 2);
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);

    this.drawGrid(g, art.grid, art.palette, x, y, scale);

    this.trophyShowcase = { scale, x, y, w, h, id: tv.id, locked: !!tv.locked };
  }

  // ---- G10 BESTIARY (main.js mode 'bestiary') --------------------------------
  // Mirrors drawTrophyShowcase EXACTLY (it is the screen that shipped and is
  // tested; no second screen idiom): full-view dark backdrop painted FIRST,
  // the case in the HUD's own chrome vocabulary (CONFIG.HUD.FRAME / PLATE),
  // the entry at the LARGEST INTEGER scale that fits, centered, one block per
  // painted pixel, no smoothing.
  //
  // WHAT IT READS: state.bestiaryView = { id, kind, ref, discovered } | null
  // (main.js refreshBestiaryView). The art is resolved off the REAL source
  // modules at draw time — bosses carry their own sprite grids (bosses.js),
  // enemies the LOOK contract's shape at sizeMult (resolveLook), tiers a
  // diamond in the tier's own tell colour — so the renderer never keeps a
  // second copy of the enemy table and main.js restates nothing.
  //
  // UNDISCOVERED = TANTALISING, NEVER BLANK: the SAME code-drawn shape the
  // enemy uses in play, painted in ONE flat dark colour (MASK) — the player
  // sees that something is there and how big it is, nothing more. A masked
  // boss paints its real sprite grid through an all-MASK palette, so the
  // silhouette is the sprite's own.
  //
  // SEAM: this.bestiary = { scale, x, y, w, h, id, discovered } — the exact
  // box painted this frame (null when nothing is selected), measurable off a
  // recording 2d context exactly like the gallery's.
  drawBestiary(g, state) {
    const bv = state && state.bestiaryView;
    if (!bv || !bv.id) { this.bestiary = null; return; }

    // Full-screen backdrop first: the world and HUD are still painted under
    // this (the frame loop runs in every mode), so the bestiary owns the view.
    g.fillStyle = 'rgba(3,3,8,0.94)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    const MASK = '#262636';   // the one flat dark silhouette colour
    let grid = null, palette = null, gw = 0, gh = 0;
    let shape = 'block', color = MASK, sw = C.ENEMY.W, sh = C.ENEMY.H;
    if (bv.kind === 'boss') {
      const desc = BOSSES[bv.ref] || MIDBOSS[bv.ref];
      // The static BOSSES table does not carry `sprite` (only the spawn copies
      // bosses.js:spawn() builds get it attached) — resolve through
      // BOSS_SPRITES so the guide paints the real sprite, never a stand-in.
      // A boss sprite is ANIMATED ({ frames, palette, box }); the guide shows
      // frame 0 (the in-game idiom: spr.frames[floor(age*6) % len], age 0).
      const spr = desc && (desc.sprite || BOSS_SPRITES[bv.ref]);
      if (spr) {
        grid = spr.frames ? spr.frames[0] : spr.grid;
        // Masked: every palette entry -> MASK, so the silhouette IS the sprite.
        palette = bv.discovered ? spr.palette
          : Object.fromEntries(Object.keys(spr.palette).map(k => [k, MASK]));
        gw = spr.box.w; gh = spr.box.h;
      }
    } else if (bv.kind === 'tier') {
      shape = 'diamond';                      // the emblem plate shape
      sw = 24; sh = 24;
      color = bv.discovered
        ? (bv.ref === 'ELITE' ? '#ffd75e' : (RARITY[bv.ref] && RARITY[bv.ref].tell.outline))
        : MASK;
    } else {
      const look = resolveLook(bv.ref, 0);    // the REAL silhouette contract
      shape = look.shape;
      sw = C.ENEMY.W * look.sizeMult;
      sh = C.ENEMY.H * look.sizeMult;
      color = bv.discovered ? look.body : MASK;
    }

    const maxW = Math.floor(C.VIEW_W * 0.72);
    const maxH = Math.floor(C.VIEW_H * 0.62);
    let scale, w, h;
    if (grid) {
      scale = Math.min(Math.floor(maxW / gw), Math.floor(maxH / gh));
      if (!(scale >= 1)) scale = 1;
      w = gw * scale; h = gh * scale;
    } else {
      // 'tall'/'wide' overshoot the box by 1.3x (drawShape) — budget for it
      // so the silhouette never clips its case. 'diamond' inscribes the box.
      const over = (shape === 'tall' || shape === 'wide') ? 1.3 : 1;
      scale = Math.min(Math.floor(maxW / (sw * over)), Math.floor(maxH / (sh * over)));
      if (!(scale >= 1)) scale = 1;
      w = Math.round(sw * scale); h = Math.round(sh * scale);
    }
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);

    // Display case in the HUD's own chrome vocabulary — identical primitives
    // to the trophy showcase, so both screens read as the same game.
    const PAD = 6;
    g.fillStyle = C.HUD.FRAME;
    g.fillRect(x - PAD - 2, y - PAD - 2, w + PAD * 2 + 4, h + PAD * 2 + 4);
    g.fillStyle = '#000000';
    g.fillRect(x - PAD - 1, y - PAD - 1, w + PAD * 2 + 2, h + PAD * 2 + 2);
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);

    if (grid) {
      this.drawGrid(g, grid, palette, x, y, scale);
    } else {
      g.fillStyle = color;
      drawShape(g, shape, x + Math.round(w / 2), y + Math.round(h / 2), w, h);
    }

    this.bestiary = { scale, x, y, w, h, id: bv.id, discovered: !!bv.discovered };
  }

  // ---- arena relief (world space; the elevated-paths height field) ------------
  // ARENA SCALE-UP (2026-09-17): the stage's quantized height, painted as a
  // per-level lighten step + a 1px contour edge where the level changes. The
  // field is hashed on the fly from the run's groundSeed (the drawGround
  // pattern — nothing is stored, off-view cells are never visited) and sits
  // UNDER the decor, so elevation reads as terrain without competing with
  // the play pieces. A LEVELS<=1 stage paints nothing (flat is a character).
  drawRelief(g, state, cam, theme) {
    const seed = state.groundSeed || 1;
    const RC = C.RELIEF.RENDER_CELL;
    const RIM = C.GROUND.RIM;
    const rel = stageRelief(state.stage);
    if (!rel || rel.LEVELS <= 1) return;
    const c0 = Math.floor(cam.x / RC), c1 = Math.floor((cam.x + C.VIEW_W) / RC);
    const r0 = Math.floor(cam.y / RC), r1 = Math.floor((cam.y + C.VIEW_H) / RC);
    const lvAt = (wx, wy) => reliefLevel(wx, wy, seed, rel);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const wx = cx * RC + RC / 2, wy = cy * RC + RC / 2;
        // Relief never paints past the rim (the WAVE-24 decor rule).
        if (wx < -RIM || wx > RIM || wy < -RIM || wy > RIM) continue;
        const lv = lvAt(wx, wy);
        const x = Math.round(cx * RC - cam.x), y = Math.round(cy * RC - cam.y);
        if (lv > 0) {
          // Each level lightens the theme base one step — terraced ground.
          g.globalAlpha = 0.05 * lv;
          g.fillStyle = '#ffffff';
          g.fillRect(x, y, RC + 1, RC + 1);
        }
        // Contour edges: a 1px shadowed lip where the neighbour rises or
        // falls — the elevation's read at a glance, and free at RC 60.
        if (lvAt(wx + RC, wy) !== lv) {
          g.globalAlpha = 0.22;
          g.fillStyle = '#000000';
          g.fillRect(x + RC, y, 1, RC + 1);
        }
        if (lvAt(wx, wy + RC) !== lv) {
          g.globalAlpha = 0.22;
          g.fillStyle = '#000000';
          g.fillRect(x, y + RC, RC + 1, 1);
        }
      }
    }
    g.globalAlpha = 1;
    this.reliefCells = (c1 - c0 + 1) * (r1 - r0 + 1);
  }

  // ---- ground decor (world space; deterministic hash field) ------------------
  // WAVE-23 (#2, Sk408 directive): the old 1-2px speckle read as "scanline
  // noise / hieroglyphs". Same deterministic field, same culling, same
  // palettes — but every piece is now LARGE and COMPOSED (a stone PAIR, a
  // tuft CLUSTER, a slab PLATE with seams, an occasional boulder landmark)
  // so the floor reads as deliberate level art. Still subtle: decor sits
  // under entities and never competes with the play pieces.
  drawGround(g, seed, cam, theme) {
    const CELL = C.GROUND.CELL, DENS = C.GROUND.DENSITY;
    // WAVE-24 (#3): decor clips at the arena RIM (600), not the old 660 bound
    // — pieces used to spill into the off-map gloom past the wall.
    const RIM = C.GROUND.RIM;
    // WAVE-9B/2: palette family rides the WAVE theme (groundSeed keeps
    // shaping WHICH cells carry a piece — the field itself stays per-run).
    const pal = theme || groundTheme(1);
    const c0 = Math.floor(cam.x / CELL), c1 = Math.floor((cam.x + C.VIEW_W) / CELL);
    const r0 = Math.floor(cam.y / CELL), r1 = Math.floor((cam.y + C.VIEW_H) / CELL);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cellRand(cx, cy, seed, 1) >= DENS) continue;
        const wx = cx * CELL + Math.floor(cellRand(cx, cy, seed, 2) * (CELL - 16));
        const wy = cy * CELL + Math.floor(cellRand(cx, cy, seed, 3) * (CELL - 16));
        // Keep the whole piece inside the arena: pieces are up to 14px wide,
        // so the anchor culls 14 short of the rim.
        if (wx < -RIM + 2 || wx > RIM - 14 || wy < -RIM + 2 || wy > RIM - 14) continue;
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        const kind = cellRand(cx, cy, seed, 4);
        if (kind < 0.28) {            // tuft cluster: 5 blades + dirt specks
          g.fillStyle = pal.tuft;
          g.fillRect(x, y, 1, 4); g.fillRect(x + 2, y - 1, 1, 5); g.fillRect(x + 5, y + 1, 1, 3);
          g.fillRect(x + 7, y, 1, 4);
          g.fillStyle = pal.tuft2;
          g.fillRect(x + 1, y + 1, 1, 3); g.fillRect(x + 3, y, 1, 4); g.fillRect(x + 6, y + 1, 1, 3);
          g.fillStyle = pal.crack;
          g.fillRect(x - 2, y + 4, 2, 1); g.fillRect(x + 6, y + 5, 2, 1);
        } else if (kind < 0.52) {     // stone pair: big rock + pebble sidekick
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 1, 6, 4); g.fillRect(x + 1, y, 4, 1);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 1, 3, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 7, y + 3, 3, 2);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 7, y + 3, 1, 1);
        } else if (kind < 0.68) {     // crack run: long stepping fissure
          g.fillStyle = pal.crack;
          g.fillRect(x, y, 3, 1); g.fillRect(x + 3, y + 1, 3, 1); g.fillRect(x + 5, y + 2, 3, 1);
          g.fillRect(x + 8, y + 3, 2, 1); g.fillRect(x + 4, y + 3, 2, 1);
          g.fillStyle = pal.stoneTop;  // lit lip along the fissure
          g.fillRect(x, y - 1, 3, 1); g.fillRect(x + 3, y, 3, 1);
        } else if (kind < 0.93) {     // slab plate: 13x13 floor tile, notched
          g.fillStyle = pal.slab;     // corners + a seam — reads as paving
          g.fillRect(x + 1, y, 11, 13); g.fillRect(x, y + 1, 13, 11);
          g.fillStyle = pal.base;     // knock the corners off the square
          g.fillRect(x, y, 1, 1); g.fillRect(x + 12, y, 1, 1);
          g.fillRect(x, y + 12, 1, 1); g.fillRect(x + 12, y + 12, 1, 1);
          g.fillStyle = pal.stoneTop; // lit top pitch (paving relief)
          g.fillRect(x + 1, y, 11, 1);
          g.fillStyle = pal.crack;    // a seam splitting the plate
          const seam = cellRand(cx, cy, seed, 5) < 0.5;
          if (seam) g.fillRect(x + 2, y + 6, 9, 1);
          else g.fillRect(x + 6, y + 2, 1, 9);
        } else {                      // boulder: rare landmark anchor
          g.fillStyle = pal.stone;
          g.fillRect(x + 1, y + 1, 8, 5); g.fillRect(x, y + 2, 10, 3); g.fillRect(x + 3, y, 4, 1);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 3, y + 1, 4, 1); g.fillRect(x + 2, y + 2, 2, 1);
          g.fillStyle = pal.crack;    // grounded shadow at the base
          g.fillRect(x - 1, y + 6, 12, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 11, y + 4, 2, 2);
        }
      }
    }
  }

  // ---- WAVE-24 (#3): LANDMARKS — deliberate level art -------------------------
  // The fine decor field above is TEXTURE; a floor made only of texture reads
  // as noise with no sense of place (the vision pass: "scanline noise",
  // "hieroglyph-like glyphs"). This second, COARSER layer puts a handful of
  // recognizable structures on a LANDMARK_CELL grid — ruined wall runs, fallen
  // pillars, cairns, camp rings and a theme-flavored pile — so the floor has
  // landmarks to orient by. Same deterministic hash field as the fine decor
  // (no stored arrays; off-screen cells are never visited), same theme
  // palette, drawn ON TOP of the fine field (structures occlude ground
  // texture) but still UNDER every entity. Quiet by contract: dark tones,
  // never brighter than a play piece. `this.landmarks` is the smoke seam
  // (what was painted this frame: { kind, x, y, rects } in world coords).
  drawLandmarks(g, seed, cam, theme, stage) {
    const FC = C.GROUND.LANDMARK_CELL, DENS = C.GROUND.LANDMARK_DENSITY;
    const RIM = C.GROUND.RIM;
    const pal = theme || groundTheme(1);
    const tIdx = C.GROUND.THEMES.indexOf(pal);
    // STARTING ARENA IMPROVE (2026-09-17): `stage` (optional) lets ONE arena
    // carry its own landmark identity without touching the other seven —
    // the VERDANT HOLLOW grows grove stands and two authored structures
    // (the heart stump + the cardinal gates) so the run reads as a PLACE.
    const hollow = stage === 'VERDANT_HOLLOW';
    // The hollow's AUTHORED accents. The hash field above stays whisper-quiet
    // by contract (same value band as the ground), but the stump, gates and
    // groves are the MAP a first-timer orients by — measured against a phone
    // shot (2026-09-17): the quiet palette rendered faint-to-invisible next to
    // base #0e1610. These accents keep the landmark layer clearly under every
    // play piece (gems #ffd75e, potions, lit foes) while giving the authored
    // set the value separation the field lacks. Only the hollow ever sees them.
    const A = {
      bark: '#3e2e1e', wood: '#7c603c', ring: '#a8906a',   // the stump: cut wood
      moss: '#4c9455', mossLit: '#6cc47c',                  // living green
      leaf: '#2e5c38',                                      // grove canopy base
      rock: '#5e6a5e', rockLit: '#98ad9a',                  // the gate stones
      shadow: '#060a07',
    };
    const grove = (x, y) => {          // tree stand: canopy + trunks + a log
      g.fillStyle = A.shadow;                                    // bed shadow
      g.fillRect(x - 2, y + 12, 30, 2);
      g.fillStyle = A.leaf;                                      // canopy
      g.fillRect(x - 2, y, 14, 8); g.fillRect(x + 9, y + 2, 15, 8);
      g.fillStyle = A.moss;                                      // lit canopy
      g.fillRect(x - 2, y, 14, 2); g.fillRect(x + 9, y + 2, 15, 2);
      g.fillStyle = A.mossLit;                                   // sun-lit crowns
      g.fillRect(x + 2, y, 5, 2); g.fillRect(x + 13, y + 2, 6, 2);
      g.fillRect(x + 4, y + 5, 4, 2);
      g.fillStyle = A.bark;                                      // trunks
      g.fillRect(x + 4, y + 8, 4, 5); g.fillRect(x + 15, y + 10, 4, 3);
      g.fillStyle = A.wood;                                      // fallen log
      g.fillRect(x - 2, y + 9, 8, 3);
      return 11;
    };
    const out = [];
    const c0 = Math.floor(cam.x / FC), c1 = Math.floor((cam.x + C.VIEW_W) / FC);
    const r0 = Math.floor(cam.y / FC), r1 = Math.floor((cam.y + C.VIEW_H) / FC);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cellRand(cx, cy, seed, 11) >= DENS) continue;
        // Anchor inside the cell with a margin so a structure never clips its
        // neighbour, and never past the arena rim (structures are <= 72 wide).
        const wx = cx * FC + 24 + Math.floor(cellRand(cx, cy, seed, 12) * (FC - 72));
        const wy = cy * FC + 24 + Math.floor(cellRand(cx, cy, seed, 13) * (FC - 72));
        if (wx < -RIM + 4 || wx > RIM - 76 || wy < -RIM + 4 || wy > RIM - 76) continue;
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        const pick = cellRand(cx, cy, seed, 14);
        // rects = how many fillRects this structure painted (the smoke seam
        // asserts every landmark is COMPOSED, i.e. many rects, not a glyph).
        let rects = 6;
        let kind = 'RUBBLE';
        if (pick < 0.26) {            // RUINED WALL RUN: blocks + a breach
          kind = 'WALL';
          const n = 4 + Math.floor(cellRand(cx, cy, seed, 15) * 3);      // 4..6
          const gap = Math.floor(cellRand(cx, cy, seed, 16) * n);        // breach
          rects = 1 + 2 * (n - 1);
          g.fillStyle = pal.crack;                                       // base shadow
          g.fillRect(x - 1, y + 5, n * 11 + 1, 1);
          g.fillStyle = pal.stone;
          for (let i = 0; i < n; i++) { if (i !== gap) g.fillRect(x + i * 11, y, 10, 5); }
          g.fillStyle = pal.stoneTop;                                    // lit course
          for (let i = 0; i < n; i++) { if (i !== gap) g.fillRect(x + i * 11, y, 10, 1); }
        } else if (hollow && pick < 0.52) {   // THE HOLLOW: grove stands
          kind = 'GROVE';                     // (the wooded arena's filler)
          rects = grove(x, y);
        } else if (pick < 0.48) {     // FALLEN PILLAR: stepped column + base
          kind = 'PILLAR';
          const n = 3 + Math.floor(cellRand(cx, cy, seed, 15) * 3);      // 3..5
          rects = 2 * n + 3;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 5, n * 8 + 12, 1);
          g.fillStyle = pal.stone;
          for (let i = 0; i < n; i++) g.fillRect(x + i * 8, y + i * 5, 12, 5);
          g.fillRect(x + n * 8, y + n * 5, 10, 6);                       // broken base
          g.fillStyle = pal.stoneTop;
          for (let i = 0; i < n; i++) g.fillRect(x + i * 8, y + i * 5, 12, 1);
          g.fillRect(x + n * 8, y + n * 5, 10, 1);
        } else if (pick < 0.68) {     // CAIRN: stacked stones, tapering
          kind = 'CAIRN';
          rects = 7;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 12, 16, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 8, 14, 4);
          g.fillRect(x + 2, y + 4, 10, 4);
          g.fillRect(x + 4, y + 1, 6, 3);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 8, 12, 1);
          g.fillRect(x + 3, y + 4, 8, 1);
          g.fillRect(x + 4, y + 1, 6, 1);
        } else if (pick < 0.86) {     // CAMP RING: stones round a fire scar
          kind = 'CAMP';
          rects = 9;
          const R = 9 + Math.floor(cellRand(cx, cy, seed, 15) * 5);
          g.fillStyle = pal.crack;                                     // scorched centre
          g.fillRect(x + 8, y + 6, 9, 9);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.fillStyle = i % 2 ? pal.stone : pal.stoneTop;
            g.fillRect(Math.round(x + 12 + Math.cos(a) * R),
                       Math.round(y + 10 + Math.sin(a) * R), 3, 2);
          }
        } else if (hollow) {          // THE HOLLOW: the tail grows groves too
          kind = 'GROVE';
          rects = grove(x, y);
        } else if (tIdx === 5) {      // VOID REACH: crystal shard cluster
          kind = 'CRYSTAL';
          rects = 7;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 11, 18, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 1, y + 3, 5, 9); g.fillRect(x + 10, y + 5, 4, 7);
          g.fillStyle = pal.tuft2;                                     // the shards
          g.fillRect(x + 2, y, 2, 11); g.fillRect(x + 11, y + 2, 2, 9);
          g.fillStyle = pal.tuft;
          g.fillRect(x + 2, y, 1, 5); g.fillRect(x + 11, y + 2, 1, 4);
        } else if (tIdx === 2) {      // SNOWFIELD: wind-packed drift mound
          kind = 'DRIFT';
          rects = 5;
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 6, 20, 5); g.fillRect(x + 4, y + 3, 12, 4);
          g.fillStyle = pal.stoneTop;                                  // windlit crest
          g.fillRect(x + 4, y + 3, 12, 1); g.fillRect(x, y + 6, 20, 1);
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 11, 22, 1);
        } else {                      // rubble mound: collapsed stone heap
          kind = 'RUBBLE';
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 10, 19, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 6, 18, 5); g.fillRect(x + 3, y + 3, 11, 4);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 6, 16, 1); g.fillRect(x + 4, y + 3, 9, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 14, y + 8, 4, 3);
        }
        out.push({ kind, x: wx, y: wy, rects });
      }
    }
    // THE HOLLOW'S AUTHORED LANDMARKS (STARTING ARENA IMPROVE 2026-09-17) —
    // not hash-gated: the OLD STUMP stands at the exact arena heart (the
    // spawn clearing the BASIN relief flattens) and a GATE of twin stones
    // marks each cardinal rim approach, so the 1800x1800 field reads as a
    // MAP: from anywhere, "the stump" is home and the nearest gate names
    // the wall you are walking toward. Deterministic, camera-culled, the
    // same palette and the same landmarks seam as the field structures.
    if (hollow) {
      const put = (kind, wx, wy, draw) => {
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        if (x < -80 || x > C.VIEW_W + 80 || y < -80 || y > C.VIEW_H + 80) return;
        out.push({ kind, x: wx, y: wy, rects: draw(x, y) });
      };
      put('STUMP', 0, 0, (x, y) => {   // the OLD STUMP: the hollow's heart
        // Big enough to read around the pilot who spawns on it (the pilot is
        // ~14px; the cut face is 40 wide), and two value bands above the
        // ground so it reads at phone scale. Second readability pass
        // (2026-09-17, measured against a phone shot): a stepped OCTAGON
        // silhouette instead of a square (a round thing reads "stump", a
        // square reads "crate"), a 2px darker outer bark rim, a soft drop
        // shadow wider than the base so the mass sits ON the ground.
        g.fillStyle = A.shadow;                                // drop shadow
        g.fillRect(x - 26, y + 20, 52, 4);
        g.fillRect(x - 32, y + 22, 64, 3);
        g.fillStyle = A.bark;                                  // bark: octagon
        g.fillRect(x - 16, y - 26, 32, 4);
        g.fillRect(x - 22, y - 22, 44, 8);
        g.fillRect(x - 24, y - 14, 48, 32);
        g.fillRect(x - 22, y + 18, 44, 6);
        g.fillRect(x - 16, y + 24, 32, 4);
        g.fillStyle = A.wood;                                  // cut face (stepped in)
        g.fillRect(x - 12, y - 20, 24, 4);
        g.fillRect(x - 16, y - 16, 32, 34);
        g.fillRect(x - 12, y + 18, 24, 4);
        g.fillStyle = A.ring;                                  // growth rings
        g.fillRect(x - 14, y - 14, 28, 2); g.fillRect(x - 11, y - 8, 22, 2);
        g.fillRect(x - 8, y - 2, 16, 2); g.fillRect(x - 11, y + 4, 22, 2);
        g.fillRect(x - 7, y + 10, 14, 2);
        g.fillStyle = A.bark;                                  // heartwood
        g.fillRect(x - 3, y + 14, 6, 4);
        g.fillStyle = A.moss;                                  // moss caps
        g.fillRect(x - 20, y - 22, 8, 5); g.fillRect(x + 12, y - 18, 9, 6);
        g.fillRect(x - 20, y + 16, 11, 6);
        g.fillStyle = A.mossLit;                               // lit moss
        g.fillRect(x - 20, y - 22, 8, 2); g.fillRect(x + 12, y - 18, 9, 2);
        g.fillRect(x + 17, y - 14, 4, 3);
        g.fillStyle = A.bark;                                  // roots
        g.fillRect(x - 36, y + 18, 14, 3); g.fillRect(x + 22, y + 20, 15, 3);
        g.fillRect(x - 3, y + 26, 6, 8);
        return 23;
      });
      const G = RIM - 150;             // just inside the wall, on the flat rim
      for (const [gx, gy] of [[0, -G], [0, G], [-G, 0], [G, 0]]) {
        put('GATE', gx, gy, (x, y) => {  // twin stones, moss-capped
          // Second readability pass (2026-09-17): 3-step TAPERED monoliths
          // (wide base, narrow cap — standing stones, not wall blocks), a cast
          // shadow spanning both stones so the pair reads as one gate, and the
          // lintel BROKEN — lying fallen at a stepped diagonal between the
          // pillars, which reads as a ruin instead of a lintel-shaped bar.
          g.fillStyle = A.shadow;                              // cast shadow
          g.fillRect(x - 18, y + 14, 56, 3);
          g.fillRect(x - 12, y + 17, 44, 2);
          g.fillStyle = A.rock;                                // left monolith
          g.fillRect(x - 16, y - 8, 15, 24);                   // base course
          g.fillRect(x - 14, y - 22, 13, 14);                  // mid course
          g.fillRect(x - 12, y - 32, 10, 10);                  // cap course
          g.fillStyle = A.rock;                                // right monolith
          g.fillRect(x + 4, y - 4, 13, 20);
          g.fillRect(x + 6, y - 18, 11, 14);
          g.fillRect(x + 8, y - 30, 8, 12);
          g.fillStyle = A.rockLit;                             // lit faces
          g.fillRect(x - 16, y - 8, 15, 2); g.fillRect(x - 14, y - 22, 13, 2);
          g.fillRect(x - 12, y - 32, 10, 2);
          g.fillRect(x + 4, y - 4, 13, 2); g.fillRect(x + 6, y - 18, 11, 2);
          g.fillRect(x + 8, y - 30, 8, 2);
          g.fillRect(x - 16, y - 8, 2, 24); g.fillRect(x + 4, y - 4, 2, 20);
          g.fillStyle = A.rock;                                // broken lintel,
          g.fillRect(x - 10, y + 4, 8, 4);                     // fallen at a step
          g.fillRect(x - 4, y + 2, 8, 4);                      // diagonal between
          g.fillRect(x + 2, y + 4, 8, 4);                      // the pillars
          g.fillStyle = A.rockLit;
          g.fillRect(x - 10, y + 4, 8, 1); g.fillRect(x - 4, y + 2, 8, 1);
          g.fillRect(x + 2, y + 4, 8, 1);
          g.fillStyle = A.moss;                                // moss caps
          g.fillRect(x - 12, y - 32, 9, 3); g.fillRect(x + 8, y - 30, 7, 3);
          g.fillRect(x - 13, y + 8, 7, 4);
          g.fillStyle = A.mossLit;                             // lit moss
          g.fillRect(x - 12, y - 32, 9, 1); g.fillRect(x + 8, y - 30, 7, 1);
          g.fillRect(x - 13, y + 8, 7, 1);
          return 21;
        });
      }
    }
    this.landmarks = out;
  }

  // ---- WAVE-18 (#7): the ARENA WALL --------------------------------------------
  // galaxy.click: "the edge of the map is not clearly defined". The clamp
  // (±600, main.js update) always existed but drew nothing — an invisible
  // wall reads as a bug ("why did I stop?"). This paints a stone-slab rim AT
  // the clamp edge, theme-tinted like the ground decor (lit inner face, dark
  // mortar seams, crisp black rim line), with a gloom fill beyond it so
  // off-map space reads as off-map. It is world geometry: drawn inside the
  // zoom transform (crisp at 1x through 8x) and culled per side to the
  // visible window. `this.arenaWall` is the smoke seam (world-coord sides).
  drawArenaWall(g, cam, theme) {
    // WAVE-27: the band thickness is CONFIG.GROUND.WALL — the loot clamp
    // (entities.clampLootToArena) and the pilot edge hold (controllers.js)
    // subtract the same knob, so the art and the reachability rule can never
    // drift apart again (it used to be a bare 12 here).
    const RIM = C.GROUND.RIM, T = C.GROUND.WALL;   // clamp edge + wall band px
    const pal = theme || groundTheme(1);
    const x0 = cam.x, x1 = cam.x + C.VIEW_W, y0 = cam.y, y1 = cam.y + C.VIEW_H;
    // (a) gloom beyond the rim — non-overlapping decomposition of the visible
    // window minus the arena square, so the alpha never stacks at corners.
    if (y0 < -RIM) {
      const gy1 = Math.min(y1, -RIM);
      g.fillStyle = 'rgba(4,4,10,0.55)';
      g.fillRect(Math.round(x0 - cam.x), Math.round(y0 - cam.y),
        C.VIEW_W, Math.round(gy1 - y0));
    }
    if (y1 > RIM) {
      const gy0 = Math.max(y0, RIM);
      g.fillStyle = 'rgba(4,4,10,0.55)';
      g.fillRect(Math.round(x0 - cam.x), Math.round(gy0 - cam.y),
        C.VIEW_W, Math.round(y1 - gy0));
    }
    const cy0 = Math.max(y0, -RIM), cy1 = Math.min(y1, RIM);
    if (cy1 > cy0) {
      if (x0 < -RIM) {
        const gx1 = Math.min(x1, -RIM);
        g.fillStyle = 'rgba(4,4,10,0.55)';
        g.fillRect(Math.round(x0 - cam.x), Math.round(cy0 - cam.y),
          Math.round(gx1 - x0), Math.round(cy1 - cy0));
      }
      if (x1 > RIM) {
        const gx0 = Math.max(x0, RIM);
        g.fillStyle = 'rgba(4,4,10,0.55)';
        g.fillRect(Math.round(gx0 - cam.x), Math.round(cy0 - cam.y),
          Math.round(x1 - gx0), Math.round(cy1 - cy0));
      }
    }
    // (b) the wall band on each visible side, extended T past the corners so
    // the bands join. Stone body + lit inner face + black rim line + seams.
    const wy0 = Math.max(y0, -RIM - T), wy1 = Math.min(y1, RIM + T);
    const wx0 = Math.max(x0, -RIM - T), wx1 = Math.min(x1, RIM + T);
    const sides = [];
    if (x1 > RIM && x0 < RIM + T && wy1 > wy0)
      sides.push({ side: 'E', x: RIM, y: wy0, w: T, h: wy1 - wy0, horiz: false });
    if (x0 < -RIM && x1 > -RIM - T && wy1 > wy0)
      sides.push({ side: 'W', x: -RIM - T, y: wy0, w: T, h: wy1 - wy0, horiz: false });
    if (y1 > RIM && y0 < RIM + T && wx1 > wx0)
      sides.push({ side: 'S', x: wx0, y: RIM, w: wx1 - wx0, h: T, horiz: true });
    if (y0 < -RIM && y1 > -RIM - T && wx1 > wx0)
      sides.push({ side: 'N', x: wx0, y: -RIM - T, w: wx1 - wx0, h: T, horiz: true });
    for (const s of sides) {
      g.fillStyle = pal.stone;                       // slab body
      g.fillRect(Math.round(s.x - cam.x), Math.round(s.y - cam.y), s.w, s.h);
      // Crisp black rim line on the ARENA-facing edge + a lit face just
      // outside it. E/S light their min edge (arena is at lower x/y); W/N
      // light their max edge.
      const inner = (s.side === 'W') ? s.x + s.w - 1 : s.x;    // lit-line x
      const innerY = (s.side === 'N') ? s.y + s.h - 1 : s.y;   // lit-line y
      const outward = (s.side === 'W' || s.side === 'N') ? -1 : 1;
      g.fillStyle = '#000000';
      if (s.horiz) g.fillRect(Math.round(s.x - cam.x), Math.round(innerY - cam.y), s.w, 1);
      else g.fillRect(Math.round(inner - cam.x), Math.round(s.y - cam.y), 1, s.h);
      g.fillStyle = pal.stoneTop;
      if (s.horiz) g.fillRect(Math.round(s.x - cam.x), Math.round(innerY - cam.y) + outward, s.w, 1);
      else g.fillRect(Math.round(inner - cam.x) + outward, Math.round(s.y - cam.y), 1, s.h);
      // mortar seams every 16px along the band
      g.fillStyle = 'rgba(0,0,0,0.35)';
      if (s.horiz) {
        for (let mx = s.x + 16; mx < s.x + s.w; mx += 16) {
          g.fillRect(Math.round(mx - cam.x), Math.round(s.y - cam.y), 1, s.h);
        }
      } else {
        for (let my = s.y + 16; my < s.y + s.h; my += 16) {
          g.fillRect(Math.round(s.x - cam.x), Math.round(my - cam.y), s.w, 1);
        }
      }
    }
    this.arenaWall = { rim: RIM, thickness: T, sides };
  }

  // ---- weather rendering -----------------------------------------------------
  // WAVE-16 split: PARTICLES are world objects and ride the zoom transform
  // (drawWeatherParticles, called inside the world layer); the SKY (cloud
  // bands, the sun) is distant scenery and the tint is a screen wash — both
  // stay native 1x (drawWeatherSky, after the restore). Particles are STORED
  // in a bounded view-sized field (weather.js — wrapped, deterministic,
  // unit-tested) but RENDERED camera-anchored: the camera offset is applied
  // and re-wrapped, so rain falls past the player instead of sliding with
  // the screen. Cloud bands keep a light parallax (they're distant); the sun
  // is celestial and stays screen-fixed.
  drawWeatherParticles(g, weather, cam) {
    if (!weather || !weather.def.particles) return;
    const def = weather.def;
    const t = weather.time || 0;
    const wrapX = (v) => (((v - cam.x) % C.VIEW_W) + C.VIEW_W) % C.VIEW_W;
    const wrapY = (v) => (((v - cam.y) % C.VIEW_H) + C.VIEW_H) % C.VIEW_H;
    const P = def.particles;
    for (let i = 0; i < weather.particles.length; i++) {
      const p = weather.particles[i];
      // World-anchor: subtract the camera and re-wrap inside the view.
      const x = Math.round(wrapX(p.x)), y = Math.round(wrapY(p.y));
      if (P.shape === 'streak') {          // RAIN: 1x4 falling streaks
        g.fillStyle = 'rgba(90,138,216,0.7)';
        g.fillRect(x, y, 1, 4);
      } else if (P.shape === 'flake') {    // SNOW: 1x1/2x2 swaying flakes
        g.fillStyle = P.color;
        g.fillRect(x, y, p.size, p.size);
      } else if (P.shape === 'dash') {     // WIND: horizontal dashes
        if (Math.floor(t * 8 + p.phase) % 3 !== 0) {   // flicker
          g.fillStyle = 'rgba(174,191,208,0.55)';
          g.fillRect(x, y, 5, 1);
        }
      } else if (P.shape === 'firefly') {  // MOONLIGHT: blinking fireflies
        if (Math.floor(t * 2 + p.phase) % 2 === 0) {
          g.fillStyle = P.color;
          g.fillRect(x, y, 2, 2);
          g.fillStyle = 'rgba(216,255,176,0.4)';
          g.fillRect(x - 1, y - 1, 4, 4);
        }
      }
    }
  }

  drawWeatherSky(g, weather, cam) {
    if (!weather) return;
    const def = weather.def;
    const t = weather.time || 0;
    if (def.bands) {
      // CLOUDY: dark translucent bands scrolling down; slow parallax on y.
      g.fillStyle = 'rgba(20,22,35,0.16)';
      for (let i = 0; i < 4; i++) {
        const y = Math.round((t * 8 + cam.y * 0.2 + i * (C.VIEW_H / 4)) % (C.VIEW_H + 20)) - 10;
        g.fillRect(0, y, C.VIEW_W, 14);
      }
    }
    if (def.rays) {
      // SUNNY: corner sun disc + radiating ray dots (gentle pulse).
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.5);
      g.fillStyle = '#ffd75e';
      g.fillRect(C.VIEW_W - 26, 2, 12, 12);
      g.fillRect(C.VIEW_W - 30, 6, 20, 4);
      g.fillRect(C.VIEW_W - 22, -2, 4, 20);
      g.fillStyle = 'rgba(255,215,94,0.5)';
      for (let r = 0; r < 5; r++) {
        const a = Math.PI + (r / 4) * (Math.PI / 2);   // fan into the scene
        for (let d = 18; d < 90 * pulse; d += 6) {
          g.fillRect(Math.round(C.VIEW_W - 20 + Math.cos(a) * d),
                     Math.round(8 + Math.sin(a) * d), 2, 2);
        }
      }
    }
    // Scene tint last (rgba overlay value from the type table).
    if (def.tint) {
      g.fillStyle = def.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
  }
}
