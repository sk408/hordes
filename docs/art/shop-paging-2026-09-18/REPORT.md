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
