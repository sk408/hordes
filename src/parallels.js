// HORDES — TIER-2(d): CARD PARALLEL/VARIANT SYSTEM (owner rulings: sports-card
// varieties). Owner, verbatim: "do like sports cards do and have varieties.
// Different looking cards. Shiny cards, pulsing cards, colored background
// cards, cursed cards" + "a cursed possibility sounds like a fun addition" +
// "Then we also need a blessed variant."
//
// ONE seam: a PARALLEL stamped on an existing card at OFFER time (seeded,
// weighted, deterministic; never mutates the base card definition). This module
// is PURE — no DOM, no wall clock, no rng of its own. src/main.js owns the one
// stamp call in openDraft (offer object) and the one effect-math call in pick.
//
//   COSMETIC (presentation + rarer offer weight ONLY; base effect byte-unchanged):
//     SHINY  — gold-foil treatment (palette foil ramp + diagonal glint band)
//     PULSE  — frame-phased shimmer (deterministic HASH phase, never wall
//              clock — the decor-still doctrine of src/enemy_sprites.js:169;
//              a still band whose offset is f(card id), so 60/120Hz is trivial)
//     CHROMA — rarity-family colored card background (the rarity.js encounter
//              tells are the family hues)
//   GAMEPLAY (polarity pair; effect scaling = tune-after defaults):
//     CURSED — card effect x1.5 + ONE shared drawback: flat HP loss on pick,
//              riding the EXISTING p.hp surface (src/entities.js makePlayer
//              player.hp / the one HP bar every heal and hit already uses).
//              ONE cost for every card — NO bespoke per-card curses, NO new
//              stat surface (hp is as old as the player object).
//     BLESSED — card effect x1.25, no drawback, much rarer offer weight.
//
// ART VARIANTS are DERIVED from the base motif programmatically (foil/chroma/
// pulse remap + a small stamped mark) — never 50 hand grids. Derivation only
// RECLOURS inked cells and REMAPS existing palette keys (same key set, new
// hexes), so the card silhouette and the one-rect-per-inked-cell renderer
// contract hold by construction, and deriving a variant never mutates
// CARD_ART (the registry stays byte-frozen — see the freeze note below).
//
// BASE REGISTRY FREEZE: nothing here writes UPGRADES / DRAFT_RARE_UPGRADES /
// DRAFT_MYTHIC_UPGRADES / RULES / SKILL_PERKS / REWRITES or any weight
// constant. A parallel is an additive field on the OFFER OBJECT the weighted
// draw already copied out of the pool ({...row, weight}), so the registry rows
// are never even reached by a stamp.
import { cardArt, SUIT_COLOUR } from './art/cards.js';
import { RARITY } from './rarity.js';

// ------------------------------------------------------------- registry -----
// Offer-weight economics, one weighted table (per 100 offered cards). The
// 'none' bucket is first and dominant — a parallel is a chase, not a flood.
// TUNE-AFTER (review phase adjusts; shipped coherent): any 15 per 100 offers
// carry a parallel; 3 per 100 are Cursed; 0.5 per 100 are Blessed — Blessed
// is strictly the rarest stamp (the owner's "much rarer"), Cursed is rarer
// than every cosmetic, and the three cosmetics are the common varieties.
export const PARALLEL_WEIGHTS = {
  none: 80,     // no stamp — the byte-identical plain card
  shiny: 8,
  pulse: 5,
  chroma: 3.5,
  cursed: 3,
  blessed: 0.5,
};
// Weighted-draw order ('none' first = the common case short-circuits first).
export const PARALLEL_ORDER = ['none', 'shiny', 'pulse', 'chroma', 'cursed', 'blessed'];
const PARALLEL_TOTAL = PARALLEL_ORDER.reduce((s, id) => s + PARALLEL_WEIGHTS[id], 0);

// The shared Cursed drawback: a FLAT HP loss on pick on the EXISTING p.hp
// surface (entities.js makePlayer `hp` — the one HP bar; no new stat). 15 of
// the 100 base max HP (C.PLAYER.MAX_HP). TUNE-AFTER. The loss floors at 1 HP:
// a pick must never kill mid-draft (OWNER-RULING parked: lethal picks are a
// ruling, not a default).
export const CURSED_HP_COST = 15;

