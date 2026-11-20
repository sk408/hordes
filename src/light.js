// R6 LIGHT: glow and a light layer (drawing only).
//
// What it does. The floor, the buildings and the props lie under a thin
// darkness with holes of light cut into it; every actor, pickup, shot and
// effect is drawn ABOVE the darkness, so nothing a player needs is ever
// darkened by it. The dark stages (Void Reach, Cinder Maw, Blood Rust) are
// dark by day; every stage darkens as the run's light turns to night (one
// value per wave theme, see NIGHT). Light comes from the hero (always), lit
// windows, fires, braziers and lanterns (found in each building's and prop's
// own pixels), the site braziers, the portal, rich gems, shots, and the ember
// cracks and rifts of the ground. Glows are cached soft sprites drawn added
// over the floor; an enemy shot wears a red-orange halo under its orb.
//
// Rules this module keeps:
//   * Nothing here writes game state or draws a random number: a seed plays
//     the same with the light on, low or off. Flicker reads the sim clock
//     (state.time), so 60 Hz and 120 Hz draw the same picture; reduced motion
//     has no flicker.
//   * The contrast floor (see STAGE_DARK): at its darkest the layer keeps
//     every thing on the ground at the stage keys' bar.
//   * Cost: one small canvas (LIGHT_W x LIGHT_H) composed once a frame, one
//     cached hole sprite, one cached glow sprite per colour; nothing per pixel
//     in script. The governor steps the lighting down when frames get slow.
import { CONFIG as C } from './config.js';
import { STAGE_GROUND_PALETTES, groundIsLight, relLum } from './world_ground.js';
import { STAGE_BUILDINGS } from './stage_buildings.js';
import { STAGE_PROPS } from './stage_props.js';
import { scratchCanvas } from './sprite_cache.js';
import { richStep } from './entities.js';
import { ArenaMemo, ARENA, ease, drawArenaFloor, drawCracks, crackLights } from './finale_arena.js';

// ---- levels and the setting ----------------------------------------------------
// 2 ON: the layer and every glow. 1 LOW: the darkness with its holes of light
// and the threats' halos; no added glow (the costly part), no holes for the
// player's own shots. 0 OFF: today's picture, nothing drawn.
export const LIGHT_LEVELS = ['OFF', 'LOW', 'ON'];
export const KEY_LIGHTING = 'hordes_lighting';
export function lightingPref(store) {
  let v = null;
  try { v = store && store.getItem(KEY_LIGHTING); } catch { v = null; }
  return LIGHT_LEVELS.includes(v) ? v : 'ON';
}
export function nextLightingPref(v) {
  // ON -> LOW -> OFF -> ON
  return v === 'ON' ? 'LOW' : v === 'LOW' ? 'OFF' : 'ON';
}

// ---- the night ---------------------------------------------------------------
// How far into the night each wave theme is (0 day, 1 deepest night), by the
// theme's place in CONFIG.GROUND.THEMES (the wave number picks it). A stage
// lasts two waves, so a run walks day, dusk, night, deep night, dawn, morning.
export const NIGHT = [0, 0.35, 0.8, 1, 0.55, 0.15];
// A new wave's light comes in over this many sim seconds.
export const NIGHT_BLEND_S = 8;
export function nightOf(waveNum) {
  const n = NIGHT.length;
  return NIGHT[((Math.max(1, waveNum | 0) - 1) % n + n) % n];
}
// The night at sim time `time` in a wave that began at `waveStart`.
export function nightAt(waveNum, time, waveStart) {
  const now = nightOf(waveNum);
  if (!((waveNum | 0) > 1)) return now;
  const k = Math.max(0, Math.min(1, ((time || 0) - (waveStart || 0)) / NIGHT_BLEND_S));
  const was = nightOf((waveNum | 0) - 1);
  return was + (now - was) * k;
}

