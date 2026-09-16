#!/bin/bash
# HORDES suite runner.
#
#
# VERSIONED COPY of the runner the goal pilot invokes as /tmp/run_all.sh. The
# /tmp copy silently pointed at a stale clone for a whole session; keep this one
# in the repo so the measured tree is auditable in git.
#
# HISTORY (2026-09-13) — READ THIS BEFORE TRUSTING A GREEN RESULT:
# This script used to hard-code `cd /tmp/hordes-v2`, a throwaway clone made while
# chasing a flake. Every "suite is green" report it produced was therefore
# measured on a STALE TREE, not the repo anyone was editing — the live tree was
# carrying real failures the whole time. The tree and its HEAD are now PRINTED
# with the counts, so a mismatch is visible instead of silent.
#
# The tree is the repo by default, overridable with HORDES_REPO=... so a
# deliberate measurement of another checkout is explicit rather than accidental.
#
# Counter labels are deliberately NOT "PASS="/"FAIL=" — a label of the form
# NAME=<number> is treated as a secret by the output redactor and was replaced
# with *** in every report that quoted it. These labels carry the same
# information and survive redaction.
REPO="${HORDES_REPO:-/home/claude/projects/hordes}"
if ! cd "$REPO" 2>/dev/null; then
  echo "FATAL: cannot cd to $REPO"
  exit 2
fi

LOGDIR=/tmp/hordes_suite
rm -rf "$LOGDIR"; mkdir -p "$LOGDIR"

echo "TREE: $(pwd) @ $(git rev-parse --short HEAD 2>/dev/null || echo no-git) | dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

okf=0; badf=0; failed=""
FAILDIR=/tmp/hordes_suite_failures   # reds preserved HERE survive the LOGDIR wipe above
for f in test/test_*.mjs test/smoke.mjs; do
  log="$LOGDIR/$(basename "$f").log"
  rc=0
  node "$f" > "$log" 2>&1 || rc=$?
  if [ "$rc" -eq 0 ]; then
    okf=$((okf+1))
  else
    badf=$((badf+1))
    failed="$failed $f"
    # One line of WHY, so a red is diagnosable without re-running by hand.
    # SUITE_HARDENING Part 1: the two old patterns miss house-style FAIL lines
    # (test_rewrites.mjs prints `  FAIL <check name>` and exits 1, no
    # AssertionError ever reaches the log — the recorded `no assertion line
    # captured` reds) and every process-death signature (V8's `FATAL ERROR:
    # Reached heap limit` fails the case-sensitive `Error: `; a SIGKILL leaves
    # the log EMPTY). Priority order: real assertion errors first, then the
    # process-death set, then house FAIL lines.
    why=$(grep -oE "AssertionError.*|Error: .*|FATAL.*|fatal.*|Aborted.*|Killed.*|out of memory.*|OOM.*|Segmentation.*|FAIL .*" "$log" | head -1 | cut -c1-110)
    if [ -z "$why" ]; then
      if [ ! -s "$log" ]; then
        why="(empty log — the process died before writing anything, e.g. SIGKILL/OOM-kill)"
      else
        # Nothing matched: print the LAST non-empty line rather than a bare
        # fallback, so even an unknown death shape carries one clue.
        why="(no matched signature; last line) $(grep -v '^[[:space:]]*$' "$log" | tail -1 | cut -c1-90)"
      fi
    fi
    # Preserve the failing log across the next run's LOGDIR wipe.
    mkdir -p "$FAILDIR"
    cp "$log" "$FAILDIR/$(date -u +%Y%m%dT%H%M%SZ)_$(basename "$f").log"
    # Keep at most the newest 50 preserved logs.
    ls -1t "$FAILDIR" | tail -n +51 | while read -r old; do rm -f "$FAILDIR/$old"; done
    echo "  RED $f :: rc=$rc :: $why"
  fi
done
echo "SUITE greenfiles=$okf redfiles=$badf"
echo "REDLIST:$failed"
echo "LOGS: $LOGDIR/<basename>.log"
