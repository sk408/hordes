# TIER-2 CONTENT (a) — capture notes (14 new rare-item finds)

Owner autopilot lane: equipment/items content into the rare-item system, numbers
by analogy, tune after the fact. Original names/copy/art (ASCII, no emojis);
reference vocabularies used as flavor sources only (no copied strings, no VS
pixels): docs/vs_ref/spec/SPEC-shop-items.md power-up rows (Might/Greed/Growth/
Magnet/Move Speed/Cooldown magnitudes) + docs/mb_ref/tables/items.json and
passives.json name vocabulary.

## What shipped

- src/loot.js AFFIX_POOL 10 -> 24 (append-only; originals keep indices 0..9).
  Each new find reuses its EXISTING field with that field's own base, so
  itemScore stays flavor-invariant and decideEquip's strict-better REPLACE
  rule is untouched. Rarity table, luck curve, world-drop chances
  (C.ITEMS.DROP_CHANCE 0.02 / ELITE 0.5 / BOSS_TIER_BIAS 1.5), LEGENDARIES
  (still 4), MAX_EQUIPPED (4) all unchanged.
- src/art/item_icons.js (NEW, not enumerated in art/index.js ART_SECTIONS —
  the chest-art precedent, so test_art_lint counts stay green): one ORIGINAL
  8x8 icon per find, house format (makeAsset grid+palette+derived rows/w/h).
- Paint sites (no combat math): render.js equipment belt (portrait in own
  palette + 1px rarity frame; legacy items keep the generic gem path
  byte-identical; chrome.itemIcons record unchanged) and main.js stats-card
  ITEMS row (portrait ahead of the name). Ground drops unchanged (rarity
  beacons). LEGENDARY-label fix region untouched.

## Shots (all: real seam — itemIconFor + paintItemIcon, the belt's own
## resolver and painter, on a drawGrid-shaped adapter)

- tier2-<affixid>.png — one PNG per find (14), 8x8 at 16x on house bg.
- tier2-sheet.png — 7x2 contact sheet, lane order, index tags 01..14:
  01 ironbrand, 02 sunder, 03 truesight, 04 witchmark, 05 heartseeker,
  06 allegro, 07 mintmark, 08 blackledger, 09 archivist, 10 strider,
  11 tailwind, 12 dragnet, 13 thistlecoat, 14 redtithe.
- Regenerate: node tools/capture_tier2_items.mjs (in-tree paths only).

## Review pass (2026-09-23)

First render: allegro's bars were outline-ink on near-black (invisible) —
repainted solid cyan; dragnet rope #a8a8c0 washed to white — dimmed to
#7a7a98 so the gold sinker pops. Re-rendered + re-pinned by
test/test_tier2_items.mjs.

## Frozen (pinned by test/test_tier2_items.mjs)

Registry (24 entries, bases, unique names/nouns, desc-quotes-base),
append-only rng proof (0.0 draws -> original affixes), art contract
(8x8/ints/palette/coverage/distinct), itemIconFor + paintItemIcon seam,
decideEquip EQUIP/REPLACE/IGNORE on new-affix items, LIVE world-drop pickup
through applyEquipDecision (EQUIP stats apply / REPLACE in-place swap with
affix mirror / IGNORE leaves the drop), quoted odds measured seeded
(COMMON 58.33% / RARE 83.72% / EPIC 94.08% carry >=1 new find; per-affix pick
10% -> 4.167%), determinism (same seed replays).
