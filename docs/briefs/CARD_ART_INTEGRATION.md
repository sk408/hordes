# CARD ART INTEGRATION — wire the playing-card deck into the draft display + inspect→confirm

**Worktree:** `/tmp/hordes-integ` (branch `art-integration`, at main `b9c5571` = W7b ladder LANDED + the card art MERGED IN via `art-cards`). Work HERE, commit HERE. The orchestrator merges into main AFTER the pilot's E2 slice lands (your main.js edits are in the DRAFT-DISPLAY region; E2's are in the GAMEPLAY region — different hunks, so the merge should be clean, but the orchestrator resolves anything by hand).

**This runs IN PARALLEL with the pilot's E2 (horde) build in the main tree.** Your footprint MUST stay out of E2's region. See FOOTPRINT below.

## Read first (the loaded skills' discipline applies)
- `~/.hermes/skills/software-development/hordes-project-ops/SKILL.md` — the house rules: measured-evidence bar, the 390x844 @dpr3 probe protocol (assert `state.time > 1.0` before measuring, the frozen-game trap), the drawGrid integer-frame trap, "no assertion weakened", real-browser proof means READING the PNG.

## What's already built (do NOT rebuild — wire to it)
- `src/art/cards.js` — the deck: `CARD_DECK` (id → rank/suit/title/tint/family), `TIER_CLASS`, `cornerFrame`, `suitGrid`, `artGrid`, `pipColor`, `suitColor`. **BUILT + unit-tested (`test/test_card_art.mjs`). DO NOT EDIT.**
- `src/render_cards.js` — `drawCard(ctx, x, y, w, h, cardId, opts)` and `computeTier(stats, rarity, kind)`. **BUILT. DO NOT EDIT.**
- The W7b ladder (landed `b9c5571`): `DRAFT_LADDER`, `DRAFT_RARE_UPGRADES`, `DRAFT_MYTHIC_UPGRADES`, the two-stage chase gate, the rarity classes on the draft cards. **Keep intact; your wiring must not change the ladder behavior or its tests.**

## The problem
The draft cards currently render the suit/rank as tiny EMOJI in the corner (the owner saw it and called it "cheap" — and ♠/♣ are indistinguishable at that size). The card art is built but NOT wired in — nothing calls `drawCard` from the draft display.

## Requirements
- **R1 — Wire the art in.** Replace the draft card's emoji-corner treatment with the playing-card rendering. The art is CANVAS (`drawCard`); the draft display is DOM (the `#draftOverlay` card divs in `index.html`). Render each offered card via `drawCard` to a canvas and present it inside the card div (a live `<canvas>` element or a `toDataURL` img — your choice, but it must be the REAL `drawCard` output, not a re-drawn look). Big readable rank+suit corner, full-art frame, suit pips, the tinted art placeholder — the whole card, not just the corner.
- **R2 — Inspect→confirm (owner directive 2026-09-14).** *"How does the player know which card does what? Maybe they push to select, it shows a box with what it does and they confirm selection."* First activation on a draft card does NOT take it — it opens an INSPECT box: the card's title + its effect description with the COMPUTED values (e.g. Second Wind "revive at 50% HP", Crimson Edge "+3% lifesteal", Iron Heart "+25% max HP", the weapon card's actual stat deltas). A second activation (confirm) takes the card. Back/ESC cancels the inspect and returns to the offer. Full KEYBOARD parity (the draft is keyboard-navigable — arrows/enter; inspect must work from keys too, not just tap).
- **R3 — Keep W7b intact.** The rarity ladder, the chase cards, the tier badge, and every existing test (`test_w7b_draft_ladder`, `test_card_art`, the suite) stay green and UNCHANGED. No assertion weakened anywhere.

## FOOTPRINT (hard limits — stay out of E2's region)
- ALLOWED: `index.html` (the `#draftOverlay` markup only), `src/main.js` (the DRAFT-DISPLAY region only: `openDraft`, the draft-overlay render + its input handling — do NOT touch the gameplay/update/spawn/horde regions), NEW files under `src/` and `test/`/`tools/` as needed.
- FORBIDDEN: `src/config.js` gameplay constants, `src/entities.js`, `src/bosses.js`, `src/chests.js`, `src/meta.js`, `src/art/cards.js`, `src/render_cards.js`, any gameplay logic, any test you didn't write.

## Verify (the orchestrator re-measures; a self-report is not evidence)
1. `bash tools/run_suite.sh` → `redfiles=0`, with the printed TREE line quoted.
2. A real-browser probe at 390x844 @dpr3: assert `state.time > 1.0` first, open a draft (seed it so a card is offered), screenshot ONE PNG 1170x2532 showing (a) a card rendered with the playing-card art and (b) the inspect box open with a computed effect description. **Read the PNG and describe what's actually on screen** (no vision claim without the read). Copy it to `docs/art/card-art-verify-2026-09-14/`.
3. Report the exact inspect→confirm input flow you shipped (tap-then-tap? tap-then-confirm-button? key flow?).

**Commit your work in the worktree. Leave the branch dirty of nothing uncommitted. The orchestrator merges.**
