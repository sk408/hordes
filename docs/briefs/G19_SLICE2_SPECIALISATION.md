# G19 SLICE 2 — SPECIALISATION: THE MATRIX, THE COMBAT TERMS, THE LEGIBLE IDENTITY

Brief authored by the goal pilot (`subagent:spawnfa`) 2026-09-16, dispatched to `cli:glm-hordes-g8`.
Owner goal: G19 — PER-CHARACTER PROGRESSION + SPECIALISATION, `docs/HORDES_GOALS_2026-09-12.md` :2485.
Predecessor: SLICE 1 (`docs/briefs/G19_SLICE1_CHARACTER_UPGRADES.md`, landed on this tree) built the
per-character UPGRADE layer (table, CHARACTERS shop door, `applyCharacterUpgrades`).
This slice is PART (2) of the owner's goal — *"they generally aren't good at everything, so eventually you
switch characters because they are better at beating certain areas, but you are quite a bit weaker again"*.
It adds NO new purchase, NO new priced row, and NO schema key. It makes each of the four characters
MEASURABLY better against some enemies and MEASURABLY worse against others, and makes that identity
readable on screen BEFORE the player spends anything.

## DISPATCH ANCHOR CHECK — RE-RESOLVED on the tree you are receiving (HEAD `a52e84f`, dirty=8) at dispatch time 2026-09-16 01:05 UTC

- `src/meta.js` :1084 `CHARACTER_UPGRADES` (8 rows, slice 1 — KNIGHT/WITCH/ROGUE/PALADIN x2),
  :1102 `CHARACTER_UPGRADE_BY_ID`, :1111 `buyCharacterUpgrade`, :1133 `applyCharacterUpgrades`,
  :1154 `CHARACTERS` (KNIGHT free, WITCH 9000, ROGUE 2500, PALADIN 6000; per-character `mods` +
  `healOnChest` read by `applyCharacter`).
- `src/enemy_types.js` :35 `ENEMY_TYPES` — 10 types: CHASER :37, SWARMER :47, BRUTE :58, SPITTER :70,
  DASHER :88, WARLOCK :107, TICK :127, COLOSSUS :141, PILLAR :159, SHRIKE :182. Role flags already in the
  table: `chaff: true` (CHASER :39, SWARMER :49), `flying: true` (SHRIKE :185, consumed by `flyingZ`
  :432). WARLOCK's own comment :99-101 calls it the "dedicated ranged HUNTER"; COLOSSUS is the
  mini-boss tier (`src/main.js` :856/:887).
- THE TWO DAMAGE CHOKES (one per direction — this is the whole reason the slice is cheap):
  * OUTGOING (player -> enemy): `directHitMult(state, enemy, opts)` `src/rewrites.js` :621 — today it
    only multiplies for slow/rewrite conditions; called at `src/main.js` :1513 and :1817 as
    `e.hp -= dmg * directHitMult(state, e)`.
  * INCOMING (enemy -> player): `contactHitDamage(base, dmgMult, typeMult, chargeMult, maxHp)` `src/entities.js` :93 —
    PURE, `raw = base * dmgMult^CONTACT_POW * typeMult * chargeMult`, then
    `hit = min(raw, maxHp * HIT_CAP_FRAC)` with `HIT_CAP_FRAC: 0.5` (`src/config.js` :69). `typeMult` is
    ALREADY a per-enemy-type argument of the model, so an incoming specialty term has a named home.
