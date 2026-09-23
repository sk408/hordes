# TIER-2(d) CARD PARALLEL/VARIANT SYSTEM — capture notes + report

Owner rulings (verbatim): "do like sports cards do and have varieties. Different
looking cards. Shiny cards, pulsing cards, colored background cards, cursed
cards" + "a cursed possibility sounds like a fun addition" + "Then we also need
a blessed variant." Numbers below are TUNE-AFTER (the review phase adjusts);
shipped coherent, cited defaults.

## Mechanism (file:line)

ONE seam: a PARALLEL stamped on an existing card at OFFER time — seeded,
weighted, deterministic, additive, never a registry mutation.

| Piece | Where |
|---|---|
| Parallel registry + weights + effect mult + drawback + art derivation (PURE) | `src/parallels.js` — PARALLEL_WEIGHTS :49, PARALLELS :70, CURSED_HP_COST :66, rollParallel :101, stampOfferParallel :113, parallelEffectMult :121, applyScaledNumbers :140, cursedHpDrawback :167, hash32/pulsePhase :177-186, parallelCardArt :351 |
| Toggle (read once at module scope, the W7b `HORDES_DRAFT_LADDER` pattern) | `src/main.js:4443` `PARALLELS_ON = globalThis.HORDES_PARALLELS !== false` |
| Offer assembly stamp (AFTER the weighted draw, BEFORE DOM build) | `src/main.js:4557-4561` — one `stampOfferParallel(choices[i], rollParallel(state.parallelRng))` per offer |
| Deterministic stamp stream (existing seed streams only) | `src/main.js:8773` `state.parallelRng = mulberry32((state.choiceSeed ^ 0x9a11) >>> 0)` — the `state.shrineRng = mulberry32(choiceSeed ^ 0x5eed)` pattern (`src/main.js:8771`); no new persisted seed, no wall clock. The offer-WEIGHT draw stays plain `Math.random` (`src/main.js:4530`) and is NEVER touched by stamp rolls, ON or OFF |
| Badge on the offer card (plain text, tier-badge precedent) | `src/main.js:4600-4605` (`parBadge`) |
| Variant art paint through the REAL drawCard path | `src/main.js:4626` `paintOfferArt(artCv, u.id, OFFER_ART_SCALE, u.parallel)` -> `src/draft_card_art.js:109` -> `src/render_cards.js:31` `drawCardArt` (the ONE painter `drawCard` delegates to, `render_cards.js:39-40`) |
| Effect application (parallel multiplier rides the numbers seam) | `src/main.js:4766` (multi-overflow listed +20%), `:4774-4776` (taper listed +/-15%), `:4781` `applyScaledNumbers(u.apply, p, mult)` (every other card) |
| Cursed drawback (the ONE shared cost) | `src/main.js:4813-4815` after the effect chain |
| ONE OF EACH compensation (deliberately UNSCALED — the RULE's payout) | `src/main.js:4789-4806` (untouched) |
| Test seams | `src/main.js:12885-12891` `__TEST.parallels` |

## Parallel-type table

Offer weights = per 100 offered cards (one weighted roll per offer; the 'none'
bucket dominates). Effect mult = the card's listed numeric effect multiplier.

| Parallel | Kind | Visual (derived from the base motif) | Effect | Weight | Rationale |
|---|---|---|---|---|---|
| none | — | base card | base | 80 | the common card; absent roll is byte-identical to pre-change |
| SHINY | COSMETIC | gold-foil: frame keys onto a gold ramp + diagonal glint band (body/shade) | base, byte-unchanged | 8 | the everyday sports-card foil |
| PULSE | COSMETIC | frame-phased shimmer: still light band across frame+body at a deterministic HASH phase (`pulsePhase` = FNV-1a of the card id mod 6) — NO wall clock, decor-still doctrine (`src/enemy_sprites.js:169` shape), so 60/120Hz is trivially identical | base, byte-unchanged | 5 | "pulsing cards" without animation machinery |
| CHROMA | COSMETIC | rarity-family colored BACKGROUND (body+shade tinted): RARE/MYTHIC from the `src/rarity.js` encounter tells (`#6fd8ff` / `#c89aff` lightened), CHASE from the deck's red (`SUIT_COLOUR.red`), COMMON a moss wash (the one family with no tell) | base, byte-unchanged | 3.5 | "colored background cards" keyed to the rarity families |
| CURSED | GAMEPLAY | dark omen: ash-violet palette ramp + a curse diamond in the two pip-free corners | listed effect **x1.5** + **ONE** shared drawback: **-15 HP on pick** on the existing `p.hp` surface | 3 | "cursed possibility" — power at a price; one simple consistent cost (no bespoke per-card curses) |
| BLESSED | GAMEPLAY | radiant: white-gold ramp + halo ring inside the frame + star marks in the pip-free corners | listed effect **x1.25**, no drawback | 0.5 | "we also need a blessed variant" — strictly the rarest stamp ("much rarer") |

TUNE-AFTER numbers called out as such: the 80/8/5/3.5/3/0.5 weight split, the
x1.5 / x1.25 multipliers, the flat 15 HP cost (15 of base max HP 100,
`C.PLAYER.MAX_HP`), PULSE_PHASES 6.

Drawback surface citation: `p.hp` — the player HP field created in
`src/entities.js:9` (`makePlayer`), the one HP bar every hit, heal, potion and
the Second Wind revive already read/write. NO new stat surface.

## drawCard / offer integration

- `openDraft` pool -> weights -> pick is unchanged (`src/main.js:4465-4534`).
  The stamp is a POST-DRAW pass over `choices` (`:4557`) — the draw's
  `Math.random` order and the registry weights are byte-identical with the
  feature on or off.
- The stamp rides the OFFER OBJECT (the pool row the draw already copied via
  `{...row, weight}`): exactly one new field `parallel`. Registry rows
  (`UPGRADES` / `DRAFT_RARE_UPGRADES` / `DRAFT_MYTHIC_UPGRADES` / rule / perk /
  rewrite / frost / weapon cards) are never reached (`stampOfferParallel`
  builds a copy, `src/parallels.js:113-117`).
- Art: `paintOfferArt(cv, offerId, scale, parallel)` (`src/draft_card_art.js:109`)
  resolves the deck card via the existing `deckIdForOffer`, then paints either
  the base (`drawCard`) or the DERIVED variant (`parallelCardArt` ->
  `drawCardArt`) — the same painter, one fillRect per inked cell.
- Variants are derived remaps: same grid ink MAP (recolour only), same palette
  key set (no new keys — art-lint palette discipline by construction), same
  24x34 box, same transparent corner silhouette. No 50 hand grids; no base
  needed a redraw.

## Effect-math proof (pinned in test/test_tier2_parallels.mjs)

Delta-scaling rule (`applyScaledNumbers`, `src/parallels.js:140`):
`after = before + (rawAfter - before) * mult` — the LISTED number scales.

| Card (listed effect) | raw apply | CURSED x1.5 | BLESSED x1.25 |
|---|---|---|---|
| Whetstone +25% weapon damage | damage x1.25 (10 -> 12.5) | x1.375 (10 -> 13.75) | x1.3125 (10 -> 13.125) |
| Iron Heart +25 max HP and heal 25 | maxHp 100->125, hp 80->105 | maxHp 137.5, hp 117.5 | maxHp 131.25, hp 111.25 |
| Light Boots +15% (taper 1st pick) | speed x1.15 | x1.225 | x1.1875 |
| Split Shot overflow +20% dmg | damage x1.2 | x1.3 | x1.25 |
| Thornmail +6 thorns (introduced field) | thorns 6 | 9 | 7.5 |
| Second Wind (boolean flag) | flag set | flag set (face value) | flag set (face value) |
| Cursed drawback (all cursed cards) | — | hp -15, floor 1 | none |

Cosmetic / absent stamp: mult 1 short-circuits to the raw `apply(player)` —
byte-identical numbers (pinned).

## Pins touched + why

| File | Change | Why |
|---|---|---|
| `src/parallels.js` (NEW) | the one pure seam | registry, roll, stamp, effect math, drawback, derived variant art |
| `src/render_cards.js` | +`drawCardArt` (`drawCard` now delegates — behaviour byte-identical) | the ONE painter both the base and the derived variants ride; proves "via the real drawCard path" |
| `src/draft_card_art.js` | `paintOfferArt` gains optional `parallel` arg (absent = byte-identical base call) | offer-art funnel is the only place a variant needs to surface |
| `src/main.js` | toggle :4443, stamp :4557, stream :8773, badge :4600, paint :4626, pick math :4766-4815, `__TEST.parallels` :12885 | the integration points above; every edit is additive or mult-1-identity |
| `test/test_card_art_expansion.mjs` | +PARALLEL VARIANTS section :532 (derived: every deck card x every parallel) | "card-art coverage GREEN for variant art (derived-variant allowance extended in the TEST the same derived way - no hardcoded id lists)" — header :74 states the allowance |
| `test/test_tier2_parallels.mjs` (NEW) | 26 checks | the acceptance pins (below) |
| `test/test_rewrites.mjs` | C7/D6 arm runners pin `st.parallelRng` beside their `Math.random` pin | the two verbatim no-drift pins compare full offer HTML across two seeded arms; the stamp is a SEPARATE seeded stream (never Math.random), so a verbatim compare must pin BOTH streams per arm or the badge text is undefined across arms. The pin is STRENGTHENED: "zero draft-stream drift" now covers the offer's parallel skin too |
| `tools/capture_tier2_parallels.mjs` (NEW) | capture tool | the shots in this dir |

Badge class is `par`, NOT `syn` (main.js:4600): the synergy-hint contract owns
`class="syn"` (test_synergy_hint asserts every `.syn` line names a real
synergy) — the parallel badge is its own line kind, styled inline (the
`.card .syn` typography + z-index layering mirrored, no stylesheet edit).

Base registry effects/weights: byte-identical — quoted deep-equal of the
UPGRADES/RARE/MYTHIC rows (id/name/desc), the whole DRAFT_LADDER block,
DRAFT_STAT_WEIGHT, RULE_CARD_WEIGHT and the ONE OF EACH rule text is pin #5 of
the new test. Protected intents (ONE OF EACH rule text/compensation, 6s
auto-pick, buy-back, dev.drafts accounting) untouched — auto-pick rides the
same `activateDraftCard -> pick` seam and applies stamps by construction
(pinned).

## Acceptance pins (test/test_tier2_parallels.mjs + the art section)

1. parallel rolls deterministic per seed (pure replay + seeded openDraft);
2. OFF toggle / absent roll = byte-identical offered card (deep-equal, seeded)
   — the OFF arm boots `HORDES_PARALLELS=false` and quotes the PRE-CHANGE key
   sets; the ON arm with forced-none rolls is row-for-row deep-equal to the OFF
   arm's rows under the same Math.random seed (THE regression gate);
3. cursed pick x1.5 + exactly ONE drawback on cited `p.hp` (maxHp/mana/purse/
   luck asserted untouched);
4. blessed x1.25 + no drawback + strictly rarest weight (table assert + 40k
   seeded rolls: 213 blessed < 1214 cursed < 1407 chroma < 1957 pulse < 3253
   shiny < 31956 none);
5. base registry untouched (quoted deep-equal against pre-change values);
6. ONE OF EACH behavior identical with/without parallel (ledger, pool
   exclusion, +10%-at-cap compensation UNSCALED even on a cursed card);
7. card-art coverage GREEN for all 5 variants x every deck card (derived loops;
   ink map identical, key set identical, base byte-untouched, pairwise
   distinct variants, one-rect-per-inked-cell through drawCardArt).

## Suite

`bash tools/run_all_dev.sh` -> `SUITE greenfiles=188 redfiles=4`
`REDLIST: test/test_evolution.mjs test/test_weapon_overrides.mjs test/test_weapons.mjs test/smoke.mjs`

- Named trio (STANDALONE-RED, pre-existing, untouched tracks — the gates's
  expected reds): `test_evolution` (evolution instance-def data),
  `test_weapons` (weapon ladder step values, 8 checks), `test_weapon_overrides`
  (the dmg-override table contract, 5 checks) — all pure weapons/evolutions
  data; this slice touches none of those modules.
- `test/smoke.mjs` — known flake, STANDALONE-GREEN x5 (`held ArrowRight must
  move the pilot (dx=...)` — the unseeded weather wind pushes the pilot, a
  pre-existing mechanism; dx varies 6.5-16.9 vs the >20 bar). It was green in
  one of this slice's suite runs and red in two — the smoke protocol applies.
- Other suite-only flakes observed across runs and STANDALONE-GREEN:
  `test_pilot_grind`, `test_portal_park`.
- 188 green matches the brief's ideal line (188 green / 3 red ideal (+new
  test)); the +1 file over 191 is this slice's `test_tier2_parallels.mjs`.

