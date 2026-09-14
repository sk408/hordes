# G21 SLICE 1 - RULE-CHANGING CARDS: THE KEYWORD TAXONOMY + FINITE REWRITE SLOTS - BUILD BRIEF

**Slice:** G21 slice 1 of 2, ranked-queue item after M1 (`docs/HORDES_GOALS_2026-09-12.md:2542` -
READ THE FULL G21 ENTRY before starting; the owner-facing substance is reproduced below but the source
file is authoritative). Slice 1 lands the SYSTEM (taxonomy + finite slots + empty-slot incentive + the
first five tagged cards). Slice 2 (NOT this brief) adds the cross-tag combos and the remaining cards to
reach the goal's 12-20 total. Do not build slice 2 in this dispatch.
**Builder:** `cli:kimi-hordes-g8`.
**Brief authored by:** the goal pilot, 2026-09-14, on the post-S1 tree `4d79210` WHILE M1 was in flight
- every `src/main.js` / `src/config.js` / `index.html` line anchor below is therefore PRE-M1 and the
dispatch tick MUST re-resolve them per the DISPATCH ANCHOR CHECK before issuing.
**Ordering:** runs strictly after M1 lands (both touch `src/main.js` / `src/config.js`).

## DISPATCH ANCHOR CHECK (the dispatch tick MUST run this block, not read it)

1. `git status --porcelain` - record the line count and state whether the tree is clean.
2. Resolve every `file:line` anchor below and CORRECT any that drifted, IN PLACE in this file.
3. RUN `bash tools/run_suite.sh` and paste its verbatim final line under MEASURED CURRENT BEHAVIOUR.
   If it does not end `redfiles=0`, STOP - G21 is not issued on a red tree.
4. Confirm `src/rewrites.js` still holds exactly three cards (`pierceall`, `onkillboom`, `healthdamage`),
   `REWRITE_CARD_WEIGHT`, and the pure-helper contract; confirm `rewriteCards(state)` is still consumed
   at exactly one draft-pool site (`src/main.js`, the `...rewriteCards(state)` spread, pre-M1 :2599).
5. Confirm the enemy status fields: `slow` on every enemy (`src/entities.js:54`, decayed in the enemy
   update, pre-M1 `src/main.js:1739`) and that NO burn/DoT field exists on enemies today.
6. Confirm `skillCooldown` in `src/perks.js:145` is the ONE applied-value helper every cooldown read
   (game + HUD) goes through.
7. Confirm M1's atlas did NOT add a save-schema field (it must not have) and that `state.player.rewrites`
   is still run-scoped only.

### DISPATCH ANCHOR CHECK - RUN 2026-09-14 16:05 PT by the goal-pilot tick (M1 pickup)

Every item below was EXECUTED, not read. Corrections were applied in place in this file.

1. `git status --porcelain` => **16 lines, tree DIRTY** (M1 uncommitted + the orchestrator's doc/art
   edits). The builder must not run any git state command; leave it dirty.
2. Anchors resolved on this tree. **ONE DRIFT, corrected in place above:** the death pass moved
   `src/main.js:1961-1971` -> **`:1969-1978`** (M1 did not shift it; the N1-slice-3 comment block did).
   Everything else still resolves where the brief says:
   - `src/rewrites.js` cards `pierceall` :42 / `onkillboom` :47 / `healthdamage` :52; `rewriteCards` :117;
     `applyBlast` :190; `REWRITE_CARD_WEIGHT = 0.02` at :75. `grantRewrite` :139 writes
     `state.player.rewrites[id]` (RUN-scoped, no save field) - confirmed.
   - `rewriteCards(state)` consumed at exactly ONE pool site: `src/main.js:2599` (`...rewriteCards(state),`).
   - `slow: 0` on the enemy factory `src/entities.js:54`; decayed `src/main.js:1739`; flyer never grips a
     ground AoE (`src/main.js:674/680`, `flyingGuard`). **NO `burn` / DoT field exists** (grep over
     `src/entities.js` + `src/main.js`: only two unrelated prose comments) - IGNITE adds it fresh.
   - `skillCooldown(defId, state)` is still the ONE applied-value helper at `src/perks.js:145`.
   - `WEAPON_SLOTS: 6` still at `src/config.js:380`.
3. `bash tools/run_suite.sh` verbatim final lines on THIS tree:
   `TREE: /home/claude/projects/hordes @ 4d79210 | dirty=16` / `SUITE greenfiles=88 redfiles=0` - GREEN.
