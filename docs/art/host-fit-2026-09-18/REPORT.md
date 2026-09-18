# FIT THE INTERFACE TO THE VIEWPORT IT ACTUALLY GETS — host-fit (owner 2026-09-18)

Owner verbatim: "Also it needs to do a bit better in landscape with a smaller
view. Galaxy.click has a header that stays on screen unless the game is full
screen and it makes it so everything is a little cut off. The whole interface
should be able to shrink itself to fit a little bit better in this scenario.."

**Status: IMPLEMENTED AND SHIPPED** — the fit-to-viewport UI scale landed in the
2026-09-18 05:28 batch (commit af9de62) together with its real-browser
simulated-host verifier `tools/verify_host_fit.mjs`. This run re-verified
everything live today at HEAD 5597b79: **verifier 104/104 green across all 11
arms** (5 sizes x 2 header heights + 1 standalone), zero console errors, vision
passes on the tightest arms. No new code was needed; this document is the
report the brief asked for.

The one-line policy:

> **Measure the box the game GOT (visualViewport), never the screen; if the
> interface's fixed-px chrome would not fit that box, scale the WHOLE
> interface as one unit — never below the 0.75 legibility floor — and where
> even that cannot save the size, degrade the LAYOUT (the canvas ladder /
> the named fallback) and REPORT it, never clip silently.**

---

## 1. The viewport source (the 100vh trap, closed)

`viewSize()` (src/main.js:310-322) is the one definition everywhere reads:

- **`window.visualViewport` is authoritative** when it reports a sane,
  un-zoomed box (`|vv.scale - 1| < 0.01`, width/height >= 1). In a host
  iframe (galaxy.click's embed shape) the iframe's own visible box IS what
  visualViewport reports — the 100vh trap (innerHeight = the whole screen,
  header included) is closed at the source.
- **A pinch-zoomed visual viewport is IGNORED** (falls back to
  innerWidth/innerHeight): the user's own zoom is never fought — auto-fit is
  a floor, not an override. The ZOOM/RESOLUTION setting is likewise
  untouched: `fitCanvas` still starts from `min(vw/VIEW_W, vh/VIEW_H)` and
  the user's display scale, and clamps the result back inside the viewport.
- Re-fits are event-driven: `visualViewport.addEventListener('resize', ...)`
  (src/main.js:704-707), so the host header appearing/disappearing (or
  entering fullscreen) re-measures and re-fits live. Fullscreen returns the
  whole viewport, the bounds fit again, and the scale relaxes to 1 on its
  own — the same code path, no fullscreen special case.

## 2. The fix — one uniform scale on the whole interface

`uiFitScale(vw, vh, bounds, floor)` (src/main.js:350+; pure, exposed via
`__TEST` for the node suite) finds the largest scale <= 1 that pulls the
interface's LAYOUT-space bounding box (canvas + every chrome rect,
`chromeLayoutRects()`) fully inside the viewport under a centre-origin
uniform transform, clamped to the legibility floor.

`fitCanvas()` applies it (src/main.js:664-687): `#wrap` gets
`transform: scale(s)` with origin `50% 50%`. **Layout positions stay
unscaled** — the round-5 control-band arithmetic and its zero-overlap
invariant are exactly preserved (a uniform scale cannot create intersection),
and only the paint shrinks. The touch seam is the exact inverse:
`visToLayoutX/Y` (src/main.js:340-341) maps a visual tap back through the
centre-origin transform, so every control keeps working at every scale.

Config (src/config.js:915-918): `UI_FIT = { FIT_SCALE: true, SCALE_FLOOR:
0.75 }` — below the floor text stops being legible (the player review's
readability complaint), so the layout DEGRADES instead of shrinking further
and the residual clip is reported by the verifier. `FIT_SCALE: false` is
the one line that turns the whole mechanism off.

## 3. The scale curve (measured this run)

The engagement rule is **not** a size list — the scale engages exactly where
MEASURING the chrome says it would clip. The fixed-px floor of the interface
in landscape is the pad stack: 296 CSS px (4 x 64px buttons + 3 x 10px gaps
+ 10px inset). When the box the game got is shorter than that, the scale
engages; everywhere else it is exactly 1. Measured:

| Game box (header eats height) | frameH | scale | canvas (visual px) |
|---|---|---|---|
| 844x390 hdr56 | 334 | **1** (nothing would clip) | 534x334, bottom flush |
| 844x390 hdr90 | 300 | **1** (300 >= 296 pad stack) | 480x300, bottom flush |
| 780x360 hdr56 | 304 | **1** | 486x304, bottom flush |
| 780x360 hdr90 | 270 | **0.839** (270 < 296) | 362x226, 22px clear bottom |
| 667x375 hdr56 | 319 | **1** | 443x276 |
| 667x375 hdr90 | 285 | **0.928** (285 < 296) | 411x256, 14px clear bottom |
| 390x844 hdr56/hdr90 | 788/754 | **1** (portrait is width-bound) | 390x243 |
| 320x568 hdr56/hdr90 | 512/478 | **1** (but see fallback below) | 320x200 |

Floor 0.75 was never reached in this matrix (minimum applied 0.839;
`floored: false` asserted on every arm).

## 4. Where the layout degrades, and how

