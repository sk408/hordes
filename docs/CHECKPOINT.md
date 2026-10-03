# HORDES overhaul — checkpoint (2026-10-03, after the world update shipped)

## Where everything is
| What | Where | State |
|---|---|---|
| Live game (players, galaxy.click) | GitHub `sk408/hordes` `main` = `349e83b` "The world update (2026-10-03)" | Shipped 2026-10-03 about 14:10 UTC with Steve's OK. Checked on the live site in headless Chrome: a fresh profile plays; a v11 save migrates, keeps its reserve and shows the note; no console errors. |
| Rollback points | tags `pre-world-update-2026-10` (= `df10edc`, the October 2 release) and `pre-overhaul-2026-10` | Both pushed to GitHub. The old pre-overhaul game is still at `/classic/`. |
| Release branch | `D:\hordes-release`, branch `release/overhaul-1` = `349e83b` | One squashed commit on top of `df10edc` with the working branch's exact tree. Hotfixes: commit here, `git push github HEAD:refs/heads/main`, and carry the fix to `claude/overhaul`. |
| Working branch | `D:\hordes-claude`, branch `claude/overhaul` | Same content as `main` plus checkpoint commits (docs only). Its history is not on GitHub (it holds server details in old checkpoint commits): release by squashing, never by pushing this branch. |
| Test build | https://claude.stevesinfo.com:8443/hordes-claude/ | Follows `claude/overhaul`; the update steps are in the local checkpoint. |
| Plan | `docs/OVERHAUL_PLAN.md` | Done: M0–M3, M2b, M3b, M5a, M5b. Left: M4 engine, M5 content, M6. |

## What shipped in the world update
- The world: sites, fog and waypoints, EXPLORE pilot (default), high ground, vault, yard, secrets, quests and chains; world art.
- Idle: background play, auto-continue, away summary, the camp.
- The escape cinematic (replaces the minigame). Escape Writ triples the escape gold.
- Boss rules (six rules from wave 2, Rulebreaker joker). Travel (after waves 2 and 4 the portal leads to another stage).
- Removed: the heat dial (RAISE THE STAKES) and the run modifiers (ONE WEAPON, NO POTIONS). MIMIC FEAST is a joker for the eight glyphs. Neither system was stored in a save.
- Kept from heat, renamed **wrath** (`src/wrath.js`): enemies toughen as the run fills item slots and evolves weapons. Same numbers. A 16-seed sim with it off ran five times as long by runs 11–15, so it cannot go without a full re-tune.
- Quest gold takes the shop's Greed. Hero arrow and solid ring in a crowd. Closed quests. First shrine near the start.
- Saves: v10, v11 and v12 saves migrate to v13 (checked in real Chrome and on the live site). The first load of an older save keeps its raw text under `hordes_profile_before_v13` (rollback insurance; nothing reads it). The what's-new note is `2026-10-03`; a save an older build wrote gets it even when played after the ship date.

## Checks at ship time
- Suite: 216 files, 216 green at `--par 4`.
- Same-seed career sim before and after the removal: identical, seed for seed.
- Real Chrome: a whole run (escape cinematic, rules, two travels, the maw, wave 6) on desktop and phone size, no console errors (`tools/soak_run.mjs`).
- Layouts checked: pre-run screen (five cards) on two phone sizes and desktop; what's-new note on desktop and phone.

## For Steve to look at
1. Play the live build: the escape cinematic in motion and with sound (never checked by ear), a run to wave 3+ for rules and travel.
2. Boss rules are a small net gain for the player (runs 11–15 about a fifth longer). Left as is.
3. Wrath (see above) is a hidden tax on evolving weapons and filling item slots. It is now named in the reference (YOUR BUILD: WRATH) and on the text HUD. Removing it is a balance project.
4. The travel intermission has eight cards now that the stakes card is gone (it fits a phone).

## Next
- M4 engine (sim extraction, fixed timestep, seeded randomness, mode state machine), M5 content (enemy behaviours, stage hazards and signature bosses, character rules, relics), M6.
- Watch for player feedback on galaxy.click after the update.

## Still open (not blockers)
- A hero inside the opened yard with a horde at the gate still dies fairly often.
- Background play was not checked in a real hidden browser tab.
- Contrast margins on the three bright stages are inside the tested limits but thin.
- Pyraxis keeps her distance: an unupgraded build takes about 100 s to kill her on wave 4.
- Load flakes (pass alone): test_camera_deadzone, test_audit_m3, test_e2_horde, test_terrain, test_m3_first_minutes, test_frost_card, test_pilot_nostall, test_perks.

## Standing rules (also in Claude's memory)
- Opus 5.5; workflows only when Steve opts in; at most one subagent at a time. Keep two CPU cores free (tests `--par 4`, sims `--concurrency 8`, one headless Chrome at a time). Never open windows on Steve's screen.
- Run 1 stays lethal; early weakness is deliberate; pacing docs are unreliable; the tutorial teaches by doing; "is it fun to play" decides.
- Nothing goes to `main` without Steve's OK, except urgent fixes he asked for.
