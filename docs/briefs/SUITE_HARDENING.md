# BRIEF — SUITE HARDENING: diagnosable reds + deterministic test_rewrites (TOOLS+TEST ONLY)

**Issued:** 2026-09-16 (goal pilot tick, HEAD 4a0bbf9, clean tree, agentlock held by the pilot).
**Gate: TOOLS+TEST ONLY.** You may edit `tools/run_suite.sh`, test files under `test/`, and add new
tools/tests. NO `src/` edits, NO balance change, NO cohort/simulation runs (the owner measurement
freeze is binding). Do not run any git state command; leave the tree dirty and report the dirty count.

## HOUSE RULES (standing)
- Never weaken an assertion to go green. If a check is sampling a random field event, PIN the event
  (precedent: the MOONLIGHT pin in test/test_shop_mana.mjs; the dt-probe fix recorded in TICK NOTE 10
  of docs/HORDES_GOALS_2026-09-12.md) and prove the pinned path still exercises the real seam.
- Heartbeat /tmp/suite_hardening_progress.log before every long step.
- 60s cap per measurement command; no real-loop cohorts.

## MEASURED STATE (pilot-measured this tick, HEAD 4a0bbf9)
- `bash tools/run_suite.sh` run 1: `TREE @ 4a0bbf9 | dirty=0`, `SUITE greenfiles=103 redfiles=1`,
  RED `test/test_rewrites.mjs :: no assertion line captured`.
- Immediate standalone control: `node test/test_rewrites.mjs` => `rewrites: PASS=56 FAIL=0`, rc=0.
- Immediate suite re-run: `SUITE greenfiles=104 redfiles=0`.
- This is the THIRD recorded intermittent in this file: TICK 60 recorded `:484 FAIL NO toast per kill
  (the feed is for rare moments)` (standalone control passed) and an earlier ORBIT x1.20 one.
- `tools/run_suite.sh` anatomy: :31-32 wipes and re-creates LOGDIR on every run (the failing log from
  this tick's red is therefore ALREADY GONE — evidence destroyed by the next run); :36-47 the
  pass/fail loop; :43-44 the WHY grep is `grep -oE "AssertionError.*|Error: .*" | head -1` with
  fallback text `no assertion line captured` — a node process that dies WITHOUT printing an
  AssertionError/Error line (OOM, fatal V8, signal, empty log) is UNDIAGNOSABLE from suite output.
- test/test_rewrites.mjs is 1584 lines, 56 checks, and imports the real seams
  (src/rewrites.js, src/main.js openDraft/pick, src/weapons.js).

## THE SLICE (three parts, in order)

**PART 1 — make reds diagnosable (tools/run_suite.sh).**
- Record the exit code in the RED line: `RED <file> :: rc=<n> :: <why>`.
- Broaden the WHY capture beyond the two current patterns: also match `FATAL`, `fatal`, `Aborted`,
  `Killed`, `out of memory`, `OOM`, `Segmentation`; if the log is EMPTY say so explicitly; if
  nothing matches, print the LAST non-empty line of the log instead of the bare fallback.
- Preserve failing logs across runs: on a red, copy the log to
  `/tmp/hordes_suite_failures/<ISO8601>_<basename>.log` (create the dir; keep at most the newest 50).
  The per-run wipe of the live LOGDIR may stay.
- Bash-only changes; keep the TREE line, the counters, the REDLIST line and the label format
  (greenfiles/redfiles — the redactor-safe labels, see the header comment) BYTE-STABLE.

**PART 2 — diagnose + fix the test_rewrites intermittents (test-side only).**
- Read TICK NOTE 60 in docs/HORDES_GOALS_2026-09-12.md for the two earlier signatures
  (`NO toast per kill` :484; the ORBIT x1.20 one).
- Read the current test and find every check whose outcome can depend on an UNPINNED random source
  (field events, weather, spawn rolls, timing) or on WALL time under load. Pin each one at its real
  seam (seed the rng the game exposes, force the weather/event, drive dt explicitly) — the same
  pattern as the MOONLIGHT pin.
- If you find a check that is CORRECT-but-flaky by construction (e.g. asserts a no-toast property
  over a window where a legitimate toast can appear), narrow the WINDOW, never the assertion's
  meaning, and comment why.
- You must STATE in your report, per intermittent signature found: the mechanism, the fix, and the
  proof it still tests the real behavior.

**PART 3 — prove it under load.**
- `node test/test_rewrites.mjs` 5 consecutive runs, rc=0 each, WHILE a CPU load generator runs
  (`yes > /dev/null &` on all cores, killed after).
- `bash tools/run_suite.sh` 3 consecutive runs, all `redfiles=0`, same load.
- DELIBERATE-RED PROOF: temporarily break one assertion in a COPY of a test file (e.g.
  `cp test/test_rewrites.mjs test/test_zz_redprobe.mjs` + flip one expected value), run the suite,
  show the RED line now carries rc + a real captured signature AND the log landed in
  /tmp/hordes_suite_failures/, then DELETE the probe file. This proves PART 1 end-to-end.

## ACCEPTANCE BAR
1. run_suite.sh: rc in the RED line; broadened signatures; failing logs preserved (all three shown
   by the deliberate-red proof, quoted verbatim).
2. TREE line, greenfiles/redfiles labels, REDLIST format unchanged (diff against HEAD).
3. test_rewrites: 5/5 standalone + 3/3 suite greens UNDER LOAD, quoted.
4. Every pinned check named, with the mechanism -> fix -> still-real-seam proof.
5. No src/ diff (`git status --porcelain src/` empty — run status only, never a state command).
6. Final full suite run on your tree: greenfiles=104 redfiles=0 (or 105 if you add a test file).

## REPORT FORMAT
End with `done:` or `blocked:` plus: the Part-1 diff summary, the Part-2 mechanism table, the
Part-3 raw outputs (5x standalone, 3x suite, the deliberate-red capture), the final suite line, and
the dirty count. Then END YOUR RUN cleanly.
