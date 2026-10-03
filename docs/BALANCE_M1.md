# Balance model — Milestone 1 (the progression curve)

> Superseded in part by `docs/WEAPONS_AND_EVOLUTIONS.md` (the in-run draft: weapon ladders, partner-card
> evolutions, the smaller stat cards, base enemy HP 100 and the HP ladder QUAD 0.05). The career tables
> below are the M1 measurement; the re-measured careers are in that document.

Everything here is on branch `claude/overhaul`. The measured tables come from `tools/progression_sim.mjs`
(see `docs/PROGRESSION_SIM.md`). Its AUTO pilot plays worse than a person, so survival, income and pace
figures are a floor, and play-hours figures are a ceiling.

## The model

### Player and contact damage (`config.js` PLAYER, SURVIVAL)
- Base max HP 60; the Knight adds 30 (Witch −15, Paladin +15). Vitality is +25 a level, 10 levels.
- A touch costs `min(BASE_CONTACT × ladderDmg(tick) × typeMult × chargeMult, 0.6 × maxHp)`.
  `BASE_CONTACT` is 32, so a fresh Knight (90 HP) dies to the third chaser touch and each Vitality level is
  about three quarters of a touch at the start of a run. The 60% cap binds only for heavy bodies against
  small pools, and late in the run.
- Type multipliers: swarmer 0.7, chaser 1, dasher 1.5, colossus 1.6, brute 1.8. A wave boss uses its own
  cast multiplier × `BOSS.CONTACT_MULT` (0.8).
- Each level-up adds 1% of the run's starting max HP.
- A health potion heals 30% of max HP; AUTO drinks at 50% HP or less.
- Mana Spring is +0.5 mana/s a level on a base of 0.5.

### The ladder (`config.js` LADDER, `ladderHp/ladderDmg/ladderXp/ladderGroups/spawnInterval`)
`w = floor(t / 30)`. Every curve is `(1 + LINEAR·w + QUAD·w²) × COMPOUND^w`, smooth from tick 0.

| | LINEAR | QUAD | COMPOUND | 2:00 | 5:00 | 10:00 | 20:00 | 30:00 |
|---|---|---|---|---|---|---|---|---|
| enemy HP | 0.1 | 0.03 | 1 | ×1.9 | ×5 | ×15 | ×53 | ×115 |
| contact / shot damage | 0.15 | 0 | 1.004 | ×1.6 | ×2.6 | ×4.3 | ×8.2 | ×12.7 |
| enemy XP | 0 | 0 | 1 | ×1 | ×1 | ×1 | ×1 | ×1 |

- Base enemy HP 80 (a chaser is four fresh volley hits, a swarmer two).
- Spawn interval `max(0.5, 1.1 − 0.002·t)`; groups per spawn tick `1 + max(0, t − 150) / 150`, capped at 8,
  with the fractional part rolled.
- Roster gates (30 s ticks): swarmer 1, brute and dasher 3, tick 4, spitter 5, warlock 6, colossus 10.
- From wave 2: chaff packs ×1.25, heavies have 2× a chaser's HP.
- Herald HP = base × ladderHp × (8 + 3·wave). Wave boss HP = base × ladderHp × 12·wave × cast multiplier.
  The maw has 250,000 HP.
- Prestige: enemies ×1.25 per tier, gold ×1.5 per tier (was ×1.5 / ×2).

### Levels and drafts (`config.js` XP_*, `xpForLevel`, `xpGainMult`)
- XP to the next level: `min(2200, 20 + 25·(L−1) + 2·(L−1)²)`.
- Every gem is worth `xp / sqrt(1 + kills / 300)`.
- Measured levels: 2 in a 30 s first run, 14–18 by 5:00, and 46–115 (median 68) at the end of a
  bought-out profile's run; that profile gains 2–3 levels a minute around minute 15.
- Percent draft cards add a share of the run's starting value instead of compounding: Whetstone +25% of
  starting damage, rare Iron Heart +25% of starting max HP, Scholar's Stone +0.2 XP multiplier, Gilded Palm
  +0.3 kill-gold multiplier, the Split Shot overflow +20%, the ONE OF EACH at-cap conversion +10%.
