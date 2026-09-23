# PORT SLICE K — capture notes (chest presentation)

Owner priority: "good chest art we should definitely use" — original designs
in hordes' integer-grid style, derived from the staged references
(docs/mb_ref/art/chests/: psd_Chest, psd_ChestOpen, CRATE_3C, t_chest_normal,
t_chestFree, t_chestFreeCrypt; tables/chest_types.json + rarity.json).

## Honest display (the load-bearing constraint)

A hordes field chest is `{ id, x, y, age }` (src/chests.js maybeSpawnChest) —
it carries NO rarity. The band is rolled at OPEN time (rollContents, consumed
by tickChests), so no world sprite can truthfully claim a band ahead of the
roll. The world paints the SEALED design; the TRUE band paints once known, as
the OPEN remnant under the chest's item drop (main.js stamps the drop with the
rolled band). `ch.band` is a capture-only display override the game never
writes (pinned by test_port_slice_k.mjs).

## Shots (all: real tap on START GAME, sim clock asserted advancing)

- slice-k-1-sealed-world — 3 sealed field chests via the chests.js seam.
- slice-k-2-band-closed — all 5 closed designs (common/rare/epic/legendary +
  gamble moment look) via the capture-only `ch.band` override.
- slice-k-3-open-remnants — one stamped chest drop per band + gamble via the
  pushItemDrop seam (rolled band stamp, real loot.js items).
- slice-k-4-burst — the collection burst planted mid-life (core flash phase)
  via the chestBurst seam; trigger/ttl/aging untouched.
- slice-k-5-closeup — sealed + legendary remnant at capture-only 3x world
  zoom so the art reads pixel by pixel.

## Frozen (byte-identical, pinned by test_port_slice_k.mjs)

Odds/contents/gold/label semantics; the LEGENDARY-label fix region (label and
tint come from the ITEM — untouched); triggers/ttls/pools/aging; item-glyph
record (coords/styles/order); art-lint counts (new module not enumerated).
The one seam addition: chestItem event carries the rolled band
(src/chests.js applyContents) and the drop carries it as inert `chest`
display data (src/main.js) — no roll, content, rng-draw or timing change.
