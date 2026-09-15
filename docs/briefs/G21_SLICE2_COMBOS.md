# G21 SLICE 2 - RULE-CHANGING CARDS: CROSS-TAG COMBOS + THE CLIMB TO 12+ - BUILD BRIEF

**Slice:** G21 slice 2 of 2, ranked-queue item (`docs/HORDES_GOALS_2026-09-12.md:2542` - READ THE FULL
G21 ENTRY before starting; the source file is authoritative). Slice 1 landed the SYSTEM (taxonomy,
REWRITE_SLOTS=4, empty-slot cooldown incentive, the five tagged cards, ONE `onWeaponHit` writer) - its
brief is `docs/briefs/G21_RULE_CARDS.md` and its contract is BINDING here (no chain-of-chains, riders on
direct hits only, family share held, pure helpers, no save schema change). This slice adds the cross-tag
combos and the second card per tag to reach 14 cards total, inside the goal's 12-20 band.
**Builder:** `cli:kimi-hordes-g8`.
**Brief authored by:** the goal pilot, 2026-09-15, while slice 1 was in flight; the DISPATCH ANCHOR
CHECK below was EXECUTED by the dispatch tick on the post-slice-1 tree (HEAD e22c6d1, dirty=17 -
slice 1 is IN THE TREE, uncommitted; the orchestrator owns commits). Every anchor is now POST-slice-1
and RESOLVED - build against the DISPATCH ANCHOR CHECK (EXECUTED) block, its line numbers are live.
**Ordering:** runs strictly after slice 1 lands and the pilot verifies it. Do not start on a tree where
slice 1 is absent or its suite is red.

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain` + `git log --oneline -3` - record tree state and HEAD; state whether slice
   1's work is present (look for `REWRITE_SLOTS` in `src/config.js`, `onWeaponHit` in `src/rewrites.js`,
   the five slice-1 card ids `rime|ignite|livewire|aftershock|wideorbit`).
2. RUN `bash tools/run_suite.sh` and paste its verbatim final line under MEASURED CURRENT BEHAVIOUR.
   If it does not end `redfiles=0`, STOP - slice 2 is not issued on a red tree.
3. Re-resolve, on the post-slice-1 tree, and correct in place: the `rewriteCards(state)` pool site in
   `src/main.js`; `REWRITE_CARD_WEIGHT` and its tuning-curve comment in `src/rewrites.js`; the death
   pass (`applyBlast` call site) in `src/main.js`; the burn tick beside the slow decay; the orbit-blade
   radius/spin reads (wherever slice 1 put WIDE ORBIT's writes); `skillCooldown` in `src/perks.js`.
4. Confirm slice 1's invariants still hold and SAY SO: exactly one `onWeaponHit` writer; no rider call
   from blasts/burn/echoes/thorns; predicate-offered cards consume no RNG draw when false.
5. Re-run the RIDER CALL-SITE CHECKLIST grep (`hp -= ` over `src/main.js` + `src/weapons.js`) and
   replace slice 1's list with the post-slice-1 line numbers if any shifted.


## DISPATCH ANCHOR CHECK (EXECUTED 2026-09-15 by the dispatch tick - these line numbers are LIVE)

1. Tree: HEAD `e22c6d1`, `dirty=17` (slice 1 present, uncommitted - do NOT run any git state command;
   leave the tree dirty and report). Slice-1 presence: `REWRITE_SLOTS: 4` at `src/config.js:387`
   (comment at :383-386); the ONE writer `onWeaponHit` at `src/rewrites.js:380`; the five slice-1 card
   ids at `src/rewrites.js:84 (rime), :90 (ignite), :96 (livewire), :102 (aftershock), :112 (wideorbit)`.
2. Suite line: pasted under MEASURED CURRENT BEHAVIOUR - `redfiles=0`, this slice is issued on green.
3. Resolved anchors:
   - `rewriteCards(state)` pool site: `src/main.js:2627` (spread into the draft pool; import at :45).
   - `REWRITE_CARD_WEIGHT` + its tuning-curve comment: `src/rewrites.js:141` (comment block directly
     above), consumed at `:264`.
   - The death pass: `src/main.js:1998-2002` (the rewriteBoom blast site). NOTE the N1 slice-3 move:
     `applyBlast`'s application loop lives IN `src/rewrites.js` now; the other blast damage site is
     `src/main.js:2309` (`o.hp -= blast.damage`). WILDFIRE's transfer writes beside the :1998 death
     pass; STORM REAPER detonates through the SAME `applyBlast` path.
   - The burn tick beside the slow decay: `src/main.js:1752-1760` (`e.burn`, `e.hp -= e.burnDps*dt`,
     the `burnLethal` corpse stamp). THERMAL SHOCK hooks IGNITE's refresh write, not this tick.
   - The orbit-blade radius/spin reads: `src/weapons.js:58` imports `wideOrbitRadiusMult` /
     `wideOrbitSpinMult` from `src/rewrites.js:426/:429` (`WIDEORBIT_RADIUS_MULT` /
     `WIDEORBIT_SPIN_MULT`). GLACIAL ORBIT extends RIME's chill on the orbit path that flows through
     `weapons.js` `hurt()`.
   - `skillCooldown`: `src/perks.js:149`; the ONE `emptySlotCooldownMult` read at `src/perks.js:158`.
     OUT OF SCOPE for this slice - do not touch.
4. Slice-1 invariants RE-CONFIRMED on this tree: exactly ONE `onWeaponHit` writer
   (`src/rewrites.js:380`); rider call sites are DIRECT-HIT ONLY - `src/main.js:1397` (melee sweep),
   `:1424` (zap fork), `:1491` (scythe-zap lash), `:1697` (volley projectile), `src/weapons.js:248`
   (`hurt()`, covering orbit/boomerang/zap/nova-pulse/scythe/seeker/mine per its :243 comment). NO
   rider call from blasts (`main.js:2309`), the burn tick (`:1758`), thorns (`:1924`), the storm-shards
   chip (`:2374`), or the micro-nova splash (`:1706`). The predicate-offered contract is live
   (`wideorbit` carries `offered: orbitEquipped` at `src/rewrites.js:117`); predicate-false consumes
   no RNG draw.
5. Rider call-site checklist (post-slice-1 `hp -= ` grep, verdicts): enemy-hp direct hits that RIDE:
   `main.js:1393` (rides :1397), `:1422` (rides :1424), `:1489` (rides :1491), `:1696` (rides :1697),
   `weapons.js:246` (rides :248). Enemy-hp NON-direct, NEVER ride: `:1706` (splash), `:1758` (burn),
   `:1924` (thorns), `:1972` (enemy-side sweep), `:2309` (blast), `:2374` (chip). All `p.hp -=` /
   `p2.hp -=` lines are enemy-side damage TO THE PLAYER - never riders. New slice-2 damage (wildfire
   transfer ticks, thermal-shock burst, storm-reaper blast, overload discharge) joins the NEVER-ride
   class per R3.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report.
- **Never weaken or delete an assertion to go green.** Retarget honestly (file + line + why) and
  enumerate EVERY retarget. Widening a cohort until a marginal bar clears is tune-until-pass, FORBIDDEN.
- **A code claim is not evidence.** Every number from a command whose raw output you keep and quote.
- **No emojis** anywhere (owner UI rule). **60Hz AND 120Hz must both be correct** - every timer you add
  is dt-driven; nothing counts frames.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times. Never edit while another
  owner holds it.
- **Scope bound** at the bottom is enforced literally. If you believe a change outside it is required,
  STOP and report.

## MEASURED CURRENT BEHAVIOUR (post-slice-1 tree; the dispatch tick pastes the suite line here)

- SUITE LINE (dispatch tick, 2026-09-15 ~03:05 UTC): `TREE: /home/claude/projects/hordes @ e22c6d1 | dirty=17` / `SUITE greenfiles=88 redfiles=0`.
  Disclosure: the tick's FIRST suite run flaked `test/smoke.mjs` (heat-scaling assertion) under load;
  standalone `node test/smoke.mjs` was green and the immediate suite re-run was the green line above -
  the same load-flake class the slice-1 builder hit and disclosed, not a regression.
- After slice 1 the family is EIGHT cards: three legacy (`pierceall`, `onkillboom` [CHAIN],
  `healthdamage`), five tagged (RIME [FROST], IGNITE [BURN], LIVE WIRE [CONDUCT], AFTERSHOCK [CHAIN],
  WIDE ORBIT [ORBIT]), four finite slots, empty slots paying -5% cooldown each, family share held at
  ~0.06 (8 x 0.0075). The goal wants 12-20; this slice takes the family to FOURTEEN.

## PILOT CALLS (implement these unless the owner says otherwise)

**D1 - THREE SECOND-TAG CARDS (always offered until taken/full).** Same contract as slice 1: once-only,
pure helpers, numbers in `src/config.js` or the rewrites.js constant block (match the family's choice):

1. **GLACIER** (`glacier`, FROST) - direct weapon hits against a slowed enemy deal +20% damage. Reads
   the existing `slow` field only; it does not extend or refresh chill (RIME owns that). Damage bonus
   is applied INSIDE the direct-hit path so it never touches blasts/burn/echoes.
2. **WILDFIRE** (`wildfire`, BURN) - when a BURNING enemy dies, its burn transfers (remaining dps and
   duration, full) to the nearest OTHER live enemy within 100px, once per death, written from the death
   pass beside the blast gate. The transfer is a burn application, NOT a weapon hit: it never advances
   the live-wire counter and never triggers `onWeaponHit` riders. One transfer per death; a transferred
   burn can transfer again only if slice-1's refresh semantics allow (state the call in the report).
3. **OVERLOAD** (`overload`, CONDUCT) - every 20th direct weapon hit discharges a 100px nova zap at 75%
   weapon damage to up to 3 nearest live enemies (75% chosen so the card reads as a tier above LIVE
   WIRE's 5th-hit zap - MEASURE it in D5 and retune if it fails the probe). Its counter is a SEPARATE
   run-player integer from LIVE WIRE's; both advance on the same hit and may fire together. The
   discharge zap is rider-sourced damage: it never re-advances either counter and never triggers
   `onWeaponHit`.

**D2 - THREE CROSS-TAG COMBO CARDS (predicate-offered, BOTH constituents required).** A combo is
offered only while the run OWNS BOTH constituent rewrites (read `state.player.rewrites`), carries BOTH
tags in its `tags` array (first card class to do so - the desc prefix lists both, e.g.
`FROST+BURN - ...`), and is once-only. Combos are the goal's "stacking is legible" payoff:

4. **THERMAL SHOCK** (`thermalshock`, FROST+BURN; needs `rime`+`ignite`) - refreshing burn on a CHILLED
   enemy instantly deals 3x burnDps as a burst. The burst is burn-sourced: no riders, no counter
   advance, never detonates. Written where IGNITE's refresh happens.
5. **STORM REAPER** (`stormreaper`, CONDUCT+CHAIN; needs `livewire`+`onkillboom`) - an enemy KILLED BY
   a live-wire zap detonates a 50% blast through the SAME `applyBlast` path. The blast obeys every
   slice-1 blast rule (never rides, AFTERSHOCK may echo it - state whether it does and why).
6. **GLACIAL ORBIT** (`glacialorbit`, ORBIT+FROST; needs `wideorbit`+`rime`) - ORBIT blade hits chill
   for 2.5s (up from RIME's 1.5s) and deal +10% damage to chilled enemies. Extends RIME's chill write
   on the orbit path only; it does not create a second status system.

**D3 - REWRITE_SLOTS STAYS 4.** Do not raise it. 14 cards in 4 slots is the goal's "every pick excludes
others" at full strength. The empty-slot cooldown incentive is untouched and must still read x0.80 at
zero taken.

**D4 - FAMILY SHARE STILL DOES NOT MOVE.** 14 cards at slice-1's 0.0075 would be 0.105 - forbidden.
Retune: single-tag and legacy cards keep ONE base weight; combo cards carry HALF base weight (they are
strictly stronger and predicate-gated). Solve base weight so the FAMILY TOTAL stays in [0.055, 0.070]
(11 x w + 3 x w/2 = 12.5w; w = 0.005 gives 0.0625 - the recommended start). RE-MEASURE the tuning curve
with the house tooling (`tools/draft_sim.mjs`, 60 runs/cell, seed 4242, the same cells the existing
comment names), quote it verbatim, and update the comment above `REWRITE_CARD_WEIGHT` (new numbers in,
old curve kept as history). If 0.005 breaks an invariant, pick the nearest weight that restores it and
SAY SO.

**D5 - MEASURED CARD QUALITY, PER CARD.** For EACH of the six new cards, the one-bad-pick probe (the
method `test/test_rewrites.mjs` already uses) must read >= 0.8x survival ratio with the bad cohort
still failing 100% without the card. Quote every ratio. Combos are probed with BOTH constituents
granted to the bad cohort, then the combo. A card under 0.8x is retuned by its numbers, never by
weakening the probe.

**D6 - NO SAVE CHANGE, NO RNG DRIFT.** All new state is run-scoped. The draft RNG stream for a seeded
run with no new card offered or taken must be IDENTICAL before/after this slice; combo predicates must
consume no draws when false. Prove with a seeded comparison run and quote it.

## REQUIREMENTS

- **R1 - SECOND-TAG CARDS WORK, BOTH SIDES.** Per card, headless assertions of effect AND absence:
  glacier bonus only while `slow > 0`; wildfire transfers on burning-death and not on clean death, and
  the transferred burn ticks the measured dps; overload fires on the 20th hit and not the 19th, its zap
  hits at most 3 enemies, and the discharge never advances either counter.
- **R2 - COMBOS WORK, BOTH SIDES.** Per combo: effect present with both constituents, ABSENT with only
  one (thermal shock burst only on chilled+burning refresh; storm reaper detonation only on
  live-wire-zap KILLS, not zap hits; glacial orbit's 2.5s chill on orbit hits only, other direct hits
  still chill 1.5s).
- **R3 - NO CHAIN-OF-CHAINS, EXTENDED.** Nothing this slice adds may open a rider path: wildfire
  transfers, thermal shock bursts, storm reaper blasts, and overload discharges each process with ZERO
  `onWeaponHit` side-effects (assert both counters frozen, no new chill/burn from a non-direct source).
- **R4 - PREDICATES + RNG.** Each combo is absent from the offered set unless BOTH constituents are
  owned, present when they are; predicate-false consumes no draw (the D6 seeded proof covers this).
- **R5 - TAGS + DESC.** Combos carry both tags; the draft desc prefix reads `TAG1+TAG2 - `; all six
  descs are one-line trades at draft speed; no emoji.
- **R6 - FAMILY SHARE + PROBES.** The D4 curve and D5 per-card ratios, quoted verbatim from tool output;
  the tuning comment updated.
- **R7 - SLOTS + INCENTIVE UNTOUCHED.** REWRITE_SLOTS still 4; `emptySlotCooldownMult` byte-equivalent
  behaviour (x0.80..x1.00); a full house is still offered zero rewrite cards, now including combos.
- **R8 - REAL-BROWSER EVIDENCE, 390x844 @dpr3.** Extend `tools/verify_g21_rewrite_cards.mjs` (or add
  `tools/verify_g21_combos.mjs` if the slice-1 file's structure fights it - say which): real Chrome,
  390x844 @dpr3, all 19 `TOUR_KEYS`, `state.time > 1.0` asserted BEFORE measuring; grant both
  constituents + a combo, open the draft so the combo RENDERS, assert the two-tag desc is fully inside
  the card bounds at phone size; capture `docs/art/browser-verify-2026-09-12/g21-combo-draft-phone.png`
  (1170x2532) and READ IT BACK.
- **R9 - SUITE.** `bash tools/run_suite.sh` ends `redfiles=0` - quote the verbatim final line; enumerate
  every retarget by file + line + why.

## SCOPE BOUND (literal)

**IN:** `src/rewrites.js` (six cards, predicates, combo logic, the weight retune + comment);
`src/config.js` (new constants ONLY); `src/main.js` (the wildfire transfer in the death pass, the
glacier bonus inside the direct-hit path, the overload discharge, thermal shock at the ignite refresh,
the pool-share retune comment); `src/weapons.js` (glacial orbit / overload touchpoints ONLY);
`test/test_rewrites.mjs` (extensions); ONE verifier (`tools/verify_g21_combos.mjs` NEW or the slice-1
verifier extended); `tools/draft_sim.mjs` ONLY if it hard-codes the family size (enumerate the retarget).

**OUT (do NOT touch):** REWRITE_SLOTS, `emptySlotCooldownMult`, `skillCooldown`, slice-1 card numbers
(except via a D5 probe failure, disclosed), `src/choices.js` / draft layout, `src/save.js`, `index.html`,
any NEW actives, the bestiary, balance of any non-rewrite card. If you believe a change outside this
list is required, STOP and report.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, new tests present.
2. `node test/test_rewrites.mjs` green with R1/R2/R3/R4/R7 assertions printed.
3. The D4 curve + D5 per-card probe ratios, raw tool output quoted; family total inside [0.055, 0.070].
4. The D6 seeded no-drift proof, quoted.
5. The R8 verifier PASS, PNG at 1170x2532 read back.
6. Family count reads 14 (grep the card table); every tag still from `REWRITE_TAGS`.
7. Every retarget enumerated (file + line + why); the explicit statement that no git state command was
   run; anything you could NOT verify, stated.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with raw
output; the per-card and per-combo verdicts; every retarget; the flag list; and the statement that no
git state command was run.
