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
for f in test/test_*.mjs test/smoke.mjs; do
  log="$LOGDIR/$(basename "$f").log"
  if node "$f" > "$log" 2>&1; then
    okf=$((okf+1))
  else
    badf=$((badf+1))
    failed="$failed $f"
    # One line of WHY, so a red is diagnosable without re-running by hand.
    why=$(grep -oE "AssertionError.*|Error: .*" "$log" | head -1 | cut -c1-110)
    echo "  RED $f :: ${why:-no assertion line captured}"
  fi
done
echo "SUITE greenfiles=$okf redfiles=$badf"
echo "REDLIST:$failed"
echo "LOGS: $LOGDIR/<basename>.log"
