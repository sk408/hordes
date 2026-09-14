# E2 - THE WAVE-2 HORDE: HEAVY TIER, FLYING ENEMY, TRIPLED CHAFF, PERF GATE - BUILD BRIEF

**Slice:** E2, EXECUTION ORDER item 8 (`docs/HORDES_GOALS_2026-09-12.md:1162-1164`), goal entry
`docs/HORDES_GOALS_2026-09-12.md:1439-1456` (and its spec sections `:207-334` and `:854-944`),
plan entry `docs/BUILD_PLAN.md` (the E2/flying-enemy lines under Waves).
**Builder:** `cli:kimi-hordes-g8`. **Brief authored by:** the goal pilot, 2026-09-14, at HEAD `f50f1a6`;
**DISPATCH-RE-VERIFIED 2026-09-14 by the dispatch tick at HEAD `b9c5571`** (`git status --porcelain` =
1 line: `M docs/briefs/V1_ESCAPE_SEQUENCE.md`, an orchestrator-owned doc edit, NO code drift). Both W7b
(the draft rarity ladder, `b9c5571`) AND E1 (the run purse, `245cea0`) have LANDED since this brief was
authored - the gold sections below were RE-BASED on the landed E1 purse by the dispatch tick (the tier
weighting R7 asked for ALREADY EXISTS as `meta.js GOLD_TIER` + `purseCredit`). E2 may NOT run in
parallel with S1. The four w7b_draft_ab measurement processes (ladder A/B) ARE RUNNING on this box -
they imported `src/` at boot (HEAD `b9c5571`) so your edits do not corrupt them, but they cost CPU:
see the load note under R10.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

Before issuing, on the dispatch tree (HEAD will be AFTER W7b lands):
1. `git status --porcelain` - record the line count and state whether the tree is clean.
2. Resolve every `file:line` anchor below and CORRECT any that drifted, IN PLACE in this file. Line
   numbers were read at `f50f1a6` and are EXPECTED to move (W7b edits `config.js`, `main.js`,
   `weapons.js`, `entities.js`).
3. RUN the two measurement commands and paste their verbatim output into this file under MEASURED
   CURRENT BEHAVIOUR: `node tools/draft_sim.mjs --divergence` (must read the W7b result) and
   `bash tools/run_suite.sh` (must end `redfiles=0`; if it does not, STOP - E2 is not issued on a red tree).
4. Confirm `tools/verify_perf.mjs` and any `src/` flying-enemy code do NOT already exist.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If a change legitimately invalidates an assertion,
  RETARGET it to the new invariant and SAY SO (file + line + why). Enumerate EVERY retarget in your
  report. A retarget you do not enumerate is a defect. Widening a cohort until a marginal bar clears is
  tune-until-pass and is FORBIDDEN - lower the fraction of the change, not the sample.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep and
  quote in the report. A builder self-report is a claim; the pilot re-measures on the artifact.
- **No emojis** anywhere (owner UI rule). **Integer pixels only** (the flying shadow/art).
- **60Hz and 120Hz must both be correct.** Nothing may assume a fixed dt.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock before your first edit and release it when done.
- **Scope bound:** `src/config.js`, `src/entities.js`, `src/enemy_types.js`, `src/main.js`,
  `src/render.js` (the flying draw + shadow only), `src/meta.js` (`GOLD_TIER` / `PURSE_TYPE_TIER` /
`purseTier` ONLY - not `computeRunGold`, not `GOLD_MODEL`, not the fixed award), `src/chests.js`
  (drop chances only), plus tests and these NEW files: `tools/verify_perf.mjs`, one
  `tools/verify_e2_*.mjs`, and `test/test_e2_*.mjs`. Do **NOT** touch `src/controllers.js` (A1 owns it),
  `src/portal_cine.js`, the shop, or the RUN-structured ladder beyond the heavy/heavy-debut seam. Do NOT
  add a player-level term to enemy scaling (see the "no rubber band" ruling). If you believe a change
  outside this list is required, STOP and report.
- **Must NOT run in parallel with W7b or S1.**

## THE OWNER DIRECTIVE (verbatim - three quotes, one slice)

`docs/HORDES_GOALS_2026-09-12.md:1439-1444`:
*"we need more enemy variety so that the 2nd wave has a complement of new enemies... I meant it literally
for the enemies to be mid level boss strength... the wave 2 spawn rate for chaff should be maybe triple...
drops for chaff enemies should be close to zero... we should make a flying enemy like the bats, but
stronger for wave 2... Yes, flying enemies that ignore ground effects and have shadows."*

