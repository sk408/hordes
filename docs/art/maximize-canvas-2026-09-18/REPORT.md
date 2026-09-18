# MAXIMIZE THE CANVAS — the owner's sacrifice ladder (2026-09-17/18)

Owner verbatim: "Generally we're looking for max canvas size in any setting.
And having the buttons resize themselves if needed to help that. First thing
to sacrifice could be the top buttons. They could become overlays like the
full screen button which appear and disappear. 2nd would be reduced text in
the control buttons. A1/A2/M, that kind of thing"

**Status: IMPLEMENTED AND SHIPPED** — the ladder landed across the
2026-09-17/18 batches (TOP_CHROME + PADS_COMPACT config, the ladder steps in
`fitCanvas`, `pilotBadgeText` abbreviations) with its two real-browser
verifiers. This run re-verified everything live at HEAD 5597b79:
**canvas-ladder 42/42, control-bands 50/50, zero console errors**, plus a
dedicated compact-delta probe. One new artifact this run:
`tools/probe_compact_delta.mjs` (the step-2 before/after measurement + the
live A1→A2 badge proof). No game code needed changing.

---

## 1. The rule that makes it work (stated, and enforced by the verifier)

> **PERSISTENT controls may NOT intersect the canvas rect. TRANSIENT
> overlays MAY — but only while revealed, and while hidden they are
> completely INERT: opacity 0, `pointer-events: none`, and
> `elementFromPoint` at their centre returns the canvas, not the button.**

Enforced at every size by `tools/verify_canvas_ladder.mjs` (the
`padOverlaps` / `transientOverlaps` / `hiddenCogs` measurement, checks
"PERSISTENT controls never intersect the canvas" and "transient strip
hidden = INERT"). Dismissibility: the strip rides the SAME show/fade window
as the fullscreen button — the interaction that summons it (any canvas
touch) is the interaction that dismisses it (0.5s window, `body
.chrome-reveal`), and nothing traps input while hidden.

The thumb pads are PERSISTENT by owner ruling — the player needs them while
playing — so only the TOP strip is transient, and only where measurement
says it pays.

## 2. Sacrifice 1 — the top buttons become overlays

The top-edge inventory (all of it goes transient, one system):

| What sits along the top | Role |
|---|---|
| `tc-cog` (SETTINGS) | opens settings |
| `tc-help` | help mode |
| `tc-radar` | A2 radar toggle |
| `tc-map` | map screen |
| `#hud` (text HUD: HP/MP/XP/GOLD readout row) | passive readout |

All five ride the fullscreen button's existing reveal window — there is ONE
show/fade system, not a second one (`body.chrome-reveal`, asserted by the
verifier's reveal check: a real canvas tap shows the strip at opacity >0.99
with pointer-events auto, and it hides again after HIDE_S).

The strip is given up ONLY where it buys canvas: the ladder MEASURES both
fits (`ladderMeasure`: persistent vs transient band-fit heights) and engages
transience only at `gain >= 3% of vh` with hysteresis (relax below 1.5%) —
`TOP_CHROME.GAIN_ENGAGE/RELEASE` (src/config.js:871-874), the pure decision
pinned in `test/test_canvas_ladder.mjs`. There is no orientation check or
device list anywhere: portrait measures ~0 gain (width-bound) and keeps the
buttons; width-bound landscape (640x360) keeps them too.

## 3. Sacrifice 2 — control text shrinks to abbreviations (with pad geometry)

Where even a transient strip cannot save the fit, the pad stacks themselves
compact (src/config.js:884-888): pad width 96→64 CSS px, buttons 64→52 CSS
px, and the pilot rungs abbreviate to the owner's own short forms. The
mapping (`pilotBadgeText`, src/main.js:9152-9156; pinned pure in
`test/test_canvas_ladder.mjs`):

| Full wording | Abbreviation (compact) |
|---|---|
| `AUTO_ALL` | `A1` |
| `AUTO_MOVE` | `A2` |
| `MANUAL` | `M` |

The act suffix rides along (`AUTO_ALL · FLEE` → `A1 · FLEE`); unknown modes
pass through unchanged (no silent renames). The full wording stays
reachable off the button: the SETTINGS pilot card (`pilotPrefLabel`) and the
help-mode explainer carry it. Verified LIVE this run
(`tools/probe_compact_delta.mjs`, 480x320): the button's textContent went
`PILOTAUTO_ALL · PATROL` → `PILOTA1 · PATROL` → (one real tap)
`PILOTA2 · PATROL`, and the vision pass on the shot reads the `A2 · PATROL`
badge on the pad.

Compact engages ONLY where it pays: when the ordinary fit has fallen back
AND the compact fit holds; it reverts if compact rescues nothing, and
relaxes the moment the ordinary fit holds again (src/main.js:599-610).

## 4. The ladder's next rungs — what is sacrificed third (and why)

**(3) The zero-overlap guarantee itself — the NAMED FALLBACK.** Below the
sizes even compact cannot rescue (portrait 320x568; landscape 480x270),
the fit falls back to the round-4 viewport-limited letterbox with overlap
ACCEPTED and DISCLOSED (`uiFit.fellBack: true`; the control-bands verifier
measures and reports the overlapping rects instead of asserting them away).
Reason: at those sizes the alternative is a collapsed or microscopic
canvas — a smaller-but-clean canvas below the display-scale floor was
judged worse than a disclosed overlap at the floor size. It is reported,
never hidden.

**(4, final rung) Overall size — the UI-fit uniform scale**, floored at
0.75 (`UI_FIT.SCALE_FLOOR`): the whole interface shrinks as one unit so
nothing clips outside the viewport (the host-header scenario; see
`docs/art/host-fit-2026-09-18/REPORT.md`). Below the floor the layout
degrades rather than shrinking further.

## 5. The measured canvas deltas (real Chrome, this run)

Step-1 arms (`tools/verify_canvas_ladder.mjs`, ladder pinned OFF = the old
persistent layout, vs AUTO):

| Arm | canvas BEFORE | canvas AFTER | delta |
|---|---|---|---|
| 844x390 | 524x328 | **620x387** | **+96w / +59h (gain 15.13% of vh)** |
| 844x390 hosted hdr90 | 380x238 | **480x300** | **+100w / +62h (gain 15.9% of vh)** |
| 640x360 | 416x260 | 416x260 | 0 — width-bound, strip is not the bottleneck, buttons persist |
| 390x844 portrait | 390x243 | 390x243 | 0 — measured gain 0, buttons persist |
| 320x568 portrait | 320x200 | 320x200 | 0 — below the compact rescue, named fallback (reported) |
| 480x270 landscape | 213.8x133.3 | 213.8x133.3 | 0 — compact could not rescue either, fallback + ui-fit scale 0.839 |

Step-2 arm (`tools/probe_compact_delta.mjs`, 480x320 — below the ~540px
pure-fit break):

| | canvas | pads | pilot badge | layout |
|---|---|---|---|---|
| ladder OFF | 320x200 | 96px, 64px buttons | `PILOTAUTO_ALL · PATROL` | NAMED FALLBACK — pad overlap accepted |
| AUTO (compact) | 320x200 | 64px, 52px buttons | `PILOTA1 · PATROL` | **clean fit, zero overlap** |

At this size compact did not grow the canvas — the canvas was already at
its display-scale floor (320x200); what compact bought is that the
floor-size canvas now fits WITHOUT the overlapping fallback (and it is what
keeps 480x320 out of the fallback the 320x568 class sits in).

**Which step bought the most: sacrifice 1, by far** — +59 to +62 canvas
height (+96 to +100 width) on every height-bound landscape arm, ~15-16% of
the viewport height, versus step 2's purchase at the floor sizes (overlap
elimination at unchanged canvas rect).

