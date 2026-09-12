# BRIEF — G8 STEP 4: GENERAL SKILL ITEMS (perk card family) + the missing run-level measurement of the run rules

Repo: `/home/claude/projects/hordes` (you are the ONLY writer on it — acquire the agentlock before the first edit, release when done).
Read first: `docs/HORDES_GOALS_2026-09-12.md` (goal G8 and the OWNER DECISION at its bottom: option 6, build order 1 -> 3 -> 4 -> 2) and `docs/BUILD_PLAN.md` (W7c, the standing rules).
Already landed: **step 1** = luck touches the draft (`src/meta.js` `draftRarityOf`/`luckDraftWeights`/`draftCardWeight`, consumed by `src/main.js openDraft()` and `tools/draft_sim.mjs`); **step 3** = condition-shape run rules (`src/rules.js` NEW, hooked in `src/chests.js`, pool + pick in `src/main.js`). The doc's TICK NOTES 4 and 5 are the predecessors; match their honesty standard.
**Do NOT ask the owner anything.** The decision is made; build in the stated order. This is step 4 of 4 in G8's sequence (step 2, rule-rewrite items, is the LAST one and is NOT this slice).

## DELIVERABLE A — the "general skill items" family

New file **`src/perks.js`**. Owner-facing label for a card in this family: `SKILL - ...`.

Name it `perks` in code ON PURPOSE: `src/config.js` already owns `SKILLS` = the player-triggered ACTIVE abilities (FROST_NOVA / OVERCHARGE on Q/W). A second code concept called SKILL would be ambiguous forever. Nothing in the save schema changes either way.

THREE cards, each a small ALWAYS-ON perk, each **taken ONCE per run** (it leaves the pool after being taken, exactly like a run-rule card — so at most 3 of them can ever be held, which keeps the power increase bounded and measurable):

| id | name | desc (one line, player-facing) | effect |
|---|---|---|---|
| `regrowth` | Regrowth | `SKILL - heal 0.7 HP per second, always on` | flat HP/s, NOT a percentage (it must not scale into a long run) |
| `focus` | Focus | `SKILL - skills cost 20% less mana and cool down 15% faster` | touches the Q/W ability layer, which the draft pool has NEVER touched |
| `thick` | Thick Skin | `SKILL - incoming damage to you is 12% lower` | scales against the x5.25 contact curve, which is what decides runs |

Card objects follow the SAME draft contract as every other card: `{ id: 'skill_<id>', skill: '<id>', name, desc, weight, apply(player) }`.

