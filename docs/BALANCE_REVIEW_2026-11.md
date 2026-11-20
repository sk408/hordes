# HORDES balance review, November 2026

For Steve. The plan's last step: one review of the whole game as it stands, then a few
numbers fixed. Two measurers ran the game headless (whole careers, every profile, every
character, several ways to draft and to shop). A designer re-checked their findings on new
seeds and proposed changes. Three were applied here, one was held (A3), and five wait for you.

A word on the numbers. The pilot is not a person. It dodges worse than you do. So every
survival time below is a floor, and every gold-per-hour figure is a ceiling on what idling
pays. "Paired" means the same 16 random seeds on both sides, so the only difference is the
change. "x1.90 (11/0/5)" means: the median run lasted 1.90 times as long, 11 seeds longer,
0 tied, 5 shorter.

## 1. The picture

**A new player.** The guided first run lasts about a minute (0:40 to 1:47). It teaches by
doing: two drafts, then death in wave 1, for about 520 gold. That is lethal every time: 0 of
578 fresh runs got past the 2:00 boss. Good.

**The first hour (runs 2 to 10).** You buy something after every run. Runs grow from 1 to
about 5 minutes. The first boss kill comes around run 3 to 8. Two things were off. The
game's own auto-pick drafted almost blindly, so idle players and anyone who let the draft
timer pick were stuck at the first boss for several runs (fixed here, A2). And the Paladin
and the Rogue arrive free from trophies in this hour, before their prices mean anything
(waits for you, proposal 3).

**About 2 hours in (about 30 000 gold spent).** Runs last 10 to 14 minutes. A player who
drafts with purpose has the whole kit levelled, evolved and fused by about 5:30, then takes
about 24 stat cards. The Maw, the run's big set piece, died in one second every time (fixed
here, A1). The paid characters play about level with the Knight when drafted with purpose.
A bought Witch starts with Volley, not her advertised Chain Zap, unless you also bought it.
Giving her Chain Zap made her much weaker, so that change waits (A3).

**About 10 hours in (about 250 000 gold).** Runs last 20 to 25 minutes, and the pilot wins
about 1 run in 12 to 15. The rest of the shop (250 000 more gold) adds only a little
survival (x1.07). Every run that drafts with purpose ends on a Straight Flush, mostly
spades: the hand follows from the build, it is not a choice.

**About 40 hours in.** The shop is finished at 15 to 20 pilot-hours (sooner for a person).
What is left is character upgrades, the camp and the 2 000 000 apex item. The real gap: the
content curve is about 20 hours against a 60-hour target, and prestige opens only on a
30:00 win (about 1 run in 15 for the pilot; for a person, unknown).

**Short version.** Run 1, the shape of the ramp, the split between idle and attended play,
and the rhythm of the shop are right. The auto-pick, the Maw's HP and the BUY NEXT hint were simply
off, and are fixed here. The Witch's weapon is not: see A3. How long the game is, whether the late
shop should add power, and whether the hand and the gems should be choices are your calls.

## 2. Headline numbers (before the changes)

The fixed-build ladder: gold spent through the shop, then one run. AUTO pilot, Knight,
16 seeds per cell, median [10th to 90th percentile]. From the review (balance_run.md).

| profile | gold spent | auto-pick (the old one) | evolutions first | hand first |
|---|---|---|---|---|
| fresh, run 1 (200 runs) | 0 | 0:48 [0:35-1:12] | - | - |
| early | 3 000 | 4:29 [2:10-5:30] | 4:50 [2:11-6:17] | 4:51 [2:09-6:04] |
| mid | 30 000 | 12:45 [9:28-15:11] | 13:24 [12:11-15:08] | 13:25 [12:39-16:09] |
| late | 400 000 | 23:24 [19:26-29:47] | 26:04 [24:04-28:07] | 26:26 [23:23-29:45] |

Gold per hour (the economy measurer, at 1x speed, AUTO pilot):

| gold spent | attended | unattended (auto-continue) |
|---|---|---|
| 1 000 | 10-14k | 8-10k |
| 30 000 | 20-27k | 14-18k |
| every shop row | 32-45k | 21-29k |

Unattended pays 0.65 to 0.70 of attended per hour, never more.

