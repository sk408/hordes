# BRIEF: auto_draft countdown-line flake + prologue MAX_S retarget (TEST-SIDE ONLY)

House rules: one writer (you hold the agentlock — ACQUIRE it first; RELEASE it when
your run ends — the kimi lane has leaked it TWICE, tick 88/89; release on run end is
part of your contract). No git state commands. Never weaken an assertion to go
green; every retarget enumerated as file + line + why. 60s wall cap per command.
Owner's taste: no emojis, pixel-art integrity. The orchestrator owns commits; leave
the tree dirty and report.

CONTEXT: the tree you start on is dirty from TWO predecessor slices (S1 shrine
re-arm latch in src/main.js; smoke/runchests hardening in test/). Do not touch
their files beyond what this brief names. src/ is OFF LIMITS for both defects.

## DEFECT 1 — test/test_prologue.mjs:753 — NOT A FLAKE, A STALE LITERAL (fix this first, it is deterministic)

The assert `bound === 60` ("the bound is stated: 60s (PROLOGUE.MAX_S)") pins a
config literal the OWNER ordered changed: src/config.js PROLOGUE.MAX_S 60 -> 300
(uncommitted dirty edit, mtime 2026-09-18 23:31 UTC; owner verbatim in the
config comment: "we have to make the timer on the tutorial like 5 minutes, not
whatever it is now. Someone complained they weren't able to get through it
without being kicked out"). The test was never retargeted, so the file fails
DETERMINISTICALLY on this tree — pilot reproduced standalone 2026-09-18 ~24:00
UTC (AssertionError at :753). Two earlier suite reds (captures
/tmp/hordes_suite_failures/20260918T2335Z_test_prologue.mjs.log,
...T235717Z_...) are THIS, misread as a flake in TICK NOTE 92.

Fix: retarget the literal 60 -> 300 at :753, cite the owner directive in the
assert message or a comment, and sweep the whole file for any other assumption
that dies with the 5-minute bound (the EXIT-1/EXIT-2 arms already read
C.PROLOGUE.MAX_S symbolically at :633 and :758 — VERIFY they still terminate in
reasonable wall time: 60*(300+5) frames each, synchronous, fine if the file
stays under its usual runtime; state the measured file runtime before/after).
Comments at :25/:43 mention the bound only in prose — check they still read true.

## DEFECT 2 — test/test_auto_draft.mjs:219 — GENUINE FLAKE, reproduced standalone

"The countdown line left with the draft" (section 5: human tap at 3s cancels the
AUTO timer; after tick(6) the #draft-autopick element must be gone). Pilot
reproduced 2026-09-18 ~24:05 UTC: 3 standalone runs, run 2 FAILED at :219, runs
1/3 passed. So iteration needs NO suite — loop the file until it fires.

What the pilot established reading src (verify, don't trust):
- The element is removed in TWO places: clearDraftAutoPick (src/main.js:3965-3972)
  and updateDraftCountdownLine's !show branch (:3978-3984). The tap path
  (activateDraftCard) is expected to reach clearDraftAutoPick synchronously.
- tickDraftAutoPick is called unconditionally on the frame loop (:10796), so the
  !show sweep also runs every frame AFTER resolution — the element should be
  gone within one frame of ANY resolution path. Its persistence means either the
  removal never ran, or something RE-CREATED the line during the 6s of ticking
  (armDraftAutoPick at :3962 creates it; count staying c0 at :218 does NOT rule
  out a new draft arming).
- The file does NOT call T.banners.suppressAll() (unlike test_prologue.mjs) —
  the tour/banner/coachmark system is live; section 2 already met the draft
  coachmark. A banner/coachmark event during section 5's tick(6) is a candidate
  interference class.
- Module state accumulates across the file's 5 sections (pilotMode flips,
  T.draftAuto.rng pinned at section 1 and never restored, xpMult=0 set at boot).
  xpMult=0 pins level-up drafts; enumerate any OTHER draft-opening source that
  can fire during live play (chests, events, night-mode paths) and whether
  section 5 can meet one.

Step 1 — NAME THE CULPRIT. Instrument (scratch copy or temporary prints): on
failure, dump st.mode, st.pendingDrafts, T.draftAuto internals (armed/left via
whatever seams exist), overlay children ids, and whether a banner/coachmark is
up. Loop standalone until it fires at least twice; report every observed state.
Step 2 — PIN OR FIX TEST-SIDE. If it is test-harness exposure (live banners,
unseeded content), pin it with the established idioms (banners.suppressAll per
test_prologue.mjs; the rss8 field pin). If it is a REAL game defect (a path
where the line survives resolution), STOP and report it with the repro — src/
is off limits in this brief. The assertion at :219 is UNTOUCHED either way.

## Acceptance bar

- node test/test_prologue.mjs — green, 5/5 standalone runs; file runtime
  reported before/after the retarget.
- node test/test_auto_draft.mjs — green, 10/10 standalone runs (the pilot
  measured a ~1/3 fail rate; 10 clean runs is the evidence bar).
- bash tools/run_suite.sh — THREE consecutive runs, each redfiles=0, TREE lines
  included. (smoke/runchests hardening should already have landed; if any of
  the four known-flake files still reds, name it and its capture.)
- No assertion weakened; every pin/retarget enumerated as file + line + why.
- Report: defect 1 — the retarget + sweep results; defect 2 — the culprit with
  its src/ trigger lines, the pin applied, measured standalone fail rate
  before (loop count/failures) and the 10/10 after; the three suite log paths.

## DISPATCH ANCHOR CHECK (confirmed by the goal pilot, live tree d12a4a5 + S1/smoke dirty, 2026-09-18 ~24:05 UTC)

- Stale literal: test/test_prologue.mjs:753 `assert(bound === 60, ...)` — CONFIRMED, fails deterministically standalone
- Owner config change: src/config.js:638 `MAX_S: 300` (dirty, comment cites owner verbatim) — CONFIRMED
- Symbolic bound readers (no retarget needed, verify runtime): test/test_prologue.mjs:633, :758 — CONFIRMED
- Flaky assert: test/test_auto_draft.mjs:219, section 5 at :208-220 — CONFIRMED, reproduced 1/3 standalone
- Removal sites: src/main.js:3965-3972 (clearDraftAutoPick), :3978-3984 (!show sweep), creator :3988 — CONFIRMED
- Frame-loop call: src/main.js:10796 — CONFIRMED
- No banner suppression in the auto_draft file (grep suppressAll => no hits) — CONFIRMED
- Preserved captures: /tmp/hordes_suite_failures/20260918T2335Z_test_auto_draft.mjs.log, 20260918T234002Z_test_auto_draft.mjs.log, 20260918T2335Z_test_prologue.mjs.log, 20260918T234116Z_test_prologue.mjs.log, 20260918T235717Z_test_prologue.mjs.log
