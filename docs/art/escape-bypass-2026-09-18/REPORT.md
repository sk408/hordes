# ESCAPE SCENE — VARIANT B + PILOT DETAIL + BOSS ART AND LAYOUT (2026-09-18)

Owner ask (2026-09-17/18, verbatim): *"Variant b is good. The pilot still
needs more detail. Also the boss needs art. It's hidden in a box for some
reason. It needs to be out in the open with platforms arranged that allow it
to be bypassed. Platforms can be floating with no connection to solid ground.
That is acceptable."*

## What was already at HEAD vs what this pass built

Recon found items 1–3 of the ask already shipped by the 2026-09-17 art pass
(commits c1cd3ff/0a54284, with the owner quotes in-code):

1. **Variant B — ADOPTED** (pre-existing). The palette lives as named
   constants in ONE place: `LOOK.PALETTES` at `src/escape/config.js:260-287`,
   byte-identical to family B "SMOKE INFERNO" from the variants review. The
   variants page itself is kept on disk as the record:
   `docs/art/escape-art-pass-2026-09-17/variants.mjs`.
2. **Pilot detail** (pre-existing). `src/escape/sprites.js:154-304` — 12x17
   sprite, 3 tone steps + lit visor (PILOT_PALETTE), 4-frame run cycle, a
   tucked jump/latch art and a dash lunge; render selection at
   `src/escape/render.js:697-704`. Verified readable at BOTH phone sizes in
   the shots below.
3. **Boss art, out of the box** (pre-existing). What the "box" was, named:
   (a) the old body was a plain dark `fillRect` slab (`render.js`, V1e-era
   shape) and (b) the V1e finale's OVERPASS — platform columns running from
   the walkway top down to KILL_Y — physically engulfed the body, hiding it.
   Both are gone since V1f (2026-09-17): the colossus is a 28x30 sprite
   (BOSS_ART, `sprites.js`) drawn at 3x standing OUT IN THE OPEN on the
   finale floor (`render.js:579-613`), with crest pulse, idle sway and three
   articulated arms (claw/sickle/tendril). Nothing box-like remains.

This pass built the one genuinely missing item — **the bypass** — plus its
invariant, tests and evidence:

## THE BYPASS (the 2026-09-18 ask)

Four floating slabs over the boss, no connection to the ground (explicitly
owner-blessed), rising in two 64px up-hops to the air lane (p.y <= 182),
crossing above the colossus, stepping back down before the portal.
`src/escape/generator.js:298-322` (`finaleSegment`), invariant
`checkBypass()` at `generator.js:334-381`, float rendering at
`src/escape/render.js` (lit top lip + ember underglow + hanging studs — every
standable surface carries a lit edge; the parallax behind is unlit
silhouette, so the route reads as a different visual class at both sizes).

**Why no triggers:** trigger bands are AUTO-ONLY data, so the floats stay out
of `triggers` on purpose — the AUTO pilot keeps running the authored floor
gauntlet byte-identically and the bypass is exactly a player's choice.

### The jump-distance table (task's own ask) — vs the escape's own physics

Run speed 200px/s, jump arc 0.8s / 160px reach, apex 80px (16px safety ⇒
authored up-hop bound 64px). Positions rel the finale's x0:

| hop | from → to        | gap    | needs | vs reach | fire window (>=40px rule) |
|-----|------------------|--------|-------|----------|---------------------------|
| 0   | floor y252 → y188 | abutting (up 64) | 0px | 160px | [60, 148] (88px) |
| 1   | y188 → y124      | 12px   | 46px  | 160px   | [176, 220] (44px) |
| 2   | y124 → y124      | 48px   | 82px  | 160px   | [292, 336] (44px) |
| 3   | y124 → y188      | 32px   | 66px  | 160px   | [400, 453] (53px) |

**No impossible jumps**: worst need 82px against 160px of reach; every fire
window >= 40px wide (no pixel-perfect jumps); every up-hop 64px inside the
apex bound. Proven on every seed by `checkBypass` (test_escape_bypass
check 2, 40 seeds).

### The trade that was built (and why)

- **Direct route** (unchanged): the whole floor through the boss — shorter,
  jump-free, but runs the two ground arms' gauntlet (claw reach 132, tendril
  150) and the telegraphed grab.
- **Upper route** (new): four timed hops whose ONLY arm exposure is the
  sickle's 28px band, crossed mid-jump in ~0.20s — never under a standable
  span (checkBypass proves no float overlaps any arm's tip band in that
  arm's lane). A missed hop lands back on the whole floor below: soft retry,
  the wall is the clock.
- Measured, seed 9, real sim, wall live: finale crossing upper 3.5s vs
  ground gauntlet 3.7s (auto brakes for the claw cadence); whole-run totals
  ~identical (~44.5s both). **The bypass trades execution risk for arm
  exposure, not for a slower line** — success rate is unchanged (both routes
  complete on every tested seed: upper on 2/4/7/9/12/21, auto ground on all).

## Scope freeze — nothing outside the finale geometry changed

Pinned by `test/test_escape_bypass.mjs` check 6 (the owner-freeze pins):
`PAYOUT_K === 1/15`, `PACING` 30/36s at 200px/s, `WALL` 190/212/300/46,
`MAP` 3x3x3000, `BAND` 252/400, `PAID_SKIP` 100000/'escapeskip', arms
GRAB_EVERY 2.4 with reaches 132/96/150. **No payout, duration, wall or
reward constant was touched**, and completion time / success rate are
unchanged (numbers above).

## Evidence (shots/)

Driven through the REAL game (TEST-card funnel, seed 9); the frozen layout
shots disable the wall (the "HORDE PRESSURE 1000027px" readout is the
diagnostic, expected), the upper-route shots run the wall LIVE.

- `before-layout-{390x844,320x568}.png` — pre-change finale (sources at
  af9de62): boss in the open, EMPTY air over the boss (no route).
- `before-layout-portal-{390x844,320x568}.png` — same, portal stop.
- `after-layout-{390x844,320x568}.png` — the four floats with lit tops now
  lead over the colossus, visually distinct from the unlit parallax.
- `after-layout-portal-{390x844,320x568}.png` — same, portal stop (last
  float ends before the portal; the exit is reached from the floor).
- `after-upper-route-{390x844,320x568}.png` — a scripted MANUAL run standing
  on the far high slab, over the boss, in the real game at both sizes
  (completion logged: outcome complete, wall-live pressure ~553-836px spare,
  max pilot height over the boss 118-124px — strictly inside the air lane).

NOTE on evidence hygiene: an earlier capture of the "before" shots was taken
after the code edit (byte-identical to after); they were re-captured against
the pre-change sources and verified float-free. Pre-existing visual nits
observed while verifying (NOT this change, left for the owner): the JUMP pad
overlaps the portal art at the portal stop; the claw's orange telegraph bar
can read as a "cage" bar at a glance; the raw pressure value is shown
undecorated; letterbox dead space on tall phones; the route chain reads thin
at 320x568.
