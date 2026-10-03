# Boss rules

Plan section M5a ("boss blinds"). Code: `src/boss_rules.js` (data and pure rules), `src/main.js` (the block after
`continueRun`), `src/skills.js` (the two blocks), `src/render.js` (the HUD plate). Tests: `test/test_boss_rules.mjs`.
Screenshots: `docs/art/boss-rules/` (`tools/capture_boss_rules.mjs`).

## What the player sees

From wave 2 on, the wave's boss brings one named rule for its fight and a reward for beating it. Wave 1's boss has no
rule, so a first run plays exactly as it did.

| Rule | While the boss lives | Reward |
|---|---|---|
| THE STAMPEDE | enemies move 25% faster | a chest |
| THE CHORUS | enemies arrive 50% faster | a chest |
| THE GUARD | two elites guard the boss | a chest |
| THE WALL | the boss has 50% more health | a free card |
| THE SILENCE | skills are sealed | a free card |
| THE DROUGHT | potions do nothing | a full heal and a potion |

- A run shuffles the six rules once (seeded from the world seed). Waves 2 to 7 bring each rule once, then the order
  repeats. A run that carries no potions never draws THE DROUGHT; its turn goes to the next rule.
- The rule is named ahead of the fight: on the intermission before the wave ("NEXT BOSS RULE: ...") and in a gold line when
  the wave starts.
- When the boss arrives the rule goes live. The banner's small print names the rule and the reward, and a red-edged plate
  under the boss bar shows the rule for the whole fight.
- The rule ends when the boss falls (on a double wave the first of the two: that death wins the wave) and the reward is
  paid there. The event feed reads "BOSS DOWN - THE WALL IS BEATEN: A FREE CARD".
- A free card is a normal draft without the level ("FREE CARD"); it opens after the boss's joker offer.
- The maw brings no rule.
- The RULEBREAKER joker: a rule does not bind you (no effect, no plate) and its reward is still paid.
- First-time hint `bossrule`, shown when the first rule goes live. One row in the reference under YOUR BUILD.

## Why these six

Each rule does one thing through a seam the game already had, and each leans on a different part of a build:
field speed and arrival rate ask for area damage and movement, the guard and the wall ask for single-target damage,
the silence and the drought take away the two panic buttons. Nothing asks for an input, so a hands-off run meets the
same rules as a steered one.

## Balance (2026-10-03)

Career simulation, `--runs 15 --seeds 16 --shop stats-first --stage MIX --speed 8`, the tree before the rules
(`c7fa6f7`) against the tree with them. Cells are the median over the window.

| Pilot | Window | Survival before | Survival with rules | Gold banked before | with rules |
|---|---|---|---|---|---|
| EXPLORE | runs 6-10 | 122 s | 111 s | 474 | 480 |
| EXPLORE | runs 11-15 | 225 s | 271 s | 1377 | 1546 |
| AUTO | runs 6-10 | 123 s | 122 s | 499 | 484 |
| AUTO | runs 11-15 | 225 s | 274 s | 1437 | 1648 |

Runs 1 to 5 are unchanged (run 1 is identical seed for seed: no rule before wave 2) and runs 6 to 10 are level.
Once runs reach wave 2 regularly the rewards outweigh the rules: runs 11 to 15 last about a fifth longer and bank
12 to 15% more gold. That is a small push through the middle of
the career, where the curve was flattest, and it comes from something the player can see and name.

THE CHORUS first halved the spawn tick. The tick has a floor that wrath alone can reach (see below), so on a run with
a big build the rule did nothing (found by an end-to-end run in real Chrome, `tools/soak_run.mjs`). It now brings 50% more groups per
tick, which holds at any pace. The table above was measured with the first version.

If it needs trimming, the levers are in `BOSS_RULES`: the numbers in each `fx`, and the reward kinds.

## What boss rules replaced (2026-10-03)

The plan had boss rules take the place of two older systems, and both are gone now:

- **The heat dial.** RAISE THE STAKES on the intermission (+1 heat for more gold and XP), its payouts and its readouts.
- **The run modifiers.** ONE WEAPON and NO POTIONS on the pre-run screen (three times the run award). MIMIC FEAST, the
  modifier that the eight glyphs unlocked, is a joker now: it joins the offers once the set is found.

Neither was stored in a save, so nothing migrates.

One part of heat stays, under the name **wrath** (`src/wrath.js`): enemies get tougher as the run fills item slots
(+1 each) and evolves weapons (+2 each): +12% health, +8% damage and +6% arrivals per point, capped at 20. It was
never a choice, and it is the main thing that holds a run's difficulty. A career simulation with it switched off
(16 seeds) ran 1263 s at the median in runs 11-15 against 246 s with it, and banked three to four times the gold.
Taking it out would need the whole curve re-tuned.
