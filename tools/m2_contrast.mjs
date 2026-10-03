// M2 contrast report: WCAG contrast of each actor's body colour (the most
// used palette entry of frame 0) against the floor.
//   node tools/m2_contrast.mjs            table against each wave theme base
//   node tools/m2_contrast.mjs --json     the same, machine-readable
//   node tools/m2_contrast.mjs --stages   per stage: the worst actor and how many are under 3:1
//   node tools/m2_contrast.mjs --actors   per actor: its worst floor, as authored and as the
//                                         horde is drawn (common enemies are baked muted)
// test/test_actor_contrast.mjs holds every actor to 3:1 through stageContrast().
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG as C } from '../src/config.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { BOSS_SPRITE } from '../src/sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import * as CH from '../src/character_sprites.js';
import { STAGE_GROUND_PALETTES, stageGroundPalette } from '../src/world_ground.js';

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
// The colour a common enemy's body is baked to (sprite_cache.js `mute`).
export function muted(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return '#' + c.map(v => Math.round((v * 0.78 + l * 0.22) * 0.9).toString(16).padStart(2, '0')).join('');
}
// Every actor's body colour: common enemies, the named bosses, the maw, the pilots.
export function actorBodyColours() {
  const actors = {};
  for (const [id, s] of Object.entries(ENEMY_SPRITES)) actors[id] = bodyColour(s);
  actors.BOSS_DEFAULT = bodyColour(BOSS_SPRITE);
  for (const [id, s] of Object.entries(BOSS_SPRITES || {})) actors['BOSS_' + id] = bodyColour(s);
  actors.THE_MAW = bodyColour(FINAL_BOSS_SPRITE);
  for (const [id, s] of Object.entries(CH.CHARACTER_SPRITES || {})) actors['PILOT_' + id] = bodyColour(s);
  return actors;
}
// World art makeover: the floor is the STAGE's material leaned by the wave
// theme. stageContrast() gives, per stage, each actor's worst contrast
// against the large floor tones (base and both underlay patches) under all
// six wave leans: { STAGE: { ACTOR: ratio } }.
export function stageContrast(colours = actorBodyColours()) {
  const out = {};
  for (const st of Object.keys(STAGE_GROUND_PALETTES)) {
    out[st] = {};
    for (const [id, col] of Object.entries(colours)) {
      let m = 99;
      for (const t of C.GROUND.THEMES) {
        const P = stageGroundPalette(st, t);
        for (const k of ['base', 'patch', 'patch2']) m = Math.min(m, ratio(col, P[k]));
      }
      out[st][id] = m;
    }
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const actors = actorBodyColours();
  const themes = C.GROUND.THEMES;
  if (process.argv.includes('--stages')) {
    const by = stageContrast(actors);
    let gmin = 99, gat = '';
    console.log('| stage | base | min contrast (actor) | actors under 3:1 |');
    console.log('|---|---|---|---|');
    for (const [st, per] of Object.entries(by)) {
      const [sat, smin] = Object.entries(per).sort((a, b) => a[1] - b[1])[0];
      const below = Object.values(per).filter(v => v < 3).length;
      console.log('| ' + st + ' | ' + STAGE_GROUND_PALETTES[st].base + ' | ' + smin.toFixed(2) + ' (' + sat + ') | ' + below + ' |');
      if (smin < gmin) { gmin = smin; gat = sat + ' on ' + st; }
    }
    console.log('min ' + gmin.toFixed(2) + ' (' + gat + ')');
  } else if (process.argv.includes('--actors')) {
    const worst = (by, id) => Math.min(...Object.values(by).map(per => per[id]));
    const by = stageContrast(actors);
    const mutedCols = {};
    for (const id of Object.keys(ENEMY_SPRITES)) mutedCols[id] = muted(actors[id]);
    const byMuted = stageContrast(mutedCols);
    console.log('| actor | body | worst floor | drawn (muted) | worst floor |');
    console.log('|---|---|---|---|---|');
    for (const [id, col] of Object.entries(actors)) {
      console.log('| ' + id + ' | ' + col + ' | ' + worst(by, id).toFixed(2) + ' | ' +
        (mutedCols[id] ? mutedCols[id] + ' | ' + worst(byMuted, id).toFixed(2) : '- | -') + ' |');
    }
  } else {
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
  }
}
