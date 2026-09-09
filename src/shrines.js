// HORDES — WAVE-11/5: RUN SHRINES (Sk408-approved: gold spends mid-run for a
// random blessing). A shrine is a pixel altar that can appear once per wave;
// touching it with enough gold buys ONE random intermission-style blessing
// (choices.js semantics — blessing AND drawback, rarity-weighted).
//
// Purity contract: rolls only, no DOM, no game loop, never touches
// meta/profile — shrines exist per-run only (hb1 drops the shrine object on
// new run; nothing persists). All randomness goes through an injectable rng
// (mulberry32-compatible, weather.js contract) so tests + daily-seed runs
// replay exactly.
//
// PILOT-BLIND (chest/arch precedent): controllers.js never learns shrines
// exist. Placement rides the pilot's patrol orbit (controllers.js idles in a
// counter-clockwise orbit of the arena center, biased inward past 400px), so
// shrines spawn on a 250-420px ring around center — inside the rim, on the
// orbit path, and crossings happen by patrol, not by steering. Like arches,
// the shrine leans toward the player at ~6px/s (CONFIG.DRIFT.ARCH precedent)
// to close the last distance — hb1 owns that drift + the render; this module
// owns rolls + math only.

import { rollChoices } from './choices.js';

// ---------- tuning ----------
export const SHRINE_CHANCE = 0.6;          // ~60% of waves get one shrine
export const SHRINE_RING_MIN = 250;        // px from arena center (0,0)
export const SHRINE_RING_MAX = 420;        // (patrol orbit rides ~<=400; rim
                                           //  clamp is +-600 — always in-bounds)
export const SHRINE_BASE_COST = 60;        // gold, first shrine of wave 0
export const SHRINE_COST_PER_WAVE = 30;    // +30 gold per wave number
export const SHRINE_COST_USED_MULT = 1.25; // x1.25 per prior shrine THIS RUN

// ---------- roll --------------------------------------------------------------
// ~60% chance one shrine per wave (one rng draw for the gate, then radius +
// angle). Returns { x, y, used:false } on the patrol ring, or null. 3 rng
// draws total when it spawns, 1 when it doesn't — cadence tests rely on this.
export function rollShrine(wave, rng = Math.random) {
  if (rng() >= SHRINE_CHANCE) return null;
  const r = SHRINE_RING_MIN + rng() * (SHRINE_RING_MAX - SHRINE_RING_MIN);
  const a = rng() * Math.PI * 2;
  return {
    x: Math.round(Math.cos(a) * r),
    y: Math.round(Math.sin(a) * r),
    used: false,
  };
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
