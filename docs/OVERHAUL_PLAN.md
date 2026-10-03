# HORDES overhaul plan

Branch `claude/overhaul` (working copy `D:\hordes-claude`), built on the dev branch at `a28921c`.
Nothing merges to `main` or dev, and nothing is pushed to GitHub, without Steve's approval.
Test build, once Milestone 1 is in: `https://claude.stevesinfo.com:8443/hordes-claude/`.

## What the four reviews found

| Area | Finding | Basis |
|---|---|---|
| Rewrite? | No. 77 modules, no import cycles, headless sim, solid save layer, suite runs in ~1 min. The problem is one 13,000-line `main.js` with no fixed timestep and no seeded randomness. | measured |
| Progression | Runs 1–5 show progress (about 9s → 35–55s). Then 20–35 runs are flat: death at 35–58s, about 120g a run against 250–1,300g steps. Then one run breaks past the 120s boss and income jumps 100× or more. | bot, 5 shop policies; a floor for human play |
| Where the cliff is | About 10–30k gold spent, moving 3–10× with strategy. Bringing the free Boomerang moves the breakout from run ~32 to run ~5. | bot |
| Shop | No price gap anywhere (largest step ratio 1.7×). The cliff is in income. The full shop multiplies damage about 47,000×; a draft card adds 25%. | arithmetic |
| Dead purchases | Vitality L1–4 adds no extra hit (two hits kill below 392 HP). Mana Spring L3 makes mana irrelevant. Auto never drinks a potion in time. | arithmetic |
| Dev branch | Not shippable as is: pilot sticks on buildings, evolutions 2.4× harder by accident, four synergies do nothing, Cursed/Blessed mislabelled, Javelin damage tied to frame rate, Apex gate regression. | traced or reproduced |
| Readability | Enemies against ground are about 1.2–1.3:1 contrast. No damage numbers, death animation or knockback. | computed from palettes |
| Content | 10 enemies on 7 behaviours; 4 characters, one of which plays differently; 8 stages that differ by spawn weights only; 3 wave bosses repeating from wave 4. | counted |
| UX | 4-page manual before the first enemy, 17 menu screens, 18 dials. Game and night mode stop in a hidden tab. A stray WASD press leaves every later run in MANUAL. | read from code |
| Bug | Gold earned after the maw milestone is not banked at run end; it leaks into the next run's purse. | measured |

## Design direction

Keep the identity: an auto-piloted survivor where the build is the game, the draft is a deck of cards, and death always pays.
Keep run 1 short and lethal, and keep early weakness as the thing that makes progress visible.

Change four things:

1. **Progress every run.** Replace "flat for 30 runs, then a 100× jump" with a curve where each run is a little longer than the last and buys about one upgrade, from run 2 to the end of the catalogue.
2. **The run matters as much as the shop.** Shrink permanent multipliers and grow what drafts, evolutions and synergies do, so two runs on the same save play differently.
3. **Fewer, clearer systems.** Cut or merge anything that duplicates another system or has no visible payoff.
4. **Readable and punchy.** Every hit, kill and pickup should be visible at a glance on a phone.

## Milestones

### M0 — Foundation (in progress)
- Cross-platform suite runner; Windows-path test failures fixed; known reds listed explicitly.
- Defect fixes from the code review: evolutions match on stat; pilot pathing around buildings; chests and shrines pushed out of buildings; Apex gate; Javelin one hit per enemy per throw; the four synergies implemented; Cursed/Blessed limited to numeric cards; Volley card labels; base crit multiplier.
- Progression simulator in `tools/`: plays run → bank → buy → repeat under several shop, draft and pilot strategies and prints the run-over-run curve. This is the measuring stick for M1, and it reports bands, not single numbers.

### M1 — The progression curve
- **Loadout:** owned weapons are equipped by default; empty slots fill automatically. Run 1 stays lethal (measured 8s → 12s median).
- **Combat maths rebuilt on a smaller scale:**
  - Forged Edge ×3 per level becomes about ×1.5; overlapping damage rows merged.
  - Enemy HP ladder retuned to match.
  - Contact damage reshaped so each Vitality level buys a real fraction of a hit; the 50% cap becomes a late-game safety net only.
- **Income made continuous:** small pay for chaff and grunts, a survival-time bonus per 30s, and softer per-kill pay late, so income rises smoothly with run length.
- **Catalogue rebuilt against the new income:** about 40 rows in clear tiers, the cheap/expensive duplicates folded together, every step costing roughly 1–3 runs at the income of the player who reaches it. Target total: about 20–25 hours.
- **Drafts:** XP curve changed from geometric to polynomial so drafts keep arriving late (target at least 2 a minute at minute 15). Reroll, skip and banish added, bought in the shop.
- **Dead purchases fixed:** Mana Spring 0.5 per level; potions heal a share of max HP and Auto drinks at half health.
- **Bugs:** maw purse banking.
- **Save migration:** existing players are refunded the gold value of any row that is merged or repriced.
- **Check:** the simulator curve under every strategy, then Steve's own play on the hosted build.

