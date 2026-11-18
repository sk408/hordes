# HORDES overhaul — checkpoint (2026-11-17: the auto-pick switches release)

## Where everything is
| What | Where | State |
|---|---|---|
| Live game (players, galaxy.click) | GitHub `sk408/hordes` `main` | The release made from this tree: the draft AUTO-PICK switches and the November review, on top of `ce40d72` (the play-test fixes of 2026-10-03). Shipped 2026-11-17 with Steve's OK ("can you deploy it so users can have the auto pick? i dont think i need to try it first"). |
| Rollback points | tags `play-test-fixes-2026-10-03` (= `ce40d72`), `phone-shop-2026-10-03` (= `10a9768`), `world-update-2026-10-03` (= `349e83b`), `pre-world-update-2026-10` (= `df10edc`, the October 2 release), `pre-overhaul-2026-10` | All on GitHub. The pre-overhaul game is still at `/classic/`. |
| Release branch | `D:\hordes-release`, branch `release/overhaul-1` | One squashed commit per release, each with the working branch's exact tree. |
| Working branch | `D:\hordes-claude`, branch `claude/overhaul` | Anything ahead of `main` is listed under "On `claude/overhaul`, not live yet". Its history is not on GitHub (old checkpoint commits hold server details): release by squashing, never by pushing this branch. |
| Test build | https://claude.stevesinfo.com:8443/hordes-claude/ | Follows `claude/overhaul` when it is updated. Not updated for this release, so it is behind the live game. The update steps are in the local checkpoint. |
| Plan | `docs/OVERHAUL_PLAN.md`; the November review `docs/REVIEW_2026-11.md` | Done: M0–M3, M2b, M3b, M5a, M5b. Left: M4 engine, M5 content, M6. The review's next step is R1, the first of its seven small releases. |

## What shipped on 2026-11-17
1. **Draft AUTO-PICK switches** (Steve, 2026-11-17: "one for on off and one that cycles 1 to 6"). In AUTO the level-up draft and the evolve offer show `AUTO-PICK IN 4.2s [ON] [WAIT 6s]`. ON/OFF (key U) holds the offer until the player picks; WAIT (key T) takes a second off per press, 6 → 1, then back to 6. Both are remembered (`hordes_draft_auto`, `hordes_draft_wait`). The default is ON at 6 s, so nothing changes for anyone who never touches them. With auto-continue on and AUTO-PICK OFF, the stall watchdog takes the card after 30 s and the row says `AUTO-CONTINUE IN 30s`. Not O: O is the in-run pilot toggle, and a press racing the countdown flipped the pilot to MANUAL. Known and intended: background play with OFF waits at the first level-up.
2. **The November review and plan** (`docs/REVIEW_2026-11.md`, also a private page for Steve). Decision 1 (draft auto-pick) is settled by item 1; decisions 2, 3 and 5 are still open.

Checks before the push: suite 217/217 at `--par 4` under two fixed seeds; `test/test_autopick_pref.mjs` (73 checks) under 8 seeds; real Chrome at 1280×720, 844×390 and 390×844 with real taps and clicks (OFF holds, WAIT 4s picks at 4.1 s, the row leaves with the pick, nothing scrolls, the switches never move, 0 console errors); an independent review, whose three findings (the O key race, the stall watchdog beating the countdown, a switch moving under the finger) are fixed and tested.

## The release before: the play-test fixes (2026-10-03, `ce40d72`)
From Steve's play test of the live build: FOCUS and STANCE chips on the desktop key bar; the escape cinematic's skip rules; the elite modifiers left the shop for the kill trophies, with refunds; the end card after a quick death; the fusion banner wraps; a hero inside a building's collision ring steps out; the tests that failed at random. `test/_seed_random.mjs` replays a run under a fixed seed: `HORDES_RNG=3 node --import ./test/_seed_random.mjs test/<file>`; the whole suite: `NODE_OPTIONS="--import=./test/_seed_random.mjs" HORDES_RNG=3 node tools/run_suite.mjs --par 4`. The details are in that commit's message.

## On `claude/overhaul`, not live yet
Nothing.

## How a release is made
Release procedure, in `D:\hordes-release`: `git fetch github main` (must equal the branch head) → tag the live commit → `commit=$(git commit-tree "$(git rev-parse claude/overhaul^{tree})" -p HEAD -F <message file>)` → `git merge --ff-only "$commit"` → `git diff HEAD claude/overhaul` must be empty → grep the tree for server details (the patterns are in the local checkpoint) (must be none) → `git push github HEAD:refs/heads/main` and the tag → wait for Pages (poll a marker in `src/main.js`) → check the live site in headless Chrome.

## For Steve
1. The review's open decisions: 2 (the Straight Flush payout), 3 (the music and sound source and spend) and 5 (the art tone). R1 can start once 2 is settled.
2. Elite variety is still "variety, not gold": a swift or splitting elite pays what a plain one does. Paying a little more for a modified elite would turn the new threat into a risk worth taking; that needs a balance pass. Steve, 2026-10-03: "not right now".
3. Still his to look at: the escape cinematic by ear; wrath (the hidden tax on evolving weapons and filling slots) is named in the reference but removing it is a balance project.

## Next
- R1 from the review: the October comments and the returning-player bug (for a returning player the What's New note and the draft coach open together over the first draft).
- M4 engine (sim extraction, fixed timestep, seeded randomness, mode state machine), M5 content (enemy behaviours, stage hazards and signature bosses, character rules, relics), M6.
- Watch for player feedback on galaxy.click.

## Still open (not blockers)
- A hero inside the opened yard with a horde at the gate still dies fairly often.
- Background play was not checked in a real hidden browser tab.
- Contrast margins on the three bright stages are inside the tested limits but thin.
- Pyraxis keeps her distance: an unupgraded build takes about 100 s to kill her on wave 4.
- Portal and death cinematics are still cut for every run with AUTO-CONTINUE on (only the escape got the "is the player there" rule).
- The toast feed holds three lines: on arrival at a new stage a finished quest's line can push the portal's line out (the wave line still names the stage).

## Standing rules (also in Claude's memory)
- Opus 5.5; workflows only when Steve opts in; at most one subagent at a time. Keep two CPU cores free (tests `--par 4`, sims `--concurrency 8`, one headless Chrome at a time). Never open windows on Steve's screen.
- Run 1 stays lethal; early weakness is deliberate; pacing docs are unreliable; the tutorial teaches by doing; "is it fun to play" decides.
- Nothing goes to `main` without Steve's OK, except urgent fixes he asked for. A bug he reports is not by itself an OK to push the fix.