A career: the whole shop (504 298 gold) is bought at 14.5 to 20.5 pilot-hours, with never
more than 1 to 4 runs without a purchase.

## 3. What was changed here

Each is its own commit on `r2/balance`, with a test that fails without it. Before and after
are measured on the same seeds. Knight unless named, AUTO pilot unless named.

### A1. The Maw is a fight, not a flash

**Before.** All 265 heroes who reached the Maw killed it in about one second. Its arena and
its sting were over before they started.

**The change.** The Maw's HP 250 000 -> 7 500 000 (`C.RUN.MAW_HP` in `src/config.js`, and the
bar's `DISPLAY_HP` in `src/final_boss.js`). It still leaves after 90 s if not killed.

| profile (16 seeds) | fight before | fight after | slain after | survival after vs before |
|---|---|---|---|---|
| mid, 30 000 gold, old auto-pick | 1 s | 20 s [17-35] | all | x1.00 |
| mid, 30 000 gold, evolutions first | 1 s | 18 s [6-59] | all | x0.98 |
| mid, 30 000 gold, stat cards first (the weakest build) | - | 26 s [17-26] | 3 of 3 | - |
| late, 400 000 gold, auto-pick | 1 s [0-2] | 10.5 s [4-42] | 16 of 16 | x1.03 (9/2/5) |
| late, 400 000 gold, evolutions first | 1 s [0-1] | 4 s [2-7] | 16 of 16 | x1.02 (8/2/6) |
| prestige 1 (x1.5 HP), whole shop, evolutions first | 0 s [0-1] | 3.5 s [2-6] | 16 of 16 | x0.97 (6/2/8) |

In these cells nobody died with the Maw up and none saw it withdraw. Over every batch run for
this work (about 280 Maw encounters at 7 500 000) it withdrew once (late, EXPLORE pilot, the
old auto-pick: a 68 s fight). If a build does not kill it in 90 s, it withdraws: the player loses the 1 200 gold clear bonus and the
HYPER milestone, a toast says "THE MAW WITHDRAWS", and the run goes on. It does not read as a
loss. 7 500 000 gives a 15 to 40 s fight at mid and under 15 s late, so it stands.

One hero did die to the longer fight. On the old BUY NEXT path at 30 000 gold (a weak build,
level 24, the path A4 removes), seed 2010 met the Maw at 12:33 and died to it at 13:10. With
the old HP it killed the Maw at once and lived to 15:44. That is 1 death in about 280 Maw
encounters measured after the change (a second run that died with the Maw up was killed by a
DASHER, 94 s in, and lived longer than with the old HP). A weak hero now has to survive up to 90 s of the Maw.
That is the point of a fight, so the number stands, but watch for it.

### A2. The auto-pick drafts toward evolutions

**Before.** When the game picks a card for you (AUTO-PICK on, the 6 s timer, an unattended
run), it took a joker, then a NEW weapon, then a RARE card, else the first card. It never
worked toward an evolution. Idle players stalled at the first boss.

**The change.** `autoDraftPickIndex` in `src/main.js` now ranks: a joker while the row has
room (as before); a card that evolves a weapon now; the lead weapon's card; any weapon level;
a NEW weapon; a stat card that is a weapon's evolution partner; a RARE card; else the first
card. The AUTO-PICK and WAIT switches, the 6 s wait and the free first NEW card with its deal
again are unchanged. One detail differs from the designer's patch: the free NEW card also
waits behind a weapon level. Taking it first was measured and was worse (26 of 64 seeds past
the first boss, against 34 of 64).

New auto-pick against the old one, paired on 16 seeds (the stats-first shop unless named):

