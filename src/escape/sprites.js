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

// ---- 2026-09-17 art pass (owner: "Variant b is good. The pilot still needs
// more detail. Also the boss needs art. It's hidden in a box for some
// reason.") — the PILOT set (run x4 + jump + dash, silhouette-first: outline,
// 3-tone ramp, ONE teal visor accent), the BOSS grid (a hunched colossus in
// the SMOKE INFERNO family, replacing the plain fillRect slab), and the
// 4-FRAME threat loops (frames 0+2 are the shipped grids, 1+3 the new passing
// poses authored for the variants exhibit and adopted with it).
//
// String-authored grids ('.' transparent, letters keyed below) converted to
// the numeric contract at module load — same rules, easier to author big.

const PILOT_PALETTE = { 1: '#10101a', 2: '#e8e8f0', 3: '#9a9ac2', 4: '#60e0c0' };
function pilotGrid(s) {
  return s.map(r => [...r].map(ch => ch === '.' ? 0 : { o: 1, b: 2, s: 3, v: 4 }[ch]));
}
// 12x17. The pilot runs RIGHT: visor accent forward, scarf trailing, readable
// limb cycle. Frame 1 stride open, 2 passing, 3 gathered, 4 knee-drive.
export const PILOT_ART = makeFrames({
  id: 'ESCAPE_PILOT',
  palette: PILOT_PALETTE,
  frames: [
    pilotGrid([ // 1: stride OPEN — lead leg extended, trail leg back
      '............',
      '.........ooo',
      '....oooobvvo',
      '....obbbbooo',
      '....obbo....',
      's...obbo....',
      'ss.oobbboo..',
      '.soobbbboo..',
      '..obbbebbo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '...obbbo....',
      '..ob.s.bbo..',
      '.ob...sbbo..',
      '.ob....sbo..',
      'ob......sbo.',
      'oo.......oo.',
    ]),
    pilotGrid([ // 2: PASSING — legs crossed under the hips
      '............',
      '.........ooo',
      '....oooobvvo',
      '....obbbbooo',
      '....obbo....',
      's...obbo....',
      'ss.oobbboo..',
      '.soobbbboo..',
      '..obbbebbo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '...obbbbo...',
      '....osbso...',
      '....osbo....',
      '....osbo....',
      '....os.so...',
      '....oo.oo...',
    ]),
    pilotGrid([ // 3: GATHERED — both legs under, compression beat
      '............',
      '.........ooo',
      '....oooobvvo',
      '....obbbbooo',
      '....obbo....',
      's...obbo....',
      'ss.oobbboo..',
      '.soobbbboo..',
      '..obbbebbo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '...obbbbo...',
      '...osbbso...',
      '..obbssbbo..',
      '..ob....bo..',
      '.obo....obo.',
      '.oo......oo.',
    ]),
    pilotGrid([ // 4: KNEE-DRIVE — the drive leg punching through
      '............',
      '.........ooo',
      '....oooobvvo',
      '....obbbbooo',
      '....obbo....',
      's...obbo....',
      'ss.oobbboo..',
      '.soobbbboo..',
      '..obbbebbo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '...obbbbo...',
      '...osbbs....',
      '...ob..sb...',
      '..obo...sbo.',
      '..ob......o.',
      '..oo........',
    ]),
  ],
});
// Airborne: the TUCK (rising) — knees up, scarf streaming.
export const PILOT_JUMP_ART = makeFrames({
  id: 'ESCAPE_PILOT_JUMP',
  palette: PILOT_PALETTE,
  frames: [
    pilotGrid([
      '............',
      '.........ooo',
      '....oooobvvo',
      '....obbbbooo',
      '....obbo....',
      's...obbo....',
      'ss.oobbboo..',
      '.soobbbboo..',
      '..obbbebboo.',
      '..obbbbbbboo',
      '..obbbbbbo..',
      '.sobbbbbbo..',
      '.obbbbbbbo..',
      'obbo.obbo...',
      'obbo..obbo..',
      '.oo....obbo.',
      '........oo..',
    ]),
  ],
});
// The DASH lunge: full stretch, both arms back, chin tucked.
export const PILOT_DASH_ART = makeFrames({
  id: 'ESCAPE_PILOT_DASH',
  palette: PILOT_PALETTE,
  frames: [
    pilotGrid([
      '............',
      '..........oo',
      '.....oooobvo',
      '.oooobbbbooo',
      'sobbbbbbbo..',
      'ssobbbbo....',
      '.sobbboo....',
      '..obbbebo...',
      '..obbbbbo...',
      '..obbbbbo...',
      '..obbbbbo...',
      '..obbbbo....',
      '..osbbso....',
      '.ob...bbo...',
      '.ob...sbo...',
      'ob.....sbo..',
      'oo......oo..',
    ]),
  ],
});