- The identity surface: `src/main.js` :4894 `pilotKit(id)` (the kit panel, every number DERIVED from the
  run's own chain) and :4998 `showCharacters()`; the shop's per-character rows at :4631 `showCharacterShop`
  / :4650 `showCharacterRows` (the G19 slice-1 door, :4618).
- `src/save.js` :43 `PROFILE_VERSION = 8`; `test/test_save_v3_characters.mjs` already proves the
  `profile.characters` namespace tolerates future sibling fields.
If any anchor above is stale when you start, re-resolve it by grep and SAY SO in your report. If a symbol
is gone, post `blocked:` with the grep you ran rather than guessing.

## WHAT ALREADY EXISTS (measured, do not rebuild)

1. The four characters and their existing per-character `mods` — DO NOT retune them.
2. The per-character upgrade layer from slice 1 (table, buy, the pure `applyCharacterUpgrades`, the two
   seams, the CHARACTERS shop door). It stays exactly as it is; this slice does not edit its numbers.
3. The global shop (`SHOP_UPGRADES`, `applyMetaBonuses`) — the FLOOR that must keep applying to every
   character identically. Untouched.
4. `typeMult` on the incoming contact path, and `directHitMult` on the outgoing path — two existing,
   already-named seams. Use them; do not invent a third.

## SCOPE — build exactly these four things

**(1) THE FAMILY MAP — data, not a chain of ifs.** Add `enemyFamily(typeId)` (exported from
`src/enemy_types.js`, the file that owns the type table) classifying ALL TEN types into exactly four
families: `CHAFF`, `RANGED`, `FLYING`, `HEAVY`.
- Derive it from the table's OWN role flags where they exist (`chaff`, `flying`) and from the type's role
  comment where they do not. Where a flag does not decide a type (DASHER, TICK, PILLAR, BRUTE, COLOSSUS,
  SPITTER, WARLOCK), choose the family from that type's documented role and **print the full 10-row
  classification table with your reason per type** in the report.
- Exhaustive and pure: an unknown id returns `null` (never throws, never guesses a family).
- It must be a single table/lookup the tests can enumerate — not ten `if` statements scattered across
  call sites.

**(2) THE SPECIALTY TABLE — 4 characters x one STRONG family + one WEAK family.** Add
`CHARACTER_SPECIALTIES` to `src/meta.js`: `{ [characterId]: { strong: <family>, weak: <family> } }`,
with the EXACT assignment below (it is deliberate: every family gets exactly one character that is strong
against it and exactly one that is weak, so no family is uniformly trivial and no character is dominant):
- KNIGHT — strong `HEAVY`, weak `RANGED`   (tanks the slow bodies; ranged chip beats his guard)
- WITCH  — strong `CHAFF`, weak `FLYING`   (area clears the swarm; the flier goes over her ground AoE)
- ROGUE  — strong `RANGED`, weak `HEAVY`   (mobility closes the gap; heavy bodies punish her low HP)
- PALADIN — strong `FLYING`, weak `CHAFF`  (sustain shrugs off the flier; the swarm outpaces his healing)
Exact terms, so nobody has to guess the size: OUTGOING `strong = 1.15`, `weak = 0.92`;
INCOMING `strong = 0.88`, `weak = 1.12`. Terms live in ONE exported constant block beside the table
(no magic numbers at the call sites). You may move a term by at most 0.03 with a stated reason.
- NEUTRAL IS THE DEFAULT: a character facing a family it has no term for gets exactly 1.0 in both
  directions, and an unknown character/type must fall through to 1.0.

**(3) THE COMBAT TERMS — one choke per direction, none of the existing behaviour changed.**
- OUTGOING: the character's family term multiplies the damage the player deals to that enemy, applied
  through `directHitMult` or at its two call sites (`src/main.js` :1513, :1817). Both call sites must
  agree — a second, parallel damage path that silently skips the term is a BUG, and the report must state
  which sites you wired and which you deliberately did not (with the reason).
- INCOMING: the character's family term multiplies the raw contact hit through the existing `typeMult`
  argument of `contactHitDamage` (`src/entities.js` :93) — do NOT add the term inside the pure function
  unless you also prove neutrality (a trailing OPTIONAL parameter defaulting to 1 is acceptable; changing
  the meaning of the existing four arguments is not).
- **THE CAP IS THE TRAP, AND G18 ALREADY PAID FOR THIS LESSON.** `HIT_CAP_FRAC = 0.5` pins a fresh
  character's hits-to-kill at ~2, so an INCOMING weakness can be a structural no-op. You MUST print, per
  character per family, `raw` and the post-cap `hit` with and without the term, AND the hits-to-kill
  figure for the run's own `maxHp`. If a weakness is masked by the cap, that is a FINDING to report
  plainly (with the numbers) — do NOT "fix" it by touching `HIT_CAP_FRAC` (balance is frozen and that
  constant is out of your ownership).
- The terms are the character's IDENTITY, not a purchase: they apply on every run with zero purchases,
  they are NEVER written to the profile, and NO branch anywhere may refuse a run, a stage, a character or
  an unlock because of a specialty. Grep-proof that claim and print the grep.

**(4) THE LEGIBLE IDENTITY — readable BEFORE the player invests** (the owner's own stated mitigation:
"make each character's speciality legible BEFORE the player invests"). On `showCharacters()`
(`src/main.js` :4998) and on the per-character shop screen (`showCharacterRows` :4650), each character
shows two extra lines — its STRONG family and its WEAK family in plain words (e.g.
`STRONG: HEAVY — takes the big bodies` / `WEAK: RANGED — chip fire hurts`). Requirements:
- The copy is DERIVED from `CHARACTER_SPECIALTIES` + the family map at render time, never hand-typed per
  character in two places, so the screen cannot disagree with the combat terms.
- A LOCKED character shows its identity too (that is the point of legibility before investment).
- No emojis (owner rule), integer pixels, reuse the existing text/sheet patterns — do not add a second
  layout system.

## NOT IN SCOPE

- Any change to `src/save.js`, `PROFILE_VERSION`, or any test that is not yours. Specialty is STATIC
  character data; there is nothing to persist.
- Any retune of `SHOP_UPGRADES` prices, `CHARACTERS.unlockCost`, `HIT_CAP_FRAC`, ladder curves, or the
  slice-1 upgrade numbers. Balance is FROZEN by the owner's directive.
- New priced rows, new shop doors, new rewards, achievements, character-select art.
- The G19 sim sentence ("report progression for a fresh vs a developed character") — still DEFERRED under
  the owner's measurement freeze. See FREEZE COMPLIANCE.

## FILE OWNERSHIP (you are the only writer; keep the diff inside this list)

- `src/enemy_types.js` — the family map only.
- `src/meta.js` — the specialty table + terms.
- `src/main.js` — the two outgoing call sites and the two identity surfaces, smallest edit that works; do
  not refactor `showShop()`/`showCharacters()` while you are in them.
- `src/entities.js` — ONLY if you need the optional trailing parameter (default 1), with the neutrality
  proof.
- `test/test_g19_specialisation.mjs` (NEW), `tools/verify_g19_specialisation.mjs` (NEW),
  `docs/art/g19-specialisation-2026-09-16/` (NEW) — yours.
- NO edits to `src/save.js`, `src/config.js`, `src/escape/**`, `src/rewrites.js` balance constants,
  `index.html` (unless the copy genuinely needs a DOM node, in which case the pad-geometry tests are your
  responsibility and must stay green), or any test other than the two files above.

## ACCEPTANCE BAR (all of it; a builder self-report is not evidence)

A. `node test/test_g19_specialisation.mjs` — all checks pass, PRINTING (not summarising):
   (a) the full 10-row family classification; (b) that every one of the 10 types lands in exactly one
   family and `enemyFamily` is pure and returns `null` for junk; (c) the 4x4 matrix as a printed grid with
   each cell reading `x1.15`/`x1.00`/`x0.92`; (d) the COVERAGE + NO-DOMINANCE proof: every family has
   exactly one strong and one weak character, every character has exactly one strong and exactly one weak,
   and no character is strong in more than one family; (e) OUTGOING before/after damage for one known hit
   per character per family; (f) INCOMING `raw` and post-cap `hit` before/after per character per family,
   PLUS hits-to-kill, with an explicit finding line if the cap masks any weakness; (g) NEUTRALITY: with
   the specialty term neutral (unknown character, unknown type, or no term) every one of those numbers is
   byte-identical to today's - a regression proof, not an argument; (h) the PART (3) DEMONSTRATION:
   switching characters drops the per-character portion and KEEPS the global floor - print both stat
   blocks for a profile with global purchases + maxed KNIGHT rows, equipped as KNIGHT vs as WITCH.
B. `tools/verify_g19_specialisation.mjs` — a REAL-browser proof in Chrome at **390x844 @dpr3**, all 20
   `TOUR_KEYS` on this tree set (count them; the slice-1 builder found 20 where the brief said 19 - report
   the number you find) and `state.time > 1.0` ASSERTED BEFORE ANY MEASUREMENT: reach the character
   screen and one character's shop rows by REAL taps, READ BACK the rendered STRONG/WEAK text, and assert
   it equals the string derived from the table for at least two characters (one of them LOCKED); assert
   the derived copy matches for ALL four characters; assert zero console errors; save one PNG per arm into
   `docs/art/g19-specialisation-2026-09-16/` and label what each shows.
C. `bash tools/run_suite.sh` => `redfiles=0`, and the report quotes the `TREE`/`SUITE` lines. If a test
   legitimately covers a contract this slice changes, RETARGET it and enumerate `file + line + why`.
   Never weaken, delete or no-op an assertion. `test/test_meta.mjs`, `test/test_enemy_types*.mjs`,
   `test/test_stages.mjs`, `test/test_art_lint.mjs` are the likely ones - read before assuming.
D. `git diff --stat src/save.js` is EMPTY and `PROFILE_VERSION` is still 8. If you believe you must touch
   `src/save.js`, STOP and post `blocked:` with the reason instead.
E. House rules: no emojis anywhere, integer pixels, no new timers (`setTimeout`/`setInterval`), no fixed-dt
   assumptions, dt-frame-safe at 60 and 120Hz.
F. DISCLOSE, do not hide: any damage path that does NOT carry the term, any type whose family was a
   judgement call, and any term the hit cap makes unobservable.

## FREEZE COMPLIANCE (owner directive, top of the goals doc — read it)

No simulation, no cohort, no seed table, no rate derivation, no before/after BALANCE measurement, and NO
command that runs longer than 60 seconds of wall clock. Everything above is a pure-function or
unit-level check plus one bounded browser run; if a check you are tempted to add cannot fit in 60s, DROP
it and say so rather than raising the cap. Run `bash tools/run_suite.sh` FIRST on the tree you inherit and
post `blocked:` if it is red before you start. Inherited state at dispatch: `TREE @ a52e84f | dirty=8`,
`SUITE greenfiles=99 redfiles=0`, REDLIST empty - any red is yours.

## REPORT FORMAT (post to `hordes` when done)

`done: G19 slice 2 — <one-line verdict>` then, in order:
1. VERDICT, plainly: what works, plus any weakness the hit cap masks and any damage path left unwired.
2. Raw evidence: the test command and its printed output; the printed family table and 4x4 grid; the
   browser verifier's measured assertions and read-back strings; the exact `run_suite.sh` TREE/SUITE lines.
3. Files touched, with line ranges, and the grep proving no specialty is used as a gate.
4. The terms table actually landed, with the bounds check.
5. A `COULD NOT VERIFY` section - anything you did not prove, stated rather than omitted.
Then END YOUR RUN cleanly.

## HOUSE RULES (repeat, binding)

No emojis. Integer pixels. No new timers. No `src/save.js` edit. Do not run any git state command
(`commit`/`checkout`/`reset`/`stash`/`clean`) - leave the tree dirty and report the dirty count. Append a
timestamped heartbeat line to `/tmp/g19_slice2_progress.log` before and after every step that can exceed a
few seconds. Post `done:`/`blocked:` to the `hordes` channel FIRST with raw evidence, then the full report
per REPORT FORMAT above.
