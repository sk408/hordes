# M1 - THE PER-RUN MAP SCREEN (hotkey + touch, visited areas only) - BUILD BRIEF

**Slice:** M1, EXECUTION ORDER item 10 (`docs/HORDES_GOALS_2026-09-12.md:1162-1164`:
`H1 -> P1 -> A1 -> A2 -> E1 -> W7a -> W7b -> E2 -> S1 -> M1 (the per-run map screen, which also lands the
visited-grid A2 needs) -> the ranked queue`). Goal entry `docs/HORDES_GOALS_2026-09-12.md:1369-1408` -
READ IT IN FULL before starting; the owner quote, the "one system at two scales" rule and the design
tension are reproduced below in substance, but the source file is authoritative.
**Builder:** `cli:kimi-hordes-g8`.
**Brief authored by:** the goal pilot, 2026-09-14, at HEAD `f50f1a6`. **DISPATCH-VERIFIED 2026-09-14 by
the goal-pilot tick on the post-S1 tree `4d79210` (CLEAN, dirty=0; W7b + E2 + S1 all landed and committed
by the orchestrator). Every anchor below was re-resolved on `4d79210`; the two that drifted
(`src/main.js:4413`->`:4618` groundSeed roll, `src/main.js:260`->`:266` groundSeed declaration) are already
corrected in place. Dispatch-check results: (1) tree clean; (3) suite `SUITE greenfiles=87 redfiles=0`;
(4) POST-S1 SHRINE SEAM CONFIRMED: `src/main.js:4608-4611` rolls `state.shrineRng = mulberry32(state.choiceSeed
^ 0x5eed)` then `state.shrines = seedShrines(state.shrineRng)` in `startRun` - the FULL set of
SHRINE_WORLD_COUNT=3 (`src/shrines.js:29`) static world positions exists at run start as `state.shrines`
([{x,y,used,blessing...}]); M1's landmark registry READS that array, never re-rolls; (5) RIM 600 +
VIEW_W/H 480/300 confirmed; (6) `tools/verify_h1_pad_reflow.mjs` PINS `#touch .pad` left/right geometry AND
every `#touch .pad button` (act + w/h/x/y) across 12 live states - a MAP button added to a PAD retargets it
(must be enumerated, never weakened); A2 dodged this by putting RADAR in the COG row (`index.html` third
cog-row button) - prefer that placement; (7) `src/radar.js` still exports `radarDots` (:144 area) +
`classifyTier` (:76), A2's 104x104 bottom-left integer-span box intact in `src/render.js`.**
**Ordering:** M1 may NOT run in parallel with W7b, E2 or S1 (all four touch `main.js` / `config.js` /
`index.html` surfaces). M1 runs AFTER S1 lands, because S1 changes how shrines are seeded and shrine
positions are M1's ONE wired landmark source.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain` - record the line count and state whether the tree is clean.
2. Resolve every `file:line` anchor below and CORRECT any that drifted, IN PLACE in this file.
3. RUN `bash tools/run_suite.sh` and paste its verbatim final line under MEASURED CURRENT BEHAVIOUR.
   If it does not end `redfiles=0`, STOP - M1 is not issued on a red tree.
4. POST-S1 SHRINE SEAM (this one decides R5): find how shrines are seeded after S1 and where the FULL
   set of shrine world positions exists at run start. M1's landmark registry must READ that seam - it
   may not re-roll, mirror or duplicate shrine placement. If no readable seam exists, retarget R5 to
   whatever S1 does expose and SAY SO in the brief before issuing.
