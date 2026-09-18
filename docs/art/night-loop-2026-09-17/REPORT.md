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

---

# FOLLOW-UP 2026-09-18 — the re-run found one more wedge + two verifier races

The owner's interrupt re-asked for this task; the post-death restart itself
was already fixed (above). Re-running `tools/verify_night_loop.mjs` on the
current tree surfaced two FALSE REDS in the tool and one REAL gap in the game:

## The real gap: the EVOLUTION overlay had NO auto path (fixed)

`maybeOpenEvolve()` (main.js) is a human-click-only screen — EVOLVE cards /
NOT NOW. It was missing from BOTH the named timers AND the watchdog's mode
list, so an unattended run that banks a token over a maxed weapon parked on
the EVOLUTION screen FOREVER: exactly the "standing still" failure class this
task says can never happen. Fix, same shape as the siblings:

- **NIGHT_EVOLVE_S = 3.0s** (config AUTOPILOT): when the overlay opens on a
  night run the timer arms; on expiry the night takes the FIRST candidate —
  the draft policy's own first-slot rule — through `doEvolve(w)`, the SAME
  function the card's own onclick now calls (one implementation, shared).
- The watchdog's mode list gains `evolve`, with the same action as the timer.
- No run-boundary leak: `startRun()` clears the timer with its siblings.

Node-suite proof (test_night_mode.mjs, new section 6d): the overlay opens
through the REAL path (max a weapon, bank a token, equip the item kind, one
update tick — no direct mode writes), arms at the named value, still up at
2.9s, takes the candidate at 3.0s, the weapon actually evolves; and the
disarmed-timer counter-case (the pre-fix wedge shape) is closed by the
watchdog inside NIGHT_STALL_S.

## The two verifier false reds (the tool now pins the real contracts)

1. **"portal cine skipped" raced its own chain**: the night skips the cine AND
   the escape synchronously in one tick, so the transient `escape` mode is
   unobservable between polls — and the hand-off can legally take >15s (the
   ring caught it: `draft > playing > draft > playing > escape >
   intermission` — level-up drafts open mid-sweep and auto-resolve on their
   own 6s window BEFORE the intermission). The check now proves the skip by
   SAMPLING: a 250ms mode ring runs from before the boss falls; a PLAYED cine
   holds `portal-cine` for its full 6.857s (~27 samples), the skip never
   samples. "Intermission reached + no portal-cine in the ring" is the proof.
2. **"no draft in 150s" was the tool's own doing + a real pilot defect**:
   the force-clear parks `spawnTimer` at 1e9, suppressing ALL later spawning
   (released now); and the AUTO pilot STALLS NEAR THE ARENA RIM — the known
   queued defect, measured here: kills frozen at 4 with 400+ enemies on the
   field and the frame loop alive (time advancing), so gems drop but are
   never walked over and no XP ever levels the run. The arm now drives the
   REAL level-up (a gem seeded at the pilot's feet, makeGem's exact shape)
   and asserts the auto-PICK on the documented window. The pilot stall
   remains open under its own task.

## State after the follow-up

- `tools/verify_night_loop.mjs`: **13/13 green** in the real browser at
  390x844 (off-by-default, two-press on, summary shows on death, auto-dismiss
  into a new run within RESTART_S+grace, boss ladder, cine skip proven by
  sampling, escape skip, CONTINUE at 3.0s, draft auto-pick at 6.0s, second
  death restarts, zero page errors).
- `test/test_night_mode.mjs`: all checks green incl. the two new evolve pins.
- Full suite: **151 files / 0 red**.

## Auto paths, delays as named (updated)

- draft auto-pick: 6.0s (DRAFT_TIMEOUT), highest tier / first slot
- EVOLUTION overlay: 3.0s (NIGHT_EVOLVE_S, NEW), first candidate
- escape auto-skip: immediate on entry
- intermission CONTINUE: 3.0s (NIGHT_CONTINUE_S)
- end-card RETRY: 3.0s (NIGHT_RESTART_S)
- any other waiting mode (now incl. evolve): 30s backstop (NIGHT_STALL_S)
- toggle: OFF by default, two-press confirm, session-only

## Balance (unchanged)

No balance constant moved: the 50% gold penalty and every existing delay are
byte-identical; NIGHT_EVOLVE_S is a new timing constant only, and it spends a
token the run already owned on the same evolution a human click would buy.
