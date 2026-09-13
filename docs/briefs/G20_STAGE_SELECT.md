# BRIEF — G20a: PLAYER-SELECTED STAGES (slice 1: the system + 3 stages)

You are a Hermes builder working on the HORDES game at `/home/claude/projects/hordes`.
Read `docs/HORDES_GOALS_2026-09-12.md` section **G20** first: this brief implements its
first slice. A later, data-only pass adds stages 4-8 — build the SYSTEM so that adding a
stage is one new row plus nothing else.

## HOUSE RULES (non-negotiable)
- No `git commit/checkout/reset/stash/clean`. Leave the tree dirty; the orchestrator commits.
- No emojis anywhere (code, UI, comments, commit-adjacent text).
- Integer pixels, no smoothing, no blur. Nothing may assume a fixed dt: 60Hz and 120Hz must both be correct.
- **Single writer.** You own: `src/stages.js` (NEW), `src/main.js`, `test/test_stages.mjs` (NEW),
  `docs/briefs/` nothing, `tools/verify_g20_stages.mjs` (NEW), and `index.html` ONLY if a CSS line is
  genuinely required. Do not touch `render.js`, `entities.js`, `heat.js`, `challenges.js`,
  `achievements.js`, `meta.js` or any other table.
- Never weaken or delete an existing test assertion. Stdlib only (node builtins), no new deps.
- Do NOT tune global balance. If a change would alter a STANDARD run's numbers, it is wrong.

## WHAT TO BUILD
1. **`src/stages.js` — a new pure, declarative module, modelled EXACTLY on `src/challenges.js`**
   (`src/challenges.js:1-45` is your template: pure data + pure helpers, no DOM, no game-state reads,
   total on garbage input, session-scoped, NOTHING persisted, no schema bump, no storage key).
   Export a `STAGES` array (3 entries for this slice), `STAGE_IDS`, `STAGE_BY_ID`,
   `DEFAULT_STAGE_ID = 'VERDANT_HOLLOW'`, and a `stageOf(id)` that degrades to the default stage.
   Each row: `{ id, name, blurb, theme, pool: [[typeId, weight], ...], mods: {...}, hazard: {...},
   unlock: { achievementId } | null }`.
   - `theme` — an index into the EXISTING ladder `CONFIG.GROUND.THEMES` (`src/config.js:310-330`,
     5 entries today: VERDANT HOLLOW / ASHEN WASTE / SNOWFIELD / BLOOD RUST / BONE DESERT).
     Do not author new palettes in this slice; picking an existing theme is the retint.
   - `pool` — `[typeId, weight]` pairs using ONLY the real ids in `src/enemy_types.js:37-154`:
     `CHASER, SWARMER, BRUTE, SPITTER, DASHER, WARLOCK, TICK, COLOSSUS` (PILLAR is scenery, never spawnable).
   - `mods` — at least two of `{hpMult, dmgMult, spawnMult, speedMult, packMult}`. All 1.0 is legal
     for stage 0 only.
   - `hazard` — ONE signature mechanic per stage, expressed through a system that ALREADY exists:
     a spawn band/ring, an elite-rate bump, a locked weather, a shrine rate, or a pack-size change.
     A `{id, kind, ...params}` record is enough; wiring is in `main.js`. Do not build new spawn code.
   - `unlock` — `{ achievementId }` naming an EXISTING id from `src/achievements.js:62-104`
     (e.g. `FIRST_BOSS`, `WAVE_5`, `KILLS_1000`, `CHESTS_25`, `FIRST_EVOLUTION`). **NEVER invent an
     achievement id**, and never add a persisted field: the gate is read with
     `isEarned(profile, id)` (`src/achievements.js:219`). Stage 0 is ungated (`unlock: null`).

2. **Stage 0 MUST be an exact parity with today's game.** Stage `VERDANT_HOLLOW` = theme index 0,
   all mods 1.0, and a pool whose per-wave result is IDENTICAL to the shipped chooser
   `pickSpawnType(wave)` at `src/main.js:480-493` (weights `C.SPAWNER.CHASER_WEIGHT` etc., gates
   `SWARMER_WAVE`, `BRUTE_WAVE`, `DASHER_WAVE`, `SPITTER_WAVE`, `WARLOCK_WAVE`, `TICK_WAVE`,
   `COLOSSUS_WAVE`). Prove it with a parity assertion, not a comment: the test compares stage 0's
   resolved weight vector against the literal shipped table at waves 1 and 15.

3. **The ONE spawn seam.** `pickSpawnType(wave)` (`src/main.js:480-493`, called at `:539`) must read
   the live stage's pool and mods through the stage module; keep the function's contract (`-> typeId`)
   and keep the wave gates. `state.stage` is set in `startRun` and reset like the other run-scoped
   fields. For any other stage, the wave gates still apply (`COLOSSUS` must not appear at wave 1).

