# BRIEF — 8x boss-kill sequencing fix (queued top item, blocks the autoplay runner)

Owner report, 2026-09-21, recorded verbatim in docs/DEV_EDITOR_PLAN.md:

> "8x boss-kill sequencing — draft menu sticks over the escape sequence and gem-suck-in is skipped at speed"

That is the whole symptom. Do not assume a cause — investigate it as an open question:

- What code decides the ORDERING of the draft menu, the boss escape sequence, and the gem-suck-in?
  Cite file:line for each decision point. Map the mechanism space first; then state what must be
  true for the symptom at 8x, and test that by prediction before changing anything.
- Speed control (slice 8) substeps the sim at 1x/2x/4x/8x, sim-exact per step. What about the
  sequencing path differs at higher substep counts? Cite the lines.
- If you cannot reproduce it, SAY SO and list what you ruled out — that is an acceptable deliverable.

## Constraints (binding)

- Worktree: `/home/claude/projects/hordes-dev`, branch `tools/dev-editor`. **This tree is served
  LIVE to the owner via nginx `/hordes-dev/` — uncommitted edits are visible to him instantly.
  Never leave it half-edited; complete the change in one pass.**
- The fix must be correct at ALL speeds (1x/2x/4x/8x), at both 60Hz and 120Hz. Nothing may assume
  a fixed dt.
- Design doctrine you may NOT violate: no instant auto-pick, no pacing shortcuts, nothing that lets
  a player skip content they have not earned. The 6s auto-pick delay and idle pacing are features.
- Do NOT run any `git` command. The coordinator verifies and commits.

## Acceptance bar

1. The symptom is fixed at 8x, PROVEN by measurement (a real-loop/browser run showing the escape
   sequence completes and the gem-suck-in happens with no draft menu stuck over it), not by reading
   code. "Looks right" is not evidence.
2. Suite parity: baseline on this branch is **160 green / 11 red** — the 11 reds are the owner's own
   retune fixtures (beatability, economy_breadth, economy_reprice, evolution, meta, meta_rank,
   pacing_guards, sgkv4_purchases, shop_overrides, weapon_overrides, weapons). Acceptance is RED-LIST
   PARITY, not zero red. Run the suite with `bash tools/run_all_dev.sh` and report the before/after
   PASS= FAIL= lines and the failed-file lists.
3. Report back: root cause (file:line), what you changed, the measured proof, both suite summary
   lines, and anything still unverified flagged explicitly.

## Environment notes

- Dev run URL for manual checks: `https://claude.stevesinfo.com:8443/hordes-dev/index.html?dev=1`
- Editor: `https://claude.stevesinfo.com:8443/hordes-dev/editor.html`
- Chrome for Testing: `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
- If (and only if) you touch an editor saver/API endpoint, the live service needs
  `systemctl --user restart hordes-editor.service` — a headless test passing does NOT mean the
  live route works. This fix should not need it; flag it if it does.
- All files you need must be inside this worktree (you cannot read outside it).
