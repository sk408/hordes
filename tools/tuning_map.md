# HORDES tuning inventory

Foundation doc for the dev-editor slices. Every tunable lives in a game
module; the editor only ever writes through `tools/editor_server.py`, whose
whitelist is the file set in section 7. Conventions: `file:line` is the
literal home of the number; the in-code identifier follows it. Line numbers
are for tree @ `tools/dev-editor` slice 1 and will drift — the identifier is
the stable key.

Reading guide: section 1 (shop) and section 2 (weapons) are exhaustive —
every price, level cap and per-weapon number is listed. Sections 3-6 survey
the remaining systems (exact homes, representative identifiers, not every
comment line).

## 1. Shop prices and levels — EXHAUSTIVE (src/meta.js)

Cost authority: `upgradeCost(def, currentLevel)` (src/meta.js:693) =
`round(baseCost * costGrowth^currentLevel)`. Catalogue total:
`catalogCost(rowIds)` (src/meta.js:858). Lookup: `SHOP_BY_ID` (:678).

Row shape: `{ id, name, desc, baseCost, costGrowth, maxLevel, perLevel }`,
plus `{ kind: 'weapon', weaponId }` / `{ kind: 'elite', eliteId }` for
single-purchase unlock rows. `perLevel` feeds stats via `applyMetaBonuses`.

### 1a. Stat / slot rows (SHOP_UPGRADES, src/meta.js:499)

| id | baseCost | costGrowth | maxLevel | perLevel | src line |
|----|----------|------------|----------|----------|----------|
| dmg | 150 | 1.6 | 5 | 2.0 | :509-510 |
| hp | 120 | 1.6 | 5 | 40 | :511-512 |
| potions | 250 | 1.5 | 3 | 2 | :513-514 |
| regen | 200 | 1.6 | 4 | 1 | :515-516 |
| focus | 200 | 1.6 | 5 | 50 | :533-534 |
| thrifty | 350 | 1.7 | 4 | 0.20 | :541-542 |
| well | 250 | 1.6 | 4 | 50 | :543-544 |
| siphon | 500 | 1.7 | 4 | 0.10 | :545-546 |
| xp | 180 | 1.6 | 5 | 0.20 | :547-548 |
| crit | 300 | 1.7 | 5 | 0.06 | :550-551 |
| critdmg | 260 | 1.7 | 5 | 0.50 | :552-553 |
| greed | 350 | 1.7 | 5 | 0.20 | :554-555 |
| alchemy | 280 | 1.6 | 4 | 0.50 | :556-557 |
| scav | 240 | 1.6 | 4 | 0.03 | :558-559 |
| artifact | 500 | 1.8 | 3 | 2 | :560-561 |
| luck | 140000 | 2.0 | 5 | 1 | :566-567 |
| fleetfoot | 65000 | 2.0 | 5 | 0.08 | :584-585 |
| briarmail | 133000 | 2.0 | 5 | 10 | :587-588 |
| lodestone | 134000 | 2.0 | 5 | 0.25 | :589-590 |
| hollowpoint | 136000 | 2.0 | 5 | 1 | :591-592 |
| ironheart | 137000 | 2.0 | 5 | 120 | :593-594 |
| hairtrigger | 139000 | 2.0 | 5 | 0.12 | :595-596 |
| headsman | 141000 | 2.0 | 5 | 0.15 | :597-598 |
| bloodpact | 143000 | 2.0 | 5 | 0.02 | :599-600 |
| fanfire | 410000 | 2.6 | 3 | 1 | :601-602 |
| deepread | 1650000 | 1.6 | 2 | 1 | :603-604 |
| aethertap | 3980000 | 1 | 1 | 0.60 | :605-606 |
| grandelixir | 4040000 | 1 | 1 | 1.0 | :607-608 |
| deepfont | 4060000 | 1 | 1 | 3 | :609-610 |
| eagleeye | 4120000 | 1 | 1 | 0.12 | :611-612 |
| staticfield | 4180000 | 1 | 1 | 1 | :613-614 |
| laststand | 4320000 | 1 | 1 | 1 | :615-616 |
| split | 400 | 1.35 | 10 | 1 | :641-642 |
| slots | 5000 | 2.9 | 3 | 0 | :643-644 |
| arcade | 4200000 | 1 | 1 | 0 | :649-650 |
| escapeskip | 100000 | 1 | 1 | 0 | :657-658 |
| zapchain | 200000 | 1.7 | 5 | 0 | :674-676 |

