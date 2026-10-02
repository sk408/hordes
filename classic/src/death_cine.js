// HORDES — the death movie (G15, owner: "we also need a death movie if we
// don't have one").
//
// Structure copied from src/portal_cine.js (NOT its content): timeline-driven
// and PURE — render(g, t, cause) is a deterministic function of the wall-clock
// t (ms since cinematic start) and the recorded death cause, with no stored
// state, no randomness, no DOM, fillRect only, integer pixels throughout.
// main.js owns the rAF clock, the mode, the skip wiring and the hand-off back
// to the WAVE-26 payoff overlay that die() composed BEFORE the movie started.
//
// Beats (scene-ms on the 4200ms design timeline, played at CINE_SPEED 0.7):
//   BLOW      0..900     the moment of death; one hit-flash beat, no shake
//   COLLAPSE  900..2400  the horde closes in as silhouettes; the hero falls
//                        (a 2-frame collapse, integer px)
//   TAKEN     2400..3300 the hero dissolves INTO the horde (pixel dropout,
//                        the portal cine's dissolveU pattern); the horde
//                        darkens toward black
//   HANDOFF   3300..4200 fade out to black, then main.js reveals the payoff
//
// Public API (frozen for main.js): CINE_DURATION, PHASES, render(g, t, cause),
// isDone(t), phaseAt(t). DEATH_CINE_TEST is a read-only test seam.

// ---------- timeline ----------
export const CINE_SPEED = 0.7;                 // playback rate (portal cine's)
const SCENE_DURATION = 4200;                   // scene-ms design timeline
export const CINE_DURATION = Math.round(SCENE_DURATION / CINE_SPEED);   // 6000 wall-ms

const SCENE = {
  BLOW:     [0,    900],
  COLLAPSE: [900,  2400],
  TAKEN:    [2400, 3300],
  HANDOFF:  [3300, 4200],
};
const wall = (s) => Math.round(s / CINE_SPEED);

export const PHASES = {
  BLOW:     [wall(SCENE.BLOW[0]),     wall(SCENE.BLOW[1])],
  COLLAPSE: [wall(SCENE.COLLAPSE[0]), wall(SCENE.COLLAPSE[1])],
  TAKEN:    [wall(SCENE.TAKEN[0]),    wall(SCENE.TAKEN[1])],
  HANDOFF:  [wall(SCENE.HANDOFF[0]),  wall(SCENE.HANDOFF[1])],
};

export function isDone(t) { return t >= CINE_DURATION; }

export function phaseAt(t) {
  if (t < 0) return 'BLOW';
  if (t >= CINE_DURATION) return 'DONE';
  if (t >= PHASES.HANDOFF[0]) return 'HANDOFF';
  if (t >= PHASES.TAKEN[0]) return 'TAKEN';
  if (t >= PHASES.COLLAPSE[0]) return 'COLLAPSE';
  return 'BLOW';
}

// ---------- layout / palette ----------
const W = 480, H = 300;              // matches CONFIG.VIEW_W/H
const GROUND_Y = 240;                // ground surface line
const PX = 8;                        // ZOOM: 1 sprite pixel -> 8x8 screen px
const BG = '#0a0a10', GROUND = '#101018', GROUND_EDGE = '#181826';

// The hero, silhouette-forward, in this module's OWN palette (1=trim, 2=skin,
// 3=cloak, 4=armor). 12x12 standing; the collapse is a 2-frame fall authored
// as its own grids (kneel, then lying) — integer px, no rotation, no blur.
const HERO_STAND = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,1,1,4,4,3,3,0],
  [0,3,4,4,4,1,1,4,4,4,3,0],
  [0,0,3,4,4,4,4,4,4,3,0,0],
  [0,0,3,4,4,0,0,4,4,3,0,0],
  [0,0,0,3,4,0,0,4,3,0,0,0],
  [0,0,0,3,3,0,0,3,3,0,0,0],
];
const HERO_KNEEL = [                // collapse frame 1: buckled at the knees
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,3,3,4,4,4,4,4,3,3,0,0],
  [3,3,4,4,4,1,1,4,4,3,3,0],
  [3,4,4,4,4,4,4,4,4,4,3,0],
  [0,3,3,4,4,4,4,4,4,3,0,0],
  [0,0,3,3,3,3,3,3,3,3,0,0],
];
const HERO_FALLEN = [               // collapse frame 2: down, the horde takes him
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [3,3,2,2,1,1,4,4,4,3,3,0],
  [3,4,4,4,4,4,4,1,1,4,3,0],
  [0,3,3,4,4,4,4,4,4,3,0,0],
  [0,0,3,3,3,3,3,3,3,3,0,0],
];
const HERO_PALETTE = { 1: '#d8b04a', 2: '#c8a078', 3: '#5a3a20', 4: '#3a4a68' };

