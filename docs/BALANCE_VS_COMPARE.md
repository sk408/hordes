# BALANCE_VS_COMPARE — Vampire Survivors 1.16.107 vs HORDES (diagnostic lens, not a copy list)

VS source: in-tree spec at `docs/vs_ref/spec/` + raw datapack at `docs/vs_ref/datapack/`
(CHARACTER_DATA, WEAPON_DATA, ENEMY_DATA, POWERUP_DATA, ITEM_DATA, STAGE_DATA).
HORDES source: `src/` on this branch. Every hordes number cites `file:line`
(current tree); every VS number cites its `vs_ref/` path. No VS value is a
recommendation — VS is the lens, hordes-side evidence is the verdict
(owner doctrine, see `docs/DEV_EDITOR_PLAN.md:114-130`).

Protected intents consulted first (`docs/DEV_EDITOR_PLAN.md:64-81,138-143`):
ONE OF EACH four-front protection, 6s idle auto-pick deliberate
(`src/config.js:520`), buy-back dev-only, graphs exogenous, investment
accounting classification (`src/dev_telemetry.js:10-50`). Items touching them
are flagged, not recommended, in `docs/BALANCE_PLAN.md`.

Hordes doctrine referenced: `docs/PACING.md:9-16` (standing rule),
`docs/PACING.md:158-245` (four invariants), `docs/PACING.md:248-266` (guards G1-G8).

## 0. One-line structural summary

| # | Category | VS answer | HORDES answer | Minute-10 divergence |
|---|---|---|---|---|
| 1 | Weapons | 8 sparse-delta levels + chest evolution spike | 8 uniform %-ladder levels + token evolution mult | VS minute 10 = spike-chasing; hordes minute 10 = smooth compounding |
| 2 | Enemies | Flat base HP, spawn-rate ramps per minute | Compounding HP/DMG/XP curves + boss wall | VS minute 10 = more bodies; hordes minute 10 = bigger numbers + boss check |
| 3 | Characters | 70 chars, tiny % mods, gold 0-7777 | 4 chars, flat/single-axis mods, gold 0-9000 | Same price band, narrower identity spread |
| 4 | XP/level | Quadratic `k*L^2`, 3-step k | Geometric `30*1.28^(L-1)` | VS drafts decelerate smoothly; hordes drafts thin exponentially |
| 5 | Shop/meta | 29 ranks, flat base prices, additive % | 48-row catalogue, geometric growth 1.4-2.9, mixed additive/multiplicative | VS meta = capped side-grades; hordes meta = the main progression |
| 6 | Draft pool | ~398 cards, rarity-weighted, 3 offers | ~7 stat + weapon + chase cards, weight-1 weapons, 3 offers | VS pick = build direction; hordes pick = ladder step + rule cards |

## 1. Weapons — base power, per-level growth, cost-vs-power, upgrade paths

### What VS does

- 153 keys (40 `isEvolution:true`); base typically 8 records, evolutions 1 record
  (`docs/vs_ref/spec/SPEC-weapons.md:5-7`).
- Record 0 = base; records 1..N = sparse deltas applied on level-up
  (`docs/vs_ref/spec/SPEC-drafts.md:17-19`).
- Base examples (`docs/vs_ref/spec/SPEC-weapons.md:13-22`):
  WHIP p1.0/amt1/1350ms, MAGIC_MISSILE p1.0/amt1/1200ms, KNIFE p0.65/amt1/1000ms,
  AXE p2.0/amt1/4000ms, CROSS p0.5/amt1/2000ms, FIREBALL p2.0/amt3/3000ms.
- Per-level growth is multi-axis: WHIP L2 +1 amount then +0.5 power/L;
  KNIFE +amount at L2/L3/L4/L6/L7, +pierce L5/L8, -repeatInterval L4/L6/L8;
  GARLIC -100ms interval at L3/L5/L7 (`docs/vs_ref/spec/SPEC-weapons.md:23-30`
  table rows; deltas `docs/vs_ref/spec/SPEC-drafts.md:21-25`).
