# BRIEF: tour negative-window flake — a KEPT event coach mounts inside the 35s no-coach leg

House rules: one writer (you hold the agentlock — ACQUIRE it first; RELEASE it when
your run ends, the kimi lane has leaked it before). No git state commands. Never weaken
an assertion to go green; every retarget enumerated as file + line + why. 60s wall cap
per command. Owner's taste: no emojis, pixel-art integrity. The orchestrator owns
commits; leave the tree dirty and report.

## The defect (systematic, not rare)

test/test_tour.mjs:415 REPLACEMENT 3 drives 35 live sim-seconds asserting NO coachmark
mounts and the sim never pauses. The leg was written when the only in-run coaches were
the retired scheduled chain; today FOUR KEPT event coaches exist (the file's own final
check: "flag family is EXACTLY the four kept coaches"). The draft coach is already
gated out by xpMult=0 and death by a 1e9 HP bar — but the OTHER kept coaches are
condition-gated on RANDOM run content (unseeded Math.random: chest/shrine/weather/
potion/boss encounters), so one can legitimately mount inside the window. This is a
probabilistic exposure of a negative assertion over unseeded content.

Measured: red in 3 of the last 4 suite runs under load (builder runs 1&2, pilot
verification run 2026-09-18 ~22:20Z), green standalone. Preserved captures:
  /tmp/hordes_suite_failures/20260918T220754Z_test_tour.mjs.log
  /tmp/hordes_suite_failures/20260918T221914Z_test_tour.mjs.log
Neither names WHICH coach mounted — your first job is finding out.

## Step 1 — name the culprit

Instrument the leg TEMPORARILY (or in a scratch copy) to print the mounted root's
html/id when sawTour trips, then run the leg in a loop (or under suite load) until it
fires. Report the coach name + its trigger condition with file:line in src/. If more
than one kept coach can fire in 35s, enumerate ALL of them.

## Step 2 — make the leg deterministic WITHOUT weakening it

The leg's INTENT is: "the retired scheduled chain stays retired — nothing mounts
unprompted, the sim never pauses." Event coaches firing on real encounters are KEPT,
by design, and asserted elsewhere (the draft coach in REPLACEMENT 4 at :419+). Pick
ONE of these, in this preference order, and justify the pick in the report:

  a. PRE-SET the culprit event coaches' TOUR_KEYS flags to '1' before the window
     (same idiom as the draft coach being impossible at xpMult=0 — the coach's own
     repeat-gate does the work). The negative assertion then covers exactly what it
     means: no NEW coach type mounts. Keep the four-kept-coaches family check at the
     end of the file consistent with whatever you pre-set.
  b. Pin the run RNG for this leg to a seed measured to produce no in-window event
     (print the seed; assert the measurement, don't just trust it).
  c. Narrow tourRoots() in THIS leg to exclude the enumerated kept-coach ids — WEAKEST
     option; only if (a) and (b) are impossible, and say why.

DO NOT sweepOverlays/ensureSimLive INSIDE the negative loop — dismissing the coach
before detection would silently defeat the assertion (the review_round1 helper idiom
applies at phase boundaries, not here). DO NOT shorten the 35s window, DO NOT touch
the st.time >= 35 assertion, DO NOT touch REPLACEMENT 4's draft-coach assertions.

## Step 3 — same-class neighbor (in scope, small)

test/test_rss8_magnet.mjs flaked once in the same batch (builder report: "probabilistic
AUTO-sweep threshold timing", capture /tmp/hordes_suite_failures/20260918T220741Z_test_rss8_magnet.mjs.log).
Read the capture, find the probabilistic leg, and apply the same determinism treatment
if it is the same class. If it is a DIFFERENT class or needs real investigation, leave
it alone and say so — do not expand scope.

## Acceptance bar

- node test/test_tour.mjs — green, 5/5 standalone runs.
- node test/test_rss8_magnet.mjs — green, 5/5 standalone (even if untouched).
- bash tools/run_suite.sh — THREE consecutive runs, each redfiles=0, TREE lines included.
- No assertion weakened; every pre-set flag / pinned seed / retarget enumerated as
  file + line + why.
- Report: which coach(es) fired and their src/ trigger lines, the fix chosen (a/b/c)
  and why, check counts before/after, the three suite log paths, anything you could
  NOT make deterministic.

## DISPATCH ANCHOR CHECK (confirmed by the goal pilot at dispatch, live tree d12a4a5)

- Negative window + assert: test/test_tour.mjs:399-416, assert at :415 — CONFIRMED
- Four-kept-coaches family check: tail of test_tour.mjs ("flag family is EXACTLY the
  four kept coaches") — CONFIRMED in the failure capture output
- xpMult=0 / 1e9 HP gating idiom: test_tour.mjs:404-406 — CONFIRMED
- Draft-coach KEPT assertion (REPLACEMENT 4): test_tour.mjs:417-432 — CONFIRMED
