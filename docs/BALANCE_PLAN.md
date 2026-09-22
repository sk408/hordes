# BALANCE_PLAN — ordered, actionable, measured through the real loop

Doctrine (binding, `docs/DEV_EDITOR_PLAN.md:114-130`): real-loop autoplay runs
at 8x with snapshots are ground truth; analytic sims (`tools/draft_sim.mjs`,
`tools/balance_sim.mjs`) are cheap pre-screening only, never the verdict.
Every item below routes its measurement through real-loop/telemetry
(`tools/real_loop.mjs`, snapshot log `tools/.snapshots/runs.jsonl`, economy
ledger `tools/economy_ledger.mjs`), never a sim number alone.

Comparison cites refer to `docs/BALANCE_VS_COMPARE.md` sections (CMP §N).
Hordes cites are current-tree `file:line`. VS is corroboration only; every
change is justified from hordes-side evidence first.

Flags: `MEASURABLE-BY-TELEMETRY` (answerable from snapshot fields already
logged), `NEEDS-REAL-LOOP-PROOF` (requires new autoplay runs), 
`OWNER-RULING-REQUIRED` (touches a protected intent — no recommendation made).

Protected intents (untouchable without owner ruling,
`docs/DEV_EDITOR_PLAN.md:64-81,138-143`): ONE OF EACH on all four fronts;
6s idle auto-pick (`src/config.js:520`), longer-never-shorter; buy-back
dev-only; graphs exogenous; investment accounting classification
(`src/dev_telemetry.js:10-50`).

## Ordered items

### 1. Re-baseline PACING income tiers on the current tree
- Observation (CMP §5 GAPS-5): `docs/PACING.md:68-146` tiers (70/100/200/754689,
  `src/meta.js:256-267`) predate current prices (ZAP 60000 `src/meta.js:451`
  vs PACING-era 600000; luck 14000 `src/meta.js:603-604` vs 140000). Guards
  G1-G7 (`docs/PACING.md:248-266`) pin stale ratios.
- Proposed change: none yet — re-run the fixed 4-arm battery
  (`tools/measure_income_stages.mjs`, n=3, 60s cap) and update §1 table + G1/G2/G7
  bounds via a ledger row, no retune inside the measurement slice.
- Measurement: real-loop cohort through the real settlement seam; report
  `SIM: <n>s across <k> arms` with [ARM]/[TABLE] per figure
  (`docs/PACING.md:28-45`).
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 2. Audit geometric XP curve against draft cadence by wave
- Observation (CMP §4): requirement `30*1.28^(L-1)` (`src/config.js:148-154`,
  `src/main.js:4082-4084`) vs income compounding 1.030 (`src/config.js:1213`);
  L40/L20 ratio ~1180x vs VS 4.9x (`docs/vs_ref/spec/SPEC-xp.md:24`). Hordes'
  own comment admits drafts are the only decision layer
  (`src/config.js:149-154`).
- Proposed change: none yet — instrument drafts-per-minute per wave from
  snapshot `drafts` arrays (slice-9 audit) across fresh/partial/half/maxed
  autoplay runs; find the wave where cadence falls below 1 draft/min.
- Measurement: NEEDS new 8x autoplay runs (SMART + IMPULSIVE policies,
  `docs/DEV_EDITOR_PLAN.md:127-130`); drafts offered/taken already in snapshots.
  Pre-screen with `tools/draft_sim.mjs` only.
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 3. Price per-pick weapon value from telemetry damage
- Observation (CMP §1): hordes picks are uniform +15-20%
  (`src/weapons.js:908-918`) vs VS multi-axis deltas
  (`docs/vs_ref/spec/SPEC-drafts.md:21-25`). Unexamined: what a hordes pick is
  actually worth in DPS at each wave.
- Proposed change: none yet — join snapshot `drafts.taken` to the
  player-dealt damage accumulator (post-`eaf363a` fix,
  `docs/DEV_EDITOR_PLAN.md:90-96`) per run segment; rank picks by
  damage-per-draft by wave band.
- Measurement: existing snapshot fields (damage is player-dealt only) +
  `tools/economy_ledger.mjs`; confirm any retune with new real-loop runs.
- Flag: `MEASURABLE-BY-TELEMETRY`

