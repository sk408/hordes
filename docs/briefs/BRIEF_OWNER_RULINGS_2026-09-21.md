# BRIEF — two owner rulings to implement (COLOSSUS credit + phantom burn tick)

Sk408 ruled on 2026-09-21 on two long-open items. Implement both in this worktree
(/home/claude/projects/hordes, branch main — this tree is served LIVE to players
via nginx; complete the full pass in one session and leave it ready to commit).

## Ruling 1: COLOSSUS death shockwave friendly-fire is NOT player credit

Owner decision: **do not credit.** The COLOSSUS death shockwave can kill other
enemies, and that kill's damage/kill credit currently lands in the player's stats.
Required end state: shockwave kills of OTHER ENEMIES do not count as player-dealt
damage and do not count as player kills. Find every accounting path the shockwave's
friendly-fire damage flows through (cite file:line in your report) and sever only
the player-credit attribution; the shockwave itself must still kill those enemies
and behave identically in combat.

## Ruling 2: dead corpses take one phantom burn tick

Owner decision: **fix it.** Symptom recorded by the owner: dead corpses take one
phantom burn tick after death — `src/main.js:3217`, no hp guard. A corpse that is
already dead takes no further burn damage. Watch for knock-on effects: any
damage-accounting totals or kill credit that currently absorb that tick should end
up consistent after the guard.

## Constraints (binding)

- Suite baseline on this branch: **166 green / 0 red**. Acceptance is 166/0 or
  better — a NEW red is a fail; if a fixture pins the old credited behavior,
  retarget the fixture to the ruling and say so explicitly in your report
  (that is moving the goalposts ON PURPOSE by owner order, not a silent fix).
- Do NOT run any `git` command. The coordinator verifies and commits.
- Measure, don't infer: prove ruling 1 with a real run/test that shows shockwave
  friendly-fire kills NOT appearing in player stats while enemy kills still occur,
  and ruling 2 with a test showing a dead corpse takes no extra burn tick.
- No emojis in copy. If you add any user-visible text, keep it plain.

## Deliverable

Report: every file:line touched, the proof for each ruling, the suite summary line
(greenfiles/redfiles + REDLIST), and anything unverified flagged explicitly.
