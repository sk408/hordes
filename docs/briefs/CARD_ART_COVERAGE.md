# CARD ART COVERAGE — every draft card renders as a playing card (complete the join)

**Worktree:** `/tmp/hordes-integ` (branch `art-integration`). The CARD ART INTEGRATION (`712cbb6`) is landed here: `paintOfferArt(canvas, u.id)` paints the offer card's art via the join table in `src/draft_card_art.js`, and the inspect→confirm flow (R2) works. **The gap:** the join table covers the stat cards (`hp/speed/pickup/pierce/multi/dmg`) + the rare/mythic ladder, but NOT the WEAPON level-up cards or utility cards like Quick Hands — those fall back to plain text (`paintOfferArt` returns false). The owner's vision is EVERY draft card a playing card (rank=rarity: common=number, rare=face, mythic=ace/joker; suit=family).

**Read first:** `~/.hermes/skills/software-development/hordes-project-ops/SKILL.md`, and the prior brief `docs/briefs/CARD_ART_INTEGRATION.md` for context. The discipline: measured evidence, no assertion weakened, real-browser proof means READING the PNG.

## The task
Make `paintOfferArt` return a painted card for EVERY upgrade the draft can offer — no plain-text fallback.

1. **Enumerate the real draft pool** (read the pool code in `src/main.js` — the weapon level-ups AND the stat/utility cards AND the rare/mythic ladder). List every upgrade id it can offer.
2. **Map each to a card.** Weapon cards: the art already exists in `src/art/cards.js` (`spear`, `tome`, `red_blade`, `three_arrows`, etc.) — join each weapon's upgrade id to its weapon card (verify the weapon→art match by the weapon's identity, don't guess). Utility cards (Quick Hands / cooldown, and any other unmapped stat/utility id): join to the closest existing art, OR if none fits, add a minimal art entry to `src/art/cards.js` (a simple suit-pip arrangement on the right tint — follow the existing art's integer-frame style; see the drawGrid trap in the skill: frames are INTEGER arrays, 0 = transparent).
3. **Rank/suit correctness:** common (weapons, stat, utility) = number rank; rare = face; mythic = ace/joker. Suit from the card's family (♠ damage, ♥ survival, ♦ economy, ♣ utility) — match how the existing cards assign suit.
4. **Keep green:** `test_card_art`, the integration's draft tests, and the suite stay green UNCHANGED. The inspect→confirm flow must show the card art for these newly-covered cards too.

## FOOTPRINT
- ALLOWED: `src/draft_card_art.js` (the join table), `src/art/cards.js` (ONLY to ADD a missing art entry — do not change existing entries), `index.html` (only if a card needs a style hook), NEW test/tools files.
- FORBIDDEN: gameplay regions of `src/main.js`, `src/config.js` constants, `src/entities.js`, `src/bosses.js`, `src/meta.js`, `src/render_cards.js` (wire to it, don't edit), any test you didn't write.

## Verify
1. `bash tools/run_suite.sh` → `redfiles=0` (quote the TREE line).
2. Real-browser probe 390x844 @dpr3, assert `state.time > 1.0` first: open drafts until you've shown a WEAPON level-up card AND a utility card (Quick Hands) rendered as playing cards (corner rank+suit, framed art, pips — not text). ONE PNG 1170x2532, READ it and describe what's on screen, copy to `docs/art/card-art-verify-2026-09-14/`.
3. Report: the full list of draft upgrade ids and the card each maps to (so the orchestrator can confirm none fall back to text).

**Commit in the worktree on `art-integration`. The orchestrator merges after E2 lands.**

## RESOLVED 2026-09-14 (builder, art-integration worktree)

Two premises in this brief did not match the landed tree; measured and resolved
as follows:

1. "The art mostly exists in src/art/cards.js (`spear`, `tome`, `red_blade`,
   `three_arrows`, etc.)" — it did NOT. `CARD_DECK` at 712cbb6 held exactly the
   13 stat/ladder cards; those motifs are the STAT cards' identities, not
   weapon art. Resolved per the brief's own fallback clause: 17 new motifs +
   a 19-card `CARD_EXPANSION` registry added to `src/art/cards.js` (ADD-only;
   `CARD_DECK`/`CARD_IDS` untouched, so `test_card_art.mjs` is green
   byte-identical). Weapon cards join by NAME against `WEAPON_NAMES`.