- Reroll / Skip / Banish: per-run charges from three shop rows. Reroll redraws the offer, Skip heals 25% of
  max HP instead of taking a card, Banish removes a card (a weapon's whole level-up line) from the run's
  drafts. Keys R / S / B, or the buttons under the cards (click or tap). AUTO never spends a charge.

### Income (`meta.js` RUN_GOLD, GOLD_TIER; `main.js` purseCredit, purseSurvivalTicks, settleRunGold)
Everything a run earns is banked once, when the run ends.
- Award 70 (× Greed × rampage × the challenge/heat/night pool).
- First run ever +250; any later run that sets a new best time +100.
- Survival bonus: the n-th 30 seconds survived pays `30 + 0.5·n`.
- Kills: chaff 0.5, grunt 1, mid 2, heavy 4, elite 8, herald 40, boss 120. An ordinary kill is divided by
  `1 + kills / 200`; bosses and heralds are not. Fractions carry over.
- Greed (+8% a level) multiplies all run income. Gilded Palm multiplies kill gold only.
- The maw bonus (1200) joins the run's account and is banked at run end with the purse; reaching 30:00
  adds the completion bonus.

Income by run length on the simulator's builds (fixed-build, cheapest policy, median of 4 runs per row):
0:24 → 94, 1:04 → 229, 1:44 → 393, 3:57 → 1,122, 5:32 → 1,836, 7:39 → 2,638, 9:28 → 4,077,
16:00 → 8,116, 26:17 → 11.7k; a bought-out profile banks 14.3k [8.3k–22.7k] (n = 16).

### Shop (`meta.js` SHOP_UPGRADES, WEAPON_PRICES, `applyMetaBonuses`)
45 rows, 142 purchase steps, 526,224 gold in all. Only Forged Edge compounds (×1.25 a level, 8 levels =
×5.96); every other percent row is additive. A full shop is about ×14 per-hit damage rate on the volley
(damage × attack rate × crit), before projectiles, pierce and the extra weapons. The old shop multiplied
damage about 47,000×.

| Tier | Rows (levels) | First step | Last step | Row totals |
|---|---|---|---|---|
| 1, the first runs | Forged Edge (8), Vitality (10), Rangefinder (5), Lodestone (5), Travel Pack (3), Fleetfoot (5), Scholar (5) | 50–200 | 840–3,016 | 1,790–7,186 |
| 2, the build takes shape | Hairtrigger (6), Deadly Aim (6), Deadeye (5), Greed (5), Alchemy (4), Mana Spring (4), Deep Well (4), Thrifty Casting (4), Briarmail (5) | 150–300 | 2,000–4,952 | 3,750–10,232 |
| draft charges | Second Look / reroll (3), Patience / skip (2), Cull the Deck / banish (3) | 400–500 | 1,200–3,125 | 1,600–4,875 |
| 3, the long game | Split Shot (4), Hollowpoint (3), Blood Pact (5), Starting Artifact (4), Fortune (5), Weapon Slot (3), Storm Conduit (5) | 400–2,000 | 8,518–24,000 | 12,400–46,500 |
| 4, capstones | Fan Fire (2), Deep Read (2), Escape Writ, Last Stand, Arcade Pass | 4,000–40,000 | 12,000–40,000 | 15,000–40,000 |
| weapon unlocks | Orbit 150, Scythe 500, Ember 800, Beam 1,500, Ricochet 2,500, Zap 4,000, Javelin 6,000, Nova Pulse 9,000, Meteor 13,000, Mine 20,000, Seeker 30,000 | | | 87,450 |
| elite unlocks | Swift 3,000, Splitting 6,000, Vampiric 10,000 | | | 19,000 |

Sorted by price, no step costs more than 1.33× the one before it. Removed or folded rows: might, headsman,
toughness, ironheart, cooldown, eagleeye, bullseye, growth, avarice, marathon, magnetism, vampire, hoarder,
scav, siphon, aethertap, grandelixir, deepfont, staticfield. The apex tier is 200,000 and 2,000,000.
Character unlocks and character upgrades are unchanged.

### Loadout (`meta.js` defaultLoadout, effectiveLoadout, equipBoughtWeapon)
- With no stored choice a run brings every owned weapon that fits its slots: the character's starting
  weapon, then the rest by rank (price order, with the free Boomerang ranked between Ember and Beam). A
  fresh Knight therefore starts with Volley + Boomerang.
- A weapon that costs mana ranks last in that default until the profile's mana regen covers half of what
  firing it on cooldown drains. Chain Zap needs 2.9 mana/s; a Knight with no Mana Spring has 0.5.
- Buying a weapon equips it. A full kit benches its weakest weapon to make room, never its strongest.
  Buying a slot fills it with the best owned weapon the kit lacks.
- A loadout the player chose is kept as chosen, including a deliberately short one.

### Save migration (`save.js` step 10 → 11, `legacy_shop_v10.js`)
Schema 11. Every level of every old stat row is refunded at the price that level cost in the v10 table (the
table is frozen in `legacy_shop_v10.js` and was checked against the pre-M1 code, 47 rows), the row resets to
level 0, and its sell-back ledger entries are dropped. Weapon, elite and character unlocks, character
upgrades and the apex tier stay owned and are not refunded; their sell-back ledger still holds what was paid.
The profile records `shopRefund = { version, gold, rows }`; the title shows the refund once, and so does an
import. A profile carrying the marker is never refunded again, even if its version field is lost.
A fully bought v10 profile gets 43,690,241 gold back against a 526,224-gold catalogue.

## Measured: before and after

Policies are `shop/loadout/draft/once/stance/character`; every row uses `…/random/asis/BALANCED/KNIGHT`,
speed 8×, run cap 1800 s. Careers and the matrix use seeds 1001–1003; fixed builds use seeds 1001–1004
(1001–1008 for the bought-out profile). Cells are median [min–max].

### Run 1, fresh profile
| | before (n = 3) | after (n = 3 career seeds; n = 4 fixed-build) |
|---|---|---|
| survival | 14 s [10–17] | 29 s [10–34]; 24 s [10–34] |
| gold banked | 320 [320–322] | 351 [324–386] |

### 15-run matrix, shop × loadout (n = 3 seeds per policy)
"Before" is the same tool and seeds on the pre-M1 tree.

| policy | before: survival runs 11–15 | after: survival runs 11–15 | after: gold runs 11–15 | first ≥ 60 s | first ≥ 120 s | wave 2 | flat | income ratio |
|---|---|---|---|---|---|---|---|---|
| cheapest / default | 36 [16–66] | 230 [129–351] | 1,259 [530–2,231] | 2 [2–2] | 5 [5–6] | 6 [6–7] | 5 | ×2.4 |
| cheapest / all-owned | — | 127 [71–400] | 495 [295–2,167] | 2 [2–2] | 6 [5–7] | 7 [6–9] | 4 | ×3.4 |
| stats-first / default | 40 [35–114] | 236 [44–484] | 1,336 [229–3,639] | 6 [2–6] | 9 [3–10] | 10 [6–15] | 2 | ×3.2 |
| stats-first / all-owned | — | 71 [52–127] | 278 [183–457] | 6 [2–6] | 9 [3–9] | >15 (1/3) | 5 | ×3.2 |
| weapons-first / default | 24 [6–43] | 53 [28–102] | 168 [100–547] | 7 [3–10] | >15 (0/3) | >15 (0/3) | 2 | ×2.6 |
| weapons-first / all-owned | — | 36 [19–80] | 140 [87–376] | 7 [3–10] | >15 (0/3) | >15 (0/3) | 7 | ×2.4 |
| balanced / default | 37 [35–68] | 122 [66–200] | 417 [229–1,155] | 2 [2–4] | 6 [2–11] | >15 (1/3) | 3 | ×1.6 |
| balanced / all-owned | — | 116 [66–133] | 404 [152–612] | 2 [2–5] | 9 [7–14] | >15 (1/3) | 5 | ×2.8 |

No policy reaches wave 5 inside 15 runs. Before, no policy reached 120 s in 20 runs and the first 60 s run
came at run 15 or later.

### 40-run careers, default loadout (n = 3 seeds each)
| | cheapest | stats-first | balanced | weapons-first | target |
|---|---|---|---|---|---|
| first run ≥ 60 s | 2 [2–2] | 6 [2–6] | 2 [2–4] | 7 [3–10] | run 3–5 |
| first run ≥ 120 s | 5 [5–6] | 9 [3–10] | 6 [2–11] | 21 [16–23] | run 6–10 |
| first wave 2 | 6 [6–7] | 10 [6–15] | 18 [14–24] | 33 [30–>40], 2/3 | |
| first wave 5 | 26 [21–27] | 22 [19–24] | >40, 1/3 (run 38) | >40, 0/3 | run 20–30 |
| longest flat stretch, median series | 11 (runs 11–21) | 6 (runs 29–34) | 6 (runs 19–24) | 8 (runs 22–29) | ≤ 4 |
| longest flat stretch, per seed | 6 [6–11] | 6 [6–8] | 7 [6–12] | 12 [9–12] | ≤ 4 |
| largest income ratio, median series | ×2.4 | ×3.2 | ×2.8 | ×2.8 | ≤ ×3 |
| largest income ratio, per seed | ×3.4 [2.6–4.4] | ×3.7 [3.4–4.1] | ×5.0 [4.5–5.2] | ×3.4 [3.4–4.5] | ≤ ×3 |
| runs per purchase, runs 1–14 | 0.33 | 0.67 | 1.27 | 2.80 | 1–3 |
| runs per purchase, runs 15–28 | 0.40 | 0.31 | 2.33 | 3.50 | 1–3 |
| runs per purchase, runs 29–40 | 0.36 | 0.75 | 1.00 | 4.00 | 1–3 |
| catalogue after 40 runs, by cost | 40.9% [40.0–45.9] | 38.0% [36.5–39.6] | 14.0% [13.9–16.1] | 8.8% [4.7–9.0] | |
| play time after 40 runs | 7.0 h [6.5–7.8] | 6.8 h [6.8–7.4] | 2.5 h [2.4–2.8] | 1.4 h [1.3–1.5] | |

Survival seconds and gold banked by window:

| window | cheapest survival | cheapest gold | stats-first survival | stats-first gold |
|---|---|---|---|---|
| run 1 | 29 [10–34] | 351 [324–386] | 29 [10–34] | 351 [324–386] |
| run 2 | 65 [64–66] | 326 [322–330] | 50 [46–87] | 269 [259–393] |
| run 3 | 57 [34–68] | 173 [138–337] | 58 [51–126] | 298 [209–605] |
| runs 4–5 | 98 [51–134] | 464 [179–710] | 48 [36–88] | 214 [143–345] |
| runs 6–10 | 225 [105–402] | 1,158 [349–2,295] | 118 [32–307] | 475 [139–1,889] |
| runs 11–15 | 230 [129–351] | 1,259 [530–2,231] | 236 [44–484] | 1,336 [229–3,639] |
| runs 16–20 | 313 [137–549] | 1,886 [486–3,245] | 312 [243–787] | 1,814 [1,197–5,852] |
| runs 21–30 | 620 [232–1,031] | 3,972 [1,471–8,884] | 662 [404–934] | 4,157 [2,206–7,553] |
| runs 31–40 | 901 [428–1,766] | 7,968 [2,948–14.2k] | 900 [604–1,199] | 6,242 [3,076–8,521] |

| window | balanced survival | balanced gold | weapons-first survival | weapons-first gold |
|---|---|---|---|---|
| run 2 | 89 [24–126] | 328 [92–502] | 30 [10–40] | 232 [74–276] |
| runs 4–5 | 67 [36–104] | 322 [136–436] | 32 [13–44] | 120 [79–267] |
| runs 6–10 | 100 [65–129] | 387 [235–594] | 53 [26–110] | 171 [95–481] |
| runs 11–15 | 122 [66–200] | 417 [229–1,155] | 53 [28–102] | 168 [100–547] |
| runs 16–20 | 129 [122–208] | 590 [409–1,167] | 73 [29–126] | 312 [100–563] |
| runs 21–30 | 194 [90–387] | 1,009 [289–2,069] | 89 [43–214] | 312 [172–1,408] |
| runs 31–40 | 255 [87–555] | 1,298 [355–2,918] | 122 [64–264] | 445 [226–1,299] |

Before (the plan's findings): runs 1–5 went from about 9 s to 35–55 s, then 20–35 runs were flat at
35–58 s paying about 120 gold against 250–1,300-gold steps, then one run broke past the 120 s boss and
income jumped 100× or more.

### Fixed builds: the budget is spent with the policy, then 4 independent runs
| budget | cheapest: survival | cheapest: gold/run | cheapest: wave | stats-first: survival | stats-first: gold/run |
|---|---|---|---|---|---|
| 0 | 24 [10–34] | 94 [74–136] | 1 | 24 [10–34] | 94 [74–136] |
| 300 | 64 [48–106] | 229 [162–446] | 1 | 90 [69–126] | 368 [241–463] |
| 1,000 | 104 [66–130] | 393 [218–595] | 1 | 101 [76–258] | 397 [293–1,158] |
| 3,000 | 237 [130–258] | 1,122 [451–1,421] | 2 | 244 [105–389] | 974 [444–1,925] |
| 8,000 | 332 [266–380] | 1,836 [986–2,160] | 3 | 259 [71–371] | 1,015 [319–2,082] |
| 20,000 | 459 [291–605] | 2,638 [1,786–4,299] | 4 | 451 [255–727] | 2,220 [1,081–4,373] |
| 50,000 | 568 [558–591] | 4,077 [3,246–4,861] | 5 | 769 [692–896] | 5,282 [4,770–6,883] |
| 120,000 | 960 [752–1,170] | 8,116 [6,351–9,726] | 8 | 842 [781–947] | 6,318 [4,813–7,905] |
| 250,000 | 998 [881–1,250] | 8,405 [5,920–11.1k] | 8 | 1,183 [792–1,299] | 6,607 [5,024–8,939] |
| 400,000 | 1,577 [799–1,653] | 11.7k [6,483–14.5k] | 13 | 1,384 [1,117–1,523] | 12.0k [6,858–15.8k] |
| everything (526,224), n = 8 each | 1,664 [1,115–1,800] | 15.7k [8,328–20.1k] | 13–14 [9–15] | 1,433 [1,075–1,800] | 12.6k [8,971–22.7k] |

The largest step between neighbouring budgets is ×2.7 (cheapest) and ×3.8 (stats-first), both from 0 to
300 gold. The two bought-out builds own the same things and differ only in the order of the kit; pooled
(n = 16) a bought-out run lasts 26:26 [17:55–30:00] and 5 of 16 reach 30:00.

Whole catalogue: not reached inside 40 runs. The cheapest career is at 41% after 7.0 h and the stats-first
one at 38% after 6.8 h; integrating cost ÷ income × run length over the fixed-build ladder gives 24 h
(cheapest) and 27 h (stats-first). The inherited tuning measured 68% after 7.8 h, about 11 h in all.

## Against the targets

| target | result |
|---|---|
| run 1 still dies fast, pays about 320 | met: 29 s [10–34], 351 gold |
| first 60 s by run 3–5 | cheapest and balanced at run 2 (early); stats-first 6, weapons-first 7 (late) |
| first 120 s by run 6–10 | cheapest 5, balanced 6, stats-first 9; weapons-first 21 |
| wave 5 by run 20–30 | cheapest 26, stats-first 22; balanced in 1 of 3 seeds (run 38); weapons-first never |
| no flat stretch over about 4 runs | missed: 6–11 runs on the median series and per seed for the stat-buying policies, 8–12 for the weapon-buying ones |
| largest income ratio ≤ ×3 | ×2.4–3.2 on the median series; ×3.4–5.0 per seed |
| 1–3 runs per purchase | balanced yes; weapons-first 2.8–4; cheapest and stats-first buy 1.5–3 steps a run |
| whole catalogue 20–25 play hours | 24–27 bot-hours by extrapolation (a ceiling); not played to the end |
| bought-out profile toward 30:00 | median 26:26, 5 of 16 runs survive the full 30:00 |

### What still misses, and why
- **What you buy decides whether you progress.** Buying across the stat rows gives a steady climb. Buying
  weapons, Split Shot and slots first does not: after 40 runs the weapons-first career is at 122 s median
  and the balanced one (Forged Edge at its cap, six weapons, two slots, three to five Vitality levels) is
  at 255 s. In the pilot's hands a second or third weapon is a side-grade of the free Boomerang,
  Split Shot does nothing until two Split Shot cards are drafted, and damage past the point where the
  volley one-shots a chaser does not stop a pack from touching a player with 165–215 HP; the all-owned loadout
  scores below the default for the same reason. Raising weapon and slot prices so the stat rows come first
  was tried (Orbit 1,200 … Seeker 30,000, slots from 2,500): both weapon-buying policies saved for longer
  and did worse, so it was reverted. This needs a design change, not a price: weapons that add power
  beside the Boomerang, or a shop that steers the first purchases.
- **Flat stretches.** One run's luck moves survival by a factor of two to three once packs arrive (a pack
  of chasers lands several touches inside a second), so a new best every four runs does not happen even
  while the windowed medians rise. Cheapest also sits at 225–313 s from run 6 to run 20.
- **Runs per purchase.** With 95 of 142 steps under 2,500 gold, a spread-buying player buys two to four
  cheap steps a run through the middle of the career. Fewer, dearer steps would fix that and is a catalogue
  redesign.

### Tuning done after the inherited state
- Survival bonus 30 + 0.5n (was 20 + 4n), kill soft cap 200 (was 300), Gilded Palm on kill gold only. The
  inherited income grew about as time^1.8: a bought-out run banked 40k and the catalogue took about 11 h.
  First-two-minute income moved by less than 10%.
- Default kit: an unfed mana weapon ranks last; a purchase benches the weakest weapon. Before, an
  achievement-granted Chain Zap took a Knight's best slot, and a later purchase benched the strongest
  weapon of a kit. The balanced career's runs 31–40 went from 133 s to 255 s.
- Tried and reverted: the weapon and slot repricing above.

## Needs human play to confirm
- Whether the first five runs feel like progress (the pilot reaches 60 s on run 2 with the cheapest buys).
- Whether a person who buys weapons first stalls the way the pilot does, and whether the 2:00 boss reads as
  a wall.
- Run-to-run swing from chaser packs.
- The middle of the career: two to four cheap purchases a run on a spread-buying strategy, and the
  225–313 s plateau.
- Hours to finish the catalogue. The pilot's figure is a ceiling, and it is an extrapolation.
- Reroll, Skip and Banish in use: the pilot never spends a charge, so they are covered by tests only.
- A returning player's refund. A fully bought old profile lands with 43.7M gold, enough for the new shop
  and the apex tier many times over.

## Idle income (2026-10-02)

Gold an hour for three ways of playing. Runs: `node tools/progression_sim.mjs --fixed-build 0,10000,100000 --k 4`
(medians, AUTO pilot, so a floor). Active = gold a run over (survival + 6 s a draft + 20 s of menus).
Auto-continue = half the gold over (survival + 6 s a draft + the 5 s restart), and it stops after 20 runs.
Camp-only = the Gold Mine's rate (it holds 8 hours, so a longer absence pays no more).

| Profile | Gold a run, survival | Active | Auto-continue | Camp-only |
|---|---|---|---|---|
| Early (0 spent) | 98, 27 s | about 6,700/h | about 4,600/h | 150/h (mine Lv 1) |
| Mid (10k spent) | 1,547, 262 s | about 15,500/h | about 8,100/h | 500/h (mine Lv 3) |
| Late (100k spent) | 5,288, 796 s | about 18,800/h | about 9,500/h | 1,000/h (mine Lv 5) |

Camp-only is the smallest by a wide margin and auto-continue sits at 50 to 69% of active, so the draft
prices stay. The 20-run limit caps an unattended session at roughly 13 minutes (early), 2 hours (mid) and 5.5 hours (late).
Source: the sim for runs; arithmetic for the hourly figures and the camp.
