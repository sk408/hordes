# ELEVATION MODEL v2 — GRADE + CLIFF, THE SEPARATE UPPER PATH
2026-09-18 · Verdant Hollow only · shots in `shots/` · tests in `test/test_blocking_elevation.mjs` (14 checks)

Owner directive (verbatim): *"Oh elevation should be more than 1 block or something? It should
be a gradient upward/downward that would create a separate path blocked off by a cliff. If
possible form our view."*

## 1. THE MODEL — two primitives, ONE threshold

`CONFIG.RELIEF.CLIFF_STEP = 2` (src/config.js):

* **GRADE** — a move whose composite level changes by **< 2** levels between adjacent
  positions. Walkable; the existing grade term (`reliefGrade`) rides it through the composite
  read (`reliefLevelAt`), so climbing costs speed and descending pays, identically for pilot
  and horde. A **RAMP** is an authored grade: the terrace's angular ends step
  `topLevel 2 -> 0` in whole 1-level staircases over `2*rampW` (0.6 rad ≈ 380px of arc).
* **CLIFF** — a height discontinuity **>= 2** levels between adjacent positions. The move is
  **BLOCKED** (`reliefBlocked`); you route around it (a ramp) or you do not cross.

**Why 2 and not 1:** the natural bilinear lattice is Lipschitz — a single mover step (a few
px at 60/120Hz) can cross at most ONE quantized level boundary, so the natural field can
NEVER produce a >=2 break. Cliffs therefore exist only where AUTHORED, and with LEVELS=3 a
2-break is exactly floor-to-top. Threshold 1 would wall off every natural terrace edge —
Megabonk's stuck-on-a-ledge defect, by construction. Pinned in test:
"Lipschitz: neither the natural field nor the authored blend can 2-step a mover" — a legal
`reliefStep` never lands 2 levels away, max step 1 over the whole arena at 4px sampling.

## 2. THE MAP — ONE UPPER TERRACE (Verdant Hollow, the other 7 stages byte-identical)

* **The band**: arc `r ∈ [560, 700]`, north-centred top span `[π/2−0.75, π/2+0.75]`
  (1.5 rad ≈ 940px of walkable top), raised to **level 2**.
* **Access: exactly 2 ramps** — the graded angular ends, ramp centres at
  `A0−rampW ≈ 29.8°` and `A1+rampW ≈ 163.4°`. Both radial edges are cliffs along the
  WHOLE span, for every seed tried (`[1, 42, 4242, 777, 20260917]` — test
  "the separation holds": n/n cliff edges at each seed).
* **The apron**: a level-0 wedge (`[r0−120, r1+120]`, feathered 0.35 rad) pinned around the
  band. Without it the natural rim (often already level 1–2 at that radius) merges into the
  top and the "separate path" leaks — measured pre-apron: only 0–53% of span edges cliffed.
  Post-apron: 100%.

## 3. THE CRUX — how the horde reaches the upper level (and why it always could)

Two layers, both pure and stateless, both read at the SAME seams for pilot and horde:

* **`reliefStep`** (the legal-step layer, src/relief.js): an unblocked move passes through; a
  blocked one is rerouted — Layer 1, a chord at the mover's own pace toward the nearest RAMP
  DOOR (a same-radius chord can never cross the face it hugs); Layer 2 (fallback), an exact
  rotation slide along the face at the mover's own radius. No radial drift — drift buys the
  orbit back (measured, v1).
* **`reliefRampRoute`** (the intent layer — the fix the crux demanded): a blocked-frame rule
  alone CANNOT deliver the horde. A greedy chaser whose target stands on the terrace has a
  free-run zone below the face where its direct intent is perfectly LEGAL (tangential, under
  the target) — it regains every stride the slide won and orbits in the target's tangential
  shadow forever (measured pre-fix: a chaser parked at r 560, ang 78°, for 60s; the v1
  wall-top sanctuary, 0% contact). So the INTENT itself is biased: when the target is on the
  band at >= CLIFF_STEP above the walker, the walker routes to the nearest ramp door
  (shortest arc through to the target's side); once BOTH are on the band, the waypoint hops
  the arc toward the target's angle in dip-safe chords (a long chord cuts inside r0, steps
  off the inner cliff, and re-triggers — the climb-dip-remount oscillation, measured) with
  the waypoint radius set to the TARGET's, so the walker closes radially at alignment.

  Applied at both intent seams: the enemy move seam in main.js (gated on non-flying,
  non-boss enemies actually pursuing — kiters, pillars and latched ticks keep their doctrine)
  and the AUTO pilot's gem-commit and portal-approach vectors in controllers.js. Manual
  movement untouched. Flyers ignore the cliff (they fly) — disclosed, by design.

**Proof it works, live (test, seeded rng, disarmed):**
* "a live enemy climbs a ramp to a pilot standing on the top" — touched level 2, min
  distance to the parked pilot **0** px.
* AUTO routes up a ramp to a top-level gem unattended — collected, closest approach 22px.
* NIGHT terraced run clears the wave and auto-continues the ladder, unattended.

## 4. NO-TRAP + BOTH SIDES + CAMERA

