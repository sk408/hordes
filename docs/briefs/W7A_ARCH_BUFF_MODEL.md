# W7A SLICE 1 - THE ARCH-BUFF MODEL: MAKE THE SIMS MEASURE WHAT THE ARCHES ACTUALLY GIVE

Goal it serves: **BUILD_PLAN W7a (SIM TOOLING)** - the execution-order item H1 -> P1 -> A1 -> A2 -> E1 ->
**W7a-tooling** -> W7b -> ... E1 SUBSUMED W7a's economy half (see the EXECUTION ORDER note, docs/HORDES_GOALS_2026-09-12.md
:1188-1210), so this slice is the TOOLING half that is still open. It is the ONLY thing blocking **G5**
(docs/HORDES_GOALS_2026-09-12.md :2070) whose status is *"OWNER-ANSWERED 2026-09-15 - blocked on TOOLING
ONLY (the arch-buff model), not on a decision."*

## GATE - READ BEFORE PLANNING ANY WORK

This slice is TOOLS+TEST ONLY. **No `src/` file may be edited.** If the arch seam looks wrong while you
model it, that is a **FINDING** (report it with the measured evidence and STOP on that item) - it is not a
licence to fix game code in this slice. The game code keeps one writer.

## HOUSE RULES (binding, same as every slice)

- **ONE WRITER PER FILE.** New work goes in NEW files. `tools/real_loop.mjs` is SHARED (run_curve.mjs,
  economy_ledger.mjs, w7b_draft_ab.mjs all drive it) - you may only ADD counters/prints there, never
  change an existing behaviour, signature or output line.
- **NO git state commands** (commit/checkout/reset/stash/clean). Leave the tree dirty and report the dirty count.
- **NO EMOJIS. Integer pixels. 60Hz AND 120Hz both correct** - nothing may assume a fixed dt.
- **THE OWNER'S STANDING 60-SECOND CAP.** No single command may exceed 60 s wall. Cohorts are CHUNKED:
  one process per run through the EXISTING one-run seam `node tools/run_curve.mjs --run <stage> --seed <s>
  --out /tmp/w7a_arch/<stage>_<seed>.log`. Do NOT build a second harness and do NOT re-run the maxed stage
  (1800 s wall) - quote the existing MEASURED.maxed and `/tmp/g17_1b/maxed_r1.log`.
- Never run the suite concurrently with another suite. Append a timestamped line to
  `/tmp/w7a_arch_progress.log` BEFORE and AFTER every step that can exceed a few seconds.
- **EVIDENCE DISCIPLINE:** every number in the report is quoted from a raw log, never retyped from memory.
  A self-report is a claim; the numbers must be greppable.
- Full suite after the work: `bash tools/run_suite.sh` must end `redfiles=0`. Tests may be RETARGETED
  (file + line + why) but never weakened, deleted or no-op'd.

## MEASURED STATE ON THIS TREE (pilot-read 2026-09-16 ~02:25 UTC, no lock held; RE-RESOLVE every anchor at dispatch)

**The game's arch system - the ONE source of truth you must model, never re-declare.**
- `src/arches.js` `ARCH_TYPES` :26-52: `DOUBLE_FIRE` {name Twin Fury Arch, duration 60, mods rateMult 2},
  `MAGNET` {Magnet Arch, 60, pickupMult 4}, `SHIELD` {Aegis Arch, 75, mods {}, shieldHits 3},
  `BERSERK` {Berserker Arch, 90, damageMult 1.5 + speedMult 0.75}, `SWIFT` {Zephyr Arch, 60, speedMult 1.4}.
  `TYPE_IDS` :54 (rng picks uniformly in THAT order - tests rely on the order). `ARCH.ACTIVATE_R` :57-59 = 26.
- `spawnArch` :65-68; `tickArches` :71-104 (same type NEVER stacks - it REFRESHES the timer to full
  duration; different types run concurrently; SHIELD grants 3 absorbs while live); `activeArchMods` :108-119
  (mult fields MULTIPLY, shieldHits SUMS; pure read of `state.archBuffs`).
