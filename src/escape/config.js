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

// ---- MAP EXTENT (owner directive 2026-09-17: "make the map quite a bit
// larger. I'd say if we call 1/4 of this map a unit, one more unit to the side
// and more unit up for a total of 5 more units" — 2x2 units -> 3x3 = 9) ------
// UNIT READING (confirmed against the shipped map before building): the
// escape is a ONE-WAY side-scrolling corridor, so the owner's 2x2->3x3 AREA
// reading maps onto the corridor's TWO world axes — the LENGTH ("one more
// unit to the side") grows 2 -> 3 units and the authored VERTICAL band ("one
// more unit up", the elevated paths) grows 2 -> 3 units. One unit is pinned
// in px as HALF of each axis of the shipped map: UNIT_W 3000 (the shipped
// corridor's guaranteed-minimum 6000px = exactly 2 units) and UNIT_H 66 (the
// shipped 132px authored band [MIN_TOP 120 .. FLOOR_Y 252] = exactly 2).
// The unit is EXTENT, not zoom: tile sizes, camera scale and sprite sizes
// are untouched — nothing looks smaller, there is just MORE corridor, with
// the new vertical unit spent on multi-level routes (generator deckSegment /
// stackSegment). PACING is likewise untouched: its act fractions and the wall
// ramp still shape the run; only the extent the ramp spans is units-based
// now, so the escape takes LONGER by construction (the task says report the
// duration/gold-per-second change, never retune it away).
export const MAP = {
  UNITS_X: 3,   // was 2 — one more unit to the side
  UNITS_Y: 3,   // was 2 — one more unit up (the elevated paths' budget)
  UNIT_W: 3000,
  UNIT_H: 66,
};

