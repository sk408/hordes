# G6 - THE COHERENCE INSTRUMENT: REPLACE TIER-GREED WITH A REAL SKILL PROXY - BUILD BRIEF

**Slice:** G6 (THE DRAFT DECIDES RUNS), the OWNER-NAMED live work item: the instrument review.
Owner ruling 2026-09-15 (`docs/HORDES_GOALS_2026-09-12.md` G6 marker): *"Keep w7b as is. I think the
method of measurement might be off a bit to be honest."* The ladder is FROZEN byte-stable; the >=x1.6
target is NOT pursued by any balance change. This slice builds the instrument the goals doc itself
charters ("If the number is ever wanted again, the instrument to build is: two policies that differ in
BUILD COHERENCE (commit to one weapon family and its riders vs scatter across families), paired seeds,
per-profile (fresh AND developed), hard-capped, stop at the sign - settled on tools/real_loop.mjs,
never on the analytic sim") and answers the four recorded suspicion points IN WRITING.
**Builder:** the live lane (`cli:glm-hordes-g8`).
**Brief authored by:** the goal pilot, 2026-09-16, OUTSIDE the repo while W7a slice 2 held the lock.
Every anchor below is author-time; the dispatch tick re-verifies on its own tree, and YOU re-resolve
every symbol before trusting a line number.

## HOUSE RULES (override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean). The orchestrator owns
  commits. Leave the tree dirty and report the dirty count.
- **TOOLS+TEST ONLY.** Scope bound: `tools/w7b_draft_ab.mjs`, ONE new `test/test_g6_coherence_policies.mjs`,
  and optionally ONE new tool file if the policy table genuinely cannot live in the existing tool (say
  why if you split). **NO `src/` edits. NO balance change. The G6 ladder stays byte-stable.** If you
  believe a `src/` change is required, STOP and report.
- **THE 60s MEASUREMENT FREEZE IS BINDING** (owner directive at the top of the goals doc): no sim or
  measurement command may exceed 60 seconds of wall clock. Multi-run cohorts, A/B campaigns, the
  hours:H arms and any "run the verdict" pass are DEAD to the end of the queue. This slice BUILDS and
  UNIT-PROVES the instrument; it does NOT run the campaign. When a check does not fit the cap, the
  check is dropped, not the cap raised - name every dropped check in the report.
- **Never weaken or delete an assertion to go green.** Retargets enumerated as file + line + why.
- **A code claim is not evidence.** Every number comes from a command whose raw output you keep and
  quote. The pilot re-measures on the artifact.
- **No emojis. 60Hz and 120Hz both correct** (nothing assumes a fixed dt).
- **Lock:** if `.agentlock` is held, sleep 20s and re-check up to 15 times. Never edit while another
  owner holds it. Take it before your first edit, release when done.
- **Heartbeat:** append one line to `/tmp/g6_instr_progress.log` before and after every step that can
  exceed a few seconds. A flat log gets runs killed.

## MEASURED CURRENT STATE (author-time; re-verify)

- `tools/w7b_draft_ab.mjs` IS the harness: real-Chrome real-loop runs (`bootReal` from
  `tools/real_loop.mjs`) with a pluggable `--policy good|bad`, `--ladder on|off`, `--seed`, `--runs`,
  `--cap`, one JSON line per run (`took` histogram, `seen` per tier, `chase`, `rules`), a SUMMARY per
  arm, and `--aggregate` for the paired ratios.
- The policy seam: offers are read off the LIVE card (`el._draftOffer`, set by `openDraft`); a single
  `TIER_ORDER` list (8 ranks) drives BOTH policies so they can never drift apart; `bad` = exact
  reverse. Tiers are DERIVED from the live registries (UPGRADES / DRAFT_RARE_UPGRADES /
  DRAFT_MYTHIC_UPGRADES from `src/config.js`, DRAFT_RARITY from `src/meta.js`, RULE_IDS / SKILL_PERK_IDS
  / REWRITE_IDS / FROST_CARD_ID) - never restated.
- THE PROBLEM WITH THAT INSTRUMENT (suspicion point 4, goals doc): `good` picks by card TIER and `bad`
  the reverse, so the experiment measures TIER GREED, not DRAFT QUALITY. The recorded inversion
  (good/bad x0.279/x0.145 with the shipped ladder, tick 48) may mean "tier greed does not decide runs"
  - a finding about the policies, not the run.

## THE SLICE

### 1. Two new policies at the EXISTING seam: `coherent` and `scatter`

Same `el._draftOffer` seam, same derived-not-restated rule, both policies reading ONE shared
classification so they cannot drift:

- **`coherent`** - commits to ONE weapon family and its riders. Mechanically (derive the exact data
  from the code, declare it in the report): early in the run, pick a first weapon; thereafter rank
  offers by SYNERGY WITH WHAT THE RUN OWNS - level-ups for owned weapons first, then rewrite/tag cards
  whose tags touch an owned weapon (the G21 tag taxonomy: FROST/CHAIN/ORBIT/BURN/CONDUCT - read where
  tags live on offers and use THAT, do not invent a parallel taxonomy), then ladder tiers, then new
  weapons ONLY when a slot is free, stat cards last-ish. The commitment rule (which weapon is "the
  family") must be deterministic and seeded - e.g. first weapon taken, ties broken by registry order.
- **`scatter`** - the exact reverse ON THE COHERENCE AXIS: prefer offers that ADD A NEW FAMILY over
  deepening an owned one (new weapons over level-ups even at full slots' cost, off-family tags over
  on-family, stat scatter over focus), ladder tiers in the SAME rank as `coherent` so the two policies
  differ ONLY in coherence, not in tier greed. That last constraint is the whole point of the
  instrument: any divergence it measures cannot be re-read as "tier greed again".
- Keep `good`/`bad` untouched - they are the historical record.

### 2. `test/test_g6_coherence_policies.mjs` - unit/invariant proof, inside the 60s cap

- DETERMINISM: same seed, same policy => identical pick sequence (assert on a fixed short fixture or
  a stubbed offer list - your choice, but state it).
- THE POLICIES PROVABLY DIFFER IN COHERENCE, NOT TIER: on the same seeded offer stream, compute a
  declared COHERENCE METRIC (e.g. share of picks that synergize with the run's committed family) and
  assert `coherent` >> `scatter` on it, AND assert the two policies' tier-rank histograms overlap
  (the declared proof that this is not tier greed re-warmed). Print the numbers.
- The test runs inside 60s wall. If a real-boot proof cannot fit, the seam is tested against a
  recorded offer fixture and the report says so.

### 3. ONE smoke run per policy - NOT a campaign

`node tools/w7b_draft_ab.mjs --ladder on --policy coherent --seed 1337 --runs 1 --cap 60` (and the
same for `scatter`), fresh profile, each command inside the 60s cap, raw JSONL kept under
`/tmp/g6_instr/`. This proves the end-to-end wiring (policy loads, picks happen, run resolves, JSON
line well-formed). It is NOT evidence about divergence and the report must not quote it as any.
**Then write, verbatim, the exact command block that runs the full verdict when the owner lifts the
freeze** (paired seeds, fresh AND developed profiles, hard cap, stop at the sign) - so resuming costs
zero design work.

### 4. The instrument-review verdict, IN WRITING (report section, no code)

Read the tool and the tick-48 record and answer the goals doc's four suspicion points, one by one:
(1) the mid-measurement RETARGET (grant 0 -> positive) - confirm from the code what the shipped
policy table now measures and whether the pre/post-retarget numbers are comparable (they are not -
say what that invalidates); (2) the CENSORING (36/96 at the 1800s ceiling) - what it does to a
survival ratio; (3) the post-retarget n=12 uncensored read (good marginally ahead) - is it the best
current evidence and why it still is not a verdict; (4) tier greed vs draft quality - closed by this
slice's new policies, say how. Verdict: WHICH reading, if any, is currently trustworthy, and whether
the >=x1.6 target stays parked (expected: yes - the freeze and the owner ruling both say so).

## ACCEPTANCE BAR (all of it, or it is not done)

1. `node test/test_g6_coherence_policies.mjs` rc=0, prints the coherence-metric separation and the
   tier-overlap proof with real numbers, completes inside 60s.
2. Both smoke runs rc=0 inside 60s each, JSONL well-formed, kept under `/tmp/g6_instr/`.
3. `node --check` clean on every touched file; `bash tools/run_suite.sh` ends `redfiles=0` (state
   TREE + dirty count).
4. The written verdict answers all four suspicion points and names the freeze-resume command block
   verbatim.
5. NO `src/` diff, NO balance diff, `good`/`bad` policies byte-untouched (assert via git diff in the
   report - read-only git is fine).
6. Every dropped check named with the 60s-cap reason.

## REPORT FORMAT

`done:` (or `blocked:`) + one line per acceptance item with its evidence, the coherence/scatter design
as declared (the exact synergy data source), the four-point verdict, the resume command block, raw
paths under `/tmp/g6_instr/`, suite line (TREE + dirty + greenfiles/redfiles), every retarget
enumerated, wall time. Then END YOUR RUN cleanly.

## FILLED DISPATCH ANCHOR CHECK (goal pilot tick 80, 2026-09-16 04:30 UTC, HEAD `ad9cc90` dirty=0, suite greenfiles=103 redfiles=0 - every anchor RE-RUN on the live tree at dispatch; where a line number differs from the prose above, THIS block wins)

- `tools/w7b_draft_ab.mjs` EXISTS and is the harness: usage lines :19-22 (`--ladder off|on --policy good|bad --seed --runs --cap`); the live-card seam comment at :49 (`el._draftOffer`, set by openDraft); `TIER_ORDER` at :97, `TIER_COUNT = 8` at :107 (`bad` = 7 - good). The W7a slices did NOT touch this file.
- Registries: `DRAFT_RARE_UPGRADES` `src/config.js` :850; `DRAFT_MYTHIC_UPGRADES` :865; `DRAFT_RARITY` `src/meta.js` :854 (with `DRAFT_TIER_COUNT` :872 and the rarity accessor :889).
- The G21 tag taxonomy lives at `src/rewrites.js` :42-43 (the reserved set FROST / CHAIN / ORBIT / BURN / CONDUCT; every card carries a `tags` array from the set) - read THAT, do not invent a parallel taxonomy.
- The tick-48 record and the four suspicion points are in `docs/HORDES_GOALS_2026-09-12.md` (G6 marker and TICK NOTE 43/48; search "suspicion" and "TICK NOTE 48").
- G26 is LANDED (pre-run loadout): the live draft offer surface is post-G26 - the meta_rank tool measured that openDraft offers NO wpn_* grant cards anymore (weapons enter via the pre-run loadout; each BROUGHT weapon adds one weight-1 level-up card). The coherent/scatter policies must be designed against the OFFERS THAT ACTUALLY APPEAR in this tree, and the report must state what share of the offer stream is weapon-family-relevant at all - if the coherence axis is starved by the post-G26 offer mix, that is a FINDING to name in the verdict, not something to fix.
- Tree state at dispatch: `TREE: /home/claude/projects/hordes @ ad9cc90 | dirty=0`, `SUITE greenfiles=103 redfiles=0` (pilot-run this tick). If the suite is red before you start, post blocked: and stop.