- Rarity = offer weight: base 100/80/70/60/50, evolutions 1
  (`docs/vs_ref/spec/SPEC-weapons.md:11-14`,
  `docs/vs_ref/spec/SPEC-drafts.md:13`).
- Cost-vs-power: weapons are NOT meta-bought; `price` (WHIP 100, evo 3600,
  HEAVENSWORD 5040) is in-run/merchant value
  (`docs/vs_ref/spec/SPEC-weapons.md:13-22`). Power is earned in-run.
- Evolution: base `evoSynergy` + `evoInto`; evo `requires`/`isEvolution:true`
  (`docs/vs_ref/spec/SPEC-weapons.md:13-16`). Spike examples: WHIP 1.0 to
  VAMPIRICA 4.0/amt2; KNIFE 0.65 to THOUSAND 1.65/amt6/350ms; CROSS 0.5 to
  HEAVENSWORD 7.7 (`docs/vs_ref/spec/SPEC-weapons.md:13-22`). Granted via
  chest `prizeTypes ["EVOLUTION",...]` (`docs/vs_ref/spec/SPEC-stages.md:85`).

### What hordes does

- 9 archetypes (VOLLEY base + 8 unlockables), `WEAPON_MAX_LEVEL = 8`
  (`src/weapons.js:867`).
- Base table `WEAPONS` (`src/weapons.js:67-181`): ORBIT 0.8x/0.5s tick,
  BOOMERANG 1.0x/1.6s, ZAP 1.0x/1.4s/COUNT 3/CHAIN_RANGE 90/FALLOFF 0.75/MANA 4
  (`src/weapons.js:111-136`), NOVA_PULSE 1.4x/3.0s/R70 (`src/weapons.js:138-143`),
  SCYTHE 1.4x/1.3s (`src/weapons.js:145-152`), SEEKER 1.2x/1.8s
  (`src/weapons.js:153-162`), MINE 1.4x/1.5s (`src/weapons.js:163-172`),
  BEAM 2.0x/4.0s (`src/weapons.js:173-180`). Run base DAMAGE 24, COOLDOWN 0.55
  (`src/config.js:100-109`).
- Per-level growth is single-axis uniform: `WEAPON_STEPS`
  (`src/weapons.js:908-918`) VOLLEY 0.6, ORBIT 0.20, BOOMERANG 0.2, ZAP 0.17,
  NOVA 0.15, SCYTHE 0.18, SEEKER turn-only, MINE 0.2, BEAM 0.15; cumulative via
  `buildLevels` (`src/weapons.js:881-890`). ZAP count growth RETIRED to shop
  (`src/weapons.js:106-110`).
- Cost-vs-power: archetypes ARE meta-bought: `WEAPON_PRICES`
  (`src/meta.js:449-458`) ORBIT 200, ZAP 60000, NOVA_PULSE 12000, SCYTHE 20000,
  SEEKER 280000, MINE 420000, BEAM 450000.
- Evolution: `EVOLUTION_TOKEN_COST = 1` (`src/evolutions.js:43`), requires max
  level (`src/evolutions.js:137`); evo affixes are flat mults (VOLLEY dmg 2,
  ORBIT 1.8, ZAP 1.6, BEAM 2.0) (`src/evolutions.js:46-109`). Token drop
  1/1200 kill, 1/200 chest (`src/chests.js:79-83`).

### Structural differences (pacing-relevant)

- VS levels change BEHAVIOR (amount/pierce/interval); hordes levels change a
  NUMBER (+15-20% dmg). A VS pick can double clear; a hordes pick compounds.
- VS power spike is the evolution chest moment; hordes spike is the shop
  purchase + token spend. VS minute 10 = "did the evo land"; hordes minute 10
  = "which ladder rung fired".
- Hordes ZAP count moved OUT of the weapon ladder into the `zapchain` shop row
  (`src/meta.js:727-729`, `src/weapons.js:106-110`) — no VS analogue; VS count
  grows in-weapon.

## 2. Enemies — HP/damage scaling, per-kill XP pacing vs player level curve

### What VS does

