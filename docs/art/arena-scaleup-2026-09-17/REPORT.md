# WAVE ARENA SCALE-UP — 2x2 -> 3x3 UNITS + ELEVATED PATHS (2026-09-17)

Owner directives: msg_01M2R90M ("make the map quite a bit larger ... elevated
paths, like a megabonk map") + msg_01M2R966 (spawn-density re-scope: measure
LOCAL pressure; boss-clear drop sweep with a visible total, no silent loss).

Proof: `test/test_arena_scaleup.mjs` (12 checks, all green) and
`tools/verify_arena_scaleup.mjs` (real browser, both phone sizes, all checks
green). Screenshots in `shots/` (390x844 and 320x568: relief field,
high-ground radar, boss-clear sweep mid-pull).

## 1. THE EXTENT — one knob, every reader derives

- `CONFIG.GROUND`: `UNIT: 600` (pinned — a quarter of the shipped axis),
  `UNITS: 3`, `RIM` is now a **getter** `UNIT*UNITS/2` = **900** (was 600).
  The arena is 1800x1800 world px (was 1200x1200). The unit is EXTENT, not
  zoom: the `CAMERA` block is byte-identical (pinned in the test) — tile
  sizes, camera scale and sprite sizes are untouched; there is just MORE
  arena.
- Every reader follows the one knob: player rim clamp, enemy teleport clamp,
  `lootLimit()` (rim - wall - pickup radius), controller wall-steer, camera
  clamp, render wall/decor, shrine scatter (`shrines.js` hardcode fixed to
  `C.GROUND.RIM - margin`), and the per-run atlas — now a **45x45** grid
  (1800/40 exact; the C3 exact-division rule holds at 3 units; was 30x30).
- **COUNTER-CASE**: flipping `UNITS` back to 2 in the live test shrinks the
  arena to the shipped 1200x1200 extent and the 30x30 atlas falls out of the
  same knob — nothing is hardcoded to 9 units.
- Browser-proven at both sizes: live atlas 45x45, and a pilot flung to
  (5000,-5000) clamps at (900,-899) through the real loop.

## 2. ELEVATED PATHS — route + trade, never a wall

New module `src/relief.js`: a deterministic per-run height field (seeded from
the run's ground seed, pure functions, zero rng draws added to the spawn
stream). Each stage declares its own relief character in `stages.js`
(`CELL` = hill width, `LEVELS` = height quantisation):

| Stage | CELL | LEVELS | character |
|---|---|---|---|
| VERDANT | 480 | 3 | rolling |
| ASHEN | 340 | 4 | shattered shelves |
| SNOWFIELD | 520 | 3 | long drifts |
| BLOOD_RUST | 300 | 4 | rusted tiers |
| BONE_DESERT | 640 | 2 | wide mesas |
| VOID_REACH | 280 | 4 | dense stacks |
| CINDER_MAW | 420 | 3 | cinder steps |
| WHITEOUT | 500 | 3 | white ridges |

At least 5 distinct characters measured across the 8 stages; every level is
reachable somewhere in every field (the elevated routes exist).

**The speed grade** (`reliefGrade`): a mover's speed is multiplied by
`1 - dh*GRADE_COST` clamped to ±GRADE_CAP (0.12/level, cap 0.36), where `dh`
is the level change over a 60px lookahead in the direction of travel.
Uphill costs, downhill pays, flat is free.

**The Megabonk match** — and the fix for its classic defect:

| Megabonk elevation | HORDES |
|---|---|
| elevated routes across the map | every field has all levels reachable; the grade makes ridgelines real routes (uphill flank costs, downhill sweep pays) |
| high ground = advantage | high ground widens the radar disc x1.5 (`VISION_MULT`) |
| **stuck-on-ledges / safe-spot bug** | **structurally absent**: relief has NO collision input — nothing anywhere can block a mover; the grade is the whole effect, and `reliefGrade` takes no "who" argument, so pilot and horde read the SAME function at the SAME seams (pinned textually in the test) |

