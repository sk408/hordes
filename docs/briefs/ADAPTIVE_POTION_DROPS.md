# ADAPTIVE POTION DROPS — drop rate falls as kills/second rises (owner directive, 2026-09-16)

Owner, verbatim: **"we should have adaptive potion drops as the enemies killed per second increases, potion
drop rate should drop in a somewhat inverse pattern"**

## THE CURRENT STATE (measured)
`src/config.js` POTIONS: `DROP_CHANCE: 0.03` **per enemy kill, flat**, `MAX_CARRIED: 3`, `HP_HEAL: 35`,
`START: 1`, plus the boss-fight halving ("boss curse"). AUTO_DRINK consumes automatically below an HP
fraction with a **1.5s per-kind cooldown** (`config.js` :321-325). A flat per-kill chance makes potion income
scale **LINEARLY with kill rate**, so in a dense swarm the supply refills faster than the cooldown can spend
it and potions stop being a scarce resource. That is the thing to fix.

## THE SHAPE TO IMPLEMENT — make the income go FLAT, not just smaller
"Somewhat inverse" has a precise engineering reading. Use:

    dropChance = BASE * clamp(REF_KPS / kps, FLOOR_FRAC, 1)

- `BASE` stays **0.03**, and at or below `REF_KPS` the chance is EXACTLY base: **the early game must be
  byte-identical.** Do not touch the low-rate end.
- Above `REF_KPS` the chance falls off roughly inverse to the kill rate.
- `FLOOR_FRAC` keeps a floor (pick a value around 0.2-0.3 and justify it) so drops never vanish entirely —
  a swarm should still drop SOMETHING or the feel breaks.
- **The property that matters, and the one to assert:** effective income is
  `potions/second = kps * dropChance = BASE * min(kps, REF_KPS)` — linear below the reference, then **FLAT**.
  Potion income must stop scaling with the swarm. That flat asymptote is the whole point of the change; a
  curve that merely declines slowly while income still grows without bound does NOT satisfy it.

`REF_KPS` MUST be derived from a MEASUREMENT, not invented: measure the actual kills/second in a mid-run
swarm (bounded — **<= 60 seconds per command**, the owner's standing cap, via `tools/real_loop.mjs`) and set
the reference so ordinary play is unaffected and only swarm-density rates bend the curve. Report the number
and its source log.

## IMPLEMENTATION NOTES
- Estimate a rolling kills/second on the existing kill path (the kill-XP site around `main.js` :2378, or the
  drop-roll site in `src/loot.js`). An exponentially weighted rate with a ~5-10s time constant is enough —
  it must track a swarm building and relax when the player disengages.
- **dt-driven, never wall-clock.** No `Date.now()`/`performance.now()` in the rate estimator; no per-kill
  allocation in the hot path.
- Keep the roll deterministic under the **existing rng seam** (`dropChance`-style injectable `rng`) so a test
  can pin the outcome.
- `MAX_CARRIED`, `HP_HEAL`, `START` and the boss curse are UNCHANGED.
- Put the knobs in `CONFIG` with the owner's words in the comment, following the `AUTO_DRINK` / `AUTO_CAST`
  comment convention.

## ACCEPTANCE
1. **Unit test** (`test/test_potion_drops.mjs`): at kps = 0 and at low rates the chance equals BASE EXACTLY
   (early game unchanged); the curve is monotonically non-increasing above the reference; the floor holds as
   kps grows large; the derived income is linear below the reference and FLAT above it (assert the asymptote
   numerically, not qualitatively); the rate estimator is dt-driven and DECAYS correctly when kills stop
   (feed it a burst, then quiet ticks, and assert the rate comes back down); `MAX_CARRIED` still bounds
   storage.
2. **Bounded measurement** (<= 60s per command): two swarm densities, reporting kills/min, the chance in
   effect, potions/min dropped, and potions actually consumed — showing the income does not scale linearly
   with kill rate. Raw numbers in the report.
3. `bash tools/run_suite.sh` ends `redfiles=0`; no existing assertion weakened or deleted. If a test pins the
   flat 0.03, retarget it to read the curve at a LOW rate (where base still applies) rather than deleting it.
4. Report: the measured `REF_KPS` with its source, a curve table (kps -> chance -> potions/min), the chosen
   floor with its justification, files touched, and a `COULD NOT VERIFY` section.

## HOUSE RULES
No emojis. No `git commit/checkout/reset/stash/clean` — leave the tree dirty and report the dirty count. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/potiondrops_progress.log` before and after every step that can exceed a few seconds. Nothing may exceed
60 seconds of wall clock per command. Then END YOUR RUN cleanly.
