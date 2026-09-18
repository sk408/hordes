# SHOP PAGING — two mockups, measured (task 7R4PW, 2026-09-18)

**MOCKUPS ONLY — the live shop (showShop(), main.js:6009) is untouched.** No file
under src/ was changed for this task.

Open on a phone (GitHub Pages, repo main):
https://sk408.github.io/hordes/docs/art/shop-paging-2026-09-18/mockup.html
— variant switch at the top; rows are tappable (tap an affordable row: bank
decrements, LV climbs; a weapon row toggles EQUIPPED↔BENCHED).

## The measurement first (why page at all)

Measured today on the LIVE shop via tools/measure_shop_scroll.mjs:

| size | rows | card size | list height | scroll | swipes to bottom |
|---|---|---|---|---|---|
| 390x844 | 49 | 137x162 | 4,809px | 3,965px | **17 swipes** |
| 320x568 | 49 | 116x177 | 5,169px | 4,601px | **20 swipes** |

49 cards = 47 SHOP_UPGRADES (meta.js:444) + CHARACTERS/BACK doors. The shop is
one long scroll with zero overview — finding "the last upgrade" costs ~17-20
swipes every visit, and there is no way to see how far down you are.

## Variant A — ARROW PAGER (screenshots/arrow-*.png)

Fixed-size pages; ‹ › arrows pinned at the screen edges (right arrow's outer
edge measured ≤60px from the viewport edge — thumb reach); a "1 / 13 · 1 col ×
4 rows" indicator; **swipe is a first-class input too** (finger left = next,
right = back — carousel convention), because on a phone swipe beats arrows.

Measured decision data:

| size | rows/page | pages | taps/swipes to last row | vs today |
|---|---|---|---|---|
| 390x844 | 4 | 13 | **12 next-taps** (or swipes) | 17 swipes |
| 320x568 | 2 | 25 | **24** | 20 swipes |

- Gained: page-count overview ("3 / 13" — you always know where you are);
  edge arrows always under thumbs; pages snap, no drift.