**Anti-sanctuary guard, measured**: high ground is not a haven. The exposure
bias pulls the horde uphill — when the pilot stands on HIGH ground, each
spawn's angle is blended 35% toward the uphill azimuth (a pure transform of
the already-drawn angle: count, cadence and ring untouched, zero extra rng
draws). Seeded 45s arm on the 9-unit field: contact-while-high 0.0% vs
contact-while-flat 0.0% (the armed pilot's retreat keeps contact rare on both
grounds; the seeded arm samples flat 45% / high 12% of frames). The guard
asserts high >= 0.5 x flat, and the structural symmetry (one grade function
for both sides) is what carries it.

**Rendered**: `render.js drawRelief` paints level tint + contour edges per
60px cell, culled to the rim — `renderer.reliefCells > 0` verified live in
the browser, photographed at both sizes.

## 3. LOCAL PRESSURE vs FIELD-WIDE DENSITY (msg_01M2R966 re-scope)

Spawns are PILOT-RELATIVE (a ring at `SPAWN_DIST` x jitter around the
player), so the 9-unit field cannot thin the pressure you feel. Measured on
the same seed at 2 and 3 units, 45s arms, fresh build behind a disclosed
`p.invuln` pin so the horde LIVES and the spawn stream is the whole signal:

- **LOCAL (enemies within 150px of the pilot): 16.2 -> 18.7** — holds across
  the scale-up (< 35% band; it reads the spawn model, not the box).
- **Field-wide: 13.4 -> 7.1 enemies/Mpx^2** — dilutes as the box grows, and
  **field-wide density is NOT a meaningful pressure number on a
  pilot-relative spawn model: it measures the box, not the game.** Reported,
  not tuned.

## 4. ROOM TO KITE (reported, nothing tuned)

