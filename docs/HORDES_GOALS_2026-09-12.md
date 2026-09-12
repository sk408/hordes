# HORDES — improvement goals (run lead: remy, 2026-09-12)

Sk408 handed over the loop: *"Feel free to set goals for the hordes game and loop until you reach
those goals. Parallel subagents, agent hub, whatever you want to use to work on the project is your
call."* This file is the definition of "reached". It survives across sessions, so any agent working on
this project should read it first and treat the numbered goals as the acceptance bar.

## Standing constraints (do not violate while pursuing the goals)

- The owner's design intent: **players lose most runs early**, feel weak at the start, and progress
  through **knowledge + shop purchases**. The draft is the game.
- Owner's juice taste: glow/crackle yes; slow-motion and shake **rare and earned only**.
- Owner's UI taste: **no emojis** in apps. Pixel-art integrity: integer pixels, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt.
- Publishing is code-only: `docs/` and `GAME_DESIGN.md` stay out of the public repo. Public repo is
  https://github.com/sk408/hordes, served at https://sk408.github.io/hordes/ (branch-based Pages, main:/).
- Only ONE writer in the repo at a time. Verify with the full test suite after every wave.

## G1 — SHIP THE CURRENT BUILD  [status: DONE 2026-09-12]
The published site is ~5 waves stale (still pre-wave-23). Testers are playing a game that does not
have the tour, the legibility fixes, the resolution setting, the desktop pads, the bug fixes or the
design pass. Nothing else on this list matters to a player if this does not ship.
**Reached:** snapshot `9c4aa0f` pushed (9380167..9c4aa0f). Evidence, not just a green push:
- 45/45 test files passed INSIDE the published snapshot (not on the working tree).
- Pages auto-built the pushed commit: status `building` -> `built` on commit `9c4aa0f2`.
- SERVED files verified to be the new build: `lootLimit=4` in the live entities.js, `updateCamera=5` in
  the live main.js, `tour-stance=1` in the live tour.js, site HTTP 200.
- Snapshot is code-only (docs/ and GAME_DESIGN.md excluded); local main untouched and still holds the
  full wave history.
Testers can now play: the first-run spotlight tour, the legibility + resolution work, desktop
mouse-clickable pads, ESC/P pause, mode-aware hints, the wall fixes (loot reachability, no pilot grind),
the deadzone camera, the design pass (death payoff, synergy hints, stance that bites, earned slow-mo)
and the logic bug fixes including the mine-chain crash and the 120Hz double-fire.

## G2 — THE WALL BUGS (owner-reported, currently the worst in-game experience)  [status: open]
The pilot visibly grinds against the wall for seconds, and loot can drop on or outside the wall.
**Reached when all three hold, each proven by a headless test:**
1. No loot/gem/chest/pickup can spawn outside the reachable region, at the rim, or on the wall band —
   accounting for wall thickness and pickup radius, at every drop source.
2. The autopilot never accumulates wall-ward pressure against an unreachable target; it holds near the
   boundary for an enemy still outside (enemies entering from outside remains intended behaviour).
3. The camera is decoupled from perfect centre (deadzone + travel lead) with the player clamped to a
   safe screen region, AND the coachmark world-to-screen projection still lands correctly (one source
   of truth for the transform).

## G3 — REMOVE THE REDUNDANT DOCTRINE TEXT  [status: open]
Owner: the big on-canvas "FOCUS NEAREST" / "STANCE GREEDY" lines are unnecessary — the overlay buttons'
badges already carry that state.
**Reached when:** the canvas doctrine text is gone, the button badges are the single visible source,
there is exactly ONE source of truth for the doctrine values in code, the stance TAG/activity
information still reaches the player (via the cycle toast), and no coachmark is left pointing at
removed content.

## G4 — PLAYTEST COMPLAINTS CLOSED (each verified against the build, not assumed)  [status: partial]
The original galaxy.click feedback, item by item. Verify each and record VERIFIED FIXED / STILL TRUE:
1. "no idea what is going on at all" — tour + hints panel + on-screen labels.
2. "there's no xp bar" — bar exists and its EMPTY state reads as a bar.
3. "no tutorial" — the first-run tour (15 coachmarks) + HOW TO PLAY + hints.
4. "the large text is very fuzzy" — HUD text legibility + resolution modes.
5. "balance is nonexistent, character shredded everything" — early lethality (see G5).
6. "no way to exit a run early" — exit-run exists and is taught.
7. "the edge of the map is not clearly defined" — wall + camera decoupling (see G2.3).
8. "all over the place" — overall coherence pass.

## G5 — DIFFICULTY STILL MATCHES THE GOAL  [status: unmeasured for the arch fix]
The sims currently pass: a bad draft can fail (100% die before the finale), good beats bad (182s vs
142s = 0.78x, bar is <=0.8x, 4/5 metrics), economy in range, and every archetype dies by minute 5.
**Open problem:** the sims do NOT model arch buffs (balance_sim has zero arch references; draft_sim
only mentions them in comments), so the arch-buff fix — which roughly doubles fire rate under
DOUBLE_FIRE and +50% damage under BERSERK on weapons that previously got nothing — is invisible to our
own tooling. It is a real power increase and it is currently unmeasured.
**Reached when:** the sim models arch buffs (or an equivalent measurement exists), and the measured
difficulty still satisfies: everyone dies early, a bad draft fails, and good beats bad on >=3/5 metrics.

**Owner directive (loop scope): the loops must include the META UPGRADES, not just a fresh profile.**
Verbatim: *"loops should also include meta upgrades. Weapon spots are valuable, new weapons can be
valuable but also dilute picks with limited weapon spots. You might want to rank the meta upgrades to
determine how they are simulated."* So:
- Meta upgrades must be SIMULATED IN A RANKED ORDER DERIVED FROM MEASURED MARGINAL VALUE, not a
  hardcoded greedy list. Report the ranking and where the assumed order was wrong.
- Weapon unlocks must be modelled as +1 option AND draft-pool DILUTION against a scarce slot count.
  Report each unlock's NET value at the real slot counts, and answer whether unlocking is ever
  net-negative at 3 slots. Design intelligence the owner explicitly wants.