// ---- THE BOSS (28x30, drawn at 3x = 84x90 against the 84x88 body box) ------
// A hunched colossus FACING LEFT (the runner approaches from the left): a
// lowered horned head, one massive arm reaching toward the runner, a shoulder
// hump that is the highest mass, ember cracks up the hide (the SMOKE INFERNO
// family's #ff7a3c), gold eyes. Keys: o ink, h hide, d hide-dark, c crack, e eye.
const BOSS_PALETTE = { 1: '#140f12', 2: '#6e3844', 3: '#4c2834', 4: '#ff7a3c', 5: '#ffd54a' };
function bossGrid(s) {
  return s.map(r => [...r].map(ch => ch === '.' ? 0 : { o: 1, h: 2, d: 3, c: 4, e: 5 }[ch]));
}
export const BOSS_ART = makeFrames({
  id: 'ESCAPE_BOSS',
  palette: BOSS_PALETTE,
  frames: [
    bossGrid([
      '..........oddoo..............',
      '.........odhhhdo.............',
      '........odhhhhhdo............',
      '.......odhhhhhhhdo...........',
      '......odhhhhhhhhhdo..........',
      '.....odhhhhhhhhhhhdo.........',
      '....odhhhhhhhhhhhhhdo........',
      '...oohhhhhhhhhhhhhhhdo.......',
      '..ohhhhhhhhhhhhhhhhhdo.......',
      '..ohhhhhhhhhhhhhhhhhho.......',
      '.oohhhhhhhhhhhhhhhhhhho......',
      'ooeohhhhhhhhhdhhhhhhhhho.....',
      'ooeeohhhhhdchhhhhdhhhhhho....',
      'ohhoohhhhchhhhhhchhhhhhho....',
      'ohhhoohhhhhhhhchhhhhhhdho....',
      'ohhhhoohhhhhchhhhhhhdhhhho...',
      '.ohhhhhoohhhhhdhhhhhhhhhho...',
      '.odhhhhhhoohhhhhhhhhdhhhho...',
      '..odhhhhhhoohhhhhhhhhhho....',
      '...odhhhhhhoohhhhhhhdho.....',
      '....odhhhhhhoohhhhhhho......',
      '.....odhdhhhoohhhhhdho......',
      '......odhdhhhoohhhhho.......',
      '.......odhdhhoohhdho........',
      '........odhdhooohhho........',
      '.........odhho.odhho........',
      '..........oho..odho.........',
      '..........oho..odho.........',
      '.........odho..ohho.........',
      '.........oooo..oooo.........',
    ]),
  ],
});

// ---- the 4-FRAME threat loops (adopted with variant B; frames 0+2 ARE the
// shipped grids via slice, 1+3 the new passing poses) -------------------------
const PURSUER_PALETTE4 = { 1: '#140f12', 2: '#c05050', 3: '#7e3038', 4: '#ffd54a' };
const LEGS_A = PURSUER_ART.frames[0].slice(10);
const LEGS_B = PURSUER_ART.frames[1].slice(10);
const LEGS_MID1 = [
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0],
  [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0], [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
];
const LEGS_MID2 = [
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0],
  [0, 0, 1, 2, 2, 1, 1, 1, 2, 1, 0, 0], [0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0],
];
function pursuer4(i) {
  const legs = [LEGS_A, LEGS_MID1, LEGS_B, LEGS_MID2][i];
  return PURSUER_ART.frames[0].slice(0, 10).concat(legs);
}
export const PURSUER_RUN_4 = [0, 1, 2, 3].map(i => ({
  rows: pursuer4(i), palette: PURSUER_PALETTE4, w: 12, h: 14,
}));
const LUNGE_LOW_A = PURSUER_LUNGE_ART.frames[0].slice(6);
const LUNGE_LOW_B = PURSUER_LUNGE_ART.frames[1].slice(6);
const ARM_MID1 = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 4, 1, 1, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0],
  [0, 1, 1, 1, 2, 2, 1, 1, 1, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 2, 1, 1, 2, 1, 0],
];
const ARM_MID2 = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 4, 1, 1, 1, 0, 0],
  [0, 0, 1, 2, 2, 1, 2, 2, 2, 1, 1, 0],
  [0, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0],
];
function lunge4(i) {
  const top = [PURSUER_LUNGE_ART.frames[0].slice(0, 6), ARM_MID1,
    PURSUER_LUNGE_ART.frames[1].slice(0, 6), ARM_MID2][i];
  const low = [LUNGE_LOW_A, LUNGE_LOW_A, LUNGE_LOW_B, LUNGE_LOW_B][i];
  return top.concat(low);
}
export const PURSUER_LUNGE_4 = [0, 1, 2, 3].map(i => ({
  rows: lunge4(i), palette: PURSUER_PALETTE4, w: 12, h: 14,
}));
const FLIER_PALETTE4 = { 1: '#100e16', 2: '#8060c0', 3: '#4c3380', 4: '#ffd54a' };
const FLIER_MID1 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0],
  [0,0,1,2,2,1,0,0,0,0,1,2,2,1,0,0],
  [0,1,2,2,2,2,1,1,1,1,2,2,2,2,1,1],
  [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
  [1,2,2,2,2,2,1,1,1,1,2,2,3,3,1,1],
  [0,1,2,2,2,2,1,0,0,1,1,2,3,3,1,0],
  [0,0,1,2,2,2,1,0,0,1,2,2,2,2,1,0],
  [0,0,0,1,2,2,1,0,0,0,1,2,2,1,0,0],
  [0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const FLIER_MID2 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0],
  [0,1,1,1,2,2,1,1,1,1,2,2,1,1,1,1],
  [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
  [1,2,2,2,2,2,2,1,1,1,1,2,2,3,3,1],
  [1,2,2,2,2,2,1,1,0,1,1,2,2,2,1,1],
  [0,1,2,2,2,2,2,1,1,2,2,2,2,2,1,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
function flier4(i) {
  return [FLIER_ART.frames[0], FLIER_MID1, FLIER_ART.frames[1], FLIER_MID2][i];
}
export const FLIER_4 = [0, 1, 2, 3].map(i => ({
  rows: flier4(i), palette: FLIER_PALETTE4, w: 16, h: 12,
}));
