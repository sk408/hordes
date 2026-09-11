# HORDES — first-run tour: on-screen controls coverage (rev 4, 2026-09-11)

**Source of truth for WHAT must be introduced: `CONTROLS_INVENTORY.md`** (57 controls, every one
with a `file:line` and a tour-coverage verdict). Read it before touching the tour. Current state:
**13 covered, 5 partial, 39 not introduced.**

**Supersedes rev 3's checklist** and corrects two errors in it:
1. rev 3 told you to coachmark "mode select (IDLER vs STORY)" and a "division/chip selector".
   **Those have no on-screen elements** — you were right to skip them under the never-break rule
   (see your own note at `src/main.js:1849`). Disregard them entirely.
2. rev 3 listed controls generically. The inventory replaces that with the actual control set.

Sk408's verdict, verbatim: *"I meant all the on screen controls. Style and stance and etc. they
didn't have an intro."* The named gap is real and confirmed at source level: **FOCUS and STANCE have
zero tour steps** — not the key (`TAB` / `G`), not the touch button (`tc-focus` / `tc-stance`).

---

## The design rule that keeps this sane (read this before adding steps)

**Do not coachmark all 57 controls.** A 57-step tour would be worse than no tour. Split by intent:

- **The TOUR** (interactive, click-to-advance, first run only) covers the controls the player must
  understand **to play the first run competently** — the ones that change what they do in the next
  60 seconds. Everything in the "MUST COACHMARK" list below.
- **HOW TO PLAY** (the static reference screen, reachable from the title) carries the **exhaustive**
  list. It already exists; its job is to be complete and correct for the controls the tour only
  points at in passing.
- **The key-hint footer** (`index.html:221`) is the in-overlay cheat line. It is currently the ONLY
  in-game surface listing FOCUS / STANCE / zoom keys. Keep it, and **verify it is accurate** — a
  stale hint line is worse than none.

If a control doesn't belong in either the tour or HOW TO PLAY, it belongs nowhere and should not
exist. Don't leave a control that no surface explains.

## MUST COACHMARK (add these; this is the fix for the complaint)

1. **FOCUS lever** — `TAB` / the `tc-focus` button. Which enemy the auto-aim volleys target:
   NEAREST → TOUGHEST → SWARM → RANGED. The badge on the button shows the current mode.
   **This is the headline gap.** A player who never touches it has no idea the targeting is
   steerable at all, and will conclude the autopilot is just "whatever it feels like."
2. **STANCE lever** — `G` / the `tc-stance` button. Risk appetite: SAFE → BALANCED → GREEDY
   (SAFE kites at 2x distance, GREEDY at 0.5x and leans toward loot). **Sk408 named this
   explicitly.** It's the single most interesting decision available in AUTO mode — teach it as a
   choice ("what kind of run do you want"), not as a setting.
3. **The intermission screen at the end of wave 1** — CONTINUE, the paid chest gamble
   (BRONZE/SILVER/GOLD, with real odds), blessing offers, and RAISE THE STAKES (permanent gold
   multiplier for +1 heat). This screen arrives at the end of the first wave with **zero onboarding
   today**. If the player doesn't understand the chest gamble here, the run economy is invisible.
4. **The end-of-run screen** — RETRY (`R`) and TITLE (`T`). One step, fires once on first death.
   The player's first death is the moment they most need to know the loop continues.
5. **The world interactables, introduced as they first appear** — chests (walk in to pop),
   the wave portal ("walk through"), arches (cross for a timed buff), shrines (proximity auto-buy
   for gold, ~60% of waves). A first-run player meets all four within minutes and is told nothing.
6. **STATS / FIELD REPORT** — the `STATS` button and `S` / `I`. Worth one step: it's where the
   player reads why they're dying.

## Pair the spotlights properly (these are PARTIAL today, fix by targeting both)

- **`skills`** names FROST (Q) and OVERCHARGE (E) but only spotlights `tc-q`. Spotlight both `tc-q`
  and `tc-w`, and note the W-in-AUTO / E-always subtlety.
- **`potions`** names HP (35) and MP (40) but only spotlights `tc-h`. Spotlight both `tc-h` and
  `tc-n`, and name the **H / N keys** too — the current text says "tap to drink", which is
  touch-only framing on a game that also has a keyboard.
- **`move`**, **`pilot`**, **`draft`** — mention the number keys (1/2/3) for draft cards, which are
  never named.

## Explicitly NOT tour steps (route to HOW TO PLAY instead)

The contents of SHOP, CHARACTERS, SETTINGS, and HOW TO PLAY itself; the evolution screen; zoom
(`+`/`-`); the cinematic skips; and the passive HUD readouts (mana bar, event feed, weapon/item
rows, weather glyph, text HUD). These are reference material, not first-minute decisions. But they
**must** be documented in HOW TO PLAY, and HOW TO PLAY must be verified complete against the
inventory — today nothing introduces that screen's contents either.

## Mechanics (unchanged from rev 1 — all still requirements)

Dim the screen and spotlight **the real element in place** (never a redrawn mock). One line per
step: what it does and why you'd care. **Advance only on the player's click/tap.** First run only,
persisted in the save. **Always skippable** (visible Skip + Escape). **Never break on a missing
target** — skip that step silently (the existing engine already does this; keep it). Replayable from
settings. **Pause the sim during in-run coachmarks.** Order steps the way the player meets them, not
DOM order. Verify on a real phone.

## Acceptance bar

`CONTROLS_INVENTORY.md` coverage goes from **13 YES / 5 PARTIAL / 39 NO** to: every control in the
MUST COACHMARK list reads YES, every PARTIAL is resolved by spotlighting both targets, and every
remaining NO is either (a) documented in HOW TO PLAY or (b) recorded here as a deliberate
non-goal. Update the inventory's coverage column as you go — it is the checklist, not this prose.
