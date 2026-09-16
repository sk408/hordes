# LIFESTEAL RATE CAP — the invincibility fix (owner call, 2026-09-16)

Owner, verbatim: **"Ok let's fix that issue"** — the issue, measured in
`docs/briefs/INVINCIBILITY_FINDINGS_2026-09-16.md`: **uncapped lifesteal heal throughput multiplied by the
compounding damage shop makes death arithmetically impossible.**

## THE DEFECT, AS MEASURED
`src/main.js` :1859 — `p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal)`. The only clamp is max
HP: there is no cap on the lifesteal fraction and **no cap on HP per second**. Inbound damage IS bound (a
single hit is capped at 0.5 x maxHp, `config.js` :69 / `entities.js` :94-95, and each unabsorbed hit buys 0.6s
of i-frames, `main.js` :2073/:2107, so max inbound ~= 0.83 x maxHp/s), while the heal side scales with outgoing
DPS, which COMPOUNDS with the shop (Forged Edge L5 = 243x, `meta.js` :431). Measured repro: FE5 (2,372g) +
lifesteal drafted to 0.24 took **78.8 HP/s** and healed **79.3 HP/s for 300s straight**, HP floor 66/287, zero
potions, zero deaths, while the un-staged control died at 26s.

The codebase already has the right pattern in a weaker healer: the Consecration altar banks heal-per-kill and
caps it at `DPS*TICK` (config.js :236-237, "so it cannot out-heal a boss"). Lifesteal — the strongest healer —
has no equivalent.

## THE FIX: CAP THE RATE, NOT THE FRACTION
Do NOT nerf the lifesteal stat. Cap the **healing rate** so sustained lifesteal cannot exceed a fraction of max
HP per second, using a **token bucket** at the heal site (the altar's banked-and-capped precedent):

- A per-run bucket refills at `HEAL_CAP_FRAC * maxHp` **per second** (dt-driven, no wall clock).
- Each lifesteal heal spends from the bucket: heal = `min(dmg * lifesteal, bucket)`.
- The bucket never accumulates beyond one second's worth, so a burst within a second still lands in full while
  the SUSTAINED rate is bounded.

`HEAL_CAP_FRAC` MUST BE DERIVED, NOT GUESSED: max inbound is ~0.83 x maxHp/s and the repro's sustained inbound
was ~0.27 x maxHp/s, so the cap has to sit BELOW the inbound a heavy swarm can deliver or death stays
impossible. Start from **0.25 x maxHp/s** and justify the number you ship with those figures. Put it in CONFIG
(e.g. `CONFIG.LIFESTEAL.HEAL_CAP_FRAC`) with the owner's call and the finding cited in the comment, following
the AUTO_DRINK / AUTO_CAST comment convention.

KEEP UNCHANGED: the lifesteal FRACTION still stacks from every source (cards, affix, meta, evolution) — reaching
the cap faster is the reward now, which preserves the vampiric fantasy; potions, regrowth, the altar, the boss
curse and the hit cap are untouched. A low-lifesteal early build must be **byte-identical** to before: at
`dmg * lifesteal` far below the cap the bucket is never the binding constraint.

## ACCEPTANCE
1. **Unit test** (`test/test_lifesteal_cap.mjs`): with an absurd `dmg * lifesteal` fed across N frames the healed
   total never exceeds `HEAL_CAP_FRAC * maxHp` per second (assert the number); a single large hit heals in full
   up to one second's budget (burst preserved); the bucket refills at exactly the cap rate and does not
   accumulate beyond one second; below the cap the result is IDENTICAL to the uncapped formula (assert equality
   for small values); the bucket resets per run and is dt-driven (feed unequal dt steps, assert rate not count).
2. **Bounded re-measurement** (`<= 60 SECONDS WALL PER COMMAND`, the owner's standing cap, `tools/real_loop.mjs`):
   re-run BOTH formerly-invincible arms (FE5 + 0.24; FE5 + 0.33) and show they no longer survive indefinitely —
   report damage taken, healed, heal/s, HP floor and deaths for each. Include the unmatched control. AND
   measure one MODEST lifesteal arm to prove the low end is unchanged (state before/after figures; if you cannot
   reproduce a pre-change figure, say so rather than asserting it).
3. `bash tools/run_suite.sh` ends `redfiles=0`; nothing weakened. If an existing test pins the uncapped heal,
   report it with file:line and retarget it to a rate assertion — do not delete it.
4. Report: the shipped `HEAL_CAP_FRAC` with its derivation, the before/after table for the arms, files touched,
   and a `COULD NOT VERIFY` section.

## HOUSE RULES
No emojis. No `git commit/checkout/reset/stash/clean` — leave the tree dirty and report the dirty count. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/lscap_progress.log` before and after every step that can exceed a few seconds. Nothing may exceed 60
seconds of wall clock per command. Then END YOUR RUN cleanly.
