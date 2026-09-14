// HORDES — WAVE-11/5: RUN SHRINES (Sk408-approved: gold spends mid-run for a
// random blessing). A shrine is a pixel altar; touching it with enough gold
// buys ONE random intermission-style blessing (choices.js semantics —
// blessing AND drawback, rarity-weighted).
//
// S1 (owner directive 2026-09-14, "rarer, across the entire map, not player
// specific, spawned on world creation like megabonk"): the shrines are a
// FIXED SET seeded ONCE at run start and static for the whole run — no
// per-wave roll, no drift toward the player, no respawn after use.
//
// Purity contract: rolls only, no DOM, no game loop, never touches
// meta/profile — shrines exist per-run only (hb1 drops the shrine objects on
// new run; nothing persists). All randomness goes through an injectable rng
// (mulberry32-compatible, weather.js contract) so tests + daily-seed runs
// replay exactly.
//
// PILOT-BLIND (chest/arch precedent): controllers.js never learns shrines
// exist. The pre-S1 ring placement rode the pilot's patrol orbit so AUTO runs
// crossed shrines by patrol; S1's whole-map scatter drops that coupling, so
// an AUTO/AFK run now meets FEWER shrines, sometimes none — accepted (the
// blessing is an optional bonus; the owner's power model is shop buyables).
// Placement itself takes no player argument — positions are a pure function
// of the run seed plus the arena bounds. hb1 owns the render; this module
// owns rolls + math only.

import { rollChoices } from './choices.js';

// ---------- tuning ----------
export const SHRINE_WORLD_COUNT = 3;       // fixed set per run (the "rarer" dial:
                                           //  measured, see S1 brief evidence 1)
export const SHRINE_WORLD_MARGIN = 40;     // px inside the +-600 rim so no
                                           //  shrine sits half-offworld
export const SHRINE_BASE_COST = 60;        // gold, first shrine of wave 0
export const SHRINE_COST_PER_WAVE = 30;    // +30 gold per wave number
export const SHRINE_COST_USED_MULT = 1.25; // x1.25 per prior shrine THIS RUN

// ---------- world seed --------------------------------------------------------
// S1: the set is chosen ONCE at run start off the run's shrineRng stream.
// Uniform scatter over the +-(600-MARGIN) box — integer pixels, no centre
// weighting, no radius band, no player-relative term (the function takes no
// player argument; corner-park invariance is a code fact). Exactly 2 rng
// draws per shrine (8 for the default set), then ZERO draws for the rest of
// the run — stepping waves consumes no randomness.
export function seedShrines(rng = Math.random, count = SHRINE_WORLD_COUNT) {
  const half = 600 - SHRINE_WORLD_MARGIN;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.round((rng() * 2 - 1) * half),
      y: Math.round((rng() * 2 - 1) * half),
      used: false,
    });
  }
  return out;
}

// ---------- cost curve --------------------------------------------------------
// cost(wave, used) = round((60 + 30*wave) * 1.25^used)
//   wave           = the wave the shrine appears on (0-based waveNum)
//   used           = shrines ALREADY PURCHASED this RUN (not this wave)
// Examples: (0,0)=60  (2,0)=120  (5,0)=210  (0,1)=75  (0,2)=94  (4,2)=281.
// The wave term keeps pace with run gold income; the 1.25^used term makes
// each extra shrine in a run a real budget decision (Sk408 build identity).
export function shrineCost(wave, alreadyUsedCount = 0) {
  const w = Math.max(0, Math.floor(wave));
  const n = Math.max(0, Math.floor(alreadyUsedCount));
  return Math.round((SHRINE_BASE_COST + SHRINE_COST_PER_WAVE * w) *
                    Math.pow(SHRINE_COST_USED_MULT, n));
}

// ---------- affordability -----------------------------------------------------
export function canAfford(gold, cost) {
  return (gold || 0) >= cost;
}

// ---------- blessing ----------------------------------------------------------
// ONE random offer via choices.js semantics: rollChoices(wave, rng, takenIds)
// draws 3 distinct rarity-weighted offers (excluding takenIds — pass every
// blessing id taken this run, shrines AND intermissions, for no repeats),
// then a final rng pick narrows it to one. Returns { offer, cost } where
// offer is the full choices.js shape ({id,title,desc,rarity,apply}) and cost
// is shrineCost(wave, takenIds.length). Returns null when the pool is
// exhausted (every blessing already taken this run).
//
// hb1 flow: on proximity, if canAfford(gold, blessing.cost) -> debit gold,
// applyChoice(player, offer), mark shrine.used, toast `offer.title — offer.desc`
// (desc already states blessing AND drawback). This module never mutates the
// player or the shrine — rolls only.
export function shrineBlessing(wave, rng = Math.random, takenIds = []) {
  const offers = rollChoices(wave, rng, takenIds);
  if (offers.length === 0) return null;
  const offer = offers[Math.min(offers.length - 1, Math.floor(rng() * offers.length))];
  return { offer, cost: shrineCost(wave, takenIds.length) };
}
