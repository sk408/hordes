# VK9P4 — ESCAPE: boss appendages, reach visibility, pursuer elimination, jump button, live mode toggle — 2026-09-17

Owner ask (verbatim): "It would be nice for the boss to have multiple appendages.
And maybe a slightly shorter reach so manual players can see the boss to react
to it. Need some sort of way for the pursuers to be eliminated for manual
players so they can take their time. Also manual players need a jump button.
And both players need a way of switching between manual and auto".

## 1. THREE APPENDAGES (one cadence, staggered)

`THREATS.ARMS` (src/escape/config.js) — the one home of every arm number; the
historical `GRAB_*` getters now read `ARMS[0]` so the V1f seams and the arm
table cannot drift apart:

| arm | lane | reach | r | offset | windup→extend→hold→retract |
|-----|------|-------|---|--------|---------------------------|
| CLAW | ground | **132** (was 150) | 12 | 0.0 | **0.65** / 0.22 / 0.25 / 0.40 |
| SICKLE | air only | 96 | 14 | 0.8 | 0.70 / 0.20 / 0.25 / 0.35 |
| TENDRIL | ground | 150 | 10 | 1.6 | 0.95 / 0.30 / 0.30 / 0.50 |

- Per-arm cadence is EXACTLY `GRAB_EVERY` 2.4s (measured per arm, node test);
  the offsets only stagger phase, so the beat stays learnable.
- Contact ONLY while an arm is out (extend/hold), in its OWN lane: `high`
  arms contact an airborne pilot (`p.y <= FLOOR-70`), ground arms a pilot near
  the floor — the claw's old predicate, one definition, applied per arm. A
  cleared pilot or an idle/windup/retract arrival is structurally safe (no
  invisible hitboxes, no late grabs — counter-cased per arm in tests).
- THE COMBINED GROUND WINDOW (per 2.4s cycle): tendril dangerous (2.90, 3.50],
  claw (1.53, 2.00] — **never simultaneous**; the clear window is **0.90s**
  against a ground-band crossing of ~0.26s at run speed (~0.15s dashed), >3x
  margin. The sickle is airborne-only, so the grounded finale ignores it.
- The auto pilot's `gauntletSafe` now dead-reckons the UNION of the ground
  arms' danger intervals (the same two-way test the single claw used); auto
  completes seeds 1–12 at 60Hz and 120Hz (V1f battery) plus 4/9/21 in the
  browser verifier, all outcomes `complete`.

## 2. THE REACH BOUND ("see the boss to react to it", as a number)

The camera shows `[p.x-150, p.x+330]` (CAM_LEAD 150, VIEW_W 480). Reacting at
the FARTHEST band edge (p.x = b.x − reach − r − 6, the auto brake point):

- full body on screen while `reach + r + 6 + 150 + BOSS_W/2 <= 480` → **reach ≤ 272**
- any part of it while `reach <= 372`

Every arm (max 150) is inside the FULL bound with room. The letterbox CONTAIN
fit means both phone sizes show the identical 480-virtual width — the bound is
viewport-independent; measured live anyway at **390x844 and 320x568**:
at wind-up start the boss span was 301..385 of 480 (pilot at 150); at max
extension 146..230 — fully on screen at both sizes (screenshots in `shots/`).
Per the owner's "slightly shorter": the CLAW was shortened 150 → 132 and its
tell LENGTHENED 0.50 → 0.65s (the trade the task names).

## 3. PURSUER ELIMINATION — THE KICK (manual only, bounded)

The auto-gun already kills pursuers, but the horde floor refills to 3 every
step — the tail never clears. THE KICK (`KICK_RANGE 96` behind the runner,
`KICK_CD 8.0`s, `KICK_SUPPRESS 3.0`s) is a manual-only stomp: it clears the
pack within range and holds the floor down for 3s (HUD reads "TAIL CLEAR Xs"),
then the horde returns. Bounded by construction: suppression < cooldown, and
**the WALL — the real timer — never pauses** (asserted). Key `S`/`↓` or the
KICK pad. AUTO never sets `input.kick`, so the auto path is byte-identical
(measured: 0 kicks across full auto runs).

**What the escape becomes with the tail clear:** three seconds to look at the
boss's tells, line up a gap, or breathe — the pressure that remains is the
one the mode is ABOUT (the wall). A wall PACE control was deliberately NOT
built — that is a separate owner decision (a "take your time" escape changes
the mode's identity; flagged here rather than slipped in).

## 4. THE JUMP BUTTON + the help-layer rule

`JUMP_RECT` (398,226 74x62) and `KICK_RECT` (316,244 72x44) — right-thumb
standard, translucent, clear of the HUD and SKIP; drawn MANUAL-ONLY, and
inert in auto (hit tests gated on `isAuto()`). The manual jump is the SAME
physics (`PHYS.JUMP_VY/GRAVITY`, one definition — apex/airtime asserted
against the constants; the auto arc rides the identical step code). A tap
anywhere off-pad is still a jump (the V1 phone rule, kept).

Help mode now admits the escape (`HELP_ENTRY_MODES`): with the reference
armed, a canvas tap EXPLAINS (per-pad lines via `ESCAPE.explain`) and never
activates — asserted in the real browser with help open AND closed; ESC
leaves help without skipping the escape (the keydown gate sits before the
escape dispatch). The escape PAUSES under help (dt 0, the playing branch's
own invitation rule).

## 5. THE LIVE MODE TOGGLE (one source of truth)

`MODE_RECT` (388,40 84x22) + the `O`/`M` keys, BOTH players. The escape reads
`getAuto: () => !pilotMovesYou()` LIVE every frame and hands the toggle back
into main's own `swapPilotMode` — the SAME `hordes_pilot` pref the whole game
uses, persisted + toasted there. No second pilot anywhere. Proven in the real
browser, both directions:

1. pref === state.pilotMode === the escape's live read (one source);
2. the SAME sim runs across a flip — no restart, no lost progress (manual
   idle holds x while t advances; a transition frame drops stale edges so a
   half-press can never leak across the switch);
3. authority actually changes hands (auto stops driving on flip 1, resumes on
   flip 2 — measured x movement), exactly one flip per press (no double-fire).

## Evidence

- `shots/before-finale-{390x844,320x568}.png` — the single-claw finale before.
- `shots/after-finale-{390x844,320x568}.png` — three staggered arms, both sizes.
- `shots/after-manual-hud-{390x844,320x568}.png` — JUMP/KICK/MODE pads.
- `test/test_vk9p4_escape.mjs` — 19 checks, all green.
- `tools/verify_vk9p4_escape.mjs` — 24 checks/viewport in the real browser,
  both sizes, all green. **Red run**: with the claw sabotaged to reach 380
  (past the 372 any-part bound) and the kick input severed, the node battery
  fails exactly on "reach exceeds the full-body bound" and the browser tool
  fails on the finale/reach checks; restored and re-verified green.
- Full suite: 135 files, redfiles 0. `test_v1_escape.mjs` pastFace pin
  RETARGETED with in-code disclosure (≥100 → ≥80; the reach itself shortened
  per the owner ask — the visibility bound above is the new upper guard).

## Balance

No pacing/payout constant moved: `PACING`, `PAYOUT_K`, `WALL` untouched; the
variant B palette untouched. New numbers are the arms table, the kick triple,
and the button rects.