Toughness, `:242`: *"Ok I meant it literally for the enemies to be mid level boss strength. Maybe their
spawn rate can be slightly lower than the first enemies to give the player chance to kill them. But by
wave 2, player will be strong and then they will want to grind again. If the enemies are too strong, we
allow buyables to have more levels with a large increase in cost."*

Chaff income, `:860` and `:869`: *"the wave 2 spawn rate for chaff should be maybe triple or squared,
which means their drop rates need to be reduced by the same for consistency."* then *"wave 2, drops for
chaff enemies should be close to zero. Drops should be mostly from the strong enemies."*

**STANDING RULE (`:207-334` and `:854-944`, do NOT violate): if this proves too strong, the answer is the
SHOP - raise buyable `maxLevel` with steep cost growth - NEVER soften the enemy numbers, never add a
rubber band, never scale enemies off the player's own level, never revert.** Do not cite "a fresh run
dies in ~10-25s" as a reason to soften anything (see `:1045-1056`).

## MEASURED CURRENT BEHAVIOUR (HEAD `f50f1a6`; the dispatch tick RE-MEASURES - do not trust these)

- **Escalation reads exactly two things.** `entities.applyEscalation` (`src/entities.js`, the
  `applyEscalation` export) reads the wave/time ladder and heat. Nothing reads the player's level;
  nothing reads chests. The player's power curve outruns the enemies BY CONSTRUCTION.
- **Wave gating already exists** (`src/config.js` `SPAWNER` block, wave-first-appearance table): wave 2
  already debuts BRUTE, DASHER, TICK; wave 1 debuts SWARMER; wave 0 is CHASER. So "wave 2 has no new
  enemies" is FALSE - the real complaint is the MIX: weights are CHASER 3 / SWARMER 2 / BRUTE 1.5 /
  DASHER 1.2 / TICK 1.5, so the debut wave still reads as mostly chasers. **The lever is the weights +
  a guaranteed debut, NOT new types.**
- **Numbers.** `MIDBOSS` (`src/config.js` `ENEMY.MIDBOSS` / the `(17 + 14*waveNum)` formula) gives a
  wave-1 mid-boss = `BASE_HP * hpScale(1) * 31` ~= **6,026 hp**. Today a wave-2 CHASER is ~194 hp and a
  wave-2 BRUTE is ~680 hp. The ask is ~31x the chaff. Ship data: wave-1 pilots reach t=120 at
  **2,000-8,000 dps**, so a ~6,000 hp body is a **1-3 second kill** - a grind, not a wall.
- **GOLD: THE E1 RUN PURSE IS LIVE - re-based by the dispatch tick at `b9c5571`.** `computeRunGold`
  (`src/meta.js:248`) is RETIRED as the payout authority (kept, sim-only). Gold is now: (a) a FIXED
  end award `RUN_GOLD.AWARD` x goldMult, and (b) a per-kill TIER-WEIGHTED purse credit -
  `GOLD_TIER` (`src/meta.js:272-280`): CHAFF 0 / GRUNT 1 / MID 3 / HEAVY 8 / ELITE 15 / MID_BOSS 60 /
  BOSS 150, mapped by `purseTier` (`src/meta.js:289`) off boss/elite stamps + `PURSE_TYPE_TIER`,
  credited ONCE per kill at the kill funnel (`purseCredit`, `src/main.js:811`). The tier weighting the
  old R7 asked for EXISTS. The dispatch tick verified `p.kills++` at `src/main.js:1955` (drifted from
  :1944). Run stats carry `runCounts.bossKills` ("bosses/heralds killed").
- **Five per-kill DROP channels** (all denominated in KILLS, so all inflate together):
  | channel | seam |
  |---|---|
  | XP per kill | `src/entities.js` (`BASE_XP * xpScale(w)`, set in the spawn and in `applyEscalation`) |
  | gold | per-kill purse credit `purseValue` (`src/meta.js` `GOLD_TIER`; `src/main.js` `purseCredit`) |
  | evolution tokens | `src/chests.js` `PER_KILL: 1200` |
  | potion drops | `src/config.js` `POTION.DROP_CHANCE` (~0.02, and a second ~0.03) |
  | chest drops | `src/chests.js` `DROP_CHANCE: 0.35` (the EQUIPMENT faucet, item (f)) |
