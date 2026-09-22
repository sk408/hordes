# BRIEF — VS-vs-HORDES balance comparison + balance plan (DOCS ONLY)

## Context

We hold a fully extracted data spec of Vampire Survivors 1.16.107 (staged in-tree at
`docs/vs_ref/`): `vs_ref/spec/` = SPEC.md + 8 category specs, `vs_ref/datapack/` =
the raw JSON TextAssets every table cites (CHARACTER_DATA, WEAPON_DATA, ENEMY_DATA,
POWERUP_DATA, ITEM_DATA, STAGE_DATA, ...). VS schema authority: `dump.cs` line
numbers cited in the specs.

HORDES is this repo (branch tools/dev-editor): the game itself lives in `src/`
(`config.js` registries, `weapons.js`, draft/upgrade registries, enemy definitions,
economy numbers), pacing analysis in `docs/PACING.md`, the slice/design-intent ledger
in `docs/DEV_EDITOR_PLAN.md`, and measurement tooling in `tools/`
(`real_loop.mjs`, `economy_ledger.mjs`, `draft_sim`-family, telemetry `runs.jsonl`).

## Task — produce TWO documents, nothing else

1. **`docs/BALANCE_VS_COMPARE.md`** — category-by-category side-by-side of how the
   two games define and scale the same systems: weapons (base power, per-level
   growth shape, cost-vs-power curve, evolutions/upgrade paths), enemies (hp/damage
   scaling, per-kill xp pacing vs player level curve), characters (stat modifiers,
   unlock curves), xp/level curve (functional shape: VS is
   `min(5.0+1.5*floor(L/20),8.0)*L^2` — how does hordes' requirement curve compare
   in shape?), shop/meta-shop (cost curves, rank limits, what power is buyable),
   draft/level-up pool (pool size, rarity/offer weights, what a pick is worth).
   For EACH category state: what VS does, what hordes does (cite file:line in
   src/), and the structural differences that matter for PACING — i.e. where the
   two games' answer to "what does minute 10 feel like" diverge.
2. **`docs/BALANCE_PLAN.md`** — an ordered, actionable plan to improve hordes
   balance, where every item names: the observation that motivates it (cited to the
   comparison), the proposed change, HOW IT WILL BE MEASURED, and a status flag:
   `MEASURABLE-BY-TELEMETRY`, `NEEDS-REAL-LOOP-PROOF`, or **`OWNER-RULING-REQUIRED`**.

## BINDING doctrine (from the owner — violating any of these invalidates the plan)

- **Real-loop runs are ground truth; analytic sims are cheap pre-screening only,
  never the verdict** ("computer time is not lived time"). Autoplay at 8x with
  snapshots is the intended instrument. Any plan item's measurement must route
  through real-loop/telemetry, not a sim number alone.
- **The point of the comparison is DIAGNOSTIC, not prescriptive.** Do not propose
  copying VS values into hordes. VS numbers describe a different game; use them as
  a lens to find where hordes' own numbers are unexamined, internally inconsistent,
  or pacing-pathological BY HORDES' OWN STATED DOCTRINE. Every proposed change must
  be justified from hordes-side evidence first; VS is corroboration.
- **Never simplify or "fix" protected design intents** — read the design-intent
  sections of `docs/DEV_EDITOR_PLAN.md` first. Specifically: the ONE OF EACH draft
  card (early accelerator / late anchor / skill-tester / idle-catcher) is protected
  on all four fronts; idle/AFK pacing (6s auto-pick delay) is deliberate and pacing
  asks go LONGER never shorter; buy-back is dev-only on purpose; graphs stay
  exogenous; investment accounting classification (shop/character/permanent in,
  purse/shrine/in-run sinks out) is fixed. Anything that touches these gets
  `OWNER-RULING-REQUIRED`, not a recommendation.
- **Investment/granted-vs-earned**: snapshots must separate granted from earned
  power; don't propose analysis that conflates them.
- Evidence rules: every hordes number cites file:line; every VS number cites its
  `vs_ref/` path. Unverifiable claims go in a GAPS/ASSUMPTIONS section. Brief output
  over essays — tables and bullet rows, no prose padding.

## Constraints

- **DOCS ONLY: do not modify anything under `src/`, `test/`, or `tools/`.** This
  worktree is served live; the only files you may write are the two docs above
  (plus, if needed, files under `docs/` only).
- Do NOT run any `git` command. Do NOT run the test suite (docs-only change;
  the coordinator handles landing).
- Work only inside this directory (sandbox blocks external paths and a blocked
  path kills the run — do not reference paths outside this repo).
- No emojis in the docs.

## Deliverable summary (print at the end)

Counts: comparison categories covered, plan items by flag (MEASURABLE /
NEEDS-REAL-LOOP / OWNER-RULING), GAPS listed, file paths written.
