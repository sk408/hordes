# G11 — TIMED ACHIEVEMENTS + CHALLENGE MODES (build-plan wave W9) — BUILDER BRIEF

**Read this file as the single source of truth and execute it.** Companion docs (read only, NEVER edit):
`docs/BUILD_PLAN.md` (wave sequence + standing rules) and `docs/HORDES_GOALS_2026-09-12.md` §G11 + §G23.
This is a **feature** wave: it grows the achievement catalog, adds a selectable run mode, and touches the
bestiary screen. Measure it, do not assume it.

## HOUSE RULES (non-negotiable)

- Acquire `~/projects/agent-hub/sdk/agentlock` BEFORE you edit anything in `/home/claude/projects/hordes`,
  and **release it when you are done, including on failure.** Run `agentlock release` FROM
  `/home/claude/projects/hordes` (from another cwd it wrongly reports "already free" and leaves it held).
- **No `git commit/checkout/reset/stash/clean` — Remy owns commits.** Do not commit.
- No emojis anywhere in the game. Integer pixels, no smoothing, no blur. Nothing may assume a fixed dt
  (60Hz and 120Hz must both be correct). One writer per file: you are the only writer this wave.
- Never weaken an existing assertion to go green. If an existing test breaks, YOUR wave is wrong.
- Reply `TASK-STARTED` first, then report `done:` with what landed, MEASURED numbers, and everything you
  could NOT verify. Keep it honest: a claim is not evidence.

## THE ACCEPTANCE BAR (goals doc §G11, verbatim)

> **Reached when:** at least one timed achievement is completable and verified, and at least one challenge
> mode is selectable, clearly distinguished from a standard run, and does not corrupt normal progression.

Owner's original ask, verbatim: *"have timed acheivements. have challenge play modes"*.

Two hard constraints from the standing rules: **every new system updates the reference surfaces** (the
hints panel + HOW TO PLAY — the wave-25 audit already found 8 conditionally-true claims there), and **the
first-run tour must stay in sync** (each new screen/system is either taught or a RECORDED decision to leave
it to discovery — not an oversight).

---

# PART A — TIMED ACHIEVEMENTS (required)

## A1. The semantics — state them exactly, and never lie to the player

A timed achievement is a **conjunction of a stat threshold and a clock ceiling inside ONE run**. The
honest primitive this game already has at the single settle funnel is the run summary (`state.time` plus
the end-of-run stat totals), so the semantics are:

> a run whose stat reached `n` and whose OWN CLOCK, at the moment the run settled (death, win, or a
> deliberate exit), was `<= within` seconds.

Implement EXACTLY that. Do **not** invent a new per-wave timestamp system, and do **not** claim
"reached wave 5 before 3:00" in any player-facing string — write the goal text so it is true as
implemented, e.g. `Wave 5+ in a run that ended under 3:00`.

## A2. New goal kind `'run'` in `src/achievements.js`

Catalog shape (declarative, no functions — the catalog must stay auditable/introspectable):

    { id: 'WAVE8_UNDER_5MIN', goal: { kind: 'run', stat: 'wave', n: 8, within: 300 }, unlock: {...}|null }

Add**4** timed achievements. Use these, at least two of them carrying an unlock that already exists
(`shopRow` / `character` / `weapon` / `elite` — NO new unlock kinds, NO new art):
- `WAVE5_UNDER_3MIN` — `{ kind:'run', stat:'wave', n:5, within:180 }`
- `WAVE8_UNDER_5MIN` — `{ kind:'run', stat:'wave', n:8, within:300 }`
- `KILLS_500_UNDER_5MIN` — `{ kind:'run', stat:'kills', n:500, within:300 }`
- `GOLD_600_UNDER_6MIN` — `{ kind:'run', stat:'gold', n:600, within:360 }`

## A3. Measurement, through the ONE existing code path

`measuredValue(profile, ach)` gains `case 'run':` returning the best value recorded for that
`stat` at that `within`. `goalMet()` must stay the single `measuredValue >= n` path — no new branch there.

Persist it as a SIBLING of `totals` inside the achievements namespace, NOT inside `totals` (every
`TOTALS_ZERO` value is an int and is coerced with `intOr`; an object there would be poisoned to `0`):

    { v, earned, progress, totals, timed: { '<stat>@<within>': <best stat value> } }

- `emptyAchievements()` -> `timed: {}`.
- `ACH_NAMESPACE_VERSION` **1 -> 2**, with a documented repair: a payload with no `timed` (or a garbage
  one) normalises to `{}`; only keys matching the live catalog are kept; values via `intOr`; an **earned
  stamp is never dropped** (that rule already exists — keep it).
- In `recordRun`, fold the timed bucket from the RUN SUMMARY (`r`) using ONE helper
  `summaryStat(r, stat)` that maps `wave|kills|gold|chests|bossKills|evolutions|weaponLevel` and returns
  **0 for an unknown stat** (so a typo measures 0 instead of throwing). For each catalog `'run'` goal:
  `if (intOr(r.time,0) > 0 && intOr(r.time,0) <= g.within) timed[key] = Math.max(timed[key]||0, summaryStat(r, g.stat))`.
