# N1 SLICE 3 BRIEF - THE THREE NON-WITCH ULTS (EARTHSHATTER / AFTERIMAGE / CONSECRATION)  2026-09-14

Self-contained. Read this whole file AND `docs/briefs/N1_ULTS_SPECS.md` before writing any code.
The pilot authored the three effects, their numbers, their charge and their cooldown floors; those
are CONTENT, not implementation choices. **Do NOT invent effects, names, numbers, charge values or
cooldown values.** Implement what the specs say, or stop and report why you cannot.
You are the only writer in /home/claude/projects/hordes while the lock is yours.

## WHY THIS SLICE
The class-identity hook is already LIVE and dead: every `CHARACTERS` row declares `skill: '<id>'`,
`classSkillId(st)` (src/main.js:4567) is the one place it is read, and the Q routing / AUTO-CAST /
keycap map / `tc-q` readout / text HUD all already route through it. Slice 1 moved the WITCH to
CHAIN_REACTION; slice 2 made FROST_NOVA a draftable card so its removal from Q does not delete it.
**Slice 3 is the other three rows** - Knight, Rogue, Paladin - each getting its own kill-charged,
NON-mana ult. After this slice the four classes are genuinely four playstyles and N1 closes.

## THE CONTENT (authoritative: docs/briefs/N1_ULTS_SPECS.md)
Read it in full. One-line index so you know what you are building:

- **KNIGHT / EARTHSHATTER** - one radial shockwave on the player: RADIUS 240, damage
  `40 + 1.2 * maxHp` to every enemy inside, plus a 3s FORTIFY window (damage taken x0.5).
  CHARGE 40 kills, COOLDOWN floor 12s, no mana.
- **ROGUE / AFTERIMAGE** - 3s of movement payoff: move speed x1.5, and every 0.25s a phantom
  detonates at her CURRENT position (radius 70, damage `30 + 0.6 * weapon damage`) through the
  EXISTING blast path. CHARGE 30 kills, COOLDOWN floor 10s, no mana.
  **BOUND:** speed is a stat multiplier (the `speedMult` shape `CHARACTERS.ROGUE` already uses).
  Do NOT implement a dash/teleport/forced displacement - player movement belongs to the
  controller seam and a teleporting skill is OUT OF SCOPE for this slice.
