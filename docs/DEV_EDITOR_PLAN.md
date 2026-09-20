# HORDES Dev Editor + Balance Telemetry — PLAN (owner: Sk408, lead: Remy)

## Goal
A dev-only workbench for hordes balance: edit tuning values through a
game-styled UI, save to disk as clean diffs, visualize costs vs damage, watch
live telemetry during dev runs, and accumulate versioned run snapshots that
feed sims and LLM balance analysis. Player build never sees any of it.

## Homes
- Editor project worktree: `/home/claude/projects/hordes-dev`, branch
  `tools/dev-editor`. Served statically at
  `https://claude.stevesinfo.com:8443/hordes-dev/` (nginx alias, no-cache).
- Player game: `/home/claude/projects/hordes` served at `/hordes/`. Untouched.
- Saver backend: `tools/editor_server.py` on the VPS, systemd unit
  `hordes-editor.service`, port 8901 on 127.0.0.1 only, proxied at
  `/hordes-dev-api/` (same-origin; the page must never default to a
  localhost URL). Systemd `enable --now` is done; it survives reboots.
- Editor page: `editor.html` (static, not linked from the game UI).

## DONE
- Slice 1 (opencode/muse-spark): `tools/tuning_map.md` — exhaustive map of
  where every tunable lives (shop, weapons, items, enemies, gold).
- Slice 2 (opencode/muse-spark): saver (whitelist-only, timestamped backups
  in `tools/.backups/`, node module-parse check + rollback on failure,
  guard rails 403/409 verified) + `editor.html` shop-prices section reading
  live config values. Committed as `7ec4a1a`.
- Infra (Remy): systemd unit, nginx static + api proxy, HUP verified.
- Roundtrip proof: 150→151→150 on `dmg` baseCost through the PUBLIC proxy,
  diff confirmed both directions, tree left clean. (One unexplained 403 on
  a single early attempt; every request since — direct and proxied — behaves
  correctly. Noted, not chased.)

## SAFETY RULES (apply to every slice)
- Whitelist-only writes, backups always, syntax-check + rollback.
- Editor surfaces are dev-only, never linked from game UI, no emojis.
- No retunes smuggled inside tooling slices: the proof moves a value and
  restores it; balance changes are their own explicit edits.
- Opencode harness cannot read `/tmp` — every probe/scratch/backup stays
  in-tree (untracked helpers, deleted before commit).
- No root from agents: nginx/process work is the coordinator's.

## SLICE 3: static cost/damage graphs (DESIGNED, not yet dispatched)
- Per-level cost and damage curves, overlaid, each normalized to
  percent-of-own-max (raw gold vs raw damage on one axis is meaningless).
- Third curve: damage-per-gold — DESCRIPTIVE ONLY, clearly labeled. It
  carries the income feedback loop (income scales with build power), so it
  must never be presented as a fairness verdict.
- Income-aware questions ("can a real build afford level 7 when it
  matters?") are answered by measured cohorts in the real loop, never by
  the graph. The graph may link those numbers, not compute them.

## SLICE 4: live telemetry + snapshots (DESIGNED, not yet dispatched)
- Dev-gated overlay (`?dev=` param): 1 Hz sparklines during the run —
  cumulative gold earned vs spent, damage dealt, best-gold reference line.
- Post-run summary: full curves + measured totals + **download-JSON**.
- GOLD ACCOUNTING (owner-stated, verbatim intent): counts = shop purchases,
  character unlocks/upgrades, other permanent-build spending. Excludes =
  unspent purse, shrine spending, other in-run non-power sinks. The build
  must inventory EVERY gold sink and classify each explicitly; ambiguous
  ones are flagged for the owner, never guessed.
- TEST-RUN FLAG: an on-screen toggle marks a run as test. Snapshots ALWAYS
  save, carrying `test: true/false`; analysis excludes test runs by default.
  Mark, don't delete — plus a master kill-switch for no-write iteration.
- SNAPSHOT SCHEMA (stable, append-only log, never overwritten):
  `{schema_v, game_rev (commit SHA + dirty flag), seed, upgrades, shrines,
  items, gold_earned, gold_spent (per accounting), damage, wave, test}`.
  Readers refuse unknown `schema_v`. Analysis groups by `game_rev`.
  Old fields never renamed. History is never deleted.

## OPEN QUESTIONS
- Which editor section after shop (weapons? characters?) — owner picks.
- Snapshot store location/format (one JSONL vs per-run files).
- Whether saver whitelist needs extending as sections land (yes, expect it).