### 4. Calibrate the boss wall against fresh/partial builds
- Observation (CMP §2): BOSS 500+60/wave (`src/config.js:1152-1153`) is
  designed to claim 5-8/10 runs per wave (`src/config.js:1147-1151`), and the
  re-measure shows sub-cliff builds die in 9-21s earning the award floor
  (`docs/PACING.md:68-90`). Unexamined: whether the wall lands at the intended
  wave for each build tier or just executes fresh builds at wave 1.
- Proposed change: none yet — run the survival-cliff battery (fresh / couple /
  partial / half) at 8x, record death wave + killer (boss vs ambient) from
  snapshots; check 1-3/10 herald vs 5-8/10 boss split
  (`src/config.js:1104-1111`).
- Measurement: real-loop autoplay cohort; killer attribution must respect the
  COLOSSUS friendly-fire ruling (not player credit,
  `docs/DEV_EDITOR_PLAN.md:105-110`).
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 5. End-game rung vaporization (fleetfoot/luck ladders)
- Observation (CMP §5): fleetfoot 65000/2.0/5 (`src/meta.js:621-623`), luck
  14000/2/5 (`src/meta.js:603-604`) vs WON-run 754689g reference —
  PACING (b) FAIL, open (`docs/PACING.md:188-202`, guard G5 floor
  `docs/PACING.md:258`).
- Proposed change (owner decision OPEN, not recommended here): candidate is
  repricing the vaporizing rungs up; ship only after proof.
- Measurement: price-only change never stales income (`docs/PACING.md:148-153`);
  verify with [TABLE] arithmetic + one confirmatory 8x maxed run that
  time-in-grade reaches N=2 runs.
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 6. Tier-2 dead tail (mid-catalogue reachability)
- Observation (CMP §5): ZAP-class rungs cost thousands of tier-2 runs
  (`docs/PACING.md:223-244`, guard G7 `docs/PACING.md:259`); root cause filed
  as difficulty not price (sub-cliff builds earn the floor).
- Proposed change: none yet — first complete item 4 (survival battery); only
  then choose the lever (mid-tier survival vs mid-priced rung band). No lever
  is pre-selected here.
- Measurement: real-loop survival battery from item 4 + [TABLE] rung pricing;
  mid-band figures stay labeled floors until a build survives 60s
  (`docs/PACING.md:84-90`).
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 7. Split granted vs earned power in snapshots
- Observation (CMP GAPS-6; `docs/DEV_EDITOR_PLAN.md:82-89` QUEUED): free-build
  grants price at FULL cost while deducting nothing
  (`docs/DEV_EDITOR_PLAN.md:90-96`), so earned-2M and granted-2M profiles are
  indistinguishable in analysis.
- Proposed change: carry the slice-10 paid-vs-free ledger into the snapshot as
  `granted_total` vs `earned_total` (append-only, schema_v bump with reader
  refusal of unknown versions per `docs/DEV_EDITOR_PLAN.md:203-207`).
- Measurement: schema check on new snapshots (free-build run reads full price,
  0 deducted, granted bucket nonzero); analysis excludes or splits on the new
  fields. No balance verdict depends on it.
- Flag: `MEASURABLE-BY-TELEMETRY`

### 8. WITCH kit-value concentration
- Observation (CMP §3): WITCH 9000g bundles maxMana 50 + manaCostMult 0.5 +
  starting ZAP (`src/meta.js:1544-1558`; ZAP alone 60000g `src/meta.js:451`),
  vs KNIGHT 0 / ROGUE 2500 / PALADIN 6000 (`src/meta.js:1537-1572`).
  Unexamined by hordes' own numbers whether the mana class is also the
  discount-ZAP class.
- Proposed change: none yet — compare WITCH vs ROGUE/PALADIN time-to-first-boss-kill
  and gold-per-minute in matched 8x autoplay cohorts at equal shop spend.
- Measurement: NEEDS new real-loop runs, SMART policy both arms; ZAP mana-gate
  behavior is HARD by owner ruling (`src/weapons.js:122-126`) and stays as-is.
- Flag: `NEEDS-REAL-LOOP-PROOF`

### 9. Draft dead-pick rate (diagnostic only; economy add needs ruling)
- Observation (CMP §6): hordes has no reroll/skip/banish economy
  (`src/dev_telemetry.js:46-50`) vs VS bought charges
  (`docs/vs_ref/spec/SPEC-shop-items.md:32-34`); at-cap cards convert to +10%
  under ONE OF EACH (`src/main.js:4236-4246`) but without it a maxed weapon
  card is skipped (`src/main.js:4238`).
