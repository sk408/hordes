# PACING — the invariants, the ledger, the guards (2026-09-17)

Task msg_01M2QV1H7EJ3NSHAZT57SW944P. This is the ONE pacing document: the
curve section of docs/briefs/CONDENSE_PROPOSAL.md is folded in here (§6) and
that file now points here instead of carrying its own curve.

---

## 0. THE STANDING RULE (read before touching any number)

**Every balance-constant change must (1) name the invariant below it targets,
(2) add a row to the TUNING LEDGER (§5), and (3) keep the guards in
test/test_pacing_guards.mjs green — or, when a guard is deliberately moved,
disclose the old and new bound in the same commit. No naked number tweaks.**
A change that cannot say which invariant it serves is a regression, not a
tune.

---

## 1. MEASURED INCOME (the calibration base)

MEASURED directive msg_01M2QW6H9AFKQWEN4QV2KZA0VV: gold/second headless
through the REAL loop (test/_harness.mjs boot, AUTO_ALL pilot, no hp refills,
no cheats), 60s sim cap per arm — 3 arms, ≤180 sim-seconds total (~3,900
frames, ~10s wall). Script: /tmp/pacing_measure.mjs (one-shot; numbers below).

| arm | died at | banked | breakdown |
|---|---|---|---|
| A fresh profile | t=23s | **322g** | award 70 + FIRST_CLEAR 250 + purse 1 |
| B fresh + dmg L1 + hp L1 | t=15s | **77g** | award 70 + purse 4 + 3 residual |
| C fresh, NIGHT MODE | t=10s | **35g** | award 70 x 0.5 (pool total exactly 0.5) |

