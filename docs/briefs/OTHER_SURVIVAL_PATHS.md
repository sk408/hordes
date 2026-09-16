# OTHER SURVIVAL PATHS — unseeded hunt (owner request, 2026-09-16)

Owner, verbatim: **"and then ask glm to look for other paths and don't provide theories"**

## THE SYMPTOM
A player can stay alive without apparently taking damage. That is the whole brief.

## WHAT IS ALREADY KNOWN AND OUT OF SCOPE
ONE path has already been found, measured and fixed: **uncapped lifesteal heal throughput multiplied by the
compounding damage shop** (`src/main.js` :1859; findings in
`docs/briefs/INVINCIBILITY_FINDINGS_2026-09-16.md`; fix in `docs/briefs/LIFESTEAL_RATE_CAP.md`). Do NOT
re-report that mechanism or re-measure it — it is dealt with. The question is whether there are OTHER paths to
the same symptom.

## METHOD — you get no theories
You are deliberately given **no candidate mechanisms, no leads, no file:line pointers**. Do not ask for them and
do not anchor on prior briefs or goal-doc notes; the previous rounds of this were seeded with the
orchestrator's guesses and chased them instead of the symptom. Instead:

1. **Map the space yourself**: every code path where the player's HP decreases, and every path where damage to
   the player is gated, negated, reduced or undone — enumerate them from the code.
2. **Map the early game**: anything reachable in roughly the first couple of hours of play (early shop rows,
   common draft cards, arches, shrines, chests, evolutions, rules, perks, character rows, meta upgrades).
3. **Test by prediction**: for each plausible candidate, state what it predicts about observable state, then
   test THAT. Bounded: **<= 60 seconds of wall clock per command** (the owner's standing cap — a check that
   does not fit is DROPPED, never given a bigger timeout). The real loop harness is `tools/real_loop.mjs`
   (`bootReal()`, `stageProfile()`, `runRealCohort()`); one `bootReal()` per process.
4. **Always run a control** of the same length with the candidate absent, and report both sides.

"Apparently taking no damage" spans a family — hunt all of it: damage negated entirely; damage reduced to a
fraction any incidental healing covers; HP restored as fast as it is lost (other than the known lifesteal
path); the lethal case prevented; or a state the player can enter and REMAIN in which suppresses damage.

## DELIVERABLE
1. **Each path found**, named, with file:line, how the player acquires it and how early, and why it prevents
   damage — plus whether it is mode-agnostic or AUTO/MANUAL-specific.
2. **The evidence**: raw output of a bounded run against a control (damage taken, HP floor, deaths, heal/s), or
   a browser check, or a computed rate comparison with the numbers shown.
3. **A verdict per path** with your confidence. **"No other path found; here is what I enumerated and ruled
   out, and how" is a VALID and valuable result** — do not fabricate a repro and do not present a plausible
   story as a finding. An honest null is worth more here than a confident guess.
4. Report anything else broken or unverified you trip over on the way.

## HOUSE RULES
Read-only: no game-code edits, no fixes, no balance changes — the owner decides after seeing findings. No
`git commit/checkout/reset/stash/clean`. Nothing may exceed 60 seconds of wall clock per command. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/otherpaths_progress.log` before and after every step that can exceed a few seconds. Then END YOUR RUN.
