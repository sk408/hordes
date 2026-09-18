# MID-GAME PROGRESSION LAG — the measured diagnosis + re-price options (2026-09-18)

Owner verbatim: "We need to keep the grind feeling but there's some serious
mid game lag." Method: every number below is [TABLE] arithmetic against the
REAL `SHOP_UPGRADES` ladder (148 non-elite buy steps) and the MEASURED
income anchors in docs/PACING.md §1 (re-measure 2026-09-18). **No constants
were changed** — every proposed number is the owner's call.

## 1. THE MEASURED DIAGNOSIS — runs per next-step upgrade, band by band

The player walks the ladder cheapest-first; income is the MEASURED
spend→income anchor chain (70g fresh → 85g partial → **200g tier-2 FLOOR,
UNVERIFIED bot floor** → 569g at the 6.83M half-build → 754,689g maxed).
Everything in the 2.2k–6.83M spend range is priced against a FLOOR: a
surviving player earns more (income is super-linear in run length, §1), so
every runs-per-step figure below the cliff is an UPPER bound.

| band (cumulative spend) | steps | runs/step | worst step in band |
|---|---|---|---|
| A: 0–2.2k (the cheap catalogue) | 11 | 1.7–3 | Forged Edge L2 240g = 3 runs |
| B: 2.2k–30k | 47 | 1.3–6 | Alchemy L4 1,147g = 6 runs |
| C: 30k–140k | 22 | 5.9–**325** | **Fleetfoot L1 65,000g = 325 runs** |
| D: 140k–1M (the G17 mid/top rungs) | 7 | **500–695** | **Hairtrigger L1 139,000g = 695 runs** (Fortune L1 140,000g = 700) |
| E: 1M–6.8M | 19 | 700–**2,720** | Hollowpoint L3 544,000g = 2,720 runs (floor-priced; deep band) |
| F: 6.8M–98.5M (end-game) | 42 | 8–874 | (income rising; BEAM 4.5M = 5.96 good runs BY DESIGN) |

**The shape is CONFIRMED, with one correction**: "flat-then-cliffed inside
the mid game, mismatch concentrated at the tier-2/tier-3 seam" is exactly
what the numbers show — bands A–B are SMOOTH (1.3–6 runs, the invariant
(a) tolerance holds); the cliff begins at ~30k cumulative spend (Fleetfoot
/Fortune territory), not gradually through the mid. **The worst lag band is
C+D: the next step costs 325–700 runs at the measured floor** — 80–175× the
invariant's 4-run ceiling. The single worst step in the career is Hollow
point L3 at 2,720 floor-runs, but a player that deep has real income above
the floor; the FELT lag is C+D.

**Anchor cross-checks (the calibration points):**
- Owner: "a new player can get 300g easily" — first run 320g measured
  (AWARD 70 + FIRST_CLEAR 250): MATCH. At 300g/run, 59 of 148 steps cost
  0.75–4 runs; the first step above 4 runs is **1,277g (Deadeye L4)** — the
  lag is already visible at the owner's own anchor, one rung past the cheap
  catalogue.
- Owner: "one with a couple upgrades can get near 2000g" — measured as
  CUMULATIVE over ~7–29 runs (per-run is 70–330g): the phrasing reads
  per-run, the measurement says run count.
- Player review: "a good run nets you only 1/4th of a single upgrade" — at
  300g/run a 1,200g rung is exactly 4 runs = 1/4 of it. MATCH, and it dates
  the complaint to band B's top / band C's bottom.

## 2. THE CHEST INTERACTION (measured together, not in isolation)

The run-count chests pay 10× the player's stored lifetime average = **10
runs of income each, at runs 50 / 100 / 200 / 500**. On this curve the 50/
100/200 chests land inside the lag window (career spends ~6k / ~16k / ~36k
at floor income → 700–2,000g each). Against the band-C/D worst steps
(325–700 runs), the three lag-window chests together add ~30 runs of income
— a **3–9% shorter wait on any one worst step, <2% of the band total**. The
500 chest lands post-cliff for real players. **Verdict: the chests are a
feel-good spike ON TOP of the curve (exactly where the task wants them);
they are not a fix for the lag.**

