# ESCAPE MAP SCALE-UP + ELEVATED PATHS — 2026-09-17

Task msg_01M2R8SMAGTQGERPRZFNHQKJ3K. Owner ask, verbatim: "Ok we should also
make the map quite a bit larger. I'd say if we call 1/4 of this map a unit,
one more unit to the side and more unit up for a total of 5 more units. And we
need some dynamic aspect to it. Elevated paths, like a megabonk map."

All measurements below are from the shipped test/verifier runs of this pass:
`test/test_escape_scaleup.mjs` (10 checks) and `tools/verify_escape_scaleup.mjs`
(9 checks x 2 viewports).

## 1. THE UNIT READING — confirmed before building

One unit = one quarter of the CURRENT map, on EACH axis of the corridor's
world. The escape is a ONE-WAY side-scrolling corridor, so the owner's 2x2->3x3
AREA reading maps onto the corridor's TWO world axes:

| axis | unit | shipped (2 units) | now (3 units) |
|---|---|---|---|
| LENGTH ("one more unit to the side") | `MAP.UNIT_W` 3000px | 6000px guaranteed-min | 9000px target (measured 9069-10720 incl. the same +20% authored variance `PACING` always expressed) |
| VERTICAL BAND ("one more unit up") | `MAP.UNIT_H` 66px | 132px authored band (`MIN_TOP` 120) | 198px band (`MIN_TOP` 54) |

The unit is EXTENT, not zoom: tile sizes, camera scale and sprite sizes are
untouched — nothing looks smaller, there is just MORE corridor. 9 units total
(was 4). The constants live in `src/escape/config.js` `MAP`; nothing else in
the escape reads a length.

**Counter-case proven** (`UNITS_X` flipped back to 2 through the live-object
seam, restored after): the SAME generator emits the shipped ~6924px 2-unit
corridor — the 9-unit build is not propped up by any hardcoded extent
anywhere.

## 2. WHAT GREW

- **Parallax**: unchanged in code (it is infinite-scroll by construction);
  it simply scrolls ~1.5x longer per run.
- **Platform/terrain generator**: the extent target is units-based
  (`UNITS_X * UNIT_W` with `PACING`'s own variance ratio), plus TWO new
  templates that spend the third vertical unit (see section 3).
- **Route**: start->exit is unchanged in kind (one-way, ends at the boss +
  portal); it is 1.5x longer and now climbs.

## 3. ELEVATED PATHS — what "like a megabonk map" turned into

Public-material reading of Megabonk's verticality (sources: megabonk.org
guides/maps, r/megabonk terrain threads, Steam discussions, store page): 3D
third-person heightmap terrain with a jump button; elevation is dodging and
route advantage, NOT stat advantage. Two community complaints found: enemies
with seek-only AI get stuck on ledges (confirmed safe-spot problem), and the
camera handles verticality poorly (players cannot always see where they are
going). What we MATCHED, and deliberately did not:

| Megabonk behaviour | This pass |
|---|---|
| elevation as route/dodge advantage (their design) | MATCHED — decks and stacks are alternate routes |
| enemies stuck on ledges / safe-spot exploit (their bug) | STRUCTURALLY ABSENT — chasers cannot platform by construction; the horde floor keeps refilling under the deck; the WALL never pauses, so "camp the deck" is bounded relief, never an off switch |
| static-ish camera on vertical terrain (their complaint) | DELIBERATE FIX — `camYFor`, a pure vertical pan (0..48px), tracks the pilot up and ALWAYS keeps the floor line on screen (252-48=204 of 300) |
| upper-level threat mix | OWNER-DIRECTED INFERENCE (not Megabonk-confirmed): fliers spawn into the ELEVATED pilot's own lane (`FLIER_LANE_DROP` 40 / `FLIER_LANE_Y` 54) — the deck trades the ground horde for air pressure; keep-clear (never within 22px) still holds, so no unavoidable damage exists at any height |

The two new generator templates (structural, not decoration — the floor route
under every deck stays WHOLE and walkable, asserted across 20 seeds):

- **deckSegment** (tier 1-2): an authored up-hop onto a raised walkway 48px
  (tier 1) / 56px (tier 2) above the floor; tier-2 decks carry one deck-level
  gap jump. The horde keeps charging UNDER the walkway.
- **stackSegment** (tier 2): floor -> deck1 -> deck2, two 56px up-hops, deck2
  top 112px over the floor — the corridor's tallest authored point, inside the
  third vertical unit. Rendered as a slab on struts (a solid column would wall
  off the floor lane below, which stays a real route).

Measured mix across 20 seeds: 44 deck segments (18/20 seeds), 8 stack
segments (6/20 seeds); the stack top is always y=140.

## 4. THE HEIGHT/JUMP-REACH TABLE

Every trigger classed by what it asks of the arc; "clear" = slowest window
speed's arc clears the gap/deck edge by >= that many px; "land" = fastest arc
lands >= that many px inside the landing platform. Airtime 0.8s, apex 80px;
actual horizontal reach across the std window: 144-176px. All rows proven per
trigger by the generator invariant (0 failures across 80 seeds) and re-derived
in the scale-up test:

| class | count (20 seeds) | slowest arc clears by >= | fastest lands >= | inside |
|---|---|---|---|---|
| floor gap (flat) | 89 | 18px | 39px | arc's fat middle |
| gap +28..32px up (terrace) | 50 | 34px | 44px | fat middle |
| gap +34px up | 26 | 22px | 32px | fat middle |
| gap 34px down | 15 | 14px | 42px | falling is free |
| deck gap (deck level) | 25 | 30px | 42px | fat middle, deck-to-deck |
| up-hop +48px (tier-1 deck) | 19 | 12px | 158px | descending crossing |
| up-hop +56px (tier-2 deck/stack) | 41 | 12px | 152px | descending crossing |

No impossible jumps: every authored hop height is <= 64px (apex 80px minus
the 16px safety), measured PER HOP — the stack's 112px total is two 56px hops,
never one jump.

## 5. AUTO-PILOT + ELEVATION (the hard requirement)

- **AUTO completes the 9-unit map on every seeded corridor** (12/12 in the
  test), at BOTH 60Hz and 120Hz with identical outcomes AND identical climb
  (min-y parity within 2px).
- **It actually climbs**: min player y = 119 (the stack's second-hop apex) on
  11/12 seeds, 141 on the twelfth; 559-973 elevated steps per run. The
  up-routes are ridden, not routed around.
- **Unattended through the REAL seam** (integration test): a live run enters
  the escape via the portal-cine hand-over, ZERO manual input, and pumps to
  ESCAPE COMPLETE in 47.1s with the bank credit landing exactly once.
- **Night mode**: unchanged — night runs keep the ONE sanctioned skip at
  `startEscape` (an unattended run cannot play a side-scroller; skipping
  without the writ forgoes the payout). Whether night runs should now PLAY
  the escape is the owner's economy call, NOT changed here. The unattended
  AUTO completion above proves the mode CAN complete unattended if that call
  is ever made.

## 6. THE ESCAPE GETS LONGER — the consequence, reported not retuned

No payout, duration or reward constant was changed. `PAYOUT_K` stays 1/15,
`PACING` (MIN/MAX_SECONDS 30/36, NOMINAL_SPEED 200) is untouched — only the
extent those bounds span is units-based now. Measured on full auto-played
runs (seeds 1-12, 60Hz):

| | 4 units (before) | 9 units (after) |
|---|---|---|
| mean completion | 31.5s | **47.2s** |
| corridor length | ~6750px | ~10000px |
| gold per completed escape (12000 bestGold) | 800g | 800g |
| **gold per second** | 25.4 g/s | **16.9 g/s** (0.67x) |

Owner's call whether to rebalance.

## 7. FRAME BUDGET + SCREENS

Frame cost (real Chrome on the VPS, rAF-wrap method per `tools/verify_perf.mjs`,
measured over the ELEVATED traversal — deck + stack + flier lane live):

| viewport | p50 | p95 | max |
|---|---|---|---|
| 390x844 @dpr3 | 0.80ms | 1.60ms | 3.20ms |
| 320x568 @dpr3 | 0.80ms | 1.30ms | 7.50ms |

vs 16.67ms (60Hz) / 8.33ms (120Hz) budgets — the same cost class as the
shipped escape (the vertical pan is one integer offset; decks are the same
fillRect budget as floor columns). Loadavg 1.0-2.0 during measurement.

Screens in `shots/`: deck + stack + manual-pads-on-deck at BOTH 390x844 and
320x568. Verified in-browser: the canvas keeps the full 480x300 virtual rect
at both sizes (letterbox ratio check), the camera pan is active on the decks
(camY 2px on tier-1, 37px on the stack, floor line at virtual y=215 of 300 —
the drop-back stays visible), and NO popup/help card covers the manual pads
or the vertical lanes (overlay hidden, help closed, photographed).

## 8. Where the code changed

- `src/escape/config.js` — `MAP` block (UNITS_X/Y, UNIT_W/H); `BAND.MIN_TOP`
  derives from the unit count; `THREATS.FLIER_LANE_DROP/_LANE_Y`.
- `src/escape/generator.js` — units-based extent; `upHop` author +
  `deckSegment`/`stackSegment`; tier-1/2 pool shares (pool dilution
  disclosed: the deck/stack templates are carved out of the existing
  flat/gap/terrace shares, e.g. tier-1 flat .26/gap .56/terrace .78/deck 1.0).
- `src/escape/sim.js` — flier spawn lane bias (elevated pilot -> own lane);
  sticky `lane` field the sine reads.
- `src/escape/render.js` — exported pure `camYFor` pan applied at every draw
  site; deck platforms draw as slab + struts (floor columns unchanged).
- `test/test_escape_scaleup.mjs` (new, 10 checks) and three disclosed
  RETARGETS, all the same one fact (the extent is units-based now; PACING,
  PAYOUT_K and every reward constant untouched):
  - `test/test_v1_escape.mjs`: the duration bound pins the units extent
    instead of the old seconds constant.
  - `test/test_review_round1.mjs` (x2): the review's "<= 40s" duration pin and
    its ">3x gold-per-second" companion pin now read the units bound and
    ">2x" — the honest numbers on a 9-unit map (worst nominal 53.6s; the
    multiple vs the old 60s @ 1/30 baseline is ~2.2x, was ~3.6x at 2 units).
    The review's tier/payout pins are untouched.
- `tools/verify_escape_scaleup.mjs` (new, the browser verifier above).