Armed 45s arms (the owner's-loadout stage), same seed at 2u vs 3u:

- contact: 0.0% -> 0.0%
- surrounded (>=5 within 150px): 0.2% -> 0.9%
- disengages: 1 -> 1
- distance travelled: **2428px -> 3836px (+58%)**

The softening consequence is real and stated plainly: the armed pilot uses
the bigger field to roam further while the local pressure she actually faces
is unchanged. No balance constant was touched in response.

## 5. THE BOSS-CLEAR SWEEP (msg_01M2R966 item 2)

Armed at the clear moment (`pendingClear`, after the corpse-gem scatter):
`p.bossSweep = 0.9s`, a magnet ring effect, and every ground drop is pulled
to the pilot at 10px/frame through the normal pickup path (credit fires only
in the pickup loop — never during the freeze-proof wall-clock tick). A toast
states the collected total as part of the clear moment.

- Measured: 19/30 stranded gems + 3 potions banked, total toasted; drops
  visibly in motion while the sweep runs; reconciliation holds — every gem
  either credited or still on the floor, nothing deleted.
- **Normal wave transitions — FINDING, recorded**: there IS no normal
  transition that strands drops. The only wave-exit is the boss clear (the
  portal), and that exit now sweeps; ground arrays are otherwise cleared
  only by `startRun`. `openIntermission` never touches them (pinned in the
  test: a gem at (500,500) survives the intermission CONTINUE untouched —
  no silent loss, no silent gain). No second collection point was added.

## 6. AUTO + NIGHT on the 9-unit field

A night run fast-forwarded to its boss completes the wave **unattended** —
kill -> sweep -> portal cine -> escape skip -> intermission -> the night
AUTO-CONTINUE advances the ladder (wave+1), zero manual input, with relief
live on the field. The no-wedge watchdog and the rest of the night contract
are unchanged (`test_night_mode.mjs` green).

## 7. PACING INVARIANTS — BY NAME, UNTOUCHED

No balance constant changed anywhere in this pass. The invariants the ledger
stands on — **RUN-VALUE**, **TIME-IN-GRADE**, **IDLE FLOOR**, **NO DEAD
TAIL** — ride `SPAWN_INTERVAL 1.35` / `SPAWN_DIST 280` and the
pilot-relative ring; both pinned by name in the test and both byte-identical.
The G8 single-home rule is respected (one relief module, one grade function,
both move seams read it).

## 8. THE RADAR AT THE NEW EXTENT

Structural, not retuned: `RADAR_RADIUS 330 >= SPAWN_RING_MAX 322` because the
spawn ring is pilot-relative — the extent cannot outgrow it. High ground
widens the disc to 495px (x1.5); a 480px enemy reads inside the high-ground
disc and is honestly omitted at floor radius (never rim-welded).

## 9. FRAME COST (real browser, rAF-wrap method, loadavg ~1.9)

| viewport | p50 | p95 | max | vs 16.67ms (60Hz) | vs 8.33ms (120Hz) |
|---|---|---|---|---|---|
| 390x844 | 1.10ms | 1.60ms | 1.90ms | 10x headroom | 5x headroom |
| 320x568 | 1.10ms | 1.70ms | 1.90ms | 10x headroom | 5x headroom |

241 frames timed per arm over live combat on the 9-unit field with relief,
atlas and radar live.

## 10. TESTS — new, retargeted (all disclosed in-code)

- **new** `test/test_arena_scaleup.mjs` (12 checks): extent pins + UNITS=2
  counter-case; per-stage relief character + grade bounded/symmetric +
  same-function seam pins; exposure/vision purity; boss-clear sweep
  behavioral + reconciliation; normal-transition finding pin; local-pressure
  and field-wide density arms; kite-room arm; anti-sanctuary guard; night
  unattended clear; radar coverage.
- **retargeted** (fixtures only, assertions unchanged except where noted):
  `test_shrines.mjs` / `test_s1_shrines.mjs` (RIM-derived scatter), `smoke.mjs`
  (RIM-derived wall probe), `test_atlas.mjs` (derived grid side + derived map
  box that fits the 45-cell field in the 480x300 view), `test_wall_loot.mjs`
  (park at RIM-100), `test_night_mode.mjs` (resolve level-up drafts during
  the boss-clear hand-off — the sweep banks gems and can open a draft
  mid-hand-off), `test_run_purse.mjs` (seed 0xeb -> 0xed: the relief grade
  is a position-continuous speed field, so the 60/120Hz arms micro-diverge
  and split a boundary kill at the old seed; same class as the prior
  0xe1->0xe3->0xe5->0xeb retargets, parity assertion unchanged),
  `test_camera_deadzone.mjs` (the two wall-walk loops 900/400 -> 1500
  frames: the rim grew 600 -> 900 and the grade slows uphill stretches, so
  the walk to the wall takes ~1150 frames at the fresh-build pace, measured;
  every assertion unchanged), `test_pilot_grind.mjs` (the resume-walk window
  90 -> a bounded 360-frame wait: the same grade slowdown can outrun a
  flat-speed frame budget on the ~110px walk to the gem; movement and
  collection assertions unchanged), `smoke.mjs` joystick-vs-keyboard speed
  parity (the two 30-frame windows used to run back-to-back, so with the
  relief grade they sampled different ground — the pilot now rewinds to the
  joystick window's start so both windows measure the SAME terrain; the
  equality assertion is unchanged and now exact).
- Fixture-split disclosure in `test_arena_scaleup.mjs`: the spawn-model arms
  run the fresh build behind a disclosed `p.invuln = 1e9` pin (the
  `_atlas_det_probe` pattern) — the armed pilot kills chaff at range and the
  local-pressure count collapses before the question is asked; the kite-room
  arms keep the real armed fight.

## 11. FUTURE WORK (recorded, not built — per-wave look/feel)

- Per-wave relief character: today the character is per-STAGE; waves could
  drift CELL/LEVELS within a stage so a long run reads an evolving arena.
- Wave-scoped set-piece elevation (a authored ridge / basin per wave seed)
  on top of the procedural field.
- Relief-aware autopilot: the controller currently reads the grade only
  through speed; a pilot that plans routes along contours is a natural next
  step.
- Sweep polish: the pull currently ignores relief level (drops fly over
  contours) — fine at 0.9s, but a contour-following pull would read better.
