# Genre research — Vampire Survivors & Megabonk (for HORDES)

Written 2026-09-12 for Sk408, who asked us to study "the two inspirational games for this genre".
Every substantive claim below carries a source; anything we could NOT verify is listed as UNVERIFIED at
the end and is not relied on in the recommendations. HORDES' design goals for reference: players LOSE
MOST RUNS early, feel weak at the start, and progress through **game knowledge + permanent shop
purchases**; the owner wants it SIMPLE and ACCESSIBLE relative to these two, and has ruled that the
pool-dilution trade-off stays **hidden from the player** (discovery is the reward).

---

## 1. The dilution problem, quantified

Level-up offers are drawn from the unlocked item pool, weighted by rarity, so a bigger pool lowers the
chance of any specific item: `P(item) = itemRarity / poolWeight`
(https://vampire.survivors.wiki/w/Level_up). With all DLC, Vampire Survivors' weapon pool weight is
**8,130** and its passive pool **1,370** — so a rarity-1 item is roughly **0.0105% per offered slot**,
while a rarity-100 item is ~1.05%. That is the trap in numbers: the more you unlock, the harder it
becomes to target anything specific.

Both games' communities treat this as a real, load-bearing problem:
- "unlocking items dilutes the item pool and makes things far, far worse" (Steam, via
  https://steamcommunity.com/app/3405340/discussions/)
- The VS wiki's own Big Trouser guide recommends setting the weapon limit to **1** "to avoid diluting
  the item pool" (https://vampire.survivors.wiki/w/Big_Trouser).
- Megabonk guides advise rushing the pool-filter unlock and being careful what you unlock before it
  (https://progameguides.com/megabonk/megabonk-beginners-guide-how-to-farm-silver-unlock-extra-slots/).

Important: **neither developer explains this in-game.** Vampire Survivors' pool tools describe only the
action ("allows you to remove an item from level up choices, for the rest of the run") and never mention
odds or pool size (https://vampire.survivors.wiki/w/PowerUps). No developer statement acknowledging
dilution was found at all; poncle's acknowledgement is structural — they kept shipping pool tools for
years (Banish in 0.3.2, Mar 2022 → Seal I in 1.1.0 → Seal II in 1.4.0 → Seal III in 1.10 → Seal All in
2025; https://vampire.survivors.wiki/w/Version_history). This supports the owner's instinct that the
trade-off should stay unstated.

## 2. Full slots: both games NARROW the pool rather than force a swap

The single most useful mechanical finding, and the cheapest thing HORDES could adopt:

- **Vampire Survivors**: "The player cannot be offered new items if they already have 6 different
  passive items or weapons" (https://vampire.survivors.wiki/w/Level_up). When both categories are full
  and nothing can be upgraded, level-ups offer Gold or Floor Chicken instead — and Reroll/Skip buttons
  are themselves **disabled** because there is nothing left to reroll. Capacity is 6 weapons + 6 passive
  items, fixed, with stage pickups able to exceed it (https://vampire.survivors.wiki/w/Passive_items).
- **Megabonk**: "Once your slots are filled, you won't see other tomes/weapons, so you can level the ones
  you have faster" (Steam). Players note that banishing becomes near-pointless once slots are full.

**Consequence: dilution only exists while a player still has room to grow.** Both games reduce the
problem to a rule instead of a system, and neither charges the player anything for it.

VS goes one step further and makes the cap itself adjustable: the **Mindbender** relic (50 Collection
entries) unlocks a character-select "Max weapons" setting from **1–6**, default 6, applying to all
characters and explicitly NOT to passives (https://vampire.survivors.wiki/w/Mindbender). That is a
player-facing *pool-size* control, which is precisely the lever HORDES' balance work is circling.

## 3. Pool-curation tools: the two flavours, and which is cleaner

**Flavour A — pre-run, persistent (curate before the run):**

| | Vampire Survivors — Seal | Megabonk — Toggler |
|---|---|---|
| Where | Collection menu (https://vampire.survivors.wiki/w/Seal) | existing Unlocks menu; no bespoke UI (https://megabonk.org/guides/unlocks/toggler/) |
| Cost | 10,000 gold per Seal PowerUp ×4 tiers (40,000+ total) | one shop purchase (~4 Silver per two sources; conflicting — UNVERIFIED) |
| Capacity | 10/20/30/40 slots per tier; **infinite once all four maxed** | unlimited toggles |
| Reversible | MEGA SEAL (bulk, DLC-gated) **cannot be un-sealed** | **fully reversible**; re-enabling does not delete the unlock |
| Scope | can also remove starting weapons (with a long stated exception list) | **only content bought with Silver**; base/starter gear and a character's required starting weapon can never be toggled |
| Effect | removes items from level-up offers (pre-run) | removes items from **future offer/loot pools**; does not cancel an offer already on screen or remove rewards already collected |

**Flavour B — in-run consumable (fix a bad draw):** VS Reroll / Skip / Banish are standard PowerUps
available from the start, +2 per rank (https://vampire.survivors.wiki/w/Banish), and Banish "removes an
item permanently (for the rest of the run)". VS also sells **Preserve** — a 10%/rank chance (max 50%)
that Reroll/Skip/Banish are not consumed — evidence the designers treat pool tools as a resource
economy worth extending. In Megabonk these three are Shop Upgrades unlocked at 20/30/40 quests, costing
8 Silver at level 1 and levelling to 6 (fextralife wiki; UNVERIFIED numbers).

**Design read:** Megabonk's Toggler is the cleaner model for an accessible game — unlimited, free per
toggle, fully reversible, and scoped by a simple rule ("changes what can be offered, never what you
already own"). VS's Seal is the cautionary version: four 10,000-gold tiers, an enumerated exception
list, and an irreversible bulk variant.

## 4. The one thing Megabonk gets WRONG, and it matters for HORDES

Megabonk has a **permanent, invisible, pre-filter trap**: every newly unlocked weapon/tome is
automatically added to your run pool, and before you own the Toggler you cannot remove any of it — and
**base items can never be toggled off at all**. So "just unlock everything" permanently worsens your
odds. Community framing: "the more you unlock, the harder the game can actually feel"
(https://gamerblurb.com/articles/megabonk-toggler-guide-how-to-disable-stuff); the standard advice is to
rush the Toggler before unlocking widely; Steam threads complain about the volume of untoggleable items.

That is a trap by our definition — hidden + irreversible + net-negative — and it produces real player
anxiety, the opposite of "every permanent purchase reads as progress". **HORDES must not reproduce it.**
The fixes available: adopt §2's narrowing rule so dilution self-limits, make any curation tool early and
reversible rather than a late paid fix, and avoid a large untouchable base-item set.

Vampire Survivors' structural answer to the same anxiety is worth stealing outright: the PowerUps shop
has a **penalty-free full refund** ("the player will lose all of their PowerUp ranks and get their gold
back", bar rounding), and after maxing, a PowerUp can be individually disabled and re-enabled — the only
exceptions being Reroll/Skip/Banish/Seal, which are opt-in buttons so the restriction is harmless
(https://vampire.survivors.wiki/w/PowerUps). **Permanent purchases that can be undone cost nothing in
depth and remove the possibility of ruining your save.** The genuine VS exception is the Golden Egg —
10,000 gold for a *random* permanent stat, with player reports that heavy Move Speed eggs degrade
movement control; mitigated by an egg-disable toggle and an NPC that removes eggs
(https://vampire.survivors.wiki/w/Golden_Egg; the harm claim is anecdotal — UNVERIFIED).

## 5. Teaching vs discovery — and the nuance the owner should see

Both games state the **WHAT** and never the **WHY**: VS descriptions are functional only; Megabonk's
Toggler tooltip is just "enable or disable items, weapons, or tomes" (quoted secondhand by a player —
UNVERIFIED wording). Synergy and pool math are left to the community, and both wikis exist partly to
teach what the games don't.

But the cost shows. Players cannot even *find* Megabonk's Toggler ("i can't really find a way to do
so" — Steam; "Wait you can toggle them off???" — Reddit), and there is a whole guide industry for
unlock order. VS's Seal has a documented workaround burden (players must be told to go to the
Collection menu), plus an exception list long enough that guides reproduce it.

**The refinement for HORDES:** hide the *implication*, do not hide the *tool*. Sk408's rule — the
player should feel smart for working out the trade-off — holds. But if the control itself is undiscoverable,
the player never reaches the discovery at all, and gets the anxiety without the payoff. The sweet spot is
the one already adopted for the draft: **surface the fact, hide the interpretation** (show a pool count,
never explain what it means).

## 6. What HORDES should steal / must not steal

**STEAL:**
1. **Full slots narrow the pool** (§2). Both games do it, it is one rule, it costs nothing, and it makes
   dilution self-limiting so the game never punishes a player for unlocking things.
2. **One pre-run enable/disable list** as the curation tool — Megabonk's shape: changes what can be
   *offered*, never what you already own; reversible; no per-toggle cost.
3. **Penalty-free refundability** for permanent purchases (VS PowerUps). Removes "I ruined my account"
   anxiety and is a one-line design promise.
4. **Filtering never retro-acts**: it cannot cancel a visible offer or remove a collected reward. A simple
   rule with no edge cases.
5. **The fact/interpretation split**: show pool size ("3 of 11"), never explain the implication.

**DO NOT STEAL:**
1. **Megabonk's pre-filter dilution trap** (§4) — unlocking widely must never make the game worse.
2. **A large untoggleable base-item set** — the most-complained-about part of Megabonk's system.
3. **Four overlapping pool systems** (Toggler + Banish + Refresh + Skip). The owner wants simple: ONE
   pre-run list, and at most ONE mid-run skip.
4. **Quota- or tier-gated pool tools** (VS Seal: 40,000+ gold across four tiers). Gate curation by a
   one-off unlock or playtime, never by a per-run quota — a quota tool is invisible to exactly the
   casual player HORDES is targeting.
5. **Global curation state with no presets** (Megabonk): players must re-edit the list for every build.
6. **A random permanent stat sink** (Golden Eggs): permanent + random + effectively unbounded is how you
   get players reporting that they degraded their own movement control.

## 7. Open questions for the owner (design calls, not engineering)

1. Does HORDES already narrow the draft pool when weapon slots are full? If not, that is the cheapest
   fix available and it may make a curation system unnecessary (VS/Megabonk both rely on it).
2. Should weapon-slot capacity grow with progression, and if so, does growth keep pace with the unlock
   catalogue — so that a fully-unlocked player never has a worse pool than a fresh one?
3. Is a curation list even needed, or does §2 plus the draft's own weighting already keep the pool
   healthy? Deciding this after the balance sim reports unlock net-value would be cheap.

## 8. UNVERIFIED (do not build on these)

- Megabonk Toggler cost and unlock trigger: sources conflict (4 vs 40 vs 50 Silver; "40 purchases" vs
  "40 quests"). The purchase-based reading is better supported but not officially confirmed.
- Whether Megabonk's toggle list is strictly account-global with no per-character presets (inferred from
  player complaints).
- Megabonk slot prices/milestones (25/125/35/135 Silver; 4+4 max) — consistent across IGN/GameRant, not
  confirmed from patch notes; one guide publishes older numbers.
- Banish/Refresh/Skip numbers for Megabonk (8 Silver, level 6, six uses/run) — single fan-wiki source.
- Whether Megabonk's Toggler affects chest/item drops as well as level-up offers ("loot pool" used
  loosely by sources).
- Whether Megabonk weapon/tome slots are refundable back to the default 2 (single player report).
- VS pool weights (8,130 / 1,370) are rendered live from wiki templates with all DLC and drift with
  content updates; they will not match a base-game save.
- Golden Egg harm (Move Speed degrading control) is player anecdote, not a developer statement.
- Whether VS has any scripted tutorial/onboarding (the "teaching" analysis is inferred from UI surfaces).
- Exact in-game Toggler tooltip wording (quoted secondhand only).
- Corrections to earlier internal notes: Megabonk's developer is solo dev **Vedinad**
  (https://en.wikipedia.org/wiki/Megabonk), not "Vediogames"; Megabonk is a 3D survivor-like whose
  movement/elevation interest comes from its 3D space, which is why its vertical feel does not port
  directly to a flat 2D arena.
