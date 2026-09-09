// HORDES — weather system (Sk408 request: rain, sun, wind, clouds,
// moonlight, snow). One weather is rolled per run; it drives a fillRect-only
// particle/tint layer in render.js and small, fairness-safe gameplay
// modifiers applied by main.js in the existing loops.
//
// Purity contract: this module never touches the DOM or game state beyond
// the weather object it owns. rollWeather(rng) and initWeather(id, seed) are
// deterministic for injected rng/seed; update(state, weather, dt) only
// advances weather.time and the particle field (stored + wrapped in a
// view-sized bounded space — render.js camera-anchors at draw time by
// subtracting the camera offset and re-wrapping, so the same bounded,
// deterministic field reads as world-space rain/snow/wind/fireflies).
import { CONFIG as C } from './config.js';

// ---------- types table ------------------------------------------------------
// weight: relative roll weight (CLEAR 90 of 300 = 30%; the six weathers split
// the remaining 70% evenly at 35 each). mods: gameplay modifiers —
//   enemySpeedMult — multiplies every enemy's move speed (SNOW 0.9)
//   fireRangeMult  — multiplies each shooter's base fireRange (RAIN 0.85)
//   projDrift      — wind vector pushes projectiles mid-flight (WIND)
//   manaRegenMult  — multiplies base mana regen (MOONLIGHT 1.1)
//   xpMult         — multiplies gem XP (SUNNY 1.1)
// All subtle by design: weather should color a run, never decide it.
export const WEATHER_TYPES = {
  CLEAR: {
    id: 'CLEAR', name: 'Clear', weight: 90,
    particles: null, tint: null,
    wind: { x: 0, y: 0 }, mods: {},
  },
  RAIN: {
    id: 'RAIN', name: 'Rain', weight: 35,
    particles: { count: 70, vx: 20, vy: 230, size: 4, color: '#5a8ad8', shape: 'streak' },
    tint: 'rgba(40,60,110,0.18)',
    wind: { x: 20, y: 0 },
    mods: { fireRangeMult: 0.85 },   // wet spitters/warlocks shoot shorter
  },
  SNOW: {
    id: 'SNOW', name: 'Snow', weight: 35,
    particles: { count: 45, vx: 6, vy: 26, sway: 14, size: 1, color: '#e8f0ff', shape: 'flake' },
    tint: 'rgba(200,220,255,0.10)',
    wind: { x: 6, y: 0 },
    mods: { enemySpeedMult: 0.9 },   // the horde trudges
  },
  WIND: {
    id: 'WIND', name: 'Wind', weight: 35,
    particles: { count: 16, vx: 200, vy: 0, size: 4, color: '#aebfd0', shape: 'dash' },
    tint: null,
    wind: { x: 40, y: 0 },           // sign rolled per run in initWeather
    mods: { projDrift: true },       // projectiles (both sides) drift mid-flight
  },
  CLOUDY: {
    id: 'CLOUDY', name: 'Cloudy', weight: 35,
    particles: null, bands: true,    // render draws scrolling shadow bands
    tint: 'rgba(30,30,45,0.22)',
    wind: { x: 0, y: 0 },
    mods: {},                        // purely cosmetic
  },
  SUNNY: {
    id: 'SUNNY', name: 'Sunny', weight: 35,
    particles: null, rays: true,     // render draws corner sun + rays
    tint: 'rgba(255,200,80,0.10)',
    wind: { x: 0, y: 0 },
    mods: { xpMult: 1.1 },           // gems shine brighter
  },
  MOONLIGHT: {
    id: 'MOONLIGHT', name: 'Moonlight', weight: 35,
    particles: { count: 9, wander: true, color: '#d8ffb0', shape: 'firefly' },
    tint: 'rgba(80,110,200,0.16)',
    wind: { x: 0, y: 0 },
    mods: { manaRegenMult: 1.1 },    // the moon feeds mana
  },
};

// ---------- roll + init ------------------------------------------------------
// Weighted pick over the table (insertion order = cum weight order:
// CLEAR, RAIN, SNOW, WIND, CLOUDY, SUNNY, MOONLIGHT). rng injectable.
export function rollWeather(rng = Math.random) {
  const entries = Object.values(WEATHER_TYPES);
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) { if ((r -= e.weight) < 0) return e.id; }
  return 'CLEAR';
}

// Deterministic seeded rng (mulberry32) so a run's particle field replays
// identically for a given seed (tests rely on this).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-run weather instance: definition + seeded particle field + the signed
// wind vector (WIND blows left or right, decided by the seed).
export function initWeather(id, seed = 1) {
  const def = WEATHER_TYPES[id] || WEATHER_TYPES.CLEAR;
  const rng = mulberry32(seed);
  const w = {
    id: def.id, def,
    time: 0,
    windX: def.wind.x ? def.wind.x * (rng() < 0.5 ? -1 : 1) : 0,
    particles: [],
  };
  if (def.particles) {
    for (let i = 0; i < def.particles.count; i++) {
      w.particles.push({
        x: rng() * C.VIEW_W,
        y: rng() * C.VIEW_H,
        phase: rng() * Math.PI * 2,
        size: def.particles.shape === 'flake' ? (i % 3 === 0 ? 2 : 1) : def.particles.size,
      });
    }
  }
  return w;
}

// ---------- per-frame advance -------------------------------------------------
// Screen-space particle field. Falling kinds wrap top<->bottom; horizontal
// kinds wrap left<->right; fireflies wander on lissajous paths (no rng at
// runtime — fully deterministic given the seed).
export function update(state, weather, dt) {
  if (!weather || !weather.def.particles) { if (weather) weather.time += dt; return weather; }
  const P = weather.def.particles;
  const sgn = weather.windX < 0 ? -1 : 1;
  weather.time += dt;
  for (const p of weather.particles) {
    if (P.wander) {           // MOONLIGHT fireflies
      p.x += Math.cos(weather.time * 0.7 + p.phase) * 9 * dt;
      p.y += Math.sin(weather.time * 0.5 + p.phase) * 7 * dt;
    } else if (P.shape === 'dash') {   // WIND streaks: fast horizontal
      p.x += P.vx * sgn * dt;
      p.y += Math.sin(weather.time * 3 + p.phase) * 6 * dt;
    } else {                           // RAIN / SNOW: falling
      p.x += (P.vx * sgn + (P.sway ? Math.cos(weather.time * 1.5 + p.phase) * P.sway : 0)) * dt;
      p.y += P.vy * dt;
    }
    // Wrap within the view (particles are screen-space).
    if (p.y > C.VIEW_H + 4) p.y -= C.VIEW_H + 8;
    if (p.y < -4) p.y += C.VIEW_H + 8;
    if (p.x >= C.VIEW_W) p.x -= C.VIEW_W;
    if (p.x < 0) p.x += C.VIEW_W;
  }
  return weather;
}

// ---------- modifier accessors (main.js hooks) --------------------------------
// Merged-with-defaults mods for the active weather (null-safe: menus boot
// before the first run rolls one).
export function mods(weather) {
  return (weather && weather.def && weather.def.mods) || {};
}

// Wind vector applied to projectile positions each frame (px/s, screen x).
export function windDrift(weather) {
  return { x: (weather && weather.windX) || 0, y: 0 };
}
