# FLOATING (DYNAMIC) JOYSTICK — verification report (owner 2026-09-17)

Task: "I know some games let you use the anywhere on the screen as a joystick.
Touch and hold and then as you move it"

**Status: IMPLEMENTED AND SHIPPED in this build** — landed in commit cb4c463
(2026-09-18 02:55 batch) as `C.JOY.FLOAT` (default **true**), plus the
`#steer-zone` control-band follow-up. This document is the report the brief
asked for: the movement model, the thresholds, the coexistence proof, and the
pads recommendation. No new code was needed; every claim below was re-verified
today in real Chrome at 390x844 and 320x568 (screenshots in `shots/`).

---

## 1. The movement model today (report first)

- **The arena is FULL 2D ANALOG — not a lane.** `PlayerController.decide()`
  returns a continuous `{ moveX, moveY }` in −1..1 applied to the pilot every
  frame (src/controllers.js:449-474). Partial deflection = partial speed;
  full tilt in ANY direction = full keyboard speed; diagonals are true analog,
  not gated (src/controllers.js:458-463).
- **Input feeds:** one `pilotInput` object carrying BOTH a digital keyboard
  state (`up/down/left/right`, src/main.js:987) and an analog vector
  (`x, y, mag`, src/main.js:980). The stick wins whenever `mag >
  JOY_DEAD_ZONE = 0.15` (src/controllers.js:438) — a light thumb rests on the
  knob without drifting; below that the digital keys apply.
- **The touch pads are NOT movement pads.** Left pad = doctrine
  (FOCUS/STANCE/PILOT/STATS), right pad = skills/potions
  (Q/E/MAG/HP/MP) — index.html:743-762. Movement on touch was the FIXED
  bottom-center base `#joy` (index.html:749); the floating stick replaces it
  (the fixed base stands down on touch paths, src/main.js:9130-9131 — one
  movement idiom on screen).
- **Verdict:** the stick is NOT a comfort win over a lane — it gives the 2D
  arena the full-screen analog surface the fixed base could not. The thumb can
  now steer from anywhere, including from inside the fight.

## 2. The stick, as shipped

| Property | Value | Where |
|---|---|---|
| Arm | touch-down anywhere on the canvas (or the `#steer-zone` band) sets the ORIGIN at the touch point | src/main.js:8949-8967, 8974-8986 |
| Radius (full speed) | `FLOAT_R = 60` CSS px | src/config.js:899 |
| Dead zone | `JOY_DEAD_ZONE = 0.15` (≈9 px) | src/controllers.js:438 |
| Magnitude | **PROPORTIONAL/ANALOG** — deflection fraction 0..1, clamped at the ring (the movement model supports it, so analog was chosen) | src/main.js:8883-8901 |
| Guards | touch paths only, one stick at a time (pointer id), playing mode only, not help-mode, MANUAL only | src/main.js:8950-8954 |
| Visual | origin ring + knob (`#fjoy` / `#fjoy-knob`), painted at the origin, pointer-inert, translucent, hidden on release | index.html:455-470, 753; src/main.js:8934-8940 |

**Hold/movement thresholds — exact answer:** there are NO time thresholds.
Help is a MODE (the "?" toggle), not a long-press: while help-mode is on, a
canvas tap EXPLAINS and never arms (src/main.js:8993-8997 via the layer
funnel, and the canvas-path hook declines inside `fjoyTryArm`,
src/main.js:8953); the moment "?" is tapped off, presses steer again. This
keeps the pre-existing tap-to-explain contract (VK9P4) instead of forking it
into tap-vs-hold timing — a short tap in normal play arms the stick, but
arming with zero drag is harmless: `mag 0` steers nothing.

## 3. Coexistence (the hard part)

- **Fullscreen button:** its hit-test runs FIRST in the canvas handler
  (src/main.js:9417-9429) — the button's own tap toggles fullscreen and never
  arms the stick (proven by test arm 3: a dead-centre button tap calls
  `requestFullscreen`, `armed()` stays false).
- **Pads / cog row:** DOM elements ABOVE the canvas — their presses never
  reach the canvas path; a second finger on a pad fires its action while
  steering stays live (test: "pads coexist", test_floating_joystick.mjs:98-108).