- Divergence (G6) must be reported for BOTH a fresh profile and a developed one; a ratio that only
  holds on a fresh profile is not the number being asked for.

**Owner ruling — the trade-off stays HIDDEN from the player.** Verbatim: *"Isn't it best to keep the
trade off hidden from the player? Most players figure it out as strategy and feel good about
themselves for figuring it out."* So the measurement is DESIGNER-facing: no tooltips, warnings or
explanatory shop copy about dilution, ever. The requirement is instead DISCOVERABILITY — the effect
must be consistently perceivable in outcomes the player already watches (above all the draft offers),
so the correct model can be earned rather than handed over. If anything is surfaced, surface the FACT
(pool size, e.g. "3 of 11") and hide the INTERPRETATION.
The one exception to report: a hidden trade-off that is ALSO irreversible and net-negative is a trap,
not a discovery — escalate it with numbers, and fix it by making it growable or reversible (slot
growth, or player-chosen pool), never by explaining it.

## G6 — THE DRAFT DECIDES RUNS (owner raised the target)  [status: below target]
Divergence is currently **x1.28**, which barely clears its own bar and is weak for a game whose stated
principle is "the draft IS the game". **Owner: "I think we could push it even further? 1.6? 2.0?"**

**Target: >= x1.6 divergence, with x2.0 as a stretch to be evaluated only after x1.6 is measured.**
Measure on BOTH axes, because survival time alone is compressed by the run structure (everything dies
by minute 5, so the ratio cannot grow past the point where the run ends):
- survival-time ratio (good vs bad), and
- waves-cleared ratio — wider and far more legible to a player ("bad draft = wave 2, good = wave 4").

**How to widen it — raise the CEILING, do not lower the FLOOR.** A wide ratio is reachable either by
making bad drafts worse or good drafts better. Preferring the former punishes ignorance: the testers
already reported "i have no idea what is going on at all", and a draft that punishes not-yet-knowing
reads as unfair rather than deep. Both give the same sim number and opposite experiences in the hand.
Use the sim's own lever set, which is already the right shape for this: stat-card weight 0.3 -> 0.5
(more real decisions instead of near-auto-pick weapon levels), flat +25 HP -> percent (it currently
decays against the x5.25 contact curve exactly when runs are decided), fix the dead 3rd Split Shot
card (a card pickable while doing nothing is the purest fake choice), and XP_LEVEL_GROWTH 1.35 -> 1.28
so drafts keep arriving instead of the game taking the wheel away at minute 4-5.

**Invariant that must hold while tuning (do not trade this away for the ratio):**
- **One bad pick must never lose a run.** The draft should punish incoherence across a run, not a
  single mistake.
- A bad draft must still be able to fail (currently 100% of bad runs die before the finale) — keep it.
- Good must beat bad on >= 3/5 minute-10 metrics (currently 4/5) — do not regress this to buy ratio.

Flag as a design call: do not silently retune the owner's game past these numbers without reporting
the measured before/after and what the change feels like in plain terms.

## G7 — 2.5D / ELEVATION FEEL (STRETCH — explicitly NOT required)  [status: not started]
Owner: *"megabonk also has some interesting movement mechanics because there is elevation and 3d and
jumping. i dont know how we could translate that but some sort of 2.5d something would be great if you
can pull it off. but not a required piece."* Non-required, so it sequences AFTER the required goals,
and it cannot run alongside them anyway (same files: render.js/main.js/controllers.js).

**Translation chosen (a vertical AXIS, not vertical TERRAIN):**
1. Give entities a `z` and draw them at `y - z`, with a ground shadow that stays at ground level. This
   is render-only: the simulation stays 2D, so targeting, collision and the wall/rim work are
   untouched. Side benefit: the player currently has no visual anchor (flagged as hard to track) and a
   shadow anchors them.
2. A LEAP: a short hop that clears ground contact for a beat, giving the pilot a visible movement verb
   instead of sliding. Risk-reward shape — airborne means brief safety but you cannot act. Fits the
   owner's "rare and earned" juice rule: a leap is a moment, not a constant.
3. Optional: subtle parallax on the ground layers for depth — test it, do not assume it reads.

**EXPLICITLY OUT OF SCOPE — terraces, cliffs, walkable height levels.** They need pathing/targeting/
collision changes and would muddy the arena boundary that testers complained about and that this
project just made unambiguous. A flat pit with a clear rim IS the design. Elevation as a visual axis
is a win; elevation as terrain is a regression risk.

**Constraints:** offsets must stay INTEGER pixels or the pixel art blurs; must compose with the
resolution modes and the deadzone camera; the leap must behave sanely in the sim and at 60/120Hz.
**Acceptance:** a real screenshot plus a vision read of the arc and shadow — not a code claim, and not
a headless rect dump (this item is about how it LOOKS). Margins: if it does not visibly improve the
feel, drop it rather than carry complexity.

## STRATEGIC PIVOT (owner, 2026-09-12): WE NEED DEPTH
Owner, verbatim: *"i tried to keep things simple but the first test players took it as a sign of
incompetence instead of a sign of casual gaming. so we need depth."*
This SUPERSEDES the earlier "keep it simple/accessible" constraint as the primary design driver. It does
not license bloat or unreadable systems — the legibility goals (G2-G4) still hold, because the same
testers complained "i have no idea what is going on at all" — but the answer to "this looks thin" is
MORE REAL SYSTEMS TO LEARN, not less. Also: *"so far we don't have enough options to necessarily worry
about offered options dilution"* — so the pool-dilution problem is DEFERRED, not solved. Revisit
`docs/GENRE_RESEARCH.md` §2 (both genre leaders narrow the pool at full slots) only once the catalogue
grows enough for it to matter.

### G8 — RUN-ALTERING ITEMS, SKILL ITEMS, AND LUCK  [status: not started]
Owner: *"run altering items and general skill items offered at level up to make luck more of a factor in
the run."*
- Add genuinely RUN-ALTERING items to the level-up pool (items that change how the run plays, not just
  bigger numbers) plus general skill items.