- Proposed change: none yet — measure dead-pick offer rate (maxed-weapon or
  volley-at-cap cards, `src/main.js:4291-4296`) per draft from snapshot
  `drafts.offered` logs. Any reroll/skip economy proposal is a design change
  and goes to the owner separately.
- Measurement: existing snapshot offer sets; pre-screen pool mixes with
  `tools/draft_sim.mjs` only.
- Flag: `MEASURABLE-BY-TELEMETRY`

### 10. ONE OF EACH early-accelerator / late-anchor arc
- Observation (CMP §6): the card tilts the pool toward weapons as stats exhaust
  (`src/rules.js:15-26`), with +1 bonus level and +10% at-cap conversion
  (`src/rules.js:41-45`, `src/main.js:4236-4246`). VS analogue (Banish) is
  player-controlled and reversible
  (`docs/vs_ref/spec/SPEC-shop-items.md:34`).
- Proposed change: NONE PROPOSED. Protected on all four fronts (early
  accelerator / late anchor / skill-tester / idle-catcher;
  `docs/DEV_EDITOR_PLAN.md:64-81`). The dev draft ban list is the testing tool
  for long-run measurement, not a verdict.
- Measurement: if the owner asks, compare ban-list-on vs ban-list-off 8x
  long-run cohorts via snapshot drafts/damage; never infer a curve fix.
- Flag: `OWNER-RULING-REQUIRED`

### 11. Idle/AFK pacing (6s auto-pick, 3s night cadence)
- Observation (CMP §6): `DRAFT_TIMEOUT 6.0` (`src/config.js:520`),
  `NIGHT_CONTINUE_S/RESTART_S 3.0` (`src/config.js:528-529`), night pool 0.5
  (`src/meta.js:206`, guard G6 `docs/PACING.md:258`). Deliberate by owner
  (`docs/DEV_EDITOR_PLAN.md:70-74`); PACING idle floor PASS
  (`docs/PACING.md:204-217`).
- Proposed change: NONE PROPOSED. Pacing asks go LONGER never shorter.
- Measurement: any future idle question uses the owner's night-mode session +
  snapshot income, projected per `docs/PACING.md:204-217`, not longer sims.
- Flag: `OWNER-RULING-REQUIRED`

### 12. Buy-back scope and investment accounting discipline
- Observation: buy-back is dev-only on purpose (slice 10,
  `docs/DEV_EDITOR_PLAN.md:53-63`); accounting fixed as
  shop/character/permanent IN, purse/shrine/in-run sinks OUT, paid chests
  counted pending no further ruling (`src/dev_telemetry.js:10-50`,
  `docs/DEV_EDITOR_PLAN.md:105-110`); graphs stay exogenous
  (`docs/DEV_EDITOR_PLAN.md:147-162`).
- Proposed change: NONE PROPOSED. No item above may present a graph ratio as a
  fairness verdict, conflate granted with earned (see item 7), or move buy-back
  toward the player build.
- Measurement: enforced by existing guards G6/G8 (`docs/PACING.md:258-259`)
  and the saver whitelist; violations are owner rulings, not tunes.
- Flag: `OWNER-RULING-REQUIRED`

## Measurement routes (shared)

- Instrument: 8x substepped autoplay with per-run snapshots (schema_v 2,
  speed-stamped) via `tools/real_loop.mjs`; policies SMART vs IMPULSIVE
  (`docs/DEV_EDITOR_PLAN.md:114-130`). Blocked until the 8x boss-kill
  sequencing fix lands (`docs/DEV_EDITOR_PLAN.md:64-66`).
- Telemetry fields already logged: upgrades, shrines, items, gold_earned,
  gold_spent (per `src/dev_telemetry.js:10-50`), damage (player-dealt),
  drafts offered/taken, mode/modifiers (`docs/DEV_EDITOR_PLAN.md:53-63`).
- Sim budget: every figure labeled [TABLE]/[ARM]/[CITED]; 60s/arm cap enforced
  by test (`docs/PACING.md:28-45`). Reports without a source label are
  unverified.
- Standing rule per change: name the invariant (`docs/PACING.md:158-245`), add
  the TUNING LEDGER row (`docs/PACING.md:287-324`), keep guards green or
  disclose moved bounds (`docs/PACING.md:9-16`).