// The horde: one authored silhouette grid (7x8), painted a single dark color
// per frame that DARKENS toward black through TAKEN (the "taken" beat).
const HORDE = [
  [0,1,1,1,1,1,0],
  [1,1,1,1,1,1,1],
  [0,1,1,1,1,1,0],
  [0,1,2,1,1,2,0],
  [0,1,1,1,1,1,0],
  [0,1,1,3,1,1,0],
  [0,0,1,1,1,0,0],
  [0,0,1,0,1,0,0],
];
const HORDE_BODY = '#26263a', HORDE_LIT = '#4a4a66', HORDE_BLACK = '#050508';

const HERO_X = 216;                  // hero column centre (grid left edge)
const SILHOUETTES = 16;              // the closing ring
const WHITE = (a) => 'rgba(255,255,255,' + a.toFixed(3) + ')';
const BLACK = (a) => 'rgba(0,0,0,' + a.toFixed(3) + ')';

// ---------- deterministic hash (render.js cellRand pattern, fixed seed) -----
const CINE_SEED = 0x1de5ea15;
function h(i, salt) {
  let v = (CINE_SEED ^ salt) >>> 0;
  v = Math.imul(v ^ i, 0x27d4eb2d);
  v ^= v >>> 15; v = Math.imul(v, 0x85ebca6b); v ^= v >>> 13;
  return (v >>> 0) / 4294967296;
}
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// ---------- primitives ----------
function drawGridScaled(g, grid, palette, x, y, px, keepU, dropSalt) {
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (!v) continue;
      if (keepU > 0 && h(ry * 13 + rx, dropSalt) < keepU) continue;  // dissolve
      g.fillStyle = palette[v];
      g.fillRect(x + rx * px, y + ry * px, px, px);
    }
  }
}

// ---------- scene math (pure functions of scene-ms t) ----------------------
// Collapse progress across COLLAPSE (the hero's 2-frame fall rides on it).
function collapseU(t) { return clamp01((t - SCENE.COLLAPSE[0]) / 1000); }
// Taken progress across TAKEN: hero pixel dropout + the horde darkening.
function takenU(t) { return clamp01((t - SCENE.TAKEN[0]) / (SCENE.TAKEN[1] - SCENE.TAKEN[0])); }

// A silhouete's position at t: it starts on a wide ring around the hero
// (contact deaths start CLOSE — the hero was already surrounded), and closes
// to a tight press around the fallen hero by the end of COLLAPSE.
function silhouettePos(i, t, cause) {
  const tight = clamp01((t - 400) / 1600);      // starts just before COLLAPSE
  const a = h(i, 41) * Math.PI * 2;
  const rNear = 26 + h(i, 42) * 16;
  const rFar = 120 + h(i, 43) * 150;
  const r0 = (cause === 'contact') ? lerp(rNear, rNear + 26, h(i, 44)) : rFar;
  const r = lerp(r0, rNear, tight);
  return {
    x: Math.floor(HERO_X + 24 + Math.cos(a) * r * 1.35),   // wide in x
    y: Math.floor(GROUND_Y - HORDE.length * 3 + Math.sin(a) * r * 0.45),
  };
}

// The killing blow's flavor: 'shot' shows one projectile still in flight
// during BLOW; 'drain' shows a latcher already ON the hero; 'contact' and
// anything else read as the horde itself (already closing in).
const SHOT_T = 520;                  // scene-ms the projectile lands
function projectileX(t) {            // from the right edge to the hero
  const u = clamp01(t / SHOT_T);
  return Math.floor(lerp(W - 20, HERO_X + 36, u));
}

