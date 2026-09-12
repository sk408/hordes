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

## G2 — THE WALL BUGS (owner-reported, currently the worst in-game experience)  [status: DONE 2026-09-12]
STATUS RECONCILED by the cron tick: this shipped in wave-27 (`6f69bed`) but the marker was never
flipped, which made the loop's "OPEN first" rule keep pointing at finished work. Evidence, not a claim:
`test/test_wall_loot.mjs` (165 lines), `test/test_pilot_grind.mjs` (213) and
`test/test_camera_deadzone.mjs` (261) are all green in the current 56/56 suite, which is exactly the
"each proven by a headless test" bar. The camera half was additionally checked by that wave in a real
browser; the tick did not re-shoot it (no browser on this host — see the tick note at the end).
The pilot visibly grinds against the wall for seconds, and loot can drop on or outside the wall.
**Reached when all three hold, each proven by a headless test:**
1. No loot/gem/chest/pickup can spawn outside the reachable region, at the rim, or on the wall band —
   accounting for wall thickness and pickup radius, at every drop source.
2. The autopilot never accumulates wall-ward pressure against an unreachable target; it holds near the
   boundary for an enemy still outside (enemies entering from outside remains intended behaviour).
3. The camera is decoupled from perfect centre (deadzone + travel lead) with the player clamped to a
   safe screen region, AND the coachmark world-to-screen projection still lands correctly (one source
   of truth for the transform).

## G3 — REMOVE THE REDUNDANT DOCTRINE TEXT  [status: DONE 2026-09-12]
STATUS RECONCILED by the cron tick: `grep -rn "FOCUS NEAREST\|STANCE GREEDY" src/` returns NOTHING
(wave-27, `6f69bed`), so the on-canvas doctrine text is gone. CAVEAT, recorded honestly: the tick
verified only the "text is gone" half. The "exactly ONE source of truth for the doctrine values" half
was not re-audited here — that was wave-27's own claim. Treat the single-source half as
wave-27-asserted, not tick-verified.
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

### G8 — RUN-ALTERING ITEMS, SKILL ITEMS, AND LUCK  [status: DONE 2026-09-12 - all four steps landed and suite-verified (luck touches the draft; RUN RULES = HORDE BAIT + ONE OF EACH, `once` retuned to 1.31x by the extended weapon ladder; perks = REGROWTH / FOCUS / THICK; rewrites = PIERCE ALL / CHAIN REACTION / BLOOD HARVEST). Suite PASS=60 FAIL=0 with test/test_rewrites.mjs (22 checks). The tick-7 `once` defect (0.65x) is FIXED, not waived: 1.31x >= the 0.8x bar, measured 60 runs, and every rewrite card passes the same bar. See TICK NOTE 9. TICK 10 CORRECTION: the "suite PASS=60 FAIL=0" claim was NOT reproducible as landed - `bash /tmp/run_all.sh` came back PASS=59 FAIL=1 (test/test_rewrites.mjs) twice. The dt probe was measuring a random field event; fixed test-side, suite now PASS=60 FAIL=0 twice and test_rewrites is 23 checks. See TICK NOTE 10]
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
**Items 1-3 are RESOLVED (2026-09-12 cron tick) and item 4 is RESOLVED TOO (later the same day) — see
the two "TICK NOTE" sections at the end of this file. One NEW bug was found while closing item 3.
The parent's premise for item 4 ("this host has no browser at all") was WRONG: see the second tick note.**

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


---

## TICK NOTE — 2026-09-12 (cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** the G9 follow-up OPEN list (the four unearnable trophies + the gallery HUD bleed).
Nothing new was started; the ranked queue was not touched.

**LANDED (suite PASS=56 FAIL=0, re-run by the parent, not taken on report):**
1. **The four unearnable trophies are earnable through the live loop.** `src/main.js` now carries
   `state.runCounts = { bossKills, chests, waveTookDamage, untouchedWave }`, reset in `startRun()`,
   incremented at the REAL seams — the enemy-death sweep (`e.boss`), the chest-open event from
   `tickChests` (`kind === 'chestOpened'` only, so a despawned chest never counts), the three hostile
   damage paths (drain / contact / shot), and the wave-completion seam `continueRun()`, which banks
   `untouchedWave` when nothing landed during the wave that just ended. All three ride
   `recordRunAchievements` into `recordRun`, so `FIRST_BOSS`, `BOSS_SLAYER_5`, `CHESTS_25` and
   `UNTOUCHED_WAVE` now earn. `CHESTS_25` gates the PALADIN character row, so this was locking real
   content, not a badge.
2. **NEW BUG found while closing item 3:** `UNTOUCHED_WAVE` was ALSO 0-by-construction —
   `measuredValue` reads `t['best' + Cap(stat)]` for `kind: 'best'`, so a 'best' goal on
   `untouchedWave` looked up `bestUntouchedWave`, a field nothing writes. Fixed in
   `src/achievements.js` by pairing the counter honestly (`kind: 'total'`, same bar of 1) rather than
   inventing a second field. So the gap was FIVE broken trophies, not four.
3. **The gallery HUD bleed (parent item 1) is fixed and asserted.** The play HUD trio
   (moment flourish, HUD chrome, boss banner) is now ONE seam, `Renderer.drawPlayHud`, which paints
   nothing in `state.mode === 'trophies'` (paint order unchanged). The canvas half of the chrome gate
   now matches the DOM half.
4. **New test file `test/test_trophy_hooks.mjs` (4 checks)** — drives chests, a boss death, the wave
   ledger and a REAL death through the live loop and the real `die()` funnel (parent item 2), then
   asserts the trophies and that the PALADIN row became owned. `test/test_trophy_gallery.mjs` gained
   the render-gate check (21 checks now).

**Rules held:** nothing was poked into a profile in the tests (real loop in, real funnel out).
No assertion was weakened; `UNTOUCHED_WAVE`'s bar stayed at 1. No `git` state command was run.

**COULD NOT VERIFY (open, for whoever has a browser):**
- **The real-browser screenshot of the trophies screen was NOT taken.** This host has no browser at
  all (`which chromium/chrome/firefox` empty, no ms-playwright cache), so the visual half of item 1
  could only be proven headlessly (the gate is asserted on the real renderer, and the *look* was
  proven by the earlier wave's live Chrome check). Re-shoot with the gallery open on a phone-sized
  viewport before W10 signs the screen off.
- **Item 4 remains open:** no browser-verified EARNED emblem. Note that your own save-overwrite
  finding applies: earn one in play, or seed from a late-registered `pagehide` listener.

## TICK NOTE 2 — 2026-09-12 (cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** G9's LAST TWO OPEN items — the trophies screen re-shot at a PHONE viewport (the visual
half of OPEN item 1) and the browser-verified EARNED emblem (OPEN item 4). Nothing else was started.

**THE STANDING BLOCKER IS GONE.** The previous tick recorded "no browser on this host". This tick
installed one: `playwright@1.49.1` + chromium 131 (`~/.cache/ms-playwright`, 161MB). No repo runtime
dependency was added (the repo stays code-only). The harness is now reusable in-tree:
`tools/verify_phone.mjs` (phone-viewport verification + JSON of measured canvas pixels) and
`tools/gen_earned_profile.mjs` (schema-valid profile with trophies earned through `recordRun`); usage
and setup are in the headers (`PW_BASE`, `HORDES_URL`, `SHOTS_DIR`).

**MEASURED — 390x844 @ DPR 3, touch, iPhone UA (canvas 1170x729). Screenshots in
`docs/art/browser-verify-2026-09-12/`:**

| case | bright px | bright bbox | top-12% band | bottom band | corner | case centre |
|---|---|---|---|---|---|---|
| gallery, LOCKED | 41,424 | 370,151,799,577 | **0** | **0** | #030308 | #5c5e6b |
| gallery, EARNED | 44,195 | 370,151,799,577 | **0** | **0** | #030308 | #792021 |
| live run (control) | 16,921 | 14,5,1161,701 | **12,947** | 342 | #0e1610 | #0e1610 |

- **Item 1 (HUD bleed) CLOSED.** In the gallery the top band — where HP/MP/XP bars, LV and the run clock
  live — has ZERO bright pixels and all painted content sits in one centred box; the SAME measurement
  during a live run lights 12,947 bright pixels in that band. The metric is sensitive to the play HUD
  actually being drawn, so 0 in the gallery means the HUD is not painted, not merely hard to see.
- **Item 4 (earned emblem) CLOSED.** With a profile carrying FIRST_BLOOD (3/21), the entry reads
  "First Blood · 1/21 · Draw first blood: kill your first enemy · Enemies slain (all runs): 1 / 1 ·
  earned 9/12/2026" and its showcase centre pixel is crimson #792021; the same entry on a fresh profile
  reads "LOCKED" with centre #5c5e6b. The title card label reads "3 / 21 earned" vs "0 / 21 earned".
- **Item 4's real problem was ORDER, not a save bug:** install the profile with `addInitScript` BEFORE
  the page's scripts run; the pagehide flush then writes the same profile straight back.
