# INVINCIBILITY INVESTIGATION — "a player was able to become invincible" (owner report, 2026-09-16)

Owner, verbatim: **"User reports that they were able to become invincible. We need to see whether we can find
the mechanics that are allowing this. It's only been available for a couple hours so it has to be a series of
upgrades and or cards and or shrines and or chests that can be acquired in the first couple hours at most."**

**THIS IS A FIND-IT TASK, NOT A FIX-IT TASK.** Locate the mechanics, prove them, and report. Do NOT change
balance or code. A fix is a separate dispatch, and the owner wants to see the mechanics first.

## CANDIDATE SEAMS ALREADY LOCATED (start here, do not re-hunt from scratch)
1. **The portal-approach invulnerability — the hottest lead.** `src/main.js` :1731-1737: while the portal is
   open and the pilot is steering, `p.invuln` is refreshed EVERY FRAME to `C.PORTAL.INVULN` (0.1s), AUTO only
   (`!pilotMovesYou()`). `p.invuln` is decremented once per frame at :1699. **If `state.portal` can persist
   while the player keeps playing (rather than entering immediately), an AUTO player is continuously
   invulnerable — a renewable, not a one-shot.** Establish exactly when the portal opens, what keeps it open,
   whether the player can decline it and keep playing, and whether MANUAL players get it too. See also
   `src/controllers.js` :243-253, :303 and `src/config.js` :418-421.
2. **SHIELD absorption stacking.** `src/arches.js` :21, :109-116: `shieldHits` SUMS across arches and the W7A
   arch-buff model landed **today** (`ad9cc90`). Determine whether shields renew, stack without bound, or
   re-grant on re-entry.
3. **FORTIFY.** `src/config.js` :210-211 (`FORTIFY_TIME 3`, `FORTIFY_MULT 0.5`) applied in the one funnel
   `damageTakenFortified()` (`main.js` :653-659). Halving, but establish whether it can be kept permanently on.
4. **The hit cap masks burst.** `src/config.js` :69 `HIT_CAP_FRAC: 0.5`, applied at `src/entities.js` :85-94 —
   a single hit never takes more than half of max HP, so two hits are always needed. Combined with any
   incoming-heal, that alone can produce "cannot die".
5. **Heal-outpacing (a previously MEASURED defect — reuse it).** Owner feedback item (a) in
   `docs/HORDES_GOALS_2026-09-12.md` recorded: 4471 heal writes in 288s (~15/s), healed **4528.8** vs **4162.5**
   taken, healing won 2 of 3 runs, contributors `lifesteal 0 -> 0.06`, `applyRegrowth` (`main.js` :1308) and
   level-up heals (`main.js` :1921). Also `src/config.js` :235-237 — a heal-per-kill banked per tick, already
   capped so it "cannot out-heal a boss": check that cap is actually live and what it caps to.
6. Chests / evolutions / shrines / rules / perks that heal, shield, revive or grant immunity
   (`src/chests.js`, `src/shrines.js`, `src/evolutions.js`, `src/rules.js`, `src/perks.js`), and anything
   granting `p.invuln` or `SECOND_WIND_INVULN` (`config.js` :850).

## THE QUESTION TO ANSWER
**What is the SHORTEST acquisition path that makes the player unkillable, and is it reachable within roughly
two hours of play?** The owner's constraint is the search space: whatever it is, it is composed of things
acquirable early, not apex/endgame items. Use the measured economy to judge reachability (`tools/run_curve.mjs`
/ `tools/economy_ledger.mjs`: fresh ~51k gold/hour, partial ~21k, maxed ~1.5M) and the shop catalogue prices.

Also check whether the exploit COINCIDES with a recent change: `git log --date=short --pretty='%h %ad %s' -40`
and look for anything touching invulnerability, shields, arch buffs (W7A landed today in `ad9cc90`), healing,
the hit cap, or the reprice. If a recent commit introduced it, say which and quote the hunk.

## WHAT TO DELIVER
1. **A mechanic inventory**, one row per candidate: what it does | file:line | how it is acquired (shop row /
   draft card / shrine / chest / arch / rule / perk) | is it RENEWABLE (self-sustaining) or a one-shot |
   does it scale with anything | VERDICT (can this alone or in combination remove incoming damage entirely?).
2. **The minimal combo**, with the exact items/cards/shrines named, and the acquisition cost + estimated time
   to reach at the measured gold rates.
3. **AN EMPIRICAL REPRO, bounded.** Prove it rather than argue it: stage a profile with the combo through the
   existing seam (`tools/real_loop.mjs` `stageProfile()`) and run **<= 60 seconds per command** (the owner's
   standing cap — a check that cannot fit is dropped, never given a bigger timeout). Measure damage taken, HP
   floor, and deaths for the combo vs a CONTROL run of the same length without it. Report raw numbers. If the
   cleanest proof is a browser check (e.g. open a portal and do not enter, then take a hit), do that instead —
   it is bounded and more direct.
4. **The verdict**: which single mechanic is most likely what the player hit, and your confidence, stated
   plainly. If you cannot reproduce it, say so — a documented "not reproduced, here is what I ruled out and
   how" is a valid and useful result, and better than a plausible story.
5. `COULD NOT VERIFY` section, files touched (should be none outside docs/), and the dirty count.

## HOUSE RULES
Read-only investigation: do not edit game code. No `git commit/checkout/reset/stash/clean`. No sim or
measurement command may exceed 60 seconds of wall clock. Note: another process may be running the full suite
for a push in the first few minutes of your run — do the STATIC analysis first, and hold your bounded runs
until `/tmp/hordes_push31.log` shows `G31_PUSH_DONE`, so your runs and its gate do not fight over CPU (the
suite is timing-sensitive). Post `done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw
evidence. Heartbeat `/tmp/invuln_progress.log` before and after every step that can exceed a few seconds.
Then END YOUR RUN cleanly.