- Make LUCK a real factor in what the run offers and produces.
**Reached when:** the level-up pool contains run-altering items, luck measurably changes run outcomes,
and the balance sim still passes its invariants (bad draft can fail, good beats bad >=3/5 metrics, no
single pick loses a run). Needs owner input on WHICH run-altering ideas he wants; propose options.

### G9 — ACHIEVEMENTS AS THE UNLOCK SPINE + TROPHY GALLERY  [status: DONE]

**LANDED 2026-09-12 (the systems half — all measured/tested, suite 54/54):**
- `src/achievements.js` — the catalog (21 earnable trophies, ids/goals matching the art's
  `TROPHY_IDS` exactly, enforced by test), cumulative-vs-single-run goal semantics,
  `recordRun()` evaluation, gallery model, and gold-free unlock granting.
- **Achievements UNLOCK real content** (the VS model): 10 of them grant a shop row —
  7 weapons, 3 elite modifiers — and 3 grant pilots (WITCH/ROGUE/PALADIN). They are
  "**achieve OR buy**": shop prices are untouched and a soft-lock is impossible.
- `src/meta.js` — `grantShopRow` / `grantCharacter` (+ grantWeapon/grantElite), writing the
  SAME `unlockedWeapons`/`unlockedElites`/`purchased` ownership the shop uses, so the shop,
  the run and the gallery cannot disagree about what is owned.
- **Schema v4** — `profile.achievements = { v, earned, progress, totals }` with a documented
  v3->v4 migration, structural validation, and one hard rule: **an earned trophy is NEVER
  dropped by validation** (a damaged stamp repairs to 1, never to "unearned"). Unknown ids
  from a newer build are preserved so a save passing through an older build loses nothing.
- `test/test_achievements.mjs` — 34 checks: art/catalog id parity, cumulative vs best
  semantics, no-replay, idempotent grants, gold-free grants, state goals, gallery masking,
  hand-edited-save repair, v3->v4 migration, future-version refusal, and a regression for a
  reference-stability bug that silently orphaned every earned trophy.

**LANDED 2026-09-12 (SLICE 2 — the gallery screen + the earn hook; suite 55/55):**
- `src/render.js` — `drawTrophyShowcase(g, state)`: the full-screen showcase. A full-view dark
  backdrop, a steel-frame/dark-plate display case in the HUD's own chrome vocabulary
  (CONFIG.HUD FRAME/PLATE), then the selected 32x32 emblem at the LARGEST INTEGER scale that
  fits ~72% of the view width / ~62% of the height, centered. `this.trophyShowcase =
  { scale, x, y, w, h, id, locked }` is the test seam (null when nothing is selected).
  `drawGrid` gained an optional integer `scale` (default 1, so every existing caller is
  byte-identical) so the emblem is painted as NxN blocks with no smoothing in the path.
- `src/main.js` — `showTrophies` / `closeTrophies` / `trophiesStep` / `refreshTrophyView`,
  mode `'trophies'`, reached from a new TROPHIES card on the title (labelled with the live
  earned count). One trophy at a time; PREV / NEXT wrap a ring over `ACHIEVEMENT_DISPLAY_IDS`;
  BACK (and ESC, and the arrow keys) returns to the title; `closeTrophies` restores the mode
  it was opened from. Every caption string comes from the ART (name/desc) plus the
  achievement's goal text — main.js restates no trophy name, description or condition.
  The overlay clears its 75% sheet for this ONE screen (`background: transparent`,
  `justify-content: flex-end`, chrome pushed to the bottom) and `openMenu()` resets both, so
  no other screen can inherit them (asserted from a screen entered after the gallery).
  `chromeOn()` is untouched — the new mode is false by construction, so the pad layer hides
  (asserted directly, plus through the real `syncChrome` frame).
- `settleRunGold` — the RUN-END EARN HOOK. It is the single funnel `die` / `runSurvived` /
  `endRun` all share, so the fold lives there: `recordRun(profile, summary)` with kills /
  wave / time / the settled gold / the best in-run weapon level / evolutions / legendaries /
  survived. It EARNS, GRANTS the unlocks (gold-free), and speaks in at most TWO toast lines
  (trophies named by their ART name, then the newly granted content — measured against a
  pre-run ownership snapshot, so an "achieve OR buy" row the player already owned is never
  announced as new).
- `test/test_trophy_gallery.mjs` — 20 checks: showcase geometry (integer scale >= 1, the
  largest that fits, one NxN block per painted art pixel, centered, inside the view, dark
  full-view backdrop painted first), LOCKED vs earned masking, the ring wrapping across all
  21 entries, the overlay reset contract, `chromeOn()` false in `trophies`, and the
  earn + grant + no-double-earn hook driven through the real win funnel.