// The darkness of each stage: its colour, its alpha by day and at the deepest
// night (before the cap). The dark stages are dark by day; the light ones are
// as they always were by day and turn blue at night.
// THE FLOOR the layer never goes under: at the darkest it can be (`night`),
// every thing on the ground that is not lit by its own light still reads by
// the stage keys' bar (tools/stage_keys_measure.mjs: by its body or by its
// edge, 3:1, the horde as drawn 2.75:1, the chest 2.2:1) against every floor
// tone of the stage under every wave light. The hero, the enemy shots and the
// portal carry their own light (a hole in the darkness) and are not darkened
// behind. The night values are the largest alpha that holds, less 0.01,
// computed and pinned by test/test_light.mjs. On the light floors the gems
// set the limit; on the dark floors the darkness is darker than the floor, so
// a body only gains (the alpha is chosen by eye there).
export const STAGE_DARK = {
  // The two mid floors take a lighter blue: the floor stops their dark early,
  // so their night is more a change of colour than of light.
  VERDANT_HOLLOW: { col: '#2c3e68', day: 0, night: 0.19 },
  ASHEN_WASTE: { col: '#2c3e68', day: 0, night: 0.16 },
  SNOWFIELD: { col: '#1a2440', day: 0, night: 0.5 },
  BONE_DESERT: { col: '#1a2440', day: 0, night: 0.41 },
  WHITEOUT: { col: '#121a32', day: 0, night: 0.6 },
  BLOOD_RUST: { col: '#0c0305', day: 0.32, night: 0.55 },
  VOID_REACH: { col: '#040209', day: 0.42, night: 0.62 },
  CINDER_MAW: { col: '#050202', day: 0.42, night: 0.62 },
};

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
// `top` laid over `under` at alpha a (what the canvas does, in sRGB).
export function over(under, top, a) {
  const u = hexRgb(under), t = hexRgb(top);
  return rgbHex([u[0] + (t[0] - u[0]) * a, u[1] + (t[1] - u[1]) * a, u[2] + (t[2] - u[2]) * a]);
}
export function contrast(a, b) {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// The darkness now: { col, a } for a stage at night `night` (0..1).
export function ambientFor(stage, night) {
  const id = STAGE_DARK[stage] ? stage : 'VERDANT_HOLLOW';
  const D = STAGE_DARK[id];
  const n = Math.max(0, Math.min(1, night || 0));
  // glare: added light on a pale floor saturates to white, so it is held back there.
  return { col: D.col, a: D.day + (D.night - D.day) * n, pool: poolStrength(id), glare: groundIsLight(id) ? 0.6 : 1 };
}
// How strongly a light's pool may brighten the floor (0..1). A dark floor's
// actors read by their body colour, so the pools must not lift it to a mid
// tone: the lighter the dark floor, the weaker its pools (Blood Rust's are
// weakest). A light floor's pools only show in its night.
export function poolStrength(stage) {
  const id = STAGE_DARK[stage] ? stage : 'VERDANT_HOLLOW';
  if (groundIsLight(id)) return 1;
  const L = relLum(STAGE_GROUND_PALETTES[id].base);
  return Math.max(0.3, Math.min(1, (0.03 - L) / 0.02));
}

// ---- light sources in the art -------------------------------------------------
// The colours in the building and prop art that give light, and the light's
// colour. Fire is amber, not red-orange (red-orange means danger).
export const EMISSIVE = {
  '#ffd54a': '#ffc25a',   // lit windows, lamp flames
  '#fff2b0': '#ffd88a',   // a lantern's hot core
  '#e8481e': '#ff9a40',   // embers and fire bowls
  '#9e7fff': '#9a7cff',   // the void's violet lamps
};
const designCache = new Map();
// Group the glowing pixels of a design into lights: [{ dx, dy, r, col, a }]
// relative to the blit origin. cells: [{ x, y, w, h, col }].
function clusterLights(cells, maxLights) {
  const groups = [];
  for (const c of cells) {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let g = groups.find((q) => Math.abs(q.cx - cx) <= 20 && Math.abs(q.cy - cy) <= 20 && q.col === c.col);
    if (!g) { g = { sx: 0, sy: 0, area: 0, cx, cy, col: c.col }; groups.push(g); }
    const ar = c.w * c.h;
    g.sx += cx * ar; g.sy += cy * ar; g.area += ar;
    g.cx = g.sx / g.area; g.cy = g.sy / g.area;
  }
  groups.sort((p, q) => q.area - p.area);
  return groups.slice(0, maxLights).map((g) => ({
    dx: Math.round(g.cx), dy: Math.round(g.cy),
    r: Math.round(Math.min(46, 16 + Math.sqrt(g.area) * 2.2)),
    col: EMISSIVE[g.col], a: Math.min(1, 0.45 + Math.sqrt(g.area) * 0.05),
  }));
}
export function designLights(kind) {
  if (designCache.has(kind)) return designCache.get(kind);
  let out = [];
  const b = STAGE_BUILDINGS[kind];
  const pr = STAGE_PROPS[kind];
  if (b) {
    const cells = [];
    for (const [dx, dy, w, h, pi] of b.rects) {
      const col = String(b.palette[pi] || '').toLowerCase();
      if (EMISSIVE[col]) cells.push({ x: dx, y: dy, w, h, col });
    }
    out = clusterLights(cells, 4);
  } else if (pr) {
    const grid = pr.frames[0], cells = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const col = String(pr.palette[grid[y][x]] || '').toLowerCase();
        if (grid[y][x] && EMISSIVE[col]) cells.push({ x, y, w: 1, h: 1, col: EMISSIVE[col] === EMISSIVE['#fff2b0'] ? '#ffd54a' : col });
      }
    }
    out = clusterLights(cells, 1).map((l) => ({ ...l, r: Math.max(l.r, 30), fire: true }));
  }
  designCache.set(kind, out);
  return out;
}

