# ADDENDUM — SACRIFICE ONLY WHERE IT PAYS (owner 2026-09-17, msg 78PTR)

Owner verbatim: "Right in portrait, the top buttons should persist most of the
time because canvas gains nothing by having be transient"

**Status: this rule IS the shipped ladder's core decision** — there is no
orientation hardcode anywhere. Every sacrifice is gated on a MEASURED canvas
gain, re-measured on every fit. This run verified it live at HEAD 5597b79 for
BOTH steps, both orientations (canvas-ladder 42/42 incl. the per-arm
"transience would NOT pay here" checks; compact probes at 480x320 landscape
and 390x844 / 320x568 portrait).

## 1. The threshold (chosen and stated)

`TOP_CHROME` (src/config.js:871-874):

- **ENGAGE at gain >= 3% of viewport height** — a sacrifice is worth making
  only when it grows the canvas rect by at least ~3% of its height
  (at 390px tall: ~12px).
- **RELEASE below 1.5%** — hysteresis deadband: a gain hovering at the
  boundary can never flicker the strip on/off.
- Pinned pure in `test/test_canvas_ladder.mjs`: at-the-bar engages (>=),
  just-under does not, inside the deadband state NEVER changes, and **a
  measured gain of 0 NEVER engages — and relaxes even if it was on**.

The gain itself is measured, not guessed (`fitCanvas`, src/main.js:583-587):
`gain = bandFit(persistent bands).h − bandFit(transient bands).h`, ZERO
wherever the persistent fit has already fallen back (reclaiming the strip
cannot grow a fallback canvas, so the buttons persist there too).

## 2. Per-orientation application — each sacrifice only where it pays

| | Portrait (width-bound) | Landscape height-bound | Landscape width-bound (640x360) |
|---|---|---|---|
| Sacrifice 1 (top strip → overlays) | **refuses** — gain 0, buttons PERSIST | pays — engages at +15-16% vh | **refuses** — gain 0, buttons persist |
| Sacrifice 2 (compact pads + A1/A2/M) | **refuses** — full labels, full pads | pays where the fit fell back (480x320: fallback → clean zero-overlap fit) | refuses — ordinary fit holds |
| 3rd rung (named fallback) | only if even compact cannot rescue (hosted small boxes) | same | same |
| 4th rung (ui-fit scale, floor 0.75) | only when chrome would clip the viewport | same | same |

Note the second column's third entry: the rule is BETTER than an orientation
check — **a width-bound LANDSCAPE phone (640x360) also refuses transience**
(gain 0, measured), which no orientation hardcode would have done.

## 3. The canvas-rect deltas — where each sacrifice pays and does not

Measured live this run (before = ladder pinned OFF, after = auto):

**Sacrifice 1 — pays exactly on the height-bound arms:**

| Arm | canvas before → after | gain | decision |
|---|---|---|---|
| 844x390 landscape | 524x328 → **620x387** | 59px = **15.13% vh** | ENGAGE |
| 844x390 hosted hdr90 | 380x238 → **480x300** | 62px = **15.9% vh** | ENGAGE |
| 640x360 landscape (width-bound) | 416x260 → 416x260 | **0** | persist |
| 390x844 portrait | 390x243 → 390x243 | **0** | persist |
| 320x568 portrait | 320x200 → 320x200 | **0** | persist |

**Sacrifice 2 — pays only where the fit had fallen back:**

| Arm | canvas before → after | labels | decision |
|---|---|---|---|
| 480x320 landscape (below ~540px break) | 320x200 → 320x200, **fallback overlap → clean zero-overlap fit** | `PILOTAUTO_ALL` → `PILOTA1` (→ `A2` on tap) | ENGAGE (pads 96→64, buttons 64→52) |
| 390x844 portrait | 390x243 → 390x243 | `PILOTAUTO_ALL · PATROL` → tap → `PILOTAUTO_MOVE · PATROL` — **FULL wording** | refuse |
| 320x568 portrait | 320x200 → 320x200 | **FULL wording** both states | refuse |

(The compact refusal in portrait is not a policy flag: compact engages only
when the ordinary band-fit has FALLEN BACK and the compact fit HOLDS
(src/main.js:599-610) — in portrait the ordinary fit holds, so compact never
arms; where compact cannot rescue either, it reverts rather than spending UX
for nothing.)

## 4. The honesty check (point 4 of the brief)

**Both steps show EXACTLY zero gain in portrait** — no step claims a gain
there, so there is no wrong measurement and no space-wasting layout to
explain: the canvas is width-bound at fixed aspect, the top strip lives in
free vertical space (`persistentH == transientH == 243` at 390x844, `== 200`
at 320x568, gain exactly 0.0), and the labels' width is not the canvas's
bottleneck. The live badge text is the direct proof: portrait buttons read
`PILOTAUTO_ALL · PATROL` / `PILOTAUTO_MOVE · PATROL` — the full wording —
while the same tap on the same button at 480x320 landscape reads `A1`/`A2`.

## 5. Nothing else changed

The persistent/transient overlap rule stands (pads never intersect the
canvas; the transient strip is inert while hidden), controls stay hittable
(44x44 layout-px floor, hit-box audit green at every size) and legible
(full labels everywhere the ladder does not pay), ZOOM is honoured, nothing
clips — all re-asserted by the same verifier runs this session.

**Try it:** hold a phone in portrait — the top row and full labels stay put
(transience would buy nothing); rotate to landscape — the top strip folds
into the fullscreen button's reveal window and the canvas takes ~15% more
height; rotate back — the buttons return.