4. **The stage selector rides the EXISTING title menu — do NOT add a new screen mode.**
   `src/main.js:3320-3324` already renders a cycling `CHALLENGE` card
   (`menuCard('CHALLENGE', describeChallenge(pendingChallenge) + ' · press to change', ...)`) driven by
   `nextChallengeId()` (`:2623-2626`), stamped onto the run at `:3743` (`state.challenge = pendingChallenge`).
   Mirror that pattern exactly for STAGE: a module-level `let pendingStage`, a `nextStageId()`-style
   cycler that SKIPS locked stages, a menu card whose blurb names the live stage and (when locked
   stages exist) their requirement in plain words. Starting a run with the default stage must produce
   byte-identical behaviour to today. Because you add no screen mode, the chrome gate
   (`chromeOn`/`syncChrome`, `src/main.js:4781-4804`) needs no change — say so in your report.

5. **The run must know its stage.** `state.stage = pendingStage` in `startRun` (beside `:3743`), plus a
   run-scoped reset, plus the stage name in the run-end summary beside the challenge label
   (`src/main.js:2358-2362`). NOTHING about a stage run is persisted: a reload returns to the default.

## THE 3 STAGES (mechanics, not reskins)
Each must differ in MECHANICS, not only in tint. Suggested shape, adapt the numbers to the real
tables and REPORT what you actually shipped:
- `VERDANT_HOLLOW` — today's game. No mods, no hazard, slot-theme 0. The baseline.
- `ASHEN_WASTE` — theme 1. Pool weighted toward the DASHER/BRUTE charge family (fewer ranged types),
  `dmgMult > 1`, and a hazard that raises the ELITE rate (or locks weather) so the arena reads as
  more aggressive. Must be reachable for a new player only after a real milestone (`FIRST_BOSS`).
- `SNOWFIELD` — theme 2. Pool weighted toward SPITTER/WARLOCK ranged pressure, `hpMult > 1` with
  `spawnMult < 1` (fewer, tougher foes), and a hazard that changes how the swarm arrives
  (a tighter spawn band, or packs). Gated behind a later milestone (`WAVE_5` or `KILLS_1000`).

## ACCEPTANCE BAR (numbers, not intentions)
- `bash /tmp/run_all.sh` => **FAIL=0, three consecutive runs**, with `test/test_stages.mjs` added to it.
- `node test/test_stages.mjs` standalone passes, and asserts ALL of:
  (a) stage 0 parity against the shipped weight table at wave 1 and wave 15;
  (b) every stage's `pool` ids are legal `ENEMY_TYPES` ids and every weight is a positive finite number;
  (c) `stageOf('nonsense')` returns the default stage and never throws;
  (d) a LOCKED stage cannot be selected by the cycler on a fresh profile, and CAN on a profile where
      the gating achievement is earned (`isEarned`);
  (e) mods are applied at the real seam (a stage with `hpMult` 1.5 produces 1.5x a spawned foe's hp
      and 1.0x on stage 0), and the wave gates still hold for a stage pool;
  (f) 60Hz and 120Hz produce the same stage-driven outcome for anything dt-driven.
- `node tools/verify_g20_stages.mjs` — a REAL-browser verifier following the floorplan of
  `tools/verify_g14_shop_icons.mjs` (it drives the real game and reads pixels/DOM back; do not
  reinvent it): the STAGE card is visible and cycles, the blurb names the live stage, a REAL tap
  starts a run, the in-run stage matches, and the locked stages are not offered on a fresh profile.
  Save the phone capture to `docs/art/browser-verify-2026-09-12/g20-stages-phone.png` at
  **390x844 @ dpr3 (1170x2532)** and print its real dimensions from the file, not from your intent.
- There is NO vision model on this host: assertions must be geometry, DOM state, canvas
  `getImageData` samples and real taps. "Looks right" is not evidence.

## OUT OF SCOPE (do not do these)
- Stages 4-8, per-stage item/reward pools, per-stage enemy catalogs, new art palettes or new sprites.
- The Hyper/Inverse/Endless-style MODIFIER axis: `src/heat.js` (opt-in difficulty that pays) and
  `src/challenges.js` (rule-changing modes) already own those axes. Do not duplicate them, do not
  add a difficulty dial, and do not add stage gold multipliers/penalties (that is G17's economy call).
- Anything that changes STANDARD numbers: if the parity test in (a) cannot pass without changing a
  shipped constant, stop and report instead of editing the constant.

## LOCK
Take the repo lock for the edit window and release it when done, both from `/home/claude/projects/hordes`:
`~/projects/agent-hub/sdk/agentlock status` then
`AGENT_HUB_PARTICIPANT=cli:glm-hordes-g8 ~/projects/agent-hub/sdk/agentlock acquire --note "g20 stages"`.
If it reports HELD, STOP and report the owner.

## REPORT BACK (on #hordes, then end)
One message: `G20a` + what landed (files and line numbers), the 3 stages and each one's real mechanic,
the parity numbers you measured, `run_all.sh` FAIL=0 x3 result, `test_stages.mjs` check count,
`verify_g20_stages.mjs` PASS/FAIL + the PNG's real dimensions, and a plain list of anything you could
NOT verify. A green suite is required; a claim without a number is not.