## GAPS / ASSUMPTIONS

1. Income tiers in `src/meta.js:256-267` are assumed stale (see item 1); all
   run-count math is provisional until re-measured.
2. Mid-band (length, gold) curve between the 21s and 1800s poles is unmeasured
   (`docs/PACING.md:84-90`); items 4/6 treat mid figures as floors.
3. Draft-cadence cliff wave (item 2) is hypothesized from the 1.28 vs 1.030
   exponent gap, not measured.
4. WITCH concentration (item 8) assumes unlock-price comparability across
   classes; achievement-granted kits are out of scope.
5. 8x sequencing fix is assumed to land before items 1/2/4/6/8 run; until then
   outputs are REPORTED LIMITATIONS per the budget rule.

## STEP 4 READINGS (2026-09-22) — readings only, no retune

Instrument: the landed 8x dev-night autoplay runner (`tools/autoplay_policy.mjs`,
SMART/IMPULSIVE, paired seeds, `src/dev_autoplay.js` save-up rule) plus a thin
sibling `tools/step4_cliff.mjs` that adds ONLY granted-profile starts
(fresh/couple/partial/half, built through the REAL `buyUpgrade` path) and
stdout reads the landed runner does not print (death wave + killer from
`state.deathBy`, run length from `deathBy.time`, per-wave draft counts).
`src/` untouched. All runs 8x dev-night (nightmare rules, NO banking cut),
seeds paired as base+runIdx across policies AND profiles. Log rows appended
via the REAL snapshot builder only (`tools/.snapshots/runs.jsonl` 23 -> 39
rows, +16; 6 half-build runs censored with stdout readings only, no faked
rows). Every granted-profile figure is labeled as such (item 7 split still
absent — nothing below is earned income).

### Item 1 — income battery: BLOCKED on this tree (0/12 arms complete)

- Brief said n=3 with 600s cap; in-tree tool is n=3 with 60s cap AND a
  machine-enforced 60s/arm ceiling (`test/_sim_budget.mjs:62`,
  `tools/measure_income_stages.mjs:30,39`) — followed in-tree, per brief.
- `node tools/measure_income_stages.mjs` (default 4 arms): `fresh:run1`
  THREW at the machine cap (60.0s, no death). `... partial` alone: also threw
  (`partial:run1`, 60.0s). Censoring: 2/2 arms driven, 100% instrument-censored.
- Mechanism (verified, not hypothesized): `buildProfile()` returns a WHOLE
  fresh profile for every arm (`tools/measure_income_stages.mjs:53-91`), and
  `Object.assign(prof, want)` (`:105-109`) wipes the harness's `runs=1`
  prologue stamp — so every arm opens INERT (no spawns, clock frozen;
  `src/main.js:8610-8639`, `C.PROLOGUE.ENABLED=true` at
  `src/config.js:631`). Probe [diagnostic, counted-not-capped]: battery
  path (runs=0) holds `prologue=true, t=0, kills=0` over 600 frames.
  Real-run probe (runs=1 stamped, AUTO_ALL): fresh dies t=27s wave 1,
  kills=3 — lethality roughly intact, so the battery failure is INSTRUMENT,
  not a survival shift. PACING §1 (length,gold) pairs stand as [CITED]; no
  [ARM] re-measure exists on this tree until the tool re-stamps runs.
- SIM: battery declared 720s budget, 0/12 arms completed (~120s charged into
  2 cap-thrown arms); probes ~37s counted (no budget, functional lane).
- Stale-price measured values now ([TABLE], live `src/meta.js` + ledger tool):
  ZAP 60000 (`:451`, was PACING-era 600000); luck base 14000 (`:603-604`,
  full-buy 434000, was 140000 — note PACING §5 ledger row still prints
  "base 140,000", stale text); fleetfoot base 65000 (`:621-623`, full-buy
  2015000, UNCHANGED); hp L1 100 (`:536` override 0:100, was 120); dmg L1 125
  (`:533` override 0:125, was 150); couple build cost 225 (was 270); BEAM
  450000 (`:458`, was 4,500,000 — `:457` comment "top of the ladder at ~3h"
  and `:271` "BEAM 6.0 good runs" are stale text, value rules: 0.30h / 0.60
  runs); NOVA_PULSE 12000, SCYTHE 20000 (`:452-453`, were 1.2M/2.0M);
  catalogue 44,960,367g over 50 rows (ledger tool output, was 98.5M);
  INCOME_TIERS still 70/100/200/754689 (`:256-267`, unchanged).
