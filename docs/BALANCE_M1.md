# Balance model — Milestone 1 (the progression curve)

Everything here is on branch `claude/overhaul`. Numbers in the sim tables are from
`tools/progression_sim.mjs`, whose AUTO pilot plays worse than a person: read them as a floor.

## The model in one page

### Player and contact damage (`config.js` PLAYER, SURVIVAL)
- Base max HP 60; the Knight adds 30. Vitality is +25 a level, 10 levels.
- A touch costs `min(BASE_CONTACT × ladderDmg(tick) × typeMult × chargeMult, 0.6 × maxHp)`.
  `BASE_CONTACT` is 32, so a fresh Knight dies to the third chaser hit and every Vitality level is about
  three quarters of a hit. The 60% cap only binds for heavy bodies against small pools and late in the run.
- Type multipliers: swarmer 0.7, chaser 1, dasher 1.5, colossus 1.6, brute 1.8; wave bosses use their own
  cast multiplier × `BOSS.CONTACT_MULT` (0.8), no longer stacked on the brute body.
- Level-up adds 1% of the run's starting max HP.
- Health potions heal 30% of max HP; AUTO drinks at 50% HP or less.

### The ladder (`config.js` LADDER, `ladderHp/ladderDmg/ladderXp/ladderGroups/spawnInterval`)
`w = floor(t / 30)`. Every curve is `(1 + LINEAR·w + QUAD·w²) × COMPOUND^w`, smooth from tick 0 (no knee).

| | LINEAR | QUAD | COMPOUND | 2:00 | 5:00 | 10:00 | 20:00 | 30:00 |
|---|---|---|---|---|---|---|---|---|
| enemy HP | 0.1 | 0.03 | 1 | ×1.9 | ×5 | ×15 | ×53 | ×115 |
| contact / shot damage | 0.15 | 0 | 1.004 | ×1.6 | ×2.6 | ×4.3 | ×8.2 | ×12.7 |
| enemy XP | 0 | 0 | 1 | ×1 | ×1 | ×1 | ×1 | ×1 |

- Base enemy HP 80 (a chaser is four fresh volley hits, a swarmer two).
- Spawn interval `max(0.5, 1.1 − 0.002·t)`; groups per spawn tick `1 + max(0, t − 150) / 150`, capped at 8,
  with the fractional part rolled, so density rises without steps.
- Roster gates (30 s ticks): swarmer 1, brute and dasher 3, tick 4, spitter 5, warlock 6, colossus 10.
- From wave 2: chaff packs ×1.25, heavies have 2× a chaser's HP (no longer tied to the herald's pool).
- Herald HP = base × ladderHp × (8 + 3·wave). Wave boss HP = base × ladderHp × 12·wave × cast multiplier.
  The maw has 250,000 HP.
- Prestige: enemies ×1.25 per tier, gold ×1.5 per tier (was ×1.5 / ×2).

### Levels and drafts (`config.js` XP_*, `xpForLevel`, `xpGainMult`)
- XP to the next level: `min(2200, 20 + 25·(L−1) + 2·(L−1)²)`.
- Every gem is worth `xp / sqrt(1 + kills / 300)`, so a run that is mowing down thousands still levels at a
  steady rate. Measured: about 5 levels in the first minute, 20–30 by 5:00, 70–90 by 30:00.
- Percent draft cards add a share of the run's starting value instead of compounding: Whetstone +25% of
  starting damage, rare Iron Heart +25% of starting max HP, Scholar's Stone +0.2 XP multiplier, Gilded Palm
  +0.3 gold multiplier, the Split Shot overflow +20%, the ONE OF EACH at-cap conversion +10%.
- Reroll / Skip / Banish: per-run charges from three shop rows. Reroll redraws the offer, Skip heals 25% of
  max HP instead of taking a card, Banish removes a card (a weapon's whole level-up line) from the run's
  drafts. Keys R / S / B, or the buttons under the cards. AUTO never spends a charge.

### Income (`meta.js` RUN_GOLD, GOLD_TIER; `main.js` purseCredit, purseSurvivalTicks, settleRunGold)
Everything a run earns is banked once, when the run ends.
- Award 70 (× Greed × rampage × the challenge/heat/night pool).
- First run ever +250; any later run that sets a new best time +100.
- Survival bonus: the n-th 30 seconds survived pays `20 + 4·n`.
- Kills: chaff 0.5, grunt 1, mid 2, heavy 4, elite 8, herald 40, boss 120. Ordinary kills are divided by
  `1 + kills / 300`; bosses and heralds are not. Fractions carry over.
- Greed now multiplies all run income (award and purse), +8% a level.
- The maw bonus (1200) is added to the run's account and banked at run end with the purse.

### Shop (`meta.js` SHOP_UPGRADES, WEAPON_PRICES, `applyMetaBonuses`)
45 rows, one per stat: 31 stat rows, 11 weapon unlocks, 3 elite unlocks. Only Forged Edge compounds
(×1.25 a level, 8 levels = ×5.96); every other percent row is additive. A full shop is about ×14 per-hit
damage rate on the volley (damage × attack rate × crit), before projectiles, pierce and the extra weapons.
Weapon prices follow measured strength beside the volley, so a pricier unlock is a step up; the default
loadout brings the character's starting weapon, then the strongest owned weapons that fit.

## What remains uncertain
See the end of this file.