5. Confirm the arena constants on the dispatch tree: `CONFIG.GRID.RIM === 600` (`src/config.js:418`,
   the comment at :419 ties it to main.js's +-600 player clamp), `CONFIG.VIEW_W/H === 480/300`
   (`src/config.js:20-21`), `state.groundSeed` still rolled in `startRun` (`src/main.js:4618`), and the
   player clamp still +-600. The arena is 1200x1200 world px in world coords -600..+600.
6. Confirm `tools/verify_h1_pad_reflow.mjs` still exists and PASSES, and read WHAT IT ENUMERATES. If it
   counts cog-row / #touch buttons or otherwise pins `index.html` HUD geometry, then adding a MAP button
   WILL retarget it: that retarget must be enumerated by the builder (file + line + why), never weakened.
7. Confirm `src/radar.js` still exports `radarDots` + `classifyTier` and that A2's radar box is still the
   fixed 104x104 bottom-left HUD box in `src/render.js` (A2 landing note: `docs/HORDES_GOALS_2026-09-12.md:1339`).

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If a change legitimately invalidates an assertion,
  RETARGET it to the new invariant and SAY SO (file + line + why). Enumerate EVERY retarget in your
  report. A retarget you do not enumerate is a defect. Widening a cohort until a marginal bar clears is
  tune-until-pass and is FORBIDDEN.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep and
  quote in the report. A builder self-report is a claim; the pilot re-measures on the artifact.
- **No emojis** anywhere (owner UI rule). **Integer pixels only** - no `ctx.arc`, no anti-aliased circle
  edge, no blur. A2's anti-aliased arc was a failed delivery on that bar and was rebuilt from integer
  `fillRect` spans; M1 inherits that rule.
- **60Hz AND 120Hz must both be correct.** Nothing may assume a fixed dt.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock before your first edit and release it when done.
- **Scope bound** is at the bottom of this brief and is enforced literally. If you believe a change
  outside the list is required, STOP and report instead of making it.

## THE OWNER DIRECTIVE (verbatim)

Sk408: *"I meant per run maps, and here's why. In the future we can add landmarks with special shrines or
chests or anything like that and we can also seed valuable drops that when you collect all 5 or something,
you get a powerful weapon."*

The goal doc's own framing, which M1 must honour: **the map is not fog-of-war for its own sake - it is the
UI for a place-of-interest system**; the per-run re-seed (`groundSeed`) is a FEATURE (every run is a fresh
place to explore); and **A2 and M1 are one system at two scales** ("Do not build two independent trackers;
a landmark the player has found is the same datum in both views").

## PILOT CALLS (implement these unless the owner says otherwise)

**C1 - THE MAP DOES NOT PAUSE THE SIM.** A pausing map is a free dodge button, and it would freeze AUTO
runs and shift every run-length and balance number this project measures. So the sim keeps running while
the map is open. The consequence is real and must be stated plainly in the report, not hidden: the map is
OPAQUE over the field, so opening it mid-swarm is dangerous by design. The touch pads stay tappable (they
are DOM buttons above the canvas), so the player can still steer blind and close it. This is a deliberate,
owner-overridable call - flag it as such.

**C2 - ONE TRACKER, TWO SCALES.** The visited-grid + discovered-landmark data lives in ONE new pure-data
module, `src/atlas.js` (no DOM, no canvas, no timers, no `Math.random`, no `dt` - the `src/radar.js` house
style, which is what makes it headless-testable). `radar.js` remains the enemy-dot maths layer; the radar
GAINS markers for nearby DISCOVERED landmarks read from the atlas. The map screen reads the same atlas.
There must be exactly ONE visited array and ONE landmark set in the whole program.

**C3 - GRID GEOMETRY, INTEGER.** `MAP_CELL = 40` world px over the 1200x1200 arena = a **30x30 = 900-cell**
grid (1200/40 = 30 exactly, which is why 40 was chosen). Index rule, stated so a test can assert it:
`cx = clamp(floor((wx + 600) / 40), 0, 29)`, `cy` the same on `y`. Storage: `Uint8Array(900)`. Visit
marking: a cell is marked when the player is within `VISIT_RADIUS` of it, evaluated every frame from
`state.player`; recommend `VISIT_RADIUS = 300` (>= the half-diagonal of the 480x300 view, so it marks what
the player has actually seen rather than only the cell he stands in). The three constants (`MAP_CELL`,
`VISIT_RADIUS`, `DISCOVER_RADIUS`) live in `src/config.js` and nowhere else.

**C4 - RUN-SCOPED, NO SAVE CHANGE.** The atlas is created/reset in `startRun` next to `state.groundSeed`
(`src/main.js:4618`) as `state.atlas`. It is never serialised: **no save schema change, no migration, no
version bump.** A loaded save simply starts a run with a fresh atlas - the owner-confirmed per-run reading.

**C5 - THE LANDMARK SEAM, WITH EXACTLY ONE REAL SOURCE WIRED.** `registerLandmark({kind, x, y})` exists on
the atlas, `kind` drawn from a reserved set (`'shrine'`, `'chest'`, `'rare'`, `'quest'` - only the first is
used now). Registration happens once at run/world seed time, never per frame. Discovery flips when the
player comes within `DISCOVER_RADIUS`; the map draws DISCOVERED landmarks only and the radar draws nearby
discovered ones. **The ONE source wired in this slice is the S1 world-seeded shrines** - static, already
present post-S1, and the goal names shrines as landmark #1. **Do NOT build the collectible set, the
5-piece quest, or any reward/weapon** - the goal explicitly defers those to a separate goal. M1 adds no
new content.

**C6 - INPUT: A HOTKEY IS NOT ENOUGH, THE OWNER PLAYS ON A PHONE.** Required: `m` toggles the map, added to
`REPEAT_GUARDED` (`src/main.js:5089`) and to the in-game legend line. Also required: **a touch entry
point**, because a keyboard-only map is a non-feature on the owner's device. Preferred placement is one more
button in the existing cog row (`index.html`) - the same trick A2 used for its RADAR button - and it must
NOT move the H1 pad geometry. If a 4th cog button reflows the pads, the fallback is a MAP button in the top
HUD region that likewise leaves the pads untouched; either way `tools/verify_h1_pad_reflow.mjs` must still
pass with the pads byte-identical (96x286 pads, 8 buttons 96x64, over every live state it enumerates). The
map opens CLOSED by default and nothing else may open it.

**C7 - DRAW IT IN THE RENDERER, INTEGER SPANS, FIXED GEOMETRY.** `drawAtlasMap(...)` in `src/render.js`,
called from the existing draw path only while the map is open. 900 cells drawn as integer `fillRect` spans:
recommend an 8x8 px cell on the 480x300 view = a 240x240 px map, integer-centred, fully inside the view,
with haze as a second rect pass (no per-cell string work, no gradients, no `arc`). The map is a READ of
state plus the atlas: it must never write sim state, never advance a timer, and its cost must be reported in
ms/frame.

## MEASURED CURRENT BEHAVIOUR (dispatch-verified on the post-S1 tree `4d79210`, clean)

- Suite on the dispatch tree, verbatim: `TREE: /home/claude/projects/hordes @ 4d79210 | dirty=0` /
  `SUITE greenfiles=87 redfiles=0`.

- Arena: 1200x1200 world px, world coords -600..+600 (`src/config.js:418-419`, RIM 600; player clamp +-600
  in `src/main.js`; ground decor `GRID.CELL 32` / `LANDMARK_CELL 192` at `src/config.js:414,433`).
- View: 480x300 logical px (`src/config.js:20-21`), scaled to the device by `src/main.js:169-172`.
- Per-run ground seed: `state.groundSeed = (Math.random() * 1e9) | 0` rolled in `startRun`
  (`src/main.js:4618`); declared at `src/main.js:266`.
- Existing full-screen furniture: `#overlay` (DOM, `src/main.js:128`) toggled by `overlay.style.display`
  at several call sites, plus canvas-drawn HUD boxes. There is NO map screen and NO visited-grid anywhere
  in `src/` today (a grep for `visited` returns only unrelated comments).
- A2 landscape: `src/radar.js` is pure maths (`radarDots`, `classifyTier`), pinned by
  `test/test_radar.mjs`; its HUD box is a fixed 104x104 bottom-left integer-span box in `src/render.js`.
- Post-S1 shrine state: `state.shrines` is a fixed array of SHRINE_WORLD_COUNT=3 altars, seeded once in
  `startRun` (`src/main.js:4611`) from `state.shrineRng`, integer px, STATIC for the whole run (zero drift,
  no per-wave roll). Each entry carries `x, y, used` and a lazily-cached `blessing`. `state.shrines = []`
  is set by the WAVE-11 guard (`src/main.js:6015`).
- Suite: `bash tools/run_suite.sh` must end `redfiles=0` - quote the REAL final line measured on your tree.

## THE DESIGN TENSION THIS SLICE MUST FLAG, NOT PAPER OVER

The goal doc states it: this is a horde survival game, **standing still is death**, the arena is ~10 screens
(1200x1200 against a 480x300 view) and a fresh run dies in ~35s, so "exploration" only becomes reachable
once a loadout produces long runs. The report must therefore answer with numbers, not opinion:

- **How much of the map does a real run actually see?** Report visited-cells/900 after a fixed-length
  real-loop run (>= 60s) as a raw number, not a word like "most".
- **How many landmarks does a real run actually discover?** Report landmarks discovered per run over >= 8
  runs on >= 2 profiles including a developed/maxed one. If S1's rarity makes the honest answer 0 or near-0,
  **report that number and do not tune shrine density** - density is S1's call and out of this brief's scope.
- **Is the map reachable before a run is decided?** State whether the visited area at the moment a fresh run
  dies is a usable map or a handful of cells.

## REQUIREMENTS

- **R1 - ONE TRACKER.** `src/atlas.js` is the only visited/landmark tracker in the program. Evidence: a grep
  showing one visited array and one landmark set, plus a statement that `radar.js` and the map read the same
  datum.
- **R2 - ZERO RNG DRAWS.** The atlas consumes no `Math.random()` draws, ever. Load-bearing: one extra draw at
  run start would shift the ground/spawn stream and silently invalidate every balance number already
  measured. Prove it: a seeded run's enemy/spawn stream and run summary are IDENTICAL with the atlas enabled
  and disabled (same seed, same length).
- **R3 - GRID CORRECTNESS.** Headless test `test/test_atlas.mjs`: a synthetic straight-line walk marks
  exactly the expected cell SET (assert the set, not a count); a rim path clamps at 0 and 29 and never writes
  out of bounds; a cell outside `VISIT_RADIUS` is NOT marked; re-visiting is idempotent; the array never grows.
- **R4 - DISCOVERY.** A landmark flips to discovered exactly when the player crosses `DISCOVER_RADIUS`
  (assert both sides of the boundary, and that an undiscovered landmark is drawn nowhere).
- **R5 - THE SHRINE SEAM.** Landmarks are registered from S1's seeded shrine positions at run start - one
  registration path, no re-roll, no mirrored shrine constants, no per-frame registration. Name the seam you
  read and quote the code in the report.
- **R6 - TOUCH + KEY, CLOSED BY DEFAULT.** A real tap on the MAP button opens the map; a real `m` key toggles
  it; the map is closed at boot and nothing else opens it; the H1 pad pin still passes.
- **R7 - NO PAUSE, NO SIM WRITE.** The sim keeps ticking while the map is open (assert `state.time` advances
  while the map is open by more than the frame delta), and the atlas/map path writes nothing except the
  atlas's own visited/discovered flags. `src/controllers.js` is NOT touched and the AUTO pilot still knows
  nothing about the atlas - say so plainly in the report.
- **R8 - REAL-BROWSER EVIDENCE, 390x844 @dpr3.** `tools/verify_m1_map.mjs` in real Chrome at 390x844 @dpr3:
  set all 19 `TOUR_KEYS` and assert `state.time > 1.0` BEFORE measuring anything; capture
  closed-long-run -> open -> closed; assert the two closed captures are BYTE-IDENTICAL (the restore proof)
  and the open-vs-closed captures differ; save `docs/art/browser-verify-2026-09-12/m1-map-phone.png`
  (1170x2532) and READ IT BACK - a code claim is not evidence for something the player looks at. Report the
  map's draw cost in ms/frame at both 60 and 120 Hz semantics.
- **R9 - SUITE + RETARGETS.** `bash tools/run_suite.sh` must end `redfiles=0` - quote the verbatim final line,
  keep every new test, and enumerate EVERY fixture retarget by file + line + why (an unenumerated retarget is
  a defect). Do not weaken the H1 pin or the radar pin to accommodate the new button.

## SCOPE BOUND (literal)

**IN:** NEW `src/atlas.js`; NEW `test/test_atlas.mjs`; NEW `tools/verify_m1_map.mjs`; `src/main.js` (state
init/reset in `startRun`, the `m` hotkey + `REPEAT_GUARDED`, the legend line, the per-frame atlas update call,
the button id wiring); `src/render.js` (`drawAtlasMap` + the radar's nearby-landmark markers, fixed integer
geometry only); `src/config.js` (the three new constants ONLY); `index.html` (ONE MAP button, and only if it
does not move the H1 pad geometry); `test/test_radar.mjs` ONLY if the radar's landmark read requires a
retarget, which must then be enumerated.

**OUT (do NOT touch):** `src/controllers.js` (the pilot-blind contract lives there), `src/portal_cine.js`,
`src/shrines.js` PLACEMENT (S1 owns it - M1 only reads seeded positions), `src/weapons.js`, the shop, the
draft / `src/choices.js`, the difficulty ladder, `src/save.js` (no schema change), and any new landmark or
collectible CONTENT or reward. If you believe a change outside this list is required, STOP and report.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, with the new tests present.
2. `node test/test_atlas.mjs` (or the runner's equivalent) green with the asserted CELL SETS printed.
3. `node tools/verify_m1_map.mjs` PASS in real Chrome at 390x844 @dpr3 with the R8 checks, and the quoted raw
   output for: state.time asserted before measuring, byte-identical closed captures, the open-vs-closed pixel
   delta, and the ms/frame draw cost.
4. The R2 determinism proof (identical seeded run with the atlas on and off).
5. The measured numbers of the DESIGN TENSION section, printed, not paraphrased.
6. The H1 pad pin still passing, with the retarget (if any) enumerated.
7. A written statement of (a) the no-pause call and its risk, (b) that the AUTO pilot is still blind,
   (c) anything you could NOT verify.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with its raw
output; every retarget (file + line + why); the flag list (no-pause occlusion, shrine-discovery rarity if low,
anything unverified); and the explicit statement that no git state command was run.
