// M2 contrast report: WCAG contrast of each actor's body colour (the most
// used palette entry of frame 0) against each ground theme base.
//   node tools/m2_contrast.mjs            table for the working tree
//   node tools/m2_contrast.mjs --json     machine-readable
import { CONFIG as C } from '../src/config.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { BOSS_SPRITE } from '../src/sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import * as CH from '../src/character_sprites.js';

export function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export function bodyColour(spr) {
  const cnt = {};
  for (const row of spr.frames[0]) for (const v of row) if (v) cnt[v] = (cnt[v] || 0) + 1;
  const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  return spr.palette[k];
}
const actors = {};
for (const [id, s] of Object.entries(ENEMY_SPRITES)) actors[id] = bodyColour(s);
actors.BOSS_DEFAULT = bodyColour(BOSS_SPRITE);
for (const [id, s] of Object.entries(BOSS_SPRITES || {})) actors['BOSS_' + id] = bodyColour(s);
actors.THE_MAW = bodyColour(FINAL_BOSS_SPRITE);
const chars = CH.CHARACTER_SPRITES || {};
for (const [id, s] of Object.entries(chars)) actors['PILOT_' + id] = bodyColour(s);

const themes = C.GROUND.THEMES;
const table = {};
for (const [id, col] of Object.entries(actors)) {
  table[id] = { body: col };
  for (const t of themes) table[id][t.name.replace('THE ', '')] = +ratio(col, t.base).toFixed(2);
}
if (process.argv.includes('--json')) { console.log(JSON.stringify({ themes: themes.map(t => [t.name, t.base]), table })); }
else {
  const names = themes.map(t => t.name.replace('THE ', ''));
  console.log('| actor | body | ' + names.map((n, i) => n + ' ' + themes[i].base).join(' | ') + ' |');
  console.log('|---|---|' + names.map(() => '---').join('|') + '|');
  let min = 99, minAt = '';
  for (const [id, r] of Object.entries(table)) {
    console.log('| ' + id + ' | ' + r.body + ' | ' + names.map(n => r[n].toFixed(2)).join(' | ') + ' |');
    for (const n of names) if (r[n] < min) { min = r[n]; minAt = id + ' on ' + n; }
  }
  console.log('min ' + min.toFixed(2) + ' (' + minAt + ')');
}
