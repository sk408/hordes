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

// ---- pacing (owner spec update 2026-09-15: a ~60-SECOND escape, not two
// minutes — SUPERSEDED 2026-09-17 by PLAYER REVIEW item 4: "Too long, not
// enough payout means I always click skip." The corridor is roughly HALVED
// (~33s nominal) and one act FOLDED: ESCALATION++ was tier 2 following a
// tier 2 act (ESCALATION+ runs straight to the sprint now, 5 acts -> 4) —
// the tier ramp itself is untouched, so wall/act/palette fractions and the
// generator's ramp all hold by construction) ----
export const PACING = {
  // Fractions of corridor length, in order. The generator RAMPS — it never
  // shuffles (a template's difficulty tier is a function of its act).
  // V1e (docs/briefs/V1E_ESCAPE_FINALE.md): the boss no longer interrupts
  // mid-corridor — the corridor ENDS at the boss, with the authored upper
  // level over it to the portal (generator finaleSegment).
  ACTS: [
    { name: 'WARM-UP', from: 0.00, tier: 0 },      // flat, one easy gap
    { name: 'ESCALATION', from: 0.18, tier: 1 },   // terraces, harder gaps, fliers
    { name: 'ESCALATION+', from: 0.42, tier: 2 },
    { name: 'THE FINAL SPRINT', from: 0.66, tier: 3 },  // simplest terrain, max pressure
  ],
  NOMINAL_SPEED: 200,   // px/s the duration estimate divides by (see generator)
  MIN_SECONDS: 30,      // corridor length bounds derived from the ~33s target
  MAX_SECONDS: 36,
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
// OWNER SPEC UPDATE (docs/briefs/V1D_ESCAPE_SPECTACLE.md, the section at the
// end SUPERSEDES the first cut): the horde is a LITERAL horde — a hard floor
// of live chasers, spawned slightly OFF-SCREEN behind the camera edge, that
// CHARGE in and then MATCH the pilot's speed just before reaching them, so
// they close to a hair, hang there, and contact is STRUCTURALLY impossible
// (losing is the WALL, not the horde). The V1d pack-cadence/lunge machinery
// is superseded by this spec.
export const THREATS = {
  SHOT_EVERY: 1.75,   // auto-fire cadence (s) — the owner's 1/5 cut (was 0.35)
  SHOT_SPEED: 420,
  SHOT_DMG: 1,
  PURSUER_HP: 1,       // one shot (a hit thins the pack; the floor refills)
  // MEASURED (spec2 first cut): a 236px/s charge closes only 36px/s on the
  // run — ~4s of uninterrupted same-floor travel, longer than any flat, so
  // chasers dived into gap lips before EVER matching (289/314 pitted,
  // settles=0: a horde that never hung on the tail). The charge is the
  // DASH speed: it closes the ~164px off-screen gap in under a second, and
  // the MATCH_FLOOR clamp still holds contact structurally impossible.
  PURSUER_SPEED: 340,  // the CHARGE (=== PHYS.DASH_SPEED; they fall in gaps — the filter)
  PURSUER_R: 7,
  // THE HORDE FLOOR: never fewer than this many live chasers, every step.
  CHASER_FLOOR: 3,
  // Spawn slightly OFF-SCREEN behind the camera edge (render.js CAM_LEAD
  // 150): a chaser must ENTER from outside the visible band, never pop in.
  SPAWN_OFFSCREEN: 14,
  // CHARGE then MATCH: inside MATCH_HOLD the chaser throttles to the pilot's
  // own run speed, and the hard MATCH_FLOOR keeps the gap above the contact
  // radius forever — a matched chaser can never overtake or pass through.
  // MEASURED (spec2): MATCH_HOLD must clear MATCH_FLOOR + one step of pilot
  // advance (200/60 = 3.3px) or the state machine OSCILLATES — the pre-move
  // gap never dips inside the band, the body clamps to MATCH_FLOOR while
  // still reading 'charge', and the settle (the readable near-miss tell)
  // never engages. 34 = 24 + 10 clears it with margin; the settle reads as a
  // near-catch at ~26-34px against the 11px contact radius.
  PURSUER_MATCH_SPEED: 200,  // === PHYS.RUN_SPEED (the pilot's pace)
  MATCH_HOLD: 34,      // gap (px) inside which the chaser settles
  MATCH_FLOOR: 24,     // hard minimum gap — > 2x the 11px contact radius
  MATCH_TELL: 0.45,    // s of settle flash (the readable near-miss tell)
  FLIER_HP: 2,         // two shots
  FLIER_EVERY: 2.6,
  FLIER_SPEED: 96,     // dives on a sine; ignores gaps (the gap-kiting counter)
  FLIER_R: 8,
  CONTACT_R: 11,       // any contact is the SOFT failure 'caught' — never death
  BOSS_W: 84,          // the obstacle-boss body (UNKILLABLE by construction)
  // BOSS_H is the body's rendered height; the V1e overpass constants are GONE
  // (the V1f grab finale runs the pilot past the body ON THE FLOOR — see GRAB).
  BOSS_H: 88,
  BOSS_DESTROY_LEAD: 1.0,   // telegraph (s) before it tears out terrain BEHIND
  BOSS_DESTROY_EVERY: 4.0,
  // ---- V1f THE GRAB (owner refinement 2026-09-17, msg superseding the
  // floating-bypass shape: "the boss reaching to grab the pilot and the pilot
  // being able to run past. Has to look convincing"). The boss stands OUT IN
  // THE OPEN on the finale floor; its one threat is a telegraphed GRAB: a
  // fixed cadence the player can learn by watching one cycle, a visible
  // WIND-UP tell, contact ONLY while the arm is out (extend/hold) — a pilot
  // who has cleared the arm, or arrives during idle/windup/retract, is
  // structurally safe (no invisible hitboxes, no late grabs).
  GRAB_EVERY: 2.0,     // the full cycle (s): idle + windup + extend + hold + retract
  GRAB_REACH: 150,     // the claw's full-extension x, LEFT of the boss center (px)
  GRAB_WINDUP: 0.50,   // the visible tell before the arm moves (the dodge window)
  GRAB_EXTEND: 0.22,   // the sweep out to full reach
  GRAB_HOLD: 0.25,     // claw closed at full reach (the contact window)
  GRAB_RETRACT: 0.40,  // the pull-back — NO contact in this phase, ever
  GRAB_R: 12,          // claw contact half-width (px)
  GRAB_HOLD_PILOT: 0.7,// the visible HELD beat before the soft outcome 'caught'
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
// read time, so the intOr floor trap cannot fire). K = 1/30 was parked at the
// 2026-09-15 60-second-escape spec ("DO NOT TUNE ... for a later balance
// pass"); PLAYER REVIEW 2026-09-17 item 4 IS that pass ("not enough payout
// means I always click skip") and supersedes the park: K = 1/15 with the
// corridor halved (~33s) puts a completion at >3.6x the old gold-per-second —
// 12000 bestGold banks 800 per completed escape (was 400 for ~60s).
export const PAYOUT_K = 1 / 15;

// ---- the paid skip (owner directive 2026-09-14: a one-time meta-shop unlock
// that lets the player skip AND still collect — a paid override of the
// "skip = forgo" rule, aimed at veterans; doubles as an economy sink) ----
export const PAID_SKIP = {
  SHOP_ID: 'escapeskip',
  PRICE: 100000,
};

// ---- V1d LOOK (owner: "needs some color to it. Like a pixel movie but as a
// playable"): the mode's OWN authored palette, four acts keyed on the same
// corridor fraction the wall speed reads, so the two-minute run TRAVELS —
// amber dusk into magenta twilight into violet night into a teal dawn as the
// portal nears. render.js never reaches into the arena's art; every colour
// the sky/bands/pits/poles use lives HERE. Selection is a pure function of
// progress (no clock, no rng), so 60/120Hz parity and the purity contract
// hold by construction.
export const LOOK = {
  ACT_FRACS: [0.18, 0.42, 0.66],   // act boundaries (wallSpeed's own keys)
  // ADOPTED 2026-09-17 (owner: "Variant b is good"): VARIANT B "SMOKE INFERNO"
  // from docs/art/escape-art-pass-2026-09-17/variants.mjs — a choked amber-red
  // dusk: near-black skyline, ember windows, thick haze, drifting light
  // shafts, the corridor still travelling dusk->dawn. This table is the ONE
  // home of every scene hex value (named keys, one act per row) — tune here,
  // never in render.js. `win` is the lit-window tone; `haze` the layer seams.
  PALETTES: [
    {   // act 0 WARM-UP — choked amber dusk
      skyTop: '#1c1016', skyBottom: '#6e2a20', horizon: '#ffb04a',
      far: '#2a1620', near: '#3a1c24', haze: '#d07040', win: '#ffe08a',
      voidGlow: '#ff9a4a', ember: '#ffcf6a',
    },
    {   // act 1 ESCALATION — deepening red smoke
      skyTop: '#180c12', skyBottom: '#5c2018', horizon: '#ff7a3c',
      far: '#241018', near: '#32161f', haze: '#c05a30', win: '#ffc06a',
      voidGlow: '#ff8a4a', ember: '#ff9a5a',
    },
    {   // act 2 ESCALATION+ / THE BOSS BEAT — magenta ember night
      skyTop: '#120a12', skyBottom: '#401a2c', horizon: '#e05a5a',
      far: '#1c0e20', near: '#281428', haze: '#a03848', win: '#ff9a9a',
      voidGlow: '#e05a5a', ember: '#ff7a6a',
    },
    {   // act 3 THE FINAL SPRINT — ember dawn (the portal's own light)
      skyTop: '#1c1410', skyBottom: '#6a4028', horizon: '#ffb04a',
      far: '#2a1a14', near: '#36241a', haze: '#d08a50', win: '#ffe0a0',
      voidGlow: '#5ae0b0', ember: '#ffb06a',
    },
  ],
  // The two poles are the BRIGHTEST things on screen (owner): emissive
  // treatments for the portal ahead and the horde's leading edge behind.
  PORTAL_HALO: '#60e0c0',   // matches the beacon column (EXIT light)
  HORDE_EDGE: '#ff6a3c',    // the wall's molten leading edge (hot in every act)
};
