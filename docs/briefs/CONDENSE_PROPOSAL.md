# CONDENSE PROPOSAL — 2026-09-17

Source: docs/feedback/2026-09-17-player-review.md (verbatim player review). Owner direction: "sit down
and think about what you want. Condense, keep the good stuff, drop complexity." This document proposes;
the owner accepts or rejects line by line. Nothing here is implemented. Every number below is read from
the game's own code/data (file:line cited); no measurement needed a sim longer than the 60-second cap —
the run-income bands are the game's own recorded bands (src/meta.js:235-245), not new simulations.

> **CORRECTION 2026-09-17 (task VJBFV audit): C4 below is STALE.** Challenges
> now PAY: every non-standard run adds RUN_GOLD.CHALLENGE_BONUS_PCT (+200
> percentage points) to the end-of-run award pool (challenges.js:78-83,
> player-review item 2). C4's "NO reward by design / Loss: none" no longer
> holds; the challenge dial is a paying risk contract and moves to KEEP in
> §10. The rest of C4's reasoning (a dial that duplicates HEAT's job) is
> answered there too.

## 1. TARGET EXPERIENCE

A player opens HORDES for a 5–15 minute run, watches a build come online mid-run (new weapon, first
elite kill, lightning zapping a chaser wall), and banks visible progress toward ONE next thing. They
come back because the next thing is close enough to taste tonight — and, if they choose to leave it
running, the game plays itself honestly and pays reduced rates for it.

## 2. KEEP (the review's own evidence)

- K1. The moment-to-moment combat — review: "core gameplay is actually pretty good, much better than
  the ratings suggest." (main.js/render.js core loop.)
- K2. The animations and on-screen spectacle — review: "the animations are cool and I love seeing
  lightning zap all those chasers :)" (ZAP weapon, render.js effects).
- K3. The 9-weapon ladder as a concept — distinct archetypes (ORBIT..BEAM, meta.js:373-383); the review
  never complains about the weapons themselves, only the pricing (see §4).
- K4. The draft/intermission rhythm — one decision between waves; the review's complaints are about
  pacing around it, not it.
- K5. Help mode + the manual (4-page HOW TO PLAY, main.js:4050-4125) — recently shipped, pointing the
  right way; potions section extends it (review item 3, in the mechanical bundle).
- K6. The escape minigame as an idea — review: "a nice idea"; keep the mode, fix the length and payout
  (in the mechanical bundle; the proposal-level call is only whether it stays a run staple).
- K7. HEAT dial — a self-paced risk/reward control the player chooses (+30% gold/push, cap 20,
  heat.js:22-42); this is what the special-run modifiers should have been (see C4).
- K8. Adaptive difficulty touches (potion drop throttling above 20 kills/s, config.js:266-283) —
  invisible when right; keep the behaviour, explain none of it.

## 3. CUT / FOLD (each line is one accept/reject decision)

- C1. ARENAS 8 → 3. Cost today: 8 near-identical choices (stages.js:33-167 — same map size, differences
  are pool weights + stat mods + one hazard; "barely noticeable" per the review). Loss: almost nothing —
  the strongest three mods (BLOOD RUST elite pressure, VOID REACH damage, WHITEOUT everything) cover the
  felt range. Recommend: CUT to 3, delete the rest from stages.js.
