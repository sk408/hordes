# RSS8 — MAGNET COLLECTOR CARD — 2026-09-17

Owner ask (verbatim): "We could have a magnet collector card. A very rare
card that gives a skill to collect all drops every 30 seconds."

## 1. The card/draft ground (reported, as asked)

Rarity tiers on the draft ladder, and where rarity is decided:

| tier | where decided | knob |
|---|---|---|
| COMMON / RARE stat cards | `UPGRADES` (config.js), weighted draw in `openDraft()` | per-card `weight` |
| skill perk cards | `SKILL_PERKS` (perks.js) | `SKILL_CARD_WEIGHT` |
| **MYTHIC (the "very rare" tier)** | `DRAFT_MYTHIC_UPGRADES` (config.js), run-gated chase pool (`state.chasePool`), `pick()`'s MYTHIC branch | shared `MYTHIC_WEIGHT = 0.10` |

There is no rarer tier than MYTHIC on the ladder (CHASE exists only in the
card-ART deck vocabulary, not the run draft). "Very rare" therefore maps onto
MYTHIC — no new tier invented.

**Where the new card sits:** `DRAFT_MYTHIC_UPGRADES` gains
`magnet_collector` — the 4th entry beside Second Wind, Storm Shards, Full
Hand. It rides the SAME `MYTHIC_WEIGHT` knob as its family (it can never
appear more often than the mythic family rate), is gated on the chase-pool
roll, and is once-per-run via the `takenStats` ledger.

**Pool dilution, disclosed:** with a 4th card in the chase draw, each
specific mythic's per-run rate moves from 0.1 x 1.55/3 = **5.17%** to
0.1 x 1.55/4 = **3.88%** of runs. Rarity is the owner's lever — no gate
constant was changed to compensate.

**Card copy states what it does AND its cooldown** (the player-review rule
for specials):

> SKILL [X]: every gem, potion and item on the field sweeps to you · 30s cooldown

It also has a hand-painted art card (ace of diamonds, horseshoe motif) in
the CARD_EXPANSION deck — `MYTHIC` tier vocabulary, no rank+suit collision.

## 2. The skill — fired through the EXISTING skill input

`C.SKILLS.MAGNET_PULL` joins the existing skills table, not a new system:

- **Keyboard:** `X` — the same keydown→`runAction` route Q/E/H/N use; a
  no-op in runs without the card.
- **Touch:** the `MAG` button (`#tc-magnet`), shipped `hidden` in the markup
  and revealed only while the run holds the card; its badge (`#tc-mag`)
  reads the live cooldown through the same helpers `useSkill` pays ("29.4s"
  → "RDY"). The touch layout stays a single-column stack (smoke pins
  4 buttons + the hidden 5th).
- **Cooldown EXACTLY 30s** — `FLAT_CD: true`: neither the Focus perk nor the
  empty-rewrite-slot economy shaves it. The card says 30s, so it IS 30s.
  No mana price; the cooldown is the whole cost.
- **Reference/onboarding:** a `controls_ref.js` row (`X` / `MAG`), a manual
  CONTROLS-page row, and a `HINT_IDS` entry whose intro is armed only when
  the run actually HOLDS the card and there is something on the floor —
  never by the clock, never for a run without the control.

## 3. The sweep — one credit path, visible, totals displayed

The effect is a PULL, not an instant credit: for `SWEEP_S = 0.45s` every
ground drop (gems, potions, items) is drawn to the player
(`PULL_RATE = 14`, distance shrinks ~99.8% — everything lands inside pickup
radius from any field distance), plus an expanding-ring tell
(`RING_RADIUS = 110`). The NORMAL pickup loop then pays every drop through
the one credit path: XP mults apply, the potion cap is respected (over-cap
potions stay on the ground — value never destroyed), and items go through
the real equip decision (in-place REPLACE / IGNORE / +1 heat).

At sweep end a toast DISPLAYS the per-type total:
`MAGNET SWEEP: 6 GEMS · 3 POTIONS · 1 ITEM`.

