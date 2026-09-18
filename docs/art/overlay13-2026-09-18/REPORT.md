# TRANSIENT OVERLAY DURATION 0.5s -> 1.3s — report (2026-09-18)

Owner: "The full screen/overlay controls disappear too fast. I guess we need
to make it 1.3 seconds"

## The change

One number: **`C.FULLSCREEN.HIDE_S`: 0.5 -> 1.3** (src/config.js:881), with
the comment updated to carry the retune's provenance. That constant is the
ONLY duration in the system — nothing else was tuned.

## One mechanism (it already was one)

Every transient surface shares a single show/fade system; there was nothing
to unify:

- The one timer is `fsOverlay.t` (src/main.js:8863), set to
  `C.FULLSCREEN.HIDE_S` by `fsBump()` (main.js:8867-8868) on interaction, and
  decayed once per frame by real wall-clock dt (main.js:10163).
- The painted **fullscreen button** is visible iff `fsVisible()` =
  `fsOverlay.t > 1e-9 && chromeOn()` (main.js:8904-8908).
- The **transient top strip** (the canvas-ladder landscape work) rides the
  SAME window: `setBodyClass('chrome-reveal', topTransient && on &&
  fsOverlay.t > 1e-9)` (main.js:9253-9257) — no second constant, no second
  timer. So the retune moved BOTH surfaces to 1.3s in one edit, which the
  real-browser verifier re-proves ("ONE reveal system" check, now at 42/42).

## Guard 1 — hidden is completely inert (re-asserted)

`fsHit()` returns false unless `fsVisible()` first (main.js:8941-8942), so
the enlarged (~3x the icon: 64x56 view px) hit box is unreachable while
hidden — it can never eat a gameplay tap. Re-asserted harder than before:
the new test taps all four corners AND the centre of the ENLARGED box while
hidden, each after a full hide — zero toggles (test_fullscreen_button.mjs).
The longer 1.3s window is a longer LIVE-target window, but the target is
only live when painted.

## Guard 2 — no continuous re-show (one hole found and FIXED)

- Pointer side: bumps fire on `pointerdown` ONLY (canvas main.js:9563-9569,
  touch layer 9127-9129) — there is no `pointermove` bump anywhere, so a
  held finger streaming move events never re-shows the chrome. One show per
  press, then it fades.
- Keyboard side: **a real hole**. `fsBump()` fired on EVERY keydown
  (main.js:8148) BEFORE the auto-repeat guard — a held movement key fires
  ~30 repeats/s, which at 0.5s already quietly re-armed the window and at
  1.3s would have pinned the chrome on screen for the entire hold. Fixed:
  `if (!ev.repeat) fsBump();` (main.js:8148-8152). An honest press is still
  an interaction; a repeat is not a new interaction.

## Tests (test_fullscreen_button.mjs, 26 checks green)

- the constant is EXACTLY 1.3, asserted directly (not implied);
- the fade FOLLOWS the constant: visible at 77 frames (1.283s), hidden at
  exactly 78 (1.300s) at 60Hz — frames derived from the constant, so a
  future retune re-prices the test;
- the enlarged hit box is inert while hidden (5-point sweep);
- a 1.5s held-key repeat stream (90 repeat keydowns) never re-shows it, and
  one honest press does;
- all pre-existing geometry/suppression/immersive checks unchanged.

Real-browser proof: tools/verify_canvas_ladder.mjs **42/42** (its two
0.7s sleeps — written for the 0.5s window — were re-based past 1.3s).

## Shots

`overlay13-390x844.png`, `overlay13-320x568.png` — the button VISIBLE
mid-window (~0.35s after the interaction), with the live-page probes printed
beside them: `visible:true` at ~0.35s and `visible:false` at ~1.55s at BOTH
sizes.

## Nothing else changed

Layout, hit-box size (22x18 icon / 64x56 hit / EDGE_GUARD 8), the
persistent/transient rules, and the measured ladder decision are untouched —
test_canvas_ladder.mjs and the verifier's per-size arms re-ran green.
