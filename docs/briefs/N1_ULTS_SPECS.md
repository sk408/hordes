# N1 slice 3 - THE THREE NON-WITCH ULTS: the pilot's specs (authoritative)

Pilot (goal-pilot tick 38), 2026-09-13. Repo /home/claude/projects/hordes @ c49642e.
The owner delegated these three EFFECTS to the pilot (2026-09-13: "go ahead"), with the bound:
*"the pilot owns the content DESIGN and must bring back a short spec per class (name, effect,
numbers, why it is distinct) BEFORE a builder implements anything."* This file IS that deliverable.
A builder must NOT invent effects, names or numbers here: implement these, or stop and report.

## The shared contract (every ult, all three classes)

- **Slot: Q.** `src/main.js:4547 classSkillId(st)` is the ONE place a class skill id is read; the
  routing (`:4577` act q, `:4691-4708` autopilot Q/E, `:4840` keycap map, `:5117` the `tc-q`
  readiness readout, `:5219` text HUD) is ALREADY live. The three ult ids go on the KNIGHT /
  ROGUE / PALADIN `CHARACTERS` rows in `src/meta.js` (each currently `skill: 'FROST_NOVA'`).
- **NON-MANA.** The ult must not read or spend the mana pool. `useSkill` (`src/skills.js:16`)
  charges `def.MANA` up front; an ult with no MANA key must not enter that path or the Witch stops
  being the mana class (goals doc N1b item 3).
- **KILL-CHARGED, WITH A COOLDOWN FLOOR.** Charge from `state.player.kills` (`p.kills` is the live
  counter, incremented at `src/main.js:1832`; `state.wave.startKills` marks wave starts - a wave
  boundary must NOT reset the charge). The floor exists so one dense wave cannot chain the ult:
  the ult is READY only when `charge >= KILLS` **and** `cooldownRemaining <= 0`.
- **ONE BLAST, ONE FIELD.** Reuse the existing helpers - the onkillboom blast path the Witch's
  chain already routes through, and the existing effect/ttl draw path. Do not write a second
  implementation of either.
- **CHARGE READOUT IS PART OF THE DELIVERABLE.** A kill-charged ult is invisible without it. The
  `tc-q` badge and the text-HUD line already exist (`:5117`, `:5219`); they must show the charge
  as a pair of numbers, e.g. `34/40`, and CLEARLY distinguish "charging" / "READY" / "cooling".
  Any new chrome element is registered in the screen-chrome gate (`chromeOn` `src/main.js:5063`,
  `syncChrome` `:5069`) and then verified in a real browser - BUILD_PLAN's standing rule.
- **60Hz and 120Hz both correct.** Nothing may assume a fixed dt.
- **No dead pick.** Each ult gets a measured before/after on a real cohort (survival, kills).

## 1. KNIGHT - **EARTHSHATTER**

- **What it does.** One radial shockwave centred on the player: radius 240, damage
  `40 + 1.2 x maxHp` to every enemy inside, plus a 3s FORTIFY window (damage taken x0.5).
  Single instant beat, no ticks, no aiming - the player IS the target zone, the payoff is that
  the free tank can stand in a clump instead of kiting out of it.
- **Charge:** 40 kills. **Cooldown floor:** 12s. **Mana:** none.
- **Why it is distinct.** NOVA_PULSE is a SMALL repeating radial pulse with no defensive rider;
  FROST_NOVA is a small low-damage slow. Earthshatter is the only huge, one-shot, player-centred
  blast in the kit, and the only ult whose rider is defensive. Damage scales off maxHp, which is
  the Knight's own stat, so it scales with the build he is already making.

## 2. ROGUE - **AFTERIMAGE**

- **What it does.** 3s of movement payoff: move speed x1.5, and every 0.25s a phantom detonates at
  her current position (radius 70, damage `30 + 0.6 x weapon damage`) through the EXISTING blast
  path. She runs a clump and leaves a trail of detonations behind her.
- **Charge:** 30 kills. **Cooldown floor:** 10s. **Mana:** none.
- **Why it is distinct.** No weapon or skill in the kit leaves detonations along a PATH - MINE is
  stationary and fires once, ORBIT is attached and continuous, BEAM is a single instant line.
  It is position-driven, not aimed and not chained, so it cannot read as a copy of the Witch's
  Chain Reaction. It also uses her own stat (speed), so the class's identity compounds.
- **Implementation bound.** Speed is a stat multiplier (the `speedMult` shape `CHARACTERS.ROGUE`
  already uses) - do NOT implement a forced displacement/dash: player movement belongs to the
  controller seam, and a skill that teleports the player is out of bounds for this slice.

## 3. PALADIN - **CONSECRATION**

- **What it does.** One placed, PERSISTENT holy field at the densest enemy cluster (fall back to
  the player's position when the field is empty): radius 140, 6s lifetime, damaging every enemy
  inside for `18 dps` of ticks. Sustain payoff: the Paladin heals 2 HP per enemy KILLED inside the
  field (capped per tick to the field's own tick rate so it cannot out-heal a boss).
- **Charge:** 40 kills. **Cooldown floor:** 15s. **Mana:** none.
- **Why it is distinct.** It is the only PLACED, LONG-LIVED zone in the kit and the only ult with
  a sustain payoff; MINE is a one-shot stationary explosive, so the field must TICK for its whole
  lifetime, not detonate once. Placing it on the densest cluster makes it the class's answer to a
  clump without borrowing the Witch's chain or the Knight's burst.

## Acceptance bar (all three, evidence not claims)

1. `bash /tmp/run_all.sh` three consecutive times, each ending `redfiles=0`, with the `TREE:` line
   pasted for each run (a green measured on a stale tree is not green).
2. Per ult, MEASURED on a real cohort, numbers not intentions: survival and kills with the ult vs
   without it (AUTO pilot), the number of ult casts, and - per the cooldown floor - a proof that a
   dense wave cannot chain it (measured cast count over a fixed window against the floor).
3. The charge readout: charge, READY and cooling all shown, read from the LIVE HUD, and the mode
   registered in `chromeOn`/`syncChrome`.
4. REAL-browser phone verification at 390x844 @dpr3 with the PNG actually READ (a code claim is
   not evidence for anything a player looks at). If no vision model is reachable, say so in
   COULD NOT VERIFY instead of describing what you assume the PNG shows.
5. Never weaken, move, delete or tolerate an assertion to go green. If a contract changed by
   design, STOP and report with the measurement - the pilot decides, not the builder.
6. No git state commands (commit/checkout/reset/stash/clean) - the orchestrator owns commits.
   No emojis. Integer pixels.
