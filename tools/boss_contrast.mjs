// The bosses and the Maw: what carries each one on the floor, measured.
//   node tools/boss_contrast.mjs            a table: per boss, its rim, its worst floor, its eyes
//   node tools/boss_contrast.mjs --floors   per boss and stage: the worst edge contrast
// A boss is dark and heavy, so its BODY does not stand out from a dark floor;
// an edge carries it instead, as it does for everything on a light floor:
//   the rim     its bright ring (sprite.rim, drawn by the sprite cache as the
//               outer ring), against every floor tone of a dark stage;
//   the keyline on a light floor, the dark ring the renderer adds outside the
//               rim (render.js: groundLight); either edge may carry it there.
// Every floor tone: base and both underlay patches, under each of the six
// wave leans, and under the light layer's darkness at each of the six wave
// lights (day to deep night, src/light.js ambientFor). Each tone is taken bare
// and under the boss's own pool of light at its strongest (the centre of the
// pool, where the feet stand: three stacked discs, render.js bossPool), as the
// fight draws it. The eyes are measured against every body pixel beside them
// (the dark socket).
// test/test_actor_contrast.mjs holds rims to 3:1 and eyes to 4.5:1 through these.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG as C } from '../src/config.js';
import { BOSS_SPRITE } from '../src/sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import { STAGE_GROUND_PALETTES, stageGroundPalette, groundIsLight } from '../src/world_ground.js';
import { NIGHT, ambientFor, over } from '../src/light.js';
import { OUTLINE_DARK, glowLayerAlpha } from '../src/sprite_cache.js';
import { bossPool, BOSS_POOL_ALPHA, MAW_POOL_ALPHA } from '../src/render.js';
import { ratio } from './m2_contrast.mjs';

export const EYE = '#ff4a14';   // DANGER: a boss's eyes are a threat mark
export const BOSS_LOOKS = () => ({ DEFAULT: BOSS_SPRITE, ...BOSS_SPRITES, MAW: FINAL_BOSS_SPRITE });

// Every floor tone a boss can stand on, per stage: [{ hex, why }].
export function floorTones(stage) {
  const out = [];
  for (const t of C.GROUND.THEMES) {
    const P = stageGroundPalette(stage, t);
    for (const k of ['base', 'patch', 'patch2']) {
      out.push({ hex: P[k], why: t.name + ' ' + k });
      for (const n of [...new Set(NIGHT)]) {
        const amb = ambientFor(stage, n);
        if (amb.a > 0) out.push({ hex: over(P[k], amb.col, amb.a), why: t.name + ' ' + k + ' night ' + n });
      }
    }
  }
  return out;
}

// A floor tone under a boss's pool of light at its centre (three discs).
export function underPool(spr, stage, hex) {
  const col = bossPool(spr, groundIsLight(stage));
  if (!col) return hex;
  const a = glowLayerAlpha(spr === FINAL_BOSS_SPRITE ? MAW_POOL_ALPHA : BOSS_POOL_ALPHA);
  return over(over(over(hex, col, a), col, a), col, a);
}

// The worst edge contrast of a boss on a stage: { r, at, by } (by: 'rim' or 'keyline').
export function edgeOn(spr, stage) {
  const light = groundIsLight(stage);
  let worst = { r: 99, at: '', by: '' };
  for (const tone of floorTones(stage)) {
    for (const [hex, why] of [[tone.hex, tone.why], [underPool(spr, stage, tone.hex), tone.why + ' in its pool']]) {
      const rim = spr.rim ? ratio(spr.rim, hex) : 0;
      const key = light && spr.rim ? ratio(OUTLINE_DARK, hex) : 0;
      const r = Math.max(rim, key);
      if (r < worst.r) worst = { r, at: why, by: rim >= key ? 'rim' : 'keyline' };
    }
  }
  return worst;
}

// The eyes: the least contrast between an eye pixel and a body pixel beside
// it, over every frame (and the wind-up pose). { r, n } (n: eye pixels).
export function eyesOf(spr) {
  const keys = Object.keys(spr.palette).filter(k => String(spr.palette[k]).toLowerCase() === EYE).map(Number);
  let r = 99, n = 0;
  const grids = [...spr.frames, ...(spr.tell ? [spr.tell] : [])];
  for (const fr of grids) {
    const g = fr.map(row => (Array.isArray(row) ? row.map(Number) : String(row).split('').map(c => (c === '.' ? 0 : Number(c)))));
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
      if (!keys.includes(g[y][x])) continue;
      n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = g[y + dy] && g[y + dy][x + dx];
        if (v && !keys.includes(v)) r = Math.min(r, ratio(EYE, spr.palette[v]));
      }
    }
  }
  return { r, n };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const stages = Object.keys(STAGE_GROUND_PALETTES);
  const looks = BOSS_LOOKS();
  if (process.argv.includes('--floors')) {
    console.log('| boss | ' + stages.join(' | ') + ' |');
    console.log('|---|' + stages.map(() => '---').join('|') + '|');
    for (const [id, s] of Object.entries(looks)) {
      console.log('| ' + id + ' | ' + stages.map(st => { const e = edgeOn(s, st); return e.r.toFixed(2) + (e.by === 'keyline' ? ' k' : ''); }).join(' | ') + ' |');
    }
    console.log('(k: carried by the dark keyline there; otherwise by the rim)');
  } else {
    console.log('| boss | rim | worst dark floor (rim) | worst light floor (rim or keyline) | eyes vs socket |');
    console.log('|---|---|---|---|---|');
    for (const [id, s] of Object.entries(looks)) {
      const dark = stages.filter(st => !groundIsLight(st)).map(st => ({ st, ...edgeOn(s, st) })).sort((a, b) => a.r - b.r)[0];
      const light = stages.filter(st => groundIsLight(st)).map(st => ({ st, ...edgeOn(s, st) })).sort((a, b) => a.r - b.r)[0];
      const e = eyesOf(s);
      console.log('| ' + id + ' | ' + (s.rim || '-') + ' | ' + dark.r.toFixed(2) + ' ' + dark.st + ' (' + dark.at + ') | ' +
        light.r.toFixed(2) + ' ' + light.st + ' by ' + light.by + ' | ' + e.r.toFixed(2) + ' (' + e.n + ' px) |');
    }
  }
}