- **Geometry, asserted (not eyeballed)** at **390x844 AND 320x568 AND
  844x390** landscape (test_floating_joystick.mjs:261-298): every size keeps
  a control-clear disc (r=40 px, over half the ring radius) for the origin,
  and the free canvas area stays ≥20%.
- **No scroll while steering:** `touch-action: none` on the canvas
  (index.html:42), `#fjoy` (index.html:463) and `#steer-zone` (index.html:485).

## 4. Release + visual

Release (window `pointerup` / `pointercancel`, id-filtered) is a **DEAD STOP —
no coast** (src/main.js:8941-8948): `pilotInput` zeroes the same frame, the
knob snaps home and the ring hides. Verified live today at both sizes: the
ring paints centred on the touch point, is translucent (arena and pilot
visible through it), and reads at 320x568 (vision pass on both screenshots).

## 5. Subtleties that bite — all covered

- **Multi-touch:** the stick is owned BY POINTER ID; a second canvas finger
  never re-arms, a foreign `pointerup` never releases
  (test_floating_joystick.mjs:83-96, 110-116).
- **Pointer capture:** attempted on arm and counted (src/main.js:8961-8964);
  the testable guarantee is the GLOBAL window move/lift listeners
  (src/main.js:9035-9041) — a drag that leaves the canvas keeps tracking, and
  the lift lands wherever the finger is (audit-round-2 fix, same pattern as
  the fixed base).
- **Resize / orientation change mid-drag:** survives both, still armed and
  steering (test_floating_joystick.mjs:182-194); blur (alt-tab)
  hard-releases everything (:175-180).
- **Mid-drag pilot-mode swap:** hard-releases — no ghost vector into the
  autopilot (src/main.js:1054, test :165-173).

## 6. Pilot modes

- **AUTO_ALL / AUTO_MOVE:** the stick is **inert** — it never arms
  (src/main.js:8954; test :148-163: both modes probed, `armed()` false,
  `pilotInput` never written). It cannot fight the autopilot.
- **MANUAL:** arms and steers. On touch paths the fixed base stands down
  (src/main.js:9130-9131); desktop keeps the fixed base for mouse-drag and
  WASD (test arm 2 — canvas presses on a non-touch path never arm).

## 7. The pads — recommendation (not a decision)

The arena is 2D, so the floating stick does what no L/R pad pair could: full
analog steering from anywhere. **Recommendation: keep exactly what shipped —
floating stick as the arena's one movement idiom on touch (fixed base
retired on touch, kept on desktop), doctrine/skill pads untouched.** The
JUMP/KICK pads belong to the ESCAPE side-scroller, a different game — the
stick deliberately does not arm there (test :138-146: `'no stick in the
escape (its pads are the controls)'`). Nothing was removed without the
owner's call; `C.JOY.FLOAT` (src/config.js:898) is the one line that restores
the fixed base on touch if he prefers it.

**One cosmetic follow-up for the owner's eye:** at full deflection the knob's
CENTRE parks at the ring's rim, so the 40px knob's outer edge pokes ~20px
past it (visible at the rim in the 390 shot). One clamp line
(`rad - KNOB/2`) if he dislikes the look — left as-is for his call.

## 8. Tests + proof

- `test/test_floating_joystick.mjs` — 15 checks: arm/steer/analog/dead-zone,
  dead-stop release on the owning lift only, pad coexistence (second
  pointer), one-stick-at-a-time, fixed base stands down, help-mode never
  arms, non-playing modes never arm, AUTO modes never arm, mid-drag swap,
  blur, resize+rotation, desktop no-arm, fullscreen priority, geometry at
  390x844 / 320x568 / 844x390.
- **Live verification today (real Chrome, touch emulation):** armed at the
  exact touch point (179,338)@390 / (147,227)@320, analog vector
  `(0.919, 0.394, mag 0.762)` for a 46px drag, ring centred on the origin,
  knob at the clamped offset, fixed base hidden, release = instant zero,
  **zero page errors**. Screenshots with the stick live:
  - `shots/fjoy-390x844.png`
  - `shots/fjoy-320x568.png`
- **Try it on the phone:** open `index.html`, start a run, tap PILOT until it
  reads MANUAL, then touch-drag anywhere on the arena.
- Suite: **151 green / 0 red** at HEAD 5597b79 (re-run after this report:
  same, docs-only diff).
