# N1 SLICE 2 BRIEF - THE DRAFTABLE FROST_NOVA CARD ("Pocket Frost")  2026-09-13

Self-contained. Read this whole file before writing any code. You are the only writer in
/home/claude/projects/hordes while the lock is yours. The pilot authored this design; do NOT
invent effects, names, numbers or UI - implement what is here, or stop and report why you cannot.

## WHY THIS SLICE
Owner decision (docs/HORDES_GOALS_2026-09-12.md, N1 item 3, "FROST_NOVA, meanwhile, is called weak
by the owner and gets NO balance change here"): FROST_NOVA leaves the Q slot (the Witch already
moved to CHAIN_REACTION in slice 1; the other three classes move to their ults in slice 3) and
"returns as the draftable card that makes it reachable for the other three". Right now the only
thing keeping a non-Witch class able to frost is that `CHARACTERS` still says
`skill: 'FROST_NOVA'` - the moment slice 3 lands, FROST_NOVA is UNREACHABLE for every class and an
existing, shipped spell is silently deleted. This slice is the thing that prevents that.

## THE DESIGN (authored by the pilot - implement this, do not re-design it)
The card is a **run-owned, AUTO-FIRED frost nova**: take the card and, for the rest of the run, a
FROST_NOVA erupts from the player whenever it is off cooldown and the mana pool can pay for it -
driven through the EXISTING `useSkill(state, 'FROST_NOVA')` seam, at FROST_NOVA's OWN unchanged
numbers.

- **Numbers are untouched.** `src/config.js` `SKILLS.FROST_NOVA` = MANA 30 / COOLDOWN 8 / RADIUS 85
  / DAMAGE 15 / SLOW 2.5 / SLOW_FACTOR 0.45. `test/test_chain_q.mjs` pins every one of those
  constants. Do NOT change one of them, and do NOT edit `src/skills.js`.
- **Pay-only-when-you-can.** `useSkill` (src/skills.js:16) returns false and touches NOTHING when
  `p.skillCd[id] > 0` or `p.mana < skillManaCost(id, state)`. That is what makes an auto-cast safe:
  in a dry or empty-wallet run the card is inert, never a silent drain, and the failure mode is
  "you do not see a nova", never "your mana is gone".
- **Same cooldown source.** It uses `p.skillCd.FROST_NOVA` (entities.js:27) through `skillCooldown`
  (src/perks.js), so FOCUS's -15% cooldown applies and there is ONE cooldown, not a second timer.
- **No new button and no hijacked readout.** The Q button and the `tc-q` badge keep naming the
  class's own Q skill (`classSkillId`, main.js:4547/5124). A knight's Q is still EARTHSHATTER; the
  frost card is a PASSIVE pickup, the same product shape as the perk family (REGROWTH / FOCUS /
  THICK). The card must not touch `tc-q`'s label or readiness.
- **One per run.** Taken once, like every card in the perk/rule/rewrite families: after it is taken
  its card leaves the draft pool.
- **Not offered where it is redundant.** With the class Q already FROST_NOVA the card must NOT be
  offered (that would be a paid no-op). It becomes offerable exactly when the class Q is something
  else - i.e. today for the WITCH, and for the other three the moment slice 3 lands. Write the
  predicate against `classSkillId(state) !== 'FROST_NOVA'`, NOT against a hardcoded class list, so
  slice 3 needs no follow-up edit here.

REJECTED ALTERNATIVES (recorded so nobody re-litigates them):
(a) a third touch button for a drafted skill - more phone UI for a spell the owner called weak;
(b) the card REPLACING the class Q - it would delete the class identity slices 1 and 3 exist to
    build;
(c) buffing FROST_NOVA so it competes - explicitly forbidden by the owner's "NO balance change".