| profile | pilot | old auto-pick | new auto-pick | paired | evolutions first |
|---|---|---|---|---|---|
| 3 000 gold, cheapest shop (64 seeds) | AUTO | 2:19, 25 of 64 past 2:30 | 3:49, 34 of 64 past 2:30 | first evolution in 33 runs, was 12 | - |
| 3 000 gold, cheapest shop | AUTO | 3:21 | 3:56 | x1.00 (8/0/8) | 5:38 |
| 3 000 gold, cheapest shop | EXPLORE | 2:39 | 2:11 | x1.00 (6/3/7) | 4:10 |
| 3 000 gold | AUTO | 4:29 | 4:52 | x1.13 (9/3/4) | 4:50 |
| 3 000 gold | EXPLORE | 3:42 | 5:09 | x1.26 (11/1/4) | 5:42 |
| 30 000 gold | AUTO | 13:11 | 13:18 | x1.06 (9/1/6) | 13:42 |
| 30 000 gold, cheapest shop | AUTO | 11:18 | 12:02 | x1.07 (10/1/5) | 12:48 |
| 30 000 gold | EXPLORE | 11:10 | 13:02 | x1.13 (11/0/5) | 13:59 |
| 400 000 gold | AUTO | 24:56 | 22:01 | x0.91 (5/1/10) | 26:55 |
| 400 000 gold | EXPLORE | 24:46, 5 wins | 24:29, 2 wins | x1.04 (8/1/7) | - |

Late, the new auto-pick is about level with the old one in survival (x0.91 on AUTO, 5 seeds
longer, 1 tied, 10 shorter; x1.04 on EXPLORE), and on AUTO it earns less gold (x0.82).
The old one filled the whole kit by 1:10 (it took every NEW weapon first); the new one levels
the lead weapon first and fills the kit by 3:46. A trial with NEW cards ranked just above
weapon levels (`KIT_OFFER.AUTO_RANK` 1.65) changed nothing early (x1.00, 64 seeds) and gave
x1.06 (9/1/6) late: inside the noise, so the rank stays 1.5.

The 3 000 gold cheapest-shop cell is a coin toss at the 2:00 boss (each run either dies there
or lives to 4 to 6 minutes), so 16 seeds swing either way; 64 seeds show the gain. Against
drafting evolutions first, the new auto-pick comes close and does not pass it: x0.85 to 0.99
at 3 000 gold, x0.95 to 1.04 at 30 000 (paired).

**Idle against attended.** Unattended gold per hour stays below attended in every cell, at
0.65 to 0.70 of it (the review's time model: unattended pays 0.80 of a run over a chain and
waits 6 s per draft). The pay rule was not touched.

| profile | attended gold/h (new auto-pick) | unattended gold/h | ratio |
|---|---|---|---|
| 3 000 | 14.6k | 10.1k | 0.69 |
| 30 000 | 20.4k | 13.8k | 0.68 |
| 400 000 (AUTO pilot) | 31.0k | 20.1k | 0.65 |
| 400 000 (EXPLORE pilot) | 25.8k | 16.2k | 0.63 |

### A3. A character comes with its weapon: NOT applied

**The problem.** The Witch's card says "Chain Zap start", but a bought Witch starts with Chain
Zap only if you also bought Chain Zap. Otherwise she starts with Volley.

**What was measured.** The change was built and tested (a bought or trophy character unlocks
its starting weapon; an old save that owns the character gets it once on load). Then each
character was played against the Knight, paired on 16 seeds, AUTO pilot, stats-first shop:

| character | 3 000 gold, auto-pick | 3 000, evolutions first | 30 000, auto-pick | 30 000, evolutions first |
|---|---|---|---|---|
| Knight | 4:52 | 4:50 | 13:18 | 13:42 |
| Witch, with Chain Zap (her card) | 2:09, x0.47 (2/1/13) | 3:04, x0.71 (6/0/10) | 8:15, x0.57 (0/0/16) | 8:39, x0.65 (0/1/15) |
| Witch, without (today, Volley first) | 2:33 | 2:36 | 12:05, x0.79 (3/0/13) | 13:15, x0.95 (5/2/9) |
| Paladin, with Orbit Blades | 5:15, x1.01 (8/1/7) | 4:48, x1.03 (9/0/7) | 12:13, x0.91 (3/2/11) | 13:01, x0.96 (6/0/10) |
| Rogue (Boomerang, always owned) | 3:23, x0.89 (5/1/10) | 4:26, x0.98 (6/2/8) | 9:33, x0.77 (2/0/14) | 13:10, x0.97 (4/3/9) |

The Witch with her own Chain Zap is the weakest character by far: at 30 000 gold she lives
about two thirds as long as the same Witch on Volley, shorter on 31 of 32 paired seeds. The
change would make every bought Witch that weak. The Paladin gains a little from Orbit Blades
early (x1.11 to 1.13 against himself without it), but that also makes the free trophy
Paladin of proposal 3 a bigger gift.

