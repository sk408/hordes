// HORDES — pixel rendering. Sprites are pixel grids (structured data, no
// image assets). Each grid is rasterised once by sprite_cache.js and drawn
// with drawImage; without a real canvas the same grids paint with fillRect.
import { CONFIG as C, runClock } from './config.js';
import { richStep } from './entities.js';   // R3 floor: rich gems
import { resolveLook, ELITE_LOOK, ELITE_TEMPLATE } from './enemy_types.js';
import { RARITY } from './rarity.js';   // G10 tier tells (outline ring colour)
import { BOSSES, MIDBOSS, BOSS_SPRITES } from './bosses.js';   // G10 bestiary: boss sprites
import { SPRITES, BOSS_SPRITE, FLAME } from './sprites.js';
import { enemySpriteFor } from './enemy_sprites.js';   // PORT SLICE B: PILLAR + SHRIKE roster art
import { characterSpriteFor } from './character_sprites.js';   // PORT SLICE C: per-pilot in-run looks
import {
  WEAPON_ICONS, WEAPON_ICON_PALETTE, ITEM_ICON_GRID, weatherIcon,
} from './sprites.js';
import { FINAL_BOSS_SPRITE } from './final_boss.js';
import { arenaOn } from './finale_arena.js';   // the Maw is drawn wherever its arena is
import { weaponXpNeeded, WEAPON_MAX_LEVEL } from './weapons.js';   // WAVE-18 read-only
import { fusionByBodyKind, fusionDef } from './fusions.js';   // fused weapons' tints and emblems
import { drawTitle, TITLE_WIDTH, TITLE_HEIGHT } from './art/title.js';   // G12 title card
// PORT SLICE I — HUD chrome trim (original art, additive-only: every helper
// paints 1px furniture strictly inside the footprint its caller already
// painted — no caller moves, resizes, renames or re-times anything).
import { trimBar, trimBadge, trimPlate, studCorners, radarTicks, fsKeyline, bannerTrim } from './art/hud_chrome.js';
// PORT SLICE K — original chest art (sealed world chest, per-band open
// remnants, burst dressing). Painters only; triggers/ttls/pools untouched.
import { chestArtFor, paintChest, SEALED_KEY } from './art/chests.js';
// PORT SLICE K2 — original shrine altar art (per-index designs, honest
// display: never per-blessing). Painters only; economy/rolls/latch untouched.
import { drawSites, drawWaypoint, drawMapIcon, MAP_ICON } from './sites_art.js';
import { drawWorldPoi, drawCarrierTell, drawQuestTracker, drawPoiMap } from './world_art.js';
import { clearWorldCards, flushWorldCards } from './world_cards.js';
import { archArtFor, paintArch } from './art/arches.js';
// TIER-2 NAMED FINDS (2026-09-23): per-affix item portraits. Painters only —
// the belt record (chrome.itemIcons, rarity per item in order) is untouched.
import { itemIconFor, paintItemIcon } from './art/item_icons.js';
// A2 THE RADAR: the DATA layer (pure maths, no DOM — see src/radar.js's header)
// is imported, never restated. This file owns only the painting of what it
// returns; the classification (chaff/elite/boss) is classifyTier's alone.
import { radarDots, RADAR_RADIUS } from './radar.js';
import { atlasCell } from './atlas.js';
import { stageRelief } from './stages.js';
import { propForStage, propFrame, paintStageProp } from './stage_props.js';
import { buildingField, paintBuilding, STAGE_BUILDINGS } from './stage_buildings.js';
import { stageGroundSpec, stageSalt, STAGE_GROUND_TILE, groundMotifFor, groundCellPicked, normGroundWeather, groundWxFor } from './stage_ground.js';
import { reliefLevel, reliefLevelAt, reliefVisionRadius } from './relief.js';
import { setCacheHost, cacheEnabled, blitGrid, blitGridPose, blitPainted, blitGlow, actorStyle, corpseStyle, spriteStyle, STYLE_ITEM, STYLE_PLAIN, STYLE_STRUCT } from './sprite_cache.js';
import { shakeOffset, trackOf } from './fx/feel.js';
import { enemyPose, collapsePose, heroLift, actorAnimOn } from './actor_anim.js';
import { describeHandBonus, HAND_BY_ID, SUIT_GLYPHS } from './hands.js';   // the HUD hand plate
// CLOUDY's bands: the alpha of each 2 px strip of a 14 px band (soft edges,
// the old 0.16 only at the middle), and the share kept on a light floor.
export const CLOUD_BAND_RAMP = [0.03, 0.07, 0.12, 0.16, 0.12, 0.07, 0.03];
export const CLOUD_BAND_LIGHT = 0.6;
// 'NO HAND YET' (the hand fan with no hand): a hint that reaches 4.5 to 1 on its plate.
export const FAN_EMPTY_TEXT = '#9a9ab8';
import { fanCards, fanLayout, fanKey, fanBlock, paintFan, pulsePhase, pulseLook } from './hand_fan.js';   // R5 the hand fan
const FAN_TEAL = '#3fe6d2';   // decision 5: cyan-teal is reward (the portal beat's TEAL)
import { JOKERS, jokerSlots, jokersHeld } from './jokers.js';   // the HUD joker row
import { cardArt } from './art/cards.js';
import { laneLines } from './message_lane.js';
import { drawFeelEffects, drawFeelNumbers } from './fx/feel_render.js';
import { terrainFor, TN, TCELL, TEXT, F_RAMP, F_BRIDGE } from './terrain.js';
import { drawTerrain, drawTerrainMarks } from './terrain_art.js';
import { stageGroundPalette, drawGroundChunks, paintGroundDecor, groundChunksOn, groundIsLight, groundEmits } from './world_ground.js';
import { LightLayer } from './light.js';   // R6 the light layer and the glows

// Depth order for the horde: the feet decide, higher on the ground first (a
// stable sort, so bodies on one row keep their list order and never flicker).
// A body's feet are where drawActor puts the bottom of its sprite, so a small
// body a little lower than a big body's centre, but with its feet above the
// big body's feet, stands behind it. A flyer goes by its shadow.
// bossdark: the pool of light under a boss or the Maw. On a dark floor it is
// a dark step of the boss's own hue (spr.pool), so the bright rim still
// stands 3:1 off the pool; on a light floor it is the rim's hue and the dark
// keyline carries the edge. tools/boss_contrast.mjs measures the rim over it.
export const BOSS_POOL_ALPHA = 0.75, MAW_POOL_ALPHA = 0.6;
export function bossPool(spr, groundLight) { return groundLight ? spr.rim : (spr.pool || spr.rim); }

// The ring an actor wears in the fight: white and danger while it winds up,
// gold on an elite, its tier's colour on a rare, a boss's own rim (bossdark:
// a boss is built on an elite chassis but wears its rim, not the elite gold).
export function actorRing(e, spr, tele, blink, tell, t) {
  if (tele && blink) return '#ffffff';
  if (tele) return '#ff4a14';   // the wind-up tell
  if (e.boss && spr && spr.rim) return spr.rim;
  if (e.elite) return '#f0c860';
  if (tell) return (tell.pulseHz && Math.floor(t * tell.pulseHz * 2) % 2 === 0) ? '#efd9ff' : tell.outline;
  if (e.boss) return '#ff9ed8';
  return null;
}
export function depthKey(e) {
  const hh = (e.h || C.ENEMY.H) / 2;
  if (e.flying || e.finalBoss) return e.y + hh;
  const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : (enemySpriteFor(e.typeId) || SPRITES[e.typeId]);
  if (!spr) return e.y + hh;
  const grow = e.elite && !e.boss ? ELITE_TEMPLATE.sizeMult : 1;
  return e.y + Math.round(spr.box.h * grow) - Math.round(spr.anchor.y * grow) - 1;
}
// The sort works on { e, k } pairs (k worked out once per body per frame),
// from a pool that is reused, so a frame makes no garbage.
function byDepth(a, b) { return a.k - b.k; }

// ---- MODAL SURFACE SUPPRESSION (the one shared mechanism) --------------------
// Owner 2026-09-17 (msg_01M2RVD9HHZZDSR7FKNTRRSSY5 + addendum): while ANY
// full-screen/modal surface is up, the HUD and every status message (the
// toast/event feed, the boss banner — all painted inside the play HUD) must
// be hidden. A modal joins by adding its mode here; drawPlayHud (and only
// drawPlayHud) reads this predicate, so the next modal inherits the whole
// suppression for one list entry. The DOM half of the same gate is
// main.js chromeOn() (touch pads/joystick). Members:
//   'dead'      the end-of-run summary (the shipped defect this fixes)
//   'trophies'  G9 gallery showcase
//   'bestiary'  G10 bestiary guide
// 'death-cine': the death movie owns the canvas; the one world render it
// takes for its frozen frame (main.js deathFreeze) must carry no HUD.
export const HUD_SUPPRESSED_MODES = new Set(['death-cine', 'dead', 'trophies', 'bestiary', 'menu', 'progress', 'loadout', 'characters', 'farewell']);
// The boss-arrival banner's letterbox: how far it is in (0..1), the same
// fade the banner paints with. 0 when no banner is up, or for the peripheral
// horde warning, which has no bands.
export const LETTERBOX_BAND = 34;
export function letterboxAlpha(state) {
  const b = state && state.bossBanner;
  // R7: an arrival banner the sting's name card stands in for is not drawn.
  if (!b || !(b.ttl > 0) || b.peripheral || b.underSting) return 0;
  const DUR = 2.5;
  return Math.max(0, Math.min(1, (DUR - b.ttl) / 0.35, b.ttl / 0.6));
}
// View px the top-left vitals block and the clock column step down while the
// letterbox is in, so HP, MP, the clock and the boss rule plate sit under the
// band (its red edge line included) and not behind it. It follows the band's
// fade, so the HUD slides down and back up with it.
export const LETTERBOX_HUD_DROP = 27;
// The portal beat's film bars push the block down the same way
// (state.beatHudDrop, set by main.js while the beat is up).
export function letterboxHudDrop(state) {
  const beat = (state && state.beatHudDrop) | 0;
  return Math.max(Math.round(LETTERBOX_HUD_DROP * letterboxAlpha(state)), beat);
}

// A pixel grid painted with one fillRect per run of equal pixels in a row.
// The same pixels as Renderer.drawGrid at scale 1, about ten times fewer calls.
export function paintGridRuns(g, grid, palette, x, y) {
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    let rx = 0;
    while (rx < row.length) {
      const v = row[rx];
      let end = rx + 1;
      while (end < row.length && row[end] === v) end++;
      if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx, y + ry, end - rx, 1); }
      rx = end;
    }
  }
}

export function hudSuppressed(state) {
  return HUD_SUPPRESSED_MODES.has(state.mode);
}

// A2 RADAR paint constants (geometry rationale lives on drawRadar below).
// RADAR_DISPLAY_R is the HUD-px radius of the drawn circle; the world->radar
// scale is RADAR_DISPLAY_R / RADAR_RADIUS (34/330). Bottom-right corner box:
// the one HUD region with no chrome (bars/XP/feed top-left, clock/weather
// top-right, weapon/item rows bottom-left).
const RADAR_DISPLAY_R = 34;
const RADAR_CORNER_INSET = 10;
// R7: does the radar's disc touch a rect (view px)? (drawRadar's own placement.)
function radarTouches(state, r) {
  const R = RADAR_DISPLAY_R;
  const inset = Math.max(0, Math.min(C.VIEW_W / 2, Math.round((state && state.radarInset) || 0)));
  const cx = C.VIEW_W - RADAR_CORNER_INSET - R - inset, cy = C.VIEW_H - RADAR_CORNER_INSET - R;
  return cx + R > r.x && cx - R < r.x + r.w && cy + R > r.y && cy - R < r.y + r.h;
}
// Tier tells: chaff is a small grey pip, elite is gold, boss is the big red
// one — readable at a glance, in the house palette (gold #ffd75e / red
// #ff2f5e, the same pair the LV badge and the run-limit tick use). Sizes are
// odd integers so a dot centres exactly on its integer radar-space pixel.
const RADAR_DOT_STYLE = {
  chaff: { size: 3, color: '#b8b8c8' },
  elite: { size: 5, color: '#ffd75e' },
  boss: { size: 7, color: '#ff2f5e' },
};

// 12x12 player sprite: 0 = transparent, digits index into PALETTE.
// Art pass (Oct 2026): the hero's ground ring — an ellipse 29x11 around the
// feet, a bright line over a dark one so it reads on any ground and over any
// enemy. Baked once through the sprite cache (blitPainted).
const HERO_RING_BOX = { x: -15, y: -6, w: 31, h: 13 };
// R3: warm white is the hero's colour (decision 5: red-orange danger,
// cyan-teal reward, warm white hero). The ring, the arrow, the pool and the
// second outline round the pilot use it, and nothing else in the fight does.
export const HERO_WARM = '#ffd8c4';
// Half the side of the hero's box (world px) that damage numbers fade near.
export const HERO_BOX_HALF = 10;
// keyed: dark on both sides of the bright line (R6: on a light floor the line
// alone melts into snow or sand).
function heroRingPainter(bright, keyed = false) {
  return (c, ox, oy) => {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const x = Math.round(Math.cos(t) * 14), y = Math.round(Math.sin(t) * 5);
      c.fillStyle = 'rgba(8,6,14,0.8)';
      c.fillRect(ox + x, oy + y + 1, 1, 1);
      if (keyed) c.fillRect(ox + x, oy + y - 1, 1, 1);
      c.fillStyle = bright;
      c.fillRect(ox + x, oy + y, 1, 1);
    }
  };
}
const paintHeroRing = heroRingPainter(HERO_WARM);   // stays warm white when hurt
const paintHeroRingKeyed = heroRingPainter(HERO_WARM, true);
// The hero's marker: a small warm-white arrow over the head, dark-edged, shown when
// the hero is hurt or stands in a crowd (it goes up at HERO_CROWD_ON enemies
// inside the box around the hero and comes down under HERO_CROWD_OFF).
const HERO_MARK_BOX = { x: -5, y: -1, w: 11, h: 7 };
const HERO_CROWD_ON = 5, HERO_CROWD_OFF = 3, HERO_CROWD_X = 40, HERO_CROWD_Y = 30;
function paintHeroMark(c, ox, oy) {
  const arrow = (colour, dx, dy) => {
    c.fillStyle = colour;
    for (let r = 0; r < 5; r++) c.fillRect(ox - 4 + r + dx, oy + r + dy, 9 - 2 * r, 1);
  };
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) arrow('rgba(8,6,14,0.9)', dx, dy);
  arrow(HERO_WARM, 0, 0);
}

export const PLAYER_SPRITE = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,4,4,3,0,0],
  [0,0,0,3,3,0,0,3,3,0,0,0],
];

// Walk frame B (Sk408: "animate the player walking... simple and subtle"):
// same pose, feet splay out 1px — left foot steps left, right leg shifts
// right. Only the two leg rows differ; swapped in while actually moving.
export const PLAYER_SPRITE_WALK = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,0,4,4,3,0],
  [0,0,3,3,0,0,0,3,3,0,0,0],
];

const PALETTE = { 1: '#ffe9a8', 2: '#e8b04a', 3: '#7a4a1e', 4: '#3a6fd8' };

// ---- world-space ground decor (Sk408: bare ground read as sliding) ----------
// Deterministic per-run field: each CELL x CELL cell of the arena hashes to
// "has a piece / which type / where inside the cell" from (cx, cy, seed) — no
// stored arrays, and cells outside the camera view are simply never visited
// (off-screen cull for free). Same seed -> identical field, like weather.js.
function cellRand(cx, cy, seed, salt) {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
// Muted tone families — WAVE-9B/2: the family is chosen by WAVE NUMBER from
// CONFIG.GROUND.THEMES (per-wave area identity; the per-run groundSeed still
// shapes which cells carry a piece). Subtle by design: decor sits UNDER
// entities and must never compete with them for attention — except SNOWFIELD,
// which reads clearly brighter by request.
export function groundTheme(waveNum) {
  const t = C.GROUND.THEMES;
  return t[(Math.max(1, waveNum || 1) - 1) % t.length];
}

// F8 (audit 2026-09-16): the HUD purse readout clamped at 99999 — a maxed run
// banks 754,689g (G17 slice 1b), so the on-screen wallet SATURATED mid-run and
// every value past 99,999 read identically. Pure formatter, ONE definition,
// called by the GOLD badge below. Contract:
//   * 0..99999 — byte-identical to the old field: the number, space-padded to
//     5 chars.
//   * 100k..999k — ' 100k'..' 999k'; >=1M — '  1.0M'..' 9.9M' (one decimal),
//     then ' 10M'..' 999M'. Compacts are TRUNCATED (floor), never rounded up:
//     999,999 shows ' 999k', not '1000k'; 9,999,999 shows ' 9.9M', not '10M'.
//   * EVERY output is exactly 5 chars, so the badge's fixed-width geometry
//     (the H1 no-reflow contract this badge was built under) holds at any
//     purse size. >=1B extends the same ladder ('B'), still 5 chars.
//   * negative/NaN/undefined read as the zero field — never 'NaN' or 'undefined'
//     on the HUD.
export function fmtGold(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v <= 99999) return String(v).padStart(5, ' ');
  const band = (div, dec, suf) => dec
    ? (Math.floor(v / div) / 10).toFixed(1) + suf
    : Math.floor(v / div) + suf;
  if (v < 1e6) return band(1e3, false, 'k').padStart(5, ' ');   // 100k..999k
  if (v < 1e7) return band(1e5, true, 'M').padStart(5, ' ');    // 1.0M..9.9M
  if (v < 1e9) return band(1e6, false, 'M').padStart(5, ' ');   // 10M..999M
  if (v < 1e10) return band(1e8, true, 'B').padStart(5, ' ');   // 1.0B..9.9B
  return band(1e9, false, 'B').padStart(5, ' ');                // 10B..999B
}

// Wave-6: item-drop glow colors by rarity (loot.js) + arch gate colors.
const RARITY_COLORS = { COMMON: '#a8a8c0', RARE: '#4a8cff', EPIC: '#c46ad8', LEGENDARY: '#ffd75e' };
const ARCH_COLORS = {
  DOUBLE_FIRE: '#e8902a', MAGNET: '#4a8cff', SHIELD: '#a8e0ff',
  BERSERK: '#ff5566', SWIFT: '#68e080',
};

// Enemy looks now come from enemy_types.js resolveLook(typeId, variant):
// { body, trim, accent, shape, sizeMult } — hordes mix 2-3 palettes per type.
// Shape drawing from the e.w/e.h box (fillRect-composable, per hb4's contract):
//   block   — one w x h rect.
//   diamond — 3 stepped rows (middle full width, flanks half); 4 if h >= 20.
//   tall    — (w*0.7) x (h*1.3).  wide — (w*1.3) x (h*0.7).
function drawShape(g, shape, x, y, w, h) {
  const hw = Math.round(w / 2), hh = Math.round(h / 2);
  if (shape === 'tall') {
    const tw = Math.max(2, Math.round(w * 0.7)), th = Math.max(2, Math.round(h * 1.3));
    g.fillRect(x - Math.round(tw / 2), y - Math.round(th / 2), tw, th);
  } else if (shape === 'wide') {
    const tw = Math.max(2, Math.round(w * 1.3)), th = Math.max(2, Math.round(h * 0.7));
    g.fillRect(x - Math.round(tw / 2), y - Math.round(th / 2), tw, th);
  } else if (shape === 'diamond') {
    const rows = h >= 20 ? 4 : 3;
    const rowH = Math.max(1, Math.round(h / rows));
    for (let r = 0; r < rows; r++) {
      const frac = rows === 3 ? (r === 1 ? 1 : 0.5) : (r === 1 || r === 2 ? 0.75 : 0.25);
      const rw = Math.max(2, Math.round(w * frac));
      const ry = y - hh + r * rowH;
      g.fillRect(x - Math.round(rw / 2), ry, rw, rowH);
    }
  } else {
    g.fillRect(x - hw, y - hh, w, h);   // block
  }
}

// G10 rarity tell (rarity.js): the SAME 1px outline-ring vocabulary the elite
// gold uses, in the tier's own colour — NO new sprites. `o` is the ring's
// offset from the box (o=1 reproduces the elite ring's exact geometry). A
// MYTHIC pulses at its tell's Hz using the telegraph blink idiom, so it is
// distinguishable from a rare at a glance even inside a horde.
function rarityRing(g, e, state, x, y, w, h) {
  const t = RARITY[e.rarity];
  if (!t || !t.tell) return;
  const o = e.elite ? 2 : 1;   // outside the gold ring when the badges compose
  let col = t.tell.outline;
  if (t.tell.pulseHz && Math.floor((state.time || 0) * t.tell.pulseHz * 2) % 2 === 0) {
    col = '#efd9ff';           // pale-violet blink on the pulse phase
  }
  g.fillStyle = col;
  g.fillRect(x - o, y - o, w + 2 * o, 1);
  g.fillRect(x - o, y + h + o, w + 2 * o, 1);
  g.fillRect(x - o, y - o, 1, h + 2 * o);
  g.fillRect(x + w + o, y - o, 1, h + 2 * o);
}

// ---- FIRST-RUN PROLOGUE (owner 2026-09-18) ----------------------------------
// The potion, the banner card and the shield's rainbow pulse all live in
// this file; main.js owns the phase. Geometry rule: the SKIP button's rect
// is defined ONCE here (prologueSkipRect) — the canvas hit-test in main.js
// and the headless tests read the same numbers the painter paints.
//
// DEFECT (a) FIX (owner 2026-09-18: "there is no opt out, there's only a
// button to start the tutorial"): SKIP is a PERSISTENT button in the
// top-right corner, painted for the WHOLE phase — walk, banner, wait — not
// a link that only exists on the card. The skip is TWO-TAP (main.js
// prologueSkip arms on the first press; this painter flips the label while
// armed) so a stray press can never end the explaining, and a confirmed
// skip restores the full control set immediately. The corner is clear of
// the banner card (card x 90..390 at W=300; this x 392..472) and of the
// centred HUD clock.
export function prologueSkipRect() {
  return { x: C.VIEW_W - 88, y: 40, w: 80, h: 16 };   // under the run clock
}
const PROLOGUE_CARD_Y = 24, PROLOGUE_CARD_H = 64;   // title, two body lines, the cue
// PROLOGUE HUD CLEARANCE (brief docs/briefs/PROLOGUE_BANNER_CLEARANCE.md,
// owner tutorial priority 2026-09-18; the overlap was disclosed in
// docs/art/prologue-2026-09-18/REPORT.md): the banner card band (x 90..390,
// y 24..116) crosses the top-left HUD readouts and the event feed's first
// lines. During the LIVE phase those readouts are INERT — nothing can
// damage, cast, level or earn while the world is frozen — so drawHudChrome
// suppresses them (mechanism (b) of the brief) and drops the feed start
// below the card; the drink restores everything byte-identically.
const PROLOGUE_FEED_Y = PROLOGUE_CARD_Y + PROLOGUE_CARD_H + 10;   // 126: plate top (fy-2) clears the card by 8

// The ONE shared seam for the card's rect (the brief's prologueOkRect role —
// the OK button itself went away with the action-gating fix): the painter,
// the headless geometry tests and the browser verifier all read these exact
// numbers, so paint and assertion can never disagree.
export function prologueCardRect() {
  const W = Math.min(300, C.VIEW_W - 20);
  return { x: Math.round((C.VIEW_W - W) / 2), y: PROLOGUE_CARD_Y, w: W, h: PROLOGUE_CARD_H };
}
export function prologueFeedY() { return PROLOGUE_FEED_Y; }
// R3: the vitals block's numbers stop short of this x (view px); the boss
// rule plate starts right of it.
export const VITALS_MAX_RIGHT = 200;

// Reduced motion is read LIVE (the draftCeremonyEnabled precedent — one
// handler per feature, nothing global). False in the headless stub, which
// only matches coarse-pointer queries.
export function prefersReducedMotion() {
  try {
    const mm = (typeof window !== 'undefined') && window.matchMedia;
    return !!(mm && mm('(prefers-reduced-motion: reduce)').matches);
  } catch { return false; }
}

// R3 floor under reduced motion: a rich gem's glow holds still instead of
// pulsing, and a potion or item in its last BLINK_S shows dim instead of
// blinking (it still reads as leaving). Pure, so testable.
export function richGlowStrength(time, x, reduced) {
  return reduced ? 0.85 : 0.75 + 0.25 * Math.sin(time * 4 + x * 0.1);
}
export function leavingAlpha(leftS, time, reduced) {
  if (leftS >= C.FLOOR.BLINK_S) return 1;
  if (reduced) return 0.5;
  return Math.floor(time * 6) % 2 === 0 ? 0 : 1;
}

// The rainbow pulse's colour — a GENTLE cycle (40 deg/s), never a strobe;
// reduced motion gets a fixed healing-green. offsetDeg spreads the ring's
// ticks around the wheel (i*30 = a 180-deg arc) so one frame reads RAINBOW,
// not six dots of one hue (found in the verification shot); the reduced-motion
// branch ignores it (fixed colour, no motion at all). Pure, so testable.
export function prologueShieldColor(elapsedS, reduced, offsetDeg = 0) {
  const hue = reduced ? 140 : (Math.round(elapsedS * 40) + offsetDeg) % 360;
  return 'hsl(' + hue + ',85%,64%)';
}

// RUN-COUNT MILESTONE CHEST — the collection BURST (the "big and cool"
// addendum): a coin/spark shower + expanding ring at the spot the chest
// stood, aged by main.js on the WALL clock (mode 'burst' freezes the sim,
// so the shower plays out over the frozen field BEFORE the card opens —
// the burst-then-card contract). Integer pixels only; DETERMINISTIC angles
// (no per-frame randomness — the same shower every collection, and a test
// can pin it). Reduced motion: one static gold ring fading out, no flight.
// Pure painter: g + state + cam in, painted/not out.
export function drawChestBurst(g, state, cam) {
  const b = state.chestBurst;
  if (!b) return false;
  const p = Math.max(0, Math.min(1, b.t / C.RUN_CHEST.BURST_TTL));
  const x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
  const ring = (rr, col) => {
    g.fillStyle = col;
    g.fillRect(x - rr, y - 1, 2, 2); g.fillRect(x + rr - 2, y - 1, 2, 2);
    g.fillRect(x - 1, y - rr, 2, 2); g.fillRect(x - 1, y + rr - 2, 2, 2);
  };
  if (prefersReducedMotion()) {
    ring(10, 'rgba(255,215,94,' + (0.8 * (1 - p)).toFixed(2) + ')');
    return true;
  }
  // PORT SLICE K dressing (painter only — trigger, ttl, aging untouched):
  // white core cross (first fifth), expanding gold ring ticks, site-hashed
  // diagonal crackle (deterministic per burst site, never the wall clock),
  // the coin/spark shower (fixed angles, ease-out radius, slight lift —
  // every third spark white-hot, the rest chest-gold), pale echo ring.
  const hash = (((b.x | 0) * 73856093) ^ ((b.y | 0) * 19349663)) >>> 0;
  const ph = hash % 8;
  if (p < 0.2) {
    const ca = (0.85 * (1 - p / 0.2)).toFixed(2);
    g.fillStyle = 'rgba(255,255,255,' + ca + ')';
    g.fillRect(x - 10, y - 10, 20, 20);
    g.fillStyle = '#ffffff';
    g.fillRect(x - 1, y - 13, 2, 26);
    g.fillRect(x - 13, y - 1, 26, 2);
  }
  // The beacon's goodbye: an expanding ring of arc ticks, alpha fading.
  ring(6 + Math.round(p * 26), 'rgba(255,215,94,' + (0.9 * (1 - p)).toFixed(2) + ')');
  const echoR = 3 + Math.round(p * 13);
  g.fillStyle = 'rgba(255,233,168,' + (0.55 * (1 - p)).toFixed(2) + ')';
  g.fillRect(x - echoR, y - 1, 2, 2); g.fillRect(x + echoR - 2, y - 1, 2, 2);
  g.fillRect(x - 1, y - echoR, 2, 2); g.fillRect(x - 1, y + echoR - 2, 2, 2);
  // Hash-phased crackle: 8 diagonal flecks one step beyond the shower.
  const cdist = 10 + Math.round(p * 22);
  for (let i = 0; i < 8; i++) {
    const a = ((i * 2 + ph) / 16) * Math.PI * 2;
    const cx = x + Math.round(Math.cos(a) * cdist);
    const cy = y + Math.round(Math.sin(a) * cdist) - Math.round(p * 6);
    g.fillStyle = '#f8e098';
    g.fillRect(cx - 1, cy - 1, 2, 2);
  }
  // The coin/spark shower: fixed angles, ease-out radius, a slight lift —
  // every third spark white-hot, the rest chest-gold.
  const n = C.RUN_CHEST.BURST_SPARKS;
  const dist = 4 + Math.round(p * 22);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sx = x + Math.round(Math.cos(a) * dist);
    const sy = y + Math.round(Math.sin(a) * dist) - Math.round(p * 6);
    g.fillStyle = i % 3 === 0 ? '#ffffff' : '#f0c860';
    g.fillRect(sx - 1, sy - 1, 2, 2);
  }
  return true;
}

// TIER-2(e) CAPTURE SEAM: the projectile body painter, factored out of the
// frame loop so tools/capture_tier2_weapons.mjs can render a fired body
// through the SAME code the game draws. Geometry, phase sources (position
// hash / age / velocity / flight angle — never wall clock, never
// Math.random) and the <= 11 rects per body bound are unchanged.
export function paintProjectileBody(g, p, x, y, ph) {
  if (p.kind === 'boomerang') {
    // Crescent rang: steel arms on the spin axis, white leading edge,
    // blue fuller core, one hash glint at a tip. Spin timing is the
    // shipped alternation (age * 20, two phases) — <= 8 rects.
    const spin = Math.floor(p.age * 20) % 2 === 0;
    g.fillStyle = '#a8d0f4';
    if (spin) {
      g.fillRect(x - 4, y - 1, 9, 2);
      g.fillRect(x - 3, y - 2, 2, 1); g.fillRect(x + 2, y + 2, 2, 1);
    } else {
      g.fillRect(x - 1, y - 4, 2, 9);
      g.fillRect(x - 2, y - 3, 1, 2); g.fillRect(x + 2, y + 2, 1, 2);
    }
    g.fillStyle = '#ffffff';
    if (spin) { g.fillRect(x - 4, y - 1, 2, 1); }
    else { g.fillRect(x - 1, y - 4, 1, 2); }
    g.fillStyle = '#8aa0c0';
    g.fillRect(x - 1, y - 1, 2, 2);
    g.fillStyle = '#ffffff';
    const gx = spin ? ((ph & 1) === 0 ? 4 : -4) : 0;
    const gy = spin ? 0 : ((ph & 1) === 0 ? 4 : -4);
    g.fillRect(x + gx, y + gy, 1, 1);
    return;
  }
  if (p.kind === 'seeker') {
    // Hydra missile: white nose cone on the flight angle, gold body,
    // ember tail fins perpendicular to flight, hot exhaust dot. The head
    // lead (+2 along ang) is the shipped geometry — <= 9 rects.
    const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
    const hx = Math.round(x + ca * 2), hy = Math.round(y + sa * 2);
    const tx = Math.round(x - ca * 2), ty = Math.round(y - sa * 2);
    const px = Math.round(-sa * 2), py = Math.round(ca * 2);
    g.fillStyle = '#f8e098';
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = '#ffffff';
    g.fillRect(hx - 1, hy - 1, 2, 2);
    g.fillRect(Math.round(x + ca * 3), Math.round(y + sa * 3), 1, 1);
    g.fillStyle = '#e8902a';
    g.fillRect(tx + px - 1, ty + py - 1, 2, 2);
    g.fillRect(tx - px - 1, ty - py - 1, 2, 2);
    g.fillStyle = (ph & 2) === 0 ? '#f0c860' : '#f8e098';
    g.fillRect(tx, ty, 1, 1);
    return;
  }
  if (p.kind === 'mine') {
    // Armed mine: dark hull (shipped disc), steel rim ticks, brass studs,
    // the shipped 1Hz arming lamp, one hash-phased glint. Blink timing is
    // the shipped (age * 2) alternation — <= 10 rects.
    g.fillStyle = '#433e4e';
    g.fillRect(x - 3, y - 2, 7, 5);
    g.fillRect(x - 2, y - 3, 5, 7);
    g.fillStyle = '#7c7886';
    g.fillRect(x - 3, y - 3, 2, 1); g.fillRect(x + 2, y - 3, 2, 1);
    g.fillRect(x - 3, y + 3, 2, 1); g.fillRect(x + 2, y + 3, 2, 1);
    g.fillStyle = '#e2aa38';
    g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 2, y + 1, 1, 1);
    g.fillStyle = Math.floor((p.age || 0) * 2) % 2 === 0 ? '#e06a74' : '#7a222a';
    g.fillRect(x - 1, y - 1, 2, 2);
    if ((ph & 3) === 0) {
      g.fillStyle = '#e4e2ea';
      g.fillRect(x + 1, y - 3, 1, 1);
    }
    return;
  }
  if (p.kind === 'javelin') {
    // TIER-2(e) Sun Javelin: steel shaft along the flight vector, gold
    // sun-disc head, white-hot tip, wood butt spike. Quantized to 8 ways. <= 8 rects.
    const ja = (p.dx || p.dy) ? Math.atan2(p.dy || 0, p.dx || 0) : 0;
    const joct = ((Math.round(ja / (Math.PI / 4)) % 8) + 8) % 8;
    const JX = [1, 1, 0, -1, -1, -1, 0, 1], JY = [0, 1, 1, 1, 0, -1, -1, -1];
    const jdx = JX[joct], jdy = JY[joct];
    if (p.evo) {
      // SOLAR LANCE: a longer gold shaft, white-hot head, four corona ticks.
      g.fillStyle = '#e2aa38';
      g.fillRect(x - jdx * 2 - 1, y - jdy * 2 - 1, 3, 3);
      g.fillRect(x - 1, y - 1, 3, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(x + jdx * 3 - 1, y + jdy * 3 - 1, 3, 3);
      g.fillRect(x + jdx * 5, y + jdy * 5, 1, 1);
      g.fillStyle = '#f8e098';
      g.fillRect(x - jdy * 3, y + jdx * 3, 1, 1); g.fillRect(x + jdy * 3, y - jdx * 3, 1, 1);
      g.fillRect(x - jdx * 4, y - jdy * 4, 1, 1);
      return;
    }
    g.fillStyle = '#8aa0c0';
    g.fillRect(x - jdx - 1, y - jdy - 1, 2, 2);
    g.fillRect(x - 1, y - 1, 2, 2);
    g.fillStyle = '#f8e098';
    g.fillRect(x + jdx * 2 - 1, y + jdy * 2 - 1, 2, 2);
    g.fillStyle = '#ffffff';
    g.fillRect(x + jdx * 3, y + jdy * 3, 1, 1);
    g.fillStyle = '#7a4c0e';
    g.fillRect(x - jdx * 2, y - jdy * 2, 1, 1);
    if ((ph & 2) === 0) {
      g.fillStyle = '#e4e2ea';
      g.fillRect(x - jdx, y - jdy, 1, 1);
    }
    return;
  }
  if (p.kind === 'ember') {
    // Ember Shot: hot core, orange body, gold cap, two hash sparks. <= 7 rects.
    // INFERNO: a wider flame with a white-blue heart.
    g.fillStyle = p.evo ? '#e8902a' : '#a46a16';
    g.fillRect(x - 2, y - 2, 5, 5);
    if (p.evo) { g.fillRect(x - 3, y - 1, 7, 3); g.fillRect(x - 1, y - 3, 3, 7); }
    g.fillStyle = p.evo ? '#f0c860' : '#e8902a';
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = p.evo ? '#ffffff' : '#f8e098';
    g.fillRect(x, y, 1, 1);
    if ((ph & 1) === 0) {
      g.fillStyle = '#f0c860';
      g.fillRect(x + 2, y - 3, 1, 1);
    }
    if ((ph & 2) === 0) {
      g.fillStyle = '#e8902a';
      g.fillRect(x - 3, y + 2, 1, 1);
    }
    return;
  }
  if (p.kind === 'ricochet') {
    // TIER-2(e) Ricochet: steel ball on the flight angle with a blue bounce
    // chevron behind it. <= 8 rects.
    const ra = (p.dx || p.dy) ? Math.atan2(p.dy || 0, p.dx || 0) : 0;
    const roct = ((Math.round(ra / (Math.PI / 4)) % 8) + 8) % 8;
    const RX = [1, 1, 0, -1, -1, -1, 0, 1], RY = [0, 1, 1, 1, 0, -1, -1, -1];
    const rdx = RX[roct], rdy = RY[roct];
    // PRISM SHOT: the ball cycles through prism colours by position hash and
    // trails a second chevron.
    const PRISM = ['#e06a74', '#f0c860', '#acc084', '#a8d0f4'];
    g.fillStyle = p.evo ? PRISM[ph & 3] : '#a8d0f4';
    g.fillRect(x - 1, y - 1, 3, 3);
    if (p.evo) { g.fillStyle = PRISM[(ph + 2) & 3]; g.fillRect(x - rdx * 4, y - rdy * 4, 2, 2); }
    g.fillStyle = '#e4e2ea';
    g.fillRect(x, y, 1, 1);
    g.fillStyle = p.evo ? '#ffffff' : '#8aa0c0';
    g.fillRect(x - rdx * 2, y - rdy * 2, 1, 1);
    g.fillRect(x - rdx * 2 - rdy, y - rdy * 2 + rdx, 1, 1);
    g.fillRect(x - rdx * 2 + rdy, y - rdy * 2 - rdx, 1, 1);
    if ((ph & 3) === 0) {
      g.fillStyle = '#ffffff';
      g.fillRect(x - rdx * 3, y - rdy * 3, 1, 1);
    }
    return;
  }
  if (p.kind === 'firepatch') {
    // Burning ground: a ring of embers that flickers with age and fades over
    // its life; meteor craters burn violet, inferno kills burn gold. <= 20 rects.
    const life = Math.max(0, 1 - (p.age || 0) / 2);
    const flick = Math.floor((p.age || 0) * 12) % 2;
    const r = p.radius || 20;
    const hot = p.tint === 'meteor' ? '#b49ad4' : '#f0c860';
    const cool = p.tint === 'meteor' ? '#8c6cb4' : '#e8902a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (ph % 7) * 0.13;
      const rr = r * (0.55 + 0.45 * (((ph >> i) & 1) ^ flick));
      g.fillStyle = (i + flick) % 2 === 0 ? hot : cool;
      const sz = life > 0.5 ? 2 : 1;
      g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), sz, sz);
    }
    g.fillStyle = flick ? hot : '#ffffff';
    g.fillRect(x - 1, y - 1, 2, 2);
    return;
  }
  // Volley arrow: shaft along the flight vector (vx/vy are sim state, so
  // the orientation is deterministic), white-hot head, ember fletch
  // perpendicular at the tail. Quantized to 8 ways on the integer grid.
  // Generic fallback (no velocity — never happens in live runs, kept for
  // planted-geometry tests) flies east. <= 7 rects.
  const vv = (p.vx || p.vy) ? Math.atan2(p.vy || 0, p.vx || 0) : 0;
  const oct = ((Math.round(vv / (Math.PI / 4)) % 8) + 8) % 8;
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const dx = DX[oct], dy = DY[oct];
  const qx = -dy, qy = dx;   // perpendicular (fletch axis)
  g.fillStyle = '#f8e098';
  g.fillRect(x + dx - 1, y + dy - 1, 2, 2);
  g.fillStyle = '#e8902a';
  g.fillRect(x - dx * 2, y - dy * 2, 1, 1);
  g.fillRect(x - dx * 2 + qx, y - dy * 2 + qy, 1, 1);
  g.fillRect(x - dx * 2 - qx, y - dy * 2 - qy, 1, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(x + dx * 2 - 1, y + dy * 2 - 1, 2, 2);
  g.fillRect(x + dx * 3, y + dy * 3, 1, 1);
}