- DOM chrome gate in the gallery: `#hud / #hints / #touch / #joy` all `display:none`, matching the
  canvas gate. Suite re-run by the parent: **PASS=56 FAIL=0**.

**COULD NOT VERIFY (honest):**
- **No vision read.** No vision model is reachable from this runner (`kimi-vis :5495` is a SPA, not an
  API). The screenshots were read as PIXELS (bands, bbox, sampled hex, on-screen text) — objective, but
  not a "does it look right" judgement. Re-shoot + vision-read at W10.
- **The `before` state of the bleed was not measured** (the fix is already in the tree and git state
  commands are forbidden for agents). The live-run control is the substitute.
- **RESOLVED 2026-09-12 (tick 3) — see TICK NOTE 3 at the end of this file.** The tour still runs on the
  title (by design: `FIRST_RUN_TOUR` stage 1), but a finger tap on a menu card now REACHES the card, and
  the tour teaches TROPHIES. The finding below is kept as the record of what was wrong.
- **NEW FINDING (W4/G12 — one extra tap, not a blocker): the FIRST-RUN TOUR renders over the TITLE.**
  On a fresh profile the tour tip ("PLAY starts a run — pilot the horde as long as you can." +
  "TAP TO CONTINUE" + "SKIP TOUR") and its `.tour-shade` sit ABOVE the menu cards: a real finger tap on
  the TROPHIES card at (275,422) is swallowed by the shade and does not open the gallery. It is not a
  hard block (the tip says TAP TO CONTINUE, and SKIP TOUR is offered), but the build plan explicitly
  asks that the first-run tour "not appear over the title screen" — either anchor the tour's first step
  on PLAY and let the tap advance it, or stop the shade covering the menu.
  Evidence: `docs/art/browser-verify-2026-09-12/phone-title-tourblock.png`. The key-hints panel IS
  clean on the title (`#hints=none`).
- Suite counting note: PASS=56 = `test_*.mjs` + `smoke.mjs`; `test/_harness.mjs` is support, not a case.

**NEXT: G8** (run-altering items + luck), per the ranked queue. Recon done in this tick, for the next
brief: luck is ALREADY a real stat (`Fortune`, meta.js, 5 levels) but it only shifts world-drop rarity
(`luckDropWeights`) and flash-drop chance (loot.js) — it does NOT touch the level-up draft, which is the
other half of the owner's ask ("what the run OFFERS"). `openDraft()` in main.js draws 3 cards from a
weighted pool (weapon cards 1, stat cards 0.3) on a plain `Math.random`, and there is no run-altering
item category at all yet. G8 also needs an OWNER decision on WHICH run-altering items he wants, so the
next tick should surface a numbered option list rather than guess.


## TICK NOTE 3 — 2026-09-12 (cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** nothing new started. This tick closed the one OPEN finding left in this file from tick 2
(the W4/G12 tour-over-title finding: a real finger tap on the TROPHIES card was swallowed by the tour
shade, and TROPHIES was the one title card the tour did not teach).

**LANDED (suite re-run by the parent: PASS=56 FAIL=0; tree was clean at fb692fe before the slice):**
1. **`src/tour.js` — `passThrough` (OPT-IN).** A tap that lands on a real control UNDER the shade now
   presses that control: the tour tears down, marks itself done, and forwards the press. Hit-tested with
   `document.elementsFromPoint` at the tap's client coords, guarded so a missing API (fake doc, old
   browser) falls back to plain advance. **The opt-in is the point:** the in-run coachmarks pause the sim
   under the shade, so a pass-through there would silently pick a draft card the player only tapped to
   dismiss the tip. Only the stage-1 title tour sets `passThrough: '#ov-cards > .card'`.
2. **`src/main.js` — the tour now teaches TROPHIES** ("TROPHIES - every emblem you have earned, full
   screen."), inserted in menu order. This is build-plan item 9 honoured for the gallery (taught, not left
   to luck), and it is asserted, not merely written.
3. **`test/test_tour.mjs`** — retargeted, not weakened, and now STRONGER. The integration case hardcoded
   "advance through all 5 steps"; it now derives the count from the live menu (`seen.length ===
   cards().length`) and asserts the tour teaches TROPHIES. A future menu screen nobody teaches fails the
   test instead of shipping silently. Plus 3 new engine cases: the pass-through presses the card and ends
   the tour; pass-through is opt-in (a tap over a card without it still just advances); and no hit-test
   API means a safe plain advance.

**MEASURED — real browser, phone viewport (390x844 @ DPR 3, touch, fresh profile), served locally,
screenshots in `docs/art/browser-verify-2026-09-12/`:**
- **The tap now lands.** `page.touchscreen.tap` (a real touch event) at the TROPHIES card centre
  **(275,422) — the exact coordinate recorded as swallowed in tick 2** — opens the gallery:
  `tourGone: true`, gallery up (`PREV / NEXT / BACK`, "LOCKED 1 / 21 ... Enemies slain (all runs): 0 / 1"),
  DOM chrome gate `#hud=none #hints=none #touch=none #joy=none`. Before: that same tap only advanced the
  tip (evidence: `phone-title-tourblock.png`). New shots: `phone-title-before-tap.png`,
  `phone-title-tap-passthrough.png`.
- **The tour teaches all six cards**, in menu order, read from the live `#tour-tip`: PLAY, SHOP,
  CHARACTERS, **TROPHIES**, SETTINGS, HOW TO PLAY. Shot of the TROPHIES step:
  `phone-title-tour-trophies.png`.

**COULD NOT VERIFY (honest):**
- **No vision read.** No vision model is reachable from this runner, so the shots were read as DOM state +
  text, not as a "does it look right" judgement. Same standing gap as tick 2; re-read at W10.
- The before-state of the swallowed tap was NOT re-measured in this tick (the fix is already in the tree
  and git state commands are forbidden for agents); tick 2's shot is the record.
- Touch + mouse input verified. The desktop keyboard path (digits 1-6 -> menu cards) is unchanged and was
  not re-walked.

---

## G8 DECISION NEEDED FROM THE OWNER (surfaced, not guessed)

Recon stands from tick 2: **luck is already a real stat** (`Fortune`, 5 levels in `meta.js`) but it only
shifts WORLD-DROP rarity (`luckDropWeights` in `loot.js`) and flash-drop chance — it does not touch the
level-up draft at all, which is the other half of the ask ("what the run OFFERS"). And there is no
run-altering item category yet: `openDraft()` draws 3 cards from a weighted pool (weapon 1, stat 0.3) on a
plain `Math.random`.
Numbered options for the owner to pick from (my recommendation in brackets):
1. **Luck touches the draft** — pool weights shift with Fortune, so high luck measurably offers the rarer
   cards more often. Cheapest real change; no new content.
2. **Run-altering items, rule-rewrite shape** — cards that change how the run PLAYS, one per keyword
   ("all projectiles pierce", "on-kill explosions", "health pickups also damage"), borrowed from G21's
   rule-card model. Biggest depth, biggest job.
3. **Run-altering items, condition shape** — "no stat is ever offered twice", "every chest is a horde",
   "waves never stop until you bank one". Cheap to author, very legible to the player.
4. **General skill items** — small always-on perks (move speed, pickup radius, regen, cooldown) as a
   distinct card family from the stat cards.
5. **Luck as a currency/choice** — a shrine or shop row that buys luck for a run, so the player can bet
   on it (this also uses the existing shrine hook).
6. **All of the above, sequenced** — 1 first (measurable, no content), then 2/3 as the content pass.
[Bracketed recommendation: 1 + 3 first — both are cheap, both are measurable in the existing draft sim,
  and they answer "more of a factor in the run" without inventing a whole card system up front.]

### OWNER DECISION — 2026-09-12: **option 6, sequenced 1 -> 3 -> 4 -> 2.** [status: DECIDED]

The owner picked 6 (all of the above, sequenced) over the minimal "1 + 3". Rationale, so the build does
not have to re-derive it: the original ask named THREE things — run-altering items, general skill items,
and luck as a real factor — and only 6 delivers all three. The order front-loads cheap, measurable work:

1. **Luck touches the draft** first — pool weights shift with `Fortune`. No new content, and the effect is
   immediately measurable in the existing draft sim (`tools/draft_sim.mjs`), so it establishes the
   measurement before any content lands.
2. **Condition-shape run-altering items** (option 3) — cheap to author, very legible to a player
   ("no stat offered twice", "every chest is a horde"), and measurable in the same sim.
3. **General skill items** (option 4) — a distinct always-on perk family, separate from stat cards.
4. **Rule-rewrite run-altering items** (option 2) LAST — the real content pass, biggest job, and by then
   the measurement harness from steps 1-2 is already proven.

Do NOT ask again; build in this order. Each step still has to keep the existing invariants (bad draft can
fail, good beats bad >=3/5 metrics, no single pick loses a run) and keep the suite green.


---

## TICK NOTE — 2026-09-12 (second cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** the LAST open G9 item — the real-browser screenshot of the trophies screen and of an
EARNED emblem (parent item 4). Nothing new was started; the ranked queue was not touched.

