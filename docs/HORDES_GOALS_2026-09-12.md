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

## G1 — SHIP THE CURRENT BUILD  [status: open]
The published site is ~5 waves stale (still pre-wave-23). Testers are playing a game that does not
have the tour, the legibility fixes, the resolution setting, the desktop pads, the bug fixes or the
design pass. Nothing else on this list matters to a player if this does not ship.
**Reached when:** Pages serves the current build, verified by fetching the live files and confirming a
build marker is present (not merely that a push succeeded), and the served tree is code-only.

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

### G9 — ACHIEVEMENTS AS THE UNLOCK SPINE + TROPHY GALLERY  [status: not started]
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

### FOUNDATION PREREQUISITE — SAVE SCHEMA BEFORE PERSISTED CONTENT (do this first)
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

## Loop mechanics

- Write every brief to a file; give each agent strict file ownership and a single writer per file.
- After every wave: run the full suite myself, spot-check the claims against the code, and commit with
  an honest message. Agent self-reports are not evidence.
- Verify anything that claims to be "verified" — a previous wave's verifier caught a regression that
  would otherwise have shipped (the desktop chrome rendering over the intro movie).
- Publish (G1) whenever the correctness goals hold; do not wait for G6.
- Record what each wave actually did here or in a wave note, including what did NOT work.