// Light colours of the things that move.
export const GLOW = {
  hero: '#ffe2c8',        // warm white, the hero's own
  enemyShot: '#ff4a1e',   // red-orange: danger
  portal: '#3ee8cc',      // cyan-teal: reward
  brazier: '#ffb040',     // a site brazier's fire
  shrine: '#7ad0ff',
  shot: '#ffd75e',        // the player's shots: gold (not red-orange)
  steel: '#b8e0ff',       // boomerang, javelin, ricochet
  fire: '#ffa040',        // firepatch, ember
  arcane: '#c8a0ff',      // seeker
};
function shotGlowColour(p) {
  switch (p.kind) {
    case 'firepatch': case 'ember': return GLOW.fire;
    case 'boomerang': case 'javelin': case 'ricochet': return GLOW.steel;
    case 'seeker': return GLOW.arcane;
    case 'mine': return null;
    default: return GLOW.shot;
  }
}
// Caps on the moving lights per frame (a crowd of shots must not cost more).
export const CAP = { enemyShots: 90, shots: 120, effects: 40, pickups: 30 };

// Every light of this frame, in the world layer's screen coordinates (world
// minus camera). level: 2 ON, 1 LOW. Pure: reads state, writes nothing.
//   holes: [{ x, y, r, a }]          cut into the darkness
//   glows: [{ x, y, r, col, a, op }] drawn over the floor ('lighter' or 'source-over')
export function gatherLights(state, cam, landmarks, level, reduced) {
  const holes = [], glows = [];
  const t = state.time || 0;
  const flick = (x, y) => (reduced ? 1 : 1 + 0.06 * Math.sin(t * 9 + x * 0.37 + y * 0.21));
  const p = state.player;
  if (p) {
    const x = p.x - cam.x, y = p.y - cam.y;
    holes.push({ x, y, r: 78, a: 1 });
    glows.push({ x, y, r: 70, col: GLOW.hero, a: 0.1, op: 'lighter', pool: true });
  }
  for (const lm of landmarks || []) {
    const L = designLights(lm.kind);
    for (const l of L) {
      const x = lm.x - cam.x + l.dx, y = lm.y - cam.y + l.dy;
      const f = l.fire ? flick(x, y) : 1;
      holes.push({ x, y, r: l.r * 1.6 * f, a: 1 });
      glows.push({ x, y, r: l.r * f, col: l.col, a: l.a * 0.42, op: 'lighter' });
      glows.push({ x, y: y + 6, r: l.r * 1.8 * f, col: l.col, a: l.a * 0.2, op: 'lighter', pool: true });
    }
  }
  for (const s of state.sites || []) {
    if (s.state === 'spent') continue;
    const x = s.x - cam.x, y = s.y - cam.y;
    if (s.kind === 'brazier' && !s.urn) {
      const f = flick(x, y);
      holes.push({ x, y: y - 10, r: 64 * f, a: 1 });
      glows.push({ x, y: y - 10, r: 34 * f, col: GLOW.brazier, a: 0.5, op: 'lighter' });
      glows.push({ x, y, r: 72 * f, col: GLOW.brazier, a: 0.3, op: 'lighter', pool: true });
    } else if (s.kind === 'shrine') {
      holes.push({ x, y: y - 10, r: 40, a: 0.8 });
      glows.push({ x, y: y - 12, r: 20, col: GLOW.shrine, a: 0.3, op: 'lighter' });
    }
  }
  const po = state.portal;
  if (po) {
    const grow = Math.min(1, (po.age || 0) / 0.6);
    const x = po.x - cam.x, y = po.y - cam.y;
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
    holes.push({ x, y, r: (70 + 10 * pulse) * grow, a: 1 });
    glows.push({ x, y, r: (44 + 6 * pulse) * grow, col: GLOW.portal, a: 0.55, op: 'lighter' });
    glows.push({ x, y, r: 84 * grow, col: GLOW.portal, a: 0.3, op: 'lighter', pool: true });
  }
  for (const gm of state.gems || []) {
    if (!richStep(gm, C.FLOOR.RICH_XP)) continue;
    holes.push({ x: gm.x - cam.x, y: gm.y - cam.y, r: 22, a: 0.7 });
  }
  // Chests and potions carry a little light of their own: on a pale floor at
  // night their dark outline reads against the floor as it does by day.
  let n = 0;
  for (const ch of state.chests || []) {
    if (n++ >= CAP.pickups) break;
    holes.push({ x: ch.x - cam.x, y: ch.y - cam.y, r: 36, a: 1 });
  }
  for (const d of state.drops || []) {
    if (n++ >= CAP.pickups) break;
    holes.push({ x: d.x - cam.x, y: d.y - cam.y, r: 28, a: 1 });
  }
  // On a dark floor an enemy shot reads by its bright body against the dark,
  // so it carries a shade: a soft dark disc laid under its halo. Where a fire
  // or a glowing crack lights the floor, the shade puts the dark back behind
  // the shot (a lit floor must never hide a threat).
  // Only where the pools can lift the floor: Blood Rust's pools are held weak
  // (poolStrength), its floor stays dark, and a shade there would only show as
  // a smudge round each shot.
  const stId = STAGE_DARK[state.stage] ? state.stage : 'VERDANT_HOLLOW';
  const shadeOn = !groundIsLight(stId) && poolStrength(stId) > 0.5;
  const shades = [];
  n = 0;
  for (const s of state.enemyShots || []) {
    if (n++ >= CAP.enemyShots) break;
    const x = s.x - cam.x, y = s.y - cam.y;
    const big = s.kind === 'bolt' || s.kind === 'maw';
    holes.push({ x, y, r: big ? 30 : 24, a: 0.9 });
    if (shadeOn) shades.push({ x, y, r: big ? SHADE.bigR : SHADE.r });
    glows.push({ x, y, r: big ? 13 : 10, col: GLOW.enemyShot, a: 0.6, op: 'source-over' });
    glows.push({ x, y, r: big ? 30 : 24, col: GLOW.enemyShot, a: 0.22, op: 'lighter', pool: true });
  }
  if (level >= 2) {
    n = 0;
    for (const q of state.projectiles || []) {
      const col = shotGlowColour(q);
      if (!col) continue;
      if (n++ >= CAP.shots) break;
      const x = q.x - cam.x, y = q.y - cam.y;
      holes.push({ x, y, r: 16, a: 0.6 });
      glows.push({ x, y, r: 8, col, a: 0.3, op: 'lighter' });
    }
    // The player's weapon effects: a flash of their own colour while they
    // last, fading with their age (sim state), weaker than a threat's halo.
    n = 0;
    for (const fx of state.effects || []) {
      const col = effectGlowColour(fx);
      if (!col) continue;
      const k = 1 - Math.max(0, Math.min(1, (fx.age || 0) / (fx.ttl || 1)));
      if (fx.kind === 'zap') {
        for (const q of fx.points || []) {
          if (n++ >= CAP.effects) break;
          glows.push({ x: q.x - cam.x, y: q.y - cam.y, r: 9, col, a: 0.32 * k, op: 'lighter' });
        }
      } else if (fx.kind === 'beam') {
        const t = 1 - k, dir = fx.from + (fx.to - fx.from) * t;
        const len = fx.len || 0, steps = Math.min(6, Math.max(1, Math.round(len / 40)));
        for (let i = 1; i <= steps; i++) {
          if (n++ >= CAP.effects) break;
          const d = (i / steps) * len;
          glows.push({ x: fx.x + Math.cos(dir) * d - cam.x, y: fx.y + Math.sin(dir) * d - cam.y, r: 12, col, a: 0.3 * k, op: 'lighter' });
        }
      } else if (fx.kind === 'scythe_arc') {
        if (n++ >= CAP.effects) break;
        const r = (fx.radius || 40) * 0.55;
        glows.push({ x: fx.x + Math.cos(fx.dir || 0) * r - cam.x, y: fx.y + Math.sin(fx.dir || 0) * r - cam.y, r: Math.min(30, r), col, a: 0.3 * k, op: 'lighter' });
      } else if (fx.kind === 'orbit') {
        if (n++ >= CAP.effects) break;
        glows.push({ x: fx.x - cam.x, y: fx.y - cam.y, r: 8, col, a: 0.3, op: 'lighter' });
      } else {
        // A ring (nova, pulse, blast, magnet): light where the ring has reached.
        if (n++ >= CAP.effects) break;
        const r = Math.max(12, Math.min(60, (fx.radius || 24) * (0.35 + 0.65 * (1 - k))));
        glows.push({ x: fx.x - cam.x, y: fx.y - cam.y, r, col, a: 0.28 * k, op: 'lighter' });
      }
    }
  }
  return { holes, glows, shades };
}
// The colour a weapon effect lights the floor with, or null (an enemy's
// effect, a spark too small to light anything). Never red-orange.
function effectGlowColour(fx) {
  if (fx.evo === 'fire') return GLOW.fire;
  if (fx.evo === 'sun') return GLOW.shot;
  if (fx.evo === 'meteor') return GLOW.arcane;
  switch (fx.kind) {
    case 'nova': case 'zap': case 'orbit': case 'scythe_arc': return GLOW.steel;
    case 'nova_pulse': return GLOW.arcane;
    case 'beam': case 'mine_blast': case 'magnet': return GLOW.shot;
    case 'rewrite_boom': return GLOW.fire;
    default: return null;
  }
}
// The shade under an enemy shot on a dark floor: radius (spit, bolt) and the
// alpha of its flat middle, which reaches past the orb's rim.
export const SHADE = { col: '#050203', r: 16, bigR: 20, core: 0.88 };

