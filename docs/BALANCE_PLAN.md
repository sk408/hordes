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
