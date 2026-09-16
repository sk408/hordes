# G16 SKIP-BAR RESPEC — PART 2: THE QUEUED-DRAFT BLOCKER IN THE VERIFIER

Brief authored by the goal pilot (`subagent:spawnfa`) 2026-09-15, dispatched to `cli:glm-hordes-g8`.
Predecessor: `docs/briefs/G16_SKIP_BAR_RESPEC.md` (item 1 + item 2 landed, HEAD `10b30f9`).
This is a TEST-SIDE slice. It does not change the bar, the predicate, or any game behaviour.

## WHAT THE PILOT MEASURED ON THE CURRENT TREE (raw, three consecutive runs)

`node tools/verify_g16_portal_cine.mjs` run 1 -> rc=1, run 2 -> rc=1, run 3 -> rc=0.
Runs 1 and 2 both died with the SAME hard exception, now carrying the new diagnostic:

    Error: never reached WALK t=2500 (not in cine, mode=draft)
      at tools/verify_g16_portal_cine.mjs:227  (the in-page WALK rAF waiter)
      at tools/verify_g16_portal_cine.mjs:157

Run 3 passed EVERY check, including the re-specified skip:

    ok  (e) REAL gesture skip out in 12.099999904632568ms (< 250ms) to mode=intermission
    ok  TAKE 1 natural end: measured wall duration 6874ms (design 6857ms, bar <= 8000ms), hand-off mode=escape
    ok  (b) PAUSE proof: hero delta 0 / portal region CHANGES 489
    ok  (c) PORTAL DETAIL after=1866 ink / 42 colours vs before=150 ink / 9 colours
    ok  (d) chromeOn() === false BY NAME at WALK/PAUSE/DISSOLVE/LINGER
    VERIFY G16 PORTAL CINE: PASS

