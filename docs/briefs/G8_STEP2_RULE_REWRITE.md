# G8 STEP 2 — RUN-ALTERING ITEMS, RULE-REWRITE SHAPE (the LAST G8 step)

Repo: `/home/claude/projects/hordes` (no build step, plain ES modules, `index.html` + `src/`).
Baseline the pilot verified before handing you this: `bash /tmp/run_all.sh` => **PASS=59 FAIL=0**
(tree uncommitted at `f981f56`; **Remy owns commits — never run git commit/checkout/reset/stash/clean**).
This is the last step of G8; the owner's decision is recorded at the bottom of
`docs/HORDES_GOALS_2026-09-12.md` (option 6, order 1 -> 3 -> 4 -> 2, "do NOT ask again").
Steps 1 (luck touches the draft), 3 (condition-shape rules) and 4 (perks) are DONE. **Step 2 is yours.**

## What already exists (do not rebuild, do not duplicate)

- `src/rules.js` — the CONDITION-shape family: `RULES` = `hordebait`, `once`; `RULE_CARD_WEIGHT = 0.10`;
  readers `hasRule`/`statCardOffered`/`ruleCardOffered`/`ruleCards`; writers `grantRule`/`markStatTaken`.
- `src/perks.js` — the always-on perk family: `regrowth` / `focus` / `thick`; `SKILL_CARD_WEIGHT = 0.04`.
- `src/config.js` `UPGRADES` (~L499-507) — the seven STAT cards (weight 0.3 each).
- `src/skills.js` — player-triggered ACTIVES (FROST_NOVA / OVERCHARGE). Not a card family.
- Draft pool assembly: `openDraft()` in `src/main.js` (~L1845-1910) spreads the stat family, weapon cards
  (weight 1.0), `...ruleCards(state)` and `...skillCards(state)`. `pick(u)` is at ~L1972.
- **Card contract, same for every family:** `{ id, name, desc, weight, apply(player) }`.
- `tools/draft_sim.mjs` — the balance sim: `buildDraftPool`, `cardImpact`, `applyCard`, policy cohorts
  (GREED-DAMAGE / ADVERSARIAL-BAD / SURVIVAL), `--validate` cross-check against the real loop.
- `tools/browser.mjs` — REAL-browser harness (serves the project, drives the cached Chrome over CDP,
  `shot` / `readShot` decode-and-sample the PNG, any viewport). Reuse it; do not write a new one.

## Deliverable A — `src/rewrites.js` (NEW FILE): 3 rule-REWRITE cards

The family is "rewrite how the run PLAYS", one per mechanic, borrowed from G21's rule-card model. Name the
file/family **rewrites** (rules = condition shape, perks = stats, rewrites = mechanic rewrites). Each card
must be a real TRADE the player can read in one line, must be ONCE-ONLY, and must go through the standard
`apply(player)` contract so the draft screen needs no special case.

1. **PIERCE ALL** (`pierceall`) — *every projectile pierces; nothing stops at the first body.*
   Anchor: the NOVA_SHOT evolution already does exactly this — `const volleyPierceAll =
   !!(volleyEvo && volleyEvo.flags.includes('pierceAll'))` then `pr.pierce = PIERCE_ALL` at `src/main.js`
   L396-408. Read the rule at EVERY projectile spawn site that sets pierce (not just the volley one — grep
   `makeProjectile(` and `pr.pierce`), so the rule is weapon-agnostic. Read it at SPAWN, never in the
   update loop: the update loop is duplicated (in-run ~L1258-1282 and finale/boss ~L4360-4375) and a
   spawn-side hook covers both with one line.