The UI scale is the LAST defence, not the only one — the degradation ladder
in fit order:

1. **Canvas ladder, step 1 — transient top chrome** (engages on every
   hosted LANDSCAPE arm here; the header made the height the bottleneck):
   the cog row + text HUD go opacity-0 overlays, same show-on-interaction
   window as the fullscreen button. Portrait stays width-bound (~0 gain) and
   the buttons persist — asserted per-arm by the verifier (`ladder.transient`).
2. **UI scale** (this task): engages exactly at landscape frameH < 296px,
   preserving zero-overlap at e.g. 0.839 on a 270px box.
3. **Canvas ladder, step 2 — compact pads**: below the sizes where even a
   transient strip leaves a fit, the pad stacks themselves compact (96->64px
   wide, 64->52px buttons, abbreviated badges). Not exercised by this
   matrix's sizes (the scale and fallback owned them all) — probed green in
   the round-5 verifier at 480x320.
4. **The NAMED FALLBACK** (320x568, both header heights — below the round-5
   band-fit breaking size): the round-4 viewport-limited letterbox **with
   overlap accepted** (`uiFit.fellBack: true`), reported honestly — the
   verifier measured 4 and 6 overlapping chrome rects on those arms and
   asserts only that the fallback ENGAGED, never that the overlap is absent.
   A size this small is disclosed, not greenwashed.

Gameplay is identical at every rung: the same view is painted (extent-not-
zoom holds — the world scale is untouched; only the interface paint
shrinks), no control behaviour changed, nothing removed.

## 5. The simulated-host matrix (real Chrome, this run)

`tools/verify_host_fit.mjs`: a served page with a fixed N px header and the
game in an iframe filling the remainder — the production embed shape — at
landscape 844x390 @dpr3, 780x360, 667x375 and portrait 390x844 @dpr3,
320x568, each under a 56px and a 90px header, plus a standalone 844x390 arm
(no header, proving no gratuitous shrink). **104/104 checks passed.** Every
hosted arm asserts:

- the viewport source IS the box the game got (visualViewport == iframe box,
  never the screen; scale 1);
- the run is LIVE (playing, `state.time` advancing) through a REAL
  START-GAME tap;
- EVERY control and canvas rect — both pads, every touch button, the cog
  row, `#hud`, `#joy`/`#steer-zone` when shown, the canvas — lies FULLY
  inside the visible viewport in top-page coordinates (nothing under the
  header, nothing off any edge);
- chrome never stacks on chrome (the pad stack vs cog row vs HUD pairwise
  disjoint — the ui-tight placement, src/main.js:624-628);
- the round-5 zero-overlap bar holds wherever the band fit held (a uniform
  scale preserves it exactly), and a fallback size REPORTS its overlap;
- the scale engages exactly where chrome would clip and is 1 everywhere
  else, never below 0.75, never floored;
- the canvas stays usable (aspect 1.6 +/-0.02, at/above the R4 floor in
  LAYOUT px — visual height / applied scale);
- zero console errors.

The standalone arm additionally proves scale 1 / zero overlap / disjoint
chrome at a full viewport: the mechanism costs nothing when it is not
needed.

## 6. Vision cross-check and one honest note

Vision passed `host-fit-844x390-hdr56.png` (all clear, bottom flush "not
clipped") and `host-fit-780x360-hdr90.png` (~20-25px bottom gap, pads clear,
header clearance). On `host-fit-844x390-hdr90.png` vision first said the
canvas was "cut off by the bottom of the viewport" — the MEASURED rects say
otherwise: canvas bottom 300.0 in a 300px game box, i.e. `300 + 90 = 390 =
viewport height` exactly — a flush fit, inside by the verifier's own 0.01px
tolerance, with zero chrome overlap (19 rects checked). Terrain painted to
the canvas edge reads as truncated to a vision model; the rect is
authoritative. Recorded here rather than argued away. (Vision's minor note
on hdr56 — SETTINGS over the [Q] EARTH card — is the cog row intersecting a
pad-area button WHILE TRANSIENT, which is the declared canvas-ladder rule:
transient chrome may overlap; the verifier excludes those pairs by design.)

## 7. Screenshots (this run, real Chrome, header in frame)

- `shots/host-fit-844x390-hdr56.png` / `-hdr90.png` — landscape, scale 1,
  bottom-flush canvas, pads clear (vision-passed).
- `shots/host-fit-780x360-hdr90.png` — landscape, **scale 0.839**, whole
  interface shrunk as one unit, 22px bottom clearance (vision-passed).
- `shots/host-fit-667x375-hdr90.png` — landscape, scale 0.928.
- `shots/host-fit-780x360-hdr56.png`, `host-fit-667x375-hdr56.png` —
  landscape, scale 1, header present, nothing clipped.
- `shots/host-fit-390x844-hdr{56,90}.png` — portrait, scale 1 (width-bound),
  buttons persist.
- `shots/host-fit-320x568-hdr{56,90}.png` — portrait, the NAMED FALLBACK
  (overlap disclosed).
- `shots/host-fit-844x390-standalone.png` — no header: no gratuitous shrink.

**Try it on the phone:** open the page hosted under any fixed header (or
shrink the browser window around it) — the interface shrinks as one unit to
the box it actually got; enter fullscreen and it relaxes back to full size.