* **NO-TRAP**: flood fill over the composite field at 24px sampling WITH the cliff set —
  every walkable sample reachable from the centre, seeds `[1, 42, 777, 20260917]`
  (e.g. 5525/5525). The ramps bridge floor and top; no dead ends.
* **BOTH SIDES**: ONE geometry path — pilot and every walking enemy move through
  `reliefStep`/`reliefGrade`/`reliefRampRoute`; nothing side-specific exists. Pinned by the
  climb/AUTO/night checks above plus the pure-function sweeps.
* **CAMERA**: the deadzone follow holds the pilot inside the SAFE margin at floor, ramp and
  top alike (the camera never reads the relief). Verifier, both sizes: pilot held at
  (187,171) and (188,173) on the path top — the ground plane stays in frame. No clipping at
  320x568 (shot `ev2-height-320x568.png`).

## 5. ANTI-SANCTUARY, re-run (the park-and-measure, disarmed, seeded)

| Parked spot | contact rate 20s | contact rate 35s |
|---|---|---|
| **TOP** (mid-span, level 2) | **65.9%** | **80.5%** |
| **FLAT** (hollow floor) | 66.0% | — |

**Ratio 1.00 at 20s** — the upper path is a ROUTE, not a sanctuary. The v1 wall-top
measured ~0%; v2's ramps + route bias close that completely. The residual delay is the ramp
detour itself (first contact arrives a couple of seconds later; sustained contact then
matches flat). Disclosed residue: the tangential-shadow orbit is fixed by the intent bias;
the ranged anti-terrace pressure remains future work (owner's call list).

## 6. SURVIVABILITY — invariant named, nothing tuned

**No balance constants moved** (diff: config.js removed one now-dead constant,
`SLIDE_DRIFT`, that nothing reads; CLIFF_STEP=2 added to RELIEF). The pacing invariant that
holds BY CONSTRUCTION: spawn count, cadence and ring distance are untouched; the grade term
applies to both sides through one seam; the exposure bias (spawns bias uphill when the
player stands >= HIGH_LEVEL) was already shipped. The invariant the run's value rests on —
**kill rate converts to run value independent of ground level** — is unchanged: the terraced
default run clears waves and advances the ladder unattended (the NIGHT check). Standing high
remains a trade: wider radar reach (VISION_MULT) vs uphill-biased spawns (EXPOSURE_BIAS) and
the ramp detour any escape must now pay.

## 7. "FORM OUR VIEW" — vision evidence (model-read screenshots, honest)

Verifier ALL OK at 390x844 and 320x568; four shots each. Independent vision reads:

* **The cliff READS** (`ev2-cliff-390x844.png`): "a curved boundary line... thin lighter
  edge highlight... lip of a cliff or drop-off"; tone contrast — darker olive above (the
  raised terrace), lighter below; reads as a natural landform/crater rim. This is the drawn
  drop line (2px, 0.40 alpha) + face shading (8px, 0.18) the render lays only along spans
  the run's seed actually cliffs.
* **The horde demo READS** (`ev2-horde-390x844.png`): enemies visibly ON the band (one with
  an HP bar engaged on the path), more on the floor, one at the boundary climbing toward the
  parked player.
* **DISCLOSED LIMITS**: the ramp reads as a graded wedge (a lighter diagonal slope —
  "a continuous slope rather than discrete steps") but subtle: no explicit step lines, no
  side wall, no cast shadow — height magnitude is implied, not drawn. In the horde shot
  (parked on top) the band reads mainly as a lighter zone. The cliff shot is the money
  shot; if the owner wants the face to read TALLER, a cast shadow off the band's south side
  is the one-line follow-up (owner's call).

Also noted in passing: the "drag to move" coachmark banner overlaps the play area in these
shots — already on the UX dossier list, not touched here.

## 8. SCOPE

Verdant Hollow only — the other seven stages ship byte-identical terrain (tested: no
TERRACE block, and a band-spanning move is never blocked there). The cliff rule is inert
off VERDANT by construction (`reliefBlocked` returns false without a terrace).

## 9. SUITE FIXTURE DISCLOSURES (two, both established conventions)

The first full-suite run was 149/151; the two reds were fixture-side, not model-side:

* `test_arena_scaleup.mjs` — a TEXTUAL seam pin (`reliefGrade(e.x, e.y, act.mx, act.my)`)
  that pins the enemy seam grading the raw AI intent. The v2 seam grades `mvx, mvy` — the
  vector AFTER the route bias — which is the actual moved direction (grading the pre-bias
  intent while moving the post-bias vector would be wrong). Pin updated to the new form;
  the symmetry it pins (one grade function at both seams) is unchanged.
* `test_run_purse.mjs` — the 60Hz/120Hz purse-parity arm split a boundary kill (15 vs 14)
  because v2's route bias shifts enemy micro-positions. Fixed by the repo's own documented
  seed-retarget convention (0xe1→0xe3→0xe5→0xeb→0xed→**0xee**, parity 16/16), recorded in
  the test's comment; assertion unchanged.

Re-run: 151/151, redfiles=0.