**Why it was held.** The numbers do not carry it. The fault is in the Witch with Chain Zap,
not in the rule. The patch is kept (see "Questions" below) for when she is fixed.

### A4. BUY NEXT points at damage before more weapons

**Before.** The BUY NEXT hint sent players into every weapon in turn. Following it at 30 000
gold cost about a quarter of the run against simply buying the cheapest row.

**The change.** `bestNextPurchase` (now in `src/meta.js`): a new weapon is a core step only
while you own fewer weapons than weapon slots (3 plus the slots row). On a fresh profile after
run 1 (two weapons, three slots) it points where it did, so the tutorial's shop lesson is the
same.

A budget spent by always following BUY NEXT, then one run, 16 paired seeds:

| gold | drafting | old BUY NEXT | new BUY NEXT | cheapest first | new vs old | new vs cheapest |
|---|---|---|---|---|---|---|
| 10 000 | evolutions first | 6:14 | 8:02 | 7:06 | x1.25 (14/1/1) | x1.06 (10/1/5) |
| 10 000 | hand first | 6:36 | 8:32 | 7:10 | x1.41 (14/0/2) | x1.17 (13/0/3) |
| 30 000 | evolutions first | 8:45 | 13:13 | 12:48 | x1.27 (14/1/1) | x1.02 (8/3/5) |
| 30 000 | hand first | 8:30 | 12:54 | 12:44 | x1.44 (14/1/1) | x1.04 (9/1/6) |

On these seeds following the hint is as good as cheapest-first or better (it was x0.72 to
0.85). A second measurement on other seeds (below) found it clearly better than the old hint
everywhere, level with cheapest-first at 10 000, but still 16 to 17% behind it at 30 000.

### Run 1 after the changes

A fresh profile, run 1, with A1, A2 and A4 in, 200 seeds per pilot (the same seeds as the
review):

| pilot | died before the wave-1 boss fell | survival median [p10-p90], longest | before | paired |
|---|---|---|---|---|
| AUTO | 200 of 200 | 0:51 [0:36-1:26], 2:32 | 0:48 [0:35-1:12], 2:06 | x1.00 (64 longer, 119 same, 17 shorter) |
| EXPLORE | 200 of 200 | 0:43 [0:34-1:14], 2:10 | 0:42 [0:34-1:12], 1:44 | x1.00 (40 / 136 / 24) |

