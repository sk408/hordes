# N1a BRIEF - WITCH / CHAIN ZAP: SOFT GATE + MANA DISCOUNT + CLUSTER PILOT (owner-ordered 2026-09-13)

Self-contained. Read this whole file first, then the files it names. You are the only writer in
/home/claude/projects/hordes while you hold the lock.

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt.
- Never weaken, skip or delete a test. A test may be RETARGETED to a replaced contract, never no-op'd.
- Do NOT run git commit/checkout/reset/stash/clean - the orchestrator owns commits.
- Do not retune anything outside the files below. Do not touch src/heat.js, src/challenges.js,
  src/rewrites.js, src/perks.js. Do not author new art. Do not touch the N2 title-reveal code in
  src/main.js (uncommitted work by a previous builder - leave those hunks byte-identical).
- One writer per file. Files in scope: src/weapons.js, src/meta.js, src/controllers.js, src/main.js
  (only the skill-id and pilot-default reads named below), index.html (the Q button label),
  test/test_weapon_mana.mjs (+ a new test file if you need one), tools/verify_skill_keys.mjs.

## WHY (owner's words, 2026-09-13)
> "the witch should get some kind of discount on the chain zap then. Or minimum fire speed, or both.
>  Maybe for witch with no mana, the chain zap is weaker, and with mana we buff it to make up the
>  difference? And witch gets different pilot logic which chooses enemies clumped together more often"

MEASURED PROBLEM this fixes (already measured, do not re-derive): the shipped hard gate (commit
730a04b) makes ZAP cost 4 mana and NOT fire below it. On a fresh Witch run (ZAP is her STARTING
weapon) the pool drained 96 -> single digits by ~60s, ZAP spent 1089 frames (~18s of a 120s run)
loaded with a target but unable to pay, and it fired 6 bolts in 120s against ~85 if unfunded.
A class must not open with its signature weapon offline.

## RECON (verified 2026-09-13, re-check cheaply)
- src/weapons.js:76  WEAPONS.ZAP, MANA: 4 at ~:95. updateZap at :379; the hard gate is at :394-400
  (`if (W.MANA) { if (p.mana < W.MANA) return; p.mana -= W.MANA; }`).
- src/skills.js:16   useSkill(state, id) - the only mana spender for skills. Q/E route through it at
  src/main.js:4132-4133 (`act === 'q'` -> useSkill(state, 'FROST_NOVA'), hardcoded literal).
- src/meta.js:652    CHARACTERS (KNIGHT/WITCH/ROGUE/PALADIN). Every entry declares `skill:
  'FROST_NOVA'` and NOTHING reads it. WITCH.mods is `{ maxHp: -25, maxMana: 50 }`.
- src/meta.js:684    applyCharacter(stats, characterId) - carries ONLY maxHp/maxMana/speed today.
   Call site: src/main.js:3567-3572 (startRun).
- src/main.js:4601   the `skill('tc-q', ...)` readiness readout; ~:4703 the text-HUD Q line; the touch
   button label in index.html is the ONE other hardcoded "FROST" string.
- src/controllers.js:13 FOCUS_MODES = ['NEAREST','TOUGHEST','SWARM','RANGED']; :43 the AutoPilot
   constructor hardcodes `this.focus = 'NEAREST'`; :103 the SWARM branch (densest cluster within
   C.AUTOPILOT.SWARM_CLUSTER_R) ALREADY EXISTS - this is a default, not new targeting math.
- src/perks.js:132 is the Focus discount helper - do not modify it, but keep it consistent.
- Sim: tools/real_loop.mjs exports runRealCohort(profile, n) -> [{time,wave,cause,killer,kills,level,
   gold,won}] and bootReal(). Use it for the numbers below; do not invent a second harness.

## DO
1. SOFT GATE, never a starve. ZAP fires on cooldown as normal. With mana >= cost it spends and deals
   FULL damage. Below cost it STILL FIRES at reduced damage (`MANA_DRY_MULT = 0.5`, exported const)
   and does NOT spend. No cd penalty either way. The floor cadence IS the cooldown, so the owner's
   "minimum fire speed" needs no second knob.
2. WITCH DISCOUNT via data, not a special case. Add `manaCostMult` to the character mods (WITCH 0.5;
   missing = 1), thread it through `applyCharacter` (src/meta.js:684) so it reaches the run stats, and
   read every mana cost through an exported helper `weaponManaCost(id, state)` in src/weapons.js.
   ZAP must cost 2 for the Witch and 4 for everyone else, read from that one helper.
3. WITCH PILOT: cluster seeker. Give the AutoPilot a PER-CLASS DEFAULT FOCUS applied at startRun
   (WITCH -> 'SWARM', everyone else keeps 'NEAREST'). The player must still be able to cycle focus
   with TAB/G exactly as today.
4. Kill the hardcoded skill literal. `act === 'q'` (src/main.js:4132), the readiness readout
   (:4601), the text-HUD line (:4703) and the touch label in index.html must all read the class's
   skill id through a helper (`classSkillId(state)`), not a literal. Keep the VALUE 'FROST_NOVA' for
   all four classes: the class ULTS are a SEPARATE slice, owner-gated, and are NOT yours.
5. NOT IN SCOPE (named so you do not wander): the three non-Witch ults, the AUTO pilot cast policy
   (N1b item 8), the new shop buyables (thrifty/well/siphon), Chain Reaction's cost, and any change
   to mana regen or pool size. If you think one is required to make your numbers hold, STOP and write
   `blocked:` with the measurement instead of changing it.

## ACCEPTANCE BAR (numbers, not intentions)
- Bolt counts from runRealCohort cohorts on THIS tree, before vs after, at the real 60Hz loop:
  a 120s Witch run must fire >= 60 ZAP bolts (today: 6) and a non-Witch control must be unchanged
  (they do not own ZAP at base - state which control you used).
- Damage ratio on a dry pool: exactly MANA_DRY_MULT within 0.02, asserted numerically.
- Cost per bolt: Witch 2, others 4, asserted through `weaponManaCost`.
- No frame may be "loaded with a target but unable to pay" any more: report the count (today 1089)
  and the share of frames ZAP had a target at all.
- Report mean mana and kills/survival for both classes so the mana economy is visibly NOT a tax.
- `node tools/verify_skill_keys.mjs` must PASS; `bash /tmp/run_all.sh` three times, each FAIL=0
  (baseline on this tree: PASS=70 FAIL=0). If test/test_weapon_mana.mjs encodes the hard gate, RETARGET
  it to the new contract - do not delete it.
- 120Hz: re-run the key timing/fire-rate assertions at a 8.33ms dt and show the same bolts/timing
  within noise. Nothing may count frames.

## LOCK
Acquire `~/projects/agent-hub/sdk/agentlock acquire --note "N1a witch soft gate"` before editing and
`release` when done; if it reports another owner, STOP and report that owner - do not edit.

## REPORT
Finish with: what landed (file:line per change), the before/after numbers, the three suite results,
the 120Hz check, and an explicit list of what you could NOT verify. No vision model is reachable on
this host - do not claim anything "looks right".
