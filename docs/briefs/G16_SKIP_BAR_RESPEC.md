# DISPATCH ANCHOR CHECK — FILLED BY THE DISPATCHING PILOT (2026-09-15 22:57 UTC, HEAD `1abf1b3`, dirty=4)

Every anchor below was RE-RESOLVED on the live tree at dispatch, not trusted from author time. Trust the
SYMBOL, not the number.

- `tools/browser.mjs` :166-173 — the real-finger `tap`: `touchStart` -> `await sleep(40)` (:170) -> `touchEnd`.
  That 40 ms sleep is HARNESS overhead and is a large part of why the current reading is not the game's latency.
- `tools/verify_g16_portal_cine.mjs` :238-244 — the skip arm AS WRITTEN: `const s0 = Date.now()` is taken
  BEFORE `p.tap(...)` (:239), then a 40-iteration loop of `await p.sleep(10)` + one CDP `evaluate`
  (`T.state.mode`) per iteration. Both the 40 ms touch sleep and every CDP round trip sit INSIDE the span.
- `tools/verify_g16_portal_cine.mjs` :288-289 — the assertion: message `(e) REAL gesture skip out in <n>ms
  (< 250ms)`, predicate `arm.skipMs !== null && arm.skipMs < 250`. THE BAR VALUE 250 LIVES ONLY HERE (plus the
  message string at :288). DO NOT EDIT IT.
- `tools/verify_g16_portal_cine.mjs` :204 — the WALK-window flake: `if (!await p.waitFor(cineAt(2500), 5000, 20)) throw new Error('never reached WALK t=2500');` — it SAMPLES the window instead of waiting on the beat.
- GAME-SIDE skip path (behaviour is NOT to change; this is the thing being timed): `src/main.js` :5968-5981
  (`state.mode === 'portal-cine'` -> `uiGuard.arm()` -> `endPortalCine()`), :6640-6673 (the overlay capture
  `uiGuard.swallow` listeners, `skipping` :6669 gated by `C.CINE.SKIPPABLE`, `endPortalCine()` :6673),
  `endPortalCine()` defined at :6691, natural advance :7119-7126.
- `C.CINE.SKIPPABLE` = `src/config.js` :414.
- PAGE-SIDE HOOKS AVAILABLE: the tour/harness object exposes `state` (used at :242) and `uiGuard`
  (`src/main.js` :7377-7380); `T.state.mode` leaving `'portal-cine'` IS the transition to be timestamped.
- SUITE STATE AT DISPATCH (pilot-measured on this exact tree): `TREE: /home/claude/projects/hordes @ 1abf1b3 |
  dirty=4`, `SUITE greenfiles=98 redfiles=0`, REDLIST empty.
- KNOWN INTERMITTENT, disclosed at dispatch: `test/test_run_purse.mjs` failed once inside a suite run and twice
  standalone with `Error: AssertionError: 7 corpses credit exactly 237 (got 177)` (:77), then passed 6
  consecutive runs (5 standalone + 1 suite, `test_run_purse: 11 checks passed`). If THAT red appears, re-run
  `node test/test_run_purse.mjs` standalone before touching anything: it is a known intermittent, not your
  regression. Do NOT fix or weaken it in this slice. If it fails standalone twice in a row, post `blocked:`
  with the raw line.

# G16 FOLLOW-UP — RE-SPEC THE SKIP-BAR INSTRUMENT (the one assertion still red)

Owner of the ruling: Remy, orchestrator, 2026-09-15 (recorded in `docs/HORDES_GOALS_2026-09-12.md`,
section "G16 SKIP-BAR RULING"). This slice EXISTS to execute that ruling and nothing else.

## WHY THIS SLICE EXISTS (the red, stated honestly)

G16 (portal-entry cinematic) was BUILT, LANDED and COMMITTED (`1abf1b3`) and every content check passes.
ONE assertion in its verifier is RED and was NOT waived and NOT weakened:

- `node tools/verify_g16_portal_cine.mjs` run by the pilot THREE times: run 1 died with the hard exception
  `Error: never reached WALK t=2500` at `tools/verify_g16_portal_cine.mjs:204` (a missed sample window in
  `p.waitFor(cineAt(2500), 5000, 20)`); runs 2 and 3 passed every content check and failed ONLY
  `(e) REAL gesture skip out in 262ms (< 250ms)` and `306ms (< 250ms)`. The builder read 243ms once.
- The bar VALUE stays 250ms. **What is wrong is the INSTRUMENT, not necessarily the game.**

## THE RULING, VERBATIM (execute this)