- **PALADIN / CONSECRATION** - ONE placed, PERSISTENT holy field at the densest enemy cluster
  (fall back to the player's position when the field is empty): radius 140, 6s lifetime, TICKING
  `18 dps` to enemies inside, and the Paladin heals 2 HP per enemy KILLED inside the field,
  capped per tick to the field's own tick rate so it can never out-heal a boss.
  CHARGE 40 kills, COOLDOWN floor 15s, no mana.

Shared contract for all three (spec file, "The shared contract" section - restated because it is
the part that breaks other systems if you get it wrong):
- **NON-MANA.** `useSkill` (src/skills.js:21) charges `p.mana -= skillManaCost(id, state)` up
  front. An ult must NOT spend or read mana and must not enter the mana-price path, or the Witch
  stops being the mana class. Give each ult config with NO `MANA` key and make
  `skillManaCost(id, state)` resolve to 0 for them (check the existing helper before adding a
  branch; the goal is that the mana pool is byte-identical before/after an ult cast).
- **KILL-CHARGED with a cooldown floor.** Charge from the LIVE kill counter `p.kills`
  (incremented in src/main.js around :1832); `state.wave.startKills` is written at wave roll-over
  (src/main.js:952) - a wave boundary must NOT reset or leak the charge. READY only when
  `charge >= KILLS` AND `cooldownRemaining <= 0`. The floor exists so one dense wave cannot chain
  the ult back to back.
- **ONE BLAST, ONE FIELD.** Reuse the existing helpers: the onkillboom blast path
  (`boomBlast(p)` src/rewrites.js:153 - the "ONE blast" the Witch's chain already routes through)
  and the existing effect/ttl draw path (`state.effects` entries with `kind`, `ttl`, `age`, as
  FROST_NOVA does at src/skills.js:39-40). Do not write a second implementation of either, and do
  not add a new renderer.
- **CHARGE READOUT IS PART OF THE DELIVERABLE.** A kill-charged ult is invisible without it, so
  the `tc-q` badge (updated by `skill('tc-q', ...)` in `updateTouchHud`, src/main.js:5138) and the
  text-HUD line (src/main.js:5245) must show the charge, e.g. `34/40`, and distinguish
  **charging / READY / cooling**. Any new chrome element is registered in `chromeOn()`
  (src/main.js:5077) / `syncChrome()` (:5083) and then verified in a real browser.
- **60Hz and 120Hz both correct.** Nothing may assume a fixed dt - the charge, the ticks and the
  windows are all time-based.

## RECON - verified on THIS tree (src/ anchors at a624078; re-check before you trust a number)
- `src/main.js:4567` `classSkillId(st)` - the ONE place a class skill id is read.
- `src/main.js:4597` `else if (act === 'q') useSkill(state, classSkillId(state));` - the manual Q.
- `src/main.js:4711-4720` the AUTO-CAST policy block reads `classSkillId(state)` - the pilot's Q
  must work there too, for all four classes.
- `src/main.js:4070-4072` writes the `#q-skill` span text from `C.SKILLS[classSkillId(state)].NAME`
  (first word, uppercased). `index.html:345` holds the static `FROST` literal - it is runtime-owned
  now; do not hardcode a class name there.
- `src/main.js:1335` `if (p.invuln > 0) p.invuln -= dt;` and `:1647` the damage gate - the
  invuln/FORTIFY seam shape to copy. Do NOT reuse `p.invuln` for FORTIFY: that is the existing
  i-frame window and coupling them would silently grant i-frames.
- `src/config.js:151` `SKILLS` (FROST_NOVA :152, OVERCHARGE :167, CHAIN_REACTION :179) - the three
  ult blocks go here; `src/skills.js:29/41/44` are the matching `if/else if` branches.
- `src/meta.js:749/:770/:777` KNIGHT/ROGUE/PALADIN rows - each `skill:` on :751/:773/:780 becomes
  the new ult id. `src/meta.js:755` is the WITCH row: LEAVE IT ALONE (still CHAIN_REACTION).
- The kill counter: `p.kills` (src/main.js:795 reads `p.kills - state.wave.startKills`).

## THE ONE CROSS-SLICE HAZARD: LABEL WIDTH (H1 landed, uncommitted, in the same tree)
`#touch .pad` is now a FIXED 96px wide and `#touch .pad button` a fixed 96x64 with the `.badge`
given a reserved 28.6px box (H1, index.html) - the pads may never reflow again. The derived
`#q-skill` label is `NAME.split(' ')[0].toUpperCase()`, which is why FROST_NOVA renders `FROST` and
CHAIN_REACTION renders `CHAIN`. `EARTHSHATTER` / `AFTERIMAGE` / `CONSECRATION` are 12/10/12 chars
and will NOT fit a 96px button. Rule, so you do not have to guess:
- keep the spec NAMES as the long form (`NAME: 'Earthshatter'` etc.) and add a short
  `LABEL` field per skill for the on-screen label, used by BOTH the `#q-skill` span and the
  text HUD, chosen to fit: **<= 5 characters** - `EARTH`, `AFTER`, `ALTAR` (ALTAR for the
  Paladin's consecrated ground; it is a UI label, not a rename).
- If you choose a different short label, it must still pass the layout assertion below.
- Measure it: the `#q-skill` bbox must stay INSIDE the 96x64 button with the badge box unchanged,
  for all three classes. A 2-line label is a FAIL.
- `tools/verify_h1_pad_reflow.mjs` must still print 16/16.

## TESTS
1. NEW `test/test_ults.mjs` (follow the shape of `test/test_chain_q.mjs` / `test/test_frost_card.mjs`
   - same harness, `test/_harness.mjs`), printing raw numbers, covering PER ULT:
   - charge accrual from real kills; READY at exactly KILLS and not before;
   - the cooldown floor: a dense wave (many kills in one window) cannot cast it more often than
     `floor` allows - print the cast count over a fixed window;
   - **mana proof:** mana is byte-identical across a cast (print before/after), and the ult fires
     with `p.mana = 0`;
   - a wave roll-over (`state.wave.startKills` advancing) does NOT reset the charge;
   - the effect is real: Earthshatter damages every enemy inside RADIUS 240 and none outside;
     Afterimage spawns detonations on the move and the speed multiplier is live; Consecration
     TICKS for its full 6s, heals on kills inside only, and its heal is capped at the tick rate;
   - 1/60 and 1/120 dt parity - the numbers match between refresh rates.
2. NEW `tools/verify_n1_ults.mjs` (real browser, sibling of `tools/verify_n1_frost_card.mjs`).
   Phone viewport **390x844 @dpr3**, real taps. **CRITICAL (tick-38 lesson):** the shared
   `tools/browser.mjs` startup sets only 7 of the 19 `TOUR_KEYS` (src/tour.js:29-49) and the frame
   loop is gated on `!coachActive()`, so a run reached that way is FROZEN. Set ALL 19 keys and
   ASSERT `state.time > 1.0` BEFORE measuring anything. Then per class: the live `#q-skill` label,
   the `tc-q` badge reading charging / READY / cooling (read from the LIVE HUD), a real Q tap
   firing the ult, the blast/field present in `state.effects`, and a PNG per class written to
   `docs/art/browser-verify-2026-09-12/n1-ult-<class>-phone.png`, each 1170x2532, plus a bbox ink
   check on the `#q-skill` label (follow `verify_n1_chain_q.mjs`'s `inkInBox`). If no vision model
   is reachable, say so in COULD NOT VERIFY - do not describe what you assume the PNG shows.
3. **HONEST RETARGETS (these are expected to red on the old contract; retarget, never weaken):**
   - `test/test_chain_q.mjs` section 3 ("KNIGHT keeps FROST_NOVA in the Q slot", ~:278-300) - the
     Knight's Q is now EARTHSHATTER. Retarget the label and the `Q ...` text-HUD expectation to the
     Knight's ult. Leave the standalone `useSkill(st, 'FROST_NOVA')` damage check intact if it still
     passes on its own - FROST_NOVA itself is NOT changed by this slice.
   - `tools/verify_n1_chain_q.mjs` (~:117) expects `KNIGHT -> #q-skill === 'FROST'` - retarget to
     the Knight's new label. Its WITCH expectation stays `CHAIN`.
   - `test/test_frost_card.mjs` / `verify_n1_frost_card.mjs` must STAY GREEN (the card's
     offerability predicate is `classSkillId(state) !== 'FROST_NOVA'`, which is now true for all
     four classes - check the card is still offered and still fires; if the change alters that,
     report it before touching anything).
   - Every retarget gets a one-line comment saying WHY the contract changed. An assertion that
     disagrees with this slice's design is retargeted, not deleted and not tolerated.

## IN SCOPE / OUT OF SCOPE
- Yours: `src/config.js` (add the three `SKILLS` blocks), `src/skills.js` (add three branches +
  the mana-cost resolution), `src/main.js` (charge state, the cast gate, the readout, the effect
  ticks - keep hunks surgical), `src/meta.js` (ONLY the three `skill:` values on :751/:773/:780),
  `src/rewrites.js` only if a helper genuinely needs exporting.
- NOT yours: the H1 pad CSS in `index.html` (`#touch .pad`, `#touch .pad button`,
  `#touch button .badge`) - it is a landed, uncommitted fix. You may touch `index.html` ONLY where
  slice-3 requires it (e.g. nothing at all, ideally). Do not edit `src/controllers.js`,
  `src/weapons.js`, `src/perks.js`, `src/stages.js`, `src/heat.js`, `src/challenges.js`,
  `src/rarity.js`, `src/encounters.js`, art, audio, or `docs/HORDES_GOALS_2026-09-12.md`.

## HOUSE RULES (non-negotiable)
- LOCK: `~/projects/agent-hub/sdk/agentlock status`; if it is HELD by another owner, sleep 20s and
  re-check (up to 15 times) - never edit while another owner holds it. Release when done.
- **Do NOT run git commit/checkout/reset/stash/clean** - the orchestrator owns every commit. Leave
  the tree dirty; `git status`/`git diff` (read-only) are fine.
- Never weaken, skip, delete or no-op a test to go green. No emojis anywhere. Integer pixels.
- One writer per file. Keep every hunk surgical and commented with the N1 slice 3 reason.

## ACCEPTANCE BAR (evidence, not claims)
1. `bash tools/run_suite.sh` THREE consecutive runs, each ending `redfiles=0`, with the `TREE:`
   line pasted for each (a green measured on a stale tree is not green).
2. `node test/test_ults.mjs` with every check printing its raw numbers.
3. `node tools/verify_n1_ults.mjs` PASS in a real browser at 390x844 @dpr3, three PNGs 1170x2532,
   with the ink-bbox checks. `node tools/verify_h1_pad_reflow.mjs` still 16/16.
4. **PER ULT, a MEASURED before/after on a real cohort** (AUTO pilot, >=120s, >=5 runs each arm,
   same seeds): survival seconds and kills with the ult vs without it, the number of casts, and the
   chain proof (cast count over a fixed dense window vs the floor). Printed numbers, a stated noise
   band, and any NULL or NEGATIVE result reported honestly as a finding.
5. 60/120Hz parity holds (item 1's two dt runs).

## REPORT SHAPE (what the pilot will check)
- Files changed with insertion/deletion counts; the exact commands run with RAW output.
- The suite `TREE:` lines, the test/verify pass counts with numbers, the cohort table before/after.
- What did NOT work or could NOT be verified, named plainly (including any PNG not read
  semantically); the short labels you chose; confirmation that no git state command was run and no
  file outside the scope list was touched.
