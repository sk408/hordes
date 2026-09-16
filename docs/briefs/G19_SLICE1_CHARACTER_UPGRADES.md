# G19 SLICE 1 — PER-CHARACTER UPGRADES: THE TABLE, THE SHOP SURFACE, THE RUN EFFECT

Brief authored by the goal pilot (`subagent:spawnfa`) 2026-09-15, dispatched to `cli:glm-hordes-g8`.
Owner goal: G19 — PER-CHARACTER PROGRESSION + SPECIALISATION, `docs/HORDES_GOALS_2026-09-12.md` :2483.
This brief is a SLICE: the per-character LAYER only. It does not attempt specialisation/weakness design,
does not touch balance numbers of the global shop, and runs no simulations.

## DISPATCH ANCHOR CHECK — resolved on THIS tree (HEAD `10b30f9`) at dispatch time

- `src/meta.js` :419 `export const SHOP_UPGRADES = [`, :577 `SHOP_BY_ID`, :592 `upgradeCost(def, level)`,
  :601 `buyUpgrade(profile, id)` (dispatches `kind: 'weapon'|'elite'` to the unlock paths; gold debit at
  :608-611), :616 `weaponUnlocked`, :622 `unlockWeapon`, :669 `grantCharacter`.
- `src/meta.js` :54-71 the G19 per-character accessor re-exports (`getCharacterProgress`,
  `getCharacterUpgradeLevel`, `setCharacterUpgradeLevel`, `addCharacterUpgrade`,
  `resetCharacterProgress`) — they exist and are re-exported with the live catalog injected.
- `src/meta.js` :1055-1066: the comment block that SPECIFIES the row shape, then
  `export const CHARACTER_UPGRADES = [];` (:1062) and `CHARACTER_UPGRADE_BY_ID` (:1063-1064). The table is
  EMPTY: "Nothing consumes this yet; the profile's characters namespace stays empty until the feature wave
  populates it through the accessors above." **Populating it IS this slice.**
- `src/meta.js` :1068 `export const CHARACTERS = {` (KNIGHT free, WITCH 9000, ROGUE 2500, PALADIN 6000),
  :1108 `applyCharacter(stats, characterId)` — reads `ch.mods` (`maxHp`, `maxMana`, `speedMult`,
  `manaCostMult`) and `healOnChest`.
- `src/save.js` :43 `PROFILE_VERSION = 8`; :357-360 the namespaced `profile.characters` section
  (`{ [characterId]: { upgrades: { [upgradeId]: level } } }`); :708-800 the accessor contract with
  clamping to `maxLevel` for a KNOWN row; :781 `if (!plainObject(profile.characters)) profile.characters = {};`
- `src/main.js` :4544 `showShop()` (rows loop :4555+, `profile.purchased[def.id]` :4558, the buy tap
  :4567-4578, icons `shopIconCanvases[def.id]` :4599), :4624/:4661 the second row list, :4498 the
  `menuCard('SHOP', ...)` door, :4803 the character screen's stat preview
  (`applyCharacter(applyMetaBonuses({...base}, profile.purchased), ch.id)`), :5096 the RUN-START seam
  (`applyCharacter(applyMetaBonuses(p.stats, profile.purchased), profile.equippedCharacter)`).
- `test/test_save_v3_characters.mjs` exists and tests the SCHEMA + accessors against an injected empty
  catalog. Do NOT edit it — it is the schema's own test, and this slice must not change the schema.

If any anchor above is already stale when you start, re-resolve it by grep and SAY SO in your report; if a
symbol is gone, post `blocked:` with the grep you ran rather than guessing.

## WHAT ALREADY EXISTS (measured, do not rebuild)

1. The storage namespace, its validation, its migration and its accessors — `src/save.js`, tested by
   `test/test_save_v3_characters.mjs`. It clamps a known row's level to that row's `maxLevel` and
   normalises unknown/foreign data away.
2. The four characters with their `mods` and one global shop with `purchased`, `upgradeCost`, `buyUpgrade`
   and the shop UI that renders rows, paints icons and re-renders after a buy.
3. The two-layer INTENT from the owner: the global shop is the FLOOR that keeps working on every
   character; the per-character layer is the long-tail. `docs/HORDES_GOALS_2026-09-12.md` :2483-2520.

