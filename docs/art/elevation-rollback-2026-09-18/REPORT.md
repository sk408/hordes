# ELEVATION ROLLBACK — equalize the field, keep the mechanic (2026-09-18)

Owner directive (interrupt 2, supersedes elevation v2 of the same day): "We
need to rollback elevation for the time being. It needs more work before we
put it back. The mechanic can be left in, just equalize the elevation so it's
all equal."

## What was equalized (the whole change)

**ONE data block, values only** — `src/stages.js:94-96`, the VERDANT_HOLLOW
`relief` entry:

```js
relief: {
  CELL: 480, LEVELS: 1,   // ROLLBACK 2026-09-18: flat (was 3 + BASIN + TERRACE)
},
```

- `LEVELS: 3 -> 1`. The quantized field collapses: `reliefLevel` is 0
  everywhere, so the grade term is exactly 1 at every seam and nothing tints,
  contours, or routes.
- `BASIN: 560` **removed** from the shipped data (the authored radial hollow).
- `TERRACE { r0: 560, r1: 700, A0, A1, rampW: 0.30, topLevel: 2, apron: 120,
  feather: 0.35 }` **removed** from the shipped data (the authored upper path
  — cliffs, ramps, apron, funnel). `reliefBlocked` is false without a TERRACE
  block, so the blocking rule is inert everywhere.
- The authored block is preserved **verbatim** in the comment directly above
  (`src/stages.js:81-93`). Re-enabling elevation is a DATA RESTORE — paste the
  block back and set `LEVELS: 3`. No code was deleted or re-implemented.

**The one non-values code touch (disclosed):** `reliefWord()` at
`src/stages.js:332-340` — the STAGE card's plain-word relief label now says
"flat ground" when `LEVELS <= 1`. Without it the card would read "1 relief
levels" on the flattened stage. The authored wording returns with the
authored numbers.

**Scope:** VERDANT_HOLLOW (the starting arena) only. The other seven stages
keep their authored graded characters (`LEVELS: 2-4`) — they are graded
(speed cost/pay) but never carried a TERRACE block, so nothing blocks on any
stage. `src/relief.js` is byte-untouched.

## Dormancy confirmation (the mechanic stays in, asleep)

Every hook remains exported and callable, and the inverted tests feed the
AUTHORED values (the comment block, verbatim) to the same pure functions and
prove the whole v2 behaviour still answers:

- the cliff still blocks a 0 -> 2 crossing mid-span (`reliefBlocked` true on
  the authored fixture)
- the ramp staircase still descends in whole steps (2,1,0)
- the apron still pins the floor; `terraceLevelAt` still reads the band top
- the rampward slide never stalls and is always legal
- the sustained radial press still circuits to a ramp, crosses the band, and
  touches the path top (both directions)
- the v2 no-trap flood fill still reaches every sample on the authored field

A future cleanup that deletes `src/relief.js` or any of its exports fails the
suite here.

## Visual consequence — the render goes flat too

Stated plainly: **nothing elevation-related is painted anymore.**
`render.js` already early-returns at `LEVELS <= 1` ("flat is a character") for
the relief tint/contour pass, and `drawTerrace` stands down without a TERRACE
block — no band shading, no cliff face, no ramp grade. The stage card's facts
line reads "... · flat ground". Photographed in `shots/`:

- `rollback-flatband-{390x844,320x568}.png` — the old cliff line (0,520), now
  ordinary ground
- `rollback-oldtop-{390x844,320x568}.png` — the old level-2 path top (0,630),
  visually identical to the floor
- `rollback-beeline-{390x844,320x568}.png` — the horde crossing the old band
  straight to a parked pilot (no ramp detour, no funnel)

## Survivability, re-measured (invariant named, nothing tuned)

Invariant: fresh-profile cohort on the default stage (VERDANT_HOLLOW), 60s
cap per run — mean survived seconds, deaths inside the cap, mean kills.
Instrument: `tools/real_loop.mjs runRealCohort('fresh', 12, ...)` before the
change and after it. Numbers are the game's own; nothing was tuned.

|           | mean survived | deaths inside 60s cap | mean kills |
|-----------|---------------|------------------------|------------|
| BEFORE (authored relief) | 17.4s | 12/12 | 1 |
| AFTER  (flat rollback)   | 17.9s | 12/12 | 1 |

Before times: [16,14,19,7,11,42,24,14,7,9,30,16]; after: [6,27,8,27,20,34,26,9,28,7,17,6].
A fresh pilot's early survival is unchanged within cohort noise — the authored
elevation was neither saving nor killing first-timers measurably. The
temporary measurement script was deleted after use.

## Tests — INVERTED, not deleted

- `test/test_blocking_elevation.mjs` — rewritten as
  `test_elevation_rollback` (12 checks): the shipped field is FLAT (level 0
  every seed; no stage ships TERRACE), nothing blocks any mover anywhere
  (long jumps + old band crossings, every stage — the cliff rule is inert),
  grade is exactly 1 on the rolled-back stage, connectivity is trivially
  whole, the render paints nothing — THEN the mechanic-present/live half
  (AUTHORED fixture, above), then LIVE checks: a walker beelines across the
  old band with the field level 0 along the whole line, a NIGHT run clears
  and auto-continues unattended, the camera still holds the pilot at the old
  floor/ramp/top spots.
- `test/test_stages.mjs` — 3 spots inverted: verdant facts assert the flat
  rollback (`CELL 480, LEVELS 1, no BASIN`), the card line token is
  "flat ground", and the catalog asserts BASIN/TERRACE dormant + LEVELS 1
  (the pure BASIN-model checks stay as the mechanic-present proof). 38/38.
- `test/test_arena_scaleup.mjs` — the relief-character check splits: VERDANT
  must ship the flat rollback, the other seven keep their authored
  characters; the anti-sanctuary park comparison is replaced by the flat
  inversion (field max level 0; contact at the OLD terrace-top coordinates is
  full, 66% measured — no elevation advantage remains). 12/12.
- `tools/verify_blocking_elevation.mjs` — inverted to the flat field (16
  checks, both phone sizes): no terrace paint, whole field level 0, old
  cliff/top spots read 0, camera holds, and 9/9 live walkers cross the old
  band straight.

## Nothing else changes

`src/relief.js` untouched (git-clean). No spawn, economy, pacing, camera, or
meta constants moved. The other seven stages ship byte-identical data.
