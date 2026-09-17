# CONDENSE PROPOSAL — 2026-09-17

Source: docs/feedback/2026-09-17-player-review.md (verbatim player review). Owner direction: "sit down
and think about what you want. Condense, keep the good stuff, drop complexity." This document proposes;
the owner accepts or rejects line by line. Nothing here is implemented. Every number below is read from
the game's own code/data (file:line cited); no measurement needed a sim longer than the 60-second cap —
the run-income bands are the game's own recorded bands (src/meta.js:235-245), not new simulations.

## 1. TARGET EXPERIENCE

A player opens HORDES for a 5–15 minute run, watches a build come online mid-run (new weapon, first
elite kill, lightning zapping a chaser wall), and banks visible progress toward ONE next thing. They
come back because the next thing is close enough to taste tonight — and, if they choose to leave it
running, the game plays itself honestly and pays reduced rates for it.

## 2. KEEP (the review's own evidence)

- K1. The moment-to-moment combat — review: "core gameplay is actually pretty good, much better than
  the ratings suggest." (main.js/render.js core loop.)
- K2. The animations and on-screen spectacle — review: "the animations are cool and I love seeing
  lightning zap all those chasers :)" (ZAP weapon, render.js effects).
- K3. The 9-weapon ladder as a concept — distinct archetypes (ORBIT..BEAM, meta.js:373-383); the review
  never complains about the weapons themselves, only the pricing (see §4).
- K4. The draft/intermission rhythm — one decision between waves; the review's complaints are about
  pacing around it, not it.
- K5. Help mode + the manual (4-page HOW TO PLAY, main.js:4050-4125) — recently shipped, pointing the
  right way; potions section extends it (review item 3, in the mechanical bundle).
- K6. The escape minigame as an idea — review: "a nice idea"; keep the mode, fix the length and payout
  (in the mechanical bundle; the proposal-level call is only whether it stays a run staple).
- K7. HEAT dial — a self-paced risk/reward control the player chooses (+30% gold/push, cap 20,
  heat.js:22-42); this is what the special-run modifiers should have been (see C4).
- K8. Adaptive difficulty touches (potion drop throttling above 20 kills/s, config.js:266-283) —
  invisible when right; keep the behaviour, explain none of it.

## 3. CUT / FOLD (each line is one accept/reject decision)

- C1. ARENAS 8 → 3. Cost today: 8 near-identical choices (stages.js:33-167 — same map size, differences
  are pool weights + stat mods + one hazard; "barely noticeable" per the review). Loss: almost nothing —
  the strongest three mods (BLOOD RUST elite pressure, VOID REACH damage, WHITEOUT everything) cover the
  felt range. Recommend: CUT to 3, delete the rest from stages.js.
