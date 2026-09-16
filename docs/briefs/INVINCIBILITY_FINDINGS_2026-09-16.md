# G32 INVINCIBILITY INVESTIGATION — FINDINGS (2026-09-16)

FIND-IT ONLY; no game code was changed. Live directive: orchestrator steer #3
(msg_01M2NG6T7KBN876M1RVP9D65SB, healing outpacing = ARM 1; stranded-invuln +
revive-re-arm = ARM 2). Supersedes steers #1/#2 (cancelled).

## VERDICT

**The mechanism is LIFESTEAL HEAL THROUGHPUT with NO RATE CAP, multiplied by the
compounding damage shop (Forged Edge, 243x at L5). Reproduced, bounded: a save with
Forged Edge 5 (2,372g — about 3 minutes of measured fresh gold income) plus lifesteal
cards accumulated by BLIND drafting took 78.8 HP/s and healed 79.3 HP/s for 300 straight
seconds, HP floor 66 of 287, zero potions, zero deaths, while the un-staged control died
at 26s. Confidence: HIGH — it is measured, not argued.** The owner's three questions all
resolve to "yes, and here is the number": lifesteal cards are repeatable and stack without
a fraction cap (Q1), the lifesteal heal path is the ONE major heal with no HP/s cap
(Q2), and potion supply exceeds the consumption cap ~4.6x in a dense swarm (Q3, moot in
practice because lifesteal alone keeps HP above the auto-drink line).

ARM 2 (stranded invuln flag / revive re-arm) came up CLEAN — no stranding path exists;
details below. Portal invuln (lead 1) is a designed ~1-2s window, AUTO-only, with no
spawns while the portal is open — closed as non-viable per owner steer.

## THE ARITHMETIC (why it is structurally unkillable)