- 579 keys; `xp` = XP/kill, `power` = contact, `maxHp` = base
  (`docs/vs_ref/spec/SPEC.md:83-90` per subagent extraction; raw
  `docs/vs_ref/datapack/ENEMY_DATA.txt`).
- Trash: BAT1 hp0.1/pow5/xp1, ZOMBIE 1/10/1, SKELETON 1.5/10/2, MUDMAN1 7/10/2.5,
  WEREWOLF 18/14/2; mid XL 27-90hp/xp2.5-3; elites/bosses xp25-60
  (`docs/vs_ref/spec/SPEC-enemies.md:13-90`).
- NO minute HP table in data: scaling = stage `EnemyHealthMultiplier`
  (1.0-1.5) + hyper/inverse mults + `TimeMods hpPerMinute 0.05`
  (`docs/vs_ref/spec/SPEC-stages.md:63-65`). Difficulty is spawn-RATE
  (`minimum/frequency/enemies/bosses` per minute,
  `docs/vs_ref/spec/SPEC-stages.md:84-114`).
- Per-kill XP 1-3 trash, 25-60 bosses, x `XPBonus` x char growth x GROWTH
  (`docs/vs_ref/spec/SPEC-xp.md:135-139`).

### What hordes does

- Base: `BASE_HP 144`, `BASE_XP 5`, `SPAWN_INTERVAL 1.35`, `BASE_SPEED 56`
  (`src/config.js:132-143`); contact `BASE_CONTACT 196 ^ CONTACT_POW 0.65`
  (`src/config.js:62-69`), single-hit cap 0.5 maxHP (`src/config.js:69`).
- Type mults (`src/enemy_types.js:37-97`): CHASER 1.0/1.0, SWARMER 0.4/0.5,
  BRUTE 3.5/3.0, SPITTER 1.0/2.0, DASHER 1.3/1.5; ELITE_TEMPLATE hp 4.0/xp 3.0
  (`src/enemy_types.js:238-243`).
- Escalation per wave (`src/config.js:1092-1098`): HP linear 0.9 + 1.35^compound
  from wave 4; XP 0.6 + 1.25^; DMG 0.4 + 1.15^ from wave 6; WAVE_LENGTH 120s,
  END_WAVE 5 (`src/config.js:1099-1103`).
- Late ladder (`src/config.js:1207-1213`): KNEE_TICK 8, HP_LATE 1.055,
  DMG_LATE 1.010, XP_LATE 1.030.
- Boss wall: MIDBOSS 17+14/wave (`src/config.js:1118-1119`),
  BOSS 500+60/wave (`src/config.js:1152-1153`), NOVA 18, CHESTS 2
  (`src/config.js:1160-1166`). Design: boss claims 5-8/10 runs per wave
  (`src/config.js:1147-1151`).

### Structural differences (pacing-relevant)

- VS scales QUANTITY over time (flat bodies, more spawns); hordes scales
  QUALITY over waves (compounding HP/DMG) PLUS quantity (GROUPS/ELITE_MAX,
  `src/config.js:1214-1220`).
- Hordes minute-10 feel is a gear check (boss 500+60/wave x compounding base);
  VS minute-10 feel is a density check. Hordes' own PACING re-measure shows the
  consequence: sub-cliff builds die in ~9-21s and earn the award floor
  (`docs/PACING.md:68-90`).
- Per-kill XP in VS is flat (1-3) while requirement climbs quadratically; in
  hordes both sides compound (XP_LATE 1.030 vs requirement 1.28^) — see §4.

## 3. Characters — stat modifiers, unlock curves

### What VS does

- 70 chars; neutral base maxHp 100, all mults 1, amount/magnet/revivals 0
  (`docs/vs_ref/spec/SPEC-characters.md:109-127`).
- Mods are small % or flats: ANTONIO hp120 +0.1 power per 10 levels (max +50%),
  GENNARO amount+1, PORTA area1.3/cooldown, DOMMARIO duration1.4/moveSpeed0.6,
  CRISTINA power0.65/cooldown0.75, PUGNALA +0.01 power/level
  (`docs/vs_ref/spec/SPEC-characters.md:86-178,368-1398`).