// ---- the sprites -------------------------------------------------------------
const SPR = 64;
let holeSprite = null;
const glowSprites = new Map();
function radial(col, stops) {
  const cv = scratchCanvas(SPR, SPR);
  if (!cv) return null;
  const g = cv.getContext && cv.getContext('2d');
  // A count-only canvas (the headless probes) has no gradients: no sprite.
  if (!g || typeof g.createRadialGradient !== 'function') return null;
  const gr = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
  if (!gr) return null;
  const [r, gg, b] = hexRgb(col);
  for (const [at, a] of stops) gr.addColorStop(at, 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')');
  g.fillStyle = gr;
  g.fillRect(0, 0, SPR, SPR);
  return cv;
}
// A hole: full light in the middle half, then a soft edge.
function hole() {
  if (!holeSprite) holeSprite = radial('#ffffff', [[0, 1], [0.45, 0.85], [0.75, 0.35], [1, 0]]);
  return holeSprite;
}
function glow(col) {
  let s = glowSprites.get(col);
  if (!s) {
    s = radial(col, [[0, 0.6], [0.3, 0.35], [0.65, 0.1], [1, 0]]);
    if (s) glowSprites.set(col, s);
  }
  return s;
}
// A pool: the light a source throws on the floor, flat in the middle.
function pool(col) {
  const k = 'pool' + col;
  let s = glowSprites.get(k);
  if (!s) {
    s = radial(col, [[0, 0.75], [0.35, 0.55], [0.7, 0.18], [1, 0]]);
    if (s) glowSprites.set(k, s);
  }
  return s;
}
// The shade under an enemy shot: flat dark in the middle, then a soft edge.
let shadeSprite = null;
function shade() {
  if (!shadeSprite) shadeSprite = radial(SHADE.col, [[0, SHADE.core], [0.5, SHADE.core], [0.8, 0.4], [1, 0]]);
  return shadeSprite;
}
export function lightSpriteCount() { return (holeSprite ? 1 : 0) + glowSprites.size; }