- Add an audit next to `auditUnlockTargets()` (same spirit: fail loudly at test time, not silently at
  runtime) that asserts every `'run'` goal's `stat` is a key `summaryStat` actually knows, and that every
  `within` is a positive integer. Export it.
- `goalText()` must render the timed goals honestly (e.g. `Wave 8+ in a run under 5:00`) so the gallery and
  the toasts cannot show a sentence the measurement does not honour.

## A4. `src/save.js` — verify, do not assume

`validateProfile` may reconstruct the achievements block field-by-field. **Check it.** If it rebuilds the
block, the new `timed` field must survive validation; if it validates through `normalizeAchievements`
(then it is inherited), say so explicitly in your report. A profile-level field is NOT being added this
wave, so `PROFILE_VERSION` should stay **5** — if you find you must bump it, that is a scope change:
stop and report it rather than quietly growing the schema.

---

# PART B — CHALLENGE MODES (required)

## B1. New file `src/challenges.js`

A small, pure, declarative module (no DOM, no game state — so a headless test can own it):

    export const DEFAULT_CHALLENGE_ID = 'STANDARD';
    export const CHALLENGES = [
      { id: 'STANDARD',   name: 'STANDARD RUN', blurb: 'the game as designed',              rules: {} },
      { id: 'ONE_WEAPON', name: 'ONE WEAPON',   blurb: 'one weapon slot, the whole run',    rules: { weaponSlots: 1 } },
      { id: 'NO_POTIONS', name: 'NO POTIONS',   blurb: 'no potions, start to end',          rules: { potions: 0 } },
    ];
    export const CHALLENGE_IDS = ...; export const CHALLENGE_BY_ID = ...;
    export function challengeOf(id)        // TOTAL: unknown/missing id -> the STANDARD entry
    export function isStandard(id)         // true for a missing/unknown id too
    export function challengeRules(id)     // {} for standard
    export function nextChallengeId(id)    // the cycle used by the title menu, wraps
    export function describeChallenge(id)  // the one-line player-facing string

**The modes must be RULE changes, not difficulty numbers.** This is deliberate: the opt-in difficulty axis
already exists and is `src/heat.js` (HEAT_CAP / heatMultipliers / goldMult, and G24's rule that heat must
PAY MORE). Do not duplicate it, do not touch heat.js, and do not add a stat multiplier mode. Two rule
modes plus STANDARD is the slice.

## B2. Application — ONE seam per rule, applied at run start

In `src/main.js` `startRun()` (line ~3229), the two existing start-of-run seams are:
- `state.baseWeaponSlots = startWeaponSlots(profile);` (then `state.weaponSlots = state.baseWeaponSlots;`)
- `const pots = startPotionCount(profile); ... p.potions = { hp: pots, mp: pots };`

Apply the selected mode's rules THERE (clamp weapon slots to the rule value; force potions to the rule
value), reading the mode from ONE run-scoped field `state.challenge` (the id). Prove single-site with a
grep in your report; no other place may change slots/potions for a mode.

## B3. Selection + "clearly distinguished from a standard run"

- Title screen (`showTitle()`, line ~2987): add ONE menu card, `CHALLENGE`, whose sub-line names the
  CURRENT selection and which cycles on press (`menuCard` is at line ~2635; follow the existing cards'
  style, no emojis). The pending choice lives in a module-level `let pendingChallenge = 'STANDARD'` in
  `main.js` — **session-scoped, NOT persisted** (see B4).
- The selected id is stamped onto `state.challenge` at `startRun()`.
- Distinguish it in-run and at the end: a HUD badge line naming the mode while a run is live (the text-HUD
  / badge row already exists — extend it, do not add a new overlay), and the end-screen lead line must
  name the mode (`endRun()` line ~2463, `die()` and `runSurvived` feed the same end screen). A STANDARD
  run must render byte-identically to today apart from nothing: the badge is only added when the mode is
  non-standard.

## B4. Progression integrity — this is the bar, so TEST it, do not assert it

1. **Nothing about a challenge run is persisted.** No new profile field, no schema bump, no
   `localStorage` key. Gold settles EXACTLY as a standard run with the same kills/time — no bonus, no
   penalty. (G24/heat owns "harder pays more"; challenge modes are a constraint, not a difficulty dial.)
2. **A challenge run is a real run**: `recordRunAchievements()` still runs unchanged, so nothing is faked
   and nothing is double-counted.
3. **No leakage**: the mode applies only to the run that selected it, and a reload returns to STANDARD.
   A test must deep-compare the profile across a challenge run.
4. The mode is visible on the end screen so a challenge result is distinguishable from a clean clear.

## B5. Reference surfaces + tour (standing rules, not optional)

- `HOW TO PLAY` and the key-hints panel must name the CHALLENGE mode selection (rule 8: every new system
  updates them). Keep the copy short and plain.