> "The reading as written spans CDP round-trips AND the harness's own 40ms touch sleep, i.e. it measures
> the test rig, not the game — a build that responds in 150ms can read 250ms+ purely from tooling
> overhead. Re-spec the check to time the skip IN-PAGE: from the `pointerup`/`touchend` dispatch inside
> the page to the observed mode transition, with the harness overhead explicitly excluded and the reason
> stated in the tool. This is a legitimate retarget under the house rule (file + line + why), NOT a
> weakening: the number does not move, only what is being measured. **If the in-page delta still exceeds
> 250ms, that is a REAL finding and gets fixed rather than re-specified again.** Also note run 1's
> separate failure (missed the WALK window, :204 hard exception) — that is a flaky window in the verifier,
> not a cine defect; make the window detection wait on the beat rather than sampling it."

## SCOPE — THE THREE CHANGES (all three are required)

1. **IN-PAGE TIMING.** The skip delta must be measured inside the page: take the timestamp at the
   in-page `pointerup`/`touchend` dispatch (the game's own handler), and stop it at the observed mode
   transition, both read in the SAME page-side clock — e.g. a page-side hook that records
   `performance.now()` on the listener and on the mode change, read back with ONE `evaluate` after the
   fact instead of a CDP poll loop per iteration. Harness sleeps (the `p.tap()` `sleep(40ms)` between
   touchStart and touchEnd, `tools/browser.mjs` :169-171) and CDP round trips MUST NOT be inside the
   measured span. **State the reason and the excluded overhead in a comment in the tool** so the retarget
   is auditable under the house rule.
2. **THE WALK-WINDOW FLAKE.** `tools/verify_g16_portal_cine.mjs` :204's `waitFor(cineAt(2500), 5000, 20)`
   samples a window instead of waiting for the beat. Make it wait on the beat (poll until the cine clock
   is inside the window, or drive the cine's own advance seam so the sample cannot be missed), so three
   consecutive runs are stable. A verifier that dies 1-in-3 is not evidence.
3. **REPORT THE TRUTH EITHER WAY.** Run the retargeted verifier at least THREE times and report all three
   readings. If the in-page delta is `< 250ms`, G16's red is closed with the raw numbers. **If the in-page
   delta is still `>= 250ms`, that is a REAL product latency: fix the game side (the skip path), do not
   re-spec the instrument again and do not touch the bar.**

## HOUSE RULES (binding)

- NO git state commands (commit/checkout/reset/stash/clean). Leave the tree dirty and report the dirty count.
- NO EMOJIS. Integer pixels. 60Hz AND 120Hz both correct — nothing may assume a fixed dt.
- **THE OWNER'S STANDING 60-SECOND CAP:** no single command over 60s of wall clock. This slice is
  browser-functional only — it boots the loop and plays nothing, so the cap is not at risk; still, no
  cohort, no sim, no maxed run.
- `bash tools/run_suite.sh` must end `redfiles=0` (banner quoted verbatim). An assertion may be RETARGETED
  (file + line + why, enumerated) but NEVER weakened, deleted or no-op'd. Do not edit the 250ms number.
- Do NOT touch `src/portal_cine.js`'s content behaviour, the four cinematic beats, the chrome gate or
  `uiGuard`. The accepted PASS evidence (natural cine 6873/6888ms, PAUSE hero delta 0 / portal delta 489,
  chrome OFF at all four beats, 4 PNGs in `docs/art/g16-portal-cine-2026-09-15/`) must stay reproducible.
- Heartbeat: append to `/tmp/g16_respec_progress.log` before and after every long step.
- Post `done:`/`blocked:`/`checkpoint:` to hordes FIRST, then raw evidence, then end the run cleanly.

## ACCEPTANCE BAR

1. `bash tools/run_suite.sh` -> `redfiles=0`, banner quoted verbatim.
2. The measured span is demonstrably in-page: quote the code that takes both timestamps page-side and name
   the harness overhead it excludes (`tools/browser.mjs` :169-171's 40ms sleep + the CDP round trips).
3. THREE consecutive runs of the retargeted verifier, each with its raw reading, and every OTHER check in
   it still passing (the content checks must not be relaxed to make room for the timing change).
4. The WALK-window flake is gone: the beat is waited on, not sampled, and three consecutive runs reach it.
5. Verdict stated plainly: either `in-page delta < 250ms` (red closed, number quoted) or `in-page delta >=
   250ms` (REAL latency, plus the game-side fix and its own before/after measurement).
6. Files touched named; dirty count reported; explicit COULD NOT VERIFY section.

## REPORT FORMAT

- TREE /home/claude/projects/hordes @ <HEAD> | dirty=<n>, suite banner verbatim.
- The three raw readings + the excluded-overhead code quote + the enumerate retarget list (file + line + why).
- The verdict line (closed vs real latency), then the COULD NOT VERIFY section.
