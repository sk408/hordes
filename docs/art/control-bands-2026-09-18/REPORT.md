# CONTROLS OFF THE CANVAS — control bands / round 5 (owner 2026-09-17)

Owner verbatim: "Ok on full screen in mobile, it should do its best to keep the
buttons off the canvas in landscape. There's plenty of screen room on my phone
and it still overlaps."

**Status: IMPLEMENTED AND SHIPPED** — the round-5 control-bands layout
(src/main.js:359-690, owner's words quoted in the comment block at :359-362)
landed in the 2026-09-18 05:28 batch (commit af9de62) together with its
real-browser verifier `tools/verify_control_bands.mjs`. This run re-verified
everything live today: **verifier 50/50 green at HEAD 5597b79**, zero page
errors, both required landscape shots vision-passed. No new code was needed;
this document is the report the brief asked for.

The one-line policy:

> **The controls claim their bands FIRST; the canvas is fitted into what
> remains.** Overlap with the reserved chrome is impossible by construction
> (src/main.js:629-636), so no per-button nudging, no orientation guessing, no
> "best effort" — it is a layout invariant, asserted by the verifier.

---

## 1. The layout per orientation (with file:line)

### Landscape (844x390, 896x414, 780x360, 640x360)

`controlBands()` (src/main.js:372-409) measures the LIVE chrome and reserves:

| Band | Contents | Where reserved |
|---|---|---|
| LEFT | left pad's right edge + `BAND_MARGIN` (6px, src/main.js:268) | src/main.js:398 |
| RIGHT | right pad's left edge − margin | src/main.js:401 |
| TOP | cog row / HUD bottom + margin (`topChromeBottom()`) | src/main.js:396 |
| (bottom) | NOT reserved — side bands never stack with top+bottom | comment :386-392 |

- The canvas is fitted-centred into the viewport **minus those bands**
  (`bandFit()`, src/main.js:413-424): uniform scale into the remainder,
  centred top/left, then placed `position:absolute` (:629-636) — "overlap with
  the reserved chrome is impossible by construction".
- **The stick's home band** (`placeSteerZone()`, src/main.js:430-449): the
  whole LEFT band (x from 0 to `bands.left`, y from `bands.top` to vh) — a
  press there arms the floating joystick (:437-440). It is chrome like any
  other: zero-overlap is asserted for `#steer-zone` too.
- Fullscreen button: lives in the top chrome; its hit-test keeps gesture
  priority (canvas handler order, src/main.js:9417-9429 — a dead-centre button
  tap toggles fullscreen and never arms the stick, probed by the verifier).

### Portrait (390x844, 320x568)

- BOTTOM band = both pads (src/main.js:404-407); canvas sits above it,
  centred, same `bandFit()`/placement path.
- Stick home: the bottom-centre strip between the pads
  (`padInnerLeft..padInnerRight`, needs ≥40px, src/main.js:442-447), and the
  floating stick still arms anywhere on the canvas itself.

### Both orientations — the canvas ladder (measured, never guessed)

Where the measurement says the top strip is the bottleneck (height-bound
landscape like 844x390), the cog row + HUD become TRANSIENT (opacity 0 while
hidden, may overlap the canvas by rule, never other chrome; src/main.js:577+
and `T.ladder`). Where compact pads rescue a fit that full pads cannot, the
compact geometry engages (:591+). Both steps are gains, never guesses — the
verifier asserts `ladder.transient` per size and it is FALSE for 640x360 and
every portrait (width-bound: the top strip is not the bottleneck there).

## 2. The verifier and the matrix result

`tools/verify_control_bands.mjs` (real Chrome, CDP touch emulation, the touch
layer live on its own, a REAL run playing, `hordes_onboarded` set) — run
today: **50/50 checks passed, 0 page errors**. Matrix:

| Size | Zero overlap (AUTO + MANUAL) | Stick from home band | Transience |
|---|---|---|---|
| 844x390 landscape @dpr3 | YES | armed, vec (1, mag 1), released 0 | engaged |
| 896x414 landscape | YES | same | engaged |
| 780x360 landscape | YES | same | engaged |
| 640x360 landscape | YES | same | not engaged (width-bound) |
| 390x844 portrait @dpr3 | YES | same | not engaged |
| 320x568 portrait | YES | same | not engaged |
| 480x320 landscape (probe) | YES — compact pads rescue | same | not engaged |

Every size additionally asserts: run live (`state.time` advancing), canvas
usable (aspect 1.6 ±0.02, fully inside the viewport, at/above the floor),
every chrome element on-screen, MANUAL reached through REAL PILOT-button taps,
and the home-band press-drag-release driving the REAL `pilotInput`. The
checked rects: both pads, every visible touch button (cog row included),
`#joy` when shown, `#steer-zone`, `#hud` — each must intersect the canvas rect
by exactly zero area.

## 3. Where it stops being possible — the honest answer

- **Pure-fit break: ~540px landscape width at 360px height.** Below that,
  full-size pads + canvas cannot share the row at the 1.6 aspect.
- **Compact pads (canvas ladder) rescue a clean fit down to at least
  480x320** — probed, zero overlap measured, not asserted away.
- **Below the R4 floor** (canvas height < `min(55% × vh, vw/1.6)`,
  `CANVAS_FLOOR_FRACTION` = 0.55, src/main.js:275) the NAMED FALLBACK owns it:
  the round-4 viewport-limited letterbox **with overlap accepted**
  (src/main.js:637-649, sets `lastFitFellBack`, steer zone hidden). It is
  reported, never greenwashed — the verifier's breaking-size branch exists
  precisely to name this rather than pretend.

Gameplay is identical in every case: extent-not-zoom stands (the same view is
letterboxed smaller), no control behaviour changed, nothing removed.

## 4. Scope

The same `fitCanvas()` path runs under fullscreen/immersive AND normal play —
it is gated only on the touch layer being live (`touchLayerLive`,
src/main.js:575), not on fullscreen state, so the owner's phone sees the same
disjoint layout either way. UI-fit uniform scale on `#wrap` (centre-origin,
src/main.js:664-687) preserves the invariant because layout positions stay
unscaled and `visToLayoutX/Y` (src/main.js:340-341) is the exact inverse.

## 5. Screenshots (this run, real Chrome, live runs)

- `shots/control-bands-844x390.png` — landscape, vision-passed: ~165-170px
  letterbox separation each side, canvas centred, pads fully clear.
- `shots/control-bands-780x360.png` — landscape, vision-passed: ~55px left
  gap, clear right gap, centred, zero control intrusions.
- `shots/control-bands-{896x414,780x360,640x360,390x844,320x568,480x320}.png`
  — the rest of the matrix.

**Try it on the phone:** open `index.html`, start a run, rotate to landscape
(fullscreen optional) — pads pin to the sides, canvas centres between them,
touch the left band (or anywhere on the canvas) to steer.