**So the skip-bar RED IS CLOSED — the in-page delta is 12.1ms against the untouched 250ms bar.** What is
NOT closed is the tool: it hard-fails 2 runs in 3, which is why the acceptance ("three consecutive runs
reported raw") is unmet. This slice fixes the TOOL, not the bar.

## THE LEADING DIAGNOSIS (CONFIRM OR REFUTE IT — do not assume it)

TAKE 1's real boss kill grants XP -> a level-up queues a draft: `src/main.js` :2570 `state.pendingDrafts++`
with the guard at :2571 `if (state.mode === 'playing') openDraft();`. During the cine the mode is
`portal-cine` (and then `escape`), so the draft is DEFERRED. TAKE 1 then presses Escape
(escape -> intermission) and `c` (intermission -> playing) — and on the return to `playing` the deferred
draft OPENS (`openDraft()` :2681, `state.mode = 'draft'` :2682). The run is then modal on a draft card,
nothing resolves it, and TAKE 2 can never reach the cine:

- TAKE 2's `await p.waitFor(BOSS_LIVE, 10000, 50)` and `await p.waitFor(portal-cine, 15000, 25)` are BARE
  awaits whose booleans are NEVER checked (the "if (!await ...) throw" pattern is used only for the later
  beats), so a silent timeout looks like progress;
- the comment at `tools/verify_g16_portal_cine.mjs` :57-58 says "Wave 1: the cine's natural end hands the
  run to the escape" — the harness knew about the hand-off but not about the queued draft behind it;
- the WALK waiter then evaluates with `state.mode === 'draft'` and reports `not in cine`.

CONFIRM OR REFUTE by instrumenting rather than reasoning: print `state.mode` and `state.pendingDrafts` at
each step boundary of both takes (after the 'c' resume, before BOSS_SEED, after BOSS_LIVE, after BOSS_SLAY,
and inside the WALK waiter's failure object). If the true cause is different, fix the real one and say so.

## SCOPE (test-side ONLY — `tools/verify_g16_portal_cine.mjs` is the file you own)

1. **Resolve TAKE 1's queued draft, then ASSERT the TAKE 2 precondition.** After the return to `playing`,
   handle the pending draft the way the game itself expects — a REAL interaction through the game's own
   path (a real tap on a card, or the key the draft screen's own handler documents at `src/main.js` :5993+),
   never by mutating `state.mode` directly and never by decrementing `state.pendingDrafts` by hand. Then
   wait for `state.mode === 'playing' && state.pendingDrafts === 0`, and make that a HARD precondition:
   if it is not met, throw with a message that names the mode, the pending count and the card count.
2. **Stop swallowing wait failures.** Give the TAKE-2 `BOSS_LIVE`, `BOSS_SLAY` and `portal-cine` waits the
   same `if (!await p.waitFor(...)) throw` treatment the later beats already have, with messages that name
   the observed mode and pending-draft count. A silent timeout must not be able to masquerade as progress.
3. **ADD an assertion from the new evidence (never weaken the old ones).** During TAKE 1's NATURAL movie the
   deferred draft must NOT open: sample `state.mode` across the natural take and assert it never leaves
   `portal-cine` until the movie ends, and print `pendingDrafts` at cine start and cine end (assert it is a
   non-negative INTEGER — do NOT assert a specific value, the XP rolls vary). This is a real correctness
   property of the cine, not a rig detail: a draft must not interrupt the movie.
4. **Prefer whichever of these is cleaner, and SAY WHICH you chose:** (a) resolve the draft in-page as in (1),
   or (b) run TAKE 2 in a FRESH page (a second `withPage`) so the two takes cannot contaminate each other.
   If you take (b), TAKE 1's natural-duration measurement and TAKE 2's sampled beats must both still be real
   live runs — and the pending-draft assertion from (3) still belongs to TAKE 1.

## HARD LIMITS

- **The 250ms bar VALUE and its predicate are UNTOUCHED.** Do not edit the bar constant, do not edit the
  in-page timing method that now reads 12.1ms, and do not introduce a load allowance. A future reading
  >= 250ms is a REAL product latency and gets fixed game-side.
- **No game-code changes.** `src/**` is out of scope for this slice. If your instrumentation PROVES a game
  defect (e.g. the natural cine really does surrender the mode, or a draft genuinely opens DURING the
  movie), that is a FINDING to report — do not fix it here and do not hide it.
- No sims, cohorts, seeds, rates or balance numbers, and no command longer than 60s (owner freeze).
  Each verifier run is a real-browser functional check and takes well under a minute.
- House rules: no emojis, no new timers, integer pixels, and the PNGs still land in
  `docs/art/g16-portal-cine-2026-09-15/`.

## ACCEPTANCE BAR

A. THREE CONSECUTIVE runs of `node tools/verify_g16_portal_cine.mjs`, all `rc=0` with every check `ok`,
   and the RAW output of all three posted (not summarised). The skip line must be the in-page delta and
   under 250ms in each run; the new pending-draft assertion must be printed in each run.
B. `bash tools/run_suite.sh` => `redfiles=0`; any retarget enumerated as `file + line + why`; no assertion
   weakened, deleted, or turned into a no-op.
C. If your instrumentation identifies the true cause as something OTHER than the leading diagnosis above,
   say so in the first line of the verdict with the raw evidence that refuted it.
D. If ANY of the three runs still hard-fails, DO NOT paper over it and DO NOT mark the slice done — report
   the failure verbatim with the mode/pending counts; a residual flake is a finding, not a defeat.

## REPORT FORMAT (post to `hordes` when done)

`done: G16 respec part 2 — <verdict>` then: (1) the verdict with confirm/refute of the diagnosis;
(2) raw evidence: the three runs' key lines, the new assertion's prints, the suite TREE/SUITE lines;
(3) files touched with line ranges; (4) COULD NOT VERIFY, stated rather than omitted. Then END YOUR RUN.

## DISPATCH-TIME SUITE STATE (pilot, 2026-09-15, added at issue time)

`bash tools/run_suite.sh` on this tree, run by the PILOT twice: run A `TREE @ 10b30f9 | dirty=1`,
`SUITE greenfiles=97 redfiles=1`, REDLIST `test/test_rewrites.mjs`; run B `greenfiles=97 redfiles=1`,
REDLIST `test/test_perks.mjs`. Both reds PASS STANDALONE on the same tree (`test_rewrites` PASS=56 FAIL=0,
`test_perks` PASS=15 FAIL=0 twice). Two consecutive suite runs, two DIFFERENT lone reds, both green alone =
the documented lone-red contention class, NOT a landed break and NOT a reason to stop: if your suite run
shows ONE red, re-run that file alone before calling it a break, and report both results. The tick-73
`test_run_purse` intermittent did NOT recur on this tree (3/3 standalone green, 11 checks each).
