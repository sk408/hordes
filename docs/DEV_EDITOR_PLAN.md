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
- Slice 3 (opencode/muse-spark): per-level cost overrides in game code
  (`overrides[level] ?? formula`, pinning test) + graphs section
  (normalized cost/damage/ratio overlays, labeled ratio, override marks,
  empty measured-runs slot). Committed as `230c3c8`.
- Slice 4 (opencode/muse-spark): unified single graph (toggleable legend)
  + inline per-level cost table saving through the pipe with live
  re-render, proven 300→restore with byte-identical tree. Committed as
  `85fb241`.
- Slice 5 (opencode/muse-spark): editable effect columns + live-value
  `desc` templates with coordinated fixture updates, proven both
  directions. Committed as `f531208`.
- Slice 6 (opencode/muse-spark): weapons section — damage + per-level
  curves, live labels, override support, proof both directions with
  byte-identical restore; red-list strictly shrank on its tree.
  Committed as `1fca882`.
- Slice 6b (opencode/muse-spark): evolution `damageMult` column with
  evolved curve beside base, saver path extended to `src/evolutions.js`,
  proven 1.3→1.4→1.3 byte-identical; red-list identical (8 pre-existing).
  Committed as `97df1b7`.
- Slice 7: see SLICE 7 section below (built, incl. store resolution).
- Slice 8 (opencode/muse-spark): substepped dev-run speed control
  (1x/2x/4x/8x, sim exact per step), speed stamped in snapshots
  (schema_v 2). Landed with coordinator-side test alignment
  (fixture → v2 + speed key) and the orphaned green speed test committed.
- Slice 9 (opencode/muse-spark): snapshot choice audit (drafts
  offered/taken, blessings, shrines, chests) + live mode/modifiers
  (night + banking-penalty-50 read off run flags) + overlay docked left
  and collapsible; suite identical 154/13. Committed as `3aba512`.
- Slice 10 (opencode/muse-spark): dev-run shop buy-back — per-level
  exact-refund ledger (override-aware, LIFO), free/paid mix rule read off
  the ledger never the live flag, removals journaled in snapshots, stats
  recomputed; proven to the gold with byte-identical restore; suite
  156/13 identical. Committed as `a00defc`.
- Slice 10b (opencode/muse-spark): sell buttons were in the DOM but painted
  UNDER the opaque shop card frame — joined `button.dev-sell` to the
  z-index:1 content layer, proven by real-screenshot pixel sampling
  (plank → button face). Committed as `a8f711c`.
- QUEUED: 8x boss-kill sequencing — draft menu sticks over the escape
  sequence and gem-suck-in is skipped at speed (owner report 2026-09-21).
  Substeps blow through frame-paced sequencing; fix owns the ordering.
- QUEUED: dev draft ban list — ONE OF EACH (and any card by id) excludable
  from offers via toggle, for autoplay/long-run testing (owner report
  2026-09-21: auto-play keeps taking it and it harms long runs). DESIGN
  INTENT (owner, binding): the card exists to help early-to-mid game
  upgrade weapons faster — its late cost is the price, not a bug. Never
  "fix" its curve; the ban list is the testing tool, not a verdict. It is
  also an idle-catcher by design: a reason to stay and pick drafts rather
  than go idle (idle pacing itself is deliberate — never propose instant
  auto-pick). It is a SKILL-TESTER by design (owner): its value is not
  immediately clear, but experienced players instantly see that better
  weapon-upgrade odds across 3 drafts early is worth it. Never simplify
  it into obviousness — the hidden depth is the point. Full lifecycle
  (owner): early accelerator, late anchor — as the character grows it
  blocks health/damage scaling through the run. The card's arc IS early
  power traded for late ceiling; both halves intended.
- QUEUED: granted-vs-earned accounting — the owner fast-forwards profiles
  by granting upgrades mid-testing (estimating affordability from run
  income, e.g. 200k/run). Legitimate methodology, but snapshots must
  separate GRANTED power from EARNED power: free-build grants logged
  distinctly (the slice-10 ledger already distinguishes paid vs free per
  level — carry that into the snapshot as granted_total vs earned_total),
  or analysis cannot tell a profile that earned 2M from one that was
  given it.