- Prices 0-7777 (ANTONIO 0, IMELDA 10, PASQUALINA 100, most 500, chase 1000-5000,
  secrets 666/777/7777) (`docs/vs_ref/spec/SPEC-characters.md:13-41`); unlock via
  gold OR achievement/secret (`docs/vs_ref/spec/SPEC-unlocks.md:104-114`).

### What hordes does

- 4 chars (`src/meta.js:1536-1573`): KNIGHT cost 0 mods{maxHp 30}
  (`src/meta.js:1537-1543`), WITCH 9000 {maxHp -25, maxMana 50, manaCostMult 0.5}
  (`src/meta.js:1544-1558`), ROGUE 2500 {speedMult 1.2} (`src/meta.js:1559-1565`),
  PALADIN 6000 {healOnChest 15, maxHp 15} (`src/meta.js:1566-1572`).
- Per-character upgrades `CHARACTER_UPGRADES` (`src/meta.js:1382-1407`):
  knight_vigor 1200/1.5/4/12, knight_force 1600/1.5/3/0.06, witch_wellspring
  1000/1.5/4/15, witch_focus 1800/1.5/3/0.06, rogue_fleet 1400/1.5/3/6,
  rogue_satchel 900/1.5/3/1, paladin_bulwark 1100/1.5/4/10, paladin_blessing
  1500/1.5/3/3.

### Structural differences (pacing-relevant)

- Same price band (0-9k vs 0-7.7k) but VS spreads identity over 70 kits with
  run-scaling records (power/level); hordes has 4 kits with flat stat deltas.
  VS character choice = run arc; hordes character choice = starting loadout +
  small upgrade tail.
- Hordes WITCH bundles mana kit + starting ZAP (a 60000g weapon,
  `src/meta.js:451`) into 9000g — kit-value concentration with no VS analogue
  (VS starters are showcase lists, `docs/vs_ref/spec/SPEC-characters.md:127`).

## 4. XP/level curve — functional shape

### What VS does

- `XpRequiredToLevelUp = min(5.0+1.5*floor(L/20), 8.0) * L^2`
  (`docs/vs_ref/spec/SPEC-xp.md:10`); mult 5.0 L1-19, 6.5 L20-39, 8.0 L40+
  (`docs/vs_ref/spec/SPEC-xp.md:24`); L1 5, L10 500, L20 2600, L40 12800,
  L100 80000 (`docs/vs_ref/spec/SPEC-xp.md:28-131`).
- Shape: pure quadratic with TWO kinks (x1.3 at 20, x1.23 at 40). Draft rate
  falls as 1/L^2 — smooth, kinked twice, never exponential.

### What hordes does

- `XP_LEVEL_BASE 30` (`src/config.js:148`), `XP_LEVEL_GROWTH 1.28`
  (`src/config.js:154`); `p.xpNext = floor(p.xpNext * 1.28)` per level
  (`src/main.js:4082-4084`); init `xpNext: C.XP_LEVEL_BASE`
  (`src/entities.js:12`).
- Shape: geometric — L2 30, L5 ~63, L10 ~267, L20 ~3155, L40 ~3.7M (computed
  from the two constants; requirement ratio L40/L20 ~1180x vs VS ~5x).
- History: 1.35 -> 1.28 because drafts collapsed mid-run (divergence x1.11);
  1.28 keeps divergence x1.4+ (`src/config.js:149-154`).

### Structural differences (pacing-relevant)

- VS: requirement ratio L40/L20 = 12800/2600 = 4.9x. Hordes: ~1180x. The
  hordes curve outruns its own XP income (XP_LATE 1.030,
  `src/config.js:1213`) exponentially — late drafts must thin to zero unless
  kill-rate grows faster than 1.28^L. This is hordes' own stated tension
  (drafts are "the game's only real decision layer",
  `src/config.js:149-154`).
- Minute-10 divergence: VS still drafts briskly at L40+ (800-xp gems vs 12800
  requirement); hordes at L40 needs millions of XP per draft while enemies pay
  `BASE_XP 5` x compounding mults — draft cadence is the pacing cliff.

## 5. Shop/meta-shop — cost curves, rank limits, what power is buyable