// Effect multipliers (TUNE-AFTER): the card's listed numeric effect x mult.
// Cosmetic parallels carry mult 1 — base effect byte-unchanged.
export const PARALLELS = {
  shiny: {
    id: 'shiny', kind: 'COSMETIC', name: 'Shiny', weight: PARALLEL_WEIGHTS.shiny,
    mult: 1, tell: '#d4af37', blurb: 'gold-foil parallel',
  },
  pulse: {
    id: 'pulse', kind: 'COSMETIC', name: 'Pulse', weight: PARALLEL_WEIGHTS.pulse,
    mult: 1, tell: '#c8c8ff', blurb: 'shimmer parallel (hash phase)',
  },
  chroma: {
    id: 'chroma', kind: 'COSMETIC', name: 'Chroma', weight: PARALLEL_WEIGHTS.chroma,
    mult: 1, tell: '#6fd8ff', blurb: 'chroma parallel',
  },
  cursed: {
    id: 'cursed', kind: 'GAMEPLAY', name: 'Cursed', weight: PARALLEL_WEIGHTS.cursed,
    mult: 1.5, tell: '#c89aff',
    blurb: 'effects x1.5 - ' + CURSED_HP_COST + ' HP on pick',
  },
  blessed: {
    id: 'blessed', kind: 'GAMEPLAY', name: 'Blessed', weight: PARALLEL_WEIGHTS.blessed,
    mult: 1.25, tell: '#ffe066', blurb: 'effects x1.25',
  },
};
export const PARALLEL_IDS = Object.keys(PARALLELS);

// ----------------------------------------------------------------- roll -----
// ONE weighted draw per offered card. PURE: the caller supplies the rng —
// main.js rides state.parallelRng (mulberry32(choiceSeed ^ 0x9a11), the
// state.shrineRng pattern at main.js startRun), so the offer-weight draw's
// Math.random order is never perturbed by a stamp roll, ON or OFF.
// Returns null for the 'none' bucket (the absent roll: no stamp, ever).
export function rollParallel(rng) {
  const f = typeof rng === 'function' ? rng : Math.random;
  let r = f() * PARALLEL_TOTAL;
  for (const id of PARALLEL_ORDER) {
    if ((r -= PARALLEL_WEIGHTS[id]) < 0) return id === 'none' ? null : id;
  }
  return null;
}

// The additive stamp: a NEW offer object carrying one extra field. An absent
// roll returns the input untouched (identity, not a copy) so an unstamped
// offer is byte-identical to a pre-parallel offer — THE regression gate.
export function stampOfferParallel(offer, parallelId) {
  if (!offer || !parallelId || !PARALLELS[parallelId]) return offer;
  return { ...offer, parallel: parallelId };
}

// -------------------------------------------------------- effect math -------
// The multiplier that rides the pick's numbers. 1 for absent/cosmetic — every
// call site keeps its byte-identical literal at mult 1.
export function parallelEffectMult(parallelId) {
  const d = PARALLELS[parallelId];
  return d ? d.mult : 1;
}

// Apply a card's apply(player) with its NUMERIC deltas scaled by `mult`:
//   after = before + (rawAfter - before) * mult
// so a listed "+25%" at x1.5 lands as "+37.5%" (damage *= 1.375) and a listed
// "+25 max HP" lands as "+37.5 max HP" — the arithmetic proof the report
// quotes. At mult 1 this is EXACTLY apply(player), no snapshot, no rewrite.
// Non-numeric grants (boolean flags — Second Wind, rules, skills, rewrites —
// and discrete side effects like levelUpWeapon) have no fractional axis: they
// land at face value (OWNER-RULING parked in the report — no per-card
// special-casing). A numeric field the apply INTRODUCES (thorns: undefined ->
// 6) scales from 0. A scaled heal is clamped to the scaled max HP.
// TUNE-AFTER: integer-count stats (pierce, projectiles, draftOffers) may land
// fractional under x1.5/x1.25 — every consumer reads them as a bound (loop
// count, 1+pierce budget), so a 1.5 reads as the next whole step; an integer
// policy is a review-phase knob, not a silent rounding here.
export function applyScaledNumbers(applyFn, p, mult) {
  if (typeof applyFn !== 'function' || !p) return;
  if (mult === 1) { applyFn(p); return; }
  const hp0 = p.hp, mana0 = p.mana;
  const s0 = { ...(p.stats || {}) };
  applyFn(p);
  if (typeof hp0 === 'number' && typeof p.hp === 'number') {
    p.hp = hp0 + (p.hp - hp0) * mult;
  }
  if (typeof mana0 === 'number' && typeof p.mana === 'number') {
    p.mana = mana0 + (p.mana - mana0) * mult;
  }
  for (const k of Object.keys(p.stats || {})) {
    const b = p.stats[k];
    if (typeof b !== 'number') continue;
    const a = s0[k];
    const base = typeof a === 'number' ? a : 0;
    p.stats[k] = base + (b - base) * mult;
  }
  if (typeof p.hp === 'number' && typeof p.stats.maxHp === 'number') {
    p.hp = Math.min(p.hp, p.stats.maxHp);
  }
}

