# G26 — PRE-RUN WEAPON LOADOUT (the player chooses; the run rewards it) — BUILD BRIEF

**Slice:** G26, owner-ordered 2026-09-15. **Queued status:** ORDERED; the ONE blocking design question is ANSWERED (REPLACE).
**Brief authored by:** Remy (orchestrator) 2026-09-15, from Sk408's own words. **Dispatched by:** the goal pilot.
**ANCHORS:** this brief deliberately carries NO line numbers. The pilot resolves and pastes the live anchors at
dispatch time (its own DISPATCH ANCHOR CHECK practice), then re-verifies them on the tree it issues against.

## The owner's words (verbatim — build these, not a paraphrase)

> *"Player chosen weapons in a menu, not during run. Before the run."*
> *"Replaces in run cards. It's a player decision that gets rewarded"*

## Why this exists (the measured problem)

Unlocking a weapon currently adds an option to the IN-RUN draft pool against a scarce slot count
(`src/config.js` `WEAPON_SLOTS` = 6 per run; `src/meta.js` `MAX_WEAPON_SLOTS` is the absolute cap). So an
unlock can be **net-negative**: it dilutes the pool you draft from. G5's own rule calls a hidden AND
effectively irreversible trade-off a trap, and the owner's fix is this slice — move the weapon decision
BEFORE the run, where the player owns it, instead of taxing unlocks inside it.

## THE SPEC

1. **A PRE-RUN screen** (reached like the existing character / shop doors from the title) where the run's
   weapons are chosen from the **UNLOCKED** set, up to the slot count. It is a pre-run decision, never a
   mid-run menu — that boundary is explicit.
1b. **IT MUST BE FOUND, NOT PRESENTED.** Owner, verbatim: *"The player should have to go find the weapon
   selection in a menu, it shouldn't be brought up for them."* So it is a **destination the player
   navigates to** — never a forced screen before START GAME, never a nag, never a "you haven't chosen a
   loadout" gate, never an auto-opened panel after a run. **The penalty for not finding it must be ZERO:**
   a run started without visiting the screen uses the same starting kit a fresh account has today, and a
   previously-chosen loadout persists to the next run. Verify BOTH halves in the browser: the screen is
   reachable by real taps, AND START GAME from the title never detours through it.
1c. **TOUR COUPLING — RESOLVED BY A JUST-IN-TIME TRIGGER.** Owner, 2026-09-15: *"can it present the
   coaching after the first weapon buyable is bought?"* — YES, and it is the better moment, because the
   screen is MEANINGLESS until a second weapon exists (with only the base kit there is nothing to
   choose). Spec it exactly this way:
   - **TRIGGER:** the FIRST time the player's UNLOCKED-WEAPON SET grows beyond the starting kit — i.e.
     the successful weapon unlock on the shop purchase path (`src/meta.js` `def.kind === 'weapon'` ->
     `unlockWeapon`) or the first weapon `grantWeapon`. **NOT** "the first purchase of anything": a mana
     buyable or a stat upgrade must NOT fire it, because the timing IS the point.
   - **ONCE ONLY**, in the same flag store as every other tour flag (`tourFlag` / `setTourFlag`,
     localStorage), so a fresh profile sees it once and never again. It must not fire during a run, must
     not block input, and must dismiss like every other coachmark.
   - **CONTRACT CONSEQUENCE (accepted, and it must be PAID FOR):** an event-taught door is NOT taught by
     the title walk, so `test/test_tour.mjs`'s `taught == titleCards - exempt` requires this door in
     `DISCOVERY_EXEMPT`. That exemption is only honest if a dedicated test pins the event behaviour:
     no coachmark before the unlocked set grows; exactly ONE coachmark on the first growth; the flag
     persists and prevents a repeat; and the door is reachable by real taps with the coachmark never
     fired. **Do not add the exemption without that test** — and say in the report that you added both.
2. **The choice REPLACES in-run weapon acquisition.** The draft pool no longer offers `wpn_*`
   new-weapon grants: the run never hands you a weapon you did not bring. That is what removes the tax.
3. **`lvl_*` level-up cards STAY.** They are the in-run progression for the weapons you brought
   (`WEAPON_MAX_LEVEL`, `describeWeaponLevel`), and the weapon ladder depends on them.
   **CONFIRMED BY THE OWNER 2026-09-15:** *"only the selected weapons appear in the card pool like you
   said"* — so the pool contains cards ONLY for the weapons the player selected: no `wpn_*` grants, and
   `lvl_*` offers for the brought kit. No further clarification is owed; do not stop to ask.