- Spawn cadence, game side: `src/main.js` :1060-1071 `spawnWaveArches()` - **1-2 arches per wave** (2 with
  p=0.5), at 120-380 px from the player, type uniform over the five. 15 waves -> ~22.5 arches per run.
  Wired from the wave seam; `state.arches = []` at `src/main.js` :5365 and cleared :6912.
- Consumption, game side: `src/weapons.js` :187-215 - `archMods(state)` -> `activeArchMods(state)`;
  `rateScale` DIVIDES the cooldown interval by `rateMult`; `dmgScale` MULTIPLIES by `damageMult`.
  Movement/pickup read the same helper. There is no second consumption path to model.
- **The AUTO pilot is BLIND to arches** (`src/config.js` :564-570: "chest/arch/portal-BLIND by design -
  controllers never learn these exist"). So the measured grant rate is what a blind pilot walking its own
  route actually collects - that is the honest parameter, and it is a FINDING to report, not something to
  "fix" in the sim by assuming optimal collection.

**Why this slice exists (the measured gap).**
- `tools/balance_sim.mjs` (752 lines, analytic: KILL gate = build dps vs `ladderHp`; SURVIVE gate = pool vs
  `ladderDmg` x contact mix; both logistic on a margin, `SIM_TUNING`/`CAL` at :64-110) has **ONE** "arch"
  mention and it is a COMMENT (:92). `tools/draft_sim.mjs` (1683 lines) mentions arch only in comments.
  Neither models the buffs, so the arch power increase - DOUBLE_FIRE roughly doubles fire rate, BERSERK is
  +50% damage - is **invisible to our own tooling and currently unmeasured.**
- G5's current read, per the doc: a bad draft can fail (100% die before the finale), good beats bad
  (182 s vs 142 s = **0.78x**, bar <= 0.8x, 4/5 metrics), economy in range, every archetype dies by minute 5.
  Those numbers were taken with arches UNMODELLED. Do not restate them as the verdict; re-measure them.

## DELIVERABLE

**1. `tools/arch_model.mjs` (NEW FILE).** A pure, importable model of the arch system, DERIVED from the
   game at import time - `import { ARCH_TYPES, ARCH, spawnArch } from '../src/arches.js'` - so the table can
   never drift. It must expose:
   - the per-wave spawn model (count distribution, radius band, type mix) - mirroring `spawnWaveArches`;
   - a GRANT/UPTIME model whose parameters are MEASURED (see 2), not invented: grants per run by type,
     mean granted uptime per grant, and the time-weighted fraction of a run under each buff;
   - the resulting `rateMult` / `damageMult` applied to a run's dps index, and the shield-absorb term.
   - a documented honesty block: what the model does NOT claim (it does not model the walk path, the
     positioning cost of detouring to an arch, or the pilot's blindness beyond the measured uptime).

**2. INSTRUMENT `tools/real_loop.mjs` (ADDITIVE ONLY).** Emit, per run, a single greppable line with the
   MEASURED arch reality: arches spawned, arches actually GRANTED by type, total granted seconds by type,
   and the fraction of the run under DOUBLE_FIRE / BERSERK. This is the ground truth the analytic model is
   calibrated to. If the counters show grants are rare, THAT is the finding - do not widen the trigger
   radius or move the spawn band to make the number look bigger.

**3. WIRE IT INTO `tools/balance_sim.mjs`** behind a flag (`--arches on|off`, default ON once calibrated)
   so a reader can print the same run WITH and WITHOUT the arch term. Keep the existing default output
   intact apart from an ADDED arch block; do not silently redefine any existing printed number.

**4. `test/test_arch_model.mjs` (NEW).** Drift locks, asserted against the GAME's own code, not a copy:
   the model's table equals `ARCH_TYPES` for all five types and every mods field; stacked different-type
   mods multiply exactly as `activeArchMods()` does; same-type refresh does NOT stack; DOUBLE_FIRE at
   100% uptime gives EXACTLY x2 rate and BERSERK exactly x1.5 damage; the dps delta scales linearly with
   measured uptime; `ARCH.ACTIVATE_R` is read, not hardcoded.

## ACCEPTANCE BAR (all of it, or it is not done)

1. `node tools/balance_sim.mjs` rc=0 and prints an **ARCH MODEL** block: the five types, the MEASURED
   per-run grants + uptime share for the fresh profile (and partial if it fits the 60 s cap), and the
   kill-gate margin for `--arches off` vs `--arches on` **as before/after numbers**.
2. `node tools/arch_model.mjs` (or the flagged sim) prints the same numbers standalone, rc=0.
3. `node test/test_arch_model.mjs` = ALL CHECKS PASSED, printing the values it compared.
4. `bash tools/run_suite.sh` ends `greenfiles=<n> redfiles=0` - report the count and the HEAD/dirty line verbatim.
5. **G5 RE-MEASURED WITH THE ARCH TERM LIVE**, printed side by side with the pre-arch read:
   (a) every stage still dies early (fresh dies at wave <= the pre-arch wave, state the number);
   (b) a bad draft still fails (100% dead before the finale, state n);
   (c) good beats bad on >= 3 of 5 metrics, printing the ratio and the <= 0.8x bar (pre-arch 0.78x);
   (d) the economy stays in its band (quote the ledger's own bands, do not restate from memory).
6. **An honest NULL is a VALID outcome.** If the measured uptime is small (say < 10% of run time) and the
   arch term moves the kill-gate margin by less than the calibration residual, report THAT, with the raw
   numbers - "arch buffs are not the dominant term at the measured collection rate" is a real finding and
   closes G5's tooling gate. Do NOT inflate the term and do NOT tune `CAL` to manufacture a delta.
7. Every number in the report is quoted from a raw log under `/tmp/w7a_arch/`.

## REPORT FORMAT

`done:`/`blocked:` post to the hordes channel FIRST (raw evidence lines, not prose), then:
1. **WHAT LANDED** - files, with `node --check` results.
2. **THE ARCH MODEL** - the five types; measured grants/uptime per stage; kill-gate margin `off` vs `on`.
3. **G5 BEFORE/AFTER** - the four items in the bar, numbers for both readings.
4. **SUITE** - the `TREE ... dirty=n` line + `SUITE greenfiles=N redfiles=0` verbatim, REDLIST if non-empty.
5. **FINDINGS / COULD NOT VERIFY** - everything you could not measure, and every defect you found in
   game code without fixing it.

## REMAINS (not this slice - name it in the report so it is not lost)

- **W7a slice 2:** rank the meta upgrades by MEASURED marginal value (not the hardcoded greedy order) and
  model weapon unlocks as +1 option AND pool dilution at the real slot counts (owner directive, G5 section
  :2074-2082) - including whether unlocking is ever net-negative at 3 slots.
- **G6** stays an OWNER CALL: the divergence instrument is under suspicion (tier-greed is not a skill proxy);
  the sanctioned rebuild is a coherence A/B on `tools/real_loop.mjs`, and it is NOT this slice.
- The 60 s cap means the maxed stage is never re-run here; quote `MEASURED.maxed` and
  `/tmp/g17_1b/maxed_r1.log` if a developed profile is needed.

## DISPATCH ANCHOR CHECK (filled at dispatch - every line number above RE-RESOLVED on the live tree)

- [ ] `src/arches.js` ARCH_TYPES / TYPE_IDS / ACTIVATE_R / spawnArch / tickArches / activeArchMods
- [ ] `src/main.js` :import :16, `spawnWaveArches` , `state.arches` reset/clear
- [ ] `src/weapons.js` `archMods`/`rateScale`/`dmgScale`
- [ ] `src/config.js` the AUTO-pilot arch-blindness note
- [ ] `tools/balance_sim.mjs` CAL/SIM_TUNING block; `tools/real_loop.mjs` run loop; `tools/run_curve.mjs` CLI
- [ ] `node --check` on every file you touch; `test/` naming convention checked against an existing test

## DISPATCH ANCHOR CHECK (FILLED BY THE GOAL PILOT AT DISPATCH - 2026-09-16 02:55 UTC, HEAD `1fda37d` dirty=0)

Every anchor above was RE-RESOLVED on this exact tree at dispatch. Where a line number below differs
from the text above, **THIS BLOCK WINS** (the prose was pilot-read at 02:25 UTC on the same tree; the
drift is <= 3 lines on `src/arches.js` only).

- `src/arches.js`: `ARCH_TYPES` **:24** (DOUBLE_FIRE :25 rateMult 2 / MAGNET :30 pickupMult 4 /
  SHIELD :35 shieldHits 3 / BERSERK :41 damageMult 1.5 + speedMult 0.75 / SWIFT :46 speedMult 1.4),
  `TYPE_IDS` **:52**, `ARCH` **:54** with `ACTIVATE_R: 26` **:55**, `spawnArch` **:62**,
  `tickArches` **:70**, `activeArchMods` **:110**. All five types + every mods field confirmed in the
  table text, byte for byte, as described above.
- `src/main.js`: `function spawnWaveArches()` **:1061**, called from the wave seam at **:1279** and
  **:5418**; run-state reset `state.arches = []` **:5365**; clear `state.arches.length = 0` **:6912**.
- `src/weapons.js`: `archMods` **:191**, `rateScale` **:195** (divides the cooldown interval by
  `rateMult`, reads it at **:212**), `dmgScale` **:218** (multiplies by `damageMult`), consumed at
  **:277-278** and applied at **:345** / **:355** / **:439**. Still ONE consumption path.
- `src/config.js`: the AUTO-pilot blindness note is **:564** ("chest/arch/portal-BLIND by design").
- `tools/balance_sim.mjs`: `SIM_TUNING` **:67**, `CAL` **:96**, the ladder imports at **:51**
  (`ladderHp`/`ladderDmg`/`ladderXp`), envelope helpers **:124-125**, `hpScale: ladderHp` **:147**.
  `grep -c arch` on this file = **1**, and it is a comment **:92** - the claim in the brief is exact.
- `tools/real_loop.mjs` (234 lines): `stageProfile` **:28**, `STAGES` **:55**, `runRealCohort` **:150**
  with the `onRun` hook fired at **:225** and `onProgress` fired at **:162-163**. ADD to these only -
  `run_curve.mjs`, `economy_ledger.mjs` and `w7b_draft_ab.mjs` all drive this file.
- `tools/run_curve.mjs` (165 lines): the one-run seam is `--run <stage> --seed <s> --out <log>`, parsed
  at **:155-158**; it appends a `# run_curve --run stage=... started=...` header to the out file (**:42**).
- **TEST NAMING / NO-DUPLICATE NOTE:** `test/test_arch_buffs.mjs` ALREADY EXISTS and covers a DIFFERENT
  thing - the WIRING defect (weapons.js `rateScale`/`dmgScale` reading `state.archBuffs` instead of only
  the main.js volley). It does NOT model uptime, grants or the kill-gate. `test/test_arch_model.mjs` is
  a NEW file and must not duplicate it; do not edit the existing test.
- Naming convention confirmed against the 100 existing `test/test_*.mjs` files: `test_arch_model.mjs`.

**TREE STATE AT DISPATCH (pilot-measured, not asserted):** `bash tools/run_suite.sh` =>
`TREE: /home/claude/projects/hordes @ 1fda37d | dirty=0`, `SUITE greenfiles=101 redfiles=0`. The tree is
CLEAN, so your own suite run must also end `redfiles=0` and the dirty count will be yours alone.
