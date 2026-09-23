# PORT SLICE K2 — capture notes (shrine presentation)

Owner queue: megabonk shrines + VS — original altar designs in hordes'
integer-grid style, derived from the staged references
(docs/mb_ref/art/shrines/: FBX_ChallengeShrine, FBX_MagnetShrine,
FBX_CursedStatue, FBX_BanditStatue, FBX_SkeletonKingStatue, B_Pylon color +
emission, FBX_EnergyAltar emission — read as SHAPE/PALETTE VOCABULARY, not
sprites; docs/vs_port_ref/ section 6 props as the silhouette anchor —
concept-only, no thumbs extracted).

## Presentation mapping (the load-bearing finding)

ONE altar look for all blessings (src/render.js:717 pre-slice: a single
stone slab + column + idol head branch, no per-blessing visual). The seam
DOES carry the blessing before purchase — sh.blessing is rolled + cached on
first proximity (src/main.js:4036-4041) — but it stays HIDDEN: the sale
toast names it only after the debit (main.js:4062), the broke toast names
only the cost (main.js:4066). So blessing-type-colored altars would LEAK the
roll — an information change. Dressed instead for readable variety: one
designed altar per shrine INDEX (ember/idol/pylon, src/art/shrines.js),
stable all run (S1: the set is seeded once, never re-seeds), carrying zero
blessing information either way. Per-blessing colors parked under
OWNER-RULING below.

## Shots (all: real tap on START GAME, sim clock asserted advancing)

- slice-k2-1-ember — live view on altar index 0 (brazier bowl + flame cleft;
  Challenge Shrine vocab, amber trim #ff8c3e).
- slice-k2-2-idol — live view on altar index 1 (broad idol head + brow band
  + eye glints; statue-trio vocab, jade trim #7de0a8).
- slice-k2-3-pylon — live view on altar index 2 (tapering crystal + facet +
  collar; Pylon vocab, violet trim #c46ad8).
- slice-k2-4-ember-closeup — ember altar at capture-only 3x world zoom so
  the art reads pixel by pixel.

Each shot: fresh startRun through the real seam, other altars parked far,
purse 0 (no sale fires, the altar stays lit), dt > 0 asserted.

## Frozen (byte-identical, pinned by test/test_port_slice_k2.mjs)

Purse debit rules, re-arm latch (one sale per approach), blessing
pool/roll/rng order, cost curve, darkening-on-exhausted semantics; aura
pulse + coin-glyph blink timing; radar/map gold marks (#ffd75e); art-lint
counts (new module not enumerated). The one seam change: render.js paints
the altar body through art/shrines.js painters (same anchor class, same
lit/spent rule).

## OWNER-RULING additions

- K2-R1: per-blessing-type altar colors (the seam carries sh.blessing
  pre-purchase, so it is paintable) — REJECTED by default: it would leak the
  hidden roll (information change). Needs an explicit owner decision.
- K2-R2: spent altars currently paint nothing once ALL are used (the view
  goes null — pre-existing behavior, untouched). A persistent ruin marker
  would be a presentation addition, not a fix.