4. **Riders stay.** Anything that only makes sense on a weapon you own (synergy zaps, mine detonation,
   orbit reads) keeps working exactly as it does today.
5. **THE REWARD PRINCIPLE (the acceptance bar's spine):** this is *"a player decision that gets
   rewarded"*. A well-chosen loadout must MEASURABLY outperform a poorly-chosen one on the run, or the
   screen is cosmetic and the slice failed — even if every unit test is green.

## SCOPE BOUND

**IN:** the pre-run screen + its input handling (`index.html` markup for the screen, `src/main.js` for
the draft-display/run-start region), the pool assembly that feeds `openDraft` (drop `wpn_*` grants),
`src/config.js` only for new constants, `src/meta.js`/`src/save.js` ONLY if the chosen loadout must
persist (state it either way), plus the tests and ONE real-browser verifier.
**OUT:** `WEAPON_SLOTS` semantics, `lvl_*` offer routing, weapon balance numbers, any price change
(G17 owns repricing), the H1 pad geometry, the apex tier (G25 has landed — treat as baseline, never
rewrite it).

## ACCEPTANCE BAR (the pilot re-measures every item on the artifact)

1. `bash tools/run_suite.sh` ends **`redfiles=0`**, quoted verbatim with its TREE line.
2. **Pool proof:** with a full unlocked set, a draft sweep over N drafts produces **ZERO `wpn_*` grants**
   and still produces `lvl_*` offers. Print the observed families.
3. **Choice proof:** the loadout screen changes what the run actually carries — start a run with a chosen
   kit and read the weapons back off live state (not from the menu's own bookkeeping).
4. **Reward proof (real loop, hard-capped):** a paired-seed A/B of a well-chosen loadout vs a
   deliberately poor one. Report medians/means with the wall time and the CENSORING RATE, stop at the
   sign (G27's rules apply to this measurement too). If it cannot be shown to matter, say so — a null is
   a finding, not a failure to hide.
5. **Real-browser evidence, 390x844 @dpr3:** real tap through the screen, all 19 `TOUR_KEYS` set,
   `state.time > 1.0` asserted BEFORE measuring, ONE 1170x2532 PNG read back by pixel/state sampling (no
   vision claim). The screen must not move the H1 pad geometry.
6. **Nothing weakened:** `test/test_card_art_expansion.mjs`, `test_w7b_draft_ladder`, `test_tour` and the
   pad-reflow verifier stay green. Retarget FIXTURES where the pool legitimately changed; never relax an
   assertion, and enumerate every retarget by file + line + why.

## COUPLED SURFACES — A SLICE THAT IGNORES THESE BREAKS THEM

- **`test/test_card_art_expansion.mjs`** enumerates the draft pool from the LIVE registries and asserts
  every weapon type has a card join. Removing `wpn_*` from the pool must keep it green by RETARGETING
  those assertions to the new surface (the pre-run screen still needs the weapon cards' ART — the 9
  `wpn_*` deck cards shipped art on 2026-09-15 and that art is what the menu should show), not by
  deleting the checks.
- **`src/art/cards.js` `CARD_EXPANSION` + `src/draft_card_art.js` `OFFER_TO_DECK`** are the join that
  renders offer art; if `wpn_*` stops being an OFFER, the join still matters for the MENU. State plainly
  which surface each card id now serves.
- **`test_w7b_draft_ladder`** pins offer routing (e.g. a single `[4]` press taking the fourth offer).
- **The draft is one-tap now** (owner directive 2026-09-15): one activation takes the offer, there is no
  confirm step, and `#draft-inspect` is gone. Do not reintroduce a second activation anywhere.
- **`docs/briefs/CARD_ART_INTEGRATION.md`**'s R2 requirement is STRUCK (see the brief itself); the
  loadout screen must not quietly restore an inspect/confirm flow.

## HOUSE RULES (binding)

- No emojis in app copy. Pixel-art integrity: integer scaling, no smoothing, no blur. 60 Hz and 120 Hz
  both correct — nothing may assume a fixed dt.
- Never weaken, delete or tolerance-band an assertion to go green. Retarget the fixture and say so.
- Run the suite SERIALLY and confirm the `/tmp/hordes_suite` log when a red captures no assertion line.
- Do NOT run any git state command; leave the tree dirty and report the dirty count.
- A builder self-report is a claim, not evidence: quote raw tool output.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; the three proofs (pool / choice /
reward) with raw output; every retarget (file + line + why); the real-browser verifier result and PNG;
the dirty count; and an explicit **COULD NOT VERIFY** section.