- Inbound damage is HARD-BOUNDED: any single hit <= 0.5 x maxHp (HIT_CAP_FRAC,
  config.js:69, applied entities.js:94-95) and every unabsorbed hit buys 0.6s of
  i-frames (main.js:2073/:2107), so max inbound ~= 0.83 x maxHp/s (239 HP/s at the
  repro's 287 maxHp; observed 78.8 HP/s).
- Lifesteal healing is UNBOUNDED in rate: main.js:1859
  `p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal)` — the only clamp is
  maxHp. No cap on the fraction, none on HP/s. Heal/s = lifesteal x outbound DPS, and
  outbound DPS compounds with the shop: Forged Edge L5 = 243x (meta.js:431, compounding
  since 2e30f38 2026-09-13, owner-directed "make them multiplicative").
- So the heal ceiling scales with the SAME axis (damage investment) that the player is
  already buying, while the damage ceiling is pinned to maxHp. Once lifesteal x DPS >
  0.83 x maxHp, death is arithmetically impossible. The repro sat at exactly this
  equilibrium (79.3 heal/s vs 78.8 inbound/s, floor 66 = one capped hit from the floor
  that was instantly refilled).

## Q1 — DO WE OFFER TOO MANY LIFESTEAL CARDS? (yes; quantified)

Four independent sources, three of them early:
1. **Crimson Edge, RARE draft card, +3%, REPEATABLE** (config.js:872). Pool weight
   RARE_WEIGHT 0.12 vs common stat 0.3 / weapon 1 (config.js:835). MEASURED: the blind
   card-1 draft policy banked 3 of them in a 300s run (lifesteal 0.15 -> 0.24 with no
   steering). The "ONE OF EACH" ledger does not stop repeats of this card in the live
   build.
2. **Vampire's Kiss, intermission cascade blessing, +5% per stack** (choices.js:142-148),
   stacks across waves. Carries its own brake — potions heal /1+0.5s — but that brake is
   irrelevant when lifesteal makes potions unnecessary.
3. **Vampiric gear affix, +2% base x rarity scale (up to +6%)** (loot.js:67, :91) — 1 of
   10 affixes, drops from elites/bosses (main.js:2220/:2249), so it scales with drop
   volume/luck but is NOT the dominant early source.
4. **Blood Pact meta row, +2%/level at 143,000g base** (meta.js:521-522) — NOT
   early-reachable at ~51k g/h fresh; excluded from the minimal combo.
Plus SCYTHE's Grave Harvest evolution (evolutions.js:81-87) heals 2 HP per soul per kill
(weapons.js:543) once the weapon line is evolved.

Max lifesteal fraction observed in 2 hours: **0.24 with zero steering** (repro), 0.33 in
the 30%-staged arm. There is no cap on the fraction anywhere.

## Q2 — IS IT CAPPED? (every heal source, file:line)

| Heal source | Cap | Site |
|---|---|---|
| Lifesteal | **NONE** (only maxHp clamp) | main.js:1859 |
| Potions | 35 HP (+Alchemy 50%/L; halved vs bosses; Vampire's Kiss divides) | config.js:246, skills.js:258 |
| Auto-drink | 1 per 1.5s per kind -> ~23.3 HP/s ceiling | config.js:321-325 |
| Regrowth perk | flat 0.7 HP/s | perks.js:66, applied main.js:1791 |
| Level-up heal | 1.5% of base maxHp per level | main.js:2618-2620 |
| Consecration altar | **capped 9 HP/tick = 18 HP/s** ("cannot out-heal a boss") | config.js:236-237 |
| Iron Heart cards | one-shot 25% maxHp | config.js:865 |
| Chest heal | +3/level paladin row only | meta.js applyCharacterUpgrades |

The asymmetry is real: the altar — a much weaker healer — is rate-capped with an explicit
anti-boss comment, while lifesteal, the strongest healer, has no rate cap at all. Max
early HP/s: measured 79.3 HP/s (lifesteal alone, FE5+0.24) vs max inbound 239 HP/s
(0.83 x 287) — and heal/s keeps scaling with damage purchases while inbound does not.

## Q3 — TOO MANY POTIONS AT HIGH KILLS/S? (supply >> consumption; moot under lifesteal)

- MEASURED kill rate in a wave-2 swarm: **102.4 kills/s** (peak 10s sample, ls30d5 arm;
  13.4/s run average including draft/intermission pauses).
- Supply: 102.4 x DROP_CHANCE 0.03 (config.js:248) = **3.07 drops/s = 184/min**.
- Consumption cap: MAX_CARRIED 3, auto-drink 1/1.5s = 0.67/s -> **supply exceeds
  consumption ~4.6x**; the flask is permanently full in a dense swarm. Sustained potion
  ceiling 23.3 HP/s (11.7 vs bosses).
- In the winning repro arms **zero potions were drunk** — lifesteal alone never let HP
  fall below the 35% auto-drink line (config.js:323). Potions are a redundant second
  layer behind an already-sufficient heal stream.

## EMPIRICAL REPRO (bounded, <= 60s wall per command, tools/real_loop harness)

Driver: /tmp/invuln_arm.mjs (NOT in the repo) — boots the REAL loop via
real_loop.mjs bootReal() with a staged fresh profile; per-frame HP ledger; the stock
overlay auto-play policy (draft card 1 unless NEW WEAPON, intermission CONTINUE, q/e vs
bosses). 300 sim-second cap per arm.

| arm | staged | outcome | dmg taken | healed | HP floor | potions | deaths |
|---|---|---|---|---|---|---|---|
| control | fresh, nothing | **DEAD @26s** (wave 1, contact) | 130 | 0 | 0 | 0 | 1 |
| ls15d2 | FE2 (390g) + 15% ls | DEAD @32s (wave 1) | 382.1 | 218.6 | -33.6 | 1 | 1 |
| ls15d5 | FE5 (2,372g) + 15% ls (drafted to 0.24) | **ALIVE @300s**, wave 2, level 30, 4,019 kills | 23,635 (78.8/s) | 23,792 (79.3/s) | **66** of 287 | 0 | 0 |
| ls30d5 | FE5 + 30% ls (drafted to 0.33) | **ALIVE @300s**, level 33, 4,752 kills | 15,067 (50.2/s) | 15,302 (51/s) | 65 of 365 | 0 | 0 |

600s/900s arms exceeded the 60s wall cap and were dropped per the standing rule; 300s
with an exactly-balanced 79-vs-79 HP/s ledger and a never-cracking floor is the bounded
proof. Stock-harness cross-check (runRealCohort('fresh', 2)): 23s and 9s deaths — the
control result is not a driver artifact.

Cost/time: FE5 total 2,372g (150+240+384+614+983, meta.js:431-432) = **~3 minutes at the
measured fresh 51k g/h**. Crimson Edge cards are free (drafted). Vampire's Kiss stacks
are free (intermission picks). The full "invincible" stack is reachable inside the first
hour of a brand-new save.

## ARM 2 — stranded-invuln flag & revive re-arm (CLEAN)

- p.invuln decrements: main.js:1699 (update(), first statement after the run-limit check,
  no early return before it) and main.js:7154 (updateFinale(), same position). Grants in
  the play loop (:2068/:2073/:2103/:2107, portal :1737) are decremented by :1699 in the
  same mode; grants in the finale loop (:7223/:7242) by :7154. Mode transitions hand the
  flag to the other loop, which decrements it first frame. Menus pause the decrement but
  no damage can be taken there; stale i-frames are bounded by the last grant (<= 2s).
  **No stranding path.**
- Second Wind revive: ONE spend flag state.secondWindUsed (main.js:356/:3568), reset at
  exactly one site, :5577 inside startRun. No wave/intermission/evolve/draft/escape/
  reload path re-arms it mid-run. The draft mythic (config.js:878) and the meta
  `laststand` row (meta.js:1028) set the same p.stats.secondWind flag — stacking them
  does NOT grant two revives; the flag is boolean and the spend is single. **No infinite
  revive.**

## ALSO CHECKED (brief's lead list)

- Portal invuln (main.js:1731-1737): AUTO-only per-frame refresh, but the portal corridor
  clears all enemies/shots at open (main.js:2329-2339) and suppresses spawns while open
  (main.js:842); the AUTO pilot always enters (controllers.js:295+, P1b fixed rim-pin).
  A designed 1-2s breather per boss, not a renewable. Owner's doubt confirmed.
- Arch/AEGIS shields: 3 absorbs max, same-type refresh never stacks, only SHIELD carries
  shieldHits (arches.js:39, :109-116); 1-2 arches/wave, 1 of 5 types (~20% SHIELD).
  Renewable but tiny — a 0.5s i-frame per absorb, not a heal stream.
- FORTIFY: 3s at x0.5, only on EARTHSHATTER cast (config.js:210-211, skills.js:148),
  40-kill charge + 12s cooldown — cannot be held permanently.
- Hit cap (config.js:69 / entities.js:85-96): confirmed live; it is what BOUNDS inbound
  and thus what makes the uncapped heal stream decisive.
- Today's commits: ad9cc90 (W7A) touched NO src/ (tools/tests only); 7373953 (G19) added
  the +/-12% specialty terms and small per-character rows (no immunity); 5902f55/650eb55
  (tutorial/persistence) add no survivability. **The exploit's engine is 2e30f38
  (2026-09-13, Forged Edge compounding) sitting on the long-uncapped lifesteal seam —
  not a commit from today.** What is new is the PLAYER: 3 days after the shop became
  multiplicative, someone banked their first ~2.4k gold.

## SIDE FINDING (not the dispatch, but the owner should see it)

The stock fresh cohort now dies at **9-26 seconds on wave 1** (contact:CHASER,
runRealCohort fresh x2: 23s, 9s) — the previously measured 3-6 minute fresh band is gone.
The same tree that makes a 2.4k-gold save unkillable makes a 0-gold save unplayable. That
cliff (FE5-or-die inside minute one) is plausibly what the invincibility report is riding
on the far side of, and may deserve its own dispatch.

## COULD NOT VERIFY

- >300s sustainability of the ls15d5 equilibrium under full 30:00 escalation (600s/900s
  arms exceed the 60s wall cap; dropped, not extended). The arithmetic says inbound
  scales with maxHp (linear, main.js:2618) while lifesteal scales with damage output
  (compounding), so the margin should WIDEN, but that is inference, not measurement.
- Lifesteal fraction absolute maximum across a full lucky run (gear affix volume depends
  on elite/boss drop RNG; not staged).
- Browser-leg of the portal check (open portal, decline, take a hit): skipped — static
  analysis shows no spawns while the portal is open, so there is nothing to be hit by;
  the owner's steer already deprecated this lead.

## FILES TOUCHED / TREE STATE

- docs/briefs/INVINCIBILITY_FINDINGS_2026-09-16.md (this file) — the only repo write.
- /tmp/invuln_arm.mjs, /tmp/invuln_check.mjs — throwaway drivers, outside the repo.
- No game code, tests, or tools changed. No git state commands. Dirty count at write
  time: 1 file (this doc).