**Owner anchors**: "new player ~300g" — measured first run 322g, MATCH
(disclose: includes the one-time 250 FIRST_CLEAR; the steady-state fresh run
is 70-77g, matching GOLD_MODEL.INCOME_TIERS tiers 0-1 of 70/100).
"a couple upgrades ~2000g" — at 70-100g/run that is **cumulative** income
over ~20-28 runs (tiers 0-1 band), consistent with the measured tier table;
two cheap upgrades do NOT extend survival inside one run (arm B died at 15s
vs arm A's 23s — run-to-run seed variance, not a survival gain).

Reference tier table (meta.js:256-267, MEASURED 2026-09-14/15 — see ledger):
tier 0 runs 1-5 ~70g/run · tier 1 runs 6-20 ~100g · tier 2 runs 21-45 ~200g ·
tier 3 runs 46+ 754,689g (a WON 1800s maxed run; G17 slice 1b measure, raw
log /tmp/g17_1b/maxed_r1.log). The 3,700x cliff between tier 2 and tier 3 is
the single most load-bearing fact in this file.

---

## 2. THE FOUR INVARIANTS — testable sentences, today's numbers

### (a) RUN-VALUE — "a good run is worth ~one upgrade at the stage the player is at."
Tolerance: the cheapest row the player is realistically buying costs 0.5-2
good runs (measured per tier, upgrades-per-good-run in [0.5, 2]).

| stage | good run | typical next row (level) | upgrades / run | verdict |
|---|---|---|---|---|
| tier 0 (runs 1-5) | 70g | hp L1 120g / dmg L1 150g | 0.47-0.58 | **PASS** (0.5 floor brushed) |
| tier 1 (runs 6-20) | 100g | dmg L2 240g / focus L1 200g | 0.42-0.83 | **PASS** (same) |
| tier 2 (runs 21-45) | 200g | cheap-row ladder 120-500g | 0.4-1.6 | **PASS** |
| tier 3 (runs 46+) | 754,689g | fleetfoot L1 65,000g | **11.6** | fail-overshoot (pocket change) |
| tier 3 | 754,689g | BEAM 4,500,000g | **0.17** | **BY DESIGN** — owner: "a few hours to get ONE top tier item" (see (d)) |

**Verdict: PASS at tiers 0-2. At tier 3 the experience is bimodal by owner
design** (top tier = 5-6 good runs, invariant (d)); the disclosed wart is
granularity — no row sits near 1 good run at end-game (nearest: fleetfoot
full-buy 2.015M = 0.37, single 65k = 11.6). Guarded: G1, G2 (early bands),
G3 (the top cap).

### (b) TIME-IN-GRADE — "a purchase stays the freshest thing you own for >= N runs."
Proposed from the existing curve: **N = 2 runs** to the next level of the
same row, at the tier where the row is bought.

| row, at its tier | next level | runs to next | verdict |
|---|---|---|---|
| dmg L1 -> L2 (tier 0-1) | 240g | 2.4-3.4 | **PASS** |
| dmg L4 -> L5 (tier 1) | 983g | ~10 | **PASS** |
| fleetfoot L1 -> L2 (tier 3) | 130,000g | **0.17** | **FAIL** |
| luck L1 -> L2 (tier 3) | 280,000g | **0.37** | **FAIL** |
| top single-purchase rows | — | 5-6 each | **PASS** |

**Verdict: FAIL at the end-game multi-level rows.** The owner complaint
("upgrades don't feel long enough lasting") maps exactly here: at 754k/run,
the 65k-433k multi-level rungs vaporize in a fraction of a run. Fix lever
(price those rungs up) is an owner decision — OPEN, ledger-noted. Guarded:
G4 (early N=2 holds), G5 (regression floor: no end-game purchase may drop
below 0.1 good runs while the FAIL is open).

### (c) IDLE FLOOR — "unattended progress is worth ~1-2 upgrades per night; a floor beneath active play, never the optimum."
- **Never the optimum: PASS by construction.** Night mode's pool is exactly
  0.5 (RUN_GOLD.NIGHT_PENALTY_PCT 50, one additive home, meta.js:206) —
  identical play banks exactly half; measured arm C: 35g vs 70g. Guarded: G6.
- **Worth ~1-2 upgrades per night (projection from in-cap rates — an
  overnight run was NOT simulated, per the 60s cap rule):** at tier 3 a WON
  night run takes 1800s + 3s restart = 16.0 runs per 8h night x 377,345g =
  **6.02M = 1.34 top-tier items** — **PASS** at the end-game reading.
  Disclosed: at the fresh end (35g x ~1,250 cycles of ~23s) an overnight
  banks ~44k, which buys the whole EARLY catalog — but so does ~10 minutes
  of active play; the floor's job binds only where items are expensive, and
  there it lands at 1-2. The real overnight figure should be confirmed from
  the owner's first night-mode session.

### (d) NO DEAD TAIL — "the next upgrade never costs more than a stated multiple of a good run's gold."
Stated multiple: **6 good runs** (the G17 3h single-item cap; measured max
5.96).

| stage | worst next-item | cost / good run | verdict |
|---|---|---|---|
| tier 3 (the tier the premium catalog was priced against) | BEAM 4.5M / 754,689g | **5.96** | **PASS** (≤ 6) |
| tier 2 (runs 21-45, 200g/run) | ZAP 600,000g | **3,000 runs** | **FAIL** |
| tier 2 | NOVA_PULSE 1,200,000g | 6,000 runs | FAIL |
| tier 2 | luck L1 140,000g | 700 runs | FAIL |

**Verdict: PASS at the top, FAIL by 100-1000x at the middle.** This is the
player-review "quarter of a weapon" case with numbers attached: the G17
catalog is priced against tier-3 income (754k/run), but tier-2 income is
200g/run — the 3,700x income cliff between runs 21-45 and 46+ IS the dead
tail. Root cause is difficulty, not price: sub-max builds die in minutes and
earn ~nothing (E1 measured bands), so mid-tier income is degenerate. Levers
(either/or, owner decision): raise tier-2 survival/income, or insert a
140k-600k-priced rung band reachable at ~200-400g/run. **OPEN** — guarded by
G7 (regression ceiling: ZAP must not exceed 3,200 tier-2 runs while open).

---

## 3. GUARD MAP — test/test_pacing_guards.mjs

| guard | invariant | assertion (today's value) |
|---|---|---|
| G1 | (a) | hp L1 120g / tier-0 70g in [1, 3] runs (1.71) |
| G2 | (a) | dmg L1 150g / tier-1 100g in [1, 3] runs (1.50) |
| G3 | (d top) | EVERY shop/apex-excluded row's full-buy ≤ 6.05 x tier-3 754,689 (max: BEAM 5.96) |
| G4 | (b) | dmg L2 240g / tier-1 100g ≥ 2 runs (2.40) |
| G5 | (b open FAIL) | fleetfoot L2 130,000g ≥ 0.1 x tier-3 (0.17) — no further vaporization |
| G6 | (c) | night pool total === 0.5 and settled award === 35 on the standard fixture; CONTINUE/RESTART delays === 3.0s |
| G7 | (d open FAIL) | ZAP 600,000g ≤ 3,200 x tier-2 200g (3,000) — no worse while open |
| G8 | rule §0 | CHALLENGE_BONUS_PCT / NIGHT_PENALTY_PCT each defined exactly once in meta.js (single-home) |

Fail-first: verified red by on-disk mutation (BEAM 4500000 -> 9000000) then
revert — G3 failed as required; the run is recorded in the task report. The
G5/G7 guards pin today's numbers as regression bounds deliberately: the
invariants they serve are currently FAILING (owner decision OPEN), so a hard
band would keep the suite red — the bounds guard against getting WORSE and
the ledger rows carry the open items.

---

## 4. WHAT WAS SIMULATED

- 3 headless arms x ≤60 sim-seconds (≤180 sim-s total, ~3,900 frames, ~10s
  wall) through the real loop — §1.
- Pure-table arithmetic from src/meta.js + src/config.js exports (no sim).
- **Not** simulated (per the 60s cap rule): overnight idle (projected from
  in-cap rates, §2c); long-run tier-3 confirmation (cited from the G17
  measured ledger instead).

---

## 5. TUNING LEDGER

Format: name — value — home — why — last change (date + reason, from code
comments / git where visible). A balance change without a new row here is a
violation of §0.

| name | value | home | why | last change |
|---|---|---|---|---|
| RUN_GOLD.AWARD | 70 | src/meta.js:185 | fixed end-of-run floor ("fixed amount at end of the run") | 2026-09-14 E1 owner directive (old formula floor ~60-80) |
| RUN_GOLD.FIRST_CLEAR | 250 | src/meta.js:172 | one-time best-time bonus, separate from the pool | 2026-09-17 challenge-gold task kept it SEPARATE (unhalved by night) |
| RUN_GOLD.CHALLENGE_BONUS_PCT | 200 | src/meta.js:197 | challenge modes pay +200 POINTS into the additive pool | 2026-09-17 owner: "200% additive, lever to change later" |
| RUN_GOLD.NIGHT_PENALTY_PCT | 50 | src/meta.js:206 | night (idle) mode pays -50 POINTS in the same pool | 2026-09-17 owner: "start at half gold" |
| HEAT_CURVES.GOLD | 0.30/push | src/heat.js:37 | manual stakes pushes raise the pool (+30 POINTS each) | WAVE-9 heat design; 2026-09-17 additive-pool rebase |
| HEAT_CURVES.XP | 0.12/push | src/heat.js:42 | second payout channel, manual-only symmetry | G24 slice 1 |
| GOLD_TIER (7 rows) | 0/1/3/8/15/60/150 | src/meta.js:318-326 | tier-weighted per-kill purse | 2026-09-14 E1 owner directive |
| WEAPON_PRICES (7 rows) | 200…4.5M | src/meta.js:394-404 | archetype ladder vs measured 1,509,378g/h | 2026-09-15 G17 slice 1b reprice (was ~69x too fast at top) |
| ELITE_MODIFIERS costs | 1.0/1.8/2.8M | src/meta.js:413-429 | elite-mod unlock rungs | 2026-09-15 G17 slice 1b |
| luck row | base 140,000, growth 2.0 | src/meta.js:512 | top of mid catalog (2.87h full-buy) | 2026-09-15 G17 slice 1b |
| fleetfoot row | base 65,000 | src/meta.js:529 | the one mid rung (2,015,000 full-buy) | 2026-09-15 G17 slice 2 breadth |
| premium rows (15) | 3.98-4.43M full-buy | src/meta.js:532-561 | "a few hours to get ONE top tier item" | 2026-09-15 G17 slice 2 |
| arcade row | 4,200,000 | src/meta.js:592 | late-game flex sink (2.78h) | 2026-09-15 G17 slice 1b (was 140k) |
| GOLD_MODEL.INCOME_TIERS | 70/100/200/754,689 | src/meta.js:256-267 | MEASURED per-tier income (calibration base for §2) | 2026-09-15 G17 1b replaced tier-3 11k with the WON-run measure |
| NIGHT_CONTINUE_S / NIGHT_RESTART_S | 3.0 / 3.0 | src/config.js:458-459 | the two night auto-advance delays (idle cadence) | 2026-09-17 owner night mode |
| AUTOPILOT.DRAFT_TIMEOUT | 6.0 | src/config.js:450 | AUTO draft auto-pick window | 2026-09-16 owner: "6 second timeout" |
| LADDER (HP_LATE 1.055, DMG_LATE 1.010, XP_LATE 1.030, KNEE 8) | — | src/config.js:886-900 | bounded post-knee escalation (+23.9%/wave hp) | RUN-STRUCTURE wave (superseded §4 of CONDENSE_PROPOSAL) |
| ENEMY.SPAWN_INTERVAL | 1.35 | src/config.js:135 | ambient pressure budget (floor 0.25s at t≥137.5) | WAVE-20 tuning (1.05 was killing half the cohort pre-boss) |
| ESCALATION.BOSS.HP_MULT | 500 + 60/wave | src/config.js:831-832 | the wave boss is the wall (5-8 of 10 runs die there) | WAVE-20 (60/30 -> 260/75 -> 500/60 measured ladder) |

OPEN items (owner decision pending — guards pin, do not fix):
- (b) end-game multi-level rows vaporize (<1 run): reprice fleetfoot/luck
  rungs or accept.
- (d) tier-2 dead tail (ZAP = 3,000 tier-2 runs): raise mid-tier income or
  add a mid-priced rung band.

---

## 6. FOLDED IN: the progression-curve section (was CONDENSE_PROPOSAL §4)

Status carried over: the ladder-compression PROPOSAL remains WITHDRAWN
(owner correction 2026-09-17 — its income side misread the economy). What
stood then and still stands, now re-based on §1's measured numbers:

- **Price citations (stand):** NOVA_PULSE 1.2M / SCYTHE 2.0M priced against
  tier-3 income read as pocket change at the top (1.6/2.6 good runs) and as
  the review's "quarter of a weapon" at tier 2 (6,000/10,000 runs) — the
  (d) FAIL above. Late 4-5M rows vs a 754,689g maxed run = 5-6 runs, the
  intended shape.
- **Ladder vs income:** the price ladder spans ~x22,500 (hp L1 120g to BEAM
  4.5M) while income spans ~x10,800 across tiers (70 -> 754,689) but is
  FLAT-THEN-CLIFFED inside the mid game (100 -> 200 -> 754,689) — the shape
  mismatch is concentrated at the tier-2/tier-3 seam, not spread evenly.
- **The withdrawn idea** (compress the price ladder to match a smoother
  income curve) must not be re-proposed from the old numbers; any future
  version starts from §1's measured table.

docs/briefs/CONDENSE_PROPOSAL.md §4 now points here (folded 2026-09-17); §5
(resource differentiation) and §6 (idle design record, Direction B chosen)
remain in that file, untouched.
