# FIRST-RUN PROLOGUE — report (2026-09-18)

Owner ask: "a potion seen on screen and the pilot walks towards it... no
enemies spawn and the timer hasn't started... dismissible (with an ok button)
banners explaining some of the basics."

ADDENDUM (owner, same day): "pilot could pause for these since we haven't
given the player any control yet..all buttons should be disabled during this
initial period." — see the ADDENDUM section at the bottom.

## What shipped

### The phase (run #1 only, no new saved field)

Armed ONLY when `achievements.totals.runs === 0` (the EXISTING counter,
`Number(...) || 0` so a sparse fresh save reads 0 — no new saved field).
`startRun` stamps `state.prologue = { t, drunk, potion, bannerIdx, banners }`
or null (src/main.js ~7342).

While the phase lives:
- **Inert world** — the spawn pass early-returns, so no enemies spawn.
- **Frozen clock** — `state.time` never advances during the phase; the phase
  keeps its own `prologue.t`. The run clock starts at phase END, so the
  prologue is excluded from run duration and every pacing figure by
  construction (tests assert `st.time === 0` for the whole phase, and
  `t < 0.05` at the end).
- **Bound** — `C.PROLOGUE.MAX_S = 60` (src/config.js). A player who never
  walks still gets a run.

### The exits