- C2. CHARACTERS 4 → 3 or fold. Cost today: 4 characters that converge ("every character type becomes
  the same" — review); all share MANA.MAX 100 / REGEN 0.5 (config.js:166-169); Witch is the only one
  that touches resources. Loss: KNIGHT/ROGUE/PALADIN identities are stat-sticks players can't feel.
  Recommend: KEEP but fold into resource differentiation (§5) — cutting playable characters angers
  more than it condenses; making them differ in KIND is the real fix.
- C3. SHOP 46 ROWS → ~20. Cost today: 36 stat rows + 7 weapon rows + 3 elite unlocks + writ
  (meta.js:423-580). Loss: late-tier verticality; keep it by making the kept rows deeper (more tiers),
  not wider. Recommend: FOLD — merge duplicate-feeling rows (Vitality/Grand Elixir family, the three
  mana rows), keep one row per concept.
- C4. CHALLENGE RUNS (3 modes) → fold into HEAT. Cost today: STANDARD / ONE_WEAPON / NO_POTIONS with
  NO reward by design — challenges.js:8-9 settles gold "EXACTLY like a standard run"; the review:
  "special runs don't clearly explain what you GET." Loss: none — there is nothing to get today.
  Recommend: CUT the no-reward dial; if a restricted run returns, it returns as a HEAT-style contract
  with the multiplier ON the card (the mechanical bundle makes the current three state their terms
  meanwhile).
- C5. SETTINGS surface ~12-15 cards → ~8. Cost today: MUSIC, SFX, TEXT HUD, ZOOM(6 stops),
  RESOLUTION(4 stops), PILOT(3), HOW TO PLAY, REPLAY TOUR, EXPORT, IMPORT, RECOVERY(+PREVIOUS), RESET,
  END RUN, escape TEST, BACK (main.js:5736-5866) — "WAAY too many settings" per the review. Loss:
  little; ZOOM+RESOLUTION collapse into one "DISPLAY" choice for most players. Recommend: KEEP the
  top-level cards, FOLD ZOOM/RESOLUTION/TEXT-HUD behind one ADVANCED card.
- C6. ELITE UNLOCK ROWS (3, meta.js:392-405, 1M/1.8M/2.8M) → fold into the weapon they modify.
  Recommend: FOLD (an elite modifier is a property of its weapon, not a shop aisle).

## 4. PROGRESSION CURVE

Invariant to hold: "a good run is worth about one next-step upgrade at every stage of the game."
CURRENT numbers (all code-cited, no long sims):

- Early: runs 1-5 pay ~70g (meta.js:235-245 band), cheapest upgrades 120-200g → ~2 runs per upgrade.
  About right.
- Fourth-weapon era: NOVA_PULSE 1,200,000 / SCYTHE 2,000,000 (meta.js:373-383) against mid-band income
  (~200g at runs 21-45; ~754,689g only for a maxed 1800s run) — a non-maxed "good" run nears a
  QUARTER of one weapon purchase. This is exactly the review's "a good run nets you only 1/4th of a
  single upgrade."
- Late: top rows 4.0-4.5M (meta.js:423-580) vs maxed-run 754,689g → 5-6 maxed runs per row.

Gap: the ladder is near-linear in price (200 → 4.5M is x22,500) while income is flat then cliffed.
Proposed adjustment (one decision): compress the weapon ladder to ~x400 total (200 → ~80k for BEAM) and
the top stat rows to ~x100 of their base, keeping "one good run ≈ one next step" at each band — OR
raise band income (settleRunGold AWARD 70, main.js:3639-3661, and per-kill tiers, meta.js:297-305) to
match the current prices. Cutting prices touches one file; raising income rebalances every band — the
first is lower-risk.

## 5. RESOURCE DIFFERENTIATION (trade-offs, not one answer)

Review evidence: "Mana regen is overpowered, so you never need the cap" (REGEN 0.5/s vs costs tuned
around it, config.js:166-169) and "health drops (and regains) so rapidly that only your max matters."

- R1. MANA — option A: regen pauses while a skill is on cooldown's fresh cast (cap becomes the burst
  budget); option B: regen scales with wave time alive, not real time; option C: cut base regen ~60%
  and let Witch's 0.5x cost be the identity. A is the smallest change that makes MAX_CARRIED mana
  potions matter.
- R2. HEALTH — option A: slow the swings (damage smoothing over 1s) so healing choices exist; option
  B: potions become the ONLY in-combat heal and boss-curse (main.js:6661) becomes the visible rule;
  option C: overkill damage carries, making max HP a real stat rather than a buffer.
- R3. CHARACTER KINDS — Knight: damage-soak economy (block meter refilled by hits taken); Rogue: tempo
  economy (speed feeds skill cooldown); Witch: spend economy (deep mana, paper HP). One line each;
  effort in §8. These are alternatives — the owner picks a direction, not all three.

## 6. AUTO / IDLE SUPPORT — TWO DIRECTIONS, OWNER'S CALL (not decided; both under evaluation)

Review evidence: "The fact that runs don't auto-restart (nor waves) means I can't actually let the game idle
for hours and expect to come up with at least one or two upgrades the following night."