- C2. CHARACTERS 4 → 3 or fold. Cost today: 4 characters that converge ("every character type becomes
  the same" — review); all share MANA.MAX 100 / REGEN 0.5 (config.js:166-169); Witch is the only one
  that touches resources. Loss: KNIGHT/ROGUE/PALADIN identities are stat-sticks players can't feel.
  Recommend: KEEP but fold into resource differentiation (§5) — cutting playable characters angers
  more than it condenses; making them differ in KIND is the real fix.
- C3. SHOP 46 ROWS → ~20. Cost today: 36 stat rows + 7 weapon rows + 3 elite unlocks + writ
  (meta.js:423-580). Loss: late-tier verticality; keep it by making the kept rows deeper (more tiers),
  not wider. Recommend: FOLD — merge duplicate-feeling rows (Vitality/Grand Elixir family, the three
  mana rows), keep one row per concept.
- C4. CHALLENGE RUNS (3 modes) → fold into HEAT. Cost today: STANDARD / ONE_WEAPON / NO_POTIONS with
  NO reward by design — challenges.js:8-9 settles gold "EXACTLY like a standard run"; the review:
  "special runs don't clearly explain what you GET." Loss: none — there is nothing to get today.
  Recommend: CUT the no-reward dial; if a restricted run returns, it returns as a HEAT-style contract
  with the multiplier ON the card (the mechanical bundle makes the current three state their terms
  meanwhile).
- C5. SETTINGS surface ~12-15 cards → ~8. Cost today: MUSIC, SFX, TEXT HUD, ZOOM(6 stops),
  RESOLUTION(4 stops), PILOT(3), HOW TO PLAY, REPLAY TOUR, EXPORT, IMPORT, RECOVERY(+PREVIOUS), RESET,
  END RUN, escape TEST, BACK (main.js:5736-5866) — "WAAY too many settings" per the review. Loss:
  little; ZOOM+RESOLUTION collapse into one "DISPLAY" choice for most players. Recommend: KEEP the
  top-level cards, FOLD ZOOM/RESOLUTION/TEXT-HUD behind one ADVANCED card.
- C6. ELITE UNLOCK ROWS (3, meta.js:392-405, 1M/1.8M/2.8M) → fold into the weapon they modify.
  Recommend: FOLD (an elite modifier is a property of its weapon, not a shop aisle).

## 4. PROGRESSION CURVE

**FOLDED 2026-09-17 into docs/PACING.md** (the one pacing document; task
msg_01M2QV1H7EJ3NSHAZT57SW944P). The section below is retained as the
historical record only — see PACING.md §1 (measured income) and §2 (the four
invariants) for the live numbers and §6 there for the folded citations.

**STATUS 2026-09-17 (owner correction): UNVERIFIED — DO NOT USE THESE NUMBERS.** The income figures below
were read off a constant table (meta.js:235-245) and interpreted as run income; that interpretation is
WRONG (owner: "Mid game run is NOT 200g. That's obscenely wrong. A new player can get 300g easily. One with
a couple upgrades can get near 2000g"). A measured table (gold/second headless, x run duration, calibrated
to the owner's anchors) is being produced for docs/PACING.md; until it exists the ladder-compression
proposal in this section is WITHDRAWN, not proposed. The price citations (what upgrades COST) stand; only
the income side was misread.

Invariant to hold: "a good run is worth about one next-step upgrade at every stage of the game."
CONSTANT-TABLE reading (UNVERIFIED, see status above):

- Early: runs 1-5 pay ~70g (meta.js:235-245 band), cheapest upgrades 120-200g → ~2 runs per upgrade.
  About right.
- Fourth-weapon era: NOVA_PULSE 1,200,000 / SCYTHE 2,000,000 (meta.js:373-383) against mid-band income
  (~200g at runs 21-45; ~754,689g only for a maxed 1800s run) — a non-maxed "good" run nears a
  QUARTER of one weapon purchase. This is exactly the review's "a good run nets you only 1/4th of a
  single upgrade."
- Late: top rows 4.0-4.5M (meta.js:423-580) vs maxed-run 754,689g → 5-6 maxed runs per row.

Gap: the ladder is near-linear in price (200 → 4.5M is x22,500) while income is flat then cliffed.
Proposed adjustment (one decision): compress the weapon ladder to ~x400 total (200 → ~80k for BEAM) and
the top stat rows to ~x100 of their base, keeping "one good run ≈ one next step" at each band — OR
raise band income (settleRunGold AWARD 70, main.js:3639-3661, and per-kill tiers, meta.js:297-305) to
match the current prices. Cutting prices touches one file; raising income rebalances every band — the
first is lower-risk.

## 5. RESOURCE DIFFERENTIATION (trade-offs, not one answer)

Review evidence: "Mana regen is overpowered, so you never need the cap" (REGEN 0.5/s vs costs tuned
around it, config.js:166-169) and "health drops (and regains) so rapidly that only your max matters."

- R1. MANA — option A: regen pauses while a skill is on cooldown's fresh cast (cap becomes the burst
  budget); option B: regen scales with wave time alive, not real time; option C: cut base regen ~60%
  and let Witch's 0.5x cost be the identity. A is the smallest change that makes MAX_CARRIED mana
  potions matter.
- R2. HEALTH — option A: slow the swings (damage smoothing over 1s) so healing choices exist; option
  B: potions become the ONLY in-combat heal and boss-curse (main.js:6661) becomes the visible rule;
  option C: overkill damage carries, making max HP a real stat rather than a buffer.
- R3. CHARACTER KINDS — Knight: damage-soak economy (block meter refilled by hits taken); Rogue: tempo
  economy (speed feeds skill cooldown); Witch: spend economy (deep mana, paper HP). One line each;
  effort in §8. These are alternatives — the owner picks a direction, not all three.

## 6. AUTO / IDLE SUPPORT — TWO DIRECTIONS, OWNER'S CALL

**STATUS 2026-09-17 (later same day): the owner has CHOSEN DIRECTION B (NIGHT MODE, opt-in full auto, 50%
gold) as the answer to unattended progress.** Direction A (idle currency) is PARKED as the fallback — its
build is on hold; it gets a real night of Night Mode play before any second idle system is considered
(adding both would add exactly the complexity the review complains about). The Direction A bullets below
are kept as the accrual DESIGN RECORD for that fallback: rate per hour, cap, upgrades-per-night at each
band, and the "no idle detection needed — elapsed wall-clock from a saved timestamp, clamped" insight.

Review evidence: "The fact that runs don't auto-restart (nor waves) means I can't actually let the game idle
for hours and expect to come up with at least one or two upgrades the following night."

ONE ACCEPTANCE TEST FOR BOTH DIRECTIONS (from the review, verbatim): unattended overnight play is worth
about ONE OR TWO UPGRADES. Against the game's own bands (meta.js:235-245; cheap upgrades 120-200g,
§4): one night = ~8h = ~60-100 short runs at today's ~2-5 min/run manual cadence — so whichever direction
ships must deliver ~120-400g of bankable progress per night at the EARLY band (1-2 cheapest upgrades) and
the equivalent fraction of a next-step upgrade at every later band. Numbers per direction below.