- Verified in a REAL browser against the live canvas, not just headless: the earned
  FIRST_BLOOD emblem paints at scale 5 in a box of x 160..320 / y 70..230 and its centre
  pixel reads exactly `#a02a2a` (the art's own palette entry), with the canvas HUD covered by
  the backdrop (sampled `18,8,14` where the HP bar would be). A fresh profile shows the
  padlock silhouette named LOCKED with its goal still visible.

**REMAINS (follow-up, does not block the goal being met):** 4 of the 21 trophies cannot be
earned through the live hook yet because the run does not track their counters — boss kills
(`FIRST_BOSS`, `BOSS_SLAYER_5`), chests opened (`CHESTS_25`) and untouched waves
(`UNTOUCHED_WAVE`). `recordRun` already accepts `bossKills` / `chests` / `untouchedWave`, so
wiring them is a summary change in `recordRunAchievements` plus a live counter in state.
Also: `'state'` gallery goals print their prose instead of an `n / m` fraction, because no
per-run counter measures them (printing "0 / 14" would be a number the game does not keep).
Owner: *"acheivements would be good also. trophies and a trophy gallery. would be really cool to have
the trophy gallery have the ability to show full screen pixel art of the trophy."*
Precedent: in Vampire Survivors achievements ARE the unlock engine ("Achievements, displayed as Unlocks
in-game, unlock new items, characters, stages, Relics..." — 243-459 of them), so this is the genre-proven
way to solve G8's "not enough options" problem: achieve -> unlock -> new options -> deeper runs.
- Achievements that UNLOCK content (weapons, items, upgrades), not just a badge list.
- Trophies + a gallery screen.
- **The gallery can display FULL-SCREEN PIXEL ART of a trophy.** This is the showcase feature: build real
  trophy art (integer-pixel, matching the game's palette), not just icons. It is the most visible proof
  of depth to a playtester.
**Reached when:** achievements unlock real content, the gallery lists earned/locked trophies, and
selecting a trophy shows its full-screen pixel art.

### G10 — ENEMY GUIDE + RARITY TIERS  [status: not started]
Owner: *"we could have an enemy guide of enemies you've encountered. have rare and extremely rare
enemies."*
- An in-game bestiary that records enemies the player has actually ENCOUNTERED (discovery-driven, which
  also teaches the roster through play).
- Rare and extremely-rare enemy variants/tiers.
**Reached when:** encounters persist per profile, the guide shows discovered vs undiscovered entries with
real information, and rare tiers spawn at controlled, documented rates that the sims account for.
NOTES: new enemy tiers change difficulty and loot, so this interacts with G5/G6 and must be measured, not
assumed. Unknown entries should be tantalising (silhouette + "???"), not blank.

### G11 — TIMED ACHIEVEMENTS + CHALLENGE MODES  [status: not started]
Owner: *"have timed acheivements. have challenge play modes"*
- Achievements with time/completion constraints, and selectable modes that alter the run's rules.
**Reached when:** at least one timed achievement is completable and verified, and at least one challenge
mode is selectable, clearly distinguished from a standard run, and does not corrupt normal progression.

### FOUNDATION PREREQUISITE — SAVE SCHEMA BEFORE PERSISTED CONTENT  [status: DONE]

Schema is now **v4**: explicit version, a documented + tested migration chain (v0->v1->v2->v3->v4),
per-collection validation with repairs reported to the player, corrupt/future payloads preserved
under a recovery key, and a lossless versioned export/import. Achievements (G9) are the first
persisted content built on it; enemy encounters (G10/G23) can now follow the same pattern.

_Original text:_
G9/G10/G11 all persist new per-profile data (achievements, trophies, encounters), and the existing
profile layer is not ready for that: the wave-25 audit found `loadProfile` only type-checks
`equippedCharacter` and accepts `unlockedCharacters` verbatim, and there is no migration story for new
fields. **Harden and version the save schema BEFORE adding persisted content**, or a corrupted/older save
will break the new features in a way that is invisible until a player loses their gallery.
**Reached when:** the profile has an explicit version, documented migration for older saves, validation
for every persisted collection, and a test that loads a corrupted and an old-format save safely.

### G12 — FULL GAME TREATMENT: TITLE SCREEN, STARTUP MENU, SAVE EXPORT  [status: not started]
Owner: *"maybe a legititimate startup screen like a full pc game. <Start Game> <Achievements>
<Settings> <Exit Game> and exit game can offer a save to disk dialouge. Maybe start game could offer a
load from disk option if no save is found in localstorage. This would be overlaid on a title screen
graphic, not on the map."*
- A real TITLE SCREEN with its own pixel-art graphic (NOT the game map behind the menu).
- Startup menu: START GAME / ACHIEVEMENTS / SETTINGS / EXIT GAME.
- EXIT GAME offers save-to-disk.
- START GAME offers load-from-disk when no local save exists.
**BROWSER REALITY — implement these honestly, do not promise a native dialog we cannot give:**
1. "Save to disk" = a file DOWNLOAD (an anchor with a `download` attribute and a Blob URL) which works
   in every browser, optionally upgraded with the File System Access API (`showSaveFilePicker`) where
   available (Chromium only). Load = an `<input type="file">` reader, which works everywhere.
2. "Exit Game" CANNOT reliably close a tab: `window.close()` only works for script-opened windows. So
   EXIT must (a) auto-save, (b) attempt `window.close()`, and (c) fall back to a farewell/"you can close
   this tab now" screen. A button that silently does nothing reads as broken.
3. The export/import feature is not just flavour: `localStorage` is per-origin, can be evicted (Safari
   clears non-installed site storage after ~7 days of non-use), and is absent/limited in private mode.
   Export is the player's real safety net for progress, so it must round-trip losslessly and be versioned.

### G13 — ANIMATED CHARACTER SELECTOR WITH PIXEL ART  [status: not started]
Owner: *"animated character selector with the pixel art for the characters."*
Characters currently exist as mechanical variants on text cards. This needs real character pixel art
(one sprite each) plus a selection screen that presents them with an idle animation, showing each one's
kit. Requires authoring the art, not just layout: integer pixels, the game's palette, no smoothing.

### G14 — PIXEL ART FOR EVERY SHOP  [status: not started]
Owner: *"all the shops get a pixel art upgrade."* Shop rows are currently text cards; each upgrade/
weapon/elite entry should carry its own pixel-art icon so shopping reads as a designed screen.

### ENGINEERING RULE FOR ALL NEW SCREENS (learned the hard way)
Every new mode added for G12/G13 (title, gallery, character select, export/load) MUST be registered in
the screen-chrome gate in main.js (`chromeOn`/`syncChrome`). Wave-23 shipped a regression where the whole
desktop pad layer rendered over the intro movie precisely because a mode early-returned before the gate
ran. Same failure class applies to every new screen: register the mode, then verify in a REAL browser.
Also confirm the first-run tour and the key-hints panel do not appear over the title screen.

### HOW TO PARALLELISE THIS SAFELY (ownership rule)
Art ASSETS can be authored in a NEW file with no conflict against logic work in existing files, PROVIDED
the data interface is specified up front (e.g. `src/trophy_art.js` exporting a map of id -> integer-pixel
grid + palette, in the same shape the sprite system already uses). So: one agent on new art files, one on
logic/schema files, is safe; two agents in `main.js` is not.

### G15 — DEATH MOVIE  [status: not started]
Owner: *"we also need a death movie if we don't have one."*
Currently death goes straight to a screen/overlay (`state.mode === 'dead'`), not a cinematic — so this is
new work, not a polish pass (verify against the code first: `src/portal_cine.js` is the only existing
cinematic module, and the intro movie is separate).
**Must compose with the existing death payoff screen** (G-level item from wave-26): the movie plays
first, then the stat/cause/next-unlock screen. Do not replace that content with an animation.
Skippable with any key (matching the intro and portal cinematics), and registered in the chrome gate.

### G16 — PORTAL-ENTRY CINEMATIC UPGRADE  [status: exists, needs the detailed pass]
Owner: *"the boss kill movie could use a tune to show a more detailed portal that the pilot enters upon
defeating the boss. it could show them approach and pause before they enter. fade the pilot and linger
on the movie for a beat or two before fading out of the movie too"*
The portal cinematic EXISTS (`src/portal_cine.js`, `state.mode === 'portal-cine'`), so this is a directed
upgrade, not a new system. Required beats, in order:
1. a MORE DETAILED PORTAL (build the art; distinct from the in-run portal sprite),
2. the pilot APPROACHES and then PAUSES before entering (the pause is the beat that sells the moment),
3. the pilot FADES (do not just teleport or hard-cut),
4. LINGER on the cinematic for a beat or two,
5. then FADE OUT of the movie.
Compose with the earned slow-motion that already fires on a boss kill (it should reinforce, not fight).
Skippable with any key, and verification must be VISUAL (real browser + vision read), since this item is
entirely about how it reads.

### G17 — THE ECONOMY MUST REQUIRE A REAL GRIND  [status: open]
Owner, verbatim: *"also we might still be earning too much gold per run. their feeling of being
overpowered also reads as they want to grind a bit for improvements"*
Read: "overpowered" is also a REQUEST FOR A LONGER LADDER — the shop should be a project, not a
formality. Today the economy sim passes its own targets: an average run pays ~1,992g and 10 good runs
buys **63.3% of the mid-tier catalogue** (its tolerance is 35-65%), with top tier at ~34-60 good runs.

**A KEY DISTINCTION I WANT CHECKED BEFORE ANYTHING IS CHANGED: prefer PRICES over PAYOUTS.**
Runs already die by ~minute 5 (median waves cleared 0-1), so income per run is already modest — the
shop fills fast because the CATALOGUE IS CHEAP relative to income, not because runs are lucrative.
Cutting payouts further would make early runs feel poverty-stricken without changing that ratio much;
raising mid-tier prices targets the actual cause. Measure first, then pick the lever.

**Proposed shape (to be validated against the sim, not assumed):**
- Keep the FIRST few upgrades cheap — the first purchase should land within ~1-3 runs, because that is
  the hook and a player who feels broke at the start never reaches the grind.
- STRETCH THE MID-TIER so 10 good runs buys roughly 30-40% of it (down from 63%).
- Keep the top tier a long-term target (already 34-60 good runs; verify it still reads as aspirational).
- RE-BASELINE THE SIM'S OWN TARGETS to match the new intent — the 35-65% tolerance currently ENCODES
  "fast", so leaving it in place would let a later agent "fix" the grind straight back out.

**Guard against the double-nerf:** shorter runs (G5, die-earlier) AND higher prices both push toward
grind. Applied together without measurement they could make progression demoralising. Sequence: model
arches (G5) -> measure real gold per run under current difficulty -> THEN set prices once.
**OWNER'S HARD TARGETS (2026-09-12), verbatim:** *"top tier should take a few hours to get one top tier
item, let alone all of them. and the final boss should be beatable when the player has acheived around
40 play hours worth of shop items, so we need around 60+ play hours worth of shop items determined by
gold."*
- the whole catalogue = **60+ play hours of gold**
- the FINAL BOSS becomes beatable at roughly **40 play hours** of purchased upgrades
- a single top-tier item = **a few hours**, not a session

**MEASURED TODAY (commit 6f69bed, /tmp worktree, `node` over the real tables):**
- Catalogue total **522,194g**: 24 upgrade rows (387,194g) + 7 weapon unlocks (122,400g) + 3 elite
  unlocks (12,600g), including the weapon-slot ladder.
- Payout: avg run ~1,992g, good run ~2,617g. At ~3.5 min/run that is **262 runs (~15.3h)** to buy
  everything at average income, or **200 runs (~11.6h)** at good-run income.
- So the catalogue is roughly **4x too short** for a 60-hour target: the same catalogue at ~508g/run
  would be 60 hours.

**THE TENSION THE NUMBERS EXPOSE (this is a design problem, not a tuning problem):** the current
catalogue is lopsided. Two items alone — `arcade` 140,000g and `weapon_beam` 110,000g — are **48% of the
entire catalogue**. A 60-hour catalogue that still lets one top-tier item take "a few hours" is
arithmetically impossible while two items hold half the gold: at 60h the whole catalogue is ~8,700g/hour,
so a 110,000g item alone would take **12.6 hours**, four times the stated target.
**Therefore the hours must come from BREADTH, not from a couple of mega-priced trophies.** Fix shape:
1. cap any SINGLE item at roughly a few hours of income (order 26-30k at the target rate);
2. reach 60 hours by ADDING mid-priced content (which is also the "we need depth / more options" goal
   the owner already set — the two goals agree);
3. reprice income and/or prices together, once, against measurement.

**RECOMMENDED APPROACH (validate with the sim, do not assume):** cut income per run substantially
(toward ~500-800g) AND broaden/expand the catalogue, rather than only inflating two trophy prices. Then
keep the early ladder cheap: at ~500g/run the FIRST purchase must still land within ~1-3 runs, so the
cheapest tiers must stay in the low hundreds to ~1,500g or the opening will feel broke.

**THE ACCEPTANCE TEST FOR BEATABILITY (currently unmeasured):** simulate a profile with ~40 play hours of
purchases (order 600-700 runs of income at the target rate) and show the finale is clearable at a
meaningful rate; simulate a fresh profile and show it is not. Right now nothing measures "can a developed
player win", which is the owner's actual target.

**Reached when:** the sim shows a 60+ hour catalogue, no single item exceeding a few hours of income, a
~40-hour profile able to clear the finale while a fresh one cannot, the early ladder still hooking within
a few runs, and the sim's own targets re-baselined so they encode the NEW intent (the old 35-65% /
30-good-run targets encode the old, faster economy).

### THE PROGRESSION CURVE — OWNER'S BENCHMARK (2026-09-12)  [authoritative]
Owner, verbatim: *"30 minute run is usually a later run. it takes probably 20 hours of gameplay to be
able to survive the entire 30 minutes, and another 15 to 20 hours to be able to beat the final boss on a
lucky run and another 5 to 10 hours to be able to beat the boss on a mostly regular run"*

Staged milestones (cumulative play hours), from a player who has actually done it in Vampire Survivors:
| hours | capability |
|---|---|
| 0-20h | CANNOT survive a full long run; runs end early, often in minutes |
| ~20h | can survive the entire 30-minute run |
| ~20-40h | can beat the final boss on a LUCKY run |
| ~40-50h | can beat the final boss on a mostly REGULAR run |
| 50h+ | completion / mastery |

**THIS IS THE SHAPE HORDES MUST REPRODUCE**, and it reconciles the owner's earlier targets: the "final
boss beatable at ~40 play hours" = the lucky-run boss kill, and "60+ hours of shop items" = the
catalogue outlasting reliable boss-killing.

### G18 — RUN LENGTH MUST BE A PROGRESSION AXIS  [status: open]
**The critical consequence: run length is itself a late-game capability, not a constant.** Early runs are
SHORT (the player dies in minutes); late runs approach a long cap (30 minutes in VS). So:
1. **Our economy model must use a run-length CURVE, not a constant.** My earlier 60-hour arithmetic
   assumed ~3.5 min/run for ALL players; that is only true early. A developed player's runs are many
   times longer, so income per HOUR (not per run) is what the pricing must be built on. Any tuning done
   on a flat 3.5 min assumption is wrong and must be redone.
2. **HORDES currently cannot express this**: the run is 5 waves + the maw finale, which caps run length
   at a few minutes no matter how strong the player becomes. There is no "I survived the whole thing"
   milestone and no long-run endgame to grow into.
3. **Therefore the run structure needs to extend** so a developed player's run can last far longer than a
   fresh player's — the wave ladder should keep escalating rather than being capped at 5. The finale then
   functions as the climax of a long run rather than the end of a short one. (Research wave R2 on run
   structure is checking how the reference games schedule this: boss cadence, escalation, and what ends
   a run.)
**Reached when:** measured runs show a real length curve across progression (a fresh profile dies in
minutes, a developed profile can last many times longer), the economy is priced off income per HOUR at
each stage rather than a flat per-run figure, and the sim can report the curve.

### G19 — PER-CHARACTER PROGRESSION + SPECIALISATION  [status: open]
Owner, verbatim: *"another mechanic some games use is that some of your gained skill that makes the game
easier is tied to the character. so you purchase upgrades for that specific character and they generally
aren't good at everything, so eventually you switch characters because they are better at beating certain
areas, but you are quite a bit weaker again"*

Three parts: (1) upgrades bought PER CHARACTER, (2) characters are SPECIALISED — each is better at some
areas and worse at others, (3) switching characters means starting notably weaker, which is the intended
loop. This is a long-tail progression mechanic: it gives a reason to keep playing after the first
character is maxed, and it makes character choice a strategic decision rather than a cosmetic one.

**THE CRITICAL DESIGN DETAIL IS THE OWNER'S WORD "SOME".** Only PART of the power is character-tied. That
points at a TWO-LAYER model, which is also exactly what Vampire Survivors does (a GLOBAL PowerUps shop
applying to every character, plus per-character Golden Eggs):
- **GLOBAL layer** (today's shop) = a floor. Keeps working on every character, so switching never means
  starting from nothing.
- **PER-CHARACTER layer** = specialisation and the long-tail grind.
This ordering matters: if ALL power were per-character, switching would feel like a punishment and a
player who invested in character A would resent needing character B. The global floor is what makes the
soft reset read as "a different build" rather than "I lost my progress".

**Specialisation needs things to be good AT**, so this depends on content variety:
- preferred BIOME/STAGE (connects to the map-selection gap — research running),
- preferred ENEMY types or density (e.g. strong vs swarms, weak vs ranged),
- preferred PLAYSTYLE (e.g. a stance/pilot synergy, or a weapon family).
Pick the axis only after the map and enemy research lands. A character must have a visible identity the
player can plan around.

**WHY THIS IS ALSO THE ANSWER TO THE 60-HOUR PROBLEM:** N characters x M upgrades each multiplies
purchasable entries WITHOUT inflating any single item's price. Our catalogue is short because 34 entries
carry the whole economy and two items hold 48% of it. Per-character paths add breadth structurally
instead of by making items expensive — which is exactly the shape G17 and CATALOGUE_PLAN.md call for.

**RISKS AND MITIGATIONS (do not skip these):**
- The soft reset must not feel like a tax: keep the first per-character upgrades cheap, keep the global
  floor meaningful, and make each character's speciality legible BEFORE the player invests.
- Do not let one character become strictly best (that kills the whole loop). Each needs a real weakness.
- Do not gate the CORE game behind per-character power — a fresh character must still be playable.

**SCHEMA REQUIREMENT:** per-character progress must live in its own namespaced section of the profile
(e.g. `characters: { [id]: { upgrades, ... } }`), never as scattered top-level fields, so future
per-character data never needs another top-level migration. The save foundation wave (W1) has just
finished; verify its schema can hold this and extend it if not — one clean migration now beats five later.

**Reached when:** per-character upgrades exist and persist, the global layer still applies everywhere, at
least three characters have distinct and legible specialisations with real weaknesses, switching
demonstrably resets the per-character portion while the global floor holds, and the sim can report
progression for a fresh character vs a developed one.

## Loop mechanics

- Write every brief to a file; give each agent strict file ownership and a single writer per file.
- After every wave: run the full suite myself, spot-check the claims against the code, and commit with
  an honest message. Agent self-reports are not evidence.
- Verify anything that claims to be "verified" — a previous wave's verifier caught a regression that
  would otherwise have shipped (the desktop chrome rendering over the intro movie).
- Publish (G1) whenever the correctness goals hold; do not wait for G6.
- Record what each wave actually did here or in a wave note, including what did NOT work.

---

## G18 CORRECTION (2026-09-12) + NEW CONTENT GOALS

**G18 IS NOW THE TOP STRUCTURAL PRIORITY, AHEAD OF THE ECONOMY. [OWNER-CONFIRMED 2026-09-12:
*"You have the right idea for run length."* — the 30:00 limit with early deaths at 3-6 min and survival
as the earned progression gate is the approved model; do not reopen it.]** The run-structure study invalidated my
own working assumption, so it is corrected here rather than quietly edited:

- Our run is **~3.5 min ended by death**. The genre leaders complete a run at **30 min** (VS) or **10 min**
  per stage (Megabonk). "Everyone dies by minute 5" is therefore **not a design choice matching the genre
  — it is a failure state.**
- **We have no victory condition.** VS pays a discrete "stage complete" bonus for surviving to the limit.
  If every run ends in death, every run is a loss. Part of the testers' "this feels off" is a MISSING WIN,
  not only balance.
- **New targets:** completed run = **8-12 min** (~10 working); add a **RUN SURVIVED** win at the limit with
  a payout; boss stays a milestone for unlocking rather than the only ending; cadence = one wave per
  minute + an enemy scaling ramp + a boss/elite beat every ~2-3 min (3-4 beats per run).
- **ECONOMY REPRICE:** 60h at ~10 min = **~360 runs** (I had computed ~1,029 at 3.5 min). Final boss at
  40h = **~240 runs**. Every earlier pacing target that encodes 3.5-min runs — including the mid-tier
  "35-65% after 10 good runs" figure — is now the wrong unit and must be rebuilt.
- Validation: VS completionist mean **56.6h** (n=861), Megabonk **59.5h** (n=37) — our 60h is normal. Our
  run COUNT was the outlier, not the hours.

**G20 — PLAYER-SELECTED STAGES + A MODIFIER AXIS.** 6-8 selectable stages (VS ships ~27; Megabonk 3 maps x
3 tiers), each with 2-3 modes/tiers. Use the cheap "modifier-on-arena" model: reuse geometry, swap the
enemy pool, apply per-stage stat modifiers, retint, add ONE signature hazard. Per-stage ITEM/REWARD POOLS
are what make stage choice a build decision. Gate stages by achievement-style unlocks (reach level X,
defeat a boss), not gold. Add a separate Hyper/Inverse/Endless-style modifier axis — the highest-ROI
variety lever in either game. **Never ship a reskin:** players judge maps on mechanics.

**G21 — RULE-CHANGING CARDS + A SMALL ACTIVE SET.** Neither leader has player-triggered actives (VS is
100% auto; Megabonk's "abilities" are passive character traits) — so our actives were never the gap. Keep
3-4 actives on distinct ROLES (CC / burst / mobility / defense) and add **12-20 rule-changing cards** that
rewrite how abilities behave ("on-kill explosions", "healing also damages nearby enemies", "empty slots
grant cooldown", "all projectiles pierce"). Finite build slots so every pick excludes others; a keyword
taxonomy (FROST/CHAIN/ORBIT/BURN/CONDUCT) so stacking is legible; one rule-card per tag plus cross-tag
combos; an opportunity-cost incentive for leaving a slot empty.

**G22 — ENEMY BEHAVIOUR BUDGET + THE RARITY LADDER.** 25-40 named enemy types over **~8 distinct
behaviours** (hard cap 10), one behaviour per archetype, and a genuine gap to own: VS has **no splitter**.
Elites = stat + resistance + size + **persistence** (steal VS's "cannot be outrun, teleports back on
screen") with exactly one visible tell. Publish the elite rate as a NUMBER (Megabonk: 0.6% per eligible
spawn, linear with a stat, and not every type can roll elite). Rare signalling has three levers: spawn-tell
(unique silhouette/size/outline/HP bar/clock position), **anti-tell** (the Mimic model — disguise a rare
1:1 as a common enemy and let recognition be the reward, with a guaranteed distinct drop), and map/UI-tell
for secrets (pulsing icon, black question mark, silhouette, stopped timer). Every new tier should introduce
a MECHANIC, not a multiplier.

**G23 — BESTIARY WITH FOUR JOBS.** Per-enemy KILL COUNTER (proof of progress), combat stats that matter
(HP/power/speed/resistances/skills/stage), undiscovered entries that show the SLOT but hide the identity
(number visible, name and stats masked), and a HOOK (unlock-tied entries highlighted + flavour text). Plus
a "which entry am I missing" filter — chasing the last entries is real player activity in VS.

**G24 — OPT-IN DIFFICULTY THAT PAYS.** Both leaders pair a difficulty dial with MORE rewards (VS Curse →
more kills/XP/gold, Hyper +50% gold; Megabonk Difficulty → more XP/Silver/gold). This is the genre's
primary long-tail progression tool and ours only hurts. Heat must visibly PAY MORE, not just bite harder.

**MEASURED 2026-09-12 (real frame loop, post-fix — the SURVIVAL-GAP wave result):**

- **Fresh** (n=11): mean **198–226s**, 0/11 reached the limit. In the target 3–6 min band.
- **Partial** (n=6): mean **531s**, 3/6 still alive at the 1000s cap.
- **Maxed** (n=4, three of them run to the full 1800s): **3/4 RUN SURVIVED at 30:00**
  (waves 9 and 12 reached; best 12/15 waves). One run died at **252s on wave 2 to a WARLOCK shot** —
  so a maxed save is NOT invincible, and the survivor rate is 75%, not 100%.
- Before the fix every stage died at wave 1 (fresh 136s, partial 107s, maxed 129–133s) to the
  GRAVELMAW charge: `14 · ladderDmg(2.6) · 2.2 · 1.5 = 120` against a 130–230 HP bar.
- The gap was the damage FUNCTION plus a missing EHP axis, not one flat number. Ranked levers that
  fixed it: per-hit cap (0.5 × maxHP) > contact exponent (0.65) > HP-per-level (0.015, linear) >
  drain-cap (2 latched ticks).
- REMAINING: the maxed runs die to a **ranged burst (WARLOCK shot)** and fresh runs are still
  bimodal (3 of 8 died at 62–107s to the 0:60 HERALD). The wave-1/2 burst relative to a starting
  pool is the next lever, and it needs its own before/after cohort.

Full consolidated numbers live in `docs/DESIGN_TARGETS.md` (supersedes scattered figures elsewhere).

**G25 — THE APEX TIER: deliberately game-breaking prestige items.** Owner, verbatim: *"there should also be
some mecha ultra super powered items in the shop that basically break the game once they are purchased.
their cost should require a grind even with top level gear, and they shouldn't be considered when it comes
to length of time for completion of the game. they are strictly to offer a stretch goal for an extra
committed player. the 'proof' for the player who wants to feel accomplished"*

Five requirements, all binding:
1. **They BREAK the game** — each one removes a CONSTRAINT rather than adding a number (+20% is not apex;
   "weapons have no cooldown" is apex).
2. **Cost = a real grind at END-GAME income**, priced against a fully developed late build, not early runs.
3. **EXCLUDED from the completion curve.** The ~60h target and every pacing target must be computed WITHOUT
   them, so the apex tier never inflates the "time to finish" figure.
4. **A separate, clearly-marked tier** in the shop, gated behind completion milestones so they cannot be
   bought early or by accident.
5. **They are PROOF.** Ownership must be VISIBLE — aura, title, HUD flourish, and a full-screen pixel-art
   gallery entry — or the grind has no trophy value.

**THE ECONOMY WIN THIS SOLVES:** after ~60h of unlocks, gold normally becomes meaningless and the loop
dies. An infinitely-scaled prestige sink gives late gold a purpose forever, which is also the honest answer
to "what do I do now" for a player who has finished everything.

**DESIGN RULES (these are where it goes wrong if ignored):**
- **Break the game ON PURPOSE and OBVIOUSLY.** These are not balance-neutral; they are meant to be absurd.
  Do not tune them down later. Their absurdity is the reward.
- **DETERMINISTIC, never random.** VS's Golden Eggs are the closest precedent and the cautionary tale:
  random per-character stat eggs let players permanently degrade their own movement control. Ours are chosen,
  named, and legible.
- **MUST BE TOGGLEABLE OFF.** Megabonk's community lesson is exact: unlocks that permanently join the pool
  make the game worse and players rush to find the Toggler. Apex gear must be switchable so a player can
  return to an honest run.
- **NEVER REQUIRED.** No achievement, trophy, stage, character or ending may depend on owning one. Otherwise
  the stretch goal becomes a wall.
- **PROTECT THE INTEGRITY OF THE CLEAN CLEAR.** A run completed with apex gear must be distinguishable from
  one without (e.g. a marked result), so "I beat it legitimately" keeps its meaning. This is the whole point
  of the tier — the proof only means something if the un-boosted version is still on the record.
- **PARTITION THE DATA.** Catalogue/balance tooling must carry an explicit `apex` flag, or our own sims will
  silently fold the apex tier into "time to buy everything" and skew every pacing number.

**Shape I recommend:** one tier, named **APEX**, sitting above the normal catalogue in its own shop panel,
with ~6-10 items. Two kinds: (a) *rule-breakers* — "weapons never stop firing", "the run no longer ends at
the limit", "chests always yield the maximum", "a full passive loadout from the first minute", "your
character's signature rule applies to every character"; and (b) at least one *pure-proof* item — no power
at all, nothing but a visible mark that the player did it. Priced so the first takes many hours of
top-tier play and the last of them is a genuine long-haul goal.

**Reached when:** an APEX panel exists and is gated behind completion; each item removes a real constraint
visibly and can be toggled off; their cost is calibrated against measured end-game income (not guessed);
completion-time reporting excludes them and says so; and a clean (non-apex) clear is still distinguishable.


---

## PARENT VERIFICATION — G9 gallery (2026-09-12, remy)

Independently verified after the builder reported done (a subagent's summary is a claim, not evidence):

- **Suite re-run by the parent: `PASS=55 FAIL=0`** (not taken on report).
- **Live browser check** (real Chrome, the game served locally): the title menu lists **TROPHIES**;
  the screen opens with PREV / NEXT / BACK; a locked entry draws the LOCKED padlock emblem
  full-screen with its REAL goal text ("Enemies slain (all runs): 0 / 1"); the overlay is
  transparent + bottom-anchored as designed; and the DOM chrome gate is clean in this mode
  (`#hud`, `#hints`, `#touch`, `#joy` all `display:none`).
- **No shop price changed** — `git diff src/meta.js` shows comments and one guard line only.
- **agentlock released** (state FREE).

### OPEN — found by the parent, for the next slice

1. **Canvas play-HUD bleeds through the gallery.** The in-run HUD (HP/MP/XP bars, LV, run clock,
   bottom hint text) is dimly visible behind the showcase because the backdrop is not fully
   opaque. The gallery is NOT a play state: skip the play-HUD draw in `render.js` when
   `state.mode === 'trophies'`, or make the backdrop opaque. (DOM chrome is already correct;
   this is canvas-side.)
2. **Run-end hook coverage gap.** `die()` and `endRun()` share `settleRunGold()` with
   `runSurvived()`, which IS driven through the real win seam — so the hook reaches them by
   construction, but **no test asserts a trophy earned via a real death or early exit.** Add one.
3. **Four achievements cannot be earned through the live hook yet**, because the run summary
   carries no `bossKills` / `chests` / `untouchedWave`: FIRST_BOSS, BOSS_SLAYER_5, CHESTS_25,
   UNTOUCHED_WAVE. Wire those counters out of live state.
4. **No browser-verified EARNED emblem yet.** A hand-seeded profile is overwritten on reload by
   the `pagehide`/`beforeunload` autosave — which is the progress-flush working as designed, not
   a bug (identified after two failed seeding attempts; the loader itself was proven clean:
   `status: current, repairs: [], gold/earned preserved`). To see an earned emblem, earn one in
   play, or re-seed from a late-registered `pagehide` listener that runs after the flush.
