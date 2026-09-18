# RESOURCE-SPEND AUDIT — the auto/night pilot (2026-09-17)

Owner directive msg_01M2RE1V8CNZABTQ7W0ETEEPY0: "AUDIT THE WHOLE CLASS: every
resource the auto/night pilot holds and whether it spends it — potions, magnet
skill, the ult when mana allows, banked gold at the shop; give spend policy for
each; pattern to avoid is AN AUTO PLAYER DYING RICH; report hoarding with
evidence, don't silently change."

Method: code-seam citations + the seeded real-loop measurement arms of
tools/measure_potion_tune.mjs (seed 1337; maxed 2 runs capped 300s, partial 3
runs / 180s, fresh 3 runs / 180s; BEFORE = pre-tune tree, AFTER = post-tune).

| resource | spend policy (code) | BEFORE evidence | AFTER evidence | verdict |
|---|---|---|---|---|
| potions (HP) | autoDrinkPotions (src/main.js): AUTO/night only; fires when HP is STRICTLY BELOW the potion's heal (HP_HEAL x healMult — Alchemy + potionHealMult); one drink per 1.5s COOLDOWN; never at/above the line, never at 0 count; MANUAL untouched | **HOARDING CONFIRMED**: maxed 300s runs — 0 hp drinks, 48 distinct drops on the ground worth 226-239 flasks; the 0.35-of-max gate (87+ HP on a big pool) never fired | Threshold is the heal value (35 nominal, tracks healMult). Maxed arms still show 0 drinks — measured deaths there are not HP-starved (run survives to cap); ground value fell to 130-158 (the supply cut). Boundary behaviour proven numerically in test/test_potion_tune.mjs: 35.0 no-fire / 34.5 fires / Alchemy 70.0 no-fire / 69.5 fires-and-heals-70 | FIXED at the seam that was broken (gate that could never fire); burst deaths below are a different failure mode |
| potions (MP) | Same seam, mana half: fires below MP_FRACTION 0.30 of max ONLY when a skill is genuinely waiting on mana (off cooldown AND short of cost; a charged ult the pool cannot afford counts, an uncharged one does not) | 0 mp drinks in every arm — no evidence of hoarding: the gate is demand-driven and the AUTO pilot also CASTS (see ult row), so mana does get spent at the cast seam | unchanged code, unchanged shape | HEALTHY (no change; disclosed: MP threshold NOT moved to a flat restore value — mana feeds a cooldown economy, not a heal) |
| magnet skill (MAGNET_PULL) | autoCastSkills (src/main.js): fires when gems+drops+itemDrops outstanding >= C.MAGNET.AUTO_MIN — a pure FLOOR-VALUE gate, never a timer: the pilot banks the field exactly when the field is worth banking | measured arms: gems/drops are consumed by pickup continuously; no magnet hoarding observable (the gate is on the field, not the inventory) | unchanged | HEALTHY (spends) |
| the ult / skills (Q/E) | autoCastSkills (src/main.js): Q (class skill or ult) casts when ultCharge.ready — charge + cooldown floor + the mana price — AND it lands (radius/enemy tests; CONSECRATION placed at the densest cluster); OVERCHARGE (E) fires on THREAT (boss/elite in range) or SPILL (mana near full) | measure arms cast q+e on every boss window; ults spend on readiness, not on banked kills | unchanged | HEALTHY (spends) |
| banked gold (the shop) | Gold banks at run end via settleRunGold (src/meta.js); META-SHOP purchases are the OWNER's decision by design — the pilot is an in-run agent and has no shop hand. In-run spend: intermission PAID CHESTS exist (REPEAT_GUARD history: held-key purchases drained the purse); the pilot's intermission policy picks CONTINUE, so it never buys chests | fresh/partial arms bank 70-340g per death; nothing is left unspent IN-RUN because there is nothing else to buy mid-wave | unchanged | OUT OF PILOT SCOPE BY DESIGN (reported, not changed): gold hoarding between runs is the player's own shop hand; if the owner wants a night-mode auto-shopper, that is new work, not a tune |

## The "dying rich" pattern, measured honestly

- The maxed arm WAS dying rich on potions in the only sense that matters: it
  never spent one while the ground held 48 drops. That was the gate, and the
  gate is now fixed (threshold = the heal).
- The fresh/partial arms die "rich" (carried {hp:1, mp:1} into death) through
  BURST, not hoarding: diagnostic run (partial, maxHp 250) shows the final two
  hits as 250 -> 125 -> 0 — two damage-capped contact hits inside one second.
  HP is never below ANY threshold while a frame passes (old gate 87.5, new gate
  35; the last living frame reads 125). No potion gate can fire there; the fix
  for that pattern would be inbound-burst tuning, which is NOT part of this
  directive. Reported with numbers, untouched.