### DIRECTION A — IDLE CURRENCY (PARKED fallback; design record only, do not build)
A currency that accrues while the game is closed/idle and converts to shop gold. Design record: accrual by
elapsed wall-clock from a saved timestamp, clamped (no idle detection needed); rate per hour + cap to be
sized from the measured income table once it exists; re-enters evaluation only if Night Mode's real
overnight numbers come in short of "one or two upgrades".

### DIRECTION B — OPT-IN FULL AUTO ("NIGHT MODE", spec)
- B1. Toggle, OFF by default, title-screen only.
- B2. Waves auto-advance: intermission CONTINUE fires 8s after the draft is resolved (the only ladder
  step today is manual CONTINUE, main.js:2315/6811).
- B3. Intermissions auto-pick: policy FIXED as "highest-tier offer, first slot on tie" (no heuristic
  knob — one policy, documented).
- B4. Runs auto-restart with the same build and arena (today: death screen is manual RETRY/EXIT,
  main.js:3751).
- B5. Escape minigame: auto-SKIP in Night Mode (no payout, same as manual skip today).
- B6. What the player gives up (pick one): (a) gold at 50% of normal, records kept; (b) full gold,
  runs flagged ASSISTED and excluded from best-run records; (c) both. Recommend (b) — the review wants
  overnight income, punishing it by half defeats the point, and record integrity survives a flag.
