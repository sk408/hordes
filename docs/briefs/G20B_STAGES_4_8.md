# BRIEF — G20b: PLAYER-SELECTED STAGES (slice 2: stages 4-8, the full 8-stage ladder)

You are a Hermes builder working on the HORDES game at `/home/claude/projects/hordes`.
Read `docs/HORDES_GOALS_2026-09-12.md` section **G20** first — this brief implements the slice its
own text calls "REMAINS OPEN: stages 4-8". Read `docs/briefs/G20_STAGE_SELECT.md` second: that was
slice 1 and its acceptance bar still binds you.

## ABSOLUTE PRE-CONDITIONS (do these first, in this order)
1. Read `src/stages.js` (154 lines, landed by slice 1) and `src/main.js:486-620` (the ONE spawn seam
   and its hazard wiring) before writing anything. Slice 1's work is **UNCOMMITTED in the working
   tree** — it is correct and verified (suite PASS=73 FAIL=0 x3, `tools/verify_g20_stages.mjs` PASS
   in a real browser). **Do not revert, refactor or "clean up" it. Build on top of it.**
2. Take the repo lock before editing and STOP if it is HELD by another owner:
   `cd /home/claude/projects/hordes && AGENT_HUB_PARTICIPANT=cli:glm-hordes-g8 ~/projects/agent-hub/sdk/agentlock acquire --note "G20b stages 4-8"`
   Release it with `~/projects/agent-hub/sdk/agentlock release` when your edits are done.

## HOUSE RULES (non-negotiable)
- No `git commit/checkout/reset/stash/clean`. Leave the tree dirty; the orchestrator commits.
- No emojis anywhere (code, UI, comments). Integer pixels, no smoothing, no blur. 60Hz AND 120Hz must
  both be correct: nothing may assume a fixed dt.
- **Single writer.** You own EXACTLY: `src/stages.js`, `src/main.js`, `test/test_stages.mjs`,
  `tools/verify_g20_stages.mjs`, `index.html` (CSS only, and only if genuinely required). Touch
  NOTHING else — not `render.js`, `entities.js`, `heat.js`, `challenges.js`, `achievements.js`,
  `meta.js`, `enemy_types.js`, `config.js`, `weather.js`, `loot.js`.
- Never weaken, delete or retarget an existing assertion. Stdlib only (node builtins). No new deps.
- Do NOT tune global balance. Stage 0 (VERDANT_HOLLOW) and any DEFAULT-stage run must stay
  byte-identical to today.

## WHAT TO BUILD — five new stage rows, 8 total

Extend `STAGES` in `src/stages.js` from 3 rows to **8**, keeping the exact row schema
(`{id, name, blurb, theme, pool, mods, hazard, unlock}`) and the file's existing pure/no-persist
contract (challenges.js-style: no DOM, no game state, total on garbage id, nothing written to the
profile, no schema bump, no storage key).

`theme` is an INDEX into `CONFIG.GROUND.THEMES` (`src/config.js:310-330`) — there are SIX authored
themes today: 0 VERDANT HOLLOW, 1 ASHEN WASTE, 2 SNOWFIELD, 3 THE BLOOD RUST, 4 THE BONE DESERT,
5 THE VOID REACH. Do not author new palettes; picking an existing theme IS the retint.

**THE ANTI-RESKIN RULE IS THE ACCEPTANCE BAR, NOT A SUGGESTION.** G20's own text says: *"Never ship a
reskin: players judge maps on mechanics."* Every one of the 5 new stages must differ from every other
stage on ALL FOUR axes, and each difference must be **MEASURED** (see the bar below), not asserted:
- **pool** — a genuinely different foe mix, not a re-weighting of the same set. At least three of the
  five new pools must DROP at least two enemy ids that stage 0 carries. Use a distinct MECHANICAL
  identity per stage, e.g.: the all-melee charge arena (no SPITTER/WARLOCK), the swarm tide (SWARMER +
  TICK dominant, no COLOSSUS), the ranged gauntlet (SPITTER + WARLOCK dominant, no DASHER), the elite
  arena (few types, high elite pressure), the long-haul arena (tanky, slow, few but heavy).
- **theme** — a theme index not used by any other stage where possible; theme 3, 4 and 5 are unused.
- **mods** — at least two non-1.0 entries from `{hpMult, dmgMult, spawnMult, speedMult, packMult}`,
  and each stage's mods VECTOR must not be identical to another stage's.
- **hazard** — a non-null `{id, kind, ...params}` record. Permitted kinds are ONLY the ones the slice-1
  wiring in `main.js` already implements: `eliteRate` (additive elite-chance bump) and `spawnBand`
  (spawn-ring multiplier). `packMult` is already applied at the pack site but is currently declared as
  a MOD and used by no stage — you may additionally promote a pack change to a hazard by giving it a
  hazard record of kind `packBurst` ONLY IF you implement `packBurst` as a multiplier on the EXISTING
  `pack` expression at `src/main.js:566-573` (no new spawn code, no new file). If any other hazard
  kind would require editing a file outside your owned set, DO NOT do it — pick `eliteRate` or
  `spawnBand` with different parameters instead and record that choice in your report.