Pure module exports (pure helpers only — no rng, no DOM, no mutation outside the two writers the game calls; that is what lets the tests measure it with no browser):
- `SKILL_PERKS` (the catalog), `SKILL_PERK_IDS`, `SKILL_CARD_WEIGHT = 0.10` (three cards -> family weight 0.30, the same order as the rules family's 0.30. ONE knob. If the measured dilution is unacceptable, change this constant and report the measured curve — do not change a test.)
- readers: `perksOf(state)`, `hasSkill(state,id)`, `skillCardOffered(id,state)`, `skillsHeld(state)`, `skillCards(state)` (cards for every perk the run does not already hold)
- writers: `grantSkill(state,id)` (returns true only for a real id)
- **the applied-value helpers the GAME reads** (this is the point — one source of truth so the HUD cannot lie): `hpRegenPerSec(state)`, `skillManaCost(defId, state)`, `skillCooldown(defId, state)`, `damageTakenMult(state)`

State home: **the RUN player** — `state.player.skills = {}` next to `rules` / `takenStats` (see `src/rules.js` and `src/entities.js makePlayer()`), so a fresh `makePlayer()` is a fresh run and **nothing enters the save schema** (no migration, no persistence).

### Exact hooks (anchors)
1. **Regrowth** — the per-frame resource seam. `src/main.js` already applies mana regen at ~L1203-1209 and a DUPLICATE copy at ~L4230. Do not add a third copy: put the HP-regen step in ONE helper in `perks.js` and call it from both existing seams, **using `dt`** (nothing may assume a fixed dt; 60Hz and 120Hz must both be right).
2. **Focus** — `src/skills.js useSkill()` (~L14: `p.mana -= def.MANA;` and `p.skillCd[id] = def.COOLDOWN;`) must route through `skillManaCost` / `skillCooldown`, AND the HUD readiness readout at `src/main.js` ~L3924 (`cd > 0 ? ... : (p.mana >= C.SKILLS[defId].MANA ? 'RDY' : 'LOW')`) must read the same helpers, or the button text lies about what the perk changed.
3. **Thick Skin** — EVERY path that removes HP from the player must funnel through ONE `damageTaken(state, amount)` helper in `perks.js`: the hostile paths named in TICK NOTE 4 (drain / contact / shot) plus any boss-curse or potion-path interaction you find (`grep -n "p.hp -=\|player.hp -=" src/main.js src/*.js`). If any site cannot be routed, say so in the report instead of leaving it silent.
4. **Draft pool** — `src/main.js openDraft()` (~L1845-1900): add `...skillCards(state)` beside `...ruleCards(state)`. In `pick()` (~L1967): add a skill branch that grants + toasts `SKILL - NAME: <desc>` exactly like the rule branch, and make sure a skill card does **NOT** go through `markStatTaken` (skill ids must not pollute the `once` ledger).
5. `src/entities.js makePlayer()` gains `skills: {}` beside `rules: {}` / `takenStats: {}`.

## DELIVERABLE B — the run-level measurement that is still missing

`tools/draft_sim.mjs`'s policies do not pick rule cards, so **step 3 currently has pool-level numbers and NO run-level numbers**, and step 4 adds pool entries on top. Close that here:
- `buildDraftPool` mirrors `skillCards` + `ruleCards` at the same weights, read through the same seams (so a measurement of one is a measurement of the other).
- `cardImpact` / `applyCard` gain honest entries for all FIVE new cards (`regrowth`, `focus`, `thick`, `hordebait`, `once`). Say in a comment WHY each number is what it is. Do not invent precision you do not have; a coarse honest value beats a fake exact one.
- Report a **measured before/after table** (seeded, >=30 runs per cell): GREED-DAMAGE vs ADVERSARIAL-BAD and SURVIVAL where useful, survival seconds + gold + waves cleared, families OFF (= today) vs ON, at luck 0 and luck 5.
- Re-run `node tools/draft_sim.mjs --validate` (the real-loop cross-check) and report its result.
- **Invariants that must still hold (assert them, do not assume):** a bad draft can still fail; good beats bad on >=3/5 minute-10 metrics; ONE bad pick never loses a run; and at luck 0 with no rule/skill cards taken the pool is **bit-identical** to today's.
- **Never weaken an assertion to go green.** If a perk breaks an invariant, tune the perk constant and report the measured curve — that is exactly what happened in tick 4 with `DRAFT_LUCK_TRANSFER` (the fix was a knob, not a test edit).

## DELIVERABLE C — tests + real-browser evidence

- **`test/test_perks.mjs` (new):** family contract (ids unique; no collision with the seven `UPGRADES` stat ids or the `rules.js` ids; once-only; weight; `apply(player)` contract); each helper's math; dt-correctness through the REAL per-frame seam; all three player-damage paths reduced; and the REAL draft seam — drive `src/main.js openDraft()` in the headless harness (`test/_harness.mjs`) with a seeded rng, following the pattern in `test/test_run_rules.mjs`, and assert a skill card reaches the pool and leaves it once taken.
- `test/test_run_rules.mjs` and `test/test_draft_luck.mjs` may be EXTENDED, never weakened. `test_chests*` pin the chest rng draw order — they must stay green.
- **Real browser, PHONE viewport.** Use the existing in-tree harness `tools/browser.mjs` (Chrome for Testing lives at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`; ES modules need the served http origin the harness provides). Write `tools/verify_g8_skills.mjs` in the style of `tools/verify_g8_rules.mjs`: 390x844 @ dpr 3, touch, iPhone UA; seed drafts until a SKILL card is offered in the REAL draft; assert its name+desc text is in the DOM and **unclipped inside the viewport**; screenshot to `/tmp/hordes-shots/g8-step4-skill-draft-phone.png` and copy the PNG into `docs/art/browser-verify-2026-09-12/`. **Read the captured PNG with `readShot` and report the sampled pixels.** There is NO vision model reachable from this host — so pixel/DOM evidence is what we have and you must SAY that plainly (do not imply a "looks right" judgement you cannot make).
- **Full suite:** `bash /tmp/run_all.sh` must end `FAIL=0`. Baseline right now is **PASS=58 FAIL=0** (58 = `test_*.mjs` + `smoke.mjs`; `test/_harness.mjs` is support, not a case). A new test file raises the count by one — report the number you actually got.

## HARD RULES
- **Lock first:** `AGENT_HUB_PARTICIPANT=<your handle> ~/projects/agent-hub/sdk/agentlock acquire --note "G8 step 4 skill items"`. If it exits rc=1 another writer holds it — WAIT AND RETRY (up to ~10 minutes), never force. Release with `agentlock release` when finished.
- **NO `git commit/checkout/reset/stash/clean`** — Remy owns commits. Leave your work uncommitted like ticks 3-5 did.
- No emojis anywhere. Integer pixels. `docs/` stays out of the public repo. Do not add a runtime dependency to the repo.
- One writer per file; you own this whole slice, so keep it in the files named above.
- Finish by appending a **`## TICK NOTE 6 — <date> (goal pilot, agentlock held)`** section to `docs/HORDES_GOALS_2026-09-12.md`: goal worked, what landed with `file:line` anchors, the measured numbers table (before/after), the suite result, what you could NOT verify (honestly), and the next step (**G8 step 2 — rule-rewrite run-altering items**, the last one). Then post: `~/projects/agent-hub/sdk/ahub checkpoint "G8 step 4 — skill items + run-level measurement" --channel hub`.