### What VS does

- 29 powerups, additive effects, rank caps 1-5 (SEALs 10)
  (`docs/vs_ref/spec/SPEC-shop-items.md:11-41`): POWER 200/5/+5%,
  ARMOR 600/3/+1, MAXHEALTH 200/3/+10%, COOLDOWN 900/2/-2.5%, AMOUNT 5000/1/+1,
  GROWTH 900/5/+3%, GREED 200/5/+10%, CURSE 1666/5/+10%, REVIVAL 10000/1,
  REROLL 500/5, SKIP/BANISH 100/5. Per-rank markup is native-code GAP.
- Buyable power is CAPPED side-grades (max +25% might, +5% cooldown, +1 amount);
  the run, not the shop, is the power source.

### What hordes does

- 48-row catalogue, `round(baseCost * costGrowth^currentLevel)` + per-level
  overrides (`src/meta.js:693` cost fn; overrides e.g. dmg
  `src/meta.js:531-533`, hp `src/meta.js:534-536`).
- Cheap combat lines (`src/meta.js:531-598`): dmg 150/1.6/5/perLevel 2.0
  (3x/level multiplicative), hp 120/1.4/5/60, focus 200/1.6/5/50, xp 180/1.6/5,
  crit 300/1.7/5, greed 350/1.4/5 — vs VS same-name rows at 200-900 base.
- Mid/top rungs: luck 14000/2/5 (`src/meta.js:603-604`), fleetfoot 65000/2/5
  (`src/meta.js:621-623`), briarmail 13300 through laststand 4320000
  (`src/meta.js:625-667`); split 400/1.35/10, slots 3000/2.9/3
  (`src/meta.js:692-697`); zapchain 200000/1.7/5 (`src/meta.js:727-729`).
- Buyable power is UNCAPPPED-scale main progression: dmg 3^5 = 243x at L5
  (`src/meta.js:523-526`), headsman +33%/level, hairtrigger +18%/level.
- Run income: AWARD 70 (`src/meta.js:185`), FIRST_CLEAR 250 (`src/meta.js:172`),
  NIGHT_PENALTY_PCT 50 (`src/meta.js:206`); per-kill GOLD_TIER
  (`src/meta.js:373-381`) CHAFF 0 / GRUNT 1 / MID 3 / HEAVY 8 / ELITE 15 /
  MID_BOSS 60 / BOSS 150.

### Structural differences (pacing-relevant)

- VS meta-shop is bounded (+25% might max); hordes meta-shop is unbounded
  (243x dmg). Hordes minute-10 power comes mostly from BEFORE the run.
- Cost shape: VS flat base price per rank (markup unknown); hordes geometric
  1.4-2.9 with shaped overrides. Hordes' own ledger shows the seam pain:
  end-game rungs vaporize (<1 run) while tier-2 faces 3000-run dead tails
  (`docs/PACING.md:188-244`).

## 6. Draft/level-up pool — size, rarity/offer weights, what a pick is worth

### What VS does

- Pool = non-maxed/non-banished weapons + passives; 369 weapon cards + 29
  passive lines; weight = `rarity`; evo rarity 1 (not normal cards)
  (`docs/vs_ref/spec/SPEC-drafts.md:12-14`).
- Offers `_levelUpOptions = 3` (`docs/vs_ref/spec/SPEC-drafts.md:9`), possible
  4th card stat-gated (`docs/vs_ref/spec/SPEC-drafts.md:10`),
  `ChanceForExistingPowerUp` 0.3 (`docs/vs_ref/spec/SPEC-drafts.md:11`),
  `synergyBoost = 2` (`docs/vs_ref/spec/SPEC-drafts.md:13`, dump.cs 1096901).
- `poolLimit` caps copies (Whip 30, Knife 70, Cross 100)
  (`docs/vs_ref/spec/SPEC-weapons.md:11-22`).
- Pick value: new weapon = L1 base; upgrade = next sparse delta; passive =
  rank effect. Post-max LIMITBREAK 90 keys (power+0.05 w10 etc)
  (`docs/vs_ref/spec/SPEC-drafts.md:692-717`).
