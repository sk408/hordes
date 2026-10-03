# Travel

Plan section M5a ("stages chained in one run"). Code: `src/travel.js` (pure rules), `src/main.js` (`travelTarget`,
`travelTo`, the two cards in `openIntermission`, `continueRun`). Tests: `test/test_travel.mjs`, `test/test_travel_hint.mjs`.
Screenshots: `docs/art/travel/` (`tools/capture_travel.mjs`).

## What the player sees

After the boss of wave 2 and of wave 4, the portal leads on to another stage.

- The intermission's first card, CONTINUE, says where: "the portal leads on to SNOWFIELD: fewer, tougher, ranged
  pressure · wave 3 [C]". A second card, STAY HERE, keeps the field. Every other intermission is as before.
- CONTINUE is the first card, the C key, the auto-continue pick and what the simulator presses, so a hands-off run
  travels.
- The run arrives on a new field of the new stage: new ground and buildings, new sites, vault, lever, yard and secrets,
  that stage's enemies and numbers. The hero starts at the centre and the map starts blank.
- What carries over: the build (weapons, cards, jokers, items, level), the quests and their counts, the boss rules, the
  clock and the wave count, the run's gold, and any chests, gems, potions and items still on the ground (they arrive
  round the hero).
- What stays behind: the old field's unused sites, a held vault key, the fog already lifted.
- The end screen names the journey ("VERDANT HOLLOW > SNOWFIELD").
- First-time hint `travel` on the first intermission that travels. One row in the reference under YOUR BUILD.

## Rules

- `travelDue(wave, endWave)`: waves 2, 4 ... below the maw's wave (5). No travel on the maw's wave or after it.
- The pool: every stage the profile has unlocked, plus the first locked stage after them, so a run can look one stage
  ahead. Travelling to a locked stage does not unlock it for the pre-run screen.
- The order: the pool shuffled once per run (seeded from the world seed). The portal leads to the first stage of the
  order the run has not visited; when every one has been visited, to the first that is not the current stage (a new
  field of a stage seen before).
- Each field has its own seed, drawn from the run's seed and the field's number.
- The run's records keep the stage it began on (`state.stagesSeen[0]`); the sites tally sums every field.

## Balance (2026-10-03)

Career simulation, `--runs 15 --seeds 16 --shop stats-first --stage MIX --speed 8`, the tree before travel (`35d6d0f`)
against the tree with it. Cells are the median over the window.

| Pilot | Window | Survival before | with travel | Gold banked before | with travel |
|---|---|---|---|---|---|
| EXPLORE | runs 6-10 | 122 s | 119 s | 483 | 490 |
| EXPLORE | runs 11-15 | 248 s | 244 s | 1495 | 1484 |
| AUTO | runs 6-10 | 122 s | 122 s | 499 | 499 |
| AUTO | runs 11-15 | 255 s | 258 s | 1406 | 1451 |

No measurable change: fresh sites on arrival make up for the harder stage. In the first 15 runs most runs end before
the wave-2 boss falls, so travel is something a player grows into.

## Open

- The intermission on a travel wave has nine cards; on a phone held sideways the ninth scrolls. The three chest cards
  could become one.
- Travel stops at the maw. After it the run goes on with no sites, as before.
