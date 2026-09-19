# BRIEF: S1 shrine double-sell — two altars <26px apart sell BOTH in one frame

House rules: one writer (you hold the agentlock — ACQUIRE it first; RELEASE it when
your run ends, the kimi lane has leaked it twice). No git state commands. Never weaken
an assertion to go green; every retarget enumerated as file + line + why. 60s wall cap
per command. Owner's taste: no emojis, pixel-art integrity. The orchestrator owns
commits; leave the tree dirty and report.

## The defect (builder-proven, pilot-confirmed by reading the code)

seedShrines (src/shrines.js:48) scatters SHRINE_WORLD_COUNT=3 altars uniformly over
the +-(GROUND.RIM-40) box with NO minimum separation. The builder measured ~0.227% of
seeds place two altars <26px apart (the purchase radius). The purchase loop
(src/main.js:3209-3241) iterates EVERY shrine and sells EACH one whose centre is
within 26px of the player IN THE SAME FRAME — so a player who walks onto an
overlapping pair intending one purchase gets debited for two (wave-0 example:
60 + 75 = 135 gold in one frame) and both altars go dark. The blessing rolls are
repeat-free and cached per shrine, so the second sale is a real blessing the player
never chose to buy. This is a shipped defect reachable on real seeds, not a
theoretical one.

## The design decision (made by this brief; the owner can relitigate)

Fix it in the PURCHASE PATH, not the seeding:
- DO NOT touch src/shrines.js. Positions stay byte-stable for every seed, the
  "exactly 2 rng draws per shrine, then ZERO draws for the rest of the run"
  determinism contract (src/shrines.js:42-47 comment) is untouched, and the fix
  covers any future shrine count/config change automatically.
- Add a re-arm latch: after any SUCCESSFUL shrine purchase, no further shrine
  purchase may happen until the player has been MORE than 26px from EVERY unsold
  shrine at least once (then the latch clears). One boolean on run state is enough
  (e.g. state.shrineRearm). Walking away and coming back re-arms; standing still
  between two altars buys exactly one.
- The latch is set ONLY on a successful debit. The broke-toast path and the
  blessing-pool-exhausted darkening (sh.used = true without a sale) do NOT set it.
- The existing state.shrine view-advance (src/main.js:3237-3240) keeps working
  exactly as today.

## Scope

1. src/main.js — the purchase loop at :3209-3241: implement the latch. Keep the
   loop shape; do not reorder the blessing roll/cache semantics.
2. state init — the latch field initialised where state.shrines is seeded
   (src/main.js:7312-7315 region); per-run only, no save-schema change, no
   persistence.
3. test/test_s1_shrines.mjs (or a new test file if it fits the house layout
   better) — a deterministic regression test:
   a. FIND a real colliding seed: scan integer seeds through the REAL
      mulberry32(choiceSeed ^ 0x5eed) + seedShrines path until two altars land
      <26px apart (~1 in 440 seeds, sub-second). Print the seed.
   b. Prove the defect shape on the PRE-FIX semantics is gone post-fix: drive the
      player onto the pair (the existing test seams for moving the player/forcing
      position are fine — read test_s1_shrines.mjs first and reuse its idiom) and
      assert EXACTLY ONE altar is used and the purse was debited EXACTLY ONE cost
      after the contact frame(s).
   c. Assert the re-arm: move the player >26px from all unsold shrines, then back
      onto the second altar — NOW it sells (second debit, both used).
   d. Assert the broke path does NOT set the latch (player with insufficient purse
      on a pair: zero sales, zero latch; top up off-seam, still standing: the first
      sells only after exit-and-reenter... if that is awkward to stage, stage the
      equivalent single-altar version and say so).
4. Existing test_s1_shrines.mjs and test_shrines.mjs must pass UNMODIFIED. If one
   genuinely encodes the old double-sell, that is a retarget — enumerate it
   (file + line + why); never silently weaken.

## Acceptance bar

- node test/<the regression file> — green, 5/5 standalone runs.
- bash tools/run_suite.sh — greenfiles full, redfiles=0, TREE line included.
- grep proof src/shrines.js is untouched (git diff --stat shows no shrines.js).
- Report: the colliding seed found, the measured before/after (before = both sold
  one frame, after = one + re-arm), the purse debits observed in the test, any
  retargets enumerated, the suite log path.

## DISPATCH ANCHOR CHECK

(filled by the goal pilot at dispatch time — every anchor re-run on the live tree;
STOP and re-brief if any moved)
- seedShrines: src/shrines.js:48, no min-separation — CONFIRMED 2026-09-18 on d12a4a5 (grep: src/shrines.js:48)
- purchase loop: src/main.js:3209-3241, per-shrine same-frame sale at len < 26 —
  CONFIRMED 2026-09-18 on d12a4a5 (grep: src/main.js:3209)
- state seeding: src/main.js:7312-7315 (shrineRng = mulberry32(choiceSeed ^ 0x5eed);
  state.shrines = seedShrines(state.shrineRng)) — CONFIRMED 2026-09-18 on d12a4a5 (grep: src/main.js:7312)
- view-advance: src/main.js:3237-3240 — CONFIRMED 2026-09-18 on d12a4a5 (grep: src/main.js:3238)