- B7. Upgrades-per-night estimate (B6b, full gold): UNVERIFIED pending the measured income table (see
  §4 status) — the earlier draft multiplied run counts by constant-table "bands" that do not represent
  run income. Redo from the measured gold/second once docs/PACING.md has it; the exact number also needs
  one overnight soak, outside the 60-second sim cap.

## 7. WHAT AM I WORKING TOWARDS (candidates — pick one, maybe two)

- G1. ARSENAL FINISH LINE: own all 9 weapons + the folded elite mods; a visible "9/9" collection
  screen. Effort M; works with the §4 price compression; the closest-term goal.
- G2. PRESTIGE: banked gold converts to permanent paragon stats on reset; the long grind becomes the
  goal. Effort L; risks re-adding the complexity the review complains about.
- G3. WEEKLY SEEDED RUN: one fixed-seed, fixed-build run everyone shares, leaderboard local. Effort M;
  answers "what am I working towards" socially rather than numerically.
Recommend G1 now (it is mostly presentation over existing data) and revisit G3 after condense lands.

## 8. EFFORT AND RISK

- C1 arenas: S. Risk: saved profiles referencing cut stages — migrate to default on load.
- C3 shop fold: M. Risk: save-schema coupling in the 46-row registry; needs a migration.
- C4 challenge fold: S. Risk: none (no reward state exists to lose).
- C5 settings fold: S. Risk: tests pinning settings card order.
- C6 elite fold: S-M. Risk: elite unlock state in saves.
- §4 price compression: M. Risk: mid-game saves suddenly rich (a one-time wealth rescale or accept it).
- R1-R3 resource work: M each, L if all three. Risk: rebalancing every band; do after the curve fix.
- A1-A6 Night Mode: M. Risk: unattended sessions must not wedge (needs a soak test); record flagging
  must not leak into normal runs.
- G1 collection screen: S-M. Risk: none beyond UI.

---

# PART 2 — PRUNE INVENTORY (task VJBFV, 2026-09-17): every player-facing option and menu item, measured then proposed

What PART 1 already covers (not re-derived here): the KEEP list (§2), the
arena/shop/settings CHALLENGE cut-fold sketch (§3 C1/C3/C5/C6 — C4 is
corrected above), the progression curve (§4, folded to docs/PACING.md),
resource differentiation (§5), auto/idle (§6, Night Mode SHIPPED), long-term
goals (§7), effort/risk (§8). Part 2 adds what Part 1 lacked: the COMPLETE
per-item inventory with code evidence (§9), the four-tier prune proposal with
before/after counts (§10), the trimmed menu PHOTOGRAPHED next to the current
one (§11), and the newly parked idle-buyables idea (§12). In-run HUD controls
(keys, touch buttons, the draft) are controls, not options — out of scope.

## 9. THE INVENTORY (one row per player-facing item)

