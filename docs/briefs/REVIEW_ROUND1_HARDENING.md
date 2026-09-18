# BRIEF: test_review_round1 load-flake hardening (TEST-SIDE ONLY)

House rules: one writer (you hold the agentlock — ACQUIRE it first; RELEASE it when
your run ends, the last two tasks leaked it). No git state commands. Never weaken an
assertion to go green; every retarget enumerated as file + line + why. 60s wall cap
per command. Owner's taste: no emojis, pixel-art integrity. The orchestrator owns
commits; leave the tree dirty and report.

## The defect (measured, three exhibits from TODAY, all in ONE file)

test/test_review_round1.mjs has failed under suite load three times today on THREE
DIFFERENT legs, each green standalone (preserved by the suite-hardening capture):
- /tmp/hordes_suite_failures/20260918T122909Z_test_review_round1.mjs.log — FAIL item 1
  'a hint chip is visible before the skip :: 0' (1 ok line printed)
- /tmp/hordes_suite_failures/20260918T205403Z_test_review_round1.mjs.log — FAIL
  'settings open mid-run :: "draft"' (8 ok lines)
- /tmp/hordes_suite_failures/20260918T214306Z_test_review_round1.mjs.log — FAIL
  'heat stacks ADDITIVELY ... settles at x3.6 :: null' (34 ok lines; the third
  killAndSettle() returned null = 7200 frames with no death)

The file's own comment (at killAndSettle) names the mechanism class: 'an undismissed
coach freezes the NEXT run's sim'. Modal overlays (death coach, prologue banner, draft)
mount asynchronously; under CPU load their timing lands INSIDE a later leg's window,
the sim pauses, and whatever that leg was waiting for never happens. A same-class guard
for the draft-overlay leg landed today (the 20:54 red predates it) — but the failure
is a CLASS, and the class is not closed: every leg that waits on sim progress is
exposed.

## Scope (TEST-SIDE ONLY — no src/ edits)

Close the CLASS in test/test_review_round1.mjs:
1. Add ONE shared phase-boundary helper that, before any leg that waits on sim
   progress, dismisses ANY live overlay through its REAL path (Escape for the coach,
   the real two-tap SKIP for the prologue banner, the real resolve for a draft) and
   asserts the sim is actually unpaused afterwards (state.time advances across a
   tick). Reuse the guard idiom the prologue-clearance task added at :164 — read it
   first.
2. Call it at EVERY phase boundary: each killAndSettle() entry, each T.startRun()
   leg, each settings/overlay leg. If a leg cannot be unpaused through the real
   paths, that is a GAME bug — stop and report it, do not paper over it.
3. No assertion weakened. The x3.6 additive-heat bar, the goldPool shape bars, the
   copy bars all stay byte-identical.

## Acceptance bar

- node test/test_review_round1.mjs — 5/5 green standalone.
- bash tools/run_suite.sh — 3/3 greenfiles full, redfiles=0, run back-to-back (the
  suite IS the load environment that exposes this class).
- grep proof the helper is called at every boundary; enumerate the call sites.
- Report: the mechanism you confirmed (with the state you observed), the call sites,
  the suite logs' paths.