**The unlock ladder.** Five new stages need five gates, and they must be a strictly ascending
progression using EXISTING achievement ids from `src/achievements.js:62-104` — never invent an id,
never add a persisted field (read the gate with `isEarned(profile, id)`, `src/achievements.js:219`).
`FIRST_BOSS` and `WAVE_5` are already taken by ASHEN_WASTE and SNOWFIELD. Use five DISTINCT,
still-unused ids that make a real ladder (candidates: `BOSS_SLAYER_5`, `WAVE_10`, `SURVIVE_10MIN`,
`KILLS_10000`, `WAVE_20`, `SURVIVE_20MIN`, `FULL_BUILD`, `CHESTS_25`, `FIRST_EVOLUTION`). The
`hint` string is the achievement's OWN plain-word condition (the slice-1 pattern), never invented.

**Stage 0 parity is binding and must not move:** `VERDANT_HOLLOW` keeps theme 0, all-1.0 mods, the
shipped pool in the shipped order, `hazard: null`, `unlock: null`.

**The selection surface must survive 8 rows on a PHONE.** `lockedStageLines(unlocked)`
(`src/stages.js`) now emits up to 7 lines and `stageCardSub()` renders them in the title card. At
390x844 the card and its locked-lines block must remain fully inside the viewport, unclipped, with no
overflow past the card's own box. You own the fix (compact text, a scrolling sub-region, whatever
stays integer-pixel and readable) — but the bar is a DOM-rect measurement at 390x844, not a glance.

## ACCEPTANCE BAR (numbered, all binding)
1. `src/stages.js` exports 8 stages; `STAGE_IDS.length === 8`; the four distinctness rules above are
   each ASSERTED in `test/test_stages.mjs`, not commented.
2. `test/test_stages.mjs` grows to **>= 30 checks** and must include: the stage-0 parity check at waves
   1 and 15 (unchanged), an 8-count check, a pairwise-distinct check over pools / theme indices /
   mods vectors, a check that every non-default stage has >= 2 non-1.0 mods and a non-null hazard, a
   check that every `unlock.achievementId` exists in the real achievement catalog, a check that the
   five new gates are mutually distinct and exclude the two already-used ids, and a total-on-garbage
   check.
3. **EACH HAZARD MUST BE MEASURED, NOT ASSERTED.** For every non-null hazard in the ladder, add a
   headless probe that runs the real spawn path (seeded/scripted `Math.random`, fixed dt, the real
   `pickSpawnType` + `spawnWave`) and produces a NUMBER showing the hazard changed something versus
   the default stage: elite count over N scripted spawns (`eliteRate`), sampled spawn distance
   (`spawnBand`), pack pop size (`packBurst`). A hazard with no measured delta fails this bar.
4. `tools/verify_g20_stages.mjs` must be extended to walk ALL EIGHT rows in a REAL browser at
   **390x844 @dpr3**: cycle the card with REAL taps on a profile whose achievements are granted
   through the game's OWN profile import seam, asserting for each stage the live `state.stage`, the
   `hpMult`-applied chaser `maxHp` against the expected formula, `nan: false`, `errors: []`, and the
   locked-lines block inside the card's rect (viewport check). It must still write the phone PNG.
5. `bash /tmp/run_all.sh` => **FAIL=0** (it is PASS=73 FAIL=0 today; the file count must not drop).
   Run it at least twice.
6. Default-stage byte-parity: a default run's chaser `maxHp` and spawn table are unchanged from
   `87a8e13`'s numbers (`chaserMaxHp: 12` at wave 1, the shipped 8-entry weight vector). Prove it.

## OUT OF SCOPE (do not build)
- Per-stage ITEM/REWARD pools — that is G17's economy call, deliberately deferred.
- A Hyper/Inverse/Endless modifier axis — `src/heat.js` (G24) and `src/challenges.js` (G11) already
  own the difficulty and rule axes. Do not duplicate them.
- Any gold multiplier or gold penalty for a stage. Stages never pay.
- New art, new palettes, new enemy types, new spawn code paths.

## REPORT SHAPE (reply with exactly this, no preamble)
- `done:` one line.
- `files:` every file you changed, with `+/-` line counts.
- `stages:` a table of the 5 new rows: id / theme / pool ids / mods / hazard kind / unlock id.
- `measures:` the real numbers from bar 3 (hazard deltas), bar 4 (per-stage `hpMult` chaser maxHp +
  PNG dimensions) and bar 5 (suite result, twice).
- `not-verified:` anything you could not prove, stated plainly. Never claim a pass you did not measure.