- Guard bounds re-derived [TABLE]: G1 hp-L1/tier-0 = 100/70 = 1.43 in [1,3]
  (guard text cites 1.71 — stale, guard still green); G2 dmg-L1/tier-1 =
  125/100 = 1.25 in [1,3] (cites 1.50 — stale, green); G7 ZAP/tier-2 =
  60000/200 = 300 <= 3200 (cites 3000 — stale, green by 10x more).
  No guard edited; suite greens below confirm.

### Item 2 — draft cadence: wave-1 readings; cliff wave BELOW CAP

- 12 runs (cap): autoplay fresh-start chained both-policies x3 seeds (A) +
  granted-half chained both-policies x3 seeds (B), paired seeds 5000-5002.
  Drafts from snapshot `choices.drafts` (offered[3]/taken, wave-stamped);
  per-min denominators from driver run lengths (`deathBy.time` exact; autoplay
  rows carry no length — drafts/run only for arm A).
- [ARM-A, log rows] fresh chained, 6 runs, all wave-1 deaths: drafts 0/0/0
  (SMART) vs 0/0/2 (IMPULSIVE, seed 5002: `rewrite_glacier`, `rule_once`
  taken). Policy effect on cadence: none visible (builds stay sub-cliff).
- [ARM-B, driver stdout] half granted chained, 6 runs, ALL censored at the
  1200-frame cap (~160 game-s, alive, wave still 1 = inside the wave-1 boss
  fight): drafts 13/13/14 (SMART) + 14/15/14 (IMPULSIVE) = 83 drafts over
  ~960 game-s = 5.2/min, ALL wave 1 (run never left wave 1, so every stamp
  is wave 1 by construction). Taken-split on the truncated path not directly
  read — taken~=offered under dev-night tier-first auto-pick
  (`src/main.js:8451`, take path `:4591`), flagged derived.
- [ARM-C/D/E + smoke, log rows + driver stdout] tier-pure SMART seeds
  5000-5002: fresh 0/0/0 drafts in t=36/13/23s (+smoke seed 4242: 0 in 8s);
  couple 2/0/0 in 36/9/19s (`rate`, `gold_pct` taken); partial 0/1/1 in
  38/37/38s (`pickup`, `lvl_VOLLEY_1` taken). Per-min: fresh 0/min (80s),
  couple 1.9/min (64s), partial 1.1/min (113s) — all wave 1, death-censored
  (runs end), NOT XP-curve-censored.
- Cliff wave where cadence < 1 draft/min: NOT identified — no run completed
  past wave 1 with drafts, and half's wave-1 cadence is 5.2/min. BELOW CAP
  (needs multi-wave completions; 160 game-s cap reaches only the wave-1
  boss). Fresh builds die before level 2 (0 drafts in 4/4 pure runs) — the
  wave-1 floor, distinct from the XP-curve cliff.

### Item 4 — boss wall: sub-cliff dies to AMBIENT pre-herald; split BELOW CAP

- 15 killer-attributed runs (deathBy, exact t) + 6 wave-1 unattributed
  (autoplay rows carry no killer): fresh pure 3/3 wave-1 AMBIENT
  (contact:CHASER x3, t=13-36s) + smoke 1/1 AMBIENT (8s); couple 3/3 wave-1
  AMBIENT (SWARMER/CHASER/CHASER, t=9-36s); partial 3/3 wave-1 AMBIENT
  (CHASER x3, t=37-38s); half 6/6 ALIVE at cap (in wave-1 boss fight, killer
  N/A). All granted-profile. Autoplay 6/6 wave-1 deaths unattributed.
- Against design (`src/config.js:1152-1153` BOSS 500+60/wave claims 5-8/10
  per wave `:1147-1151`; HERALD 1-3/10 `:1108-1111`; herald spawns at 60s =
  0.5 x WAVE_LENGTH 120s `:1099-1113`): the wall does NOT execute sub-cliff
  builds — AMBIENT does, before the first herald checkpoint (all sub-cliff
  deaths t<60s; herald/boss cannot be the killer by spawn construction).
  The "executes fresh builds at wave 1" hypothesis is CONFIRMED with
  attribution (ambient, not boss). COLOSSUS ruling respected: no death
  binned player-side; raw causes printed per run (all contact:*).
