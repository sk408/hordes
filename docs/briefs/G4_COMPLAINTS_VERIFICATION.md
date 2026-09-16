# G4 — PLAYTEST COMPLAINTS, VERIFIED ITEM BY ITEM AGAINST THE BUILD

Brief authored by the goal pilot (`subagent:spawnfa`) 2026-09-16, dispatched to `cli:glm-hordes-g8`.
Owner goal: G4 — PLAYTEST COMPLAINTS CLOSED, `docs/HORDES_GOALS_2026-09-12.md` :2059-2068 (the eight
verbatim galaxy.click complaints). BUILD_PLAN W10 ("walk every goal, re-check the original playtest
complaints item by item") and completion bar items 4 and 5 (real-browser + phone form factor).
**THIS IS A VERIFICATION SLICE. It writes NO game behaviour.** Its deliverable is a machine-checkable
harness plus honest per-item verdicts.

## DISPATCH ANCHOR CHECK — RE-RESOLVED on the tree you are receiving (HEAD `7373953`, dirty=2) at dispatch 2026-09-16 02:15 UTC

- `git log --oneline -1` => `7373953 G19 slice 1 ... + G19 slice 2 ... + G16 red closure`. Tree is CLEAN of
  code edits; dirty=2 = two PNGs the pilot's own verifier re-ran under `docs/art/g19-specialisation-2026-09-16/`.
  `bash tools/run_suite.sh` => `SUITE greenfiles=100 redfiles=0`, REDLIST empty (pilot-run this tick).
- The complaint list you are verifying: `docs/HORDES_GOALS_2026-09-12.md` :2059-2068, eight numbered items.
- `src/tour.js` :28 `TOUR_KEYS` — the coachmark keys. COUNT them on this tree and report the number
  (the G19 slice-1 builder found 20 where an earlier brief said 19; slice 2's verifier measured 20).
- `src/main.js` :3554-3563 the HOW TO PLAY overlay (`ovTitle.textContent = 'HOW TO PLAY'`), auto-popped once
  on first boot; the title menu keeps a HOW TO PLAY card.
- `src/main.js` :185 `KEY_RESOLUTION`, :186 `RES_MODES = ['AUTO','PIXEL-PERFECT','2','3','4']`.
- `src/render.js` :1474-1489 the XP BAR region (label `'XP'` at :1489; the WAVE-24 note at :1481 records
  the empty-trough-is-drawn fix — that is the claim item 2 asks you to check).
- `src/main.js` :3748 the never-break rule comment recording that EXIT-RUN is taught at the in-run cog;
  `src/main.js` :3806 is the tour target `cardByTitle('EXIT GAME')`.
- `src/main.js` :232, :247-248 the chrome/overlap gate that reads `#hints` when it carries `.on`.
- `tools/browser.mjs` :32 `serveRoot`, :75 `withPage` — the shared real-Chrome harness (reuse it; do not
  write a second browser driver).
If any anchor is stale, re-resolve it by grep and SAY SO in the report. If a symbol is gone, post
`blocked:` with the grep you ran rather than guessing.

## SCOPE — build exactly these three things

**(1) `tools/verify_g4_complaints.mjs` (NEW) — the harness.** Walks the EIGHT complaints in order. Runs in
REAL Chrome via `tools/browser.mjs` at **390x844 @dpr3** (the owner plays on his phone), sets ALL
`TOUR_KEYS` on the tree (count them, print the count), and **asserts `state.time > 1.0` BEFORE any
measurement** — a code claim is not evidence for anything a player looks at.

- It MUST support per-item arms: `node tools/verify_g4_complaints.mjs --item N` (N = 1..8) and a full run
  with no flag. Each arm PRINTS its own wall-clock ms. **No single command may exceed 60 seconds of wall
  clock** (owner directive, goals doc top); if the full walk cannot fit, split it and say so.
- One PNG per arm into `docs/art/g4-complaints-2026-09-16/`, exactly 1170x2532 (390x844 @dpr3), each with
  a printed one-line label of what it shows.
- It prints, at the end, a machine-readable summary: one line per complaint,
  `G4 ITEM <n> | <VERIFIED FIXED|STILL TRUE|NOT VERIFIABLE> | <the measured numbers> | <png>`.
- **Exit code rule:** rc=0 when the report was produced (an honest `STILL TRUE` is a VALID outcome and must
  NOT be turned into a red). rc=1 if a check COULD NOT RUN (missing element, timeout, console error,
  harness breakage) — that is the harness failing, not the game.
- Zero console errors is itself a measured item (complaint 8) — collect them, do not swallow them.

**(2) The per-item checks — measure something programmatic for each. Suggested strongest instrument for
each (you may improve it, but do not replace measurement with presence-only assertions where a
measurement is possible):**

1. *"no idea what is going on at all"* — tour + hints panel + on-screen labels: assert the first-run tour
   fires (stage1/hud keys consumed through the real loop), assert the hints panel can be toggled with a REAL
   tap/click and that it renders a NON-ZERO number of hint lines (print the count), and assert the on-screen
   labels exist (radar legend / doctrine label / XP label) by read-back of live DOM or measured HUD pixels.
2. *"there's no xp bar"* — the bar exists AND its EMPTY state reads as a bar: at t≈0 sample the trough
   geometry and colours (the empty trough must be drawn, not background); then grant XP (real seam) and
   assert the filled pixels differ from the empty capture (print both ink counts + the pixel delta).
3. *"no tutorial"* — the first-run tour + HOW TO PLAY + hints: print the TOUR_KEYS count, drive the real
   key/tap path that opens HOW TO PLAY, assert the overlay is visible and carries non-empty copy (print the
   first line), assert the tour's coachmark total is >= 15 (print the number you find).
4. *"the large text is very fuzzy"* — resolution modes + HUD text legibility: assert every `RES_MODES`
   entry is reachable and persists (`KEY_RESOLUTION`), and MEASURE the HUD text region in at least two
   modes (AUTO and '4'): print the canvas backing-store size vs `viewport x dpr`, the text-region ink, and
   the sharp-edge count (pixels whose neighbours are pure background/text, i.e. a crispness proxy). State
   plainly whether the device-resolution modes actually change the rasterisation — that is the claim.
5. *"balance is nonexistent, character shredded everything"* — **MEASUREMENT IS FROZEN (owner directive).**
   Do NOT run a cohort, a rate table or a before/after simulation. Verify only what is checkable
   functionally (the difficulty hooks exist and are wired: wave/arch/stage paths reachable in a live run),
   then report the item as **NOT VERIFIABLE under the owner's measurement freeze** with the explicit
   cross-reference to G5 (`docs/HORDES_GOALS_2026-09-12.md` :2070). Do not attempt a fix.
6. *"no way to exit a run early"* — exit-run exists AND is taught: in a live run, open the cog with a REAL
   tap, assert an end-run control is present and onScreen (print its rect), tap it with a REAL gesture,
   assert the run actually ends (mode transition / end card measured, not asserted by name only), and
   assert the settings/end-run tour key exists in `TOUR_KEYS`.
7. *"the edge of the map is not clearly defined"* — wall + camera: sample pixels along the arena wall edge
   in a live run and assert the wall renders as its own frame colour (print the sampled values), and drive
   the player into the boundary and assert the position stays clamped inside the arena bounds (print
   before/after coordinates).
8. *"all over the place"* — overall coherence: at 390x844 @dpr3 assert ZERO overlapping critical chrome
   elements (reuse the existing overlap measurement pattern, `src/main.js` :232/:247-248 area for the
   selectors), assert chrome is OFF while live play is running, and assert the console error count is zero
   across the whole walk (print each).

**(3) `test/test_g4_complaints_report.mjs` (NEW) — the report is itself checkable.** Asserts the harness's
item table is COMPLETE and honest: exactly 8 items, each carrying a verdict from the allowed set and a
non-empty evidence field, item 5 carrying the freeze cross-reference, and the summary line format parsing
for all eight. Unit-level only — no browser, must finish in seconds.

## NOT IN SCOPE

- **NO edits to `src/**`, `index.html`, `tools/browser.mjs`, or any existing test.** If a check exposes a
  REAL defect, that is a FINDING: report it with the measured evidence and STOP on that item. Do not fix
  it in this slice — the next tick decides, so one writer stays in the game code.
- No balance change, no tuning, no cohort, no rate derivation, no `MEASURED` re-baselining (owner freeze).
- No new shop rows, no new screens, no content, no art.
- Do not re-run other goals' verifiers; this slice verifies COMPLAINTS only.

## FILE OWNERSHIP (you are the only writer)

- `tools/verify_g4_complaints.mjs` (NEW), `test/test_g4_complaints_report.mjs` (NEW),
  `docs/art/g4-complaints-2026-09-16/` (NEW, PNGs only).

## ACCEPTANCE BAR (all of it; a builder self-report is not evidence)

A. `node tools/verify_g4_complaints.mjs` (and each `--item N` arm) runs to completion in real Chrome with
   all TOUR_KEYS set and `state.time > 1.0` asserted FIRST, printing the 8 summary lines, the wall ms per
   arm, the PNG label per arm, and the console-error count. Every arm <= 60s wall (print each).
B. 8 PNGs in `docs/art/g4-complaints-2026-09-16/`, each exactly 1170x2532, each labelled.
C. `node test/test_g4_complaints_report.mjs` passes and prints the item table.
D. `bash tools/run_suite.sh` => `redfiles=0`, with the `TREE`/`SUITE` lines quoted verbatim in the report.
   If a red appears, name it; do not weaken anything.
E. `git status --porcelain` shows ONLY the three paths above plus your PNGs — **no `src/` and no
   `index.html` in the diff** (quote `git diff --stat src/ index.html`, which must be empty).
F. DISCLOSE, do not hide: every item you could not measure and why, every check DROPPED for the 60s cap,
   and every verdict that is a judgement call rather than a measurement.
G. House rules: no emojis, integer pixels, no new timers in game code (you add none), 60/120Hz untouched.

## FREEZE COMPLIANCE (read the owner directive at the top of the goals doc)

No sim, no cohort, no seed table, no rate derivation, no before/after balance measurement, and **no command
over 60 seconds of wall clock** (each arm prints its wall time). Real-browser FUNCTIONAL checks are alive
and expected. If a check cannot fit the cap, DROP it and say so in the report rather than raising the cap.

## REPORT FORMAT (post to `hordes` when done)

`done: G4 — <one-line verdict>` then, in order:
1. The 8 summary lines verbatim, then a plain statement of which items are VERIFIED FIXED, which are
   STILL TRUE (with the measured evidence and what would fix each), and which are NOT VERIFIABLE.
2. Raw evidence: the commands run with their wall ms, the PNG list with labels, the TREE/SUITE lines, the
   `git diff --stat src/ index.html` output (empty).
3. Files touched with line ranges.
4. A `COULD NOT VERIFY` section: every dropped check and every judgement call.
Then END YOUR RUN cleanly.

## HOUSE RULES (repeat, binding)

No emojis. Integer pixels. No new timers. No `src/` edits. Do not run any git state command
(`commit`/`checkout`/`reset`/`stash`/`clean`) — leave the tree dirty and report the dirty count. Append a
timestamped heartbeat line to `/tmp/g4_complaints_progress.log` before and after every step that can exceed
a few seconds. Post `done:`/`blocked:` to the `hordes` channel FIRST with raw evidence, then the full report
per REPORT FORMAT above.