## Shots (all: real drawCard path — parallelCardArt -> drawCardArt, the
painter drawCard itself delegates to; 96x136 = 24x34 at the integer
OFFER_ART_SCALE 4; regenerate: `node tools/capture_tier2_parallels.mjs`)

5 parallel types x 4 base cards = 20 shots — COMMON number (hp / Iron Heart),
RARE face (thornmail / Thornmail), MYTHIC ace (killshot / Killshot), CHASE
joker (second_wind / Second Wind):

- shiny-{hp,thornmail,killshot,second_wind}.png — gold foil + glint band
- pulse-{...}.png — hash-phased shimmer band (phases measured: hp 0,
  thornmail 0, killshot 4, second_wind 3 — deterministic per card id)
- chroma-{...}.png — backgrounds: hp moss (COMMON), thornmail cyan (RARE),
  killshot violet (MYTHIC), second_wind red (CHASE)
- cursed-{...}.png — dark omen + corner diamond sigils
- blessed-{...}.png — radiant + halo + corner stars
- parallels-sheet.png — 5x4 contact sheet (parallel rows x base columns)

## OWNER-RULING additions (interactions parked, NOT special-cased)

1. CURSED/BLESSED on discrete-effect cards (weapon level-ups, flag-grant
   mythics like Second Wind, rule/skill/rewrite grants): the multiplier scales
   every NUMERIC delta; a boolean flag or a discrete side effect
   (levelUpWeapon) has no fractional axis and lands FACE VALUE + the cursed
   cost. Parked — a per-card exception would be the bespoke special-casing the
   owner ruled out.
