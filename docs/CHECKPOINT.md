# HORDES overhaul — checkpoint (2026-10-03: the play-test fixes release)

## Where everything is
| What | Where | State |
|---|---|---|
| Live game (players, galaxy.click) | GitHub `sk408/hordes` `main` | The release made from this tree: the play-test fixes below, on top of `10a9768` (the world update plus the phone shop layout). Shipped 2026-10-03 with Steve's OK ("lets push those things to main"). |
| Rollback points | tags `phone-shop-2026-10-03` (= `10a9768`), `world-update-2026-10-03` (= `349e83b`), `pre-world-update-2026-10` (= `df10edc`, the October 2 release), `pre-overhaul-2026-10` | All on GitHub. The pre-overhaul game is still at `/classic/`. |
| Release branch | `D:\hordes-release`, branch `release/overhaul-1` | One squashed commit per release, each with the working branch's exact tree. |
| Working branch | `D:\hordes-claude`, branch `claude/overhaul` | Same content as `main` plus checkpoint commits (docs only). Its history is not on GitHub (old checkpoint commits hold server details): release by squashing, never by pushing this branch. |
| Test build | https://claude.stevesinfo.com:8443/hordes-claude/ | Follows `claude/overhaul`; the update steps are in the local checkpoint. |
| Plan | `docs/OVERHAUL_PLAN.md` | Done: M0–M3, M2b, M3b, M5a, M5b. Left: M4 engine, M5 content, M6. |

## The play-test fixes (all from Steve's play test of the live build, 2026-10-03)
1. **Desktop key bar: FOCUS and STANCE chips** (`dd74d7e`). Steve: "in desktop, i didn't see a way to switch to greedy or safe". The bar had neither; G and TAB worked and nothing said so. Now `TAB FOCUS <value>` and `G STANCE <value>` beside PILOT, clickable, stance tinted by risk. The bar sheds words at 1099 / 930 / 825 px wide so no chip is clipped.
2. **Escape cinematic** (`3306ed4`). Steve: "it just skipped really fast. i dont own the writ". Two causes fixed: any key or tap skipped it 0.4 s in (now: first press raises a SKIP prompt for 2.5 s; ESC / ENTER / SPACE or a tap on SKIP while it is up skips), and AUTO-CONTINUE cut it for every run (now only for a run auto-continue started with no input since, or a hidden tab).
3. **Elite modifiers left the shop** (`73c1ad8`). Steve: "it seems like the elites upgrades in the shop purchase themselves", then "it makes no sense to be in the shop". The 100 / 1,000 / 10,000-kill trophies granted the 3,000 / 6,000 / 10,000-gold rows for nothing, announced only by a toast the end screen wipes. Now: no elite rows (45 → 42 shop rows); the trophies bring the modifiers as their own unlock kind; the end card says `TROPHY: …`, `TROPHY REWARD, FREE: …`, `NEW THREAT: Elites can be SWIFT: …`; a weapon a trophy gave reads `OWNED · trophy reward`; gold paid for an elite row is refunded (exact from the spend ledger; at the last price for a purchase older than the ledger when the trophy is not earned), with a title notice. No save schema change (still v13).
4. **End card after a quick death** (same commit). A run that ended before any other menu opened kept the title screen's layout on the end card: no backdrop, summary under the buttons and 72–150 px off the bottom of a phone. Fixed; measured at six sizes.
5. **The fusion banner** (`bca96c3`). Steve: "the fuse weapon message is larger than the screen". The first-time FUSION and EVOLUTION banners carry the weapon's whole description on the sub line (up to 129 characters, 709 px in a 480 px view) and painted it as one line off both edges. It wraps now.
6. **A hero inside a building's collision ring steps out** (same commit). From inside a ring the pilot could never move (every stride still touched). Walking cannot put the hero there, so play is unchanged; found through a test that placed him there on one map in twenty-four.
7. **Tests that failed at random** (`4418b6a`, `72f75a5`, `bca96c3`). Not load flakes, as this file said before. Causes: world sites (a leftover walled yard, a shrine blessing, a brazier's drop) meeting older tests that assumed an empty field, a quest toast, a gem inside the pickup radius, an unanswered evolve offer, and item 6. Fixed in pilot_nostall, building_collision, frost_card, rss8_magnet, travel, audit_m3, terrain. `test/_seed_random.mjs` replays a run: `HORDES_RNG=3 node --import ./test/_seed_random.mjs test/<file>`; the whole suite under one seed: `NODE_OPTIONS="--import=./test/_seed_random.mjs" HORDES_RNG=3 node tools/run_suite.mjs --par 4`.

Checks on `bca96c3`: suite 217/217 at `--par 4`, and again under six fixed seeds; real Chrome: key bar at 11 widths, cinematic skip on desktop and with real touches, end card at six sizes with 0 / 2 / 3 trophy lines, refund notice from a real v10 save, fusion offer and banner at four sizes; soak of a whole run (14 game minutes on desktop, 8 at phone size), 0 console errors.

## How a release is made
Release procedure, in `D:\hordes-release`: `git fetch github main` (must equal the branch head) → tag the live commit → `commit=$(git commit-tree "$(git rev-parse claude/overhaul^{tree})" -p HEAD -F <message file>)` → `git merge --ff-only "$commit"` → `git diff HEAD claude/overhaul` must be empty → grep the tree for server details (the patterns are in the local checkpoint) (must be none) → `git push github HEAD:refs/heads/main` and the tag → wait for Pages (poll a marker in `src/main.js`) → check the live site in headless Chrome (scripts in the session scratchpad: `live_check.mjs`, `live_check_shop.mjs`, `desk_hud.mjs --live`, `escape_skip_chrome.mjs --live`).

## For Steve
1. Elite variety is still "variety, not gold": a swift or splitting elite pays what a plain one does. Paying a little more for a modified elite would turn the new threat into a risk worth taking; that needs a balance pass. Steve, 2026-10-03: "not right now".
2. From the last checkpoint, still his to look at: the escape cinematic by ear; wrath (the hidden tax on evolving weapons and filling slots) is named in the reference but removing it is a balance project.

## Next
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
- Nothing goes to `main` without Steve's OK, except urgent fixes he asked for.