2. "the integration's draft tests stay green UNCHANGED" is mathematically
   incompatible with "no plain-text fallback": `test_draft_card_art.mjs`
   pinned the gap itself (`deckIdForOffer('wpn_BOOMERANG') === null`,
   `paintOfferArt(..., 'wpn_BOOMERANG') === false`, `OFFER_TO_DECK` targets
   ⊆ `CARD_DECK`). Per the house stale-fixture discipline those THREE checks
   were retargeted to the strictly STRONGER full-coverage contract (every
   offer resolves; unknown ids still fail safe). Every other check in the
   file is untouched; no assertion was weakened.

Evidence: `test/test_card_art_expansion.mjs` (new, 54 pool ids enumerated),
suite `SUITE greenfiles=88 redfiles=0` (TREE: /tmp/hordes-integ @ 712cbb6),
browser probe `tools/verify_card_coverage.mjs` 9/9 with
`docs/art/card-art-verify-2026-09-14/draft-coverage-phone.png` (1170x2532,
screenshot-read: 0/812 wrong blocks on the lvl_VOLLEY_1 and rate canvases).
NOTE: `test_run_structure.mjs` ("the maw milestone") is a PRE-EXISTING
order/RNG-dependent flake on this branch — it failed at the clean tip 712cbb6
with this slice stashed, passes standalone 2/2, and passes on the main tree;
out of this slice's footprint, reported not fixed.

## UPDATE 2026-09-15 — G21 slice 1 closed the gap; the test is now DERIVED

The evidence lines above are HISTORICAL (that artifact, that SHA): "19 cards"
and "54 pool ids enumerated" describe the tree at `/tmp/hordes-integ @ 712cbb6`.
G21 slice 1 then added five rule-rewrite cards (`rime`, `ignite`, `livewire`,
`aftershock`, `wideorbit`) with no art, and the frozen contract in
`test/test_card_art_expansion.mjs` went red on its own hardcoded count and id
list instead of on the real gap.

Now landed in the main tree (uncommitted at time of writing):
- the five cards exist as `rw_rime` (7H), `rw_ignite` (2D), `rw_livewire` (4D),
  `rw_aftershock` (8H), `rw_wideorbit` (5D) with five NEW motif grids
  (`frost_shard`, `flame`, `spark_arc`, `echo_rings`, `wide_orbit`) — no motif
  alias, no rank+suit duplicate anywhere in the deck;
- `OFFER_TO_DECK` carries the five `rewrite_* -> rw_*` rows;
- the test no longer freezes counts or an id list: it enumerates the pool from
  the live registries, asserts every id resolves to a real card, cross-checks
  the LIVE pool builders (`ruleCards` / `skillCards` / `rewriteCards` /
  `frostCard`) resolve AND join by NAME, and computes rank+suit and motif
  distinctness from `CARD_ART` itself. The pool stands at 63 ids / 24
  expansion cards.

Measured: `test_card_art_expansion.mjs` 1171 checks PASS; `bash
tools/run_suite.sh` → `TREE: /home/claude/projects/hordes @ 4ce423d | dirty=3`,
`SUITE greenfiles=91 redfiles=0`. Mutation battery (7 breaks run in a /tmp
copy): dropping an `OFFER_TO_DECK` row, aliasing an existing motif grid under
the same name or a new one, a rank+suit collision, a rename in `rewrites.js`,
deleting a card, and a synthetic slice-2 rewrite with no art EACH go red with a
precise message and no crash. Trap found while doing it: the motif-interior
comparison window must be PIP-FREE (cols 7..16 of the 24x34 backing) — a
rows10-24/cols5-18 window carries suit-pip ink, so a duplicated grid under a
different suit compares unequal and slips through.
