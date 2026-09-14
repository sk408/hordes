# N1 CHAIN REACTION Q - ONE REPRODUCIBLE RED (test_perks / Focus contract)

Remy, 2026-09-13. Repo /home/claude/projects/hordes.

## WHY THIS EXISTS (read this part carefully)

The previous builder for this slice was `cli:glm-hordes-g8`. It was **mid-flight** when the GLM
weekly quota died (`API Error: 429 [1310] Weekly/Monthly Limit Exhausted`, resets **2026-09-15
15:49:58 UTC**). It has been retired; the builder lane is **kimi** now (you).

Its N1 slice-1 work is **complete and still on disk, UNCOMMITTED** (~354 insertions in
src/config.js, src/entities.js, src/main.js, src/meta.js, src/rewrites.js, src/skills.js,
src/weapons.js, plus new test/test_chain_q.mjs). Do not start over and do not re-derive it.

## HOUSE RULES (you will not be given them otherwise)

- Exactly ONE writer. Before editing run `~/projects/agent-hub/sdk/agentlock status`. If HELD by
  another owner, STOP and report - edit nothing. Otherwise acquire it
  (`~/projects/agent-hub/sdk/agentlock acquire --note n1-chain-q-red`) and **release it when done,
  including on failure**. Beat as you go: `~/projects/agent-hub/sdk/agentlock beat`.
- **NO git state commands at all** (commit / checkout / reset / stash / clean). The orchestrator owns
  commits and the pilot owns verification.
- Your own summary is a claim, not evidence. Every number you report must come from a command you
  ran and paste, in this reply.
- **An assertion is NEVER weakened, moved, deleted, or given a tolerance band to go green.** A green
  suite won by tolerance is a FAILURE. If the honest fix is a changed expectation, say so with the
  reasoning and STOP - the pilot decides, not you.
- 60Hz and 120Hz must both stay correct; nothing may assume a fixed dt. No emojis anywhere.
- Worker contract: run `hub-worker poll` before each action so an interrupt can reach you.

## MEASURED STATE (Remy ran every one of these on this tree - verify, do not re-derive)

1. `node test/test_chain_q.mjs` => **15 checks passed**. The new Q is real and its own test is green.
2. `bash tools/run_suite.sh` => **greenfiles=73 redfiles=1**, tree @ bfb56d7 dirty=12.
3. `node test/test_perks.mjs` standalone => **perks: PASS=14 FAIL=1**, reproducible across runs.
   The failing assertion, verbatim:

       FAIL useSkill charges the Focus price and rolls the Focus cooldown
            Expected values to be strictly equal:
            false !== true

4. `node --check` is clean on all seven modified src/ files.

## THE TASK

Make `test/test_perks.mjs` green **without weakening it**. The Q-slot routing change (the Witch's Q
now goes through the CHAIN path) evidently alters or bypasses the **Focus price-and-cooldown
contract that `useSkill` must still honour** - Focus multiplies the mana price and sets the
cooldown, and that contract is asserted at the real `useSkill` seam. Find the actual seam and fix
the routing/charge so BOTH contracts hold: the chain Q for the Witch **and** the Focus price and
cooldown for a Focus holder.

## ACCEPTANCE BAR

- `node test/test_perks.mjs` => 20/20 standalone, **twice**
- `node test/test_chain_q.mjs` => 15/15
- `bash tools/run_suite.sh` => **redfiles=0 three times**
- Report the seam you found (file:line) and why the fix is right rather than a patch.
- Do NOT commit. Leave the work in the tree for the orchestrator.

## IF YOU CONCLUDE THE CONTRACT ITSELF CHANGED BY DESIGN

Then do NOT touch the test and do NOT invent a workaround: report exactly which contract, what the
old and new behaviour are, and why the new one is correct. Remy and the pilot decide. Guessing here
is worse than stopping.

---

## RESOLVED (commit watcher, 2026-09-14 00:05 UTC) - the seam was NEVER the bug

Do not change `useSkill`. The Focus price/cooldown contract was never bypassed. Measured
on this tree before any edit (`/tmp/probe_skills.mjs`: the same empty-field fixture the
test used, then one parked target):

    empty field:   FROST_NOVA -> true  | mana 999 -> 969 | cd 8
                   OVERCHARGE -> true  | mana 999 -> 974 | cd 12
                   CHAIN_REACTION -> false | mana stays 999 | cd stays 0
    one target:    CHAIN_REACTION -> true | mana 999 -> 969

`CHAIN_REACTION` is the AIMED skill: `src/skills.js:49-54` refunds the charge and clears
the cooldown on an empty field BY DESIGN (a whiff costs nothing - the potion contract),
and `test/test_chain_q.mjs:209-211` pins exactly that (0 mana spent, 0 cooldown armed).
`test/test_perks.mjs`'s blanket clause casts EVERY id in `C.SKILLS` on an EMPTY field, so
the newly added aimed skill legitimately returned false, and its `true !== false`
assertion read as a Focus-contract break. The expectation did not change - the FIXTURE
was stale. It now parks one sturdy target, so every catalog id is cast under legal
conditions.

No assertion was weakened, moved, deleted or given a tolerance: the assertion text is the
shipped text, verbatim, and the file reports 15/15. Landed in `cb9fea3` (suite 74 files /
0 red, three consecutive runs), the commit that carries this note. No `src` change was
needed or made for this red, so the builder task described above is moot.