- Player agency: bought reroll/skip/banish charges (10 max each)
  (`docs/vs_ref/spec/SPEC-shop-items.md:32-34`).

### What hordes does

- Pool (`src/main.js:4230-4290`): owned-weapon level cards weight 1
  (`src/main.js:4248-4249`); 7 stat cards at `DRAFT_STAT_WEIGHT 0.3`
  (`src/meta.js:1160`, applied `src/main.js:4257-4258`); RARE/MYTHIC ladder,
  rule cards at `RULE_CARD_WEIGHT 0.10` (`src/rules.js:60`), skill 0.04,
  rewrite 0.005, frost 0.04; offers `3 + draftOffers` (`src/main.js:4300`),
  weighted without replacement (`src/main.js:4301-4307`).
- Luck shifts draft via `DRAFT_LUCK_TRANSFER 0.05` (`src/meta.js:1158`) and
  `LUCK_TAPER` (`src/meta.js:1108`); base rarity
  `98/1.7/0.2/0.02` (`src/meta.js:1100`).
- ONE OF EACH (`src/rules.js:41-45`): taken stats leave pool, weapon picks +1
  bonus level, at-cap converts to +10% damage (`src/main.js:4236-4246`).
  Intermission blessings: 14-card pool, COMMON 60/RARE 25/EPIC 12 + epic ramp
  (`src/choices.js:44-48`).
- Auto-pick: `DRAFT_TIMEOUT 6.0s` (`src/config.js:520`); night auto-advance 3.0s
  (`src/config.js:528-529`). No reroll/skip/banish economy exists in `src/`
  (`src/dev_telemetry.js:46-50`).
- Pick value: weapon ladder step (+15-20% dmg, `src/weapons.js:908-918`) or stat
  card (`src/config.js:1252-1260`: dmg x1.25, rate x0.85, multi +1, hp +25...).

### Structural differences (pacing-relevant)

- VS pool is ~400 cards deep with rarity spread 1-100; hordes pool is ~15-25
  cards with weights 0.005-1.0. VS variance comes from WHAT is offered;
  hordes variance comes from WHICH ladder rung fires.
- VS sells agency (reroll/skip/banish); hordes has no draft agency economy —
  the 6s auto-pick IS the agency floor (deliberate, protected).
- ONE OF EACH has no VS analogue (closest is Banish, player-controlled and
  reversible; `docs/vs_ref/spec/SPEC-shop-items.md:34`): it structurally tilts
  the pool toward weapons as stats exhaust (`src/rules.js:15-26`).

## GAPS / ASSUMPTIONS

1. VS per-rank price markup is native-code (GAP per spec); cost-curve
   comparison uses base prices only.
2. VS `GetLevelUpOptions` 4th-card stat and `ChanceForExistingPowerUp` stat are
   unresolved (`docs/vs_ref/spec/SPEC-drafts.md:10-11`); no comparison drawn.
3. VS `CalculateWeightsWithExclusions` exact arithmetic is GAP
   (`docs/vs_ref/spec/SPEC-drafts.md:13`); compared only at weight-source level.
4. VS pre/post-increment `L` in XP formula unresolved
   (`docs/vs_ref/spec/SPEC-xp.md:28`); table assumes threshold at current L.
5. Hordes catalogue totals cited from `docs/PACING.md` (98.5M maxed,
   6.83M half) predate current-tree prices (e.g. ZAP 60000 vs PACING-era
   600000); income tiers likewise. Comparison uses CURRENT `src/` values; stale
   PACING figures are marked where referenced.
6. Hordes mid-build (length, gold) curve between the 21s/85g pole and the
   1800s/754689g pole is unmeasured — bot cannot survive it
   (`docs/PACING.md:84-90`). Minute-10 claims for mid builds are floors.
7. Drop-rate comparison (VS pickup table vs hordes loot.js/chests.js) surveyed,
   not tabulated: VS pickups `docs/vs_ref/spec/SPEC-shop-items.md:1204-1224`,
   hordes `src/loot.js:42-44`, `src/chests.js:28-58`, `src/config.js:577-581`.
