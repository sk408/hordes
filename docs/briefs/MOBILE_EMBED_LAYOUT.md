# MOBILE EMBED LAYOUT — the field must not sit behind the touch pads

**OWNER-ORDERED PRIORITY: this is the NEXT build task, ahead of any G17 slice-2 follow-up.**
Owner, verbatim: *"the control buttons have significant overlap with the gameplay"* and, refining it,
*"Maybe the game view should be bounded according to the top buttons instead of mid screen."*
Evidence: an iPhone screenshot of the live galaxy.click play page. This is a PLAYTEST BLOCKER on
every portrait phone, not just in the embed — galaxy's iframe only made it obvious.

## MEASURED CAUSE (read from the tree — verify these anchors yourself before editing)

- The stage is a **480x300 LANDSCAPE** canvas: `src/config.js` `VIEW_W`/`VIEW_H` (:20-21).
- `fitCanvas()` (`src/main.js` :181) letterboxes it with
  `fit = min(window.innerWidth / C.VIEW_W, window.innerHeight / C.VIEW_H)`.
- `#wrap` then **CENTERS** it: `display:flex; align-items:center; justify-content:center`
  (`index.html` :16-19).
- The touch controls are a SEPARATE layer, absolutely positioned and **anchored to the viewport
  bottom**: `#touch .pad { position:absolute; bottom:max(10px, env(safe-area-inset-bottom)); width:96px }`
  with `.pad.left` / `.pad.right` at the side insets (`index.html` :203-219) — 4 buttons at
  `height:64px` + 10px gaps (~286px tall), shown on coarse pointers
  (`#touch.on` / `@media (pointer:coarse)`, :175-180).

So the canvas is placed as if it owned the whole viewport while the pads independently claim the
bottom ~300px of it. In any viewport shorter than the canvas' aspect-derived height, those two boxes
INTERSECT and the pads cover the live field (enemies, drops, the player near the edges).

**Why it shipped:** our verification asserts the HORIZONTAL geometry carefully (equal 96px pads, the
centred joystick, the gaps at 360 and 390) and never asserts the canvas-vs-pad VERTICAL relationship.
The overlap was never a failing test, only an unmeasured one. Fix the test too, or it comes back.

## REQUIRED BEHAVIOUR

Bound the canvas to the **FREE BAND** between the top of the screen and the pads, instead of centring
it mid-screen:

1. Measure the reserved boxes from the LIVE DOM, not from hardcoded constants: the HUD block's bottom
   edge (`#hud`, `index.html` :24-30) and the top edge of the pad block (`#touch .pad`, both sides —
   take the higher/earlier of the two, and include the joystick `#joy` when it is displayed, :229+).
2. `available = innerHeight - hudBlock - padBlock - small margins`, then fit the canvas inside THAT
   box and place it `top: <hudBlock bottom>` — top-aligned in the free band, never centred.
3. Re-run this on `resize` (fitCanvas already is the resize handler) AND on the touch-layer toggles
   (`#touch.on` / `.cog-only`, :175-190) and on orientation change, since the free band changes when
   the pads appear.
4. The pads keep their bottom anchoring and their 96px width — do not redesign them, do not move them,
   do not restyle the HUD. This is a PLACEMENT fix, not a rescale: on a 390-wide phone the canvas is
   already width-limited, so the field must not get smaller; the dead space moves to where nothing
   needs it.
5. Desktop / `pointer:fine` must not regress: with no pads present the canvas stays centred as today
   (or, if you prefer one code path, prove the fine-pointer case still looks right with a PNG).

**FALLBACK — only if the measured free band is too short at 360x640** (state which you chose and why,
with the band heights before and after): shrink the pad buttons (64px -> 56px) and/or reduce the pad
gap. Do NOT shrink the canvas below the free band's fit, and do NOT hide a pad to make room.

## FUNCTIONAL READINGS — BROWSER ONLY, AND NO SIMS AT ALL

Read the BEFORE state first: the canvas rect, both pad rects, and the **intersection area** at
390x844 @dpr3 and at 360x640, with the touch layer live. Those come from `getBoundingClientRect` in a
real browser — seconds of work. Keep them in the report; the after-readings are only meaningful
against them.