// ---- the layer ------------------------------------------------------------------
// The light canvas covers the world view plus a margin (screen shake), at a
// fixed small size whatever the screen or the zoom.
export const LIGHT_W = 128, LIGHT_H = 80;
// The glow canvas: half the view's size (glows are soft; smoothing does the rest).
export const GLOW_W = 240, GLOW_H = 150;
// The mid canvas a layer is smoothed into before it is scaled to the screen.
export const MID_W = 400, MID_H = 250;
const MARGIN = 10;
// The world rect the layers cover this frame (in the world layer's screen
// coordinates), snapped to a world grid (see compose).
export function lightRect(view, cam) {
  const bw = view.x1 - view.x0 + MARGIN * 2, bh = view.y1 - view.y0 + MARGIN * 2;
  const vw = bw * 16 / 15, vh = bh * 10 / 9;
  const stx = vw / 16, sty = vh / 10;
  const cx = cam ? cam.x || 0 : 0, cy = cam ? cam.y || 0 : 0;
  const x0 = Math.floor((view.x0 - MARGIN + cx) / stx) * stx - cx;
  const y0 = Math.floor((view.y0 - MARGIN + cy) / sty) * sty - cy;
  return { x0, y0, vw, vh, stx, sty };
}
export class LightLayer {
  constructor() {
    this.cv = null;
    this.gcv = null;
    this.mid = null;
    this.stats = { frames: 0, holes: 0, glows: 0, a: 0 };
    // R7 the finale arena (src/finale_arena.js): how far it has faded in, and
    // the Maw's arrival sting's clock while it holds the sim (main.js sets it).
    this.arena = new ArenaMemo();
    this.stingT = null;
    // The arena's floor and cracks are drawn at every level, so a step down
    // of the governor cannot save their cost. compose times them with this
    // clock (the renderer gives it the wall clock; never used for the picture)
    // into arenaMs, and the renderer takes that share out of the light's cost
    // the governor reads: the finale cannot push LIGHTING down for later.
    this.timer = null;
    this.arenaMs = 0;
  }
  // The arena's fade this frame (0..1). The renderer asks before the floor is
  // drawn (to pick the actors' floor style) and compose asks again; the memo
  // makes the second ask the same.
  arenaK(state) { return this.arena.at(state, this.stingT); }
  // Past half its fade the arena is a dark floor whatever the stage.
  arenaDark(state) { return this.arenaK(state) >= ARENA.DARK_OFF; }
  // The eased share shown (the weather's sky and particles fade by it).
  arenaEase(state) { return ease(this.arenaK(state)); }
  // Draw a small soft canvas over the view. A smooth upscale straight to the
  // screen is the slow path where the canvas is drawn without a GPU (2 ms a
  // layer at 1280x720 in headless Chrome); smoothing into a mid-size canvas
  // first and then scaling that up without smoothing costs a fraction, and the
  // steps (a third of a view pixel) do not show in a soft light.
  blitSoft(g, src, x, y, w, h) {
    if (!this.mid) this.mid = scratchCanvas(MID_W, MID_H);
    const m = this.mid;
    if (!m) { g.imageSmoothingEnabled = true; g.drawImage(src, x, y, w, h); return; }
    const mg = m.getContext('2d');
    mg.globalCompositeOperation = 'copy';
    mg.imageSmoothingEnabled = true;
    mg.drawImage(src, 0, 0, MID_W, MID_H);
    mg.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.drawImage(m, x, y, w, h);
  }
  // Compose the darkness and the glows over the floor drawn so far. `view` is
  // the renderer's worldView; `emits` the ground's glowing chunks
  // ([{ img, x, y, w, h }]). Returns what it drew (the test seam).
  // `mix` (optional, 0..2) is the level on its way: a step of the setting or
  // of the governor fades the top part in or out instead of popping.
  compose(g, state, cam, view, landmarks, emits, level, reduced, mix = null) {
    const out = { a: 0, holes: 0, glows: 0, shades: 0, drawn: false, glowCanvas: false };
    // R7 the finale arena: the floor goes to the void first (at every level:
    // with the light OFF the floor change alone carries it), and the cracks
    // are laid over the darkness below (they give their own light).
    const ak = this.arenaK(state), ae = ease(ak);
    out.arena = ak;
    const tm = ak > 0 && typeof this.timer === 'function' ? this.timer : null;
    this.arenaMs = 0;
    if (ak > 0) {
      const a0 = tm ? tm() : 0;
      out.arenaFloor = drawArenaFloor(g, view, state.stage, ae);
      if (tm) this.arenaMs += tm() - a0;
    }
    if (!(level > 0)) {
      if (ak > 0) {
        const a0 = tm ? tm() : 0;
        out.cracks = drawCracks(g, state, cam, view, ak, reduced);
        if (tm) this.arenaMs += tm() - a0;
      }
      return out;
    }
    // How much of the top step is shown (1 when no fade is running).
    const k = mix == null ? 1 : Math.max(0, Math.min(1, mix - (level - 1)));
    let night = nightAt(state.wave ? state.wave.num : 1, state.time || 0,
      state.wave ? (state.wave.endsAt || 0) - C.ESCALATION.WAVE_LENGTH : 0);
    const amb = ambientFor(state.stage, night);
    if (ak > 0) {
      // ...and the light to the Void Reach's deepest night.
      night += (1 - night) * ae;
      const v = ambientFor('VOID_REACH', 1), c0 = hexRgb(amb.col), c1 = hexRgb(v.col);
      amb.col = rgbHex(c0.map((c, i) => c + (c1[i] - c) * ae));
      amb.a += (v.a - amb.a) * ae;
      amb.pool += (v.pool - amb.pool) * ae;
      amb.glare += (v.glare - amb.glare) * ae;
      // The stage's own glowing cracks (Cinder Maw's embers) fade with its floor.
      if (emits && state.stage !== 'VOID_REACH') { this.emitA = 1 - 0.7 * ae; }
      else this.emitA = 1;
    } else this.emitA = 1;
    if (level === 1) amb.a *= k;
    out.a = amb.a; out.night = night; out.k = k;
    // A profiling seam (tools/capture_light.mjs bench): this.clock, when set,
    // times the steps into this.prof. Never set in the game.
    const ck = this.clock, t0 = ck ? ck() : 0;
    const L = gatherLights(state, cam, landmarks, level, reduced);
    if (ak > 0 && level >= 2) for (const w of crackLights(state, cam, view, ak, reduced)) L.glows.push(w);
    const t1 = ck ? ck() : 0;
    if (!this.cv) this.cv = scratchCanvas(LIGHT_W, LIGHT_H);
    const cv = this.cv;
    if (!cv || typeof g.drawImage !== 'function') return out;
    // The layers are pinned to the WORLD, not the screen: their cells sit on a
    // world grid, so when the camera pans a crack's glow stays on its crack
    // instead of being resampled at a new phase (a shimmer). One snap step is
    // a whole number of cells of both canvases and of the mid canvas
    // (W/16 = 8 light cells = 15 glow cells = 25 mid cells; H/10 the same).
    const { x0, y0, vw, vh } = lightRect(view, cam);
    out.rect = { x0, y0, vw, vh };
    const sx = LIGHT_W / vw, sy = LIGHT_H / vh;
    const H = hole();
    if (amb.a > 0.004 && H) {
      const lg = cv.getContext('2d');
      lg.globalCompositeOperation = 'source-over';
      lg.globalAlpha = 1;
      lg.clearRect(0, 0, LIGHT_W, LIGHT_H);
      const [r, gg, b] = hexRgb(amb.col);
      lg.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + amb.a.toFixed(3) + ')';
      lg.fillRect(0, 0, LIGHT_W, LIGHT_H);
      lg.globalCompositeOperation = 'destination-out';
      for (const h of L.holes) {
        const rx = h.r * sx, ry = h.r * sy;
        const cx = (h.x - x0) * sx, cy = (h.y - y0) * sy;
        if (cx + rx < 0 || cy + ry < 0 || cx - rx > LIGHT_W || cy - ry > LIGHT_H) continue;
        lg.globalAlpha = h.a;
        lg.drawImage(H, cx - rx, cy - ry, rx * 2, ry * 2);
        out.holes++;
      }
      if (level >= 2 && emits) {
        lg.globalAlpha = 0.85 * this.emitA;
        for (const e of emits) lg.drawImage(e.img, (e.x - x0) * sx, (e.y - y0) * sy, e.w * sx, e.h * sy);
      }
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = 'source-over';
      g.save();
      this.blitSoft(g, cv, x0, y0, vw, vh);
      g.restore();
      out.drawn = true;
    }
    const t2 = ck ? ck() : 0;
    // Glows. The added ones (pools, glows, the glowing cracks) are drawn into
    // one small glow canvas and that is added over the floor in one draw: the
    // cost of a full-screen blend is paid once, however many lights there are.
    // They show in the dark only (a light floor by day stays as it was). The
    // threats' halos are laid on one by one, at full strength, on any floor.
    const dark = Math.min(1, amb.a / 0.4);
    if (!this.gcv) this.gcv = scratchCanvas(GLOW_W, GLOW_H);
    const gc = this.gcv;
    const halos = [];
    // LOW draws no added glow at all (the darkness, its holes and the threats'
    // halos stay): it saves the glow canvas and its full-screen blend.
    if (gc && dark >= 0.02 && level >= 2) {
      const gg = gc.getContext('2d');
      const kx = GLOW_W / vw, ky = GLOW_H / vh;
      gg.globalCompositeOperation = 'source-over';
      gg.globalAlpha = 1;
      gg.clearRect(0, 0, GLOW_W, GLOW_H);
      gg.globalCompositeOperation = 'lighter';
      gg.imageSmoothingEnabled = true;
      if (level >= 2 && emits) {
        gg.globalAlpha = (0.15 + dark * 0.3) * this.emitA;
        for (const e of emits) gg.drawImage(e.img, (e.x - x0) * kx, (e.y - y0) * ky, e.w * kx, e.h * ky);
      }
      for (const w of L.glows) {
        if (w.op !== 'lighter') { halos.push(w); continue; }
        if (w.x + w.r < view.x0 || w.y + w.r < view.y0 || w.x - w.r > view.x1 || w.y - w.r > view.y1) continue;
        const s = w.pool ? pool(w.col) : glow(w.col);
        if (!s) continue;
        gg.globalAlpha = Math.min(1, w.a * dark * (w.pool ? amb.pool : 1) * amb.glare);
        gg.drawImage(s, (w.x - w.r - x0) * kx, (w.y - w.r - y0) * ky, w.r * 2 * kx, w.r * 2 * ky);
        out.glows++;
      }
      gg.globalAlpha = 1;
      gg.globalCompositeOperation = 'source-over';
      g.save();
      g.globalCompositeOperation = 'lighter';
      if (k < 1) g.globalAlpha = k;
      this.blitSoft(g, gc, x0, y0, vw, vh);
      g.restore();
      out.glowCanvas = true;
    } else {
      for (const w of L.glows) if (w.op !== 'lighter') halos.push(w);
    }
    // R7: the arena's cracks, over the darkness and its glow, under the threats.
    if (ak > 0) {
      const a0 = tm ? tm() : 0;
      out.cracks = drawCracks(g, state, cam, view, ak, reduced);
      if (tm) this.arenaMs += tm() - a0;
    }
    // On LOW the threats' shades and halos fade with the step; on ON they are full.
    const kt = level === 1 ? k : 1;
    g.save();
    g.imageSmoothingEnabled = true;
    const S = shade();
    if (S) {
      g.globalAlpha = kt;
      for (const w of L.shades) {
        if (w.x + w.r < view.x0 || w.y + w.r < view.y0 || w.x - w.r > view.x1 || w.y - w.r > view.y1) continue;
        g.drawImage(S, w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
        out.shades++;
      }
    }
    for (const w of halos) {
      if (w.x + w.r < view.x0 || w.y + w.r < view.y0 || w.x - w.r > view.x1 || w.y - w.r > view.y1) continue;
      const s = glow(w.col);
      if (!s) continue;
      g.globalAlpha = Math.min(1, w.a) * kt;
      g.drawImage(s, w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
      out.glows++;
    }
    g.restore();
    if (ck) { const t3 = ck(); this.prof = { gather: t1 - t0, dark: t2 - t1, glow: t3 - t2 }; }
    this.stats.frames++; this.stats.holes = out.holes; this.stats.glows = out.glows; this.stats.a = amb.a;
    return out;
  }
}

// ---- the governor -------------------------------------------------------------
// Watches the game's own frame time (the work of a frame, in ms) and steps the
// lighting down when frames are slow: ON -> LOW (fewer glows) -> OFF (no
// layer). It steps back up only after a long fast stretch, and each time a
// step up is followed soon by a step down, the next wait doubles: no flapping.
// Two signs of a slow frame: the whole frame's work (SLOW_MS), or the light's
// own cost (LIGHT_MS, measured round the compose call). The second is what
// tells a canvas drawn without a GPU (where the two full-screen blends cost
// 1.5 to 3 ms a frame, of which about half shows inside compose; the rest is
// paid when the frame is flushed) from one drawn on a GPU (a fraction of a
// ms). Headless Chrome without a GPU, minute-12 crowd: ON measures 1.2 to
// 1.6 ms here, LOW 0.7, so such a device settles at LOW. A step up needs the frame fast and the
// light at the level drawn now cheap (under UP_SHARE of LIGHT_MS).
export const GOV = {
  SLOW_MS: 14, FAST_MS: 7, LIGHT_MS: 0.9, UP_SHARE: 0.4,
  DOWN_AFTER_S: 2, UP_AFTER_S: 15, FLAP_S: 30, MAX_WAIT_S: 480,
};
// The governor's level is remembered (KEY_LIGHT_AUTO), so a slow device does
// not start at ON (and step down again) after every reload.
export const KEY_LIGHT_AUTO = 'hordes_lighting_auto';
export function lightAutoPref(store) {
  let v = null;
  try { v = store && store.getItem(KEY_LIGHT_AUTO); } catch { v = null; }
  return v === '0' ? 0 : v === '1' ? 1 : 2;
}
export class LightGovernor {
  constructor(level = 2) { this.reset(level); }
  reset(level = 2) {
    this.level = level; this.ema = 0; this.lightEma = 0; this.slowT = 0; this.fastT = 0;
    this.upWait = GOV.UP_AFTER_S; this.sinceUp = Infinity; this.steps = 0;
  }
  // One frame: its work in ms, its wall seconds, the player's setting (0..2),
  // and the light's own cost this frame in ms (optional).
  // Returns the level to draw at (never above the setting).
  sample(workMs, dtS, cap = 2, lightMs = 0) {
    const dt = Math.max(0, Math.min(0.25, dtS || 0));
    if (!(workMs >= 0)) workMs = 0;
    if (!(lightMs >= 0)) lightMs = 0;
    this.ema = this.ema ? this.ema * 0.9 + workMs * 0.1 : workMs;
    this.lightEma = this.lightEma * 0.9 + lightMs * 0.1;
    this.sinceUp += dt;
    if (this.ema > GOV.SLOW_MS || this.lightEma > GOV.LIGHT_MS) { this.slowT += dt; this.fastT = 0; }
    else if (this.ema < GOV.FAST_MS && this.lightEma < GOV.LIGHT_MS * GOV.UP_SHARE) { this.fastT += dt; this.slowT = 0; }
    else { this.slowT = 0; this.fastT = 0; }
    // A step clears the light's average: the next level is measured afresh.
    if (this.slowT >= GOV.DOWN_AFTER_S && this.level > 0) {
      this.level--; this.slowT = 0; this.fastT = 0; this.steps++; this.lightEma = 0;
      if (this.sinceUp < GOV.FLAP_S) this.upWait = Math.min(GOV.MAX_WAIT_S, this.upWait * 2);
    } else if (this.fastT >= this.upWait && this.level < 2) {
      this.level++; this.fastT = 0; this.sinceUp = 0; this.steps++; this.lightEma = 0;
    }
    return Math.min(this.level, cap);
  }
}

// The stages as STAGE_GROUND_PALETTES lists them (the test seam).
export const LIGHT_STAGES = Object.keys(STAGE_GROUND_PALETTES);
