# HORDES — BUILD PLAN (the loop)

Owner's instruction: *"make sure you have a solid plan and add whatever items you determine from your
megabonk and vampire survivors deep dive as well as any you come up with while implementing. and your set
goal is to loop through until you have acheived the full build you have written."*

Companion docs: `HORDES_GOALS_2026-09-12.md` (per-goal acceptance bars) and `GENRE_RESEARCH.md`
(the sourced genre study). This file is the SEQUENCE.

## Definition of "full build complete"

All waves below marked DONE, with:
1. every goal in the goals doc verified against the build (not asserted),
2. the published site serving that build (verified by fetching live files for a build marker),
3. the full test suite green with no weakened assertions,
4. every visual/cinematic item confirmed by a real-browser screenshot + a vision read,
5. every new screen verified on a PHONE form factor (the owner plays on his phone).

## Standing rules for every wave (non-negotiable)

- **One writer per file.** Art/asset work goes in NEW files (parallel-safe); two agents in `main.js` is
  forbidden. Specify the data interface up front when two tracks must meet.
- **Every new mode must be registered in the screen-chrome gate** (`chromeOn`/`syncChrome`), then
  verified in a real browser. Wave-23 shipped a regression over the intro movie by skipping this.
- **Visual and cinematic items are verified by screenshot + vision read.** A code claim is not evidence
  for anything a player looks at.
- **Agent self-reports are not evidence.** The loop verifies every claim independently before accepting.
- Full suite after every wave; honest pass/fail; a test may be retargeted to a replaced contract but
  never deleted or turned into a no-op.
- No `git commit/checkout/reset/stash/clean` by agents. No emojis. Integer pixels. 60Hz and 120Hz both
  correct — nothing may assume a fixed dt.
- Commit after each verified wave with an honest message that says what did NOT work.

## Waves

- **W0 — DONE** (commits 78b20b8 → 6f69bed): the bug-hunt run, the repair round, the design pass, and
  the wall/doctrine/camera wave. Publishing as G1.
- **W1 — SAVE FOUNDATION + EXPORT/IMPORT.** Profile schema version, documented migration for older
  saves, validation for every persisted collection, lossless export/import (download + file input, with
  the File System Access API as an enhancement where available), autosave-before-exit, and a test that
  loads a corrupted AND an old-format save safely. **Unblocks W2–W9** — nothing else may persist new
  data until this exists. (G12 foundation)
- **A1 — ART TRACK (parallel with W1, new files only).** Trophy art, character portraits, shop/upgrade
  icons, the title-screen graphic and the detailed portal art, authored in the game's existing integer-
  pixel grid+palette format in NEW files, with an art-lint test (dimensions, palette legality, no
  smoothing assumptions). Runs alongside W1 because new files cannot conflict. (G9, G13, G14, G16)
- **W2 — ACHIEVEMENTS AS THE UNLOCK SPINE.** Achievements that UNLOCK real content (weapons, items,
  upgrades) rather than a badge list, persisted on the W1 schema. Precedent: in Vampire Survivors
  achievements ARE the unlock engine. This is the direct answer to "not enough options". (G9)
- **W3 — TROPHY GALLERY + FULL-SCREEN TROPHY ART.** Gallery of earned/locked trophies; selecting one
  shows its full-screen pixel art (the showcase feature). (G9)
- **W4 — TITLE SCREEN + STARTUP MENU + EXIT/LOAD.** A dedicated title graphic (NOT the map), menu of
  START GAME / ACHIEVEMENTS / SETTINGS / EXIT GAME, EXIT offering save-to-disk (with the honest
  close-attempt + farewell fallback), and START offering load-from-disk when no local save exists.
  Sequenced AFTER W3 so no menu item opens nothing. (G12)
- **W5 — CHARACTER SELECT + SHOP ART + REFUND.** Animated character selector using the A1 portraits,
  pixel-art icons for every shop row, and a penalty-free refund of purchased meta upgrades. (G13, G14,
  and the genre-steal item below)
- **W6 — ENEMY GUIDE + RARITY TIERS.** Bestiary recording enemies actually ENCOUNTERED (unknown entries
  as tantalising silhouettes), plus rare and very-rare enemy tiers at controlled, documented rates.
  Rares change difficulty and loot, so the sims must ACCOUNT for them, not assume. (G10)
- **W7a — SIM TOOLING + ECONOMY.** Make the simulation model ARCH BUFFS so the wave-25 arch fix stops
  being unmeasurable (it roughly doubled fire rate under DOUBLE_FIRE and neither sim references arches),
  rank the meta upgrades by MEASURED marginal value rather than the hardcoded greedy order, then retune
  the economy for G17's real grind (prefer prices over payouts) and re-baseline the sim's own targets so
  they encode the NEW intent. Model weapon unlocks as +1 option AND pool dilution, and report each
  unlock's NET value at the real slot counts.
- **W7b — DRAFT DIVERGENCE TO >= x1.6.** Depends on W7a's tooling. Widen good-vs-bad by raising the
  CEILING (coherent builds compounding), never by lowering the floor: making bad drafts more punishing
  is forbidden. Invariants that survive: one bad pick never loses a run, a bad draft can still fail, good
  beats bad on >=3/5 metrics. Measure on BOTH survival and waves cleared.
