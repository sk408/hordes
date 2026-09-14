# CARD ART — the draft as a deck of pixel playing cards

**Builder:** kimi lane, working in the SEPARATE worktree `/tmp/hordes-art` (not the
main tree). **Read this whole brief before touching anything.**

## Load this first

- Skill: `~/.hermes/skills/software-development/hordes-project-ops/SKILL.md` — and
  pay special attention to the drawGrid trap: **frames are INTEGER grids where `0`
  is the transparent cell.** A string grid is truthy in every cell, `palette['.']`
  is undefined, the invalid `fillStyle` assignment is silently ignored, and the
  previous colour paints every pixel — that is exactly how a coin glyph once
  rendered as a solid block. Integers, `0` = empty.

## The design (owner's motif — this is the spec, not a suggestion)

The draft is a deck of playing cards, and the **rank IS the rarity** — readable at
a glance, self-teaching, no legend:

- **Number cards (2–10) = COMMON** — the flat stabilizers.
- **Face cards (J/Q/K) = RARE** — the percent/scaling tier.
- **Aces = MYTHIC** — the build-definers.
- **Jokers = the 1-in-10 super-chase.**

The **suit IS the family** (a second read axis):

- **♠ Spades** — damage / weapons
- **♥ Hearts** — survival / HP
- **♦ Diamonds** — economy / purse
- **♣ Clubs** — utility / XP / luck

So "King of Spades" reads as a rare damage card, "Ace of Hearts" as a mythic
survival card, with no legend. **The two Jokers are the two 1-in-10 chase cards
(Second Wind red, Storm Shards black)** — a standard deck has exactly two jokers,
and the owner specified exactly two 1-in-10 chasers; keep that mapping.

## The card list (rank, suit, central motif)

| card | rank/suit | central motif |
|---|---|---|
| Iron Heart +25 | 2♥ | a heart |
| Light Boots +15% speed | 5♣ | a boot |
| Gem Magnet +30% pickup | 6♦ | a gem + magnet |
| Sharpened Tips pierce +1 | 7♠ | a spear/arrow |
| Split Shot +1 projectile | 8♠ | three arrows |
| Iron Heart +25% | K♥ | a crowned heart |
| Whetstone +15% damage | Q♠ | a blade on a whetstone |
| Scholar's Stone +20% XP | J♣ | a tome |
| Gilded Palm +30% gold | Q♦ | a coin in a palm |
| Crimson Edge +3% lifesteal | K♠ | a red blade |
| Full Hand +1 offer | A♣ | a fan of cards |
| Second Wind (revive 50%) | RED JOKER | a winged heart / phoenix |
| Storm Shards (XP chip) | BLACK JOKER | a lightning-struck shard |

Ranks inside a tier are placeholders — the contract is tier → rank CLASS
(number/face/ace/joker), not a specific number. The two jokers are full-art
(no rank/suit pips) and must read as the most special cards in the deck.

## The art standard (the repo holds you to this)

- **Pixel art, integer scaling, no smoothing, no blur, no emojis.** Same standard
  as the title art, the menu frame, and the portraits.
- Drawn through `renderer.drawGrid` (or the same integer-grid seam) on a small
  backing store, CSS-scaled by an INTEGER factor with `image-rendering: pixelated`.
- Base card frame: a shared template — parchment/white body, a 1px dark keyline,
  the rank+suit pip top-left (and inverted bottom-right), and the central motif.
  Suit colours: ♠/♣ dark, ♥/♦ red — but on the game's palette, not a casino's.
- A sensible backing size is ~24x34 px at an integer 2x or 3x display scale;
  pick it, state it, and keep every card the same size.

## The deliverable (and why the merge is easy)

Produce **ONLY new, self-contained files** — e.g. `src/art/cards.js` (the art +
a `cardArt(id) -> {grid, palette}` accessor) and a card renderer (e.g.
`src/render_cards.js` with a `drawCard(g, id, x, y, scale)` function through the
drawGrid seam). **Do NOT edit any existing file** — not `render.js`, `main.js`,
`index.html`, or `src/art/index.js` (do not register in ART_SECTIONS, so the
art-lint counts do not move). The orchestrator does the one wiring hook into the
draft display after both slices land; keeping you additive is what makes the
merge trivial.

You are in the worktree `/tmp/hordes-art`, which shares the repo but is a clean
checkout — the W7b mechanics builder is working in the MAIN tree at the same time,
so this isolation is deliberate. **Do not run any git command** (no add, commit,
checkout, stash, merge, worktree) — leave the worktree dirty; the orchestrator
commits and merges.

## Acceptance bar

1. Every card in the list renders as a readable playing card: rank class matches
   the tier, suit matches the family, the two jokers are unmistakably special.
2. **Integer-scaled, pixel-proof in a real browser** at 390x844 @dpr3 (all 19
   TOUR_KEYS set, `state.time` asserted advancing BEFORE measuring): the rank and
   suit pips are legible, the edges are integer-scaled with zero blended pixels,
   and the central motifs are distinguishable from each other at display size.
   Sample the pixels — never assert from a screenshot you did not read.
3. The frame is ONE shared template (not 13 bespoke frames), so a future card is
   a motif, not a new frame.
4. A headless test that pins the deck data (every card id maps to a rank class +
   suit + motif grid, the two jokers are the only full-art cards) and does NOT
   require mounting the game.
5. Suite: `flock /tmp/hordes_suite.lock -c "bash /tmp/run_all.sh"` — quote the
   TREE and SUITE lines (run it in the worktree; it shares the suite lock).

## Reporting

Measured pixels, the reproduce command, and an explicit list of what you could
NOT verify (e.g. a motif that does not read at display size — say so, do not
ship it silently). A fabricated or "looks right" claim is worse than an honest gap.