// ---- cached pickup / shot painters ------------------------------------------
// Each painter draws at an origin; sprite_cache rasterises it once per key
// (outline baked) and falls back to calling it directly when headless.
const GEM_BOX = { x: -3, y: -4, w: 7, h: 9 };
const GEM_TIERS = [
  ['#4dffd2', '#b6fff0', '#139e8a'],   // small: teal
  ['#5ab0ff', '#d8f0ff', '#2a6ad8'],   // mid: blue
  ['#d07aff', '#f4dcff', '#8a3ad8'],   // large: violet
];
const GEM_PAINT = [];
// Gems recede in a crowd (see the gem pass in render()). The crowd state goes
// on past CROWD gems on screen and off under CROWD_OFF, so it does not flicker.
// FAR is the floor's KEEP_NEAR (config.js C.FLOOR): the gems the picture fades
// are the gems the floor may merge for real. Nothing merges in the picture alone.
export const GEM_RECEDE = { CROWD: 40, CROWD_OFF: 30, FAR: C.FLOOR.KEEP_NEAR, FAR_ALPHA: 0.35 };
// R3 floor: a RICH gem (merged on the floor, entities.js richStep) is a bigger
// crystal above the three tiers, one size per step of C.FLOOR.RICH_XP, in the
// reward family (bright aqua-mint; never the danger red-orange or the hero's
// warm white), with a glow that grows with it.
export const GEM_RICH = { body: '#5fffd8', hi: '#e6fffa', lo: '#139e8a', core: '#b6fff0', glow: '#4dffd2' };
const GEM_RICH_BOX = [];
const GEM_RICH_PAINT = [];
for (let k = 1; k <= 4; k++) {
  const h = 4 + k, w = 2 + k;   // half height, half width
  GEM_RICH_BOX.push({ x: -w - 1, y: -h - 1, w: 2 * w + 3, h: 2 * h + 3 });
  GEM_RICH_PAINT.push((g, x, y) => {
    // A tall cut crystal: rows narrow toward the tips.
    for (let dy = -h; dy <= h; dy++) {
      const half = Math.max(0, Math.round(w * (1 - Math.abs(dy) / (h + 1)) + 0.4));
      g.fillStyle = dy < 0 ? GEM_RICH.body : GEM_RICH.lo;
      g.fillRect(x - half, y + dy, 2 * half + 1, 1);
      g.fillStyle = GEM_RICH.core;
      if (half > 1) g.fillRect(x, y + dy, 1, 1);   // the bright centre facet line
    }
    g.fillStyle = GEM_RICH.hi;
    g.fillRect(x - Math.max(1, w - 2), y - h + 2, 2, Math.max(2, h - 2));
    if (k >= 3) {   // the big ones sparkle at the corners
      g.fillRect(x - w - 1, y - 1, 1, 1); g.fillRect(x + w + 1, y - 1, 1, 1);
      g.fillRect(x, y - h - 1, 1, 1);
    }
  });
}
export { GEM_RICH_BOX };
// R3 floor: how solid an opened chest's art is, `lay` s after it opened: solid,
// then fading over the last REMNANT_FADE_S of REMNANT_S, then gone (0).
export function remnantAlpha(lay, F = C.FLOOR) {
  if (!(lay < F.REMNANT_S)) return 0;
  return Math.max(0, Math.min(1, (F.REMNANT_S - lay) / F.REMNANT_FADE_S));
}
for (const [body, hi, lo] of GEM_TIERS) {
  for (const lit of [0, 1]) {
    GEM_PAINT.push((g, x, y) => {
      g.fillStyle = body;
      g.fillRect(x - 1, y - 3, 3, 7);
      g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = lo;
      g.fillRect(x + 1, y + 1, 1, 2);
      g.fillStyle = lit ? '#ffffff' : hi;
      g.fillRect(x - 1, y - 2, lit ? 2 : 1, 2);
    });
  }
}
const POTION_BOX = { x: -3, y: -6, w: 7, h: 11 };
function potionPainter(body, hi) {
  return (g, x, y) => {
    g.fillStyle = body;
    g.fillRect(x - 2, y - 2, 5, 6);
    g.fillRect(x - 1, y - 4, 3, 2);
    g.fillStyle = hi;
    g.fillRect(x - 1, y - 1, 1, 3);
    g.fillStyle = '#e4e2ea';
    g.fillRect(x - 1, y - 5, 3, 1);
  };
}
const paintPotionHp = potionPainter('#ff4a5e', '#ffb0b8');
const paintPotionMp = potionPainter('#4a8cff', '#a8d0f4');

function blitChest(g, art, x, y, lit) {
  if (!cacheEnabled()) { paintChest(g, art, x, y, lit); return; }
  blitGrid(g, art.grid, art.palette, x, y, STYLE_ITEM);
  if (lit && art.glint) {
    g.fillStyle = art.palette[5];
    for (const [dx, dy] of art.glint) g.fillRect(x + dx, y + dy, 1, 1);
  }
}

// drawGrid-shaped blit for the painters that take a grid painter (props,
// item portraits): cached raster, or the per-pixel fallback.
function blitPlain(g, grid, palette, x, y, scale = 1) {
  blitGrid(g, grid, palette, x, y, STYLE_PLAIN, scale);
}
// Stage props on the field: the structure standard (outline, top-left light,
// cast shadow) — world art makeover.
function blitProp(g, grid, palette, x, y, scale = 1) {
  blitGrid(g, grid, palette, x, y, STYLE_STRUCT, scale);
}

// A building is a fixed rect list: one cached raster per design. Returns the
// design's rect count either way (the landmarks seam reports it).
const buildingBoxes = new Map();
function blitBuilding(g, id, x, y) {
  const b = STAGE_BUILDINGS[id];
  if (!b) return 0;
  if (!cacheEnabled()) return paintBuilding(g, id, x, y);
  let box = buildingBoxes.get(id);
  if (!box) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [dx, dy, w, h] of b.rects) {
      x0 = Math.min(x0, dx); y0 = Math.min(y0, dy);
      x1 = Math.max(x1, dx + w); y1 = Math.max(y1, dy + h);
    }
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    buildingBoxes.set(id, box);
  }
  blitPainted(g, 'bld:' + id, box, (c, ox, oy) => paintBuilding(c, id, ox, oy), x, y, STYLE_STRUCT);
  return b.rects.length;
}

// Enemy shots: a bright ring instead of the dark one, so a shot reads as
// danger against any ground.
// R1 (the November review): every enemy shot is a ROUND RED-ORANGE ORB. The old
// green spit and violet bolt wore the gems' colours, so danger looked like reward;
// red-orange is the colour reserved for danger. The kinds differ by size and core:
// spit a small orb, bolt (WARLOCK) a big one with a hot core, nova (boss burst) a
// lighter orange, the Maw's barrage a redder one with a white-hot core.
const STYLE_SHOT = spriteStyle({ outline: '#ffffff' });
// R6: on a light floor (snow, sand, ash) a pale rim melts into the ground, so
// the orb wears a dark rim there, like every other thing on the floor. Inside
// it the pale ring stays, so in a crowd the orb does not share the enemies'
// plain dark outline (as the hero keeps its warm ring inside its keyline).
const STYLE_SHOT_LIGHT = spriteStyle({ outline: '#ffffff', outline2: '#0b0912' });
export { STYLE_SHOT, STYLE_SHOT_LIGHT };
const SHOT_BOX = { x: -4, y: -5, w: 9, h: 10 };
// A pixel disc of radius 2 (5x5) or 3 (7x7) centred on x, y.
function shotOrb(g, x, y, r, body, core, coreW, shade) {
  g.fillStyle = body;
  if (r >= 3) {
    g.fillRect(x - 1, y - 3, 3, 1); g.fillRect(x - 2, y - 2, 5, 1); g.fillRect(x - 3, y - 1, 7, 3);
    g.fillRect(x - 2, y + 2, 5, 1); g.fillRect(x - 1, y + 3, 3, 1);
  } else {
    g.fillRect(x - 1, y - 2, 3, 1); g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y + 2, 3, 1);
  }
  g.fillStyle = shade; g.fillRect(x, y + r, 2, 1);                       // the lower rim, in shadow
  g.fillStyle = core; g.fillRect(x - 1, y - 1, coreW, coreW);            // the hot core, up and left
}
const SHOT_PAINT = {
  bolt(g, x, y) { shotOrb(g, x, y, 3, '#ff4a14', '#f8e098', 3, '#b02608'); },
  nova(g, x, y) { shotOrb(g, x, y, 2, '#ff6a24', '#f8e098', 1, '#b02608'); },
  maw(g, x, y) { shotOrb(g, x, y, 2, '#ff4a14', '#ffffff', 2, '#7a222a'); },
  spit(g, x, y) { shotOrb(g, x, y, 2, '#ff4a14', '#f0c860', 1, '#b02608'); },
};
export { SHOT_PAINT, GEM_TIERS };   // test/test_enemy_shot_orbs.mjs

// Player projectiles through the cache: the body painter's discrete inputs
// (kind, 8-way heading, spin / blink phase, glint bit) form the key, and a
// stand-in projectile carrying exactly those inputs is what gets rasterised.
const PROJ_BOX = { x: -7, y: -7, w: 15, h: 15 };
const OCT_X = [1, 1, 0, -1, -1, -1, 0, 1], OCT_Y = [0, 1, 1, 1, 0, -1, -1, -1];
const octOf = (dx, dy) => (dx || dy)
  ? ((Math.round(Math.atan2(dy || 0, dx || 0) / (Math.PI / 4)) % 8) + 8) % 8 : 0;
function blitProjectile(g, p, x, y, ph) {
  let key, proxy, bits;
  if (p.kind === 'firepatch') { paintProjectileBody(g, p, x, y, ph); return; }
  if (p.kind === 'boomerang') {
    const spin = Math.floor(p.age * 20) % 2 === 0;
    bits = ph & 1; key = 'pj:boom:' + (spin ? 1 : 0) + bits;
    proxy = { kind: p.kind, age: spin ? 0 : 0.05 };
  } else if (p.kind === 'seeker') {
    const q = ((Math.round((p.ang || 0) / (Math.PI / 12)) % 24) + 24) % 24;
    bits = ph & 2; key = 'pj:seek:' + q + ':' + bits;
    proxy = { kind: p.kind, ang: q * (Math.PI / 12) };
  } else if (p.kind === 'mine') {
    const blink = Math.floor((p.age || 0) * 2) % 2 === 0;
    bits = (ph & 3) === 0 ? 0 : 1; key = 'pj:mine:' + (blink ? 1 : 0) + bits;
    proxy = { kind: p.kind, age: blink ? 0 : 0.5 };
  } else if (p.kind === 'javelin' || p.kind === 'ricochet') {
    const o = octOf(p.dx, p.dy);
    bits = p.kind === 'javelin' ? (ph & 2) : (p.evo ? (ph & 3) : ((ph & 3) === 0 ? 0 : 1));
    key = 'pj:' + p.kind + (p.evo ? 'E' : '') + ':' + o + ':' + bits;
    proxy = { kind: p.kind, dx: OCT_X[o], dy: OCT_Y[o], evo: !!p.evo };
  } else if (p.kind === 'ember') {
    bits = ph & 3; key = 'pj:ember' + (p.evo ? 'E' : '') + ':' + bits;
    proxy = { kind: p.kind, evo: !!p.evo };
  } else {
    const o = octOf(p.vx, p.vy);
    bits = 0; key = 'pj:volley:' + o;
    proxy = { vx: OCT_X[o], vy: OCT_Y[o] };
  }
  blitPainted(g, key, PROJ_BOX, (c, ox, oy) => paintProjectileBody(c, proxy, ox, oy, bits), x, y, STYLE_ITEM);
}

