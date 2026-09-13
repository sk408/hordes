# G10 — ENEMY GUIDE + RARITY TIERS (build-plan wave W6) — BUILDER BRIEF

**Read this file as the single source of truth and execute it.** Companion docs (read only, never edit):
`docs/BUILD_PLAN.md` (the wave sequence + standing rules), `docs/HORDES_GOALS_2026-09-12.md` §G10 (the
acceptance bar). This is a **feature** wave: it persists new per-profile data, adds a screen, and changes
spawn rates, so it must be measured, not assumed.

**House rules (non-negotiable).** Acquire `~/projects/agent-hub/sdk/agentlock` before you edit anything in
`/home/claude/projects/hordes` and **release it when you are done, including on failure**. Run
`agentlock release` FROM `/home/claude/projects/hordes` (releasing from another cwd silently reports
"already free" and leaves the lock held). **No `git commit/checkout/reset/stash/clean` — Remy owns
commits.** No emojis anywhere in the game. Integer pixels, no smoothing, no blur. Nothing may assume a
fixed dt (60Hz and 120Hz must both be correct). One writer per file: you are the only writer this wave.

## THE ACCEPTANCE BAR (goals doc, verbatim)

> **Reached when:** encounters persist per profile, the guide shows discovered vs undiscovered entries with
> real information, and rare tiers spawn at controlled, documented rates that the sims account for.
> NOTES: new enemy tiers change difficulty and loot, so this interacts with G5/G6 and must be measured, not
> assumed. Unknown entries should be tantalising (silhouette + "???"), not blank.

Owner's original ask: *"we could have an enemy guide of enemies you've encountered. have rare and extremely
rare enemies."*

---

## PART A — ENCOUNTERS PERSIST PER PROFILE (save schema v4 -> v5)

### A1. New file `src/encounters.js`

Mirror the proven namespace contract in `src/achievements.js` (read it first: `emptyAchievements`,
`normalizeAchievements`, `isValidNamespace`, `ensureAchievements`, `readNamespace`, the catalog +
`*_BY_ID` map). Same shape, same discipline.

**The catalog is DERIVED, never hand-copied.** Build it at module load from the real sources:

- base types — `Object.keys(ENEMY_TYPES)` from `src/enemy_types.js` (currently 9: CHASER, SWARMER, BRUTE,
  SPITTER, DASHER, WARLOCK, TICK, COLOSSUS, PILLAR);
- bosses — the `BOSSES` table at `src/bosses.js:347` (3: GRAVELMAW, CHOIR_MOTHER, PYRAXIS) **PLUS every
  `MIDBOSS` entry** (`src/bosses.js:423`, currently HERALD) — `spawnBoss()` sets `boss.bossId =
  desc.id` off both `pickBossForWave` and the MIDBOSS path, so BOTH sources must be in the catalog and
  the parity test must cover both. `BOSS_ORDER` (`src/bosses.js:411`) is the pick order, NOT the catalog;
- tiers — the rarity tier ids from PART C.

**Entry ids are namespaced** so an enemy id can never collide with a tier id:
`enemy:CHASER`, `boss:GRAVELMAW`, `tier:RARE`. A test must assert **id parity by construction**: every
`ENEMY_TYPES` key and every `BOSSES` id is covered exactly once, and no id is missing or duplicated.

**API (keep it small and pure where it can be):**

- `export const ENC_NAMESPACE_VERSION = 1;`
- `export const ENCOUNTERS` — the derived catalog `[{ id, kind: 'enemy'|'boss'|'tier', ref, name }]`
  plus `ENCOUNTER_IDS` / `ENCOUNTER_BY_ID` (mirror `ACHIEVEMENTS` / `ACHIEVEMENT_IDS` /
  `ACHIEVEMENT_BY_ID`).
