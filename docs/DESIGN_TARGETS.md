# HORDES — design targets (consolidated from the genre study)

Written 2026-09-12 by remy (run lead). Sources: `GENRE_RESEARCH.md`, `CATALOGUE_PLAN.md`, the two
catalogue studies and the five variety studies in this session. **Numbers here supersede earlier
scattered figures.** Every claim is sourced in those docs; unverified items are flagged there.

## 1. THE CORRECTION THAT MATTERS MOST: our run length is wrong, and we have no WIN state

The run-structure study killed my own assumption, so it goes first.

| game | typical run | win condition |
|---|---|---|
| Vampire Survivors | **30 min** (15 with Hurry) | survival to the timer = **"stage complete"** + gold bonus; the Reaper ends it after |
| Megabonk | **10 min** per stage, tiers chain to ~30-40 min sessions | kill the stage boss, take the portal to the next stage |
| HORDES today | **~3.5 min, ended by death** | **none — you just die** |

**Two consequences, both big:**
1. **"Everyone dies by minute 5" is not a design choice matching the genre — it is a failure state.**
   Both leaders treat 10-30 minutes as a *completed* run. Our runs are shorter than one VS warm-up.
2. **We have no victory.** VS hands out a discrete "STAGE COMPLETE" with a bonus for surviving to the
   limit. If every run ends in death, then every run is a loss, and the testers' "no challenge /
   overpowered / this feels off" reads are partly a *missing win state*, not only a balance problem.

**New targets:**
- A **completed run = 8-12 minutes** (~10 as the working unit). Long enough to be a genre peer, short
  enough for a browser.
- **Add a "RUN SURVIVED" win** at the time limit with a payout bonus. The boss stays a milestone
  (it should unlock the next difficulty/mode), NOT the only way to end a run. Non-boss runs must be
  able to END IN A WIN.
- **Cadence:** one wave per minute, a per-minute enemy scaling ramp, and a boss/elite beat every ~2-3
  minutes so a 10-minute run has 3-4 escalation beats (VS scripts a boss at :25, Megabonk lets the player
  summon one).
- **Economy reprice:** 60h at ~10 min = **~360 runs** (not the ~1,029 I computed at 3.5 min). 40h (the
  final-boss target) = **~240 runs**. All shop pricing must be rebuilt against ~360 runs. The old
  35-65% / 30-good-run targets encode the wrong unit and must be replaced.
- Genre cross-check: VS completionist mean **56.6h** (n=861) and Megabonk **59.5h** (n=37) — our 60h
  target is normal. Our *run count* was the outlier, not the hours.

## 2. Variety targets (what a 60-hour game actually contains)

| axis | target | basis / why |
|---|---|---|
| STAGES | **6-8 player-selectable**, each with 2-3 modes/tiers (~12-24 configurations) | VS ships ~27 selectable; Megabonk 3 maps x 3 tiers. Beyond ~8 bespoke stages returns diminish — spend the rest on modifiers |
| STAGE MODEL | **"modifier-on-arena"**: reuse geometry, swap the enemy pool, apply per-stage stat modifiers, retint, add ONE signature hazard | This is the VS model and captures most player-perceived value at a fraction of bespoke cost. **Never ship a reskin** — players judge maps on mechanics ("desert sucks cause of scorpions"), not art |
| MODIFIER AXIS | a Hyper/Inverse/Endless-style toggle layered on existing stages | Best ROI in either game: multiplies configurations at near-zero content cost |
| CHARACTERS | **14-18**, one meaningful unlock per 3-4 hours | VS's 225 are mostly variants; players say the mid-roster "merges together" |
| ENEMY TYPES | **25-40 named**, over **~8 distinct behaviours** (hard cap 10) | VS has 392 entries on ~6-8 behaviours and is criticised for monotony; Megabonk ships 51 |
| ABILITIES | **3-4 actives** (roles: CC / burst / mobility / defense) + **12-20 rule-changing cards** | Neither leader has active abilities at all — the gap is not actives |
| WEAPON BEHAVIOURS | **~10-15 distinct** (orbit, boomerang, ground zones, chains, summons, movement-dependent, freeze, shield, splitter) | VS hides ~15-20 behaviours behind 300+ entries; behaviour is the real variety metric |
| CATALOGUE | ~130-150 entries: 35-45 weapons + 20-25 global scalers + 60-80 relics | see `CATALOGUE_PLAN.md` |

## 3. Design rules distilled (each one earned from a failure the study found)

1. **UNIQUENESS MUST BE UNSHAREABLE.** VS characters "merge together" because any character can pick up
   any weapon — a unique starting weapon is a *head start*, not an identity. So each character needs
   **one signature rule no other character can access** (a unique resource, a targeting rule, an economy
   interaction), with the starting kit reinforcing it. **Litmus: can a player describe this character's
   plan in one sentence that differs from every other character's plan? If not, it is a skin.**
2. **VARIETY IS BEHAVIOURS, NOT NUMBERS.** 392 enemies on 6-8 behaviours reads as monotony. Every new
   tier should add a *mechanic*, not a multiplier — the study's own suggestion: rare = the first
   projectile user, very-rare = the first splitter/encircler. VS has **no splitter**; that is a gap worth
   owning.
