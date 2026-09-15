// HORDES — V1 THE ESCAPE SEQUENCE (owner-reframed 2026-09-14): config.
// Self-contained by design rule: the escape reads NO stats, NO draft, NO loot
// affixes, NO meta bonuses. Every number the mode uses lives HERE (or in the
// generator's own template tables) — never in p.stats. A maxed profile
// therefore cannot trivialise it; that is intended (docs/briefs/V1_ESCAPE_SEQUENCE.md).
import { CONFIG } from '../config.js';

// The virtual side-view viewport is the SAME virtual resolution the overhead
// renderer maps onto the backing store (C.VIEW_W x C.VIEW_H), so the escape
// inherits the renderer's dpr-integer transform and draws in virtual pixels.
export const VIEW_W = CONFIG.VIEW_W;   // 480
export const VIEW_H = CONFIG.VIEW_H;   // 300

// ---- the escape's OWN jump/z/gravity (owner-accepted 2026-09-15: the escape
// builds its own; G7's leap is explicitly NOT a prerequisite) ----
export const PHYS = {
  GRAVITY: 1000,     // px/s^2 downward
  JUMP_VY: 400,      // px/s initial jump impulse (airtime 0.8s, apex 80px)
  RUN_SPEED: 200,    // manual run speed (px/s) — FLAT, never a stat read
  DASH_SPEED: 340,   // the ONE verb: a short forward burst
  DASH_TIME: 0.18,
  DASH_COOLDOWN: 1.2,
};

// ---- corridor geometry band (a floor, a ceiling-ish limit, x one way) ----
export const BAND = {
  FLOOR_Y: 252,      // virtual-y of the base floor top (integer pixels)
  MIN_TOP: 120,      // ceiling-ish: no platform top may rise above this
  KILL_Y: 400,       // below this a fall is the soft failure 'fell'
};

// ---- pacing (docs goals: 4 acts over ~2 minutes; timings indicative) ----
export const PACING = {
  // Fractions of corridor length, in order. The generator RAMPS — it never
  // shuffles (a template's difficulty tier is a function of its act).
  ACTS: [
    { name: 'WARM-UP', from: 0.00, tier: 0 },      // flat, one easy gap
    { name: 'ESCALATION', from: 0.18, tier: 1 },   // terraces, harder gaps, fliers
    { name: 'ESCALATION+', from: 0.42, tier: 2 },
    { name: 'THE BOSS BEAT', from: 0.58, tier: 2, boss: true },
    { name: 'THE FINAL SPRINT', from: 0.66, tier: 3 },  // simplest terrain, max pressure
  ],
  NOMINAL_SPEED: 200,   // px/s the duration estimate divides by (see generator)
  MIN_SECONDS: 95,      // corridor length bounds derived from the ~2min target
  MAX_SECONDS: 135,
};

// ---- the horde wall (the real timer — visible, never an invisible clock) ----
// Tuned against the runner's TRUE average speed budget: base 200px/s plus the
// dash burned on cooldown (~+21px/s where terrain allows — auto.js burns it
// whenever no fire line is near). The wall stays UNDER that budget in every
// act (a completed run must always be possible) while staying ABOVE the bare
// 200 run (hesitation and dash-starved stretches lose ground — V3 218 gains
// 18px/s on a runner who stops dashing). A 252px/s final wall was measured
// UNBEATABLE: it runs down a full-dash runner mid-corridor (caught at ~55s
// across every seed).
export const WALL = {
  START_GAP: 300,      // px behind the player at t=0
  V0: 190,             // px/s at act 0
  V3: 212,             // px/s at the final sprint (max pressure)
  WIDTH: 46,           // the rendered wall body's leading edge thickness
};

// ---- threats (a shot or two kills ANY of them, FLAT — cosmetic-plus) ----
export const THREATS = {
  SHOT_EVERY: 0.35,    // auto-fire cadence (s)
  SHOT_SPEED: 420,
  SHOT_DMG: 1,
  PURSUER_HP: 1,       // one shot
  PURSUER_EVERY: 1.6,  // spawn cadence (s) — deterministic schedule, seeded jitter
  PURSUER_SPEED: 236,  // faster than the wall; they fall in gaps (the filter)
  PURSUER_R: 7,
  FLIER_HP: 2,         // two shots
  FLIER_EVERY: 2.6,
  FLIER_SPEED: 96,     // dives on a sine; ignores gaps (the gap-kiting counter)
  FLIER_R: 8,
  CONTACT_R: 11,       // any contact is the SOFT failure 'caught' — never death
  BOSS_W: 84,          // the obstacle-boss body (UNKILLABLE by construction)
  // BOSS_H must keep the body's top BELOW BOSS_PASS_Y - clearance: the overpass
  // is the authored route OVER the boss, and a runner standing on it at
  // BOSS_PASS_Y must read as ABOVE the body (sim.js: p.y > bossTop + 4 is the
  // caught test). 88 leaves a 20px margin AND stays too tall to cheese: a plain
  // floor jump apex (FLOOR_Y - 80 = 172) is still inside the body's span.
  BOSS_H: 88,
  BOSS_PASS_Y: 148,    // the pass platform OVER the boss (its approach terrace
  BOSS_PASS_W: 120,    // is authored by the BOSS template — see generator.js)
  BOSS_DESTROY_LEAD: 1.0,   // telegraph (s) before it tears out terrain BEHIND
  BOSS_DESTROY_EVERY: 4.0,
};

// ---- the exit (P1's portal entity + rules, reused — not a second lookalike) ----
export const EXIT = {
  // Contact radius + auto-only bounded i-frames come from the ONE portal
  // definition in the overhead config; contact ENDS the sequence immediately.
  RADIUS: CONFIG.PORTAL.RADIUS,
  AUTO_INVULN: CONFIG.PORTAL.INVULN,
  BEACON_H: 132,       // the visible beacon pillar height (legible from afar)
};

// ---- the payout (owner mechanism: bestGold x K, repeatable currency) ----
// K is ONE tunable constant (never stored, never derived — no division at
// read time, so the intOr floor trap cannot fire): K = 1/30 lands a completed
// escape near the owner's 1/3-of-rate intent (~40s of income for a 2-minute
// escape keyed to a ~20min best run).
export const PAYOUT_K = 1 / 30;

// ---- the paid skip (owner directive 2026-09-14: a one-time meta-shop unlock
// that lets the player skip AND still collect — a paid override of the
// "skip = forgo" rule, aimed at veterans; doubles as an economy sink) ----
export const PAID_SKIP = {
  SHOP_ID: 'escapeskip',
  PRICE: 100000,
};
