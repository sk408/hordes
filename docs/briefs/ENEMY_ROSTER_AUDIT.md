# ENEMY ROSTER + WAVE SCALING AUDIT (read-only, 2026-09-17)

Task msg_01M2QWHZD2X34XH4FS0GYQKXD4. Everything below is read from the game's
own tables (sources cited as file:line); nothing was built, tuned or touched.
Computed curves come from the game's own pure helpers (`ladderHp/ladderDmg/
ladderXp/ladderGroups/midBossHp`, src/config.js) evaluated in node — no sim
was run.

Timeline vocabulary (the two "waves" are different clocks — keep them apart):
- **escalation tick** `w = floor(t/30)` — 30s clock; gates the spawn table and
  the stat ladders (main.js:811 pickSpawnType, main.js:845 escalate).
- **wave number** `state.wave.num` — the 120s ladder (ESCALATION.WAVE_LENGTH);
  gates E2's horde re-stamp (main.js:824, :960, :977), the boss rotation and
  the finale (ESCALATION.END_WAVE 5).

---

## 1. WHAT IS NEW, PER WAVE (the owner question first)

"Are we introducing much stronger enemies at every other wave?" — **No for
stats, yes for three specific discontinuities** (bottom of this section).
The stat ladder climbs every 30s tick smoothly; what jumps is below.

| Wave (120s) | Clock | NEW bodies / events (first appearance) | Source |
|---|---|---|---|
| 1 | 0:00 | CHASER only | SPAWNER pool, config.js:719 |
| 1 | 0:30 | SWARMER (packs of 5) | SWARMER_WAVE 1, config.js:728 |
| 1 | 1:00 | BRUTE, DASHER, TICK (latches of 3) — **and VYRN THE HERALD + its PILLAR ring** (mid-wave, every wave) | *_WAVE 2 config.js:729-733; MIDBOSS.AT_FRACTION 0.5 config.js:793 |
| 1 | 1:30 | SPITTER, WARLOCK | *_WAVE 3, config.js:730-731 |
| 1 | 2:00 | End-cast: **GRAVELMAW** (single) | bosses.js:357; pickBossForWave bosses.js:637 |
| 2 | 2:00-4:00 | **THE HORDE (E2)**: chaff packs x3, SHRIKE debut, all heavies re-stamped to mid-boss hp, plain-chaff xp x0.25 / drops x0.05 (income moves to heavy corpses). Spawn interval hits its 0.25s floor at 2:17 | E2 config.js:747-755; stampHeavy main.js:881; interval main.js:919 |
| 2 | 2:30 | COLOSSUS (rare, 0.35 weight) | COLOSSUS_WAVE 5, config.js:734 |
| 2 | 4:00 | End-cast: **CHOIR MOTHER** | rotation, bosses.js:637 |
| 3 | 4:00-6:00 | **DOUBLE-BOSS EVENT** (GRAVELMAW + CHOIR MOTHER). No new chassis — the 4:00 ladder knee lands here (see §3) | DOUBLE_EVERY 3, config.js:846 |
| 4 | 6:00-8:00 | **PYRAXIS debut** (rotation reaches it). No new chassis | bosses.js:637 |
| 5 | 8:00-10:00 | GRAVELMAW again. Boss death -> portal -> **THE MAW OF THE HORDE** finale (2.5M display hp, 48-shot ring barrage, three-hit rule) | END_WAVE 5 config.js:781; final_boss.js:33/:54 |
| 6+ | 10:00+ | (only if END_WAVE moves later — LADDER.WAVES 15 supports 30:00): rotating double-boss pairs every 3rd wave, elite chance ramps 0.05 -> 0.12, ELITE SURGE every 3rd wave past the milestone | config.js:886-900; ladderBeats config.js:1106 |

**Roster novelty ends at 2:30.** Every chassis a default run can field is on
the field by 2:30 of a ~10-12 minute run; from there to the maw the only new
things are boss rotation entries and the finale. That 8-minute tail is the
largest thin-variety range in the game (§5).

**The three real discontinuities** (everything else is smooth per-tick):
1. **2:00 — the horde re-stamp**: chaff density x3, heavies -> mid-boss hp
   (midBossHp(waveNum-1), main.js:883), chaff xp x0.25. Body count and body
   quality both jump in the same second.
2. **4:00 — the ladder knee** (LADDER.KNEE_TICK 8): hp goes 17.96x -> 27.24x
   in ONE tick (+52%), the steepest single step of the run; from here it is
   +23.9%/wave compound (1.055^4).
3. **every 3rd wave — the double boss**: two full bosses at once is a step
   change in fight length, not a stat change.

Between-wave hp jumps (ladderHp at each wave's first tick vs the previous
wave's first tick): w1->w2 **+24%**, w2->w3 **+52%** (the knee), then
**+24%/wave** flat (w3->w4->w5->w6: 27.2->33.7->41.8->51.8). So the honest
answer to "every other wave much stronger?" is: *wave 2 and wave 3 each land a
bigger jump than any later wave, and after wave 3 the per-wave step is a
constant +24%* — perceived "every other wave" spikes are most likely the
double-boss cadence (every 3rd) riding a steady slope.

---

## 2. THE ROSTER

Base chassis hp = `ENEMY.BASE_HP (144) x hpScale x ladderHp(w)` (144 = 12
squared, the owner buff; makeTypedEnemy enemy_types.js:502 then escalate
main.js:845). Contact damage = `SURVIVAL.BASE_CONTACT (196) x ladderDmg(w)^0.65
x contactDamageMult`, single hit capped at 50% max HP (config.js:62-70).
Speeds below are multipliers on `BASE_SPEED 56 x (1+0.05w)`.

### Field roster (10 chassis)
| Name / id | file:line | hp x | speed x | damage | behaviour (decide) | weight | first seen | DEMANDS |
|---|---|---|---|---|---|---|---|---|
| Chaser | enemy_types.js:37 | 1.0 | 1.0 | contact 1.0 | chase (chaseDecide :344) | 3.0 | 0:00 | DPS |
| Swarmer | enemy_types.js:47 | 0.4 | 1.7 | contact 0.7 | chase, pack 5 | 2.0 | 0:30 | SWEEP (AoE) |
| Brute | enemy_types.js:58 | 3.5 | 0.6 | contact 2.5 | chase | 1.5 | 1:00 | BURST |
| Dasher | enemy_types.js:88 | 1.3 | 0.5 stalk / 2.6 lunge (1.6s/0.8s) | contact 1.5 | stalk->lunge cycle (dasherDecide :371) | 1.2 | 1:00 | SPACING |
| Tick | enemy_types.js:127 | 0.3 | 1.8 | no contact; 4 hp/s drain on latch | attach+drain (tickDecide :413), latch packs of 3 | 1.5 | 1:00 | REMOVAL |
| Spitter | enemy_types.js:70 | 1.0 | 0.9 | contact 1.0; bolt 10 @105px/s, 1.15s | hold 120px, kite+shoot (spitterDecide :349) | 1.5 | 1:30 | DODGING |
| Warlock | enemy_types.js:107 | 1.6 | 0.8 | contact 1.0; bolt 17 @75px/s after 1s telegraph | reposition->telegraph->bolt cycle (warlockDecide :380) | 1.2 | 1:30 | PRIORITY (focus fire) |
| Colossus | enemy_types.js:141 | 14.0 | 0.45 | contact 3.0; death shockwave (friendly-fire AoE, 25 + 25% own maxHp) | chase | 0.35 | 2:30 | COMMITMENT |
| Pillar | enemy_types.js:159 | 5.0 | 0 (stationary) | chip 5 @105px/s, 1.8s | turret (pillarDecide :429) — herald rings only, never the spawn pool | — | 1:00 (with herald) | REPOSITIONING |
| Shrike | enemy_types.js:182 | 2.0 | 1.2 (0.9 cruise / 3.0 dive, 2.2s/0.7s) | contact 1.5 | cruise->dive cycle, FLYING: drawn z, immune to ground AoE + frost slow, direct hits only (shrikeDecide :448; flyingGuard main.js:897) | 0.8 (E2.SHRIKE_WEIGHT, halves with heavies) | 2:00 | DIRECT FIRE |

From wave 2 the horde re-stamp applies (main.js:960/:977): chaff (CHASER/
SWARMER) packs x3, xp x0.25, drops x0.05; heavies (BRUTE/DASHER/TICK/SHRIKE)
re-stamped to `midBossHp(waveNum-1)` and pay 3 base kills of xp; heavy pool
weights x0.5.

### Elites and modifiers (a second roster axis)
- **Elite template** (enemy_types.js:238): any chassis, hp x4, size x1.5,
  xp x3, guaranteed chest. Spawn chance: 0 before t=60s, flat 0.05 from 1:00
  to 10:00, then ramps to 0.12 by 30:00 (config.js:897-898).
- **Elite mods** (elite_mods.js:33-58, rolled on 50% of elites, gated by shop
  unlocks): SWIFT +70% speed/-20% hp; SPLITTING dies into 2 copies @30% hp;
  VAMPIRIC heals half its contact damage (bounded at 10% own maxHp/s).

### Bosses (rotation, bosses.js:637 — one per wave, two distinct every 3rd)
| Name | file:line | hp x (over the BOSS base) | speed | pattern | DEMANDS |
|---|---|---|---|---|---|
| GRAVELMAW THE CHARGER | bosses.js:357 | 1.6 | chassis: BRUTE 0.6 x 0.95 x 3.35 = **128 px/s stalk at 2:00** (see §6 flag), charge x2.5 = 321 | stalk -> 0.5s telegraph -> homing charge (1.5 blend/s) -> 0.8s recover | TIMING (dodge the charge, punish the recover) |
| THE CHOIR MOTHER | bosses.js:382 | 1.0 | 0.8 chassis, drifts at 0.45 | slow drift; summons 3-4 swarmers/8s; below half hp adds a 5-shot fan/2.6s | ADD-CONTROL |
| PYRAXIS | bosses.js:396 | 0.9 | 0.9 chassis | hold 170px -> 1.2s charge-up -> 10-shot ring nova/3.5s; blinks 100px when crowded (2.2s cd) | POSITIONING |
| VYRN, THE HERALD (mid-wave, every wave) | bosses.js:423 | midBossHp (config.js:1061) | CHASER 1.0 x 1.8 = **101-141 px/s, 1.7-2.4x player speed** | relentless pursuit (eases to 0.3x inside 55px); replants a 6-PILLAR ring/24s; 3-shot rifle burst/2.4s | KITING + multitask |
| THE MAW OF THE HORDE (finale) | final_boss.js:54 | 2.5M display hp (absolute) | 400 x 0.35 = 140 px/s | drift; 48-projectile 360° barrage/cycle; **three-hit rule** — any third hit is exactly ceil(maxHp/3); hp-floored unless BEATABLE | SURVIVAL (dodge-focused) |

Boss hp formula (main.js:1418): `144 x ladderHp(w) x (500 + 60 x waveNum) x
bossMult x heat` -> wave-1 GRAVELMAW ≈ 594k; wave-2 ≈ 3.89M; wave-3 doubles ≈
5.29M each; wave-5 ≈ 9.54M.

---

## 3. WAVE-BY-WAVE DIFFICULTY (from the game's own tables)

| wave | ticks | hp ladder (start->end) | dmg ladder | xp ladder | groups/tick | spawn interval | end-boss hp (GRAV 1.6x) | herald hp |
|---|---|---|---|---|---|---|---|---|
| 1 | 0-3 | 1.00 -> 3.70 | 1.00 -> 2.20 | 1.00 -> 2.80 | 1 -> 3 | 1.35 -> 0.39s | 593,510 | 12,499 |
| 2 | 4-7 | 4.60 -> 17.96 | 2.60 -> 4.37 | 3.40 -> 10.16 | 3 -> 5 | 0.25s (floor from 2:17) | 3,890,658 | 75,583 |
| 3 | 8-11 | 27.24 -> 31.98 | 5.55 -> 5.72 | 14.16 -> 15.47 | 5 | 0.25s | 5,286,280 (x2 bosses) | 257,554 |
| 4 | 12-15 | 33.74 -> 39.62 | 5.78 -> 5.96 | 15.94 -> 17.42 | 5 -> 6 | 0.25s | 7,126,607 | 394,774 |
| 5 | 16-19 | 41.80 -> 49.08 | 6.01 -> 6.20 | 17.94 -> 19.60 | 6 | 0.25s | 9,544,450 -> MAW | 582,848 |

Sources: ESCALATION config.js:771-848, LADDER config.js:886-900, ladder
helpers config.js:1030-1095, spawn seam main.js:911-999, spawn interval
main.js:919 (1.35 - t*0.008, floor 0.25), groups ladderGroups config.js:1077.
Contact damage is sublinear in the dmg column (`^0.65`) and single hits are
capped at half max HP (config.js:64-70), so the felt damage curve is
1.00 -> ~3.4x by 10:00, not 6.2x.

The xp column answers income pacing: kill-value climbs x2.8 in wave 1, then
x3.6 more across wave 2 (the chaff x0.25 re-stamp moves that income onto
heavies), then +24%/wave.

---

## 4. DISTINCT vs DUPLICATE

**10 field chassis, 7 decision functions** — the duplication groups:

| group | members | shared brain | real difference inside the group |
|---|---|---|---|
| Pure chasers | CHASER, SWARMER, BRUTE, COLOSSUS | chaseDecide (enemy_types.js:344) | stat vector only (speed/hp/contact/xp/size) + colossus death-shockwave |
| Kiting shooters | SPITTER, WARLOCK | hold-retreat-shoot, same decide shape (:349/:380) | params (range/hold/cadence) + warlock's 1s telegraph and heavier bolt |
| Two-phase bursters | DASHER, SHRIKE | slow phase -> committed burst phase (:371/:448) | dasher ground/lunge; shrike flying, AoE-immune, alternating-side cruise |
| Latchers | TICK | tickDecide :413 | unique |
| Turrets | PILLAR | pillarDecide :429 | unique (herald-only) |

So the honest count: **5 distinct behaviour archetypes on the field**
(chase / ranged-kite / cycle-burst / latch / stationary), plus 4 boss brains
(charge / summon+fan / nova+teleport / pursuit+ring) and the maw's barrage.
Diversity is carried by the bosses; the field itself is one archetype deep
from 0:00-1:00 (see §5).

Genuinely distinct axes that exist and are healthy: flight+AoE-immunity
(SHRIKE), latch-drain (TICK), telegraphed heavy ranged (WARLOCK), stationary
area denial (PILLAR), death-shockwave (COLOSSUS), homing charge with a punish
window (GRAVELMAW).

---

## 5. THIN-VARIETY RANGES

1. **0:00-1:00 — one brain.** CHASER + SWARMER only, both chaseDecide. The
   first full minute teaches nothing but "walk and shoot".
2. **2:30 -> end of run (~8 min) — zero roster novelty.** All 10 chassis are
   live by 2:30; from there the only new content is boss rotation order, the
   every-3rd-wave double, and the maw. Pressure grows (stats/density/elite
   chance) but *variety* is static across 80% of a run.
3. **Elite variety is gated behind the shop.** SWIFT/SPLITTING/VAMPIRIC exist
   but only ride elites (5% of spawns, 50% mod roll, unlock-gated) — a
   non-shopper never sees a mod.
4. **Stage pools trim, never add** (stages.js:42-161): every non-default arena
   *removes* chassis. No stage introduces a body the default pool lacks — so
   arena choice can currently only narrow the 10, not extend them.

---

## 6. FLAGS FOUND WHILE AUDITING (read-only — not changed)

- **Stale speed comments after BASE_SPEED 28 -> 34 -> 56**: bosses.js:361-363
  claims GRAVELMAW's stalk walks "~67px/s, ABOVE the pilot's 60" and
  config.js:800-801 claims the HERALD sits at "~= 1.12x player speed". Both
  were computed at BASE_SPEED 34. At today's 56 the chains give **GRAVELMAW
  stalk 128 px/s (2.1x player) / charge 321 px/s** and **HERALD 101-141 px/s
  (1.7-2.4x player)** — main.js:1425 / main.js:1512. If the comments' intent
  (walk slightly above player speed) is still the design, the *constants* are
  now wrong, not the comments. Owner call; nothing touched.
- The first-minute roster (§5.1) is the cheapest place any future variety
  work can land — every chassis past SWARMER debuts inside 60s already.

---

## 7. RECOMMENDATIONS (max 3, behaviour archetypes — NOT built)

1. **Early swarm-shaper (effort M).** A chaff-side support body from 0:30
   (herds/urges nearby chaff, visibly buffs them) — turns minute one from
   one brain into two, gives AoE builds a priority target and single-target
   builds a reason to reposition. New decide fn + one pool row; the stat
   table shape already supports it.
2. **Ground-denial creeper (effort S-M).** A slow body that leaves a
   short-lived damaging trail/zone. The field has burst, chip, latch and
   turret pressure but no persistent ground hazard (PILLAR chips from range;
   nothing owns the floor). Reuses existing damage plumbing (dmgScale +
   hit-cap), teaches movement without a new damage type.
3. **Let one late chassis carry elite mods off the elite roll (effort S).**
   e.g. past wave 4, SWARMER packs occasionally spawn SWIFT/SPLITTING-stamped.
   Multiplies perceived variety in the 8-minute static tail (§5.2) with zero
   new brains — the mod code and visuals already exist (elite_mods.js).

No arena changes proposed or made; stages.js is out of scope per the task.
