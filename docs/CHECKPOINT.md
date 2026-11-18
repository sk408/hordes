# HORDES overhaul — checkpoint (2026-11-18: the music and service worker release)

## Where everything is
| What | Where | State |
|---|---|---|
| Live game (players, galaxy.click) | GitHub `sk408/hordes` `main` | The release made from this tree: recorded music from Google Lyria (Steve's picks) and the service worker (an offline copy and a NEW VERSION READY notice), on top of `423b318` (the draft auto-pick switches, 2026-11-17). Shipped 2026-11-18 with Steve's OK ("ok ship it with the service worker when it's done"). |
| Rollback points | tags `auto-pick-2026-11-17` (= `423b318`), `play-test-fixes-2026-10-03` (= `ce40d72`), `phone-shop-2026-10-03` (= `10a9768`), `world-update-2026-10-03` (= `349e83b`), `pre-world-update-2026-10` (= `df10edc`, the October 2 release), `pre-overhaul-2026-10` | All on GitHub. Every one predates the service worker: a rollback to any of them must put `tools/sw_killswitch.js` at `sw.js` (see the hard rules below). The pre-overhaul game is still at `/classic/`. |
| Release branch | `D:\hordes-release`, branch `release/overhaul-1` | One squashed commit per release, each with the working branch's exact tree. |
| Working branch | `D:\hordes-claude`, branch `claude/overhaul` | Anything ahead of `main` is listed under "On `claude/overhaul`, not live yet". Its history is not on GitHub (old checkpoint commits hold server details): release by squashing, never by pushing this branch. |
| Test build | https://claude.stevesinfo.com:8443/hordes-claude/ | Follows `claude/overhaul`; updated with this release (same tree). It runs the service worker too, so its next update shows the NEW VERSION READY notice. The update steps are in the local checkpoint. |
| Plan | `docs/OVERHAUL_PLAN.md`; the November review `docs/REVIEW_2026-11.md` | Done: M0–M3, M2b, M3b, M5a, M5b; from the review, the music (decision 3) and the R4 service worker. Next: R1, the first of the review's seven small releases. |

## What shipped on 2026-11-18
1. **Recorded music from Google Lyria.** Eleven slots: title and menus; four run tracks by stage group (wilds: VERDANT HOLLOW, SNOWFIELD, WHITEOUT; ash: ASHEN WASTE, BLOOD RUST, CINDER MAW; THE BONE DESERT; void: THE VOID REACH and every wave after the Maw); boss (herald too); the Maw; the escape chase; portal, victory and game-over cues. 6.2 MB in `assets/music/`, fetched one at a time after the first frame, only when needed; the synth is the fallback (no file, not loaded yet, a failed fetch) and the ADVANCED option MUSIC: RECORDED / CLASSIC SYNTH gives the old synth. Run -> boss switches on the next beat, back after a 1-bar debounce; title -> run is a 1 s crossfade; drafts keep the bed, pause screens duck it; the portal movie ducks under its cue; the escape has its own loop (the synth STEP bed is muted under it); death plays the game-over cue, then the title on the end card. Loudness measured in real Chrome: recorded beds sit 3 dB above the synth (MUSIC_TRIM_DB -4.2).
   - **The takes are Steve's picks** (by ear on the listening page https://claude.ai/artifact/TTcb6f85cu3Ew9ziHYTeEV, saved in its db collection `picks`): the recommended take in eight slots, maw t5, escape t2 and portal t3 in the other three. Picks file: `D:\hordes\music_lyria_2026-11\picks_steve.json`; `node tools/music_import.mjs <picks.json>` swaps takes (it derives each loop's exact tempo from its whole bar count, and regenerates `sw.js`).
   - Made with Lyria 3 Pro ($3.88 for 53 songs; Steve's key and billing); every raw take, prompt, report and tool is archived outside git in `D:\hordes\music_lyria_2026-11\` (the model is experimental: takes cannot be remade). Credits: `assets/music/CREDITS.md`.
2. **The service worker** (`sw.js`, the review's R4 item, pulled forward: "service worker sounds like a good idea"). One cache per release, filled at install with every game file checked against the SHA-256 that `tools/gen_sw.mjs` writes into `sw.js`; a release enters its cache whole or not at all. Music is cached by its hashed name when played. A new release installs in the background and waits; the page shows NEW VERSION READY · TAP TO RELOAD outside runs; it takes over on that tap, an untouched F5, or once no HORDES tab is open, and never reloads a live run. `index.html` shows LOADING… until the first frame and a tap-to-reload screen if its own game files fail to load. Kill switch: `tools/sw_killswitch.js`. The rules are under "How a release is made".
3. **The review's decisions, all settled** (Steve, 2026-11-17; logged in `docs/REVIEW_2026-11.md`): 2 Straight Flush as recommended; 3 music from Google Lyria; 4 `assets/` with CREDITS and one OFL pixel font I pick; 5 art tone as recommended, terrain relief stays off for movement and returns in R6 as light and shadow only if the sheets say so; 6 showpiece art is my call ("can source more too"); 7 the loadout was meant to list the weapons a run can offer, not hand them out ("just hadn't gone back to fixing it"): weapons come from drafts again, in R1; 8 my call: no auto-continue penalty for the first 3 unattended runs in a row, then 25% (was 50%), cap 20 stays; 9 no synth stopgap.

Checks before the push: suite 222/222 at `--par 4`, also under fixed seeds; `test/test_music_files.mjs` (21) and `test/test_music_wiring.mjs` (6); `test/test_sw.mjs` (37, the real worker in node:vm), `test/test_boot_guard.mjs` (34), `test/test_sw_manifest.mjs` (26); 14 mutations of the service-worker fixes, all caught. Real Chrome: `tools/verify_music.mjs` 30/30 at 390x844 and 1280x800 with the real tracks; `tools/verify_sw.mjs` 87/89 (the two misses are older title tools that still look for a START GAME card, now PLAY; they fail the same way without this work). Six independent reviews (three of the music, three of the worker: versions, platforms, flows); every finding fixed, except one documented trade-off (the quota rule below).

## The releases before
- **The draft auto-pick switches** (2026-11-17, `423b318`): AUTO-PICK ON/OFF (key U) and WAIT 6 -> 1 s (key T) on the level-up draft and the evolve offer, both remembered; the November review and plan.
- **The play-test fixes** (2026-10-03, `ce40d72`): FOCUS and STANCE chips on the desktop key bar; the escape cinematic's skip rules; the elite modifiers moved to the kill trophies, with refunds; the end card after a quick death; the fusion banner wraps; a hero inside a building's collision ring steps out. `test/_seed_random.mjs` replays a run under a fixed seed: `HORDES_RNG=3 node --import ./test/_seed_random.mjs test/<file>`; the whole suite: `NODE_OPTIONS="--import=./test/_seed_random.mjs" HORDES_RNG=3 node tools/run_suite.mjs --par 4`.

## On `claude/overhaul`, not live yet
Nothing.

## How a release is made
**On `claude/overhaul` (from R4, the service worker `sw.js`):**
- After any change to a precached file (`index.html`, `manifest.webmanifest`, anything in `src/`, `assets/` outside `music/`), run `node tools/gen_sw.mjs` and commit `sw.js` with the change. The suite goes red otherwise (`test/test_sw_manifest.mjs`). `tools/music_import.mjs` regenerates it by itself.
- If `sw.js`, index.html's `BOOT AND UPDATES` script, `tools/gen_sw.mjs` or `tools/browser.mjs` changed, also run `node tools/verify_sw.mjs` (real Chrome, flows C1 to C11; one headless Chrome at a time). Do this in any case before the first R4 release.

**Release procedure, in `D:\hordes-release`:**
1. `git fetch github main` (must equal the branch head).
2. Tag the live commit.
3. `commit=$(git commit-tree "$(git rev-parse claude/overhaul^{tree})" -p HEAD -F <message file>)`, then `git merge --ff-only "$commit"`.
4. `git diff HEAD claude/overhaul` must be empty.
5. **(R4)** `node tools/gen_sw.mjs --check` and `node test/test_sw_manifest.mjs`, both run in `D:\hordes-release` on the exact tree that ships. Both must pass.
6. **(R4)** `test -f sw.js`. From R4 on, every release has a real `sw.js`: the worker or the kill switch.
7. **(R4)** If `sw.js` has `URGENT = true`, the release message says why, and Steve's OK covers it.
8. **(R4)** Put `SW <VERSION>` in the release message (`node tools/gen_sw.mjs --print-version`).
9. Grep the tree for server details (the patterns are in the local checkpoint) (must be none).
10. `git push github HEAD:refs/heads/main` and the tag.
11. **(R4, changed)** Wait for Pages by polling `https://sk408.github.io/hordes/sw.js?t=<now>` until its `const VERSION = '<v>'` line matches (this replaces the `src/main.js` marker). With the kill switch, poll for `HORDES KILL SWITCH`.
12. **(R4)** `node tools/verify_sw.mjs --live https://sk408.github.io/hordes/ --expect <v>` (`--expect KILL` for the kill switch). Node fetches every FILES path with `?v=<v>` and compares hashes; then a fresh headless profile loads the page twice: the second load must be controlled, `caches.keys()` must hold `hordes:/hordes/:<v>`, 0 console errors. It retries every 30 s for up to 15 minutes while the CDN settles. If it fails, returning players stay on the previous release: fix forward.
13. Check the live site in headless Chrome as usual.

**Service worker hard rules:**
- Never delete or rename `sw.js`, and never change the `register('sw.js')` path or the scope. A 404 on `sw.js` leaves the old worker serving its old release forever.
- Rolling back to a tag from before R4 (`play-test-fixes-2026-10-03` or older) must put `tools/sw_killswitch.js` at `sw.js` in the rollback release. Otherwise every player with a worker stays on the R4 release.
- Local hosts and any tree served under a path ending in `-dev/` (the live-edited `/hordes-dev/`) never get the worker without `?sw=on`: the page does not register there and unregisters an old registration, and `sw.js` serves such pages from the network. A `?dev=1` run registers nothing anywhere.
- Known cost of the quota rule: when a new install still finds no room after dropping the music, it drops every HORDES cache, including the active release's. A page of that release still fetching its modules at that moment gets the rest from the network (possibly the new release) with no `controllerchange`, so G1 does not reload it; if the mix breaks the boot, the player gets the tap-to-reload screen. Chosen over holding a full-disk player on the old release for good.
- `URGENT = true` and the kill switch are emergency tools. They need Steve's OK like any release, and `URGENT` goes back to `false` in the next release. Recovery, least to most drastic: the player's tap on the failure screen (takes a waiting fix, or drops the offline copy for that session); a fixed release; `URGENT = true`; the kill switch (copy `tools/sw_killswitch.js` over `sw.js` and release; to turn the worker back on, restore `sw.js` from git and run `node tools/gen_sw.mjs`).

**First R4 rollout:** if Steve agrees, ship to the test build first through its usual update path and run `verify_sw.mjs --live` against it, with one practice update A to B and one practice kill there. No player has a worker yet, so the first release only adds `register()`, 3 s after the first frame; `tools/sw_killswitch.js` ships in the same release.

## For Steve
1. The first update after this release is the first one players receive through the service worker: their open game shows NEW VERSION READY. If anyone reports being stuck on an old version, the recovery steps are under the hard rules above.
2. Elite variety is still "variety, not gold": a swift or splitting elite pays what a plain one does. Paying a little more for a modified elite would turn the new threat into a risk worth taking; that needs a balance pass. Steve, 2026-10-03: "not right now".
3. Still his to look at: the escape cinematic by ear; wrath (the hidden tax on evolving weapons and filling slots) is named in the reference but removing it is a balance project.

## Next
- R1 from the review ("Listening"): the returning-player bug (the What's New note and the draft coach open together over the first draft) and a "Pick 1" header; weapons from drafts (decision 7); the auto-continue penalty (decision 8); Straight Flush (decision 2); no duplicate portal movie at wave 1; red-orange enemy orbs; a sound mix pass; a let-down sound for an empty chest; LOADING and load-failure polish; a sound listening page; the store text and replies to the October commenters.
- M4 engine (sim extraction, fixed timestep, seeded randomness, mode state machine), M5 content (enemy behaviours, stage hazards and signature bosses, character rules, relics), M6.
- Watch for player feedback on galaxy.click.

## Still open (not blockers)
- `tools/verify_g12_title.mjs` and `tools/verify_host_fit.mjs` still look for the title's old START GAME card (it is PLAY now) and fail; `tools/verify_sw.mjs` C11 reruns them.
- The service worker's update path (A to B on a real host) and its kill switch were checked in real Chrome on a local server, not yet on a real host: the first test-build update after this release is the practice A to B.
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
