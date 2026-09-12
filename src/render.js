// HORDES — pixel rendering. Sprites are pixel grids drawn with fillRect:
// no image assets, no drawImage — pure structured data.
import { CONFIG as C } from './config.js';
import { resolveLook, ELITE_LOOK } from './enemy_types.js';
import { SPRITES, BOSS_SPRITE, FLAME } from './sprites.js';
import {
  WEAPON_ICONS, WEAPON_ICON_PALETTE, ITEM_ICON_GRID, weatherIcon,
} from './sprites.js';
import { FINAL_BOSS_SPRITE } from './final_boss.js';
import { weaponXpNeeded, WEAPON_MAX_LEVEL } from './weapons.js';   // WAVE-18 read-only

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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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
  }

  drawSprite(g, grid, x, y) {
    this.drawGrid(g, grid, PALETTE, x, y);
  }

  // Generic pixel-grid painter (sprites.js enemies/boss/flames carry their own
  // palette objects keyed 1..9; 0 = transparent).
  drawGrid(g, grid, palette, x, y) {
    for (let ry = 0; ry < grid.length; ry++) {
      const row = grid[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const v = row[rx];
        if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx, y + ry, 1, 1); }
      }
    }
  }

  render(state, cam) {
    const g = this.ctx;
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
    const Z = Math.max(1, Math.round(state.zoom || 1));
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
    const gs = 24;
    const ox = ((-cam.x % gs) + gs) % gs;
    const oy = ((-cam.y % gs) + gs) % gs;
    for (let y = oy - gs; y < C.VIEW_H; y += gs) {
      for (let x = ox - gs; x < C.VIEW_W; x += gs) g.fillRect(x, y, 1, 1);
    }

    // Ground decor: world-anchored seeded field, drawn under everything else
    // so the camera's player-lock reads as the PLAYER moving, not the world.
    this.drawGround(g, state.groundSeed || 1, cam, theme);
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
    // core — the walk-in that ends the wave.
    if (state.portal) {
      const po = state.portal;
      const x = Math.round(po.x - cam.x), y = Math.round(po.y - cam.y);
      const t = state.time || 0;
      const n = 8, R = 24;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + t * 0.8;
        const fx = Math.round(x + Math.cos(ang) * R), fy = Math.round(y + Math.sin(ang) * R);
        const fi = Math.floor(t * 10 + i * 1.3) % FLAME.frames.length;
        this.drawGrid(g, FLAME.frames[fi], FLAME.palette,
          fx - FLAME.anchor.x, fy - FLAME.anchor.y - 4);
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const r = Math.round(5 + 3 * pulse);
      g.fillStyle = pulse > 0.5 ? '#b8e0ff' : '#5a7ad8';
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
      const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
      if (cull(x, y, 30)) continue;
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
          fx.kind === 'mine_blast' || fx.kind === 'colossus_shock') {
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
    this.drawHudChrome(g, state);
    // WAVE-14 boss-arrival overlay: cinematic letterbox + name. Above even
    // the HUD chrome — it is a moment, not a readout.
    this.drawBossBanner(g, state);
  }

  // ---- WAVE-14 boss-arrival overlay ------------------------------------------
  // state.bossBanner = { title, sub, ttl } (main.js sets it at boss spawn /
  // finale start; ~2.5s). Cinematic letterbox bands + big centered name + a
  // flavor sub-line. Ramps in over the first 0.35s and out over the last 0.6s
  // so it slams in and eases away. `this.bossBanner` is the test seam (the
  // exact values painted this frame; null when no banner is live).
  drawBossBanner(g, state) {
    const b = state.bossBanner;
    if (!b || !(b.ttl > 0)) { this.bossBanner = null; return; }
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
    // Name + sub-line, centered.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 20px monospace';
    g.fillStyle = '#ffd75e';
    g.fillText(b.title, W / 2, H / 2 - 9);
    g.font = '10px monospace';               // WAVE-23 (#4): 9 -> 10px
    g.fillStyle = '#d8d8e8';
    g.fillText(b.sub, W / 2, H / 2 + 11);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.globalAlpha = 1;
    this.bossBanner = { name: b.title, sub: b.sub, letterbox: true, alpha };
  }

  // ---- WAVE-12 HUD chrome (fillRect pixel grids only) -------------------------
  // The text #hud div is now opt-in (settings toggle, default off) — this is
  // the always-on visual readout. `this.hudChrome` is the honest test seam:
  // the exact values the bars/icons painted this frame (smoke asserts on it).
  drawHudChrome(g, state) {
    const p = state.player;
    if (!p || !p.stats) { this.hudChrome = null; return; }
    const t = state.time || 0;
    const chrome = { hpFrac: 0, hpFlashFrac: 0, manaFrac: 0, weaponIcons: [], itemIcons: [], weather: null };

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

    const drawBar = (x, y, w, frac, flash, fillCol) => {
      g.fillStyle = '#000000';                       // 1px pixel border
      g.fillRect(x - 1, y - 1, w + 2, 7);
      g.fillStyle = '#3a3a46';                       // empty track
      g.fillRect(x, y, w, 5);
      const fw = Math.round(w * frac);
      g.fillStyle = fillCol;                         // the fill
      g.fillRect(x, y, fw, 5);
      g.fillStyle = 'rgba(255,255,255,0.30)';        // top glint row
      g.fillRect(x, y, fw, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';              // chunky VS-style segments
      for (let sx = x + 5; sx < x + fw; sx += 6) g.fillRect(sx, y + 1, 1, 4);
      if (flash > frac) {                            // damage-flash segment
        const fx = x + fw;
        const fwid = Math.round(w * flash) - fw;
        g.fillStyle = '#ffffff';
        g.fillRect(fx, y, fwid, 5);
      }
    };
    // WAVE-23 (#4/#6): every bar gets a text label to its left — the vision
    // pass called the unlabeled bars "placeholders" — and the bars shift
    // right to make room. 8px mono, tinted to its bar.
    g.font = 'bold 8px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#ff8a96'; g.fillText('HP', 6, 16);
    g.fillStyle = '#7aa8ff'; g.fillText('MP', 6, 26);
    drawBar(22, 16, 110, hpFrac, flashFrac, '#ff5566');
    drawBar(22, 26, 110, manaFrac, 0, '#4a8cff');

    // --- WAVE-18 (#2) PLAYER XP BAR (galaxy.click: "there's no xp bar
    // (?!?!?!?)"). The genre's core readout, previously drawn nowhere: gold,
    // LONGER and BOLDER (6px fill), with the level number riding its right
    // end. WAVE-23 (#1): the EMPTY state must read as a bar at 0% too —
    // visible frame + track, tick marks across the FULL width (not just the
    // fill), an XP label, and a gold goal-tick at the far end. Fill
    // behaviour unchanged. chrome.xpFrac is the EXACT unclamped fraction.
    const xpFrac = p.xpNext > 0 ? Math.max(0, Math.min(1, p.xp / p.xpNext)) : 0;
    chrome.xpFrac = p.xpNext > 0 ? p.xp / p.xpNext : 0;
    chrome.level = p.level || 1;
    const xb = 22, yb = 37, wb = 134, hb = 6;
    g.fillStyle = '#ffd75e';                       // label (matches the fill)
    g.fillText('XP', 6, yb);
    g.fillStyle = '#000000';                       // 1px pixel border
    g.fillRect(xb - 1, yb - 1, wb + 2, hb + 2);
    g.fillStyle = '#464652';                       // empty track (readable at 0%)
    g.fillRect(xb, yb, wb, hb);
    const xfw = Math.round(wb * xpFrac);
    g.fillStyle = '#ffd75e';                       // the gold fill
    g.fillRect(xb, yb, xfw, hb);
    g.fillStyle = 'rgba(255,255,255,0.35)';        // top glint row
    g.fillRect(xb, yb, xfw, 1);
    // Ticks run the FULL track (empty-state fix): over the fill they read as
    // chunky segments, over the track as progress marks. Quarter-ticks are
    // 1px taller so 0%/25%/50%/75% are glanceable.
    g.fillStyle = 'rgba(0,0,0,0.30)';
    for (let sx = xb + 6; sx < xb + wb; sx += 8) g.fillRect(sx, yb + 1, 1, hb - 1);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let q = 1; q <= 3; q++) g.fillRect(xb + Math.round(wb * q / 4), yb, 1, hb);
    g.fillStyle = '#ffd75e';                       // goal tick at the far end
    g.fillRect(xb + wb - 1, yb, 1, hb);
    // WAVE-23 (#4): LV badge — bigger, with a dark readability plate (the
    // vision pass: "washed out, reads like a placeholder").
    const lvTxt = 'LV ' + (p.level || 1);
    g.fillStyle = 'rgba(8,8,14,0.60)';
    g.fillRect(xb + wb + 3, yb - 2, lvTxt.length * 6 + 3, 11);
    g.fillStyle = '#ffe9a8';
    g.font = 'bold 9px monospace';
    g.fillText(lvTxt, xb + wb + 5, yb);

    // --- WAVE-14 event feed: last 3 toasts UNDER the bars (now under the XP
    // bar too), newest lowest. The toast() stream in main.js is the ONE feed
    // — equipment finds (tinted by rarity), arch effects, potions, weapon
    // level-ups, synergies, flash drops, wave/theme lines all land here.
    // Lines fade out over their final second (alpha = ttl clamped to 1).
    g.font = '9px monospace';               // WAVE-23 (#4): 8 -> 9px feed text
    g.textBaseline = 'top';
    chrome.feed = [];
    const feed = (state.toasts || []).slice(-3);
    for (let i = 0; i < feed.length; i++) {
      const ft = feed[i];
      const alpha = Math.max(0, Math.min(1, ft.ttl || 0));
      if (alpha <= 0) continue;
      const fy = 49 + i * 10;
      const fw = ft.msg.length * 6 + 3;   // ~6px/char @ 9px monospace
      g.globalAlpha = alpha;
      g.fillStyle = 'rgba(8,8,14,0.60)';  // readability plate
      g.fillRect(5, fy - 1, fw, 9);
      g.fillStyle = ft.tint || '#d8d8e8';
      g.fillText(ft.msg, 7, fy);
      g.globalAlpha = 1;
      chrome.feed.push({ msg: ft.msg, tint: ft.tint || null, alpha });
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

  // ---- ground decor (world space; deterministic hash field) ------------------
  // WAVE-23 (#2, Sk408 directive): the old 1-2px speckle read as "scanline
  // noise / hieroglyphs". Same deterministic field, same culling, same
  // palettes — but every piece is now LARGE and COMPOSED (a stone PAIR, a
  // tuft CLUSTER, a slab PLATE with seams, an occasional boulder landmark)
  // so the floor reads as deliberate level art. Still subtle: decor sits
  // under entities and never competes with the play pieces.
  drawGround(g, seed, cam, theme) {
    const CELL = C.GROUND.CELL, DENS = C.GROUND.DENSITY, B = C.GROUND.BOUND;
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
        if (wx < -B || wx > B || wy < -B || wy > B) continue;   // arena walls
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        const kind = cellRand(cx, cy, seed, 4);
        if (kind < 0.24) {            // tuft cluster: 5 blades + dirt specks
          g.fillStyle = pal.tuft;
          g.fillRect(x, y, 1, 4); g.fillRect(x + 2, y - 1, 1, 5); g.fillRect(x + 5, y + 1, 1, 3);
          g.fillRect(x + 7, y, 1, 4);
          g.fillStyle = pal.tuft2;
          g.fillRect(x + 1, y + 1, 1, 3); g.fillRect(x + 3, y, 1, 4); g.fillRect(x + 6, y + 1, 1, 3);
          g.fillStyle = pal.crack;
          g.fillRect(x - 2, y + 4, 2, 1); g.fillRect(x + 6, y + 5, 2, 1);
        } else if (kind < 0.46) {     // stone pair: big rock + pebble sidekick
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 1, 6, 4); g.fillRect(x + 1, y, 4, 1);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 1, 3, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 7, y + 3, 3, 2);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 7, y + 3, 1, 1);
        } else if (kind < 0.62) {     // crack run: long stepping fissure
          g.fillStyle = pal.crack;
          g.fillRect(x, y, 3, 1); g.fillRect(x + 3, y + 1, 3, 1); g.fillRect(x + 5, y + 2, 3, 1);
          g.fillRect(x + 8, y + 3, 2, 1); g.fillRect(x + 4, y + 3, 2, 1);
        } else if (kind < 0.92) {     // slab plate: 13x13 floor tile, notched
          g.fillStyle = pal.slab;     // corners + a seam — reads as paving
          g.fillRect(x + 1, y, 11, 13); g.fillRect(x, y + 1, 13, 11);
          g.fillStyle = pal.base;     // knock the corners off the square
          g.fillRect(x, y, 1, 1); g.fillRect(x + 12, y, 1, 1);
          g.fillRect(x, y + 12, 1, 1); g.fillRect(x + 12, y + 12, 1, 1);
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
    const RIM = 600, T = 12;             // clamp edge (matches main.js) + wall px
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