- **"Flying" has NO mechanical meaning yet.** There is no enemy-enemy collision/separation anywhere, no
  terrain, no `z` field (`grep` for a `z` axis in `src/*.js` finds only unrelated comments). `intro.js`
  has `BAT` sprites drawn "fly above with a sine bob" - reuse the ART and the CONVENTION, not a second
  flight idea.
- **No perf measurement exists at all.** The existing "120Hz" checks inject `h.setFrameMs(1000/120)` and
  assert dt-correctness - a LOGIC check, not frame cost. `tools/real_loop.mjs` boots the real loop
  headlessly but does neither render nor time a frame. **No `tools/verify_perf.mjs` exists.**
- **The VPS is the floor** (owner: *"Your vps environment is generally weak. If it can run 120hz there,
  it's not an issue at all"*): 6-core Xeon E5-2690 v4 @ 2.6GHz, 7.9GB RAM, **NO GPU** - a headless
  browser rasterises in SOFTWARE. Spawns are PLAYER-RELATIVE, so the extra bodies are ON SCREEN; arena
  culling does not save you. Note the load average in any measurement so a contended box is not mistaken
  for a slow game.

## REQUIREMENTS (numbered; the acceptance bar is at the bottom)

**R1 - HEAVY TIER (the toughness ask, literally).** The types that DEBUT at wave 2 (BRUTE, DASHER, TICK)
carry **mid-boss-equivalent hp**; CHASER and SWARMER stay chaff on the current curve. Wave 1 stays
survivable; wave 2 arrives as "a complement of new enemies" that are genuinely dangerous.
**R2 - Heavies ride the mid-boss ladder ONE WAVE BEHIND.** Heavy hp at wave `w` = the MIDBOSS formula at
`w-1` (so wave-2 heavies = `BASE_HP * hpScale(1) * 31` ~= **7,589 hp**, >= the wave-1 mid-boss ~6,026 -
"at least equivalent", literally satisfied). **Keep ONE definition of the formula and READ it; do not
copy the constants.**
**R3 - Heavies spawn RARER than the chaff** (owner: *"slightly lower than the first enemies"*). Tune the
`SPAWNER` weights by measurement from today's BRUTE 1.5 / DASHER 1.2 / TICK 1.5 vs CHASER 3, and add a
**guaranteed debut** so the tier actually shows up in wave 2.
**R4 - The mid-boss stays distinct by BEHAVIOUR, not hp** (pillar ring, pursuit, bursts). With heavies at
mid-boss hp, do not let the two collapse into "the same thing but alone". The wave boss is untouched
(~108,000 hp at wave 1 - the wall the run breaks on). The ladder must read: chaff -> heavy -> mid-boss ->
wave boss.
**R5 - CHAFF DENSITY: TRIPLE, via ONE config knob.** A flat multiplier (owner offered "triple or
squared" - prefer the FLAT one; a squared rate compounds with the hp ladder and cannot hold a phone
frame budget). ONE tunable, testable knob in `config.js`. This applies at wave 2.
**R6 - CHAFF DROPS GO TO NEAR ZERO; the heavies carry the income.** Set the four per-kill DROP rolls
near zero for chaff (potion, chest, evolution-token, and the XP term - see R8 for XP). The grind becomes
"kill the strong ones for progress".
**R7 - GOLD: LARGELY PRE-SATISFIED BY E1 (landed `245cea0`) - the dispatch tick re-based this
requirement; do NOT rebuild the tier ladder.** The tier-weighted per-kill purse EXISTS (`GOLD_TIER`,
above). What E2 still owes on gold: (a) the NEW flying heavy MUST land in the tier table at HEAVY-or-
better (extend `PURSE_TYPE_TIER` / `purseTier`, ONE data table, never re-derived from hp at run end);
(b) with chaff TRIPLED, prove the chaff tiers still pay ~nothing (CHAFF 0 / GRUNT 1 today - assert the
tripled swarm's purse share stays near zero, do NOT reprice the tiers); (c) heavies now carry the
income - assert the wave-2 heavy tier pays measurably more per kill than the chaff it replaces;
(d) KEEP the raw `p.kills` count for body-based things (milestones, achievements). **Double-payment
trap, as landed:** the purse credit is the ONLY per-kill gold surface and the end award is flat
`RUN_GOLD.AWARD` - if you give any kill a second in-run payout (`MAW_CLEAR_BONUS`-style), ASSERT the
same kill is not double-paid. Do NOT touch `computeRunGold`, `GOLD_MODEL`, or the fixed award.
**R8 - XP is PROGRESSION, not income - measure it, do not just zero it.** Near-zero chaff XP is coherent
with intent, but REPORT **drafts per wave before/after** and keep the level-ups from collapsing. If they
do, the HEAVIES pay more xp, not the chaff.
**R9 - THE FLYING ENEMY (a heavy, debuting with the wave-2 batch).**
  - **`z` + a GROUND SHADOW.** A `z` per entity drawn at `y - z` with a shadow that stays at ground level
    (integer pixels). This is G7's render-only z substrate, so the sim stays 2D - flight becomes
    elevation's first customer WITHOUT committing G7's jump/parallax.
  - **A swoop**: hover/bob, close at an angle, commit to a dive - distinct from CHASER's straight walk
    and DASHER's ground lunge.
  - **Mechanical identity (OWNER-CONFIRMED): it IGNORES GROUND EFFECTS and HAS A SHADOW.** Define
    PRECISELY:
    * **Ignores:** the frost slow (FROST_NOVA / the chain's slow) AND ground AoE damage (chain
      detonations and any ground nova/blast). Its speed is unaffected and it takes NO blast damage.
    * **Does NOT ignore:** direct hits - projectiles, contact, beams. It MUST stay killable normally, or
      "ignores ground effects" becomes "invincible" - the failure mode.
    * **The balance consequence is DELIBERATE:** the Witch's kite survival is built on the slow, so a
      flying heavy is a real COUNTER to her. Do NOT soften it later and do NOT let a probe "fix" it by
      asserting the slow applies.
**R10 - PERF TOOL (`tools/verify_perf.mjs`) - a PERMANENT tool, not a one-off.** A real wall-clock
frame-time measurement in a REAL browser on the VPS: update+render cost per frame (p50, p95, plus max)
at the WAVE-2 HORDE PEAK, captured BEFORE and AFTER this slice, with the load average noted. 60 and
120Hz. Spawn/entity-count changes recur, so this is the gate that keeps them honest. **LOAD NOTE
(dispatch tick, 2026-09-14):** four `w7b_draft_ab` sim processes ARE RUNNING on this box. Capture the
BEFORE frame table whenever you are ready, but if `uptime` loadavg > 6 when the AFTER table is due,
either wait for the arms to finish (`/tmp/w7b_ab/progress.txt` lists done arms) or take the table and
LABEL it with the load - a contended box must never read as a slow game, and a number without its load
is not evidence.

## EVIDENCE THIS SLICE OWES (a claim in prose is not evidence - each must be a command + raw output)

1. `bash tools/run_suite.sh` final line quoted, **`redfiles=0`**, every new test kept.
2. **Enumerate EVERY fixture retarget** (file + line + why). An unenumerated retarget is a defect.
3. R2 numeric assertion: a wave-2 heavy's hp >= the wave-1 mid-boss's hp, **both read from their ONE
   definition, not literals**.
4. Measured **cohort runs before/after** (time-to-death, waves reached, kills) with the owner's loadout,
   >= 8 runs per policy, on at least TWO profiles (a fresh one and a developed/maxed one).
5. A **measured spawn-mix table** proving chaff is tripled and heavies are rarer.
6. A **measured per-wave income table** covering ALL FIVE channels before/after, with the invariant
   stated as a percentage, PLUS drafts-per-wave before/after (R8).
7. The **frame-time table** at the wave-2 peak (p50/p95/max, 60 and 120Hz) with load average (R10).
8. Flying-enemy tests for BOTH halves of the trait: (a) speed unchanged inside the slow field AND the
   same blast leaves its hp untouched; (b) a direct projectile hit DOES damage it. Both halves, or the
   trait is tested in the direction that hides the bug.
9. **Real-browser phone capture** (390x844 @dpr3, PNG 1170x2532) for anything the player SEES - the
   flying enemy + its shadow on the field. Set all TOUR_KEYS, assert `state.time > 1.0` BEFORE
   measuring. A code claim is not evidence for anything a player looks at.

## ACCEPTANCE BAR

- Suite `redfiles=0`, every retarget enumerated, no weakened assertion.
- R2 numeric assertion passes reading ONE formula definition.
- Spawn-mix table: chaff tripled (~3x) and heavies rarer than chaff.
- Five-channel income table with a stated % invariant and drafts-per-wave not collapsed.
- Frame-time table at the wave-2 peak on the VPS, 60 and 120Hz, before/after, with load average.
- Flying enemy: both trait halves tested; real-browser phone capture read back.
- Every number quoted from raw command output. If any bar is NOT met, say so plainly - an unmet bar
  reported honestly beats a bar met by assertion.