3. **RULES BEAT STATS FOR DEPTH.** VS's 22 Arcanas define builds because they rewrite rules ("healing also
   damages nearby enemies", "XP is halted and gems become projectiles", "empty slots grant cooldown").
   The counter-example is a comparable game whose 23 characters "play exactly the same" with passives
   that are "just multipliers". Depth came from **interaction**, not count.
4. **ELITES: STAT + RESISTANCE + SIZE + PERSISTENCE, with EXACTLY ONE visible tell.** Steal VS's rule that a
   boss **cannot be outrun** (it teleports back on screen) — that is what makes an elite feel unavoidable
   rather than spongey. Give each elite a resistance so the optimal damage build must change.
5. **PUBLISH THE RARE RATE AS A NUMBER.** Megabonk: 0.6% base per eligible spawn, linear with an "elite
   spawn increase" stat, and **not every enemy can roll elite** (that exclusion is what keeps elites
   feeling like events rather than recolours). Make rarity a build choice, not a vibe.
6. **THREE WAYS TO MAKE A RARE *FELT*** (all observed): (a) SPAWN-TELL — unique silhouette, size bump,
   colour outline, boss HP bar, rigid clock position; (b) **ANTI-TELL — the Mimic model: disguise it 1:1 as
   a common enemy and let recognition be the reward**, backed by a guaranteed distinct drop; (c) MAP/UI-TELL
   for secrets — pulsing stage icon, a black question mark on the map, a silhouette, a stopped timer.
   Our very-rare tier should use (b) at least once: it is the cheapest memorable encounter in the genre.
7. **A BESTIARY MUST DO FOUR JOBS OR IT IS AN AFTERTHOUGHT:** a per-enemy KILL COUNTER (proof of progress),
   combat stats that matter (HP/power/speed/resistances/skills/stage), undiscovered entries that show the
   SLOT but hide the identity (number visible, name and stats masked), and a HOOK (unlock-tied entries
   highlighted, flavour text). VS's own wiki runs a "which entry am I missing" lookup because chasing the
   last entries is real player activity.
8. **DIFFICULTY MUST BE OPT-IN AND REWARD-POSITIVE.** Both leaders pair a difficulty dial with **more**
   rewards (VS Curse -> more kills/XP/gold; Hyper +50% gold; Megabonk Difficulty -> more XP/Silver/gold).
   This is the genre's primary long-tail progression tool and we barely have it: our heat exists but must
   visibly PAY MORE, not just hurt more.
9. **ONE CURRENCY IS ENOUGH.** VS runs a 50-60h meta on gold alone. If we add a second, split by SCOPE
   (permanent meta vs per-run spending), never by count.
10. **THE SHELF IS THE SELL.** VS shows a collection grid with question-mark silhouettes and a *growing*
    denominator; Megabonk advertises "94 things to unlock in total". Showing the total is part of the
    felt scale.

## 4. Anti-patterns (do not copy)

- A roster of reskins (VS's mid-roster sameness). A stage that is a palette swap (players punish it).
- More enemies without more behaviours (VS's most-cited monotony complaint).
- Grind walls in front of content (Megabonk's Silver economy is its most-criticised feature).
- Random permanent stat sinks (VS Golden Eggs — players degraded their own movement control).
- A daunting fixed "% complete" (a growing denominator is better psychology).
- Explaining odds or the pool math anywhere. Facts only; the interpretation is the player's to earn.

## 5. What this changes in the plan

- **G18 (run length) is now the top structural priority**, ahead of the economy: extend a completed run to
  ~10 min, add the RUN SURVIVED win, script the cadence, then reprice on ~360 runs.
- **New content goals**: stages + modifier axis, character rule-benders, rule-changing cards, enemy
  behaviour budget, the elite rarity dial, rare signalling, the bestiary spec.
- **The catalogue and per-character work stay valid** — but the hours now divide differently, and the
  "hours per unlock" pacing should target one meaningful unlock per 3-4 hours.

## 6. The APEX tier (post-completion prestige)

Optional, deliberately game-breaking shop items ABOVE the normal catalogue. **Excluded from every
completion/pacing calculation** — they are a stretch goal for the committed player, and the visible proof
that the player did it.

- **Cost is calibrated against measured END-GAME income** (a fully developed late build), never against
  early runs. This is the one place a long grind is correct — because it sits *after* the content, not in
  front of it (the exact opposite of the criticised Megabonk Silver wall).
- **They remove constraints, they do not add numbers.** "+20% damage" is not apex; "weapons never stop
  firing" is.
- **Visible ownership, or the grind has no trophy value:** aura, title, HUD flourish, full-screen pixel-art
  gallery entry.
- **Net effect on the meta:** gold keeps a target forever after the ~60h curve, so the loop does not die
  when everything is unlocked.

**Non-negotiable protections:** deterministic (never random — see the Golden Eggs cautionary tale), always
toggleable off (the Megabonk Toggler lesson), never required by any achievement/trophy/stage/ending, an
explicit `apex` flag in the catalogue data so tooling and sims exclude them, and a marked result so a clean
un-boosted clear stays distinguishable.
