# HORDES — content design (achievements, items, luck, rare enemies)

Written 2026-09-12 by remy as the run lead, under the owner's delegation: *"I will leave the specifics of
tuning and implementing to you."* This is the CONTENT layer that waves W2 (achievement spine), W6 (enemy
guide + rares), W7c (items + luck) and A1 (art) implement. It exists so those waves share one id
vocabulary and one design intent instead of each inventing its own.

**CANONICAL ID RULE:** achievement ids below are the source of truth. Trophy art ids MUST match them
exactly (A1 used provisional ids; reconcile to this list). Ids are UPPER_SNAKE and stable forever —
players will have earned them, so renaming one is a save-migration event.

**The spine:** achievements UNLOCK content (Vampire Survivors' model, where achievements literally are
the unlock engine). A badge with no unlock is decoration; every achievement below names what it unlocks.
Unlocks are the answer to "we don't have enough options" — so the early ones must arrive fast.

---

## 1. Achievements (the unlock spine)

### Opening — teach by playing, unlock fast (a new player should earn 3 within ~5 runs)
| id | Requirement | Unlocks | Intent |
|---|---|---|---|
| FIRST_BLOOD | Complete your first run (any outcome) | Nothing (it's the welcome) | Confirms the loop ends and restarts |
| REACH_WAVE_3 | Reach wave 3 | Weapon: SCYTHE | First taste of a new weapon |
| FIRST_DRAFT | Take 10 draft picks across runs | Upgrade tier: draft reroll (1/run) | Teaches that the draft is the game |
| DIE_LEARNING | Die before wave 2 five times | Upgrade: +5% starting damage | Rewards the intended early failure instead of punishing it |

### Progression — the main ladder
| id | Requirement | Unlocks |
|---|---|---|
| CLEAR_WAVE_5 | Clear wave 5 in a run | Character: second pilot |
| FIRST_EVOLUTION | Evolve a weapon | Upgrade: evolution tokens +1 |
| SYNERGY_PAIR | Hold a live synergy pair at wave 3 | Weapon: the pair's partner weapon (if locked) |
| MAX_ONE_WEAPON | Take a weapon to max level in a run | Upgrade: weapon slots +1 (see slot note) |
| FIVE_MINUTES | Survive 5 minutes | Upgrade: +1 potion carry |
| BOSS_NO_HIT | Kill a boss without taking damage | Item: rarity floor +1 on boss drops |

### Mastery — rewards for understanding, not grinding
| id | Requirement | Unlocks |
|---|---|---|
| GREEDY_RUN | Clear wave 3 with stance GREEDY (or MANUAL + GREEDY) | Upgrade: stance unlock (a 4th stance) |
| SAFE_SPIRAL | Reach wave 5 without ever leaving SAFE | Upgrade: +10% pickup radius |
| MANUAL_PILOT | Kill a boss with the pilot in MANUAL | Upgrade: manual control improvements |
| ONE_WEAPON_RUN | Reach wave 4 holding one weapon | Weapon: a high-risk high-reward option |
| BAD_DRAFT_SURVIVOR | Reach wave 3 after 5+ deliberately poor picks | Cosmetic trophy only (a joke that lands) |

### Discovery — feeds the enemy guide (W6)
| id | Requirement | Unlocks |
|---|---|---|
| BESTIARY_10 | Encounter 10 distinct enemy types | Guide upgrade: shows enemy HP |
| BESTIARY_ALL | Encounter every base enemy type | Guide upgrade: shows enemy drops |
| RARE_SIGHTING | Encounter a RARE enemy | Upgrade: rare spawn chance +5% |
| VERY_RARE_SLAY | Kill a VERY RARE enemy | Cosmetic trophy + guaranteed-drop note in the guide |

### Timed / challenge (feeds G11)
| id | Requirement | Unlocks |
|---|---|---|
| SPEED_CLEAR | Clear the finale in under 4 minutes | Challenge mode: RUSH |
| NO_POTION_CLEAR | Reach wave 5 without drinking a potion | Challenge mode: IRON |
| HEAT_5 | Reach heat 5 | Challenge mode: HEAT LOCK |
| GLASS_CLEAR | Clear the finale with max HP under 60 | Challenge mode: FRAGILE |

### Meta — the shop as a project
| id | Requirement | Unlocks |
|---|---|---|
| GOLD_10K | Bank 10,000 gold total | Upgrade: gold find +5% |
| HUNDRED_RUNS | Complete 100 runs | Cosmetic: title card frame |
| CATALOGUE_HALF | Own half the shop catalogue | Upgrade: refund unlocked (see §4) |
| FULL_CATALOGUE | Own the entire shop catalogue | Cosmetic: a finished-game trophy |

**Deliberate gap:** no achievement for "unlock everything" as a grind goal, and no achievement that
requires playing badly in a way that is tedious. Rewards should celebrate understanding.

---

## 2. Run-altering items (W7c) — the depth the game is missing

"Run-altering" means it changes HOW the run plays, not how big a number is. Each should be understandable
in one line and change decisions immediately. Proposed first set (12):

| name | effect | why it's interesting |
|---|---|---|
| MOMENTUM | damage scales with your current speed | rewards kiting as a build, interacts with GREEDY |
| GLASS CANNON | +100% damage, -50% max HP | makes the early lethality the player's own choice |
| BLOOD PACT | skills cost HP instead of mana; mana is removed | converts a resource into risk |
| GREED'S TOLL | double gold, +30% enemy speed | pays for the grind out of danger |
| HOARDER | damage scales with gold earned THIS run | makes GREEDY a damage build |
| MIRROR VOLLEY | your volley also fires backwards | changes positioning fundamentals |
| SECOND WIND | revive once at 25% HP with a shockwave | one mistake forgiven, once |
| ANCHOR | +40% damage while standing still | inverts the kite build entirely |
| SINGULARITY | -1 weapon slot, +60% damage on the weapons you keep | a real cost, not a free buff |
| CHAIN REACTION | enemies explode on death for a share of their max HP | turns crowd density into a weapon |
| POTION DEBT | each potion drunk this run gives permanent +damage | makes potions a build, not a safety net |
| RATIONED | no potions drop, but +2 max HP per kill | trades burst safety for sustain |

**Design guard:** none of these may be strictly better than a stat card at the same rarity. Each must make
some player say "not for this build". That is what makes a draft a decision.

---

## 3. Luck as a real factor (W7c)

Precedent from the research: Vampire Survivors' Luck raises the chance of a 4th level-up option
(`chanceFourth = 1 - 1/totalLuck`) and biases offers toward items you already own. Megabonk's equivalents
are community-discovered. Adopt the same shape but keep the SPLIT: LUCK IS SHOWN AS A NUMBER, its effects
are never explained.

| luck affects | shape |
|---|---|
| 4th draft option | chance rises with luck (the single most feelable effect) |
| rarity floor on drops | luck nudges chest/gem rarity upward |
| rare enemy spawn | luck raises RARE / VERY_RARE spawn odds |
| potion drop rate | small effect, already a draft lever |

**Rule:** luck must be MEASURABLE in the sims (report the delta at low/mid/high luck) so we can prove it
matters rather than hope it does. Surfaces show the number only.

---

## 4. Rare and very-rare enemies (W6)

| tier | shape | rate | drop |
|---|---|---|---|
| RARE | an existing type with an elite modifier + a visible tell (aura/outline) | ~1 in 25 spawns, rising with luck and wave | better loot, guaranteed chest chance |
| VERY_RARE | a named unique that FLEES and must be caught before it despawns | ~1 in 300 spawns, rising with luck | guaranteed high-rarity drop, guide entry |

"Guaranteed" matters: a very-rare that can be killed for a *chance* of a reward teaches nothing. And the
flee behaviour makes catching it a skill moment rather than a spawn lottery.

Both tiers must be MODELLED in the sims (they change both difficulty and income), not merely added.

---

## 5. Shop refund (W5, from the genre study)

A penalty-free refund of purchased meta upgrades: full gold back, no penalty, reversible. The point is not
convenience — it is that a purchase you cannot undo is a purchase a player is afraid to make, and a
player who is afraid to experiment never learns the shop. Gate it behind `CATALOGUE_HALF` so it arrives
as a reward for having engaged with the system, not as a day-one toggle.

---

## 6. What this design deliberately does NOT do

- **No random permanent stat sinks.** Vampire Survivors' Golden Eggs (10,000 gold for a *random* permanent
  stat) produced players who degraded their own movement control. Every permanent upgrade here is
  deterministic and refundable.
- **No curation/enable-disable UI yet.** The owner has ruled pool dilution is not a current concern, and
  both reference games hide their curation tools so well players cannot find them. Revisit only when the
  catalogue is large, and then adopt the full-slots-narrowing rule first (see GENRE_RESEARCH §2).
- **No explanation of odds, ever.** Facts only (pool counts, luck numbers); the interpretation is the
  player's to earn.