Run 1 is still lethal every time and lasts about as long. The longest runs are a little longer
(the auto-pick takes the lead weapon's card), but none got past the first boss on these seeds.
On 200 other seeds (below) one run killed the wave-1 boss before it died.

### Measured again by a second agent, on other seeds

A second agent was told to refute each change with seeds the first had not used (8101-8132;
its report is `balance_refute.md` in the review's working files). What it found:

| change | held? | its numbers |
|---|---|---|
| A1, the Maw | yes | the fight lasts 17 to 23 s at mid (was 0 to 1 s) and 3 to 7 s late; nobody who used to live dies; prestige 1 not re-measured |
| A2, the auto-pick | mostly | at 3000 gold on the cheapest-first shop x1.48 on AUTO (21 seeds longer, 2 tied, 9 shorter of 32) and x1.31 on EXPLORE; at 30 000 x1.06 to x1.17; but on the stats-first shop at 3000 it shows no gain (x0.96 to x0.98) and a little less gold (x0.93); it stays below evolutions-first everywhere; unattended stays below attended |
| A3, held back | yes | a Witch with Chain Zap lives x0.59 as long as the Knight on all 16 seeds; holding it back was right |
| A4, BUY NEXT | partly | better than the old hint on every cell (x1.13 to x1.38), level with cheapest-first at 10 000 (x1.04 to x1.07), but x0.83 to x0.84 against cheapest-first at 30 000, with gold x0.76: the hint is better, not yet as good as buying the cheapest row |
| run 1 | yes | 200 of 200 fresh runs still die on each pilot; the middle run is as long as before (0:45 to 0:49 on AUTO), but the longest are longer (the slowest tenth last 23 s more, the longest run 4:04 against 2:11), and 1 run in 200 kills the wave-1 boss before it dies (none before) |

Side effects it measured: the first ten runs of a career are about 20% richer in gold and a
run or two quicker to the first boss kill (the first run to reach wave 2 comes at run 5 or 4,
it was run 6). The early game is quicker to get into, not slower.

## Questions for you

1. **The Witch with her own Chain Zap is weak.** At 30 000 gold she lives 0.57 to 0.65 as
   long as the Knight, and two thirds as long as the same Witch on Volley (31 of 32 paired
   seeds shorter). So A3 (a character comes with its weapon) was held. Look at her and Chain
   Zap (it costs mana; she is frail) first, then apply A3. Or change her card to stop
   promising Chain Zap. The patch and its tests are ready (the A3 commit can be rebuilt from
   them: unlocking or being granted a character unlocks its starting weapon; an old save that
   owns the character gets it once on load, with a note on the title screen).
2. **Proposal 3** (trophy characters). With A3 a trophy Paladin would also bring Orbit Blades.
3. **The late auto-pick.** At 400 000 gold the new auto-pick is level with the old one, and
   both trail evolutions-first (x0.87 for the new one, x0.91 for the old, paired). Fine for idle
   play; say if you want it closer.

## 4. Five proposals that wait for you

Numbered as in the designer's list. None of these is in the game. Each needs your word.

### 3. The Paladin and the Rogue are given away in the first hour

**Today.** Two trophies hand out characters. "Open 25 chests" (CHESTS_25) gives the Paladin,
whose price is 6 000 gold. It comes at run 2 to 5. "Earn 10 000 gold" (GOLD_10K) gives the
Rogue, price 2 500. It comes at run 7 to 12. So two of the three character prices never
matter. The target was one meaningful unlock every 3 to 4 hours.

**The change.** `src/achievements.js`: the CHESTS_25 goal 25 -> 400 chests, the GOLD_10K goal
10 000 -> 75 000 gold. Rename the trophies to match, if their art keys allow it.

**Predicted.** Both become 2 to 5 hour trophies. A player who wants one sooner buys it.
Characters are optional, so no run gets harder; the roster just fills more slowly.

**Recommendation.** Yes. Free characters at run 3 make the character shop pointless. If A3 is
applied later, a trophy Paladin also brings Orbit Blades (a 4 000 gold weapon), and the
early gift grows.

### 6. A weapon card that stays in late drafts

**Today.** A player who drafts with purpose has every weapon maxed, evolved and fused by 5:31
(mid) or 6:10 (late). After that a maxed weapon is never offered again, so the rest of the run
is 24 to 61 stat cards: 58 to 77% of the run.

**The change.** `src/main.js`, the draft pool loop: drop `!hasRule(state, 'once')` from
`if (lv >= WEAPON_MAX_LEVEL ...) continue`. A maxed weapon is then offered its existing card,
"+10% weapon damage · MAXED" (today only the ONE OF EACH rule shows it).

**Predicted.** A weapon card in most late drafts. The share of the run after the last weapon
card falls under 40% (measure with `tools/balance/lastweapon.mjs`). More late power, so the
30:00 win comes sooner; the card may need to be +5%.

**Recommendation.** Yes, at +5%, and re-measure survival at 30 000 and 400 000 gold. It is the
cheapest way to give late drafts a choice. It does not fix that a build is decided by minute 6.

### 7. Should letting gems condense pay?

**Your words** (2026-11): "it becomes a strategy to not collect gems for a long period so that
they condense into very valuable xp gems ... the lower level of condensing is barely any
bonus. its only when they are significantly condensed".

**Today.** Rich gems add 0 / 1 / 3 / 6 / 10% by size (`C.FLOOR.RICH_BONUS`). Over a whole run
they add about 2% of all XP. The pilot that left gems lying lost a lot (x0.52 to 0.74
survival), but that experiment walked away from the gems and let them drift off; it measured
abandoning gems, not holding them. Do not trust it.

**The change**, if you want condensing to be a strategy: `C.FLOOR.RICH_BONUS` [0, .01, .03,
.06, .10] -> [0, .02, .06, .15, .30].

**Predicted.** Holding and then sweeping gets close to collecting at once, perhaps better for a
player who stays near the pile. Players who collect late anyway get more XP.

**Recommendation.** Decide what you want first. If waiting should pay, take the new numbers
and have someone (or a better pilot that holds and sweeps) play it before release.

### 8. The last 250 000 gold of the shop

**Today.** Going from 250 000 to every row (504 298) gives x1.07 survival on paired seeds
(23:31 -> 25:58, 9 of 12 seeds longer) and +14% gold, over about 7 pilot-hours. The pilot's
deaths there are mostly CHASER contact (17 of 23): it may be the pilot's dodging that stops it,
not the shop.

**The change**, only if the late shop should add power: `src/meta.js` `laststand` (revive at
50% -> 100% HP) and `bloodpact` per level x1.5. Do not cut prices: that only moves the win
earlier in hours.

**Recommendation.** Wait. Record a few of your own runs at 250 000 and at the full shop. If you
also stall at 23 to 26 minutes, make the change and re-run the `shop` batch.

### 9. The gold suit nobody reaches

**Today.** A card's suit comes from its type, and weapon cards are spades. So a weapon build
ends on spades: 92% of suited hands. Diamonds (the gold suit) ended 1 run of 678.

**The change.** No nerf (it would not spread the suits). Either let the Gilded Palm joker count
as a diamond, or deal diamond gold cards in drafts.

**Predicted.** A player who chases the hand can aim at a gold run (+15 to 20% gold). Low risk.

**Recommendation.** Yes to the Gilded Palm counting as a diamond: one rule, and it makes a
joker a real choice. Measure end suits under hand-first drafting afterwards.

## 5. Leave alone (it looked off, it is right)

- **Run 1 is lethal**: 578 of 578 fresh runs (and 400 more after these changes, below).
- **KIT_OFFER.AUTO_RANK 1.5** (how the auto-pick ranks a NEW weapon card): setting it to 0.5
  changed nothing on 31 of 32 seeds. The auto-pick's weakness was elsewhere (A2).
- **The "wall" after the Maw at mid (wave 6)**: a fixed budget dies where its power runs out.
  A career has no cliff after run 4.
- **The apex's 2 000 000**: a grind after the game is done, by design.
- **Unattended pay**: 0.65 to 0.70 of attended per hour. The 25% cut after 3 free runs, undone
  by one tap every 4 runs, reads as intended. Not changed.
- **Camp mine and quests**: small change (1-3% and 2-6% of income). They do not compete with play.
- **Weapons from drafts**: +6 to 20% gold an hour for players who draft with purpose early;
  costs no one.
- **The spades boon and the Straight Flush numbers**: a nerf would not change which cards are spades.
- **The characters' power**: with purposeful drafting they are close to the Knight. That they
  play alike is a design question, not a number.
- **Prestige gated on a 30:00 win**: right in shape. Whether people reach it is open.
- **Full potion belts late**: the drink rule is the pilot's. A person decides when to drink.
- **Jokers**: none is a must-take or a trap (holders 0.95 to 1.03 of their cell's median).

## 6. What the review could not measure

- **Every late number is the pilot's ceiling.** At 250 000 gold and up the pilot dies at 23 to
  26 minutes, mostly touched by a CHASER, whatever it owns. The win rate, the first-win hour
  and "the late shop buys little" all lean on how the pilot dodges. A person's runs at 250 000
  and at the full shop are needed before touching late prices or the enemy ramp.
- **Careers had 2 seeds per shop.** Read career hours as plus or minus a few hours.
- **Holding gems.** The experiment measured abandoning gems, not holding them (the pilot walks
  away and the gems drift off). It needs a hold-and-sweep pilot.
- **The economy's hours** come from a career model built on fixed builds, checked to about 20%
  against 18 real careers.
- **The wave-3 pair**: one boss is still alive when the run moves on in 77 to 88% of runs. Not
  checked whether that is intended.
- **Tools nobody checked**: balance_sim, draft_sim, boss_sim, floor_census, world_sim_table.

## 7. How to run it again

docs/PROGRESSION_SIM.md, "Balance batches". Every batch of this review and of the changes is in
tools/balance/batch.mjs; tools/balance/ana.mjs prints the tables.