- Tour decision, recorded in your report: CHALLENGE is **left to discovery** (no new coachmark) — say so
  explicitly rather than leaving it unstated. Confirm the tour/hints do NOT appear over the title screen
  (`chromeOn()` is `state.mode === 'playing' || state.mode === 'finale'`, line ~4101 — you are not adding
  a mode that needs chrome, which is the point: state that plainly).

---

# PART C — G23's REMAINING OPEN ITEM: THE BESTIARY "WHICH ENTRY AM I MISSING" FILTER (required, do it LAST)

G10 landed the bestiary (kill counter, stat rows, masked slots, flavour, rarity tiers) but left this open
in `docs/HORDES_GOALS_2026-09-12.md` §G23. Close the FILTER only.

- `bestiaryDisplayIds()` (line ~3598) becomes filter-aware: **ALL** (default) and **MISSING** (undiscovered
  entries only), driven off the same `bestiaryModel(profile)`.
- `showBestiary()` (line ~3638) gets ONE extra card (e.g. `FILTER: ALL/MISSING`, cycling on press) and the
  key handler at line ~3859 gets the matching key. The ring (`refreshBestiaryView`, ~3606) must wrap within
  the FILTERED list, and `bestiaryIdx` must be normalised there (as it already is) so switching filters can
  never index out of range.
- The empty case (MISSING with everything discovered) must render an HONEST state — a clear
  "everything discovered" line, no broken ring, PREV/NEXT must not crash.
- Keep the shipped contracts: the overlay-reset hook, `chromeOn()` false in `'bestiary'` by construction,
  the `__TEST` seam (line ~4737) extended with the filter accessor, and the `drawBestiary` render path
  (`render.js`) reading only the view object it already gets.

**NOT in scope (do not build it):** the unlock-tied HOOK. The data does not support it today — no
achievement names a specific enemy or boss, so any "TIED: ..." line would be invented. The pilot has
recorded this as a design call. Do not fake it and do not add a new relationship to make it work.

---

# TESTS (write these; extend existing ones, never weaken them)

- **`test/test_timed_achievements.mjs`** — earn `WAVE5_UNDER_3MIN` from a synthetic summary
  (`{ wave: 5, time: 150, ... }`) and assert BOTH the earn stamp and the granted unlock; the negative
  (same wave, `time: 400`) must not earn it; the boundary (`time` exactly `=== within`) per the rule you
  implemented (state which way it falls); progress math through `measuredValue`; a save with no `timed`
  bucket repairs to `{}` and keeps every earned stamp; a `'run'` goal with a bogus `stat` measures 0 and
  the new audit catches it. Use `test/test_achievements.mjs` as the namespace template.
- **`test/test_challenges.mjs`** — catalog integrity (unique ids, STANDARD present, `challengeOf` total
  over garbage input, `nextChallengeId` wraps both ways); the rules applied at the REAL `startRun()` seam
  via `test/_harness.mjs` (`ONE_WEAPON` -> exactly 1 weapon slot, `NO_POTIONS` -> 0 potions, STANDARD ->
  today's numbers unchanged); no leakage across two consecutive runs; a deep profile comparison proving a
  challenge run mutates nothing persistent; `describeChallenge` names the mode.
- **`test/test_bestiary.mjs`** (EXTEND) — filter accessors, default ALL, MISSING on a fresh profile lists
  every id, the all-discovered empty state, ring wrapping inside the filtered list, and the overlay-reset
  contract still holding.

# VERIFY BEFORE YOU REPORT (your own runs — paste the raw output into your report)

1. `bash /tmp/run_all.sh` -> must end **`FAIL=0`**. Run it **three times**.
2. `for i in $(seq 1 40); do node test/test_rewrites.mjs >/dev/null 2>&1 || echo "FAIL $i"; done` -> zero
   failures (this tree had a ~17% flake; keep it closed).
3. **Balance must be UNCHANGED for the standard path.** Run `node tools/balance_sim.mjs` (and
   `tools/draft_sim.mjs`) before and after and report the before/after numbers. Standard runs must not
   move. If a number moves, find out why before reporting.
4. **Phone viewport** — write `tools/verify_g11_challenges.mjs` mirroring `tools/verify_g10_bestiary.mjs`
   (camoufox, real browser, **390x844 @dpr3**): assert the CHALLENGE title card, the in-run mode badge and
   the bestiary filter chip are all in-viewport and unclipped, then save a PNG to
   `docs/art/browser-verify-2026-09-12/g11-challenge-phone.png`. **There is NO vision model reachable from
   this host** — the verdict is DOM geometry + pixel samples. Say exactly that; do not claim a vision read.

# DEFINITION OF DONE

- 4 timed achievements exist, measurable, and at least one is EARNED by a real test path with its unlock granted.
- A challenge mode is selectable from the title screen, visible in-run and on the end screen, and a
  STANDARD run is unchanged (numbers, not intentions).
- A challenge run persists nothing and leaks nothing (deep-compare proven).
- The bestiary filter works, wraps, and has an honest empty state; the HOOK is explicitly NOT built.
- Suite green 3x, 40-run flake loop clean, phone PNG on disk with an honest DOM-geometry verdict.
- The agentlock is released. No commits made.