**OWNER DIRECTIVE (2026-09-15, binding): no sim or measurement command may exceed 60 seconds of wall
clock, to the end of the queue.** This task needs NO simulation: do not run `--measure`, do not run a
cohort, do not run a game run at all, do not re-baseline anything, and do not add a check just to
produce a number. If a check you want cannot fit inside 60 seconds, DROP the check and say so — never
raise the timeout. `bash tools/run_suite.sh` (to `redfiles=0`) is still required: it is the
"does it work" gate, and any single case over 60s gets split or cut with the reason stated.

## ACCEPTANCE BAR (each item with its REAL raw output in the report)

1. At **390x844 @dpr3** AND at **360x640**, with the touch layer displayed: the canvas rect intersects
   NEITHER pad rect. Assert it PROGRAMMATICALLY (rect intersection == empty / zero area), not by eye.
   This is a CORRECTNESS assertion (the overlap is gone), not a balance measurement.
2. The canvas sits fully below the HUD block and fully inside the viewport at both sizes.
3. The canvas keeps its aspect (480x300) — no stretched pixels.
4. BEFORE/AFTER intersection areas printed at both sizes.
5. The existing layout maths referenced by the pad CSS comment (`test/smoke.mjs`,
   `tools/verify_skill_keys.mjs`) still pass, or are retargeted with the reason stated per line.
   NEVER weaken an assertion to go green.
6. A real-browser PNG at 390x844 @dpr3 (and 360x640) with the pads visible, saved under
   `docs/art/mobile-embed-<date>/`.
7. `bash tools/run_suite.sh` run SERIALLY ends `redfiles=0`.

**Write the browser check as a reusable tool** — `tools/verify_mobile_layout.mjs` — following the
existing real-Chrome verifiers in `tools/` (e.g. `tools/verify_card_coverage.mjs` is the closest
template: it drives Chrome, reads getBoundingClientRect for real elements, and asserts numbers). The
touch layer must be live in the run: either emulate touch / a coarse pointer, or add the `.on` class
the CSS already supports (`#touch.on`, :179) — say which you did.

## HOUSE RULES (all binding)

- **NO EMOJIS** in any UI, DOM string, or console output.
- **NEVER** weaken an assertion to go green.
- Enumerate every retarget: file + line + why.
- Deterministic only — no random values in the layout maths.
- **Do NOT run any git state command.** Leave the tree dirty and report the dirty count.
- Post `done:` / `blocked:` to the hordes channel FIRST, then the raw evidence: the before/after rect
  tables, the acceptance bar item by item with real output, files touched, the suite tail verbatim,
  the flag list, and a COULD NOT VERIFY section.
- **First action: append a line to a heartbeat file** (`/tmp/mobile_layout_heartbeat.log`) so a stall
  is visible in seconds, then repeat it before each long step. Keep every command bounded (~240s) and
  never leave a silent multi-minute wait.

---

## ROUND 2 — OWNER-REPORTED INCOMPLETE (2026-09-15, after round 1 landed)

Owner, verbatim: *"the fix is not complete. Now the top buttons such as setting and map overlay
the gameplay."*

**Cause, read from the landed fix.** `freeBand()` in `src/main.js` reserves the TOP only from
`#hud` — the top-LEFT text block — so the canvas is now top-aligned just below the HUD. It never
reserves the **top-RIGHT chrome row**, which is a separate set of absolutely-positioned buttons in
the same strip: `#touch button.cog` (`index.html` :312), `.cog.map` (:366), `.cog.radar` (:355),
`.cog.help` "?" (:346), and the `#hints` panel when it is shown (:376-385, `top: 64px`). Moving the
field up is what exposed them: the buttons now sit over the field's top strip instead of over the
dead letterbox space above it. Round 1's verifier passed because it asserted the PADS only.

**REQUIRED (round 2).** Reserve the top from the UNION of every visible top-strip chrome element —
`#hud` PLUS every displayed `#touch button.cog` (map/radar/help included) PLUS `#hints` when it has
`.on` — taking the LOWEST bottom edge among them, plus the same margin. Do NOT hardcode the button
list by name and do NOT hardcode pixel values: measure what is actually displayed, so a future
button added to that row cannot reintroduce the bug.