- `emptyEncounters()` -> `{ v: ENC_NAMESPACE_VERSION, entries: {} }`.
  Entry shape (document it in the header comment):
  `{ [id]: { firstWave, firstAt, kills, bestWave, bestTier } }` — all integers, `bestTier` a tier id
  resolved through an ordering table (COMMON < RARE < ELITE < MYTHIC).
- `normalizeEncounters(raw)`, `isValidEncounterNamespace(ns)`, `ensureEncounters(profile)`,
  `readEncounterNamespace(profile)`.
- `recordEncounter(profile, id, { wave, at, tier } = {})` — creates the entry on first sight, increments
  `kills`, **maxes** `bestWave` and `bestTier`, never regresses. Must be cheap: a plain object write, no
  allocation per spawn after the first sighting, no array scans.
- `seenCount(profile)`, `totalEncounters()`, `bestiaryModel(profile)` ->
  `[{ id, kind, name, discovered, kills, firstWave, bestWave, tier, info }]` where `info` is **read off
  the real source modules at model-build time** (see B3) — `main.js` restates nothing.

**TWO HARD RULES (copy the achievements file's spine):**

1. **A discovered entry is NEVER dropped by validation.** A damaged entry repairs to discovered (and to
   `kills >= 1`), never to undiscovered. A save must never lose the player's bestiary.
2. **Unknown ids from a newer build are PRESERVED verbatim** so a save passing through an older build
   loses nothing.

### A2. `src/save.js` changes (v4 -> v5)

- `PROFILE_VERSION = 4` -> `5` (`SCHEMA_VERSION` is an alias — it follows automatically).
- Add a `VERSION_HISTORY` entry for v5 in the existing prose style ("G10 encounters namespace: ...").
- Add `MIGRATIONS[4]`: guarantee `plainObject(next.encounters)` and **NOTHING ELSE** — no encounter
  invented, no existing field touched, lossless for every v4 save. Present-but-garbage data is left for
  `validateProfile` to repair (one repair path, not two). Copy the shape of `MIGRATIONS[3]` exactly.
- `validateProfile`: add an `encounters` collection block mirroring the achievements block
  (`src/save.js` ~line 323 onward): sanitize ids against the derived catalog (every repair pushed into
  `repairs`), clamp `kills`/`firstWave`/`bestWave`/`firstAt` to finite non-negative integers, resolve
  `bestTier` through the tier table (unknown -> drop the field, not the entry), **preserve unknown sibling
  fields inside a surviving entry** and **preserve unknown ids**, and never un-discover.
- Export/import is already profile-wide — add an assertion in the test that `encounters` round-trips
  losslessly through the real export/import path.

### A3. The recording seams in `src/main.js` (spawn-time discovery)

Record at **SPAWN**, not at kill. "Enemies you've ENCOUNTERED" means it appeared in the arena and came at
you; kill-gating would hide a boss the player fled from, and would make the guide a scoreboard instead of a
discovery log. Put the call sites at:

- **TRUNK SPAWN** — `spawnWave(dt)` (`src/main.js` ~470-515). At the end of the pack loop, right after the
  elite-modifier stamp and immediately before/after `state.enemies.push(e)`: record `enemy:<typeId>` with
  `wave = Math.floor(state.time / 30)`, `at = state.time`, `tier = <the tier stamped in PART C>`. This one
  site covers every base type including elite variants and tier upgrades.
- **BOSS SPAWN** — `spawnBoss()` (`src/main.js` ~818-870). Right after `boss.bossId = desc.id` (~line 841):
  record `boss:<desc.id>`.

Do **not** record anywhere else: not in the update loop, not for split children (`elite_mods.splitChildren`
children are the parent's own kind and are already recorded), not for the finale's scripted bodies.

---

## PART B — THE BESTIARY SCREEN

**Mirror the trophy gallery EXACTLY.** It is the screen that shipped and is tested; do not invent a second
screen idiom. Read its implementation and its test before you write a line:
`src/render.js:1283 drawTrophyShowcase`, `src/main.js:3427-3540` (the screen functions),
`src/main.js:3721-3727` (the keyboard branch), `src/main.js:4595` (the `__TEST` seam),
`test/test_trophy_gallery.mjs` (the whole file — it is your test template).

### B1. `src/render.js` — `drawBestiary(g, state)`

Same contract as `drawTrophyShowcase`:
- a **full-view dark backdrop painted FIRST** so the canvas HUD cannot show through;
- the case in the HUD's OWN chrome vocabulary (`CONFIG.HUD.FRAME` / `CONFIG.HUD.PLATE`);
- the entry painted at the **LARGEST INTEGER scale that fits** its box, centered;
- **test seam:** `this.bestiary = { scale, x, y, w, h, id, discovered }` (null when nothing is selected) —
  geometry must be measurable off a recording 2d context, exactly like the gallery;
- reuse `drawGrid`'s optional integer `scale` (default 1, so every existing caller stays byte-identical):
  one NxN block per painted pixel, no smoothing.

### B2. `src/main.js` — the mode

- `showBestiary` / `closeBestiary` / `bestiaryStep(delta)` / `refreshBestiaryView()`, mode `'bestiary'`.
- Reached from a **BESTIARY card on the title**, labelled with the live count in the gallery's own voice
  (e.g. `BESTIARY — 4 / 13 discovered`); follow `menuCard('TROPHIES', ...)` at `src/main.js:2960`.
- The ring wraps over the display ids (`bestiaryDisplayIds(profile)`), PREV / NEXT / BACK (and ESC, and the
  arrow keys) exactly as the gallery does. `closeBestiary` restores the mode it was opened from.
- Add the `'bestiary'` branch next to the `'trophies'` branch in the key handler (`src/main.js:3721-3727`).
- Add `openBestiary: showBestiary, closeBestiary, bestiaryStep` to the `__TEST` object (`src/main.js:4595`)
  so the contract is testable without a DOM click per entry.
- **Overlay reset contract:** the gallery clears the 75% sheet for itself (`background: transparent`,
  `justify-content: flex-end`, chrome pushed to the bottom) and `openMenu()` resets both. Extend the SAME
  two hooks for the bestiary (**do not add a second reset path**) so the existing "a screen entered after
  the gallery gets its sheet back" assertion still passes.
- **Screen-chrome gate:** `chromeOn()` (`src/main.js:3963`) is true only in playing/finale, so
  `'bestiary'` is false BY CONSTRUCTION. Assert it directly AND through a real `syncChrome()` frame.
- **Tour sync (build-plan rule 9):** the FIRST-RUN TOUR hints list (`src/main.js` ~2667-2671, the
  `TROPHIES — every emblem...` row) enumerates the menu. Add the bestiary as a taught item (or record an
  explicit decision not to) — a recorded decision, not an oversight.

### B3. What an entry shows (and what it must NOT do)

**Undiscovered = tantalising, never blank.** Draw the **real silhouette**: the SAME code-drawn shape the
enemy uses in play (the LOOK contract in `src/enemy_types.js` — `resolveLook(id, 0)` gives
`{ body, trim, accent, shape, sizeMult }`; paint `shape` at `sizeMult` in ONE flat dark palette colour).
Name reads `???`. No stats, no behaviour lines. The player sees that something is there and how big it is.

**Discovered = real information, ALWAYS RESTATED FROM THE SOURCE MODULE.** `main.js` must not hardcode a
single enemy name, stat or behaviour string a second time:
- `name` and the real numbers straight off `ENEMY_TYPES[id]` — `hpMult`, `speedMult`,
  `contactDamageMult`, `xpMult`, `sizeMult`;
- behaviour lines derived from **the type's own fields** — e.g. `packSize` (SWARMER), `holdDist` /
  `retreatDist` / `fireRange` / `fireInterval` / `projDamage` (SPITTER), the drain/latch contract (TICK),
  the telegraph (WARLOCK), the mini-boss tier (COLOSSUS). Derive them; if a type has no such field, print
  **nothing** rather than inventing flavour text;
- boss entries read `src/bosses.js` (name / flavor / header) — never restated;
- tier entries (PART C) state the tier's own documented rate and what it does;
- the player's own counters: `kills`, `firstWave`, `bestWave`.
- No emojis. Legible at the phone viewport — reuse the HUD's own text size ladder; do not invent a new one.

---

## PART C — RARE AND VERY RARE ENEMY TIERS

### C1. New file `src/rarity.js`

A NEW file so no other track can collide with it. It owns: the tier table, the roll, and the stamp.

```
export const RARITY = {
  COMMON: { id: 'COMMON', name: 'Common', chance: <the rest>, tier: 0, ... },
  RARE:   { id: 'RARE',   name: 'Rare',   chance: <e.g. 0.02>, tier: 1,
            hpMult, xpMult, dropBonus, tell, ... },
  MYTHIC: { id: 'MYTHIC', name: 'Extremely Rare', chance: <e.g. 0.003>, tier: 2, ... },
};
```

- **Rates are constants with the reasoning in the comment, and they are MEASURED, not asserted.** Roll the
  tier decision **100,000 times through the REAL function** and print the measured rate next to the
  constant, with a documented tolerance (e.g. within 0.02% absolute at N=100k). Any rate you write down
  must have that measurement behind it.
- The roll happens at the SAME trunk spawn site (`spawnWave`, PART A3) and is stamped onto the enemy
  (`e.rarity = tier.id`) before `state.enemies.push(e)`.
- The tier **must be visible on the sprite** — reuse the elite visual vocabulary already in `src/render.js`
  (do not invent a new render language), and give the tier its own tell if the elite tells cannot express
  it. Tiers get **NO new sprites** (9 new art sets is not this wave).
- A tier upgrade must be compatible with the elite flag: an enemy can be elite AND rare; make that compose
  rather than conflict, and record `bestTier` on the encounter entry.
- **NOT tier-rolled:** bosses, split children, and the COLOSSUS (it is already the mini-boss).

### C2. The ELITE tier already exists — document it, do not rebuild it

`src/elite_mods.js` + `C.SPAWNER.ELITE_CHANCE 0.05` after `C.SPAWNER.ELITE_TIME 60s`
(`src/config.js:348-349`), ramping to `C.LADDER.ELITE_MAX 0.12` by `C.LADDER.ELITE_FROM 600s`
(`src/config.js:492-493`, formula at `src/config.js:566-573`). The guide's TIER section must list ELITE by
**reading those constants**, and the test must assert the guide's numbers come from them (import the
constants; never retype 0.05 / 60 / 0.12).

### C3. Numbers must not break the game's stated intent

The owner's design intent (goals doc, standing constraints): *players lose most runs early, feel weak at
the start, and progress through knowledge + shop purchases. The draft is the game.* Tier hp multipliers
must be honest and small enough that PART D's invariants survive. Report the measured before/after.

---

## PART D — THE SIMS MUST ACCOUNT FOR THE TIERS

New enemy tiers change difficulty and loot, so this is not optional.

- `tools/draft_sim.mjs` and `tools/balance_sim.mjs`: model the rarity layer — at minimum the extra hp
  (which lengthens kills) and the extra drops (which shift gold). **If the model cannot honestly price
  something, price it at 0 WITH the reason in a comment** (the honest-zero precedent already in
  `tools/draft_sim.mjs` for focus / `once`).
- Surface the measured tier rate in the sim's own output so the number is checkable, not implied.
- **Invariants that must STILL hold, measured (asserted in the new test files AND re-measured in the sim):**
  * a bad draft can still fail — 100% of bad runs die before the finale;
  * good beats bad on **>= 3/5** minute-10 metrics;
  * one bad pick never loses a run — bar **>= 0.8x**;
  * nothing about the run-length/difficulty shape moves in a way you cannot report.
- **Report measured before/after numbers** for the tier addition: mean survival, median, gold/run —
  before = this tick's tree, after = yours, **60 runs/cell, seed 4242**, the same cells `draft_sim` already
  prints (OFF/ON x GREED-DAMAGE / ADVERSARIAL-BAD / SURVIVAL, luck 0 and luck 5).

---

## TESTS (new files, mirrored on the shipped ones — no weakening, no no-op)

- **`test/test_encounters.mjs`** — catalog parity by construction (every `ENEMY_TYPES` key + every `BOSSES`
  id exactly once; namespaced ids unique), record semantics (first sight, kill counting, `bestWave` max,
  tier max, no regression), the **never-un-discover** repair rule, unknown-id preservation, v4 -> v5
  migration, future-version refusal + recovery preservation, corrupt payload safety, export/import
  round-trip, and **the real seam**: a booted run that spawns enemies records them, and a boss spawn
  records its `bossId` (`test/_harness.mjs` is the boot helper; `test/test_achievements.mjs` is the
  namespace-test template).
- **`test/test_bestiary.mjs`** — screen geometry off a recording 2d context (integer scale >= 1, the largest
  that fits, centered, inside the view, dark full-view backdrop painted FIRST), discovered vs undiscovered
  masking (masked = `???` + no stats; discovered = the real module numbers), the ring wrapping across every
  display id, the overlay reset contract asserted from a screen entered AFTER the bestiary, `chromeOn()`
  false in `'bestiary'` (directly + through a real `syncChrome()` frame), and the tier/doc numbers being
  the imported constants.
- **`test/test_rarity.mjs`** — the tier roll measured at N=100k against the documented tolerance, the stamp
  at the REAL spawn site (rolled deterministically/forced), no tier on bosses / colossus / split children,
  dt-correctness (tier logic must not assume a fixed dt), and the sim invariants in PART D.
- Do **not** modify existing test assertions to accommodate this wave. If an existing test breaks, the wave
  is wrong, not the test. (Tier changes to `test/test_wall_loot.mjs` / `test/test_pilot_grind.mjs` style
  behaviour assertions must keep passing.)

## VERIFY BEFORE YOU REPORT (your own runs — paste the raw output into the doc entry)

1. `bash /tmp/run_all.sh` -> must end **`FAIL=0`**; run it **three times**.
2. `for i in $(seq 1 40); do node test/test_rewrites.mjs >/dev/null 2>&1 || echo "FAIL $i"; done` ->
   **zero** failures (this tree had a ~17% flake, closed in the last wave; keep it closed).
3. **Phone viewport check** — `tools/verify_g10_bestiary.mjs` (mirror `tools/verify_g8_rewrites.mjs`) at
   **390x844 @dpr3**: open the bestiary on a FRESH profile (all entries masked) AND on a profile with
   encounters seeded, assert entries are in-viewport and no caption is clipped, and save a PNG to
   `docs/art/browser-verify-2026-09-12/g10-bestiary-phone.png`.
   **There is NO vision model reachable from this host** — the verdict is DOM geometry + pixel samples.
   Say exactly that in your report. Do not claim a vision read.
4. Report **measured numbers, not intentions**, and put everything you could not verify under
   **COULD NOT VERIFY** with the reason.

## DEFINITION OF DONE

- Encounters persist per profile; a v4 save migrates and keeps everything; corrupt/unknown payloads are safe.
- The guide renders discovered vs undiscovered entries, with real per-enemy information and real silhouettes.
- Rare + very rare tiers exist at documented rates, measured (not asserted), visible on the sprite, and
  modelled in the sims.
- The full suite is green 3x; the 40-run flake loop is clean; the balance invariants in PART D still hold
  with before/after numbers.
- The phone PNG is on disk with an honest DOM-geometry verdict.
- Your report states what landed, the measured before/after, and what you could NOT verify.