// ---------- render ----------
export function render(g, tRaw, cause) {
  // Clamp the WALL-CLOCK input, then map onto the design timeline at
  // CINE_SPEED (t is scene-ms below). Past the end is a black hold frame.
  const t = Math.min(SCENE_DURATION,
                     Math.max(0, Math.min(tRaw, CINE_DURATION)) * CINE_SPEED);
  const by = cause || 'unknown';

  // Sky + static embers (this movie is darker than the portal's).
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#161622';
  for (let i = 0; i < 16; i++) {
    g.fillRect(Math.floor(h(i, 11) * W), Math.floor(h(i, 12) * 130), 2, 2);
  }

  // Ground strip + fixed stones.
  g.fillStyle = GROUND;
  g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  g.fillStyle = GROUND_EDGE;
  g.fillRect(0, GROUND_Y, W, 2);
  for (let k = 0; k < 8; k++) {
    g.fillStyle = h(k, 21) < 0.5 ? '#12121c' : '#0c0c14';
    const sx = Math.floor(h(k, 22) * W), sy = GROUND_Y + 8 + Math.floor(h(k, 23) * 44);
    if (h(k, 24) < 0.6) { g.fillRect(sx, sy, 8, 2); }
    else { g.fillRect(sx, sy, 4, 3); }
  }

  // The horde silhouettes, closing in (drawn behind the hero, darkening
  // through TAKEN — a color lerp toward black, not an alpha cheat).
  const uTaken = takenU(t);
  const body = lerp(38, 5, uTaken) | 0, lit = lerp(74, 8, uTaken) | 0;
  const hordePal = { 1: 'rgb(' + body + ',' + body + ',' + (body + 10) + ')',
                     2: 'rgb(' + lit + ',' + lit + ',' + (lit + 12) + ')',
                     3: 'rgb(' + body + ',' + body + ',' + (body + 10) + ')' };
  for (let i = 0; i < SILHOUETTES; i++) {
    const pos = silhouettePos(i, t, by);
    drawGridScaled(g, HORDE, hordePal, pos.x, pos.y, 3, 0, 0);
  }

  // 'shot': the projectile still in flight during BLOW, then the impact.
  if (by === 'shot' && t < SCENE.BLOW[1]) {
    if (t < SHOT_T) {
      const px = projectileX(t);
      g.fillStyle = '#ffd0a0';
      g.fillRect(px, GROUND_Y - 52, 6, 3);
      g.fillStyle = '#a05028';
      g.fillRect(px + 8, GROUND_Y - 52, 10, 3);
    } else {
      const ub = clamp01((t - SHOT_T) / 260);
      g.fillStyle = '#ffe8c0';
      for (let i = 0; i < 6; i++) {
        const ang = h(i, 51) * Math.PI * 2;
        const r = 4 + ub * 22;
        g.fillRect(Math.floor(HERO_X + 36 + Math.cos(ang) * r),
                   Math.floor(GROUND_Y - 52 + Math.sin(ang) * r), 3, 3);
      }
    }
  }
  // 'drain': a latcher already clamped to the hero, pulsing through BLOW.
  if (by === 'drain' && t < SCENE.TAKEN[1]) {
    const pulse = Math.floor(t / 140) % 2 === 0 ? 4 : 2;
    g.fillStyle = '#6a2a3a';
    g.fillRect(HERO_X - 10, GROUND_Y - 58, 10, 12 + pulse);
    g.fillStyle = '#3a1622';
    g.fillRect(HERO_X - 10, GROUND_Y - 46, 10, 4);
  }

  // The hero: standing through BLOW, the 2-frame collapse through COLLAPSE,
  // then dissolving INTO the horde through TAKEN (pixel dropout, the portal
  // cine's dissolveU pattern).
  const uCol = collapseU(t);
  let grid = HERO_STAND;
  if (uCol >= 0.66) grid = HERO_FALLEN;
  else if (uCol >= 0.28) grid = HERO_KNEEL;
  const pxh = PX - Math.floor(uTaken * 3);
  const heroTop = GROUND_Y - HERO_STAND.length * pxh;
  if (uTaken < 1) {
    drawGridScaled(g, grid, HERO_PALETTE, HERO_X, heroTop, pxh, uTaken, 91);
  }

  // BLOW: ONE hit-flash beat on the hero, no shake (owner taste: shake and
  // slow-mo are rare and earned — death is neither).
  if (t >= 260 && t < 420) {
    g.fillStyle = WHITE(0.42);
    g.fillRect(HERO_X - 10, heroTop - 8, HERO_STAND.length * PX + 20,
               HERO_STAND.length * PX + 16);
  }
  // TAKEN: dissolving motes sinking DOWN into the horde (not rising — the
  // hero is taken, not transported).
  if (uTaken > 0) {
    const motes = 4 + Math.floor(uTaken * 14);
    for (let i = 0; i < motes; i++) {
      g.fillStyle = i % 2 === 0 ? '#8a7a5a' : '#4a4258';
      const mx = HERO_X + Math.floor(h(i, 95) * 96);
      const my = heroTop + 10 + ((t * 0.05 + h(i, 96) * 80) % 90);
      g.fillRect(mx, Math.floor(my), 3, 3);
    }
  }

  // HANDOFF: fade to black. main.js cuts to the payoff overlay at isDone.
  const fade = clamp01((t - SCENE.HANDOFF[0]) / (SCENE_DURATION - SCENE.HANDOFF[0]));
  if (fade > 0) { g.fillStyle = BLACK(fade); g.fillRect(0, 0, W, H); }
  if (tRaw >= CINE_DURATION) { g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); }
}

// ---------- test seam (read-only; mirrors CINE_TEST pattern) ----------------
export const DEATH_CINE_TEST = {
  SEED: CINE_SEED, SPEED: CINE_SPEED,
  COLORS: { BG, GROUND, HERO_CLOAK: HERO_PALETTE[3], HERO_ARMOR: HERO_PALETTE[4],
            HORDE_BODY, HORDE_LIT, HORDE_BLACK },
  ZOOM: PX,
  LAYOUT: { GROUND_Y, HERO_X },
  SILHOUETTES,
  CAUSES: ['contact', 'shot', 'drain', 'unknown'],
};