## SCOPE — build exactly these three things

**(1) POPULATE `CHARACTER_UPGRADES` with 8 rows: 2 per character for all four characters.**
Row shape is the one already specified in the file at `src/meta.js` :1059-1061 and MUST match it exactly:
`{ id, characterId, name, desc, baseCost, costGrowth, maxLevel, perLevel }`. Requirements:
- `id` is `<char-lower>_<knob>` and unique across the table; `characterId` is one of the four
  `CHARACTERS` keys.
- Prices are BREADTH, not a gold sink: `maxLevel` 3 or 4, `baseCost` between 900 and 3200,
  `costGrowth` 1.5. No row may cost more than 3200 x 1.5^3 total, and you must print the full-price
  ladder for every row in your report. Do not inflate a single row to carry the catalogue.
- `perLevel` carries the effect. **Every effect must be a stat key the RUN actually consumes, or a knob
  you explicitly wire and prove.** Suggested intent (adjust only with a stated reason):
  KNIGHT: +max HP per level; a damage-facing knob. WITCH: +max mana per level; a mana-cost or
  chain-facing knob. ROGUE: +move speed per level; +starting potions. PALADIN: +max HP per level;
  +chest heal per level. For each row, name the CONSUMPTION SITE (file + line) that reads your key and
  print a before/after number proving the effect reaches run state. A row whose key nothing consumes is
  a DROPPED row, disclosed in the report — not shipped as decorative data.

**(2) THE SHOP SURFACE — a CHARACTERS door, because the owner wants it FOUND, not presented.**
- Add ONE `menuCard` door on the shop screen (same pattern as `src/main.js` :4498) labelled `CHARACTERS`.
- It lists the four characters with their unlock state, then a per-character screen shows that
  character's rows: `LV <n>/<max> · <cost> gold` or `MAXED`, using the SAME row/icon/re-render patterns
  `showShop()` already uses (`menuCard`, `shopIconCanvases`, `saveProfile(profile)` then re-render).
  Reuse the existing icon path; if a row has no authored icon, use the SAME fallback every un-arted row
  uses and DISCLOSE it — do not invent a second icon system, and do not add emoji.
