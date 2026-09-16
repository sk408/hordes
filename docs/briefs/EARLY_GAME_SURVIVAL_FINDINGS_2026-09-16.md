# EARLY-GAME SURVIVAL MECHANIC — FINDINGS (2026-09-16)

Read-only investigation per docs/briefs/EARLY_GAME_SURVIVAL_MECHANIC.md. Hypotheses
formed from the code; every candidate tested by prediction with bounded runs
(<= 60s wall per command; the real-loop harness in tools/real_loop.mjs driving the
REAL src/main.js frame loop). Companion detail doc: INVINCIBILITY_FINDINGS_2026-09-16.md.

## THE MECHANISM (deliverable 1)

**HP restored as fast as it is lost — the lifesteal heal stream has no rate cap and is
multiplied by the compounding damage shop.** The player's HP bar sits at FULL nearly all
run while damage is actually being taken constantly.

- **Where:** the heal is main.js:1859 `p.hp = Math.min(p.stats.maxHp, p.hp + dmg *
  p.stats.lifesteal)` — the ONLY clamp is maxHp; no cap on the lifesteal fraction and none
  on HP/second. The damage it erases flows in through the contact path (main.js:2064-2082)
  and enemy shots (:2100-2112).
- **Why it reads as "no damage":** inbound damage is hard-bounded — a single hit can never
  exceed 0.5 x maxHp (HIT_CAP_FRAC, config.js:69, applied entities.js:94-95) and every hit
  buys 0.5-0.6s of i-frames — while heal/s = lifesteal x outbound DPS scales without bound
  with the same damage stat the player is buying. MEASURED: **the HP bar spent 95.4% of a
  300-second run at full** (4.6% of frames below full) while 13,519 total damage came in
  (45.1 HP/s) and 13,701 was healed (45.7 HP/s). Damage is invisible because it is repaid
  the same instant by the hits that kill the swarm.
- **How acquired, and how early — two free-ish co-factors:**
  1. **Forged Edge, the first shop row** (meta.js:431): +200%/level COMPOUNDING since
     2e30f38 (2026-09-13, owner-directed "make them multiplicative") = 243x weapon damage
     at level 5. Full ladder costs **2,372g ≈ 3 minutes** at the measured fresh rate
     (~51k g/h). Level 2 alone is 390g.
  2. **Lifesteal cards, free, in-run:** Crimson Edge draft card +3%, REPEATABLE
     (config.js:872; weight 0.12, config.js:835) and Vampire's Kiss intermission blessing
     +5%/stack (choices.js:142-148). A blind pick-card-1 policy banked +20.6% lifesteal on
     top of a 0.15 seed inside one 300s run (0.15 -> 0.356). Plus the Vampiric gear affix
     (+2-6%, loot.js:67/:91) and Grave Harvest evolution for later.
  Everything is reachable inside the first hour of a brand-new save.

## THE EVIDENCE (deliverable 2 — raw numbers, 300 sim-second arms, control of same length)

| arm | staged | outcome | dmg taken | healed | HP floor | % frames below full HP | deaths |
|---|---|---|---|---|---|---|---|
| control | fresh, nothing | **DEAD @26s** (wave 1 contact) | 130 | 0 | 0 | 13.4 (of 26s) | 1 |
| organic | FE5 only, NO lifesteal | **DEAD @43s** (wave 1 contact) | 132 | 1.9 | 0 | 13.4 | 1 |
| ls15d2 | FE2 (390g) + 15% ls | DEAD @32s | 382 | 219 | 0 | - | 1 |
| ls15d5 | FE5 + 15% ls (drafts took it to 0.24) | **ALIVE @300s**, 4,019 kills | 23,635 (78.8/s) | 23,792 (79.3/s) | 66/287 | - | 0 |
| ls15d5 (rerun) | FE5 + 15% ls (drafts took it to 0.356) | **ALIVE @300s**, 7,241 kills | 13,519 (45.1/s) | 13,702 (45.7/s) | 57.7/313 | **4.6%** | 0 |
| ls30d5 | FE5 + 30% ls | **ALIVE @300s**, 4,752 kills | 15,067 (50.2/s) | 15,302 (51/s) | 65/365 | - | 0 |