- Half: herald phase cleared 6/6 (alive past 60s every run), wave-1 boss
  engaged but unslain at 160s in 6/6 — herald claimed 0/6 (design 1-3/10,
  consistent at n=6, weak); boss claim rate UNSAMPLED (censored). The
  quantitative 1-3/10 vs 5-8/10 split is BELOW CAP (no build both reaches
  60s+ and dies within caps). Survival cliff re-pinned: between partial
  (dies ~38s granted, dev-night) and half (survives 160s) — PACING's
  ~2.2k..6.8M gap persists in kind (granted spends: partial 61325 =
  375+750+60200 [TABLE]-consistent; couple 225; fresh 0).

### Items 6 + 8 — cheap readings only

- Item 6 (dead tail, from items 1-4 + ledger [TABLE], no new runs):
  tier-2 divisor still 200 [CITED]. ZAP 60000/200 = 300 runs (was 3000 —
  the rung repriced 10x, tail shrinks 10x, root cause untouched); NOVA
  12000/200 = 60; SCYTHE 20000/200 = 100; luck L1 14000/200 = 70;
  SEEKER 280000/200 = 1400; MINE 420000/200 = 2100. Mid figures stay floors
  (item 4: sub-cliff banks purse-only 0-29g/run in dev-night snapshots;
  award floor is standard-mode). Tail persists for SEEKER/MINE-class,
  reachable for ZAP-class — lever choice still owner-open, no recommendation
  (item 6 defers to item 4: done above).
- Item 8 (WITCH concentration, [TABLE] only): WITCH 9000g
  (`src/meta.js:1544-1558`) bundles starting ZAP (standalone 60000g,
  `:451`) + maxMana 50 + manaCostMult 0.5 + CHAIN_REACTION Q for -25 maxHp
  vs KNIGHT 0 / ROGUE 2500 / PALADIN 6000 (`:1537-1572`): weapon-value alone
  is 6.7x the unlock price. Matched 8x cohort (time-to-first-boss-kill +
  GPM at equal spend across kits) needs 9+ half-length WITCH/ROGUE/PALADIN
  runs surviving to 120s+ boss kills — beyond cap. BELOW CAP, not measured.

### GAPS update

1. Income-tier staleness: PARTIALLY RESOLVED on the price side ([TABLE]
   values above); PERSISTS on the income side (battery blocked — §1 pairs
   stay [CITED]).
2. Mid-band curve: PERSISTS (half censored at 160s in-boss-fight; mid
   figures stay floors).
3. Draft-cliff wave: PERSISTS (wave-1 readings only; cliff BELOW CAP).
4. WITCH comparability: PERSISTS (cohort BELOW CAP; [TABLE] 6.7x stands).
5. 8x sequencing: RESOLVED — the 8x dev-night instrument ran 21 runs clean
   (this section); the remaining caps are budget caps, not sequencing.

### Runs executed (21 + 2 probes + battery attempts)

- Battery attempts: full `measure_income_stages.mjs` (threw fresh:run1) +
  `... partial` (threw partial:run1). 0/12 complete.
- Probes (counted, functional lane): INERT-path 600 frames (t=0/kills=0);
  real-fresh to death (27s, wave 1, 3 kills).
- A: `node tools/autoplay_policy.mjs --policy both --runs 3 --seed 5000`
  (6 runs, +6 log rows). B: `step4_cliff --profile half --policy both
  --runs 3 --seed 5000 --chain` (6 runs, 6/6 censored, +0 rows). C/D/E:
  `step4_cliff --profile fresh|couple|partial --policy smart --runs 3
  --seed 5000` pure (9 runs, +9 rows) + 1 smoke row (fresh/smart/seed 4242).
  SIM budgets per process: autoplay declared 150s; step4 runs declared
  150s (B) / 75s (C/D/E); every run its own arm, max charged 20s
  (1200 frames), no cap breach.
- NOT measured (and why): maxed-arm battery (predicted censored under both
  hypotheses — skipped, sign clear); cliff wave (needs >160 game-s
  completions — beyond machine caps); herald/boss split rates (no 60s+
  deaths in caps); WITCH cohort (9+ long runs — beyond cap); granted-vs-
  earned (no split exists — all grants labeled).

### Suite + hygiene