## HOUSE RULES (non-negotiable)
- No emojis anywhere in code, UI copy or docs. Integer pixels, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt.
- Never weaken, skip, delete or no-op a test. A test may be RETARGETED to a replaced contract.
- Do NOT run git commit/checkout/reset/stash/clean - the orchestrator owns every commit.
- One writer per file: `src/main.js` is yours for this slice, keep your hunks surgical (listed
  below). Do NOT touch `src/skills.js`, `src/config.js` (except nothing at all - FROST_NOVA's
  numbers stay byte-identical), `src/rewrites.js`, `src/weapons.js`, `src/perks.js` (read only),
  `src/meta.js` (the CHARACTERS rows are slice 3's), `src/stages.js`, `src/heat.js`,
  `src/challenges.js`, `src/rarity.js`, `src/encounters.js`, art, audio, or `docs/HORDES_GOALS_2026-09-12.md`.

## RECON (verified on this tree at c49642e - use these anchors, they exist)
- `src/main.js:4547` `classSkillId(st)` - the ONE place a class skill id is read.
- `src/main.js:4583` `else if (act === 'q') useSkill(state, classSkillId(state));` - the manual Q.
- `src/main.js:4676-4720` the N1b item 8 AUTO-CAST policy (`C.AUTOPILOT.AUTO_CAST`, config.js:289):
  `lands` predicate at ~:4694, casts at ~:4706 / `useSkill(state, 'OVERCHARGE')` at ~:4715.
  `src/main.js:1406` is where that policy is driven from the frame - YOUR call site goes beside it.
- The draft pool is built in `openDraft()` at `src/main.js:2210`; the card families are spread into
  `pool` at `:2255-2275` (`...skillCards(state)` at :2270, `...rewriteCards(state)` at :2273).
- The perk card family is the shape to copy: `src/perks.js:41` `SKILL_PERKS`, `:117` `skillCards`,
  `SKILL_CARD_WEIGHT` 0.04, and the run-local bag is `state.player.skills` (run-local ONLY - it is
  deliberately NOT in the save schema, so there is no migration and nothing to persist).
- `src/entities.js:27` `skillCd: { FROST_NOVA: 0, OVERCHARGE: 0, CHAIN_REACTION: 0 }`.
- Text HUD / HOW TO PLAY literals naming the skills: `src/main.js:2942` and `:4935`.

## DO
1. NEW FILE `src/frostcard.js` - everything above lives here, pure where it can be:
   - `export const FROST_CARD_ID = 'skill_frost';` `export const FROST_CARD_WEIGHT = 0.04;`
     (same family weight as SKILL_CARD_WEIGHT - state the reason in a comment).
   - `export function frostCardOffered(state)` -> true only when the run does not already hold it
     AND `classSkillId(state) !== 'FROST_NOVA'`. Import `classSkillId` if it is exported; if it is
     module-private in main.js, read the id the same way main.js does
     (`(state.character && state.character.skill) || 'FROST_NOVA'`) and say so in a comment.
   - `export function frostCard(state)` -> the one card object, shaped exactly like a `skillCards`
     entry: `{ id, skill: 'frost', name: 'Frost Nova', desc: 'SKILL - a frost nova erupts from you
     on its cooldown', weight: FROST_CARD_WEIGHT, apply: (p) => { ... } }`. The `apply` writes the
     run-local flag (a `frost` key on `p.skills`, the existing bag) and nothing else.
   - `export function grantFrost(state)` -> the writer, returns true only for a real state.
   - `export function hasFrost(state)` -> the reader the tick and the HUD both use.
   - `export function frostCardTick(state, dt)` -> if not held, or `state.mode !== 'playing'`,
     return false. Otherwise: when `p.skillCd.FROST_NOVA <= 0` and
     `p.mana >= skillManaCost('FROST_NOVA', state)`, call `useSkill(state, 'FROST_NOVA')` and
     return its result; else return false. NO new timer, NO rng, NO DOM - the cooldown lives in the
     existing `skillCd` slot. `dt` is accepted to prove dt-independence in the test; if you do not
     need it, take it and document that the cooldown is already dt-driven by the sim.
2. `src/main.js` - exactly four surgical edits, nothing else:
   a. one import of `frostCard`, `frostCardTick`, `hasFrost` from './frostcard.js';
   b. one pool line in `openDraft()` beside `...skillCards(state)`:
      `...(frostCardOffered(state) ? [frostCard()] : [])`;
   c. one call `frostCardTick(state, dt);` beside the AUTO_CAST drive at ~:1406, inside the same
      `state.mode === 'playing'` region, using that region's own dt variable (do not invent one);
   d. the text-HUD clause: when `hasFrost(state)`, the text HUD must NAME that you hold an auto
      frost nova (extend the `:2942` skills line with a `FROST AUTO` token rather than adding a new
      panel). If you add any NEW chrome element anywhere, it MUST be registered in the screen-chrome
      gate (`chromeOn` main.js:5063 / `syncChrome` :5069) - BUILD_PLAN's standing rule, and wave-23
      shipped a regression by skipping it. Prefer no new chrome at all.
   Do NOT touch `useSkill`'s call sites, `tc-q`, or the tour copy - the tour's skills coachmark
   (`:3296`) is slice 3's business.
3. NEW `test/test_frost_card.mjs` (headless, node, no browser, follow the shape of
   `test/test_chain_q.mjs` and `test/test_perks.mjs` for the harness idiom). It must assert, with
   measured values printed:
   - the card is NOT offered while the class Q is FROST_NOVA (KNIGHT/ROGUE/PALADIN rows as they
     stand) and IS offered for a run whose class Q is something else (set a character row in the
     probe state, do not edit meta.js);
   - it is offered once and gone after `grantFrost` (taken-once contract, like the perk family);
   - **FROST_NOVA's six config constants are re-asserted unchanged** (the pinned table: MANA 30,
     COOLDOWN 8, RADIUS 85, DAMAGE 15, SLOW 2.5, SLOW_FACTOR 0.45);
   - a fixed-dt sim over 120s with the card held and mana pinned HIGH casts **15** times (accept
     13-17, and print the count) at BOTH 1/60 and 1/120 - the numbers must match between refresh
     rates;
   - with mana pinned at 0 the tick casts 0 times and the pool NEVER goes negative (print the
     lowest mana seen);
   - with the card NOT held, 0 casts in the same window (the card is the only source).