**Wall-clock slot (the bug the first cut had):** the sweep countdown ticks
on `realDt` in `frame()`'s pre-dispatch slot (beside `tickNight`), NOT in
`update()`. Sweep-collected gems level the player, the level-up draft parks
the mode, `update()` freezes — a 0.45s sweep inside `update()` could stall
indefinitely under overlays. `realDt` also makes it dilation-immune.

## 4. Interaction with the queued boss-clear ground-drop sweep

Complementary by construction, no silent loss either way: the boss-clear
sweep (arena task, queued) credits on the boss-death path; the magnet is
player/AUTO-fired on a 30s cadence. Both funnel into the same pickup loop
and the same toast grammar — whichever fires first empties the floor, the
other finds nothing and reports "nothing to collect" rather than inventing
a second payout.

## 5. Auto-pilot parity

Both directions, one policy constant (`C.MAGNET.AUTO_MIN = 25`):

- MANUAL fires it through the same act (key `X` / `MAG` tap).
- AUTO fires it on its own when >= 25 ground drops are outstanding, inside
  the existing `autoCastSkills` block (the AUTO_DRINK lineage), and never
  re-arms it mid-cooldown.

## 6. Gold delta — measured, NOTHING tuned

`tools/rss8_gold_delta.mjs`, two arms on the REAL loop (`runRealCohort`,
maxed stage, 8 runs/arm, identical except `st.player.skills.magnet` from
run start — the exact flag the drafted card writes; the draft pick itself
is RNG and would add noise). Reported as settled gold/run + time/run:

```
noCard : purse/s mean 25.9   purse=[2826,3339,2787,4805,3597,2735,4595,4234] time~[137-147]s
magnet : purse/s mean 23.5   purse=[4697,2991,2132,2933,3253,3149,3790,2853] time~[135-140]s
```

(Measured as the LIVE PURSE delta per run at a fixed 180s-frame truncation —
maxed runs reach the END_WAVE finale ~190s and die inside the maw's
death-cine without a settle, so end-of-run settlement reads 0 for both arms;
the in-run wallet rate is the honest comparable. Tooling note: this needed a
small optional `onRunStart` hook in tools/real_loop.mjs — the shims cannot
be installed twice in one process, so a second bootReal-based harness next
to the cohort was not an option.)

**Result: no significant delta.** The distributions overlap heavily
(noCard 2735-4805, magnet 2132-4697 per run); the ~9% mean gap is inside
run-to-run variance. Exactly as the design predicts: gems and potions do not
despawn, the AUTO pilot already walks its loot, so a faster floor clear buys
uptime, not income — the card is a CONVENIENCE (burst-collect on demand,
rescue drops before a boss sweep) rather than an income buff. **No balance
constant was changed and none is indicated.**

Gems and potions do not despawn and the AUTO pilot already loots, so the
delta is TIME-shaped (faster floor clears → more combat uptime), not
guaranteed-positive. **No balance constant was changed** — the existing
skills' constants are pinned unchanged in the node battery
(FROST_NOVA 8s/30 mana, OVERCHARGE 12s/25 mana).

## 7. Verification

- `test/test_rss8_magnet.mjs` — 23 checks: ground (MYTHIC ladder, shared
  weight knob), chase-gate + once-per-run, every drop type through the one
  credit path, exact 30s cooldown + spam refused + 30s rhythm, displayed
  totals, potion-cap respect, AUTO threshold both sides, no-card no-op,
  badge live readout.
- Full suite: **138 files, redfiles=0** (disclosed test updates:
  card-art expansion vocabulary + ace glyph, perks FLAT_CD branches,
  ref-access MAG inventory entry, smoke's pad count 4+hidden-5th,
  onboarding HINT_IDS list).
- `tools/verify_rss8_magnet.mjs` — REAL browser (390x844): MAG hidden
  without the card / revealed with it, a real tap collects every seeded drop
  type and DISPLAYS the total, badge counts down from 30, spam taps
  refused, the `x` key parity, AUTO fires on policy. Screenshot:
  `shots/rss8-magnet-sweep.png`.