ONE ACCEPTANCE TEST FOR BOTH DIRECTIONS (from the review, verbatim): unattended overnight play is worth
about ONE OR TWO UPGRADES. Against the game's own bands (meta.js:235-245; cheap upgrades 120-200g,
§4): one night = ~8h = ~60-100 short runs at today's ~2-5 min/run manual cadence — so whichever direction
ships must deliver ~120-400g of bankable progress per night at the EARLY band (1-2 cheapest upgrades) and
the equivalent fraction of a next-step upgrade at every later band. Numbers per direction below.

### DIRECTION A — IDLE CURRENCY (in flight separately)
A currency that accrues while the game is closed/idle and converts to shop gold. Numbers to state at
delivery: accrual rate per hour, cap (if any), and the resulting upgrades-per-night at each income band.
Not specced here — see its own task thread.

### DIRECTION B — OPT-IN FULL AUTO ("NIGHT MODE", spec)
- B1. Toggle, OFF by default, title-screen only.
- B2. Waves auto-advance: intermission CONTINUE fires 8s after the draft is resolved (the only ladder
  step today is manual CONTINUE, main.js:2315/6811).
- B3. Intermissions auto-pick: policy FIXED as "highest-tier offer, first slot on tie" (no heuristic
  knob — one policy, documented).
- B4. Runs auto-restart with the same build and arena (today: death screen is manual RETRY/EXIT,
  main.js:3751).
- B5. Escape minigame: auto-SKIP in Night Mode (no payout, same as manual skip today).
- B6. What the player gives up (pick one): (a) gold at 50% of normal, records kept; (b) full gold,
  runs flagged ASSISTED and excluded from best-run records; (c) both. Recommend (b) — the review wants
  overnight income, punishing it by half defeats the point, and record integrity survives a flag.
- B7. Upgrades-per-night estimate (B6b, full gold): an auto run dies earlier than a piloted one —
  assume half the survival of an average run. Early band: ~30-50 auto runs/night x ~70g = 2,100-3,500g
  = 10-20 cheap upgrades (OVER-delivers vs the review's "one or two" — a reason to consider (a) or a
  tighter cap); mid band (runs 21-45, ~200g/run): ~6,000-10,000g = several mid upgrades. The exact
  number needs one overnight soak, outside the 60-second sim cap — report after build, not promised here.

## 7. WHAT AM I WORKING TOWARDS (candidates — pick one, maybe two)

- G1. ARSENAL FINISH LINE: own all 9 weapons + the folded elite mods; a visible "9/9" collection
  screen. Effort M; works with the §4 price compression; the closest-term goal.
- G2. PRESTIGE: banked gold converts to permanent paragon stats on reset; the long grind becomes the
  goal. Effort L; risks re-adding the complexity the review complains about.
- G3. WEEKLY SEEDED RUN: one fixed-seed, fixed-build run everyone shares, leaderboard local. Effort M;
  answers "what am I working towards" socially rather than numerically.
Recommend G1 now (it is mostly presentation over existing data) and revisit G3 after condense lands.

## 8. EFFORT AND RISK

- C1 arenas: S. Risk: saved profiles referencing cut stages — migrate to default on load.
- C3 shop fold: M. Risk: save-schema coupling in the 46-row registry; needs a migration.
- C4 challenge fold: S. Risk: none (no reward state exists to lose).
- C5 settings fold: S. Risk: tests pinning settings card order.
- C6 elite fold: S-M. Risk: elite unlock state in saves.
- §4 price compression: M. Risk: mid-game saves suddenly rich (a one-time wealth rescale or accept it).
- R1-R3 resource work: M each, L if all three. Risk: rebalancing every band; do after the curve fix.
- A1-A6 Night Mode: M. Risk: unattended sessions must not wedge (needs a soak test); record flagging
  must not leak into normal runs.
- G1 collection screen: S-M. Risk: none beyond UI.
