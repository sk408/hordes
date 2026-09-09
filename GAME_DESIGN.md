# HORDES — auto-playing pixel-art horde survival

_Auto-playing VS-style survivor. The player does not move or aim — they watch
and choose. The build IS the game._

## Core identity (Sk408, 2026-09-08)

- Pixel-art Vampire Survivors-style game that **auto-plays itself**.
- The player's only agency is the **build**: upgrade/weapon choices during the
  run. Everything else — movement, aiming, attacking — is automatic.
- "If the game plays itself, the build choices ARE the game." A run with no
  decisions is a screensaver — decision density is everything.
- Decision density model: level-ups every ~30s, pick 1 of 3-4, weapon-slot
  limits force abandon/evolution calls, chests with gamble, synergies.
- Auto-battler survivors-likes are a proven genre — this is that, with
  pixel-art charm.

## Why pixel art

- Pixel art = structured data (color arrays, tile maps, sprite grids) — the
  most code-like visual style. GLM teams degrade on organic/freeform visuals
  (smackdome lesson) but can plausibly nail structured pixel art.

## Platform

- **Web canvas** (like VS's own HTML5 origin). Fastest iteration; pongrogue
  pipeline proven. May port to Godot later if it outgrows the web.

## VS mechanics worth stealing (reference — adapt, don't copy)

- Auto-attacking weapons (the character never aims)
- XP gems → level-ups → 3-4 choice draft
- 6 weapon slots → forced build tradeoffs
- Evolved weapons (weapon + passive = transformed weapon)
- Chests / gamble moments
- Wave structure with escalating horde density
- Builds that get absurdly broken by design

## The auto-play twist (what makes it OURS)

- No movement input at all. Pure watch + choose.
- **Between decisions (Sk408, 2026-09-08): the player can activate SKILLS and
  use POTIONS to refill health and mana.** The character auto-moves/attacks;
  the player manages resources and ability timing. Keeps zero execution skill
  while adding a continuous engagement layer between level-up drafts.
- Design implications (open for the team to explore):
  - Skills = player-triggered abilities with cooldowns/mana cost — WHEN to
    fire them is the judgment call (hold for the boss wave? save mana?)
  - Potions = consumable refills (health/mana) — inventory is finite, so
    *whether* to burn one now vs. save it is the tension
  - Resource pressure (mana runs out, health drops) creates the "watch the
    timer, decide the moment" beats that keep a watching player engaged

## ARCHITECTURE MANDATE: movement is a swappable controller (Sk408, 2026-09-08)

"Eventually we could just give the player movement control and it becomes a
whole new game." — the auto-play is NOT a limitation, it's phase one of a
platform. The character controller MUST be built as an abstraction from day
one:

- Movement/aiming = a CONTROLLER module with a clean interface. Auto-pilot
  (AI decides movement/attacks) is ONE implementation.
- Later, a player-input controller can be dropped in without touching the
  horde/wave/upgrade/skill/potion systems — that swap turns HORDES into a
  full active VS-style game.
- Never hard-code "character always moves toward nearest threat" into the
  engine or scene code. Route ALL character decisions through the controller
  seam.
- This is why the engine core (hordes, waves, XP, draft, skills, potions,
  pixel rendering) must stay input-agnostic: it serves both games.

## Status

- 2026-09-09: **scaffold live** — minimal loop complete and smoke-tested
  (`node test/smoke.mjs`, headless 90s sim: ~64s survival, 37+ kills, 3 drafts).
  What exists: pixel renderer (fillRect sprite grids, no image assets),
  controller seam with AutoPilot implementation (mandate-compliant),
  escalating ring spawner, XP gems, level-up 1-of-3 draft (7 upgrades,
  keys 1/2/3), death screen (R to restart).
- 2026-09-09: **SKILLS + POTIONS engagement layer built** (the auto-play
  twist, above). `src/skills.js` + wiring in main/entities/config/render:
  - Skills (player-triggered, mana + cooldown, no aiming): **Q = Frost
    Nova** (AoE dmg 15 + 2.5s 45% slow in r=85, 30 mana, 8s cd), **W =
    Overcharge** (attack-rate x0.45 for 4s, 25 mana, 12s cd).
  - Mana pool 100, regen 2.5/s. Potions: **H** heal 50, **N** mana 40;
    start 1 each, ~5% enemy drop chance, max 3 carried per kind (full
    inventory leaves drops on the ground). Health potion refuses at full HP.
  - HUD: mana bar, per-skill READY/cooldown readout, potion counts.
  - Controller seam respected: skills read state and buff stats only;
    movement/attack decisions still route through `controllers.js`.
    Draft pause (mode gating) unchanged — skills fire in 'playing' only.
  - Smoke test extended: asserts Q costs mana + shows cooldown, N restores
    mana + decrements count, H heals + decrements count. PASSED
    (59s survival, 48 kills, 4 levels).
- 2026-09-09: **AUTOPILOT DOCTRINE OPTIONS built** (general-vs-pilot levers,
  implemented as AutoPilotController state in `src/controllers.js`; key
  handling stays in main.js, ignored during draft):
  - **Focus policy (TAB)**: NEAREST / TOUGHEST (highest max-hp within
    260px) / SWARM (enemy in the densest cluster — most enemies within
    60px of the candidate). Doctrine only picks WHICH enemy the volleys
    target; never manual aim.
  - **Stance dial (G)**: SAFE (kite 2x, gem drift 0.6x speed) / BALANCED /
    GREEDY (kite 0.5x, flees toward loot 65/35 blend — more XP, more hits).
  - HUD line: `TAB Focus: <mode>   G Stance: <stance>`. Tuning in
    `CONFIG.AUTOPILOT` (src/config.js).
  - Smoke test extended: presses TAB/G mid-run, asserts all three focus
    modes and stance positions cycle via the HUD, restores defaults.
    PASSED, stable across 15 runs (~47-70s survival, 34-65 kills).
- 2026-09-09: **TOUCH CONTROLS + mobile layout built** (Sk408 request,
  index.html + src/main.js only):
  - On-screen button layer (`#touch`, fixed-position): FOCUS/STANCE (left
    pad), FROST/OVER skills + HP/MP potions (right pad), each with a live
    badge mirroring HUD state (cooldown seconds / RDY / potion counts).
    Shown via `@media (pointer: coarse)` + JS touch detection; desktop
    keyboard unaffected.
  - Single input path: keyboard and touch both funnel through
    `runAction()` in main.js — zero duplicated game logic. Controller seam
    untouched.
  - `pointerdown` + `touch-action: manipulation` + viewport meta with
    `user-scalable=no` = no 300ms tap delay; draft cards are directly
    tappable with bigger targets on small screens.
  - Responsive canvas: `fitCanvas()` letterboxes to the viewport
    preserving the 480x300 aspect (re-run on resize/orientation change);
    internal resolution and pixelated rendering unchanged.
  - Verified: node --check clean, smoke test passes (5/5 runs), and
    lightpanda headless fetch of the served page shows the game running
    with live HUD + all 6 touch badges.
- 2026-09-09: **WAVE-1 INTEGRATION complete** — weapons/enemy-types/chests
  modules are wired into the live game (main.js/render.js/config.js):
  - **Weapons in the draft**: base volley occupies slot 1 of
    `WEAPON_SLOTS=6`; draft cards grant Orbit Blade / Boomerang / Chain
    Zap / Nova Pulse (already-owned weapons don't re-offer; cards stop at
    the cap). Granted weapons tick via `updateWeapons` each frame; the
    generic volley loop skips kind-tagged projectiles (boomerang bodies
    are weapons-owned, no vx/vy). All FX fillRect-only: orbit dots, zap
    dot-polyline, nova_pulse ring, spinning boomerang.
  - **Typed spawner** (`CONFIG.SPAWNER` mix): chasers from wave 0,
    swarmers in packs from wave 1 (grace period — packs from t0 were
    lethal), brutes from wave 2, spitters from wave 3, elites (~5% after
    60s, any type, gold outline, guaranteed chest). Enemies advance
    `age`, apply `decideEnemyAction` intents at enemy.speed; spitter
    fire intents become enemy projectiles (`state.enemyShots`, green
    blobs) that damage the player on contact under the same invuln
    window. Contact damage scales by `contactDamageMult`. Distinct
    size/color per type.
  - **Chests live**: elite kills (`guaranteesChest`) always drop a chest;
    other elite-ish kills (brutes) roll 35% via `maybeSpawnChest`.
    `tickChests` each frame; chests slide gently toward the player
    (45px/s) so the gem-seeking AutoPilot crosses them without touching
    the controller seam. Events consumed: `chestOpened` (HUD toast),
    `gambleHorde` (toast; horde spawns via chests.js), `tokenOffer`
    **simplified** to a bonus random upgrade — the 1-of-N evolution-token
    choice UI is DEFERRED until the evolution system lands.
  - HUD gains `WPN n/6 <names>` and a per-type `FOES C/S/B/P/D/E` census
    line; toasts surface chest moments.
  - Verified: node --check clean; ALL FOUR test files pass (smoke 15/15
    stable, runs now reach ~60-75s with 4-6 drafts — chests + weapons
    fixed the early-death balance TODO); served :8811 + lightpanda fetch
    shows the full game running clean.
- 2026-09-09: **TITLE SCREEN + META UI + SETTINGS live** (Sk408 request).
  Game now boots to a title screen (pixel logo, purse + equipped character);
  canvas idles behind menus:
  - **TITLE**: PLAY / SHOP / CHARACTERS / SETTINGS (draft-card styling,
    touch-friendly, all directly tappable).
  - **SHOP**: meta.js SHOP_UPGRADES grid — name, desc, LV x/max, next cost;
    buy buttons dim when unaffordable/capped; gold balance shown.
  - **CHARACTERS**: 4 character cards (stats/starting-weapon blurb);
    unlock-with-gold flows straight into equip; EQUIPPED state marked.
  - **SETTINGS**: MUSIC/SFX toggles (against glm-hb3's src/audio.js API —
    integrated via dynamic import + no-op shim so the game runs before
    that module lands) and a tap-twice RESET PROFILE.
  - **RUN FLOW**: PLAY composes the run per meta.js header (meta shop
    bonuses + character mods via applyMetaBonuses/applyCharacter, potions
    via startPotionCount, starting weapon granted into state.weapons;
    Mana Spring regen + Scholar XP mult consumed in the run loop; PALADIN
    heals on chest open). Death pays computeRunGold into the profile and
    shows run stats + gold earned + RETRY/TITLE buttons (R/T keyboard
    parity). ESC backs out of any sub-menu to title.
  - In-run inputs, controller seam, touch UI, draft pause all unchanged;
    the touch layer hides on menus. Smoke test boots via a PLAY click and
    still asserts the full engagement stack (15/10-of-10 stable; runs now
    often survive the full 90s — chest upgrades compound).
  - KNOWN FRICTION: meta.js loadProfile() drops unknown fields, so the
    first-clear best-time bonus is per-session only (bestTime not
    persisted until loadProfile preserves extra fields).
- 2026-09-09: **ESCALATION + wave timer + BOSS** (Sk408 playtest fix:
  maxed builds had gone unkillable):
  - **Scaling curves** (`CONFIG.ESCALATION`, curve fns in entities.js,
    applied as a post-pass over enemy_types.js in main.js):
    hp = (1+0.9w) × 1.35^max(0,w-3) → w6 ~9.1x, w9 ~22x (was 3.1x/4.2x);
    xp = (1+0.6w) × 1.25^max(0,w-4); contact dmg = (1+0.2w) × 1.15^max(0,w-5).
    Enemy-weapon fire + boss novas scale with the damage curve too.
  - **Wave timer**: 120s waves; HUD line `WAVE n - m:ss` (or `BOSS!`).
    On expiry ONE boss spawns (elite BRUTE chassis scaled to wave: hp =
    12 × hpScale(w) × (20 + 10×waveNum), body ×2.2, speed ×0.55, xp worth
    ~10 kills). Purple/gold pixel look + crown, full-width HP bar at the
    top of the screen while alive, radial nova burst (10 shots / 3.5s,
    damage-scaled). The wave timer PAUSES during the fight; boss death
    drops 2 guaranteed chests and starts the next wave. Death to the boss
    pays out normally.
  - Smoke test sim now runs to 150s and observes the boss spawn + wave-2
    transition (8/10 runs; the other 2 die pre-boss — balance is biting).
    All 5 test files pass.
- 2026-09-09: **FINAL INTEGRATION — megabonk draft + weapon XP + boss tune**
  (consumes hb2's per-weapon leveling in src/weapons.js):
  - **Draft rework (weapon-scoped pool)**: cards now GRANT missing weapons
    (slot math excludes the volley), LEVEL-UP any owned weapon below
    WEAPON_MAX_LEVEL=8 (desc from describeWeaponLevel, shows `Lv x/8`;
    duplicate picks just level the same weapon again — the megabonk loop),
    or give the old global stat upgrades. Weighted draw without replacement,
    3 cards: weapon cards weight 1, stat cards weight 0.3 (~70/30 split).
    The base VOLLEY now has an instance in state.weapons so it can be fed
    and leveled too — it never occupies one of WEAPON_SLOTS.
  - **Weapon XP feed**: every gem pickup feeds 1 XP to a random owned
    weapon (below cap); boss deaths feed 30. Levels gained auto-level via
    collectWeaponXp and toast ('VO... REACHED LvN!'). Volley level params
    apply live in the fire loop (+dmgMult / +proj at Lv3/Lv6).
  - **Boss tune**: boss HP mult 35+18/wave (was 20/10, +75%) per the balance
    note above — curve shape unchanged.
  - HUD WPN line shows per-weapon levels (`WPN 5/6 Volley·2,Boomerang·3,…`).
  - Verified: node --check clean; ALL 6 test suites pass (smoke: 381 kills,
    LVL 8, 7 drafts, 4 leveled weapons, boss killed + wave 2 observed;
    weapons/chests/enemy_types/meta/audio all green); :8811 lightpanda
    fetch clean.
- 2026-09-09: **WAVE-5 INTEGRATION — economy slots + ranged doctrine + new
  enemies/weapons + animation pass** (Sk408 playtest: economy pacing, ranged
  gap, animation, variety). Consumes hb2's economy (startWeaponSlots),
  hb3's 4 weapon archetypes, hb4's 3 enemy types + look variants:
  - **RANGED focus doctrine**: TAB now cycles NEAREST/TOUGHEST/SWARM/RANGED —
    RANGED targets fire-capable enemies (SPITTER + WARLOCK) first, falling
    back to nearest when none are in range (src/controllers.js).
  - **Weapon slots enforced**: runs start at `startWeaponSlots(profile)` = 3
    (volley occupies slot 1); slots 4/5/6 are shop purchases (hb2's 'slots'
    category already renders in the SHOP grid). Draft GRANT cards only appear
    while a slot is free; LEVEL-UP cards always flow. HUD shows `WPN n/cap`.
  - **New enemies live** (spawn mix in config SPAWNER): WARLOCK from wave 3
    (holds 150px, 1s telegraph flash, slow heavy 14-dmg bolt — rendered as a
    purple bolt), TICK from wave 2 in latches of 3 (attaches and drains
    4hp/s with a red tether — NO contact damage, must be killed), COLOSSUS
    rare from wave 5 (14x hp; death shockwave = 25 + 25% maxHp AoE vs
    ENEMIES, friendly-fire chaos + toast). DASHER finally joined the spawn
    mix too (wave 2). FOES HUD census extended: `W:warlock T:tick X:colossus`.
  - **New weapons draftable**: SCYTHE / SEEKER / MINE / BEAM grant + level
    cards come free via the WEAPON_TYPES pool; seeker/mine bodies are
    kind-tagged in state.projectiles so the generic volley loop skips them.
  - **Animation pass** (render.js, all fillRect): enemy shapes
    (block/diamond/tall/wide) + 2-3 palette VARIANTS per type via
    resolveLook + ELITE_LOOK gold tells; warlock telegraph blink; tick drain
    tether; scythe windup/arc sweeps; seeker exhaust trails; mine blast
    rings + shrapnel fly-out; beam sweep with width + flicker; hit-spark
    particles on every projectile hit; muzzle flash dots; colossus
    shockwave ring.
  - **Balance retune (documented)**: with 3 starting slots, mid-run DPS is
    ~half the 6-slot builds the ESCALATION curves were tuned against — fresh
    runs burst-died around 60s in sims. HP compounding now starts one wave
    later (w>4, 1.35x) and DMG at w>6; late-wave pressure unchanged. After
    the tune, fresh-profile sims survive 89s reliably (~400 kills, lvl 9-12).
  - **Smoke hardened**: death-screen auto-retry no longer pollutes the draft
    counter; asserts on best-run metrics across retries; heal check waits
    for an uncapped damage window (+50 can't clamp at max) with bounded
    retry, and skips (logged) only if no survivable window ever opens;
    hard asserts for slot cap = 3, no grant cards at cap, grant cards while
    slots free; soft probes for tick/warlock/colossus + RANGED cycle.
  - Verified: node --check clean; ALL 6 suites pass (smoke 8/8 stable);
    :8811 lightpanda fetch clean.
- 2026-09-09: **WEATHER SYSTEM live** (Sk408 request: rain, sun, wind,
  clouds, moonlight, snow) — new `src/weather.js` + `test/test_weather.mjs`:
  - **Roll per run** (weighted): CLEAR 30%, the six weathers split 70%
    (11.67% each). Seeded (mulberry32) particle fields — deterministic per
    run seed; wind's horizontal direction is rolled by the seed.
  - **Modifiers (documented, subtle, fairness-safe)**: SNOW -10% enemy
    speed; RAIN -15% enemy fire range (intercepted at each shooter's base
    range); WIND ±40px/s drift on ALL projectiles (both sides — even);
    MOONLIGHT +10% mana regen; SUNNY +10% gem XP; CLOUDY/CLEAR cosmetic
    only. Applied inside main.js's existing loops — no system signatures
    changed.
  - **Render (fillRect-only, screen space over the scene)**: rain 1x4
    streaks; snow 1x1/2x2 swaying flakes; wind flickering horizontal
    dashes; cloudy scrolling shadow bands; sunny corner sun + pulsing ray
    fan + warm tint; moonlight cool tint + blinking fireflies; per-type
    rgba scene tints. HUD shows `WEATHER: SNOW`.
  - Verified: node --check clean; ALL 7 suites pass (weather 1/1 new suite,
    smoke 12/12 across two batches — weak runs are draft-RNG, not weather);
    :8811 lightpanda clean.
- 2026-09-09: **WAVE-6 BUGFIX PASS** (urgent — Sk408: "the same death
  every run"). Six fixes, all in hb1-owned files:
  - **IDLE-PLAYER BUG fixed**: decide() used to return {0,0} when no gems
    existed and no enemy was inside the kite line — the player parked
    center-screen and ate ranged chip. Idle fallback is now a slow
    deterministic patrol (counter-clockwise orbit of the arena center,
    inward bias past 400px so it never hugs the rim). Smoke now asserts
    via a new HUD `POS x,y` probe that the player never sits at zero
    velocity >2s while >10 enemies live (observed max: 4 frames).
  - **WALL PIN fixed**: at the ±600 clamp the raw flee vector pointed INTO
    the wall. The flee vector now cancels the component pushing beyond the
    rim (|x| or |y| > 560) and re-normalizes — the player skims along the
    wall tangentially instead of dying in the corner.
  - **RANGED doctrine reach**: FOCUS_RANGE 260 left off-screen warlocks
    free-firing. RANGED targets fire-capable enemies (SPITTER/WARLOCK) at
    ANY range; the 260 cap stays for NEAREST/TOUGHEST/SWARM. Smoke unit-
    tests a 400px warlock beating a 20px chaser for target priority.
  - **SPLIT SHOT NERF**: volley projectiles capped at 3 total (+2 from ALL
    sources — Split Shot cards and VOLLEY level grants combined); extra
    projectiles spread 0.18 -> 0.30 rad. VOLLEY's Lv3/Lv6 "+1 projectile"
    grants are re-read in main.js as +20% damage each (the cap made them
    dead weight). NOTE for hb3: WEAPON_LEVELS.VOLLEY labels still say
    "+1 projectile" — relabel when convenient.
  - **BOSS HARDENED**: HP mult 35+18/wave -> 60+30/wave; nova damage 12 ->
    18 (+50%, pre-dmgScale); new periodic summon (3 swarmers every 8s,
    first burst at 4s) so the fight can't be face-tanked.
  - **POTION REBALANCE** (documented in config): HP_HEAL 50 -> 35, drop
    chance 5% -> 3%, and the BOSS CURSE — while a boss lives, health-potion
    heals are halved again (applied at main.js's runAction seam; skills.js
    usePotion stays boss-agnostic).
  - Verified: node --check clean; ALL 7 suites pass (smoke 6/6; test_meta
    flaked ONCE while hb2 was writing meta.js mid-run, then 3/3 clean);
    :8811 lightpanda clean. Fresh-profile sims now lean harder (nerfs
    bite): best runs 380-400 kills / 89s, occasional 57-72s deaths on bad
    draft RNG — that variance is the intended difficulty direction, watch
    Sk408's next playtest.
- 2026-09-09: **WAVE-6 INTEGRATION — the megabonk arc** (portal progression,
  loot, arches, hb4's sprites; consumes hb3's loot.js/arches.js + hb4's
  sprites.js as-is):
  - **SPRITES**: enemies render via sprites.js pixel grids with 2-frame walk
    anim (frame = age×6 % frames); bosses use BOSS_SPRITE; elite outline +
    hp bar use the sprite box. FLAME frames drive the PORTAL ring (8 flames
    orbiting r=24, rotating), the COLOSSUS idle shoulder-fires, and fire FX.
    Shape fallback retained for unmapped types.
  - **PORTAL PROGRESSION** (Sk408 core ask): boss death scatters the
    remaining horde into gems, clears enemy shots, and opens a flame-ring
    PORTAL at the boss's death spot. Walking in (r=16; portal chases at the
    player's CURRENT effective speed + 60 — Light Boots stacks hit 211px/s
    in sims, a fixed speed stalls forever) triggers the INTERMISSION overlay
    (wave stats + purse + paid-chest gamble). CONTINUE starts the next wave:
    timer reset, fresh 1-2 arches, every 3rd wave (DOUBLE_EVERY) spawns TWO
    bosses at once. Endless — no run cap. Spawns pause while the portal is
    open (breather).
  - **LOOT (hb3's loot.js)**: normal kills 2% / elites 50% (rolled up-tier) /
    bosses ALWAYS (BOSS_TIER_BIAS 1.5) drop rare items — auto-equip into 4
    slots (ITEMS HUD line); a full inventory burns the item with a toast
    (the megabonk tension). applyAffixes runs at run start AND on each equip;
    crit/critMult roll per volley hit, lifesteal heals on hit, thorns reflect
    contact, xpMult on gems, goldMult on death payout, potionPower at the
    runAction potion seam, dropBonus in the death-loop drop roll,
    artifactLevels = free weapon levels at run start. **PAID CHESTS** in the
    intermission: BRONZE 50g / SILVER 150g / GOLD 400g from the purse —
    always debits, nothing% is the gamble (dimmed when unaffordable).
  - **ARCHES (hb3's arches.js)**: 1-2 gates per wave (120-380px out); gates
    drift 20px/s toward the player (chest precedent — the AutoPilot stays
    arch-blind by design, controllers don't know arches exist). Buffs:
    DOUBLE_FIRE, MAGNET, SHIELD (AEGIS absorbs — also eat projectiles),
    BERSERK, SWIFT; active buffs show in the HUD (ARCH line + AEGISxN).
    Rendered as pixel gates with shimmer glow.
  - **SHOP surfacing**: hb2's 14 upgrade lines + ARCADE PASS render in the
    shop grid (overlay got `justify-content: safe center` so long lists
    SCROLL on small screens instead of clipping). Arcade pass = golden HUD.
  - **Fixes riding along**: corner-pin stall (wall-steer canceled BOTH flee
    components at the rim corner — now steers diagonally to center);
    smoke's stall probe went sub-pixel (POS toFixed(1), threshold 0.4 —
    BERSERK's 45px/s = 0.75px/frame defeated the integer probe).
  - CAVEAT for hb3: weapons.js updateWeapons does NOT consume loot
    crit/critMult/rateMult/damageMult — those mults apply to the volley path
    in main.js only (hb3-owned file, not wired here).
  - Verified: node --check clean; ALL 10 suites pass (smoke 8/8 stable,
    intermission reached 7/8 soft probes; 300s instrumented sim watched the
    full loop: boss → portal → BRONZE chest buy → wave 2 → second boss);
    :8811 lightpanda clean (title + all 4 menu cards live).
- 2026-09-09: **WORLD-SPACE GROUND DECOR + CAMERA ANCHORING** (Sk408
  playtest follow-up: "rain and arches feel strange... drifting to the
  player") — hb1 pass over render.js/main.js/config.js/weather.js:
  - **Ground decor**: deterministic per-run world-space field (`CONFIG.GROUND`,
    `state.groundSeed` rolled in startRun) hashed from (cellX, cellY, seed) —
    no stored arrays; cells outside the view are never visited (cull for
    free). Muted tone families picked per run so runs look different; decor
    sits UNDER everything, fillRect-only. ~580-650 rects/frame total (bounded).
  - **Weather anchoring**: rain/snow/wind/cloud/moon particles render
    camera-compensated (world space) — weather falls past the player instead
    of sliding with the screen. Seeded determinism + modifiers untouched
    (test_weather still green).
  - **Arch drift softened**: `CONFIG.DRIFT.ARCH` 20 -> 6px/s (chests keep
    45 — pure reward stays eager). Arches read as standing in the world;
    smoke still observes gates crossed (AEGISx3 in HUD).
  - Verified: node --check clean; ALL 10 suites pass; lightpanda :8811
    fetch clean (0 errors).
- 2026-09-09: **PLAYER WALK ANIMATION** (Sk408: "simple and subtle, to
  help movement") — hb1: `PLAYER_SPRITE_WALK` frame B in render.js (1-2px
  leg/body shift), swapped in only while actually moving (position delta
  > 0.25px since last render, derived from controller velocity — no new
  gameplay state), same ~6fps clock as enemies, stationary -> frame A.
  Invuln blink / camera offset / fillRect-only unchanged. Verified:
  node --check clean, sprites + smoke suites pass, lightpanda clean.
- 2026-09-09: **WAVE-7 — EVOLUTIONS / NAMED BOSSES / INTERMISSION
  CHOICES / INTRO MOVIE** (Sk408-approved A+B+C + title cinematic).
  Four parallel module builders then hb1 integration:
  - **Weapon evolutions** (hb5, `src/evolutions.js`): every archetype has a
    named super-form (e.g. VOLLEY -> Nova Shot). Requires Lv8 + a specific
    equipped item kind + 1 evolution token (legendary chests grant tokens);
    EVOLVE draft card via the menu overlay. Affixes reuse the weapon seam
    + at most 2 behavior flags (twinOrbit, chainZap, ...).
  - **Named boss cast** (hb6, `src/bosses.js`): GRAVELMAW THE CHARGER
    (telegraph -> charge line -> recover), THE CHOIR MOTHER (summon bursts +
    projectile fan under half HP), PYRAXIS (ring novas with charge-up +
    short teleports). Larger hand-authored sprites; `pickBossForWave`
    rotation, two distinct bosses on waves 3/6/9; names announced in HUD.
  - **Intermission choices** (hb7, `src/choices.js`): at each portal, after
    chest shopping, pick 1-of-3 rarity-weighted blessings — each with a REAL
    drawback (14-entry pool, run-scoped only, seeded rng for future daily
    runs; player.choices.* is the run-scope anchor).
  - **Intro movie** (hb8, `src/intro.js`): ~7s skippable cinematic on load —
    zoomed hero (8-10px pixels) fleeing an encroaching horde, the horde
    swallows the hero, the big HORDES pixel title stamps down with shake +
    splatter, fade to menu. Deterministic, zero mutable state, PHASES export
    for audio stingers.
  - Integration (hb1): evolve cards + tokens, boss intents
    (telegraph/summon/fan/nova/teleport/charging/recovering) in the enemy
    loop, boss name announces (both names on double waves), choice cards at
    intermission + run reset of choices/tokens/evolutions, intro before the
    title menu (any input skips).
  - **Overseer flake fixes during verification**: (1) `applyChoice` now
    always stamps `player.choices` via `ensureChoices` (was offer-dependent,
    flaked smoke); (2) calm gem-drift in controllers.js gained the same
    wall-steer as the flee path — a gem beyond the rim parked the player
    against the ±600 clamp (3.1s stall caught by smoke at x=561).
  - Verified: 14/14 suites (smoke 10/10 consecutive), lightpanda clean.
- 2026-09-09: **WAVE-8 — PORTAL CINEMATIC + CINEMATIC AUDIO** (Sk408:
  "a little video of the hero defeating the boss and entering a portal,
  zoomed in the same way... hear the monsters coming and the title slamming
  down... boss yell... spacey sound"). hb8 + hb3 parallel, hb1 integrated:
  - **Portal cinematic** (`src/portal_cine.js`, hb8): ~3.8s deterministic
    timeline — KILL (zoomed hero lands the killing blow, boss collapses
    into a pixel pile), WALK (flame-ring portal fades in, hero walks in),
    DISSOLVE (hero shrinks into rising motes, portal core glows), FADE
    (white-out). Plays when a wave's FINAL boss dies (incl. double-boss
    waves), then cuts to intermission; skippable, out-of-range-t safe.
  - **Cinematic audio** (`src/audio.js`, hb3): playIntroCue /
    playPortalCue stinger API — rising horde drone, TITLE_SLAM impact,
    FADE sweep, BOSS_YELL growl, spacey DISSOLVE shimmer. SFX-toggle
    gated (music toggle does not gate), no-op-safe without AudioContext,
    0.4s re-fire guard.
  - Integration (hb1): cinematic on final boss death → intermission;
    per-frame phase polling fires cues once per transition in both videos;
    smoke covers skip (frame 31) and natural end (229 frames).
  - Cleanup: removed stale `test/dbg2.mjs` (pre-wave-7 smoke copy that
    failed from the intro-boot change; recoverable in git history).
  - Verified: smoke 5/5 + 14 module suites, lightpanda clean.
- 2026-09-09: **WAVE-9 — HEAT SYSTEM** (Sk408: "megabonk approach where
  difficulty can keep scaling... careful with items... there could even be
  a difficulty increaser for the user to engage"). hb6 module + hb1 wire:
  - `src/heat.js` (hb6): run-scoped heat ledger. Charges: WEAPON_EVOLUTION
    +2, NEW_ITEM_SLOT +1, ITEM_EXCHANGE at the 4/4 cap +0 (Sk408's guard —
    the pilot churns items constantly), MANUAL_PUSH +1 (idempotence per
    event id; HEAT_CAP 20 with partial fills). Multipliers: hp x(1+.12h),
    damage x(1+.08h), spawnRate x(1+.06h) — stacked AFTER wave escalation;
    goldMult x(1+.30/manual) driven by MANUAL pushes only (built-in heat
    never inflates gold).
  - Integration (hb1): RAISE THE STAKES card in the intermission (sells
    the next gold mult; clamped at cap), spawn-time hp/damage/spawn
    scaling incl. bosses, HEAT line in the HUD next to WEATHER, run reset.
  - Verified: smoke 5/5 (exchange +0, evolution +2, stakes to cap, CHASER
    hp x2.20 at heat 10), 15 module suites, lightpanda clean.
- 2026-09-09: **WAVE-10 — END GAME: THE FINALE** (Sk408 spec: wave-5
  target for now, tunable; final boss is presently unbeatable).
  - `src/final_boss.js` (hb6): THE MAW OF THE HORDE — huge sprite
    (~4x scale), huge display HP (2.5M) with an HP FLOOR (BEATABLE=false
    export for when Sk408 green-lights the kill); slow 4.5s attack cycle:
    TELEGRAPH (0.8s) -> 360° BARRAGE volley, huge radius, near-unavoidable.
    `finalBossDamage(player)` = ceil(maxHp/3), bypasses all defenses —
    any hero dies in exactly 3 hits. VOLLEY MERCY RULE: one hit per
    volleyId (shouldApplyHit mask) — the rest of the same barrage pass
    through harmlessly.
  - Integration (hb1): CONFIG.END_WAVE=5; after the wave-5 boss + cine the
    game enters FINALE MODE — all enemies despawn, spawner/arches/chests
    silent, no intermission/choices/portal; maw HP bar (never-emptying
    blood-red), telegraph wash + hit flash; hero death -> distinct end
    card "THE HORDE CLAIMS ALL" + stats + gold + RETRY/TITLE.
  - hb1 found + fixed: finalBossDamage NaN reading player.maxHp directly
    (now reads via stats). Overseer verification caught a second controller
    flake: near-axis outward gem at the rim left a sub-pixel tangential
    crawl after wall-steer (3.0s stall at x=560.1) — calm branch now
    patrols when the post-steer vector < 0.25 magnitude.
  - Verified: smoke 15/15 during the hunt + 5/5 after, all 16 suites,
    lightpanda clean.
- Layout: `index.html` + `src/{config,entities,controllers,skills,weapons,
  enemy_types,chests,meta,render,weather,main}.js` + `src/audio.js`
  (ES modules, no build step — must be served over HTTP).
- Balance TODO: boss HP +75% (megabonk rework) + wave-5 curve softening both
  need a Sk408 playtest pass; GREEDY stance still unplaytested; fresh runs
  still burst-die ~60-70s roughly 1-in-4 sims pre-DASHER-retune (watch it).
- Next (dispatch to builders): evolution system (consumes the deferred
  token-choice UI), boss variety, persistent meta.
- Hosting: base loop is presentable — request posted to coordinator for
  https://claude.stevesinfo.com:8443/hordes/.
- 2026-09-09 (wave-11): **ECONOMY, UNLOCKS + WAVE-11 WISHLIST** — all four
  overseer wishlist features (shrines / elite modifiers / rampage meter /
  weapon synergies) plus Sk408's economy directives. Six builders, one
  integration pass, one balance sim.
  - ECONOMY (`src/meta.js` hb2, retuned by hb7): WEAPON_PRICES ladder —
    weapons are BOUGHT in the shop (profile.unlockedWeapons starts as the
    starter set: VOLLEY + one cheap pick; old profiles migrate retroactively,
    Sk408-approved). Elite-modifier unlocks (SWIFT / SPLITTING / VAMPIRIC)
    are shop rows, locked by default (profile.unlockedElites). LUCK skill,
    5 levels, shifts loot rarity via luckDropWeights (base 60/25/12/3,
    common-heavy). GOLD_MODEL + `tools/balance_sim.mjs` (hb7, 200-career
    Monte-Carlo with compounding): TARGET (a) 10 good runs -> 63.3% of the
    mid-tier catalog from good-run gold [tolerance 35-65%] PASS; TARGET (b)
    top tier = BEAM 110k (60.7 ref runs / 34.0 compounding-aware) and
    ARCADE_PASS 140k (77.2 / 43.2), both 30+ PASS. Honest sim finding for
    Sk408: mixing average runs, real-player pace is ~2x the good-run
    standard (full mid catalog ~15 good runs / ~62 total); if too fast in
    playtest the lever is the GREED line (350g base), not the catalog.
  - BEST-CASE EQUIP (`src/loot.js` hb4): swap-churn gone — decideEquip is
    strict-better only (empty slot, or itemScore(new) > weakest equipped);
    otherwise the drop stays on the ground. Heat rule unchanged. FLASH
    DROPS: ~0.8%/eligible kill (luck-scaled, 45s guard) — pickup kills ALL
    enemies of the weakest trash tier present (SWARMER/CHASER class only;
    bosses/elites/typed untouched).
  - ELITE MODIFIERS (`src/elite_mods.js` hb6): rolled only for normal
    elites, gated STRICTLY by profile.unlockedElites (locked ids never
    spawn). SWIFT +70% speed, SPLITTING (2 children at 30% hp, once only),
    VAMPIRIC lifesteal. All three carry dropGuaranteed — a guaranteed item
    on kill is the deal.
  - RUN SHRINES (`src/shrines.js` hb8): ~60% of waves spawn one altar on
    the patrol ring (250-420px). Proximity auto-buys ONE random
    choices.js blessing (blessing AND its drawback in the toast) for
    shrineCost = round((60 + 30*wave) * 1.25^used). Per-run only; pilot
    stays shrine-BLIND (altar lean-drifts to the player at ~6px/s, arch
    precedent).
  - WEAPON SYNERGIES (`src/synergies.js` hb5): 7 named pair passives
    (Orbital Volley, Superconductor, Bloodhound Rang, Chain Reaction,
    Threshing Storm, Gravity Well, Fire Focus); detectSynergies re-runs on
    every weapon change; each weapon pairs at most once per partner.
  - RAMPAGE METER (hb1, in main.js): kill streak ramps XP +1%/kill (cap
    +50%); gold rides the run-BEST streak (mult up to 1.5x, kept for the
    run). ANY hp loss resets the streak. HUD readout.
  - CHARACTER LEVEL TAPER (hb1): speed/rate-of-fire level-up gains now
    diminish — 1.0 / 0.75 / 0.55 / 0.4 / 0.3 / 0.22 / 0.15 fraction per
    repeat; early picks full-strength.
  - Verified: all 20 unit suites, smoke x6 total reps with new wave-11
    probes, lightpanda clean.
  - Ops note: two worker-delivery failures this wave (a rogue duplicate
    hb2 running from the wrong workdir, and hub-worker issue posts not
    reaching workers after ~11:49 — direct API posts deliver fine);
    recovered via restart + direct re-issue, zero lost work.
- 2026-09-09 (wave-12): **MOBILE GUI REFRESH** (Sk408 directive) — hb1:
  - GRAPHIC HP + MANA BARS — pixel bars on the game canvas (top-left):
    HP red w/ damage-flash segment, mana blue, 1px borders, chunky VS-style
    segment steps. Boss/maw bar untouched.
  - WEAPON + EQUIPMENT ICON ROW — per-weapon 5x5-ish fillRect pixel grids
    (distinct per type; evolution = gold border tint) each with a small
    "lv #" badge; per-equipped-item rarity-tinted mini icons (grey/blue/
    purple/orange).
  - WEATHER ICONS — small static pixel icons, top-right, one per active
    weather effect; clear sky shows nothing.
  - TEXT HUD OPT-IN — the old text #hud still exists but is hidden by
    default; SETTINGS > TEXT HUD toggle, persisted (audio-settings shim
    pattern), default OFF.
  - STATS SCREEN — in-run overlay (game paused): weapon list (icon, name,
    evolution, level, one-line effect), equipped items (name + rarity +
    affix effects), active synergies, rampage streak/best, core stats.
    Opens via 'S' key or the STATS touch button.
  - Verified: all suites green, smoke x3 reps with wave-12 probes,
    lightpanda clean.
- 2026-09-09 (wave-13): **MANUAL PILOT CONTROL + AUTO TOGGLE** (Sk408
  directive; fallback tag `pre-manual-control` pinned at f40bcf4 first) —
  hb1:
  - PlayerController in src/controllers.js — same seam interface as
    AutoPilot (decide/pickTarget/cycleFocus/cycleStance); movement from a
    held-direction input state (main.js feeds keys + d-pad; controller
    never touches DOM). VOLLEYS STAY AUTO-AIMED — manual is movement only
    (game identity). Normalized diagonals; rim clamp unchanged.
  - TOGGLE: state.pilotMode AUTO|MANUAL, 'M' key + AUTO/MANUAL touch
    button; controllers persist across the toggle; every run starts AUTO
    (last choice remembered per browser, applied only after first toggle).
  - KEYBOARD: arrows + WASD in MANUAL. Overcharge moved permanently
    W -> E (W conflict). S = stats in AUTO only; I = stats in both modes.
  - MOBILE: pixel-styled on-screen d-pad (#dpad) in the touch layer under
    the screen; multi-touch with skill buttons works.
  - EDGE CASES: manual input live only in playing/finale (drafts, intro,
    portal cine, kill phase ignore it); no input held = player stands
    still while the world acts; gems still vacuum; smoke default runs
    stay AUTO with separate manual probes (toggle/hold/diagonal/d-pad/
    blur/AUTO resume/draft-pause inertness).
  - Verified: 21/21 suites (new test_controllers.mjs), smoke x3,
    lightpanda clean with #dpad + tc-pilot in live DOM.