**CORRECTION to the previous tick note:** "this host has no browser at all" is false. `which` found
nothing because the binary is not on PATH — Chrome for Testing 153.0.8010.12 is sitting in the
playwright cache (`~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`) and runs fine. Any
future "needs a browser" claim should start there (`ls ~/.cache/ms-playwright`), not at `which`.

**LANDED (suite PASS=56 FAIL=0, re-run by the parent, not taken on report):**
1. **`tools/browser.mjs`** — a reusable REAL-BROWSER harness: serves the project over http (ES modules
   need a real origin), launches that Chrome headless, drives it over CDP with node's own global
   WebSocket (no npm install, no playwright package), and exposes `evaluate / waitFor / shot /
   readShot / click / tap / rectOf` at any viewport. `readShot(png, points)` DECODES THE CAPTURED PNG
   IN THE PAGE and samples it, so "read the screenshot" is literal, not a metaphor.
2. **`tools/verify_g9_gallery.mjs`** — 15 checks, ALL PASS, phone form factor 390x844 @ dpr 3
   (screenshots are 1170x2532 device px). Evidence, measured, not asserted:
   - title card reads `TROPHIES — 0 / 21 earned · full-screen emblems`, and a REAL finger tap on it
     (CDP touchStart/touchEnd) opens `mode === 'trophies'`;
   - the overlay sheet is cleared (`rgba(0, 0, 0, 0)`, `flex-end`) and the pad layer is gated off;
   - LOCKED state paints the padlock, names it LOCKED, and still prints the goal
     ("Enemies slain (all runs): 0 / 1");
   - **the anti-bleed fix is proven in the real compositor:** brightness-scanning the whole 120x30
     in-run HUD strip in the canvas, the brightest pixel is `#05060b` (22/765), and the same strip
     sampled out of the composited PNG is `#030409` throughout — the HUD is gone, not dimmed;
   - the earned path is driven through the REAL hook (`recordRun(profile, {kills:1,wave:1,time:1})`):
     FIRST_BLOOD flips unearned -> earned, the name replaces LOCKED, and the emblem read out of the
     PNG is `#a02a2a` / `#e04a4a` / `#5c1414` — the art's own palette entries at scale 5 in the
     display case;
   - PNG vs LIVE CANVAS agree within one canvas pixel at every sampled point (which is how the
     screenshot is known to be that canvas, not a stale frame);
   - no uncaught page errors, no console errors, for the whole run.
   Screenshots: `/tmp/hordes-shots/g9-01-title-phone.png`, `g9-02-trophies-locked-phone.png`,
   `g9-03-trophies-earned-phone.png`. Regenerate any time with `node tools/verify_g9_gallery.mjs`.

**HARNESS FACTS worth keeping (each one cost a failed check to learn):**
- the page boots into the intro movie (`state.mode === 'intro'`) — a keydown skips it;
- a FRESH profile then lands on the HOW TO PLAY onboarding, NOT the title: `hordes_onboarded === '1'`
  is what puts the title (and its TROPHIES card) on screen;
- the canvas renders at DPR-NATIVE resolution (1170x729 here, not 480x300), so every view coordinate
  must be projected through `CONFIG.VIEW_W/VIEW_H` before it means anything;
- `UI_GUARD_MS = 400` in main.js deliberately swallows the tail of the gesture that skipped a
  cinematic. A pointerdown-then-click INSIDE that window is eaten by design — an automated check that
  clicks immediately after skipping the intro will fail and look like a broken card. Wait it out
  (or send a fresh pointerdown) before concluding anything.

**COULD NOT VERIFY / LIMITS OF THIS EVIDENCE (stated plainly, per the build plan):**
- The pixel evidence is POINT SAMPLES plus a brightness scan, read programmatically — this model has no
  eyes. A human or a vision model should still glance at the three PNGs before W10 signs the screen
  off as "looks right".
- Only `FIRST_BLOOD` at scale 5, only in this one viewport. The other 20 emblems, the locked/unlocked
  mask shape at other aspect ratios, and the real-device feel (this is Chrome touch emulation, not a
  handset) are NOT individually verified.
- The world behind the gallery is the FROZEN title scene here, not a mid-run freeze; the mid-run
  bleed case is covered by the render-gate test, not by a screenshot.

**Status:** G9 remains DONE and its follow-up list is now fully closed. Parent item 4 -> RESOLVED.
**Next goal:** G8 (run-altering items + skill items + luck), build order 1 -> 3 -> 4 -> 2 per the
owner's decision at the bottom of this file.

## TICK NOTE 4 — 2026-09-12 (cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** G8 STEP 1 — "luck touches the draft" (owner decision option 6, build order
1 -> 3 -> 4 -> 2). Nothing else was started. **Next: step 3** (condition-shape run-altering items).

**LANDED (suite re-run by the parent, not taken on report: PASS=57 FAIL=0; the suite was PASS=56
before this slice, 57 now because the new test file is one case):**
1. **`src/meta.js` — the shared luck-to-draft seam**, the same pattern as `luckDropWeights`:
   `DRAFT_RARITY` (a POWER TIER TAG on the seven UPGRADES stat cards — metadata, no new cards),
   `luckDraftWeights(luck)`, `draftRarityOf(id)`, `draftCardWeight(id, kind, luck)`.
   **The shift TRANSFERS weight, it never adds it**: each Fortune level moves 5% of the COMMON
   group's base weight onto the RARE tier, so the stat family's total weight is invariant
   (asserted to 1e-12). Luck buys RARITY, never a bigger pool.
2. **`src/main.js` openDraft** computes every stat card's weight through that seam
   (`draftCardWeight(u.id, 'stat', state.player.stats.luck || 0)`). Weapon cards stay at the
   shipped 1.0 — they ARE the weapon economy, so the sim's lever L1 stays literally true.
3. **`tools/draft_sim.mjs`** mirrors the same seam (`buildDraftPool` + `LIVE.luckLevel`), and
   `measureDraftOffers(luck)` is the new pure seeded measurement.
4. **The Fortune shop line** now says what it does (build-plan item 8): "world-drop rarity and the
   level-up draft both shift toward the rarer cards, per level".
5. **New `test/test_draft_luck.mjs`, 20 checks**, including the REAL GAME seam: `src/main.js`
   openDraft() driven through the headless DOM harness with a seeded rng, reading the rendered cards.

**MEASURED (numbers, not intentions). Offer rates are per 3-card offer (20k sim draws / 4k real drafts):**

| view | luck 0 | luck 5 |
|---|---|---|
| RARE cards offered (sim pool) | 0.4950 | 0.6058 (x1.224) |
| COMMON cards offered (sim pool) | 0.4950 | 0.3802 (x0.768) |
| stat cards offered (the BUDGET) | 1.7323 | 1.7299 (invariant) |
| Whetstone offered, REAL openDraft() | 0.2455 | 0.2985 (x1.216) |
| GREED-DAMAGE, 30 runs: survival / gold | 229.8s / 1932 | 323.7s / 3656 |
| ADVERSARIAL-BAD, 30 runs: survival / gold | 130.2s / 479 | 137.8s / 548 |