Weapon unlock rows are GENERATED (src/meta.js:618-626): one row per
`WEAPON_PRICES` entry, `baseCost` = the price, `costGrowth: 1`,
`maxLevel: 1`, `perLevel: 0`. Elite unlock rows likewise from
`ELITE_MODIFIERS` (src/meta.js:628-632): `baseCost` = `e.cost`.

### 1b. Weapon price ladder (WEAPON_PRICES, src/meta.js:449)

`ORBIT: 200` (:450), `ZAP: 600000` (:451), `NOVA_PULSE: 1200000` (:452),
`SCYTHE: 2000000` (:453), `SEEKER: 2800000` (:454), `MINE: 4200000` (:455),
`BEAM: 4500000` (:458). Starters (free, never priced): `STARTER_WEAPONS`
(:86) = VOLLEY, BOOMERANG.

### 1c. Elite modifier prices (ELITE_MODIFIERS, src/meta.js:468)

`SWIFT.cost: 1000000` (:472-474), `SPLITTING.cost: 1800000` (:476-478),
`VAMPIRIC.cost: 2800000` (:480-482).

### 1d. Slot economy (src/meta.js:436-437)

`WEAPON_SLOT_START: 3` (:436), `MAX_WEAPON_SLOTS: 6` (:437). Slot ladder
5000 / 14500 / 42050 via the `slots` row (baseCost 5000, costGrowth 2.9).

### 1e. Characters (CHARACTERS, src/meta.js:1390; upgrades :1245)

`unlockCost` per character: KNIGHT 0 (:1392), WITCH 9000 (:1398),
ROGUE 2500 (:1414), PALADIN 6000 (:1421). Character stat mods live in
each entry's `mods` map. `CHARACTER_UPGRADES` table at :1245.

### 1f. Run gold / economy (src/meta.js)

`RUN_GOLD` (:171): `AWARD: 70`, `FIRST_CLEAR: 250`, `CHALLENGE_BONUS_PCT:
200`. `GOLD_TIER` per-kill purse (:373): CHAFF 0, GRUNT 1, MID 3, HEAVY 8,
ELITE 15, MID_BOSS 60, BOSS 150. `GOLD_MODEL` (:239): `MID_TIER_IDS` (:276),
`TOP_TIER_IDS` (:287), income tiers and `PROGRESS_SPAN`. `RUN_CHESTS` (:315):
milestone chests at runs 50/100/200/500. `APEX_UPGRADES` (:878, prices frozen:
mark 550000, fire 5500000). `BASE_RARITY_WEIGHTS` (:963):
`{ COMMON: 98, RARE: 1.7, EPIC: 0.2, LEGENDARY: 0.02 }`.
`DRAFT_RARITY` (:1008), `DRAFT_BASE_WEIGHTS` (:1016),
`DRAFT_LUCK_TRANSFER: 0.05` (:1021), `DRAFT_STAT_WEIGHT: 0.3` (:1023),
`LUCK_MAX_LEVEL: 5` (:955), `LUCK_TAPER` (:971).

## 2. Weapon damage and scaling — EXHAUSTIVE (src/weapons.js)

Base run damage: `CONFIG.WEAPON.DAMAGE: 24` (src/config.js:100),
`COOLDOWN: 0.55` (:101), `PROJ_SPEED: 190` (:102), `PROJ_SIZE: 4` (:103),
`MAX_PROJECTILES: 3` (:108), `SPREAD: 0.30` (:109). Cap helper
`volleyProjectileCap` (src/config.js:14).

Archetype table `WEAPONS` (src/weapons.js:63): per-type `DAMAGE_MULT`,
`COOLDOWN`, plus shape knobs —
ORBIT `RADIUS: 40, DAMAGE_MULT: 0.8, TICK: 0.5` (:67-69);
BOOMERANG `RANGE: 120, DAMAGE_MULT: 1.0, COOLDOWN: 1.6` (:75-77);
ZAP `COOLDOWN: 1.4, DAMAGE_MULT: 1.0, COUNT: 3, CHAIN_RANGE: 90,
RANGE_PER_LEVEL: 20, FALLOFF: 0.75, MANA: 4` (:82-132);
NOVA_PULSE `COOLDOWN: 3.0, RADIUS: 70, DAMAGE_MULT: 1.2` (:136-138);
SCYTHE `COOLDOWN: 1.3, RANGE: 55, ARC: 1.0, DAMAGE_MULT: 1.3` (:143-146);
SEEKER `COOLDOWN: 1.8, TURN: 3.2, DAMAGE_MULT: 0.9` (:151-154);
MINE `COOLDOWN: 1.5, DAMAGE_MULT: 1.4, TRIGGER_R: 20, BLAST: 45` (:161-164);
BEAM `COOLDOWN: 4.0, WIDTH: 10, DAMAGE_MULT: 2.0` (:171-174).