// The ONE shared Cursed drawback. Surface: p.hp (entities.js makePlayer) — an
// existing stat surface (the HP bar). Flat, every cursed card, no bespoke
// per-card curse. Floors at 1: a pick can never kill (see CURSED_HP_COST note).
export function cursedHpDrawback(p) {
  if (!p) return;
  p.hp = Math.max(1, (typeof p.hp === 'number' ? p.hp : 0) - CURSED_HP_COST);
}

// ------------------------------------------------------------- art ----------
// Deterministic hash (FNV-1a) — the ONLY phase source. NO wall clock: the
// decor-still doctrine (src/enemy_sprites.js:169 shape: phase = f(identity),
// never Date.now / accumulated dt), so PULSE captures and 60Hz vs 120Hz
// paints are byte-identical by construction.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export const PULSE_PHASES = 6;
export function pulsePhase(deckId) {
  return hash32('pulse:' + deckId) % PULSE_PHASES;
}

function hexRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbHex(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
}
function mixHex(baseHex, tintHex, t) {
  const a = hexRgb(baseHex), b = hexRgb(tintHex);
  return rgbHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
function scaleHex(baseHex, s) {
  const a = hexRgb(baseHex);
  return rgbHex([a[0] * s, a[1] * s, a[2] * s]);
}

// Frame keys (the one shared frame, src/art/cards.js frame()): 1 ink keyline,
// 2 parchment body, 3 shade, 4 suit pips. Motif keys start at 5. Jokers
// (fullArt) paint their body with the motif's key 5 (jokerFrame(5, 8)).
const frameKeys = (art) => (art.fullArt ? { ink: 1, body: 5, shade: 8, suit: null } : { ink: 1, body: 2, shade: 3, suit: 4 });

// Recolour only INKED cells — a variant never inks a transparent pixel and
// never drops ink (silhouette + ink-count contract hold by construction).
function recolorInk(grid, keyFor) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const k = keyFor(row[x], x, y);
      if (k) row[x] = k;
    }
  }
}

// Small stamped marks, recolouring inked cells only. The pip-free corners are
// top-right (x>=17, y<=12) and bottom-left (x<=6, y>=21) — pips live at the
// top-left (x<=6, y<=12) and rotated bottom-right (x>=17, y>=21).
const MARK_DIAMOND = [
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0],
];
const MARK_STAR = [
  [0, 0, 1, 0, 0],
  [0, 1, 1, 1, 0],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 0, 0],
];
function stampMark(grid, mark, cx, cy, key) {
  const h = mark.length, w = mark[0].length;
  const x0 = cx - (w >> 1), y0 = cy - (h >> 1);
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      if (!mark[ry][rx]) continue;
      const y = y0 + ry, x = x0 + rx;
      if (y < 0 || x < 0 || y >= grid.length || x >= grid[0].length) continue;
      if (grid[y][x]) grid[y][x] = key;
    }
  }
}

// CHROMA family tints. RARE/MYTHIC are the rarity.js encounter tells
// (RARITY.RARE.tell.outline '#6fd8ff' / RARITY.MYTHIC.tell.outline '#c89aff')
// lightened onto the background; CHASE is the deck's own red family
// (SUIT_COLOUR.red, art/cards.js) — the red joker's blood tone; COMMON is a
// moss-sand wash (the one family with NO tell — rarity.js COMMON carries none),
// rotated off the base parchment so a Chroma common still reads as Chroma.
function chromaTint(art) {
  if (art.tier === 'RARE') return mixHex('#ffffff', RARITY.RARE.tell.outline, 0.3);
  if (art.tier === 'MYTHIC') return mixHex('#ffffff', RARITY.MYTHIC.tell.outline, 0.3);
  if (art.tier === 'CHASE') return mixHex('#ffffff', SUIT_COLOUR.red, 0.3);
  return mixHex('#ffffff', '#8a9a4a', 0.3);
}

