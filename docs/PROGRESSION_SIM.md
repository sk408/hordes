# Progression simulator

`tools/progression_sim.mjs` measures how a player's **career** unfolds: fresh
profile, run, bank gold, shop, next run. It is the measuring stick for
rebalance work: run it before and after a tuning change, at the same flags,
and compare the reports.

It drives the real game headlessly (real frame loop, real AUTO pilot, real
draft activation, real gold settlement, real `buyUpgrade`). Nothing is
modelled or approximated except the player's choices, which are named
policies.

```
node tools/progression_sim.mjs --runs 40 --seeds 3 --shop stats-first
node tools/progression_sim.mjs --matrix --runs 15 --seeds 2
node tools/progression_sim.mjs --matrix oat --runs 20 --seeds 3
node tools/progression_sim.mjs --fixed-build 2500,10000,20000,30000 --k 6
node tools/progression_sim.mjs --list
```

## Modes

| Mode | What it does |
| --- | --- |
| default | One policy, `--seeds` careers of `--runs` runs each. |
| `--matrix [axes]` | Crosses the listed axes (default `shop,loadout`, 8 policies) and prints one comparison table. `--matrix oat` varies each axis one at a time around the base policy given by the other flags. |
| `--fixed-build X[,Y...]` | Grants X gold, spends it with `--shop` (no saving up), then plays `--k` independent runs per budget. Use a ladder of budgets to locate the survival cliff. |
| `--list` | Prints the live catalogue and how each row is classified (combat or economy). |

## Policies

Each axis is independent. A policy is written `shop/loadout/draft/once/stance/character`.

- `--shop`
  - `cheapest`: cheapest affordable row of any kind, repeatedly.
  - `stats-first`: the damage row whenever affordable; holds gold when its next
    level is within 5 runs of recent income; otherwise the cheapest affordable
    combat row. Economy rows are bought only when no combat step is left.
  - `weapons-first`: weapon unlocks cheapest first, then `split`, then `slots`;
    holds gold when one of those is within 5 runs of income; otherwise behaves
    as `stats-first`.
  - `balanced`: alternates `stats-first` and `weapons-first`, purchase by purchase.
- `--loadout`: `default` (whatever the game equips; a bought weapon is
  auto-equipped) or `all-owned` (before every run, fill every slot with owned
  weapons, priciest first).
- `--draft`: `random` (the game's uniform auto-pick), `weapons-first` (a weapon
  level-up card when offered), `stats-first` (stat cards in `--stat-priority`
  order). The last two never take a run-rule card unless `--once take`.
- `--once`: the ONE OF EACH card. `take` whenever offered, `never`, or `asis`
  (no special handling).
- `--stance`: AUTO_ALL pilot doctrine, `SAFE`, `BALANCED` or `GREEDY`.
- `--character`: any key of `CHARACTERS`. It is granted free at career start,
  so its unlock price stays out of the economy being measured.

## Other flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--runs` | 20 | Runs per career. |
| `--seeds` | 3 | Careers per policy (seeds `seed-base+1..N`). |
| `--seed-base` | 1000 | |
| `--k` | 6 | Fixed-build: runs per budget. |
| `--speed` | 8 | Sim substeps per frame (`state.gameSpeed`). |
| `--max-run-seconds` | 1800 | A run is cut off and settled at this many sim seconds. |
| `--concurrency` | cores - 1 | Worker processes. One worker per (policy, seed). |
| `--overhead-seconds` | 20 | Menu time per run in the play-hours estimate. |
| `--json FILE` | | Every per-run record as JSONL, in a fixed order. |
| `--trace-every N` | off | Adds a `trace` array to every JSONL record, one sample per N sim seconds: `t, level, drafts, kills, hp, maxHp, dmg, enemies, purse, wave, tiers` (kills per gold tier), `survival` (survival-bonus gold so far) and `near` (what is touching the player). |
| `--detail` | | Matrix: also print each policy's per-window table. |
| `--verbose` / `--quiet` | | One stderr line per finished run (with wall time) / no stderr progress at all. |
| `--tree DIR` | this repo | Simulate another checkout (for example a sibling worktree). |
| `--damage-row`, `--weapon-line`, `--once-rule`, `--stat-priority` | `dmg`, `split,slots`, `once`, `multi,rate,dmg,pierce,hp,speed,pickup` | The only ids the policies name. If a rebalance renames one, the tool stops with a message naming the flag to use. |