Levels: `WEAPON_MAX_LEVEL: 8` (:859), per-archetype tables `WEAPON_LEVELS`
(:884-959, built by `buildLevels`), names `WEAPON_NAMES` (:861).
Mana gate: `weaponManaCost` (:443), ZAP cost read at :473-480.
Evolutions: `EVOLUTION_TOKEN_COST: 1` (src/evolutions.js:43).
On-kill blast: `BOOM_RADIUS: 40, BOOM_DAMAGE_FLAT: 4, BOOM_DAMAGE_FRAC: 0.5,
BOOM_MANA_COST: 6` (src/rewrites.js:242-250); empty-slot cooldown
`EMPTY_SLOT_COOLDOWN_STEP: 0.05`, `EMPTY_SLOT_COOLDOWN_FLOOR: 0.80`
(src/rewrites.js:294-295). Rewrite slots: `REWRITE_SLOTS: 4`
(src/config.js:573). Slots cap: `WEAPON_SLOTS: 6` (src/config.js:566).

## 3. Items and drops (survey)

- World-drop chances: `CONFIG.ITEMS` (src/config.js:577):
  `DROP_CHANCE: 0.02`, `ELITE_CHANCE: 0.5`, `BOSS_TIER_BIAS: 1.5`.
- Affixes: `AFFIX_POOL` (src/loot.js:48) with per-affix `base`
  (xpMult 0.1, goldMult 0.15, lifesteal base 0.02 at :67);
  `RARITY_SCALE` (:44), `AFFIX_COUNT` (:43), `STAT_DEFAULTS` (:119).
- Chests: `CHESTS` (src/chests.js:28): `DROP_CHANCE: 0.35`,
  `ELITE_HP_MULT: 1.5`, `MAX_ACTIVE: 3`, `PICKUP_RADIUS: 14`,
  `LIFETIME: 30`, `RARITY_WEIGHTS` (:44), `GAMBLE_CHANCE: 0.10` (:47),
  `GAMBLE_WIN_CHANCE: 0.5`, `GAMBLE_HORDE_COUNT: 6` (:56),
  `GAMBLE_HORDE_RADIUS: 90`.
- Shrines: `SHRINE_WORLD_COUNT: 3, SHRINE_WORLD_MARGIN: 40,
  SHRINE_BASE_COST: 60, SHRINE_COST_PER_WAVE: 30,
  SHRINE_COST_USED_MULT: 1.25` (src/shrines.js:30-36).

## 4. Enemy HP and damage (survey)

- Base: `CONFIG.ENEMY` (src/config.js:112): `BASE_HP: 144` (:136),
  `BASE_SPEED: 56` (:132), `BASE_XP: 5` (:137),
  `SPAWN_INTERVAL: 1.35` (:138), `SPAWN_DIST: 280` (:140);
  `POWER.HP_SQUARED / DAMAGE_SQUARED` (:125-128).
- Contact: `CONFIG.SURVIVAL` (src/config.js:62): `BASE_CONTACT: 196`,
  `CONTACT_POW: 0.65`, `HIT_CAP_FRAC: 0.5`, `HP_PER_LEVEL: 0.015`,
  `MAX_DRAIN_TICKS: 2`, `ELITE_VAMP_CAP_FRAC: 0.10`.
- Types: `ENEMY_TYPES` (src/enemy_types.js:35) — per-type `hpMult`,
  `speedMult`, `xpMult`, `sizeMult`, `contactDamageMult`, plus specials
  (`drainDps: 4` TICK :133, `shockRadius: 90` COLOSSUS :146,
  `projDamage: 5` PILLAR :168). Elites: `ELITE_TEMPLATE` (:238,
  `hpMult: 4.0, xpMult: 3.0`); mods `ELITE_MODS` (src/elite_mods.js:32).