- Lost: whole-list scanning (you can't flick through all 49 quickly); on a
  320-wide screen a page honestly holds only 2 rows → 25 pages, WORSE than
  today's scroll. At 390 it's a modest 17→12 win with much better orientation.

## Variant B — BOOK (screenshots/book-*.png)

A two-page spread with a spine (measured within 6px of horizontal centre), page
corners ‹ › as the turn affordance, tap or swipe to turn. Lean-into-the-fantasy
shape — the shop reads as a grimoire.

Measured decision data:

| size | rows/page-side | rows/spread | spreads | turns to last row |
|---|---|---|---|---|
| 390x844 | 3 | 6 | 9 | **8 turns** |
| 320x568 | 2 | 4 | 13 | **12 turns** |

- Gained: the most rows visible at once (6 @390); fewest turns to traverse
  (8 vs 12 vs 17); strongest art identity; spine shadow + corners sell it.
- Lost — the honest cost: **each page is half the screen width**, so every card
  is half-width. Descriptions wrap hard (3-4 lines, orphaned "gold" lines);
  cards feel tall and cramped. Readable (verified — nothing clips), but dense.
  At 320 the cost is brutal: 2 rows/side, text-heavy.

## Both variants preserve the opt-out buy UI exactly

The mock renders the real markup (buildCard mirrors showShop's
`.card`/`.name`/`.desc`/`.shop-icon`, framed by the real composeMenuFrame(),
icons by the real shopIcon(), prices by the real upgradeCost()). A bought
WEAPON shows "OWNED · EQUIPPED"; tapping it again benches it ("BENCHED — see
LOADOUT") — the live contract, verified by a real tap in the verifier. Paging
changes only how rows are reached, never what a row does.

## Through the real thing

Condense-mockup house pattern: the page fetches the LIVE index.html at runtime
and injects its `<style>` unchanged, imports real SHOP_UPGRADES/meta, art and
frame modules — only the paging chrome is new CSS. Verified in a real
phone-class browser (tools/verify_shop_paging_mock.mjs, 24/24 green): boots
clean at both sizes, real arrow tap / corner tap / horizontal swipe in BOTH
directions turn pages, real row tap buys, 47+2 rows covered exactly, shots in
shots/.

## Recommendation — ARROW PAGER, with the swipe kept

The book is the prettier screenshot and does win the traversal contest — but
only by 4 turns (8 vs 12 @390; 12 vs 24 @320) while charging half the legible
width on every card, every day, forever. The arrow pager's edge-reach
arrows + swipe + "n / 13" indicator fix the actual complaint (endless blind
scroll, no sense of place) at no legibility cost, and it degrades honestly at
320. One honest caveat for either: on 320-wide screens paging should adapt
(2 rows/page → consider collapsing descriptions or a category grouping before
shipping).

Third shape, one line: category tabs (WEAPONS / STATS / DOORS) would cut page
counts ~3x under either variant and is where I'd look next if 13 pages still
feels long.

---

# BUILD — the arrow pager + the card grid, LIVE (owner 2026-09-18, same day)

Owner, verbatim: *"Arrow pages are better. The cards need to dynamically resize
and fit a minimum of 3 across. Max size of a card being the current size they
are"* — plus the desktop addendum (*"if that makes sense for desktop too"*):
capped container, centred; a single page shows NO arrows and no empty
affordance. The mock's Variant A above is what shipped, plus the owner's grid
rule which the mock never had.

## The grid rule (one pure function, matrix-tested)

`shopGridPlan(availW)` (main.js, exposed on `__TEST.shop` — the uiFitScale
precedent): columns = clamp(floor((W+12)/210), **3**, **5**); card width =
min(floor((W − (cols−1)·12)/cols), **198**). 198px is today's card border-box
(170 content + 2×14 padding) — the HARD ceiling; wide windows gain COLUMNS,
never bigger cards. The container caps at 5 columns (5×198+4×12 = **1038px**)
and centres — past that width the surplus is margin. Live-measured:

| size | before (2-col) | after | pages | to last row |
|---|---|---|---|---|
| 390x844 | 137px, 1-col list scroll 3,965px, **17 swipes** | **3 cols × 117px**, 3 rows/page | 6 | **5 taps** |
| 320x568 | 116px, scroll 4,601px, **20 swipes** | **3 cols × 93px**, 2 rows/page | 12 | **11 taps** |
| 1280x800 | 198px, full-list scroll | **5 cols × 198px** (cap), 4 rows/page | 3 | **2 taps** |
| 1920x1080 | 198px, full-list scroll | **5 cols × 198px**, margin 441px/side | 2 | **1 tap** |

The cap kicks in at **1038px content width** (1280 window → 121px margin per
side): column count stops at 5, cards stay 198, the surplus is centred margin —
exactly the desktop addendum. A page never splits a row; a row taller than the
viewport pages alone (content is never crushed).

## Legibility at 320 — the honest read (3-across HOLDS)

**3 columns fit at every size including 320-wide — cardW 93px, no silent
2-column fallback anywhere.** What 93px costs, measured in the live shot:
desc text 13px on a 77px run; the buy line abbreviates to `LV 0/5·180g` /
`MAX` / `OWNED` / `Ng` (textual and stateful, never an icon); two-word names
("Deadly Aim") wrap to two lines; long descriptions wrap 3-4 lines. Two real
defects were found in the first shot and FIXED the same day:

1. **Mid-height edge arrows sat ON the edge columns and hid their price text**
   ("400g" behind ‹, "180g" behind ›). Fix: when the grid fills the viewport
   width (first card's left edge inside the arrow band — every phone size),
   the arrows drop to the BOTTOM band flanking the indicator (46×44 at the
   44px floor, bottom corners = the prime thumb zone anyway) and the overlay
   top-aligns so rows clear the band; desktop keeps mid-height arrows (the
   capped container centres with margin — no card is ever under them).
2. **The abbreviated buy line wrapped with "LV" orphaned from its fraction**
   (79px of string in 77px of box at 12px). Fix: the buy line is a nowrap
   `<span class="buy">` whose font auto-sizes to the widest sub the catalogue
   can show at the measured card width (clamped 9-12px; 9-10px at 320) — one
   line, always, still textual.

Both fixes are pinned by the verifier ("arrows sit on NO card box",
"abbreviated buy lines hold one line") at all four sizes.

## The pager (inputs and rules)

- **Arrows**: ‹ › at the screen edges, target ≥44px on both axes, outer edge
  ≤60px from the viewport (thumb reach) — bottom band on phones, mid-height on
  desktop. A **single page shows NO chrome at all** (no arrows, no indicator —
  never a dimmed empty affordance); the desktop sizes here are multi-page, so
  the rule is pinned by the node suite instead.
- **Swipe stays the phone's first-class input** (60px horizontal-dominant
  flick; a vertical swipe is a scroll and never pages).
- **Keyboard**: ArrowLeft/ArrowRight turn pages (desktop's primary path —
  desktop has no swipe; the arrows + keys are prominent).
- **A BUY keeps your page** — the wanted page survives the re-render; verified
  with a real purchase at all four sizes. Purchases, counts, the opt-out rule
  and the apex/characters doors are untouched; no balance constant moved.
- Indicator reads `n / m · cols×rowsOnPage`; resize re-chunks live.

## Proof

- `test/test_shop_paging.mjs` — 6/6: the grid-rule matrix (304→2000px, cols
  ∈ [3,5], cardW = the equation, cap 198), the chunker (row never splits,
  exact coverage, empty → no pages), the stub integration (textual buy line,
  pager stands down without layout, clean no-ops, no chrome leaks).
- `tools/verify_shop_pager.mjs` — ALL GREEN at 390x844 / 320x568 (dpr3,
  coarse) and 1280x800 / 1920x1080: live grid matches the plan, no clipping
  (card boxes in viewport; the +5px container scroll is the frame's authored
  shadow spill), arrows-on-no-card, one-line buy spans, page math, arrow /
  key / swipe turns, vertical-swipe refusal, buy-keeps-page, shots.
- Shots: `shots/live-{390x844,320x568,desktop-1280x800,desktop-1920x1080}.png`.

SIM: ~280s of sim/browser time across 15 arms (3 verifier runs × 4 sizes + 3
measurement arms).
