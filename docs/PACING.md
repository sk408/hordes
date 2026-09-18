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

**Cheapest-source rule (owner context 2026-09-18: "we limited simulations to
max 60s" — sims were eating progress)**: every income figure in this file is
labeled with its source class — **[TABLE]** pure meta.js/config.js exports
evaluated in node (no sim), **[ARM]** a capped live run (the fixed 4-arm
battery, §1, ~12 capped runs worst case), **[CITED]** a prior measurement on
disk. Answer from [TABLE] first; spend an [ARM] only when a number genuinely
requires live play; [CITED] only for load-bearing history. Re-measuring the
baseline is NOT routine: it happens only when a change makes a baseline
stale, and the ledger row for that change states the staleness reason.

**The budget is ENFORCED BY A TEST, not by guidance (owner 2026-09-17:
"The agent wouldn't limit them on its own without my hard rule. It kept
bypassing the guidance to keep testing to minimal.")** Guidance was tried
and bypassed; the cap now throws. The machine check lives at
**test/test_sim_budget.mjs** (the guard) and **test/_sim_budget.mjs:62**
(`chargeSimSeconds` — the enforcement point every pumped frame passes
through, in BOTH harnesses: test/_harness.mjs pump() and
tools/real_loop.mjs advance()). It enforces: no single simulated arm over
60s (a boundary arm at exactly 60.0s passes; one more frame throws —
test/test_sim_budget.mjs:57 is the deliberate over-long arm); a declared
process budget throws the moment the total passes it; a real_loop cohort
without opts.budgetSimSeconds refuses to start (tools/real_loop.mjs:173).
There is deliberately NO off switch on the registry. **Every measurement
report carries the number**: `SIM: <n>s across <k> arms (budget <b>s
declared; sources: [TABLE]/[ARM]/[CITED] per figure)` — a figure with no
stated source is unverified. When a figure needs more than the budget, the
correct output is a REPORTED LIMITATION (what could not be measured and what
it would cost), never a longer run — the owner decides.

---

## 1. MEASURED INCOME (the calibration base)

**Re-measured 2026-09-18 (msg_01M2R0RAH5SYCK2MMM09R743X1 + refinements
01M2R12SW / 01M2R16J) after the died-early audit**: the original 3 arms
(322g / 77g / 35g, dying at 23s / 15s / 10s) were a BOT FLOOR, and the
flat per-run tier table below them assumed short runs. A run is now a
**PAIR (length, gold)** everywhere in this file. Tool:
tools/measure_income_stages.mjs (seeded mulberry32, n=6/arm, 60s cap,
income = the REAL settlement through the run-once purse seam).

**Policy (player-real levers only, no cheats — no hp inflation, no refills):
AUTO_ALL pilot + stance SAFE (the shipped STANCES dial, applied through the
real persisted-pref seam) + the real_loop cohort overlay policy (draft: NEW
WEAPON else card 1; intermission: CONTINUE) + q/e at bosses.** A 4-variant
sweep (stance SAFE/BALANCED x skills boss-only/on-ready) showed fresh death
is POLICY-INVARIANT: every variant died in wave 1 in 7-15s with **0 kills**.
The bot cannot play wave 1; that is the bot's flaw, not the game's (E1
measured the same "~15s / 0 kills" on 2026-09-14).

| arm (build, spend) | survival (median) | (length, gold) per run | label |
|---|---|---|---|
| fresh, tier 0 | dies 7-18s (9s) | (9s, 70g steady; 320g on first-clear runs) | BOT FLOOR |
| couple = fresh + hp L1 + dmg L1 (270g) | dies 7-16s (9.5s) | (9.5s, 70-330g) | BOT FLOOR — the two cheap upgrades do NOT extend survival |
| partial (dmg 2, hp 3, 4 weapons, KNIGHT, ~2.2kg) | dies 19-37s (21s) | (21s, 81-85g steady; up to 357g w/ first-clear) | BOT FLOOR |
| half = cheapest 24 of 47 rows by full-buy (**6.83M spent**) | survives cap 6/6 | (60s cap, 569g) = 9.48 g/s wave-1 | survivable arm (deep end-game build, NOT tier 2) |
| maxed (98.5M catalogue) | survives cap 6/6; WON at 1800s | (60s cap, 572g) = 9.54 g/s wave-1; (1800s, 754,689g) WON | the good-run reference |

**The survival cliff sits between ~2.2k and ~6.8M spent**: no mid build was
measured that survives wave 1 for 60s (partial dies at 21s; the 6.8M half
sails). Which purchases extend survival, measured: hp L1 + dmg L1 (270g) —
NO extension (9s -> 9.5s, seed variance); the partial basket (+3 weapons,
KNIGHT, dmg 2/hp 3) — +12s median (9.5 -> 21s) and kills 0 -> 7-23; the
6.8M half — at least +39s (dies 21s -> survives the cap), via the hp/dmg
ladders plus the mid-catalogue rows.

**INCOME IS SUPER-LINEAR IN RUN LENGTH — never extrapolate the 60s cap
linearly.** The maxed wave-1 rate is 9.54 g/s, but the WON 1800s run
averaged 754,689/1800 = **419.3 g/s** (kills 2.1/s in wave 1 vs 135.7/s
whole-run): wave density ramps. A 60s rate x 30 understates a WON run by
~44x. The (length, gold) curve is pinned only at the poles (dies-in-9s
floors and the WON run); the mid-game band is where the bot cannot follow
a player, and any per-run figure for it is a floor, not an income.

**Owner anchors, reconciled:**
- "a new player can get 300g easily" — measured first run **320g = AWARD 70
  + FIRST_CLEAR 250** (award-dominated, so the bot reconciles it without
  needing human skill; a surviving human adds a purse term on top). MATCH.
- "one with a couple upgrades can get near 2000g" — **NOT one run**: the
  couple arm's per-run income is unchanged (70-330g); 2000g is CUMULATIVE
  over ~7-29 runs at the measured band. The owner's phrasing reads as
  per-run; the measurement says the per-run reading is impossible at 270g
  of upgrades — the gap driver is run count, and for a human also run
  LENGTH (the bot banks ~0 purse at fresh; kills/sec 0.00 vs a human's
  unknown-but-positive — the bot is strictly a worse player, quantified
  where measurable: 0 kills, purse 0-1g per fresh run).

**Tier table verdict (the audit the task demanded):**
- **tier 0 (70) = the AWARD floor by construction** — it is what a run that
  dies with 0 kills banks; verified today again. Sound AS A FLOOR; it is a
  bot floor, labeled.
- **tier 1 (100, partial median 95.5 on 2026-09-14)** — same cohort method;
  today's partial arm re-confirms the order (steady 81-85g). BOT FLOOR,
  labeled.
- **tier 2 (200, "half-maxed median 185") — UNVERIFIED / DO NOT USE as
  player income.** It shared the died-early flaw in its worst form: a
  300s-CAPPED median over runs truncated then settled — truncation plus
  degenerate survival, so it measures neither a player's run nor a stable
  bot income. It stays ONLY as the bot-floor calibration the guards pin
  (G7); it is not evidence about tier-2 player income.
- **tier 3 (754,689) — SOUND**: one WON full-length 1800s run through the
  real settle (n=1, disclosed; raw log /tmp/g17_1b/maxed_r1.log,
  re-verified 2026-09-17). The 3,700x tier2->tier3 cliff is therefore REAL
  AS MEASURED but is a measurement of TODAY's DIFFICULTY SHAPE (builds
  below the survival cliff earn the award floor; builds above it farm a
  ramping field) — it is not an economy constant and will move if mid-build
  survival moves.

Prior §1 (the 60s three-arm table and its reconciliation) is retained in
git history (2026-09-17 state) and is superseded by this re-measure; its
arm-C night figure (35g = 70 x 0.5, pool exactly 0.5) is unchanged by this
task and remains the G6 fixture.

### THE INCOME BASELINE (named, persisted — the one-time 2026-09-18 cost)

Future balance changes compare against THIS table, not a fresh sim. Method:
tools/measure_income_stages.mjs — the FIXED battery is 4 arms (fresh /
couple / partial=mid / maxed=late), n=3 seeded runs, 60s cap each, ~12
capped runs worst case, income through the REAL run-once settlement, policy
as stated above (AUTO_ALL + SAFE + cohort overlay + q/e). This audit's
figures below are the n=6 run of the same battery (same seeds 1-3 shared);
[ARM] = capped live run, [CITED] = prior measurement on disk.

| stage | typical run | gold/run (steady) | rate + basis | source |
|---|---|---|---|---|
| fresh (tier 0) | dies ~9s (7-18) | 70 (+250 one-time FIRST_CLEAR) | 7.8 g/s of AWARD only — not a farming rate | [ARM] |
| couple (+hp L1 +dmg L1, 270g) | dies ~9.5s (7-16) | 70 — UNCHANGED by the upgrades | same | [ARM] |
| partial (mid, ~2.2kg) | dies ~21s (19-37) | 81-85 (+ first-clear runs to 357) | 4.0 g/s incl. award | [ARM] |
| maxed (late) | survives any cap; WON at 1800s | 754,689 | 9.54 g/s wave-1 in-cap; 419.3 g/s WON-run average — super-linear (§1), NEVER linearly extrapolated | [ARM] + [CITED] |

**Staleness rule**: a change touches survival (hp/dmg ladders, enemy
pressure, wave shape, potion supply) or the purse/award constants => the
affected rows are stale; the change's ledger row must say so, and only then
does the battery re-run. Price-only changes never stale the income side
(compare [TABLE] arithmetic against the same baselines).

---

## 2. THE FOUR INVARIANTS — testable sentences, today's numbers

### (a) RUN-VALUE — "a good run is worth ~one upgrade at the stage the player is at."
Tolerance: the cheapest row the player is realistically buying costs 0.5-2
good runs (measured per tier, upgrades-per-good-run in [0.5, 2]).

| stage | good run | typical next row (level) | upgrades / run | verdict |
|---|---|---|---|---|
| tier 0 (runs 1-5) | 70g (BOT FLOOR, §1) | hp L1 120g / dmg L1 150g | 0.47-0.58 | **PASS** (0.5 floor brushed) |
| tier 1 (runs 6-20) | 100g (BOT FLOOR, §1) | dmg L2 240g / focus L1 200g | 0.42-0.83 | **PASS** (same) |
| tier 2 (runs 21-45) | 200g (UNVERIFIED floor, §1) | cheap-row ladder 120-500g | 0.4-1.6 | **PASS** as floor |
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

**Re-derived per-SECOND (2026-09-18 re-measure, run length made explicit):**
the 754,689g reference already EMBEDS the 1800s WON-run length, so the FAIL
verdicts do not change when length is accounted for — restated on the
per-second basis: fleetfoot L2 130,000g = 130,000 / 419.3 g/s = **310s** of
end-game farming (0.17 x 1800s); luck L2 280,000g = **668s** (0.37 x 1800s).
There is no shorter end-game run to price against (a maxed build does not
die; the run ends at the 1800s limit), so the verdicts are FAIL, unchanged,
now length-explicit.

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
  Disclosed: at the fresh end the re-measured bot cycle is ~9s death + 3s
  restart = 12s, so an overnight banks 35g x ~2,400 cycles = **~84k** (was
  ~44k on the old 23s+3s cycle; same order, still the whole EARLY catalog —
  but so does ~10 minutes of active play; the floor's job binds only where
  items are expensive, and there it lands at 1-2). The real overnight figure
  should be confirmed from the owner's first night-mode session.

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
200g/run (now labeled UNVERIFIED / bot floor in §1 — the 300s-capped
degenerate median). The 3,700x income cliff between runs 21-45 and 46+ IS
the dead tail. **The 3,000-runs figure is an UPPER bound priced against a
floor**: a tier-2 PLAYER who survives longer banks more per run (income is
super-linear in length, §1), so the true player figure is fewer runs — but
still FAIL by orders of magnitude at any measured rate (even the 6.8M
build's 9.5 g/s wave-1 rate makes ZAP = 600,000/9.5 = 17.5 HOURS of
farming). Root cause is difficulty, not price: sub-cliff builds die in
seconds and earn the award floor (§1 re-measure). Levers (either/or, owner
decision): raise tier-2 survival/income, or insert a 140k-600k-priced rung
band reachable at ~200-400g/run. **OPEN** — guarded by
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

- The 2026-09-18 re-measure: 5 arms x 6 seeded runs x ≤60 sim-seconds
  (≤1,800 sim-s total) through the real loop, real settlement — §1
  (tools/measure_income_stages.mjs); plus a 4-variant fresh policy sweep
  (stance x skill cadence) establishing fresh death is policy-invariant.
- The 2026-09-17 measure it replaced: 3 arms x ≤60s (its numbers survive
  only as the G6 night fixture, §1).
- Pure-table arithmetic from src/meta.js + src/config.js exports (no sim).
- **Not** simulated (per the 60s cap rule): overnight idle (projected from
  in-cap rates + the measured 12s bot cycle, §2c); long-run tier-3
  confirmation (cited from the G17 measured ledger instead); any mid-build
  run longer than 60s (the mid band is unmeasurable by the bot today, §1 —
  its figures are floors).

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
| ZAP mana gate | HARD: no fire at mana < cost, cd held at 0 | src/weapons.js:434-441 | owner 2026-09-17: "a mana-consuming weapon fires when mana is insufficient, including at exactly zero" — the dry 0.5x bolt was masking the mana budget | 2026-09-17 chain-gate task (was N1a soft gate, MANA_DRY_MULT 0.5) |
| ZAP base chain count | COUNT 3 TOTAL enemies/fire (was JUMPS 3 = 4 total); weapon ladder is damage-only now | src/weapons.js:84-110 | owner msg_01M2RENZ: "reduce it to 3 to start with a buyable" — kill rate is run value | 2026-09-17 chain-zap rework (also retired the ladder's +1 jump/even level: L8 was 8 enemies, now 3 — disclosed nerf) |
| zapchain row (Storm Conduit) | base 200,000, growth 1.7, max 5 (full-buy 3,771,020g = 2.50h) | src/meta.js SHOP_UPGRADES 'zapchain' | owner msg_01M2RENZ: "technically uncapped buyable but with a limit on range" — L1 arms the uncapped count + 20px hop range/level (MAX_HOPS 64 hard bound) | 2026-09-17 chain-zap rework |
| boomBlast mana gate | HARD: null at mana < 6 (no blast, no spend) | src/rewrites.js:433-447 | same directive — the ONE detonation (CHAIN REACTION card, Witch Q, STORMREAPER) | 2026-09-17 same task (was dry fallback 0.6 radius / 0.4 damage) |
| potion supply + auto-drink threshold (ONE combined row) | DROP_CHANCE 0.03 -> 0.006 (exactly 1/5); ADAPTIVE trail-off squared (REF/kps)^2, FLOOR 0.2 -> 0.04 (bind point 100 unchanged); AUTO HP gate: max*0.35 -> the potion's heal (HP_HEAL x healMult), strictly below, AUTO/night only | src/config.js POTIONS / src/loot.js adaptiveDropFactor / src/main.js autoDrinkPotions | owner msgs 01M2R9CX + 01M2RE1V (2026-09-17): "a lot of potions on the ground ... cut it TO 1/5th ... and steepen the trail off" + "If HP drops below what a potion would heal, it should be used ... In auto mode that is". RUN-VALUE invariant re-check: cut is the per-kill GROUND channel only (chests/starts untouched, disclosed); maxed measured ground value 239/226 -> 158/130 flasks @300s; run length UNCHANGED (maxed arms truncated-at-cap before and after; fresh/partial die to capped-hit bursts at 6-26s in BOTH arms — hp never below any threshold while a frame passes, so the pair shortened nothing) | 2026-09-17 potion tune (audit: docs/RESOURCE_SPEND_AUDIT_2026-09-17.md) |

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
  FLAT-THEN-CLIFFED inside the mid game (100 -> 200 -> 754,689 — every figure
  the §1 measured series, provenance above; NOT the withdrawn
  700/1200/1800/2800 constant table) — the shape
  mismatch is concentrated at the tier-2/tier-3 seam, not spread evenly.
- **The withdrawn idea** (compress the price ladder to match a smoother
  income curve) must not be re-proposed from the old numbers; any future
  version starts from §1's measured table.

docs/briefs/CONDENSE_PROPOSAL.md §4 now points here (folded 2026-09-17); §5
(resource differentiation) and §6 (idle design record, Direction B chosen)
remain in that file, untouched.
