// HORDES — V1b escape SPRITES (docs/briefs/V1B_ESCAPE_ART.md): the PURSUER
// (ground chaser from behind) and the FLIER (sine diver) in the game's OWN
// integer-pixel grid format — the same contract as src/art/* (grid rows of
// palette indices, 0 transparent, 1..9 keys; `rows` DERIVED, never authored),
// so test/test_art_lint.mjs verifies them with the SAME format checks.
//
// House rules honored: integer pixels only, no blur/smoothing; every hue
// reuses colors already in the escape's own palette family (render.js) or the
// game's gold (#ffd54a, src/art/portal.js key 7). PURSUER reads as a hunched
// REACHER lunging right (they only ever close from behind, running right);
// FLIER reads as a wide-winged diver. Both ship a 2-frame run/flap loop that
// actually differs (the lint pins it).
import { makeFrames } from '../art/format.js';

// Keys: 1 ink outline, 2 body, 3 shade, 4 eye.
const PURSUER_PALETTE = {
  1: '#140f12',
  2: '#c05050',
  3: '#7e3038',
  4: '#ffd54a',
};

// 12x14, hunched forward, arms reaching right. Frame A: legs extended in
// stride; frame B: legs gathered under (the two-beat sprint cycle).
export const PURSUER_ART = makeFrames({
  id: 'ESCAPE_PURSUER',
  palette: PURSUER_PALETTE,
  frames: [
    [
      [0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,0,0,0,0],
      [0,0,1,2,2,2,4,1,1,0,0,0],
      [0,0,1,2,2,2,2,2,1,1,0,0],
      [0,1,1,1,2,2,2,2,1,1,0,0],
      [0,1,2,2,2,2,2,2,1,1,0,0],
      [1,1,2,2,2,3,3,2,1,1,0,0],
      [1,2,2,2,3,3,3,2,2,1,0,0],
      [1,2,2,3,3,3,3,3,2,1,0,0],
      [0,1,1,2,3,3,3,2,1,0,0,0],
      [0,0,1,1,2,2,2,1,1,0,0,0],
      [0,0,1,2,1,1,1,2,1,0,0,0],
      [0,1,2,2,1,0,0,1,2,1,0,0],
      [0,1,1,1,1,0,0,1,1,1,0,0],
    ],
    [
      [0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,0,0,0,0],
      [0,0,1,2,2,2,4,1,1,0,0,0],
      [0,0,1,2,2,2,2,2,1,1,0,0],
      [0,1,1,1,2,2,2,2,1,1,0,0],
      [0,1,2,2,2,2,2,2,1,1,0,0],
      [1,1,2,2,2,3,3,2,1,1,0,0],
      [1,2,2,2,3,3,3,2,2,1,0,0],
      [1,2,2,3,3,3,3,3,2,1,0,0],
      [0,1,1,2,3,3,3,2,1,0,0,0],
      [0,0,1,1,2,2,2,1,1,0,0,0],
      [0,0,0,1,1,2,1,1,1,0,0,0],
      [0,0,1,2,1,2,2,1,0,0,0,0],
      [0,0,1,2,1,1,2,2,1,0,0,0],
    ],
  ],
});

// Keys: 1 ink outline, 2 body, 3 shade, 4 eye (the SAME palette as the run
// cycle — the lunge is the same body, a different POSTURE).
// V1d LUNGE ART: the burst pose — the whole body pitched forward, arms
// THRUST to full reach right, legs trailing. Two frames (the strike beat:
// arms level / arms a hair raised) so the lint's frames-differ pin holds.
export const PURSUER_LUNGE_ART = makeFrames({
  id: 'ESCAPE_PURSUER_LUNGE',
  palette: PURSUER_PALETTE,
  frames: [
    [
      [0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,0,0,0,0],
      [0,0,1,2,2,2,4,1,1,0,0,0],
      [0,0,1,2,2,1,2,2,2,2,1,1],
      [0,1,1,1,2,1,1,1,1,1,2,1],
      [0,1,2,2,2,2,2,2,1,1,2,1],
      [1,1,2,2,2,3,3,2,1,1,1,1],
      [1,2,2,2,3,3,3,2,2,1,0,0],
      [1,2,2,3,3,3,3,3,2,1,0,0],
      [0,1,1,2,3,3,3,2,1,0,0,0],
      [0,0,1,1,2,2,2,1,1,0,0,0],
      [0,0,1,2,1,1,1,2,1,0,0,0],
      [0,1,2,1,1,0,0,1,1,1,0,0],
      [0,1,1,1,1,0,0,0,1,1,0,0],
    ],
    [
      [0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,0,0,0,0],
      [0,0,1,2,2,2,4,1,1,1,0,0],
      [0,0,1,2,2,1,1,2,2,2,1,1],
      [0,1,1,1,2,1,1,2,2,2,2,1],
      [0,1,2,2,2,2,2,2,1,1,1,1],
      [1,1,2,2,2,3,3,2,1,1,0,0],
      [1,2,2,2,3,3,3,2,2,1,0,0],
      [1,2,2,3,3,3,3,3,2,1,0,0],
      [0,1,1,2,3,3,3,2,1,0,0,0],
      [0,0,1,1,2,2,2,1,1,0,0,0],
      [0,0,0,1,1,2,1,1,1,0,0,0],
      [0,0,1,2,1,2,1,1,0,0,0,0],
      [0,0,1,2,1,1,2,2,1,0,0,0],
    ],
  ],
});

// Keys: 1 ink outline, 2 membrane, 3 dark body, 4 eye.
const FLIER_PALETTE = {
  1: '#100e16',
  2: '#8060c0',
  3: '#4c3380',
  4: '#ffd54a',
};

// 16x12, wings up (frame A) / wings beat down (frame B) — the two-beat flap.
// The body is a small diving head at the RIGHT (fliers close leftward onto the
// runner, but the dive reads as an attack posture: head low, wings wide).
export const FLIER_ART = makeFrames({
  id: 'ESCAPE_FLIER',
  palette: FLIER_PALETTE,
  frames: [
    [
      [0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0],
      [0,0,1,2,2,1,0,0,0,0,1,2,2,1,0,0],
      [0,1,2,2,2,2,1,0,0,1,2,2,2,2,1,0],
      [0,1,2,2,2,2,1,0,0,1,1,2,2,2,1,0],
      [1,2,2,2,2,2,1,1,1,1,2,2,3,3,1,1],
      [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
      [0,1,2,2,2,2,1,1,1,1,2,3,3,3,1,1],
      [0,1,2,2,2,2,1,0,0,1,1,2,3,3,1,0],
      [0,0,1,2,2,2,1,0,0,1,2,2,2,2,1,0],
      [0,0,1,2,2,1,0,0,0,0,1,2,2,1,0,0],
      [0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0],
      [0,0,0,1,2,1,0,0,0,0,1,2,1,0,0,0],
      [0,0,1,2,2,1,0,0,0,0,1,2,2,1,0,0],
      [0,1,2,2,2,2,1,1,1,1,2,2,2,2,1,1],
      [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
      [1,2,2,2,2,2,1,1,1,1,2,2,3,3,1,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,1,0,0,1,2,2,2,2,1,0],
      [0,1,2,2,2,2,2,1,1,2,2,2,2,2,1,0],
      [0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0],
      [0,0,1,1,1,1,1,0,0,1,1,1,1,1,0,0],
    ],
  ],
});