// ---- corridor geometry band (a floor, a ceiling-ish limit, x one way) ----
export const BAND = {
  FLOOR_Y: 252,      // virtual-y of the base floor top (integer pixels)
  // MIN_TOP derives from the vertical unit count (was the flat 120 = FLOOR_Y
  // - 2 units x 66): the third unit up admits the stacked elevated route.
  MIN_TOP: 252 - MAP.UNITS_Y * MAP.UNIT_H,   // 54
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
  // ELEVATED LANES (map scale-up 2026-09-17): a pilot at least FLIER_LANE_DROP
  // above the floor counts as ELEVATED (on a deck); fliers spawned then enter
  // the pilot's OWN lane (FLIER_LANE_Y above their head) instead of the sky —
  // the deck trades the ground horde for flier pressure. Cadence/speed/hp
  // UNCHANGED (the flier itself is not retuned); the keep-clear cap in sim.js
  // still forbids contact, so no unavoidable damage is introduced.
  FLIER_LANE_DROP: 40,   // px above FLOOR_Y that counts as "on a deck"
  FLIER_LANE_Y: 54,      // an elevated spawn's base offset above the pilot
  CONTACT_R: 11,       // any contact is the SOFT failure 'caught' — never death
  BOSS_W: 84,          // the obstacle-boss body (UNKILLABLE by construction)
  // BOSS_H is the body's rendered height; the V1e overpass constants are GONE
  // (the V1f grab finale runs the pilot past the body ON THE FLOOR — see GRAB).
  BOSS_H: 88,
  BOSS_DESTROY_LEAD: 1.0,   // telegraph (s) before it tears out terrain BEHIND
  BOSS_DESTROY_EVERY: 4.0,
  // ---- V1f THE GRAB, VK9P4 THE APPENDAGES (owner 2026-09-17: "It would be
  // nice for the boss to have multiple appendages. And maybe a slightly
  // shorter reach so manual players can see the boss to react to it"). The
  // boss stands OUT IN THE OPEN on the finale floor; its threats are now
  // THREE telegraphed appendages on ONE learnable cadence (GRAB_EVERY per
  // arm, STAGGERED by each arm's `offset` within the rhythm), each with its
  // own readable wind-up, contact ONLY while the arm is out (extend/hold) —
  // a pilot who has cleared an arm, or arrives during idle/windup/retract,
  // is structurally safe (no invisible hitboxes, no late grabs).
  //
  // THE REACH BOUND (the owner's "see the boss to react to it", made a
  // number): the camera shows [p.x-150, p.x+330] (CAM_LEAD 150, VIEW_W 480),
  // so a pilot reacting at the FARTHEST band edge (p.x = b.x - reach - r - 6,
  // the auto brake point) sees the boss's full body while
  //   reach + r + 6 + 150 + BOSS_W/2 <= 480  ->  reach <= 272 (fully on)
  // and any part of it while reach <= 372. Every arm is inside the FULL
  // bound with room; the CLAW was nonetheless shortened 150 -> 132 per the
  // owner's "slightly shorter" and its tell LENGTHENED 0.50 -> 0.65 (the
  // trade the task names: shorter reach, longer telegraph).
  //
  // THE COMBINED WINDOW (stated, per 2.4s cycle, ground arms only — the
  // sickle is airborne-only): tendril dangerous (0.50, 1.10], claw dangerous
  // (1.53, 2.00] -> the clear window is 0.90s (2.00 -> 2.90). The ground
  // gauntlet's x-span is [b.x-160, b.x-120] = 40px; the crossing costs
  // ~0.26s at run speed (~0.15s dashed) — survivable with >3x margin, and
  // the two ground arms are NEVER dangerous simultaneously.
  GRAB_EVERY: 2.4,     // the full cycle (s) PER ARM: idle + windup + extend + hold + retract
                       // (was 2.0 — three staggered arms need the longer rhythm; the
                       // per-arm cadence stays exactly this, so the beat is learnable)
  // The CLAW's numbers are the claw ROW of ARMS below (row 0) — the getters
  // keep the historical GRAB_* names reading ONE definition, so the V1f
  // seams/tests and the arm table can never drift apart.
  get GRAB_REACH() { return this.ARMS[0].reach; },     // was 150 — VK9P4 "slightly shorter"
  get GRAB_WINDUP() { return this.ARMS[0].windup; },   // was 0.50 — lengthened with it
  get GRAB_EXTEND() { return this.ARMS[0].extend; },
  get GRAB_HOLD() { return this.ARMS[0].hold; },
  get GRAB_RETRACT() { return this.ARMS[0].retract; },
  get GRAB_R() { return this.ARMS[0].r; },
  GRAB_HOLD_PILOT: 0.7,// the visible HELD beat before the soft outcome 'caught'
  // THE THREE APPENDAGES. `high` arms contact only an AIRBORNE pilot
  // (p.y <= FLOOR_Y - 70); ground arms only a pilot near the floor
  // (p.y > FLOOR_Y - 70) — the claw's own predicate, unchanged. `offset`
  // staggers the arm's phase inside the shared rhythm (seconds into the
  // first cycle). Row 0 IS the claw (see the getters above).
  //
  // `tipY` (REACH ROUTE 2026-09-18: owner "the boss reaching to grab the
  // pilot and the pilot being able to run past. Has to look convincing") is
  // the ONE named place for the extended tip's height ABOVE THE FLOOR: the
  // sim's held-pin, the draw's reach post and checkReachRoute's lane-margin
  // proof all read this row, so the grab can never be drawn short of (or
  // past) the body it claims to hold. Ground-arm tips sit INSIDE the
  // standing pilot's 17px body span (claw at the torso, tendril at the
  // ankles); the sickle's blade rides INSIDE its own air lane (heights
  // >= 70 — a blade drawn above the lane would be an invisible hitbox).
  ARMS: [
    { id: 'claw',    reach: 132, r: 12, high: false, offset: 0.0, tipY: 14,
      windup: 0.65, extend: 0.22, hold: 0.25, retract: 0.40 },
    { id: 'sickle',  reach: 96,  r: 14, high: true,  offset: 0.8, tipY: 76,
      windup: 0.70, extend: 0.20, hold: 0.25, retract: 0.35 },
    { id: 'tendril', reach: 150, r: 10, high: false, offset: 1.6, tipY: 6,
      windup: 0.95, extend: 0.30, hold: 0.30, retract: 0.50 },
  ],
  // ---- VK9P4 THE KICK (owner: "some sort of way for the pursuers to be
  // eliminated for manual players so they can take their time"). A MANUAL-
  // ONLY stomp that clears the chase pack on the runner's tail and holds the
  // horde floor down for a few seconds — BOUNDED, not an off switch: the
  // cooldown keeps it to a beat, the suppression window is shorter than the
  // cooldown, and the WALL (the real timer) never pauses. AUTO never kicks
  // (inputFor sets no kick), so the auto path is byte-identical. A wall
  // PACE control is deliberately NOT built — that is a separate owner
  // decision, flagged in the VK9P4 report.
  KICK_RANGE: 96,      // px behind the runner the kick reaches
  KICK_CD: 8.0,        // seconds between kicks
  KICK_SUPPRESS: 3.0,  // seconds the horde floor stops refilling after a kick
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
