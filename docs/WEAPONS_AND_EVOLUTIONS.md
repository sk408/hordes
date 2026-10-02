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
  two behaviour changes), the hero is restored to full health and gains 15% of the run's starting max HP
  (`EVOLUTION_HP_FRAC`), and the first evolution ever gets the cinematic banner.
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

## Measured

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
before, a little later. The 40-run stats-first career is in the report that accompanies this change
(`career40` in the final report); before, it reached wave 5 at run 17 [16–17].

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
- `tools/run_suite.mjs` KNOWN_RED: `test_draft_luck.mjs` only (its run-level cohorts come from the
  coarse `tools/draft_sim.mjs` model, whose weapon formulas predate these ladders).

## Open items

- `weapons-first` (a weapon card whenever offered, spread over the kit) is below `stats-first` at 5,000
  (207 vs 251, n = 12, bands overlap); `evolution-first` (one weapon at a time) is on par. Focusing is
  the plan the draft text steers toward.
- `random` is on par with the deliberate plans at 5,000 and 20,000 rather than below them: the uniform
  pick mixes rares, skills and rewrites that the deliberate policies refuse.
- `tools/draft_sim.mjs` (the coarse model behind `test_draft_luck`) needs refitting to the new ladders.
- The 40-run career and the phone-landscape draft layout (cards sit low on an 844x390 viewport, a
  pre-existing M3 layout) are reported, not fixed.