- A LOCKED character (not in `profile.unlockedCharacters` / not owned per `grantCharacter`'s store):
  show the row but REFUSE the purchase, with the reason legible on screen. Disclose the choice you made.
- Buying goes through a NEW `buyCharacterUpgrade(profile, characterId, id)` in `src/meta.js` that mirrors
  `buyUpgrade` exactly: validate the row, cap at `maxLevel`, `upgradeCost(def, level)` gold check, debit
  `profile.gold`, and persist the level through the EXISTING accessor
  (`addCharacterUpgrade(profile, characterId, id, 1)`). No direct writes to `profile.characters[...]` —
  the whole point of the accessor seam is that every read normalises and every write validates.

**(3) THE RUN EFFECT — one pure helper, called at the ONE run seam and the ONE preview seam.**
- Add `applyCharacterUpgrades(stats, profile, characterId)` to `src/meta.js`: PURE, returns a NEW object,
  reads only that character's levels via `getCharacterUpgradeLevel`, adds nothing when the character has
  no levels. Call it IMMEDIATELY after `applyCharacter(...)` at `src/main.js` :5096 (run start) and at
  :4803 (the character screen's preview) so the preview cannot drift from the run. If a third call site
  applies character stats, include it and list it.
- The GLOBAL floor must be untouched: `applyMetaBonuses(profile.purchased)` keeps applying to every
  character exactly as today. Switching characters must reset the per-character portion and NOT the
  global one.

## NOT IN SCOPE

- Any change to `src/save.js` (no new schema key, no `PROFILE_VERSION` bump; the namespace and clamps
  already exist) and any edit to `test/test_save_v3_characters.mjs`.
- Any retune of `SHOP_UPGRADES` prices, `CHARACTERS.unlockCost`, or any balance number in the run.
- Specialisation/weakness design, character-select art, achievements tied to characters, the sim side of
  G19's acceptance ("report progression for a fresh vs a developed character") — that sentence is
  DEFERRED under the owner's standing measurement freeze at the top of the goals doc.
- Simulations, cohorts, seeds, rates, A/B arms. NONE. See FREEZE COMPLIANCE below.

## FILE OWNERSHIP (you are the only writer; keep the diff inside this list)

- `src/meta.js`, `src/main.js` — yours for this slice. `src/main.js` is the single-writer hotspot, so
  make the smallest edit that satisfies (2) and (3); do not refactor `showShop()` while you are in it.
- `test/test_g19_character_upgrades.mjs` (NEW) and `tools/verify_g19_characters.mjs` (NEW) — yours.
- NO edits to `src/save.js`, `src/escape/**`, `src/config.js` balance constants, `index.html` (unless the
  door genuinely needs a DOM element, in which case the pad-geometry tests are your responsibility and
  must stay green), or any test other than the two files above.

## ACCEPTANCE BAR (all of it; a builder self-report is not evidence)

A. `node test/test_g19_character_upgrades.mjs` — all checks pass, PRINTING (not summarising):
   the 8-row table with price ladders; the cost/cap behaviour; that a buy on KNIGHT leaves WITCH's rows
   at 0 and vice versa (isolation); that `applyCharacterUpgrades` is pure (input object unchanged) and
   returns the expected delta for a known level; and that the global floor
   (`applyMetaBonuses`) still applies to every character.
B. `tools/verify_g19_characters.mjs` — a REAL-browser functional proof in Chrome at **390x844 @dpr3**,
   with all 19 `TOUR_KEYS` set and `state.time > 1.0` ASSERTED BEFORE ANY MEASUREMENT (the house rule):
   reach the shop, open the CHARACTERS door and one character's row list by REAL taps, buy one row with a
   REAL tap, and assert (i) `profile.gold` debited by exactly the printed cost, (ii) the row re-renders as
   `LV 1/<max>`, (iii) the character's preview numbers moved while the other character's stayed at 0,
   (iv) the global layer's numbers are present on BOTH characters, (v) a locked character refuses the
   buy. Save one PNG per arm into `docs/art/g19-characters-2026-09-15/` and assert zero console errors.
C. `bash tools/run_suite.sh` => `redfiles=0`. If a test legitimately covers a contract this slice
   changes, RETARGET it and enumerate `file + line + why` in the report. Never weaken an assertion, never
   delete one, never turn one into a no-op. In particular, if a catalogue/economy test enumerates row
   tables (`test/test_economy_breadth.mjs`, `test/test_meta.mjs`, `test/test_art_lint.mjs`,
   `test/test_death_screen.mjs`), read it before assuming it is unaffected and report what you found.
D. Persistence proven through the REAL loader, not by reading the object: `loadProfile` (or the save
   module's own load path) after a simulated storage round-trip preserves the bought levels, and a save
   hand-written with a level ABOVE `maxLevel` is clamped on load. Print both results.
E. `git diff --stat src/save.js` is EMPTY and `PROFILE_VERSION` is still 8. If you find you must touch
   `src/save.js`, STOP and post `blocked:` with the reason instead of editing it.
F. House rules: no emojis anywhere, integer pixels, no new timers (`setTimeout`/`setInterval`), no
   fixed-dt assumptions, and the new code must be dt-frame-safe at both 60 and 120Hz.

## FREEZE COMPLIANCE (owner directive, top of the goals doc — read it)

No simulation, no cohort, no seed table, no rate derivation, no before/after balance measurement, and NO
command that runs longer than 60 seconds of wall clock. The acceptance above is all functional and fits
the cap; if a check you are tempted to add cannot fit in 60s, DROP it and say so rather than raising the
cap. Run `bash tools/run_suite.sh` FIRST on the tree you inherit and post `blocked:` if it is red before
you start.

## REPORT FORMAT (post to `hordes` when done)

`done: G19 slice 1 — <one-line verdict>` then, in order:
1. VERDICT, plainly: what works, and any row DROPPED because nothing consumes its key.
2. Raw evidence: the test command and its printed output; the browser verifier's measured assertions;
   the exact `bash tools/run_suite.sh` TREE/SUITE lines.
3. Files touched, with line ranges.
4. Prices/effects table actually landed.
5. A `COULD NOT VERIFY` section — anything you did not prove, stated rather than omitted.
Then END YOUR RUN cleanly.
