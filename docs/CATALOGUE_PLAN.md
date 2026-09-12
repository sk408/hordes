# HORDES — catalogue expansion plan (from the genre study)

Written 2026-09-12 by remy (run lead). Source data: `GENRE_RESEARCH.md` (systems) plus the two catalogue
studies in this session. Feeds wave **W7d** and the economy in **G17**. Every count below is sourced;
see the studies for URLs.

## The benchmark: our 60-hour target is genre-normal

| game | completionist time | catalogue size | gold shop size |
|---|---|---|---|
| Vampire Survivors | ~16.5h main, **~58h 100%** (HowLongToBeat) | 512 collectibles all-DLC (132 in base v1.0); 187 weapons + 135 evolutions + 34 passives + 34 arcanas | **26 PowerUps** |
| Megabonk | **30-40h** to unlock everything | 30 weapons + 23 tomes + 85 items + 21 characters (~159) | ~13 shop upgrades |
| HORDES today | **~15.3h** (measured) | 34 purchasables, 522,194g | 34 |

So the *hour* target is right; the *catalogue shape* is wrong. Note VS reaches 58 hours with only **26**
gold-bought upgrades — its hours come from achievements + discovery, not from a huge gold shop. If HORDES
puts all 60 hours on gold, it will feel like a grind treadmill; **the hours must be split between gold
progression and discovery/unlock progression.**

## The two breadth strategies, and what to take from each

**FROM VAMPIRE SURVIVORS — shared-catalyst evolutions (the biggest breadth-per-asset win).**
Each weapon maps 1:1 to its evolution, but the CATALYSTS ARE SHARED: ~19 passives produce **118
weapon→catalyst links (~5-6 evolutions per passive authored)**. Authoring one passive lights up evolutions
on 5-6 existing weapons. VS also buys depth with *boring numbers as keys*: ~80% of passives are plain
stat lines, and their value is the evolution web they open, not what they say. And rarity is a **per-item
integer that IS the pool weight**, so ~15 high-weight "core" items appear constantly while evolved/special
items sit at near-zero weight and never clog the draft — free depth, zero assets.

**FROM MEGABONK — the tri-category split + stacking.**
- **Three categories that multiply:** ~30 active WEAPONS (slot-bound, own attack pattern), ~23 TOMES
  (global scalers that buff EVERY weapon, level to 99), ~85 ITEMS (run-long passives with triggers).
  Global scalers are the best breadth-per-effort single choice: enormous perceived variety for little code.
- **STACKING is the cheapest breadth that exists:** most items can be taken repeatedly, additively, with no
  diminishing returns. One authored item = several purchases and several build decisions. A minority are
  capped/non-stacking (one revive, a damage cap) so stacking isn't mindless.
- **Presentation sells the scale:** an Unlocks grid with blacked-out entries, rarity colour-coding, and a
  headline total ("94 things to unlock in total") stated up front.

## Target structure for HORDES (my call, to be validated by play)

| category | target | notes |
|---|---|---|
| WEAPONS (active, slot-bound) | **35-45** base + one evolved form each | each needs its own attack behaviour and art |
| GLOBAL SCALERS (tome-equivalents) | **20-25**, multi-level | buff every weapon; cheapest breadth |
| RELICS / ITEMS (run-long effects) | **60-80**, most stacking 3-5 deep | the Megabonk "items" layer |
| **total buildable entries** | **~130-150** | vs 34 today; ~5 stack levels each ≈ 650 purchase levels |
| EVOLUTION PAIRS | ~18 shared catalysts × 3-5 weapons each | gives ~60-90 discoverable evolved forms from ~18+45 authored assets |

**Cost shape (this is what fixes the "two items = 48%" problem):** average ~4,000-5,000g per entry across
the catalogue, with a **hard cap of ~5% of catalogue cost for any single item** (order 25-30k = "a few
hours", the owner's ceiling). The two current monsters (`arcade` 140,000g, `weapon_beam` 110,000g) must be
broken into 8-12 smaller linked entries each — they are why our catalogue is lopsided.

## Anti-patterns the studies warn about (do not copy)

1. **MEGABONK'S SILVER GRIND IS ITS MOST-CRITICIZED FEATURE** — players complain the economy is "out of
   whack" and that unlocking everything is too slow. 60 hours of *goal* is good; 60 hours of *tedium* is
   the failure mode. Keep the early ladder fast (the first purchase within 1-3 runs) and put the length in
   OPTIONAL breadth, not in a wall in front of the content.
2. **POOL DILUTION** — Megabonk explicitly warns against unlocking too much too fast; the owner has ruled
   this is not yet a concern for us, but once the catalogue reaches ~130 entries it becomes real. The fix
   both games rely on (full slots stop offering that category) should be adopted at that point, BEFORE any
   curation UI.
3. **DON'T BUY DEPTH WITH EXOTIC MECHANICS** — VS's depth comes from plain stat lines acting as evolution
   keys. Novel effects are expensive to author and tune; breadth should come from *combination*, not from
   inventing 130 unique behaviours.
4. **DON'T MATCH THEIR SCALE** — 225 characters and 80 stages is a decade of live-service content. Go wide
   on weapons/scalers/relics; stay thin on characters and stages.
5. **A LOCKED ENTRY MUST ADVERTISE ITSELF** — VS shows question-mark silhouettes and a *growing*
   denominator (so the player cannot see the full remaining wall); a fixed daunting "% complete" is worse
   psychology than a grid that reveals itself.

## The capstone (cheapest way to turn a catalogue into hours)

VS's Queen Sigma requires completing the ENTIRE base-game collection, converting the gallery into a quest.
HORDES should have one equivalent prestige unlock gated on completing the first collection category. One
flag, one character, and the gallery becomes a goal instead of a list.

## Verification requirement

Every count here is a DESIGN TARGET. The acceptance test is the sim: after W7d the economy must show a
60+ hour catalogue with no single item above the cap, and a ~40-hour profile able to clear the finale while
a fresh profile cannot. Art scales with the catalogue, so the A1 art format and art-lint test gate every
new entry.
