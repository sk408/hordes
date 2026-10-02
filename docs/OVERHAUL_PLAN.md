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

### M3 — First minutes and menus
- No manual before run 1. Tutorial cut to three beats: move, draft, potion. Focus and Stance are taught later, when they first matter.
- Desktop: touch pads hidden until a touch is seen; radar moved clear of the potion buttons.
- Settings reduced to one screen plus an Advanced page; stage and challenge chosen in one step after START.
- A move key takes the wheel only while held, then hands back to Auto; MANUAL is an explicit choice.
- Escape sequence shortened to about 30s with its payout shown up front.
- Card and shop text rewritten in plain words.

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