const DERIVE = {
  // Gold-foil: every key warmed onto a gold ramp (frame strongest, motif a
  // foil wash) + a diagonal glint band across the body/shade.
  shiny(grid, palette, art) {
    const fk = frameKeys(art);
    for (const k of Object.keys(palette)) {
      const key = Number(k);
      if (key === fk.ink) palette[k] = mixHex(palette[k], '#2e2408', 0.8);
      else if (key === fk.body) palette[k] = mixHex(palette[k], '#f0dc96', 0.82);
      else if (key === fk.shade) palette[k] = mixHex(palette[k], '#ffd24a', 0.88);
      else if (fk.suit && key === fk.suit) palette[k] = mixHex(palette[k], '#c8a020', 0.45);
      else palette[k] = mixHex(palette[k], '#d4a017', 0.35);
    }
    recolorInk(grid, (v, x, y) => ((v === fk.body || v === fk.shade) && (x + y) % 6 === 0) ? fk.shade : 0);
  },
  // Frame-phased shimmer: a still light band sweeping the card on the hash
  // phase. The band crosses the FRAME (keyline cells lighten to body) and the
  // body (lighten to shade/shimmer) — motif stays legible.
  pulse(grid, palette, art, deckId) {
    const fk = frameKeys(art);
    const phase = pulsePhase(deckId);
    for (const k of Object.keys(palette)) {
      const key = Number(k);
      if (key === fk.ink) palette[k] = mixHex(palette[k], '#1c1840', 0.75);
      else if (key === fk.body) palette[k] = mixHex(palette[k], '#c6c8ea', 0.55);
      else if (key === fk.shade) palette[k] = mixHex(palette[k], '#efe8ff', 0.9);
      else if (fk.suit && key === fk.suit) palette[k] = mixHex(palette[k], '#8090c8', 0.35);
      else palette[k] = mixHex(palette[k], '#a8a8d8', 0.25);
    }
    recolorInk(grid, (v, x, y) => {
      if (((x - y) % PULSE_PHASES + PULSE_PHASES) % PULSE_PHASES !== phase) return 0;
      if (v === fk.ink) return fk.body;
      if (v === fk.body || v === fk.shade) return fk.shade;
      return 0;
    });
  },
  // Rarity-family background: body + shade onto the family tint; frame, pips
  // and motif untouched (the rarity colour is the BACKGROUND story).
  chroma(grid, palette, art) {
    const fk = frameKeys(art);
    const tint = chromaTint(art);
    if (palette[fk.body] !== undefined) palette[fk.body] = mixHex(palette[fk.body], tint, 0.75);
    if (palette[fk.shade] !== undefined) palette[fk.shade] = mixHex(palette[fk.shade], tint, 0.55);
  },
  // Dark omen: ash-violet ramp + a curse diamond in the two pip-free corners.
  cursed(grid, palette, art) {
    const fk = frameKeys(art);
    for (const k of Object.keys(palette)) {
      const key = Number(k);
      if (key === fk.ink) palette[k] = mixHex(palette[k], '#140820', 0.85);
      else if (key === fk.body) palette[k] = mixHex(palette[k], '#2c223c', 0.85);
      else if (key === fk.shade) palette[k] = mixHex(palette[k], '#8a30d0', 0.85);
      else if (fk.suit && key === fk.suit) palette[k] = mixHex(palette[k], '#501878', 0.55);
      else palette[k] = mixHex(scaleHex(palette[k], 0.55), '#502078', 0.3);
    }
    stampMark(grid, MARK_DIAMOND, 19, 4, fk.shade);
    stampMark(grid, MARK_DIAMOND, 4, 29, fk.shade);
  },
  // Radiant: white-gold ramp + a halo just inside the frame + a star in the
  // two pip-free corners.
  blessed(grid, palette, art) {
    const fk = frameKeys(art);
    for (const k of Object.keys(palette)) {
      const key = Number(k);
      if (key === fk.ink) palette[k] = mixHex(palette[k], '#7a5c10', 0.75);
      else if (key === fk.body) palette[k] = mixHex(palette[k], '#fff4c8', 0.85);
      else if (key === fk.shade) palette[k] = mixHex(palette[k], '#ffe066', 0.9);
      else if (fk.suit && key === fk.suit) palette[k] = mixHex(palette[k], '#d8b020', 0.4);
      else palette[k] = mixHex(palette[k], '#fff0a0', 0.3);
    }
    const W = grid[0].length, H = grid.length;
    recolorInk(grid, (v, x, y) => {
      if (v !== fk.body && v !== fk.shade) return 0;
      return (x === 1 || x === W - 2 || y === 1 || y === H - 2) ? fk.shade : 0;
    });
    stampMark(grid, MARK_STAR, 19, 4, fk.shade);
    stampMark(grid, MARK_STAR, 4, 29, fk.shade);
  },
};

// Derived variant art for a deck card + parallel. Returns null for an unknown
// card or parallel (fail-safe, the cardArt() contract). The base art object is
// NEVER mutated: grid is copied, palette is a fresh object. Same key set as
// the base (pure remap — art-lint palette discipline holds by construction).
export function parallelCardArt(deckId, parallelId) {
  const base = cardArt(deckId);
  const derive = DERIVE[parallelId];
  if (!base || !derive) return null;
  const grid = base.grid.map((row) => row.slice());
  const palette = { ...base.palette };
  derive(grid, palette, base, deckId);
  return {
    id: base.id + ':' + parallelId,
    name: base.name,
    grid, palette,
    rows: grid.map((row) => row.join('')),
    w: base.w, h: base.h,
    rank: base.rank, rankClass: base.rankClass, tier: base.tier,
    suit: base.suit, family: base.family, motif: base.motif,
    fullArt: base.fullArt, joker: base.joker,
    parallel: parallelId,
    phase: parallelId === 'pulse' ? pulsePhase(deckId) : 0,
  };
}