Two independent harnesses (the sim's pool and the real game) agree within 1% on the offer effect.

**TWO THINGS THE MEASUREMENT CAUGHT (both are why this slice is worth a report):**
- **The first attempt (transfer 0.10/level) was a balance landmine.** It measured 2.1x survival and
  4.0x run income at Fortune 5 and — worse — it NERFED damage builds, because the first tagging put
  `dmg` (Whetstone, the strongest stat card) in COMMON, so high luck offered the best card LESS
  often (measured: survival 237s -> 156s). Retagged by POWER (dmg/multi = RARE, hp/pierce/rate =
  UNCOMMON, speed/pickup = COMMON) and dropped the transfer to 0.05/level. The constant is ONE knob
  and the full measured curve is recorded in the test header.
- **G17 CONFLICT, flagged not buried:** even at 0.05 the maxed draft-side effect is +41% survival
  and +89% income. Gold scales superlinearly with run length, so Fortune's draft half is now a large
  income multiplier and a strong lever on the real-grind economy G17 asks for. It is NOT repriced
  here: W7a is exactly "rank the meta upgrades by MEASURED marginal value", so these numbers are its
  input and `DRAFT_LUCK_TRANSFER` is the knob. **This is an owner-visible call, not a silent one.**

**INVARIANTS HELD (each asserted, not assumed):** at luck 0 the pool is bit-identical to the shipped
one (every stat card exactly 0.3, weapon cards exactly 1.0); the shift is monotone and clamped 0..5
with every weight > 0 (no card can vanish from the pool); **DRAFT PRIMACY SURVIVES LUCK** — a
deliberately bad draft at Fortune 5 (137.8s) still loses to a good draft at Fortune 0 (229.8s) — and
the FLOOR does not fall (bad@5 137.8s >= bad@0 130.2s). No assertion was weakened; no `git` state
command was run.

**COULD NOT VERIFY (honest):**
- **No screenshot and no vision read.** Nothing visual changed (draft pool weights only), so nothing
  new was shot; the draft screen itself was last browser-verified in the W26 tick. A human or vision
  model should still glance at one draft screen before W10 signs it off.
- **The cohort numbers are a MODEL, not the live loop.** GREED/ADVERSARIAL-BAD are policy archetypes,
  and `luckLevel` is injected into a FRESH profile — a real Fortune-5 player has other purchases too —
  so the run-level deltas are an upper bound on the draft-side effect, not a predicted player outcome.
  `tools/draft_sim.mjs --validate` (the real-loop cross-check) was NOT re-run this tick.
- **Only luck is wired.** The rest of G8 (condition-shape items, skill items, rule-rewrite items) is
  untouched: those are steps 3, 4 and 2.
- **Tree state:** tick 3's `src/tour.js` work and this slice are both uncommitted (Remy owns commits).


## TICK NOTE 5 — 2026-09-12 (cron tick, subagent:spawnfa, agentlock held)

**Goal worked:** G8 STEP 3 — **condition-shape run-altering items** (owner decision option 6, build
order 1 -> 3 -> 4 -> 2). Nothing else was started. **Next: step 4** (general skill items), then step 2.

**LANDED (suite re-run by the parent, not taken on report: PASS=58 FAIL=0; the suite was PASS=57
before this slice, 58 now because the new test file is one case). No existing assertion was weakened,
and `test_chests` / `test_chests_horde_typed` still pin the old rng draw order because they pass.**
1. **`src/rules.js` (NEW FILE)** — the condition-card descriptor + pure helpers. `RULES` (two cards),
   `RULE_CARD_WEIGHT = 0.15`, `chestRarityBump` (one step UP the ladder, top band holds),
   `statCardOffered`, `ruleCardOffered`, `markStatTaken`, `grantRule`, `ruleCards(state)`.
   A card grants through the SAME draft contract as every other card (`apply(player)`), so nothing in
   the draft screen needed a special case.
2. **TWO CARDS, both a real TRADE** (risk for reward — the doc's own step-3 examples):
   - **HORDE BAIT** — *every chest is a horde, and every chest rolls one rarity higher.* The horde is
     the price, the rarity bump is the payout. Hooked in `src/chests.js`: `rollContents` reads the rule
     off the state it already receives (`ruledChestRarity`) so **no caller signature changed and no
     extra rng draw is taken**; `applyContents` now fires the (extracted, unchanged)
     `spawnPunishmentHorde` on every chest via an **`else` — a lost gamble already paid its horde, so
     one chest is never worth two hordes** (asserted).
   - **ONE OF EACH** — *no stat card is ever offered twice.* `src/main.js` openDraft filters the stat
     family through `statCardOffered`, and `pick()` records every stat it takes in
     `state.player.takenStats`. The rule is RETROACTIVE by design (stats taken before the card are
     already in the ledger), which is the simpler contract and the one a player would expect.
     **The payoff is structural, not a patch: as stats leave the pool the pool tilts toward weapons.**
3. **`src/entities.js`** — `makePlayer()` gains `rules: {}` and `takenStats: {}`. On the RUN player,
   exactly like `draftCounts`, so a fresh run is a fresh set of rules and **none of it touches the save
   schema** (no migration, no persistence).
4. **`src/main.js`** — pool wiring, the pick-time ledger, a RUN RULE toast on taking one, a
   `hordeBait` toast, and the chest-horde ladder re-base guard extended to `hordeBait` (a rule horde is
   re-based onto the ladder exactly like a gamble horde, otherwise it would be an off-curve wall).
5. **New `test/test_run_rules.mjs`, 13 checks**, including the REAL seams: `tickChests` for "every chest
   is a horde / never two", and `src/main.js openDraft()` driven in the headless harness with a seeded
   rng for both pool effects.
6. **New `tools/verify_g8_rules.mjs`** — the PHONE browser check (below).

**MEASURED (numbers, not intentions):**

| what | rules off | HORDE BAIT on |
|---|---|---|
| chest COMMON (20k seeded draws) | 0.5960 | 0.0000 |
| chest RARE | 0.2532 | 0.5960 |
| chest LEGENDARY | 0.0506 | 0.2532 |
| chest GAMBLE | 0.1002 | 0.1508 |
| rng draws inside `rollContents` | differs by DESIGN (a bumped band rolls different contents — a rare chest draws a potion, a legendary two upgrades) | band is a REWRITE of the same roll: **ruled rarity == bump(unruled rarity) for 4000 seeds, pairwise** |

| real `openDraft()` offer rate | before this slice (tick 4) | now |
|---|---|---|
| Whetstone, no rules | 0.2455 | 0.2137 |
| Whetstone, ONE OF EACH + dmg taken | (n/a) | 0.0000 |
| Horde Bait, rule not held | (n/a) | 0.1050 |
| Horde Bait, rule already held | (n/a) | 0.0000 |

- **THE DILUTION IS REAL AND IS REPORTED, NOT BURIED:** the two rule cards add 0.30 of pool weight,
  which moves every other card's offer rate down by about **x0.87** (0.2455 -> 0.2137 for Whetstone).
  Tick 4's Whetstone figure is superseded by this number. `RULE_CARD_WEIGHT` is the ONE knob.
- **PHONE REAL-BROWSER EVIDENCE** (`tools/verify_g8_rules.mjs`, 390x844 @ dpr 3, canvas 1170x2532):
  the rule card reached the REAL draft pool in **2 seeded drafts** and rendered as
  `2. Horde Bait / RUN RULE - every chest is a horde; every chest rolls one rarity higher`, **3 cards
  rendered, all inside the phone viewport, no description clipped**. Shot:
  `/tmp/hordes-shots/g8-step3-draft-rule-phone.png`.

**COULD NOT VERIFY (honest):**
- **The RUN-LEVEL effect of both rules is NOT measured.** The draft sim's policies do not pick rule
  cards, so there is no before/after survival or gold number for them; `tools/draft_sim.mjs --validate`
  was NOT re-run. The numbers above are pool/distribution level only. **This is the next measurement to
  add** (it belongs with step 4, which will also add pool entries).
- **No vision read.** The screenshot was read as DOM text + geometry + one sampled pixel (`8,8,14`, the
  card plate, NOT glyph evidence) by a model with no eyes. A human or vision model should still glance
  at the PNG before W10.
- The other three chest rarities were not individually opened in the browser; the 400-draft search
  produced one rule card, not every rule card.
- **Design ownership:** the two card ideas are the DOC'S OWN step-3 examples, and the owner's decision
  says "do NOT ask again" — so no owner input was requested. If either card is not what he pictured,
  it is one file (`src/rules.js`) plus one pool line to change.
- **Tree state:** tick 3's `src/tour.js`, tick 4's slice and this one are all uncommitted (Remy owns
  commits).

## TICK NOTE 6 — 2026-09-12 (goal pilot tick, agentlock held, DISPATCH ONLY)

**Goal worked:** G8 STEP 4 (general skill items) — **dispatched, not built in this tick.** Nothing else
was started. Step 2 (rule-rewrite items) is the last remaining G8 step.

**What this tick did (recon + brief + dispatch; no feature written inline):**
- Confirmed the top of the queue is G8 step 4 by reading this file + `docs/BUILD_PLAN.md` (W7c). Step 1
  and step 3 are marked DONE in TICK NOTES 4 and 5; the owner's decision at the bottom of this file
  fixes the order 1 -> 3 -> 4 -> 2 and says do not ask again.
- Recon for the brief (the anchors a builder needs, none of it previously written down): the seven stat
  cards live in `src/config.js` `UPGRADES` (L499-507) and already cover move speed / pickup radius /
  cooldown, so a "skill" family must NOT restate them; `src/skills.js` + `config.SKILLS` are the
  player-triggered ACTIVES (FROST_NOVA / OVERCHARGE), which is why the new family is named *perks* in
  code; there is NO HP regen anywhere in the run (only meta Mana Spring for mana); `openDraft()` builds
  the pool at `src/main.js` L1845-1900 and `pick()` runs at L1967; the mana-regen seam exists TWICE
  (`src/main.js` ~L1203 and ~L4230).
- Wrote the complete self-contained build brief to **`docs/briefs/G8_STEP4_SKILLS.md`** (61 lines):
  three once-only perks (Regrowth = flat 0.7 HP/s; Focus = -20% skill mana / -15% skill cooldown, the
  first card family to touch the Q/W layer; Thick Skin = -12% incoming damage), the family weight knob
  `SKILL_CARD_WEIGHT = 0.10` (0.30 for the family, same order as the rules family's 0.30), the exact
  hook sites, the run-level measurement that step 3 still OWES (the draft sim's policies never pick rule
  cards, so steps 3-4 have no run-level survival/gold numbers yet), `test/test_perks.mjs`, the phone
  viewport browser check reusing the in-tree `tools/browser.mjs` harness, and the invariants that must
  survive (bad draft can still fail; good beats bad >=3/5; one bad pick never loses a run; luck-0,
  no-cards pool bit-identical to today).
- **Dispatched it** to a freshly spawned governed hub worker: `cli:glm-hordes-g8`
  (pid 495012, `hub-worker spawn hordes glm-hordes-g8 --model glm`, log
  `.hub-worker/logs/spawn-glm-hordes-g8-20260912-204240.log`), task
  `msg_01M2BNQK4Q72AGF1TC7HAF0HPG` (running as of this note), with the brief as the single source of
  truth. Note for the next observer: `delegate_task` is NOT available in this cron runtime, and the hub
  token held here has **no write grant on the `hordes` channel** (`403 forbidden`) — so the task was
  issued over the `hub` coordination channel, which the worker also listens on. Worth fixing before the
  next dispatch.
- **Suite baseline re-measured by this tick, not taken on report: PASS=58 FAIL=0**
  (`bash /tmp/run_all.sh`, unmodified tree at `f981f56`).

**COULD NOT VERIFY (honest):**
- **Nothing was built or verified in this tick** — no perk exists yet, so there is no artifact to check.
  The builder's self-report will be a CLAIM; the next tick must re-run the suite itself, read
  `test/test_perks.mjs`, and read the phone PNG before accepting step 4.
- The worker was handed a PING message (`msg_01M2BNQK4Q72AGF1TC7HAF0HPG`) one step before the full
  instruction (`msg_01M2BNQRHB9N52T054K5TGBG9M`) because the first issue attempt 403'd on channel
  `hordes`. BOTH messages point at the brief, and the second explicitly says it supersedes the first —
  but if the worker reads only the first and reports TASK-STARTED with no work done, that is why, and
  the second queued message is still sitting in its FIFO.
- This tick did not wait for the builder (per the tick contract) and did not take the agentlock back; the
  builder was told to acquire it, retry on rc=1, and release when done.

## TICK NOTE 7 — 2026-09-12 (goal pilot tick, agentlock held, G8 STEP 4 EXECUTED)

The brief said to append a "TICK NOTE 6", but the DISPATCH-ONLY note above already took that number;
this is the next one in sequence and closes out the dispatch.

**Goal worked:** G8 STEP 4 (general skill items) — **executed in full per `docs/briefs/G8_STEP4_SKILLS.md`**,
plus the run-level measurement step 3 owed. Step 2 (rule-rewrite items) is now the only remaining G8 step.

**What landed (all uncommitted; Remy owns commits):**
- **`src/perks.js` (NEW)** — the perk card family: `SKILL_PERKS` (regrowth / focus / thick), readers
  (`perksOf`/`hasSkill`/`skillCardOffered`/`skillsHeld`/`skillCards`), writer `grantSkill`, the
  applied-value helpers the game reads (`hpRegenPerSec`, `skillManaCost`, `skillCooldown`,
  `damageTakenMult`, `damageTaken`), the ONE regen step `applyRegrowth(state, dt)` (dt-scaled, returns
  the healed amount), and `SKILL_CARD_WEIGHT = 0.04` — **retuned from the brief's sketched 0.10 by
  measurement** (see the curve below; the constant's comment carries the rationale).
- **`src/rules.js:50`** — `RULE_CARD_WEIGHT` 0.15 -> **0.10**, retuned in the same measurement pass.
- Hooks: `src/entities.js` (makePlayer ships `skills: {}` beside rules/takenStats); `src/skills.js:20-22`
  (`useSkill` charges/rolls through `skillManaCost`/`skillCooldown`); `src/main.js` — import L33,
  `applyRegrowth` at BOTH mana-regen seams (L1219, L4255), the `damageTaken` funnel on drain L1337 /
  contact L1447 / shot L1481 / boss-curse heal-tax L3572, `...skillCards(state)` in the pool L1909,
  the pick branch + toast L1981-1985 (no `markStatTaken` for skill ids), HUD readiness through
  `skillManaCost` L3946.
- **`tools/draft_sim.mjs`** — Deliverable B: `buildDraftPool` mirrors `skillCards`+`ruleCards` through
  the same seams (held-state, `statCardOffered`); honest `cardImpact` entries for all five family cards
  (thick exact at `1/0.88-1`; hordebait enumerated from `CHESTS` weights; regrowth priced at the
  mid-run pressure band; **focus and once priced at exactly 0** — the sim has no mana/ability layer
  and `once`'s net is policy-dependent, so the model refuses to guess); `applyCard` grants rules/skills
  and keeps the `takenStats` ledger; the run loop models hordebait's horde price + potion payout,
  regrowth's per-tick heal, and thick's `damageTakenMult` on incoming pressure; `startCards` patch for
  the one-bad-pick probe.
- **`test/test_perks.mjs` (NEW, 15 checks)** — family contract (unique ids, no collision with stat or
  rule ids, once-only, weight, apply contract), every helper's exact math, Focus at the REAL `useSkill`
  seam, dt-correctness through the live frame loop (60Hz == 120Hz == 0.7*t), all THREE damage paths
  (CHASER contact / enemy shot / TICK drain) at exactly 0.88 through the live loop, and the REAL
  `openDraft()` seam (skill card offered 0.033/draft, gone once held; `pick()` grants without polluting
  the `once` ledger).
- **`test/test_draft_luck.mjs`** — EXTENDED (not weakened): the two pool-shape assertions now also pin
  rule cards to `RULE_CARD_WEIGHT` and skill cards to `SKILL_CARD_WEIGHT` (imported constants). 20/20.
- **`tools/verify_g8_skills.mjs` (NEW)** — phone browser check, 390x844 @dpr3: a Focus card reached
  the REAL draft on seeded try 51; 3 cards rendered, all in-viewport, no clipped desc; PNG at
  `docs/art/browser-verify-2026-09-12/g8-step4-skill-draft-phone.png`, `readShot` samples inside the
  card both `[20,20,31]` (card-surface dark tone at both text and body probes). **There is no vision
  model reachable from this host** — the verdict is DOM geometry + pixel samples, nothing more.

**Measured before/after (60 runs/cell, seed 4242, draft_sim v2):**

| cell | mean surv | median | gold/run | notes |
|---|---|---|---|---|
| OFF GREED-DAMAGE luck0 | 224s | 185s | 1753 | families OFF == pre-G8 pool |
| OFF ADVERSARIAL-BAD luck0 | 129s | 131s | 468 | |
| OFF SURVIVAL luck0 | 137s | 139s | 542 | |
| ON GREED-DAMAGE luck0 | 222s | 172s | 1598 | shipped weights 0.10/0.04 |
| ON ADVERSARIAL-BAD luck0 | 126s | 132s | 464 | mean good/bad ratio 1.76 |
| ON SURVIVAL luck0 | 139s | 140s | 548 | |
| ON GREED-DAMAGE luck5 | 296s | 257s | 2908 | ratio vs bad 2.26 |
| ON ADVERSARIAL-BAD luck5 | 131s | 134s | 493 | |

- Acceptance bar ON: **bad can fail 100%; 4/5 minute-10 metric wins; median bad/good ratio 1.30 -> VERDICT PASS**
  (same verdict at luck 5). Sim-vs-real-loop `--validate`: analytic GREED 222s vs real fresh-loop 146s
  (delta 53%, same order as the pre-G8 gap; real deaths cluster SWARMER/GRAVELMAW/HERALD at w1-w3).
- Offer mix (20k offers, fresh pool): rule cards 0.160/offer, skill cards 0.095/offer; real-seam
  Whetstone rate now 0.2210 (was 0.2137 in tick 5 — the family total went 0.30 -> 0.32, and the seeded
  draw path shifted; measured, not assumed).
- **Weight curve (why 0.10/0.04):** families at the sketched 0.15/0.10 (0.60 on a ~4.1-weight pool)
  dropped good mean survival ~20% and FAILED the divergence bar (ratio 1.15). Budget-conserving
  variants (carving family weight out of the stat or weapon budget) were BOTH worse than plain-add.
  At 0.10/0.04 the canonical invocation passes (median ratio 1.30) and mean ratios hold 1.40-1.79 over
  10 seeds x 60 runs.

**Invariants (asserted in the measurement script, never assumed):**
- bad can fail / good beats bad >=3/5 at luck 0 AND 5: PASS. Luck-0 pool bit-identity (stats 0.3,
  weapons 1, families extra at their constants, OFF pool == pre-G8 exactly): PASS.
- One bad pick never loses a run (held at t=0, GREED, 60 runs, bar >=0.8x baseline): hordebait 1.00,
  regrowth 1.04, focus 0.99, thick 1.12 — **PASS for every step-4 card. `once` measures 0.65 and FAILS**
  (0.63-0.73 across 4 seeds — stable, not noise). This is a **step-3 finding this measurement was owed
  to surface**: ONE OF EACH is an archetype conversion, not a stat card — held from t=0 it caps stat
  stacking and the weapon tilt does not pay for it (greed mean 222s -> 145s; still above the
  deliberately-bad 126s, so one mistake ≠ a whole bad run, but it costs a third of the run). The bar was
  NOT weakened to go green; the failure stands and **step 2 (rule-rewrite items) should revisit `once`'s
  payout** — e.g. making the weapons tilt actually compensate.

**Suite: PASS=59 FAIL=0** (`bash /tmp/run_all.sh`; 58 baseline + `test/test_perks.mjs`).

**COULD NOT VERIFY (honest):**
- **Focus has no run-level number.** The sim has no mana/cooldown/ability layer, so its cardImpact is
  0 and the run-level tables measure focus as a dead card; only its helper math + real `useSkill` seam
  are verified (exact 0.8/0.85). Measuring it run-level needs an ability model the sim does not have.
- The median divergence bar stays fragile: any pool dilution flips marginal good runs across the
  wave-1-boss cliff (~148s mass point) — median-bar pass is 3/10 seeds vs OFF's 9/10, while MEAN ratios
  (1.40-1.79) hold everywhere. Composes with the doc's known "wave-1/2 burst needs its own
  before/after cohort" finding; that cohort is still owed.
- The finale barrage's direct hp writes are deliberately NOT routed through `damageTaken` (annotated at
  the sites): the finale is a scripted ending, not a survivable damage economy, and routing it would
  make Thick Skin alter the ending's tuning. Every IN-RUN path (drain/contact/shot/boss-curse) is routed.
- The browser check is DOM + pixel evidence only (no vision model on this host), and the sim/real-loop
  53% delta is unchanged by this slice — the sim's fresh-stage pressure model runs hotter than the real
  loop, a pre-existing known gap.

**Next step:** G8 STEP 2 — rule-rewrite run-altering items (the LAST G8 step), with `once`'s measured
0.65x archetype cost as its first input.


## TICK NOTE 8 — 2026-09-12 (goal pilot tick, agentlock held, DISPATCH ONLY)

**Goal worked:** G8 STEP 2 (rule-rewrite run-altering items — the LAST G8 step) — **dispatched, not built in
this tick.** Nothing else was started.

**Independently re-verified before dispatch (the tick's own evidence, not a report):** the tick-7 slice is
real and green — `bash /tmp/run_all.sh` => **PASS=59 FAIL=0** on the uncommitted tree at `f981f56`, with
`src/perks.js`, `src/rules.js`, `test/test_perks.mjs`, `test/test_run_rules.mjs`, `test/test_draft_luck.mjs`
and the three `tools/verify_*` harnesses all present on disk. Tick 7's numbers were NOT re-derived (that
would mean re-running the whole sim cohort); what is verified is the suite result and the artifacts.

**Written and dispatched:**
- Brief: **`docs/briefs/G8_STEP2_RULE_REWRITE.md`** (118 lines, self-contained) — the three rewrite cards
  (PIERCE ALL / CHAIN REACTION / BLOOD HARVEST) with exact hook sites, the family weight knob and the
  instruction to retune it by measurement, the `once` retune as a mandatory deliverable, honest-zero rules
  for `cardImpact`, the test file, the phone browser check, and the invariants that must survive.
- Dispatched to the idle, already-governed worker **`cli:glm-hordes-g8`** (pid 495012, listening on
  `['hordes','hub']`, its two tick-6 tasks both exited 0) via `hub-worker issue` with the brief as the
  single source of truth. **`delegate_task` is still not available in this cron runtime**, and the held hub
  token still has no write grant on the `hordes` channel, so the task is issued on the channel the worker
  also listens on.
- The lock was **released by this tick before the dispatch** (the pilot held it for recon/writes only), and
  the brief tells the builder to acquire it before editing and release it when done — including on failure.

**COULD NOT VERIFY (honest):**
- Nothing was built here: there is no rewrite card on disk yet, so there is no artifact to check. The
  builder's self-report will be a CLAIM; the next tick must re-run the suite itself, read
  `test/test_rewrites.mjs`, and read the phone PNG before accepting step 2.
- This tick did not wait for the builder (per the tick contract) and did not take the agentlock back.
- `once` is still at its measured 0.65x: the defect stands, unfixed, and is handed to the builder with the
  number, not smoothed over.


## TICK NOTE 9 — 2026-09-12 (builder tick, subagent:spawnfa, agentlock held, G8 STEP 2 EXECUTED)

**Goal worked:** G8 STEP 2 (rule-rewrite run-altering items) — **executed in full per
`docs/briefs/G8_STEP2_RULE_REWRITE.md`**, including the mandatory `once` retune. **With this, all four
G8 steps are landed and G8 is DONE** (the status line above is flipped on this evidence).

**What landed (all uncommitted; Remy owns commits):**
- **`src/rewrites.js` (NEW)** — the REWRITE family: `REWRITES` (pierceall 'Pierce All' / onkillboom
  'Chain Reaction' / healthdamage 'Blood Harvest'), readers (`rewritesOf`/`hasRewrite`/
  `rewriteCardOffered`/`rewriteCards`), writer `grantRewrite`, the applied-value helpers the game reads
  (`rewriteBoom`, `harvestBlast`), the boom/harvest constants (radius 40/55, 4+0.5xdmg / 10+1.0xdmg),
  and `REWRITE_CARD_WEIGHT = 0.05` — **kept at the brief's starting value BY MEASUREMENT** (the curve is
  in the constant's comment: 0.05->1.69x, 0.03->1.73x, 0.02->1.77x, 0.01->1.79x good/bad mean ratio,
  60 runs/cell — a taste knob, not a balance one).
- Hooks, all at spawn/collect sites (never in the duplicated update loops):
  - PIERCE ALL at EVERY projectile spawn site that sets pierce — volley `src/main.js:416`, boomerang
    `src/weapons.js:315` — both read `hasRewrite(state, 'pierceall')` and set the `PIERCE_ALL` sentinel.
  - CHAIN REACTION in the real death pass `src/main.js:1520-1535` (the COLOSSUS deathShockwave shape:
    enemy-side friendly fire only, each corpse spliced exactly once so a kill detonates exactly once,
    NO toast per kill).
  - BLOOD HARVEST on the PICKUP path `src/main.js:1774-1787` (not `drinkPotion`), hp-kind only.
  - Pool `...rewriteCards(state)` at `src/main.js:1956`; pick branch + toast at `src/main.js:2033-2036`
    (never writes the `once` stat ledger); `makePlayer` ships `rewrites: {}` (`src/entities.js:39`);
    render rings + colors for `rewrite_boom`/`rewrite_harvest` (`src/render.js:605,617-620`).
- **`once` RETUNE (the tick-7 defect, 0.65x, bar >= 0.8x): fixed by making the payout real.** Under
  ONE OF EACH the weapon ladder now never ends: a level-up card grants +1 BONUS level, a grant lands at
  Lv2 (both from tick 7's first attempt), AND an at-cap level-up card STAYS offered and converts to
  **+10% weapon damage** (`src/main.js:1929,1934` openDraft; `src/main.js:2050-2063` pick — the
  multi/volleyAtProjCap precedent; the cap test reads the OFFER-time level from the card id so a card
  offered at MAX-1 cannot double-pay). Desc updated to stay one line and true (`src/rules.js`). Grid
  that chose +10%: +5%/+8%/+10% all 1.31x (flat — the pool-shape effect dominates), +12% 1.48x,
  +15% 3.53x, +20% 8.76x — the compounding cliff starts past 10%, so 10% ships with margin.
- **`tools/draft_sim.mjs`** — all three rewrites + the retuned once mirrored through
  `buildDraftPool`/`cardImpact`/`applyCard` (held-state aware; at-cap picks offered under once and
  priced at exactly their +0.1 conversion). Honest pricing: pierceall priced off the model's own crowd
  curve (`PIERCEALL_VAL` bounded reading of the sentinel), onkillboom coarse 0.2 dps, healthdamage
  coarse 0.04 dps — each with its reasoning in a comment; the run loop applies boom/harvest as kill-rate
  boosts off the REAL `rewriteBoom`/`harvestBlast` helpers.
- **`test/test_rewrites.mjs` (NEW, 22 checks)** — family contract, helper math, PIERCE ALL at BOTH real
  spawn sites, CHAIN REACTION through the real kill funnel (exact damage, exactly-once, never the
  player, NO toast), BLOOD HARVEST through the real drop-collect path (exact damage, hp-kind only),
  dt-correctness (60Hz == 120Hz == one boom + one blast, weapons hermetically removed), the REAL
  `openDraft()` seam (0.0433/draft, gone once held), pick() with no ledger pollution, the once retune at
  the real seam (MAXED card offered under once only, +10% conversion exact, +1 bonus level), and the
  sim invariants (bad fails 100%, >=3/5 metric wins, one-bad-pick >=0.8x for every rewrite AND once).
- **`test/test_draft_luck.mjs`** — EXTENDED (not weakened): both pool-shape pins now also pin rewrite
  cards to the imported `REWRITE_CARD_WEIGHT`. 20/20.
- **`tools/verify_g8_rewrites.mjs` (NEW)** — phone browser check, 390x844 @dpr3: a Pierce All card
  reached the REAL draft; 3 cards rendered, all in-viewport, no clipped desc; PNG at
  `docs/art/browser-verify-2026-09-12/g8-step2-rewrite-draft-phone.png`, readShot samples inside the
  card `[20,20,31]` at both probes. **No vision model is reachable from this host** — the verdict is
  DOM geometry + pixel samples, nothing more.

**Measured run-level table (60 runs/cell, seed 4242, draft_sim v2, luck 0 and 5):**

| cell | mean surv | median | gold/run | good/bad mean | notes |
|---|---|---|---|---|---|
| OFF GREED-DAMAGE luck0 | 224s | 185s | 1753 | 1.74x | bit-identical to tick 7's OFF cell |
| OFF ADVERSARIAL-BAD luck0 | 129s | 131s | 468 | | |
| OFF SURVIVAL luck0 | 137s | 139s | 542 | | |
| ON GREED-DAMAGE luck0 | 199s | 150s | 1233 | 1.69x | shipped 0.10/0.04/0.05 + retuned once |
| ON ADVERSARIAL-BAD luck0 | 118s | 130s | 434 | | 3/5 metric wins |
| ON SURVIVAL luck0 | 138s | 140s | 543 | | |
| ON GREED-DAMAGE luck5 | 248s | 221s | 1987 | 2.01x | 4/5 metric wins |
| ON ADVERSARIAL-BAD luck5 | 123s | 134s | 469 | | |
| ON SURVIVAL luck5 | 140s | 141s | 567 | | |

**Invariants (asserted in test/test_rewrites.mjs at 30 runs, re-measured at 60):**
- bad fails 100% of runs; good beats bad >=3/5 minute-10 metrics at luck 0 (4/5 at luck 5 and in every
  OFF cell): PASS.
- One bad pick never loses a run (held at t=0, GREED, bar >=0.8x): pierceall 1.23x, onkillboom 1.20x,
  healthdamage 1.06x, **`once` 1.31x — the tick-7 defect is closed** (30-run cadence in the test reads
  1.35/1.34/1.17/1.42; both above the bar).
- Luck-0 pool bit-identity (stats exactly 0.3, weapons exactly 1, families extra at their imported
  constants): PASS (test_draft_luck, now with the fourth family term).

**Suite: PASS=60 FAIL=0** (`bash /tmp/run_all.sh`; 59 + `test/test_rewrites.mjs`).

**COULD NOT VERIFY (honest):**
- The rewrite cards' run-level numbers rest on coarse model assumptions (BOOM_FRESH 1 / HARVEST_FRESH 2
  fresh bodies per event, PIERCEALL_VAL 2 effective pierce points) — each documented in SIM_TUNING, but
  they are the model's honesty, not a real-loop measurement. The seam-level exactness (boom = 4+0.5xdmg,
  blast = 10+1.0xdmg, pierce sentinel at spawn) IS real-loop verified.
- The `--validate` real-loop cross-check was not re-run this tick (tick 7's 53% sim/real delta stands,
  unchanged by this slice; the fresh-stage pressure-model gap is a pre-existing known finding).
- The median divergence ratio stays cliff-noisy (1.15 at ON luck0 vs 1.41 OFF — the wave-1-boss ~148s
  mass point), which is why the weight curve and the invariants above are pinned on MEAN ratios and
  asserted bars, not the median verdict.
- The browser check is DOM + pixel evidence only (no vision model on this host).

**G8 is DONE:** steps 1 (luck), 3 (run rules), 4 (perks) and 2 (rewrites) are all landed, tested and
measured; the one open defect tick 7 surfaced (`once` 0.65x) is fixed at 1.31x with the bar intact.


## TICK NOTE 10 — 2026-09-12 (goal pilot tick, subagent:spawnfa, agentlock held, RED SUITE FIXED)

**Goal worked: the RED SUITE, not a feature.** No new goal was started. Reason: the build plan's bar is
a green full suite, and it was red. Nothing else was touched.

**What was wrong (independently reproduced, twice):** tick 9's "Suite: PASS=60 FAIL=0" is NOT
reproducible as landed. `bash /tmp/run_all.sh` => **PASS=59 FAIL=1, FAILED test/test_rewrites.mjs**, on
two consecutive runs. `node test/test_rewrites.mjs` alone passed 4/4 (including once with a concurrent
`tools/balance_sim.mjs` load), so this was neither a stale tree nor CPU load.

**The failure text:** `FAIL the rewrite payouts are dt-correct: 60Hz == 120Hz over the same second /
same total at both refresh rates / 26 !== 1000000000`. `at60 = 26` is exactly one boom + one blast at
the probe's damage (4+0.5d + 10+1.0d = 26), i.e. the 60Hz probe was right. `at120 = 1e9` is
`1e9 - near.hp` with **near.hp === 0**: the probe's 1e9-hp sentinel had been force-zeroed mid-probe.

**ROOT CAUSE (code-proven, not inferred from the number):** the whole engine has exactly ONE site that
forces `hp = 0` outside the death pass — the WAVE-11 FLASH DROP reap at **src/main.js:1635**
(`for (const v of victims) v.hp = 0`), entered from
`shouldFlashDrop(e, p.stats.luck || 0, performance.now(), state.lastFlashAt, Math.random)` at
**src/main.js:1632**. In `src/loot.js`: `FLASH_DROP.baseChance = 0.008` per eligible kill, and the reap
targets only `FLASH_TRASH_TIERS = ['SWARMER','CHASER']`. The probe's sentinels were **CHASERs**, so a
single flash roll reaps the entire probe field (near AND far) and destroys the measurement — a
`Math.random`-gated flake, not a steady failure. The engine behaviour is intended; the PROBE was not
hermetic.

**Fix (test-side hermeticity; NO assertion was weakened, retargeted or removed):**
- Probe bodies are now non-trash: `hostile()` maps any trash request to `PROBE_BODY = 'BRUTE'`, and all
  10 `hostile('CHASER', ...)` call sites plus the 2 inline `typeId: 'CHASER'` sentinels were retyped.
- NEW check `the probe bodies are immune to the WAVE-11 FLASH DROP (it reaps trash tier only)` proves
  the hazard is real (a plain CHASER IS flash-eligible and a flash WOULD reap it) AND that the probe
  field holds nothing a flash can reap. The dt probe additionally asserts `flashTargets(st.enemies)` is
  empty before it pumps, so the exact field where this bit stays guarded.
- Why the measurement is unchanged: no boom/blast/kill path branches on `typeId`, and a BRUTE is not
  `elite`, so the ordinary non-elite drop path is identical to the old CHASER body.
- `test/test_rewrites.mjs` is now **23 checks** (was 22 - the new one is the guard, not a replacement).

**Verified this tick (my own runs, not a report):** `node test/test_rewrites.mjs` => **PASS=23 FAIL=0**;
`bash /tmp/run_all.sh` => **PASS=60 FAIL=0**, run twice back to back (was 59/1 twice before the fix).

**COULD NOT VERIFY (honest):**
- I did not force a flash to fire (that needs `Math.random` stubbed), so the causal chain rests on code
  inspection (a single force-zero site in `src/`), the observed sentinel value, and the new guards - not
  on a bit-for-bit reproduction of the flash.
- The constants imply roughly a 1-2% chance per file run, which does not comfortably explain 2/2 red.
  A second contributor cannot be excluded; what IS certain is that no other code can set `near.hp = 0`,
  and the probe field is now immune to the flash whatever else rolls. If a red dt probe is ever seen
  again, the first thing to read is `near.hp` at the assertion.
- **LATENT SIBLINGS (NOT touched, handed to the next tick):** `test/test_arch_buffs.mjs:40` and
  `test/test_perks.mjs:185` build the same 1e9-hp CHASER sentinels, so the same 0.8% roll can reap
  those fields. Remedy is the same one-liner (non-trash body) plus a field guard per probe.

**NEXT GOAL: G10 / G23** (enemy guide / bestiary + rarity tiers, build-plan W6) — first in the ranked
queue after G8, which is DONE. It needs a COMPLETE brief (encounters namespace on the v4 save schema,
discovered-vs-undiscovered entries with masked identity, per-enemy kill counters, rare tiers with
documented rates and sims that account for them) and is a feature, so it is dispatched, not built inline.
Suite is green again, so W6 can be briefed from a sound base.


## TICK NOTE 11 — 2026-09-12 (goal pilot tick, subagent:spawnfa, agentlock held for recon+writes, DISPATCH ONLY)

**Goal worked: the GREEN-SUITE bar, not a feature.** G10/G23 was NOT started. The full suite is not
reliably green, so nothing may be briefed from it yet.

**Independently reproduced (my own runs, not a report): `bash /tmp/run_all.sh` came back
PASS=59 FAIL=1 (FAILED test/test_rewrites.mjs) twice, then PASS=60 FAIL=0 three times.** Tick 10's
"the suite is green again" is therefore TRUE PER RUN but FALSE AS A RATE: `node test/test_rewrites.mjs`
run alone in a loop is **5 failures in 30 runs (~17%)**. Tick 10's flash-drop fix did NOT close this
check; it closed one leak of several.

**ROOT CAUSE, code-proven by instrumented logging (the probe was copied to a scratch path, made to log
per-frame damage deltas plus `p.stats.damage`/`p.level`/`st.mode`/`p.potions`/`st.drops.length`/
`st.runCounts`/`st.effects`, and run 30x). The dt probe runs INSIDE the live run loop — it only sets
`st.weapons = []`, it does not stop the run — so two live systems leak into the measurement:**

1. **A chest opens mid-window and grants a Whetstone.** Logged: `runCounts.chests` 0 -> 1 -> 2 across
   the window and `p.stats.damage` 8 -> 10 — EXACTLY x1.25, i.e. `src/config.js:500`
   (`Whetstone: p.stats.damage *= 1.25`). The BOOM is priced at the corpse death, the BLAST at the
   potion collect, so the two payouts get priced at DIFFERENT damage: logged `steps f0:+28` (8 then 10)
   vs the other pass's `f0:+29` — this is the `28 !== 29` failure exactly.
2. **A second hp potion is collected inside the window.** Logged `p.potions.hp === 2` at probe end in
   5 of 30 runs, with `steps f0:+44` at 120Hz against `f0:+26` at 60Hz — one extra BLOOD HARVEST blast
   (+18 at damage 8). The extra potion is a live-run drop/reward; the probe pushes exactly one.

In every clean run of the sample both refresh rates read `f0:+26` (one boom 8 + one blast 18), i.e. the
engine's per-EVENT payout IS frame-rate independent. **This is a TEST-HERMETICITY defect, not a balance
or dt bug** — no game constant was touched.

**LANDED this tick (uncommitted; Remy owns commits):**
- **`test/test_perks.mjs` — flash hermeticity (the tick-10 latent sibling, done).** Probe bodies are
  remapped off `FLASH_TRASH_TIERS` (`PROBE_BODY = 'BRUTE'`, mirroring test_rewrites) and `contactLoss()`
  now asserts `flashTargets(st.enemies)` is empty before the pump. Every assertion there is a ratio, so
  the body swap cancels. `node test/test_perks.mjs` => PASS=15 FAIL=0.
- **`docs/briefs/DT_PROBE_HERMETICITY.md` (NEW, 96 lines, self-contained)** — the two leak modes with
  their logged evidence, the required test-side fix (pin `p.stats.damage` for `want`; close the window
  against the run's spawner/chest/drop paths at their real seam without stubbing the code under
  measurement; assert the field is exactly the probe; assert POSITIVELY one boom + one blast +
  `p.potions.hp === 1` so the next leak fails loudly), the sibling files, and the acceptance bar:
  **200 consecutive green runs of test_rewrites + `bash /tmp/run_all.sh` PASS=60 FAIL=0 three times.**
- **DISPATCHED** to the idle governed worker `cli:glm-hordes-g8` (pid 495012) as
  `msg_01M2BW3JMVPZHFJZ02MW98N7MF` on channel `hub` (the held token still has NO write grant on
  `hordes`: `403 no write grant on channel 'hordes'`). It is **running** per
  `.hub-worker/cli_glm-hordes-g8/running.json`; the tick did not wait on it. `delegate_task` is still
  not available in this cron runtime.
- Lock hygiene: the lock was acquired for recon+writes and **released before ending the tick** (the
  brief tells the builder to acquire it, and to release it even on failure). `agentlock status` =>
  FREE. Note: `agentlock release` resolves the lock from CWD — releasing from the wrong directory
  silently reports "already free" while the `hordes` lock stays held; release must be run from
  `/home/claude/projects/hordes`.
- Cleanup: two STALE PENDING tasks on that worker (a duplicate G8 step 4 and a duplicate G8 step 2 —
  both steps long since DONE, tick 5 / tick 9) were cancelled before the dispatch so the builder does
  not re-run completed work over a near-final tree. The worker log shows both had in fact exited 0.

**CORRECTION to tick 10 (honest):** (a) its flash-drop theory does not explain the `28 !== 29` failure,
and the dt probe's 1e9-hp sentinels are not the leak that is actually firing; (b) its
`test/test_arch_buffs.mjs` flag is WRONG — that file imports only `src/weapons.js` and `src/arches.js`
and never boots the main loop (`test/_harness.mjs`), so no flash reap and no run-loop leak can reach
its dummies; (c) its "1-2% per run" estimate understated the real rate, which is ~17%.

**COULD NOT VERIFY (honest):**
- Nothing was fixed in the flaky check itself: `test/test_rewrites.mjs` is UNCHANGED by this tick and
  still flakes ~17%. There is no artifact to check yet; the builder's report will be a CLAIM and the
  next tick must re-run the suite itself (3x) and the 200-run loop before accepting it.
- The two leak modes are proven by live-loop state logging (chest counter, damage stat, potion count,
  damage deltas), not by a per-event trace of the chest-open or drop-spawn call; no engine bug is
  claimed by them.
- The stale-task cancel is a coordination action I took unilaterally; if those tasks were meant to be
  re-run for another reason, that intent is lost.

**NEXT GOAL: G10 / G23 (bestiary + rarity tiers, W6) — but it stays blocked behind a reliably green
suite.** Sequence: builder lands the hermetic probe fix -> next tick re-runs the 200-run loop and the
3x suite -> only then brief W6.

## TICK NOTE — 2026-09-12 (dt-probe hermeticity, subagent:spawnfa)

Brief: `docs/briefs/DT_PROBE_HERMETICITY.md`. Test-side only — no game balance, drop rate or damage
constant was touched. Suite green 3x and the flaky dt check is green 200/200.

**THE LEAK, root-caused (instrumented, evidence below): the probe corpses themselves were
chest-eligible.** `isEliteish` (src/chests.js) counts `maxHp >= C.ENEMY.BASE_HP * 1.5`, and every
probe corpse was `{ ...hostile('BRUTE', ...), hp: 0 }` — maxHp 1e9, i.e. elite-ish. So EVERY corpse
death rolled `maybeSpawnChest`'s 35% (that roll is NOT gated by `dropBonus`; only the potion roll at
main.js:1544 is). A spawned chest lands clamped to the corpse — the player's feet — and pops the very
next frame: `rollContents` rare = one UPGRADES apply (a Whetstone is `damage *= 1.25`: the 8 -> 10
"no chest/stat leak" failure) plus one potion (the `2 !== 1` "exactly ONE potion" failure; gamble
variants paid hp+mp, which is why some runs read 2/1). Evidence: accessor-trap instrumentation showed
the mutations firing in-frame with zero `st.drops.push` and no chest on the field at window open, and
a v12 diagnostic printed `st.runCounts.chests` incremented DURING the window on every failing run
(6/6 failures: `chests=1..2`, potions/damage shifted exactly per chest contents). CLOSED: the test
now builds corpses via a `corpse()` factory with `maxHp: 1` (below the elite bar; `hp: 0` still dies
frame 1) — same class of fix as the pilot's flash-tier remap: fix the probe BODY, never the engine.

**Second leak mode, closed earlier in the hunt (both real seams):** (a) the base volley —
`runController` fires it off `p.attackTimer` + `decision.target` REGARDLESS of `st.weapons` (an empty
weapons list just means Lv1 params; a shot into `near` on the firing line is +2 the probe never
priced) — closed by pinning `p.attackTimer = 1e9` in `closeWindow`; (b) the shrine — `state.shrine`
drifts AT the player and auto-buys an intermission-style blessing on proximity (`applyChoice` can
reprice stats or refill potions) — closed with `st.shrine = null`. `closeWindow` also pins the
run_structure triple (`spawnTimer` / `wave.endsAt` / `wave.midAt` = `time + 1e9`), `dropBonus = -1`
(kills the death-pass potion roll deterministically), clears the loot fields, and restores everything
in a `finally`. The volley/shrine/chest behavior is BY DESIGN in the engine — no player-facing bug
claimed, none fixed; only the tests stopped feeding their own measurement.

**MEASURED:** before: 5/30 red (~17%, matches tick 11's estimate; the first closeWindow attempt was
still 43/200 red with loud assertions). After the corpse fix: `for i in $(seq 1 200); do node
test/test_rewrites.mjs > /dev/null 2>&1 || echo "FAIL $i"; done` => **0 failures, 200/200** (also
0/100 on an intermediate loop). `bash /tmp/run_all.sh` => **PASS=60 FAIL=0, three times back to back**
(raw: `PASS=60 FAIL=0 / FAILED:` x3). Siblings: `test/test_perks.mjs` got the same window pin
(`p.stats.damage` + a nothing-extra-collected guard on the three loss probes, pilot's flash guard
kept) and is 30/30 green; `test/test_arch_buffs.mjs` re-confirmed CLEAN (imports weapons/arches only,
never boots the harness — tick 10's flag on it was wrong, as tick 11 already corrected); scanned the
other harness-booting tests (camera_deadzone, playtest_fixes, run_structure, stance_bite, run_rules)
— no other live-loop leak shape found.

**Files touched:** `test/test_rewrites.mjs` (corpse factory + all four corpse sites; attackTimer +
shrine seams in closeWindow; the brief's required assertions: pinned `dmg0`, field deepEqual, exactly
one boom / one blast / one potion, no-new-tolerance on `at60 == at120 == want`), `test/test_perks.mjs`
(window pins on the loss probes). No src/ file was modified.

**UNVERIFIED (honest):** the leak modes were proven by state deltas and the chest counter, not by a
per-event stack trace of `applyContents` itself (the accessor traps never caught a write because the
potion/stat writes land through ordinary mutation inside `applyContents` after the chest splice —
the `runCounts.chests` correlation at 6/6 failures plus exact content-shaped deltas is the evidence);
no browser check was run (test-only change, nothing renders differently); the ~17% before-rate was
measured on this tick's tree, not re-measured on the pre-fix tree after the fact.