### M2 — Readability and feel
- Brighter ground, dark outline and rim light on every actor, contact shadows.
- Shaped hit flash, death puffs, pooled damage numbers, light knockback, restrained screen shake.
- Sprites about a third larger on screen without losing view of the spawn ring.
- Sprite cache (pre-rendered offscreen atlas) so the extra effects cost fewer draw calls than today.
- Audio pass: distinct sounds per weapon family, pickup, hurt, boss and level-up; a boss track; volume sliders.

### M2b — World art makeover (added 2026-10-02)
- Ground tiles, structures, props, terrain faces and landmarks redrawn to the standard set by the new pilots and enemies: outlined, lit from the top left, one material family per stage.
- The ground stays a quiet backdrop: actors keep at least 3:1 contrast against it.
- Ground decor is pre-rendered into cached chunks (it was the largest uncached draw cost, about 440–600 rects a frame).
- Collision footprints and terrain geometry are unchanged; this is a drawing pass only.
- Ground, building and prop work is kept separable from the terrain work, so it can ship to `main` before the map milestone does.

### M3 — First minutes and menus
- No manual before run 1. Run 1 opens with a guided part taught by doing (nine one-sentence steps), then menu steps after the first death and first-time hints later: see docs/TUTORIAL.md.
- Desktop: touch pads hidden until a touch is seen; radar moved clear of the potion buttons.
- Settings reduced to one screen plus an Advanced page; stage and challenge chosen in one step after START.
- A move key takes the wheel only while held, then hands back to Auto; MANUAL is an explicit choice.
- Escape sequence shortened to about 30s with its payout shown up front (replaced in M3b by a cinematic).
- Card and shop text rewritten in plain words.

### M3b — Escape cinematic (added 2026-10-03, built)
Steve's brief: replace the escape minigame with a well-made cinematic of the pilot running from all the different enemies and barely escaping a huge boss; it could look a bit 3D.
- **What:** a 9 s, skippable, non-interactive chase after the wave-1 portal, in place of the side-scrolling minigame that players skipped. Code: `src/escape_cine.js` (cast, clock, skip, payout), `src/escape_cine_art.js` (timeline and picture), `src/escape_payout.js` (the gold).
- **Look:** a pseudo-3D chase seen from in front of the hero. The camera backs away down the path, so the banded ground, the stage's props and buildings and the speed lines recede to the crest behind him; sprites scale with depth; the stage's sky and ridge shift in parallax. The run's own pilot runs in front at 5x; the enemy types met this run come over the crest in a wave of 30 that gains on him, three of them lunging and missing; the wave boss rises behind them, gains, winds up and lunges as he dives through the portal; white flash; "ESCAPED +N gold".
- **Beats:** establish 1.5 s, horde closes 3 s, boss rises and gains 2.5 s, dive and flash 1 s, payout card 1 s.
- **Payout:** always paid, once, when the movie ends or is skipped: floor(best run gold / 15). Nothing to fail. The Escape Writ (row id `escapeskip`, no save migration) triples it.
- **Skip:** any key, tap or click after 0.4 s. A skip pays in full and goes straight to the intermission.
- **Idle-safe:** ends at once in a hidden tab and on an unattended run, paid; under reduced motion it is a still card for 1.5 s.
- **Removed:** the minigame (`src/escape/`: generator, simulation, auto-player, renderer, sprites) with its tests and capture tools.
- **Captures:** `node tools/capture_escape.mjs` writes `docs/art/escape/`.

### M4 — Engine
- Simulation extracted from `main.js` behind a single `step(state, dt, rng)`; audio, toasts and saves become events.
- Fixed 60 Hz timestep with one seeded random stream: runs become replayable and tests stop flaking.
- **Background play:** a timer-driven tick keeps the run going in a hidden tab, so Auto and night mode work unattended.
- Mode state machine replacing about 150 string comparisons; menus split into `src/ui/`.
- Optional bundle step for faster loading (79 requests → 1), kept optional so the game still runs unbuilt.

### M5 — Content
- **Enemies:** six new behaviours (splitter, exploder, shield-bearer, encircler, healer, mimic) → about 16 types on 10 behaviours.
- **Stages:** one real hazard and one optional objective per stage; buildings and terrain shaped per stage so layouts differ in play; a signature boss per stage.
- **Characters:** each of the four gets a rule no one else has; then four new ones.
- **Weapons:** evolutions for Javelin, Ember, Ricochet and Meteor; two new behaviours (summon, ground zone).
- **Items:** a relic tier that changes rules, not stats.
- **Autopilot:** flees the sum of threats, dodges projectiles, collects chests and shrines when safe.

### M5a — The fun layer (added 2026-10-02)

Steve's brief: the things that make Balatro, Vampire Survivors, Megabonk and Ball x Pit fun, in a game that can be played idle.
Each piece replaces an existing system, so the game gets deeper without getting wider.

