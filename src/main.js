// HORDES — auto-playing survivors-like. Entry point & game loop.
import {
  CONFIG as C, UPGRADES,
  DRAFT_LADDER, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES,
  ladderHp, ladderDmg, ladderXp, ladderGroups, ladderEliteChance, ladderBeats, runClock,
  volleyProjectileCap,
} from './config.js';
import { makePlayer, makeProjectile, makeGem, hpScale, xpScale, applyEscalation, clampLootToArena, lootLimit, contactHitDamage } from './entities.js';
import { Renderer } from './render.js';
import { AutoPilotController, PlayerController } from './controllers.js';
import { useSkill, usePotion, updateResources, updateUlts, ultCharge } from './skills.js';
import {
  rollItem, applyAffixes, STAT_DEFAULTS, MAX_EQUIPPED, PAID_CHESTS, rollPaidChest,
  decideEquip, flashTargets, shouldFlashDrop, describeFlash,
} from './loot.js';
import { spawnArch, tickArches, activeArchMods, ARCH_TYPES } from './arches.js';
import {
  WEAPON_TYPES, WEAPONS, makeWeapon, updateWeapons, WEAPON_NAMES, WEAPON_MAX_LEVEL,
  levelUpWeapon, describeWeaponLevel, collectWeaponXp, weaponLevelParams, PIERCE_ALL,
} from './weapons.js';
// WAVE-11 pure modules (hb6/hb8/hb5): rolls + math only — this file owns all
// mutation, stamping, drift and rendering on top of their contracts.
import { rollEliteModifier, applyEliteModifier, splitChildren } from './elite_mods.js';
import { rollShrine, shrineBlessing, canAfford } from './shrines.js';
import { detectSynergies, describeSynergy } from './synergies.js';
import { WEAPON_ICONS, WEAPON_ICON_PALETTE } from './sprites.js';   // WAVE-12 stats icons
import { ENEMY_TYPES, makeTypedEnemy, decideEnemyAction, rollVariant, deathShockwave } from './enemy_types.js';
import { maybeSpawnChest, tickChests, rollEvolutionToken } from './chests.js';
// G8 step 3: the CONDITION-shape run-altering cards (Horde Bait / One of Each).
import { ruleCards, statCardOffered, markStatTaken, hasRule, RULES } from './rules.js';
// G8 step 4: the general skill items (Regrowth / Focus / Thick Skin) — the
// perk card family, its applied-value helpers (one source of truth for the
// HUD and the damage funnel) and the ONE per-frame regen step.
import {
  skillCards, applyRegrowth, damageTaken, skillManaCost, SKILL_PERKS,
} from './perks.js';
// N1 slice 2: the draftable FROST_NOVA card ("Pocket Frost") — a run-owned,
// AUTO-FIRED nova through the existing useSkill seam (src/frostcard.js).
import { frostCard, frostCardOffered, frostCardTick, hasFrost } from './frostcard.js';
// G8 step 2: the rule-REWRITE card family (Pierce All / Chain Reaction /
// Blood Harvest) — mechanic rewrites, granted through the same card contract.
import {
  rewriteCards, hasRewrite, rewriteBoom, boomBlast, harvestBlast, applyBlast, REWRITES,
} from './rewrites.js';
import {
  rollWeather, initWeather, update as updateWeather, mods as weatherMods, windDrift, mulberry32,
} from './weather.js';
import { evolveWeapon, describeEvolution, EVOLUTION_DEFS } from './evolutions.js';
import { pickBossForWave, decideBossAction, MIDBOSS } from './bosses.js';
import { recordEncounter, seenCount, totalEncounters, bestiaryModel } from './encounters.js';
import { rollRarity, applyRarity, effectiveTierId, RARITY } from './rarity.js';
import { Tour, TOUR_KEYS, tourFlag, setTourFlag, tourStage1Done, clearTourFlags } from './tour.js';
// WAVE-10 finale (hb6's module — read its header before touching wiring):
// mawDecide keys choreography off enemy.age; barrage projectiles each carry
// volleyId; the mercy rule + 3-hit damage live there. NOTE (RUN-STRUCTURE):
// HP_FLOOR/DISPLAY_HP/applyFinalBossDamage are deliberately NO LONGER imported
// — the maw's pool is main.js's (CONFIG.RUN.MAW_HP) so the milestone can
// actually be slain. final_boss.js is untouched and still exports them.
import {
  FINAL_BOSS, FINAL_BOSS_SPRITE, FINAL_BOSS_PHASES,
  MAW_SPEED_BASE, makeFinalBoss, decideFinalBossAction, finalBossDamage,
  shouldApplyHit,
} from './final_boss.js';
import { rollChoices, applyChoice } from './choices.js';
// CARD ART INTEGRATION (R1): the draft's offers render their playing-card art
// through the REAL drawCard — the join table lives in the wiring module (the
// deck and the renderer are frozen tracks).
import { paintOfferArt, INSPECT_ART_SCALE } from './draft_card_art.js';
import * as INTRO from './intro.js';
import * as CINE from './portal_cine.js';
import {
  HEAT_CAP, HEAT_CURVES, heatMultipliers, goldMult, describeHeat, heatOf,
  manualPushes, addHeat, initHeat,
} from './heat.js';
import {
  loadProfileResult, saveProfile, makeProfile,
  GOLD_TIER, purseTier, purseValue, RUN_GOLD,
  SHOP_UPGRADES, upgradeCost, buyUpgrade, startWeaponSlots,
  CHARACTERS, unlockCharacter, equipCharacter, weaponUnlocked, shopRowOwned,
  applyMetaBonuses, applyCharacter, startPotionCount, hasArcadePass,
  luckDropWeights,
  draftCardWeight,
  draftLadderWeight,
  // W1 save foundation (src/save.js): versioned schema + lossless export/import.
  SCHEMA_VERSION, exportProfileText, importProfileText,
  // v6 one-time-banner ledger (save.js): first-EVER gates for the tutorial-scale
  // banners, so they fire once per PROFILE rather than once per run.
  bannerSeen, markBannerSeen,
  downloadProfile, saveProfileToDisk, readSaveFile,
  readRecovery, downloadRecovery, STORAGE_KEY,
} from './meta.js';
// G9 ACHIEVEMENTS — the earned half. achievements.js owns the catalog, the
// goals and the grant (its recordRun is the one fold-a-finished-run entry
// point); the art barrel owns the emblems and their names/descriptions. This
// file only WIRES them: it never restates an achievement, a goal or a trophy
// name, so the emblem, its caption and its condition cannot drift apart.
import {
  recordRun, gallerySummary, ownsUnlock, ACHIEVEMENT_BY_ID, ACHIEVEMENTS,
  earnedCount, totalAchievements, isEarned,
} from './achievements.js';
import { TROPHY_ART, CHARACTER_PORTRAITS, shopIcon } from './art/index.js';
import { composeMenuFrame, MENU_FRAME_PALETTES, MENU_FRAME_SHADOW } from './art/menu_frame.js';
import {
  DEFAULT_CHALLENGE_ID, CHALLENGE_IDS, challengeOf, isStandard,
  challengeRules, nextChallengeId, describeChallenge,
} from './challenges.js';
// G20a STAGES — the third axis (the PLACE): pool/mods/hazard rows stamped onto
// the run exactly like challenges are. Same purity contract, same session-
// scoped pending selection, nothing persisted.
import {
  DEFAULT_STAGE_ID, STAGES, stageOf, stageMods, isDefaultStage,
  nextStageId, describeStage, lockedStageLines,
} from './stages.js';

// ---------- Audio (glm-hb3's src/audio.js — EXACT API per spec) ----------
// Dynamic import with a no-op shim so the game boots identically before the
// audio module lands. Persistence is audio.js's job; settings only call
// setters and reflect getters.
let audio = {
  init() {}, setMusicEnabled() {}, getMusicEnabled() { return false; },
  setSfxEnabled() {}, getSfxEnabled() { return false; },
  playSfx() {}, startMusic() {}, stopMusic() {},
  playIntroCue() {}, playPortalCue() {},   // WAVE-8/B cinematic stingers
};
try {
  const mod = await import('./audio.js');
  if (mod && mod.init) audio = mod;
} catch { /* audio.js not built yet — shim stays in place */ }
try { audio.init(); } catch { /* audio init must never block the game */ }

// ---------- DOM ----------
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovSub = document.getElementById('ov-sub');
const ovCards = document.getElementById('ov-cards');
const renderer = new Renderer(canvas);

// ---------- Responsive canvas: letterbox to viewport, never stretch ----------
// WAVE-23 RESOLUTION (Sk408: "maybe we can have a resolution setting?"):
// display scale + backing store are now mode-driven, persisted like the
// other prefs:
//   AUTO (default)  — fractional fit (fills the window, biggest picture);
//                     glyphs still rasterise crisp at device resolution
//                     because the backing store tracks the real CSS size
//                     (render.js resize), but ART pixels can be uneven
//                     (some 2px, some 3px at a 2.67x fit).
//   PIXEL-PERFECT   — integer floor scale; every art pixel is a uniform
//                     NxN block. Prefers crisp over maximal window use.
//   2x / 3x / 4x    — forced integer scale (clamped down to what fits the
//                     window). More device pixels per art pixel = chunkier
//                     pixels, bigger canvas — and more GPU fill (perf note).
const prefStorage = (() => {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch { /* sandboxed — fall through to the no-op shim */ }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
})();
const KEY_RESOLUTION = 'hordes_resolution';
const RES_MODES = ['AUTO', 'PIXEL-PERFECT', '2', '3', '4'];
function resMode() {
  const v = prefStorage.getItem(KEY_RESOLUTION);
  return RES_MODES.includes(v) ? v : 'AUTO';
}
function displayScale(fit) {
  const m = resMode();
  if (m === 'PIXEL-PERFECT') return Math.max(1, Math.floor(fit));
  if (m === 'AUTO') return fit;
  return Math.min(Number(m), Math.max(1, Math.floor(fit)));
}
function fitCanvas() {
  if (!window.innerWidth || !canvas.style) return; // stub/headless guard
  const fit = Math.min(window.innerWidth / C.VIEW_W, window.innerHeight / C.VIEW_H);
  const scale = displayScale(fit);
  canvas.style.width = Math.floor(C.VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(C.VIEW_H * scale) + 'px';
  renderer.resize();   // re-size the backing store to the new CSS size
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ---------- State ----------
// WAVE-25 (audit 2.6): ONE wave shape. There used to be two — a short
// module-init literal (endsAt hardcoded 120, no mid-boss fields) and the
// fuller object startRun() built. Both now come from here, so the tuning
// constant (CONFIG.ESCALATION.WAVE_LENGTH) and the field set cannot drift.
function makeWave() {
  return {
    num: 1,
    endsAt: C.ESCALATION.WAVE_LENGTH,
    boss: null, bosses: [], pendingClear: false, startKills: 0, cinePending: false,
    midAt: C.ESCALATION.WAVE_LENGTH * (1 - C.ESCALATION.MIDBOSS.AT_FRACTION),
    midBossDone: false, midBosses: [],
  };
}
const state = {
  player: makePlayer(),
  enemies: [],
  projectiles: [],   // volley shots + kind-tagged weapon bodies (boomerang)
  enemyShots: [],    // spitter projectiles ({ x, y, vx, vy, damage, age })
  gems: [],
  drops: [],         // potion drops on the ground ({ x, y, kind })
  itemDrops: [],     // rare item drops on the ground ({ x, y, item }) — loot.js
  chests: [],        // chests.js-owned ({ id, x, y, age })
  items: [],         // equipped rare items (loot.js; cap MAX_EQUIPPED=4)
  heat: null,        // WAVE-9 heat ledger (heat.js; run-scoped, never persisted)
  weapons: [],       // granted weapons (base volley is slot 1, not listed)
  arches: [],        // field arch gates (arches.js; 1-2 spawned per wave)
  archBuffs: [],     // active arch buffs (arches.js tickArches-owned)
  shieldAbsorbs: 0,  // remaining AEGIS absorbs while the SHIELD buff lives
  portal: null,      // open portal after a boss clear ({ x, y, age }) — wave-6
  effects: [],       // transient skill/weapon visuals ({ kind, x, y, age, ttl })
  toasts: [],        // transient HUD messages ({ msg, ttl, tint }) — WAVE-14: also the event feed
  bossBanner: null,  // WAVE-14: boss-arrival overlay
                     // ({ names, verb, title, sub, ttl } | null) — names/verb
                     // drive the two-line fit, title stays the flat legacy form
  // EVOLUTION TOKEN banner: seconds the sim is HELD while the first token of a
  // run owns the screen (frame() decays it on wall-clock dt and gates update()).
  bannerHold: 0,   // seconds the sim is held while a one-time banner owns the screen
  time: 0,
  spawnTimer: 0,
  // 'intro' plays the wave-7/D movie before the menu; 'evolve' is the
  // EVOLUTION draft overlay (a maxed weapon + its item kind + a token).
  // G12: 'title' is the startup menu over the composed title card (the other
  // meta screens keep 'menu' over the frozen world); 'farewell' is the
  // EXIT GAME screen.
  mode: 'menu',      // 'menu' | 'title' | 'farewell' | 'intro' | 'playing' | 'draft' | 'evolve' | 'intermission' | 'dead'
  // N2 TITLE ART REVEAL — the assertable seam for the menu fade-in + the
  // START GAME art hold: { phase, t, dur, opacity }. Phases: 'art' (card
  // alone) -> 'fade' (menu up, first entry only) | 'return' (<=150ms re-fade)
  // -> 'settled'; the hold runs 'out' (menu down) -> 'hold' (art alone) ->
  // startRun, which NULLS it. Null when no title flow is live.
  titleReveal: null,
  // N2 TITLE ART REVEAL — the assertable seam for the menu fade-in + the
  // START GAME art hold: { phase, t, dur, opacity }. Phases: 'art' (card
  // alone) -> 'fade' (menu up, first entry only) | 'return' (<=150ms re-fade)
  // -> 'settled'; the hold runs 'out' (menu down) -> 'hold' (art alone) ->
  // startRun, which NULLS it. Null when no title flow is live.
  titleReveal: null,
  pendingDrafts: 0,
  // W7b ladder run state (rerolled/reset in startRun): the run's MYTHIC chase
  // gate ({ cardId: bool }) and the Second Wind spend.
  chasePool: {},
  secondWindUsed: false,
  cam: { x: 0, y: 0 },
  // WAVE-27 camera: the smoothed lead (world px, direction of travel), the
  // follow BASE (the view minus the lead — the deadzone is anchored here so the
  // lead is never folded back in), and the player's last position the follow
  // measures displacement from. Run-scoped (reset in startRun) — declared here
  // so the follow needs no guards.
  camLead: { x: 0, y: 0 },
  camBase: { x: 0, y: 0 },
  camPrev: { x: 0, y: 0 },
  character: null,   // equipped CHARACTERS entry for the current run
  weaponSlots: 6,    // per-run slot cap (startWeaponSlots(profile) in startRun)
  baseWeaponSlots: 6, // pre-choice slot base (Merchant's Pact adds on top)
  // G11 CHALLENGE MODES — run-scoped, reset in startRun. `challenge` is the
  // selected mode's id (never persisted); weaponCap/potionCap are the ceilings
  // the mode's rules impose, defaulting to the constants a STANDARD run uses,
  // so every consumer below can read them unguarded.
  challenge: 'STANDARD',
  // G20a STAGES — run-scoped, reset in startRun. `stage` is the selected
  // stage's id (never persisted); the spawn seam reads it every spawn.
  stage: 'VERDANT_HOLLOW',
  weaponCap: 6,      // rule ceiling on weaponSlots (ONE_WEAPON: 1)
  potionCap: 3,      // rule ceiling on carried potions (NO_POTIONS: 0)
  weather: null,     // per-run weather instance (weather.js, rolled in startRun)
  groundSeed: 1,     // per-run ground-decor field seed (render.js, rolled in startRun)
  evoTokens: 0,      // evolution tokens (chests.js legendary tokenOffer grants)
  // G9 FOLLOW-UP: the three run counters the trophy summary was missing. They
  // live in ONE run-scoped object (reset in startRun) so the summary can read
  // them without five separate guards. bossKills = bosses/heralds killed,
  // chests = chests actually OPENED (expired ones do not count), and
  // waveTookDamage/untouchedWave = whether any wave was finished without a hit
  // landing on the hero.
  runCounts: { bossKills: 0, chests: 0, waveTookDamage: false, untouchedWave: false,
    // EVOLUTION TOKENS: which channel paid each token this run (chests.js
    // EVOLUTION_TOKEN — kill / chest / drop). A ledger, not a rule: the rates
    // are the knock's, and nothing reads this to decide anything.
    tokens: { kill: 0, chest: 0, drop: 0 },
    // E1 RUN PURSE ledger: per-TIER kill counts + the gold earned / spent
    // through the purse this run, so the tier weighting (meta.js GOLD_TIER)
    // can be re-derived and reported honestly. The RAW p.kills count stays
    // beside it — milestones/achievements genuinely want bodies.
    gold: { earned: 0, spent: 0,
      kills: { CHAFF: 0, GRUNT: 0, MID: 0, HEAVY: 0, ELITE: 0, MID_BOSS: 0, BOSS: 0 } } },
  // E1: the live IN-RUN gold wallet is profile.runPurse (persisted); this is
  // its per-frame presentation mirror (syncChrome publishes it, render.js
  // paints it — the renderer never touches the profile).
  runPurse: 0,
  // WAVE-28 AUTO-DRINK: the per-kind lockout gates (CONFIG.AUTOPILOT.AUTO_DRINK
  // COOLDOWN), in seconds. Run-scoped — declared here so the seam needs no
  // guard, and reset in startRun so a new run never inherits a stale lockout.
  autoDrinkCd: { hp: 0, mp: 0 },
  finalBoss: null,   // WAVE-10: the maw instance while the finale lives (also rides state.enemies so the controller targets it untouched)
  volleyMask: null,  // WAVE-10: last barrage volleyId that landed on the hero (mercy rule state)
  choiceSeed: 1,     // per-run seed for the intermission blessing/curse rolls
  choiceRng: null,   // mulberry32(choiceSeed) — deterministic per run
  takenChoices: [],  // choice ids taken this run (repeat-free offers)
  pendingChoiceOffers: null, // this wave's 3 rolled cards (null = roll fresh)
  // Sk408 playtest: "the modifiers at the end of each wave disappear when you
  // click on them... they shouldn't disappear so I can change my choice". Only
  // ONE blessing is active per wave by design, so the offers now stay on screen
  // and re-picking SWAPS: waveChoice is the offer currently taken (null = none
  // yet) and waveChoiceSnap is the choice-mutable player scope captured before
  // the first pick, restored before a new one is applied — so re-picking can
  // never stack two blessings.
  waveChoice: null,
  waveChoiceSnap: null,
  // ---- WAVE-11 run-scoped systems (all reset in startRun) ----
  shrine: null,      // this wave's shrine (shrines.js; null = none rolled)
  shrineRng: null,   // mulberry32(choiceSeed ^ 0x5eed) — separate stream so
                     // shrine draws never desync the intermission offers
  lastFlashAt: null, // FLASH DROP cooldown stamp (loot.js; ms, null = never)
  rampage: { streak: 0, best: 0 },  // kill-streak meter (resets on ANY hit)
  // WAVE-13 / (h) SELECTABLE AUTO-PILOT: 'AUTO_ALL' | 'AUTO_MOVE' | 'MANUAL'.
  // A LADDER of how much the game does for you, not three unrelated switches:
  //   AUTO_ALL  - the pilot moves, casts skills and drinks potions (shipped AUTO)
  //   AUTO_MOVE - the pilot moves; skills and potions are the player's
  //   MANUAL    - the player moves; skills and potions are the player's too
  pilotMode: 'AUTO_ALL',
  zoom: 1,           // WAVE-16 world zoom (ladder 1/2/3/4/6/8; render.js reads
                     // it every frame — live mid-run, presentation only)
  // A2 THE RADAR (owner-suggested 2026-09-14): the circular enemy minimap.
  // Presentation only — render.js drawRadar reads this every frame and paints
  // the radar.js dot set while it is on; the sim never reads it. Toggled by
  // the R key / the RADAR touch button (toggleRadar), sticky across runs in
  // the session like zoom. Not persisted.
  radarOn: false,
  synergies: [],     // active SYNERGIES entries (synergies.js detectSynergies)
  synergyNames: null, // toast-dedup set of already-announced synergy names
  // ---- WAVE-26 (earned slow-mo + glow / stance feedback) ----
  timeScale: 1,      // sim time scale (1 = normal); render/HUD read this
  stanceAct: 'PATROL', // live pilot activity for the STANCE HUD readout
  moment: null,      // earned-moment flourish ({ kind, x, y, age, ttl } | null)
  stanceLootAt: -99, // last GREEDY-payoff toast time (rate limiter)
  // ---- RUN-STRUCTURE wave (the run is a bounded 30:00 ladder) ----
  runWon: false,     // true once RUN SURVIVED has fired (the victory ending)
  lastMinute: 0,     // last whole minute the clock toast fired for
  finalCall: false,  // 29:00 "one minute left" callout fired
  mawCleared: false, // the maw milestone was SLAIN this run (unlocks a tier)
  mawDeadline: 0,    // sim time the maw encounter's window closes
  // ---- G9 TROPHY GALLERY (presentation only; never persisted) ----
  // The gallery browses achievement-gallery entries one at a time. trophyIdx is
  // the ring position (wrapped by refreshTrophyView, so PREV from the first
  // entry lands on the last) and trophyView is the CONTRACT render.js paints
  // from: { art, locked, id } where `art` is already the right grid (the real
  // emblem when earned, the LOCKED silhouette when not — galleryModel does that
  // masking, not the renderer). null means "no showcase" and the renderer
  // paints nothing.
  trophyIdx: 0,
  trophyView: null,
  // ---- G10 BESTIARY (presentation only; never persisted) ----
  // Same contract as the trophy ring: bestiaryIdx is the ring position
  // (wrapped by refreshBestiaryView) and bestiaryView is what render.js
  // drawBestiary paints from: { id, kind, ref, discovered } where the SHAPE /
  // sprite is resolved off the real source modules at draw time (the renderer
  // masks an undiscovered entry to its own silhouette in ONE flat colour).
  bestiaryIdx: 0,
  bestiaryView: null,
  // G23/G11: the guide's ALL/MISSING filter (presentation only, never
  // persisted). bestiaryIdx is normalised against the FILTERED list inside
  // refreshBestiaryView, so switching filters can never index out of range.
  bestiaryFilter: 'ALL',
  wave: makeWave(),
};
state.player.x = C.VIEW_W / 2;
state.player.y = C.VIEW_H / 2;

// ---------- Meta profile (persistent; src/save.js owns schema + storage) -----
// W1: the loader now returns a RESULT — the profile plus a status/notice. A
// corrupt or NEWER-version save is never silently replaced: the payload is
// preserved under meta.js RECOVERY_KEY and the notice is surfaced to the
// player (title screen), because a silent wipe is worse than an error.
const bootResult = loadProfileResult();
let profile = bootResult.profile;
let saveNotice = (bootResult.status === 'corrupt' || bootResult.status === 'future-version')
  ? bootResult.notice : null;

// ---------- W1 AUTOSAVE before any exit path ----------
// Tab close, navigation and backgrounding all flush the profile. Writes are
// synchronous, so they survive beforeunload/pagehide. The explicit Exit Game
// flow is W4's work; this is the guarantee it can build on, and it means a
// player can never lose progress by closing the page.
export function autosave(reason = 'exit') {
  return saveProfile(profile);
}
try {
  const evWin = (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function')
    ? window : globalThis;
  const flush = () => { autosave('exit'); };
  evWin.addEventListener('pagehide', flush);
  evWin.addEventListener('beforeunload', flush);
  // visibilitychange covers the mobile case (iOS/Android often never fire
  // pagehide before suspending a backgrounded tab).
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autosave('hidden');
    });
  }
} catch { /* no window (headless) — the autosave seam still works */ }

// ---------- Character controller seam (see controllers.js) ----------
// WAVE-13 MANUAL PILOT: BOTH implementations live for the whole run — the
// active one is whichever `controller` points at. swapPilotMode rebinds it
// (focus/stance decorations carry across) and startRun always re-engages the
// AutoPilot. The controllers own ALL decisions (movement + volley targeting);
// main.js only owns the held-direction input object they read.
const pilotInput = {
  up: false, down: false, left: false, right: false,   // keyboard (digital, mag 1)
  x: 0, y: 0, mag: 0,                                   // WAVE-15 joystick (analog)
};
const autoController = new AutoPilotController();
const manualController = new PlayerController(pilotInput);
let controller = autoController;

// Held-direction key map (lowercased key -> direction). WASD + arrows.
// Live only while pilotMode === 'MANUAL' (the keydown handler checks).
const KEY_DIRS = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
};

// Last pilot choice per browser (hudText settings pattern). Write-only for
// the record — per the build directive EVERY run starts in AUTO regardless.
const KEY_PILOT = 'hordes_pilot';
function savePilotPref(mode) {
  try { prefStorage.setItem(KEY_PILOT, mode); } catch { /* shim */ }
}

// Drop every held input (keys + stick). Used on AUTO toggle, run start, blur.
// Also snaps the knob visual back to center.
function clearPilotInput() {
  pilotInput.up = pilotInput.down = pilotInput.left = pilotInput.right = false;
  pilotInput.x = 0; pilotInput.y = 0; pilotInput.mag = 0;
  if (joyKnobEl && joyKnobEl.style) joyKnobEl.style.transform = 'translate(0px,0px)';
}

// WAVE-13 toggle: rebinds the controller seam. Focus/stance decorations carry// across BOTH directions (the incoming controller inherits the outgoing one's
// levers — TAB/G keep working through a round trip). Switching to AUTO clears
// held input so a stale direction can't ghost-move the autopilot; keyup
// handlers clear keys regardless of mode (no stuck keys across overlays).
// (h) THE ONE PLACE each assistance question is answered, so no call site
// re-derives a mode from a string compare. `pilotMovesYou` is the movement
// seam (which controller is bound); `pilotAssistsYou` is the auto-cast /
// auto-drink seam that used to read `pilotMode !== 'AUTO'`.
export const PILOT_MODES = ['AUTO_ALL', 'AUTO_MOVE', 'MANUAL'];
export function normalizePilotMode(m) {
  if (m === 'AUTO') return 'AUTO_ALL';        // the pre-(h) persisted name
  return PILOT_MODES.includes(m) ? m : 'AUTO_ALL';
}
function pilotMovesYou() { return normalizePilotMode(state.pilotMode) === 'MANUAL'; }
function pilotAssistsYou() { return normalizePilotMode(state.pilotMode) === 'AUTO_ALL'; }

function swapPilotMode(mode) {
  mode = normalizePilotMode(mode);
  if (mode === state.pilotMode) return;
  const from = controller;
  const to = mode === 'MANUAL' ? manualController : autoController;
  to.focus = from.focus;
  to.stance = from.stance;
  controller = to;
  state.pilotMode = mode;
  if (mode !== 'MANUAL') {
    clearPilotInput();
  }
  savePilotPref(mode);
  // WAVE-23 FIX (desktop audit #3): the hints list is mode-dependent (the S
  // and W keys swap meaning), so a pilot swap must re-render it — otherwise
  // the panel keeps teaching the outgoing mode's keys.
  refreshHints();
  toast(mode === 'MANUAL' ? 'MANUAL PILOT — WASD / arrows or the joystick'
    : mode === 'AUTO_MOVE' ? 'AUTO MOVE — pilot drives, skills + potions are yours'
    : 'AUTOPILOT ENGAGED — move, skills and potions');
}
function togglePilotMode() {
  // Cycle the ladder: AUTO ALL -> AUTO MOVE -> MANUAL -> AUTO ALL.
  const i = PILOT_MODES.indexOf(normalizePilotMode(state.pilotMode));
  swapPilotMode(PILOT_MODES[(i + 1) % PILOT_MODES.length]);
}

// N1 slice 3 FORTIFY (EARTHSHATTER's defensive rider): while p.fortify lives,
// EVERY player-HP loss through the THICK SKIN funnel is scaled by FORTIFY_MULT.
// ONE local helper so all four call sites (drain / contact / shots / the boss
// curse's heal tax) read the same rule. p.fortify ticks in updateResources
// (skills.js) and is deliberately NOT p.invuln — FORTIFY halves damage, it
// grants no i-frames.
function damageTakenFortified(state, amount) {
  const mult = state.player.fortify > 0 ? C.SKILLS.EARTHSHATTER.FORTIFY_MULT : 1;
  return damageTaken(state, amount * mult);
}

function runController(p, dt, am) {
  const decision = controller.decide(p, state, C.PLAYER);
  // Movement. Loot speedMult (Windwalker boots) + SWIFT/BERSERK arch mods
  // multiply the base speed (controller decides WHERE, stats say HOW FAST).
  // N1 slice 3 AFTERIMAGE: her ult's speed window rides the SAME stat-
  // multiplier shape (no dash, no teleport — movement stays the controller's).
  const spd = p.stats.speed * (p.stats.speedMult || 1) * am.speedMult *
    (p.buffs.afterimage > 0 ? C.SKILLS.AFTERIMAGE.SPEED_MULT : 1);
  if (decision.moveX !== 0 || decision.moveY !== 0) {
    p.x += decision.moveX * spd * dt;
    p.y += decision.moveY * spd * dt;
  }
  // Keep the player roughly on the field. WAVE-25 (audit 2.4): the arena edge
  // is CONFIG.GROUND.RIM — render.js draws the wall from the same knob, so the
  // literal 600 that used to live here could silently desync from the art.
  const RIM = C.GROUND.RIM;
  p.x = Math.max(-RIM, Math.min(RIM, p.x));
  p.y = Math.max(-RIM, Math.min(RIM, p.y));
  // Attacking.
  p.attackTimer -= dt;
  const target = decision.target;
  if (target && target.hp > 0 && p.attackTimer <= 0) {
    // Overcharge (W) is a stat buff, not a decision: targeting stays in the
    // controller; this only accelerates the fire rate the controller chose.
    // Loot rateMult + DOUBLE_FIRE arch mod divide the cooldown.
    const rate = p.buffs.overcharge > 0 ? C.SKILLS.OVERCHARGE.RATE_MULT : 1;
    p.attackTimer = p.stats.cooldown * rate / ((p.stats.rateMult || 1) * am.rateMult);
    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    // VOLLEY weapon level (megabonk ladder) + SPLIT SHOT NERF (Sk408):
    //  - total volley projectiles capped at C.WEAPON.MAX_PROJECTILES (base 1
    //    +2 from ALL sources: Split Shot cards AND VOLLEY level grants);
    //  - VOLLEY's Lv3/Lv6 "+1 projectile" grants are re-read here as +20%
    //    damage each instead (the cap made them dead weight; weapons.js's
    //    table text still says "+1 projectile" — noted for hb3 to relabel);
    //  - extra projectiles spread wider (0.18 -> C.WEAPON.SPREAD).
    const volleyW = state.weapons.find(w => w.type === 'VOLLEY');
    const P = weaponLevelParams('VOLLEY', volleyW ? volleyW.level : 1);
    // NOVA_SHOT evolution (evolutions.js): per-weapon affixes multiply damage
    // exactly like the loot damageMult; `pierceAll` removes the pierce cap.
    const volleyEvo = volleyW && volleyW.evolution;
    const n = Math.min(p.stats.projectiles + (P.proj || 0), volleyProjectileCap(p.stats));
    const volleyDmgMult = (P.dmgMult || 1) * (1 + 0.2 * (P.proj || 0)) *
      (p.stats.damageMult || 1) * am.damageMult *   // loot Brutal Edge + BERSERK arch
      (volleyEvo && volleyEvo.affixes.damageMult || 1);
    const volleyPierceAll = !!(volleyEvo && volleyEvo.flags.includes('pierceAll'));
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * C.WEAPON.SPREAD;
      const a = baseAng + spread;
      const pr = makeProjectile(p.x, p.y, Math.cos(a), Math.sin(a), p.stats);
      pr.damage *= volleyDmgMult;
      // G8 step 2 PIERCE ALL: the rewrite is weapon-agnostic — read at SPAWN
      // (both duplicated update loops honor `pierce` already, so one line here
      // covers the in-run and finale/boss loops alike).
      if (volleyPierceAll || hasRewrite(state, 'pierceall')) pr.pierce = PIERCE_ALL;
      // Orbital Volley synergy flag: the update loop flies the ~1-rev orbit.
      if (syn('orbitVolley')) pr.orbit = { t: 0, dur: 0.55, ang: a };
      state.projectiles.push(pr);
      // Muzzle particle dot at the barrel (animation pass).
      state.effects.push({
        kind: 'muzzle', x: p.x + Math.cos(a) * 8, y: p.y + Math.sin(a) * 8,
        age: 0, ttl: 0.08,
      });
    }
    audio.playSfx('shoot');
  }
}

// ---------- Spawner: typed mix on a ring around the player, escalating ------
// Wave = floor(t/30). Swarmers from the start (in packs), brutes from wave 2,
// spitters/warlocks from wave 3, colossi rarely from wave 5; elites (any type)
// ~5% after 60s (guaranteed chest). Palette variants roll per spawn.
// G20a: the ONE spawn seam. The live stage's pool resolves through the SAME
// shipped wave gates (C.SPAWNER.<TYPE>_WAVE, read live — no restated table),
// in pool order, with the same weighted walk and the same 'CHASER' fallback.
// The default stage's pool IS the shipped table in the shipped order, so a
// default run draws byte-identically to the pre-stage chooser (pinned by
// test/test_stages.mjs). For any stage the gates still apply: a COLOSSUS
// entry cannot surface at wave 1 even if a pool carries its weight.
function pickSpawnType(wave) {
  const S = C.SPAWNER;
  const gate = (id) => S[id + '_WAVE'];
  const entries = [];
  for (const [id, w] of stageOf(state.stage).pool) {
    const g = gate(id);
    if (g === undefined || wave >= g) entries.push([id, w]);
  }
  let r = Math.random() * entries.reduce((s, e) => s + e[1], 0);
  for (const [id, w] of entries) { if ((r -= w) < 0) return id; }
  return 'CHASER';
}

// Enemy escalation now lives in entities.js (WAVE-26): the algebra was
// duplicated here and in chests.js with a "both must move" comment; both
// delegate to entities.applyEscalation now (signature: (state, enemy, t)).
//
// RUN-STRUCTURE: the LADDER is the run's escalation authority. entities.
// applyEscalation applies the SHIPPED curves (exact through LADDER.KNEE_TICK,
// i.e. through 4:00 — which is where every early-death measurement lives — and
// explosive after: ~1e9x hp by 30:00). This wrapper re-bases its result onto
// the ladder. Inside the knee both ratios are exactly 1, so nothing the early
// game sees moves at all.
function escalate(e, t = state.time) {
  applyEscalation(state, e, t);
  const w = Math.floor(t / 30);
  const hr = ladderHp(w) / hpScale(w);
  const xr = ladderXp(w) / xpScale(w);
  if (hr !== 1) { e.hp *= hr; e.maxHp = e.hp; }
  if (xr !== 1) e.xp *= xr;
  return e;
}

// G20C: the ONE implementation of the stage stamp. Stage stat mods stamp LAST,
// on the fully-escalated, elite- and rarity-stamped foe — a hpMult 1.5 stage
// produces exactly 1.5x the hp the same spawn would have on the default stage.
// A stage may omit a dial entirely: missing means 1.0 (|| 1), never
// undefined-through-math. The PRE-stage hp is recorded first so chest
// eligibility (chests.isEliteish) can read the stage-independent value — a
// stage hpMult must not make every plain foe read elite-ish.
// Called from the trunk spawn seam (spawnWave) AND at every non-trunk spawn
// site (the chest punishment horde via the post-tick re-base, boss act.summon,
// boss act.ring) so the stamp is universal: NO foe joins the field unstamped.
function stampStageStats(stateArg, e) {
  const sm = stageMods(stateArg.stage);
  e.preStageMaxHp = e.maxHp;
  const mHp = sm.hpMult || 1, mSpd = sm.speedMult || 1;
  if (mHp !== 1) { e.hp *= mHp; e.maxHp = e.hp; }
  if (mSpd !== 1) e.speed *= mSpd;
  return e;
}

function spawnWave(dt) {
  if (state.portal) return;   // breather while the portal is open (no spawns)
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  // WAVE-9: heat speeds the spawn clock (interval / spawnRate).
  // G20a: a stage spawnMult < 1 slows the same clock (guarded — the default
  // stage divides by exactly 1.0, byte-identical to today).
  const sm = stageMods(state.stage);
  const interval = Math.max(0.25,
    (C.ENEMY.SPAWN_INTERVAL - state.time * 0.008) /
    (heatMultipliers(heatOf(state)).spawnRate * (sm.spawnMult || 1)));
  state.spawnTimer = interval;
  // Groups, not individual enemies: a group is one spawn slot that pops a
  // pack (swarmers spawn packSize at once, others pop 1).
  // RUN-STRUCTURE: ladderGroups is the shipped formula through 4:00 and a
  // bounded ramp after (the shipped formula reached 37 groups/tick at 30:00).
  const groups = ladderGroups(state.time);
  // ELITE SURGE beat (ladderBeats): on a surge wave the spawn-time elite
  // chance gets the ladder's ceiling for that wave, so a long run keeps
  // producing events instead of only more bodies.
  const surge = ladderBeats(state.wave.num).surge;
  let eliteChance = surge
    ? Math.max(ladderEliteChance(state.time), C.LADDER.ELITE_MAX)
    : ladderEliteChance(state.time);
  // G20a hazard: an eliteRate stage bumps the SAME spawn-time elite chance
  // additively (capped at 1) — no new spawn code, the existing roll reads a
  // slightly higher number. Default stage: no hazard, no change.
  const hz = stageOf(state.stage).hazard;
  if (hz && hz.kind === 'eliteRate') eliteChance = Math.min(1, eliteChance + hz.add);
  const wave = Math.floor(state.time / 30);
  for (let i = 0; i < groups; i++) {
    const a = Math.random() * Math.PI * 2;
    // G20a hazard: a spawnBand stage squeezes the SAME SPAWN_DIST draw by its
    // ring factor (default stage: no hazard, no change).
    const d = C.ENEMY.SPAWN_DIST * (0.85 + Math.random() * 0.3) *
      (hz && hz.kind === 'spawnBand' ? hz.ring : 1);
    const typeId = pickSpawnType(wave);
    // TICK pops in latches of TICK_PACK (packSize lives in hb4's module and
    // ticks don't set one); everything else uses its own packSize hint.
    // G20a: a stage packMult scales the pop (rounded, min 1); the default
    // stage multiplies by exactly 1.0. G20b hazard: a packBurst stage
    // multiplies the SAME expression by its burst — one more factor on the
    // existing pack site, no new spawn code.
    const pack = Math.max(1, Math.round(
      (typeId === 'TICK' ? C.SPAWNER.TICK_PACK : (ENEMY_TYPES[typeId].packSize || 1)) *
      (sm.packMult || 1) *
      (hz && hz.kind === 'packBurst' ? hz.burst : 1)));
    for (let j = 0; j < pack; j++) {
      const pa = a + (j - (pack - 1) / 2) * 0.12;
      const elite = state.time >= C.SPAWNER.ELITE_TIME &&
        typeId !== 'COLOSSUS' &&                       // colossus IS the mini-boss
        Math.random() < eliteChance;
      const e = makeTypedEnemy(typeId,
        state.player.x + Math.cos(pa) * d,
        state.player.y + Math.sin(pa) * d,
        state.time, { elite, variant: rollVariant(typeId) });
      escalate(e, state.time);
      // WAVE-11 elite modifiers (elite_mods.js): rolled ONLY for normal elite
      // spawns, gated strictly by profile.unlockedElites (locked mods never
      // roll; the roll can fail and leave a plain elite). The stamp rides on
      // top of the escalated stats (SWIFT's hpMult trims the final hp).
      if (elite) {
        const mod = rollEliteModifier(Math.random, profile.unlockedElites);
        if (mod) Object.assign(e, applyEliteModifier(e, mod));
      }
      // G10 rarity tiers (rarity.js): rolled at the SAME trunk spawn site as
      // the elite flag, never for the COLOSSUS (it IS the mini-boss tier) —
      // the same exclusion the elite roll uses. Composes with elite: each
      // system stamps its own fields, nothing conflicts.
      const tierId = typeId === 'COLOSSUS' ? 'COMMON' : rollRarity();
      if (tierId !== 'COMMON') applyRarity(e, tierId);
      // G10 encounters (encounters.js): spawn-time discovery. "Enemies you've
      // ENCOUNTERED" means it appeared and came at you — recording at the kill
      // funnel would hide a boss the player fled from. This ONE site covers
      // every base type incl. elite variants and tier upgrades; the tier
      // entry itself is discovered alongside the first tiered sighting.
      const effTier = effectiveTierId(tierId, elite);
      recordEncounter(profile, 'enemy:' + typeId,
        { wave, at: state.time, tier: effTier });
      if (effTier !== 'COMMON') {
        recordEncounter(profile, 'tier:' + effTier, { wave, at: state.time, tier: effTier });
      }
      // G20a/G20C: stage stat mods stamp LAST, on the fully-escalated, elite-
      // and rarity-stamped foe — the ONE shared stampStageStats (see its
      // comment) now also records preStageMaxHp for chest eligibility.
      stampStageStats(state, e);
      state.enemies.push(e);
    }
  }
}

// ---------- Weapon XP feed (megabonk ladder; XP from gems + bosses) --------
// Routes XP through weapons.js collectWeaponXp; auto-level-ups toast.
function feedWeaponXp(amount) {
  const candidates = state.weapons.filter(w => (w.level || 1) < WEAPON_MAX_LEVEL);
  if (candidates.length === 0) return;
  const w = candidates[Math.floor(Math.random() * candidates.length)];
  if (collectWeaponXp(state, w.type, amount) > 0) {
    toast(WEAPON_NAMES[w.type] + ' REACHED Lv' + w.level + '!');
  }
}

// Apply an equipped item's affixes onto the live stats (loot.js applyAffixes
// is additive per field; equip is one-way in-run so apply exactly once).
function applyItemAffixes(p, item) {
  for (const a of item.affixes || []) {
    p.stats[a.field] = (p.stats[a.field] ?? STAT_DEFAULTS[a.field] ?? 0) + a.magnitude;
  }
}

// WAVE-9: an exchanged item's affixes come back off the run player (mirror of
// applyItemAffixes — the only revert path is the 4/4 exchange).
function removeItemAffixes(p, item) {
  for (const a of item.affixes || []) {
    p.stats[a.field] = (p.stats[a.field] ?? STAT_DEFAULTS[a.field] ?? 0) - a.magnitude;
  }
}

// WAVE-11 BEST-CASE EQUIP (loot.js decideEquip): EQUIP fills a free slot
// (+1 heat NEW_ITEM_SLOT); REPLACE swaps out the weakest equipped item when
// the drop is STRICTLY better (no heat — exchanges are free and rare by
// construction, Sk408's no-churn rule); IGNORE leaves the drop on the ground
// to despawn naturally. Returns a feed line { msg, tint } or null on IGNORE
// (the caller then does NOT consume the drop). WAVE-9 heat charges live here.
// WAVE-14: the feed line is "FOUND: <name>" tinted by the item's rarity.
function applyEquipDecision(it) {
  const res = decideEquip(state.items, it);
  const p = state.player;
  const tint = RARITY_TINTS[it.rarity] || null;
  if (res.action === 'EQUIP') {
    state.items.push(it);
    addHeat(state, 'NEW_ITEM_SLOT');
    applyItemAffixes(p, it);
    for (const w of state.weapons) w.evoDeclined = false;
    maybeTopTierBanner(it);   // (g) first-ever top-tier pickup = an event
    return { msg: 'FOUND: ' + it.name.toUpperCase() + ' [' + it.rarity + ']', tint };
  }
  if (res.action === 'REPLACE') {
    const out = state.items[res.slot];
    removeItemAffixes(p, out);
    state.items[res.slot] = it;   // in-place swap (not append)
    addHeat(state, 'ITEM_EXCHANGE');   // heat.js rule: exchanges always +0
    applyItemAffixes(p, it);
    for (const w of state.weapons) w.evoDeclined = false;
    maybeTopTierBanner(it);   // (g) first-ever top-tier pickup = an event
    return {
      msg: 'FOUND: ' + it.name.toUpperCase() + ' [' + it.rarity + '] (SWAPPED OUT ' +
        out.name.toUpperCase() + ')',
      tint,
    };
  }
  return null;   // IGNORE — not strictly better than the weakest equipped
}

// WAVE-11 luck seam: the rarity weight table for world drops at the run's
// current Fortune level (meta.js luckDropWeights — the shop line feeds it).
function luckWeights() {
  return luckDropWeights(state.player.stats.luck || 0);
}

// WAVE-11 RAMPAGE METER: kill streak ramps XP/gold. mult = 1 + 1% per streak
// kill, capped at +50% (streak 50). ANY hp loss resets the streak; the run's
// BEST streak rides the death payout.
function rampageMult() {
  return 1 + 0.01 * Math.min(state.rampage.streak, 50);
}
function rampageGoldMult() {
  return 1 + 0.01 * Math.min(state.rampage.best, 50);
}
function resetRampage() {
  if (state.rampage.streak > 0) state.rampage.streak = 0;
}

// ---------- E1 THE RUN PURSE (owner directive 2026-09-14) ---------------------
// The run's gold is an IN-RUN WALLET: profile.runPurse, persisted through the
// ONE existing profile key (hordes_profile_v1). Three writers, and only three:
//   purseCredit — per-kill, tier-weighted (meta.js GOLD_TIER), a per-kill
//     EVENT like the token/mana grants beside it: flat, dt-free, so 60Hz and
//     120Hz pay the same per corpse. Does NOT save per corpse (a corpse storm
//     must not write storage); the exit flush (autosave on pagehide /
//     beforeunload / visibilitychange) + the run's periodic flush + every
//     spend/settle save cover persistence.
//   purseSpend  — EVERY in-run purchase (shrine, paid chest) debits the purse,
//     never the bank. profile.gold is unreachable mid-run by design: a run
//     cannot spend gold it has not earned.
//   settleRunGold — banks FIXED award x goldMult + the purse remainder into
//     profile.gold and ZEROES the purse (zeroing is what stops the next
//     settlement banking the same remainder twice).
function purseCredit(e) {
  // W7b RARE Gilded Palm: +30% purse gold per kill per pick, compounding. The
  // multiplier lives on the run's stats (1 = the shipped payout bit-for-bit,
  // CHAFF's 0 included), so the wallet keeps ONE writer and every consumer
  // (HUD, ledger, settle) reads the same number.
  const mult = (state.player && state.player.stats.purseKillMult) || 1;
  const v = Math.round(purseValue(e) * mult);
  const tier = purseTier(e);
  profile.runPurse = (profile.runPurse | 0) + v;
  const g = state.runCounts.gold;
  g.earned += v;
  g.kills[tier] = (g.kills[tier] || 0) + 1;
  state.runPurse = profile.runPurse;
  return v;
}
// Debit the purse if it covers `amount`. Returns true on payment. The spend
// saves immediately (shrine / paid-chest precedent) so a reload never
// resurrects gold that was already spent.
function purseSpend(amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if ((profile.runPurse | 0) < amount) return false;
  profile.runPurse = (profile.runPurse | 0) - amount;
  state.runCounts.gold.spent += amount;
  state.runPurse = profile.runPurse;
  saveProfile(profile);
  return true;
}

// ---------- ARCHES: 1-2 gates per wave at random field positions -----------
function spawnWaveArches() {
  const p = state.player;
  const n = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 120 + Math.random() * 260;
    state.arches.push(spawnArch(Math.random,
      p.x + Math.cos(a) * d, p.y + Math.sin(a) * d));
  }
}

// ---------- INTERMISSION: wave cleared via portal --------------------------
// WAVE-7/C: after the chest shopping cards, the portal presents 3
// blessing/curse cards (choices.js), rolled from a run-seeded mulberry32 so
// the offers replay deterministically for a given run. Choices are RUN-SCOPED
// (player.choices / stats only — never meta/profile) and reset by the fresh
// makePlayer() in startRun.
let interMsg = '';   // last paid-chest gamble / blessing result (overlay line)
let lastPurseFlush = 0;   // E1: sim-time stamp of the run's last periodic save

// Merchant's Pact curse: run-scoped price multiplier on the paid chests.
function shopPriceMult() {
  return (state.player.choices && state.player.choices.shopPriceMult) || 1;
}
function chestCost(def) {
  return Math.round(def.cost * shopPriceMult());
}

function openIntermission(opts = {}) {
  // WAVE-8/A: if the final boss died but the movie hasn't played yet, the
  // intermission cannot preempt it — play the movie; it re-enters here when
  // it ends. P1: this is now THE way the movie starts — the auto-start at
  // the boss kill is gone, so walking into the portal (dwell elapsed) is
  // what triggers the cinematic, exactly as the owner directive words it.
  if (state.wave.cinePending) { startPortalCine(); return; }
  state.portal = null;
  openMenu();
  state.mode = 'intermission';
  const p = state.player;
  const waveKills = p.kills - (state.wave.startKills || 0);
  // RUN-STRUCTURE: a caller that just resolved a milestone beat (the maw) owns
  // the headline and a lead line — otherwise the milestone card would be
  // overwritten by the plain "WAVE N CLEARED" copy on the very next line.
  ovTitle.textContent = opts.title || ('WAVE ' + state.wave.num + ' CLEARED');
  ovTitle.className = 'logo';
  ovSub.innerHTML =
    (opts.lead ? opts.lead + '<br>' : '') +
    `WAVE ${state.wave.num} CLEARED · survived ${Math.floor(state.time)}s` +
    ` · RUN ${runClock(state.time)} / ${runClock(C.RUN.LIMIT)}<br>` +
    `wave kills: ${waveKills} · level ${p.level} · ITEMS ${state.items.length}/${MAX_EQUIPPED}` +
    `${state.evoTokens > 0 ? ` · TOKENS ${state.evoTokens}` : ''}` +
    `<br>GOLD ${profile.runPurse | 0} (this run) · BANK ${profile.gold}${interMsg ? '<br>' + interMsg : ''}`;
  menuCard('CONTINUE', 'into wave ' + (state.wave.num + 1) + ' [C]', () => continueRun());
  for (const [tier, def] of Object.entries(PAID_CHESTS)) {
    const cost = chestCost(def);
    const el = menuCard(tier + ' CHEST',
      `${cost} gold · gamble an item (${Math.round(def.nothingChance * 100)}% nothing)` +
      (shopPriceMult() !== 1 ? ' · CURSED PRICES' : ''),
      () => buyPaidChest(tier), (profile.runPurse | 0) < cost);
    if ((profile.runPurse | 0) < cost) el.onclick = () => audio.playSfx('button');
  }
  // The wave's blessing/curse offers: rolled once per wave (re-renders after
  // a chest buy reuse the same pending set; taken ones drop off).
  if (!state.pendingChoiceOffers) {
    state.pendingChoiceOffers = rollChoices(state.wave.num, state.choiceRng || Math.random,
      state.takenChoices);
  }
  for (const offer of state.pendingChoiceOffers) {
    // Sk408 playtest: the offers STAY on screen, and one is marked ACTIVE, so
    // the pick can be changed (takeChoice swaps: it undoes the previous pick
    // before applying the new one — the blessings never stack).
    const active = !!(state.waveChoice && state.waveChoice.id === offer.id);
    menuCard(offer.title.toUpperCase() + (active ? ' [ACTIVE]' : ''),
      `${offer.rarity} BLESSING · ${offer.desc}` +
      (active ? ' · tap another offer to change' : ''),
      () => takeChoice(offer));
  }
  // WAVE-9 manual heat dial: RAISE THE STAKES pushes +1 heat (harder, faster
  // foes) and pays for it with goldMult — which tracks MANUAL pushes only.
  // Card is hidden once the ledger sits at HEAT_CAP.
  if (heatOf(state) < HEAT_CAP) {
    const nextGold = goldMult(manualPushes(state) + 1);
    menuCard('RAISE THE STAKES',
      `+1 heat: foes +${Math.round(HEAT_CURVES.HP * 100)}% hp & swarm faster · run gold x${nextGold.toFixed(2).replace(/\.?0+$/, '')}`,
      () => {
        addHeat(state, 'MANUAL_PUSH');
        interMsg = `STAKES RAISED — ${describeHeat(heatOf(state))} · run gold x${goldMult(manualPushes(state))}`;
        audio.playSfx('levelup');
        openIntermission();   // re-render: gold line + card clamps at HEAT_CAP
      });
  }
  // WAVE-22 (rev-4 item 3): intermission lands at the end of wave 1 with
  // zero onboarding — coach it ONCE (the flag makes re-renders after a chest
  // buy / stakes push silent; 'intermission' mode already freezes the sim).
  if (!tourFlag(TOUR_KEYS.intermission)) {
    startCoach([
      { id: 'inter-continue',
        text: 'Wave cleared — CONTINUE (C or Enter) heads into the next.',
        target: () => cardByTitle('CONTINUE') },
      { id: 'inter-chest',
        text: 'Paid chests gamble gold for items — real odds on the cards: 40 / 25 / 10% nothing by tier.',
        target: () => cardByTitle('BRONZE CHEST') },
      { id: 'inter-blessing',
        text: 'BLESSINGS are free run powers — take one each wave, or leave it.',
        target: () => [...ovCards.children].find(c => (c.innerHTML || '').includes('BLESSING')) || null },
      { id: 'inter-stakes',
        text: 'RAISE THE STAKES: +1 heat — harder, faster foes — buys a permanent run gold multiplier.',
        target: () => cardByTitle('RAISE THE STAKES') },
    ], TOUR_KEYS.intermission);
  }
}

// ---------- BLESSING RE-PICK (Sk408 playtest) --------------------------------
// The offers stay on screen after a pick so the choice can be CHANGED. Because
// a blessing applies arbitrary stat mutations (choices.js), a swap is done by
// restoring the choice-mutable scope captured before the FIRST pick and then
// applying the new one — so the two can never compound and the numbers are
// exactly the new offer's. The scope is exactly the fields choices.js documents
// as its contract (player.stats, player.hp, player.choices).
function snapshotChoiceScope(p) {
  return {
    stats: { ...p.stats },
    hp: p.hp,
    choices: p.choices ? { ...p.choices } : null,
  };
}
function restoreChoiceScope(p, snap) {
  for (const k of Object.keys(p.stats)) if (!(k in snap.stats)) delete p.stats[k];
  Object.assign(p.stats, snap.stats);
  p.hp = Math.min(snap.hp, p.stats.maxHp);
  p.choices = snap.choices ? { ...snap.choices } : null;
}

function takeChoice(offer) {
  const p = state.player;
  if (state.waveChoice) {
    // Changing the pick: undo the previous blessing first, and un-take its id
    // so the pool can offer it again on a later wave.
    if (state.waveChoiceSnap) restoreChoiceScope(p, state.waveChoiceSnap);
    state.takenChoices = state.takenChoices.filter(id => id !== state.waveChoice.id);
  } else {
    state.waveChoiceSnap = snapshotChoiceScope(p);
  }
  applyChoice(p, offer);
  if (!state.takenChoices.includes(offer.id)) state.takenChoices.push(offer.id);
  state.waveChoice = offer;
  // Merchant's Pact: weaponSlotBonus widens the per-run slot cap (bounded by
  // the absolute CONFIG cap) — recomputed from the restored scope, so a swap
  // away from the Pact narrows it again.
  const bonus = (p.choices && p.choices.weaponSlotBonus) || 0;
  // G11: the ceiling is the run's weaponCap (a challenge mode may lower it).
  state.weaponSlots = Math.min(state.weaponCap, state.baseWeaponSlots + bonus);
  interMsg = `BLESSING: ${offer.title} — ${offer.desc} · tap another offer to change it`;
  audio.playSfx('levelup');
  openIntermission();   // re-render: offers + gold line refresh
}

function buyPaidChest(tier) {
  const def = PAID_CHESTS[tier];
  const cost = chestCost(def);
  // E1: paid chests debit the RUN PURSE, never the bank (owner: "runs should
  // spend earned gold for shrines and merchants" — the intermission's paid
  // chests are in-run spending that exists today). loot.js's rollPaidChest
  // takes a { gold } wallet, so hand it a purse VIEW: loot.js stays untouched
  // and the bank is never in scope here.
  if ((profile.runPurse | 0) < cost) return;
  const wallet = { gold: profile.runPurse | 0 };
  const res = rollPaidChest(wallet, tier);
  if (!res.ok) return;
  profile.runPurse = wallet.gold;
  // rollPaidChest debits the BASE cost; the Merchant's Pact surcharge is
  // taken here so loot.js stays untouched.
  profile.runPurse -= cost - def.cost;
  state.runCounts.gold.spent += cost;
  state.runPurse = profile.runPurse;
  saveProfile(profile);
  if (res.gambled === 'item' && res.item) {
    const it = res.item;
    const msg = applyEquipDecision(it);
    interMsg = msg
      ? `CHEST: ${msg} (${it.affixes.map(a => a.name).join(', ')})`
      : `CHEST: ${it.name} LEFT BEHIND — the belt is stronger`;
  } else {
    interMsg = 'THE CHEST WAS EMPTY... ' + res.debited + ' gold gone';
  }
  audio.playSfx('chest');
  openIntermission();   // re-render: gold balance + dim states refresh
}

function continueRun() {
  const p = state.player;
  // G9 FOLLOW-UP: the wave that just ENDED is "untouched" when nothing landed
  // on the hero during it. Reaching CONTINUE means the wave was finished (the
  // portal only opens on a clear), so this is the completion seam. The
  // `state.time > 0` guard keeps a hypothetical cold-start call from banking a
  // wave that was never played.
  if (state.time > 0 && !state.runCounts.waveTookDamage) state.runCounts.untouchedWave = true;
  state.runCounts.waveTookDamage = false;   // fresh ledger for the wave ahead
  state.wave.num++;
  state.wave.endsAt = state.time + C.ESCALATION.WAVE_LENGTH;
  // WAVE-20: a fresh herald appointment for the new wave (the portal sweep
  // already cleared any survivor of the last one).
  state.wave.midAt = state.time + C.ESCALATION.WAVE_LENGTH * (1 - C.ESCALATION.MIDBOSS.AT_FRACTION);
  state.wave.midBossDone = false;
  state.wave.midBosses = [];
  state.wave.startKills = p.kills;
  state.wave.bosses = [];
  state.wave.boss = null;
  state.portal = null;
  state.pendingChoiceOffers = null;   // next wave rolls a fresh set
  state.waveChoice = null;            // ...and a fresh pick (Sk408 playtest)
  state.waveChoiceSnap = null;
  // WAVE-11: fresh shrine roll for the new wave (0-based waveNum; the shrine
  // rng stream keeps this off the intermission choice rolls).
  state.shrine = rollShrine(state.wave.num - 1, state.shrineRng);
  interMsg = '';
  spawnWaveArches();
  state.mode = 'playing';
  overlay.style.display = 'none';
  // WAVE-9B/2: announce the AREA change with the wave — the theme ladder in
  // CONFIG.GROUND.THEMES cycles by wave number (render.js groundTheme).
  toast('WAVE ' + state.wave.num + ' - ' + C.GROUND.THEMES[(state.wave.num - 1) % C.GROUND.THEMES.length].name);
}

// ---------- BOSS: spawns on wave expiry; timer pauses while any lives --------
// WAVE-7/B: the named cast (bosses.js) replaces the generic brute-elite.
// pickBossForWave(wave) returns 1 descriptor, or 2 DISTINCT ones on waves
// divisible by 3 (the EVENT waves) — base stats multiply CONFIG.ESCALATION.
// BOSS exactly as hb6's header specifies (never hardcoded in the module).
function spawnBoss() {
  const B = C.ESCALATION.BOSS;
  const w = Math.floor(state.time / 30);
  const cast = pickBossForWave(state.wave.num);
  state.wave.bosses = [];
  cast.forEach((desc, i) => {
    const a = Math.random() * Math.PI * 2 + (i / cast.length) * Math.PI * 2;
    const d = C.ENEMY.SPAWN_DIST * 0.7;
    const boss = makeTypedEnemy('BRUTE',
      state.player.x + Math.cos(a) * d,
      state.player.y + Math.sin(a) * d,
      state.time, { elite: true });
    escalate(boss, state.time);
    const hp = C.ENEMY.BASE_HP * ladderHp(w) *
      (B.HP_MULT_BASE + B.HP_MULT_PER_WAVE * state.wave.num) * desc.hpMult *
      heatMultipliers(heatOf(state)).hp;   // WAVE-9: bosses take the heat too
    boss.hp = hp;
    boss.maxHp = hp;
    boss.w = Math.round(boss.w * B.SIZE_MULT * desc.sizeMult);
    boss.h = Math.round(boss.h * B.SIZE_MULT * desc.sizeMult);
    boss.speed *= B.SPEED_MULT * desc.speedMult;
    boss.contactDamageMult = (boss.contactDamageMult || 1) * (desc.contactDamageMult || 1);
    boss.xp = C.ENEMY.BASE_XP * ladderXp(w) * B.XP_KILLS;  // worth ~10 kills
    boss.boss = true;
    boss.bossId = desc.id;          // decideBossAction dispatch key
    // G10 encounters: a boss the player has SEEN is encountered — recorded at
    // spawn (never the kill funnel), so a fled-from boss still fills the guide.
    recordEncounter(profile, 'boss:' + desc.id,
      { wave: Math.floor(state.time / 30), at: state.time });
    boss.name = desc.name;          // announce + HUD
    boss.flavor = desc.flavor;
    boss.bossSprite = desc.sprite;  // render.js draws this grid (BOSS_SPRITES)
    boss.age = 0;                   // pattern brains phase off age
    state.enemies.push(boss);
    state.wave.bosses.push(boss);
  });
  // Named announce: BOTH names on double waves (3/6/9 — the events).
  toast(cast.map(b => b.name).join(' + ') + (cast.length > 1 ? ' APPROACH!' : ' APPROACHES!'));
  // WAVE-14 boss-arrival overlay (render.js drawBossBanner): cinematic
  // letterbox + name + flavor sub-line, ~2.5s. The BOSS_YELL portal sting is
  // the reusable cinematic seam (audio.js — no new audio invented).
  state.bossBanner = {
    // TWO-LINE BANNER: the names own line 1 (one per boss), the verb line 2.
    names: cast.map(b => b.name),
    verb: cast.length > 1 ? 'APPROACH' : 'APPROACHES',
    title: cast.map(b => b.name).join(' + ') + (cast.length > 1 ? ' APPROACH' : ' APPROACHES'),
    sub: cast.length > 1
      ? cast.map(b => b.flavor.toUpperCase()).join(' / ')
      : cast[0].flavor.toUpperCase(),
    ttl: 2.5,
  };
  audio.playPortalCue('BOSS_YELL');
  easeToBossStance();       // BOSS_STANCE: the banner owns the screen; see CONFIG
}

// ---------- WAVE-20 MID-WAVE BOSS: VYRN, THE HERALD --------------------------
// Spawns once per wave at the AT_FRACTION point (main.js wave-timer seam).
// Kept STRICTLY out of state.wave.bosses: that array owns the end-cast
// semantics (HUD 'BOSS!' line, wave-timer pause, pendingClear/portal payout,
// the portal cine) and the smoke probes — the herald must not shift any of
// them. Its own payout (chest + weapon XP, NO portal) rides the midBoss stamp
// in the death loop. Chassis: a CHASER re-stamped like spawnBoss does, with
// stats from ESCALATION.MIDBOSS (NOT the BOSS block) — contact 1 base and a
// speed tuned ABOVE the player's so it runs the pilot down.
function spawnMidBoss() {
  const M = C.ESCALATION.MIDBOSS;
  const w = Math.floor(state.time / 30);
  const desc = MIDBOSS.HERALD;
  const a = Math.random() * Math.PI * 2;
  const d = C.ENEMY.SPAWN_DIST * 0.7;
  const boss = makeTypedEnemy('CHASER',
    state.player.x + Math.cos(a) * d,
    state.player.y + Math.sin(a) * d,
    state.time);
  escalate(boss, state.time);
  const hp = C.ENEMY.BASE_HP * ladderHp(w) *
    (M.HP_MULT_BASE + M.HP_MULT_PER_WAVE * state.wave.num) * desc.hpMult *
    heatMultipliers(heatOf(state)).hp;
  boss.hp = hp;
  boss.maxHp = hp;
  boss.w = Math.round(boss.w * M.SIZE_MULT * desc.sizeMult);
  boss.h = Math.round(boss.h * M.SIZE_MULT * desc.sizeMult);
  // Speed stays the makeTypedEnemy linear curve (BASE_SPEED * (1+0.05w)) —
  // SPEED_MULT pushes it above the player's 60px/s at every wave.
  boss.speed *= M.SPEED_MULT;
  boss.contactDamageMult = M.CONTACT_MULT;
  boss.xp = C.ENEMY.BASE_XP * ladderXp(w) * M.XP_KILLS;
  boss.boss = true;               // routes through decideBossAction
  boss.bossId = desc.id;
  // G10 encounters: the MIDBOSS path stamps bossId too — both boss sources
  // (pickBossForWave AND the herald) record through the same spawn seam.
  recordEncounter(profile, 'boss:' + desc.id,
    { wave: Math.floor(state.time / 30), at: state.time });
  boss.midBoss = true;            // payout + census distinguisher
  boss.name = desc.name;
  boss.flavor = desc.flavor;
  boss.bossSprite = desc.sprite || null;
  boss.age = 0;                   // ring/burst phases key off age
  state.enemies.push(boss);
  state.wave.midBosses.push(boss);
  toast(desc.name + ' APPROACHES!');
  state.bossBanner = {
    names: [desc.name], verb: 'APPROACHES',
    title: desc.name + ' APPROACHES', sub: desc.flavor.toUpperCase(), ttl: 2.5,
  };
  audio.playPortalCue('BOSS_YELL');
  easeToBossStance();       // BOSS_STANCE: same ease for the mid-wave herald
}

// ---------- WAVE-11 SYNERGIES (synergies.js; weapons.js stays untouched) -----
// Derived state: re-evaluated on every weapon change (grant/evolve/run start).
function refreshSynergies() {
  const prev = state.synergyNames || new Set();
  state.synergies = detectSynergies(state.weapons);
  state.synergyNames = new Set(state.synergies.map(s => s.name));
  for (const s of state.synergies) {
    if (!prev.has(s.name)) {
      const d = describeSynergy(s);
      toast('SYNERGY: ' + d.name.toUpperCase() + ' — ' + d.desc);
      audio.playSfx('levelup');
    }
  }
}

// ===========================================================================
// WAVE-26 FEATURE 2 — DRAFT SYNERGY HINTS
// The draft IS the game in an auto-battler, so it is the main knowledge
// surface. A draft card earns a hint ONLY when the pick would create a pair
// the RUN ACTUALLY IMPLEMENTS — detectSynergies is the single source of truth
// (the same call refreshSynergies makes), and every flag in the table is
// wired in the weapon loop. No real synergy -> no hint at all: no filler, and
// never a promise of an effect the code does not deliver.
//
//   - a NEW WEAPON card hints when one of its partners is already equipped
//     ("PAIRS WITH BEAM · SUPERCONDUCTOR");
//   - a LEVEL-UP card hints only while its weapon is part of a LIVE pair
//     ("THRESHING STORM LIVE · ZAP") — otherwise silence.
// ===========================================================================
function synergyHintForCard(card) {
  const id = (card && card.id) || '';
  // Card ids are 'wpn_<TYPE>' for a grant and 'lvl_<TYPE>_<level>' for a
  // level-up. The level suffix is stripped explicitly (a greedy [A-Z_]+ match
  // would swallow the trailing '_' and miss multi-word types like NOVA_PULSE).
  let kind = null, type = null;
  let m = /^wpn_(.+)$/.exec(id);
  if (m) { kind = 'wpn'; type = m[1]; }
  else {
    m = /^lvl_(.+)_\d+$/.exec(id);
    if (m) { kind = 'lvl'; type = m[1]; }
  }
  if (!kind || !WEAPON_NAMES[type]) return null;    // not a real archetype card
  const owned = state.weapons.map(w => w.type);
  if (kind === 'wpn') {
    if (owned.includes(type)) return null;
    const live = new Set((state.synergies || detectSynergies(owned)).map(s => s.name));
    for (const s of detectSynergies([...owned, type])) {
      if (live.has(s.name) || !s.pair.includes(type)) continue;
      const partner = s.pair[0] === type ? s.pair[1] : s.pair[0];
      return 'PAIRS WITH ' + (WEAPON_NAMES[partner] || partner) + ' · ' + s.name.toUpperCase();
    }
    return null;
  }
  // Level-up card: only meaningful while the weapon is in a live synergy.
  const live = state.synergies || detectSynergies(owned);
  for (const s of live) {
    if (!s.pair.includes(type)) continue;
    const partner = s.pair[0] === type ? s.pair[1] : s.pair[0];
    return s.name.toUpperCase() + ' LIVE · ' + (WEAPON_NAMES[partner] || partner);
  }
  return null;
}

// Active flag probe: the value of `flag` from any live synergy, else null.
function syn(flag) {
  for (const s of state.synergies || []) {
    if (flag in s.flags) return s.flags[flag];
  }
  return null;
}

function nearestFoe(x, y, exclude) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (exclude && exclude.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// weapons.js damage convention for the supplemental bolts/blasts below:
// damage * archetype MULT * level dmgMult * loot damageMult * arch (BERSERK)
// * evolution mult. The arch term MUST match weapons.js dmgScale: without it,
// every synergy bolt (zap fork, scythe zap, nova/mine/beam detonations) missed
// BERSERK while the base weapons got it.
function synWeaponDmg(weaponId, mult) {
  const w = state.weapons.find(k => k.type === weaponId);
  const P = weaponLevelParams(weaponId, (w && w.level) || 1);
  const evo = w && w.evolution && w.evolution.affixes;
  return state.player.stats.damage * mult * (P.dmgMult || 1) *
    (state.player.stats.damageMult || 1) * (activeArchMods(state).damageMult || 1) *
    ((evo && evo.damageMult) || 1);
}

// Mine detonation from OUTSIDE weapons.js (Chain Reaction / Fire Focus):
// mirrors weapons.js detonateMine (damage, blast radius, blast + shrapnel
// payloads), minus its evolution chain rule.
function detonateMineAt(mine) {
  const p = state.player;
  const w = state.weapons.find(k => k.type === 'MINE');
  const P = weaponLevelParams('MINE', (w && w.level) || 1);
  const blast = (P.blast || WEAPONS.MINE.BLAST) *
    (((w && w.evolution && w.evolution.flags) || []).includes('bigBoom') ? 1.5 : 1);
  const dmg = synWeaponDmg('MINE', WEAPONS.MINE.DAMAGE_MULT);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - mine.x, e.y - mine.y) <= blast) {
      let d = dmg;
      if ((p.stats.crit || 0) > 0 && Math.random() < p.stats.crit) d *= (p.stats.critMult || 1.5);
      e.hp -= d; e.flash = 0.08;
      state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.12 });
    }
  }
  state.effects.push({ kind: 'mine_blast', x: mine.x, y: mine.y, radius: blast,
    shrapnel: WEAPONS.MINE.SHRAPNEL, age: 0, ttl: 0.35 });
  const i = state.projectiles.indexOf(mine);
  if (i >= 0) state.projectiles.splice(i, 1);
}

// Superconductor (ZAP+BEAM): each fired chain zap throws an EXTRA fork chain
// of zapExtraForks jumps — a supplemental bolt walking nearest-first from the
// player, damage continuing the level-falloff curve past the base jump count.
function synergyZapFork(zw) {
  const extra = syn('zapExtraForks') || 0;
  const p = state.player;
  const P = weaponLevelParams('ZAP', zw.level);
  const baseDmg = synWeaponDmg('ZAP', WEAPONS.ZAP.DAMAGE_MULT);
  const points = [{ x: p.x, y: p.y }];
  const hit = new Set();
  let from = p;
  for (let k = 0; k < extra; k++) {
    const tgt = nearestFoe(from.x, from.y, hit);
    if (!tgt || Math.hypot(tgt.x - from.x, tgt.y - from.y) > WEAPONS.ZAP.CHAIN_RANGE) break;
    hit.add(tgt);
    tgt.hp -= baseDmg * Math.pow(WEAPONS.ZAP.FALLOFF, (P.jumps || WEAPONS.ZAP.JUMPS) + 1 + k);
    tgt.flash = 0.08;
    points.push({ x: tgt.x, y: tgt.y });
    from = tgt;
  }
  if (points.length > 1) state.effects.push({ kind: 'zap', points, age: 0, ttl: 0.15 });
}

// Gravity Well (NOVA+ORBIT) + Chain Reaction (NOVA+MINE), on each nova fire.
function synergyOnNova(nw) {
  const p = state.player;
  const P = weaponLevelParams('NOVA_PULSE', nw.level);
  const radius = (P.radius || WEAPONS.NOVA_PULSE.RADIUS) *
    (((nw.evolution && nw.evolution.flags) || []).includes('bigBoom') ? 1.5 : 1);
  const pull = syn('novaPull');
  if (pull) {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= radius) {
        e.x += (p.x - e.x) * pull;   // drag inward by the flag fraction —
        e.y += (p.y - e.y) * pull;   // feeds the orbit blades
      }
    }
  }
  if (syn('novaDetonatesMines')) {
    const mines = state.projectiles.filter(m => m.kind === 'mine' &&
      Math.hypot(m.x - p.x, m.y - p.y) <= radius);
    for (const m of mines) detonateMineAt(m);   // copy — detonateMineAt splices
  }
}

// Fire Focus (MINE+BEAM): a fired beam cooks off every mine inside its lane
// (aim recomputed — weapons.js picks the same deterministic nearest target).
function synergyBeamDetonate(bw) {
  const p = state.player;
  const t = nearestFoe(p.x, p.y);
  if (!t) return;
  const P = weaponLevelParams('BEAM', bw.level);
  const width = (P.width || WEAPONS.BEAM.WIDTH) *
    (((bw.evolution && bw.evolution.flags) || []).includes('solarFlare') ? 1.3 : 1);
  const lanes = ((bw.evolution && bw.evolution.flags) || []).includes('prismSplit')
    ? [-0.35, 0, 0.35] : [0];
  const base = Math.atan2(t.y - p.y, t.x - p.x);
  for (const off of lanes) {
    const cx = Math.cos(base + off), cy = Math.sin(base + off);
    const mines = state.projectiles.filter(m => {
      if (m.kind !== 'mine') return false;
      const rx = m.x - p.x, ry = m.y - p.y;
      const along = rx * cx + ry * cy;
      return along >= 0 && along <= WEAPONS.BEAM.LENGTH &&
        Math.abs(rx * cy - ry * cx) <= width / 2 + 4;
    });
    for (const m of mines) detonateMineAt(m);   // copy — detonateMineAt splices
  }
}

// Threshing Storm (SCYTHE+ZAP): each LANDED sweep (a fresh scythe_arc effect)
// lashes the nearest foe from the arc's edge at 50% zap falloff.
function synergyScytheZap() {
  for (const fx of state.effects) {
    if (fx.kind !== 'scythe_arc' || fx.zapped) continue;
    fx.zapped = true;
    const ex = fx.x + Math.cos(fx.dir) * fx.radius;
    const ey = fx.y + Math.sin(fx.dir) * fx.radius;
    const t = nearestFoe(ex, ey);
    if (!t) continue;
    t.hp -= synWeaponDmg('ZAP', WEAPONS.ZAP.DAMAGE_MULT) * 0.5;   // 50% falloff
    t.flash = 0.08;
    state.effects.push({ kind: 'zap', points: [{ x: ex, y: ey }, { x: t.x, y: t.y }],
      age: 0, ttl: 0.15 });
  }
}

// Bloodhound Rang (BOOMERANG+SEEKER): the return leg steers toward the
// nearest survivor at SEEKER turn rate * 0.5 (weak homing, post-tick step).
function synergyBoomerangHoming(dt) {
  const p = state.player;
  const turn = WEAPONS.SEEKER.TURN * 0.5 * dt;
  for (const pr of state.projectiles) {
    if (pr.kind !== 'boomerang' || pr.phase !== 'back') continue;
    const t = nearestFoe(pr.x, pr.y);
    if (!t) continue;
    const cur = Math.atan2(p.y - pr.y, p.x - pr.x);   // heading: home
    const want = Math.atan2(t.y - pr.y, t.x - pr.x);  // desired: the mark
    const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const ang = cur + Math.max(-turn, Math.min(turn, diff));
    pr.x += Math.cos(ang) * WEAPONS.BOOMERANG.SPEED * dt;
    pr.y += Math.sin(ang) * WEAPONS.BOOMERANG.SPEED * dt;
  }
}

// Post-tick pass: fire-event hooks (a cd/fires reset means the weapon fired)
// + the continuous flags.
function wireSynergies(dt, preFire) {
  if (!state.synergies || state.synergies.length === 0) return;
  for (const w of state.weapons) {
    const before = preFire && preFire.get(w);
    if (!before) continue;
    const fired = (w.fires || 0) > before.fires || w.cd > before.cd;
    if (!fired) continue;
    if (w.type === 'ZAP' && syn('zapExtraForks')) synergyZapFork(w);
    if (w.type === 'NOVA_PULSE' && (syn('novaPull') || syn('novaDetonatesMines'))) synergyOnNova(w);
    if (w.type === 'BEAM' && syn('beamDetonatesMines')) synergyBeamDetonate(w);
  }
  if (syn('scytheArcZap')) synergyScytheZap();
  if (syn('boomerangHoming')) synergyBoomerangHoming(dt);
}

// ---------- Update ----------
function update(dt) {
  const p = state.player;
  state.time += dt;
  // RUN-STRUCTURE: the clock + the RUN SURVIVED win, checked before any damage
  // this frame can resolve. Reaching the limit is a victory, not a death.
  if (checkRunLimit()) return;
  if (p.invuln > 0) p.invuln -= dt;

  // Weather: advance the particle field; grab this frame's modifiers.
  updateWeather(state, state.weather, dt);
  const wm = weatherMods(state.weather);
  // Active arch mods (arches.js): rate/pickup/damage/speed multipliers the
  // run loops below consume; shield absorbs handled via state.shieldAbsorbs.
  const am = activeArchMods(state);

  runController(p, dt, am);
  // Arches: trigger gates the player walks under + tick buff timers.
  for (const ev of tickArches(state, dt)) {
    if (ev.kind === 'archGranted') {
      toast(ev.name.toUpperCase() + '! ' + ev.duration + 's');
      if (ev.shieldHits) state.shieldAbsorbs = ev.shieldHits;
      audio.playSfx('levelup');
    } else if (ev.kind === 'archRefreshed') {
      toast('ARCH REFRESHED');
      if (ev.type === 'SHIELD') state.shieldAbsorbs = ARCH_TYPES.SHIELD.shieldHits;
    } else if (ev.kind === 'archExpired') {
      if (ev.type === 'SHIELD') state.shieldAbsorbs = 0;
    }
  }
  if (state.portal) {
    // P1: the portal LINGERS. The chase is deleted — a one-way drift at
    // C.PORTAL.APPROACH eases it toward the player and PARKS on the
    // STANDOFF ring (24px); it never advances closer on its own, so entry
    // (< RADIUS) is the player's/pilot's deliberate act. The AutoPilot
    // closes that last gap itself now (src/controllers.js portal
    // exception), which is what the chase used to guarantee.
    const po = state.portal;
    po.age += dt;
    // P1 R3: approach invulnerability, AUTO ONLY. Gated on pilotMovesYou()
    // — the ONE movement-authority predicate (see :428) — so AUTO_ALL and
    // AUTO_MOVE (both pilot-steered) get the bounded window and MANUAL
    // gets nothing, ever. Reuses p.invuln and the render.js blink; no
    // second tell, no new machinery. Math.max never clips a longer
    // combat-granted window; it lapses naturally when the portal closes.
    if (!pilotMovesYou()) p.invuln = Math.max(p.invuln, C.PORTAL.INVULN);
    if (po.entering) {
      // P1 R4: the dwell beat — a dt-based hold on contact so the crossing
      // reads instead of teleporting. The 1e-9 epsilon makes the accumulate-
      // and-compare land on the EXACT frame at both 60Hz and 120Hz (48 x
      // 1/120 sums to 0.39999... in doubles, which would otherwise hold one
      // extra 120Hz frame); it is 6 orders below any visible timescale.
      po.enterT += dt;
      if (po.enterT >= C.PORTAL.DWELL - 1e-9) { openIntermission(); return; }
    } else {
      const dx = p.x - po.x, dy = p.y - po.y;
      const len = Math.hypot(dx, dy);
      if (len < C.PORTAL.RADIUS) {
        po.entering = true;
        po.enterT = 0;
      } else if (len > C.PORTAL.STANDOFF) {
        // One-way approach: the step never overshoots the standoff ring.
        const step = Math.min(C.PORTAL.APPROACH * dt, len - C.PORTAL.STANDOFF);
        po.x += (dx / len) * step;
        po.y += (dy / len) * step;
      }
    }
  }
  spawnWave(dt);
  // Wave timer: countdown to the boss(es); the timer PAUSES while any boss
  // lives or the portal is open; the next wave starts at the intermission
  // CONTINUE (portal walk-in), not at boss death.
  state.wave.boss = (state.wave.bosses || []).find(b => b.hp > 0) || null;
  if (!state.wave.boss && !state.portal && state.time >= state.wave.endsAt) spawnBoss();
  // WAVE-20: the HERALD fires once per wave at the mid-point. It does NOT
  // pause the end-boss timer above (kiting the herald until the wave boss
  // arrives is legitimate — and lethal) and never re-fires after death.
  // RUN-STRUCTURE: the herald is the mid-wave CADENCE beat — every wave through
  // the maw milestone (the shipped cadence, untouched), then alternating waves
  // so a 30:00 run has texture instead of a metronome. See config.ladderBeats.
  if (ladderBeats(state.wave.num).herald &&
      !state.wave.midBossDone && !state.portal && state.time >= state.wave.midAt) {
    state.wave.midBossDone = true;
    spawnMidBoss();
  }
  updateResources(p, dt);
  // Meta Mana Spring bonus (applyMetaBonuses adds stats.manaRegen) + the
  // MOONLIGHT weather bonus (see weather.js — now a FLAT trickle).
  const regenBonus = (p.stats.manaRegen ?? C.MANA.REGEN) - C.MANA.REGEN;
  if (regenBonus > 0) p.mana = Math.min(p.stats.maxMana, p.mana + regenBonus * dt);
  if (wm.manaRegenFlat) {
    // Was a x1.1 multiplier on BASE regen, which is now 0.5/s — a multiplier
    // there is 0.05/s, i.e. dead. A flat grant stays meaningful at every stage,
    // including a fresh save that owns no Mana Spring.
    p.mana = Math.min(p.stats.maxMana, p.mana + wm.manaRegenFlat * dt);
  }
  // G8 step 4: Regrowth's HP regen lives in ONE helper (perks.js applyRegrowth)
  // called from BOTH resource seams — this one and updateFinale's — so there is
  // never a third copy. dt-scaled: 60Hz and 120Hz are both exact.
  applyRegrowth(state, dt);
  // WAVE-28 AUTO-DRINK: the pilot's potion hand (CONFIG.AUTOPILOT.AUTO_DRINK).
  // Sits AFTER every resource grant of the frame so it reads the live HP/mana,
  // and reads/writes NOTHING but potions (it cannot touch the stance, so the
  // BOSS_STANCE ease and the kite/retreat decision are untouched).
  autoDrinkPotions(state, dt);
  // N1b item 8 AUTO-CAST: the pilot's cast hand (CONFIG.AUTOPILOT.AUTO_CAST).
  // After the drinks: survival spending first, then casts read the refreshed
  // pool — the same ordering a manual player's frame effectively has.
  autoCastSkills(state);
  // N1 slice 2: the drafted Pocket Frost card fires its nova in this same
  // frame region (pay-only-when-you-can; ONE cooldown, p.skillCd.FROST_NOVA).
  frostCardTick(state, dt);
  // N1 slice 3: the ults' per-frame windows (AFTERIMAGE phantoms, the
  // CONSECRATION field ticks) tick here beside the cast hand.
  updateUlts(state, dt);
  // WAVE-11 SYNERGIES: snapshot each weapon's fire state, tick the weapons,
  // then hook the active flags onto whatever just fired.
  const preFire = new Map();
  for (const w of state.weapons) preFire.set(w, { cd: w.cd, fires: w.fires || 0 });
  updateWeapons(state, state.weapons, dt);
  wireSynergies(dt, preFire);

  // WIND drift pushes every projectile mid-flight (both sides — fairness).
  const wd = windDrift(state.weather);

  // Projectiles: volley shots only — kind-tagged bodies (boomerang / seeker /
  // mine) are owned and moved by weapons.js (they have no vx/vy).
  // NOVA_SHOT evolution: crit/critMult affixes are per-weapon additive on the
  // volley's hits; `novaRounds` detonates a micro-nova on every volley kill.
  const volleyEvo2 = (() => { const w = state.weapons.find(x => x.type === 'VOLLEY'); return w && w.evolution; })();
  const evoCrit = (p.stats.crit || 0) + ((volleyEvo2 && volleyEvo2.affixes.crit) || 0);
  const evoCritMult = (p.stats.critMult || 1.5) + ((volleyEvo2 && volleyEvo2.affixes.critMult) || 0);
  const novaRounds = !!(volleyEvo2 && volleyEvo2.flags.includes('novaRounds'));
  for (const pr of state.projectiles) {
    if (pr.kind) continue;
    pr.age += dt;
    // Orbital Volley (VOLLEY+ORBIT synergy): the shot loops one full orbit
    // around the player before screaming off down its aim lane.
    if (pr.orbit) {
      const pc = state.player;
      pr.orbit.t += dt;
      const ang = pr.orbit.ang + pr.orbit.t * (Math.PI * 2 / pr.orbit.dur);
      pr.x = pc.x + Math.cos(ang) * 26;
      pr.y = pc.y + Math.sin(ang) * 26;
      if (pr.orbit.t >= pr.orbit.dur) {
        pr.x = pc.x + Math.cos(pr.orbit.ang) * 26;   // release along the aim
        pr.y = pc.y + Math.sin(pr.orbit.ang) * 26;
        pr.orbit = null;
      }
    } else {
      pr.x += pr.vx * dt + wd.x * dt; pr.y += pr.vy * dt;
    }
    for (const e of state.enemies) {
      if (pr.hit.has(e) || e.hp <= 0) continue;
      if (Math.abs(pr.x - e.x) < 7 && Math.abs(pr.y - e.y) < 7) {
        // Crit roll per hit (Deadly Aim + Keen Eye items; crits deal
        // dmg * critMult) + Vampiric lifesteal heals a fraction of damage.
        let dmg = pr.damage;
        if (evoCrit > 0 && Math.random() < evoCrit) {
          dmg *= evoCritMult;
          state.effects.push({ kind: 'hit_spark', x: pr.x, y: pr.y - 3, age: 0, ttl: 0.15 });
        }
        e.hp -= dmg; e.flash = 0.08; pr.hit.add(e); audio.playSfx('hit');
        if ((p.stats.lifesteal || 0) > 0) {
          p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal);
        }
        // NOVA_SHOT `novaRounds`: a volley kill bursts a micro-nova (half
        // damage to everything within 24px of the kill point).
        if (novaRounds && e.hp <= 0) {
          for (const o of state.enemies) {
            if (o === e || o.hp <= 0) continue;
            if (Math.hypot(o.x - pr.x, o.y - pr.y) <= 24) { o.hp -= dmg * 0.5; o.flash = 0.08; }
          }
          state.effects.push({ kind: 'nova_pulse', x: pr.x, y: pr.y, radius: 24, age: 0, ttl: 0.2 });
        }
        // Animation pass: small hit-spark burst on every projectile hit.
        state.effects.push({ kind: 'hit_spark', x: pr.x, y: pr.y, age: 0, ttl: 0.12 });
        if (pr.hit.size > pr.pierce) pr.age = 99;
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter(pr => pr.kind || pr.age < 3);

  // Enemies: typed behavior via enemy_types decide() — movement intents are
  // applied at enemy.speed; fire intents become enemy projectiles. Frost Nova
  // slow multiplies move speed. Contact damage scales per type AND with the
  // ESCALATION damage curve. WAVE-7/B: named bosses run bosses.js deciders
  // (decideBossAction) whose extra intents — fan / summon / nova / teleport /
  // charging / recovering — are wired below; the old generic novaCd/summonCd
  // timers are gone (Pyraxis and the Choir Mother own those behaviors now).
  // G20a: a stage's dmgMult rides the SAME threat curve every enemy-damage
  // path below already multiplies (projectiles, novas, contact) — one seam,
  // guarded so the default stage (1.0) is byte-identical.
  // OWNER enemy buff: damage SQUARED. The square is on C.ENEMY.BASE_CONTACT (see
  // config.js POWER), so this multiplier stays linear and heat's own damage
  // contract is unchanged.
  const dmgMult = ladderDmg(Math.floor(state.time / 30)) *
    heatMultipliers(heatOf(state)).damage * (stageMods(state.stage).dmgMult || 1);
  // WAVE-20 death-cause tracking (tools/boss_sim.mjs reads state.deathBy):
  // every damage path stamps the source right before die() can fire.
  const shotSrc = (e) => ({ typeId: e.typeId, bossId: e.bossId || null, name: e.name || null, midBoss: !!e.midBoss });
  let touchDmg = 0, touchKiller = null;
  // SURVIVAL-GAP: TICK latches. The drain is a flat 4 hp/s per tick with NO
  // invuln window, so N latched ticks stack linearly and a fresh save bled out
  // in ~4-8s (measured: 2 of 12 fresh runs died to TICK at t=68-79s, before any
  // boss). The latch itself stays (it is the TICK's identity); the BLEED is
  // capped at MAX_DRAIN_TICKS simultaneous drains, so a pack grips and slows
  // you but cannot execute you off-screen.
  let drainActive = 0;
  for (const e of state.enemies) {
    e.age = (e.age || 0) + dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    const spd = e.speed * (e.slow > 0 ? C.SKILLS.FROST_NOVA.SLOW_FACTOR : 1) *
      (wm.enemySpeedMult || 1);      // SNOW: the horde trudges
    const act = e.boss ? decideBossAction(e, p, state, dt) : decideEnemyAction(e, p, dt);
    // RAIN shortens shooters' effective range (fairness-safe: intercept the
    // fire intent at the adjusted per-type range).
    if (act.fire && wm.fireRangeMult && wm.fireRangeMult !== 1) {
      const baseRange = (ENEMY_TYPES[e.typeId] || {}).fireRange || Infinity;
      if (Math.hypot(p.x - e.x, p.y - e.y) > baseRange * wm.fireRangeMult) act.fire = null;
    }
    e.telegraph = !!act.telegraph;   // WARLOCK/boss windup -> render flash
    e.charging = !!act.charging;     // GRAVELMAW contact-damage window
    e.recovering = !!act.recovering; // GRAVELMAW punish window
    e.x += act.mx * spd * dt;
    e.y += act.my * spd * dt;
    // TICK latch: once attached it rides the player and drains hp/s INSTEAD
    // of contact damage (its contactDamageMult is 0) until killed.
    if (act.attach) {
      e.attached = true;
      // Snap-ride the player (fast follow; the tick itself stopped moving).
      e.x += (p.x - e.x) * Math.min(1, dt * 10);
      e.y += (p.y - e.y) * Math.min(1, dt * 10);
      // SURVIVAL-GAP: only MAX_DRAIN_TICKS latched ticks bleed at once; the
      // rest still ride (and still have to be killed). See CONFIG.SURVIVAL.
      if (drainActive < C.SURVIVAL.MAX_DRAIN_TICKS) {
        drainActive++;
        p.hp -= damageTakenFortified(state, act.drain * dt);   // DoT: no invuln, just bleed (THICK SKIN funnel; N1 slice 3 FORTIFY-aware)
        state.runCounts.waveTookDamage = true;   // G9: a hit landed this wave
        resetRampage();              // WAVE-11: ANY hp loss ends the streak
        if (p.hp <= 0) { lastDamageSource = { ...shotSrc(e), cause: 'drain' }; die(); return; }
      }
    }
    if (act.fire) {
      state.enemyShots.push({
        x: e.x, y: e.y,
        vx: act.fire.dx * act.fire.speed, vy: act.fire.dy * act.fire.speed,
        damage: act.fire.damage * dmgMult, age: 0,
        kind: e.typeId === 'WARLOCK' ? 'bolt' : 'spit',   // render variant
        src: shotSrc(e),   // WAVE-20 death-cause tracking
      });
    }
    // CHOIR MOTHER hymn / HERALD rifle burst: a fan of fire-intents around
    // the aim direction — wire exactly like `fire`, one projectile each.
    if (act.fan) {
      for (const f of act.fan) {
        state.enemyShots.push({
          x: e.x, y: e.y,
          vx: f.dx * f.speed, vy: f.dy * f.speed,
          damage: f.damage * dmgMult, age: 0,
          kind: 'bolt',
          src: shotSrc(e),
        });
      }
    }
    // PYRAXIS ring nova: `shots` projectiles evenly around 360 degrees.
    if (act.nova) {
      for (let i = 0; i < act.nova.shots; i++) {
        const ang = (i / act.nova.shots) * Math.PI * 2 + e.age;
        state.enemyShots.push({
          x: e.x, y: e.y,
          vx: Math.cos(ang) * act.nova.speed,
          vy: Math.sin(ang) * act.nova.speed,
          damage: act.nova.damage * dmgMult, age: 0,
          kind: 'nova',
          src: shotSrc(e),
        });
      }
      state.effects.push({ kind: 'boss_nova', x: e.x, y: e.y, radius: 30, age: 0, ttl: 0.5 });
    }
    // CHOIR MOTHER summon burst: minions pop at the boss's edge (the sprite
    // half-width, so they appear from under her hem, not inside her).
    if (act.summon) {
      const edge = Math.max(e.w, e.h) / 2 + 6;
      for (let s = 0; s < act.summon.count; s++) {
        const ang = (s / act.summon.count) * Math.PI * 2 + e.age;
        const m = makeTypedEnemy(act.summon.type,
          e.x + Math.cos(ang) * edge, e.y + Math.sin(ang) * edge,
          state.time, { variant: rollVariant(act.summon.type) });
        escalate(m, state.time);
        // G20C: boss minions carry the stage stamp like every trunk spawn.
        stampStageStats(state, m);
        state.enemies.push(m);
      }
      state.effects.push({ kind: 'boss_nova', x: e.x, y: e.y, radius: 20, age: 0, ttl: 0.3 });
    }
    // WAVE-20 HERALD ring: unlike `summon` (boss's edge), the PILLARS plant in
    // a circle around the PLAYER — where the pilot stands when the ring lands
    // is where the cage forms. Staggered ages turn the ring into a rolling
    // barrage instead of one synchronized volley. Clamped inside the walls.
    if (act.ring) {
      for (let s = 0; s < act.ring.count; s++) {
        const ang = (s / act.ring.count) * Math.PI * 2;
        const m = makeTypedEnemy(act.ring.type,
          Math.max(-590, Math.min(590, p.x + Math.cos(ang) * act.ring.radius)),
          Math.max(-590, Math.min(590, p.y + Math.sin(ang) * act.ring.radius)),
          state.time, { variant: rollVariant(act.ring.type) });
        m.age = (s % 4) * 0.45;   // phase-offset the fire cadence per quadrant
        escalate(m, state.time);
        // G20C: the cage pillars carry the stage stamp like every trunk spawn.
        stampStageStats(state, m);
        state.enemies.push(m);
      }
      state.effects.push({ kind: 'boss_nova', x: p.x, y: p.y, radius: act.ring.radius, age: 0, ttl: 0.5 });
    }
    // PYRAXIS blink: hop by (dx,dy)*dist, clamped inside the arena walls.
    if (act.teleport) {
      // WAVE-25 (audit 2.4): config-driven arena edge (see runController).
      const RIM = C.GROUND.RIM;
      e.x = Math.max(-RIM, Math.min(RIM, e.x + act.teleport.dx * act.teleport.dist));
      e.y = Math.max(-RIM, Math.min(RIM, e.y + act.teleport.dy * act.teleport.dist));
      state.effects.push({ kind: 'boss_nova', x: e.x, y: e.y, radius: 14, age: 0, ttl: 0.25 });
    }
    // Touch radius scales with body size (WAVE-20: probe showed GRAVELMAW's
    // ~29px body shoving the pilot around edge-first while dealing ZERO
    // damage — the old flat 12px only counted center-to-center overlap).
    // Normal 10px foes keep the historic 12px exactly.
    const touchR = Math.max(12, 6 + (e.w || 10) / 2);
    if (Math.hypot(p.x - e.x, p.y - e.y) < touchR) {
      // GRAVELMAW mid-charge hits harder (the contact-damage window).
      // SURVIVAL-GAP: the hit itself now comes from entities.contactHitDamage
      // (the ONE source of truth the sims also call) — base 14 x the ladder's
      // threat curve applied SUB-LINEARLY, capped at a fraction of the bar.
      // See CONFIG.SURVIVAL for the measured reason (a wave-1 charger used to
      // one-shot a maxed 230 HP build for 120 and killed every tier at wave 1).
      const chargeMult = e.charging ? 1.5 : 1;
      const hit = contactHitDamage(C.SURVIVAL.BASE_CONTACT, dmgMult,
        e.contactDamageMult || 1, chargeMult, p.stats.maxHp);
      if (hit > touchDmg) { touchDmg = hit; touchKiller = e; }
    }
  }
  // Glass Cannon curse (choices.js damageTakenMult) scales every hit taken.
  const takenMult = (p.choices && p.choices.damageTakenMult) || 1;
  touchDmg *= takenMult;
  if (touchDmg > 0 && p.invuln <= 0) {
    // AEGIS arch: absorb the hit instead of taking it.
    if (state.shieldAbsorbs > 0) {
      state.shieldAbsorbs--;
      p.invuln = 0.5;
      state.effects.push({ kind: 'orbit_hit', x: p.x, y: p.y, age: 0, ttl: 0.2 });
    } else {
      p.hp -= damageTakenFortified(state, touchDmg);   // THICK SKIN funnel (touchDmg already carries the Glass Cannon mult; N1 slice 3 FORTIFY-aware)
      state.runCounts.waveTookDamage = true;   // G9: contact landed this wave
      p.invuln = 0.6;
      resetRampage();   // WAVE-11: ANY hp loss ends the rampage streak
      // VAMPIRIC elite mod (elite_mods.js): touching elites heal themselves a
      // fraction of the contact damage they dealt.
      for (const e of state.enemies) {
        if (e.hp > 0 && (e.lifesteal || 0) > 0 && Math.hypot(p.x - e.x, p.y - e.y) < 13) {
          e.hp = Math.min(e.maxHp, e.hp + touchDmg * e.lifesteal);
        }
      }
      if (p.hp <= 0) { lastDamageSource = { ...shotSrc(touchKiller || {}), cause: 'contact' }; die(); return; }
    }
    // Spiked Hide: reflect flat thorns damage into every touching enemy.
    const th = p.stats.thorns || 0;
    if (th > 0) {
      for (const e of state.enemies) {
        if (e.hp > 0 && Math.hypot(p.x - e.x, p.y - e.y) < 13) {
          e.hp -= th; e.flash = 0.08;
        }
      }
    }
  }

  // Enemy projectiles (spitter shots): damage the player on contact,
  // respecting the same invuln window as contact hits. Glass Cannon's
  // damageTakenMult scales these too.
  for (const s of state.enemyShots) {
    s.x += s.vx * dt + wd.x * dt; s.y += s.vy * dt; s.age += dt;
    if (p.invuln <= 0 && Math.hypot(s.x - p.x, s.y - p.y) < 8) {
      if (state.shieldAbsorbs > 0) {   // AEGIS absorbs projectiles too
        state.shieldAbsorbs--;
        p.invuln = 0.5;
      } else {
        p.hp -= damageTakenFortified(state, s.damage * takenMult);   // THICK SKIN funnel (N1 slice 3 FORTIFY-aware)
        state.runCounts.waveTookDamage = true;   // G9: a shot landed this wave
        p.invuln = 0.6;
        resetRampage();   // WAVE-11: projectile hits end the streak too
      }
      s.age = 99;
      if (p.hp <= 0) { lastDamageSource = { ...(s.src || {}), cause: 'shot' }; die(); return; }
    }
  }
  state.enemyShots = state.enemyShots.filter(s => s.age < 4);

  // Deaths -> gems (+ chance of a potion drop, + chest rolls for elites).
  // rng ()=>0 makes maybeSpawnChest's DROP_CHANCE roll always succeed, so
  // guaranteesChest elites always drop (still capped by MAX_ACTIVE).
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hp <= 0) {
      // COLOSSUS death shockwave: friendly-fire AoE vs nearby enemies
      // (victims earlier in the sweep get reaped next frame's death loop).
      const sw = deathShockwave(e);
      if (sw) {
        for (const o of state.enemies) {
          if (o === e || o.hp <= 0) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) <= sw.radius) {
            o.hp -= sw.damage;
            o.flash = 0.08;
          }
        }
        state.effects.push({ kind: 'colossus_shock', x: e.x, y: e.y, radius: sw.radius, age: 0, ttl: 0.5 });
        toast('COLOSSUS DOWN - SHOCKWAVE!');
      }
      // G8 step 2 CHAIN REACTION rewrite: every kill detonates. Same shape as
      // the colossus shockwave above — enemy-side friendly fire only, so it can
      // never kill the player; the death pass splices each enemy exactly once
      // (below), so a kill detonates exactly once and a chain merely propagates
      // across frames. NO toast: the feed is for rare moments, not every kill.
      // N1 slice 1: a corpse the Witch's CHAIN_REACTION Q killed (flagged by
      // useSkill) detonates through the SAME blast — boomBlast owns the
      // numbers/price/dry-fallback, so there is ONE detonation implementation
      // and a rewrite-holding Witch still detonates each corpse exactly once.
      const boom = rewriteBoom(state) || (e.chainBoom ? boomBlast(state.player) : null);
      if (boom) {
        // CHAIN REACTION draws on the pool per detonation; a dry run still
        // detonates, just smaller (rewriteBoom owns that decision).
        if (boom.manaCost) state.player.mana -= boom.manaCost;
        // N1 slice 3: the application loop moved INTO rewrites.js applyBlast —
        // the ONE blast implementation the Rogue's AFTERIMAGE phantoms now
        // share (e is dead here, so applyBlast's hp<=0 guard covers the old
        // `o === e` skip).
        applyBlast(state, e.x, e.y, boom);
      }
      state.gems.push(makeGem(e.x, e.y, e.xp));
      // Potion drop roll (Scavenger dropBonus widens the base chance; the
      // roll lives here because skills.js's rollDrop is base-config only).
      // Alchemist's Blessing curse: dropChanceMult scales the whole chance.
      // WAVE-27: the drop position is clamped into the playable face
      // (clampLootToArena) — a kill outside the wall used to drop an
      // uncollectible potion out there. rng order is untouched (the clamp is
      // pure and runs before the kind roll).
      const dropChance = (C.POTIONS.DROP_CHANCE + (p.stats.dropBonus || 0) +
        (e.dropBonus || 0)) *   // G10: rarity tiers pay a drop bonus
        ((p.choices && p.choices.dropChanceMult) || 1);
      const drop = Math.random() < dropChance
        ? { ...clampLootToArena(e.x, e.y), kind: Math.random() < 0.5 ? 'hp' : 'mp' } : null;
      if (drop) state.drops.push(drop);
      if (e.boss) state.runCounts.bossKills++;   // G9: BOSS/HERALD counter (FIRST_BOSS, BOSS_SLAYER_5)
      if (e.boss && e.midBoss) {
        // WAVE-20 herald payout: a chest + a weapon-XP bite. NO portal, NO
        // pendingClear — the wave's progression still belongs to the end-cast.
        for (let c = 0; c < C.ESCALATION.MIDBOSS.CHESTS; c++) {
          maybeSpawnChest(state,
            { x: e.x + (c ? 14 : -14), y: e.y + (c ? 8 : -8), elite: true }, () => 0);
        }
        feedWeaponXp(15);
        toast('HERALD DOWN');
        restoreBossStanceIfClear();   // BOSS_STANCE: the herald was the only boss up
      } else if (e.boss) {
        // Boss payout: guaranteed chest pair + an up-tier item drop. The
        // wave does NOT advance here — the PORTAL opens (see below) and the
        // intermission CONTINUE starts the next wave (wave-6 progression).
        const B = C.ESCALATION.BOSS;
        for (let c = 0; c < B.CHESTS; c++) {
          maybeSpawnChest(state,
            { x: e.x + (c ? 14 : -14), y: e.y + (c ? 8 : -8), elite: true }, () => 0);
        }
        const bossLoot = clampLootToArena(e.x, e.y);   // WAVE-27: reachable drop
        state.itemDrops.push({ x: bossLoot.x, y: bossLoot.y,
          item: rollItem(Math.random, C.ITEMS.BOSS_TIER_BIAS, luckWeights()), age: 0 });
        maybeGrantToken('drop');   // EVOLUTION TOKEN, world-drop channel (1 in 500)
        state.wave.pendingClear = true;
        state.wave.portalX = e.x;
        state.wave.portalY = e.y;
        // WAVE-8/A: the FINAL death of the wave's cast (nobody left alive)
        // queues the portal-entry cinematic. The first of a double pair just
        // opens the portal — existing wave-6 behavior is kept.
        if (!state.wave.bosses.some(b => b !== e && b.hp > 0)) state.wave.cinePending = true;
        restoreBossStanceIfClear();   // BOSS_STANCE: cast down — hand the doctrine back
        feedWeaponXp(30);   // boss kill = big weapon-XP payout
        toast('BOSS DOWN');
        // WAVE-26 FEATURE 4: a boss kill is the OTHER earned moment. The
        // per-wave HERALD (the midBoss branch above) is deliberately NOT
        // dilated — it fires every wave, and Sk408's law is that slow-mo
        // becomes noise the moment it is routine.
        triggerEarnedMoment('boss', e.x, e.y);
      } else {
        // Rare item drops (loot.js): elites often + up-tier, normals rarely.
        // Fortune's Favor blessing: itemDropMult scales the drop chance;
        // WAVE-11 elite modifiers carry a GUARANTEED item drop on kill, and
        // every world roll rides the luck-shifted rarity table (meta.js).
        const chance = ((e.elite ? C.ITEMS.ELITE_CHANCE : C.ITEMS.DROP_CHANCE) +
          (e.dropBonus || 0)) *   // G10: rarity tiers pay a drop bonus
          ((p.choices && p.choices.itemDropMult) || 1);
        if (e.eliteMod || Math.random() < chance) {
          const at = clampLootToArena(e.x, e.y);   // WAVE-27: reachable drop
          state.itemDrops.push({
            x: at.x, y: at.y,
            item: rollItem(Math.random, e.elite ? 0.75 : 0, luckWeights()), age: 0,
          });
          // EVOLUTION TOKEN, world-drop channel (1 in 500) — per DROP, not per
          // kill, so it rides the same volume the item itself does.
          maybeGrantToken('drop');
        }
        if (e.guaranteesChest) {
          maybeSpawnChest(state, e, () => 0);
        } else {
          maybeSpawnChest(state, e);
        }
      }
      // SPLITTING elite modifier (elite_mods.js): the dying elite divides into
      // two plain copies at 30% hp / 60% size — ONCE only (splitSpent), and
      // the children never carry modifiers (splits never recurse).
      if (e.eliteMod === 'SPLITTING' && !e.splitSpent) {
        const kids = splitChildren(e);
        if (kids) {
          e.splitSpent = true;
          for (const k of kids) {
            const c = makeTypedEnemy(k.typeId, k.x, k.y, state.time,
              { variant: rollVariant(k.typeId) });
            escalate(c, state.time);
            c.hp = k.hp; c.maxHp = k.maxHp; c.w = k.w; c.h = k.h;
            c.elite = false; c.eliteMod = null;
            state.enemies.push(c);
          }
          toast('THE ELITE DIVIDES!');
        }
      }
      state.enemies.splice(i, 1);
      p.kills++;
      // E1 RUN PURSE: tier-weighted gold per kill (meta.js GOLD_TIER), an
      // EVENT like the token/mana grants below — flat and dt-free. Chaff pays
      // ~0, elites ~1 unit, heavies more, herald/boss heavily; the raw
      // p.kills above stays the body count for milestones/achievements.
      purseCredit(e);
      // N1 slice 3 CONSECRATION: a kill inside the Paladin's live field banks
      // its heal (paid at the field's tick, capped there). The corpse is only
      // in hand HERE — after the splice it is gone — and every kill (weapons,
      // skills, blasts, the field's own ticks) funnels through this pass.
      { const cf = p.consecField;
        if (cf && Math.hypot(e.x - cf.x, e.y - cf.y) <= cf.radius) {
          cf.healAcc += C.SKILLS.CONSECRATION.HEAL_PER_KILL;
        }
      }
      // EVOLUTION TOKEN, kill channel (1 in 1200). A kill is an EVENT, so the
      // roll is dt-free and 60Hz/120Hz pay the same per corpse.
      maybeGrantToken('kill');
      // N1b item 6 SIPHON: mana on kill (stats.manaOnKill, default 0 — the
      // field is safe unowned). A kill is an EVENT, never a frame: the grant
      // is flat and dt-free, so 60Hz and 120Hz pay the same per corpse.
      if (p.stats.manaOnKill) {
        p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.manaOnKill);
      }
      // WAVE-11 RAMPAGE METER: every kill extends the streak (mult caps at 1.5x).
      state.rampage.streak++;
      if (state.rampage.streak > state.rampage.best) state.rampage.best = state.rampage.streak;
      // WAVE-11 FLASH DROPS (loot.js): a rare eligible kill erases EVERY enemy
      // of the weakest trash tier present (elites/bosses/typed untouched).
      if (shouldFlashDrop(e, p.stats.luck || 0, performance.now(), state.lastFlashAt, Math.random)) {
        const victims = flashTargets(state.enemies);
        if (victims.length > 0) {
          for (const v of victims) v.hp = 0;   // reaped by the next death pass
          state.effects.push({ kind: 'flash', x: p.x, y: p.y, age: 0, ttl: 0.5 });
          toast(describeFlash(victims[0].typeId));
          state.lastFlashAt = performance.now();
        }
      }
    }
  }

  // Portal opening: the last boss of the wave just died — the remaining
  // horde scatters into gems, the skies clear, and the PORTAL opens where
  // the boss fell. Walking in (proximity, portal drifts to the player)
  // triggers the intermission; CONTINUE starts the next wave.
  if (state.wave.pendingClear) {
    state.wave.pendingClear = false;
    for (const o of state.enemies) {
      if (o.hp > 0) state.gems.push(makeGem(o.x, o.y, o.xp));
    }
    state.enemies.length = 0;
    state.enemyShots.length = 0;   // no post-clear potshots
    state.wave.bosses = [];
    state.wave.boss = null;
    state.portal = { x: state.wave.portalX || p.x, y: state.wave.portalY || p.y, age: 0 };
    toast('THE PORTAL OPENS - WALK THROUGH');
  }

  // Chests: tick lifecycle, then slide gently toward the player so the
  // gem-seeking AutoPilot naturally crosses them — the controller seam
  // stays untouched (controllers don't know chests exist).
  // RUN-STRUCTURE: chests.js stamps its gambled-chest mini horde with the
  // SHIPPED escalation curve (it has no ladder seam), which at 20:00+ would be
  // a wall of off-curve unkillables. When that horde actually fires, re-base
  // the newly added enemies onto the ladder. Guarded on the event so the
  // frame cost of the set snapshot is not paid on ordinary ticks.
  const chestPre = state.chests.length > 0 ? new Set(state.enemies) : null;
  const chestEvents = tickChests(state, dt);
  // G9 FOLLOW-UP: count OPENED chests for CHESTS_25. An expired chest is a
  // different event kind (chestExpired), so a despawned chest never counts.
  for (const ev of chestEvents) if (ev.kind === 'chestOpened') state.runCounts.chests++;
  if (chestPre && chestEvents.some(ev => ev.kind === 'gambleHorde' || ev.kind === 'hordeBait')) {
    // G20C: re-base onto the ladder AND the stage stamp — the punishment horde
    // used to join at default-stage hp on every stage (measured: 6 unstamped
    // 12hp CHASERs on SNOWFIELD, GAMBLE_HORDE_COUNT exactly). chests.js's own
    // rng draw order stays byte-identical — the stamp happens here, after.
    for (const e of state.enemies) if (!chestPre.has(e)) stampStageStats(state, escalate(e, state.time));
  }
  for (const ch of state.chests) {
    const dx = p.x - ch.x, dy = p.y - ch.y;
    const len = Math.hypot(dx, dy) || 1;
    ch.x += (dx / len) * C.DRIFT.CHEST * dt;
    ch.y += (dy / len) * C.DRIFT.CHEST * dt;
  }
  // Arches lean toward the player (chest precedent, gentler): the AutoPilot
  // is arch-blind by design — controllers don't know arches exist — so the
  // gates close the last distance themselves. DRIFT.ARCH was 20px/s but that
  // read as the gate SLIDING after the player (Sk408 world-anchoring note);
  // ~6px/s keeps 90s sims crossing gates while they read as planted.
  for (const a of state.arches) {
    const dx = p.x - a.x, dy = p.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    a.x += (dx / len) * C.DRIFT.ARCH * dt;
    a.y += (dy / len) * C.DRIFT.ARCH * dt;
  }
  // WAVE-11 RUN SHRINES (shrines.js): the pilot is shrine-BLIND (controllers
  // never learn it exists) — the altar spawns on the patrol ring and merely
  // LEANS at the player (arch precedent). On proximity, gold buys ONE random
  // intermission-style blessing (choices.js semantics, repeat-free across the
  // whole run). Per-run only: shrines never touch persistence beyond the
  // purse debit (paid-chest precedent).
  // E1: the shrine debits the RUN PURSE (profile.runPurse), never the bank —
  // in-run gold buys in-run powers.
  if (state.shrine && !state.shrine.used) {
    const sh = state.shrine;
    const dx = p.x - sh.x, dy = p.y - sh.y;
    const len = Math.hypot(dx, dy) || 1;
    sh.x += (dx / len) * C.DRIFT.ARCH * dt;
    sh.y += (dy / len) * C.DRIFT.ARCH * dt;
    if (len < 26) {
      if (!sh.blessing) {
        // Roll + cache once per shrine (rng stream: shrineRng, seeded off the
        // run seed — never desyncs the intermission choice rolls).
        sh.blessing = shrineBlessing(state.wave.num - 1, state.shrineRng || Math.random,
          state.takenChoices);
      }
      if (!sh.blessing) {
        sh.used = true;   // blessing pool exhausted — the altar goes dark
      } else if (canAfford(profile.runPurse | 0, sh.blessing.cost) && purseSpend(sh.blessing.cost)) {
        applyChoice(state.player, sh.blessing.offer);
        state.takenChoices.push(sh.blessing.offer.id);
        const bonus = (state.player.choices && state.player.choices.weaponSlotBonus) || 0;
        // G11: the ceiling is the run's weaponCap (a challenge mode may lower it).
        state.weaponSlots = Math.min(state.weaponCap, state.baseWeaponSlots + bonus);
        sh.used = true;
        toast(sh.blessing.offer.title + ' — ' + sh.blessing.offer.desc);
        audio.playSfx('levelup');
      } else if (!sh.brokeToast) {
        sh.brokeToast = true;   // once per shrine: don't nag a broke pilot
        toast('THE SHRINE REQUIRES ' + sh.blessing.cost + ' GOLD');
      }
    }
  }
  for (const ev of chestEvents) {
    if (ev.kind === 'chestOpened') {
      toast('CHEST OPENED: ' + ev.rarity.toUpperCase(),
        RARITY_TINTS[ev.rarity.toUpperCase()] || null);   // WAVE-14 feed tint
      audio.playSfx('chest');
      // PALADIN bless: heal on chest open.
      const heal = state.character ? (state.character.healOnChest || 0) : 0;
      if (heal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      // EVOLUTION TOKEN, chest channel (1 in 200). Rolled HERE rather than
      // inside rollContents so the chest module's documented rng draw order is
      // untouched: every pinned chest sequence in the suite still means what it
      // meant (and the token no longer rides the chest rarity table at all).
      maybeGrantToken('chest');
    } else if (ev.kind === 'gambleHorde') {
      toast('THE GAMBLE BETRAYS YOU - MINI HORDE!');
    } else if (ev.kind === 'hordeBait') {
      // G8 step 3: the rule paid a better chest and the horde is the price.
      toast('HORDE BAIT - THE CHEST ANSWERED WITH A HORDE!');
    } else if (ev.kind === 'chestItem') {
      // The 0.02% top chest band's reward (owner spec): a hand-authored
      // LEGENDARY item. It lands on the ground where the chest opened and the
      // ONE world-drop pickup path owns the equip decision, so a full belt
      // still gets the normal swap-or-ignore rule rather than a second
      // equip code path.
      state.itemDrops.push({ x: ev.x, y: ev.y, item: ev.item, age: 0 });
      toast('LEGENDARY: ' + ev.item.name.toUpperCase(), RARITY_TINTS.LEGENDARY);
      audio.playSfx('levelup');
    }
  }

  // Effective pickup radius: base + Loot Vortex items + MAGNET arch.
  const basePickR = p.stats.pickup * (p.stats.pickupMult || 1) * am.pickupMult;
  // WAVE-26 "stance that bites": STANCE loot magnetism. GREEDY reaches further
  // for loot, SAFE keeps its distance from it — the one consequence that bites
  // in BOTH pilot modes (manual pilot owns movement, so its kite distance is
  // inert by design; the magnetism is not).
  const stanceDef = C.AUTOPILOT.STANCES[controller.stance] || C.AUTOPILOT.STANCES.BALANCED;
  const pickR = basePickR * (stanceDef.PICKUP_MULT || 1);

  // Potion drops: auto-pickup within gem radius, but only if not at cap —
  // a full inventory leaves the potion on the ground for later.
  // WAVE-14: pickups announce in the event feed (Sk408 request).
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    if (Math.hypot(d.x - p.x, d.y - p.y) < pickR) {
      if (p.potions[d.kind] < state.potionCap) {   // G11: the run's rule ceiling
        p.potions[d.kind]++;
        state.drops.splice(i, 1);
        toast((d.kind === 'hp' ? 'HEALTH' : 'MANA') + ' POTION FOUND');
        // G8 step 2 BLOOD HARVEST rewrite: the PICKUP retaliates. Hooked on
        // the collect path (NOT drinkPotion — the ask is "health pickups also
        // damage"); the blast is enemy-side only, centered on the player.
        const blast = d.kind === 'hp' ? harvestBlast(state) : null;
        if (blast) {
          for (const o of state.enemies) {
            if (o.hp <= 0) continue;
            if (Math.hypot(o.x - p.x, o.y - p.y) <= blast.radius) {
              o.hp -= blast.damage;
              o.flash = 0.08;
            }
          }
          state.effects.push({ kind: 'rewrite_harvest', x: p.x, y: p.y, radius: blast.radius, age: 0, ttl: 0.3 });
        }
      }
    }
  }

  // Rare item drops (loot.js, WAVE-11 best-case equip): EQUIP fills a free
  // slot, REPLACE swaps the weakest when the drop is STRICTLY better, IGNORE
  // leaves it on the ground (heat charges inside applyEquipDecision: +1 new
  // slot / +0 exchange).
  for (let i = state.itemDrops.length - 1; i >= 0; i--) {
    const d = state.itemDrops[i];
    if (Math.hypot(d.x - p.x, d.y - p.y) < pickR) {
      const res = applyEquipDecision(d.item);
      if (res) {
        state.itemDrops.splice(i, 1);
        toast(res.msg, res.tint);
      }
    }
  }

  // Skill/weapon visual effects + HUD toasts.
  for (const fx of state.effects) {
    fx.age += dt;
    if (fx.kind === 'charge') { fx.x = p.x; fx.y = p.y; } // follows the player
  }
  state.effects = state.effects.filter(fx => fx.age < fx.ttl);
  for (let i = state.toasts.length - 1; i >= 0; i--) {
    state.toasts[i].ttl -= dt;
    if (state.toasts[i].ttl <= 0) state.toasts.splice(i, 1);
  }
  tickBossBanner(dt);   // WAVE-14 arrival overlay

  // Gem pickup.
  let greedyScoop = 0;   // WAVE-26: gems only the GREEDY stretch could reach
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const gm = state.gems[i];
    const d = Math.hypot(gm.x - p.x, gm.y - p.y);
    if (d < pickR) {
      if (controller.stance === 'GREEDY' && d > basePickR) greedyScoop++;
      p.xp += gm.xp * (p.stats.xpMult || 1) * (wm.xpMult || 1) * rampageMult();   // Scholar + SUNNY + WAVE-11 rampage
      state.gems.splice(i, 1);
      feedWeaponXp(1);                         // gems trickle weapon XP
      while (p.xp >= p.xpNext) { levelUp(); }
      // W7b MYTHIC Storm Shards: picking up XP chips every enemy in a radius
      // (one proc per gem — it scales with XP farming by construction, and
      // with the run's damage investment through CHIP_FRAC). Enemy-side only,
      // player-centred; hp<=0 enemies are reaped by the normal death pass
      // (the BLOOD HARVEST blast precedent above), so kills, purse and tokens
      // credit through the one existing path. An EVENT, never frame-scaled:
      // 60Hz and 120Hz chip the same per gem.
      if (p.stats.stormShards) {
        const S = DRAFT_LADDER.STORM_SHARDS;
        const chip = Math.max(S.CHIP_MIN, p.stats.damage * S.CHIP_FRAC);
        for (const o of state.enemies) {
          if (o.hp <= 0) continue;
          if (Math.hypot(o.x - p.x, o.y - p.y) <= S.RADIUS) {
            o.hp -= chip;
            o.flash = 0.08;
          }
        }
      }
    }
  }
  // WAVE-26 moment-to-moment signal: the stance PAYING OFF — loot the base
  // radius could never have taken. Rate-limited (once per 6s) so it reads as
  // a signal and never becomes noise, and greed-gated so it fires only when
  // GREEDY is the reason it happened.
  // WORDING (owner-reported + measured): this used to read "N LOOT OUT OF
  // REACH", which reads as a WARNING about loot left on the ground while the
  // condition is a SUCCESS -- the gems counted here are the ones being collected
  // THIS FRAME at a distance only the GREEDY stretch covers. So with a lone far
  // gem the player was told "1 LOOT OUT OF REACH" about the very gem they had
  // just picked up, and a gem genuinely left out of reach (3x the radius)
  // produced no message at all: the claim was inverted from the event. The count
  // and the rate limit are unchanged; only the claim is now true.
  if (greedyScoop > 0 && state.time - state.stanceLootAt > 6) {
    state.stanceLootAt = state.time;
    toast('GREEDY HAUL - ' + greedyScoop + ' SNATCHED BEYOND REACH',
      C.HUD.STANCE_COLORS.GREEDY);
  }

  // Camera follows player (WAVE-27: one shared follow — see updateCamera).
  updateCamera(p, dt);

  // EVOLVE overlay check: level-ups (gems/boss XP), item equips and tokens
  // can all complete a requirements triple since the last frame.
  maybeOpenEvolve();

  // WAVE-8/A + P1: the portal-entry cinematic is ENTRY-DRIVEN. It used to
  // auto-start here on the first playing tick after the final boss died —
  // which meant the portal rendered for ZERO gameplay frames (measured
  // 2026-09-14: portal-open -> cine = 0.000s; the "walk" the toast promises
  // never existed). The owner directive is "on the screen longer before the
  // player enters and the cinematic begins", so the movie now starts ONLY
  // when the player/pilot actually walks in: the dwell beat elapses ->
  // openIntermission -> cinePending routes to startPortalCine (:804).
  if (state.wave.cinePending && state.mode === 'playing' && !state.portal) startPortalCine();
}

// ---------- Leveling & draft ----------
function levelUp() {
  const p = state.player;
  p.xp -= p.xpNext;
  p.level++;
  p.xpNext = Math.floor(p.xpNext * C.XP_LEVEL_GROWTH);
  // SURVIVAL-GAP: the run's EHP axis. Enemy contact threat climbs all run
  // (sub-linearly now, see CONFIG.SURVIVAL) and the shop's pool grows only
  // additively, so the player's bar had no way to answer the late ladder. Max
  // HP grows with LEVEL, LINEAR in the run's start pool (state.baseMaxHp, set
  // in startRun), and the gain is healed in (a level-up reads as a small heal).
  // Linear, NOT compounding: levels come fast (level 40+ inside 9 minutes) and
  // a compounding rule made a fresh save unkillable (measured: 1018 HP at 8:45).
  const gain = (state.baseMaxHp || p.stats.maxHp) * C.SURVIVAL.HP_PER_LEVEL;
  p.stats.maxHp += gain;
  p.hp = Math.min(p.stats.maxHp, p.hp + gain);
  audio.playSfx('levelup');
  state.pendingDrafts++;
  if (state.mode === 'playing') openDraft();
}

// WAVE-14: toast() is the ONE event stream — the text HUD's `!` line and the
// on-canvas event feed (render.js, under the HP/mana bars) both read it.
// `tint` (optional) colorizes the feed line — the rarity color of a found
// item. ttl 4s; the feed shows the last 3 and fades each line's final second.
function toast(msg, tint = null) {
  state.toasts.push({ msg, ttl: 4, tint });
  if (state.toasts.length > 3) state.toasts.shift();
}

// WAVE-14: the boss-arrival banner lives ~2.5s (ticked beside the toasts in
// update() AND updateFinale() so the maw's banner expires mid-finale too).
function tickBossBanner(dt) {
  if (!state.bossBanner) return;
  state.bossBanner.ttl -= dt;
  if (state.bossBanner.ttl <= 0) state.bossBanner = null;
}

// ---------- EVOLUTION TOKENS (chests.js EVOLUTION_TOKEN) ---------------------
// The token is its own drop with three independently tuned channels, so all
// three land HERE — one grant path, one counter, one banner rule. The rates
// live in chests.js (EVOLUTION_TOKEN); this side owns what the player sees.
const TOKEN_BANNER_SEC = 2.5;   // == render.js drawBossBanner's DUR

// The FIRST token of a run owns the screen: the full WAVE-14 cinematic banner
// (render.js drawBossBanner — the letterbox + fitted two-line block already
// exists, so no new render path) PLUS a real pause. The pause is what makes it
// a moment rather than a toast: state.bannerHold holds update() for the
// banner's own duration (see frame()). It explains what a token is FOR and that
// it evolves a weapon ONCE IT IS AT MAX LEVEL, so the first one teaches the
// mechanic instead of being an inventory number. Every later token is a
// standout status line only — no pause, no repeated lecture.
// Test seam: one-time banners OFF for this process. A long end-to-end probe
// (smoke) runs a 90s simulation that acquires EPIC/LEGENDARY gear and tokens by
// the dozen, and each first-ever banner holds the sim for TOKEN_BANNER_SEC --
// which a frame-counting probe (an idle check, a fade fade) reads as a stall
// rather than as the designed pause. The banners' own behaviour is asserted with
// this switch on. Never touched by the browser page.
let oneTimeBanners = true;

function grantEvolutionToken(channel) {
  state.evoTokens++;
  if (state.runCounts && state.runCounts.tokens) state.runCounts.tokens[channel] =
    (state.runCounts.tokens[channel] || 0) + 1;
  // A token may re-open a previously declined EVOLVE offer.
  for (const w of state.weapons) w.evoDeclined = false;
  // FIRST-EVER, PERSISTED (schema v6 ledger): the full banner + its pause
  // teaches the mechanic once per PLAYER. It used to be run-scoped, which meant
  // the explainer -- and a 2.5s hold on the sim -- fired on the first token of
  // EVERY run; with ~1.5 tokens a run that is a lecture the player gets forever.
  if (oneTimeBanners && markBannerSeen(profile, 'TOKEN')) {
    state.bossBanner = {
      names: ['EVOLUTION TOKEN'],
      verb: 'ACQUIRED',
      title: 'EVOLUTION TOKEN ACQUIRED',
      sub: 'EVOLVES A WEAPON ONCE IT HAS REACHED MAX LEVEL',
      ttl: TOKEN_BANNER_SEC,
    };
    state.bannerHold = TOKEN_BANNER_SEC;
    audio.playPortalCue('BOSS_YELL');   // the reusable cinematic sting
  } else {
    toast('EVOLUTION TOKEN! ' + state.evoTokens +
      ' HELD - EVOLVES A MAX-LEVEL WEAPON', RARITY_TINTS.LEGENDARY);
  }
  audio.playSfx('levelup');
}

// ---------- (g) FIRST-EVER TOP-TIER PICKUP ---------------------------------
// Owner spec: "It should be a really cool thing when the player receives a top
// tier drop." The FIRST time a given top-tier item is ever acquired, the full
// banner owns the screen and the sim holds -- the same treatment (and the same
// cinematic seam) as the token explainer above. Repeats get NO pause and NO
// banner: the rarity-tinted FOUND line in applyEquipDecision is the standout
// status line, which is what the spec asks for.
// KEYED BY ITEM NAME, not by item id: rolled EPIC items get a fresh generated
// id every roll, so an id-keyed ledger would believe every single one was the
// first and would pause the game forever. The name is stable per item.
const TOP_TIER = ['EPIC', 'LEGENDARY'];   // one-line tunable (LEGENDARY only?)
function maybeTopTierBanner(it) {
  if (!oneTimeBanners) return false;
  if (!it || !TOP_TIER.includes(it.rarity)) return false;
  if (!markBannerSeen(profile, 'top:' + it.name)) return false;
  state.bossBanner = {
    names: [it.name.toUpperCase()],
    verb: it.rarity,
    title: it.name.toUpperCase(),
    sub: (it.rarity === 'LEGENDARY' ? 'LEGENDARY ITEM ACQUIRED' : 'TOP-TIER ITEM ACQUIRED'),
    ttl: TOKEN_BANNER_SEC,
  };
  state.bannerHold = TOKEN_BANNER_SEC;
  audio.playPortalCue('BOSS_YELL');
  return true;
}

// One token roll on one channel ('kill' | 'chest' | 'drop'), via the module's
// own helper so the denominator has exactly one home. Unknown channels draw
// nothing and can never grant.
function maybeGrantToken(channel) {
  if (rollEvolutionToken(Math.random, channel)) grantEvolutionToken(channel);
}

// W7b measurement seam (never shipped off): tools/w7b_draft_ab.mjs sets
// globalThis.HORDES_DRAFT_LADDER = false BEFORE importing this module to run
// the BEFORE arm (the HEAD pool, no ladder families, no chase rolls) of the
// paired-seed A/B. Default ON; the game itself never sets it. Read once at
// module scope so an arm cannot flip mid-run.
const DRAFT_LADDER_ON = globalThis.HORDES_DRAFT_LADDER !== false;

function openDraft() {
  state.mode = 'draft';
  ovTitle.className = '';
  // Weapon-scoped pool (megabonk rework): grants fill free slots, level-up
  // cards push a weapon further up its ladder (duplicate picks of the same
  // weapon just level it again). Global stat cards are downweighted so the
  // draft reads ~70% weapon / ~30% stat. Slot cap = startWeaponSlots(profile)
  // (3 base, 4/5/6 shop-bought); grants stop at the cap, level-ups never do.
  const slotCap = state.weaponSlots || C.WEAPON_SLOTS;
  const nonVolley = state.weapons.filter(w => w.type !== 'VOLLEY').length;
  const slotsFree = slotCap - 1 - nonVolley;
  const weaponCards = [];
  if (slotsFree > 0) {
    for (const [id, def] of Object.entries(WEAPON_TYPES)) {
      if (state.weapons.some(w => w.type === id)) continue;
      // WAVE-11 weapon economy: the draft pool is gated to
      // profile.unlockedWeapons (meta.js — starter set VOLLEY + BOOMERANG;
      // every other archetype is a shop row). Already-granted weapons keep
      // their level-up cards regardless.
      if (!weaponUnlocked(profile, id)) continue;
      weaponCards.push({
        id: 'wpn_' + id,
        name: def.name,
        desc: 'NEW WEAPON · fills slot ' + (nonVolley + 2) + '/' + slotCap,
        apply: () => { state.weapons.push(makeWeapon(id)); refreshSynergies(); },
      });
    }
  }
  // Level-up cards for every owned weapon below the cap (VOLLEY included —
  // its instance rides in state.weapons but never takes a slot).
  // G8 step 2 retune (extended ladder): under ONE OF EACH the weapon ladder
  // never ends — an at-cap level-up card STAYS offered and converts to +10%
  // weapon damage in pick() (the multi/volleyAtProjCap precedent: no dead
  // cards, no fake choices).
  for (const w of state.weapons) {
    const lv = w.level || 1;
    if (lv >= WEAPON_MAX_LEVEL && !hasRule(state, 'once')) continue;
    weaponCards.push({
      id: 'lvl_' + w.type + '_' + lv,
      name: WEAPON_NAMES[w.type] + ' UP',
      desc: lv >= WEAPON_MAX_LEVEL
        ? '+10% weapon damage · MAXED'
        : (describeWeaponLevel(w.type, lv + 1) || '') + ' · Lv ' + lv + '/' + WEAPON_MAX_LEVEL,
      apply: () => { levelUpWeapon(w); },
    });
  }
  const pool = [
    ...weaponCards.map(c => ({ ...c, weight: 1 })),
    // G8 step 1: the stat family carries its rarity weight (meta.js
    // draftCardWeight) so Fortune shifts the DRAFT, not just world drops.
    // At luck 0 every one of these is exactly 0.3 — the shipped pool.
    // G8 step 3: ONE OF EACH drops a stat card from the pool once the run has
    // taken it (statCardOffered), and the run-rule cards ride in the same pool
    // at RULE_CARD_WEIGHT. With no rules held the first line is byte-identical
    // to the shipped pool (every stat card exactly its draft weight).
    ...UPGRADES.filter(u => statCardOffered(u.id, state))
      .map(u => ({ ...u, weight: draftCardWeight(u.id, 'stat', state.player.stats.luck || 0) })),
    // W7b RARE ladder tier: the percent/scaling chase cards. LOW-WEIGHT (never
    // a pool flood — the weapon cards keep weight 1 and full access), luck-
    // shifted through draftLadderWeight (the Fortune extension reaches the
    // whole ladder, not just the stat family). Repeatable across drafts —
    // percent cards compound — but the ONE OF EACH ledger still applies
    // (statCardOffered), the same contract the common family rides.
    ...(DRAFT_LADDER_ON ? DRAFT_RARE_UPGRADES.filter(u => statCardOffered(u.id, state))
      .map(u => ({ ...u, tier: 'RARE', weight: draftLadderWeight(u.id, 'RARE', state.player.stats.luck || 0) })) : []),
    // W7b MYTHIC ladder tier: the run-gated chase cards. A card is in the pool
    // AT ALL only if startRun rolled it into state.chasePool (~1/10 of runs,
    // owner spec), and leaves the pool for the run once taken (the takenStats
    // ledger read directly — once per run with or without a run rule).
    ...(DRAFT_LADDER_ON ? DRAFT_MYTHIC_UPGRADES.filter(u =>
        (state.chasePool || {})[u.id] && !((state.player.takenStats || {})[u.id]))
      .map(u => ({ ...u, tier: 'MYTHIC', weight: draftLadderWeight(u.id, 'MYTHIC', state.player.stats.luck || 0) })) : []),
    ...ruleCards(state),
    // G8 step 4: the perk family rides the same pool at SKILL_CARD_WEIGHT,
    // one card per perk the run does not already hold (taken once, like a rule).
    ...skillCards(state),
    // N1 slice 2: the run-owned auto FROST_NOVA card rides the same pool at
    // FROST_CARD_WEIGHT, offered exactly when the class Q is not already
    // FROST_NOVA and the run does not hold it (taken once, like the perks).
    ...(frostCardOffered(state) ? [frostCard()] : []),
    // G8 step 2: the rewrite family rides the same pool at
    // REWRITE_CARD_WEIGHT, one card per rewrite not already held.
    ...rewriteCards(state),
  ];
  // WAVE-18: with the volley at MAX_PROJECTILES the Split Shot card would be a
  // dead pick (a fake choice) — relabel it to what it actually does.
  if (volleyAtProjCap()) {
    const multiCard = pool.find(c => c.id === 'multi');
    if (multiCard) multiCard.desc = '+20% weapon damage (volley full)';
  }
  // Weighted draw WITHOUT replacement, take the offer count (3 base; the W7b
  // MYTHIC Full Hand adds +1 for the rest of the run — the number-key routing
  // already covers 1-4). No duplicate cards per draft.
  const offerN = 3 + (state.player.stats.draftOffers || 0);
  const choices = [];
  while (choices.length < offerN && pool.length > 0) {
    let r = Math.random() * pool.reduce((s, c) => s + c.weight, 0);
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { if ((r -= pool[i].weight) < 0) { idx = i; break; } }
    choices.push(pool.splice(idx, 1)[0]);
  }
  ovTitle.textContent = 'LEVEL ' + state.player.level;
  ovSub.textContent = 'choose your build';
  hideDraftInspect();          // a re-opened draft (pendingDrafts > 1) starts clean
  draftFocus = -1;
  ovCards.innerHTML = '';
  choices.forEach((u, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el._draftOffer = u;        // the keydown routing + the inspect flow read this
    el.tabIndex = 0;           // the arrows+Enter cursor focuses (frameCard hot tone)
    // WAVE-26: synergy hint line ONLY when the pick relates to a pair the run
    // actually implements (see synergyHintForCard). Silent otherwise.
    const hint = synergyHintForCard(u);
    // W7b: the ladder tier is ON the card — the chase has to read as a chase.
    // Tints are the rarity.js encounter tells (RARE cyan / MYTHIC violet), so
    // the draft and the field speak one rarity language. Inline style: the
    // draft overlay is DOM, and index.html's stylesheet is another track's
    // file.
    const badge = u.tier
      ? `<div class="syn" style="color:${u.tier === 'MYTHIC' ? RARITY.MYTHIC.tell.outline : RARITY.RARE.tell.outline}">${u.tier}</div>`
      : '';
    el.innerHTML = badge + `<div class="name">${i + 1}. ${u.name}</div><div class="desc">${u.desc}</div>` +
      (hint ? `<div class="syn">${hint}</div>` : '') +
      `<div class="key">[${i + 1}]</div>`;
    // R2 (owner directive 2026-09-14): the FIRST activation INSPECTS, the
    // SECOND takes — see activateDraftCard below.
    el.onclick = () => activateDraftCard(u, el);
    ovCards.appendChild(el);
    // R1: the offer's playing-card art, painted by the REAL drawCard
    // (src/draft_card_art.js). On top of the text in a live DOM (insertBefore);
    // appended in a stub DOM — the canvas child is the contract there.
    const artCv = document.createElement('canvas');
    artCv.className = 'card-art';
    if (artCv.setAttribute) artCv.setAttribute('data-card', u.id);
    if (paintOfferArt(artCv, u.id)) {
      if (typeof el.insertBefore === 'function') el.insertBefore(artCv, el.firstChild);
      else el.appendChild(artCv);
    }
    frameCard(el);
  });
  overlay.style.display = 'flex';
  // WAVE-21: the draft IS the game — coachmark it the first time it appears.
  // ('draft' mode already freezes the sim; the coach rides on top of the
  // real cards and dismisses on the same click-to-advance contract.)
  if (!tourFlag(TOUR_KEYS.draft)) {
    startCoach({ id: 'draft',
      text: 'THE DRAFT — your build\'s only real decisions. Pick a card or press 1 / 2 / 3.',
      target: () => ovCards.children[0] || ovCards }, TOUR_KEYS.draft);
  }
}

// ---------- DRAFT INSPECT -> CONFIRM (owner directive 2026-09-14, R2) --------
// "How does the player know which card does what? Maybe they push to select,
// it shows a box with what it does and they confirm selection."
// The FIRST activation on a draft card (tap/click, or Enter on the keyboard
// cursor) never takes it: it opens the inspect box — the card's art LARGE,
// its name, its ladder tier, and its own effect text with the COMPUTED values
// (the offer's desc is built at offer time by the real pool code: Second
// Wind's revive fraction, Iron Heart's percent, a weapon level's actual
// deltas out of describeWeaponLevel — shown verbatim, never restated here).
// A SECOND activation on the SAME card takes it. ESC cancels back to the
// offer. The 1-4 number keys stay the one-press quick-pick they always were
// (test_w7b_draft_ladder pins a single [4] press taking the fourth offer);
// the inspect flow's keyboard parity is arrows + Enter + ESC.
const draftInspectEl = document.getElementById('draft-inspect');
let draftInspect = null;   // { u, el } — the offer under inspection, or null
let draftFocus = -1;       // keyboard cursor over the offer row (-1: none)

function hideDraftInspect() {
  if (draftInspect && draftInspect.el) markDraftSelected(draftInspect.el, false);
  draftInspect = null;
  if (draftInspectEl) draftInspectEl.style.display = 'none';
}

// The 'selected' class doubles as frameCard's crimson 'sel' tone (it reads
// className), so the inspected card's painted frame reacts too.
function markDraftSelected(el, on) {
  if (!el) return;
  const parts = (el.className || '').split(' ').filter(c => c && c !== 'selected');
  if (on) parts.push('selected');
  el.className = parts.join(' ');
}

function openDraftInspect(u, el) {
  if (draftInspect && draftInspect.el && draftInspect.el !== el) markDraftSelected(draftInspect.el, false);
  draftInspect = { u, el };
  markDraftSelected(el, true);
  if (!draftInspectEl) return;
  // Styled inline: index.html's stylesheet is another track's file (the same
  // rule the W7b tier badge follows).
  const st = draftInspectEl.style;
  st.maxWidth = '360px';
  st.margin = '14px auto 0';
  st.padding = '14px';
  st.background = '#12121c';
  st.border = '2px solid #c9a05a';
  st.textAlign = 'center';
  st.color = '#f0dfc0';
  const hint = synergyHintForCard(u);
  const tier = u.tier
    ? `<div style="font-size:11px;letter-spacing:1px;color:${u.tier === 'MYTHIC' ? RARITY.MYTHIC.tell.outline : RARITY.RARE.tell.outline}">${u.tier}</div>`
    : '';
  draftInspectEl.innerHTML =
    `<div style="color:#ffd75e;font-weight:bold;letter-spacing:1px;text-shadow:2px 2px 0 #0a0603">${u.name}</div>` +
    tier +
    `<div style="margin-top:8px;font-size:13px;color:#d6c09a;text-shadow:1px 1px 0 #0a0603">${u.desc}</div>` +
    (hint ? `<div style="margin-top:8px;font-size:11px;color:#7ad0ff;letter-spacing:1px">${hint}</div>` : '') +
    `<div style="margin-top:10px;font-size:11px;color:#6a6a8a">TAP AGAIN / [ENTER] TO TAKE · [ESC] BACK</div>`;
  // The large art is LIVE drawCard output, rebuilt per open — never a cached
  // or re-drawn look. Above the text in a live DOM, appended in a stub.
  const artCv = document.createElement('canvas');
  artCv.className = 'card-art-inspect';
  if (artCv.setAttribute) artCv.setAttribute('data-card', u.id);
  if (paintOfferArt(artCv, u.id, INSPECT_ART_SCALE)) {
    if (typeof draftInspectEl.insertBefore === 'function') draftInspectEl.insertBefore(artCv, draftInspectEl.firstChild);
    else draftInspectEl.appendChild(artCv);
  }
  st.display = 'block';
}

// The ONE activation seam every pointer path takes: first activation inspects,
// second activation on the SAME card takes it, activating a DIFFERENT card
// moves the inspection.
function activateDraftCard(u, el) {
  if (draftInspect && draftInspect.u === u) {
    hideDraftInspect();
    pick(u);
  } else {
    openDraftInspect(u, el);
  }
}

// Arrows walk the keyboard cursor over the offer row (wraps). Element focus
// follows so frameCard's hover/'hot' repaint fires for a keyboard player the
// same way it does for the mouse.
function draftFocusStep(d) {
  const n = ovCards.children.length;
  if (!n) return;
  draftFocus = (((draftFocus < 0 ? (d > 0 ? -1 : 0) : draftFocus) + d) % n + n) % n;
  const el = ovCards.children[draftFocus];
  if (el && typeof el.focus === 'function') el.focus();
}

// WAVE-11 LEVEL-UP SLOWDOWN (Sk408): the SCALING stat cards now DIMINISH per
// repeat — early picks stay full-strength, later ones taper. Curve (fraction
// of the card's listed gain per Nth pick of that card):
//   pick:   1     2     3     4     5     6     7+
//   taper:  1.0   0.75  0.55  0.4   0.3   0.22  0.15
// 'speed' Light Boots (+15% move speed): gains +15.0/+11.3/+8.3/+6.0/+4.5/+3.3/+2.25%...
// 'rate'  Quick Hands (-15% cooldown):  same fractions of 15% off.
// Counts live on the run player (fresh makePlayer resets them every run).
const DRAFT_TAPER = [1, 0.75, 0.55, 0.4, 0.3, 0.22, 0.15];

// WAVE-18 draft-stakes fix (hb7 sim lever L3): total volley projectiles are
// capped at C.WEAPON.MAX_PROJECTILES (base 1 + VOLLEY Lv3/Lv6 grants), so a
// Split Shot card past the cap did NOTHING — a fake choice. Overflow picks now
// convert to +20% weapon damage, exactly like the VOLLEY Lv3/6 proj conversion
// in weapons.js.
function volleyAtProjCap() {
  const w = state.weapons.find(x => x.type === 'VOLLEY');
  const proj = weaponLevelParams('VOLLEY', w ? w.level : 1).proj || 0;
  return (state.player.stats.projectiles || 0) + proj >= volleyProjectileCap(state.player.stats);
}

function pick(u) {
  const p = state.player;
  // G8 step 3: a RUN RULE card grants a persistent condition instead of a
  // number; every other card records itself in the `once` ledger (stat cards
  // only — weapon grant/level cards are the weapon economy, not the stats).
  if (u.rule) {
    p.rules = p.rules || {};
    p.rules[u.rule] = true;
    toast('RUN RULE - ' + RULES[u.rule].name.toUpperCase() + ': ' + RULES[u.rule].desc.replace('RUN RULE - ', ''));
  } else if (u.skill) {
    // G8 step 4: a SKILL card grants its always-on perk through the card's own
    // apply(player) in the chain below, and NEVER enters the `once` stat
    // ledger — skill ids must not pollute it (same shape as the rule branch).
    // N1 slice 2: the Pocket Frost card is NOT in SKILL_PERKS (perks.js stays
    // read-only for that slice) and carries its own name/desc — fall back to
    // the card itself so the toast cannot throw on an unknown skill id.
    const skillCardMeta = SKILL_PERKS[u.skill] || u;
    toast('SKILL - ' + skillCardMeta.name.toUpperCase() + ': ' + skillCardMeta.desc.replace('SKILL - ', ''));
  } else if (u.rewrite) {
    // G8 step 2: a REWRITE card grants its mechanic through apply(player) in
    // the chain below, and NEVER enters the `once` stat ledger.
    // Player-facing copy only: the internal family label must never reach the
    // feed - it read as a placeholder ("rewrite this description before using").
    toast(REWRITES[u.rewrite].name.toUpperCase() + ' - ' + REWRITES[u.rewrite].desc);
  } else if (u.tier === 'MYTHIC') {
    // W7b: a MYTHIC chase card leaves the pool for the rest of the run once
    // taken (openDraft reads the takenStats ledger directly for this family —
    // once per run with or without a run rule), and the catch is announced.
    markStatTaken(state, u.id);
    toast('MYTHIC - ' + u.name.toUpperCase() + ': ' + u.desc, RARITY.MYTHIC.tell.outline);
  } else if (!(u.id.startsWith('wpn_') || u.id.startsWith('lvl_'))) {
    markStatTaken(state, u.id);
  }
  if (u.id === 'multi' && volleyAtProjCap()) {
    p.stats.damage *= 1.2;
  } else if (u.id === 'speed' || u.id === 'rate') {
    const n = (p.draftCounts = p.draftCounts || {});
    n[u.id] = (n[u.id] || 0) + 1;
    const t = DRAFT_TAPER[Math.min(n[u.id] - 1, DRAFT_TAPER.length - 1)];
    if (u.id === 'speed') p.stats.speed *= 1 + 0.15 * t;
    else p.stats.cooldown *= 1 - 0.15 * t;
  } else {
    u.apply(p);
    // G8 step 2 RETUNE (the step-3 debt TICK NOTE 7 measured at 0.65x): under
    // ONE OF EACH the weapon tilt actually PAYS — a weapon level-up card
    // grants +1 BONUS level and a weapon grant lands at Lv2. The rule still
    // removes the stat-stacking axis; this is the compensation on the same
    // axis the card tilts toward. levelUpWeapon caps at WEAPON_MAX_LEVEL, so
    // a doubled pick at the cap is a no-op, never an overflow.
    if (hasRule(state, 'once')) {
      if (u.id.startsWith('lvl_')) {
        // Below the cap the payout is +1 BONUS level. At the cap the doubled
        // level-up would be a no-op — the extended-ladder conversion pays
        // instead: +10% weapon damage (the multi-overflow shape). The cap
        // test reads the OFFER-time level from the card id: the generic
        // u.apply above has already run, so w.level would misfire on a card
        // offered at MAX-1 (leveled to MAX by that apply) and double-pay.
        const lvAtOffer = Number(u.id.split('_').pop());
        if (lvAtOffer >= WEAPON_MAX_LEVEL) p.stats.damage *= 1.10;
        else u.apply(p);   // the card's apply is exactly one levelUpWeapon call
      } else if (u.id.startsWith('wpn_')) {
        const granted = state.weapons[state.weapons.length - 1];
        if (granted) levelUpWeapon(granted);
      }
    }
  }
  state.pendingDrafts--;
  if (state.pendingDrafts > 0) { openDraft(); return; }
  hideDraftInspect();          // R2: the box dies with the draft it inspects
  draftFocus = -1;
  overlay.style.display = 'none';
  state.mode = 'playing';
}

// ---------- EVOLUTION draft (wave-7/A, evolutions.js) -----------------------
// Surfaced the moment a weapon hits Lv8 AND its required item kind is
// equipped AND a token is banked. The card is built from describeEvolution;
// evolveWeapon mutates the SAME weapon instance (levelUpWeapon precedent)
// and spends the token. Declines are suppressed until a new token or item
// lands (otherwise the check would re-open every frame).
function equippedItemKinds() {
  return new Set(state.items.flatMap(it => (it.affixes || []).map(a => a.id)));
}

function evolutionCandidates() {
  const kinds = equippedItemKinds();
  return state.weapons.filter(w =>
    !w.evolutionId && !w.evoDeclined &&
    EVOLUTION_DEFS[w.type] &&
    (w.level || 1) >= WEAPON_MAX_LEVEL &&
    kinds.has(EVOLUTION_DEFS[w.type].itemKind) &&
    state.evoTokens > 0);
}

function maybeOpenEvolve() {
  if (state.mode !== 'playing') return;
  const cands = evolutionCandidates();
  if (cands.length === 0) return;
  state.mode = 'evolve';
  overlay.style.display = 'flex';
  ovTitle.textContent = 'EVOLUTION';
  ovTitle.className = 'logo';
  ovSub.textContent = 'a maxed weapon + its item kind + a token';
  ovCards.innerHTML = '';
  // WAVE-23 FIX (desktop audit #5): every card was labelled `[1]` while the
  // keydown handler routes 1-4 to ovCards.children[n-1] — so pressing [2]
  // picked the second card the label called "[1]". Label each card with its
  // own position (the same index the number key resolves to).
  cands.forEach((w, i) => {
    const card = describeEvolution(w);
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML =
      `<div class="name">EVOLVE: ${card.name}</div>` +
      `<div class="desc">${card.desc}<br>${card.weaponName} Lv${card.levelReq} + ${card.itemKindName} + ${card.tokenCost} token</div>` +
      `<div class="key">[${i + 1}]</div>`;
    el.onclick = () => {
      const res = evolveWeapon(w, equippedItemKinds(), state.evoTokens);
      if (res.ok) {
        state.evoTokens = res.tokens;
        // WAVE-9: a weapon EVOLUTION charges +2 heat (event-id deduped, so a
        // double-fired tick can never double-charge).
        addHeat(state, 'WEAPON_EVOLUTION', null, 'evo:' + w.type + ':' + res.name);
        toast(res.name.toUpperCase() + ' UNLEASHED');
        audio.playSfx('levelup');
        // WAVE-26 FEATURE 4: an evolution is one of the two EARNED slow-mo
        // moments — brief dilation + the crackle flare, back to normal after.
        triggerEarnedMoment('evolution', state.player.x, state.player.y);
      }
      closeEvolve();
    };
    ovCards.appendChild(el);
    frameCard(el);
  });
  // NOT NOW takes the next number key when it fits the 1-4 routing window
  // (3+ candidates can overflow it — then it stays mouse/click only).
  const notNow = menuCard('NOT NOW', 'keep the token - re-offered on the next token or item', () => {
    for (const w of cands) w.evoDeclined = true;
    closeEvolve();
  });
  if (cands.length + 1 <= 4) {
    notNow.innerHTML += `<div class="key">[${cands.length + 1}]</div>`;
    // A real browser re-serializes innerHTML on += and drops the painted
    // frame canvas with it; frameCard is idempotent, so re-frame after the
    // mutation (the stub DOM keeps the child and this is a no-op repaint).
    frameCard(notNow);
  }
}

function closeEvolve() {
  overlay.style.display = 'none';
  state.mode = 'playing';
}

// ===========================================================================
// WAVE-26 FEATURE 4 — EARNED TIME DILATION + GLOW
// Sk408's game-feel law: juice is glowy and crackly, but screen shake and
// slow-motion are RARE and EARNED — if they fire often they become noise.
// Exactly two triggers qualify: a weapon EVOLUTION and a BOSS KILL. Never an
// ordinary hit, never a level-up, never a chest.
//
// FRAME-RATE INDEPENDENCE: the window is measured in WALL-CLOCK seconds and
// decays with the *real* frame dt (advanceDilation(realDt)), while only the
// SIMULATION is scaled (dt = realDt * timeScale). 60Hz and 120Hz therefore
// spend the same wall-clock time in slow-mo and see the same sim distance.
//
// NO STACKING: the scale is taken as a MIN and the window as a MAX, never a
// product — two events landing in the same frame (or a boss dying on the same
// frame a weapon evolves) cannot compound into a freeze. The window expiring
// resets the scale to EXACTLY 1.
// ===========================================================================
const dilation = { scale: 1, remaining: 0 };
const DILATION_FLOOR = C.DILATION.FLOOR;

function triggerDilation(scale, duration) {
  const s = Math.min(1, Math.max(DILATION_FLOOR, Number(scale) || 1));
  const d = Math.max(0, Number(duration) || 0);
  if (d <= 0) return dilation.scale;
  dilation.scale = Math.min(dilation.scale, s);          // never multiplies
  dilation.remaining = Math.max(dilation.remaining, d);  // never adds
  state.timeScale = dilation.scale;
  return dilation.scale;
}

// Called once per rendered frame with the REAL (unscaled) dt. Returns the
// scale the simulation should use this frame; exactly 1 once the window ends.
function advanceDilation(realDt) {
  if (dilation.remaining <= 0) {
    if (dilation.scale !== 1) dilation.scale = 1;
    state.timeScale = 1;
    return 1;
  }
  dilation.remaining -= realDt;
  if (dilation.remaining <= 0) {
    dilation.remaining = 0;
    dilation.scale = 1;
  }
  state.timeScale = dilation.scale;
  return state.timeScale;
}

// One earned moment = a short dilation + a matching pixel-art flourish (the
// flare burst / vignette / chromatic fringe in render.js drawMoment). kind is
// 'evolution' | 'boss' | 'finale'; boss/finale only differ by flavour tint.
function triggerEarnedMoment(kind, x, y) {
  const d = kind === 'evolution' ? C.DILATION.EVOLUTION : C.DILATION.BOSS;
  triggerDilation(d.SCALE, d.DURATION);
  // Non-stacking flourish too: a newer moment replaces the older one outright.
  state.moment = { kind, x, y, age: 0, ttl: Math.max(d.DURATION, 0.55) };
  return state.moment;
}

// ===========================================================================
// WAVE-26 FEATURE 1 — DEATH AS PAYOFF, NOT A WALL
// Players lose most runs, so the end screen is the most-seen screen in the
// game. The data already exists: state.deathBy (stamped by die() from
// lastDamageSource). This block turns it into one 3-second read: how far you
// got, what killed you, what you earned, and the single shop row the run just
// brought within reach.
// ===========================================================================

// Legible cause line from state.deathBy. Never invents a source: a boss keeps
// its proper name, a typed enemy keeps its type id (all nine are already
// readable words), and an unknown source degrades to the horde itself.
function deathCauseLabel(d) {
  const by = d || {};
  const who = by.name || (by.bossId ? String(by.bossId) : (by.typeId ? String(by.typeId) : null));
  const how = by.cause === 'contact' ? 'in melee'
    : by.cause === 'shot' ? 'at range'
      : by.cause === 'drain' ? 'latched on and drained you'
        : null;
  if (!who) return 'THE HORDE';
  return who + (how ? ' ' + how : '');
}

// The single shop row this run came CLOSEST to affording — real meta data
// (SHOP_UPGRADES + upgradeCost), never an invented number. Skips anything
// already owned/maxed; ties resolve to the cheaper row.
function nextUnlockWithinReach(prof) {
  let best = null;
  for (const def of SHOP_UPGRADES) {
    if (shopRowOwned(prof, def)) continue;
    const level = def.kind ? 0 : (prof.purchased[def.id] || 0);
    const cost = def.kind ? def.baseCost : upgradeCost(def, level);
    if (!best || cost < best.cost) best = { id: def.id, name: def.name, cost };
  }
  return best;
}

// Compact end-screen body. `lead` is the run's shape (wave/time/level/kills),
// `cause` the cause line, `gold` this run's payout. E1: the payout has TWO
// parts now (the FIXED award and the banked purse remainder) and the card
// shows both, never one blended number — `parts` is settleRunGold's breakdown.
// The unlock line is omitted entirely when every row is owned — no filler.
function endScreenBody({ lead, cause = null, gold, firstClear, parts = null }) {
  const goal = nextUnlockWithinReach(profile);
  // G11: a challenge result must be distinguishable from a clean clear — the
  // mode is the LEAD line's first clause, and only when non-standard (a
  // STANDARD run renders byte-identically to today). G20a: a non-default
  // stage gets its own clause beside it (same rule: the default stage renders
  // byte-identically to today).
  let html = !isStandard(state.challenge)
    ? `<span class="cause">${challengeOf(state.challenge).name} RUN</span><br>` + lead
    : lead;
  if (!isDefaultStage(state.stage)) {
    html = `<span class="cause">${stageOf(state.stage).name}</span><br>` + html;
  }
  if (cause) html += `<br><span class="cause">KILLED BY ${cause}</span>`;
  html += `<br><span class="earn">GOLD EARNED: +${gold}` +
    `${firstClear ? ' (NEW BEST TIME!)' : ''} · BANK ${profile.gold}</span>`;
  if (parts) {
    html += `<br><span class="earn">AWARD +${parts.award}` +
      `${parts.winBonus ? ` · BONUS +${parts.winBonus}` : ''}` +
      ` · PURSE BANKED +${parts.purseBanked}</span>`;
  }
  if (goal) {
    const gap = goal.cost - profile.gold;
    html += `<br><span class="next">NEXT UNLOCK: ${goal.name} ${goal.cost}g · ` +
      (gap > 0 ? `${gap}g TO GO` : 'READY NOW') + '</span>';
  }
  return html;
}

// WAVE-18: shared run settlement — death AND the END RUN card pay out
// through the exact same accounting (first-clear bonus + gold multipliers).
// Meta payout: gold into the profile (+first-clear bonus on a new best).
// NOTE (W1): the profile layer preserves unknown fields verbatim and is now
// versioned (src/save.js), so bestTime DOES persist across sessions — the
// old "per-session only" caveat is gone.
// E1: the payout is FIXED award x goldMult + the banked purse remainder
// (owner directive 2026-09-14) — the Greed shop line + Midas items multiply
// the AWARD. WAVE-9: RAISE THE STAKES multiplies on top —
// goldMult tracks MANUAL pushes ONLY (built-in heat never inflates gold).
// G9 — ACHIEVEMENTS ARE EARNED HERE, ONCE PER RUN.
//
// settleRunGold is the single funnel EVERY run end passes through (die,
// runSurvived, endRun), so the achievement fold lives here instead of in each
// of those three callers: a run can only be measured once, and a fourth way to
// end a run would inherit the whole feature for free. recordRun() updates
// profile.achievements AND grants whatever the newly earned trophies unlock
// (gold-free by design — achievements.js owns both halves); the toasts below
// are the player-facing half.
//
// WHAT THE SUMMARY CARRIES TODAY, honestly: kills, wave, time, the settled
// gold, the best weapon level in the run, evolutions, legendary item count and
// survived. Only what THIS state actually tracks is reported, so a run can no
// longer earn a trophy for a counter it does not keep — boss-kill, chest and
// untouched-wave trophies stay unearned until the run summary grows those
// counters (recordRun already accepts them, so that is a one-line change when
// the counters land).
function recordRunAchievements(gold) {
  const p = state.player;
  let bestWeaponLevel = 0;
  for (const w of state.weapons) bestWeaponLevel = Math.max(bestWeaponLevel, w.level || 1);
  // Which unlock targets were ALREADY owned before this run settled. applyUnlocks
  // reports ok:true for a row that was already owned (granting is idempotent),
  // and toasting "UNLOCKED" for something the player bought last week would be a
  // small lie — so newness is measured against this snapshot, not against ok.
  const ownedBefore = new Set();
  for (const a of ACHIEVEMENTS) {
    if (a.unlock && ownsUnlock(profile, a.unlock)) ownedBefore.add(a.unlock.kind + ':' + a.unlock.id);
  }

  const res = recordRun(profile, {
    kills: p.kills,
    gold,
    wave: state.wave.num,
    time: state.time,
    weaponLevel: bestWeaponLevel,
    evolutions: state.weapons.filter(w => !!w.evolution).length,
    legendaries: state.items.filter(it => it.rarity === 'LEGENDARY').length,
    // G9 FOLLOW-UP: the counters wired out of live state — FIRST_BOSS,
    // BOSS_SLAYER_5, CHESTS_25 and UNTOUCHED_WAVE were unearnable before this.
    bossKills: state.runCounts.bossKills,
    chests: state.runCounts.chests,
    untouchedWave: !!state.runCounts.untouchedWave,
    survived: !!state.runWon,
  });

  // AT MOST TWO toasts, ever: a run can earn several trophies at once and the
  // event feed only shows three lines, so each category gets ONE line naming
  // them. Two lines keep the earn moment readable instead of burying it under
  // its own feedback.
  //   * the trophy name comes from the ART (TROPHY_ART) with ACHIEVEMENT_BY_ID
  //     as the gate — a future/unknown id can never reach the player as a
  //     blank line;
  //   * the unlock name comes from unlockLabel()'s live catalogs.
  const trophyName = id => (ACHIEVEMENT_BY_ID[id] && TROPHY_ART[id] && TROPHY_ART[id].name) || id;
  if (res.earned.length) toast('TROPHY: ' + res.earned.map(trophyName).join(' · '), '#ffd75e');
  const granted = [];
  for (const u of res.unlocks) {
    if (!u.ok) continue;
    if (ownedBefore.has(u.kind + ':' + u.id)) continue;
    if (granted.some(x => x.kind === u.kind && x.id === u.id)) continue;
    granted.push(u);
  }
  if (granted.length) toast('UNLOCKED: ' + granted.map(unlockLabel).join(' · '), '#7ad0ff');
  return res;
}

function settleRunGold({ winBonus = 0 } = {}) {
  const p = state.player;
  const firstClear = state.time > (profile.bestTime || 0);
  if (firstClear) profile.bestTime = Math.floor(state.time);
  // E1 (owner directive 2026-09-14): the end-of-run meta award is a FIXED
  // amount — computeRunGold is RETIRED as the payout authority (it stays a
  // pure helper with its own test). The goldMult chain (GREED x manual stakes
  // x rampage best) multiplies the AWARD only; FIRST_CLEAR and the maw /
  // completion winBonus stay SEPARATE additions on top. Performance pays
  // through the banked purse remainder: the run's tier-weighted in-run
  // earnings land here, unspent.
  const mult = (p.stats.goldMult || 1) * goldMult(manualPushes(state)) * rampageGoldMult();
  const award = Math.round(RUN_GOLD.AWARD * mult) + (firstClear ? RUN_GOLD.FIRST_CLEAR : 0);
  const purseBanked = profile.runPurse | 0;
  const gold = award + purseBanked + winBonus;
  profile.gold += gold;
  // THE DOUBLE-BANK TRAP: the purse MUST be zeroed as part of settlement, or
  // the next run's settlement banks the same remainder a second time.
  profile.runPurse = 0;
  state.runPurse = 0;
  // G9: fold the finished run into the profile (earn + grant) BEFORE the save,
  // so the trophies and the gold they were settled alongside persist together.
  recordRunAchievements(gold);
  saveProfile(profile);
  return { gold, award, purseBanked, winBonus, firstClear };
}

// ---------- RUN LIMIT + THE WIN STATE (RUN-STRUCTURE wave) -------------------
// The run has a LENGTH now, and reaching it is a discrete victory ("RUN
// SURVIVED") — the second way a run can end, alongside death. Shape copied
// from the genre's completion payout: a flat bonus for the completion plus a
// depth term for every wave cleared past the maw milestone.
//
// It is a true end, not a VS-style overtime Reaper: the run terminates at the
// limit. See the long comment on CONFIG.RUN for why (a bounded run is what
// makes the ladder climbable and the win payable).
function survivedBonus() {
  const past = Math.max(0, (state.wave.num || 1) - C.ESCALATION.END_WAVE);
  return C.RUN.SURVIVED_BONUS + C.RUN.DEPTH_BONUS * past;
}

function runSurvived() {
  if (state.mode !== 'playing' && state.mode !== 'finale') return;
  const p = state.player;
  state.mode = 'dead';        // the terminal mode — already freezes the sim
  state.runWon = true;
  state.deathBy = null;       // nobody killed you; do not print a cause line
  audio.stopMusic();
  audio.playSfx('levelup');
  // The biggest earned moment in the game, same flourish the finale kill used.
  triggerEarnedMoment('finale', p.x, p.y);
  const bonus = survivedBonus();
  const { gold, firstClear, award, purseBanked } = settleRunGold({ winBonus: bonus });
  ovTitle.textContent = 'RUN SURVIVED';
  ovTitle.className = 'logo';
  ovSub.innerHTML = endScreenBody({
    lead: `the horde could not break you · lasted the full ${runClock(C.RUN.LIMIT)}` +
      ` · wave ${state.wave.num} · level ${p.level} · ${p.kills} kills` +
      `<br><span class="earn">COMPLETION BONUS: +${bonus}` +
      `${state.mawCleared ? ' · MAW SLAIN' : ''}</span>`,
    cause: null,                // you did not die — you won
    gold, firstClear,
    parts: { award, purseBanked, winBonus: bonus },
  });
  ovCards.innerHTML = '';
  menuCard('RETRY', 'straight back in [R]', () => startRun());
  menuCard('TITLE', 'spend your gold [T]', () => showTitle());
  overlay.style.display = 'flex';
}

// Per simulated frame, AFTER state.time advances and BEFORE any damage is
// resolved: the run clock, the last-minute callout, and the win itself. The
// win fires at state.time >= LIMIT exactly — never before (the run-structure
// tests drive the real loop to prove both halves).
function checkRunLimit() {
  if (state.runWon || state.mode === 'dead') return false;
  // E1: the run's own periodic flush. Per-kill purse credits deliberately do
  // NOT write storage per corpse, so the wallet's persistence is: this flush
  // + the exit flush (autosave on pagehide/beforeunload/visibilitychange) +
  // every spend/settle save. 10s of sim time bounds what a mid-run reload
  // can lose; localStorage writes are synchronous and tiny.
  if (state.time - lastPurseFlush >= 10) {
    lastPurseFlush = state.time;
    saveProfile(profile);
  }
  const mins = Math.floor(state.time / 60);
  if (mins > state.lastMinute) {
    state.lastMinute = mins;
    if (mins * 60 < C.RUN.LIMIT) toast(`TIME ${runClock(mins * 60)} / ${runClock(C.RUN.LIMIT)}`);
  }
  if (!state.finalCall && state.time >= C.RUN.FINAL_CALL_AT) {
    state.finalCall = true;
    toast('ONE MINUTE LEFT');
    audio.playSfx('levelup');
  }
  if (state.time >= C.RUN.LIMIT) { runSurvived(); return true; }
  return false;
}

// WAVE-18 (#6, "no way to exit a run early"): deliberate run exit from the
// in-run settings. Two-tap confirmed (see the END RUN card), settles through
// settleRunGold (same payout as a death — gold is KEPT), then lands on the
// existing end-card flow with its own copy.
function endRun() {
  // 'settings' is the paused-in-run screen (settingsReturn holds the live
  // mode) — confirming from there is the whole point of this card.
  if (state.mode !== 'playing' && state.mode !== 'finale' && state.mode !== 'settings') return;
  const p = state.player;
  state.mode = 'dead';
  audio.stopMusic();
  audio.playSfx('button');
  const { gold, firstClear, award, purseBanked } = settleRunGold();
  ovTitle.textContent = 'RUN ENDED';
  ovTitle.className = '';
  ovSub.innerHTML = endScreenBody({
    lead: `you called it at wave ${state.wave.num} · survived ${Math.floor(state.time)}s` +
      ` (${runClock(state.time)} / ${runClock(C.RUN.LIMIT)}) · level ${p.level} · ${p.kills} kills`,
    cause: null,          // a deliberate exit has no killer
    gold, firstClear,
    parts: { award, purseBanked, winBonus: 0 },
  });
  ovCards.innerHTML = '';
  menuCard('RETRY', 'straight back in [R]', () => startRun());
  menuCard('TITLE', 'spend your gold [T]', () => showTitle());
  overlay.style.display = 'flex';
  maybeDeathCoach();
}

// WAVE-22 (rev-4 item 4): the first death is the moment the player most
// needs to know the loop continues — one coach, once ever, on the end
// screen ('dead' mode already freezes everything; the Tour engine is
// event-driven so it runs without the frame loop).
function maybeDeathCoach() {
  if (tourFlag(TOUR_KEYS.death)) return;
  startCoach({ id: 'death',
    text: 'Death banks its gold — RETRY (R) straight back in, TITLE (T) to spend it. Every death funds the next run.',
    target: () => cardByTitle('RETRY') }, TOUR_KEYS.death);
}

// WAVE-20 death-cause tracking: the damage paths stamp the source here right
// before die() can fire; die() freezes it (plus wave/time) onto state.deathBy
// for the run-history HUD-adjacent consumers and tools/boss_sim.mjs.
let lastDamageSource = null;

function die(finale) {
  const p = state.player;
  // W7b MYTHIC Second Wind: the run's one revive. Fires on ANY lethal hit
  // (contact, shot, drain, finale) exactly once per run — die() is the single
  // death seam, so the intercept lives here and no damage path needs to know.
  // Revive at SECOND_WIND_HP_FRAC of max HP (owner spec) with a short invuln
  // window (reuses p.invuln and its render blink): a second chance, not a
  // double death inside the same horde. The deliberate-exit path (endRun)
  // never reaches here, so it can never spend the revive.
  if (p.stats.secondWind && !state.secondWindUsed) {
    state.secondWindUsed = true;
    p.hp = Math.max(1, p.stats.maxHp * DRAFT_LADDER.SECOND_WIND_HP_FRAC);
    p.invuln = Math.max(p.invuln || 0, DRAFT_LADDER.SECOND_WIND_INVULN);
    toast('SECOND WIND - BACK AT ' + Math.round(p.hp) + ' HP', RARITY.MYTHIC.tell.outline);
    audio.playSfx('levelup');
    return;
  }
  state.mode = 'dead';
  state.deathBy = {
    ...(lastDamageSource || { cause: 'unknown' }),
    wave: state.wave.num,
    time: state.time,
  };
  audio.stopMusic();
  audio.playSfx('death');
  const { gold, firstClear, award, purseBanked } = settleRunGold();

  // WAVE-10: dying to the maw gets its own dramatic card (same payout).
  ovTitle.textContent = finale ? 'THE HORDE CLAIMS ALL' : 'THE HORDE WINS';
  ovTitle.className = finale ? 'logo' : '';
  ovSub.innerHTML = endScreenBody({
    lead: (finale ? 'the maw swallowed the last hero<br>' : '') +
      `WAVE ${state.wave.num} · survived ${Math.floor(state.time)}s` +
      ` (${runClock(state.time)} / ${runClock(C.RUN.LIMIT)}) · level ${p.level} · ${p.kills} kills`,
    cause: deathCauseLabel(state.deathBy),
    gold, firstClear,
    parts: { award, purseBanked, winBonus: 0 },
  });
  ovCards.innerHTML = '';
  menuCard('RETRY', 'straight back in [R]', () => startRun());
  menuCard('TITLE', 'spend your gold [T]', () => showTitle());
  overlay.style.display = 'flex';
  maybeDeathCoach();
}

// ---------- WAVE-12: text-HUD toggle (persisted, audio.js storage shim) ------
// The canvas HUD chrome (render.js drawHudChrome) is the default readout now;
// the old text #hud stays fully functional but hidden unless opted in here.
// WAVE-25 (audit 2.7): no second shim — this used to be a byte-identical copy
// of prefStorage; every persisted pref now shares the one instance above.
const KEY_HUD_TEXT = 'hordes_hud_text';
let textHudOn = false;
try { textHudOn = prefStorage.getItem(KEY_HUD_TEXT) === '1'; } catch { /* shim */ }
function hudTextEnabled() { return textHudOn; }
function setHudTextEnabled(b) {
  textHudOn = !!b;
  try { prefStorage.setItem(KEY_HUD_TEXT, textHudOn ? '1' : '0'); } catch { /* shim */ }
}

// ---------- G11: the pending challenge mode (SESSION-scoped, never persisted) ----
// The title screen's CHALLENGE card cycles this. startRun() stamps it onto the
// run-scoped state.challenge and derives the rule ceilings from it — nothing is
// written to the profile or storage, so a reload returns to STANDARD and a
// challenge run mutates nothing persistent (the brief's bar, tested).
let pendingChallenge = DEFAULT_CHALLENGE_ID;
function cyclePendingChallenge() {
  pendingChallenge = nextChallengeId(pendingChallenge);
  return pendingChallenge;
}

// ---------- G20a: the pending stage (SESSION-scoped, never persisted) --------
// Mirror of the challenge pattern: the title screen's STAGE card cycles this,
// startRun() stamps it onto run-scoped state.stage, and nothing is written to
// the profile or storage — a reload returns to VERDANT HOLLOW. The gate is an
// EXISTING achievement id read through achievements.isEarned on the live
// profile; locked stages are skipped by the cycler entirely.
let pendingStage = DEFAULT_STAGE_ID;
function stageUnlocked(id) {
  const s = stageOf(id);
  return !s.unlock || isEarned(profile, s.unlock.achievementId);
}
function cyclePendingStage() {
  pendingStage = nextStageId(pendingStage, stageUnlocked);
  return pendingStage;
}
// The title card's sub-line: the live selection first, then the plain-word
// requirement for stages still locked on THIS profile. G20b: with an
// 8-stage ladder the full locked list no longer fits a 390px phone card, so
// the card names the FIRST TWO (the next rungs on the ladder) and counts the
// rest — lockedStageLines() still emits every line for tests.
function stageCardSub() {
  const locked = lockedStageLines(stageUnlocked);
  const head = locked.slice(0, 2).join(', ');
  const more = locked.length > 2 ? ' +' + (locked.length - 2) + ' more' : '';
  return describeStage(pendingStage) +
    (locked.length ? ' · locked: ' + head + more : '') + ' · press to change';
}

// ---------- WAVE-16: world zoom setting (persisted, same storage shim) --------
// Sk408: fine pixel detail gets lost on small mobile screens. Ladder is the
// sanctioned 1x -> 2x -> 3x -> 4x -> 6x -> 8x -> 1x cycle. render() reads
// state.zoom EVERY frame, so changes apply live mid-run; startRun never
// touches it (presentation preference, not run state).
const KEY_ZOOM = 'hordes_zoom';
const ZOOM_LADDER = [1, 2, 3, 4, 6, 8];
function zoomIndex() {
  const i = ZOOM_LADDER.indexOf(state.zoom);
  return i < 0 ? 0 : i;
}
function setZoom(z) {
  state.zoom = ZOOM_LADDER.includes(z) ? z : 1;
  try { prefStorage.setItem(KEY_ZOOM, String(state.zoom)); } catch { /* shim */ }
}
function cycleZoom(dir = 1) {
  const n = ZOOM_LADDER.length;
  const next = ZOOM_LADDER[((zoomIndex() + dir) % n + n) % n];
  setZoom(next);
  toast('ZOOM ' + next + 'x');
  return next;
}
try {
  const savedZoom = parseInt(prefStorage.getItem(KEY_ZOOM), 10);
  if (ZOOM_LADDER.includes(savedZoom)) state.zoom = savedZoom;
} catch { /* shim */ }

// ---------- WAVE-19: first-run onboarding flag (same storage shim) ------------
// HOW TO PLAY auto-pops ONCE on first boot (before the first run starts) and
// never again; the title menu keeps a HOW TO PLAY button so it is always
// re-openable. The shim keeps headless tests green (no-op storage = the flag
// simply never persists, and the smoke drives both paths explicitly).
const KEY_ONBOARD = 'hordes_onboarded';
function onboardingDone() {
  try { return prefStorage.getItem(KEY_ONBOARD) === '1'; } catch { return false; }
}
function completeOnboarding() {
  try { prefStorage.setItem(KEY_ONBOARD, '1'); } catch { /* shim */ }
}

// ---------- WAVE-19 HOW TO PLAY (Sk408: first-run onboarding) -------------------
// One screen, terse pixel tone, no walls: the point of the game in one line,
// then per-button callouts for BOTH input schemes (same overlay for desktop
// and mobile — the lists carry both). Built as a menu-family screen (openMenu
// cards, existing .card styling): it can only be reached from the title menu
// or first boot, so it NEVER pauses a live run. GOT IT dismisses + sets the
// one-time flag; ESC dismisses via the standard menu-escape branch.
function showHowToPlay() {
  openMenu();
  ovTitle.textContent = 'HOW TO PLAY';
  ovTitle.className = '';
  ovSub.innerHTML =
    'SURVIVE THE WAVES. your pilot auto-fights —<br>' +
    'you steer the BUILD: draft weapons, bank gold, outlast the finale.';
  menuCard('TOUCH',
    'joystick — move (manual pilot)<br>' +
    'FOCUS — volley target: NEAREST / TOUGHEST / SWARM / RANGED<br>' +
    'STANCE — risk dial: SAFE / BALANCED / GREEDY<br>' +
    'PILOT — auto &harr; manual<br>' +
    'STATS — your build &amp; gear<br>' +
    'FROST / OVER — skills &middot; HP / MP — potions<br>' +
    'cog (top-right) — settings: zoom, END RUN');
  menuCard('KEYBOARD',
    'M — pilot auto/manual &middot; arrows / WASD — move<br>' +
    'TAB — focus &middot; G — stance<br>' +
    'Q — frost nova &middot; E — overcharge (W too, in AUTO)<br>' +
    'H / N — potions &middot; I — field report (the ONE stats key)<br>' +
    '1 – 3 — draft cards (1 – 4 in evolve / intermission) &middot; 1 – 6 — stat tabs<br>' +
    'C — continue &middot; R / T — retry / title<br>' +
    '+ / - — zoom &middot; mouse — the cog (top-right) opens settings<br>' +
    'ESC or P — pause in a run (the same screen as the cog) &middot; ESC — close menus<br>' +
    '? — show / hide the on-screen key hints');
  // WAVE-22: the field itself was undocumented — the exhaustive reference
  // for everything that isn't a button or a key lives here (rev-4: controls
  // the tour skips must be documented HERE or dropped).
  menuCard('THE FIELD',
    'chests — walk in: item, upgrades… or nothing + a mini-horde<br>' +
    'portal — walk through to bank the wave<br>' +
    'arches — cross the gate for a timed buff<br>' +
    'shrines — drift close, gold buys a blessing<br>' +
    'intermission — paid chests (40/25/10% nothing), blessings,<br>' +
    'RAISE THE STAKES (+heat for run gold) &middot; tokens evolve maxed weapons<br>' +
    'CHALLENGE &mdash; title-screen card: pick a rule-constrained run mode<br>' +
    '(ONE WEAPON / NO POTIONS); the HUD names the live mode');
  menuCard('GOT IT', 'into the horde (shows once)', () => {
    completeOnboarding();
    showTitle();
  });
}

// ---------- Meta screens: title / shop / characters / settings ----------
//
// U1b AUTHORED PIXEL FRAME (owner 2026-09-14: "custom somewhat like this..
// like it is part of the screen"). Every .card carries its OWN canvas layer
// (class "frame", a child of the card — elements['ov-cards'].children[i]
// stays the clickable card itself, nothing is wrapped). The canvas is painted
// with the authored 9-slice pixel frame (src/art/menu_frame.js) through the
// renderer's drawGrid seam, sized to the card's box PLUS the shadow offset,
// so the cast shadow is painted pixels OUTSIDE the card box — the thing the
// CSS clip-path plaque could never do (the clip cut the card's own 0-blur
// drop-shadow). States (hover/focus crimson, equipped gold) REPAINT the same
// grid with a swapped palette, so the silhouette can never jump. The frame is
// static: no clock, no dt, so 60Hz and 120Hz are identical by construction.
// Stub DOMs (no clientWidth, or canvas without getContext) keep the markup
// only — the canvas child is the contract there, the pixels are the
// browser's, exactly like paintTitleHeader.
let frameHotEl = null;
function frameCard(el) {
  if (!el || typeof el.appendChild !== 'function') return el;
  let cv = null;
  for (const c of (el.children || [])) { if (c && c.className === 'frame') { cv = c; break; } }
  if (!cv) {
    cv = document.createElement('canvas');
    cv.className = 'frame';
    if (cv.setAttribute) cv.setAttribute('aria-hidden', 'true');
    el.appendChild(cv);
  }
  const paint = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (typeof w !== 'number' || typeof cv.getContext !== 'function') return true;
    if (!w || !h) return false;   // real browser, overlay not laid out yet: retry below
    const g = cv.getContext('2d');
    if (!g) return true;
    const cls = el.className || '';
    const tone = cls.includes('selected') ? 'sel'
      : (frameHotEl === el && !cls.includes('dim')) ? 'hot' : 'base';
    const wpx = Math.round(w), hpx = Math.round(h);
    cv.width = wpx + MENU_FRAME_SHADOW.dx;
    cv.height = hpx + MENU_FRAME_SHADOW.dy;
    renderer.drawGrid(g, composeMenuFrame(wpx, hpx).grid, MENU_FRAME_PALETTES[tone], 0, 0);
    return true;
  };
  if (!paint()) {
    let tries = 0;
    const retry = () => { if (!paint() && ++tries < 8) requestAnimationFrame(retry); };
    requestAnimationFrame(retry);
  }
  // Late relayout (a menu re-wrap, a viewport change, a state line settling)
  // re-measures and repaints — the frame always matches the card's live box.
  if (typeof ResizeObserver === 'function' && !el._frameRO) {
    el._frameRO = new ResizeObserver(() => { paint(); });
    el._frameRO.observe(el);
  }
  if (typeof el.addEventListener === 'function' && !el._frameWired) {
    el._frameWired = true;
    const on = () => { frameHotEl = el; paint(); };
    const off = () => { if (frameHotEl === el) frameHotEl = null; paint(); };
    el.addEventListener('mouseenter', on);
    el.addEventListener('mouseleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
  }
  return el;
}

function menuCard(name, sub, onclick, dim) {
  const el = document.createElement('div');
  el.className = 'card' + (dim ? ' dim' : '');
  el.innerHTML = `<div class="name">${name}</div><div class="desc">${sub || ''}</div>`;
  el.onclick = () => { audio.playSfx('button'); onclick(); };
  ovCards.appendChild(el);
  frameCard(el);
  return el;
}

function openMenu(mode = 'menu') {
  // Common frame for every meta screen; caller fills ovCards. WAVE-17: the
  // in-run SETTINGS screen passes its own pause mode ('settings') so the
  // frame loop keeps NOT ticking — identical pause contract to 'stats'.
  state.mode = mode;
  overlay.style.display = 'flex';
  ovCards.innerHTML = '';
  ovCards.style.flexWrap = 'wrap';
  ovCards.style.justifyContent = 'center';
  // G9: the TROPHY GALLERY is the one screen that wants the canvas art visible
  // behind the cards, so it sets these two inline overrides AFTER calling this
  // function (showTrophies). The reset lives HERE so the overrides cannot leak:
  // a 'transparent' background would make the shop or the characters screen
  // show the frozen world through its cards. '' returns both to the stylesheet.
  overlay.style.background = '';
  overlay.style.justifyContent = '';
  // G12: same reset for the title's hidden DOM <h1> (the title card's own
  // wordmark replaces it there; every other screen wants it back).
  if (ovTitle.style) ovTitle.style.display = '';
  // N2: same reset for the reveal's opacity/pointer gating. The title fades
  // its menu in over the art; no other screen may inherit a partial opacity,
  // and leaving the title mid-fade must hand the NEXT screen a full sheet.
  overlay.style.opacity = '';
  overlay.style.pointerEvents = '';
}

// ---------- WAVE-21 FIRST-RUN TOUR (docs/FIRST_RUN_TOUR_2026-09-11.md) ------
// Staged spotlight walkthrough. Stage 1 = title cards, first load only; stage
// 2 = in-run coachmarks that fire the first time each element matters, with
// the sim PAUSED under them (frame() gates update on coachActive()). The doc's
// "mode select"/"division selector" have no on-screen elements — the tour's
// never-break rule skips them; EXIT-RUN is taught at the in-run cog (the only
// place it exists).
const cardByTitle = (t) => [...ovCards.children].find(c => (c.innerHTML || '').includes(`>${t}<`));

// Canvas-region pseudo-target: a rect in the 480x300 native space projected
// through the canvas's on-screen rect, so HUD-region spotlights land at any
// CSS scale (phone letterbox included).
function canvasRegion(x, y, w, h) {
  return {
    getBoundingClientRect() {
      const r = canvas.getBoundingClientRect();
      const sx = r.width / C.VIEW_W, sy = r.height / C.VIEW_H;
      return {
        left: r.left + x * sx, top: r.top + y * sy,
        right: r.left + (x + w) * sx, bottom: r.top + (y + h) * sy,
        width: w * sx, height: h * sy,
      };
    },
  };
}

let menuTour = null;
let coach = null;
function coachActive() { return !!(coach && coach.active()); }

function maybeStartMenuTour() {
  if (tourStage1Done() || menuTour || (state.mode !== 'menu' && state.mode !== 'title')) return;
  const finish = () => { setTourFlag(TOUR_KEYS.stage1, true); menuTour = null; };
  // G12: the tour is built against the LIVE title menu, so the fresh-browser
  // LOAD FROM DISK card is taught exactly when it exists (a step for a missing
  // card would be skipped by the never-break rule, but naming it here keeps
  // the taught-count contract exact: every title card, or a recorded
  // discovery exemption).
  const steps = [
    { id: 'START', text: 'START GAME begins a run — pilot the horde as long as you can.',
      target: () => cardByTitle('START GAME') },
  ];
  if (!hasLocalSave()) {
    steps.push({ id: 'LOAD', text: 'LOAD FROM DISK imports a saved profile from another browser.',
      target: () => cardByTitle('LOAD FROM DISK') });
  }
  steps.push(
      { id: 'SHOP', text: 'SHOP: every run (even a death) pays gold for PERMANENT upgrades.',
        target: () => cardByTitle('SHOP') },
      { id: 'CHARACTERS', text: 'CHARACTERS unlock pilots with different starting kits.',
        target: () => cardByTitle('CHARACTERS') },
      // U1 (owner 2026-09-14): TROPHIES/BESTIARY moved behind PROGRESS and
      // CHALLENGE/STAGE/SETTINGS/HOW TO PLAY behind SETUP. The tour teaches the
      // DOORS and names their contents, so the moved screens are still taught
      // (never merely exempted) and test_tour's "TROPHIES is taught" contract
      // keeps biting. One step per title card remains the rule.
      { id: 'PROGRESS', text: 'PROGRESS \u2014 TROPHIES and the BESTIARY: everything you have earned and met.',
        target: () => cardByTitle('PROGRESS') },
      { id: 'SETUP', text: 'SETUP \u2014 CHALLENGE, STAGE, SETTINGS and HOW TO PLAY.',
        target: () => cardByTitle('SETUP') },
      // G12: the new LAST card is taught too — a quit button nobody introduced
      // reads as dangerous.
      { id: 'EXIT', text: 'EXIT GAME saves your progress and quits.',
        target: () => cardByTitle('EXIT GAME') },
  );
  menuTour = new Tour({
    // Player-flow order: what you press first reads first.
    steps,
    onDone: finish, onSkip: finish,
    // WAVE-23 (#6): input-aware advance wording — "TAP" reads wrong on a
    // desktop with no touch (Sk408). Any key also advances (tour.js).
    advanceHint: hasTouch ? 'TAP TO CONTINUE' : 'CLICK OR PRESS ANY KEY',
    // WAVE-31: a tap that lands ON a menu card presses the card (the tour's
    // "tap anywhere advances" rule cost a real finger tap its target).
    passThrough: '#ov-cards > .card',
  });
  menuTour.start();
}

// Stage-2 coachmarks: one-or-more-step Tours that PAUSE the sim until
// dismissed. `steps` is a step object or an array (multi-step = spotlight
// BOTH targets of a pair, e.g. the two skill buttons — rev-4 partial fix).
function startCoach(steps, key) {
  if (coachActive()) return;
  setTourFlag(key, true);   // seen — even if a target is missing (skip rule)
  const end = () => { coach = null; };
  coach = new Tour({ steps: Array.isArray(steps) ? steps : [steps], onDone: end, onSkip: end,
    advanceHint: hasTouch ? 'TAP TO CONTINUE' : 'CLICK OR PRESS ANY KEY' });
  coach.start();
}

// The joystick mounts only while MANUAL is bound — when it's hidden, point
// at the screen region where it appears (bottom-center) so the movement
// coachmark still lands.
function joyTarget() {
  const j = document.getElementById('joy');
  if (j && j.style.display !== 'none') return j;
  return canvasRegion(C.VIEW_W / 2 - 60, C.VIEW_H - 124, 120, 120);
}

// STATS button equivalent (joyTarget precedent): the touch layer is hidden
// on keyboard-only devices — fall back to the canvas region where the
// loadout sits, since the caption names the I key either way.
function statsTarget() {
  const b = document.getElementById('tc-stats');
  if (b && b.getBoundingClientRect().width > 0) return b;
  return canvasRegion(4, C.VIEW_H - 46, 130, 40);
}

// Project a world position through the SAME transform render.js uses (cam
// offset, then zoom about the view center) so an interactable coachmark can
// spotlight the real chest / portal / arch / shrine where it actually sits.
// WAVE-25 (audit 2.8): the integer zoom factor has ONE definition here —
// render.js applies the identical math. main.js publishes the canonical value
// as state.zoomScale every frame (syncChrome) so render.js can read it instead
// of re-deriving it, and the coachmark can never silently drift off the world.
function zoomScale(z) {
  return Math.max(1, Math.round(z || 1));
}
function worldRegion(wx, wy, r = 16) {
  const Z = zoomScale(state.zoom);
  const sx = C.VIEW_W / 2 + (wx - state.cam.x - C.VIEW_W / 2) * Z;
  const sy = C.VIEW_H / 2 + (wy - state.cam.y - C.VIEW_H / 2) * Z;
  return canvasRegion(sx - r, sy - r, r * 2, r * 2);
}

// ---- WAVE-27 CAMERA: deadzone + lead + arena clamp (ONE follow, ONE source) --
// The owner wanted the pilot to decouple from a hard screen centre near walls
// ("give a nice movement feel ... a bit more 'real'"). This is a DEADZONE
// camera, not a free one:
//   - the player roams free inside a box around the follow centre (the box is
//     DEADZONE_W/H SCREEN px at every zoom, so the feel is zoom-invariant);
//     the view is the box centre PLUS the lead, kept as separate state so the
//     lead can never be folded back in and accumulate frame over frame;
//   - once they leave the box the view follows, with that small LEAD in the
//     direction of travel so movement has weight;
//   - the view is clamped so the player can never leave the SAFE screen region
//     (the clamp reserves SAFE + LEAD, so even the lead cannot push them
//     outside). Near a wall the view STOPS and the player moves within it.
// It writes state.cam, which is the single transform every consumer reads:
// render.js's world layer (translate/scale/translate), drawMoment, worldRegion()
// below (the tour coachmark projection) and the arena-wall pass. Nothing
// re-derives a camera of its own, so the projection cannot drift from the draw.
// A stationary player produces no lead and (inside the box) no camera motion,
// which is what keeps a parked hero exactly where the view already is. The
// follow itself is POSITIONAL (the box makes the feel; no lerp), so the safe
// region holds exactly at every zoom instead of degrading with Z.
//
// The player's travel direction comes from their own per-frame displacement,
// normalised, so nothing here depends on the controller, on dt being fixed, or
// on the pilot mode (manual movement leads exactly the same).
function updateCamera(p, dt) {
  const Z = zoomScale(state.zoom);
  const CAM = C.CAMERA;
  const halfW = C.VIEW_W / 2, halfH = C.VIEW_H / 2;
  if (!state.camLead) state.camLead = { x: 0, y: 0 };
  if (!state.camBase) state.camBase = { x: state.cam.x, y: state.cam.y };
  if (!state.camPrev) state.camPrev = { x: p.x, y: p.y };

  // Travel direction from the actual displacement (rate-free: the vector is
  // normalised, so 60Hz and 120Hz lead by the same amount).
  const dx = p.x - state.camPrev.x, dy = p.y - state.camPrev.y;
  state.camPrev.x = p.x; state.camPrev.y = p.y;
  const dlen = Math.hypot(dx, dy);
  const tx = dlen > 1e-6 ? dx / dlen : 0;
  const ty = dlen > 1e-6 ? dy / dlen : 0;
  // Lead is defined in SCREEN px and converted to world px at this zoom; it is
  // the ONLY smoothed term (weight when starting/stopping), so its time
  // constant is wall-clock and its amplitude is zoom-invariant.
  const kLead = Math.min(1, dt * CAM.SMOOTH);
  state.camLead.x += (tx * CAM.LEAD / Z - state.camLead.x) * kLead;
  state.camLead.y += (ty * CAM.LEAD / Z - state.camLead.y) * kLead;

  // Deadzone, anchored to the follow BASE (the view WITHOUT the lead). The
  // lead must never be folded back into the base: doing that adds the lead
  // again every frame, which is a runaway drift (the camera walks away from
  // the player on its own). The view people see is base + lead, so movement
  // visibly leads while the box itself stays put.
  const dzx = CAM.DEADZONE_W / Z, dzy = CAM.DEADZONE_H / Z;
  const offx = (p.x - state.camBase.x) - halfW;   // offset from the box centre
  const offy = (p.y - state.camBase.y) - halfH;
  let baseX = state.camBase.x, baseY = state.camBase.y;
  if (offx > dzx) baseX += (offx - dzx);
  else if (offx < -dzx) baseX += (offx + dzx);
  if (offy > dzy) baseY += (offy - dzy);
  else if (offy < -dzy) baseY += (offy + dzy);
  let wantX = baseX + state.camLead.x;
  let wantY = baseY + state.camLead.y;

  // Arena clamp: the view may not travel past the point where the player would
  // sit closer than SAFE screen px to either edge. Derivation (Z = zoom):
  //   screen = half + (world - cam - half) * Z          (render.js transform)
  // at the +rim we want screen = VIEW_W - SAFE, which solves to
  //   cam = RIM - half - (half - SAFE)/Z
  // and mirrored at the -rim. LEAD is reserved inside SAFE, so even a full
  // lead toward the opposite edge keeps the player inside the safe region.
  // NOTE the bound is ASYMMETRIC about 0: the camera centres the PLAYER, so at
  // the -rim it has to travel RIM further negative than at the +rim. A
  // symmetric +-(RIM - half) clamp would ruin the follow (and is not used).
  // This clamp is what makes the view STOP near a wall and lets the player
  // drift toward the screen edge — the requested "disconnected" feel.
  const reserveX = Math.max(0, (halfW - CAM.SAFE - CAM.LEAD) / Z);
  const reserveY = Math.max(0, (halfH - CAM.SAFE - CAM.LEAD) / Z);
  let maxX = C.GROUND.RIM - halfW - reserveX;
  let minX = -C.GROUND.RIM - halfW + reserveX;
  let maxY = C.GROUND.RIM - halfH - reserveY;
  let minY = -C.GROUND.RIM - halfH + reserveY;
  // Degenerate tiny arena (nothing in the game shrinks RIM; a test does):
  // keep the bounds ordered so the clamp can never invert.
  if (maxX < minX) { const c = (minX + maxX) / 2; minX = c; maxX = c; }
  if (maxY < minY) { const c = (minY + maxY) / 2; minY = c; maxY = c; }
  wantX = Math.max(minX, Math.min(maxX, wantX));
  wantY = Math.max(minY, Math.min(maxY, wantY));

  // POSITIONAL apply (no follow lag). The deadzone box IS the feel: the view
  // is perfectly still while the player is inside it, then tracks the box edge
  // 1:1. A lerp here would reintroduce a lag that Z magnifies, which could
  // push the player past the safe edge at high zoom — so the safe-region
  // guarantee is exact at every zoom by construction.
  state.cam.x = wantX;
  state.cam.y = wantY;
  // Keep the base consistent with the clamped view (base = view - lead) so the
  // deadzone bookkeeping cannot drift across frames when the clamp bites.
  state.camBase.x = state.cam.x - state.camLead.x;
  state.camBase.y = state.cam.y - state.camLead.y;
}

// Called every frame in 'playing' (frame()); fires each coachmark the first
// time its moment arrives. Coverage = CONTROLS_INVENTORY.md's coverage
// column (the rev-4 acceptance bar): the doctrine levers FOCUS + STANCE
// (Sk408's named complaint), dual-target skills/potions pairs, STATS, and
// the world interactables as each first appears. The DRAFT coachmark fires
// from openDraft, INTERMISSION from openIntermission, DEATH from die()/
// endRun() — those screens already freeze the sim by mode.
function updateTourCoach() {
  if (coachActive()) return;
  // World interactables next — event-driven beats schedule: each fires the
  // moment it first exists on the field (rev-4 item 5). Arches exist from
  // wave start, so a small time gate keeps the gauges intro first.
  const fieldReady = state.time > 2;
  if (fieldReady && !tourFlag(TOUR_KEYS.chest) && state.chests.length) {
    const ch = state.chests[0];
    startCoach({ id: 'chest',
      text: 'A CHEST — walk into it: an item, upgrades… or nothing and a mini-horde. It drifts to you.',
      target: () => worldRegion(ch.x, ch.y, 14) }, TOUR_KEYS.chest);
  } else if (fieldReady && !tourFlag(TOUR_KEYS.portal) && state.portal) {
    const po = state.portal;
    startCoach({ id: 'portal',
      text: 'The PORTAL — walk through to bank the wave. It chases you; take it when ready.',
      target: () => worldRegion(po.x, po.y, 18) }, TOUR_KEYS.portal);
  } else if (fieldReady && !tourFlag(TOUR_KEYS.arch) && state.arches.length) {
    const a = state.arches[0];
    startCoach({ id: 'arch',
      text: 'An ARCH — fly through the gate for a timed buff.',
      target: () => worldRegion(a.x, a.y, 18) }, TOUR_KEYS.arch);
  } else if (fieldReady && !tourFlag(TOUR_KEYS.shrine) && state.shrine && !state.shrine.used) {
    const sh = state.shrine;
    startCoach({ id: 'shrine',
      text: 'A SHRINE — drift close and gold buys a random blessing.',
      target: () => worldRegion(sh.x, sh.y, 16) }, TOUR_KEYS.shrine);
  } else if (!tourFlag(TOUR_KEYS.hud) && state.time > 1) {
    startCoach({ id: 'hud',
      text: 'Health, mana and XP, top-left — level-ups draft your build.',
      target: () => canvasRegion(0, 4, 150, 44) }, TOUR_KEYS.hud);
  } else if (!tourFlag(TOUR_KEYS.pilot) && state.time > 4) {
    startCoach({ id: 'pilot',
      text: 'PILOT: AUTO flies for you — here or M takes MANUAL control anytime.',
      target: () => document.getElementById('tc-pilot') }, TOUR_KEYS.pilot);
  } else if (!tourFlag(TOUR_KEYS.focus) && state.time > 7) {
    // Rev-4 headline gap: without this, AUTO aiming reads as "whatever it
    // feels like" — it's steerable.
    startCoach({ id: 'focus',
      text: 'FOCUS steers your volleys: NEAREST, TOUGHEST, SWARM or RANGED — cycle with TAB.',
      target: () => document.getElementById('tc-focus') }, TOUR_KEYS.focus);
  } else if (!tourFlag(TOUR_KEYS.stance) && state.time > 10) {
    // Sk408 named this one. A choice about the run you want, not a setting.
    startCoach({ id: 'stance',
      text: 'STANCE is how bold you fly: SAFE kites far, GREEDY hugs the loot. G cycles — pick the run you want.',
      target: () => document.getElementById('tc-stance') }, TOUR_KEYS.stance);
  } else if (!tourFlag(TOUR_KEYS.move) && state.time > 13) {
    startCoach({ id: 'move',
      text: 'MANUAL movement: drag the joystick — or WASD / arrow keys.',
      target: () => joyTarget() }, TOUR_KEYS.move);
  } else if (!tourFlag(TOUR_KEYS.skills) && state.time > 16) {
    // Rev-4 partial fix: BOTH buttons get their own spotlight; the W-in-AUTO
    // vs E-always subtlety is named where it belongs.
    startCoach([
      { id: 'skills-q',
        text: 'FROST nova (Q) freezes the swarm around you.',
        target: () => document.getElementById('tc-q') },
      { id: 'skills-w',
        text: 'OVERCHARGE (E — or W in AUTO) speeds your fire.',
        target: () => document.getElementById('tc-w') },
    ], TOUR_KEYS.skills);
  } else if (!tourFlag(TOUR_KEYS.potions) && state.time > 19) {
    // Rev-4 partial fix: both potions, and the H / N keys — not touch-only
    // "tap to drink" framing on a keyboard game.
    startCoach([
      { id: 'potions-h',
        text: 'HP potion heals 35 — carry 3, refilled by chests & kills. Button, or H.',
        target: () => document.getElementById('tc-h') },
      { id: 'potions-n',
        text: 'MP potion restores 40 for skills — button, or N.',
        target: () => document.getElementById('tc-n') },
    ], TOUR_KEYS.potions);
  } else if (!tourFlag(TOUR_KEYS.stats) && state.time > 22) {
    startCoach({ id: 'stats',
      text: 'STATS (I) opens the FIELD REPORT — read your build, see why you died.',
      target: () => statsTarget() }, TOUR_KEYS.stats);
  } else if (!tourFlag(TOUR_KEYS.cog) && state.time > 25) {
    startCoach({ id: 'cog',
      text: 'The cog opens in-run settings — END RUN lives there.',
      target: () => document.getElementById('tc-cog') }, TOUR_KEYS.cog);
  } else if (!tourFlag(TOUR_KEYS.edge) &&
             (Math.abs(state.player.x) > 480 || Math.abs(state.player.y) > 480)) {
    const p = state.player;
    const strip = Math.abs(p.x) >= Math.abs(p.y)
      ? (p.x > 0 ? canvasRegion(C.VIEW_W - 16, 0, 16, C.VIEW_H) : canvasRegion(0, 0, 16, C.VIEW_H))
      : (p.y > 0 ? canvasRegion(0, C.VIEW_H - 16, C.VIEW_W, 16) : canvasRegion(0, 0, C.VIEW_W, 16));
    startCoach({ id: 'edge',
      text: 'The arena has walls — the horde funnels along them.',
      target: () => strip }, TOUR_KEYS.edge);
  }
}


// W1: show a save-layer notice (unreadable / from a newer version / repaired /
// upgraded) on the title. Red = a data problem the player must know about,
// cyan = informational. This is the "TELL them" half of the corrupted-save
// contract — the payload is preserved, and it is never a silent wipe.
function saveNoticeHtml() {
  if (!saveNotice) return '';
  const cls = /UNREADABLE|NEWER VERSION/.test(saveNotice) ? 'cause' : 'next';
  return `<br><span class="${cls}">${saveNotice}</span>`;
}

// ---------- G12: the startup menu over the composed title card ----------------
// A local save is what separates "welcome back" from "fresh browser": the
// LOAD FROM DISK offer on the title (and its tour step) exist only while NO
// save lives under STORAGE_KEY. SETTINGS > IMPORT SAVE stays reachable either
// way — that is the offer's permanent home.
function hasLocalSave() {
  try {
    const v = prefStorage.getItem(STORAGE_KEY);
    return typeof v === 'string' && v.length > 0;
  } catch { return false; }
}

// ---------- N2 TITLE ART REVEAL: menu fade-in + the START GAME art hold -----
// Owner 2026-09-13: "The menu needs to fade in so players can see this! And
// then when they select a run, it should remain for 1 second. Maybe even
// animate it for that second." Every duration below is SECONDS advanced by
// the frame loop's own measured realDt (the WAVE-26 top-of-frame delta), so
// 60Hz and 120Hz land on the same wall-clock timings — nothing counts frames.
const TITLE_ART_BEAT_S = 0.35;   // art alone before the menu fades in
const TITLE_FADE_S = 0.5;        // the menu fade-in (brief: ~400-600ms)
const TITLE_RETURN_FADE_S = 0.12;// a return to the title re-fades SHORT (<=150ms), never the full show
const TITLE_OUT_FADE_S = 0.3;    // menu down after START GAME
const TITLE_HOLD_S = 1.0;        // the art holds alone before the run starts
const TITLE_TIMINGS = { beat: TITLE_ART_BEAT_S, fade: TITLE_FADE_S, ret: TITLE_RETURN_FADE_S,
  out: TITLE_OUT_FADE_S, hold: TITLE_HOLD_S };
let titleRevealPlayed = false;   // the full reveal runs ONCE per page load
let tourPendingAfterReveal = false;
let holdSnap = null;             // the wordmark region snapshot for the hold shimmer
let titleRunStarts = 0;          // startRun calls issued by the hold path (assertable)

function revealSettled() {
  return !state.titleReveal || state.titleReveal.phase === 'settled';
}

// Publish the phase's opacity/pointer gating to the sheet. Full opacity is
// the STYLESHEET default (''), so a reset and a settled reveal are the same
// bytes — the fade cannot leave a stale inline value behind.
function applyRevealStyles() {
  const rv = state.titleReveal;
  if (!rv || !overlay.style) return;
  let o = 1;
  if (rv.phase === 'art' || rv.phase === 'hold') o = 0;
  else if (rv.phase === 'fade' || rv.phase === 'return') o = Math.min(1, rv.t / rv.dur);
  else if (rv.phase === 'out') o = Math.max(0, 1 - rv.t / rv.dur);
  rv.opacity = o;
  const inline = o >= 1 ? '' : String(Math.round(o * 1000) / 1000);
  if (overlay.style.opacity !== inline) overlay.style.opacity = inline;
  const pe = (o >= 1 || rv.phase === 'settled') ? '' : 'none';
  if (overlay.style.pointerEvents !== pe) overlay.style.pointerEvents = pe;
}

// Snapshot the wordmark region of the painted card so the hold shimmer can
// repaint it 1:1 every frame (integer coords, no resampling, no smoothing —
// the paint-once card itself is never touched).
function snapshotWordmark() {
  try {
    const ts = renderer.titleScreen;
    if (!ts) return null;
    const c = renderer.canvas;
    const k = c.width / C.VIEW_W;
    const s = ts.scale;
    const x = Math.round((ts.x + 154 * s) * k), y = Math.round((ts.y + 88 * s) * k);
    const w = Math.round(180 * s * k), h = Math.round(37 * s * k);
    if (!(w > 0 && h > 0)) return null;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const og = off.getContext('2d');
    og.drawImage(c, x, y, w, h, 0, 0, w, h);
    return { off, x, y, w, h };
  } catch { return null; }   // headless stubs / exotic states: no shimmer, no crash
}

// N2 DO 3 (the owner's "maybe"): a gentle gold shimmer on the wordmark during
// the hold — two decaying pulses over the second, drawn on top of the
// restored 1:1 snapshot. fillRect + integer coords only; no transforms.
function drawTitleFlourish(g) {
  const rv = state.titleReveal;
  if (!rv || rv.phase !== 'hold' || !holdSnap || !g) return;
  try {
    // The snapshot/restore is 1:1 in BACKING pixels, so it must run under the
    // IDENTITY transform — the renderer's view transform is still active
    // after render() and would move/rescale (resample!) the restore.
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(holdSnap.off, holdSnap.x, holdSnap.y);
    const decay = Math.max(0, 1 - rv.t / TITLE_HOLD_S);
    const pulse = 0.30 * decay * (0.55 + 0.45 * Math.sin(rv.t * Math.PI * 4));
    if (pulse > 0.004) {
      g.fillStyle = 'rgba(255,213,74,' + pulse.toFixed(3) + ')';
      g.fillRect(holdSnap.x, holdSnap.y, holdSnap.w, holdSnap.h);
    }
    g.restore();
  } catch { /* stub contexts: the shimmer is sugar, never a crash */ }
}

// Wall-clock advance, called from frame() with the top-of-frame realDt every
// mode (the reveal must not freeze under an early-return mode — same rule the
// earned-moment decay follows).
function advanceTitleReveal(dt) {
  const rv = state.titleReveal;
  if (!rv) return;
  if (state.mode !== 'title') {
    // Left the title mid-flow: openMenu already restored the sheet (opacity
    // '' + pointerEvents ''); the stale phase object is simply dropped.
    state.titleReveal = null;
    return;
  }
  if (rv.phase === 'settled') return;
  try {
    rv.t += dt;
    if (rv.phase === 'art') {
      if (rv.t >= TITLE_ART_BEAT_S) { rv.phase = 'fade'; rv.t = 0; }
    } else if (rv.phase === 'fade' || rv.phase === 'return') {
      if (rv.t >= rv.dur) {
        rv.phase = 'settled'; rv.t = rv.dur; rv.opacity = 1;
        applyRevealStyles();
        // N2 DO 4: the first-run tour fires only once the reveal has settled
        // (a coachmark popping mid-fade reads as a glitch).
        if (tourPendingAfterReveal) { tourPendingAfterReveal = false; maybeStartMenuTour(); }
        return;
      }
    } else if (rv.phase === 'out') {
      if (rv.t >= rv.dur) { rv.phase = 'hold'; rv.t = 0; holdSnap = snapshotWordmark(); }
    } else if (rv.phase === 'hold') {
      if (rv.t >= TITLE_HOLD_S) { finishTitleHold(); return; }
    }
    applyRevealStyles();
  } catch (err) {
    // FAIL SAFE: a broken reveal must never strand a blank/unreachable sheet.
    state.titleReveal = { phase: 'settled', t: 0, dur: 0, opacity: 1 };
    applyRevealStyles();
    throw err;
  }
}

// START GAME's new tail (N2 DO 2): fade the menu out, hold the art ~1s in
// mode 'title' (so the canvas keeps showing the card), THEN startRun().
function beginTitleHold() {
  const rv = state.titleReveal;
  if (rv && (rv.phase === 'out' || rv.phase === 'hold')) return;   // already leaving: idempotent
  state.titleReveal = { phase: 'out', t: 0, dur: TITLE_OUT_FADE_S, opacity: 1 };
  applyRevealStyles();
  uiGuard.arm();   // swallow this gesture's tail (double-tap / key-repeat)
}

function finishTitleHold() {
  holdSnap = null;
  state.titleReveal = null;
  if (overlay.style) { overlay.style.opacity = ''; overlay.style.pointerEvents = ''; }
  titleRunStarts++;
  try {
    startRun();
  } catch (err) {
    // FAIL SAFE: a failed start must land the player somewhere reachable.
    if (overlay.style) { overlay.style.opacity = ''; overlay.style.pointerEvents = ''; }
    showTitle();
    throw err;
  }
}

// EXIT GAME, honestly (G12 DO 3): (a) autosave; (b) attempt window.close();
// (c) when the tab does not close — it will not, for a tab the player opened —
// the farewell screen says the progress is saved and the tab can be closed.
// `exitSteps` is the assertable event log: the three steps, in order, as they
// ran. window.close() cannot be polled for success, so the farewell shows
// unconditionally right after the attempt: if the browser DID close the tab,
// the player never sees it; if it did not, nothing reads as broken.
const exitSteps = [];
function exitGame() {
  exitSteps.length = 0;
  exitSteps.push('autosave');
  autosave('exit-game');
  exitSteps.push('window.close');
  try {
    const w = globalThis.window;
    if (w && typeof w.close === 'function') w.close();
  } catch { /* headless / blocked — the farewell below is the honest answer */ }
  exitSteps.push('farewell');
  showFarewell();
}

function showFarewell() {
  openMenu('farewell');
  ovTitle.textContent = 'HORDES';
  ovTitle.className = 'logo';
  ovSub.innerHTML = 'progress saved &mdash; you can close this tab now';
  menuCard('BACK', 'return to the title', () => showTitle());
}

// U1 SUBMENUS (owner 2026-09-14: "there should be more submenus to contain
// some"). Both are the showHowToPlay()/showSettings() shape: openMenu + cards +
// a BACK card. The moved cards keep their EXACT numbers and cycling behaviour —
// only their parent screen changed. CHALLENGE/STAGE re-render THIS screen when
// they cycle (was showTitle()), so the selection updates without bouncing the
// player back out to the title.
function showProgress() {
  openMenu('progress');
  ovTitle.textContent = 'PROGRESS';
  ovTitle.className = 'logo';
  ovSub.innerHTML = 'emblems earned &middot; enemies met';
  // G9: the count is the honest one (earnedCount counts KNOWN trophy ids only,
  // so a save from a newer build cannot inflate it).
  menuCard('TROPHIES', `${earnedCount(profile)} / ${totalAchievements()} earned · full-screen emblems`,
    () => showTrophies());
  // G10: the discovery log for rare tiers — a player who never opens it never
  // learns the ??? silhouettes are a chase.
  menuCard('BESTIARY', `${seenCount(profile)} / ${totalEncounters()} discovered · enemy guide`,
    () => showBestiary());
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

function showSetup() {
  openMenu('setup');
  ovTitle.textContent = 'SETUP';
  ovTitle.className = 'logo';
  ovSub.innerHTML = 'what the next run is &middot; how it plays &middot; how it sounds';
  // G11: session-scoped selector — the press cycles the mode and re-renders so
  // the card always names the CURRENT selection before the player commits.
  menuCard('CHALLENGE', describeChallenge(pendingChallenge) + ' · press to change',
    () => { cyclePendingChallenge(); showSetup(); });
  // G20a: same cycling-card pattern through UNLOCKED stage rows only.
  menuCard('STAGE', stageCardSub(),
    () => { cyclePendingStage(); showSetup(); });
  menuCard('SETTINGS', 'audio, hud & reset', () => showSettings());
  menuCard('HOW TO PLAY', 'the point + every button', () => showHowToPlay());
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

// U1 HEADER (owner 2026-09-14: "remove purse text from the main menu or add gold
// as a gold coin with number display. We don't need the equipped character text
// or 'the build IS the game' text. We could put something showing the equipped
// character by using the pixel art for the character"). So: a coin glyph + the
// number, and the equipped pilot as their OWN authored 32x32 bust — the same
// asset the CHARACTERS screen paints, through the same renderer.drawGrid seam,
// on a 32x32 backing store at an INTEGER 2x with pixelated rendering. ARCADE
// PASS stays (it is a status flag, not filler) and the save-damage notice is
// preserved verbatim.
//
// GRID CONVENTION (this is load-bearing): drawGrid does a TRUTHY test on each
// cell (`if (v)`), and the authored frames are INTEGER arrays where 0 is the
// transparent cell. A string grid ('..1111..') is truthy in EVERY cell, so
// palette['.'] is undefined, the invalid fillStyle assignment is silently
// ignored and the previous colour paints every pixel — the first cut of this
// coin rendered as a solid 8x8 block for exactly that reason. Always: integers,
// 0 = empty.
const COIN_GRID = [
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 1, 3, 3, 3, 3, 2, 0],
  [1, 3, 4, 3, 3, 3, 3, 2],
  [1, 3, 3, 3, 3, 3, 3, 2],
  [1, 3, 3, 3, 3, 3, 3, 2],
  [1, 3, 3, 3, 3, 3, 3, 2],
  [0, 1, 3, 3, 3, 3, 2, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
];
const COIN_PALETTE = { 1: '#0a0603', 2: '#8a5a2a', 3: '#ffd75e', 4: '#fff2b0' };

function paintTitleHeader() {
  const equipped = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  ovSub.innerHTML =
    '<div class="purse-row">' +
      '<canvas class="coin" width="8" height="8"></canvas>' +
      `<span class="gold">${profile.gold}</span>` +
      (hasArcadePass(profile) ? '<span class="pass">ARCADE PASS</span>' : '') +
    '</div>' +
    '<canvas class="bust" width="32" height="32"></canvas>' +
    saveNoticeHtml();
  // Markup-built like every menuCard; the live canvases are resolved exactly the
  // way the character selector resolves its portraits (stub-DOM safe).
  const canvasIn = (cls) => {
    let cv = ovSub.querySelector ? ovSub.querySelector('canvas.' + cls) : null;
    // a stub DOM can hand back a non-canvas node for this markup, so the guard
    // is on getContext, not on presence — createElement('canvas') is stubbed
    // properly by the test harness and is a real element in a browser
    if (!cv || typeof cv.getContext !== 'function') {
      cv = document.createElement('canvas'); cv.className = cls; ovSub.appendChild(cv);
    }
    return cv;
  };
  const coin = canvasIn('coin');
  coin.width = 8; coin.height = 8;
  const bust = canvasIn('bust');
  bust.width = 32; bust.height = 32;
  bust.title = equipped.name;
  const asset = CHARACTER_PORTRAITS[equipped.id];
  // Paint ONLY when a real 2D context exists: test/smoke.mjs's stub DOM has no
  // canvas support at all (createElement('canvas') carries no getContext), while
  // test/_harness.mjs stubs it properly. The markup is the contract either way;
  // the pixels are the browser's.
  const paint = (cv, grid, palette) => {
    if (!cv || typeof cv.getContext !== 'function') return;
    const g = cv.getContext('2d');
    if (g) renderer.drawGrid(g, grid, palette, 0, 0);
  };
  paint(coin, COIN_GRID, COIN_PALETTE);
  if (asset) paint(bust, asset.frames[0], asset.palette);
}

function showTitle() {
  openMenu('title');
  // The authored title card (renderer mode 'title') carries its OWN wordmark,
  // so the DOM <h1> hides here (textContent stays 'HORDES' — the stub-DOM
  // tests read it) and the sheet goes transparent so the canvas art shows
  // through between the cards. openMenu resets both for every other screen
  // (same override pattern the trophy gallery uses).
  ovTitle.textContent = 'HORDES';
  ovTitle.className = 'logo';
  if (ovTitle.style) ovTitle.style.display = 'none';
  overlay.style.background = 'transparent';
  const fresh = !hasLocalSave();
  paintTitleHeader();
  menuCard('START GAME', fresh ? 'start a run · or LOAD FROM DISK below' : 'start a run',
    () => beginTitleHold());   // N2: fade out + hold the art ~1s, then startRun()
  // G12 DO 4: on a fresh browser (no local save) the startup menu itself
  // offers load-from-disk, through the SAME validated import path SETTINGS
  // uses (pickImportFile -> importSaveText -> importProfileText). Once ANY
  // save exists the card adds no friction and disappears.
  if (fresh) {
    menuCard('LOAD FROM DISK', 'import a saved profile (.json)', () => pickImportFile(() => showTitle()));
  }
  menuCard('SHOP', 'permanent upgrades', () => showShop());
  menuCard('CHARACTERS', 'unlock & equip', () => showCharacters());
  // U1 (owner 2026-09-14): the menu was eleven cards. TROPHIES/BESTIARY and
  // CHALLENGE/STAGE/SETTINGS/HOW TO PLAY now live behind two doors, so the
  // title is six (seven on a fresh browser). The doors' sub-lines carry the
  // live numbers the moved cards used to show, so nothing is hidden that a
  // player needs before pressing.
  menuCard('PROGRESS', `${earnedCount(profile)} / ${totalAchievements()} emblems · ` +
    `${seenCount(profile)} / ${totalEncounters()} met`, () => showProgress());
  menuCard('SETUP', stageCardSub().split(' · ')[0] + ' · challenge, stage, options',
    () => showSetup());
  // G12 DO 2: EXIT GAME is the LAST card.
  menuCard('EXIT GAME', 'save & quit', () => exitGame());
  // N2 DO 1: the FIRST title entry per page load shows the art alone for a
  // beat, then fades the menu in over it; every return re-fades short. A
  // hold already in flight (out/hold) is never interrupted by a rebuild.
  const inHold = state.titleReveal &&
    (state.titleReveal.phase === 'out' || state.titleReveal.phase === 'hold');
  if (!inHold) {
    if (!titleRevealPlayed) {
      titleRevealPlayed = true;
      state.titleReveal = { phase: 'art', t: 0, dur: TITLE_FADE_S, opacity: 0 };
    } else {
      state.titleReveal = { phase: 'return', t: 0, dur: TITLE_RETURN_FADE_S, opacity: 0 };
    }
  }
  applyRevealStyles();
  // N2 DO 4: the first-run tour starts only once the reveal has settled (it
  // fires from advanceTitleReveal); flags-done boots start it right here.
  if (revealSettled()) maybeStartMenuTour();   // WAVE-21: stage-1 tour, first load only
  else tourPendingAfterReveal = true;
}

// G14: the live registry of shop-row icon canvases, rebuilt by showShop() so
// the __TEST.shopIcons seam can report painted pixels per row id without DOM
// scraping heuristics.
const shopIconCanvases = {};

function showShop() {
  openMenu();
  ovTitle.textContent = 'SHOP';
  ovTitle.className = '';
  // E1: the banked meta balance reads BANK — GOLD is the in-run purse now.
  ovSub.textContent = `BANK: ${profile.gold}`;
  for (const key of Object.keys(shopIconCanvases)) delete shopIconCanvases[key];
  for (const def of SHOP_UPGRADES) {
    // WAVE-11: weapon/elite rows are SINGLE-PURCHASE unlocks — ownership
    // lives in profile.unlockedWeapons/unlockedElites (meta.js shopRowOwned),
    // not profile.purchased. buyUpgrade dispatches on kind either way.
    const lvl = profile.purchased[def.id] || 0;
    const owned = def.kind ? shopRowOwned(profile, def) : false;
    const capped = def.kind ? owned : lvl >= def.maxLevel;
    const cost = def.kind ? def.baseCost : upgradeCost(def, lvl);
    const afford = profile.gold >= cost;
    const sub = def.kind
      ? (owned ? 'OWNED' : cost + ' gold')
      : `LV ${lvl}/${def.maxLevel} · ${capped ? 'MAXED' : cost + ' gold'}`;
    const el = menuCard(
      def.name,
      `${def.desc}<br>${sub}`,
      () => {
        if (buyUpgrade(profile, def.id)) { saveProfile(profile); showShop(); }
      },
      capped || !afford,
    );
    if (capped) el.onclick = () => audio.playSfx('button');
    // G14: every row carries its authored 16x16 icon (src/art/shop_icons.js)
    // as a live canvas painted through the renderer's own drawGrid — same
    // convention as the G13 portraits: 16x16 backing store, INTEGER 2x CSS
    // scale (32px) with image-rendering: pixelated, no smoothing. Unknown ids
    // get the authored __fallback via shopIcon(), never an empty box. The
    // row's text contract (name / desc / LV-MAXED-OWNED-cost) is untouched —
    // the canvas rides on top, nothing else about the row changes.
    const cv = document.createElement('canvas');
    cv.className = 'shop-icon';
    cv.width = 16; cv.height = 16;
    if (el.insertBefore) el.insertBefore(cv, el.firstChild);
    else el.appendChild(cv);          // stub DOM: markup string is the contract
    const icon = shopIcon(def.id);
    renderer.drawGrid(cv.getContext('2d'), icon.grid, icon.palette, 0, 0);
    shopIconCanvases[def.id] = cv;
  }
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

// ---------- G13: the animated character selector --------------------------------
// The CHARACTERS screen shows every pilot's authored 32x32 idle bust
// (src/art/portraits.js, 2 frames each) as a LIVE canvas — painted through the
// renderer's own drawGrid on a 32x32 backing store that CSS scales by an
// INTEGER factor (2x) with image-rendering: pixelated. The idle advance is
// WALL-CLOCK dt out of frame() (same rule as the title reveal), so 60Hz and
// 120Hz step the same frame index over the same elapsed time; the advance
// no-ops in every other mode, so BACK leaves no repaint, timer or rAF behind.
const CHAR_IDLE_PERIOD = 0.6;   // seconds per idle frame (1.2s blink cycle)
const charIdle = { t: 0, frame: -1, entries: [] };
let charSelected = null;        // the pilot whose kit the panel is showing

// The unowned mask: the SAME grid painted through a one-tone palette, so the
// bust reads as a designed silhouette (the authored outline, just unlit) —
// never a broken or empty box.
const SILHOUETTE_PALETTE = { 1: '#16161f', 2: '#16161f', 3: '#1d1d29', 4: '#101018', 5: '#16161f' };

function charIdleIndex() {
  return Math.floor(charIdle.t / CHAR_IDLE_PERIOD);
}

function paintCharPortraits() {
  const base = charIdleIndex();
  for (const e of charIdle.entries) {
    const g = e.canvas.getContext('2d');
    g.clearRect(0, 0, e.canvas.width, e.canvas.height);
    renderer.drawGrid(g, e.asset.frames[base % e.asset.frameCount],
      e.mask ? SILHOUETTE_PALETTE : e.asset.palette, 0, 0);
  }
  charIdle.frame = base % 2;
}

// Called from frame() for EVERY mode with the real wall-clock dt; a no-op
// unless the selector is live. dt-driven (never a frame count), so the two
// refresh rates pay the same animation.
function advanceCharIdle(dt) {
  if (state.mode !== 'characters') return;
  charIdle.t += dt;
  const idx = charIdleIndex() % 2;
  if (idx !== charIdle.frame) paintCharPortraits();
}

// The kit panel — the Neutral_flower fix ("I don't see what other character
// ability after I buy it"). Every number is DERIVED from the same chain the
// run applies in startRun (makePlayer's base stats -> applyMetaBonuses ->
// applyCharacter), never hand-typed, so the screen cannot drift from the game.
function pilotKit(id) {
  const ch = CHARACTERS[id] || CHARACTERS.KNIGHT;
  const base = makePlayer().stats;
  const st = applyCharacter(applyMetaBonuses({ ...base }, profile.purchased), ch.id);
  const owned = profile.unlockedCharacters.includes(ch.id);
  return {
    id: ch.id, name: ch.name,
    owned, equipped: profile.equippedCharacter === ch.id,
    unlockCost: ch.unlockCost,
    baseHp: base.maxHp, maxHp: st.maxHp,
    maxMana: st.maxMana,
    speedMult: +(st.speed / base.speed).toFixed(2),
    spellCostMult: st.manaCostMult || 1,
    // startPotionCount's formula, inlined for a pilot that is not equipped.
    potions: ch.startPotions + (profile.purchased.potions || 0),
    weapon: ch.startingWeapon ? WEAPON_NAMES[ch.startingWeapon] : WEAPON_NAMES.VOLLEY + ' (BASE)',
    skill: C.SKILLS[ch.skill].NAME,
    healOnChest: ch.healOnChest,
  };
}

function kitPanelHtml(kit) {
  const lines = [
    `HP: ${Math.round(kit.baseHp)} base -> ${Math.round(kit.maxHp)}`,
    `MANA: ${kit.maxMana} max · spells cost x${kit.spellCostMult}`,
    `SPEED: x${kit.speedMult}`,
    `STARTS: ${kit.weapon} · ${kit.potions} potion${kit.potions === 1 ? '' : 's'}`,
    `SKILL [Q]: ${kit.skill}`,
  ];
  if (kit.healOnChest) lines.push(`CHESTS: heals ${kit.healOnChest} HP on open`);
  const status = kit.equipped ? 'EQUIPPED'
    : kit.owned ? 'owned — tap to equip'
    : `locked — ${kit.unlockCost} gold`;
  return `<div class="name">${kit.name} · ${status}</div>` +
    `<div class="desc">${lines.join('<br>')}</div>`;
}

function renderCharSelector() {
  ovCards.innerHTML = '';
  // Re-stamped every render so a purchase updates the purse the same frame.
  // E1: the banked meta balance reads BANK — GOLD is the in-run purse now.
  ovSub.textContent = `BANK: ${profile.gold}`;
  // The kit panel rides first (full width), then one card per pilot.
  const kit = pilotKit(charSelected);
  const kitEl = document.createElement('div');
  kitEl.className = 'card kit-card';
  kitEl.id = 'char-kit';
  kitEl.setAttribute('data-char-kit', kit.id);
  kitEl.setAttribute('data-kit', JSON.stringify(kit));
  kitEl.innerHTML = kitPanelHtml(kit);
  ovCards.appendChild(kitEl);
  frameCard(kitEl);
  charIdle.entries = [];
  for (const ch of Object.values(CHARACTERS)) {
    const owned = profile.unlockedCharacters.includes(ch.id);
    const equipped = profile.equippedCharacter === ch.id;
    const afford = profile.gold >= ch.unlockCost;
    const el = document.createElement('div');
    el.className = 'card char-card' + (equipped ? ' selected' : '')
      + (!owned && !afford ? ' dim' : '');
    el.setAttribute('data-pilot', ch.id);
    // 0.98 feedback (defect 2), preserved: an OWNED pilot's card ALWAYS shows
    // ch.desc — the equip state rides underneath the description, never
    // instead of it. (Markup-built like every menuCard so the DOM string is
    // the card's own contract; the live canvas rides the markup in a real
    // browser and a fabricated one in the stub DOM.)
    el.innerHTML =
      `<canvas class="portrait" width="32" height="32"></canvas>` +
      `<div class="name">${ch.name}${equipped ? ' *' : ''}</div>` +
      `<div class="desc">${ch.desc}<br>` + (equipped ? 'EQUIPPED'
        : owned ? 'equip this pilot'
        : `unlock: ${ch.unlockCost} gold`) + `</div>`;
    let cv = el.querySelector ? el.querySelector('canvas') : null;
    if (!cv) { cv = document.createElement('canvas'); el.appendChild(cv); }
    el.onclick = () => {
      audio.playSfx('button');
      // Selection ALWAYS moves — previewing a locked pilot's kit is free (the
      // oversight complaint was exactly that the kit was invisible).
      charSelected = ch.id;
      if (!equipped) {
        if (owned) {
          if (equipCharacter(profile, ch.id)) saveProfile(profile);
        } else if (afford) {
          // buy -> equip in one flow (preserved verbatim from the 0.98 screen)
          if (unlockCharacter(profile, ch.id)) {
            equipCharacter(profile, ch.id);
            saveProfile(profile);
          }
        }
      }
      renderCharSelector();
      paintCharPortraits();
    };
    ovCards.appendChild(el);
    frameCard(el);
    charIdle.entries.push({ id: ch.id, canvas: cv, asset: CHARACTER_PORTRAITS[ch.id], mask: !owned });
  }
  menuCard('BACK', 'to title [ESC]', () => showTitle());
  paintCharPortraits();   // frame 0 lands immediately, not on the next blink
}

function showCharacters() {
  // G13: the screen is its OWN mode now (it used to ride 'menu'). Registered
  // everywhere a mode matters: chromeOn() keeps it chrome-OFF (it is not
  // playing/finale), the key handler backs ESC out to the title, and the
  // first-run tour's start gate (menu/title only) can never fire over it.
  openMenu('characters');
  ovTitle.textContent = 'CHARACTERS';
  ovTitle.className = '';
  charSelected = profile.equippedCharacter || 'KNIGHT';
  charIdle.t = 0;
  charIdle.frame = -1;
  renderCharSelector();
}

// ---------- W1 EXPORT / IMPORT (title settings only) ----------
// localStorage is per-origin, can be evicted (Safari clears non-installed site
// storage after ~7 days of non-use) and is limited/absent in private mode, so
// the exported file is the player's real safety net. Import replaces the live
// profile, which is NOT safe mid-run — hence title settings only.

// Hidden <input type="file">: the universal import path (works in every
// browser, including iOS Safari where the File System Access API is absent).
// G12: `returnTo` says which screen re-renders after the attempt (SETTINGS
// keeps its own re-render; the title's LOAD FROM DISK returns to the title so
// the offer disappears the moment a save exists).
function pickImportFile(returnTo) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  if (input.style) input.style.display = 'none';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (typeof input.remove === 'function') input.remove();   // no DOM litter per attempt
    if (!f) return;
    readSaveFile(f).then(read => {
      if (!read.ok) {
        saveNotice = 'IMPORT FAILED — ' + (read.error || 'the file could not be read.');
      } else {
        importSaveText(read.text);
      }
      if (typeof returnTo === 'function') returnTo();
      else showSettings(false);
    });
  };
  if (document.body && document.body.appendChild) document.body.appendChild(input);
  if (typeof input.click === 'function') input.click();
}

// Apply a validated import to the live profile. Parse + validate + migrate is
// pure (save.js importProfileText), so a bad file cannot damage the profile:
// nothing is written and the reason is shown to the player.
function importSaveText(text) {
  const res = importProfileText(text);
  if (!res.ok) {
    saveNotice = 'IMPORT FAILED — ' + (res.error || res.status);
    return res;
  }
  profile = res.profile;
  saveProfile(profile);
  saveNotice = res.status === 'imported-migrated'
    ? `SAVE IMPORTED — upgraded to the current format (v${SCHEMA_VERSION}).`
    : 'SAVE IMPORTED.';
  return res;
}

let resetArmed = false;
let endArmed = false;   // WAVE-18 (#6): END RUN two-tap arm (same pattern as RESET)
function showSettings(disarm = true, inRun = false) {
  openMenu(inRun ? 'settings' : 'menu');
  // Sk408 bug: the arm click re-rendered through here, which cleared the
  // arm flag the same frame it was set — RESET could never confirm. Only
  // disarm when settings is opened fresh (title menu or the in-run cog).
  if (disarm) { resetArmed = false; endArmed = false; }
  ovTitle.textContent = 'SETTINGS';
  ovTitle.className = '';
  ovSub.textContent = 'audio, hud & profile' + (saveNotice ? ' · ' + saveNotice : '');
  menuCard('MUSIC', 'currently ' + (audio.getMusicEnabled() ? 'ON' : 'OFF'), () => {
    audio.setMusicEnabled(!audio.getMusicEnabled());
    showSettings(true, inRun);
  });
  menuCard('SFX', 'currently ' + (audio.getSfxEnabled() ? 'ON' : 'OFF'), () => {
    audio.setSfxEnabled(!audio.getSfxEnabled());
    showSettings(true, inRun);
  });
  // WAVE-12: the text HUD is opt-in (canvas chrome is the default readout).
  menuCard('TEXT HUD', 'currently ' + (hudTextEnabled() ? 'ON' : 'OFF'), () => {
    setHudTextEnabled(!hudTextEnabled());
    showSettings(true, inRun);
  });
  // WAVE-16: world zoom (1/2/3/4/6/8 ladder; +/- keys cycle it live in-run).
  menuCard('ZOOM', 'currently ' + state.zoom + 'x (1/2/3/4/6/8)', () => {
    cycleZoom(1);
    showSettings(true, inRun);
  });
  // WAVE-23: resolution / pixel-scale (Sk408's "increase the number of
  // pixels"). AUTO fits the window; PIXEL-PERFECT snaps to uniform NxN art
  // pixels; 2x-4x force an integer scale (more pixels, more GPU).
  menuCard('RESOLUTION', 'currently ' + resMode() +
    (resMode() === 'AUTO' ? ' (fit window)' : resMode() === 'PIXEL-PERFECT' ? ' (uniform pixels)' : ' (integer scale, pricier)') +
    ' — crisper text everywhere', () => {
    const next = RES_MODES[(RES_MODES.indexOf(resMode()) + 1) % RES_MODES.length];
    prefStorage.setItem(KEY_RESOLUTION, next);
    fitCanvas();
    showSettings(true, inRun);
  });
  // WAVE-21: replay the first-run tour on demand (docs/FIRST_RUN_TOUR doc #7).
  menuCard('REPLAY TOUR', 'run the walkthrough again from the start', () => {
    clearTourFlags();
    if (inRun) {
      closeSettings();
      toast('TOUR REPLAYS NOW');   // hud/cog/edge flags cleared -> re-arm live
    } else {
      showTitle();                 // stage-1 flag cleared -> menu tour restarts
    }
  });
  // W1 SAVE FOUNDATION: export/import, plus the preserved payload of an
  // unreadable or newer-version save when one exists. Title settings only.
  if (!inRun) {
    menuCard('EXPORT SAVE', 'download a .json backup of everything', () => {
      const done = (r) => {
        if (r && r.aborted) return;   // player cancelled the save dialog — say nothing
        saveNotice = r && r.ok ? 'SAVE EXPORTED.' : 'EXPORT FAILED — try again.';
        showSettings(false);
      };
      const res = saveProfileToDisk(profile);
      if (res && typeof res.then === 'function') res.then(done, () => done(null));
      else done(res);
    });
    menuCard('IMPORT SAVE', 'load a .json backup (validated + migrated)', () => pickImportFile());
    if (readRecovery()) {
      menuCard('RECOVERY FILE', 'download the preserved damaged save', () => {
        const r = downloadRecovery();
        saveNotice = r && r.ok ? 'RECOVERED DATA EXPORTED.' : 'EXPORT FAILED — try again.';
        showSettings(false);
      });
    }
  }
  menuCard(resetArmed ? 'CONFIRM RESET?' : 'RESET PROFILE',
    resetArmed ? 'wipes gold, upgrades & unlocks' : 'twice to confirm',
    () => {
      if (!resetArmed) { resetArmed = true; showSettings(false, inRun); return; }
      profile = makeProfile();
      saveProfile(profile);
      resetArmed = false;
      showSettings(false, inRun);
    });
  // WAVE-18 (#6): END RUN — the early exit the playtest demanded, only on
  // the in-run settings screen (never the title's). Same two-tap arm/
  // confirm pattern as RESET PROFILE.
  if (inRun) {
    menuCard(endArmed ? 'CONFIRM END RUN?' : 'END RUN',
      endArmed ? 'banks your gold and ends the run' : 'twice to confirm',
      () => {
        if (!endArmed) { endArmed = true; showSettings(false, inRun); return; }
        endArmed = false;
        endRun();
      });
  }
  // WAVE-17: opened via the touch cog mid-run, BACK resumes the paused run
  // instead of bailing to the title (which would abandon it).
  if (inRun) menuCard('BACK', 'back to the fight', () => closeSettings());
  else menuCard('BACK', 'to title [ESC]', () => showTitle());
  // WAVE-22 (rev-4): END RUN was PARTIAL (named by the cog coachmark, card
  // never shown) — first in-run settings visit spotlights the real card
  // ('settings' mode already freezes the sim; re-renders stay silent via
  // the flag).
  if (inRun && !tourFlag(TOUR_KEYS.settings)) {
    startCoach({ id: 'settings',
      text: 'END RUN banks your gold and ends the run early — confirm twice.',
      target: () => cardByTitle('END RUN') || cardByTitle('CONFIRM END RUN?') }, TOUR_KEYS.settings);
  }
}

// ---------- Run flow: compose a run from the profile (meta.js header spec) --
function startRun() {
  const ch = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  state.character = ch;
  state.player = makePlayer();
  const p = state.player;
  p.x = C.VIEW_W / 2;
  p.y = C.VIEW_H / 2;
  // stats = applyAffixes(applyCharacter(applyMetaBonuses(baseStats, purchased),
  //        equipped)) — the loot.js pass fills the item STAT_DEFAULTS fields
  // (crit/critMult/rateMult/damageMult/xpMult/goldMult/speedMult/pickupMult/
  // thorns/lifesteal) so every consumer can read them unguarded.
  p.stats = applyAffixes(
    applyCharacter(applyMetaBonuses(p.stats, profile.purchased), profile.equippedCharacter), []);
  // SURVIVAL-GAP: the pool this run levels up FROM (CONFIG.SURVIVAL.HP_PER_LEVEL
  // is linear in it), stamped before any in-run change.
  state.baseMaxHp = p.stats.maxHp;
  p.hp = p.stats.maxHp;                          // mods changed maxHp
  // G11 CHALLENGE MODES — THE ONE APPLICATION SEAM. The session's pending mode
  // is stamped onto the run, its rules become the two run-scoped ceilings, and
  // the existing start-of-run numbers are CLAMPED to them (a rule can only
  // constrain: STANDARD keeps today's constants byte-for-byte). This is the
  // only place state.challenge is written; the four consumers of the ceilings
  // (slot growth x2, potion pickup, chest potions) read the caps, never the
  // constants, for the mode.
  state.challenge = pendingChallenge;
  // G20a: the run knows its stage — stamped beside the challenge, reset the
  // same way (the declaration above + this stamp = the full run-scoped reset).
  state.stage = pendingStage;
  refreshHints();   // G11: the hints line names the live mode (swapPilotMode early-returns on same-mode runs)
  const rules = challengeRules(state.challenge);
  state.weaponCap = rules.weaponSlots !== undefined ? rules.weaponSlots : C.WEAPON_SLOTS;
  state.potionCap = rules.potions !== undefined ? rules.potions : C.POTIONS.MAX_CARRIED;
  const pots = Math.min(state.potionCap, startPotionCount(profile)); // character base + Travel Pack
  p.potions = { hp: pots, mp: pots };
  state.baseWeaponSlots = Math.min(state.weaponCap, startWeaponSlots(profile)); // 3 base; 4/5/6 shop-bought
  state.weaponSlots = state.baseWeaponSlots;
  // WAVE-7 run-scoped systems reset here (fresh makePlayer already dropped
  // player.choices — these are the state-side companions):
  state.evoTokens = 0;
  // WAVE-10: finale fields are run-scoped too.
  state.finalBoss = null;
  state.volleyMask = null;
  state.choiceSeed = (Math.random() * 1e9) | 0;
  state.choiceRng = mulberry32(state.choiceSeed);   // deterministic per-run offers
  // WAVE-11 companions: flash cooldown stamp, rampage streak, and the shrine
  // rng stream (seeded OFF the choice seed — shrine draws never desync the
  // intermission offers) + the wave-1 shrine roll.
  state.lastFlashAt = null;
  state.rampage = { streak: 0, best: 0 };
  // WAVE-26: earned-moment presentation state is run-scoped too — a new run
  // starts at normal speed with no flare and no stale GREEDY rate-limit stamp.
  state.timeScale = 1;
  state.moment = null;
  state.stanceLootAt = -99;
  // WAVE-28: the auto-drink gates restart with the run (a fresh run starts
  // with both kinds armed).
  state.autoDrinkCd = { hp: 0, mp: 0 };
  // RUN-STRUCTURE run-scoped reset: the run clock, the win flag, and the maw
  // milestone all restart with the run.
  state.runWon = false;
  state.lastMinute = 0;
  state.finalCall = false;
  state.mawCleared = false;
  state.mawDeadline = 0;
  lastPurseFlush = 0;   // E1: the periodic purse flush restarts with the run
  // G9 FOLLOW-UP: run-scoped trophy counters restart with the run.
  state.runCounts = { bossKills: 0, chests: 0, waveTookDamage: false, untouchedWave: false,
    tokens: { kill: 0, chest: 0, drop: 0 },   // EVOLUTION TOKEN channel ledger
    gold: { earned: 0, spent: 0,              // E1 purse ledger (per-tier kills)
      kills: { CHAFF: 0, GRUNT: 0, MID: 0, HEAVY: 0, ELITE: 0, MID_BOSS: 0, BOSS: 0 } } };
  // E1: the purse is NOT reseeded from the bank — a fresh run after settlement
  // opens at 0 (settlement zeroed it), and a run after a mid-run RELOAD resumes
  // whatever profile.runPurse persisted (R4: nothing earned is confiscated).
  // profile.gold is never a purse source.
  state.runPurse = profile.runPurse | 0;
  dilation.scale = 1;
  dilation.remaining = 0;
  // WAVE-13: every run starts in AUTO (the persisted last choice is a record,
  // not a preselect) — rebind the seam and drop any held directions.
  swapPilotMode('AUTO_ALL');
  clearPilotInput();
  // N1a: a class may declare a default focus doctrine (WITCH -> SWARM: the
  // chain only pays off on a clump, and the SWARM branch already exists in
  // controllers.js). Classes without one keep whatever focus is live — TAB/G
  // cycle it exactly as before; this is a default, not a lock.
  if (ch.defaultFocus) autoController.focus = ch.defaultFocus;
  // N1a: the touch Q label reads the class's skill id (was: the hardcoded
  // "FROST" literal in index.html). N1 slice 1: the Witch's row now carries
  // CHAIN_REACTION, so the label reads CHAIN on her runs — the span stays
  // runtime-owned for the per-class ults. N1 slice 3: an ult declares a short
  // LABEL (<=5 chars) because the H1 touch button is a FIXED 96px — the long
  // spec NAME (EARTHSHATTER etc.) would never fit it.
  {
    const qLbl = document.getElementById('q-skill');
    if (qLbl) {
      const qDef = C.SKILLS[classSkillId(state)] || {};
      const nm = qDef.LABEL || (qDef.NAME || '').split(' ')[0].toUpperCase();
      if (nm && qLbl.textContent !== nm) qLbl.textContent = nm;
    }
  }
  state.shrineRng = mulberry32(state.choiceSeed ^ 0x5eed);
  state.shrine = rollShrine(0, state.shrineRng);
  state.takenChoices = [];
  state.pendingChoiceOffers = null;
  state.waveChoice = null;            // Sk408 playtest: fresh run, fresh pick
  state.waveChoiceSnap = null;
  state.weather = initWeather(rollWeather(), (Math.random() * 1e9) | 0);
  state.groundSeed = (Math.random() * 1e9) | 0;   // world-space decor field
  state.weapons = [];
  // VOLLEY instance rides in state.weapons so gems/bosses can feed it XP and
  // the draft can level it — but it never occupies one of WEAPON_SLOTS.
  state.weapons.push(makeWeapon('VOLLEY'));
  // WAVE-11: character starting weapons ride the SAME unlock gate as the
  // draft pool (meta.js retroactively reset old saves to the starter set, so
  // a WITCH save that never bought ZAP must not spawn with it).
  if (ch.startingWeapon && weaponUnlocked(profile, ch.startingWeapon)) {
    state.weapons.push(makeWeapon(ch.startingWeapon));
  }
  // Starting Artifact shop line: free random weapon levels at run start.
  for (let i = 0; i < (p.stats.artifactLevels || 0); i++) {
    const cands = state.weapons.filter(w => (w.level || 1) < WEAPON_MAX_LEVEL);
    if (cands.length === 0) break;
    levelUpWeapon(cands[Math.floor(Math.random() * cands.length)]);
  }
  state.enemies = [];
  state.projectiles = [];
  state.enemyShots = [];
  state.gems = [];
  state.drops = [];
  state.itemDrops = [];
  state.chests = [];
  state.items = [];
  state.arches = [];
  state.archBuffs = [];
  state.shieldAbsorbs = 0;
  state.portal = null;
  interMsg = '';
  state.effects = [];
  state.toasts = [];
  // WAVE-25 FIX (audit 2.3): a synergy already live at t=0 (the ORBIT-starting
  // PALADIN's VOLLEY+ORBIT) must be announced on EVERY run. Two bugs hid it:
  // synergyNames (the toast-dedup set) was never reset between runs, so run 2+
  // treated the pair as already seen; and this call used to sit BEFORE the
  // toasts clear above, which wiped the announcement it had just queued. Both
  // are fixed here — reset the set, then detect AFTER the toast list is empty.
  state.synergyNames = null;
  refreshSynergies();   // WAVE-11: pairs may already be live at run start
  state.bossBanner = null;   // WAVE-14: no arrival banner at run start
  // EVOLUTION TOKEN banner is run-scoped: a fresh run gets its own first-token
  // moment, and no stale hold can freeze the new run's opening frames.
  state.bannerHold = 0;
  state.deathBy = null;      // WAVE-20: no death recorded yet
  // W7b MYTHIC chase gate: each run rolls whether each mythic build-definer is
  // in its draft pool AT ALL (owner spec: ~1/10 of runs each, ~1% both). The
  // roll rides the run's Math.random stream, which the paired-seed harness
  // seeds per run — so the gate is run-seeded by construction. Run-scoped:
  // rerolled every startRun, and the revive spend resets with the run.
  state.chasePool = {};
  if (DRAFT_LADDER_ON) {
    // W7b TWO-STAGE chase gate (owner 2026-09-14): one 10% EVENT roll ("this run
    // has a joker"), then a 60/25/15 count roll, then a uniform draw of WHICH
    // mythics. Replaces per-card independent rolls, which stacked to ~27%
    // any-mythic; the gate caps the event at 10% and the count keeps multiples fun.
    if (Math.random() < DRAFT_LADDER.CHASE_GATE_CHANCE) {
      const w = DRAFT_LADDER.CHASE_COUNT_WEIGHTS;           // [0.60, 0.25, 0.15]
      const r = Math.random();
      const count = r < w[0] ? 1 : (r < w[0] + w[1] ? 2 : 3);
      const ids = DRAFT_MYTHIC_UPGRADES.map((m) => m.id);
      for (let i = ids.length - 1; i > 0; i--) {             // Fisher-Yates, take N
        const j = (Math.random() * (i + 1)) | 0;
        const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      }
      for (const id of ids.slice(0, count)) state.chasePool[id] = true;
    }
  }
  state.secondWindUsed = false;
  state.time = 0;
  state.spawnTimer = 0;
  state.pendingDrafts = 0;
  state.wave = makeWave();
  // WAVE-9: fresh heat ledger every run (run-scoped; NEVER persisted to
  // meta/profile — a null-then-init forces the reset, initHeat is idempotent
  // but does not clear a stale ledger).
  state.heat = null;
  initHeat(state);
  spawnWaveArches();
  state.cam = { x: p.x - C.VIEW_W / 2, y: p.y - C.VIEW_H / 2 };
  // WAVE-27: a fresh run starts with no lead and with the follow's base +
  // displacement baseline on the player, so the first frame cannot read a
  // stale delta from the previous run as travel or start from an old base.
  state.camLead = { x: 0, y: 0 };
  state.camBase = { x: state.cam.x, y: state.cam.y };
  state.camPrev = { x: p.x, y: p.y };
  state.mode = 'playing';
  overlay.style.display = 'none';
  audio.startMusic();
}

// ---------- WAVE-12: FIELD REPORT (in-run stats overlay) ----------------------
// 'S' on desktop / the STATS touch button opens it; the game PAUSES (update()
// only runs in 'playing'; the finale tick in 'finale' — both paused by this
// mode). The canvas keeps rendering underneath; any of S/ESC/CLOSE resumes.
// Icons reuse the sprites.js HUD grids as tiny colored CSS cells (no canvas,
// no image assets — same pixel data, DOM-flavored).
const WEAPON_BLURBS = {
  VOLLEY: 'twin darts — the trusty default',
  ORBIT: 'blades circle you, shredding touchers',
  BOOMERANG: 'flies out, arcs back through the pack',
  ZAP: 'chains lightning between foes',
  NOVA_PULSE: 'radial pulse that shoves the horde back',
  SCYTHE: 'sweeps a heavy arc around you',
  SEEKER: 'homing missiles on the nearest foes',
  MINE: 'drops mines that blast + shrapnel',
  BEAM: 'piercing laser through everything',
};
const RARITY_TINTS = { COMMON: '#a8a8c0', RARE: '#4a8cff', EPIC: '#c46ad8', LEGENDARY: '#ffd75e' };

function iconHtml(grid, palette, px) {
  let s = '<div style="display:inline-grid;grid-template-columns:repeat(' +
    grid[0].length + ',' + px + 'px);vertical-align:middle;margin-right:6px;line-height:0">';
  for (const row of grid) {
    for (const v of row) {
      s += '<i style="display:block;width:' + px + 'px;height:' + px + 'px' +
        (v ? ';background:' + (palette[v] || '#ffffff') : '') + '"></i>';
    }
  }
  return s + '</div>';
}

function openStats() {
  if (state.mode !== 'playing' && state.mode !== 'finale') return;
  state.statsReturn = state.mode;   // the finale resumes its own tick
  state.mode = 'stats';
  overlay.style.display = 'flex';
  ovTitle.textContent = 'FIELD REPORT';
  ovTitle.className = '';
  ovSub.textContent = 'the loadout, at a glance — S / CLOSE resumes';
  ovCards.innerHTML = '';
  ovCards.style.flexWrap = 'wrap';
  ovCards.style.justifyContent = 'center';
  const p = state.player;
  const info = () => audio.playSfx('button');

  // WEAPONS: icon + name (+ evolution) + level + one-line effect.
  let wHtml = '';
  for (const w of state.weapons) {
    const icon = iconHtml(WEAPON_ICONS[w.type] || WEAPON_ICONS.VOLLEY, WEAPON_ICON_PALETTE, 5);
    const nm = w.evolution ? w.evolution.name : (WEAPON_NAMES[w.type] || w.type);
    const evoTag = w.evolution
      ? ' <span style="color:#ffd75e">(' + (WEAPON_NAMES[w.type] || w.type) + ' evolved)</span>'
      : '';
    wHtml += icon + '<b>' + nm + '</b>' + evoTag + ' · Lv ' + (w.level || 1) + '/' + WEAPON_MAX_LEVEL +
      '<br><span style="color:#a8a8c0">' + (WEAPON_BLURBS[w.type] || '') + '</span><br>';
  }
  menuCard('WEAPONS', wHtml || 'none yet', info);

  // ITEMS: name in its rarity color + affix effects (loot.js affix data).
  let iHtml = '';
  for (const it of state.items) {
    const col = RARITY_TINTS[it.rarity] || RARITY_TINTS.COMMON;
    iHtml += '<b style="color:' + col + '">' + it.name + '</b> <span style="color:#6a6a8a">' + it.rarity + '</span><br>';
    for (const a of it.affixes || []) {
      const mag = a.magnitude < 1 ? '+' + Math.round(a.magnitude * 100) + '%' : '+' + a.magnitude;
      iHtml += '<span style="color:#a8a8c0">' + (a.name || a.id) + ' ' + mag + '</span><br>';
    }
  }
  menuCard('ITEMS', iHtml || 'nothing equipped', info);

  // SYNERGIES: describeSynergy (synergies.js).
  let sHtml = '';
  for (const s of state.synergies) {
    const d = describeSynergy(s);
    sHtml += '<b>' + d.name + '</b><br><span style="color:#a8a8c0">' + d.desc + '</span><br>';
  }
  menuCard('SYNERGIES', sHtml || 'none active', info);

  // RAMPAGE + core stats.
  const pct = (v) => Math.round(v * 100) + '%';
  menuCard('THE NUMBERS',
    'RAMPAGE streak ' + state.rampage.streak + ' · best ' + state.rampage.best +
    ' (x' + rampageMult().toFixed(2) + ' xp)<br>' +
    'HP ' + Math.ceil(p.hp) + '/' + p.stats.maxHp + ' · MANA ' + Math.floor(p.mana) + '/' + p.stats.maxMana + '<br>' +
    'DMG ' + p.stats.damage.toFixed(1) + ' · SPD ' + Math.round(p.stats.speed) +
    ' · CRIT ' + pct(p.stats.crit || 0) + ' x' + (p.stats.critMult || 1).toFixed(2) + '<br>' +
    'KILLS ' + p.kills + ' · LVL ' + p.level,
    info);

  menuCard('CLOSE', 'back to the fight [S]', () => closeStats());
}

function closeStats() {
  if (state.mode !== 'stats') return;
  state.mode = state.statsReturn || 'playing';
  overlay.style.display = 'none';
}

// WAVE-17 SETTINGS COG (Sk408): in-run SETTINGS, reached from the touch
// layer's cog button (data-act="settings"). Same pause contract as the
// FIELD REPORT above — 'settings' is not a ticked mode, so playing AND the
// finale both freeze with zero spawner/clock drift; the return mode is
// stashed and closing restores it. RESET always opens DISARMED from here
// (showSettings' disarm pass below), never pre-armed from a prior visit.
function openSettings() {
  if (state.mode !== 'playing' && state.mode !== 'finale') return;
  state.settingsReturn = state.mode;   // the finale resumes its own tick
  showSettings(true, true);
}
function closeSettings() {
  if (state.mode !== 'settings') return;
  state.mode = state.settingsReturn || 'playing';
  overlay.style.display = 'none';
}

// ---------- G9 TROPHY GALLERY (mode 'trophies') -----------------------------
// The owner's showcase ask, as a screen: ONE trophy at a time, drawn
// FULL-SCREEN as pixel art by renderer.drawTrophyShowcase (called from frame()
// after the HUD, so it paints on top of the frozen world), with the name,
// description, goal progress and unlock line in the overlay chrome — which is
// why this is the one screen that overrides the overlay's background and
// alignment (below), pushing its cards to the bottom so the emblem owns the
// middle of the canvas.
//
// WHERE EVERY STRING COMES FROM: the ART (name + description, src/art) and the
// achievement's GOAL text (achievements.js goalText, already folded into
// galleryModel). This file restates neither — it could not, and still show a
// caption that matches the emblem, if it kept its own copy.
function trophiesModel() {
  // galleryModel MASKS unearned entries for us: their `art` is already the
  // LOCKED silhouette and their name/desc are already generic, so this screen
  // never learns (or leaks) what an unearned trophy is called.
  return gallerySummary(profile).model;
}

// The unlock's display name, read from the LIVE catalogs by id — never a second
// table here. A shop row is named by its SHOP_UPGRADES row; a pilot by its
// CHARACTERS entry (the same objects the shop and the character screen show).
function unlockLabel(u) {
  if (!u) return '';
  if (u.kind === 'shopRow') {
    const row = SHOP_UPGRADES.find(r => r.id === u.id);
    return row ? row.name : u.id;
  }
  if (u.kind === 'character') return (CHARACTERS[u.id] || {}).name || u.id;
  return u.id;
}

// Repaint the caption + the showcase payload for the CURRENT ring position.
// state.trophyIdx is normalised here (not at the call sites), so PREV/NEXT can
// step past either end and the ring wraps without a dead end.
function refreshTrophyView() {
  const model = trophiesModel();
  const n = model.length;
  if (n === 0) {
    // No art authored: say so instead of painting an empty showcase.
    state.trophyView = null;
    ovTitle.textContent = 'TROPHIES';
    ovTitle.className = '';
    ovSub.textContent = 'no trophies authored';
    return;
  }
  state.trophyIdx = ((state.trophyIdx % n) + n) % n;
  const e = model[state.trophyIdx];
  // The renderer's input: the art is ALREADY masked, so the showcase cannot
  // disagree with this caption about what is earned.
  state.trophyView = { art: e.art, locked: !e.earned, id: e.id };

  // An unearned entry is named LOCKED (the name lives only on the earned
  // model entry), while its GOAL stays visible — that is the chase, and it is
  // the one thing a locked trophy must not hide.
  ovTitle.textContent = e.earned ? e.name : 'LOCKED';
  ovTitle.className = '';
  const lines = [
    `${state.trophyIdx + 1} / ${n}`,
    e.desc || '',
  ];
  const ach = ACHIEVEMENT_BY_ID[e.id];
  if (e.goal) {
    // A 'state' goal is an ownership fact with no per-run counter, so it reads
    // as its prose ("Own every upgrade line in the shop"). Printing a
    // "0 / 14" fraction for it would be a number the game does not measure.
    lines.push(ach && ach.goal.kind === 'state' ? e.goal : `${e.goal}: ${e.progress} / ${e.target}`);
  }
  if (e.unlock) {
    lines.push(ownsUnlock(profile, e.unlock)
      ? `unlock: ${unlockLabel(e.unlock)} (already owned)`
      : `unlocks: ${unlockLabel(e.unlock)}`);
  }
  if (e.earned && e.at) lines.push('earned ' + new Date(e.at).toLocaleDateString());
  ovSub.innerHTML = lines.filter(Boolean).join('<br>');
}

// Open the gallery. Reached from the title card (showTitle), so the return
// mode is stashed the way openStats stashes the in-run one and BACK restores
// the screen the player came from.
function showTrophies() {
  state.trophiesReturn = state.mode;
  openMenu('trophies');
  // THE one screen that wants the canvas visible behind it: no sheet
  // background, chrome pushed to the bottom edge. Set AFTER openMenu because
  // openMenu is what resets them for every other screen (see its comment).
  overlay.style.background = 'transparent';
  overlay.style.justifyContent = 'flex-end';
  refreshTrophyView();
  menuCard('PREV', 'previous trophy', () => trophiesStep(-1));
  menuCard('NEXT', 'next trophy', () => trophiesStep(1));
  menuCard('BACK', 'to title [ESC]', () => { closeTrophies(); showTitle(); });
}

// Step the ring by `delta` and repaint. Not a no-op outside the gallery: the
// cards are rebuilt per screen, but a stale handler must not repaint another
// screen's caption.
function trophiesStep(delta) {
  if (state.mode !== 'trophies') return;
  state.trophyIdx += (Number(delta) || 0);
  refreshTrophyView();
}

// Leave the gallery. Clears the showcase payload so the NEXT frame paints no
// trophy over whatever screen follows (the overlay's inline overrides are reset
// by the following openMenu — showTitle calls it; the ESC key path calls this
// then showTitle too).
function closeTrophies() {
  if (state.mode !== 'trophies') return;
  state.trophyView = null;
  state.mode = state.trophiesReturn || 'menu';
  overlay.style.display = 'none';
}

// ---------- G10 BESTIARY (mode 'bestiary') -----------------------------------
// The enemy guide, as a screen — MIRRORS THE TROPHY GALLERY EXACTLY (the
// screen that shipped and is tested; no second screen idiom): ONE entry at a
// time, drawn full-screen by renderer.drawBestiary (called from frame() after
// the HUD, so it paints on top of the frozen world), with the caption in the
// overlay chrome pushed to the bottom so the silhouette owns the middle.
//
// WHERE EVERY STRING COMES FROM: encounters.js bestiaryModel — the name, the
// stat line and the behaviour lines are read off the REAL source modules
// (ENEMY_TYPES / bosses.js / rarity.js / config constants) AT MODEL-BUILD
// TIME. This file restates nothing; it could not, and still show a caption
// that matches the sprite, if it kept its own copy. An UNDISCOVERED entry
// reads ??? with NO stats and NO behaviour lines — the silhouette is the
// tease, not a spoiler.
function bestiaryDisplayIds() {
  return bestiaryFilteredModel().map(e => e.id);
}

// G23/G11 FILTER: the model slice the ring walks. ALL (default) walks every
// entry; MISSING walks only the undiscovered ones — the "which entry am I
// missing" question the guide could not answer before. Same bestiaryModel
// source, so the filter can never disagree with the captions.
function bestiaryFilteredModel() {
  const model = bestiaryModel(profile);
  return state.bestiaryFilter === 'MISSING' ? model.filter(e => !e.discovered) : model;
}

// Repaint the caption + the showcase payload for the CURRENT ring position.
// state.bestiaryIdx is normalised here (not at the call sites), so PREV/NEXT
// can step past either end and the ring wraps without a dead end.
function refreshBestiaryView() {
  const model = bestiaryFilteredModel();
  const n = model.length;
  if (n === 0) {
    state.bestiaryView = null;
    ovTitle.textContent = 'BESTIARY';
    ovTitle.className = '';
    // HONEST empty state: MISSING with everything discovered is an
    // accomplishment, not a broken ring — say so plainly, and PREV/NEXT stay
    // no-ops that cannot crash (this early return IS their guard).
    ovSub.textContent = state.bestiaryFilter === 'MISSING'
      ? 'FILTER: MISSING — everything discovered. Nothing left to find.'
      : 'nothing to discover';
    return;
  }
  state.bestiaryIdx = ((state.bestiaryIdx % n) + n) % n;
  const e = model[state.bestiaryIdx];
  // The renderer's input: kind/ref let it resolve the real silhouette;
  // `discovered` is the mask. The model's info lines are ONLY printed for a
  // discovered entry — an undiscovered one shows ??? and nothing else.
  state.bestiaryView = { id: e.id, kind: e.kind, ref: e.ref, discovered: e.discovered };

  ovTitle.textContent = e.discovered ? e.name : '???';
  ovTitle.className = '';
  const lines = [`FILTER: ${state.bestiaryFilter}`, `${state.bestiaryIdx + 1} / ${n}`];
  if (e.discovered) {
    lines.push(...e.info);
    lines.push(`encountered ${e.kills} - first wave ${e.firstWave} - deepest wave ${e.bestWave}`);
    if (e.tier) lines.push('best tier: ' + e.tier);
  } else {
    lines.push('not yet encountered');
  }
  ovSub.innerHTML = lines.filter(Boolean).join('<br>');
}

// Open the guide. Reached from the title card (showTitle), so the return mode
// is stashed the way the gallery stashes its own; BACK (and ESC) restore the
// screen the player came from.
function showBestiary() {
  state.bestiaryReturn = state.mode;
  openMenu('bestiary');
  // The SAME two hooks the gallery uses (set AFTER openMenu because openMenu
  // is what resets them for every other screen — no second reset path): no
  // sheet background, chrome pushed to the bottom edge, canvas owns the view.
  overlay.style.background = 'transparent';
  overlay.style.justifyContent = 'flex-end';
  refreshBestiaryView();
  // G23/G11 FILTER card: cycles ALL -> MISSING -> ALL. The sub names the
  // CURRENT selection, so the press is never a guess; re-render through
  // showBestiary so the card, the caption and the ring all agree.
  menuCard('FILTER',
    state.bestiaryFilter === 'MISSING' ? 'MISSING — only undiscovered entries' : 'ALL — every entry',
    () => cycleBestiaryFilter());
  menuCard('PREV', 'previous entry', () => bestiaryStep(-1));
  menuCard('NEXT', 'next entry', () => bestiaryStep(1));
  menuCard('BACK', 'to title [ESC]', () => { closeBestiary(); showTitle(); });
}

// Step the ring by `delta` and repaint. Guarded like trophiesStep: a stale
// handler must not repaint another screen's caption.
function bestiaryStep(delta) {
  if (state.mode !== 'bestiary') return;
  state.bestiaryIdx += (Number(delta) || 0);
  refreshBestiaryView();
}

// G23/G11: flip the filter and repaint the whole guide. showBestiary re-runs
// refreshBestiaryView, which re-normalises bestiaryIdx against the NEW list —
// an out-of-range index after a switch is impossible by construction.
function cycleBestiaryFilter() {
  if (state.mode !== 'bestiary') return;
  state.bestiaryFilter = state.bestiaryFilter === 'MISSING' ? 'ALL' : 'MISSING';
  showBestiary();
}

// Leave the guide. Clears the showcase payload so the NEXT frame paints no
// bestiary over whatever screen follows (the overlay's inline overrides are
// reset by the following openMenu — showTitle calls it; the ESC key path
// calls this then showTitle too).
function closeBestiary() {
  if (state.mode !== 'bestiary') return;
  state.bestiaryView = null;
  state.mode = state.bestiaryReturn || 'menu';
  overlay.style.display = 'none';
}

// ---------- Input: shared action seam (keyboard AND touch use these) ----------
// One code path per action — the touch buttons in index.html and the keydown
// handler both funnel through runAction, so no game logic is duplicated.
// Doctrine actions only nudge the AutoPilot controller's state; no input
// handling lives in controllers.js.
//
// WAVE-26 ("stance that bites"): the dial used to change one hidden number
// with zero feedback. Cycling it now says what the new stance DOES (its tag +
// the two multipliers that actually differ), tinted with the stance's risk
// color. WAVE-27: with the canvas readout removed this toast is the DISCOVERY
// moment for the stance's meaning, so it must be complete on its own — it
// names the stance, its CONFIG tag, and both real consequences.
//
// ---------- BOSS-ARRIVAL STANCE EASE (Sk408 playtest) -----------------------
// See CONFIG.AUTOPILOT.BOSS_STANCE. The arrival banner owns the screen while it
// lands (a stance change during it is not possible), so the pilot eases to the
// boss stance for the fight and returns to the player's pick when the wave's
// cast is down. A mid-fight change by the player always wins (the restore only
// fires when the stance is still the one we eased into).
function easeToBossStance() {
  const want = C.AUTOPILOT.BOSS_STANCE;
  if (!want || state.preBossStance != null) return;
  state.preBossStance = controller.stance;
  if (controller.stance === want) return;          // already there: restore is a no-op
  controller.stance = want;
  const d = C.AUTOPILOT.STANCES[want] || {};
  toast('BOSS INCOMING - STANCE ' + want + ' (' + (d.TAG || '') + ')',
    C.HUD.STANCE_COLORS[want] || null);
}
function restoreBossStance() {
  if (state.preBossStance == null) return;
  const back = state.preBossStance;
  state.preBossStance = null;
  if (controller.stance !== C.AUTOPILOT.BOSS_STANCE) return;   // player moved on
  if (back === C.AUTOPILOT.BOSS_STANCE) return;
  controller.stance = back;
  const d = C.AUTOPILOT.STANCES[back] || {};
  toast('STANCE ' + back + ' (' + (d.TAG || '') + ')', C.HUD.STANCE_COLORS[back] || null);
}
// BOSS_STANCE awareness, shared (N1b): true while any wave boss or herald of
// this wave's cast is still alive. AUTO_CAST reads the SAME predicate — there
// is exactly one definition of "is a boss here" in the pilot.
function bossCastLive(st) {
  return [...(st.wave.bosses || []), ...(st.wave.midBosses || [])]
    .some(b => b && b.hp > 0);
}
// Only stand down once NOTHING boss-shaped is left alive this wave.
function restoreBossStanceIfClear() {
  if (bossCastLive(state)) return;
  restoreBossStance();
}

// cycleStanceWithFeedback: the DISCOVERY moment for the stance's meaning
// (WAVE-27 removed the canvas readout, so this toast must be complete on its
// own — it names the stance, its CONFIG tag, and both real consequences),
// tinted with the stance's risk color.
function cycleStanceWithFeedback() {
  const s = controller.cycleStance();
  const d = C.AUTOPILOT.STANCES[s] || {};
  toast('STANCE ' + s + ' - ' + (d.TAG || '') +
    ' (flee x' + (d.KITE_MULT || 1) + ', loot x' + (d.PICKUP_MULT || 1) + ')',
    C.HUD.STANCE_COLORS[s] || null);
  return s;
}

// N1a: the Q slot's skill id is the equipped class's own (CHARACTERS[].skill
// in meta.js — data, not a special case). Every Q consumer — the key act, the
// readiness readout, the text-HUD line and the touch label — reads it HERE,
// never a literal. N1 slice 1: the WITCH row carries CHAIN_REACTION (her
// defining move); the other three classes still carry FROST_NOVA, which
// returns as a DRAFTABLE card for everyone in N1 slice 2.
function classSkillId(st) {
  return (st.character && st.character.skill) || 'FROST_NOVA';
}

function runAction(act) {
  // WAVE-12: the FIELD REPORT opens from play and closes from itself, so it
  // routes BEFORE the playing/finale gate below.
  if (act === 'stats') {
    if (state.mode === 'stats') closeStats();
    else openStats();
    return;
  }
  // WAVE-17: the touch cog — opens/closes the in-run settings pause.
  if (act === 'settings') {
    if (state.mode === 'settings') closeSettings();
    else openSettings();
    return;
  }
  // WAVE-22c: the "?" button — toggles the key-hints panel.
  if (act === 'help') { toggleHints(); return; }
  // WAVE-13: the pilot toggle is live mid-run only (a paused/drafting game
  // must not flip controllers under the smoke probes' feet).
  if (act === 'pilot') {
    if (state.mode === 'playing' || state.mode === 'finale') togglePilotMode();
    return;
  }
  // A2: the RADAR touch button — same mid-run-only gate as the pilot toggle.
  if (act === 'radar') {
    if (state.mode === 'playing' || state.mode === 'finale') toggleRadar();
    return;
  }
  // Skills/potions/doctrine stay live through the finale (WAVE-10).
  if (state.mode !== 'playing' && state.mode !== 'finale') return;
  if (act === 'focus') controller.cycleFocus();
  else if (act === 'stance') cycleStanceWithFeedback();
  else if (act === 'q') useSkill(state, classSkillId(state));
  else if (act === 'w') useSkill(state, 'OVERCHARGE');
  else if (act === 'h') drinkHealthPotion(state);
  else if (act === 'n') drinkManaPotion(state);
}

// ---------- THE ONE POTION SEAM (WAVE-28) -----------------------------------
// skills.js usePotion is base-config only; the RUN's modifiers have always been
// applied here, at the action seam: Alchemy (stats.potionPower), choices.js
// potionHealMult (Alchemist's Blessing / Vampire's Kiss), and the BOSS CURSE
// (a live boss halves the heal). AUTO_DRINK (see autoDrinkPotions below) drinks
// through THESE functions rather than around them, so an automatic potion is
// worth exactly a manual one and there is still ONE place that spends a charge.
function drinkHealthPotion(state) {
  const p2 = state.player;
  const healMult = ((p2.choices && p2.choices.potionHealMult) || 1) * (p2.stats.potionPower || 1);
  const before = p2.hp;
  if (!usePotion(state, 'hp')) return false;    // base C.POTIONS.HP_HEAL
  let healed = p2.hp - before;
  if (healed > 0) {
    const bonus = Math.min(C.POTIONS.HP_HEAL * (healMult - 1),
      p2.stats.maxHp - p2.hp);
    if (bonus > 0) p2.hp += bonus;
    healed = p2.hp - before;
    // The boss curse's heal tax is hostile damage too — it rides the SAME
    // THICK SKIN funnel as every other path that removes player HP.
    if (state.wave.boss) p2.hp -= damageTakenFortified(state, healed / 2);   // N1 slice 3: FORTIFY-aware like every HP loss
  }
  return true;
}
function drinkManaPotion(state) {
  // Mana potion with the Alchemy (potionPower) bonus at the same seam.
  const p2 = state.player;
  const before = p2.mana;
  if (!usePotion(state, 'mp')) return false;
  const restored = p2.mana - before;
  if (restored > 0) {
    const bonus = Math.min(C.POTIONS.MP_RESTORE * ((p2.stats.potionPower || 1) - 1),
      p2.stats.maxMana - p2.mana);
    if (bonus > 0) p2.mana += bonus;
  }
  return true;
}

// ---------- AUTO-DRINK (WAVE-28; playtest: "maybe a way to auto use potions
// in autopilot?") ------------------------------------------------------------
// The pilot fights for the player, so the consumables it would have spent must
// be spent too — otherwise an AUTO run carries an inventory it can never open.
// Called from BOTH resource seams of the live loop (update / updateFinale),
// right after updateResources + the regen grants, so it reads the same current
// HP/mana the manual buttons act on.
// Contract (CONFIG.AUTOPILOT.AUTO_DRINK — the knobs, with the reasoning):
//   * AUTO only. A MANUAL player keeps 100% of the decision: nothing here can
//     drink a manual player's charge.
//   * strictly BELOW the line (HP/MP < max * FRACTION), never at or above it,
//     and never with an empty count — no charge is burned at the boundary.
//   * mana is only worth a charge when a skill is genuinely WAITING on it: off
//     cooldown AND short of its cost (skillManaCost carries the perks). Low
//     mana with everything on cooldown is not a reason to spend.
//   * one drink per kind per COOLDOWN seconds — a deep dip cannot chug the
//     stack in three frames.
// The stance is never read or written here, so this cannot interact with
// BOSS_STANCE or the pilot's kite/retreat decision: a potion drunk under the
// arrival banner leaves the eased stance exactly as it was.
function autoDrinkPotions(state, dt) {
  const ad = state.autoDrinkCd;
  // The gates tick in BOTH pilot modes, so swapping to MANUAL and back cannot
  // strand a stale lockout (and MANUAL never reaches the drink block below).
  ad.hp = Math.max(0, ad.hp - dt);
  ad.mp = Math.max(0, ad.mp - dt);
  if (!pilotAssistsYou()) return;
  const d = C.AUTOPILOT.AUTO_DRINK;
  if (!d || !d.ENABLED) return;
  const p = state.player;
  if (ad.hp === 0 && p.potions.hp > 0 && p.hp < p.stats.maxHp * d.HP_FRACTION) {
    if (drinkHealthPotion(state)) ad.hp = d.COOLDOWN;
  }
  if (ad.mp === 0 && p.potions.mp > 0 && p.mana < p.stats.maxMana * d.MP_FRACTION) {
    const starved = Object.keys(C.SKILLS).some(id => {
      // N1 slice 3: an ult has NO MANA key — it never waits on the pool, so
      // it must not count as "starved" (skillManaCost would also read NaN).
      if (C.SKILLS[id].MANA == null) return false;
      const cd = p.skillCd[id] || 0;
      return cd <= 0 && p.mana < skillManaCost(id, state);
    });
    if (starved && drinkManaPotion(state)) ad.mp = d.COOLDOWN;
  }
}

// ---------- AUTO-CAST (N1b item 8) -------------------------------------------
// The AUTO pilot fights (controllers.js) and drinks (AUTO_DRINK above) — and
// now CASTS. useSkill was reachable only from the player's Q/E, so an AUTO
// run paid mana's costs and collected none of its benefits: the whole mana
// scheme read as a tax on the pilot. Called from the SAME two resource seams
// as AUTO_DRINK (update / updateFinale), right after it — survival spending
// (potions) comes first, then the cast hand reads the refreshed pool.
// Contract (CONFIG.AUTOPILOT.AUTO_CAST — the knobs, with the reasoning):
//   * AUTO ONLY. A MANUAL player keeps 100% of the cast decision; nothing
//     here can spend a MANUAL player's mana.
//   * both casts go through useSkill itself — the ONE skill mana spender —
//     so an automatic cast costs and cools exactly what a manual one does,
//     and lands on the same state (the end screen and run stats stay true).
//   * CONSERVATIVE: a cast must actually land. FROST_NOVA only with a live
//     enemy inside its own RADIUS; OVERCHARGE only when a boss/elite is
//     present (bossCastLive — the BOSS_STANCE awareness, plus the maw and
//     FOCUS_RANGE elites) or the pool is at/above the near-full threshold
//     (spill income into damage rather than overflow the cap).
//   * never a wasted call: cooldown and cost are checked HERE, so useSkill
//     is only ever called when it will say yes.
//   * never a new withhold: casting is synchronous in the frame; it cannot
//     block, delay or starve a weapon (weapons tick on their own cooldowns,
//     and ZAP's N1a soft gate still fires dry at 0.5x if a cast drained it).
function autoCastSkills(state) {
  if (!pilotAssistsYou()) return;
  const ac = C.AUTOPILOT.AUTO_CAST;
  if (!ac || !ac.ENABLED) return;
  const p = state.player;
  // The Q slot (N1a classSkillId — the ONE place a class's skill id is read).
  // FROST_NOVA gates on its RADIUS; a Q skill without one (the Witch's
  // CHAIN_REACTION — an aimed chain) falls back to "any live enemy" rather
  // than a blind cast. N1 slice 3: an ult's readiness is charge + the cooldown
  // floor (ultCharge), NEVER mana; CONSECRATION is PLACED at the densest
  // cluster (not centred on the player), so its honest lands-test is "any
  // live enemy" like the Witch's chain, while EARTHSHATTER/AFTERIMAGE keep
  // the player-centred RADIUS test (their payoff zone IS around the player).
  const q = classSkillId(state);
  const uq = ultCharge(state, q);
  const qReady = uq ? uq.ready
    : ((p.skillCd[q] || 0) <= 0 && p.mana >= skillManaCost(q, state));
  if (qReady) {
    const r = q === 'CONSECRATION' ? 0 : (C.SKILLS[q] && C.SKILLS[q].RADIUS);
    const lands = state.enemies.some(e => e && e.hp > 0 &&
      (!r || Math.hypot(e.x - p.x, e.y - p.y) <= r));
    if (lands) useSkill(state, q);
  }
  // OVERCHARGE: a self-buff, so the gate is THREAT or SPILL — never position.
  if ((p.skillCd.OVERCHARGE || 0) <= 0 && p.mana >= skillManaCost('OVERCHARGE', state)) {
    const bossUp = bossCastLive(state)
      || !!(state.finalBoss && state.finalBoss.hp > 0)
      || state.enemies.some(e => e && e.hp > 0 && e.elite &&
        Math.hypot(e.x - p.x, e.y - p.y) <= ac.ELITE_RANGE);
    if (bossUp || p.mana >= p.stats.maxMana * ac.NEAR_FULL) {
      useSkill(state, 'OVERCHARGE');
    }
  }
}

// WAVE-25 FIX (audit 2.2): keys whose action is EDGE-triggered — one press, one
// action. Wave-23 guarded only tab/g/h/n and only inside the live-run branch, so
// every other edge key below still re-fired on OS key-repeat: holding ESC
// oscillated the run between paused and live (the settings branch closes the
// pause, the next repeat re-enters playing and reopens it), holding M flipped
// AUTO/MANUAL every tick, and I / S / ? / + / - strobed their screens. None of
// these is legitimately hold-repeatable: held movement (WASD/arrows, and S in
// MANUAL) is state-based via keyup, not repeat-driven, so swallowing its repeat
// still leaves the key held. The guard is GLOBAL and runs before the mode
// dispatch, so a held ESC can no longer ping-pong a mode pair.
const REPEAT_GUARDED = new Set([
  'tab', 'g',            // focus / stance cycle
  'h', 'n',              // potions
  'escape', 'p',         // pause / resume
  'm',                   // pilot toggle
  'r',                   // A2 radar toggle
  'i', '?', 'f1',         // stats overlay + hints toggle
  's',                    // held "down" in MANUAL — swallow ONLY its repeat
  '+', '=', '-', '_',    // zoom ladder
]);

window.addEventListener('keydown', (ev) => {
  // WAVE-23 (#6): any key advances a live tour step (tour.js), so swallow the
  // key here — otherwise the same press would ALSO fire a skill / toggle the
  // pilot under the paused coachmark. Escape still reaches the tour's own
  // document-level skip handler.
  if (coachActive() || (menuTour && menuTour.active())) return;
  const k = ev.key.toLowerCase();
  if (ev.repeat && REPEAT_GUARDED.has(k)) return;
  if (state.mode === 'intro') {                              // any key skips the movie
    // CINEMATIC GESTURE GUARD: the same press must not also activate the button
    // that appears with the menu (preventDefault kills the synthesized click on
    // a focused element; arming swallows any that still lands on the overlay).
    if (ev.preventDefault) ev.preventDefault();
    uiGuard.arm();
    endIntro();
    return;
  }
  if (state.mode === 'portal-cine') {                   // WAVE-8/A: any key skips
    if (C.CINE.SKIPPABLE) {
      if (ev.preventDefault) ev.preventDefault();
      uiGuard.arm();
      endPortalCine();
    }
    return;
  }
  if (state.mode === 'draft') {
    if (['1', '2', '3', '4'].includes(ev.key)) {
      // 1-4: the W7b Full Hand mythic adds a fourth offer, and its card carries
      // a [4] key hint — the routing must cover what the markup promises. These
      // stay the ONE-PRESS quick-pick (test_w7b_draft_ladder pins a single [4]
      // press taking the offer); the R2 inspect->confirm flow lives on
      // tap/click and on arrows + Enter below.
      const card = ovCards.children[Number(ev.key) - 1];
      if (card && card._draftOffer) { hideDraftInspect(); pick(card._draftOffer); }
    } else if (k === 'arrowleft' || k === 'arrowup') {
      draftFocusStep(-1);
    } else if (k === 'arrowright' || k === 'arrowdown') {
      draftFocusStep(1);
    } else if (k === 'enter' || k === ' ') {
      // Keyboard parity for the inspect flow: Enter on the cursor card is the
      // same activation as a tap — first press inspects, second takes.
      const card = ovCards.children[draftFocus >= 0 ? draftFocus : 0];
      if (card && card._draftOffer) activateDraftCard(card._draftOffer, card);
    } else if (k === 'escape') {
      hideDraftInspect();      // cancels the inspect, returns to the offer
    }
  } else if (state.mode === 'evolve' && ['1', '2', '3', '4'].includes(ev.key)) {
    const card = ovCards.children[Number(ev.key) - 1];  // EVOLVE cards + NOT NOW
    if (card) card.click();
  } else if (state.mode === 'dead') {
    if (k === 'r') startRun();       // RETRY (parity with the death buttons)
    else if (k === 't') showTitle(); // TITLE
  } else if (state.mode === 'intermission') {
    if (k === 'c' || k === 'enter') continueRun();
    else if (['1', '2', '3', '4'].includes(ev.key)) {
      const card = ovCards.children[Number(ev.key) - 1];
      if (card) card.click();
    }
  } else if (state.mode === 'trophies') {
    // G9 TROPHY GALLERY: ESC backs out to the title (what the BACK card
    // promises) and the arrows walk the ring the PREV/NEXT cards step. The
    // gallery is reached from the title, so there is no paused run to resume.
    if (k === 'escape') { closeTrophies(); showTitle(); }
    else if (k === 'arrowleft') trophiesStep(-1);
    else if (k === 'arrowright') trophiesStep(1);
  } else if (state.mode === 'bestiary') {
    // G10 BESTIARY: the gallery's exact key contract — ESC backs out to the
    // title (what the BACK card promises) and the arrows walk the ring the
    // PREV/NEXT cards step. Reached from the title, so no paused run exists.
    // G23/G11: F drives the ALL/MISSING filter (the FILTER card's key twin).
    if (k === 'escape') { closeBestiary(); showTitle(); }
    else if (k === 'arrowleft') bestiaryStep(-1);
    else if (k === 'arrowright') bestiaryStep(1);
    else if (k === 'f') cycleBestiaryFilter();
  } else if ((state.mode === 'menu' || state.mode === 'farewell' || state.mode === 'characters') && k === 'escape') {
    showTitle();                     // every sub-menu (and the farewell) backs out to title
  } else if (state.mode === 'settings') {
    // WAVE-17: ESC closes the in-run settings and resumes (BACK card too).
    if (k === 'escape') closeSettings();
  } else if (state.mode === 'stats') {
    // WAVE-12 FIELD REPORT: S/ESC/I (or any card) closes and resumes.
    if (k === 's' || k === 'escape' || k === 'i') closeStats();
    else if (['1', '2', '3', '4', '5', '6'].includes(ev.key)) {
      const card = ovCards.children[Number(ev.key) - 1];
      if (card) card.click();
    }
  } else if (state.mode === 'playing' || state.mode === 'finale') {
    // WAVE-23 FIX (desktop audit #2): a keyboard-only player had NO pause.
    // ESC was routed only in menu/settings/stats, and the in-run settings
    // screen (the game's only pause) opened solely from the mouse-only cog.
    // ESC and P now open the same pause; the 'settings' branch above still
    // owns ESC-to-resume, so ESC is a clean toggle.
    if (k === 'escape' || k === 'p') { openSettings(); return; }
    // NOTE (wave-25): the auto-repeat guard for held action keys (tab/g/h/n and
    // the rest) now lives at the top of this handler; see REPEAT_GUARDED.
    // WAVE-13 MANUAL PILOT. Key scheme (documented in the hint line):
    //   M          toggle AUTO/MANUAL (any mode-pair, mid-run)
    //   arrows/WASD held movement — MANUAL only
    //   S          'down' — MOVEMENT ONLY, in EVERY mode (owner rule). S used
    //              to open the FIELD REPORT in AUTO, which is the DEFAULT mode:
    //              a player driving with WASD hit S to walk down and got a menu
    //              instead. Nothing else claims S now.
    //   I          FIELD REPORT — the ONE stats key, in BOTH modes
    //   W          Overcharge in AUTO · 'up' in MANUAL — E fires Overcharge
    //              in BOTH modes (the permanent new home for it)
    if (k === 'm') { togglePilotMode(); return; }
    if (k === 'i') { openStats(); return; }
    // A2: R toggles the radar in BOTH pilot modes (it is a HUD readout, not
    // a movement key — no conflict with WASD).
    if (k === 'r') { toggleRadar(); return; }
    // WAVE-22c: ? (or F1) toggles the on-screen control hints.
    if (ev.key === '?' || k === 'f1') { if (ev.preventDefault) ev.preventDefault(); toggleHints(); return; }
    // WAVE-16 quick zoom: '+'/'=' zooms in, '-' zooms out — no settings trip
    // needed. Live mid-run in both pilot modes (render reads state.zoom
    // every frame).
    if (k === '+' || k === '=') { cycleZoom(1); return; }
    if (k === '-' || k === '_') { cycleZoom(-1); return; }
    // Held movement. MANUAL only — and checked BEFORE any screen opener, so a
    // movement key can never be swallowed by a menu.
    if (state.pilotMode === 'MANUAL') {
      const dir = KEY_DIRS[k];
      if (dir) { pilotInput[dir] = true; return; }
    }
    // (owner rule: `s` is NOT a stats key in any mode — `I` is the only one.
    // A stale `s` opener lived here and cost MANUAL-vs-AUTO confusion; do not
    // reintroduce it.)
    const keyMap = {
      tab: 'focus', g: 'stance',
      [C.SKILLS[classSkillId(state)].KEY]: 'q',
      [C.SKILLS.OVERCHARGE.KEY]: 'w',   // AUTO only in practice: in MANUAL, 'w' is held 'up'
      e: 'w',
      h: 'h', n: 'n',
    };
    const act = keyMap[k];
    if (act) {
      if (k === 'tab' && ev.preventDefault) ev.preventDefault();
      runAction(act);
    }
  }
});

// WAVE-13: keyup ALWAYS clears its direction (regardless of mode/overlay) so a
// key held across a draft, a toggle or a death screen can never ghost-move the
// next run. blur clears everything (alt-tab with a key down).
window.addEventListener('keyup', (ev) => {
  const dir = KEY_DIRS[ev.key.toLowerCase()];
  if (dir) pilotInput[dir] = false;
});
window.addEventListener('blur', () => {
  clearPilotInput();   // keys + joystick (no ghost vectors after alt-tab)
});

// ---------- Touch controls (Sk408): mirror the keyboard actions ----------
const touchLayer = document.getElementById('touch');
const joyEl = document.getElementById('joy');         // WAVE-15 joystick base
const joyKnobEl = document.getElementById('joy-knob');
const touchEls = {};
for (const id of ['tc-focus', 'tc-stance', 'tc-pilot', 'tc-q', 'tc-w', 'tc-h', 'tc-n', 'tc-radar']) {
  touchEls[id] = document.getElementById(id);
}

// Reveal the layer on touch devices (CSS @media (pointer: coarse) covers
// most; this catches the rest, e.g. hybrid laptops). WAVE-22b: non-touch
// devices get COG-ONLY — the settings cog is the in-run menu button and
// desktop must reach it with a mouse too.
const hasTouch = ('ontouchstart' in window) ||
  ((typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) || 0) > 0;
if (touchLayer && touchLayer.classList) {
  touchLayer.classList.add(hasTouch ? 'on' : 'cog-only');
}

// WAVE-22c ON-SCREEN CONTROL HINTS (Sk408): desktop players get no touch
// labels, so a compact key list rides under the cog. Persisted pref
// (prefStorage shim, same pattern as the text HUD); default ON for
// non-touch, OFF for touch (the buttons there are self-labeled). Toggle:
// the "?" button beside the cog or the ? / F1 key, both in-run.
const hintsEl = document.getElementById('hints');
const KEY_HINTS = 'hordes_hints';
let hintsOn = (() => {
  try {
    const v = prefStorage.getItem(KEY_HINTS);
    return v === null ? !hasTouch : v === '1';
  } catch { return !hasTouch; }
})();
// WAVE-23 FIX (desktop audit #3): the list is MODE-AWARE, not static.
// (owner rule, later): `I` is the ONE stats key in BOTH modes — `S` is pure
// movement and never opens a screen — so the old static "S / I stats" line is
// gone for good. W fires Overcharge in AUTO but is held "up" in MANUAL, where
// E is the always path.
// "Q / E" stays accurate in BOTH modes (never regress that). The number-key
// claim is scoped to the screens that route it (draft 1-3, evolve /
// intermission 1-4, stat tabs 1-6) — the title / shop / characters /
// settings screens ignore number keys while this panel is still visible.
// (h) EVERY pilot mode gets its OWN entry, keyed by the mode's own name.
// refreshHints() looks up HINT_LINES[state.pilotMode] and the pre-(h) table had
// only AUTO + MANUAL, so AUTO_MOVE -- a mode the player can actually be in --
// fell through to HINT_LINES.AUTO and the panel named the WRONG MODE
// ("M pilot (AUTO)" while the pilot mode was AUTO MOVE). That is precisely the
// rule this file's own G11 note states (the hints name the LIVE mode) and the
// build plan's "every new system updates the reference surfaces" rule, so the
// mode name is now keyed off PILOT_MODES and the fallback cannot mislabel.
const HINT_LINES = {
  AUTO_ALL: [
    'M pilot (AUTO ALL) &middot; TAB focus &middot; G stance',
    'Q / E (W too) skills &middot; H / N potions',
    'I stats &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; 1-3 draft, 1-6 tabs &middot; ? hide',
  ],
  AUTO_MOVE: [
    'M pilot (AUTO MOVE) &middot; TAB focus &middot; G stance',
    'Q / E (W too) skills &middot; H / N potions',
    'I stats &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; 1-3 draft, 1-6 tabs &middot; ? hide',
  ],
  MANUAL: [
    'M pilot (MANUAL) &middot; WASD / arrows move',
    'TAB focus &middot; G stance &middot; Q frost &middot; E overcharge',
    'I stats (S = move down) &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; 1-3 draft, 1-6 tabs &middot; ? hide',
  ],
};
// The pre-(h) persisted mode name 'AUTO' is an alias, not a lookalike table:
// one array, so the copy cannot diverge between the two names.
HINT_LINES.AUTO = HINT_LINES.AUTO_ALL;

function refreshHints() {
  const lines = [...(HINT_LINES[normalizePilotMode(state.pilotMode)] || HINT_LINES.AUTO_ALL || [])];
  // G11: name the live challenge mode while a non-standard run is up (the
  // hints are in-run chrome; a STANDARD run sees the same four lines as
  // before).
  if (!isStandard(state.challenge)) {
    lines.splice(1, 0, 'CHALLENGE: ' + challengeOf(state.challenge).name);
  }
  if (hintsEl) hintsEl.innerHTML = lines.join('<br>');
}
function applyHints() {
  refreshHints();
  // WAVE-25 (audit 2.1/2.12): visibility is syncChrome's job (screen gate +
  // pref + intro/portal-cine correctness), not a bare class toggle here.
  syncChrome();
}
function toggleHints() {
  hintsOn = !hintsOn;
  try { prefStorage.setItem(KEY_HINTS, hintsOn ? '1' : '0'); } catch { /* shim */ }
  applyHints();
}
applyHints();

// A2 THE RADAR: one toggle, one code path — the R key and the RADAR touch
// button both land here (the button through runAction, the key directly).
// The state flag is the whole mechanism: render.js reads it every frame, so
// ON paints from the next frame and OFF leaves nothing behind (the canvas is
// repainted whole every frame; there is no radar DOM to leak). The toast is
// the discovery feedback, same pattern as the stance cycle.
function toggleRadar() {
  state.radarOn = !state.radarOn;
  toast('RADAR ' + (state.radarOn ? 'ON' : 'OFF') + ' (R)', '#b8e0ff');
  return state.radarOn;
}

// pointerdown fires with no tap delay; touch-action: manipulation kills the
// legacy 300ms wait and double-tap zoom.
//
// WAVE-15 ANALOG JOYSTICK (replaces the WAVE-13 d-pad, Sk408 playtest):
// touching the base captures the steering pointer BY IDENTIFIER — other
// fingers keep working the skill/potion buttons (multi-touch safe). The drag
// vector is the knob offset from the base center, clamped to the base radius;
// movement scales with the deflection fraction (see controllers.js
// PlayerController + JOY_DEAD_ZONE). Release recenters to zero.
// Lifted to __TEST for the smoke probes (null when no touch layer exists).
let joyVec = null, joyRelease = null;

if (touchLayer && touchLayer.addEventListener) {
  let joyPointerId = null;   // the finger that owns the stick (null = free)

  // Offset (px from base center, client space) -> analog input + knob visual.
  // rad = base radius in px. Exposed via __TEST as joyVec for the smoke probes.
  function applyJoyVector(dx, dy, rad) {
    const max = Math.max(1, rad || 1);
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, max);
    if (len <= 0) {
      joyRecenter();
      return;
    }
    const ux = dx / len, uy = dy / len;
    pilotInput.x = ux;
    pilotInput.y = uy;
    pilotInput.mag = clamped / max;
    // Knob visual: the clamped offset (edge drag parks the knob at the rim).
    if (joyKnobEl && joyKnobEl.style) {
      joyKnobEl.style.transform =
        'translate(' + Math.round(ux * clamped) + 'px,' + Math.round(uy * clamped) + 'px)';
    }
  }
  function joyRecenter() {
    pilotInput.x = 0; pilotInput.y = 0; pilotInput.mag = 0;
    if (joyKnobEl && joyKnobEl.style) joyKnobEl.style.transform = 'translate(0px,0px)';
  }
  // One pointer event -> base-relative drag vector. No-ops when the base is
  // hidden or has no measurable rect (stub/headless guard).
  function joySteer(ev) {
    if (!joyEl || typeof joyEl.getBoundingClientRect !== 'function') return;
    const r = joyEl.getBoundingClientRect();
    if (!r || !r.width) return;
    applyJoyVector(
      (ev.clientX ?? 0) - (r.left + r.width / 2),
      (ev.clientY ?? 0) - (r.top + r.height / 2),
      r.width / 2);
  }
  const isJoyPointer = (ev) => joyPointerId !== null && ev.pointerId === joyPointerId;

  touchLayer.addEventListener('pointerdown', (ev) => {
    const joy = ev.target && ev.target.closest
      ? ev.target.closest('[data-joy]') : null;
    if (joy) {
      if (ev.preventDefault) ev.preventDefault();
      joyPointerId = ev.pointerId ?? 0;   // capture THIS finger
      joySteer(ev);                       // a press at the rim steers at once
      return;
    }
    const btn = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    if (ev.preventDefault) ev.preventDefault();
    runAction(btn.dataset.act);
  });
  touchLayer.addEventListener('pointermove', (ev) => {
    if (isJoyPointer(ev)) {
      if (ev.preventDefault) ev.preventDefault();
      joySteer(ev);
    }
  });
  const releasePointer = (ev) => {
    if (isJoyPointer(ev)) {
      joyPointerId = null;
      joyRecenter();   // release = stick snaps back to center
    }
  };
  touchLayer.addEventListener('pointerup', releasePointer);
  touchLayer.addEventListener('pointercancel', releasePointer);
  joyVec = applyJoyVector;
  joyRelease = joyRecenter;
}

// Badges mirror HUD state, written each frame (same numbers as the HUD).
// The touch layer is only relevant mid-run — menus are directly tappable.
//
// WAVE-25 FIX (audit 2.1 + 2.12): SCREEN CHROME — the pad layer (8 buttons),
// the cog, the "?" and the hints panel. Its keys/buttons only do anything while
// a run is LIVE (playing / finale), so that is the one screen gate. Every writer
// of its visibility goes through syncChrome() and frame() calls it on the FIRST
// frame of every mode, including 'intro' and 'portal-cine' (which early-return):
// previously the layer kept whatever display it had at module load
// (`#touch.cog-only { display: block }`) and the whole desktop UI sat on top of
// the intro movie for its full ~7s. Same gate removes the hints panel from the
// draft / intermission / death screens, where every key it lists is inert.
function chromeOn() {
  // G13 registration check: 'characters' is deliberately NOT in this list —
  // the selector is a meta screen, so the pad layer / cog / "?" / hints stay
  // down while it is live (verified by name in tools/verify_g13_selector.mjs).
  return state.mode === 'playing' || state.mode === 'finale';
}
function syncChrome() {
  // WAVE-25 (audit 2.6): publish the active controller's doctrine + the zoom
  // factor as first-class state, BEFORE anything reads them this frame.
  // WAVE-27: these published fields are the ONE source of truth for the
  // doctrine values. The canvas no longer paints them (owner ruling); their
  // consumers are the overlay button badges (updateTouchHud, right below) and
  // the opt-in text HUD (hudTextBlock) — both read state.*, never the
  // controller directly. state.zoomScale stays the canonical integer zoom so
  // the renderer's transform cannot drift from the coachmark projection in
  // worldRegion() below.
  state.focus = controller.focus;
  state.stance = controller.stance;
  // WAVE-26: the stance's LIVE activity (controllers.js sets it in decide) —
  // WAVE-27 it rides the PILOT badge, so the dial's effect is still visible
  // moment to moment without any canvas text.
  state.stanceAct = controller.act || 'PATROL';
  // E1: publish the live purse for the canvas HUD readout (render.js paints
  // state.*, never the profile).
  state.runPurse = profile.runPurse | 0;
  state.zoomScale = zoomScale(state.zoom);
  const on = chromeOn();
  if (touchLayer && touchLayer.style) {
    const want = on ? '' : 'none';
    if (touchLayer.style.display !== want) touchLayer.style.display = want;
  }
  // WAVE-15: the joystick shows ONLY while the manual pilot is bound mid-run.
  if (joyEl && joyEl.style) {
    const wantJoy = (on && state.pilotMode === 'MANUAL') ? 'block' : 'none';
    if (joyEl.style.display !== wantJoy) joyEl.style.display = wantJoy;
  }
  if (hintsEl && hintsEl.classList) hintsEl.classList.toggle('on', on && hintsOn);
}
function updateTouchHud() {
  syncChrome();
  const p = state.player;
  const set = (id, v) => { const el = touchEls[id]; if (el) el.textContent = v; };
  // WAVE-27: the badges are the doctrine's ONLY on-screen home now, and they
  // read the PUBLISHED state (state.focus / state.stance / state.stanceAct,
  // set by syncChrome just above) rather than scraping the controller — so
  // there is exactly one source for the values. The PILOT badge also carries
  // the pilot's live activity (FLEE / LOOT / PATROL), which keeps the stance's
  // moment-to-moment effect visible after the canvas text was removed; under
  // the manual pilot the activity IS 'MANUAL', so the badge prints just the
  // mode rather than "MANUAL · MANUAL". The stance's MEANING (its TAG) is
  // announced by the cycle toast (cycleStanceWithFeedback) — the discovery
  // moment, by owner ruling.
  const act = state.stanceAct;
  set('tc-focus', state.focus);
  set('tc-stance', state.stance);
  set('tc-pilot', act && act !== state.pilotMode
    ? state.pilotMode + ' \u00b7 ' + act
    : state.pilotMode);
  const skill = (id, defId) => {
    // N1 slice 3: an ult badge reads the charge state, never mana — cooling
    // (`12.0s`) while the floor runs, then RDY at full charge, else `34/40`.
    const u = ultCharge(state, defId);
    if (u) {
      set(id, u.cooldown > 0 ? u.cooldown.toFixed(1) + 's'
        : (u.charge >= u.need ? 'RDY' : u.charge + '/' + u.need));
      return;
    }
    const cd = p.skillCd[defId];
    // G8 step 4: the readiness readout reads the SAME helpers useSkill pays
    // (perks.js), so FOCUS cannot make the button text lie about RDY/LOW.
    set(id, cd > 0 ? cd.toFixed(1) + 's' : (p.mana >= skillManaCost(defId, state) ? 'RDY' : 'LOW'));
  };
  skill('tc-q', classSkillId(state));
  skill('tc-w', 'OVERCHARGE');
  set('tc-h', String(p.potions.hp));
  set('tc-n', String(p.potions.mp));
  // A2: the RADAR button carries no badge — its lit frame IS the readout
  // (state-driven, rewritten every frame like the badges above).
  const radarBtn = touchEls['tc-radar'];
  if (radarBtn && radarBtn.classList) radarBtn.classList.toggle('on', !!state.radarOn);
}

// ---------- HUD ----------
function drawHud() {
  const p = state.player;
  // ARCADE PASS: golden HUD (the 60k gold flex).
  if (hud.style) {
    const want = hasArcadePass(profile) ? '#ffd75e' : '';
    if (hud.style.color !== want) hud.style.color = want;
    // WAVE-12: the text HUD is opt-in (settings TEXT HUD toggle, persisted);
    // the canvas HUD chrome is the default readout. WAVE-25 (audit 2.9): the
    // text is only BUILT while it can be observed (see below) — hidden on a
    // real page means no per-frame string work, not just an invisible node.
    const wantDisp = hudTextEnabled() ? '' : 'none';
    if (hud.style.display !== wantDisp) hud.style.display = wantDisp;
  }
  // WAVE-25 PERF (audit 2.9): the text block is a ~600-char string rebuilt and
  // assigned EVERY frame, but it is only observable when the opt-in text HUD is
  // on (the desktop default is OFF) — or in a headless harness, which has no
  // layout API and reads this string as its only view of HUD state. A real
  // hidden element is read by nobody, so skip the build there.
  if (hudTextEnabled() || typeof hud.getBoundingClientRect !== 'function') {
    hud.textContent = hudTextBlock(p);
  }
  // WAVE-13: tiny canvas 'M' badge beside the hp/mana chrome while the manual
  // pilot is bound (AUTO shows nothing). fillRect-only, drawn on the
  // renderer's ctx from here — render.js stays untouched (WAVE-12 precedent).
  if (state.pilotMode === 'MANUAL' && renderer.ctx &&
      (state.mode === 'playing' || state.mode === 'finale' || state.mode === 'stats')) {
    const ctx = renderer.ctx;
    ctx.fillStyle = '#14141f';
    ctx.fillRect(119, 14, 14, 17);   // plate (bars run x6..116)
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(121, 17, 2, 11);    // left stem
    ctx.fillRect(129, 17, 2, 11);    // right stem
    ctx.fillRect(123, 19, 2, 2);     // vee
    ctx.fillRect(127, 19, 2, 2);
    ctx.fillRect(125, 21, 2, 2);
  }
}

// WAVE-25 (audit 2.9): the text-HUD body, split out of drawHud so the string
// build can be skipped while it is hidden. Values are read live on every call —
// nothing is cached, so a caller that skips it loses nothing.
function hudTextBlock(p) {
  const bars = 20;
  const filled = Math.max(0, Math.min(bars, Math.round(bars * p.hp / p.stats.maxHp)));
  const mFilled = Math.max(0, Math.min(bars, Math.round(bars * p.mana / p.stats.maxMana)));
  const skillTxt = (id, label) => {
    // N1 slice 3: an ult reads charge / RDY / cooling, never mana (it has no
    // MANA key — the old `p.mana >= def.MANA` read would be NaN-false forever).
    const u = ultCharge(state, id);
    if (u) {
      if (u.cooldown > 0) return `${label} ${u.cooldown.toFixed(1)}s`;
      return u.charge >= u.need ? `${label} RDY` : `${label} ${u.charge}/${u.need}`;
    }
    const cd = p.skillCd[id];
    const def = C.SKILLS[id];
    if (cd > 0) return `${label} ${cd.toFixed(1)}s`;
    return p.mana >= def.MANA ? `${label} RDY` : `${label} --`;
  };
  // Wave timer line: countdown to the boss, BOSS! (+ NAMES, wave-7/B) while
  // any lives, or PORTAL! while the wave-clear portal is open.
  const waveLeft = Math.max(0, state.wave.endsAt - state.time);
  const bossNames = (state.wave.bosses || []).filter(b => b.hp > 0).map(b => b.name).join(' & ');
  // WAVE-10: the finale owns the wave line — the maw's name + a beatable-
  // looking M-formatted hp readout (raw 2,500,000 would read as math, not
  // as a bar that's visibly draining).
  const mawTxt = state.finalBoss
    ? `THE MAW OF THE HORDE ${(state.finalBoss.hp / 1e6).toFixed(2)}M` +
      // RUN-STRUCTURE: the milestone has a WINDOW — show it, because surviving
      // the window is a real outcome (the maw withdraws, the run continues).
      (Number.isFinite(state.mawDeadline)
        ? ` ${Math.max(0, Math.ceil(state.mawDeadline - state.time))}s` : '')
    : null;
  const waveTxt = mawTxt ? mawTxt
    : state.wave.boss ? 'BOSS! ' + (bossNames || '')
    : state.portal ? 'PORTAL!'
    : `${Math.floor(waveLeft / 60)}:${String(Math.floor(waveLeft % 60)).padStart(2, '0')}`;
  // WPN line: base volley is slot 1; the VOLLEY instance rides in
  // state.weapons for XP/leveling but never counts against the slots.
  // Evolved weapons show their EVOLUTION name (wave-7/A).
  const slotCap = state.weaponSlots || C.WEAPON_SLOTS;
  const nonVolley = state.weapons.filter(w => w.type !== 'VOLLEY').length;
  const wpnNames = state.weapons.map(w => {
    const nm = w.evolution ? w.evolution.name : (WEAPON_NAMES[w.type] || w.type);
    return nm + ((w.level || 1) > 1 ? '\u00b7' + w.level : '');
  }).join(',');
  // Equipped rare items (loot.js): last word of the name keeps the line short.
  const itemNames = state.items.map(it => it.name.split(' ').pop()).join(',');
  // Active arch buffs (arches.js) + remaining AEGIS absorbs.
  const archBits = (state.archBuffs || []).map(b => {
    const nm = (ARCH_TYPES[b.type] || {}).name || b.type;
    return nm.split(' ')[0] + ':' + Math.ceil(b.t) + 's';
  });
  if (state.shieldAbsorbs > 0) archBits.push('AEGISx' + state.shieldAbsorbs);
  // WAVE-25 FIX (audit 2.11): the readout is clamped at 0 to match the clamped
  // bar fill above — an unclamped Math.ceil(p.hp) printed e.g. "HP [---] -3/130"
  // on a live death screen.
  return `HP  [${'#'.repeat(filled)}${'-'.repeat(bars - filled)}] ${Math.max(0, Math.ceil(p.hp))}/${Math.ceil(p.stats.maxHp)}\n` +
    `MAN [${'#'.repeat(mFilled)}${'-'.repeat(bars - mFilled)}] ${Math.floor(p.mana)}/${Math.ceil(p.stats.maxMana)}\n` +
    // WAVE-28: the skill letters are the UNIVERSAL ones (Q / E) so this line
    // agrees with the touch buttons and the hint lines — `W` is AUTO-only
    // (in MANUAL it is held 'up'; main.js keyMap maps `e` to the act in BOTH
    // modes) and the AUTO hint line already discloses "(W too)".
    // N1 slice 1: the Q short label is derived from the LIVE class skill's
    // NAME (spaces stripped) — 'FrostNova' for three classes, 'ChainReaction'
    // on the Witch — never a hardcoded skill literal. N1 slice 3: an ult's
    // short LABEL (EARTH / AFTER / ALTAR, <=5 chars) takes precedence — the
    // same label the fixed 96px H1 touch button shows.
    // N1 slice 2: a held Pocket Frost card NAMES itself on the same skills
    // line ('FROST AUTO') — no new panel, no new chrome.
    `Q ${skillTxt(classSkillId(state), ((C.SKILLS[classSkillId(state)] || {}).LABEL || (C.SKILLS[classSkillId(state)] || {}).NAME || 'Frost Nova').replace(/ /g, ''))}   E ${skillTxt('OVERCHARGE', 'Ovrchg')}${p.buffs.overcharge > 0 ? '!' : ''}${hasFrost(state) ? '   FROST AUTO' : ''}\n` +
    `POTIONS  H:${p.potions.hp}  N:${p.potions.mp}   TAB Focus:${state.focus} G:${state.stance} Pilot:${state.pilotMode}\n` +
    `WPN ${1 + nonVolley}/${slotCap} ${wpnNames}\n` +
    `ITM ${state.items.length}/${MAX_EQUIPPED} ${itemNames}` +
    (state.evoTokens > 0 ? ` \u2666${state.evoTokens}` : '') + '\n' +
    `FOES ${foeLine()}\n` +
    `WEATHER: ${state.weather ? state.weather.def.name.toUpperCase() : 'CLEAR'}` +
    `   ${describeHeat(heatOf(state))}` +
    (archBits.length ? `   ARCH ${archBits.join(' ')}` : '') + '\n' +
    `RUN ${runClock(state.time)}/${runClock(C.RUN.LIMIT)}   WAVE ${state.wave.num} - ${waveTxt}   LVL ${p.level}   XP ${Math.floor(p.xp)}/${p.xpNext}\n` +
    // G11: the mode badge line — only while a NON-standard mode is live, so a
    // STANDARD run's text HUD is byte-identical to before.
    (isStandard(state.challenge) ? '' : `MODE ${challengeOf(state.challenge).name}\n`) +
    `TIME ${Math.floor(state.time)}s   KILLS ${p.kills}   RP ${state.rampage.streak} (x${rampageMult().toFixed(2)})   POS ${p.x.toFixed(1)},${p.y.toFixed(1)}` +
    (state.toasts.length ? `\n! ${state.toasts[state.toasts.length - 1].msg}` : '');
}

// Per-type enemy census (HUD probe; smoke test asserts on it).
// W=Warlock T=Tick X=Colossus O=Pillar E=elite count.
function foeLine() {
  const n = { C: 0, S: 0, B: 0, P: 0, D: 0, W: 0, T: 0, X: 0, E: 0, O: 0, MAW: 0 };
  const k = { CHASER: 'C', SWARMER: 'S', BRUTE: 'B', SPITTER: 'P', DASHER: 'D',
              WARLOCK: 'W', TICK: 'T', COLOSSUS: 'X', PILLAR: 'O' };
  for (const e of state.enemies) {
    if (e.finalBoss) { n.MAW++; continue; }   // WAVE-10: the maw is its own line
    n[k[e.typeId] || 'C']++;
    if (e.elite) n.E++;
  }
  return `C:${n.C} S:${n.S} B:${n.B} P:${n.P} D:${n.D} W:${n.W} T:${n.T} X:${n.X} E:${n.E}` +
    (n.O ? ` O:${n.O}` : '') +   // WAVE-20: the herald's pillars (only when present)
    (n.MAW ? ` MAW:${n.MAW}` : '');
}

// ---------- Main loop ----------
// WAVE-7/D: the intro movie plays BEFORE the title menu on page load — the
// canvas IS the movie (intro.js render is fillRect-only and deterministic);
// any key/click/tap skips straight to the menu. It plays once per load:
// death-screen TITLE returns jump straight to the menu.
let introT0 = performance.now();
function endIntro() {
  if (state.mode !== 'intro') return;
  state.mode = 'menu';
  // WAVE-19: first boot pops HOW TO PLAY once, before the first run starts;
  // returning players go straight to the title. Never mid-run by construction
  // (the intro only ever plays pre-menu).
  if (!onboardingDone()) showHowToPlay();
  else showTitle();
}
// ---------- CINEMATIC GESTURE GUARD (Sk408 playtest) ------------------------
// "During the opening cinematic, if I push on the screen, it pushes whatever
// button is going to be there." A tap is pointerdown -> pointerup -> click, and
// the click is dispatched at the touch point AFTER the skip handler has already
// switched modes — so ONE tap against the intro movie skipped the movie AND
// pressed the button that appeared under the same finger (PLAY / HOW TO PLAY,
// or a chest card when the portal cinematic hands off to the intermission).
// The keyboard path has the same shape (Enter activating a just-appeared
// button, and any key skipping the movie).
//
// The guard consumes the TAIL of that one gesture: for UI_GUARD_MS after a
// cinematic is ended BY INPUT, any pointerup/click/keyup landing on the overlay
// is swallowed in the CAPTURE phase, so a card's own handler never sees it.
// A fresh pointerdown (a new press = a new intent) stands the guard down
// immediately, so the player's NEXT deliberate tap is never eaten.
const UI_GUARD_MS = 400;
let uiGuardUntil = 0;
const uiGuard = {
  arm: () => { uiGuardUntil = performance.now() + UI_GUARD_MS; },
  armed: () => performance.now() < uiGuardUntil,
  standDown: () => { uiGuardUntil = 0; },
  // ONE definition of "swallow", so the rule cannot drift between callers.
  swallow: (ev) => {
    if (!uiGuard.armed()) return false;
    if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    else if (ev && ev.stopPropagation) ev.stopPropagation();
    if (ev && ev.preventDefault) ev.preventDefault();
    return true;
  },
  window: UI_GUARD_MS,
};
if (overlay && overlay.addEventListener) {
  for (const type of ['pointerup', 'click', 'keyup']) {
    overlay.addEventListener(type, (ev) => uiGuard.swallow(ev), true);
  }
  overlay.addEventListener('pointerdown', () => uiGuard.standDown(), true);
}

// Click/tap skip (guarded: headless stubs may not implement addEventListener).
// WAVE-8/A: the same gesture skips the portal cinematic.
if (canvas.addEventListener) canvas.addEventListener('pointerdown', () => {
  // Armed ONLY when this gesture actually ended a cinematic — never during play.
  const skipping = state.mode === 'intro' ||
    (state.mode === 'portal-cine' && C.CINE.SKIPPABLE);
  if (skipping) uiGuard.arm();
  endIntro();
  if (C.CINE.SKIPPABLE) endPortalCine();
});

// ---------- Portal-entry cinematic (WAVE-8/A) ----------
// Plays once when the wave's FINAL boss dies: gameplay freezes, CINE.render
// runs per frame until isDone, then the run proceeds into the EXISTING
// intermission (openIntermission — chest shop + blessing cards + CONTINUE).
// Any key/click/tap skips straight to the end (gated by CONFIG.CINE.SKIPPABLE).
// WAVE-8/B: phaseAt is polled once per frame; each phase transition fires the
// matching audio stinger (BOSS_YELL at KILL, shimmer during DISSOLVE — sfx
// toggle gates them, the re-fire guard makes double-fires safe).
let cineT0 = 0, lastCinePhase = null;
function startPortalCine() {
  state.wave.cinePending = false;
  cineT0 = performance.now();
  lastCinePhase = null;
  state.mode = 'portal-cine';
}
function endPortalCine() {
  if (state.mode !== 'portal-cine') return;
  // WAVE-10: the END_WAVE cast fell and the maw MILESTONE begins (final_boss.js).
  // RUN-STRUCTURE: the maw is the run's milestone beat at END_WAVE, not the
  // run's ending — it is a bounded encounter, and every wave AFTER it resumes
  // the ordinary ladder (intermission -> CONTINUE) up to the 30:00 limit.
  if (state.wave.num === C.ESCALATION.END_WAVE) { startFinale(); return; }
  openIntermission();
}

// ---------- FINALE / MAW MILESTONE (final_boss.js) ---------------------------
// The milestone beat: the field is swept clean (no spawns, no portal, no
// intermission/choices) and the MAW comes in ALONE. Every hit it lands is an
// exact third of maxHp — defenses, heat, items and buffs are all blind to it —
// so the encounter is a pure dodge-and-burn skill check.
//
// RUN-STRUCTURE changes (all in main.js; final_boss.js is untouched):
//   * The maw has a REAL, finite hp pool (CONFIG.RUN.MAW_HP, the same 2.5M the
//     display bar always showed). Killing it is the milestone: it unlocks the
//     next difficulty tier on the profile and pays a bonus — it does NOT end
//     the run. The old behaviour (an unkillable wall that WAS the ending) is
//     exactly what the run-structure wave was chartered to remove.
//   * The encounter has a WINDOW (CONFIG.RUN.MAW_WINDOW). Survive it without
//     killing the maw and it withdraws and the run CONTINUES: a milestone must
//     not be a mandatory wall on the road to the 30:00 limit.
//   * Damage is written to boss.hp directly (weapons.js already writes there
//     for its chip bodies), so the bar the HUD shows IS the real pool.
function startFinale() {
  state.enemies.length = 0;
  state.enemyShots.length = 0;
  state.chests.length = 0;
  state.arches.length = 0;
  state.shrine = null;   // WAVE-11: no shrines past the end
  state.archBuffs.length = 0;
  state.shieldAbsorbs = 0;
  state.portal = null;
  state.wave.bosses = [];
  state.wave.boss = null;
  state.wave.pendingClear = false;
  state.wave.cinePending = false;
  state.volleyMask = null;
  const p = state.player;
  const a = Math.random() * Math.PI * 2;
  const b = makeFinalBoss(
    p.x + Math.cos(a) * C.ENEMY.SPAWN_DIST * 0.6,
    p.y + Math.sin(a) * C.ENEMY.SPAWN_DIST * 0.6);
  b.finalBoss = true;   // tagged: updateFinale() owns it (update() never runs)
  // RUN-STRUCTURE: the real pool. MAW_HP === final_boss.js DISPLAY_HP, so the
  // HUD readout and every existing probe are unchanged; what changed is that
  // the bar can now reach zero.
  b.hp = b.maxHp = C.RUN.MAW_HP;
  b.milestone = true;
  easeToBossStance();   // BOSS_STANCE: the maw is the run's biggest arrival
  state.mawDeadline = state.time + C.RUN.MAW_WINDOW;
  state.mawCleared = false;
  // WAVE-25 (audit 2.5) + wave-26: the maw's speed used to be the bare
  // literal 140 while FINAL_BOSS.speedMult (0.35) was read nowhere. The
  // factory (final_boss.js makeFinalBoss) now stamps the real default from
  // the shared MAW_SPEED_BASE knob, so this line only RE-STATES the same
  // value from the same source of truth — no literal lives here anymore.
  b.speed = MAW_SPEED_BASE * FINAL_BOSS.speedMult;
  b.w = Math.round(b.w * FINAL_BOSS.sizeMult);   // collision box matches sprite
  b.h = Math.round(b.h * FINAL_BOSS.sizeMult);
  state.finalBoss = b;
  // Rides state.enemies ONLY so the untouched controller finds a target; the
  // normal enemy loop never ticks while mode === 'finale'.
  state.enemies.push(b);
  state.mode = 'finale';
  toast(FINAL_BOSS.name + ' APPROACHES');
  toast(FINAL_BOSS.flavor.toUpperCase());
  // WAVE-14: the maw's arrival gets the banner too — doom-ier sub-line.
  state.bossBanner = {
    names: [FINAL_BOSS.name], verb: 'APPROACHES',
    title: FINAL_BOSS.name,
    sub: FINAL_BOSS.flavor.toUpperCase(),   // "EVERY HORDE WAS ALWAYS ONE HUNGER."
    ttl: 2.5,
  };
  audio.playPortalCue('BOSS_YELL');
  audio.playSfx('death');
  audio.startMusic();
}

// The finale tick (mode === 'finale'; frame() routes here instead of update).
// Everything from the normal loop that still applies to a 1v1 — controller,
// weapons, weather, camera — plus the maw's own choreography and hit rules.
function updateFinale(dt) {
  const p = state.player;
  state.time += dt;
  // RUN-STRUCTURE: the clock + the win run in the finale too — a player who
  // reaches 30:00 while fighting the maw has still survived the run.
  if (checkRunLimit()) return;
  if (p.invuln > 0) p.invuln -= dt;
  // The milestone WINDOW: survive it and the maw withdraws, the run continues.
  if (state.time >= state.mawDeadline) { mawWithdrew(); return; }
  updateWeather(state, state.weather, dt);
  const am = activeArchMods(state);   // arches are gone: identity mods
  runController(p, dt, am);
  updateResources(p, dt);
  const regenBonus = (p.stats.manaRegen ?? C.MANA.REGEN) - C.MANA.REGEN;
  if (regenBonus > 0) p.mana = Math.min(p.stats.maxMana, p.mana + regenBonus * dt);
  // The SECOND resource seam (see the play loop's copy): the same ONE helper.
  applyRegrowth(state, dt);
  // WAVE-28: the SECOND auto-drink seam — the maw fight is exactly when a
  // pilot-owned potion matters most (see the play loop's copy).
  autoDrinkPotions(state, dt);
  // N1b item 8: the SECOND auto-cast seam — the maw fight is the one place
  // the pilot MUST be able to spend its pool on damage (see the play loop's
  // copy). bossCastLive is false here (the cast is down), but the maw itself
  // and the near-full spill rule both still gate OVERCHARGE honestly.
  autoCastSkills(state);
  // N1 slice 3: the SECOND ult-window seam — the maw fight must tick the
  // AFTERIMAGE phantoms and the CONSECRATION field like any other frame.
  updateUlts(state, dt);
  updateWeapons(state, state.weapons, dt);   // chip damage; floor re-clamped below

  // The maw: age-keyed choreography (final_boss.js) — slow drift, telegraph
  // in the last 0.8s of each 4.5s cycle, a 48-shot ring on the cycle wrap.
  const b = state.finalBoss;
  b.age += dt;
  if (b.flash > 0) b.flash -= dt;
  if (b.slow > 0) b.slow -= dt;
  const act = decideFinalBossAction(b, p, state, dt);
  b.telegraph = !!act.telegraph;
  const mawSpd = b.speed * (b.slow > 0 ? C.SKILLS.FROST_NOVA.SLOW_FACTOR : 1);
  // WAVE-25 (audit 2.4): the same config-driven arena edge as the rest.
  const RIM = C.GROUND.RIM;
  b.x = Math.max(-RIM, Math.min(RIM, b.x + act.mx * mawSpd * dt));
  b.y = Math.max(-RIM, Math.min(RIM, b.y + act.my * mawSpd * dt));
  if (act.barrage) {
    const N = act.barrage.shots, off = Math.random() * Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const ang = off + (i / N) * Math.PI * 2;
      state.enemyShots.push({
        x: b.x, y: b.y,
        vx: Math.cos(ang) * act.barrage.speed,
        vy: Math.sin(ang) * act.barrage.speed,
        damage: 0, age: 0, kind: 'maw',
        volleyId: act.barrage.volleyId,   // the mercy rule keys on this
      });
    }
    state.effects.push({ kind: 'boss_nova', x: b.x, y: b.y, radius: 60, age: 0, ttl: 0.5 });
    toast('THE MAW OPENS');
    audio.playSfx('death');
  }

  // Barrage projectiles: the FIRST touch of a volleyId costs an exact third
  // of maxHp DIRECTLY (no defenses, no heat, no damageTaken mults); the rest
  // of the same volley pass through harmlessly. NOTE (G8 step 4): the maw's
  // mercy-rule hits are the ONE player-HP path deliberately NOT routed through
  // perks.damageTaken — "no damageTaken mults" is the documented balance
  // contract (Glass Cannon's mult is excluded here for the same reason), so
  // THICK SKIN does not apply to the finale.
  for (const s of state.enemyShots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.age += dt;
    if (p.invuln <= 0 && Math.hypot(s.x - p.x, s.y - p.y) < 9) {
      const r = shouldApplyHit(state.volleyMask, s.volleyId);
      state.volleyMask = r.nextState;
      if (r.apply) {
        p.hp -= finalBossDamage(p.stats);   // reads .maxHp -> stats carries it
        p.invuln = 0.6;
        resetRampage();   // WAVE-11: the maw's hits end the streak too
        state.effects.push({ kind: 'hit_spark', x: p.x, y: p.y, age: 0, ttl: 0.15 });
        audio.playSfx('hit');
        if (p.hp <= 0) { die(true); return; }
      }
    }
  }
  state.enemyShots = state.enemyShots.filter(s => s.age < 8);

  // Body contact: the maw itself bites under the same mercy rule — at most
  // once per choreography cycle (the 'body'+n id never collides with the
  // numeric barrage volleyIds).
  if (p.invuln <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < Math.max(b.w, b.h) * 0.45) {
    const bodyId = 'body' + Math.floor(Math.max(0, b.age - FINAL_BOSS_PHASES.GRACE) / FINAL_BOSS_PHASES.CYCLE);
    const r = shouldApplyHit(state.volleyMask, bodyId);
    state.volleyMask = r.nextState;
    if (r.apply) {
      p.hp -= finalBossDamage(p.stats);   // reads .maxHp -> stats carries it
      p.invuln = 0.6;
      resetRampage();   // WAVE-11: the maw's bite ends the streak too
      audio.playSfx('hit');
      if (p.hp <= 0) { die(true); return; }
    }
  }

  // Hero volley vs the maw: normal crit/evolution math decides the damage.
  // RUN-STRUCTURE: the hp WRITE is a plain subtraction against the REAL pool
  // (final_boss.js's applyFinalBossDamage clamps at HP_FLOOR forever, which is
  // the old "unkillable" rule — the milestone needs a pool that can reach 0).
  // weapons.js chip bodies already write boss.hp directly, so both paths now
  // agree: boss.hp IS the maw's real health.
  const wd = windDrift(state.weather);
  const volleyW2 = state.weapons.find(w => w.type === 'VOLLEY');
  const volleyEvo3 = volleyW2 && volleyW2.evolution;
  const evoCrit2 = (p.stats.crit || 0) + ((volleyEvo3 && volleyEvo3.affixes.crit) || 0);
  const evoCritMult2 = (p.stats.critMult || 1.5) + ((volleyEvo3 && volleyEvo3.affixes.critMult) || 0);
  for (const pr of state.projectiles) {
    if (pr.kind) continue;   // kind bodies are weapons.js-owned (already moved)
    pr.age += dt;
    if (pr.orbit) {   // Orbital Volley flag — same flight rule as update()
      pr.orbit.t += dt;
      const ang = pr.orbit.ang + pr.orbit.t * (Math.PI * 2 / pr.orbit.dur);
      pr.x = p.x + Math.cos(ang) * 26;
      pr.y = p.y + Math.sin(ang) * 26;
      if (pr.orbit.t >= pr.orbit.dur) {
        pr.x = p.x + Math.cos(pr.orbit.ang) * 26;
        pr.y = p.y + Math.sin(pr.orbit.ang) * 26;
        pr.orbit = null;
      }
    } else {
      pr.x += pr.vx * dt + wd.x * dt; pr.y += pr.vy * dt + wd.y * dt;
    }
    if (pr.hit.has(b) || Math.abs(pr.x - b.x) > b.w / 2 || Math.abs(pr.y - b.y) > b.h / 2) continue;
    let dmg = pr.damage;
    if (evoCrit2 > 0 && Math.random() < evoCrit2) {
      dmg *= evoCritMult2;
      state.effects.push({ kind: 'hit_spark', x: pr.x, y: pr.y - 3, age: 0, ttl: 0.15 });
    }
    b.hp = Math.max(0, b.hp - dmg);
    b.flash = 0.08;
    pr.hit.add(b);
    state.effects.push({ kind: 'hit_spark', x: pr.x, y: pr.y, age: 0, ttl: 0.12 });
    audio.playSfx('hit');
    if ((p.stats.lifesteal || 0) > 0) {
      p.hp = Math.min(p.stats.maxHp, p.hp + dmg * p.stats.lifesteal);
    }
    if (b.hp <= 0) { mawDefeated(); return; }
    if (pr.hit.size > pr.pierce) pr.age = 99;
  }
  state.projectiles = state.projectiles.filter(pr => pr.kind || pr.age < 3);
  // updateWeapons' bodies chip the maw's hp directly — the same milestone rule
  // applies to that path too (both now write the real pool).
  if (b.hp <= 0) { mawDefeated(); return; }

  // Effects / toasts / camera (same housekeeping as update()).
  for (const fx of state.effects) {
    fx.age += dt;
    if (fx.kind === 'charge') { fx.x = p.x; fx.y = p.y; }
  }
  state.effects = state.effects.filter(fx => fx.age < fx.ttl);
  for (let i = state.toasts.length - 1; i >= 0; i--) {
    state.toasts[i].ttl -= dt;
    if (state.toasts[i].ttl <= 0) state.toasts.splice(i, 1);
  }
  tickBossBanner(dt);   // WAVE-14 arrival overlay (finale maw included)
  // WAVE-27: the finale uses the SAME camera follow as the run (one source).
  updateCamera(p, dt);
}

// THE MAW MILESTONE — cleared. RUN-STRUCTURE: this used to be the run's ONLY
// victory, and it was unreachable (final_boss.js pinned the hp floor). It is
// now a MILESTONE: slaying the maw unlocks a difficulty tier on the profile
// and pays a bonus, then the run CONTINUES (the maw is a beat on the ladder,
// not the end of it). The run's actual completion is the 30:00 limit.
function mawDefeated() {
  state.finalBoss = null;
  state.enemies.length = 0;
  state.enemyShots.length = 0;
  state.mawCleared = true;
  state.mode = 'intermission';   // clears the field; openIntermission re-arms it
  audio.playSfx('levelup');
  // The biggest earned moment in the game — same flourish the finale used.
  triggerEarnedMoment('finale', state.player.x, state.player.y);
  // The unlock: a persistent milestone flag on the profile (src/save.js keeps
  // unknown fields verbatim, so this needs no schema change).
  const first = !(profile.milestones && profile.milestones.mawSlain);
  profile.milestones = { ...(profile.milestones || {}), mawSlain: true };
  toast('THE MAW IS SLAIN — ' + C.RUN.MAW_UNLOCK + ' UNLOCKED');
  toast(first ? 'A NEW DIFFICULTY TIER IS YOURS' : 'THE MAW FALLS AGAIN');
  // The milestone pays on top of the run's ordinary account.
  const bonus = C.RUN.MAW_CLEAR_BONUS || 0;
  const { gold } = settleRunGold({ winBonus: bonus });
  // Hand the milestone headline to the intermission (it renders the follow-on
  // cards: CONTINUE, chests, blessings) — a milestone beat should read as one.
  ovCards.innerHTML = '';
  openIntermission({
    title: 'THE MAW IS SLAIN',
    lead: `<span class="earn">MILESTONE: ${C.RUN.MAW_UNLOCK} TIER UNLOCKED` +
      `${bonus ? ` · +${bonus} BONUS` : ''} · gold +${gold}</span>`,
  });
}

// THE MAW MILESTONE — withdrawn. The encounter window expired with the maw
// alive: it leaves, the run continues, and the milestone stays unearned. This
// is what keeps the milestone a BEAT rather than a mandatory wall between a
// player and the 30:00 limit.
function mawWithdrew() {
  state.finalBoss = null;
  state.enemies.length = 0;
  state.enemyShots.length = 0;
  state.volleyMask = null;
  state.mode = 'playing';
  toast('THE MAW WITHDRAWS');
  restoreBossStance();   // BOSS_STANCE: nothing boss-shaped is left; hand it back
  // Straight into the intermission: the field is empty, so the only thing
  // ahead is the next wave and the rest of the ladder.
  openIntermission();
}

state.mode = 'intro';
let last = performance.now();
let lastIntroPhase = null;
function frame(now) {
  // WAVE-26: the REAL frame delta is measured once, at the top, for EVERY
  // mode — the earned-moment dilation decays on wall-clock time and must not
  // freeze while an overlay/cinematic mode early-returns. `dt` for the
  // simulation is this real delta times the earned-moment time scale.
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const timeScale = advanceDilation(realDt);
  const dt = realDt * timeScale;
  // The earned-moment flourish decays on WALL-CLOCK time too, so slow-mo
  // stretches the simulation but never the flare itself.
  if (state.moment) {
    state.moment.age += realDt;
    if (state.moment.age >= state.moment.ttl) state.moment = null;
  }
  // WAVE-25 FIX (audit 2.1): screen chrome (pad layer, cog, "?",
  // hints panel) and the published doctrine/zoom state are synced on the FIRST
  // frame of EVERY mode. This must run before the 'intro' / 'portal-cine' early
  // returns below: those modes never reached updateTouchHud(), so the whole
  // desktop UI rendered on top of the intro movie for its full ~7s.
  syncChrome();
  // N2: the title reveal/hold advances on WALL-CLOCK dt (same rule as the
  // earned-moment decay above) so it can never assume a frame rate.
  advanceTitleReveal(realDt);
  // G13: the character selector's idle busts advance on the same wall-clock
  // dt (dt-parity: 60Hz and 120Hz step the same frame over the same time).
  // No-ops in every other mode, so no repaint or timer survives BACK.
  advanceCharIdle(realDt);
  // EVOLUTION TOKEN banner hold: the first token of a run holds the sim for
  // TOKEN_BANNER_SEC. The hold decays on WALL-CLOCK dt (the same rule as the
  // earned-moment flourish and the title reveal above), and while it is live it
  // also ages the banner itself — tickBossBanner only runs INSIDE update(),
  // which is exactly what is being held, so the banner would otherwise never
  // expire. Frame-rate independent: 2.5s of real time at 60Hz and at 120Hz.
  if (state.bannerHold > 0) {
    state.bannerHold = Math.max(0, state.bannerHold - realDt);
    if (state.bossBanner) {
      state.bossBanner.ttl -= realDt;
      if (state.bossBanner.ttl <= 0) state.bossBanner = null;
    }
  }
  if (state.mode === 'intro') {
    const t = now - introT0;
    INTRO.render(renderer.ctx, t);
    // WAVE-8/B: fire the intro stinger on each phase transition (rising
    // drone at OVERTAKE, slam at the TITLE stamp, sweep on FADE).
    const iph = INTRO.phaseAt(t);
    if (iph !== lastIntroPhase) { lastIntroPhase = iph; audio.playIntroCue(iph); }
    if (INTRO.isDone(t)) endIntro();
    requestAnimationFrame(frame);
    return;
  }
  if (state.mode === 'portal-cine') {
    // WAVE-8/A: gameplay is frozen (update() only runs in 'playing'); the
    // movie owns the canvas until isDone, then the intermission takes over.
    const t = now - cineT0;
    CINE.render(renderer.ctx, t);
    const cph = CINE.phaseAt(t);
    if (cph !== lastCinePhase) { lastCinePhase = cph; audio.playPortalCue(cph); }
    if (CINE.isDone(t)) endPortalCine();
    requestAnimationFrame(frame);
    return;
  }
  // `dt` (real * earned-moment time scale) was computed at the top of frame().
  if (state.mode === 'playing') {
    // WAVE-21: stage-2 coachmarks PAUSE the sim (a live fight running behind
    // a dimming overlay is confusing — the game plays itself otherwise).
    updateTourCoach();
    if (!coachActive() && state.bannerHold <= 0) update(dt);
  } else if (state.mode === 'finale') updateFinale(dt);
  renderer.render(state, state.cam);
  drawTitleFlourish(renderer.ctx);   // N2: the art-hold shimmer, on top of the painted card
  drawHud();
  // G9 TROPHY GALLERY: the full-screen showcase paints AFTER the HUD so the
  // gallery's emblem and its display case sit on top of the (frozen) world and
  // its readouts. A no-op everywhere else — drawTrophyShowcase returns
  // immediately while state.trophyView is null.
  renderer.drawTrophyShowcase(renderer.ctx, state);
  // G10 BESTIARY: same paint slot as the trophy showcase (after the HUD, on
  // top of the frozen world). A no-op everywhere else — drawBestiary returns
  // immediately while state.bestiaryView is null.
  renderer.drawBestiary(renderer.ctx, state);
  updateTouchHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Headless test seam (smoke.mjs): live state access so integration probes
// can force conditions (Lv8 + item + token) through the REAL loop. Never
// read by the browser page. WAVE-12 adds the renderer (HUD chrome seam) and
// the FIELD REPORT open/close entry points; WAVE-13 adds the pilot-mode
// toggle + the shared held-direction input object (the d-pad seam).
export const __TEST = {
  state, get controller() { return controller; }, startRun,
  getProfile: () => profile, refreshSynergies,
  // N1a: the Q-slot seam — the class's own skill id, and the key act that
  // routes through it (so a probe casts what the button casts).
  classSkillId, runAction,
  renderer, openStats, closeStats,
  // WAVE-17 settings-cog seam: in-run open/close (pause contract probes).
  openSettings, closeSettings,
  // G9 trophy-gallery seam: open/close (the mode + return-mode contract) and
  // step (the ring, so a test can wrap 21 entries without a DOM click per
  // entry). chromeOn is exposed so the pad-layer gate for the new mode is
  // asserted directly, not inferred from a style string.
  openTrophies: showTrophies, closeTrophies, trophiesStep, chromeOn,
  // G10 bestiary seam: open/close (the mode + return-mode contract) and step
  // (the ring, so a test can wrap every display id without a DOM click per
  // entry) — same shape as the gallery seam above.
  openBestiary: showBestiary, closeBestiary, bestiaryStep, bestiaryDisplayIds,
  // G23/G11 filter seam: read the live filter, cycle it through the REAL
  // card/key path (guarded to the bestiary mode).
  bestiaryFilter: { get: () => state.bestiaryFilter, cycle: cycleBestiaryFilter },
  hudText: { get: hudTextEnabled, set: setHudTextEnabled },
  // ---- G12 title-screen seams: the screen itself (showTitle re-renders the
  // REAL startup menu), the no-local-save test the LOAD FROM DISK card rides
  // on, and the honest-exit contract (the step log + the two screens).
  showTitle, hasLocalSave,
  // ---- G13 character-selector seam: the screen, the live selection, the kit
  // derivation (so a test compares the DOM numbers against the SAME chain the
  // run applies), and the idle driver (step/reset for 60Hz-vs-120Hz parity
  // replays — the same accumulator frame() feeds).
  charSelect: {
    open: showCharacters,
    get selected() { return charSelected; },
    kit: pilotKit,
    idle: {
      step: advanceCharIdle,
      reset() { charIdle.t = 0; charIdle.frame = -1; },
      get frame() { return charIdle.frame; },
      get period() { return CHAR_IDLE_PERIOD; },
    },
  },
  // N2 title art reveal: the live seam rides state.titleReveal; these expose
  // the hold path's call count, its timings (for rate-independent asserts),
  // and the activation itself.
  title: {
    get runStarts() { return titleRunStarts; },
    timings: TITLE_TIMINGS,
    beginHold: beginTitleHold,
    // Re-arm the once-per-page-load guard and re-run the FULL reveal (the
    // rate-independence tests replay it under a different frame step).
    replay() { titleRevealPlayed = false; showTitle(); },
  },
  exit: {
    game: exitGame,
    farewell: showFarewell,
    get steps() { return exitSteps.slice(); },
  },
  // ---- G14 shop-icon seam: per row id, the painted canvas's backing size,
  // the live CSS scale (must be an exact integer multiple of 16) and the
  // non-transparent pixel count. Reads the canvases showShop() registered.
  shopIcons: {
    get report() {
      const rep = {};
      for (const [id, cv] of Object.entries(shopIconCanvases)) {
        const g = cv.getContext('2d');
        let painted = -1;
        try {
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          painted = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
        } catch { /* stub ctx has no getImageData */ }
        const r = cv.getBoundingClientRect();
        rep[id] = { w: cv.width, h: cv.height, cssPx: Math.round(r.width),
                    scale: Math.round(r.width) / cv.width, painted };
      }
      return rep;
    },
  },
  // ---- G11 challenge-mode seam: the pending (session-scoped) selection, the
  // cycle the title card drives, and the live run's stamp + rule ceilings, so
  // a headless test can prove the seams through the REAL startRun without a
  // DOM click. `select` is test-only: the title card is the player's one
  // control surface.
  challenge: {
    get pending() { return pendingChallenge; },
    cycle: cyclePendingChallenge,
    select: (id) => { pendingChallenge = id; },
    get live() { return state.challenge; },
    get weaponCap() { return state.weaponCap; },
    get potionCap() { return state.potionCap; },
  },
  // ---- G20a stage seam: the pending (session-scoped) selection, the cycle
  // the title card drives (through the REAL lock predicate on the LIVE
  // profile), the lock predicate itself, and the live run's stamp — same
  // shape as the challenge seam. `select` is test-only.
  stages: {
    get pending() { return pendingStage; },
    cycle: cyclePendingStage,
    unlocked: stageUnlocked,
    select: (id) => { pendingStage = stageOf(id).id; },
    get live() { return state.stage; },
    cardSub: stageCardSub,
    // The spawn seam itself, so a headless test can prove stage-0 parity and
    // the mod/gate behaviour through the REAL chooser, not a restated copy.
    pickSpawnType, spawnWave,
  },
  // WAVE-16 zoom seam: ladder + live get/set/cycle (settings row + '+/-' keys).
  zoom: { get: () => state.zoom, set: setZoom, cycle: cycleZoom, ladder: ZOOM_LADDER },
  // A2 radar seam: the live flag + the ONE toggle the R key and the RADAR
  // touch button both drive. The painted frame is renderer.radar's seam
  // (null while off — the "no leaked chrome" half of the toggle contract).
  radar: { get on() { return state.radarOn; }, toggle: toggleRadar },
  // One-time-banner ledger seam (schema v6). A probe that COUNTS FRAMES must be
  // banner-inert: the first-ever token / top-tier banner legitimately holds the
  // sim for 2.5s, which starves a frame-budgeted measurement. Its own behaviour
  // is asserted in its own block, with the hold live. Never read by the browser.
  banners: {
    seen: (id) => bannerSeen(profile, id),
    markSeen: (id) => markBannerSeen(profile, id),
    // Turn every one-time banner off for this process (see `oneTimeBanners`).
    suppressAll: () => { oneTimeBanners = false; },
    enabled: () => oneTimeBanners,
  },
  setPilotMode: swapPilotMode, pilotInput,
  // ---- E1 RUN PURSE seam: the live wallet plus the REAL credit / spend /
  // settle functions the game loop itself calls (never copies) — a headless
  // test drives the SAME code path a kill, a shrine walk and a run end drive.
  purse: {
    get: () => profile.runPurse | 0,
    credit: purseCredit,
    spend: purseSpend,
    settle: settleRunGold,
    tierOf: purseTier,
    valueOf: purseValue,
    table: GOLD_TIER,
  },
  // WAVE-18 draft seam: pick a card object directly (L3 overflow probe).
  pickCard: pick,
  // W7b ladder seams: the ONE death function (Second Wind revive probes drive
  // it directly, the same call every damage path makes) and the ladder-on
  // flag this process booted with (the A/B BEFORE/AFTER arms).
  die, ladderOn: DRAFT_LADDER_ON,
  // WAVE-15 joystick seam: applyJoyVector(dx, dy, rad) / joyRecenter().
  get joyVec() { return joyVec; },
  get joyRelease() { return joyRelease; },
  // ---- WAVE-26 seams (earned slow-mo / death payoff / draft hints) ----
  // Pure helpers + the live dilation state, so the new behaviour is testable
  // headlessly without driving the rAF loop.
  dilation: {
    get scale() { return dilation.scale; },
    get remaining() { return dilation.remaining; },
    trigger: triggerDilation,
    advance: advanceDilation,
    get timeScale() { return state.timeScale; },
  },
  triggerEarnedMoment,
  deathCauseLabel,
  nextUnlockWithinReach,
  endScreenBody,
  synergyHintForCard,
  openDraft,
  // R2 draft inspect seams: which offer the box holds + where the arrows
  // cursor sits (headless tests read these instead of poking module scope).
  draftInspectId: () => (draftInspect && draftInspect.u ? draftInspect.u.id : null),
  draftFocus: () => draftFocus,
  synWeaponDmg,
  stanceOf: () => controller.stance,
  // ---- WAVE-28 AUTO-DRINK seam: the pure decision step, so a headless probe
  // can drive the pilot's potion hand with a controlled dt rather than depending
  // on rAF timing. The live loop calls this SAME function from both resource
  // seams (update / updateFinale).
  autoDrink: autoDrinkPotions,
  // ---- N1b item 8 AUTO-CAST seam: the pure decision step, so a headless
  // probe can drive the pilot's cast hand with a controlled dt (the live loop
  // calls this SAME function from both resource seams).
  autoCast: autoCastSkills,
  // ---- CINEMATIC GESTURE GUARD seam (src/main.js uiGuard) ----
  // The test drives the guard directly: arm it, prove a click on the overlay is
  // swallowed by the capture listener, prove a new press stands it down.
  uiGuard,
  // ---- WAVE-27 seams (camera deadzone / loot reachability) ----
  // `region` is the SAME world->screen projection the tour coachmark uses
  // (worldRegion): tests can render an entity through the real renderer and
  // prove the projection lands on the drawn position after the camera moved.
  camera: {
    follow: updateCamera,
    region: worldRegion,
    get cam() { return state.cam; },
    get lead() { return state.camLead; },
  },
  loot: { limit: lootLimit, clamp: clampLootToArena },
  // ---- RUN-STRUCTURE wave seam: the run limit, the clock, the win, and the
  // cadence schedule. `check` drives the limit check without a frame loop;
  // `survivedBonus` is the payout shape; `beats`/`groups`/`curves` expose the
  // ladder's live values so a test can assert monotonicity against config.
  run: {
    limit: C.RUN.LIMIT,
    clock: runClock,
    survivedBonus,
    runSurvived,
    check: checkRunLimit,
    beats: ladderBeats,
    groups: ladderGroups,
    eliteChance: ladderEliteChance,
    get won() { return state.runWon; },
    get mawCleared() { return state.mawCleared; },
    get mawDeadline() { return state.mawDeadline; },
    // G9 FOLLOW-UP: the wave-completion seam, so the untouched-wave ledger can
    // be driven without a DOM click through the intermission card.
    nextWave: continueRun,
  },
  // ---- W1 save-foundation seam (schema / migration / export / import) ----
  // `status` is the boot load result ('fresh' | 'current' | 'migrated' |
  // 'repaired' | 'corrupt' | 'future-version'); `notice` is what the player
  // is shown when the save was damaged or written by a newer build.
  save: {
    get status() { return bootResult.status; },
    get notice() { return saveNotice; },
    get version() { return profile.version; },
    schemaVersion: SCHEMA_VERSION,
    autosave,
    exportText: (opts) => exportProfileText(profile, opts),
    importText: (text) => importSaveText(text),
    download: (env, opts) => downloadProfile(profile, env || globalThis, opts),
    saveToDisk: (env, opts) => saveProfileToDisk(profile, env || globalThis, opts),
    readFile: (file) => readSaveFile(file),
    recovery: () => readRecovery(),
    downloadRecovery: (env, opts) => downloadRecovery(undefined, env || globalThis, opts),
  },
};