4. NEW `tools/verify_n1_frost_card.mjs` (real browser, follow `tools/verify_n1_chain_q.mjs` - it is
   the sibling of this tool). Phone viewport 390x844 @dpr3, real finger taps. **CRITICAL, learned
   the hard way in tick 38:** the shared `tools/browser.mjs` startup script sets only 7 of the 19
   `TOUR_KEYS` (src/tour.js:29-49) and `frame()` gates the sim on `!coachActive()`, so a run reached
   that way is FROZEN. Set all 19 keys and ASSERT `state.time > 1.0` before measuring anything. Then:
   - start a WITCH run (her Q is CHAIN_REACTION, so the card is offerable), drive a real level-up so
     the draft opens, and read the LIVE pool: the FROST card must be present in the DOM of `ov-cards`;
   - tap it with a REAL tap and confirm it was taken (the flag, and the card gone from the next pool);
   - confirm `#q-skill` still reads CHAIN (the card did not hijack the Q readout);
   - confirm the nova actually FIRES in the live loop: count `state.effects` entries with
     `kind === 'nova'` growing inside a window with the sim clock advance asserted;
   - write the PNG to `docs/art/browser-verify-2026-09-12/n1-frost-card-phone.png` and print its
     pixel dimensions - it must be 1170x2532. Do NOT claim a vision/semantic read of the PNG; a
     dimensions-and-ink check is what you can honestly assert (the pilot reads it later).

## ACCEPTANCE BAR (all of these, measured - not asserted)
1. `bash /tmp/run_all.sh` => FAIL=0, `redfiles=0`. `test/test_chain_q.mjs` still 15/15, and its two
   pinned checks (FROST_NOVA's constants; "the other three classes keep FROST_NOVA") are UNTOUCHED.
2. `node test/test_frost_card.mjs` => every check in item 3 above, with the printed numbers.
3. `node tools/verify_n1_frost_card.mjs` => PASS in a real browser at 390x844 @dpr3, PNG 1170x2532.
4. **No dead pick, MEASURED before/after on a real cohort, numbers in the report:** run the same
   seeded cohorts with and without the card (grant it via `grantFrost`, the real seam) for at least
   a KNIGHT and the WITCH, >=120s, >=5 runs each; report survival seconds and kills as numbers. The
   card must not make either metric materially worse (state the noise band you used) and should
   improve at least one for at least one class. A NULL or NEGATIVE result is reported honestly - it
   is a finding, not a failure to hide, and you NEVER weaken an assertion to make it green.
5. 60Hz/120Hz parity holds (item 3's two dt runs) - nothing may assume a fixed dt.

## REPORT SHAPE (what the pilot will check, so give it to them)
- Files changed with insertion/deletion counts.
- The exact commands you ran, with their RAW output (suite counts, test pass counts, the cohort
  numbers before/after).
- What did NOT work or could not be verified, named plainly.
- The PNG path and its dimensions, and an explicit statement of what was NOT read semantically.
- Confirmation that you ran no git state command and touched no file outside the scope list.