| From | What makes it fun | In HORDES | Replaces |
|---|---|---|---|
| Vampire Survivors | Evolutions as the mid-run goal; chest ceremonies; a collection shelf | Weapon levels that change behaviour; a visible evolution recipe on every weapon card; first evolution around minute 4–8 | The token-gated evolution rules |
| Balatro | The build is a hand; jokers rewrite rules; the score multiplies in front of you | **Hands:** the cards you draft already have rank and suit. Pairs, flushes and straights among them pay a run-long multiplier, shown and counted up on screen. **Jokers:** a small row of rule-changing cards with limited slots | Synergy toasts, rewrites, mythics and rule cards, folded into one joker row |
| Balatro | Boss blinds that change the rules for one fight | Each wave boss arrives with a named rule for that wave ("no potions", "weapons fire slower, hits pay double") and a reward for beating it | Heat and challenge modes |
| Ball x Pit | Fusing two weapons into one new one | Two maxed weapons with a matching pair fuse into a single slot, freeing a slot | The 11 synergy pairs |
| Ball x Pit | A base that grows between runs | A camp on the title screen: a few buildings bought with gold that produce while you are away (gold, a free reroll, a starting level) | Part of the stat shop; this is the idle hook |
| Megabonk | Shrines and choices out on the map; stages chained into tiers | Shrines, chests and arches become things the pilot paths to on purpose; clearing a stage's boss offers the next stage tier in the same run | The blind-pilot shrine rules |
| Idle | It keeps going without you | Background ticking in a hidden tab, offline camp production, Auto that plays the plan you set (which evolution to chase, which hand to build) | Night mode's special cases |

Order: evolutions (done) → fusion (done) → hands and jokers (done; all three in `docs/WEAPONS_AND_EVOLUTIONS.md`) → boss rules (done; `docs/BOSS_RULES.md`) → camp and idle (done) → map shrines (done; M5b) and stage tiers (done as TRAVEL; `docs/TRAVEL.md`).

Heat and the challenge modifiers are still in the game: boss rules were added beside them, not in their place. Removing them touches saves and trophies and waits for Steve's call.

### M5b — A world worth exploring (added 2026-10-02)

Steve's brief: interactable things on the map, secrets, and quests, in the spirit of Vampire Survivors and Megabonk; a semi-automatic pilot mode for them; a reward for manual players; the map made useful; richer structures and landscape, including elevated paths.

**Points of interest.** Each stage places a seeded set of sites, shown on the map as "?" until found.

| Site | What you do | What you get |
|---|---|---|
| Shrine | Stand in its circle while it charges; enemies keep coming | A blessing (replaces today's buy-with-gold shrine) |
| Boss altar | Step on it to call the wave boss early | Extra chest, faster run |
| Locked vault | Find the key carried by a marked elite | A joker or relic |
| Braziers and urns | Break them | Small pickups: gold, potion, a magnet pull |
| Cursed statue | Take its curse for the wave | A named reward, stated up front |
| Fountain | Stand in it | A heal, once |
| Lever and gate | Pull a lever on one side of the map | Opens a walled yard with a chest |

**Secrets.** Cracked walls that break to a hidden room; a mimic chest; a hidden glyph on each stage (find them all for a character); character and stage unlocks tied to deeds, with the hint shown as a silhouette on the Progress shelf.

**Quests.** Three per run, picked on the pre-run screen from a board at the camp ("charge two shrines", "kill an elite on high ground", "open the vault"). Each pays gold or a joker. A tracker sits in the HUD. Longer chains across runs unlock characters and stages.

**Pilot modes.** AUTO fights and collects what is near. A new EXPLORE mode also walks to the nearest unvisited site when the field is calm. Tapping a site on the map sets a waypoint in either mode. MANUAL is unchanged.

**Hands-on reward.** Things done while you are steering pay a little more: shrines charge faster, breakables drop more, and a few secrets need a deliberate input. Kept small, so that hands-off play stays viable and hands-on play is simply the best version.

**The map.** Fog lifts as you explore; site icons, quest markers and the waypoint show on it; the radar pings an undiscovered site when you pass near.

**Landscape.** Plateaus, ramps, bridges and cliffs authored per stage on the existing height field. High ground gives reach and sight; ground enemies must take the ramps while flyers and ranged enemies keep it from being a safe spot; a cliff edge is a one-way drop for the hero. Each stage gets its own layout and two or three landmark structures that hold the sites above.

Order: sites and the map → EXPLORE mode and waypoints → elevated layouts per stage → quests → secrets.

### M6 — Release candidate
- Real-browser performance check on phone-class hardware.
- Release notes; plain-language "what changed" card in game.
- Playtest checklist for Steve; fixes from his feedback.
- Then, on approval: merge path to dev and `main`.

## Order and review points

M0 → M1 → **hosted build and first review** → M2 → M3 → **second review** → M4 → M5 → M6.
Art and audio work that lives in its own files runs in parallel with the main sequence.
Each milestone ends with the full suite green and a short changelog entry.

## Open risks

- The simulator's pilot plays worse than a person, so M1's numbers are a floor. Steve's play on the hosted build is the real check.
- M1 changes saved profiles' purchasing power; the refund migration has to be right before anything reaches players.
- M4 touches the code every other milestone edits. It is scheduled after the player-visible work so a slip there doesn't hold up the first two reviews.