2. Fractional counters at x1.5/x1.25 (pierce +1 -> 1.5, Full Hand +1 draft
   offer -> 1.5): consumers read them as bounds (1+pierce budget, loop counts),
   so a 1.5 reads as the next whole step. An integer rounding policy is a
   review-phase knob — parked rather than silently rounded.
3. A cursed pick can NEVER kill: the -15 HP floors at 1 HP. If lethal picks
   (draft-time death) are wanted, that is a ruling.
4. ONE OF EACH's +10%-at-cap compensation stays UNSCALED on a cursed/blessed
   card — it is the RULE's payout, not the card's effect ("ONE OF EACH
   behavior identical with/without parallel"). If the curse should tax the
   compensation too, that is a ruling.
5. CHROMA is keyed to the RANK CLASS rarity family (COMMON/RARE/MYTHIC/CHASE).
   If "rarity-family colored" meant the SUIT family (damage/survival/economy/
   utility), the tint table swaps — parked as a reading call.

## Unverified (tune-after, stated)

- All offer-weight economics: the 80/8/5/3.5/3/0.5 table (any split in the
  same rarity ORDER keeps every pin above; only the frequency tolerances
  track the numbers).
- The x1.5 / x1.25 multipliers and the flat 15 HP cost (coherence-checked via
  the effect-math table, not balance-simmed across a run).
- PULSE_PHASES=6 and the visual treatments' strengths (foil glint density,
  cursed darkness) — aesthetic knobs.
- The 60/120Hz claim for PULSE is BY CONSTRUCTION (a still, hash-phased grid —
  nothing reads a clock or accumulates dt); no frame-parity sim was needed or
  run.