## 6. Floors preserved (the player review's readability complaint)

- **Touch floor: 44x44 LAYOUT px** (`PADS_COMPACT.HIT_MIN`), asserted by
  the hit-box audit at every matrix size — every visible button measured,
  all >= 44 both axes in layout px (visual = layout x uiFit scale; the
  ui-fit scale is itself floored at 0.75, so the fingers never get below
  ~33 CSS px visual at the worst floored case, reported alongside).
- Fullscreen icon stays 22x18 view px with a 64x56 hit box (the owner's
  "make the hit area larger... keep the visual size of the icon the same");
  REAL synthesised taps at the hit box's centre and all four edges each
  fire the toggle, and the enlarged target is inert while the window is
  closed.
- Control behaviour unchanged — size and label only. The user's
  ZOOM/RESOLUTION setting is honoured untouched (priority 1: never outside
  the viewport). Nothing clipped, nothing outside the viewport (asserted
  per-arm by both verifiers).

## 7. Evidence

- `tools/verify_canvas_ladder.mjs` — **42/42** (per-step deltas, transience
  pays/transience refuses, persistent/transient rule, ONE reveal system,
  inertness while hidden, hit-box audit, real 5-point tap test).
- `tools/verify_control_bands.mjs` — **50/50** (the 480x320 compact arm:
  `compact === true && overlapCount === 0`; zero overlap for persistent
  chrome AUTO and MANUAL both, real stick steering).
- `tools/probe_compact_delta.mjs` — NEW this run: the step-2 before/after
  + live badge cycling A1→A2 by a real tap.
- `test/test_canvas_ladder.mjs` — the pure pins: ladderDecide thresholds +
  hysteresis, the A1/A2/M mapping, fsHitRect geometry.
- Shots (`shots/`): `canvas-ladder-844x390.png` (vision PASS — large
  canvas, pads alongside, top chrome in its revealed state, nothing
  clipped), `canvas-ladder-844x390-hdr90.png` (hosted), the persist arms,
  `compact-480x320.png` (vision PASS — `A2 · PATROL` badge on the pad,
  canvas clear of both pads), `control-bands-480x320.png`.