## 3. THE OPTIONS (no constants changed — all numbers are proposals)

### Option 1 — PRICE GRANULARITY (one file, anchors untouched; the low-risk lever)
Keep every full-buy total (so the G17 60h catalogue target and guard G3
survive); re-shape the two mid gates so their FIRST level is reachable:
- Fortune (luck): L1 140,000 → **35,000g = 175 runs**, growth 2.0 → 3.02
  (full-buy stays 4,340,000g; the L5 rung steepens to ~2.91M).
- Fleetfoot: L1 65,000 → **20,000g = 100 runs**, growth 2.0 → 2.85
  (full-buy stays 2,015,000g).
- Weapon Slot L1/L2/L3 5,000/14,500/42,050 (25/73/210 runs) flattened to
  ~9,000/16,000/33,000 (45/80/165) — same full-buy.
- Effect on the anchors: NONE at tier 0–1 (cheap rows untouched; first run
  still 320g; Deadeye L4 unchanged). Worst lag step drops **700 → 175
  runs**. Honest limit: at the measured 200g floor, the 1–4-run invariant
  band is UNREACHABLE by pricing — bridging 1.2k to 140k in ≤4-run steps
  needs ~170 rungs. Option 1 buys smoothNESS (no step above ~175), not the
  invariant.

### Option 2 — INCOME/SURVIVAL (the root-cause lever; rebalances everything)
The lag is not really price — PACING (d) already named it: builds below the
survival cliff (2.2k–6.8M spend) die in seconds and earn the award floor,
while the rungs they face are priced against tier-3 income. Numbers: to make
Fortune L1 a 4-run purchase the mid band needs 35,000g/run — **175× the
measured floor and above even the 6.83M-build's 60s rate**; no price ladder
fixes that. Moving the cliff (mid builds surviving 120s at the measured
9.5 g/s wave-1 rate ≈ 1,140g/run, 5.7× the floor) makes Fortune L1 = 123
runs and Slot L3 = 37 with ZERO price changes. Risk: it stales the entire
§1 income table, touches difficulty (every band at once), and can break the
fresh anchors if the early game gets easier.

### Option 3 — RECOMMENDED: Option 1 now + an explicit mid tolerance + survival as its own task
1. Ship Option 1's three re-shapes (price-only, one file, full-buys and
   anchors preserved, guards G3/G17 intact).
2. The owner decides the mid tolerance EXPLICITLY — the invariant (a)
   "0.5–2 good runs" cannot hold in the mid at the measured floor; proposed
   wording: "no mid step above ~25 runs once survival work lands."
3. Survival (Option 2) becomes its own task — it is the structural fix and
   carries the §1 re-measure cost by the staleness rule.

## 4. REPORT SUMMARY

- Worst measured lag: **325–700 runs per next-step upgrade in the 30k–1M
  spend band** (Fleetfoot L1 / Fortune L1 / the G17 rung bases), against
  the invariant's 4.
- Shape: CONFIRMED flat-then-cliffed, cliff starting at ~30k spend (the
  tier-2/tier-3 seam, as suspected).
- Options: price granularity (700→175 worst, anchors safe, cannot reach
  1–4 runs), income/survival (root cause, 175× floor gap, high risk),
  recommended hybrid (price now, tolerance decided, survival separate).
- Chests: ~30 runs of extra income across the lag window = a 3–9% shave on
  the worst steps — on top of the curve, not the fix.
- SIM: 0.0s across 0 arms (sources: [TABLE] SHOP_UPGRADES arithmetic ×148
  steps; [CITED] PACING.md §1 anchors). Tool: tools/measure_midgame_curve.mjs.