- Escalation: `CONFIG.ESCALATION` (src/config.js:1092) — HP/XP/DMG curve
  params, `WAVE_LENGTH: 120`, `END_WAVE: 5`, `MIDBOSS` block (HP_MULT_BASE
  17, HP_MULT_PER_WAVE 14, PILLARS 6, BURST_DAMAGE 6, ...) and `BOSS`
  block (HP_MULT_BASE 500, HP_MULT_PER_WAVE 60, NOVA_DAMAGE 18,
  SUMMON_COUNT 3, CHESTS 2, DOUBLE_EVERY 3). Late ladder `CONFIG.LADDER`
  (src/config.js:1207): HP_LATE 1.055, DMG_LATE 1.010, XP_LATE 1.030,
  GROUPS_MAX 14, ELITE_MAX 0.12.
- Boss patterns: `BOSSES` (src/bosses.js:347) per-boss `hpMult`,
  `speedMult`, `contactDamageMult`, intervals; `MIDBOSS` (:423).
- Stages: `STAGES` (src/stages.js:33) per-stage `mods` (`hpMult`,
  `dmgMult`, `spawnMult`, `speedMult`) and `hazard` ring factors.

## 5. Potions and healing (survey)

- `CONFIG.POTIONS` (src/config.js:324): `HP_HEAL: 35` (:325),
  `MP_RESTORE: 40` (:326), `DROP_CHANCE: 0.006` (:334),
  `MAX_CARRIED: 3` (:335), `START: 1` (:336),
  `ADAPTIVE: { REF_KPS: 20, FLOOR_FRAC: 0.04, TAU: 6 }` (:350).
- Shared throughput budget: `CONFIG.HEAL_BUDGET.CAP_FRAC: 0.25` (:387-388);
  helpers in src/heal.js. Drink path in src/skills.js:286-290.
- Mana: `CONFIG.MANA` (:170): `MAX: 100`, `REGEN: 0.5` (:172).
- Skills: `CONFIG.SKILLS` (:206) — FROST_NOVA
  (MANA 30, COOLDOWN 8, RADIUS 85, DAMAGE 15, SLOW 2.5, SLOW_FACTOR 0.45),
  OVERCHARGE (MANA 25, COOLDOWN 12, DURATION 4, RATE_MULT 0.45),
  CHAIN_REACTION (MANA 30, COOLDOWN 8, JUMPS 6, CHAIN_RANGE 130,
  FALLOFF 0.85, DAMAGE 12, DAMAGE_FRAC 0.5), ults EARTHSHATTER / AFTERIMAGE /
  CONSECRATION (KILLS, MANA 60, COOLDOWN, RADIUS/DPS/TICK), MAGNET_PULL
  (MANA 0, COOLDOWN 30). Focus discount `FOCUS_MANA_MULT: 0.8`
  (src/perks.js:67). Heat: `HEAT_CAP: 20` (src/heat.js:22),
  `HEAT_SOURCES` (:25), `HEAT_CURVES` (:33).

## 6. Other tunables (survey, later sections)

Autopilot doctrine `CONFIG.AUTOPILOT` (src/config.js:392): `FOCUS_RANGE:
100`, stances, `BOSS_STANCE`, `AUTO_DRINK` (MP_FRACTION 0.30, COOLDOWN 1.5),
`AUTO_CAST`, draft/night timers. Ground caps `GROUND_ITEMS` (:698),
portal `PORTAL` (:595), prologue `PROLOGUE` (:615), run chest `RUN_CHEST`
(:670), camera `CAMERA` (:836), XP curve `XP_LEVEL_BASE: 30`,
`XP_LEVEL_GROWTH: 1.28` (:148-154). Encounters: `ENCOUNTERS`
(src/encounters.js:76).

## 7. Editor whitelist (slice 1)

The saver may write ONLY these files (relative to repo root):

- src/meta.js (shop, characters, gold, rarity, draft)
- src/config.js (weapon base, enemy base, potions, mana, skills, escalation)
- src/weapons.js (archetypes, levels)
- src/enemy_types.js (type mults)
- src/bosses.js (boss patterns)
- src/stages.js (stage mods)
- src/loot.js (affixes, rarity)
- src/chests.js (chest lifecycle)
- src/skills.js (drink path — read-mostly)
- src/heal.js (budget helpers — read-mostly)
- src/rewrites.js (boom numbers, empty-slot)
- src/evolutions.js (token cost)
- src/elite_mods.js (elite semantics)
- src/encounters.js (encounter catalog)

Slice 1 edits shop prices only (section 1a-1c: `baseCost`/`costGrowth`
literals in src/meta.js, `WEAPON_PRICES` values, `ELITE_MODIFIERS` costs).
Everything else in these files is readable but out of scope until its
section lands.