1. **Drunk** — walking onto the potion drinks it (both pilot modes; the AUTO
   pilot's first act is the PROLOGUE walk, so an unattended run also drinks).
2. **The bound** — 60s, no shield, no banners, run starts.

### The potion

- View placement `p.x + 115, p.y - 20` clamped inside the view → lands at
  ~(355, 130) on a fresh spawn: MIDDLE-RIGHT, deliberately clear of the
  banner card (which spans x 90..390, y 24..116 — the potion sits beside its
  bottom edge, never under it).
- Visually distinct: a TALLER bottle than an ordinary drop (drawn at 2x —
  12x18 view px, the player sprite's own size class), a slow iridescent hue
  cycle (static under reduced motion), plus a beacon ring (1.6s pulse) so it
  reads as THE thing to walk to from anywhere on screen. Ring alpha has a
  0.25 floor so no static frame catches it fully faded.
- Same pickup semantics: the ordinary pickup hook tests overlap and calls the
  drink.

### The banners (copy, and why)

Four, OK-dismissible, one at a time. ORIGINALLY non-modal; the same-day
addendum WITHDREW that ("the pilot can keep walking" line) — banners are now
MODAL: the pilot HOLDS while one is up, and each banner waits for
`BANNER_WALK_S = 0.35` of unpaused walking since the last OK (walk -> banner
-> OK -> walk -> ... -> potion). Plain ASCII, <= 100 chars each,
sized to fit 320x568. Copy:

1. **MOVE** — "Drag anywhere on the field, or use WASD or the arrow keys.
   You walk where you point."
   *Why: the one control fact a brand-new player needs first, covering both
   input families (touch + keyboard) in a single sentence.*
2. **POTIONS** — "Red refills health, blue refills mana. Walk over one to
   drink it."
   *Why: the color->resource mapping is the game's whole drop language, and
   it primes the fourth banner's ask.*
3. **LEVEL UP** — "Gems fill the bar at the top of the screen. Each level
   offers a draft: pick 1 of 3 upgrades."
   *Why: names the core loop (gems -> XP bar -> draft) in the same words the
   game uses on screen, so the first real draft is recognized, not surprised.*
4. **THE POTION** — "The shimmering potion ahead is free. Drink it for 45
   seconds of shielding and a clear field."
   *Why: states exactly what you GET (the named `C.PROLOGUE.INVULN_S = 45s`
   constant is interpolated, so copy and mechanic cannot drift), and gives
   the tutorial its call to action.*

The card carries a `n/4` counter; the OK rect is defined ONCE
(`prologueOkRect()`, src/render.js) and shared by the painter, the canvas
hit-test and the headless tests.

### The effect

- **45s shield** — `C.PROLOGUE.INVULN_S` (named constant, src/config.js).
  Boundary pinned by test: contact damage is blocked at 44.9s since the
  drink and lands at 45.1s.
- **The clear** — at the drink (before the shield ends, trivially): every
  on-screen enemy — the visible rect at the current zoom plus
  `C.PROLOGUE.CLEAR_MARGIN = 120` world units, NOT the arena — is set
  `hp = 0` and reaped by the NORMAL death pass (normal kill credit, normal
  drops). Off-screen enemies survive; the test asserts it by object identity.
- **Rainbow pulse** — six slowly-spinning ticks around the player, each on
  its own hue (`i*30` around the wheel so one frame reads RAINBOW, not six
  dots of one hue), a gentle 40 deg/s cycle. Own lifetime
  (`state.prologueShieldT`) so the ring stops at expiry and a later portal
  invuln cannot restart it. Reduced motion: a fixed healing-green, no motion.

### ABSORB, not replace

The existing tour/hint layer is ABSORBED, not stacked:
- At phase end, every stage-2 tour flag (`TOUR_KEYS`) is marked seen — run #1
  never sees the coach layer fire a second onboarding path.
- The HintStrip is gated DURING the phase (no hint arms while the banners
  own the intro).
- REPLAY TOUR is untouched.
- Run #2 has no prologue at all (the derivation contract; pinned by test).

## The 320x568 legibility investigation (full disclosure)

The potion's paint was challenged at the smallest viewport across four
vision passes:

1. Pass 1 (1x sprite): vision could not resolve the bottle. Wrote
   `tools/probe`-style in-page pixel probe (`/tmp/probe_potion_pixel.mjs`):
   getImageData ±14px around the mapped view->backing coords proved 236
   bright pixels on the backing store — the paint was correct; the sprite was
   just too small.
2. Pass 2: added the beacon alpha floor (0.25) — still unresolvable to vision.
3. Pass 3: doubled the sprite (12x18 view px ≈ 8x12 CSS px at 320x568) —
   probe now reads 688 bright px, correct teal hue [168,224,255] from the
   iridescent cycle; vision still could not resolve it (prompt that pass was
   misdirected).
4. Pass 4 (final): accurately-guided vision prompt (middle-right, ~3/4
   across, beside the card's bottom-right corner) — STILL unresolvable.

Conclusion: the vision model cannot resolve ~8x12 CSS px sprites against
this field, period. The pixel probe is accepted as ground truth: the 2x
potion paints on the real backing store at the exact coords, in the expected
color, at both viewports. The 2x legibility fix stays — it costs nothing and
the tutorial's one centerpiece should be the player sprite's own size class.

Known cosmetic overlap at 320x568 (disclosed): the banner card band overlaps
the HUD's top-left readouts (HP/MP/XP bars, "LV 1 0/30", and part of the
"MANUAL PILOT" strip). The card is legible and the overlap does not move;
not addressed in this task.

## Tests + verification

- `test/test_prologue.mjs` — 10 checks, all green: phase armed/inert/frozen;
  banners (count/copy/non-modal/canvas-OK/okRect-in-view); both exits;
  44.9/45.1 boundary; on-screen clear vs off-screen survival; rainbow pure
  functions + reduced motion; run #2 no prologue; the ABSORB.
- `tools/verify_prologue.mjs` — ALL OK at BOTH 390x844 and 320x568 on a real
  fresh browser profile: real-finger OK tap, drink, 45s shield (44.5s read),
  clear-with-credit, clock-frozen-then-started.
- Full suite: see below.
- Shots: `shots/prologue-{banner,field,rainbow}-{390x844,320x568}.png`
  (banner up + potion visible; the cleared field after the drink; the
  rainbow shield ring live).

## Harness disclosure

The test harness (`test/_harness.mjs`) neutralizes the prologue for every
OTHER suite file by pre-stamping `achievements.totals.runs = 1`; the
prologue file opts out via `boot({ prologue: true })` and keeps the profile
fresh. Six files boot main.js OUTSIDE the harness (direct `import()`:
test_onboarding, test_tour, test_review_round1, test_desktop_ui,
test_draft_ceremony — plus `tools/real_loop.mjs` `bootReal`, which backs
test_lifesteal_cap and the cohort tools); the first full-suite run caught
all six opening run #1 in the prologue (inert world / frozen clock / gated
hints). Each site now applies the same one-line stamp (defensive writes, a
custom profile with `runs` already set is untouched), and all six are green.

- Full suite: `greenfiles=152 redfiles=0` (one transient load flake in
  test_ults on an intermediate run re-ran clean in-suite).

## Files

- `src/config.js` — `C.PROLOGUE` (INVULN_S 45, MAX_S 60, CLEAR_MARGIN 120,
  POTION_DX 115, POTION_DY -20).
- `src/main.js` — arm/phase-clock/freeze/spawn-guard/pickup/drink/end/OK
  hit-test/`__TEST.prologue`; PROLOGUE_BANNERS copy.
- `src/render.js` — 2x potion + beacon; `drawPrologueBanner` + `prologueOkRect`;
  `prologueShieldColor` + rainbow ring; `prefersReducedMotion`.
- `test/test_prologue.mjs`, `tools/verify_prologue.mjs` — the pins.

---

## ADDENDUM (owner 2026-09-18): the pilot PAUSES for banners; ALL buttons disabled

Owner: "pilot could pause for these since we haven't given the player any
control yet.. all buttons should be disabled during this initial period."

### The pause (the withdrawn non-modal line)

- The choreography is now WALK -> banner -> OK -> WALK -> ... -> potion ->
  drink -> effect. A banner goes up only after `C.PROLOGUE.BANNER_WALK_S`
  (0.35s) of UNPAUSED walking since the last OK — never banner-first.
- While a banner is up the pilot HOLDS: the AUTO pilot flies a
  `PROLOGUE_HOLD` branch (zero input) and the MANUAL controller is fully
  gated (returns zero movement) — "we haven't given the player any control
  yet" is literal; even harness-seeded held MANUAL input cannot move the
  pilot through the phase.
- Painter/hit-test/pause all share the same `prologueBanner()` gate, and the
  render pass re-checks `walkT >= BANNER_WALK_S` so the painted card, the OK
  hit-region and the hold never disagree.

### The bound counts UNPAUSED time only

`prologue.t` and `walkT` both freeze while a banner is up, so a never-OK'd
banner holds the phase indefinitely past `MAX_S` of wall time (menu-like: the
OK is the only way past a banner). Once the banners are exhausted (or OK-ed
away), the 60s bound accrues and ends the phase without the potion and
without the shield.

### ALL buttons disabled — the inventory

Through the whole phase (arm -> end, including after the last OK):

- Touch pads (FOCUS/STANCE/PILOT/STATS, Q/E/MAG/HP/MP) and the cog row
  (SETTINGS/HELP/RADAR/MAP) — `runAction()` early-returns.
- Their keyboard twins (ESC/P menus, I stats, O pilot, M map, R radar,
  +/- zoom, Q/E/H/N skills, Tab focus, G stance) — the playing-branch
  keydown funnel early-returns.
- The `?`/F1 help-mode handler (which sits BEFORE the mode dispatch — found
  live by a test probe; now also gated).
- The canvas fullscreen glyph — HIDDEN (see below).

SINGLE EXCEPTION: the banner's OK (a canvas hit-region, not a DOM button).
Nothing re-enables early; the lock is set only at arm time and cleared only
in `endPrologue`.

### HIDDEN vs SHOWN-BUT-GREYED — the choice + recommendation

- DOM buttons (`#touch button`): SHOWN BUT GREYED via `body.prologue-locked`
  — `opacity: 0.35; pointer-events: none`. The opacity jump back to 1 at
  phase end is the obvious enabled/disabled difference the owner asked for.
- The canvas fullscreen glyph: HIDDEN instead (`fsVisible()` returns false
  during the phase) — at 22x18 view px the glyph cannot read as "greyed", it
  would read as broken.

Recommendation: keep exactly this split. The touch layer is big, labeled and
familiar-shaped, so greyed communicates "coming"; a tiny canvas glyph has no
such affordance, so hiding is the honest read.

### Tests + verification (the addendum's own)

- `test/test_prologue.mjs` — now 11 checks, all green: cadence (no banner at
  t=0; held banner freezes the phase clock over 8s wall), MODALITY (held
  MANUAL input does not move the pilot; canvas OK tap advances; ok() is a
  no-op with no banner up; banner #2 waits for its walk), the LOCKOUT (15
  keys + 13 touch actions all inert through the phase; lock holds past the
  last OK; lifts at the drink; `i` then opens the FIELD REPORT), no player
  control, both exits (the AUTO trace shows a real >= 0.6s hold stretch; the
  bound fires only once unpaused), 44.9/45.1 boundary anchored at PICKUP,
  the clear, rainbow, run #2, the ABSORB.
- `tools/verify_prologue.mjs` — ALL OK at BOTH 390x844 and 320x568 on a real
  fresh profile, including the new real-browser checks: the pilot PAUSES
  while a banner is up (0.00wu moved in 600ms), `body.prologue-locked` on,
  computed `pointer-events: none` + `opacity 0.35` on the real cog, real
  keydowns inert, the lock lifting to `opacity 1` at phase end, and the
  FIELD REPORT opening through the real key funnel afterwards.
- Shots refreshed: banner/field/rainbow at both viewports now show the
  GREYED touch layer through the phase.

### Harness disclosure (the pause's blast radius)

With banners modal + the bound unpaused-only, an unattended fresh-profile run
now STALLS at banner #1 forever — previously the non-modal AUTO pilot drank
in ~1.4s, which quietly rescued every harness. Fixed centrally:
`tools/browser.mjs` `withPage` now seeds a settled profile
(`achievements.totals.runs = 1`, the same stamp verify_blocking_elevation
applies in-page) before the page's scripts run, for every verifier by
default; verify_prologue opts out with `skipPrologue: false`. An earlier
checkpoint said tools/real_loop.mjs would need an auto-OK driver — moot: it
already stamps `runs = 1` at boot, so fresh cohorts never arm the phase.