// ---------- Fused weapons (fusions.js) ----------
// Every body a fused weapon throws wears the fusion's CORONA: four corner
// sparks in its first tint and two edge sparks in its second, the edge pair
// turning with the body's position hash. <= 6 rects, cached per fusion.
export function paintFusionCorona(g, def, x, y, bits) {
  g.fillStyle = def.tint[0];
  g.fillRect(x - 4, y - 4, 1, 1); g.fillRect(x + 4, y - 4, 1, 1);
  g.fillRect(x - 4, y + 4, 1, 1); g.fillRect(x + 4, y + 4, 1, 1);
  g.fillStyle = def.tint[1];
  if (bits) { g.fillRect(x - 6, y, 2, 1); g.fillRect(x + 5, y, 2, 1); }
  else { g.fillRect(x, y - 6, 1, 2); g.fillRect(x, y + 5, 1, 2); }
}
function blitFusionCorona(g, def, x, y, ph, cached) {
  const bits = (ph >> 3) & 1;
  if (cached) blitPainted(g, 'pj:fus:' + def.id + ':' + bits, PROJ_BOX, (c, ox, oy) => paintFusionCorona(c, def, ox, oy, bits), x, y, STYLE_PLAIN);
  else paintFusionCorona(g, def, x, y, bits);
}
// The fusion's 5x5 emblem ('a' = first tint, 'b' = second) at z pixels a cell:
// the HUD weapon slot of a fused weapon.
export function paintFusionMark(g, def, x, y, z) {
  for (let ry = 0; ry < def.mark.length; ry++) {
    const row = def.mark[ry];
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === '.') continue;
      g.fillStyle = row[rx] === 'a' ? def.tint[0] : def.tint[1];
      g.fillRect(x + rx * z, y + ry * z, z, z);
    }
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // WAVE-24 (#3): the ground decor seams (filled every frame in render):
    // this.landmarks = the structures painted this frame (world coords),
    // this.arenaWall / this.hudChrome / this.bossBanner = the existing seams.
    this.landmarks = [];
    // N6 (audit 2026-09-16) static-content caches, measured before landing in
    // real Chrome (tools/verify_nits_n6.mjs): the radar's plate/rim disc
    // (0.24 ms/frame as ~4,700 sqrt-gated 1px fills) is painted ONCE into an
    // offscreen canvas and blitted per frame; the boss banner's text FIT
    // (0.15 ms/frame as a per-frame measureText ladder) is computed once per
    // banner strings. Counters expose the cache-hit seam to the tests.
    this._radarPlate = null;
    this._radarPlateKey = '';
    this.radarPlateBuilds = 0;
    this._bannerFit = null;
    this.bossBannerFits = 0;
    // World scale: how much larger than the HUD the world layer draws (see
    // resize). 1 until a real layout says there are pixels to spare.
    this.worldScale = 1;
    // R6 LIGHT: the light layer and the level it draws at (2 ON, 1 LOW, 0
    // OFF; main.js sets it from the setting and the governor each frame).
    this.light = new LightLayer();
    this.lightLevel = 2;
    this.lightMix = null;   // the level on its way (main.js fades a step); null = no fade
    this.lightMs = 0;       // what the last compose cost (ms)
    this.lightOut = null;
    setCacheHost(canvas);
    this.resize();
  }

  // WAVE-18 (#4) made the backing store VIEW*dpr; WAVE-23 goes further: the
  // backing store is now the REAL displayed pixel size (CSS size x dpr, from
  // the layout rect), with the base transform mapping view coordinates onto
  // it. On a 1280x720 dpr=1 desktop the buffer was 480x300 upscaled by CSS —
  // every glyph rasterised at 8px then nearest-resampled (soft, uneven 2/3px
  // art pixels). Now glyphs rasterise 1:1 at device resolution (canvas text
  // under a scale transform renders its vector outlines at final size), and
  // PIXEL-PERFECT mode (main.js fitCanvas) makes the CSS scale an integer so
  // art pixels are uniform NxN. Smoothing stays OFF for the sprite pass.
  // Headless fallback: no layout rect -> VIEW-sized buffer, 1:1 transform
  // (every existing test assertion is in view coordinates). Assigning
  // canvas.width resets ctx state, so transform + smoothing are re-asserted
  // on every resize.
  resize(dprOverride) {
    const rawDpr = dprOverride !== undefined ? dprOverride
      : ((typeof globalThis.window !== 'undefined' && globalThis.window.devicePixelRatio) || 1);
    const dpr = Math.max(1, Math.min(3, rawDpr || 1));
    this.dpr = dpr;
    let cssW = C.VIEW_W, cssH = C.VIEW_H;
    try {
      const r = this.canvas.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) { cssW = r.width; cssH = r.height; }
    } catch { /* headless stub */ }
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.viewScale = { sx: this.canvas.width / C.VIEW_W, sy: this.canvas.height / C.VIEW_H };
    this.ctx.setTransform(this.viewScale.sx, 0, 0, this.viewScale.sy, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.worldScale = Renderer.worldScaleFor(this.viewScale.sx);
    // G12: assigning canvas.width cleared the canvas — the title card must be
    // recomposed on the next title frame.
    this._titlePainted = false;
  }

  // WORLD SCALE: the world layer draws about a third larger than the HUD so
  // actors read on a phone, while the HUD keeps its 480x300 layout. The
  // factor is snapped so one world pixel covers a whole number of device
  // pixels (crisp art): for `vs` device px per view px, pick the integer n
  // nearest vs * 1.36 and scale by n / vs, accepted only inside 1.2..1.6.
  // A display with no pixels to spare (vs near 1, and the headless harness)
  // stays at 1. The user's integer zoom multiplies on top.
  static worldScaleFor(vs) {
    if (!(vs > 0)) return 1;
    const n = Math.round(vs * 1.36);
    for (const k of [n, n + 1]) {
      const sc = k / vs;
      if (sc >= 1.2 && sc <= 1.6) return sc;
    }
    return 1;
  }

  drawSprite(g, grid, x, y) {
    this.drawGrid(g, grid, PALETTE, x, y);
  }

  // One live enemy through the sprite cache: tells under the body, then a
  // single blit whose baked variant carries outline, rim light, contact
  // shadow, hit flash, chill tint and the elite / rarity / telegraph ring.
  // An elite's body is ELITE_TEMPLATE.sizeMult larger, so its sprite is drawn
  // that much larger too (the same raster, stretched about the body centre).
  drawActor(g, e, spr, x, y, state, reduced = false) {
    const grow = e.elite && !e.boss ? ELITE_TEMPLATE.sizeMult : 1;
    const bw = Math.round(spr.box.w * grow), bh = Math.round(spr.box.h * grow);
    const sx = x - Math.round(spr.anchor.x * grow), sy0 = y - Math.round(spr.anchor.y * grow);
    // The pose (src/actor_anim.js): facing, bob, spawn pop and hit squash.
    // The pools of light stay on the ground; the body, crown and bar lift.
    const pose = enemyPose(e, trackOf(state, e), reduced, spr.frames.length);
    const sy = sy0 - pose.lift;
    const t = state.time || 0;
    const tier = e.rarity ? RARITY[e.rarity] : null;
    const tell = tier && tier.tell ? tier.tell : null;
    const tele = !!e.telegraph;
    // A sprite with a wind-up pose (bosses.js `tell`) holds it while it telegraphs.
    const frame = tele && spr.tell ? spr.tell : spr.frames[Math.floor((e.age || 0) * 6) % spr.frames.length];
    const feet = sy0 + bh - 1;
    const blink = Math.floor(t * 12) % 2 === 0;
    // Pools of light on the ground: red and growing under a wind-up, violet
    // under a boss, gold under an elite, the tier colour under a rare.
    if (tele) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 9));
      blitGlow(g, '#ff4a14', Math.round(bw * (e.boss ? 1.1 : 1.3)) + 4, x, feet, 0.5 + 0.5 * pulse); // wind-up tell: danger
    } else if (e.boss) {
      blitGlow(g, bossPool(spr, !!(this && this.groundLight)) || '#c46ad8', bw + 2, x, feet, BOSS_POOL_ALPHA);   // bossdark: its own hue
    } else if (e.elite) {
      blitGlow(g, '#f0c860', bw + 3, x, feet, 0.6 + 0.4 * Math.abs(Math.sin(t * 4 + e.x)));
    } else if (tell) {
      blitGlow(g, tell.outline, bw + 1, x, feet, 0.75);
    }
    const ring = actorRing(e, spr, tele, blink, tell, t);
    // bossdark: a boss's dark body is carried by its bright rim on a dark
    // floor and by a dark keyline outside it on a light one (not while it
    // flashes: the hit flash stays white, as before).
    const keyline = !!(e.boss && spr.rim && !(e.flash > 0) && this && this.groundLight);
    blitGridPose(g, frame, spr.palette, sx, sy, actorStyle(e.flash > 0, e.slow > 0, ring, !e.flying, !e.boss && !e.elite, keyline), grow,
      pose.flip, pose.kx, pose.ky, sx + bw / 2, sy + bh);
    if (e.typeId === 'COLOSSUS') {
      // The shoulder braziers burn just above the horns.
      const fi = Math.floor(t * 10) % FLAME.small.length;
      blitGrid(g, FLAME.small[fi], FLAME.palette, x - Math.round(7 * grow), sy - 6);
      blitGrid(g, FLAME.small[fi], FLAME.palette, x + Math.round(3 * grow), sy - 6);
    }
    // Elite crown pips / wind-up warning mark over the head.
    if (tele) {
      g.fillStyle = blink ? '#ffffff' : '#ff4a14'; // wind-up tell: danger
      g.fillRect(x - 1, sy - 11, 2, 5);
      g.fillRect(x - 1, sy - 5, 2, 2);
    } else if (e.elite && !e.boss) {
      g.fillStyle = '#f0c860';
      g.fillRect(x - 3, sy - 5, 1, 2); g.fillRect(x, sy - 6, 1, 3); g.fillRect(x + 3, sy - 5, 1, 2);
      g.fillRect(x - 3, sy - 3, 7, 1);
    }
    if (e.hp < e.maxHp) {
      const th = (e.elite || e.boss) ? 2 : 1;
      const by = sy - (tele || (e.elite && !e.boss) ? 14 : 4) - th;
      g.fillStyle = '#0b0912';
      g.fillRect(sx - 1, by - 1, bw + 2, th + 2);
      g.fillStyle = e.elite ? '#f0c860' : '#e06a74';
      g.fillRect(sx, by, Math.max(1, Math.ceil(bw * e.hp / e.maxHp)), th);
    }
  }

  // The collapse: each killed body (feel corpses) squashes flat in its last
  // pose, white for the first beat (a plain dark body on a light floor: the
  // white outline there is the hurt hero's), then its puff takes over. Reduced motion
  // holds the body still for the same beat instead.
  drawCorpses(g, state, cam, cull, reduced) {
    for (const c of state.feel.corpses) {
      const e = c.e;
      const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : (enemySpriteFor(e.typeId) || SPRITES[e.typeId]);
      if (!spr || c.age < 0) continue;
      const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y) - (e.flying ? Math.round(e.z || 0) : 0);
      if (cull(x, y, 30)) continue;
      const grow = e.elite && !e.boss ? ELITE_TEMPLATE.sizeMult : 1;
      const bw = Math.round(spr.box.w * grow), bh = Math.round(spr.box.h * grow);
      const sx = x - Math.round(spr.anchor.x * grow), sy = y - Math.round(spr.anchor.y * grow);
      const t = c.age / c.ttl;
      const pose = collapsePose(t, reduced);
      const frame = spr.frames[Math.floor((e.age || 0) * 6) % spr.frames.length];
      blitGridPose(g, frame, spr.palette, sx, sy, corpseStyle(t < 0.35, !!this.groundLight, !e.flying, !e.boss && !e.elite,
        e.boss ? spr.rim : null, !!(e.boss && spr.rim && this.groundLight)), grow,
        c.face < 0, pose.kx, pose.ky, sx + bw / 2, sy + bh);
    }
  }

  // Generic pixel-grid painter (sprites.js enemies/boss/flames carry their own
  // palette objects keyed 1..9; 0 = transparent).
  //
  // G9: `scale` is an INTEGER pixel-block size (default 1, so every existing
  // caller paints exactly as before). It exists for the trophy showcase, which
  // paints ONE 32x32 emblem at the largest whole-factor size that fits the
  // view. A canvas transform could do the same job, but the game's pixel-art
  // convention is uniform NxN blocks and a per-pixel fillRect keeps the
  // painted geometry measurable — the gallery test reads the real rects.
  drawGrid(g, grid, palette, x, y, scale = 1) {
    const s = Math.max(1, Math.floor(scale));
    for (let ry = 0; ry < grid.length; ry++) {
      const row = grid[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const v = row[rx];
        if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx * s, y + ry * s, s, s); }
      }
    }
  }

  // ---- G12 TITLE SCREEN --------------------------------------------------------
  // Paints the authored title card (src/art/title.js — composeTitle/drawTitle
  // expand its layers to view pixels ONCE and memoize; no art is restated here)
  // and publishes the seam `this.titleScreen = { x, y, w, h, scale }` so a
  // headless test owns the geometry, exactly like trophyShowcase/bestiary.
  //
  // SCALE: the largest INTEGER number of view pixels per composed title pixel
  // that fits the view (it is 1 today — the card is authored at exactly
  // 480x300 — but the guard keeps a future view change honest). Sub-pixel
  // scaling is what smoothing would buy; it is refused, per house style.
  //
  // PAINT ONCE: the composition is static and nothing else draws on the canvas
  // while 'title' is live (the frame loop's other canvas calls no-op in this
  // mode), so the layers are painted on the first title frame after a change
  // and skipped after — the composed sky alone is ~10^5 pixels, and repainting
  // it every frame would be pure waste. resize() invalidates the cache
  // (assigning canvas.width clears the surface); leaving the mode does too.
  drawTitleScreen(g) {
    const scale = Math.max(1, Math.min(Math.floor(C.VIEW_W / TITLE_WIDTH),
                                        Math.floor(C.VIEW_H / TITLE_HEIGHT)));
    const w = TITLE_WIDTH * scale, h = TITLE_HEIGHT * scale;
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);
    if (!this._titlePainted) {
      // OWNER 2026-09-18: "On the main menu, I can see the run screen bleeding
      // through some of the intersections." The title card has transparent gaps
      // between its cards, and the surface was only filled when the card FAILED
      // to fit the viewport - so a stale frame (the intro, a finished run) showed
      // through those gaps. Fill the whole surface unconditionally: at the title
      // the canvas is the title's, and nothing else may read through it.
      g.fillStyle = '#05050a';
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      // One fillRect per run of equal pixels: the per-pixel painter took
      // about 70 ms here (2 x 10^5 rects), one long frame as the title came up.
      drawTitle(paintGridRuns, g, x, y);
      this._titlePainted = true;
    }
    this.titleScreen = { x, y, w, h, scale };
  }

  render(state, cam) {
    const g = this.ctx;
    // The title art owns the canvas on the title and on the pre-run screen
    // ('setup'); main.js keeps the DOM menu on top. The world is not rendered
    // under it and the play-readout seams are cleared.
    this.titleScreen = null;
    if (state.mode === 'title' || state.mode === 'setup') {
      this.hudChrome = null;
      this.bossBanner = null;
      this.moment = null;
      this.radar = null;
      this.atlasMap = null;
      this.drawTitleScreen(g);
      return;
    }
    this._titlePainted = false;   // leaving the title: a return visit repaints
    // WAVE-9B/2 area identity: ground tone + grid dots come from the active
    // wave's theme (theme ladder in CONFIG.GROUND.THEMES).
    const theme = groundTheme(state.wave ? state.wave.num : 1);

    // WAVE-16 WORLD ZOOM (Sk408: pixel detail lost on small mobile screens).
    // Z scales ONLY the world layer below (ground, weather particles, enemies,
    // player, projectiles, gems, chests, arches, shrines, boss, drops):
    // device = viewCenter + (draw - viewCenter) * Z, camera stays player-locked.
    // The HUD chrome / bars / feed / banner / touch layer stay native 1x.
    // Culls test the ZOOMED window (x0..x1 below) with the SAME world-space
    // margins as before — higher zoom shrinks the visible window, so culling
    // gets TIGHTER, never looser: nothing inside the zoomed frame is culled,
    // nothing pops at the screen edge (margins still cover sprite extents,
    // which live in world px regardless of Z).
    // WAVE-26: the integer zoom factor has ONE definition, in main.js's
    // zoomScale(); main.js publishes it as state.zoomScale every frame
    // (syncChrome) and worldRegion()/the coachmark projection read the same
    // value. Read it here so the render transform can never drift from the
    // coachmark projection. Fallback (headless / pre-first-frame): derive it
    // with the identical clamp so a state without zoomScale still renders.
    const zs = state.zoomScale;
    const Z = (typeof zs === 'number' && Number.isFinite(zs) && zs >= 1)
      ? zs
      : Math.max(1, Math.round(state.zoom || 1)) * this.worldScale;
    this._zoom = Z;
    const vw = C.VIEW_W / Z, vh = C.VIEW_H / Z;
    this.worldView = {
      zoom: Z,
      x0: (C.VIEW_W - vw) / 2, x1: (C.VIEW_W + vw) / 2,
      y0: (C.VIEW_H - vh) / 2, y1: (C.VIEW_H + vh) / 2,
    };
    const cull = (x, y, m) => x < this.worldView.x0 - m || y < this.worldView.y0 - m ||
      x > this.worldView.x1 + m || y > this.worldView.y1 + m;

    // Behind the zoomed window: a dark letterbox (matches the WAVE-14 banner
    // bands). Invisible at 1x, where the window IS the full screen.
    if (Z > 1) {
      g.fillStyle = '#08080f';
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // Optional subtle scene tint for the theme (under the entities, full
    // screen — drawn OUTSIDE the zoom transform so it always covers).
    if (theme.tint) {
      g.fillStyle = theme.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // ---- WORLD LAYER (zoomed) ------------------------------------------------
    // Screen shake rides the same transform, in whole world pixels.
    const shake = shakeOffset(state, prefersReducedMotion());
    this.shake = shake;
    g.save();
    g.translate(C.VIEW_W / 2, C.VIEW_H / 2);
    g.scale(Z, Z);
    g.translate(-C.VIEW_W / 2 + shake.x, -C.VIEW_H / 2 + shake.y);

    // Ground base + grid dots are world objects too: they zoom with the layer
    // (fillRect 0..VIEW_W inside the transform covers exactly the zoomed
    // window — at 1x that is the whole screen, i.e. identical to before).
    // WORLD ART MAKEOVER: the stage owns the floor material (world_ground.js);
    // the wave theme leans it. The cached ground chunks carry their own
    // texture, so the dot lattice only draws on the direct (headless) path.
    const gpal = stageGroundPalette(state.stage, theme);
    // R6: on a light floor the hero wears a dark keyline outside its ring.
    this.groundLight = groundIsLight(state.stage) && !this.light.arenaDark(state);   // R7: the finale's void is dark
    g.fillStyle = gpal.base;
    if (shake.x || shake.y) g.fillRect(-8, -8, C.VIEW_W + 16, C.VIEW_H + 16);   // no bare edge mid-shake
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.fillStyle = gpal.grid;
    // WAVE-24 (#3): the dot lattice is aligned to the decor CELL and drawn at
    // CELL spacing (was an unrelated 24px grid). At 24px the lattice read as
    // scanline/compression noise; on the same 32px joints as the paving field
    // the dots read as ground seams, and there are ~44% fewer of them.
    const gs = C.GROUND.CELL;
    const ox = ((-cam.x % gs) + gs) % gs;
    const oy = ((-cam.y % gs) + gs) % gs;
    if (!groundChunksOn()) for (let y = oy - gs; y < C.VIEW_H; y += gs) {
      for (let x = ox - gs; x < C.VIEW_W; x += gs) g.fillRect(x, y, 1, 1);
    }

    // ARENA RELIEF: quantized height tints + contour edges, under the decor
    // so elevation reads as terrain without competing with the play pieces.
    this.drawRelief(g, state, cam, theme);
    // BLOCKING ELEVATION: the authored rim wall — cliff lips + gate terraces,
    // drawn from the same WALL block the collision reads (one truth).
    this.drawTerrace(g, state, cam);
    // Ground decor: world-anchored seeded field, drawn under everything else
    // so the camera's player-lock reads as the PLAYER moving, not the world.
    // PORT SLICE G: the pass is stage-aware (state.stage sets the terrain
    // character); the wave theme still sets every color (see drawGround).
    this.drawGround(g, state.groundSeed || 1, cam, theme, state.stage, state.weather);
    // WAVE-24 (#3): deliberate structures over the fine field (see
    // drawLandmarks) — the coarse layer that gives the floor a sense of place.
    this.drawLandmarks(g, state.groundSeed || 1, cam, theme, state.stage);
    // M5b LANDSCAPE: plateaus, ramps, bridges, drop edges and the stage's
    // landmark structures, over the floor decor and under every actor.
    {
      const TER = terrainFor(state.groundSeed || 0, state.stage);
      if (TER) {
        this.terrainChunks = drawTerrain(g, TER, cam, C.VIEW_W, C.VIEW_H);
        drawTerrainMarks(g, TER, cam, cull);
      }
    }
    this.drawArenaWall(g, cam, gpal);   // WAVE-18 (#7): the rim made visible
    // R6 LIGHT (src/light.js): the darkness with its holes of light and the
    // glows, over the floor, the buildings and the props and UNDER every
    // pickup, actor, shot and effect drawn below (none of them is darkened).
    // Its own cost is timed (wall clock, read only by the governor in main.js).
    const lt0 = performance.now(); this.light.timer = this.light.timer || (() => performance.now());   // R7: times the arena's share
    this.lightOut = this.light.compose(g, state, cam, this.worldView, this.landmarks,
      groundEmits(), this.lightLevel, prefersReducedMotion(), this.lightMix);
    this.lightMs = Math.max(0, performance.now() - lt0 - (this.light.arenaMs || 0));   // R7: not the arena's floor and cracks (drawn at every level)

    // Gems.
    // Faceted lozenge, outlined; the tier colour follows the xp it carries
    // and each gem twinkles on its own position-hashed beat.
    // R3, gems recede in a crowd: past GEM_RECEDE.CROWD gems on screen (until it
    // drops under GEM_RECEDE.CROWD_OFF), gems far from the hero fade. Every gem
    // in state.gems draws (a gem on screen is a gem in the game): the floor
    // merges gems for real (main.js tickFloor), and a merged gem past the first
    // rich step draws as a rich gem.
    const twinkle = Math.floor((state.time || 0) * 3);
    const sink = this.readStats || null;
    if (sink) { sink.gems = []; sink.nums = []; sink.hero = null; sink.order = []; }
    let onScreen = 0;
    for (const gem of state.gems) {
      if (!cull(Math.round(gem.x - cam.x), Math.round(gem.y - cam.y), 5)) onScreen++;
    }
    if (onScreen > GEM_RECEDE.CROWD) this._gemCrowd = true;
    else if (onScreen < GEM_RECEDE.CROWD_OFF) this._gemCrowd = false;
    const crowded = !!this._gemCrowd;
    if (sink) sink.gemCrowd = crowded;
    const hpl = state.player;
    const stillFloor = prefersReducedMotion();   // read once a frame (matchMedia)
    for (const gem of state.gems) {
      const x = Math.round(gem.x - cam.x), y = Math.round(gem.y - cam.y);
      if (cull(x, y, 12)) continue;
      const rich = richStep(gem, C.FLOOR.RICH_XP);
      if (rich > 0) {
        // A rich gem never fades: it is the thing worth walking to.
        const box = GEM_RICH_BOX[rich - 1];
        const pulse = richGlowStrength(state.time || 0, gem.x, stillFloor);
        blitGlow(g, GEM_RICH.glow, 7 + rich * 3, x, y, pulse);
        if (sink) sink.gems.push({ x: x + box.x, y: y + box.y, w: box.w, h: box.h, a: 1, rich, glow: pulse });
        blitPainted(g, 'gemrich:' + rich, box, GEM_RICH_PAINT[rich - 1], x, y, STYLE_ITEM);
        continue;
      }
      if (cull(x, y, 5)) continue;
      const tier = gem.xp >= 25 ? 2 : gem.xp >= 6 ? 1 : 0;
      let a = 1;
      if (crowded && hpl && Math.hypot(gem.x - hpl.x, gem.y - hpl.y) > GEM_RECEDE.FAR) a = GEM_RECEDE.FAR_ALPHA;
      const lit = ((Math.round(gem.x) * 7 + Math.round(gem.y) * 13 + twinkle) % 5) === 0 ? 1 : 0;
      if (sink) sink.gems.push({ x: x + GEM_BOX.x, y: y + GEM_BOX.y, w: GEM_BOX.w, h: GEM_BOX.h, a });
      g.globalAlpha = a;
      blitPainted(g, 'gem:' + tier + lit, GEM_BOX, GEM_PAINT[tier * 2 + lit], x, y, STYLE_ITEM);
      g.globalAlpha = 1;
    }

    // Potion drops: tiny bottles (red = health, blue = mana).
    for (const d of state.drops || []) {
      const x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y);
      if (cull(x, y, 5)) continue;
      const hp = d.kind === 'hp';
      // R3 floor: the last BLINK_S of its life the potion blinks (it is leaving).
      const left = C.FLOOR.POTION_LIFE - ((state.time || 0) - (d.t ?? (state.time || 0)));
      const la = leavingAlpha(left, state.time || 0, stillFloor);
      if (la <= 0) continue;
      g.globalAlpha = la;
      blitGlow(g, hp ? '#ff5566' : '#4a8cff', 7, x, y + 3, 0.75);
      blitPainted(g, hp ? 'potion:hp' : 'potion:mp', POTION_BOX, hp ? paintPotionHp : paintPotionMp, x, y, STYLE_ITEM);
      g.globalAlpha = 1;
    }

    // Chests: the SEALED chest (PORT SLICE K — original closed-chest art:
    // timber body, arched lid, twin bands, lock plate; the lock glints on the
    // same blink the old gold box pulsed on). Slide toward the player (main.js).
    // A field chest carries NO rarity (chests.js rolls the band at OPEN time),
    // so the world never claims one — `ch.band` is a capture/test-only display
    // override the game never writes. Same loop, same cull, same positions.
    for (const ch of state.chests || []) {
      const x = Math.round(ch.x - cam.x), y = Math.round(ch.y - cam.y);
      if (cull(x, y, 12)) continue;
      const blink = Math.floor(ch.age * 3) % 2 === 0;
      const cart = chestArtFor(ch.band || SEALED_KEY, 'closed');
      blitGlow(g, '#ffd75e', 11, x, y + 3, blink ? 1 : 0.6);
      blitChest(g, cart, x - Math.floor(cart.w / 2), y - cart.h + 4, blink);
    }

    // Rare item drops (loot.js): small glowing boxes colored by rarity;
    // EPIC+ sparkle so they read as loot, not potions. A drop that came from
    // a chest (PORT SLICE K: main.js stamps the ROLLED band — the true band,
    // never a claim) rests on its band's OPEN chest remnant; the glyph below
    // keeps its exact record (coords/styles/order untouched).
    for (const d of state.itemDrops || []) {
      const x = Math.round(d.x - cam.x), y = Math.round(d.y - cam.y);
      if (cull(x, y, d.chest ? 14 : 5)) continue;
      // R3 floor (Steve: "dead chests can clean up more frequently"): the open
      // chest stays REMNANT_S after it opens, fading out over the last
      // REMNANT_FADE_S; the item stays as a plain drop.
      const lay = (state.time || 0) - (d.t ?? (state.time || 0));
      const F = C.FLOOR;
      const ra = d.chest ? remnantAlpha(lay) : 0;
      if (ra > 0) {
        const oart = chestArtFor(d.chest, 'open');
        g.globalAlpha = ra;
        blitChest(g, oart, x - Math.floor(oart.w / 2), y - Math.floor(oart.h / 2) + 3, true);
        g.globalAlpha = 1;
      }
      const leftS = d.refusedAt != null ? F.REFUSED_S - ((state.time || 0) - d.refusedAt) : F.ITEM_LIFE - lay;
      const la = leavingAlpha(leftS, state.time || 0, stillFloor);
      if (la <= 0) continue;
      g.globalAlpha = la;
      const col = RARITY_COLORS[d.item.rarity] || RARITY_COLORS.COMMON;
      blitGlow(g, col, 8, x, y + 2, 0.75);
      g.fillStyle = col;
      g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = Math.floor((state.time || 0) * 4) % 2 === 0 ? '#ffffff' : col;
      g.fillRect(x - 1, y - 1, 2, 2);
      if (d.item.rarity === 'EPIC' || d.item.rarity === 'LEGENDARY') {
        g.fillStyle = col;
        g.fillRect(x - 4, y, 1, 1); g.fillRect(x + 4, y, 1, 1);
        g.fillRect(x, y - 4, 1, 1); g.fillRect(x, y + 4, 1, 1);
      }
      g.globalAlpha = 1;
    }

    // FIRST-RUN PROLOGUE potion (main.js owns the phase): a TALLER bottle
    // than an ordinary drop, tinted iridescent — a slow hue cycle (static
    // when the OS asks for reduced motion) — plus a beacon ring so it reads
    // as THE thing to walk to from anywhere on screen. The pulse rides the
    // phase's own clock (state.time is frozen by design during the prologue).
    if (state.prologue && !state.prologue.drunk) {
      const po = state.prologue.potion;
      const x = Math.round(po.x - cam.x), y = Math.round(po.y - cam.y);
      if (!cull(x, y, 20)) {
        const pt = state.prologue.t || 0;
        const ph = (pt % 1.6) / 1.6;
        const ringR = 5 + Math.round(ph * 11);
        // Alpha floor 0.25 (was 0.6 fading to 0): a static frame of the pulse
        // could catch the beacon fully faded — the ring floor keeps the walk
        // target readable in any single frame (pixel-probe finding, 2026-09-18).
        g.fillStyle = 'rgba(125,255,208,' + (0.25 + 0.5 * (1 - ph)).toFixed(2) + ')';
        g.fillRect(x - ringR, y - 1, 3, 2); g.fillRect(x + ringR - 2, y - 1, 3, 2);
        g.fillRect(x - 1, y - ringR, 2, 3); g.fillRect(x - 1, y + ringR - 2, 2, 3);
        const hue = prefersReducedMotion() ? 160 : Math.round((160 + pt * 24) % 360);
        // The body is drawn at 2x (12x18 view px — the player sprite's own
        // size class): two vision passes on the 320x568 shot could not resolve
        // the old 6x9 bottle (~4x6 CSS px there) even with the paint proven
        // on the backing store by tools/probe (236 bright pixels). The
        // tutorial's ONE centerpiece reads at the smallest viewport.
        g.fillStyle = 'hsl(' + hue + ',85%,62%)';        // the distinct body tint
        g.fillRect(x - 6, y - 10, 12, 18);               // body (2x)
        g.fillRect(x - 2, y - 16, 4, 6);                 // neck (2x)
        g.fillStyle = '#e8e8f0';
        g.fillRect(x - 4, y - 12, 2, 4);                 // glint (2x)
        g.fillStyle = '#7d5a2e';
        g.fillRect(x - 4, y - 18, 8, 2);                 // cork (2x)
      }
    }

    // RUN-COUNT MILESTONE CHEST (owner 2026-09-17): a BIG chest (the 2x size
    // class — bigger than any ground drop) with a GOLD beacon ring so it
    // reads as THE thing to walk to from anywhere on screen. The pulse rides
    // state.time (the sim clock — this is ordinary play, not the frozen
    // prologue); the chest has NO ttl and never fades: unmissable and
    // unlosable are the feature's contract (render.js only ever paints what
    // state.runChest says; main.js clears it at collection alone).
    if (state.runChest) {
      const chx = Math.round(state.runChest.x - cam.x);
      // The idle BOUNCE (the "big and cool" addendum): a 2px integer hop on
      // the sim clock — a treasure sits alive on the field, not painted into
      // the ground. Static when the OS asks for reduced motion.
      const bob = prefersReducedMotion() ? 0 :
        Math.round(Math.abs(Math.sin((state.time || 0) * C.RUN_CHEST.BOB_HZ * Math.PI)) * C.RUN_CHEST.BOB_PX);
      const chy = Math.round(state.runChest.y - cam.y) - bob;
      if (!cull(chx, chy, 30)) {
        const ct = state.time || 0;
        const cph = (ct % 2) / 2;
        const cringR = 8 + Math.round(cph * 16);
        // Alpha floor 0.25, same rule as the prologue potion's beacon.
        g.fillStyle = 'rgba(255,215,94,' + (0.25 + 0.5 * (1 - cph)).toFixed(2) + ')';
        g.fillRect(chx - cringR, chy - 1, 3, 2); g.fillRect(chx + cringR - 2, chy - 1, 3, 2);
        g.fillRect(chx - 1, chy - cringR, 2, 3); g.fillRect(chx - 1, chy + cringR - 2, 2, 3);
        // The chest, 2x (24x16 body): dark timber body, arched lid, gold
        // bands + lock plate, a lit keyhole.
        g.fillStyle = '#6b4a26';                          // lid (arched)
        g.fillRect(chx - 12, chy - 12, 24, 6);
        g.fillRect(chx - 10, chy - 14, 20, 2);
        g.fillStyle = '#8a6d3f';                          // body
        g.fillRect(chx - 12, chy - 6, 24, 10);
        g.fillStyle = '#ffd75e';                          // bands + lock
        g.fillRect(chx - 12, chy - 6, 24, 2);
        g.fillRect(chx - 8, chy - 12, 2, 16);
        g.fillRect(chx + 6, chy - 12, 2, 16);
        g.fillRect(chx - 3, chy - 5, 6, 6);
        g.fillStyle = '#3c2c14';                          // keyhole
        g.fillRect(chx - 1, chy - 3, 2, 3);
        // The sparkle: a slow blink on the lock, the "there's gold inside"
        // tell (static when the OS asks for reduced motion).
        if (prefersReducedMotion() || Math.floor(ct * 2) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(chx + 5, chy - 15, 2, 2);
        }
      }
    }

    // RUN-COUNT MILESTONE CHEST — the collection BURST, same world slot.
    drawChestBurst(g, state, cam);

    // Arches (arches.js): PORT SLICE ARCH ART original gate art — one
    // designed arch per TYPE (twin_fury / magnet / aegis / berserker /
    // zephyr, art/arches.js), type ink = ARCH_COLORS. The shimmer field
    // pulses while UNTRIGGERED (the "not yet" tell). Walk-under CONSUMES
    // the arch (arches.js reverse splice removes it from state.arches), so
    // a spent gate never lingers on the field; `a.used` is a paint-only
    // latch (chest `band` precedent) for the inactive read in captures/tests.
    for (const a of state.arches || []) {
      const x = Math.round(a.x - cam.x), y = Math.round(a.y - cam.y);
      if (cull(x, y, 30)) continue;
      const col = ARCH_COLORS[a.type] || '#a8e0ff';
      const aart = archArtFor(a.type);
      const active = a.used !== true;
      const glow = 0.5 + 0.5 * Math.sin((state.time || 0) * 3);
      if (active) {
        g.fillStyle = 'rgba(255,255,255,' + (0.10 + 0.16 * glow).toFixed(2) + ')';
        g.fillRect(x - 8, y - 16, 16, 32);        // shimmer field under the gate
      }
      // 24x35 grid art; ground point (x, y) = grid cell (12, 21).
      paintArch(g, aart, x - 12, y - 21, active);
      if (active && aart.glint) {                  // keystone glint, blinking
        g.fillStyle = Math.floor((state.time || 0) * 5) % 2 === 0 ? '#ffffff' : col;
        for (const [dx, dy] of aart.glint) g.fillRect(x - 12 + dx, y - 21 + dy, 1, 1);
      }
    }

    // M5b SITES (sites.js / sites_art.js): shrines, altar, braziers,
    // fountains and the cursed statue, plus the waypoint flag or edge arrow.
    clearWorldCards();   // world cards queue here and draw in the HUD pass
    drawSites(g, state, cam, cull, prefersReducedMotion());
    // M5b slice 3 (world_art.js): yard, vault, lever, key, cracks, the glyph.
    drawWorldPoi(g, state, cam, cull, (state.time || 0) - (state.lastSteerT ?? -99) <= 2);
    this.waypointMark = drawWaypoint(g, state, cam, this.worldView);

    // Portal (wave progression): a rotating ring of flames around a pulsing
    // core — the walk-in that ends the wave. P1 R4 PRESENCE: the ring GROWS
    // in over the portal's first 0.6s (spawn-in animation, integer pixels),
    // and while the entry dwell beat runs the spin triples and the core
    // burns bright — the crossing reads instead of teleporting.
    if (state.portal) {
      const po = state.portal;
      const x = Math.round(po.x - cam.x), y = Math.round(po.y - cam.y);
      const t = state.time || 0;
      const grow = Math.min(1, (po.age || 0) / 0.6);
      const n = 8, R = Math.max(4, Math.round(24 * (0.25 + 0.75 * grow)));
      const spin = po.entering ? 2.4 : 0.8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + t * spin;
        const fx = Math.round(x + Math.cos(ang) * R), fy = Math.round(y + Math.sin(ang) * R);
        const fi = Math.floor(t * 10 + i * 1.3) % FLAME.frames.length;
        blitGrid(g, FLAME.frames[fi], FLAME.palette,
          fx - FLAME.anchor.x, fy - FLAME.anchor.y - 4);
      }
      const pulse = po.entering ? 1 : 0.5 + 0.5 * Math.sin(t * 6);
      const r = Math.round((5 + 3 * pulse) * (0.25 + 0.75 * grow));
      g.fillStyle = po.entering ? '#fff6c8' : (pulse > 0.5 ? '#b8e0ff' : '#5a7ad8');
      g.fillRect(x - r, y - 3, r * 2, 6);
      g.fillRect(x - 3, y - r, 6, r * 2);
    }

    // Enemies: hand-authored pixel sprites (sprites.js + slice-b
    // enemy_sprites.js) with 2-frame walk cycles (frame flips ~6/s off
    // e.age); typed shapes stay as FALLBACK for unmapped types. Status
    // tells preserved: flash/slow tint, elite gold
    // outline, WARLOCK telegraph blink. WAVE-7/B: named bosses carry their
    // own LARGE grids (bosses.js BOSS_SPRITES, 20-26px, crown/robe/star built
    // in) on e.bossSprite; the legacy BOSS_SPRITE stays as the fallback.
    const cached = cacheEnabled();
    const reducedAnim = prefersReducedMotion();   // read once a frame (matchMedia)
    // Killed bodies fold down where they fell, under the living, then puff.
    if (cached && state.feel && state.feel.corpses.length) this.drawCorpses(g, state, cam, cull, reducedAnim);
    // Depth: the horde is drawn top of the screen first, so a body lower down
    // stands in front (a crowd reads as a crowd). Ground y decides, so a flyer
    // sorts by its shadow. The hero is drawn later, on top of all of them.
    const order = this.depthOrder || (this.depthOrder = []);
    order.length = 0;
    if (actorAnimOn()) {
      const pool = this.depthPool || (this.depthPool = []), keyed = this.depthKeyed || (this.depthKeyed = []);
      keyed.length = 0;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        const p = pool[i] || (pool[i] = { e: null, k: 0 });
        p.e = e; p.k = depthKey(e);
        keyed.push(p);
      }
      keyed.sort(byDepth);
      for (const p of keyed) { order.push(p.e); p.e = null; }
    } else {
      for (const e of state.enemies) order.push(e);
    }
    for (const e of order) {
      if (e.finalBoss) continue;   // WAVE-10: the maw has its own draw below
      const w = Math.round(e.w || C.ENEMY.W), h = Math.round(e.h || C.ENEMY.H);
      const hw = Math.round(w / 2), hh = Math.round(h / 2);
      const x = Math.round(e.x - cam.x);
      let y = Math.round(e.y - cam.y);
      if (cull(x, y, 30)) continue;
      // E2 (R9): a flyer draws its ground SHADOW at (x,y) — the sim's 2D
      // truth (contact/targeting read that point) — then the whole body
      // (sprite or fallback shape, tells and hp bar included) lifts by its
      // altitude z. Integer px throughout (house rule).
      if (e.flying && cached) {
        blitPainted(g, 'shadow:' + w, { x: -w, y: -3, w: w * 2, h: 6 }, (c, ox, oy) => {
          const shw = Math.max(4, Math.round(w * 0.8));
          c.fillStyle = 'rgba(0,0,0,0.38)';
          c.fillRect(ox - Math.round(shw / 2), oy - 1, shw, 3);
          c.fillRect(ox - Math.round(shw / 2) + 2, oy - 2, Math.max(1, shw - 4), 5);
        }, x, y + hh);
        y -= Math.round(e.z || 0);
      } else if (e.flying) {
        const shw = Math.max(2, Math.round(w * 0.7));
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x - Math.round(shw / 2), y + hh - 2, shw, 2);
        g.fillRect(x - Math.round(shw / 4), y + hh - 4, Math.max(1, Math.round(shw / 2)), 2);
        y -= Math.round(e.z || 0);
      }
      const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : (enemySpriteFor(e.typeId) || SPRITES[e.typeId]);
      if (spr && cached) {
        this.drawActor(g, e, spr, x, y, state, reducedAnim);
      } else if (spr) {
        const sx = x - spr.anchor.x, sy = y - spr.anchor.y;
        const bw = spr.box.w, bh = spr.box.h;
        const frame = spr.frames[Math.floor((e.age || 0) * 6) % spr.frames.length];
        this.drawGrid(g, frame, spr.palette, sx, sy);
        // Status tints wash the whole sprite box.
        if (e.flash > 0) {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.fillRect(sx, sy, bw, bh);
        } else if (e.slow > 0) {
          g.fillStyle = 'rgba(106,168,216,0.4)';
          g.fillRect(sx, sy, bw, bh);
        }
        // COLOSSUS idle: shoulder braziers (Sk408 loves flames).
        if (e.typeId === 'COLOSSUS') {
          const fi = Math.floor((state.time || 0) * 10) % FLAME.small.length;
          this.drawGrid(g, FLAME.small[fi], FLAME.palette, x - 7, y - hh - 3);
          this.drawGrid(g, FLAME.small[fi], FLAME.palette, x + 3, y - hh - 3);
        }
        if (e.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(sx - 1, sy - 1, bw + 2, 1);
          g.fillRect(sx - 1, sy + bh + 1, bw + 2, 1);
          g.fillRect(sx - 1, sy - 1, 1, bh + 2);
          g.fillRect(sx + bw + 1, sy - 1, 1, bh + 2);
        }
        if (e.elite) {
          g.fillStyle = '#f0c860';
          g.fillRect(sx - 1, sy - 1, bw + 2, 1);
          g.fillRect(sx - 1, sy + bh + 1, bw + 2, 1);
          g.fillRect(sx - 1, sy - 1, 1, bh + 2);
          g.fillRect(sx + bw + 1, sy - 1, 1, bh + 2);
        }
        if (e.rarity) rarityRing(g, e, state, sx, sy, bw, bh);
        if (e.hp < e.maxHp) {
          g.fillStyle = '#0b0912';
          g.fillRect(sx, sy - 3, bw, 1);
          g.fillStyle = '#e06a74';
          g.fillRect(sx, sy - 3, Math.ceil(bw * e.hp / e.maxHp), 1);
        }
      } else {
        // Fallback: typed shapes + palette variants via resolveLook.
        const look = resolveLook(e.typeId, e.variant || 0);
        let body = e.flash > 0 ? '#ffffff' : (e.slow > 0 ? '#8aa0c0' : look.body);
        let trim = e.flash > 0 ? '#e4e2ea' : (e.slow > 0 ? '#486084' : look.trim);
        let accent = look.accent || '#ffffff';
        if (e.elite) { trim = ELITE_LOOK.trim; accent = ELITE_LOOK.accent; } // gold tell
        g.fillStyle = body;
        drawShape(g, look.shape, x, y, w, h);
        // Trim band across the box (kept inside the silhouette's middle).
        g.fillStyle = trim;
        g.fillRect(x - Math.round(w * 0.35), y - 1, Math.round(w * 0.7), 2);
        g.fillRect(x - 1, y - Math.round(h * 0.35), 2, Math.round(h * 0.7));
        // Accent core pixel.
        g.fillStyle = accent;
        g.fillRect(x - 1, y - 1, 2, 2);
        // E2 (R9): wing flap for the flyer — two beating side rows off the
        // age phase (~8/s), so the hover READS as flight, not a float.
        if (e.flying) {
          const flap = Math.floor((e.age || 0) * 8) % 2 === 0 ? 0 : 2;
          g.fillStyle = trim;
          g.fillRect(x - hw - 3, y - 2 - flap, 3, 2);
          g.fillRect(x + hw, y - 2 - flap, 3, 2);
        }
        if (e.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0) {
          g.fillStyle = '#ffffff';
          g.fillRect(x - hw - 1, y - hh - 1, w + 2, 1);
          g.fillRect(x - hw - 1, y + hh + 1, w + 2, 1);
          g.fillRect(x - hw - 1, y - hh - 1, 1, h + 2);
          g.fillRect(x + hw + 1, y - hh - 1, 1, h + 2);
        }
        if (e.elite) {
          g.fillStyle = '#f0c860';
          g.fillRect(x - hw - 1, y - hh - 1, w + 2, 1);
          g.fillRect(x - hw - 1, y + hh + 1, w + 2, 1);
          g.fillRect(x - hw - 1, y - hh - 1, 1, h + 2);
          g.fillRect(x + hw + 1, y - hh - 1, 1, h + 2);
        }
        if (e.rarity) rarityRing(g, e, state, x - hw, y - hh, w, h);
        if (e.hp < e.maxHp) {
          g.fillStyle = '#0b0912';
          g.fillRect(x - hw, y - hh - 3, w, 1);
          g.fillStyle = '#e06a74';
          g.fillRect(x - hw, y - hh - 3, Math.ceil(w * e.hp / e.maxHp), 1);
        }
      }
      // WAVE-11 elite modifier tells (elite_mods.js stamps e.eliteMod + a
      // `visual` string; render only reads it). Drawn for BOTH sprite and
      // fallback branches — the tells layer on top of the elite gold outline.
      if (e.eliteMod) {
        const pl2 = state.player;
        if (e.eliteMod === 'SWIFT') {
          // Afterimage: 3 fading dots trailing opposite the player direction.
          const dx = e.x - pl2.x, dy = e.y - pl2.y;
          const len = Math.hypot(dx, dy) || 1;
          g.fillStyle = 'rgba(104,224,128,0.5)';
          for (let i = 1; i <= 3; i++) {
            g.fillRect(Math.round(x + (dx / len) * i * 4) - 1,
                       Math.round(y + (dy / len) * i * 4) - 1, 2, 2);
          }
        } else if (e.eliteMod === 'SPLITTING') {
          // Cracked: dark fracture cross over the body's core.
          g.fillStyle = 'rgba(20,20,30,0.75)';
          g.fillRect(x - 4, y, 9, 1);
          g.fillRect(x, y - 4, 1, 9);
          g.fillRect(x - 3, y - 3, 1, 1);
          g.fillRect(x + 3, y + 3, 1, 1);
        } else if (e.eliteMod === 'VAMPIRIC') {
          // Leech: pulsing red heart-core (2Hz heartbeat swell).
          const beat = 0.5 + 0.5 * Math.sin((state.time || 0) * 12);
          const cs = beat > 0.5 ? 3 : 2;
          g.fillStyle = '#e06a74';
          g.fillRect(x - Math.round(cs / 2), y - Math.round(cs / 2), cs, cs);
        }
      }
      // Attached tick: red drain tether dots to the player.
      if (e.attached) {
        const px = Math.round(state.player.x - cam.x), py = Math.round(state.player.y - cam.y);
        const steps = 4;
        g.fillStyle = '#e06a74';
        for (let i = 1; i < steps; i++) {
          const u = i / steps;
          g.fillRect(Math.round(x + (px - x) * u), Math.round(y + (py - y) * u), 1, 1);
        }
      }
    }
    drawCarrierTell(g, state, cam, cull);   // M5b: the key over its carrier

    // WAVE-10 FINALE: the maw of the horde — huge (4x zoom) void-black grid
    // from final_boss.js, 2-frame idle, white hit-flash, and the hot pink
    // telegraph wash during the 0.8s pre-barrage window (decide() sets the
    // flag; render only reads it). fillRect-only, like everything else.
    // integ4: drawn in its arena's every mode (finale_arena.js arenaOn), so the
    // death movie's frozen frame, a pause and a draft over the fight still hold the Maw.
    if (state.finalBoss && arenaOn(state)) {
      const fb = state.finalBoss;
      const spr = FINAL_BOSS_SPRITE;
      const Z = 4;
      const x = Math.round(fb.x - cam.x), y = Math.round(fb.y - cam.y);
      const frame = spr.frames[Math.floor((fb.age || 0) * 6) % spr.frames.length];
      const sx = x - spr.anchor.x * Z, sy = y - spr.anchor.y * Z;
      const mawTele = fb.telegraph && Math.floor((state.time || 0) * 12) % 2 === 0;
      if (cached) {
        // One blit: the 4x block raster with its outline, flash and
        // telegraph ring baked; a pool of light underneath lifts it off the ground.
        blitGlow(g, fb.telegraph ? '#ff4a14' : bossPool(spr, !!this.groundLight), 62, x, y + spr.box.h * 2 - 6, fb.telegraph ? 1 : MAW_POOL_ALPHA);
        // bossdark: its rim when it is not winding up (the telegraph ring stays danger)
        blitGrid(g, frame, spr.palette, sx, sy,
          actorStyle(fb.flash > 0, fb.slow > 0, mawTele ? '#ff4a14' : (fb.telegraph ? null : spr.rim), true, false,
            !!(this.groundLight && !(fb.flash > 0) && !fb.telegraph)), Z);
      } else {
        for (let ry = 0; ry < frame.length; ry++) {
          const row = frame[ry];
          for (let rx = 0; rx < row.length; rx++) {
            const v = row[rx];
            if (v) { g.fillStyle = spr.palette[v]; g.fillRect(sx + rx * Z, sy + ry * Z, Z, Z); }
          }
        }
      }
      if (cached) {
        // flash / chill / telegraph are in the baked variant
      } else if (fb.flash > 0) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      } else if (fb.slow > 0) {
        g.fillStyle = 'rgba(106,168,216,0.4)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      }
      if (!cached && mawTele) {
        g.fillStyle = 'rgba(255,47,94,0.45)';
        g.fillRect(sx, sy, spr.box.w * Z, spr.box.h * Z);
      }
    }

    // Enemy projectiles (SHOT_PAINT): round red-orange orbs. spit (small), bolt
    // (big, WARLOCK), nova (orange, boss radial burst), maw (red, the barrage).
    for (const s of state.enemyShots || []) {
      const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
      if (cull(x, y, 5)) continue;
      if (cached) {
        const sk = SHOT_PAINT[s.kind] ? s.kind : 'spit';
        blitPainted(g, 'shot:' + sk, SHOT_BOX, SHOT_PAINT[sk], x, y, this.groundLight ? STYLE_SHOT_LIGHT : STYLE_SHOT);
        continue;
      }
      SHOT_PAINT[SHOT_PAINT[s.kind] ? s.kind : 'spit'](g, x, y);   // the same orbs as the cache
    }

    // Projectiles: volley shots + kind-tagged weapon bodies (boomerang spin,
    // seeker missiles, dropped mines).
    //
    // PORT SLICE J2: every traveling body paints ORIGINAL multi-part sprite
    // art in the integer-grid fillRect style (volley arrows, orbit blades,
    // boomerang crescent, seeker missile, armed mine). Triggers, ttls, flight paths, speeds, hit boxes and pool
    // bounds are untouched — painters only. Phase sources are sim state
    // (position hash, age, velocity, flight angle), never wall clock and
    // never Math.random, so 60Hz and 120Hz paint identically at the same age.
    // Bounded: <= 11 rects per projectile body (stated per kind below).
    // Fused weapons: body kind -> fusion def (null when the kit has none).
    const fusOf = fusionByBodyKind(state.weapons);
    for (const p of state.projectiles) {
      const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      if (cull(x, y, 8)) continue;
      // Static position stamp shared by the body painters (slice-h contract).
      const ph = ((Math.round(p.x) * 73856093) ^ (Math.round(p.y) * 19349663)) >>> 0;
      if (cached) blitProjectile(g, p, x, y, ph);
      else paintProjectileBody(g, p, x, y, ph);
      const fd = fusOf && p.kind !== 'firepatch' && fusOf[p.kind || 'volley'];
      if (fd) blitFusionCorona(g, fd, x, y, ph, cached);
    }

    // Skill/weapon effects (fillRect only).
    let pendingFlash = null;   // 'flash' paints full-screen at NATIVE 1x — deferred past the world restore
    for (const fx of state.effects || []) {
      const t = fx.age / fx.ttl; // 0 -> 1
      if (fx.kind === 'nova' || fx.kind === 'nova_pulse' || fx.kind === 'boss_nova' ||
          fx.kind === 'mine_blast' || fx.kind === 'colossus_shock' ||
          fx.kind === 'rewrite_boom' || fx.kind === 'rewrite_harvest' ||
          fx.kind === 'magnet') {
        // Expanding ring: outer glow ring + inner echo + hash-phased crackle
        // + 4 cardinal ticks. PORT SLICE H: the old painter drew ONE flat
        // 48-dot ring; the new dress keeps the same trigger/ttl/radius and
        // adds an ORIGINAL two-ring + sparkle read (glow/crackle doctrine).
        // Deterministic: phase derives from the effect origin hash (static
        // stamp, never wall clock); animation is t = age/ttl only, so 60Hz
        // and 120Hz paint identically at the same age. Bounded: 48 + 24 +
        // 8 + 4 rects max per ring effect (pools unchanged).
        const r = fx.radius * t;
        const ringFus = (fx.fus && fusionDef(fx.fus)) ||
          (fusOf && fx.kind === 'nova_pulse' && !fx.evo ? fusOf.nova_pulse : null);
        const ringCol = ringFus ? (t < 0.5 ? ringFus.tint[0] : ringFus.tint[1])
          : fx.evo === 'sun' ? (t < 0.5 ? '#ffffff' : '#e2aa38')
          : fx.evo === 'fire' ? (t < 0.5 ? '#f8e098' : '#e8902a')
          : fx.evo === 'meteor' ? (t < 0.5 ? '#e4e2ea' : '#8c6cb4')
          : fx.kind === 'nova'
          ? (t < 0.5 ? '#a8d0f4' : '#8aa0c0')
          : fx.kind === 'boss_nova'
            ? (t < 0.5 ? '#e06a74' : '#b83a4e')
            : fx.kind === 'mine_blast'
              ? (t < 0.4 ? '#f0c860' : t < 0.75 ? '#e8902a' : '#962e34')
              : fx.kind === 'colossus_shock'
                ? (t < 0.5 ? '#e4e2ea' : '#9c98a4')
                // G8 step 2: Chain Reaction (warm ember) / Blood Harvest (red).
                // RSS8 magnet: gold loot tell — matches nothing else on the field.
                : fx.kind === 'rewrite_boom'
                  ? (t < 0.5 ? '#e8902a' : '#a46a16')
                  : fx.kind === 'rewrite_harvest'
                    ? (t < 0.5 ? '#e06a74' : '#962e34')
                    : fx.kind === 'magnet'
                      ? (t < 0.5 ? '#f8e098' : '#e2aa38')
                      : (t < 0.5 ? '#b49ad4' : '#8c6cb4');
        const echoCol = fx.evo ? '#ffffff'
          : fx.kind === 'boss_nova' ? '#e4e2ea'
          : fx.kind === 'mine_blast' ? '#f8e098'
          : fx.kind === 'colossus_shock' ? '#ffffff'
          : fx.kind === 'rewrite_boom' ? '#f8e098'
          : fx.kind === 'rewrite_harvest' ? '#d48aae'
          : fx.kind === 'magnet' ? '#f8e098'
          : fx.kind === 'nova' ? '#ffffff'
          : '#e4e2ea';
        const hh = ((Math.round(fx.x) * 73856093) ^ (Math.round(fx.y) * 19349663)) >>> 0;
        const rot = ((hh % 360) / 360) * Math.PI * 2;
        g.fillStyle = ringCol;
        const steps = 48;
        for (let i = 0; i < steps; i++) {
          const a = rot + (i / steps) * Math.PI * 2;
          g.fillRect(Math.round(fx.x + Math.cos(a) * r - cam.x),
                     Math.round(fx.y + Math.sin(a) * r - cam.y), 2, 2);
        }
        // Inner echo ring (half radius, sparser, pale).
        g.fillStyle = echoCol;
        for (let i = 0; i < 24; i++) {
          const a = rot * 0.5 + (i / 24) * Math.PI * 2;
          g.fillRect(Math.round(fx.x + Math.cos(a) * r * 0.55 - cam.x),
                     Math.round(fx.y + Math.sin(a) * r * 0.55 - cam.y), 1, 1);
        }
        // Crackle: 8 hash-phased sparks drifting inside the ring.
        g.fillStyle = ringCol;
        for (let i = 0; i < 8; i++) {
          const a = rot + i * (Math.PI * 2 / 8) + t * 1.5 * ((i % 2 === 0) ? 1 : -1);
          const rr = r * (0.2 + 0.6 * (((hh >> (i % 16)) & 3) / 3));
          g.fillRect(Math.round(fx.x + Math.cos(a) * rr - cam.x),
                     Math.round(fx.y + Math.sin(a) * rr - cam.y), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
        }
        // Cardinal ticks: 4 longer marks on the outer ring, fading with t.
        if (t < 0.85) {
          g.fillStyle = echoCol;
          for (let k = 0; k < 4; k++) {
            const a = rot + k * (Math.PI / 2);
            g.fillRect(Math.round(fx.x + Math.cos(a) * r - cam.x) - 1,
                       Math.round(fx.y + Math.sin(a) * r - cam.y) - 1, 3, 3);
          }
        }
        // PORT SLICE J2 — NOVA ring body: four pale motes riding inside the
        // pulse at hash-phased stations (reference: Zodiac/moon luminaire
        // orbs). NOVA_PULSE only — every other ring kind paints
        // byte-identically to slice-h. +4 rects.
        if (fx.kind === 'nova_pulse') {
          g.fillStyle = '#e4e2ea';
          for (let k = 0; k < 4; k++) {
            const a = rot + k * (Math.PI / 2) + ((hh >> (k * 2)) & 3) * 0.2;
            g.fillRect(Math.round(fx.x + Math.cos(a) * r * 0.8 - cam.x),
                       Math.round(fx.y + Math.sin(a) * r * 0.8 - cam.y), 1, 1);
          }
        }
      } else if (fx.kind === 'scythe_windup' || fx.kind === 'scythe_arc') {
        // Sweep telegraph (faint blink) / landed sweep (bright arc + inner
        // echo) — dots sampled along the wedge's outer arc.
        const bright = fx.kind === 'scythe_arc';
        const blink = Math.floor((fx.age || 0) * 24) % 2 === 0;
        if (bright || blink) {
          const sf = fusOf && fusOf.scythe_arc;   // a fused Scythe sweeps in its fusion's colours
          g.fillStyle = bright ? (t < 0.4 ? (sf ? sf.tint[0] : '#ffffff') : (sf ? sf.tint[1] : '#a8d0f4')) : '#b4c4dc';
          const steps = 16;
          for (let i = 0; i <= steps; i++) {
            const a = fx.dir - fx.arc / 2 + (i / steps) * fx.arc;
            const rr = bright ? fx.radius * (1 - t * 0.25) : fx.radius;
            g.fillRect(Math.round(fx.x + Math.cos(a) * rr - cam.x) - 1,
                       Math.round(fx.y + Math.sin(a) * rr - cam.y) - 1, 3, 3);
            if (bright && i % 2 === 0) {  // inner echo dots
              g.fillRect(Math.round(fx.x + Math.cos(a) * rr * 0.55 - cam.x),
                         Math.round(fx.y + Math.sin(a) * rr * 0.55 - cam.y), 2, 2);
            }
          }
          // PORT SLICE H: tip sparks at both wedge ends on the landed sweep.
          if (bright && t < 0.7) {
            g.fillStyle = '#ffffff';
            for (const ea of [fx.dir - fx.arc / 2, fx.dir + fx.arc / 2]) {
              const rr = fx.radius * (1 - t * 0.25);
              g.fillRect(Math.round(fx.x + Math.cos(ea) * rr - cam.x) - 1,
                         Math.round(fx.y + Math.sin(ea) * rr - cam.y) - 1, 3, 3);
            }
          }
          // PORT SLICE J2 — SCYTHE blade body: a reaping crescent riding the
          // sweep's mid-angle at full reach (reference: SpearShape/SpearTip
          // ice lance + ReportSlash strokes): white tip + two pale trailers
          // stepping inward. Landed sweep only; windup untouched. +3 rects.
          if (bright && t < 0.8) {
            const bcx = Math.cos(fx.dir), bcy = Math.sin(fx.dir);
            const brr = fx.radius * (1 - t * 0.25);
            g.fillStyle = '#ffffff';
            g.fillRect(Math.round(fx.x + bcx * brr - cam.x) - 1,
                       Math.round(fx.y + bcy * brr - cam.y) - 1, 3, 3);
            g.fillStyle = '#a8d0f4';
            g.fillRect(Math.round(fx.x + bcx * (brr - 4) - cam.x),
                       Math.round(fx.y + bcy * (brr - 4) - cam.y), 2, 2);
            g.fillRect(Math.round(fx.x + bcx * (brr - 7) - cam.x),
                       Math.round(fx.y + bcy * (brr - 7) - cam.y), 1, 1);
          }
        }
      } else if (fx.kind === 'seeker_trail') {
        // Fading exhaust trail: dots shrink + cool down along the polyline.
        const n = fx.points.length;
        for (let i = 0; i < n; i++) {
          const pt = fx.points[i];
          const fade = (i / n) * (1 - t);   // older points dimmer
          const sz = fade > 0.5 ? 2 : 1;
          g.fillStyle = fade > 0.66 ? '#f8e098' : fade > 0.33 ? '#e8902a' : '#7a4c0e';
          g.fillRect(Math.round(pt.x - cam.x), Math.round(pt.y - cam.y), sz, sz);
        }
      } else if (fx.kind === 'mine_shrap') {
        // Shrapnel ember flying outward + a 1px cooling trail behind it.
        const d = fx.dist * t;
        const shx = Math.round(fx.x + Math.cos(fx.ang) * d - cam.x),
              shy = Math.round(fx.y + Math.sin(fx.ang) * d - cam.y);
        g.fillStyle = t < 0.5 ? '#f0c860' : '#e8902a';
        g.fillRect(shx - 1, shy - 1, 2, 2);
        g.fillStyle = '#7a4c0e';
        g.fillRect(Math.round(shx - Math.cos(fx.ang) * 3), Math.round(shy - Math.sin(fx.ang) * 3), 1, 1);
      } else if (fx.kind === 'beam') {
        // Piercing laser: the visible beam sweeps from->to over its life,
        // thickness flickers via a deterministic per-fire phase.
        const dir = fx.from + (fx.to - fx.from) * t;
        const flicker = 0.6 + 0.4 * Math.sin((fx.age || 0) * 40 + (fx.phase || 0));
        const cx = Math.cos(dir), cy = Math.sin(dir);
        const th = Math.max(2, Math.round(fx.width * flicker * (1 - t * 0.4)));
        const steps = Math.ceil(fx.len / 6);
        for (let i = 0; i <= steps; i++) {
          const d = (i / steps) * fx.len;
          const x = Math.round(fx.x + cx * d - cam.x), y = Math.round(fx.y + cy * d - cam.y);
          g.fillStyle = (fusOf && fusOf.beam) ? fusOf.beam.tint[1] : '#e8902a';   // outer glow: amber, the player's fire (a fused Beam: its fusion's colour)
          g.fillRect(x - Math.round(th / 2), y - Math.round(th / 2), th, th);
          g.fillStyle = '#ffffff';                       // hot core
          g.fillRect(x - 1, y - 1, 2, 2);
          // PORT SLICE H: edge crackle ticks every 4th sample (same sweep).
          if (i % 4 === 0 && t < 0.8) {
            g.fillStyle = '#f0c860';
            g.fillRect(x - Math.round(th / 2) - 1, y - Math.round(th / 2) - 1, 1, 1);
          }
        }
        // PORT SLICE H: white end-cap flash at the beam tip, fading with t.
        if (t < 0.6) {
          const tx = Math.round(fx.x + cx * fx.len - cam.x), ty = Math.round(fx.y + cy * fx.len - cam.y);
          g.fillStyle = '#ffffff';
          g.fillRect(tx - 1, ty - 1, 3, 3);
          g.fillStyle = '#e06a74';
          g.fillRect(tx - 2, ty, 5, 1); g.fillRect(tx, ty - 2, 1, 5);
        }
        // PORT SLICE J2 — BEAM pulse body: one bright packet riding down the
        // beam at d = t * len (reference: CrystalBig gem-projectile frames):
        // white heart + pale cross ticks. t-driven, never wall clock. +3 rects.
        {
          const pd = t * fx.len;
          const qx = Math.round(fx.x + cx * pd - cam.x), qy = Math.round(fx.y + cy * pd - cam.y);
          g.fillStyle = '#ffffff';
          g.fillRect(qx - 1, qy - 1, 3, 3);
          g.fillStyle = '#e06a74';
          g.fillRect(qx - 3, qy, 7, 1); g.fillRect(qx, qy - 3, 1, 7);
        }
      } else if (fx.kind === 'zap') {
        // Chain lightning: 2px dots sampled along each polyline segment +
        // PORT SLICE H fork ticks every 3rd dot (perpendicular, hash-sided).
        // A fusion's link bolt (fx.fus) or a fused Chain Zap strikes in the fusion's colours.
        const zf = (fx.fus && fusionDef(fx.fus)) || (fusOf && fusOf.zap);
        g.fillStyle = zf ? (t < 0.5 ? zf.tint[0] : zf.tint[1]) : (t < 0.5 ? '#ffffff' : '#a8d0f4');
        const zh = ((Math.round(fx.points[0].x) * 73856093) ^ (Math.round(fx.points[0].y) * 19349663)) >>> 0;
        let zdi = 0;
        for (let s = 0; s < fx.points.length - 1; s++) {
          const a = fx.points[s], b = fx.points[s + 1];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.max(2, Math.ceil(len / 5));
          const inv = len > 0 ? 1 / len : 0;
          const pxn = -(b.y - a.y) * inv, pyn = (b.x - a.x) * inv;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const dx = Math.round(a.x + (b.x - a.x) * u - cam.x),
                  dy = Math.round(a.y + (b.y - a.y) * u - cam.y);
            g.fillRect(dx, dy, 2, 2);
            if (zdi % 3 === 2) {
              const side = ((zh >> (zdi % 16)) & 1) === 0 ? 1 : -1;
              g.fillRect(Math.round(dx + pxn * 3 * side), Math.round(dy + pyn * 3 * side), 1, 1);
            }
            zdi++;
          }
        }
        // PORT SLICE J2 — ZAP bolt head: a hot diamond on the primary strike
        // point (reference: doi01-doi09 weapon-fx + SpearTip ice lance):
        // white heart + four gold ticks. Position-derived, never wall clock,
        // and the polyline above paints byte-identically to slice-h. +5 rects.
        if (fx.points.length > 1) {
          const hp0 = fx.points[1];
          const zx = Math.round(hp0.x - cam.x), zy = Math.round(hp0.y - cam.y);
          g.fillStyle = '#ffffff';
          g.fillRect(zx - 1, zy - 1, 3, 3);
          g.fillStyle = '#f0c860';
          g.fillRect(zx - 3, zy, 1, 1); g.fillRect(zx + 3, zy, 1, 1);
          g.fillRect(zx, zy - 3, 1, 1); g.fillRect(zx, zy + 3, 1, 1);
        }
      } else if (fx.kind === 'orbit') {
        // PORT SLICE J2 — orbit blade body: the shipped painter drew one flat
        // 4x4 dot per blade. Now a steel petal-blade (reference: fl00-fl88
        // flower/leaf frames + inner/outer pentagram rings): pale bar on the
        // spin axis, white cutting edge, blue fuller core, one hash glint at
        // a tip. Phase is a static position-hash bit (never wall clock), so
        // the two phases read as the blade's spin as it orbits. <= 9 rects.
        const ox = Math.round(fx.x - cam.x), oy = Math.round(fx.y - cam.y);
        const oh = ((Math.round(fx.x) * 73856093) ^ (Math.round(fx.y) * 19349663)) >>> 0;
        const horiz = ((oh >> 4) & 1) === 0;
        g.fillStyle = '#a8d0f4';
        if (horiz) {
          g.fillRect(ox - 4, oy - 1, 9, 2);
          g.fillRect(ox - 2, oy - 2, 5, 1);
        } else {
          g.fillRect(ox - 1, oy - 4, 2, 9);
          g.fillRect(ox - 2, oy - 2, 1, 5);
        }
        g.fillStyle = '#ffffff';
        if (horiz) { g.fillRect(ox - 4, oy - 1, 9, 1); }
        else { g.fillRect(ox - 1, oy - 4, 1, 9); }
        g.fillStyle = '#8aa0c0';
        if (horiz) { g.fillRect(ox - 1, oy, 3, 1); }
        else { g.fillRect(ox, oy - 1, 1, 3); }
        g.fillStyle = '#ffffff';
        if (horiz) { g.fillRect(ox + ((oh & 1) === 0 ? 4 : -4), oy - 2, 1, 1); }
        else { g.fillRect(ox - 2, oy + ((oh & 1) === 0 ? 4 : -4), 1, 1); }
        if (fusOf && fusOf.orbit) blitFusionCorona(g, fusOf.orbit, ox, oy, oh, cached);
      } else if (fx.kind === 'orbit_hit') {
        // PORT SLICE H: orbit-blade contact was a flat 6x6 white square.
        // Now a ring-burst: white core + 8-tick pale ring + 4 diagonal flecks.
        // Same trigger/ttl; hash-phased, t-driven, <= 14 rects.
        const ox = Math.round(fx.x - cam.x), oy = Math.round(fx.y - cam.y);
        const oh = ((Math.round(fx.x) * 73856093) ^ (Math.round(fx.y) * 19349663)) >>> 0;
        const orot = ((oh % 360) / 360) * Math.PI * 2;
        const orr = 2 + 6 * t;
        g.fillStyle = '#ffffff';
        const ocz = t < 0.4 ? 4 : 3;
        g.fillRect(ox - Math.round(ocz / 2), oy - Math.round(ocz / 2), ocz, ocz);
        g.fillStyle = '#a8d0f4';
        for (let i = 0; i < 8; i++) {
          const a = orot + (i / 8) * Math.PI * 2;
          g.fillRect(Math.round(ox + Math.cos(a) * orr), Math.round(oy + Math.sin(a) * orr), 1, 1);
        }
        if (t < 0.7) {
          g.fillStyle = '#8aa0c0';
          const od = Math.round(3 + 4 * t);
          const s0 = (oh >> 3) & 1;
          g.fillRect(ox - od + s0, oy - od, 1, 1); g.fillRect(ox + od, oy - od + s0, 1, 1);
          g.fillRect(ox - od, oy + od + s0, 1, 1); g.fillRect(ox + od + s0, oy + od, 1, 1);
        }
      } else if (fx.kind === 'hit_spark' || fx.kind === 'muzzle' || fx.kind === 'scythe_hit' ||
                 fx.kind === 'seeker_pop' || fx.kind === 'mine_hit' || fx.kind === 'mine_fizzle' ||
                 fx.kind === 'beam_hit') {
        // PORT SLICE H: per-source impact art. The old painter drew one
        // shrinking square per kind (+ 4 fixed flecks on two kinds). Each kind
        // below keeps its trigger/ttl/palette family and gains an ORIGINAL
        // composition: hot core + cross arms + hash-phased diagonal crackle.
        // Hash is a static stamp of the impact point (never wall clock);
        // motion is t = age/ttl only. Bounded: <= 12 rects per spark.
        const sh = ((Math.round(fx.x) * 73856093) ^ (Math.round(fx.y) * 19349663)) >>> 0;
        const sx = Math.round(fx.x - cam.x), sy = Math.round(fx.y - cam.y);
        const srot = (sh % 4);   // diagonal phase 0..3
        const sdiag = (dx, dy, col) => {
          g.fillStyle = col;
          const jx = (sh >> 5) & 1, jy = (sh >> 6) & 1;
          g.fillRect(sx + dx + jx - (dx < 0 ? 1 : 0), sy + dy + jy - (dy < 0 ? 1 : 0), 1, 1);
        };
        if (fx.kind === 'hit_spark') {
          // Volley impact star: white core, gold-to-ember cross, 4 crackle flecks.
          const core = t < 0.5 ? '#ffffff' : '#f0c860';
          const arm = t < 0.5 ? '#f0c860' : '#e8902a';
          const alen = t < 0.4 ? 5 : t < 0.75 ? 4 : 3;
          g.fillStyle = core;
          const cs = t < 0.4 ? 3 : 2;
          g.fillRect(sx - 1, sy - 1, cs, cs);
          g.fillStyle = arm;
          g.fillRect(sx - alen, sy, alen * 2, 1); g.fillRect(sx, sy - alen, 1, alen * 2);
          if (t < 0.7) {
            const dd = Math.round(3 + 4 * t) + srot % 2;
            sdiag(-dd, -dd, '#f8e098'); sdiag(dd, -dd, '#f8e098');
            sdiag(-dd, dd, '#f8e098'); sdiag(dd, dd, '#f8e098');
          }
        } else if (fx.kind === 'muzzle') {
          // Muzzle chevron: hot core + two side ticks along the hash direction.
          g.fillStyle = t < 0.5 ? '#f8e098' : '#e8902a';
          g.fillRect(sx - 1, sy - 1, 3, 3);
          g.fillStyle = '#e8902a';
          const mo = srot % 2 === 0 ? 1 : -1;
          g.fillRect(sx - 3, sy + mo * 2, 2, 1); g.fillRect(sx + 2, sy - mo * 2, 2, 1);
        } else if (fx.kind === 'scythe_hit') {
          // Reap tick: white core + two trailing ticks along a hash direction.
          const sa = (srot / 4) * Math.PI * 2 + Math.PI / 4;
          const cdx = Math.cos(sa), cdy = Math.sin(sa);
          g.fillStyle = t < 0.5 ? '#ffffff' : '#a8d0f4';
          g.fillRect(sx - 1, sy - 1, 3, 3);
          g.fillStyle = '#a8d0f4';
          g.fillRect(Math.round(sx - cdx * 3), Math.round(sy - cdy * 3), 2, 2);
          g.fillStyle = '#8aa0c0';
          g.fillRect(Math.round(sx - cdx * 5), Math.round(sy - cdy * 5), 1, 1);
        } else if (fx.kind === 'seeker_pop') {
          // Ember pop: gold core, ember halo, 4 outward sparks.
          g.fillStyle = t < 0.5 ? '#f8e098' : '#e8902a';
          g.fillRect(sx - 1, sy - 1, 3, 3);
          if (t < 0.7) {
            g.fillStyle = '#e8902a';
            const pd = Math.round(3 + 3 * t);
            g.fillRect(sx - pd, sy, 1, 1); g.fillRect(sx + pd, sy, 1, 1);
            g.fillRect(sx, sy - pd, 1, 1); g.fillRect(sx, sy + pd, 1, 1);
            const qd = pd - 1 + srot % 2;
            sdiag(-qd, -qd, '#f8e098'); sdiag(qd, qd, '#f8e098');
          }
        } else if (fx.kind === 'mine_hit') {
          // Amber contact star: gold core, ember cross, diagonal crackle.
          g.fillStyle = t < 0.5 ? '#f0c860' : '#e8902a';
          g.fillRect(sx - 1, sy - 1, 3, 3);
          g.fillStyle = '#e8902a';
          const md = t < 0.5 ? 4 : 3;
          g.fillRect(sx - md, sy, md * 2, 1); g.fillRect(sx, sy - md, 1, md * 2);
          if (t < 0.6) {
            const dd = md + 1 + srot % 2;
            sdiag(-dd, -dd, '#f0c860'); sdiag(dd, -dd, '#f0c860');
            sdiag(-dd, dd, '#f0c860'); sdiag(dd, dd, '#f0c860');
          }
        } else if (fx.kind === 'mine_fizzle') {
          // Damp fizzle: three grey motes drifting apart and upward with t.
          g.fillStyle = t < 0.5 ? '#9c98a4' : '#5e5968';
          const fo = Math.round(1 + 3 * t);
          const fy = Math.round(2 * t);
          g.fillRect(sx - fo, sy - fy, 1, 1);
          g.fillRect(sx + fo - 1 + (srot % 2), sy - fy - 1, 2, 2);
          g.fillRect(sx - 1 + (srot % 2), sy + fo - fy, 1, 1);
        } else {  // beam_hit
          // Magenta impact cross: white core, long cross, pale diagonals.
          g.fillStyle = '#ffffff';
          g.fillRect(sx - 1, sy - 1, 2, 2);
          g.fillStyle = '#e06a74';
          const bd = t < 0.5 ? 5 : 4;
          g.fillRect(sx - bd, sy, bd * 2, 1); g.fillRect(sx, sy - bd, 1, bd * 2);
          if (t < 0.7) {
            const qd = bd - 1 + srot % 2;
            sdiag(-qd, -qd, '#e06a74'); sdiag(qd, -qd, '#e06a74');
            sdiag(-qd, qd, '#e06a74'); sdiag(qd, qd, '#e06a74');
          }
        }
      } else if (fx.kind === 'flash') {
        // WAVE-11 FLASH DROP: full-screen white-out fading over the fx life —
        // the screen-clear moment erases the weakest trash tier. WAVE-16: the
        // fill must cover the WHOLE screen, so it draws after the zoom layer
        // is restored (a fillRect inside the world transform would only wash
        // the zoomed sub-rect).
        pendingFlash = fx;
      } else if (fx.kind === 'charge') {
        // Flickering yellow brackets around the player while overcharged.
        if (Math.floor(fx.age * 20) % 2 === 0) {
          const x = Math.round(fx.x - cam.x), y = Math.round(fx.y - cam.y);
          g.fillStyle = '#f0c860';
          g.fillRect(x - 10, y - 10, 5, 2); g.fillRect(x - 10, y - 10, 2, 5);
          g.fillRect(x + 5, y - 10, 5, 2);  g.fillRect(x + 8, y - 10, 2, 5);
          g.fillRect(x - 10, y + 8, 5, 2);  g.fillRect(x - 10, y + 5, 2, 5);
          g.fillRect(x + 5, y + 8, 5, 2);   g.fillRect(x + 8, y + 5, 2, 5);
        }
      }
    }

    // Death puffs, sparks, level-up and pickup bursts (src/fx/feel.js pools).
    drawFeelEffects(g, state, cam, prefersReducedMotion(), !!this.groundLight);   // dark on a light floor
    if (sink) sink.order.push('effects');

    // Weather PARTICLES (weather.js): camera-anchored rain/snow/wind/bugs —
    // they ride the world zoom like everything else in this layer. The
    // distant sky layers (cloud bands, sun, scene tint) stay NATIVE 1x and
    // paint after the restore below.
    g.globalAlpha = 1 - 0.8 * this.light.arenaEase(state); this.drawWeatherParticles(g, state.weather, cam); g.globalAlpha = 1;   // R7: the weather fades in the void
    if (sink) sink.order.push('weather');
    // Damage numbers next: they describe everything under them. R3: the hero
    // is drawn after them (always on top), and they fade as they near the
    // hero's box (fx/feel_render.js heroFade).
    {
      const p0 = state.player;
      const hb = { x0: p0.x - cam.x - HERO_BOX_HALF, y0: p0.y - cam.y - HERO_BOX_HALF,
        x1: p0.x - cam.x + HERO_BOX_HALF, y1: p0.y - cam.y + HERO_BOX_HALF };
      drawFeelNumbers(g, state, cam, hb, sink);
      if (sink) { sink.order.push('numbers'); sink.hero = hb; }
    }

    // Player. Walk cycle (2 frames @ ~6fps, same clock as the enemies) —
    // frame B only while actually moving: motion is derived from the player's
    // position delta between renders (the same velocity the controller
    // produces), so no gameplay state was added. Stationary -> frame A.
    // PORT SLICE C: the equipped pilot's own look (src/character_sprites.js,
    // same 12x12 box as the generic pair, so geometry is untouched); unknown /
    // unset character ids keep the generic PLAYER_SPRITE pair (the fallback,
    // never a pilot's look).
    const pl = state.player;
    // While invulnerable the body blinks; the pool, the ring and the arrow
    // stay solid so the hero is never lost in the blink.
    const blink = pl.invuln > 0 && Math.floor(state.time * 20) % 2 === 0;
    const stepD = this._lpx !== undefined ? Math.hypot(pl.x - this._lpx, pl.y - this._lpy) : 0;
    const moved = stepD > 0.25;
    this._lpx = pl.x; this._lpy = pl.y;
    // Gait follows distance walked (a step every 7 px), not the run clock,
    // which the tutorial holds at 0:00. A teleport is not a step.
    if (moved && stepD < 40) this._walkDist = (this._walkDist || 0) + stepD;
    const walkFrame = moved && Math.floor(state.time * 6) % 2 === 1;
    const pilotSpr = characterSpriteFor(state.character && state.character.id);
    // Pilots walk on their step frames (1..n-1).
    const pilotStep = pilotSpr && moved ? 1 + Math.floor((this._walkDist || 0) / 7) % (pilotSpr.frames.length - 1) : 0;
    const pilotGrid = pilotSpr
      ? pilotSpr.frames[pilotStep]
      : (walkFrame ? PLAYER_SPRITE_WALK : PLAYER_SPRITE);
    const pilotPalette = pilotSpr ? pilotSpr.palette : PALETTE;
    // Pilot grids are 16x16 (the generic fallback 12x12): centre on the hero.
    const pilotHalfW = Math.floor(pilotGrid[0].length / 2), pilotHalfH = Math.floor(pilotGrid.length / 2);
    if (cached) {
      // The hero: a pale pool underfoot so the eye finds them in a crowd,
      // outline + rim + shadow baked, white silhouette for a beat when hurt.
      const hurt = state.feel && state.feel.hurtT > 0;
      // Art pass: a wider pool plus a crisp ground ring (dark under bright)
      // that sits ON TOP of the horde, so the hero is findable in a crowd.
      const hx = Math.round(pl.x - cam.x), hfy = Math.round(pl.y - cam.y) + pilotHalfH - 1;
      blitGlow(g, hurt ? '#ff5566' : HERO_WARM, 16, hx, hfy, 1);
      // The ring stays warm white when hurt: red reads as one more enemy.
      if (this.groundLight) blitPainted(g, 'heroRingK', HERO_RING_BOX, paintHeroRingKeyed, hx, hfy);
      else blitPainted(g, 'heroRing', HERO_RING_BOX, paintHeroRing, hx, hfy);
      if (blink && !hurt) g.globalAlpha = 0.6;   // the white hit flash stays solid
      // Facing (the feel observer's record, on sim time) and a 1 px bob on
      // every other step. The ring and the pool stay on the ground.
      const heroRec = state.feel && state.feel.hero;
      const heroFlip = actorAnimOn() && !!heroRec && heroRec.face < 0;
      const lift = heroLift(Math.floor((this._walkDist || 0) / 7), moved, prefersReducedMotion());
      const hsx = Math.round(pl.x - cam.x - pilotHalfW), hsy = Math.round(pl.y - cam.y - pilotHalfH) - lift;
      blitGridPose(g, pilotGrid, pilotPalette, hsx, hsy, actorStyle(hurt, false, HERO_WARM, true, false, !!this.groundLight), 1,
        heroFlip, 1, 1, hsx + pilotGrid[0].length / 2, hsy + pilotGrid.length);
      g.globalAlpha = 1;
      // In a crowd, or when hurt, the arrow over the head points the hero out.
      let crowd = 0;
      for (const e of state.enemies) {
        if (Math.abs(e.x - pl.x) < HERO_CROWD_X && Math.abs(e.y - pl.y) < HERO_CROWD_Y && ++crowd >= HERO_CROWD_ON) break;
      }
      if (hurt || crowd >= HERO_CROWD_ON) this.heroMark = true;
      else if (crowd < HERO_CROWD_OFF) this.heroMark = false;
      if (this.heroMark) {
        const bob = prefersReducedMotion() ? 0 : Math.floor((state.time || 0) * 4) % 2;
        blitPainted(g, 'heroMark', HERO_MARK_BOX, paintHeroMark, hx, Math.round(pl.y - cam.y) - pilotHalfH - 8 - bob);
      }
    } else {
      if (blink) g.globalAlpha = 0.4;
      this.drawGrid(g, pilotGrid, pilotPalette,
        Math.round(pl.x - cam.x - pilotHalfW),
        Math.round(pl.y - cam.y - pilotHalfH));
    }
    g.globalAlpha = 1;
    // FIRST-RUN PROLOGUE — the shield's rainbow pulse: six slowly-spinning
    // ticks, each on its own hue (i*30 around the wheel) in a gentle shared
    // cycle (prologueShieldColor: 40 deg/s, static green under reduced
    // motion). Own lifetime (state.prologueShieldT), so the ring stops at
    // expiry and a later portal invuln cannot restart it.
    if (state.prologueShieldT > 0) {
      const elapsed = C.PROLOGUE.INVULN_S - state.prologueShieldT;
      const reduced = prefersReducedMotion();
      const spin = reduced ? 0 : elapsed * 0.9;
      for (let i = 0; i < 6; i++) {
        const a = spin + i * Math.PI / 3;
        g.fillStyle = prologueShieldColor(elapsed, reduced, i * 30);
        g.fillRect(Math.round(pl.x - cam.x + Math.cos(a) * 13) - 1,
          Math.round(pl.y - cam.y + Math.sin(a) * 13) - 1, 3, 3);
      }
    }

    if (sink) sink.order.push('hero');

    // ---- end of the zoomed world layer --------------------------------------
    g.restore();
    // R7: the arrival sting's push copies the world just drawn back over
    // itself, scaled toward the boss (drawing only; main.js sets it).
    if (typeof this.afterWorld === 'function') this.afterWorld(g);

    // Deferred WAVE-11 flash: full-screen white-out at native 1x so the wash
    // covers the whole screen regardless of zoom.
    if (pendingFlash) {
      const ft = pendingFlash.age / pendingFlash.ttl;
      g.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - ft)).toFixed(3) + ')';
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    // Boss HP bar: full-width overlay at the top while a boss lives (native).
    {
      const boss = state.wave && state.wave.boss;
      if (boss && boss.hp > 0) {
        const x0 = 24, x1 = C.VIEW_W - 24, y = 4;
        const w = x1 - x0;
        g.fillStyle = '#000000';
        g.fillRect(x0 - 1, y - 1, w + 2, 7);
        g.fillStyle = '#8a2be2';
        g.fillRect(x0, y, Math.ceil(w * Math.max(0, boss.hp / boss.maxHp)), 5);
        g.fillStyle = '#ffd75e';
        g.fillRect(x0, y, 2, 5);
        g.fillRect(x1 - 2, y, 2, 5);
      }
      // WAVE-10: the maw's bar — taller and blood-red; the hp floors at
      // HP_FLOOR so it NEVER fully empties while BEATABLE is false (reads as
      // draining-toward-something, not broken). The exact number lives in the
      // HUD text line (M-formatted); the canvas bar is the drama.
      const fb = state.finalBoss;
      if (fb && state.mode === 'finale') {
        const bx0 = 16, bx1 = C.VIEW_W - 16, by = 2;
        const bw = bx1 - bx0;
        g.fillStyle = '#000000';
        g.fillRect(bx0 - 1, by - 1, bw + 2, 9);
        g.fillStyle = '#5a0a1c';
        g.fillRect(bx0, by, bw, 7);
        g.fillStyle = '#ff2f5e';
        g.fillRect(bx0, by, Math.ceil(bw * Math.max(0, fb.hp / fb.maxHp)), 7);
        g.fillStyle = '#ffd75e';
        g.fillRect(bx0, by, 2, 7);
        g.fillRect(bx1 - 2, by, 2, 7);
      }
    }

    // Weather sky + tint (weather.js): bands/rays/tint are screen-dressing,
    // not world objects — they stay native 1x and cover the full screen.
    g.globalAlpha = 1 - this.light.arenaEase(state); this.drawWeatherSky(g, state.weather, cam); g.globalAlpha = 1;   // R7: no sky over the void

    // WAVE-12 canvas HUD chrome: graphic HP/mana bars, weapon/equipment icon
    // rows, weather glyph. Drawn LAST so it always sits above the scene.
    // WAVE-26: the earned-moment flourish paints just BELOW the chrome so the
    // HUD readouts stay legible through the flare.
    // R2: a film laid over the world but under the HUD (the portal beat's
    // bars, column and dust), so the readouts stay on top of it.
    if (typeof this.underHud === 'function') this.underHud(g);
    this.drawPlayHud(g, state);
    // M1 THE MAP SCREEN: drawn LAST on the canvas layer — OPAQUE over the
    // field (C1; the DOM touch pads stay tappable above the canvas, so the
    // player can still steer blind and close it). Self-gates on mapOpen.
    this.drawAtlasMap(g, state);
    // WAVE-14 boss-arrival overlay: cinematic letterbox + name. Above even
    // the HUD chrome — it is a moment, not a readout.
  }

  // ---- the play HUD, in one gated seam ---------------------------------------
  // G9 FOLLOW-UP (parent-found): the gallery is NOT a play state. The frozen
  // world stays as the backdrop, but the play READOUTS (bars, LV, clock, the
  // event feed flourish and the boss banner) must not bleed through the
  // showcase. The DOM side already does this via chromeOn(); this is the canvas
  // half of the same gate. Folded into ONE method so it is directly assertable
  // (test_trophy_gallery) — paint order is unchanged: moment, chrome, banner.
  //
  // MODAL SURFACE SUPPRESSION (owner 2026-09-17, msg_01M2RVD9HHZZDSR7FKNTRRSSY5
  // + addendum): "any full-screen or modal surface must suppress the HUD and
  // all status messages while it is up — ONE shared mechanism so the next
  // modal inherits it." That mechanism is hudSuppressed() below: a modal
  // surface joins by adding its mode to HUD_SUPPRESSED_MODES, and the whole
  // play HUD (chrome + the toast/event feed inside it, radar, moment flourishes
  // and the boss banner) stops painting for its duration. The end-of-run
  // summary ('dead') was the shipped defect — the death cause printed over the
  // stat bars and the GOLD counter over the gold line (owner screenshot
  // 2026-09-17); the gallery states (G9/G10) fold into the same list.
  drawPlayHud(g, state) {
    // World cards (vault, cursed statue): drawn over the world, on screen and
    // clear of the HUD (world_cards.js). With the HUD hidden there is nothing to avoid.
    const cardView = { Z: this._zoom || 1, shake: this.shake || { x: 0, y: 0 }, vw: C.VIEW_W, vh: C.VIEW_H };
    // hudOff (main.js forgeOfferHidesHud): the evolve offer on an upright
    // phone stands over the HUD rows; the frozen field is drawn without them.
    if (hudSuppressed(state) || this.hudOff) {
      this.hudChrome = null; this.bossBanner = null; this.radar = null;
      this.fsButton = null;   // the fullscreen toggle rides the same gate
      this.hudDrawn = false;
      this.worldCards = flushWorldCards(g, cardView);
      return;
    }
    this.drawMoment(g, state);
    // R7: the arrival sting's name card (state.hudHole, view px) is drawn
    // under the HUD; the HUD rows that would stand on it are not drawn there,
    // and the radar steps out while it touches the card.
    const hole = state.hudHole;
    const holed = !!(hole && hole.w > 0 && hole.h > 0 && typeof g.clip === 'function');
    if (holed) {
      g.save();
      // One clip per rect (clips add up), so two rects that overlap stay holes.
      for (const r of [hole, hole.also]) {
        if (!r) continue;
        g.beginPath();
        g.rect(0, 0, C.VIEW_W, C.VIEW_H);
        g.rect(r.x, r.y, r.w, r.h);
        g.clip('evenodd');
      }
    }
    this.drawHudChrome(g, state);
    if (holed) g.restore();
    const ch = this.hudChrome;
    this.worldCards = flushWorldCards(g, { ...cardView,
      avoid: ch ? [ch.quests, ch.bars, ch.purse, ch.clock, ch.auto, ch.hand] : [] });
    if (hole && radarTouches(state, hole)) this.radar = null;
    else this.drawRadar(g, state);
    this.drawBossBanner(g, state);
    this.drawPrologueBanner(g, state);
    this.drawPrologueSkip(g, state);
    this.drawWheelCue(g, state);
    this.drawFsButton(g, state);
    // SEAM (end-summary HUD suppression, 2026-09-17): one flag the browser
    // tests read — TRUE iff the play HUD (bars, feed, radar, banner) actually
    // painted this frame. The end-of-run summary asserts it FALSE in 'dead'.
    this.hudDrawn = true;
  }

  // ---- The wheel cue: who is steering while the pilot mode is AUTO ----------
  // state.wheelCue is main.js's text ('YOU STEER', 'AUTO in 1.2s', or ''). A
  // small plate at the bottom centre of the view, clear of the weapon row
  // (left) and the radar (right).
  drawWheelCue(g, state) {
    this.wheelCue = null;
    const txt = state.wheelCue;
    if (!txt) return;
    const px = 9;
    const w = txt.length * Math.round(px * 0.62) + 8, h = px + 6;
    const x = Math.round((C.VIEW_W - w) / 2), y = C.VIEW_H - h - 8;
    g.fillStyle = C.HUD.PLATE;
    g.fillRect(x, y, w, h);
    g.fillStyle = '#ffd75e';
    g.fillRect(x, y + h - 1, w, 1);
    g.font = 'bold ' + px + 'px monospace';
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = '#fff3c4';
    g.fillText(txt, x + 4, y + 3);
    this.wheelCue = { x, y, w, h, text: txt };
  }

  // ---- FULLSCREEN — the transient canvas toggle (owner 2026-09-17) --------
  // Painted INSIDE drawPlayHud, so every modal-suppression rule
  // (hudSuppressed: dead/trophies/bestiary) covers it for free — the
  // end-of-run summary inherits the same gate the owner's suppression task
  // built — and main.js's fsVisible() keeps it to the pad screens
  // (playing/finale), so menus, draft cards and cinematics never carry it.
  // The box is mid-right of the view, the one column with no HUD chrome and
  // no DOM pad at any phone size (geometry asserted in
  // test_fullscreen_button.mjs). Icon: house plate + four corner brackets
  // (the expand metaphor); while fullscreen is ACTIVE a centre dot joins
  // them — "you are in; this exits". No glyphs, no text.
  drawFsButton(g, state) {
    const f = state.fsOverlay;
    if (!f || !f.supported || !f.visible) { this.fsButton = null; return; }
    const F = C.FULLSCREEN;
    const b = { x: C.VIEW_W - F.INSET - F.W, y: (C.VIEW_H - F.H) / 2, w: F.W, h: F.H };
    g.fillStyle = C.HUD.PLATE;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = C.HUD.FRAME;
    g.fillRect(b.x, b.y, b.w, 1);
    g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    g.fillRect(b.x, b.y, 1, b.h);
    g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    g.fillStyle = '#e8e8f0';
    const inset = 3, arm = 5, t = 2;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const hx = b.x + (cx ? b.w - inset - arm : inset);
      const vy = b.y + (cy ? b.h - inset - t : inset);
      g.fillRect(hx, vy, arm, t);
      const vx = b.x + (cx ? b.w - inset - t : inset);
      const hy = b.y + (cy ? b.h - inset - arm : inset);
      g.fillRect(vx, hy, t, arm);
    }
    if (f.active) g.fillRect(b.x + b.w / 2 - 1, b.y + b.h / 2 - 1, 3, 3);
    fsKeyline(g, b);   // PORT SLICE I: inner keyline inside the button box
    // SEAM: the painted box this frame (view coords) — the tests' geometry
    // source, mirroring the radar/banner seams above.
    this.fsButton = b;
  }

  // ---- A2 THE RADAR (owner-suggested 2026-09-14, pair to A1's AUTO pilot) ----
  // A circular minimap in the HUD layer: nearby enemies as tier-classified dots
  // around the player. The DATA is radar.js's radarDots() — the same function
  // test_radar.mjs pins — called every frame with the live state; this method
  // only paints what it returns. There is no time term anywhere in it (the dot
  // set is a pure function of the current positions), so 60Hz and 120Hz paint
  // the identical frame for the identical state — nothing assumes a dt.
  //
  // GEOMETRY (fixed; the H1 no-reflow contract — the radar never reflows any
  // other HUD element, its box is a constant of the view): bottom-right corner,
  // display radius RADAR_DISPLAY_R view px, mapped over RADAR_RADIUS (330)
  // world px — the module's radius, which covers the whole 322px spawn ring.
  //
  // THE PAIRING (owner context): AUTOPILOT.FOCUS_RANGE (100 world px) is the
  // pilot's engagement radius, and the radar exists to show what the AUTO pilot
  // is IGNORING — so the focus ring is painted as a faint circle at its true
  // scaled radius: dots INSIDE it are the pilot's problem, dots outside are
  // the player's. Read from C.AUTOPILOT, never restated.
  //
  // `this.radar` is the honest test seam (same contract as hudChrome): the
  // exact box + the screen-space dots painted this frame, null while the
  // radar is off — so "toggle off restores the HUD" is assertable as
  // radar === null plus zero paint in the box.
  // N6: the radar's STATIC paint — plate rows, steel rim, focus ring, centre
  // pip — exactly the loops drawRadar used to run per frame. Kept verbatim as
  // the cache BUILDER (and the parity reference): same fills, same integer
  // coordinates, just aimed at the offscreen canvas once instead of the main
  // canvas every frame.
  _paintRadarPlate(g, cx, cy, R, focusR) {
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      g.fillStyle = C.HUD.PLATE;
      g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R || d <= R - 1.5) continue;
        g.fillStyle = C.HUD.FRAME;                     // steel rim, 1px band
        g.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    // The AUTO pilot's engagement ring (the pairing made visible): faint, 1px.
    if (focusR > 1) {
      g.fillStyle = 'rgba(184,224,255,0.28)';
      for (let dy = -focusR; dy <= focusR; dy++) {
        for (let dx = -focusR; dx <= focusR; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > focusR || d <= focusR - 1.2) continue;
          g.fillRect(cx + dx, cy + dy, 1, 1);
        }
      }
    }
    // The player pip at the centre (the radar is player-relative by contract).
    g.fillStyle = '#e8e8f0';
    g.fillRect(cx - 1, cy - 1, 3, 3);
  }

  drawRadar(g, state) {
    const p = state.player;
    if (!state.radarOn || !p || !p.stats) { this.radar = null; return; }
    const R = RADAR_DISPLAY_R;
    // state.radarInset: view px the disc steps left so it clears the DOM pad
    // column where that column overlays the canvas (desktop); 0 elsewhere.
    const inset = Math.max(0, Math.min(C.VIEW_W / 2, Math.round(state.radarInset || 0)));
    const cx = C.VIEW_W - RADAR_CORNER_INSET - R - inset;
    const cy = C.VIEW_H - RADAR_CORNER_INSET - R;
    // ARENA RELIEF — VISION (the reward half of high ground): the radar's
    // WORLD reach widens while the drawn disc stays the same fixed-geometry
    // box, so the same plate maps more world (the dots compress). The radius
    // always still covers the spawn ring — on high ground with room to spare.
    const vision = reliefVisionRadius(RADAR_RADIUS, p.highGround !== undefined
      ? (p.highGround ? C.RELIEF.HIGH_LEVEL : 0)
      : reliefLevel(p.x, p.y, state.groundSeed || 0, stageRelief(state.stage)));
    const scale = R / vision;
    const focusR = Math.round((C.AUTOPILOT.FOCUS_RANGE || 0) * scale);

    // The dot set, from the real data layer: live enemies only, classified by
    // classifyTier inside radar.js (BOSS > ELITE > CHAFF — never restated here).
    const live = [];
    for (const e of state.enemies) if (e && e.hp > 0) live.push(e);
    const dots = radarDots(p, live, { radius: vision, displayRadius: R });

    // Plate: a filled dark disc painted as pixel rows (integer half-widths —
    // no arc(), no antialiasing, per the pixel-art rule), then a 1px rim.
    // N6: all of plate + rim + focus ring + centre pip is a pure function of
    // (R, focusR) — both constants of the view — so it is painted ONCE into an
    // offscreen canvas (via _paintRadarPlate, the ORIGINAL loops verbatim, so
    // parity is by construction; tools/verify_nits_n6_parity.mjs byte-compares
    // the cache against the same loops) and blitted per frame. The one
    // drawImage here is this cache's blit — render.js stays free of image
    // ASSETS (the module rule); a cached raster of its own paint is not one.
    const plateKey = R + '@' + focusR;
    if (!this._radarPlate || this._radarPlateKey !== plateKey) {
      // DOM-free by preference (WAVE-27 pin: render.js never touches the DOM
      // global): OffscreenCanvas where it exists (every target browser), else
      // a scratch canvas borrowed from the MAIN canvas's own ownerDocument —
      // the headless-test path, which stubs it on the canvas it hands in.
      //
      // GRACEFUL SKIP (2026-09-19): a minimal test/tool canvas stub that defines
      // NEITHER OffscreenCanvas nor ownerDocument used to THROW here. Nothing
      // noticed because the radar defaulted OFF, so this line never ran — then the
      // radar shipped ON by default and 19 headless tests crashed on it. In every
      // browser one of the two exists, so this guard is unreachable in production;
      // a stub that cannot lend a scratch canvas simply renders no radar, which is
      // exactly what happened before. The WAVE-27 pin is kept: still no DOM global.
      const off = (typeof OffscreenCanvas === 'function')
        ? new OffscreenCanvas(2 * R + 1, 2 * R + 1)
        : (this.canvas && this.canvas.ownerDocument
            ? this.canvas.ownerDocument.createElement('canvas') : null);
      if (!off) { this.radar = null; return; }
      off.width = 2 * R + 1; off.height = 2 * R + 1;
      this._paintRadarPlate(off.getContext('2d'), R, R, R, focusR);
      this._radarPlate = off;
      this._radarPlateKey = plateKey;
      this.radarPlateBuilds++;
    }
    g.drawImage(this._radarPlate, cx - R, cy - R);
    radarTicks(g, cx, cy, R);   // PORT SLICE I: rim ticks on the steel band

    // Dots: size + colour by tier, centred on the integer radar-space offset
    // radarDots returned (screen = centre + offset; the mapping is 1:1).
    const counts = { chaff: 0, elite: 0, boss: 0 };
    const painted = [];
    for (const dot of dots) {
      const st = RADAR_DOT_STYLE[dot.tier] || RADAR_DOT_STYLE.chaff;
      const sx = cx + dot.x, sy = cy + dot.y;
      const o = Math.floor(st.size / 2);
      g.fillStyle = st.color;
      g.fillRect(sx - o, sy - o, st.size, st.size);
      counts[dot.tier] = (counts[dot.tier] || 0) + 1;
      painted.push({ x: sx, y: sy, tier: dot.tier, typeId: dot.typeId, size: st.size, color: st.color });
    }
    // M1 (C2 — ONE TRACKER, TWO SCALES): nearby DISCOVERED landmarks, read
    // from the SAME atlas.landmarks the map screen paints (atlas.js owns the
    // datum; this is a read-only projection into radar space). Gold squares —
    // the shrine idol's colour (render.js shrine draw). Undiscovered
    // landmarks paint NOWHERE, here or on the map (R4).
    const landmarks = [];
    if (state.atlas) {
      // M5b: every site in reach shows; one not yet reached pings white.
      const ping = Math.floor((state.time || 0) * 3) % 2 === 0;
      const closed = !!(state.poi && state.poi.closed);   // the maw closed the sites
      for (const lm of state.atlas.landmarks) {
        const dx = lm.x - p.x, dy = lm.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (!(dist <= vision)) continue;   // radar.js's inclusive rule, at the vision radius
        if (lm.site && (closed || lm.site.state === 'spent')) continue;
        const mx = cx + Math.round(dx * scale), my = cy + Math.round(dy * scale);
        if (!lm.discovered) {
          g.fillStyle = ping ? '#ffffff' : '#8a94a4';
          g.fillRect(mx - 1, my - 1, 3, 3);
        } else {
          g.fillStyle = MAP_ICON[lm.kind] || '#ffd75e';
          if (lm.kind === 'brazier') g.fillRect(mx, my, 2, 2);
          else g.fillRect(mx - 1, my - 1, 3, 3);
        }
        landmarks.push({ x: mx, y: my, kind: lm.kind, discovered: !!lm.discovered });
      }
    }
    this.radar = { cx, cy, r: R, focusR, counts, dots: painted, landmarks };
  }

  // ---- M1 THE PER-RUN MAP SCREEN (owner directive 2026-09-14,
  // docs/briefs/M1_MAP_SCREEN.md) -------------------------------------------
  // The whole 1200x1200 arena at small scale: VISITED AREAS ONLY off the
  // atlas's visited grid (an explored-map convention: the rest is haze), plus
  // DISCOVERED landmarks and the player pip. The datum is state.atlas, the
  // SAME atlas.js tracker the radar reads (C2: one system, two scales).
  //
  // INTEGER-SPANS ONLY (the A2 lesson, restated in C7): every mark below is
  // an integer fillRect — no ctx.arc, no antialiased circle edge, no
  // gradients, no per-cell string work. GEOMETRY IS FIXED (the H1 no-reflow
  // rule): 8 view px per grid cell over the 30x30 grid -> a 240x240 map,
  // integer-centred in the 480x300 view at (120,30). OPAQUE over the field
  // (C1): the sim keeps running while it is open, so hiding the field is the
  // stated risk, not an accident.
  //
  // READ-ONLY: a draw never writes sim state and never advances a timer —
  // the only fields touched are paint locals and this.atlasMap, the honest
  // test seam (null while the map is closed, so "close restores the field"
  // is assertable as atlasMap === null plus zero paint in the box).
  drawAtlasMap(g, state) {
    const atlas = state.atlas;
    if (!state.mapOpen || !atlas || !state.player) { this.atlasMap = null; return; }
    const side = atlas.side;
    // ARENA SCALE-UP: the map must FIT the 480x300 view at any arena size —
    // the cell shrinks so the whole arena reads inside a <=240px box (the
    // shipped 30x30 grid -> 8px cells; the 45x45 nine-unit grid -> 5px).
    // Integer px either way, same paint, same fields.
    const CELL = Math.max(2, Math.floor(240 / side));
    const size = side * CELL;
    const ox = Math.round((C.VIEW_W - size) / 2);
    const oy = Math.round((C.VIEW_H - size) / 2);
    // The plate: one OPAQUE dark rect (the field is hidden BY DESIGN — C1),
    // the unvisited haze as the field's own base fill.
    // M5b: a dark veil over the whole view first, so the key, the header
    // and the CLEAR button never sit on top of the HUD or the field.
    g.fillStyle = 'rgba(4,6,10,0.9)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.fillStyle = '#04060a';
    g.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    g.fillStyle = '#0a0e14';                           // haze = UNVISITED
    g.fillRect(ox, oy, size, size);
    // Visited cells, one integer rect each.
    g.fillStyle = '#233420';
    let visited = 0;
    for (let cy = 0; cy < side; cy++) {
      for (let cx = 0; cx < side; cx++) {
        if (!atlas.visited[cy * side + cx]) continue;
        g.fillRect(ox + cx * CELL, oy + cy * CELL, CELL, CELL);
        visited++;
      }
    }
    // M5b: plateaus and ramps on the map, inside the lifted fog only: tops a
    // lighter green (upper tiers lighter still), ramps and bridges tan.
    const TERm = terrainFor(state.groundSeed || 0, state.stage);
    if (TERm) {
      const k = size / (2 * TEXT);
      for (let c = 0; c < TN * TN; c++) {
        const tier = TERm.tier[c], fl = TERm.flags[c];
        if (!tier && !(fl & (F_RAMP | F_BRIDGE))) continue;
        const wx = -TEXT + (c % TN) * TCELL, wy = -TEXT + Math.floor(c / TN) * TCELL;
        const ax = Math.floor((wx + atlas.rim) / (2 * atlas.rim) * side), ay = Math.floor((wy + atlas.rim) / (2 * atlas.rim) * side);
        if (ax < 0 || ay < 0 || ax >= side || ay >= side || !atlas.visited[ay * side + ax]) continue;
        g.fillStyle = (fl & (F_RAMP | F_BRIDGE)) ? '#6a5a3a' : tier >= 4 ? '#5a7a4a' : '#3e5a34';
        const x0 = ox + Math.round((wx + TEXT) * k), y0 = oy + Math.round((wy + TEXT) * k);
        g.fillRect(x0, y0, Math.max(1, ox + Math.round((wx + TCELL + TEXT) * k) - x0), Math.max(1, oy + Math.round((wy + TCELL + TEXT) * k) - y0));
      }
    }
    // The arena rim frame: the map reads as THE ARENA, not a texture.
    g.fillStyle = '#3a4a58';
    g.fillRect(ox - 1, oy - 1, size + 2, 1);
    g.fillRect(ox - 1, oy + size, size + 2, 1);
    g.fillRect(ox - 1, oy, 1, size);
    g.fillRect(ox + size, oy, 1, size);
    // M5b: site icons. Reached (discovered) sites show their kind and state;
    // sites seen on the radar but not reached show a "?"; the rest stay hidden.
    const marks = [];
    const at = (wx, wy) => [ox + Math.round((wx + atlas.rim) / (2 * atlas.rim) * size),
      oy + Math.round((wy + atlas.rim) / (2 * atlas.rim) * size)];
    // Once the maw has closed the sites, the reached ones turn grey ('closed':
    // no waypoint) and the "?" ones leave the map.
    const closed = !!(state.poi && state.poi.closed);
    for (const lm of atlas.landmarks) {
      if (!lm.discovered && !lm.seen) continue;
      const site = lm.site || null;
      if (closed && site && !lm.discovered) continue;
      const [mx, my] = at(lm.x, lm.y);
      const st = !lm.discovered ? 'unknown' : !site ? 'unused' : closed && site.state !== 'spent' ? 'closed' : site.state;
      drawMapIcon(g, lm.kind, mx, my, st === 'closed' ? 'spent' : st, lm.kind === 'brazier' && lm.discovered);
      marks.push({ kind: lm.kind, x: mx, y: my, site, state: st });
    }
    // M5b slice 3: the lever-yard link, the key carrier, the key, found secrets.
    const poiMarks = drawPoiMap(g, state, at);
    // The portal and live bosses.
    if (state.portal) {
      const [mx, my] = at(state.portal.x, state.portal.y);
      g.fillStyle = '#000000'; g.fillRect(mx - 3, my - 3, 7, 7);
      g.fillStyle = '#c87aff'; g.fillRect(mx - 2, my - 2, 5, 5);
      g.fillStyle = '#ffffff'; g.fillRect(mx, my, 1, 1);
    }
    const bosses = [];
    for (const b of (state.wave && state.wave.bosses) || []) {
      if (!(b.hp > 0)) continue;
      const [mx, my] = at(b.x, b.y);
      g.fillStyle = '#000000'; g.fillRect(mx - 3, my - 3, 6, 6);
      g.fillStyle = '#ff2f5e'; g.fillRect(mx - 2, my - 2, 4, 4);
      bosses.push({ x: mx, y: my });
    }
    // The waypoint: a gold frame round its icon.
    let wpMark = null;
    if (state.waypoint) {
      const [mx, my] = at(state.waypoint.x, state.waypoint.y);
      const blink = Math.floor((state.time || 0) * 3) % 2 === 0;
      g.fillStyle = blink ? '#ffd75e' : '#a08030';
      g.fillRect(mx - 6, my - 6, 13, 1); g.fillRect(mx - 6, my + 6, 13, 1);
      g.fillRect(mx - 6, my - 6, 1, 13); g.fillRect(mx + 6, my - 6, 1, 13);
      wpMark = { x: mx, y: my };
    }
    // The player pip (a white cross so it reads over the icons).
    const [px, py] = at(state.player.x, state.player.y);
    g.fillStyle = '#000000'; g.fillRect(px - 3, py - 1, 7, 3); g.fillRect(px - 1, py - 3, 3, 7);
    g.fillStyle = '#ffffff'; g.fillRect(px - 2, py, 5, 1); g.fillRect(px, py - 2, 1, 5);
    // Header and footer lines, outside the map box.
    g.font = 'bold 8px monospace';
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.textAlign = 'right';
    g.fillStyle = '#c0c8d0';
    g.fillText(closed ? 'MAP: THE SITES ARE CLOSED' : 'MAP: TAP A SITE TO SET A WAYPOINT', ox + size, Math.max(1, oy - 11));
    g.textAlign = 'left';
    let clearBtn = null;
    if (state.waypoint) {
      const bw = 92, bh = 14;
      const bx = ox + size + 8, by = oy + size - bh;
      if (bx + bw <= C.VIEW_W - 2) {
        g.fillStyle = '#000000'; g.fillRect(bx, by, bw, bh);
        g.fillStyle = '#ffd75e'; g.fillRect(bx, by, bw, 1); g.fillRect(bx, by + bh - 1, bw, 1);
        g.fillRect(bx, by, 1, bh); g.fillRect(bx + bw - 1, by, 1, bh);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('CLEAR WAYPOINT', bx + bw / 2, by + bh / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'top';
        // The tap target is taller than the painted plate and centred on it.
        const hh = Math.max(bh, C.ATLAS.CLEAR_HIT_H);
        const hy = Math.max(0, Math.min(C.VIEW_H - hh, by + Math.round((bh - hh) / 2)));
        clearBtn = { x: bx, y: hy, w: bw, h: hh, plate: { x: bx, y: by, w: bw, h: bh } };
      }
    }
    // The key, down the left of the box.
    const keyRows = [['shrine', 'SHRINE'], ['altar', 'ALTAR'], ['fountain', 'FOUNTAIN'],
      ['statue', 'STATUE'], ['brazier', 'BRAZIER'], ['vault', 'VAULT'], ['lever', 'LEVER'], ['yard', 'YARD']];
    const kx = ox - 74;
    if (kx >= 2) {
      g.font = '7px monospace';
      keyRows.forEach(([k, label], i) => {
        const ky = oy + 4 + i * 12;
        drawMapIcon(g, k, kx + 3, ky + 3, 'unused');
        g.fillStyle = '#c0c8d0'; g.fillText(label, kx + 10, ky);
      });
      const ky = oy + 4 + keyRows.length * 12;
      drawMapIcon(g, 'shrine', kx + 3, ky + 3, 'unknown');
      g.fillStyle = '#c0c8d0'; g.fillText('SEEN', kx + 10, ky);
      drawMapIcon(g, 'shrine', kx + 3, ky + 15, 'spent');
      g.fillText('USED', kx + 10, ky + 12);
    }
    this.atlasMap = { x: ox, y: oy, size, cell: CELL, visited,
      landmarks: marks, player: { x: px, y: py }, bosses, waypoint: wpMark, clearBtn, poi: poiMarks };
  }

  // ---- HORDE WARNING (2026-09-17 review addendum; SCOPE-LIMITED same day) -----
  // The peripheral treatment the HERALD's banner (peripheral: true) renders
  // through — the repeated mid-combat warning the no-play-area-pixels rule
  // protects. Set-piece banners do NOT route here (owner correction).
  // warning never touches the play area (the region the player dodges through).
  // Channels, all outside the play area:
  //   (a) HUD STATE — an urgent strip in the top HUD band: dark plate, blood
  //       rules, gold text, the word HORDE. Sits between the left bar column
  //       and the right clock column (STRIP_SIDE keeps it clear of both).
  //   (b) EDGE CUE — a pulsing blood band along each screen edge the horde
  //       enters from (banner.edges, computed at spawn from the spawn angle).
  //       The SIDE carries "from where"; the pulse rate (2 Hz) is "how soon".
  //   (c) AUDIO — the BOSS_YELL sting main.js fires at every banner set.
  // Timing is main.js's (C.HUD.WARNING: ttl ends CLEAR_MARGIN before the
  // fastest spawn's estimated contact). Alpha eases OUT over the last 0.4s and
  // slams in at full — a warning, not a curtain. `this.bossBanner` carries the
  // painted geometry (peripheral: true) as the test seam.
  drawHordeWarning(g, state, b) {
    const WN = C.HUD.WARNING;
    const W = C.VIEW_W, H = C.VIEW_H;
    const alpha = Math.max(0, Math.min(1, b.ttl / 0.4));
    const age = (b.dur || WN.TTL_MAX) - b.ttl;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * age / WN.PULSE_S));
    // (a) the HUD-band strip: "HORDE: <name(s)>" (the announce toast already
    // carries the verb + flavor; the strip is the urgent state, not a lecture).
    const names = (b.names && b.names.length) ? b.names : (b.title ? [b.title] : []);
    const maxTextW = W - 2 * WN.STRIP_SIDE - 2 * 4;
    const widthOf = (txt, px) => {
      g.font = 'bold ' + px + 'px monospace';
      if (typeof g.measureText === 'function') {
        const m = g.measureText(txt);
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0) return m.width;
      }
      return txt.length * px * 0.6021;   // the stub-ctx fallback (feed's rule)
    };
    let txt = names.length ? 'HORDE: ' + names.join(' + ') : 'HORDE INCOMING';
    let px = WN.STRIP_PX_MAX;
    while (px > WN.STRIP_PX_MIN && widthOf(txt, px) > maxTextW) px--;
    while (txt.length > 1 && widthOf(txt, px) > maxTextW) txt = txt.slice(0, -1);
    const textW = widthOf(txt, px);
    const plateW = Math.min(Math.round(textW + 2 * 4), W - 2 * WN.STRIP_SIDE);
    const plateX = Math.round(W / 2 - plateW / 2);
    const plateY = WN.STRIP_Y, plateH = WN.STRIP_H;
    g.globalAlpha = alpha;
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(plateX, plateY, plateW, plateH);
    g.fillStyle = '#7a1028';                       // the blood rules, same language as the plate
    g.fillRect(plateX, plateY, plateW, 1);
    g.fillRect(plateX, plateY + plateH - 1, plateW, 1);
    g.font = 'bold ' + px + 'px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd75e';
    g.fillText(txt, W / 2, plateY + Math.round(plateH / 2));
    g.textAlign = 'left';
    g.textBaseline = 'top';
    // (b) the edge cue: blood band + a 1px hot rule at its inner boundary,
    // on every edge the horde enters from. Screen edges are not play area.
    const E = WN.EDGE_PX;
    g.globalAlpha = alpha * pulse;
    for (const edge of (b.edges || [])) {
      g.fillStyle = '#7a1028';
      if (edge === 'top') g.fillRect(0, 0, W, E);
      else if (edge === 'bottom') g.fillRect(0, H - E, W, E);
      else if (edge === 'left') g.fillRect(0, 0, E, H);
      else if (edge === 'right') g.fillRect(W - E, 0, E, H);
      g.fillStyle = '#ff2f5e';
      if (edge === 'top') g.fillRect(0, E, W, 1);
      else if (edge === 'bottom') g.fillRect(0, H - E - 1, W, 1);
      else if (edge === 'left') g.fillRect(E, 0, 1, H);
      else if (edge === 'right') g.fillRect(W - E - 1, 0, 1, H);
    }
    g.globalAlpha = 1;
    this.bossBanner = {
      name: b.title, sub: b.sub, peripheral: true, alpha,
      strip: { x: plateX, y: plateY, w: plateW, h: plateH, text: txt, px },
      edges: (b.edges || []).slice(),
    };
  }

  // ---- WAVE-14 boss-arrival overlay ------------------------------------------
  // state.bossBanner = { names:[...], verb, title, sub, ttl } (main.js sets it
  // at boss spawn / herald / finale start). OWNER CORRECTION 2026-09-17: the
  // no-play-area-pixels rule is SCOPE-LIMITED to the repeated mid-combat
  // HORDE WARNING (the herald — the banner main.js stamps `peripheral: true`
  // on). Set-piece announcements (boss cast, elite, finale, and the HELD
  // token / top-tier banners) keep their prominent cinematic centre plate.
  // `this.bossBanner` is the test seam (the exact values painted this frame;
  // null when no banner is live).
  drawBossBanner(g, state) {
    const b = state.bossBanner;
    if (!b || !(b.ttl > 0) || b.underSting) { this.bossBanner = null; return; }
    if (b.peripheral) return this.drawHordeWarning(g, state, b);
    const alpha = letterboxAlpha(state);
    const W = C.VIEW_W, H = C.VIEW_H;
    const bandH = LETTERBOX_BAND;
    g.globalAlpha = alpha;
    // Letterbox bands + a thin blood-red rule at each edge.
    g.fillStyle = '#08080f';
    g.fillRect(0, 0, W, bandH);
    g.fillRect(0, H - bandH, W, bandH);
    g.fillStyle = '#7a1028';
    g.fillRect(0, bandH, W, 1);
    g.fillRect(0, H - bandH - 1, W, 1);
    // Name + title + sub, centered.
    // WAVE-24 (#2): the title/sub sit at SCREEN CENTER — over live gameplay,
    // not on the letterbox bands — so their contrast used to depend on
    // whatever was behind them. A dark plate (plus a blood-red rule top and
    // bottom) makes the moment legible on every scene.
    //
    // TWO-LINE BANNER (owner-approved: "huge stylized name and big title
    // underneath"). Line 1..N is the NAME(S) — one boss per line, the largest
    // type on screen for this beat. The title line ('APPROACH' / 'APPROACHES')
    // sits under them, big but strictly smaller. The flavor sub keeps its old
    // job as the small print.
    //
    // FITTING (the actual fix for the clipped two-boss banner): every line is
    // sized from the REAL measureText of the exact font string it is painted
    // in. The old code painted one 49-char run-on line with no maxWidth and
    // sized its plate from a 0.6em estimate — wave 3 measured 649px in a 480px
    // view behind a 637px plate, bleeding off BOTH edges. Now each line takes
    // the largest integer px whose measured width fits BANNER_MAX_W, the plate
    // is built from the measured widest line, and the plate is clamped
    // BANNER_EDGE_MARGIN off each view edge — never edge to edge.
    const HUD = C.HUD;
    const padX = HUD.BANNER_PLATE_PAD_X, padY = HUD.BANNER_PLATE_PAD_Y;
    const gap = HUD.BANNER_LINE_GAP, edge = HUD.BANNER_EDGE_MARGIN;
    const maxTextW = W - 2 * edge - 2 * padX;
    // Measured monospace advance (px per em) — the FALLBACK only, for the stub
    // ctx in the headless tests, where measureText has no metrics to give.
    const ADV_FALLBACK = 0.6021;
    const widthOf = (txt, px, bold) => {
      g.font = (bold ? 'bold ' : '') + px + 'px monospace';   // measure in the font we paint in
      if (typeof g.measureText === 'function') {
        const m = g.measureText(txt);
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0) return m.width;
      }
      return txt.length * px * ADV_FALLBACK;
    };
    // Largest integer px in [lo,hi] whose measured width still fits the box.
    const fitPx = (txt, lo, hi, bold) => {
      let px = hi;
      while (px > lo && widthOf(txt, px, bold) > maxTextW) px--;
      return px;
    };
    // `txt` broken at word boundaries into lines no wider than the box.
    const wrapWords = (txt, px, bold) => {
      const out = [];
      let line = '';
      for (const word of String(txt).split(' ')) {
        const cand = line ? line + ' ' + word : word;
        if (line && widthOf(cand, px, bold) > maxTextW) { out.push(line); line = word; }
        else line = cand;
      }
      if (line) out.push(line);
      return out;
    };

    // Line 1..N: the boss names (one per line; see CONFIG for why not shared).
    const names = (b.names && b.names.length) ? b.names.slice() : (b.title ? [b.title] : []);
    const verb = b.verb || '';
    // N6 (audit 2026-09-16): the fit — every px size and the plate box — is a
    // PURE function of the banner's strings (plus view constants), but was
    // recomputed through the measureText ladder every frame of the banner's
    // life (0.15 ms/frame, 15.8 measureText calls/frame in real Chrome,
    // tools/verify_nits_n6.mjs). Cached per strings; a different banner
    // (new boss, new flavor) simply misses and refits. The paint itself is
    // untouched — same lines, same plate, same fonts.
    const fitKey = JSON.stringify([names, verb, b.sub || '']);
    let fit = (this._bannerFit && this._bannerFit.key === fitKey) ? this._bannerFit : null;
    if (!fit) {
      const longestName = names.reduce((a, s) => (s.length > a.length ? s : a), '');
      const namePx = fitPx(longestName, HUD.BANNER_NAME_MIN_PX, HUD.BANNER_NAME_MAX_PX, true);
      // Title line: a fixed fraction of the name size, still fitted + clamped.
      const verbMax = Math.max(HUD.BANNER_VERB_MIN_PX,
        Math.min(HUD.BANNER_VERB_MAX_PX, Math.round(namePx * HUD.BANNER_VERB_RATIO)));
      const verbPx = verb ? fitPx(verb, HUD.BANNER_VERB_MIN_PX, verbMax, true) : 0;
      // Flavor sub-line: the old 11px small print (never below 10 — the panel's
      // floor), fitted so a two-boss flavor pair cannot overrun either.
      // A sub that does not fit even at the floor WRAPS there. A first fusion's
      // or evolution's banner carries the weapon's whole description (up to
      // 129 characters, 709px at 10px in a 480px view) and it painted as one
      // line off both edges of the screen (Steve, 2026-10-03: "the fuse weapon
      // message is larger than the screen").
      const subPx = b.sub ? fitPx(b.sub, 10, HUD.BANNER_SUB_PX, false) : 0;
      const subLines = !b.sub ? []
        : widthOf(b.sub, subPx, false) <= maxTextW ? [b.sub] : wrapWords(b.sub, subPx, false);
      const lines = [];
      for (const s of names) lines.push({ txt: s, px: namePx, bold: true, ink: '#ffd75e', shade: '#3a2408' });
      if (verb) lines.push({ txt: verb, px: verbPx, bold: true, ink: '#ffd75e', shade: '#3a2408' });
      for (const s of subLines) lines.push({ txt: s, px: subPx, bold: false, ink: '#e4e4ee', shade: null, sub: true });
      for (const l of lines) l.h = Math.round(l.px * 1.16) + gap;   // line box
      // The plate is built from the MEASURED widest line, then clamped inside
      // the view edge — the two-boss case can no longer be underestimated.
      const widest = lines.reduce((m, l) => Math.max(m, widthOf(l.txt, l.px, l.bold)), 0);
      const plateW = Math.min(Math.round(widest + 2 * padX), W - 2 * edge);
      const bodyH = lines.reduce((a, l) => a + l.h, 0) - gap;
      const plateH = Math.round(bodyH + 2 * padY);
      fit = { key: fitKey, namePx, verbPx, subPx, lines, plateW, plateH };
      this._bannerFit = fit;
      this.bossBannerFits++;
    }
    const lines = fit.lines;
    if (!lines.length) {
      g.textAlign = 'left'; g.textBaseline = 'top'; g.globalAlpha = 1;
      this.bossBanner = { name: b.title, sub: b.sub, letterbox: true, alpha };
      return;
    }
    const plateW = fit.plateW;
    const plateX = Math.round(W / 2 - plateW / 2);
    const plateH = fit.plateH;
    const plateY = Math.round(H / 2 - plateH / 2);
    g.fillStyle = HUD.PLATE_SOLID;
    g.fillRect(plateX, plateY, plateW, plateH);
    g.fillStyle = '#7a1028';
    g.fillRect(plateX, plateY, plateW, 1);
    g.fillRect(plateX, plateY + plateH - 1, plateW, 1);
    bannerTrim(g, plateX, plateY, plateW, plateH);   // PORT SLICE I: plate keyline + studs
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let cy = plateY + padY;
    for (const l of lines) {
      const midY = Math.round(cy + l.h / 2);
      if (l.shade) {                       // 2px offset shade = the stylized cut
        g.font = 'bold ' + l.px + 'px monospace';
        g.fillStyle = l.shade;
        g.fillText(l.txt, W / 2 + 2, midY + 2);
      }
      g.font = (l.bold ? 'bold ' : '') + l.px + 'px monospace';
      g.fillStyle = l.ink;
      g.fillText(l.txt, W / 2, midY);
      cy += l.h;
    }
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.globalAlpha = 1;
    this.bossBanner = { name: b.title, sub: b.sub, letterbox: true, alpha };
  }

  // ---- FIRST-RUN PROLOGUE: the OK-banner card (owner 2026-09-18) -------------
  // Native 1x (never zoomed), top-centre under the HUD clock. Non-modal by
  // construction: nothing here gates update() — the pilot keeps walking while
  // it is up; only the OK rect consumes a tap (main.js hit-tests FIRST, so a
  // banner tap never arms the joystick). Fixed card geometry = a stable hit
  // region (prologueOkRect). The seam: this.prologueBanner carries the exact
  // { title, body, idx, total } painted this frame, or null.
  drawPrologueBanner(g, state) {
    this.prologueBanner = null;
    if (!state.prologue || state.prologue.drunk) return;
    if (state.mode === 'draft') return;   // the draft screen carries the sentence itself
    const idx = state.prologue.bannerIdx || 0;
    const B = state.prologue.banners ? state.prologue.banners[idx] : null;
    if (!B) return;
    // ADDENDUM (owner 2026-09-18: the pilot PAUSES for banners): the card is
    // up only after C.PROLOGUE.BANNER_WALK_S of walking since the last OK —
    // the SAME gate main.js's prologueBanner() reads, so the paint, the pause
    // and the action-advance can never disagree.
    if ((state.prologue.walkT || 0) < C.PROLOGUE.BANNER_WALK_S) return;
    const card = prologueCardRect();            // the ONE shared rect seam
    const W = card.w, x0 = card.x, y0 = card.y;
    const pad = 10;
    // Plate + border (the boss-banner plate idiom).
    g.fillStyle = 'rgba(8,8,15,0.92)';
    g.fillRect(x0, y0, W, PROLOGUE_CARD_H);
    g.fillStyle = '#3a3a56';
    g.fillRect(x0, y0, W, 1); g.fillRect(x0, y0 + PROLOGUE_CARD_H - 1, W, 1);
    g.fillRect(x0, y0, 1, PROLOGUE_CARD_H); g.fillRect(x0 + W - 1, y0, 1, PROLOGUE_CARD_H);
    // Counter, title, wrapped body.
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#6a6a86';
    g.font = '8px monospace';
    g.fillText((idx + 1) + '/' + (state.prologue.banners ? state.prologue.banners.length : '?'),
      x0 + W - pad - 20, y0 + 7);
    g.fillStyle = '#ffd75e';
    g.font = 'bold 11px monospace';
    g.fillText(B.title, x0 + pad, y0 + 7);
    g.fillStyle = '#e8e8f0';
    g.font = '9px monospace';
    const maxW = W - 2 * pad;
    const adv = 0.6021 * 9;   // the headless fallback advance (drawBossBanner idiom)
    let line = '', lines = [];
    for (const word of B.body.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (typeof g.measureText === 'function') {
        const m = g.measureText(cand);
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0 && m.width <= maxW) {
          line = cand; continue;
        }
        if (m && typeof m.width === 'number' && isFinite(m.width) && m.width > 0) {
          lines.push(line); line = word; continue;
        }
      }
      if (cand.length * adv <= maxW) { line = cand; } else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    lines = lines.slice(0, 2);
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x0 + pad, y0 + 24 + i * 11);
    // DEFECT (c) FIX: the card no longer carries an OK button — the CUE line
    // states the ACTION that advances it (main.js prologueActionDone feeds
    // the ledger; update() advances the banner the frame the action lands).
    // Accent colour, centred, the row OK used to own.
    g.textAlign = 'center';
    g.font = 'bold 9px monospace';
    g.fillStyle = '#7dffd0';
    g.fillText(B.cue || '', x0 + W / 2, y0 + PROLOGUE_CARD_H - 15);
    g.textAlign = 'left';
    this.prologueBanner = { title: B.title, body: B.body, idx,
      total: state.prologue.banners.length };
  }

  // ---- PROLOGUE: the ALWAYS-VISIBLE SKIP button (defect (a) fix) --------------
  // Painted for the WHOLE phase (walk, banner, wait) — the opt-out the owner
  // asked for, reachable at every moment. Rect = prologueSkipRect (ONE
  // geometry, the same numbers main.js hit-tests). Dimmer than the card: the
  // secondary action, never the loudest thing on screen.
  // TWO-TAP CONFIRM (owner 2026-09-18: skipping must be DELIBERATE): while
  // the arm window is live (state.prologue.skipArmT > 0 — main.js
  // prologueSkip opens it) the button BRIGHTENS and asks for the second
  // tap; the rect itself never moves or grows.
  drawPrologueSkip(g, state) {
    if (!state.prologue || state.prologue.drunk || state.prologue.skipped) return;
    const armed = (state.prologue.skipArmT || 0) > 0;
    const sk = prologueSkipRect();
    g.fillStyle = armed ? '#3a2a1a' : '#14141f';
    g.fillRect(sk.x, sk.y, sk.w, sk.h);
    g.fillStyle = armed ? '#d8a04a' : '#4a4a66';
    g.fillRect(sk.x, sk.y, sk.w, 1); g.fillRect(sk.x, sk.y + sk.h - 1, sk.w, 1);
    g.fillRect(sk.x, sk.y, 1, sk.h); g.fillRect(sk.x + sk.w - 1, sk.y, 1, sk.h);
    g.textAlign = 'center';
    g.font = '9px monospace';
    g.fillStyle = armed ? '#ffd75e' : '#c8c8dd';
    g.fillText(armed ? 'TAP AGAIN?' : 'SKIP TUTORIAL', sk.x + sk.w / 2, sk.y + 5);
    g.textAlign = 'left';
  }

  // ---- WAVE-27: the DOCTRINE canvas readout is REMOVED ------------------------
  // WAVE-24 (#4) painted a live "FOCUS <x>" / "STANCE <x> · <TAG> · <ACT>" block
  // here because the levers were otherwise invisible. The owner ruled it
  // redundant: the overlay buttons' badges carry the same state (and the
  // stance CYCLE toast names the tag + the multipliers that actually differ).
  // The canvas is the play field again — no doctrine paint, no chrome seam
  // fields, and no DOM-badge bridge. The published source of truth stays
  // state.focus / state.stance / state.stanceAct (main.js syncChrome); the
  // badge writer (main.js updateTouchHud) reads exactly those.

  // ---- WAVE-26 EARNED MOMENT flourish ---------------------------------------
  // Fires ONLY on a weapon EVOLUTION or a BOSS KILL (main.js
  // triggerEarnedMoment) — the two moments Sk408's game-feel law reserves
  // slow-mo and screen juice for. Pure integer-pixel drawing: fillRect only,
  // no filters, no gradients, no blur, nothing that softens the art.
  //
  //   t=0  hard pixel vignette pulled in from every edge + a 1px chromatic
  //        fringe (red top / blue bottom) + a white cross core flash
  //   t->1 a 12-spoke crackle burst flies outward, the vignette and fringe
  //        recede, and everything fades to nothing
  //
  // `this.moment` is the honest test seam: the exact values painted this
  // frame, or null when nothing was live.
  drawMoment(g, state) {
    const m = state.moment;
    this.moment = null;
    if (!m || !(m.ttl > 0)) return;
    const W = C.VIEW_W, Hh = C.VIEW_H;
    const t = Math.max(0, Math.min(1, m.age / m.ttl));
    const hot = m.kind === 'evolution' ? '#7ad0ff'
      : m.kind === 'finale' ? '#ffd75e' : '#ff8848';
    const fade = 1 - t;
    // Same world -> device projection the world layer uses (the canonical
    // state.zoomScale; see the zoom block above), so the flare lands exactly
    // on the evolved hero / dead boss at any zoom.
    const zs = state.zoomScale;
    const Z = (typeof zs === 'number' && Number.isFinite(zs) && zs >= 1) ? Math.round(zs) : 1;
    const cam = state.cam || { x: 0, y: 0 };
    const cx = Math.round(W / 2 + (m.x - cam.x - W / 2) * Z);
    const cy = Math.round(Hh / 2 + (m.y - cam.y - Hh / 2) * Z);

    // 1. VIGNETTE PULSE — 2px steps from the rim inward, receding with t.
    const band = Math.round(fade * 22) & ~1;
    if (band > 0) {
      g.globalAlpha = 0.5 * fade;
      g.fillStyle = '#05050a';
      for (let i = 0; i < band; i += 2) {
        g.fillRect(i, 0, 2, Hh);
        g.fillRect(W - 2 - i, 0, 2, Hh);
        g.fillRect(0, i, W, 2);
        g.fillRect(0, Hh - 2 - i, W, 2);
      }
    }
    // 2. CHROMATIC FRINGE — one hard red row and one hard blue row on the
    //    frame edge: a pulse, not a blur.
    g.globalAlpha = 0.55 * fade;
    g.fillStyle = '#ff2f5e';
    g.fillRect(0, 0, W, 1);
    g.fillStyle = '#3c6bff';
    g.fillRect(0, Hh - 1, W, 1);

    // 3. CRACKLE BURST — 12 spokes of 3x3 blocks flying outward, each with a
    //    trailing pixel, alternating white / hot tint.
    const r = Math.round(t * 92);
    g.globalAlpha = fade;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sx = Math.round(cx + Math.cos(a) * r);
      const sy = Math.round(cy + Math.sin(a) * r);
      g.fillStyle = (i % 2 === 0) ? '#ffffff' : hot;
      g.fillRect(sx - 1, sy - 1, 3, 3);
      const tr = Math.max(0, r - 8);
      g.fillRect(Math.round(cx + Math.cos(a) * tr), Math.round(cy + Math.sin(a) * tr), 2, 2);
    }

    // 4. CORE FLASH — a white cross that collapses as the burst expands.
    const cs = Math.max(2, Math.round(fade * 14));
    g.globalAlpha = Math.max(0, 1 - t * 1.5);
    g.fillStyle = '#ffffff';
    g.fillRect(cx - cs, cy - 1, cs * 2, 3);
    g.fillRect(cx - 1, cy - cs, 3, cs * 2);
    g.globalAlpha = 1;

    this.moment = { kind: m.kind, t, hot, cx, cy, spokeR: r, band };
  }

  // ---- WAVE-12 HUD chrome (fillRect pixel grids only) -------------------------
  // The text #hud div is now opt-in (settings toggle, default off) — this is
  // the always-on visual readout. `this.hudChrome` is the honest test seam:
  // the exact values the bars/icons painted this frame (smoke asserts on it).
  drawHudChrome(g, state) {
    const p = state.player;
    if (!p || !p.stats) { this.hudChrome = null; return; }
    const t = state.time || 0;
    // integ3: on a light floor (Bone Desert, the snow, the meadow) the see-through
    // plate left grey and blue text under 4.5 to 1: the HUD's plates go darker there.
    const PLATE = this.groundLight ? C.HUD.PLATE_ON_LIGHT : C.HUD.PLATE;
    const chrome = { hpFrac: 0, hpFlashFrac: 0, manaFrac: 0, weaponIcons: [], itemIcons: [], weather: null, auto: null, rule: null };
    // PROLOGUE HUD CLEARANCE (2026-09-18): while the first-run prologue phase
    // is live (up to the drink) the banner card owns the top band — every
    // readout that CANNOT change during the phase AND overlaps the card band
    // (HP/MP labels+bars, the hp/mp value plate, XP bar + LV badge + xpText)
    // is suppressed rather than painted under the card, and the feed drops to
    // PROLOGUE_FEED_Y. The purse (x 6..~66) never reaches the card (x 90+) and
    // KEEPS painting. The seam flags it so tests can pin "hidden, not
    // overlapped"; run #2+ (no prologue) is byte-identical to before.
    const prologueLive = !!(state.prologue && !state.prologue.drunk);
    if (prologueLive) chrome.prologueHud = true;

    // --- graphic HP + mana bars, top-left (below the boss-bar zone) ---
    // Damage flash: when hp DROPS, the lost segment stays white for ~0.45s
    // (a heal never flashes). Heals just move the fill up silently.
    const maxHp = p.stats.maxHp;
    const hp = Math.max(0, Math.min(p.hp, maxHp));
    if (this._hpPrev === undefined || hp >= this._hpPrev) this._hpPrev = hp;
    if (hp < this._hpPrev - 0.01) {
      this._hpFlashFrom = Math.min(1, this._hpPrev / maxHp);
      this._hpFlashUntil = t + 0.45;
    }
    this._hpPrev = hp;
    const hpFrac = Math.max(0, Math.min(1, hp / maxHp));
    const flashFrac = (this._hpFlashUntil > t && this._hpFlashFrom > hpFrac)
      ? this._hpFlashFrom : 0;
    const manaFrac = Math.max(0, Math.min(1, p.mana / p.stats.maxMana));
    chrome.hpFrac = hpFrac;
    chrome.hpFlashFrac = flashFrac;
    chrome.manaFrac = manaFrac;

    // WAVE-24 (#2): every canvas label sits on a dark plate so its contrast
    // never depends on the terrain under the HUD. Returns the plate width.
    const H = C.HUD;
    const label = (txt, x, y, col, size) => {
      g.font = 'bold ' + size + 'px monospace';
      g.textBaseline = 'top';
      const w = txt.length * Math.round(size * 0.62) + 4;
      g.fillStyle = PLATE;
      g.fillRect(x - 2, y - 2, w, size + 5);
      g.fillStyle = col;
      g.fillText(txt, x, y);
      trimPlate(g, x - 2, y - 2, w, size + 5);   // PORT SLICE I: plate corner studs
      return w;
    };
    // A bar: steel frame, dark trough (empty reads as empty on every theme),
    // ticks over the whole track, the fill, and a white damage-flash segment.
    const drawBar = (x, y, w, h, frac, flash, fillCol) => {
      g.fillStyle = H.FRAME;
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      g.fillStyle = '#000000';
      g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = H.TROUGH;
      g.fillRect(x, y, w, h);
      g.fillStyle = H.TICK;
      for (let sx = x + 6; sx < x + w; sx += 8) g.fillRect(sx, y, 1, h);
      const fw = Math.round(w * frac);
      g.fillStyle = fillCol;
      g.fillRect(x, y, fw, h);
      g.fillStyle = 'rgba(255,255,255,0.30)';
      g.fillRect(x, y, fw, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let sx = x + 5; sx < x + fw; sx += 6) g.fillRect(sx, y + 1, 1, h - 1);
      if (flash > frac) {
        g.fillStyle = '#ffffff';
        g.fillRect(x + fw, y, Math.round(w * flash) - fw, h);
      }
      trimBar(g, x, y, w, h);   // PORT SLICE I: chamfered housing corners + studs
    };
    // Measured text width when the context can (the browser), the monospace
    // estimate otherwise (the headless stubs have no measureText, so the
    // painted geometry stays assertable in tests).
    const textW = (s, px) => {
      if (typeof g.measureText === 'function') {
        const m = g.measureText(s);
        if (m && isFinite(m.width) && m.width > 0) return m.width;
      }
      return s.length * Math.round(px * 0.62);
    };

    // --- R3 ONE VITALS BLOCK ---------------------------------------------------
    // HP, MP and XP as three short bars on ONE dark plate, the level as a gold
    // badge at the plate's left, and each bar's numbers in one column at its
    // right. It replaces the labelled rows, the two value plates and the LV
    // badge that used to spread over the corner (REVIEW_2026-11, R3 row 4).
    // On desktop, once the key strip has gone (state.readyRow), a fourth line
    // carries what the strip showed live: skill ready and potions left.
    const xpFrac = p.xpNext > 0 ? Math.max(0, Math.min(1, p.xp / p.xpNext)) : 0;
    chrome.xpFrac = p.xpNext > 0 ? p.xp / p.xpNext : 0;
    chrome.level = p.level || 1;
    // While the boss-arrival letterbox is in, the block steps down under it.
    const lbDrop = letterboxHudDrop(state);
    if (lbDrop) chrome.letterboxDrop = lbDrop;
    const VX = 4, VY = 10 + lbDrop;
    const valPx = H.LABEL_PX;
    const lvNum = String(p.level || 1);
    const lvW = Math.max(20, lvNum.length * Math.round(H.LV_PX * 0.62) + 6);
    const lbX = VX + lvW + 5;              // the HP / MP / XP letters
    const barX = lbX + 14, barW = 84;
    const valX = barX + barW + 5;
    const rowY = [VY + 4, VY + 14, VY + 24];   // bar tops: HP, MP, XP
    const hpTxt = Math.max(0, Math.floor(hp)) + '/' + Math.ceil(maxHp);
    const mpTxt = Math.max(0, Math.floor(p.mana)) + '/' + Math.ceil(p.stats.maxMana);
    const xpTxt = p.xpNext > 0 ? Math.max(0, Math.floor(p.xp)) + '/' + Math.floor(p.xpNext) : 'MAX';
    g.font = 'bold ' + valPx + 'px monospace';
    g.textBaseline = 'top';
    let valW = Math.ceil(Math.max(textW(hpTxt, valPx), textW(mpTxt, valPx), textW(xpTxt, valPx)));
    // The numbers never reach the rule plate's band: past VITALS_MAX_RIGHT
    // they are left out (a bar without numbers beats an overlap).
    const showVals = valX + valW + 3 <= VITALS_MAX_RIGHT;
    if (!showVals) valW = 0;
    const ready = typeof state.readyRow === 'string' && state.readyRow ? state.readyRow : '';
    const vH = ready ? 44 : 33;
    const vW = (showVals ? valX + valW + 3 : barX + barW + 4) - VX;
    if (!prologueLive) {                    // inert during the prologue: hidden, not overlapped
      g.fillStyle = PLATE;                // the one plate
      g.fillRect(VX, VY, vW, vH);
      trimPlate(g, VX, VY, vW, vH);
      // The level badge: gold border, dark inset, LV over the number.
      const lvX = VX + 2, lvY = VY + 2, lvH = 29;
      g.fillStyle = '#ffd75e';
      g.fillRect(lvX, lvY, lvW, lvH);
      g.fillStyle = 'rgba(10,9,6,0.90)';
      g.fillRect(lvX + 1, lvY + 1, lvW - 2, lvH - 2);
      g.textAlign = 'center';
      g.font = 'bold 7px monospace';
      g.fillStyle = '#c8a040';
      g.fillText('LV', lvX + lvW / 2, lvY + 3);
      g.font = 'bold ' + H.LV_PX + 'px monospace';
      g.fillStyle = '#fff3c4';
      g.fillText(lvNum, lvX + lvW / 2, lvY + 13);
      g.textAlign = 'left';
      trimBadge(g, lvX, lvY, lvW, lvH);
      g.font = 'bold ' + valPx + 'px monospace';
      const rows = [['HP', H.HP, hpTxt], ['MP', H.MP, mpTxt], ['XP', H.XP, xpTxt]];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = rows[i][1];
        g.fillText(rows[i][0], lbX, rowY[i] - 2);
        if (showVals) g.fillText(rows[i][2], valX, rowY[i] - 2);
      }
      drawBar(barX, rowY[0], barW, 5, hpFrac, flashFrac, '#ff5566');
      drawBar(barX, rowY[1], barW, 5, manaFrac, 0, '#4a8cff');
      // XP: one px taller, with 25/50/75% majors and a gold goal tick at the
      // end, so an empty bar still reads as a scaled bar (WAVE-23/24).
      drawBar(barX, rowY[2], barW, 6, xpFrac, 0, '#ffd75e');
      g.fillStyle = H.TICK_MAJOR;
      for (let q = 1; q <= 3; q++) g.fillRect(barX + Math.round(barW * q / 4), rowY[2], 1, 6);
      g.fillStyle = '#ffd75e';
      g.fillRect(barX + barW - 1, rowY[2], 1, 6);
      if (ready) {
        g.font = 'bold 8px monospace';
        g.fillStyle = '#b8b8cc';
        g.fillText(ready, lbX, VY + 33);
      }
      if (showVals) { chrome.hpText = hpTxt; chrome.mpText = mpTxt; if (p.xpNext > 0) chrome.xpText = xpTxt; }
      chrome.lvBadge = { x: lvX, y: lvY, w: lvW, h: lvH, text: 'LV ' + lvNum };
      if (ready) chrome.readyRow = ready;
    }
    // The vitals block's box (world cards keep off it; tests read it).
    chrome.bars = prologueLive ? null : { x: VX, y: VY, w: vW, h: vH };
    chrome.vitals = chrome.bars;

    // --- RUN CLOCK (top right) --------------------------------------------------
    // The 30:00 limit is the run's core structure: the clock on a dark plate,
    // a thin limit bar under it with a red tick at the end, warm once the
    // FINAL_CALL_AT callout lands. Reads state.time through runClock(), the
    // same clock the win condition uses.
    const clockTxt = runClock(t);
    const clockPx = H.CLOCK_PX;
    const cw = clockTxt.length * Math.round(clockPx * 0.62) + 4;
    const cx = C.VIEW_W - 24 + 2 - cw;
    const finalCall = t >= C.RUN.FINAL_CALL_AT;
    // state.clockInset: view px the clock steps down so it clears the DOM
    // button row where that row overlays the canvas (0 when it does not).
    // The boss-arrival letterbox steps it down the same way (lbDrop).
    const clockY = 13 + Math.max(lbDrop, Math.min(C.VIEW_H / 3, Math.round(state.clockInset || 0)));
    label(clockTxt, cx, clockY, finalCall ? '#ff9c6a' : '#cfe8ff', clockPx);
    const cbX = cx - 2, cbY = clockY + clockPx + 4, cbW = cw, cbH = 4;
    const limitFrac = Math.max(0, Math.min(1, t / C.RUN.LIMIT));
    g.fillStyle = H.FRAME;
    g.fillRect(cbX - 2, cbY - 2, cbW + 4, cbH + 4);
    g.fillStyle = '#000000';
    g.fillRect(cbX - 1, cbY - 1, cbW + 2, cbH + 2);
    g.fillStyle = H.TROUGH;
    g.fillRect(cbX, cbY, cbW, cbH);
    g.fillStyle = '#4a8cff';
    g.fillRect(cbX, cbY, Math.round(cbW * limitFrac), cbH);
    g.fillStyle = 'rgba(255,255,255,0.30)';
    g.fillRect(cbX, cbY, Math.round(cbW * limitFrac), 1);
    g.fillStyle = '#ff2f5e';                       // the limit tick (30:00)
    g.fillRect(cbX + cbW - 1, cbY, 1, cbH);
    trimBar(g, cbX, cbY, cbW, cbH);
    chrome.clock = { text: clockTxt, frac: limitFrac, finalCall, x: cx - 2, y: clockY, w: cw + 2, h: clockPx + 10 };

    // --- R3 GOLD BY THE CLOCK -------------------------------------------------
    // The live in-run purse (state.runPurse, published by syncChrome) as a gold
    // coin and a fixed 5-character field (fmtGold), on the clock's row just
    // left of it. H1 NO-REFLOW: a 1-gold and a 750k purse paint the same box.
    // Inert during the prologue (nothing can be earned while the world is
    // frozen) and hidden then, like the vitals: the banner card crosses it.
    const purseVal = state.runPurse | 0;
    const goldDigits = fmtGold(purseVal);
    const goldPx = H.CLOCK_PX;
    const coinW = 9;
    const digitW = 5 * Math.round(goldPx * 0.62);
    const goldW = coinW + digitW + 8;
    const goldH = goldPx + 4;
    const goldX = cx - 2 - 5 - goldW, goldY = clockY - 2;
    if (!prologueLive) {
      g.fillStyle = '#ffd75e';                     // gold badge border
      g.fillRect(goldX, goldY, goldW, goldH);
      g.fillStyle = 'rgba(10,9,6,0.90)';           // dark inset plate
      g.fillRect(goldX + 1, goldY + 1, goldW - 2, goldH - 2);
      // The coin: a 7px gold disc with a dark rim and a bright glint.
      const ccx = goldX + 3, ccy = goldY + Math.round((goldH - 7) / 2);
      g.fillStyle = '#7a5a10';
      g.fillRect(ccx + 1, ccy, 5, 7); g.fillRect(ccx, ccy + 1, 7, 5);
      g.fillStyle = '#ffd75e';
      g.fillRect(ccx + 1, ccy + 1, 5, 5);
      g.fillStyle = '#fff3c4';
      g.fillRect(ccx + 2, ccy + 2, 1, 2);
      g.font = 'bold ' + goldPx + 'px monospace';
      g.textBaseline = 'top';
      g.fillStyle = '#fff3c4';
      g.fillText(goldDigits, goldX + coinW + 4, goldY + 2);
      trimBadge(g, goldX, goldY, goldW, goldH);
    }
    chrome.purse = prologueLive ? null : { x: goldX, y: goldY, w: goldW, h: goldH, px: goldPx,
      value: purseVal, text: 'GOLD ' + goldDigits, digitW };

    // --- AUTO-CONTINUE BADGE ------------------------------------------------
    // A run started by auto-continue says what it banks for the whole run
    // (main.js autoCutPct, decision 8), under the clock's limit bar.
    if (state.autoStarted) {
      const nPx = 9;
      const nName = 'AUTO ' + (100 - (state.devNightRun ? 0 : (state.autoCutPct || 0))) + '%';
      const nW = nName.length * Math.round(nPx * 0.62) + 6;
      const nH = nPx + 4;
      const nX = C.VIEW_W - 24 + 2 - nW;
      const nY = cbY + cbH + 8;
      g.fillStyle = '#8fb8ff';
      g.fillRect(nX, nY, nW, nH);
      g.fillStyle = 'rgba(10,9,6,0.90)';
      g.fillRect(nX + 1, nY + 1, nW - 2, nH - 2);
      g.font = 'bold ' + nPx + 'px monospace';
      g.textBaseline = 'top';
      g.fillStyle = '#dbe9ff';
      g.fillText(nName, nX + 3, nY + 2);
      trimBadge(g, nX, nY, nW, nH);
      chrome.auto = { name: nName, x: nX, y: nY, w: nW, h: nH };
    }
    // --- BOSS RULE PLATE ------------------------------------------------------
    // While a boss rule is live its line sits under the boss bar, on the row
    // below the gold (the longest rule line is about 200 px, wider than the
    // gap between the vitals block and the gold), centred in the band between
    // the vitals block (left) and the clock column (right). It is never behind
    // a tap: a live rule always shows.
    {
      const rule = state.bossRule;
      if (rule && rule.live && !rule.broken) {
        const rPx = 8;
        const txt = String(rule.text).toUpperCase();
        const rW = txt.length * Math.round(rPx * 0.62) + 8;
        const rH = rPx + 4;
        // Right of the vitals block (and of the MANUAL badge main.js paints
        // beside it), left of the gold.
        const lo = VX + vW + (state.pilotMode === 'MANUAL' ? 17 : 0) + 3, hi = cx - 2 - 5;
        const rX = Math.round(Math.max(lo, Math.min(hi - rW, (lo + hi) / 2 - rW / 2)));
        const rY = goldY + goldH + 2;   // ends where the quest chip starts
        g.fillStyle = '#c0304a';                       // blood-red border
        g.fillRect(rX, rY, rW, rH);
        g.fillStyle = 'rgba(10,9,6,0.90)';
        g.fillRect(rX + 1, rY + 1, rW - 2, rH - 2);
        g.font = 'bold ' + rPx + 'px monospace';
        g.textBaseline = 'top';
        g.textAlign = 'left';
        g.fillStyle = '#ffe9a8';
        g.fillText(txt, rX + 4, rY + 2);
        chrome.rule = { id: rule.id, text: txt, x: rX, y: rY, w: rW, h: rH };
      }
    }
    // --- R3 QUEST CHIP ----------------------------------------------------------
    // The quests as one small chip under the clock column ("QUESTS 1/3"). A
    // tap or click on it, or the J key, opens the full tracker under it
    // (state.questsOpen). A quest done lights the chip green for a moment
    // (the message lane names it). The guided tutorial keeps it down until
    // the handover.
    {
      const badges = state.autoStarted ? 17 : 0;
      const top = cbY + cbH + 8 + badges;
      chrome.questChip = null;
      chrome.quests = null;
      const qs = state.quests;
      if (!state.questsHidden && qs && qs.length) {
        const done = qs.filter(q => q.done).length;
        const txt = 'QUESTS ' + done + '/' + qs.length + (state.questsOpen ? ' ▴' : ' ▾');
        g.font = 'bold 7px monospace';
        g.textBaseline = 'top';
        const qw = Math.ceil(textW(txt, 7)) + 8, qh = 11;
        const qx = C.VIEW_W - 22 - qw;
        const fresh = state.questFlashUntil > t;
        g.fillStyle = fresh ? '#8fe0a0' : '#5a5a72';   // border
        g.fillRect(qx, top, qw, qh);
        g.fillStyle = 'rgba(8,10,14,0.88)';
        g.fillRect(qx + 1, top + 1, qw - 2, qh - 2);
        g.fillStyle = fresh ? '#8fe0a0' : done === qs.length ? '#8fe0a0' : '#e8e8f0';
        g.textAlign = 'left';
        g.fillText(txt, qx + 4, top + 2);
        chrome.questChip = { x: qx, y: top, w: qw, h: qh, done, total: qs.length, open: !!state.questsOpen, text: txt };
        let box = { x: qx, y: top, w: qw, h: qh };
        if (state.questsOpen) {
          const tr = drawQuestTracker(g, state, C.VIEW_W - 22, top + qh + 2);
          if (tr) {
            chrome.questTracker = tr;
            const x0 = Math.min(box.x, tr.x), x1 = Math.max(box.x + box.w, tr.x + tr.w);
            box = { x: x0, y: top, w: x1 - x0, h: tr.y + tr.h - top };
          }
        }
        chrome.quests = box;
      }
    }

    // --- R3 MESSAGE LANE: at most 2 lines under the vitals block ---------------
    // The toast() stream in main.js is the one feed (finds tinted by rarity,
    // potions, level-ups, wave and stage lines, quests, the portal). The lane
    // paints at most LANE_LINES lines; message_lane.js picks them so a portal,
    // boss or quest line is never pushed out by a lesser one. Lines wrap to the
    // lane's width (a word wider than the box is hard-split), and fade over
    // their final second (alpha = ttl clamped to 1).
    g.font = H.FEED_PX + 'px monospace';
    g.textBaseline = 'top';
    chrome.feed = [];
    const FEED_LINE_H = 10;
    const FEED_MAX_W = C.VIEW_W - 14;       // plate starts at x=5; 7px of air right
    const feedTextW = (s) => textW(s, 9.7);
    const wrapFeed = (msg) => {
      const out = [];
      let line = '';
      for (const word of String(msg).split(' ')) {
        const cand = line ? line + ' ' + word : word;
        if (feedTextW(cand) <= FEED_MAX_W) { line = cand; continue; }
        if (line) { out.push(line); line = ''; }
        let rest = word;
        while (feedTextW(rest) > FEED_MAX_W) {   // a word wider than the box
          let n = 1;
          while (n < rest.length && feedTextW(rest.slice(0, n + 1)) <= FEED_MAX_W) n++;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      if (line) out.push(line);
      return out.length ? out : [''];
    };
    // PROLOGUE HUD CLEARANCE: while the phase is live the lane starts below
    // the banner card instead of under the vitals block.
    let fy = prologueLive ? PROLOGUE_FEED_Y : VY + vH + 6;
    chrome.lane = { x: 5, y: fy - 2, lines: 0 };
    for (const { entry: ft, lines } of laneLines(state.toasts || [], wrapFeed)) {
      const alpha = Math.max(0, Math.min(1, ft.ttl || 0));
      let widest = 0;
      for (const ln of lines) widest = Math.max(widest, feedTextW(ln));
      const fw = Math.ceil(widest) + 4;
      g.globalAlpha = alpha;
      g.fillStyle = PLATE;              // readability plate, sized to the lines
      g.fillRect(5, fy - 2, fw, lines.length * FEED_LINE_H + 1);
      g.fillStyle = ft.tint || '#e4e4ee';
      for (let li = 0; li < lines.length; li++) g.fillText(lines[li], 7, fy + li * FEED_LINE_H);
      g.globalAlpha = 1;
      // The studs sit 1px INSIDE the plate: test_feedback_098 identifies feed
      // plates by their x===5 column, so no trim pixel may land on it.
      studCorners(g, 6, fy - 1, fw - 2, lines.length * FEED_LINE_H - 1);   // PORT SLICE I
      chrome.feed.push({ msg: ft.msg, tint: ft.tint || null, alpha, lines: lines.slice(), rank: ft.rank || 0 });
      chrome.lane.lines += lines.length;
      chrome.lane.w = Math.max(chrome.lane.w || 0, fw);
      fy += lines.length * FEED_LINE_H;
    }
    chrome.lane.h = chrome.lane.lines * FEED_LINE_H + 1;

    // --- equipment icon row (above the weapon row, same bottom-left corner).
    // 4x4 rarity-tinted gem per equipped rare item — OR the item's authored
    // 8x8 portrait (TIER-2 named finds) in its own palette. A portrait keeps
    // the rarity read on its 1px frame (the feed tint's own inks); items
    // without art take the generic path byte-identically (same cells, same
    // 8px step). chrome.itemIcons still records one { rarity } per item.
    let ix = 6;
    const iy = C.VIEW_H - 44;
    for (const it of state.items) {
      const col = RARITY_COLORS[it.rarity] || RARITY_COLORS.COMMON;
      const portrait = itemIconFor(it);
      if (portrait) {
        g.fillStyle = 'rgba(0,0,0,0.5)';               // 1px shadow border
        g.fillRect(ix - 1, iy - 5, 10, 1); g.fillRect(ix - 1, iy + 4, 10, 1);
        g.fillRect(ix - 1, iy - 5, 1, 10); g.fillRect(ix + 8, iy - 5, 1, 10);
        g.fillStyle = col;                             // rarity frame corners
        g.fillRect(ix - 1, iy - 5, 1, 1); g.fillRect(ix + 8, iy - 5, 1, 1);
        g.fillRect(ix - 1, iy + 4, 1, 1); g.fillRect(ix + 8, iy + 4, 1, 1);
        paintItemIcon(blitPlain, g, portrait, ix, iy - 4, 1);
        chrome.itemIcons.push({ rarity: it.rarity });
        ix += 12;
        continue;
      }
      for (let ry = 0; ry < ITEM_ICON_GRID.length; ry++) {
        for (let rx = 0; rx < ITEM_ICON_GRID[ry].length; rx++) {
          if (ITEM_ICON_GRID[ry][rx]) {
            g.fillStyle = col;
            g.fillRect(ix + rx, iy + ry, 1, 1);
          }
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';               // 1px shadow border
      g.fillRect(ix - 1, iy - 1, 6, 1); g.fillRect(ix - 1, iy + 4, 6, 1);
      g.fillRect(ix - 1, iy - 1, 1, 6); g.fillRect(ix + 4, iy - 1, 1, 6);
      chrome.itemIcons.push({ rarity: it.rarity });
      ix += 8;
    }

    // --- weapon icon row, bottom-left (above the touch pads on mobile).
    // 5x5 grid at 2x + a small lv number; evolved weapons get a gold border.
    const Z = 2;
    let wx = 6;
    const wy = C.VIEW_H - 30;
    g.font = '9px monospace';               // WAVE-23 (#4): 8 -> 9px
    g.textBaseline = 'top';
    for (const w of state.weapons) {
      const grid = WEAPON_ICONS[w.type] || WEAPON_ICONS.VOLLEY;
      const wfus = w.fusionId ? fusionDef(w.fusionId) : null;
      g.fillStyle = wfus ? wfus.tint[1] : w.evolution ? '#ffd75e' : '#2a2a36';   // slot frame
      g.fillRect(wx - 1, wy - 1, 5 * Z + 2, 5 * Z + 2);
      studCorners(g, wx - 1, wy - 1, 5 * Z + 2, 5 * Z + 2);   // PORT SLICE I: slot studs
      if (wfus) {
        // A fused weapon shows its fusion's emblem on a dark plate.
        g.fillStyle = '#14141c';
        g.fillRect(wx, wy, 5 * Z, 5 * Z);
        paintFusionMark(g, wfus, wx, wy, Z);
      }
      for (let ry = 0; !wfus && ry < grid.length; ry++) {
        for (let rx = 0; rx < grid[ry].length; rx++) {
          const v = grid[ry][rx];
          if (v) {
            g.fillStyle = WEAPON_ICON_PALETTE[v];
            g.fillRect(wx + rx * Z, wy + ry * Z, Z, Z);
          }
        }
      }
      // WAVE-24 (#2): the level number rides its own dark plate — it used to
      // sit on bare terrain.
      g.fillStyle = PLATE;
      g.fillRect(wx - 1, wy + 5 * Z + 1, 10, 12);
      g.fillStyle = '#e8e8f0';                       // lv badge
      g.fillText(String(w.level || 1), wx + 1, wy + 5 * Z + 2);
      // WAVE-18 (#2): per-weapon progress — a thin gold underline inside the
      // slot frame bottom showing progress to the weapon's NEXT level
      // (weapons.js weaponXpNeeded), solid gold at the level cap.
      const maxed = (w.level || 1) >= WEAPON_MAX_LEVEL;
      const wxpFrac = maxed ? 1
        : Math.max(0, Math.min(1, (w.xp || 0) / weaponXpNeeded(w.level || 1)));
      const uw = 5 * Z;                              // 10px — the icon width
      g.fillStyle = '#1a1a22';                       // track inside the frame
      g.fillRect(wx, wy + 5 * Z, uw, 1);
      if (wxpFrac > 0) {
        g.fillStyle = '#ffd75e';
        g.fillRect(wx, wy + 5 * Z, Math.round(uw * wxpFrac), 1);
      }
      chrome.weaponIcons.push({ type: w.type, level: w.level || 1, evolved: !!w.evolution, xpFrac: wxpFrac, maxed });
      wx += 5 * Z + 10;
    }

    // --- the hand plate, above the item row: the best hand among the cards
    // drafted this run and what it pays. While a new hand counts up
    // (state.handFx) the damage share climbs and the line is gold.
    // R5 THE HAND FAN: the cards that make the hand are drawn as small card
    // faces (hand_fan.js), with the hand's name and its bonus beside them.
    // The fan is a cached raster at whole device pixels per card pixel,
    // rebuilt only when its cards or the screen's pixel size change.
    const pl = state.player;
    const hand = pl && pl.hand;
    let hy = C.VIEW_H - 58;                 // the joker row sits above this
    chrome.hand = null;
    const fan = fanCards(pl);
    if (fan.cards.length) {
      const fx = hand ? state.handFx : null;
      const kc = fx ? Math.min(1, fx.t / fx.dur) : 1;
      const counting = !!fx && kc < 1;
      const bonus = hand ? describeHandBonus(hand, hand.scale, fx ? fx.from + (fx.to - fx.from) * kc : null) : '';
      // Fan geometry. One card pixel is the whole number of device pixels
      // nearest one HUD pixel (1 in the headless harness).
      const vsx = (this.viewScale && this.viewScale.sx) || 1;
      const vsy = (this.viewScale && this.viewScale.sy) || vsx;
      // integ3: on a phone held upright the view shows below 1:1, and a card
      // pixel of round(vsx) device pixels left the ranks about 4 CSS px tall.
      // There a card pixel is 1.5 CSS px (a card about 36x51 CSS px).
      // The canvas's CSS width is kept by fitCanvas (main.js) when it sizes the
      // canvas; reading clientWidth here every frame could force a layout.
      const k = fanBlock(vsx, this.cssW);
      const L = fanLayout(fan.cards.length);
      const key = fanKey(fan.cards, k);
      if (this._handFanKey !== key) {
        const off = (typeof OffscreenCanvas === 'function')
          ? new OffscreenCanvas(L.w * k, L.h * k)
          : (this.canvas && this.canvas.ownerDocument
              ? this.canvas.ownerDocument.createElement('canvas') : null);
        if (off) {
          off.width = L.w * k; off.height = L.h * k;
          const og = off.getContext && off.getContext('2d');
          if (og) paintFan(og, fan.cards, k);
        }
        this._handFan = off;
        this._handFanKey = key;
        this.handFanBuilds = (this.handFanBuilds || 0) + 1;
      }
      // The pulse (state.handPulse, a better hand): the fan rises and a
      // cyan-teal rim fades. It runs only in play (main.js tickHandPulse), so
      // outside play (a draft, the pause screen) nothing is drawn: a held
      // pulse would be a still rim. Reduced motion: none.
      const ph = (prefersReducedMotion() || state.mode !== 'playing') ? null : pulsePhase(state.handPulse);
      const look = pulseLook(ph);
      const lift = look.lift * k;
      const bottom = C.VIEW_H - 52;          // the pulse rim ends above the item row (VIEW_H - 49)
      const fx0 = Math.round(6 * vsx) / vsx;
      const fy0 = (Math.round(bottom * vsy) - L.h * k - lift) / vsy;
      const fw = L.w * k / vsx, fh = L.h * k / vsy;
      if (ph !== null) {
        g.globalAlpha = look.alpha;
        g.fillStyle = FAN_TEAL;
        g.fillRect(fx0 - 2, fy0 - 2, fw + 4, fh + 4);
        g.globalAlpha = 1;
      }
      if (this._handFan) g.drawImage(this._handFan, fx0, fy0, fw, fh);
      // The name, then the bonus, to the right of the fan, bottom-aligned
      // with it and clear of the radar. A bonus too wide wraps at its commas.
      const tx = Math.ceil(fx0 + fw) + 5;
      const radarL = state.radarOn
        ? C.VIEW_W - RADAR_CORNER_INSET - 2 * RADAR_DISPLAY_R - Math.max(0, Math.round(state.radarInset || 0)) - 6
        : C.VIEW_W - 7;
      const maxW = radarL - tx - 4;
      let name = hand ? hand.name.toUpperCase() : 'NO HAND YET';
      if (hand && hand.suit && SUIT_GLYPHS[hand.suit] && HAND_BY_ID[hand.id] && feedTextW(name) > maxW) {
        name = SUIT_GLYPHS[hand.suit] + ' ' + HAND_BY_ID[hand.id].name.toUpperCase();
      }
      const bl = [];
      for (const part of bonus ? bonus.split(', ') : []) {
        const cand = bl.length ? bl[bl.length - 1] + ', ' + part : part;
        if (bl.length && feedTextW(cand) <= maxW) bl[bl.length - 1] = cand;
        else bl.push(part);
      }
      const lines = [name, ...bl];
      const LH = 10;
      const ty = bottom - lines.length * LH;
      let tw = 0;
      for (const ln of lines) tw = Math.max(tw, Math.ceil(feedTextW(ln)));
      g.textBaseline = 'top';
      g.fillStyle = PLATE;
      g.fillRect(tx - 2, ty - 2, tw + 4, lines.length * LH + 1);
      for (let i = 0; i < lines.length; i++) {
        g.font = (i === 0 && fx ? 10 : 9) + 'px monospace';
        g.fillStyle = !hand ? FAN_EMPTY_TEXT : i ? '#c8eee8' : fx ? '#ffd75e' : FAN_TEAL;
        g.fillText(lines[i], tx, ty + i * LH);
      }
      const top = Math.min(fy0 - (ph !== null ? 2 : 0), ty - 2);
      hy = Math.floor(top) + 2;
      chrome.hand = {
        id: hand ? hand.id : null,
        text: hand ? name + '  ' + bonus : name,
        lines, counting,
        x: Math.floor(fx0) - 2, y: Math.floor(top), w: Math.ceil(tx + tw + 2) - (Math.floor(fx0) - 2), h: bottom + 2 - Math.floor(top),
        fan: { cards: fan.cards.map(c => c.key), dim: fan.cards.filter(c => c.dim).map(c => c.key), made: fan.made, k, x: fx0, y: fy0, w: fw, h: fh, lift, pulse: ph },
        textBox: { x: tx - 2, y: ty - 2, w: tw + 4, h: lines.length * LH + 1 },
      };
    }

    // --- the joker row, above the hand plate: one framed cell per slot, the
    // joker's card motif inside a filled one.
    chrome.jokers = [];
    chrome.jokerSlots = 0;
    if (pl && state.jokerSlots) {
      const JC = 16, jy = hy - JC - 6;
      const held = jokersHeld(state);
      chrome.jokerSlots = jokerSlots(state);
      for (let i = 0; i < chrome.jokerSlots; i++) {
        const jx = 6 + i * (JC + 3);
        const j = JOKERS[held[i]];
        g.fillStyle = j ? '#b08aff' : '#2a2a36';
        g.fillRect(jx - 1, jy - 1, JC + 2, JC + 2);
        g.fillStyle = '#14141c';
        g.fillRect(jx, jy, JC, JC);
        if (!j) continue;
        // The middle of the card face; the parchment body is left out.
        const art = cardArt(j.art);
        if (art) {
          const ox = Math.floor((art.grid[0].length - JC) / 2), oy = Math.floor((art.grid.length - JC) / 2);
          for (let ry = 0; ry < JC; ry++) {
            for (let rx = 0; rx < JC; rx++) {
              const v = art.grid[oy + ry][ox + rx];
              if (v > 4 || (v && art.fullArt && v !== 5)) {
                g.fillStyle = art.palette[v] || '#c8c8d8';
                g.fillRect(jx + rx, jy + ry, 1, 1);
              }
            }
          }
        }
        chrome.jokers.push({ id: j.id });
      }
    }

    // --- weather glyph, top-right (below the boss/maw bar zone) ---
    const wi = weatherIcon(state.weather && state.weather.def);
    chrome.weather = wi ? state.weather.def.id : null;
    if (wi) {
      const gx = C.VIEW_W - 6 - 5 * Z, gy = 15;
      for (let ry = 0; ry < wi.grid.length; ry++) {
        for (let rx = 0; rx < wi.grid[ry].length; rx++) {
          const v = wi.grid[ry][rx];
          if (v) {
            g.fillStyle = wi.palette[v];
            g.fillRect(gx + rx * Z, gy + ry * Z, Z, Z);
          }
        }
      }
    }

    this.hudChrome = chrome;
  }

  // ---- G9 TROPHY SHOWCASE (the owner's full-screen pixel-art ask) -----------
  // Owner: "would be really cool to have the trophy gallery have the ability to
  // show full screen pixel art of the trophy." This paints ONE trophy emblem as
  // large as the view honestly allows, over the whole canvas, so the gallery
  // screen (main.js mode 'trophies') can push its cards to the bottom and leave
  // the emblem owning the middle of the screen.
  //
  // WHAT IT READS: state.trophyView = { art, locked, id } | null. `art` is
  // ALREADY the right grid — achievements.galleryModel hands back the real
  // emblem on an earned entry and the LOCKED silhouette on an unearned one — so
  // this method never decides what is earned and never keeps a second copy of
  // the art table, a name or a description.
  //
  // INTEGER SCALE ONLY: the size is the largest WHOLE number of canvas pixels
  // per art pixel that fits the budget box (~72% of the view width, ~62% of the
  // height, leaving room for the frame and the bottom card row). A fractional
  // scale would make one art pixel 4px and its neighbour 5px; at 32x32 that
  // reads as a broken sprite, so uniformity wins over filling the box exactly.
  // Same reason drawGrid takes an integer block size: this is the game's
  // pixel-art convention, with no smoothing anywhere in the path.
  //
  // SEAM: this.trophyShowcase = { scale, x, y, w, h, id, locked } is the exact
  // box painted this frame (null when no trophy is selected), so the gallery
  // test can measure the geometry instead of pixel-diffing the canvas.
  drawTrophyShowcase(g, state) {
    const tv = state && state.trophyView;
    if (!tv || !tv.art || !Array.isArray(tv.art.grid) || tv.art.grid.length === 0) {
      this.trophyShowcase = null;
      return;
    }
    const art = tv.art;
    const gw = art.w || art.grid[0].length;
    const gh = art.h || art.grid.length;

    // Full-screen backdrop first: the world and HUD are still painted under
    // this (the frame loop runs in every mode), so the showcase owns the view.
    g.fillStyle = 'rgba(3,3,8,0.94)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    const maxW = Math.floor(C.VIEW_W * 0.72);
    const maxH = Math.floor(C.VIEW_H * 0.62);
    let scale = Math.min(Math.floor(maxW / gw), Math.floor(maxH / gh));
    if (!(scale >= 1)) scale = 1;     // an oversized emblem still paints 1:1
    const w = gw * scale, h = gh * scale;
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);

    // Display case in the HUD's own chrome vocabulary (CONFIG.HUD): outer steel
    // FRAME, a 1px black seam, then a dark plate. Identical primitives to the
    // bars and plates in drawHudChrome, so the showcase reads as the same game.
    const PAD = 6;
    g.fillStyle = C.HUD.FRAME;
    g.fillRect(x - PAD - 2, y - PAD - 2, w + PAD * 2 + 4, h + PAD * 2 + 4);
    g.fillStyle = '#000000';
    g.fillRect(x - PAD - 1, y - PAD - 1, w + PAD * 2 + 2, h + PAD * 2 + 2);
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);

    this.drawGrid(g, art.grid, art.palette, x, y, scale);

    this.trophyShowcase = { scale, x, y, w, h, id: tv.id, locked: !!tv.locked };
  }

  // ---- G10 BESTIARY (main.js mode 'bestiary') --------------------------------
  // Mirrors drawTrophyShowcase EXACTLY (it is the screen that shipped and is
  // tested; no second screen idiom): full-view dark backdrop painted FIRST,
  // the case in the HUD's own chrome vocabulary (CONFIG.HUD.FRAME / PLATE),
  // the entry at the LARGEST INTEGER scale that fits, centered, one block per
  // painted pixel, no smoothing.
  //
  // WHAT IT READS: state.bestiaryView = { id, kind, ref, discovered } | null
  // (main.js refreshBestiaryView). The art is resolved off the REAL source
  // modules at draw time — bosses carry their own sprite grids (bosses.js),
  // enemies the LOOK contract's shape at sizeMult (resolveLook), tiers a
  // diamond in the tier's own tell colour — so the renderer never keeps a
  // second copy of the enemy table and main.js restates nothing.
  //
  // UNDISCOVERED = TANTALISING, NEVER BLANK: the SAME code-drawn shape the
  // enemy uses in play, painted in ONE flat dark colour (MASK) — the player
  // sees that something is there and how big it is, nothing more. A masked
  // boss paints its real sprite grid through an all-MASK palette, so the
  // silhouette is the sprite's own.
  //
  // SEAM: this.bestiary = { scale, x, y, w, h, id, discovered } — the exact
  // box painted this frame (null when nothing is selected), measurable off a
  // recording 2d context exactly like the gallery's.
  drawBestiary(g, state) {
    const bv = state && state.bestiaryView;
    if (!bv || !bv.id) { this.bestiary = null; return; }

    // Full-screen backdrop first: the world and HUD are still painted under
    // this (the frame loop runs in every mode), so the bestiary owns the view.
    g.fillStyle = 'rgba(3,3,8,0.94)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    const MASK = '#262636';   // the one flat dark silhouette colour
    let grid = null, palette = null, gw = 0, gh = 0, bossRim = null;
    let shape = 'block', color = MASK, sw = C.ENEMY.W, sh = C.ENEMY.H;
    if (bv.kind === 'boss') {
      const desc = BOSSES[bv.ref] || MIDBOSS[bv.ref];
      // The static BOSSES table does not carry `sprite` (only the spawn copies
      // bosses.js:spawn() builds get it attached) — resolve through
      // BOSS_SPRITES so the guide paints the real sprite, never a stand-in.
      // A boss sprite is ANIMATED ({ frames, palette, box }); the guide shows
      // frame 0 (the in-game idiom: spr.frames[floor(age*6) % len], age 0).
      const spr = desc && (desc.sprite || BOSS_SPRITES[bv.ref]);
      if (spr) {
        grid = spr.frames ? spr.frames[0] : spr.grid;
        bossRim = spr.rim || null;
        // Masked: every palette entry -> MASK, so the silhouette IS the sprite.
        palette = bv.discovered ? spr.palette
          : Object.fromEntries(Object.keys(spr.palette).map(k => [k, MASK]));
        gw = spr.box.w; gh = spr.box.h;
      }
    } else if (bv.kind === 'tier') {
      shape = 'diamond';                      // the emblem plate shape
      sw = 24; sh = 24;
      color = bv.discovered
        ? (bv.ref === 'ELITE' ? '#f0c860' : (RARITY[bv.ref] && RARITY[bv.ref].tell.outline))
        : MASK;
    } else {
      const look = resolveLook(bv.ref, 0);    // the REAL silhouette contract
      shape = look.shape;
      sw = C.ENEMY.W * look.sizeMult;
      sh = C.ENEMY.H * look.sizeMult;
      color = bv.discovered ? look.body : MASK;
    }

    const maxW = Math.floor(C.VIEW_W * 0.72);
    const maxH = Math.floor(C.VIEW_H * 0.62);
    let scale, w, h;
    if (grid) {
      scale = Math.min(Math.floor(maxW / gw), Math.floor(maxH / gh));
      if (!(scale >= 1)) scale = 1;
      w = gw * scale; h = gh * scale;
    } else {
      // 'tall'/'wide' overshoot the box by 1.3x (drawShape) — budget for it
      // so the silhouette never clips its case. 'diamond' inscribes the box.
      const over = (shape === 'tall' || shape === 'wide') ? 1.3 : 1;
      scale = Math.min(Math.floor(maxW / (sw * over)), Math.floor(maxH / (sh * over)));
      if (!(scale >= 1)) scale = 1;
      w = Math.round(sw * scale); h = Math.round(sh * scale);
    }
    const x = Math.round((C.VIEW_W - w) / 2);
    const y = Math.round((C.VIEW_H - h) / 2);

    // Display case in the HUD's own chrome vocabulary — identical primitives
    // to the trophy showcase, so both screens read as the same game.
    const PAD = 6;
    g.fillStyle = C.HUD.FRAME;
    g.fillRect(x - PAD - 2, y - PAD - 2, w + PAD * 2 + 4, h + PAD * 2 + 4);
    g.fillStyle = '#000000';
    g.fillRect(x - PAD - 1, y - PAD - 1, w + PAD * 2 + 2, h + PAD * 2 + 2);
    g.fillStyle = C.HUD.PLATE_SOLID;
    g.fillRect(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);

    if (grid) {
      // bossdark: a found boss wears its rim here too (its body is dark, the
      // case is dark): the silhouette in the rim colour, a step out each way,
      // then a dark line, then the boss. Inside the case's padding.
      const rim = bv.discovered && bossRim;
      if (rim) {
        const k = Math.min(PAD - 1, Math.max(2, Math.round(scale / 2)));
        const ink = Object.fromEntries(Object.keys(palette).map(c => [c, rim]));
        for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) this.drawGrid(g, grid, ink, x + dx, y + dy, scale);
        const dark = Object.fromEntries(Object.keys(palette).map(c => [c, '#0b0912']));
        const j = Math.max(1, k >> 1);
        for (const [dx, dy] of [[-j, 0], [j, 0], [0, -j], [0, j]]) this.drawGrid(g, grid, dark, x + dx, y + dy, scale);
      }
      this.drawGrid(g, grid, palette, x, y, scale);
    } else {
      g.fillStyle = color;
      drawShape(g, shape, x + Math.round(w / 2), y + Math.round(h / 2), w, h);
    }

    this.bestiary = { scale, x, y, w, h, id: bv.id, discovered: !!bv.discovered };
  }

  // ---- arena relief (world space; the elevated-paths height field) ------------
  // ARENA SCALE-UP (2026-09-17): the stage's quantized height, painted as a
  // per-level lighten step + a 1px contour edge where the level changes. The
  // field is hashed on the fly from the run's groundSeed (the drawGround
  // pattern — nothing is stored, off-view cells are never visited) and sits
  // UNDER the decor, so elevation reads as terrain without competing with
  // the play pieces. A LEVELS<=1 stage paints nothing (flat is a character).
  drawRelief(g, state, cam, theme) {
    const seed = state.groundSeed || 1;
    const RC = C.RELIEF.RENDER_CELL;
    const RIM = C.GROUND.RIM;
    const rel = stageRelief(state.stage);
    if (!rel || rel.LEVELS <= 1) return;
    // M5b LANDSCAPE: an authored layout replaces the natural tints.
    if (terrainFor(state.groundSeed || 0, state.stage)) return;
    const c0 = Math.floor(cam.x / RC), c1 = Math.floor((cam.x + C.VIEW_W) / RC);
    const r0 = Math.floor(cam.y / RC), r1 = Math.floor((cam.y + C.VIEW_H) / RC);
    const lvAt = (wx, wy) => reliefLevelAt(wx, wy, seed, rel);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const wx = cx * RC + RC / 2, wy = cy * RC + RC / 2;
        // Relief never paints past the rim (the WAVE-24 decor rule).
        if (wx < -RIM || wx > RIM || wy < -RIM || wy > RIM) continue;
        const lv = lvAt(wx, wy);
        const x = Math.round(cx * RC - cam.x), y = Math.round(cy * RC - cam.y);
        if (lv > 0) {
          // Each level lightens the theme base one step — terraced ground.
          g.globalAlpha = 0.05 * lv;
          g.fillStyle = '#ffffff';
          g.fillRect(x, y, RC + 1, RC + 1);
        }
        // Contour edges: a 1px shadowed lip where the neighbour rises or
        // falls — the elevation's read at a glance, and free at RC 60.
        if (lvAt(wx + RC, wy) !== lv) {
          g.globalAlpha = 0.22;
          g.fillStyle = '#000000';
          g.fillRect(x + RC, y, 1, RC + 1);
        }
        if (lvAt(wx, wy + RC) !== lv) {
          g.globalAlpha = 0.22;
          g.fillStyle = '#000000';
          g.fillRect(x, y + RC, RC + 1, 1);
        }
      }
    }
    g.globalAlpha = 1;
    this.reliefCells = (c1 - c0 + 1) * (r1 - r0 + 1);
  }

  // ---- the authored upper terrace (ELEVATION v2 2026-09-18) --------------------
  // Draw the stage's TERRACE block: the upper path, its ramps, and the cliff
  // faces. ART ONLY — the collision reads the same TERRACE block through
  // relief.js's reliefLevelAt, so the cliff the player SEES and the cliff the
  // mover FEELS are one structure: a lip is painted ONLY where the composite
  // field really steps >= CLIFF_STEP levels (a natural-ramp merge paints no
  // cliff, because it is not one). Readability contract ("if possible form
  // our view"): the cliff reads as a DROP LINE (the darkest lip on the
  // field) + FACE SHADING (a dark inner shadow just inside the edge), the
  // ramps read as light shelves climbing to the bright path top, and the
  // whole thing must legible on a 320x568 phone — the band is 140px thick
  // against a ~480px-wide view.
  drawTerrace(g, state, cam) {
    const rel = stageRelief(state.stage);
    const T = rel && rel.TERRACE;
    if (!T) return;
    const seed = state.groundSeed || 1;
    const cx = -cam.x, cy = -cam.y;              // world origin, screen space
    const rm = (T.r0 + T.r1) / 2, band = T.r1 - T.r0;
    const rampRun = 2 * T.rampW;
    // The upper path top: the brightest band on the field (the tallest ground).
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = band;
    g.beginPath(); g.arc(cx, cy, rm, T.A0, T.A1); g.stroke();
    // The ramps: lighter shelves flanking the span — the visible way up.
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.beginPath(); g.arc(cx, cy, rm, T.A0 - rampRun, T.A0); g.stroke();
    g.beginPath(); g.arc(cx, cy, rm, T.A1, T.A1 + rampRun); g.stroke();
    // The cliff spans — sampled against the run's own field so the paint
    // never claims a cliff where a natural merge lets walkers up.
    const lvAt = (wx, wy) => reliefLevelAt(wx, wy, seed, rel);
    const cliffy = (rIn, rOut, a) =>
      Math.abs(lvAt(Math.cos(a) * rIn, Math.sin(a) * rIn) -
               lvAt(Math.cos(a) * rOut, Math.sin(a) * rOut)) >= C.RELIEF.CLIFF_STEP;
    const spans = (rIn, rOut) => {
      const out = [];
      const STEP = 0.02;
      let start = null;
      for (let a = T.A0 - rampRun; a <= T.A1 + rampRun + 1e-9; a += STEP) {
        if (cliffy(rIn, rOut, a)) { if (start === null) start = a; }
        else if (start !== null) { out.push([start, a]); start = null; }
      }
      if (start !== null) out.push([start, T.A1 + rampRun]);
      return out;
    };
    // The DROP LINE + FACE SHADING on each cliff edge (inner r0, outer r1).
    for (const [rIn, rOut, lipR, shadeR] of [
      [T.r0 + 2, T.r0 - 4, T.r0 - 1, T.r0 + 7],     // the inner face (hollow side)
      [T.r1 - 2, T.r1 + 4, T.r1 + 1, T.r1 - 7],     // the outer face (field side)
    ]) {
      const ss = spans(rIn, rOut);
      if (!ss.length) continue;
      g.strokeStyle = 'rgba(0,0,0,0.18)';           // face shading, inside the edge
      g.lineWidth = 8;
      g.beginPath();
      for (const [a, b] of ss) {
        g.moveTo(cx + Math.cos(a) * shadeR, cy + Math.sin(a) * shadeR);
        g.arc(cx, cy, shadeR, a, b);
      }
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.40)';           // the drop line itself
      g.lineWidth = 2;
      g.beginPath();
      for (const [a, b] of ss) {
        g.moveTo(cx + Math.cos(a) * lipR, cy + Math.sin(a) * lipR);
        g.arc(cx, cy, lipR, a, b);
      }
      g.stroke();
    }
    // Post ticks at the ramp mouths (the span ends) — the way up, marked.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const a of [T.A0, T.A1]) {
      const px = cx + Math.cos(a) * rm, py = cy + Math.sin(a) * rm;
      g.fillRect(Math.round(px) - 1, Math.round(py) - 3, 2, 6);
    }
    this.terraceDrawn = true;
  }

  // ---- ground decor (world space; deterministic hash field) ------------------
  // WAVE-23 (#2, Sk408 directive): the old 1-2px speckle read as "scanline
  // noise / hieroglyphs". Same deterministic field, same culling, same
  // palettes — but every piece is now LARGE and COMPOSED (a stone PAIR, a
  // tuft CLUSTER, a slab PLATE with seams, an occasional boulder landmark)
  // so the floor reads as deliberate level art. Still subtle: decor sits
  // under entities and never competes with the play pieces.
  drawGround(g, seed, cam, theme, stage, weather) {
    // WORLD ART MAKEOVER (src/world_ground.js): the STAGE owns the floor
    // material (its palette, the underlay, the decor and motifs) and the WAVE
    // theme leans every colour (the ladder beat survives). Geometry is the
    // same pure function of (cell, seed, stage, weather id) as before. With a
    // real canvas the floor is cached in 256 px chunks (a frame blits a few);
    // without one (the headless harness) it paints directly, as before.
    const pal = stageGroundPalette(stage, theme || groundTheme(1));
    if (drawGroundChunks(g, seed, cam, C.VIEW_W, C.VIEW_H, pal, stage, weather)) {
      this.groundCached = true;
      return;
    }
    this.groundCached = false;
    this.groundMotifs = paintGroundDecor(g, seed, cam.x, cam.y, cam.x, cam.y,
      cam.x + C.VIEW_W, cam.y + C.VIEW_H, pal, stage, weather);
  }

  // ---- WAVE-24 (#3): LANDMARKS — deliberate level art -------------------------
  // The fine decor field above is TEXTURE; a floor made only of texture reads
  // as noise with no sense of place (the vision pass: "scanline noise",
  // "hieroglyph-like glyphs"). This second, COARSER layer puts a handful of
  // recognizable structures on a LANDMARK_CELL grid — ruined wall runs, fallen
  // pillars, cairns, camp rings and a theme-flavored pile — so the floor has
  // landmarks to orient by. Same deterministic hash field as the fine decor
  // (no stored arrays; off-screen cells are never visited), same theme
  // palette, drawn ON TOP of the fine field (structures occlude ground
  // texture) but still UNDER every entity. Quiet by contract: dark tones,
  // never brighter than a play piece. `this.landmarks` is the smoke seam
  // (what was painted this frame: { kind, x, y, rects } in world coords).
  drawLandmarks(g, seed, cam, theme, stage) {
    const FC = C.GROUND.LANDMARK_CELL, DENS = C.GROUND.LANDMARK_DENSITY;
    const RIM = C.GROUND.RIM;
    // WORLD ART MAKEOVER: the small structures share the stage's ground
    // material (world_ground.js); the theme-flavoured pile follows the stage.
    const pal = stageGroundPalette(stage, theme || groundTheme(1));
    const tIdx = stage === 'VOID_REACH' ? 5 : (stage === 'SNOWFIELD' || stage === 'WHITEOUT') ? 2
      : stage ? -1 : C.GROUND.THEMES.indexOf(theme || groundTheme(1));
    // STARTING ARENA IMPROVE (2026-09-17): `stage` (optional) lets ONE arena
    // carry its own landmark identity without touching the other seven —
    // the VERDANT HOLLOW grows grove stands and two authored structures
    // (the heart stump + the cardinal gates) so the run reads as a PLACE.
    const hollow = stage === 'VERDANT_HOLLOW';
    // The hollow's AUTHORED accents. The hash field above stays whisper-quiet
    // by contract (same value band as the ground), but the stump, gates and
    // groves are the MAP a first-timer orients by — measured against a phone
    // shot (2026-09-17): the quiet palette rendered faint-to-invisible next to
    // base #0e1610. These accents keep the landmark layer clearly under every
    // play piece (gems #ffd75e, potions, lit foes) while giving the authored
    // set the value separation the field lacks. Only the hollow ever sees them.
    const A = {
      bark: '#3e2e1e', wood: '#7c603c', ring: '#a8906a',   // the stump: cut wood
      moss: '#4c9455', mossLit: '#6cc47c',                  // living green
      leaf: '#2e5c38',                                      // grove canopy base
      rock: '#5e6a5e', rockLit: '#98ad9a',                  // the gate stones
      shadow: '#060a07',
    };
    const grove = (x, y) => {          // tree stand: canopy + trunks + a log
      g.fillStyle = A.shadow;                                    // bed shadow
      g.fillRect(x - 2, y + 12, 30, 2);
      g.fillStyle = A.leaf;                                      // canopy
      g.fillRect(x - 2, y, 14, 8); g.fillRect(x + 9, y + 2, 15, 8);
      g.fillStyle = A.moss;                                      // lit canopy
      g.fillRect(x - 2, y, 14, 2); g.fillRect(x + 9, y + 2, 15, 2);
      g.fillStyle = A.mossLit;                                   // sun-lit crowns
      g.fillRect(x + 2, y, 5, 2); g.fillRect(x + 13, y + 2, 6, 2);
      g.fillRect(x + 4, y + 5, 4, 2);
      g.fillStyle = A.bark;                                      // trunks
      g.fillRect(x + 4, y + 8, 4, 5); g.fillRect(x + 15, y + 10, 4, 3);
      g.fillStyle = A.wood;                                      // fallen log
      g.fillRect(x - 2, y + 9, 8, 3);
      return 11;
    };
    const out = [];
    // PORT SLICE D (prop density + spawn guarantee, owner-ruled 2026-09-22:
    // "we can have more of them and guarantee one near spawn" — an APPROVED
    // visual-density change, painting only). The guarantee: every fresh run
    // shows at least one of its stage's props inside the initial camera view
    // of the spawn. The spawn is fixed (startRun parks the pilot at
    // VIEW_W/2, VIEW_H/2 with cam {0,0}), so the initial view is the world
    // rect [0,VIEW_W]x[0,VIEW_H]. The guaranteed cell is the nearest
    // density-picked landmark cell to the spawn whose anchor sits fully
    // inside that rect — a pure cellRand hash field over (cell, seed), never
    // the clock — falling back to the spawn's own cell (always in-view and
    // rim-safe) when no picked cell qualifies, so the promise holds for
    // every seed. Forced at paint time only: no sim state is read or
    // written, and the forced cell still reports through the same landmarks
    // seam (kind = the stage's prop id, COMPOSED rects).
    const SPAWN_X = C.VIEW_W / 2, SPAWN_Y = C.VIEW_H / 2;
    const anchorOf = (cx, cy) => ({
      x: cx * FC + 24 + Math.floor(cellRand(cx, cy, seed, 12) * (FC - 72)),
      y: cy * FC + 24 + Math.floor(cellRand(cx, cy, seed, 13) * (FC - 72)),
    });
    let gPick = null, gPickD = Infinity, gAny = null, gAnyD = Infinity;
    for (let gy = Math.floor(0 / FC); gy <= Math.floor(C.VIEW_H / FC); gy++) {
      for (let gx = Math.floor(0 / FC); gx <= Math.floor(C.VIEW_W / FC); gx++) {
        const a = anchorOf(gx, gy);
        if (a.x < -RIM + 4 || a.x > RIM - 76 || a.y < -RIM + 4 || a.y > RIM - 76) continue;
        if (a.x < 0 || a.y < 0 || a.x + 20 > C.VIEW_W || a.y + 20 > C.VIEW_H) continue;
        const d = (a.x - SPAWN_X) * (a.x - SPAWN_X) + (a.y - SPAWN_Y) * (a.y - SPAWN_Y);
        if (d < gAnyD) { gAny = { x: gx, y: gy }; gAnyD = d; }
        if (cellRand(gx, gy, seed, 11) < DENS && d < gPickD) { gPick = { x: gx, y: gy }; gPickD = d; }
      }
    }
    const gCell = gPick || gAny;
    const c0 = Math.floor(cam.x / FC), c1 = Math.floor((cam.x + C.VIEW_W) / FC);
    const r0 = Math.floor(cam.y / FC), r1 = Math.floor((cam.y + C.VIEW_H) / FC);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const forceProp = gCell !== null && cx === gCell.x && cy === gCell.y;
        // The guaranteed cell paints unconditionally (even the density-gate
        // fallback); every other cell keeps the shipped density gate.
        if (!forceProp && cellRand(cx, cy, seed, 11) >= DENS) continue;
        // Anchor inside the cell with a margin so a structure never clips its
        // neighbour, and never past the arena rim (structures are <= 72 wide).
        const wx = cx * FC + 24 + Math.floor(cellRand(cx, cy, seed, 12) * (FC - 72));
        const wy = cy * FC + 24 + Math.floor(cellRand(cx, cy, seed, 13) * (FC - 72));
        if (wx < -RIM + 4 || wx > RIM - 76 || wy < -RIM + 4 || wy > RIM - 76) continue;
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        const pick = cellRand(cx, cy, seed, 14);
        // rects = how many fillRects this structure painted (the smoke seam
        // asserts every landmark is COMPOSED, i.e. many rects, not a glyph).
        let rects = 6;
        let kind = 'RUBBLE';
        if (forceProp) {            // PORT SLICE D spawn guarantee (above):
          const prop = propForStage(stage);   // the stage's prop, unconditionally
          kind = prop.id;
          const fr = propFrame(prop, cx, cy);
          g.fillStyle = pal.crack;                                     // bed shadow
          g.fillRect(x - 2, y + prop.h, prop.w + 4, 1);
          rects = 1 + paintStageProp(g, blitProp, prop.id, fr, x, y);
        } else if (pick < 0.26) {            // RUINED WALL RUN: blocks + a breach
          kind = 'WALL';
          const n = 4 + Math.floor(cellRand(cx, cy, seed, 15) * 3);      // 4..6
          const gap = Math.floor(cellRand(cx, cy, seed, 16) * n);        // breach
          rects = 1 + 2 * (n - 1);
          g.fillStyle = pal.crack;                                       // base shadow
          g.fillRect(x - 1, y + 5, n * 11 + 1, 1);
          g.fillStyle = pal.stone;
          for (let i = 0; i < n; i++) { if (i !== gap) g.fillRect(x + i * 11, y, 10, 5); }
          g.fillStyle = pal.stoneTop;                                    // lit course
          for (let i = 0; i < n; i++) { if (i !== gap) g.fillRect(x + i * 11, y, 10, 1); }
        } else if (hollow && pick < 0.52) {   // THE HOLLOW: grove stands
          kind = 'GROVE';                     // (the wooded arena's filler)
          rects = grove(x, y);
        } else if (pick < 0.48) {     // FALLEN PILLAR: stepped column + base
          kind = 'PILLAR';
          const n = 3 + Math.floor(cellRand(cx, cy, seed, 15) * 3);      // 3..5
          rects = 2 * n + 3;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 5, n * 8 + 12, 1);
          g.fillStyle = pal.stone;
          for (let i = 0; i < n; i++) g.fillRect(x + i * 8, y + i * 5, 12, 5);
          g.fillRect(x + n * 8, y + n * 5, 10, 6);                       // broken base
          g.fillStyle = pal.stoneTop;
          for (let i = 0; i < n; i++) g.fillRect(x + i * 8, y + i * 5, 12, 1);
          g.fillRect(x + n * 8, y + n * 5, 10, 1);
        } else if (pick < 0.62) {     // CAIRN: stacked stones, tapering
          kind = 'CAIRN';
          rects = 7;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 12, 16, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 8, 14, 4);
          g.fillRect(x + 2, y + 4, 10, 4);
          g.fillRect(x + 4, y + 1, 6, 3);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 8, 12, 1);
          g.fillRect(x + 3, y + 4, 8, 1);
          g.fillRect(x + 4, y + 1, 6, 1);
        } else if (pick < 0.72) {     // CAMP RING: stones round a fire scar
          kind = 'CAMP';
          rects = 9;
          const R = 9 + Math.floor(cellRand(cx, cy, seed, 15) * 5);
          g.fillStyle = pal.crack;                                     // scorched centre
          g.fillRect(x + 8, y + 6, 9, 9);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.fillStyle = i % 2 ? pal.stone : pal.stoneTop;
            g.fillRect(Math.round(x + 12 + Math.cos(a) * R),
                       Math.round(y + 10 + Math.sin(a) * R), 3, 2);
          }
        } else if (cellRand(cx, cy, seed, 17) < 0.85) {
          // PORT SLICE A (stage/prop objects): the stage's signature prop —
          // an ORIGINAL drawGrid pixel object (src/stage_props.js), one per
          // stage identity, painted through the same drawGrid every sprite
          // uses.
          // PORT SLICE D (owner-ruled 2026-09-22): the tail is now the DENSE
          // branch — CAMP ends at 0.72 (was 0.86) and the prop hash gate is
          // 0.85 (was 0.55), so ~24% of picked cells carry the stage's prop,
          // a few per screen instead of about one. The
          // subdivision stays one-landmark-per-picked-cell, hash-gated on
          // the same fresh salt so no existing structure moves, rim-clipped
          // by the same anchor cull above (props are <= 16px on a 72px
          // margin). Arithmetic: the tail was 14% of picked cells at a 0.55
          // gate (7.7% props per picked cell); it is now 28% at a 0.85 gate
          // (23.8% per picked cell), and LANDMARK_DENSITY went 0.30 -> 0.45
          // alongside, so props per landmark cell rise ~2.3% -> ~10.7%.
          // The hollow keeps its authored STUMP/GATE/GROVE (below + the
          // authored block); its tail simply grows lanterns among the groves.
          const prop = propForStage(stage);
          kind = prop.id;
          const fr = propFrame(prop, cx, cy);
          g.fillStyle = pal.crack;                                     // bed shadow
          g.fillRect(x - 2, y + prop.h, prop.w + 4, 1);
          rects = 1 + paintStageProp(g, blitProp, prop.id, fr, x, y);
        } else if (hollow) {          // THE HOLLOW: the tail grows groves too
          kind = 'GROVE';
          rects = grove(x, y);
        } else if (tIdx === 5) {      // VOID REACH: crystal shard cluster
          kind = 'CRYSTAL';
          rects = 7;
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 11, 18, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 1, y + 3, 5, 9); g.fillRect(x + 10, y + 5, 4, 7);
          g.fillStyle = pal.tuft2;                                     // the shards
          g.fillRect(x + 2, y, 2, 11); g.fillRect(x + 11, y + 2, 2, 9);
          g.fillStyle = pal.tuft;
          g.fillRect(x + 2, y, 1, 5); g.fillRect(x + 11, y + 2, 1, 4);
        } else if (tIdx === 2) {      // SNOWFIELD: wind-packed drift mound
          kind = 'DRIFT';
          rects = 5;
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 6, 20, 5); g.fillRect(x + 4, y + 3, 12, 4);
          g.fillStyle = pal.stoneTop;                                  // windlit crest
          g.fillRect(x + 4, y + 3, 12, 1); g.fillRect(x, y + 6, 20, 1);
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 11, 22, 1);
        } else {                      // rubble mound: collapsed stone heap
          kind = 'RUBBLE';
          g.fillStyle = pal.crack;
          g.fillRect(x - 1, y + 10, 19, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x, y + 6, 18, 5); g.fillRect(x + 3, y + 3, 11, 4);
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + 1, y + 6, 16, 1); g.fillRect(x + 4, y + 3, 9, 1);
          g.fillStyle = pal.stone;
          g.fillRect(x + 14, y + 8, 4, 3);
        }
        out.push({ kind, x: wx, y: wy, rects });
      }
    }
    // PORT SLICE E (buildings, owner request 2026-09-22: "see some of the
    // buildings on the map too" — an APPROVED visual-density addition,
    // painting only) + PORT SLICE J (owner directives 2026-09-23: whole-map
    // composition study + uncapped variety — hamlets/compounds, not
    // one-per-cell sprinkles). The field is SINGLE-SOURCED from
    // src/stage_buildings.js buildingPlacements(seed, stage): every
    // building-cell composes 1 anchor + up to 3 satellites from the biome's
    // 8-design kit (no density gate — the slice-E 0.22 rare-gate is REMOVED;
    // spacing rhythm is the 576px cell pitch plus the pilot-fit separation
    // floor, geometry bounds the per-view cost at O(view)). This pass only
    // view-culls that field and paints it through paintBuilding (fixed
    // authored palettes so a stage reads as a PLACE under any wave theme).
    // Same contract as the field above: deterministic per (seed, stage) —
    // never the clock — reported through the same landmarks seam (kind = the
    // design id, always COMPOSED). Buildings ADD landmarks; the slice-A/D
    // prop subdivision and its density pins do not move. The spawn cluster
    // (anchor + >= 1 satellite whole in the initial view, fixed floor points
    // cleared) generalizes the slice-E/D in-view promise: the initial view
    // shows the biome's composition. Collision reads the same field through
    // buildingFootprints (slice F): paint and blocking agree box for box by
    // construction — there is no second field math here to drift.
    const bField = buildingField(seed, stage);
    for (const b of bField) {
      // View cull (structures overhang their cell by design).
      if (b.x + b.w < cam.x || b.x > cam.x + C.VIEW_W) continue;
      if (b.y + b.h < cam.y || b.y > cam.y + C.VIEW_H) continue;
      const x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
      out.push({ kind: b.id, x: b.x, y: b.y, rects: blitBuilding(g, b.id, x, y) });
    }
    // THE HOLLOW'S AUTHORED LANDMARKS (STARTING ARENA IMPROVE 2026-09-17) —
    // not hash-gated: the OLD STUMP stands at the exact arena heart (the
    // spawn clearing the BASIN relief flattens) and a GATE of twin stones
    // marks each cardinal rim approach, so the 1800x1800 field reads as a
    // MAP: from anywhere, "the stump" is home and the nearest gate names
    // the wall you are walking toward. Deterministic, camera-culled, the
    // same palette and the same landmarks seam as the field structures.
    if (hollow) {
      const put = (kind, wx, wy, draw) => {
        const x = Math.round(wx - cam.x), y = Math.round(wy - cam.y);
        if (x < -80 || x > C.VIEW_W + 80 || y < -80 || y > C.VIEW_H + 80) return;
        out.push({ kind, x: wx, y: wy, rects: draw(x, y) });
      };
      put('STUMP', 0, 0, (x, y) => {   // the OLD STUMP: the hollow's heart
        // Big enough to read around the pilot who spawns on it (the pilot is
        // ~14px; the cut face is 40 wide), and two value bands above the
        // ground so it reads at phone scale. Second readability pass
        // (2026-09-17, measured against a phone shot): a stepped OCTAGON
        // silhouette instead of a square (a round thing reads "stump", a
        // square reads "crate"), a 2px darker outer bark rim, a soft drop
        // shadow wider than the base so the mass sits ON the ground.
        g.fillStyle = A.shadow;                                // drop shadow
        g.fillRect(x - 26, y + 20, 52, 4);
        g.fillRect(x - 32, y + 22, 64, 3);
        g.fillStyle = A.bark;                                  // bark: octagon
        g.fillRect(x - 16, y - 26, 32, 4);
        g.fillRect(x - 22, y - 22, 44, 8);
        g.fillRect(x - 24, y - 14, 48, 32);
        g.fillRect(x - 22, y + 18, 44, 6);
        g.fillRect(x - 16, y + 24, 32, 4);
        g.fillStyle = A.wood;                                  // cut face (stepped in)
        g.fillRect(x - 12, y - 20, 24, 4);
        g.fillRect(x - 16, y - 16, 32, 34);
        g.fillRect(x - 12, y + 18, 24, 4);
        g.fillStyle = A.ring;                                  // growth rings
        g.fillRect(x - 14, y - 14, 28, 2); g.fillRect(x - 11, y - 8, 22, 2);
        g.fillRect(x - 8, y - 2, 16, 2); g.fillRect(x - 11, y + 4, 22, 2);
        g.fillRect(x - 7, y + 10, 14, 2);
        g.fillStyle = A.bark;                                  // heartwood
        g.fillRect(x - 3, y + 14, 6, 4);
        g.fillStyle = A.moss;                                  // moss caps
        g.fillRect(x - 20, y - 22, 8, 5); g.fillRect(x + 12, y - 18, 9, 6);
        g.fillRect(x - 20, y + 16, 11, 6);
        g.fillStyle = A.mossLit;                               // lit moss
        g.fillRect(x - 20, y - 22, 8, 2); g.fillRect(x + 12, y - 18, 9, 2);
        g.fillRect(x + 17, y - 14, 4, 3);
        g.fillStyle = A.bark;                                  // roots
        g.fillRect(x - 36, y + 18, 14, 3); g.fillRect(x + 22, y + 20, 15, 3);
        g.fillRect(x - 3, y + 26, 6, 8);
        return 23;
      });
      const G = RIM - 150;             // just inside the wall, on the flat rim
      for (const [gx, gy] of [[0, -G], [0, G], [-G, 0], [G, 0]]) {
        put('GATE', gx, gy, (x, y) => {  // twin stones, moss-capped
          // Second readability pass (2026-09-17): 3-step TAPERED monoliths
          // (wide base, narrow cap — standing stones, not wall blocks), a cast
          // shadow spanning both stones so the pair reads as one gate, and the
          // lintel BROKEN — lying fallen at a stepped diagonal between the
          // pillars, which reads as a ruin instead of a lintel-shaped bar.
          g.fillStyle = A.shadow;                              // cast shadow
          g.fillRect(x - 18, y + 14, 56, 3);
          g.fillRect(x - 12, y + 17, 44, 2);
          g.fillStyle = A.rock;                                // left monolith
          g.fillRect(x - 16, y - 8, 15, 24);                   // base course
          g.fillRect(x - 14, y - 22, 13, 14);                  // mid course
          g.fillRect(x - 12, y - 32, 10, 10);                  // cap course
          g.fillStyle = A.rock;                                // right monolith
          g.fillRect(x + 4, y - 4, 13, 20);
          g.fillRect(x + 6, y - 18, 11, 14);
          g.fillRect(x + 8, y - 30, 8, 12);
          g.fillStyle = A.rockLit;                             // lit faces
          g.fillRect(x - 16, y - 8, 15, 2); g.fillRect(x - 14, y - 22, 13, 2);
          g.fillRect(x - 12, y - 32, 10, 2);
          g.fillRect(x + 4, y - 4, 13, 2); g.fillRect(x + 6, y - 18, 11, 2);
          g.fillRect(x + 8, y - 30, 8, 2);
          g.fillRect(x - 16, y - 8, 2, 24); g.fillRect(x + 4, y - 4, 2, 20);
          g.fillStyle = A.rock;                                // broken lintel,
          g.fillRect(x - 10, y + 4, 8, 4);                     // fallen at a step
          g.fillRect(x - 4, y + 2, 8, 4);                      // diagonal between
          g.fillRect(x + 2, y + 4, 8, 4);                      // the pillars
          g.fillStyle = A.rockLit;
          g.fillRect(x - 10, y + 4, 8, 1); g.fillRect(x - 4, y + 2, 8, 1);
          g.fillRect(x + 2, y + 4, 8, 1);
          g.fillStyle = A.moss;                                // moss caps
          g.fillRect(x - 12, y - 32, 9, 3); g.fillRect(x + 8, y - 30, 7, 3);
          g.fillRect(x - 13, y + 8, 7, 4);
          g.fillStyle = A.mossLit;                             // lit moss
          g.fillRect(x - 12, y - 32, 9, 1); g.fillRect(x + 8, y - 30, 7, 1);
          g.fillRect(x - 13, y + 8, 7, 1);
          return 21;
        });
      }
    }
    this.landmarks = out;
  }

  // ---- WAVE-18 (#7): the ARENA WALL --------------------------------------------
  // galaxy.click: "the edge of the map is not clearly defined". The clamp
  // (±600, main.js update) always existed but drew nothing — an invisible
  // wall reads as a bug ("why did I stop?"). This paints a stone-slab rim AT
  // the clamp edge, theme-tinted like the ground decor (lit inner face, dark
  // mortar seams, crisp black rim line), with a gloom fill beyond it so
  // off-map space reads as off-map. It is world geometry: drawn inside the
  // zoom transform (crisp at 1x through 8x) and culled per side to the
  // visible window. `this.arenaWall` is the smoke seam (world-coord sides).
  drawArenaWall(g, cam, theme) {
    // WAVE-27: the band thickness is CONFIG.GROUND.WALL — the loot clamp
    // (entities.clampLootToArena) and the pilot edge hold (controllers.js)
    // subtract the same knob, so the art and the reachability rule can never
    // drift apart again (it used to be a bare 12 here).
    const RIM = C.GROUND.RIM, T = C.GROUND.WALL;   // clamp edge + wall band px
    const pal = theme || groundTheme(1);
    const x0 = cam.x, x1 = cam.x + C.VIEW_W, y0 = cam.y, y1 = cam.y + C.VIEW_H;
    // (a) gloom beyond the rim — non-overlapping decomposition of the visible
    // window minus the arena square, so the alpha never stacks at corners.
    if (y0 < -RIM) {
      const gy1 = Math.min(y1, -RIM);
      g.fillStyle = 'rgba(4,4,10,0.55)';
      g.fillRect(Math.round(x0 - cam.x), Math.round(y0 - cam.y),
        C.VIEW_W, Math.round(gy1 - y0));
    }
    if (y1 > RIM) {
      const gy0 = Math.max(y0, RIM);
      g.fillStyle = 'rgba(4,4,10,0.55)';
      g.fillRect(Math.round(x0 - cam.x), Math.round(gy0 - cam.y),
        C.VIEW_W, Math.round(y1 - gy0));
    }
    const cy0 = Math.max(y0, -RIM), cy1 = Math.min(y1, RIM);
    if (cy1 > cy0) {
      if (x0 < -RIM) {
        const gx1 = Math.min(x1, -RIM);
        g.fillStyle = 'rgba(4,4,10,0.55)';
        g.fillRect(Math.round(x0 - cam.x), Math.round(cy0 - cam.y),
          Math.round(gx1 - x0), Math.round(cy1 - cy0));
      }
      if (x1 > RIM) {
        const gx0 = Math.max(x0, RIM);
        g.fillStyle = 'rgba(4,4,10,0.55)';
        g.fillRect(Math.round(gx0 - cam.x), Math.round(cy0 - cam.y),
          Math.round(x1 - gx0), Math.round(cy1 - cy0));
      }
    }
    // (b) the wall band on each visible side, extended T past the corners so
    // the bands join. Stone body + lit inner face + black rim line + seams.
    const wy0 = Math.max(y0, -RIM - T), wy1 = Math.min(y1, RIM + T);
    const wx0 = Math.max(x0, -RIM - T), wx1 = Math.min(x1, RIM + T);
    const sides = [];
    if (x1 > RIM && x0 < RIM + T && wy1 > wy0)
      sides.push({ side: 'E', x: RIM, y: wy0, w: T, h: wy1 - wy0, horiz: false });
    if (x0 < -RIM && x1 > -RIM - T && wy1 > wy0)
      sides.push({ side: 'W', x: -RIM - T, y: wy0, w: T, h: wy1 - wy0, horiz: false });
    if (y1 > RIM && y0 < RIM + T && wx1 > wx0)
      sides.push({ side: 'S', x: wx0, y: RIM, w: wx1 - wx0, h: T, horiz: true });
    if (y0 < -RIM && y1 > -RIM - T && wx1 > wx0)
      sides.push({ side: 'N', x: wx0, y: -RIM - T, w: wx1 - wx0, h: T, horiz: true });
    for (const s of sides) {
      g.fillStyle = pal.stone;                       // slab body
      g.fillRect(Math.round(s.x - cam.x), Math.round(s.y - cam.y), s.w, s.h);
      // Crisp black rim line on the ARENA-facing edge + a lit face just
      // outside it. E/S light their min edge (arena is at lower x/y); W/N
      // light their max edge.
      const inner = (s.side === 'W') ? s.x + s.w - 1 : s.x;    // lit-line x
      const innerY = (s.side === 'N') ? s.y + s.h - 1 : s.y;   // lit-line y
      const outward = (s.side === 'W' || s.side === 'N') ? -1 : 1;
      g.fillStyle = '#000000';
      if (s.horiz) g.fillRect(Math.round(s.x - cam.x), Math.round(innerY - cam.y), s.w, 1);
      else g.fillRect(Math.round(inner - cam.x), Math.round(s.y - cam.y), 1, s.h);
      g.fillStyle = pal.stoneTop;
      if (s.horiz) g.fillRect(Math.round(s.x - cam.x), Math.round(innerY - cam.y) + outward, s.w, 1);
      else g.fillRect(Math.round(inner - cam.x) + outward, Math.round(s.y - cam.y), 1, s.h);
      // mortar seams every 16px along the band
      g.fillStyle = 'rgba(0,0,0,0.35)';
      if (s.horiz) {
        for (let mx = s.x + 16; mx < s.x + s.w; mx += 16) {
          g.fillRect(Math.round(mx - cam.x), Math.round(s.y - cam.y), 1, s.h);
        }
      } else {
        for (let my = s.y + 16; my < s.y + s.h; my += 16) {
          g.fillRect(Math.round(s.x - cam.x), Math.round(my - cam.y), s.w, 1);
        }
      }
      // WORLD ART MAKEOVER: light from the top left. The north and west walls
      // cast a soft shadow onto the arena floor; every block's outer half is
      // shaded so the band reads as a wall top, not a stripe; a dark outer
      // edge closes the silhouette.
      const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      if (s.side === 'N') g.fillRect(sx, sy + s.h, s.w, 5);
      else if (s.side === 'W') g.fillRect(sx + s.w, sy, 5, s.h);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      if (s.horiz) g.fillRect(sx, s.side === 'N' ? sy : sy + (s.h >> 1), s.w, s.h >> 1);
      else g.fillRect(s.side === 'W' ? sx : sx + (s.w >> 1), sy, s.w >> 1, s.h);
      g.fillStyle = '#0b0912';
      if (s.side === 'N') g.fillRect(sx, sy, s.w, 1);
      else if (s.side === 'S') g.fillRect(sx, sy + s.h - 1, s.w, 1);
      else if (s.side === 'W') g.fillRect(sx, sy, 1, s.h);
      else g.fillRect(sx + s.w - 1, sy, 1, s.h);
    }
    this.arenaWall = { rim: RIM, thickness: T, sides };
  }

  // ---- weather rendering -----------------------------------------------------
  // WAVE-16 split: PARTICLES are world objects and ride the zoom transform
  // (drawWeatherParticles, called inside the world layer); the SKY (cloud
  // bands, the sun) is distant scenery and the tint is a screen wash — both
  // stay native 1x (drawWeatherSky, after the restore). Particles are STORED
  // in a bounded view-sized field (weather.js — wrapped, deterministic,
  // unit-tested) but RENDERED camera-anchored: the camera offset is applied
  // and re-wrapped, so rain falls past the player instead of sliding with
  // the screen. Cloud bands keep a light parallax (they're distant); the sun
  // is celestial and stays screen-fixed.
  drawWeatherParticles(g, weather, cam) {
    if (!weather || !weather.def.particles) return;
    const def = weather.def;
    const t = weather.time || 0;
    const wrapX = (v) => (((v - cam.x) % C.VIEW_W) + C.VIEW_W) % C.VIEW_W;
    const wrapY = (v) => (((v - cam.y) % C.VIEW_H) + C.VIEW_H) % C.VIEW_H;
    const P = def.particles;
    for (let i = 0; i < weather.particles.length; i++) {
      const p = weather.particles[i];
      // World-anchor: subtract the camera and re-wrap inside the view.
      const x = Math.round(wrapX(p.x)), y = Math.round(wrapY(p.y));
      if (P.shape === 'streak') {          // RAIN: 1x4 falling streaks
        g.fillStyle = 'rgba(90,138,216,0.7)';
        g.fillRect(x, y, 1, 4);
      } else if (P.shape === 'flake') {    // SNOW: 1x1/2x2 swaying flakes
        g.fillStyle = P.color;
        g.fillRect(x, y, p.size, p.size);
      } else if (P.shape === 'dash') {     // WIND: horizontal dashes
        if (Math.floor(t * 8 + p.phase) % 3 !== 0) {   // flicker
          g.fillStyle = 'rgba(174,191,208,0.55)';
          g.fillRect(x, y, 5, 1);
        }
      } else if (P.shape === 'firefly') {  // MOONLIGHT: blinking fireflies
        if (Math.floor(t * 2 + p.phase) % 2 === 0) {
          g.fillStyle = P.color;
          g.fillRect(x, y, 2, 2);
          g.fillStyle = 'rgba(216,255,176,0.4)';
          g.fillRect(x - 1, y - 1, 4, 4);
        }
      }
    }
  }

  drawWeatherSky(g, weather, cam) {
    if (!weather) return;
    const def = weather.def;
    const t = weather.time || 0;
    if (def.bands) {
      // CLOUDY: dark translucent bands scrolling down; slow parallax on y.
      // integ3: each band fades in and out over its 14 px (the hard edges read
      // as grey stripes on the snow), and on a light floor it is lighter still.
      const k = this.groundLight ? CLOUD_BAND_LIGHT : 1;
      for (let i = 0; i < 4; i++) {
        const y = Math.round((t * 8 + cam.y * 0.2 + i * (C.VIEW_H / 4)) % (C.VIEW_H + 20)) - 10;
        for (let s = 0; s < CLOUD_BAND_RAMP.length; s++) {
          g.fillStyle = 'rgba(20,22,35,' + (CLOUD_BAND_RAMP[s] * k).toFixed(3) + ')';
          g.fillRect(0, y + s * 2, C.VIEW_W, 2);
        }
      }
    }
    if (def.rays) {
      // SUNNY: corner sun disc + radiating ray dots (gentle pulse).
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.5);
      g.fillStyle = '#ffd75e';
      g.fillRect(C.VIEW_W - 26, 2, 12, 12);
      g.fillRect(C.VIEW_W - 30, 6, 20, 4);
      g.fillRect(C.VIEW_W - 22, -2, 4, 20);
      g.fillStyle = 'rgba(255,215,94,0.5)';
      for (let r = 0; r < 5; r++) {
        const a = Math.PI + (r / 4) * (Math.PI / 2);   // fan into the scene
        for (let d = 18; d < 90 * pulse; d += 6) {
          g.fillRect(Math.round(C.VIEW_W - 20 + Math.cos(a) * d),
                     Math.round(8 + Math.sin(a) * d), 2, 2);
        }
      }
    }
    // Scene tint last (rgba overlay value from the type table).
    if (def.tint) {
      g.fillStyle = def.tint;
      g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
  }
}
