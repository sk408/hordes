# HARVEST HEAL CAP — extend the sustained-healing budget (owner call, 2026-09-16)

Owner, verbatim: **"Ok let's fix it, yeah"** — the second path found by the unseeded hunt
(`docs/briefs/OTHER_SURVIVAL_PATHS_FINDINGS_2026-09-16.md`).

## THE DEFECT (measured, do not re-investigate)
**GRAVE HARVEST, the SCYTHE weapon's evolution, heals 2 HP per kill per sweep with NO rate cap**
(`src/weapons.js` :542-543, `evoHas(weapon, 'harvestSouls')`; evolution def `src/evolutions.js` :81-87). Same
defect family as G34 — heal throughput proportional to KILL RATE against a bounded inbound (~0.83 x maxHp/s
ceiling) — but at a site **G34's token bucket does not cover**: the bucket caps the `stats.lifesteal` heal
sites (`main.js` :1878, :7326) only.

MEASURED, post-G34 build: the acceptance arm (FE5 + lifesteal 0.15, no scythe) DIES @45s; the SAME arm plus a
maxed evolved SCYTHE is **ALIVE @300s, HP floor 18/298, peak 89.6 kills/s**, and harvest pays up to ~179 HP/s
at those rates — more than double the 0.25 x maxHp/s cap. The symptom returns through a second door.

## THE FIX: ONE SHARED SUSTAINED-HEALING BUDGET
Do not add a second independent cap. Make the existing budget **SHARED across throughput heal sources** so no
combination can exceed it:

- **One seam**, e.g. `spendHealBudget(state, amount)` + its refill, refilling at `HEAL_CAP_FRAC * maxHp` PER
  SECOND (dt-driven, never wall clock), never accumulating beyond one second's worth. Reuse G34's value unless
  the harvest arithmetic argues otherwise — if you change it, derive the new number from the measured inbound
  and the harvest rates above and justify it.
- **Route BOTH existing throughput sites through it**: the lifesteal heal (`main.js`) and the harvest heal
  (`weapons.js`). `weapons.js` is a separate module, so put the seam somewhere both can import (a small
  `src/heal.js`, or an existing shared module — your choice, ONE seam).
- **BOUNDARY — state it in the code comment:** the budget governs THROUGHPUT heals (heal proportional to
  damage dealt or kills). Deliberate consumables (potions) and flat small sources (regrowth) do NOT route
  through it: a potion must stay a burst escape. The altar is already independently capped
  (`config.js` :236-237) — either route it through the shared budget or state why not.
- **COMPLETENESS PASS (required):** enumerate EVERY heal source in the codebase and state, per source, whether
  it routes through the budget. Any THROUGHPUT source that does not must be routed or explicitly justified in
  the report — this defect has now appeared at two sites, so a third one must not be assumed away.

## ACCEPTANCE
1. **Unit test** (`test/test_heal_budget.mjs`, or extend `test/test_lifesteal_cap.mjs` — your call): the harvest
   heal draws the SHARED budget (a sweep killing N enemies cannot heal more than the remaining budget); lifesteal
   and harvest combined under absurd inputs never exceed `HEAL_CAP_FRAC * maxHp` per second (assert the number);
   potions, regrowth and the altar are UNAFFECTED (assert their amounts unchanged); below the cap every source
   equals its pre-change formula; dt-driven under unequal dt steps; the budget resets per run.
2. **Bounded re-measurement** (`<= 60 SECONDS WALL PER COMMAND`, the owner's standing cap, `tools/real_loop.mjs`):
   re-run the G35 stacked arm (FE5 + lifesteal 0.15 + maxed evolved SCYTHE) and show it no longer survives
   indefinitely — report damage taken, healed, heal/s, HP floor and deaths vs the unmatched control. Include ONE
   arm at a MODEST kill rate proving harvest still functions normally when it is not at the cap (the fix must not
   gut the evolution).
3. `bash tools/run_suite.sh` ends `redfiles=0`; nothing weakened. If a test pins uncapped harvest, report it with
   file:line and retarget it to a rate assertion — never delete it.
4. Report: the shipped `HEAL_CAP_FRAC` and whether it moved from G34's (with the derivation), the heal-source
   completeness table, the before/after arms, files touched, and a `COULD NOT VERIFY` section.

## HOUSE RULES
No emojis. No `git commit/checkout/reset/stash/clean` — leave the tree dirty and report the dirty count. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/healbudget_progress.log` before and after every step that can exceed a few seconds. Nothing may exceed 60
seconds of wall clock per command. Then END YOUR RUN cleanly.
