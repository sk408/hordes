// HORDES — pixel rendering. Sprites are pixel grids drawn with fillRect:
// no image assets, no drawImage — pure structured data.
import { CONFIG as C } from './config.js';
import { resolveLook, ELITE_LOOK } from './enemy_types.js';
import { SPRITES, BOSS_SPRITE, FLAME } from './sprites.js';
import { FINAL_BOSS_SPRITE } from './final_boss.js';

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
    canvas.width = C.VIEW_W;
    canvas.height = C.VIEW_H;
    this.ctx = canvas.getContext('2d');
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
    // Optional subtle scene tint for the theme (still under the entities).
    if (theme.tint) {
      g.fillStyle = theme.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // Gems.
    for (const gem of state.gems) {
      const x = gem.x - cam.x, y = gem.y - cam.y;
      if (x < -5 || y < -5 || x > C.VIEW_W + 5 || y > C.VIEW_H + 5) continue;
      g.fillStyle = '#3ef0c0';
      g.fillRect(x - 1, y - 2, 3, 4);
      g.fillRect(x - 2, y - 1, 5, 2);
    }

    // Potion drops: tiny bottles (red = health, blue = mana).
    for (const d of state.drops || []) {
      const x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y);
      if (x < -5 || y < -5 || x > C.VIEW_W + 5 || y > C.VIEW_H + 5) continue;
      g.fillStyle = d.kind === 'hp' ? '#ff5566' : '#4a8cff';
      g.fillRect(x - 2, y - 3, 4, 6);
      g.fillStyle = '#e8e8f0';
      g.fillRect(x - 1, y - 4, 2, 1);
    }

    // Chests: gold boxes that pulse; slide toward the player (main.js).
    for (const ch of state.chests || []) {
      const x = Math.round(ch.x - cam.x), y = Math.round(ch.y - cam.y);
      if (x < -12 || y < -12 || x > C.VIEW_W + 12 || y > C.VIEW_H + 12) continue;
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
      if (x < -5 || y < -5 || x > C.VIEW_W + 5 || y > C.VIEW_H + 5) continue;
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
      if (x < -20 || y < -30 || x > C.VIEW_W + 20 || y > C.VIEW_H + 30) continue;
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
      if (x < -30 || y < -30 || x > C.VIEW_W + 30 || y > C.VIEW_H + 30) continue;
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
      if (x < -5 || y < -5 || x > C.VIEW_W + 5 || y > C.VIEW_H + 5) continue;
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
      if (x < -8 || y < -8 || x > C.VIEW_W + 8 || y > C.VIEW_H + 8) continue;
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

    // Boss HP bar: full-width overlay at the top while a boss lives.
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

    // Weather layer (weather.js): camera-anchored particles + scene tint,
    // drawn OVER the scene so the run feels weathered. All fillRect.
    this.drawWeather(g, state.weather, cam);
  }

  // ---- ground decor (world space; deterministic hash field) ------------------
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
        const wx = cx * CELL + Math.floor(cellRand(cx, cy, seed, 2) * (CELL - 8));
        const wy = cy * CELL + Math.floor(cellRand(cx, cy, seed, 3) * (CELL - 8));
        if (wx < -B || wx > B || wy < -B || wy > B) continue;   // arena walls
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        const kind = cellRand(cx, cy, seed, 4);
        if (kind < 0.35) {            // tuft: 2-3 moss blades
          g.fillStyle = pal.tuft;
          g.fillRect(x, y, 1, 3); g.fillRect(x + 4, y + 1, 1, 2);
          g.fillStyle = pal.tuft2;
          g.fillRect(x + 2, y, 1, 3);
        } else if (kind < 0.65) {     // stone: small rock + lit top pixel
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 1, 4, 2); g.fillRect(x + 1, y, 2, 1);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y, 1, 1);
        } else if (kind < 0.85) {     // crack: stepping darker-than-bg dashes
          g.fillStyle = pal.crack;
          g.fillRect(x, y, 2, 1); g.fillRect(x + 3, y + 1, 2, 1); g.fillRect(x + 6, y + 2, 2, 1);
        } else {                      // slab: barely-lighter floor tile
          g.fillStyle = pal.slab;
          g.fillRect(x, y, 8, 8);
        }
      }
    }
  }

  // ---- weather rendering -----------------------------------------------------
  // Particles are STORED in a bounded view-sized field (weather.js — wrapped,
  // deterministic, unit-tested) but RENDERED camera-anchored: the camera
  // offset is applied and re-wrapped here, so rain falls past the player
  // instead of sliding with the screen. Cloud bands get a light parallax
  // (they're distant); the sun is celestial and stays screen-fixed.
  drawWeather(g, weather, cam) {
    if (!weather) return;
    const def = weather.def;
    const t = weather.time || 0;
    const wrapX = (v) => (((v - cam.x) % C.VIEW_W) + C.VIEW_W) % C.VIEW_W;
    const wrapY = (v) => (((v - cam.y) % C.VIEW_H) + C.VIEW_H) % C.VIEW_H;

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

    if (def.particles) {
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

    // Scene tint last (rgba overlay value from the type table).
    if (def.tint) {
      g.fillStyle = def.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
  }
}
