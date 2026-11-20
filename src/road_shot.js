// HORDES - the road shot (R2). Before a stage change (the CONTINUE after
// waves 2 and 4), 1.5 seconds of the road the hero takes: the escape chase's
// road and camera, on the NEXT stage's ground and sky, with the stage's name.
// Pure: render(g, t, opts) is a function of the time; no clock, no
// Math.random. Drawn in the 480x300 view. main.js owns the clock, the skip
// and the seen count (kind 'road').
//
//   opts { scene: sceneFor(...), name: the stage's name, reduced, repeat }
import { buildScene } from './escape_cine.js';
import { drawStageRoad } from './escape_cine_art.js';

export const DURATION = 1.5;      // seconds, first viewing and repeat alike
export const STILL_T = 0.6;       // the frame a reduced-motion still card shows

export function durationOf() { return DURATION; }
export function isDone(t) { return t >= DURATION; }

// The picture's cast: the next stage, the run's seed and pilot, nobody chasing.
export function sceneFor({ seed, stage, character } = {}) {
  const s = buildScene({ seed, stage, character });
  s.horde = [];
  s.lungers = [];
  return s;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t, a, b) => clamp01((t - a) / (b - a));

// How dark the frame is at t: up from black, and down to black at the end.
export function blackAt(t) {
  return Math.max(1 - span(t, 0, 0.2), span(t, DURATION - 0.25, DURATION));
}

export function render(g, t, opts = {}) {
  if (!g || !opts.scene) return;
  if (opts.reduced) {
    drawStageRoad(g, opts.scene, STILL_T, opts.name || '', 1);
    return;
  }
  drawStageRoad(g, opts.scene, t, opts.name || '', span(t, 0.15, 0.5));
  const k = blackAt(t);
  if (k > 0) {
    g.globalAlpha = k;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 480, 300);
    g.globalAlpha = 1;
  }
}
