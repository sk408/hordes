# NIGHT LOOP defect investigation — 2026-09-17

Owner report (msg_01M2R215CVF9EY53EXJMRD229X): "I turned on the overnight mode,
but it's still sitting on the end of run summary instead of starting a new run
after a few seconds."

## Reproduction attempts (real browser, phone viewport 390x844, fresh + rich profiles)

| arm | path exercised | result |
|-----|----------------|--------|
| 1 | `die()` seam → end card → auto-RETRY | restarts at 3.0s (NIGHT_RESTART_S) |
| 2 | 30:00 run-survived card → auto-RETRY | restarts at ~3s |
| 3 | natural combat deaths, 6 consecutive cycles | each restarts at ~3s |
| 4 | wave-1 clear → portal cine skip → escape skip → intermission → CONTINUE → wave-2 death → RETRY | every delay as named |
| 5 | rich profile (purchases, records, stage select) both end cards | restarts at 3s |

**The reported defect did not reproduce on HEAD.** The complete night mode,
including the end-card auto-RETRY, landed in commit c0aab00 (15:44); the report
arrived 16:08. The most probable cause is a page still running a pre-15:44
build (a reload ends the night — the toggle is session-scoped by design), or a
single-press ARMED state read as ON (the run then plays under the persisted
AUTO pilot pref and LOOKS fully automatic, but `nightRun` is false, so the end
card parks — exactly the reported symptom).

## What was fixed regardless

1. **The test gap was real** (asserting mode flags, not player-visible flow):
   - `tools/verify_night_loop.mjs` — REAL browser, phone viewport, drives the
     actual UI (SETUP → two presses on NIGHT MODE → START GAME → the fresh
     profile's HOW TO PLAY gate), then asserts OBSERVABLE state only: the
     summary card gone from the DOM, run clock at 0, wave ladder advanced.
     Every wait is delay + grace then FAIL (a watchdog shape — the tool never
     waits forever). 13 checks, all green on HEAD.
   - **Red run**: with the two auto-RETRY arm sites sabotaged (the defect
     shape), the tool fails exactly on "the summary auto-dismissed and a NEW
     run started" and "a second death also auto-restarts" — proof the check
     catches the reported behaviour. Restored after.
   - `test_night_mode.mjs` gained observable assertions (endScreen cleared,
     clock restarted, run counters reset) and watchdog checks.

2. **NO-WEDGE guarantee added** (the smallest thing that makes "a night run
   never parks" structural): the NIGHT STALL WATCHDOG (`NIGHT_STALL_S` 30s,
   src/config.js AUTOPILOT). Any single waiting mode of the run ladder
   (dead / intermission / escape / draft / portal-cine / death-cine) held
   longer than 30s is advanced through that mode's own sanctioned action —
   the same call its named timer makes. Never fires on playing/finale (the
   run is moving), title/intro (human surfaces), or settings/stats (a present
   human reading). The red run demonstrated it live: with the named timers
   sabotaged, the watchdog restarted the parked run at 30s and the ladder
   checks after it passed.

## Auto paths, delays as named (all verified end-to-end in the real browser)

- draft auto-pick: 6.0s (DRAFT_TIMEOUT), night policy = highest tier, first slot on tie
- escape auto-skip: immediate on entry (the one sanctioned content skip)
- intermission CONTINUE: 3.0s (NIGHT_CONTINUE_S)
- end-card RETRY: 3.0s (NIGHT_RESTART_S), death and survival cards
- any other waiting mode: 30s backstop (NIGHT_STALL_S)
- toggle: OFF by default, two-press confirm, session-only (reload ends it)

## Balance

No balance constant changed. The 50% gold penalty, CONTINUE/RESTART delays are
untouched; NIGHT_STALL_S is a new backstop only.

## Evidence

- `night-loop-second-run.png` — the second run playing on its own after a death
- `night-loop-after-second-death.png` — the loop still turning after a second death
