# OTHER SURVIVAL PATHS — unseeded hunt, findings (2026-09-16)

Owner request, verbatim: **"and then ask glm to look for other paths and don't provide theories."**
Brief: `docs/briefs/OTHER_SURVIVAL_PATHS.md`. The known/fixed lifesteal-throughput path (G32 finding,
G34 fix) is OUT OF SCOPE and is not re-measured here.

## VERDICT

**ONE other path found — HIGH confidence, reproduced with a control: GRAVE HARVEST, the SCYTHE
weapon's evolution, heals 2 HP per kill per sweep with NO rate cap** (`src/weapons.js` :542-543,
`evoHas(weapon, 'harvestSouls')`; evolution def `src/evolutions.js` :81-87, flag `harvestSouls`).
It is the same defect family as the G34 finding — heal throughput proportional to KILL RATE, against
an inbound that is bounded (~0.83 x maxHp/s ceiling) — at a different site, and G34's token bucket
caps only the `stats.lifesteal` heal sites (`main.js` :1878/:7326), not this one.

**Stacked with the now-capped lifesteal stat it RESTORES the invincibility symptom post-fix**: the
G34 acceptance arm (FE5 + lifesteal 0.15, no scythe) dies @45s on this tree; the SAME arm plus a
maxed evolved SCYTHE is ALIVE @300s with HP floor 18.

- **Mode-agnostic**: the sweep is a weapon — it fires and heals whichever pilot moves the player.
- **Acquisition / how early**: SCYTHE from a NEW WEAPON draft card (weapon slots start at 3) →
  level to Lv8 (`WEAPON_MAX_LEVEL`) → a lifesteal-kind item equipped (`loot.js` Vampiric affix) →
  an EVOLUTION TOKEN → the evolve overlay. Realistically mid-run (several minutes in) on a lucky
  draft; well inside "the first couple of hours". The probe below stages it at t=0 to isolate it.
- **Why it prevents damage**: each sweep that kills N enemies heals 2N HP, uncapped and unbucketed.
  At the measured swarm rates (60-90 kills/s) that is 120-180 HP/s — more than double the G34 cap
  (0.25 x maxHp/s) and far above any inbound the hit cap + i-frames can deliver.

## EVIDENCE (all arms: fresh profile + FE5 shop staged, 300 sim-second cap, lifesteal STAT 0 unless
noted, xp/drafts/potions left to the normal auto-play policy, one arm per process, <= 60s wall each)

| arm | staged | outcome | taken | healed | HP floor | peak 10s kill rate |
|---|---|---|---|---|---|---|
| control | FE5 + SCYTHE Lv8, NOT evolved | **DEAD @38s** (wave 1, lvl 3, 27 kills) | 199.9 | 38.9 | -31 | 1.1/s |
| harvest alone | FE5 + SCYTHE Lv8 + GRAVE_HARVEST | **DEAD @121s** (wave-1 boss, lvl 17, 798 kills) | 519.6 | 368.5 | -21 | 16.4/s |
| harvest + ls 0.15 | the above + lifesteal stat 0.15 (G34-capped) | **ALIVE @300s** (wave 2, lvl 32, 5,832 kills, 3 potions left) | 7,885.5 | 7,985 | **18** of 298 | **89.6/s** |

Attribution: the G34 A/B already showed FE5 + ls0.15 WITHOUT the scythe dies @45s on this tree;
the only difference in the ALIVE arm is the harvest path. Heal ledger: 7,985 HP over 300s; the
lifesteal share is bounded by the G34 bucket (<= 0.25 x maxHp/s), so the bulk is harvest — at the
89.6 kills/s peak samples the harvest alone pays up to ~179 HP/s.

Solo-honesty: harvest ALONE (lifesteal 0) extended survival 3x (38s -> 121s, healed 368.5 vs 38.9)
but still died at the 120s boss at ~16 kills/s — 32 HP/s of harvest did not cover a 199 HP pool's
boss pressure. The invincibility needs either higher kill rates (wave-2 swarm, which the solo arm
never reached) or the lifesteal stack. **COULD NOT VERIFY**: a solo-harvest arm alive inside the
wave-2 swarm band (it dies at the wave-1 boss first); and >300s arms exceed the 60s wall cap
(standing rule, dropped not extended).

## WHAT I ENUMERATED AND RULED OUT (and how)

HP can only DECREASE at five sites, all verified to still decrement: contact (`main.js` :2090),
enemy projectile (:2124), TICK drain DoT (:1971, MAX_DRAIN_TICKS latch), the boss-curse halving
deduction (:6118), and the finale's maw damage (:7257/:7276). Every gate/undo family on top:

1. **AEGIS arch (shieldAbsorbs)** — 3 absorbs + 0.5s i-frame each (`main.js` :2085/:2120).
   RULED OUT as sustained: the arch is CONSUMED by walking under it (`arches.js` :80 splice);
   refresh needs a SECOND SHIELD-type arch to spawn (uniform 1-in-5 of 1-2 arches/wave), and the
   buff expires in 75s. Bounded by construction; no run needed.
2. **Portal invuln** (`main.js` :1751) — AUTO/MOVE only, 0.1s refreshed while steering, only while
   a portal is open (post-boss, pre-wave-end), entry DWELL 0.4s. Bounded window by construction.
3. **Second Wind** (`main.js` :3588, reset per run :5603) — once per run, by construction.
4. **FORTIFY** (`main.js` :662`, x0.5) — 3s rider on a 12s-cooldown ult. Burst window, bounded.
5. **Regrowth** (`perks.js` :175) — flat 0.7 HP/s vs measured inbound 4.2-26.3 HP/s in today's
   probes. Arithmetic: can never out-heal. Not run.
6. **Potions** — 35 HP flat, stock capped (3/kind), supply rate-bounded by G33. Bounded.
7. **Consecration altar** (`skills.js` :238) — heal explicitly capped at DPS*TICK (9 HP/tick) by
   design. Capped.
8. **healOnChest (PALADIN)** — 15 HP per chest (`meta.js` :1265), ~3 chests/wave. Arithmetic:
   bounded far below inbound. Not run.
9. **Level-up heal** (`main.js` :2639`) — linear 1.5% of the START pool per level; shared by every
   control arm above, which died anyway. Not a survival path on its own.
10. **Weather** (`weather.js`) — mods are speed/fireRange/mana/xp only; no damage or heal term.
11. **Shrines** (`shrines.js`) — no HP/heal effect at all (grep: zero matches).
12. **Thick Skin** (-12% incoming) — a reduction, never a negation; inside every measured arm.
13. **i-frames (0.6s) + hit cap (0.5 x maxHp)** — already accounted inside the 0.83 x maxHp/s
    inbound ceiling; they bound inbound, they do not heal.
14. **Elite VAMPIRIC** (`main.js` :2097) — heals the ENEMY, not the player. Not a player path.

## ALSO BROKEN / NOTED ON THE WAY

- The fresh-save early wall is still open and worse than first reported: today's stock control died
  at **6s** (the G32-era control died at 26s; the flagged band was 9-26s). Same finding, more
  variance — nothing in G34/G35 touches fresh saves' damage-in path.

## DRIVERS (throwaway, outside the repo)

`/tmp/otherpaths_arm.mjs` (frozen-XP isolation probe), `/tmp/otherpaths_arm2.mjs` (full-progression
harvest/control), `/tmp/otherpaths_arm3.mjs` (same + LS env for the stack arm). All use
`tools/real_loop.mjs` bootReal, one boot per process, 300 sim-second caps.