2. **CHAIN REACTION** (`onkillboom`) — *every kill detonates; the blast damages nearby enemies.*
   Anchor: the COLOSSUS precedent, `deathShockwave(e)` at `src/main.js` L1497-1512 inside the death pass
   (`if (e.hp <= 0) { ... }` — the same block that does `state.gems.push(makeGem(...))`, `p.kills++` and the
   rampage streak). Reuse that shape (radius + damage + `state.effects.push({ kind: 'rewrite_boom', ... })`).
   Hard rules: (a) a kill must be able to detonate only ONCE — an elite that splits into children must not
   re-enter the boom in the same frame in a way that recurses; (b) NO toast per kill (the event feed is for
   rare moments — the owner's juice rule: shake/slow-mo rare and earned); (c) the boom must not be able to
   kill the player.
3. **BLOOD HARVEST** (`healthdamage`) — *picking up a health potion also damages nearby enemies.*
   Anchor: the ground-drop collect path at `src/main.js` ~L1741-1750 (`p.drops` -> `p.potions[d.kind]++`,
   inventory cap) — that is the PICKUP. Do NOT hook the DRINK path (`drinkPotion` in `src/skills.js`); the
   ask is "health pickups also damage", i.e. the moment you collect it.

Weight: `REWRITE_CARD_WEIGHT = 0.05` per card as the STARTING value (family = 0.15, same order as the
rules family's 0.20 and the perks family's 0.12). **Retune it by measurement, not taste**, and put the
measured curve in the constant's comment — that is how `SKILL_CARD_WEIGHT` got from the sketched 0.10 to
0.04, and `RULE_CARD_WEIGHT` from 0.15 to 0.10.

## Deliverable B — retune `once` (a step-3 finding you are owed)

Tick 7 measured `once` (ONE OF EACH, `src/rules.js`) held from t=0 in the GREED policy at **0.65x**
baseline survival (0.63-0.73 across 4 seeds — stable, not noise), which FAILS the invariant "one bad pick
never loses a run" (bar >= 0.8x). It removes the stat-stacking axis and the pool tilt toward weapons does
not pay for it. **Fix it by making the payout real, not by weakening the bar.** Direction is yours, but the
cheapest honest shape is a payout on the same axis the card taxes: e.g. the weapon tilt actually paying
(a weapon card taken under `once` grants +1 level, or the weapon family's pool weight rises measurably).
Whatever you pick, it must stay ONCE-ONLY, stay in `src/rules.js`, keep the card's one-line desc true, and
keep `test/test_run_rules.mjs` green (retarget an assertion only if the contract genuinely changed —
never delete or no-op one).

## Deliverable C — measure it (`tools/draft_sim.mjs`)

- Mirror all three rewrite cards + the retuned `once` through the sim's seams (`buildDraftPool`,
  `cardImpact`, `applyCard`), held-state aware.
- `cardImpact` must be HONEST: `regrowth`/`thick`/`hordebait` were priced off the sim's real pressure
  model; `focus` was priced at exactly **0** because the sim has no mana layer. Price `pierceall` /
  `onkillboom` / `healthdamage` at 0 with a one-line comment if the sim cannot model them, rather than
  inventing a number. A guessed number is worse than an admitted gap.
- Report a run-level table (60 runs/cell, seed 4242, ON vs OFF families, luck 0 and luck 5) with mean +
  median survival, gold/run, and the good/bad ratio. Last tick's reference: OFF GREED 224s / ADVERSARIAL-BAD
  129s / SURVIVAL 137s at luck 0; ON with the perk+rules families those were 222s / 126s / 139s.

## Deliverable D — tests

- **`test/test_rewrites.mjs` (NEW, >= 12 checks)** including REAL seams, not just helper math: the real
  kill funnel for `onkillboom`, the real drop-collect path for `healthdamage`, the real `openDraft()` (via
  the headless DOM harness with a seeded rng, as `test/test_perks.mjs` does) for pool membership,
  once-only, and the weight constant; dt-correctness for anything time-scaled (60Hz == 120Hz == 0.7*t).
- **Extend** `test/test_draft_luck.mjs`'s pool-shape pins to the rewrite family (imported constants).
- Invariants, each asserted and never weakened: a bad draft can still fail (100%); good beats bad on
  >= 3/5 minute-10 metrics; one bad pick never loses a run (>= 0.8x baseline) for every new card AND for a
  retuned `once`; with NO family cards held, the stat cards are exactly 0.3 and weapon cards exactly 1.0
  (bit-identical to the shipped pool plus the families' own extra weight).

## Deliverable E — phone browser evidence

`tools/verify_g8_rewrites.mjs` (NEW), reusing `tools/browser.mjs`: 390x844 viewport, dpr 3, a rewrite card
reaching the REAL draft pool, 3 cards rendered inside the viewport with no clipped description, PNG saved
under `docs/art/browser-verify-2026-09-12/`. Read the PNG programmatically with `readShot` and say plainly
that this is pixel/DOM evidence, not a vision read (there is no vision model on this host).

## Constraints (non-negotiable, from `docs/BUILD_PLAN.md`)

No emojis. Integer pixels, no smoothing, no blur. 60Hz AND 120Hz both correct — nothing may assume a fixed
dt. Rules live on the RUN player (`state.player.*`), never in the save schema (a fresh `makePlayer()` = a
fresh run; no migration, no persistence). No `git` state commands. Update the player-facing reference
surfaces if a card changes what the hints panel / HOW TO PLAY claims (build-plan item 8). If a concept is
not what the owner pictured, it must be one file plus one pool line to change.

## When you are done

1. Run `bash /tmp/run_all.sh` yourself — it must end **FAIL=0** with no weakened assertion.
2. Append a **TICK NOTE 9** to `docs/HORDES_GOALS_2026-09-12.md`: goal worked, what landed with file:line
   anchors, the measured before/after numbers (offer rates + the run-level table), the invariants that held,
   and an honest "could not verify" list. Then flip the G8 status line: if step 2 lands, G8 is DONE and the
   note must say so with the same evidence discipline the file already uses.
3. `~/projects/agent-hub/sdk/ahub checkpoint "<what landed>" --channel hub` (the `hordes` channel refuses
   this token's writes; use `hub`).
4. Release the lock: `~/projects/agent-hub/sdk/agentlock release`. It MUST be released even on failure —
   the next tick cannot start otherwise. Re-acquire it if another builder stole it mid-run.
