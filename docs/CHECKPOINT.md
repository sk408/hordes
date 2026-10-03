# HORDES overhaul — checkpoint (2026-10-03, end of the night session)

## Where everything is
| What | Where | State |
|---|---|---|
| Live game (players, galaxy.click) | GitHub `sk408/hordes` `main` = `df10edc` | October 2 release + pilot redraw + portal fix + save guard. **Nothing was pushed tonight.** Previous live tagged `pre-overhaul-2026-10`; old game at `/classic/`. |
| Release branch | `D:\hordes-release`, branch `release/overhaul-1` | Same as `main`. Hotfixes only; then `git push github HEAD:refs/heads/main`. |
| Working branch | `D:\hordes-claude`, branch `claude/overhaul` = `823dabd` plus checkpoint commits (docs only), tree clean | All unreleased work. |
| Test build | https://claude.stevesinfo.com:8443/hordes-claude/ (same commit as the working branch) | Follows the working branch; the update steps are in the local checkpoint. |
| Plan | `docs/OVERHAUL_PLAN.md` on the working branch | Done: M0–M3, M2b, M3b (escape cinematic), M5a (boss rules, travel), M5b. Left: M4 engine, M5 content, M6 release candidate. |

## What is on `claude/overhaul` and not live
- Idle layer: background play, auto-continue, away summary, the camp (save v12).
- World: sites, fog and waypoints, EXPLORE pilot (default), elevated terrain, vault, yard, secrets, quests and chains (save v13); world art makeover.
- All 41 review findings fixed, plus tonight's work below.

## Tonight (2026-10-03)
Verification and fixes
- Camp clock fix re-verified by probe; `d6d14f9` a built building whose stamp was lost starts counting.
- EXPLORE had lost its early blessing after the release fixes (median of runs 11–15: 466 → 235 s; bisected to `3c8043f`). `5c6ee27`: the first shrine of every run stands 200–300 px from the start.
- Real Chrome: a v11 and a v10 save both load cleanly on the working branch (refund paid once, backup intact, no errors).
- `f3c8895` save restore keeps the save with more runs played; quest tracker hidden during the guided tutorial; the away summary's hint removed (it covered the heading on a phone).
- `c404d5b` quests that can no longer be finished show CLOSED.
- `a3692a2` the hero stays findable: only the body blinks after a hit, the white hit flash is solid, a cyan arrow shows over the head when hurt or surrounded.
- What's-new note and `RELEASE_NOTES.md` written for the next release ("the world update").

New
- **Escape cinematic** (plan M3b, merge `ed589ab`): a 9 s pseudo-3D chase replaces the escape minigame. The run's pilot runs at the camera, the enemy types met in the run close in, the wave boss rises over the horizon and lunges as he dives through the portal. Skippable after 0.4 s; always pays; instant in a hidden tab or an unattended run; still card under reduced motion. Escape Writ (same shop row) now adds 50%. Auto-continued runs bank it at their 50% cut. `src/escape_cine.js`, `src/escape_cine_art.js`, `src/escape_payout.js`, `test/test_escape_cine.mjs` (32 checks), frames in `docs/art/escape/`.
- **Boss rules** (plan M5a, `docs/BOSS_RULES.md`): from wave 2 each wave boss brings one of six named rules and a stated reward. Wave 1 is unchanged. New joker: Rulebreaker.
- **Travel** (plan M5a, `docs/TRAVEL.md`): after waves 2 and 4 the portal leads on to another stage (new ground, sites and enemies; the build, quests and loot carry over). CONTINUE travels, STAY HERE keeps the field.
- `tools/soak_run.mjs`: a whole run in real Chrome, end to end. Desktop and phone runs of 14 game minutes: no console errors.

Numbers
- Suite: 218 files; 217–218 green at `--par 4` (the reds are load flakes that pass alone).
- Career sims, 16 seeds: boss rules leave runs 1–10 unchanged and lengthen runs 11–15 by about a fifth (225 → 271/274 s); travel changes nothing measurable.

## For Steve to decide
1. **Ship `claude/overhaul` to `main`?** Before pushing: set `WHATS_NEW.id` and `dateMs` in `src/main.js` to the ship day.
2. **Boss rules are a small net gain** for the player (rewards outweigh the rules). Fine as is, or trim the rewards (`BOSS_RULES` in `src/boss_rules.js`).
3. **Escape Writ** costs 15,000 and now adds 50% to the escape gold (best run gold / 15, once per run): slow to pay back. Cheaper, or a bigger bonus?
4. **Heat and the challenge modifiers** are still in the game; the plan had boss rules replace them. Removing them touches saves and trophies.
5. **Quest gold** still skips the shop gold multiplier, rampage and heat.
6. The travel intermission has nine cards; on a phone the ninth scrolls. The three chest cards could become one.

## Next steps
1. Steve plays the test build: the escape cinematic in motion and with sound (not checked by ear), a run to wave 3+ for rules and travel.
2. With his OK: ship to `main`.
3. Then M4 engine (sim extraction, fixed timestep, seeded randomness, mode state machine), M5 content (enemy behaviours, stage hazards and signature bosses, character rules, relics), M6 release candidate.

## Still open (not blockers)
- A hero inside the opened yard with a horde at the gate still dies fairly often.
- Background play was not checked in a real hidden browser tab.
- Contrast margins on the three bright stages are inside the tested limits but thin.
- Pyraxis keeps her distance: a weak build takes about 100 s to kill her on wave 4.
- Load flakes (pass alone): test_camera_deadzone, test_audit_m3, test_e2_horde, test_terrain, test_m3_first_minutes, test_frost_card, test_pilot_nostall.

## Standing rules (also in Claude's memory)
- Opus 5.5; workflows only when Steve opts in; at most one subagent at a time. Keep two CPU cores free (tests `--par 4`, sims `--concurrency 8`, one headless Chrome at a time). Never open windows on Steve's screen.
- Run 1 stays lethal; early weakness is deliberate; pacing docs are unreliable; the tutorial teaches by doing; "is it fun to play" decides.
- Nothing goes to `main` without Steve's OK, except urgent fixes he asked for.