- **R1 — CATALOGUE RESEARCH (running, read-only).** A study of what ITEMS actually exist in Vampire
  Survivors and Megabonk: verified counts per category, the evolution-pair structure, rarity bands, the
  stacking rule, per-character kits, how each game PRESENTS its collection, and how long a meaningful
  fraction takes to unlock. The owner flagged this as a gap in the first study: our systems knowledge
  was good but our CATALOGUE knowledge was thin, and the catalogue is exactly what has to be broadened.
- **W7d — CATALOGUE BROADENING (depends on R1 + W7a).** Grow the catalogue to support a 60+ hour
  economy from BREADTH rather than from a couple of mega-priced trophies. Constraints already fixed:
  no single item above roughly a few hours of income; the cheapest tiers stay in the low hundreds to
  ~1,500g so the opening still hooks; every new item needs an icon (so the A1 art format and art-lint
  test scale with it). Prefer whichever breadth multiplier R1 endorses (evolution pairs, stacking, or
  category structure) over one-off items.
- **W7c — RUN-ALTERING ITEMS + LUCK + POOL FACT.** Run-altering items and general skill items in the
  level-up pool, luck as a real factor, and the draft screen showing the pool as a FACT ("3 of 11") with
  no explanation. Balance invariants must still hold. (G8, and the fact/interpretation steal item)
- **W8 — CINEMATICS.** The death movie (composing with the death payoff screen, not replacing it) and the
  portal-entry upgrade with the owner's beat sequence: detailed portal → approach → PAUSE → pilot fades →
  linger a beat or two → fade out. Visual verification. (G15, G16)
- **W9 — CHALLENGE MODES + TIMED ACHIEVEMENTS.** Modes that alter run rules, plus time-constrained
  achievements. Must not corrupt normal progression. (G11)
- **W10 — FULL-BUILD VERIFICATION + PUBLISH.** Walk every goal, verify each in a real browser and on a
  phone, re-check the original playtest complaints item by item, publish, and confirm what Pages serves.
- **W11 — STRETCH: 2.5D/ELEVATION** (G7). Only after the full build ships, since it is explicitly
  optional and touches the same files as everything else.

## Items I am ADDING from the genre deep dive (and why)

1. **Penalty-free refund of purchased meta upgrades** (Vampire Survivors' PowerUps refund). One design
   promise, removes all "I ruined my save" anxiety, and it makes every purchase safe to experiment with —
   which is exactly how a player learns a shop. Folded into W5.
2. **Show the pool as a FACT, never the interpretation.** The draft screen shows counts ("3 of 11") and
   never explains what that means for odds. This is the concrete implementation of the owner's hidden-
   trade-off rule and the safest version of every pool tool in both reference games. Folded into W7.
3. **Achievements must UNLOCK content, not just badge it.** Taken straight from VS, where achievements
   are the unlock engine. This is what turns the trophy work into DEPTH rather than decoration. W2.
4. **No random permanent stat sinks.** VS's Golden Eggs (10,000 gold for a *random* permanent stat, with
   players reporting they degraded their own movement control) is the cautionary tale. Any permanent
   upgrade in HORDES must be deterministic and refundable.
5. **Deferred trigger, not a build item: pool dilution.** The owner has ruled it is not a concern yet.
   When the weapon/upgrade catalogue grows enough to matter, adopt the rule both reference games rely on
   (full slots stop offering that category, so dilution is self-limiting) BEFORE building any curation UI.
   Trigger recorded so it is not rediscovered as a bug later.
6. **A curation list is explicitly NOT planned.** Both reference games hide it so well players cannot
   find it (Megabonk players ask "wait, you can toggle them off?"). If it is ever built it must be
   early, free, reversible, and reachable from where run decisions are made — never a late paid fix.

## Items I am ADDING from implementing (found while working)

7. **Art-lint test** (A1): dimensions, palette legality and integer-pixel compliance, so 100+ new art
   assets cannot quietly drift from the game's format.
8. **Every new system updates the reference surfaces.** The audit already found 8 conditionally-true
   claims in the hints panel and HOW TO PLAY. Each new screen/system must update them, and the
   claim-vs-behaviour check is repeated at W10.
9. **The first-run tour must stay in sync.** It currently teaches 15 things; new systems (gallery,
   achievements, character select, items) must be either taught or deliberately left to discovery — a
   recorded decision per screen, not an oversight.
10. **Autosave before any exit path** (W4) so the Exit Game flow can never lose progress, and the export
    must include everything the schema persists (achievements, trophies, encounters).
11. **Perf/phone check for every new screen** — the content grows substantially; a canvas game with a
    gallery must still open fast on a phone, and the owner plays on his phone.

## Loop mechanics

After each wave: verify independently (tests + spot-checks against the code + real-browser where visual),
commit with an honest message, update the goals doc status, then start the next wave. Publish (G1)
whenever correctness goals hold; re-publish at W10. Report to the owner at each wave with what actually
landed, what did NOT, and anything that needs a design call.
