# PROJECT AUDIT (independent) — 2026-09-16

Author: Remy (orchestrator). Owner asked for an independent deep audit in parallel with the glm
lane audit, with an explicit exception to the standing "delegate investigations" rule.
Method: static enumeration + arithmetic, with every claim tied to a file:line. No measurements
were run inline (the lane was mid-audit; running sims concurrently would have contested CPU and
corrupted both results).

## F1 — SERIOUS (balance/fairness): the VAMPIRIC elite heal is an uncapped mirror of the player
## bug just fixed, and it scales with the PLAYER's max HP

Code path: `main.js:2096-2101`
```js
// VAMPIRIC elite mod (elite_mods.js): touching elites heal themselves a fraction of
// the contact damage they dealt.
for (const e of state.enemies) {
  if (e.hp > 0 && (e.lifesteal || 0) > 0 && Math.hypot(p.x - e.x, p.y - e.y) < 13) {
    e.hp = Math.min(e.maxHp, e.hp + touchDmg * e.lifesteal);
  }
}
```
Value: `elite_mods.js:52` — `lifesteal: 0.5`.

Two defects in one block:

1. **No rate cap.** The heal is `0.5 x touchDmg` per contact event, and contact is gated only by
   the 0.6s i-frames (`main.js:2094`). That is a throughput heal of
   `0.5 x touchDmg / 0.6s` per elite — the enemy-side twin of the defect G34/G36 just closed on
   the player side. Nothing bounds it except the elite's own maxHp.
2. **It heals EVERY adjacent elite, not the one that dealt the contact.** The condition is
   proximity (`< 13px`), not attribution, so N clustered VAMPIRIC elites each receive a full
   `0.5 x touchDmg` heal per contact. This contradicts the mod's own docstring
   (`elite_mods.js:29`: "fraction of the elite's CONTACT damage healed back").

**Blast radius — why this is worse than a generic enemy buff:** the heal amount scales with
`touchDmg`, which is capped at `HIT_CAP_FRAC x PLAYER maxHp` (`config.js:69`). So a player who
buys max HP makes VAMPIRIC elites heal *more* in absolute terms. The player is punished, at the
enemy's benefit, for the stat they bought for safety.

Arithmetic (contact damage at the hit cap, the worst case):
  - maxHp 287: heals 72 HP/contact -> 120 HP/s per adjacent elite (42% of player maxHp/s)
  - maxHp 400: 100 HP/contact -> 167 HP/s
  - maxHp 600: 150 HP/contact -> 250 HP/s
You are touching them exactly when you are damaging them, so this is regen exactly in the window
that matters. Typical contact damage is likely below the cap; the *bound* is what is unbounded.

**Suggested fix (NOT applied):** attribute the heal to the contacting elite only, and bound it —
symmetrically with the player-side budget — e.g. route it through a per-elite rate cap or cap it
at a fraction of the elite's own maxHp per second. Owner call, as with the player-side fix.

## F2 — MINOR (performance): O(n) trig scan on every contact hit

Same block. `Math.hypot(p.x - e.x, p.y - e.y)` runs for **every enemy** each time contact lands.
At swarm densities (measured max ~93 kills/s in this project) that is a full-array trig pass per
contact, several times per second. Fix: skip the loop entirely when no VAMPIRIC elite exists
(a counter or a flag), and/or compare squared distances.

## F3 — OBSERVATION (tuning, not a defect): the new heal cap sits just under the measured
## equilibrium

`HEAL_BUDGET.CAP_FRAC = 0.25` (`config.js:300`) vs the G32 repro's sustained inbound of
**0.27 x maxHp/s** (78.8 HP/s on 287 maxHp). The cap binds, so the exploit is closed — but at
that specific density the player is near break-even and death is slow. The margin widens as
swarm density rises (inbound ceiling is ~0.83 x maxHp/s), which is the intended lever. Flagging
so that "still alive a long time in a thin swarm" is not later misread as the bug returning.

## VERIFIED GOOD — the G36 fix itself (this was the main thing nobody had independently checked)

The shipped gate ran the builder's own tests, which is self-confirming, so I verified the wiring
directly:

- **Three spend sites, all budgeted:** `main.js:1878` and `main.js:7327` (lifesteal, normal and
  finale loops) and `weapons.js:549` (GRAVE HARVEST, `2 * souls`). Each debits
  `state.healBudget` after spending.
- **Exactly one refill per frame — no silent doubling:** the two refill sites sit in `update()`
  (`main.js:1698`) and `updateFinale()` (`main.js:7177`), and the dispatcher is an if/else:
  `main.js:7498-7499` — `if (...) update(dt); } else if (state.mode === 'finale') updateFinale(dt);`
  So the budget cannot refill twice in a frame, which would have quietly doubled the cap.
- **Per-run seeding:** `main.js:5565` sets the budget to full on run start; `state.healBudget`
  is initialised in the run state at `main.js:325`.
- **The old uncapped lifesteal line is gone:** 0 occurrences of
  `p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal)` anywhere in `src/`.
- **The exemptions are real, not hand-waved:**
  - Altar: `skills.js:238` — `Math.min(f.healAcc, def.DPS * def.TICK)` is a genuine rate cap.
  - Potions: `skills.js:258` — consumable, stock-capped, supply-rate-bounded by G33.
  - Level-up heal: `main.js:2643` — outside the budget, but quantified: `HP_PER_LEVEL = 0.015`
    (`config.js:70`), linear by design, with a comment citing a previously measured compounding
    exploit ("1018 HP at 8:45"). Net contribution ~0.4% of the budget's rate. Bounded, recorded
    so nobody later "discovers" it as a hole.

## CHECKED, NO DEFECT DEMONSTRATED

- **Module-level mutable state** (the class that shipped the `controller.stance` bug):
  36 true column-0 `let` bindings in `main.js`; 34 are not reset inside `startRun`, but nearly
  all are UI/session-scoped (`menuTour`, `coach`, `resetArmed`, `endArmed`, cine timers) and have
  reset sites elsewhere. No gameplay-state leak demonstrated. Screen is noisy; not a finding.
- **Unbounded per-run arrays:** `projectiles`, `effects`, `enemies`, `gems`, `drops`,
  `itemDrops`, `enemyShots`, `toasts` all have matching shrink/reset sites.
- Earlier mechanical sweep (storage keys, unguarded `JSON.parse`, empty catches, TODO/FIXME,
  `console.log`, `index.html` asset refs, migration/version test coverage) — clean.

## COULD NOT VERIFY (honest limits)

- Whether typical (not worst-case) contact damage makes F1 bite in practice — needs one bounded
  measurement in the real loop.
- Feel: whether the capped healing still feels like sustain, and whether potions still read as a
  burst escape. That needs the owner holding the phone, not an audit.
- Mobile/embed layout and performance under real load: needs real-Chrome instrumentation, which
  the parallel lane audit has as its remit.