Progress and wall-clock time go to stderr; the report on stdout is byte-identical
between two identical invocations.

## Reading the report

Every figure is `median [min-max]` with its n. A lone number is never printed.

- **Curve tables** (survival, gold banked): one column per run window (`run 1`,
  `run 2`, `run 3`, `runs 4-5`, `runs 6-10`, ...). The cell pools every run in
  that window across seeds. A wide band means the window is noisy, so do not
  read a difference between two policies whose bands overlap.
- **Milestones**: first run reaching 60 s, 120 s, wave 2, wave 5. `7 [5-9] 3/3`
  means the median seed got there on run 7, the range was 5 to 9, and 3 of 3
  seeds got there. `>15` means not within the career.
- **Longest flat stretch**: the most consecutive runs in which median survival
  set no new best. This is the "I am not getting anywhere" number.
- **Runs per purchase**: by career third. Below 1 means several purchases per
  run; a high number means long saving stretches.
- **Largest run-to-run income jump**: the biggest ratio of one run's banked gold
  to the previous run's. A large value marks the point where the economy runs away.
- **Catalogue 25 / 50 / 100 %**: runs and play hours until that share of the
  shop is owned, both by gold cost and by number of purchase steps. Cost is
  dominated by a few very expensive rows, so the two can differ a lot.
- **Spread**: best policy against worst on end-of-career survival, total gold
  and catalogue share. A large spread means the player's choices matter a lot.
- **Play hours**: survival seconds, plus the 6 s auto-pick wait per draft, plus
  `--overhead-seconds` per run, at 1x game speed.

Per-run JSONL fields: `policy, seed, run, end, t, wave, level, drafts, kills,
gold, award, purse, winBonus, firstClear, cause, weapons, picks, tookOnce,
bank, bought[{id,cost}], spent, cumSpent, cumGold, left, catPct, itemsPct,
playHours`.

## Caveats

- **The AUTO pilot plays worse than a person, so every figure is a floor.**
- Results depend on `--speed`: the substep count changes pilot timing. Compare
  only runs made at the same speed.
- With 2 or 3 seeds the bands are wide. Use more seeds before trusting a small
  difference.
- `random` draft picks uniformly at once instead of waiting out the game's 6 s
  timer; the wait is added back in the play-hours estimate.
- The catalogue is the shop (`SHOP_UPGRADES`). Character unlocks, character
  upgrades, the apex tier and prestige are not bought by any policy.
- Achievement grants count towards catalogue share (they are owned, not bought).
- Fixed-build runs set `bestTime` high so no FIRST_CLEAR bonus is paid: the
  income shown is steady-state.
- A run that ends at the cap is settled through the purse seam, not through a
  death or win screen.

## The sim budget

`test/_sim_budget.mjs` caps measurement arms at 60 sim seconds and says there is
no opt-out. A career cannot be simulated inside that cap, so the worker
processes of this tool, and only those, install a registry that is never
"measured" before importing the harness (`tools/progression/engine.mjs`). No
file in `test/` or `src/` is changed and the cap still binds the suite and every
other tool. This is a deliberate exception to an owner rule and should be
confirmed with the owner; a full matrix is several CPU-minutes, so run it on
purpose, not in a loop.

## Layout

- `tools/progression_sim.mjs`: CLI, worker pool, output.
- `tools/progression/catalogue.mjs`: reads the live shop from `src/meta.js`.
- `tools/progression/policies.mjs`: the shop policies.
- `tools/progression/engine.mjs`: boots the game, plays runs, careers, fixed builds.
- `tools/progression/report.mjs`: statistics and tables.