Columns: what it ACTUALLY changes (code evidence, not the label's promise) ·
M=material to play / C=cosmetic · D=discoverable without the manual ·
default · one-way?

### 9a. Title menu — `showTitle()` main.js:5508-5569

| Item | Changes | M/C | D | Default | One-way |
|---|---|---|---|---|---|
| START GAME (5521) | fresh save → manual, else startRun | M | y | — | n |
| LOAD FROM DISK (5530, fresh browser only) | pickImportFile — same as IMPORT | M | y | hidden w/ save | n |
| SHOP (5532) | door: 46 upgrade rows + apex door | M | y | — | — |
| CHARACTERS (5533) | door: equip/buy pilots — DUPLICATES the SHOP's CHARACTERS door (5663) | M | y | — | — |
| LOADOUT (5538-5541) | persisted profile.loadout → starting weapons (5478-5487) | M | y | default kit | n |
| PROGRESS (5547) | door: TROPHIES + BESTIARY (5270-5284) | C | y | — | — |
| SETUP (5549) | door: challenge/stage/night/settings (5286-5313) | M | y | — | — |
| HOW TO PLAY (5554) | the 4-page manual (4268) | C | y | — | — |
| EXIT GAME (5556) | autosave + window.close (5243-5262) | C | y | — | n |

**9 cards on a fresh browser, 8 with a save.** The code comment (5542) still
says "six (seven fresh)" — the count outgrew its own charter.

### 9b. SETUP sub-screen — main.js:5286-5313 (5 cards)

| Item | Changes | M/C | D | Default | One-way |
|---|---|---|---|---|---|
| CHALLENGE (5293) | 3 values (challenges.js:38-44). ONE_WEAPON=1 weapon slot; NO_POTIONS=0 potions. Non-standard pays +200pp end-of-run award (challenges.js:81-83). Session-only, never persisted | M | y (terms on card) | STANDARD | n |
| STAGE (5296) | 8 arenas (stages.js:33-178): pool + stat mods + hazard + relief, below in 9e. Locked by achievements; session-only (reload reverts) | M | partial (blurb only — no numbers shown) | VERDANT HOLLOW | n |
| NIGHT MODE (5302-5308) | two-press arm; full-auto run at 50% gold pool, auto-continue/restart, watchdog | M | y | OFF | n |
| SETTINGS (5309) | door → 9c | — | y | — | — |
| BACK (5312) | — | — | y | — | — |

### 9c. SETTINGS — `showSettings()` main.js:6121-6264

| Item | Changes | M/C | D | Default | One-way |
|---|---|---|---|---|---|
| MUSIC (6130) | audio.setMusicEnabled (audio.js:263), persisted | C | y | ON | n |
| SFX (6134) | audio.setSfxEnabled (audio.js:270) — gates every playSfx | C | y | ON | n |
| TEXT HUD (6139) | DOM HUD text on/off (8194/8202), persisted | C | y | OFF | n |
| ZOOM (6144) | 6 stops [1,2,3,4,6,8] (4224); state.zoomScale → render only — "not run state" (4222) | C | y | 1 | n |
| RESOLUTION (6151) | 5 stops AUTO/PIXEL-PERFECT/2/3/4 (238); fitCanvas crispness | C | partial | AUTO | n |
| PILOT (6162) | 3 rungs AUTO_ALL/AUTO_MOVE/MANUAL (697); swaps the controller (705); persisted | M | via hint strip | AUTO_ALL | n |
| HOW TO PLAY (6171) | the manual | C | y | — | — |
| REPLAY TOUR (6173) | resets tour flags + hint store (6174-6180) | C | y | — | n |
| EXPORT SAVE (6191, title only) | saveProfileToDisk | M | y | — | n |
| IMPORT SAVE (6201, title only) | pickImportFile — overwrites the profile | M | y | — | **y (replaces save)** |
| RECOVERY FILE (6203, conditional) | downloadRecovery — damaged-save rescue | M | partial | hidden unless damage | n |
| RECOVERY FILE (PREVIOUS) (6213, conditional) | second recovery slot | M | partial | hidden | n |
| RESET PROFILE (6221) | two-tap arm (6119) → makeProfile() wipes everything | M | y | — | **y (irreversible)** |
| END RUN (6234, in-run only) | two-tap arm (6120) → endRun() banks gold | M | y (coachmarked) | — | y (ends run) |
| TEST: ESCAPE SEQUENCE (6247, in-run only) | startEscape({test:true}) — a DEV tool on the player surface | C | n (reads as content) | — | n |
| BACK (6253/6254) | — | — | y | — | — |

**12 cards in-run; up to 14 on the title** (swaps END RUN/TEST for
EXPORT/IMPORT/RECOVERY x2).

### 9d. Shop + run options

- SHOP: **46 rows** (SHOP_UPGRADES, meta.js:444-604: 36 stat rows + 7 weapon
  rows + 3 elite rows) + APEX door (conditional) + CHARACTERS door + BACK.
  Character shop: 8 more rows (CHARACTER_UPGRADES meta.js:1167-1182). All
  purchases one-way (gold spent). Covered as C3/C6 in Part 1.
- HEAT dial (intermission card, main.js:1295-1302): one push = +1 heat,
  foe HP x(1+0.12h), dmg x(1+0.08h), spawn x(1+0.06h) (heat.js:33-43),
  manual pushes pay gold x(1+0.30/push) + XP x(1+0.12/push) (heat.js:65-75),
  cap 20. Material, states its terms on the card, reversible only
  run-locally. KEEP (Part 1 K7).
- Draft: 3 offers (+1 per Deep Read level, +1 per Full Hand perk, main.js:3031);
  blessings 3 (choices.js:238). Controls, not options — out of scope.

### 9e. THE EIGHT ARENAS — the owner's "barely noticeable" hypothesis, settled with numbers

Computed from stages.js (pool weights, mods, hazard, relief — every figure
below is the declarative source, no opinion):

| arena | types of 8 | top type (share) | ranged % | heavy % | HP | dmg | speed | spawn | hazard | relief |
|---|---|---|---|---|---|---|---|---|---|---|
| VERDANT HOLLOW | 8 | CHASER 24% | 22 | 15 | x1.0 | x1.0 | x1.0 | x1.0 | none | 480/3 |
| ASHEN WASTE | 6 | DASHER 28% | **0** | 27 | x1.0 | x1.2 | x1.1 | x1.0 | elite +5pp | 340/4 |
| SNOWFIELD | 7 | SPITTER 25% | 46 | 15 | x1.5 | x1.0 | x0.9 | x0.7 | ring x0.7 | 520/3 |
| BLOOD RUST | 3 | CHASER 42% | **0** | **58** | x1.2 | x1.15 | x1.05 | x1.0 | elite +15pp | 300/4 |
| BONE DESERT | 5 | SWARMER 38% | 10 | **0** | x0.8 | x0.9 | x1.1 | x1.3 | packs x1.5 | 640/2 |
| VOID REACH | 5 | SPITTER 37% | **70** | 4 | x1.1 | x1.3 | x0.95 | x1.0 | ring x0.85 | 280/4 |
| CINDER MAW | 4 | BRUTE 43% | 14 | **57** | **x1.8** | x1.1 | x0.75 | x0.8 | elite +3pp | 420/3 |
| WHITEOUT | 7 (no CHASER) | BRUTE 19% | 30 | 24 | x1.4 | x1.3 | x1.05 | x1.15 (+pack x1.25) | elite +8pp | 500/3 |

**Verdict: the differences are REAL and LARGE — ranged share spans 0-70%,
heavy share 0-58%, foe HP x0.8-x1.8, the spawn ring tightens to 70%, elite
rate +0-15pp, pack bursts x1.5, and (since the arena scale-up) each stage
carries a distinct elevation character (5+ distinct relief fields measured).**
"Barely noticeable" is a PRESENTATION failure, not a data failure: every
difference is an invisible multiplier, the card shows only a one-line blurb
(stages.js:244-247), and the palette is the only visible signal. Two options
in §10 (P1/P2); the numbers above go on the card either way.

## 10. THE PROPOSAL — four tiers

### (a) DELETE — redundant, dev-only, or duplicated
- D1. TEST: ESCAPE SEQUENCE (6247) — a developer tool on a player surface;
  moves behind a debug flag.
- D2. RECOVERY FILE (PREVIOUS) (6213) — the second rollback slot duplicates
  the first; one rescue file is enough.
- D3. EXIT GAME title card (5556) — autosave already fires; the browser's own
  close does the same thing.
- D4. CHARACTERS title card (5533) — the SHOP already has a CHARACTERS door
  (5663); two doors, one destination.

### (b) MERGE — two items that are really one decision
- M1. ZOOM + RESOLUTION + TEXT HUD → one DISPLAY card (all three are
  presentation; 3 cards → 1).
- M2. MUSIC + SFX → one AUDIO card, two rows (the two most-used toggles stay
  one tap away).
- M3. EXPORT + IMPORT + RECOVERY + RESET → one SAVE DATA card (all four are
  save-file lifecycle).
- M4. REPLAY TOUR → a row inside HOW TO PLAY (one teaching surface).
- M5. LOAD FROM DISK (fresh title) → SAVE DATA (it IS import).
- M6 (conditional, only if P2 is chosen below): SNOWFIELD + VOID REACH → one
  ranged-gauntlet arena; ASHEN + BLOOD RUST → one melee-elite arena (8→6).

### (c) DEMOTE — keep the capability, hide it off the default path
- E1. RESET PROFILE: inside SAVE DATA, behind the two-tap arm it already has
  (the destructive action leaves the default path).
- E2. The full ZOOM ladder (6 stops) and RESOLUTION stops (5): the DISPLAY
  card cycles curated presets (AUTO / CRISP / BIGGER / BIGGEST); the exact
  stops remain reachable on a second tap into the card.

### (d) KEEP as-is
- PILOT (3 rungs — material, hint-strip taught), NIGHT MODE (new, opt-in),
- CHALLENGE (it PAYS +200pp now and states its terms — C4 corrected),
- STAGE (see P1/P2), HEAT (K7), END RUN (coachmarked, material),
- START / SHOP / LOADOUT / PROGRESS / SETUP / HOW TO PLAY / BACK.

### P1 vs P2 — the arenas (the one open design call)
- **P1 (RECOMMENDED, effort S): keep all 8, fix the presentation.** Put the
  numbers on the card: "ranged 70% · foe HP x1.1 · damage x1.3 · ring tight",
  next to the palette + relief. The differences exist; today the player has
  no way to see them. Also: PERSIST the stage choice (today a reload reverts
  to VERDANT — a selection the player cannot even keep is noise).
- **P2 (alternative, effort S + save migration): cut 8 → 6** via M6 if the
  owner still wants fewer after seeing the numbers on the cards.

### Resulting counts

| surface | now | proposed |
|---|---|---|
| Title cards | 9 fresh / 8 with save | **6** |
| SETUP cards | 5 | 5 |
| SETTINGS cards (in-run) | 12 | **6** |
| SETTINGS cards (title) | up to 14 | **6** |
| Distinct option axes (music, sfx, hud-text, zoom, resolution, pilot, challenge, stage, night) | 9 | **7** (display presets collapse 3 → 1) |
| Cards across title+setup+settings | 28 | **17** |

## 11. THE TRIMMED MENU, VISUALISED

Shot pairs (current vs proposed, banner-marked) at BOTH phone sizes in
`docs/art/condense-trim-2026-09-17/shots/`:
`current-title-390x844.png` / `proposed-title-390x844.png`,
`current-settings-390x844.png` / `proposed-settings-390x844.png`, and the
same four at `320x568`. The proposed screens are rendered through the game's
own card CSS (`#ov-cards`, real classes — what it would actually look like),
by `tools/verify_condense_trim.mjs` (no game file touched).

## 12. PARKED — idle buyables (recorded, not built, not re-proposed)

Owner, 2026-09-17: "I did think that we should have idle buyables that allow
better idle progression. But for now just an idea. It continues down the path
of adding complexity though." PARKED for exactly that reason, next to
Direction A (§6): the gate both must pass first is the same — a real night of
Night Mode play showing what unattended progress already yields. Idle
buyables are a SECOND idle system on top of Night Mode; per the owner's own
complexity concern they are only re-examined if that night comes in short of
"one or two upgrades".
