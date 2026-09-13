# N1b ITEM 8 BRIEF - THE AUTO PILOT MUST BE ABLE TO SPEND MANA (2026-09-13)

Self-contained. Read this whole file first. You are the only writer in
/home/claude/projects/hordes while you hold the lock.

## WHY (N1b item 8, owner-specified sequencing)
`useSkill` is reachable ONLY from the player's Q/E (`src/main.js` runAction -> `useSkill`).
The AUTO pilot never casts, so in AUTO mana has COSTS and NO BENEFITS - the whole mana
scheme reads as a tax. MEASURED cost of that gap (already measured by the owner's own
cohort, do not re-derive): the same cohort firing Q/E at bosses went 204.8s -> 277.8s
survival (+36%) and 3583 -> 5993 kills (+67%). N1b says explicitly: give the pilot a cast
policy BEFORE tuning any further mana number.

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt.
- Never weaken, skip or delete a test. A test may be RETARGETED to a replaced contract.
- Do NOT run git commit/checkout/reset/stash/clean - the orchestrator owns commits.
- Do NOT touch the uncommitted N2 title-reveal code or the N1a work in src/main.js
  (`advanceTitleReveal` / `beginTitleHold` / `titleReveal` and the `classSkillId` /
  `defaultFocus` hunks) - leave those hunks byte-identical. They are uncommitted and
  another agent already mangled this file once today.
- Do not touch src/heat.js, src/challenges.js, src/rewrites.js, src/rarity.js,
  src/encounters.js. Do not author art. Files in scope: src/main.js (the pilot section
  only), src/config.js (the CONFIG.AUTOPILOT block only), and a NEW
  test/test_auto_cast.mjs.

## RECON (verified 2026-09-13 on this tree)
- `src/skills.js:16` `useSkill(state, id)` - the ONLY skill mana spender. Returns false
  (no state touched) on unknown id, on `p.skillCd[id] > 0`, or on
  `p.mana < skillManaCost(id, state)`. FROST_NOVA is an AoE around the PLAYER
  (`def.RADIUS`); OVERCHARGE sets `p.buffs.overcharge = def.DURATION`.
- `src/main.js:4213-4244` the AUTO-DRINK hand: `C.AUTOPILOT.AUTO_DRINK` carries the knobs
  with their reasoning inline, the gates are read at ~:4233, and `:4240` already computes a
  `starved` skill test. THIS IS THE PATTERN TO FOLLOW - one declarative CONFIG block, one
  decision function, no per-call-site magic numbers.
- `src/main.js:4081-4103` the BOSS_STANCE machinery: boss/elite awareness already exists in
  the pilot (`C.AUTOPILOT.BOSS_STANCE`, armed on boss arrival, released when the player
  moves on). Reuse it rather than inventing a second definition of "is a boss here".
- `src/main.js:4132` `classSkillId(state)` (N1a) is the ONE place a class's Q skill id is
  read. `:4162` is the player's q act. `src/controllers.js:41` AutoPilotController,
  `:61` cycleFocus.
- `src/perks.js` `skillManaCost` / `skillCooldown` are the cost/cd seams (imported by
  `src/skills.js:1`). Read costs through them; never hardcode 30/25.

## DO
1. Add `CONFIG.AUTOPILOT.AUTO_CAST` as a DECLARATIVE block in `src/config.js`, in the same
   style as `AUTO_DRINK` (knobs + the reasoning in comments). At minimum: an enable flag,
   the near-full pool threshold (spill income rather than waste it), and the boss/elite
   in-range rule.
2. Give the AUTO pilot a cast policy that calls `useSkill(state, classSkillId(state))` and
   `useSkill(state, 'OVERCHARGE')` under stated conditions. Both must go through
   `useSkill` - do NOT spend mana anywhere else, and do NOT duplicate its cost/cd checks.
3. The policy must be CONSERVATIVE and honest:
   - Only cast when the cast will actually land: FROST_NOVA only with a live enemy within
     `C.SKILLS.FROST_NOVA.RADIUS` of the player; OVERCHARGE only when a boss/elite is
     present or the pool is at/above the near-full threshold.
   - Never cast when `p.skillCd[id] > 0` would reject it anyway (no wasted calls).
   - It must NOT create a new withhold: a cast must never block, delay or starve a weapon.
4. MANUAL mode and every existing keybinding stay EXACTLY as they are. The pilot's casts
   must be recorded on the same state the player's casts land on, so the end screen and
   the run stats stay true.
5. NOT IN SCOPE: the three non-Witch ULTS (owner-gated on the Q-slot question), the new
   shop buyables (thrifty/well/siphon), Chain Reaction's cost, mana regen, pool size, and
   any change to a mana NUMBER. If a number seems to need changing for your bars to hold,
   STOP and write `blocked:` with the measurement instead of changing it.

## ACCEPTANCE BAR (numbers, not intentions)
- From `tools/real_loop.mjs` `runRealCohort` cohorts on THIS tree, AUTO mode, same profile
  and same seed handling before vs after, report for a WITCH and for a KNIGHT:
  survival seconds, kills, casts per run (split by skill), and mean mana. The cross-check
  is that AUTO now lands in the SAME BAND as the measured player-Q/E cohort quoted above
  (+36% survival / +67% kills is the ceiling, not the target - if AUTO beats the player
  cohort, say so plainly, that is a finding, not a win).
- The two N1b item-7 bars, both already instrumented: frames at zero under 20% (proves it
  is not a lockout) and mana spent as a share of income 70-90% (proves it is not
  decorative). Report both, before and after.
- A NEW `test/test_auto_cast.mjs` with real assertions: no cast with no legal target, no
  cast when the pool cannot pay, a cast when a boss is in range, no double-spend in one
  frame, and the SAME cast count at a 60Hz step and a 120Hz step over the same scripted
  state (nothing may count frames).
- `node tools/verify_skill_keys.mjs` must PASS, and `bash /tmp/run_all.sh` three times,
  each FAIL=0 (baseline on this tree: PASS=70 FAIL=0).

## LOCK
Run `~/projects/agent-hub/sdk/agentlock acquire --note "N1b auto cast policy"` before
editing; if it reports another owner, retry (15 tries, 30s apart) and then STOP and report
that owner - never edit without the lock. Run `agentlock release` from
/home/claude/projects/hordes when done, even on failure.

## REPORT
Finish with a `done:` line naming: what landed (file:line per change), the before/after
cohort numbers, the two N1b item-7 bars, the three suite results, the 120Hz check, and an
explicit list of what you could NOT verify. No vision model is reachable on this host - do
not claim anything "looks right".