- `bash tools/run_all_dev.sh`: greenfiles=161 redfiles=11 (counts match the
  bar; REDLIST verbatim: test_beatability, test_economy_breadth,
  test_economy_reprice, test_evolution, test_meta, test_meta_rank,
  test_pacing_guards [BEAM-top assertion vs the 450000 value],
  test_sgkv4_purchases, test_shop_overrides, test_weapon_overrides,
  test_weapons). No baseline list in-tree to diff identity against — flagged.
- `src/` untouched (one `node --check` on the new tool, clean). New file:
  `tools/step4_cliff.mjs` (instrument, no balance surface). Log +16 rows via
  the REAL builder only. No git/network/emojis; no outside-worktree paths.
- Unverified / flagged: autoplay rows' killers (tool prints none);
  truncated-path taken-split (derived, cited); gold_earned in snapshots reads
  purse-only on deaths (0-29g; the AWARD floor is NOT in the snapshot field —
   income must come from profile-delta cohorts, never this column); pre-screen
   sims (`boss_sim` 20-run fresh cohort, `draft_sim` minute table) were run
   once each as instrument checks only and carry NO verdict weight.

### 4a — income battery re-run (2026-09-22, fixed instrument)

- Reproduction (minimal probes, counted-not-capped functional lane, quotes):
  battery path (`boot` -> `Object.assign(prof, makeProfile())` -> `startRun`):
  harness-stamped `runs=1`, after-assign `runs=absent` (=0 by the sparse-totals
  read), after-`startRun` `prologue=true`, after 600 frames
  `prologue=true, t=0, kills=0, mode=playing` — the inert arm, exactly as
  step 4 diagnosed. Real path (stamp intact): `prologue=false`, clock runs,
  dies `t~=10.5s wave=1 kills=0 mode=death-cine` (step 4's probe saw 27s /
  3 kills — seed/pilot variance; lethality intact either way, so the failure
  is INSTRUMENT, not a survival shift). Fixed path (re-stamp after assign):
  `prologue=false`, after 600 frames `t=10.0, kills=0, mode=playing`.
- Citations VERIFIED against the code (not taken on trust): `startRun`
  derives the phase from `achievements.totals.runs` at run start, absent
  counting as 0 (`src/main.js:8610-8639`, read at `:8619-8620,8639`);
  `C.PROLOGUE.ENABLED=true` (`src/config.js:631`, read); the harness stamps
  `runs=1` for non-prologue boots (`test/_harness.mjs:230-237`, read); fresh
  `makeProfile()` carries sparse totals so the whole-object assign wipes the
  stamp (`src/save.js:528-540`, read). `buildProfile()` returns a whole fresh
  profile per arm (`tools/measure_income_stages.mjs:53-91`), applied at
  `:109`.