- DONE (opencode/muse-spark) accounting bugfix `eaf363a`: pickups were
  feeding the damage accumulator (the "damage climbs with whatever I
  picked up" report) — the counter is now player-dealt only; and
  gold-spent read 0 on free-build purchases — it now prices the build at
  FULL price while deducting nothing, identical in free and paid modes
  (proof: 900-gold build reads 0->900 both ways). This is why all 18
  pre-fix snapshots show spent=0. Suite 159/11, red-list identical.
- DONE (opencode/muse-spark) Slice 11 `32b0724`: DEV LOG card on the main
  menu downloads the WHOLE runs.jsonl (not the single run); editor gains a
  run-log viewer (table + mode/test filters + per-run overlay onto the
  cost graphs, filling the measured-runs slot slice 3 left empty);
  `GET /snapshots` returns the log envelope with `raw` byte-identical to
  `runs.jsonl` (verified 76,470 bytes / 18 lines). Suite 160/11, red-list
  identical. NOTE: the endpoint only exists after a service restart —
  restart `hordes-editor.service` when landing saver/endpoint changes.
- OWNER RULED 2026-09-21 (from the accounting fix): (a) COLOSSUS
  death shockwave enemy friendly-fire is NOT player damage/kill credit
  — do not credit (briefed for implementation); (b) paid chests ARE
  investment, confirmed as-is (shrine spending stays excluded);
  (c) dead corpses take one phantom burn tick (src/main.js:3217, no hp
  guard) — ruled FIX it (briefed alongside (a)).
- GitHub push auth RESOLVED 2026-09-21: owner logged in via gh on the
  VPS; `git push github main` verified working (6fa23b2 → c0ff734,
  ls-remote confirmed). GitHub is no longer blocked.
- QUEUED: dev autoplay policy runner — TOGGLE (not always-on). Dev-night
  mode = nightmare rules with NO 50% banking cut. Auto-buy policy
  (owner-stated): prefer weapons, split, weapon slots, damage increases;
  SAVE UP when the target is affordable within 5 runs of gold earned
  (don't dribble gold on filler while saving). Composes with the draft
  ban list, runs unattended at 8x with snapshots per run. DEPENDS ON the
  8x sequencing fix (stuck draft menus kill unattended runs) — dispatch
  after it lands. Owner's standing judgment: real-loop autoplay is ground
  truth; analytic sims keep only cheap pre-screening duty, never the
  verdict. REASON (owner 2026-09-21): AI balancers swing trivial-or-grindy
  because computer time is not lived time — ten tense minutes and ten
  chore minutes measure identically but play nothing alike. Agents
  optimize numbers; only played runs know pacing. Hence snapshots come
  from real runs first, sims second. TWO policies (owner-stated): SMART (priorities + 5-run save-up)
  and IMPULSIVE (buy whatever is affordable now) — the impulsive buyer
  models real average-player behavior and is the baseline the smart policy
  must beat. Both snapshot identically for comparison.
- Infra (Remy): systemd unit (+ node PATH fix), nginx static + api proxy,
  HUP verified; 150→151→150 roundtrip through the public proxy, tree clean.
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

## SLICE 3: static cost/damage graphs (DONE as `230c3c8`; unified graph + inline table followed in slice 4)
- Per-level cost and damage curves, overlaid, each normalized to
  percent-of-own-max (raw gold vs raw damage on one axis is meaningless).
- Third curve: damage-per-gold — DESCRIPTIVE ONLY, clearly labeled. It
  carries the income feedback loop (income scales with build power), so it
  must never be presented as a fairness verdict.
- Income-aware questions ("can a real build afford level 7 when it
  matters?") are answered by measured cohorts in the real loop, never by
  the graph. The graph may link those numbers, not compute them.
- PER-LEVEL COST OVERRIDES (owner decision 2026-09-21): the growth formula
  stays the default, but any item may carry an override table consulted as
  `overrides[level] ?? formula`. This buys shaped curves (cheap early hook,
  prestige capstone) without turning every item into N numbers. The editor
  graphs the formula curve with override points marked; items without
  overrides behave exactly as today. Enables early- or late-game
  accessibility tuning per item.

## SLICE 5: editable effects + live descriptions (DISPATCHED 2026-09-21,
building — effect columns in the inline table, `desc` strings converted to
live-value templates with coordinated fixture updates)

## SLICE 6: weapons section (DESIGNED, not yet dispatched)
- Same treatment as shop: weapon damage + per-level damage curves editable
  in the inline table, unified graph with the same normalization, overrides
  supported where the game code allows shaped curves. Descriptions follow
  the live-template rule from slice 5.

## SLICE 7: live telemetry + snapshots (BUILT 2026-09-21, opencode/muse-spark)
- Gold-sink inventory lives in `src/dev_telemetry.js` header (exhaustive:
  six bank `profile.gold -=` sites all INVESTMENT, shrine purse spend
  EXCLUDED, paid-chest gamble flagged AMBIGUOUS and counted pending owner
  ruling — one-line switch in main.js devGoldSpent()).
- Snapshot store (resolves the location/format open question): append-only
  JSONL at `tools/.snapshots/runs.jsonl` (git-ignored), written through the
  saver backend (POST /snapshot, schema-validated; GET /rev reads the live
  SHA + dirty flag). Schema keys exact per the contract above.
- Dev-gated overlay (`?dev=` param): 1 Hz sparklines during the run —
  cumulative gold earned vs spent, damage dealt, best-gold reference line.
- The editor links directly to a dev run (same gate URL) — one click from
  tuning numbers to testing them, no URL to remember.
- Post-run summary: full curves + measured totals + **download-JSON**.
- GOLD ACCOUNTING (owner-stated, verbatim intent): counts = shop purchases,
  character unlocks/upgrades, other permanent-build spending. Excludes =
  unspent purse, shrine spending, other in-run non-power sinks. The build
  must inventory EVERY gold sink and classify each explicitly; ambiguous
  ones are flagged for the owner, never guessed.
- TEST-RUN FLAG: an on-screen toggle marks a run as test. Snapshots ALWAYS
  save, carrying `test: true/false`; analysis excludes test runs by default.
  Mark, don't delete — plus a master kill-switch for no-write iteration.
- FREE-BUILD MODE (dev runs only): any buyable — shop levels, characters,
  upgrades — purchasable with no gold deducted. Same `?dev=` gate as
  telemetry, never in the player build. This is what makes maxed-build
  testing instant instead of a 20-minute grind per question. ACCOUNTING:
  free purchases deduct 0 from the purse but record FULL price into
  gold-spent metrics — snapshots must reflect what the build would have
  cost, or every free-build run corrupts the cost data silently.
- SNAPSHOT SCHEMA (stable, append-only log, never overwritten):
  `{schema_v, game_rev (commit SHA + dirty flag), seed, upgrades, shrines,
  items, gold_earned, gold_spent (per accounting), damage, wave, test}`.
  Readers refuse unknown `schema_v`. Analysis groups by `game_rev`.
  Old fields never renamed. History is never deleted.

## OPEN QUESTIONS
- Which editor section after shop (weapons? characters?) — owner picks.
- Whether saver whitelist needs extending as sections land (yes, expect it).