4. Confirmed (see 2): three rewrites, the weight, the pure-helper contract, the single pool site.
5. Confirmed (see 2): `slow` present and decayed, no burn/DoT field.
6. Confirmed (see 2): `skillCooldown` `src/perks.js:145`.
7. M1's `state.atlas` is RUN state only - `grep -n atlas src/save.js` => **no hits**; the save schema is the
   profile layer (`SCHEMA_VERSION` in `src/save.js`), so no schema bump. `state.player.rewrites` unchanged
   and still run-scoped.

**RIDER CALL-SITE CHECKLIST (measured `hp -= ` sites on THIS tree, for C4's `onWeaponHit` enumeration):**
- `src/weapons.js:239` (`e.hp -= dmg`) - the shared weapon-damage apply; DIRECT hit: RIDER.
- `src/main.js:1416` (`tgt.hp -= baseDmg * ZAP.FALLOFF^...`) - zap fork: direct: RIDER.
- `src/main.js:1482` (`t.hp -= synWeaponDmg('ZAP',...) * 0.5`) - the 50% zap falloff tick: direct: RIDER.
- `src/main.js:1688` (`e.hp -= dmg; pr.hit.add(e)`) - projectile hit: direct: RIDER.
- `src/main.js:1697` (`o.hp -= dmg * 0.5`) - mine SPLASH (secondary AoE, not a direct hit): NO RIDER.
- `src/main.js:1951` (`o.hp -= sw.damage`) - scythe sweep: direct: RIDER.
- `src/main.js:1391` (`e.hp -= d`) - beam/continuous tick: the builder must state the call path and decide
  by the direct-hit definition; enumerate it either way.
- `src/main.js:1903` (`e.hp -= th`) - THORNS (enemy-side reflect, NOT a weapon hit): NO RIDER.
- `src/main.js:2284` (`o.hp -= blast.damage`) - a blast application: NO RIDER (blasts never ride).
- `src/main.js:2346` (`o.hp -= chip`) - chaff/shrine chip: NO RIDER.
- `src/main.js:1771/1885/1919/5229` and `:6196/6215` are PLAYER `hp -=` (damage taken / boss): irrelevant,
  listed so the enumeration is exhaustive.
The builder must confirm this list against its own grep and own every line's verdict in the report.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report.
- **Never weaken or delete an assertion to go green.** Retarget honestly (file + line + why) and
  enumerate EVERY retarget. Widening a cohort until a marginal bar clears is tune-until-pass, FORBIDDEN.
- **A code claim is not evidence.** Every number from a command whose raw output you keep and quote.
- **No emojis** anywhere (owner UI rule). **60Hz AND 120Hz must both be correct** - every timer you add
  is dt-driven; nothing counts frames.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times. Never edit while another
  owner holds it.
- **Scope bound** at the bottom is enforced literally. If you believe a change outside it is required,
  STOP and report.

## THE GOAL (G21, abridged from the source entry)

"Keep 3-4 actives on distinct ROLES (CC / burst / mobility / defense) and add 12-20 rule-changing cards
that rewrite how abilities behave ('on-kill explosions', 'healing also damages nearby enemies', 'empty
slots grant cooldown', 'all projectiles pierce'). Finite build slots so every pick excludes others; a
keyword taxonomy (FROST/CHAIN/ORBIT/BURN/CONDUCT) so stacking is legible; one rule-card per tag plus
cross-tag combos; an opportunity-cost incentive for leaving a slot empty."

The actives half is an AUDIT, not a build task: the game already ships FROST_NOVA, OVERCHARGE,
CHAIN_REACTION and the three N1 ults (EARTHSHATTER / AFTERIMAGE / CONSECRATION). The report maps each
active onto CC/burst/mobility/defense and says which roles are covered. **No new actives this slice.**

## MEASURED CURRENT BEHAVIOUR (pre-M1 tree `4d79210`; dispatch tick re-verifies)

- Suite on the authoring tree, verbatim: `TREE: /home/claude/projects/hordes @ 4d79210 | dirty=0` /
  `SUITE greenfiles=87 redfiles=0`.
- The rewrite family today: THREE cards in `src/rewrites.js` - PIERCE ALL (`pierceall`), CHAIN REACTION
  (`onkillboom`, 6-mana soft-gated blast with a dry fallback), BLOOD HARVEST (`healthdamage`). Once-only,
  run-scoped on `state.player.rewrites`, granted through the same `apply(player)` draft contract as every
  other card, pure readers/writers, headless-tested by `test/test_rewrites.mjs`.
- Family weight: `REWRITE_CARD_WEIGHT = 0.02` PER CARD (owner directive 2026-09-13: "should use mana? And
  be rare."), i.e. family pool share 3 x 0.02 = 0.06 today. The measured tuning curve (60 runs/cell, seed
  4242) lives in the comment above the constant: 0.01-0.05 all clear the acceptance substance, ratio
  1.69x-1.79x.
- UNLIMITED SLOTS today: a run can hold all three rewrites; nothing excludes anything. There is no slot
  concept on the rewrite family (weapon slots exist - `CONFIG.WEAPON_SLOTS = 6`, `src/config.js:380` -
  but nothing analogous for rewrites).
- Enemy status fields: `slow` (seconds of frost-nova slow remaining) on every enemy
  (`src/entities.js:54`), decayed per-frame (`src/main.js:1739`); flyers NEVER grip slow
  (`src/main.js:667-680` restores `(hp, flash, slow)` around ground AoE). NO burn / DoT field exists on
  any enemy today.
- The ONE blast application: `applyBlast(state, x, y, blast)` in `src/rewrites.js` (enemy-side friendly
  fire only, pushes the `rewrite_boom` effect). Called by the death pass (`src/main.js:1969-1978` POST-M1, gated
  by `rewriteBoom(state) || e.chainBoom` at :1969, `applyBlast(...)` called at :1977) and by the Rogue's AFTERIMAGE phantoms (`src/skills.js`).
- Direct-weapon-hit damage sites are PER-ARCHETYPE, not centralised (e.g. projectile hit
  `src/main.js:1688`, zap forks `:1416`, scythe sweep `:1951`, mine splash `:1697`). There is no global
  on-hit hook today.
- Cooldowns: `skillCooldown(defId, state)` (`src/perks.js:145`) is the ONE applied-value helper the game
  and the HUD both read (the no-lie contract). N1 ults are kill-charged with cooldown FLOORS - the kill
  charge is never a cooldown.

## PILOT CALLS (implement these unless the owner says otherwise)

**C1 - FOUR FINITE REWRITE SLOTS.** `REWRITE_SLOTS = 4` in `src/config.js`. A run holding 4 rewrites is
offered NO rewrite cards: `rewriteCards(state)` returns [] when full (the draft pool needs no special
case - the family already self-filters through `rewriteCardOffered`). The slot count is RUN state, read
from `state.player.rewrites`; no save schema change. With 8 cards in the family after this slice, 4 slots
means every pick excludes at least 4 others - the goal's "every pick excludes others" is structural, not
cosmetic.

**C2 - EMPTY SLOTS PAY (the opportunity-cost incentive).** Each EMPTY rewrite slot grants -5% skill and
ult cooldowns, multiplicative, so a run with zero rewrites runs at x0.80 cooldowns and a full house runs
at x1.00. ONE pure helper in `src/rewrites.js`: `emptySlotCooldownMult(state)`. It is read in exactly one
place - inside `skillCooldown` (`src/perks.js:145`) - so the HUD's readiness readout can never lie (the
existing applied-value contract). It multiplies the COOLDOWN part only: a kill-charged ult's KILL count
is untouched, and its cooldown floor still applies after the mult. State both plainly in the report.

**C3 - THE TAXONOMY IS DATA, THEN TEXT.** Every rewrite gains a `tags` array from the reserved set
FROST / CHAIN / ORBIT / BURN / CONDUCT (a card may carry one tag in this slice; cross-tag combos are
slice 2). Existing cards: `onkillboom` -> ['CHAIN']; `pierceall` and `healthdamage` -> [] (untagged -
they predate the taxonomy and honestly belong to no keyword family; do NOT force-tag them). The draft
card's `desc` is prefixed with its tag so stacking reads at draft speed: `CHAIN - every kill detonates -
the blast damages enemies nearby`. Untagged cards keep their current desc. The tag list is exported
(`REWRITE_TAGS`) so slice 2 and the bestiary/report surfaces can read it.

**C4 - FIVE NEW CARDS, ONE PER TAG.** Each a one-line trade at draft speed, once-only, pure helpers in
the house style, numbers in `src/config.js` (or the rewrites.js constant block, matching where the family
keeps them today). Three are always offered (until taken/full); two are PREDICATE-offered so a dead card
can never be drafted:

1. **RIME** (`rime`, FROST) - your direct weapon hits chill: the enemy's `slow` is set to 1.5s at a 0.75
   move mult (refresh, never stack; the EXISTING slow field and decay, no new status system). Flyers keep
   the house rule: ground AoE never grips them, but a DIRECT hit does (state which path you hooked).
2. **IGNITE** (`ignite`, BURN) - your direct weapon hits burn: `2 + 0.25 x weapon damage` per second for
   3s (refresh, never stack). NEW enemy fields `burn` (seconds left) + `burnDps`, ticked dt-driven beside
   the slow decay; burn damage never triggers riders and never detonates anything (no chain-of-chains).
3. **LIVE WIRE** (`livewire`, CONDUCT) - every 5th direct weapon hit zaps the nearest OTHER live enemy
   within 120px for 50% weapon damage (50% falloff matches the house zap convention). The counter is a
   run-player integer, frame-rate independent.
4. **AFTERSHOCK** (`aftershock`, CHAIN) - every `applyBlast` detonation echoes ONCE, 0.4s later, at 50%
   radius and 50% damage, through the SAME applyBlast path. The echo NEVER echoes and never triggers
   riders. PREDICATE-offered: only while the run has a blast source (`hasRewrite(state,'onkillboom')`,
   the Witch's chain Q, or the Rogue's AFTERIMAGE) - a run with no detonations must never see this card.
5. **WIDE ORBIT** (`wideorbit`, ORBIT) - ORBIT blades fly 30% wider and spin 20% faster. PREDICATE-
   offered: only while an ORBIT weapon is equipped (read the equipped weapon list, the same read
   `detectSynergies` consumes). A run with no ORBIT never sees the card.

The `rewriteCards` contract gains an optional per-card `offered(state)` predicate (default true) -
precedent: `frostCardOffered` in `src/frostcard.js`. **The ON-WEAPON-HIT rider is ONE writer**:
`onWeaponHit(state, enemy)` in `src/rewrites.js`, called from every DIRECT-weapon-hit damage site
(projectile, zap fork, scythe, boomerang, orbit blade, seeker, mine direct, beam tick, nova) and from
NOWHERE else - never from blasts, burn ticks, echoes, thorns, or enemy damage. Enumerate every call site
(file + line) in your report; the grep pattern `hp -= ` in `src/main.js` + `src/weapons.js` is your
checklist, and each site gets a one-line verdict (rider / no-rider + why).

**C5 - THE FAMILY SHARE DOES NOT MOVE.** 8 cards x 0.02 = 0.16 family share would tilt every draft
measurement this project keeps. Retune `REWRITE_CARD_WEIGHT` so the FAMILY TOTAL stays ~0.06
(8 x 0.0075 = 0.06 is the recommended start) and RE-MEASURE the tuning curve with the house tooling
(`tools/draft_sim.mjs`, 60 runs/cell, seed 4242, the same cells the existing comment names). Quote the
new curve verbatim. If 0.0075 breaks an invariant, pick the nearest weight that restores it and SAY SO.

**C6 - MEASURED CARD QUALITY, PER CARD.** For EACH of the five new cards, the one-bad-pick probe (the
method `test/test_rewrites.mjs` already uses: a good cohort, a bad cohort, and the card granted to the
bad cohort) must read >= 0.8x survival ratio, with the bad cohort still failing 100% without the card.
Quote every ratio. A card under 0.8x is retuned by its numbers, never by weakening the probe.

**C7 - NO SAVE CHANGE, NO RNG DRIFT.** All new state is run-scoped on `state.player` / the enemy
instance. The draft RNG stream must be IDENTICAL for a seeded run before and after this slice when no
rewrite card is offered or taken (the predicate-offered cards must not consume draws when their
predicate is false). Prove it with a seeded comparison run and quote it.

## REQUIREMENTS

- **R1 - SLOTS.** Headless test: a run holding REWRITE_SLOTS rewrites is offered zero rewrite cards; a
  run holding REWRITE_SLOTS-1 is offered exactly the untaken, predicate-passing set; taking one more
  closes the family.
- **R2 - EMPTY SLOTS PAY.** `emptySlotCooldownMult` returns x0.80 / x0.85 / ... / x1.00 for 0..4 taken;
  `skillCooldown` reflects it; a kill-charged ult's kill count is unchanged (test both); the mult never
  goes below x0.80 even if REWRITE_SLOTS is raised.
- **R3 - TAGS.** `REWRITE_TAGS` exports the five keywords; every card's tags are from the set; the draft
  desc of a tagged card starts with its tag; untagged cards are byte-identical in desc to today.
- **R4 - THE FIVE CARDS WORK, BOTH SIDES.** Per card, a headless test asserting the effect AND its
  absence: chill set on hit and not without the card; burn ticks the measured dps for the measured
  duration at BOTH 60 and 120Hz semantics (dt-driven, assert total damage independent of tick rate);
  live wire fires on the 5th hit and not the 4th, never twice in a row; aftershock echoes once at the
  measured 50%/50% after 0.4s (+/- one frame) and the echo does not echo; wide orbit measurably widens
  the blade radius and raises the spin rate.
- **R5 - NO CHAIN-OF-CHAINS.** Burn ticks, blast damage and echoes NEVER trigger `onWeaponHit` riders:
  an ignite+aftershock+livewire run processes a burn tick with zero rider side-effects (assert the live
  wire counter does not advance and no new chill/burn is applied by a non-direct source).
- **R6 - PREDICATES.** AFTERSHOCK and WIDE ORBIT are absent from the offered set when their predicate is
  false and present when true; a predicate-false card consumes no RNG draw (the C7 seeded proof covers
  this).
- **R7 - FAMILY SHARE + PROBES.** The C5 re-measured curve and the C6 per-card ratios, quoted verbatim
  from the tool output, the tuning comment above `REWRITE_CARD_WEIGHT` updated with the new measured
  numbers (house style: numbers replace numbers, the old curve stays as history).
- **R8 - REAL-BROWSER EVIDENCE, 390x844 @dpr3.** `tools/verify_g21_rewrite_cards.mjs` in real Chrome at
  390x844 @dpr3: set all 19 `TOUR_KEYS`, assert `state.time > 1.0` BEFORE measuring, force-draft a tagged
  rewrite card (the test harness may grant it directly, then open the draft so the card RENDERS), assert
  the tag-prefixed desc is fully inside the card bounds at phone size, capture
  `docs/art/browser-verify-2026-09-12/g21-rewrite-draft-phone.png` (1170x2532) and READ IT BACK.
- **R9 - SUITE.** `bash tools/run_suite.sh` ends `redfiles=0` - quote the verbatim final line; enumerate
  every retarget by file + line + why.

## SCOPE BOUND (literal)

**IN:** `src/rewrites.js` (tags, five cards, slot cap, `emptySlotCooldownMult`, `onWeaponHit`, the echo
scheduler, predicates); `src/config.js` (new constants ONLY); `src/main.js` (the rider call sites, the
burn tick beside the slow decay, the pool-share retune comment); `src/perks.js` (ONE read of
`emptySlotCooldownMult` inside `skillCooldown`); `src/weapons.js` (rider call sites ONLY, if a hit is
applied there); `src/entities.js` (the two burn fields on the enemy factory ONLY); `src/skills.js` (ONLY
if the ult cooldown floor read needs the mult threaded - enumerate if so);
`test/test_rewrites.mjs` (extensions); NEW `tools/verify_g21_rewrite_cards.mjs`; `tools/draft_sim.mjs`
ONLY if it hard-codes the 3-card family (enumerate the retarget).

**OUT (do NOT touch):** `src/choices.js` / the draft screen layout, `src/rules.js`, `src/synergies.js`,
`src/evolutions.js`, any NEW actives (the role audit is a report section, not code), cross-tag COMBO
cards (slice 2), `src/save.js` (no schema change), `index.html`, `src/atlas.js` / `src/radar.js` /
`src/render.js` beyond what R8's verifier reads, balance of any existing card outside C5's weight
retune. If you believe a change outside this list is required, STOP and report.

## ACCEPTANCE BAR (the pilot re-measures all of this on your artifact)

1. `bash tools/run_suite.sh` final line ends `redfiles=0`, quoted verbatim, new tests present.
2. `node test/test_rewrites.mjs` green with the R1/R2/R4/R5/R6 assertions printed.
3. The C5 curve + C6 per-card probe ratios, raw tool output quoted.
4. The C7 seeded no-drift proof, quoted.
5. `node tools/verify_g21_rewrite_cards.mjs` PASS with the R8 checks, PNG at 1170x2532 read back.
6. The actives role-audit table (each active -> CC/burst/mobility/defense, covered vs missing roles).
7. Every retarget enumerated (file + line + why); the explicit statement that no git state command was
   run; anything you could NOT verify, stated.

## REPORT FORMAT

Post `done:` with: files changed; the suite's verbatim final line; every measurement above with raw
output; every rider call site with its verdict; every retarget; the role-audit table; the flag list; and
the statement that no git state command was run.