- Fix location: `tools/measure_income_stages.mjs:110-117` — re-stamp
  `achievements.totals.runs = 1` immediately after the `Object.assign`.
  Why THERE: the `src/main.js` derivation is the correct player-facing
  contract (a real fresh profile's run #1 SHOULD open prologue); the defect
  is the battery replacing the whole profile object including the harness's
  measurement stamp. A tools-side re-stamp is the least invasive repair
  (`step4_cliff.mjs:108-110` precedent); `src/` untouched, player behavior
  byte-identical (suite red list below identical to baseline).
- Battery (`node tools/measure_income_stages.mjs`, default 4 arms, n=3,
  machine-enforced 60s/arm cap as found — caps NOT raised): 9/12 runs
  complete, maxed arm CENSORED (see below). Verbatim stdout [ARM]:
  `fresh run=1/3 died t=9s wave=1 kills=0 level=1 purse=0 banked=+320`;
  `fresh run=2/3 died t=16s wave=1 kills=0 level=1 purse=0 banked=+320`;
  `fresh run=3/3 died t=8s wave=1 kills=0 level=1 purse=0 banked=+70`;
  `SUMMARY arm=fresh survivedFullCap=0/3 medianT=9s medianGold=320g
  medianGoldPerSec=20.00g/s`; `couple run=1/3 died t=22s wave=1 kills=9
  level=2 purse=0 banked=+335`; `couple run=2/3 died t=32s wave=1 kills=22
  level=1 purse=0 banked=+357`; `couple run=3/3 died t=7s wave=1 kills=1
  level=1 purse=0 banked=+72`; `SUMMARY arm=couple survivedFullCap=0/3
  medianT=22s medianGold=335g medianGoldPerSec=11.16g/s`;
  `partial run=1/3 died t=30s wave=1 kills=19 level=1 purse=0 banked=+352`;
  `partial run=2/3 died t=35s wave=1 kills=27 level=2 purse=0 banked=+362`;
  `partial run=3/3 died t=50s wave=1 kills=38 level=1 purse=0 banked=+366`;
  `SUMMARY arm=partial survivedFullCap=0/3 medianT=35s medianGold=362g
  medianGoldPerSec=10.34g/s`; `maxed:run1` THREW at the machine cap (60.0s,
  alive — the cap enforcement working as designed), process aborted: maxed
  runs 2-3 never drove, no SIM line printed. Maxed reported CENSORED with
  this reading; no faked rows.
- Income table [ARM] (length, gold) pairs: fresh (9s, 320/320/70 —
  runs 1-2 carry FIRST_CLEAR 250 + AWARD 70, run 3 steady 70);
  couple (22s median, 335/357/72); partial (35s median, 352/362/366 —
  each run set a new best time so each carries +250; implied purse
  32/42/46 — derived arithmetic, flagged); maxed CENSORED at 60s cap
  (alive). Decomposition rule derived from `src/meta.js:350-362`
  (`computeRunGold`: BASE + kills/level/time terms + 250 iff firstClear):
  banked − 320 on first-clear runs = purse (15/37/2 couple; 32/42/46
  partial). Steady (non-first-clear) readings: fresh 70 [ARM], couple 72
  [ARM] — the AWARD floor 70 re-measured, consistent with PACING §1's
  (9s, 70g steady) band.
- Stale-vs-current price table KEPT (step-4 [TABLE] values carried; spot
  re-verified this run via grep — ZAP 60000 `:451`, NOVA_PULSE 12000 `:452`,
  SCYTHE 20000 `:453`, BEAM 450000 `:458`, luck base 14000 `:604`, fleetfoot
  base 65000 `:623` — all unchanged): ZAP 60000 (was 600000); luck base
  14000 / full-buy 434000 (was 140000); fleetfoot base 65000 / full-buy
  2015000 (UNCHANGED); hp L1 100 (was 120); dmg L1 125 (was 150); couple
  build cost 225 (was 270); BEAM 450000 (was 4,500,000); NOVA_PULSE 12000,
  SCYTHE 20000 (were 1.2M/2.0M); catalogue 44,960,367g over 50 rows (was
  98.5M); INCOME_TIERS still 70/100/200/754689 (unchanged).
- G1/G2/G7 income-side citations — updated ONLY where this battery
  measures: G1 denominator tier-0 70 RE-MEASURED [ARM] (fresh steady 70,
  couple steady 72 ~= 70 — the divisor stands; the 100/70 = 1.43 [TABLE]
  ratio from step 4 is unaffected). G2 denominator tier-1 100 NOT
  re-measured (no partial steady run — all three set new bests) — stays
  [CITED]. G7 denominator tier-2 200 NOT re-measured (maxed censored,
  partial steady unmeasured) — stays [CITED]. No guard edited.
- SIM: no SIM line (cap-throw abort on maxed:run1); ~269s charged across 10
  arms against 720s declared budget (derived from per-run t: 33 + 61 + 115
  + 60 + pump overhead — flagged derived). Probes counted (functional
  lane, no budget).
- Suite + hygiene: `bash tools/run_all_dev.sh`:
  greenfiles=161 redfiles=11 with the IDENTICAL red list (beatability,
  economy_breadth, economy_reprice, evolution, meta, meta_rank,
  pacing_guards, sgkv4_purchases, shop_overrides, weapon_overrides,
  weapons) — matches the 4a baseline. `node --check` clean on the one
  touched file (`tools/measure_income_stages.mjs`); `src/` untouched (no
  balance surface, no gameplay change). No git/network/emojis; no
  outside-worktree paths on any command line.
- Unverified / censored / flagged: maxed arm CENSORED (1 run driven to the
  60s cap alive; runs 2-3 never drove — late-tier income still has no [ARM]
  row on this tree); partial steady income unmeasured (all three runs
  first-clear); purse decomposition is derived arithmetic, not tool output;
  GAPS update vs step 4: gap 1 income side PARTIALLY resolved (fresh/couple
  steady floors + first-clear pairs measured; tier-1/tier-2 divisors and
  maxed still [CITED]/censored).