Predictions tested and confirmed: heal/s tracks inbound/s exactly (the maxHp clamp hides
the surplus — equality is itself evidence of over-healing); the HP bar is pinned at full;
zero-to-one potions drunk (lifesteal alone never reaches the 35% auto-drink line,
config.js:323). 600s/900s arms exceeded the 60s wall cap and were dropped per the standing
rule, not extended.

## WHAT I RULED OUT, AND HOW (the rest of the mapped space)

- **Damage gated entirely (p.invuln):** enumerated every writer (:1737 portal, :2068/:2073
  i-frames, :2103/:2107, :3570 Second Wind, :7223/:7242 finale) against both decrements
  (:1699, :7154). Each loop decrements first-frame; mode transitions hand the flag over;
  menus pause it but nothing can hit you there. No stranding path. Not it.
- **A state you can remain in that suppresses damage:** the portal corridor clears all
  enemies/shots at open (main.js:2329-2339) and suppresses spawns (main.js:842), and the
  AUTO pilot always enters (controllers.js:295+). The AUTO-only invuln refresh
  (main.js:1737) is a designed 1-2s approach window, not renewable. Not it.
- **The lethal case prevented (revive):** state.secondWindUsed has ONE reset site
  (main.js:5577, inside startRun); the draft mythic (config.js:878) and the meta
  `laststand` row (meta.js:1028) set the same boolean flag, so stacking grants no second
  revive. No mid-run re-arm path exists. Not it (as a sustained state).
- **Damage reduced to a fraction:** FORTIFY is x0.5 for 3s on a 40-kill/12s-cooldown
  EARTHSHATTER cast (config.js:210-211, skills.js:148) — cannot be held. AEGIS arch
  shields cap at 3 absorbs, refresh-never-stack (arches.js:39, :109-116). Both are
  breathers, not immunity.
- **Damage alone won't do it:** the organic arm (FE5, no lifesteal) DIED @43s — the
  compounding shop by itself is not the report; lifesteal is the necessary co-factor.
- **Today's commits:** ad9cc90 (W7A) changed no src/; 7373953 (G19) added +/-12% family
  terms and small character rows — no immunity source. The engine is the 2026-09-13
  shop-multiplicative commit (2e30f38) sitting on the long-uncapped lifesteal seam.

## VERDICT (deliverable 3)

**The reported "invincible" is lifesteal out-healing a hard-capped inbound stream, reached
in the first hour via Forged Edge 5 (2,372g ≈ 3 minutes of fresh gold) plus repeatable
free lifesteal cards. Confidence: HIGH — reproduced twice at 300s with the HP bar at full
95.4% of frames while absorbing 45-79 HP/s, control and no-lifesteal arms both dead.**

## ALSO FOUND (not the answer, owner should see)

- **The fresh game is currently near-unplayable:** stock runRealCohort('fresh') deaths at
  23s and 9s (contact:CHASER, wave 1); my control 26s; organic-FE5 43s. The previously
  measured 3-6 minute fresh band is gone. The same tree that makes a 2.4k-gold save
  unkillable kills a 0-gold save inside 30 seconds — a cliff, plausibly related to the
  09-13 contact-damage buff (BASE_CONTACT 196 = 14^2, owner enemy buff) and/or recent
  early-wave changes. Deserves its own dispatch.
- Potion supply vs consumption in a swarm (measured 86-102 kills/s peak): 2.6-3.1
  drops/s vs the 0.67/s auto-drink cap — flasks permanently full; moot only because
  lifesteal never lets HP reach the drink line. (G33 adaptive drops is queued on exactly
  this.)

## COULD NOT VERIFY

- Sustainability past 300s under full 30:00 escalation (longer arms exceed the 60s wall
  cap). Arithmetic says the margin widens (inbound scales linearly with maxHp,
  main.js:2618; lifesteal scales with compounding damage), but that is inference.
- Real-browser MANUAL-mode leg: lifesteal applies in the shared weapon-hit path (both
  modes); the harness runs AUTO_ALL. Not expected to differ; not measured.

## FILES TOUCHED / TREE

- docs/briefs/EARLY_GAME_SURVIVAL_FINDINGS_2026-09-16.md (this file) and
  docs/briefs/INVINCIBILITY_FINDINGS_2026-09-16.md (companion). No game code touched, no
  fixes, no git state commands. Dirty count at write time: 2 files (both docs).
