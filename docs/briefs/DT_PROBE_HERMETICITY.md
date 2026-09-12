# BRIEF — DT-PROBE HERMETICITY (test/test_rewrites.mjs): stop the flaky dt check

Issued by the goal-pilot tick 2026-09-12 (subagent:spawnfa, agentlock held). This file is the
SINGLE SOURCE OF TRUTH. Execute it exactly. Do not start G10/G23 or any feature: this is the
green-suite bar, and it is red ~17% of runs.

## The defect (reproduced by the pilot, twice, on this tree)

    for i in $(seq 1 30); do node test/test_rewrites.mjs || echo FAIL; done   # 5 of 30 FAIL

Failure text (from an actual run):

    FAIL the rewrite payouts are dt-correct: 60Hz == 120Hz over the same second
         same total at both refresh rates
    28 !== 29

Tick 10's fix (probe bodies retyped off FLASH_TRASH_TIERS + a flashTargets() guard) closed ONE
leak. It did NOT close the check: 5/30 red is the current measured rate.

## Root cause — the probe window is not hermetic (instrumented, code-proven)

The pilot copied the file to a scratch path, made the dt probe log per-frame deltas plus
`p.stats.damage`, `p.level`, `st.mode`, `p.potions`, `st.drops.length`, `st.runCounts` and the
effect list, and ran it 30 times. Two leak modes, both from the LIVE run loop still running
inside the probe window (the probe only sets `st.weapons = []`; it does not stop the run):

1) **A chest opens mid-window and grants a Whetstone.** Observed: `st.runCounts.chests` 0 -> 1 -> 2
   across the window and `p.stats.damage` 8 -> 10, i.e. EXACTLY x1.25 (`src/config.js:500`,
   Whetstone: `p.stats.damage *= 1.25`). The BOOM is priced when the corpse dies, the BLAST when
   the potion is collected, so a mid-window stat change prices them at different damage:
   `total 28` (8 at the boom, 10 at the blast) vs `total 29` in the other refresh-rate pass.
   Logged step frames: `f0:+26` normally, `f0:+28` when this fires.
2) **A second hp potion is collected inside the window.** Observed: `p.potions.hp === 2` at probe
   end (runs 2, 8, 15, 17, 26 of the 30) and `steps f0:+44` at 120Hz vs `f0:+26` at 60Hz — one
   extra BLOOD HARVEST blast (+18 at dmg 8). The extra potion is a live-run drop/chest reward, not
   anything the probe pushed.

Every other run in the sample was `f0:+26` at both refresh rates, i.e. the engine's per-EVENT
payout IS frame-rate independent. **This is a TEST-HERMETICITY defect. Do not change game balance,
drop rates or damage constants to make this check pass.** If you find a real player-facing bug
behind one of these leaks, REPORT it with evidence in your tick note and leave the behaviour alone.

## Required fix (test-side; adding assertions is required, weakening any is forbidden)

Edit `test/test_rewrites.mjs` only for the dt check (and the sibling probes you find below):

1. **Pin the inputs.** Capture `dmg0 = p.stats.damage` at probe start; assert `p.stats.damage`
   is unchanged at probe end; compute `want` from that pinned value for BOTH refresh-rate passes
   (not from whatever the stat happens to be when the assertion runs).
2. **Close the window.** Suppress the run's own event sources for the duration of each probe pass
   (the spawner, the chest path, the drop/pickup path originate in `src/main.js`'s run loop —
   find the real seam, e.g. the state flag/`__TEST` handle the existing smoke/other tests already
   use, and use it). Do NOT stub out the code under measurement (the corpse death sweep, the
   boom, the potion collect and the blast must all run for real). Restore the seam afterwards
   even if the probe throws.
3. **Assert the field is exactly the probe.** At probe entry assert the enemy field holds exactly
   the probe bodies (near + corpse) and `st.drops` holds exactly the one pushed hp potion; nothing
   the flash drop OR any other system can add or reap.
4. **Assert the payout positively, so the next leak fails loudly instead of skewing a number:**
   exactly ONE boom and exactly ONE harvest blast in the window (count the `rewrite_harvest`
   effect in `st.effects` and the boom's deaths), and `p.potions.hp === 1` after the window.
5. Keep `assert.equal(at60, at120, ...)` and `assert.equal(at60, want, ...)` in place with their
   meaning intact. No new tolerance, no sleep, no "sometimes".

## Sibling probes — same class of leak

- `test/test_perks.mjs`: the contact/shot/drain probes run in the live loop and assert RATIOS, so a
  mid-window stat change cancels — but they have no pin on `p.stats.damage`. Add the same pin +
  "nothing extra was collected/reaped in the window" guard. NOTE: the pilot already landed a flash
  guard there this tick (`PROBE_BODY = 'BRUTE'` remap + a `flashTargets(st.enemies)` assertion in
  `contactLoss()`); keep it.
- `test/test_arch_buffs.mjs`: the pilot checked this file — it imports ONLY `src/weapons.js` and
  `src/arches.js` and never boots the main loop, so NO flash reap and no run-loop leak can reach
  its 1e9-hp dummies. Confirm that by reading the file; do not change it unless you find a real
  leak path (tick 10 flagged it without checking; correct the record in your note).
- Scan the other `test/test_*.mjs` that boot the harness (`test/_harness.mjs`) for the same shape:
  a live-loop probe whose expected value depends on state the run itself can mutate mid-window.

## Acceptance bar (measured, not asserted)

- `for i in $(seq 1 200); do node test/test_rewrites.mjs > /dev/null 2>&1 || echo "FAIL $i"; done`
  => **zero** failures out of 200 (this is the number that matters; ~17% red is the current rate).
- `bash /tmp/run_all.sh` => `PASS=60 FAIL=0`, run THREE times back to back.
- Report both raw outputs. Report the before/after flake rate (30-run sample before, 200 after).

## Rules

- No `git commit/checkout/reset/stash/clean` — the orchestrator owns commits.
- One writer per file. Acquire the lock first:
  `AGENT_HUB_PARTICIPANT=<your id> ~/projects/agent-hub/sdk/agentlock acquire --note "dt probe hermeticity"`
  and release it when done, including on failure.
- No emojis. Integer pixels. Report what you could NOT verify, honestly.
- Append a `## TICK NOTE — <date> (dt-probe hermeticity, <your id>)` section at the END of
  `docs/HORDES_GOALS_2026-09-12.md` with: the two leak modes and whether you closed both, the
  200-run result, the 3x suite result, files touched, and anything unverified. Do not edit any
  other part of that doc (the pilot owns status lines).
