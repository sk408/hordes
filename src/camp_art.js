// HORDES — the camp strip: four 16x16 buildings on a strip of ground.
// Pixel grids in the game's sprite format (rows of palette indices, 0 =
// transparent), drawn through the sprite cache like every other sprite.
// An unbuilt building is drawn as a dim outline; a building with something
// ready gets a small marker above it.
import { blitGrid } from './sprite_cache.js';

// Authored as text: one character per pixel, '.' = transparent.
function grid(rows, keys) {
  return rows.map(r => [...r].map(ch => (ch === '.' ? 0 : keys.indexOf(ch) + 1)));
}
const KEYS = 'kbrsadeg';   // ink, base, rim, shade, accent, dark, extra, glow

const ART = {
  mine: grid([
    '................',
    '.......kk.......',
    '......krrk......',
    '.....krbbsk.....',
    '....krbbbbsk....',
    '...krbbbbbbsk...',
    '..kkkkkkkkkkkk..',
    '..kddddddddddk..',
    '..kdk......kdk..',
    '..kdk.dddd.kdk..',
    '..kdk.dkkd.kdk..',
    '..kdk.dkkd.kdk..',
    '.kkdkkkkkkkkdkk.',
    'kaakssssssssskaa',
    'kaaasssssssssaak',
    'kkkkkkkkkkkkkkkk',
  ], KEYS),
  forge: grid([
    '..........kk....',
    '.........kssk...',
    '.........kssk...',
    '....kkkkkkssk...',
    '...krrrrrkssk...',
    '..krbbbbbbbbsk..',
    '.krbbbbbbbbbbsk.',
    'kkkkkkkkkkkkkkkk',
    'kbbbbbbbbbbbbbsk',
    'kbbkkkkkbbbbbbsk',
    'kbbkaeakbbkkksk.',
    'kbbkeaekbbkdkskk',
    'kbbkkkkkbbkdksk.',
    'kbbbbbbbbbkdkssk',
    'ksssssssssssssssk'.slice(0, 16),
    'kkkkkkkkkkkkkkkk',
  ], KEYS),
  library: grid([
    '.......kk.......',
    '......krrk......',
    '.....krbbsk.....',
    '....krbbbbsk....',
    '...krbbbbbbsk...',
    '..krbbbbbbbbsk..',
    '.kkkkkkkkkkkkkk.',
    '.krrrrrrrrrrrsk.',
    '.krkkkrbbkkksk..',
    '.krkekrbbkeksk..',
    '.krkekrbbkeksk..',
    '.krkkkrbbkkksk..',
    '.krbbbrkkbbbsk..',
    '.krbbbrkdkbbsk..',
    '.kssssskdksssk..',
    'kkkkkkkkkkkkkkkk',
  ], KEYS),
  shrine: grid([
    '.......kk.......',
    '......kggk......',
    '.....kgaagk.....',
    '......kggk......',
    '.......kk.......',
    '....kkkkkkkk....',
    '...krrrrrrrrk...',
    '....kbk..kbk....',
    '....kbk..kbk....',
    '....kbk..kbk....',
    '....kbk..kbk....',
    '....kbk..kbk....',
    '...kkbkkkkbkk...',
    '..krrrrrrrrrrk..',
    '.krbbbbbbbbbbsk.',
    'kkkkkkkkkkkkkkkk',
  ], KEYS),
};

const PAL = {
  mine:    { 1: '#0a0a0e', 2: '#7a5a3a', 3: '#a8835a', 4: '#4a3422', 5: '#ffd75e', 6: '#22180f', 7: '#c89b3c', 8: '#fff2a8' },
  forge:   { 1: '#0a0a0e', 2: '#6a6e7e', 3: '#9aa0b4', 4: '#40434f', 5: '#ff9a3c', 6: '#22180f', 7: '#ffd75e', 8: '#fff2a8' },
  library: { 1: '#0a0a0e', 2: '#5a6aa8', 3: '#8a9ad8', 4: '#363f6a', 5: '#ffd75e', 6: '#22180f', 7: '#f0dfc0', 8: '#fff2a8' },
  shrine:  { 1: '#0a0a0e', 2: '#8a8a9a', 3: '#c8c8d8', 4: '#50505e', 5: '#b07aff', 6: '#22180f', 7: '#c89b3c', 8: '#e0c8ff' },
};
const DIM = { 1: '#3a3428', 2: '#2a2620', 3: '#3a3428', 4: '#221e18', 5: '#3a3428', 6: '#1a1712', 7: '#3a3428', 8: '#3a3428' };

export const CAMP_ART = ART;
export const CAMP_STRIP_W = 96;   // art pixels: four 16 px buildings with 8 px gaps
export const CAMP_STRIP_H = 24;

/**
 * Paint the strip at 1 art pixel per unit; the caller scales the canvas.
 * `levels` = { mine, forge, library, shrine }, `ready` = { id: bool }.
 */
export function paintCampStrip(g, levels, ready) {
  g.clearRect(0, 0, CAMP_STRIP_W, CAMP_STRIP_H);
  // ground
  g.fillStyle = '#3a2a18';
  g.fillRect(0, CAMP_STRIP_H - 4, CAMP_STRIP_W, 4);
  g.fillStyle = '#5a7a3a';
  g.fillRect(0, CAMP_STRIP_H - 5, CAMP_STRIP_W, 1);
  const ids = ['mine', 'forge', 'library', 'shrine'];
  ids.forEach((id, i) => {
    const x = 4 + i * 24, y = CAMP_STRIP_H - 4 - 16;
    const built = (levels && levels[id]) > 0;
    blitGrid(g, ART[id], built ? PAL[id] : DIM, x, y);
    if (built && ready && ready[id]) {
      // a small glint above a building with something to collect
      g.fillStyle = '#ffd75e';
      g.fillRect(x + 13, y - 3, 2, 2);
      g.fillRect(x + 14, y - 4, 1, 1);
    }
  });
}
