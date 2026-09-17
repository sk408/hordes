# P2B99 — ESCAPE: manual movement controls (the P0 fix) — 2026-09-17

Owner ask (verbatim, immediately after playing e456ab0): "Ok manual mode
doesn't expose the movement controls though so it's currently impossible".
VK9P4 shipped the JUMP/KICK pads and the MODE switch, but movement — the
mode's main verb, and the BRAKE the appendage gauntlet is timed around — had
no touch surface at all. A manual player could jump in place until the wall
arrived.

## 1. THE ACTION-SET PARITY RULE (asserted, not assumed)

`test/test_p2b99_manual_pads.mjs` check 1 ENUMERATES the auto-pilot's action
set from real runs — it drives `inputFor` over seeds 1/2/3/9 to completion
and records every input field the code actually sets:

```
autoClamp, dash, jump, moveX, snapX   (moveX observed 1/0)
```

`autoClamp` (the speed-window brace) and `snapX` (the ≤6px fire-line snap)
are internal mechanics of the auto's jump timing that ride the jump —
disclosed in the test. Everything else is an action, and THE RULE: every
action has a manual control, a hit-testable pad AND a key path. The MANUAL
table in the test is the contract — a new auto action without a row fails
the check; a stale row the auto never sets fails it too.

| auto action | pad (virtual 480x300) | keys |
|---|---|---|
| moveX ±1 | LEFT (6,236 58x58) · RIGHT (72,236 58x58) — HOLD | ← / A · → / D |
| moveX 0 (the brake) | the LIFT (pointerup/pointercancel) | keyup |
| jump | JUMP (388,184 86x56) | SPACE / ↑ / W |
| dash | DASH (314,246 66x48) | SHIFT / X |
| (manual-only) kick | KICK (388,246 86x48), dimmed on cooldown | S / ↓ |

KICK stays the one manual-only verb (auto never sets `input.kick` — 0 kicks
measured across full auto runs). Keys were already bound; the touch surface
was the hole, and this fills it.

## 2. HOLD semantics — and the two-thumb fix found on the way

LEFT/RIGHT pads HOLD: finger down runs, the LIFT is the brake (the appendage
gauntlet's timing control, now a first-class touch verb). Pad-held state is
SEPARATE from key-held state (a keyup cannot drop a finger; a pad lift
cannot drop a held key — both directions counter-tested).

Writing the scripted browser run exposed a real defect in the first cut:
`pointerUp()` cleared BOTH direction pads unconditionally, so a second finger
tapping JUMP mid-run would fire a `pointerup` and kill the RUN finger —
two-thumb phone play (run + jump simultaneously) was broken. Fixed with
per-pointer ownership: each pad remembers WHICH pointerId holds it; a lift
releases only its own pad (`ESCAPE.pointer(vx, vy, pid)` /
`ESCAPE.pointerUp(pid)` from main's canvas handlers). Counter-tested: a JUMP
tap's lift cannot drop the run finger; the run finger's own lift still
brakes.

## 3. THE SCRIPTED MANUAL RUN (the impossible made routine)

`tools/verify_p2b99_manual.mjs`, in the REAL browser at 390x844 and
320x568, entering through the real UI funnel and the REAL `start` seam, then
flipping to MANUAL with a synthesized pointer event on the actual MODE pad:

Every frame the AUTO-PILOT ITSELF is the oracle — `inputFor(sim)` translated
into pointer events ON THE ACTUAL PADS (a held finger with its own
pointerId for moveX, down+up taps for jump/dash), then one pumped frame.
**Zero `onKey` calls.** Results, identical at both sizes:

- seed 5: **complete** @33.5s, 9 jumps / 18 dashes / 0 brakes
- seed 9: **complete** @30.0s, 9 jumps / 15 dashes / 0 brakes
- the three appendage arms were out (extend/hold) for 1245/1122 sampled
  frames across the passing runs — the gauntlet was crossed, not avoided
- every authored speed window brackets run speed (all 9 window jumps fired
  without bleeding speed — the manual arc equals the auto arc)

**Red run**: with LEFT/RIGHT routing severed (the shipped defect
reconstructed), the node battery fails the hold checks and the browser runs
die `caught @2s, x=165` — exactly the owner's "currently impossible".
Restored and re-verified green.

## 4. Layout + discoverability

- Pads mutually disjoint, on-viewport, clear of SKIP/MODE and the HUD corner
  (node, virtual space) and re-asserted in CSS space at both phone sizes —
  the letterbox CONTAIN fit maps the pads 1:1 at any viewport.
- The help-placement ladder (`helpControlRects`) now sees the escape's
  canvas-drawn pads: their live rects (mapped through the canvas's own
  letterboxed rect) join the controls every help surface must clear. Found
  by the verifier at 320x568 — the banner sat on the MODE pad; fixed here,
  not by moving the pad (the owner's "every help-mode surface must clear
  the controls" rule, extended to canvas-drawn controls).
- Help OPEN: a RIGHT-pad tap EXPLAINS ("RUN RIGHT — hold to run, lift to
  brake…") and never activates; ESC leaves help without skipping.
- HOW TO PLAY → CONTROLS carries a "THE ESCAPE (manual)" section: hold to
  run · LIFT to brake, JUMP, DASH, KICK, MODE, and the key equivalents —
  asserted rendered in the real browser at both sizes.

## Evidence

- `before-{390x844,320x568}.png` — the two-pad defect state (jump/kick only).
- `shots/after-manual-{390x844,320x568}.png` — the full pad set, the
  gauntlet mid-tell, no outcome card.
- `test/test_p2b99_manual_pads.mjs` — 7 checks, all green (action-set
  enumeration, disjointness/HUD, RIGHT hold + lift-brake, LEFT + key/pad
  independence, DASH pad, TWO-THUMBS, mode-flip release).
- `tools/verify_p2b99_manual.mjs` — both viewports, all green, red run
  demonstrated (pad routing severed → scripted runs caught @2s).
- `tools/verify_vk9p4_escape.mjs` JUMP-pad coordinates retargeted to the
  new JUMP_RECT (in-code note) — all green at both sizes.
- Full suite: **136 files, redfiles 0**.

## Balance

Nothing moved: no payout, duration, reward, pacing, wall or physics
constant; the auto path and the night path are untouched (auto never reads
the pads; the pads are inert and undrawn in auto). New numbers are the pad
rects and the per-pointer pad ownership.
