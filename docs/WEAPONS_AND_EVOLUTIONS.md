# Weapons and evolutions — the in-run draft route

Branch `claude/overhaul`. This follows `docs/BALANCE_M1.md` (the career curve) and changes what the
in-run draft is for: taking weapon cards is the strong early plan, evolutions are a reachable mid-run
goal, and the stat cards are the smaller, safer, global picks. Measured with
`tools/progression_sim.mjs` (see `docs/PROGRESSION_SIM.md`); its AUTO pilot plays worse than a person,
so every figure is a floor.

## The rules in plain words

- **A weapon level-up card changes how the weapon behaves.** Every level past 1 adds the weapon's damage
  step (+60% Volley, +40% most weapons, +35% Zap / Nova / Ricochet / Beam, +30% Meteor, of the weapon's
  own damage) and most levels also add a projectile, a blade, a bounce, a chain target, a hit per pass,
  attack rate or reach. The card says exactly what the next level grants (`weapons.js WEAPON_LADDERS`).
- **Stat cards are small and global.** Whetstone +15% weapon damage (of the run's starting damage),
  Quick Hands -10% cooldown (tapering on repeats), Light Boots +15% speed, Gem Magnet +30% pickup,
  Split Shot +1 Volley projectile (under the Volley cap), Iron Heart +25 HP, Sharpened Tips +1 pierce.
  Split Shot and Fan Fire are the Volley's, as their cards say; every other weapon's count comes from its
  own levels.
- **Every stat card is the partner of one or two evolutions.** A weapon evolves when it is at Lv 8 and
  the run has taken its partner card. No token, no item roll. The evolve screen opens the moment both
  hold; NOT NOW defers it to the next level-up card. AUTO takes it after the draft timeout, a night run
  after `NIGHT_EVOLVE_S`.
- **The draft tells the plan.** Every weapon card carries a line under its effect: `evolves with Quick
  Hands (owned) at Lv 8`, and the card that completes an evolution (the last level with the partner
  owned, or the partner with the weapon maxed) reads `EVOLVES NOW: <name>` under an `EVOLUTION READY`
  badge. A stat card that is a partner of a weapon in the kit says `evolves <weapon>` and is offered
  twice as often (`PARTNER_WEIGHT_MULT`) until taken. The STATS screen lists each weapon's road.
- **An evolution is a spike on both sides.** The weapon changes form (table below, x1.3–x2 damage plus
  two behaviour changes), the whole kit's damage rises by 20% of the run's starting damage
  (`DRAFT_PLAN.EVOLUTION_KIT_DMG`), the hero is restored to full health and gains 15% of the run's
  starting max HP (`EVOLUTION_HP_FRAC`), and the first evolution ever gets the cinematic banner.
- **Committing pays (`config.js DRAFT_PLAN`).** The LEAD weapon is the highest-level weapon still on the
  road to its evolution (ties go to kit order); its level-up card grants two levels and says
  `LEAD WEAPON: +2 levels`. The first copy of a stat card also levels every weapon in the kit it is the
  partner of (`evolves Boomerang · +1 level: Boomerang`). A run that works one weapon at a time and takes
  its partner card evolves it in about half the picks; a run that scatters its picks gets neither bonus
  often. Under ONE OF EACH the rule's own +1 bonus level replaces the lead bonus.
- **Two evolved weapons that pair up fuse** (next section): a bigger spike again, and a weapon slot back.
- Weapons also gain XP from gems (1 a gem, `WEAPON_XP_BASE` 20 x level), so a weapon nobody drafts still
  climbs; a card jumps ahead. ONE OF EACH still pays +1 bonus level on weapon picks.

### The level ladders (cumulative; L1 is the base)

| Weapon | L2 | L3 | L4 | L5 | L6 | L7 | L8 |
|---|---|---|---|---|---|---|---|
| Volley | +1 projectile, +20% | +60% | +25% rate | +60% | +1 projectile, +20% | +1 pierce | +60%, +1 pierce |
| Orbit Blade | +1 blade (2), +radius, +40% | +radius, +40% | +1 blade (3) … | … | +1 blade (4) … | … | +1 blade (5) … |
| Boomerang | +40%, +15% speed, +1 pierce | +40%, +15% speed | +1 boomerang (2), +1 pierce … | … | +1 pierce … | … | +1 boomerang (3) … |
| Sun Javelin | +40%, +10% speed | … +25 range | +1 spear (2) … | … +25 range | … | … +25 range | +1 spear (3) … |
| Chain Zap | +35% | +35%, +1 chain target (4) | +35% | … (5) | +35% | … (6) | +35%, +25% rate |
| Nova Pulse | +6 radius, +35% | … | …, +33% rate | … | … | … | …, +33% rate |
| Scythe | +arc, +40% | … | …, +25% rate | … | … | … | …, +25% rate |
| Ember Shot | +40%, +3 blast | +1 bolt (2) … | … | … | +1 bolt (3) … | … | … |
| Ricochet | +1 bounce (4), +35% | +35% | +1 bounce (5) … | +35%, +25% rate | +1 bounce (6) … | +35% | +1 bounce (7) … |
| Seeker | +1 missile (2), +turn | +turn | +1 missile (3) … | … | +1 missile (4) … | … | +1 missile (5) … |
| Meteor | +30%, +4 blast | … | +1 meteor (2) … | … | …, +25% rate | … | +1 meteor (3) … |
| Mine Layer | +40%, +4 blast | … | …, +2 mines, +33% rate | … | … | … | …, +2 mines, +33% rate |
| Beam | +2 width, +35% | … | …, +25% rate | … | …, +60 length | … | …, +25% rate |

### The evolution table (`evolutions.js EVOLUTION_DEFS`)

| Weapon | Evolution | Partner card | What changes | Damage |
|---|---|---|---|---|
| Volley | Nova Shot | Split Shot | Every round pierces the whole lane and bursts into a nova on a kill. | x2, +15% crit |
| Orbit Blade | Twin Orbit | Quick Hands | A second counter-rotating blade ring; contact ticks come twice as often. | x1.5, rate x1.25 |
| Boomerang | Void Rang | Whetstone | Thrown faster, both legs pass through everything, and every hit drags the victim toward you. | x2, rate x1.5 |
| Sun Javelin | Solar Lance | Light Boots | The spear flies 2.5x as far, and every enemy it passes bursts into a small sun. | x1.6, +10% crit |
| Chain Zap | Tesla Tempest | Sharpened Tips | Chains fork at every jump, and a second bolt strikes the next-nearest enemy. | x1.8, +1 crit dmg |
| Nova Pulse | Supernova | Gem Magnet | Pulses reach 1.5x as far and come twice as often. | x1.5 |
| Scythe | Grave Harvest | Iron Heart | The sweep becomes a full circle, and every kill in it heals you. | x1.5, +20% crit |
| Ember Shot | Inferno | Quick Hands | Fires faster; kill bursts pay full damage over 1.5x the radius and leave burning ground. | x1.7, rate x1.3, +10% crit |
| Ricochet | Prism Shot | Split Shot | Twice the bounces over 1.5x the range, and every impact throws a shard at the next enemy. | x1.4 |
| Seeker | Hydra Swarm | Light Boots | Every hit hatches two more missiles, and lost missiles hunt three times as long. | x2, rate x1.3, +0.5 crit dmg |
| Meteor | Meteor Storm | Whetstone | Twice the rocks fall faster, and every crater burns the ground. | x1.3 |
| Mine Layer | Volcanic Field | Iron Heart | Blasts reach 1.5x as far, and each detonation sets off its neighbours in a rolling chain. | x1.7 |
| Beam | Godlance | Sharpened Tips | The beam splits into three lanes, each 30% wider. | x1.6, +25% crit |

The four new forms (Solar Lance, Inferno, Prism Shot, Meteor Storm) paint their own bodies and rings
(`render.js paintProjectileBody`, the `evo` tag on bodies and ring effects, the `firepatch` body for
burning ground).

Crowd bench (30 standing enemies within 140 px, units of base damage per second, `weapons.js` driven
directly): L8 is 6–24x L1 across the weapons; an evolved L8 is 2.3–5x its L8 (Meteor Storm reads
higher on a standing crowd because its craters keep burning).

### Enemy ladder retune (`config.js`)

Base enemy HP 80 → 100; HP ladder `QUAD` 0.03 → 0.05 (x1.2 at 2:00, x1.4 at 5:00, x2.4 at 10:00 over the
old curve); contact damage unchanged.

## Fusions (`fusions.js FUSION_DEFS`) — they replace the 11 synergy pairs

Two EVOLVED weapons that form a listed pair fuse into ONE weapon. The offer opens in the evolve overlay
(`FUSION`, same cards, NOT NOW, AUTO takes the first offer after the draft timeout). The host (the first
weapon of the pair; the Volley when it is in the pair, since it holds no slot) keeps its place and
carries the other half: both halves keep attacking, each at x1.5 damage (`FUSION_MULT`), plus a link
behaviour that makes them act as one weapon. The whole kit gains 30% of the run's starting damage
(`DRAFT_PLAN.FUSION_KIT_DMG`) and the hero is restored as for an evolution. The other weapon's slot is
free: the next drafts offer `NEW: <weapon>` cards (a weapon the profile owns and the kit lacks, any weapon
when it owns no spare), which join at Lv 4 (`FUSION_REFILL_LEVEL`, or the mastery start level if higher).

Weapon cards and the STATS screen show the road (`fuses with Chain Zap once both are evolved`; STATS also
lists partners the kit lacks). Every fused body wears its fusion's corona (two tints, `render.js
paintFusionCorona`, cached through the sprite cache), its rings, bolts, sweeps and beams take the
fusion's colours, and the HUD slot shows the fusion's 5x5 emblem. A fusion taken for the first time gets
the cinematic banner and is recorded in the profile (banner ledger key `fusion:<ID>`); PROGRESS → FUSIONS
is the shelf, undiscovered entries as dark silhouettes. The synergy module, its toasts, draft hints, the
SYNERGIES panel and their tests are gone.

| Pair | Fusion | What it does (on top of both halves at x1.5) |
|---|---|---|
| Volley + Orbit Blade | Orbital Volley | Every round loops once around you with the blades, then flies at the nearest enemy and pierces one more body. |
| Volley + Sun Javelin | Sun Lane | Every Volley salvo throws a half-strength spear down its lane, and every spear throw is flanked by two extra rounds. |
| Chain Zap + Beam | Superconductor | Every beam throws a free lightning chain from the beam's target through four more enemies. |
| Boomerang + Seeker | Bloodhound Rang | The return leg steers at the nearest enemy, and each catch launches a missile. |
| Nova Pulse + Mine Layer | Chain Reaction | Every pulse sets off all mines inside its ring. |
| Scythe + Ember Shot | Harvest Fire | Every enemy the sweep kills bursts like an ember kill and leaves burning ground. |
| Ricochet + Chain Zap | Storm Bounce | Every ricochet impact throws a spark at the nearest enemy the shot has not touched. |
| Meteor + Mine Layer | Crater Field | A landing meteor sets off every mine in its crater and seeds a fresh mine. |
| Nova Pulse + Orbit Blade | Gravity Well | Every pulse drags the enemies in its ring a quarter of the way onto the blades. |
| Scythe + Chain Zap | Threshing Storm | Every sweep throws lightning from the arc's edge that chains through three enemies. |
| Mine Layer + Beam | Fire Focus | The beam sets off every mine it sweeps and leaves a mine where it strikes. |

Every weapon is in at least one pair; a weapon fuses once, so Chain Zap, Mine Layer, Nova Pulse, Orbit
Blade, Scythe, Beam and the Volley each choose between two partners.

## Measured: fusions and the plan rules

Fixed builds, `--fixed-build 5000,20000 --k 12 --shop cheapest --draft <policy> --speed 8`, seeds
1001–1012, n = 12 per cell, median [min–max]. Three trees: **evolution route** = the figures of the
previous section (tree `8587a26`); **fusion only** = synergies replaced by fusions, no plan rules (tree
`1f90038`); **after** = fusions plus the plan rules (this tree). The sim's `evolution-first` policy now
works first on a weapon whose fusion partner in the kit is already evolved, then on one with a partner in
the kit, then on the highest-level one, and takes a `NEW:` card that fuses with the kit ahead of other
weapon cards.

| budget | policy | evolution route: survival s | fusion only: survival s | after: survival s | after: level | after: first evolution | after: first fusion |
|---|---|---|---|---|---|---|---|
| 5,000 | random | 248 [110–315] | 176 [95–278] | 277 [129–549] | 13 | 195 s, 50% | 259 s, 25% |
| 5,000 | weapons-first | 207 [125–251] | 132 [68–382] | 158 [110–390] | 10 | 131 s, 17% | 265 s, 8% |
| 5,000 | evolution-first | 231 [128–333] | 197 [129–552] | **325 [208–651]** | 17 | 96 s, 92% | 172 s, 92% |
| 5,000 | stats-first | 251 [133–409] | 151 [126–333] | 202 [129–542] | 11 | 308 s, 25% | 325 s, 17% |
| 20,000 | random | 513 [223–736] | 615 [247–758] | 706 [255–960] | 32 | 217 s, 83% | 269 s, 58% |
| 20,000 | weapons-first | 455 [228–547] | 485 [260–645] | 579 [269–823] | 29 | 218 s, 92% | 421 s, 50% |
| 20,000 | evolution-first | 412 [240–535] | 496 [245–762] | **837 [428–1,025]** | 33 | 114 s, 100% | 212 s, 100% |
| 20,000 | stats-first | 533 [259–782] | 781 [242–1,066] | 840 [270–936] | 33 | 301 s, 92% | 344 s, 92% |

Against the targets:

- evolution-first ≥ stats-first at 5,000: met (325 vs 202, +61%); and above random at both budgets (+17%
  at 5,000, +19% at 20,000).
- evolution-first within ~10% of stats-first at 20,000: met (837 vs 840).
- stats-first > random at 5,000: **not met** (202 vs 277; the bands overlap widely). Random drafting
  picks the lead card and partner cards often enough to collect much of the plan bonus; stats-first
  never takes a weapon card, so it only gets the partner levels. Open item.
- Removing the synergies alone cost the small kits a lot (fusion only, 5,000: every policy 15–40% down):
  Orbital Volley was live from the first second for every Volley + Orbit kit. The plan rules more than
  give it back to the plans that commit.

### Career check (40 runs, 3 seeds, stats-first shop, default loadout, random drafts, speed 8)

`node tools/progression_sim.mjs --runs 40 --seeds 3 --shop stats-first --speed 8`; median [min–max].

| | before (tree `8587a26`) | after |
|---|---|---|
| run 1 survival / gold | 11 s [10–20] / 323 [323–335] | 11 s [10–20] / 323 [323–335] |
| first 60 s run | run 2 [2–4] | run 2 [2–4] |
| first 120 s run | run 5 [4–6] | run 5 [3–5] |
| wave 2 | run 9 [7–9] | run 9 [8–12] |
| wave 5 | run 16 [14–17] | run 15 [13–17] |
| survival, runs 11–15 | 438 s [271–638] | 249 s [126–891] |
| survival, runs 21–30 | 1,091 s [833–1,331] | 1,291 s [1,010–1,800] |
| survival, runs 31–40 | 1,173 s [847–1,642] | 1,638 s [1,277–1,800] |
| gold banked, runs 31–40 | 7,907 | 11.0k [7,775–22.7k] |
| longest flat stretch | 7 runs | 5 runs |

Run 1 on a fresh profile is unchanged (no draft, no evolution in reach). The early career is the same
shape and a little slower through runs 11–15 (the small kits lost their always-on synergy). From run 16
the career is **faster** than before (+18% survival in runs 21–30, +40% in runs 31–40, some runs reach
the 1,800 s cap) because the random auto-draft collects lead-weapon levels, evolutions and fusions. Wave 5
comes at run 15, not the run 18–25 aimed for. The enemy ladder and income were not retuned in this pass
(open item).

## Pacing trim, hands and jokers (2026-10-02)

Three changes on top of the fusion pass, each measured with `tools/progression_sim.mjs`. The AUTO pilot
plays worse than a person, so every figure is a floor; the game's own AUTO draft still picks at random.

### The rules in plain words

- **Late ladder (`config.js LADDER.HP`).** Past 3:00 enemy HP is also multiplied by
  `1 + 0.12 x (ticks past 3:00)` (`LATE_FROM: 6`, `LATE_LIN: 0.12`; a tick is 30 s): x1.5 at 5:00, x2.7
  at 10:00, x5.1 at 20:00 over the old curve. The first three minutes and contact damage are unchanged.
- **Stat cards stack (`DRAFT_PLAN.STACK_FROM: 2`, `STACK_MULT: 2`).** A repeat copy of a common stat
  card counts double, and the card says `STACKED: counts double`. A scatter of single copies gets nothing.
- **Hands (`src/hands.js`).** The different cards a run drafts form a hand. The best poker combination
  among them pays a run-long bonus; a better hand replaces the bonus, it does not stack. Rank and suit
  are the ones painted on the card (rank = rarity, suit = family). A second copy of a card adds
  nothing to the hand, and a weapon's level-up cards are one card. The HUD always shows the hand and
  its bonus and counts the damage share up when a new hand is made (a feed line, a sound, a gold
  plate); a draft card that would make a new or better hand says `makes: SPADE FLUSH`.
- **Jokers (`src/jokers.js`).** One row of rule cards: 2 slots, 5 with the Joker Slot shop row
  (1,500 / 4,500 / 13,500 gold). A joker rides the level-up pool at weight 0.02 (a weapon card is 1) and
  every wave boss offers three. With a full row the player chooses which joker the new one replaces,
  or keeps the row (a level-up then goes back to its other cards). The row is on the HUD, on the pause
  screen and, for jokers ever held, under PROGRESS -> JOKERS; the rest are silhouettes.

### The hand table (`hands.js HANDS`, `FLUSH_BOONS`)

Shares are of the run's starting damage and max HP. Straights and flushes need four cards.

| Hand | Needs | Pays |
|---|---|---|
| Pair | two cards of one rank | +10% damage |
| Two Pair | two pairs | +20% damage |
| Three of a Kind | three cards of one rank | +30% damage |
| Straight | 4 ranks in a row (1-9, J, Q, K) | +30% damage, weapons fire 10% faster |
| Flush | 4 cards of one suit | +25% damage, and the suit's boon: spades +25% more damage; hearts +40% max HP; diamonds +50% gold from kills and +25% XP; clubs weapons fire 20% faster |
| Full House | three of a kind and a pair | +50% damage, +25% max HP |
| Four of a Kind | four cards of one rank | +60% damage, +30% max HP |

Card data: every stat card, rare card and weapon card has a rank and a suit, and no two share both.
Three cards moved so every suit can flush and four queens exist: Scholar's Stone J of diamonds,
Crimson Edge Q of hearts, Thornmail Q of clubs (three retired combo faces took their old pips).
Hearts need Nova Pulse or Ember Shot in the kit, diamonds need Meteor.

### The joker list (`jokers.js`)

| Joker | Rule | Came from |
|---|---|---|
| Pierce All | every shot pierces: nothing stops at the first body | rewrite |
| Chain Reaction | every kill blows up and hurts enemies nearby (costs mana) | rewrite |
| Blood Harvest | a health potion you pick up also blasts enemies nearby | rewrite |
| Rime | your weapon hits chill: enemies crawl for a moment | rewrite |
| Ignite | your weapon hits set enemies burning for 3s | rewrite |
| Live Wire | every 5th weapon hit zaps a nearby enemy | rewrite |
| Aftershock | every blast echoes once, half size and half damage (offered only with a blast source) | rewrite |
| Overload | every 20th weapon hit bursts into three zaps | rewrite |
| Second Wind | revive once at half health | mythic chase card |
| Storm Shards | gems you pick up also chip nearby enemies | mythic chase card |
| Full Hand | +1 card in every draft | mythic chase card |
| Magnet Collector | skill [X]: every gem, potion and item flies to you, 30s cooldown | mythic chase card |
| Horde Bait | every chest is a horde, and every chest rolls one rarity higher | run rule |
| One of Each | no stat card twice; weapon cards give +1 level; maxed weapon cards give +10% damage (unchanged) | run rule |
| Regrowth | you heal 0.7 HP every second | skill perk |
| Frost Nova | a frost nova bursts from you whenever it is ready | skill perk card |
| Shortcut | straights and flushes need one card fewer | new |
| Wild Card | your hand counts one extra card of any rank and suit | new |
| Double Down | your hand pays half again as much | new |
| Encore | every 5th card you draft counts twice | new |
| Travel Light | each empty weapon slot cools your skills 10% faster | new (was the hidden empty-rewrite-slot rule) |

Cut: Tempest, Killshot, Focus, Thick Skin, Glacier, Wide Orbit (flat stats); Wildfire and the five
cross-tag combos (they needed two or three slots of a two-slot row); the mythic chase gate; the four
rewrite slots and their always-on cooldown payment; the card parallels (Shiny / Pulse / Chroma /
Cursed / Blessed) with their module, test and capture tool.

### Measured

Career: `--runs 40 --seeds 3 --shop stats-first --speed 8` (random drafts), median [min-max].

| | before (tree `8e49570`) | ladder + stacking, no hands or jokers | this tree |
|---|---|---|---|
| run 1 survival / gold (3 seeds) | 11 s [10-20] / 323 [323-335] | 11 s [10-20] / 323 [323-335] | 24 s [21-29] / 345 [336-350] |
| run 1 survival / gold (24 seeds) | 23 s [10-82] / 340 [323-539] | | 24 s [8-44] / 339 [321-400] |
| run 2 survival (24 seeds) | 42 s [30-121] | | 49 s [22-114] |
| survival, runs 4-5 / 6-10 | not recorded | 115 s [53-133] / 125 s [45-386] | 92 s [75-128] / 129 s [60-380] |
| first 120 s run | run 5 [3-5] | run 5 [3-5] | run 3 [3-5] |
| wave 2 | run 9 [8-12] | run 11 [8-12] | run 10 [7-11] |
| wave 5 | run 15 [13-17] | run 18 [15-19] | run 15 [13-18] |
| survival, runs 11-15 | 249 s [126-891] | 216 s [122-649] | 381 s [198-760] |
| survival, runs 21-30 | 1,291 s [1,010-1,800] | 852 s [512-1,053] | 983 s [738-1,225] |
| survival, runs 31-40 | 1,638 s [1,277-1,800] | 931 s [651-1,506] | 1,136 s [890-1,348] |
| gold banked, runs 31-40 | 11.0k | 7,203 [3,096-9,158] | 7,906 [5,523-10.9k] |
| longest flat stretch | 5 runs | | 7 runs |

Run 1 moved between the 3-seed columns only because removing the chase gate's roll at run start
shifted the random stream; over 24 seeds it is the same run (23 s / 340 gold before, 24 s / 339 gold now).
Runs 31-40 are inside the 1,000-1,300 s aim and no run reaches the 1,800 s cap. Wave 5 is at run
15 [13-18] against an aim of run 18-25: the ladder alone put it at run 18, and hands and jokers took
that back (open item).

Fixed builds: `--fixed-build 5000,20000 --k N --shop cheapest --draft <policy> --speed 8`, median
[min-max]. Two seed sets are shown because the 12-seed set alone ranked the policies differently at
20,000; "end hand" is the most common hand a run ended with. `hand-first` takes the card that makes the
best new hand when one is offered and plays evolution-first otherwise; the three deliberate policies take
a joker while the row has room and keep a full row.

| budget | policy | seeds 1001-1012 (n = 12) | seeds 2001-2024 (n = 24) | level (n = 24) | first evolution (n = 24) | end hand (n = 24) |
|---|---|---|---|---|---|---|
| 5,000 | random | 239 [132-422] | 168 [109-519] | 11 | 195 s, 25% | flush 54% |
| 5,000 | evolution-first | 277 [127-431] | 254 [121-514] | 13 | 130 s, 71% | flush 67% |
| 5,000 | stats-first | 339 [130-468] | 195 [128-529] | 11 | 297 s, 29% | none 38% |
| 5,000 | hand-first | 265 [133-497] | **347 [116-502]** | 17 | 145 s, 67% | flush 42% |
| 20,000 | random | 615 [363-702] | 531 [308-841] | 25 | 224 s, 100% | flush 54% |
| 20,000 | evolution-first | 484 [306-659] | 636 [365-775] | 28 | 95 s, 100% | flush 67% |
| 20,000 | stats-first | 525 [240-674] | 597 [256-842] | 27 | 281 s, 83% | flush 58% |
| 20,000 | hand-first | 487 [306-825] | **641 [370-775]** | 28 | 127 s, 100% | full house 63% |

Before this pass (tree `8e49570`, seeds 1001-1012): 5,000 random 277, evolution-first 325, stats-first
202; 20,000 random 706, evolution-first 837, stats-first 840.

Reading it:

- At 5,000 every deliberate plan is above random in both seed sets (+11% to +42% on the 12 seeds, +16%
  to +107% on the 24). `stats-first > random` now holds (339 vs 239, 195 vs 168); the bands overlap.
- At 20,000 the 24-seed set has every deliberate plan above random (+12% to +21%); the 12-seed set has
  random on top (615 vs 484-525). The bands overlap in both, so the ranking at 20,000 is not settled.
- Stacking alone did not lift stats-first at 5,000 (202 -> 205 with the third copy doubling, 229 with
  the second: two rounds, then stopped); the lift in the table arrived with the hands and jokers.
- Every policy ends most runs holding a flush or better. A spade flush is the common one: the Volley,
  the Boomerang, Whetstone, Sharpened Tips and Split Shot are all spades.

## Measured (evolution route, tree `8587a26`)

Fixed builds: `--fixed-build 1000,5000,20000 --k 12 --shop cheapest --draft <policy> --speed 8`,
seeds 1001–1012, median [min–max]. "first evolution" is the sim time of the run's first evolution and
the share of runs that evolved at all. Before = the tree at `640de81` (which had no `evolution-first`
policy and no evolutions within reach).

| budget | policy | before: survival s | before: level | after: survival s | after: level | after: first evolution |
|---|---|---|---|---|---|---|
| 1,000 | random | 95 [69–251] (n=6) | 5 | 71 [48–103] | 5 | – |
| 1,000 | weapons-first | 99 [64–130] (n=6) | 5 | 73 [54–109] | 4 | – |
| 1,000 | evolution-first | – | – | 92 [54–128] | 4 | – |
| 1,000 | stats-first | 112 [67–189] (n=6) | 6 | 76 [51–136] | 4 | – |
| 5,000 | random | 241 [130–308] | 13 | 248 [110–315] | 13 | – |
| 5,000 | weapons-first | 173 [123–246] | 11 | 207 [125–251] | 12 | – |
| 5,000 | evolution-first | – | – | 231 [128–333] | 12 | 183 s [142–255], 58% |
| 5,000 | stats-first | 313 [234–441] | 16 | 251 [133–409] | 12 | 338 s, 8% |
| 20,000 | random | 536 [286–692] (n=6) | 23 | 513 [223–736] | 25 | 295 s [122–310], 67% |
| 20,000 | weapons-first | 330 [259–394] (n=6) | 17 | 455 [228–547] | 21 | 274 s [252–338], 67% |
| 20,000 | evolution-first | – | – | 412 [240–535] | 22 | 123 s [77–201], 100% |
| 20,000 | stats-first | 420 [293–762] (n=6) | 20 | 533 [259–782] | 24 | 340 s [299–393], 58% |

Against the targets: at 1,000 and 5,000 the two weapon routes are on par with stats-first (evolution-first
above it at 1,000, within the bands at 5,000; weapons-first, which spreads its picks over every weapon,
sits below at 5,000). Late (20,000) stats-first and random win, as intended for stats. The first
evolution of a run that drafts toward it lands at 2–3 minutes with the mid-career kit (the kit starts
weapons at Lv 2–3 through mastery) and at ~3 minutes with the 5,000 kit; the weapon XP trickle gets a
run that never drafts a weapon there at 5–6 minutes. Random is not consistently below the deliberate
plans (open item below).

### Career check (15 runs, 3 seeds, default loadout, random drafts)

| policy | before: runs 11–15 survival | after: runs 11–15 survival | before: gold 11–15 | after: gold 11–15 | before: wave 2 / wave 5 | after: wave 2 / wave 5 |
|---|---|---|---|---|---|---|
| cheapest | 313 [198–517] | 387 [182–599] | 1,576 | 2,125 | 6 / >15 | 7 / >15 |
| stats-first | 293 [218–494] | 438 [271–638] | 1,498 | 2,558 | 8 / >15 | 9 / >15 (1 of 3 at 14) |
| weapons-first | 112 [73–143] | 132 [73–210] | 439 | 554 | >15 / >15 | 13 / >15 |
| balanced | 356 [129–505] | 256 [142–514] | 1,994 | 1,516 | 6 / >15 | 7 / >15 |

Run 1 on a fresh profile: 11 s [10–20], 323 gold [323–335] (before 20 s [18–40], 338 gold). The
first 60 s run comes at run 2–4, the first 120 s run at run 5–6, wave 2 at run 7–9: the same shape as
before, a little later.

40-run stats-first career (3 seeds): first 60 s run 2 [2–4] (before 4), first 120 s run 5 [4–6] (5),
wave 2 run 9 [7–9] (8), wave 5 run 16 [14–17] (17 [16–17]); survival runs 11–15 438 [271–638] (293),
runs 21–30 1,091 [833–1,331] (1,018), runs 31–40 1,173 [847–1,642] (1,281); gold runs 31–40 7,907
(8,699); longest flat stretch 7 runs (4). The career is not materially faster; the wave-5 target of
run 20–30 is still missed by about four runs (open item).

## Tests

- `test/test_evolution.mjs`: every weapon has an evolution, partners are common stat cards, each
  requirement fails with its own reason, idempotence, `evolutionProgress`, `describeEvolution`.
- `test/test_evolution_kinds.mjs`: the real loop opens the evolve overlay for a maxed weapon plus its
  partner and not without it; the draft cards carry the road text and the `EVOLUTION READY` badge; the
  four new evolutions change behaviour (`weapons.js` driven directly).
- Ladder pins in `test_weapons`, `test_tier2_weapons`, `test_weapon_overrides`, `test_boomerang_pierce`,
  `test_chain_zap` updated to the new ladders; token tests removed (`test_chests`, `test_e2_horde`,
  `test_shockwave_credit`, `test_trophy_hooks`, `smoke`, `test_desktop_ui`, `test_night_mode`,
  `test_draft_ceremony`, `test_heal_budget`); stat-card pins in `test_tier2_parallels`.
- `test/test_escape_duration.mjs` (M3 check): AUTO finishes the escape corridor in 26–29 s and the HUD
  states the payout and what a skip passes up.
- `test/test_fusions.mjs` (new): the fusion table (8-12 entries, every weapon covered, own colours and
  emblem), every flag read by the game, the synergy module gone; per fusion: both halves needed, both
  evolved, one place freed, both halves kept, fused once; road and card text; and in the real loop per
  fusion: the offer card, the freed slot, the announce, and the behaviour that marks it (halves parked
  so only the link can produce it); x1.5 on a fused half; NOT NOW; the `NEW:` refill card; the shelf.
- `test/test_draft_plan.mjs` (new): the lead weapon card (+2 levels, ties, cap, hand-over, ONE OF EACH),
  the partner card's level, the kit-wide damage of an evolution and a fusion, and the card text for each.
- `test/test_draft_card_art.mjs`: the compact draft layout rule (844x390, 667x375, 932x430, the 500 px
  boundary, 390x844 one row, desktop unchanged), the stylesheet's compact rules and scrim, and that
  `openDraft` flags the overlay and sizes the cards by the rule.
- Converted from the synergy rules: `smoke` (Orbital Volley is offered, fused, announced, shots orbit),
  `test_desktop_ui` (no fusion state at run start), `test_feedback_098` (fusion announces wrap in the
  feed), `test_wave26_crossfile` (`fusWeaponDmg`). Removed: `test_synergies`, `test_synergy_hint`,
  `test_synergy_wiring`. Pins moved: `test_tier2_parallels` (weapon offer keys gain `fuseText`,
  `leadText`), `test_title_screen` (PROGRESS has FUSIONS).
- `tools/run_suite.mjs` KNOWN_RED is empty: 206 files green.
- `test/test_hands.mjs` (new): every draftable hand card has a rank and a suit and no two share both;
  every hand type; duplicates, near misses, the order of the best hand, Shortcut and Wild Card; the bonus
  table; the bonus applied once, replaced and removed exactly; hints; and through the real `pick()`: the
  hand, its payment, the count-up, the HUD plate and the pause screen.
- `test/test_jokers.mjs` (new): the registry (21 jokers, one sentence each, a face each, what was cut);
  the pip-less joker face; slots 2 to 5 through the shop row; take / drop / replace; a marker for every
  joker's effect, on and off; offers and dead cards; the level-up joker, the replace choice (REPLACE and
  KEEP), the boss offer; Shortcut, Double Down, Encore and Full Hand in the live game; the HUD row, the
  pause screen and the shelf; a version-10 profile and a current profile loading.
- Pins moved to the new values: `test_run_structure` (the late HP term), `test_draft_plan` (stacking),
  `smoke` (Split Shot premise: a first copy), `test_meta` (46 rows), `test_art_lint` (Joker Slot icon),
  `test_card_art` and `test_card_art_expansion` (the three re-suited cards; the parallel section went
  with the module), `test_title_screen` (PROGRESS has JOKERS), `test_night_mode` (JOKER is the top night
  pick, last with a full row), `test_dev_draft_ban` (`joker_once`), `test_draft_card_art`,
  `test_draft_ceremony`. `test_perks`, `test_run_rules`, `test_rewrites`, `test_rss8_magnet`,
  `test_w7b_draft_ladder` and `test_tier2_draftcards` now reach their effects through the joker row and
  pin that the cut cards are never offered. Removed: `test_tier2_parallels`.

## Open items

- Wave 5 in the 40-run stats-first career is at run 15 [13-18] (aim: run 18-25). The late HP term alone
  measured run 18 [15-19]; hands and jokers brought it back. Runs 31-40 are on target (1,136 s), so the
  next trim belongs between 5:00 and 10:00, or in the hand bonuses, not in the late ladder.
- The policy ranking at 20,000 differs between the two seed sets (random first on 12 seeds, last on 24).
  It needs one run at n >= 36 on one seed set before any tuning is read off it.
- Hands favour breadth: a random drafter holds a flush in about half its runs by the end. The spread
  between careful and careless drafting comes from reaching the hand sooner, not from the end hand. A
  five-card flush would sharpen it, but diamonds have four cards and hearts five, so it needs more cards
  in those suits first.
- The old card builders (`rules.js ruleCards`, `perks.js skillCards`, `rewrites.js rewriteCards`,
  `frostcard.js frostCard`, `config.js DRAFT_MYTHIC_UPGRADES` and the chase numbers, `REWRITE_SLOTS`) are
  no longer called by the game. They stay because `tools/draft_sim.mjs` (the coarse model behind
  `test_draft_luck`) and those modules' own tests still build cards with them. The effect code of the
  cut rewrites (Glacier, Wildfire, Wide Orbit, the five combos) is likewise unreachable. Both want a
  cleanup pass together with a refit of `draft_sim.mjs`, which models neither hands, jokers, the lead
  rule nor fusions.
- The five new jokers borrow the card faces of cut cards (Shortcut: Wide Orbit, Wild Card: Glacier,
  Double Down: Killshot, Encore: Tempest, Travel Light: Focus). They need faces of their own.
- The HUD's joker cell shows the middle of the card face at 16 px; there is no tooltip. The pause screen
  and the shelf carry the names and rules.
- The Joker Slot row is classed as a combat row by the simulator (it changes a run stat), so the
  stats-first shop buys it in turn; its price (1,500 / 4,500 / 13,500) was set once and not tuned.
- `weapons-first` (a weapon card whenever offered, spread over the kit) was not re-measured in this pass.
- Fusion link behaviours run in the main loop only; the maw fight (`updateFinale`) ticks both halves of
  a fused weapon but not the links.
- The fusion numbers (x1.5, +30% kit damage, Lv 4 refill) were set once and not tuned per fusion.
