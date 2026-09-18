# PROLOGUE BANNER / HUD CLEARANCE AT 320x568 (tutorial pass, owner priority #1)

Owner directive standing behind this: "everything related to tutorial needs to be the fixes that are
being worked on right now. Above everything else." (2026-09-18). The prologue builder itself DISCLOSED
this defect in docs/art/prologue-2026-09-18/REPORT.md ("Known cosmetic overlap at 320x568 ... the
banner card band overlaps the HUD's top-left readouts (HP/MP/XP bars, 'LV 1 0/30', and part of the
'MANUAL PILOT' strip) ... not addressed in this task"). This task addresses it. The prologue is the
first thing a new player sees, and 320x568 is a real phone viewport.

## HOUSE RULES (standing)
- Do NOT run any git state command (no commit/checkout/reset/stash/clean). Leave the tree dirty;
  the orchestrator owns commits.
- If the agentlock is held by another owner, sleep 20s and re-check, up to 15 times. Never edit
  while another owner holds it.
- Never weaken or retarget an existing assertion to go green. New assertions only.
- `bash tools/run_suite.sh` must end redfiles=0. Name TREE + HEAD in the report.
- Real-browser verification on BOTH 390x844 and 320x568 (the owner plays on his phone). PNGs are
  read back (pixel probes are accepted ground truth; the vision model cannot resolve small sprites).
- NOTE: the tour-keys/state.time>1.0 boilerplate does NOT apply here — the prologue clock is frozen
  BY DESIGN (state.time === 0 for the whole phase, pinned by test_prologue). Assert the phase is
  armed instead (state.prologue non-null, banner up).

## MEASURED STATE (anchors verified at dispatch, HEAD a7c860f)
- The card: src/render.js:1710 `drawPrologueBanner`; geometry `W = Math.min(300, C.VIEW_W - 20)`,
  `x0 = (C.VIEW_W - W)/2`, `y0 = PROLOGUE_CARD_Y` — constants at src/render.js:214
  (`PROLOGUE_CARD_Y = 24, PROLOGUE_CARD_H = 92`). At 320 wide the card spans x 10..310, y 24..116 —
  straight across the HUD top-left readouts.
- The hit region: `prologueOkRect()` (src/render.js, near :1715) is the ONE shared seam — the
  painter, the canvas hit-test and the headless tests all read it. Any geometry change must move
  the rect in the SAME place so paint and hit-test can never disagree.
- Prologue config block: src/config.js:611 `C.PROLOGUE`. The automatic path stays PARKED
  (`C.PROLOGUE.ENABLED === false`); do not touch the gate.
- The walk-gate (`C.PROLOGUE.BANNER_WALK_S`) and the modal pause are owner-specified behaviour —
  untouched.
- Existing pins: test/test_prologue.mjs (17 checks), test/test_replay_tour.mjs (14 checks). Both
  must stay green unmodified.

## SCOPE
Make the prologue banner card and the live HUD readouts not overlap at 320x568, with no regression
at 390x844 (or any wider viewport). The mechanism is the builder's call — candidate shapes, pick one
and SAY which: (a) move the card below the HUD stack when the view is narrow (the card is native 1x,
top-centre under the HUD clock by comment); (b) suppress the readouts that are inert during the
prologue (HP/MP/XP cannot change during the phase — nothing can damage, cast or level) and restore
them at phase end; (c) a narrower/short card plus reflow. Constraints on any shape:
- Banner COPY untouched (owner-approved words), the n/4 counter and the OK button remain.
- The card must stay fully inside the viewport at 320x568 (it is today; keep it).
- OK remains a >=44px tap target in CSS px.
- If readouts are suppressed, that is prologue-phase-only, and run #2+ (no prologue) is byte-identical
  to today's HUD.

## ACCEPTANCE BAR
1. A real-browser verifier (pattern: tools/verify_help_clearance.mjs — the rect-clearance idiom):
   at BOTH 320x568 and 390x844, on a real fresh profile with the prologue armed and a banner UP,
   the card rect clears every visible HUD readout rect (HP/MP/XP bars, LV readout, pilot strip) by
   >= 8px, OR the readout is verifiably hidden; the card is fully in-viewport; a real tap on the OK
   rect still dismisses (the hit region tracks the card); zero console errors.
2. Unit checks pinning the new geometry (card rect vs readout rects at both widths — headless math
   on the same constants, no browser needed).
3. test_prologue + test_replay_tour green UNMODIFIED; full suite redfiles=0.
4. Shots at both sizes, banner up, read back (ink/pixel probe is fine).
5. REPORT: which mechanism you chose and why; the rects before/after at both widths (numbers);
   the assertion list; raw command output; PNG paths.

## OUT OF SCOPE
No balance constants. No changes to banner copy, the walk-gate, the modal pause, the potion, the
shield, the replay path, or `C.PROLOGUE.ENABLED`. No HUD changes outside the prologue phase unless
mechanism (a) requires a shared reflow — if so, say so explicitly and prove non-prologue screens are
unaffected.