**ACCEPTANCE — round 2 (this is now the bar; round 1's pad-only check is not sufficient):**
1. At **390x844 @dpr3** AND **360x640**, with the touch layer live: the canvas rect intersects
   NEITHER pad rect, **NOR any visible top-strip chrome rect** (`#hud`, each displayed
   `#touch button.cog`, `#hints.on`). Assert the UNION programmatically — count of intersecting
   elements must be ZERO — never by eye.
2. Style the check so a NEW button in that row is caught automatically: iterate the live chrome
   elements and fail on any intersection, rather than asserting a fixed list.
3. Re-run in the browser at both sizes, save PNGs to `docs/art/mobile-embed-<date>/`, and read them
   back visually to confirm no control sits over the arena.
4. `bash tools/run_suite.sh` to `redfiles=0`. No assertion weakened; retargets as file + line + why.
5. NO SIMS: the owner's 60-second rule stands. Browser readings only.

---

## ROUND 3 — OWNER-REPORTED REGRESSION: THE CANVAS COLLAPSES IN LANDSCAPE (2026-09-15)

Owner, verbatim: *"Now the canvas is off screen in landscape view."*

**Cause — a design flaw in the reservation, not a typo.** `freeBand()` reserves the WHOLE bottom
strip (from the earliest pad top edge) and the WHOLE top strip (from the lowest top-chrome bottom
edge). On a short landscape viewport that is fatal: at 844x390 the pad COLUMNS are ~286px tall and
bottom-anchored, and the top chrome (HUD text + the cog row) claims ~80px, leaving a band of under
~10px. `fit = Math.min(innerWidth / 480, (band.bottom - band.top) / 300)` then collapses to ~0.02 and
the canvas renders about 11x7px — invisible, which is what the owner is seeing. **There is no floor,
and the fit has no idea whether the chrome actually overlaps the canvas.**

**REQUIRED.**
1. **Solve geometrically, not by axis-aligned strips.** In landscape the canvas is HEIGHT-limited
   (844x390 gives 624x390), which leaves ~220px of dead space at the sides — the pads can sit BESIDE
   the canvas. Reserve the bottom only when a pad rect actually overlaps the canvas' horizontal span;
   when the pads clear it laterally, the canvas may use the full height. The general rule: pick the
   largest scale at which the resulting canvas rect (horizontally centred, top-aligned below the top
   chrome) intersects NO chrome rect. Iterate candidate scales and SHRINK until it is clean — assert
   against the real rects rather than reserving whole strips.
2. **Never collapse.** Enforce a minimum usable canvas size, state the floor you chose and why, and if
   the geometry cannot satisfy it, apply the documented fallback — shrink the pad buttons (64 -> 56
   or 48) and/or cut the pad gap — rather than letting the canvas vanish. Say which you chose.
3. **Never place the canvas outside the viewport**, in any orientation.
4. Portrait behaviour from rounds 1 and 2 must not regress.

**ACCEPTANCE — round 3 (supersedes rounds 1 and 2):** at **390x844 @dpr3, 360x640, 844x390 @dpr3 and
640x360**: the canvas rect is FULLY inside the viewport; it intersects ZERO visible chrome rects
(both pads, `#joy` when shown, `#hud`, every displayed `#touch button.cog`, `#hints.on`); and its
height is at or above the stated floor. Assert all of it programmatically, in one reusable tool
(`tools/verify_mobile_layout.mjs`), and save a PNG per size to `docs/art/mobile-embed-<date>/`, read
back visually. Then `bash tools/run_suite.sh` to `redfiles=0`, no assertion weakened, retargets as
file + line + why.

**NO SIMS** (owner directive: nothing over 60 seconds). This is browser geometry only.

---

## ROUND 4 — PRIORITY RULE: OVERLAP IS THE ACCEPTABLE FAILURE MODE (owner, 2026-09-15 — SUPERSEDES ROUND 3's "zero intersection at any cost")

Owner, verbatim: *"Overlap should be the failure mode, not breaking the gameplay completely."*

Rounds 1-3 treated "no chrome overlaps the canvas" as the hard requirement and the canvas size as
free — which is how a clean layout produced an 11x7px game. **That priority is now reversed.**

**PRIORITY ORDER (fixed, highest first):**
1. **The canvas is always usable.** It never collapses, never falls below its floor, never lands
   outside the viewport, in any orientation. This is the ONLY hard failure.
2. **The chrome stays usable.** Buttons remain visible and tappable — mild overlap is tolerable,
   chrome sliding off-screen is not.
3. **No overlap** — nice to have. Pursue it only when it costs nothing in 1 or 2.

**So the algorithm is: pick the largest scale that keeps the canvas at/above its floor AND inside the
viewport; shrink the chrome (pad buttons 64 -> 56/48, smaller gap) BEFORE shrinking the field below the
floor; and if it still does not fit, LET IT OVERLAP and report the overlap.** Never shrink the game to
avoid an overlap.

**State the floor explicitly** (a concrete number: e.g. canvas height >= ~55-60% of the viewport
height, or the width-limited scale, whichever is smaller) and justify it in one line.

**ACCEPTANCE — round 4 (supersedes rounds 1-3):** at **390x844 @dpr3, 360x640, 844x390 @dpr3 and
640x360**:
1. **HARD FAIL if** the canvas is below the floor, outside the viewport, or missing/collapsed.
2. **HARD FAIL if** any chrome element (`#touch button.cog`, pad buttons, `#hints`) is pushed outside
   the viewport.
3. Overlap between the canvas and chrome is **ALLOWED and must be REPORTED** — number of intersecting
   elements and the overlap area per element — but must never be asserted as zero. (Portrait sizes
   should still come out clean; report them as clean if they are.)
4. One PNG per size in `docs/art/mobile-embed-<date>/`, read back visually.
5. `bash tools/run_suite.sh` to `redfiles=0`; no assertion weakened; retargets as file + line + why.
6. **NO SIMS** (owner directive: nothing over 60 seconds). Browser geometry only.

---

## ROUND 5 — CONTROL BANDS (owner, 2026-09-18, msg_01M2S6XRT0: "it should do its best to keep the
buttons off the canvas in landscape. There's plenty of screen room on my phone and it still overlaps")

Round 4 made overlap acceptable; the owner then saw that landscape phones have ample room that the
round-4 layout was not using — the bands are now RESERVED FIRST and the canvas fitted into what
remains. Round 4's priorities still hold underneath: the floor and the viewport bounds are hard, and
below the breaking size the round-4 letterbox (overlap accepted) is the NAMED FALLBACK, not a
collapse.

**POLICY (fitCanvas, src/main.js — ROUND 5 block):**
- LANDSCAPE: side bands for the pads (live-measured pad rects + 6px `BAND_MARGIN`), top band for the
  cog row; the canvas is fitted into the remainder, CENTRED, aspect preserved (letterbox, not zoom —
  the extent-not-zoom rule stands). The floating stick's HOME band (`#steer-zone`) is the whole LEFT
  band.
- PORTRAIT: bottom band for the pads, top band for the cog row; `#steer-zone` is the bottom-centre
  strip between the pads (the fixed joystick's old slot).
- `bandFit(vw, vh, bands)` is a PURE function (exposed via `__TEST`) — largest 480x300-aspect rect
  inside the unreserved area; if the R4 floor (`min(0.55vh, vw/1.6)`, 1px rounding slack) is missed,
  it returns `fallback: true` and fitCanvas takes the round-4 viewport-limited top-aligned letterbox.
- Desktop / `#touch.cog-only` keeps round 4 verbatim (the bands only exist on the live touch layer).
- Bands are re-measured LIVE on every fit, so immersive mode's 78px pad buttons grow the bands
  automatically.

**BREAKING SIZE (measured, not guessed):** pure-fit zero-overlap stops being possible at roughly a
540px landscape width at 360px height (side bands 112+112px leave too little for the floor). Below
it: the named round-4 fallback — the canvas holds the floor, the pads overlap, and the verifier
REPORTS the overlap instead of asserting it away.

**ACCEPTANCE — round 5 (on top of round 4's hard priorities):** at landscape **844x390 @dpr3,
896x414, 780x360, 640x360** and portrait **390x844 @dpr3, 320x568**: ZERO intersection between the
canvas rect and every visible control rect (both pads and every touch button, the cog row, `#hud`,
`#joy` when shown, `#steer-zone`), measured LIVE by getBoundingClientRect in a REAL browser with the
touch layer live and a run playing — `tools/verify_control_bands.mjs` (41 checks; also drives MANUAL
through REAL pilot taps and arms the floating stick from `#steer-zone` with a real
press-drag-release, asserting the live `pilotInput`). Node guard: `test/test_control_bands.mjs`
(pure bandFit matrix + steer-zone routing, incl. the 480x320 fallback probe).
